/**
 * House style for characters the model sometimes writes as typography.
 * Smart quotes become straight quotes. En and em dashes become hyphens.
 */
export function normalizePgHouseStyleCharacters(text) {
  return String(text ?? "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-");
}
