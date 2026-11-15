/**
 * The writer's deal-status confirmation.
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
    throw new Error(`deal status is not a known option: ${value}`);
  }
  return value;
}

export const UNCONFIRMED_STATUS_LINE =
  "The writer has not confirmed the deal status. State it exactly as the facts source states it at its own date. If the facts source asks for or recommends approval, write that the investment team recommended it, not that it was approved, agreed or completed.";

const STATUS_STOP = new Set(["the", "firm", "has", "have", "for", "this", "writer", "transaction", "received"]);

export function dealStatusDraftLine(raw, eventType) {
  const value = dealStatusValue(raw);
  if (value) {
    return `The writer confirms the deal status is: ${value}. Describe the status this way. This confirmation counts as a facts source for status only.`;
  }
  if (typeof eventType === "string" && DEAL_STATUS_TEXT_TYPES.includes(eventType)) return UNCONFIRMED_STATUS_LINE;
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

/** A facts source that speaks only to deal status. Null when the writer did not confirm one. */
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
