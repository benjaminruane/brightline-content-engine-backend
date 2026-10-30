/**
 * B449. The craft note is product copy. Long dashes become hyphens
 * everywhere, including inside a quotation. A spelled percentage becomes
 * the % symbol, except inside a quotation, where the note may be quoting
 * the draft. Quotation ranges come from the mechanics scan.
 */
import { longDashHits, quotationRanges, spelledPercentHits } from "./mechanics-scan.mjs";

function insideQuotation(start, end, ranges) {
  return ranges.some(([from, to]) => start >= from && end <= to);
}

function percentSymbol(quote) {
  const number = String(quote).match(/^\d[\d.,]*/);
  if (!number) throw new Error("applyNoteHouseStyle: a percent match has no number");
  return `${number[0]}%`;
}

/** Counts on the text as given, before substitution. */
export function noteHouseStyleCounts(text) {
  if (typeof text !== "string") throw new Error("noteHouseStyleCounts: text is missing");
  const quoted = quotationRanges(text);
  const percents = spelledPercentHits(text);
  let percentWords = 0;
  let quotedPercentWords = 0;
  for (const hit of percents) {
    if (insideQuotation(hit.start, hit.end, quoted)) quotedPercentWords += 1;
    else percentWords += 1;
  }
  const dashes = longDashHits(text);
  let emDashes = 0;
  let enDashes = 0;
  for (const hit of dashes) {
    if (hit.quote === "\u2014") emDashes += 1;
    else if (hit.quote === "\u2013") enDashes += 1;
  }
  return { emDashes, enDashes, dashes: dashes.length, percentWords, quotedPercentWords };
}

/** The note the reader sees. A missing text is refused. */
export function applyNoteHouseStyle(text) {
  if (typeof text !== "string") throw new Error("applyNoteHouseStyle: text is missing");
  const quoted = quotationRanges(text);
  const percents = spelledPercentHits(text).filter((hit) => !insideQuotation(hit.start, hit.end, quoted));
  const dashes = longDashHits(text);
  const edits = [
    ...dashes.map((hit) => ({ start: hit.start, end: hit.end, replacement: "-" })),
    ...percents.map((hit) => ({ start: hit.start, end: hit.end, replacement: percentSymbol(hit.quote) })),
  ].sort((a, b) => b.start - a.start);
  let out = text;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
  }
  return out;
}
