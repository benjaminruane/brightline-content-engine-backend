// lib/output-intent.js
//
// Canonical outputType and visibility enums, display labels, and legacy alias mapping.
// SPEC X2.0: TRANSACTION_TEXT → REPORTING_COMMENTARY on read/write/response.

/** @readonly */
export const OUTPUT_TYPE = {
  REPORTING_COMMENTARY: "REPORTING_COMMENTARY",
  INVESTOR_LETTER: "INVESTOR_LETTER",
  PRESS_RELEASE: "PRESS_RELEASE",
  LINKEDIN_POST: "LINKEDIN_POST",
};

/** @readonly */
export const VISIBILITY = {
  COMPLETE: "COMPLETE",
  PUBLIC: "PUBLIC",
};

/** Legacy value: map to canonical enum for backward compatibility. Do not break existing records. */
const LEGACY_OUTPUT_TYPE_MAP = {
  TRANSACTION_TEXT: OUTPUT_TYPE.REPORTING_COMMENTARY,
  transaction_text: OUTPUT_TYPE.REPORTING_COMMENTARY,
  reporting_commentary: OUTPUT_TYPE.REPORTING_COMMENTARY,
  investor_letter: OUTPUT_TYPE.INVESTOR_LETTER,
  press_release: OUTPUT_TYPE.PRESS_RELEASE,
  linkedin_post: OUTPUT_TYPE.LINKEDIN_POST,
};

const OUTPUT_TYPE_LABELS = {
  [OUTPUT_TYPE.REPORTING_COMMENTARY]: "Reporting commentary",
  [OUTPUT_TYPE.INVESTOR_LETTER]: "Investor letter",
  [OUTPUT_TYPE.PRESS_RELEASE]: "Press release",
  [OUTPUT_TYPE.LINKEDIN_POST]: "LinkedIn post",
};

const VISIBILITY_LABELS = {
  [VISIBILITY.COMPLETE]: "Complete",
  [VISIBILITY.PUBLIC]: "Public",
};

const DEFAULT_OUTPUT_TYPE = OUTPUT_TYPE.REPORTING_COMMENTARY;
const DEFAULT_VISIBILITY = VISIBILITY.COMPLETE;

/**
 * Normalize raw outputType (from request or stored draft). Legacy values → canonical enum.
 * @param {string} [raw]
 * @returns {string} Canonical OUTPUT_TYPE enum or default
 */
export function normalizeOutputType(raw) {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_OUTPUT_TYPE;
  const upper = raw.trim().toUpperCase().replace(/-/g, "_");
  const legacy = LEGACY_OUTPUT_TYPE_MAP[raw.trim()] ?? LEGACY_OUTPUT_TYPE_MAP[upper];
  if (legacy) return legacy;
  if (OUTPUT_TYPE[upper]) return OUTPUT_TYPE[upper];
  return DEFAULT_OUTPUT_TYPE;
}

/**
 * Normalize raw visibility. Accepts "complete"|"public" or COMPLETE|PUBLIC.
 * @param {string} [raw]
 * @returns {string} Canonical VISIBILITY enum or default
 */
export function normalizeVisibility(raw) {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_VISIBILITY;
  const upper = raw.trim().toUpperCase();
  if (upper === "COMPLETE") return VISIBILITY.COMPLETE;
  if (upper === "PUBLIC") return VISIBILITY.PUBLIC;
  return DEFAULT_VISIBILITY;
}

/**
 * Deterministic display label for outputType.
 * @param {string} outputType - Canonical enum
 * @returns {string}
 */
export function getOutputTypeLabel(outputType) {
  return OUTPUT_TYPE_LABELS[outputType] ?? "Reporting commentary";
}

/**
 * Deterministic display label for visibility.
 * @param {string} visibility - Canonical enum
 * @returns {string}
 */
export function getVisibilityLabel(visibility) {
  return VISIBILITY_LABELS[visibility] ?? "Complete";
}

/**
 * Build meta.outputIntent for Generate/Rewrite/Adapt responses.
 * @param {string} outputType - Canonical enum
 * @param {string} visibility - Canonical enum
 * @returns {{ outputType: string, visibility: string, outputTypeLabel: string, visibilityLabel: string }}
 */
export function buildOutputIntent(outputType, visibility) {
  const ot = normalizeOutputType(outputType);
  const vis = normalizeVisibility(visibility);
  return {
    outputType: ot,
    visibility: vis,
    outputTypeLabel: getOutputTypeLabel(ot),
    visibilityLabel: getVisibilityLabel(vis),
  };
}

/**
 * Deterministic prompt/template guidance by (outputType, visibility). Structure + tone only; no new intelligence.
 * @param {string} outputType - Canonical enum
 * @param {string} visibility - Canonical enum
 * @returns {string} Optional guidance snippet for system/user prompt
 */
export function getPromptGuidance(outputType, visibility) {
  const ot = normalizeOutputType(outputType);
  const vis = normalizeVisibility(visibility);
  const parts = [];
  if (ot === "INVESTOR_LETTER") {
    parts.push(
      "Format as an investor letter. Open with 'Dear Investors,'. Use first-person plural for the GP's voice (we believe, we expect). Extract all available supporting detail from sources. Narrative arc: context, decision, thesis, evidence, outlook."
    );
  } else if (ot === "PRESS_RELEASE") {
    parts.push(
      "Format as a press release. Open with FOR IMMEDIATE RELEASE. Include headline, dateline, lead paragraph (who/what/when). Include quote if attribution provided; otherwise insert placeholder. Close with boilerplate placeholder."
    );
  } else if (ot === "LINKEDIN_POST") {
    parts.push(
      "Format as a LinkedIn post. Use first-person plural (we, our). Strong opening hook. Short paragraphs or thesis bullet list. If a URL is provided, include it as the final line."
    );
  } else {
    parts.push("Format as reporting commentary: clear, factual, investment-grade prose.");
  }
  if (vis === "PUBLIC") {
    parts.push("Use publicly safe wording; avoid internal-only detail.");
  } else {
    parts.push("Complete version: full internal brief, all relevant detail.");
  }
  return parts.join(" ");
}

export {
  DEFAULT_OUTPUT_TYPE,
  DEFAULT_VISIBILITY,
};
