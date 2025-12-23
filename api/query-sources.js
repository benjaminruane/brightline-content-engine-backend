// api/query-sources.js
//
// Sources Q&A endpoint.
// Purpose: answer questions specifically about which sources were used in producing a draft,
// and why certain provided sources may not have been used.
//
// NOTE: This is intentionally narrower than /api/query (Enquire) to avoid feature overlap.

import OpenAI from "openai";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clamp01(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && typeof r === "object")
    .slice(0, 40)
    .map((r, idx) => ({
      idx: idx + 1,
      id: typeof r.id === "string" ? r.id : null,
      name: typeof r.name === "string" ? r.name : "Source",
      url: typeof r.url === "string" ? r.url : null,
      usedPortion: typeof r.usedPortion === "string" ? r.usedPortion : "",
      references: Array.isArray(r.references) ? r.references.slice(0, 12) : [],
    }));
}

function normalizeProvidedSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .filter((s) => s && typeof s === "object")
    .slice(0, 60)
    .map((s, idx) => ({
      idx: idx + 1,
      id: typeof s.id === "string" ? s.id : null,
      kind: typeof s.kind === "string" ? s.kind : null, // file|url|text etc
      name: typeof s.name === "string" ? s.name : "Source",
      url: typeof s.url === "string" ? s.url : null,
    }));
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return res.status(400).json({ error: "Missing question" });

    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : "gpt-4o-mini";

    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const versionLabel =
      typeof body.versionLabel === "string" ? body.versionLabel : "";

    const usedRows = normalizeRows(body.sourcesUsedRows);
    const providedSources = normalizeProvidedSources(body.sourcesProvided);

    const system = `
You are "Sources Q&A" inside Content Engine.

Your job:
- Answer ONLY questions about sourcing: which provided sources were used, what portions were used,
  and why a provided source might not have been used.
- If the question asks for page numbers or exact spans, only provide them if present in the inputs.
  Do NOT invent page numbers. If not available, say so calmly and explain what would be required to support it later.

Style:
- Calm, business-grade, concise.
- Prefer direct answers, then a short rationale.

Output JSON ONLY:
{
  "answer": string,
  "confidence": number, // 0..1
  "confidenceReason": string|null,
  "references": [
    {
      "kind": "used_source" | "provided_source",
      "index": number,          // 1-based index in the list you cite
      "label": string
    }
  ]
}

When you reference an item from SOURCES USED list, cite it as [U#].
When you reference an item from PROVIDED SOURCES list, cite it as [P#].
Include citations inline in the answer when relevant.
`.trim();

    const usedBlock = usedRows.length
      ? usedRows
          .map((r) => {
            const refTxt =
              r.references && r.references.length ? ` refs: ${r.references.join("; ")}` : "";
            const portion = r.usedPortion ? ` used: ${r.usedPortion}` : " used: (unspecified)";
            const url = r.url ? ` url: ${r.url}` : "";
            return `[U${r.idx}] ${r.name}${url}${portion}${refTxt}`;
          })
          .join("\n")
      : "(none recorded for this version)";

    const providedBlock = providedSources.length
      ? providedSources
          .map((s) => {
            const url = s.url ? ` url: ${s.url}` : "";
            const kind = s.kind ? ` (${s.kind})` : "";
            return `[P${s.idx}] ${s.name}${kind}${url}`;
          })
          .join("\n")
      : "(none)";

    const user = `
VERSION:
${versionLabel || "(unknown)"}

QUESTION:
${question}

DRAFT (may be empty):
${draftText ? draftText.slice(0, 3500) : "(none)"}

SOURCES USED (for this version):
${usedBlock}

PROVIDED SOURCES (available to the engine):
${providedBlock}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      max_completion_tokens: 700,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};

    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : "";

    const confidence = clamp01(parsed.confidence);
    const confidenceReason =
      typeof parsed.confidenceReason === "string" && parsed.confidenceReason.trim()
        ? parsed.confidenceReason.trim()
        : null;

    const references = Array.isArray(parsed.references)
      ? parsed.references
          .filter((r) => r && typeof r === "object")
          .slice(0, 12)
          .map((r) => ({
            kind: r.kind === "provided_source" ? "provided_source" : "used_source",
            index: typeof r.index === "number" ? r.index : null,
            label: typeof r.label === "string" ? r.label : "",
          }))
      : [];

    return res.status(200).json({
      ok: true,
      answer,
      confidence,
      confidenceReason,
      references,
      meta: {
        model: completion.model || modelId,
        note: "Sources Q&A is limited to source-usage questions and does not invent page references.",
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to process sources question",
      details: err?.message || String(err),
    });
  }
}
