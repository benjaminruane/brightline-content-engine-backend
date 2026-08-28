/**
 * Deterministic whole-sentence removal for aggregated no_support
 * (evidence.kind === "unsupported"). Diag-gated; not production default.
 *
 * Runs after house-style / cut-punctuation, before marker honesty.
 */

import { sentenceBoundsContaining } from "./pr9-marker-honesty.mjs";

/** @deprecated Prefer buildDeterministicUnsupportedRemovalCutNote(sentence). */
export const DETERMINISTIC_UNSUPPORTED_REMOVAL_CUT_NOTE =
  "Removed this sentence - no supplied source backs that claim.";

export const DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE =
  "No supplied source supports this. It has been kept only because removing it would leave the draft empty.";

/**
 * Same loud register as the empty-draft note. A removal that cannot be
 * recorded must not happen: fc25060 found remnant_lost_after_delete deleting
 * the sentence and returning no marker, which no safeguard could see because
 * they all inspect markers.
 */
export const DETERMINISTIC_UNSUPPORTED_UNRECORDABLE_NOTE =
  "No supplied source supports this. It has been kept only because its removal could not be recorded.";

/** Shared opening of every removal CUT note; used by the stage invariant. */
export const REMOVAL_NOTE_PREFIX = "Removed this sentence";

const NOTE_CLOSER = "Confirm before publishing.";
const QUOTE_MAX_CHARS = 200;

function finalizeRemovalNote(body) {
  const trimmed = String(body || "").trim();
  if (!trimmed) return NOTE_CLOSER;
  const withPunct = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  if (withPunct.endsWith(NOTE_CLOSER)) return withPunct;
  return `${withPunct} ${NOTE_CLOSER}`;
}

/**
 * Strip {{span||note}} markers from text before quoting into a removal note.
 * @param {string} text
 * @returns {string}
 */
export function stripMarkersFromQuotedText(text) {
  return String(text || "").replace(/\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g, "$1");
}

/**
 * Build the CUT note that quotes the removed sentence verbatim.
 * Survives normalizeMarkerNoteText without mangling the quotation.
 *
 * @param {string} removedSentenceText
 * @returns {string}
 */
export function buildDeterministicUnsupportedRemovalCutNote(removedSentenceText) {
  let quoted = collapseWhitespace(stripMarkersFromQuotedText(removedSentenceText));
  if (quoted.length > QUOTE_MAX_CHARS) {
    quoted = `${quoted.slice(0, QUOTE_MAX_CHARS)}...`;
  }
  // Escape embedded double quotes so the outer quotation stays readable.
  quoted = quoted.replace(/"/g, "'");
  const body = `Removed this sentence: "${quoted}" No supplied source backs that claim`;
  return finalizeRemovalNote(body);
}

/**
 * Deterministic checkable-particular detector for removal gating.
 * A "particular" is a numeral, money/percent/multiple, date/period, proper noun
 * (excluding first-person author refs), ranking/superlative, or comparative
 * against a named peer/benchmark.
 *
 * @param {string} sentenceText
 * @returns {Array<{ kind: string, match: string }>}
 */
export function findCheckableParticulars(sentenceText) {
  const text = typeof sentenceText === "string" ? sentenceText : "";
  if (!text.trim()) return [];
  /** @type {Array<{ kind: string, match: string }>} */
  const found = [];
  const push = (kind, match) => {
    const m = String(match || "").trim();
    if (!m) return;
    if (found.some((f) => f.kind === kind && f.match === m)) return;
    found.push({ kind, match: m });
  };

  // Numerals (including decimals and commas).
  for (const m of text.match(/\b\d[\d,]*(?:\.\d+)?\b/g) || []) push("numeral", m);

  // Spelled-out numbers (common small set + *teen / *ty).
  for (const m of text.match(
    /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/gi
  ) || []) {
    push("spelled_number", m);
  }

  // Percentages, currency, multiples (2.4x / 2.4 times).
  for (const m of text.match(/\b\d[\d,]*(?:\.\d+)?\s*%/g) || []) push("percentage", m);
  for (const m of text.match(/\b(?:percent|per\s*cent)\b/gi) || []) push("percentage", m);
  for (const m of text.match(
    /(?:USD|EUR|GBP|\$|€|£)\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|m|bn))?/gi
  ) || []) {
    push("currency", m);
  }
  for (const m of text.match(/\b\d[\d,]*(?:\.\d+)?\s*x\b/gi) || []) push("multiple", m);
  for (const m of text.match(/\b\d[\d,]*(?:\.\d+)?\s*times\b/gi) || []) push("multiple", m);

  // Dates, years, quarters, period expressions.
  for (const m of text.match(/\b(?:19|20)\d{2}\b/g) || []) push("year", m);
  for (const m of text.match(/\bQ[1-4]\b/gi) || []) push("quarter", m);
  for (const m of text.match(
    /\b(?:second|first|third|fourth)\s+quarter(?:\s+of\s+(?:19|20)\d{2})?\b/gi
  ) || []) {
    push("quarter", m);
  }
  for (const m of text.match(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/gi
  ) || []) {
    push("date", m);
  }
  for (const m of text.match(
    /\b(?:FY|H1|H2|1H|2H)\s*(?:19|20)?\d{0,2}\b/gi
  ) || []) {
    push("period", m);
  }

  // Superlative / ranking words.
  for (const m of text.match(
    /\b(?:top|first|largest|biggest|best|leading|highest|lowest|only)\b/gi
  ) || []) {
    push("ranking", m);
  }

  // Comparative against a named benchmark / peer group.
  for (const m of text.match(
    /\b(?:versus|vs\.?|compared\s+to|relative\s+to|against)\s+[A-Z][\w&-]*/g
  ) || []) {
    push("comparative_benchmark", m);
  }
  for (const m of text.match(
    /\b(?:peer\s+group|benchmark|quartile|industry\s+average)\b/gi
  ) || []) {
    push("comparative_benchmark", m);
  }

  // Proper nouns: Capitalised tokens not at sentence start after a boundary,
  // excluding first-person author refs (We/Our/I) and common non-name starters.
  const FIRST_PERSON = new Set(["we", "our", "ours", "us", "i", "my", "mine"]);
  const STOP = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "if",
    "as",
    "at",
    "by",
    "for",
    "in",
    "of",
    "on",
    "to",
    "with",
    "from",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "can",
    "not",
    "no",
    "yes",
    "so",
    "than",
    "then",
    "when",
    "where",
    "which",
    "who",
    "whom",
    "what",
    "how",
    "all",
    "any",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "into",
    "over",
    "after",
    "before",
    "between",
    "through",
    "during",
    "without",
    "within",
    "about",
    "above",
    "below",
    "under",
    "again",
    "further",
    "once",
    "here",
    "there",
    "out",
    "off",
    "up",
    "down",
    "also",
    "just",
    "only",
    "own",
    "same",
    "too",
    "very",
    "said",
    "one",
    "two",
    "company",
    "fund",
    "team",
    "management",
    "investment",
    "opportunity",
    "portfolio",
    "strategy",
    "transaction",
    "source",
    "sources",
    "sentence",
    "claim",
    "update",
    "updates",
    "detail",
    "details",
    "work",
    "plan",
    "value",
    "creation",
    "conviction",
    "confident",
    "look",
    "forward",
    "providing",
    "hold",
    "progresses",
    "recommend",
    "approval",
    "numbers",
    "story",
    "transformation",
    "bigger",
    "tells",
    "fits",
    "well",
    "broader",
    "sufficiently",
    "advanced",
    "high",
    "existing",
    "companies",
    "company",
    "limited",
    "partner",
    "partners",
    "pipeline",
    "capital",
    "calls",
    "months",
    "expect",
    "expected",
    "close",
    "relationship",
    "deepen",
    "life",
  ]);

  // Multi-word Proper Noun sequences and single Cap words mid-sentence.
  const properRe = /(?:^|[.!?]\s+|[\s(,;:–—-])([A-Z][a-zA-Z0-9&'-]*(?:\s+[A-Z][a-zA-Z0-9&'-]*)*)/g;
  let pm;
  while ((pm = properRe.exec(text)) !== null) {
    const raw = pm[1];
    const atStart = pm.index === 0 || /[.!?]\s*$/.test(text.slice(Math.max(0, pm.index - 2), pm.index + 1));
    const words = raw.split(/\s+/);
    // Skip pure sentence-initial single common word (We / The / ...).
    if (words.length === 1) {
      const w = words[0];
      const lower = w.toLowerCase();
      if (FIRST_PERSON.has(lower) || STOP.has(lower)) continue;
      if (atStart && w === words[0] && !/[a-z]/.test(w.slice(1)) === false) {
        // Allow mid-sentence capitals; at sentence start require 2+ caps or known shape.
        // Sentence-initial "Fund" alone is weak; "Fund V" caught by numeral+cap via other rules.
        if (atStart && words.length === 1) {
          // Still accept clear proper nouns at start if not stop words (already filtered).
          // e.g. "Veneto Freight is..." — Veneto is a particular.
        }
      }
      push("proper_noun", w);
    } else {
      const filtered = words.filter((w) => {
        const lower = w.toLowerCase();
        return !FIRST_PERSON.has(lower);
      });
      if (filtered.length) push("proper_noun", filtered.join(" "));
    }
  }

  // Fund V / Fund IV style labels.
  for (const m of text.match(/\bFund\s+[IVXLC\d]+\b/g) || []) push("proper_noun", m);

  return found;
}

/**
 * @param {string} sentenceText
 * @returns {boolean}
 */
export function hasCheckableParticular(sentenceText) {
  return findCheckableParticulars(sentenceText).length > 0;
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
    ...m,
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
 * @param {{ enabled?: boolean, originalDraft?: string, traceId?: string, log?: Function }} [opts]
 * @returns {{
 *   revisedDraft: string,
 *   markers: Array<object>,
 *   removalEvents: Array<object>,
 * }}
 */
export function applyDeterministicUnsupportedRemoval(parsed, concerns, opts = {}) {
  const enabled = opts.enabled === true;
  const originalDraft = typeof opts.originalDraft === "string" ? opts.originalDraft : "";
  let draft = typeof parsed?.revisedDraft === "string" ? parsed.revisedDraft : "";
  let markers = Array.isArray(parsed?.markers) ? parsed.markers.map((m) => copyMarker(m)) : [];
  /** @type {Array<object>} */
  const removalEvents = [];

  if (!enabled) {
    return { revisedDraft: draft, markers, removalEvents };
  }

  // Restore target for the stage invariant below.
  const preStageDraft = draft;
  const preStageMarkers = markers.map((m) => copyMarker(m));

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
        statementId: statementIdFromConcern(concern),
        statementText: concern.statementText,
        removedSentenceText: null,
        originalOffset: null,
      });
      continue;
    }

    const match = findStatementTextInDraft(draft, concern.statementText);
    if (!match) {
      removalEvents.push({
        action: "skipped",
        reason: "statement_text_no_match",
        statementIndex: concern.statementIndex,
        statementId: statementIdFromConcern(concern),
        statementText: concern.statementText,
        removedSentenceText: null,
        originalOffset: null,
      });
      continue;
    }
    if (!matchIsWholeSentence(draft, match)) {
      removalEvents.push({
        action: "skipped",
        reason: "not_whole_sentence",
        statementIndex: concern.statementIndex,
        statementId: statementIdFromConcern(concern),
        statementText: concern.statementText,
        removedSentenceText: null,
        originalOffset: null,
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
        statementId: statementIdFromConcern(concern),
        statementText: concern.statementText,
        removedSentenceText: null,
        originalOffset: null,
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
      markers = keepAndFlagSentence(draft, markers, wrapStart, wrapEnd, note);
      removalEvents.push({
        action: "empty_draft_kept",
        reason: "empty_draft_kept",
        statementIndex: concern.statementIndex,
        statementId: statementIdFromConcern(concern),
        statementText: concern.statementText,
        removedSentenceText: null,
        originalOffset: originalOffsetFor(originalDraft, concern.statementText),
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
          statementId: statementIdFromConcern(concern),
          statementText: concern.statementText,
          removedSentenceText: null,
          originalOffset: null,
        });
        continue;
      } else {
        removalEvents.push({
          action: "skipped",
          reason: "no_neighbour_remnant",
          statementIndex: concern.statementIndex,
          statementId: statementIdFromConcern(concern),
          statementText: concern.statementText,
          removedSentenceText: null,
          originalOffset: null,
        });
        continue;
      }
    }

    // Capture remnant text before deletion; remap its offsets after.
    const remnantText = draft.slice(remnant.start, remnant.end);
    const remnantBeforeDeletion = remnant.start < range.start;
    const removedRaw = draft.slice(live.start, range.sentenceEnd > live.start ? range.sentenceEnd : live.end);
    const removedSentenceText = collapseWhitespace(
      stripMarkersFromQuotedText(concern.statementText || removedRaw)
    );
    const originalOffset = originalOffsetFor(originalDraft, concern.statementText);

    // PLAN the deletion against locals. Nothing is committed to `draft` or
    // `markers` until a CUT marker has been anchored in the post-deletion text,
    // so a removal that cannot be recorded simply does not happen.
    const nextDraft = plannedDraft;
    let nextMarkers = remapMarkersAfterDeletion(markers, range.start, range.end);

    const keepUnrecorded = (reason) => {
      const keptNote = finalizeRemovalNote(DETERMINISTIC_UNSUPPORTED_UNRECORDABLE_NOTE);
      const wrapStart = live.start;
      const wrapEnd = range.sentenceEnd > live.start ? range.sentenceEnd : live.end;
      markers = keepAndFlagSentence(draft, markers, wrapStart, wrapEnd, keptNote);
      removalEvents.push({
        action: "unrecordable_removal_kept",
        reason,
        statementIndex: concern.statementIndex,
        statementId: statementIdFromConcern(concern),
        statementText: concern.statementText,
        removedSentenceText: null,
        originalOffset,
        note: keptNote,
      });
    };

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
    if (nextDraft.slice(remStart, remEnd) !== remnantText) {
      const found = nextDraft.indexOf(remnantText);
      if (found < 0) {
        keepUnrecorded("remnant_lost_after_delete");
        continue;
      }
      remStart = found;
      remEnd = found + remnantText.length;
    }

    const note = buildDeterministicUnsupportedRemovalCutNote(
      concern.statementText || removedRaw
    );
    nextMarkers.push({
      start: remStart,
      end: remEnd,
      note,
      intent: "CUT",
    });
    nextMarkers.sort((a, b) => a.start - b.start || a.end - b.end);

    // Drop any marker that now points past the draft or at empty/invalid spans.
    nextMarkers = nextMarkers.filter(
      (m) =>
        Number.isFinite(m.start) &&
        Number.isFinite(m.end) &&
        m.start >= 0 &&
        m.end <= nextDraft.length &&
        m.end > m.start
    );

    // A degenerate remnant span would be dropped by the filter above, leaving
    // the deletion silent. Abandon it rather than delete without a marker.
    const anchored = nextMarkers.some(
      (m) => m.start === remStart && m.end === remEnd && m.intent === "CUT"
    );
    if (!anchored) {
      keepUnrecorded("marker_dropped_after_delete");
      continue;
    }

    markers = nextMarkers;
    draft = nextDraft;

    removalEvents.push({
      action: "removed",
      reason: "unsupported_whole_sentence_removed",
      statementIndex: concern.statementIndex,
      statementId: statementIdFromConcern(concern),
      statementText: concern.statementText,
      removedSentenceText,
      originalOffset,
      remnantSide,
      remnantText,
      note,
      marker: { start: remStart, end: remEnd, intent: "CUT", note },
    });
  }

  return enforceRemovalInvariant(
    { revisedDraft: draft, markers, removalEvents },
    { preStageDraft, preStageMarkers, traceId: opts.traceId, log: opts.log }
  );
}

/**
 * STAGE INVARIANT: one removal marker per deleted sentence.
 *
 * The per-removal guards in applyDeterministicUnsupportedRemoval should make a
 * violation unreachable. This exists anyway because a silent deletion is the
 * one failure mode nothing downstream can detect: every other safeguard we have
 * inspects markers, so a deletion carrying no marker is invisible to all of
 * them.
 *
 * Throwing would lose the whole revision, so the draft is restored to its
 * pre-stage state instead. A revision that removed nothing is recoverable; one
 * that removed something without saying so is not.
 *
 * @param {{ revisedDraft: string, markers: Array<object>, removalEvents: Array<object> }} result
 * @param {{ preStageDraft: string, preStageMarkers: Array<object>, traceId?: string, log?: Function }} ctx
 */
export function enforceRemovalInvariant(result, ctx) {
  const { revisedDraft, markers, removalEvents } = result;
  const deletedCount = removalEvents.filter((e) => e.action === "removed").length;
  const removalMarkerCount = markers.filter(
    (m) => m.intent === "CUT" && String(m.note || "").startsWith(REMOVAL_NOTE_PREFIX)
  ).length;

  if (deletedCount === removalMarkerCount) {
    return { revisedDraft, markers, removalEvents };
  }

  const logError = typeof ctx.log === "function" ? ctx.log : console.error;
  logError(
    `[removal-invariant] trace=${ctx.traceId || "suggest-revision"} ` +
      `deleted=${deletedCount} markers=${removalMarkerCount} ` +
      `action=restored_pre_stage_draft`
  );

  return {
    revisedDraft: ctx.preStageDraft,
    markers: (ctx.preStageMarkers || []).map((m) => copyMarker(m)),
    removalEvents: [
      ...removalEvents,
      {
        action: "invariant_violated_restored",
        reason: "deleted_sentence_without_marker",
        deletedCount,
        removalMarkerCount,
      },
    ],
  };
}

/**
 * Keep a sentence and flag it loudly: drop markers overlapping the sentence,
 * then wrap it in a single KEPT marker. Shared by the empty-draft guard and the
 * unrecordable-removal guard.
 */
function keepAndFlagSentence(draft, markers, wrapStart, wrapEnd, note) {
  const kept = markers.filter((m) => !(m.end > wrapStart && m.start < wrapEnd));
  kept.push({
    start: wrapStart,
    end: Math.min(wrapEnd, draft.length),
    note,
    intent: "KEPT",
  });
  kept.sort((a, b) => a.start - b.start || a.end - b.end);
  return kept;
}

function statementIdFromConcern(concern) {
  if (typeof concern?.statementId === "string" && concern.statementId.trim()) {
    return concern.statementId.trim();
  }
  if (Number.isFinite(concern?.statementIndex)) return String(concern.statementIndex);
  return null;
}

function originalOffsetFor(originalDraft, statementText) {
  if (!originalDraft) return null;
  const match = findStatementTextInDraft(originalDraft, statementText);
  return match ? match.start : null;
}
