// House principles now live in lib/style-guide/principles.mjs.
// These names remain so older imports still resolve. The text is the principles.

import { renderPrinciples, WRITING_PRINCIPLES } from "../style-guide/principles.mjs";

export const HOUSE_RULES_PARAGRAPHS = WRITING_PRINCIPLES.map((row) => `${row.text} Example: ${row.example}`);
export const HOUSE_RULES_TEXT = HOUSE_RULES_PARAGRAPHS.join("\n\n");
export const DRAFTING_DECISION_TEXT = renderPrinciples();

export function authoringOrganisationText(name) {
  const named = typeof name === "string" ? name.trim() : "";
  if (!named) {
    return "No authoring organisation was named. Do not speak as a company, fund or manager in the sources.";
  }
  return `The authoring organisation is ${named}. The words the firm and we mean only ${named}. Speak as ${named} only when the source is about ${named}.`;
}

export function houseRulesForEvent(eventType) {
  return renderPrinciples({ eventType });
}
