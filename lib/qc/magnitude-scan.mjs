/**
 * B560. The billions rule is a deterministic scan. It applies from 1,000 million.
 * A percentage, and an amount below that line, are outside its scope.
 */
import { quotationRanges } from "./mechanics-scan.mjs";

const CURRENCY = "USD|EUR|GBP|CHF|AUD|CAD|SEK";
const MILLION = new RegExp(`\\b(${CURRENCY})\\s+(\\d{1,3}(?:[,\\s']\\d{3})+|\\d+)(?:\\.\\d+)?\\s+million\\b`, "gi");
const SCOPE = "An amount of 1,000 million or more is written in billions to one decimal when the account chooses billions. Otherwise it stays in millions.";

function insideQuote(start, end, ranges) {
  return ranges.some(([from, to]) => start >= from && end <= to);
}

export function scanMagnitude({ statement, houseStyle } = {}) {
  const text = typeof statement === "string" ? statement : "";
  if (!text.trim()) return [];
  const choice = houseStyle && typeof houseStyle === "object" ? houseStyle.magnitude : "";
  if (choice === "millions") return [];
  const quoted = quotationRanges(text);
  const hits = [];
  for (const match of text.matchAll(MILLION)) {
    const millions = Number(String(match[2]).replace(/[,'\s]/g, ""));
    if (!Number.isFinite(millions) || millions < 1000) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (insideQuote(start, end, quoted)) continue;
    hits.push({ quote: match[0], start, end });
  }
  if (!hits.length) return [];
  const quotedAmounts = hits.map((hit) => `'${hit.quote}'`).join(" and ");
  const note = `${quotedAmounts} ${hits.length === 1 ? "is" : "are"} 1,000 million or more. ${SCOPE}`;
  return [{
    concernCode: "magnitude",
    rule: "magnitude",
    category: "style_guide",
    severity: "soft_concern",
    note,
    concernText: note,
    text: note,
    suggestedDirection: SCOPE,
    quote: hits[0].quote,
    span: hits.map((hit) => ({ startChar: hit.start, endChar: hit.end })),
  }];
}
