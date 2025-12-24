// api/query-sources.js
//
// Sources Q&A endpoint.
// Behaviour: NO web search. Answers MUST be grounded strictly in the provided sources.
// NOTE: We *can* still answer audit-style questions (e.g., "did web search get used?")
// using the provided sourcesUsedRows + any web references you pass in as rows.

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

function normalizeSourcesUsedRows(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  return arr
    .map((r, i) => {
      const name = typeof r?.name === "string" ? r.name : `Source ${i + 1}`;
      const type = typeof r?.type === "string" ? r.type : "";
      const url = typeof r?.url === "string" ? r.url : null;
      const usedPortion = typeof r?.usedPortion === "string" ? r.usedPortion : "";
      const refsArr = Array.isArray(r?.refs) ? r.refs.filter((x) => typeof x === "string") : [];
      const refsStr = typeof r?.refs === "string" ? r.refs : "";
      const refs = refsArr.length ? refsArr.join("; ") : refsStr;

      return { name, type, url, usedPortion, refs };
    })
    .filter((x) => x.name || x.url);
}

function sourcesUsedRowsToText(rows) {
  if (!rows.length) return "(No sources-used list available.)";
  return rows
    .map((r) => {
      const parts = [];
      parts.push(`- ${r.name}`);
      if (r.type) parts.push(`type=${r.type}`);
      if (r.url) parts.push(`url=${r.url}`);
      if (r.usedPortion) parts.push(`used=${r.usedPortion}`);
      if (r.refs) parts.push(`refs=${r.refs}`);
      return parts.join(" — ");
    })
    .join("\n");
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

    const sourcesUsedRows = normalizeSourcesUsedRows(body?.sourcesUsedRows);
    const sources = normalizeSources(body?.sources);

    if (!question) return res.status(400).json({ error: "Missing question" });

    const model =
      process.env.OPENAI_SOURCES_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Helpful “audit” signals (no web browsing required)
    const usedWebRows = sourcesUsedRows.filter((r) => {
      const t = (r.type || "").toLowerCase();
      const u = (r.url || "").toLowerCase();
      return t === "web" || u.startsWith("http");
    });
    const hasAnySourcesUsed = sourcesUsedRows.length > 0;
    const hasAnyWebUsed = usedWebRows.length > 0;

    const system = `
You answer questions using ONLY the provided SOURCE TEXTS and the SOURCES USED audit list.

Rules:
- Do NOT browse the web. Do NOT use outside knowledge.
- Answer directly and concisely. Avoid generic boilerplate.
- If the answer is not present in the SOURCE TEXTS, say: "Not found in the provided sources."
- If the user asks whether a source (including web search results) was used:
  - Use ONLY the provided "SOURCES USED" list to answer.
  - You may say whether web search appears to have been used based on that list.
- Prefer this response format:

Answer:
<your answer>

Evidence:
- <source name> (and URL if present): <short supporting snippet or pointer>
- ...

If not found, do:

Answer:
Not found in the provided sources.

What I checked:
- <which sources you checked>

Diagnostics (only when relevant):
- If the question is about web-search usage, explain that this endpoint does not browse; it only uses the audit list + provided texts.
`.trim();

    const sourcesUsedText = sourcesUsedRowsToText(sourcesUsedRows);

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
      "SOURCES USED (audit list recorded by the app):",
      sourcesUsedText,
      "",
      "AUDIT FLAGS:",
      `- hasAnySourcesUsed: ${String(hasAnySourcesUsed)}`,
      `- hasAnyWebUsedFromAuditList: ${String(hasAnyWebUsed)}`,
      hasAnyWebUsed ? `- webUsedRows: ${usedWebRows.map((r) => r.url || r.name).join(" | ")}` : "",
      "",
      "SOURCE TEXTS:",
      sourcesText || "(No source texts provided.)",
    ]
      .filter(Boolean)
      .join("\n");

    const resp = await client.chat.completions.create({
      model,
      temperature: 0.15,
      max_completion_tokens: 900,
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
