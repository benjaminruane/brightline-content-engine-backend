// Drafting instructions, one layer at a time. The join reproduces today's prompt bytes.
// A layer that already lives inside the text-type scaffold contributes nothing here,
// so the same sentences are not written twice.

import { getOutputTypeLabel, normalizeOutputType } from "../output-intent.js";
import { resolveAuthoringOrganisationName } from "../qc/first-person-actor.mjs";
import { HOUSE_RULES_TEXT } from "./house-rules.mjs";
import { outputTypeGuidance } from "./outputTypeGuidance.js";
import { buildPgWritingScaffold } from "./pg-writing-prompts.mjs";
import { styleGuideScaffold } from "./styleGuideScaffold.js";
import { textTypeModule } from "./text-types/index.mjs";

export const LAYER_ORDER = [
  "house-rules",
  "output-type",
  "visibility",
  "text-type",
  "source-roles",
  "this-run",
];

export const CONTEXT_SOURCE_LINE =
  "Facts sources are authoritative for this transaction. Context sources may supply description and background, such as what a company does, its market and the manager's rationale. Where a context source disagrees with a facts source, the facts source wins. Do not present anything from a context source as part of this transaction unless a facts source ties it to this transaction.";

function textTypeScaffold(opts) {
  const houseName = resolveAuthoringOrganisationName(opts.authoringOrganisation);
  return (
    buildPgWritingScaffold(opts.eventType, opts.visibility, {
      transactionDate: opts.transactionDate,
      investment: opts.investment,
      specialInstructions: opts.specialInstructions,
      sources: opts.sources,
      authoringOrganisation: houseName,
    }) || ""
  );
}

function coverBlock(eventType) {
  const list = textTypeModule(eventType)?.mustCover;
  if (!Array.isArray(list) || list.length === 0) return "";
  return `Cover, in this order:\n- ${list.join("\n- ")}`;
}

function houseRulesText(hasScaffold) {
  if (hasScaffold) return HOUSE_RULES_TEXT;
  return `${HOUSE_RULES_TEXT}\n\n${styleGuideScaffold}`;
}

function textTypeText(opts, scaffold) {
  const cover = coverBlock(opts.eventType);
  if (scaffold) return cover ? `${scaffold}\n\n${cover}` : scaffold;
  const guidance = textTypeModule(opts.eventType)?.guidance;
  const paragraph = typeof guidance === "string" ? guidance.trim() : "";
  return [paragraph, cover].filter(Boolean).join("\n\n");
}

function outputTypeBlock(outputType) {
  const ot = normalizeOutputType(outputType);
  const guidance = outputTypeGuidance[ot];
  if (!guidance) return { text: "", summary: [] };
  const toneBlock =
    guidance.toneVoice && guidance.toneVoice.length > 0
      ? "Tone/voice:\n- " + guidance.toneVoice.join("\n- ")
      : "";
  const structureBlock =
    guidance.structure && guidance.structure.length > 0
      ? "Structure:\n- " + guidance.structure.join("\n- ")
      : "";
  const blocks = [toneBlock, structureBlock].filter(Boolean);
  const text =
    blocks.length > 0 ? "Output type: " + getOutputTypeLabel(ot) + "\n\n" + blocks.join("\n\n") : "";
  return {
    text,
    summary: [...(guidance.toneVoice || []), ...(guidance.structure || [])],
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
export function composeLayers(opts) {
  const scaffold = textTypeScaffold(opts);
  const output = outputTypeBlock(opts.outputType);
  return [
    { id: "house-rules", text: houseRulesText(Boolean(scaffold)) },
    { id: "output-type", text: output.text },
    { id: "visibility", text: "" },
    { id: "text-type", text: textTypeText(opts, scaffold) },
    { id: "source-roles", text: sourceRolesText(opts.sources) },
    { id: "this-run", text: "" },
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
    .filter((layer) => layer.id !== "source-roles")
    .map((layer) => layer.text)
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const roles = sourceRolesText(opts.sources);
  const basePromptText = roles ? `${body}\n\n${roles}` : body;
  return {
    basePromptText,
    baseGuidanceSummary:
      summary.length > 0 ? summary : ["Follow house rules and output-type conventions."],
  };
}
