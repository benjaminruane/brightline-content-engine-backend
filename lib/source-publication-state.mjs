// R6.4a: Per-source publication state for Compliance calibration.

/** @typedef {"published_external"|"restricted"|"unknown"} PublicationState */

/** @type {ReadonlySet<string>} */
const VALID_PUBLICATION_STATES = new Set(["published_external", "restricted", "unknown"]);

/**
 * @param {unknown} value
 * @returns {PublicationState}
 */
export function normalizePublicationState(value) {
  const v = typeof value === "string" ? value.trim() : "";
  return VALID_PUBLICATION_STATES.has(v) ? /** @type {PublicationState} */ (v) : "unknown";
}

/**
 * @param {unknown} sources
 * @returns {string}
 */
export function buildSourcePublicationStateBlock(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return "";
  const lines = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const state = normalizePublicationState(s?.publicationState);
    if (state === "unknown") continue;
    const name =
      (typeof s?.label === "string" && s.label.trim()) ||
      (typeof s?.name === "string" && s.name.trim()) ||
      (typeof s?.title === "string" && s.title.trim()) ||
      `Source ${i + 1}`;
    lines.push(`- source_${i + 1} (${name}): ${state}`);
  }
  if (lines.length === 0) return "";
  return `\n\nSOURCE PUBLICATION STATE\n${lines.join("\n")}`;
}
