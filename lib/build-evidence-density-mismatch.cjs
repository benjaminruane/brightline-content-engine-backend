// lib/build-evidence-density-mismatch.cjs
// A4.13: Evidence Judgement Phase 2 — density mismatch (claim vs evidence).
// Sync, deterministic, read-only on stmt. Additive meta only.

const LEADERSHIP_SUPERLATIVE = [
  "leading", "best", "top", "key", "primary", "dominant", "premier",
  "largest", "strongest", "highest", "major", "critical", "core", "pivotal"
];
const CERTAINTY_TOKENS = [
  "will", "clearly", "definitively", "undoubtedly", "proven", "certain", "guarantee"
];
const MAGNITUDE_WORDS = [
  "significant", "substantial", "major", "strong", "high", "considerable", "material"
];

function hasWord(text, words) {
  if (typeof text !== "string" || !Array.isArray(words)) return false;
  const lower = text.toLowerCase();
  for (const w of words) {
    if (typeof w !== "string") continue;
    const re = new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    if (re.test(lower)) return true;
  }
  return false;
}

/**
 * Build density mismatch meta for a statement (claim density vs evidence density).
 * @param {Object} stmt - Full statement object (read-only)
 * @returns {{ densityMismatch: { isMismatch: boolean, direction: string|null, claimDensity: number, evidenceDensity: number, reason: string|null } }}
 */
function buildEvidenceDensityMismatch(stmt) {
  const defaultMismatch = {
    isMismatch: false,
    direction: null,
    claimDensity: 0,
    evidenceDensity: 0,
    reason: null,
  };
  try {
    if (stmt == null || typeof stmt !== "object") return { densityMismatch: defaultMismatch };
    const meta = stmt.meta;
    if (meta == null || typeof meta !== "object") return { densityMismatch: defaultMismatch };

    const text = typeof stmt.text === "string" ? stmt.text : "";
    const textLower = text.toLowerCase();

    // --- claimDensity (0–3) ---
    let claimDensity = 0;
    if (hasWord(textLower, LEADERSHIP_SUPERLATIVE)) claimDensity += 1;
    if (hasWord(textLower, CERTAINTY_TOKENS)) claimDensity += 1;
    const numberCount = (text.match(/\d+/g) || []).length;
    const hasMagnitude = hasWord(textLower, MAGNITUDE_WORDS);
    if (numberCount >= 2 || hasMagnitude) claimDensity += 1;

    // --- evidenceDensity (0–3) ---
    const supporting = typeof meta.supportTopology?.supportingSourceCount === "number"
      ? meta.supportTopology.supportingSourceCount
      : 0;
    const citationsArr = Array.isArray(stmt.assessment?.citations) ? stmt.assessment.citations : [];
    const citationsLen = citationsArr.length;

    let evidenceDensity = 0;
    if (supporting >= 3) evidenceDensity += 2;
    else if (supporting === 2) evidenceDensity += 1;
    if (citationsLen >= 2) evidenceDensity += 1;

    // --- rules ---
    const overclaim = claimDensity >= 2 && evidenceDensity <= 1;
    const underclaim = claimDensity === 0 && evidenceDensity >= 3;

    let isMismatch = overclaim || underclaim;
    let direction = null;
    let reason = null;
    if (overclaim) {
      direction = "overclaim";
      reason = "Claim density high with low evidence density.";
    } else if (underclaim) {
      direction = "underclaim";
      reason = "Evidence density strong with no claim-intensity signals.";
    }

    return {
      densityMismatch: {
        isMismatch,
        direction,
        claimDensity,
        evidenceDensity,
        reason,
      },
    };
  } catch (_) {
    return { densityMismatch: defaultMismatch };
  }
}

module.exports = { buildEvidenceDensityMismatch };
