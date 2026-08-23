/**
 * Pr9 marker-consistency classifiers (deterministic; no LLM).
 *
 * Span status lives in lib/pr9-marker-span-status.mjs (shared with a later
 * production post-check). Note claim: whole-word match on a closed verb list,
 * not stems. "cutting" in "consider cutting" is not "cut", so keep-and-flag
 * notes stay CLAIMS_NO_CHANGE when they lead with kept/retained/left in place.
 */

import {
  tokenizeWords,
  markerSpanStatus,
  SPAN_CHANGED,
  SPAN_UNCHANGED,
} from "../../../lib/pr9-marker-span-status.mjs";

export { tokenizeWords, markerSpanStatus, SPAN_CHANGED, SPAN_UNCHANGED };

export const CHANGE_VERBS = [
  "removed",
  "changed",
  "replaced",
  "corrected",
  "softened",
  "cut",
  "dropped",
  "reworded",
  "qualified",
  "added",
];

const CHANGE_VERB_RE = new RegExp(`\\b(?:${CHANGE_VERBS.join("|")})\\b`, "i");
const KEEP_RE =
  /\bkept\b|\bretained\b|\bleft in place\b|\bleave in place\b|\bleaving in place\b|\bleaves in place\b/i;
const CONFIRM_ONLY_RE =
  /^(?:confirm(?:\s+this(?:\s+softer)?\s+formulation)?(?:\s+before\s+publishing)?[.!?]*)?$/i;

export const NOTE_CLAIMS_CHANGE = "CLAIMS_A_CHANGE";
export const NOTE_CLAIMS_NO_CHANGE = "CLAIMS_NO_CHANGE";
export const NOTE_AMBIGUOUS = "AMBIGUOUS";

export const OUTCOME_CORRECT_CHANGE = "correct_changed_claims_change";
export const OUTCOME_CORRECT_KEEP = "correct_unchanged_claims_no_change";
export const OUTCOME_DEFECT = "defect_unchanged_claims_change";
export const OUTCOME_WRONG_KEEP_ON_CHANGE = "wrong_changed_claims_no_change";
export const OUTCOME_AMBIGUOUS = "ambiguous";

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function noteBodyWithoutCloser(note) {
  return String(note || "")
    .replace(/\s*Confirm before publishing\.?\s*$/i, "")
    .trim();
}

/**
 * @param {string} note
 * @returns {"CLAIMS_A_CHANGE"|"CLAIMS_NO_CHANGE"|"AMBIGUOUS"}
 */
export function classifyNoteClaim(note) {
  const raw = typeof note === "string" ? note.trim() : "";
  if (!raw) return NOTE_CLAIMS_NO_CHANGE;

  const claimsChange = CHANGE_VERB_RE.test(raw);
  const claimsKeep = KEEP_RE.test(raw);
  if (claimsChange && claimsKeep) return NOTE_AMBIGUOUS;
  if (claimsChange) return NOTE_CLAIMS_CHANGE;
  if (claimsKeep) return NOTE_CLAIMS_NO_CHANGE;

  const body = noteBodyWithoutCloser(raw);
  if (!body || CONFIRM_ONLY_RE.test(body)) return NOTE_CLAIMS_NO_CHANGE;
  return NOTE_AMBIGUOUS;
}

/**
 * @param {"CHANGED"|"UNCHANGED"} spanStatus
 * @param {"CLAIMS_A_CHANGE"|"CLAIMS_NO_CHANGE"|"AMBIGUOUS"} noteClaim
 * @returns {string}
 */
export function outcomeBucket(spanStatus, noteClaim) {
  if (noteClaim === NOTE_AMBIGUOUS) return OUTCOME_AMBIGUOUS;
  if (spanStatus === SPAN_UNCHANGED && noteClaim === NOTE_CLAIMS_CHANGE) return OUTCOME_DEFECT;
  if (spanStatus === SPAN_CHANGED && noteClaim === NOTE_CLAIMS_NO_CHANGE) {
    return OUTCOME_WRONG_KEEP_ON_CHANGE;
  }
  if (spanStatus === SPAN_CHANGED && noteClaim === NOTE_CLAIMS_CHANGE) {
    return OUTCOME_CORRECT_CHANGE;
  }
  return OUTCOME_CORRECT_KEEP;
}

/**
 * True when an evidence gap has no stated replacement figure in source text.
 * Heuristic: excerpt + sourcePassage contain no digit.
 * @param {object|null|undefined} evidence
 */
export function sourceIsSilent(evidence) {
  if (!evidence || typeof evidence !== "object") return false;
  const kind = evidence.kind;
  if (kind !== "unsupported" && kind !== "conflict" && kind !== "partial") return false;
  const blob = `${evidence.excerpt || ""} ${evidence.sourcePassage || ""}`;
  return !/\d/.test(blob);
}

function wordOverlapScore(a, b) {
  const setA = new Set(tokenizeWords(a).map((t) => t.text.toLowerCase()));
  const setB = new Set(tokenizeWords(b).map((t) => t.text.toLowerCase()));
  if (setA.size === 0 || setB.size === 0) return 0;
  let n = 0;
  for (const w of setA) {
    if (setB.has(w)) n += 1;
  }
  return n;
}

/**
 * Pick the gathered concern row this marker most likely belongs to.
 * @param {string} span
 * @param {string} originalDraft
 * @param {Array<object>} concerns
 */
export function matchConcernForMarker(span, originalDraft, concerns) {
  const list = Array.isArray(concerns) ? concerns : [];
  if (list.length === 0) return null;
  const spanText = typeof span === "string" ? span : "";

  if (spanText) {
    for (const row of list) {
      const stmt = typeof row.statementText === "string" ? row.statementText : "";
      if (stmt && (stmt.includes(spanText) || spanText.includes(stmt))) return row;
    }
    const at = typeof originalDraft === "string" ? originalDraft.indexOf(spanText) : -1;
    if (at >= 0) {
      for (const row of list) {
        const stmt = typeof row.statementText === "string" ? row.statementText : "";
        if (!stmt) continue;
        const stmtAt = originalDraft.indexOf(stmt);
        if (stmtAt < 0) continue;
        if (rangesOverlap(at, at + spanText.length, stmtAt, stmtAt + stmt.length)) return row;
      }
    }
  }

  let best = list[0];
  let bestScore = -1;
  for (const row of list) {
    const stmt = typeof row.statementText === "string" ? row.statementText : "";
    const score = wordOverlapScore(spanText, stmt);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

function findingKindsFromConcern(row) {
  const kinds = [];
  if (row?.evidence?.kind) kinds.push(`evidence:${row.evidence.kind}`);
  else if (row?.evidence) kinds.push("evidence:gap");
  if (Array.isArray(row?.editorial)) {
    for (const c of row.editorial) {
      if (c?.kind) kinds.push(`editorial:${c.kind}`);
    }
  }
  if (Array.isArray(row?.compliance)) {
    for (const c of row.compliance) {
      if (c?.kind) kinds.push(`compliance:${c.kind}`);
    }
  }
  return kinds;
}

/**
 * @param {string} originalDraft
 * @param {string} revisedDraft
 * @param {{ start: number, end: number, note: string }} marker
 * @param {Array<object>} concerns
 */
export function classifyMarker(originalDraft, revisedDraft, marker, concerns = []) {
  const start = Number.isFinite(marker?.start) ? marker.start : 0;
  const end = Number.isFinite(marker?.end) ? marker.end : start;
  const span = typeof revisedDraft === "string" ? revisedDraft.slice(start, end) : "";
  const note = typeof marker?.note === "string" ? marker.note : "";
  const spanStatus = markerSpanStatus(originalDraft, revisedDraft, start, end);
  const noteClaim = classifyNoteClaim(note);
  const outcome = outcomeBucket(spanStatus, noteClaim);
  const matched = matchConcernForMarker(span, originalDraft, concerns);
  const kinds = findingKindsFromConcern(matched);
  const silent = sourceIsSilent(matched?.evidence);
  return {
    start,
    end,
    span,
    note,
    spanStatus,
    noteClaim,
    outcome,
    spanExactInOriginal:
      Boolean(span) && typeof originalDraft === "string" && originalDraft.includes(span),
    statementIndex: matched?.statementIndex ?? null,
    statementText: matched?.statementText || "",
    findingKinds: kinds,
    sourceSilent: silent,
    evidenceKind: matched?.evidence?.kind || null,
  };
}

export function emptyTally() {
  return {
    markers: 0,
    [OUTCOME_CORRECT_CHANGE]: 0,
    [OUTCOME_CORRECT_KEEP]: 0,
    [OUTCOME_DEFECT]: 0,
    [OUTCOME_WRONG_KEEP_ON_CHANGE]: 0,
    [OUTCOME_AMBIGUOUS]: 0,
  };
}

export function addToTally(tally, outcome) {
  tally.markers += 1;
  if (Object.prototype.hasOwnProperty.call(tally, outcome)) tally[outcome] += 1;
  else tally[OUTCOME_AMBIGUOUS] += 1;
}

/**
 * Whether a target unsupported figure is still present in revised text.
 * keepPatterns are JS regex source strings (or RegExp). Any hit => kept.
 *
 * @param {string} text
 * @param {{ keepPatterns?: Array<string|RegExp> }|null|undefined} targetFigure
 * @returns {"kept"|"dropped"|null}
 */
export function targetFigureDisposition(text, targetFigure) {
  if (!targetFigure || !Array.isArray(targetFigure.keepPatterns) || targetFigure.keepPatterns.length === 0) {
    return null;
  }
  const source = typeof text === "string" ? text : "";
  for (const raw of targetFigure.keepPatterns) {
    const re = raw instanceof RegExp ? raw : new RegExp(raw, "i");
    if (re.test(source)) return "kept";
  }
  return "dropped";
}

/**
 * Whether a protected confirmed span is still present unchanged as a substring.
 * All preservePatterns must hit or the span is disturbed.
 *
 * @param {string} text
 * @param {{ preservePatterns?: Array<string|RegExp> }|null|undefined} spec
 * @returns {"survived"|"disturbed"|null}
 */
export function preserveSpanDisposition(text, spec) {
  const patterns = spec?.preservePatterns;
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  const source = typeof text === "string" ? text : "";
  for (const raw of patterns) {
    const re = raw instanceof RegExp ? raw : new RegExp(raw, "i");
    if (!re.test(source)) return "disturbed";
  }
  return "survived";
}
