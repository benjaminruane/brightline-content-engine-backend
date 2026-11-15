// Drafting instructions, one layer at a time. The join reproduces today's prompt bytes.
// A layer that already lives inside the text-type scaffold contributes nothing here,
// so the same sentences are not written twice.

import { getOutputTypeLabel, normalizeOutputType } from "../output-intent.js";
import { resolveAuthoringOrganisationName } from "../qc/first-person-actor.mjs";
import { outputTypeGuidance } from "./outputTypeGuidance.js";
import { buildPgWritingScaffold } from "./pg-writing-prompts.mjs";
import { styleGuideScaffold } from "./styleGuideScaffold.js";

export const LAYER_ORDER = [
  "house-rules",
  "output-type",
  "visibility",
  "text-type",
  "source-roles",
  "this-run",
];

export const CONTEXT_SOURCE_LINE =
  "Sources marked as context are background only. Do not take a figure, date or name from a context source unless a facts source states it.";

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
    { id: "house-rules", text: scaffold ? "" : styleGuideScaffold },
    { id: "output-type", text: output.text },
    { id: "visibility", text: "" },
    { id: "text-type", text: scaffold },
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
