export const PLACEHOLDER_GUARD_MESSAGE =
  "The rewrite came back with a placeholder in it, so your draft has not changed. Add the missing detail to the draft, or try again.";

const EXPECTED_ACTIONS = new Set(["Generate", "Rewrite", "Adapt"]);

const EXPECTED_INNER = new Set(["city", "date", "speaker name", "title", "firm name"]);

const QUOTE_RE = /\[\s*QUOTE:\s*Insert quote from\s*\[\s*Speaker Name\s*\]\s*,\s*\[\s*Title\s*\]\s*\]/gi;
const BOILER_RE = /\[\s*BOILERPLATE:\s*About\s*\[\s*Firm Name\s*\]\s*\]/gi;
const INNER_RE = /\[([A-Za-z][A-Za-z ]{0,80})\]/g;

function collect(text, pattern) {
  const ranges = [];
  const re = new RegExp(pattern.source, pattern.flags);
  for (const match of String(text ?? "").matchAll(re)) {
    ranges.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return ranges;
}

/** Bracket spans the press brief asks the draft to include. Nested inners are not listed twice. */
export function expectedPlaceholderRanges(text) {
  const raw = String(text ?? "");
  const ranges = [...collect(raw, QUOTE_RE), ...collect(raw, BOILER_RE), ...collect(raw, INNER_RE)];
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const range of ranges) {
    const inner = range.text.match(/^\[([A-Za-z][A-Za-z ]{0,80})\]$/);
    if (inner && !EXPECTED_INNER.has(inner[1].trim().toLowerCase())) continue;
    const covered = kept.some((row) => range.start >= row.start && range.end <= row.end);
    if (covered) continue;
    kept.push(range);
  }
  return kept;
}

export function placeholderGuardMessage(action) {
  if (action == null || String(action).trim() === "") return PLACEHOLDER_GUARD_MESSAGE;
  const name = String(action).trim();
  if (!EXPECTED_ACTIONS.has(name)) {
    throw new Error("placeholder guard: action is missing");
  }
  return `The ${name} came back with a placeholder in it, so your draft has not changed. Add the missing detail to the draft, or try again.`;
}

/** Bracketed letter placeholders that the brief did not ask for. Numbered citations are not placeholders. */
export function unexpectedPlaceholders(text) {
  let rest = String(text ?? "");
  for (const range of [...collect(rest, QUOTE_RE), ...collect(rest, BOILER_RE)].sort((a, b) => b.start - a.start)) {
    rest = `${rest.slice(0, range.start)} ${rest.slice(range.end)}`;
  }
  const found = [];
  for (const match of rest.matchAll(new RegExp(INNER_RE.source, INNER_RE.flags))) {
    const inner = match[1].trim().toLowerCase();
    if (!EXPECTED_INNER.has(inner)) found.push(match[0]);
  }
  return found;
}

export function draftContainsBracketedPlaceholder(text) {
  return unexpectedPlaceholders(text).length > 0;
}

/** A statement whose only words sit inside a placeholder the brief asked for. */
export function isExpectedPlaceholderStatement(text) {
  const raw = String(text ?? "");
  if (!/[A-Za-z]/.test(raw)) return false;
  let rest = raw;
  const ranges = expectedPlaceholderRanges(raw).sort((a, b) => b.start - a.start);
  for (const range of ranges) {
    rest = `${rest.slice(0, range.start)} ${rest.slice(range.end)}`;
  }
  return !/[A-Za-z]/.test(rest);
}

export function omitExpectedPlaceholderStatements(stage1Result) {
  const statements = Array.isArray(stage1Result?.statements) ? stage1Result.statements : [];
  const dropped = Array.isArray(stage1Result?.droppedNonClaims) ? [...stage1Result.droppedNonClaims] : [];
  const kept = [];
  for (const statement of statements) {
    const text = typeof statement?.text === "string" ? statement.text : "";
    if (isExpectedPlaceholderStatement(text)) {
      dropped.push({ text, reason: "expected_placeholder" });
      continue;
    }
    kept.push(statement);
  }
  return { ...(stage1Result || {}), statements: kept, droppedNonClaims: dropped };
}

export function spanInsideExpectedPlaceholder(text, start, end) {
  return expectedPlaceholderRanges(text).some((range) => start >= range.start && end <= range.end);
}

export function applyPlaceholderGuard(modelOutput, previousText, action) {
  const next = typeof modelOutput === "string" ? modelOutput : "";
  if (draftContainsBracketedPlaceholder(next)) {
    return {
      accepted: false,
      text: typeof previousText === "string" ? previousText : "",
      message: placeholderGuardMessage(action),
    };
  }
  return { accepted: true, text: next, message: null };
}
