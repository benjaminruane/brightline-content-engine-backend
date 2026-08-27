/**
 * Deterministic whole-sentence removal for aggregated no_support
 * (evidence.kind === "unsupported"). Diag-gated; not production default.
 *
 * Runs after house-style / cut-punctuation, before marker honesty.
 */

import { sentenceBoundsContaining } from "./pr9-marker-honesty.mjs";

export const DETERMINISTIC_UNSUPPORTED_REMOVAL_CUT_NOTE =
  "Removed this sentence - no supplied source backs that claim.";

export const DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE =
  "No supplied source supports this. It has been kept only because removing it would leave the draft empty.";

const NOTE_CLOSER = "Confirm before publishing.";

function finalizeRemovalNote(body) {
  const trimmed = String(body || "").trim();
  if (!trimmed) return NOTE_CLOSER;
  const withPunct = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  if (withPunct.endsWith(NOTE_CLOSER)) return withPunct;
  return `${withPunct} ${NOTE_CLOSER}`;
}
/**
 * @param {string} text
 * @returns {string}
 */
export function collapseWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find statementText in draft: exact first, then whitespace-normalised.
 * @param {string} draft
 * @param {string} statementText
 * @returns {{ start: number, end: number } | null}
 */
export function findStatementTextInDraft(draft, statementText) {
  const needle = typeof statementText === "string" ? statementText : "";
  const source = typeof draft === "string" ? draft : "";
  if (!needle.trim() || !source) return null;

  const exact = source.indexOf(needle);
  if (exact >= 0) return { start: exact, end: exact + needle.length };

  const needleNorm = collapseWhitespace(needle);
  if (!needleNorm) return null;

  // Walk draft with a collapsing scanner: map norm index -> original span.
  let norm = "";
  /** @type {number[]} */
  const normToOrigStart = [];
  /** @type {number[]} */
  const normToOrigEnd = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      const wsStart = i;
      while (i < source.length && /\s/.test(source[i])) i += 1;
      if (norm.length > 0 && norm[norm.length - 1] !== " ") {
        normToOrigStart.push(wsStart);
        norm += " ";
        normToOrigEnd.push(i);
      }
      continue;
    }
    normToOrigStart.push(i);
    norm += source[i];
    normToOrigEnd.push(i + 1);
    i += 1;
  }
  const at = norm.indexOf(needleNorm);
  if (at < 0) return null;
  const start = normToOrigStart[at];
  const end = normToOrigEnd[at + needleNorm.length - 1];
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

/**
 * True when the match is the full sentence (not a phrase with leftovers).
 * @param {string} draft
 * @param {{ start: number, end: number }} match
 * @returns {boolean}
 */
export function matchIsWholeSentence(draft, match) {
  const bounds = sentenceBoundsContaining(draft, match.start, match.end);
  const left = draft.slice(bounds.start, match.start).trim();
  const right = draft
    .slice(match.end, bounds.end)
    .replace(/[.!?]+$/g, "")
    .trim();
  return left.length === 0 && right.length === 0;
}

/**
 * Expand match to include trailing sentence punct and following separator
 * (blank line preferred, else single newline, else nothing).
 * @param {string} draft
 * @param {{ start: number, end: number }} match
 * @returns {{ start: number, end: number, sentenceEnd: number }}
 */
export function deletionRangeForSentence(draft, match) {
  let end = match.end;
  while (end < draft.length && /[.!?]/.test(draft[end])) end += 1;
  const sentenceEnd = end;
  if (draft[end] === "\r") end += 1;
  if (draft[end] === "\n") {
    end += 1;
    if (draft[end] === "\r") end += 1;
    if (draft[end] === "\n") end += 1;
  } else if (draft[end] === " ") {
    // single trailing space only when not paragraph-separated
    end += 1;
  }
  let start = match.start;
  // If previous chars are blank-line padding exclusive to this block, leave them;
  // do not eat the prior sentence's trailing newline beyond one separator already
  // handled on the prior deletion.
  return { start, end, sentenceEnd };
}

function stripMarkersForEmptyCheck(text) {
  return String(text || "").replace(/\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g, "$1");
}

/**
 * @param {string} draft
 * @param {number} from
 * @param {number} to
 * @returns {Array<{ start: number, end: number }>}
 */
function markersOverlappingRange(markers, from, to) {
  return (markers || []).filter((m) => m.end > from && m.start < to);
}

/**
 * Last word remnant inside [sentStart, sentEnd).
 * @returns {{ start: number, end: number } | null}
 */
function lastWordRemnant(draft, sentStart, sentEnd) {
  const words = wordsInSentence(draft, sentStart, sentEnd);
  if (words.length === 0) return null;
  return words[words.length - 1];
}

/**
 * @returns {Array<{ start: number, end: number }>}
 */
function wordsInSentence(draft, sentStart, sentEnd) {
  const body = draft.slice(sentStart, sentEnd);
  const re = /\S+/g;
  /** @type {Array<{ start: number, end: number }>} */
  const words = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    let start = sentStart + m.index;
    let end = start + m[0].length;
    // Prefer wrapping the word without trailing sentence punct glued on.
    while (end > start && /[.!?]/.test(draft[end - 1])) end -= 1;
    if (end > start) words.push({ start, end });
  }
  return words;
}

/**
 * Prefer the last free word; else any free word from the end.
 * @returns {{ start: number, end: number } | null}
 */
function freeRemnantInSentence(draft, markers, sentStart, sentEnd) {
  const words = wordsInSentence(draft, sentStart, sentEnd);
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (markersOverlappingRange(markers, w.start, w.end).length === 0) return w;
  }
  return null;
}

/**
 * When one marker covers the whole neighbour sentence, shrink it to leave the
 * last word free for a CUT remnant. Returns the carved remnant or null.
 * @returns {{ start: number, end: number } | null}
 */
function carveLastWordFromCoveringMarker(draft, markers, sentStart, sentEnd) {
  const words = wordsInSentence(draft, sentStart, sentEnd);
  if (words.length < 2) return null;
  const last = words[words.length - 1];
  const covering = markers.filter((m) => m.start <= last.start && m.end >= last.end);
  if (covering.length !== 1) return null;
  const marker = covering[0];
  // Only carve when the marker covers most of the sentence (whole-sentence wrap).
  const sentLen = sentEnd - sentStart;
  const markLen = marker.end - marker.start;
  if (markLen < sentLen * 0.5) return null;
  let newEnd = last.start;
  while (newEnd > marker.start && /\s/.test(draft[newEnd - 1])) newEnd -= 1;
  if (newEnd <= marker.start) return null;
  marker.end = newEnd;
  return last;
}

/**
 * @param {string} draft
 * @param {number} exclusiveEnd  position just before the sentence being deleted
 * @returns {{ start: number, end: number } | null}
 */
function previousSentenceBounds(draft, exclusiveEnd) {
  let i = exclusiveEnd;
  while (i > 0 && /\s/.test(draft[i - 1])) i -= 1;
  if (i <= 0) return null;
  const bounds = sentenceBoundsContaining(draft, Math.max(0, i - 1), i);
  if (bounds.end <= bounds.start) return null;
  return bounds;
}

/**
 * @param {string} draft
 * @param {number} afterStart
 * @returns {{ start: number, end: number } | null}
 */
function nextSentenceBounds(draft, afterStart) {
  let i = afterStart;
  while (i < draft.length && /\s/.test(draft[i])) i += 1;
  if (i >= draft.length) return null;
  const bounds = sentenceBoundsContaining(draft, i, Math.min(draft.length, i + 1));
  if (bounds.end <= bounds.start) return null;
  return bounds;
}

/**
 * @param {string} draft
 * @param {number} exclusiveEnd  position just before the sentence being deleted
 * @param {Array<object>} markers
 * @returns {{ start: number, end: number } | null} previous sentence remnant
 */
function previousSentenceRemnant(draft, exclusiveEnd, markers) {
  const bounds = previousSentenceBounds(draft, exclusiveEnd);
  if (!bounds) return null;
  return freeRemnantInSentence(draft, markers, bounds.start, bounds.end);
}

/**
 * @param {string} draft
 * @param {number} afterStart  position just after the deleted sentence range
 * @param {Array<object>} markers
 */
function nextSentenceRemnant(draft, afterStart, markers) {
  const bounds = nextSentenceBounds(draft, afterStart);
  if (!bounds) return null;
  return freeRemnantInSentence(draft, markers, bounds.start, bounds.end);
}

function hasConfirmedRemnant(concern) {
  const claims = Array.isArray(concern?.claims) ? concern.claims : [];
  return claims.some((c) => c && c.role === "confirmed_preserve");
}

function copyMarker(m, extra = {}) {
  return {
    start: m.start,
    end: m.end,
    note: typeof m.note === "string" ? m.note : "",
    ...(m.intent ? { intent: m.intent } : {}),
    ...extra,
  };
}

/**
 * Remap markers after deleting [delStart, delEnd). Drops markers that overlap
 * the deleted range. Same shift arithmetic style as
 * ensureMarkerSentenceTerminalPunctuation (build-revision-prompt L868-894).
 *
 * @param {Array<object>} markers
 * @param {number} delStart
 * @param {number} delEnd
 * @returns {Array<object>}
 */
export function remapMarkersAfterDeletion(markers, delStart, delEnd) {
  const delta = delEnd - delStart;
  if (delta <= 0) return (markers || []).map((m) => copyMarker(m));
  const out = [];
  for (const m of markers || []) {
    if (m.end > delStart && m.start < delEnd) continue; // overlaps deleted span
    const next = copyMarker(m);
    if (next.start >= delEnd) {
      next.start -= delta;
      next.end -= delta;
    } else if (next.end > delStart) {
      next.end = Math.max(next.start, next.end - delta);
    }
    out.push(next);
  }
  return out;
}

/**
 * @param {{ revisedDraft: string, markers: Array<object> }} parsed
 * @param {Array<object>} concerns
 * @param {{ enabled?: boolean }} [opts]
 * @returns {{
 *   revisedDraft: string,
 *   markers: Array<object>,
 *   removalEvents: Array<object>,
 * }}
 */
export function applyDeterministicUnsupportedRemoval(parsed, concerns, opts = {}) {
  const enabled = opts.enabled === true;
  let draft = typeof parsed?.revisedDraft === "string" ? parsed.revisedDraft : "";
  let markers = Array.isArray(parsed?.markers) ? parsed.markers.map((m) => copyMarker(m)) : [];
  /** @type {Array<object>} */
  const removalEvents = [];

  if (!enabled) {
    return { revisedDraft: draft, markers, removalEvents };
  }

  const list = Array.isArray(concerns) ? concerns : [];
  /** @type {Array<{ concern: object, match: { start: number, end: number } }>} */
  const planned = [];

  for (const concern of list) {
    if (concern?.evidence?.kind !== "unsupported") {
      continue;
    }
    // Never act on non-unsupported evidence kinds (partial/conflict handled elsewhere).
    if (hasConfirmedRemnant(concern)) {
      removalEvents.push({
        action: "skipped",
        reason: "confirmed_remnant",
        statementIndex: concern.statementIndex,
        statementText: concern.statementText,
      });
      continue;
    }

    const match = findStatementTextInDraft(draft, concern.statementText);
    if (!match) {
      removalEvents.push({
        action: "skipped",
        reason: "statement_text_no_match",
        statementIndex: concern.statementIndex,
        statementText: concern.statementText,
      });
      continue;
    }
    if (!matchIsWholeSentence(draft, match)) {
      removalEvents.push({
        action: "skipped",
        reason: "not_whole_sentence",
        statementIndex: concern.statementIndex,
        statementText: concern.statementText,
      });
      continue;
    }
    planned.push({ concern, match });
  }

  // Delete from the end so earlier offsets stay valid.
  planned.sort((a, b) => b.match.start - a.match.start);

  for (const { concern, match } of planned) {
    // Re-resolve in current draft (should still match for non-overlapping sentences).
    const live = findStatementTextInDraft(draft, concern.statementText);
    if (!live || !matchIsWholeSentence(draft, live)) {
      removalEvents.push({
        action: "skipped",
        reason: "statement_text_no_match",
        statementIndex: concern.statementIndex,
        statementText: concern.statementText,
      });
      continue;
    }

    const range = deletionRangeForSentence(draft, live);
    const plannedDraft = draft.slice(0, range.start) + draft.slice(range.end);
    if (!stripMarkersForEmptyCheck(plannedDraft).trim()) {
      // Empty-draft guard: keep sentence, KEPT, loud note.
      const note = finalizeRemovalNote(DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE);
      const wrapStart = live.start;
      const wrapEnd = range.sentenceEnd > live.start ? range.sentenceEnd : live.end;
      // Drop overlapping markers on this sentence, then add KEPT.
      markers = markers.filter((m) => !(m.end > wrapStart && m.start < wrapEnd));
      markers.push({
        start: wrapStart,
        end: Math.min(wrapEnd, draft.length),
        note,
        intent: "KEPT",
      });
      markers.sort((a, b) => a.start - b.start || a.end - b.end);
      removalEvents.push({
        action: "empty_draft_kept",
        statementIndex: concern.statementIndex,
        statementText: concern.statementText,
        note,
      });
      continue;
    }

    const prevBounds = previousSentenceBounds(draft, range.start);
    const nextBounds = nextSentenceBounds(draft, range.end);
    let prev = prevBounds
      ? freeRemnantInSentence(draft, markers, prevBounds.start, prevBounds.end)
      : null;
    let next = nextBounds
      ? freeRemnantInSentence(draft, markers, nextBounds.start, nextBounds.end)
      : null;

    let remnant = null;
    let remnantSide = null;
    if (prev) {
      remnant = prev;
      remnantSide = "previous";
    } else if (next) {
      remnant = next;
      remnantSide = "next";
    } else {
      // Neighbour sentence exists but every word is covered (common when the
      // model wraps a whole neighbour sentence). Carve the last word out of a
      // single covering marker so CUT has a free remnant.
      const carvedPrev = prevBounds
        ? carveLastWordFromCoveringMarker(draft, markers, prevBounds.start, prevBounds.end)
        : null;
      const carvedNext = !carvedPrev && nextBounds
        ? carveLastWordFromCoveringMarker(draft, markers, nextBounds.start, nextBounds.end)
        : null;
      if (carvedPrev) {
        remnant = carvedPrev;
        remnantSide = "previous";
      } else if (carvedNext) {
        remnant = carvedNext;
        remnantSide = "next";
      } else if (prevBounds || nextBounds) {
        removalEvents.push({
          action: "skipped",
          reason: "both_neighbours_marked",
          statementIndex: concern.statementIndex,
          statementText: concern.statementText,
        });
        continue;
      } else {
        removalEvents.push({
          action: "skipped",
          reason: "no_neighbour_remnant",
          statementIndex: concern.statementIndex,
          statementText: concern.statementText,
        });
        continue;
      }
    }

    // Capture remnant text before deletion; remap its offsets after.
    const remnantText = draft.slice(remnant.start, remnant.end);
    const remnantBeforeDeletion = remnant.start < range.start;

    markers = remapMarkersAfterDeletion(markers, range.start, range.end);
    draft = draft.slice(0, range.start) + draft.slice(range.end);

    let remStart;
    let remEnd;
    if (remnantBeforeDeletion) {
      remStart = remnant.start;
      remEnd = remnant.end;
    } else {
      const delta = range.end - range.start;
      remStart = remnant.start - delta;
      remEnd = remnant.end - delta;
    }

    // Verify remnant text still sits at remapped offsets.
    if (draft.slice(remStart, remEnd) !== remnantText) {
      const found = draft.indexOf(remnantText);
      if (found < 0) {
        removalEvents.push({
          action: "skipped",
          reason: "remnant_lost_after_delete",
          statementIndex: concern.statementIndex,
          statementText: concern.statementText,
        });
        // Cannot safely continue with a broken draft state; this should not happen.
        continue;
      }
      remStart = found;
      remEnd = found + remnantText.length;
    }

    const note = finalizeRemovalNote(DETERMINISTIC_UNSUPPORTED_REMOVAL_CUT_NOTE);
    markers.push({
      start: remStart,
      end: remEnd,
      note,
      intent: "CUT",
    });
    markers.sort((a, b) => a.start - b.start || a.end - b.end);

    removalEvents.push({
      action: "removed",
      statementIndex: concern.statementIndex,
      statementText: concern.statementText,
      remnantSide,
      remnantText,
      note,
      marker: { start: remStart, end: remEnd, intent: "CUT", note },
    });
  }

  return { revisedDraft: draft, markers, removalEvents };
}
