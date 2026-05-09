// Pipeline v4 — Stage 3: deterministic verdict aggregation (QC rebuild).
// Rules per QC_Pipeline_Redesign_Architecture.docx §5.3.

function normalizeClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (c === "confirmed" || c === "partially_confirmed" || c === "conflicting" || c === "no_support") {
    return c;
  }
  return "no_support";
}

function verdictToMatchBucket(verdict) {
  if (verdict === "not_supported") return "no_support";
  return verdict;
}

/**
 * @param {Array<{ classification?: string, sourceIndex?: number }>} statementMatches
 */
export function aggregateVerdict({ statementMatches }) {
  const matches = Array.isArray(statementMatches) ? statementMatches : [];
  const withNorm = matches.map((m) => ({
    ...m,
    _c: normalizeClassification(m?.classification),
  }));

  const anyConfirmed = withNorm.some((m) => m._c === "confirmed");
  const anyConflicting = withNorm.some((m) => m._c === "conflicting");
  const anyPartial = withNorm.some((m) => m._c === "partially_confirmed");

  let verdict;
  if (anyConfirmed) verdict = "confirmed";
  else if (anyConflicting) verdict = "conflicting";
  else if (anyPartial) verdict = "partially_confirmed";
  else verdict = "not_supported";

  const hasConflict = anyConflicting;
  const bucket = verdictToMatchBucket(verdict);

  const contributing = new Set();
  for (const m of withNorm) {
    if (m._c === bucket) contributing.add(Number(m.sourceIndex));
  }
  if (hasConflict) {
    for (const m of withNorm) {
      if (m._c === "conflicting") contributing.add(Number(m.sourceIndex));
    }
  }

  const contributingSourceIndices = Array.from(contributing)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  console.debug(
    `[stage3] verdict=${verdict}, hasConflict=${hasConflict}, contributingSources=[${contributingSourceIndices.join(",")}]`
  );

  return { verdict, hasConflict, contributingSourceIndices };
}
