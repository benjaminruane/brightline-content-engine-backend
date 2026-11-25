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
    text: "Lead with what happened. Open with the month and year from the transaction date field, or with the source's own date when that field is empty, then who did what, when the text reports a dated transaction or event. Open with In, then that month and year. The opening date anchors the text. Add a second date only when it tells the reader something new they need, and never a second date for a step in the same story. Commentary and opinion, including a special topic and a general commentary, open with their subject and do not invent a dated framing.",
    example: "In September 2026, Kestrel Partners Fund IV called capital to fund the acquisition of a majority stake in Fjordline Software, an Oslo-based provider of maritime software. In October 2026, Kestrel Partners Fund IV distributed proceeds from the sale of a 60% stake in Harbourline Foods, a UK and Irish chilled prepared foods producer, to Northshore Consumer Partners. The fund retains a 40% stake.",
  },
  {
    id: "do_not_describe_the_draft",
    text: "A draft never describes itself or names its own text type. It has no title line unless the output type requires one, such as a press release headline, or the user asked for a title.",
    example: "In March 2026, the fund's software holdings fell less than the public software indices.",
    incorrect: [
      "HPIF quarterly commentary",
      "This special topic focuses on the fund's software exposure.",
    ],
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
    text: "An investor letter is the firm writing to its investors. When the main source is third-party research, open in the firm's voice and frame the piece as research being shared, then credit the author's views as theirs. Speak precisely for the firm. Name the authoring organisation only where it is the actor or its own decision is the subject. In a capital call or a distribution the fund calls or distributes, with no named recipient or payer. Do not write that the firm paid a capital call or received a distribution. Name the authoring organisation in commentary and press releases when it acts, and say the firm when that name is empty. Use we in investor letters and LinkedIn posts. The firm's plans are intentions. The words the firm and we mean only the user's own firm. Every other company, fund, manager or general partner is called by its name. The roles in the draft match the source: who paid, who received, who bought and who sold. On a capital call or a distribution, do not name the payer or the recipient. When the source is another manager's or author's commentary, credit that person by name and keep the firm's voice for framing only. The credit carries through the draft, as in Marks argues or in Oaktree's view. Do not give the firm a view the source attributes to someone else. Do not state the firm's own actions, holdings, positioning or decisions unless the source states them as the firm's. If the source gives no firm positioning, do not invent one. The draft may end on the author's conclusion, credited to that author. When the source's subject is a different company, fund or manager, or when no authoring organisation is named and the subject is a named company, name the subject and write about it in the third person, in every output type, including an investor letter and a LinkedIn post. Do not use we or the firm for that subject. Do not describe another author's views as the firm's.",
    example: "We intend to commit. Marks argues that spreads are wide. In September 2026, Kestrel Partners Fund IV called capital to fund the investment the notice names.",
  },
  {
    id: "public_means_public",
    text: "Public means public. In a public draft, every percentage, multiple and money amount must appear in a source whose publication state is published_external. Counts and dates may stay. A return, a multiple, an IRR, a DPI, or a valuation may come only from a public source.",
    example: "A public letter quotes a return only from a press release marked published_external, not from an investment paper marked restricted.",
  },
  {
    id: "end_with_substance",
    text: "End with substance or do not add a closing sentence. A last sentence has to add insight, ideally the team's overall view in its own sentiment, carried with its specifics. Never recap what the draft already said. Do not add a closing sentence that only repeats points already made. Do not promise a section the draft does not deliver. Each sentence must carry a fact or an insight. A sentence that only previews, summarises, or restates a neighbouring sentence is left out.",
    example: "The team expects the entry multiple to be earned back inside four years, because the source ties that payback to the entry multiple and the timetable.",
    incorrect: [
      "supports a compelling risk-reward profile for this new portfolio company",
      "These factors make ABC a compelling investment",
      "The sale of the shares reflected value created during Kestrel's ownership.",
    ],
  },
  {
    id: "keep_the_figures",
    text: "A comparison from the source keeps what is compared with what. If the source says a target was about 75% larger than Fund III, do not apply that 75% to a different fund. Keep the figures. Detail the writer can trim is better than a thin draft, inside the length limit and inside the public rule. The top of the length range is the limit. Stay at or under that number. When the sources support a prime point for this text type, cover that point before the draft stops short of the range.",
    example: "A supported percentage stays, even when a later edit could cut it.",
  },
  {
    id: "deal_status",
    text: "Commentary is written after the firm has decided, so state the firm's decision as made: agreed to invest, committed, or agreed to acquire. Claim completion only when a source says it is done. State the transaction's status as the facts source states it at its own date, such as expected to complete in the first quarter of 2027. A recommendation or a request for approval is not a completion. Another party's recommendation that is itself a fact, such as a board recommending a dividend, stays as stated. Do not make the investment team or a committee the actor of the decision. In the commentary, do not write about how this text was prepared or which sources it used; that belongs only in the Methodology Note.",
    example: "The investment committee paper recommends the commitment. The draft says: In October 2026, Halden Group committed to Aldermoor Capital Fund VI.",
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
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_INDEX = new Map(MONTHS.flatMap((name, index) => {
  const short = name.slice(0, 3).toLowerCase();
  return [[name.toLowerCase(), index], [short, index]];
}));

/** A month and year from a transaction date, or "" when the field cannot be read. */
export function monthAndYear(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) return `${MONTHS[month - 1]} ${iso[1]}`;
  }
  const named = text.match(/\b([A-Za-z]+)\.?\s+((?:19|20)\d{2})\b/);
  if (named && MONTH_INDEX.has(named[1].toLowerCase().slice(0, 3)) && MONTHS.some((name) => name.toLowerCase().startsWith(named[1].toLowerCase().slice(0, 3)))) {
    const index = MONTH_INDEX.get(named[1].toLowerCase().slice(0, 3));
    if (named[1].length === 3 || named[1].toLowerCase() === MONTHS[index].toLowerCase()) {
      return `${MONTHS[index]} ${named[2]}`;
    }
  }
  const dayFirst = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+((?:19|20)\d{2})\b/);
  if (dayFirst && MONTH_INDEX.has(dayFirst[2].toLowerCase().slice(0, 3))) {
    return `${MONTHS[MONTH_INDEX.get(dayFirst[2].toLowerCase().slice(0, 3))]} ${dayFirst[3]}`;
  }
  return "";
}

const DATED_EVENTS = new Set([
  "NEW_DIRECT_INVESTMENT",
  "ADD_ON_DIRECT_INVESTMENT",
  "DIRECT_INVESTMENT_EXIT",
  "DIRECT_INVESTMENT_REVALUATION",
  "NEW_SECONDARY_INVESTMENT",
  "NEW_PRIMARY_COMMITMENT",
  "NEW_FUND_COMMITMENT",
  "FUND_CAPITAL_CALL",
  "FUND_DISTRIBUTION",
  "FUND_REVALUATION",
]);

/** A dated transaction, a result, a call, a distribution, or a revaluation. */
export function opensWithDate(eventType, outputType) {
  if (DATED_EVENTS.has(eventType)) return true;
  if (eventType === "GENERAL") return String(outputType || "").toLowerCase() === "press_release";
  if (!eventType) return true;
  return false;
}

function openingDateLine(raw, dated) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!dated) {
    const shown = text ? ` The transaction date field is ${monthAndYear(text) || text}.` : "";
    return `This text is commentary or opinion. Open with the subject. Do not invent a month and year as the frame.${shown}`;
  }
  if (!text) {
    return "The transaction date field is empty. Open with In, then the month and year the source itself gives.";
  }
  const monthYear = monthAndYear(text);
  if (!monthYear) {
    console.error("[style] the transaction date could not be read as a month and year", text);
    return `The transaction date field is "${text}". It could not be read as a month and year. Open with In, then the month and year the source itself gives.`;
  }
  return `The transaction date for this draft is ${monthYear}. Open with In ${monthYear}.`;
}

export function renderPrinciples(opts = {}) {
  const eventType = typeof opts.eventType === "string" ? opts.eventType : "";
  const blocks = WRITING_PRINCIPLES.map((row) => {
    const text = row.id === "cash_amounts" && OWN_INVESTMENT_EVENTS.has(eventType) && row.ownInvestment
      ? row.ownInvestment
      : row.text;
    const incorrect = Array.isArray(row.incorrect)
      ? row.incorrect.filter((item) => eventType !== "GENERAL" || !item.includes("portfolio company"))
      : [];
    const shown = incorrect.length ? `${row.example} Not: ${incorrect.join(" Not: ")}` : row.example;
    return `${text} Example: ${shown}`;
  });
  const date = opts && Object.prototype.hasOwnProperty.call(opts, "transactionDate")
    ? `\n\n${openingDateLine(opts.transactionDate, opensWithDate(eventType, opts.outputType))}`
    : "";
  return `Writing principles:\n- ${blocks.join("\n- ")}${date}`;
}
