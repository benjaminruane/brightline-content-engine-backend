/**
 * A6.4 / A6.8r: Deterministic post-validation for LLM-proposed claims.
 * A6.8r: When fromSentenceAuthority is true, skip claim_not_traceable_to_draft (sentence is authoritative; subclaim need not be substring of draft).
 * @module lib/qc/claim-validation
 */

/**
 * Normalize string for comparison: trim, collapse whitespace, lowercase.
 * @param {string} s
 * @returns {string}
 */
function normalizeForCompare(s) {
  if (typeof s !== "string") return "";
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Extract numeric values (integers and decimals) from text for drift check.
 * @param {string} text
 * @returns {number[]}
 */
function extractNumbersFromText(text) {
  if (typeof text !== "string") return [];
  const nums = [];
  const re = /[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = parseFloat(m[0].replace(/,/g, ""));
    if (Number.isFinite(v)) nums.push(v);
  }
  return nums;
}

/**
 * Validate a single proposed claim against draft text.
 *
 * @param {Object} claim - Proposed claim (claimText, draftSpanStart, draftSpanEnd, sourceSentenceText, claimType, isCheckable)
 * @param {string} draftText
 * @param {Set<string>} seenNormalized - Set of already-accepted normalized claim texts (for duplicate check)
 * @returns {{ accepted: boolean, reason?: string }}
 */
function validateOne(claim, draftText, seenNormalized) {
  const draftLen = draftText.length;
  const start = claim.draftSpanStart;
  const end = claim.draftSpanEnd;
  const claimText = typeof claim.claimText === "string" ? claim.claimText.trim() : "";
  if (!claimText) return { accepted: false, reason: "empty_claimText" };
  if (typeof start !== "number" || typeof end !== "number" || start < 0 || end > draftLen || start >= end) {
    return { accepted: false, reason: "invalid_span" };
  }
  if (claim.isCheckable === false) return { accepted: false, reason: "not_checkable" };

  const draftSlice = draftText.slice(start, end).trim();
  const claimNorm = normalizeForCompare(claimText);
  const sliceNorm = normalizeForCompare(draftSlice);
  if (!sliceNorm || !claimNorm) return { accepted: false, reason: "empty_span_text" };
  if (claim.fromSentenceAuthority !== true) {
    // Require claim traceable to draft slice unless sentence-authority mode (A6.8r)
    if (!sliceNorm.includes(claimNorm) && !claimNorm.includes(sliceNorm)) {
      return { accepted: false, reason: "claim_not_traceable_to_draft" };
    }
    // Numeric drift: numbers in claim must appear in draft slice (no new numbers)
    const claimNums = extractNumbersFromText(claimText);
    const sliceNums = extractNumbersFromText(draftSlice);
    const sliceSet = new Set(sliceNums);
    for (const n of claimNums) {
      if (!sliceSet.has(n)) return { accepted: false, reason: "numeric_drift" };
    }
  }

  // Duplicate: same normalized claim text already accepted
  if (seenNormalized.has(claimNorm)) return { accepted: false, reason: "duplicate" };
  seenNormalized.add(claimNorm);

  return { accepted: true };
}

/**
 * Validate all proposed claims; return accepted list, rejected list with reasons, and trace.
 *
 * @param {string} draftText
 * @param {Object[]} proposedClaims
 * @returns {{ accepted: Object[], rejected: { claim: Object, reason: string }[], trace: { proposedClaimText: string, draftSpan: Object, result: string, reason?: string }[] }}
 */
export function validateProposedClaims(draftText, proposedClaims) {
  const accepted = [];
  const rejected = [];
  const trace = [];
  const seenNormalized = new Set();

  if (typeof draftText !== "string") draftText = "";
  const list = Array.isArray(proposedClaims) ? proposedClaims : [];

  for (const claim of list) {
    const proposedClaimText = typeof claim?.claimText === "string" ? claim.claimText.trim() : "";
    const draftSpan = {
      start: claim?.draftSpanStart,
      end: claim?.draftSpanEnd,
    };
    const result = validateOne(claim, draftText, seenNormalized);
    trace.push({
      proposedClaimText: proposedClaimText.slice(0, 120),
      draftSpan,
      result: result.accepted ? "accepted" : "rejected",
      reason: result.reason,
    });
    if (result.accepted) {
      accepted.push({
        ...claim,
        claimText: proposedClaimText || claim.claimText,
        draftSpanStart: claim.draftSpanStart,
        draftSpanEnd: claim.draftSpanEnd,
        sourceSentenceText: claim.sourceSentenceText ?? "",
        claimType: claim.claimType ?? "factual",
        isCheckable: claim.isCheckable !== false,
      });
    } else {
      rejected.push({ claim, reason: result.reason || "unknown" });
    }
  }

  return { accepted, rejected, trace };
}
