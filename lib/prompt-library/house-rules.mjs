// House principles for drafting. Verbatim. They sit in the house-rules layer.

export const HOUSE_RULES_PARAGRAPHS = [
  "Describe the asset, the transaction, the rationale and the outcome. Do not state cash amounts that were committed, called, distributed, or invested, or the size of the firm's own investment, unless the special instructions ask for them. Ratios and multiples such as DPI, and percentages, are allowed. Where size or change matters, give it as a percentage or in words the source supports, such as a double-digit increase. Words of size must match the source: do not call a small change significant or a large change modest.",
  "When the source states the investment team's overall view and it names what makes the investment attractive (the market, the entry point, the structure, the edge), convey that substance as the firm's view, attributed, in your own words, keeping its specifics. Do not quote it and do not strengthen it. Never write a generic summing-up sentence such as one saying these factors make the investment compelling or attractive: if a sentence would still be true after removing every specific word, leave it out. If the source gives no substantive overall view, do not create one; end on the last substantive point.",
  "State the deal's status as the facts source states it at its own date. A recommendation or a request for approval is not an agreement, and an agreement is not a completion. Do not describe a step as done unless a facts source says it is done. In the commentary, do not write about how this text was prepared or which sources it used; that belongs only in the Methodology Note.",
];

export const HOUSE_RULES_TEXT = HOUSE_RULES_PARAGRAPHS.join("\n\n");

// One drafting instruction for every text type. B551.
export const DRAFTING_DECISION_TEXT =
  "State the firm's decision as made, in the form the source supports, such as the firm invested, the firm committed, or the valuation increased. Do not write recommended, proposed, seek approval, or is recommended to. Do not make the investment team or a committee the actor. Reporting commentary, press releases, and LinkedIn posts use the firm in the third person throughout. Investor letters use we for the firm throughout, and keep their opening greeting. Do not mix we and the firm in one draft. End on a specific point. Do not add a closing sentence that only repeats points already made. Aim inside the length range. Words up to the ceiling are tolerance, not a target. Be concise. When the sources support a prime point for this text type, cover that point before the draft stops short of the range. Do not add a sentence the sources do not support in order to fill the range.";

const OWN_INVESTMENT_BAN =
  "committed, called, distributed, or invested, or the size of the firm's own investment";
const OWN_INVESTMENT_ALLOWED = "committed, called, or distributed";

/** New direct and add-on direct may state the firm's own amount. Every other type keeps the ban. */
export function houseRulesForEvent(eventType) {
  if (eventType === "NEW_DIRECT_INVESTMENT" || eventType === "ADD_ON_DIRECT_INVESTMENT") {
    const paragraphs = HOUSE_RULES_PARAGRAPHS.slice();
    paragraphs[0] = paragraphs[0].replace(OWN_INVESTMENT_BAN, OWN_INVESTMENT_ALLOWED);
    return paragraphs.join("\n\n");
  }
  return HOUSE_RULES_TEXT;
}
