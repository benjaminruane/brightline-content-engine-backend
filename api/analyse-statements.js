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
    
    // Repair strategy: extend to nearest valid sentence boundary from original draft text
    const textIndex = draftText.indexOf(trimmed);
    if (textIndex >= 0) {
      // Find sentence boundary after the statement
      const sentenceEnd = draftText.indexOf(".", textIndex + trimmed.length);
      if (sentenceEnd >= 0) {
        const repairedText = draftText.substring(textIndex, sentenceEnd + 1).trim();
        if (repairedText.length > trimmed.length) {
          repaired.push({
            ...stmt,
            text: repairedText,
            __repairedNumericFragment: true,
          });
          repairCount++;
          log(`[NUMERIC_FRAGMENT_REPAIR] idx=${repaired.length - 1} original="${trimmed.substring(0, 50)}..." repaired="${repairedText.substring(0, 50)}..."`);
          continue;
        }
      }
    }
    
    // If extension not possible, truncate the fragment entirely
    // Find last complete word before the fragment
    const lastCompleteWord = trimmed.match(/\b\w+\b(?=\s*$)/);
    if (lastCompleteWord && lastCompleteWord.index > 0) {
      const truncatedText = trimmed.substring(0, lastCompleteWord.index).trim();
      if (truncatedText.length >= 10) {
        repaired.push({
          ...stmt,
          text: truncatedText,
          __repairedNumericFragment: true,
        });
        repairCount++;
        log(`[NUMERIC_FRAGMENT_REPAIR] idx=${repaired.length - 1} original="${trimmed.substring(0, 50)}..." truncated="${truncatedText.substring(0, 50)}..."`);
        continue;
      }
    }
    
    // Last resort: keep as-is but mark as repaired
    repaired.push({
      ...stmt,
      __repairedNumericFragment: true,
    });
    repairCount++;
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
  
  // A3.6.11: Ownership - only return qual_ownership if no percentage present
  // (percentages should use pct_* anchors)
  if (/\bownership\b/.test(text) && !pctMatch) {
    return canonicalizeAnchor("qual_ownership");
  }
  
  // Fallback: use first significant domain keyword
  const domainClass = extractDomainKeywordClass(claimText);
  if (domainClass !== "none") {
    return canonicalizeAnchor(`qual_${domainClass}`);
  }
  
  return null;
}

// A3.6.4: Extract all distinct anchors from a clause text
// A3.6.8: Operate on ORIGINAL statement text (before any cleaning that might remove % or punctuation)
// A3.6.11: Canonical anchor taxonomy - maps all anchor variants to canonical forms
function canonicalizeAnchor(anchor) {
  if (typeof anchor !== "string") return anchor;
  
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
  return Array.from(new Set(canonicalAnchors)); // Remove duplicates after canonicalization
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
  
  // Strip numbers
  normalized = normalized.replace(/[\d,]+(?:\.\d+)?/g, "");
  
  // Strip stopwords
  const stopwords = /\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by|from|as|is|was|are|were|be|been|being|have|has|had|do|does|did|will|would|should|could|may|might|can|must|this|that|these|those|it|its|they|them|their|we|our|us)\b/gi;
  normalized = normalized.replace(stopwords, " ");
  
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
    
    // A3.6.11: Extract anchor first - canonicalize it
    const rawAnchor = candidate.anchor || extractAnchor(candidate.claimText) || "no_anchor";
    const anchor = canonicalizeAnchor(rawAnchor);
    
    // A3.6.11: Build normalized meaning key (strips numbers, stopwords, collapses whitespace)
    const normalizedMeaningKey = buildNormalizedMeaningKey(candidate.claimText);
    
    // A3.6.11: Primary uniqueness key: canonicalAnchor + '|' + normalizedMeaningKey
    const dedupeKey = `${anchor}|${normalizedMeaningKey}`;
    
    if (!aggregated.has(dedupeKey)) {
      aggregated.set(dedupeKey, {
        claimText: candidate.claimText,
        facet: candidate.facet || "Other", // Preserve facet for backward compatibility
        anchor: anchor, // Store anchor for validation
        candidates: [candidate],
      });
    } else {
      const existing = aggregated.get(dedupeKey);
      
      // A3.6.11: Hard guard - never merge claims with different canonical anchors
      const existingRawAnchor = existing.anchor || extractAnchor(existing.claimText) || "no_anchor";
      const existingAnchor = canonicalizeAnchor(existingRawAnchor);
      if (anchor !== existingAnchor) {
        // Different anchors - create separate entry
        // Use a more specific key to avoid collision
        const specificKey = `${dedupeKey}_${aggregated.size}`;
        aggregated.set(specificKey, {
          claimText: candidate.claimText,
          facet: candidate.facet || "Other",
          anchor: anchor,
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
        
        let score = 0;
        if (length >= 10 && length <= 60) score += 100;
        else if (length < 10) score -= 50;
        else score -= (length - 60) * 2;
        score -= commaCount * 10;
        if (hasAnchor) score += 50;
        
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
function extractAtomicClaims(statementText) {
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
        valuation: /\bvaluation\b/i,
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
      // A3.6.10: Build snippet around anchor (±60 chars) BUT expand to word boundaries
      const snippetStart = Math.max(0, anchorIndex - 60);
      const snippetEnd = Math.min(text.length, anchorIndex + (anchorMatch ? anchorMatch.length : 0) + 60);
      
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
      
      // A3.6.10: Final validation - ensure snippet doesn't start mid-word
      if (snippet.length > 0 && /^[a-z]/.test(snippet)) {
        const beforeChar = expandedStart > 0 ? text[expandedStart - 1] : null;
        if (beforeChar && /\w/.test(beforeChar)) {
          // Still mid-word, expand to sentence boundary
          const sentenceStart = Math.max(0, text.lastIndexOf(".", expandedStart) + 1);
          const sentenceEnd = Math.min(text.length, text.indexOf(".", expandedEnd) + 1);
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
        
        // A3.6.10: Final check - ensure snippet still contains target anchor after cleaning
        const finalAnchors = extractAllAnchors(snippet);
        if (finalAnchors.includes(anchor) && snippet.length > 0 && snippet.length < 150) {
          // A3.6.10: Store anchor explicitly with claim snippet
          claims.push({ text: snippet, anchor: anchor });
          anchorsProcessed.add(anchor);
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
    rawCandidates.push({
      claimText: cleaned,
      facet,
      claimKey,
      anchor: anchor, // A3.6.10: Explicit anchor field
    });
  }
  
  return rawCandidates;
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
  
  // A3.6.8: Extract all anchors from original statement text for logging
  const allAnchorsInOriginal = extractAllAnchors(statementText);
  if (idx < 2 && runId && reqSig) {
    diag(runId, reqSig, `[ANCHORS_ALL] idx=${idx} anchors=${JSON.stringify(Array.from(allAnchorsInOriginal))}`);
  }
  
  // Extract raw candidates (already cleaned and with facet/key assigned)
  const rawCandidates = extractAtomicClaims(statementText);
  if (rawCandidates.length === 0) {
    return [];
  }
  
  // A3.6.1: Aggregate by claimKey
  const aggregatedClaims = aggregateClaimsByKey(rawCandidates);
  
  // A3.6.9: Check for missing anchors and log dedupe stats
  const emittedAnchors = new Set(aggregatedClaims.map(c => {
    const anchor = extractAnchor(c.claimText);
    return anchor || null;
  }).filter(a => a !== null));
  const missingAnchors = allAnchorsInOriginal.filter(a => !emittedAnchors.has(a));
  if (idx < 2 && runId && reqSig && missingAnchors.length > 0) {
    diag(runId, reqSig, `[CLAIMS_MISSING_ANCHORS] idx=${idx} missing=${JSON.stringify(missingAnchors)}`);
  }
  
  // A3.6.9: Log aggregation stats with anchor uniqueness (per statement)
  if (runId && reqSig) {
    const merged = rawCandidates.length - aggregatedClaims.length;
    // Count unique anchors after dedupe
    const anchorsUnique = Array.from(new Set(aggregatedClaims.map(c => {
      const anchor = extractAnchor(c.claimText);
      return anchor || "no_anchor";
    })));
    
    // A3.6.9: Diagnostic log for first 2 statements
    if (idx < 2) {
      diag(runId, reqSig, `[CLAIMS_DEDUP] idx=${idx} raw=${rawCandidates.length} unique=${aggregatedClaims.length} merged=${merged} anchorsUnique=${JSON.stringify(anchorsUnique.slice(0, 10))}`);
    }
    
    diag(runId, reqSig, `[CLAIMS_UNIQUE] idx=${idx} raw=${rawCandidates.length} anchors=${anchorsUnique.length} merged=${merged} final=${aggregatedClaims.length}`);
    
    // Sample only for first statement to avoid noise
    if (idx === 0) {
      const sample = rawCandidates.slice(0, 5).map(c => c.claimText);
      diag(runId, reqSig, `[CLAIMS_AGG_SAMPLE] idx=${idx} first5=${JSON.stringify(sample)}`);
    }
  }
  
  // A3.6.1: Apply facet caps
  const cappedClaims = applyFacetCaps(aggregatedClaims, runId, reqSig, idx);
  
  // Get existing citations if available
  const citations = Array.isArray(assessment?.citations) ? assessment.citations : [];
  
  // Score reliability and generate comments for final claims
  const finalClaims = [];
  let hiCount = 0, medCount = 0, lowCount = 0;
  
  // A3.6.2 PATCH: Minimal diagnostics for first 1-2 statements
  const shouldLogDiagnostics = runId && reqSig && idx < 2;
  
  for (const aggClaim of cappedClaims) {
    const claimText = aggClaim.claimText;
    const facet = aggClaim.facet;
    
    // Run corpusSearch for this claim (with hybrid mode, maxHits: 2)
    const searchResult = corpusSearch(claimText, uploadedDocs);
    
    // Check for ambiguity (for valuation/ownership claims)
    const ambiguityResult = detectAnchorAmbiguity(claimText, uploadedDocs);
    
    // Score reliability (A3.6.2 ADDENDUM: anchor-gated semantic equivalence)
    const reliability = scoreClaimReliability(claimText, facet, searchResult, ambiguityResult, uploadedDocs);
    
    // A3.6.11 ADDENDUM: Generic rule-driven diagnostic logging (no topic branching)
    const claimAnchor = extractAnchor(claimText);
    const canonicalClaimAnchor = canonicalizeAnchor(claimAnchor);
    const rules = ANCHOR_RULES[canonicalClaimAnchor] || {};
    if (rules.requireKeywordForHigh && runId && reqSig) {
      const hits = searchResult?.hits || [];
      const allExcerpts = hits.map(h => h.excerpt || "").join(" ").toLowerCase();
      const keywordList = rules.keywordList || [];
      let hasKeyword = false;
      if (keywordList.length > 0) {
        hasKeyword = keywordList.some(keyword => new RegExp(`\\b${keyword}\\b`, "i").test(allExcerpts));
        // Check enterprise value requirement if claim has EV intent
        const hasEnterpriseValueIntent = /\benterprise\s+value\b|\bev\b(?!\w)/i.test(claimText);
        if (hasEnterpriseValueIntent) {
          hasKeyword = hasKeyword && /\benterprise\s+value\b|\bev\b(?!\w)/i.test(allExcerpts);
        }
      }
      let numericMatch = 0;
      if (hits.some(h => h.matchType === "number")) {
        numericMatch = 1;
      }
      diag(runId, reqSig, `[CLAIMS_VALUATION_RULE] idx=${idx} numeric=${numericMatch} keyword=${hasKeyword ? 1 : 0} finalReliability=${reliability}`);
    }
    
    // A3.6.2 PATCH v2: Extract signals for diagnostics (enhanced)
    let diagnosticSignals = null;
    if (shouldLogDiagnostics) {
      const anchor = extractAnchor(claimText);
      const meaningKey = buildMeaningKey(claimText);
      const hits = searchResult?.hits || [];
      
      // A3.6.2 PATCH v2: Enhanced numericMatch for percentages
      let numericMatch = 0;
      if (hits.some(h => h.matchType === "number")) {
        numericMatch = 1;
      } else {
        // Check if claim has percentage and corpus has matching percentage
        const pctMatch = claimText.match(/([\d,]+(?:\.\d+)?)\s*%/);
        if (pctMatch) {
          const claimPct = parseFloat(pctMatch[1].replace(/,/g, ""));
          // Check if corpus excerpts contain this percentage
          const allExcerpts = hits.map(h => h.excerpt || "").join(" ");
          const pctPattern = new RegExp(`([\\d,]+(?:\\.[\\d]+)?)\\s*%`, "g");
          let corpusMatch = false;
          let corpusMatchVal;
          let match;
          while ((match = pctPattern.exec(allExcerpts)) !== null) {
            const corpusPct = parseFloat(match[1].replace(/,/g, ""));
            // Allow 5% tolerance for rounding
            if (Math.abs(claimPct - corpusPct) / Math.max(claimPct, corpusPct) <= 0.05) {
              corpusMatch = true;
              corpusMatchVal = corpusPct;
              break;
            }
          }
          if (corpusMatch) {
            numericMatch = 1;
          }
        }
      }
      const domainKeywordClass = extractDomainKeywordClass(claimText);
      const allExcerpts = hits.map(h => h.excerpt || "").join(" ").toLowerCase();
      const domainKeywordMatch = domainKeywordClass !== "none" && 
        allExcerpts.includes(domainKeywordClass.toLowerCase()) ? 1 : 0;
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
      const entityKey = extractEntityKey(claimText);
      const entityMatch = entityKey && entityKey !== "" && allExcerpts.includes(entityKey) ? 1 : 0;
      
      diagnosticSignals = {
        numericMatch,
        entityMatch,
        verbClassMatch,
        domainKeywordMatch,
      };
      
      diag(runId, reqSig, `[CLAIMS_DIAG] idx=${idx} claim="${claimText.substring(0, 60)}" anchor=${anchor || "none"} meaningKey=${meaningKey.substring(0, 40)} signals=${JSON.stringify(diagnosticSignals)} reliability=${reliability}`);
    }
    
    // Track counts
    if (reliability === "High") hiCount++;
    else if (reliability === "Medium") medCount++;
    else lowCount++;
    
    // Generate comment (with ambiguity awareness)
    const hasAmbiguityCap = (facet === "Valuation" || facet === "Ownership") && 
                            (ambiguityResult?.isAmbiguous || false);
    const comment = generateClaimComment(reliability, facet, hasAmbiguityCap, claimText);
    
    // Build claim object (A3.6.2 PATCH: facet-free output)
    const claim = {
      claimText,
      reliability,
      comment,
    };
    
    // A3.6.10: Preserve explicit anchor if available from aggregated claim
    if (aggClaim.anchor) {
      claim.anchor = aggClaim.anchor;
    }
    
    // Add citations if available
    if (citations.length > 0) {
      claim.citations = citations;
    }
    
    finalClaims.push(claim);
  }
  
  // A3.6.11: Anchor coverage logging - post-condition check (using canonical anchors)
  if (runId && reqSig) {
    const anchorsDetected = allAnchorsInOriginal.map(canonicalizeAnchor);
    const anchorsEmitted = Array.from(new Set(finalClaims.map(c => {
      const anchor = c.anchor || extractAnchor(c.claimText);
      return canonicalizeAnchor(anchor);
    }).filter(Boolean)));
    const missing = Array.from(new Set(anchorsDetected.filter(a => !anchorsEmitted.includes(a))));
    
    if (idx < 2 || missing.length > 0) {
      diag(runId, reqSig, `[CLAIMS_ANCHOR_COVERAGE] idx=${idx} detected=${JSON.stringify(Array.from(anchorsDetected))} emitted=${JSON.stringify(anchorsEmitted)} missing=${JSON.stringify(missing)}`);
    }
  }
  
  // A3.6.2 PATCH: Log statement preview for first 1-2 statements
  if (shouldLogDiagnostics) {
    diag(runId, reqSig, `[CLAIMS_DIAG] idx=${idx} statement="${statementText.substring(0, 100)}" claims=${finalClaims.length}`);
  }
  
  // Log scoring distribution (per statement)
  if (runId && reqSig) {
    diag(runId, reqSig, `[CLAIMS_SCORE] idx=${idx} hi=${hiCount} med=${medCount} low=${lowCount}`);
  }
  
  return finalClaims;
}

// A3.6.10: Universal bracket-tag stripping helper
function stripReasonTags(reasons) {
  if (!Array.isArray(reasons)) return [];
  
  return reasons.map(reason => {
    if (typeof reason !== "string") return reason;
    // Remove any leading bracket tag via regex: /^\[[^\]]+\]\s*/g
    const cleaned = reason.replace(/^\[[^\]]+\]\s*/g, "").trim();
    return cleaned;
  }).filter(reason => {
    // Drop empty strings
    if (typeof reason === "string") return reason.length > 0;
    return true;
  });
}

// A3.6.3: Compute statement reliability from claim reliabilities (deterministic, no LLM)
// Rules:
// - If total == 0: keep existing statement score/label
// - Else:
//   - If low == 0 AND hi >= 1 AND (hi / total) >= 0.5 => statement High
//   - Else if low <= 1 AND (hi + med) >= 2 => statement Medium
//   - Else => statement Low
// Score mapping:
// - High: clamp to 80–95 based on hi/total
// - Medium: clamp to 50–79 based on (hi+med)/total and low presence
// - Low: clamp to 5–49 based on low/total
function computeStatementReliabilityFromClaims(claims, existingScore, existingLabel) {
  if (!Array.isArray(claims) || claims.length === 0) {
    // No claims - keep existing score/label
    return {
      reliabilityScore: existingScore,
      reliabilityLabel: existingLabel,
    };
  }
  
  // Count claim reliabilities
  let hi = 0, med = 0, low = 0;
  for (const claim of claims) {
    const reliability = claim?.reliability;
    if (reliability === "High") hi++;
    else if (reliability === "Medium") med++;
    else if (reliability === "Low") low++;
  }
  
  const total = hi + med + low;
  if (total === 0) {
    // A3.6.8: Empty claims list - return default Medium
    return {
      reliabilityScore: 70,
      reliabilityLabel: "Medium",
      _branch: "EMPTY",
    };
  }
  
  // A3.6.8: Compute statement reliability with fixed deterministic mapping
  let statementLabel;
  let statementScore;
  let branch = "";
  
  // A3.6.8: Rule 1: If low == 0 AND hi >= 1 AND (hi / total) >= 0.5 => High
  if (low === 0 && hi >= 1 && (hi / total) >= 0.5) {
    statementLabel = "High";
    branch = "HIGH_MAJORITY";
    statementScore = 85; // Fixed score for High
  }
  // A3.6.8: Rule 2: Else if low == 0 AND med >= 1 => Medium (any Medium-only set should be Medium, not Low)
  else if (low === 0 && med >= 1) {
    statementLabel = "Medium";
    branch = "MED_ONLY";
    statementScore = 70; // Fixed score for Medium-only
  }
  // A3.6.8: Rule 3: Else if low <= 1 AND (hi + med) >= 2 => Medium
  else if (low <= 1 && (hi + med) >= 2) {
    statementLabel = "Medium";
    branch = "MED_MIXED";
    statementScore = 65; // Fixed score for mixed Medium
  }
  // A3.6.8: Rule 4: Else => Low
  else {
    statementLabel = "Low";
    branch = "LOW";
    statementScore = 30; // Fixed score for Low
  }
  
  return {
    reliabilityScore: statementScore,
    reliabilityLabel: statementLabel,
    _branch: branch, // For logging
  };
}

// A3.6.3: Generate claim-linked reasons (concise, non-boilerplate, max 2 bullets)
// A3.6.11: Tightened - Max 2 bullets, one per distinct canonical anchor
// Format:
// - One bullet per distinct canonical anchor
// - Reason text must start at word boundary, include anchor-bearing phrase, be ≤120 chars
// - Strip all prefixes/facets/tags
// Each bullet < 120 chars, no facet tags, no "[Other]" prefix, includes citations from claims
// Prefer including the anchor-bearing substring rather than long claimText
function generateClaimLinkedReasons(claims) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return [];
  }
  
  // A3.6.11: Deduplicate by canonical anchor - one bullet per distinct canonical anchor
  const seenCanonicalAnchors = new Set();
  
  // A3.6.8: Helper to extract anchor context with word-boundary expansion
  function extractAnchorContext(claimText, anchor) {
    if (!anchor) return claimText;
    
    // Try to find the anchor-bearing substring (e.g., "20%" or "$50M")
    const pctMatch = claimText.match(/(\d+(?:\.\d+)?\s*%)/);
    const usdMatch = claimText.match(/\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b)/i);
    
    let anchorIndex = -1;
    let anchorLength = 0;
    
    if (pctMatch) {
      anchorIndex = claimText.indexOf(pctMatch[0]);
      anchorLength = pctMatch[0].length;
    } else if (usdMatch) {
      anchorIndex = claimText.indexOf(usdMatch[0]);
      anchorLength = usdMatch[0].length;
    } else {
      // For qualitative anchors, find keyword
      const qualType = anchor.replace("qual_", "");
      const qualKeywords = {
        secondary: "secondary",
        premoney: "pre-money",
        postmoney: "post-money",
        fully_diluted: "fully diluted",
        ownership: "ownership",
        stake: "stake",
        financing: "financing",
        valuation: "valuation",
        enterprise_value: "enterprise value",
      };
      const keyword = qualKeywords[qualType] || qualType;
      const keywordMatch = claimText.match(new RegExp(`\\b${keyword}\\b`, "i"));
      if (keywordMatch) {
        anchorIndex = keywordMatch.index;
        anchorLength = keywordMatch[0].length;
      }
    }
    
    if (anchorIndex >= 0) {
      // Extract context around anchor (±30 chars) then expand to word boundaries
      let start = Math.max(0, anchorIndex - 30);
      let end = Math.min(claimText.length, anchorIndex + anchorLength + 30);
      
      // A3.6.8: Expand to word boundaries - move start left to previous whitespace/punctuation boundary
      while (start > 0 && /\w/.test(claimText[start - 1])) {
        start--;
      }
      // Move end right to next whitespace/punctuation boundary
      while (end < claimText.length && /\w/.test(claimText[end])) {
        end++;
      }
      
      let snippet = claimText.substring(start, end).trim();
      
      // A3.6.8: If resulting snippet < 8 chars or starts with lowercase mid-word pattern, fall back to claimText
      if (snippet.length < 8 || /^[a-z]/.test(snippet)) {
        // Check if it's truly mid-word (has alphanumeric before)
        const beforeChar = claimText[start - 1];
        if (beforeChar && /\w/.test(beforeChar)) {
          // Mid-word, use full claimText
          return claimText;
        }
      }
      
      return snippet;
    }
    
    // Fallback: use claimText trimmed
    return claimText.trim();
  }
  
  // A3.6.8: Helper to extract anchor-bearing substring (prefer anchor context, never mid-token)
  function extractAnchorSubstring(claimText) {
    const anchor = extractAnchor(claimText);
    if (anchor) {
      const context = extractAnchorContext(claimText, anchor);
      // If context is reasonable, use it; otherwise use full claimText
      if (context.length >= 8 && !/^[a-z]/.test(context)) {
        return context;
      }
    }
    // Fallback: use claimText (trimmed, but don't truncate mid-token)
    return claimText.trim();
  }
  
  // Helper to normalize text prefix for deduplication
  function normalizeTextPrefix(text) {
    return text.toLowerCase().trim().substring(0, 50).replace(/[^\w\s]/g, "");
  }
  
  // A3.6.11: Group claims by canonical anchor, then select one per anchor
  const claimsByAnchor = new Map();
  for (const claim of claims) {
    const claimText = claim?.claimText || "";
    const anchor = claim?.anchor || extractAnchor(claimText);
    const canonicalAnchor = canonicalizeAnchor(anchor) || "no_anchor";
    
    if (!claimsByAnchor.has(canonicalAnchor)) {
      claimsByAnchor.set(canonicalAnchor, []);
    }
    claimsByAnchor.get(canonicalAnchor).push(claim);
  }
  
  // A3.6.11: Select one claim per canonical anchor (prefer High > Medium > Low)
  const selectedClaims = [];
  for (const [canonicalAnchor, anchorClaims] of claimsByAnchor.entries()) {
    // Sort by reliability (High > Medium > Low)
    anchorClaims.sort((a, b) => {
      const order = { High: 3, Medium: 2, Low: 1 };
      return (order[b?.reliability] || 0) - (order[a?.reliability] || 0);
    });
    // Take the first (best) claim for this anchor
    selectedClaims.push({ claim: anchorClaims[0], canonicalAnchor });
  }
  
  // A3.6.11: Limit to max 2 bullets
  const reasons = [];
  for (const { claim, canonicalAnchor } of selectedClaims.slice(0, 2)) {
    if (seenCanonicalAnchors.has(canonicalAnchor)) continue;
    seenCanonicalAnchors.add(canonicalAnchor);
    
    const claimText = claim?.claimText || "";
    const anchor = claim?.anchor || extractAnchor(claimText);
    
    const comment = claim?.comment || "Not found in sources";
    const citations = Array.isArray(claim?.citations) && claim.citations.length > 0
      ? ` [${claim.citations.join(", ")}]`
      : "";
    
    // A3.6.11: Prefer anchor-bearing substring (never mid-token, start at word boundary)
    let snippet = extractAnchorSubstring(claimText);
    
    // A3.6.11: If snippet is too long, truncate at word boundary (not mid-token)
    if (snippet.length > 50) {
      // Find last space before 50 chars
      const truncateAt = snippet.lastIndexOf(" ", 50);
      if (truncateAt > 20) {
        snippet = snippet.substring(0, truncateAt) + "...";
      } else {
        // No good space found, use first 47 chars and add ellipsis
        snippet = snippet.substring(0, 47) + "...";
      }
    }
    
    // A3.6.11: Build reason: snippet + comment + citations
    let reason = `"${snippet}" ${comment}${citations}`;
    
    // A3.6.11: Ensure ≤120 chars, truncate at word boundary if needed
    if (reason.length > 120) {
      const truncateAt = reason.lastIndexOf(" ", 117);
      if (truncateAt > 80) {
        reason = reason.substring(0, truncateAt) + "...";
      } else {
        reason = reason.substring(0, 117) + "...";
      }
    }
    
    // A3.6.11: Strip all prefixes/facets/tags from reason
    reason = stripReasonTags([reason])[0];
    
    reasons.push(reason);
  }
  
  return reasons; // A3.6.11: Max 2 bullets (already limited by slice(0, 2))
}

// A3.5.34: Scrub repeated phrases from snippets (e.g., "fully diluted ownership fully diluted ownership")
function scrubRepeatedPhrases(snippet) {
  if (!snippet || typeof snippet !== "string") return snippet;
  
  let cleaned = snippet;
  let changed = true;
  let passes = 0;
  const maxPasses = 3;
  
  // Tokenize words
  while (changed && passes < maxPasses) {
    changed = false;
    passes++;
    const words = cleaned.split(/\s+/);
    
    // Scan for adjacent repeated sequences of length 2..6 words
    for (let seqLen = 6; seqLen >= 2; seqLen--) {
      for (let i = 0; i <= words.length - (seqLen * 2); i++) {
        const seq1 = words.slice(i, i + seqLen).join(" ");
        const seq2 = words.slice(i + seqLen, i + (seqLen * 2)).join(" ");
        
        // Case-insensitive comparison
        if (seq1.toLowerCase() === seq2.toLowerCase()) {
          // Remove the second occurrence
          words.splice(i + seqLen, seqLen);
          cleaned = words.join(" ");
          changed = true;
          break; // Restart scan after modification
        }
      }
      if (changed) break;
    }
  }
  
  return cleaned.trim();
}

// A3.5.33: Helper function to extract facet-specific snippet with smart splitting
function extractFacetSnippet(text, facet, avoidOverlap = false) {
  if (!text || typeof text !== "string") return "";
  
  let keywordPattern = null;
  if (facet === "Investment") {
    keywordPattern = /\$[\d,]+(?:\.\d+)?\s*(?:million|mm|billion|b)?|\bup to\b.*\b(?:million|mm|billion|b)?|\binvest\b.*\$\d/i;
  } else if (facet === "Valuation") {
    keywordPattern = /\bpre-?money\b|\bpost-?money\b|\bvaluation\b|\benterprise value\b|\bev\b(?!\w)/i;
  } else if (facet === "Structure") {
    // A3.5.33: Structure snippet must prefer "structured as", "1x", "preferred", "liquidation"
    keywordPattern = /\bstructured as\b|\b1x\b|\bpreferred\b|\bliquidation\b/i;
  } else if (facet === "Ownership") {
    // A3.5.33: Ownership snippet must prefer "%", "fully diluted", "ownership", "stake"
    keywordPattern = /%\b|\bfully diluted\b|\bownership\b|\bstake\b/i;
  } else if (facet === "Timing") {
    keywordPattern = /\bexpected\b|\bwould\b|\bplans\b|\bseeks approval\b/i;
  }
  
  if (!keywordPattern) {
    const words = text.trim().split(/\s+/);
    return words.slice(0, Math.min(12, words.length)).join(" ");
  }
  
  const match = text.match(keywordPattern);
  if (!match) {
    const words = text.trim().split(/\s+/);
    return words.slice(0, Math.min(12, words.length)).join(" ");
  }
  
  const idx = match.index;
  const words = text.split(/\s+/);
  const matchWordIdx = text.substring(0, idx).split(/\s+/).length - 1;
  let start = Math.max(0, matchWordIdx - 4);
  let end = Math.min(words.length, matchWordIdx + 8);
  
  // A3.5.33: Split on separators to isolate facet portion and avoid overlap
  if (avoidOverlap) {
    let snippet = words.slice(start, end).join(" ");
    
    // For Structure: stop before ownership language
    if (facet === "Structure") {
      const ownershipMarkers = /\b(for roughly|resulting in|increasing to|ownership|fully diluted)\b/i;
      const ownershipMatch = snippet.match(ownershipMarkers);
      if (ownershipMatch) {
        const ownershipIdx = snippet.indexOf(ownershipMatch[0]);
        snippet = snippet.substring(0, ownershipIdx).trim();
      }
    }
    
    // For Ownership: avoid including "preferred" if possible
    if (facet === "Ownership") {
      const structureMarkers = /\b(preferred|structured as|1x|liquidation)\b/i;
      const structureMatch = snippet.match(structureMarkers);
      if (structureMatch) {
        // Try to find ownership keywords after structure markers
        const ownershipPattern = /%\b|\bfully diluted\b|\bownership\b|\bstake\b/i;
        const ownershipMatch = snippet.match(ownershipPattern);
        if (ownershipMatch && ownershipMatch.index > structureMatch.index) {
          // Keep only the part after structure markers
          snippet = snippet.substring(ownershipMatch.index).trim();
          // Add some context before
          const beforeWords = snippet.split(/\s+/).slice(0, 3).join(" ");
          snippet = beforeWords + " " + snippet;
        }
      }
    }
    
    if (snippet.length > 80) {
      snippet = snippet.substring(0, 77) + "...";
    }
    // A3.5.34: Apply repeat scrubber
    snippet = scrubRepeatedPhrases(snippet);
    return snippet;
  }
  
  // Standard extraction
  let snippet = words.slice(start, end).join(" ").trim();
  if (snippet.length > 80) {
    snippet = snippet.substring(0, 77) + "...";
  }
  // A3.5.34: Apply repeat scrubber
  snippet = scrubRepeatedPhrases(snippet);
  return snippet;
}

// A3.5.31: Normalize assessment reasons - dedupe, ban generic bullets, enforce facet tagging, enforce diversity
// A3.5.31: Add consistency gates to prevent contradictory "no sources" bullets when sources exist
// A3.6.2 PATCH v2: Disable facet generation (facet-free mode)
// Returns normalized reasons array and stats for logging
function normalizeAssessmentReasons(statementText, reasons, opts = {}) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return { reasons: [], stats: { before: 0, after: 0, deduped: 0, autoFacet: 0, autoSnippet: 0, addedDeterministic: 0, removedAnchorBoilerplate: 0, replacedWeakestForFacet: 0, usedDeterministicSet: false } };
  }
  
  // A3.6.5: Skip normalization if reasons are claim-linked
  const { hasCitations = false, hasEvidence = false, facetsDetected = [], disableFacets = false, reasonsSource = null } = opts;
  if (reasonsSource === "claims") {
    // Claim-linked reasons should not be normalized - return as-is
    return { reasons, stats: { before: reasons.length, after: reasons.length, deduped: 0, autoFacet: 0, autoSnippet: 0, addedDeterministic: 0, removedAnchorBoilerplate: 0, replacedWeakestForFacet: 0, usedDeterministicSet: false } };
  }
  const hasSources = hasCitations || hasEvidence;
  
  // A3.6.2 PATCH v2: Hard feature-off for facet generation
  const FACET_MODE_DISABLED = disableFacets || true; // Always disabled in A3.6.2+
  
  const stats = { before: reasons.length, deduped: 0, autoFacet: 0, autoSnippet: 0, addedDeterministic: 0, removedAnchorBoilerplate: 0, replacedWeakestForFacet: 0, usedDeterministicSet: false };
  let normalized = [];
  
  // Step 1: De-duplicate bullets
  const seen = new Set();
  const seenLower = new Set();
  
  for (const reason of reasons) {
    if (typeof reason !== "string") {
      normalized.push(reason);
      continue;
    }
    
    const trimmed = reason.trim();
    if (!trimmed) continue;
    
    const lower = trimmed.toLowerCase();
    
    // Exact match dedupe
    if (seen.has(trimmed)) {
      stats.deduped++;
      continue;
    }
    
    // Near-identical dedupe (lowercased)
    if (seenLower.has(lower)) {
      stats.deduped++;
      continue;
    }
    
    seen.add(trimmed);
    seenLower.add(lower);
    normalized.push(trimmed);
  }
  
  // Step 2: A3.5.34 Hard-remove anchor-boilerplate bullets (match anywhere, not just at start)
  // A3.5.34: Pattern should match anywhere in the bullet (case-insensitive)
  normalized = normalized.filter((reason) => {
    if (typeof reason !== "string") return true;
    
    // Remove any bullet where "all anchor facts" matches ANYWHERE
    if (/all anchor facts/i.test(reason)) {
      stats.removedAnchorBoilerplate++;
      return false;
    }
    
    // Remove bullets matching "anchor facts ... supported" anywhere
    if (/anchor facts .*supported/i.test(reason)) {
      stats.removedAnchorBoilerplate++;
      return false;
    }
    
    // Remove generic "supported by the uploaded sources" without facet/snippet specificity
    if (/supported by the uploaded sources/i.test(reason)) {
      const hasFacetTag = /^\[(Investment|Valuation|Structure|Ownership|Timing)\]/i.test(reason);
      const hasSnippet = /"[^"]{1,120}"/.test(reason);
      if (!hasFacetTag || !hasSnippet) {
        stats.removedAnchorBoilerplate++;
        return false;
      }
    }
    
    return true;
  });
  
  // Step 2.5: A3.5.31 Consistency gates - remove contradictory "no sources" bullets when sources exist
  if (hasSources) {
    const contradictoryPatterns = [
      /no verifiable sources cited/i,
      /no sources cited/i,
      /could not be verified against provided sources/i,
      /cannot be verified/i,
    ];
    
    // Also remove "not fully verified" if it's absolute and lacks facet/snippet
    normalized = normalized.filter((reason) => {
      if (typeof reason !== "string") return true;
      
      const isContradictory = contradictoryPatterns.some(pattern => pattern.test(reason));
      if (isContradictory) {
        stats.deduped++;
        return false;
      }
      
      // Check for absolute "not fully verified" without facet/snippet
      if (/not fully verified/i.test(reason)) {
        const hasFacetTag = /^\[(Investment|Valuation|Structure|Ownership|Timing|Other)\]/i.test(reason);
        const hasSnippet = /"[^"]{1,120}"/.test(reason);
        if (!hasFacetTag || !hasSnippet) {
          stats.deduped++;
          return false;
        }
      }
      
      return true;
    });
  } else {
    // If NO citations/evidence, keep at most one "missing citations" bullet
    // But require facet tag + snippet
    const missingCitationPatterns = [
      /no (?:verifiable )?sources cited/i,
      /not supported in provided sources/i,
      /cannot be verified/i,
      /could not be verified/i,
    ];
    
    let missingCitationCount = 0;
    normalized = normalized.filter((reason) => {
      if (typeof reason !== "string") return true;
      
      const isMissingCitation = missingCitationPatterns.some(pattern => pattern.test(reason));
      if (isMissingCitation) {
        missingCitationCount++;
        // Keep only the first one, and only if it has facet tag + snippet
        if (missingCitationCount === 1) {
          const hasFacetTag = /^\[(Investment|Valuation|Structure|Ownership|Timing|Other)\]/i.test(reason);
          const hasSnippet = /"[^"]{1,120}"/.test(reason);
          if (hasFacetTag && hasSnippet) {
            return true;
          }
        }
        stats.deduped++;
        return false;
      }
      return true;
    });
  }
  
  // Step 2.6: A3.5.32 Collapse "support some elements" into a single summary bullet (max 1)
  const partialSupportPatterns = [
    /support some elements/i,
    /do not explicitly support all claims/i,
    /partially supported/i,
  ];
  
  let partialSupportCount = 0;
  let bestPartialSupport = null;
  let bestPartialSupportIndex = -1;
  
  normalized.forEach((reason, idx) => {
    if (typeof reason !== "string") return;
    
    const isPartialSupport = partialSupportPatterns.some(pattern => pattern.test(reason));
    if (isPartialSupport) {
      partialSupportCount++;
      
      // Prefer the one with a facet tag other than [Other] and a clear snippet
      const hasFacetTag = /^\[(Investment|Valuation|Structure|Ownership|Timing)\]/i.test(reason);
      const hasSnippet = /"[^"]{1,120}"/.test(reason);
      
      // If we don't have a best one yet, or this one is better, use it
      if (!bestPartialSupport || (hasFacetTag && hasSnippet && !/^\[Other\]/i.test(reason))) {
        bestPartialSupport = reason;
        bestPartialSupportIndex = idx;
      }
    }
  });
  
  // If we have multiple partial support bullets, keep only the best one
  if (partialSupportCount > 1) {
    normalized = normalized.filter((reason, idx) => {
      if (typeof reason !== "string") return true;
      
      const isPartialSupport = partialSupportPatterns.some(pattern => pattern.test(reason));
      if (isPartialSupport) {
        // Keep only the best one
        if (idx === bestPartialSupportIndex) {
          return true;
        }
        stats.deduped++;
        return false;
      }
      return true;
    });
    
    // Reassign [Other] to a better facet if needed
    if (bestPartialSupportIndex >= 0 && bestPartialSupportIndex < normalized.length) {
      const bestReason = normalized[bestPartialSupportIndex];
      // A3.6.2 PATCH v2: Skip facet generation if disabled
      if (!FACET_MODE_DISABLED && typeof bestReason === "string" && /^\[Other\]/i.test(bestReason)) {
        const text = typeof statementText === "string" ? statementText : "";
        const lower = text.toLowerCase();
        let newFacet = null;
        
        if (/\b(?:pre-?money|post-?money|valuation|enterprise value|ev)\b/.test(lower)) {
          newFacet = "Valuation";
        } else if (/\b(?:ownership|stake|fully diluted)\b|%\b/.test(lower)) {
          newFacet = "Ownership";
        } else if (/\b(?:preferred|structured|1x|liquidation|terms)\b/.test(lower)) {
          newFacet = "Structure";
        } else if (/\b(?:invest|investment)\b|\$[\d,]+(?:\.\d+)?\s*(?:million|mm|billion|b)/.test(lower)) {
          newFacet = "Investment";
        }
        
        if (newFacet) {
          normalized[bestPartialSupportIndex] = bestReason.replace(/^\[Other\]/i, `[${newFacet}]`);
          stats.autoFacet++;
        }
      }
    }
  }
  
  // Step 3: Enforce facet tagging and snippet binding
  // A3.6.2 PATCH v2: Skip if facet mode disabled
  if (!FACET_MODE_DISABLED) {
    const validFacets = ["Investment", "Valuation", "Structure", "Ownership", "Timing", "Other"];
    const facetPattern = /^\[(Investment|Valuation|Structure|Ownership|Timing|Other)\]/i;
    const snippetPattern = /"[^"]{1,120}"/;
    
    normalized = normalized.map((reason) => {
      if (typeof reason !== "string") return reason;
      
      let updated = reason;
      let modified = false;
      
      // Check if has facet tag
      const hasFacetTag = facetPattern.test(updated);
      
      // Check if has quoted snippet
      const hasSnippet = snippetPattern.test(updated);
      
      // If missing facet tag, prefix [Other]
      if (!hasFacetTag) {
        updated = `[Other] ${updated}`;
        modified = true;
        stats.autoFacet++;
      }
      
      // If missing snippet, inject one
      if (!hasSnippet) {
        // A3.5.33: Use helper function for facet-specific snippet extraction with smart splitting
        const text = typeof statementText === "string" ? statementText : "";
        const facetNameMatch = updated.match(/^\[(\w+)\]/i);
        const facetName = facetNameMatch ? facetNameMatch[1] : "";
        
        // Use avoidOverlap for Structure and Ownership to prevent snippet overlap
        const avoidOverlap = (facetName === "Structure" || facetName === "Ownership");
        let snippet = extractFacetSnippet(text, facetName, avoidOverlap);
        
        if (!snippet) {
          snippet = "statement clause";
        }
        
        // Insert snippet after facet tag
        const facetMatch = updated.match(/^(\[[^\]]+\])\s*(.*)/);
        if (facetMatch) {
          updated = `${facetMatch[1]} "${snippet}" ${facetMatch[2]}`.trim();
        } else {
          updated = `"${snippet}" ${updated}`.trim();
        }
        modified = true;
        stats.autoSnippet++;
      }
      
      return updated;
    });
  }
  
  // Step 4: Replace [Other] with a real facet whenever possible
  // A3.6.2 PATCH v2: Skip if facet mode disabled
  if (!FACET_MODE_DISABLED) {
    normalized = normalized.map((reason) => {
      if (typeof reason !== "string") return reason;
      
      if (!/^\[Other\]/i.test(reason)) return reason;
      
      const lower = reason.toLowerCase();
      let newFacet = null;
      
      // Check for Valuation keywords
      if (/\b(?:pre-?money|post-?money|valuation|enterprise value|ev)\b/.test(lower)) {
        newFacet = "Valuation";
      }
      // Check for Ownership keywords
      else if (/\b(?:ownership|stake|fully diluted)\b|%\b/.test(lower)) {
        newFacet = "Ownership";
      }
      // Check for Structure keywords
      else if (/\b(?:preferred|structured|1x|liquidation|terms)\b/.test(lower)) {
        newFacet = "Structure";
      }
      // Check for Investment keywords
      else if (/\b(?:invest|investment)\b|\$[\d,]+(?:\.\d+)?\s*(?:million|mm|billion|b)/.test(lower)) {
        newFacet = "Investment";
      }
      
      if (newFacet) {
        stats.autoFacet++;
        return reason.replace(/^\[Other\]/i, `[${newFacet}]`);
      }
      
      return reason;
    });
  }
  
  // Step 5: Enforce facet diversity for multi-claim statements
  // A3.5.31: Use facetsDetected from opts, or detect if not provided
  const detectedFacets = facetsDetected.length > 0 ? facetsDetected : detectFacetsInStatement(statementText);
  
  // A3.5.31: If 3+ facets detected, require at least 2 distinct facet tags (excluding [Other])
  // Note: Step 6 will handle the >=3 facets case with minFacetsRequired=3, so this is for 2 facets case
  const minFacetsRequiredStep5 = detectedFacets.length >= 2 ? 2 : 0;
  
  if (minFacetsRequiredStep5 > 0) {
    // Extract distinct facets from current reasons (excluding [Other])
    const currentFacets = new Set();
    normalized.forEach((reason) => {
      if (typeof reason !== "string") return;
      const match = reason.match(/^\[(\w+)\]/i);
      if (match && match[1] !== "Other") {
        currentFacets.add(match[1]);
      }
    });
    
    // Need at least minFacetsRequiredStep5 distinct facets (not counting [Other])
    if (currentFacets.size < minFacetsRequiredStep5) {
      // Generate deterministic bullets for missing facets (up to 2)
      const missingFacets = detectedFacets.filter(f => f !== "Other" && !currentFacets.has(f)).slice(0, 2);
      const text = typeof statementText === "string" ? statementText : "";
      
      for (const facet of missingFacets) {
        if (normalized.length >= 4) break; // Max 4 bullets
        
        // A3.5.33: Use helper function for facet-specific snippet extraction with smart splitting
        // Use avoidOverlap for Structure and Ownership to prevent snippet overlap
        const avoidOverlap = (facet === "Structure" || facet === "Ownership");
        let snippet = extractFacetSnippet(text, facet, avoidOverlap);
        
        if (!snippet) {
          snippet = "statement clause";
        }
        
        // A3.5.31: Generate deterministic bullet with better wording
        // Never claim "not cited" when citations exist; use ambiguity/verification framing
        let bullet = "";
        if (facet === "Valuation") {
          if (hasSources) {
            bullet = `[Valuation] "${snippet}" Memo contains valuation figures; figure may be ambiguous across values—verify which applies.`;
          } else {
            bullet = `[Valuation] "${snippet}" Valuation figure not supported in provided sources; verify against memo.`;
          }
        } else if (facet === "Structure") {
          // A3.5.33: Deterministic fill for Structure
          if (hasSources) {
            bullet = `[Structure] "${snippet}" Investment terms (e.g., preferred / 1x) may not be explicitly confirmed in the cited excerpt; treat as unverified unless directly stated.`;
          } else {
            bullet = `[Structure] "${snippet}" Investment terms (e.g., preferred / 1x) not supported in provided sources; verify against memo.`;
          }
        } else if (facet === "Investment") {
          if (hasSources) {
            bullet = `[Investment] "${snippet}" Amount may be ambiguous across memo values; verify which applies.`;
          } else {
            bullet = `[Investment] "${snippet}" Investment amount not supported in provided sources; verify against memo.`;
          }
        } else if (facet === "Ownership") {
          if (hasSources) {
            bullet = `[Ownership] "${snippet}" Ownership percentage should be validated against the memo's cap table / fully-diluted basis.`;
          } else {
            bullet = `[Ownership] "${snippet}" Ownership percentage not supported in provided sources; verify against memo.`;
          }
        } else {
          if (hasSources) {
            bullet = `[${facet}] "${snippet}" May not be explicitly confirmed in the visible excerpt; verify against sources.`;
          } else {
            bullet = `[${facet}] "${snippet}" Not supported in provided sources; verify against memo.`;
          }
        }
        
        normalized.push(bullet);
        stats.addedDeterministic++;
      }
    }
  }
  
  // Step 6: A3.5.33 Enforce "must-cover" facets with priority order
  const detectedFacetsForCoverage = facetsDetected.length > 0 ? facetsDetected : detectFacetsInStatement(statementText);
  const presentFacets = new Set();
  normalized.forEach((reason) => {
    if (typeof reason !== "string") return;
    const match = reason.match(/^\[(\w+)\]/i);
    if (match && match[1] !== "Other") {
      presentFacets.add(match[1]);
    }
  });
  
  // A3.5.33: Define must-cover facets in priority order
  const mustCoverFacets = ["Investment", "Valuation", "Ownership", "Structure", "Timing"];
  
  // A3.5.33: For multi-claim statements (>=3 facets), ensure at least 3 distinct facets
  const minFacetsRequired = detectedFacetsForCoverage.length >= 3 ? 3 : 0;
  
  // A3.5.33: Additionally, if Structure AND Ownership are detected, ensure BOTH appear
  const needsStructure = detectedFacetsForCoverage.includes("Structure") && !presentFacets.has("Structure");
  const needsOwnership = detectedFacetsForCoverage.includes("Ownership") && !presentFacets.has("Ownership");
  const needsBothStructureAndOwnership = detectedFacetsForCoverage.includes("Structure") && 
                                         detectedFacetsForCoverage.includes("Ownership") &&
                                         (needsStructure || needsOwnership);
  
  // Determine which facets need to be added
  const missingMustCoverFacets = [];
  
  // Check priority order for must-cover facets
  for (const facet of mustCoverFacets) {
    if (detectedFacetsForCoverage.includes(facet) && !presentFacets.has(facet)) {
      missingMustCoverFacets.push(facet);
    }
  }
  
  // If Structure AND Ownership are both detected, ensure both are added
  if (needsBothStructureAndOwnership) {
    if (needsStructure && !missingMustCoverFacets.includes("Structure")) {
      missingMustCoverFacets.push("Structure");
    }
    if (needsOwnership && !missingMustCoverFacets.includes("Ownership")) {
      missingMustCoverFacets.push("Ownership");
    }
  }
  
  // Check if we need more facets for multi-claim statements
  if (minFacetsRequired > 0 && presentFacets.size < minFacetsRequired) {
    const additionalNeeded = minFacetsRequired - presentFacets.size;
    const additionalFacets = detectedFacetsForCoverage
      .filter(f => f !== "Other" && !presentFacets.has(f) && !missingMustCoverFacets.includes(f))
      .slice(0, additionalNeeded);
    missingMustCoverFacets.push(...additionalFacets);
  }
  
  // Helper function to find weakest bullet for replacement
  function findWeakestBullet(normalized) {
    let weakestIndex = -1;
    let weakestPriority = Infinity;
    let weakestSnippetLength = Infinity;
    
    normalized.forEach((reason, idx) => {
      if (typeof reason !== "string") return;
      
      let priority = Infinity;
      const match = reason.match(/^\[(\w+)\]/i);
      const facet = match ? match[1] : "";
      
      // Priority 1: [Other] bullets (weakest)
      if (facet === "Other") {
        priority = 1;
      }
      // Priority 2: duplicate facet bullets (same facet tag repeated)
      else {
        const facetCount = normalized.filter((r) => {
          if (typeof r !== "string") return false;
          const m = r.match(/^\[(\w+)\]/i);
          return m && m[1] === facet;
        }).length;
        if (facetCount > 1) {
          priority = 2;
        }
      }
      
      // Priority 3: generic "partially supported" summary (if another ambiguity/support bullet exists)
      if (priority === Infinity && /support some elements|do not explicitly support all claims|partially supported/i.test(reason)) {
        const hasOtherSupport = normalized.some((r, i) => {
          if (i === idx || typeof r !== "string") return false;
          return /support|ambiguity|may be|not explicitly/i.test(r);
        });
        if (hasOtherSupport) {
          priority = 3;
        }
      }
      
      // Priority 4: least-specific snippet (shortest snippet match)
      if (priority === Infinity) {
        const snippetMatch = reason.match(/"([^"]+)"/);
        if (snippetMatch) {
          priority = 4;
          const snippetLength = snippetMatch[1].length;
          if (priority < weakestPriority || (priority === weakestPriority && snippetLength < weakestSnippetLength)) {
            weakestPriority = priority;
            weakestIndex = idx;
            weakestSnippetLength = snippetLength;
          }
          return;
        }
      }
      
      if (priority < weakestPriority) {
        weakestPriority = priority;
        weakestIndex = idx;
      }
    });
    
    return weakestIndex;
  }
  
  // Add missing facets
  const textForFacets = typeof statementText === "string" ? statementText : "";
  for (const facet of missingMustCoverFacets) {
    if (normalized.length >= 4) {
      // At bullet cap, replace weakest
      const weakestIndex = findWeakestBullet(normalized);
      if (weakestIndex >= 0) {
        let snippet = extractFacetSnippet(textForFacets, facet, true); // Use avoidOverlap for Structure/Ownership
        if (!snippet) snippet = "statement clause";
        
        let bullet = "";
        if (facet === "Ownership") {
          bullet = `[Ownership] "${snippet}" Ownership percentage should be validated against fully-diluted basis / cap table in memo.`;
        } else if (facet === "Structure") {
          // A3.5.33: Deterministic fill for Structure
          bullet = `[Structure] "${snippet}" Investment terms (e.g., preferred / 1x) may not be explicitly confirmed in the cited excerpt; treat as unverified unless directly stated.`;
        } else if (facet === "Valuation") {
          if (hasSources) {
            bullet = `[Valuation] "${snippet}" Memo contains valuation figures; figure may be ambiguous across values—verify which applies.`;
          } else {
            bullet = `[Valuation] "${snippet}" Valuation figure not supported in provided sources; verify against memo.`;
          }
        } else if (facet === "Investment") {
          if (hasSources) {
            bullet = `[Investment] "${snippet}" Amount may be ambiguous across memo values; verify which applies.`;
          } else {
            bullet = `[Investment] "${snippet}" Investment amount not supported in provided sources; verify against memo.`;
          }
        } else {
          if (hasSources) {
            bullet = `[${facet}] "${snippet}" May not be explicitly confirmed in the visible excerpt; verify against sources.`;
          } else {
            bullet = `[${facet}] "${snippet}" Not supported in provided sources; verify against memo.`;
          }
        }
        
        normalized[weakestIndex] = bullet;
        stats.replacedWeakestForFacet++;
        stats.addedDeterministic++;
        presentFacets.add(facet);
      }
    } else {
      // Have space, add bullet
      let snippet = extractFacetSnippet(textForFacets, facet, true); // Use avoidOverlap for Structure/Ownership
      if (!snippet) snippet = "statement clause";
      
      let bullet = "";
      if (facet === "Ownership") {
        bullet = `[Ownership] "${snippet}" Ownership percentage should be validated against fully-diluted basis / cap table in memo.`;
      } else if (facet === "Structure") {
        // A3.5.33: Deterministic fill for Structure
        bullet = `[Structure] "${snippet}" Investment terms (e.g., preferred / 1x) may not be explicitly confirmed in the cited excerpt; treat as unverified unless directly stated.`;
      } else if (facet === "Valuation") {
        if (hasSources) {
          bullet = `[Valuation] "${snippet}" Memo contains valuation figures; figure may be ambiguous across values—verify which applies.`;
        } else {
          bullet = `[Valuation] "${snippet}" Valuation figure not supported in provided sources; verify against memo.`;
        }
      } else if (facet === "Investment") {
        if (hasSources) {
          bullet = `[Investment] "${snippet}" Amount may be ambiguous across memo values; verify which applies.`;
        } else {
          bullet = `[Investment] "${snippet}" Investment amount not supported in provided sources; verify against memo.`;
        }
      } else {
        if (hasSources) {
          bullet = `[${facet}] "${snippet}" May not be explicitly confirmed in the visible excerpt; verify against sources.`;
        } else {
          bullet = `[${facet}] "${snippet}" Not supported in provided sources; verify against memo.`;
        }
      }
      
      normalized.push(bullet);
      stats.addedDeterministic++;
      presentFacets.add(facet);
    }
  }
  
  // Step 7: A3.5.34 Deterministic reason-set for multi-claim numeric statements
  const detectedFacetsForDeterministic = facetsDetected.length > 0 ? facetsDetected : detectFacetsInStatement(statementText);
  const textForDeterministic = typeof statementText === "string" ? statementText : "";
  
  // Define "multi-claim numeric" as: facetsDetected length >= 3 AND statementText contains 2+ distinct numeric anchors
  const numericAnchorPattern = /[\d,]+(?:\.\d+)?|%|\$[\d,]+(?:\.\d+)?|[\d.]+x/i;
  const numericMatches = textForDeterministic.match(new RegExp(numericAnchorPattern.source, 'gi'));
  const distinctNumericAnchors = new Set(numericMatches || []);
  const isMultiClaimNumeric = detectedFacetsForDeterministic.length >= 3 && distinctNumericAnchors.size >= 2;
  
  if (isMultiClaimNumeric) {
    // Keep at most ONE "ambiguity/multi-match" bullet if it exists
    const ambiguityPattern = /ambiguous|multiple memo values|verify which applies/i;
    let keptAmbiguityBullet = null;
    let keptAmbiguityIndex = -1;
    
    normalized.forEach((reason, idx) => {
      if (typeof reason !== "string") return;
      if (ambiguityPattern.test(reason) && keptAmbiguityBullet === null) {
        keptAmbiguityBullet = reason;
        keptAmbiguityIndex = idx;
      }
    });
    
    // Discard remaining model bullets (except the kept ambiguity bullet)
    if (keptAmbiguityBullet) {
      normalized = [keptAmbiguityBullet];
    } else {
      normalized = [];
    }
    
    // Generate deterministic bullets for must-cover facets (up to 4)
    const deterministicFacets = ["Investment", "Valuation", "Structure", "Ownership"];
    const facetsToAdd = deterministicFacets.filter(f => detectedFacetsForDeterministic.includes(f));
    
    for (const facet of facetsToAdd) {
      if (normalized.length >= 4) break;
      
      let snippet = extractFacetSnippet(textForDeterministic, facet, true); // Use avoidOverlap + scrubber
      if (!snippet) snippet = "statement clause";
      
      let bullet = "";
      if (facet === "Investment") {
        bullet = `[Investment] "${snippet}" Memo supports the core amount/intent; confirm execution vs approval wording.`;
      } else if (facet === "Valuation") {
        bullet = `[Valuation] "${snippet}" Multiple valuation figures may exist; verify which value applies.`;
      } else if (facet === "Structure") {
        bullet = `[Structure] "${snippet}" Terms may not be explicitly confirmed in the cited excerpt; treat as unverified unless stated.`;
      } else if (facet === "Ownership") {
        bullet = `[Ownership] "${snippet}" Validate the fully-diluted basis/cap table; % may depend on definition.`;
      }
      
      normalized.push(bullet);
      stats.addedDeterministic++;
    }
    
    // If we kept an ambiguity bullet, cap total at 4 by dropping the weakest deterministic one (typically Structure last)
    if (keptAmbiguityBullet && normalized.length > 4) {
      // Find Structure bullet (typically last) and remove it
      // The ambiguity bullet is at index 0, so look for Structure starting from index 1
      const structureIndex = normalized.findIndex((r, idx) => {
        if (idx === 0) return false; // Don't remove the ambiguity bullet (at index 0)
        return typeof r === "string" && /^\[Structure\]/i.test(r);
      });
      
      if (structureIndex >= 0) {
        normalized.splice(structureIndex, 1);
      } else {
        // If no Structure, remove the last deterministic bullet (not the ambiguity bullet at index 0)
        if (normalized.length > 1) {
          normalized.splice(normalized.length - 1, 1);
        }
      }
    }
    
    stats.usedDeterministicSet = true;
  } else {
    stats.usedDeterministicSet = false;
  }
  
  // Cap at 4 bullets total
  normalized = normalized.slice(0, 4);
  stats.after = normalized.length;
  
  return { reasons: normalized, stats };
}

// A3.5.13c: Extract anchor elements from compound numeric statements
// Returns array of anchor elements, each with kind, rawText, normalizedNumber, keywords
// Only returns elements if statement contains ≥2 numeric anchor elements
function extractAnchorElements(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  
  const elements = [];
  
  // Investment amount patterns (must have /g flag for matchAll)
  const investmentPatterns = [
    /(?:invest|investment|commitment|commit)\s+(?:of|at|is|was)\s*\$?([\d,]+(?:\.\d+)?)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s*(?:million|mm|m|billion|b)\s+(?:investment|commitment|commit)/gi,
  ];
  
  // Valuation pre-money patterns (must have /g flag for matchAll)
  const valuationPreMoneyPatterns = [
    /(?:pre-?money|pre money|premoney)\s+(?:valuation|val)\s+(?:of|at|is|was)?\s*\$?([\d,]+(?:\.\d+)?)/gi,
    /(?:valuation|val)\s+(?:of|at|is|was)\s*\$?([\d,]+(?:\.\d+)?)\s+(?:pre-?money|pre money|premoney)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s+(?:pre-?money|pre money|premoney)\s+(?:valuation|val)/gi,
  ];
  
  // Ownership percentage patterns (must have /g flag for matchAll)
  const ownershipPatterns = [
    /(?:ownership|equity stake|stake|equity)\s+(?:of|at|is|was)?\s*(\d+(?:\.\d+)?)\s*%/gi,
    /(\d+(?:\.\d+)?)\s*%\s+(?:ownership|equity|stake|fully diluted)/gi,
    /(?:fully diluted|diluted)\s+(?:ownership|equity|stake)\s+(?:of|at|is|was)?\s*(\d+(?:\.\d+)?)\s*%/gi,
  ];
  
  // Secondary amount patterns (must have /g flag for matchAll)
  const secondaryPatterns = [
    /(?:secondary|common shares|secondary sale|secondary transaction)\s+(?:of|at|is|was)?\s*\$?([\d,]+(?:\.\d+)?)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s+(?:secondary|common shares|secondary sale)/gi,
  ];
  
  // Extract investment amounts
  for (const pattern of investmentPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const numStr = (match[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      
      const normalizedValue = normalizeAnchorValue(match[0]);
      if (normalizedValue !== null) {
        elements.push({
          kind: "investment_amount",
          rawText: match[0],
          normalizedNumber: normalizedValue,
          keywords: ["investment", "commitment", "commit", "invest"],
        });
      }
    }
  }
  
  // Extract valuation pre-money
  for (const pattern of valuationPreMoneyPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const numStr = (match[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      
      const normalizedValue = normalizeAnchorValue(match[0]);
      if (normalizedValue !== null) {
        elements.push({
          kind: "valuation_premoney",
          rawText: match[0],
          normalizedNumber: normalizedValue,
          keywords: ["pre-money", "premoney", "valuation", "val"],
        });
      }
    }
  }
  
  // Extract ownership percentage
  for (const pattern of ownershipPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const numStr = (match[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      
      elements.push({
        kind: "ownership_pct",
        rawText: match[0],
        normalizedNumber: num, // Percentage as-is
        keywords: ["ownership", "equity", "stake", "fully diluted", "diluted"],
      });
    }
  }
  
  // Extract secondary amounts
  for (const pattern of secondaryPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const numStr = (match[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      
      const normalizedValue = normalizeAnchorValue(match[0]);
      if (normalizedValue !== null) {
        elements.push({
          kind: "secondary_amount",
          rawText: match[0],
          normalizedNumber: normalizedValue,
          keywords: ["secondary", "common shares", "secondary sale"],
        });
      }
    }
  }
  
  // Only return if ≥2 elements found (compound statement)
  return elements.length >= 2 ? elements : [];
}

// A3.5.13c: Validate compound numeric anchor elements independently
// Returns { elements: Array, verdicts: Map<kind, verdict>, supportedKinds: Set, missingKinds: Set, ambiguousKinds: Set }
function validateCompoundNumericAnchors(statementText, uploadedDocs) {
  if (typeof statementText !== "string" || !statementText.trim()) {
    return { elements: [], verdicts: new Map(), supportedKinds: new Set(), missingKinds: new Set(), ambiguousKinds: new Set() };
  }
  
  if (!Array.isArray(uploadedDocs) || uploadedDocs.length === 0) {
    return { elements: [], verdicts: new Map(), supportedKinds: new Set(), missingKinds: new Set(), ambiguousKinds: new Set() };
  }
  
  // Extract anchor elements (only if ≥2 found)
  const elements = extractAnchorElements(statementText);
  if (elements.length < 2) {
    return { elements: [], verdicts: new Map(), supportedKinds: new Set(), missingKinds: new Set(), ambiguousKinds: new Set() };
  }
  
  const verdicts = new Map();
  const supportedKinds = new Set();
  const missingKinds = new Set();
  const ambiguousKinds = new Set();
  
  // Combine corpus text
  const corpusText = uploadedDocs.map(doc => doc.text || "").join("\n\n");
  
  // Group elements by kind for ambiguity detection
  const elementsByKind = new Map();
  for (const element of elements) {
    if (!elementsByKind.has(element.kind)) {
      elementsByKind.set(element.kind, []);
    }
    elementsByKind.get(element.kind).push(element);
  }
  
  // Validate each element independently
  for (const element of elements) {
    // Run corpusSearch on the element (not the whole statement)
    const elementText = element.rawText;
    const searchResult = corpusSearch(elementText, uploadedDocs);
    
    if (searchResult.found) {
      // Check for ambiguity: multiple distinct values for same kind
      const sameKindElements = elementsByKind.get(element.kind) || [];
      if (sameKindElements.length >= 2) {
        // Check if corpus has multiple distinct values for this kind
        const corpusNumericValues = extractNumericValues(corpusText);
        const matchingCorpusValues = Array.from(corpusNumericValues).filter(cv => {
          return sameKindElements.some(se => numericValuesMatch(se.normalizedNumber, cv));
        });
        
        // Also check for multiple distinct values in statement itself
        const statementValues = sameKindElements.map(e => e.normalizedNumber);
        const distinctStatementValues = new Set(statementValues);
        
        if (distinctStatementValues.size >= 2 || matchingCorpusValues.length >= 2) {
          // Ambiguity detected
          verdicts.set(element.kind, "AMBIGUOUS");
          ambiguousKinds.add(element.kind);
        } else {
          verdicts.set(element.kind, "SUPPORTED");
          supportedKinds.add(element.kind);
        }
      } else {
        verdicts.set(element.kind, "SUPPORTED");
        supportedKinds.add(element.kind);
      }
    } else {
      verdicts.set(element.kind, "NOT_FOUND");
      missingKinds.add(element.kind);
    }
  }
  
  return { elements, verdicts, supportedKinds, missingKinds, ambiguousKinds };
}

// Normalize numeric anchor value: convert "$20mm", "$20m", "$20 million" to numeric value
// Invariant 1: Numeric anchor normalization
function normalizeAnchorValue(text) {
  if (typeof text !== "string") return null;
  
  // Pattern: $XXmm, $XXm, $XX million, $XXM, etc.
  const patterns = [
    /\$([\d,]+(?:\.\d+)?)\s*(mm|million|m\b|M\b)/i,
    /\$([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/i,
    /\$([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/i,
    /\$([\d,]+(?:\.\d+)?)\s*(trillion|t\b|T\b)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const numStr = match[1].replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      
      const unit = match[2].toLowerCase();
      const multipliers = {
        mm: 1e6, million: 1e6, m: 1e6,
        billion: 1e9, b: 1e9,
        thousand: 1e3, k: 1e3,
        trillion: 1e12, t: 1e12,
      };
      
      const multiplier = multipliers[unit] || 1;
      return num * multiplier;
    }
  }
  
  // Try plain number with $ prefix
  const plainMatch = text.match(/\$([\d,]+(?:\.\d+)?)/);
  if (plainMatch) {
    const numStr = plainMatch[1].replace(/,/g, "");
    const num = parseFloat(numStr);
    if (Number.isFinite(num)) return num;
  }
  
  return null;
}

// Extract anchor facts from statement text (valuation, funding, revenue, governance, security terms, etc.)
// A3.5.13 Addendum: Extended to detect all anchor types including non-numeric anchors
function extractAnchorFacts(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  
  const facts = [];
  
  // Valuation patterns
  const valuationPatterns = [
    /(?:pre-?money|pre money|premoney)\s+(?:valuation|val)/i,
    /(?:post-?money|post money|postmoney)\s+(?:valuation|val)/i,
    /valuation\s+(?:of|at|is)\s*\$?([\d,]+(?:\.\d+)?)/i,
  ];
  
  // Funding patterns
  const fundingPatterns = [
    /(?:funding|financing|raised|raise)\s+(?:of|at|is|was)\s*\$?([\d,]+(?:\.\d+)?)/i,
    /(?:series\s+[a-z]|round)\s+(?:funding|financing|valuation)/i,
  ];
  
  // Revenue patterns
  const revenuePatterns = [
    /(?:revenue|sales|income)\s+(?:of|at|is|was)\s*\$?([\d,]+(?:\.\d+)?)/i,
    /(?:annual|yearly)\s+(?:revenue|sales)/i,
  ];
  
  // Governance patterns (A3.5.13 Addendum)
  const governancePatterns = [
    /(?:board|board seat|board seats|board representation)/i,
    /(?:two of five|5 board|board of directors)/i,
    /(?:voting rights|voting control)/i,
  ];
  
  // Security terms patterns (A3.5.13 Addendum)
  const securityPatterns = [
    /(?:liquidation preference|1x|straight preferred|preferred stock)/i,
    /(?:common shares|preferred shares|equity)/i,
    /(?:warrants|options|convertible)/i,
  ];
  
  // Ownership/equity patterns (A3.5.13 Addendum)
  const ownershipPatterns = [
    /(?:ownership|equity stake|ownership percentage)/i,
    /\d+(?:\.\d+)?\s*%\s*(?:ownership|equity|stake)/i,
  ];
  
  // Extract numeric values and context
  const numericValue = normalizeAnchorValue(text);
  if (numericValue !== null) {
    // Determine anchor type from context
    let anchorType = "numeric";
    if (valuationPatterns.some((p) => p.test(text))) {
      anchorType = "valuation";
    } else if (fundingPatterns.some((p) => p.test(text))) {
      anchorType = "funding";
    } else if (revenuePatterns.some((p) => p.test(text))) {
      anchorType = "revenue";
    } else if (ownershipPatterns.some((p) => p.test(text))) {
      anchorType = "ownership";
    }
    
    facts.push({
      value: numericValue,
      type: anchorType,
      text: text,
    });
  }
  
  // Extract non-numeric anchors (A3.5.13 Addendum)
  // Governance rights
  if (governancePatterns.some((p) => p.test(text))) {
    // Extract the specific governance term
    let governanceTerm = null;
    for (const pattern of governancePatterns) {
      const match = text.match(pattern);
      if (match) {
        governanceTerm = match[0];
        break;
      }
    }
    
    facts.push({
      value: null, // Non-numeric anchor
      type: "governance",
      text: governanceTerm || "governance rights",
      keyword: governanceTerm,
    });
  }
  
  // Security terms
  if (securityPatterns.some((p) => p.test(text))) {
    let securityTerm = null;
    for (const pattern of securityPatterns) {
      const match = text.match(pattern);
      if (match) {
        securityTerm = match[0];
        break;
      }
    }
    
    facts.push({
      value: null,
      type: "security",
      text: securityTerm || "security terms",
      keyword: securityTerm,
    });
  }
  
  // Ownership percentage (non-numeric detection)
  const ownershipPercentMatch = text.match(/\d+(?:\.\d+)?\s*%\s*(?:ownership|equity|stake)/i);
  if (ownershipPercentMatch && !numericValue) {
    facts.push({
      value: null,
      type: "ownership",
      text: ownershipPercentMatch[0],
      keyword: ownershipPercentMatch[0],
    });
  }
  
  return facts;
}

// Check semantic equivalence for anchor context
// Invariant 2: Semantic anchor equivalence
function isSemanticallyEquivalent(context1, context2) {
  if (typeof context1 !== "string" || typeof context2 !== "string") return false;
  
  const c1 = context1.toLowerCase();
  const c2 = context2.toLowerCase();
  
  // Normalize common variations
  const normalize = (s) => s
    .replace(/\b(pre-?money|pre money|premoney)\b/gi, "premoney")
    .replace(/\b(post-?money|post money|postmoney)\b/gi, "postmoney")
    .replace(/\b(the round|round|financing|funding|series [a-z]|this financing|this round)\b/gi, "financing")
    .replace(/\b(valuation|val|value)\b/gi, "valuation");
  
  const n1 = normalize(c1);
  const n2 = normalize(c2);
  
  // Check for key semantic matches
  const semanticMatches = [
    // Financing context
    (/\b(round|financing|funding|series)\b/.test(n1) && /\b(round|financing|funding|series)\b/.test(n2)),
    // Valuation context
    (/\b(valuation|val)\b/.test(n1) && /\b(valuation|val)\b/.test(n2)),
    // Pre-money/post-money
    (/\bpremoney\b/.test(n1) && /\bpremoney\b/.test(n2)),
    (/\bpostmoney\b/.test(n1) && /\bpostmoney\b/.test(n2)),
  ];
  
  return semanticMatches.some((match) => match);
}

// A3.5.13 Addendum: Decompose compound anchor statements and validate each anchor independently
// 
// When a statement contains multiple anchor facts (e.g., valuation, security terms, governance rights)
// bundled into a single sentence, this function:
// 1. Decomposes the statement into its constituent anchors
// 2. Validates each anchor independently against the uploaded corpus
// 3. Returns which anchors are found and which are missing
//
// This ensures that:
// - If one or more anchors are found, the statement is NOT routed to absence language
// - If all anchors are found (even across different sections), the statement is fully supported
// - If some anchors are found and others are not, the statement is classified as partially supported
//   with reasons explicitly naming which elements are supported and which are not
// - Under no circumstances is a compound anchor statement downgraded to "unsupported" solely
//   because no single contiguous span contains all anchors simultaneously
//
// Returns { anchors: Array<anchor>, allFound: boolean, someFound: boolean, foundAnchors: Array, missingAnchors: Array }
function decomposeAndValidateCompoundAnchors(statementText, uploadedDocs) {
  if (typeof statementText !== "string" || !statementText.trim()) {
    return { anchors: [], allFound: false, someFound: false, foundAnchors: [], missingAnchors: [] };
  }
  
  if (!Array.isArray(uploadedDocs) || uploadedDocs.length === 0) {
    return { anchors: [], allFound: false, someFound: false, foundAnchors: [], missingAnchors: [] };
  }
  
  // Extract all anchors from statement
  const anchors = extractAnchorFacts(statementText);
  
  if (anchors.length === 0) {
    return { anchors: [], allFound: false, someFound: false, foundAnchors: [], missingAnchors: [] };
  }
  
  // If only one anchor, not compound - return early
  if (anchors.length === 1) {
    return { anchors, allFound: false, someFound: false, foundAnchors: [], missingAnchors: [] };
  }
  
  // Combine corpus text
  const corpusText = uploadedDocs
    .map(doc => doc.text || "")
    .join("\n\n");
  
  const foundAnchors = [];
  const missingAnchors = [];
  
  // Validate each anchor independently
  for (const anchor of anchors) {
    let found = false;
    
    if (anchor.value !== null) {
      // Numeric anchor - check for value match
      const corpusNumericValues = extractNumericValues(corpusText);
      for (const corpusValue of corpusNumericValues) {
        if (numericValuesMatch(anchor.value, corpusValue)) {
          // Check context matches anchor type
          const valuePattern = new RegExp(
            `\\$?[\\d,]+(?:\\.[\\d]+)?\\s*(?:mm|million|m|billion|b|thousand|k)?`,
            "gi"
          );
          let match;
          while ((match = valuePattern.exec(corpusText)) !== null) {
            const matchValue = normalizeAnchorValue(match[0]);
            if (matchValue && numericValuesMatch(matchValue, anchor.value)) {
              // Extract context
              const contextStart = Math.max(0, match.index - 100);
              const contextEnd = Math.min(corpusText.length, match.index + match[0].length + 100);
              const context = corpusText.substring(contextStart, contextEnd).toLowerCase();
              
              // Check if context matches anchor type
              let matchesType = false;
              if (anchor.type === "valuation") {
                matchesType = /(?:pre-?money|pre money|premoney|post-?money|post money|postmoney|valuation|val)/i.test(context);
              } else if (anchor.type === "funding") {
                matchesType = /(?:funding|financing|raised|raise|series|round)/i.test(context);
              } else if (anchor.type === "revenue") {
                matchesType = /(?:revenue|sales|income)/i.test(context);
              } else if (anchor.type === "ownership") {
                matchesType = /(?:ownership|equity|stake|%)/i.test(context);
              } else {
                matchesType = true; // Generic numeric
              }
              
              if (matchesType) {
                found = true;
                break;
              }
            }
          }
          if (found) break;
        }
      }
    } else {
      // Non-numeric anchor (governance, security, etc.) - check for keyword match
      const keyword = anchor.keyword || anchor.text;
      if (keyword) {
        // Normalize keyword for matching
        const normalizedKeyword = keyword.toLowerCase().trim();
        const normalizedCorpus = corpusText.toLowerCase();
        
        // Check if keyword appears in corpus
        if (normalizedCorpus.includes(normalizedKeyword)) {
          found = true;
        } else {
          // Try partial matches for governance/security terms
          if (anchor.type === "governance") {
            const governanceKeywords = ["board", "seat", "representation", "voting"];
            found = governanceKeywords.some(kw => normalizedCorpus.includes(kw));
          } else if (anchor.type === "security") {
            const securityKeywords = ["preferred", "common", "liquidation", "preference", "warrant", "option"];
            found = securityKeywords.some(kw => normalizedCorpus.includes(kw));
          }
        }
      }
    }
    
    if (found) {
      foundAnchors.push(anchor);
    } else {
      missingAnchors.push(anchor);
    }
  }
  
  const allFound = foundAnchors.length === anchors.length;
  const someFound = foundAnchors.length > 0;
  
  return {
    anchors,
    allFound,
    someFound,
    foundAnchors,
    missingAnchors,
  };
}

// A3.5.12: Gate absence-language using deterministic corpusSearch
// Uses lib/corpusSearch.js for lightweight corpus search

// A3.5.13: Detect ambiguity when multiple anchor values exist in corpus
// Returns { isAmbiguous: boolean, anchorType: string|null, values: Array<{value: number, humanForm: string}> }
function detectAnchorAmbiguity(statementText, uploadedDocs) {
  if (typeof statementText !== "string" || !statementText.trim()) {
    return { isAmbiguous: false, anchorType: null, values: [] };
  }
  
  if (!Array.isArray(uploadedDocs) || uploadedDocs.length === 0) {
    return { isAmbiguous: false, anchorType: null, values: [] };
  }
  
  // Extract anchor facts from statement
  const statementAnchors = extractAnchorFacts(statementText);
  if (statementAnchors.length === 0) {
    return { isAmbiguous: false, anchorType: null, values: [] };
  }
  
  const statementAnchorType = statementAnchors[0].type; // Use first anchor type
  const statementValue = statementAnchors[0].value;
  
  // Extract all anchor values of the same type from corpus
  const corpusValues = new Set();
  const corpusValueTexts = new Map(); // Map normalized value -> human-readable form
  
  // Combine all uploaded docs into one corpus text
  const corpusText = uploadedDocs
    .map(doc => doc.text || "")
    .join("\n\n");
  
  // Extract all anchor values of the same type from corpus
  // For each document, extract all numeric values and check context
  for (const doc of uploadedDocs) {
    const docText = doc.text || "";
    if (!docText.trim()) continue;
    
    // Extract all numeric values from this document
    const docNumericValues = extractNumericValues(docText);
    
    // For each numeric value, check if it's in the context of the same anchor type
    for (const numericValue of docNumericValues) {
      // Check context around this value in the document
      const valuePattern = new RegExp(
        `\\$?[\\d,]+(?:\\.[\\d]+)?\\s*(?:mm|million|m|billion|b|thousand|k)?`,
        "gi"
      );
      let match;
      while ((match = valuePattern.exec(docText)) !== null) {
        const matchValue = normalizeAnchorValue(match[0]);
        if (!matchValue || !numericValuesMatch(matchValue, numericValue)) continue;
        
        // Extract context around the match (100 chars before and after)
        const contextStart = Math.max(0, match.index - 100);
        const contextEnd = Math.min(docText.length, match.index + match[0].length + 100);
        const context = docText.substring(contextStart, contextEnd).toLowerCase();
        
        // Check if context matches the anchor type
        let matchesType = false;
        if (statementAnchorType === "valuation") {
          matchesType = /(?:pre-?money|pre money|premoney|post-?money|post money|postmoney|valuation|val)/i.test(context);
        } else if (statementAnchorType === "funding") {
          matchesType = /(?:funding|financing|raised|raise|series|round)/i.test(context);
        } else if (statementAnchorType === "revenue") {
          matchesType = /(?:revenue|sales|income)/i.test(context);
        } else {
          // For "numeric" type, accept any numeric value
          matchesType = true;
        }
        
        if (matchesType) {
          corpusValues.add(numericValue);
          
          // Extract human-readable form
          const humanForm = extractHumanReadableValue(docText, numericValue, statementAnchorType);
          if (humanForm) {
            corpusValueTexts.set(numericValue, humanForm);
          } else {
            // Fallback: format the normalized value
            corpusValueTexts.set(numericValue, formatNumericValue(numericValue));
          }
          break; // Found this value, move to next
        }
      }
    }
  }
  
  // If we have fewer than 2 distinct values, no ambiguity
  if (corpusValues.size < 2) {
    return { isAmbiguous: false, anchorType: statementAnchorType, values: [] };
  }
  
  // Check if statement value matches any corpus value (within tolerance)
  const statementMatches = Array.from(corpusValues).some(corpusValue => {
    return numericValuesMatch(statementValue, corpusValue);
  });
  
  // Ambiguity exists if: multiple distinct values in corpus AND statement doesn't uniquely match one
  const isAmbiguous = corpusValues.size >= 2;
  
  if (isAmbiguous) {
    // Convert to human-readable forms
    const values = Array.from(corpusValues)
      .slice(0, 5) // Limit to 5 values
      .map(value => ({
        value,
        humanForm: corpusValueTexts.get(value) || formatNumericValue(value),
      }));
    
    return {
      isAmbiguous: true,
      anchorType: statementAnchorType,
      values,
    };
  }
  
  return { isAmbiguous: false, anchorType: statementAnchorType, values: [] };
}

// Helper: Extract human-readable form of a numeric value from text
function extractHumanReadableValue(text, normalizedValue, anchorType) {
  if (typeof text !== "string" || !Number.isFinite(normalizedValue)) return null;
  
  // Patterns to match the value in various formats
  const patterns = [
    // $XXmm, $XXm, $XX million
    /\$([\d,]+(?:\.\d+)?)\s*(mm|million|m\b|M\b)/gi,
    /\$([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/gi,
    /\$([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/gi,
    /\$([\d,]+(?:\.\d+)?)/g,
  ];
  
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const numStr = (match[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      
      const unit = (match[2] || "").toLowerCase();
      const multipliers = {
        mm: 1e6, million: 1e6, m: 1e6,
        billion: 1e9, b: 1e9,
        thousand: 1e3, k: 1e3,
      };
      const multiplier = multipliers[unit] || 1;
      const value = num * multiplier;
      
      // Check if this matches the normalized value (within tolerance)
      if (numericValuesMatch(value, normalizedValue)) {
        // Return human-readable form
        if (unit === "mm" || unit === "million" || unit === "m") {
          return `$${num}${unit === "million" ? " million" : unit === "mm" ? "mm" : "m"}`;
        } else if (unit === "billion" || unit === "b") {
          return `$${num}${unit === "billion" ? " billion" : "b"}`;
        } else if (unit === "thousand" || unit === "k") {
          return `$${num}${unit === "thousand" ? " thousand" : "k"}`;
        } else {
          return `$${num}`;
        }
      }
    }
  }
  
  return null;
}

// Helper: Format numeric value to human-readable form
function formatNumericValue(value) {
  if (!Number.isFinite(value)) return String(value);
  
  if (value >= 1e9) {
    const billions = value / 1e9;
    return `$${billions.toFixed(billions >= 10 ? 0 : 1)} billion`;
  } else if (value >= 1e6) {
    const millions = value / 1e6;
    return `$${millions.toFixed(millions >= 10 ? 0 : 1)} million`;
  } else if (value >= 1e3) {
    const thousands = value / 1e3;
    return `$${thousands.toFixed(thousands >= 10 ? 0 : 1)} thousand`;
  } else {
    return `$${value.toFixed(0)}`;
  }
}

// Helper: Check if two numeric values match (with 5% tolerance) - imported from corpusSearch logic
function numericValuesMatch(val1, val2) {
  if (typeof val1 !== "number" || typeof val2 !== "number") return false;
  if (!Number.isFinite(val1) || !Number.isFinite(val2)) return false;
  const tolerance = 0.05;
  const diff = Math.abs(val1 - val2);
  const maxVal = Math.max(Math.abs(val1), Math.abs(val2), 1);
  return diff / maxVal <= tolerance;
}

// Helper: Extract numeric values from text (same logic as corpusSearch)
// A3.6.2 PATCH v2: Add percentage extraction for numericMatch
function extractNumericValues(text) {
  if (typeof text !== "string") return [];
  
  const values = [];
  const patterns = [
    // $25mm, $25m, $25 million, $25M
    /\$?([\d,]+(?:\.\d+)?)\s*(mm|million|m\b|M\b)/gi,
    // $2b, $2 billion
    /\$?([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/gi,
    // $2k, $2 thousand
    /\$?([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/gi,
    // Plain $25, $18.7
    /\$([\d,]+(?:\.\d+)?)/g,
    // A3.6.2 PATCH v2: Percentages - "20%", "~20%" -> 20 (normalized as percentage value)
    /([\d,]+(?:\.\d+)?)\s*%/g,
  ];
  
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const numStr = (match[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      
      // A3.6.2 PATCH v2: Handle percentages
      if (pattern.source.includes("%")) {
        // Store percentage as-is (20% = 20, not normalized to millions)
        // Use a special marker to distinguish from dollar amounts
        values.push(num * 1e-6); // Store as 0.00002 to distinguish from $20m = 20000000
        // Actually, better: store as negative to distinguish, or use a different approach
        // For now, store as-is and let numericMatch handle the comparison
        values.push(num); // Store percentage value directly
        continue;
      }
      
      const unit = (match[2] || "").toLowerCase();
      const multipliers = {
        mm: 1e6, million: 1e6, m: 1e6,
        billion: 1e9, b: 1e9,
        thousand: 1e3, k: 1e3,
      };
      const multiplier = multipliers[unit] || 1;
      const value = num * multiplier;
      values.push(value);
    }
  }
  
  return [...new Set(values)];
}

// Detect absence claims in reasons
function hasAbsenceClaim(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) return false;
  
  const absencePatterns = [
    /not mentioned/i,
    /not specified/i,
    /not supported/i,
    /no support/i,
    /not found/i,
    /not stated/i,
    /not referenced/i,
    /not cited/i,
    /not present/i,
    /absent/i,
    /lacks?/i,
    /missing/i,
    /no (?:source|sources|memo|document).*(?:mention|state|reference|cite)/i,
  ];
  
  const reasonsText = reasons
    .filter(r => typeof r === "string")
    .join(" ")
    .toLowerCase();
  
  return absencePatterns.some(pattern => pattern.test(reasonsText));
}

// Enforce corpus-level verification before absence claims (A3.5.11/A3.5.12)
// A3.5.13b: When corpusSearch finds support, inject citations and build evidence
// Core Invariant: Review MUST NOT assert absence unless corpus-level search performed and returned no match
// Uses deterministic corpusSearch utility (A3.5.12)
function enforceCorpusVerificationBeforeAbsence(statements, uploadedSources, unifiedReferences = [], runId = null, reqSig = null) {
  // A3.5.20 Fix 3: Log with RID+SIG if provided
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  if (!Array.isArray(statements) || !Array.isArray(uploadedSources)) return statements;
  
  // Invariant 1: Full corpus availability - only process if uploaded sources exist with full text
  const docsWithFullText = uploadedSources.filter(s => 
    typeof s.text === "string" && s.text.trim().length > 0
  );
  
  if (docsWithFullText.length === 0) {
    // No full text available - do not allow absence language
    return statements.map((stmt) => {
      if (!stmt || typeof stmt !== "object") return stmt;
      const assessment = stmt.assessment || {};
      const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
      
      if (hasAbsenceClaim(reasons)) {
        // Replace absence language with weaker wording
        const updatedReasons = reasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          const lower = reason.toLowerCase();
          if (/not (?:mentioned|specified|found|stated) in (?:the )?uploaded (?:memo|sources)/i.test(lower)) {
            return "This claim was not confirmed in the sources reviewed.";
          }
          return reason;
        });
        
        return {
          ...stmt,
          assessment: {
            ...assessment,
            reasons: updatedReasons.slice(0, 4),
          },
        };
      }
      return stmt;
    });
  }
  
  // Format uploaded docs for corpusSearch utility
  const uploadedDocs = docsWithFullText.map(s => ({
    id: s.id || s.name || `doc_${Math.random()}`,
    title: s.name || s.title || "Untitled source",
    text: s.text || "",
  }));
  
  return statements.map((stmt, idx) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    // A3.6.4: Guard against invalid index
    if (typeof idx !== "number") idx = -1;
    
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const text = typeof stmt.text === "string" ? stmt.text : "";
    
    // A3.5.13 Addendum - Anchor Absence Precedence:
    // For anchor facts, if uploaded sources exist, corpusSearch MUST run first
    // Missing citations MUST NOT trigger absence language without corpusSearch
    const isAnchor = isAnchorFact(text);
    const uploadedSourcesCount = docsWithFullText.length;
    
    // A3.5.13c: Check for compound numeric anchors first
    const compoundNumericResult = validateCompoundNumericAnchors(text, uploadedDocs);
    
    // If compound numeric anchors detected, reconcile reasons
    if (compoundNumericResult.elements.length >= 2) {
      console.log(`[DIAG] A3.5.13c: Compound numeric anchor detected (${compoundNumericResult.elements.length} elements)`);
      
      // Invariant 3: Citation / Evidence Injection
      // If any anchor element is SUPPORTED or AMBIGUOUS by uploaded sources and statement has empty citations
      const existingCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
      const hasAnySupported = compoundNumericResult.supportedKinds.size > 0 || compoundNumericResult.ambiguousKinds.size > 0;
      
      if (hasAnySupported && existingCitations.length === 0) {
        // Find uploaded memo reference ID
        let memoReferenceId = null;
        if (Array.isArray(unifiedReferences) && unifiedReferences.length > 0) {
          const uploadedRef = unifiedReferences.find(ref => ref?.type === "uploaded");
          if (uploadedRef && uploadedRef.id != null) {
            memoReferenceId = uploadedRef.id;
          } else if (uploadedSources.length > 0) {
            memoReferenceId = 1; // Fallback
          }
        }
        
        // Inject memo reference ID
        let injectedCitations = [];
        if (memoReferenceId != null) {
          injectedCitations = [memoReferenceId];
        }
        
        // Build evidence
        const evidence = [];
        if (injectedCitations.length > 0 && Array.isArray(unifiedReferences)) {
          const referencesById = new Map();
          unifiedReferences.forEach((ref) => {
            const id = ref?.id;
            if (id != null) {
              referencesById.set(String(id), ref);
            }
          });
          
          injectedCitations.forEach((citationId) => {
            const citationKey = citationId != null ? String(citationId) : null;
            if (citationKey && referencesById.has(citationKey)) {
              const ref = referencesById.get(citationKey);
              const refType = ref?.type || (ref?.url ? "web" : "uploaded");
              evidence.push({
                title: ref?.title || "Untitled source",
                url: ref?.url || null,
                sourceType: refType,
              });
            }
          });
        }
        
        
        // Invariant 4: Reason Reconciliation (hard rule)
        // Remove contradictory reasons and generate deterministic templates
        const kindLabels = {
          investment_amount: "investment amount",
          valuation_premoney: "pre-money valuation",
          ownership_pct: "ownership percentage",
          secondary_amount: "secondary amount",
          other_numeric: "numeric value",
        };
        
        // Helper to format element value (handles percentages differently)
        const formatElementValue = (element) => {
          if (element.kind === "ownership_pct") {
            return `${element.normalizedNumber}%`;
          }
          return formatNumericValue(element.normalizedNumber);
        };
        
        // Build supported elements list
        const supportedElements = [];
        for (const kind of compoundNumericResult.supportedKinds) {
          const elementsOfKind = compoundNumericResult.elements.filter(e => e.kind === kind);
          if (elementsOfKind.length > 0) {
            const element = elementsOfKind[0];
            const label = kindLabels[kind] || kind;
            const humanForm = formatElementValue(element);
            supportedElements.push(`${label} (${humanForm})`);
          }
        }
        
        // Build missing elements list
        const missingElements = [];
        for (const kind of compoundNumericResult.missingKinds) {
          const elementsOfKind = compoundNumericResult.elements.filter(e => e.kind === kind);
          if (elementsOfKind.length > 0) {
            const element = elementsOfKind[0];
            const label = kindLabels[kind] || kind;
            const humanForm = formatElementValue(element);
            missingElements.push(`${label} (${humanForm})`);
          }
        }
        
        // Build ambiguous elements list
        const ambiguousElements = [];
        for (const kind of compoundNumericResult.ambiguousKinds) {
          const elementsOfKind = compoundNumericResult.elements.filter(e => e.kind === kind);
          if (elementsOfKind.length >= 2) {
            const label = kindLabels[kind] || kind;
            const values = elementsOfKind.map(e => formatElementValue(e));
            ambiguousElements.push({
              kind: label,
              values: values.slice(0, 2), // Limit to 2 values
            });
          }
        }
        
        // Generate deterministic reason templates
        const reconciledReasons = [];
        
        // Supported elements
        if (supportedElements.length > 0) {
          const supportedText = supportedElements.length === 1
            ? supportedElements[0]
            : supportedElements.slice(0, -1).join(", ") + " and " + supportedElements[supportedElements.length - 1];
          reconciledReasons.push(`Uploaded memo supports: ${supportedText}.`);
        }
        
        // Missing elements
        if (missingElements.length > 0) {
          const missingText = missingElements.length === 1
            ? missingElements[0]
            : missingElements.slice(0, -1).join(", ") + " and " + missingElements[missingElements.length - 1];
          reconciledReasons.push(`Uploaded memo does not support: ${missingText} (not found).`);
        }
        
        // Ambiguous elements
        for (const ambiguous of ambiguousElements) {
          const valuesText = ambiguous.values.join(" and ");
          reconciledReasons.push(`Memo mentions multiple ${ambiguous.kind}s (${valuesText}), creating ambiguity; statement selects ${ambiguous.values[0]}.`);
        }
        
        // Remove contradictory reasons from existing reasons
        const reasonsToRemove = [];
        const updatedReasons = reasons.filter((reason) => {
          if (typeof reason !== "string") return false;
          const lower = reason.toLowerCase();
          
          // Remove any reason that contradicts supported kinds
          for (const kind of compoundNumericResult.supportedKinds) {
            const label = kindLabels[kind] || kind;
            if (lower.includes(label) && (
              /not (?:specified|mentioned|found|stated)/i.test(lower) ||
              /does not (?:specify|mention|provide|contain)/i.test(lower) ||
              /memo does not/i.test(lower)
            )) {
              reasonsToRemove.push(reason);
              return false; // Remove this reason
            }
          }
          
          // Remove any reason that contradicts ambiguous kinds
          for (const kind of compoundNumericResult.ambiguousKinds) {
            const label = kindLabels[kind] || kind;
            if (lower.includes(label) && /not (?:specified|mentioned)/i.test(lower)) {
              reasonsToRemove.push(reason);
              return false;
            }
          }
          
          return true;
        });
        
        // Combine reconciled reasons with non-contradictory existing reasons
        const finalReasons = [...reconciledReasons, ...updatedReasons].slice(0, 4);
        
        if (reasonsToRemove.length > 0) {
          console.log(`[DIAG] A3.5.13c: Removed ${reasonsToRemove.length} contradictory reasons`);
        }
        
        // Invariant 5: Scoring (minimal change)
        // If ≥1 anchor element SUPPORTED and ≥1 NOT_FOUND → label at most Medium, score cap <=60
        let updatedScore = assessment.reliabilityScore;
        let updatedLabel = assessment.reliabilityLabel;
        if (compoundNumericResult.supportedKinds.size > 0 && compoundNumericResult.missingKinds.size > 0) {
          // Partial support - cap at Medium
          if (updatedScore > 60) {
            updatedScore = Math.min(updatedScore, 60);
            updatedLabel = "Medium";
          } else if (updatedLabel === "High") {
            updatedLabel = "Medium";
          }
        }
        
        return {
          ...stmt,
          citations: injectedCitations,
          evidence: evidence,
          assessment: {
            ...assessment,
            citations: injectedCitations,
            evidence: evidence,
            reasons: finalReasons,
            reliabilityScore: updatedScore,
            reliabilityLabel: updatedLabel,
          },
        };
      }
    }
    
    // A3.5.13 Addendum: Check for compound anchors first (for both absence and non-absence cases)
    const compoundAnchorResult = decomposeAndValidateCompoundAnchors(text, uploadedDocs);
    
    // If compound anchors detected, validate each independently
    if (compoundAnchorResult.anchors.length >= 2) {
      console.log(`[DIAG] A3.5.13: Compound anchor detected (${compoundAnchorResult.anchors.length} anchors)`);
      
      // If all anchors found → fully supported
      if (compoundAnchorResult.allFound) {
        // Replace absence language with support language
        let updatedReasons = reasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          const lower = reason.toLowerCase();
          
          // Remove absence claims
          if (/not mentioned/i.test(lower) || /not supported/i.test(lower) || /no support/i.test(lower) || 
              /not found/i.test(lower) || /not stated/i.test(lower)) {
            return "All anchor facts in this statement are supported by the uploaded sources.";
          }
          return reason;
        });
        
        // Remove any remaining absence language
        updatedReasons = updatedReasons.filter((reason) => {
          if (typeof reason !== "string") return true;
          const lower = reason.toLowerCase();
          return !(
            /not mentioned/i.test(lower) ||
            /not specified/i.test(lower) ||
            /not supported/i.test(lower) ||
            /no support/i.test(lower) ||
            /not found/i.test(lower) ||
            /not stated/i.test(lower) ||
            /not referenced/i.test(lower) ||
            /not cited/i.test(lower) ||
            /not present/i.test(lower) ||
            /absent/i.test(lower) ||
            /lacks?/i.test(lower) ||
            /missing/i.test(lower)
          );
        });
        
        // If all reasons were removed, add support reason
        if (updatedReasons.length === 0) {
          updatedReasons = ["All anchor facts in this statement are supported by the uploaded sources."];
        }
        
        
        return {
          ...stmt,
          assessment: {
            ...assessment,
            reasons: updatedReasons.slice(0, 4),
          },
        };
      }
      
      // If some anchors found → partially supported or ambiguous
      if (compoundAnchorResult.someFound) {
        // Build explicit enumeration of supported vs missing anchors
        const foundAnchorNames = compoundAnchorResult.foundAnchors.map(a => {
          if (a.type === "valuation") return "valuation";
          if (a.type === "funding") return "funding amount";
          if (a.type === "revenue") return "revenue";
          if (a.type === "ownership") return "ownership percentage";
          if (a.type === "governance") return a.keyword || "governance rights";
          if (a.type === "security") return a.keyword || "security terms";
          return "numeric value";
        });
        
        const missingAnchorNames = compoundAnchorResult.missingAnchors.map(a => {
          if (a.type === "valuation") return "valuation";
          if (a.type === "funding") return "funding amount";
          if (a.type === "revenue") return "revenue";
          if (a.type === "ownership") return "ownership percentage";
          if (a.type === "governance") return a.keyword || "governance rights";
          if (a.type === "security") return a.keyword || "security terms";
          return "numeric value";
        });
        
        // Replace absence language with explicit partial support language
        let updatedReasons = [];
        
        // Add explicit enumeration
        if (foundAnchorNames.length > 0 && missingAnchorNames.length > 0) {
          const foundText = foundAnchorNames.length === 1 
            ? foundAnchorNames[0] 
            : foundAnchorNames.slice(0, -1).join(", ") + " and " + foundAnchorNames[foundAnchorNames.length - 1];
          const missingText = missingAnchorNames.length === 1
            ? missingAnchorNames[0]
            : missingAnchorNames.slice(0, -1).join(", ") + " and " + missingAnchorNames[missingAnchorNames.length - 1];
          
          updatedReasons.push(
            `The uploaded sources support ${foundText}, but do not explicitly support ${missingText}.`
          );
          updatedReasons.push(
            "This statement combines multiple anchor facts; some are supported while others are not found in the uploaded sources."
          );
        }
        
        // Keep non-absence reasons
        const nonAbsenceReasons = reasons.filter((reason) => {
          if (typeof reason !== "string") return false;
          const lower = reason.toLowerCase();
          return !(
            /not mentioned/i.test(lower) ||
            /not specified/i.test(lower) ||
            /not supported/i.test(lower) ||
            /no support/i.test(lower) ||
            /not found/i.test(lower) ||
            /not stated/i.test(lower) ||
            /not referenced/i.test(lower) ||
            /not cited/i.test(lower) ||
            /not present/i.test(lower) ||
            /absent/i.test(lower) ||
            /lacks?/i.test(lower) ||
            /missing/i.test(lower)
          );
        });
        
        updatedReasons = [...updatedReasons, ...nonAbsenceReasons].slice(0, 4);
        
        
        return {
          ...stmt,
          assessment: {
            ...assessment,
            reasons: updatedReasons,
          },
        };
      }
      
      // If no anchors found, continue to standard absence check below
    }
    
    // A3.5.13 Addendum - Anchor Absence Precedence:
    // For anchor facts with uploaded sources, corpusSearch MUST run FIRST
    // This ensures corpusSearch determines support before any absence language is considered
    // Missing citations MUST NOT trigger absence language without corpusSearch
    // A3.5.13b: When corpusSearch finds support, inject citations and build evidence
    // A3.5.14 Part B: Also check WORLD_FACT statements with empty citations
    const existingCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const hasEmptyCitations = existingCitations.length === 0;
    
    // Check if this is a WORLD_FACT statement or contains anchor numbers
    const classification = classifyStatementAndProvenance(stmt, unifiedReferences);
    const isWorldFact = classification.category === "WORLD_FACT";
    
    // Check for anchor number indicators: $, %, "pre-money", "ownership", "secondary", "board seats", "preferred"
    const hasAnchorNumbers = /(\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?|\b\d+(?:\.\d+)?\s*%|\b(pre-money|post-money|ownership|secondary|board\s+seats?|preferred)\b)/i.test(text);
    
    // A3.5.14 Part B: Check for WORLD_FACT or anchor-number statements with empty citations
    const shouldCheckForMemoCitation = (isAnchor || (isWorldFact && hasAnchorNumbers)) && hasEmptyCitations && uploadedSourcesCount > 0;
    
    let searchResult = null;
    if (shouldCheckForMemoCitation) {
      // Run corpusSearch FIRST (before checking for absence claims)
      searchResult = corpusSearch(text, uploadedDocs);
      
      // A3.5.14 Part B: If corpusSearch returns FOUND with number match and keyword match
      if (searchResult.found && searchResult.debug) {
        const hasNumberMatch = Array.isArray(searchResult.debug.normalizedNumbersFound) && searchResult.debug.normalizedNumbersFound.length > 0;
        const hasKeywordMatch = Array.isArray(searchResult.debug.keywordsMatched) && searchResult.debug.keywordsMatched.length > 0;
        
        if (hasNumberMatch || hasKeywordMatch) {
        // A3.5.14 Part B: corpusSearch found matches - inject citations and build evidence
        // Invariant 1: Support Must Attach a Source
        const existingTopLevelCitations = Array.isArray(stmt.citations) ? stmt.citations : [];
        
        // Find uploaded memo reference ID
        let memoReferenceId = null;
        if (Array.isArray(unifiedReferences) && unifiedReferences.length > 0) {
          // Find first uploaded reference
          const uploadedRef = unifiedReferences.find(ref => ref?.type === "uploaded");
          if (uploadedRef && uploadedRef.id != null) {
            memoReferenceId = uploadedRef.id;
          } else {
            // Fallback to first uploaded reference by index (1-based for uploaded sources)
            if (uploadedSources.length > 0) {
              memoReferenceId = 1; // Uploaded references start at 1
            }
          }
        }
        
        // Inject memo reference ID if not already present
        let injectedCitations = [...existingCitations];
        if (memoReferenceId != null && !injectedCitations.includes(memoReferenceId)) {
          injectedCitations.push(memoReferenceId);
          injectedCitations.sort((a, b) => a - b);
        }
        
        // Invariant 2: Evidence Must Be Built
        const evidence = [];
        if (injectedCitations.length > 0 && Array.isArray(unifiedReferences)) {
          const referencesById = new Map();
          unifiedReferences.forEach((ref) => {
            const id = ref?.id;
            if (id != null) {
              referencesById.set(String(id), ref);
            }
          });
          
          injectedCitations.forEach((citationId) => {
            const citationKey = citationId != null ? String(citationId) : null;
            if (citationKey && referencesById.has(citationKey)) {
              const ref = referencesById.get(citationKey);
              const refType = ref?.type || (ref?.url ? "web" : "uploaded");
              evidence.push({
                title: ref?.title || "Untitled source",
                url: ref?.url || null,
                sourceType: refType,
              });
            }
          });
        }
        
        // Invariant 3: Absence Reasons Must Not Survive
        // Remove any absence reasons
        let updatedReasons = reasons.filter((reason) => {
          if (typeof reason !== "string") return false;
          const lower = reason.toLowerCase();
          return !(
            /not mentioned/i.test(lower) ||
            /not specified/i.test(lower) ||
            /not supported/i.test(lower) ||
            /no support/i.test(lower) ||
            /not found/i.test(lower) ||
            /not stated/i.test(lower) ||
            /not referenced/i.test(lower) ||
            /not cited/i.test(lower) ||
            /not present/i.test(lower) ||
            /absent/i.test(lower) ||
            /lacks?/i.test(lower) ||
            /missing/i.test(lower) ||
            /anchor fact requires/i.test(lower) ||
            /none was cited/i.test(lower) ||
            /does not provide/i.test(lower) ||
            /cannot be verified/i.test(lower) ||
            /memo does not/i.test(lower)
          );
        });
        
        // A3.5.14 Part B: Replace absence reasons with compound anchor template if applicable
        // Check if statement expresses a range or has multiple figures
        const hasRange = /(\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?)\s*[-–—]\s*(\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?)/i.test(text);
        
        // A3.5.14 Part C: Check for ambiguity (multiple figures)
        const ambiguityResult = detectAnchorAmbiguity(text, uploadedDocs);
        const isAmbiguous = ambiguityResult.isAmbiguous && ambiguityResult.values.length >= 2;
        
        // Initialize score/label variables (may be updated in ambiguity case)
        let updatedScore = assessment.reliabilityScore;
        let updatedLabel = assessment.reliabilityLabel;
        
        if (isAmbiguous || hasRange) {
          // A3.5.14 Part C: Use AMBIGUOUS_WITHIN_SOURCES template
          const anchorTypeLabel = ambiguityResult.anchorType === "valuation" 
            ? "valuation figure"
            : ambiguityResult.anchorType === "funding"
            ? "funding amount"
            : ambiguityResult.anchorType === "revenue"
            ? "revenue figure"
            : "numeric value";
          
          const valueList = ambiguityResult.values
            .slice(0, 2)
            .map(v => v.humanForm)
            .join(" and ");
          
          const ambiguityReason = `The uploaded memo references more than one ${anchorTypeLabel} (e.g., ${valueList}). This statement's ${ambiguityResult.anchorType || "value"} should be clarified to match the intended figure.`;
          updatedReasons = [ambiguityReason, ...updatedReasons].slice(0, 4);
          
          // A3.5.14 Part C: Cap reliabilityLabel at Medium unless statement explicitly matches one figure exactly
          
          // Check if statement explicitly matches one figure exactly (no range)
          const statementNumericValues = extractNumericValues(text);
          const exactMatch = statementNumericValues.length === 1 && 
            ambiguityResult.values.some(v => numericValuesMatch(v.value, statementNumericValues[0]));
          
          if (!exactMatch) {
            // Cap at Medium
            if (updatedScore > 60) {
              updatedScore = Math.min(updatedScore, 60);
            }
            if (updatedLabel === "High") {
              updatedLabel = "Medium";
            }
          }
        } else {
          // A3.5.14 Part B: Use compound anchor template for non-ambiguous cases
          const anchorFacts = extractAnchorFacts(text);
          const anchorType = anchorFacts.length > 0 ? anchorFacts[0].type : null;
          let anchorTypeLabel = "anchor fact";
          if (anchorType === "valuation") anchorTypeLabel = "valuation figure";
          else if (anchorType === "funding") anchorTypeLabel = "funding amount";
          else if (anchorType === "revenue") anchorTypeLabel = "revenue figure";
          else if (anchorType === "ownership") anchorTypeLabel = "ownership percentage";
          else if (anchorType === "governance") anchorTypeLabel = "governance rights";
          else if (anchorType === "security") anchorTypeLabel = "security terms";
          
          // A3.5.14 Part B: Use compound anchor template
          const supportReason = `The uploaded memo contains the cited term(s) / figure(s), but wording in this statement combines multiple deal terms; interpret with care.`;
          updatedReasons = [supportReason, ...updatedReasons].slice(0, 4);
        }
        
        // Fix 2: Remove old injection code - let enforceAnchorCitationsAndAmbiguity() handle it as LAST mutation step
        // This code is kept for backward compatibility but injection is deferred to enforceAnchorCitationsAndAmbiguity()
        // Continue to standard absence/ambiguity check below
      }
      // If corpusSearch found nothing, continue to standard absence/ambiguity check below
    }
    }
    
    // Invariant 2: Mandatory corpusSearch before absence language
    // Check if reasons contain absence claims
    if (!hasAbsenceClaim(reasons)) return stmt; // No absence claim, no action needed
    
    // A3.5.13: Check for ambiguity (before corpus search)
    const ambiguityResult = detectAnchorAmbiguity(text, uploadedDocs);
    
    // Perform deterministic corpus search (A3.5.12) - only if not already done
    if (!searchResult) {
      // A3.5.20 Fix 3: Log corpusSearch call with RID+SIG
      // A3.6.4: Fix - use idx from map callback scope
      if (runId && reqSig) {
        diag(runId, reqSig, `[corpusSearch] calling for statement idx=${idx !== undefined ? idx : 'unknown'}`);
      }
      searchResult = corpusSearch(text, uploadedDocs);
      if (runId && reqSig) {
        diag(runId, reqSig, `[corpusSearch] result found=${searchResult?.found || false}`);
      }
    }
    
    if (searchResult.found) {
      // Corpus search found matches - MUST NOT state absence (Invariant 2)
      
      // A3.5.13: If ambiguity detected, use ambiguity template instead of generic support language
      if (ambiguityResult.isAmbiguous && ambiguityResult.values.length >= 2) {
        const anchorTypeLabel = ambiguityResult.anchorType === "valuation" 
          ? "pre-money valuation figures"
          : ambiguityResult.anchorType === "funding"
          ? "funding amounts"
          : ambiguityResult.anchorType === "revenue"
          ? "revenue figures"
          : "numeric values";
        
        const valueList = ambiguityResult.values
          .slice(0, 2)
          .map(v => v.humanForm)
          .join(" and ");
        
        // Use exact template from spec
        const ambiguityReason1 = `The uploaded memo references multiple ${anchorTypeLabel} (e.g., ${valueList}), so the precise ${ambiguityResult.anchorType || "value"} for this draft version is ambiguous.`;
        const ambiguityReason2 = "This is supported by the memo, but not uniquely confirmed to a single figure.";
        
        // Replace all absence language with ambiguity explanation
        let updatedReasons = [ambiguityReason1, ambiguityReason2];
        
        // Remove any remaining absence language
        const filteredReasons = reasons.filter((reason) => {
          if (typeof reason !== "string") return false;
          const lower = reason.toLowerCase();
          return !(
            /not mentioned/i.test(lower) ||
            /not specified/i.test(lower) ||
            /not supported/i.test(lower) ||
            /no support/i.test(lower) ||
            /not found/i.test(lower) ||
            /not stated/i.test(lower) ||
            /not referenced/i.test(lower) ||
            /not cited/i.test(lower) ||
            /not present/i.test(lower) ||
            /absent/i.test(lower) ||
            /lacks?/i.test(lower) ||
            /missing/i.test(lower)
          );
        });
        
        // Keep non-absence reasons (up to 2 more, capped at 4 total)
        updatedReasons = [...updatedReasons, ...filteredReasons].slice(0, 4);
        
        // Diagnostics (A3.5.13)
        console.log(`[DIAG] A3.5.13: Ambiguity detected - replaced absence language:`, {
          anchorType: ambiguityResult.anchorType,
        });
        
        return {
          ...stmt,
          assessment: {
            ...assessment,
            reasons: updatedReasons,
          },
        };
      }
      
      // No ambiguity - use standard support language
      let updatedReasons = reasons.map((reason) => {
        if (typeof reason !== "string") return reason;
        
        const lower = reason.toLowerCase();
        
        // Replace absence claims with support language
        if (/not mentioned/i.test(lower)) {
          return "This information appears in the uploaded sources, though the exact phrasing may differ.";
        }
        if (/not specified/i.test(lower)) {
          return "This information appears in the uploaded sources, though the exact phrasing may differ.";
        }
        if (/not supported/i.test(lower) || /no support/i.test(lower)) {
          return "The uploaded sources contain related information, though the exact claim may not be explicitly stated.";
        }
        if (/not found/i.test(lower)) {
          return "Related information appears in the uploaded sources, though the exact phrasing may differ.";
        }
        if (/not stated/i.test(lower) || /not referenced/i.test(lower)) {
          return "The uploaded sources contain related information, though the exact phrasing may differ.";
        }
        if (/no (?:source|sources|memo|document).*(?:mention|state|reference|cite)/i.test(lower)) {
          return "The uploaded sources contain related information, though the exact phrasing may differ.";
        }
        
        return reason;
      });
      
      // Remove any remaining absence language
      updatedReasons = updatedReasons.filter((reason) => {
        if (typeof reason !== "string") return true;
        const lower = reason.toLowerCase();
        return !(
          /not mentioned/i.test(lower) ||
          /not specified/i.test(lower) ||
          /not supported/i.test(lower) ||
          /no support/i.test(lower) ||
          /not found/i.test(lower) ||
          /not stated/i.test(lower) ||
          /not referenced/i.test(lower) ||
          /not cited/i.test(lower) ||
          /not present/i.test(lower) ||
          /absent/i.test(lower) ||
          /lacks?/i.test(lower) ||
          /missing/i.test(lower)
        );
      });
      
      // If all reasons were removed, add a default support reason
      if (updatedReasons.length === 0) {
        updatedReasons = ["The uploaded sources contain related information, though the exact phrasing may differ."];
      }
      
      // Diagnostics (A3.5.12)
      const matchTypes = [...new Set(searchResult.hits.map(h => h.matchType))];
      console.log(`[DIAG] A3.5.12: Prevented absence claim - corpusSearch found matches`);
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: updatedReasons.slice(0, 4),
        },
      };
    } else {
      // Corpus search found no matches - absence language MAY be used
      // But ensure it explicitly refers to uploaded sources
      let updatedReasons = reasons.map((reason) => {
        if (typeof reason !== "string") return reason;
        
        const lower = reason.toLowerCase();
        
        // Ensure absence language explicitly refers to uploaded sources
        if (/not mentioned/i.test(lower) && !/uploaded/i.test(lower) && !/memo/i.test(lower)) {
          return reason.replace(/not mentioned/i, "not found in the uploaded memo after review");
        }
        if (/not specified/i.test(lower) && !/uploaded/i.test(lower) && !/memo/i.test(lower)) {
          return reason.replace(/not specified/i, "not found in the uploaded memo after review");
        }
        if ((/not supported/i.test(lower) || /no support/i.test(lower)) && !/uploaded/i.test(lower) && !/memo/i.test(lower)) {
          return reason.replace(/(?:not supported|no support)/i, "not found in the uploaded memo after review");
        }
        if (/not found/i.test(lower) && !/uploaded/i.test(lower) && !/memo/i.test(lower)) {
          return reason.replace(/not found/i, "not found in the uploaded memo after review");
        }
        
        return reason;
      });
      
      // Ensure at least one reason explicitly mentions uploaded sources
      const hasUploadedReference = updatedReasons.some((r) => 
        typeof r === "string" && (/uploaded/i.test(r) || /memo/i.test(r))
      );
      
      if (!hasUploadedReference && updatedReasons.length > 0) {
        // Prepend a reason that explicitly references uploaded sources
        updatedReasons = [
          "Not found in the uploaded memo after review.",
          ...updatedReasons,
        ].slice(0, 4);
      }
      
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: updatedReasons.slice(0, 4),
        },
      };
    }
  });
}

// A3.5.14b Patch 2 & 3: Anchor Enforcement + Ambiguity Routing (LAST MUTATION STEP)
// Enforces invariant: FOUND => cite memo id=1, and routes ambiguity cases
function enforceAnchorCitationsAndAmbiguity(statements, uploadedSources, unifiedReferences) {
  if (!Array.isArray(statements) || !Array.isArray(uploadedSources)) return statements;
  
  // Format uploaded docs for corpusSearch
  const docsWithFullText = uploadedSources.filter(s => 
    typeof s.text === "string" && s.text.trim().length > 0
  );
  
  if (docsWithFullText.length === 0) return statements;
  
  const uploadedDocs = docsWithFullText.map(s => ({
    id: s.id || s.name || `doc_${Math.random()}`,
    title: s.name || s.title || "Untitled source",
    text: s.text || "",
  }));
  
  // Find memo reference ID (id=1 for first uploaded source)
  const memoReferenceId = 1;
  const memoReference = unifiedReferences.find(ref => ref?.id === memoReferenceId && ref?.type === "uploaded");
  
  let checked = 0;
  let foundNoCite = 0;
  let injected = 0;
  let foundButNotInjected = 0;
  
  const updatedStatements = statements.map((stmt, idx) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    // A3.5.18: Collect existing citations from both locations (merge for idempotency)
    const existingAssessmentCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const existingTopLevelCitations = Array.isArray(stmt.citations) ? stmt.citations : [];
    // Merge all existing citations (use Set to dedupe)
    const existingCitationsSet = new Set([...existingAssessmentCitations, ...existingTopLevelCitations]);
    const existingCitations = Array.from(existingCitationsSet);
    const hasEmptyCitations = existingCitations.length === 0;
    
    // Check if this is a WORLD_FACT or contains anchor terms
    const classification = classifyStatementAndProvenance(stmt, unifiedReferences);
    const isWorldFact = classification.category === "WORLD_FACT";
    
    // Check for anchor terms: Series A|pre-money|valuation|fully diluted|ownership|secondary purchase|%
    const hasAnchorTerms = /(series\s+[a-z]|pre-money|post-money|valuation|fully\s+diluted|ownership|secondary\s+purchase|%)/i.test(text);
    
    // Fix 2: Count ALL anchor-heavy statements for accurate summary (even if they already have citations)
    if (isWorldFact || hasAnchorTerms) {
      checked++;
    }
    
    // Check if should enforce (only if empty citations)
    const shouldEnforce = (isWorldFact || hasAnchorTerms) && hasEmptyCitations;
    
    if (!shouldEnforce) return stmt;
    
    // Run corpusSearch (with error handling)
    let searchResult;
    try {
      searchResult = corpusSearch(text, uploadedDocs);
    } catch (searchErr) {
      console.error(`[DIAG][ANCHOR_ENFORCE][ERROR] corpusSearch failed for idx=${idx}:`, searchErr);
      return stmt; // Continue without injection if search fails
    }
    
    if (searchResult && searchResult.found) {
      // Check if has number match or keyword match
      const hasNumberMatch = searchResult.debug && 
        Array.isArray(searchResult.debug.normalizedNumbersFound) && 
        searchResult.debug.normalizedNumbersFound.length > 0;
      const hasKeywordMatch = searchResult.debug && 
        Array.isArray(searchResult.debug.keywordsMatched) && 
        searchResult.debug.keywordsMatched.length > 0;
      
      // Fix 3: Inject citation if FOUND, even if extraction fails
      if (hasNumberMatch || hasKeywordMatch) {
        foundNoCite++;
        
        try {
          // A3.5.18: Inject memo citation - merge with existing (idempotent)
          // Ensure memoReferenceId is included but don't duplicate
          const citationSet = new Set(existingCitations);
          citationSet.add(memoReferenceId);
          const injectedCitations = Array.from(citationSet).sort((a, b) => a - b);
          
          // Build evidence - merge with existing evidence and build for all citations (idempotent)
          const existingEvidence = Array.isArray(stmt.evidence) ? stmt.evidence : 
                                   (Array.isArray(assessment.evidence) ? assessment.evidence : []);
          const evidenceSet = new Map();
          
          // Add existing evidence to set (keyed by title to avoid duplicates)
          existingEvidence.forEach(ev => {
            const key = ev?.title || ev?.url || String(ev);
            if (key && !evidenceSet.has(key)) {
              evidenceSet.set(key, ev);
            }
          });
          
          // Build evidence for all citations from unifiedReferences
          injectedCitations.forEach(citationId => {
            const citationKey = citationId != null ? String(citationId) : null;
            if (citationKey) {
              const ref = unifiedReferences.find(r => String(r?.id) === citationKey);
              if (ref) {
                const refEvidence = {
                  title: ref.title || "Untitled source",
                  url: ref.url || null,
                  sourceType: ref.type || (ref.url ? "web" : "uploaded"),
                };
                const refKey = refEvidence.title || refEvidence.url || citationKey;
                if (!evidenceSet.has(refKey)) {
                  evidenceSet.set(refKey, refEvidence);
                }
              }
            }
          });
          
          const evidence = Array.from(evidenceSet.values());
          
          // Remove absence reasons
          const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
          let updatedReasons = reasons.filter((reason) => {
            if (typeof reason !== "string") return false;
            const lower = reason.toLowerCase();
            return !(
              /not found in memo/i.test(lower) ||
              /does not mention/i.test(lower) ||
              /no citations provided/i.test(lower) ||
              /cannot be confirmed from provided text/i.test(lower) ||
              /not mentioned/i.test(lower) ||
              /not supported/i.test(lower) ||
              /not found/i.test(lower)
            );
          });
          
          // A3.5.14b Patch 3: Check for ambiguity (multiple figures/ranges) - with error handling
          let isAmbiguous = false;
          try {
            const hasRange = /(\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?)\s*[-–—]\s*(\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?)/i.test(text);
            const ambiguityResult = detectAnchorAmbiguity(text, uploadedDocs);
            isAmbiguous = (ambiguityResult.isAmbiguous && ambiguityResult.values.length >= 2) || hasRange;
            
            if (isAmbiguous) {
              // A3.5.14b Patch 3: Use ambiguity template
              const anchorTypeLabel = ambiguityResult.anchorType === "valuation" 
                ? "valuation figures"
                : ambiguityResult.anchorType === "funding"
                ? "funding amounts"
                : "numeric values";
              
              const valueList = ambiguityResult.values && ambiguityResult.values.length >= 2
                ? ambiguityResult.values.slice(0, 2).map(v => v.humanForm).join(" and ")
                : "multiple values";
              
              const ambiguityReason = `The memo contains related ${anchorTypeLabel}; the statement's exact value may be ambiguous relative to multiple memo values. Verify which applies.`;
              updatedReasons = [ambiguityReason, ...updatedReasons].slice(0, 4);
              
              console.log(`[DIAG][AMBIGUITY] idx=${idx} trigger=${hasRange ? "RANGE" : "MULTI_MATCH"} numsInStmt=${JSON.stringify(extractNumericValues(text))} numsInMemo=${JSON.stringify(ambiguityResult.values?.map(v => v.value) || [])}`);
            } else {
              // A3.5.14b Patch 2: Use standard enforcement reason
              updatedReasons = ["Memo contains related support; citation added via invariant enforcement.", ...updatedReasons].slice(0, 4);
            }
          } catch (ambiguityErr) {
            // If ambiguity detection fails, use standard enforcement reason
            console.error(`[DIAG][ANCHOR_ENFORCE][ERROR] ambiguity detection failed for idx=${idx}:`, ambiguityErr);
            updatedReasons = ["Memo contains related support; citation added via invariant enforcement.", ...updatedReasons].slice(0, 4);
          }
          
          injected++;
          
          const beforeState = {
            assessCites: existingCitations.length,
            topCites: existingTopLevelCitations.length,
            evidenceCount: (Array.isArray(assessment.evidence) ? assessment.evidence.length : 0) + (Array.isArray(stmt.evidence) ? stmt.evidence.length : 0)
          };
          
          // A3.5.18 Fix 3: Fix negative removedAbsenceReasons counter
          const removedCount = Math.max(0, reasons.length - updatedReasons.length);
          console.log(`[DIAG][ANCHOR_ENFORCE] idx=${idx} before=${JSON.stringify(beforeState)} after={assessCites:${injectedCitations.length},topCites:${injectedCitations.length},evidenceCount:${evidence.length}} removedAbsenceReasons=${removedCount}`);
          
          return {
            ...stmt,
            citations: injectedCitations,
            evidence: evidence,
            assessment: {
              ...assessment,
              citations: injectedCitations,
              evidence: evidence,
              reasons: updatedReasons,
            },
          };
        } catch (injectionErr) {
          console.error(`[DIAG][ANCHOR_ENFORCE][ERROR] citation injection failed for idx=${idx}:`, injectionErr);
          foundButNotInjected++;
          return stmt; // Continue without injection if it fails
        }
      } else {
        foundButNotInjected++;
      }
    }
    
    return stmt;
  });
  
  console.log(`[DIAG][ANCHOR_ENFORCE][SUMMARY] checked=${checked} foundNoCite=${foundNoCite} injected=${injected} foundButNotInjected=${foundButNotInjected}`);
  
  return updatedStatements;
}

// A3.5.14b Patch 5: Compute extractionQuality from actual quality signals
// Fix 3: Accept rejected/fallback counts to accurately reflect quality
// A3.5.27: Citation backfill for supported-but-non-anchored clauses
// Attempts corpusSearch for statements missing citations when corpusSearch finds support
function backfillCitations(statements, uploadedSources, unifiedReferences, runId = null, reqSig = null) {
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  if (!Array.isArray(statements) || !Array.isArray(uploadedSources)) {
    return { statements, attempted: 0, injected: 0, skippedShort: 0 };
  }
  
  // Format uploaded docs for corpusSearch
  const docsWithFullText = uploadedSources.filter(s => 
    typeof s.text === "string" && s.text.trim().length > 0
  );
  
  if (docsWithFullText.length === 0) {
    return { statements, attempted: 0, injected: 0, skippedShort: 0 };
  }
  
  const uploadedDocs = docsWithFullText.map(s => ({
    id: s.id || s.name || `doc_${Math.random()}`,
    title: s.name || s.title || "Untitled source",
    text: s.text || "",
  }));
  
  // Find memo reference ID (id=1 for first uploaded source)
  const memoReferenceId = 1;
  const memoReference = unifiedReferences.find(ref => ref?.id === memoReferenceId && ref?.type === "uploaded");
  
  let attempted = 0;
  let injected = 0;
  let skippedShort = 0;
  const maxAttempts = 3; // Cap backfill attempts
  
  const updatedStatements = statements.map((stmt, idx) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    // Skip if we've already attempted max times
    if (attempted >= maxAttempts) return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    
    // Skip very short statements (< 40 chars) - should have been merged/dropped
    if (text.trim().length < 40) {
      skippedShort++;
      return stmt;
    }
    
    // Check if citations are missing
    const existingAssessmentCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const existingTopLevelCitations = Array.isArray(stmt.citations) ? stmt.citations : [];
    const existingCitationsSet = new Set([...existingAssessmentCitations, ...existingTopLevelCitations]);
    const hasEmptyCitations = existingCitationsSet.size === 0;
    
    // Check if evidence is missing
    const existingEvidence = Array.isArray(stmt.evidence) ? stmt.evidence : 
                             (Array.isArray(assessment.evidence) ? assessment.evidence : []);
    const hasEmptyEvidence = existingEvidence.length === 0;
    
    // Only attempt if both citations and evidence are empty
    if (!hasEmptyCitations || !hasEmptyEvidence) {
      return stmt;
    }
    
    attempted++;
    
    // Run corpusSearch (already does fuzzy matching by default)
    let searchResult;
    try {
      searchResult = corpusSearch(text, uploadedDocs);
    } catch (searchErr) {
      log(`[CITE_BACKFILL] corpusSearch failed for idx=${idx}:`, searchErr);
      return stmt;
    }
    
    if (searchResult && searchResult.found) {
      // Inject citation
      const citationSet = new Set(existingCitationsSet);
      citationSet.add(memoReferenceId);
      const injectedCitations = Array.from(citationSet).sort((a, b) => a - b);
      
      // Build evidence
      const evidenceSet = new Map();
      existingEvidence.forEach(ev => {
        const key = ev?.title || ev?.url || String(ev);
        if (key && !evidenceSet.has(key)) {
          evidenceSet.set(key, ev);
        }
      });
      
      injectedCitations.forEach(citationId => {
        const citationKey = citationId != null ? String(citationId) : null;
        if (citationKey) {
          const ref = unifiedReferences.find(r => String(r?.id) === citationKey);
          if (ref) {
            const refEvidence = {
              title: ref.title || "Untitled source",
              url: ref.url || null,
              sourceType: ref.type || (ref.url ? "web" : "uploaded"),
            };
            const refKey = refEvidence.title || refEvidence.url || citationKey;
            if (!evidenceSet.has(refKey)) {
              evidenceSet.set(refKey, refEvidence);
            }
          }
        }
      });
      
      const evidence = Array.from(evidenceSet.values());
      
      // Add reason note
      const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
      const updatedReasons = [...reasons, "Memo contains related support; citation added via backfill."];
      
      injected++;
      
      return {
        ...stmt,
        citations: injectedCitations,
        evidence: evidence,
        assessment: {
          ...assessment,
          citations: injectedCitations,
          evidence: evidence,
          reasons: updatedReasons
        }
      };
    }
    
    return stmt;
  });
  
  log(`[CITE_BACKFILL] attempted=${attempted} injected=${injected} skippedShort=${skippedShort}`);
  
  return { statements: updatedStatements, attempted, injected, skippedShort };
}

function computeExtractionQuality(statements, extractionCandidates, rejectedCount = 0, fallbackCount = 0, incompleteNumericFragmentCount = 0, recombinedCount = 0, fragmentDropped = 0, fragmentMerged = 0) {
  if (!Array.isArray(statements) || statements.length === 0) {
    return "failed";
  }
  
  let hasTruncation = false;
  let hasUnbalancedParens = false;
  let hasIncompleteNumeric = false;
  
  for (const stmt of statements) {
    const text = typeof stmt.text === "string" ? stmt.text : "";
    if (!text) continue;
    
    // A3.5.17 Fix 3: Check for incomplete numeric fragments in final output
    if (/\$\d+(?:,\d+)*(?:\.\d+)?\s*$/.test(text) && !/[.?!]\s*$/.test(text)) {
      hasIncompleteNumeric = true;
    } else if (/\b(implying|approximately|at|to|of)\s+(?:an?\s+)?\$\d+(?:,\d+)*(?:\.\d+)?\s*$/i.test(text)) {
      hasIncompleteNumeric = true;
    }
    
    // Fix 4: Use same truncation detection as SEG_GUARD
    // Check for mid-word end (truncation) - STRICT: only flag if strong evidence
    const lastChar = text[text.length - 1];
    const endsWithLetter = /[a-zA-Z]/.test(lastChar);
    const hasTerminalPunct = /[.?!\"'')]\]\s*$/.test(text);
    
    if (endsWithLetter && !hasTerminalPunct) {
      const lastWord = text.split(/\s+/).pop() || "";
      
      // Legitimate endings to preserve: acronyms, entity endings
      // Check for acronyms first (all caps, 2+ chars like APIs, SMBs, etc.)
      const isAcronym = /^[A-Z]{2,}$/.test(lastWord);
      // Check for common entity endings (case-insensitive)
      const legitimateEndings = /^(inc|ltd|corp|llc|plc|gmbh|sas|sa|nv|bv|ab|oy|as|ag|spa|srl|pty|co|llp|pc|pa|lp|p\.?c\.?|l\.?l\.?c\.?|l\.?t\.?d\.?|i\.?n\.?c\.?)$/i;
      const isLegitimateEnding = legitimateEndings.test(lastWord);
      
      // Only flag if very short fragment (< 2 chars) that's not legitimate
      const isVeryShortFragment = lastWord.length < 2 && !isAcronym && !isLegitimateEnding;
      const isSuspiciouslyShort = text.length < 30 && lastWord.length < 3 && !isAcronym && !isLegitimateEnding;
      
      if (isVeryShortFragment || isSuspiciouslyShort) {
        hasTruncation = true;
        console.log(`[DIAG][QUALITY] truncation detected: textPreview="${text.substring(0, 60)}..." lastWord="${lastWord}"`);
      }
    }
    
    // Check for unbalanced parentheses
    const openParens = (text.match(/\(/g) || []).length;
    const closeParens = (text.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      hasUnbalancedParens = true;
    }
  }
  
  // Fix 3: Use actual rejected/fallback counts from SEG_GUARD
  // A3.5.17 Fix 3: Include incomplete_numeric_fragment and recombined counts
  // A3.5.27: Include fragment_dropped and fragment_merged counts
  const reasons = [];
  if (hasTruncation) reasons.push("truncation");
  if (hasUnbalancedParens) reasons.push("unbalanced_parens");
  if (rejectedCount > 0) reasons.push(`rejected_candidates=${rejectedCount}`);
  if (fallbackCount > 0) reasons.push(`fallback=${fallbackCount}`);
  if (incompleteNumericFragmentCount > 0) reasons.push(`incomplete_numeric_fragments=${incompleteNumericFragmentCount}`);
  if (recombinedCount > 0) reasons.push(`recombined_fragments=${recombinedCount}`);
  if (fragmentDropped > 0) reasons.push(`fragment_dropped=${fragmentDropped}`);
  if (fragmentMerged > 0) reasons.push(`fragment_merged=${fragmentMerged}`);
  
  // A3.5.17 Fix 3: Quality must degrade if incomplete_numeric_fragment was repaired
  let quality = "ok";
  if (hasTruncation || hasUnbalancedParens || hasIncompleteNumeric) {
    quality = "failed";
  } else if (rejectedCount > 0 || fallbackCount > 0 || incompleteNumericFragmentCount > 0 || recombinedCount > 0) {
    quality = "degraded";
  }
  
  console.log(`[DIAG][QUALITY] extractionQuality=${quality} reasons=${JSON.stringify(reasons)}`);
  
  return quality;
}

// Fix anchor-fact reasons: detect and correct false "not mentioned" claims
// Invariant 3: Ambiguity ≠ absence
// Invariant 4: Language downgrade for anchor mismatches
// Invariant 5: Interaction with A3.5.9
function fixAnchorFactReasons(statements, unifiedReferences) {
  if (!Array.isArray(statements) || !Array.isArray(unifiedReferences)) return statements;
  
  // Build a map of reference text for searching (we'll use titles and any available content)
  // Note: We don't have full source text here, but we can check if reasons incorrectly claim absence
  // The model should have access to sources, so we're fixing post-hoc incorrect claims
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const text = typeof stmt.text === "string" ? stmt.text : "";
    
    // Check if statement contains anchor facts
    const anchorFacts = extractAnchorFacts(text);
    if (anchorFacts.length === 0) return stmt; // Not an anchor fact statement
    
    // Normalize citations
    const citations = 
      (Array.isArray(stmt?.citations) && stmt.citations.length > 0) ? stmt.citations :
      (Array.isArray(assessment?.citations) && assessment.citations.length > 0) ? assessment.citations :
      [];
    
    const hasCitations = citations.length > 0;
    
    // Detect false "not mentioned" claims for anchor facts
    const falseAbsencePatterns = [
      /(?:neither|nor).*(?:mention|state|reference|cite).*(?:valuation|funding|revenue|figure|amount)/i,
      /(?:no|not).*(?:source|sources|memo|document).*(?:mention|state|reference|cite)/i,
      /(?:not mentioned|not stated|not referenced|not cited)/i,
      /(?:no independent source|no source).*(?:found|mentions|states)/i,
    ];
    
    const hasFalseAbsenceClaim = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      // Check if reason claims absence for an anchor fact
      if (!falseAbsencePatterns.some((pattern) => pattern.test(reason))) return false;
      // Check if it's about a numeric anchor
      return anchorFacts.some((fact) => {
        const factValue = fact.value;
        // Check if reason mentions a similar value (within reasonable range)
        const valuePattern = new RegExp(`\\$${Math.round(factValue / 1e6)}[^\\d]|\\$${Math.round(factValue / 1e6)}m|${Math.round(factValue / 1e6)}\\s*million`, "i");
        return valuePattern.test(reason) || reason.includes("valuation") || reason.includes("funding");
      });
    });
    
    if (hasFalseAbsenceClaim && hasCitations) {
      // This is suspicious - we have citations but reason says "not mentioned"
      // This suggests the model may have missed a semantic match
      // We'll update the reason to be more cautious/ambiguous rather than claiming absence
      
      let updatedReasons = reasons.map((reason) => {
        if (typeof reason !== "string") return reason;
        
        if (falseAbsencePatterns.some((pattern) => pattern.test(reason))) {
          // Replace absolute absence claim with ambiguity language
          const anchorFact = anchorFacts[0];
          const valueText = anchorFact.value >= 1e6 
            ? `$${Math.round(anchorFact.value / 1e6)} million`
            : `$${Math.round(anchorFact.value / 1e3)} thousand`;
          
          // Check if reason mentions specific value
          if (reason.match(new RegExp(valueText.replace(/\$/g, "\\$").replace(/million/g, "(?:million|mm|m)"), "i"))) {
            return `The sources may reference ${valueText} ${anchorFact.type} figures, but the specific context or timing creates ambiguity as to which applies here.`;
          } else {
            return `The sources reference ${anchorFact.type} figures, but there may be ambiguity as to which specific value applies to this claim.`;
          }
        }
        
        return reason;
      });
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: updatedReasons.slice(0, 4),
        },
      };
    }
    
    // Check for multiple anchor values that might cause ambiguity
    // This is a heuristic - we check if reasons mention multiple values
    const multipleValuePattern = /(\$\d+(?:\.\d+)?\s*(?:million|mm|m|billion|b))\s+.*(\$\d+(?:\.\d+)?\s*(?:million|mm|m|billion|b))/i;
    const hasMultipleValues = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      return multipleValuePattern.test(reason);
    });
    
    if (hasMultipleValues && hasCitations) {
      // Extract the values mentioned
      const valueMatches = reasons
        .filter((r) => typeof r === "string")
        .flatMap((r) => {
          const matches = r.matchAll(/\$([\d,]+(?:\.\d+)?)\s*(million|mm|m|billion|b)/gi);
          return Array.from(matches).map((m) => {
            const num = parseFloat(m[1].replace(/,/g, ""));
            const unit = m[2].toLowerCase();
            const multiplier = unit === "b" || unit === "billion" ? 1e9 : 1e6;
            return num * multiplier;
          });
        });
      
      const uniqueValues = [...new Set(valueMatches)].sort((a, b) => a - b);
      
      if (uniqueValues.length > 1) {
        // Multiple values exist - ensure reason explicitly mentions ambiguity
        const hasAmbiguityLanguage = reasons.some((r) => 
          typeof r === "string" && (r.includes("ambiguity") || r.includes("unclear") || r.includes("multiple"))
        );
        
        if (!hasAmbiguityLanguage) {
          const valueTexts = uniqueValues.map((v) => 
            v >= 1e6 ? `$${Math.round(v / 1e6)} million` : `$${Math.round(v / 1e3)} thousand`
          ).join(" and ");
          
          const anchorFact = anchorFacts[0];
          const ambiguityReason = `The sources reference multiple ${anchorFact.type} figures (${valueTexts}), creating ambiguity as to which applies here.`;
          
          // Add ambiguity reason if not already present
          let updatedReasons = [...reasons];
          if (!updatedReasons.some((r) => typeof r === "string" && r.includes("ambiguity"))) {
            updatedReasons.push(ambiguityReason);
          }
          
          return {
            ...stmt,
            assessment: {
              ...assessment,
              reasons: updatedReasons.slice(0, 4),
            },
          };
        }
      }
    }
    
    return stmt;
  });
}

// Final post-condition clamp: ensure no High/Medium with missing citations
// This is the absolute final check before returning response
// Uses centralized provenance classification
function applyFinalPostCheck(statements, unifiedReferences) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const score = typeof assessment.reliabilityScore === "number" ? assessment.reliabilityScore : 30;
    
    // Use centralized classification
    const classification = classifyStatementAndProvenance(stmt, unifiedReferences);
    const { provenance, resolvedCitations, memoReference, category } = classification;
    
    // DIAGNOSTIC: Log final post-check for high scores
    if (score > 35) {
    }
    
    // Allow >35 only if provenance is valid (CITED_OK or MEMO_OK)
    const canBeHighMedium = provenance === "CITED_OK" || provenance === "MEMO_OK";
    
    // If score >35 but no valid provenance, force Low
    if (score > 35 && !canBeHighMedium) {
      console.log(`[DIAG] applyFinalPostCheck: clamping High/Medium to Low:`, {
        text: text.substring(0, 60),
        originalScore: score,
        provenance,
        resolvedCitations,
        category,
      });
      const forcedScore = Math.min(score, 35);
      let updatedReasons = [...reasons];
      const verificationReason = "No verifiable sources cited.";
      
      // Ensure verification reason is present
      if (!updatedReasons.some((r) => r && r.includes("No verifiable sources"))) {
        updatedReasons = [verificationReason, ...updatedReasons].slice(0, 4);
      }
      
      console.log(`[Review] Final clamp: forced Low (${forcedScore}) for statement with score ${score} (provenance: ${provenance}): "${text.substring(0, 50)}..."`);
      
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
    }
    
    // For MEMO_OK document-descriptive statements without citations, ensure memo citation is present
    if (provenance === "MEMO_OK" && resolvedCitations.length === 0 && memoReference) {
      const injectedId = memoReference.id;
      const idExists = unifiedReferences.some(r => r.id === injectedId);
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          citations: [injectedId], // Inject memo citation for evidence rendering
        },
      };
    }
    
    return stmt;
  });
}

// Detect if reasons indicate strong unverifiability (blocks Medium calibration)
// Only strong signals that indicate the claim cannot be validated, not merely uncited
function isUncertaintyReason(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) return false;
  
  // Strong unverifiability keywords only (exclude generic "no supporting source" etc.)
  const strongUnverifiabilityKeywords = [
    "unnamed",
    "not identified",
    "no identifying details",
    "cannot verify",
    "cannot be verified",
    "not verifiable",
    "cannot corroborate",
    "unverifiable",
    "insufficient information",
    "cannot be validated",
    "cannot be confirmed",
    "no way to verify",
  ];
  
  const reasonsText = reasons
    .filter((r) => typeof r === "string")
    .join(" ")
    .toLowerCase();
  
  return strongUnverifiabilityKeywords.some((keyword) => reasonsText.includes(keyword));
}

// Calibrate non-anchor statements: allow Medium for uncited synthesis unless uncertain
// Only processes statements that passed dual-axis verification (have citations or are doc-descriptive with memo support)
function applyNonAnchorCalibration(statements) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const citations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const hasCitations = citations.length > 0;
    const isAnchor = isAnchorFact(text);
    const isUncertain = isUncertaintyReason(reasons);
    
    // Skip anchor facts (already handled by anchor gating)
    if (isAnchor) return stmt;
    
    // Skip statements with citations (respect model scoring)
    if (hasCitations) return stmt;
    
    // Skip statements forced Low by dual-axis verification gate
    // Check if reasons indicate this was forced Low due to missing provenance
    const hasVerificationReason = reasons.some((r) => 
      r && (r.includes("No verifiable sources") || r.includes("could not be verified against provided sources"))
    );
    if (hasVerificationReason) return stmt; // Already forced Low by dual-axis gate
    
    // Only process non-anchor, uncited statements that weren't forced Low
    // These should only be document-descriptive with memo support (which passed dual-axis)
    let score = typeof assessment.reliabilityScore === "number"
      ? Math.max(0, Math.min(100, assessment.reliabilityScore))
      : 30;
    let label = typeof assessment.reliabilityLabel === "string"
      ? assessment.reliabilityLabel
      : score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
    
    if (isUncertain) {
      // Keep Low if uncertain (do not inflate)
      if (score > 35) {
        score = 35;
        label = "Low";
      }
    } else {
      // Not uncertain: raise to Medium default if too low
      if (score < 55) {
        score = 65;
        label = "Medium";
      } else if (score >= 60 && label !== "High" && label !== "Medium") {
        // Ensure label matches score if already in Medium/High range
        label = score >= 80 ? "High" : "Medium";
      }
      
      // Add calibrated note only if reasons are empty
      let updatedReasons = [...reasons];
      if (updatedReasons.length === 0) {
        updatedReasons = ["No supporting source was cited; assessment reflects internal consistency of the draft."];
      }
      updatedReasons = updatedReasons.slice(0, 4); // Cap at 4
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reliabilityScore: score,
          reliabilityLabel: label,
          reasons: updatedReasons,
        },
      };
    }
    
    // If uncertain, return with adjusted score/label
    return {
      ...stmt,
      assessment: {
        ...assessment,
        reliabilityScore: score,
        reliabilityLabel: label,
      },
    };
  });
}

// Apply paraphrase tolerance: raise scores when substance is strongly supported but exact phrases don't match
// Invariant 1: Paraphrase should not be a penalty by default
// Invariant 2: Bundled-claim coverage governs score
// Invariant 3: Penalize evaluative/interpretive framing only if sources don't support it
function applyParaphraseTolerance(statements, unifiedReferences) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    let score = typeof assessment.reliabilityScore === "number"
      ? Math.max(0, Math.min(100, assessment.reliabilityScore))
      : 30;
    let label = typeof assessment.reliabilityLabel === "string"
      ? assessment.reliabilityLabel
      : score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
    
    // Normalize citations from both locations
    const citations = 
      (Array.isArray(stmt?.citations) && stmt.citations.length > 0) ? stmt.citations :
      (Array.isArray(assessment?.citations) && assessment.citations.length > 0) ? assessment.citations :
      [];
    
    // Check if statement has resolved citations/evidence
    const hasResolvedCitations = citations.length > 0;
    
    // Use centralized classification to get provenance
    const classification = classifyStatementAndProvenance(stmt, unifiedReferences);
    const { provenance, category } = classification;
    
    // Only apply to statements with citations and valid provenance
    if (!hasResolvedCitations || (provenance !== "CITED_OK" && provenance !== "MEMO_OK")) {
      return stmt;
    }
    
    // Detect phrase-mismatch penalty patterns in reasons
    const phraseMismatchPatterns = [
      /does not use the exact phrase/i,
      /exact phrase.*missing/i,
      /exact wording.*not found/i,
      /phrase.*does not appear/i,
      /wording.*differs/i,
    ];
    
    const hasPhraseMismatchPenalty = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      return phraseMismatchPatterns.some((pattern) => pattern.test(reason));
    });
    
    // Detect if reasons indicate missing facts vs just phrase mismatch
    const missingFactPatterns = [
      /not (?:explicitly )?(?:stated|mentioned|found|present|supported)/i,
      /(?:lacks?|missing|absent|no evidence for|unsupported).*(?:fact|claim|element|detail|information)/i,
      /cannot (?:be )?(?:verified|confirmed|validated|corroborated)/i,
    ];
    
    const hasMissingFactPenalty = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      // Exclude phrase-mismatch reasons from missing-fact detection
      if (phraseMismatchPatterns.some((pattern) => pattern.test(reason))) return false;
      return missingFactPatterns.some((pattern) => pattern.test(reason));
    });
    
    // Detect evaluative/interpretive framing phrases in statement
    const evaluativePhrases = [
      /\binvestment thesis (?:rests on|is based on)/i,
      /\battractive (?:unit economics|position|prospects)/i,
      /\bpositioned to (?:consolidate|dominate|succeed)/i,
      /\bdifferentiated/i,
      /\bcompelling/i,
      /\bstrong (?:thesis|position|advantage)/i,
    ];
    
    const hasEvaluativeFraming = evaluativePhrases.some((pattern) => pattern.test(text));
    
    // Detect bundled claims (multiple sub-claims)
    const bundledClaimIndicators = [
      /,.*and/i,  // comma followed by "and"
      / and /i,   // standalone "and"
      / with /i,  // "with"
      / which /i, // "which"
      / under /i, // "under"
    ];
    
    const isBundledClaim = bundledClaimIndicators.some((pattern) => pattern.test(text));
    
    // Track if we need to update the statement
    let needsUpdate = false;
    let updatedReasons = [...reasons];
    
    // Invariant 1: If only phrase mismatch penalty exists (no missing facts), adjust score upward
    if (hasPhraseMismatchPenalty && !hasMissingFactPenalty && hasResolvedCitations) {
      // Apply modest score uplift for phrase mismatch alone
      // Only if current score is below what it should be for supported substance
      if (score < 70 && category === "DOCUMENT_DESCRIPTIVE") {
        // For document-descriptive with phrase mismatch only, raise to Medium-High range
        score = Math.min(75, score + 15);
        label = score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
        needsUpdate = true;
        
        // Replace phrase-mismatch reasons with accurate explanation
        updatedReasons = updatedReasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          if (phraseMismatchPatterns.some((pattern) => pattern.test(reason))) {
            return "Sources support the underlying facts but not the exact phrasing used in the statement.";
          }
          return reason;
        });
      } else if (score < 60 && category !== "DOCUMENT_DESCRIPTIVE") {
        // For world-fact with phrase mismatch only, raise modestly
        score = Math.min(70, score + 10);
        label = score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
        needsUpdate = true;
        
        updatedReasons = updatedReasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          if (phraseMismatchPatterns.some((pattern) => pattern.test(reason))) {
            return "Sources support the underlying facts but not the exact phrasing used in the statement.";
          }
          return reason;
        });
      }
    }
    
    // Invariant 2: For bundled claims, assess support coverage
    if (isBundledClaim && hasResolvedCitations) {
      // Count sub-claims (rough heuristic: count conjunctions and commas)
      const conjunctionCount = (text.match(/\b(and|with|which|under)\b/gi) || []).length;
      const commaCount = (text.match(/,/g) || []).length;
      const estimatedSubClaims = Math.max(2, Math.min(5, conjunctionCount + commaCount / 2));
      
      // Check if reasons indicate unsupported sub-claims
      const unsupportedElementCount = updatedReasons.filter((reason) => {
        if (typeof reason !== "string") return false;
        // Count reasons that mention unsupported elements (excluding phrase mismatch)
        if (phraseMismatchPatterns.some((pattern) => pattern.test(reason))) return false;
        return missingFactPatterns.some((pattern) => pattern.test(reason));
      }).length;
      
      // Estimate support coverage
      const supportedSubClaims = estimatedSubClaims - unsupportedElementCount;
      const coverageRatio = supportedSubClaims / Math.max(1, estimatedSubClaims);
      
      // Adjust score based on coverage
      if (coverageRatio >= 0.8 && score < 75) {
        // High coverage: raise to High-Medium range
        score = Math.min(80, Math.max(score, 70));
        label = score >= 80 ? "High" : "Medium";
        needsUpdate = true;
        
        // Add coverage explanation if not already present
        const hasCoverageExplanation = updatedReasons.some((r) => 
          typeof r === "string" && (r.includes("coverage") || r.includes("sub-claims") || r.includes("elements"))
        );
        if (!hasCoverageExplanation) {
          updatedReasons = ["Most sub-claims are directly supported by sources.", ...updatedReasons].slice(0, 4);
        }
      } else if (coverageRatio >= 0.5 && score < 60) {
        // Medium coverage: raise to Medium range
        score = Math.min(70, Math.max(score, 55));
        label = "Medium";
        needsUpdate = true;
        
        // Add coverage explanation if not already present
        const hasCoverageExplanation = updatedReasons.some((r) => 
          typeof r === "string" && (r.includes("coverage") || r.includes("sub-claims") || r.includes("elements"))
        );
        if (!hasCoverageExplanation) {
          updatedReasons = ["Some sub-claims are supported, but others are inferential or not explicitly stated.", ...updatedReasons].slice(0, 4);
        }
      }
      // Low coverage: keep existing score (likely already Low)
    }
    
    // Invariant 3: For evaluative framing, only penalize if sources don't support it
    if (hasEvaluativeFraming && hasResolvedCitations) {
      // If score is Low but only due to evaluative framing (not missing facts), raise to Medium
      if (score < 60 && !hasMissingFactPenalty && hasPhraseMismatchPenalty) {
        score = Math.min(65, score + 10);
        label = "Medium";
        needsUpdate = true;
        
        // Update reasons to reflect evaluative framing issue
        updatedReasons = updatedReasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          if (phraseMismatchPatterns.some((pattern) => pattern.test(reason))) {
            return "Sources support underlying facts but not the evaluative framing or strength of conclusion.";
          }
          return reason;
        });
      }
    }
    
    // Return updated statement if any adjustments were made
    if (needsUpdate) {
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reliabilityScore: score,
          reliabilityLabel: label,
          reasons: updatedReasons.slice(0, 4),
        },
      };
    }
    
    return stmt;
  });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // A3.5.22 Fix: Hoist hasReturned, runId, reqSig, and finalResponseObject to top of handler scope
  // to prevent TDZ ReferenceError when early returns access hasReturned before declaration
  let hasReturned = false;
  let runId = null;
  let reqSig = null;
  let finalResponseObject = null;

  if (req.method === "OPTIONS") {
    hasReturned = true;
    try {
      diag("options", "preflight", `END_DIAG path=options status=200 returningNow=true`);
    } catch {}
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    hasReturned = true;
    try {
      diag("unknown", "method", `END_DIAG path=method_error status=405 returningNow=true`);
    } catch {}
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    hasReturned = true;
    try {
      diag("early", "config", `END_DIAG path=config_error status=500 returningNow=true`);
    } catch {}
    return res.status(500).json({ ok: false, error: "Server is missing OPENAI_API_KEY" });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const versionId = typeof body.versionId === "string" ? body.versionId : null;
    const sources = Array.isArray(body.sources) ? body.sources : [];
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";

    if (!draftText.trim()) {
      hasReturned = true;
      try {
        diag("early", "validation", `END_DIAG path=validation_error status=400 returningNow=true`);
      } catch {}
      return res.status(400).json({ error: "Missing draftText" });
    }
    
    // A3.5.20 Fix 1 & 2: Generate runId and reqSig early for unambiguous logging
    runId = Math.random().toString(36).substring(2, 15);
    const publicSearch = true; // Analysis always uses web search
    reqSig = generateReqSig(draftText, sources, publicSearch);
    
    // A3.5.21 Diagnostic: Initialize run state for this RID
    if (runId) {
      runStateByRid[runId] = { finalCountsReached: false };
    }
    
    // A3.5.20 Fix 2: Request start sentinel
    const bodySize = typeof req.body === "string" ? req.body.length : JSON.stringify(req.body || {}).length;
    diag(runId, reqSig, `START method=${req.method} webSearchEnabled=${publicSearch} bodySize=${bodySize}`);

    // Format uploaded sources for prompt (version-scoped)
    const uploadedSources = sources.map((s) => ({
      id: s?.id || null,
      name: s?.name || s?.title || "Untitled source",
      text: s?.text || "",
      kind: s?.kind || s?.sourceType || "file",
      url: s?.url || null,
    }));

    // Build uploaded sources context for prompt
    let uploadedSourcesBlock = "";
    if (uploadedSources.length > 0) {
      const sourcesList = uploadedSources.map((s, idx) => {
        const name = s.name || "Untitled source";
        const text = s.text || "";
        const excerpt = text.length > 2000 ? text.substring(0, 2000) + "..." : text;
        return `[UPLOADED ${idx + 1}] ${name}\n${excerpt || "(no text content)"}`;
      }).join("\n\n");
      uploadedSourcesBlock = sourcesList;
    } else {
      uploadedSourcesBlock = "(none)";
    }

    // Analysis always uses web search
    // Force publicSearch = true regardless of client request (publicSearch from body is ignored)
    // publicSearch already declared above
    const query = deriveQueryFromDraft(draftText);
    
    let search = { ok: false, results: [] };
    let webBlock = "";
    let webReferences = [];
    
    try {
      search = await tavilySearch({ query, maxResults: 6 });
      
      // A3.5.14b Patch 4: Web Reference Hygiene - filter BEFORE reference construction
      // Filter raw search results to prevent irrelevant results from being converted to references
      diag(runId, reqSig, `[PIPELINE] phase=filterWebSearchResults`);
      const rawResults = search?.results || [];
      const filteredResults = filterWebSearchResults(rawResults, draftText, runId, reqSig);
      
      // Now convert filtered results to references
      webReferences = webResultsToReferences(filteredResults);
      webBlock = formatWebResultsForPrompt({ ...search, results: filteredResults });
    } catch (searchErr) {
      // Continue with empty web results - analysis can still proceed
      search = { ok: false, results: [], error: searchErr?.message };
      webBlock = "(none)";
      webReferences = [];
    }

    // Create unified references list: uploaded first, then web
    // Uploaded references get IDs 1..N, web references get IDs (N+1)..(N+M)
    const uploadedReferences = uploadedSources.map((s, idx) => ({
      id: idx + 1,
      title: s.name || "Untitled source",
      url: s.url || null,
      type: "uploaded",
    }));

    const webRefStartId = uploadedReferences.length + 1;
    const webReferencesWithIds = webReferences.map((ref, idx) => ({
      ...ref,
      id: webRefStartId + idx,
      type: "web",
    }));

    const unifiedReferences = [...uploadedReferences, ...webReferencesWithIds];
    const maxRefIndex = unifiedReferences.length;
    

    // A3.5.16: Pre-merge continuation fragments before sentence splitting
    // This fixes fragmentation issues where rawSentences are already broken
    diag(runId, reqSig, `[PIPELINE] phase=mergeContinuationFragments`);
    const normalizedDraftText = mergeContinuationFragments(draftText, runId, reqSig);
    
    // A3.5.13: Deterministic statement extraction (Part B)
    // Extract candidate statements BEFORE LLM call
    // A3.5.21 Step 3: Pass hasReturned flag to guard against execution after return
    diag(runId, reqSig, `[PIPELINE] phase=extractCandidates`);
    const rawExtractionCandidates = extractDeterministicStatementCandidates(normalizedDraftText, runId, reqSig, hasReturned);
    
    // A3.5.14 Part A: Filter candidates for quality (extraction stability)
    // Get raw sentences for context (we need to pass them to the filter)
    // Use normalized text to ensure consistent sentence boundaries
    const sentenceBoundaryPattern = /[.!?\n]+/;
    const rawSentences = normalizedDraftText
      .split(sentenceBoundaryPattern)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    diag(runId, reqSig, `[PIPELINE] phase=filterCandidateQuality`);
    const filterResult = filterCandidateQuality(rawExtractionCandidates, rawSentences, normalizedDraftText, runId, reqSig);
    const extractionCandidates = Array.isArray(filterResult.candidates) ? filterResult.candidates : (typeof filterResult === "object" && filterResult ? [] : filterResult);
    const rejectedCount = typeof filterResult === "object" && filterResult.rejectedCount != null ? filterResult.rejectedCount : 0;
    const fallbackCount = typeof filterResult === "object" && filterResult.fallbackCount != null ? filterResult.fallbackCount : 0;
    // A3.5.26 Fix C: Extract incompleteNumericFragmentCount and recombinedCount from filterResult
    const incompleteNumericFragmentCount = typeof filterResult === "object" && filterResult.incompleteNumericFragmentCount != null ? filterResult.incompleteNumericFragmentCount : 0;
    const recombinedCount = typeof filterResult === "object" && filterResult.recombinedCount != null ? filterResult.recombinedCount : 0;
    diag(runId, reqSig, `A3.5.13: Pre-extracted ${extractionCandidates.length} candidate statements before LLM call (filtered from ${rawExtractionCandidates.length} raw candidates, rejected=${rejectedCount}, fallback=${fallbackCount})`);
    
    // A3.5.27: Fragment-only candidate suppression (post SEG_GUARD)
    diag(runId, reqSig, `[PIPELINE] phase=filterFragmentCandidates`);
    const segGuardMetadata = {
      candidatesWithReasons: filterResult.candidatesWithReasons || []
    };
    const fragFilterResult = filterFragmentCandidates(extractionCandidates, runId, reqSig, segGuardMetadata);
    const finalExtractionCandidates = fragFilterResult.candidates;
    diag(runId, reqSig, `A3.5.27: After fragment filter: ${finalExtractionCandidates.length} candidates (dropped=${fragFilterResult.dropped}, mergedPrev=${fragFilterResult.mergedPrev}, mergedNext=${fragFilterResult.mergedNext})`);
    
    // A3.5.27: Use candidateObjects to preserve candidateIndex for draft order
    // A3.6.6: Also preserve draftPosition
    // Store original candidate list with indices for later matching
    const candidateIndexMap = new Map();
    const candidateObjects = fragFilterResult.candidateObjects || [];
    candidateObjects.forEach((candidateObj, idx) => {
      const candidate = candidateObj.text;
      const candidateIndex = candidateObj.candidateIndex != null ? candidateObj.candidateIndex : idx;
      const draftPosition = candidateObj.draftPosition != null ? candidateObj.draftPosition : candidateIndex;
      const normalized = candidate.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
      // Store both exact and normalized for matching, using preserved candidateIndex and draftPosition
      candidateIndexMap.set(candidate, { candidateIndex, draftPosition });
      candidateIndexMap.set(normalized, { candidateIndex, draftPosition });
    });
    
    // Build candidate statements block for prompt
    const candidatesBlock = finalExtractionCandidates.length > 0
      ? finalExtractionCandidates.map((c, idx) => `${idx + 1}. ${c}`).join("\n")
      : "(no extractable statements found)";

    const system = `
You are the "Review" engine inside Content Engine.

STATEMENT EXTRACTION (A3.5.13 - CRITICAL):
- You MUST ONLY score and classify the PRE-EXTRACTED candidate statements listed below.
- Do NOT invent new statements or extract additional statements from the draft.
- Do NOT create statements derived from source documents.
- Your job is to ASSESS each pre-extracted candidate, not to extract new ones.
- For each candidate statement, provide:
  - reliabilityScore (0-100)
  - reliabilityLabel (High|Medium|Low)
  - reasons (array of up to 4 strings explaining the assessment)
  - citations (array of reference IDs from the REFERENCES list, empty if unsupported)

PRE-EXTRACTED CANDIDATE STATEMENTS (you must assess these):
${candidatesBlock}

If the candidate list is empty or you cannot assess any candidates, return: {"statements": []}

DUAL-AXIS VERIFICATION (MANDATORY):
A statement is only verified if BOTH are true:
1) The statement is factually correct
2) The statement can be traced to specific, known sources

STATEMENT CLASSIFICATION:
Classify each statement as one of:
1) World-Fact Statement: Claims about the company, metrics, performance, pricing, growth, history, etc.
   - MUST have resolvable citations to uploaded or web sources
   - No citations → force Low (≤35)
2) Document-Descriptive Statement: Claims describing what the uploaded memo does, proposes, evaluates, or recommends
   - MAY be verified against the uploaded memo itself (memo counts as valid provenance)
   - Should NOT be treated as uncited if supported by memo
3) Unsupported/Speculative Statement: Claims with no support in provided sources
   - Must be scored Low with clear explanation

VERIFICATION RULES:
- World-fact claims MUST include at least one citation to a source from the REFERENCES list.
- Document-descriptive claims MAY cite the uploaded memo (if it supports the claim).
- High/Medium reliability (score >35) is ONLY allowed if the statement has at least one valid citation.
- If you cannot cite a claim to a provided source:
  - Set citations: []
  - Set reliabilityLabel: "Low"
  - Set reliabilityScore: 20-35
  - Include in reasons: "No verifiable sources cited." and "This statement could not be verified against provided sources."
- The draft text itself is NEVER a source. "Directly stated in the draft" describes where a claim appears, but is NOT evidence.
- Do NOT treat the draft or generated text as a citable source.

ABSENCE CLAIMS (A3.5.11 - CRITICAL):
- NEVER claim that a fact is "not mentioned", "not specified", or "not supported" by uploaded sources unless you have considered the FULL uploaded document corpus.
- The uploaded sources excerpts shown here are truncated (first 2000 chars). The full corpus may contain information not visible in these excerpts.
- Before asserting absence:
  - Consider numeric variations (e.g., "$25mm" vs "25 million" vs "$25m")
  - Consider key term variations (e.g., "valuation" vs "pre-money valuation")
  - Consider phrasing variations (e.g., "board seats" vs "board representation")
- If you find related information in uploaded sources (even with different phrasing), do NOT claim absence.
- If you must assert absence after considering the full context:
  - Use explicit language: "not found in the uploaded memo after review"
  - Do NOT use vague language like "no sources were provided" when sources exist
  - Do NOT imply system ignorance or incomplete review

ATTRIBUTION RULES:
- Statements may be supported by EITHER uploaded sources OR web sources (or both).
- Uploaded sources are authoritative for memo facts and internal claims.
- Web sources provide external verification and public information.
- Synthesis is allowed if supported by uploaded sources OR web sources (citable with [n]).
- Numeric paraphrase allowed if consistent with uploaded sources OR web sources (citable).
- Anchor facts (years/dates, exchange/tickers, specific numbers) REQUIRE at least ONE citation [n] to either an uploaded source or a web reference.
- Statements supported by uploaded sources alone (no web citations) can still be scored High/Medium if directly supported AND properly cited.

CITATIONS (STRICT):
- Use bracket citations [1], [2], ... referencing ONLY the unified REFERENCES list provided below.
- Citations must be integers within the range 1..${maxRefIndex}${uploadedReferences.length > 0 ? ` (where 1..${uploadedReferences.length} are uploaded sources${webReferencesWithIds.length > 0 ? `, ${uploadedReferences.length + 1}..${maxRefIndex} are web references` : ''})` : ''}.
- You may ONLY cite sources from the provided REFERENCES list.
- Do NOT invent citation IDs.
- Do NOT cite the draft or the generated text as evidence.
- If no sources are available or a claim cannot be cited, set citations: [] and mark as Low.

ASSESSMENT REASONS - FACET-SCOPED BULLETS (A3.5.29):
- If a statement contains 2+ numeric anchors OR multiple clauses (commas / "at a" / "structured as" / "for roughly"),
  then you MUST write reasons as facet-scoped bullets.
- Facet-scoped bullet format (strict):
  - Start each bullet with a short facet label in brackets: [Investment], [Valuation], [Structure], [Ownership], [Timing], [Other]
  - Include a short quoted snippet (<= 10 words) from the statement showing what the bullet refers to.
    Example: [Valuation] "$20 million pre-money" not confirmed in sources...
  - Then provide the actual reasoning.
- Cap bullets: Max 4 bullets total per statement.
- Prefer covering the highest-impact facets first (investment amount, valuation, ownership).
- Eliminate "global" bullets that don't point to a clause.
  - No bullets like "No verifiable sources cited" unless also tied to a facet:
    [Structure] "structured as 1x straight preferred" not confirmed...
- Do NOT repeat the same bullet. Each bullet must cover a DIFFERENT facet.
- Never output a generic bullet like "All anchor facts are supported" more than once; prefer facet bullets.
- For single-claim statements, you may use standard format without facet tags.

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact schema:
{
  "statements": [
    {
      "text": "string (must match one of the pre-extracted candidates exactly or be a close paraphrase)",
      "assessment": {
        "reliabilityScore": number (0-100),
        "reliabilityLabel": "High|Medium|Low",
        "reasons": ["string", ...] (up to 4 reasons),
        "citations": [1,2] (array of integers, empty if unsupported)
      }
    }
  ]
}

CRITICAL: Each statement.text in your output MUST correspond to one of the pre-extracted candidates above.
Do NOT add new statements that are not in the candidate list.
If you cannot assess any candidates, return: {"statements": []}
`.trim();

    const user = `
DRAFT:
${draftText}

UPLOADED SOURCES (used for this version):
${uploadedSourcesBlock}

UPLOADED REFERENCES:
${
  uploadedReferences.length > 0
    ? uploadedReferences.map((r) => `[${r.id}] ${r.title}${r.url ? ` — ${r.url}` : ""}`).join("\n")
    : "(none)"
}

WEB RESULTS:
${webBlock || "(none)"}

WEB REFERENCES:
${
  webReferencesWithIds.length > 0
    ? webReferencesWithIds.map((r) => `[${r.id}] ${r.title} — ${r.url}`).join("\n")
    : "(none)"
}

ALL REFERENCES (unified, for citation):
${
  unifiedReferences.length > 0
    ? unifiedReferences.map((r) => `[${r.id}] ${r.title}${r.url ? ` — ${r.url}` : ""} (${r.type})`).join("\n")
    : "(none)"
}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    
    // Extract JSON robustly
    let parsed = extractFirstJson(raw);
    let extractionQuality = "ok";
    
    // DIAGNOSTIC: Log model output summary
    if (parsed && typeof parsed === "object") {
      const rawStatements = Array.isArray(parsed.statements) ? parsed.statements : [];
      diag(runId, reqSig, `Model output: ${rawStatements.length} statements`);
    } else {
      diag(runId, reqSig, `Model output: parsed is null or invalid, type=${typeof parsed}`);
    }
    
    // Coerce and validate statements (using unified references count)
    let statements = coerceStatements(parsed, maxRefIndex);
    
    // A3.6.11: Repair numeric fragments after filterCandidateQuality
    diag(runId, reqSig, `[PIPELINE] phase=repairNumericFragments`);
    statements = repairNumericFragments(statements, normalizedDraftText, runId, reqSig);
    
    // A3.5.13: Map LLM output back to pre-extracted candidates for stability
    // A3.5.26 Fix B: Also assign candidateIndex for ordering preservation
    // If LLM produced statements, ensure they match candidates (fuzzy matching allowed for minor rewording)
    if (statements.length > 0 && finalExtractionCandidates.length > 0) {
      // Build a map of normalized candidates for matching using preserved candidateIndex and draftPosition
      const candidateMap = new Map();
      const candidateObjects = fragFilterResult.candidateObjects || [];
      candidateObjects.forEach((candidateObj) => {
        const candidate = candidateObj.text;
        const candidateIndex = candidateObj.candidateIndex != null ? candidateObj.candidateIndex : candidateObjects.indexOf(candidateObj);
        const draftPosition = candidateObj.draftPosition != null ? candidateObj.draftPosition : candidateIndex;
        const normalized = candidate.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
        if (!candidateMap.has(normalized)) {
          candidateMap.set(normalized, { candidate, index: candidateIndex, draftPosition });
        }
      });
      // Fallback: if candidateObjects not available, use finalExtractionCandidates with idx
      if (candidateObjects.length === 0) {
        finalExtractionCandidates.forEach((candidate, idx) => {
          const normalized = candidate.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
          if (!candidateMap.has(normalized)) {
            candidateMap.set(normalized, { candidate, index: idx, draftPosition: idx });
          }
        });
      }
      
      // Filter statements to only include those matching candidates and assign candidateIndex
      const matchedStatements = [];
      for (const stmt of statements) {
        const stmtText = typeof stmt.text === "string" ? stmt.text : "";
        const normalized = stmtText.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
        
        // Check for exact or close match
        let matched = false;
        let bestMatch = null;
        let bestIndex = null;
        let bestDraftPosition = null;
        let bestScore = 0;
        
        for (const [normCandidate, candidateData] of candidateMap.entries()) {
          // Allow 80% token overlap for minor rewording
          const stmtTokens = normalized.split(/\s+/).filter(t => t.length > 2);
          const candidateTokens = normCandidate.split(/\s+/).filter(t => t.length > 2);
          const overlap = stmtTokens.filter(t => candidateTokens.includes(t)).length;
          const overlapRatio = candidateTokens.length > 0 ? overlap / candidateTokens.length : 0;
          
          let score = 0;
          if (normalized === normCandidate) {
            score = 1.0; // Exact match
          } else if (overlapRatio >= 0.8) {
            score = overlapRatio; // High overlap
          } else if (normalized.includes(normCandidate) || normCandidate.includes(normalized)) {
            score = 0.7; // Substring match
          }
          
          if (score > bestScore) {
            bestScore = score;
            bestMatch = candidateData.candidate;
            bestIndex = candidateData.index;
            bestDraftPosition = candidateData.draftPosition != null ? candidateData.draftPosition : candidateData.index;
            matched = true;
          }
        }
        
        if (matched && bestMatch) {
          // Use original candidate text for stability and assign candidateIndex and draftPosition
          // A3.6.6: Preserve draftPosition from candidateData
          matchedStatements.push({
            ...stmt,
            text: bestMatch, // Use deterministic candidate text
            __candidateIndex: bestIndex, // A3.5.26 Fix B: Preserve draft order
            __draftPosition: bestDraftPosition, // A3.6.6: Preserve draftPosition
          });
        }
      }
      
      statements = matchedStatements;
      
      // A3.5.27: Sort statements by candidateIndex to preserve draft order
      // A3.6.6: Final ordering sort key: draftPosition ASC (tie-breaker: candidateIndex ASC)
      statements.sort((a, b) => {
        const draftPosA = a.__draftPosition != null ? a.__draftPosition : (a.__candidateIndex != null ? a.__candidateIndex : Number.MAX_SAFE_INTEGER);
        const draftPosB = b.__draftPosition != null ? b.__draftPosition : (b.__candidateIndex != null ? b.__candidateIndex : Number.MAX_SAFE_INTEGER);
        
        if (draftPosA !== draftPosB) {
          return draftPosA - draftPosB;
        }
        
        // Tie-breaker: candidateIndex ASC
        const idxA = a.__candidateIndex != null ? a.__candidateIndex : Number.MAX_SAFE_INTEGER;
        const idxB = b.__candidateIndex != null ? b.__candidateIndex : Number.MAX_SAFE_INTEGER;
        return idxA - idxB;
      });
      
      // A3.6.6: Log first 5 draftPositions + candidateIndex
      const firstFiveOrdering = statements.slice(0, 5).map(s => ({
        draftPos: s.__draftPosition != null ? s.__draftPosition : (s.__candidateIndex != null ? s.__candidateIndex : "null"),
        candidateIdx: s.__candidateIndex != null ? s.__candidateIndex : "null"
      }));
      diag(runId, reqSig, `[ORDERING] sorted ${statements.length} statements by draftPosition, first5=${JSON.stringify(firstFiveOrdering)}`);
    }
    
    // Graceful fallback if model output is invalid or empty
    if (statements.length === 0) {
      // A3.5.21 Fix: Pass runId and reqSig for proper context
      statements = fallbackExtractAtomicStatements(draftText, hasReturned, runId, reqSig);
      extractionQuality = "degraded";
      diag(runId, reqSig, `A3.5.13: Using fallback extraction, produced ${statements.length} statements`);
    }
    
    // A) Draft-only filter: enforce statements must appear in draft text (hard gate)
    // Note: This should be redundant now since candidates come from draft, but keep for safety
    // A3.5.21 Step 3: Pass hasReturned flag to guard against execution after return
    diag(runId, reqSig, `[PIPELINE] phase=filterDraftOnly`);
    statements = filterDraftOnlyStatements(statements, draftText, runId, reqSig, hasReturned);
    
    
    // B) Citation resolution validation: drop unresolvable citations
    statements = resolveCitations(statements, unifiedReferences);
    
    // C) Dual-axis verification gate: force Low if no resolvable citations
    // Runs BEFORE calibration to prevent score inflation of unverifiable statements
    statements = applyDualAxisVerification(statements, unifiedReferences);
    
    // D) Apply non-anchor calibration: allow Medium for uncited synthesis unless uncertain
    // Only processes statements that passed dual-axis (have citations or doc-descriptive with memo support)
    statements = applyNonAnchorCalibration(statements);
    
    // D.5) Apply paraphrase tolerance: raise scores when substance is supported but exact phrases don't match
    statements = applyParaphraseTolerance(statements, unifiedReferences);
    
    // E) Apply anchor-fact gating: force Low if anchor facts lack citations
    // A3.5.13 Addendum: Pass uploadedSources to respect anchor absence precedence
    statements = applyAnchorGating(statements, uploadedSources);
    
    // F) Final post-condition clamp: ensure no High/Medium with missing citations
    statements = applyFinalPostCheck(statements, unifiedReferences);
    
    // G) Normalize response structure: ensure citations and evidence are at top-level
    // This enforces the response contract that the Review UI expects
    statements = normalizeResponseStructure(statements, unifiedReferences);
    
    // A3.5.15 Fix 3: Deduplicate statements by exact text match
    // A3.6.6: When deduping, keep the earliest draftPosition
    const statementTextMap = new Map(); // Map text -> statement with earliest draftPosition
    const deduplicatedStatements = [];
    let dedupeRemoved = 0;
    
    for (const stmt of statements) {
      if (!stmt || typeof stmt !== "object") {
        deduplicatedStatements.push(stmt);
        continue;
      }
      
      const stmtText = typeof stmt.text === "string" ? stmt.text.trim() : "";
      if (!stmtText) {
        deduplicatedStatements.push(stmt);
        continue;
      }
      
      // A3.6.6: Use exact text match for deduplication, keep earliest draftPosition
      const existingStmt = statementTextMap.get(stmtText);
      const stmtDraftPos = stmt.__draftPosition != null ? stmt.__draftPosition : (stmt.__candidateIndex != null ? stmt.__candidateIndex : Number.MAX_SAFE_INTEGER);
      
      if (!existingStmt) {
        statementTextMap.set(stmtText, stmt);
        deduplicatedStatements.push(stmt);
      } else {
        const existingDraftPos = existingStmt.__draftPosition != null ? existingStmt.__draftPosition : (existingStmt.__candidateIndex != null ? existingStmt.__candidateIndex : Number.MAX_SAFE_INTEGER);
        // Keep the one with earlier draftPosition
        if (stmtDraftPos < existingDraftPos) {
          // Replace with earlier one
          const idx = deduplicatedStatements.indexOf(existingStmt);
          if (idx >= 0) {
            deduplicatedStatements[idx] = stmt;
            statementTextMap.set(stmtText, stmt);
          }
        }
        dedupeRemoved++;
      }
    }
    
    if (dedupeRemoved > 0) {
      diag(runId, reqSig, `[DEDUP] input=${statements.length} output=${deduplicatedStatements.length} removed=${dedupeRemoved}`);
    }
    
    statements = deduplicatedStatements;
    
    // H) Sanitize reasons: remove misleading "no sources cited" messages when citations/evidence exist
    // Also improve language when web search is enabled (A3.5.8)
    const webSearchEnabled = publicSearch === true;
    const webSearchUsed = Boolean(search?.ok && (search?.results || []).length);
    statements = sanitizeReasons(statements, webSearchEnabled, webSearchUsed);
    
    // I) Enforce reason specificity: require explicit enumeration for partial support and contradiction cases (A3.5.9)
    statements = enforceReasonSpecificity(statements);
    
    // I.5) A3.5.28: Enforce facet-scoped bullets for multi-claim statements
    // A3.5.30: MOVED to final cleanup block (after all injections) to avoid missing later-injected reasons
    // statements = enforceFacetScopedBullets(statements);
    
    // I.6) A3.5.29: Normalize assessment reasons - dedupe, ban generic bullets, enforce facet diversity
    // A3.5.30: MOVED to final cleanup block (after all injections) to avoid missing later-injected reasons
    // let firstStmtNormStats = null;
    // statements = statements.map((stmt, idx) => {
    //   if (!stmt || typeof stmt !== "object") return stmt;
    //   
    //   const assessment = stmt.assessment || {};
    //   const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    //   const text = typeof stmt.text === "string" ? stmt.text : "";
    //   
    //   const { reasons: normalizedReasons, stats } = normalizeAssessmentReasons(text, reasons);
    //   
    //   // Log normalization stats for first statement only
    //   if (idx === 0) {
    //     firstStmtNormStats = stats;
    //   }
    //   
    //   return {
    //     ...stmt,
    //     assessment: {
    //       ...assessment,
    //       reasons: normalizedReasons,
    //     },
    //   };
    // });
    // 
    // // Log normalization stats for first statement
    // if (firstStmtNormStats) {
    //   diag(runId, reqSig, `[REASONS_NORM] idx=0 before=${firstStmtNormStats.before} after=${firstStmtNormStats.after} deduped=${firstStmtNormStats.deduped} autoFacet=${firstStmtNormStats.autoFacet} autoSnippet=${firstStmtNormStats.autoSnippet} addedDeterministic=${firstStmtNormStats.addedDeterministic}`);
    // }
    
    // J) Fix anchor-fact reasons: detect and correct false "not mentioned" claims with semantic matching (A3.5.10)
    statements = fixAnchorFactReasons(statements, unifiedReferences);
    
    // K) Enforce corpus-level verification before absence claims (A3.5.11)
    // A3.5.13b: Pass unifiedReferences to inject citations and build evidence when corpusSearch finds support
    // MUST perform corpus search before allowing "not mentioned" / "not supported" claims
    // A3.6.3: Harden error handling with proper logging and meta flag
    diag(runId, reqSig, `[PIPELINE] phase=enforceCorpusVerification`);
    let verificationOk = true;
    try {
      statements = enforceCorpusVerificationBeforeAbsence(statements, uploadedSources, unifiedReferences, runId, reqSig);
    } catch (corpusErr) {
      verificationOk = false;
      const errorMessage = corpusErr?.message || String(corpusErr) || "Unknown error";
      const errorStack = corpusErr?.stack || "No stack trace";
      diag(runId, reqSig, `[ERROR][CORPUS_VERIFY] rid=${runId || 'unknown'} message=${errorMessage} stack=${errorStack.substring(0, 500)}`);
      // Continue with statements as-is rather than losing them
    }
    
    // A3.6.3: Initialize meta object for verification status (will be merged into finalResponseObject.meta)
    let meta = {};
    if (!meta.verification) meta.verification = {};
    meta.verification.ok = verificationOk;
    if (!verificationOk) {
      meta.verification.phase = "enforceCorpusVerificationBeforeAbsence";
    }
    
    // A3.5.14b Patch 2 & 3: Anchor Enforcement + Ambiguity Routing (LAST MUTATION STEP)
    // Must run AFTER all other processing to ensure citations/evidence are not overwritten
    diag(runId, reqSig, `[PIPELINE] phase=enforceAnchorCitations`);
    try {
      statements = enforceAnchorCitationsAndAmbiguity(statements, uploadedSources, unifiedReferences);
    } catch (anchorErr) {
      diag(runId, reqSig, `[ERROR] enforceAnchorCitationsAndAmbiguity failed:`, anchorErr);
      // Continue with statements as-is
    }
    
    // A3.5.27: Citation backfill for supported-but-non-anchored clauses
    // Run AFTER enforceAnchorCitationsAndAmbiguity, BEFORE FINAL_COUNTS
    diag(runId, reqSig, `[PIPELINE] phase=citationBackfill`);
    try {
      const backfillResult = backfillCitations(statements, uploadedSources, unifiedReferences, runId, reqSig);
      statements = backfillResult.statements;
    } catch (backfillErr) {
      diag(runId, reqSig, `[ERROR] backfillCitations failed:`, backfillErr);
      // Continue with statements as-is
    }
    
    // FINAL REASONS CLEANUP (A3.5.30):
    // Must run AFTER all injections (anchor enforcement, corpus verification, backfill)
    statements = enforceFacetScopedBullets(statements);

    // A3.6.7: Generate claims BEFORE reasons-mode decision and BEFORE FINAL_COUNTS
    // This ensures assessment.claims is available when deciding on reasons mode
    diag(runId, reqSig, `[PIPELINE] phase=generateClaims`);
    const uploadedDocs = Array.isArray(uploadedSources) && uploadedSources.length > 0
      ? uploadedSources.map((src) => ({
          id: src.id || src.name || "unknown",
          title: src.title || src.name || "Untitled",
          text: src.text || "",
        }))
      : [];
    
    // A3.6.9: Track claims failures for meta
    let claimsFailures = 0;
    
    if (uploadedDocs.length > 0) {
      statements = statements.map((stmt, idx) => {
        if (!stmt || typeof stmt !== "object") return stmt;
        
        const text = typeof stmt.text === "string" ? stmt.text : "";
        const assessment = stmt.assessment || {};
        
        // A3.6.9: Per-statement guard around claim generation - never trigger global fallback
        let claims = [];
        let claimsError = false;
        let uniqueAnchors = new Set();
        
        try {
          // Generate claims (with aggregation, capping, and claim-aware scoring)
          claims = generateClaimsForStatement(text, uploadedDocs, assessment, runId, reqSig, idx);
          
          // Extract unique anchors for logging
          uniqueAnchors = new Set(claims.map(c => {
            const anchor = extractAnchor(c.claimText);
            return anchor || "no_anchor";
          }));
        } catch (claimsErr) {
          // A3.6.10: Log structured error but continue pipeline
          const errorMessage = claimsErr?.message || String(claimsErr) || "Unknown error";
          const errorStack = claimsErr?.stack || "No stack trace";
          diag(runId, reqSig, `[ERROR][CLAIMS] rid=${runId || 'unknown'} idx=${idx} message=${errorMessage} stack=${errorStack.substring(0, 500)}`);
          
          // A3.6.10: Optional error site logging to pinpoint failing block
          let errorSite = "unknown";
          if (errorMessage.includes("match is not defined")) {
            errorSite = "pct_pattern_match";
          } else if (errorMessage.includes("Cannot read property") || errorMessage.includes("Cannot read")) {
            errorSite = "property_access";
          } else if (errorMessage.includes("is not a function")) {
            errorSite = "function_call";
          }
          if (errorSite !== "unknown") {
            diag(runId, reqSig, `[CLAIMS_ERR_SITE] idx=${idx} site=${errorSite}`);
          }
          
          claims = [];
          claimsError = true;
          claimsFailures++;
        }
        
        // A3.6.9: Log claims phase status (idx<2)
        if (idx < 2 && runId && reqSig) {
          diag(runId, reqSig, `[CLAIMS_PHASE] idx=${idx} ok=${!claimsError} claimsCount=${claims.length} anchors=${JSON.stringify(Array.from(uniqueAnchors).slice(0, 5))}`);
        }
        
        // A3.6.3: Compute statement reliability from claims (deterministic)
        const existingScore = typeof assessment.reliabilityScore === "number" 
          ? assessment.reliabilityScore 
          : 30;
        const existingLabel = typeof assessment.reliabilityLabel === "string"
          ? assessment.reliabilityLabel
          : existingScore >= 80 ? "High" : existingScore >= 60 ? "Medium" : "Low";
        
        const computedReliability = computeStatementReliabilityFromClaims(claims, existingScore, existingLabel);
        
        // A3.6.5: Count claim reliabilities for logging
        let hiCount = 0, medCount = 0, lowCount = 0;
        for (const claim of claims) {
          const reliability = claim?.reliability;
          if (reliability === "High") hiCount++;
          else if (reliability === "Medium") medCount++;
          else if (reliability === "Low") lowCount++;
        }
        const totalCount = hiCount + medCount + lowCount;
        
        // A3.6.9: Generate claim-linked reasons immediately if claims exist AND no error
        let claimLinkedReasons = [];
        if (claims.length > 0 && !claimsError) {
          claimLinkedReasons = generateClaimLinkedReasons(claims);
          
          // A3.6.7: Log claim-derived statement scoring (idx<2, only when mode=claims)
          if (idx < 2 && runId && reqSig) {
            const branch = computedReliability._branch || "UNKNOWN";
            diag(runId, reqSig, `[STMT_FROM_CLAIMS] idx=${idx} hi=${hiCount} med=${medCount} low=${lowCount} total=${totalCount} score=${computedReliability.reliabilityScore} label=${computedReliability.reliabilityLabel} branch=${branch}`);
          }
        }
        
        // A3.6.9: Add claims to assessment and update reliability
        // If claimsError, force reasons mode to legacy (claims will be empty array)
        return {
          ...stmt,
          assessment: {
            ...assessment,
            claims,
            reliabilityScore: computedReliability.reliabilityScore,
            reliabilityLabel: computedReliability.reliabilityLabel,
            // A3.6.9: Set claim-linked reasons if available and no error, otherwise keep existing reasons
            reasons: (claimLinkedReasons.length > 0 && !claimsError) ? claimLinkedReasons : assessment.reasons,
            reasonsSource: (claimLinkedReasons.length > 0 && !claimsError) ? "claims" : "legacy",
            _claimsError: claimsError, // Internal flag for later phases
          },
        };
      });
    }
    
    // A3.6.9: Store claims failures in meta
    if (claimsFailures > 0 && !meta.claimsFailures) {
      meta.claimsFailures = claimsFailures;
    }

    let firstStmtNormStats = null;
    statements = statements.map((stmt, idx) => {
      if (!stmt || typeof stmt !== "object") return stmt;

      const assessment = stmt.assessment || {};
      const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
      const text = typeof stmt.text === "string" ? stmt.text : "";
      const claims = Array.isArray(assessment.claims) ? assessment.claims : [];
      
      // A3.6.9: If claims exist AND no claimsError, ONLY use claim-linked reasons. Do not generate old reasons at all.
      const claimsError = assessment._claimsError || false;
      if (claims.length > 0 && !claimsError) {
        // Skip normalization entirely - claim-linked reasons already set in claims generation phase
        const reasonsSource = "claims";
        
        // A3.6.9: Log reasons mode (idx<2)
        if (idx < 2 && runId && reqSig) {
          diag(runId, reqSig, `[REASONS_MODE] idx=${idx} mode=claims claimsCount=${claims.length}`);
        }
        
        // A3.6.9: Return as-is - claim-linked reasons already set in claims generation phase
        // DO NOT call normalizeAssessmentReasons() - skip legacy reason generation entirely
        return stmt;
      }
      
      // A3.6.9: If claimsError or no claims, use legacy reasons
      if (idx < 2 && runId && reqSig) {
        diag(runId, reqSig, `[REASONS_MODE] idx=${idx} mode=legacy claimsCount=${claims.length} claimsError=${claimsError}`);
      }
      
      // A3.5.31: Pass statement context into normalization
      // A3.6.5: Pass reasonsSource to prevent overwriting claim-linked reasons
      // A3.6.6: Legacy reasons only run when claims.length === 0
      const hasCitations = (assessment.citations?.length > 0) || (stmt.citations?.length > 0);
      const hasEvidence = (stmt.evidence?.length > 0) || (assessment.evidence?.length > 0);
      const facetsDetected = detectFacetsInStatement(text);
      const reasonsSource = assessment.reasonsSource || null;
      
      // Log reasons mode (idx<2)
      if (idx < 2 && runId && reqSig) {
        diag(runId, reqSig, `[REASONS_MODE] idx=${idx} mode=legacy claimsCount=0`);
      }
      
      const { reasons: normalizedReasons, stats } = normalizeAssessmentReasons(text, reasons, {
        hasCitations,
        hasEvidence,
        facetsDetected,
        reasonsSource,
      });

      if (idx === 0) firstStmtNormStats = stats;

      return {
        ...stmt,
        assessment: { ...assessment, reasons: normalizedReasons },
      };
    });

    if (firstStmtNormStats) {
      diag(runId, reqSig,
        `[REASONS_NORM_FINAL] idx=0 before=${firstStmtNormStats.before} after=${firstStmtNormStats.after} deduped=${firstStmtNormStats.deduped} autoFacet=${firstStmtNormStats.autoFacet} autoSnippet=${firstStmtNormStats.autoSnippet} addedDeterministic=${firstStmtNormStats.addedDeterministic} removedAnchorBoilerplate=${firstStmtNormStats.removedAnchorBoilerplate || 0} replacedWeakestForFacet=${firstStmtNormStats.replacedWeakestForFacet || 0} usedDeterministicSet=${firstStmtNormStats.usedDeterministicSet || false}`
      );
    }
    
    // A3.6.7: Claim-linked reasons are now generated earlier (in claims generation phase)
    // This redundant section is removed - claims and reasons are set before normalization
    
    // A3.5.31: Add observability log for idx=0 after final normalization
    if (statements.length > 0) {
      const firstStmt = statements[0];
      if (firstStmt && typeof firstStmt === "object") {
        const assessment = firstStmt.assessment || {};
        const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
        // Truncate each bullet to ~120 chars for readability
        const truncatedReasons = reasons.map(r => {
          if (typeof r !== "string") return String(r);
          return r.length > 120 ? r.substring(0, 117) + "..." : r;
        });
        diag(runId, reqSig, `[REASONS_FINAL_SAMPLE] idx=0 reasons=${JSON.stringify(truncatedReasons)}`);
      }
    }
    
    // A3.6.10: Universal bracket-tag stripping BEFORE FINAL_COUNTS
    // Apply stripReasonTags to every statement's reasons (legacy + claims mode)
    statements = statements.map((stmt) => {
      if (!stmt || typeof stmt !== "object") return stmt;
      const assessment = stmt.assessment || {};
      const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
      const cleanedReasons = stripReasonTags(reasons);
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: cleanedReasons,
        },
      };
    });
    
    // A3.6.9: Ensure top-level citations/evidence are mirrored before FINAL_COUNTS
    // For each statement: if statement.citations is missing/empty and assessment.citations exists → copy it
    // If statement.evidence is missing/empty and assessment.citations exists → derive evidence from citations + references map
    statements = statements.map((stmt) => {
      if (!stmt || typeof stmt !== "object") return stmt;
      const assessment = stmt.assessment || {};
      const assessmentCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
      const statementCitations = Array.isArray(stmt.citations) ? stmt.citations : [];
      
      // Mirror assessment.citations to statement.citations if missing
      const citations = statementCitations.length > 0 ? statementCitations : assessmentCitations;
      
      // Derive evidence from citations if missing
      let evidence = Array.isArray(stmt.evidence) ? stmt.evidence : [];
      if (evidence.length === 0 && citations.length > 0 && Array.isArray(unifiedReferences)) {
        const referencesById = new Map();
        unifiedReferences.forEach((ref) => {
          const id = ref?.id;
          if (id != null) {
            referencesById.set(String(id), ref);
          }
        });
        
        evidence = citations.map((citationId) => {
          const citationKey = citationId != null ? String(citationId) : null;
          if (citationKey && referencesById.has(citationKey)) {
            const ref = referencesById.get(citationKey);
            const refType = ref?.type || (ref?.url ? "web" : "uploaded");
            return {
              title: ref?.title || "Untitled source",
              url: ref?.url || null,
              sourceType: refType,
            };
          }
          return {
            title: "Unresolved citation",
            url: null,
            sourceType: "unresolved",
          };
        });
      }
      
      return {
        ...stmt,
        citations,
        evidence,
      };
    });
    
    // A3.5.18 Fix 2: Hard invariant at return time - ensure citations/evidence are preserved
    let totalAssessmentCites = 0;
    let totalTopCites = 0;
    let totalEvidence = 0;
    let hasCorpusSearchFound = false;
    let hasAnchorEnforcementInjected = false;
    
    // A3.5.29: Log facet detection for first statement (diagnostic)
    if (statements.length > 0) {
      const firstStmt = statements[0];
      if (firstStmt && typeof firstStmt === "object") {
        const text = typeof firstStmt.text === "string" ? firstStmt.text : "";
        const assessment = firstStmt.assessment || {};
        const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
        const facetsDetected = detectFacetsInStatement(text);
        const bulletsCount = reasons.length;
        // A3.6.2 PATCH v2: Disable facet detection
        const facetsDetectedEmpty = []; // Always empty in facet-free mode
        diag(runId, reqSig, `[FACET_REASONS] idx=0 facetsDetected=${JSON.stringify(facetsDetectedEmpty)} bullets=${bulletsCount}`);
      }
    }
    
    for (const stmt of statements) {
      if (!stmt || typeof stmt !== "object") continue;
      
      const assessment = stmt.assessment || {};
      const assessCites = Array.isArray(assessment.citations) ? assessment.citations.length : 0;
      const topCites = Array.isArray(stmt.citations) ? stmt.citations.length : 0;
      const evidence = Array.isArray(stmt.evidence) ? stmt.evidence.length : 0;
      
      totalAssessmentCites += assessCites;
      totalTopCites += topCites;
      totalEvidence += evidence;
      
      // Check if this statement had corpusSearch find or anchor enforcement
      const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
      const reasonsStr = reasons.join(" ").toLowerCase();
      if (reasonsStr.includes("memo contains related support") || reasonsStr.includes("citation added via invariant")) {
        hasAnchorEnforcementInjected = true;
      }
      if (reasonsStr.includes("corpus search") || reasonsStr.includes("found in memo")) {
        hasCorpusSearchFound = true;
      }
    }
    
    diag(runId, reqSig, `[FINAL_COUNTS] statements=${statements.length} assessCites=${totalAssessmentCites} topCites=${totalTopCites} evidence=${totalEvidence}`);
    
    // A3.5.21 Diagnostic: Mark that FINAL_COUNTS has been reached for this RID
    if (runId) {
      if (!runStateByRid[runId]) {
        runStateByRid[runId] = {};
      }
      runStateByRid[runId].finalCountsReached = true;
    }
    
    // A3.5.18 Fix 2: Warn if citations/evidence were lost
    if ((hasCorpusSearchFound || hasAnchorEnforcementInjected) && totalAssessmentCites === 0 && totalTopCites === 0 && totalEvidence === 0) {
      diag(runId, reqSig, `[FINAL_COUNTS][ERROR] citations lost after enforcement`);
    }
    
    // HOTFIX: Build finalResponseObject IMMEDIATELY after FINAL_COUNTS to ensure it's always set
    // This must happen before any code that might throw, so it's available in error paths
    try {
      // Compute extractionQuality first (needed for meta)
      let extractionQualityValue = extractionQuality || "ok";
      try {
        const fragmentDropped = fragFilterResult ? fragFilterResult.dropped : 0;
        const fragmentMerged = fragFilterResult ? fragFilterResult.merged : 0;
        extractionQualityValue = computeExtractionQuality(statements, extractionCandidates, rejectedCount, fallbackCount, incompleteNumericFragmentCount, recombinedCount, fragmentDropped, fragmentMerged);
      } catch (e) {
        diag(runId, reqSig, `[ERROR] failed computing extractionQuality after FINAL_COUNTS: ${e?.message || String(e)}`);
        extractionQualityValue = extractionQualityValue || "ok";
      }
      
      // Build finalResponseObject with canonical variables
      finalResponseObject = {
        ok: true,
        statements, // Use the exact statements array that was counted
        references: unifiedReferences || [],
        meta: {
          webSearch: { enabled: true, used: Boolean(search?.ok && (search?.results || []).length) },
          extractionQuality: extractionQualityValue,
          uploadedSourcesCount: uploadedReferences?.length || 0,
          webSourcesCount: webReferencesWithIds?.length || 0,
          ...(meta?.verification ? { verification: meta.verification } : {}),
          ...(meta?.claimsFailures ? { claimsFailures: meta.claimsFailures } : {}),
        },
      };
    } catch (e) {
      diag(runId, reqSig, `[ERROR] failed building finalResponseObject immediately after FINAL_COUNTS: ${e?.message || String(e)}`);
      // Fallback: build minimal finalResponseObject
      finalResponseObject = {
        ok: true,
        statements: statements || [],
        references: unifiedReferences || [],
        meta: {
          webSearch: { enabled: true, used: false },
          extractionQuality: "error",
          uploadedSourcesCount: uploadedReferences?.length || 0,
          webSourcesCount: webReferencesWithIds?.length || 0,
          ...(meta?.verification ? { verification: meta.verification } : {}),
          ...(meta?.claimsFailures ? { claimsFailures: meta.claimsFailures } : {}),
        },
      };
    }
    
    // A3.6.7: Claims generation moved earlier (before reasons normalization and FINAL_COUNTS)
    // Bracket stripping also moved earlier (before FINAL_COUNTS)
    
    // NOTE: finalResponseObject is now built immediately after FINAL_COUNTS (see above)
    // After this point, finalResponseObject must never be null.
    
    // A3.5.19 Fix 3: Log return snapshot from the SAME object being returned
    const firstStmt = finalResponseObject.statements[0];
    const firstAssessCites = firstStmt?.assessment?.citations?.length || 0;
    const firstTopCites = firstStmt?.citations?.length || 0;
    const firstEvidence = firstStmt?.evidence?.length || 0;
    diag(runId, reqSig, `[RETURN_SNAPSHOT] statements=${finalResponseObject.statements.length} firstAssessCites=${firstAssessCites} firstTopCites=${firstTopCites} firstEvidence=${firstEvidence}`);
    
    // DIAGNOSTIC: Log final summary
    diag(runId, reqSig, `[PIPELINE] phase=complete`);
    diag(runId, reqSig, `Review complete: ${statements.length} statements, ${unifiedReferences.length} references`);
    
    // A3.5.19 Fix 1 & 2: Return immediately after FINAL_COUNTS - no code after this point should run
    // A3.5.20 Fix 2: Request end sentinel
    // A3.5.21 Step 2: Set hasReturned flag before return to prevent any further Review pipeline execution
    hasReturned = true;
    diag(runId, reqSig, `END returningNow=true status=200`);
    // A3.5.21 Fix: Wrap END_DIAG and cleanup in try/catch to prevent logging crashes
    try {
      diag(runId, reqSig, `RETURN_PAYLOAD statements=${finalResponseObject?.statements?.length ?? -1} refs=${finalResponseObject?.references?.length ?? -1}`);
      diag(runId, reqSig, `END_DIAG path=success status=200 returningNow=true`);
      if (runId && runStateByRid[runId]) {
        delete runStateByRid[runId];
      }
    } catch (logErr) {
      // Best-effort logging; don't crash on cleanup
    }
    return res.status(200).json(finalResponseObject);
  } catch (err) {
      // Graceful degradation: even on error, return valid JSON with fallback statements
    // A3.5.22 Fix: Unconditional hard stop after FINAL_COUNTS - absolutely no fallback execution
    if (runId && runStateByRid[runId]?.finalCountsReached) {
      hasReturned = true;
      try {
        diag(runId, reqSig, `SKIP_FALLBACK_AFTER_FINAL_COUNTS finalResponseObjectPresent=${Boolean(finalResponseObject)}`);
        if (!finalResponseObject) {
          diag(runId, reqSig, `[ERROR] finalResponseObject missing after FINAL_COUNTS — building safe fallback`);
        }
      } catch (logErr) {
        // Best-effort logging
      }
      try {
        diag(runId, reqSig, `END_DIAG path=success_after_final_hardstop status=200 returningNow=true`);
        if (runId && runStateByRid[runId]) {
          delete runStateByRid[runId];
        }
      } catch (logErr) {
        // Best-effort logging
      }
      // HOTFIX: finalResponseObject should always be set after FINAL_COUNTS
      // If it's missing, build a safe fallback that doesn't reference undefined variables
      if (finalResponseObject) {
        try {
          diag(runId, reqSig, `RETURN_PAYLOAD statements=${finalResponseObject?.statements?.length ?? -1} refs=${finalResponseObject?.references?.length ?? -1}`);
        } catch (logErr) {
          // Best-effort logging
        }
        return res.status(200).json(finalResponseObject);
      } else {
        // HOTFIX: Build safe fallback without referencing undefined 'statements'
        // This should never happen if finalResponseObject was built correctly after FINAL_COUNTS
        diag(runId, reqSig, `[ERROR] finalResponseObject missing after FINAL_COUNTS — building safe fallback`);
        const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
        const sources = Array.isArray(body.sources) ? body.sources : [];
        const minimalReferences = sources.map((s, idx) => ({
          id: idx + 1,
          title: s?.name || s?.title || "Untitled source",
          url: s?.url || null,
          type: "uploaded",
        }));
        const fallbackPayload = {
          ok: true,
          statements: [], // Safe fallback: empty array since 'statements' is not in scope
          references: minimalReferences,
          meta: {
            webSearch: { enabled: true, used: false },
            extractionQuality: "error",
            uploadedSourcesCount: minimalReferences.length,
            webSourcesCount: 0,
          },
        };
        try {
          diag(runId, reqSig, `RETURN_PAYLOAD statements=${fallbackPayload.statements?.length ?? -1} refs=${fallbackPayload.references?.length ?? -1}`);
        } catch (logErr) {
          // Best-effort logging
        }
        return res.status(200).json(fallbackPayload);
      }
    }
    
    try {
      // A3.6.9: Check if statements already exist (after filterDraftOnly, enforceAnchorCitations, etc.)
      // If so, use them instead of re-extracting to preserve citations/evidence
      const hasExistingStatements = Array.isArray(statements) && statements.length > 0;
      const hasAnchorCites = hasExistingStatements && statements.some(s => {
        const assessment = s?.assessment || {};
        const citations = Array.isArray(assessment.citations) ? assessment.citations : [];
        return citations.length > 0;
      });
      
      // A3.6.9: Determine fallback stage and reason
      const fallbackStage = hasExistingStatements ? "after_processing" : "early";
      const fallbackReason = err?.message || "Unknown error";
      const afterAnchorCites = hasAnchorCites;
      const returningAssembled = hasExistingStatements;
      
      // A3.6.9: Log fallback type with explicit reason and stage
      diag(runId, reqSig, `[FALLBACK] stage=${fallbackStage} afterAnchorCites=${afterAnchorCites} returningAssembled=${returningAssembled} reason=${fallbackReason.substring(0, 200)}`);
      
      if (hasExistingStatements && returningAssembled) {
        // A3.6.9: Use existing statements - preserve citations/evidence already injected
        // Ensure citations/evidence are mirrored to top-level before returning
        const preservedStatements = normalizeResponseStructure(statements, unifiedReferences || []);
        
        // A3.6.9: Strip bracket tags from all reasons
        const finalStatements = preservedStatements.map((stmt) => {
          if (!stmt || typeof stmt !== "object") return stmt;
          const assessment = stmt.assessment || {};
          const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
          const cleanedReasons = reasons.map(reason => {
            if (typeof reason !== "string") return reason;
            // Remove ALL bracket tags: ^\[[^\]]+\]\s* (any bracket prefix)
            return reason.replace(/^\[[^\]]+\]\s*/g, "").trim();
          });
          return {
            ...stmt,
            assessment: {
              ...assessment,
              reasons: cleanedReasons,
            },
          };
        });
        
        // A3.5.21 Step 2: Set hasReturned flag before return in fallback path
        hasReturned = true;
        // A3.5.21 Fix: Wrap END_DIAG and cleanup in try/catch to prevent logging crashes
        try {
          diag(runId || "unknown", reqSig || "unknown", `END_DIAG path=fallback_assembled status=200 returningNow=true`);
          if (runId && runStateByRid[runId]) {
            delete runStateByRid[runId];
          }
        } catch (logErr) {
          // Best-effort logging
        }
        return res.status(200).json({
          ok: true,
          statements: finalStatements,
          references: unifiedReferences || [],
          meta: {
            webSearch: { enabled: true, used: Boolean(search?.ok && (search?.results || []).length) },
            extractionQuality: "degraded",
            uploadedSourcesCount: uploadedReferences?.length || 0,
            webSourcesCount: webReferencesWithIds?.length || 0,
            ...(meta?.verification ? { verification: meta.verification } : {}),
            ...(meta?.claimsFailures ? { claimsFailures: meta.claimsFailures } : {}),
          },
        });
      }
      
      // A3.6.9: Fallback to re-extraction only if no existing statements
      // A3.5.22 Fix: Log entry into fallback block for verification
      diag(runId, reqSig, `ENTER_FALLBACK finalCountsReached=${runId && runStateByRid[runId]?.finalCountsReached} hasReturned=${hasReturned}`);
      // A3.5.21 Fix: Pass runId and reqSig to fallback functions for proper context
      const fallbackDraftText = typeof req.body === "string" ? safeJsonParse(req.body)?.draftText || "" : req.body?.draftText || "";
      // A3.5.21 Step 3: Pass hasReturned flag to fallback extraction
      // A3.5.21 Fix: Pass runId and reqSig for proper context
      const fallbackStatements = fallbackExtractAtomicStatements(fallbackDraftText, hasReturned, runId, reqSig);
      
      // Build minimal unified references for fallback (from body sources if available)
      const fallbackBody = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
      const fallbackSources = Array.isArray(fallbackBody.sources) ? fallbackBody.sources : [];
      const fallbackUploadedReferences = fallbackSources.map((s, idx) => ({
        id: idx + 1,
        title: s?.name || s?.title || "Untitled source",
        url: s?.url || null,
        type: "uploaded",
      }));
      
      // Apply same pipeline as main path: draft filter → resolve → dual-axis → calibration → anchor → post-check → normalize
      // A3.5.21 Step 2: Fallback path must also return immediately after processing - no Review code after return
      // A3.5.21 Step 3: Pass hasReturned flag to guard against execution after return
      // A3.5.21 Fix: Pass runId and reqSig for proper context and guard behavior
      const filteredFallbackStatements = filterDraftOnlyStatements(fallbackStatements, fallbackDraftText, runId, reqSig, hasReturned);
      const resolvedFallbackStatements = resolveCitations(filteredFallbackStatements, fallbackUploadedReferences);
      const verifiedFallbackStatements = applyDualAxisVerification(resolvedFallbackStatements, fallbackUploadedReferences);
      const calibratedFallbackStatements = applyNonAnchorCalibration(verifiedFallbackStatements);
      const toleranceAdjustedFallbackStatements = applyParaphraseTolerance(calibratedFallbackStatements, fallbackUploadedReferences);
      // A3.5.11: Enforce corpus-level verification before absence claims in fallback path
      const fallbackUploadedSources = fallbackSources.map((s) => ({
        id: s?.id || null,
        name: s?.name || s?.title || "Untitled source",
        text: s?.text || "",
        kind: s?.kind || s?.sourceType || "file",
        url: s?.url || null,
      }));
      const gatedFallbackStatements = applyAnchorGating(toleranceAdjustedFallbackStatements, fallbackUploadedSources);
      const postCheckedFallbackStatements = applyFinalPostCheck(gatedFallbackStatements, fallbackUploadedReferences);
      const normalizedFallbackStatements = normalizeResponseStructure(postCheckedFallbackStatements, fallbackUploadedReferences);
      // Web search not available in fallback path
      const sanitizedFallbackStatements = sanitizeReasons(normalizedFallbackStatements, false, false);
      const specificityEnforcedFallbackStatements = enforceReasonSpecificity(sanitizedFallbackStatements);
      const anchorFixedFallbackStatements = fixAnchorFactReasons(specificityEnforcedFallbackStatements, fallbackUploadedReferences);
      const finalFallbackStatements = enforceCorpusVerificationBeforeAbsence(anchorFixedFallbackStatements, fallbackUploadedSources, fallbackUploadedReferences);
      
      // A3.6.9: Strip bracket tags from all reasons in fallback path
      const cleanedFallbackStatements = finalFallbackStatements.map((stmt) => {
        if (!stmt || typeof stmt !== "object") return stmt;
        const assessment = stmt.assessment || {};
        const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
        const cleanedReasons = reasons.map(reason => {
          if (typeof reason !== "string") return reason;
          // Remove ALL bracket tags: ^\[[^\]]+\]\s* (any bracket prefix)
          return reason.replace(/^\[[^\]]+\]\s*/g, "").trim();
        });
        return {
          ...stmt,
          assessment: {
            ...assessment,
            reasons: cleanedReasons,
          },
        };
      });

      // A3.5.21 Step 2: Set hasReturned flag before return in fallback path
      hasReturned = true;
      // A3.5.21 Fix: Wrap END_DIAG and cleanup in try/catch to prevent logging crashes
      try {
        diag(runId || "unknown", reqSig || "unknown", `END_DIAG path=fallback status=200 returningNow=true`);
        if (runId && runStateByRid[runId]) {
          delete runStateByRid[runId];
        }
      } catch (logErr) {
        // Best-effort logging
      }
      return res.status(200).json({
        ok: true,
        statements: cleanedFallbackStatements,
        references: fallbackUploadedReferences,
        meta: {
          webSearch: { enabled: true, used: false },
          extractionQuality: "degraded",
          uploadedSourcesCount: fallbackUploadedReferences.length,
          webSourcesCount: 0,
        },
      });
    } catch (fallbackErr) {
      // Last resort: return empty but valid response
      // A3.5.21 Step 2: Set hasReturned flag before return in fallback error path
      hasReturned = true;
      // A3.5.21 Fix: Wrap END_DIAG and cleanup in try/catch to prevent logging crashes
      try {
        diag(runId || "unknown", reqSig || "unknown", `END_DIAG path=fallback_error status=200 returningNow=true`);
        if (runId && runStateByRid[runId]) {
          delete runStateByRid[runId];
        }
      } catch (logErr) {
        // Best-effort logging
      }
      return res.status(200).json({
        ok: true,
        statements: [],
        references: [],
        meta: {
          webSearch: { enabled: true, used: false },
          extractionQuality: "degraded",
          uploadedSourcesCount: 0,
          webSourcesCount: 0,
        },
      });
    }
  }
  
  // A3.5.21 Fix: Catch-all to prevent silent fallthrough (should never reach here)
  if (!hasReturned) {
    hasReturned = true;
    try {
      diag(runId || "unknown", reqSig || "unknown", `END_DIAG path=fallthrough_error status=500 returningNow=true`);
      if (runId && runStateByRid[runId]) {
        delete runStateByRid[runId];
      }
    } catch (logErr) {
      // Best-effort logging
    }
    return res.status(500).json({ ok: false, error: "Internal server error: handler reached end without returning" });
  }
}
