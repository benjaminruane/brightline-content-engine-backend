// lib/corpusSearch.js
// A3.5.12: Lightweight deterministic corpus search for uploaded sources
// Purpose: Gate absence-language in Review by ensuring full corpus is searched
// A3.8.76: Added RTF normalization for numeric extraction

/**
 * A3.8.76: Normalize uploaded document text (RTF → plain text conversion)
 * @param {string} docText - Raw document text
 * @param {Object} docMeta - Document metadata with title, mime, etc.
 * @returns {string} Normalized plain text
 */
export function normalizeUploadedDocText(docText, docMeta = {}) {
  if (typeof docText !== "string") return "";
  
  const title = docMeta?.title || "";
  const mime = docMeta?.mime || docMeta?.mimeType || "";
  const isRTF = title.toLowerCase().endsWith(".rtf") || 
                mime.toLowerCase().includes("rtf") ||
                mime.toLowerCase().includes("application/rtf");
  
  if (!isRTF) {
    return docText; // Not RTF, return as-is
  }
  
  // A3.8.76: Lightweight RTF to plain text conversion
  let normalized = docText;
  
  // Step 1: Replace escaped hex sequences \'hh with space (to avoid gluing tokens)
  normalized = normalized.replace(/\\'([0-9a-fA-F]{2})/g, " ");
  
  // Step 2: Remove RTF control words (conservative list)
  // Common control words: \par, \tab, \fsN, \fN, \b, \i, \u, etc.
  normalized = normalized.replace(/\\[a-z]+\d*\s*/gi, " ");
  
  // Step 3: Remove RTF groups (braces)
  normalized = normalized.replace(/[{}]/g, " ");
  
  // Step 4: Remove backslash escapes (keep $ and % as per spec)
  normalized = normalized.replace(/\\([^$%])/g, "$1");
  
  // Step 5: Collapse whitespace
  normalized = normalized.replace(/\s+/g, " ").trim();
  
  return normalized;
}

/**
 * Normalize text for comparison (whitespace, punctuation, unicode dashes)
 */
function normalizeText(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    // Normalize unicode dashes to ASCII hyphen
    .replace(/[–—]/g, "-")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    // Normalize punctuation (keep word boundaries)
    .replace(/[^\w\s-]/g, " ")
    .trim();
}

/**
 * A3.8.76: Fallback digit extraction (conservative, for diagnostics + matching assistance)
 * Extracts integers and decimals when main extraction fails
 * @param {string} text - Text to extract numbers from
 * @returns {Array<number>} Array of extracted numeric values
 */
function extractDigitsFallback(text) {
  if (typeof text !== "string") return [];
  
  const values = [];
  // Conservative pattern: integers and decimals (with optional commas)
  const pattern = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
  const matches = [...text.matchAll(pattern)];
  
  for (const match of matches) {
    const numStr = match[0].replace(/,/g, "");
    const num = parseFloat(numStr);
    if (Number.isFinite(num) && num > 0) {
      values.push(num);
    }
  }
  
  // Deduplicate
  return [...new Set(values)];
}

/**
 * Extract and normalize numeric values from text
 * Returns array of normalized numeric values (in base units, e.g., 25000000 for $25mm)
 * A3.6.49: Also extracts percentages (e.g., 20 for "20%")
 * A3.8.76: Added fallback digit extraction when main extraction fails
 */
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
      values.push(value);
    }
  }
  
  // A3.6.49: Extract percentages (e.g., "20%", "31%")
  const pctPattern = /([\d,]+(?:\.\d+)?)\s*%/g;
  const pctMatches = [...text.matchAll(pctPattern)];
  for (const match of pctMatches) {
    const numStr = (match[1] || "").replace(/,/g, "");
    const num = parseFloat(numStr);
    if (Number.isFinite(num) && num > 0 && num <= 100) {
      // Store percentage as-is (not multiplied)
      values.push(num);
    }
  }
  
  // A3.8.76: Safety fallback - if text has digits but no values extracted, use fallback
  const hasDigits = /\d/.test(text);
  if (hasDigits && values.length === 0) {
    const fallbackValues = extractDigitsFallback(text);
    // Only use fallback if we found some numbers
    if (fallbackValues.length > 0) {
      return fallbackValues;
    }
  }
  
  return [...new Set(values)];
}

/**
 * Check if two numeric values match (with 5% tolerance)
 */
function numericValuesMatch(val1, val2) {
  if (typeof val1 !== "number" || typeof val2 !== "number") return false;
  if (!Number.isFinite(val1) || !Number.isFinite(val2)) return false;
  const tolerance = 0.05;
  const diff = Math.abs(val1 - val2);
  const maxVal = Math.max(Math.abs(val1), Math.abs(val2), 1);
  return diff / maxVal <= tolerance;
}

/**
 * Deal term keyword sets (lightweight keyword matching)
 */
const DEAL_TERM_KEYWORDS = {
  valuation: ["pre-money", "pre money", "premoney", "post-money", "post money", "postmoney", "valuation", "val", "priced at", "priced"],
  preference: ["1x", "straight preferred", "liquidation preference", "liquidation", "preference"],
  governance: ["board", "board seat", "board seats", "two of five", "5 board", "board representation"],
  saleRights: ["force a sale", "force sale", "after 6 years", "six years", "drag-along", "drag along"],
  secondary: ["secondary", "common shares", "purchase", "secondary sale", "secondary transaction"],
};

/**
 * Detect which deal term category a statement belongs to
 */
function detectDealTermCategory(statementText) {
  if (typeof statementText !== "string") return null;
  const lower = normalizeText(statementText);
  
  for (const [category, keywords] of Object.entries(DEAL_TERM_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  
  return null;
}

/**
 * Check if corpus contains keywords from a deal term category
 */
function corpusHasDealTermKeywords(corpusText, category) {
  if (typeof corpusText !== "string" || !category) return false;
  const lower = normalizeText(corpusText);
  const keywords = DEAL_TERM_KEYWORDS[category] || [];
  
  for (const keyword of keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Simple token overlap (fuzzy matching fallback)
 * Returns ratio of matching significant tokens
 */
function tokenOverlap(text1, text2) {
  if (typeof text1 !== "string" || typeof text2 !== "string") return 0;
  
  const tokens1 = normalizeText(text1)
    .split(/\s+/)
    .filter(t => t.length > 3); // Only significant tokens
  
  const tokens2 = normalizeText(text2)
    .split(/\s+/)
    .filter(t => t.length > 3);
  
  if (tokens1.length === 0) return 0;
  
  const tokens2Set = new Set(tokens2);
  const matching = tokens1.filter(t => tokens2Set.has(t));
  
  return matching.length / tokens1.length;
}

/**
 * Extract a short excerpt around a match (for diagnostics)
 */
function extractExcerpt(text, matchIndex, contextLength = 100) {
  if (typeof text !== "string" || matchIndex < 0) return "";
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(text.length, matchIndex + contextLength);
  return text.substring(start, end).trim();
}

/**
 * A3.5.12: Deterministic corpus search for uploaded sources
 * A3.8.77: Added selectionMode parameter for numeric-only acceptance
 * 
 * @param {string} statementText - The statement text to search for
 * @param {Array<{id: string|number, title: string, text: string}>} uploadedDocs - Array of uploaded documents
 * @param {Object} options - Optional parameters { selectionMode?: boolean }
 * @returns {{found: boolean, hits: Array<{docId: string|number, excerpt: string, matchType: string}>, debug?: object}}
 */
export function corpusSearch(statementText, uploadedDocs, options = {}) {
  const { selectionMode = false } = options;
  if (typeof statementText !== "string" || !statementText.trim()) {
    return { found: false, hits: [] };
  }
  
  if (!Array.isArray(uploadedDocs) || uploadedDocs.length === 0) {
    return { found: false, hits: [] };
  }
  
  // Invariant 1: Ensure full text is available
  const docsWithFullText = uploadedDocs.filter(doc => {
    const hasText = typeof doc.text === "string" && doc.text.trim().length > 0;
    if (!hasText) {
      console.log(`[DIAG] corpusSearch: doc "${doc.title || doc.id}" has no full text, skipping`);
    }
    return hasText;
  });
  
  if (docsWithFullText.length === 0) {
    console.log(`[DIAG] corpusSearch: no docs with full text available`);
    return { found: false, hits: [] };
  }
  
  const hits = [];
  const debug = {
    normalizedNumbersFound: [],
    keywordsMatched: [],
    // A3.8.60: Split debug into numsInStmt, numsInDoc, matchesAccepted
    numsInStmt: [],
    numsInDoc: [],
    matchesAccepted: [],
  };
  
  const normalizedStatement = normalizeText(statementText);
  const statementNumericValues = extractNumericValues(statementText);
  const dealTermCategory = detectDealTermCategory(statementText);
  
  // A3.8.60: Extract magnitude classes from statement for scale validation
  const statementNumericWithMagnitude = [];
  const statementMoneyPatterns = [
    /\$?([\d,]+(?:\.\d+)?)\s*(mm|million|m\b|M\b)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/gi,
  ];
  
  for (const pattern of statementMoneyPatterns) {
    const matches = [...statementText.matchAll(pattern)];
    for (const match of matches) {
      const numStr = (match[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      
      const unit = (match[2] || "").toLowerCase();
      let magnitude = null;
      if (unit === "m" || unit === "million" || unit === "mm") {
        magnitude = "m";
      } else if (unit === "b" || unit === "billion" || unit === "b") {
        magnitude = "b";
      } else if (unit === "k" || unit === "thousand" || unit === "k") {
        magnitude = "k";
      }
      
      const multipliers = {
        mm: 1e6, million: 1e6, m: 1e6,
        billion: 1e9, b: 1e9,
        thousand: 1e3, k: 1e3,
      };
      const multiplier = multipliers[unit] || 1;
      const value = num * multiplier;
      
      statementNumericWithMagnitude.push({ value, magnitude, num });
    }
  }
  
  if (statementNumericValues.length > 0) {
    debug.normalizedNumbersFound = statementNumericValues;
    debug.numsInStmt = statementNumericValues;
  }
  if (dealTermCategory) {
    debug.keywordsMatched = [dealTermCategory];
  }
  
  // A3.8.77: Track extracted numbers across all docs (not keyword-gated)
  const allExtractedDocNums = new Set();
  let numericOnlyGateLogged = false; // A3.8.77: Track if diagnostic already logged (once per statement)
  
  // Search each document
  for (const doc of docsWithFullText) {
    // A3.8.76: Normalize RTF text if needed (doc should already be normalized, but be safe)
    const rawDocText = doc.text || "";
    const docId = doc.id;
    const docTitle = doc.title || `doc_${docId}`;
    const docMeta = { title: docTitle, mime: doc.mime || doc.mimeType || "" };
    const docText = normalizeUploadedDocText(rawDocText, docMeta);
    const normalizedDoc = normalizeText(docText);
    
    // A3.8.77: Always extract numeric values from doc (not keyword-gated)
    const docNumericValues = extractNumericValues(docText);
    
    // A3.8.77: Store extracted numbers in union set (always, regardless of matches)
    docNumericValues.forEach(v => allExtractedDocNums.add(v));
    
    // A3.8.76: Diagnostics for numeric statements
    if (statementNumericValues.length > 0) {
      const rawLen = rawDocText.length;
      const normalizedLen = docText.length;
      const hasDigitRaw = /\d/.test(rawDocText);
      const hasDigitNorm = /\d/.test(docText);
      const numsInDocCount = docNumericValues.length;
      const numsSample = docNumericValues.slice(0, 10).join(",");
      
      console.log(`[DIAG][A3.8.76][DOC_NUMS] docId=${docId} title="${docTitle}" rawLen=${rawLen} normalizedLen=${normalizedLen} hasDigitRaw=${hasDigitRaw} hasDigitNorm=${hasDigitNorm} numsInDocCount=${numsInDocCount} sample=[${numsSample}]`);
    }
    
    // A) Exact normalized phrase match
    if (normalizedDoc.includes(normalizedStatement)) {
      const matchIndex = docText.toLowerCase().indexOf(statementText.toLowerCase());
      const excerpt = extractExcerpt(docText, matchIndex);
      hits.push({
        docId,
        excerpt,
        matchType: "phrase",
      });
      continue; // Found exact match, no need for other checks
    }
    
    // B) Numeric anchor match (required)
    // A3.6.49: Also matches percentages
    // A3.8.60: Scale-consistent matching for money anchors
    // A3.8.77: docNumericValues already extracted above (not keyword-gated)
    if (statementNumericValues.length > 0) {
      // A3.8.60: Extract magnitude classes from doc for scale validation
      const docNumericWithMagnitude = [];
      const docMoneyPatterns = [
        /\$?([\d,]+(?:\.\d+)?)\s*(mm|million|m\b|M\b)/gi,
        /\$?([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/gi,
        /\$?([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/gi,
      ];
      for (const pattern of docMoneyPatterns) {
        const matches = [...docText.matchAll(pattern)];
        for (const match of matches) {
          const numStr = (match[1] || "").replace(/,/g, "");
          const num = parseFloat(numStr);
          if (!Number.isFinite(num)) continue;
          
          const unit = (match[2] || "").toLowerCase();
          let magnitude = null;
          if (unit === "m" || unit === "million" || unit === "mm") {
            magnitude = "m";
          } else if (unit === "b" || unit === "billion" || unit === "b") {
            magnitude = "b";
          } else if (unit === "k" || unit === "thousand" || unit === "k") {
            magnitude = "k";
          }
          
          const multipliers = {
            mm: 1e6, million: 1e6, m: 1e6,
            billion: 1e9, b: 1e9,
            thousand: 1e3, k: 1e3,
          };
          const multiplier = multipliers[unit] || 1;
          const value = num * multiplier;
          
          docNumericWithMagnitude.push({ value, magnitude, num });
        }
      }
      
      // A3.8.60: Track accepted and rejected matches
      const matchesAccepted = [];
      const matchesRejected = [];
      
      let numericMatch = false;
      for (const stmtValue of statementNumericValues) {
        // A3.8.60: Find corresponding statement magnitude info
        const stmtInfo = statementNumericWithMagnitude.find(info => 
          numericValuesMatch(info.value, stmtValue)
        );
        
        for (const docValue of docNumericValues) {
          if (numericValuesMatch(stmtValue, docValue)) {
            // A3.8.60: For money anchors with magnitude, validate scale consistency
            let acceptMatch = true;
            let rejectReason = null;
            
            if (stmtInfo && stmtInfo.magnitude) {
              // Statement has magnitude (e.g., "$5m") - require doc to have same magnitude
              const docInfo = docNumericWithMagnitude.find(info => 
                numericValuesMatch(info.value, docValue)
              );
              
              if (!docInfo || !docInfo.magnitude) {
                // Doc value has no magnitude - reject if it's a bare digit
                // Check if docValue is a small integer that could be a bare digit match
                if (docValue < 1000 && docValue === Math.floor(docValue)) {
                  acceptMatch = false;
                  rejectReason = "bare_digit_no_magnitude";
                }
              } else if (docInfo.magnitude !== stmtInfo.magnitude) {
                // Magnitude mismatch (e.g., "$5m" vs "$5b")
                acceptMatch = false;
                rejectReason = "magnitude_mismatch";
              } else {
                // Magnitude matches - also verify numbers match within tolerance
                const numTolerance = 0.1;
                if (Math.abs(docInfo.num - stmtInfo.num) > numTolerance) {
                  acceptMatch = false;
                  rejectReason = "number_mismatch";
                }
              }
            } else {
              // Statement has no magnitude - check if doc has magnitude that would be inconsistent
              const docInfo = docNumericWithMagnitude.find(info => 
                numericValuesMatch(info.value, docValue)
              );
              if (docInfo && docInfo.magnitude) {
                // Doc has magnitude but statement doesn't - this is OK for non-money anchors
                // But if statement value is large (>1000), it might be a money anchor without explicit magnitude
                if (stmtValue >= 1000) {
                  // Could be a million-scale value - be conservative
                  acceptMatch = false;
                  rejectReason = "potential_scale_mismatch";
                }
              }
            }
            
            if (acceptMatch) {
              matchesAccepted.push({ stmtValue, docValue });
              // Find the position of this numeric value in the doc
              // A3.6.49: Match both money amounts and percentages
              let valuePattern;
              if (stmtValue <= 100 && stmtValue > 0 && stmtValue === Math.floor(stmtValue)) {
                // Likely a percentage (0-100, integer)
                valuePattern = new RegExp(
                  `${stmtValue}\\s*%`,
                  "i"
                );
              } else {
                // Money amount
                valuePattern = new RegExp(
                  `\\$?[\\d,]+(?:\\.[\\d]+)?\\s*(?:mm|million|m|billion|b|thousand|k)?`,
                  "i"
                );
              }
              const match = docText.match(valuePattern);
              const matchIndex = match ? match.index : -1;
              const excerpt = extractExcerpt(docText, matchIndex);
              
              hits.push({
                docId,
                excerpt,
                matchType: "number",
              });
              numericMatch = true;
              break;
            } else {
              matchesRejected.push({ stmtValue, docValue, reason: rejectReason });
            }
          }
        }
        if (numericMatch) break;
      }
      
      // A3.8.60: Store doc nums and accepted matches in debug (accumulate across all docs)
      // A3.8.77: Store accepted matches (already accumulated above)
      if (matchesAccepted.length > 0) {
        const existingAccepted = new Set(debug.matchesAccepted || []);
        matchesAccepted.forEach(m => existingAccepted.add(m.docValue));
        debug.matchesAccepted = Array.from(existingAccepted);
      }
    }
    
    // A3.8.77: Numeric-only acceptance for selection mode with uploaded docs
    // This runs after the main numeric matching block to catch cases where strict validation rejected matches
    if (selectionMode && statementNumericValues.length > 0 && docNumericValues.length > 0) {
      // Compute numeric overlap between stmtNums and extractedDocNums
      const numericOverlap = [];
      for (const stmtValue of statementNumericValues) {
        for (const docValue of docNumericValues) {
          if (numericValuesMatch(stmtValue, docValue)) {
            // A3.8.77: Prefer largest canonical amount match
            // If stmtNums contains both [5000000, 5], and doc contains 5000000, accept 5000000
            const isLargerMatch = numericOverlap.length === 0 || docValue > Math.max(...numericOverlap);
            if (isLargerMatch || !numericOverlap.includes(docValue)) {
              numericOverlap.push(docValue);
            }
          }
        }
      }
      
      // Cap overlap size to avoid noisy acceptance
      const cappedOverlap = numericOverlap.slice(0, 10).sort((a, b) => b - a); // Sort descending to prefer larger values
      
      if (cappedOverlap.length > 0) {
        // Add to matchesAccepted if not already present
        const existingAccepted = new Set(debug.matchesAccepted || []);
        cappedOverlap.forEach(v => existingAccepted.add(v));
        debug.matchesAccepted = Array.from(existingAccepted);
        
        // A3.8.77: Diagnostic (only once per statement)
        if (!numericOnlyGateLogged) {
          const keywordsMatchedCount = debug.keywordsMatched?.length || 0;
          const extractedDocNumsCount = docNumericValues.length;
          const overlapSample = cappedOverlap.slice(0, 8).join(",");
          console.log(`[DIAG][A3.8.77][NUMERIC_ONLY_GATE] selection=true uploaded=true keywordsMatchedCount=${keywordsMatchedCount} extractedDocNumsCount=${extractedDocNumsCount} overlap=[${overlapSample}]`);
          numericOnlyGateLogged = true;
        }
        
        // A3.8.77: Set debug flag
        debug.numericAcceptanceMode = "numeric_only_uploaded_selection";
        
        // A3.8.77: Add hit if not already present
        if (!hits.some(h => h.docId === docId && h.matchType === "number")) {
          const excerpt = extractExcerpt(docText, 0, 150);
          hits.push({
            docId,
            excerpt,
            matchType: "number",
          });
        }
      }
    }
    
    // C) Keyword-set match for deal terms (required baseline)
    if (dealTermCategory) {
      const hasKeywords = corpusHasDealTermKeywords(docText, dealTermCategory);
      if (hasKeywords) {
        // If numeric anchor is required, check it's also present
        if (statementNumericValues.length > 0) {
          const docNumericValues = extractNumericValues(docText);
          let hasNumericMatch = false;
          for (const stmtValue of statementNumericValues) {
            for (const docValue of docNumericValues) {
              if (numericValuesMatch(stmtValue, docValue)) {
                hasNumericMatch = true;
                break;
              }
            }
            if (hasNumericMatch) break;
          }
          if (!hasNumericMatch) continue; // Need both keyword and numeric match
        }
        
        // Find keyword position for excerpt
        const keywords = DEAL_TERM_KEYWORDS[dealTermCategory] || [];
        let keywordIndex = -1;
        for (const keyword of keywords) {
          const idx = normalizedDoc.indexOf(keyword.toLowerCase());
          if (idx !== -1) {
            keywordIndex = idx;
            break;
          }
        }
        
        const excerpt = extractExcerpt(docText, keywordIndex);
        hits.push({
          docId,
          excerpt,
          matchType: "keyword",
        });
      }
    }
    
    // D) Basic fuzzy fallback (token overlap)
    const overlap = tokenOverlap(statementText, docText);
    if (overlap >= 0.5 && hits.length === 0) {
      // Only use fuzzy if no other matches found
      const excerpt = extractExcerpt(docText, 0, 150);
      hits.push({
        docId,
        excerpt,
        matchType: "fuzzy",
      });
    }
  }
  
  // A3.8.77: Ensure debug.numsInDoc is populated from extracted numbers (not keyword-gated)
  debug.numsInDoc = Array.from(allExtractedDocNums).sort((a, b) => a - b);
  
  // A3.8.66: Make FOUND depend on matchesAccepted.length > 0 (strict)
  // For statements with numeric values, only treat as FOUND if there are accepted matches
  // For statements without numeric values (phrase/keyword/fuzzy only), use hits.length > 0
  const hasNumericValues = statementNumericValues.length > 0;
  const hasAcceptedMatches = Array.isArray(debug.matchesAccepted) && debug.matchesAccepted.length > 0;
  const found = hasNumericValues 
    ? hasAcceptedMatches  // For numeric statements: require accepted matches
    : hits.length > 0;     // For non-numeric statements: any hit is valid
  
  // A3.8.60: DIAG log for corpus match validation
  if (debug.numsInStmt && debug.numsInStmt.length > 0) {
    const stmtNumsStr = debug.numsInStmt.join(",");
    const docNumsStr = (debug.numsInDoc || []).join(",");
    const acceptedStr = (debug.matchesAccepted || []).join(",");
    const rejectedCount = (statementNumericValues.length || 0) - (debug.matchesAccepted || []).length;
    console.log(`[DIAG][A3.8.60][CORPUS_MATCH] stmtNums=[${stmtNumsStr}] docNums=[${docNumsStr}] accepted=[${acceptedStr}] rejected=${rejectedCount}`);
  }
  
  // A3.8.66: Diagnostics - log based on matchesAccepted for numeric statements
  if (found) {
    console.log(`[DIAG] corpusSearch: FOUND matches for statement "${statementText.substring(0, 60)}..."`, {
      hitsCount: hits.length,
      matchesAcceptedCount: debug.matchesAccepted?.length || 0,
      hasNumericValues,
      matchTypes: [...new Set(hits.map(h => h.matchType))],
      docIds: [...new Set(hits.map(h => h.docId))],
      debug,
    });
  } else {
    // A3.8.66: Explicitly log NO matches when matchesAccepted is empty (for numeric statements)
    const reason = hasNumericValues && !hasAcceptedMatches ? "no_accepted_matches" : "no_hits";
    console.log(`[DIAG] corpusSearch: NO matches for statement "${statementText.substring(0, 60)}..." (reason=${reason})`, {
      hitsCount: hits.length,
      matchesAcceptedCount: debug.matchesAccepted?.length || 0,
      hasNumericValues,
      searchedDocs: docsWithFullText.length,
      debug,
    });
  }
  
  // A3.8.66: Return found=false and empty hits if no accepted matches (for numeric statements)
  if (!found) {
    return {
      found: false,
      hits: [],
      debug: debug, // Keep debug for diagnostics even when not found
    };
  }
  
  return {
    found: true,
    hits: hits.slice(0, 10), // Limit hits
    debug: debug,
  };
}

