// api/analyse-statements.js
//
// Analyses a draft into atomic statements, assigns a reliability score (0–1)
// and category to each, and returns rich fields:
// - explanation (why this score)
// - implication (what it means / what to do next)
//
// IMPORTANT BEHAVIOUR:
// - Always uses public web search to enrich analysis (independent of any UI toggle).

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "./_web.js";

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clamp01(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeCategory(cat) {
  const c = typeof cat === "string" ? cat.trim() : "";
  if (!c) return "Other";
  return c;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : "gpt-4o-mini";

    if (!draftText || !draftText.trim()) {
      return res.status(400).json({ error: "Missing or invalid draftText" });
    }

    // --- Always-on web search (Statement Analysis) -------------------------
    const searchQuery = deriveQueryFromDraft(draftText);
    const search = await tavilySearch({ query: searchQuery, maxResults: 6 });

    const webBlock = search.ok ? formatWebResultsForPrompt(search.results) : "";
    const references = search.ok ? webResultsToReferences(search.results) : [];

    const systemPrompt = `
You are an expert analyst and fact-checker.

GOAL:
Turn the draft into atomic statements, and for each statement:
- assign a category
- assign a reliability score from 0.0 to 1.0
- provide a concise explanation of the score
- provide an implication (what the score means / what to do next)

Use the WEB RESULTS to corroborate or challenge statements where possible.
If the web results are irrelevant or insufficient, say so in the explanation.

OUTPUT:
Return ONLY valid JSON with this schema:
{
  "statements": [
    {
      "id": number,
      "text": string,
      "category": string,
      "score": number,          // 0..1
      "explanation": string,    // never "-" or empty
      "implication": string     // never "-" or empty
    }
  ],
  "summary": { "note": string|null }
}

SCORING GUIDANCE:
- 0.85–1.00: well-supported by sources/web or directly evidenced
- 0.60–0.84: plausible but not fully corroborated / missing specifics
- 0.35–0.59: weak support, vague, or depends on unstated assumptions
- 0.00–0.34: likely false, contradicted, or clearly speculative presented as fact

Keep statements truly atomic. Prefer 6–20 statements, depending on draft length.
`.trim();

    const userPrompt = `
DRAFT:
${draftText}

WEB RESULTS:
${webBlock || "(no web results retrieved)"}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};

    const statements = Array.isArray(parsed.statements)
      ? parsed.statements.map((s, idx) => {
          const id = typeof s?.id === "number" ? s.id : idx + 1;
          const text = typeof s?.text === "string" ? s.text.trim() : "";
          const category = normalizeCategory(s?.category);
          const score = clamp01(typeof s?.score === "number" ? s.score : 0);

          let explanation =
            typeof s?.explanation === "string" ? s.explanation.trim() : "";
          let implication =
            typeof s?.implication === "string" ? s.implication.trim() : "";

          if (!explanation || explanation === "-" || explanation === "—") {
            explanation =
              "Insufficient information to provide a robust explanation; treat this statement cautiously.";
          }
          if (!implication || implication === "-" || implication === "—") {
            implication =
              "Consider adding sources, clarifying specifics, or removing/rephrasing if it cannot be supported.";
          }

          return { id, text, category, score, explanation, implication };
        })
      : [];

    const summary =
      parsed.summary && typeof parsed.summary === "object" ? parsed.summary : {};

    return res.status(200).json({
      ok: true,
      statements,
      summary: {
        note: typeof summary.note === "string" ? summary.note : null,
      },
      meta: {
        webSearch: {
          enabled: true,
          used: Boolean(search.ok && references.length),
          provider: "tavily",
          query: searchQuery,
          resultsCount: references.length,
          error: search.ok ? null : search.error || "Web search failed",
          note: "Statement Analysis always uses web search (independent of the draft toggle).",
        },
        references,
        model: completion.model || modelId,
        usage: {
          promptTokens: completion.usage?.prompt_tokens ?? null,
          completionTokens: completion.usage?.completion_tokens ?? null,
          totalTokens: completion.usage?.total_tokens ?? null,
        },
      },
    });
  } catch (err) {
    console.error("Statement analysis error:", err);
    return res.status(500).json({
      error: "Failed to analyse statements",
      details: err?.message || String(err),
    });
  }
}
