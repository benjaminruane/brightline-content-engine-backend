/**
 * A3.19.5: Value-level DealTerms semantic typing (principle-based, deterministic).
 * Corpus layer only. No canonicalClaims or scoring changes.
 */

// Cue dictionary by DealTerms type (lowercase for matching)
const CUE_BY_TYPE = {
  valuation_pre_money: ["pre-money", "premoney", "pre money", "valuation pre-money", "valued at pre-money", "pre-money valuation"],
  valuation_post_money: ["post-money", "postmoney", "post money", "valuation post-money", "post-money valuation"],
  valuation_generic: ["valuation", "valued at", "company valued", "implied valuation"],
  investment_amount: ["invest", "investment", "investing", "investment of", "raised", "raise", "funding", "financing", "round", "led by", "participation", "commit", "commitment", "capital injection"],
  raise_amount: ["raised", "raise", "raising", "funding of", "financing of", "round size", "total raise", "gross proceeds"],
};

const SCORE_SAME_SENTENCE = 10;
const SCORE_0_6_TOKENS = 8;
const SCORE_7_12_TOKENS = 5;
const SCORE_13_18_TOKENS = 2;
const SCORE_DIRECTIONAL_BEFORE = 2;

const VALUE_TOLERANCE = 0.05;

function numericValuesMatch(val1, val2) {
  if (typeof val1 !== "number" || typeof val2 !== "number") return false;
  if (!Number.isFinite(val1) || !Number.isFinite(val2)) return false;
  const diff = Math.abs(val1 - val2);
  const maxVal = Math.max(Math.abs(val1), Math.abs(val2), 1);
  return diff / maxVal <= VALUE_TOLERANCE;
}

/** Deterministic sentence boundaries: [.?!;] and newline blocks. Returns { sentences: string[], sentenceStarts: number[] } (starts[i] = start of sentence i; ends at starts[i+1] or blob.length). */
function sentenceSplitWithStarts(text) {
  if (typeof text !== "string" || text.length === 0) return { sentences: [], sentenceStarts: [] };
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const re = /[.?!;]\s+|\n{2,}/g;
  const starts = [0];
  let m;
  while ((m = re.exec(normalized)) !== null) {
    starts.push(m.index + m[0].length);
  }
  starts.push(normalized.length);
  const sentences = [];
  for (let i = 0; i < starts.length - 1; i++) {
    const seg = normalized.slice(starts[i], starts[i + 1]).trim();
    if (seg.length > 0) sentences.push(seg);
  }
  const sentenceStarts = starts.slice(0, sentences.length + 1);
  return { sentences, sentenceStarts };
}

/** Tokenize: split on whitespace (deterministic). */
function tokenize(text) {
  if (typeof text !== "string") return [];
  return text.trim().split(/\s+/).filter(Boolean);
}

/** Find first USD span in blob that parses to numericValue. Returns { start, end, valueText } or null. */
export function findValueSpan(blob, numericValue) {
  if (typeof blob !== "string" || !Number.isFinite(numericValue)) return null;
  const patterns = [
    { re: /\$?([\d,]+(?:\.\d+)?)\s*(mm|million|m\b|M\b)/gi, mult: { mm: 1e6, million: 1e6, m: 1e6 } },
    { re: /\$?([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/gi, mult: { billion: 1e9, b: 1e9 } },
    { re: /\$?([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/gi, mult: { thousand: 1e3, k: 1e3 } },
    { re: /\$([\d,]+(?:\.\d+)?)/g, mult: {} },
  ];
  for (const { re, mult } of patterns) {
    const matches = [...blob.matchAll(re)];
    for (const m of matches) {
      const numStr = (m[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      const unit = (m[2] || "").toLowerCase();
      const multiplier = mult[unit] || 1;
      const value = num * multiplier;
      if (numericValuesMatch(value, numericValue)) {
        return { start: m.index, end: m.index + m[0].length, valueText: m[0] };
      }
    }
  }
  return null;
}

/** Which sentence index contains charOffset. sentenceStarts[i]..sentenceStarts[i+1] is sentence i. */
function getSentenceContaining(sentences, charOffset, sentenceStarts) {
  for (let s = 0; s < sentenceStarts.length - 1; s++) {
    if (charOffset >= sentenceStarts[s] && charOffset < sentenceStarts[s + 1]) return s;
  }
  return 0;
}

/** Char offset in sentence to token index. */
function charOffsetToTokenIndex(sentence, charOffsetInSentence) {
  const tokens = tokenize(sentence);
  let cum = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (charOffsetInSentence <= cum + tokens[i].length) return i;
    cum += tokens[i].length + 1;
  }
  return Math.max(0, tokens.length - 1);
}

/** Score cues in text; return { cuesUsed, scoresByType }. */
function scoreCues(blob, valueStart, valueEnd, sentences, sentenceStarts, sentenceIndex) {
  const cuesUsed = [];
  const scoresByType = {};

  const sentenceStart = sentenceStarts[sentenceIndex] ?? 0;
  const sentenceEnd = sentenceStarts[sentenceIndex + 1] ?? blob.length;
  const sentence = blob.slice(sentenceStart, sentenceEnd);
  const sentLower = sentence.toLowerCase();
  const sentTokens = tokenize(sentence);
  const valueOffsetInSentence = (valueStart + valueEnd) / 2 - sentenceStart;
  const valueTokenIndex = charOffsetToTokenIndex(sentence, valueOffsetInSentence);

  for (const [type, cues] of Object.entries(CUE_BY_TYPE)) {
    if (!scoresByType[type]) scoresByType[type] = 0;
    for (const cue of cues) {
      let idx = sentLower.indexOf(cue);
      while (idx !== -1) {
        const cueTokenIndex = charOffsetToTokenIndex(sentence, idx);
        const distanceTokens = Math.abs(cueTokenIndex - valueTokenIndex);
        let location = "sentence";
        let side = "S";
        if (sentenceStart + idx < valueStart) side = "L";
        else if (sentenceStart + idx + cue.length > valueEnd) side = "R";

        let score = SCORE_SAME_SENTENCE;
        if (distanceTokens <= 6) score += SCORE_0_6_TOKENS;
        else if (distanceTokens <= 12) score += SCORE_7_12_TOKENS;
        else if (distanceTokens <= 18) score += SCORE_13_18_TOKENS;
        if (side === "L" && distanceTokens <= 6) score += SCORE_DIRECTIONAL_BEFORE;

        cuesUsed.push({ cue, type, location, distanceTokens, side });
        scoresByType[type] = (scoresByType[type] || 0) + score;
        idx = sentLower.indexOf(cue, idx + 1);
      }
    }
  }

  return { cuesUsed, scoresByType };
}

/**
 * Compute value-level type for a DealTerms value span.
 * @param {{ start: number, end: number, valueText: string }} span - value span in blob
 * @param {string} blob - full text
 * @param {string} baselineTypedAs - type from prior heuristic (e.g. A3.19.1)
 * @param {{ runId?: string, reqSig?: string }} options - optional for diag
 * @returns {{ typedAs: string, confidenceBand: string, rationale: string, cuesUsed: Array, contextSliceMeta: object, typingMethod: string, baselineTypedAs: string, typingFallbackUsed?: boolean, warnings: string[] }}
 */
export function computeDealTermsValueType(span, blob, baselineTypedAs, options = {}) {
  const warnings = [];
  const typingMethod = "value_level_v1";
  const baseline = baselineTypedAs || "unknown";

  if (!span || typeof blob !== "string" || blob.length === 0) {
    return {
      typedAs: baseline,
      confidenceBand: "low",
      rationale: "No blob or span",
      cuesUsed: [],
      contextSliceMeta: {},
      typingMethod,
      baselineTypedAs: baseline,
      typingFallbackUsed: true,
      warnings: ["Missing span or blob"],
    };
  }

  const { start, end, valueText } = span;
  const { sentences, sentenceStarts } = sentenceSplitWithStarts(blob);
  const valueMid = Math.floor((start + end) / 2);
  const sentenceIndex = getSentenceContaining(sentences, valueMid, sentenceStarts);
  const { cuesUsed, scoresByType } = scoreCues(blob, start, end, sentences, sentenceStarts, sentenceIndex);

  const types = Object.keys(scoresByType).filter((t) => scoresByType[t] > 0);
  const sorted = [...types].sort((a, b) => (scoresByType[b] || 0) - (scoresByType[a] || 0));
  const topScore = sorted.length > 0 ? scoresByType[sorted[0]] : 0;
  const secondScore = sorted.length > 1 ? scoresByType[sorted[1]] : 0;
  const delta = topScore - secondScore;

  let typedAs = baseline;
  let confidenceBand = "low";
  let typingFallbackUsed = false;

  const valuationGenericScore = scoresByType.valuation_generic || 0;
  const hasValuationGeneric = valuationGenericScore >= 8;

  if (topScore >= 10 || (topScore >= 8 && delta >= 3)) {
    typedAs = sorted[0];
    typingFallbackUsed = false;
  } else if (hasValuationGeneric) {
    typedAs = "valuation_generic";
    confidenceBand = delta >= 3 ? "medium" : "low";
  } else {
    typedAs = baseline;
    typingFallbackUsed = true;
  }

  if (topScore >= 18 && delta >= 6) confidenceBand = "high";
  else if (topScore >= 10 && delta >= 3) confidenceBand = "medium";

  const contextStart = Math.max(0, start - 70);
  const contextEnd = Math.min(blob.length, end + 70);
  const contextSnippet = blob.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim().slice(0, 140);

  const rationale = typingFallbackUsed
    ? `Fallback to baseline (topScore=${topScore}, second=${secondScore})`
    : `Value-level: ${typedAs} (topScore=${topScore}, delta=${delta})`;

  return {
    typedAs,
    confidenceBand,
    rationale,
    cuesUsed,
    contextSliceMeta: { sentenceIndex, contextSnippetLength: contextSnippet.length, contextSnippet },
    typingMethod,
    baselineTypedAs: baseline,
    topScore,
    secondScore,
    ...(typingFallbackUsed ? { typingFallbackUsed: true } : {}),
    warnings,
  };
}
