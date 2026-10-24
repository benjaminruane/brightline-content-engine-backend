/**
 * B420. One verdict for one statement.
 * The card edge, the evidence line, the draft tint, and the header counts
 * all read this object. No other surface chooses a state.
 *
 * Strongest first: not_in_source, conflicts, beyond, nothing_raised.
 * A wording note does not set a state. A refused or missing note does not
 * set a state. The causal action rule is evidence and contributes beyond.
 */

export const CAUSAL_EVIDENCE_RULE = "overreach_unsupported_causal";

export const STATEMENT_STATES = ["not_in_source", "conflicts", "beyond", "nothing_raised"];

const TIERS = {
  not_in_source: "demands",
  conflicts: "demands",
  beyond: "light",
  nothing_raised: "quiet",
};

export function concernRule(concern) {
  const named = concern?.concernCode || concern?.rule || concern?.ruleId || "";
  return String(named).trim();
}

/**
 * @param {{ facts: object[], note?: object|null, entries: object[] }} input
 * @returns {{ state: string, tier: string, setBy: object|null }}
 */
export function statementVerdict({ facts, note, entries } = {}) {
  if (!Array.isArray(facts)) {
    throw new Error("statementVerdict: facts are missing");
  }
  if (!Array.isArray(entries)) {
    throw new Error("statementVerdict: action entries are missing");
  }
  const missing = facts.find((fact) => fact && fact.status === "not_found");
  if (missing) {
    const surface = typeof missing.surface === "string" ? missing.surface : "";
    return {
      state: "not_in_source",
      tier: TIERS.not_in_source,
      setBy: { source: "fact", surface, status: "not_found" },
    };
  }
  const accepted = note && note.refused !== true && typeof note.bucket === "string" ? note : null;
  const bucket = accepted ? accepted.bucket.trim().toLowerCase() : "";
  if (bucket === "conflicts") {
    return {
      state: "conflicts",
      tier: TIERS.conflicts,
      setBy: { source: "note", bucket: "conflicts" },
    };
  }
  if (bucket === "beyond") {
    return {
      state: "beyond",
      tier: TIERS.beyond,
      setBy: { source: "note", bucket: "beyond" },
    };
  }
  const causal = entries.find((entry) => concernRule(entry) === CAUSAL_EVIDENCE_RULE);
  if (causal) {
    return {
      state: "beyond",
      tier: TIERS.beyond,
      setBy: { source: "action", rule: CAUSAL_EVIDENCE_RULE },
    };
  }
  return { state: "nothing_raised", tier: TIERS.nothing_raised, setBy: null };
}

/** Edge colour for a statement verdict. Null when the card has no verdict. */
export function toneForStatementVerdict(verdict) {
  const state = typeof verdict === "string" ? verdict : verdict?.state;
  if (state === "not_in_source" || state === "conflicts") return "red";
  if (state === "beyond") return "amber";
  if (state === "nothing_raised") return "green";
  return null;
}

/** Concerns on the card, then any action entries already attached. */
export function entriesFromCard(card) {
  const editorial = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
  const actions = Array.isArray(card?.actionEntries) ? card.actionEntries : [];
  return [...editorial, ...actions];
}

/**
 * The causal rule is evidence. It must not keep the editorial signal at
 * hard concern after it has been counted by the statement verdict.
 * The concern stays on the card so the action list can file it as evidence.
 */
export function editorialVerdictWithoutCausal(concerns, prior) {
  const list = Array.isArray(concerns) ? concerns : [];
  const remaining = list.filter((concern) => concernRule(concern) !== CAUSAL_EVIDENCE_RULE);
  if (remaining.length === list.length) return prior;
  if (remaining.length === 0) {
    if (prior === "not_reviewed") return prior;
    return "clean";
  }
  if (remaining.some((concern) => concern?.severity === "hard_concern")) return "hard_concern";
  return "concern";
}
