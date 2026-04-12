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
      "Opens with 'Dear Investors,' salutation.",
      "Direct, narrative, professional tone suitable for limited partners.",
      "Third-person for portfolio company references (the firm, the company); first-person plural for the GP's voice (we believe, we expect, we view).",
      "Forward-looking language is appropriate where hedged (we expect, we believe, in our view).",
      "Avoid hype; stay factual and investment-grade.",
    ],
    structure: [
      "Clear narrative arc: context, investment decision, thesis, supporting evidence, outlook.",
      "Include key metrics, figures, and specific evidence from sources where they materially strengthen the narrative. Prioritise quality over quantity — include only detail that directly supports the investment thesis or outlook. Do not list all available data points.",
      "Longer and more discursive than reporting commentary; paragraphs may develop a single point in depth.",
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
      "Open with 'FOR IMMEDIATE RELEASE' on its own line.",
      "Follow with a headline in title case.",
      "Lead paragraph answers who, what, when, where in 2–3 sentences.",
      "If a quote is provided (speaker name and title), include it as a direct quote in the second paragraph, attributed exactly as given. If no quote is provided, include a clearly marked placeholder: [QUOTE: Insert quote from [Speaker Name], [Title]]",
      "Close with a short boilerplate paragraph placeholder: [BOILERPLATE: About [Firm Name]]",
      "Evidence-bounded: do not invent facts or quotes.",
    ],
  },
  [OUTPUT_TYPE.LINKEDIN_POST]: {
    toneVoice: [
      "First-person plural (we, our) for the firm's voice.",
      "Concise, direct, suitable for a professional audience on LinkedIn.",
      "Investment-grade language; not casual, not marketing puffery.",
      "Engaging opening line; avoid generic openers.",
    ],
    structure: [
      "Open with a strong hook line (announcement, retrospective, or insight framing).",
      "1–3 short paragraphs or a short paragraph followed by a bullet list summarising the investment thesis.",
      "If a URL is provided, include it as the final line of the post, preceded by a natural call to action (e.g. 'Read more:').",
      "Evidence-bounded: do not invent facts.",
    ],
  },
};
