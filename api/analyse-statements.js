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
  const repaired = [];
  let repairCount = 0;
  
  for (const stmt of statements) {
    if (!stmt || typeof stmt !== "object") {
      repaired.push(stmt);
      continue;
    }
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    if (!text.trim()) {
      repaired.push(stmt);
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
    
    if (!needsRepair) {
      repaired.push(stmt);
      continue;
    }
    
    // A3.6.12: Repair strategy: extend to nearest valid sentence boundary from original draft text
    const textIndex = draftText.indexOf(trimmed);
    let repairedText = null;
    let changed = false;
    
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
    
    if (repairedText && repairedText !== trimmed) {
      repaired.push({
        ...stmt,
        text: repairedText,
        __repairedNumericFragment: true,
      });
      repairCount++;
      const originalPreview = trimmed.length > 50 ? trimmed.substring(0, 50) + "..." : trimmed;
      const repairedPreview = repairedText.length > 50 ? repairedText.substring(0, 50) + "..." : repairedText;
      log(`[NUMERIC_FRAGMENT_REPAIR] idx=${repaired.length - 1} changed=true originalPreview="${originalPreview}" repairedPreview="${repairedPreview}"`);
    } else {
      // A3.6.12: If we couldn't repair, still mark as repaired but keep original (shouldn't happen often)
      repaired.push({
        ...stmt,
        __repairedNumericFragment: true,
      });
      repairCount++;
      log(`[NUMERIC_FRAGMENT_REPAIR] idx=${repaired.length - 1} changed=false originalPreview="${trimmed.substring(0, 50)}..." (could not repair)`);
    }
  }
  
  if (repairCount > 0) {
    log(`[NUMERIC_FRAGMENT_REPAIR] repaired=${repairCount} total=${statements.length}`);
  }
  
  return repaired;
}

// A3.5.27: Fragment-only candidate suppression (post SEG_GUARD)
// Detects and filters/merges fragment-like candidates that shouldn't appear as standalone statements
// Supports candidate objects with candidateIndex and rejectionReason metadata
function filterFragmentCandidates(candidates, runId = null, reqSig = null, segGuardMetadata = null) {
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { candidates: [], dropped: 0, mergedPrev: 0, mergedNext: 0, kept: 0 };
  }
  
  // Normalize candidates to objects with candidateIndex and draftPosition
  // A3.6.6: draftPosition should come from candidateIndex or the original candidate sentence order BEFORE merge/drop
  const candidateObjects = candidates.map((c, idx) => {
    const candidateIdx = (typeof c === "object" && c.candidateIndex != null) ? c.candidateIndex : idx;
    const draftPos = candidateIdx; // draftPosition = candidateIndex initially
    
    if (typeof c === "string") {
      return { text: c, candidateIndex: idx, draftPosition: draftPos, sourceSentenceIndex: null, flags: {} };
    }
    return {
      text: c.text || c,
      candidateIndex: candidateIdx,
      draftPosition: draftPos,
      sourceSentenceIndex: c.sourceSentenceIndex || null,
      flags: c.flags || {},
      rejectionReason: c.rejectionReason || null
    };
  });
  
  // Build map of candidate text to rejection reason from SEG_GUARD metadata
  const rejectionReasonMap = new Map();
  if (segGuardMetadata && Array.isArray(segGuardMetadata.candidatesWithReasons)) {
    segGuardMetadata.candidatesWithReasons.forEach(item => {
      if (item.text && item.reason) {
        rejectionReasonMap.set(item.text.trim(), item.reason);
      }
    });
  }
  
  const kept = [];
  const dropped = [];
  const mergedPrev = [];
  const mergedNext = [];
  
  // Simple verb-like detector
  const verbPatterns = /\b(is|are|was|were|be|been|being|invest|invested|proposes|targeting|expected|results|result|bring|increase|imply|implies|valued|priced|structured|purchase|purchasing)\b/i;
  
  function hasVerb(text) {
    return verbPatterns.test(text);
  }
  
  function isFragmentLike(candidateObj, prevCandidateObj, nextCandidateObj) {
    const text = candidateObj.text;
    const trimmed = text.trim();
    
    // A3.6.6: Check for strong anchors (%, $) - keep anchor-bearing fragments even if short
    const hasStrongAnchor = /(\d+(\.\d+)?\s*%)/.test(trimmed) || /\$\s*\d/.test(trimmed);
    if (hasStrongAnchor) {
      // Also check using extractAllAnchors for pct_/usd_ anchors
      const allAnchors = extractAllAnchors(trimmed);
      const hasAnchorTag = allAnchors.some(a => a.startsWith("pct_") || a.startsWith("usd_"));
      if (hasAnchorTag) {
        // Keep anchor-bearing fragments - do not drop
        return { isFragment: false, reason: null };
      }
    }
    
    // Very short: trimmed length < 40
    if (trimmed.length < 40) {
      return { isFragment: true, reason: "very_short" };
    }
    
    // Starts with lowercase letter AND previous candidate exists (likely continuation)
    if (prevCandidateObj && /^[a-z]/.test(trimmed)) {
      return { isFragment: true, reason: "starts_lowercase" };
    }
    
    // Starts with punctuation/close-paren/comma/dash OR ends with ellipsis/trailing comma/semicolon
    if (/^[.,;:)\]}\-–—]/.test(trimmed) || /\.\.\.$|[,;]\s*$/.test(trimmed)) {
      return { isFragment: true, reason: "punctuation_fragment" };
    }
    
    // Contains currency/number but lacks a verb (numeric noun phrase)
    const hasNumber = /\d/.test(trimmed) || /\$|~\$|%|x\s*\d/.test(trimmed);
    if (hasNumber && !hasVerb(trimmed)) {
      return { isFragment: true, reason: "numeric_noun_phrase" };
    }
    
    // Incomplete numeric stub: contains "~$" or "$" or "%" or "x" and ends with bare number
    if ((/~\$|^\$|%|x\s*\d/.test(trimmed)) && /(~?\$?\d+(?:,\d+)*(?:\.\d+)?|x\s*\d+)\s*\.\.?\.?\s*$/.test(trimmed) && !/[.?!]\s*$/.test(trimmed)) {
      return { isFragment: true, reason: "incomplete_numeric_stub" };
    }
    
    // Bracket imbalance remnants: begins with ")" or "]" or "EV)" etc OR contains unmatched closing bracket
    if (/^[)\]}]/.test(trimmed)) {
      return { isFragment: true, reason: "starts_with_closing_bracket" };
    }
    const openParens = (trimmed.match(/\(/g) || []).length;
    const closeParens = (trimmed.match(/\)/g) || []).length;
    const openBrackets = (trimmed.match(/\[/g) || []).length;
    const closeBrackets = (trimmed.match(/\]/g) || []).length;
    if ((closeParens > openParens || closeBrackets > openBrackets) && openParens === 0 && openBrackets === 0) {
      return { isFragment: true, reason: "unmatched_closing_bracket" };
    }
    
    // High suspicion if SEG_GUARD marked it as incomplete_numeric_fragment or unbalanced_brackets
    const rejectionReason = candidateObj.rejectionReason || rejectionReasonMap.get(trimmed);
    if (rejectionReason === "incomplete_numeric_fragment" || rejectionReason === "unbalanced_brackets") {
      // Require stronger checks - if it's still short or lacks verb, treat as fragment
      if (trimmed.length < 50 || !hasVerb(trimmed)) {
        return { isFragment: true, reason: `high_suspicion_${rejectionReason}` };
      }
    }
    
    return { isFragment: false, reason: null };
  }
  
  for (let i = 0; i < candidateObjects.length; i++) {
    const candidateObj = candidateObjects[i];
    const prevCandidateObj = i > 0 ? kept[kept.length - 1] : null;
    const nextCandidateObj = i < candidateObjects.length - 1 ? candidateObjects[i + 1] : null;
    
    const fragmentCheck = isFragmentLike(candidateObj, prevCandidateObj, nextCandidateObj);
    
    if (fragmentCheck.isFragment) {
      // Merge direction logic
      let merged = false;
      
      // Prefer merge into PREVIOUS candidate if:
      // - previous exists AND previous does NOT end with terminal punctuation (.?!)
      // - OR fragment starts lowercase / starts with punctuation / starts with number
      if (prevCandidateObj) {
        const prevText = prevCandidateObj.text;
        const prevEndsTerminal = /[.?!]\s*$/.test(prevText);
        const fragmentStartsLowercase = /^[a-z]/.test(candidateObj.text.trim());
        const fragmentStartsPunct = /^[.,;:)\]}\-–—]/.test(candidateObj.text.trim());
        const fragmentStartsNumber = /^\d|^~?\$/.test(candidateObj.text.trim());
        
        if (!prevEndsTerminal || fragmentStartsLowercase || fragmentStartsPunct || fragmentStartsNumber) {
          // Merge into previous
          // A3.6.6: When merging prev/next, inherit the MIN(draftPosition) of merged pieces
          const mergedText = `${prevText} ${candidateObj.text.trim()}`;
          const minDraftPosition = Math.min(prevCandidateObj.draftPosition || prevCandidateObj.candidateIndex, candidateObj.draftPosition || candidateObj.candidateIndex);
          kept[kept.length - 1] = {
            text: mergedText,
            candidateIndex: prevCandidateObj.candidateIndex, // Preserve earlier index
            draftPosition: minDraftPosition, // A3.6.6: Use MIN(draftPosition)
            sourceSentenceIndex: prevCandidateObj.sourceSentenceIndex,
            flags: { ...prevCandidateObj.flags, merged: true }
          };
          mergedPrev.push({
            original: candidateObj.text.substring(0, 60),
            mergedInto: prevText.substring(0, 50) + "..."
          });
          merged = true;
        }
      }
      
      // Else try merge into NEXT candidate if:
      // - next exists AND fragment looks like a prefix fragment (e.g., starts with number phrase and next begins with verb clause)
      if (!merged && nextCandidateObj) {
        const fragmentText = candidateObj.text.trim();
        const nextText = nextCandidateObj.text.trim();
        const fragmentStartsNumber = /^\d|^~?\$/.test(fragmentText);
        const nextStartsVerb = hasVerb(nextText.substring(0, 20)); // Check first 20 chars for verb
        
        if (fragmentStartsNumber && nextStartsVerb) {
          // Merge into next (prepend fragment to next)
          // A3.6.6: When merging prev/next, inherit the MIN(draftPosition) of merged pieces
          const mergedText = `${fragmentText} ${nextText}`;
          const minDraftPosition = Math.min(candidateObj.draftPosition || candidateObj.candidateIndex, nextCandidateObj.draftPosition || nextCandidateObj.candidateIndex);
          candidateObjects[i + 1] = {
            text: mergedText,
            candidateIndex: nextCandidateObj.candidateIndex, // Keep next's index
            draftPosition: minDraftPosition, // A3.6.6: Use MIN(draftPosition)
            sourceSentenceIndex: nextCandidateObj.sourceSentenceIndex,
            flags: { ...nextCandidateObj.flags, merged: true }
          };
          mergedNext.push({
            original: fragmentText.substring(0, 60),
            mergedInto: nextText.substring(0, 50) + "..."
          });
          merged = true;
          // Skip processing this candidate since it's merged into next
          continue;
        }
      }
      
      // If neither merge is safe, drop it
      if (!merged) {
        dropped.push(candidateObj.text.substring(0, 60));
      }
    } else {
      kept.push(candidateObj);
    }
  }
  
  // Extract text from kept candidates for return
  const keptTexts = kept.map(c => c.text);
  
  // Log results
  const droppedPreview = dropped.slice(0, 3);
  const mergedPrevPreview = mergedPrev.slice(0, 3);
  const mergedNextPreview = mergedNext.slice(0, 3);
  
  log(`[FRAG_FILTER] dropped=${dropped.length} mergedPrev=${mergedPrev.length} mergedNext=${mergedNext.length} kept=${kept.length}`);
  if (dropped.length > 0) {
    log(`[FRAG_FILTER] sampleDropped=${JSON.stringify(droppedPreview)}`);
  }
  if (mergedPrev.length > 0 || mergedNext.length > 0) {
    const allMerged = [...mergedPrevPreview.map(m => ({ type: "prev", ...m })), ...mergedNextPreview.map(m => ({ type: "next", ...m }))];
    log(`[FRAG_FILTER] sampleMerged=${JSON.stringify(allMerged)}`);
  }
  
  return {
    candidates: keptTexts,
    candidateObjects: kept, // Return objects for candidateIndex preservation
    dropped: dropped.length,
    mergedPrev: mergedPrev.length,
    mergedNext: mergedNext.length,
    merged: mergedPrev.length + mergedNext.length,
    kept: kept.length
  };
}

// A3.5.14b Patch 4: Web Reference Hygiene - filter raw search results BEFORE reference construction
// Works on raw Tavily search results (objects with url, title, snippet/content)
function filterWebSearchResults(rawResults, draftText) {
  if (!Array.isArray(rawResults) || rawResults.length === 0) return [];
  if (typeof draftText !== "string" || !draftText.trim()) return rawResults;
  
  const draftLower = draftText.toLowerCase();
  
  // Extract anchor keywords and entity names from draft
  const anchorKeywords = [
    "valuation", "pre-money", "post-money", "series a", "series b", "funding", "investment",
    "ownership", "equity", "secondary", "board", "preferred", "diluted"
  ];
  const hasAnchorKeywords = anchorKeywords.some(kw => draftLower.includes(kw));
  
  // Extract entity name (first capitalized word sequence, common company name patterns)
  const entityMatch = draftText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
  const entityName = entityMatch ? entityMatch[1].toLowerCase() : null;
  
  const kept = [];
  const rejected = [];
  const rejectionReasons = {};
  
  for (const result of rawResults) {
    if (!result || typeof result !== "object") {
      rejected.push(result);
      const reason = "invalid_object";
      rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
      continue;
    }
    
    const url = result.url || "";
    const title = result.title || "";
    const snippet = result.snippet || result.content || "";
    const urlLower = url.toLowerCase();
    const combinedText = (title + " " + snippet).toLowerCase();
    
    let shouldReject = false;
    let reason = null;
    
    // A3.5.17 Fix 4: Reject calculator/tool domains (blacklist)
    const blacklistedDomains = [
      "omnicalculator.com",
      "calculator.net",
      "calculatorsoup.com",
      "rapidtables.com"
    ];
    for (const domain of blacklistedDomains) {
      if (urlLower.includes(domain)) {
        shouldReject = true;
        reason = "calculator_domain";
        break;
      }
    }
    
    // Reject if domain is unrelated (dating, generic portals, feeds)
    if (!shouldReject) {
      const unrelatedDomains = [
        "dating", "tabor.ru", "generic", "portal", "feed", "youtube.com/feed",
        "google.com/maps", "maps.google", "facebook.com/feed"
      ];
      for (const domain of unrelatedDomains) {
        if (urlLower.includes(domain)) {
          shouldReject = true;
          reason = "unrelated_domain";
          break;
        }
      }
    }
    
    // Reject if URL is generic hub/feed with no relevant snippet
    if (!shouldReject) {
      const isGenericFeed = /(feed|hub|homepage|index)$/i.test(urlLower) && snippet.length < 50;
      if (isGenericFeed) {
        shouldReject = true;
        reason = "generic_feed_no_snippet";
      }
    }
    
    // Require at least ONE: anchor keyword overlap OR entity match + finance term
    if (!shouldReject) {
      const hasAnchorOverlap = hasAnchorKeywords && anchorKeywords.some(kw => 
        combinedText.includes(kw)
      );
      
      const financeTerms = ["investment", "funding", "valuation", "equity", "series", "round", "capital", "venture"];
      const hasFinanceTerm = financeTerms.some(term => combinedText.includes(term));
      const hasEntityMatch = entityName && combinedText.includes(entityName);
      const hasEntityAndFinance = hasEntityMatch && hasFinanceTerm;
      
      if (!hasAnchorOverlap && !hasEntityAndFinance) {
        shouldReject = true;
        reason = "no_anchor_or_entity_finance_match";
      }
    }
    
    if (shouldReject) {
      rejected.push(result);
      rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
    } else {
      kept.push(result);
    }
  }
  
  // Cap at 3 web results
  const cappedKept = kept.slice(0, 3);
  
  // Extract domains for logging
  const keptDomains = cappedKept.map(r => {
    try {
      return r?.url ? new URL(r.url).hostname : "unknown";
    } catch {
      return "unknown";
    }
  });
  
  // Log diagnostics
  const sampleRejected = rejected.slice(0, 3).map(r => {
    try {
      const domain = r?.url ? new URL(r.url).hostname : "unknown";
      return { domain, reason: "filtered", title: (r?.title || "").substring(0, 50) };
    } catch {
      return { domain: "unknown", reason: "filtered", title: (r?.title || "").substring(0, 50) };
    }
  });
  const sampleKept = cappedKept.slice(0, 3).map(r => {
    try {
      const domain = r?.url ? new URL(r.url).hostname : "unknown";
      return { domain, title: (r?.title || "").substring(0, 50) };
    } catch {
      return { domain: "unknown", title: (r?.title || "").substring(0, 50) };
    }
  });
  
  log(`[WEB_FILTER] initial=${rawResults.length} kept=${cappedKept.length} rejected=${rejected.length}`);
  log(`[WEB_FILTER] keptDomains=${JSON.stringify(keptDomains)}`);
  log(`[WEB_FILTER] rejectedByReason=${JSON.stringify(rejectionReasons)}`);
  if (sampleRejected.length > 0) {
    log(`[WEB_FILTER] sampleRejected=${JSON.stringify(sampleRejected)}`);
  }
  if (sampleKept.length > 0) {
    log(`[WEB_FILTER] kept=${JSON.stringify(sampleKept)}`);
  }
  
  return cappedKept;
}

// Fallback extraction when model fails
function fallbackExtractAtomicStatements(draftText, hasReturned = false, runId = null, reqSig = null) {
  if (typeof draftText !== "string" || !draftText.trim()) return [];
  
  // Use deterministic extraction for fallback too
  // A3.5.21 Step 3: Pass hasReturned flag to guard against execution after return
  // A3.5.21 Fix: Pass runId and reqSig for proper context
  const candidates = extractDeterministicStatementCandidates(draftText, runId, reqSig, hasReturned);
  
  // Convert candidates to statements with default assessment
  return candidates.map((text) => ({
    text,
          assessment: {
            reliabilityScore: 25,
            reliabilityLabel: "Low",
            reasons: ["Auto-extracted from the draft due to analysis degradation; no supporting source (uploaded or web) was confirmed."],
            citations: [],
          },
  }));
}

// Detect if a statement contains anchor facts (years, dates, percentages, currency, exchanges)
function isAnchorFact(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  
  // Compiled regexes (declare once for efficiency)
  const yearPattern = /\b(19|20)\d{2}\b/;
  const monthPattern = /\b(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|Jun(e)?|Jul(y)?|Aug(ust)?|Sep(tember)?|Sept|Oct(ober)?|Nov(ember)?|Dec(ember)?)\b/i;
  const percentPattern = /\d+(\.\d+)?\s*%|\b(percent|percentage)\b/i;
  const currencySymbolPattern = /[$£€¥]/;
  const currencyCodePattern = /\b(USD|SGD|EUR|GBP|AUD|CAD|JPY|CNY|RMB)\b/i;
  const bigNumberPattern = /\b[\d,]+(?:\.\d+)?\s*(?:million|billion|trillion|m|b|t|k)\b/i;
  const exchangePattern = /\b(NYSE|NASDAQ|LSE|ASX|HKEX|SGX|TSX|SIX|Euronext)\b/i;
  // Conservative ticker pattern: only when preceded by ticker keyword or in parentheses like (NYSE: SHOP)
  const tickerPattern = /\b(ticker|symbol|listed|trades)\s+[A-Z]{1,5}\b|\([A-Z]{1,5}\)|\([A-Z]{2,5}:\s*[A-Z]{1,5}\)/i;
  
  return (
    yearPattern.test(text) ||
    monthPattern.test(text) ||
    percentPattern.test(text) ||
    currencySymbolPattern.test(text) ||
    currencyCodePattern.test(text) ||
    bigNumberPattern.test(text) ||
    exchangePattern.test(text) ||
    tickerPattern.test(text)
  );
}

// Apply anchor-fact gating: force Low if anchor fact has no citations
// A3.5.13 Addendum - Anchor Absence Precedence: When uploaded sources exist, missing citations
// MUST NOT trigger absence language. corpusSearch over the full uploaded corpus MUST run first.
// Only if corpusSearch returns no match may Review emit "not mentioned / not supported" language.
// Citation presence is advisory, not authoritative, for uploaded documents.
//
// This is the final authority on anchor facts and runs AFTER all other processing
// Note: Dual-axis verification already handles this, but this provides explicit anchor-specific enforcement
function applyAnchorGating(statements, uploadedSources = []) {
  if (!Array.isArray(statements)) return statements;
  
  // Check if uploaded sources exist with full text
  const hasUploadedSources = Array.isArray(uploadedSources) && uploadedSources.length > 0 &&
    uploadedSources.some(s => typeof s.text === "string" && s.text.trim().length > 0);
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const citations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const hasCitations = citations.length > 0;
    const isAnchor = isAnchorFact(text);
    
    // Check if already forced Low by dual-axis verification
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const alreadyForcedLow = reasons.some((r) => r && r.includes("No verifiable sources"));
    
    // A3.5.13 Addendum - Anchor Absence Precedence:
    // If uploaded sources exist AND this is an anchor fact AND no citations:
    // DO NOT force Low based on missing citations alone.
    // corpusSearch will run in enforceCorpusVerificationBeforeAbsence and determine support.
    // Citation presence is advisory, not authoritative, for uploaded documents.
    if (isAnchor && !hasCitations && hasUploadedSources) {
      // Don't force Low - let corpusSearch determine support
      // If corpusSearch finds nothing, enforceCorpusVerificationBeforeAbsence will handle absence language
      return stmt;
    }
    
    // STRICT: If anchor fact AND no citations AND no uploaded sources: force Low
    // Citations can be from either uploaded sources or web references
    if (isAnchor && !hasCitations && !hasUploadedSources) {
      // If already forced Low, ensure anchor-specific reason is present
      if (alreadyForcedLow) {
        const anchorReason = "Anchor fact requires a supporting source; none was cited for this version.";
        if (!reasons.some((r) => r && r.includes("Anchor fact requires"))) {
          const updatedReasons = [anchorReason, ...reasons].slice(0, 4);
          return {
            ...stmt,
            assessment: {
              ...assessment,
              reasons: updatedReasons,
            },
          };
        }
        return stmt; // Already has anchor reason
      }
      
      // Not yet forced Low - apply anchor gating
      const existingScore = typeof assessment.reliabilityScore === "number" 
        ? assessment.reliabilityScore 
        : 30;
      const forcedScore = Math.min(existingScore, 35);
      
      const anchorReason = "Anchor fact requires a supporting source; none was cited for this version.";
      
      // Always prepend the anchor reason (strict enforcement)
      const updatedReasons = [anchorReason, ...reasons].slice(0, 4); // Cap at 4
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reliabilityLabel: "Low",
          reliabilityScore: forcedScore,
          reasons: updatedReasons.length > 0 ? updatedReasons : [anchorReason],
          citations: [], // Ensure empty
        },
      };
    }
    
    // If anchor fact AND has citations: leave as-is (do not downgrade)
    // If not anchor fact: leave as-is (handled by dual-axis verification and calibration)
    return stmt;
  });
}

// Normalize response structure: ensure citations and evidence are at top-level
// This enforces the response contract that the Review UI expects
function normalizeResponseStructure(statements, unifiedReferences) {
  if (!Array.isArray(statements) || !Array.isArray(unifiedReferences)) return statements;
  
  // Build references map keyed by String(id) to handle both number and string IDs
  const referencesById = new Map();
  unifiedReferences.forEach((ref) => {
    const id = ref?.id;
    if (id != null) {
      referencesById.set(String(id), ref);
    }
  });
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const assessment = stmt.assessment || {};
    const assessmentCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
    
    // Invariant 1: If assessment.citations exists, the same citations MUST be present at statement.citations
    // Always mirror assessment.citations to statement.citations when assessment.citations exists
    const citations = assessmentCitations.length > 0 ? assessmentCitations : (Array.isArray(stmt.citations) ? stmt.citations : []);
    
    // Invariant 2: Build evidence from resolved references for each citation
    const evidence = [];
    if (citations.length > 0) {
      citations.forEach((citationId) => {
        const citationKey = citationId != null ? String(citationId) : null;
        if (citationKey && referencesById.has(citationKey)) {
          const ref = referencesById.get(citationKey);
          const refType = ref?.type || (ref?.url ? "web" : "uploaded");
          evidence.push({
            title: ref?.title || "Untitled source",
            url: ref?.url || null,
            sourceType: refType, // Match frontend expectation
          });
        } else {
          // Citation id cannot be resolved - include placeholder
          evidence.push({
            title: "Unresolved citation",
            url: null,
            sourceType: "unresolved",
          });
        }
      });
    }
    
    // Build normalized statement
    const normalized = {
      ...stmt,
      citations, // Top-level citations (Invariant 1)
      evidence,  // Top-level evidence (Invariant 2)
    };
    
    // Optional backward compatibility: mirror evidence back to assessment.evidence
    if (evidence.length > 0) {
      normalized.assessment = {
        ...assessment,
        citations: assessmentCitations, // Preserve original
        evidence, // Mirror evidence for backward compatibility
      };
    }
    
    return normalized;
  });
}

// Sanitize assessment reasons: remove misleading "no sources cited" messages when citations/evidence exist
// Also improve language when web search is enabled to distinguish unsupported vs plausible claims
// Invariant 1: Never say "No verifiable sources cited" when sources exist
// Invariant 2: Keep "no sources cited" only for truly uncited statements
// Invariant 3: Use nuanced language when web search is enabled (A3.5.8)
function sanitizeReasons(statements, webSearchEnabled = false, webSearchUsed = false) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    
    // Normalize citations from both locations (use first non-empty)
    const citations = 
      (Array.isArray(stmt?.citations) && stmt.citations.length > 0) ? stmt.citations :
      (Array.isArray(assessment?.citations) && assessment.citations.length > 0) ? assessment.citations :
      [];
    
    // Normalize evidence from both locations (use first non-empty)
    const evidence = 
      (Array.isArray(stmt?.evidence) && stmt.evidence.length > 0) ? stmt.evidence :
      (Array.isArray(assessment?.evidence) && assessment.evidence.length > 0) ? assessment.evidence :
      [];
    
    // Count resolved evidence entries (have a title, regardless of url)
    const resolvedEvidenceCount = evidence.filter((ev) => {
      const title = ev?.title;
      return typeof title === "string" && title.trim().length > 0;
    }).length;
    
    // Check if statement has direct evidence
    const hasDirectEvidence = citations.length > 0 && resolvedEvidenceCount > 0;
    
    // Check if statement appears to be interpretive/comparative (plausible but not directly evidenced)
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const isInterpretiveClaim = /\b(?:gives|provides|enables|allows|offers|delivers|creates|builds|supports|facilitates)\b/i.test(text) ||
                                /\b(?:enterprise-like|enterprise-grade|similar to|comparable to|like|as|without|with)\b/i.test(text);
    
    let updatedReasons = [...reasons];
    let needsUpdate = false;
    
    // Invariant 1: If citations exist AND evidence is resolved, remove misleading messages
    if (hasDirectEvidence) {
      // Remove misleading "no sources cited" messages
      updatedReasons = updatedReasons.filter((reason) => {
        if (typeof reason !== "string") return true;
        const lower = reason.toLowerCase();
        // Remove these misleading phrases when sources exist
        return !(
          lower.includes("no verifiable sources cited") ||
          lower.includes("could not be verified against provided sources")
        );
      });
      
      if (updatedReasons.length < reasons.length) {
        needsUpdate = true;
      }
      
      // If all reasons were removed, add accurate explanation
      if (updatedReasons.length === 0 && reasons.length > 0) {
        updatedReasons = [
          "Sources were provided, but they do not directly support this claim as written.",
        ];
        needsUpdate = true;
      }
    } else {
      // No direct evidence - apply web search language improvements (A3.5.8)
      if (webSearchEnabled) {
        // Invariant 3: Replace absolute "no sources" language with conditional language
        updatedReasons = updatedReasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          const lower = reason.toLowerCase();
          
          // Replace absolute language with conditional language
          if (lower.includes("no external sources are provided") || 
              lower.includes("no external sources provided")) {
            needsUpdate = true;
            return "This claim is not directly supported by the provided sources.";
          }
          
          if (lower.includes("no verifiable sources cited") && webSearchUsed) {
            needsUpdate = true;
            return "This claim is not directly supported by the provided sources, but is broadly consistent with common public descriptions.";
          }
          
          if (lower.includes("could not be verified against provided sources") && webSearchUsed && isInterpretiveClaim) {
            needsUpdate = true;
            return "This is an interpretive or comparative claim that aligns with how the subject is generally described, though not explicitly evidenced in the sources reviewed.";
          }
          
          return reason;
        });
        
        // Invariant 2: Add plausibility language for interpretive claims when web search is available
        if (webSearchUsed && isInterpretiveClaim && !hasDirectEvidence) {
          // Check if reasons already mention plausibility or interpretive framing
          const hasPlausibilityLanguage = updatedReasons.some((r) => {
            if (typeof r !== "string") return false;
            const lower = r.toLowerCase();
            return lower.includes("plausible") || 
                   lower.includes("consistent with") || 
                   lower.includes("interpretive") || 
                   lower.includes("comparative") ||
                   lower.includes("generally described");
          });
          
          if (!hasPlausibilityLanguage) {
            // Add clarifying sentence about plausibility
            const plausibilityNote = "While broadly consistent with public descriptions, this claim is not directly evidenced in the sources reviewed.";
            updatedReasons.push(plausibilityNote);
            needsUpdate = true;
          }
        }
      } else {
        // Web search not enabled - keep existing "could not be verified" language (Invariant 3)
        // No changes needed for truly unsupported cases
      }
    }
    
    // Return updated statement if changes were made
    if (needsUpdate) {
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: updatedReasons.slice(0, 4), // Cap at 4 reasons
        },
      };
    }
    
    return stmt;
  });
}

// Enforce reason specificity: require explicit enumeration for partial support and contradiction cases
// Invariant 1: PARTIAL_SUPPORT must enumerate support coverage
// Invariant 2: Bundled-claim guidance is conditional
// Invariant 3: CONTRADICTED requires explicit conflict description
// Invariant 4: CONTRADICTED applies only to source conflicts
// Invariant 5: No impact on scoring
function enforceReasonSpecificity(statements) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const text = typeof stmt.text === "string" ? stmt.text : "";
    
    // Normalize citations to check if statement has any support
    const citations = 
      (Array.isArray(stmt?.citations) && stmt.citations.length > 0) ? stmt.citations :
      (Array.isArray(assessment?.citations) && assessment.citations.length > 0) ? assessment.citations :
      [];
    
    const hasCitations = citations.length > 0;
    
    let updatedReasons = [...reasons];
    let needsUpdate = false;
    
    // Detect vague partial support language
    const vaguePartialPatterns = [
      /partially supported/i,
      /not fully supported/i,
      /parts? (?:of this statement|go beyond|are not supported)/i,
      /some (?:parts|elements|claims) (?:are|go) (?:beyond|unsupported|not supported)/i,
    ];
    
    // Detect vague contradiction language
    const vagueContradictionPatterns = [
      /inconsistent with (?:sources|provided sources)/i,
      /does not align (?:with|to)/i,
      /conflicts? (?:with|against)/i,
    ];
    
    // Detect explicit contradiction language
    const explicitContradictionPatterns = [
      /contradicted by/i,
      /contradicts?/i,
      /conflicts? with/i,
    ];
    
    // Check if statement appears to be bundled (multiple claims)
    const bundledIndicators = [
      /,.*and/i,  // comma followed by "and"
      / and /i,   // standalone "and"
      / with /i,  // "with"
      / which /i, // "which"
      / under /i, // "under"
    ];
    const isBundled = bundledIndicators.some((pattern) => pattern.test(text));
    
    // Invariant 1: PARTIAL_SUPPORT must enumerate support coverage
    const hasVaguePartialSupport = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      return vaguePartialPatterns.some((pattern) => pattern.test(reason));
    });
    
    if (hasVaguePartialSupport && hasCitations) {
      // Check if reasons already have explicit enumeration
      const hasExplicitEnumeration = reasons.some((reason) => {
        if (typeof reason !== "string") return false;
        // Look for patterns like "support X but not Y" or explicit lists
        return /support (?:[^,]+(?:,|and|but))/.test(reason) ||
               /(?:supported|support) .* (?:but|however|while) (?:do not|does not|not) (?:support|explicitly)/i.test(reason);
      });
      
      if (!hasExplicitEnumeration) {
        // Try to extract supported vs unsupported elements from reasons and statement text
        // This is a heuristic - we'll enhance the most specific reason we can find
        const enhancedReasons = reasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          
          // If this is a vague partial support reason, try to make it more specific
          if (vaguePartialPatterns.some((pattern) => pattern.test(reason))) {
            needsUpdate = true;
            
            // Try to extract what IS supported from other reasons
            const otherReasons = reasons.filter((r) => r !== reason && typeof r === "string");
            const supportedElements = otherReasons
              .filter((r) => /support/i.test(r) && !/not (?:support|supported)/i.test(r))
              .map((r) => {
                // Try to extract the specific element mentioned
                const match = r.match(/(?:support|supported) (?:the |a |an )?([^,\.]+)/i);
                return match ? match[1].trim() : null;
              })
              .filter((e) => e && e.length > 5);
            
            // Try to extract unsupported elements from statement text if bundled
            let unsupportedElements = [];
            if (isBundled) {
              // Look for elements in the statement that might not be supported
              // This is a heuristic - split on common conjunctions
              const parts = text.split(/\s*,\s*|\s+and\s+|\s+with\s+/i);
              // If we have supported elements, assume others might be unsupported
              if (supportedElements.length > 0 && parts.length > supportedElements.length) {
                unsupportedElements = parts
                  .filter((part) => !supportedElements.some((se) => part.toLowerCase().includes(se.toLowerCase())))
                  .slice(0, 2); // Limit to 2 unsupported elements
              }
            }
            
            if (supportedElements.length > 0) {
              // We have some supported elements - create explicit enumeration
              const supportedText = supportedElements.join(" and ");
              if (unsupportedElements.length > 0) {
                const unsupportedText = unsupportedElements.join(" and ");
                return `The sources support ${supportedText}, but do not explicitly support ${unsupportedText}.`;
              } else {
                return `The sources support ${supportedText}, but do not explicitly support all elements of this statement.`;
              }
            } else {
              // Generic but more specific than vague
              return "The sources support some elements of this statement, but do not explicitly support all claims made.";
            }
          }
          
          return reason;
        });
        
        updatedReasons = enhancedReasons;
        
        // Invariant 2: Add bundled-claim guidance conditionally
        if (isBundled && hasCitations) {
          // Check if we have mixed support (some supported, some not)
          const hasSupportedElements = reasons.some((r) => 
            typeof r === "string" && /support/i.test(r) && !/not (?:support|supported)/i.test(r)
          );
          const hasUnsupportedElements = reasons.some((r) => 
            typeof r === "string" && /not (?:explicitly )?(?:support|supported)/i.test(r)
          );
          
          if (hasSupportedElements && hasUnsupportedElements) {
            // Check if guidance already exists
            const hasGuidance = updatedReasons.some((r) => 
              typeof r === "string" && /separat/i.test(r) && /statement/i.test(r)
            );
            
            if (!hasGuidance) {
              updatedReasons.push("Separating these elements into distinct statements would allow higher-confidence verification.");
              needsUpdate = true;
            }
          }
        }
      }
    }
    
    // Invariant 3: CONTRADICTED requires explicit conflict description
    const hasVagueContradiction = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      return vagueContradictionPatterns.some((pattern) => pattern.test(reason)) &&
             !explicitContradictionPatterns.some((pattern) => pattern.test(reason));
    });
    
    const hasExplicitContradiction = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      return explicitContradictionPatterns.some((pattern) => pattern.test(reason));
    });
    
    if (hasVagueContradiction || (hasExplicitContradiction && hasCitations)) {
      // Check if reasons already have explicit conflict description
      const hasExplicitConflict = reasons.some((reason) => {
        if (typeof reason !== "string") return false;
        // Look for patterns like "sources state X, which conflicts with Y"
        return /(?:sources|source) (?:state|indicate|show|say) .* (?:which|that) (?:conflicts?|contradicts?)/i.test(reason) ||
               /(?:conflicts?|contradicts?) with .* (?:claim|statement|element)/i.test(reason);
      });
      
      if (!hasExplicitConflict) {
        // Enhance contradiction reasons to be explicit
        updatedReasons = reasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          
          if (vagueContradictionPatterns.some((pattern) => pattern.test(reason)) ||
              (explicitContradictionPatterns.some((pattern) => pattern.test(reason)) && !hasExplicitConflict)) {
            needsUpdate = true;
            
            // Try to extract the conflicting fact from the reason or other reasons
            const conflictMatch = reason.match(/(?:sources?|source) (?:state|indicate|show|say) ([^,\.]+)/i);
            const claimMatch = text.match(/([^,\.]+(?:,|and|with)[^,\.]+)/);
            
            if (conflictMatch && claimMatch) {
              return `This statement is contradicted by the cited sources. The sources indicate ${conflictMatch[1]}, which conflicts with ${claimMatch[1]}.`;
            } else if (conflictMatch) {
              return `This statement is contradicted by the cited sources. The sources indicate ${conflictMatch[1]}, which conflicts with this claim.`;
            } else {
              return "This statement is contradicted by the cited sources. The sources state facts that conflict with elements of this claim.";
            }
          }
          
          return reason;
        });
        
        // Ensure we have at least one explicit contradiction statement
        if (!updatedReasons.some((r) => typeof r === "string" && /contradicted by (?:the )?cited sources/i.test(r))) {
          updatedReasons.unshift("This statement is contradicted by the cited sources.");
          needsUpdate = true;
        }
      }
    }
    
    // Return updated statement if changes were made
    if (needsUpdate) {
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: updatedReasons.slice(0, 4), // Cap at 4 reasons
        },
      };
    }
    
    return stmt;
  });
}

// A3.5.28: Enforce facet-scoped bullets for multi-claim statements
// Post-processes assessment reasons to ensure bullets reference specific statement clauses
function enforceFacetScopedBullets(statements) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const text = typeof stmt.text === "string" ? stmt.text : "";
    
    if (reasons.length === 0 || !text) return stmt;
    
    // Detect if statement has multiple claims
    // Count numeric anchors (dollar amounts, percentages, years, etc.)
    const numericAnchorPattern = /\$[\d,]+(?:\.\d+)?\s*(?:million|billion|m|b|k|thousand)?|[\d,]+(?:\.\d+)?\s*(?:million|billion|m|b|k|thousand)|[\d]{4}(?:\s|$)|[\d,]+%/gi;
    const numericAnchors = (text.match(numericAnchorPattern) || []).length;
    
    // Detect multiple clauses (commas, "at a", "structured as", "for roughly")
    const hasMultipleClauses = /,|at a|structured as|for roughly/i.test(text);
    
    const hasMultipleClaims = numericAnchors >= 2 || hasMultipleClauses;
    
    // If not multi-claim, return as-is
    if (!hasMultipleClaims) return stmt;
    
    // Process reasons to add facet tags if missing
    let updatedReasons = [];
    let needsUpdate = false;
    
    for (const reason of reasons) {
      if (typeof reason !== "string") {
        updatedReasons.push(reason);
        continue;
      }
      
      // Check if bullet already has facet tag and quoted snippet
      const hasFacetTag = /^\[(?:Investment|Valuation|Structure|Ownership|Timing|Other)\]/i.test(reason);
      const hasQuotedSnippet = /"[^"]{1,60}"/.test(reason); // Quoted snippet (1-60 chars)
      
      if (hasFacetTag && hasQuotedSnippet) {
        // Already properly formatted
        updatedReasons.push(reason);
      } else {
        // Missing facet tag or quoted snippet - add them
        needsUpdate = true;
        
        // Extract first 6-10 words from statement for snippet (cap at 10 words as per format requirement)
        const words = text.trim().split(/\s+/);
        const snippetWords = words.slice(0, Math.min(10, words.length));
        const snippet = snippetWords.join(" ");
        const quotedSnippet = `"${snippet}"`;
        
        // Prepend [Other] tag and quoted snippet
        const updatedReason = `[Other] ${quotedSnippet} ${reason}`;
        updatedReasons.push(updatedReason);
      }
    }
    
    // Cap at 4 bullets
    updatedReasons = updatedReasons.slice(0, 4);
    
    if (needsUpdate) {
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: updatedReasons,
        },
      };
    }
    
    return stmt;
  });
}

// A3.5.29: Detect facets in STATEMENT text (not reasons) for diagnostic + reusable
// Returns array of facet names detected in a statement's text
function detectFacetsInStatement(statementText) {
  if (typeof statementText !== "string" || !statementText.trim()) return [];
  
  const text = statementText.toLowerCase();
  const facets = [];
  
  // Investment: contains "invest" OR "investment" OR "$" + ("up to"|"million"|"mm") near "invest"
  if (/\binvest\b|\binvestment\b/.test(text) || 
      (/\$/.test(text) && /(?:up to|million|mm)\s+.*invest|invest.*\$(?:\s|[\d,])/.test(text))) {
    facets.push("Investment");
  }
  
  // Valuation: contains "valuation" OR "pre-money" OR "post-money" OR "enterprise value" OR "EV"
  if (/\bvaluation\b|\bpre-?money\b|\bpost-?money\b|\benterprise value\b|\bev\b(?!\w)/.test(text)) {
    facets.push("Valuation");
  }
  
  // Structure: contains "preferred" OR "1x" OR "liquidation" OR "structured" OR "terms"
  if (/\bpreferred\b|1x|\bliquidation\b|\bstructured\b|\bterms\b/.test(text)) {
    facets.push("Structure");
  }
  
  // Ownership: contains "ownership" OR "stake" OR "%" OR "fully diluted"
  if (/\bownership\b|\bstake\b|%|\bfully diluted\b/.test(text)) {
    facets.push("Ownership");
  }
  
  // Timing: contains "expected" OR "would" OR "plans" OR "seeks approval" (optional)
  if (/\bexpected\b|\bwould\b|\bplans\b|\bseeks approval\b/.test(text)) {
    facets.push("Timing");
  }
  
  // Other: fallback only if none matched
  if (facets.length === 0) {
    facets.push("Other");
  }
  
  return facets;
}

// A3.6.1: Clean claim text (remove ~ artifacts, normalize money/%, trim)
// A3.6.2 PATCH v2: Preserve money values correctly, add validation
function cleanClaimText(raw) {
  if (typeof raw !== "string") return "";
  
  let cleaned = raw;
  
  // Remove all "~" characters
  cleaned = cleaned.replace(/~/g, "");
  
  // A3.6.2 PATCH v2: Preserve money values - only normalize spacing, not values
  // "$ 5 million" -> "$5 million" (remove space after $, keep "million")
  cleaned = cleaned.replace(/\$\s+([\d,]+(?:\.\d+)?)/g, "$$1");
  // DO NOT convert "million" to "m" - preserve original
  
  // Normalize percentages: "20 %" -> "20%", "31 %" -> "31%"
  cleaned = cleaned.replace(/([\d,]+(?:\.\d+)?)\s+%/g, "$1%");
  
  // Normalize "pre - money", "pre- money" -> "pre-money"
  cleaned = cleaned.replace(/\bpre\s*-\s*money\b/gi, "pre-money");
  cleaned = cleaned.replace(/\bpost\s*-\s*money\b/gi, "post-money");
  
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ");
  
  // Trim
  cleaned = cleaned.trim();
  
  // Remove leading/trailing commas and garbage whitespace
  cleaned = cleaned.replace(/^[,.\s]+/, "").replace(/[,.\s]+$/, "");
  
  // If cleaned text ends up < 6 chars, return "" (skip)
  if (cleaned.length < 6) {
    return "";
  }
  
  return cleaned;
}

// A3.6.1: Build claim grouping key for aggregation
function buildClaimKey(claimText, facet) {
  if (typeof claimText !== "string" || typeof facet !== "string") {
    return `${facet || "Other"}:fallback`;
  }
  
  const text = claimText.toLowerCase();
  let anchorKey = "";
  
  // If contains "$<num>m" -> usd_<num>m (e.g., usd_5m, usd_20m)
  const usdMatch = text.match(/\$([\d,]+(?:\.\d+)?)\s*m\b/);
  if (usdMatch) {
    const num = usdMatch[1].replace(/,/g, "");
    anchorKey = `usd_${num}m`;
    return `${facet}:${anchorKey}`;
  }
  
  // If contains "<num>%" -> pct_<num> (pct_20, pct_31)
  const pctMatch = text.match(/([\d,]+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const num = pctMatch[1].replace(/,/g, "");
    anchorKey = `pct_${num}`;
    return `${facet}:${anchorKey}`;
  }
  
  // Else if facet=Valuation and contains "pre-money" -> premoney
  if (facet === "Valuation" && /pre-?money/.test(text)) {
    return `${facet}:premoney`;
  }
  
  // Else if facet=Structure and contains "1x" -> 1x
  if (facet === "Structure" && /\b1x\b/.test(text)) {
    return `${facet}:1x`;
  }
  
  // Else if facet=Structure and contains "preferred" -> preferred
  if (facet === "Structure" && /\bpreferred\b/.test(text)) {
    return `${facet}:preferred`;
  }
  
  // Else if facet=Investment and contains "Series A" -> series_a
  if (facet === "Investment" && /series\s+a\b/.test(text)) {
    return `${facet}:series_a`;
  }
  
  // Fallback: first strong keyword for facet
  const keywords = {
    Valuation: ["valuation", "pre-money", "post-money", "ev", "enterprise value"],
    Structure: ["preferred", "liquidation", "structured"],
    Ownership: ["ownership", "stake", "fully diluted"],
    Investment: ["investment", "invest", "series"],
    Timing: ["expected", "would", "plans"],
  };
  
  const facetKeywords = keywords[facet] || [];
  for (const keyword of facetKeywords) {
    if (text.includes(keyword)) {
      anchorKey = keyword.replace(/\s+/g, "_");
      return `${facet}:${anchorKey}`;
    }
  }
  
  // Final fallback
  return `${facet}:other`;
}

// A3.6.2 ADDENDUM: Extract meaning signature components (deterministic)
function extractVerbClass(claimText) {
  if (typeof claimText !== "string") return "none";
  const text = claimText.toLowerCase();
  
  const verbClasses = {
    invest: ["invest", "investment", "investing", "invested", "investor"],
    financing: ["financing", "financed", "funding", "funded", "raise", "raised"],
    purchase: ["purchase", "purchased", "buy", "bought", "acquire", "acquired"],
    valuation: ["value", "valued", "price", "priced", "valuation"],
    ownership: ["own", "owned", "ownership", "stake", "equity", "share"],
  };
  
  for (const [verbClass, verbs] of Object.entries(verbClasses)) {
    for (const verb of verbs) {
      if (new RegExp(`\\b${verb}\\b`).test(text)) {
        return verbClass;
      }
    }
  }
  
  return "none";
}

// A3.6.2 ADDENDUM: Extract domain keyword class (deterministic)
function extractDomainKeywordClass(claimText) {
  if (typeof claimText !== "string") return "none";
  const text = claimText.toLowerCase();
  
  const domainKeywords = {
    valuation: ["valuation", "pre-money", "post-money", "premoney", "postmoney", "ev", "enterprise value"],
    ownership: ["ownership", "stake", "fully diluted", "fully-diluted"],
    secondary: ["secondary", "common shares", "secondary purchase", "secondary sale"],
    structure: ["preferred", "liquidation", "liquidation preference", "structured", "1x"],
    investment: ["investment", "invest", "series a", "series b", "series c"],
  };
  
  for (const [domainClass, keywords] of Object.entries(domainKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        return domainClass;
      }
    }
  }
  
  return "none";
}

// A3.6.2 ADDENDUM: Extract entity key (conservative, deterministic)
function extractEntityKey(claimText) {
  if (typeof claimText !== "string") return "";
  
  // Extract entities only when:
  // - two or more consecutive capitalized tokens (e.g. "Shopify Inc")
  // - OR ALL-CAPS tokens (e.g. tickers)
  const words = claimText.split(/\s+/);
  const entities = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^\w]/g, "");
    
    // ALL-CAPS (tickers)
    if (word.length >= 2 && /^[A-Z]{2,}$/.test(word)) {
      entities.push(word);
      continue;
    }
    
    // Two or more consecutive capitalized tokens (not at sentence start)
    if (i > 0 && word.length > 2 && /^[A-Z]/.test(word)) {
      // Check if previous word was also capitalized
      const prevWord = words[i - 1].replace(/[^\w]/g, "");
      if (prevWord.length > 0 && /^[A-Z]/.test(prevWord)) {
        // Check if it's not a month/weekday/article
        const ignoreWords = ["the", "a", "an", "january", "february", "march", "april", "may", "june", 
                             "july", "august", "september", "october", "november", "december",
                             "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        if (!ignoreWords.includes(prevWord.toLowerCase()) && !ignoreWords.includes(word.toLowerCase())) {
          entities.push(`${prevWord} ${word}`);
          i++; // Skip next word
          continue;
        }
      }
    }
  }
  
  // Normalize: join and lowercase for key
  if (entities.length > 0) {
    return entities.join("_").toLowerCase();
  }
  
  return "";
}

// A3.6.2 ADDENDUM: Extract anchor (facet-free, for meaning-based deduplication)
function extractAnchor(claimText) {
  if (typeof claimText !== "string") return null;
  
  const text = claimText.toLowerCase();
  
  // A3.6.2 PATCH v2: Numeric anchors with consistent normalization and validation
  // Match: "$7 million", "$7mm", "$7m" -> all normalize to usd_7m
  // Use more specific regex to capture full number
  const usdMatch = text.match(/\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)/i);
  if (usdMatch) {
    const numStr = usdMatch[1].replace(/,/g, "");
    const unit = (usdMatch[2] || "").toLowerCase();
    const num = parseFloat(numStr);
    
    // A3.6.2 PATCH v2: Sanity check - ensure we captured the full number
    if (!Number.isFinite(num) || num <= 0) {
      return null;
    }
    
    let normalized = num;
    
    // Normalize to millions
    if (unit.includes("billion") || unit === "b") {
      normalized = normalized * 1000;
    } else if (unit.includes("thousand") || unit === "k") {
      normalized = normalized / 1000;
    }
    // "million", "mm", "m" all stay as-is (already in millions)
    
    return `usd_${normalized}m`;
  }
  
  // Percentage anchors: "<num>%"
  const pctMatch = text.match(/([\d,]+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const num = pctMatch[1].replace(/,/g, "");
    return `pct_${num}`;
  }
  
  // Multiplier anchors: "<num>x"
  const multMatch = text.match(/\b([\d,]+(?:\.\d+)?)\s*x\b/);
  if (multMatch) {
    const num = multMatch[1].replace(/,/g, "");
    return `mult_${num}x`;
  }
  
  // Qualitative anchors: discrete assertions
  if (/\bpre-?money\b/.test(text)) return canonicalizeAnchor("qual_premoney");
  if (/\bpost-?money\b/.test(text)) return canonicalizeAnchor("qual_postmoney");
  if (/\bsecondary\b.*\b(purchase|sale|transaction)\b/.test(text)) return canonicalizeAnchor("qual_secondary");
  if (/\bprofitable\b/.test(text)) return canonicalizeAnchor("qual_profitable");
  if (/\bbootstrapped\b/.test(text)) return canonicalizeAnchor("qual_bootstrapped");
  if (/\b1x\b.*\b(preferred|liquidation)\b/.test(text)) return canonicalizeAnchor("qual_1x_preferred");
  if (/\bpreferred\b/.test(text) && !/\b1x\b/.test(text)) return canonicalizeAnchor("qual_preferred");
  const seriesMatch = text.match(/\bSeries\s+([A-Z])\b/);
  if (seriesMatch) return canonicalizeAnchor(`qual_series_${seriesMatch[1].toLowerCase()}`);
  
  // A3.6.11: Valuation and enterprise value → qual_valuation
  if (/\bvaluation\b/.test(text)) return canonicalizeAnchor("qual_valuation");
  if (/\benterprise\s+value\b|\bev\b(?!\w)/.test(text)) return canonicalizeAnchor("qual_enterprise_value");
  
  // A3.6.12: Ownership - canonicalize with context to map qual_ownership to pct_* if percentage present
  if (/\bownership\b/.test(text) && !pctMatch) {
    const canonicalized = canonicalizeAnchor("qual_ownership", claimText);
    // If canonicalized to null or pct_*, return that; otherwise return null (qual_ownership forbidden)
    return canonicalized;
  }
  
  // Fallback: use first significant domain keyword
  const domainClass = extractDomainKeywordClass(claimText);
  if (domainClass !== "none") {
    return canonicalizeAnchor(`qual_${domainClass}`, claimText);
  }
  
  return null;
}

// A3.6.12: Canonical anchor allowlist for claim emission
const CANONICAL_ANCHOR_ALLOWLIST = new Set([
  // pct_* anchors
  ...Array.from({ length: 101 }, (_, i) => `pct_${i}`), // 0-100%
  // usd_* anchors (common ranges)
  ...Array.from({ length: 1000 }, (_, i) => `usd_${i + 1}m`), // 1m-1000m
  // qual_* anchors (canonical only)
  "qual_valuation",
  "qual_premoney",
  "qual_postmoney",
  "qual_secondary",
  "qual_fully_diluted",
  "qual_stake",
  "qual_financing",
  "qual_profitable",
  "qual_bootstrapped",
  "qual_1x_preferred",
  "qual_preferred",
  ...Array.from({ length: 26 }, (_, i) => `qual_series_${String.fromCharCode(97 + i)}`), // series_a-z
  // mult_* anchors
  ...Array.from({ length: 10 }, (_, i) => `mult_${i + 1}x`), // 1x-10x
]);

// Helper to check if anchor is canonical (supports dynamic pct/usd/mult patterns)
function isCanonicalAnchor(anchor) {
  if (typeof anchor !== "string") return false;
  
  // Check exact match first
  if (CANONICAL_ANCHOR_ALLOWLIST.has(anchor)) return true;
  
  // Dynamic patterns
  if (/^pct_\d+$/.test(anchor)) return true; // Any pct_* number
  if (/^usd_[\d.]+m$/.test(anchor)) return true; // Any usd_*m
  if (/^mult_[\d.]+x$/.test(anchor)) return true; // Any mult_*x
  
  return false;
}

// A3.6.4: Extract all distinct anchors from a clause text
// A3.6.8: Operate on ORIGINAL statement text (before any cleaning that might remove % or punctuation)
// A3.6.11: Canonical anchor taxonomy - maps all anchor variants to canonical forms
// A3.6.12: qual_ownership must never be emitted - canonicalize to null or map to pct_*
function canonicalizeAnchor(anchor, contextText = null) {
  if (typeof anchor !== "string") return anchor;
  
  // A3.6.12: qual_ownership must never reach claim creation
  // If qual_ownership, try to map to pct_* if percentage present, otherwise return null
  if (anchor === "qual_ownership") {
    if (contextText && typeof contextText === "string") {
      // Check if there's a percentage in the context
      const pctMatch = contextText.match(/(\d+(?:\.\d+)?)\s*%/);
      if (pctMatch) {
        const num = Math.floor(parseFloat(pctMatch[1]));
        return `pct_${num}`; // Map to pct_* anchor
      }
    }
    return null; // Skip qual_ownership - do not emit
  }
  
  // All valuation concepts → qual_valuation
  if (anchor === "qual_enterprise_value" || anchor === "qual_valuation") {
    return "qual_valuation";
  }
  
  // Pre-money / post-money → keep as-is (they represent specific valuation types)
  // But they should also have usd_* anchors if numeric values are present
  
  // Ownership percentages → pct_* only (no qual_ownership for percentages)
  // qual_ownership is kept only for non-percentage ownership mentions
  
  // All other anchors remain as-is
  return anchor;
}

// A3.6.11: Extract all anchors and canonicalize them
function extractAllAnchors(clauseText) {
  if (typeof clauseText !== "string") return [];
  
  // A3.6.8: Use original text (don't lowercase yet for anchor detection)
  const originalText = clauseText;
  const text = originalText.toLowerCase();
  
  const anchors = new Set();
  
  // Extract USD anchors
  const usdMatches = [...originalText.matchAll(/\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)/gi)];
  for (const match of usdMatches) {
    const numStr = match[1].replace(/,/g, "");
    const unit = (match[2] || "").toLowerCase();
    const num = parseFloat(numStr);
    
    if (Number.isFinite(num) && num > 0) {
      let normalized = num;
      if (unit.includes("billion") || unit === "b") {
        normalized = normalized * 1000;
      } else if (unit.includes("thousand") || unit === "k") {
        normalized = normalized / 1000;
      }
      anchors.add(`usd_${normalized}m`);
    }
  }
  
  // A3.6.8: Extract percentage anchors - normalize 31 -> pct_31; 20.0 -> pct_20
  const pctMatches = [...originalText.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  for (const match of pctMatches) {
    const numStr = match[1].replace(/,/g, "");
    const num = parseFloat(numStr);
    // Normalize: remove trailing .0, keep integer part
    const normalizedNum = Number.isFinite(num) ? Math.floor(num).toString() : numStr;
    anchors.add(`pct_${normalizedNum}`);
  }
  
  // Extract multiplier anchors
  const multMatches = [...originalText.matchAll(/\b([\d,]+(?:\.\d+)?)\s*x\b/g)];
  for (const match of multMatches) {
    const num = match[1].replace(/,/g, "");
    anchors.add(`mult_${num}x`);
  }
  
  // A3.6.8: Extract qualitative anchors - include at least: secondary, pre-money, post-money, fully diluted, ownership, stake, series a, financing, valuation, enterprise value
  if (/\bpre-?money\b/i.test(originalText)) anchors.add("qual_premoney");
  if (/\bpost-?money\b/i.test(originalText)) anchors.add("qual_postmoney");
  if (/\bsecondary\b/i.test(originalText)) anchors.add("qual_secondary"); // A3.6.8: Simplified - just "secondary" is enough
  if (/\bfully\s+diluted\b/i.test(originalText)) anchors.add("qual_fully_diluted");
  if (/\bownership\b/i.test(originalText)) anchors.add("qual_ownership");
  if (/\bstake\b/i.test(originalText)) anchors.add("qual_stake");
  if (/\bSeries\s+([A-Z])\b/.test(originalText)) {
    const seriesMatch = originalText.match(/\bSeries\s+([A-Z])\b/);
    if (seriesMatch) anchors.add(`qual_series_${seriesMatch[1].toLowerCase()}`);
  }
  if (/\bfinancing\b/i.test(originalText)) anchors.add("qual_financing");
  if (/\bvaluation\b/i.test(originalText)) anchors.add("qual_valuation");
  if (/\benterprise\s+value\b|\bev\b(?!\w)/i.test(originalText)) anchors.add("qual_enterprise_value");
  if (/\bprofitable\b/i.test(originalText)) anchors.add("qual_profitable");
  if (/\bbootstrapped\b/i.test(originalText)) anchors.add("qual_bootstrapped");
  if (/\b1x\b.*\b(preferred|liquidation)\b/i.test(originalText)) anchors.add("qual_1x_preferred");
  if (/\bpreferred\b/i.test(originalText) && !/\b1x\b/i.test(originalText)) anchors.add("qual_preferred");
  
  // A3.6.11: Canonicalize all anchors before returning
  const canonicalAnchors = Array.from(anchors).map(canonicalizeAnchor);
  // A3.6.13: Filter null and non-string anchors immediately after canonicalization
  const filteredAnchors = canonicalAnchors.filter(anchor => 
    anchor !== null && anchor !== undefined && typeof anchor === "string" && anchor.length > 0
  );
  return Array.from(new Set(filteredAnchors)); // Remove duplicates after canonicalization
}

// A3.6.4: Split clause to isolate single-anchor sub-clause containing target anchor
function splitClauseToIsolateAnchor(clauseText, targetAnchor, triggerIndex, clauseStart, clauseEnd, fullText) {
  if (typeof clauseText !== "string") return null;
  
  // Extract all anchors from the clause
  const allAnchors = extractAllAnchors(clauseText);
  
  // If clause has only one anchor (or none), return as-is
  if (allAnchors.length <= 1) {
    return { text: clauseText, start: clauseStart, end: clauseEnd };
  }
  
  // A3.6.4: Determine target anchor from trigger
  // Extract anchor from the trigger text at triggerIndex
  const triggerText = fullText.substring(
    Math.max(0, triggerIndex - 50),
    Math.min(fullText.length, triggerIndex + 50)
  );
  const triggerAnchor = extractAnchor(triggerText);
  
  // If we can't determine target anchor, try to find it in the clause
  const effectiveTargetAnchor = triggerAnchor || targetAnchor;
  
  // If still no target anchor, return original clause (can't split without target)
  if (!effectiveTargetAnchor) {
    return { text: clauseText, start: clauseStart, end: clauseEnd };
  }
  
  // Check if target anchor is in the clause
  if (!allAnchors.includes(effectiveTargetAnchor)) {
    // Target anchor not found, return original clause
    return { text: clauseText, start: clauseStart, end: clauseEnd };
  }
  
  // A3.6.4: Split on conjunction/connector tokens
  const splitPatterns = [
    /\s+and\s+/i,
    /\s+or\s+/i,
    /\s+with\s+/i,
    /\s+plus\s+/i,
    /\s+as well as\s+/i,
    /\s+potential to\s+/i,
    /\s+via\s+/i,
    /\s+through\s+/i,
    /,\s+/g, // Commas
  ];
  
  let bestSubClause = null;
  let bestSubClauseSize = Infinity;
  
  // Try splitting on each pattern
  for (const pattern of splitPatterns) {
    const parts = clauseText.split(pattern);
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length < 5) continue; // Skip very short fragments
      
      // Check if this sub-clause contains the target anchor
      const subAnchors = extractAllAnchors(trimmed);
      if (subAnchors.includes(effectiveTargetAnchor)) {
        // Check if it has fewer anchors than the original
        if (subAnchors.length < allAnchors.length) {
          // This is a better candidate - smaller and contains target
          if (trimmed.length < bestSubClauseSize) {
            bestSubClauseSize = trimmed.length;
            bestSubClause = trimmed;
          }
        }
      }
    }
  }
  
  // If we found a better sub-clause, use it
  if (bestSubClause) {
    // Find the position of this sub-clause in the original text
    const subClauseIndex = clauseText.indexOf(bestSubClause);
    if (subClauseIndex >= 0) {
      return {
        text: bestSubClause,
        start: clauseStart + subClauseIndex,
        end: clauseStart + subClauseIndex + bestSubClause.length,
      };
    }
  }
  
  // Fallback: if clause contains multiple anchors but we can't split cleanly,
  // try to find the smallest window around the trigger that contains only the target anchor
  // This is a last resort to prevent cross-anchor contamination
  const triggerInClause = triggerIndex - clauseStart;
  if (triggerInClause >= 0 && triggerInClause < clauseText.length) {
    // Try expanding from trigger position to find minimal single-anchor window
    let windowStart = Math.max(0, triggerInClause - 30);
    let windowEnd = Math.min(clauseText.length, triggerInClause + 30);
    
    // Expand window until we find boundaries or hit clause edges
    while (windowStart > 0 || windowEnd < clauseText.length) {
      const windowText = clauseText.substring(windowStart, windowEnd);
      const windowAnchors = extractAllAnchors(windowText);
      
      // If window has only target anchor, use it
      if (windowAnchors.length === 1 && windowAnchors[0] === effectiveTargetAnchor) {
        return {
          text: windowText.trim(),
          start: clauseStart + windowStart,
          end: clauseStart + windowEnd,
        };
      }
      
      // Expand window
      if (windowStart > 0) windowStart = Math.max(0, windowStart - 10);
      if (windowEnd < clauseText.length) windowEnd = Math.min(clauseText.length, windowEnd + 10);
      
      // Safety: don't expand beyond clause
      if (windowStart === 0 && windowEnd === clauseText.length) break;
    }
  }
  
  // Last resort: return original clause (better than nothing)
  return { text: clauseText, start: clauseStart, end: clauseEnd };
}

// A3.6.11: Build normalized meaning key (strips numbers, stopwords, collapses whitespace, lowercases)
function buildNormalizedMeaningKey(claimText) {
  if (typeof claimText !== "string") return "";
  
  let normalized = claimText.toLowerCase();
  
  // A3.6.15: Strip generic lead-in boilerplate before anchor-bearing tokens
  // Anchor-bearing tokens: currency/number ($, digits), percent (%), uppercase/proper-noun runs
  // Find the first anchor-bearing token and remove everything before it
  const anchorBearingPattern = /(\$|[\d,]+(?:\.\d+)?\s*%|[\d,]+(?:\.\d+)?\s*(?:million|mm|m\b|billion|b\b|thousand|k\b)|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;
  const anchorMatch = normalized.match(anchorBearingPattern);
  if (anchorMatch && anchorMatch.index > 0) {
    // Remove everything before the first anchor-bearing token
    normalized = normalized.substring(anchorMatch.index);
  }
  
  // Strip numbers (but keep anchor-bearing structure)
  normalized = normalized.replace(/[\d,]+(?:\.\d+)?/g, "");
  
  // Strip stopwords and boilerplate phrases
  const stopwords = /\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by|from|as|is|was|are|were|be|been|being|have|has|had|do|does|did|will|would|should|could|may|might|can|must|this|that|these|those|it|its|they|them|their|we|our|us)\b/gi;
  normalized = normalized.replace(stopwords, " ");
  
  // A3.6.14: Remove generic boilerplate phrases that cause duplicate claims
  const boilerplatePhrases = [
    /\bthe firm\b/gi,
    /\bis evaluating\b/gi,
    /\bevaluating\b/gi,
    /\binvestment\b/gi,
    /\bof up to\b/gi,
    /\bfinancing\b/gi,
  ];
  for (const phrase of boilerplatePhrases) {
    normalized = normalized.replace(phrase, " ");
  }
  
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, " ").trim();
  
  return normalized;
}

// A3.6.2 ADDENDUM: Build meaning-based uniqueness key (anchor + meaning)
function buildMeaningKey(claimText) {
  const anchor = extractAnchor(claimText);
  const verbClass = extractVerbClass(claimText);
  const domainKeywordClass = extractDomainKeywordClass(claimText);
  const entityKey = extractEntityKey(claimText);
  
  // Effective uniqueness key: anchor + verbClass + domainKeywordClass + entityKey
  const parts = [
    anchor || "no_anchor",
    verbClass,
    domainKeywordClass,
    entityKey || "no_entity"
  ];
  
  return parts.join("|");
}

// A3.6.1: Aggregate claims by key (merge overlapping claims)
// A3.6.2 ADDENDUM: Now uses anchor + meaning (not anchor-only)
// A3.6.9: Dedupe key must include anchor - never merge claims with different anchors
function aggregateClaimsByKey(rawCandidates) {
  if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) {
    return [];
  }
  
  // A3.6.9: Map<anchor|normalizedPrefix, ClaimAgg> - groups by anchor + normalized text prefix
  const aggregated = new Map();
  
  for (const candidate of rawCandidates) {
    if (!candidate || typeof candidate.claimText !== "string") {
      continue;
    }
    
    // A3.6.12: Extract anchor first - canonicalize it (with context for qual_ownership mapping)
    const rawAnchor = candidate.anchor || extractAnchor(candidate.claimText) || "no_anchor";
    const canonicalAnchor = canonicalizeAnchor(rawAnchor, candidate.claimText);
    
    // A3.6.12: Skip if canonicalization resulted in null (e.g., qual_ownership without pct)
    if (!canonicalAnchor) {
      continue;
    }
    
    // A3.6.12: Build normalized meaning key (strips numbers, stopwords, collapses whitespace)
    const normalizedMeaningKey = buildNormalizedMeaningKey(candidate.claimText);
    
    // A3.6.12: Primary uniqueness key: canonicalAnchor + '|' + normalizedMeaningKey
    const dedupeKey = `${canonicalAnchor}|${normalizedMeaningKey}`;
    
    if (!aggregated.has(dedupeKey)) {
      aggregated.set(dedupeKey, {
        claimText: candidate.claimText,
        facet: candidate.facet || "Other", // Preserve facet for backward compatibility
        anchor: canonicalAnchor, // Store canonical anchor
        candidates: [candidate],
      });
    } else {
      const existing = aggregated.get(dedupeKey);
      
      // A3.6.12: Hard guard - never merge claims with different canonical anchors
      // (This should not happen since dedupeKey includes canonicalAnchor, but double-check)
      if (existing.anchor !== canonicalAnchor) {
        // Different anchors - create separate entry
        // Use a more specific key to avoid collision
        const specificKey = `${dedupeKey}_${aggregated.size}`;
        aggregated.set(specificKey, {
          claimText: candidate.claimText,
          facet: candidate.facet || "Other",
          anchor: canonicalAnchor,
          candidates: [candidate],
        });
        continue;
      }
      
      existing.candidates.push(candidate);
      
      // Select "best" representative claimText using selection rule
      // (Only when claims are semantically equivalent - same anchor + meaning)
      const best = selectBestClaimText(existing.candidates.map(c => c.claimText));
      existing.claimText = best;
    }
  }
  
  // Convert to array - each entry is a unique anchor + meaning combination
  return Array.from(aggregated.values()).map(agg => ({
    claimText: agg.claimText,
    facet: agg.facet,
    claimKey: buildClaimKey(agg.claimText, agg.facet), // Preserve for backward compatibility
    anchor: agg.anchor, // A3.6.10: Preserve explicit anchor
    mergedCount: agg.candidates.length,
  }));
}

// A3.6.1: Select best claimText from candidates
function selectBestClaimText(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }
  
  if (candidates.length === 1) {
    return candidates[0];
  }
  
  // Selection rule (deterministic):
  // - Prefer claimText length between 10 and 60 chars
  // - Prefer fewer commas
  // - Prefer presence of anchor token (e.g., $5m, 20%, 31%, 1x, pre-money)
  // - If tie: choose shortest
  
  const scored = candidates.map(text => {
    if (typeof text !== "string") return { text, score: -1 };
    
    const length = text.length;
    const commaCount = (text.match(/,/g) || []).length;
    const hasAnchor = /\$[\d,]+(?:\.\d+)?\s*m\b|[\d,]+(?:\.\d+)?\s*%|\b1x\b|pre-?money/i.test(text);
    
    let score = 0;
    
    // Length preference: 10-60 chars is best
    if (length >= 10 && length <= 60) {
      score += 100;
    } else if (length < 10) {
      score -= 50; // Too short
    } else {
      score -= (length - 60) * 2; // Penalize long
    }
    
    // Fewer commas is better
    score -= commaCount * 10;
    
    // Anchor presence is good
    if (hasAnchor) {
      score += 50;
    }
    
    return { text, score, length };
  });
  
  // Sort by score (desc), then by length (asc)
  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.length - b.length;
  });
  
  return scored[0].text;
}

// A3.6.1: Apply facet caps to claims
function applyFacetCaps(claims, runId = null, reqSig = null, idx = 0) {
  if (!Array.isArray(claims)) {
    return [];
  }
  
  const caps = {
    Investment: 2,
    Valuation: 1,
    Structure: 1,
    Ownership: 2,
    Timing: 1,
    Other: 1,
  };
  
  // Group by facet
  const byFacet = new Map();
  for (const claim of claims) {
    const facet = claim.facet || "Other";
    if (!byFacet.has(facet)) {
      byFacet.set(facet, []);
    }
    byFacet.get(facet).push(claim);
  }
  
  const result = [];
  
  for (const [facet, facetClaims] of byFacet.entries()) {
    const cap = caps[facet] || 1;
    
    if (facetClaims.length <= cap) {
      result.push(...facetClaims);
    } else {
      // Keep "best" using same selection heuristic
      // Sort by selection score
      const scored = facetClaims.map(claim => {
        const text = claim.claimText || "";
        const length = text.length;
        const commaCount = (text.match(/,/g) || []).length;
        const hasAnchor = /\$[\d,]+(?:\.\d+)?\s*m\b|[\d,]+(?:\.\d+)?\s*%|\b1x\b|pre-?money/i.test(text);
        
        // A3.6.18: Prefer qual_valuation over usd_* for valuation facet
        const anchor = claim.anchor || extractAnchor(text);
        const canonicalAnchor = canonicalizeAnchor(anchor, text);
        const isQualValuation = canonicalAnchor === "qual_valuation";
        const isUsdValuation = canonicalAnchor && canonicalAnchor.startsWith("usd_") && facet === "Valuation";
        
        let score = 0;
        if (length >= 10 && length <= 60) score += 100;
        else if (length < 10) score -= 50;
        else score -= (length - 60) * 2;
        score -= commaCount * 10;
        if (hasAnchor) score += 50;
        
        // A3.6.18: Boost qual_valuation, penalize usd_* when both exist for valuation
        if (isQualValuation) {
          score += 200; // Strong preference for qual_valuation
        } else if (isUsdValuation) {
          // Check if there's also a qual_valuation in the same facet
          const hasQualValuation = facetClaims.some(c => {
            const cAnchor = c.anchor || extractAnchor(c.claimText);
            const cCanonical = canonicalizeAnchor(cAnchor, c.claimText);
            return cCanonical === "qual_valuation";
          });
          if (hasQualValuation) {
            score -= 100; // Prefer to drop usd_* if qual_valuation exists
          }
        }
        
        return { claim, score, length };
      });
      
      scored.sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.length - b.length;
      });
      
      const kept = scored.slice(0, cap).map(s => s.claim);
      const dropped = scored.slice(cap);
      
      result.push(...kept);
      
      // Log if dropped
      if (dropped.length > 0 && runId && reqSig) {
        diag(runId, reqSig, `[CLAIMS_CAP] idx=${idx} facet=${facet} kept=${kept.length} dropped=${dropped.length}`);
      }
    }
  }
  
  return result;
}

// A3.6.0: Extract atomic claims from statement text (deterministic, no LLM)
function extractAtomicClaims(statementText, bestValSnip = "") {
  if (typeof statementText !== "string" || !statementText.trim()) return [];
  
  const text = statementText.trim();
  const claims = [];
  
  // Trigger patterns for atomic claim candidates
  const claimTriggers = [
    // Numeric anchors
    /\$[\d,]+(?:\.\d+)?\s*(?:million|mm|billion|b|thousand|k)?/gi,
    /[\d,]+(?:\.\d+)?\s*%/g,
    /\b[\d,]+(?:\.\d+)?x\b/gi,
    // Valuation terms
    /\b(?:valuation|pre-money|post-money|premoney|postmoney|EV|enterprise value)\b/gi,
    // Structure terms
    /\b(?:preferred|1x|liquidation|liquidation preference|structured|structured as)\b/gi,
    // Ownership terms
    /\b(?:ownership|stake|fully diluted|fully-diluted)\b/gi,
    // Transaction terms
    /\b(?:Series [A-Z]|Series [a-z]|secondary|common shares|secondary purchase|secondary sale)\b/gi,
  ];
  
  // Find all trigger positions
  const triggerPositions = [];
  for (const pattern of claimTriggers) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      triggerPositions.push({
        index: match.index,
        text: match[0],
        length: match[0].length,
      });
    }
  }
  
  // Sort by position
  triggerPositions.sort((a, b) => a.index - b.index);
  
  // A3.6.2 PATCH: Clause-based extraction (not index-based slicing)
  // Split statement into clause candidates using stable separators
  const clauseSeparators = /([,;—()]|\s+and\s+|\s+with\s+|\s+through\s+|\s+at\s+|\s+for\s+)/gi;
  const clauses = [];
  let lastIndex = 0;
  let match;
  
  // Find all clause boundaries
  const boundaries = [0];
  while ((match = clauseSeparators.exec(text)) !== null) {
    boundaries.push(match.index);
    boundaries.push(match.index + match[0].length);
  }
  boundaries.push(text.length);
  
  // Build clauses from boundaries
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const clause = text.substring(start, end).trim();
    if (clause.length > 0) {
      clauses.push({ text: clause, start, end });
    }
  }
  
  // A3.6.5: Extract ALL anchors from statement first (not just triggers)
  const allAnchorsInStatement = extractAllAnchors(text);
  
  // A3.6.5: Build anchor-to-trigger mapping
  const anchorToTriggers = new Map();
  for (const trigger of triggerPositions) {
    const triggerText = text.substring(
      Math.max(0, trigger.index - 30),
      Math.min(text.length, trigger.index + trigger.length + 30)
    );
    const anchor = extractAnchor(triggerText);
    if (anchor) {
      if (!anchorToTriggers.has(anchor)) {
        anchorToTriggers.set(anchor, []);
      }
      anchorToTriggers.get(anchor).push(trigger);
    }
  }
  
  // A3.6.5: For each unique anchor, ensure we emit at least one claim
  const usedClauses = new Set();
  const anchorsProcessed = new Set();
  
  // Process triggers first (existing logic)
  for (const trigger of triggerPositions) {
    // Find clauses that contain this trigger
    const containingClauses = clauses
      .filter(c => c.start <= trigger.index && c.end >= trigger.index + trigger.length)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start)); // Prefer smaller clauses
    
    if (containingClauses.length > 0) {
      // Pick the earliest smallest clause
      const selectedClause = containingClauses[0];
      
      // A3.6.4: Extract target anchor from trigger to prevent cross-anchor merges
      const triggerText = text.substring(
        Math.max(0, trigger.index - 30),
        Math.min(text.length, trigger.index + trigger.length + 30)
      );
      const targetAnchor = extractAnchor(triggerText);
      
      if (targetAnchor) {
        anchorsProcessed.add(targetAnchor);
      }
      
      // A3.6.4: Check if clause contains multiple anchors and split if needed
      const isolatedClause = splitClauseToIsolateAnchor(
        selectedClause.text,
        targetAnchor,
        trigger.index,
        selectedClause.start,
        selectedClause.end,
        text
      );
      
      if (!isolatedClause) continue;
      
      const clauseKey = `${isolatedClause.start}-${isolatedClause.end}`;
      
      if (!usedClauses.has(clauseKey)) {
        usedClauses.add(clauseKey);
        let snippet = isolatedClause.text;
        
        // Clean up: remove leading/trailing punctuation, normalize spacing
        snippet = snippet.replace(/^[^\w$%]+/, "").replace(/[^\w$%]+$/, "").replace(/\s+/g, " ").trim();
        
        // A3.6.10: Validate not mid-token - expand to word boundaries
        // Check if snippet starts mid-word (has alphanumeric before start position)
        const beforeChar = isolatedClause.start > 0 ? text[isolatedClause.start - 1] : null;
        if (beforeChar && /\w/.test(beforeChar)) {
          // Start is mid-word, expand left to word boundary
          let expandedStart = isolatedClause.start;
          while (expandedStart > 0 && /\w/.test(text[expandedStart - 1])) {
            expandedStart--;
          }
          // Re-extract snippet with expanded start
          snippet = text.substring(expandedStart, isolatedClause.end).trim();
        }
        
        // Check if snippet ends mid-word (has alphanumeric after end position)
        const afterChar = isolatedClause.end < text.length ? text[isolatedClause.end] : null;
        if (afterChar && /\w/.test(afterChar)) {
          // End is mid-word, expand right to word boundary
          let expandedEnd = isolatedClause.end;
          while (expandedEnd < text.length && /\w/.test(text[expandedEnd])) {
            expandedEnd++;
          }
          // Re-extract snippet with expanded end
          snippet = text.substring(isolatedClause.start, expandedEnd).trim();
        }
        
        // A3.6.10: Final check - if snippet still starts with lowercase mid-word pattern, use sentence boundary
        if (snippet.length > 0 && /^[a-z]/.test(snippet)) {
          const beforeChar2 = isolatedClause.start > 0 ? text[isolatedClause.start - 1] : null;
          if (beforeChar2 && /\w/.test(beforeChar2)) {
            // Likely mid-token, use larger context or full sentence
            const sentenceStart = Math.max(0, text.lastIndexOf(".", isolatedClause.start) + 1);
            const sentenceEnd = Math.min(text.length, text.indexOf(".", isolatedClause.end) + 1);
            if (sentenceEnd > sentenceStart) {
              snippet = text.substring(sentenceStart, sentenceEnd).trim();
            }
          }
        }
        
        // A3.6.2 PATCH v2: Preserve original claimText verbatim (trim only)
        // Do NOT normalize money values here - extractAnchor will handle normalization
        // Only normalize spacing and remove artifacts
        snippet = snippet.replace(/\bup to\b/gi, "up to");
        snippet = snippet.replace(/\broughly\b|\bapproximately\b/gi, "~");
        // DO NOT normalize "$7 million" to "$7m" here - preserve original
        
        // A3.6.4: Final validation - ensure snippet contains target anchor (or at least one anchor)
        const snippetAnchors = extractAllAnchors(snippet);
        if (targetAnchor && !snippetAnchors.includes(targetAnchor)) {
          // Target anchor lost during splitting, skip this claim
          continue;
        }
        
        if (snippet.length > 0 && snippet.length < 150) {
          // A3.6.10: Store anchor explicitly with claim snippet
          claims.push({ text: snippet, anchor: targetAnchor });
        }
      }
    }
  }
  
  // A3.6.8: For any anchors not yet processed, find and emit claims with word-boundary expansion
  for (const anchor of allAnchorsInStatement) {
    // A3.6.13: Defensive guard - skip null, undefined, or non-string anchors
    if (!anchor || typeof anchor !== "string" || anchor.length === 0) continue;
    if (anchorsProcessed.has(anchor)) continue; // Already processed
    
    // Find the first occurrence of this anchor in the text
    let anchorIndex = -1;
    let anchorMatch = null;
    
    if (anchor.startsWith("usd_")) {
      const numMatch = anchor.match(/usd_([\d.]+)m/);
      if (numMatch) {
        const num = numMatch[1];
        // Search for $X million/mm/m pattern
        const patterns = [
          new RegExp(`\\$${num.replace(/\./g, "\\.")}\\s*(?:million|mm|m\\b)`, "i"),
          new RegExp(`\\$${num}\\s*(?:million|mm|m\\b)`, "i"),
        ];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            anchorIndex = match.index;
            anchorMatch = match[0];
            break;
          }
        }
      }
    } else if (anchor.startsWith("pct_")) {
      const numMatch = anchor.match(/pct_([\d.]+)/);
      if (numMatch) {
        const num = numMatch[1];
        // A3.6.8: Match percentage with optional decimal
        const pattern = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%`);
        const match = text.match(pattern);
        if (match && Math.floor(parseFloat(match[1])) === parseInt(num)) {
          anchorIndex = match.index;
          anchorMatch = match[0];
        }
      }
    } else if (anchor.startsWith("qual_")) {
      // A3.6.8: For qualitative anchors, search for keywords with expanded patterns
      const qualType = anchor.replace("qual_", "");
      const qualPatterns = {
        secondary: /\bsecondary\b/i,
        premoney: /\bpre-?money\b/i,
        postmoney: /\bpost-?money\b/i,
        fully_diluted: /\bfully\s+diluted\b/i,
        ownership: /\bownership\b/i,
        stake: /\bstake\b/i,
        financing: /\bfinancing\b/i,
        // A3.6.14: qual_valuation matches both "valuation" and "enterprise value" (canonicalized from qual_enterprise_value)
        valuation: /\b(?:valuation|enterprise\s+value|ev\b(?!\w))\b/i,
        enterprise_value: /\benterprise\s+value\b|\bev\b(?!\w)/i,
        profitable: /\bprofitable\b/i,
        bootstrapped: /\bbootstrapped\b/i,
        "1x_preferred": /\b1x\b.*\b(preferred|liquidation)\b/i,
        preferred: /\bpreferred\b/i,
      };
      const pattern = qualPatterns[qualType];
      if (pattern) {
        const match = text.match(pattern);
        if (match) {
          anchorIndex = match.index;
          anchorMatch = match[0];
        }
      }
      // Handle series anchors
      if (qualType.startsWith("series_")) {
        const seriesLetter = qualType.replace("series_", "");
        const seriesPattern = new RegExp(`\\bSeries\\s+${seriesLetter}\\b`, "i");
        const match = text.match(seriesPattern);
        if (match) {
          anchorIndex = match.index;
          anchorMatch = match[0];
        }
      }
    }
    
    if (anchorIndex >= 0) {
      // A3.6.14: For qual_valuation, expand window to include numeric values (USD amounts)
      let windowSize = 60;
      if (anchor === "qual_valuation") {
        // Look for numeric values within ±80 chars of the anchor
        windowSize = 80;
      }
      
      // A3.6.10: Build snippet around anchor (±windowSize chars) BUT expand to word boundaries
      const snippetStart = Math.max(0, anchorIndex - windowSize);
      const snippetEnd = Math.min(text.length, anchorIndex + (anchorMatch ? anchorMatch.length : 0) + windowSize);
      
      // A3.6.10: Expand to word boundaries - move start left to previous whitespace/punctuation boundary
      let expandedStart = snippetStart;
      while (expandedStart > 0 && /\w/.test(text[expandedStart - 1])) {
        expandedStart--;
      }
      // Move end right to next whitespace/punctuation boundary
      let expandedEnd = snippetEnd;
      while (expandedEnd < text.length && /\w/.test(text[expandedEnd])) {
        expandedEnd++;
      }
      
      let snippet = text.substring(expandedStart, expandedEnd).trim();
      let finalExpandedStart = expandedStart;
      let finalExpandedEnd = expandedEnd;
      
      // A3.6.14: For qual_valuation, ensure snippet includes numeric value (USD amount) if present
      if (anchor === "qual_valuation") {
        // Look for USD amount patterns near the anchor
        const usdPattern = /\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m\b|billion|b\b|thousand|k\b)/i;
        const snippetUsdMatch = snippet.match(usdPattern);
        if (!snippetUsdMatch) {
          // Try to expand snippet to include USD amount if it's nearby
          const expandedUsdStart = Math.max(0, expandedStart - 40);
          const expandedUsdEnd = Math.min(text.length, expandedEnd + 40);
          const expandedText = text.substring(expandedUsdStart, expandedUsdEnd);
          const expandedUsdMatch = expandedText.match(usdPattern);
          if (expandedUsdMatch) {
            // Find the position of the USD match in the full text
            const usdMatchIndex = expandedUsdStart + expandedText.indexOf(expandedUsdMatch[0]);
            // Create a snippet that includes both the anchor and the USD amount
            const newStart = Math.min(expandedStart, usdMatchIndex - 20);
            const newEnd = Math.max(expandedEnd, usdMatchIndex + expandedUsdMatch[0].length + 20);
            // Expand to word boundaries
            let newExpandedStart = newStart;
            while (newExpandedStart > 0 && /\w/.test(text[newExpandedStart - 1])) {
              newExpandedStart--;
            }
            let newExpandedEnd = newEnd;
            while (newExpandedEnd < text.length && /\w/.test(text[newExpandedEnd])) {
              newExpandedEnd++;
            }
            snippet = text.substring(newExpandedStart, newExpandedEnd).trim();
            finalExpandedStart = newExpandedStart;
            finalExpandedEnd = newExpandedEnd;
          }
        }
      }
      
      // A3.6.10: Final validation - ensure snippet doesn't start mid-word
      if (snippet.length > 0 && /^[a-z]/.test(snippet)) {
        const beforeChar = finalExpandedStart > 0 ? text[finalExpandedStart - 1] : null;
          if (beforeChar && /\w/.test(beforeChar)) {
          // Still mid-word, expand to sentence boundary
          const sentenceStart = Math.max(0, text.lastIndexOf(".", finalExpandedStart) + 1);
          const sentenceEnd = Math.min(text.length, text.indexOf(".", finalExpandedEnd) + 1);
          if (sentenceEnd > sentenceStart) {
            snippet = text.substring(sentenceStart, sentenceEnd).trim();
          }
        }
      }
      
      // A3.6.10: Ensure snippet contains the anchor and does not include OTHER anchors if possible
      const snippetAnchors = extractAllAnchors(snippet);
      if (snippetAnchors.includes(anchor)) {
        // A3.6.10: If snippet contains multiple anchors, try to split to smallest containing only target anchor
        if (snippetAnchors.length > 1) {
          // Try to find a smaller window around just this anchor
          const anchorPos = snippet.indexOf(anchorMatch || anchor);
          if (anchorPos >= 0) {
            // Start with narrow window and expand if needed
            let narrowStart = Math.max(0, anchorPos - 30);
            let narrowEnd = Math.min(snippet.length, anchorPos + (anchorMatch ? anchorMatch.length : 10) + 30);
            
            // Expand to word boundaries
            let narrowExpandedStart = narrowStart;
            while (narrowExpandedStart > 0 && /\w/.test(snippet[narrowExpandedStart - 1])) {
              narrowExpandedStart--;
            }
            let narrowExpandedEnd = narrowEnd;
            while (narrowExpandedEnd < snippet.length && /\w/.test(snippet[narrowExpandedEnd])) {
              narrowExpandedEnd++;
            }
            
            const narrowSnippet = snippet.substring(narrowExpandedStart, narrowExpandedEnd).trim();
            const narrowAnchors = extractAllAnchors(narrowSnippet);
            // A3.6.10: Use narrow snippet only if it contains target anchor and has fewer anchors
            if (narrowAnchors.includes(anchor) && narrowAnchors.length < snippetAnchors.length) {
              snippet = narrowSnippet;
            }
            // A3.6.10: If narrow snippet still has multiple anchors, try splitting on separators
            if (narrowAnchors.length > 1 && narrowAnchors.includes(anchor)) {
              const splitPatterns = [/\s+and\s+/i, /\s+,\s+/, /\s+with\s+/i];
              for (const pattern of splitPatterns) {
                const parts = narrowSnippet.split(pattern);
                for (const part of parts) {
                  const trimmed = part.trim();
                  if (trimmed.length < 5) continue;
                  const partAnchors = extractAllAnchors(trimmed);
                  if (partAnchors.includes(anchor) && partAnchors.length === 1) {
                    snippet = trimmed;
                    break;
                  }
                }
                if (extractAllAnchors(snippet).length === 1) break;
              }
            }
          }
        }
        
        // Clean up snippet
        snippet = snippet.replace(/^[^\w$%]+/, "").replace(/[^\w$%]+$/, "").replace(/\s+/g, " ").trim();
        snippet = snippet.replace(/\bup to\b/gi, "up to");
        snippet = snippet.replace(/\broughly\b|\bapproximately\b/gi, "~");
        
        // A3.6.16: Apply sanitizer for qual_valuation before final check
        let sanitizedSnippet = snippet;
        if (anchor === "qual_valuation") {
          const beforeSanitize = snippet;
          sanitizedSnippet = stripDanglingNumericTail(snippet);
          
          // A3.6.16: Diagnostic for primary extraction
          // Note: runId and reqSig are not available here, so we'll add diagnostic at call site
          snippet = sanitizedSnippet;
        }
        
        // A3.6.10: Final check - ensure snippet still contains target anchor after cleaning
        const finalAnchors = extractAllAnchors(snippet);
        if (finalAnchors.includes(anchor) && snippet.length > 0 && snippet.length < 150) {
          // A3.6.10: Store anchor explicitly with claim snippet
          claims.push({ text: snippet, anchor: anchor });
          anchorsProcessed.add(anchor);
        } else if (anchor === "qual_valuation") {
          // A3.6.19: Two-phase retry for qual_valuation
          // Phase 1: Try primary extraction
          let primaryAttempt = tryBuildQualValuationClaimText(snippet, "primary");
          let finalSnippet = "";
          let usedBestValSnip = false;
          let retryDebug = null;
          
          if (primaryAttempt.claimText.length > 0) {
            // Primary succeeded
            finalSnippet = primaryAttempt.claimText;
          } else if (bestValSnip && bestValSnip.length > 0) {
            // Phase 2: Retry with bestValSnip
            const bestAttempt = tryBuildQualValuationClaimText(bestValSnip, "best");
            retryDebug = {
              primaryFinalLen: primaryAttempt.claimText.length,
              bestLen: bestValSnip.length,
              bestAttemptLen: bestAttempt.claimText.length,
              bestReason: bestAttempt.debug.reason
            };
            
            if (bestAttempt.claimText.length > 0) {
              finalSnippet = bestAttempt.claimText;
              usedBestValSnip = true;
            } else {
              // Both failed - try legacy fallback as last resort
              const fallbackSnippet = extractValuationFallbackSnippet(text, anchor, null, null, null);
              if (fallbackSnippet && fallbackSnippet.length > 0 && fallbackSnippet.length < 150) {
                finalSnippet = fallbackSnippet;
              }
            }
          } else {
            // No bestValSnip, try legacy fallback
            const fallbackSnippet = extractValuationFallbackSnippet(text, anchor, null, null, null);
            if (fallbackSnippet && fallbackSnippet.length > 0 && fallbackSnippet.length < 150) {
              finalSnippet = fallbackSnippet;
            }
          }
          
          if (finalSnippet && finalSnippet.length > 0 && finalSnippet.length < 150) {
            // A3.6.18: Store flag indicating bestValSnip was used (for diagnostics)
            const claimEntry = { text: finalSnippet, anchor: anchor };
            if (usedBestValSnip) {
              claimEntry._usedBestValSnip = true;
            }
            if (retryDebug) {
              claimEntry._retryDebug = retryDebug;
            }
            claims.push(claimEntry);
            anchorsProcessed.add(anchor);
          }
        }
      }
    }
  }
  
  // A3.6.1: Clean, assign facet, and prepare for aggregation
  // A3.6.2 PATCH v2: Add diagnostics for money extraction
  const rawCandidates = [];
  const shouldLogExtraction = false; // Set to true for debugging
  
  for (const claimEntry of claims) {
    // A3.6.10: Handle both string and object format (backward compatibility)
    const claimText = typeof claimEntry === "string" ? claimEntry : claimEntry.text;
    const claimAnchor = typeof claimEntry === "object" && claimEntry.anchor ? claimEntry.anchor : null;
    
    // A3.6.2 PATCH v2: Log original clause before cleaning (for diagnostics)
    if (shouldLogExtraction) {
      const moneyMatch = claimText.match(/\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m|billion|b)/i);
      if (moneyMatch) {
        const contextStart = Math.max(0, claimText.indexOf("$") - 40);
        const contextEnd = Math.min(claimText.length, claimText.indexOf("$") + 80);
        console.log(`[CLAIMS_EXTRACT] original_clause="${claimText.substring(contextStart, contextEnd)}"`);
      }
    }
    
    // Clean claimText (preserves money values)
    const cleaned = cleanClaimText(claimText);
    if (!cleaned) continue; // Skip empty after cleaning
    
    // A3.6.2 PATCH v2: Validate money extraction
    const originalMoney = claimText.match(/\$([\d,]+(?:\.\d+)?)\s*(?:million|mm|m|million|billion|b)/i);
    const cleanedMoney = cleaned.match(/\$([\d,]+(?:\.\d+)?)\s*(?:million|mm|m|million|billion|b)/i);
    if (originalMoney && cleanedMoney) {
      const origNum = originalMoney[1].replace(/,/g, "");
      const cleanNum = cleanedMoney[1].replace(/,/g, "");
      if (origNum !== cleanNum) {
        // Sanity check failed - use original
        console.log(`[CLAIMS_EXTRACT] WARN: number mismatch orig=${origNum} cleaned=${cleanNum}, using original`);
        // Keep original claim if numbers don't match
        const fallbackCleaned = claimText.replace(/~/g, "").replace(/\s+/g, " ").trim();
        if (fallbackCleaned.length >= 6) {
          rawCandidates.push({
            claimText: fallbackCleaned,
            facet: assignFacetToClaim(fallbackCleaned),
            claimKey: buildClaimKey(fallbackCleaned, assignFacetToClaim(fallbackCleaned)),
            anchor: claimAnchor || extractAnchor(fallbackCleaned), // A3.6.10: Preserve anchor
          });
          continue;
        }
      }
    }
    
    // Assign facet
    const facet = assignFacetToClaim(cleaned);
    
    // Compute claimKey
    const claimKey = buildClaimKey(cleaned, facet);
    
    // A3.6.10: Preserve anchor explicitly (use provided anchor or extract from cleaned text)
    const anchor = claimAnchor || extractAnchor(cleaned);
    const candidate = {
      claimText: cleaned,
      facet,
      claimKey,
      anchor: anchor, // A3.6.10: Explicit anchor field
    };
    
    // A3.6.18: Preserve _usedBestValSnip flag if present
    if (typeof claimEntry === "object" && claimEntry._usedBestValSnip) {
      candidate._usedBestValSnip = true;
    }
    
    // A3.6.19: Preserve _retryDebug flag if present
    if (typeof claimEntry === "object" && claimEntry._retryDebug) {
      candidate._retryDebug = claimEntry._retryDebug;
    }
    
    rawCandidates.push(candidate);
  }
  
  return rawCandidates;
}

// A3.6.16: Sanitize snippet to remove dangling numeric tails that invalidate extraction
function stripDanglingNumericTail(text) {
  if (typeof text !== "string") return text;
  
  let sanitized = text;
  
  // Rule 1: If text ends with incomplete currency fragment, truncate it
  // Pattern: "implying an $18" or "implies a $18" or similar
  const implyingPattern = /\b(implying|implies)\s+an?\s+\$\s*\d*\s*$/i;
  const match = sanitized.match(implyingPattern);
  if (match) {
    // Truncate to the start index of the match
    sanitized = sanitized.substring(0, match.index).trim();
  } else {
    // Also check for "$" + digits at end when preceded by "implying|implies" within last ~25 chars
    const danglingDollarPattern = /\$\s*\d+\s*$/;
    if (danglingDollarPattern.test(sanitized)) {
      const last25 = sanitized.substring(Math.max(0, sanitized.length - 25));
      if (/\b(implying|implies)\b/i.test(last25)) {
        // Find the position of "implying" or "implies" in the last 25 chars
        const implyingMatch = last25.match(/\b(implying|implies)\b/i);
        if (implyingMatch) {
          const implyingIndex = sanitized.length - 25 + implyingMatch.index;
          sanitized = sanitized.substring(0, implyingIndex).trim();
        } else {
          // Fallback: just remove the dangling "$" + digits
          sanitized = sanitized.replace(/\$\s*\d+\s*$/, "").trim();
        }
      }
    }
  }
  
  // Rule 2: If text ends with unmatched opening paren, truncate from that paren
  let lastOpenParen = -1;
  let parenDepth = 0;
  for (let i = sanitized.length - 1; i >= 0; i--) {
    if (sanitized[i] === ')') {
      parenDepth++;
    } else if (sanitized[i] === '(') {
      if (parenDepth === 0) {
        lastOpenParen = i;
        break;
      }
      parenDepth--;
    }
  }
  if (lastOpenParen >= 0) {
    sanitized = sanitized.substring(0, lastOpenParen).trim();
  }
  
  // Rule 3: If text ends with comma/colon/semicolon + whitespace only tail, trim
  sanitized = sanitized.replace(/[,:;]\s*$/, "").trim();
  
  return sanitized;
}

// A3.6.19: Try to build qual_valuation claimText from a snippet (primary or best mode)
function tryBuildQualValuationClaimText(rawText, mode = "primary") {
  if (typeof rawText !== "string" || !rawText.trim()) {
    return { claimText: "", debug: { mode, reason: "empty_input" } };
  }
  
  // Clean the text
  let cleaned = cleanClaimText(rawText);
  
  // A3.6.19: For best mode, apply acceptance rules (must contain valuation keywords + digit/currency)
  if (mode === "best") {
    // Check acceptance rules BEFORE cleaning to avoid false negatives
    const rawHasValuationKeyword = /\b(valuation|pre-?money|post-?money|enterprise\s+value|ev\b(?!\w))\b/i.test(rawText);
    const rawHasDigitOrCurrency = /[\d$]/.test(rawText);
    
    if (!rawHasValuationKeyword || !rawHasDigitOrCurrency) {
      return { claimText: "", debug: { mode, reason: "best_rejected_guard", hasKeyword: rawHasValuationKeyword, hasDigitOrCurrency: rawHasDigitOrCurrency } };
    }
    
    // A3.6.19: Guard against overly-aggressive stripping - if cleaned becomes empty but rawText has valuation keywords, try to recover
    if (cleaned.length === 0 && rawHasValuationKeyword) {
      // Try to preserve at least the valuation phrase
      const valMatch = rawText.match(/\b(valuation|pre-?money|post-?money|enterprise\s+value|ev\b(?!\w))\b/i);
      if (valMatch) {
        const start = Math.max(0, valMatch.index - 30);
        const end = Math.min(rawText.length, valMatch.index + valMatch[0].length + 30);
        cleaned = rawText.substring(start, end).trim();
        cleaned = cleanClaimText(cleaned);
      }
    }
  }
  
  // Final validation: must still contain valuation keywords after cleaning (for best mode)
  if (cleaned.length > 0 && mode === "best") {
    const stillHasValuationKeyword = /\b(valuation|pre-?money|post-?money|enterprise\s+value|ev\b(?!\w))\b/i.test(cleaned);
    if (!stillHasValuationKeyword) {
      // A3.6.19: If valuation keyword was lost during cleaning, this is a filtering failure
      return { claimText: "", debug: { mode, reason: "best_filtered_empty", originalLen: rawText.length, cleanedLen: cleaned.length } };
    }
  }
  
  // Check length constraints
  if (cleaned.length === 0 || cleaned.length >= 150) {
    return { claimText: "", debug: { mode, reason: cleaned.length === 0 ? "empty_after_clean" : "too_long", cleanedLen: cleaned.length } };
  }
  
  return { claimText: cleaned, debug: { mode, reason: "ok", cleanedLen: cleaned.length } };
}

// A3.6.18: Get best available valuation snippet from statement text
function getBestValuationSnippet(statementText) {
  if (typeof statementText !== "string" || !statementText.trim()) {
    return "";
  }
  
  try {
    // Strategy a) Prefer "pre-money valuation" / "post-money valuation" clause
    const premoneyPattern = /\bpre-?money\s+valuation\b/i;
    const postmoneyPattern = /\bpost-?money\s+valuation\b/i;
    
    const premoneyMatch = statementText.match(premoneyPattern);
    const postmoneyMatch = statementText.match(postmoneyPattern);
    
    if (premoneyMatch || postmoneyMatch) {
      const match = premoneyMatch || postmoneyMatch;
      const keywordIndex = match.index;
      const keywordMatch = match[0];
      
      // Find the nearest USD amount preceding the valuation keyword
      const beforeKeyword = statementText.substring(0, keywordIndex);
      const usdPattern = /\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m\b|billion|b\b|thousand|k\b)/i;
      const usdPatternGlobal = ensureGlobalRegex(usdPattern);
      const usdMatches = [...beforeKeyword.matchAll(usdPatternGlobal)];
      
      let snippetStart = keywordIndex;
      if (usdMatches.length > 0) {
        // Use the last (nearest) USD match before the keyword
        const nearestUsd = usdMatches[usdMatches.length - 1];
        snippetStart = nearestUsd.index;
      } else {
        // No USD found before, expand backwards from keyword
        snippetStart = Math.max(0, keywordIndex - 40);
      }
      
      // Find clause boundary (stop at earliest: ", implying", ";", "—", or end of string)
      let snippetEnd = statementText.length;
      const boundaryPatterns = [
        /,\s+implying/i,
        /;/,
        /—/,
      ];
      
      for (const pattern of boundaryPatterns) {
        const boundaryMatch = statementText.substring(keywordIndex).match(pattern);
        if (boundaryMatch) {
          const boundaryIndex = keywordIndex + boundaryMatch.index;
          if (boundaryIndex < snippetEnd) {
            snippetEnd = boundaryIndex;
          }
        }
      }
      
      // Expand to word boundaries
      let expandedStart = snippetStart;
      while (expandedStart > 0 && /\w/.test(statementText[expandedStart - 1])) {
        expandedStart--;
      }
      let expandedEnd = snippetEnd;
      while (expandedEnd < statementText.length && /\w/.test(statementText[expandedEnd])) {
        expandedEnd++;
      }
      
      let snippet = statementText.substring(expandedStart, expandedEnd).trim();
      snippet = stripDanglingNumericTail(snippet);
      snippet = snippet.replace(/^[^\w$%]+/, "").replace(/[^\w$%]+$/, "").replace(/\s+/g, " ").trim();
      
      if (snippet.length > 0 && snippet.length < 150) {
        return snippet;
      }
    }
    
    // Strategy b) Else "enterprise value" clause
    const enterpriseValuePattern = /\benterprise\s+value\b|\bev\b(?!\w)/i;
    const evMatch = statementText.match(enterpriseValuePattern);
    if (evMatch) {
      const keywordIndex = evMatch.index;
      const keywordMatch = evMatch[0];
      
      // Find USD amount near the keyword
      const spanStart = Math.max(0, keywordIndex - 60);
      const spanEnd = Math.min(statementText.length, keywordIndex + keywordMatch.length + 60);
      
      // Expand to word boundaries
      let expandedStart = spanStart;
      while (expandedStart > 0 && /\w/.test(statementText[expandedStart - 1])) {
        expandedStart--;
      }
      let expandedEnd = spanEnd;
      while (expandedEnd < statementText.length && /\w/.test(statementText[expandedEnd])) {
        expandedEnd++;
      }
      
      let snippet = statementText.substring(expandedStart, expandedEnd).trim();
      
      // Look for USD amount within or adjacent to the span
      const usdPattern = /\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m\b|billion|b\b|thousand|k\b)/i;
      const snippetUsdMatch = snippet.match(usdPattern);
      if (!snippetUsdMatch) {
        // Try to expand snippet to include USD amount if it's nearby
        const expandedUsdStart = Math.max(0, expandedStart - 40);
        const expandedUsdEnd = Math.min(statementText.length, expandedEnd + 40);
        const expandedText = statementText.substring(expandedUsdStart, expandedUsdEnd);
        const expandedUsdMatch = expandedText.match(usdPattern);
        if (expandedUsdMatch) {
          const usdMatchIndex = expandedUsdStart + expandedText.indexOf(expandedUsdMatch[0]);
          const newStart = Math.min(expandedStart, usdMatchIndex - 20);
          const newEnd = Math.max(expandedEnd, usdMatchIndex + expandedUsdMatch[0].length + 20);
          
          let newExpandedStart = newStart;
          while (newExpandedStart > 0 && /\w/.test(statementText[newExpandedStart - 1])) {
            newExpandedStart--;
          }
          let newExpandedEnd = newEnd;
          while (newExpandedEnd < statementText.length && /\w/.test(statementText[newExpandedEnd])) {
            newExpandedEnd++;
          }
          snippet = statementText.substring(newExpandedStart, newExpandedEnd).trim();
        }
      }
      
      snippet = stripDanglingNumericTail(snippet);
      snippet = snippet.replace(/^[^\w$%]+/, "").replace(/[^\w$%]+$/, "").replace(/\s+/g, " ").trim();
      
      if (snippet.length > 0 && snippet.length < 150) {
        return snippet;
      }
    }
    
    // Strategy c) Else generic "valuation" / "EV" keyword span
    const valuationPattern = /\bvaluation\b/i;
    const valMatch = statementText.match(valuationPattern);
    if (valMatch) {
      const keywordIndex = valMatch.index;
      const keywordMatch = valMatch[0];
      
      // Extract span around keyword (±60 chars)
      const spanStart = Math.max(0, keywordIndex - 60);
      const spanEnd = Math.min(statementText.length, keywordIndex + keywordMatch.length + 60);
      
      // Expand to word boundaries
      let expandedStart = spanStart;
      while (expandedStart > 0 && /\w/.test(statementText[expandedStart - 1])) {
        expandedStart--;
      }
      let expandedEnd = spanEnd;
      while (expandedEnd < statementText.length && /\w/.test(statementText[expandedEnd])) {
        expandedEnd++;
      }
      
      let snippet = statementText.substring(expandedStart, expandedEnd).trim();
      
      // Look for USD amount within or adjacent to the span
      const usdPattern = /\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m\b|billion|b\b|thousand|k\b)/i;
      const snippetUsdMatch = snippet.match(usdPattern);
      if (!snippetUsdMatch) {
        // Try to expand snippet to include USD amount if it's nearby
        const expandedUsdStart = Math.max(0, expandedStart - 40);
        const expandedUsdEnd = Math.min(statementText.length, expandedEnd + 40);
        const expandedText = statementText.substring(expandedUsdStart, expandedUsdEnd);
        const expandedUsdMatch = expandedText.match(usdPattern);
        if (expandedUsdMatch) {
          const usdMatchIndex = expandedUsdStart + expandedText.indexOf(expandedUsdMatch[0]);
          const newStart = Math.min(expandedStart, usdMatchIndex - 20);
          const newEnd = Math.max(expandedEnd, usdMatchIndex + expandedUsdMatch[0].length + 20);
          
          let newExpandedStart = newStart;
          while (newExpandedStart > 0 && /\w/.test(statementText[newExpandedStart - 1])) {
            newExpandedStart--;
          }
          let newExpandedEnd = newEnd;
          while (newExpandedEnd < statementText.length && /\w/.test(statementText[newExpandedEnd])) {
            newExpandedEnd++;
          }
          snippet = statementText.substring(newExpandedStart, newExpandedEnd).trim();
        }
      }
      
      snippet = stripDanglingNumericTail(snippet);
      snippet = snippet.replace(/^[^\w$%]+/, "").replace(/[^\w$%]+$/, "").replace(/\s+/g, " ").trim();
      
      if (snippet.length > 0 && snippet.length < 150) {
        return snippet;
      }
    }
    
    return "";
  } catch (err) {
    // A3.6.18: Safe fallback - never throw
    return "";
  }
}

// A3.6.17: Ensure RegExp has global flag for matchAll() compatibility
function ensureGlobalRegex(re) {
  if (!(re instanceof RegExp)) {
    return re;
  }
  
  if (re.global === true) {
    return re;
  }
  
  // Add 'g' flag if not present
  const flags = re.flags;
  if (flags.includes('g')) {
    return re; // Already has 'g', shouldn't happen but be safe
  }
  
  return new RegExp(re.source, flags + 'g');
}

// A3.6.15: Fallback snippet extractor for qual_valuation when primary extraction returns empty
// A3.6.16: Enhanced to prefer "pre-money valuation" clauses and sanitize dangling tails
// A3.6.17: Fixed matchAll crash by ensuring global regex + defensive error handling
function extractValuationFallbackSnippet(statementText, anchor, runId = null, reqSig = null, idx = null) {
  if (typeof statementText !== "string" || anchor !== "qual_valuation") {
    return "";
  }
  
  // A3.6.17: Defensive error handling for regex operations
  try {
    // A3.6.16: B1. Prefer "pre-money valuation" or "post-money valuation" clause when present
    const premoneyPattern = /\bpre-?money\s+valuation\b/i;
    const postmoneyPattern = /\bpost-?money\s+valuation\b/i;
    
    let snippet = "";
    let keywordIndex = -1;
    let keywordMatch = null;
    
    // Check for pre-money/post-money valuation first
    const premoneyMatch = statementText.match(premoneyPattern);
    const postmoneyMatch = statementText.match(postmoneyPattern);
    
    if (premoneyMatch || postmoneyMatch) {
      const match = premoneyMatch || postmoneyMatch;
      keywordIndex = match.index;
      keywordMatch = match[0];
      
      // Find the nearest USD amount preceding the valuation keyword
      const beforeKeyword = statementText.substring(0, keywordIndex);
      const usdPattern = /\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m\b|billion|b\b|thousand|k\b)/i;
      
      // A3.6.17: Ensure regex is global for matchAll()
      const usdPatternGlobal = ensureGlobalRegex(usdPattern);
      if (usdPatternGlobal !== usdPattern && runId && reqSig && idx !== null) {
        diag(runId, reqSig, `[VAL_FALLBACK_RE_GUARD] idx=${idx} upgraded=true flagsBefore="${usdPattern.flags}" flagsAfter="${usdPatternGlobal.flags}"`);
      }
      
      const usdMatches = [...beforeKeyword.matchAll(usdPatternGlobal)];
      
      let snippetStart = keywordIndex;
      if (usdMatches.length > 0) {
        // Use the last (nearest) USD match before the keyword
        const nearestUsd = usdMatches[usdMatches.length - 1];
        snippetStart = nearestUsd.index;
      } else {
        // No USD found before, expand backwards from keyword
        snippetStart = Math.max(0, keywordIndex - 40);
      }
      
      // Find clause boundary (stop at earliest: ", implying", ";", "—", or end of string)
      let snippetEnd = statementText.length;
      const boundaryPatterns = [
        /,\s+implying/i,
        /;/,
        /—/,
      ];
      
      for (const pattern of boundaryPatterns) {
        const boundaryMatch = statementText.substring(keywordIndex).match(pattern);
        if (boundaryMatch) {
          const boundaryIndex = keywordIndex + boundaryMatch.index;
          if (boundaryIndex < snippetEnd) {
            snippetEnd = boundaryIndex;
          }
        }
      }
      
      // Expand to word boundaries
      let expandedStart = snippetStart;
      while (expandedStart > 0 && /\w/.test(statementText[expandedStart - 1])) {
        expandedStart--;
      }
      let expandedEnd = snippetEnd;
      while (expandedEnd < statementText.length && /\w/.test(statementText[expandedEnd])) {
        expandedEnd++;
      }
      
      snippet = statementText.substring(expandedStart, expandedEnd).trim();
    } else {
      // B2. Otherwise, keep existing keyword search
      const valuationKeywords = [
        /\bvaluation\b/i,
        /\benterprise\s+value\b/i,
        /\bev\b(?!\w)/i,
      ];
      
      for (const pattern of valuationKeywords) {
        const match = statementText.match(pattern);
        if (match) {
          keywordIndex = match.index;
          keywordMatch = match[0];
          break;
        }
      }
      
      if (keywordIndex < 0) {
        return "";
      }
      
      // Extract span around keyword (±60 chars)
      const spanStart = Math.max(0, keywordIndex - 60);
      const spanEnd = Math.min(statementText.length, keywordIndex + (keywordMatch ? keywordMatch.length : 0) + 60);
      
      // Expand to word boundaries
      let expandedStart = spanStart;
      while (expandedStart > 0 && /\w/.test(statementText[expandedStart - 1])) {
        expandedStart--;
      }
      let expandedEnd = spanEnd;
      while (expandedEnd < statementText.length && /\w/.test(statementText[expandedEnd])) {
        expandedEnd++;
      }
      
      snippet = statementText.substring(expandedStart, expandedEnd).trim();
      
      // Look for USD amount within or adjacent to the span
      const usdPattern = /\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m\b|billion|b\b|thousand|k\b)/i;
      const snippetUsdMatch = snippet.match(usdPattern);
      if (!snippetUsdMatch) {
        // Try to expand snippet to include USD amount if it's nearby
        const expandedUsdStart = Math.max(0, expandedStart - 40);
        const expandedUsdEnd = Math.min(statementText.length, expandedEnd + 40);
        const expandedText = statementText.substring(expandedUsdStart, expandedUsdEnd);
        const expandedUsdMatch = expandedText.match(usdPattern);
        if (expandedUsdMatch) {
          // Find the position of the USD match in the full text
          const usdMatchIndex = expandedUsdStart + expandedText.indexOf(expandedUsdMatch[0]);
          // Create a snippet that includes both the keyword and the USD amount
          const newStart = Math.min(expandedStart, usdMatchIndex - 20);
          const newEnd = Math.max(expandedEnd, usdMatchIndex + expandedUsdMatch[0].length + 20);
          // Expand to word boundaries
          let newExpandedStart = newStart;
          while (newExpandedStart > 0 && /\w/.test(statementText[newExpandedStart - 1])) {
            newExpandedStart--;
          }
          let newExpandedEnd = newEnd;
          while (newExpandedEnd < statementText.length && /\w/.test(statementText[newExpandedEnd])) {
            newExpandedEnd++;
          }
          snippet = statementText.substring(newExpandedStart, newExpandedEnd).trim();
        }
      }
    }
    
    // A3.6.16: Apply sanitizer before final cleanup
    snippet = stripDanglingNumericTail(snippet);
    
    // Clean up snippet
    snippet = snippet.replace(/^[^\w$%]+/, "").replace(/[^\w$%]+$/, "").replace(/\s+/g, " ").trim();
    
    // Re-tighten to smallest phrase that still contains the keyword (+ USD amount if found nearby)
    // This is already handled by the extraction logic above
    
    // Return smallest clean phrase containing the keyword + (if present) USD amount
    return snippet;
  } catch (err) {
    // A3.6.17: Defensive error handling - return empty string and log error
    if (runId && reqSig && idx !== null) {
      const errorMessage = err?.message || String(err);
      // Try to extract regex info if available
      let reSource = "unknown";
      let reFlags = "unknown";
      if (err?.stack && err.stack.includes("matchAll")) {
        // Try to infer from context - this is best effort
        reSource = "usdPattern";
        reFlags = "i";
      }
      diag(runId, reqSig, `[VAL_FALLBACK_REGEX_ERROR] idx=${idx} message="${errorMessage}" reSource="${reSource}" reFlags="${reFlags}"`);
    }
    return ""; // Return empty so caller can proceed cleanly
  }
}

// A3.6.0: Assign facet to a claim (per-claim version of detectFacetsInStatement)
function assignFacetToClaim(claimText) {
  if (typeof claimText !== "string" || !claimText.trim()) return "Other";
  
  const text = claimText.toLowerCase();
  
  // Investment: first match wins
  if (/\binvest\b|\binvestment\b|\$.*invest|Series [A-Za-z]/.test(text)) {
    return "Investment";
  }
  
  // Valuation
  if (/\bvaluation\b|\bpre-?money\b|\bpost-?money\b|\bev\b(?!\w)|\benterprise value\b/.test(text)) {
    return "Valuation";
  }
  
  // Structure
  if (/\bpreferred\b|1x|\bliquidation\b|\bstructured\b/.test(text)) {
    return "Structure";
  }
  
  // Ownership
  if (/%|\bownership\b|\bstake\b|\bfully diluted\b/.test(text)) {
    return "Ownership";
  }
  
  // Timing
  if (/\bexpected\b|\bwould\b|\bplans\b|\bsubject to\b/.test(text)) {
    return "Timing";
  }
  
  return "Other";
}

// A3.6.11 ADDENDUM: Anchor rules configuration (data-driven, no topic branching)
const ANCHOR_RULES = {
  qual_valuation: {
    requireKeywordForHigh: true,
    keywordList: ["valuation", "valued", "value", "enterprise value", "ev", "pre-money", "post-money", "premoney", "postmoney"],
    requireEnterpriseValueKeyword: false, // Set to true if claim text implies EV
  },
};

// A3.6.1: Score reliability for a claim based on matchTypes (claim-aware)
// A3.6.2 ADDENDUM: Anchor-gated semantic equivalence (not signal count alone)
// A3.6.11 ADDENDUM: Rule-driven scoring (no topic branching)
function scoreClaimReliability(claimText, facet, corpusSearchResult, ambiguityResult, uploadedDocs) {
  if (!corpusSearchResult || !corpusSearchResult.found) {
    return "Low";
  }
  
  const hits = corpusSearchResult.hits || [];
  if (hits.length === 0) {
    return "Low";
  }
  
  // A3.6.2 PATCH v2: Enhanced numericMatch (handles percentages)
  let numericMatch = 0;
  if (hits.some(h => h.matchType === "number")) {
    numericMatch = 1;
  } else {
    // Check if claim has percentage and corpus has matching percentage
    const pctMatch = claimText.match(/([\d,]+(?:\.\d+)?)\s*%/);
    if (pctMatch) {
      const claimPct = parseFloat(pctMatch[1].replace(/,/g, ""));
      const allExcerpts = hits.map(h => h.excerpt || "").join(" ");
      const pctPattern = /([\d,]+(?:\.\d+)?)\s*%/g;
      let match;
      while ((match = pctPattern.exec(allExcerpts)) !== null) {
        const corpusPct = parseFloat(match[1].replace(/,/g, ""));
        // Allow 5% tolerance for rounding
        if (Math.abs(claimPct - corpusPct) / Math.max(claimPct, corpusPct) <= 0.05) {
          numericMatch = 1;
          break;
        }
      }
    }
  }
  
  // Check domain keyword match
  const domainKeywordClass = extractDomainKeywordClass(claimText);
  const allExcerpts = hits.map(h => h.excerpt || "").join(" ").toLowerCase();
  const domainKeywordMatch = domainKeywordClass !== "none" && 
    allExcerpts.includes(domainKeywordClass.toLowerCase()) ? 1 : 0;
  
  // Check verb class match
  const verbClass = extractVerbClass(claimText);
  const verbClasses = {
    invest: ["invest", "investment", "investing", "invested", "investor"],
    financing: ["financing", "financed", "funding", "funded", "raise", "raised"],
    purchase: ["purchase", "purchased", "buy", "bought", "acquire", "acquired"],
    valuation: ["value", "valued", "price", "priced", "valuation"],
    ownership: ["own", "owned", "ownership", "stake", "equity", "share"],
  };
  let verbClassMatch = 0;
  if (verbClass !== "none") {
    const classVerbs = verbClasses[verbClass] || [];
    for (const verb of classVerbs) {
      if (new RegExp(`\\b${verb}\\b`).test(allExcerpts)) {
        verbClassMatch = 1;
        break;
      }
    }
  }
  
  // A3.6.2 ADDENDUM: Anchor-gated reliability scoring
  const anchor = extractAnchor(claimText);
  const canonicalAnchor = canonicalizeAnchor(anchor);
  const hasNumericAnchor = anchor && (anchor.startsWith("usd_") || anchor.startsWith("pct_") || anchor.startsWith("mult_"));
  
  // A3.6.11 ADDENDUM: Get anchor-specific rules (data-driven, no branching)
  const rules = ANCHOR_RULES[canonicalAnchor] || {};
  const requireKeywordForHigh = rules.requireKeywordForHigh === true;
  const keywordList = rules.keywordList || [];
  
  // A3.6.11 ADDENDUM: Detect enterprise value intent from claim text (signal-based, not branching)
  const hasEnterpriseValueIntent = /\benterprise\s+value\b|\bev\b(?!\w)/i.test(claimText);
  const requireEnterpriseValueKeyword = hasEnterpriseValueIntent;
  
  // A3.6.11 ADDENDUM: Check keyword match generically (using rule-driven keyword list or domain keyword)
  let keywordOk = false;
  if (requireKeywordForHigh && keywordList.length > 0) {
    // Use rule-specified keyword list
    keywordOk = keywordList.some(keyword => 
      new RegExp(`\\b${keyword}\\b`, "i").test(allExcerpts)
    );
    // If enterprise value intent detected, require explicit "enterprise value" keyword in corpus
    if (requireEnterpriseValueKeyword) {
      keywordOk = keywordOk && /\benterprise\s+value\b|\bev\b(?!\w)/i.test(allExcerpts);
    }
  } else if (requireKeywordForHigh) {
    // Fallback to domain keyword match if no keyword list specified
    keywordOk = domainKeywordMatch === 1;
  } else {
    // No keyword requirement - keywordOk doesn't gate High
    keywordOk = true;
  }
  
  // A3.6.11 ADDENDUM: Generic signal-based gating
  const numericOk = numericMatch >= 1;
  const highGateOk = numericOk && (!requireKeywordForHigh || keywordOk);
  
  let reliability = "Low";
  
  if (hasNumericAnchor) {
    // CLAIMS WITH NUMERIC ANCHORS
    // A3.6.11 ADDENDUM: Apply rule-driven gating (caps High if gate fails)
    if (numericMatch === 1 && (domainKeywordMatch === 1 || verbClassMatch === 1)) {
      // Would be High, but check rule-driven gate
      reliability = highGateOk ? "High" : "Medium";
    }
    // Medium: numericMatch alone, OR semantic match but multiple conflicting values
    else if (numericMatch === 1) {
      reliability = "Medium";
    }
    // Low: no numericMatch
    else {
      reliability = "Low";
    }
  } else {
    // QUALITATIVE-ONLY CLAIMS (NO NUMERIC ANCHOR)
    // A3.6.6: Check for fuzzy matches - treat as at least Medium support
    const hasFuzzyMatch = hits.some(h => h.matchType === "fuzzy");
    const hasExactKeywordMatch = domainKeywordClass !== "none" && 
      allExcerpts.includes(domainKeywordClass.toLowerCase());
    
    // High: domainKeywordMatch AND verbClassMatch, OR exact keyword match
    if (domainKeywordMatch === 1 && verbClassMatch === 1) {
      reliability = "High";
    }
    // High: exact keyword match (qualitative keyword itself appears)
    else if (hasExactKeywordMatch && verbClassMatch === 1) {
      reliability = "High";
    }
    // Medium: only one of the above matches, OR fuzzy match found, OR ambiguity
    else if (domainKeywordMatch === 1 || verbClassMatch === 1 || hasFuzzyMatch) {
      reliability = "Medium";
    }
    // Low: no meaningful semantic alignment
    else {
      reliability = "Low";
    }
  }
  
  // A3.6.2 ADDENDUM: Ambiguity rule (unchanged)
  const isAmbiguous = ambiguityResult?.isAmbiguous || false;
  if (isAmbiguous && reliability === "High") {
    reliability = "Medium";
  }
  
  return reliability;
}

// A3.6.1: Generate comment for a claim using templates (with ambiguity awareness)
function generateClaimComment(reliability, facet, hasAmbiguityCap, claimText) {
  if (reliability === "High") {
    return "Confirmed in provided source";
  }
  
  if (reliability === "Medium") {
    // Valuation: "Multiple figures present; verify which applies" ONLY if ambiguity cap applied
    if (facet === "Valuation" && hasAmbiguityCap) {
      return "Multiple figures present; verify which applies";
    }
    
    // Ownership: "Ownership basis not clearly defined" ONLY if ambiguity cap applied OR contains %/fully diluted/stake
    if (facet === "Ownership") {
      const hasOwnershipTerms = /%|\bfully\s+diluted\b|\bstake\b/i.test(claimText || "");
      if (hasAmbiguityCap || hasOwnershipTerms) {
        return "Ownership basis not clearly defined";
      }
    }
    
    // Structure: "Terms mentioned but not explicitly confirmed"
    if (facet === "Structure") {
      return "Terms mentioned but not explicitly confirmed";
    }
    
    // Default for Medium
    return "Mentioned but not explicitly confirmed in excerpt";
  }
  
  if (reliability === "Low") {
    return "Not supported in provided sources";
  }
  
  return "Not supported in provided sources";
}

// A3.6.1: Generate claims assessment for a statement (with aggregation and capping)
function generateClaimsForStatement(statementText, uploadedDocs, assessment, runId = null, reqSig = null, idx = 0) {
  if (typeof statementText !== "string" || !statementText.trim()) {
    return [];
  }
  
  // A3.6.18: Compute and cache best valuation snippet once per statement
  const bestValSnip = getBestValuationSnippet(statementText);
  
  // A3.6.18: Diagnostic for best valuation snippet
  if ((idx < 2 || idx === 3) && runId && reqSig) {
    const preview = bestValSnip ? bestValSnip.substring(0, 50) : "";
    diag(runId, reqSig, `[VAL_BEST_SNIP] idx=${idx} len=${bestValSnip.length} preview="${preview}"`);
  }
  
  // A3.6.18: Diagnostic when qual_valuation uses bestValSnip (will be logged after extraction)
  // This is set up here but logged in the extraction/aggregation phase
  
  // A3.6.8: Extract all anchors from original statement text for logging
  const allAnchorsInOriginal = extractAllAnchors(statementText);
  if (idx < 2 && runId && reqSig) {
    diag(runId, reqSig, `[ANCHORS_ALL] idx=${idx} anchors=${JSON.stringify(Array.from(allAnchorsInOriginal))}`);
  }
  
  // Extract raw candidates (already cleaned and with facet/key assigned)
  // A3.6.18: Pass bestValSnip to extractAtomicClaims for qual_valuation fallback
  const rawCandidates = extractAtomicClaims(statementText, bestValSnip);
  if (rawCandidates.length === 0) {
    return [];
  }
  
  // A3.6.16: Diagnostic for qual_valuation extraction (check if detected but not emitted)
  if (runId && reqSig) {
    const qualValuationDetected = allAnchorsInOriginal.some(a => {
      const canonical = canonicalizeAnchor(a, statementText);
      return canonical === "qual_valuation";
    });
    
    if (qualValuationDetected) {
      const qualValuationCandidates = rawCandidates.filter(c => {
        const rawAnchor = c.anchor || extractAnchor(c.claimText) || "no_anchor";
        const canonicalAnchor = canonicalizeAnchor(rawAnchor, c.claimText);
        return canonicalAnchor === "qual_valuation";
      });
      
      if (qualValuationCandidates.length > 0) {
        // Check if this candidate used bestValSnip
        const candidate = qualValuationCandidates[0];
        const candidateText = candidate.claimText;
        // A3.6.19: Check _usedBestValSnip flag or compare text
        const usedBestValSnip = candidate._usedBestValSnip || 
          (bestValSnip && bestValSnip.length > 0 && 
           (candidateText === bestValSnip || candidateText.includes(bestValSnip.substring(0, 30))));
        
        // A3.6.19: Diagnostic for retry behavior
        if ((idx < 2 || idx === 3) && candidate._retryDebug) {
          const retryDebug = candidate._retryDebug;
          diag(runId, reqSig, `[VAL_QUAL_RETRY] idx=${idx} primaryFinalLen=${retryDebug.primaryFinalLen} bestLen=${retryDebug.bestLen} retried=true`);
        }
        
        // A3.6.19: Update [VAL_QUAL_FROM_BEST] with detailed reasons
        if (usedBestValSnip) {
          const preview = candidateText.substring(0, 50);
          diag(runId, reqSig, `[VAL_QUAL_FROM_BEST] idx=${idx} used=true preview="${preview}"`);
