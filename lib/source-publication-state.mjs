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

/**
 * A public request names every source public or restricted.
 * An unlabelled source is said out loud. It is not treated as public.
 * @param {unknown} sources
 * @returns {string}
 */
export function buildPublicSourceLabels(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return "";
  const lines = [];
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    const name =
      (typeof source?.label === "string" && source.label.trim()) ||
      (typeof source?.name === "string" && source.name.trim()) ||
      (typeof source?.title === "string" && source.title.trim()) ||
      `Source ${i + 1}`;
    const state = normalizePublicationState(source?.publicationState);
    if (state === "unknown") {
      console.error("[style] a source on a public draft has no publication state", name);
      lines.push(`- ${name}: unlabelled, and not a public source`);
      continue;
    }
    lines.push(`- ${name}: ${state === "published_external" ? "public" : "restricted"}`);
  }
  return [
    "Each source is public or restricted. A confidential figure (a multiple, an IRR, a DPI, a valuation, or a return) may come only from a public source.",
    ...lines,
  ].join("\n");
}
