/**
 * Refuse a reviewer-assessment call when a classified finding has no text.
 * Same class as the readiness allowlist in synthesize-review.
 */

export function findingTextIsBlank(value) {
  return typeof value !== "string" || value.trim().length === 0;
}

const FINDING_LISTS = [
  ["editorialConcerns", "concern"],
  ["complianceConcerns", "concern"],
  ["notSupportedStatements", "evidenceFinding"],
  ["conflictingStatements", "evidenceFinding"],
  ["partialStatements", "evidenceFinding"],
];

export function synthesisFindingCensus(body) {
  const src = body && typeof body === "object" ? body : {};
  let blank = 0;
  let usable = 0;
  for (const [listKey, textKey] of FINDING_LISTS) {
    const arr = src[listKey];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      if (findingTextIsBlank(item[textKey])) blank += 1;
      else usable += 1;
    }
  }
  return { blank, usable };
}

export function synthesisPayloadHasBlankFinding(body) {
  return synthesisFindingCensus(body).blank > 0;
}
