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

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
  
  // DIAGNOSTIC: Log unifiedReferences structure
  console.log(`[DIAG] unifiedReferences count: ${unifiedReferences.length}`);
  if (unifiedReferences.length > 0) {
    const sampleRef = unifiedReferences[0];
    console.log(`[DIAG] Sample reference structure:`, {
      hasId: 'id' in sampleRef,
      idValue: sampleRef?.id,
      idType: typeof sampleRef?.id,
      hasRefId: 'refId' in sampleRef,
      refIdValue: sampleRef?.refId,
      keys: Object.keys(sampleRef || {}),
      fullRef: JSON.stringify(sampleRef, null, 2).substring(0, 200),
    });
    unifiedReferences.forEach((ref, idx) => {
      console.log(`[DIAG] Reference[${idx}]: id=${ref?.id} (type: ${typeof ref?.id}), type=${ref?.type}, title="${ref?.title?.substring(0, 30)}"`);
    });
  }
  
  // Build references map keyed by String(id) to handle both number and string IDs
  const referencesById = new Map();
  unifiedReferences.forEach((ref) => {
    const id = ref?.id;
    if (id != null) {
      referencesById.set(String(id), ref);
    }
  });
  
  console.log(`[DIAG] referencesById map size: ${referencesById.size}, keys: [${Array.from(referencesById.keys()).join(', ')}]`);
  
  return statements.map((stmt, stmtIdx) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const assessment = stmt.assessment || {};
    const citations = Array.isArray(assessment.citations) ? assessment.citations : [];
    
    // DIAGNOSTIC: Log statement citations before resolution
    if (citations.length > 0 || stmtIdx < 3) {
      console.log(`[DIAG] Statement[${stmtIdx}] "${stmt.text?.substring(0, 50)}...":`, {
        citationsBefore: citations,
        citationTypes: citations.map(c => typeof c),
        score: assessment.reliabilityScore,
        label: assessment.reliabilityLabel,
      });
    }
    
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
    
    // DIAGNOSTIC: Log classification and memo injection
    if (category === "DOCUMENT_DESCRIPTIVE" || resolvedCitations.length === 0) {
      console.log(`[DIAG] applyDualAxisVerification statement:`, {
        text: text.substring(0, 60),
        category,
        provenance,
        resolvedCitationsBefore: resolvedCitations,
        hasMemoReference: !!memoReference,
        memoReferenceId: memoReference?.id,
        memoReferenceIdType: typeof memoReference?.id,
      });
    }
    
    // Allow if provenance is valid (CITED_OK or MEMO_OK)
    if (provenance === "CITED_OK" || provenance === "MEMO_OK") {
      // For MEMO_OK document-descriptive statements without citations, inject memo citation
      if (provenance === "MEMO_OK" && resolvedCitations.length === 0 && memoReference) {
        const injectedId = memoReference.id;
        // Verify injected ID exists in unifiedReferences
        const idExists = unifiedReferences.some(r => r.id === injectedId);
        console.log(`[DIAG] MEMO_OK injection:`, {
          text: text.substring(0, 60),
          injectedId,
          injectedIdType: typeof injectedId,
          idExistsInReferences: idExists,
          availableIds: unifiedReferences.map(r => ({ id: r.id, type: typeof r.id, refType: r.type })),
        });
        
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
  console.log(`[DIAG] coerceStatements: input count=${statements.length}, maxRefIndex=${maxRefIndex}`);
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
      console.log(`[DIAG] coerceStatements: hit 25-statement cap, remaining=${statements.length - coerced.length - skippedCount}`);
      break;
    }
  }
  
  console.log(`[DIAG] coerceStatements: output count=${coerced.length}, skipped duplicates=${skippedCount}`);
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

function filterDraftOnlyStatements(statements, draftText) {
  if (!Array.isArray(statements) || statements.length === 0) return statements;
  if (typeof draftText !== "string" || !draftText.trim()) return statements;
  
  console.log(`[DIAG] filterDraftOnlyStatements: input count=${statements.length}, draftText length=${draftText.length}`);
  
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
        console.log(`[Review] Dropped non-draft statement: "${text.substring(0, 50)}..."`);
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
      console.log(`[Review] Dropped non-draft statement: "${text.substring(0, 50)}..."`);
    }
  }
  
  console.log(`[DIAG] filterDraftOnlyStatements: output count=${filtered.length}, dropped=${dropped.length}`);
  if (dropped.length > 0) {
    console.log(`[DIAG] Dropped statements (first 5):`, dropped.slice(0, 5).map(d => ({
      reason: d.reason,
      text: d.text,
      overlapRatio: d.overlapRatio,
      threshold: d.threshold,
      missingTokens: d.missingTokens,
    })));
  }
  
  return filtered;
}

// Fallback extraction when model fails
function fallbackExtractAtomicStatements(draftText) {
  if (typeof draftText !== "string" || !draftText.trim()) return [];
  
  // Split into sentences (period, newline, or exclamation/question marks)
  const sentences = draftText
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10); // Filter very short fragments
  
  const statements = [];
  const seen = new Set();
  
  // Factual anchor patterns
  const hasFactualAnchor = (text) => {
    return (
      /\b(19|20)\d{2}\b/.test(text) || // Years
      /[$£€¥]\s*[\d,]+/.test(text) || // Currency
      /\b\d+(?:\.\d+)?\s*%/.test(text) || // Percentages
      /\b(nyse|nasdaq|tsx|lse|hkex|asx)\b/i.test(text) || // Exchanges
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text) // Months
    );
  };
  
  // Split compound sentences conservatively
  const splitCompound = (text) => {
    const parts = [];
    // Split on semicolons, " and ", " but " (conservative)
    const separators = /;\s*|,\s+and\s+|,\s+but\s+/i;
    if (separators.test(text)) {
      const split = text.split(separators);
      parts.push(...split.map((p) => p.trim()).filter((p) => p.length > 10));
    } else {
      parts.push(text);
    }
    return parts;
  };
  
  for (const sentence of sentences) {
    // Prefer sentences with factual anchors
    if (hasFactualAnchor(sentence)) {
      const parts = splitCompound(sentence);
      for (const part of parts) {
        if (part.length < 10) continue;
        const normalized = part.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        
        statements.push({
          text: part,
          assessment: {
            reliabilityScore: 25,
            reliabilityLabel: "Low",
            reasons: ["Auto-extracted from the draft due to analysis degradation; no supporting source (uploaded or web) was confirmed."],
            citations: [],
          },
        });
        
        if (statements.length >= 12) break;
      }
    }
    
    if (statements.length >= 12) break;
  }
  
  // If we still don't have enough, add non-anchored sentences
  if (statements.length < 12) {
    for (const sentence of sentences) {
      if (hasFactualAnchor(sentence)) continue; // Already processed
      
      const parts = splitCompound(sentence);
      for (const part of parts) {
        if (part.length < 15) continue; // Slightly longer for non-anchored
        const normalized = part.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        
        statements.push({
          text: part,
          assessment: {
            reliabilityScore: 25,
            reliabilityLabel: "Low",
            reasons: ["Auto-extracted from the draft due to analysis degradation; no supporting source (uploaded or web) was confirmed."],
            citations: [],
          },
        });
        
        if (statements.length >= 12) break;
      }
      
      if (statements.length >= 12) break;
    }
  }
  
  return statements;
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
// This is the final authority on anchor facts and runs AFTER all other processing
// Note: Dual-axis verification already handles this, but this provides explicit anchor-specific enforcement
function applyAnchorGating(statements) {
  if (!Array.isArray(statements)) return statements;
  
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
    
    // STRICT: If anchor fact AND no citations: always force Low
    // Citations can be from either uploaded sources or web references
    if (isAnchor && !hasCitations) {
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

// Extract anchor facts from statement text (valuation, funding, revenue, etc.)
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
    }
    
    facts.push({
      value: numericValue,
      type: anchorType,
      text: text,
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

// A3.5.11: Corpus-level verification before absence claims
// Normalize numeric values for search (e.g., "25 million" ↔ "$25mm" ↔ "25m")
function normalizeNumericForSearch(text) {
  if (typeof text !== "string") return [];
  
  const normalized = [];
  const lower = text.toLowerCase();
  
  // Extract all numeric values
  const numericPatterns = [
    /\$?([\d,]+(?:\.\d+)?)\s*(million|mm|m\b|M\b)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s*(trillion|t\b|T\b)/gi,
    /\$([\d,]+(?:\.\d+)?)/g,
  ];
  
  for (const pattern of numericPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const numStr = match[1]?.replace(/,/g, "") || match[1];
      const num = parseFloat(numStr);
      if (Number.isFinite(num)) {
        // Generate variations
        normalized.push(`${num} million`);
        normalized.push(`$${num} million`);
        normalized.push(`$${num}mm`);
        normalized.push(`$${num}m`);
        normalized.push(`${num}m`);
        normalized.push(`$${num}`);
        normalized.push(String(num));
      }
    }
  }
  
  return [...new Set(normalized)];
}

// Extract key terms from statement for corpus search
function extractKeyTerms(statementText) {
  if (typeof statementText !== "string" || !statementText.trim()) return [];
  
  const terms = [];
  const lower = statementText.toLowerCase();
  
  // Deal terms and key concepts
  const dealTermPatterns = [
    /\b(valuation|pre-?money|post-?money|premoney|postmoney)\b/gi,
    /\b(liquidation\s+preference|liquidation preference)\b/gi,
    /\b(board\s+seats?|board seats?)\b/gi,
    /\b(secondary|secondary sale|secondary transaction)\b/gi,
    /\b(funding|financing|round|series\s+[a-z])\b/gi,
    /\b(revenue|sales|income|ARR|MRR)\b/gi,
    /\b(valuation|val)\b/gi,
  ];
  
  for (const pattern of dealTermPatterns) {
    const matches = [...statementText.matchAll(pattern)];
    for (const match of matches) {
      const term = match[0].trim();
      if (term && !terms.includes(term.toLowerCase())) {
        terms.push(term.toLowerCase());
      }
    }
  }
  
  // Extract important noun phrases (simplified)
  const nounPhrases = statementText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g);
  if (nounPhrases) {
    for (const phrase of nounPhrases.slice(0, 5)) {
      // Skip very short phrases
      if (phrase.length > 4 && !terms.includes(phrase.toLowerCase())) {
        terms.push(phrase.toLowerCase());
      }
    }
  }
  
  return terms;
}

// Perform corpus-level search for a statement
// Returns: { found: boolean, matches: string[] }
function searchCorpus(statementText, uploadedSources) {
  if (!Array.isArray(uploadedSources) || uploadedSources.length === 0) {
    return { found: false, matches: [] };
  }
  
  if (typeof statementText !== "string" || !statementText.trim()) {
    return { found: false, matches: [] };
  }
  
  const matches = [];
  const statementLower = statementText.toLowerCase();
  
  // Normalize numeric values from statement
  const numericVariations = normalizeNumericForSearch(statementText);
  
  // Extract key terms
  const keyTerms = extractKeyTerms(statementText);
  
  // Search each uploaded source
  for (const source of uploadedSources) {
    const sourceText = typeof source.text === "string" ? source.text : "";
    if (!sourceText.trim()) continue;
    
    const sourceLower = sourceText.toLowerCase();
    
    // 1. Direct substring match (case-insensitive, with some tolerance)
    const normalizedStatement = statementText
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    const normalizedSource = sourceText
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    // Check if key parts of statement appear in source
    const statementWords = normalizedStatement.split(/\s+/).filter(w => w.length > 3);
    const matchingWords = statementWords.filter(w => normalizedSource.includes(w));
    const wordOverlapRatio = statementWords.length > 0 ? matchingWords.length / statementWords.length : 0;
    
    if (wordOverlapRatio >= 0.5) {
      matches.push(`High word overlap (${Math.round(wordOverlapRatio * 100)}%) in "${source.name || "source"}"`);
    }
    
    // 2. Numeric value matching (both string patterns and actual value comparison)
    for (const numVar of numericVariations) {
      if (sourceLower.includes(numVar.toLowerCase())) {
        matches.push(`Numeric value "${numVar}" found in "${source.name || "source"}"`);
        break;
      }
    }
    
    // Also extract numeric values from statement and check if similar values exist in source
    const statementNumericValue = normalizeAnchorValue(statementText);
    if (statementNumericValue !== null) {
      // Extract numeric values from source text
      const sourceNumericPatterns = [
        /\$?([\d,]+(?:\.\d+)?)\s*(million|mm|m\b|M\b)/gi,
        /\$?([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/gi,
        /\$?([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/gi,
        /\$([\d,]+(?:\.\d+)?)/g,
      ];
      
      for (const pattern of sourceNumericPatterns) {
        const sourceMatches = [...sourceText.matchAll(pattern)];
        for (const match of sourceMatches) {
          const numStr = match[1]?.replace(/,/g, "") || match[1];
          const num = parseFloat(numStr);
          if (Number.isFinite(num)) {
            const unit = match[2]?.toLowerCase() || "";
            const multipliers = {
              mm: 1e6, million: 1e6, m: 1e6,
              billion: 1e9, b: 1e9,
              thousand: 1e3, k: 1e3,
            };
            const multiplier = multipliers[unit] || 1;
            const sourceValue = num * multiplier;
            
            // Allow 5% tolerance for numeric matching
            const tolerance = 0.05;
            if (Math.abs(sourceValue - statementNumericValue) / Math.max(Math.abs(statementNumericValue), 1) <= tolerance) {
              matches.push(`Numeric value match (${statementNumericValue} ≈ ${sourceValue}) in "${source.name || "source"}"`);
              break;
            }
          }
        }
      }
    }
    
    // 3. Key term matching
    for (const term of keyTerms) {
      if (sourceLower.includes(term)) {
        matches.push(`Key term "${term}" found in "${source.name || "source"}"`);
        break;
      }
    }
    
    // 4. Fuzzy matching: check if significant portions of statement appear
    // Split statement into meaningful chunks
    const statementChunks = statementText
      .split(/[,;.]/)
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length > 10);
    
    for (const chunk of statementChunks.slice(0, 3)) {
      const chunkLower = chunk.toLowerCase();
      const chunkWords = chunkLower.split(/\s+/).filter(w => w.length > 3);
      if (chunkWords.length >= 3) {
        const chunkMatching = chunkWords.filter(w => sourceLower.includes(w));
        if (chunkMatching.length >= Math.ceil(chunkWords.length * 0.6)) {
          matches.push(`Chunk match in "${source.name || "source"}": "${chunk.substring(0, 50)}..."`);
          break;
        }
      }
    }
  }
  
  return {
    found: matches.length > 0,
    matches: [...new Set(matches)].slice(0, 5), // Deduplicate and limit
  };
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

// Enforce corpus-level verification before absence claims (A3.5.11)
// Core Invariant: Review MUST NOT assert absence unless corpus-level search performed and returned no match
function enforceCorpusVerificationBeforeAbsence(statements, uploadedSources) {
  if (!Array.isArray(statements) || !Array.isArray(uploadedSources)) return statements;
  
  // Only process if there are uploaded sources
  if (uploadedSources.length === 0) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const text = typeof stmt.text === "string" ? stmt.text : "";
    
    // Check if reasons contain absence claims
    if (!hasAbsenceClaim(reasons)) return stmt; // No absence claim, no action needed
    
    // Perform corpus-level search
    const corpusSearch = searchCorpus(text, uploadedSources);
    
    if (corpusSearch.found) {
      // Corpus search found matches - MUST NOT state absence
      // Replace absence language with support language
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
      
      console.log(`[Review] A3.5.11: Prevented absence claim for statement with corpus matches: "${text.substring(0, 50)}..."`);
      
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
      
      console.log(`[Review] A3.5.11: Allowed absence claim after corpus search (no matches): "${text.substring(0, 50)}..."`);
      
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
      console.log(`[DIAG] applyFinalPostCheck statement (score=${score}):`, {
        text: text.substring(0, 60),
        category,
        provenance,
        resolvedCitations,
        hasMemoReference: !!memoReference,
        memoReferenceId: memoReference?.id,
      });
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
      console.log(`[DIAG] applyFinalPostCheck: MEMO_OK injection:`, {
        text: text.substring(0, 60),
        injectedId,
        injectedIdType: typeof injectedId,
        idExistsInReferences: idExists,
        currentCitations: assessment.citations,
      });
      
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

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
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

    if (!draftText.trim()) return res.status(400).json({ error: "Missing draftText" });

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
    const publicSearch = true;
    const query = deriveQueryFromDraft(draftText);
    
    let search = { ok: false, results: [] };
    let webBlock = "";
    let webReferences = [];
    
    try {
      search = await tavilySearch({ query, maxResults: 6 });
      webBlock = formatWebResultsForPrompt(search);
      webReferences = webResultsToReferences(search?.results || []);
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
    
    // DIAGNOSTIC: Log unifiedReferences structure before processing
    console.log(`[DIAG] unifiedReferences created: count=${unifiedReferences.length}`);
    unifiedReferences.forEach((ref, idx) => {
      console.log(`[DIAG] unifiedReferences[${idx}]:`, {
        id: ref.id,
        idType: typeof ref.id,
        type: ref.type,
        title: ref.title?.substring(0, 40),
        hasUrl: !!ref.url,
      });
    });

    const system = `
You are the "Review" engine inside Content Engine.

EXTRACTION RULES (CRITICAL - HARD REQUIREMENT):
- Extract ONLY statements that are EXPLICITLY PRESENT in the DRAFT text.
- Each statement MUST map to a draft text span (verbatim or clear paraphrase).
- Do NOT introduce new facts from source documents.
- Do NOT create statements derived solely from uploaded sources or web sources.
- Source documents may NOT introduce new review statements.
- If a claim is not in the draft, do NOT include it in the review.
- Exclude: opinions, hype/marketing fluff, recommendations, predictions, vague assertions.
- Split compound multi-claim sentences into separate statements.
- Minimal rewriting: keep statements close to draft wording.
- Deduplicate near-duplicates.

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

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact schema:
{
  "statements": [
    {
      "text": "string (atomic factual statement)",
      "assessment": {
        "reliabilityScore": number (0-100),
        "reliabilityLabel": "High|Medium|Low",
        "reasons": ["string", ...] (up to 4 reasons),
        "citations": [1,2] (array of integers, empty if unsupported)
      }
    }
  ]
}

If no extractable statements are found, return: {"statements": []}
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
    
    // DIAGNOSTIC: Log raw model output
    if (parsed && typeof parsed === "object") {
      const rawStatements = Array.isArray(parsed.statements) ? parsed.statements : [];
      console.log(`[DIAG] Model output: parsed.statements count=${rawStatements.length}`);
      if (rawStatements.length > 0) {
        rawStatements.slice(0, 3).forEach((stmt, idx) => {
          console.log(`[DIAG] Raw model statement[${idx}]:`, {
            text: stmt?.text?.substring(0, 60),
            hasAssessment: !!stmt?.assessment,
            citations: stmt?.assessment?.citations,
            citationTypes: stmt?.assessment?.citations?.map(c => typeof c),
          });
        });
      }
    } else {
      console.log(`[DIAG] Model output: parsed is null or invalid, type=${typeof parsed}`);
    }
    
    // Coerce and validate statements (using unified references count)
    let statements = coerceStatements(parsed, maxRefIndex);
    
    // Graceful fallback if model output is invalid or empty
    if (statements.length === 0) {
      statements = fallbackExtractAtomicStatements(draftText);
      extractionQuality = "degraded";
    }
    
    // A) Draft-only filter: enforce statements must appear in draft text (hard gate)
    statements = filterDraftOnlyStatements(statements, draftText);
    
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
    statements = applyAnchorGating(statements);
    
    // F) Final post-condition clamp: ensure no High/Medium with missing citations
    statements = applyFinalPostCheck(statements, unifiedReferences);
    
    // G) Normalize response structure: ensure citations and evidence are at top-level
    // This enforces the response contract that the Review UI expects
    statements = normalizeResponseStructure(statements, unifiedReferences);
    
    // H) Sanitize reasons: remove misleading "no sources cited" messages when citations/evidence exist
    // Also improve language when web search is enabled (A3.5.8)
    const webSearchEnabled = publicSearch === true;
    const webSearchUsed = Boolean(search?.ok && (search?.results || []).length);
    statements = sanitizeReasons(statements, webSearchEnabled, webSearchUsed);
    
    // I) Enforce reason specificity: require explicit enumeration for partial support and contradiction cases (A3.5.9)
    statements = enforceReasonSpecificity(statements);
    
    // J) Fix anchor-fact reasons: detect and correct false "not mentioned" claims with semantic matching (A3.5.10)
    statements = fixAnchorFactReasons(statements, unifiedReferences);
    
    // K) Enforce corpus-level verification before absence claims (A3.5.11)
    // MUST perform corpus search before allowing "not mentioned" / "not supported" claims
    statements = enforceCorpusVerificationBeforeAbsence(statements, uploadedSources);
    
    // DIAGNOSTIC: Log final state before returning
    console.log(`[DIAG] Final response: statements count=${statements.length}, references count=${unifiedReferences.length}`);
    if (statements.length > 0) {
      statements.slice(0, 3).forEach((stmt, idx) => {
        const assessment = stmt.assessment || {};
        console.log(`[DIAG] Final statement[${idx}]:`, {
          text: stmt.text?.substring(0, 60),
          score: assessment.reliabilityScore,
          label: assessment.reliabilityLabel,
          assessmentCitations: assessment.citations,
          topLevelCitations: stmt.citations,
          evidenceCount: Array.isArray(stmt.evidence) ? stmt.evidence.length : 0,
          citationTypes: assessment.citations?.map(c => typeof c),
          reasons: assessment.reasons?.slice(0, 2),
        });
      });
    }
    console.log(`[DIAG] Final unifiedReferences (first 3):`, unifiedReferences.slice(0, 3).map(r => ({
      id: r.id,
      idType: typeof r.id,
      type: r.type,
    })));

    return res.status(200).json({
      ok: true,
      statements,
      references: unifiedReferences,
      meta: {
        webSearch: { enabled: true, used: Boolean(search?.ok && (search?.results || []).length) },
        extractionQuality,
        uploadedSourcesCount: uploadedReferences.length,
        webSourcesCount: webReferencesWithIds.length,
      },
    });
  } catch (err) {
      // Graceful degradation: even on error, return valid JSON with fallback statements
    try {
      const fallbackStatements = fallbackExtractAtomicStatements(
        typeof req.body === "string" ? safeJsonParse(req.body)?.draftText || "" : req.body?.draftText || ""
      );
      
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
      const fallbackDraftText = typeof req.body === "string" ? safeJsonParse(req.body)?.draftText || "" : req.body?.draftText || "";
      const filteredFallbackStatements = filterDraftOnlyStatements(fallbackStatements, fallbackDraftText);
      const resolvedFallbackStatements = resolveCitations(filteredFallbackStatements, fallbackUploadedReferences);
      const verifiedFallbackStatements = applyDualAxisVerification(resolvedFallbackStatements, fallbackUploadedReferences);
      const calibratedFallbackStatements = applyNonAnchorCalibration(verifiedFallbackStatements);
      const toleranceAdjustedFallbackStatements = applyParaphraseTolerance(calibratedFallbackStatements, fallbackUploadedReferences);
      const gatedFallbackStatements = applyAnchorGating(toleranceAdjustedFallbackStatements);
      const postCheckedFallbackStatements = applyFinalPostCheck(gatedFallbackStatements, fallbackUploadedReferences);
      const normalizedFallbackStatements = normalizeResponseStructure(postCheckedFallbackStatements, fallbackUploadedReferences);
      // Web search not available in fallback path
      const sanitizedFallbackStatements = sanitizeReasons(normalizedFallbackStatements, false, false);
      const specificityEnforcedFallbackStatements = enforceReasonSpecificity(sanitizedFallbackStatements);
      const anchorFixedFallbackStatements = fixAnchorFactReasons(specificityEnforcedFallbackStatements, fallbackUploadedReferences);
      // A3.5.11: Enforce corpus-level verification before absence claims in fallback path
      const fallbackUploadedSources = fallbackSources.map((s) => ({
        id: s?.id || null,
        name: s?.name || s?.title || "Untitled source",
        text: s?.text || "",
        kind: s?.kind || s?.sourceType || "file",
        url: s?.url || null,
      }));
      const finalFallbackStatements = enforceCorpusVerificationBeforeAbsence(anchorFixedFallbackStatements, fallbackUploadedSources);

      return res.status(200).json({
        ok: true,
        statements: finalFallbackStatements,
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
}
