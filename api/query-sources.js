// api/query-sources.js
//
// Sources Q&A endpoint.
// Uses provenance sources only (uploaded sources + webReferences from Generate/Rewrite).
// Does NOT perform fresh web search.

import OpenAI from "openai";
import { formatWebResultsForPrompt } from "../lib/web.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function clamp01(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: "Server is missing OPENAI_API_KEY" });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const sources = Array.isArray(body.sources) ? body.sources : [];
    // Accept provenance webReferences from request (from Generate/Rewrite for this version)
    const webReferences = Array.isArray(body.webReferences) ? body.webReferences : [];
    const usedReferenceIds = Array.isArray(body.usedReferenceIds) ? body.usedReferenceIds : [];
    const flags = body.flags || {};
    const versionNumber = typeof body.versionNumber === "number" ? body.versionNumber : null;
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";

    if (!question) return res.status(400).json({ error: "Missing question" });

    // Format web sources for prompt (only include those that were actually used/cited)
    const usedWebReferences = webReferences.filter((ref) => {
      const id = typeof ref?.id === "number" ? ref.id : null;
      return id !== null && usedReferenceIds.includes(id);
    });

    const webSearchResults = usedWebReferences.map((ref) => ({
      title: ref?.title || "",
      url: ref?.url || "",
      content: ref?.snippet || ref?.content || "",
    }));

    const webSourcesText = usedWebReferences.length > 0
      ? formatWebResultsForPrompt({ results: webSearchResults })
      : "";

    const versionLabel = versionNumber ? `Version ${versionNumber}` : "this draft version";
    const hasUnattributedEnrichment = Boolean(flags?.unattributedEnrichment);

    const system = `
You answer questions about ${versionLabel} using the sources that were used to produce it.

Available sources:
- Uploaded sources: memos, emails, documents, or URLs provided by the user
- Web sources: web pages that were cited when generating ${versionLabel} (if any)

Attribution rules:
- If a claim is supported by uploaded sources: say so explicitly (e.g., "According to the uploaded memo...").
- If a claim is supported by cited web sources: cite them with [1], [2] at the exact supporting sentence.
- Citations [n] must map to the numbered web sources listed below.
- ${hasUnattributedEnrichment ? `IMPORTANT: This draft version contains information that is not attributable to the sources used (uploaded sources or cited web sources). If asked about unattributed information, explain that it is not properly sourced and should be corrected by re-running Rewrite with proper citations.` : ""}

General rules:
- Answer using ONLY the sources that were used for ${versionLabel}.
- Keep responses concise and directly answer the question.
- Do NOT mention: "instructions", "system prompt", "WEB SOURCES section", "provided list", or any implementation details.
- Do NOT claim the model "used web search" unless citations [n] exist in the draft.
- Speak in product terms: "sources used for ${versionLabel}", "uploaded memo", "web sources (if any)".

Return ONLY valid JSON:
{
  "answer": "string (may include markdown with bracket citations [1], [2], etc. for web sources)",
  "confidence": number between 0 and 1,
  "confidenceReason": "string or null"
}
`.trim();

    // Build user prompt with context about web sources
    let webSourcesSection = "";
    if (usedWebReferences.length > 0) {
      webSourcesSection = webSourcesText;
    } else if (webReferences.length > 0 && usedReferenceIds.length === 0) {
      webSourcesSection = "Web sources were retrieved but none were cited in this draft version.";
    } else {
      webSourcesSection = "No web sources were used for this draft version. The draft relied solely on the uploaded sources.";
    }

    const user = `
QUESTION:
${question}

DRAFT CONTEXT (${versionLabel}):
${draftText || "(none)"}

UPLOADED SOURCES (used for ${versionLabel}):
${sources.length ? JSON.stringify(sources, null, 2) : "(none)"}

WEB SOURCES (cited in ${versionLabel}, if any):
${webSourcesSection}
${hasUnattributedEnrichment ? `\n\nATTRIBUTION FLAG: This draft version contains unattributed enrichment (facts not supported by uploaded sources and not cited to web sources).` : ""}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};

    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : "";
    const confidence = clamp01(parsed.confidence);
    const confidenceReason =
      typeof parsed.confidenceReason === "string" && parsed.confidenceReason.trim()
        ? parsed.confidenceReason.trim()
        : null;

    return res.status(200).json({
      ok: true,
      answer,
      confidence,
      confidenceReason,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Query sources failed" });
  }
}
