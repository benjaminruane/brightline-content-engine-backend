// lib/qc/qc-v2-excerpt.mjs
// A7.13: QC V2 excerpt scoring, quality gates, passage/content-word helpers (extracted — logic unchanged).

import { isQuantityMismatchStructured } from "./binding-directness.mjs";

/** Claim types (rule-based). */
export const CLAIM_TYPES = Object.freeze([
  "numeric_finance",
  "launch_or_product",
  "qualitative_corporate_fact",
  "market_or_industry_trend",
  "expectation_or_projection",
  "descriptive_fact",
  "other_fact",
]);

/**
 * A6.40 §4: Deterministic claim typing. Log QC_V2_CLAIM_TYPE.
 */
export function detectClaimType(claimText, log = () => {}) {
  const t = (claimText || "").toLowerCase();
  let claimType = "other_fact";
  if (/\$[\d,.]+\s*(?:million|billion|mm|m|bn|b|k)?|\d+(?:\.\d+)?\s*%\s*(?:stake|ownership)|series\s+[a-d]|funding\s+round|raised\s+\$|valuation|pre-money|post-money/i.test(t)) {
    claimType = "numeric_finance";
  } else if (/\blaunch(?:ed)?\b|\brelease(?:d)?\b|\bintroduce(?:d)?\b|\bannounce(?:d)?\b|\broll(?:ed)?\s+out\b/i.test(t)) {
    claimType = "launch_or_product";
  } else if (/\bfounded\b|\bbased\s+in\b|\bheadquartered\b|\bacquired\b|\bmerged\b|\bestablished\b/i.test(t)) {
    claimType = "qualitative_corporate_fact";
  } else if (/\bmarket\s+demand\b|\bindustry\s+commentary\b|\bshift(?:ing)?\s+toward\b|\bdemand\s+is\s+shift|integrated\s+payments\s+platform/i.test(t)) {
    claimType = "market_or_industry_trend";
  } else if (/\bexpects?\b|\banticipates?\b|\bforecast\b|\bguidance\b|\bwill\s+materially\b|\bthis\s+year\b/i.test(t)) {
    claimType = "expectation_or_projection";
  } else if (/\bis\b|\bare\b|\bwas\b|\bwere\b|\bhas\b|\bhave\b|\benables?\b|\bprovides?\b|\bsupports?\b|\boffers?\b/i.test(t)) {
    claimType = "descriptive_fact";
  }
  log("QC_V2_CLAIM_TYPE", JSON.stringify({ claimPreview: (claimText || "").substring(0, 80), claimType }));
  return claimType;
}

/**
 * A6.40 §5: Component derivation (pattern-based). Entity, relation, object, amount, location, timeframe, target, etc.
 */
export function deriveComponents(claimText) {
  const t = (claimText || "").trim();
  const lower = t.toLowerCase();
  const components = {
    entity: null,
    relation: null,
    object: null,
    amount: null,
    location: null,
    timeframe: null,
    target: null,
    certainty: null,
  };
  const entityMatch = t.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
  if (entityMatch) components.entity = entityMatch[1];
  const relationPhrases = [
    "founded in", "founded", "based in", "headquartered", "launched", "launch", "announced", "acquired",
    "raised", "released", "introduced", "expects", "anticipates", "forecast",
    "enables", "enable", "enabled",
    "provides", "provide", "provided",
    "supports", "support", "supported",
    "offers", "offer", "offered",
    "allows", "allow", "allowed",
    "serves", "serve", "served",
    "sells", "sell",
    "targets", "target", "targeted",
    "generates", "generate",
    "is", "are", "was", "were",
    "has", "have", "had",
  ];
  for (const r of relationPhrases) {
    if (lower.includes(r)) { components.relation = r; break; }
  }
  const amountMatch = t.match(/\$[\d,.]+\s*(?:million|billion|mm|m|bn|b|k)?|\d+(?:\.\d+)?\s*%/i);
  if (amountMatch) components.amount = amountMatch[0];
  const locationMatch = t.match(/\b(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (locationMatch) components.location = locationMatch[1];
  if (/this\s+year|\d{4}/i.test(t)) components.timeframe = t.match(/this\s+year|\d{4}/i)?.[0] ?? null;
  if (/for\s+large\s+merchants|targeted\s+at|large\s+merchants/i.test(t)) components.target = "large merchants";
  if (/expects?|anticipates?|will\s+materially/i.test(t)) components.certainty = "expectation";
  return components;
}
/** A6.43: keyValue from claim components (numeric/key value). */
function getKeyValue(components, claimType) {
  if (claimType === "numeric_finance" && components?.amount) return components.amount;
  return null;
}

/**
 * A6.43 §1: Deterministic excerpt score. +3 entity, +3 relation, +4 key value, +2 modifier, +1 contextual, -3 if no entity.
 */
/** A6.49j: Broad numeric surface for excerpt survival (digits, currency, million/m, etc.). */
function isNumericCue(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  const t = text.toLowerCase();
  if (/\d/.test(t)) return true;
  if (/[$€£¥₹]/.test(text)) return true;
  /** Word-based amounts: number word + optional "hundred" + magnitude (not bare "million", etc.). */
  const wordNumericPhrase =
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hundred\s+)?(thousand|million|billion)\b/i;
  if (wordNumericPhrase.test(t)) return true;
  if (/\d+(?:\.\d+)?\s*%/.test(t)) return true;
  if (/\$[\d,.]+\s*(?:million|billion|m|bn)?/.test(text)) return true;
  return false;
}

function scoreExcerpt(components, excerpt, evResult, claimType) {
  const ex = (excerpt || "").trim().toLowerCase();
  if (!ex) return -10;
  let score = 0;
  const entity = components?.entity;
  const hasEntity = entity && ex.includes((entity || "").toLowerCase());
  if (hasEntity) score += 3;
  else score -= 3;
  const relation = components?.relation;
  if (relation && ex.includes((relation || "").toLowerCase())) score += 3;
  const keyValue = getKeyValue(components, claimType);
  if (keyValue && (ex.includes(keyValue.toLowerCase()) || ex.replace(/,/g, "").includes((keyValue || "").replace(/,/g, "").toLowerCase()))) score += 4;
  const hasModifier = components?.target || components?.amount || components?.location;
  if (hasModifier && (components?.target && ex.includes("large") || components?.location && ex.includes((components.location || "").toLowerCase()) || components?.amount && ex.includes((components.amount || "").replace(/,/g, "")))) score += 2;
  if (ex.length >= 40 && (hasEntity || relation)) score += 1;
  return score;
}

/**
 * A6.43 §3: Minimum excerpt quality gate. Display only if at least one: entity+relation, entity+keyValue, conflicting keyValue, explains missing modifier.
 * A6.49f / A6.49g: Narrow additive path for numeric_finance when upstream numeric evidence is present (corpus number hit / binding tuple) and excerpt has a numeric cue (not title-only synthetic). Does not require confirmedComponents.amount.
 * A6.49j: numeric_mismatch_excerpt — quantity_mismatch-structured + related|partial + strict upstreamNumericEvidence + isNumericCue (display survival only).
 */
function passesExcerptQualityGate(ev, components, claimType, refsById = new Map(), gateLog = null, supportMismatch = null) {
  const diagVerbose = typeof process !== "undefined" && process.env?.BRIGHTLINE_DIAG_VERBOSE === "1";
  const logGate = (payload) => {
    if (!diagVerbose || !gateLog?.log) return;
    gateLog.log("QC_V2_EXCERPT_QUALITY_GATE", JSON.stringify({
      claimId: gateLog.claimId ?? null,
      refId: ev.candidate?.refId ?? null,
      ...payload,
    }));
  };
  const logNumericMismatchDiag = (pass, failReason = null) => {
    if (!diagVerbose || !gateLog?.log) return;
    const payload = {
      claimId: gateLog.claimId ?? null,
      refId: ev.candidate?.refId ?? null,
      branch: "numeric_mismatch_excerpt",
      pass,
    };
    if (!pass && failReason) payload.failReason = failReason;
    gateLog.log("QC_V2_EXCERPT_QUALITY_GATE", JSON.stringify(payload));
  };
  const cc = ev.confirmedComponents ?? [];
  const miss = ev.missingComponents ?? [];
  const conflict = ev.conflictingComponents ?? [];
  const hasEntity = cc.includes("entity");
  const hasRelation = cc.includes("relation");
  const hasKeyValue = cc.includes("amount");
  if (hasEntity && hasRelation) {
    logGate({ outcome: "pass", branch: "entity_relation" });
    return true;
  }
  const keyVal = getKeyValue(components, claimType);
  if (keyVal && hasEntity && hasKeyValue) {
    logGate({ outcome: "pass", branch: "entity_keyvalue" });
    return true;
  }
  if (conflict.length > 0) {
    const excerpt = (ev.candidate?.excerptText || "").trim();
    if (/\$[\d,.]+\s*(?:million|billion|m|bn)?|\d+(?:\.\d+)?\s*%/.test(excerpt)) {
      logGate({ outcome: "pass", branch: "conflict_numeric_cue" });
      return true;
    }
  }
  if (miss.length > 0 && (hasEntity || hasRelation)) {
    logGate({ outcome: "pass", branch: "modifier_miss_context" });
    return true;
  }

  if (claimType === "numeric_finance") {
    const excerpt = (ev.candidate?.excerptText || "").trim();
    if (!excerpt) {
      logGate({ outcome: "fail", branch: "numeric_evidence", reason: "empty_excerpt" });
      return false;
    }
    if (ev.rejected) {
      logGate({ outcome: "fail", branch: "numeric_evidence", reason: "rejected_credibility" });
      return false;
    }
    if (ev.classification === "none") {
      logGate({ outcome: "fail", branch: "numeric_evidence", reason: "classification_none" });
      return false;
    }
    if (isTitleOnlySyntheticExcerpt(ev.candidate, refsById)) {
      logGate({ outcome: "fail", branch: "numeric_evidence", reason: "title_only_synthetic" });
      return false;
    }
    if (isQuantityMismatchStructured(supportMismatch)) {
      let failReason = null;
      let pass = false;
      if (!excerpt || excerpt.length === 0) failReason = "empty_excerpt";
      else if (isTitleOnlySyntheticExcerpt(ev.candidate, refsById)) failReason = "title_only_synthetic";
      else if (ev.rejected) failReason = "rejected_credibility";
      else if (ev.classification === "none") failReason = "classification_none";
      else if (ev.classification !== "related" && ev.classification !== "partial") failReason = "classification_not_related_or_partial";
      else if (!isNumericCue(excerpt)) failReason = "no_numeric_cue";
      else if (ev.candidate?.upstreamNumericEvidence !== true) failReason = "upstream_numeric_evidence_not_true";
      else pass = true;
      logNumericMismatchDiag(pass, failReason);
      if (pass) {
        logGate({ outcome: "pass", branch: "numeric_mismatch_excerpt" });
        return true;
      }
    }
    const numericCue = /\$[\d,.]+\s*(?:million|billion|m|bn)?|\d+(?:\.\d+)?\s*%/.test(excerpt);
    /** Upstream: corpus numeric hit / binding tuple (see getCandidatesForClaim). Eval fallbacks: amount line still populated when matcher agrees. */
    const upstreamTruth =
      ev.candidate?.upstreamNumericEvidence === true
      || cc.includes("amount")
      || conflict.length > 0;
    const upstreamSource =
      ev.candidate?.upstreamNumericEvidence === true
        ? (ev.candidate?.upstreamNumericEvidenceSource || "upstream_unknown")
        : cc.includes("amount")
          ? "eval_confirmed_amount"
          : conflict.length > 0
            ? "eval_conflict_amount"
            : null;
    if (upstreamTruth && numericCue) {
      logGate({
        outcome: "pass",
        branch: "numeric_evidence",
        upstreamSource,
      });
      return true;
    }
    logGate({
      outcome: "fail",
      branch: "numeric_evidence",
      reason: !upstreamTruth ? "no_upstream_numeric_truth" : "no_numeric_cue_in_excerpt",
      upstreamSource: upstreamSource ?? undefined,
    });
    return false;
  }
  return false;
}

/** A6.50j: Stop words aligned with A6.50f content-word extraction. */
const A6_50J_KEYWORD_STOP = new Set([
  "the", "this", "that", "these", "those", "with", "from", "their", "there", "about", "which",
  "would", "could", "should", "have", "been", "will", "also", "into", "onto", "over", "under",
  "through", "between", "within", "toward", "during", "after", "before", "around", "company",
  "portfolio",
]);

function extractA650jContentWords(claimText) {
  const raw = typeof claimText === "string" ? claimText : "";
  const lower = raw.toLowerCase();
  const tokens = lower.match(/\b[a-z]{5,}\b/g) || [];
  const acronymTokens = (raw.match(/\b[A-Z]{2,}\b/g) || []).map((w) => w.toLowerCase());
  return [...new Set([...tokens, ...acronymTokens])].filter((w) => !A6_50J_KEYWORD_STOP.has(w));
}

/** @param {string[]} words @param {string} excerpt */
function findA650jContentWordsInExcerpt(words, excerpt) {
  const ex = excerpt || "";
  const found = [];
  for (const w of words) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(ex)) found.push(w);
  }
  return found;
}

/** A6.56: Content words with length ≥ 8 (high-value anchors for excerpt recovery). */
function extractHighValueContentWords(claimText) {
  return extractA650jContentWords(claimText).filter((w) => w.length >= 8);
}

/** A6.56: High-value claim words not present in excerpt (whole-word, case-insensitive). */
function highValueWordsMissingFromExcerpt(claimText, excerpt) {
  const hv = extractHighValueContentWords(claimText);
  if (hv.length === 0) return [];
  const found = findA650jContentWordsInExcerpt(hv, excerpt);
  const foundSet = new Set(found);
  return hv.filter((w) => !foundSet.has(w));
}

/**
 * A6.59: Extract sentence neighborhood around best confirming sentence.
 * @returns {string|null}
 */
function extractConfirmingSentence(excerpt, claimText) {
  const ex = typeof excerpt === "string" ? excerpt.trim() : "";
  if (!ex) return null;
  const parts = ex
    .split(/[.!?]\s+|\r\n|\n\n/)
    .map((s) => String(s || "").trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  const highValueWords = extractHighValueContentWords(claimText);
  if (highValueWords.length === 0) return null;
  let bestIdx = -1;
  let bestHighValueHitCount = 0;
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    if (s.length < 40) continue;
    const hvFound = findA650jContentWordsInExcerpt(highValueWords, s);
    const hvCount = hvFound.length;
    if (hvCount <= 0) continue;
    if (hvCount > bestHighValueHitCount) {
      bestHighValueHitCount = hvCount;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestHighValueHitCount <= 0) return null;
  const selectedSentence = parts[bestIdx];
  const from = Math.max(0, bestIdx - 1);
  const to = Math.min(parts.length - 1, bestIdx + 1);
  const joined = parts.slice(from, to + 1).join(" ").trim();
  console.log(`[A6.59] confirming sentence selected: wordsFound=${bestHighValueHitCount} sentence=${selectedSentence.slice(0, 120)}`);
  if (/^[a-z]/.test(joined)) {
    const cleanStart = joined.search(/[.!?]\s+[A-Z]/);
    if (cleanStart >= 0) {
      return joined.slice(cleanStart + 2).trim();
    }
  }
  return joined;
}

/**
 * A6.55b: First-match positions of claim content words in excerpt (whole-word, case-insensitive).
 * @returns {{ starts: number[], ends: number[], wordsFound: string[] }|null}
 */
function findContentWordMatchBoundsInExcerpt(claimText, excerpt) {
  const ex = typeof excerpt === "string" ? excerpt : "";
  if (!ex.trim()) return null;
  const words = extractA650jContentWords(claimText);
  const starts = [];
  const ends = [];
  const wordsFound = [];
  for (const w of words) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const m = ex.match(re);
    if (m && m.index != null) {
      starts.push(m.index);
      ends.push(m.index + m[0].length);
      wordsFound.push(w);
    }
  }
  if (starts.length < 2) return null;
  return { starts, ends, wordsFound };
}

/**
 * A6.53: Same excerpt shaping as corpus / analyse-statements (matchIndex = center, symmetric window).
 */
function extractExcerptForPassage(text, matchIndex, contextLength = 100) {
  if (typeof text !== "string" || matchIndex < 0) return "";
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(text.length, matchIndex + contextLength);
  return text.substring(start, end).trim();
}

/**
 * A6.53: Sliding-window passage finder — content words align with A6.50f/k (extractA650jContentWords).
 * Returns start index of the best 300-char window, or null.
 */
function findBestPassageForClaim(claimText, claimType, docFullText) {
  if (claimType === "numeric_finance") return null;
  if (typeof docFullText !== "string" || !docFullText.length) return null;
  const contentWords = extractA650jContentWords(claimText);
  if (contentWords.length < 2) return null;
  const highValueWords = extractHighValueContentWords(claimText);
  const len = docFullText.length;
  const winSize = 300;
  const step = 50;
  const wordWeights = new Map();
  for (const w of contentWords) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = docFullText.match(re);
    const occurrenceCount = matches ? matches.length : 0;
    if (occurrenceCount > 0) wordWeights.set(w, 1 / occurrenceCount);
  }
  const candidates = [];
  for (let start = 0; start < len; start += step) {
    const end = Math.min(start + winSize, len);
    const windowText = docFullText.slice(start, end);
    const foundWords = findA650jContentWordsInExcerpt(contentWords, windowText);
    const contentWordHitCount = foundWords.length;
    if (contentWordHitCount < 2) continue;
    let weightedScore = 0;
    for (const fw of foundWords) weightedScore += wordWeights.get(fw) ?? 0;
    const highValueHitCount = highValueWords.length > 0
      ? findA650jContentWordsInExcerpt(highValueWords, windowText).length
      : 0;
    candidates.push({ start, weightedScore, contentWordHitCount, highValueHitCount });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
    if (b.contentWordHitCount !== a.contentWordHitCount) return b.contentWordHitCount - a.contentWordHitCount;
    if (b.highValueHitCount !== a.highValueHitCount) return b.highValueHitCount - a.highValueHitCount;
    return a.start - b.start;
  });
  const best = candidates[0];
  if (!best || best.contentWordHitCount <= 0) return null;
  return best.start;
}
function isTitleOnlySyntheticExcerpt(candidate, refsById) {
  const ref = refsById.get(String(candidate?.refId ?? ""));
  const title = (ref?.title || "").trim();
  const ex = (candidate?.excerptText || "").trim();
  if (!title || !ex) return false;
  const slice300 = title.slice(0, Math.min(300, title.length));
  return ex === slice300 || ex === title;
}
function mismatchPartialEvaluationsOk(evaluations, refsById, components, claimType, gateLog = null, supportMismatch = null) {
  return evaluations.some((ev) => {
    if (ev.rejected) return false;
    const c = ev.candidate;
    if (!c?.excerptText?.trim()) return false;
    if (isTitleOnlySyntheticExcerpt(c, refsById)) return false;
    if (!passesExcerptQualityGate(ev, components, claimType, refsById, gateLog, supportMismatch)) return false;
    if (ev.classification === "none") return false;
    return ev.classification === "related" || ev.classification === "partial";
  });
}

export {
  getKeyValue,
  isNumericCue,
  scoreExcerpt,
  passesExcerptQualityGate,
  extractA650jContentWords,
  findA650jContentWordsInExcerpt,
  extractHighValueContentWords,
  highValueWordsMissingFromExcerpt,
  extractConfirmingSentence,
  findContentWordMatchBoundsInExcerpt,
  extractExcerptForPassage,
  findBestPassageForClaim,
  isTitleOnlySyntheticExcerpt,
  mismatchPartialEvaluationsOk,
};
