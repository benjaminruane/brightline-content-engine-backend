/**
 * Draft coverage after Stage 1. Does not split the draft.
 * Cards and disclosed drops carry character positions. Uncovered runs are
 * the remainder, ignoring whitespace-only gaps.
 *
 * Threshold: name every non-whitespace uncovered run. A percent bar would
 * hide B248 (one omitted sentence). The Shopify memo's 5.8% is the exhibit,
 * not a hurdle.
 */

export const DROPPED_NOT_A_CLAIM_REASON = "not_a_claim";
export const DROPPED_NOT_A_CLAIM_TEXT =
  "Not checked as a claim (heading, salutation, or transition).";

function asSpan(row) {
  const start = Number(row?.charStart ?? row?.startChar ?? row?.start);
  const end = Number(row?.charEnd ?? row?.endChar ?? row?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

function mergeIntervals(spans) {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (!last || span.start > last.end) {
      out.push({ start: span.start, end: span.end });
    } else if (span.end > last.end) {
      last.end = span.end;
    }
  }
  return out;
}

function uncoveredRuns(draftLen, covered) {
  const runs = [];
  let cursor = 0;
  for (const span of covered) {
    const start = Math.max(0, Math.min(draftLen, span.start));
    const end = Math.max(0, Math.min(draftLen, span.end));
    if (start > cursor) runs.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < draftLen) runs.push({ start: cursor, end: draftLen });
  return runs;
}

function droppedRow(row) {
  const span = asSpan(row);
  const text = typeof row?.text === "string" ? row.text : "";
  if (!span && !text.trim()) return null;
  const reason =
    typeof row?.reason === "string" && row.reason.trim()
      ? row.reason.trim()
      : DROPPED_NOT_A_CLAIM_REASON;
  const reasonText =
    typeof row?.reasonText === "string" && row.reasonText.trim()
      ? row.reasonText.trim()
      : DROPPED_NOT_A_CLAIM_TEXT;
  return {
    text,
    charStart: span ? span.start : 0,
    charEnd: span ? span.end : 0,
    reason,
    reasonText,
  };
}

/**
 * @param {{
 *   draftText: string,
 *   cards?: Array<{ charStart?: number, charEnd?: number, draftSpan?: { startChar?: number, endChar?: number } }>,
 *   dropped?: Array<{ text?: string, charStart?: number, charEnd?: number, reason?: string, reasonText?: string }>,
 * }} params
 */
export function computeDraftCoverage({ draftText, cards = [], dropped = [] } = {}) {
  if (typeof draftText !== "string") {
    console.warn("[draft-coverage] missing draftText at writer");
    return {
      dropped: [],
      uncovered: [],
      droppedCount: 0,
      uncoveredCount: 0,
      uncoveredChars: 0,
      draftChars: 0,
    };
  }

  const draftChars = draftText.length;
  const droppedRows = (Array.isArray(dropped) ? dropped : []).map(droppedRow).filter(Boolean);

  const covered = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    const fromCard = asSpan(card);
    const fromDraftSpan = asSpan({
      start: card?.draftSpan?.startChar,
      end: card?.draftSpan?.endChar,
    });
    const span = fromCard || fromDraftSpan;
    if (span) covered.push(span);
  }
  for (const row of droppedRows) {
    const span = asSpan(row);
    if (span) covered.push(span);
  }

  const uncovered = [];
  for (const run of uncoveredRuns(draftChars, mergeIntervals(covered))) {
    const text = draftText.slice(run.start, run.end);
    if (!/\S/.test(text)) continue;
    uncovered.push({
      text,
      charStart: run.start,
      charEnd: run.end,
    });
  }

  const uncoveredChars = uncovered.reduce((sum, row) => sum + (row.charEnd - row.charStart), 0);

  return {
    dropped: droppedRows,
    uncovered,
    droppedCount: droppedRows.length,
    uncoveredCount: uncovered.length,
    uncoveredChars,
    draftChars,
  };
}

export function coverageIsWorthNaming(coverage) {
  if (!coverage || typeof coverage !== "object") return false;
  return (coverage.droppedCount || 0) > 0 || (coverage.uncoveredCount || 0) > 0;
}
