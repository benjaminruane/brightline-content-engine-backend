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
  
  // Patterns for document-descriptive statements
  const docDescriptivePatterns = [
    // Investment/evaluation language
    /\b(?:evaluating|evaluates|evaluation of|considering|considers|consideration of|proposing|proposes|proposal to|recommending|recommends|recommendation to)\b/i,
    // Document action language
    /\b(?:this memo|the memo|this document|the document|this report|the report)\s+(?:evaluates|proposes|recommends|considers|discusses|outlines|describes|presents|examines|analyzes)/i,
    // Investment-specific patterns
    /\b(?:investment|funding|financing|acquisition|partnership)\s+(?:opportunity|proposal|evaluation|consideration)/i,
    // Decision/action language about the memo's purpose
    /\b(?:decision to|decision on|action to|action on|plan to|plan for)\b/i,
  ];
  
  // Check if statement matches document-descriptive patterns
  const matchesPattern = docDescriptivePatterns.some((pattern) => pattern.test(lower));
  
  // Also check reasons for document-descriptive indicators
  const hasDocReason = reasonsText.includes("memo") || 
                       reasonsText.includes("document") ||
                       reasonsText.includes("evaluation") ||
                       reasonsText.includes("proposal");
  
  // Must match pattern or have doc reason, AND not be an anchor fact
  const hasFactualAnchor = isAnchorFact(text);
  
  return (matchesPattern || hasDocReason) && !hasFactualAnchor;
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
// Uses RESOLVED citations (after resolveCitations has run)
function applyDualAxisVerification(statements, unifiedReferences) {
  if (!Array.isArray(statements)) return statements;
  
  // Build map of uploaded references for document-descriptive statement checking
  const uploadedRefIds = new Set();
  if (Array.isArray(unifiedReferences)) {
    unifiedReferences.forEach((ref) => {
      if (ref?.type === "uploaded" && ref?.id != null) {
        uploadedRefIds.add(String(ref.id));
      }
    });
  }
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    // Citations at this point are already resolved by resolveCitations
    const resolvedCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const hasResolvableCitations = resolvedCitations.length > 0;
    const isAnchor = isAnchorFact(text);
    const isMeta = isMetaStatement(text);
    const isDocDescriptive = isDocumentDescriptive(text, reasons);
    
    // Check if document-descriptive statement has memo support
    const hasMemoSupport = isDocDescriptive && resolvedCitations.some((c) => 
      uploadedRefIds.has(String(c))
    );
    
    // Early return ONLY if: has resolvable citations (world facts) OR document-descriptive with memo support
    if (hasResolvableCitations || hasMemoSupport) return stmt;
    
    // All other cases: force Low (no provenance = no verification)
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
  if (!parsed || typeof parsed !== "object") return [];
  
  let statements = Array.isArray(parsed.statements) ? parsed.statements : [];
  if (statements.length === 0) return [];
  
  const maxRef = typeof maxRefIndex === "number" && maxRefIndex > 0 ? maxRefIndex : 0;
  const normalized = new Map(); // For deduplication
  
  const coerced = [];
  
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
    
    if (normalized.has(normalizedKey)) continue; // Skip duplicate
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
    if (coerced.length >= 25) break;
  }
  
  return coerced;
}

// Filter statements to only include those present in draft text (hard gate)
// Normalizes whitespace and case for comparison, requires high overlap
function filterDraftOnlyStatements(statements, draftText) {
  if (!Array.isArray(statements) || statements.length === 0) return statements;
  if (typeof draftText !== "string" || !draftText.trim()) return statements;
  
  // Normalize draft text: lowercase, collapse whitespace
  const normalizedDraft = draftText
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  
  const filtered = [];
  
  for (const stmt of statements) {
    if (!stmt || typeof stmt !== "object") continue;
    
    const text = typeof stmt.text === "string" ? stmt.text.trim() : "";
    if (!text) continue;
    
    // Normalize statement text: lowercase, collapse whitespace
    const normalizedStmt = text
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    
    // Check if statement text appears in draft (exact match or high-overlap substring)
    // Require at least 80% of statement words to appear in draft
    const stmtWords = normalizedStmt.split(/\s+/).filter((w) => w.length > 2); // Filter very short words
    if (stmtWords.length === 0) {
      // Very short statement - require exact or near-exact match
      if (normalizedDraft.includes(normalizedStmt)) {
        filtered.push(stmt);
      } else {
        console.log(`[Review] Dropped non-draft statement: "${text.substring(0, 50)}..."`);
      }
      continue;
    }
    
    // Count how many statement words appear in draft
    const matchingWords = stmtWords.filter((word) => normalizedDraft.includes(word));
    const overlapRatio = matchingWords.length / stmtWords.length;
    
    // Also check if normalized statement is a substring of draft (for verbatim matches)
    const isSubstring = normalizedDraft.includes(normalizedStmt);
    
    // Accept if: exact substring match OR high word overlap (>=80%)
    if (isSubstring || overlapRatio >= 0.8) {
      filtered.push(stmt);
    } else {
      console.log(`[Review] Dropped non-draft statement: "${text.substring(0, 50)}..."`);
    }
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

// Final post-condition clamp: ensure no High/Medium with missing citations
// This is the absolute final check before returning response
function applyFinalPostCheck(statements, unifiedReferences) {
  if (!Array.isArray(statements)) return statements;
  
  // Build map of uploaded references for document-descriptive statement checking
  const uploadedRefIds = new Set();
  if (Array.isArray(unifiedReferences)) {
    unifiedReferences.forEach((ref) => {
      if (ref?.type === "uploaded" && ref?.id != null) {
        uploadedRefIds.add(String(ref.id));
      }
    });
  }
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const resolvedCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const score = typeof assessment.reliabilityScore === "number" ? assessment.reliabilityScore : 30;
    const label = typeof assessment.reliabilityLabel === "string" ? assessment.reliabilityLabel : "Low";
    
    const isDocDescriptive = isDocumentDescriptive(text, reasons);
    const hasMemoSupport = isDocDescriptive && resolvedCitations.some((c) => 
      uploadedRefIds.has(String(c))
    );
    
    // Allow >35 only if: document-descriptive with memo support OR has resolved citations
    const canBeHighMedium = hasMemoSupport || resolvedCitations.length > 0;
    
    // If score >35 but no valid provenance, force Low
    if (score > 35 && !canBeHighMedium) {
      const forcedScore = Math.min(score, 35);
      let updatedReasons = [...reasons];
      const verificationReason = "No verifiable sources cited.";
      
      // Ensure verification reason is present
      if (!updatedReasons.some((r) => r && r.includes("No verifiable sources"))) {
        updatedReasons = [verificationReason, ...updatedReasons].slice(0, 4);
      }
      
      console.log(`[Review] Final clamp: forced Low (${forcedScore}) for statement with score ${score}: "${text.substring(0, 50)}..."`);
      
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
    
    // E) Apply anchor-fact gating: force Low if anchor facts lack citations
    statements = applyAnchorGating(statements);
    
    // F) Final post-condition clamp: ensure no High/Medium with missing citations
    statements = applyFinalPostCheck(statements, unifiedReferences);

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
      
      // Apply same pipeline as main path: draft filter → resolve → dual-axis → calibration → anchor → post-check
      const fallbackDraftText = typeof req.body === "string" ? safeJsonParse(req.body)?.draftText || "" : req.body?.draftText || "";
      const filteredFallbackStatements = filterDraftOnlyStatements(fallbackStatements, fallbackDraftText);
      const resolvedFallbackStatements = resolveCitations(filteredFallbackStatements, fallbackUploadedReferences);
      const verifiedFallbackStatements = applyDualAxisVerification(resolvedFallbackStatements, fallbackUploadedReferences);
      const calibratedFallbackStatements = applyNonAnchorCalibration(verifiedFallbackStatements);
      const gatedFallbackStatements = applyAnchorGating(calibratedFallbackStatements);
      const finalFallbackStatements = applyFinalPostCheck(gatedFallbackStatements, fallbackUploadedReferences);

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
