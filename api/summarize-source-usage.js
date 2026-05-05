import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

function safeBody(req) {
  if (req?.body && typeof req.body === "object") return req.body;
  if (typeof req?.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeUsedFor(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length <= 20) return trimmed;
  return tokens.slice(0, 20).join(" ");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(200).json({ ok: true, usedFor: "" });

  const body = safeBody(req);
  const sourceName = typeof body?.sourceName === "string" ? body.sourceName.trim() : "";
  const snippet = typeof body?.snippet === "string" ? body.snippet.trim() : "";
  const draftText = typeof body?.draftText === "string" ? body.draftText.trim().slice(0, 1000) : "";

  const modelConfig = STAGE_MODELS["summarize-source-usage"];
  if (!sourceName || !snippet || !draftText || !hasProviderApiKey(modelConfig.provider)) {
    return res.status(200).json({ ok: true, usedFor: "" });
  }

  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a document analyst. In one sentence of maximum 20 words, describe specifically what content from this source document was used in the draft. Begin with a verb (e.g. 'Provided', 'Supplied', 'Contributed'). Reference the actual subject matter — for example financial figures, product details, market context. Do not write generic descriptions. Do not describe the source document type.",
        },
        {
          role: "user",
          content: `Source name: ${sourceName}\nSnippet: ${snippet}\nDraft excerpt: ${draftText}`,
        },
      ],
      traceName: "used-for-synthesis",
      spanName: "used-for-synthesis",
      metadata: { route: "summarize-source-usage" },
    });

    const usedFor = normalizeUsedFor(completion?.text || "");
    return res.status(200).json({ ok: true, usedFor });
  } catch {
    return res.status(200).json({ ok: true, usedFor: "" });
  } finally {
    await flushObservability();
  }
}
