/**
 * Writing principles. One short example each.
 * House style choices are not principles. Compliance rules are not principles.
 */

export const WRITING_PRINCIPLES = Object.freeze([
  {
    id: "investment_story",
    text: "Tell the investment story, not the paperwork. Leave out notice numbers, payment dates, clauses, accruals, cash-flow adjustments, per-driver decompositions, and a statement that the methodology was unchanged.",
    example: "The fund called capital for two new investments, not Notice 14 dated 3 March.",
  },
  {
    id: "lead_with_what_happened",
    text: "Lead with what happened: what, when, who, then why.",
    example: "In October 2026, Halden Group committed to Aldermoor Capital Fund VI, a European mid-market buyout fund.",
  },
  {
    id: "depth_over_breadth",
    text: "Depth over breadth. Tell the element that sets the direction, and tell it well.",
    example: "One reason the commitment was made, with the figure that supports it, rather than a list of every theme in the paper.",
  },
  {
    id: "intelligent_outsider",
    text: "Write for an intelligent outsider. Introduce each company or fund briefly when it is first named. Use plain words. Explain source jargon or leave it out. Do not leave an ambiguous it.",
    example: "Aldermoor Capital Fund VI, a European mid-market buyout fund, called capital.",
  },
  {
    id: "speak_for_the_firm",
    text: "Speak precisely for the firm. Name the authoring organisation in commentary and press releases, and say the firm when that name is empty. Use we in investor letters and LinkedIn posts. The firm's plans are intentions. The words the firm and we mean only the user's own firm. Every other company, fund, manager or general partner is called by its name. The roles in the draft match the source: who paid, who received, who bought and who sold. When the source is another manager's or author's commentary, credit that person by name and keep the firm's voice for framing only. The credit carries through the draft, as in Marks argues or in Oaktree's view. Do not give the firm a view the source attributes to someone else. Do not state the firm's own actions, holdings, positioning or decisions unless the source states them as the firm's. If the source gives no firm positioning, do not invent one. The draft may end on the author's conclusion, credited to that author. When the source's subject is a different company, fund or manager, or when no authoring organisation is named and the subject is a named company, name the subject and write about it in the third person, in every output type, including an investor letter and a LinkedIn post. Do not use we or the firm for that subject. Do not describe another author's views as the firm's.",
    example: "We intend to commit. Marks argues that spreads are wide.",
  },
  {
    id: "public_means_public",
    text: "Public means public. A public version contains a confidential figure (a return, a multiple, an IRR, a DPI, or a valuation) only when a source whose publication state is published_external states that figure.",
    example: "A public letter quotes a return only from a press release marked published_external, not from an investment paper marked restricted.",
  },
  {
    id: "end_with_substance",
    text: "End with substance or do not add a closing sentence. A last sentence has to add insight, ideally the team's overall view in its own sentiment. Never recap what the draft already said. Do not add a closing sentence that only repeats points already made. Do not promise a section the draft does not deliver.",
    example: "The team expects the entry multiple to be earned back inside four years, when the source says that. Not: these factors make the investment attractive.",
  },
  {
    id: "keep_the_figures",
    text: "Keep the figures. Detail the writer can trim is better than a thin draft, inside the length limit and inside the public rule. The top of the length range is the limit. Stay at or under that number. When the sources support a prime point for this text type, cover that point before the draft stops short of the range.",
    example: "A supported percentage stays, even when a later edit could cut it.",
  },
  {
    id: "deal_status",
    text: "State the firm's decision as made, in the form the source supports, such as the firm invested, the firm committed, or the valuation increased. State the deal's status as the facts source states it at its own date. A recommendation or a request for approval is not an agreement, and an agreement is not a completion. Do not describe a step as done unless a facts source says it is done. Do not write recommended, proposed, seek approval, or is recommended to. Do not make the investment team or a committee the actor of the decision. In the commentary, do not write about how this text was prepared or which sources it used; that belongs only in the Methodology Note.",
    example: "The investment committee recommended the commitment, so the draft says it was recommended, not that the firm committed.",
  },
  {
    id: "cash_amounts",
    text: "Do not state cash amounts that were committed, called, distributed, or invested, or the size of the firm's own investment, unless the special instructions ask for them. Ratios, multiples, and percentages may be stated.",
    example: "DPI may be stated. The dollar amount distributed may not, unless the instructions ask.",
    ownInvestment: "The firm's own investment amount may be stated. Do not state cash amounts that were committed, called, or distributed, unless the special instructions ask for them.",
  },
  {
    id: "words_of_size",
    text: "Words of size must match the source. Do not call a small change significant or a large change modest.",
    example: "A 2% move the source calls slight stays slight.",
  },
]);

const OWN_INVESTMENT_EVENTS = new Set(["NEW_DIRECT_INVESTMENT", "ADD_ON_DIRECT_INVESTMENT"]);

export function principleById(id) {
  const found = WRITING_PRINCIPLES.find((row) => row.id === id);
  if (!found) throw new Error(`writing principles: missing ${id}`);
  return found;
}

/**
 * The same principles for Generate, Rewrite, and Adapt.
 * @param {{ eventType?: string }} [opts]
 */
export function renderPrinciples(opts = {}) {
  const eventType = typeof opts.eventType === "string" ? opts.eventType : "";
  const blocks = WRITING_PRINCIPLES.map((row) => {
    const text = row.id === "cash_amounts" && OWN_INVESTMENT_EVENTS.has(eventType) && row.ownInvestment
      ? row.ownInvestment
      : row.text;
    return `${text} Example: ${row.example}`;
  });
  return `Writing principles:\n- ${blocks.join("\n- ")}`;
}
