import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";
import { normalizePublicationState } from "../lib/source-publication-state.mjs";
import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";

const EMPTY_RESPONSE = { ok: true, description: "", publicationState: "unknown" };

const SUMMARIZE_SYSTEM_PROMPT = `You are a document analyst. Summarise what this document is in exactly 2 short sentences, maximum 30 words per sentence. Be factual and specific. Cover document type, subject matter, and key content. Always begin with the document type (e.g. 'A press release...', 'An investment memo...', 'An industry note...'). Describe what the document is, not what it says. Do not use filler phrases. Do not start with 'This document'. Do not describe file format or technical metadata.

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

- 'internal_or_draft' when the document contains clear markers of being internal, confidential, or pre-publication. Treat any of the following as a clear marker:
  • 'CONFIDENTIAL', 'INTERNAL USE ONLY', 'DO NOT DISTRIBUTE', 'NDA-bound' notices
  • internal memo format with 'To:' / 'From:' / 'Re:' header fields addressed to a named internal audience (e.g. 'Investment Committee')
  • investment committee paper, board paper, or IC discussion format
  • explicit 'draft' tag or watermark
  • internal investor update marked confidential

- 'unknown' for documents that lack clear markers either way. Examples:
  • generic prose that could be from anywhere
  • a fragment with no header, footer, or distribution metadata
  • a document whose markers genuinely conflict (e.g. an internal draft of a press release that also has a CONFIDENTIAL header — defer to 'unknown')

Conservatism rule (as tie-breaker, not default): when a document's markers point clearly in one direction, classify it that direction. When markers are absent or genuinely conflicting, classify 'unknown'. Do NOT use 'unknown' as a default when clear markers are present.

Return publicationState as a separate field in the JSON response.

Return valid JSON only in this exact shape (no markdown, no code fences):
{
  "description": "<two-sentence summary>",
  "publicationState": "published_external" | "internal_or_draft" | "unknown"
}`;

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

function parseSummarizeResponse(raw) {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) return { description: "", publicationState: "unknown" };
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) return { description: "", publicationState: "unknown" };
    try {
      parsed = JSON.parse(content.slice(start, end + 1));
    } catch {
      return { description: "", publicationState: "unknown" };
    }
  }
  if (!parsed || typeof parsed !== "object") {
    return { description: "", publicationState: "unknown" };
  }
  const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
  const publicationState = normalizePublicationState(parsed.publicationState);
  return { description, publicationState };
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(200).json(EMPTY_RESPONSE);

  const source = req.body && typeof req.body === "object" ? req.body : {};
  const mimeType = typeof source?.mimeType === "string" ? source.mimeType.trim() : "";
  const sourceName = typeof source?.name === "string" ? source.name : "Untitled source";
  const sourceType = typeof source?.type === "string" ? source.type : "file";
  let llmInput = "";

  if (mimeType === "application/pdf") {
    try {
      const prep = await prepareUploadedSourcesForPipeline([
        {
          id: "summarize_source",
          name: sourceName,
          title: sourceName,
          type: sourceType,
          mimeType,
          contentBase64: typeof source?.contentBase64 === "string" ? source.contentBase64 : "",
        },
      ]);
      const extractedText = typeof prep?.sources?.[0]?.text === "string" ? prep.sources[0].text.trim() : "";
      if (extractedText.length < 50) {
        return res.status(200).json(EMPTY_RESPONSE);
      }
      llmInput = extractedText.slice(0, 2000);
    } catch {
      return res.status(200).json(EMPTY_RESPONSE);
    }
  } else {
    const text = typeof source?.text === "string" ? source.text.trim() : "";
    if (!text) return res.status(200).json(EMPTY_RESPONSE);
    llmInput = text.slice(0, 2000);
  }

  if (!llmInput) return res.status(200).json(EMPTY_RESPONSE);

  const modelConfig = STAGE_MODELS["summarize-source"];
  if (!hasProviderApiKey(modelConfig.provider)) return res.status(200).json(EMPTY_RESPONSE);

  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
        { role: "user", content: llmInput },
      ],
      responseFormat: "json",
      traceName: "source-description-generation",
      spanName: "source-description-generation",
      metadata: { route: "summarize-source" },
    });
    const { description, publicationState } = parseSummarizeResponse(completion?.text);
    return res.status(200).json({ ok: true, description, publicationState });
  } catch {
    return res.status(200).json(EMPTY_RESPONSE);
  } finally {
    await flushObservability();
  }
}
