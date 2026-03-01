// lib/prompt-library/outputTypeGuidance.js
//
// X3.1.0: Deterministic base guidance per output type (tone/voice + structure).
// Phase 1: tone/voice + structure only. Keyed by canonical OUTPUT_TYPE enum.

import { OUTPUT_TYPE } from "../output-intent.js";

/** @type {Record<string, { toneVoice: string[], structure: string[] }>} */
export const outputTypeGuidance = {
  [OUTPUT_TYPE.REPORTING_COMMENTARY]: {
    toneVoice: [
      "Professional, factual, investment-grade.",
      "Third-person by default (the firm, the company, it, they).",
      "Avoid hype and marketing puffery.",
      "Clear, concise English; short sentences.",
    ],
    structure: [
      "Lead with the transaction or event; then context and merits.",
      "Include investment thesis, value creation angle, and thematic relevance where supported by sources.",
      "Evidence-bounded: do not invent facts; prefer claims supported by provided sources.",
    ],
  },
  [OUTPUT_TYPE.INVESTOR_LETTER]: {
    toneVoice: [
      "Direct, narrative, professional tone suitable for limited partners.",
      "Third-person unless explicitly overridden (the firm, the company).",
      "Avoid hype; stay factual and investment-grade.",
    ],
    structure: [
      "Clear narrative arc: context, decision, rationale, outlook.",
      "Include performance or positioning detail where supported by sources.",
      "Evidence-bounded: do not invent facts.",
    ],
  },
  [OUTPUT_TYPE.PRESS_RELEASE]: {
    toneVoice: [
      "Factual, third-person, concise; suitable for external distribution.",
      "Headline-ready; avoid internal jargon.",
      "Tone may be slightly more promotional than reporting commentary where appropriate for the format.",
    ],
    structure: [
      "Lead with headline-style opening; then key facts in short paragraphs.",
      "Include who, what, when, where; quote or attribution if supported by sources.",
      "Evidence-bounded: do not invent facts or quotes.",
    ],
  },
  [OUTPUT_TYPE.LINKEDIN_POST]: {
    toneVoice: [
      "Concise, engaging, suitable for social sharing.",
      "Third-person by default unless user requests first-person.",
      "Tone may be slightly more conversational or punchy than formal reporting.",
    ],
    structure: [
      "Hook or lead line; then 1–3 short paragraphs.",
      "Suitable length for a post; avoid long blocks of text.",
      "Evidence-bounded: do not invent facts.",
    ],
  },
};
