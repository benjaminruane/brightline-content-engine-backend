// api/query-sources.js
//
// Sources Q&A endpoint.
// Behaviour: NO web search. Answers MUST be grounded strictly in the provided sources
// OR (when source texts are missing/thin) in the SOURCES USED audit list.

import OpenAI from "openai";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// NOTE: OpenAI client is created inside the handler to avoid import-time failures.
function safeJsonParse(text) {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: "Server is missing OPENAI_API_KEY" });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
      if (r.url) parts.push(`url=${r.url}`);
      if (r.usedPortion) parts.push(`used=${r.usedPortion}`);
      if (r.refs) parts.push(`refs=${r.refs}`);
      return parts.join(" — ");
    })
    .join("\n");
}

function normalizeSourceTexts(sources) {
  const arr = Array.isArray(sources) ? sources : [];
  return arr
    .map((s, i) => {
      const name = typeof s?.name === "string" ? s.name : `Source ${i + 1}`;
      const url = typeof s?.url === "string" ? s.url : null;
      const text = typeof s?.text === "string" ? s.text : "";
      return { name, url, text };
    })
    .filter((s) => s.name);
}

function looksLikeStatementMappingQuestion(q) {
  const t = String(q || "").toLowerCase();
  return (
    t.includes("what statements") ||
    t.includes("which statements") ||
    t.includes("sourced directly") ||
    t.includes("trace") ||
    t.includes("attribution") ||
    t.includes("mapped to")
  );
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const sourcesUsedRows = normalizeSourcesUsedRows(body.sourcesUsedRows);
    const sources = normalizeSourceTexts(body.sources);

    if (!question) return res.status(400).json({ error: "Missing question" });

    const sourcesUsedText = sourcesUsedRowsToText(sourcesUsedRows);

    const totalSourceChars = sources.reduce((sum, s) => sum + (s.text ? s.text.length : 0), 0);
    const sourceTextsAreThin = totalSourceChars < 400; // heuristic

    // If source texts are missing/thin, answer using sources-used audit list rather than "Not found"
    if (sourceTextsAreThin) {
      // Special handling: statement mapping questions cannot be proven from audit rows alone
      if (looksLikeStatementMappingQuestion(question)) {
        const auditAnswer = `
Answer:
I can’t reliably map specific *statements* to sources from the "Sources used" audit list alone (it shows what was used, not a statement-by-statement trace). However, based on the audit list, here is what the draft appears to have drawn from each provided source:

Evidence:
${sourcesUsedRows
  .map((r) => {
    const label = r.url ? `${r.name} (${r.url})` : r.name;
    const used = r.usedPortion ? r.usedPortion : "No used-portion detail available.";
    return `- ${label}: ${used}`;
  })
  .join("\n")}
`.trim();

        return res.status(200).json({ answer: auditAnswer });
      }

      const auditAnswer = `
Answer:
I don’t have the full source text available to search directly, so I’m answering based on the "Sources used" audit list.

Evidence:
${sourcesUsedText}
`.trim();

      return res.status(200).json({ answer: auditAnswer });
    }

    const system = `
You answer questions using ONLY the provided SOURCE TEXTS and the SOURCES USED audit list.

Rules:
- Do NOT browse the web. Do NOT use outside knowledge.
- If the answer is not present in the SOURCE TEXTS, you MAY still answer using the SOURCES USED audit list (usedPortion/refs), but clearly label that as "Based on Sources used".
- Avoid boilerplate.
- Prefer this response format:

Answer:
<your answer>

Evidence:
- <source name> (and URL if present): <short supporting snippet or pointer>
- ...
`.trim();

    const user = `
QUESTION:
${question}

DRAFT (may be helpful context):
${draftText ? draftText.slice(0, 4000) : "(none)"}

SOURCES USED (audit list):
${sourcesUsedText}

SOURCE TEXTS:
${sources
  .map((s) => {
    const header = s.url ? `${s.name} (${s.url})` : s.name;
    const excerpt = s.text.slice(0, 6000);
    return `---\n${header}\n${excerpt}\n`;
  })
  .join("\n")}
`.trim();

    const resp = await client.chat.completions.create({
      model: "gpt-5.1",
      temperature: 0.2,
      max_completion_tokens: 700,
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
