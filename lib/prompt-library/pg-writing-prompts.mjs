// lib/prompt-library/pg-writing-prompts.mjs
// WR1: writing scaffolds keyed by eventType x visibility (generation and rewrite).
// House identity comes from the configured authoring organisation. No real firm name is hardcoded.

import { VISIBILITY, normalizeVisibility } from "../output-intent.js";
import { EVENT_TYPE } from "../event-type.js";
import { resolveAuthoringOrganisationName } from "../qc/first-person-actor.mjs";

export const PG_WRITING_EVENT = {
  NEW_DIRECT_INVESTMENT: "NEW_DIRECT_INVESTMENT",
  NEW_FUND_COMMITMENT: "NEW_FUND_COMMITMENT",
};

const PG_EVENT_VERB = {
  [PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT]: "invested in",
  [PG_WRITING_EVENT.NEW_FUND_COMMITMENT]: "committed to",
};

export const DO_NOT_INVENT_FIRM_LINE = "Do not invent a firm name.";

function trimHouse(value) {
  return resolveAuthoringOrganisationName(value);
}

function actorName(houseName) {
  return houseName || "the investor";
}

function houseIdentityBullet(houseName) {
  if (houseName) {
    return `- The investor is ${houseName}. Write '${houseName}' in the opening line and in every later reference. Never substitute 'the firm', 'the investor', 'the company', or any paraphrase for ${houseName}.`;
  }
  return `- No house name is configured. Do not name any investment firm as the investor. ${DO_NOT_INVENT_FIRM_LINE}`;
}

function openingFormula(houseName) {
  if (houseName) {
    return `"In {TRANSACTION_DATE}, ${houseName} {VERB} {INVESTMENT}, a..."`;
  }
  return `"In {TRANSACTION_DATE}, write the {VERB} event for {INVESTMENT} without naming a firm, a..."`;
}

function bindingShared(houseName) {
  return `Binding constraints (highest precedence: apply after all other guidance):
- The transaction date is {TRANSACTION_DATE}. Use exactly this date in the opening line. Dates appearing in the source documents describe historical events and MUST NOT be used as the transaction date.
${houseIdentityBullet(houseName)}
- The investment is {INVESTMENT}. Name it exactly as given in the opening line and throughout. Do NOT substitute a different company or fund name found in the source documents, even if the source describes a different entity.
- Spell the month in full in prose: write 'March 2026', not 'Mar 2026'. The input may be given as MMM YYYY; render it as 'Month YYYY' in the text.
- Currency: write amounts as 'USD 20 million' (ISO code + space), never with a '$' symbol, per house style.`;
}

function buildBindingPrecedence(eventKey, visibility, houseName) {
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

function sharedGuidelines(houseName) {
  return `Writing guidelines:
- Do not make up any content.
- Place more emphasis on the Source Documents than on public sources.
- Write in US English.
- Use normal dashes (not em/en-dashes) and normal quotes (not smart quotes).
- Adhere to these writing guidelines at all times.

Base formulation (or similar):
${openingFormula(houseName)}

Special instructions for this run (apply if present): {SPECIAL_INSTRUCTIONS}
Source material: {SOURCES}`;
}

function buildMethodologyInstruction() {
  return `Output format (required):
1. Write the transaction commentary first. The word limit stated above applies to the COMMENTARY ONLY; do not count the Methodology Note toward it.
2. After the commentary, on its own line, output exactly: ---METHODOLOGY---
3. Then write the Methodology Note: 1 concise paragraph (~80-120 words),
professional, factual, neutral, framed for audit transparency (not process narration).
Briefly explain the overall approach and how source materials were used; summarise how
the text was constructed (synthesis of sources / provided draft as base / creation from
scratch); highlight key enhancements (financial or operational substance; clarity,
structure, and narrative flow; alignment with the writing guidelines); confirm
adherence to any specific instructions or constraints; introduce no information not
supported by the provided sources.`;
}

function directInvestmentComplete(houseName) {
  const house = actorName(houseName);
  return `${buildBindingPrecedence(PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT, VISIBILITY.COMPLETE, houseName)}

Objective: Draft a commentary addressing the transaction, focusing on the largest
component of the transaction if relevant.
Length and shape: Two paragraphs. The first describes the asset; the
second covers the investment merits and why ${house} was attracted to it.
Must include:
- Classification into lead, joint, or co-investment status, if known.
- A description of the asset and its business and operational highlights.
- A headline valuation metric (e.g. enterprise valuation) if relevant, but avoid
  detailed financial metrics.
- Investment merits, grouped into themes such as track record, entry valuation, and
  operating team.
- Why ${house} was attracted to the investment, in a more narrative tone.
- Why ${house} was invited or selected for the opportunity, if relevant
  (especially in co-investment scenarios).`;
}

function directInvestmentPublic(houseName) {
  return `${buildBindingPrecedence(PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT, VISIBILITY.PUBLIC, houseName)}

Objective: As above, public-safe.
Length and shape: Single paragraph.
Constraints: Based only on publicly available information. Exclude anything overly
sensitive or not publicly verifiable.`;
}

function fundCommitmentComplete(houseName) {
  const house = actorName(houseName);
  return `${buildBindingPrecedence(PG_WRITING_EVENT.NEW_FUND_COMMITMENT, VISIBILITY.COMPLETE, houseName)}

Objective: Draft a commentary addressing the transaction, focusing on the largest
component if relevant.
Length and shape: Two paragraphs. The first describes the fund; the
second covers the investment merits and why ${house} was attracted to it.
Must include:
- A description of the fund and its target size.
- The fund's investment strategy, and whether this is a new strategy or a continuation
  of an existing strategy.
- How many investments the fund intends to make.
- Key sectors the fund targets.
- Target equity value or enterprise values for each investment.
- The manager's value-creation approach, described both thematically and structurally
  (e.g. "digital transformation" and "Portfolio Support Group").
- Investment merits, grouped into themes such as track record, entry valuation, and
  operating team.
- Why ${house} was attracted to the investment, in a more narrative tone.
- If the fund has been seeded with certain assets or has already started investing,
  mention this and give a very brief description of the seed assets or assets already
  in the portfolio (e.g. name and description).

Narrative calibration:
- Write a thesis-led narrative, not a data dump. Integrate figures into sentences;
  never leave a bare figure as its own fragment.
- Include the fund's sector strategy / sector focus if present in the source.
- Include: fund strategy and target size, sector focus, the manager's value-creation
  approach, and why ${house} finds the strategy attractive. Lead with the
  investment thesis and thematic relevance.`;
}

function fundCommitmentPublic(houseName) {
  return `${buildBindingPrecedence(PG_WRITING_EVENT.NEW_FUND_COMMITMENT, VISIBILITY.PUBLIC, houseName)}

Objective: As above, public-safe.
Length and shape: Single paragraph.
Constraints: Based only on publicly available information. Exclude anything overly
sensitive or not publicly verifiable.`;
}

function promptTemplate(eventKey, visibility, houseName) {
  const vis = normalizeVisibility(visibility);
  if (eventKey === PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT) {
    return vis === VISIBILITY.PUBLIC
      ? directInvestmentPublic(houseName)
      : directInvestmentComplete(houseName);
  }
  if (eventKey === PG_WRITING_EVENT.NEW_FUND_COMMITMENT) {
    return vis === VISIBILITY.PUBLIC
      ? fundCommitmentPublic(houseName)
      : fundCommitmentComplete(houseName);
  }
  return null;
}

/** @type {Record<string, Record<string, string>>} */
export const PG_WRITING_PROMPTS = {
  [PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT]: {
    [VISIBILITY.COMPLETE]: directInvestmentComplete(null),
    [VISIBILITY.PUBLIC]: directInvestmentPublic(null),
  },
  [PG_WRITING_EVENT.NEW_FUND_COMMITMENT]: {
    [VISIBILITY.COMPLETE]: fundCommitmentComplete(null),
    [VISIBILITY.PUBLIC]: fundCommitmentPublic(null),
  },
};

/**
 * Map canonical eventType to PG_WRITING_PROMPTS key (demo types only).
 * @param {string} [eventType]
 * @returns {string|null}
 */
export function resolvePgWritingEventKey(eventType) {
  if (eventType === PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT) {
    return PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT;
  }
  if (
    eventType === PG_WRITING_EVENT.NEW_FUND_COMMITMENT ||
    eventType === EVENT_TYPE.NEW_PRIMARY_COMMITMENT
  ) {
    return PG_WRITING_EVENT.NEW_FUND_COMMITMENT;
  }
  return null;
}

/**
 * @param {string} eventKey
 * @param {string} visibility
 * @returns {string|null}
 */
export function getPgWritingPromptTemplate(eventKey, visibility) {
  const vis = normalizeVisibility(visibility);
  const byEvent = PG_WRITING_PROMPTS[eventKey];
  if (!byEvent) return null;
  return byEvent[vis] ?? null;
}

function formatSpecialInstructionsInline(specialInstructions) {
  const text = typeof specialInstructions === "string" ? specialInstructions.trim() : "";
  return text || "(none)";
}

/**
 * Trim whitespace and leading/trailing punctuation from PG investment names before substitution.
 * @param {string} [value]
 * @returns {string}
 */
export function normalizePgInvestmentName(value) {
  if (typeof value !== "string") return "";
  let normalized = value.trim();
  normalized = normalized.replace(/^[\s.,;:!?'"]+/, "").replace(/[\s.,;:!?'"]+$/, "");
  return normalized.trim();
}

function formatSourcesBlock(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return "(none provided; rely only on Title/Notes if present; do not invent facts)";
  }
  return sources
    .map((source, index) => {
      if (!source || typeof source !== "object") return "";
      const label =
        (typeof source.label === "string" && source.label.trim()) ||
        (typeof source.name === "string" && source.name.trim()) ||
        (typeof source.title === "string" && source.title.trim()) ||
        `Source ${index + 1}`;
      const text = typeof source.text === "string" ? source.text.trim() : "";
      if (text) return `--- ${label} ---\n${text}`;
      if (typeof source.url === "string" && source.url.trim()) {
        return `--- ${label} ---\n(URL reference: ${source.url.trim()})`;
      }
      return `--- ${label} ---\n(no extractable text)`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function dateForPrompt(raw) {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "the date already in the draft or sources. Do not write a bracketed placeholder";
}

function investmentForPrompt(raw) {
  const name = normalizePgInvestmentName(raw);
  if (name) return name;
  return "the named investment in the draft or sources. Do not write a bracketed placeholder";
}

/**
 * @param {string} template
 * @param {{
 *   eventKey: string,
 *   visibility?: string,
 *   transactionDate?: string,
 *   investment?: string,
 *   specialInstructions?: string,
 *   sources?: Array<object>,
 *   authoringOrganisation?: string|null,
 * }} ctx
 * @returns {string}
 */
export function renderPgWritingPrompt(template, ctx) {
  const houseName = trimHouse(ctx.authoringOrganisation);
  const transactionDate = dateForPrompt(ctx.transactionDate);
  const investment = investmentForPrompt(ctx.investment);
  const verb = PG_EVENT_VERB[ctx.eventKey] ?? "invested in";
  const methodologyNote = buildMethodologyInstruction();
  const body = template || promptTemplate(ctx.eventKey, ctx.visibility, houseName);

  let out = [sharedGuidelines(houseName), "", body, "", methodologyNote].join("\n");
  out = out.replaceAll("{TRANSACTION_DATE}", transactionDate);
  out = out.replaceAll("{INVESTMENT}", investment);
  out = out.replaceAll("{VERB}", verb);
  out = out.replaceAll(
    "{SPECIAL_INSTRUCTIONS}",
    formatSpecialInstructionsInline(ctx.specialInstructions)
  );
  out = out.replaceAll("{SOURCES}", formatSourcesBlock(ctx.sources));

  return out;
}

/**
 * @param {string} [eventType]
 * @param {string} [visibility]
 * @param {{
 *   transactionDate?: string,
 *   investment?: string,
 *   specialInstructions?: string,
 *   sources?: Array<object>,
 *   authoringOrganisation?: string|null,
 * }} [ctx]
 * @returns {string|null}
 */
export function buildPgWritingScaffold(eventType, visibility, ctx = {}) {
  const eventKey = resolvePgWritingEventKey(eventType);
  if (!eventKey) return null;
  const houseName = trimHouse(ctx.authoringOrganisation);
  const template = promptTemplate(eventKey, visibility, houseName);
  if (!template) return null;
  return renderPgWritingPrompt(template, { eventKey, visibility, ...ctx });
}
