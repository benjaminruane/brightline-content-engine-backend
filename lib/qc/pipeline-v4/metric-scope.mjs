// Shared sentence-scoped metric resolution for money and percent figures.
// Truncation is impossible by construction: do not reintroduce a character
// window. A window can assign a wrong id from a truncated phrase.

import { splitDraftIntoCandidatesV2 } from "../../extract-statements.mjs";

export function sortPhrasesLongestFirst(phrases) {
  const rows = Array.isArray(phrases) ? phrases : [];
  return rows.slice().sort((a, b) => {
    const d = String(b[0] || "").length - String(a[0] || "").length;
    return d !== 0 ? d : String(a[0] || "").localeCompare(String(b[0] || ""));
  });
}

function findCandidateSpan(haystack, needle, from) {
  const exact = haystack.indexOf(needle, from);
  if (exact !== -1) return { start: exact, end: exact + needle.length };
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const m = haystack.slice(from).match(new RegExp(escaped));
  if (!m || m.index == null) return null;
  return { start: from + m.index, end: from + m.index + m[0].length };
}

/**
 * Sentence containing a figure, using the Stage 1 fallback splitter.
 * If no boundary is found, the whole passage (Stage 2 cap 400 chars).
 */
export function sentenceContainingFigure(text, figIndex) {
  const t = typeof text === "string" ? text : "";
  if (!t) return { text: t, start: 0 };
  const { candidates } = splitDraftIntoCandidatesV2(t, {
    maxLen: Math.max(t.length, 400),
    minLen: 1,
    maxCandidates: 200,
  });
  if (!candidates.length) return { text: t, start: 0 };
  let from = 0;
  for (const c of candidates) {
    const span = findCandidateSpan(t, c, from);
    if (!span) continue;
    if (figIndex >= span.start && figIndex < span.end) {
      return { text: t.slice(span.start, span.end), start: span.start };
    }
    from = span.end;
  }
  return { text: t, start: 0 };
}

function intervalDistance(a0, a1, b0, b1) {
  if (a1 <= b0) return b0 - a1;
  if (b1 <= a0) return a0 - b1;
  return 0;
}

function metricHits(sentence, phrasesLongestFirst) {
  const s = typeof sentence === "string" ? sentence : "";
  const hits = [];
  const phrases = Array.isArray(phrasesLongestFirst) ? phrasesLongestFirst : [];
  for (const [phrase, id] of phrases) {
    const escaped = String(phrase || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    if (!escaped) continue;
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    let m;
    while ((m = re.exec(s))) {
      const start = m.index;
      const end = start + m[0].length;
      if (hits.some((h) => start >= h.start && end <= h.end)) continue;
      hits.push({ start, end, id });
    }
  }
  return hits;
}

/**
 * Nearest longest-first phrase in the sentence, by character distance to the figure.
 * On a tie, prefer a phrase that sits before the figure (metric-then-number).
 */
export function resolveNearestMetric(sentence, figLocalStart, figLen, phrasesLongestFirst) {
  const hits = metricHits(sentence, phrasesLongestFirst);
  if (!hits.length) return undefined;
  const figEnd = figLocalStart + figLen;
  let best = null;
  let bestDist = Infinity;
  for (const h of hits) {
    const dist = intervalDistance(figLocalStart, figEnd, h.start, h.end);
    if (dist < bestDist) {
      bestDist = dist;
      best = h;
      continue;
    }
    if (dist > bestDist || !best) continue;
    const hLeft = h.end <= figLocalStart;
    const bLeft = best.end <= figLocalStart;
    if (hLeft && !bLeft) best = h;
  }
  return best?.id;
}
