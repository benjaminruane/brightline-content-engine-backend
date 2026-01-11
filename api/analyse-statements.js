// api/analyse-statements.js
//
// Statement analysis endpoint (Review).

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "../lib/web.js";
import { corpusSearch } from "../lib/corpusSearch.js";

// A3.5.21 Diagnostic: Track run state to detect post-FINAL_COUNTS execution
const runStateByRid = {};

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// A3.5.20 Fix 1: Central DIAG logger that prefixes every log with runId + reqSig
function diag(runId, reqSig, ...args) {
  const message = args.map(arg => 
    typeof arg === "object" ? JSON.stringify(arg) : String(arg)
  ).join(" ");
  console.log(`[DIAG][RID=${runId}][SIG=${reqSig}] ${message}`);
}

// A3.5.20 Fix 1: Generate deterministic request signature from key inputs
function generateReqSig(draftText, sources, webSearchEnabled) {
  const sourcesIds = Array.isArray(sources) 
    ? sources.map(s => s?.id || s?.name || "").join(",")
    : "";
  const inputStr = `${draftText.substring(0, 100)}|${sourcesIds}|${webSearchEnabled}`;
  
  // Simple hash function (deterministic)
  let hash = 0;
  for (let i = 0; i < inputStr.length; i++) {
    const char = inputStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(16).substring(0, 8);
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Extract first valid JSON from raw text (handles markdown/prose wrappers)
function extractFirstJson(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  
  // Try direct parse first
  const direct = safeJsonParse(raw);
  if (direct) return direct;
  
  // Find first { or [
  const firstBrace = raw.indexOf("{");
  const firstBracket = raw.indexOf("[");
  
  let start = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
  }
  
  if (start === -1) return null;
  
  // Try to find matching closing brace/bracket
  const openChar = raw[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let end = start;
  
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === openChar) depth++;
    else if (raw[i] === closeChar) {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  
  if (depth !== 0) return null; // Unmatched brackets
  
  const candidate = raw.substring(start, end);
  return safeJsonParse(candidate);
}

// Validate and resolve citations against unified references
// Returns statements with only resolvable citations
function resolveCitations(statements, unifiedReferences) {
  if (!Array.isArray(statements) || !Array.isArray(unifiedReferences)) return statements;
  
  
  // Build references map keyed by String(id) to handle both number and string IDs
  const referencesById = new Map();
  unifiedReferences.forEach((ref) => {
    const id = ref?.id;
    if (id != null) {
      referencesById.set(String(id), ref);
    }
  });
  
  return statements.map((stmt, stmtIdx) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const assessment = stmt.assessment || {};
    const citations = Array.isArray(assessment.citations) ? assessment.citations : [];
    
    // Normalize citation IDs to strings and resolve
    const resolvedCitations = citations
      .map((c) => (c != null ? String(c) : null))
      .filter((k) => k !== null && referencesById.has(k))
      .map((k) => {
        // Return original numeric ID if it was a number, otherwise return the string
        const original = citations.find((c) => String(c) === k);
        return typeof original === "number" ? original : Number.parseInt(k, 10);
      })
      .filter((id) => !Number.isNaN(id))
      .sort((a, b) => a - b);
    
    // DIAGNOSTIC: Log resolution results
    if (citations.length > 0) {
      const dropped = citations.length - resolvedCitations.length;
      if (dropped > 0) {
        const failed = citations.filter(c => !referencesById.has(String(c)));
        console.log(`[DIAG] Statement[${stmtIdx}] citation resolution:`, {
          original: citations,
          resolved: resolvedCitations,
          dropped,
          failedCitations: failed,
          failedTypes: failed.map(c => typeof c),
          availableKeys: Array.from(referencesById.keys()),
        });
      } else if (stmtIdx < 3) {
        console.log(`[DIAG] Statement[${stmtIdx}] all citations resolved:`, {
          original: citations,
          resolved: resolvedCitations,
        });
      }
    }
    
    // Log if citations were dropped
    if (citations.length > 0 && resolvedCitations.length < citations.length) {
      const dropped = citations.length - resolvedCitations.length;
      console.log(`[Review] Dropped ${dropped} unresolvable citation(s) for statement: "${stmt.text?.substring(0, 50)}..."`);
    }
    
    return {
      ...stmt,
      assessment: {
        ...assessment,
        citations: resolvedCitations,
      },
    };
  });
}

// Detect if a statement is document-descriptive (about what the memo does/proposes/evaluates)
// These describe the uploaded memo's content, not world facts
function isDocumentDescriptive(text, reasons = []) {
  if (typeof text !== "string" || !text.trim()) return false;
  
  const lower = text.toLowerCase();
  const reasonsText = Array.isArray(reasons) ? reasons.join(" ").toLowerCase() : "";
  
  // Patterns for document-descriptive statements (tightened for "is evaluating", "seek approval", etc.)
  const docDescriptivePatterns = [
    // Investment/evaluation language (expanded)
    /\b(?:evaluating|evaluates|evaluation of|is evaluating|are evaluating)\b/i,
    /\b(?:considering|considers|consideration of|is considering|are considering)\b/i,
    /\b(?:proposing|proposes|proposal to|proposed|is proposing)\b/i,
    /\b(?:recommending|recommends|recommendation to|recommended|is recommending)\b/i,
    /\b(?:seeking|seeks|seek)\s+(?:approval|funding|financing|investment)\b/i,
    // Document action language
    /\b(?:this memo|the memo|this document|the document|this report|the report)\s+(?:evaluates|proposes|recommends|considers|discusses|outlines|describes|presents|examines|analyzes)/i,
    // Investment-specific patterns (expanded)
    /\b(?:investment|funding|financing|acquisition|partnership)\s+(?:opportunity|proposal|evaluation|consideration|in|into)\b/i,
    /\b(?:proposed|new|potential)\s+(?:investment|funding|financing|acquisition|partnership)\b/i,
    // Decision/action language about the memo's purpose
    /\b(?:decision to|decision on|action to|action on|plan to|plan for)\b/i,
    // Request/approval language
    /\b(?:request|requests|requesting|approval|approve|approving)\s+(?:for|to|of)\b/i,
  ];
  
  // Check if statement matches document-descriptive patterns
  const matchesPattern = docDescriptivePatterns.some((pattern) => pattern.test(lower));
  
  // Also check reasons for document-descriptive indicators
  const hasDocReason = reasonsText.includes("memo") || 
                       reasonsText.includes("document") ||
                       reasonsText.includes("evaluation") ||
                       reasonsText.includes("proposal") ||
                       reasonsText.includes("seeking") ||
                       reasonsText.includes("approval");
  
  // Must match pattern or have doc reason, AND not be an anchor fact
  const hasFactualAnchor = isAnchorFact(text);
  
  return (matchesPattern || hasDocReason) && !hasFactualAnchor;
}

// Centralized provenance classification: single source of truth for category and provenance
// Returns: { category, provenance, hasUploadedMemo, resolvedCitations, memoReference }
function classifyStatementAndProvenance(stmt, unifiedReferences) {
  if (!stmt || typeof stmt !== "object") {
    return {
      category: "WORLD_FACT",
      provenance: "NONE",
      hasUploadedMemo: false,
      resolvedCitations: [],
      memoReference: null,
    };
  }
  
  const text = typeof stmt.text === "string" ? stmt.text : "";
  const assessment = stmt.assessment || {};
  const resolvedCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
  const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
  
  // Find uploaded memo reference (if any)
  const uploadedReferences = Array.isArray(unifiedReferences)
    ? unifiedReferences.filter((ref) => ref?.type === "uploaded")
    : [];
  const hasUploadedMemo = uploadedReferences.length > 0;
  const memoReference = uploadedReferences.length > 0 ? uploadedReferences[0] : null;
  
  // Classify category
  const isDocDescriptive = isDocumentDescriptive(text, reasons);
  const category = isDocDescriptive ? "DOCUMENT_DESCRIPTIVE" : "WORLD_FACT";
  
  // Determine provenance
  let provenance;
  if (category === "DOCUMENT_DESCRIPTIVE") {
    // Document-descriptive: valid if memo exists (MEMO_OK) or has citations (CITED_OK)
    if (hasUploadedMemo) {
      provenance = "MEMO_OK";
    } else if (resolvedCitations.length > 0) {
      provenance = "CITED_OK";
    } else {
      provenance = "NONE";
    }
  } else {
    // World-fact: valid ONLY if has resolved citations
    if (resolvedCitations.length > 0) {
      provenance = "CITED_OK";
    } else {
      provenance = "NONE";
    }
  }
  
  return {
    category,
    provenance,
    hasUploadedMemo,
    resolvedCitations,
    memoReference,
  };
}

// Detect if a statement is a meta-statement (about the document itself, not the world)
// Very conservative: only allow statements that are clearly about document structure/content
function isMetaStatement(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  
  const lower = text.toLowerCase();
  
  // Very narrow patterns for meta-statements
  const metaPatterns = [
    /^this (?:memo|document|report|paper|text|draft) (?:discusses|outlines|describes|presents|covers|addresses|examines|analyzes|explores)/i,
    /^the (?:memo|document|report|paper|text|draft) (?:discusses|outlines|describes|presents|covers|addresses|examines|analyzes|explores)/i,
    /^this (?:section|paragraph|part) (?:discusses|outlines|describes|presents|covers|addresses)/i,
  ];
  
  // Must match a meta pattern AND not contain factual anchors
  const matchesMeta = metaPatterns.some((pattern) => pattern.test(lower));
  const hasFactualAnchor = isAnchorFact(text);
  
  return matchesMeta && !hasFactualAnchor;
}

// Apply dual-axis verification gate: force Low if no resolvable citations
// This enforces: no provenance = no verification = no confidence
// Uses centralized provenance classification
function applyDualAxisVerification(statements, unifiedReferences) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    
    // Use centralized classification
    const classification = classifyStatementAndProvenance(stmt, unifiedReferences);
    const { provenance, resolvedCitations, memoReference, category } = classification;
    
    
    // Allow if provenance is valid (CITED_OK or MEMO_OK)
    if (provenance === "CITED_OK" || provenance === "MEMO_OK") {
      // For MEMO_OK document-descriptive statements without citations, inject memo citation
      if (provenance === "MEMO_OK" && resolvedCitations.length === 0 && memoReference) {
        const injectedId = memoReference.id;
        // Verify injected ID exists in unifiedReferences
        const idExists = unifiedReferences.some(r => r.id === injectedId);
        if (!idExists) {
          console.log(`[DIAG] WARNING: MEMO_OK injection failed - ID ${injectedId} not found in unifiedReferences`);
        }
        
        return {
          ...stmt,
          assessment: {
            ...assessment,
            citations: [injectedId], // Inject memo citation for evidence rendering
          },
        };
      }
      return stmt; // Valid provenance, no changes needed
    }
    
    // Provenance is NONE: force Low
    const existingScore = typeof assessment.reliabilityScore === "number" 
      ? assessment.reliabilityScore 
      : 30;
    const forcedScore = Math.min(existingScore, 35);
    
    let updatedReasons = [...reasons];
    const verificationReason = "No verifiable sources cited.";
    const explanationReason = "This statement could not be verified against provided sources.";
    
    // Prepend verification reason if not already present
    if (!updatedReasons.some((r) => r && r.includes("No verifiable sources"))) {
      updatedReasons = [verificationReason, explanationReason, ...updatedReasons].slice(0, 4);
    }
    
    // Log when forcing Low due to missing provenance
    if (existingScore > 35) {
      console.log(`[Review] Forced Low (${forcedScore}) due to missing provenance: "${text.substring(0, 50)}..."`);
    }
    
    // CRITICAL: Force Low and ensure it cannot be overridden
    return {
      ...stmt,
      assessment: {
        ...assessment,
        reliabilityLabel: "Low",
        reliabilityScore: forcedScore,
        reasons: updatedReasons.length > 0 ? updatedReasons : [verificationReason],
        citations: [], // Ensure empty
      },
    };
  });
}

// Coerce and validate statements array to match schema
function coerceStatements(parsed, maxRefIndex) {
  if (!parsed || typeof parsed !== "object") {
    console.log(`[DIAG] coerceStatements: parsed is not object, type=${typeof parsed}`);
    return [];
  }
  
  let statements = Array.isArray(parsed.statements) ? parsed.statements : [];
  if (statements.length === 0) return [];
  
  const maxRef = typeof maxRefIndex === "number" && maxRefIndex > 0 ? maxRefIndex : 0;
  const normalized = new Map(); // For deduplication
  
  const coerced = [];
  let skippedCount = 0;
  
  for (const stmt of statements) {
    if (!stmt || typeof stmt !== "object") continue;
    
    // Extract and validate text
    const text = typeof stmt.text === "string" ? stmt.text.trim() : "";
    if (!text || text.length === 0) continue;
    
    // Normalize for deduplication (lowercase, strip punctuation, collapse whitespace)
    const normalizedKey = text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    if (normalized.has(normalizedKey)) {
      skippedCount++;
      continue; // Skip duplicate
    }
    normalized.set(normalizedKey, true);
    
    // Coerce assessment
    const assessment = stmt.assessment || {};
    let reliabilityScore = typeof assessment.reliabilityScore === "number" 
      ? Math.max(0, Math.min(100, assessment.reliabilityScore))
      : 30; // Default to 30 if missing
    
    // Derive label from score if missing
    let reliabilityLabel = typeof assessment.reliabilityLabel === "string"
      ? assessment.reliabilityLabel
      : reliabilityScore >= 80 ? "High" : reliabilityScore >= 60 ? "Medium" : "Low";
    
    // Ensure label is valid
    if (!["High", "Medium", "Low"].includes(reliabilityLabel)) {
      reliabilityLabel = reliabilityScore >= 80 ? "High" : reliabilityScore >= 60 ? "Medium" : "Low";
    }
    
    // Coerce reasons (array of up to 4 non-empty strings)
    let reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    reasons = reasons
      .filter((r) => typeof r === "string" && r.trim().length > 0)
      .slice(0, 4)
      .map((r) => r.trim());
    
    // Coerce citations (accept numbers or strings that can be converted to numbers)
    // Validation against actual references happens in resolveCitations
    let citations = Array.isArray(assessment.citations) ? assessment.citations : [];
    citations = citations
      .map((c) => {
        if (typeof c === "number" && Number.isFinite(c)) return c;
        if (typeof c === "string") {
          const num = Number.parseFloat(c);
          return Number.isFinite(num) ? num : null;
        }
        return null;
      })
      .filter((c) => c !== null && c >= 1 && c <= maxRef)
      .sort((a, b) => a - b);
    
    coerced.push({
      text,
      assessment: {
        reliabilityScore,
        reliabilityLabel,
        reasons: reasons.length > 0 ? reasons : ["No specific assessment provided."],
        citations,
      },
    });
    
    // Cap at 25 statements
    if (coerced.length >= 25) {
      break;
    }
  }
  
  return coerced;
}

// Filter statements to only include those present in draft text (hard gate)
// Normalizes whitespace and case for comparison, requires high overlap
// Normalize text for overlap comparison: lowercase, strip punctuation, collapse whitespace
// Invariant 1: Punctuation should not cause drops
function normalizeTextForOverlap(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    // Strip punctuation from token boundaries (keep internal punctuation like apostrophes)
    .replace(/[^\w\s']/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// Common stopwords to ignore in overlap computation
// Invariant 2: Stopwords should not dominate overlap
const STOPWORDS = new Set([
  "the", "and", "that", "of", "to", "in", "a", "an", "is", "it", "as", "be", "was", "for",
  "on", "are", "with", "this", "but", "from", "they", "have", "has", "had", "at", "by", "not",
  "or", "which", "one", "we", "all", "can", "her", "would", "there", "their", "what", "so",
  "up", "out", "if", "about", "who", "get", "which", "when", "make", "can", "like", "time",
  "just", "him", "know", "take", "into", "year", "your", "good", "some", "could", "them",
  "see", "other", "than", "then", "now", "look", "only", "come", "its", "over", "think",
  "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
  "even", "new", "want", "because", "any", "these", "give", "day", "most", "us", "very",
]);

// Tokenize text into words, filtering stopwords and very short words
function tokenizeForOverlap(text) {
  const normalized = normalizeTextForOverlap(text);
  return normalized
    .split(/\s+/)
    .filter((word) => {
      // Filter stopwords and very short words
      return word.length > 2 && !STOPWORDS.has(word);
    });
}

function filterDraftOnlyStatements(statements, draftText, runId = null, reqSig = null, hasReturned = false) {
  // A3.5.21 Diagnostic: Probe for post-FINAL_COUNTS execution
  const missingContext = !runId || !reqSig;
  const postFinal = runId && runStateByRid[runId]?.finalCountsReached === true;
  if (missingContext || postFinal) {
    const stack = new Error().stack || "stack unavailable";
    const statementsLength = Array.isArray(statements) ? statements.length : 0;
    const draftTextLength = typeof draftText === "string" ? draftText.length : 0;
    console.log(`[POST_FINAL_PROBE] func=filterDraftOnlyStatements rid=${runId ?? "null"} sig=${reqSig ?? "null"} missingContext=${missingContext} postFinal=${postFinal} statementsLength=${statementsLength} draftTextLength=${draftTextLength}`);
    console.log(`[POST_FINAL_PROBE] stack:\n${stack}`);
  }
  
  // A3.5.21 Step 3: Safety assertion to catch regressions
  if (hasReturned) {
    const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
    log(`[DIAG][ERROR] filterDraftOnlyStatements called after return`);
    return statements; // Return as-is to avoid breaking the response
  }
  
  if (!Array.isArray(statements) || statements.length === 0) return statements;
  if (typeof draftText !== "string" || !draftText.trim()) return statements;
  
  // A3.5.20 Fix 3: Log with RID+SIG if provided
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  // Normalize draft text: lowercase, strip punctuation, collapse whitespace
  const normalizedDraft = normalizeTextForOverlap(draftText);
  const draftTokens = new Set(tokenizeForOverlap(draftText));
  
  const filtered = [];
  const dropped = [];
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt || typeof stmt !== "object") {
      dropped.push({ index: i, reason: "invalid object", text: String(stmt) });
      continue;
    }
    
    const text = typeof stmt.text === "string" ? stmt.text.trim() : "";
    if (!text) {
      dropped.push({ index: i, reason: "empty text", text: "" });
      continue;
    }
    
    // Normalize statement text: lowercase, strip punctuation, collapse whitespace
    const normalizedStmt = normalizeTextForOverlap(text);
    
    // Tokenize statement (excluding stopwords and very short words)
    const stmtTokens = tokenizeForOverlap(text);
    
    if (stmtTokens.length === 0) {
      // Very short statement - require exact or near-exact match
      if (normalizedDraft.includes(normalizedStmt)) {
        filtered.push(stmt);
      } else {
        dropped.push({ 
          index: i, 
          reason: "very short, not substring", 
          text: text.substring(0, 100),
          normalizedStmt,
          draftContains: normalizedDraft.includes(normalizedStmt),
        });
        log(`[Review] Dropped non-draft statement: "${text.substring(0, 50)}..."`);
      }
      continue;
    }
    
    // Count how many statement tokens appear in draft tokens
    const matchingTokens = stmtTokens.filter((token) => draftTokens.has(token));
    const overlapRatio = matchingTokens.length / stmtTokens.length;
    
    // Also check if normalized statement is a substring of draft (for verbatim matches)
    const isSubstring = normalizedDraft.includes(normalizedStmt);
    
    // Invariant 3: Adaptive threshold based on statement length
    // Long statements: allow slightly lower overlap (70%)
    // Short statements: keep stricter (75%)
    const statementLength = stmtTokens.length;
    const adaptiveThreshold = statementLength >= 10 ? 0.70 : 0.75;
    
    // Accept if: exact substring match OR meets adaptive word overlap threshold
    if (isSubstring || overlapRatio >= adaptiveThreshold) {
      filtered.push(stmt);
    } else {
      dropped.push({
        index: i,
        reason: `low overlap (${(overlapRatio * 100).toFixed(1)}%, need ${(adaptiveThreshold * 100).toFixed(0)}%)`,
        text: text.substring(0, 100),
        isSubstring,
        overlapRatio,
        threshold: adaptiveThreshold,
        stmtTokensCount: stmtTokens.length,
        matchingTokensCount: matchingTokens.length,
        missingTokens: stmtTokens.filter(t => !draftTokens.has(t)).slice(0, 5),
      });
      log(`[Review] Dropped non-draft statement: "${text.substring(0, 50)}..."`);
    }
  }
  
  log(`filterDraftOnlyStatements: output count=${filtered.length}, dropped=${dropped.length}`);
  if (dropped.length > 0) {
    log(`Dropped statements (first 5):`, dropped.slice(0, 5).map(d => ({
      reason: d.reason,
      text: d.text,
      overlapRatio: d.overlapRatio,
      threshold: d.threshold,
      missingTokens: d.missingTokens,
    })));
  }
  
  return filtered;
}

// A3.5.13: Deterministic statement extraction (Part B)
// Extracts candidate statements from draft text deterministically
// Returns array of candidate statement texts (no assessment yet - LLM will score them)
// A3.5.16: Pre-merge continuation fragments to fix rawSentences fragmentation
// Merges segments that look like continuations before sentence splitting
function mergeContinuationFragments(draftText) {
  if (typeof draftText !== "string" || !draftText.trim()) {
    return draftText;
  }
  
  // Split into lines and merge continuation lines
  const lines = draftText.split(/\n/);
  const mergedLines = [];
  const mergeSamples = [];
  let mergeCount = 0;
  const inputSegmentCount = lines.filter(l => l && l.trim().length > 0).length;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) {
      // Preserve empty lines as separators (but don't add multiple consecutive empty lines)
      if (mergedLines.length > 0 && mergedLines[mergedLines.length - 1] !== "") {
        mergedLines.push("");
      }
      continue;
    }
    
    const trimmed = line.trim();
    
    // Check if this line looks like a continuation
    const isContinuation = 
      // Starts with closing punctuation
      /^[)\]},;:]/.test(trimmed) ||
      // Starts with a digit (e.g., "7 million enterprise value), ...")
      /^\d/.test(trimmed) ||
      // Starts with currency fragment or open-paren fragment
      /^\(\$/.test(trimmed) ||
      /^\(/.test(trimmed) ||
      // Starts with connector words
      /^(and|or|via|with|targeting|acquiring|approximately|to|at|of)\s+/i.test(trimmed) ||
      // Starts with "%" or "fully"
      /^(%|fully)/i.test(trimmed);
    
    // Check if previous line ends with open parenthesis/currency fragment
    const prevLine = mergedLines.length > 0 ? mergedLines[mergedLines.length - 1] : "";
    const endsWithOpenFragment = prevLine && prevLine.trim() && (
      /\(\$$/.test(prevLine) ||
      /\($/.test(prevLine) ||
      /\([\d,]+(?:\.\d+)?\s*$/.test(prevLine)
    );
    
    if (isContinuation || endsWithOpenFragment) {
      // Merge with previous line
      if (mergedLines.length > 0 && mergedLines[mergedLines.length - 1].trim()) {
        const beforeText = mergedLines[mergedLines.length - 1];
        const beforePreview = beforeText.length > 40 ? "..." + beforeText.substring(beforeText.length - 40) : beforeText;
        mergedLines[mergedLines.length - 1] = beforeText + " " + trimmed;
        const afterText = mergedLines[mergedLines.length - 1];
        const afterPreview = afterText.length > 60 ? "..." + afterText.substring(afterText.length - 60) : afterText;
        mergeCount++;
        
        if (mergeSamples.length < 3) {
          mergeSamples.push({ before: beforePreview, after: afterPreview });
        }
      } else {
        // No previous line, just add it
        mergedLines.push(trimmed);
      }
    } else {
      // Not a continuation, add as new line
      mergedLines.push(trimmed);
    }
  }
  
  // Join lines back with newlines
  const normalizedText = mergedLines.join("\n");
  
  // Log merge statistics
  if (mergeCount > 0) {
    const outputSentenceCount = normalizedText.split(/[.!?\n]+/).filter(s => s && s.trim().length > 0).length;
    log(`[SENT_MERGE] inputSegments=${inputSegmentCount} outputSentences=${outputSentenceCount} merges=${mergeCount}`);
    if (mergeSamples.length > 0) {
      log(`[SENT_MERGE] sampleMerges=${JSON.stringify(mergeSamples)}`);
    }
  }
  
  return normalizedText;
}

function extractDeterministicStatementCandidates(draftText, runId = null, reqSig = null, hasReturned = false) {
  // A3.5.21 Diagnostic: Probe for post-FINAL_COUNTS execution
  const missingContext = !runId || !reqSig;
  const postFinal = runId && runStateByRid[runId]?.finalCountsReached === true;
  if (missingContext || postFinal) {
    const stack = new Error().stack || "stack unavailable";
    const draftTextLength = typeof draftText === "string" ? draftText.length : 0;
    console.log(`[POST_FINAL_PROBE] func=extractDeterministicStatementCandidates rid=${runId ?? "null"} sig=${reqSig ?? "null"} missingContext=${missingContext} postFinal=${postFinal} draftTextLength=${draftTextLength}`);
    console.log(`[POST_FINAL_PROBE] stack:\n${stack}`);
  }
  
  // A3.5.21 Step 3: Safety assertion to catch regressions
  if (hasReturned) {
    const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
    log(`[DIAG][ERROR] Extraction called after return`);
    return [];
  }
  
  // A3.5.20 Fix 3: Log with RID+SIG if provided
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  if (typeof draftText !== "string" || !draftText.trim()) {
    log(`extractDeterministicStatementCandidates: empty draftText`);
    return [];
  }
  
  const candidates = [];
  const seen = new Set();
  
  // Step 1: Split by sentence boundaries (period, exclamation, question mark, newline)
  const sentenceBoundaryPattern = /[.!?\n]+/;
  const rawSentences = draftText
    .split(sentenceBoundaryPattern)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  
  log(`extractDeterministicStatementCandidates: rawSentences count=${rawSentences.length}`);
  
  // Step 2: For each sentence, check if it needs splitting
  let skippedShort = 0;
  for (const sentence of rawSentences) {
    if (sentence.length < 10) {
      skippedShort++;
      continue; // Skip very short fragments
    }
    
    // Check for multiple anchor patterns that suggest compound statements
    const anchorPatterns = [
      /\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?/gi, // Money amounts
      /\b\d+(?:\.\d+)?\s*%/g, // Percentages
      /\b(?:valuation|funding|revenue|ownership|equity|pre-money|post-money)\b/gi, // Anchor keywords
    ];
    
    // Count distinct anchor occurrences
    const anchorMatches = [];
    for (const pattern of anchorPatterns) {
      const matches = [...sentence.matchAll(pattern)];
      anchorMatches.push(...matches);
    }
    
    // If sentence has multiple distinct anchors, consider splitting
    if (anchorMatches.length >= 2) {
      // Try to split on common separators when they contain distinct anchor phrases
      const splitPatterns = [
        /;\s*/, // Semicolons
        /,\s+(?:and|but|with|which)\s+/i, // Commas with conjunctions
        /\s+and\s+/i, // Standalone "and" when followed by anchor pattern
      ];
      
      let wasSplit = false;
      for (const splitPattern of splitPatterns) {
        if (splitPattern.test(sentence)) {
          const parts = sentence.split(splitPattern);
      for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.length < 10) continue;
            
            // Check if this part has an anchor
            const hasAnchor = anchorPatterns.some(p => p.test(trimmed));
            if (hasAnchor) {
              const normalized = trimmed.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
              if (!seen.has(normalized)) {
        seen.add(normalized);
                candidates.push(trimmed);
                wasSplit = true;
              }
            }
          }
          if (wasSplit) break;
        }
      }
      
      // If we didn't split but have multiple anchors, keep as single candidate
      if (!wasSplit) {
        const normalized = sentence.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          candidates.push(sentence);
        }
      }
    } else {
      // Single anchor or no anchor - keep as single candidate
      const normalized = sentence.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        candidates.push(sentence);
      }
    }
  }
  
  // Step 3: Apply stable cap (deterministic - first N in draft order)
  const MAX_CANDIDATES = 25;
  const cappedCandidates = candidates.slice(0, MAX_CANDIDATES);
  
  if (candidates.length > MAX_CANDIDATES) {
    log(`extractDeterministicStatementCandidates: cap triggered, ${candidates.length} -> ${MAX_CANDIDATES}`);
  }
  
  // Diagnostics (required by spec)
  log(`extractDeterministicStatementCandidates: final count=${cappedCandidates.length} (from ${rawSentences.length} sentences, skippedShort=${skippedShort})`);
  if (cappedCandidates.length === 0) {
    log(`WARNING: No candidates extracted from draft text`);
  }
  
  return cappedCandidates;
}

// A3.5.14b Patch 1: Segmentation Guardrails + Fallback
// Rejects candidates that are truncated fragments, mid-sentence starts, or too-short anchors
// Implements strict validation with fallback to full sentences
function filterCandidateQuality(candidates, rawSentences, draftText, runId = null, reqSig = null) {
  // A3.5.20 Fix 3: Log with RID+SIG if provided
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { candidates: [], rejectedCount: 0, fallbackCount: 0 };
  }
  
  const accepted = [];
  const rejected = [];
  const rejectedIndices = []; // Track indices of rejected candidates for fallback lookup
  const rejectionReasons = [];
  const rejectedWithReasons = []; // For detailed logging
  const fallbackMap = new Map(); // rejected -> fallback candidate
  
  // Build a map of raw sentences for context checking and fallback
  const rawSentenceMap = new Map();
  const rawSentenceList = [];
  if (Array.isArray(rawSentences)) {
    rawSentences.forEach((s, idx) => {
      if (typeof s === "string" && s.trim().length > 0) {
        const trimmed = s.trim();
        rawSentenceMap.set(idx, trimmed);
        rawSentenceList.push(trimmed);
      }
    });
  }
  
  // A3.5.15 Fix 1: Build unsplit sentence blocks for unbalanced_brackets fallback
  // Track which unsplit block contains each candidate
  const candidateToUnsplitBlock = new Map();
  if (typeof draftText === "string" && draftText.trim()) {
    // Split draftText into unsplit blocks (preserve original sentence boundaries)
    const sentenceBoundaryPattern = /[.!?\n]+/;
    const unsplitBlocks = draftText
      .split(sentenceBoundaryPattern)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    
    // Map each candidate to its containing unsplit block
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const trimmedCandidate = candidate.trim();
        // Find the unsplit block that contains this candidate
        for (const unsplitBlock of unsplitBlocks) {
          if (unsplitBlock.includes(trimmedCandidate)) {
            candidateToUnsplitBlock.set(candidate, unsplitBlock);
            break;
          }
        }
      }
    }
  }
  
  // Helper: Find nearest full sentence for fallback
  // Fix 1: Use position-based lookup to ensure fallback is always available
  function findFallbackSentence(rejectedText, candidateIndex) {
    if (!rejectedText || typeof rejectedText !== "string") return null;
    const trimmed = rejectedText.trim();
    
    // First try: find containing sentence (works for most cases)
    for (const rawSentence of rawSentenceList) {
      if (rawSentence.includes(trimmed) && /[.?!]\s*$/.test(rawSentence)) {
        return rawSentence;
      }
    }
    
    // Fix 1: Position-based fallback - use nearest raw sentence by index
    // This ensures we always have a fallback even for malformed candidates
    if (rawSentenceList.length > 0) {
      // Use candidate index to find nearest raw sentence
      const targetIndex = Math.min(candidateIndex, rawSentenceList.length - 1);
      const nearestSentence = rawSentenceList[targetIndex];
      
      // Ensure it's a valid full sentence
      if (nearestSentence && /[.?!]\s*$/.test(nearestSentence) && nearestSentence.length >= 45) {
        return nearestSentence;
      }
      
      // If nearest doesn't work, try adjacent sentences
      for (let offset = 1; offset < rawSentenceList.length; offset++) {
        const idx1 = targetIndex + offset;
        const idx2 = targetIndex - offset;
        
        if (idx1 < rawSentenceList.length) {
          const candidate = rawSentenceList[idx1];
          if (candidate && /[.?!]\s*$/.test(candidate) && candidate.length >= 45) {
            return candidate;
          }
        }
        if (idx2 >= 0) {
          const candidate = rawSentenceList[idx2];
          if (candidate && /[.?!]\s*$/.test(candidate) && candidate.length >= 45) {
            return candidate;
          }
        }
      }
      
      // Last resort: any full sentence
      for (const rawSentence of rawSentenceList) {
        if (/[.?!]\s*$/.test(rawSentence) && rawSentence.length >= 45) {
          return rawSentence;
        }
      }
    }
    
    return null;
  }
  
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const candidate = candidates[candidateIndex];
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      rejected.push(candidate);
      rejectedIndices.push(candidateIndex); // Track index for fallback lookup
      rejectionReasons.push("empty");
      rejectedWithReasons.push({ reason: "empty", textPreview: "" });
      continue;
    }
    
    const trimmed = candidate.trim();
    let shouldReject = false;
    let reason = null;
    
    // 1) Starts with closing punctuation: ) ] } , ; :
    if (/^[)\]},;:]/.test(trimmed)) {
      shouldReject = true;
      reason = "starts_with_closing_punct";
    }
    
    // 2) Unbalanced parentheses/brackets
    if (!shouldReject) {
      const openParens = (trimmed.match(/\(/g) || []).length;
      const closeParens = (trimmed.match(/\)/g) || []).length;
      const openBrackets = (trimmed.match(/\[/g) || []).length;
      const closeBrackets = (trimmed.match(/\]/g) || []).length;
      const openBraces = (trimmed.match(/\{/g) || []).length;
      const closeBraces = (trimmed.match(/\}/g) || []).length;
      
      if (openParens !== closeParens || openBrackets !== closeBrackets || openBraces !== closeBraces) {
        shouldReject = true;
        reason = "unbalanced_brackets";
      }
    }
    
    // 3) Ends with "open fragment" signals
    if (!shouldReject) {
      const endsWithFragment = /[(\$,—]$/.test(trimmed) || 
        /\b(and|or|to|at|with|targeting|approximately|of)\s*$/i.test(trimmed);
      if (endsWithFragment) {
        shouldReject = true;
        reason = "ends_with_fragment";
      }
    }
    
    // 4) Ends mid-word (STRICT: only flag if strong evidence of truncation)
    if (!shouldReject) {
      const lastChar = trimmed[trimmed.length - 1];
      const endsWithLetter = /[a-zA-Z]/.test(lastChar);
      const hasTerminalPunct = /[.?!\"'')]\]\s*$/.test(trimmed);
      
      // Only flag if: ends with letter, no terminal punctuation, AND strong truncation evidence
      if (endsWithLetter && !hasTerminalPunct) {
        const lastWord = trimmed.split(/\s+/).pop() || "";
        
        // Legitimate endings to preserve: acronyms (SMBs, APIs), entity endings (Inc, Ltd, Corp)
        // Check for acronyms first (all caps, 2+ chars like APIs, SMBs, etc.)
        const isAcronym = /^[A-Z]{2,}$/.test(lastWord);
        // Check for common entity endings (case-insensitive)
        const legitimateEndings = /^(inc|ltd|corp|llc|plc|gmbh|sas|sa|nv|bv|ab|oy|as|ag|spa|srl|pty|co|llp|pc|pa|lp|p\.?c\.?|l\.?l\.?c\.?|l\.?t\.?d\.?|i\.?n\.?c\.?)$/i;
        const isLegitimateEnding = legitimateEndings.test(lastWord);
        
        // Strong truncation evidence: very short word (< 2 chars) that's not an acronym/ending
        // OR suspiciously short candidate relative to context
        const isVeryShortFragment = lastWord.length < 2 && !isAcronym && !isLegitimateEnding;
        const isSuspiciouslyShort = trimmed.length < 30 && lastWord.length < 3 && !isAcronym && !isLegitimateEnding;
        
        if (isVeryShortFragment || isSuspiciouslyShort) {
          shouldReject = true;
          reason = "ends_mid_word";
          log(`[SEG_GUARD] midWordTruncationDetected=true textPreview="${trimmed.substring(0, 60)}..." lastWord="${lastWord}"`);
        }
      }
    }
    
    // 5) Too short to stand alone: < 45 chars AND contains no number
    if (!shouldReject) {
      const hasNumber = /\d/.test(trimmed);
      if (trimmed.length < 45 && !hasNumber) {
        shouldReject = true;
        reason = "too_short_no_number";
      }
    }
    
    // 6) Ends with "(" or unfinished numeric fragment
    if (!shouldReject) {
      if (trimmed.endsWith("(")) {
        shouldReject = true;
        reason = "ends_with_open_paren";
      } else if (/\(\$[\d,]+(?:\.\d+)?\s*$/.test(trimmed)) {
        shouldReject = true;
        reason = "unfinished_numeric_fragment";
      }
    }
    
    // A3.5.17 Fix 1: Incomplete numeric/currency ending guardrail
    if (!shouldReject) {
      // Ends with "$" or "$<digits>" with no unit/context (e.g., "$18")
      if (/\$\d+(?:,\d+)*(?:\.\d+)?\s*$/.test(trimmed) && !/[.?!]\s*$/.test(trimmed)) {
        shouldReject = true;
        reason = "incomplete_numeric_fragment";
      }
      // Ends with "($<digits>" or ends with "("
      else if (/\(\$\d+(?:,\d+)*(?:\.\d+)?\s*$/.test(trimmed)) {
        shouldReject = true;
        reason = "incomplete_numeric_fragment";
      }
      // Ends with words that imply continuation: "implying", "approximately", "at", "to", "of" when followed by end-of-string
      else if (/\b(implying|approximately|at|to|of)\s+(?:an?\s+)?\$\d+(?:,\d+)*(?:\.\d+)?\s*$/i.test(trimmed)) {
        shouldReject = true;
        reason = "incomplete_numeric_fragment";
      }
      // Ends with punctuation/comma/emdash suggesting continuation (but not sentence-ending punctuation)
      else if (/[,—–]\s*$/.test(trimmed) && !/[.?!]\s*$/.test(trimmed)) {
        // Only reject if it ends with a currency/numeric pattern before the comma/emdash
        if (/\$\d+(?:,\d+)*(?:\.\d+)?\s*[,—–]\s*$/.test(trimmed)) {
          shouldReject = true;
          reason = "incomplete_numeric_fragment";
        }
      }
    }
    
    // 7) Mid-sentence starts: begins with fragment continuation words
    if (!shouldReject) {
      const fragmentStartPatterns = [
        /^\)/,
        /^\]/,
        /^\}/,
        /^,\s*/,
        /^;\s*/,
        /^:\s*/,
        /^and\s+/i,
        /^with\s+/i,
        /^targeting\s+/i,
        /^or\s+/i,
        /^to\s+/i,
      ];
      for (const pattern of fragmentStartPatterns) {
        if (pattern.test(trimmed)) {
          shouldReject = true;
          reason = "fragment_continuation";
          break;
        }
      }
    }
    
    if (shouldReject) {
      rejected.push(candidate);
      rejectedIndices.push(candidateIndex); // Track index for fallback lookup
      rejectionReasons.push(reason);
      rejectedWithReasons.push({ 
        reason, 
        textPreview: trimmed.substring(0, 50) + (trimmed.length > 50 ? "..." : "")
      });
      
      // A3.5.15 Fix 1: For unbalanced_brackets, use unsplit block as fallback
      let fallback = null;
      if (reason === "unbalanced_brackets" || reason === "unbalanced_parens") {
        // Use the unsplit sentence block that contains this candidate
        fallback = candidateToUnsplitBlock.get(candidate);
        if (fallback && /[.?!]\s*$/.test(fallback) && fallback.length >= 45) {
          fallbackMap.set(candidate, fallback);
        } else {
          // If unsplit block not found or invalid, find containing sentence from rawSentences
          for (const rawSentence of rawSentenceList) {
            if (rawSentence.includes(trimmed) && /[.?!]\s*$/.test(rawSentence) && rawSentence.length >= 45) {
              fallback = rawSentence;
              fallbackMap.set(candidate, fallback);
              break;
            }
          }
        }
      }
      
      // For other rejection reasons, use position-based lookup
      if (!fallback) {
        fallback = findFallbackSentence(trimmed, candidateIndex);
      if (fallback) {
        fallbackMap.set(candidate, fallback);
      } else {
        // Fallback should always be available - use first valid raw sentence as last resort
        const lastResortFallback = rawSentenceList.find(s => /[.?!]\s*$/.test(s) && s.length >= 45);
        if (lastResortFallback) {
          fallbackMap.set(candidate, lastResortFallback);
          }
        }
      }
    } else {
      accepted.push(candidate);
    }
  }
  
  // A3.5.17 Fix 2: Recombine adjacent fragments before applying fallbacks
  // Try to merge incomplete_numeric_fragment candidates with next adjacent candidate from same source
  const recombinedCandidates = [];
  const recombinedRejected = [];
  const recombineSamples = [];
  let recombineCount = 0;
  const incompleteNumericRejects = [];
  const recombinedOriginalIndices = new Set(); // Track which rejected indices were recombined
  
  // Find all rejected candidates with incomplete_numeric_fragment
  for (let i = 0; i < rejected.length; i++) {
    if (rejectionReasons[i] === "incomplete_numeric_fragment") {
      incompleteNumericRejects.push({
        candidate: rejected[i],
        index: rejectedIndices[i],
        originalIndex: i
      });
    }
  }
  
  // Try to recombine each incomplete_numeric_fragment with next candidate
  for (const rejectInfo of incompleteNumericRejects) {
    const rejectedCandidate = rejectInfo.candidate;
    const rejectedIndex = rejectInfo.index;
    const nextCandidateIndex = rejectedIndex + 1;
    
    // Check if there's a next candidate in the original list
    if (nextCandidateIndex < candidates.length) {
      const nextCandidate = candidates[nextCandidateIndex];
      
      // Check if both candidates come from the same unsplit block
      const rejectedUnsplit = candidateToUnsplitBlock.get(rejectedCandidate);
      const nextUnsplit = candidateToUnsplitBlock.get(nextCandidate);
      
      if (rejectedUnsplit && nextUnsplit && rejectedUnsplit === nextUnsplit) {
        // Try merging
        const merged = (typeof rejectedCandidate === "string" ? rejectedCandidate.trim() : "") + " " + 
                       (typeof nextCandidate === "string" ? nextCandidate.trim() : "");
        const mergedTrimmed = merged.trim();
        
        // Re-validate the merged candidate
        let isValid = true;
        if (mergedTrimmed.length < 10) {
          isValid = false;
        } else {
          // Quick validation: check for balanced brackets and complete ending
          const openParens = (mergedTrimmed.match(/\(/g) || []).length;
          const closeParens = (mergedTrimmed.match(/\)/g) || []).length;
          const hasCompleteEnding = /[.?!]\s*$/.test(mergedTrimmed);
          const stillIncomplete = /\$\d+(?:,\d+)*(?:\.\d+)?\s*$/.test(mergedTrimmed) && !hasCompleteEnding;
          
          if (openParens !== closeParens || stillIncomplete) {
            isValid = false;
          }
        }
        
        if (isValid) {
          // Merge is valid, use it instead of rejecting
          recombinedCandidates.push(mergedTrimmed);
          recombinedOriginalIndices.add(rejectInfo.originalIndex);
          recombineCount++;
          
          if (recombineSamples.length < 3) {
            const beforeA = (typeof rejectedCandidate === "string" ? rejectedCandidate : "").substring(0, 40) + "...";
            const beforeB = (typeof nextCandidate === "string" ? nextCandidate : "").substring(0, 40) + "...";
            const after = mergedTrimmed.substring(0, 60) + "...";
            recombineSamples.push({ beforeA, beforeB, after });
          }
          
          // Also need to remove nextCandidate from accepted if it was accepted
          // (it will be part of the merged candidate now)
          const nextCandidateInAccepted = accepted.indexOf(nextCandidate);
          if (nextCandidateInAccepted >= 0) {
            accepted.splice(nextCandidateInAccepted, 1);
          }
          
          // Remove from rejected list (we'll skip it in fallback loop)
          continue;
        }
      }
    }
    
    // Couldn't recombine, keep in rejected list
    recombinedRejected.push(rejectInfo);
  }
  
  // Add recombined candidates to accepted list (keep originally accepted ones)
  accepted.push(...recombinedCandidates);
  
  // Log recombine statistics
  if (recombineCount > 0) {
    log(`[SEG_RECOMBINE] merges=${recombineCount}`);
    if (recombineSamples.length > 0) {
      log(`[SEG_RECOMBINE] samples=${JSON.stringify(recombineSamples)}`);
    }
  }
  
  // Filter rejected list to exclude recombined ones
  const stillRejected = [];
  const stillRejectedIndices = [];
  const stillRejectionReasons = [];
  const stillRejectedWithReasons = [];
  
  for (let i = 0; i < rejected.length; i++) {
    if (!recombinedOriginalIndices.has(i)) {
      stillRejected.push(rejected[i]);
      stillRejectedIndices.push(rejectedIndices[i]);
      stillRejectionReasons.push(rejectionReasons[i]);
      stillRejectedWithReasons.push(rejectedWithReasons[i]);
    }
  }
  
  // Update rejected arrays
  rejected.length = 0;
  rejected.push(...stillRejected);
  rejectedIndices.length = 0;
  rejectedIndices.push(...stillRejectedIndices);
  rejectionReasons.length = 0;
  rejectionReasons.push(...stillRejectionReasons);
  rejectedWithReasons.length = 0;
  rejectedWithReasons.push(...stillRejectedWithReasons);
  
  // Apply fallback: replace rejected candidates with their fallback sentences
  // Fix 2: Ensure fallback happens for all rejected candidates
  const fallbackCandidates = [];
  const fallbackSamples = [];
  const appliedFallbackReasons = []; // Track reasons for DIAG logging
  
  for (let i = 0; i < rejected.length; i++) {
    const rejectedCandidate = rejected[i];
    const candidateIndex = rejectedIndices[i] >= 0 ? rejectedIndices[i] : i; // Use tracked index
    const rejectionReason = rejectionReasons[i] || "unknown";
    let fallback = fallbackMap.get(rejectedCandidate);
    
    // If no fallback found in map, try to find nearest full sentence from raw sentences
    if (!fallback && rawSentenceList.length > 0) {
      const trimmed = typeof rejectedCandidate === "string" ? rejectedCandidate.trim() : "";
      if (trimmed) {
        // Try to find containing sentence (parent sentence for fragments)
        for (const rawSentence of rawSentenceList) {
          if (rawSentence.includes(trimmed) && /[.?!]\s*$/.test(rawSentence)) {
            fallback = rawSentence;
            break;
          }
        }
        // If still no fallback, use nearest raw sentence by index
        if (!fallback) {
          // Use the tracked index of the rejected candidate to find nearest raw sentence
          if (candidateIndex >= 0 && candidateIndex < rawSentenceList.length) {
            fallback = rawSentenceList[candidateIndex];
          }
        }
        // If still no fallback, use first full sentence that's long enough
        if (!fallback) {
          fallback = rawSentenceList.find(s => s.length >= 45 && /[.?!]\s*$/.test(s));
        }
      }
    }
    
    // CRITICAL FIX: Always add fallback for each rejected candidate when rawSentences are available
    // This ensures rejectedCount > 0 => fallbackCount > 0
    if (rawSentenceList.length > 0) {
      // If we still don't have a fallback, use last resort
      if (!fallback) {
        fallback = rawSentenceList.find(s => /[.?!]\s*$/.test(s) && s.length >= 45) || rawSentenceList[0];
      }
      
      // Add fallback even if it's a duplicate (we need one per rejected candidate)
      // Only check that it's not already in accepted list to avoid polluting accepted candidates
      if (fallback && !accepted.includes(fallback)) {
      fallbackCandidates.push(fallback);
        appliedFallbackReasons.push(rejectionReason);
        
        // Log individual fallback application for verification
        const rejectedPreview = (typeof rejectedCandidate === "string" ? rejectedCandidate : "").substring(0, 30) + "...";
        const fallbackPreview = fallback.substring(0, 50) + "...";
        log(`[SEG_GUARD] appliedFallback reason=${rejectionReason} rejectedPreview="${rejectedPreview}" fallbackPreview="${fallbackPreview}"`);
        
        // Track samples for summary log
        if (fallbackSamples.length < 3) {
        fallbackSamples.push({ rejectedPreview, fallbackPreview });
        }
      }
    }
  }
  
  // Combine accepted and fallback candidates
  let finalCandidates = [...accepted, ...fallbackCandidates];
  
  // CRITICAL FIX: Ensure fallbackCount matches rejectedCount when rawSentences are available
  // Hard requirement: rejected > 0 && rawSentences available => fallbackCount must match rejectedCount
  // This must happen BEFORE the "unsplit fallback" check to ensure proper counts
  if (rejected.length > 0 && rawSentenceList.length > 0) {
    // If we have fewer fallbacks than rejected candidates, add more
    while (fallbackCandidates.length < rejected.length) {
      // Find a valid fallback sentence that's not already in the list
      const lastResortFallback = rawSentenceList.find(s => {
        const isValid = /[.?!]\s*$/.test(s) && s.length >= 45;
        const notInAccepted = !accepted.includes(s);
        const notInFallbacks = !fallbackCandidates.includes(s);
        return isValid && notInAccepted && notInFallbacks;
      });
      
      if (lastResortFallback) {
        finalCandidates.push(lastResortFallback);
        fallbackCandidates.push(lastResortFallback);
        appliedFallbackReasons.push("last_resort");
        log(`[SEG_GUARD] lastResortFallback applied: added 1 fallback sentence (total fallback=${fallbackCandidates.length}, rejected=${rejected.length})`);
      } else {
        // If no unique fallback found, use the first valid one (even if duplicate)
        const anyValidFallback = rawSentenceList.find(s => /[.?!]\s*$/.test(s) && s.length >= 45) || rawSentenceList[0];
        if (anyValidFallback && !accepted.includes(anyValidFallback)) {
          finalCandidates.push(anyValidFallback);
          fallbackCandidates.push(anyValidFallback);
          appliedFallbackReasons.push("last_resort_duplicate");
          log(`[SEG_GUARD] lastResortFallback (duplicate allowed) applied: added 1 fallback sentence (total fallback=${fallbackCandidates.length}, rejected=${rejected.length})`);
        } else {
          // Can't add more fallbacks, break to avoid infinite loop
          break;
        }
      }
    }
    
    // Final verification: warn if still mismatched (should not happen with above logic)
    if (fallbackCandidates.length < rejected.length) {
      log(`[SEG_GUARD] WARNING: fallbackCount (${fallbackCandidates.length}) < rejectedCount (${rejected.length}) despite having rawSentences`);
    }
  }
  
  // A3.5.15 Fix 2: Post-fallback re-validation - ensure no unbalanced parens in final candidates
  // This must happen BEFORE the "unsplit fallback" check
  const postFallbackRejected = [];
  const postFallbackRepaired = [];
  const validatedCandidates = [];
  
  for (const candidate of finalCandidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      postFallbackRejected.push(candidate);
      continue;
    }
    
    const trimmed = candidate.trim();
    
    // Check for unbalanced brackets/parens
    const openParens = (trimmed.match(/\(/g) || []).length;
    const closeParens = (trimmed.match(/\)/g) || []).length;
    const openBrackets = (trimmed.match(/\[/g) || []).length;
    const closeBrackets = (trimmed.match(/\]/g) || []).length;
    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;
    
    const isUnbalanced = openParens !== closeParens || openBrackets !== closeBrackets || openBraces !== closeBraces;
    
    if (isUnbalanced) {
      // Try to repair with unsplit block
      let repaired = candidateToUnsplitBlock.get(candidate);
      if (!repaired) {
        // Find containing unsplit block by searching for candidate text
        for (const [origCandidate, unsplitBlock] of candidateToUnsplitBlock.entries()) {
          if (unsplitBlock.includes(trimmed)) {
            repaired = unsplitBlock;
            break;
          }
        }
      }
      
      // If still no repair, use containing raw sentence
      if (!repaired) {
        for (const rawSentence of rawSentenceList) {
          if (rawSentence.includes(trimmed) && /[.?!]\s*$/.test(rawSentence) && rawSentence.length >= 45) {
            repaired = rawSentence;
            break;
          }
        }
      }
      
      // If repair found and valid, use it
      if (repaired && /[.?!]\s*$/.test(repaired) && repaired.length >= 45) {
        // Verify repaired doesn't have unbalanced brackets
        const repairedOpenParens = (repaired.match(/\(/g) || []).length;
        const repairedCloseParens = (repaired.match(/\)/g) || []).length;
        const repairedOpenBrackets = (repaired.match(/\[/g) || []).length;
        const repairedCloseBrackets = (repaired.match(/\]/g) || []).length;
        const repairedOpenBraces = (repaired.match(/\{/g) || []).length;
        const repairedCloseBraces = (repaired.match(/\}/g) || []).length;
        
        const repairedIsBalanced = repairedOpenParens === repairedCloseParens && 
                                   repairedOpenBrackets === repairedCloseBrackets && 
                                   repairedOpenBraces === repairedCloseBraces;
        
        if (repairedIsBalanced) {
          validatedCandidates.push(repaired);
          postFallbackRepaired.push({ original: trimmed.substring(0, 40) + "...", repaired: repaired.substring(0, 40) + "..." });
        } else {
          // Even repair has unbalanced brackets, drop it
          postFallbackRejected.push(candidate);
        }
      } else {
        // No valid repair found, drop the candidate
        postFallbackRejected.push(candidate);
      }
    } else {
      // Candidate is valid, keep it
      validatedCandidates.push(candidate);
    }
  }
  
  // Update finalCandidates with validated list
  finalCandidates = validatedCandidates;
  
  // Log post-fallback validation results
  if (postFallbackRejected.length > 0 || postFallbackRepaired.length > 0) {
    log(`[SEG_GUARD] postFallbackValidation rejected=${postFallbackRejected.length} repaired=${postFallbackRepaired.length}`);
  }
  
  // If filtering reduced count too much, use original unsplit sentences
  const MIN_ACCEPTABLE_COUNT = Math.max(1, Math.floor(candidates.length * 0.3));
  if (finalCandidates.length < MIN_ACCEPTABLE_COUNT && rawSentenceList.length > 0) {
    log(`[SEG_GUARD] filtering reduced count too much (${candidates.length} -> ${finalCandidates.length}), using original unsplit sentences`);
    const unsplitFallback = rawSentenceList
      .filter(s => s.length >= 45 || /\d/.test(s))
      .slice(0, 25);
    log(`[SEG_GUARD] unsplit fallback count=${unsplitFallback.length}`);
    
    // Compute stable hash (simple hash for determinism check)
    const joinedCandidates = unsplitFallback.join('|');
    let hash = 0;
    for (let i = 0; i < joinedCandidates.length; i++) {
      const char = joinedCandidates.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    const stableHash = Math.abs(hash).toString(16).substring(0, 8);
    
    // Log diagnostics
    const rejectionSummary = {};
    rejectionReasons.forEach(r => {
      rejectionSummary[r] = (rejectionSummary[r] || 0) + 1;
    });
    console.log(`[DIAG][SEG_GUARD] rawCandidateCount=${candidates.length}`);
    console.log(`[DIAG][SEG_GUARD] accepted=${accepted.length} rejected=${rejected.length} fallback=${unsplitFallback.length}`);
    console.log(`[DIAG][SEG_GUARD] rejectedByReason=${JSON.stringify(rejectionSummary)}`);
    console.log(`[DIAG][SEG_GUARD] sampleRejected=${JSON.stringify(rejectedWithReasons.slice(0, 3))}`);
    console.log(`[DIAG][SEG_GUARD] stableCandidateHash=${stableHash}`);
    
    // Fix 3: Return with counts for quality computation
    return { 
      candidates: unsplitFallback, 
      rejectedCount: rejected.length, 
      fallbackCount: unsplitFallback.length 
    };
  }
  
  // Rebuild finalCandidates after fallback additions (in case while loop added more)
  finalCandidates = [...accepted, ...fallbackCandidates];
  
  // Compute stable hash (simple hash for determinism check) - AFTER all fallback additions and validation
  const joinedCandidates = finalCandidates.join('|');
  let hash = 0;
  for (let i = 0; i < joinedCandidates.length; i++) {
    const char = joinedCandidates.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const stableHash = Math.abs(hash).toString(16).substring(0, 8);
  
  // Log diagnostics - AFTER all fallback additions to show accurate counts
  const rejectionSummary = {};
  rejectionReasons.forEach(r => {
    rejectionSummary[r] = (rejectionSummary[r] || 0) + 1;
  });
  console.log(`[DIAG][SEG_GUARD] rawCandidateCount=${candidates.length}`);
  console.log(`[DIAG][SEG_GUARD] accepted=${accepted.length} rejected=${rejected.length} fallback=${fallbackCandidates.length}`);
  console.log(`[DIAG][SEG_GUARD] rejectedByReason=${JSON.stringify(rejectionSummary)}`);
  console.log(`[DIAG][SEG_GUARD] sampleRejected=${JSON.stringify(rejectedWithReasons.slice(0, 3))}`);
  if (fallbackSamples.length > 0) {
    console.log(`[DIAG][SEG_GUARD] sampleFallback=${JSON.stringify(fallbackSamples)}`);
  }
  console.log(`[DIAG][SEG_GUARD] stableCandidateHash=${stableHash}`);
  
  // A3.5.17 Fix 2 & 3: Return with counts including incomplete_numeric_fragment and recombined counts
  // A3.5.27: Also return candidates with rejection reasons for fragment filter
  const incompleteNumericFragmentCount = rejectionReasons.filter(r => r === "incomplete_numeric_fragment").length;
  
  // Build candidates with metadata for fragment filter
  const candidatesWithReasons = [];
  // Map fallback candidates to their rejection reasons
  const fallbackToReasonMap = new Map();
  for (let i = 0; i < rejected.length; i++) {
    const fallback = fallbackCandidates[i];
    const reason = rejectionReasons[i] || "unknown";
    if (fallback) {
      fallbackToReasonMap.set(fallback.trim(), reason);
    }
  }
  
  // Add metadata for all final candidates (fallback candidates have rejection reasons)
  finalCandidates.forEach((candidate, idx) => {
    const reason = fallbackToReasonMap.get(candidate.trim());
    if (reason) {
      candidatesWithReasons.push({ text: candidate, reason });
    }
  });
  
  return { 
    candidates: finalCandidates, 
    rejectedCount: rejected.length, 
    fallbackCount: fallbackCandidates.length,
    incompleteNumericFragmentCount,
    recombinedCount: recombineCount,
    candidatesWithReasons // A3.5.27: For fragment filter
  };
}

// A3.6.11: Numeric-fragment repair - repairs statements ending mid-number or mid-parenthesis
function repairNumericFragments(statements, draftText, runId = null, reqSig = null) {
  if (!Array.isArray(statements) || statements.length === 0) return statements;
  if (typeof draftText !== "string" || !draftText.trim()) return statements;
  
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  // A3.6.43: Create a working copy to mutate
  const workingStatements = statements.map(stmt => ({ ...stmt }));
  
  // ============================================================
  // PASS A: NUMERIC_FRAGMENT_REPAIR (runs first, no interleaving)
  // ============================================================
  log(`[PASS_A_START] phase=repairNumericFragments`);
  let repairCount = 0;
  
  for (let i = 0; i < workingStatements.length; i++) {
    const stmt = workingStatements[i];
    if (!stmt || typeof stmt !== "object") {
      continue;
    }
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    if (!text.trim()) {
      continue;
    }
    
    const trimmed = text.trim();
    let needsRepair = false;
    
    // Detect trailing fragments:
    // 1. Dangling currency symbols (ends with $)
    if (/\$$/.test(trimmed)) {
      needsRepair = true;
    }
    // 2. Incomplete parentheses (unbalanced)
    const openParens = (trimmed.match(/\(/g) || []).length;
    const closeParens = (trimmed.match(/\)/g) || []).length;
    if (openParens > closeParens) {
      needsRepair = true;
    }
    // 3. Truncated numbers (ends with incomplete number like "$18" without unit)
    if (/\$\d+$/.test(trimmed) || /\d+\.\d*$/.test(trimmed)) {
      needsRepair = true;
    }
    
    let repairedText = null;
    let changed = false;
    
    if (needsRepair) {
      // A3.6.12: Repair strategy: extend to nearest valid sentence boundary from original draft text
      const textIndex = draftText.indexOf(trimmed);
      
      if (textIndex >= 0) {
        // Find sentence boundary after the statement
        const sentenceEnd = draftText.indexOf(".", textIndex + trimmed.length);
        if (sentenceEnd >= 0) {
          const extended = draftText.substring(textIndex, sentenceEnd + 1).trim();
          // A3.6.12: Only use extension if it actually completes the number/paren
          if (extended.length > trimmed.length) {
            // Verify the extension completes the fragment
            const hasCompleteNumber = !/\$\d+$/.test(extended) && !/\d+\.\d*$/.test(extended);
            const hasBalancedParens = (extended.match(/\(/g) || []).length === (extended.match(/\)/g) || []).length;
            const hasNoDanglingCurrency = !/\$$/.test(extended);
            
            if (hasCompleteNumber && hasBalancedParens && hasNoDanglingCurrency) {
              repairedText = extended;
              changed = true;
            }
          }
        }
      }
      
      // A3.6.12: If extension not possible or didn't work, truncate the fragment entirely
      if (!changed) {
        // Find last complete sentence or word boundary before the fragment
        // Try to find sentence boundary first
        const lastSentenceEnd = trimmed.lastIndexOf(".");
        if (lastSentenceEnd > 0) {
          const truncated = trimmed.substring(0, lastSentenceEnd + 1).trim();
          if (truncated.length >= 10) {
            repairedText = truncated;
            changed = true;
          }
        }
        
        // If no sentence boundary, find last complete word
        if (!changed) {
          const lastCompleteWord = trimmed.match(/\b\w+\b(?=\s*$)/);
          if (lastCompleteWord && lastCompleteWord.index > 0) {
            const truncated = trimmed.substring(0, lastCompleteWord.index).trim();
            if (truncated.length >= 10) {
              repairedText = truncated;
              changed = true;
            }
          }
        }
        
        // A3.6.12: If still no repair, remove trailing fragment entirely
        if (!changed) {
          // Remove everything from the last complete clause
          const clauseEnd = trimmed.lastIndexOf(/\s+(?:and|with|at|for|to)\s+/i);
          if (clauseEnd > 0) {
            const truncated = trimmed.substring(0, clauseEnd).trim();
            if (truncated.length >= 10) {
              repairedText = truncated;
              changed = true;
            }
          }
        }
      }
      
      // A3.6.12: Postcondition check - repaired text must not end with dangling fragments
      if (repairedText) {
        const endsWithDangling = /\$$/.test(repairedText) || 
                                 /\$\d+$/.test(repairedText) || 
                                 /\d+\.\d*$/.test(repairedText) ||
                                 (repairedText.match(/\(/g) || []).length > (repairedText.match(/\)/g) || []).length;
        
        if (endsWithDangling) {
          // Still has dangling fragment - truncate more aggressively
          const lastGoodEnd = repairedText.search(/\b\w+\s*[.!?]\s*$/);
          if (lastGoodEnd > 0) {
            repairedText = repairedText.substring(0, lastGoodEnd + 1).trim();
          } else {
            // Fallback: remove last 20 chars if they contain the fragment
            const beforeFragment = repairedText.substring(0, Math.max(10, repairedText.length - 20)).trim();
            if (beforeFragment.length >= 10) {
              repairedText = beforeFragment;
            }
          }
        }
      }
      
