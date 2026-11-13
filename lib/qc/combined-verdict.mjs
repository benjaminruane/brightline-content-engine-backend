/**
 * B421. One verdict for all four reviewers.
 * statementVerdict stays the evidence and ledger verdict.
 * This object also sees editorial, style, and compliance.
 * Strongest first.
 */
import { isHouseStyleConcern } from "./house-style.mjs";
import { CAUSAL_EVIDENCE_RULE, concernRule } from "./statement-verdict.mjs";

export const COMBINED_STATES = [
  "not_in_source",
  "conflicts",
  "compliance_risk",
  "beyond",
  "partial",
  "note_withheld",
  "wording",
  "nothing_raised",
];

const LABELS = {
  not_in_source: "Not in the source",
  conflicts: "Conflicts with the source",
  compliance_risk: "Compliance risk",
  beyond: "Goes beyond the source",
  partial: "Goes beyond the source",
  note_withheld: "Needs a look",
  wording: "Wording to fix",
  nothing_raised: "Nothing raised",
};

function pack(state, tone, tier, setBy) {
  return { state, tone, tier, label: LABELS[state], setBy: setBy ?? null };
}

function listOf(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`combinedVerdict: ${name} is not a list`);
  }
  return value;
}

/**
 * @param {{ verdict: object, editorialConcerns: object[], complianceVerdict?: string|null, complianceConcerns: object[] }} input
 */
export function combinedVerdict({ verdict, editorialConcerns, complianceVerdict, complianceConcerns } = {}) {
  if (!verdict || typeof verdict.state !== "string" || !verdict.state) {
    throw new Error("combinedVerdict: statement verdict is missing");
  }
  const editorial = listOf(editorialConcerns, "editorial concerns");
  const compliance = listOf(complianceConcerns, "compliance concerns");
  const complianceState = typeof complianceVerdict === "string" ? complianceVerdict : "";

  if (verdict.state === "not_in_source") {
    return pack("not_in_source", "red", "demands", { source: "fact", ...(verdict.setBy || {}) });
  }
  if (verdict.state === "conflicts") {
    return pack("conflicts", "red", "demands", { source: "note", ...(verdict.setBy || {}) });
  }
  if (complianceState === "hard_concern") {
    return pack("compliance_risk", "red", "demands", { source: "compliance", verdict: "hard_concern" });
  }
  if (verdict.state === "beyond") {
    return pack("beyond", "amber", "light", verdict.setBy || { source: "note" });
  }
  if (verdict.state === "partial") {
    return pack("partial", "amber", "light", verdict.setBy || { source: "display" });
  }
  if (verdict.state === "note_withheld") {
    return pack("note_withheld", "amber", "light", verdict.setBy || { source: "note", refused: true });
  }
  if (compliance.length > 0 || complianceState === "soft_concern") {
    return pack("wording", "amber", "light", { source: "compliance", verdict: complianceState || "soft_concern" });
  }
  const remainingEditorial = editorial.filter((concern) => (
    concernRule(concern) !== CAUSAL_EVIDENCE_RULE && !isHouseStyleConcern(concern)
  ));
  if (remainingEditorial.length > 0) {
    return pack("wording", "slate", "light", { source: "editorial", rule: concernRule(remainingEditorial[0]) });
  }
  return pack("nothing_raised", "green", "quiet", null);
}
