// lib/corpus-numeric-anchor.mjs
// A6.49d: Deterministic excerpt anchoring for numeric corpus hits (corpus → V2 boundary).

/**
 * A3.8.60 / A6.49d: Same tolerance as corpusSearch numeric matching.
 * @param {number} val1
 * @param {number} val2
 * @returns {boolean}
 */
export function numericValuesMatch(val1, val2) {
  if (typeof val1 !== "number" || typeof val2 !== "number") return false;
  if (!Number.isFinite(val1) || !Number.isFinite(val2)) return false;
  const tolerance = 0.05;
  const diff = Math.abs(val1 - val2);
  const maxVal = Math.max(Math.abs(val1), Math.abs(val2), 1);
  return diff / maxVal <= tolerance;
}

/** @param {RegExpMatchArray} match */
function valueFromDocMoneyPatternMatch(match) {
  const numStr = (match[1] || "").replace(/,/g, "");
  const num = parseFloat(numStr);
  if (!Number.isFinite(num)) return null;
  const unit = (match[2] || "").toLowerCase();
  let magnitude = null;
  if (unit === "m" || unit === "million" || unit === "mm") {
    magnitude = "m";
  } else if (unit === "b" || unit === "billion") {
    magnitude = "b";
  } else if (unit === "k" || unit === "thousand") {
    magnitude = "k";
  }
  const multipliers = {
    mm: 1e6, million: 1e6, m: 1e6,
    billion: 1e9, b: 1e9,
    thousand: 1e3, k: 1e3,
  };
  const multiplier = multipliers[unit] || 1;
  return num * multiplier;
}

/**
 * Enumerate (index, canonicalValue) surfaces in left-to-right order, aligned with corpusSearch
 * doc money patterns + percent + compact magnitudes (no fuzzy / nearest-number heuristics).
 * @param {string} docText
 * @returns {Array<{ index: number, value: number }>}
 */
function enumerateNumericSurfaces(docText) {
  if (typeof docText !== "string" || !docText.length) return [];
  /** @type {Array<{ index: number, value: number }>} */
  const surfaces = [];

  const pctPattern = /([\d,]+(?:\.\d+)?)\s*%/g;
  let m;
  while ((m = pctPattern.exec(docText)) !== null) {
    const numStr = (m[1] || "").replace(/,/g, "");
    const num = parseFloat(numStr);
    if (Number.isFinite(num) && num > 0 && num <= 100) {
      surfaces.push({ index: m.index, value: num });
    }
  }

  const docMoneyPatterns = [
    /\$?([\d,]+(?:\.\d+)?)\s*(mm|million|m\b|M\b)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/gi,
    /\$?([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/gi,
  ];
  for (const pattern of docMoneyPatterns) {
    const matches = [...docText.matchAll(pattern)];
    for (const match of matches) {
      const v = valueFromDocMoneyPatternMatch(match);
      if (v != null && Number.isFinite(v)) surfaces.push({ index: match.index, value: v });
    }
  }

  // X1.1e-style compact magnitudes (same family as parseCompactMagnitudeNumbers)
  const compactRe = /(?:US\$|S\$|A\$|NZ\$|\$)?\s*([\d,]+(?:\.\d+)?)[\s\u00A0\u2009\r\n]*(k|mm|bn|b|m(?!s)(?!in))\b/gi;
  while ((m = compactRe.exec(docText)) !== null) {
    if (m.index > 0 && /\w/.test(docText[m.index - 1])) continue;
    const numStr = (m[1] || "").replace(/,/g, "");
    const num = parseFloat(numStr);
    if (!Number.isFinite(num)) continue;
    const suffix = (m[2] || "").toLowerCase();
    const mult = suffix === "k" ? 1e3 : suffix === "mm" || suffix === "m" ? 1e6 : suffix === "bn" || suffix === "b" ? 1e9 : 1;
    let value = num * mult;
    value = Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9 ? Math.round(value) : value;
    if (Number.isFinite(value)) surfaces.push({ index: m.index, value });
  }

  // Plain $ amounts (extractNumericValues) — after magnitudes so $5 million binds to 5e6 first
  const plainDollar = /\$([\d,]+(?:\.\d+)?)/g;
  while ((m = plainDollar.exec(docText)) !== null) {
    const numStr = (m[1] || "").replace(/,/g, "");
    const num = parseFloat(numStr);
    if (Number.isFinite(num) && num > 0) surfaces.push({ index: m.index, value: num });
  }

  surfaces.sort((a, b) => a.index - b.index);
  const seen = new Set();
  const deduped = [];
  for (const s of surfaces) {
    const key = `${s.index}:${s.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }
  return deduped;
}

/**
 * A6.49d: First document position (left-to-right) whose canonical value matches docValue.
 * @param {string} docText
 * @param {number} docValue
 * @param {number} stmtValue
 * @param {string} statementText
 * @returns {number} index >= 0, or -1
 */
export function findDeterministicNumericAnchorIndex(docText, docValue, stmtValue, statementText) {
  if (typeof docText !== "string" || !docText.length) return -1;
  if (typeof docValue !== "number" || !Number.isFinite(docValue)) return -1;

  // Mirror corpusSearch L1486–1491: percent branch uses stmt token in doc
  if (
    stmtValue <= 100
    && stmtValue > 0
    && stmtValue === Math.floor(stmtValue)
    && typeof statementText === "string"
  ) {
    const pctRe = new RegExp(`\\b${stmtValue}\\s*%`, "i");
    const pctMatch = docText.match(pctRe);
    if (pctMatch && pctMatch.index != null && numericValuesMatch(docValue, stmtValue)) {
      return pctMatch.index;
    }
  }

  const surfaces = enumerateNumericSurfaces(docText);
  for (const s of surfaces) {
    if (numericValuesMatch(docValue, s.value)) return s.index;
  }
  return -1;
}

/**
 * @param {string} text
 * @param {number} matchIndex
 * @param {number} [contextLength=100]
 */
export function extractExcerptAroundAnchor(text, matchIndex, contextLength = 100) {
  if (typeof text !== "string" || matchIndex < 0) return "";
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(text.length, matchIndex + contextLength);
  return text.substring(start, end).trim();
}

/**
 * A6.49d: Resolve excerpt for one accepted (stmtValue, docValue) numeric corpus match.
 * @returns {{ excerpt: string, anchorIndex: number, rejectionReason: string | null }}
 */
export function resolveNumericCorpusHitExcerpt(docText, docValue, stmtValue, statementText, options = {}) {
  const { diagVerbose = false, docId = null } = options;
  const anchorIndex = findDeterministicNumericAnchorIndex(docText, docValue, stmtValue, statementText);
  if (anchorIndex < 0) {
    if (diagVerbose) {
      console.log("[DIAG][A6.49d][NUMERIC_HIT_REJECT]", {
        reason: "numeric_hit_rejected_no_valid_anchor",
        docId,
        docValue,
        stmtValue,
      });
    }
    return { excerpt: "", anchorIndex: -1, rejectionReason: "numeric_hit_rejected_no_valid_anchor" };
  }
  const excerpt = extractExcerptAroundAnchor(docText, anchorIndex, 100);
  if (!excerpt || !String(excerpt).trim()) {
    if (diagVerbose) {
      console.log("[DIAG][A6.49d][NUMERIC_HIT_REJECT]", {
        reason: "numeric_hit_rejected_empty_excerpt_after_anchor",
        docId,
        docValue,
        anchorIndex,
      });
    }
    return { excerpt: "", anchorIndex, rejectionReason: "numeric_hit_rejected_empty_excerpt_after_anchor" };
  }
  if (diagVerbose) {
    console.log("[DIAG][A6.49d][NUMERIC_HIT_ACCEPT]", {
      docId,
      docValue,
      anchorIndex,
      excerptLength: excerpt.length,
    });
  }
  return { excerpt, anchorIndex, rejectionReason: null };
}
