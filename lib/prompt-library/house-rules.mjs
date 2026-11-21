// House principles for drafting. Verbatim. They sit in the house-rules layer.

export const HOUSE_RULES_PARAGRAPHS = [
  "Describe the asset, the transaction, the rationale and the outcome. Do not state cash amounts that were committed, called, distributed, or invested, or the size of the firm's own investment, unless the special instructions ask for them. Ratios and multiples such as DPI, and percentages, are allowed. Where size or change matters, give it as a percentage or in words the source supports, such as a double-digit increase. Words of size must match the source: do not call a small change significant or a large change modest.",
  "When the source states the investment team's overall view and it names what makes the investment attractive (the market, the entry point, the structure, the edge), convey that substance as the firm's view, attributed, in your own words, keeping its specifics. Do not quote it and do not strengthen it. Never write a generic summing-up sentence such as one saying these factors make the investment compelling or attractive: if a sentence would still be true after removing every specific word, leave it out. If the source gives no substantive overall view, do not create one; end on the last substantive point.",
  "State the deal's status as the facts source states it at its own date. A recommendation or a request for approval is not an agreement, and an agreement is not a completion. Do not describe a step as done unless a facts source says it is done. In the commentary, do not write about how this text was prepared or which sources it used; that belongs only in the Methodology Note.",
];

export const HOUSE_RULES_TEXT = HOUSE_RULES_PARAGRAPHS.join("\n\n");

// One drafting instruction for every text type. B551.
export const DRAFTING_DECISION_TEXT =
  "State the firm's decision as made, in the form the source supports, such as the firm invested, the firm committed, or the valuation increased. Do not write recommended, proposed, seek approval, or is recommended to. Do not make the investment team or a committee the actor. Reporting commentary and press releases use the firm in the third person throughout. Investor letters and LinkedIn posts use we for the firm throughout. Investor letters keep their opening greeting. Do not mix we and the firm in one draft. The words the firm and we mean only the user's own firm. The authoring organisation is the user's own organisation. A draft speaks as the subject only when the subject is the authoring organisation. When the source's subject is a different company, fund or manager, or when no authoring organisation is named and the subject is a named company, name the subject and write about it in the third person, in every output type, including an investor letter and a LinkedIn post. Do not use we or the firm for that subject. LinkedIn posts and investor letters use we only when they speak as the authoring organisation. Every other company, fund, manager or general partner is called by its name. The roles in the draft match the source: who paid, who received, who bought and who sold. When the source is another manager's or author's commentary, credit that person by name and keep the firm's voice for framing only. The credit carries through the draft, as in Marks argues or in Oaktree's view. Do not give the firm a view the source attributes to someone else. Do not state the firm's own actions, holdings, positioning or decisions unless the source states them as the firm's. If the source gives no firm positioning, do not invent one. The draft may end on the author's conclusion, credited to that author. The firm's voice there is limited to framing, such as why the point matters to readers. Do not promise a section the draft does not deliver. End on a specific point. Do not add a closing sentence that only repeats points already made. The top of the length range is the limit. Stay at or under that number. Be concise. When the sources support a prime point for this text type, cover that point before the draft stops short of the range. Do not add a sentence the sources do not support in order to fill the range.";

/** Loud when the request did not name an organisation. Empty is not a silent "the firm". */
export function authoringOrganisationText(name) {
  const named = typeof name === "string" ? name.trim() : "";
  if (!named) {
    return "No authoring organisation was named. Do not speak as a company, fund or manager in the sources.";
  }
  return `The authoring organisation is ${named}. The words the firm and we mean only ${named}. Speak as ${named} only when the source is about ${named}.`;
}

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
