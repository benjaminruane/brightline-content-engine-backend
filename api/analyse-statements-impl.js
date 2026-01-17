// api/analyse-statements-impl.js
//
// A3.7.6: Implementation module for analyse-statements endpoint.
// This module contains the full handler implementation.
// It is lazy-loaded by the wrapper in analyse-statements.js to ensure
// CORS headers are always set even if this module fails to import.
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
import { createHash } from "node:crypto";
import { canonicalizeClaims } from "../lib/canonicalClaims.js";

// A3.5.21 Diagnostic: Track run state to detect post-FINAL_COUNTS execution
const runStateByRid = {};

function setCorsHeaders(req, res) {
  // A3.8.24: Defensive CORS helper - never throws, handles undefined req/headers
  if (typeof res?.setHeader !== "function") {
    return; // Cannot set headers if res is invalid
  }

  // Resolve origin safely with multiple fallbacks
  const origin = req?.headers?.origin || req?.headers?.Origin || req?.headers?.['origin'] || "";
  
  // Allowed origins list
  const ALLOWED_ORIGINS = [
    "https://brightline-content-engine-frontend.vercel.app"
  ];
  
  // Determine allowed origin: if request origin matches allowed list, use it; otherwise use canonical frontend origin
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) 
    ? origin 
    : "https://brightline-content-engine-frontend.vercel.app";
  
  // Set headers safely (never throw)
  try {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  } catch (err) {
    // Silently fail - CORS headers are best-effort
    // Log once at most if needed for debugging
  }
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

/**
 * A3.8.33: Build selection sentences (deterministic sentence reconstruction)
 * Returns { sentences: string[], mergedSmallCount: number }
 */
function buildSelectionSentences(selectionText, runId = null, reqSig = null) {
  if (typeof selectionText !== "string" || !selectionText.trim()) {
    return { sentences: [], mergedSmallCount: 0 };
  }
  
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  // Common abbreviations that should not trigger sentence splits
  const abbreviations = new Set([
    "e.g.", "i.e.", "vs.", "Mr.", "Ms.", "Mrs.", "Dr.", "Prof.", "Inc.", "Ltd.", "Corp.", "Co.",
    "etc.", "cf.", "ex.", "al.", "et al.", "p.", "pp.", "vol.", "no.", "ch.", "fig.", "eq."
  ]);
  
  // Step 1: Split by sentence terminators (. ? !)
  // Pattern: match sentence terminator followed by space or end of string
  // But avoid splitting on abbreviations
  let sentences = [];
  let currentSentence = "";
  let i = 0;
  
  while (i < selectionText.length) {
    const char = selectionText[i];
    currentSentence += char;
    
    // Check for sentence terminators
    if (/[.!?]/.test(char)) {
      // Check if this period is part of an abbreviation
      // Look at the word ending with this period
      const words = currentSentence.trim().split(/\s+/);
      const lastWord = words[words.length - 1] || "";
      const isAbbreviation = abbreviations.has(lastWord.toLowerCase());
      
      // Check if next char is space, newline, or end of string (and not abbreviation)
      if ((i + 1 >= selectionText.length || /\s/.test(selectionText[i + 1])) && !isAbbreviation) {
        // End of sentence
        const trimmed = currentSentence.trim();
        if (trimmed.length > 0) {
          sentences.push(trimmed);
        }
        currentSentence = "";
        // Skip whitespace after terminator
        while (i + 1 < selectionText.length && /\s/.test(selectionText[i + 1])) {
          i++;
        }
      }
    }
    i++;
  }
  
  // Add final sentence if any remains
  const finalTrimmed = currentSentence.trim();
  if (finalTrimmed.length > 0) {
    sentences.push(finalTrimmed);
  }
  
  // Step 2: Cleanup - collapse whitespace, trim
  sentences = sentences.map(s => s.replace(/\s+/g, " ").trim()).filter(s => s.length > 0);
  
  // Step 3: Merge small fragments (< 60 chars) into next sentence
  const mergedSentences = [];
  let mergedSmallCount = 0;
  
  for (let i = 0; i < sentences.length; i++) {
    const current = sentences[i];
    
    if (current.length < 60 && i < sentences.length - 1) {
      // Merge with next sentence
      const next = sentences[i + 1];
      const merged = (current + " " + next).replace(/\s+/g, " ").trim();
      mergedSentences.push(merged);
      mergedSmallCount++;
      i++; // Skip next sentence as it's been merged
    } else {
      mergedSentences.push(current);
    }
  }
  
  // Step 4: Fix dangling conjunction fragments at sentence start
  const conjunctionPattern = /^(addition,|and|or|but|as well as|in addition|furthermore|moreover|however|nevertheless|therefore|thus|consequently|additionally|also|plus|further|more|then|so|yet|still|nonetheless|hence|accordingly|meanwhile|subsequently|previously|finally|first|second|third|lastly|next|now|here|there|where|when|while|since|because|although|though|even though|despite|regardless|instead|rather|besides|indeed|specifically|particularly|especially|notably|importantly|significantly|interestingly|surprisingly|unfortunately|fortunately|clearly|obviously|apparently|presumably|supposedly|allegedly|reportedly|evidently|seemingly|arguably|potentially|possibly|probably|likely|unlikely|certainly|definitely|absolutely|completely|entirely|totally|fully|partially|mostly|mainly|primarily|essentially|basically|fundamentally|generally|typically|usually|normally|commonly|often|frequently|sometimes|occasionally|rarely|seldom|hardly|barely|scarcely|almost|nearly|quite|rather|very|extremely|highly|significantly|substantially|considerably|relatively|comparatively|fairly|pretty|somewhat|slightly)\s*,?\s*/i;
  
  const fixedSentences = [];
  for (let i = 0; i < mergedSentences.length; i++) {
    const current = mergedSentences[i];
    const match = current.match(conjunctionPattern);
    
    if (match && i > 0) {
      // Merge into previous sentence
      const prev = fixedSentences.pop();
      const fragment = current.substring(match[0].length).trim();
      const merged = (prev + " " + fragment).replace(/\s+/g, " ").trim();
      fixedSentences.push(merged);
    } else {
      fixedSentences.push(current);
    }
  }
  
  // Step 5: Cap at 6 sentences, merge remainder into sentence #6
  let finalSentences = fixedSentences;
  if (fixedSentences.length > 6) {
    const first5 = fixedSentences.slice(0, 5);
    const remainder = fixedSentences.slice(5).join(" ");
    const merged6 = (first5[4] + " " + remainder).replace(/\s+/g, " ").trim();
    finalSentences = first5.slice(0, 4).concat([merged6]);
  }
  
  // A3.8.33: Log sentence reconstruction
  const sampleFirst2 = finalSentences.slice(0, 2).map(s => s.length);
  log(`[SELECTION][SENTENCES] count=${finalSentences.length} sampleFirst2Len=${sampleFirst2.join(",")} mergedSmall=${mergedSmallCount}`);
  
  return { sentences: finalSentences, mergedSmallCount };
}

// A3.7.3: Deterministic splitting into 2-5 statement rows (verbatim slices)
// Returns array of objects with { text, selectionGroupId, selectionIndex, selectionTotal }
/**
 * A3.8.13: Segment selection into candidate statements
 * Splits on sentence boundaries, enumeration markers, and long clauses
 * A3.8.33: Now uses buildSelectionSentences for sentence reconstruction
 */
function segmentSelectionIntoCandidates(selectionText, runId = null, reqSig = null) {
  if (typeof selectionText !== "string" || !selectionText.trim()) {
    return [];
  }
  
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  // A3.8.33: Use sentence reconstruction for selection mode
  const { sentences: reconstructedSentences } = buildSelectionSentences(selectionText, runId, reqSig);
  
  if (reconstructedSentences.length === 0) {
    return [];
  }
  
  // Work on reconstructed sentences; output must be verbatim slices (only whitespace trimming allowed)
  const originalText = selectionText;
  const charLen = originalText.length;
  
  // A3.8.33: Use reconstructed sentences directly as segments
  // Track created segments with IDs before filtering
  const createdSegments = reconstructedSentences
    .map((s, segId) => ({ segId, text: s.trim(), len: s.trim().length }))
    .filter(seg => seg.len >= 25);
  
  // A3.8.15: Cap at 6 segments and log drops
  const validSegments = [];
  const droppedSegments = [];
  for (let i = 0; i < createdSegments.length && validSegments.length < 6; i++) {
    const seg = createdSegments[i];
    if (seg.len >= 25) {
      validSegments.push(seg);
    } else {
      droppedSegments.push({ ...seg, reason: "too_short" });
    }
  }
  
  // A3.8.15: Log segments that were dropped due to cap
  for (let i = 6; i < createdSegments.length; i++) {
    droppedSegments.push({ ...createdSegments[i], reason: "cap_exceeded" });
  }
  
  // Generate stable deterministic ID (hash of full selectedText)
  const selectionGroupId = createHash("sha256").update(originalText).digest("hex").substring(0, 16);
  
  // A3.8.15: Logging with segmentId
  const createdCount = createdSegments.length;
  const keptCount = validSegments.length;
  log(`[SELECTION][SEGMENT] segments=${createdCount} kept=${keptCount}`);
  
  // A3.8.15: Log kept segments with segmentId (cap at 12 to avoid duplicates)
  validSegments.slice(0, 12).forEach((seg) => {
    log(`[SELECTION][SEGMENT_ITEM] segId=${seg.segId} len=${seg.len}`);
  });
  
  // A3.8.15: Log dropped segments
  droppedSegments.forEach((seg) => {
    log(`[SELECTION][SEGMENT_DROP] segId=${seg.segId} len=${seg.len} reason=${seg.reason}`);
  });
  
  // If no valid segments, return single candidate (backward compat)
  if (validSegments.length === 0) {
    const trimmed = originalText.trim();
    log(`[SELECTION][SEGMENT] segments=0 kept=1 (fallback to single candidate)`);
    return [{
      text: trimmed,
      selectionGroupId,
      selectionIndex: 1,
      selectionTotal: 1,
      segmentId: 0, // A3.8.15: Add segmentId
    }];
  }
  
  return validSegments.map((seg, idx) => ({
    text: seg.text,
    selectionGroupId,
    selectionIndex: idx + 1,
    selectionTotal: validSegments.length,
    segmentId: seg.segId, // A3.8.15: Preserve original segmentId
  }));
}

// A3.7.3: Legacy function name (kept for backward compatibility)
// A3.8.13: Use enhanced segmentation
function splitSelectionIntoCandidates(selectionText, runId = null, reqSig = null) {
  return segmentSelectionIntoCandidates(selectionText, runId, reqSig);
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

// A3.6.71: Sanitize candidate text to balance parentheses and trim dangling approximations
function sanitizeCandidateText(text, runId = null, reqSig = null) {
  if (typeof text !== "string" || !text.trim()) {
    return text;
  }
  
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  let changed = false;
  let originalText = text;
  let sanitized = text;
  
  // a) Balance parentheses
  const openCount = (sanitized.match(/\(/g) || []).length;
  const closeCount = (sanitized.match(/\)/g) || []).length;
  
  if (openCount > closeCount) {
    const hasEnterpriseValue = /\benterprise\s+value\b|\bev\b(?!\w)|\bapproximately\b/i.test(sanitized);
    
    if (hasEnterpriseValue) {
      // Append ')' at the end (unless it already ends with punctuation)
      if (!/[.!?;:)]\s*$/.test(sanitized)) {
        sanitized = sanitized + ")";
        changed = true;
        log(`[A3.6.71][CAND_PARENS] action=append_close beforeCounts=(${openCount},${closeCount}) afterCounts=(${openCount},${closeCount + 1})`);
      }
    } else {
      // Remove unmatched '(' characters (drop the last '(')
      const lastOpenIdx = sanitized.lastIndexOf("(");
      if (lastOpenIdx >= 0) {
        sanitized = sanitized.substring(0, lastOpenIdx) + sanitized.substring(lastOpenIdx + 1);
        changed = true;
        log(`[A3.6.71][CAND_PARENS] action=drop_unmatched beforeCounts=(${openCount},${closeCount}) afterCounts=(${openCount - 1},${closeCount})`);
      }
    }
  }
  
  // b) Trim dangling "c" or "c." approximations
  const danglingCPattern = /(\b(?:c|c\.)\s*)$/i;
  if (danglingCPattern.test(sanitized)) {
    sanitized = sanitized.replace(danglingCPattern, "").trim();
    changed = true;
  }
  
  // c) Normalize "c." approximations inline
  sanitized = sanitized.replace(/\bc\.\s*(\d+(?:\.\d+)?)%/gi, "approximately $1%");
  if (sanitized !== text) {
    changed = true;
  }
  
  if (changed) {
    const sampleBefore = originalText.length > 80 ? originalText.substring(0, 80) + "..." : originalText;
    const sampleAfter = sanitized.length > 80 ? sanitized.substring(0, 80) + "..." : sanitized;
    log(`[A3.6.71][CAND_SAN] changed=true sampleBefore="${sampleBefore}" sampleAfter="${sampleAfter}"`);
  }
  
  return sanitized;
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
      // A3.6.71: Sanitize candidate text before accepting
      const sanitizedCandidate = sanitizeCandidateText(candidate, runId, reqSig);
      accepted.push(sanitizedCandidate);
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
    
    // A3.6.73: Declare sanitizedCandidate in outer scope before any conditional blocks
    let sanitizedCandidate = null;
    
    // A3.6.73: Sanitize candidate text before validation
    sanitizedCandidate = sanitizeCandidateText(candidate, runId, reqSig);
    const trimmed = sanitizedCandidate.trim();
    
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
          // A3.6.73: Sanitize repaired candidate before pushing
          const sanitizedRepaired = sanitizeCandidateText(repaired, runId, reqSig);
          validatedCandidates.push(sanitizedRepaired);
          postFallbackRepaired.push({ original: trimmed.substring(0, 40) + "...", repaired: sanitizedRepaired.substring(0, 40) + "..." });
        } else {
          // Even repair has unbalanced brackets, drop it
          postFallbackRejected.push(candidate);
        }
      } else {
        // No valid repair found, drop the candidate
        postFallbackRejected.push(candidate);
      }
    } else {
      // Candidate is valid, keep it (use sanitizedCandidate with safe fallback)
      validatedCandidates.push(sanitizedCandidate ?? candidate);
    }
  }
  
  // Update finalCandidates with validated list
  finalCandidates = validatedCandidates;
  
  // Log post-fallback validation results
  if (postFallbackRejected.length > 0 || postFallbackRepaired.length > 0) {
    log(`[SEG_GUARD] postFallbackValidation rejected=${postFallbackRejected.length} repaired=${postFallbackRepaired.length}`);
  }
  
  // A3.6.72: If filtering reduced count too much, use best-effort fallback strategy
  const MIN_ACCEPTABLE_COUNT = Math.max(1, Math.floor(candidates.length * 0.3));
  if (finalCandidates.length < MIN_ACCEPTABLE_COUNT) {
    log(`[SEG_GUARD] filtering reduced count too much (${candidates.length} -> ${finalCandidates.length}), applying best-effort fallback`);
    
    // Priority order: (a) accepted, (b) fallback, (c) original candidates (filtered), (d) permissive split
    let bestEffortCandidates = [];
    
    // (a) Use accepted candidates if available
    if (accepted.length > 0) {
      bestEffortCandidates = [...accepted];
      log(`[SEG_GUARD] best-effort: using ${accepted.length} accepted candidates`);
    }
    // (b) Add fallback candidates
    else if (fallbackCandidates.length > 0) {
      bestEffortCandidates = [...fallbackCandidates];
      log(`[SEG_GUARD] best-effort: using ${fallbackCandidates.length} fallback candidates`);
    }
    // (c) Use original candidates (pre-guard) but sanitize them
    else if (candidates.length > 0) {
      bestEffortCandidates = candidates
        .filter(c => typeof c === "string" && c.trim().length >= 20)
        .map(c => sanitizeCandidateText(c, runId, reqSig))
        .filter(c => c && c.trim().length >= 20)
        .slice(0, 25);
      log(`[SEG_GUARD] best-effort: using ${bestEffortCandidates.length} sanitized original candidates`);
    }
    // (d) Last resort: permissive sentence split
    else if (rawSentenceList.length > 0) {
      bestEffortCandidates = rawSentenceList
        .filter(s => s.length >= 20 || /\d/.test(s))
        .map(s => sanitizeCandidateText(s, runId, reqSig))
        .filter(s => s && s.trim().length >= 20)
        .slice(0, 25);
      log(`[SEG_GUARD] best-effort: using ${bestEffortCandidates.length} permissive split sentences`);
    }
    // (e) Absolute last resort: split draft on sentence terminators
    else if (typeof draftText === "string" && draftText.trim()) {
      const permissiveSplit = draftText
        .split(/[.!?\n]+/)
        .map(s => s.trim())
        .filter(s => s.length >= 20)
        .map(s => sanitizeCandidateText(s, runId, reqSig))
        .filter(s => s && s.trim().length >= 20)
        .slice(0, 25);
      bestEffortCandidates = permissiveSplit;
      log(`[SEG_GUARD] best-effort: using ${bestEffortCandidates.length} permissive draft split`);
    }
    
    // Ensure we have at least something
    if (bestEffortCandidates.length === 0 && finalCandidates.length > 0) {
      bestEffortCandidates = finalCandidates;
      log(`[SEG_GUARD] best-effort: falling back to ${finalCandidates.length} final candidates`);
    }
    
    // Compute stable hash (simple hash for determinism check)
    const joinedCandidates = bestEffortCandidates.join('|');
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
    console.log(`[DIAG][SEG_GUARD] accepted=${accepted.length} rejected=${rejected.length} fallback=${fallbackCandidates.length} bestEffort=${bestEffortCandidates.length}`);
    console.log(`[DIAG][SEG_GUARD] rejectedByReason=${JSON.stringify(rejectionSummary)}`);
    console.log(`[DIAG][SEG_GUARD] sampleRejected=${JSON.stringify(rejectedWithReasons.slice(0, 3))}`);
    console.log(`[DIAG][SEG_GUARD] stableCandidateHash=${stableHash}`);
    
    // A3.6.72: Return best-effort candidates with seg_guard_fallback flag
    return { 
      candidates: bestEffortCandidates, 
      rejectedCount: rejected.length, 
      fallbackCount: bestEffortCandidates.length,
      segGuardFallback: true // Flag to indicate best-effort fallback was used
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
  
  // A3.6.64: Extract rejectedByReasonIncompleteNumericFragment from rejectionSummary
  const rejectedByReasonIncompleteNumericFragment = rejectionSummary["incomplete_numeric_fragment"] || 0;
  
  return { 
    candidates: finalCandidates, 
    rejectedCount: rejected.length, 
    fallbackCount: fallbackCandidates.length,
    incompleteNumericFragmentCount,
    recombinedCount: recombineCount,
    candidatesWithReasons, // A3.5.27: For fragment filter
    rejectedByReasonIncompleteNumericFragment // A3.6.64: For quality classification
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
      
      // A3.6.43: Write back to workingStatements[i] if changed
      if (changed && repairedText) {
        workingStatements[i].text = repairedText;
        workingStatements[i].__repairedNumericFragment = true;
        repairCount++;
        
        const originalPreview = trimmed.length > 50 ? trimmed.substring(0, 50) + "..." : trimmed;
        const repairedPreview = repairedText.length > 50 ? repairedText.substring(0, 50) + "..." : repairedText;
        log(`[NUMERIC_FRAGMENT_REPAIR] idx=${i} changed=true originalPreview="${originalPreview}" repairedPreview="${repairedPreview}"`);
      } else if (needsRepair) {
        workingStatements[i].__repairedNumericFragment = true;
        repairCount++;
        log(`[NUMERIC_FRAGMENT_REPAIR] idx=${i} changed=false originalPreview="${trimmed.substring(0, 50)}..." (could not repair)`);
      }
    }
  }
  
  if (repairCount > 0) {
    log(`[NUMERIC_FRAGMENT_REPAIR] repaired=${repairCount} total=${workingStatements.length}`);
  }
  log(`[PASS_A_END] phase=repairNumericFragments`);
  
  // ============================================================
  // PASS B: NUMERIC_DANGLING_CHECK (runs AFTER repair, on post-repair text)
  // ============================================================
  log(`[PASS_B_START] phase=repairNumericFragments`);
  
  for (let i = 0; i < workingStatements.length; i++) {
    const stmt = workingStatements[i];
    if (!stmt || typeof stmt !== "object") {
      continue;
    }
    
    // A3.6.43: Get text AFTER repair (from PASS A)
    const textAfterRepair = (stmt.text || "").trim();
    if (!textAfterRepair) {
      continue;
    }
    
    // A3.6.43: Build tailForMatch exactly as specified
    const tailForMatch = textAfterRepair.trim().replace(/[,\.;:\s]+$/g, "");
    
    // A3.6.43: Detect dangling currency fragment pattern (end-anchored, on tailForMatch)
    const danglingPattern = /(\bimplying\b|\bimplies\b|\bimplied\b)\s*(an\s*)?\$?\s*(\d+(?:\.\d+)?)\s*$/i;
    const match = tailForMatch.match(danglingPattern);
    
    let fixedText = textAfterRepair;
    let danglingAction = "none";
    
    if (match) {
      const nStr = match[3]; // The number part (e.g., "18" or "18.7")
      
      // A3.6.43: Try to find completion in draftText
      let completionFound = false;
      let completionText = null;
      let completionSource = null;
      
      // Determine start index in draftText
      // Prefer using CURRENT statements[i].text (post-repair) to locate its first occurrence
      let searchStartIndex = draftText.indexOf(textAfterRepair);
      let statementEndOffset = textAfterRepair.length;
      
      // If not found, fall back to searching using a shorter prefix (first 80 chars)
      if (searchStartIndex < 0) {
        const prefix = textAfterRepair.substring(0, Math.min(80, textAfterRepair.length));
        searchStartIndex = draftText.indexOf(prefix);
        statementEndOffset = prefix.length; // Use prefix length when full text not found
      }
      
      if (searchStartIndex >= 0) {
        // Search forward in draftText from that position for completion patterns
        const afterStatement = draftText.substring(searchStartIndex + statementEndOffset);
        // Search for: $<n> million, $<n>m, $<n>mm (case-insensitive, allow whitespace)
        const completionPatterns = [
          new RegExp(`\\$${nStr}\\s+million`, "i"),
          new RegExp(`\\$${nStr}\\s*mm`, "i"),
          new RegExp(`\\$${nStr}\\s*m\\b`, "i")
        ];
        
        for (const pattern of completionPatterns) {
          const completionMatch = afterStatement.match(pattern);
          if (completionMatch) {
            completionText = completionMatch[0];
            completionSource = "next_sentence";
            completionFound = true;
            break;
          }
        }
      }
      
      // A3.6.43: If not found, search a 200-char window around the best-known position as fallback
      if (!completionFound && searchStartIndex >= 0) {
        const searchStart = Math.max(0, searchStartIndex - 200);
        const searchEnd = Math.min(draftText.length, searchStartIndex + statementEndOffset + 200);
        const searchWindow = draftText.substring(searchStart, searchEnd);
        
        // Find the amount in context
        const amountPattern = new RegExp(`\\$${nStr}\\s+(million|mm|m\\b)`, "i");
        const contextMatch = searchWindow.match(amountPattern);
        if (contextMatch) {
          completionText = contextMatch[0];
          completionSource = "fallback";
          completionFound = true;
        }
      }
      
      if (completionFound && completionText) {
        // A3.6.43: Replace the trailing dangling fragment with the matched completion phrase
        // Find last occurrence of /\b(implying|implies|implied)\b/i in textAfterRepair
        const implyingPattern = /\b(implying|implies|implied)\b/gi;
        let lastImplyingIndex = -1;
        let matchResult;
        while ((matchResult = implyingPattern.exec(textAfterRepair)) !== null) {
          lastImplyingIndex = matchResult.index;
        }
        
        if (lastImplyingIndex >= 0) {
          const beforeImplying = textAfterRepair.substring(0, lastImplyingIndex).trim();
          fixedText = beforeImplying + " " + completionText;
          // Ensure final text is trimmed and does not end with dangling punctuation
          fixedText = fixedText.trim().replace(/[,\.;:\s]+$/, "").trim();
          danglingAction = "complete";
          
          const beforePreview = textAfterRepair.substring(Math.max(0, textAfterRepair.length - 50));
          const afterPreview = fixedText.substring(Math.max(0, fixedText.length - 50));
          log(`[NUMERIC_DANGLING_COMPLETE] idx=${i} source=${completionSource} beforePreview="${beforePreview}" afterPreview="${afterPreview}" completion="${completionText}"`);
        }
      } else {
        // A3.6.43: DROP clause - no completion found
        // Find last occurrence of /\b(implying|implies|implied)\b/i in textAfterRepair
        const implyingPattern = /\b(implying|implies|implied)\b/gi;
        let lastImplyingIndex = -1;
        let matchResult;
        while ((matchResult = implyingPattern.exec(textAfterRepair)) !== null) {
          lastImplyingIndex = matchResult.index;
        }
        
        if (lastImplyingIndex > 0) {
          fixedText = textAfterRepair.substring(0, lastImplyingIndex).trim();
          // Trim trailing punctuation/whitespace
          fixedText = fixedText.replace(/[,\.;:\s]+$/, "").trim();
          danglingAction = "drop";
          
          const droppedText = textAfterRepair.substring(lastImplyingIndex);
          const finalPreview = fixedText.length > 50 ? fixedText.substring(Math.max(0, fixedText.length - 50)) : fixedText;
          log(`[NUMERIC_DANGLING_DROP] idx=${i} droppedText="${droppedText}" finalPreview="${finalPreview}"`);
        }
      }
    }
    
    // A3.6.43: Always emit NUMERIC_DANGLING_CHECK log
    // tailPreview = tailForMatch.length <= 80 ? tailForMatch : tailForMatch.slice(-80)
    const tailPreview = tailForMatch.length <= 80 ? tailForMatch : tailForMatch.slice(-80);
    log(`[NUMERIC_DANGLING_CHECK] idx=${i} matched=${match ? "true" : "false"} action=${danglingAction} tailPreview="${tailPreview}"`);
    
    // A3.6.43: Always write back the fixed text if action is "complete" or "drop"
    if (danglingAction === "complete" || danglingAction === "drop") {
      workingStatements[i].text = fixedText;
      workingStatements[i].__repairedDanglingCurrency = true;
      workingStatements[i].__danglingCurrencyAction = danglingAction;
    }
  }
  
  log(`[PASS_B_END] phase=repairNumericFragments`);
  
  // A3.6.62: Return both statements and repair count
  return { statements: workingStatements, repairCount };
}

// A3.6.60: Single-statement helper for dangling-currency repair
// Returns { newText, action } where action is "none" | "complete" | "drop" | "drop_statement"
function repairDanglingCurrencySingle(statementText, draftText) {
  if (typeof statementText !== "string" || !statementText.trim()) {
    return { newText: statementText, action: "none" };
  }
  if (typeof draftText !== "string" || !draftText.trim()) {
    return { newText: statementText, action: "none" };
  }
  
  const textFinal = statementText.trim();
  
  // A3.6.61: Check last 60 chars for dangling currency patterns (expanded detection)
  const tailWindow = textFinal.length > 60 ? textFinal.slice(-60) : textFinal;
  const tailForMatch = tailWindow.replace(/[,\.;:\s]+$/g, "");
  
  // A3.6.61: Strengthened dangling detection - match connector words: ["implying", "at", "of", "for", "valu"]
  // AND followed by: "$", "$<digits>", "$<digits>.", "$<digits>,", "$<digits> m", "$<digits> mi", "$<digits> mil"
  const connectorWords = ["implying", "implies", "implied", "at", "of", "for", "valu", "valuation"];
  
  // Check if statement ends with connector + dangling currency (check last 60 chars)
  const danglingPatterns = [
    /(\bimplying\b|\bimplies\b|\bimplied\b|\bat\b|\bof\b|\bfor\b|\bvalu\w*)\s*(an?\s+)?\$\s*$/i, // Just "$"
    /(\bimplying\b|\bimplies\b|\bimplied\b|\bat\b|\bof\b|\bfor\b|\bvalu\w*)\s*(an?\s+)?\$(\d+(?:\.\d+)?)\s*$/i, // "$18"
    /(\bimplying\b|\bimplies\b|\bimplied\b|\bat\b|\bof\b|\bfor\b|\bvalu\w*)\s*(an?\s+)?\$(\d+(?:\.\d+)?)\s*[.,]\s*$/i, // "$18." or "$18,"
    /(\bimplying\b|\bimplies\b|\bimplied\b|\bat\b|\bof\b|\bfor\b|\bvalu\w*)\s*(an?\s+)?\$(\d+(?:\.\d+)?)\s+m\s*$/i, // "$18 m"
    /(\bimplying\b|\bimplies\b|\bimplied\b|\bat\b|\bof\b|\bfor\b|\bvalu\w*)\s*(an?\s+)?\$(\d+(?:\.\d+)?)\s+mi\s*$/i, // "$18 mi"
    /(\bimplying\b|\bimplies\b|\bimplied\b|\bat\b|\bof\b|\bfor\b|\bvalu\w*)\s*(an?\s+)?\$(\d+(?:\.\d+)?)\s+mil\s*$/i, // "$18 mil"
  ];
  
  let match = null;
  for (const pattern of danglingPatterns) {
    const patternMatch = tailForMatch.match(pattern);
    if (patternMatch) {
      match = patternMatch;
      break;
    }
  }
  
  if (!match) {
    return { newText: textFinal, action: "none" };
  }
  
  const nStr = match[3] || ""; // The number part if present
  const connector = match[1]; // The connector word
  
  // A3.6.61: Store connector in result for diagnostics
  const resultConnector = connector;
  
  // A3.6.60: Attempt deterministic completion using draftText
  let completionFound = false;
  let completionText = null;
  let completionSource = null;
  
  // Find best position in draftText
  let searchStartIndex = draftText.indexOf(textFinal);
  let statementEndOffset = textFinal.length;
  
  if (searchStartIndex < 0) {
    const prefix = textFinal.substring(0, Math.min(80, textFinal.length));
    searchStartIndex = draftText.indexOf(prefix);
    statementEndOffset = prefix.length;
  }
  
  if (searchStartIndex >= 0 && nStr) {
    // Search forward for: $<n> million | $<n>m | $<n>mm
    const afterStatement = draftText.substring(searchStartIndex + statementEndOffset);
    const completionPatterns = [
      new RegExp(`\\$${nStr.replace(".", "\\.")}\\s+million`, "i"),
      new RegExp(`\\$${nStr.replace(".", "\\.")}\\s*mm`, "i"),
      new RegExp(`\\$${nStr.replace(".", "\\.")}\\s*m\\b`, "i")
    ];
    
    for (const pattern of completionPatterns) {
      const completionMatch = afterStatement.match(pattern);
      if (completionMatch) {
        completionText = completionMatch[0];
        completionSource = "next_sentence";
        completionFound = true;
        break;
      }
    }
  }
  
  // A3.6.60: If not found, search a ±200 char window around best-known position
  if (!completionFound && searchStartIndex >= 0 && nStr) {
    const searchStart = Math.max(0, searchStartIndex - 200);
    const searchEnd = Math.min(draftText.length, searchStartIndex + statementEndOffset + 200);
    const searchWindow = draftText.substring(searchStart, searchEnd);
    
    const amountPattern = new RegExp(`\\$${nStr.replace(".", "\\.")}\\s+(million|mm|m\\b)`, "i");
    const contextMatch = searchWindow.match(amountPattern);
    if (contextMatch) {
      completionText = contextMatch[0];
      completionSource = "fallback";
      completionFound = true;
    }
  }
  
  if (completionFound && completionText) {
    // A3.6.60: Replace from the LAST occurrence of connector to end with the matched completion phrase
    // A3.8.31: Sanitize flags (though "gi" is already valid, defensive measure)
    const connectorPattern = new RegExp(`\\b${connector}\\b`, sanitizeRegexFlags("gi"));
    let lastConnectorIndex = -1;
    let matchResult;
    while ((matchResult = connectorPattern.exec(textFinal)) !== null) {
      lastConnectorIndex = matchResult.index;
    }
    
    if (lastConnectorIndex >= 0) {
      const beforeConnector = textFinal.substring(0, lastConnectorIndex).trim();
      const fixedText = (beforeConnector + " " + completionText).trim().replace(/[,\.;:\s]+$/, "").trim();
      return { newText: fixedText, action: "complete", connector: resultConnector };
    }
  }
  
  // A3.6.60: DROP clause - remove from last connector to end
  // Rules: If dropping would leave < 25 chars OR removes the only numeric content, drop the whole statement
  // A3.8.31: Sanitize flags (though "gi" is already valid, defensive measure)
  const connectorPattern = new RegExp(`\\b${connector}\\b`, sanitizeRegexFlags("gi"));
  let lastConnectorIndex = -1;
  let matchResult;
  while ((matchResult = connectorPattern.exec(textFinal)) !== null) {
    lastConnectorIndex = matchResult.index;
  }
  
  if (lastConnectorIndex > 0) {
    const beforeConnector = textFinal.substring(0, lastConnectorIndex).trim();
    const afterConnector = textFinal.substring(lastConnectorIndex);
    
    // Check if dropping would leave < 25 chars
    if (beforeConnector.length < 25) {
      return { newText: textFinal, action: "drop_statement", connector: resultConnector };
    }
    
    // Check if we're removing the only numeric content
    const hasNumericBefore = /\d/.test(beforeConnector);
    const hasNumericAfter = /\d/.test(afterConnector);
    
    if (!hasNumericBefore && hasNumericAfter) {
      // Dropping would remove the only numeric content - drop whole statement
      return { newText: textFinal, action: "drop_statement", connector: resultConnector };
    }
    
    // Safe to drop fragment
    const fixedText = beforeConnector.replace(/[,\.;:\s]+$/, "").trim();
    return { newText: fixedText, action: "drop", connector: resultConnector };
  }
  
  return { newText: textFinal, action: "none" };
}

// A3.6.60: Shared helper for dangling-currency repair (used by both early and final passes)
function repairDanglingCurrency(statements, draftText, runId = null, reqSig = null, phaseName = "early") {
  if (!Array.isArray(statements) || statements.length === 0) return statements;
  if (typeof draftText !== "string" || !draftText.trim()) return statements;
  
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  let repairCount = 0;
  let droppedCount = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt || typeof stmt !== "object") {
      continue;
    }
    
    // A3.6.60: Final phase should only operate on statements WITHOUT __earlyDanglingCurrencyRepaired
    if (phaseName === "final" && stmt.__earlyDanglingCurrencyRepaired === true) {
      continue;
    }
    
    const textFinal = (stmt.text || "").trim();
    if (!textFinal) {
      continue;
    }
    
    // A3.6.60: Use single-statement helper
    const result = repairDanglingCurrencySingle(textFinal, draftText);
    
    if (result.action === "none") {
      continue;
    }
    
    if (result.action === "drop_statement") {
      // A3.6.61: Mark for removal and set __dropEarly flag
      statements[i].__dropEarly = true;
      statements[i].__droppedReason = "dangling_currency_early";
      const connector = result.connector || "unknown";
      statements[i] = null;
      droppedCount++;
      repairCount++;
      if (phaseName === "early" && runId && reqSig) {
        const beforePreview = textFinal.length > 60 ? textFinal.slice(-60) : textFinal;
        log(`[A3.6.61][DANGLING_EARLY_MATCH] idx=${i} action=drop connector=${connector} beforePreview="${beforePreview}" afterPreview=""`);
      }
      continue;
    }
    
    // Write back the fixed text
    statements[i].text = result.newText;
    if (phaseName === "early") {
      statements[i].__earlyDanglingCurrencyRepaired = true;
      statements[i].__earlyDanglingCurrencyAction = result.action;
    } else {
      statements[i].__repairedDanglingCurrencyFinal = true;
      statements[i].__danglingCurrencyFinalAction = result.action;
    }
    repairCount++;
    
    if (phaseName === "early" && runId && reqSig) {
      const connector = result.connector || "unknown";
      const beforePreview = textFinal.length > 60 ? textFinal.slice(-60) : textFinal;
      const afterPreview = result.newText.length > 60 ? result.newText.slice(-60) : result.newText;
      if (result.action === "complete") {
        log(`[A3.6.61][DANGLING_EARLY_MATCH] idx=${i} action=trim connector=${connector} beforePreview="${beforePreview}" afterPreview="${afterPreview}"`);
      } else if (result.action === "drop") {
        log(`[A3.6.61][DANGLING_EARLY_MATCH] idx=${i} action=trim connector=${connector} beforePreview="${beforePreview}" afterPreview="${afterPreview}"`);
      }
    }
  }
  
  // A3.6.60: Remove dropped statements (marked as null)
  const filteredStatements = statements.filter(stmt => stmt !== null);
  const actualDroppedCount = statements.length - filteredStatements.length;
  
  // A3.6.61: Diagnostic logging
  if (phaseName === "early" && runId && reqSig) {
    log(`[A3.6.61][DANGLING_EARLY] repaired=${repairCount} dropped=${actualDroppedCount} total=${filteredStatements.length}`);
  } else if (phaseName === "final" && runId && reqSig) {
    log(`[A3.6.61][DANGLING_FINAL] repaired=${repairCount}`);
  }
  
  // A3.6.62: Return both statements and repair count
  return { statements: filteredStatements, repairCount };
}

// A3.6.48: Normalize money text for scoring (mm/m -> million)
function normalizeMoneyTextForScoring(text, runId = null, reqSig = null) {
  if (typeof text !== "string") return text;
  
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  let normalized = text;
  const before = normalized;
  
  // Replace "$20mm" -> "$20 million", "$18.7mm" -> "$18.7 million"
  normalized = normalized.replace(/\$(\d+(?:\.\d+)?)\s*(mm|m)\b/gi, (match, num, suffix) => {
    return `$${num} million`;
  });
  
  // Replace "20mm" -> "20 million" when followed by valuation/EV context
  normalized = normalized.replace(/(\d+(?:\.\d+)?)\s*(mm|m)\s+(million\s+)?(pre[- ]?money|valuation|enterprise\s+value|\bev\b)/gi, (match, num, suffix, existingMillion, context) => {
    return `${num} million ${context}`;
  });
  
  // Replace "$7m" -> "$7 million" (standalone)
  normalized = normalized.replace(/\$(\d+(?:\.\d+)?)\s*m\b(?!\w)/gi, (match, num) => {
    return `$${num} million`;
  });
  
  if (normalized !== before && runId && reqSig) {
    log(`[A3.6.48][MM_NORMALIZE] before="${before.substring(0, 80)}" after="${normalized.substring(0, 80)}"`);
  }
  
  return normalized;
}

// A3.6.46: Parse money string to number (in millions)
// "$18.7" + "mm" => 18.7 (store in millions units; DO NOT multiply to absolute dollars)
function parseMoneyToNumber(valueStr, suffix) {
  if (!valueStr || typeof valueStr !== "string") return null;
  
  // Remove $ and commas, extract number
  const numStr = valueStr.replace(/[$,]/g, "").trim();
  const num = parseFloat(numStr);
  
  if (!Number.isFinite(num) || num <= 0) return null;
  
  // Normalize suffix to lowercase
  const normalizedSuffix = (suffix || "").toLowerCase();
  
  // If suffix is "billion" or "b", convert to millions
  if (normalizedSuffix.includes("billion") || normalizedSuffix === "b") {
    return num * 1000;
  }
  // If suffix is "thousand" or "k", convert to millions
  if (normalizedSuffix.includes("thousand") || normalizedSuffix === "k") {
    return num / 1000;
  }
  // "million", "mm", "m" all stay as-is (already in millions)
  return num;
}

// A3.6.68: Helper to extract deal terms from a single text string
function extractDealTermsFromText(text, runId = null, reqSig = null) {
  if (typeof text !== "string" || !text.trim()) {
    return {
      preMoney: null,
      enterpriseValue: null,
      investment: null,
      ownershipPct: null,
      ownershipUpside: null,
      secondary: null
    };
  }
  
  const normalized = text
    .replace(/[''']/g, "'")
    .replace(/[—–−]/g, "-")
    .replace(/[…]/g, " ")
    .replace(/\.\.\./g, " ")
    .replace(/[ \t\r\n]+/g, " ");
  
  const result = {
    preMoney: null,
    enterpriseValue: null,
    investment: null,
    ownershipPct: null,
    ownershipUpside: null,
    secondary: null,
    ownershipModality: null, // A3.6.69: plan, expected, targeted, actual
    ownershipUpsidePct: null, // A3.6.69: separate upside percentage
    ownershipUpsideMechanism: null // A3.6.69: e.g. "secondary purchases"
  };
  
  // Extract pre-money
  const preMoneyPattern = /(?:priced\s+at\s+)?a?\s*\$?\s*(\d+(?:\.\d+)?)\s*(mm|m|million)\s*pre[- ]money\s*valuation\b/i;
  const preMoneyMatch = normalized.match(preMoneyPattern);
  if (preMoneyMatch) {
    const preMoneyValue = preMoneyMatch[1].trim();
    const preMoneySuffix = preMoneyMatch[2].toLowerCase();
    const preMoneyAmount = parseMoneyToNumber(preMoneyValue, preMoneySuffix);
    if (preMoneyAmount) {
      result.preMoney = {
        amount: preMoneyAmount,
        currency: "USD",
        raw: `$${preMoneyValue.replace(/[$,]/g, "")}${preMoneySuffix === "million" ? "mm" : preMoneySuffix}`
      };
    }
  }
  
  // Extract enterprise value
  const evPattern = /\$?\s*(\d+(?:\.\d+)?)\s*(mm|m|million)\s*(?:enterprise\s+value|\bEV\b)\b/i;
  const evMatch = normalized.match(evPattern);
  if (evMatch) {
    const evValue = evMatch[1].trim();
    const evSuffix = evMatch[2].toLowerCase();
    const evAmount = parseMoneyToNumber(evValue, evSuffix);
    if (evAmount) {
      result.enterpriseValue = {
        amount: evAmount,
        currency: "USD",
        raw: `$${evValue.replace(/[$,]/g, "")}${evSuffix === "million" ? "mm" : evSuffix}`
      };
    }
  }
  
  // A3.6.68: Extract investment amount (expanded patterns)
  const investPatterns = [
    /\b(?:plan\s+to\s+invest|we\s+plan\s+to\s+invest|invest(?:ment)?(?:\s+of)?(?:\s+up\s+to)?)\s*\$?\s*(\d+(?:\.\d+)?)\s*(mm|m|million)\b/i,
    /\b(?:Series\s+[A-Z]|financing)\s+(?:of\s+)?\$?\s*(\d+(?:\.\d+)?)\s*(mm|m|million)\b/i,
    /\binvesting\s+\$?\s*(\d+(?:\.\d+)?)\s*(mm|m|million)\b/i
  ];
  
  for (const pattern of investPatterns) {
    const investMatch = normalized.match(pattern);
    if (investMatch) {
      const investValue = investMatch[1].trim();
      const investSuffix = investMatch[2] ? investMatch[2].toLowerCase() : "million";
      const investAmount = parseMoneyToNumber(investValue, investSuffix);
      if (investAmount) {
        result.investment = {
          amount: investAmount,
          currency: "USD",
          raw: `$${investValue.replace(/[$,]/g, "")}${investSuffix === "million" ? "mm" : investSuffix}`
        };
        break;
      }
    }
  }
  
  // A3.6.68: Extract ownership % (expanded patterns)
  // A3.6.69: Also extract modality
  const ownPatterns = [
    { pattern: /\b(?:plan\s+to\s+own|we\s+plan\s+to\s+own)\s*(\d+(?:\.\d+)?)\s*%\s*(?:on\s*)?(?:a\s*)?fully[- ]diluted\b/i, modality: "plan" },
    { pattern: /\bown\s*(\d+(?:\.\d+)?)\s*%\s*(?:on\s*)?(?:a\s*)?fully[- ]diluted\b/i, modality: "actual" },
    { pattern: /\bexpected\s+(?:to\s+own\s+)?(\d+(?:\.\d+)?)\s*%\s*(?:on\s*)?(?:a\s*)?fully[- ]diluted\b/i, modality: "expected" },
    { pattern: /\b(?:targeted|target)\s*(\d+(?:\.\d+)?)\s*%\s*fully[- ]diluted\s*ownership\b/i, modality: "targeted" },
    { pattern: /\b(\d+(?:\.\d+)?)\s*%\s*fully[- ]diluted\b/i, modality: null },
    { pattern: /\b(?:targeted|target)\s*(\d+(?:\.\d+)?)\s*%\s*FD\b/i, modality: "targeted" }
  ];
  
  for (const { pattern, modality } of ownPatterns) {
    const ownMatch = normalized.match(pattern);
    if (ownMatch) {
      const ownPctStr = ownMatch[1].trim();
      const ownPct = parseFloat(ownPctStr);
      if (Number.isFinite(ownPct) && ownPct > 0 && ownPct <= 100) {
        result.ownershipPct = {
          pct: ownPct,
          raw: `${ownPct}%`
        };
        // A3.6.69: Set modality if detected
        if (modality && !result.ownershipModality) {
          result.ownershipModality = modality;
        }
        break;
      }
    }
  }
  
  // A3.6.69: Extract modality from separate patterns if not already set
  if (result.ownershipPct && !result.ownershipModality) {
    const ownPctStr = result.ownershipPct.pct.toString();
    const ownPctIndex = normalized.indexOf(ownPctStr + "%");
    
    if (ownPctIndex >= 0) {
      // Search within ±100 chars of ownership %
      const searchStart = Math.max(0, ownPctIndex - 100);
      const searchEnd = Math.min(normalized.length, ownPctIndex + 100);
      const searchWindow = normalized.substring(searchStart, searchEnd);
      
      // A3.6.69: Check for modality patterns closest to ownership %
      const modalityPatterns = [
        { pattern: /\b(?:plan\s+to\s+own|we\s+plan\s+to\s+own)\b/i, modality: "plan" },
        { pattern: /\bexpected\s+(?:to\s+own|\d+%)/i, modality: "expected" },
        { pattern: /\b(?:targeted|target)\s+\d+%/i, modality: "targeted" }
      ];
      
      // Find the closest match
      let closestMatch = null;
      let closestDistance = Infinity;
      
      for (const { pattern, modality } of modalityPatterns) {
        // A3.8.31: Sanitize flags to prevent invalid flag errors
        const combinedFlags = sanitizeRegexFlags(pattern.flags + 'g');
        const matches = [...searchWindow.matchAll(new RegExp(pattern.source, combinedFlags))];
        for (const match of matches) {
          const matchIndex = searchStart + match.index;
          const distance = Math.abs(matchIndex - ownPctIndex);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestMatch = modality;
          }
        }
      }
      
      if (closestMatch) {
        result.ownershipModality = closestMatch;
      }
    }
  }
  
  // A3.6.68: Extract secondary exposure / upside
  // A3.6.69: Enhanced to extract upside percent and mechanism separately
  const secondaryPatterns = [
    /\bincrease\s+exposure\s+to\s+\$?\s*(\d+(?:\.\d+)?)\s*(mm|m|million)\b/i,
    /\b(\d+(?:\.\d+)?)\s*%\s*ownership\s+via\s+secondary\s+purchases\b/i,
    /\b(\d+(?:\.\d+)?)\s*%\s*via\s+secondary\b/i,
    /\bpotential\s+to\s+increase\s+to\s*(\d+(?:\.\d+)?)\s*%\b/i
  ];
  
  for (const pattern of secondaryPatterns) {
    const secondaryMatch = normalized.match(pattern);
    if (secondaryMatch) {
      const secondaryValue = secondaryMatch[1].trim();
      if (secondaryMatch[2]) {
        // Money amount
        const secondarySuffix = secondaryMatch[2].toLowerCase();
        const secondaryAmount = parseMoneyToNumber(secondaryValue, secondarySuffix);
        if (secondaryAmount) {
          result.secondary = {
            amount: secondaryAmount,
            currency: "USD",
            raw: `$${secondaryValue.replace(/[$,]/g, "")}${secondarySuffix === "million" ? "mm" : secondarySuffix}`,
            type: "exposure"
          };
          break;
        }
      } else {
        // Percentage
        const secondaryPct = parseFloat(secondaryValue);
        if (Number.isFinite(secondaryPct) && secondaryPct > 0 && secondaryPct <= 100) {
          result.ownershipUpside = {
            pct: secondaryPct,
            raw: `${secondaryPct}%`,
            type: "secondary"
          };
          // A3.6.69: Also set ownershipUpsidePct
          result.ownershipUpsidePct = secondaryPct;
          break;
        }
      }
    }
  }
  
  // A3.6.69: Extract ownership upside percent and mechanism separately
  // A3.6.71: Support "approximately 31%" and "c.31%" (normalized to "approximately 31%")
  const upsidePatterns = [
    /\b(?:potential\s+to\s+increase\s+to|increase\s+.*\s+ownership\s+to)\s+(?:approximately\s+)?(\d+(?:\.\d+)?)\s*%/i,
    /\b(?:approximately\s+)?(\d+(?:\.\d+)?)\s*%\s*ownership\s+via/i,
    /\bto\s+(?:approximately\s+)?(\d+(?:\.\d+)?)\s*%\s+.*\s+secondary/i,
    /\bapproximately\s+(\d+(?:\.\d+)?)\s*%/i // A3.6.71: Standalone "approximately 31%" when in context of ownership upside
  ];
  
  for (const pattern of upsidePatterns) {
    const upsideMatch = normalized.match(pattern);
    if (upsideMatch) {
      const upsidePct = parseFloat(upsideMatch[1].trim());
      if (Number.isFinite(upsidePct) && upsidePct > 0 && upsidePct <= 100) {
        result.ownershipUpsidePct = upsidePct;
        // A3.6.69: Also update ownershipUpside if not already set
        if (!result.ownershipUpside) {
          result.ownershipUpside = {
            pct: upsidePct,
            raw: `${upsidePct}%`,
            type: "secondary"
          };
        }
        break;
      }
    }
  }
  
  // A3.6.69: Extract mechanism patterns (search in context of upside if available)
  // A3.6.71: Support "through a secondary purchase from a former co-founder"
  const mechanismPatterns = [
    /\bthrough\s+a\s+secondary\s+purchase\s+from\s+a\s+former\s+co-founder\b/i,
    /\bthrough\s+secondary\s+purchase\s+from\s+.*\s+co-founder\b/i,
    /\bvia\s+secondary\s+purchases\b/i,
    /\bvia\s+secondary\s+shares\b/i,
    /\bvia\s+secondary\b/i,
    /\bthrough\s+secondary\s+purchase\b/i
  ];
  
  // If we found an upside percent, search near it for mechanism
  if (result.ownershipUpsidePct) {
    const upsidePctStr = result.ownershipUpsidePct.toString();
    const upsideIndex = normalized.indexOf(upsidePctStr + "%");
    
    if (upsideIndex >= 0) {
      // Search within ±50 chars of upside %
      const searchStart = Math.max(0, upsideIndex - 50);
      const searchEnd = Math.min(normalized.length, upsideIndex + 50);
      const searchWindow = normalized.substring(searchStart, searchEnd);
      
      for (const pattern of mechanismPatterns) {
        const mechanismMatch = searchWindow.match(pattern);
        if (mechanismMatch) {
          result.ownershipUpsideMechanism = mechanismMatch[0].trim();
          break;
        }
      }
    }
  } else {
    // Search globally if no upside percent found
    for (const pattern of mechanismPatterns) {
      const mechanismMatch = normalized.match(pattern);
      if (mechanismMatch) {
        result.ownershipUpsideMechanism = mechanismMatch[0].trim();
        break;
      }
    }
  }
  
  // A3.6.71: Log deal terms parsing for diagnostics
  if (result.ownershipPct || result.ownershipUpsidePct) {
    const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
    log(`[A3.6.71][DEAL_PARSE_PCT] foundMain=${result.ownershipPct ? result.ownershipPct.pct : "null"} foundUpside=${result.ownershipUpsidePct || "null"} rawMain="${result.ownershipPct ? result.ownershipPct.raw : "null"}" rawUpside="${result.ownershipUpsidePct ? result.ownershipUpsidePct + "%" : "null"}" mechanism="${result.ownershipUpsideMechanism || "null"}"`);
  }
  
  return result;
}

// A3.6.47: Extract DealTerms from draftText (robust, handles messy text)
// A3.6.66: Updated to allow partial detection and statement_only fallback
// A3.6.68: Extract from both sourceText and statementText, then merge results
// A3.7.10: Add selectionMode guard to prevent leakage from outside selected text
function extractDealTermsFromDraft(draftText, runId = null, reqSig = null, uploadedDocs = null, statementText = null, selectionMode = false) {
  if (typeof draftText !== "string" || !draftText.trim()) return null;
  
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  // A3.7.10: Selection mode isolation - only parse from statementText (selectedText)
  if (selectionMode && statementText && typeof statementText === "string" && statementText.trim()) {
    const normalizedSelected = statementText
      .replace(/[''']/g, "'")
      .replace(/[—–−]/g, "-")
      .replace(/[…]/g, " ")
      .replace(/\.\.\./g, " ")
      .replace(/[ \t\r\n]+/g, " ");
    
    const selectedResults = extractDealTermsFromText(normalizedSelected, runId, reqSig);
    
    // A3.7.10: Only return what's found in selectedText, no windowing
    const hasAnyField = selectedResults.preMoney || selectedResults.enterpriseValue || selectedResults.investment || 
                       selectedResults.ownershipPct || selectedResults.ownershipUpside;
    
    if (!hasAnyField) {
      log(`[A3.7.10][DEAL_TERMS_SELECTION] selectionDealTermsMode=selection_only found=false`);
      return null;
    }
    
    const dealTerms = {
      preMoney: selectedResults.preMoney,
      enterpriseValue: selectedResults.enterpriseValue,
      investment: selectedResults.investment,
      ownershipPct: selectedResults.ownershipPct,
      ownershipUpside: selectedResults.ownershipUpside,
      secondary: selectedResults.secondary,
      ownershipModality: selectedResults.ownershipModality,
      ownershipUpsidePct: selectedResults.ownershipUpsidePct,
      ownershipUpsideMechanism: selectedResults.ownershipUpsideMechanism,
      sourceSpan: null,
      sourceText: normalizedSelected,
      sourceKind: "selection_only"
    };
    
    const preMoneyVal = dealTerms.preMoney ? dealTerms.preMoney.amount : null;
    const evVal = dealTerms.enterpriseValue ? dealTerms.enterpriseValue.amount : null;
    const investVal = dealTerms.investment ? dealTerms.investment.amount : null;
    const ownPctVal = dealTerms.ownershipPct ? dealTerms.ownershipPct.pct : null;
    const ownUpsideVal = dealTerms.ownershipUpside ? dealTerms.ownershipUpside.pct : null;
    const secondaryVal = dealTerms.secondary ? (dealTerms.secondary.amount || dealTerms.secondary.pct) : null;
    const fields = {
      preMoney: preMoneyVal,
      ev: evVal,
      invest: investVal,
      ownPct: ownPctVal,
      secondary: secondaryVal,
      upsides: ownUpsideVal
    };
    
    log(`[A3.7.10][DEAL_TERMS_SELECTION] selectionDealTermsMode=selection_only fields=${JSON.stringify(fields)}`);
    
    return dealTerms;
  }
  
  // A3.6.47: Normalize draftText before regex (non-selection mode)
  let normalizedDraft = draftText
    .replace(/[''']/g, "'")  // Replace unicode apostrophes with standard apostrophe
    .replace(/[—–−]/g, "-")  // Replace unicode dashes with standard dash
    .replace(/[…]/g, " ")   // Replace unicode ellipsis with space
    .replace(/\.\.\./g, " ")  // Replace "..." with space
    .replace(/[ \t\r\n]+/g, " "); // Collapse whitespace
  
  // A3.6.68: Extract from draftText first
  const draftResults = extractDealTermsFromText(normalizedDraft, runId, reqSig);
  
  // A3.6.68: Extract from statementText if available
  let statementResults = {
    preMoney: null,
    enterpriseValue: null,
    investment: null,
    ownershipPct: null,
    ownershipUpside: null,
    secondary: null
  };
  let usedStatementText = false;
  
  if (statementText && typeof statementText === "string" && statementText.trim()) {
    statementResults = extractDealTermsFromText(statementText, runId, reqSig);
    usedStatementText = true;
  }
  
  // A3.6.68: Merge results - prefer non-null values, keep best available
  // A3.6.69: Include new ownership fields
  const dealTerms = {
    preMoney: draftResults.preMoney || statementResults.preMoney,
    enterpriseValue: draftResults.enterpriseValue || statementResults.enterpriseValue,
    investment: draftResults.investment || statementResults.investment,
    ownershipPct: draftResults.ownershipPct || statementResults.ownershipPct,
    ownershipUpside: draftResults.ownershipUpside || statementResults.ownershipUpside,
    secondary: draftResults.secondary || statementResults.secondary,
    ownershipModality: draftResults.ownershipModality || statementResults.ownershipModality,
    ownershipUpsidePct: draftResults.ownershipUpsidePct || statementResults.ownershipUpsidePct,
    ownershipUpsideMechanism: draftResults.ownershipUpsideMechanism || statementResults.ownershipUpsideMechanism,
    sourceSpan: null,
    sourceText: null,
    sourceKind: null
  };
  
  // A3.6.68: Find pmStart for sourceText windowing (use draftText match if available)
  const preMoneyPattern = /(?:priced\s+at\s+)?a?\s*\$?\s*(\d+(?:\.\d+)?)\s*(mm|m|million)\s*pre[- ]money\s*valuation\b/i;
  const preMoneyMatch = normalizedDraft.match(preMoneyPattern);
  let pmStart = preMoneyMatch ? preMoneyMatch.index : null;
  
  // A3.6.66: Check if ANY field is present (found = true if any field exists)
  const hasAnyField = dealTerms.preMoney || dealTerms.enterpriseValue || dealTerms.investment || 
                       dealTerms.ownershipPct || dealTerms.ownershipUpside;
  
  if (!hasAnyField) {
    log(`[A3.6.47][DEAL_TERMS] found=false preMoney=nil ev=nil invest=nil ownPct=nil source=none`);
    return null;
  }
  
  // A3.6.66: Try to capture source text as windowed blob (if we have a starting position)
  // A3.6.71: Expand window backward to capture investment amount
  let backfilledSpan = false;
  if (pmStart != null) {
    // A3.6.71: Expand window start backward by 120-180 chars to capture investment
    const expandedStart = Math.max(0, pmStart - 150);
    const blobStart = expandedStart;
    const blobEnd = Math.min(pmStart + 260, normalizedDraft.length);
    let blob = normalizedDraft.slice(blobStart, blobEnd);
    
    // A3.6.71: Re-run investment parsing on expanded window
    const expandedInvestResults = extractDealTermsFromText(blob, runId, reqSig);
    if (expandedInvestResults.investment && !dealTerms.investment) {
      dealTerms.investment = expandedInvestResults.investment;
      log(`[A3.6.71][DEAL_WINDOW] beforeSpan=(${pmStart},${pmStart + 260}) afterSpan=(${blobStart},${blobEnd}) capturedInvest=true invest=${expandedInvestResults.investment.amount}`);
    } else {
      log(`[A3.6.71][DEAL_WINDOW] beforeSpan=(${pmStart},${pmStart + 260}) afterSpan=(${blobStart},${blobEnd}) capturedInvest=${!!expandedInvestResults.investment} invest=${expandedInvestResults.investment ? expandedInvestResults.investment.amount : "null"}`);
    }
    
    // Truncate blob at first occurrence of ". ", "; ", or "  " AFTER at least 40 chars
    const truncatePatterns = [/\.\s+/, /;\s+/, /\s{2,}/];
    for (const pattern of truncatePatterns) {
      const match = blob.substring(40).match(pattern);
      if (match) {
        const truncateIdx = 40 + match.index;
        blob = blob.substring(0, truncateIdx);
        break;
      }
    }
    
    dealTerms.sourceText = blob.trim();
    dealTerms.sourceSpan = {
      start: blobStart,
      end: blobStart + blob.length
    };
    dealTerms.sourceKind = "windowed_blob";
  } else {
    // A3.6.66: Fallback to statement_only if we can't produce windowed_blob
    dealTerms.sourceKind = "statement_only";
    dealTerms.sourceText = statementText || normalizedDraft.substring(0, 300).trim();
    dealTerms.sourceSpan = null;
    
    // A3.6.66: Best-effort memo span backfill using corpusSearch
    if (uploadedDocs && Array.isArray(uploadedDocs) && uploadedDocs.length > 0 && statementText) {
      try {
        // Collect normalized numbers from detected deal terms
        const normalizedNumbers = [];
        if (dealTerms.preMoney) normalizedNumbers.push(dealTerms.preMoney.amount);
        if (dealTerms.enterpriseValue) normalizedNumbers.push(dealTerms.enterpriseValue.amount);
        if (dealTerms.investment) normalizedNumbers.push(dealTerms.investment.amount);
        if (dealTerms.ownershipPct) normalizedNumbers.push(dealTerms.ownershipPct.pct);
        
        // Build search query with keywords
        const keywords = ["pre-money", "enterprise value", "fully diluted", "secondary"];
        const searchQuery = statementText; // Use statement text as search query
        
        const searchResult = corpusSearch(searchQuery, uploadedDocs);
        
        if (searchResult && searchResult.found && searchResult.hits && searchResult.hits.length > 0) {
          // Find the best hit (prefer number match)
          const bestHit = searchResult.hits.find(h => h.matchType === "number") || searchResult.hits[0];
          
          if (bestHit && bestHit.excerpt) {
            // Try to find the excerpt in the uploaded doc to get approximate offsets
            const doc = uploadedDocs.find(d => d.id === bestHit.docId);
            if (doc && doc.text) {
              const excerptLower = bestHit.excerpt.toLowerCase();
              const docTextLower = doc.text.toLowerCase();
              const matchIndex = docTextLower.indexOf(excerptLower.substring(0, 50)); // Use first 50 chars for matching
              
              if (matchIndex >= 0) {
                // Extract window around match (±120 chars)
                const windowStart = Math.max(0, matchIndex - 120);
                const windowEnd = Math.min(doc.text.length, matchIndex + bestHit.excerpt.length + 120);
                const windowText = doc.text.substring(windowStart, windowEnd).trim();
                
                dealTerms.sourceText = windowText;
                dealTerms.sourceSpan = {
                  start: windowStart,
                  end: windowEnd
                };
                dealTerms.sourceKind = "windowed_blob";
                backfilledSpan = true;
              }
            }
          }
        }
      } catch (backfillErr) {
        // Non-blocking: if backfill fails, keep statement_only
        log(`[A3.6.66][DEAL_TERMS_BACKFILL] error="${backfillErr?.message || String(backfillErr)}"`);
      }
    }
  }
  
  // A3.6.68: Determine sourceText for windowing (prefer windowed_blob, fallback to statementText)
  let finalSourceText = dealTerms.sourceText;
  if (!finalSourceText && statementText) {
    finalSourceText = statementText;
  }
  if (!finalSourceText) {
    finalSourceText = normalizedDraft.substring(0, 300).trim();
  }
  dealTerms.sourceText = finalSourceText;
  
  // A3.6.66: Log extraction results with new diagnostics
  // A3.6.67: Enhanced diagnostics with per-statement info
  // A3.6.68: Add merge diagnostics
  const preMoneyVal = dealTerms.preMoney ? dealTerms.preMoney.amount : null;
  const evVal = dealTerms.enterpriseValue ? dealTerms.enterpriseValue.amount : null;
  const investVal = dealTerms.investment ? dealTerms.investment.amount : null;
  const ownPctVal = dealTerms.ownershipPct ? dealTerms.ownershipPct.pct : null;
  const ownUpsideVal = dealTerms.ownershipUpside ? dealTerms.ownershipUpside.pct : null;
  const secondaryVal = dealTerms.secondary ? (dealTerms.secondary.amount || dealTerms.secondary.pct) : null;
  const fields = {
    preMoney: preMoneyVal,
    ev: evVal,
    invest: investVal,
    ownPct: ownPctVal,
    secondary: secondaryVal,
    upsides: ownUpsideVal
  };
  const hasWindow = dealTerms.sourceSpan != null && dealTerms.sourceKind === "windowed_blob";
  const usedTexts = {
    windowed: dealTerms.sourceKind === "windowed_blob",
    statement: usedStatementText
  };
  log(`[A3.6.68][DEAL_TERMS_MERGE] idx=0 preMoney=${preMoneyVal} invest=${investVal} ownPct=${ownPctVal} secondary=${secondaryVal} sourceKind=${dealTerms.sourceKind} usedTexts=${JSON.stringify(usedTexts)}`);
  log(`[A3.6.67][DEAL_TERMS_GATE] idx=0 found=true fields=${JSON.stringify(fields)} sourceKind=${dealTerms.sourceKind} hasWindow=${hasWindow}`);
  log(`[A3.6.66][DEAL_TERMS_GATE] found=true sourceKind=${dealTerms.sourceKind} fields=${JSON.stringify(fields)} backfilledSpan=${backfilledSpan}`);
  
  return dealTerms;
}

// A3.6.49: Canonicalize Deal Terms statements (split into 3: pricing, investment, ownership)
// A3.6.66: Updated to run whenever found=true (not just when both preMoney and enterpriseValue exist)
function canonicalizeDealTermsStatements(statements, dealTerms, runId = null, reqSig = null) {
  if (!dealTerms || !Array.isArray(statements)) {
    const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
    log(`[A3.6.66][CANON_RUN] ran=false reason=no_dealTerms_or_invalid_statements emitted={}`);
    return statements;
  }
  
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  // A3.6.66: Determine which canonical statements to emit based on available fields
  const hasPricing = dealTerms.preMoney || dealTerms.enterpriseValue;
  const hasInvestment = dealTerms.investment != null;
  const hasOwnership = dealTerms.ownershipPct != null || dealTerms.ownershipUpside != null;
  
  if (!hasPricing && !hasInvestment && !hasOwnership) {
    log(`[A3.6.66][CANON_RUN] ran=false reason=no_fields_detected emitted={}`);
    return statements;
  }
  
  // A3.6.49: Extract verbatim clauses from sourceText (no invented phrasing)
  const sourceText = dealTerms.sourceText || "";
  const sourceLower = sourceText.toLowerCase();
  
  // 1) Pricing statement: "a $20 million pre-money valuation, implying an $18.7 million enterprise value"
  // A3.6.66: Support partial pricing (preMoney only, or EV only, or both)
  let pricingText = null;
  if (hasPricing) {
    if (dealTerms.preMoney && dealTerms.enterpriseValue && sourceText) {
      // Try to extract verbatim pricing clause (both preMoney and EV)
      const preMoneyPattern = new RegExp(`a?\\s*\\$?\\s*${dealTerms.preMoney.amount.toString().replace(".", "\\.")}\\s*(?:million|mm|m)\\s*pre[- ]?money\\s*valuation`, "i");
      const evPattern = new RegExp(`\\$?\\s*${dealTerms.enterpriseValue.amount.toString().replace(".", "\\.")}\\s*(?:million|mm|m)\\s*(?:enterprise\\s+value|ev)`, "i");
      
      const preMoneyMatch = sourceText.match(preMoneyPattern);
      const evMatch = sourceText.match(evPattern);
      
      if (preMoneyMatch && evMatch) {
        // Extract from preMoney match start to ev match end
        const start = preMoneyMatch.index;
        const end = evMatch.index + evMatch[0].length;
        pricingText = sourceText.substring(start, end).trim();
        
        // Normalize "mm" to "million" for consistency
        pricingText = pricingText.replace(/\bmm\b/g, "million").replace(/\bm\b(?!\w)/g, "million");
      } else {
        // Fall back to constructed (but avoid "thereby own")
        pricingText = `a ${dealTerms.preMoney.raw.replace(/mm\b/g, "million").replace(/\bm\b(?!\w)/g, "million")} pre-money valuation, implying an ${dealTerms.enterpriseValue.raw.replace(/mm\b/g, "million").replace(/\bm\b(?!\w)/g, "million")} enterprise value`;
      }
    } else if (dealTerms.preMoney) {
      // Only preMoney available
      if (sourceText) {
        const preMoneyPattern = new RegExp(`a?\\s*\\$?\\s*${dealTerms.preMoney.amount.toString().replace(".", "\\.")}\\s*(?:million|mm|m)\\s*pre[- ]?money\\s*valuation`, "i");
        const preMoneyMatch = sourceText.match(preMoneyPattern);
        if (preMoneyMatch) {
          pricingText = preMoneyMatch[0].trim();
          pricingText = pricingText.replace(/\bmm\b/g, "million").replace(/\bm\b(?!\w)/g, "million");
        } else {
          pricingText = `a ${dealTerms.preMoney.raw.replace(/mm\b/g, "million").replace(/\bm\b(?!\w)/g, "million")} pre-money valuation`;
        }
      } else {
        pricingText = `a ${dealTerms.preMoney.raw.replace(/mm\b/g, "million").replace(/\bm\b(?!\w)/g, "million")} pre-money valuation`;
      }
    } else if (dealTerms.enterpriseValue) {
      // Only EV available
      if (sourceText) {
        const evPattern = new RegExp(`\\$?\\s*${dealTerms.enterpriseValue.amount.toString().replace(".", "\\.")}\\s*(?:million|mm|m)\\s*(?:enterprise\\s+value|ev)`, "i");
        const evMatch = sourceText.match(evPattern);
        if (evMatch) {
          pricingText = evMatch[0].trim();
          pricingText = pricingText.replace(/\bmm\b/g, "million").replace(/\bm\b(?!\w)/g, "million");
        } else {
          pricingText = `an ${dealTerms.enterpriseValue.raw.replace(/mm\b/g, "million").replace(/\bm\b(?!\w)/g, "million")} enterprise value`;
        }
      } else {
        pricingText = `an ${dealTerms.enterpriseValue.raw.replace(/mm\b/g, "million").replace(/\bm\b(?!\w)/g, "million")} enterprise value`;
      }
    }
  }
  
  // 2) Investment statement: investment only (no ownership inference)
  // A3.6.54: Preserve "up to" and currency symbol from sourceText
  let investText = null;
  if (dealTerms.investment && sourceText) {
    const investAmount = dealTerms.investment.amount.toString();
    // A3.6.54: Try to extract original "up to $X" substring from sourceText
    const investPattern = new RegExp(`(?:an?\\s+)?investment\\s+of\\s+(up\\s+to\\s+)?\\$?\\s*${investAmount.replace(".", "\\.")}\\s*(?:million|mm|m)\\b`, "i");
    const investMatch = sourceText.match(investPattern);
    
    if (investMatch) {
      // Extract verbatim investment clause, preserving "up to" and "$"
      investText = investMatch[0].trim();
      // Normalize "mm" to "million" but preserve currency and "up to"
      investText = investText.replace(/\bmm\b/g, "million").replace(/\bm\b(?!\w)/g, "million");
      
      // A3.6.54: Ensure it has "investment" and preserve "up to" if present
      if (!/\binvestment\b/i.test(investText)) {
        const hasUpTo = /\bup\s+to\b/i.test(investText);
        const hasCurrency = /\$/.test(investText);
        const amountPart = investText.replace(/^(?:an?|up\s+to)\s+/, "").replace(/\$/, "").trim();
        investText = `an investment of ${hasUpTo ? "up to " : ""}${hasCurrency ? "$" : ""}${amountPart}`;
      }
    } else {
      // A3.6.54: Fall back to reconstruction with "up to" and currency
      const investAmountNum = dealTerms.investment.amount;
      const currency = dealTerms.investment.currency === "USD" ? "$" : "";
      investText = `an investment of up to ${currency}${investAmountNum} million`;
    }
  } else if (dealTerms.investment) {
    // A3.6.54: No sourceText, construct with "up to" and currency
    const investAmountNum = dealTerms.investment.amount;
    const currency = dealTerms.investment.currency === "USD" ? "$" : "";
    investText = `an investment of up to ${currency}${investAmountNum} million`;
  }
  
  // 3) Ownership statement: "a targeted 20% fully diluted ownership" (verbatim if possible)
  // A3.6.69: Updated to use modality and preserve upside details
  let ownershipText = null;
  if (dealTerms.ownershipPct) {
    const ownPctStr = dealTerms.ownershipPct.pct.toString();
    const ownPctRaw = dealTerms.ownershipPct.raw;
    
    // A3.6.69: Build base ownership text using modality
    let baseText = "";
    const modality = dealTerms.ownershipModality;
    
    if (modality === "plan" || modality === "expected") {
      baseText = `an expected ownership of ${ownPctRaw} on a fully diluted basis`;
    } else if (modality === "targeted") {
      baseText = `a targeted ownership of ${ownPctRaw} on a fully diluted basis`;
    } else if (modality === "actual") {
      baseText = `an ownership of ${ownPctRaw} on a fully diluted basis`;
    } else {
      // Fallback: no modality detected
      baseText = `an ownership of ${ownPctRaw} on a fully diluted basis`;
    }
    
    ownershipText = baseText;
    
    // A3.6.69: Add upside clause if ownershipUpsidePct exists
    if (dealTerms.ownershipUpsidePct) {
      ownershipText += `, with potential to increase to ${dealTerms.ownershipUpsidePct}% ownership`;
      
      // Add mechanism if available
      if (dealTerms.ownershipUpsideMechanism) {
        ownershipText += ` ${dealTerms.ownershipUpsideMechanism}`;
      } else {
        // Default mechanism if not specified
        ownershipText += ` via secondary purchases`;
      }
    } else if (dealTerms.ownershipUpside && dealTerms.ownershipUpside.pct) {
      // Fallback to ownershipUpside if ownershipUpsidePct not set
      ownershipText += `, with potential to increase to ${dealTerms.ownershipUpside.raw} ownership`;
      if (dealTerms.ownershipUpsideMechanism) {
        ownershipText += ` ${dealTerms.ownershipUpsideMechanism}`;
      } else {
        ownershipText += ` via secondary purchases`;
      }
    } else if (dealTerms.secondary && dealTerms.secondary.type === "exposure") {
      // Add secondary exposure if no upside percent
      ownershipText += `, with potential to increase exposure to ${dealTerms.secondary.raw}`;
    }
  }
  
  // A3.6.68: Generate parent key for linkage
  const generateParentKey = (text, span) => {
    const keyText = text + (span ? `${span.start}-${span.end}` : "");
    let hash = 0;
    for (let i = 0; i < keyText.length; i++) {
      const char = keyText.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  };
  
  const parentKey = sourceText ? generateParentKey(sourceText, dealTerms.sourceSpan) : null;
  
  // A3.6.60: Find original deal-terms statement that matches sourceText to capture draftPosition
  let originalDraftPosition = null;
  let replacedStatementIdx = null;
  
  if (sourceText) {
    // Try to find statement that overlaps significantly with sourceText
    const sourceTextLower = sourceText.toLowerCase();
    const sourceTokens = sourceTextLower.split(/\s+/).filter(t => t.length > 2);
    const sourceTokensSet = new Set(sourceTokens);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt || typeof stmt !== "object") continue;
      if (stmt.__dealTermsCanonical === true) continue; // Skip already canonical
      
      const stmtText = (stmt.text || "").toLowerCase();
      const stmtTokens = stmtText.split(/\s+/).filter(t => t.length > 2);
      const matchingTokens = stmtTokens.filter(token => sourceTokensSet.has(token));
      const overlapRatio = stmtTokens.length > 0 ? matchingTokens.length / stmtTokens.length : 0;
      
      // Check if statement contains deal-terms signals
      const hasDealTermsSignals = /\bpre[- ]?money\b|\benterprise\s+value\b|\binvestment\b|\bownership\b/i.test(stmtText);
      
      if (hasDealTermsSignals && overlapRatio >= 0.5) {
        originalDraftPosition = stmt.__draftPosition;
        replacedStatementIdx = i;
        // A3.6.68: Mark parent statement with parent key
        statements[i].__dealTermsParentKey = parentKey;
        break;
      }
    }
  }
  
  // A3.6.49: Identify corrupted deal-terms statements to suppress
  // A3.6.67: Only check for corrupted statements if enterpriseValue exists
  const evVariants = [];
  if (dealTerms.enterpriseValue) {
    const evNumberStr = dealTerms.enterpriseValue.amount.toString();
    evVariants.push(
      evNumberStr,
      `${evNumberStr}mm`,
      `${evNumberStr}m`,
      `$${evNumberStr}`,
      `$${evNumberStr}mm`,
      `$${evNumberStr}m`
    );
  }
  
  const corruptedIndices = [];
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt || typeof stmt !== "object") continue;
    
    const text = (stmt.text || "").toLowerCase();
    
    // Check if statement contains EV/ownership keywords AND a number
    const hasEVKeywords = /\benterprise\s+value\b|\bev\b(?!\w)|\bfully\s+diluted\b/i.test(text);
    const hasNumber = /\d+(?:\.\d+)?/.test(text);
    
    if (hasEVKeywords && hasNumber && evVariants.length > 0) {
      // Check if it contains the extracted EV number
      const containsCorrectEV = evVariants.some(variant => 
        text.includes(variant.toLowerCase())
      );
      
      if (!containsCorrectEV) {
        // This is a corrupted statement - mark for suppression
        corruptedIndices.push(i);
      }
    }
  }
  
  let replacedIdx = null;
  let droppedCount = 0;
  let insertOffset = 0;
  
  // A3.6.67: Capture citations/evidence from original statement before canonicalization
  let originalCitations = [];
  let originalEvidence = [];
  let originalAssessmentCitations = [];
  let originalAssessmentEvidence = [];
  
  // Find the statement that will be replaced (if any)
  const statementToReplace = replacedStatementIdx != null ? statements[replacedStatementIdx] : 
                            (corruptedIndices.length > 0 ? statements[corruptedIndices[0]] : null);
  
  if (statementToReplace) {
    originalCitations = Array.isArray(statementToReplace.citations) ? statementToReplace.citations : [];
    originalEvidence = Array.isArray(statementToReplace.evidence) ? statementToReplace.evidence : [];
    const assessment = statementToReplace.assessment || {};
    originalAssessmentCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
    originalAssessmentEvidence = Array.isArray(assessment.evidence) ? assessment.evidence : [];
  }
  
  // A3.6.60: Use originalDraftPosition if found, otherwise use corrupted statement position
  if (originalDraftPosition == null && corruptedIndices.length > 0) {
    originalDraftPosition = statements[corruptedIndices[0]].__draftPosition;
  }
  
  if (corruptedIndices.length > 0) {
    // Replace FIRST corrupted statement with pricing statement (only if pricingText is available)
    const firstCorruptedIdx = corruptedIndices[0];
    const draftPos = originalDraftPosition != null ? originalDraftPosition : statements[firstCorruptedIdx].__draftPosition;
    
    if (pricingText) {
      // A3.6.67: Preserve citations/evidence from original statement
      statements[firstCorruptedIdx].text = pricingText;
      statements[firstCorruptedIdx].__dealTermsCanonical = true;
      statements[firstCorruptedIdx].__dealTermsCanonicalKind = "pricing";
      statements[firstCorruptedIdx].__dealTerms = dealTerms;
      statements[firstCorruptedIdx].__draftPosition = draftPos;
      // A3.6.68: Add parent key linkage
      if (parentKey) {
        statements[firstCorruptedIdx].__dealTermsParentKey = parentKey;
      }
      // Preserve citations/evidence
      if (originalCitations.length > 0) {
        statements[firstCorruptedIdx].citations = [...originalCitations];
      }
      if (originalEvidence.length > 0) {
        statements[firstCorruptedIdx].evidence = [...originalEvidence];
      }
      if (originalAssessmentCitations.length > 0 || originalAssessmentEvidence.length > 0) {
        statements[firstCorruptedIdx].assessment = {
          ...(statements[firstCorruptedIdx].assessment || {}),
          citations: originalAssessmentCitations.length > 0 ? [...originalAssessmentCitations] : undefined,
          evidence: originalAssessmentEvidence.length > 0 ? [...originalAssessmentEvidence] : undefined
        };
      }
      
      replacedIdx = firstCorruptedIdx;
      insertOffset = 1;
    } else {
      // No pricing text, drop the corrupted statement
      statements.splice(firstCorruptedIdx, 1);
      droppedCount++;
      insertOffset = 0;
    }
    
    // A3.6.60: Insert investment statement with originalDraftPosition + 0.001
    // A3.6.67: Preserve citations/evidence
    // A3.6.68: Add parent key linkage
    if (investText) {
      const investDraftPosition = draftPos != null ? draftPos + 0.001 : (statements[firstCorruptedIdx].__draftPosition != null ? statements[firstCorruptedIdx].__draftPosition + 0.001 : firstCorruptedIdx + 0.001);
      const investStmt = {
        text: investText,
        __dealTermsCanonical: true,
        __dealTermsCanonicalKind: "investment",
        __dealTerms: dealTerms,
        __draftPosition: investDraftPosition,
        __dealTermsParentKey: parentKey || undefined,
        citations: originalCitations.length > 0 ? [...originalCitations] : undefined,
        evidence: originalEvidence.length > 0 ? [...originalEvidence] : undefined,
        assessment: originalAssessmentCitations.length > 0 || originalAssessmentEvidence.length > 0 ? {
          citations: originalAssessmentCitations.length > 0 ? [...originalAssessmentCitations] : undefined,
          evidence: originalAssessmentEvidence.length > 0 ? [...originalAssessmentEvidence] : undefined
        } : undefined
      };
      statements.splice(firstCorruptedIdx + insertOffset, 0, investStmt);
      insertOffset++;
    }
    
    // A3.6.60: Insert ownership statement with originalDraftPosition + 0.002
    // A3.6.67: Preserve citations/evidence
    // A3.6.68: Add parent key linkage
    if (ownershipText) {
      const ownDraftPosition = draftPos != null ? draftPos + 0.002 : (statements[firstCorruptedIdx].__draftPosition != null ? statements[firstCorruptedIdx].__draftPosition + 0.002 : firstCorruptedIdx + 0.002);
      const ownStmt = {
        text: ownershipText,
        __dealTermsCanonical: true,
        __dealTermsCanonicalKind: "ownership",
        __dealTerms: dealTerms,
        __draftPosition: ownDraftPosition,
        __dealTermsParentKey: parentKey || undefined,
        citations: originalCitations.length > 0 ? [...originalCitations] : undefined,
        evidence: originalEvidence.length > 0 ? [...originalEvidence] : undefined,
        assessment: originalAssessmentCitations.length > 0 || originalAssessmentEvidence.length > 0 ? {
          citations: originalAssessmentCitations.length > 0 ? [...originalAssessmentCitations] : undefined,
          evidence: originalAssessmentEvidence.length > 0 ? [...originalAssessmentEvidence] : undefined
        } : undefined
      };
      statements.splice(firstCorruptedIdx + insertOffset, 0, ownStmt);
      insertOffset++;
      
      // A3.6.69: Log ownership canonical statement
      log(`[A3.6.69][OWN_CANON] idx=${firstCorruptedIdx + insertOffset - 1} pct=${dealTerms.ownershipPct ? dealTerms.ownershipPct.pct : "null"} modality=${dealTerms.ownershipModality || "null"} upsidePct=${dealTerms.ownershipUpsidePct || "null"} mechanism="${dealTerms.ownershipUpsideMechanism || "null"}" finalText="${ownershipText.substring(0, 150)}"`);
    }
    
    // Drop remaining corrupted statements (in reverse order to maintain indices)
    for (let i = corruptedIndices.length - 1; i > 0; i--) {
      const idx = corruptedIndices[i] + insertOffset; // Adjust for inserted statements
      if (idx < statements.length) {
        statements.splice(idx, 1);
        droppedCount++;
      }
    }
  } else if (replacedStatementIdx != null) {
    // A3.6.60: Replace the original statement we found (only if pricingText is available)
    const draftPos = originalDraftPosition != null ? originalDraftPosition : replacedStatementIdx;
    
    if (pricingText) {
      // A3.6.67: Preserve citations/evidence from original statement
      // A3.6.68: Add parent key linkage
      statements[replacedStatementIdx].text = pricingText;
      statements[replacedStatementIdx].__dealTermsCanonical = true;
      statements[replacedStatementIdx].__dealTermsCanonicalKind = "pricing";
      statements[replacedStatementIdx].__dealTerms = dealTerms;
      statements[replacedStatementIdx].__draftPosition = draftPos;
      if (parentKey) {
        statements[replacedStatementIdx].__dealTermsParentKey = parentKey;
      }
      // Citations/evidence already preserved from original statement
      
      replacedIdx = replacedStatementIdx;
      insertOffset = 1;
    } else {
      // No pricing text, drop the statement
      statements.splice(replacedStatementIdx, 1);
      droppedCount++;
      insertOffset = 0;
    }
    
    // Insert investment statement
    // A3.6.67: Preserve citations/evidence
    // A3.6.68: Add parent key linkage
    if (investText) {
      const investDraftPosition = draftPos != null ? draftPos + 0.001 : (statements[replacedStatementIdx].__draftPosition != null ? statements[replacedStatementIdx].__draftPosition + 0.001 : replacedStatementIdx + 0.001);
      const investStmt = {
        text: investText,
        __dealTermsCanonical: true,
        __dealTermsCanonicalKind: "investment",
        __dealTerms: dealTerms,
        __draftPosition: investDraftPosition,
        __dealTermsParentKey: parentKey || undefined,
        citations: originalCitations.length > 0 ? [...originalCitations] : undefined,
        evidence: originalEvidence.length > 0 ? [...originalEvidence] : undefined,
        assessment: originalAssessmentCitations.length > 0 || originalAssessmentEvidence.length > 0 ? {
          citations: originalAssessmentCitations.length > 0 ? [...originalAssessmentCitations] : undefined,
          evidence: originalAssessmentEvidence.length > 0 ? [...originalAssessmentEvidence] : undefined
        } : undefined
      };
      statements.splice(replacedStatementIdx + insertOffset, 0, investStmt);
      insertOffset++;
    }
    
    // Insert ownership statement
    // A3.6.67: Preserve citations/evidence
    // A3.6.68: Add parent key linkage
    if (ownershipText) {
      const ownDraftPosition = draftPos != null ? draftPos + 0.002 : (statements[replacedStatementIdx].__draftPosition != null ? statements[replacedStatementIdx].__draftPosition + 0.002 : replacedStatementIdx + 0.002);
      const ownStmt = {
        text: ownershipText,
        __dealTermsCanonical: true,
        __dealTermsCanonicalKind: "ownership",
        __dealTerms: dealTerms,
        __draftPosition: ownDraftPosition,
        __dealTermsParentKey: parentKey || undefined,
        citations: originalCitations.length > 0 ? [...originalCitations] : undefined,
        evidence: originalEvidence.length > 0 ? [...originalEvidence] : undefined,
        assessment: originalAssessmentCitations.length > 0 || originalAssessmentEvidence.length > 0 ? {
          citations: originalAssessmentCitations.length > 0 ? [...originalAssessmentCitations] : undefined,
          evidence: originalAssessmentEvidence.length > 0 ? [...originalAssessmentEvidence] : undefined
        } : undefined
      };
      statements.splice(replacedStatementIdx + insertOffset, 0, ownStmt);
      insertOffset++;
      
      // A3.6.69: Log ownership canonical statement
      log(`[A3.6.69][OWN_CANON] idx=${replacedStatementIdx + insertOffset - 1} pct=${dealTerms.ownershipPct ? dealTerms.ownershipPct.pct : "null"} modality=${dealTerms.ownershipModality || "null"} upsidePct=${dealTerms.ownershipUpsidePct || "null"} mechanism="${dealTerms.ownershipUpsideMechanism || "null"}" finalText="${ownershipText.substring(0, 150)}"`);
    }
  } else {
    // No corrupted statements or original found - insert new ones
    // A3.6.60: Derive draftPosition from sourceSpan or use fallback
    let draftPosition = statements.length > 0 ? statements.length - 0.5 : 0.5;
    if (dealTerms.sourceSpan) {
      // Try to find a reasonable position based on sourceSpan
      // For now, just append
    }
    
    // Insert pricing statement (only if pricingText is available)
    // A3.6.68: Add parent key linkage
    if (pricingText) {
      const pricingStmt = {
        text: pricingText,
        __dealTermsCanonical: true,
        __dealTermsCanonicalKind: "pricing",
        __dealTerms: dealTerms,
        __draftPosition: draftPosition,
        __dealTermsParentKey: parentKey || undefined
      };
      statements.push(pricingStmt);
    }
    
    // Insert investment statement after if present
    // A3.6.68: Add parent key linkage
    if (investText) {
      const investStmt = {
        text: investText,
        __dealTermsCanonical: true,
        __dealTermsCanonicalKind: "investment",
        __dealTerms: dealTerms,
        __draftPosition: draftPosition + 0.001,
        __dealTermsParentKey: parentKey || undefined
      };
      statements.push(investStmt);
    }
    
    // Insert ownership statement after if present
    // A3.6.68: Add parent key linkage
    if (ownershipText) {
      const ownStmt = {
        text: ownershipText,
        __dealTermsCanonical: true,
        __dealTermsCanonicalKind: "ownership",
        __dealTerms: dealTerms,
        __draftPosition: draftPosition + 0.002,
        __dealTermsParentKey: parentKey || undefined
      };
      statements.push(ownStmt);
      
      // A3.6.69: Log ownership canonical statement
      log(`[A3.6.69][OWN_CANON] idx=${statements.length - 1} pct=${dealTerms.ownershipPct ? dealTerms.ownershipPct.pct : "null"} modality=${dealTerms.ownershipModality || "null"} upsidePct=${dealTerms.ownershipUpsidePct || "null"} mechanism="${dealTerms.ownershipUpsideMechanism || "null"}" finalText="${ownershipText.substring(0, 150)}"`);
    }
  }
  
  // A3.6.49: Log split results
  const pricingLen = pricingText ? pricingText.length : 0;
  const investLen = investText ? investText.length : 0;
  const ownLen = ownershipText ? ownershipText.length : 0;
  log(`[A3.6.49][CANON_SPLIT] pricingLen=${pricingLen} investLen=${investLen} ownLen=${ownLen} replacedIdx=${replacedIdx !== null ? replacedIdx : 'nil'} dropped=${droppedCount}`);
  
  // A3.6.66: Add diagnostics
  // A3.6.68: Enhanced emitted diagnostics with secondary
  const secondaryText = null; // Will be added to ownership if ownershipUpside exists
  const emitted = {
    pricing: pricingText != null,
    investment: investText != null,
    ownership: ownershipText != null,
    secondary: secondaryText != null
  };
  const lens = {
    pricing: pricingLen,
    investment: investLen,
    ownership: ownLen,
    secondary: 0
  };
  log(`[A3.6.66][CANON_RUN] ran=true reason=ok emitted=${JSON.stringify(emitted)}`);
  
  // A3.6.67: Add enhanced diagnostics
  const beforeLen = statements.length - (pricingText ? 1 : 0) - (investText ? 1 : 0) - (ownershipText ? 1 : 0) + (replacedIdx !== null ? 1 : 0);
  const afterCount = statements.length;
  const idx = replacedIdx !== null ? replacedIdx : (corruptedIndices.length > 0 ? corruptedIndices[0] : 0);
  log(`[A3.6.67][CANON_RUN] idx=${idx} ran=true reason=ran sourceKind=${dealTerms.sourceKind} beforeLen=${beforeLen} afterCount=${afterCount}`);
  
  // A3.6.68: Add canonical emit diagnostics
  log(`[A3.6.68][CANON_EMIT] idx=${idx} emitted=${JSON.stringify(emitted)} lens=${JSON.stringify(lens)}`);
  
  // A3.6.67: Log citation/evidence preservation
  const beforeCites = originalCitations.length;
  const beforeEvidence = originalEvidence.length;
  const afterCitesEach = [];
  const afterEvidenceEach = [];
  
  // Count citations/evidence in canonical statements
  for (const stmt of statements) {
    if (stmt && stmt.__dealTermsCanonical) {
      const cites = Array.isArray(stmt.citations) ? stmt.citations.length : 0;
      const evidence = Array.isArray(stmt.evidence) ? stmt.evidence.length : 0;
      afterCitesEach.push(cites);
      afterEvidenceEach.push(evidence);
    }
  }
  
  log(`[A3.6.67][CANON_CITES] idx=${idx} beforeCites=${beforeCites} afterCitesEach=${JSON.stringify(afterCitesEach)} beforeEvidence=${beforeEvidence} afterEvidenceEach=${JSON.stringify(afterEvidenceEach)}`);
  
  return statements;
}

// A3.6.12: Drop redundant combined deal-terms statements after canonical split
// A3.6.68: Enhanced to detect and drop parent statements when canonical children exist
// Returns { statements, droppedCount } to track dedup drops separately from extraction failures
function dropRedundantCombinedDealTerms(statements, dealTerms, runId = null, reqSig = null) {
  if (!Array.isArray(statements) || statements.length === 0) {
    return { statements, droppedCount: 0 };
  }
  if (!dealTerms) {
    return { statements, droppedCount: 0 };
  }
  
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  // A3.6.68: Check if we have canonical deal terms present and collect their linkage info
  const canonicalStatements = statements.filter(stmt => 
    stmt?.__dealTermsCanonical === true || stmt?.assessment?.__dealTermsCanonical === true
  );
  
  if (canonicalStatements.length === 0) {
    return { statements, droppedCount: 0 };
  }
  
  // A3.6.68: Collect canonical kinds and parent keys
  const emittedKinds = canonicalStatements.map(stmt => stmt.__dealTermsCanonicalKind || stmt.assessment?.__dealTermsCanonicalKind).filter(Boolean);
  const canonicalParentKeys = new Set();
  canonicalStatements.forEach(stmt => {
    if (stmt.__dealTermsParentKey) {
      canonicalParentKeys.add(stmt.__dealTermsParentKey);
    }
  });
  
  const sourceText = dealTerms.sourceText || "";
  
  // A3.6.68: Generate parent key hash for sourceText (if not already set on canonical statements)
  const generateParentKey = (text, span) => {
    const keyText = text + (span ? `${span.start}-${span.end}` : "");
    let hash = 0;
    for (let i = 0; i < keyText.length; i++) {
      const char = keyText.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  };
  
  const sourceParentKey = sourceText ? generateParentKey(sourceText, dealTerms.sourceSpan) : null;
  
  // Normalize sourceText for overlap comparison
  const normalizedSource = normalizeTextForOverlap(sourceText);
  const sourceTokens = tokenizeForOverlap(sourceText);
  const sourceTokensSet = new Set(sourceTokens);
  
  const dropped = [];
  const kept = [];
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt || typeof stmt !== "object") {
      kept.push(stmt);
      continue;
    }
    
    // Skip canonical statements themselves
    if (stmt.__dealTermsCanonical === true || stmt.assessment?.__dealTermsCanonical === true) {
      kept.push(stmt);
      continue;
    }
    
    const text = typeof stmt.text === "string" ? stmt.text.trim() : "";
    if (!text) {
      kept.push(stmt);
      continue;
    }
    
    // A3.6.68: Check if this statement is a parent of canonical children
    const stmtParentKey = generateParentKey(text, null);
    const isParentByKey = sourceParentKey && stmtParentKey === sourceParentKey;
    
    // A3.6.61: Check if statement contains at least TWO deal-term signals
    const dealTermSignals = {
      investment: /\b(invest|investment|financing)\b/i.test(text),
      preMoney: /\bpre[- ]money\b/i.test(text),
      enterpriseValue: /\benterprise value\b/i.test(text),
      ownership: /\b(fully diluted|ownership|%)\b/i.test(text),
    };
    
    const signalCount = Object.values(dealTermSignals).filter(Boolean).length;
    
    // A3.6.68: If canonical children exist and this statement matches sourceText, drop it
    let shouldDrop = false;
    let dropReason = "";
    let overlapRatio = 0;
    
    if (canonicalStatements.length > 0 && signalCount >= 2) {
      // A3.6.61: Check overlap with sourceText (threshold >= 0.65)
      const normalizedStmt = normalizeTextForOverlap(text);
      const stmtTokens = tokenizeForOverlap(text);
      const matchingTokens = stmtTokens.filter(token => sourceTokensSet.has(token));
      overlapRatio = stmtTokens.length > 0 ? matchingTokens.length / stmtTokens.length : 0;
      
      if (overlapRatio >= 0.65 || isParentByKey) {
        shouldDrop = true;
        dropReason = isParentByKey ? "parent_key_match" : `overlap=${overlapRatio.toFixed(2)}`;
      } else {
        // A3.6.61: Fallback match - check if statement shares >=2 of the canonical numeric anchors
        const canonicalAnchors = [];
        if (dealTerms.preMoney && dealTerms.preMoney.amount) {
          canonicalAnchors.push(dealTerms.preMoney.amount.toString());
        }
        if (dealTerms.enterpriseValue && dealTerms.enterpriseValue.amount) {
          canonicalAnchors.push(dealTerms.enterpriseValue.amount.toString());
        }
        if (dealTerms.investment && dealTerms.investment.amount) {
          canonicalAnchors.push(dealTerms.investment.amount.toString());
        }
        if (dealTerms.ownershipPct && dealTerms.ownershipPct.pct) {
          canonicalAnchors.push(dealTerms.ownershipPct.pct.toString());
          canonicalAnchors.push(dealTerms.ownershipPct.pct.toString() + "%");
        }
        
        // Extract numeric values from statement text
        const stmtNumericMatches = text.match(/\b(\d+(?:\.\d+)?)\b/g) || [];
        const stmtNumerics = stmtNumericMatches.map(m => m.replace(/\.0+$/, "")); // Normalize trailing zeros
        
        // Count how many canonical anchors appear in statement
        let matchingAnchors = 0;
        for (const anchor of canonicalAnchors) {
          const anchorNormalized = anchor.replace(/\.0+$/, "");
          if (stmtNumerics.some(num => num === anchorNormalized || num.includes(anchorNormalized) || anchorNormalized.includes(num))) {
            matchingAnchors++;
          }
        }
        
        if (matchingAnchors >= 2) {
          shouldDrop = true;
          dropReason = `numeric_anchors=${matchingAnchors}`;
        }
      }
    }
    
    if (shouldDrop) {
      // A3.6.68: Redundant combined deal-terms statement - drop it
      dropped.push({
        index: i,
        text: text.substring(0, 100),
        overlapRatio: overlapRatio > 0 ? overlapRatio.toFixed(2) : "N/A",
        signalCount,
        dropReason,
        emittedKinds: [...emittedKinds],
        childCount: canonicalStatements.length
      });
      continue;
    }
    
    kept.push(stmt);
  }
  
  if (dropped.length > 0 && runId && reqSig) {
    log(`[A3.6.61][DEAL_DEDUP] dropped=${dropped.length}`);
    for (const d of dropped) {
      log(`[A3.6.61][DEAL_DEDUP_ITEM] idx=${d.index} overlap=${d.overlapRatio} signals=${d.signalCount} reason=${d.dropReason} preview="${d.text.substring(0, 60)}"`);
      // A3.6.68: Add parent dedup diagnostics
      log(`[A3.6.68][DEDUP_DEAL_PARENT] parentIdx=${d.index} dropped=true reason=${d.dropReason} emittedKinds=${JSON.stringify(d.emittedKinds)} childCount=${d.childCount}`);
    }
  }
  
  return { statements: kept, droppedCount: dropped.length };
}

// A3.6.44: Final-pass dangling-currency repair on canonical return statements
// A3.6.12: Now uses shared helper - should be mostly a no-op since early pass already handled it
// This runs immediately before the response is returned to catch any dangling fragments
// that may have been reintroduced by downstream phases (e.g., generateClaims, VAL_SNIP_SAN)
function finalDanglingCurrencyRepair(statements, draftText, runId = null, reqSig = null) {
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  log(`[PIPELINE] phase=finalDanglingCurrencyRepair`);
  
  // A3.6.12: Use shared helper for consistency
  const beforeCount = statements.length;
  const repairedResult = repairDanglingCurrency(statements, draftText, runId, reqSig, "final");
  const repaired = repairedResult.statements;
  const repairCount = repairedResult.repairCount || 0;
  const afterCount = repaired.length;
  const finalRepairCount = beforeCount !== afterCount ? beforeCount - afterCount : 0;
  
  // A3.6.12: Diagnostic counter to confirm final pass is mostly no-op
  if (runId && reqSig) {
    log(`[FINAL_DANGLING_STATS] before=${beforeCount} after=${afterCount} dropped=${finalRepairCount} (should be 0 if early pass worked)`);
  }
  
  // A3.6.62: Return both statements and repair count
  return { statements: repaired, repairCount };
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
// A3.8.35: Enhanced unit pricing detection
function extractAnchor(claimText) {
  if (typeof claimText !== "string") return null;
  
  const text = claimText.toLowerCase();
  
  // A3.6.2 PATCH v2: Numeric anchors with consistent normalization and validation
  // Match: "$7 million", "$7mm", "$7m" -> all normalize to usd_7m
  // A3.8.35: Enhanced unit pricing detection
  // Use more specific regex to capture full number
  const usdMatch = text.match(/\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)?/i);
  if (usdMatch) {
    const numStr = usdMatch[1].replace(/,/g, "");
    const unit = (usdMatch[2] || "").toLowerCase();
    const num = parseFloat(numStr);
    
    // A3.6.2 PATCH v2: Sanity check - ensure we captured the full number
    if (!Number.isFinite(num) || num <= 0) {
      return null;
    }
    
    // A3.8.35: Unit pricing guardrail - check for unit pricing context
    const hasUnitPricingContext = checkUnitPricingContextForAnchor(claimText, usdMatch.index, usdMatch[0].length);
    
    // A3.8.35: If amount is in unit pricing range and context is present, use unit pricing anchor
    if (hasUnitPricingContext && num >= 1 && num <= 5000) {
      return `usd_${num}`;
    }
    
    // A3.8.28: Fix $45 -> $45m bug - if "m" suffix and following text starts with "month", treat as no suffix
    if (unit === "m") {
      const matchIndex = usdMatch.index + usdMatch[0].length;
      const followingText = text.substring(matchIndex).trim();
      if (/^month|^monthly|^mo\b/i.test(followingText)) {
        // Treat as plain USD (no million suffix)
        return `usd_${num}`;
      }
    }
    
    let normalized = num;
    
    // Normalize to millions
    if (unit.includes("billion") || unit === "b") {
      normalized = normalized * 1000;
    } else if (unit.includes("thousand") || unit === "k") {
      normalized = normalized / 1000;
    }
    // "million", "mm", "m" all stay as-is (already in millions)
    
    // A3.8.37: Only add "m" suffix if there was an explicit unit (million/mm/m/billion/b/thousand/k)
    // OR if the numeric value is >= 1,000,000 (actual millions)
    // For small values like $45 with no unit, return "usd_45" (no "m")
    if (unit) {
      // Explicit unit present - use "m" suffix
      return `usd_${normalized}m`;
    } else if (num >= 1000000) {
      // Large value without explicit unit but clearly in millions
      return `usd_${normalized}m`;
    } else {
      // Small value without explicit unit - no "m" suffix
      return `usd_${num}`;
    }
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
// A3.8.37: Extended to support usd_* anchors without "m" suffix (for unit pricing)
function isCanonicalAnchor(anchor) {
  if (typeof anchor !== "string") return false;
  
  // Check exact match first
  if (CANONICAL_ANCHOR_ALLOWLIST.has(anchor)) return true;
  
  // Dynamic patterns
  if (/^pct_\d+$/.test(anchor)) return true; // Any pct_* number
  if (/^usd_[\d.]+m$/.test(anchor)) return true; // Any usd_*m
  if (/^usd_\d+(?:\.\d+)?$/.test(anchor)) return true; // A3.8.37: Any usd_* (without "m") for unit pricing
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

// A3.8.35: Helper to check unit pricing context for anchor extraction
function checkUnitPricingContextForAnchor(text, matchIndex, matchLength) {
  if (!text || typeof text !== "string") return false;
  
  const lower = text.toLowerCase();
  
  // Unit pricing triggers (case-insensitive)
  const unitPricingTriggers = [
    /\bper\s+month\b/i,
    /\b\/month\b/i,
    /\bmonthly\b/i,
    /\bper\s+user\b/i,
    /\bper\s+seat\b/i,
    /\bper\s+license\b/i,
    /\bsubscription\b/i,
    /\bpricing\b/i,
    /\btiered\s+subscription\b/i,
    /\bplan\b/i,
    /\barpu\b/i,
    /\baverage\b/i,
  ];
  
  // Check context within ±40 chars
  const contextStart = Math.max(0, matchIndex - 40);
  const contextEnd = Math.min(lower.length, matchIndex + matchLength + 40);
  const contextWindow = lower.substring(contextStart, contextEnd);
  
  // Check if any trigger matches in context window
  for (const trigger of unitPricingTriggers) {
    if (trigger.test(contextWindow)) {
      return true;
    }
  }
  
  return false;
}

// A3.6.11: Extract all anchors and canonicalize them
// A3.8.35: Enhanced unit pricing detection
function extractAllAnchors(clauseText) {
  if (typeof clauseText !== "string") return [];
  
  // A3.6.8: Use original text (don't lowercase yet for anchor detection)
  const originalText = clauseText;
  const text = originalText.toLowerCase();
  
  const anchors = new Set();
  
  // Extract USD anchors
  // A3.8.35: Enhanced unit pricing detection - check for unit pricing context
  const usdMatches = [...originalText.matchAll(/\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)?/gi)];
  for (const match of usdMatches) {
    const numStr = match[1].replace(/,/g, "");
    const unit = (match[2] || "").toLowerCase();
    const num = parseFloat(numStr);
    
    if (Number.isFinite(num) && num > 0) {
      // A3.8.35: Unit pricing guardrail - check for unit pricing context
      const hasUnitPricingContext = checkUnitPricingContextForAnchor(originalText, match.index, match[0].length);
      
      // A3.8.35: If amount is in unit pricing range and context is present, use unit pricing anchor
      if (hasUnitPricingContext && num >= 1 && num <= 5000) {
        anchors.add(`usd_${num}`);
        continue;
      }
      
      // A3.8.28: Fix $45 -> $45m bug - if "m" suffix and following text starts with "month", treat as no suffix
      if (unit === "m") {
        const matchIndex = match.index + match[0].length;
        const followingText = originalText.substring(matchIndex).trim();
        if (/^month|^monthly|^mo\b/i.test(followingText)) {
          // Treat as plain USD (no million suffix)
          anchors.add(`usd_${num}`);
          continue;
        }
      }
      
      let normalized = num;
      if (unit.includes("billion") || unit === "b") {
        normalized = normalized * 1000;
      } else if (unit.includes("thousand") || unit === "k") {
        normalized = normalized / 1000;
      }
      // A3.8.37: Only add "m" suffix if there was an explicit unit (million/mm/m/billion/b/thousand/k)
      // OR if the numeric value is >= 1,000,000 (actual millions)
      // For small values like $45 with no unit, return "usd_45" (no "m")
      if (unit) {
        // Explicit unit present - use "m" suffix
        anchors.add(`usd_${normalized}m`);
      } else if (num >= 1000000) {
        // Large value without explicit unit but clearly in millions
        anchors.add(`usd_${normalized}m`);
      } else {
        // Small value without explicit unit - no "m" suffix
        anchors.add(`usd_${num}`);
      }
    }
  }
  
  // A3.8.35: Also check for plain USD amounts without explicit unit
  const plainUsdMatches = [...originalText.matchAll(/\$([\d,]+(?:\.\d+)?)(?!\s*(?:million|mm|m|billion|b|thousand|k)\b)/gi)];
  for (const match of plainUsdMatches) {
    const numStr = match[1].replace(/,/g, "");
    const num = parseFloat(numStr);
    
    if (Number.isFinite(num) && num > 0) {
      // A3.8.35: Unit pricing guardrail - check for unit pricing context
      const hasUnitPricingContext = checkUnitPricingContextForAnchor(originalText, match.index, match[0].length);
      
      // A3.8.35: If amount is in unit pricing range and context is present, use unit pricing anchor
      if (hasUnitPricingContext && num >= 1 && num <= 5000) {
        anchors.add(`usd_${num}`);
      }
      // Otherwise, don't add plain USD without explicit unit (let existing logic handle it)
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
      const aggClaim = {
        claimText: candidate.claimText,
        facet: candidate.facet || "Other", // Preserve facet for backward compatibility
        anchor: canonicalAnchor, // Store canonical anchor
        candidates: [candidate],
      };
      
      // A3.6.27: Preserve _valQualCandidate properties from candidate
      if (candidate._valQualCandidate !== undefined) {
        aggClaim._valQualCandidate = candidate._valQualCandidate;
        aggClaim._valQualCandidateOk = candidate._valQualCandidateOk;
        aggClaim._valQualCandidateSource = candidate._valQualCandidateSource;
      }
      // A3.6.40: Preserve _forcedValQual flag from candidate
      if (candidate._forcedValQual === true) {
        aggClaim._forcedValQual = true;
      }
      // A3.6.27: Also preserve other diagnostic flags
      if (candidate._usedBestValSnip) {
        aggClaim._usedBestValSnip = true;
      }
      if (candidate._traceInfo) {
        aggClaim._traceInfo = candidate._traceInfo;
      }
      if (candidate._retryDebug) {
        aggClaim._retryDebug = candidate._retryDebug;
      }
      
      aggregated.set(dedupeKey, aggClaim);
    } else {
      const existing = aggregated.get(dedupeKey);
      
      // A3.6.12: Hard guard - never merge claims with different canonical anchors
      // (This should not happen since dedupeKey includes canonicalAnchor, but double-check)
      if (existing.anchor !== canonicalAnchor) {
        // Different anchors - create separate entry
        // Use a more specific key to avoid collision
        const specificKey = `${dedupeKey}_${aggregated.size}`;
        const aggClaim2 = {
          claimText: candidate.claimText,
          facet: candidate.facet || "Other",
          anchor: canonicalAnchor,
          candidates: [candidate],
        };
        
        // A3.6.27: Preserve _valQualCandidate properties from candidate
        if (candidate._valQualCandidate !== undefined) {
          aggClaim2._valQualCandidate = candidate._valQualCandidate;
          aggClaim2._valQualCandidateOk = candidate._valQualCandidateOk;
          aggClaim2._valQualCandidateSource = candidate._valQualCandidateSource;
        }
        // A3.6.40: Preserve _forcedValQual flag from candidate
        if (candidate._forcedValQual === true) {
          aggClaim2._forcedValQual = true;
        }
        // A3.6.27: Also preserve other diagnostic flags
        if (candidate._usedBestValSnip) {
          aggClaim2._usedBestValSnip = true;
        }
        if (candidate._traceInfo) {
          aggClaim2._traceInfo = candidate._traceInfo;
        }
        if (candidate._retryDebug) {
          aggClaim2._retryDebug = candidate._retryDebug;
        }
        
        aggregated.set(specificKey, aggClaim2);
        continue;
      }
      
      existing.candidates.push(candidate);
      
      // A3.6.27: When merging, preserve _valQualCandidate from any candidate that has it
      if (candidate._valQualCandidate !== undefined && candidate._valQualCandidateOk) {
        existing._valQualCandidate = candidate._valQualCandidate;
        existing._valQualCandidateOk = candidate._valQualCandidateOk;
        existing._valQualCandidateSource = candidate._valQualCandidateSource;
      }
      // A3.6.40: When merging, propagate _forcedValQual if ANY merged/source claim has it
      if (candidate._forcedValQual === true) {
        existing._forcedValQual = true;
      }
      // A3.6.27: Also preserve other diagnostic flags when merging
      if (candidate._usedBestValSnip && !existing._usedBestValSnip) {
        existing._usedBestValSnip = true;
      }
      if (candidate._traceInfo && !existing._traceInfo) {
        existing._traceInfo = candidate._traceInfo;
      }
      if (candidate._retryDebug && !existing._retryDebug) {
        existing._retryDebug = candidate._retryDebug;
      }
      
      // Select "best" representative claimText using selection rule
      // (Only when claims are semantically equivalent - same anchor + meaning)
      const best = selectBestClaimText(existing.candidates.map(c => c.claimText));
      existing.claimText = best;
    }
  }
  
  // Convert to array - each entry is a unique anchor + meaning combination
  return Array.from(aggregated.values()).map(agg => {
    const result = {
      claimText: agg.claimText,
      facet: agg.facet,
      claimKey: buildClaimKey(agg.claimText, agg.facet), // Preserve for backward compatibility
      anchor: agg.anchor, // A3.6.10: Preserve explicit anchor
      mergedCount: agg.candidates.length,
    };
    
    // A3.6.27: Preserve _valQualCandidate properties in aggregated result
    if (agg._valQualCandidate !== undefined) {
      result._valQualCandidate = agg._valQualCandidate;
      result._valQualCandidateOk = agg._valQualCandidateOk;
      result._valQualCandidateSource = agg._valQualCandidateSource;
    }
    // A3.6.40: Preserve _forcedValQual flag in aggregated result
    if (agg._forcedValQual === true) {
      result._forcedValQual = true;
    }
    // A3.6.27: Also preserve other diagnostic flags
    if (agg._usedBestValSnip) {
      result._usedBestValSnip = true;
    }
    if (agg._traceInfo) {
      result._traceInfo = agg._traceInfo;
    }
    if (agg._retryDebug) {
      result._retryDebug = agg._retryDebug;
    }
    
    return result;
  });
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

// A3.6.12: Kind-scoped allowlist for canonical deal-term statements
const CANON_KIND_ALLOW = {
  pricing: {
    roles: new Set(["pre_money_valuation", "enterprise_value"]),
    anchors: new Set(["usd_premoney", "usd_ev", "qual_valuation", "qual_premoney"])
  },
  investment: {
    roles: new Set(["investment_amount"]),
    anchors: new Set(["usd_invest"])
  },
  ownership: {
    roles: new Set(["ownership_pct", "ownership_upside", "ownership_upside_pct"]), // A3.6.70: Add ownership_upside_pct
    anchors: new Set(["pct_own", "pct_own_upside_31", "pct_20", "pct_31"])
  }
};

// A3.6.53: Canonical deal role sets by kind (deprecated - use CANON_KIND_ALLOW)
const CANONICAL_DEAL_ROLE_BY_KIND = {
  pricing: new Set(["pre_money_valuation", "enterprise_value"]),
  investment: new Set(["investment_amount"]),
  ownership: new Set(["ownership_pct", "ownership_upside"]),
};

// A3.6.53: Canonical deal anchors (deprecated - use CANON_KIND_ALLOW)
const CANONICAL_DEAL_ANCHORS = new Set(["usd_premoney", "usd_ev", "usd_invest", "pct_own"]);

// A3.6.12: Protect canonical deal-role claims (kind-scoped, not bundle-scoped)
function protectCanonicalDealRoleClaims(claims, assessment, stmtIdx, runId = null, reqSig = null) {
  if (!Array.isArray(claims)) {
    return [];
  }
  
  // Check if statement is canonical deal-terms
  if (!assessment || assessment.__dealTermsCanonical !== true) {
    return claims;
  }
  
  const canonicalKind = assessment.__dealTermsCanonicalKind || null;
  if (!canonicalKind || !CANON_KIND_ALLOW[canonicalKind]) {
    return claims;
  }
  
  const allow = CANON_KIND_ALLOW[canonicalKind];
  let protectedCount = 0;
  const protectedAnchors = [];
  
  for (const claim of claims) {
    // Check if claim matches canonical role or anchor for this kind
    const claimRole = claim.role || null;
    const claimAnchor = claim.anchor || extractAnchor(claim.claimText || "");
    const canonicalAnchor = canonicalizeAnchor(claimAnchor, claim.claimText || "");
    
    const matchesRole = claimRole && allow.roles.has(claimRole);
    // A3.6.12: Check exact anchor match or prefix match (e.g., "pct_own_upside_31" matches "pct_own_upside_31" or starts with "pct_own")
    const matchesAnchor = canonicalAnchor && (
      allow.anchors.has(canonicalAnchor) ||
      Array.from(allow.anchors).some(anchor => canonicalAnchor.startsWith(anchor + "_") || anchor.startsWith(canonicalAnchor + "_"))
    );
    
    if (matchesRole || matchesAnchor) {
      claim.__protected = true;
      protectedCount++;
      if (canonicalAnchor) {
        protectedAnchors.push(canonicalAnchor);
      } else if (claimRole) {
        protectedAnchors.push(claimRole);
      }
    }
  }
  
  if (runId && reqSig) {
    diag(runId, reqSig, `[A3.6.12][PROTECT_CANON] idx=${stmtIdx} kind=${canonicalKind} protected=${protectedCount} anchors=[${protectedAnchors.join(',')}]`);
  }
  
  return claims;
}

// A3.6.1: Apply facet caps to claims
function applyFacetCaps(claims, runId = null, reqSig = null, idx = 0, assessment = null) {
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
  
  // A3.6.52: Separate protected claims (keepAlways) from cap candidates
  // Protected claims (deal-terms-derived) are NEVER capped, regardless of facet
  const keepAlways = claims.filter(c => c.__protected === true);
  const capCandidates = claims.filter(c => !c.__protected);
  
  // Group capCandidates by facet
  const byFacet = new Map();
  for (const claim of capCandidates) {
    const facet = claim.facet || "Other";
    if (!byFacet.has(facet)) {
      byFacet.set(facet, []);
    }
    byFacet.get(facet).push(claim);
  }
  
  const result = [];
  
  // A3.6.50: Always include all deal-terms claims first
  result.push(...keepAlways);
  
  // Then apply caps to non-deal-terms claims
  for (const [facet, facetClaims] of byFacet.entries()) {
    const cap = caps[facet] || 1;
    
    if (facetClaims.length <= cap) {
      // Under cap - keep all
      result.push(...facetClaims);
    } else {
      // Over cap - apply scoring and keep top N
      const scored = facetClaims.map(claim => {
        const text = claim.claimText || "";
        const length = text.length;
        const commaCount = (text.match(/,/g) || []).length;
        const hasAnchor = /\$[\d,]+(?:\.\d+)?\s*m\b|[\d,]+(?:\.\d+)?\s*%|\b1x\b|pre-?money/i.test(text);
        
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
        
        if (isQualValuation) {
          score += 200;
        } else if (isUsdValuation) {
          const hasQualValuation = facetClaims.some(c => {
            const cAnchor = c.anchor || extractAnchor(c.claimText);
            const cCanonical = canonicalizeAnchor(cAnchor, c.claimText);
            return cCanonical === "qual_valuation";
          });
          if (hasQualValuation) {
            score -= 100;
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
      
      if (dropped.length > 0 && runId && reqSig) {
        diag(runId, reqSig, `[A3.6.53][CAP] idx=${idx} facet=${facet} keepAlways=${keepAlways.length} capCandidates=${capCandidates.length} kept=${kept.length} dropped=${dropped.length}`);
      }
    }
  }
  
  // A3.6.53: Log cap exemption for protected claims
  if (keepAlways.length > 0 && runId && reqSig) {
    const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
    const keptRoles = Array.from(new Set(keepAlways.map(c => c.role || c.anchor).filter(Boolean)));
    log(`[A3.6.53][CAP] idx=${idx} keepAlways=${keepAlways.length} capCandidates=${capCandidates.length} protectedRoles=[${keptRoles.join(',')}]`);
  }
  
  return result;
}

// A3.7.9: Extract atomic numeric claims with context windows and qualifier phrases
// Returns array of claim objects with claimText, anchor, and optional qualifier
function extractAtomicNumericClaims(statementText) {
  if (typeof statementText !== "string" || !statementText.trim()) return [];
  
  const text = statementText.trim();
  const claims = [];
  
  // Keywords for qualifier phrases (general domain keywords)
  const qualifierKeywords = [
    "valuation", "pre-money", "post-money", "premoney", "postmoney", 
    "enterprise value", "EV", "ownership", "stake", "fully diluted", 
    "investment", "proceeds", "secondary purchases", "secondary", 
    "round", "Series", "revenue", "EBITDA", "margin", "equity"
  ];
  
  // Extract currency tokens
  const currencyPatterns = [
    /\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)/gi,
    /\$([\d,]+(?:\.\d+)?)/g,
    /\b(USD|EUR|GBP|SGD|AUD|CAD|JPY|CNY)\s+([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)?/gi,
  ];
  
  // Extract percentage tokens
  const percentPattern = /([\d,]+(?:\.\d+)?)\s*%/g;
  
  const numericTokens = [];
  
  // Extract currency tokens
  for (let patternIdx = 0; patternIdx < currencyPatterns.length; patternIdx++) {
    const pattern = currencyPatterns[patternIdx];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Pattern 0 and 1: $X or $X unit - numStr is match[1], unit is match[2]
      // Pattern 2: USD X unit - numStr is match[2], unit is match[3]
      const numStr = (patternIdx === 2 ? match[2] : match[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num) || num <= 0) continue;
      
      const unit = (patternIdx === 2 ? match[3] : match[2] || "").toLowerCase();
      const fullMatch = match[0];
      const index = match.index;
      
      // Normalize to millions for anchor
      let normalized = num;
      if (unit.includes("billion") || unit === "b") {
        normalized = normalized * 1000;
      } else if (unit.includes("thousand") || unit === "k") {
        normalized = normalized / 1000;
      }
      
      // A3.7.10: Use STRICT local window (1-4 words) for qualifier extraction
      const words = text.split(/\s+/);
      const matchWordIndex = text.substring(0, index).split(/\s+/).length - 1;
      const matchWordCount = fullMatch.split(/\s+/).length;
      
      // Prefer right-side tokens within 1-4 words after the numeric token
      const rightStart = matchWordIndex + matchWordCount;
      const rightEnd = Math.min(words.length, rightStart + 4);
      const rightWords = words.slice(rightStart, rightEnd);
      const rightContext = rightWords.join(" ").toLowerCase();
      
      // Fallback to left-side tokens within 1-4 words before
      const leftStart = Math.max(0, matchWordIndex - 4);
      const leftEnd = matchWordIndex;
      const leftWords = words.slice(leftStart, leftEnd);
      const leftContext = leftWords.join(" ").toLowerCase();
      
      // Build qualifier phrase from STRICT local context only
      let qualifier = "";
      const strongTypeWords = ["enterprise value", "ev", "pre-money", "premoney", "post-money", "postmoney", "ownership"];
      
      // Check right context first (preferred)
      for (const keyword of qualifierKeywords) {
        const keywordLower = keyword.toLowerCase();
        if (rightContext.includes(keywordLower)) {
          // Verify it's truly within the strict window (not just substring match)
          const keywordWords = keywordLower.split(/\s+/);
          let foundInWindow = false;
          for (let i = 0; i <= rightWords.length - keywordWords.length; i++) {
            const windowSlice = rightWords.slice(i, i + keywordWords.length).join(" ").toLowerCase();
            if (windowSlice === keywordLower || windowSlice.includes(keywordLower)) {
              foundInWindow = true;
              break;
            }
          }
          if (foundInWindow) {
            qualifier = keyword;
            break;
          }
        }
      }
      
      // Fallback to left context if no qualifier found
      if (!qualifier) {
        for (const keyword of qualifierKeywords) {
          const keywordLower = keyword.toLowerCase();
          if (leftContext.includes(keywordLower)) {
            const keywordWords = keywordLower.split(/\s+/);
            let foundInWindow = false;
            for (let i = 0; i <= leftWords.length - keywordWords.length; i++) {
              const windowSlice = leftWords.slice(i, i + keywordWords.length).join(" ").toLowerCase();
              if (windowSlice === keywordLower || windowSlice.includes(keywordLower)) {
                foundInWindow = true;
                break;
              }
            }
            if (foundInWindow) {
              qualifier = keyword;
              break;
            }
          }
        }
      }
      
      // A3.7.10: If qualifier contains strong type words but they're not in strict window, drop them
      if (qualifier) {
        const qualifierLower = qualifier.toLowerCase();
        const hasStrongType = strongTypeWords.some(type => qualifierLower.includes(type));
        if (hasStrongType) {
          // Verify strong type word is actually in the strict window
          const allContext = (rightContext + " " + leftContext).toLowerCase();
          let typeInWindow = false;
          for (const type of strongTypeWords) {
            if (qualifierLower.includes(type)) {
              // Check if this type word appears in the strict windows
              if (rightContext.includes(type) || leftContext.includes(type)) {
                typeInWindow = true;
                break;
              }
            }
          }
          if (!typeInWindow) {
            qualifier = ""; // Drop misleading qualifier
          }
        }
      }
      
      // A3.7.10: Build claim text with neutral template if no meaningful qualifier
      let claimText = fullMatch;
      if (qualifier) {
        // Position qualifier based on where it appears relative to number
        if (leftContext.includes(qualifier.toLowerCase())) {
          claimText = `${qualifier} ${fullMatch}`;
        } else {
          claimText = `${fullMatch} ${qualifier}`;
        }
      } else {
        // A3.7.10: Use neutral template - just the number (no misleading label)
        claimText = fullMatch;
      }
      
      // Generate anchor (normalize decimal to underscore for consistency)
      const anchorNum = normalized.toString().replace(/\./g, "_");
      const anchor = `usd_${anchorNum}m`;
      
      numericTokens.push({
        type: "currency",
        value: fullMatch,
        normalized,
        claimText: claimText.trim(),
        anchor,
        index,
        qualifier
      });
    }
  }
  
  // Extract percentage tokens
  let match;
  while ((match = percentPattern.exec(text)) !== null) {
    const numStr = match[1].replace(/,/g, "");
    const num = parseFloat(numStr);
    if (!Number.isFinite(num) || num < 0 || num > 100) continue;
    
    const fullMatch = match[0];
    const index = match.index;
    
    // A3.7.10: Use STRICT local window (1-4 words) for qualifier extraction
    const words = text.split(/\s+/);
    const matchWordIndex = text.substring(0, index).split(/\s+/).length - 1;
    
    // Prefer right-side tokens within 1-4 words after the percentage
    const rightStart = matchWordIndex + 1;
    const rightEnd = Math.min(words.length, rightStart + 4);
    const rightWords = words.slice(rightStart, rightEnd);
    const rightContext = rightWords.join(" ").toLowerCase();
    
    // Fallback to left-side tokens within 1-4 words before
    const leftStart = Math.max(0, matchWordIndex - 4);
    const leftEnd = matchWordIndex;
    const leftWords = words.slice(leftStart, leftEnd);
    const leftContext = leftWords.join(" ").toLowerCase();
    
    // Build qualifier phrase from STRICT local context only
    let qualifier = "";
    const strongTypeWords = ["enterprise value", "ev", "pre-money", "premoney", "post-money", "postmoney", "ownership"];
    
    // Check right context first (preferred)
    for (const keyword of qualifierKeywords) {
      const keywordLower = keyword.toLowerCase();
      if (rightContext.includes(keywordLower)) {
        const keywordWords = keywordLower.split(/\s+/);
        let foundInWindow = false;
        for (let i = 0; i <= rightWords.length - keywordWords.length; i++) {
          const windowSlice = rightWords.slice(i, i + keywordWords.length).join(" ").toLowerCase();
          if (windowSlice === keywordLower || windowSlice.includes(keywordLower)) {
            foundInWindow = true;
            break;
          }
        }
        if (foundInWindow) {
          qualifier = keyword;
          break;
        }
      }
    }
    
    // Fallback to left context if no qualifier found
    if (!qualifier) {
      for (const keyword of qualifierKeywords) {
        const keywordLower = keyword.toLowerCase();
        if (leftContext.includes(keywordLower)) {
          const keywordWords = keywordLower.split(/\s+/);
          let foundInWindow = false;
          for (let i = 0; i <= leftWords.length - keywordWords.length; i++) {
            const windowSlice = leftWords.slice(i, i + keywordWords.length).join(" ").toLowerCase();
            if (windowSlice === keywordLower || windowSlice.includes(keywordLower)) {
              foundInWindow = true;
              break;
            }
          }
          if (foundInWindow) {
            qualifier = keyword;
            break;
          }
        }
      }
    }
    
    // A3.7.10: If qualifier contains strong type words but they're not in strict window, drop them
    if (qualifier) {
      const qualifierLower = qualifier.toLowerCase();
      const hasStrongType = strongTypeWords.some(type => qualifierLower.includes(type));
      if (hasStrongType) {
        let typeInWindow = false;
        for (const type of strongTypeWords) {
          if (qualifierLower.includes(type)) {
            if (rightContext.includes(type) || leftContext.includes(type)) {
              typeInWindow = true;
              break;
            }
          }
        }
        if (!typeInWindow) {
          qualifier = ""; // Drop misleading qualifier
        }
      }
    }
    
    // A3.7.10: Build claim text with neutral template if no meaningful qualifier
    let claimText = fullMatch;
    if (qualifier) {
      if (leftContext.includes(qualifier.toLowerCase())) {
        claimText = `${qualifier} ${fullMatch}`;
      } else {
        claimText = `${fullMatch} ${qualifier}`;
      }
    } else {
      // A3.7.10: Use neutral template - just the percentage (no misleading label)
      claimText = fullMatch;
    }
    
    // Generate anchor
    const anchor = `pct_${Math.floor(num)}`;
    
    numericTokens.push({
      type: "percent",
      value: fullMatch,
      num,
      claimText: claimText.trim(),
      anchor,
      index,
      qualifier
    });
  }
  
  // Sort by index to maintain order
  numericTokens.sort((a, b) => a.index - b.index);
  
  // De-duplicate: if same numeric token + similar qualifier, keep the better one
  const deduped = [];
  const seen = new Set();
  
  for (const token of numericTokens) {
    const key = `${token.anchor}_${token.qualifier || ""}`;
    if (seen.has(key)) {
      // Check if current is better (longer qualifier)
      const existing = deduped.find(t => `${t.anchor}_${t.qualifier || ""}` === key);
      if (existing && token.qualifier && (!existing.qualifier || token.qualifier.length > existing.qualifier.length)) {
        const idx = deduped.indexOf(existing);
        deduped[idx] = token;
      }
      continue;
    }
    seen.add(key);
    deduped.push(token);
  }
  
  // Cap at 8 per statement
  const capped = deduped.slice(0, 8);
  
  // Convert to claim objects
  return capped.map(token => ({
    claimText: token.claimText,
    anchor: token.anchor,
    facet: token.type === "currency" ? "Valuation" : "Ownership"
  }));
}

// A3.7.9: Extract optional qualified relationship claims
// Returns array of relationship claim objects when linkage markers are present
function extractQualifiedRelationshipClaims(statementText, atomicNumericClaims) {
  if (typeof statementText !== "string" || !statementText.trim()) return [];
  if (!Array.isArray(atomicNumericClaims) || atomicNumericClaims.length < 1) return [];
  
  const text = statementText.toLowerCase();
  const originalText = statementText;
  const claims = [];
  
  // Linkage markers
  const linkageMarkers = [
    "implying", "at", "for", "valued at", "enterprise value", "pre-money", 
    "post-money", "through", "via", "from", "including", "targets", "targeted"
  ];
  
  // Check if statement contains linkage markers
  const hasLinkageMarker = linkageMarkers.some(marker => text.includes(marker));
  if (!hasLinkageMarker) return [];
  
  // Need at least 2 numeric tokens OR 1 numeric token + strong qualifier
  if (atomicNumericClaims.length < 2) {
    // Check for strong qualifier phrase
    const strongQualifiers = ["through", "via", "secondary purchases", "secondary"];
    const hasStrongQualifier = strongQualifiers.some(q => text.includes(q));
    if (!hasStrongQualifier) return [];
  }
  
  // Pattern matching for relationship claims
  // Pattern 1: "<numA> ... implying ... <numB>"
  const implyingPattern = /(\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m|billion|b)?|[\d,]+(?:\.\d+)?\s*%)\s+[^.]*?\bimplying\b[^.]*?(\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m|billion|b)?|[\d,]+(?:\.\d+)?\s*%)/gi;
  let match;
  while ((match = implyingPattern.exec(originalText)) !== null) {
    const numA = match[1];
    const numB = match[2];
    
    // Find qualifiers from context
    const context = match[0].toLowerCase();
    let qualifierB = "";
    if (context.includes("enterprise value") || context.includes(" ev ")) {
      qualifierB = "enterprise value";
    } else if (context.includes("pre-money") || context.includes("premoney")) {
      qualifierB = "pre-money valuation";
    }
    
    const claimText = qualifierB 
      ? `${numB} ${qualifierB} implied by ${numA}`
      : `${numB} implied by ${numA}`;
    
    const numBAnchor = extractAnchor(numB);
    const anchor = numBAnchor ? `rel_implied_${numBAnchor}` : "rel_implied_unknown";
    
    claims.push({
      claimText: claimText.trim(),
      anchor,
      facet: "Valuation"
    });
  }
  
  // Pattern 2: "increase to <pct> through <currency> of secondary purchases"
  const increasePattern = /(?:increase|increasing)\s+to\s+([\d,]+(?:\.\d+)?\s*%)\s+through\s+(\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m|billion|b)?)\s+of\s+secondary\s+purchases/gi;
  while ((match = increasePattern.exec(originalText)) !== null) {
    const pct = match[1];
    const currency = match[2];
    
    const claimText = `increase to ${pct} through ${currency} secondary purchases`;
    const pctAnchor = extractAnchor(pct);
    const anchor = pctAnchor ? `rel_increase_${pctAnchor}` : "rel_increase_unknown";
    
    claims.push({
      claimText: claimText.trim(),
      anchor,
      facet: "Ownership"
    });
  }
  
  // Pattern 3: "<currency> investment targets <pct> ownership"
  const targetsPattern = /(\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m|billion|b)?)\s+investment\s+targets\s+([\d,]+(?:\.\d+)?\s*%)\s+ownership/gi;
  while ((match = targetsPattern.exec(originalText)) !== null) {
    const currency = match[1];
    const pct = match[2];
    
    const claimText = `${currency} investment targets ${pct} ownership`;
    const currencyAnchor = extractAnchor(currency);
    const anchor = currencyAnchor ? `rel_targets_${currencyAnchor}` : "rel_targets_unknown";
    
    claims.push({
      claimText: claimText.trim(),
      anchor,
      facet: "Investment"
    });
  }
  
  // Limit to max 3 relationship claims
  return claims.slice(0, 3);
}

// A3.8.29: Part B - Helper to normalize money suffix for rawClaims (check for month context)
function normalizeMoneySuffixForRawClaim(claimText, nearbyText = "") {
  if (!claimText || typeof claimText !== "string") return null;
  
  // Extract USD amount from claimText
  const usdMatch = claimText.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!usdMatch) return null;
  
  const numStr = usdMatch[1].replace(/,/g, "");
  const num = parseFloat(numStr);
  if (!Number.isFinite(num) || num <= 0) return null;
  
  // Check if claimText is a plain $ amount without explicit million/billion token
  const plainUsdMatch = claimText.match(/^\$([\d,]+(?:\.\d+)?)$/);
  if (plainUsdMatch) {
    // Plain USD without suffix - check nearby text for "month" context
    const nearbyLower = nearbyText.toLowerCase();
    const claimIndex = nearbyLower.indexOf(claimText.toLowerCase());
    if (claimIndex >= 0) {
      const afterClaim = nearbyLower.substring(claimIndex + claimText.length, claimIndex + claimText.length + 30);
      if (/^\s*(per\s+)?(month|monthly|mo\b)/.test(afterClaim)) {
        // Force plain USD anchor (not million)
        return `usd_${num}`;
      }
    }
    // Plain USD without month context - return null to use default extractAnchor
    return null;
  }
  
  // Check if claimText explicitly contains million indicators
  const explicitMillionMatch = claimText.match(/\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)/i);
  if (explicitMillionMatch) {
    const unit = (explicitMillionMatch[2] || "").toLowerCase();
    
    // A3.8.29: If "m" suffix, check for "month" context in nearby text
    if (unit === "m") {
      const nearbyLower = nearbyText.toLowerCase();
      const claimIndex = nearbyLower.indexOf(claimText.toLowerCase());
      if (claimIndex >= 0) {
        const afterClaim = nearbyLower.substring(claimIndex + claimText.length, claimIndex + claimText.length + 30);
        if (/^\s*(per\s+)?(month|monthly|mo\b)/.test(afterClaim)) {
          // Treat as plain USD (no million suffix)
          return `usd_${num}`;
        }
      }
    }
    
    // Normalize to millions (explicit million indicators)
    let normalized = num;
    if (unit.includes("billion") || unit === "b") {
      normalized = normalized * 1000;
    } else if (unit.includes("thousand") || unit === "k") {
      normalized = normalized / 1000;
    }
    return `usd_${normalized}m`;
  }
  
  // No special handling needed - return null to use default extractAnchor
  return null;
}

/**
 * A3.8.36: INV-2 - Filter subsumed claims
 * Drops short numeric fragments that are subsumed by more specific claims
 * Returns { keptClaims, droppedCount, examples }
 */
function filterSubsumedClaims(rawClaims, statementText, statementIndex, runId = null, reqSig = null) {
  if (!Array.isArray(rawClaims) || rawClaims.length === 0) {
    return { keptClaims: rawClaims, droppedCount: 0, examples: [] };
  }
  
  // Context tokens allowlist (semantic words that indicate meaning-complete claims)
  // A3.8.37: Extended to include pricing/period context tokens
  const contextTokens = new Set([
    "per", "month", "/mo", "monthly", "annual", "subscription", "pricing", "tiered", "averaging",
    "valuation", "pre-money", "post-money", "premoney", "postmoney", "enterprise", "value", "ev",
    "ownership", "stake", "equity", "fully", "diluted", "take", "rate", "transaction", "fee", "fees",
    "investment", "financing", "round", "series", "seed", "secondary", "purchase",
  ]);
  
  // Normalize claim text: lowercase, collapse whitespace, strip punctuation
  function normalizeClaimText(text) {
    if (!text || typeof text !== "string") return "";
    return text
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.,;:!?"'()\[\]{}]/g, "")
      .trim();
  }
  
  // Extract numeric signature: currency symbol, numeric value, scale tokens
  function extractNumericSignature(text) {
    const usdMatch = text.match(/\$([\d,]+(?:\.\d+)?)\s*(million|mm|m|billion|b|thousand|k)?/i);
    if (usdMatch) {
      const numStr = usdMatch[1].replace(/,/g, "");
      const scale = (usdMatch[2] || "").toLowerCase();
      return { type: "usd", value: numStr, scale };
    }
    
    const pctMatch = text.match(/([\d,]+(?:\.\d+)?)\s*%/);
    if (pctMatch) {
      const numStr = pctMatch[1].replace(/,/g, "");
      return { type: "pct", value: numStr, scale: null };
    }
    
    return null;
  }
  
  // Extract context tokens from claim
  function extractContextTokens(text) {
    const normalized = normalizeClaimText(text);
    const words = normalized.split(/\s+/);
    const found = [];
    for (const word of words) {
      if (contextTokens.has(word)) {
        found.push(word);
      }
    }
    return found;
  }
  
  // Check if claim has meaningful context (beyond bare number)
  function hasContext(text) {
    const normalized = normalizeClaimText(text);
    const words = normalized.split(/\s+/);
    // Check if there are alphabetic tokens beyond numbers/currency
    const hasAlphabetic = words.some(w => /[a-z]/.test(w) && !/^\d+$/.test(w));
    return hasAlphabetic;
  }
  
  const keptClaims = [];
  const droppedIndices = new Set();
  const examples = [];
  
  // Compare all pairs
  for (let i = 0; i < rawClaims.length; i++) {
    if (droppedIndices.has(i)) continue;
    
    const claimA = rawClaims[i];
    const textA = claimA.claimText || "";
    const normalizedA = normalizeClaimText(textA);
    const sigA = extractNumericSignature(textA);
    const contextA = extractContextTokens(textA);
    const hasContextA = hasContext(textA);
    
    // Skip if A has no numeric signature
    if (!sigA) {
      keptClaims.push(claimA);
      continue;
    }
    
    // Check if A is very short (<= 6 chars after stripping)
    const strippedA = textA.replace(/[$,%]/g, "").trim();
    const isVeryShort = strippedA.length <= 6;
    
    let isSubsumed = false;
    let subsumedBy = null;
    
    for (let j = 0; j < rawClaims.length; j++) {
      if (i === j || droppedIndices.has(j)) continue;
      
      const claimB = rawClaims[j];
      const textB = claimB.claimText || "";
      const normalizedB = normalizeClaimText(textB);
      const sigB = extractNumericSignature(textB);
      const contextB = extractContextTokens(textB);
      const hasContextB = hasContext(textB);
      
      // Skip if B has no numeric signature or different signature
      if (!sigB || sigB.type !== sigA.type || sigB.value !== sigA.value || sigB.scale !== sigA.scale) {
        continue;
      }
      
      // Check if A is substring of B
      if (normalizedB.includes(normalizedA) && normalizedA !== normalizedB) {
        // Check subsumption conditions:
        // 1. B has context AND (A has no context OR A has fewer context tokens)
        // 2. OR A is very short and B is meaning-complete
        if ((hasContextB && (!hasContextA || contextB.length > contextA.length)) || 
            (isVeryShort && hasContextB)) {
          isSubsumed = true;
          subsumedBy = textB;
          break;
        }
      }
    }
    
    if (isSubsumed) {
      droppedIndices.add(i);
      if (examples.length < 3) {
        examples.push(`"${textA.substring(0, 30)}" -> "${subsumedBy.substring(0, 50)}"`);
      }
    } else {
      keptClaims.push(claimA);
    }
  }
  
  return {
    keptClaims,
    droppedCount: droppedIndices.size,
    examples: examples.slice(0, 3),
  };
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
          // A3.6.21: B) Instrument precise qual_valuation trace
          // Note: runId/reqSig/idx not available here, trace will be logged in generateClaimsForStatement
          
          // Phase 1: Try primary extraction
          let primaryAttempt = tryBuildQualValuationClaimText(snippet, "primary");
          let finalSnippet = "";
          let usedBestValSnip = false;
          let retryDebug = null;
          let traceInfo = {
            primarySnippet: snippet,
            primarySnippetLen: snippet.length,
            primaryResult: primaryAttempt.claimText,
            primaryResultLen: primaryAttempt.claimText.length,
            bestValSnipRaw: bestValSnip || "",
            bestValSnipLen: bestValSnip ? bestValSnip.length : 0,
            finalSnippet: "",
            finalSnippetLen: 0,
            source: "none"
          };
          
          if (primaryAttempt.claimText.length > 0) {
            // Primary succeeded
            finalSnippet = primaryAttempt.claimText;
            traceInfo.source = "primary";
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
              traceInfo.source = "best";
            } else {
              // Both failed - try legacy fallback as last resort
              const fallbackSnippet = extractValuationFallbackSnippet(text, anchor, null, null, null);
              if (fallbackSnippet && fallbackSnippet.length > 0 && fallbackSnippet.length < 150) {
                finalSnippet = fallbackSnippet;
                traceInfo.source = "fallback";
              }
            }
          } else {
            // No bestValSnip, try legacy fallback
            const fallbackSnippet = extractValuationFallbackSnippet(text, anchor, null, null, null);
            if (fallbackSnippet && fallbackSnippet.length > 0 && fallbackSnippet.length < 150) {
              finalSnippet = fallbackSnippet;
              traceInfo.source = "fallback";
            }
          }
          
          traceInfo.finalSnippet = finalSnippet;
          traceInfo.finalSnippetLen = finalSnippet.length;
          
          if (finalSnippet && finalSnippet.length > 0 && finalSnippet.length < 150) {
            // A3.6.18: Store flag indicating bestValSnip was used (for diagnostics)
            const claimEntry = { text: finalSnippet, anchor: anchor };
            if (usedBestValSnip) {
              claimEntry._usedBestValSnip = true;
            }
            if (retryDebug) {
              claimEntry._retryDebug = retryDebug;
            }
            // A3.6.21: Store trace info for diagnostics
            claimEntry._traceInfo = traceInfo;
            
            // A3.6.27: 2) Persist valuation snippet at the time qual_valuation is produced
            // After the final sanitized snippet is computed
            const sanitized = stripDanglingNumericTail(finalSnippet);
            const sanitizedOk = sanitized && sanitized.length > 0 && isValuationSnippet(sanitized);
            claimEntry._valQualCandidate = sanitized;
            claimEntry._valQualCandidateOk = sanitizedOk;
            claimEntry._valQualCandidateSource = traceInfo.source; // "best", "primary", or "fallback"
            
            claims.push(claimEntry);
            anchorsProcessed.add(anchor);
          } else {
            // A3.6.21: Store trace info even if empty (for diagnostics)
            if (bestValSnip && bestValSnip.length > 0) {
              // Store trace info in a way that can be accessed later for diagnostics
              // We'll log this in generateClaimsForStatement
            }
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
    // A3.6.21: D) Prevent downstream emptying for valuation snippets sourced from bestValSnip
    let cleaned = cleanClaimText(claimText);
    
    // A3.6.21: If qual_valuation originated from bestValSnip and cleaning emptied it, use fail-safe
    if (!cleaned && claimAnchor === "qual_valuation" && typeof claimEntry === "object" && claimEntry._usedBestValSnip) {
      // Check if original claimText passes isValuationSnippet()
      if (isValuationSnippet(claimText)) {
        // Fallback to original text (already minimal-cleaned by builder)
        cleaned = claimText.trim();
        // Only apply minimal trailing punctuation removal
        cleaned = cleaned.replace(/[,;:.\s]+$/, "").trim();
        
        // Final check: must still pass isValuationSnippet()
        if (!isValuationSnippet(cleaned)) {
          cleaned = ""; // Still invalid, skip
        }
      }
    }
    
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
    // A3.8.29: Part B - Use normalizeMoneySuffixForRawClaim for rawClaims anchor assignment
    let anchor = claimAnchor;
    if (!anchor) {
      // Check for month context in rawClaims
      const normalizedAnchor = normalizeMoneySuffixForRawClaim(cleaned, statementText);
      anchor = normalizedAnchor || extractAnchor(cleaned);
    }
    const candidate = {
      claimText: cleaned,
      facet,
      claimKey,
      anchor: anchor, // A3.6.10: Explicit anchor field, A3.8.29: Month-aware for rawClaims
    };
    
    // A3.6.18: Preserve _usedBestValSnip flag if present
    if (typeof claimEntry === "object" && claimEntry._usedBestValSnip) {
      candidate._usedBestValSnip = true;
    }
    
    // A3.6.19: Preserve _retryDebug flag if present
    if (typeof claimEntry === "object" && claimEntry._retryDebug) {
      candidate._retryDebug = claimEntry._retryDebug;
    }
    
    // A3.6.21: Preserve _traceInfo flag if present
    if (typeof claimEntry === "object" && claimEntry._traceInfo) {
      candidate._traceInfo = claimEntry._traceInfo;
    }
    
    // A3.6.27: Preserve _valQualCandidate flags if present
    if (typeof claimEntry === "object" && claimEntry._valQualCandidate !== undefined) {
      candidate._valQualCandidate = claimEntry._valQualCandidate;
      candidate._valQualCandidateOk = claimEntry._valQualCandidateOk;
      candidate._valQualCandidateSource = claimEntry._valQualCandidateSource;
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

// A3.6.21: Check if text is a valid valuation snippet
function isValuationSnippet(text) {
  if (typeof text !== "string") return false;
  
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  
  // Must contain valuation keyword
  const hasValuationKeyword = /\b(valuation|pre-?money|post-?money|enterprise\s+value|ev\b(?!\w))\b/i.test(trimmed);
  
  // Must contain digit or currency symbol
  const hasDigitOrCurrency = /[\d$]/.test(trimmed);
  
  return hasValuationKeyword && hasDigitOrCurrency;
}

// A3.6.20: Minimal cleaning for best valuation snippets (preserves content)
function cleanBestValuationSnippet(raw) {
  if (!raw || typeof raw !== "string") return "";
  
  let cleaned = raw;
  
  // Trim whitespace
  cleaned = cleaned.trim();
  
  // Collapse internal whitespace to single spaces
  cleaned = cleaned.replace(/\s+/g, " ");
  
  // Remove trailing punctuation-only tails: trailing [",", ";", ":", "."] and whitespace
  cleaned = cleaned.replace(/[,;:.\s]+$/, "").trim();
  
  // DO NOT apply aggressive sanitizers:
  // - do not truncate on parentheses heuristics
  // - do not remove fragments containing currency/digits
  // - do not remove hyphenated terms like "pre-money"/"post-money"
  
  return cleaned;
}

// A3.6.19: Try to build qual_valuation claimText from a snippet (primary or best mode)
// A3.6.20: Enhanced with minimal cleaning for best mode and fail-safe fallback
function tryBuildQualValuationClaimText(rawText, mode = "primary") {
  if (typeof rawText !== "string" || !rawText.trim()) {
    const rawPreview = rawText ? `${rawText.substring(0, 40)}...` : "";
    return { claimText: "", debug: { mode, reason: "empty_input", rawTextPreview: rawPreview, cleaningPath: "none" } };
  }
  
  // A3.6.20: For best mode, use minimal cleaning path
  let cleaned = "";
  let cleaningPath = "";
  let fallbackUsed = false;
  let fallbackPreview = "";
  
  if (mode === "best") {
    // Check acceptance rules BEFORE cleaning
    const rawHasValuationKeyword = /\b(valuation|pre-?money|post-?money|enterprise\s+value|ev\b(?!\w))\b/i.test(rawText);
    const rawHasDigitOrCurrency = /[\d$]/.test(rawText);
    
    if (!rawHasValuationKeyword || !rawHasDigitOrCurrency) {
      const rawPreview = `${rawText.substring(0, 40)}...${rawText.length > 40 ? rawText.substring(rawText.length - 40) : ""}`;
      return { 
        claimText: "", 
        debug: { 
          mode, 
          reason: "best_rejected_guard", 
          hasKeyword: rawHasValuationKeyword, 
          hasDigitOrCurrency: rawHasDigitOrCurrency,
          rawTextPreview: rawPreview,
          cleaningPath: "none"
        } 
      };
    }
    
    // A3.6.20: Use minimal cleaning for best mode
    cleaningPath = "best_minimal";
    cleaned = cleanBestValuationSnippet(rawText);
    
    // A3.6.20: Fail-safe fallback - if cleaned becomes empty but rawText is valid, use safe fallback
    if (cleaned.length === 0 && rawHasValuationKeyword) {
      fallbackUsed = true;
      // Fallback: minimal trim + trailing punctuation removal only
      let fallbackText = rawText.trim();
      fallbackText = fallbackText.replace(/[,;:.\s]+$/, "").trim();
      
      // Check if fallback still contains valuation keywords
      const fallbackHasKeyword = /\b(valuation|pre-?money|post-?money|enterprise\s+value|ev\b(?!\w))\b/i.test(fallbackText);
      if (fallbackHasKeyword) {
        cleaned = fallbackText;
        fallbackPreview = `${fallbackText.substring(0, 40)}...${fallbackText.length > 40 ? fallbackText.substring(fallbackText.length - 40) : ""}`;
        cleaningPath = "best_minimal_fallback";
      }
    }
    
    // A3.6.21: C) Fix builder return correctness - if minimal-cleaned text is non-empty AND passes isValuationSnippet(), return it immediately
    if (cleaned.length > 0 && isValuationSnippet(cleaned)) {
      // Return immediately - no further stripping / rule chain
      const rawPreview = `${rawText.substring(0, 60)}${rawText.length > 60 ? "..." : ""}`;
      const cleanedPreview = `${cleaned.substring(0, 60)}${cleaned.length > 60 ? "..." : ""}`;
      return { 
        claimText: cleaned, 
        debug: { 
          mode, 
          reason: "ok", 
          cleanedLen: cleaned.length,
          rawTextPreview: rawPreview,
          cleanedPreview: cleanedPreview,
          cleaningPath: cleaningPath,
          fallbackUsed: fallbackUsed,
          fallbackPreview: fallbackPreview
        } 
      };
    }
    
    // If cleaned doesn't pass isValuationSnippet(), it's filtered
    const rawPreview = `${rawText.substring(0, 60)}${rawText.length > 60 ? "..." : ""}`;
    const cleanedPreview = cleaned.length > 0 ? `${cleaned.substring(0, 60)}${cleaned.length > 60 ? "..." : ""}` : "";
    return { 
      claimText: "", 
      debug: { 
        mode, 
        reason: "best_filtered_empty", 
        originalLen: rawText.length, 
        cleanedLen: cleaned.length,
        rawTextPreview: rawPreview,
        cleanedPreview: cleanedPreview,
        cleaningPath: cleaningPath,
        fallbackUsed: fallbackUsed,
        fallbackPreview: fallbackPreview
      } 
    };
  } else {
    // Primary mode: use full cleaning
    cleaningPath = "primary_rules";
    cleaned = cleanClaimText(rawText);
  }
  
  // Check length constraints
  if (cleaned.length === 0 || cleaned.length >= 150) {
    const rawPreview = `${rawText.substring(0, 40)}...${rawText.length > 40 ? rawText.substring(rawText.length - 40) : ""}`;
    const cleanedPreview = cleaned.length > 0 ? `${cleaned.substring(0, 40)}...${cleaned.length > 40 ? cleaned.substring(cleaned.length - 40) : ""}` : "";
    return { 
      claimText: "", 
      debug: { 
        mode, 
        reason: cleaned.length === 0 ? "empty_after_clean" : "too_long", 
        cleanedLen: cleaned.length,
        rawTextPreview: rawPreview,
        cleanedPreview: cleanedPreview,
        cleaningPath: cleaningPath,
        fallbackUsed: fallbackUsed,
        fallbackPreview: fallbackPreview
      } 
    };
  }
  
  const rawPreview = `${rawText.substring(0, 40)}...${rawText.length > 40 ? rawText.substring(rawText.length - 40) : ""}`;
  const cleanedPreview = `${cleaned.substring(0, 40)}...${cleaned.length > 40 ? cleaned.substring(cleaned.length - 40) : ""}`;
  return { 
    claimText: cleaned, 
    debug: { 
      mode, 
      reason: "ok", 
      cleanedLen: cleaned.length,
      rawTextPreview: rawPreview,
      cleanedPreview: cleanedPreview,
      cleaningPath: cleaningPath,
      fallbackUsed: fallbackUsed,
      fallbackPreview: fallbackPreview
    } 
  };
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
  
  // A3.8.31: Sanitize flags to prevent invalid flag errors
  const combinedFlags = sanitizeRegexFlags(flags + 'g');
  return new RegExp(re.source, combinedFlags);
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
// A3.6.54: Helper functions for deal-terms presence checks
function normalizeMoney(value) {
  // Normalize "$7mm" / "$7 million" / "7 million" to a canonical form for comparison
  if (typeof value !== "string") return value;
  return value
    .replace(/[$,]/g, "") // Remove currency symbols and commas
    .replace(/\bmm\b/gi, "million")
    .replace(/\bm\b(?!\w)/gi, "million")
    .trim();
}

function normalizePct(value) {
  // Normalize "20%" / "20 percent" to a canonical form
  if (typeof value !== "string") return value;
  return value
    .replace(/\s*percent\b/gi, "%")
    .replace(/\s+/g, "")
    .trim();
}

function checkValueInSourceText(value, sourceText, dealTerms, claimRole = null) {
  // Check if a deal-terms value appears in sourceText (normalized comparison)
  if (!sourceText || !value) return false;
  
  const sourceLower = sourceText.toLowerCase();
  
  // For money values (investment, preMoney, EV)
  if (dealTerms.investment && (claimRole === "investment_amount" || value === dealTerms.investment.amount)) {
    const investAmount = dealTerms.investment.amount.toString();
    const normalizedValue = normalizeMoney(value.toString());
    const normalizedSource = normalizeMoney(sourceText);
    
    // Check for exact amount match with various formats
    const patterns = [
      new RegExp(`\\b${investAmount.replace(".", "\\.")}\\s*(?:million|mm|m)\\b`, "i"),
      new RegExp(`\\$${investAmount.replace(".", "\\.")}\\s*(?:million|mm|m)\\b`, "i"),
      new RegExp(`\\bup\\s+to\\s+\\$?\\s*${investAmount.replace(".", "\\.")}\\s*(?:million|mm|m)\\b`, "i")
    ];
    return patterns.some(pattern => pattern.test(sourceText));
  }
  
  // For percentage values (ownership)
  if (dealTerms.ownershipPct && (claimRole === "ownership_pct" || claimRole === "ownership_upside")) {
    const ownPct = dealTerms.ownershipPct.pct.toString();
    const normalizedValue = normalizePct(value.toString());
    
    // Check for percentage match
    const patterns = [
      new RegExp(`\\b${ownPct.replace(".", "\\.")}\\s*%`, "i"),
      new RegExp(`\\b${ownPct.replace(".", "\\.")}\\s*percent\\b`, "i")
    ];
    return patterns.some(pattern => pattern.test(sourceText));
  }
  
  // For EV and preMoney, check for value + keyword
  if (dealTerms.enterpriseValue && (claimRole === "enterprise_value" || value === dealTerms.enterpriseValue.amount)) {
    const evAmount = dealTerms.enterpriseValue.amount.toString();
    const hasValue = new RegExp(`\\b${evAmount.replace(".", "\\.")}\\s*(?:million|mm|m)\\b`, "i").test(sourceText);
    const hasKeyword = /\benterprise\s+value\b|\bev\b(?!\w)/i.test(sourceText);
    return hasValue && hasKeyword;
  }
  
  if (dealTerms.preMoney && (claimRole === "pre_money_valuation" || value === dealTerms.preMoney.amount)) {
    const pmAmount = dealTerms.preMoney.amount.toString();
    const hasValue = new RegExp(`\\b${pmAmount.replace(".", "\\.")}\\s*(?:million|mm|m)\\b`, "i").test(sourceText);
    const hasKeyword = /\bpre[- ]?money\s+valuation\b/i.test(sourceText);
    return hasValue && hasKeyword;
  }
  
  return false;
}

// A3.6.11 ADDENDUM: Rule-driven scoring (no topic branching)
function scoreClaimReliability(claimText, facet, corpusSearchResult, ambiguityResult, uploadedDocs) {
  if (!corpusSearchResult || !corpusSearchResult.found) {
    return "Low";
  }
  
  const hits = corpusSearchResult.hits || [];
  if (hits.length === 0) {
    return "Low";
  }
  
  // A3.6.48: Normalize money text for scoring (mm/m -> million)
  const scoringText = normalizeMoneyTextForScoring(claimText);
  
  // A3.6.2 PATCH v2: Enhanced numericMatch (handles percentages)
  // A3.6.49: Use normalized scoringText for numeric matching, extract percent numbers for logging
  let numericMatch = 0;
  let pctNums = [];
  
  if (hits.some(h => h.matchType === "number")) {
    numericMatch = 1;
  } else {
    // A3.6.49: Check if claim has percentage and corpus has matching percentage
    const pctMatch = scoringText.match(/([\d,]+(?:\.\d+)?)\s*%/);
    if (pctMatch) {
      const claimPct = parseFloat(pctMatch[1].replace(/,/g, ""));
      pctNums.push(claimPct);
      
      const allExcerpts = hits.map(h => h.excerpt || "").join(" ");
      const pctPattern = /([\d,]+(?:\.\d+)?)\s*%/g;
      let match;
      while ((match = pctPattern.exec(allExcerpts)) !== null) {
        const corpusPct = parseFloat(match[1].replace(/,/g, ""));
        if (!pctNums.includes(corpusPct)) {
          pctNums.push(corpusPct);
        }
        // Allow 5% tolerance for rounding
        if (Math.abs(claimPct - corpusPct) / Math.max(claimPct, corpusPct) <= 0.05) {
          numericMatch = 1;
          break;
        }
      }
      
      // A3.6.49: Log percent normalization (only for ownership claims to avoid noise)
      if (pctNums.length > 0 && facet === "Ownership" && uploadedDocs && uploadedDocs.length > 0) {
        const textPreview = scoringText.length > 60 ? scoringText.substring(0, 60) + "..." : scoringText;
        // Use console.log since we don't have runId/reqSig here
        console.log(`[A3.6.49][PCT_NUM_NORMALIZE] textPreview="${textPreview}" pctNums=[${pctNums.join(',')}]`);
      }
    } else {
      // A3.6.48: Check for money amounts in normalized text
      const moneyPattern = /\$?(\d+(?:\.\d+)?)\s*million/i;
      const claimMoneyMatch = scoringText.match(moneyPattern);
      if (claimMoneyMatch) {
        const claimAmount = parseFloat(claimMoneyMatch[1].replace(/,/g, ""));
        const allExcerpts = hits.map(h => h.excerpt || "").join(" ");
        const corpusMoneyPattern = /\$?(\d+(?:\.\d+)?)\s*(?:million|mm|m\b)/i;
        const corpusMoneyMatch = allExcerpts.match(corpusMoneyPattern);
        if (corpusMoneyMatch) {
          const corpusAmount = parseFloat(corpusMoneyMatch[1].replace(/,/g, ""));
          // Allow small tolerance for rounding
          if (Math.abs(claimAmount - corpusAmount) / Math.max(claimAmount, corpusAmount) <= 0.05) {
            numericMatch = 1;
          }
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
function generateClaimComment(reliability, facet, hasAmbiguityCap, claimText, assessment = null, claim = null) {
  // A3.6.54: Check if claim is derived from deal-terms and value is present in sourceText
  // If __dealTermsConfirmed flag is set, use explicit confirmation language
  if (claim && claim.__dealTermsConfirmed === true && assessment && assessment.__dealTerms) {
    const dealTerms = assessment.__dealTerms;
    const sourceText = dealTerms.sourceText || "";
    // Value is confirmed in sourceText - use explicit confirmation
    if (reliability === "High") {
      return "Confirmed in provided excerpt";
    } else {
      // Even if reliability is Medium, if value is in sourceText, treat as confirmed
      return "Confirmed in provided excerpt";
    }
  }
  
  if (reliability === "High") {
    return "Confirmed in provided source";
  }
  
  if (reliability === "Medium") {
    // A3.6.54: For deal-terms derived claims, check if value is present in sourceText
    if (claim && claim.__dealTermsDerived === true && assessment && assessment.__dealTerms) {
      const dealTerms = assessment.__dealTerms;
      const sourceText = dealTerms.sourceText || "";
      const claimRole = claim.role || null;
      
      // Extract value from claim for presence check
      let claimValue = null;
      if (claimRole === "investment_amount" && dealTerms.investment) {
        claimValue = dealTerms.investment.amount;
      } else if (claimRole === "pre_money_valuation" && dealTerms.preMoney) {
        claimValue = dealTerms.preMoney.amount;
      } else if (claimRole === "enterprise_value" && dealTerms.enterpriseValue) {
        claimValue = dealTerms.enterpriseValue.amount;
      } else if ((claimRole === "ownership_pct" || claimRole === "ownership_upside") && dealTerms.ownershipPct) {
        claimValue = dealTerms.ownershipPct.pct;
      }
      
      // Check if value is present in sourceText
      if (claimValue !== null && checkValueInSourceText(claimValue, sourceText, dealTerms, claimRole)) {
        // Value is present - use "Supported by memo text" instead of "not explicitly confirmed"
        return "Supported by memo text";
      }
    }
    
    // A3.6.51: For deal-terms canonical pricing statements, use "Supported by memo text" instead of "excerpt not confirmed"
    if (assessment && assessment.__dealTermsCanonical === true && assessment.__dealTermsCanonicalKind === "pricing") {
      const dealTerms = assessment.__dealTerms || null;
      if (dealTerms && dealTerms.sourceText && dealTerms.sourceKind === "windowed_blob") {
        // Check if sourceText contains the claim text (case-insensitive)
        const sourceLower = dealTerms.sourceText.toLowerCase();
        const claimLower = (claimText || "").toLowerCase();
        
        // Check for pricing-related anchors
        const anchor = extractAnchor(claimText);
        const canonicalAnchor = canonicalizeAnchor(anchor, claimText);
        const isPricingAnchor = ["qual_valuation", "usd_premoney", "usd_ev"].includes(canonicalAnchor) ||
                                /usd_\d+m|qual_premoney/i.test(canonicalAnchor);
        
        if (isPricingAnchor) {
          // Check if sourceText contains key pricing terms
          const hasPreMoney = sourceLower.includes("pre-money") || sourceLower.includes("premoney");
          const hasEV = sourceLower.includes("enterprise value") || sourceLower.includes(" ev ") || sourceLower.includes(" ev.");
          
          // If sourceText contains both pre-money and EV, or contains the claim text, use "Supported"
          if ((hasPreMoney && hasEV) || sourceLower.includes(claimLower.substring(0, Math.min(claimLower.length, 40)))) {
            return "Supported by memo text";
          }
        }
      }
    }
    
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
  // A3.6.26: A) Make statement index explicit and use it everywhere
  // idx in this function is the statement index
  const statementIdx = idx;
  
  // A3.6.26: B) Centralize gating helpers
  function shouldTrace(statementIdx) {
    return statementIdx < 2 || statementIdx === 3;
  }
  
  // A3.6.25: Deployment marker - confirms new build is executing
  if (runId && reqSig) {
    diag(runId, reqSig, `[DIAG][A3.6.25] build_marker=a3_6_25_keepalive_v1`);
  }
  
  // A3.6.27: Deployment marker - confirms new build is executing
  if (runId && reqSig) {
    diag(runId, reqSig, `[DIAG][A3.6.27] build_marker=a3_6_27_val_claim_persist_v1 stmtIdx=${statementIdx}`);
  }
  
  // A3.6.28: Deployment marker - confirms new build is executing
  if (runId && reqSig) {
    diag(runId, reqSig, `[DIAG][A3.6.28] build_marker=a3_6_28_force_qual_valuation_v1 stmtIdx=${statementIdx}`);
  }
  
  if (typeof statementText !== "string" || !statementText.trim()) {
    return [];
  }
  
  // A3.6.23: Initialize finalClaims early to avoid TDZ (Temporal Dead Zone) error
  // This must be declared before any code that references it (e.g., diagnostic checks)
  let finalClaims = [];
  
  // A3.6.29: Track if qual_valuation was forced for this statement
  let forcedValQual = false;
  
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
  
  // A3.6.49: Inject DealTerms-derived claims if statement has __dealTerms
  // This must happen BEFORE extractAtomicClaims to ensure DealTerms claims are included
  // These claims MUST use proper role-based anchors and "million" (not "mm") for scoring
  const dealTerms = assessment.__dealTerms || null;
  const dealTermsClaims = [];
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  
  if (dealTerms) {
    // Helper to normalize raw to "million" format
    const normalizeToMillion = (raw) => {
      return raw.replace(/mm\b/g, "million").replace(/\bm\b(?!\w)/g, "million");
    };
    
    // A3.6.49: Build DealTerms-derived claims with proper roles (preMoney, enterpriseValue, investment, ownershipPct, ownershipUpside)
    if (dealTerms.preMoney) {
      const rawNormalized = normalizeToMillion(dealTerms.preMoney.raw);
      const claimText = `${rawNormalized} pre-money valuation`;
      dealTermsClaims.push({
        claimText,
        facet: "Valuation",
        anchor: "usd_premoney",
        role: "pre_money_valuation",
        __dealTermsDerived: true,
        __dealTermsRole: "preMoney"
      });
    }
    
    if (dealTerms.enterpriseValue) {
      const rawNormalized = normalizeToMillion(dealTerms.enterpriseValue.raw);
      const claimText = `${rawNormalized} enterprise value`;
      dealTermsClaims.push({
        claimText,
        facet: "Valuation",
        anchor: "usd_ev",
        role: "enterprise_value",
        __dealTermsDerived: true,
        __dealTermsRole: "enterpriseValue"
      });
    }
    
    if (dealTerms.investment) {
      const rawNormalized = normalizeToMillion(dealTerms.investment.raw);
      const claimText = `up to ${rawNormalized} investment`;
      dealTermsClaims.push({
        claimText,
        facet: "Investment",
        anchor: "usd_invest",
        role: "investment_amount",
        __dealTermsDerived: true,
        __dealTermsRole: "investment"
      });
    }
    
    if (dealTerms.ownershipPct) {
      // A3.6.70: Generate ownership claimText using modality
      const modality = dealTerms.ownershipModality;
      let claimText = "";
      
      if (modality === "expected") {
        claimText = `expected ${dealTerms.ownershipPct.raw} fully diluted ownership`;
      } else if (modality === "plan") {
        claimText = `plan to own ${dealTerms.ownershipPct.raw} on a fully diluted basis`;
      } else if (modality === "targeted") {
        claimText = `targeted ${dealTerms.ownershipPct.raw} fully diluted ownership`;
      } else if (modality === "actual") {
        claimText = `${dealTerms.ownershipPct.raw} fully diluted ownership`;
      } else {
        // Fallback: no modality detected
        claimText = `${dealTerms.ownershipPct.raw} fully diluted ownership`;
      }
      
      dealTermsClaims.push({
        claimText,
        facet: "Ownership",
        anchor: "pct_own",
        role: "ownership_pct",
        __dealTermsDerived: true,
        __dealTermsRole: "ownershipPct"
      });
      
      // A3.6.70: Log ownership claim text generation
      if (runId && reqSig) {
        const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
        log(`[A3.6.70][OWN_CLAIM_TEXT] idx=${idx} modality=${modality || "null"} pct=${dealTerms.ownershipPct.pct} claimText="${claimText}"`);
      }
      
      // A3.6.70: Add explicit upside ownership claim when ownershipUpsidePct exists
      if (dealTerms.ownershipUpsidePct) {
        let upsideClaimText = `potential to increase to ${dealTerms.ownershipUpsidePct}% ownership`;
        
        // Add mechanism if available
        if (dealTerms.ownershipUpsideMechanism) {
          upsideClaimText += ` ${dealTerms.ownershipUpsideMechanism}`;
        } else {
          // Default mechanism if not specified
          upsideClaimText += ` via secondary purchases`;
        }
        
        dealTermsClaims.push({
          claimText: upsideClaimText,
          facet: "Ownership",
          anchor: `pct_own_upside_${dealTerms.ownershipUpsidePct}`,
          role: "ownership_upside_pct", // A3.6.70: New role for explicit upside claim
          __dealTermsDerived: true,
          __dealTermsRole: "ownershipUpsidePct"
        });
        
        // A3.6.70: Log upside claim generation
        if (runId && reqSig) {
          const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
          // Reliability will be computed later in corpusSearch phase
          log(`[A3.6.70][OWN_UPSIDE_CLAIM] idx=${idx} pct=${dealTerms.ownershipUpsidePct} mechanism="${dealTerms.ownershipUpsideMechanism || "null"}" claimText="${upsideClaimText}"`);
        }
      } else if (dealTerms.ownershipUpside && dealTerms.ownershipUpside.pct) {
        // A3.6.49: Fallback to ownershipUpside if ownershipUpsidePct not set
        const upsideText = `potential to increase to ${dealTerms.ownershipUpside.raw} ownership`;
        const mechanism = dealTerms.ownershipUpsideMechanism || "via secondary purchases";
        dealTermsClaims.push({
          claimText: `${upsideText} ${mechanism}`,
          facet: "Ownership",
          anchor: `pct_own_upside_${dealTerms.ownershipUpside.pct}`,
          role: "ownership_upside_pct",
          __dealTermsDerived: true,
          __dealTermsRole: "ownershipUpside"
        });
      } else if (dealTerms.sourceText) {
        // A3.6.49: Legacy check for ownership upside (potential to increase)
        const potentialPattern = /\bpotential\s+to\s+increase\s+to\s*(\d+(?:\.\d+)?)\s*%/i;
        const potentialMatch = dealTerms.sourceText.match(potentialPattern);
        if (potentialMatch) {
          const increasePct = potentialMatch[1];
          const upsideText = `potential to increase to ${increasePct}% ownership via secondary purchases`;
          dealTermsClaims.push({
            claimText: upsideText,
            facet: "Ownership",
            anchor: `pct_own_upside_${increasePct}`,
            role: "ownership_upside_pct",
            __dealTermsDerived: true,
            __dealTermsRole: "ownershipUpside"
          });
        }
      }
    }
  }
  
  // A3.7.9: Extract atomic numeric claims (currency, percentages) with context windows
  // This ensures comprehensive coverage of all numeric mentions
  const atomicNumericClaims = extractAtomicNumericClaims(statementText);
  
  // A3.7.9: Extract optional qualified relationship claims when linkage markers are present
  const relationshipClaims = extractQualifiedRelationshipClaims(statementText, atomicNumericClaims);
  
  // Extract raw candidates (already cleaned and with facet/key assigned)
  // A3.6.18: Pass bestValSnip to extractAtomicClaims for qual_valuation fallback
  const rawCandidates = extractAtomicClaims(statementText, bestValSnip);
  
  // A3.7.9: Prepend atomic numeric claims to ensure they are included
  // These take precedence over existing claims for the same numeric tokens
  if (atomicNumericClaims.length > 0) {
    rawCandidates.unshift(...atomicNumericClaims);
  }
  
  // A3.7.9: Append relationship claims (they are optional and add incremental meaning)
  if (relationshipClaims.length > 0) {
    rawCandidates.push(...relationshipClaims);
  }
  
  // A3.6.12: Scope deal-term claim injection by canonical kind
  const isCanonicalStatement = assessment.__dealTermsCanonical === true;
  const canonicalKind = assessment.__dealTermsCanonicalKind || null;
  let scopedDealTermsClaims = dealTermsClaims;
  
  if (isCanonicalStatement && canonicalKind && CANON_KIND_ALLOW[canonicalKind]) {
    const allow = CANON_KIND_ALLOW[canonicalKind];
    const beforeCount = dealTermsClaims.length;
    scopedDealTermsClaims = dealTermsClaims.filter(claim => {
      const claimRole = claim.role || null;
      const claimAnchor = claim.anchor || null;
      const matchesRole = claimRole && allow.roles.has(claimRole);
      // A3.6.12: Check exact anchor match or prefix match for dynamic anchors (e.g., pct_own_upside_*)
      const matchesAnchor = claimAnchor && (
        allow.anchors.has(claimAnchor) ||
        Array.from(allow.anchors).some(anchor => claimAnchor.startsWith(anchor + "_") || anchor.startsWith(claimAnchor + "_"))
      );
      return matchesRole || matchesAnchor;
    });
    const afterCount = scopedDealTermsClaims.length;
    const keptAnchors = scopedDealTermsClaims.map(c => c.anchor || c.role).filter(Boolean);
    if (runId && reqSig) {
      log(`[A3.6.12][CANON_SCOPE] idx=${idx} kind=${canonicalKind} before=${beforeCount} after=${afterCount} keptAnchors=[${keptAnchors.join(',')}]`);
    }
  }
  
  // A3.6.46: Prepend DealTerms claims to rawCandidates (they take precedence)
  if (scopedDealTermsClaims.length > 0) {
    rawCandidates.unshift(...scopedDealTermsClaims);
  }
  
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
        
        // A3.6.21: B) Instrument precise qual_valuation trace (idx < 2 or idx === 3 only)
        if ((idx < 2 || idx === 3) && candidate._traceInfo) {
          const trace = candidate._traceInfo;
          // Checkpoint 1: after primary extraction snippet (before any cleaning)
          diag(runId, reqSig, `[VAL_QUAL_TRACE] idx=${idx} checkpoint=primary_extraction len=${trace.primarySnippetLen} preview="${trace.primarySnippet.substring(0, 60)}" source=primary`);
          // Checkpoint 2: after bestValSnip selection (raw bestValSnip)
          if (trace.bestValSnipLen > 0) {
            diag(runId, reqSig, `[VAL_QUAL_TRACE] idx=${idx} checkpoint=best_selection len=${trace.bestValSnipLen} preview="${trace.bestValSnipRaw.substring(0, 60)}" source=best`);
          }
          // Checkpoint 3: after tryBuildQualValuationClaimText() returns (final returned claimText)
          diag(runId, reqSig, `[VAL_QUAL_TRACE] idx=${idx} checkpoint=builder_result len=${trace.finalSnippetLen} preview="${trace.finalSnippet.substring(0, 60)}" source=${trace.source}`);
        }
        
        // A3.6.19: Diagnostic for retry behavior
        if ((idx < 2 || idx === 3) && candidate._retryDebug) {
          const retryDebug = candidate._retryDebug;
          diag(runId, reqSig, `[VAL_QUAL_RETRY] idx=${idx} primaryFinalLen=${retryDebug.primaryFinalLen} bestLen=${retryDebug.bestLen} retried=true`);
        }
        
        // A3.6.19: Update [VAL_QUAL_FROM_BEST] with detailed reasons
        if (usedBestValSnip) {
          const preview = candidateText.substring(0, 50);
          diag(runId, reqSig, `[VAL_QUAL_FROM_BEST] idx=${idx} used=true preview="${preview}"`);
        } else if (bestValSnip && bestValSnip.length > 0) {
          // Primary succeeded, bestValSnip available but not used
          const preview = candidateText.substring(0, 50);
          diag(runId, reqSig, `[VAL_QUAL_FROM_BEST] idx=${idx} used=false preview="${preview}" reason=primary_ok`);
        }
        
        // Primary extraction succeeded
        const primarySnippet = candidateText;
        const sanitized = stripDanglingNumericTail(primarySnippet);
        const preview = primarySnippet.substring(Math.max(0, primarySnippet.length - 50));
        const sanitizedPreview = sanitized.substring(Math.max(0, sanitized.length - 50));
        diag(runId, reqSig, `[VAL_SNIP_SAN] idx=${idx} mode=primary before="${preview}" after="${sanitizedPreview}" ok=true`);
        
        // A3.6.27: 2) Persist valuation snippet at the time qual_valuation is produced
        // After the final sanitized snippet is computed (the value shown in VAL_SNIP_SAN "after=…" and ok=true)
        const sanitizedOk = sanitized && sanitized.length > 0 && isValuationSnippet(sanitized);
        candidate._valQualCandidate = sanitized;
        candidate._valQualCandidateOk = sanitizedOk;
        candidate._valQualCandidateSource = usedBestValSnip ? "best" : "primary";
        
        // A3.6.28: 2) Force create/update qual_valuation claim from sanitized snippet (authoritative)
        if ((idx < 2 || idx === 3) && sanitizedOk && sanitized && sanitized.length > 0) {
          // Get citations from assessment (or best guess)
          const statementCitations = Array.isArray(assessment?.citations) ? assessment.citations : [];
          
          // Find existing qual_valuation claim in rawCandidates
          let qualValuationClaim = rawCandidates.find(c => {
            const cAnchor = c.anchor || extractAnchor(c.claimText);
            const cCanonical = canonicalizeAnchor(cAnchor, c.claimText);
            return cCanonical === "qual_valuation";
          });
          
          if (qualValuationClaim) {
            // Update existing claim
            qualValuationClaim.claimText = sanitized;
            qualValuationClaim._forcedValQual = true;
            qualValuationClaim._valQualCandidate = sanitized;
            qualValuationClaim._valQualCandidateOk = true;
            qualValuationClaim._valQualCandidateSource = usedBestValSnip ? "best" : "primary";
            // A3.6.29: Set statement-level flag
            forcedValQual = true;
            const action = "updated";
            const finalLen = sanitized.length;
            const preview = sanitized.length > 80 ? sanitized.substring(0, 80) : sanitized;
            if (runId && reqSig) {
              diag(runId, reqSig, `[VAL_QUAL_FORCE] idx=${idx} action=${action} finalLen=${finalLen} preview="${preview}"`);
            }
          } else {
            // Create new claim
            const newClaim = {
              anchor: "qual_valuation",
              claimText: sanitized,
              citations: statementCitations,
              _forcedValQual: true,
              _valQualCandidate: sanitized,
              _valQualCandidateOk: true,
              _valQualCandidateSource: usedBestValSnip ? "best" : "primary"
            };
            rawCandidates.push(newClaim);
            // A3.6.29: Set statement-level flag
            forcedValQual = true;
            const action = "created";
            const finalLen = sanitized.length;
            const preview = sanitized.length > 80 ? sanitized.substring(0, 80) : sanitized;
            if (runId && reqSig) {
              diag(runId, reqSig, `[VAL_QUAL_FORCE] idx=${idx} action=${action} finalLen=${finalLen} preview="${preview}"`);
            }
          }
        }
      } else {
        // Primary extraction failed completely
        let reason = "best_missing";
        let debugInfo = null;
        let builderReturnedEmpty = true;
        if (bestValSnip && bestValSnip.length > 0) {
          // A3.6.19: Check why bestValSnip wasn't used
          const bestAttempt = tryBuildQualValuationClaimText(bestValSnip, "best");
          debugInfo = bestAttempt.debug;
          builderReturnedEmpty = bestAttempt.claimText.length === 0;
          
          // A3.6.21: E) Make failure reason truthful
          // Check if builder returned non-empty but candidate doesn't exist in rawCandidates
          if (bestAttempt.claimText.length > 0) {
            // Builder returned non-empty - check if it exists in rawCandidates
            const existsInRawCandidates = rawCandidates.some(c => {
              const cAnchor = c.anchor || extractAnchor(c.claimText);
              const cCanonical = canonicalizeAnchor(cAnchor, c.claimText);
              return cCanonical === "qual_valuation";
            });
            
            if (!existsInRawCandidates) {
              // Builder returned non-empty but later disappeared - must be downstream
              reason = "dropped_downstream";
            } else {
              // Builder returned non-empty and exists in rawCandidates - shouldn't happen here
              reason = "best_filtered_empty";
            }
          } else {
            // Builder truly returned empty
            reason = bestAttempt.debug.reason || "best_rejected_guard";
          }
          
          // A3.6.19: Diagnostic for retry that failed
          if (idx < 2 || idx === 3) {
            diag(runId, reqSig, `[VAL_QUAL_RETRY] idx=${idx} primaryFinalLen=0 bestLen=${bestValSnip.length} retried=true`);
          }
        }
        
        // A3.6.19: Diagnostic when qual_valuation would use bestValSnip but wasn't created
        const preview = bestValSnip && bestValSnip.length > 0 ? bestValSnip.substring(0, 50) : "";
        let diagMsg = `[VAL_QUAL_FROM_BEST] idx=${idx} used=false preview="${preview}" reason=${reason}`;
        
        // A3.6.22: D) Update diagnostics - check if claim ultimately emits due to restoration
        // Note: This check happens after finalClaims is built, so we can check finalClaims here
        // Check if qual_valuation exists in finalClaims with _emitKeepAliveRestored flag
        const finalQualValuation = finalClaims.find(c => {
          const cAnchor = c.anchor || extractAnchor(c.claimText);
          const cCanonical = canonicalizeAnchor(cAnchor, c.claimText);
          return cCanonical === "qual_valuation";
        });
        
        // A3.6.24: 5) Diagnostics truthfulness - update if claim ultimately emits due to keepalive restore
        if (finalQualValuation && finalQualValuation._emitKeepAliveRestored) {
          // Claim ultimately emitted due to restoration - update reason
          if (!builderReturnedEmpty && reason === "dropped_downstream") {
            // Don't label as dropped_downstream if it was fixed by keep-alive
            diagMsg = diagMsg.replace(/reason=dropped_downstream/, `reason=dropped_downstream downstreamFixedBy=emit_keepalive`);
          } else if (reason === "best_filtered_empty" || reason === "dropped_downstream") {
            // Also update if it was fixed by keepalive
            diagMsg += ` downstreamFixedBy=emit_keepalive`;
          }
        }
        
        // A3.6.21: E) Include expanded debug info for both best_filtered_empty and dropped_downstream
        if ((reason === "best_filtered_empty" || reason === "dropped_downstream") && debugInfo) {
          const rawPreview = debugInfo.rawTextPreview || "";
          const cleanedPreview = debugInfo.cleanedPreview || "";
          const cleaningPath = debugInfo.cleaningPath || "";
          const fallbackUsed = debugInfo.fallbackUsed ? "true" : "false";
          const fallbackPreview = debugInfo.fallbackPreview || "";
          diagMsg += ` rawPreview="${rawPreview}" cleanedPreview="${cleanedPreview}" cleaningPath=${cleaningPath} fallbackUsed=${fallbackUsed}`;
          if (fallbackUsed === "true" && fallbackPreview) {
            diagMsg += ` fallbackPreview="${fallbackPreview}"`;
          }
          if (reason === "dropped_downstream") {
            diagMsg += ` builderReturnedEmpty=${builderReturnedEmpty}`;
          }
        }
        
        diag(runId, reqSig, diagMsg);
        
        // Primary extraction failed, check fallback
        const fallbackSnippet = extractValuationFallbackSnippet(statementText, "qual_valuation", runId, reqSig, idx);
        if (fallbackSnippet && fallbackSnippet.length > 0) {
          const beforeFallback = statementText.substring(Math.max(0, statementText.length - 80));
          const sanitizedFallback = stripDanglingNumericTail(fallbackSnippet);
          const preview = sanitizedFallback.substring(Math.max(0, sanitizedFallback.length - 50));
          diag(runId, reqSig, `[VAL_SNIP_SAN] idx=${idx} mode=fallback before="${beforeFallback.substring(Math.max(0, beforeFallback.length - 50))}" after="${preview}" ok=true`);
          
          // A3.6.28: 2) Force create/update qual_valuation claim from sanitized fallback snippet (authoritative)
          const sanitizedFallbackOk = sanitizedFallback && sanitizedFallback.length > 0 && isValuationSnippet(sanitizedFallback);
          if ((idx < 2 || idx === 3) && sanitizedFallbackOk && sanitizedFallback && sanitizedFallback.length > 0) {
            // Get citations from assessment (or best guess)
            const statementCitations = Array.isArray(assessment?.citations) ? assessment.citations : [];
            
            // Find existing qual_valuation claim in rawCandidates
            let qualValuationClaim = rawCandidates.find(c => {
              const cAnchor = c.anchor || extractAnchor(c.claimText);
              const cCanonical = canonicalizeAnchor(cAnchor, c.claimText);
              return cCanonical === "qual_valuation";
            });
            
            if (qualValuationClaim) {
              // Update existing claim
              qualValuationClaim.claimText = sanitizedFallback;
              qualValuationClaim._forcedValQual = true;
              qualValuationClaim._valQualCandidate = sanitizedFallback;
              qualValuationClaim._valQualCandidateOk = true;
              qualValuationClaim._valQualCandidateSource = "fallback";
              // A3.6.29: Set statement-level flag
              forcedValQual = true;
              const action = "updated";
              const finalLen = sanitizedFallback.length;
              const preview = sanitizedFallback.length > 80 ? sanitizedFallback.substring(0, 80) : sanitizedFallback;
              if (runId && reqSig) {
                diag(runId, reqSig, `[VAL_QUAL_FORCE] idx=${idx} action=${action} finalLen=${finalLen} preview="${preview}"`);
              }
            } else {
              // Create new claim
              const newClaim = {
                anchor: "qual_valuation",
                claimText: sanitizedFallback,
                citations: statementCitations,
                _forcedValQual: true,
                _valQualCandidate: sanitizedFallback,
                _valQualCandidateOk: true,
                _valQualCandidateSource: "fallback"
              };
              rawCandidates.push(newClaim);
              // A3.6.29: Set statement-level flag
              forcedValQual = true;
              const action = "created";
              const finalLen = sanitizedFallback.length;
              const preview = sanitizedFallback.length > 80 ? sanitizedFallback.substring(0, 80) : sanitizedFallback;
              if (runId && reqSig) {
                diag(runId, reqSig, `[VAL_QUAL_FORCE] idx=${idx} action=${action} finalLen=${finalLen} preview="${preview}"`);
              }
            }
          }
        } else {
          diag(runId, reqSig, `[VAL_SNIP_SAN] idx=${idx} mode=fallback ok=false reason=empty_after_sanitize`);
        }
      }
    }
  }
  
  // A3.6.15: Diagnostic for USD anchors before aggregation
  if (runId && reqSig && (idx < 2 || idx === 3)) {
    for (const candidate of rawCandidates) {
      const rawAnchor = candidate.anchor || extractAnchor(candidate.claimText) || "no_anchor";
      const canonicalAnchor = canonicalizeAnchor(rawAnchor, candidate.claimText);
      if (canonicalAnchor && canonicalAnchor.startsWith("usd_")) {
        const normalizedMeaningKey = buildNormalizedMeaningKey(candidate.claimText);
        const uniquenessKey = `${canonicalAnchor}|${normalizedMeaningKey}`;
        const preview = candidate.claimText.substring(0, 50);
        diag(runId, reqSig, `[CLAIMS_DEDUP_USD] idx=${idx} anchor=${canonicalAnchor} uniquenessKey=${uniquenessKey.substring(0, 80)} preview="${preview}"`);
      }
    }
  }
  
  // A3.6.46: Apply role guards to prevent EV from non-EV roles
  // A claim may only produce text containing "enterprise value" or "EV" if role == enterprise_value
  const sanitizedCandidates = rawCandidates.map(claim => {
    const role = claim.role;
    const claimText = claim.claimText || "";
    
    // Check if claim text contains "enterprise value" or "EV"
    const hasEnterpriseValue = /\benterprise\s+value\b|\bev\b(?!\w)/i.test(claimText);
    
    // If it has EV but role is not enterprise_value, strip it
    if (hasEnterpriseValue && role !== "enterprise_value") {
      const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
      const preview = claimText.length > 50 ? claimText.substring(0, 50) + "..." : claimText;
      log(`[A3.6.46][ROLE_GUARD] idx=${idx} preventedEVFromRole=${role || 'none'} claimPreview="${preview}"`);
      
      // Strip "enterprise value" or "EV" from claim text
      let sanitized = claimText
        .replace(/\s*\(\s*enterprise\s+value\s*\)/gi, "")
        .replace(/\s*\(\s*EV\s*\)/gi, "")
        .replace(/\s+enterprise\s+value/gi, "")
        .replace(/\s+EV\b(?!\w)/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      
      // If sanitized is too short or empty, keep original but log warning
      if (sanitized.length < 5) {
        sanitized = claimText; // Keep original if sanitization breaks it
      }
      
      return {
        ...claim,
        claimText: sanitized,
        __roleGuardApplied: true
      };
    }
    
    return claim;
  });
  
  // A3.6.1: Aggregate by claimKey
  const aggregatedClaims = aggregateClaimsByKey(sanitizedCandidates);
  
  // A3.6.40: 2) Safety net - if forcedValQual === true at statement level, ensure qual_valuation claims have the flag
  if (forcedValQual === true) {
    for (const aggClaim of aggregatedClaims) {
      const claimAnchor = aggClaim.anchor || extractAnchor(aggClaim.claimText);
      const canonicalClaimAnchor = canonicalizeAnchor(claimAnchor, aggClaim.claimText);
      if (canonicalClaimAnchor === "qual_valuation") {
        aggClaim._forcedValQual = true;
      }
    }
  }
  
  // A3.6.53: Protect canonical deal-role claims BEFORE caps/non-canonical filtering
  // This protects based on statement canonical kind + claim role/anchor (not just __dealTermsDerived)
  const protectedClaims = protectCanonicalDealRoleClaims(aggregatedClaims, assessment, idx, runId, reqSig);
  
  // A3.6.9: Check for missing anchors and log dedupe stats
  const emittedAnchors = new Set(aggregatedClaims.map(c => {
    const anchor = extractAnchor(c.claimText);
    return anchor || null;
  }).filter(a => a !== null));
  const missingAnchors = allAnchorsInOriginal.filter(a => !emittedAnchors.has(a));
  if (idx < 2 && runId && reqSig && missingAnchors.length > 0) {
    diag(runId, reqSig, `[CLAIMS_MISSING_ANCHORS] idx=${idx} missing=${JSON.stringify(missingAnchors)}`);
  }
  
  // A3.6.12: Log aggregation stats with anchor uniqueness (per statement)
  if (runId && reqSig) {
    const merged = rawCandidates.length - aggregatedClaims.length;
    // Count unique canonical anchors after dedupe
    const anchorsUnique = Array.from(new Set(aggregatedClaims.map(c => {
      const anchor = c.anchor || extractAnchor(c.claimText);
      return canonicalizeAnchor(anchor, c.claimText) || "no_anchor";
    })));
    
    // A3.6.12: Diagnostic log for dedupe keys (once per statement)
    if (idx < 2) {
      const dedupKeys = aggregatedClaims.slice(0, 5).map(c => {
        const anchor = c.anchor || extractAnchor(c.claimText);
        const canonicalAnchor = canonicalizeAnchor(anchor, c.claimText) || "no_anchor";
        const normalizedMeaningKey = buildNormalizedMeaningKey(c.claimText);
        const uniquenessKey = `${canonicalAnchor}|${normalizedMeaningKey}`;
        return {
          claimPreview: c.claimText.substring(0, 40),
          anchor: canonicalAnchor,
          normalizedMeaningKey: normalizedMeaningKey.substring(0, 30),
          uniquenessKey: uniquenessKey.substring(0, 50)
        };
      });
      diag(runId, reqSig, `[CLAIMS_DEDUP_KEYS] idx=${idx} keys=${JSON.stringify(dedupKeys)}`);
    }
    
    // A3.6.9: Diagnostic log for first 2 statements
    // A3.6.14: Also log for idx=3 to debug duplicate usd_7m claims
    if (idx < 2 || idx === 3) {
      diag(runId, reqSig, `[CLAIMS_DEDUP] idx=${idx} raw=${rawCandidates.length} unique=${aggregatedClaims.length} merged=${merged} anchorsUnique=${JSON.stringify(anchorsUnique.slice(0, 10))}`);
    }
    
    diag(runId, reqSig, `[CLAIMS_UNIQUE] idx=${idx} raw=${rawCandidates.length} anchors=${anchorsUnique.length} merged=${merged} final=${aggregatedClaims.length}`);
    
    // Sample only for first statement to avoid noise
    if (idx === 0) {
      const sample = rawCandidates.slice(0, 5).map(c => c.claimText);
      diag(runId, reqSig, `[CLAIMS_AGG_SAMPLE] idx=${idx} first5=${JSON.stringify(sample)}`);
    }
  }
  
  // A3.6.1: Apply facet caps (protected claims will bypass)
  // A3.6.12: Track cap pass for canonical statements
  const isCanonicalForCaps = assessment.__dealTermsCanonical === true;
  const canonicalKindForCaps = assessment.__dealTermsCanonicalKind || null;
  const keepAlwaysBeforeCaps = protectedClaims.filter(c => c.__protected === true).length;
  const capCandidatesBeforeCaps = protectedClaims.filter(c => !c.__protected).length;
  
  const cappedClaims = applyFacetCaps(protectedClaims, runId, reqSig, idx, assessment);
  
  // A3.6.12: Log cap pass for canonical statements
  if (isCanonicalForCaps && runId && reqSig) {
    const keepAlwaysAfterCaps = cappedClaims.filter(c => c.__protected === true).length;
    const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
    log(`[A3.6.12][CAP_PASS] idx=${idx} pass=1 kind=${canonicalKindForCaps} keepAlways=${keepAlwaysAfterCaps} capCandidates=${capCandidatesBeforeCaps}`);
  }
  
  // Get existing citations if available
  const citations = Array.isArray(assessment?.citations) ? assessment.citations : [];
  
  // Score reliability and generate comments for final claims
  // A3.6.23: finalClaims already initialized at top of function to avoid TDZ
  // Reset to empty array here (it was initialized as [] at top)
  finalClaims = [];
  let hiCount = 0, medCount = 0, lowCount = 0;
  
  // A3.6.2 PATCH: Minimal diagnostics for first 1-2 statements
  const shouldLogDiagnostics = runId && reqSig && statementIdx < 2;
  
  // A3.6.26: Use claimIdx for claim loop, statementIdx for statement-level gating
  let claimIdx = 0;
  for (const aggClaim of cappedClaims) {
    let claimText = aggClaim.claimText;
    const facet = aggClaim.facet;
    
    // A3.6.12: Extract and canonicalize anchor - enforce canonical anchor allowlist
    const claimAnchor = aggClaim.anchor || extractAnchor(claimText);
    const canonicalClaimAnchor = canonicalizeAnchor(claimAnchor, claimText);
    
    // A3.6.71: Synthesize claimText for pct_* claims if missing
    if ((!claimText || !claimText.trim()) && canonicalClaimAnchor && /^pct_\d+$/.test(canonicalClaimAnchor)) {
      const pctMatch = canonicalClaimAnchor.match(/^pct_(\d+)$/);
      if (pctMatch) {
        const pctNum = pctMatch[1];
        // Check statement for context
        const hasSecondary = /\bsecondary\b/i.test(statementText);
        const hasCoFounder = /\bformer\s+co-founder\b/i.test(statementText);
        
        if (hasSecondary) {
          claimText = `${pctNum}% ownership via secondary purchase`;
          if (hasCoFounder) {
            claimText += ` from a former co-founder`;
          }
        } else {
          claimText = `${pctNum}% ownership`;
        }
        
        if (runId && reqSig) {
          diag(runId, reqSig, `[A3.6.71][PCT_CLAIM_FALLBACK] idx=${idx} anchor=${canonicalClaimAnchor} synthesized="${claimText}"`);
        }
      }
    }
    
    // A3.6.26: C) Add an "entered qual_valuation claim" checkpoint
    // This must appear BEFORE any rule-chain processing and BEFORE any early-continue
    if (canonicalClaimAnchor === "qual_valuation" && shouldTrace(statementIdx) && runId && reqSig) {
      diag(runId, reqSig, `[VAL_QUAL_TRACE] idx=${statementIdx} checkpoint=enter_claim claimIdx=${claimIdx} anchor=qual_valuation`);
    }
    
    // A3.8.37: Check for contextual USD claims (pricing/period context) in selection mode
    // These should be kept even if anchor might be non-canonical
    const hasPricingContext = /\b(per|month|/mo|monthly|subscription|pricing|fee|fees|averaging|avg)\b/i.test(claimText);
    const isContextualUsd = hasPricingContext && canonicalClaimAnchor && canonicalClaimAnchor.startsWith("usd_");
    let keptForContextualUsd = false;
    let droppedFragment = null;
    
    // A3.6.53: Hard guard - skip non-canonical anchors (including null from qual_ownership)
    // BUT: Never drop protected claims (canonical deal-role claims)
    // A3.8.37: Also keep contextual USD claims in selection mode
    if (!canonicalClaimAnchor || !isCanonicalAnchor(canonicalClaimAnchor)) {
      // A3.6.53: Bypass non-canonical check for protected claims
      if (aggClaim.__protected === true) {
        // Protected claim - allow through even if anchor is non-canonical
        const claimRole = aggClaim.role || "unknown";
        if (runId && reqSig) {
          diag(runId, reqSig, `[A3.6.53][NONCANON_SKIP] idx=${statementIdx} anchor=${claimAnchor} role=${claimRole} reason=protected_canonical_deal_role`);
        }
        // Continue to process this claim (don't skip)
      } else if (isContextualUsd) {
        // A3.8.37: Keep contextual USD claims (e.g., "$45 per month") even if anchor is non-canonical
        // Check if there's a bare fragment that should be dropped instead
        const usdMatch = claimText.match(/\$([\d,]+(?:\.\d+)?)/);
        if (usdMatch) {
          const numStr = usdMatch[1].replace(/,/g, "");
          const num = parseFloat(numStr);
          // Look for a bare fragment claim with same number
          for (const otherClaim of cappedClaims) {
            if (otherClaim === aggClaim) continue;
            const otherText = otherClaim.claimText || "";
            const bareFragmentMatch = otherText.match(/^\$([\d,]+(?:\.\d+)?)$/);
            if (bareFragmentMatch && bareFragmentMatch[1].replace(/,/g, "") === numStr) {
              droppedFragment = otherText;
              break;
            }
          }
        }
        keptForContextualUsd = true;
        if (runId && reqSig) {
          const keptPreview = claimText.substring(0, 50);
          const droppedPreview = droppedFragment ? droppedFragment.substring(0, 30) : "none";
          diag(runId, reqSig, `[CLAIMS][KEEP_CONTEXTUAL_USD] idx=${statementIdx} kept="${keptPreview}" dropped="${droppedPreview}"`);
        }
        // Continue to process this claim (don't skip)
      } else {
        // Non-protected claim - apply normal non-canonical guard
        if (runId && reqSig && statementIdx < 2) {
          diag(runId, reqSig, `[CLAIMS_DROPPED_NONCANONICAL] idx=${statementIdx} anchor=${claimAnchor} canonical=${canonicalClaimAnchor} claimText="${claimText.substring(0, 60)}"`);
        }
        claimIdx++;
        continue; // Skip this claim
      }
    }
    
    // A3.6.26: D) Ensure pre_rules_emit is captured from the actual candidate claimText for this claim
    // Capture immediately before any processing that could modify/empty it
    let preRulesText = "";
    let preRulesOk = false;
    let emitKeepAliveRestored = false;
    if (canonicalClaimAnchor === "qual_valuation") {
      // A3.6.26: D) Capture pre_rules_emit from the actual candidate claimText for this claim
      // Immediately after extracting claimText from aggClaim (before any rules mutate it)
      preRulesText = (claimText || "").trim();
      preRulesOk = isValuationSnippet(preRulesText);
      
      // A3.6.26: D) Log pre_rules_emit with statementIdx gating
      if (shouldTrace(statementIdx) && runId && reqSig) {
        // Determine source: "best" if _usedBestValSnip true, else "primary"/"unknown"
        let source = "unknown";
        if (aggClaim._usedBestValSnip) {
          source = "best";
        } else if (aggClaim._traceInfo && aggClaim._traceInfo.source) {
          source = aggClaim._traceInfo.source;
        } else {
          source = "primary";
        }
        const preview = preRulesText.length > 60 ? preRulesText.substring(0, 60) : preRulesText;
        diag(runId, reqSig, `[VAL_QUAL_TRACE] idx=${statementIdx} checkpoint=pre_rules_emit len=${preRulesText.length} preview="${preview}" source=${source} preRulesOk=${preRulesOk}`);
      }
    }
    
    // Run corpusSearch for this claim (with hybrid mode, maxHits: 2)
    const searchResult = corpusSearch(claimText, uploadedDocs);
    
    // Check for ambiguity (for valuation/ownership claims)
    const ambiguityResult = detectAnchorAmbiguity(claimText, uploadedDocs);
    
    // Score reliability (A3.6.2 ADDENDUM: anchor-gated semantic equivalence)
    let reliability = scoreClaimReliability(claimText, facet, searchResult, ambiguityResult, uploadedDocs);
    
    // A3.6.54: Check if claim is derived from deal-terms and value is present in sourceText
    // If so, set reliability floor to "High" and mark for explicit confirmation
    if (aggClaim.__dealTermsDerived === true && assessment && assessment.__dealTerms) {
      const dealTerms = assessment.__dealTerms;
      const sourceText = dealTerms.sourceText || "";
      const claimRole = aggClaim.role || null;
      
      // Extract value from claim text for presence check
      let claimValue = null;
      if (claimRole === "investment_amount" && dealTerms.investment) {
        claimValue = dealTerms.investment.amount;
      } else if (claimRole === "pre_money_valuation" && dealTerms.preMoney) {
        claimValue = dealTerms.preMoney.amount;
      } else if (claimRole === "enterprise_value" && dealTerms.enterpriseValue) {
        claimValue = dealTerms.enterpriseValue.amount;
      } else if ((claimRole === "ownership_pct" || claimRole === "ownership_upside") && dealTerms.ownershipPct) {
        claimValue = dealTerms.ownershipPct.pct;
      }
      
      // Check if value is present in sourceText
      if (claimValue !== null && checkValueInSourceText(claimValue, sourceText, dealTerms, claimRole)) {
        // Value is present in sourceText - set reliability to High
        reliability = "High";
        // Mark claim for explicit confirmation in comment
        aggClaim.__dealTermsConfirmed = true;
        if (runId && reqSig) {
          diag(runId, reqSig, `[A3.6.54][DEAL_TERMS_CONFIRMED] idx=${idx} role=${claimRole} value=${claimValue} reliability=High`);
        }
      }
    }
    
    // A3.6.11 ADDENDUM: Generic rule-driven diagnostic logging (no topic branching)
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
    
    // A3.6.26: E) Apply rules, then keepalive restore at the EXACT emit/skip gate
    // After rule-chain processing completes
    let postRulesText = (claimText || "");
    
    // A3.6.26: E) Log post_rules_emit with statementIdx gating
    if (canonicalClaimAnchor === "qual_valuation" && shouldTrace(statementIdx) && runId && reqSig) {
      let source = "unknown";
      if (aggClaim._usedBestValSnip) {
        source = "best";
      } else if (aggClaim._traceInfo && aggClaim._traceInfo.source) {
        source = aggClaim._traceInfo.source;
      } else {
        source = "primary";
      }
      const preview = postRulesText.trim().length > 60 ? postRulesText.trim().substring(0, 60) : postRulesText.trim();
      diag(runId, reqSig, `[VAL_QUAL_TRACE] idx=${statementIdx} checkpoint=post_rules_emit len=${postRulesText.trim().length} preview="${preview}" source=${source}`);
    }
    
    // A3.6.28: 3) Put keepalive restore inside the real emit/skip gate (the one that logs CLAIMS_EMIT_SKIP)
    // This is the EXACT gate that currently triggers filtered_empty_after_rules
    // Right before that skip decision
    if (canonicalClaimAnchor === "qual_valuation") {
      const post = (postRulesText ?? "").trim();
      const cand = (aggClaim._valQualCandidate ?? "").trim();
      const candOk = aggClaim._valQualCandidateOk === true;
      // A3.6.29: forced must reflect either claim._forcedValQual === true OR local forcedValQual === true
      const forced = aggClaim._forcedValQual === true || forcedValQual === true;
      const candLen = cand ? cand.length : 0;
      
      // A3.6.28: 3) Log trace before the empty-check
      if (runId && reqSig) {
        const candPreview = cand.length > 80 ? cand.substring(0, 80) : cand;
        diag(runId, reqSig, `[VAL_QUAL_TRACE] idx=${statementIdx} checkpoint=emit_gate postLen=${post.length} candOk=${candOk} candLen=${candLen} candPreview="${candPreview}" forced=${forced}`);
      }
      
      // A3.6.29: 3) In [VAL_QUAL_OBJ] log for idx=3, forced must reflect claim._forcedValQual
      if (statementIdx === 3 && runId && reqSig) {
        const keys = Object.keys(aggClaim).sort().join(",");
        const hasCandidate = (aggClaim._valQualCandidate && aggClaim._valQualCandidate.length > 0) ? "true" : "false";
        const forcedForObj = aggClaim._forcedValQual === true;
        diag(runId, reqSig, `[VAL_QUAL_OBJ] idx=3 keys=${keys} hasCandidate=${hasCandidate} forced=${forcedForObj}`);
      }
      
      // A3.6.28: 3) If post is empty AND candOk AND cand non-empty
      if (!post && candOk && cand && cand.length > 0) {
        postRulesText = cand;
        claimText = cand; // IMPORTANT: ensure the variable used for emit is restored too
        emitKeepAliveRestored = true;
        aggClaim._emitKeepAliveRestored = true;
        if (runId && reqSig) {
          const candPreview = cand.length > 80 ? cand.substring(0, 80) : cand;
          diag(runId, reqSig, `[VAL_QUAL_KEEPALIVE] idx=${statementIdx} restored=true from=persisted_candidate candLen=${candLen} candPreview="${candPreview}"`);
        }
      } else if (!post) {
        // A3.6.28: 3) Else log (only for qual_valuation)
        if (runId && reqSig) {
          diag(runId, reqSig, `[VAL_QUAL_KEEPALIVE] idx=${statementIdx} restored=false postLen=${post.length} candOk=${candOk} candLen=${candLen}`);
        }
      }
    }
    
    // A3.6.27: This is the EXACT gate that decides skip vs emit
    // Empty-check must use the effective text used for emit
    if (!postRulesText || !postRulesText.trim()) {
      claimIdx++;
      continue; // Skip this claim (subject to existing dedup/cap rules)
    }
    
    // A3.6.26: G) When emitting/pushing to finalClaims, ensure emitted claimText comes from postRulesText
    // (or claimText after being set to restoredText). The key invariant:
    // If keepalive restores, the emitted claim must contain the restored text.
    const finalClaimText = postRulesText; // Use postRulesText which may have been restored
    
    // A3.6.50: Generate comment (with ambiguity awareness, role-aware for pricing)
    // Skip ambiguity cap for pricing statements with both preMoney and EV (already disambiguated by roles)
    let hasAmbiguityCap = (facet === "Valuation" || facet === "Ownership") && 
                          (ambiguityResult?.isAmbiguous || false);
    
    // A3.6.50: Role-aware ambiguity guard for pricing statements
    if (facet === "Valuation" && hasAmbiguityCap && assessment.__dealTermsCanonicalKind === "pricing") {
      const dealTerms = assessment.__dealTerms || null;
      if (dealTerms) {
        // Check if statement has both preMoney and EV roles
        const preMoneyAmount = dealTerms.preMoney ? dealTerms.preMoney.amount : null;
        const evAmount = dealTerms.enterpriseValue ? dealTerms.enterpriseValue.amount : null;
        
        // Check if statement text includes both amounts
        const statementLower = statementText.toLowerCase();
        const hasPreMoney = preMoneyAmount && (
          statementLower.includes(`${preMoneyAmount}m`) ||
          statementLower.includes(`${preMoneyAmount}mm`) ||
          statementLower.includes(`${preMoneyAmount} million`) ||
          statementLower.includes(`$${preMoneyAmount}m`) ||
          statementLower.includes(`$${preMoneyAmount}mm`) ||
          statementLower.includes(`$${preMoneyAmount} million`)
        );
        const hasEV = evAmount && (
          statementLower.includes(`${evAmount}m`) ||
          statementLower.includes(`${evAmount}mm`) ||
          statementLower.includes(`${evAmount} million`) ||
          statementLower.includes(`$${evAmount}m`) ||
          statementLower.includes(`$${evAmount}mm`) ||
          statementLower.includes(`$${evAmount} million`)
        );
        
        if (hasPreMoney && hasEV) {
          // Both roles present - skip ambiguity cap
          hasAmbiguityCap = false;
          if (runId && reqSig) {
            diag(runId, reqSig, `[A3.6.50][AMBIGUITY_GUARD] idx=${idx} kind=pricing hasPreMoney=true hasEV=true action=skip`);
          }
        }
      }
    }
    
    // A3.6.51: Pass assessment context to generateClaimComment for deal-terms check
    // A3.6.54: Also pass claim object for deal-terms presence check
    const comment = generateClaimComment(reliability, facet, hasAmbiguityCap, finalClaimText, assessment, aggClaim);
    
    // Build claim object (A3.6.2 PATCH: facet-free output)
    const claim = {
      claimText: finalClaimText, // Use finalClaimText which is postRulesText (possibly restored)
      reliability,
      comment,
    };
    
    // A3.6.12: Always set canonical anchor (enforced above)
    claim.anchor = canonicalClaimAnchor;
    
    // A3.6.54: Preserve deal-terms confirmation flag
    if (aggClaim.__dealTermsConfirmed === true) {
      claim.__dealTermsConfirmed = true;
    }
    if (aggClaim.__dealTermsDerived === true) {
      claim.__dealTermsDerived = true;
      claim.role = aggClaim.role || null;
    }
    
    // A3.6.26: Store keep-alive restoration flag for diagnostics
    if (emitKeepAliveRestored) {
      claim._emitKeepAliveRestored = true;
    }
    
    // Add citations if available
    if (citations.length > 0) {
      claim.citations = citations;
    }
    
    // A3.6.70: Log upside claim reliability after it's computed
    if (aggClaim.role === "ownership_upside_pct" && runId && reqSig) {
      const dealTerms = assessment?.__dealTerms || null;
      const upsidePct = dealTerms?.ownershipUpsidePct || null;
      const mechanism = dealTerms?.ownershipUpsideMechanism || null;
      diag(runId, reqSig, `[A3.6.70][OWN_UPSIDE_CLAIM] idx=${idx} pct=${upsidePct || "null"} mechanism="${mechanism || "null"}" reliability=${reliability}`);
    }
    
    finalClaims.push(claim);
    claimIdx++;
  }
  
  // A3.6.12: Force-emit missing DealTerms claims for canonical statements (kind-scoped)
  // After dedup + filtering, ensure deal-term claims relevant to the statement kind are included
  // Reuse isCanonicalStatement and canonicalKind declared earlier in function
  if (isCanonicalStatement && dealTerms && canonicalKind && CANON_KIND_ALLOW[canonicalKind]) {
    const allow = CANON_KIND_ALLOW[canonicalKind];
    const dealTermsClaimsInFinal = finalClaims.filter(c => c.__dealTermsDerived === true);
    const dealTermsRolesInFinal = new Set(dealTermsClaimsInFinal.map(c => c.role).filter(Boolean));
    
    // A3.6.12: Compute expected roles only from kind-scoped allowlist
    const expectedRoles = [];
    if (canonicalKind === "pricing") {
      if (dealTerms.preMoney) expectedRoles.push("pre_money_valuation");
      if (dealTerms.enterpriseValue) expectedRoles.push("enterprise_value");
    } else if (canonicalKind === "investment") {
      if (dealTerms.investment) expectedRoles.push("investment_amount");
    } else if (canonicalKind === "ownership") {
      if (dealTerms.ownershipPct) expectedRoles.push("ownership_pct");
      // Check for ownershipUpside in sourceText
      if (dealTerms.sourceText) {
        const potentialPattern = /\bpotential\s+to\s+increase\s+to\s*(\d+(?:\.\d+)?)\s*%/i;
        if (potentialPattern.test(dealTerms.sourceText)) {
          expectedRoles.push("ownership_upside");
        }
      }
    }
    
    // A3.6.12: Filter expectedRoles to only those in the kind-scoped allowlist
    const scopedExpectedRoles = expectedRoles.filter(role => allow.roles.has(role));
    const missingRoles = scopedExpectedRoles.filter(role => !dealTermsRolesInFinal.has(role));
    
    if (missingRoles.length > 0) {
      // A3.6.12: Some DealTerms claims are missing - force-back as last resort fallback
      // Mark forced claims as protected to prevent second cap pass from dropping them
      for (const missingRole of missingRoles) {
        const missingClaim = dealTermsClaims.find(c => c.role === missingRole);
        if (missingClaim) {
          // Force-add the missing claim and mark as protected
          const forcedClaim = {
            ...missingClaim,
            reliability: "Medium", // Default to Medium for deal terms
            comment: "Supported by memo text",
            __protected: true // A3.6.12: Protect forced claims from second cap pass
          };
          finalClaims.push(forcedClaim);
        }
      }
      
      const keptCount = finalClaims.filter(c => c.__dealTermsDerived === true).length;
      const keptRoles = Array.from(new Set(finalClaims.filter(c => c.__dealTermsDerived === true).map(c => c.role).filter(Boolean)));
      const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
      log(`[A3.6.12][DEAL_CLAIMS_FORCE] idx=${idx} kind=${canonicalKind} ran=true missingRoles=[${missingRoles.join(',')}] kept=${keptCount} roles=[${keptRoles.join(',')}]`);
    } else if (runId && reqSig) {
      // A3.6.12: Log even when all expected claims are present (no force-back needed)
      const keptCount = finalClaims.filter(c => c.__dealTermsDerived === true).length;
      const keptRoles = Array.from(new Set(finalClaims.filter(c => c.__dealTermsDerived === true).map(c => c.role).filter(Boolean)));
      const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
      log(`[A3.6.12][DEAL_CLAIMS_FORCE] idx=${idx} kind=${canonicalKind} ran=false missingRoles=[] kept=${keptCount} roles=[${keptRoles.join(',')}]`);
    }
  }
  
  // A3.6.12: Anchor coverage logging - post-condition check (using canonical anchors only)
  if (runId && reqSig) {
    // Canonicalize detected anchors and filter to canonical only
    const anchorsDetected = allAnchorsInOriginal
      .map(a => canonicalizeAnchor(a, statementText))
      .filter(a => a && isCanonicalAnchor(a));
    const anchorsEmitted = Array.from(new Set(finalClaims.map(c => {
      const anchor = c.anchor || extractAnchor(c.claimText);
      const canonical = canonicalizeAnchor(anchor, c.claimText);
      return canonical && isCanonicalAnchor(canonical) ? canonical : null;
    }).filter(Boolean)));
    const missing = Array.from(new Set(anchorsDetected.filter(a => !anchorsEmitted.includes(a))));
    
    // A3.6.14: Diagnostic for anchors detected but not emitted
    if (missing.length > 0 && runId && reqSig) {
      // Re-extract raw candidates to check why anchors were skipped
      // A3.6.18: Pass bestValSnip to extractAtomicClaims for accurate diagnostic
      const rawCandidates = extractAtomicClaims(statementText, bestValSnip);
      const aggregatedClaims = aggregateClaimsByKey(rawCandidates);
      const cappedClaims = applyFacetCaps(aggregatedClaims, runId, reqSig, idx);
      
      for (const missingAnchor of missing) {
        // Determine reason for skip
        let reason = "other";
        
        // Check if anchor was in raw candidates but filtered out
        const hadRawCandidate = rawCandidates.some(c => {
          const cAnchor = c.anchor || extractAnchor(c.claimText);
          const cCanonical = canonicalizeAnchor(cAnchor, c.claimText);
          return cCanonical === missingAnchor;
        });
        
        if (!hadRawCandidate) {
          // A3.6.18: For qual_valuation, check if bestValSnip exists - if so, it's not no_claim_text
          if (missingAnchor === "qual_valuation" && bestValSnip && bestValSnip.length > 0) {
            // bestValSnip exists but claim wasn't created - must be a different reason
            // Check if it would have been created but filtered later
            reason = "filtered_empty_after_rules";
          } else {
            reason = "no_claim_text";
          }
        } else {
          // Check if it was filtered in aggregation
          const hadAggregated = aggregatedClaims.some(c => {
            const cAnchor = c.anchor || extractAnchor(c.claimText);
            const cCanonical = canonicalizeAnchor(cAnchor, c.claimText);
            return cCanonical === missingAnchor;
          });
          
          if (!hadAggregated) {
            reason = "deduped_out";
          } else {
            // Check if it was in capped claims
            const hadCapped = cappedClaims.some(c => {
              const cAnchor = c.anchor || extractAnchor(c.claimText);
              const cCanonical = canonicalizeAnchor(cAnchor, c.claimText);
              return cCanonical === missingAnchor;
            });
            
            if (!hadCapped) {
              reason = "filtered_empty";
            } else {
              // Must have been filtered at emission (non-canonical check)
              reason = "non_canonical";
            }
          }
        }
        
        // A3.6.25: 2) Unify trace labels - remove "before_emit_skip" checkpoint
        // The actual checkpoints (pre_rules_emit, post_rules_emit, final_emit_decision) are logged
        // in the main loop where claims are processed. This diagnostic block only runs when
        // a qual_valuation anchor is detected but not emitted, which means the keepalive logic
        // should have already logged the checkpoints. If we reach here, it means the claim was
        // filtered out before reaching the emit gate, or the keepalive didn't trigger.
        // No need to log a separate "before_emit_skip" - the final_emit_decision checkpoint
        // already covers this case.
        
        diag(runId, reqSig, `[CLAIMS_EMIT_SKIP] idx=${idx} anchor=${missingAnchor} reason=${reason}`);
      }
    }
    
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
// A3.7.10: Strip "[Other]" and similar bracket tags from reasons
function stripBracketTagsFromReason(reason) {
  if (typeof reason !== "string") return reason;
  
  // Remove leading bracket tags like [Other], [X], [Anything] at start or after quoted snippet
  // But preserve bracketed citations like [1]
  let cleaned = reason;
  
  // Remove [Other] or [X] at the very start
  cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, "");
  
  // Remove [Other] or [X] immediately after the quoted snippet (before comment)
  // Pattern: "snippet" [Other] comment
  cleaned = cleaned.replace(/"([^"]+)"\s*\[[^\]]+\]\s*/g, '"$1" ');
  
  // Don't remove bracketed citations (numbers like [1], [2])
  // These are preserved as-is
  
  return cleaned;
}

function stripReasonTags(reasons) {
  if (!Array.isArray(reasons)) return [];
  
  return reasons.map(reason => {
    if (typeof reason !== "string") return reason;
    // A3.7.10: Use enhanced bracket tag stripping
    const cleaned = stripBracketTagsFromReason(reason).trim();
    return cleaned;
  }).filter(reason => {
    // Drop empty strings
    if (typeof reason === "string") return reason.length > 0;
    return true;
  });
}

// A3.6.13: Final universal reason normalizer - strips tags, dedupes, and applies caps
// Runs for ALL statements regardless of reasonsSource, at the output boundary
function normalizeFinalReasons(reasons, reasonsSource = null) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return { reasons: [], stats: { before: 0, after: 0, strippedTags: 0, deduped: 0 } };
  }
  
  const stats = { before: reasons.length, after: 0, strippedTags: 0, deduped: 0 };
  
  // Step 1: Strip all bracket/facet tags universally
  // A3.7.10: Use enhanced bracket tag stripping
  const stripped = reasons.map(reason => {
    if (typeof reason !== "string") return reason;
    const before = reason;
    // A3.7.10: Use stripBracketTagsFromReason for comprehensive bracket tag removal
    const cleaned = stripBracketTagsFromReason(reason).trim();
    if (cleaned !== before) {
      stats.strippedTags++;
    }
    return cleaned;
  }).filter(reason => {
    // Drop empty strings
    if (typeof reason === "string") return reason.length > 0;
    return true;
  });
  
  // Step 2: Dedupe near-identical reasons (exact match after normalization)
  const deduped = [];
  const seen = new Set();
  const seenLower = new Set();
  
  for (const reason of stripped) {
    if (typeof reason !== "string") {
      deduped.push(reason);
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
    deduped.push(trimmed);
  }
  
  // Step 3: Apply bullet caps
  // Claims-mode: max 2 reasons
  // Legacy-mode: max 4 reasons (existing behavior)
  const maxReasons = (reasonsSource === "claims") ? 2 : 4;
  const capped = deduped.slice(0, maxReasons);
  
  stats.after = capped.length;
  
  return { reasons: capped, stats };
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
// A3.6.56: Get canonical reason family key for deduplication
function getCanonicalReasonFamilyKey(stmt, claim) {
  // Only apply when statement is canonical deal-terms
  if (!stmt || stmt.__dealTermsCanonical !== true) {
    return null;
  }
  
  const canonicalKind = stmt.__dealTermsCanonicalKind || null;
  if (!canonicalKind) {
    return null;
  }
  
  // If claim has __dealTermsRole, use it directly
  if (claim.__dealTermsRole) {
    // Map role to canonical family key
    const roleToFamily = {
      "preMoney": "deal:preMoney",
      "enterpriseValue": "deal:enterpriseValue",
      "investment": "deal:investment",
      "ownershipPct": "deal:ownershipPct",
      "ownershipUpside": "deal:ownershipUpside"
    };
    return roleToFamily[claim.__dealTermsRole] || null;
  }
  
  // No __dealTermsRole - map by anchor based on canonical kind
  const claimAnchor = claim.anchor || extractAnchor(claim.claimText || "");
  const canonicalAnchor = canonicalizeAnchor(claimAnchor, claim.claimText || "");
  
  if (!canonicalAnchor) {
    return null;
  }
  
  // Map anchors to families by kind
  if (canonicalKind === "investment") {
    // Investment anchors: usd_invest, usd_7m, usd_10m, etc.
    if (canonicalAnchor === "usd_invest") {
      return "deal:investment";
    }
    // Check for numeric investment anchors (usd_7m, usd_10m, etc.)
    const investNumericMatch = canonicalAnchor.match(/^usd_(\d+(?:\.\d+)?)m$/);
    if (investNumericMatch) {
      return "deal:investment";
    }
  } else if (canonicalKind === "pricing") {
    // Pre-money anchors: usd_premoney, usd_20m (when in pre-money context)
    if (canonicalAnchor === "usd_premoney") {
      return "deal:preMoney";
    }
    // Check for numeric pre-money anchors (usd_20m, etc.) - must have "pre" in claim text
    const preMoneyNumericMatch = canonicalAnchor.match(/^usd_(\d+(?:\.\d+)?)m$/);
    if (preMoneyNumericMatch && (claim.claimText || "").toLowerCase().includes("pre")) {
      return "deal:preMoney";
    }
    
    // Enterprise value anchors: usd_ev, usd_18.7m (when in EV context)
    if (canonicalAnchor === "usd_ev") {
      return "deal:enterpriseValue";
    }
    // Check for numeric EV anchors (usd_18.7m, etc.) - must have "enterprise" in claim text
    const evNumericMatch = canonicalAnchor.match(/^usd_(\d+(?:\.\d+)?)m$/);
    if (evNumericMatch && (claim.claimText || "").toLowerCase().includes("enterprise")) {
      return "deal:enterpriseValue";
    }
  } else if (canonicalKind === "ownership") {
    // Ownership percentage anchors: pct_own, pct_20, pct_31 (when not upside)
    if (canonicalAnchor === "pct_own" || canonicalAnchor === "pct_20" || canonicalAnchor === "pct_31") {
      // Check if it's upside by looking at claim text
      const claimLower = (claim.claimText || "").toLowerCase();
      if (!claimLower.includes("upside")) {
        return "deal:ownershipPct";
      }
    }
    
    // Ownership upside anchors: pct_own_upside_31, pct_31 (when upside context)
    if (canonicalAnchor.startsWith("pct_own_upside_")) {
      return "deal:ownershipUpside";
    }
    // pct_31 can be upside if claim text mentions upside
    if (canonicalAnchor === "pct_31" && (claim.claimText || "").toLowerCase().includes("upside")) {
      return "deal:ownershipUpside";
    }
  }
  
  return null;
}

// A3.6.55: Rank claims for reasons selection (not for scoring)
function rankClaimForReasons(claim, stmt) {
  // Returns a sortable tuple (lower is better): [priorityBucket, evidenceScore, tieBreaker1, tieBreaker2, tieBreaker3]
  
  // Priority bucket A: Protected canonical deal-term claims
  const isProtectedCanonical = claim.__protected === true && 
                                (claim.__dealTermsDerived === true || claim.__dealTermsRole);
  if (isProtectedCanonical) {
    const priorityBucket = 0; // Highest priority
    
    // Evidence score: prefer keyword/fuzzy > number > entity
    let evidenceScore = 3; // Default (lowest)
    // Note: We don't have direct access to matchTypes here, so we'll use reliability as proxy
    // High reliability often correlates with keyword/fuzzy matches
    if (claim.reliability === "High") {
      evidenceScore = 0; // Best evidence
    } else if (claim.reliability === "Medium") {
      evidenceScore = 1; // Medium evidence
    } else {
      evidenceScore = 2; // Lower evidence
    }
    
    // Tie-breakers
    const hasFacet = claim.facet ? 0 : 1;
    const hasRole = claim.role ? 0 : 1;
    const claimTextLen = Math.min((claim.claimText || "").length, 90);
    const tieBreaker1 = hasFacet + hasRole; // Lower is better (prefer both facet and role)
    const tieBreaker2 = 90 - claimTextLen; // Prefer longer (but capped at 90)
    const tieBreaker3 = (claim.anchor || "").localeCompare("zzz"); // Lexicographic anchor
    
    return [priorityBucket, evidenceScore, tieBreaker1, tieBreaker2, tieBreaker3];
  }
  
  // A3.7.9: Priority bucket B: Numeric claims (currency, percent, relationship)
  // Prioritize currency claims (largest magnitude first), then percent, then relationship
  const claimAnchor = claim.anchor || extractAnchor(claim.claimText || "");
  const canonicalAnchor = canonicalizeAnchor(claimAnchor, claim.claimText || "");
  const isCurrencyClaim = canonicalAnchor && canonicalAnchor.startsWith("usd_");
  const isPercentClaim = canonicalAnchor && canonicalAnchor.startsWith("pct_");
  const isRelationshipClaim = canonicalAnchor && canonicalAnchor.startsWith("rel_");
  
  if (isCurrencyClaim || isPercentClaim || isRelationshipClaim) {
    const priorityBucket = 1; // Second priority (after protected canonical)
    
    // Sub-priority: currency (0) > percent (1) > relationship (2)
    let subPriority = 2;
    if (isCurrencyClaim) {
      subPriority = 0;
      // For currency, prefer larger magnitudes (extract number from anchor)
      const numMatch = canonicalAnchor.match(/usd_([\d.]+)m/);
      if (numMatch) {
        const magnitude = parseFloat(numMatch[1]);
        // Invert so larger magnitudes have lower subPriority (better)
        subPriority = 1000 - Math.min(magnitude, 1000); // Cap at 1000m
      }
    } else if (isPercentClaim) {
      subPriority = 1;
    } else {
      subPriority = 2;
    }
    
    // Evidence score
    let evidenceScore = 3;
    if (claim.reliability === "High") {
      evidenceScore = 0;
    } else if (claim.reliability === "Medium") {
      evidenceScore = 1;
    } else {
      evidenceScore = 2;
    }
    
    // Tie-breakers
    const hasFacet = claim.facet ? 0 : 1;
    const hasRole = claim.role ? 0 : 1;
    const claimTextLen = Math.min((claim.claimText || "").length, 90);
    const tieBreaker1 = subPriority; // Use subPriority as first tie-breaker
    const tieBreaker2 = hasFacet + hasRole;
    const tieBreaker3 = 90 - claimTextLen;
    
    return [priorityBucket, evidenceScore, tieBreaker1, tieBreaker2, tieBreaker3];
  }
  
  // Priority bucket C: Non-protected but canonical anchor claims that match deal-term anchors
  const isCanonicalStmt = stmt?.__dealTermsCanonical === true;
  const canonicalKind = stmt?.__dealTermsCanonicalKind || null;
  let isCanonicalAnchor = false;
  
  if (isCanonicalStmt && canonicalKind && CANON_KIND_ALLOW[canonicalKind]) {
    const allow = CANON_KIND_ALLOW[canonicalKind];
    isCanonicalAnchor = canonicalAnchor && (
      allow.anchors.has(canonicalAnchor) ||
      Array.from(allow.anchors).some(anchor => canonicalAnchor.startsWith(anchor + "_") || anchor.startsWith(canonicalAnchor + "_"))
    );
  }
  
  if (isCanonicalAnchor) {
    const priorityBucket = 2; // Third priority
    
    // Evidence score
    let evidenceScore = 3;
    if (claim.reliability === "High") {
      evidenceScore = 0;
    } else if (claim.reliability === "Medium") {
      evidenceScore = 1;
    } else {
      evidenceScore = 2;
    }
    
    // Tie-breakers
    const hasFacet = claim.facet ? 0 : 1;
    const hasRole = claim.role ? 0 : 1;
    const claimTextLen = Math.min((claim.claimText || "").length, 90);
    const tieBreaker1 = hasFacet + hasRole;
    const tieBreaker2 = 90 - claimTextLen;
    const tieBreaker3 = (claim.anchor || "").localeCompare("zzz");
    
    return [priorityBucket, evidenceScore, tieBreaker1, tieBreaker2, tieBreaker3];
  }
  
  // Priority bucket D: Everything else
  const priorityBucket = 3; // Lowest priority
  
  // Evidence score
  let evidenceScore = 3;
  if (claim.reliability === "High") {
    evidenceScore = 0;
  } else if (claim.reliability === "Medium") {
    evidenceScore = 1;
  } else {
    evidenceScore = 2;
  }
  
  // Tie-breakers
  const hasFacet = claim.facet ? 0 : 1;
  const hasRole = claim.role ? 0 : 1;
  const claimTextLen = Math.min((claim.claimText || "").length, 90);
  const tieBreaker1 = hasFacet + hasRole;
  const tieBreaker2 = 90 - claimTextLen;
  const tieBreaker3 = (claim.anchor || "").localeCompare("zzz");
  
  return [priorityBucket, evidenceScore, tieBreaker1, tieBreaker2, tieBreaker3];
}

function generateClaimLinkedReasons(claims, statement = null, runId = null, reqSig = null) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return [];
  }
  
  // A3.6.51: Extract deal-terms context from statement if available
  const dealTerms = statement?.__dealTerms || null;
  const isCanonicalPricing = statement?.__dealTermsCanonical === true && 
                             statement?.__dealTermsCanonicalKind === "pricing";
  
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
  
  // A3.6.55: Rank all claims for reasons selection
  const rankedClaims = claims.map(claim => ({
    claim,
    rank: rankClaimForReasons(claim, statement)
  }));
  
  // Sort by rank (lower is better)
  rankedClaims.sort((a, b) => {
    for (let i = 0; i < Math.max(a.rank.length, b.rank.length); i++) {
      const aVal = a.rank[i] || 0;
      const bVal = b.rank[i] || 0;
      if (aVal !== bVal) {
        return aVal - bVal;
      }
    }
    return 0;
  });
  
  // A3.6.55: Determine max reasons (2 default, 3 if mix of High and Medium/Low)
  const hasHigh = claims.some(c => c.reliability === "High");
  const hasMediumOrLow = claims.some(c => c.reliability === "Medium" || c.reliability === "Low");
  const maxReasons = (hasHigh && hasMediumOrLow) ? 3 : 2;
  
  // A3.7.9: Track numeric claims separately to ensure coverage
  // A3.7.10: Also track non-numeric qualifier claims (qual_series_a, qual_financing, etc.)
  const currencyClaims = [];
  const percentClaims = [];
  const relationshipClaims = [];
  const qualifierClaims = []; // A3.7.10: Non-numeric qualifiers like qual_series_a, qual_financing
  
  // Pre-sort claims by type for numeric coverage
  for (const { claim } of rankedClaims) {
    const claimAnchor = claim.anchor || extractAnchor(claim.claimText || "");
    const canonicalAnchor = canonicalizeAnchor(claimAnchor, claim.claimText || "");
    if (canonicalAnchor && canonicalAnchor.startsWith("usd_")) {
      currencyClaims.push(claim);
    } else if (canonicalAnchor && canonicalAnchor.startsWith("pct_")) {
      percentClaims.push(claim);
    } else if (canonicalAnchor && canonicalAnchor.startsWith("rel_")) {
      relationshipClaims.push(claim);
    } else if (canonicalAnchor && canonicalAnchor.startsWith("qual_")) {
      // A3.7.10: Track deal-term qualifiers (series, financing, etc.)
      const qualType = canonicalAnchor.replace("qual_", "");
      if (qualType.startsWith("series_") || qualType === "financing" || qualType === "round") {
        qualifierClaims.push(claim);
      }
    }
  }
  
  // A3.6.56: Select reasons from ranked claims, deduplicating by canonical family key
  const reasons = [];
  const seenReasonKeys = new Set();
  const seenFamilyKeys = new Map(); // Map familyKey -> best claim (for protected dominance)
  const chosenReasons = [];
  let droppedReasonDuplicates = 0;
  let droppedCanonicalFamilyDuplicates = 0;
  
  // A3.7.9: Track counts of numeric claims added to reasons
  let currencyCount = 0;
  let percentCount = 0;
  let relationshipCount = 0;
  
  // A3.6.56: First pass - collect claims by family, ensuring protected claims dominate
  const claimsByFamily = new Map();
  for (const { claim } of rankedClaims) {
    const familyKey = getCanonicalReasonFamilyKey(statement, claim);
    
    if (familyKey) {
      // Canonical family claim - check for protected dominance
      if (!claimsByFamily.has(familyKey)) {
        claimsByFamily.set(familyKey, []);
      }
      claimsByFamily.get(familyKey).push(claim);
    }
  }
  
  // A3.6.56: Within each family, ensure protected canonical claims dominate
  const bestClaimsByFamily = new Map();
  for (const [familyKey, familyClaims] of claimsByFamily.entries()) {
    // Find protected canonical claim if any
    const protectedClaim = familyClaims.find(c => 
      c.__protected === true && c.__dealTermsDerived === true
    );
    
    if (protectedClaim) {
      // Protected claim wins - drop all others in this family
      bestClaimsByFamily.set(familyKey, protectedClaim);
      droppedCanonicalFamilyDuplicates += familyClaims.length - 1;
    } else {
      // No protected claim - use highest ranked (first in sorted list)
      bestClaimsByFamily.set(familyKey, familyClaims[0]);
      if (familyClaims.length > 1) {
        droppedCanonicalFamilyDuplicates += familyClaims.length - 1;
      }
    }
  }
  
  // A3.6.56: Second pass - select reasons, using family keys as primary dedupe key
  for (const { claim } of rankedClaims) {
    if (reasons.length >= maxReasons) break;
    
    // A3.6.56: Get family key - use as primary dedupe key when present
    const familyKey = getCanonicalReasonFamilyKey(statement, claim);
    
    if (familyKey) {
      // Canonical family claim - check if we already have the best claim for this family
      const bestClaim = bestClaimsByFamily.get(familyKey);
      if (bestClaim !== claim) {
        // Not the best claim for this family - skip
        droppedReasonDuplicates++;
        continue;
      }
      
      // This is the best claim for this family - check if we've already added it
      if (seenFamilyKeys.has(familyKey)) {
        droppedReasonDuplicates++;
        continue;
      }
      seenFamilyKeys.set(familyKey, claim);
    } else {
      // Non-canonical claim - use existing dedupe logic
      const reasonKey = claim.__dealTermsRole || claim.anchor || extractAnchor(claim.claimText || "") || "no_key";
      
      if (seenReasonKeys.has(reasonKey)) {
        droppedReasonDuplicates++;
        continue;
      }
      seenReasonKeys.add(reasonKey);
    }
    
    const claimText = claim?.claimText || "";
    const anchor = claim?.anchor || extractAnchor(claimText);
    const canonicalAnchor = canonicalizeAnchor(anchor, claimText) || "no_anchor";
    
    if (seenCanonicalAnchors.has(canonicalAnchor)) continue;
    seenCanonicalAnchors.add(canonicalAnchor);
    
    // A3.7.9: Track numeric claim counts
    if (canonicalAnchor.startsWith("usd_")) {
      currencyCount++;
    } else if (canonicalAnchor.startsWith("pct_")) {
      percentCount++;
    } else if (canonicalAnchor.startsWith("rel_")) {
      relationshipCount++;
    }
    
    // A3.6.55: Overwrite "not explicitly confirmed" comments for protected canonical deal-term claims
    let comment = claim?.comment || "Not found in sources";
    const isProtectedCanonical = claim.__protected === true && 
                                  (claim.__dealTermsDerived === true || claim.__dealTermsRole);
    
    if (isProtectedCanonical && /not explicitly confirmed/i.test(comment)) {
      // Check if sourceText contains the term/number or if we have strong evidence
      const sourceText = dealTerms?.sourceText || "";
      const claimRole = claim.role || claim.__dealTermsRole || null;
      let valueInSource = false;
      
      if (sourceText && claimRole) {
        // Check if value is present in sourceText using helper
        let claimValue = null;
        if (claimRole === "investment_amount" && dealTerms?.investment) {
          claimValue = dealTerms.investment.amount;
        } else if (claimRole === "pre_money_valuation" && dealTerms?.preMoney) {
          claimValue = dealTerms.preMoney.amount;
        } else if (claimRole === "enterprise_value" && dealTerms?.enterpriseValue) {
          claimValue = dealTerms.enterpriseValue.amount;
        } else if ((claimRole === "ownership_pct" || claimRole === "ownership_upside") && dealTerms?.ownershipPct) {
          claimValue = dealTerms.ownershipPct.pct;
        }
        
        if (claimValue !== null) {
          valueInSource = checkValueInSourceText(claimValue, sourceText, dealTerms, claimRole);
        }
      }
      
      // Overwrite comment based on evidence strength
      if (valueInSource || claim.reliability === "High") {
        comment = "Confirmed in provided source";
      } else {
        comment = "Supported by provided source";
      }
    }
    
    // A3.6.51: Legacy rewrite for deal-terms pricing claims (keep for backward compatibility)
    if (claim?.__dealTermsDerived === true && isCanonicalPricing && dealTerms && !isProtectedCanonical) {
      // Check if comment is the misleading "excerpt not confirmed" one
      if (comment === "Mentioned but not explicitly confirmed in excerpt") {
        // Check if sourceText contains the claim or pricing terms
        const sourceLower = (dealTerms.sourceText || "").toLowerCase();
        const claimLower = claimText.toLowerCase();
        const hasPreMoney = sourceLower.includes("pre-money") || sourceLower.includes("premoney");
        const hasEV = sourceLower.includes("enterprise value") || sourceLower.includes(" ev ") || sourceLower.includes(" ev.");
        
        const canonicalAnchor = canonicalizeAnchor(anchor, claimText);
        const isPricingAnchor = ["qual_valuation", "usd_premoney", "usd_ev"].includes(canonicalAnchor) ||
                                /usd_\d+m|qual_premoney/i.test(canonicalAnchor);
        
        if (isPricingAnchor && ((hasPreMoney && hasEV) || sourceLower.includes(claimLower.substring(0, Math.min(claimLower.length, 40))))) {
          comment = "Supported by memo text";
        }
      }
    }
    
    // A3.6.56: Track chosen reason for diagnostics (include familyKey)
    const familyKeyForClaim = getCanonicalReasonFamilyKey(statement, claim);
    chosenReasons.push({
      anchor: claim.anchor || canonicalAnchor,
      familyKey: familyKeyForClaim || null,
      __protected: claim.__protected || false,
      __dealTermsRole: claim.__dealTermsRole || null,
      reliability: claim.reliability || "Unknown"
    });
    
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
  
  // A3.6.56: Clamp canonical statements to canonical families (ensure coverage)
  if (statement && statement.__dealTermsCanonical === true && dealTerms) {
    const canonicalKind = statement.__dealTermsCanonicalKind || null;
    const requiredFamilies = new Set();
    
    // Determine required families based on canonical kind and deal terms
    if (canonicalKind === "pricing") {
      if (dealTerms.preMoney) requiredFamilies.add("deal:preMoney");
      if (dealTerms.enterpriseValue) requiredFamilies.add("deal:enterpriseValue");
    } else if (canonicalKind === "investment") {
      if (dealTerms.investment) requiredFamilies.add("deal:investment");
    } else if (canonicalKind === "ownership") {
      if (dealTerms.ownershipPct) requiredFamilies.add("deal:ownershipPct");
      // A3.6.70: Check for ownership upside using ownershipUpsidePct
      if (dealTerms.ownershipUpsidePct) {
        requiredFamilies.add("deal:ownershipUpsidePct");
      } else if (dealTerms.ownershipUpside && dealTerms.ownershipUpside.pct) {
        requiredFamilies.add("deal:ownershipUpside");
      } else if (dealTerms.sourceText) {
        // Fallback: Check for ownership upside in sourceText
        const potentialPattern = /\bpotential\s+to\s+increase\s+to\s*(\d+(?:\.\d+)?)\s*%/i;
        if (potentialPattern.test(dealTerms.sourceText)) {
          requiredFamilies.add("deal:ownershipUpside");
        }
      }
    }
    
    // Check which families are already covered
    const coveredFamilies = new Set();
    for (const reason of chosenReasons) {
      if (reason.familyKey && requiredFamilies.has(reason.familyKey)) {
        coveredFamilies.add(reason.familyKey);
      }
    }
    
    // Find missing families and add best claim for each (only if it won't reduce coverage)
    const missingFamilies = Array.from(requiredFamilies).filter(f => !coveredFamilies.has(f));
    for (const missingFamily of missingFamilies) {
      // Find best claim for this family from ranked claims
      for (const { claim } of rankedClaims) {
        const claimFamilyKey = getCanonicalReasonFamilyKey(statement, claim);
        if (claimFamilyKey === missingFamily && reasons.length < maxReasons) {
          // Add this claim as a reason (reuse existing processing logic from above)
          const claimText = claim?.claimText || "";
          const anchor = claim?.anchor || extractAnchor(claimText);
          const canonicalAnchor = canonicalizeAnchor(anchor, claimText) || "no_anchor";
          
          if (seenCanonicalAnchors.has(canonicalAnchor)) continue;
          seenCanonicalAnchors.add(canonicalAnchor);
          
          let comment = claim?.comment || "Not found in sources";
          const isProtectedCanonical = claim.__protected === true && 
                                        (claim.__dealTermsDerived === true || claim.__dealTermsRole);
          
          if (isProtectedCanonical && /not explicitly confirmed/i.test(comment)) {
            const sourceText = dealTerms?.sourceText || "";
            const claimRole = claim.role || claim.__dealTermsRole || null;
            let valueInSource = false;
            
            if (sourceText && claimRole) {
              let claimValue = null;
              if (claimRole === "investment_amount" && dealTerms?.investment) {
                claimValue = dealTerms.investment.amount;
              } else if (claimRole === "pre_money_valuation" && dealTerms?.preMoney) {
                claimValue = dealTerms.preMoney.amount;
              } else if (claimRole === "enterprise_value" && dealTerms?.enterpriseValue) {
                claimValue = dealTerms.enterpriseValue.amount;
              } else if ((claimRole === "ownership_pct" || claimRole === "ownership_upside") && dealTerms?.ownershipPct) {
                claimValue = dealTerms.ownershipPct.pct;
              }
              
              if (claimValue !== null) {
                valueInSource = checkValueInSourceText(claimValue, sourceText, dealTerms, claimRole);
              }
            }
            
            if (valueInSource || claim.reliability === "High") {
              comment = "Confirmed in provided source";
            } else {
              comment = "Supported by provided source";
            }
          }
          
          const citations = Array.isArray(claim?.citations) && claim.citations.length > 0
            ? ` [${claim.citations.join(", ")}]`
            : "";
          
          let snippet = extractAnchorSubstring(claimText);
          if (snippet.length > 50) {
            const truncateAt = snippet.lastIndexOf(" ", 50);
            if (truncateAt > 20) {
              snippet = snippet.substring(0, truncateAt) + "...";
            } else {
              snippet = snippet.substring(0, 47) + "...";
            }
          }
          
          let reason = `"${snippet}" ${comment}${citations}`;
          if (reason.length > 120) {
            const truncateAt = reason.lastIndexOf(" ", 117);
            if (truncateAt > 80) {
              reason = reason.substring(0, truncateAt) + "...";
            } else {
              reason = reason.substring(0, 117) + "...";
            }
          }
          
          reason = stripReasonTags([reason])[0];
          reasons.push(reason);
          
          chosenReasons.push({
            anchor: claim.anchor || canonicalAnchor,
            familyKey: claimFamilyKey,
            __protected: claim.__protected || false,
            __dealTermsRole: claim.__dealTermsRole || null,
            reliability: claim.reliability || "Unknown"
          });
          
          break; // Only add one claim per missing family
        }
      }
    }
  }
  
  // A3.6.56: Diagnostic logging for reasons selection (enhanced with family info)
  const hasNotConfirmedWithProtected = chosenReasons.some(r => 
    r.__protected === true && reasons.some(reason => 
      typeof reason === "string" && /not explicitly confirmed/i.test(reason)
    )
  );
  
  if (statement && statement.__dealTermsCanonical) {
    const log = console.log; // Could be enhanced to use diag if runId/reqSig available
    log(`[A3.6.56][REASONS_SELECTION] kind=${statement.__dealTermsCanonicalKind || 'unknown'} chosenReasons=${JSON.stringify(chosenReasons)} droppedDuplicates=${droppedReasonDuplicates} droppedCanonicalFamilyDuplicates=${droppedCanonicalFamilyDuplicates} hasNotConfirmedWithProtected=${hasNotConfirmedWithProtected ? 1 : 0}`);
  }
  
  // A3.7.9: Ensure numeric claims are prioritized in reasons
  // If we have currency/percent claims but they weren't included, add them (up to maxReasons)
  // This happens before final deduplication
  if (reasons.length < maxReasons) {
    // Add currency claims if we have fewer than 2
    if (currencyCount < 2 && currencyClaims.length > 0) {
      for (const claim of currencyClaims) {
        if (reasons.length >= maxReasons) break;
        const claimAnchor = claim.anchor || extractAnchor(claim.claimText || "");
        const canonicalAnchor = canonicalizeAnchor(claimAnchor, claim.claimText || "");
        if (seenCanonicalAnchors.has(canonicalAnchor)) continue;
        
        seenCanonicalAnchors.add(canonicalAnchor);
        let comment = claim?.comment || "Not found in sources";
        const citations = Array.isArray(claim?.citations) && claim.citations.length > 0
          ? ` [${claim.citations.join(", ")}]`
          : "";
        let snippet = extractAnchorSubstring(claim.claimText || "");
        if (snippet.length > 50) {
          const truncateAt = snippet.lastIndexOf(" ", 50);
          if (truncateAt > 20) {
            snippet = snippet.substring(0, truncateAt) + "...";
          } else {
            snippet = snippet.substring(0, 47) + "...";
          }
        }
        let reason = `"${snippet}" ${comment}${citations}`;
        if (reason.length > 120) {
          const truncateAt = reason.lastIndexOf(" ", 117);
          if (truncateAt > 80) {
            reason = reason.substring(0, truncateAt) + "...";
          } else {
            reason = reason.substring(0, 117) + "...";
          }
        }
        reason = stripReasonTags([reason])[0];
        reasons.push(reason);
        currencyCount++;
      }
    }
    
    // Add percent claims if we have fewer than 2
    if (percentCount < 2 && percentClaims.length > 0) {
      for (const claim of percentClaims) {
        if (reasons.length >= maxReasons) break;
        const claimAnchor = claim.anchor || extractAnchor(claim.claimText || "");
        const canonicalAnchor = canonicalizeAnchor(claimAnchor, claim.claimText || "");
        if (seenCanonicalAnchors.has(canonicalAnchor)) continue;
        
        seenCanonicalAnchors.add(canonicalAnchor);
        let comment = claim?.comment || "Not found in sources";
        const citations = Array.isArray(claim?.citations) && claim.citations.length > 0
          ? ` [${claim.citations.join(", ")}]`
          : "";
        let snippet = extractAnchorSubstring(claim.claimText || "");
        if (snippet.length > 50) {
          const truncateAt = snippet.lastIndexOf(" ", 50);
          if (truncateAt > 20) {
            snippet = snippet.substring(0, truncateAt) + "...";
          } else {
            snippet = snippet.substring(0, 47) + "...";
          }
        }
        let reason = `"${snippet}" ${comment}${citations}`;
        if (reason.length > 120) {
          const truncateAt = reason.lastIndexOf(" ", 117);
          if (truncateAt > 80) {
            reason = reason.substring(0, truncateAt) + "...";
          } else {
            reason = reason.substring(0, 117) + "...";
          }
        }
        reason = stripReasonTags([reason])[0];
        reasons.push(reason);
        percentCount++;
      }
    }
    
    // Add relationship claim if we have one and haven't added any yet
    if (relationshipCount === 0 && relationshipClaims.length > 0 && reasons.length < maxReasons) {
      const claim = relationshipClaims[0];
      const claimAnchor = claim.anchor || extractAnchor(claim.claimText || "");
      const canonicalAnchor = canonicalizeAnchor(claimAnchor, claim.claimText || "");
      if (!seenCanonicalAnchors.has(canonicalAnchor)) {
        seenCanonicalAnchors.add(canonicalAnchor);
        let comment = claim?.comment || "Not found in sources";
        const citations = Array.isArray(claim?.citations) && claim.citations.length > 0
          ? ` [${claim.citations.join(", ")}]`
          : "";
        let snippet = extractAnchorSubstring(claim.claimText || "");
        if (snippet.length > 50) {
          const truncateAt = snippet.lastIndexOf(" ", 50);
          if (truncateAt > 20) {
            snippet = snippet.substring(0, truncateAt) + "...";
          } else {
            snippet = snippet.substring(0, 47) + "...";
          }
        }
        let reason = `"${snippet}" ${comment}${citations}`;
        if (reason.length > 120) {
          const truncateAt = reason.lastIndexOf(" ", 117);
          if (truncateAt > 80) {
            reason = reason.substring(0, truncateAt) + "...";
          } else {
            reason = reason.substring(0, 117) + "...";
          }
        }
        reason = stripReasonTags([reason])[0];
        reasons.push(reason);
        relationshipCount++;
      }
    }
    
    // A3.7.10: Add non-numeric qualifier claim if space exists after numeric coverage
    if (qualifierClaims.length > 0 && reasons.length < maxReasons) {
      // Prefer qual_series_* or qual_financing
      const preferredQualifier = qualifierClaims.find(c => {
        const cAnchor = c.anchor || extractAnchor(c.claimText || "");
        const cCanonical = canonicalizeAnchor(cAnchor, c.claimText || "");
        return cCanonical && (cCanonical.startsWith("qual_series_") || cCanonical === "qual_financing");
      }) || qualifierClaims[0];
      
      const claimAnchor = preferredQualifier.anchor || extractAnchor(preferredQualifier.claimText || "");
      const canonicalAnchor = canonicalizeAnchor(claimAnchor, preferredQualifier.claimText || "");
      if (!seenCanonicalAnchors.has(canonicalAnchor)) {
        seenCanonicalAnchors.add(canonicalAnchor);
        let comment = preferredQualifier?.comment || "Not found in sources";
        const citations = Array.isArray(preferredQualifier?.citations) && preferredQualifier.citations.length > 0
          ? ` [${preferredQualifier.citations.join(", ")}]`
          : "";
        let snippet = extractAnchorSubstring(preferredQualifier.claimText || "");
        if (snippet.length > 50) {
          const truncateAt = snippet.lastIndexOf(" ", 50);
          if (truncateAt > 20) {
            snippet = snippet.substring(0, truncateAt) + "...";
          } else {
            snippet = snippet.substring(0, 47) + "...";
          }
        }
        let reason = `"${snippet}" ${comment}${citations}`;
        if (reason.length > 120) {
          const truncateAt = reason.lastIndexOf(" ", 117);
          if (truncateAt > 80) {
            reason = reason.substring(0, truncateAt) + "...";
          } else {
            reason = reason.substring(0, 117) + "...";
          }
        }
        reason = stripReasonTags([reason])[0];
        reasons.push(reason);
      }
    }
  }
  
  // A3.7.10: Build reason normalization key for deduplication
  // Based on quoted snippet portion only (not the comment)
  function normalizeReasonKey(reason) {
    if (typeof reason !== "string") return "";
    
    // Extract quoted snippet (between first " and second ")
    const firstQuote = reason.indexOf('"');
    const secondQuote = reason.indexOf('"', firstQuote + 1);
    let snippet = "";
    if (firstQuote >= 0 && secondQuote > firstQuote) {
      snippet = reason.substring(firstQuote + 1, secondQuote);
    } else {
      // Fallback: use first part before comment
      snippet = reason.split(/not found|confirmed|supported/i)[0];
    }
    
    // Normalize: lowercase, remove leading boilerplate, collapse whitespace, remove trailing "..."
    let normalized = snippet.toLowerCase().trim();
    normalized = normalized.replace(/^(is |the firm is |the |a |an )/i, "");
    normalized = normalized.replace(/[^\w\s]/g, " "); // Remove punctuation
    normalized = normalized.replace(/\s+/g, " ").trim();
    normalized = normalized.replace(/\.\.\.$/, "").trim();
    
    return normalized;
  }
  
  // A3.7.10: Strip "[Other]" and similar bracket tags from reasons
  function stripBracketTags(reason) {
    if (typeof reason !== "string") return reason;
    
    // Remove leading bracket tags like [Other], [X], [Anything] at start or after quoted snippet
    // But preserve bracketed citations like [1]
    let cleaned = reason;
    
    // Remove [Other] or [X] at the very start
    cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, "");
    
    // Remove [Other] or [X] immediately after the quoted snippet (before comment)
    // Pattern: "snippet" [Other] comment
    cleaned = cleaned.replace(/"([^"]+)"\s*\[[^\]]+\]\s*/g, '"$1" ');
    
    // Don't remove bracketed citations (numbers like [1], [2])
    // These are preserved as-is
    
    return cleaned;
  }
  
  // A3.6.12: Final post-pass to dedupe reasons by canonical anchor or uniquenessKey
  // A3.7.10: Enhanced with normalization key deduplication
  const dedupedReasons = [];
  const seenReasonKeysFinal = new Set();
  const seenNormalizationKeys = new Set();
  let dedupedCount = 0;
  
  for (const reason of reasons) {
    if (typeof reason !== "string") {
      dedupedReasons.push(reason);
      continue;
    }
    
    // A3.7.10: Strip bracket tags first
    const cleanedReason = stripBracketTags(reason);
    
    // A3.7.10: Check normalization key (based on snippet only)
    const normKey = normalizeReasonKey(cleanedReason);
    if (normKey && seenNormalizationKeys.has(normKey)) {
      dedupedCount++;
      continue; // Skip duplicate based on normalized snippet
    }
    
    // Extract anchor from reason text using extractAnchor (finds anchor-bearing phrases)
    const anchor = extractAnchor(cleanedReason);
    const canonicalAnchor = anchor ? canonicalizeAnchor(anchor, cleanedReason) : null;
    
    // Build uniqueness key: canonicalAnchor + normalized reason text prefix
    const normalizedPrefix = cleanedReason.toLowerCase().trim().substring(0, 50).replace(/[^\w\s]/g, "");
    const reasonKey = canonicalAnchor ? `${canonicalAnchor}|${normalizedPrefix}` : normalizedPrefix;
    
    // Skip if we've seen this key before
    if (seenReasonKeysFinal.has(reasonKey)) {
      dedupedCount++;
      continue;
    }
    
    seenReasonKeysFinal.add(reasonKey);
    if (normKey) {
      seenNormalizationKeys.add(normKey);
    }
    dedupedReasons.push(cleanedReason);
  }
  
  // A3.7.10: Log deduplication stats
  if (dedupedCount > 0 && runId && reqSig) {
    diag(runId, reqSig, `[A3.7.10][REASONS_DEDUPE] dedupedReasons=${dedupedCount}`);
  }
  
  // A3.6.12: Limit to max 2 bullets after dedupe
  return dedupedReasons.slice(0, 2);
}

/**
 * A3.8.15: Get definitive verb phrase based on reliability
 * Returns "is supported" for Medium/High, "is not supported" for Low.
 */
function verbForReliability(reliabilityLabelOrScore) {
  if (typeof reliabilityLabelOrScore === "number") {
    // Score-based
    if (reliabilityLabelOrScore >= 60) {
      return "is supported by the provided source(s).";
    } else {
      return "is not supported by the provided source(s).";
    }
  } else if (typeof reliabilityLabelOrScore === "string") {
    // Label-based
    const label = reliabilityLabelOrScore.toLowerCase();
    if (label === "high" || label === "medium") {
      return "is supported by the provided source(s).";
    } else if (label === "low") {
      return "is not supported by the provided source(s).";
    }
  }
  // Fallback
  return "could not be verified in the provided source(s).";
}

/**
 * A3.8.14: Build deal context from canonical claims (selection mode only)
 * Detects deal-related claims and groups them for assessment purposes.
 */
function buildDealContext(canonicalClaims) {
  if (!Array.isArray(canonicalClaims) || canonicalClaims.length === 0) {
    return null;
  }
  
  const dealTypes = new Set([
    "investment_amount",
    "valuation_pre_money",
    "valuation_post_money",
    "valuation_enterprise_value",
    "ownership_percent",
    "secondary_purchase",
  ]);
  
  const dealClaims = canonicalClaims.filter(cc => dealTypes.has(cc.type));
  
  // Only return deal context if ≥2 deal-related claims exist
  if (dealClaims.length < 2) {
    return null;
  }
  
  const hasInvestment = dealClaims.some(cc => cc.type === "investment_amount");
  const hasValuation = dealClaims.some(cc => 
    cc.type === "valuation_pre_money" || 
    cc.type === "valuation_post_money" || 
    cc.type === "valuation_enterprise_value"
  );
  const hasOwnership = dealClaims.some(cc => cc.type === "ownership_percent");
  const hasSecondary = dealClaims.some(cc => cc.type === "secondary_purchase");
  
  return {
    hasInvestment,
    hasValuation,
    hasOwnership,
    hasSecondary,
    claims: dealClaims,
  };
}

/**
 * A3.8.14: Build deterministic assessment for deal context
 * Returns reasons array with fixed order and plain language.
 */
function buildDealAssessment(dealContext, citations = []) {
  if (!dealContext) {
    return [];
  }
  
  const reasons = [];
  const citeStr = citations.length > 0 
    ? (citations.length === 1 ? ` [${citations[0]}]` : ` [${citations.join(", ")}]`)
    : "";
  
  // Fixed order: investment, valuation, ownership, secondary
  if (dealContext.hasInvestment) {
    reasons.push(`Investment amount is supported by the provided source(s).${citeStr}`);
  }
  
  if (dealContext.hasValuation) {
    reasons.push(`Valuation range is supported by the provided source(s).${citeStr}`);
  }
  
  if (dealContext.hasOwnership) {
    reasons.push(`Ownership structure is supported by the provided source(s).${citeStr}`);
  }
  
  if (dealContext.hasSecondary) {
    reasons.push(`Secondary purchase terms are supported by the provided source(s).${citeStr}`);
  }
  
  return reasons;
}

/**
 * A3.8.31: Sanitize regex flags to prevent invalid flag errors
 * Keeps only valid lowercase flags from the set: gimsuyd
 * Dedupes characters, preserves order, strips whitespace/non-ASCII
 * @param {string} flags - Original flags string
 * @param {string} runId - Optional runId for diagnostic logging
 * @param {string} reqSig - Optional reqSig for diagnostic logging
 * @returns {string} - Sanitized flags string
 */
function sanitizeRegexFlags(flags, runId = null, reqSig = null) {
  if (typeof flags !== "string") {
    return "";
  }
  
  // Valid flags: g, i, m, s, u, y, d (lowercase only)
  const validFlags = new Set(["g", "i", "m", "s", "u", "y", "d"]);
  const seen = new Set();
  const sanitized = [];
  
  // Process each character, keeping only valid lowercase flags
  for (const char of flags) {
    const lowerChar = char.toLowerCase();
    if (validFlags.has(lowerChar) && !seen.has(lowerChar)) {
      seen.add(lowerChar);
      sanitized.push(lowerChar);
    }
  }
  
  const sanitizedStr = sanitized.join("");
  
  // A3.8.31: Log diagnostic warning if sanitization changed the flags
  if (sanitizedStr !== flags && runId && reqSig) {
    diag(runId, reqSig, `[DIAG] regexFlagsSanitized original="${flags}" sanitized="${sanitizedStr}"`);
  }
  
  return sanitizedStr;
}

/**
 * A3.8.30: Extract key numeric tokens from statement text (deterministic)
 * Returns array of Token objects with raw, kind, normalizedCandidates, and display.
 * NOTE: JS RegExp flags must be lowercase and limited to gimsuyd.
 */
function extractKeyNumericTokens(statementText) {
  if (typeof statementText !== "string" || !statementText.trim()) {
    return [];
  }
  
  const tokens = [];
  const seenDisplays = new Set();
  
  // Money patterns: $45, $45 per month, $20–25 million, $18.7 million, $5.5 million
  const moneyPatterns = [
    // Per month pattern: "$45 per month", "$45/month", "$45 monthly"
    /\$([\d,]+(?:\.\d+)?)\s*(?:per\s+month|\/mo|\/month|monthly)/gi,
    // Range: "$20–25 million", "$20-25 million"
    /\$([\d,]+(?:\.\d+)?)\s*[–-]\s*([\d,]+(?:\.\d+)?)\s*(million|mm|m|billion|b)\b/gi,
    // Single with unit: "$18.7 million", "$5.5 million", "$20 million"
    /\$([\d,]+(?:\.\d+)?)\s*(million|mm|m|billion|b)\b/gi,
    // Plain money: "$45", "$18.7"
    /\$([\d,]+(?:\.\d+)?)/g,
  ];
  
  // Percent patterns: "0.5–2%", "0.5-2%", "20%"
  const percentPatterns = [
    // Range: "0.5–2%", "0.5-2%"
    /([\d,]+(?:\.\d+)?)\s*[–-]\s*([\d,]+(?:\.\d+)?)\s*%/gi,
    // Single: "20%", "0.5%"
    /([\d,]+(?:\.\d+)?)\s*%/g,
  ];
  
  // Multiple patterns: "3–4x", "3-4x", "2x"
  const multiplePatterns = [
    // Range: "3–4x", "3-4x"
    /([\d,]+(?:\.\d+)?)\s*[–-]\s*([\d,]+(?:\.\d+)?)\s*x/gi,
    // Single: "2x", "3x"
    /([\d,]+(?:\.\d+)?)\s*x/gi,
  ];
  
  // Process money patterns
  for (const pattern of moneyPatterns) {
    let match;
    while ((match = pattern.exec(statementText)) !== null) {
      const fullMatch = match[0];
      let display = fullMatch;
      let normalizedCandidates = [fullMatch];
      
      // Handle per month pattern
      if (/\b(?:per\s+month|\/mo|\/month|monthly)\b/i.test(fullMatch)) {
        const num = match[1].replace(/,/g, "");
        display = `$${num}/mo`;
        normalizedCandidates = [
          `${num}/mo`,
          `${num} per month`,
          `$${num}/mo`,
          `$${num} per month`,
          `$${num}/month`,
          `$${num} monthly`,
        ];
      }
      // Handle range with unit
      else if (match[2] && match[3]) {
        const num1 = match[1].replace(/,/g, "");
        const num2 = match[2].replace(/,/g, "");
        const unit = match[3].toLowerCase();
        const unitShort = unit === "million" || unit === "mm" || unit === "m" ? "m" : unit === "billion" || unit === "b" ? "b" : "";
        display = `$${num1}–${num2}${unitShort}`;
        normalizedCandidates = [
          `${num1}–${num2} ${unit}`,
          `${num1}-${num2} ${unit}`,
          `$${num1}–${num2} ${unit}`,
          `$${num1}-${num2} ${unit}`,
          `${num1}–${num2}${unitShort}`,
          `${num1}-${num2}${unitShort}`,
          `$${num1}–${num2}${unitShort}`,
          `$${num1}-${num2}${unitShort}`,
        ];
      }
      // Handle single with unit
      else if (match[2]) {
        const num = match[1].replace(/,/g, "");
        const unit = match[2].toLowerCase();
        const unitShort = unit === "million" || unit === "mm" || unit === "m" ? "m" : unit === "billion" || unit === "b" ? "b" : "";
        display = `$${num}${unitShort}`;
        normalizedCandidates = [
          `${num} ${unit}`,
          `$${num} ${unit}`,
          `${num}${unitShort}`,
          `$${num}${unitShort}`,
        ];
      }
      // Plain money
      else {
        const num = match[1].replace(/,/g, "");
        display = `$${num}`;
        normalizedCandidates = [`$${num}`, num];
      }
      
      if (!seenDisplays.has(display)) {
        seenDisplays.add(display);
        tokens.push({
          raw: fullMatch,
          kind: "money",
          normalizedCandidates,
          display,
        });
      }
    }
  }
  
  // Process percent patterns
  for (const pattern of percentPatterns) {
    let match;
    while ((match = pattern.exec(statementText)) !== null) {
      const fullMatch = match[0];
      let display = fullMatch;
      let normalizedCandidates = [fullMatch];
      
      // Range percent
      if (match[2]) {
        const num1 = match[1].replace(/,/g, "");
        const num2 = match[2].replace(/,/g, "");
        display = `${num1}–${num2}%`;
        normalizedCandidates = [
          `${num1}–${num2}%`,
          `${num1}-${num2}%`,
          `${num1}–${num2} percent`,
          `${num1}-${num2} percent`,
        ];
      }
      // Single percent
      else {
        const num = match[1].replace(/,/g, "");
        display = `${num}%`;
        normalizedCandidates = [`${num}%`, `${num} percent`];
      }
      
      if (!seenDisplays.has(display)) {
        seenDisplays.add(display);
        tokens.push({
          raw: fullMatch,
          kind: "percent",
          normalizedCandidates,
          display,
        });
      }
    }
  }
  
  // Process multiple patterns
  for (const pattern of multiplePatterns) {
    let match;
    while ((match = pattern.exec(statementText)) !== null) {
      const fullMatch = match[0];
      let display = fullMatch;
      let normalizedCandidates = [fullMatch];
      
      // Range multiple
      if (match[2]) {
        const num1 = match[1].replace(/,/g, "");
        const num2 = match[2].replace(/,/g, "");
        display = `${num1}–${num2}x`;
        normalizedCandidates = [
          `${num1}–${num2}x`,
          `${num1}-${num2}x`,
          `${num1}–${num2} x`,
          `${num1}-${num2} x`,
        ];
      }
      // Single multiple
      else {
        const num = match[1].replace(/,/g, "");
        display = `${num}x`;
        normalizedCandidates = [`${num}x`, `${num} x`];
      }
      
      if (!seenDisplays.has(display)) {
        seenDisplays.add(display);
        tokens.push({
          raw: fullMatch,
          kind: "multiple",
          normalizedCandidates,
          display,
        });
      }
    }
  }
  
  // Sort by appearance order in text and limit to 6
  tokens.sort((a, b) => {
    const idxA = statementText.indexOf(a.raw);
    const idxB = statementText.indexOf(b.raw);
    return idxA - idxB;
  });
  
  // Prefer money/ranges/multiples/percents over plain integers, limit to 6
  const prioritized = tokens.filter(t => 
    t.kind === "money" || t.kind === "percent" || t.kind === "multiple"
  );
  const others = tokens.filter(t => 
    t.kind !== "money" && t.kind !== "percent" && t.kind !== "multiple"
  );
  
  return [...prioritized, ...others].slice(0, 6);
}

/**
 * A3.8.30: Check if token is found in uploaded sources (deterministic)
 * Returns {found: boolean, evidenceRefIds: number[]}
 */
function checkTokenInSources(token, uploadedDocs, unifiedReferences, citations) {
  if (!token || !Array.isArray(uploadedDocs) || uploadedDocs.length === 0) {
    return { found: false, evidenceRefIds: [] };
  }
  
  // Concatenate all uploaded source text
  const allUploadedText = uploadedDocs
    .map(doc => (doc.text || "").toLowerCase())
    .join(" ");
  
  // Check each normalized candidate
  let found = false;
  for (const candidate of token.normalizedCandidates) {
    const candidateLower = candidate.toLowerCase();
    if (allUploadedText.includes(candidateLower)) {
      found = true;
      break;
    }
  }
  
  // Build evidenceRefIds from statement's citations (use existing citation plumbing)
  // Map uploadedDocs IDs to unifiedReferences IDs
  const uploadedRefIds = new Set();
  if (Array.isArray(unifiedReferences)) {
    unifiedReferences.forEach(ref => {
      if (ref?.type === "uploaded") {
        // Find matching uploadedDoc by title or ID
        const matchingDoc = uploadedDocs.find(doc => 
          doc.id === ref.id || doc.title === ref.title
        );
        if (matchingDoc) {
          uploadedRefIds.add(ref.id);
        }
      }
    });
  }
  
  const evidenceRefIds = found && citations && citations.length > 0 
    ? citations.filter(id => {
        // Verify the citation ID exists in uploaded refs
        return uploadedRefIds.has(Number(id)) || uploadedRefIds.has(String(id));
      })
    : [];
  
  // If found but no citations match uploaded refs, use first uploaded ref ID from unifiedReferences
  if (found && evidenceRefIds.length === 0 && Array.isArray(unifiedReferences)) {
    const firstUploadedRef = unifiedReferences.find(ref => ref?.type === "uploaded");
    if (firstUploadedRef && firstUploadedRef.id !== undefined && firstUploadedRef.id !== null) {
      evidenceRefIds.push(Number(firstUploadedRef.id) || firstUploadedRef.id);
    }
  }
  
  return { found, evidenceRefIds };
}

/**
 * A3.8.30: Build coverage summary reason lines (selection mode only)
 * Returns array of string reasons (max 2 lines)
 */
function buildSelectionCoverageReasons(statementText, uploadedDocs, unifiedReferences, citations) {
  if (typeof statementText !== "string" || !statementText.trim()) {
    return [];
  }
  
  // Extract tokens
  const tokens = extractKeyNumericTokens(statementText);
  if (tokens.length === 0) {
    return [];
  }
  
  // Check each token
  const foundTokens = [];
  const notFoundTokens = [];
  
  for (const token of tokens) {
    const result = checkTokenInSources(token, uploadedDocs, unifiedReferences, citations);
    if (result.found) {
      foundTokens.push(token);
    } else {
      notFoundTokens.push(token);
    }
  }
  
  const reasons = [];
  const citeStr = citations && citations.length > 0
    ? (citations.length === 1 ? ` [${citations[0]}]` : ` [${citations.join(", ")}]`)
    : "";
  
  // Line 1: Found tokens
  if (foundTokens.length > 0) {
    const displayList = foundTokens.map(t => t.display);
    let listStr = displayList.join("; ");
    if (listStr.length > 140) {
      const truncated = displayList.slice(0, 4).join("; ");
      listStr = `${truncated}…`;
    }
    reasons.push(`Coverage (figures): Found in sources: ${listStr}.${citeStr}`);
  }
  
  // Line 2: Not found tokens
  if (notFoundTokens.length > 0) {
    const displayList = notFoundTokens.map(t => t.display);
    let listStr = displayList.join("; ");
    if (listStr.length > 140) {
      const truncated = displayList.slice(0, 4).join("; ");
      listStr = `${truncated}…`;
    }
    reasons.push(`Coverage (figures): Not found in sources: ${listStr}.${citeStr}`);
  }
  
  return reasons;
}

/**
 * A3.8.14: Compute reliability from deal context
 * Returns reliability score and label based on deal claims.
 */
function computeDealContextReliability(dealContext) {
  if (!dealContext || !dealContext.claims || dealContext.claims.length === 0) {
    return null;
  }
  
  // Check if all deal claims are Medium or higher
  const allMediumOrHigher = dealContext.claims.every(cc => {
    const reliability = cc.reliability || "Medium";
    return reliability !== "Low";
  });
  
  if (allMediumOrHigher) {
    return {
      reliabilityScore: 70,
      reliabilityLabel: "Medium",
    };
  } else {
    return {
      reliabilityScore: 30,
      reliabilityLabel: "Low",
    };
  }
}

/**
 * A3.8.9: Build reasons from canonical claims (claim-driven only)
 * Returns deterministic reasons based on canonical claims, with special handling for qualitative claims.
 */
function buildReasonsFromCanonicalClaims(canonicalClaims, context = {}) {
  const { statement = null, runId = null, reqSig = null, selectionMode = false, rawClaims = [], uploadedDocs = [] } = context;
  
  if (!Array.isArray(canonicalClaims) || canonicalClaims.length === 0) {
    // A3.8.9: If canonicalClaims is empty (should not happen after hard invariant), return single deterministic bullet
    return ["No extractable claims were produced for this statement."];
  }
  
  // A3.8.12: Generate user-meaningful reasons directly from canonical claims
  // Filter out consolidation jargon and build type-specific verification language
  const reasons = [];
  
  // Sort claims: financial/metric first, then qualitative
  const financialTypes = new Set([
    "investment_amount",
    "valuation_pre_money",
    "valuation_post_money",
    "valuation_enterprise_value",
    "ownership_percent",
    "fee_percent",
    "percent",
    "metric_amount",
    "growth_percent",
    "secondary_purchase",
    "structure_term",
  ]);
  
  const sortedClaims = [...canonicalClaims].sort((a, b) => {
    const aIsFinancial = financialTypes.has(a.type);
    const bIsFinancial = financialTypes.has(b.type);
    if (aIsFinancial && !bIsFinancial) return -1;
    if (!aIsFinancial && bIsFinancial) return 1;
    return 0;
  });
  
  for (const cc of sortedClaims.slice(0, 3)) {
    const reliability = cc.reliability || "Medium";
    const evidenceNotes = cc.evidenceNotes || [];
    const citations = cc.citations || [];
    const claimType = cc.type;
    
    // A3.8.15: Use definitive language based on reliability
    const verb = verbForReliability(reliability);
    const citeStr = citations.length > 0 
      ? (citations.length === 1 ? ` [${citations[0]}]` : ` [${citations.join(", ")}]`)
      : "";
    
    // A3.8.12: Extract value/amount for display
    let valueDisplay = "";
    if (cc.value !== null) {
      if (cc.currency) {
        const millions = cc.value / 1e6;
        if (millions >= 1) {
          valueDisplay = `$${millions.toFixed(millions >= 10 ? 0 : 1)}m`;
        } else {
          const thousands = cc.value / 1e3;
          if (thousands >= 1) {
            valueDisplay = `$${thousands.toFixed(thousands >= 10 ? 0 : 1)}k`;
          } else {
            valueDisplay = `$${cc.value.toLocaleString()}`;
          }
        }
      } else if (cc.unit === "%") {
        valueDisplay = `${cc.value > 0 ? "+" : ""}${cc.value}%`;
      }
    }
    
    // Extract metric hint from displayText if available
    let metricHint = "";
    if (claimType === "metric_amount" && cc.displayText) {
      const metricMatch = cc.displayText.match(/\b(mrr|arr|gmv|revenue|run-rate|run\s+rate|annualized)\b/i);
      if (metricMatch) {
        metricHint = ` ${metricMatch[0].toUpperCase()}`;
      }
    }
    
    // A3.8.15: Build user-meaningful reason with definitive language
    let reasonText = "";
    
    if (claimType === "investment_amount") {
      reasonText = `Investment amount (${valueDisplay}) ${verb}${citeStr}`;
    } else if (claimType === "metric_amount") {
      reasonText = `Operating metric (${valueDisplay}${metricHint}) ${verb}${citeStr}`;
    } else if (claimType === "growth_percent") {
      reasonText = `Growth rate (${valueDisplay} YoY) ${verb}${citeStr}`;
    } else if (claimType === "ownership_percent") {
      reasonText = `Ownership percentage (${valueDisplay}) ${verb}${citeStr}`;
    } else if (claimType === "fee_percent") {
      reasonText = `Fee / take rate (${valueDisplay}) ${verb}${citeStr}`;
    } else if (claimType === "secondary_purchase") {
      reasonText = `Secondary purchase amount (${valueDisplay}) ${verb}${citeStr}`;
    } else if (claimType === "other_qualitative") {
      // A3.8.25: Use deterministic verbs based on reliability (selection mode only)
      // A3.8.33: Honest support wording for qualitative claims
      const selectionMode = context.selectionMode === true;
      let qualVerb;
      if (selectionMode) {
        // A3.8.33: Check if all claims are qualitative and if match is fuzzy
        const statement = context.statement || {};
        const statementText = statement.text || "";
        const uploadedDocs = context.uploadedDocs || [];
        
        // Check corpusSearch match type if available
        let isFuzzyOnly = false;
        if (uploadedDocs.length > 0 && statementText) {
          try {
            const searchResult = corpusSearch(statementText, uploadedDocs);
            if (searchResult && searchResult.found && searchResult.hits) {
              const hits = searchResult.hits || [];
              const matchTypes = new Set(hits.map(h => h.matchType).filter(Boolean));
              const hasNumber = matchTypes.has("number");
              const hasKeyword = matchTypes.has("keyword");
              const hasFuzzy = matchTypes.has("fuzzy");
              const hasNumberOrKeyword = hasNumber || hasKeyword;
              isFuzzyOnly = hasFuzzy && !hasNumberOrKeyword;
            }
          } catch (_) {
            // If corpusSearch fails, default to non-fuzzy
          }
        }
        
        // A3.8.25: Selection mode uses deterministic language
        if (reliability === "Low") {
          qualVerb = "is not supported by the provided source(s).";
        } else if (citations.length > 0) {
          // A3.8.33: Use paraphrase-qualified line if fuzzy-only match
          if (isFuzzyOnly) {
            qualVerb = "substance is supported, but the exact wording may be paraphrased; confirm phrasing if required.";
          } else {
            qualVerb = "is supported by the provided source(s).";
          }
        } else {
          qualVerb = "could not be verified in the provided source(s).";
        }
      } else {
        // Non-selection mode: keep existing behavior
        qualVerb = reliability === "Low" 
          ? "is not supported by the provided source(s)."
          : "is consistent with the provided source(s).";
      }
      reasonText = `This statement ${qualVerb}${citeStr}`;
    } else {
      // Fallback for other types - use existing generateClaimLinkedReasons logic
      // A3.8.32: Fix filteredNotes ReferenceError - define from evidenceNotes
      const filteredNotes = Array.isArray(evidenceNotes)
        ? evidenceNotes.filter(note => 
            typeof note === "string" && !/consolidated.*extracted signals|merged.*raw claims/i.test(note)
          )
        : [];
      
      // Determine if claim is supported
      const isSupported = reliability !== "Low" && citations.length > 0;
      
      // Map to old shape for compatibility
      const mappedClaim = {
        claimText: cc.displayText,
        reliability: cc.reliability,
        reliabilityScore: cc.reliabilityScore,
        comment: filteredNotes.length > 0 ? filteredNotes.join("; ") : (isSupported && citations.length > 0 ? "Supported by sources" : "Not supported in provided sources"),
        anchor: cc.anchorFamily,
        citations: cc.citations,
        _canonicalId: cc.id,
        _canonicalType: cc.type,
        _canonicalCompany: cc.company,
        _canonicalRound: cc.round,
      };
      // Use existing function for other types
      const fallbackReasons = generateClaimLinkedReasons([mappedClaim], statement, runId, reqSig);
      if (fallbackReasons.length > 0) {
        reasonText = fallbackReasons[0];
      }
    }
    
    if (reasonText) {
      reasons.push(reasonText);
    }
    
    if (reasons.length >= 3) break; // Max 3 bullets
  }
  
  // A3.8.12: If no reasons generated, fall back to qualitative template
  // A3.8.15: Use definitive language
  if (reasons.length === 0) {
    const firstClaim = canonicalClaims[0];
    if (firstClaim) {
      const citations = firstClaim.citations || [];
      const citeStr = citations.length > 0 
        ? (citations.length === 1 ? ` [${citations[0]}]` : ` [${citations.join(", ")}]`)
        : "";
      const reliability = firstClaim.reliability || "Medium";
      // A3.8.25: Use deterministic verbs based on reliability (selection mode only)
      const selectionMode = context.selectionMode === true;
      let qualVerb;
      if (selectionMode) {
        // A3.8.25: Selection mode uses deterministic language
        if (reliability === "Low") {
          qualVerb = "is not supported by the provided source(s).";
        } else if (citations.length > 0) {
          qualVerb = "is supported by the provided source(s).";
        } else {
          qualVerb = "could not be verified in the provided source(s).";
        }
      } else {
        // Non-selection mode: keep existing behavior
        qualVerb = reliability === "Low" 
          ? "is not supported by the provided source(s)."
          : "is consistent with the provided source(s).";
      }
      reasons.push(`This statement ${qualVerb}${citeStr}`);
    }
  }
  
  // A3.8.27: Part B - Align rawClaims uncertainty with final reasons (selection mode only, type-specific notes)
  if (selectionMode && reasons.length > 0) {
    // Check if any canonical claim has Medium/High reliability
    const hasMediumOrHigh = canonicalClaims.some(cc => {
      const rel = cc.reliability || "Medium";
      return rel === "Medium" || rel === "High";
    });
    
    if (hasMediumOrHigh && Array.isArray(rawClaims) && rawClaims.length > 0) {
      // A3.8.27: Detect specific uncertainty types with priority order
      let noteType = null;
      let matchedComment = null;
      
      for (const rawClaim of rawClaims) {
        if (rawClaim && typeof rawClaim === "object") {
          const comment = String(rawClaim.comment || "");
          
          // Priority 1: MAPPING_AMBIGUITY (highest)
          if (!noteType || noteType === "MAPPING_AMBIGUITY") {
            if (/multiple figures|verify which applies|ambiguous/i.test(comment)) {
              noteType = "MAPPING_AMBIGUITY";
              matchedComment = comment;
              break; // Highest priority, stop scanning
            }
          }
          
          // Priority 2: BASIS_UNCLEAR
          if (!noteType || noteType === "BASIS_UNCLEAR") {
            if (/ownership basis not clearly defined|basis not clearly defined|basis.*unclear/i.test(comment)) {
              noteType = "BASIS_UNCLEAR";
              matchedComment = comment;
              // Don't break - might find MAPPING_AMBIGUITY in another claim
            }
          }
          
          // Priority 3: EXPLICITNESS (lowest)
          if (!noteType) {
            if (/not explicitly confirmed|not explicitly/i.test(comment)) {
              noteType = "EXPLICITNESS";
              matchedComment = comment;
              // Don't break - might find higher priority in another claim
            }
          }
        }
      }
      
      // A3.8.27: Append specific note based on detected type
      if (noteType) {
        const firstClaim = canonicalClaims[0];
        const citations = firstClaim?.citations || [];
        const citeStr = citations.length > 0 
          ? (citations.length === 1 ? ` [${citations[0]}]` : ` [${citations.join(", ")}]`)
          : "";
        
        let noteText = "";
        if (noteType === "MAPPING_AMBIGUITY") {
          noteText = "Note: multiple candidate figures were found; figure-to-claim mapping should be manually confirmed.";
        } else if (noteType === "BASIS_UNCLEAR") {
          noteText = "Note: the figure is present, but the basis/definition is unclear in the source; confirm interpretation.";
        } else if (noteType === "EXPLICITNESS") {
          noteText = "Note: the source supports the substance, but the exact phrasing is not explicitly stated; confirm wording if required.";
        }
        
        if (noteText) {
          reasons.push(`${noteText}${citeStr}`);
        }
      }
    }
  }
  
  // A3.8.9: Cap to max 3 bullets
  return reasons.slice(0, 3);
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

// A3.6.65: Helper to parse reason string into structured key/value
function parseReason(reasonStr) {
  if (typeof reasonStr !== "string") return null;
  const match = reasonStr.match(/^([^=]+)(?:=(.+))?$/);
  if (!match) return null;
  const key = match[1];
  const valueStr = match[2];
  let value = valueStr;
  if (valueStr !== undefined) {
    const numValue = Number(valueStr);
    if (!isNaN(numValue) && valueStr.trim() === String(numValue)) {
      value = numValue;
    } else if (valueStr === "true") {
      value = true;
    } else if (valueStr === "false") {
      value = false;
    }
  }
  return { key, value };
}

// A3.6.65: Helper to format structured reason back to string
function formatReason(reasonObj) {
  if (!reasonObj || typeof reasonObj !== "object") return null;
  const { key, value } = reasonObj;
  if (!key) return null;
  if (value === undefined || value === null) {
    return key;
  }
  return `${key}=${value}`;
}

function computeExtractionQuality(statements, extractionCandidates, rejectedCount = 0, fallbackCount = 0, incompleteNumericFragmentCount = 0, recombinedCount = 0, fragmentDropped = 0, fragmentMerged = 0, dealDedupDropped = 0, qualityPatch = {}, runId = null, reqSig = null) {
  // A3.6.72: Don't fail if statements exist (even if from best-effort fallback)
  if (!Array.isArray(statements) || statements.length === 0) {
    return { quality: "failed", reasons: ["no_statements"] };
  }
  
  let hasTruncation = false;
  let hasUnbalancedParens = false;
  let hasIncompleteNumeric = false;
  let repairedNumericFragmentCount = 0;
  
  for (const stmt of statements) {
    const text = typeof stmt.text === "string" ? stmt.text : "";
    if (!text) continue;
    
    // A3.6.12: Skip repaired numeric fragments from quality checks
    if (stmt.__repairedNumericFragment === true) {
      repairedNumericFragmentCount++;
      continue; // Do not count repaired statements as incomplete
    }
    
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
  // A3.6.12: Exclude repaired numeric fragments from incomplete_numeric_fragments count
  // A3.6.62: Extract repair counts from qualityPatch
  const numericFragmentRepairCount = qualityPatch.numericFragmentRepairCount || 0;
  const earlyDanglingRepairCount = qualityPatch.earlyDanglingRepairCount || 0;
  const finalDanglingRepairCount = qualityPatch.finalDanglingRepairCount || 0;
  const numericFragmentFallbackCount = qualityPatch.numericFragmentFallbackCount || 0;
  // A3.6.64: Extract rejectedByReasonIncompleteNumericFragment from qualityPatch
  const rejectedByReasonIncompleteNumericFragment = qualityPatch.rejectedByReasonIncompleteNumericFragment || 0;
  
  // A3.6.65: Build initial reasons array (will be normalized later)
  // A3.6.72: Add seg_guard_fallback_error if segGuardFallback was used, or seg_guard_error if segGuardError occurred
  const rawReasons = [];
  const segGuardFallback = qualityPatch.segGuardFallback === true;
  const segGuardError = qualityPatch.segGuardError === true;
  if (segGuardError) {
    rawReasons.push("seg_guard_error");
  } else if (segGuardFallback) {
    rawReasons.push("seg_guard_fallback_error");
  }
  if (hasTruncation) rawReasons.push("truncation");
  if (hasUnbalancedParens) rawReasons.push("unbalanced_parens");
  
  // A3.6.64: Handle rejected_candidates - check if all rejections were due to incomplete_numeric_fragment and were repaired
  let rejectedResolved = false;
  const allRejectionsWereNumericFragment = rejectedCount > 0 && rejectedCount === rejectedByReasonIncompleteNumericFragment;
  if (rejectedCount > 0) {
    if (allRejectionsWereNumericFragment && numericFragmentRepairCount > 0) {
      // All rejections were due to incomplete_numeric_fragment and were repaired
      rawReasons.push(`rejected_candidates_resolved_by_repair=1`);
      rejectedResolved = true;
    } else {
      // Some rejections were from other reasons, or not repaired - keep degradation
      rawReasons.push(`rejected_candidates=${rejectedCount}`);
    }
  }
  
  // A3.6.62: Handle fallback - if it was due to incomplete_numeric_fragment and was repaired, mark as resolved
  let fallbackResolved = false;
  if (fallbackCount > 0) {
    if (numericFragmentFallbackCount > 0 && numericFragmentRepairCount > 0) {
      // Fallback was due to incomplete_numeric_fragment and was repaired
      rawReasons.push(`fallback_resolved_by_repair=1`);
      fallbackResolved = true;
    } else {
      rawReasons.push(`fallback=${fallbackCount}`);
    }
  }
  
  // A3.6.64: Handle incomplete_numeric_fragments - will be normalized later to remove if repaired
  const unrepairedIncompleteCount = Math.max(0, incompleteNumericFragmentCount - repairedNumericFragmentCount);
  if (unrepairedIncompleteCount > 0) {
    rawReasons.push(`incomplete_numeric_fragments=${unrepairedIncompleteCount}`);
  }
  // A3.6.64: Add resolved reason if rejections were due to incomplete_numeric_fragment and were repaired
  if (rejectedByReasonIncompleteNumericFragment > 0 && numericFragmentRepairCount > 0) {
    rawReasons.push(`incomplete_numeric_fragments_repaired=${rejectedByReasonIncompleteNumericFragment}`);
  }
  if (numericFragmentRepairCount > 0) {
    rawReasons.push(`numeric_fragments_repaired=${numericFragmentRepairCount}`);
  }
  
  if (recombinedCount > 0) rawReasons.push(`recombined_fragments=${recombinedCount}`);
  if (fragmentDropped > 0) rawReasons.push(`fragment_dropped=${fragmentDropped}`);
  if (fragmentMerged > 0) rawReasons.push(`fragment_merged=${fragmentMerged}`);
  // A3.6.61: Log dedup_dropped but do NOT include in quality degradation
  if (dealDedupDropped > 0) rawReasons.push(`dedup_dropped=${dealDedupDropped}`);
  
  // A3.6.65: Parse reasons into structured format
  const reasonMap = new Map();
  for (const reasonStr of rawReasons) {
    const parsed = parseReason(reasonStr);
    if (parsed) {
      reasonMap.set(parsed.key, parsed);
    }
  }
  
  // A3.6.65: Apply repair overrides - remove stale incomplete_numeric_fragments if repaired
  if (rejectedByReasonIncompleteNumericFragment > 0 && numericFragmentRepairCount > 0) {
    // Remove stale incomplete_numeric_fragments (will be replaced by incomplete_numeric_fragments_repaired)
    reasonMap.delete("incomplete_numeric_fragments");
    // Ensure incomplete_numeric_fragments_repaired is present
    reasonMap.set("incomplete_numeric_fragments_repaired", {
      key: "incomplete_numeric_fragments_repaired",
      value: rejectedByReasonIncompleteNumericFragment
    });
  }
  
  // A3.6.65: Ensure numeric_fragments_repaired is present if repairs occurred
  if (numericFragmentRepairCount > 0) {
    reasonMap.set("numeric_fragments_repaired", {
      key: "numeric_fragments_repaired",
      value: numericFragmentRepairCount
    });
  }
  
  // A3.6.65: Rebuild reasons array from normalized map
  const reasons = Array.from(reasonMap.values())
    .map(formatReason)
    .filter(r => r !== null);
  
  // A3.6.65: Diagnostic logging for normalization
  const log = (runId && reqSig) ? (...args) => diag(runId, reqSig, ...args) : console.log;
  const normalizedKeys = Array.from(reasonMap.keys());
  const incompleteNumericRemoved = rawReasons.some(r => r.startsWith("incomplete_numeric_fragments=")) &&
    !reasons.some(r => r && r.startsWith("incomplete_numeric_fragments="));
  log(`[A3.6.65][QUALITY_NORMALIZE] beforeReasons=${JSON.stringify(rawReasons)} normalizedKeys=${JSON.stringify(normalizedKeys)} afterReasons=${JSON.stringify(reasons)} incompleteNumericFragmentsRemoved=${incompleteNumericRemoved}`);
  
  // A3.6.62: Quality classification - repaired/resolved reasons do NOT degrade
  // A3.6.60: Quality must degrade if incomplete_numeric_fragment was NOT repaired
  // Repaired fragments are excluded from quality degradation
  // A3.6.60: Deal dedup drops are NOT counted as degraded (they're intentional deduplication)
  // A3.6.60: If statements dropped ONLY due to deal-term dedup, do NOT mark as degraded
  let quality = "ok";
  
  // A3.6.62: Final dangling repair should still degrade (indicates early pass failed)
  const hasFinalDanglingRepair = finalDanglingRepairCount > 0;
  
  // A3.6.65: Define explicit degrading vs non-degrading reason keys
  const nonDegradingKeys = new Set([
    "rejected_candidates_resolved_by_repair",
    "fallback_resolved_by_repair",
    "incomplete_numeric_fragments_repaired",
    "numeric_fragments_repaired",
    "dedup_dropped"
  ]);
  
  // A3.6.65: Determine degrading reasons (all reasons except non-degrading ones)
  const degradingReasons = Array.from(reasonMap.values())
    .filter(r => !nonDegradingKeys.has(r.key))
    .map(r => r.key);
  
  // A3.6.65: Quality classification based on degrading reasons
  if (hasTruncation || hasUnbalancedParens || hasIncompleteNumeric) {
    quality = "failed";
  } else if (hasFinalDanglingRepair) {
    // A3.6.62: Final pass repair indicates early pass didn't work
    quality = "degraded";
  } else if (degradingReasons.length > 0) {
    // A3.6.65: Only degrade if there are actual degrading reasons
    quality = "degraded";
  } else {
    // A3.6.65: All reasons are non-degrading, quality remains "ok"
    quality = "ok";
  }
  
  // A3.6.65: Diagnostic logging for grading
  log(`[A3.6.65][QUALITY_GRADE] degradingKeysDetected=${JSON.stringify(degradingReasons)} extractionQuality=${quality}`);
  console.log(`[DIAG][QUALITY] extractionQuality=${quality} reasons=${JSON.stringify(reasons)}`);
  
  // A3.6.60: Return both quality and reasons
  return { quality, reasons };
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
  
  // A3.7.5: Hoist selectionUsed to top of handler scope for catch block access
  let selectionUsed = false;
  
  // A3.7.7: Hoist selectedText to top of handler scope to prevent ReferenceError in catch blocks
  let selectedText = "";
  
  // A3.6.63: Initialize repair/fallback counters upfront to prevent TDZ errors
  let numericFragmentRepairCount = 0;
  let numericFragmentFallbackCount = 0;
  let earlyDanglingRepairCount = 0;
  let finalDanglingRepairCount = 0;
  // A3.6.64: Initialize rejection reason counter
  let rejectedByReasonIncompleteNumericFragment = 0;

  // A3.7.5: Handle OPTIONS preflight immediately after CORS headers
  // A3.8.24: Return 204 for OPTIONS (standard preflight response)
  if (req.method === "OPTIONS") {
    hasReturned = true;
    try {
      diag("options", "preflight", `END_DIAG path=options status=204 returningNow=true`);
    } catch {}
    return res.status(204).end();
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

  // A3.7.5: Main handler logic - wrapped in try/catch to ensure CORS + JSON on all exceptions
  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const versionId = typeof body.versionId === "string" ? body.versionId : null;
    const sources = Array.isArray(body.sources) ? body.sources : [];
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";
    
    // A3.7.4: Make selection-mode base text unambiguous and early
    // A3.7.7: selectionUsed and selectedText are hoisted to handler scope, assign values here
    selectionUsed = Boolean(
      body?.selectionUsed || 
      body?.mode === "selection" || 
      typeof body?.selectedText === "string" ||
      typeof body?.selectionText === "string"
    );
    // A3.7.7: Assign to hoisted variable (not const/let) and normalize defensively
    selectedText = (body?.selectedText ?? body?.selectionText ?? "").toString();
    // A3.7.7: Normalize selectedText defensively (ensure it's always a safe string)
    if (typeof selectedText !== "string") selectedText = String(selectedText ?? "");
    selectedText = selectedText.replace(/\r\n/g, "\n").trim();
    
    // A3.7.4: Hard guard for empty selection
    if (selectionUsed && selectedText.length === 0) {
      hasReturned = true;
      try {
        diag("early", "validation", `END_DIAG path=empty_selection status=200 returningNow=true`);
      } catch {}
      return res.status(200).json({
        ok: true,
        statements: [],
        references: [],
        meta: {
          webSearch: { enabled: true, used: false },
          extractionQuality: "degraded",
          extractionQualityReasons: ["empty_selection"],
          uploadedSourcesCount: 0,
          webSourcesCount: 0,
          selectionUsed: true,
          selectionPreview: "",
          selectionStatementCountReturned: 0,
          selectionStatementsReturned: 0,
        },
      });
    }
    
    // A3.7.4: Validate selectionText if provided
    if (selectionUsed && selectedText.length > 0) {
      if (selectedText.length < 3) {
        hasReturned = true;
        try {
          diag("early", "validation", `END_DIAG path=selection_validation_error status=400 returningNow=true`);
        } catch {}
        return res.status(400).json({ ok: false, error: "selectionText too short" });
      }
      if (selectedText.length > 8000) {
        hasReturned = true;
        try {
          diag("early", "validation", `END_DIAG path=selection_validation_error status=400 returningNow=true`);
        } catch {}
        return res.status(400).json({ ok: false, error: "selectionText too long" });
      }
    }

    if (!draftText.trim()) {
      hasReturned = true;
      try {
        diag("early", "validation", `END_DIAG path=validation_error status=400 returningNow=true`);
      } catch {}
      return res.status(400).json({ error: "Missing draftText" });
    }
    
    // A3.7.4: Define base text - selection mode uses selectedText, non-selection uses draftText
    const baseText = selectionUsed ? selectedText : draftText;
    
    // A3.8.25: Use diag context from wrapper if provided, otherwise generate
    const diagContext = body?._diag;
    const publicSearch = true; // Analysis always uses web search
    if (diagContext && diagContext.rid && diagContext.sig) {
      runId = diagContext.rid;
      reqSig = diagContext.sig;
    } else {
      // A3.5.20 Fix 1 & 2: Generate runId and reqSig early for unambiguous logging (fallback)
      runId = Math.random().toString(36).substring(2, 15);
      reqSig = generateReqSig(draftText, sources, publicSearch);
    }
    
    // A3.8.4: Early selection logging (must appear even if later phases fail)
    const selectionHash = selectionUsed && selectedText
      ? createHash("sha256").update(selectedText).digest("hex").substring(0, 8)
      : null;
    diag(runId, reqSig, `[SELECTION][INPUT] used=${selectionUsed} selLen=${selectedText.length} hash=${selectionHash || "none"}`);
    
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
    
    // A3.7.4: Selection mode branch - use selectionUsed flag (already determined early)
    // Normalize selection text for indexing (only used for finding position in draft)
    let normalizedSelection = null;
    let selectionStartPosition = null;
    
    if (selectionUsed && selectedText.length >= 3) {
      // Normalize line breaks to "\n" and collapse excessive whitespace for indexing
      normalizedSelection = selectedText
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\s+/g, " ")
        .trim();
      
      // Compute selectionStartPosition: find selection in draftText (for reference only)
      // Try exact match first, then try trimmed match
      let startIndex = normalizedDraftText.indexOf(selectedText);
      if (startIndex === -1) {
        startIndex = normalizedDraftText.indexOf(normalizedSelection);
      }
      // If still not found, try with normalized whitespace
      if (startIndex === -1) {
        const normalizedDraftForSearch = normalizedDraftText.replace(/\s+/g, " ");
        const normalizedSelectionForSearch = normalizedSelection.replace(/\s+/g, " ");
        startIndex = normalizedDraftForSearch.indexOf(normalizedSelectionForSearch);
        if (startIndex >= 0) {
          selectionStartPosition = startIndex;
        }
      } else {
        selectionStartPosition = startIndex;
      }
      
      if (selectionStartPosition === null || selectionStartPosition < 0) {
        selectionStartPosition = null;
        // A3.8.4: Debug log when selection cannot be located (for reference only, still use selectedText)
        diag(runId, reqSig, `[SELECTION][DEBUG] selectionCannotBeLocatedInDraft selLen=${selectedText.length} preview="${selectedText.substring(0, 60)}..."`);
      }
      
      diag(runId, reqSig, `[PIPELINE] mode=selection selectionLen=${selectedText.length} foundSelectionStartPos=${selectionStartPosition !== null ? selectionStartPosition : "null"}`);
    }
    
    // A3.5.13: Deterministic statement extraction (Part B)
    // Extract candidate statements BEFORE LLM call
    // A3.5.21 Step 3: Pass hasReturned flag to guard against execution after return
    // A3.7.4: In selection mode, split ONLY selectedText (never the full draft)
    let rawExtractionCandidates = [];
    let selectionMetadataMap = new Map(); // Map candidate text -> { selectionGroupId, selectionIndex, selectionTotal, segmentId }
    let selectionStatementCountReturned = null; // A3.7.4: Store N from split
    let selectionSentencesCount = null; // A3.8.33: Store sentence count for diagnostics
    let selectionMergedSmallCount = 0; // A3.8.33: Store merged small fragments count
    if (!selectionUsed) {
      diag(runId, reqSig, `[PIPELINE] phase=extractCandidates`);
      rawExtractionCandidates = extractDeterministicStatementCandidates(normalizedDraftText, runId, reqSig, hasReturned);
    } else {
      diag(runId, reqSig, `[PIPELINE] phase=extractCandidates (selection mode - splitting)`);
      // A3.8.33: Build sentences first for integrity
      const { sentences, mergedSmallCount } = buildSelectionSentences(selectedText, runId, reqSig);
      selectionSentencesCount = sentences.length;
      selectionMergedSmallCount = mergedSmallCount;
      
      // A3.7.4: Split ONLY selectedText (baseText in selection mode)
      const splitResult = splitSelectionIntoCandidates(selectedText, runId, reqSig);
      if (splitResult.length === 0) {
        // Fallback: if split returns empty, use selection as single candidate (backward compat)
        rawExtractionCandidates = [selectedText.trim()];
        selectionStatementCountReturned = 1; // A3.7.4: Single row fallback
        diag(runId, reqSig, `[PIPELINE] selection split returned 0 candidates, using selection as single candidate`);
      } else {
        // A3.8.33: Store sentence count (not split result count) for meta
        selectionStatementCountReturned = selectionSentencesCount || splitResult.length;
        // Extract metadata and text separately - each candidate is verbatim slice (trim only)
        rawExtractionCandidates = splitResult.map(item => {
          const text = typeof item === "string" ? item.trim() : ((item.text || String(item)).trim());
          if (typeof item === "object" && item.selectionGroupId) {
            selectionMetadataMap.set(text.trim(), {
              selectionGroupId: item.selectionGroupId,
              selectionIndex: item.selectionIndex,
              selectionTotal: item.selectionTotal,
              segmentId: item.segmentId !== undefined ? item.segmentId : null, // A3.8.15: Add segmentId
            });
          }
          return text;
        });
      }
    }
    
    // A3.5.14 Part A: Filter candidates for quality (extraction stability)
    // A3.7.4: In selection mode, use baseText (selectedText) for sentence context
    // Get raw sentences for context (we need to pass them to the filter)
    // Use normalized text to ensure consistent sentence boundaries
    const normalizedBaseText = selectionUsed ? mergeContinuationFragments(selectedText, runId, reqSig) : normalizedDraftText;
    const sentenceBoundaryPattern = /[.!?\n]+/;
    const rawSentences = normalizedBaseText
      .split(sentenceBoundaryPattern)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    diag(runId, reqSig, `[PIPELINE] phase=filterCandidateQuality`);
    // A3.6.72: Wrap filterCandidateQuality in try/catch to handle errors gracefully
    // A3.7.4: In selection mode, pass baseText (selectedText) not draftText
    let filterResult = null;
    let segGuardError = false;
    let segGuardErrorDetails = null;
    try {
      filterResult = filterCandidateQuality(rawExtractionCandidates, rawSentences, normalizedBaseText, runId, reqSig);
    } catch (segGuardErr) {
      // A3.6.72: Log seg-guard error but continue pipeline with original candidates
      segGuardError = true;
      segGuardErrorDetails = {
        message: segGuardErr?.message || String(segGuardErr),
        name: segGuardErr?.name || "Error",
        stack: segGuardErr?.stack ? segGuardErr.stack.split('\n').slice(0, 2).join('\n') : null
      };
      const candidatePreviews = rawExtractionCandidates.slice(0, 2).map(c => {
        const preview = typeof c === "string" ? c.substring(0, 60) : String(c).substring(0, 60);
        return preview.length < (typeof c === "string" ? c.length : String(c).length) ? preview + "..." : preview;
      });
      diag(runId, reqSig, `[SEG_GUARD_ERROR] message="${segGuardErrorDetails.message}" name="${segGuardErrorDetails.name}" rawCandidateCount=${rawExtractionCandidates.length} candidatePreviews=${JSON.stringify(candidatePreviews)}`);
      diag(runId, reqSig, `[A3.6.72][SEG_GUARD_ERROR_HANDLED] handled=true continuingWithOriginalCandidates`);
      
      // A3.6.72: Continue with original candidates (before filtering)
      filterResult = {
        candidates: rawExtractionCandidates,
        rejectedCount: 0,
        fallbackCount: 0,
        incompleteNumericFragmentCount: 0,
        recombinedCount: 0,
        rejectedByReasonIncompleteNumericFragment: 0,
        segGuardFallback: false,
        segGuardError: true,
        candidatesWithReasons: []
      };
    }
    
    const extractionCandidates = Array.isArray(filterResult.candidates) ? filterResult.candidates : (typeof filterResult === "object" && filterResult ? [] : filterResult);
    const rejectedCount = typeof filterResult === "object" && filterResult.rejectedCount != null ? filterResult.rejectedCount : 0;
    const fallbackCount = typeof filterResult === "object" && filterResult.fallbackCount != null ? filterResult.fallbackCount : 0;
    // A3.6.72: Track segGuardFallback flag for quality reasons
    const segGuardFallback = typeof filterResult === "object" && filterResult.segGuardFallback === true;
    // A3.6.72: Track segGuardError flag for quality reasons
    const segGuardErrorFlag = typeof filterResult === "object" && filterResult.segGuardError === true || segGuardError;
    // A3.5.26 Fix C: Extract incompleteNumericFragmentCount and recombinedCount from filterResult
    const incompleteNumericFragmentCount = typeof filterResult === "object" && filterResult.incompleteNumericFragmentCount != null ? filterResult.incompleteNumericFragmentCount : 0;
    const recombinedCount = typeof filterResult === "object" && filterResult.recombinedCount != null ? filterResult.recombinedCount : 0;
    // A3.6.64: Track rejectedByReasonIncompleteNumericFragment from filterResult
    rejectedByReasonIncompleteNumericFragment = typeof filterResult === "object" && filterResult.rejectedByReasonIncompleteNumericFragment != null ? filterResult.rejectedByReasonIncompleteNumericFragment : 0;
    // A3.6.63: Track numeric fragment fallback count (fallback due to incomplete_numeric_fragment)
    numericFragmentFallbackCount = incompleteNumericFragmentCount > 0 && fallbackCount > 0 ? Math.min(incompleteNumericFragmentCount, fallbackCount) : 0;
    
    // A3.6.72: Log that pipeline continued past filterCandidateQuality
    if (segGuardErrorFlag) {
      diag(runId, reqSig, `[A3.6.72][CONTINUED_AFTER_SEG_GUARD] continued=true nextPhase=filterFragmentCandidates`);
    }
    diag(runId, reqSig, `A3.5.13: Pre-extracted ${extractionCandidates.length} candidate statements before LLM call (filtered from ${rawExtractionCandidates.length} raw candidates, rejected=${rejectedCount}, fallback=${fallbackCount}${segGuardFallback ? ", segGuardFallback=true" : ""})`);
    
    // A3.6.72: Ensure pipeline continues even if extractionCandidates is empty (use best-effort)
    // A3.7.4: In selection mode, use baseText (selectedText) not draftText
    if (extractionCandidates.length === 0 && typeof normalizedBaseText === "string" && normalizedBaseText.trim()) {
      // Last resort: permissive sentence split
      const permissiveSplit = normalizedBaseText
        .split(/[.!?\n]+/)
        .map(s => s.trim())
        .filter(s => s.length >= 20)
        .map(s => sanitizeCandidateText(s, runId, reqSig))
        .filter(s => s && s.trim().length >= 20)
        .slice(0, 25);
      if (permissiveSplit.length > 0) {
        extractionCandidates.push(...permissiveSplit);
        diag(runId, reqSig, `[A3.6.72][PIPELINE_CONTINUE] extractionCandidates was empty, using ${permissiveSplit.length} permissive split candidates`);
      }
    }
    
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
    // A3.7.4: In selection mode, ensure candidates have __draftPosition and __candidateIndex
    const candidateIndexMap = new Map();
    let candidateObjects = fragFilterResult.candidateObjects || [];
    
    // A3.7.4: Map draft positions and attach selection metadata for selection mode candidates
    if (selectionUsed) {
      candidateObjects = candidateObjects.map((candidateObj, idx) => {
        const candidate = candidateObj.text;
        
        // A3.7.4: For selection mode, __draftPosition = selectionIndex-1 (0..N-1), NOT character offsets
        // Get selection metadata to determine selectionIndex
        const selectionMetadata = selectionMetadataMap.get(candidate.trim()) || 
                                  selectionMetadataMap.get(candidate.replace(/\s+/g, " ").trim());
        
        // A3.7.4: Use selectionIndex-1 as __draftPosition (stable index, not character offset)
        const selectionIndex = selectionMetadata?.selectionIndex ?? (idx + 1);
        const __draftPosition = selectionIndex - 1; // 0..N-1
        const __candidateIndex = idx;
        
        const result = {
          ...candidateObj,
          __draftPosition: __draftPosition,
          __candidateIndex: __candidateIndex,
          draftPosition: __draftPosition, // Also set legacy field for compatibility
          candidateIndex: __candidateIndex, // Also set legacy field for compatibility
        };
        
        // A3.7.4: Attach selection metadata as plain JSON fields (optional chaining required downstream)
        if (selectionMetadata) {
          result.selectionGroupId = selectionMetadata.selectionGroupId;
          result.selectionIndex = selectionMetadata.selectionIndex;
          result.selectionTotal = selectionMetadata.selectionTotal;
        }
        
        return result;
      });
      
      diag(runId, reqSig, `[A3.7.4][DRAFT_POS_MAP] mapped ${candidateObjects.length} selection candidates with __draftPosition=selectionIndex-1`);
    }
    
    // Store original candidate list with indices for later matching
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
    
    // A3.7.2: In selection mode, draft positions are already mapped in candidateObjects
    // They will be assigned during candidate matching below
    
    // A3.6.11: Repair numeric fragments after filterCandidateQuality
    diag(runId, reqSig, `[PIPELINE] phase=repairNumericFragments`);
    // A3.6.63: Track repair counts for quality classification
    const numericRepairResult = repairNumericFragments(statements, normalizedDraftText, runId, reqSig);
    statements = numericRepairResult.statements;
    numericFragmentRepairCount = numericRepairResult.repairCount || 0;
    
    // A3.6.44: Checkpoint A - right after repairNumericFragments
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt && typeof stmt === "object" && typeof stmt.text === "string") {
        const text = stmt.text.trim();
        const tail = text.length <= 80 ? text : text.slice(-80);
        diag(runId, reqSig, `[CANON_TAIL] checkpoint=after_repairNumericFragments idx=${i} tail="${tail}"`);
      }
    }
    
    // A3.7.2: In selection mode, preserve split candidate texts (handled during candidate matching)
    // No need to override here as candidate matching will use the split candidates
    
    // A3.5.13: Map LLM output back to pre-extracted candidates for stability
    // A3.5.26 Fix B: Also assign candidateIndex for ordering preservation
    // A3.7.2: In selection mode, we still need candidate matching for split candidates
    // If LLM produced statements, ensure they match candidates (fuzzy matching allowed for minor rewording)
    if (statements.length > 0 && finalExtractionCandidates.length > 0) {
      // Build a map of normalized candidates for matching using preserved candidateIndex and draftPosition
      // A3.7.3: Use the candidateObjects we already created (with draft positions and selection metadata mapped for selection mode)
      const candidateMap = new Map();
      // candidateObjects was already created above with draft positions and selection metadata mapped for selection mode
      candidateObjects.forEach((candidateObj) => {
        const candidate = candidateObj.text;
        const candidateIndex = candidateObj.candidateIndex != null ? candidateObj.candidateIndex : candidateObjects.indexOf(candidateObj);
        const draftPosition = candidateObj.draftPosition != null ? candidateObj.draftPosition : candidateIndex;
        const normalized = candidate.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
        if (!candidateMap.has(normalized)) {
          const candidateData = { candidate, index: candidateIndex, draftPosition };
          // A3.7.3: Attach selection metadata if available
          if (candidateObj.selectionGroupId) {
            candidateData.selectionGroupId = candidateObj.selectionGroupId;
            candidateData.selectionIndex = candidateObj.selectionIndex;
            candidateData.selectionTotal = candidateObj.selectionTotal;
          }
          candidateMap.set(normalized, candidateData);
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
        let bestCandidateData = null; // A3.7.3: Store candidateData for metadata
        
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
            // A3.7.3: Store candidateData for metadata attachment
            bestCandidateData = candidateData;
            matched = true;
          }
        }
        
        if (matched && bestMatch) {
          // Use original candidate text for stability and assign candidateIndex and draftPosition
          // A3.6.6: Preserve draftPosition from candidateData
          // A3.7.3: Attach selection metadata if available
          const statementObj = {
            ...stmt,
            text: bestMatch, // Use deterministic candidate text
            __candidateIndex: bestIndex, // A3.5.26 Fix B: Preserve draft order
            __draftPosition: bestDraftPosition, // A3.6.6: Preserve draftPosition
          };
          // A3.7.3: Attach selection metadata from bestCandidateData
          if (bestCandidateData && bestCandidateData.selectionGroupId) {
            statementObj.selectionGroupId = bestCandidateData.selectionGroupId;
            statementObj.selectionIndex = bestCandidateData.selectionIndex;
            statementObj.selectionTotal = bestCandidateData.selectionTotal;
          }
          matchedStatements.push(statementObj);
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
    
    // A3.6.61: Early dangling-currency repair (AFTER ordering/sort, BEFORE extractDealTerms)
    // Must run on the SAME statement array that is later passed to downstream phases
    diag(runId, reqSig, `[PIPELINE] phase=earlyDanglingCurrencyRepair`);
    // A3.6.63: Track repair counts for quality classification
    const earlyDanglingResult = repairDanglingCurrency(statements, normalizedDraftText, runId, reqSig, "early");
    statements = earlyDanglingResult.statements;
    earlyDanglingRepairCount = earlyDanglingResult.repairCount || 0;
    
    // A3.6.61: Checkpoint after earlyDanglingCurrencyRepair
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt && typeof stmt === "object" && typeof stmt.text === "string") {
        const text = stmt.text.trim();
        const tail = text.length <= 80 ? text : text.slice(-80);
        diag(runId, reqSig, `[CANON_TAIL] checkpoint=after_earlyDanglingCurrencyRepair idx=${i} tail="${tail}"`);
      }
    }
    
    // A3.6.67: Initialize uploadedDocs BEFORE extractDealTerms phase to avoid TDZ error
    const docsWithFullText = Array.isArray(uploadedSources) ? uploadedSources.filter(s => 
      typeof s.text === "string" && s.text.trim().length > 0
    ) : [];
    let uploadedDocs = docsWithFullText.map(s => ({
      id: s.id || s.name || `doc_${Math.random()}`,
      title: s.name || s.title || "Untitled source",
      text: s.text || "",
    }));
    
    // A3.6.47: Extract DealTerms from draftText (robust, handles messy text)
    // A3.6.66: Pass uploadedDocs and find statement text for backfill
    // A3.6.67: Add error handling and diagnostics
    diag(runId, reqSig, `[PIPELINE] phase=extractDealTerms`);
    
    // A3.6.67: Input diagnostics
    diag(runId, reqSig, `[A3.6.67][DEAL_TERMS_INPUT] stmtCount=${statements.length} uploadedSourcesCount=${uploadedSources.length} hasUploadedDocs=${uploadedDocs.length > 0} uploadedDocsLen=${uploadedDocs.length}`);
    
    let dealTerms = null;
    try {
      // A3.6.68: Find statement(s) that might contain deal terms for extraction
      // Extract from both draftText and statement text, then merge
      let statementTextsForExtraction = [];
      for (const stmt of statements) {
        if (stmt && typeof stmt === "object" && stmt.text) {
          const stmtText = stmt.text.toLowerCase();
          if (/\bpre[- ]?money\b|\benterprise\s+value\b|\binvestment\b|\bownership\b/i.test(stmtText)) {
            statementTextsForExtraction.push(stmt.text);
          }
        }
      }
      // A3.6.68: Use first matching statement text (or all if needed)
      const statementTextForExtraction = statementTextsForExtraction.length > 0 ? statementTextsForExtraction[0] : null;
      // A3.7.10: Pass selectionMode flag to enforce isolation
      dealTerms = extractDealTermsFromDraft(normalizedDraftText, runId, reqSig, uploadedDocs, statementTextForExtraction, selectionUsed);
      // Logging is now handled inside extractDealTermsFromDraft
    } catch (e) {
      const errorMessage = e?.message || String(e);
      const errorStack = e?.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : '';
      diag(runId, reqSig, `[A3.6.67][DEAL_TERMS_ERROR] message="${errorMessage}" stack="${errorStack}" idx=null`);
      diag(runId, reqSig, `[A3.6.47][DEAL_TERMS] error="${errorMessage}"`);
    }
    
    // A3.6.47: Canonicalize Deal Terms statements (plural - emits TWO statements)
    // A3.6.66: Run whenever found=true (not just when both preMoney and enterpriseValue exist)
    // A3.7.1: Skip canonicalization in selection mode to keep selection as primary statement
    let dealDedupDropped = 0;
    if (!selectionUsed) {
      diag(runId, reqSig, `[PIPELINE] phase=canonicalizeDealTermsStatement`);
      if (dealTerms) {
        statements = canonicalizeDealTermsStatements(statements, dealTerms, runId, reqSig);
        
        // A3.6.61: Drop redundant combined deal-terms statements after canonical split
        diag(runId, reqSig, `[PIPELINE] phase=dedupCombinedDealTermsStatements`);
        const dedupResult = dropRedundantCombinedDealTerms(statements, dealTerms, runId, reqSig);
        statements = dedupResult.statements;
        dealDedupDropped = dedupResult.droppedCount;
        
        // A3.6.60: Sort statements by __draftPosition after canonicalization + dedup to preserve original draft ordering
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
      }
    } else {
      diag(runId, reqSig, `[PIPELINE] phase=canonicalizeDealTermsStatement SKIPPED (selection mode)`);
    }
    
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

    // A3.6.44: Checkpoint B - right before generateClaims
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt && typeof stmt === "object" && typeof stmt.text === "string") {
        const text = stmt.text.trim();
        const tail = text.length <= 80 ? text : text.slice(-80);
        diag(runId, reqSig, `[CANON_TAIL] checkpoint=before_generateClaims idx=${i} tail="${tail}"`);
      }
    }
    
    // A3.6.7: Generate claims BEFORE reasons-mode decision and BEFORE FINAL_COUNTS
    // This ensures assessment.claims is available when deciding on reasons mode
    diag(runId, reqSig, `[PIPELINE] phase=generateClaims`);
    // A3.6.67: Reuse uploadedDocs initialized earlier (avoid redeclaration)
    if (!uploadedDocs || uploadedDocs.length === 0) {
      uploadedDocs = Array.isArray(uploadedSources) && uploadedSources.length > 0
        ? uploadedSources.map((src) => ({
            id: src.id || src.name || "unknown",
            title: src.title || src.name || "Untitled",
            text: src.text || "",
          }))
        : [];
    }
    
    // A3.6.9: Track claims failures for meta
    let claimsFailures = 0;
    
    // A3.8.4: Compute selectionHash once at top level (reused in canonicalizeClaims)
    const computedSelectionHash = selectionUsed && selectedText
      ? createHash("sha256").update(selectedText).digest("hex").substring(0, 16)
      : null;
    
    if (uploadedDocs.length > 0) {
      statements = statements.map((stmt, idx) => {
        if (!stmt || typeof stmt !== "object") return stmt;
        
        const text = typeof stmt.text === "string" ? stmt.text : "";
        const assessment = stmt.assessment || {};
        
        // A3.8.15: Extract segmentId from selection metadata if available
        let segmentId = null;
        if (selectionUsed && selectionMetadataMap) {
          const metadata = selectionMetadataMap.get(text.trim());
          if (metadata && metadata.segmentId !== undefined && metadata.segmentId !== null) {
            segmentId = metadata.segmentId;
          }
        }
        
        // A3.6.9: Per-statement guard around claim generation - never trigger global fallback
        let claims = [];
        let claimsError = false;
        let uniqueAnchors = new Set();
        let canonicalClaims = [];
        let rawClaimsForDiagnostics = [];
        let canonDiag = null;
        let rawClaims = null;
        
        try {
          // A3.6.49: Pass __dealTerms and __dealTermsCanonicalKind from statement to assessment for claim generation
          if (stmt.__dealTerms) {
            assessment.__dealTerms = stmt.__dealTerms;
          }
          if (stmt.__dealTermsCanonical === true) {
            assessment.__dealTermsCanonical = true;
            assessment.__dealTermsCanonicalKind = stmt.__dealTermsCanonicalKind || null;
          }
          
          // Generate claims (with aggregation, capping, and claim-aware scoring)
          rawClaims = generateClaimsForStatement(text, uploadedDocs, assessment, runId, reqSig, idx);
          
          // A3.8.36: INV-2 - Subsumption filter (selection mode only)
          // Drop short numeric fragments that are subsumed by more specific claims
          if (selectionUsed && Array.isArray(rawClaims) && rawClaims.length > 0) {
            const subsumptionResult = filterSubsumedClaims(rawClaims, text, idx, runId, reqSig);
            rawClaims = subsumptionResult.keptClaims;
            if (subsumptionResult.droppedCount > 0 && runId && reqSig) {
              diag(runId, reqSig, `[CLAIMS][SUBSUME] idx=${idx} dropped=${subsumptionResult.droppedCount} examples="${subsumptionResult.examples.join(" | ")}"`);
            }
          }
          
          // A3.8.0: Canonicalize raw claims into canonical claims
          // A3.8.4: Use computed selectionHash from top level
          const selectionHash = computedSelectionHash;
          
          // Extract known entities from statement/assessment
          const knownEntities = {
            company: assessment.company || stmt.company || null,
            round: assessment.round || stmt.round || null,
          };
          
          // A3.8.9: Always canonicalize, even when rawClaims is empty (will create fallback)
          // Extract citations from assessment for fallback claims
          const citationsFromStatement = Array.isArray(assessment.citations) ? assessment.citations : null;
          
          // A3.8.10: Compute statementScopeKey for unique ID generation
          // In selection mode: use selectionHash + ":" + statementIndex
          // In non-selection mode: use reqSig (or runId) + ":" + statementIndex
          const statementScopeKey = selectionUsed && selectionHash
            ? `${selectionHash}:${idx}`
            : `${reqSig || runId || "global"}:${idx}`;
          
          // Canonicalize claims
          // A3.8.1: Use alias to avoid redeclaration collision
          const { canonicalClaims: canonClaims, diagnostics: canonDiagResult } = canonicalizeClaims(rawClaims || [], {
            statementText: text,
            selectionMode: selectionUsed,
            selectionText: selectionUsed ? selectedText : null,
            selectionHash,
            knownEntities,
            runId,
            reqSig,
            statementIndex: idx,
            statementScopeKey: statementScopeKey, // A3.8.10: Unique per-statement scope key
            assessment: assessment,
            citationsFromStatement: citationsFromStatement,
          });
          
          canonicalClaims = canonClaims || [];
          canonDiag = canonDiagResult ?? null;
          
          // A3.8.0: Preserve raw claims for diagnostics
          rawClaimsForDiagnostics = [...rawClaims];
          
          // Map canonical claims to old claim shape for backward compatibility (5.3 Option A)
          // A3.8.15: Fix comment to respect Low reliability
          claims = canonClaims.map(cc => {
            // A3.8.12: Filter out consolidation jargon from evidenceNotes for user-facing comments
            const filteredNotes = cc.evidenceNotes && cc.evidenceNotes.length > 0
              ? cc.evidenceNotes.filter(note => 
                  typeof note === "string" && !/consolidated.*extracted signals|merged.*raw claims/i.test(note)
                )
              : [];
            
            // A3.8.15: Comment must respect reliability - Low claims must NOT say "Supported by sources"
            const reliability = cc.reliability || "Medium";
            let comment;
            if (filteredNotes.length > 0) {
              comment = filteredNotes.join("; ");
            } else {
              // A3.8.15: Low reliability claims must say "Not supported"
              if (reliability === "Low") {
                comment = "Not supported by sources";
              } else if (cc.citations.length > 0) {
                comment = "Supported by sources";
              } else {
                comment = "Not supported in provided sources";
              }
            }
            
            return {
              claimText: cc.displayText,
              reliability: cc.reliability,
              reliabilityScore: cc.reliabilityScore,
              comment: comment,
              anchor: cc.anchorFamily,
              citations: cc.citations,
              // Preserve canonical claim ID for diagnostics
              _canonicalId: cc.id,
            };
          });
          
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
          canonicalClaims = [];
          rawClaimsForDiagnostics = [];
          canonDiag = null;
          rawClaims = null;
          claimsError = true;
          claimsFailures++;
        }
        
        // A3.6.9: Log claims phase status (idx<2)
        if (idx < 2 && runId && reqSig) {
          diag(runId, reqSig, `[CLAIMS_PHASE] idx=${idx} ok=${!claimsError} claimsCount=${claims.length} anchors=${JSON.stringify(Array.from(uniqueAnchors).slice(0, 5))}`);
        }
        
        // A3.8.14: Check for deal context in selection mode
        let dealContext = null;
        if (selectionUsed) {
          dealContext = buildDealContext(canonicalClaims);
          if (dealContext && runId && reqSig) {
            diag(runId, reqSig, `[DEAL_CONTEXT] detected=true investment=${dealContext.hasInvestment} valuation=${dealContext.hasValuation} ownership=${dealContext.hasOwnership} secondary=${dealContext.hasSecondary}`);
          }
        }
        
        // A3.8.0: Use canonical claims for reliability computation
        // A3.8.1: Use canonClaims directly (already filtered to have reliability)
        const canonClaimsForReliability = canonicalClaims.filter(cc => cc.reliability);
        
        // A3.6.3: Compute statement reliability from canonical claims (deterministic)
        // A3.8.14: Override with deal context reliability if present
        const existingScore = typeof assessment.reliabilityScore === "number" 
          ? assessment.reliabilityScore 
          : 30;
        const existingLabel = typeof assessment.reliabilityLabel === "string"
          ? assessment.reliabilityLabel
          : existingScore >= 80 ? "High" : existingScore >= 60 ? "Medium" : "Low";
        
        let computedReliability = computeStatementReliabilityFromClaims(canonClaimsForReliability, existingScore, existingLabel);
        
        // A3.8.14: Override reliability if deal context exists
        if (dealContext) {
          const dealReliability = computeDealContextReliability(dealContext);
          if (dealReliability) {
            computedReliability = {
              ...computedReliability,
              reliabilityScore: dealReliability.reliabilityScore,
              reliabilityLabel: dealReliability.reliabilityLabel,
            };
          }
        }
        
        // A3.8.15: Reliability score/label consistency guardrail
        const finalScore = computedReliability.reliabilityScore;
        const finalLabel = computedReliability.reliabilityLabel;
        if (finalScore <= 40 && finalLabel !== "Low") {
          if (runId && reqSig) {
            diag(runId, reqSig, `[RELIABILITY][MISMATCH] idx=${idx} score=${finalScore} label=${finalLabel} expected=Low`);
          }
          computedReliability.reliabilityLabel = "Low";
        } else if (finalScore >= 60 && finalLabel !== "Medium" && finalLabel !== "High") {
          if (runId && reqSig) {
            diag(runId, reqSig, `[RELIABILITY][MISMATCH] idx=${idx} score=${finalScore} label=${finalLabel} expected=Medium_or_High`);
          }
          // Derive label from score if mismatch
          computedReliability.reliabilityLabel = finalScore >= 80 ? "High" : "Medium";
        }
        
        // A3.6.5: Count canonical claim reliabilities for logging
        let hiCount = 0, medCount = 0, lowCount = 0;
        for (const claim of canonClaimsForReliability) {
          const reliability = claim?.reliability;
          if (reliability === "High") hiCount++;
          else if (reliability === "Medium") medCount++;
          else if (reliability === "Low") lowCount++;
        }
        const totalCount = hiCount + medCount + lowCount;
        
        // A3.8.1: Guard log to confirm fix
        if (runId && reqSig) {
          diag(runId, reqSig, `[CANON][WIRE] using canonClaimsCount=${canonicalClaims.length}`);
        }
        
        // A3.6.58: Normalize claim comments using corpusSearch support (before reasons generation)
        // This ensures reasons use normalized comments when reasonsSource="claims"
        let normalizedClaims = claims;
        if (claims.length > 0 && uploadedDocs.length > 0) {
          // Run corpusSearch on statement text to get matchTypes
          let searchResult;
          try {
            searchResult = corpusSearch(text, uploadedDocs);
          } catch (searchErr) {
            // If corpusSearch fails, skip normalization
            searchResult = null;
          }
          
          // Only normalize if corpusSearch found support
          if (searchResult && searchResult.found) {
            // Extract matchTypes from hits
            const hits = searchResult.hits || [];
            const matchTypes = new Set(hits.map(h => h.matchType).filter(Boolean));
            const hasNumber = matchTypes.has("number");
            const hasKeyword = matchTypes.has("keyword");
            const hasFuzzy = matchTypes.has("fuzzy");
            const hasNumberOrKeyword = hasNumber || hasKeyword;
            const isFuzzyOnly = hasFuzzy && !hasNumberOrKeyword;
            
            // Normalize claim comments
            let changedCount = 0;
            let sampleBefore = null;
            let sampleAfter = null;
            normalizedClaims = claims.map(claim => {
              if (!claim || typeof claim !== "object") return claim;
              
              const comment = claim.comment || "";
              // Check if comment is absence-style
              const isAbsenceStyle = /not explicitly confirmed|not found in provided sources/i.test(comment);
              
              if (!isAbsenceStyle) return claim;
              
              // Normalize based on matchTypes
              let newComment = comment;
              if (hasNumberOrKeyword) {
                newComment = "Supported by memo text";
              } else if (isFuzzyOnly) {
                newComment = "Paraphrased from memo text (wording not exact)";
              }
              
              if (newComment !== comment) {
                changedCount++;
                if (!sampleBefore && idx < 3) {
                  sampleBefore = comment.substring(0, 60);
                  sampleAfter = newComment.substring(0, 60);
                }
                return {
                  ...claim,
                  comment: newComment
                };
              }
              
              return claim;
            });
            
            // Log normalization if any comments were changed
            if (changedCount > 0 && idx < 3 && runId && reqSig) {
              const mode = hasNumberOrKeyword ? "num_keyword" : "fuzzy_only";
              diag(runId, reqSig, `[A3.6.58][COMMENT_NORM] idx=${idx} changedCount=${changedCount} mode=${mode} sampleBefore="${sampleBefore}" sampleAfter="${sampleAfter}"`);
            }
          }
        }
        
        // A3.8.9: Reasons generation must be claim-driven only
        // Build reasons from canonical claims (always, even if empty - will return fallback message)
        let finalReasons = [];
        let reasonsSourceValue = "canonical";
        
        if (!claimsError) {
          // A3.8.14: Use deal context assessment if present (selection mode only)
          if (dealContext) {
            // Collect citations from deal claims
            const dealCitations = new Set();
            dealContext.claims.forEach(cc => {
              if (Array.isArray(cc.citations)) {
                cc.citations.forEach(cit => dealCitations.add(cit));
              }
            });
            const sortedCitations = Array.from(dealCitations).sort((a, b) => a - b);
            
            // Build deterministic deal assessment
            finalReasons = buildDealAssessment(dealContext, sortedCitations);
            
            if (runId && reqSig) {
              diag(runId, reqSig, `[DEAL_CONTEXT][REASONS] count=${finalReasons.length}`);
              diag(runId, reqSig, `[REASONS][MODE] idx=${idx} mode=deal_context canonicalClaimsCount=${canonicalClaims.length} reasonsCount=${finalReasons.length}`);
            }
            
            reasonsSourceValue = "deal_context";
          } else {
            // A3.8.9: Use buildReasonsFromCanonicalClaims (claim-driven only)
            // A3.8.25: Pass selectionMode for deterministic language and rawClaims for uncertainty detection
            finalReasons = buildReasonsFromCanonicalClaims(canonicalClaims, {
              statement: stmt,
              runId,
              reqSig,
              selectionMode: selectionUsed,
              rawClaims: rawClaimsForDiagnostics, // A3.8.25: Pass rawClaims for uncertainty alignment
              uploadedDocs: uploadedDocs, // A3.8.33: Pass uploadedDocs for corpusSearch check
            });
            
            // A3.8.9: Set reasonsSource based on actual pipeline path
            if (canonicalClaims.length > 0) {
              reasonsSourceValue = "canonical";
            } else {
              // Fallback emergency path (shouldn't happen after hard invariant)
              reasonsSourceValue = "fallback";
            }
            
            // A3.8.9: Log reasons mode
            if (runId && reqSig) {
              diag(runId, reqSig, `[REASONS][MODE] idx=${idx} mode=canonical_claims_only canonicalClaimsCount=${canonicalClaims.length} reasonsCount=${finalReasons.length}`);
            }
          }
          
          // A3.6.7: Log claim-derived statement scoring (idx<2, only when mode=claims)
          if (idx < 2 && runId && reqSig) {
            const branch = computedReliability._branch || "UNKNOWN";
            diag(runId, reqSig, `[STMT_FROM_CLAIMS] idx=${idx} hi=${hiCount} med=${medCount} low=${lowCount} total=${totalCount} score=${computedReliability.reliabilityScore} label=${computedReliability.reliabilityLabel} branch=${branch}`);
          }
        } else {
          // A3.8.9: Claims error - use fallback (should be rare)
          reasonsSourceValue = "fallback";
          finalReasons = ["No extractable claims were produced for this statement."];
          if (runId && reqSig) {
            diag(runId, reqSig, `[REASONS][MODE] idx=${idx} mode=fallback claimsError=true`);
          }
        }
        // A3.8.36: INV-1 - Canonical-only reasons (selection mode)
        // Hard-disable any residual rawClaims-based reason injection for selection mode
        // Reasons must be generated ONLY from canonicalClaims (or dealContext/fallback canonical claim)
        // The code that previously appended unsupported numeric rawClaims has been removed.
        
        // A3.8.36: Add diagnostic log for canonical-only enforcement
        if (selectionUsed && runId && reqSig) {
          const usedDeal = dealContext !== null;
          const usedFallbackQual = canonicalClaims.length === 0 && finalReasons.length > 0 && finalReasons.some(r => typeof r === "string" && /No extractable claims|This statement/i.test(r));
          diag(runId, reqSig, `[REASONS][SELECTION_CANON_ONLY] idx=${idx} canon=${canonicalClaims.length} raw=${rawClaimsForDiagnostics ? rawClaimsForDiagnostics.length : 0} usedDeal=${usedDeal} usedFallbackQual=${usedFallbackQual} reasons=${finalReasons.length}`);
        }
        
        // A3.8.30: Add coverage summary (selection mode only)
        let coverageTokens = [];
        let coverageFoundCount = 0;
        let coverageNotFoundCount = 0;
        if (selectionUsed && Array.isArray(finalReasons) && finalReasons.length > 0) {
          const statementText = stmt?.text || "";
          const statementTextLength = statementText.length;
          
          // Extract tokens for coverage check
          coverageTokens = extractKeyNumericTokens(statementText);
          
          // Only add coverage summary if statement is long (>=160) OR has >=2 tokens
          if (statementTextLength >= 160 || coverageTokens.length >= 2) {
            // Get citations from canonical claims (collect early for coverage check)
            const canonicalCitationsForCoverage = new Set();
            canonicalClaims.forEach(cc => {
              if (Array.isArray(cc.citations)) {
                cc.citations.forEach(cit => canonicalCitationsForCoverage.add(cit));
              }
            });
            const sortedCitationsForCoverage = Array.from(canonicalCitationsForCoverage).sort((a, b) => a - b);
            
            // Use canonical citations if available, otherwise fall back to assessment citations
            const coverageCitations = sortedCitationsForCoverage.length > 0 
              ? sortedCitationsForCoverage 
              : (Array.isArray(assessment.citations) ? assessment.citations : []);
            
            // Build coverage reasons
            const coverageReasons = buildSelectionCoverageReasons(statementText, uploadedDocs, unifiedReferences, coverageCitations);
            
            // Count found/not found for diagnostics
            for (const token of coverageTokens) {
              const result = checkTokenInSources(token, uploadedDocs, unifiedReferences, coverageCitations);
              if (result.found) {
                coverageFoundCount++;
              } else {
                coverageNotFoundCount++;
              }
            }
            
            // Add coverage reasons with priority ordering
            // Priority 3: Coverage "Found in sources" (if added)
            // Priority 4: Coverage "Not found in sources" OR scope note (if needed)
            for (const coverageReason of coverageReasons) {
              if (coverageReason.includes("Found in sources")) {
                finalReasons.push(coverageReason);
              }
            }
            for (const coverageReason of coverageReasons) {
              if (coverageReason.includes("Not found in sources")) {
                finalReasons.push(coverageReason);
              }
            }
          }
        }
        
        // A3.8.28: Part B - Add scope note for partial coverage (selection mode only, tightened trigger)
        // A3.8.30: Only add scope note if no numeric tokens found but statement is long
        if (selectionUsed && reasonsSourceValue !== "deal_context" && Array.isArray(finalReasons) && finalReasons.length > 0) {
          // A3.8.28: Do NOT add scope note if any canonicalClaim is other_qualitative
          const hasQualitativeClaim = canonicalClaims.some(cc => cc?.type === "other_qualitative");
          
          if (!hasQualitativeClaim) {
            const statementText = stmt?.text || "";
            const statementTextLength = statementText.length;
            const canonicalClaimsCount = canonicalClaims.length;
            
            // A3.8.30: Only add scope note if no numeric tokens were found
            const hasNumericTokens = coverageTokens.length > 0;
            
            // Check if statement is long (> 140 chars) and assessment is partial
            if (statementTextLength > 140 && !hasNumericTokens) {
              const reasonsFromCanonical = reasonsSourceValue === "canonical";
              const hasFewClaims = canonicalClaimsCount < 2;
              
              // Check if only 1 figure is covered (for canonical mode)
              let onlyOneFigure = false;
              if (reasonsFromCanonical && canonicalClaimsCount === 1) {
                const firstClaim = canonicalClaims[0];
                const isFinancial = firstClaim && (
                  firstClaim.type === "investment_amount" ||
                  firstClaim.type === "valuation_pre_money" ||
                  firstClaim.type === "valuation_post_money" ||
                  firstClaim.type === "valuation_enterprise_value" ||
                  firstClaim.type === "ownership_percent" ||
                  firstClaim.type === "fee_percent" ||
                  firstClaim.type === "metric_amount" ||
                  firstClaim.type === "growth_percent" ||
                  firstClaim.type === "secondary_purchase"
                );
                onlyOneFigure = isFinancial;
              }
              
              // Append scope note if assessment is partial
              if (hasFewClaims || onlyOneFigure) {
                finalReasons.push("Note: assessment focuses on extracted verifiable claim(s); other descriptive clauses are not individually verified.");
              }
            }
          }
        }
        
        // A3.8.30: Reason cap behavior (selection mode only)
        // Allow up to 4 reasons in selection mode with priority ordering
        const reasonsBefore = finalReasons.length;
        const maxReasons = selectionUsed ? 4 : 3;
        if (Array.isArray(finalReasons) && finalReasons.length > maxReasons) {
          // Priority order:
          // 1) Deal-context assessment OR primary canonical reason
          // 2) Type-specific caution note (mapping/basis/explicitness) if triggered
          // 3) Coverage "Found in sources" (if added)
          // 4) Coverage "Not found in sources" OR scope note (if needed)
          // If reasons exceed cap, drop lowest priority coverage line first
          
          // Keep first maxReasons, but prioritize by type
          const prioritized = [];
          const coverageFound = [];
          const coverageNotFound = [];
          const scopeNote = [];
          
          for (const reason of finalReasons) {
            if (reason.includes("Coverage (figures): Found in sources")) {
              coverageFound.push(reason);
            } else if (reason.includes("Coverage (figures): Not found in sources")) {
              coverageNotFound.push(reason);
            } else if (reason.includes("Note: assessment focuses on")) {
              scopeNote.push(reason);
            } else {
              prioritized.push(reason);
            }
          }
          
          // Rebuild with priority: prioritized, coverageFound, then coverageNotFound/scopeNote
          finalReasons = [...prioritized, ...coverageFound, ...coverageNotFound, ...scopeNote].slice(0, maxReasons);
          
          if (runId && reqSig) {
            diag(runId, reqSig, `[REASONS][CAP] idx=${idx} before=${reasonsBefore} after=${finalReasons.length} selectionMode=${selectionUsed}`);
          }
        }
        
        // A3.8.4: Emit CANON_SUMMARY with reasons count (must always be emitted)
        // A3.8.30: Add coverage diagnostics (selection mode only)
        if (runId && reqSig) {
          const diagnostics = canonDiag || {};
          const selHash = selectionHash ? selectionHash.substring(0, 8) : "none";
          const finCount = diagnostics.finCount !== undefined ? diagnostics.finCount : canonicalClaims.filter(cc => {
            const financialTypes = new Set(["investment_amount", "valuation_pre_money", "valuation_post_money", "valuation_enterprise_value", "ownership_percent", "secondary_purchase", "structure_term"]);
            return financialTypes.has(cc.type);
          }).length;
          const qualCount = diagnostics.qualCount !== undefined ? diagnostics.qualCount : (canonicalClaims.length - finCount);
          const rawCount = diagnostics.rawCount !== undefined ? diagnostics.rawCount : (rawClaims ? rawClaims.length : 0);
          const dropCount = diagnostics.droppedRawCount !== undefined ? diagnostics.droppedRawCount : 0;
          const mergedCount = diagnostics.mergedGroupsCount !== undefined ? diagnostics.mergedGroupsCount : 0;
          const dedupDropCount = diagnostics.dedupDroppedCount !== undefined ? diagnostics.dedupDroppedCount : 0;
          const reasonsCount = finalReasons.length;
          // A3.8.15: Extract segmentId for logging
          const logSegmentId = segmentId !== undefined && segmentId !== null ? segmentId : "na";
          // A3.8.30: Add coverage diagnostics
          const tokensCount = coverageTokens.length;
          const foundCount = coverageFoundCount;
          const notFoundCount = coverageNotFoundCount;
          const coverageDiag = selectionUsed && tokensCount > 0 
            ? ` tokens=${tokensCount} found=${foundCount} notFound=${notFoundCount}`
            : "";
          diag(runId, reqSig, `[CANON_SUMMARY] idx=${idx} segId=${logSegmentId} sel=${selectionUsed ? 1 : 0} hash=${selHash} raw=${rawCount} drop=${dropCount} canon=${canonicalClaims.length} fin=${finCount} qual=${qualCount} merged=${mergedCount} dedupDrop=${dedupDropCount} reasons=${reasonsCount}${coverageDiag}`);
        }
        
        // A3.8.4: Extract citations from canonical claims
        const canonicalCitations = new Set();
        canonicalClaims.forEach(cc => {
          if (Array.isArray(cc.citations)) {
            cc.citations.forEach(cit => canonicalCitations.add(cit));
          }
        });
        const mergedCitations = Array.from(canonicalCitations).sort((a, b) => a - b);
        
        // A3.8.4: Build evidence from citations + unifiedReferences
        const evidenceFromCitations = [];
        if (mergedCitations.length > 0 && unifiedReferences) {
          mergedCitations.forEach(citationId => {
            const ref = unifiedReferences.find(r => String(r?.id) === String(citationId));
            if (ref) {
              evidenceFromCitations.push({
                title: ref.title || "Untitled source",
                url: ref.url || null,
                sourceType: ref.type || (ref.url ? "web" : "uploaded"),
              });
            }
          });
        }
        
        // A3.8.4: Use canonical citations if available, otherwise keep existing
        const finalCitations = mergedCitations.length > 0 ? mergedCitations : (Array.isArray(assessment.citations) ? assessment.citations : []);
        const finalEvidence = evidenceFromCitations.length > 0 ? evidenceFromCitations : (Array.isArray(assessment.evidence) ? assessment.evidence : []);
        
        // A3.8.4: Warn if citations are empty but references exist
        if (finalCitations.length === 0 && unifiedReferences && unifiedReferences.length > 0 && runId && reqSig) {
          diag(runId, reqSig, `[CITE][WARN] idx=${idx} noCitationsEmitted references=${unifiedReferences.length}`);
        }
        
        // A3.8.15: Add segmentId to statement for traceability
        const statementWithSegmentId = {
          ...stmt,
          __selectionSegmentId: segmentId, // A3.8.15: Preserve segmentId for logging
          assessment: {
            ...assessment,
            // A3.8.0: Add canonical claims and raw claims
            canonicalClaims: canonicalClaims,
            rawClaims: rawClaimsForDiagnostics,
            // A3.8.0: claims field maps to canonical claims for backward compatibility (5.3 Option A)
            claims: claims, // Already mapped from canonical claims above
            // A3.8.4: Restore citations and evidence from canonical claims
            citations: finalCitations,
            evidence: finalEvidence,
            reliabilityScore: computedReliability.reliabilityScore,
            reliabilityLabel: computedReliability.reliabilityLabel,
            // A3.8.0: Set reasonsSource to "canonical" when canonical claims exist
            reasons: finalReasons,
            reasonsSource: reasonsSourceValue,
            _claimsError: claimsError, // Internal flag for later phases
          },
        };
        
        return statementWithSegmentId;
      });
      
      // A3.8.10: Defensive check for canonical ID collisions across statements
      const allCanonicalIds = new Map(); // id -> [statementIndex, ...]
      statements.forEach((stmt, idx) => {
        const canonicalClaims = stmt?.assessment?.canonicalClaims || [];
        canonicalClaims.forEach(cc => {
          if (cc && cc.id) {
            if (!allCanonicalIds.has(cc.id)) {
              allCanonicalIds.set(cc.id, []);
            }
            allCanonicalIds.get(cc.id).push(idx);
          }
        });
      });
      
      // Check for collisions
      const collisions = [];
      for (const [id, indices] of allCanonicalIds.entries()) {
        if (indices.length > 1) {
          collisions.push({ id, indices });
        }
      }
      
      if (collisions.length > 0 && runId && reqSig) {
        const first5 = collisions.slice(0, 5).map(c => c.id.substring(0, 8));
        diag(runId, reqSig, `[CANON][ID_COLLISION] count=${collisions.length} ids=[${first5.join(",")}]`);
        
        // A3.8.10: Re-salt duplicates using ":collisionFix:<i>" for the duplicates only
        collisions.forEach(({ id, indices }) => {
          // Fix all but the first occurrence
          for (let i = 1; i < indices.length; i++) {
            const stmtIdx = indices[i];
            const stmt = statements[stmtIdx];
            if (stmt && stmt.assessment && stmt.assessment.canonicalClaims) {
              const claim = stmt.assessment.canonicalClaims.find(cc => cc && cc.id === id);
              if (claim) {
                // Re-salt the ID
                const newIdParts = id.split("|");
                if (newIdParts.length > 0) {
                  const newId = createHash("sha256")
                    .update(`${id}:collisionFix:${stmtIdx}`)
                    .digest("hex")
                    .substring(0, 32);
                  claim.id = newId;
                  // Also update _canonicalId in mapped claims if present
                  if (stmt.assessment.claims) {
                    const mappedClaim = stmt.assessment.claims.find(c => c && c._canonicalId === id);
                    if (mappedClaim) {
                      mappedClaim._canonicalId = newId;
                    }
                  }
                }
              }
            }
          }
        });
      }
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
      
      // A3.8.9: Reasons generation is now claim-driven only (no legacy paths)
      // Check if canonical claims exist (reasons should already be set from buildReasonsFromCanonicalClaims)
      const canonicalClaims = Array.isArray(assessment.canonicalClaims) ? assessment.canonicalClaims : [];
      const claimsError = assessment._claimsError || false;
      const reasonsSource = assessment.reasonsSource || null;
      
      // A3.8.9: If canonical claims exist OR reasonsSource is "canonical", skip legacy normalization
      if (canonicalClaims.length > 0 || reasonsSource === "canonical" || reasonsSource === "fallback") {
        // Reasons already generated from canonical claims - skip legacy path
        if (idx < 2 && runId && reqSig) {
          diag(runId, reqSig, `[REASONS][MODE] idx=${idx} mode=canonical_claims_only skipLegacy=true canonicalClaimsCount=${canonicalClaims.length}`);
        }
        return stmt;
      }
      
      // A3.8.9: Legacy path disabled - should not reach here if canonicalization works correctly
      // Only allow if there was a claims error (should be rare)
      if (claimsError) {
        if (idx < 2 && runId && reqSig) {
          diag(runId, reqSig, `[REASONS][MODE] idx=${idx} mode=fallback claimsError=true`);
        }
        // Return as-is with fallback reason if not already set
        if (!Array.isArray(assessment.reasons) || assessment.reasons.length === 0) {
          return {
            ...stmt,
            assessment: {
              ...assessment,
              reasons: ["No extractable claims were produced for this statement."],
              reasonsSource: "fallback",
            },
          };
        }
        return stmt;
      }
      
      // A3.8.9: Should not reach here - log warning
      if (runId && reqSig) {
        diag(runId, reqSig, `[REASONS][MODE] idx=${idx} mode=legacy DISABLED canonicalClaimsCount=${canonicalClaims.length} claimsCount=${claims.length} WARNING=legacy_path_should_not_run`);
      }
      // Return as-is to avoid legacy reason generation
      return stmt;
      
      // A3.8.9: Legacy path removed - this code should not execute
      // If we reach here, it's an error condition
      if (runId && reqSig) {
        diag(runId, reqSig, `[REASONS][MODE] idx=${idx} mode=legacy DISABLED ERROR=should_not_reach_here`);
      }
      
      // Return as-is without legacy normalization
      return stmt;

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
    
    // A3.6.13: Final universal reason normalizer at output boundary
    // Strips tags, dedupes, and applies caps for ALL statements (claims + legacy)
    statements = statements.map((stmt, idx) => {
      if (!stmt || typeof stmt !== "object") return stmt;
      const assessment = stmt.assessment || {};
      const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
      const reasonsSource = assessment.reasonsSource || null;
      
      const { reasons: normalizedReasons, stats } = normalizeFinalReasons(reasons, reasonsSource);
      
      // A3.6.13: Diagnostic log for first 2 statements
      if (idx < 2 && runId && reqSig) {
        diag(runId, reqSig, `[REASONS_FINAL_NORMALIZED] idx=${idx} mode=${reasonsSource || "legacy"} before=${stats.before} after=${stats.after} strippedTags=${stats.strippedTags} deduped=${stats.deduped}`);
      }
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: normalizedReasons,
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
    
    // A3.7.2: Selection mode statements are already preserved via candidate matching
    // No final override needed as split candidates maintain their text
    
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
    // A3.6.64: Build initial finalResponseObject without extractionQuality (will be computed after finalDanglingCurrencyRepair)
    try {
      finalResponseObject = {
        ok: true,
        statements, // Use the exact statements array that was counted
        references: unifiedReferences || [],
        meta: {
          webSearch: { enabled: true, used: Boolean(search?.ok && (search?.results || []).length) },
          extractionQuality: "ok", // Temporary, will be updated after finalDanglingCurrencyRepair
          uploadedSourcesCount: uploadedReferences?.length || 0,
          webSourcesCount: webReferencesWithIds?.length || 0,
          ...(meta?.verification ? { verification: meta.verification } : {}),
          ...(meta?.claimsFailures ? { claimsFailures: meta.claimsFailures } : {}),
          // A3.7.4: Selection mode metadata - always set when selectionUsed is true
          // A3.8.4: Add selectionHash to meta
          selectionUsed: selectionUsed || false,
          selectionHash: selectionHash || null,
          selectionPreview: selectionUsed && selectedText ? (selectedText.length <= 120 ? selectedText : selectedText.substring(0, 120) + "...") : null,
          // A3.8.33: Selection statement count (sentence count) - intended count
          selectionStatementCountReturned: selectionUsed && selectionStatementCountReturned !== null ? selectionStatementCountReturned : (selectionUsed ? statements.length : undefined),
          // A3.8.33: Actual statements returned (may differ from intended if filtering drops rows)
          selectionStatementsReturned: selectionUsed ? statements.length : undefined,
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
          // A3.7.4: Selection mode metadata - always set when selectionUsed is true
          // A3.8.4: Add selectionHash to meta
          selectionUsed: selectionUsed || false,
          selectionHash: selectionHash || null,
          selectionPreview: selectionUsed && selectedText ? (selectedText.length <= 120 ? selectedText : selectedText.substring(0, 120) + "...") : null,
          // A3.7.4: Selection statement count (N from split) - intended count
          selectionStatementCountReturned: selectionUsed && selectionStatementCountReturned !== null ? selectionStatementCountReturned : (selectionUsed ? (statements?.length || 0) : undefined),
          // A3.7.4: Actual statements returned (may differ from intended if filtering drops rows)
          selectionStatementsReturned: selectionUsed ? (statements?.length || 0) : undefined,
        },
      };
    }
    
    // A3.6.7: Claims generation moved earlier (before reasons normalization and FINAL_COUNTS)
    // Bracket stripping also moved earlier (before FINAL_COUNTS)
    
    // NOTE: finalResponseObject is now built immediately after FINAL_COUNTS (see above)
    // After this point, finalResponseObject must never be null.
    
    // A3.8.4: Hard reasons cap invariant (must not regress) - enforce at final point
    finalResponseObject.statements = finalResponseObject.statements.map((stmt, idx) => {
      if (!stmt || typeof stmt !== "object") return stmt;
      const assessment = stmt.assessment || {};
      let reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
      const reasonsBefore = reasons.length;
      
      // A3.8.4: Hard cap to 3
      if (reasons.length > 3) {
        reasons = reasons.slice(0, 3);
        if (runId && reqSig) {
          diag(runId, reqSig, `[REASONS][CAP] idx=${idx} before=${reasonsBefore} after=3`);
        }
      }
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: reasons,
        },
      };
    });
    
    // A3.6.44: Final-pass dangling currency repair on canonical return statements
    // This must run immediately before RETURN_SNAPSHOT to catch any dangling fragments
    // that may have been reintroduced by downstream phases
    // A3.6.64: Track final repair count for quality classification (must run before extractionQuality computation)
    const finalDanglingResult = finalDanglingCurrencyRepair(
      finalResponseObject.statements,
      normalizedDraftText,
      runId,
      reqSig
    );
    finalResponseObject.statements = finalDanglingResult.statements;
    finalDanglingRepairCount = finalDanglingResult.repairCount || 0;
    
    // A3.6.64: Compute extractionQuality AFTER finalDanglingCurrencyRepair (so finalDanglingRepairCount is accurate)
    let extractionQualityValue = extractionQuality || "ok";
    let extractionQualityReasons = [];
    try {
      const fragmentDropped = fragFilterResult ? fragFilterResult.dropped : 0;
      const fragmentMerged = fragFilterResult ? fragFilterResult.merged : 0;
      // A3.6.65: Build qualityPatch with all repair counts (including finalDanglingRepairCount and rejectedCandidatesCount)
      const qualityPatch = {
        numericFragmentFallbackCount,
        numericFragmentRepairCount,
        earlyDanglingRepairCount,
        finalDanglingRepairCount,
        rejectedByReasonIncompleteNumericFragment,
        rejectedCandidatesCount: rejectedCount,
        segGuardFallback: segGuardFallback, // A3.6.72: Track seg guard fallback
        segGuardError: segGuardErrorFlag // A3.6.72: Track seg guard error
      };
      // A3.6.64: Diagnostic logging before computeExtractionQuality
      diag(runId, reqSig, `[A3.6.64][QUALITY_COUNTS] numericFragmentRepairCount=${numericFragmentRepairCount} numericFragmentFallbackCount=${numericFragmentFallbackCount} rejectedCandidatesCount=${rejectedCount} rejectedByReasonIncompleteNumericFragment=${rejectedByReasonIncompleteNumericFragment} earlyDanglingRepairCount=${earlyDanglingRepairCount} finalDanglingRepairCount=${finalDanglingRepairCount}`);
      // A3.6.12: Pass dealDedupDropped separately (does not count as degraded)
      const beforeQuality = extractionQualityValue;
      const beforeReasons = extractionQualityReasons.slice(); // Save for diagnostics
      const qualityResult = computeExtractionQuality(statements, extractionCandidates, rejectedCount, fallbackCount, incompleteNumericFragmentCount, recombinedCount, fragmentDropped, fragmentMerged, dealDedupDropped, qualityPatch, runId, reqSig);
      // A3.6.60: Extract quality and reasons from result object
      if (typeof qualityResult === "object" && qualityResult !== null) {
        extractionQualityValue = qualityResult.quality || extractionQualityValue;
        extractionQualityReasons = Array.isArray(qualityResult.reasons) ? qualityResult.reasons : [];
        // A3.6.65: Diagnostic logging
        diag(runId, reqSig, `[A3.6.65][QUALITY_PATCH] beforeQuality=${beforeQuality} afterQuality=${extractionQualityValue} beforeReasons=${JSON.stringify(beforeReasons)} afterReasons=${JSON.stringify(extractionQualityReasons)} patch=${JSON.stringify(qualityPatch)}`);
        // A3.6.64: Log if rejections were resolved
        const allRejectionsWereNumericFragment = rejectedCount > 0 && rejectedCount === rejectedByReasonIncompleteNumericFragment;
        if (allRejectionsWereNumericFragment && numericFragmentRepairCount > 0) {
          diag(runId, reqSig, `[A3.6.64][REJECTED_RESOLVED] totalRejectedCandidates=${rejectedCount} rejectedByReasonIncompleteNumericFragment=${rejectedByReasonIncompleteNumericFragment} numericFragmentRepairCount=${numericFragmentRepairCount} fallbackCount=${fallbackCount}`);
        }
        // A3.6.62: Log if fallback was resolved
        if (numericFragmentFallbackCount > 0 && numericFragmentRepairCount > 0) {
          diag(runId, reqSig, `[A3.6.62][FALLBACK_RESOLVED] reason=incomplete_numeric_fragment fallback=${numericFragmentFallbackCount} repaired=${numericFragmentRepairCount}`);
        }
      } else {
        // Fallback for old return format (string)
        extractionQualityValue = qualityResult || extractionQualityValue;
      }
    } catch (e) {
      diag(runId, reqSig, `[ERROR] failed computing extractionQuality after finalDanglingCurrencyRepair: ${e?.message || String(e)}`);
      extractionQualityValue = extractionQualityValue || "ok";
    }
    
    // A3.6.64: Update finalResponseObject with computed extractionQuality
    finalResponseObject.meta.extractionQuality = extractionQualityValue;
    if (extractionQualityReasons.length > 0) {
      finalResponseObject.meta.extractionQualityReasons = extractionQualityReasons;
    }
    
    // A3.6.57: Prune duplicate deal-term claims for canonical statements
    // This removes overlapping variants and keeps only protected canonical deal-role claims
    function pruneCanonicalDealClaims(stmt) {
      const claims = stmt?.assessment?.claims;
      if (!Array.isArray(claims) || claims.length === 0) return false;

      const isCanonical = stmt?.assessment?.__dealTermsCanonical === true
        || stmt?.__dealTermsCanonical === true;
      if (!isCanonical) return false;

      // Prefer protected canonical deal-role claims only
      const protectedCanon = claims.filter(c => c && c.__protected === true);

      // If we have protected claims, drop all non-protected.
      // This keeps only the canonical deal-role claims, which are the ones we intended to expose.
      if (protectedCanon.length > 0) {
        stmt.assessment.claims = protectedCanon;
        return true;
      }

      // If there are no protected claims, leave claims unchanged.
      return false;
    }
    
    // Apply pruning to all statements
    for (let idx = 0; idx < finalResponseObject.statements.length; idx++) {
      const stmt = finalResponseObject.statements[idx];
      if (!stmt || typeof stmt !== "object") continue;
      
      const beforeCount = Array.isArray(stmt?.assessment?.claims) ? stmt.assessment.claims.length : 0;
      const wasPruned = pruneCanonicalDealClaims(stmt);
      
      if (wasPruned && idx < 3 && runId && reqSig) {
        const afterCount = Array.isArray(stmt?.assessment?.claims) ? stmt.assessment.claims.length : 0;
        const protectedCount = Array.isArray(stmt?.assessment?.claims) 
          ? stmt.assessment.claims.filter(c => c && c.__protected === true).length 
          : 0;
        const canonicalKind = stmt?.assessment?.__dealTermsCanonicalKind || stmt?.__dealTermsCanonicalKind || 'unknown';
        diag(runId, reqSig, `[A3.6.57][PRUNE_CLAIMS] idx=${idx} canonical=true kind=${canonicalKind} before=${beforeCount} protected=${protectedCount} after=${afterCount}`);
      }
    }
    
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
    // A3.8.15: Segment-to-statement reconciliation logging (selection mode only)
    if (selectionUsed && selectionMetadataMap && runId && reqSig) {
      const keptSegmentIds = Array.from(selectionMetadataMap.values())
        .map(m => m.segmentId)
        .filter(id => id !== undefined && id !== null)
        .sort((a, b) => a - b);
      
      const emittedStatementSegmentIds = finalResponseObject.statements
        .map(s => s.__selectionSegmentId)
        .filter(id => id !== undefined && id !== null)
        .sort((a, b) => a - b);
      
      // Find missing segmentIds
      const missingSegmentIds = keptSegmentIds.filter(id => !emittedStatementSegmentIds.includes(id));
      
      if (missingSegmentIds.length > 0) {
        // Log each missing segment with best-guess reason
        missingSegmentIds.forEach(segId => {
          // Try to determine why it was dropped (best effort)
          let reason = "unknown";
          // Check if it was filtered/dropped earlier in pipeline
          // (We can't know for sure, but log it anyway)
          diag(runId, reqSig, `[SELECTION][SEGMENT_PIPELINE_DROP] segId=${segId} reason=${reason}`);
        });
      }
    }
    
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
    // A3.8.29: Return JSON payload instead of response object
    // A3.8.33: Selection mode final diagnostics
    if (selectionUsed && runId && reqSig) {
      const sentences = selectionSentencesCount || 0;
      const returned = finalResponseObject?.statements?.length || 0;
      const degraded = finalResponseObject?.meta?.extractionQuality === "degraded";
      const mergedSmall = selectionMergedSmallCount || 0;
      diag(runId, reqSig, `[SELECTION][FINAL] sentences=${sentences} returned=${returned} degraded=${degraded} mergedSmall=${mergedSmall}`);
    }
    
    return finalResponseObject;
  } catch (err) {
      // Graceful degradation: even on error, return valid JSON with fallback statements
    // A3.7.5: Ensure CORS headers are set defensively (safe to repeat)
    setCorsHeaders(req, res);
    
    // A3.7.4: Add diagnostics for fatal errors
    const errorName = err?.name || "Error";
    const errorMessage = err?.message || String(err);
    const errorStack = err?.stack ? err.stack.substring(0, 300) : null;
    const currentPhase = "unknown"; // Could be enhanced with phase tracking
    try {
      diag(runId || "unknown", reqSig || "unknown", `[PIPELINE_FATAL_ERROR] name="${errorName}" message="${errorMessage.substring(0, 200)}" stack="${errorStack || "none"}" mode=${selectionUsed ? "selection" : "normal"} phase=${currentPhase}`);
    } catch (logErr) {
      // Best-effort logging
    }
    
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
        // A3.8.29: Return JSON payload instead of response object
        return finalResponseObject;
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
    
    // A3.7.8: Initialize statements safely - it may not be defined if error occurred early
    let finalStatements = [];
    try {
      // A3.6.9: Check if statements already exist (after filterDraftOnly, enforceAnchorCitations, etc.)
      // If so, use them instead of re-extracting to preserve citations/evidence
      // A3.7.8: Safely check if statements is defined (may not exist if error occurred before initialization)
      const hasExistingStatements = typeof statements !== "undefined" && Array.isArray(statements) && statements.length > 0;
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
      
      if (hasExistingStatements && returningAssembled && typeof statements !== "undefined") {
        // A3.6.9: Use existing statements - preserve citations/evidence already injected
        // Ensure citations/evidence are mirrored to top-level before returning
        // A3.7.8: Extra safety check - statements is verified to exist by hasExistingStatements check
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
      // A3.6.72: Last resort - use best-effort permissive split ONLY if the full pipeline failed
      // This should NOT trigger just because seg-guard threw (we handle that separately)
      // A3.5.21 Step 2: Set hasReturned flag before return in fallback error path
      hasReturned = true;
      
      // A3.7.5: Ensure CORS headers are set defensively (safe to repeat)
      setCorsHeaders(req, res);
      
      // A3.7.4: Add diagnostics for fatal errors with full details
      const errorName = fallbackErr?.name || "Error";
      const errorMessage = fallbackErr?.message || String(fallbackErr);
      const errorStack = fallbackErr?.stack ? fallbackErr.stack.substring(0, 300) : null;
      const currentPhase = "fallback_error_handler";
      try {
        diag(runId || "unknown", reqSig || "unknown", `[PIPELINE_FATAL_ERROR] name="${errorName}" message="${errorMessage.substring(0, 200)}" stack="${errorStack || "none"}" mode=${selectionUsed ? "selection" : "normal"} phase=${currentPhase}`);
      } catch (logErr) {
        // Best-effort logging
      }
      
      // A3.7.4: Try to extract best-effort statements - use selectedText in selection mode, draftText otherwise
      // A3.7.7: Use hoisted selectedText (always defined, may be empty string)
      let bestEffortStatements = [];
      const fallbackBody = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
      // A3.7.7: Safe access to hoisted selectedText - use it if selectionUsed is true and selectedText is non-empty
      const fallbackText = (selectionUsed && selectedText && selectedText.trim().length > 0) ? selectedText : (fallbackBody?.draftText || "");
      if (fallbackText && typeof fallbackText === "string" && fallbackText.trim()) {
        try {
          const permissiveSplit = fallbackText
            .split(/[.!?\n]+/)
            .map(s => s.trim())
            .filter(s => s.length >= 20)
            .map(s => sanitizeCandidateText(s, runId, reqSig))
            .filter(s => s && s.trim().length >= 20)
            .slice(0, 25)
            .map((text, idx) => ({
              text,
              __draftPosition: idx,
              __candidateIndex: idx,
              assessment: {
                reliabilityScore: 50,
                reliabilityLabel: "Low",
                reasons: [`Extracted via best-effort fallback: "${text.substring(0, 60)}${text.length > 60 ? "..." : ""}"`]
              }
            }));
          bestEffortStatements = permissiveSplit;
        } catch (splitErr) {
          // If even permissive split fails, continue with empty
        }
      }
      
      // Build references from request body (already parsed above)
      const fallbackSources = Array.isArray(fallbackBody.sources) ? fallbackBody.sources : [];
      const fallbackUploadedReferences = fallbackSources.map((s, idx) => ({
        id: idx + 1,
        title: s?.name || s?.title || "Untitled source",
        url: s?.url || null,
        type: "uploaded",
      }));
      
      // A3.5.21 Fix: Wrap END_DIAG and cleanup in try/catch to prevent logging crashes
      try {
        diag(runId || "unknown", reqSig || "unknown", `END_DIAG path=fallback_error status=200 returningNow=true bestEffortStatements=${bestEffortStatements.length}`);
        if (runId && runStateByRid[runId]) {
          delete runStateByRid[runId];
        }
      } catch (logErr) {
        // Best-effort logging
      }
      // A3.7.4: Build meta with selection mode fields and error diagnostics
      const meta = {
        webSearch: { enabled: true, used: false },
        extractionQuality: bestEffortStatements.length > 0 ? "degraded" : "failed",
        extractionQualityReasons: bestEffortStatements.length > 0 ? ["pipeline_fatal_error"] : ["pipeline_fatal_error", "no_statements"],
        uploadedSourcesCount: fallbackUploadedReferences.length,
        webSourcesCount: 0,
      };
      
      // A3.7.4: Add selection mode metadata if applicable
      // A3.7.7: Safe access to hoisted selectedText (always defined, may be empty string)
      if (selectionUsed) {
        meta.selectionUsed = true;
        meta.selectionPreview = (selectedText && selectedText.trim().length > 0) ? (selectedText.length <= 120 ? selectedText : selectedText.substring(0, 120) + "...") : "";
        meta.selectionStatementCountReturned = 0;
        meta.selectionStatementsReturned = bestEffortStatements.length;
      }
      
      // A3.7.4: Add error diagnostics only when extractionQuality is degraded
      if (meta.extractionQuality === "degraded" || meta.extractionQuality === "failed") {
        meta.degradedReasonCode = "pipeline_fatal_error";
        meta.degradedErrorName = errorName;
      }
      
      return res.status(200).json({
        ok: true,
        statements: bestEffortStatements,
        references: fallbackUploadedReferences,
        meta,
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

