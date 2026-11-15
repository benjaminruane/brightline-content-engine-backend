// lib/prompt-library/index.js
//
// X3.1.0: Base prompt layer — buildBasePrompt for Generate/Rewrite; detectRewriteClash for advisory warnings.

import { normalizeOutputType, getOutputTypeLabel } from "../output-intent.js";
import { houseVoiceIsThirdPerson } from "./house-voice.mjs";
import { composeBasePrompt } from "./compose.mjs";

export { normalizePgInvestmentName } from "./pg-writing-prompts.mjs";

export {
  enforcePgCommentaryWordLimit,
  getPgCommentaryWordLimit,
  splitPgDraftOutput,
} from "./pg-word-limit.mjs";

export {
  applyPgFundCommitmentPostFilter,
  cleanPgCommentary,
  normalizePgHouseStyleCharacters,
  assemblePgDraftOutput,
  joinPgDraftParts,
  PG_METHODOLOGY_DELIMITER,
} from "./pg-commentary-cleanup.mjs";

/**
 * Build the deterministic base prompt for an output type (global scaffold + tone/voice + structure).
 * WR1: When eventType × visibility matches a PG demo scaffold, that block replaces the generic scaffold.
 * @param {{
 *   outputType: string,
 *   visibility?: string,
 *   eventType?: string,
 *   transactionDate?: string,
 *   investment?: string,
 *   specialInstructions?: string,
 *   sources?: Array<object>,
 *   authoringOrganisation?: string|null,
 * }} opts
 * @returns {{ basePromptText: string, baseGuidanceSummary: string[] }}
 */
export function buildBasePrompt(opts) {
  return composeBasePrompt(opts);
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

  // Voice clash: house voice is third-person; user asks for first person / we / our / my
  const firstPersonCues = /\bfirst\s*person\b|\buse\s+[iI]\b|\buse\s+we\b|\bour\s+voice\b|\bmy\s+voice\b|\bwrite\s+in\s+[iI]\b|\bwrite\s+in\s+we\b/;
  if (houseVoiceIsThirdPerson(ot) && firstPersonCues.test(lower)) {
    reasons.push("instructions request first-person or 'we'/'our' voice; house voice for this output type is third-person");
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
