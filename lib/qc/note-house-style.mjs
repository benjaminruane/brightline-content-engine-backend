/**
 * B449, B450. The craft note is product copy. Which rules are rewritten
 * comes from note-style-block.mjs, which reads the style guide. A long dash
 * is replaced everywhere, including inside a quotation. A spelled percentage
 * is not replaced inside a quotation.
 */
import { longDashHits, quotationRanges, spelledPercentHits } from "./mechanics-scan.mjs";
import { enforcedNoteStyleRuleIds } from "./note-style-block.mjs";

function insideQuotation(start, end, ranges) {
  return ranges.some(([from, to]) => start >= from && end <= to);
}

function percentSymbol(quote) {
  const number = String(quote).match(/^\d[\d.,]*/);
  if (!number) throw new Error("applyNoteHouseStyle: a percent match has no number");
  return `${number[0]}%`;
}

function replaceHits(text, hits, replacementFor) {
  const edits = hits.map((hit) => ({
    start: hit.start,
    end: hit.end,
    replacement: replacementFor(hit),
  }));
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
  }
  return out;
}

const REWRITES = {
  em_dash(text) {
    return replaceHits(text, longDashHits(text), () => "-");
  },
  percentage_notation(text) {
    const quoted = quotationRanges(text);
    const hits = spelledPercentHits(text).filter((hit) => !insideQuotation(hit.start, hit.end, quoted));
    return replaceHits(text, hits, (hit) => percentSymbol(hit.quote));
  },
  smart_quotes(text) {
    return text
      .replaceAll("\u201C", "\"")
      .replaceAll("\u201D", "\"")
      .replaceAll("\u2018", "'")
      .replaceAll("\u2019", "'");
  },
};

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
  let out = text;
  for (const id of enforcedNoteStyleRuleIds()) {
    const rewrite = REWRITES[id];
    if (!rewrite) throw new Error(`applyNoteHouseStyle: ${id} has no rewrite`);
    out = rewrite(out);
  }
  return out;
}
