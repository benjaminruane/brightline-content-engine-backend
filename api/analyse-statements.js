// api/analyse-statements.js
//
// Analyses a draft into atomic statements, assigns a reliability
// score (0–1) and category to each, and returns a summary object
// with safe defaults.
//
// - Uses OpenAI chat.completions.create() (no response_format).
// - Robust JSON extraction (handles extra prose around JSON).
// - Returns a predictable shape for the frontend.

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

function extractAssistantText(message) {
  if (!message) return "";
  const c = message.content;
  if (typeof c === "string") return c;

  if (Array.isArray(c)) {
    const parts = c
      .map((p) => {
        if (!p) return "";
        if (typeof p === "string") return p;
        if (typeof p === "object") {
          if (typeof p.text === "string") return p.text;
          if (typeof p.content === "string") return p.content;
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("\n");
  }

  return "";
}

function safeJsonFromText(text) {
  if (!text || typeof text !== "string") return null;

  // Find the first JSON object block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normaliseResult(obj) {
  const rawStatements = Array.isArray(obj?.statements) ? obj.statements : [];
  const statements = rawStatements
    .map((s, idx) => {
      const text = (s?.text || s?.statement || "").toString().trim();
      if (!text) return null;

      let score = s?.score;
      if (typeof score !== "number") score = Number(score);
      if (!Number.isFinite(score)) score = null;
      if (typeof score === "number") score = Math.max(0, Math.min(1, score));

      const category = (s?.category || "Other").toString().trim() || "Other";

      return {
        id: s?.id || `s${idx + 1}`,
        text,
        category,
        score,
      };
    })
    .filter(Boolean);

  const summary = typeof obj?.summary === "object" && obj?.summary ? obj.summary : {};

  const out = {
    ok: true,
    statements,
    summary: {
      note:
        typeof summary?.note === "string"
          ? summary.note
          : statements.length === 0
          ? "The analysis completed but no individual statements were extracted from this draft. This can happen if the text is very short or mostly bullet points. Try rerunning analysis after refining the draft."
          : null,
    },
  };

  return out;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const { draftText, modelId } = body;

    if (!draftText || typeof draftText !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'draftText' in request body" });
    }

    const system = [
      `You are an analyst. Extract atomic factual statements from a draft and score their reliability.`,
      `Return ONLY valid JSON. No markdown, no commentary.`,
      ``,
      `Scoring: score is a number from 0.0 to 1.0 where 1.0 = strongly supported and specific; 0.0 = speculative/unsupported.`,
      `Categories: choose one of: Fact, Estimate, Opinion, Forward-looking, Other.`,
      ``,
      `JSON schema:`,
      `{`,
      `  "statements": [`,
      `    { "id": "s1", "text": "…", "category": "Fact|Estimate|Opinion|Forward-looking|Other", "score": 0.0 }`,
      `  ],`,
      `  "summary": { "note": "optional short note" }`,
      `}`,
    ].join("\n");

    const user = [
      `DRAFT:`,
      draftText.trim(),
      ``,
      `INSTRUCTIONS:`,
      `Extract up to 25 atomic statements. If there are none, return "statements": [] and include a short summary.note.`,
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4o-mini",
      temperature: 0.2,
      max_completion_tokens: 900,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const msg = completion.choices?.[0]?.message || null;
    const text = extractAssistantText(msg).trim();

    const parsed = safeJsonFromText(text);

    if (!parsed) {
      // Fail soft: return empty statements but keep UX sane
      return res.status(200).json(
        normaliseResult({
          statements: [],
          summary: {
            note:
              "Analysis ran but returned an unexpected format. Try again, or reduce the draft length if very large.",
          },
        })
      );
    }

    return res.status(200).json(normaliseResult(parsed));
  } catch (err) {
    console.error("analyse-statements error:", err);
    const message = err && typeof err === "object" && "message" in err ? err.message : "Unknown error";
    return res.status(500).json({ error: "Failed to analyse statements", details: message });
  }
}
