/**
 * The writer's deal-status confirmation.
 * The default adds nothing. An unknown value is refused at the writer.
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

export function dealStatusDraftLine(raw) {
  const value = dealStatusValue(raw);
  if (!value) return "";
  return `The writer confirms the deal status is: ${value}. Describe the status this way. This confirmation counts as a facts source for status only.`;
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
