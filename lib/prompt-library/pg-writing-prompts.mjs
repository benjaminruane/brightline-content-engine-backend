// lib/prompt-library/pg-writing-prompts.mjs
// WR1: writing scaffolds keyed by eventType x visibility (generation and rewrite).
// House identity comes from the configured authoring organisation. No real firm name is hardcoded.

import { VISIBILITY, normalizeVisibility } from "../output-intent.js";
import { EVENT_TYPE } from "../event-type.js";
import { resolveAuthoringOrganisationName } from "../qc/first-person-actor.mjs";
import { PG_WRITING_EVENT } from "./pg-binding.mjs";
import { completeBody as directComplete, publicBody as directPublic } from "./text-types/NEW_DIRECT_INVESTMENT.mjs";
import { completeBody as fundComplete, publicBody as fundPublic } from "./text-types/NEW_PRIMARY_COMMITMENT.mjs";

export { DO_NOT_INVENT_FIRM_LINE, PG_WRITING_EVENT } from "./pg-binding.mjs";

const PG_EVENT_VERB = {
  [PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT]: "invested in",
  [PG_WRITING_EVENT.NEW_FUND_COMMITMENT]: "committed to",
};

function trimHouse(value) {
  return resolveAuthoringOrganisationName(value);
}

function openingFormula(houseName) {
  if (houseName) {
    return `"In {TRANSACTION_DATE}, ${houseName} {VERB} {INVESTMENT}, a..."`;
  }
  return `"In {TRANSACTION_DATE}, write the {VERB} event for {INVESTMENT} without naming a firm, a..."`;
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

function promptTemplate(eventKey, visibility, houseName) {
  const vis = normalizeVisibility(visibility);
  if (eventKey === PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT) {
    return vis === VISIBILITY.PUBLIC ? directPublic(houseName) : directComplete(houseName);
  }
  if (eventKey === PG_WRITING_EVENT.NEW_FUND_COMMITMENT) {
    return vis === VISIBILITY.PUBLIC ? fundPublic(houseName) : fundComplete(houseName);
  }
  return null;
}

/** @type {Record<string, Record<string, string>>} */
export const PG_WRITING_PROMPTS = {
  [PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT]: {
    [VISIBILITY.COMPLETE]: directComplete(null),
    [VISIBILITY.PUBLIC]: directPublic(null),
  },
  [PG_WRITING_EVENT.NEW_FUND_COMMITMENT]: {
    [VISIBILITY.COMPLETE]: fundComplete(null),
    [VISIBILITY.PUBLIC]: fundPublic(null),
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
