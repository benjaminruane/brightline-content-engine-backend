// lib/prompt-library/index.js
//
// X3.1.0: Base prompt layer — buildBasePrompt for Generate/Rewrite; detectRewriteClash for advisory warnings.

import { normalizeOutputType, getOutputTypeLabel } from "../output-intent.js";
import { outputTypeGuidance } from "./outputTypeGuidance.js";
import { styleGuideScaffold } from "./styleGuideScaffold.js";

/**
 * Build the deterministic base prompt for an output type (global scaffold + tone/voice + structure).
 * @param {{ outputType: string, visibility?: string, eventType?: string }} opts
 * @returns {{ basePromptText: string, baseGuidanceSummary: string[] }}
 */
export function buildBasePrompt({ outputType, visibility, eventType }) {
  const ot = normalizeOutputType(outputType);
  const guidance = outputTypeGuidance[ot];
  const summary = [];

  let basePromptText = styleGuideScaffold;

  if (guidance) {
    const toneBlock =
      guidance.toneVoice && guidance.toneVoice.length > 0
        ? "Tone/voice:\n- " + guidance.toneVoice.join("\n- ")
        : "";
    const structureBlock =
      guidance.structure && guidance.structure.length > 0
        ? "Structure:\n- " + guidance.structure.join("\n- ")
        : "";
    const blocks = [toneBlock, structureBlock].filter(Boolean);
    if (blocks.length > 0) {
      basePromptText += "\n\nOutput type: " + getOutputTypeLabel(ot) + "\n\n" + blocks.join("\n\n");
    }
    summary.push(...(guidance.toneVoice || []), ...(guidance.structure || []));
  }

  return {
    basePromptText: basePromptText.trim(),
    baseGuidanceSummary: summary.length > 0 ? summary : ["Follow house rules and output-type conventions."],
  };
}

/**
 * Lightweight heuristic clash detection: Rewrite instructions vs base guidance for the given output type.
 * No model calls; deterministic keyword/phrase checks. Used to add an advisory warning only.
 * @param {{ outputType: string, rewriteInstructions: string }} opts
 * @returns {{ hasClash: boolean, reasons: string[] }}
 */
export function detectRewriteClash({ outputType, rewriteInstructions }) {
  const reasons = [];
  const instructions = typeof rewriteInstructions === "string" ? rewriteInstructions : "";
  const lower = instructions.toLowerCase().trim();
  if (!lower) return { hasClash: false, reasons: [] };

  const ot = normalizeOutputType(outputType);

  // Output-type mismatch cues: user seems to ask for a different format
  if (/\bpress\s*release\b/.test(lower) && ot !== "PRESS_RELEASE") {
    reasons.push("instructions mention press release but output type is " + getOutputTypeLabel(ot));
  }
  if (/\blinkedin\b/.test(lower) && ot !== "LINKEDIN_POST") {
    reasons.push("instructions mention LinkedIn but output type is " + getOutputTypeLabel(ot));
  }
  if (/\binvestor\s*letter\b/.test(lower) && ot !== "INVESTOR_LETTER") {
    reasons.push("instructions mention investor letter but output type is " + getOutputTypeLabel(ot));
  }
  if (/\breporting\s*commentary\b|\bcommentary\b/.test(lower) && ot !== "REPORTING_COMMENTARY") {
    // Only flag if they explicitly say "reporting commentary" while we're not that type
    if (/reporting\s*commentary|as\s+commentary/.test(lower)) {
      reasons.push("instructions mention reporting commentary but output type is " + getOutputTypeLabel(ot));
    }
  }

  // Voice clash: base prefers third-person; user asks for first person / we / our / my
  const firstPersonCues = /\bfirst\s*person\b|\buse\s+[iI]\b|\buse\s+we\b|\bour\s+voice\b|\bmy\s+voice\b|\bwrite\s+in\s+[iI]\b|\bwrite\s+in\s+we\b/;
  if (firstPersonCues.test(lower)) {
    reasons.push("instructions request first-person or 'we'/'our' voice; base guidance prefers third-person");
  }

  // Tone clash: casual/hype/emojis/viral on formal types
  const casualCues = /\bemojis?\b|\bcasual\b|\bsuper\s*hype\b|\bviral\b|\bpunchy\b/;
  if (casualCues.test(lower) && (ot === "REPORTING_COMMENTARY" || ot === "INVESTOR_LETTER")) {
    reasons.push("instructions request casual/hype/viral tone; base guidance for " + getOutputTypeLabel(ot) + " is professional and factual");
  }

  return {
    hasClash: reasons.length > 0,
    reasons,
  };
}
