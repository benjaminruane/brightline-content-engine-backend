// Drafting instructions, one layer at a time.

import { getOutputTypeLabel, normalizeOutputType, visibilityForDraft, VISIBILITY } from "../output-intent.js";
import { getEventTypeFraming } from "../event-type.js";
import { authoringOrganisationText, DRAFTING_DECISION_TEXT, houseRulesForEvent } from "./house-rules.mjs";
import { lengthInstruction, modelLengthLimit, outputTypeGuidance } from "./outputTypeGuidance.js";
import { dealStatusDraftLine } from "../deal-status.mjs";
import { generalMethodologyNoteInstruction, methodologyNoteInstruction } from "./methodology-note.mjs";
import { textTypeModule } from "./text-types/index.mjs";
import { styleGuideText } from "../house-style-choice.mjs";

export const LAYER_ORDER = [
  "house-rules",
  "output-type",
  "visibility",
  "text-type",
  "source-roles",
  "this-run",
  "methodology-note",
];

export const CONTEXT_SOURCE_LINE =
  "Facts sources are authoritative for this transaction. Context sources may supply description and background, such as what a company does, its market and the manager's rationale. Where a context source disagrees with a facts source, the facts source wins. Do not present anything from a context source as part of this transaction unless a facts source ties it to this transaction.";

function coverBlock(eventType, ceiling) {
  const mod = textTypeModule(eventType);
  const list = Array.isArray(mod?.mustCover) ? mod.mustCover.filter((item) => typeof item === "string" && item.trim()) : [];
  const essential = Array.isArray(mod?.essential)
    ? mod.essential.filter((item) => typeof item === "string" && item.trim())
    : [];
  if (mod?.priorities === true && list.length) {
    return `Weigh these. They are priorities, not a checklist. Use one only where the sources support it.\n- ${list.join("\n- ")}`;
  }
  if (!list.length && !essential.length) return "";
  const essentialSet = new Set(essential);
  const first = essential.length ? essential : list.filter((item) => essentialSet.has(item));
  const rest = list.filter((item) => !essentialSet.has(item));
  const parts = ["Cover, in this order:"];
  if (first.length) parts.push(`Essential:\n- ${first.join("\n- ")}`);
  if (rest.length) {
    const stop = Number.isFinite(ceiling)
      ? ` Omit every one of them if including it would pass ${ceiling} words. Do not write a section called where space allows.`
      : "";
    parts.push(`Where space allows. These points are optional. Include one only when the essentials are covered and room remains.${stop}\n- ${rest.join("\n- ")}`);
  }
  return parts.join("\n\n");
}

function ceilingFor(opts) {
  return modelLengthLimit(opts?.outputType, opts?.maxWords);
}

export function leaveOutItems(eventType) {
  const list = textTypeModule(eventType)?.exclude;
  if (!Array.isArray(list)) return [];
  return list.filter((item) => typeof item === "string" && item.trim());
}

export function leaveOutPrompt(eventType) {
  const items = leaveOutItems(eventType);
  if (!items.length) return "";
  return `The writer was told to leave out the items below. Do not raise a statement for leaving them out.\n- ${items.join("\n- ")}`;
}

function excludeBlock(eventType) {
  const list = leaveOutItems(eventType);
  if (!list.length) return "";
  return `Leave out, unless the special instructions ask for it:\n- ${list.join("\n- ")}`;
}

function houseRulesText(opts) {
  const guide = styleGuideText(opts?.houseStyle);
  const spelling = "Use the account's spelling throughout. Do not copy a source's spelling when it differs.";
  const decision = DRAFTING_DECISION_TEXT;
  const organisation = authoringOrganisationText(opts?.authoringOrganisation);
  if (opts?.eventType === "GENERAL") return `${decision}\n\n${organisation}\n\n${guide}\n\n${spelling}`;
  return `${houseRulesForEvent(opts?.eventType)}\n\n${decision}\n\n${organisation}\n\n${guide}\n\n${spelling}`;
}

function generaliseGuidance(guidance) {
  const swap = (line) => String(line)
    .replace("Investment-grade language; not casual, not marketing puffery.", "Plain professional language; not casual, not marketing puffery.")
    .replace("summarising the investment thesis.", "summarising the point.")
    .replace("Professional, factual, investment-grade.", "Professional, factual, and plain.")
    .replace("Written for the firm's clients and investors.", "Written for the reader this text is for.")
    .replace("Avoid hype; stay factual and investment-grade.", "Avoid hype; stay factual.");
  return {
    toneVoice: (guidance?.toneVoice || []).map(swap),
    structure: (guidance?.structure || []).map(swap),
  };
}

function guidanceFor(opts, ot) {
  if (typeof opts === "object" && opts?.eventType === "GENERAL") {
    if (ot === "PRESS_RELEASE" || ot === "LINKEDIN_POST") return generaliseGuidance(outputTypeGuidance[ot]);
    return outputTypeGuidance.GENERAL_TEXT;
  }
  return outputTypeGuidance[ot];
}

function instructionBlock(opts) {
  const eventType = typeof opts?.eventType === "string" ? opts.eventType : "";
  const otherUpdate = eventType === "SPECIAL_TOPIC";
  const text = typeof opts?.specialInstructions === "string" ? opts.specialInstructions.trim() : "";
  if (otherUpdate && !text) {
    return "Special instructions were not provided. Do not choose a subject, and do not write a general update.";
  }
  if (!text) return "";
  if (!otherUpdate) return `Special instructions: ${text}`;
  return `Special instructions: ${text}\n\nThese instructions define the subject and the lead. Open with what they ask for. Use the sources as evidence for that subject. Leave out source material that does not serve that purpose. The points about the asset, the transaction, the rationale and the outcome apply only where they serve these instructions.`;
}

function textTypeText(opts) {
  const guidance = textTypeModule(opts.eventType)?.guidance;
  const paragraph = typeof guidance === "string" ? guidance.trim() : "";
  const cover = coverBlock(opts.eventType, ceilingFor(opts));
  const exclude = excludeBlock(opts.eventType);
  const framing = typeof opts.eventType === "string" && opts.eventType.trim()
    ? getEventTypeFraming(opts.eventType)
    : "";
  return [paragraph, instructionBlock(opts), cover, exclude, framing].filter(Boolean).join("\n\n");
}

function visibilityText(outputType, visibility) {
  const vis = visibilityForDraft(outputType, visibility);
  if (vis === VISIBILITY.PUBLIC) return "Use publicly safe wording; avoid internal-only detail.";
  return "Complete version: full internal brief, all relevant detail.";
}

function outputTypeBlock(opts) {
  const outputType = typeof opts === "string" ? opts : opts?.outputType;
  const ot = normalizeOutputType(outputType);
  const guidance = guidanceFor(opts, ot);
  if (!guidance) return { text: "", summary: [] };
  const length = lengthInstruction(ot, typeof opts === "string" ? undefined : opts?.maxWords);
  const structure = [...(guidance.structure || []), length].filter(Boolean);
  const toneBlock =
    guidance.toneVoice && guidance.toneVoice.length > 0
      ? "Tone/voice:\n- " + guidance.toneVoice.join("\n- ")
      : "";
  const structureBlock = structure.length > 0 ? "Structure:\n- " + structure.join("\n- ") : "";
  const blocks = [toneBlock, structureBlock].filter(Boolean);
  const text =
    blocks.length > 0 ? "Output type: " + getOutputTypeLabel(ot) + "\n\n" + blocks.join("\n\n") : "";
  return {
    text,
    summary: [...(guidance.toneVoice || []), ...structure],
  };
}

export function bannedWordsLine(bannedWords) {
  const words = Array.isArray(bannedWords) ? bannedWords : [];
  return words.length
    ? `Do not use any of the following words in your output: ${words.join(", ")}.`
    : "";
}

export function sourceRolesText(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const hasContext = list.some((source) => source && source.role === "context");
  return hasContext ? CONTEXT_SOURCE_LINE : "";
}

export function appendContextSourceLine(text, sources) {
  const line = sourceRolesText(sources);
  if (!line) return text;
  return `${text}\n\n${line}`;
}

/**
 * @param {object} opts
 * @returns {{ id: string, text: string }[]}
 */
export function writingBrief(opts = {}) {
  const output = outputTypeBlock(opts);
  return [output.text, visibilityText(opts.outputType, opts.visibility), textTypeText(opts)]
    .filter(Boolean)
    .join("\n\n");
}

export function composeLayers(opts) {
  const output = outputTypeBlock(opts);
  return [
    { id: "house-rules", text: houseRulesText(opts) },
    { id: "output-type", text: output.text },
    { id: "visibility", text: visibilityText(opts.outputType, opts.visibility) },
    { id: "text-type", text: textTypeText(opts) },
    { id: "source-roles", text: sourceRolesText(opts.sources) },
    { id: "this-run", text: dealStatusDraftLine(opts?.dealStatus, opts?.eventType) },
    { id: "methodology-note", text: opts?.eventType === "GENERAL" ? generalMethodologyNoteInstruction() : methodologyNoteInstruction(opts?.eventType) },
  ];
}

/**
 * @param {object} opts
 * @returns {{ basePromptText: string, baseGuidanceSummary: string[] }}
 */
export function composeBasePrompt(opts) {
  const layers = composeLayers(opts);
  const summary = outputTypeBlock(opts.outputType).summary;
  const body = layers
    .filter((layer) => layer.id !== "source-roles" && layer.id !== "methodology-note")
    .map((layer) => layer.text)
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const roles = sourceRolesText(opts.sources);
  const note = layers.find((layer) => layer.id === "methodology-note")?.text || "";
  const withRoles = roles ? `${body}\n\n${roles}` : body;
  const basePromptText = note ? `${withRoles}\n\n${note}` : withRoles;
  return {
    basePromptText,
    baseGuidanceSummary:
      summary.length > 0 ? summary : ["Follow house rules and output-type conventions."],
  };
}
