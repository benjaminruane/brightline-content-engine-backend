/**
 * The writer's transaction-status confirmation (field name dealStatus stays).
 * The default adds the unconfirmed line for the text types that show the control.
 * An unknown value is refused at the writer.
 */

export const DEAL_STATUS_DEFAULT = "As the source states";

export const DEAL_STATUS_OPTIONS = Object.freeze([
  DEAL_STATUS_DEFAULT,
  "Approved",
  "Signed or agreed",
  "Completed",
]);

export const DEAL_STATUS_TEXT_TYPES = Object.freeze([
  "NEW_DIRECT_INVESTMENT",
  "ADD_ON_DIRECT_INVESTMENT",
  "DIRECT_INVESTMENT_EXIT",
  "NEW_SECONDARY_INVESTMENT",
  "NEW_PRIMARY_COMMITMENT",
  "NEW_FUND_COMMITMENT",
]);

/** Shown behind "Add transaction status" — not on the always-visible list. */
export const DEAL_STATUS_OPTIONAL_TEXT_TYPES = Object.freeze([
  "GENERAL",
  "SPECIAL_TOPIC",
  "OTHER_UPDATE",
]);

/** Never offer transaction status for these text types. */
export const DEAL_STATUS_HIDDEN_TEXT_TYPES = Object.freeze([
  "FUND_CAPITAL_CALL",
  "FUND_DISTRIBUTION",
  "DIRECT_INVESTMENT_REVALUATION",
  "FUND_REVALUATION",
]);

const CONFIRMATION = Object.freeze({
  Approved: { rank: 1, text: "The firm has received approval for the transaction." },
  "Signed or agreed": { rank: 2, text: "The firm has agreed the transaction." },
  Completed: { rank: 3, text: "The firm has completed the transaction." },
});

/** A set confirmation, or null when the writer left the default. Throws when the value is not an option. */
export function dealStatusValue(raw) {
  if (raw == null || raw === "") return null;
  const value = String(raw).trim();
  if (!value || value === DEAL_STATUS_DEFAULT) return null;
  if (!Object.hasOwn(CONFIRMATION, value)) {
    throw new Error(`transaction status is not a known option: ${value}`);
  }
  return value;
}

export const UNCONFIRMED_STATUS_LINE =
  "The writer has not confirmed the transaction status. Commentary is written after the firm has decided, so state the firm's decision as made: agreed to invest, committed, or agreed to acquire. Do not write that the firm is seeking approval, or that the transaction is recommended. Claim completion only when a source says it is done. Otherwise state the transaction's status as the facts source states it at its own date. Another party's recommendation that is itself a fact, such as a board recommending a dividend, stays as stated.";

/** Per-option Generate rules. Default never asks for a completed claim. */
export const GENERATE_STATUS_RULES = Object.freeze({
  [DEAL_STATUS_DEFAULT]:
    "Describe the status the source gives (for an IC paper, the investment team recommended; for an agreed sale, agreed to sell, with completion expected when the source says so). Never write a status stronger than the source states. Do not claim the transaction is completed unless a source says it is done.",
  Approved:
    "Write the transaction as approved. Do not write that it is signed, agreed, committed, completed, or invested.",
  "Signed or agreed":
    "Write the transaction as agreed or committed. Do not write that it is completed or invested.",
  Completed:
    "Write the transaction as completed or invested.",
});

const STATUS_STOP = new Set(["the", "firm", "has", "have", "for", "this", "writer", "transaction", "received"]);

export function dealStatusDraftLine(raw, eventType) {
  const value = dealStatusValue(raw);
  if (value) {
    const rule = GENERATE_STATUS_RULES[value] || "";
    return `The writer confirms the transaction status is: ${value}. ${rule} This confirmation counts as a facts source for status only. Never write a status stronger than the one chosen.`;
  }
  if (typeof eventType === "string" && DEAL_STATUS_TEXT_TYPES.includes(eventType)) {
    return `${UNCONFIRMED_STATUS_LINE} ${GENERATE_STATUS_RULES[DEAL_STATUS_DEFAULT]}`;
  }
  return "";
}

/** Status words owned by this confirmation and every earlier rung. */
export function coveredStatusTokens(raw) {
  const value = dealStatusValue(raw);
  if (!value) return [];
  const rank = CONFIRMATION[value].rank;
  const tokens = new Set();
  for (const [option, row] of Object.entries(CONFIRMATION)) {
    if (row.rank > rank) continue;
    const blob = `${option} ${row.text}`.toLowerCase();
    for (const word of blob.split(/[^a-z]+/)) {
      if (word.length > 4 && !STATUS_STOP.has(word)) tokens.add(word);
    }
  }
  return [...tokens];
}

/** The statement states a status this confirmation already covers. */
export function confirmationSupportsStatement(statement, raw) {
  const body = String(statement || "").toLowerCase();
  if (!body.trim()) return false;
  return coveredStatusTokens(raw).some((word) => new RegExp(`\\b${word}\\b`).test(body));
}

/** The sentence the reading note, the evidence check, and the status branches share. */
export function statusPromptLine(raw) {
  const source = writingInputsSource(raw);
  if (!source) return "";
  return `Writing inputs, a facts source for status only: ${source.text} A status claim at or before this confirmed status is supported.`;
}

/** A facts source that speaks only to transaction status. Null when the writer did not confirm one. */
export function writingInputsSource(raw) {
  const value = dealStatusValue(raw);
  if (!value) return null;
  const row = CONFIRMATION[value];
  return {
    label: "Writing inputs",
    name: "Writing inputs",
    role: "facts",
    text: row.text,
    rank: row.rank,
  };
}
