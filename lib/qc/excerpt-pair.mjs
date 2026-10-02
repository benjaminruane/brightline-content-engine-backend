/**
 * B360 / B362. A card may show two source passages. Ceiling is two: the
 * existing primary and conflict slots. The second slot is filled from a
 * stored span the primary did not show. An empty conflict slot stays empty
 * and is stamped with a reason; it is never a copy of primary.
 */
import { statementNeedles, trimExcerptToSentences } from "./excerpt-sentences.mjs";
import { sourceTextAt } from "./excerpt-locate.mjs";

export const MAX_SHOWN_PASSAGES = 2;
export const NO_DISTINCT_PASSAGE = "no_distinct_passage";

function asText(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeExcerptText(value) {
  const raw = typeof value === "string" ? value : typeof value?.passage === "string" ? value.passage : "";
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

export function excerptsAreSame(a, b) {
  const na = normalizeExcerptText(a);
  const nb = normalizeExcerptText(b);
  return na.length > 0 && na === nb;
}

export function isDistinctExcerpt(a, b) {
  const na = normalizeExcerptText(a);
  const nb = normalizeExcerptText(b);
  if (!na || !nb) return false;
  if (na === nb) return false;
  if (na.includes(nb) || nb.includes(na)) return false;
  return true;
}

function passageScore(passage, needles) {
  if (!needles.length) return 0;
  const hay = String(passage || "").toLowerCase();
  let n = 0;
  for (const needle of needles) {
    if (hay.includes(String(needle).toLowerCase())) n += 1;
  }
  return n;
}

export function claimTermsInPassage(passage, statement) {
  const needles = statementNeedles(statement);
  const hay = normalizeExcerptText(passage);
  const hit = [];
  for (const n of needles) {
    const k = String(n).toLowerCase();
    if (k.length < 2) continue;
    if (hay.includes(k)) hit.push(n);
  }
  return hit;
}

/**
 * True when the candidate holds a claim term the primary does not.
 * A second passage that only repeats terms already shown adds nothing.
 */
export function secondPassageAddsClaimTerms(primaryExcerpt, candidate, statement) {
  const needles = statementNeedles(statement);
  const pHay = normalizeExcerptText(primaryExcerpt);
  const cHay = normalizeExcerptText(candidate);
  if (!cHay) return false;
  for (const n of needles) {
    const k = String(n).toLowerCase();
    if (k.length < 2) continue;
    if (cHay.includes(k) && !pHay.includes(k)) return true;
  }
  return false;
}

function keepSecondPassage({ primaryExcerpt, candidate, statement, conflictFace } = {}) {
  if (!isDistinctExcerpt(primaryExcerpt, candidate)) return false;
  if (claimTermsInPassage(candidate, statement).length === 0) return false;
  if (conflictFace === true) return true;
  return secondPassageAddsClaimTerms(primaryExcerpt, candidate, statement);
}

function labelForSpan(span, matches, sources) {
  const sourceIndex = Number.isFinite(Number(span?.sourceRefId))
    ? Number(span.sourceRefId)
    : Number(span?.sourceIndex);
  const match = (Array.isArray(matches) ? matches : []).find((m) => Number(m?.sourceIndex) === sourceIndex);
  const src = Number.isFinite(sourceIndex) && Array.isArray(sources) ? sources[sourceIndex] : null;
  return (
    (typeof match?.sourceLabel === "string" && match.sourceLabel.trim()) ||
    (typeof src?.label === "string" && src.label.trim()) ||
    (typeof span?.sourceLabel === "string" && span.sourceLabel.trim()) ||
    (Number.isFinite(sourceIndex) ? `Source ${sourceIndex + 1}` : "")
  );
}

function spanToExcerpt(span, sources, statement, matches) {
  if (!span || typeof span !== "object") return null;
  const srcIdx = Number.isFinite(Number(span.sourceRefId))
    ? Number(span.sourceRefId)
    : Number(span.sourceIndex);
  const src = sourceTextAt(sources, srcIdx);
  const start = Number(span.start);
  const end = Number(span.end);
  let full = "";
  if (src && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= src.length) {
    full = src.slice(start, end);
  } else {
    full = asText(span.passage);
  }
  const trimmed = trimExcerptToSentences(full, statement);
  if (!trimmed) return null;
  const sourceLabel = labelForSpan(span, matches, sources);
  if (!sourceLabel) return null;
  return { passage: trimmed, sourceLabel, fullPassage: full };
}

/**
 * @returns {{ passage: string, sourceLabel: string } | null}
 */
export function pickSecondExcerpt({
  primaryExcerpt,
  supportSpans,
  sources,
  statement,
  conflictFace,
  matches,
} = {}) {
  const primary = asText(primaryExcerpt?.passage).trim();
  if (!primary) return null;
  const needles = statementNeedles(statement);
  const candidates = [];
  for (const span of Array.isArray(supportSpans) ? supportSpans : []) {
    const excerpt = spanToExcerpt(span, sources, statement, matches);
    if (!excerpt?.passage) continue;
    if (!isDistinctExcerpt(excerpt, primaryExcerpt)) continue;
    const cls = typeof span?.classification === "string" ? span.classification.trim() : "";
    const conflicting = cls === "conflicting";
    if (
      !keepSecondPassage({
        primaryExcerpt,
        candidate: excerpt,
        statement,
        conflictFace,
      })
    ) {
      continue;
    }
    candidates.push({
      excerpt,
      score: passageScore(excerpt.passage, needles),
      conflicting,
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (conflictFace) {
      if (b.conflicting !== a.conflicting) return a.conflicting ? -1 : 1;
    }
    if (b.score !== a.score) return b.score - a.score;
    return asText(b.excerpt.passage).length - asText(a.excerpt.passage).length;
  });
  return {
    passage: candidates[0].excerpt.passage,
    sourceLabel: candidates[0].excerpt.sourceLabel,
  };
}

/**
 * Keep a distinct second passage if Stage 4 already found one. Otherwise
 * pick from stored spans. Never copy primary into the second slot.
 */
export function fillSecondExcerpt({
  primaryExcerpt,
  conflictExcerpt,
  supportSpans,
  sources,
  statement,
  conflictFace,
  matches,
} = {}) {
  if (conflictExcerpt?.passage && isDistinctExcerpt(primaryExcerpt, conflictExcerpt)) {
    const keep = keepSecondPassage({
      primaryExcerpt,
      candidate: conflictExcerpt,
      statement,
      conflictFace,
    });
    if (keep) {
      const trimmed = trimExcerptToSentences(conflictExcerpt.passage, statement);
      if (trimmed) return { ...conflictExcerpt, passage: trimmed };
      return conflictExcerpt;
    }
  }
  return pickSecondExcerpt({
    primaryExcerpt,
    supportSpans,
    sources,
    statement,
    conflictFace,
    matches,
  });
}

/**
 * Empty conflict slot stays empty. On a conflict face with no distinct
 * second passage, stamp why. Confirmed or partial cards with one passage
 * leave the reason null: nothing is missing.
 */
export function finalizeConflictSlot({ conflictFace, primaryExcerpt, conflictExcerpt } = {}) {
  const primary = asText(primaryExcerpt?.passage ?? primaryExcerpt);
  if (conflictExcerpt?.passage && isDistinctExcerpt(primary, conflictExcerpt)) {
    return { conflictExcerpt, conflictExcerptEmptyReason: null };
  }
  return {
    conflictExcerpt: null,
    conflictExcerptEmptyReason: conflictFace === true && primary.trim() ? NO_DISTINCT_PASSAGE : null,
  };
}
