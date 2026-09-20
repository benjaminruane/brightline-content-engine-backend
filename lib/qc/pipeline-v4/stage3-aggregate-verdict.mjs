// Pipeline v4 — Stage 3: deterministic verdict aggregation (QC rebuild).
// Rules per QC_Pipeline_Redesign_Architecture.docx §5.3.

function normalizeClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (c === "confirmed" || c === "partially_confirmed" || c === "conflicting" || c === "no_support") {
    return c;
  }
  if (c === "not_reviewed") return "not_reviewed";
  if (c === "superseded") return "superseded";
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

  const reviewed = withNorm.filter((m) => m._c !== "not_reviewed" && m._c !== "superseded");
  const anyNotReviewed = withNorm.some((m) => m._c === "not_reviewed");
  if (reviewed.length === 0 && anyNotReviewed) {
    console.debug("[stage3] verdict=not_reviewed, hasConflict=false, contributingSources=[]");
    return { verdict: "not_reviewed", hasConflict: false, contributingSourceIndices: [] };
  }

  const pool = reviewed.length > 0 ? reviewed : withNorm;
  const anyConfirmed = pool.some((m) => m._c === "confirmed");
  const anyConflicting = pool.some((m) => m._c === "conflicting");
  const anyPartial = pool.some((m) => m._c === "partially_confirmed");

  let verdict;
  if (anyConflicting) verdict = "conflicting";
  else if (anyConfirmed) verdict = "confirmed";
  else if (anyPartial) verdict = "partially_confirmed";
  else verdict = "not_supported";

  const hasConflict = anyConflicting;
  const bucket = verdictToMatchBucket(verdict);

  const contributing = new Set();
  for (const m of pool) {
    if (m._c === bucket) contributing.add(Number(m.sourceIndex));
  }
  if (hasConflict) {
    for (const m of pool) {
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
