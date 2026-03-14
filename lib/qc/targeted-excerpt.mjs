// lib/qc/targeted-excerpt.mjs
// A6.13: Targeted excerpt selection for QC. Prefer exact entity/numeric/action match, highest lexical overlap, shortest adequate excerpt.
// Output: selectedExcerptText, selectedExcerptReason, excerptMatchType (exact | close | related_only | none).

const EXCERPT_MATCH_TYPES = Object.freeze(["exact", "close", "related_only", "none"]);
const EXCERPT_REASONS = Object.freeze([
  "entity_numeric_match",
  "entity_action_match",
  "trend_match",
  "related_but_not_direct",
  "entity_match",
  "numeric_match",
  "lexical_best",
  "fallback_first",
]);

/** Normalize for token overlap: lowercase, collapse whitespace, strip punctuation for comparison. */
function normalizeForOverlap(s) {
  if (typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .trim();
}

/** Extract significant words (length >= 2, not stopwords) for overlap. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "to", "for", "with", "from", "by", "at", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "this", "that", "these", "those", "it", "its",
]);
function tokenSet(text) {
  const n = normalizeForOverlap(text);
  const words = n.split(/\s+/).filter((w) => w.length >= 2 && !STOP.has(w));
  return new Set(words);
}

/** Jaccard-like overlap score (0–1): intersection size / union size for word sets. */
function lexicalOverlap(claimSet, excerptSet) {
  if (claimSet.size === 0) return 0;
  let inter = 0;
  for (const w of claimSet) {
    if (excerptSet.has(w)) inter++;
  }
  const union = claimSet.size + excerptSet.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** True if excerpt contains a numeric that appears in or matches claim (e.g. $5 million, 5m). */
function hasNumericMatch(claimText, excerptText) {
  const claimNum = claimText.match(/\$?\s*[\d,]+(?:\s*(?:million|billion|m|bn|k|%))?/gi);
  if (!claimNum || claimNum.length === 0) return false;
  const excerptNorm = excerptText.toLowerCase();
  for (const n of claimNum) {
    const v = n.replace(/\s/g, "").toLowerCase();
    if (excerptNorm.includes(v) || excerptNorm.includes(n.toLowerCase().trim())) return true;
  }
  return false;
}

/** Heuristic: same “action” verb family (launch, launched, launching). */
function actionOverlap(claimText, excerptText) {
  const claimNorm = normalizeForOverlap(claimText);
  const excerptNorm = normalizeForOverlap(excerptText);
  const actions = ["launch", "raised", "raise", "funding", "invest", "release", "released", "expand", "acquire", "partner", "expect", "expects"];
  for (const a of actions) {
    if (claimNorm.includes(a) && excerptNorm.includes(a)) return true;
  }
  return false;
}

/** Heuristic: entity (company/product) appears in excerpt. */
function entityInExcerpt(claimText, excerptText) {
  const words = normalizeForOverlap(claimText).split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
  const ex = normalizeForOverlap(excerptText);
  for (const w of words) {
    if (w.length >= 4 && ex.includes(w)) return true;
  }
  return false;
}

/**
 * Score a single binding for how well its excerpt targets the claim.
 * Higher = better. Prefer shortest among ties (handled by caller).
 * @returns {{ score: number, reason: string, matchType: 'exact'|'close'|'related_only' }}
 */
function scoreBinding(claimText, binding) {
  const excerpt = (binding && typeof binding.excerpt === "string") ? binding.excerpt.trim() : "";
  if (!excerpt) return { score: 0, reason: "related_but_not_direct", matchType: "related_only" };

  const claimSet = tokenSet(claimText);
  const excerptSet = tokenSet(excerpt);
  const overlap = lexicalOverlap(claimSet, excerptSet);
  const hasNum = hasNumericMatch(claimText, excerpt);
  const hasAction = actionOverlap(claimText, excerpt);
  const hasEntity = entityInExcerpt(claimText, excerpt);
  const bindingMatchType = (binding.matchType || "").toLowerCase();

  // exact: strong signal (numeric + entity/action) or binding says exact/paraphrase
  if (bindingMatchType === "exact" || (hasNum && (hasEntity || hasAction) && overlap >= 0.15)) {
    const reason = hasNum ? "entity_numeric_match" : hasAction ? "entity_action_match" : "entity_match";
    return { score: 100 + overlap * 50, reason, matchType: "exact" };
  }
  if (bindingMatchType === "paraphrase" || bindingMatchType === "rounded_equivalent" || bindingMatchType === "unit_equivalent") {
    const reason = hasNum ? "entity_numeric_match" : hasAction ? "entity_action_match" : "entity_match";
    return { score: 80 + overlap * 40, reason, matchType: "exact" };
  }

  // close: good overlap or one strong signal
  if (overlap >= 0.2 || (hasEntity && hasAction) || (hasNum && hasEntity)) {
    const reason = hasNum ? "entity_numeric_match" : hasAction ? "entity_action_match" : overlap >= 0.25 ? "trend_match" : "entity_match";
    return { score: 50 + overlap * 30, reason, matchType: "close" };
  }
  if (bindingMatchType === "partial_support" && (hasEntity || hasAction)) {
    return { score: 40 + overlap * 20, reason: "entity_action_match", matchType: "close" };
  }

  // related_only: some relevance but not direct
  if (overlap >= 0.08 || hasEntity || hasAction) {
    return { score: 10 + overlap * 10, reason: "related_but_not_direct", matchType: "related_only" };
  }
  return { score: 5, reason: "related_but_not_direct", matchType: "related_only" };
}

/**
 * Select the best excerpt for this statement from candidate support bindings.
 * Prefer: exact entity/numeric/action match, highest lexical overlap, then shortest excerpt that still supports.
 *
 * @param {string} statementText - Claim/statement text
 * @param {Array<{ refId?: string, excerpt?: string, matchType?: string }>} candidateBindings - Eligible support bindings with excerpt
 * @param {Object} [opts] - Options
 * @param {number} [opts.maxExcerptLength] - Cap excerpt length (default 220)
 * @returns {{ selectedBinding: object|null, selectedExcerptText: string|null, selectedExcerptReason: string, excerptMatchType: 'exact'|'close'|'related_only'|'none' }}
 */
export function selectTargetedExcerpt(statementText, candidateBindings, opts = {}) {
  const maxLen = opts.maxExcerptLength ?? 220;
  const claim = typeof statementText === "string" ? statementText.trim() : "";
  const candidates = Array.isArray(candidateBindings) ? candidateBindings : [];

  if (candidates.length === 0) {
    return {
      selectedBinding: null,
      selectedExcerptText: null,
      selectedExcerptReason: "related_but_not_direct",
      excerptMatchType: "none",
      directness: "none",
    };
  }

  const scored = candidates.map((b) => {
    const { score, reason, matchType } = scoreBinding(claim, b);
    const excerpt = (b.excerpt && String(b.excerpt).trim()) || "";
    const len = excerpt.length;
    return { binding: b, score, reason, matchType, excerpt, len };
  });

  // Sort: highest score first; within same score band prefer shorter excerpt
  scored.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    return a.len - b.len;
  });

  const best = scored[0];
  if (!best || !best.excerpt) {
    return {
      selectedBinding: best?.binding ?? null,
      selectedExcerptText: null,
      selectedExcerptReason: best?.reason ?? "related_but_not_direct",
      excerptMatchType: "none",
      directness: "none",
    };
  }

  let selectedExcerptText = best.excerpt;
  if (selectedExcerptText.length > maxLen) {
    selectedExcerptText = selectedExcerptText.slice(0, maxLen - 3).trim() + "…";
  }

  // A6.23: directness for commentary/hover truthfulness — direct | related_only | weak_related | none
  const mt = best.matchType;
  const directness =
    mt === "exact" || mt === "close"
      ? "direct"
      : mt === "related_only"
        ? (best.score < 15 ? "weak_related" : "related_only")
        : "none";

  return {
    selectedBinding: best.binding,
    selectedExcerptText,
    selectedExcerptReason: best.reason,
    excerptMatchType: best.matchType,
    directness,
  };
}

export { EXCERPT_MATCH_TYPES, EXCERPT_REASONS };
