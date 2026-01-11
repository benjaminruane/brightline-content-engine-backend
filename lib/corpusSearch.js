// lib/corpusSearch.js
// A3.5.12: Lightweight deterministic corpus search for uploaded sources
// Purpose: Gate absence-language in Review by ensuring full corpus is searched

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
 * Extract and normalize numeric values from text
 * Returns array of normalized numeric values (in base units, e.g., 25000000 for $25mm)
 * A3.6.49: Also extracts percentages (e.g., 20 for "20%")
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
 * 
 * @param {string} statementText - The statement text to search for
 * @param {Array<{id: string|number, title: string, text: string}>} uploadedDocs - Array of uploaded documents
 * @returns {{found: boolean, hits: Array<{docId: string|number, excerpt: string, matchType: string}>, debug?: object}}
 */
export function corpusSearch(statementText, uploadedDocs) {
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
  };
  
  const normalizedStatement = normalizeText(statementText);
  const statementNumericValues = extractNumericValues(statementText);
  const dealTermCategory = detectDealTermCategory(statementText);
  
  if (statementNumericValues.length > 0) {
    debug.normalizedNumbersFound = statementNumericValues;
  }
  if (dealTermCategory) {
    debug.keywordsMatched = [dealTermCategory];
  }
  
  // Search each document
  for (const doc of docsWithFullText) {
    const docText = doc.text || "";
    const docId = doc.id;
    const docTitle = doc.title || `doc_${docId}`;
    const normalizedDoc = normalizeText(docText);
    
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
    if (statementNumericValues.length > 0) {
      const docNumericValues = extractNumericValues(docText);
      let numericMatch = false;
      
      for (const stmtValue of statementNumericValues) {
        for (const docValue of docNumericValues) {
          if (numericValuesMatch(stmtValue, docValue)) {
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
          }
        }
        if (numericMatch) break;
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
  
  const found = hits.length > 0;
  
  // Diagnostics
  if (found) {
    console.log(`[DIAG] corpusSearch: FOUND matches for statement "${statementText.substring(0, 60)}..."`, {
      hitsCount: hits.length,
      matchTypes: [...new Set(hits.map(h => h.matchType))],
      docIds: [...new Set(hits.map(h => h.docId))],
      debug,
    });
  } else {
    console.log(`[DIAG] corpusSearch: NO matches for statement "${statementText.substring(0, 60)}..."`, {
      searchedDocs: docsWithFullText.length,
      debug,
    });
  }
  
  return {
    found,
    hits: hits.slice(0, 10), // Limit hits
    debug: found ? debug : undefined,
  };
}

