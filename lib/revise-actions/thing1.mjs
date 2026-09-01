/**
 * Shortest locatable Review quote (thing 1). Copied counting rules, not the harness.
 */
export const PHRASE_RATIO_LINE = 0.8;
const MIN_QUOTE_LEN = 4;

function collapse(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuotes(text) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

export function excerptPassage(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.passage === "string" && value.passage.trim()) {
    return value.passage.trim();
  }
  return null;
}

function extractQuotedSnippets(text) {
  const normalized = normalizeQuotes(String(text ?? ""));
  const rx = /(["'])([^"']+)\1/g;
  const out = [];
  let match;
  while ((match = rx.exec(normalized))) {
    const quote = collapse(match[2]);
    if (quote) out.push(quote);
  }
  return out;
}

function locateInStatement(quote, statement) {
  const needle = collapse(normalizeQuotes(quote));
  if (!needle || needle.length < MIN_QUOTE_LEN) return null;
  const hay = String(statement ?? "");
  const at = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return null;
  return {
    startChar: at,
    endChar: at + needle.length,
    quote: hay.slice(at, at + needle.length),
  };
}

function candidateRecord(loc, source, statement) {
  const stmtLen = String(statement ?? "").length;
  const length = loc.endChar - loc.startChar;
  return {
    quote: loc.quote,
    startChar: loc.startChar,
    endChar: loc.endChar,
    length,
    statementLength: stmtLen,
    ratio: stmtLen > 0 ? length / stmtLen : null,
    source,
  };
}

function dedupeCandidates(list) {
  const seen = new Set();
  const out = [];
  for (const row of list) {
    const key = `${row.startChar}:${row.endChar}:${row.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function thing1FromCandidates(candidates, statement) {
  const stmt = String(statement ?? "");
  const proper = candidates.filter((c) => c.length < stmt.length);
  const chosen = (proper.length ? proper : candidates).slice().sort((a, b) => a.length - b.length)[0] || null;
  if (!chosen) {
    return { state: "NONE", chosen: null };
  }
  const whole =
    chosen.length >= stmt.length ||
    chosen.ratio >= PHRASE_RATIO_LINE ||
    (chosen.startChar === 0 && chosen.endChar >= stmt.length);
  if (whole) return { state: "WHOLE_STATEMENT", chosen };
  return { state: "PHRASE", chosen };
}

export function publicThing1(chosen) {
  if (!chosen) return null;
  return {
    quote: chosen.quote,
    startChar: chosen.startChar,
    endChar: chosen.endChar,
  };
}

export function evidenceCandidates(card, statement) {
  const out = [];
  for (const span of Array.isArray(card?.unsupportedSpans) ? card.unsupportedSpans : []) {
    if (typeof span?.text === "string" && span.text) {
      const loc =
        Number.isFinite(span.start) && Number.isFinite(span.end)
          ? {
              startChar: span.start,
              endChar: span.end,
              quote: statement.slice(span.start, span.end) || span.text,
            }
          : locateInStatement(span.text, statement);
      if (loc) out.push(candidateRecord(loc, "unsupportedSpan", statement));
    }
  }
  for (const quote of extractQuotedSnippets(card?.evidenceSummary)) {
    const loc = locateInStatement(quote, statement);
    if (loc) out.push(candidateRecord(loc, "evidenceSummary_quote", statement));
  }
  for (const quote of extractQuotedSnippets(card?.reasoningParagraph)) {
    const loc = locateInStatement(quote, statement);
    if (loc) out.push(candidateRecord(loc, "reasoningParagraph_quote", statement));
  }
  return dedupeCandidates(out);
}

export function concernCandidates(concern, statement) {
  const out = [];
  const spans = Array.isArray(concern?.span) ? concern.span : concern?.span ? [concern.span] : [];
  for (const span of spans) {
    if (!Number.isFinite(span?.startChar) || !Number.isFinite(span?.endChar)) continue;
    const quote = statement.slice(span.startChar, span.endChar);
    out.push(
      candidateRecord(
        { startChar: span.startChar, endChar: span.endChar, quote },
        span.source || "span_field",
        statement
      )
    );
  }
  for (const quote of extractQuotedSnippets(concern?.note)) {
    const loc = locateInStatement(quote, statement);
    if (loc) out.push(candidateRecord(loc, "note_quote", statement));
  }
  for (const quote of extractQuotedSnippets(concern?.suggestedDirection)) {
    const loc = locateInStatement(quote, statement);
    if (loc) out.push(candidateRecord(loc, "direction_quote", statement));
  }
  return dedupeCandidates(out);
}
