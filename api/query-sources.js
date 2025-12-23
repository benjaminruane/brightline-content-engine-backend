// api/query-sources.js
//
// Sources Q&A endpoint.
// Behaviour: NO web search. Answers MUST be grounded strictly in the provided sources.

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

function normalizeSources(sources) {
  const arr = Array.isArray(sources) ? sources : [];
  return arr
    .map((s) => ({
      name: typeof s?.name === "string" ? s.name : "Untitled source",
      url: typeof s?.url === "string" ? s.url : null,
      kind: typeof s?.kind === "string" ? s.kind : "other",
      text: typeof s?.text === "string" ? s.text : "",
    }))
    .filter((s) => (s.text || "").trim().length > 0);
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
      typeof req.body === "string" ? safeJsonParse(req.body || "{}") : req.body || {};

    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const draftText = typeof body?.draftText === "string" ? body.draftText : "";
    const sourcesUsedRows = Array.isArray(body?.sourcesUsedRows) ? body.sourcesUsedRows : [];
    const sources = normalizeSources(body?.sources);

    if (!question) return res.status(400).json({ error: "Missing question" });

    const model =
      process.env.OPENAI_SOURCES_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = [
      "You answer questions ONLY using the provided source texts below.",
      "Do NOT browse the web. Do NOT use outside knowledge.",
      "If the answer is not in the sources, say so plainly.",
      "When possible, cite the source by name (and URL if present).",
      "If asked whether a source was used, use the provided 'Sources Used' list.",
    ].join("\n");

    const sourcesUsedText =
      sourcesUsedRows.length > 0
        ? sourcesUsedRows
            .map((r, i) => {
              const name = typeof r?.name === "string" ? r.name : `Source ${i + 1}`;
              const usedPortion = typeof r?.usedPortion === "string" ? r.usedPortion : "";
              const refs = typeof r?.refs === "string" ? r.refs : "";
              return `- ${name}${usedPortion ? ` — used: ${usedPortion}` : ""}${
                refs ? ` — refs: ${refs}` : ""
              }`;
            })
            .join("\n")
        : "(No sources-used list available.)";

    const sourcesText = sources
      .map((s, i) => {
        const header = `[${i + 1}] ${s.name}${s.url ? ` (${s.url})` : ""}`;
        const text =
          s.text.length > 12000 ? s.text.slice(0, 12000) + "\n…[truncated]" : s.text;
        return `${header}\n${text}`;
      })
      .join("\n\n---\n\n");

    const user = [
      "QUESTION:",
      question,
      "",
      "DRAFT (optional context):",
      draftText ? draftText.slice(0, 8000) : "(No draft provided.)",
      "",
      "SOURCES USED (as recorded by the app):",
      sourcesUsedText,
      "",
      "SOURCE TEXTS:",
      sourcesText || "(No source texts provided.)",
    ].join("\n");

    const resp = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const answer = resp?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ answer });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to answer sources question",
      details: err?.message || String(err),
    });
  }
}
