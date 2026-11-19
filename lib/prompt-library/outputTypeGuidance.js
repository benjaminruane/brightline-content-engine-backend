// lib/prompt-library/outputTypeGuidance.js
//
// X3.1.0: Deterministic base guidance per output type (tone/voice + structure).
// Phase 1: tone/voice + structure only. Keyed by canonical OUTPUT_TYPE enum.

import { OUTPUT_TYPE, normalizeOutputType } from "../output-intent.js";
import { houseVoiceWritingLine } from "./house-voice.mjs";

export const OUTPUT_TYPE_LENGTH = {
  [OUTPUT_TYPE.REPORTING_COMMENTARY]: { min: 100, max: 150 },
  [OUTPUT_TYPE.INVESTOR_LETTER]: { min: 200, max: 300 },
  [OUTPUT_TYPE.PRESS_RELEASE]: { min: 200, max: 300 },
  [OUTPUT_TYPE.LINKEDIN_POST]: { min: 80, max: 150 },
};

export function outputTypeWordCeiling(outputType) {
  const row = OUTPUT_TYPE_LENGTH[outputType];
  return row ? row.max : null;
}

const LENGTH_PLAN = "Plan the text to this length from the start. Cover the essential points, then the others where space allows, saying each more briefly rather than dropping one. You may run up to 10% over when that is needed to cover the essential points. Do not pad to reach a length.";

/** One length instruction. A typed limit replaces the output type's range. */
export function lengthInstruction(outputType, maxWords) {
  const row = OUTPUT_TYPE_LENGTH[normalizeOutputType(outputType)];
  const n = Number(maxWords);
  const typed = Number.isFinite(n) && n >= 1;
  const span = typed ? `${Math.floor(n)} words` : row ? `${row.min} to ${row.max} words` : "";
  if (!span) return "";
  return `Length: ${span}. ${LENGTH_PLAN}`;
}

/** A count past the limit plus 10% is over. The limit itself, plus 10%, is not. */
export function exceedsLengthAllowance(words, limit) {
  const count = Number(words);
  const cap = Number(limit);
  if (!Number.isFinite(count) || !Number.isFinite(cap) || cap <= 0) return false;
  return count > cap * 1.1;
}

function audienceLine(outputType) {
  if (outputType === OUTPUT_TYPE.PRESS_RELEASE) return "Written for the media and the public.";
  if (outputType === OUTPUT_TYPE.LINKEDIN_POST) return "Written for a professional network.";
  return "Written for the firm's clients and investors.";
}

/** The typed limit, as the single length instruction. */
export function wordLimitLine(maxWords) {
  const n = Number(maxWords);
  if (!Number.isFinite(n) || n < 1) return "";
  return lengthInstruction(OUTPUT_TYPE.REPORTING_COMMENTARY, n);
}

/** @type {Record<string, { toneVoice: string[], structure: string[] }>} */
export const outputTypeGuidance = {
  [OUTPUT_TYPE.REPORTING_COMMENTARY]: {
    toneVoice: [
      audienceLine(OUTPUT_TYPE.REPORTING_COMMENTARY),
      "Professional, factual, investment-grade.",
      houseVoiceWritingLine(OUTPUT_TYPE.REPORTING_COMMENTARY),
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
      audienceLine(OUTPUT_TYPE.INVESTOR_LETTER),
      "Opens with 'Dear Investors,' salutation.",
      "Direct, narrative, professional tone suitable for limited partners.",
      houseVoiceWritingLine(OUTPUT_TYPE.INVESTOR_LETTER),
      "Forward-looking language is appropriate where hedged (we expect, we believe, in our view).",
      "Avoid hype; stay factual and investment-grade.",
    ],
    structure: [
      "Clear narrative arc: context, investment decision, thesis, supporting evidence, outlook.",
      "Include key metrics, figures, and specific evidence from sources where they materially strengthen the narrative. Prioritise quality over quantity. Include only detail that directly supports the investment thesis or outlook. Do not list all available data points.",
      "Longer and more discursive than reporting commentary; paragraphs may develop a single point in depth.",
      "Evidence-bounded: do not invent facts.",
    ],
  },
  [OUTPUT_TYPE.PRESS_RELEASE]: {
    toneVoice: [
      audienceLine(OUTPUT_TYPE.PRESS_RELEASE),
      houseVoiceWritingLine(OUTPUT_TYPE.PRESS_RELEASE),
      "Headline-ready; avoid internal jargon.",
    ],
    structure: [
      "Open with 'FOR IMMEDIATE RELEASE' on its own line.",
      "Follow with a headline in title case.",
      "After the headline, open the lead with the dateline placeholder '[City], [Date]', unless the source gives both the city and the date.",
      "Lead paragraph answers who, what, when, where in 2 to 3 sentences.",
      "If a quote is provided (speaker name and title), include it as a direct quote in the second paragraph, attributed exactly as given. If no quote is provided, include a clearly marked placeholder: [QUOTE: Insert quote from [Speaker Name], [Title]]",
      "Close with a short boilerplate paragraph placeholder: [BOILERPLATE: About [Firm Name]]",
      "Evidence-bounded: do not invent facts or quotes.",
    ],
  },
  [OUTPUT_TYPE.LINKEDIN_POST]: {
    toneVoice: [
      audienceLine(OUTPUT_TYPE.LINKEDIN_POST),
      houseVoiceWritingLine(OUTPUT_TYPE.LINKEDIN_POST),
      "Concise, direct, suitable for a professional audience on LinkedIn.",
      "Investment-grade language; not casual, not marketing puffery.",
      "Engaging opening line; avoid generic openers.",
    ],
    structure: [
      "Open with a strong hook line (announcement, retrospective, or insight framing).",
      "1 to 3 short paragraphs or a short paragraph followed by a bullet list summarising the investment thesis.",
      "If a URL is provided, include it as the final line of the post, preceded by a natural call to action (e.g. 'Read more:').",
      "Evidence-bounded: do not invent facts.",
    ],
  },
};
