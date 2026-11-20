/**
 * B547. The press-release dateline placeholder stays only when the source
 * lacks the city or the date.
 */
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(
  `\\b(?:\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}|(?:${MONTHS})\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})\\b`,
  "i"
);
// AUTHOR-NAME-BLIND: this finds a city after "in" or "at" so a dateline can be filled. It is not a person or an organisation.
const CITY_RE = /\b(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/;
const PLACEHOLDER_RE = /\[City\],\s*\[Date\]\.?\s*/g;

export function sourceHasCity(text) {
  return CITY_RE.test(String(text || ""));
}

export function sourceHasDate(text) {
  return DATE_RE.test(String(text || ""));
}

export function omitDatelineWhenSourceHasBoth(draft, sourceText) {
  if (typeof draft !== "string") return draft;
  const source = String(sourceText || "");
  if (!sourceHasCity(source) || !sourceHasDate(source)) return draft;
  return draft.replace(PLACEHOLDER_RE, "");
}
