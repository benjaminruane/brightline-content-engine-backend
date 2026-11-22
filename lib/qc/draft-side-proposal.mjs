/**
 * B421. A proposal whose target is the draft.
 * No model call and no source lookup.
 * Offered only when the direction names the exact span.
 */

function spanOf(concern) {
  const span = concern?.span;
  const first = Array.isArray(span) ? span[0] : span;
  if (!first || typeof first !== "object") return null;
  const startChar = Number(first.startChar);
  const endChar = Number(first.endChar);
  if (!Number.isInteger(startChar) || !Number.isInteger(endChar)) return null;
  return { startChar, endChar };
}

function parseReplacement(direction) {
  const text = String(direction ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
  const match = text.match(/\b(?:Replace|Change)\s+(['"])([\s\S]*?)\1\s+(?:with|to)\s+(['"])([\s\S]*?)\3/i);
  if (!match) return null;
  return { from: match[2], to: match[4] };
}

function fitReplacementCase(statement, start, replacement) {
  const text = String(replacement || "");
  if (!text || start <= 0) return text;
  const before = String(statement || "").slice(0, start);
  if (/[.!?]["']?\s*$/.test(before)) return text;
  const splitAt = text.search(/[^A-Za-z]/);
  const word = splitAt === -1 ? text : text.slice(0, splitAt);
  if (!word) return text;
  const letters = [...word];
  const allCaps = letters.every((ch) => ch < "a" || ch > "z");
  const innerCapital = letters.slice(1).some((ch) => ch >= "A" && ch <= "Z");
  if (allCaps || innerCapital) return text;
  const seen = String(statement || "").split(/[^A-Za-z]+/).includes(word);
  const onlyAtStart = new RegExp(`(?:^|[.!?]\\s+)${word}\\b`).test(statement);
  if (seen && !onlyAtStart) return text;
  return `${word[0].toLowerCase()}${text.slice(1)}`;
}

/**
 * @returns {{ offered: true, proposedChange: string, resultingSentence: string, substitution: { start: number, end: number, replacement: string } } | { offered: false, refused: "a"|"b"|"c"|"d"|"e" }}
 */
export function draftSideProposal({ concern, statementText } = {}) {
  const statement = typeof statementText === "string" ? statementText : "";
  const span = spanOf(concern);
  if (!span) return { offered: false, refused: "a" };
  const slice = statement.slice(span.startChar, span.endChar);
  if (!slice) return { offered: false, refused: "b" };
  const parsed = parseReplacement(concern?.suggestedDirection);
  if (!parsed) return { offered: false, refused: "c" };
  if (parsed.from !== slice) return { offered: false, refused: "d" };
  if (parsed.to === parsed.from) return { offered: false, refused: "e" };
  const replacement = fitReplacementCase(statement, span.startChar, parsed.to);
  const resultingSentence = statement.slice(0, span.startChar) + replacement + statement.slice(span.endChar);
  return {
    offered: true,
    proposedChange: `Replace '${parsed.from}' with '${parsed.to}'.`,
    resultingSentence,
    substitution: { start: span.startChar, end: span.endChar, replacement },
  };
}

export function tallyDraftSide(concerns, statementText) {
  const tally = { offered: 0, a: 0, b: 0, c: 0, d: 0, e: 0 };
  for (const concern of Array.isArray(concerns) ? concerns : []) {
    const result = draftSideProposal({ concern, statementText });
    if (result.offered) tally.offered += 1;
    else tally[result.refused] += 1;
  }
  return tally;
}
