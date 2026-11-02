/**
 * B465. A quoted span that is the source's own words.
 * Line breaks are collapsed before the check. The words are not changed.
 * A quote that is not in the passage is left in place for the guard.
 */

export function sourceCorpus(card) {
  return [card?.primaryExcerpt, card?.primaryExcerptText, card?.sourceQuote, card?.conflictExcerpt]
    .filter((text) => typeof text === "string" && text.trim());
}

export function quotedSpans(text) {
  const body = String(text || "");
  const found = [];
  const doubles = /"([^"]+)"/g;
  let match;
  while ((match = doubles.exec(body))) {
    found.push({ start: match.index, end: match.index + match[0].length, inner: match[1] });
  }
  const singles = /(?:^|[\s([\]])('([^']+)')/g;
  while ((match = singles.exec(body))) {
    const token = match[1];
    const start = match.index + match[0].length - token.length;
    found.push({ start, end: start + token.length, inner: match[2] });
  }
  return found;
}

function flat(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function quoteIsVerbatimSource(inner, corpus) {
  const needle = flat(inner);
  if (needle.length < 2) return false;
  const list = Array.isArray(corpus) ? corpus : [];
  return list.some((part) => flat(part).includes(needle));
}

/**
 * Replace a quoted span with spaces when the span is in the passage.
 * The product's own words stay where they are.
 */
export function maskVerbatimQuotes(text, corpus) {
  const body = String(text || "");
  const spans = quotedSpans(body).filter((span) => quoteIsVerbatimSource(span.inner, corpus));
  if (!spans.length) return body;
  let out = body;
  for (const span of spans.sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, span.start)}${" ".repeat(span.end - span.start)}${out.slice(span.end)}`;
  }
  return out;
}
