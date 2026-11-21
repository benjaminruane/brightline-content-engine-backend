/**
 * A period that sits directly before the noun it describes.
 * The auto-fix leaves that sentence. Review flags it.
 */

const NOT_THE_NOUN = /^(?:the|a|an|and|or|but|of|to|in|for|with|from|by|as|is|was|were|are|be|been|being|has|have|had|will|would|that|which|who|this|these|those|it|its|their|on|at|into|over|after|before|during|when|while|if|not|no|than|then|also|only|just|so|because|about|between|among)$/i;

const PATTERNS = [
  /\bQ[1-4]\s+(?:19|20)\d{2}\s+([A-Za-z][A-Za-z-]*)/g,
  /\bH[12]\s+(?:19|20)\d{2}\s+([A-Za-z][A-Za-z-]*)/g,
  /\bFY\s?(?:19|20)\d{2}\s+([A-Za-z][A-Za-z-]*)/g,
  /\b(?:first|second|third|fourth)\s+quarter\s+of\s+(?:19|20)\d{2}\s+([A-Za-z][A-Za-z-]*)/gi,
  /\b(?:first|second)\s+half\s+of\s+(?:19|20)\d{2}\s+([A-Za-z][A-Za-z-]*)/gi,
  /\bfinancial year\s+(?:19|20)\d{2}\s+([A-Za-z][A-Za-z-]*)/gi,
];

export function scanPeriodPlacement({ statement } = {}) {
  if (typeof statement !== "string") throw new Error("scanPeriodPlacement: statement is missing");
  const hits = [];
  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    for (const match of statement.matchAll(re)) {
      const noun = match[1];
      if (NOT_THE_NOUN.test(noun)) continue;
      const quote = match[0];
      hits.push({
        quote,
        start: match.index,
        end: match.index + quote.length,
      });
    }
  }
  if (!hits.length) return [];
  const shown = hits.map((hit) => `'${hit.quote}'`).join(", ");
  const note = `Place the period after the noun it describes. ${shown} puts the period first. Write it as in 'revenue for the first quarter of 2026'.`;
  return [{
    concernCode: "period_placement",
    rule: "period_placement",
    category: "style_guide",
    note,
    concernText: note,
    text: note,
    suggestedDirection: note,
    quote: hits[0].quote,
    span: hits.map((hit) => ({ startChar: hit.start, endChar: hit.end })),
  }];
}
