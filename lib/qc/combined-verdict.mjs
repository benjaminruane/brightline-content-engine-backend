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
  wording: "Craft or compliance notes",
  nothing_raised: "Nothing raised",
};

export const COMBINED_TONE = {
  not_in_source: "red",
  conflicts: "red",
  compliance_risk: "red",
  beyond: "amber",
  partial: "amber",
  note_withheld: "amber",
  wording: "grey",
  nothing_raised: "none",
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
    return pack("wording", "grey", "light", { source: "compliance", verdict: complianceState || "soft_concern" });
  }
  const remainingEditorial = editorial.filter((concern) => (
    concernRule(concern) !== CAUSAL_EVIDENCE_RULE && !isHouseStyleConcern(concern)
  ));
  if (remainingEditorial.length > 0) {
    return pack("wording", "grey", "light", { source: "editorial", rule: concernRule(remainingEditorial[0]) });
  }
  return pack("nothing_raised", "none", "quiet", null);
}

const COUNT_LINES = [
  { states: ["conflicts"], one: "conflicts with the source", many: "conflict with the source" },
  { states: ["not_in_source"], one: "is not in the source", many: "are not in the source" },
  { states: ["compliance_risk"], one: "compliance risk", many: "compliance risks" },
  { states: ["beyond", "partial"], one: "goes beyond the source", many: "go beyond the source" },
  { states: ["note_withheld"], one: "needs a look", many: "need a look" },
  { states: ["wording"], one: "has craft or compliance notes", many: "have craft or compliance notes" },
];

/** Counts by combined state, worst first. Zero counts are omitted. */
export function assessmentCountLines(cards, resolve) {
  if (typeof resolve !== "function") {
    throw new Error("assessmentCountLines: resolver is missing");
  }
  const rows = Array.isArray(cards) ? cards : [];
  const counts = new Map();
  for (const card of rows) {
    const state = resolve(card)?.state;
    if (!state) throw new Error("assessmentCountLines: combined state is missing");
    counts.set(state, (counts.get(state) || 0) + 1);
  }
  const lines = [];
  for (const row of COUNT_LINES) {
    const count = row.states.reduce((sum, state) => sum + (counts.get(state) || 0), 0);
    if (count < 1) continue;
    lines.push({ states: row.states, count, text: `${count} ${count === 1 ? row.one : row.many}` });
  }
  return lines;
}
