// lib/qc/binding-directness.mjs
// A6.49m: Canonical binding directness / mismatch-compatibility — single policy layer for QC V2.

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

/** Cues on source/binding text that pair with "raised" claims for investment-vs-raised mismatch. */
const INVESTMENT_SURFACE_CUES = ["investing", "investment", "evaluating", "up to"];

function hasRaisedRoundClaimCue(claimText) {
  const stmtLower = (claimText || "").toLowerCase();
  return /\braised\b|\braise\b|\braised\s+in\s+the\s+round\b|\bfinancing\s+round\b|\bround\b|\bseries\b|\btotal\s+amount\s+raised\b/i.test(stmtLower);
}

/**
 * Reasoning metadata that marks quantity/modifier/related-only mismatch paths (not direct full support).
 */
function bindingMetadataMismatchCompatible(binding) {
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
 * A6.49m: Mismatch-compatible binding — partial/paraphrase, metadata, or investment-surface vs raised-claim pairing.
 */
export function isBindingMismatchCompatible(binding, claim, claimText) {
  if (!binding || typeof binding !== "object") return false;
  const mt = String(binding.matchType || "").toLowerCase();
  if (mt === "partial_support" || mt === "paraphrase") return true;
  if (bindingMetadataMismatchCompatible(binding)) return true;
  const ex = bindingExcerptSurface(binding).toLowerCase();
  if (!ex) return false;
  if (!INVESTMENT_SURFACE_CUES.some((c) => ex.includes(c))) return false;
  if (!hasMoneyClaimType(claim)) return false;
  if (!hasRaisedRoundClaimCue(claimText)) return false;
  return true;
}

/**
 * Binding carries reasoning cues for the quantity-type mismatch path (excludes direct confirming support).
 */
function bindingHasQuantityMismatchPathCue(binding) {
  const meta = String(binding.reasonCode || binding.relevanceReasonCode || "").toLowerCase();
  if (!meta) return false;
  if (meta === "numeric_tuple") return false;
  if (/\bquantity\b/.test(meta) && /\bmismatch\b/.test(meta)) return true;
  if (/\bmodifier\b/.test(meta) && /\bmismatch\b/.test(meta)) return true;
  if (/\btype\b/.test(meta) && /\bmismatch\b/.test(meta)) return true;
  if (/\brelated_?only\b|\brelated_only_support\b/.test(meta)) return true;
  return false;
}

const DIRECT_MATCH_TYPES = new Set(["exact", "rounded_equivalent", "unit_equivalent"]);

/**
 * A6.49m: Direct confirming support — exact / rounded / unit; excludes placeholders, mismatch-compatible,
 * paraphrase/partial, and mismatch-path reasoning metadata.
 */
export function isDirectConfirmingSupportBinding(binding, claim, claimText) {
  if (!binding || typeof binding !== "object") return false;
  if (isBindingPlaceholderSynthetic(binding)) return false;
  const mt = String(binding.matchType || "").toLowerCase();
  if (!DIRECT_MATCH_TYPES.has(mt)) return false;
  if (mt === "partial_support" || mt === "paraphrase") return false;
  if (isBindingMismatchCompatible(binding, claim, claimText)) return false;
  if (bindingHasQuantityMismatchPathCue(binding)) return false;
  return true;
}

export function countDirectSupportingBindings(bindings, claim, claimText) {
  const scoped = filterSupportBindingsForClaim(bindings, claim);
  return scoped.reduce((n, b) => n + (isDirectConfirmingSupportBinding(b, claim, claimText) ? 1 : 0), 0);
}

/**
 * A6.49m: Policy counts for diagnostics (scoped bindings only).
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
