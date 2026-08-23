/**
 * Declared-intent honesty check for Pr9 markers. Deterministic; no model call.
 * Uses the shared span comparator in lib/pr9-marker-span-status.mjs.
 *
 * KEPT + house-style-only difference is honest: the finding (a named entity,
 * a keep-and-flag) was left as the author wrote it; currency/scale/separator
 * tidy-ups are required to be silent and must not count as a rewrite.
 */

import { normalizePgHouseStyleCharacters } from "./prompt-library/pg-commentary-cleanup.mjs";
import {
  tokenizeWords,
  markerSpanAlignment,
  SPAN_CHANGED,
  SPAN_UNCHANGED,
} from "./pr9-marker-span-status.mjs";

export const MARKER_INTENT_CHANGED = "CHANGED";
export const MARKER_INTENT_KEPT = "KEPT";
export const MARKER_INTENT_CUT = "CUT";
export const MARKER_INTENTS = [MARKER_INTENT_CHANGED, MARKER_INTENT_KEPT, MARKER_INTENT_CUT];

export const CANONICAL_NOTE_CLOSER = "Confirm before publishing.";

const INTENT_PAYLOAD_RE = /^(CHANGED|KEPT|CUT)\s*:\s*([\s\S]*)$/i;
const NOTE_SEPARATOR_RE = /\s+[\u2014\u2013]\s+|\s+-\s+/;

const SCALE = {
  thousand: 1e3,
  k: 1e3,
  million: 1e6,
  m: 1e6,
  mm: 1e6,
  billion: 1e9,
  bn: 1e9,
  trillion: 1e12,
};

const SPELLED = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const CURRENCY_CODE_RE = /^(USD|EUR|GBP|CHF|SEK|NOK|DKK|JPY|AUD|CAD)$/i;
const SCALE_WORD_RE = /^(thousand|million|billion|trillion|k|m|mm|bn)$/i;
const PURE_NUMBER_RE = /^[$€£]?[\d',.]+%?$/;

/**
 * Phrase-level review vocabulary. Single words like "source" or "sources"
 * are not listed: a draft can legitimately discuss sources of capital,
 * open source, or a source document. Bare "the sources" is also skipped
 * for the same reason ("the sources of revenue"). Hits are collocations
 * that belong in a marker note, plus leaked note-closers and edit-narration.
 */
export const REVIEW_VOCABULARY_PATTERNS = [
  { id: "not_supported_by_sources", re: /not supported by (?:the )?sources/i },
  { id: "unsupported_by_sources", re: /unsupported by (?:the )?sources/i },
  { id: "which_is_not_supported", re: /which is not supported/i },
  { id: "sources_do_not", re: /\bsources do(?:n't| not)\b/i },
  { id: "the_sources_do", re: /\bthe sources do(?:n't| not)\b/i },
  { id: "review_flagged", re: /review flagged/i },
  { id: "confirm_before_publishing", re: /confirm before publishing/i },
  { id: "removing_the_reference", re: /removing the reference/i },
  { id: "unsupported_word", re: /\bunsupported\b/i },
];

/**
 * @param {string} payload
 * @returns {{ intent: "CHANGED"|"KEPT"|"CUT", note: string }|null}
 */
export function parseMarkerIntentPayload(payload) {
  const raw = typeof payload === "string" ? payload : "";
  const match = raw.match(INTENT_PAYLOAD_RE);
  if (!match) return null;
  return { intent: match[1].toUpperCase(), note: match[2] };
}

/**
 * @param {string} draft
 * @returns {Array<{ id: string, match: string }>}
 */
export const REVIEW_VOCABULARY_WARNING =
  "The revised draft still contains reviewer wording that belongs in a marker note, not in the sentence. It needs attention before publishing.";

export function logReviewVocabularyAttempt(event, sink) {
  const line =
    `[pr9-review-vocabulary] trace=${event.traceId || "-"} attempt=${event.attempt} ` +
    `hits=${JSON.stringify(event.hits || [])} draft=${JSON.stringify(event.draft || "")}`;
  if (typeof sink === "function") sink(line);
  else console.warn(line);
}

export function findReviewVocabularyHits(draft) {
  const source = typeof draft === "string" ? draft : "";
  const hits = [];
  for (const rule of REVIEW_VOCABULARY_PATTERNS) {
    const found = source.match(rule.re);
    if (found) hits.push({ id: rule.id, match: found[0] });
  }
  return hits;
}

function parseScaledNumber(rawDigits, scaleWord) {
  const digits = String(rawDigits || "").replace(/[',]/g, "");
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  const scale = scaleWord ? SCALE[String(scaleWord).toLowerCase()] : 1;
  return n * (scale || 1);
}

function canonicalAmounts(text) {
  const source = normalizePgHouseStyleCharacters(typeof text === "string" ? text : "");
  const amounts = [];
  const re =
    /(?:[$€£]|(?:USD|EUR|GBP|CHF|SEK|NOK|DKK)\s+)?(\d{1,3}(?:[',]\d{3})+|\d+(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion|k|m|mm|bn)\b)?/gi;
  let match;
  while ((match = re.exec(source)) !== null) {
    const value = parseScaledNumber(match[1], match[2]);
    if (value != null) amounts.push(value);
  }
  for (const token of tokenizeWords(source)) {
    const key = token.text.toLowerCase().replace(/[.,;:]+$/, "");
    if (Object.prototype.hasOwnProperty.call(SPELLED, key)) amounts.push(SPELLED[key]);
  }
  return amounts.slice().sort((a, b) => a - b);
}

function contentWordKey(text) {
  const source = normalizePgHouseStyleCharacters(typeof text === "string" ? text : "");
  const words = [];
  for (const token of tokenizeWords(source)) {
    const raw = token.text.replace(/[.,;:]+$/, "");
    if (!raw) continue;
    if (CURRENCY_CODE_RE.test(raw)) continue;
    if (SCALE_WORD_RE.test(raw)) continue;
    if (PURE_NUMBER_RE.test(raw)) continue;
    if (Object.prototype.hasOwnProperty.call(SPELLED, raw.toLowerCase())) continue;
    words.push(raw);
  }
  return words.join("\0");
}

/**
 * True when the only differences are silent house-style: ISO currency vs symbol,
 * million/billion scale, thousand separators, quote/dash characters, and
 * spelled-out numbers 0-12 versus numerals. A changed name, verb, or figure
 * that is not a scale rewrite is not house-style.
 *
 * @param {string} originalRegion
 * @param {string} revisedSpan
 * @returns {boolean}
 */
export function isHouseStyleOnlyDifference(originalRegion, revisedSpan) {
  const a = typeof originalRegion === "string" ? originalRegion : "";
  const b = typeof revisedSpan === "string" ? revisedSpan : "";
  if (normalizePgHouseStyleCharacters(a) === normalizePgHouseStyleCharacters(b)) return true;
  if (contentWordKey(a) !== contentWordKey(b)) return false;
  const left = canonicalAmounts(a);
  const right = canonicalAmounts(b);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function splitNoteClauses(note) {
  const raw = typeof note === "string" ? note.trim() : "";
  const body = raw.replace(/\s*Confirm before publishing\.?\s*$/i, "").trim();
  if (!body) return { first: "", reason: "" };
  const sep = body.search(NOTE_SEPARATOR_RE);
  if (sep < 0) return { first: body, reason: "" };
  const match = body.slice(sep).match(NOTE_SEPARATOR_RE);
  const width = match ? match[0].length : 3;
  return {
    first: body.slice(0, sep).trim(),
    reason: body.slice(sep + width).trim(),
  };
}

function firstClauseForContradiction(intent, spanStatus) {
  if (intent === MARKER_INTENT_CHANGED && spanStatus === SPAN_UNCHANGED) {
    return "Left this wording as written";
  }
  if (intent === MARKER_INTENT_KEPT && spanStatus === SPAN_CHANGED) {
    return "Revised this span";
  }
  if (intent === MARKER_INTENT_CUT && spanStatus === SPAN_UNCHANGED) {
    return "Left this wording as written";
  }
  return "Left this wording as written";
}

/**
 * @param {string} note
 * @param {string} newFirst
 * @returns {string}
 */
export function rewriteHonestyNote(note, newFirst) {
  const { reason } = splitNoteClauses(note);
  const first = String(newFirst || "Left this wording as written").trim();
  const capitalised = first.charAt(0).toUpperCase() + first.slice(1);
  const withPunct = /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
  if (reason) {
    const reasonBody = reason.replace(/[.!?]+$/g, "").trim();
    return `${withPunct.replace(/[.!?]$/, "")} - ${reasonBody}. ${CANONICAL_NOTE_CLOSER}`;
  }
  return `${withPunct} ${CANONICAL_NOTE_CLOSER}`;
}

function logContradiction(event, sink) {
  const line =
    `[pr9-marker-honesty] contradiction trace=${event.traceId || "-"} ` +
    `intent=${event.intent} span=${JSON.stringify(event.span)} ` +
    `noteBefore=${JSON.stringify(event.noteBefore)} ` +
    `noteAfter=${JSON.stringify(event.noteAfter)}`;
  if (typeof sink === "function") sink(line);
  else console.warn(line);
}

/**
 * Per-intent honesty. Does not drop markers.
 *
 * CUT window: original tokens strictly between the nearest LCS-aligned
 * neighbours of the remnant (markerSpanAlignment). That is the same window
 * the deletion-aware comparator uses, so a correct clause-cut is CHANGED
 * (adjacent words missing) and is not a contradiction.
 *
 * KEPT: a house-style-only difference is not a contradiction.
 *
 * @param {string} originalDraft
 * @param {{ revisedDraft: string, markers: Array<object> }} parsed
 * @param {{ traceId?: string, log?: Function }} [opts]
 * @returns {{ revisedDraft: string, markers: Array<object>, honestyEvents: Array<object> }}
 */
export function applyMarkerHonestyCheck(originalDraft, parsed, opts = {}) {
  const original = typeof originalDraft === "string" ? originalDraft : "";
  const revisedDraft = typeof parsed?.revisedDraft === "string" ? parsed.revisedDraft : "";
  const incoming = Array.isArray(parsed?.markers) ? parsed.markers : [];
  const honestyEvents = [];
  const markers = incoming.map((m) => {
    const start = Number.isFinite(m.start) ? m.start : 0;
    const end = Number.isFinite(m.end) ? m.end : start;
    const intent = m.intent;
    const noteBefore = typeof m.note === "string" ? m.note : "";
    const span = revisedDraft.slice(start, end);
    const align = markerSpanAlignment(original, revisedDraft, start, end);
    let spanStatus = align.spanStatus;
    let houseStyleOnly = false;
    if (intent === MARKER_INTENT_KEPT && spanStatus === SPAN_CHANGED) {
      houseStyleOnly = isHouseStyleOnlyDifference(align.origRegionText, align.revSpanText);
      if (houseStyleOnly) spanStatus = SPAN_UNCHANGED;
    }

    let contradiction = null;
    if (intent === MARKER_INTENT_CHANGED && spanStatus === SPAN_UNCHANGED) {
      contradiction = "changed_but_identical";
    } else if (intent === MARKER_INTENT_KEPT && spanStatus === SPAN_CHANGED) {
      contradiction = "kept_but_differs";
    } else if (intent === MARKER_INTENT_CUT && spanStatus === SPAN_UNCHANGED) {
      contradiction = "cut_but_region_unchanged";
    }

    if (!contradiction) {
      const kept = {
        start,
        end,
        note: noteBefore,
      };
      if (intent) kept.intent = intent;
      return kept;
    }

    const noteAfter = rewriteHonestyNote(noteBefore, firstClauseForContradiction(intent, spanStatus));
    const event = {
      traceId: opts.traceId || "",
      intent,
      span,
      contradiction,
      houseStyleOnly,
      origRegionText: align.origRegionText,
      revSpanText: align.revSpanText,
      noteBefore,
      noteAfter,
    };
    honestyEvents.push(event);
    logContradiction(event, opts.log);
    const repaired = { start, end, note: noteAfter };
    if (intent) repaired.intent = intent;
    return repaired;
  });

  return { revisedDraft, markers, honestyEvents };
}
