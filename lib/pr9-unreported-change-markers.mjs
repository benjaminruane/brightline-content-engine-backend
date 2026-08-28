/**
 * Markers for changes the model made but never reported.
 *
 * c1fb2c1 measured the reviser deleting "and highly regarded" from the
 * author's draft in 3 runs of 3, with no marker. Every safeguard we have
 * inspects markers, so a change carrying no marker is invisible to all of
 * them. This closes that by construction: code diffs the model's output
 * against the original and emits a marker for every changed region the model
 * did not declare.
 *
 * BASELINE, and it is the whole design. The comparison runs against the
 * model's RAW output, taken straight from parseSoftenedMarkers, before any
 * code stage has touched the text. Five stages downstream of that point
 * mutate the draft — terminal punctuation, house style, cut punctuation,
 * deterministic removal — and comparing after any of them would report code's
 * own work as an unreported model edit.
 *
 * One LCS alignment is computed for the whole draft and reused for every
 * region and every marker. markerSpanAlignment recomputes the full O(n*m)
 * table per marker, which is why it is not used here.
 */

import { alignRevisedToOriginal, tokenizeWords } from "./pr9-marker-span-status.mjs";
import { buildNoteBodyFromDiff } from "./pr9-note-what-from-diff.mjs";
import { isHouseStyleOnlyDifference, sentenceBoundsContaining } from "./pr9-marker-honesty.mjs";

/** Marker note when nothing explains why the reviser made the change. */
export const NO_RECORDED_REASON = "the reviser made this change without a recorded reason";

const FIRST_PERSON_RE = /^(we|our|ours|us|ourselves|i|my|mine|me)$/i;

const bare = (token) => String(token || "").replace(/[^\w']/g, "");

/**
 * True when a region is the reviser complying with a HOUSE STYLE rule rather
 * than concealing an edit.
 *
 * The prompt requires house style over the ENTIRE revised draft, "not only the
 * flagged statements" (build-revision-prompt.mjs L1057), and craft rule (f)
 * forbids a marker for it. Marking these would contradict the prompt and, on
 * the artefacts measured, would put a spurious marker on most runs.
 *
 * Only SUBSTITUTIONS qualify. A region with no revised text is a deletion, and
 * a deletion is never house style however first-person the original was —
 * otherwise cutting "we recommend approval" would vanish silently, which is
 * the exact defect this module exists to catch.
 */
function isHouseStyleMandated(origTokens, revTokens, deletionOnly) {
  // A deletion-only region has no revised text of its own; its span is the
  // surviving anchor word, which says nothing about house style.
  if (deletionOnly || revTokens.length === 0) return false;

  const origText = origTokens.map((t) => t.text).join(" ");
  const revText = revTokens.map((t) => t.text).join(" ");
  if (isHouseStyleOnlyDifference(origText, revText)) return true;

  // first_person_plural: "we believe" -> "Halden Group believes".
  const hadFirstPerson = origTokens.some((t) => FIRST_PERSON_RE.test(bare(t.text)));
  if (!hadFirstPerson) return false;
  return !revTokens.some((t) => FIRST_PERSON_RE.test(bare(t.text)));
}

/**
 * Anchors: revised token indices that align to an original token, in order.
 *
 * @param {Array<number|null>} revToOrig
 * @returns {Array<number>}
 */
function alignedRevisedIndices(revToOrig) {
  const out = [];
  for (let j = 0; j < revToOrig.length; j++) {
    if (revToOrig[j] != null) out.push(j);
  }
  return out;
}

/**
 * The original-token region a marker covers, derived from the shared
 * alignment rather than a fresh one.
 *
 * Mirrors markerSpanAlignment: the region is every original token strictly
 * between the nearest aligned tokens fully left and fully right of the span.
 * A CUT marker sits on a surviving remnant beside the text it removed, so the
 * removed tokens land in this region and the marker correctly counts as
 * covering them.
 *
 * @returns {{ origFrom: number, origTo: number, revFrom: number, revTo: number }}
 */
function markerCoverage(origT, revT, revToOrig, start, end) {
  let left = -1;
  for (let j = 0; j < revT.length; j++) {
    if (revT[j].end <= start) left = j;
  }
  let right = -1;
  for (let j = 0; j < revT.length; j++) {
    if (revT[j].start >= end) {
      right = j;
      break;
    }
  }

  let origLeft = -1;
  if (left >= 0) {
    for (let j = left; j >= 0; j--) {
      if (revToOrig[j] != null) {
        origLeft = revToOrig[j];
        break;
      }
    }
  }
  let origRight = origT.length;
  if (right >= 0) {
    for (let j = right; j < revT.length; j++) {
      if (revToOrig[j] != null) {
        origRight = revToOrig[j];
        break;
      }
    }
  }

  const revFrom = start;
  const revTo = end;
  return { origFrom: origLeft + 1, origTo: origRight, revFrom, revTo };
}

/**
 * Every changed region between the original and the model's raw output.
 *
 * A region is the gap between two consecutive alignment anchors that contains
 * inserted revised tokens, deleted original tokens, or both. Pure deletions
 * have no revised text of their own, so they anchor on the preceding surviving
 * word, the same convention CUT markers already use.
 *
 * @returns {Array<{ revStart: number, revEnd: number, origFrom: number, origTo: number, deletionOnly: boolean }>}
 */
export function changedRegions(original, revised) {
  const origT = tokenizeWords(original);
  const revT = tokenizeWords(revised);
  const revToOrig = alignRevisedToOriginal(origT, revT);
  const anchors = alignedRevisedIndices(revToOrig);

  const regions = [];
  // Walk the gaps between anchors, including the two open ends.
  const bounds = [-1, ...anchors, revT.length];
  for (let k = 0; k < bounds.length - 1; k++) {
    const prevRev = bounds[k];
    const nextRev = bounds[k + 1];

    const insertedFrom = prevRev + 1;
    const insertedTo = nextRev; // exclusive
    const hasInsert = insertedTo > insertedFrom;

    const origPrev = prevRev >= 0 ? revToOrig[prevRev] : -1;
    const origNext = nextRev < revT.length ? revToOrig[nextRev] : origT.length;
    const delFrom = origPrev + 1;
    const delTo = origNext; // exclusive
    const hasDelete = delTo > delFrom;

    if (!hasInsert && !hasDelete) continue;

    let revStart;
    let revEnd;
    if (hasInsert) {
      revStart = revT[insertedFrom].start;
      revEnd = revT[insertedTo - 1].end;
    } else if (prevRev >= 0) {
      revStart = revT[prevRev].start;
      revEnd = revT[prevRev].end;
    } else if (nextRev < revT.length) {
      revStart = revT[nextRev].start;
      revEnd = revT[nextRev].end;
    } else {
      continue; // everything deleted; nothing left to anchor on
    }

    regions.push({
      revStart,
      revEnd,
      origFrom: delFrom,
      origTo: delTo,
      deletionOnly: !hasInsert,
    });
  }

  return { regions, origT, revT, revToOrig };
}

/**
 * Coalesce regions that fall in the same sentence of the revised draft.
 *
 * Word-level granularity alone would scatter several markers across one
 * rewritten sentence, which reads as spam rather than as a finding. The
 * sentence is the unit a reviewer acts on, so it is the unit we coalesce to;
 * the marker span still covers only the changed extent, not the sentence.
 */
export function coalesceBySentence(revised, regions) {
  if (regions.length === 0) return [];
  const out = [];
  let current = null;
  let currentBounds = null;

  for (const r of regions) {
    const bounds = sentenceBoundsContaining(revised, r.revStart, r.revEnd);
    if (
      current &&
      currentBounds &&
      bounds &&
      bounds.start === currentBounds.start &&
      bounds.end === currentBounds.end
    ) {
      current.revStart = Math.min(current.revStart, r.revStart);
      current.revEnd = Math.max(current.revEnd, r.revEnd);
      current.origFrom = Math.min(current.origFrom, r.origFrom);
      current.origTo = Math.max(current.origTo, r.origTo);
      current.deletionOnly = current.deletionOnly && r.deletionOnly;
      continue;
    }
    current = { ...r };
    currentBounds = bounds;
    out.push(current);
  }
  return out;
}

/**
 * Generate markers for model changes that carry no marker of their own.
 *
 * @param {string} original       the author's draft
 * @param {{ revisedDraft: string, markers: Array<object> }} parsed
 *        parseSoftenedMarkers output, untouched by any code stage
 * @param {{ concerns?: Array<object>, traceId?: string, log?: Function }} [opts]
 * @returns {{ revisedDraft: string, markers: Array<object>, unreportedEvents: Array<object> }}
 */
export function applyUnreportedChangeMarkers(original, parsed, opts = {}) {
  const revised = typeof parsed?.revisedDraft === "string" ? parsed.revisedDraft : "";
  const incoming = Array.isArray(parsed?.markers) ? parsed.markers : [];
  const originalText = typeof original === "string" ? original : "";

  if (!originalText || !revised) {
    return { revisedDraft: revised, markers: incoming, unreportedEvents: [] };
  }

  const { regions, origT, revT, revToOrig } = changedRegions(originalText, revised);
  if (regions.length === 0) {
    return { revisedDraft: revised, markers: incoming, unreportedEvents: [] };
  }

  const declared = incoming.map((m) =>
    markerCoverage(origT, revT, revToOrig, m.start ?? 0, m.end ?? 0)
  );

  const isDeclared = (region) =>
    declared.some(
      (d) =>
        // Overlap in revised text, or in the original tokens the marker covers.
        (Math.min(d.revTo, region.revEnd) - Math.max(d.revFrom, region.revStart) > 0) ||
        (Math.min(d.origTo, region.origTo) - Math.max(d.origFrom, region.origFrom) > 0)
    );

  const revTokensIn = (region) =>
    revT.filter((t) => t.start < region.revEnd && t.end > region.revStart);

  const undeclared = coalesceBySentence(
    revised,
    regions.filter(
      (r) =>
        !isDeclared(r) &&
        !isHouseStyleMandated(origT.slice(r.origFrom, r.origTo), revTokensIn(r), r.deletionOnly)
    )
  );
  if (undeclared.length === 0) {
    return { revisedDraft: revised, markers: incoming, unreportedEvents: [] };
  }

  const warn = typeof opts.log === "function" ? opts.log : console.warn;
  const traceId = opts.traceId || "";
  const generated = [];
  const unreportedEvents = [];

  for (const region of undeclared) {
    const built = buildNoteBodyFromDiff({
      original: originalText,
      revised,
      start: region.revStart,
      end: region.revEnd,
      note: "",
      concerns: opts.concerns,
    });

    const body = built.reason ? built.body : `${built.clause} - ${NO_RECORDED_REASON}`;

    // A deletion-only region's span is the surviving anchor word. Reporting
    // that would name the text that stayed rather than the text that went, so
    // log the removed original instead.
    const regionText = region.deletionOnly
      ? origT
          .slice(region.origFrom, region.origTo)
          .map((t) => t.text)
          .join(" ")
      : revised.slice(region.revStart, region.revEnd);

    generated.push({
      start: region.revStart,
      end: region.revEnd,
      note: body,
      intent: region.deletionOnly ? "CUT" : "CHANGED",
      // Lets the frontend and a future accept-and-reject tell a declared
      // change from a concealed one. Never stated in the note text.
      generated: true,
      generatedReason: "unreported_change",
    });

    unreportedEvents.push({
      regionText,
      concernKind: built.reasonSource === "concern" ? "concern" : "none",
      note: body,
    });

    warn(
      `[unreported-change] trace=${traceId || "suggest-revision"} ` +
        `region=${JSON.stringify(regionText.slice(0, 80))} ` +
        `concern=${built.reasonSource === "concern" ? "concern" : "none"}`
    );
  }

  const markers = [...incoming, ...generated].sort((a, b) => a.start - b.start);
  return { revisedDraft: revised, markers, unreportedEvents };
}
