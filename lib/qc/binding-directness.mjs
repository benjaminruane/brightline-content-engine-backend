// lib/qc/binding-directness.mjs
// A6.49m / A6.49n: Canonical binding directness / mismatch-compatibility — single policy layer for QC V2.

/** A6.49n: Allowed skipReason values for QC_V2_MISMATCH_BINDING_POLICY (quantity-mismatch inference policy). */
export const QUANTITY_MISMATCH_SKIP_REASONS = Object.freeze([
  "direct_support_found",
  "no_direct_support",
  "structured_quantity_mismatch_present",
  "structured_quantity_mismatch_absent",
]);

/** A6.49j/n: Structured quantity mismatch (meta type or inferred kind). */
export function isQuantityMismatchStructured(supportMismatch) {
  if (!supportMismatch || typeof supportMismatch !== "object") return false;
  if (supportMismatch.type === "quantity_mismatch") return true;
  if (supportMismatch.kind === "quantity_type_mismatch") return true;
  return false;
}

/**
 * A6.49n: quantityMismatchInferenceSkipped uses only directSupportingBindingsCount >= 1.
 * skipReason is one of QUANTITY_MISMATCH_SKIP_REASONS.
 */
export function computeQuantityMismatchInferencePolicy({
  directSupportingBindingsCount,
  metaSupportMismatch,
  supportMismatchEffective,
}) {
  const quantityMismatchInferenceSkipped = directSupportingBindingsCount >= 1;
  let skipReason;
  if (quantityMismatchInferenceSkipped) {
    skipReason = "direct_support_found";
  } else if (isQuantityMismatchStructured(metaSupportMismatch)) {
    skipReason = "structured_quantity_mismatch_present";
  } else if (supportMismatchEffective && isQuantityMismatchStructured(supportMismatchEffective)) {
    skipReason = "no_direct_support";
  } else {
    skipReason = "structured_quantity_mismatch_absent";
  }
  return { quantityMismatchInferenceSkipped, skipReason };
}

/** A6.49k/m: Bindings for the exact canonical claim (claimId must match when claim.id is set). */
export function filterSupportBindingsForClaim(bindings, claim) {
  if (!Array.isArray(bindings) || bindings.length === 0) return [];
  if (!claim?.id) return bindings;
  const id = String(claim.id);
  return bindings.filter((b) => b != null && String(b.claimId) === id);
}

const EXCERPT_NOT_CAPTURED = "(excerpt not captured)";

function bindingExcerptSurface(binding) {
  return String(binding?.excerpt ?? binding?.snippet ?? binding?.boundExcerpt ?? "").trim();
}

/**
 * A6.49m: Placeholder/synthetic — not a real excerpt-backed claim binding.
 */
export function isBindingPlaceholderSynthetic(binding) {
  if (!binding || typeof binding !== "object") return false;
  if (binding.placeholder === true || binding.synthetic === true || binding.isSynthetic === true) return true;
  const rc = String(binding.reasonCode || "").toLowerCase();
  if (rc === "placeholder" || rc === "synthetic") return true;
  const ex = bindingExcerptSurface(binding);
  if (!ex || ex === EXCERPT_NOT_CAPTURED) return true;
  return false;
}

const MONEY_CLAIM_TYPES = new Set(["investment_amount", "metric_amount", "valuation"]);

function hasMoneyClaimType(claim) {
  const ct = (claim?.type && String(claim.type).trim().toLowerCase()) || "";
  return MONEY_CLAIM_TYPES.has(ct) || ct.startsWith("valuation_");
}

/** Cues on binding text that pair with "raised" claims for investment-vs-raised mismatch (Tier 3). */
const INVESTMENT_SURFACE_CUES = ["investing", "investment", "evaluating", "up to"];

function hasRaisedRoundClaimCue(claimText) {
  const stmtLower = (claimText || "").toLowerCase();
  return /\braised\b|\braise\b|\braised\s+in\s+the\s+round\b|\bfinancing\s+round\b|\bround\b|\bseries\b|\btotal\s+amount\s+raised\b/i.test(stmtLower);
}

/**
 * A6.49n Tier 2 — explicit metadata (first sub-match wins internally; Tier 2 vs Tier 3 is Tier 2 first).
 * numeric_tuple is a legitimate direct-support tuple path, not mismatch-compatible by metadata alone.
 */
function tier2MetadataMismatchCompatible(binding) {
  const meta = String(binding.reasonCode || binding.relevanceReasonCode || "").toLowerCase();
  if (!meta) return false;
  if (meta === "numeric_tuple") return false;
  if (/\bquantity\b/.test(meta) && /\bmismatch\b/.test(meta)) return true;
  if (/\bmodifier\b/.test(meta) && /\bmismatch\b/.test(meta)) return true;
  if (/\btype\b/.test(meta) && /\bmismatch\b/.test(meta)) return true;
  if (/\brelated_?only\b|\brelated_only_support\b/.test(meta)) return true;
  return false;
}

/**
 * A6.49n Tier 3 — text-heuristic mismatch path (only if Tier 1 and Tier 2 did not match).
 * Requires BOTH money claim + raised/round cues AND investment-surface cues in binding text.
 */
function tier3InvestmentVsRaisedHeuristic(binding, claim, claimText) {
  const ex = bindingExcerptSurface(binding).toLowerCase();
  if (!ex) return false;
  if (!INVESTMENT_SURFACE_CUES.some((c) => ex.includes(c))) return false;
  if (!hasMoneyClaimType(claim)) return false;
  if (!hasRaisedRoundClaimCue(claimText)) return false;
  return true;
}

/**
 * A6.49m/n: Mismatch-compatible binding — first-match-wins across tiers.
 *
 * Precedence vs direct confirming: if this returns true, isDirectConfirmingSupportBinding must be false
 * (enforced by ordering inside isDirectConfirmingSupportBinding).
 *
 * Tier 1 — structural matchType: partial_support, paraphrase
 * Tier 2 — metadata: quantity / modifier / type mismatch, related-only (and equivalents)
 * Tier 3 — text heuristic: only when T1 and T2 false; requires BOTH claim-side money+raised cues AND binding-side investment cues
 */
export function isBindingMismatchCompatible(binding, claim, claimText) {
  if (!binding || typeof binding !== "object") return false;
  const mt = String(binding.matchType || "").toLowerCase();
  if (mt === "partial_support" || mt === "paraphrase") return true;
  if (tier2MetadataMismatchCompatible(binding)) return true;
  return tier3InvestmentVsRaisedHeuristic(binding, claim, claimText);
}

const DIRECT_MATCH_TYPES = new Set(["exact", "rounded_equivalent", "unit_equivalent"]);

/**
 * A6.49m/n: Direct confirming support — exact / rounded / unit only.
 *
 * A6.49n precedence: isBindingMismatchCompatible is evaluated first; if true, this is always false
 * regardless of matchType or other direct indicators.
 */
export function isDirectConfirmingSupportBinding(binding, claim, claimText) {
  if (!binding || typeof binding !== "object") return false;
  if (isBindingPlaceholderSynthetic(binding)) return false;
  if (isBindingMismatchCompatible(binding, claim, claimText)) return false;
  const mt = String(binding.matchType || "").toLowerCase();
  if (!DIRECT_MATCH_TYPES.has(mt)) return false;
  return true;
}

export function countDirectSupportingBindings(bindings, claim, claimText) {
  const scoped = filterSupportBindingsForClaim(bindings, claim);
  return scoped.reduce((n, b) => n + (isDirectConfirmingSupportBinding(b, claim, claimText) ? 1 : 0), 0);
}

/**
 * A6.49m/n: Policy counts for diagnostics (scoped bindings only — out-of-claim bindings excluded).
 */
export function countBindingPolicyMetrics(bindings, claim, claimText) {
  const scoped = filterSupportBindingsForClaim(bindings, claim);
  let mismatchCompatibleBindingsCount = 0;
  let placeholderBindingsCount = 0;
  for (const b of scoped) {
    if (isBindingPlaceholderSynthetic(b)) placeholderBindingsCount++;
    if (isBindingMismatchCompatible(b, claim, claimText)) mismatchCompatibleBindingsCount++;
  }
  const directSupportingBindingsCount = scoped.reduce(
    (n, b) => n + (isDirectConfirmingSupportBinding(b, claim, claimText) ? 1 : 0),
    0,
  );
  return {
    supportBindingsLength: scoped.length,
    directSupportingBindingsCount,
    mismatchCompatibleBindingsCount,
    placeholderBindingsCount,
  };
}
