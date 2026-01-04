// api/analyse-statements.js
//
// Statement analysis endpoint (Review).

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "../lib/web.js";

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
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";

    if (!draftText.trim()) return res.status(400).json({ error: "Missing draftText" });

    // Analysis always uses web search
    // Force publicSearch = true regardless of client request (publicSearch from body is ignored)
    const publicSearch = true;
    const query = deriveQueryFromDraft(draftText);
    const search = await tavilySearch({ query, maxResults: 6 });
    const webBlock = formatWebResultsForPrompt(search);
    const webReferences = webResultsToReferences(search?.results || []);

    const system = `
You are the "Review" engine inside Content Engine.

Extract atomic factual statements from the draft and assess reliability.

Citations:
- Use bracket citations [1], [2], ... referencing the WEB REFERENCES list.
- If web results are empty, do not invent sources; say evidence is unavailable.

Return ONLY JSON:
{
  "statements": [
    {
      "text": "string",
      "assessment": {
        "reliabilityScore": number,
        "reliabilityLabel": "High|Medium|Low",
        "reasons": ["string", ...],
        "citations": [1,2]
      }
    }
  ]
}
`.trim();

    const user = `
DRAFT:
${draftText}

WEB RESULTS:
${webBlock || "(none)"}

WEB REFERENCES:
${
  webReferences
    .slice(0, 8)
    .map((r, i) => `[${i + 1}] ${r.title} — ${r.url}`)
    .join("\n") || "(none)"
}
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
    const statements = Array.isArray(parsed.statements) ? parsed.statements : [];

    return res.status(200).json({
      ok: true,
      statements,
      references: webReferences,
      meta: {
        webSearch: { enabled: true, used: Boolean(search?.ok && (search?.results || []).length) },
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Analyse failed" });
  }
}
