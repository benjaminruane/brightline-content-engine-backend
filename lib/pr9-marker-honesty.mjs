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
  classifyNoteClaim,
  NOTE_CLAIMS_CHANGE,
  NOTE_CLAIMS_NO_CHANGE,
} from "./pr9-marker-note-claim.mjs";
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
 * Word-sequence key matching markerSpanAlignment / tokenizeWords, after the
 * same house-style character normalisation used elsewhere in this module.
 * @param {string} text
 * @returns {string}
 */
export function honestyCompareKey(text) {
  const normalized = normalizePgHouseStyleCharacters(typeof text === "string" ? text : "");
  return tokenizeWords(normalized)
    .map((t) => t.text)
    .join(" ");
}

/**
 * True when needle's token sequence appears contiguously in haystack.
 * @param {string} haystackKey
 * @param {string} needleKey
 * @returns {boolean}
 */
export function tokenSequenceIncludes(haystackKey, needleKey) {
  if (!needleKey) return false;
  if (!haystackKey) return false;
  if (haystackKey === needleKey) return true;
  const hay = haystackKey.split(" ");
  const needle = needleKey.split(" ");
  if (needle.length > hay.length) return false;
  for (let i = 0; i <= hay.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Region-independent: CUT (removal) claim while the marked span still wraps
 * an entire sentence that survives verbatim from the original draft (the
 * Condition A wrap-in-place failure). A small remnant inside an unchanged
 * neighbour sentence after a genuine deletion must NOT match.
 *
 * Empty spans are treated as absent (genuine deletion remnant) and return false.
 *
 * @param {string} original
 * @param {string} revised
 * @param {number} start
 * @param {number} end
 * @returns {boolean}
 */
export function cutSpanTextPresentInRevised(original, revised, start, end) {
  const span = typeof revised === "string" ? revised.slice(start, end) : "";
  // Empty remnant: span text absent from the draft as marked content.
  if (!String(span).trim()) return false;

  // Containing sentence in the revised draft (punctuation bounds; no LCS).
  const bounds = sentenceBoundsContaining(revised, start, end);
  const sentKey = honestyCompareKey(
    typeof revised === "string" ? revised.slice(bounds.start, bounds.end) : ""
  );
  if (!sentKey) return false;

  // Survives verbatim: that same sentence word-sequence is still in the original.
  if (!tokenSequenceIncludes(honestyCompareKey(original), sentKey)) return false;

  // Whole-sentence wrap only: leftovers outside the span mean a remnant CUT.
  const left = revised.slice(bounds.start, start).trim();
  const right = revised
    .slice(end, bounds.end)
    .replace(/[.!?]+$/g, "")
    .trim();
  return left.length === 0 && right.length === 0;
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
 * Inclusive sentence (or paragraph) bounds around [start, end) in text.
 * Terminals are . ! ? or a blank line. Does not expand marker offsets.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {{ start: number, end: number }}
 */
export function sentenceBoundsContaining(text, start, end) {
  const source = typeof text === "string" ? text : "";
  let s = Number.isFinite(start) ? start : 0;
  let e = Number.isFinite(end) ? end : s;
  if (s < 0) s = 0;
  if (e < s) e = s;
  if (s > source.length) s = source.length;
  if (e > source.length) e = source.length;

  let left = s;
  while (left > 0) {
    const prev = source[left - 1];
    if (prev === "." || prev === "!" || prev === "?") break;
    if (prev === "\n" && left >= 2 && source[left - 2] === "\n") break;
    left -= 1;
  }
  while (left < source.length && /\s/.test(source[left])) left += 1;

  let right = Math.max(e, left);
  while (right < source.length) {
    const ch = source[right];
    if (ch === "." || ch === "!" || ch === "?") {
      right += 1;
      break;
    }
    if (ch === "\n" && right + 1 < source.length && source[right + 1] === "\n") break;
    right += 1;
  }
  return { start: left, end: right };
}

/**
 * True when the revised sentence containing the marker differs (by LCS word
 * sequence) from its aligned original region. Used for remnant_missed_edit.
 *
 * @param {string} original
 * @param {string} revised
 * @param {number} start
 * @param {number} end
 * @returns {boolean}
 */
export function containingSentenceChanged(original, revised, start, end) {
  const bounds = sentenceBoundsContaining(revised, start, end);
  if (bounds.end <= bounds.start) return false;
  const sentAlign = markerSpanAlignment(original, revised, bounds.start, bounds.end);
  return sentAlign.spanStatus === SPAN_CHANGED;
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
 * Repair policy (after Suggest measure 25ae739 / diagnosis b487e61):
 * - cut_but_text_present: CUT while the containing sentence still appears
 *   verbatim in original and revised. Region-independent; runs before LCS.
 *   Flip intent to KEPT and rewrite the note.
 * - remnant_missed_edit: CHANGED|CUT on an unchanged remnant whose containing
 *   sentence did change. Keep the model note and intent; do not clobber.
 * - changed_but_identical / cut_but_region_unchanged (no sentence edit): rewrite
 *   the note and flip intent to KEPT so chip and note agree.
 * - note_intent_mismatch: pure keep-language note with CHANGED|CUT (or pure
 *   change-language note with KEPT). Flip keep+CHANGED|CUT to KEPT; flag only
 *   for change+KEPT. Mixed keep+change notes are AMBIGUOUS and are not flagged.
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
    let intent = m.intent;
    const noteBefore = typeof m.note === "string" ? m.note : "";
    const span = revisedDraft.slice(start, end);

    // Region-independent short-circuit: CUT on text whose containing sentence
    // still survives verbatim. Must not depend on LCS neighbour windows
    // (Condition A / 0559301 false pass on cut_but_region_unchanged).
    if (intent === MARKER_INTENT_CUT && cutSpanTextPresentInRevised(original, revisedDraft, start, end)) {
      const noteAfter = rewriteHonestyNote(noteBefore, "Left this wording as written");
      const event = {
        traceId: opts.traceId || "",
        intent,
        repairedIntent: MARKER_INTENT_KEPT,
        span,
        contradiction: "cut_but_text_present",
        houseStyleOnly: false,
        origRegionText: "",
        revSpanText: span,
        noteBefore,
        noteAfter,
      };
      honestyEvents.push(event);
      logContradiction(event, opts.log);
      return { start, end, note: noteAfter, intent: MARKER_INTENT_KEPT };
    }

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

    if (
      contradiction === "changed_but_identical" ||
      contradiction === "cut_but_region_unchanged"
    ) {
      if (
        (intent === MARKER_INTENT_CHANGED || intent === MARKER_INTENT_CUT) &&
        containingSentenceChanged(original, revisedDraft, start, end)
      ) {
        const event = {
          traceId: opts.traceId || "",
          intent,
          span,
          contradiction: "remnant_missed_edit",
          houseStyleOnly,
          origRegionText: align.origRegionText,
          revSpanText: align.revSpanText,
          noteBefore,
          noteAfter: noteBefore,
        };
        honestyEvents.push(event);
        logContradiction(event, opts.log);
        return { start, end, note: noteBefore, intent };
      }
    }

    // Pure keep-language note with CHANGED|CUT: flip intent, keep the note.
    // Runs before note rewrite so Case C does not get clobbered.
    const noteClaimEarly = classifyNoteClaim(noteBefore);
    if (
      noteClaimEarly === NOTE_CLAIMS_NO_CHANGE &&
      (intent === MARKER_INTENT_CHANGED || intent === MARKER_INTENT_CUT)
    ) {
      const event = {
        traceId: opts.traceId || "",
        intent,
        repairedIntent: MARKER_INTENT_KEPT,
        span,
        contradiction: "note_intent_mismatch",
        noteClaim: noteClaimEarly,
        houseStyleOnly,
        origRegionText: align.origRegionText,
        revSpanText: align.revSpanText,
        noteBefore,
        noteAfter: noteBefore,
      };
      honestyEvents.push(event);
      logContradiction(event, opts.log);
      return { start, end, note: noteBefore, intent: MARKER_INTENT_KEPT };
    }

    if (
      contradiction === "changed_but_identical" ||
      contradiction === "cut_but_region_unchanged"
    ) {
      const noteAfter = rewriteHonestyNote(
        noteBefore,
        firstClauseForContradiction(intent, spanStatus)
      );
      const repairedIntent = MARKER_INTENT_KEPT;
      const event = {
        traceId: opts.traceId || "",
        intent,
        repairedIntent,
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
      return { start, end, note: noteAfter, intent: repairedIntent };
    }

    if (contradiction === "kept_but_differs") {
      const noteAfter = rewriteHonestyNote(
        noteBefore,
        firstClauseForContradiction(intent, spanStatus)
      );
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
      return { start, end, note: noteAfter, intent };
    }

    let note = noteBefore;
    const noteClaim = classifyNoteClaim(note);
    if (noteClaim === NOTE_CLAIMS_CHANGE && intent === MARKER_INTENT_KEPT) {
      const event = {
        traceId: opts.traceId || "",
        intent,
        span,
        contradiction: "note_intent_mismatch",
        noteClaim,
        houseStyleOnly,
        origRegionText: align.origRegionText,
        revSpanText: align.revSpanText,
        noteBefore,
        noteAfter: note,
      };
      honestyEvents.push(event);
      logContradiction(event, opts.log);
    }

    const kept = {
      start,
      end,
      note,
    };
    if (intent) kept.intent = intent;
    return kept;
  });

  // The map above is 1:1 with `incoming`, and its per-branch returns build
  // fresh objects. Restore additive fields (generated-marker provenance) that
  // those literals do not carry.
  for (let i = 0; i < markers.length; i++) {
    const src = incoming[i];
    if (!src || !markers[i] || src.generated !== true) continue;
    markers[i].generated = true;
    if (src.generatedReason) markers[i].generatedReason = src.generatedReason;
  }

  return { revisedDraft, markers, honestyEvents };
}
