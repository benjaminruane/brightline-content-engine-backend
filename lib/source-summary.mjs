// Classification of an uploaded source: a short description, a publication
// state, and a suggested drafting role. The role is the model's judgement
// from the document and the named text type. Code does not decide it.

import { EVENT_TYPE, getEventTypeLabel } from "./event-type.js";
import { normalizePublicationState } from "./source-publication-state.mjs";

const KNOWN_TEXT_TYPES = new Set(Object.values(EVENT_TYPE));

export const SUMMARIZE_SYSTEM_PROMPT = `You are a document analyst. Summarise what this document is in exactly 2 short sentences, maximum 30 words per sentence. Be factual and specific. Cover document type, subject matter, and key content. Always begin with the document type (e.g. 'A press release...', 'An investment memo...', 'An industry note...'). Describe what the document is, not what it says. Do not use filler phrases. Do not start with 'This document'. Do not describe file format or technical metadata.

Classify this source's publication state. Return one of:

- 'published_external' when the document contains clear markers of having been distributed to a general external audience. The document does not need to be independently verified as published — clear distribution markers in the document itself are sufficient. Treat ANY of the following as a clear marker:
  • 'FOR IMMEDIATE RELEASE', 'PRESS RELEASE', or similar distribution header
  • a publication date paired with a location header in press-release format (e.g. 'Baar-Zug, Switzerland — 12 March 2026')
  • a 'Media contact:' / 'Press contact:' / 'For more information:' line with contact details
  • an 'About [Company]' boilerplate footer that describes the company in third person to a general audience
  • published article format with byline and publication date
  • SEC filing format and identifiers (10-K, 10-Q, 8-K, S-1, etc.) or other regulator filing markers
  • published earnings call or conference call transcript markers
  • published academic paper format (abstract, journal name, DOI, etc.)
  One clear marker is sufficient. Two or more leave no doubt.

- 'restricted' when the document is distributed under restricted-distribution terms — meaning the audience is defined and the content is not freely publishable. This includes both internal documents and external documents shared under restricted terms. Treat ANY of the following as clear markers:

  Internal documents:
  • 'CONFIDENTIAL', 'INTERNAL USE ONLY', 'DO NOT DISTRIBUTE', or 'NDA-bound' notices
  • Internal memo format with 'To:' / 'From:' / 'Re:' header fields addressed to a named internal audience (e.g. 'Investment Committee')
  • Investment committee paper, board paper, valuation paper, strategy note, market analysis for internal circulation
  • Explicit 'draft' tag or watermark
  • Internal investor update marked confidential
  • Internal AGM/EGM materials or board packs

  External-but-restricted documents:
  • Investor letter, LP report, fund update, capital account statement, capital call notice, or distribution notice addressed to a defined audience of limited partners or investors
  • Quarterly or annual report from an external fund or asset manager (e.g. another GP's quarterly investor letter)
  • Investor presentation, pitch deck, or AGM/EGM materials addressed to LPs or a defined named audience
  • Any document marked or contextually addressed to a specific named audience that is not the general public

  Calibration note: polished production format does NOT equal public distribution. A professionally-designed LP presentation deck is still 'restricted' if its audience is a defined set of investors rather than the general public. Judge audience and distribution, not production quality.

- 'unknown' for documents that lack clear markers either way. Examples:
  • generic prose that could be from anywhere
  • a fragment with no header, footer, or distribution metadata
  • a document whose markers genuinely conflict (e.g. an internal draft of a press release that also has a CONFIDENTIAL header — defer to 'unknown')

Conservatism rule (as tie-breaker, not default): when a document's markers point clearly in one direction, classify it that direction. When markers are absent or genuinely conflicting, classify 'unknown'. Do NOT use 'unknown' as a default when clear markers are present.

Also return suggestedRole. The user message names the text type this draft is for. Return "facts" when this document is a record of the transaction that text type is about. Return "context" when this document supplies background for that draft and is not itself the record of the transaction. Judge from the document and the named text type. When the user message says the text type is not given, omit suggestedRole.

Return publicationState and suggestedRole as separate fields in the JSON response.

Return valid JSON only in this exact shape (no markdown, no code fences):
{
  "description": "<two-sentence summary>",
  "publicationState": "published_external" | "restricted" | "unknown",
  "suggestedRole": "facts" | "context"
}`;

export function textTypeForSummary(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const trimmed = raw.trim();
  if (!KNOWN_TEXT_TYPES.has(trimmed)) return null;
  return { id: trimmed, label: getEventTypeLabel(trimmed) };
}

/**
 * @param {string} raw
 * @param {{ allowRole?: boolean }} [options]
 * @returns {{ description: string, publicationState: string, suggestedRole: string }}
 */
export function parseSummarizeResponse(raw, options = {}) {
  const allowRole = options.allowRole !== false;
  const empty = { description: "", publicationState: "unknown", suggestedRole: "" };
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) return empty;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) return empty;
    try {
      parsed = JSON.parse(content.slice(start, end + 1));
    } catch {
      return empty;
    }
  }
  if (!parsed || typeof parsed !== "object") return empty;
  const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
  const publicationState = normalizePublicationState(parsed.publicationState);
  const role = parsed.suggestedRole;
  const suggestedRole = allowRole && (role === "facts" || role === "context") ? role : "";
  return { description, publicationState, suggestedRole };
}

export function summaryUserMessage(textTypeLabel, documentText) {
  const label = typeof textTypeLabel === "string" && textTypeLabel.trim() ? textTypeLabel.trim() : "(not given)";
  const body = typeof documentText === "string" ? documentText : "";
  return `Text type: ${label}\n\n${body}`;
}
