/**
 * B420. One verdict for one statement.
 * The card edge, the evidence line, the draft tint, and the header counts
 * all read this object. No other surface chooses a state.
 *
 * Strongest first: not_in_source, conflicts, beyond, note_withheld, nothing_raised.
 * A figure or a date that was not found stays not in the source, whatever the note says.
 * A name or other fact that was not found does not, when the reading note is accepted
 * with bucket none. A wording note does not set a state for those facts either.
 * A missing note does not set a state.
 * A refused note is note_withheld. The causal action rule is evidence and
 * contributes beyond.
 */

export const CAUSAL_EVIDENCE_RULE = "overreach_unsupported_causal";

export const STATEMENT_STATES = ["not_in_source", "conflicts", "beyond", "note_withheld", "nothing_raised"];

const TIERS = {
  not_in_source: "demands",
  conflicts: "demands",
  beyond: "light",
  note_withheld: "demands",
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
export function statementVerdict({ facts, note, entries, statement } = {}) {
  if (!Array.isArray(facts)) {
    throw new Error("statementVerdict: facts are missing");
  }
  if (!Array.isArray(entries)) {
    throw new Error("statementVerdict: action entries are missing");
  }
  const accepted = note && note.refused !== true && typeof note.bucket === "string" ? note : null;
  const bucket = accepted ? accepted.bucket.trim().toLowerCase() : "";
  const missing = facts.find((fact) => {
    if (!fact || fact.status !== "not_found") return false;
    if (fact.kind === "figure" || fact.kind === "date") return true;
    if (bucket === "none" || bucket === "wording") return false;
    return true;
  });
  if (missing) {
    const surface = typeof missing.surface === "string" ? missing.surface : "";
    return {
      state: "not_in_source",
      tier: TIERS.not_in_source,
      setBy: { source: "fact", surface, status: "not_found" },
    };
  }
  if (accepted?.escalate === "gross_net") {
    return {
      state: "note_withheld",
      tier: "light",
      setBy: { source: "note", rule: "gross_net" },
    };
  }
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
  if (note && note.refused === true) {
    return {
      state: "note_withheld",
      tier: TIERS.note_withheld,
      setBy: { source: "note", refused: true },
    };
  }
  return { state: "nothing_raised", tier: TIERS.nothing_raised, setBy: null };
}

/** Edge colour for a statement verdict. Null when the card has no verdict. */
export function toneForStatementVerdict(verdict) {
  const state = typeof verdict === "string" ? verdict : verdict?.state;
  if (state === "not_in_source" || state === "conflicts") return "red";
  if (state === "note_withheld" || state === "beyond" || state === "partial") return "amber";
  if (state === "nothing_raised") return "green";
  return null;
}

/** Concerns on the card, then any action entries already attached. */
export function entriesFromCard(card) {
  const editorial = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
  const actions = Array.isArray(card?.actionEntries) ? card.actionEntries : [];
  return [...editorial, ...actions];
}
