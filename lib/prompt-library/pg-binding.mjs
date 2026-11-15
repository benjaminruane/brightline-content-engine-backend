// Shared binding text for the two scaffolds that exist today. Moved, not rewritten.

import { VISIBILITY, normalizeVisibility } from "../output-intent.js";

export const PG_WRITING_EVENT = {
  NEW_DIRECT_INVESTMENT: "NEW_DIRECT_INVESTMENT",
  NEW_FUND_COMMITMENT: "NEW_FUND_COMMITMENT",
};

export const DO_NOT_INVENT_FIRM_LINE = "Do not invent a firm name.";

export function actorName(houseName) {
  return houseName || "the investor";
}

function houseIdentityBullet(houseName) {
  if (houseName) {
    return `- The investor is ${houseName}. Write '${houseName}' in the opening line and in every later reference. Never substitute 'the firm', 'the investor', 'the company', or any paraphrase for ${houseName}.`;
  }
  return `- No house name is configured. Do not name any investment firm as the investor. ${DO_NOT_INVENT_FIRM_LINE}`;
}

function bindingShared(houseName) {
  return `Binding constraints (highest precedence: apply after all other guidance):
- The transaction date is {TRANSACTION_DATE}. Use exactly this date in the opening line. Dates appearing in the source documents describe historical events and MUST NOT be used as the transaction date.
${houseIdentityBullet(houseName)}
- The investment is {INVESTMENT}. Name it exactly as given in the opening line and throughout. Do NOT substitute a different company or fund name found in the source documents, even if the source describes a different entity.
- Spell the month in full in prose: write 'March 2026', not 'Mar 2026'. The input may be given as MMM YYYY; render it as 'Month YYYY' in the text.
- Currency: write amounts as 'USD 20 million' (ISO code + space), never with a '$' symbol, per house style.`;
}

export function buildBindingPrecedence(eventKey, visibility, houseName) {
  const entityNoun =
    eventKey === PG_WRITING_EVENT.NEW_FUND_COMMITMENT ? "fund" : "asset";
  const vis = normalizeVisibility(visibility);
  const house = actorName(houseName);
  const structureLine =
    vis === VISIBILITY.PUBLIC
      ? "- Structure: exactly ONE paragraph. Do not split into multiple paragraphs."
      : `- Structure: exactly TWO paragraphs. Paragraph 1 describes the ${entityNoun}; paragraph 2 covers investment merits and why ${house} was attracted. Do not merge into one paragraph.`;

  const lines = [bindingShared(houseName), structureLine];

  if (eventKey === PG_WRITING_EVENT.NEW_FUND_COMMITMENT && vis === VISIBILITY.COMPLETE) {
    lines.push(
      `- ${house} 'committed to' / 'completed a commitment to' the fund. Never write 'lead commitment' or 'made a lead commitment'.`,
      "- Do NOT state fund mechanics: term, extensions, investment period, fees, carried interest, GP commitment %, SFDR/Article 8 classification, or diversification limits.",
      "- Refer to the fund's manager as 'the manager' or 'the investment partner'. Never 'GP' or 'general partner'.",
      "- State prior track record qualitatively only (e.g. 'a strong track record'). Do NOT cite any prior-fund figures: no deployed totals, MOIC, IRR, vintage marks, or count of prior investments, and never present exit/realised returns as a reason for this commitment."
    );
  }

  return lines.join("\n");
}
