// api/rewrite.js
import OpenAI from "openai";
import { tavilySearch, formatWebResultsForPrompt, webResultsToReferences } from "./_web.js";

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

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};

    // ✅ Accept multiple field names to avoid brittle integration
    const baseText =
      (typeof body.baseText === "string" && body.baseText) ||
      (typeof body.draftText === "string" && body.draftText) ||
      (typeof body.text === "string" && body.text) ||
      (typeof body.input === "string" && body.input) ||
      "";

    const instructions = typeof body.instructions === "string" ? body.instructions : "";
    const publicSearch = Boolean(body.publicSearch);
    const model = typeof body.model === "string" ? body.model : "gpt-5.1";

    if (!baseText || !baseText.trim()) {
      return res.status(400).json({ error: "Missing base text to rewrite" });
    }

    // Optional: bring in web context if enabled for Rewrite (toggle-controlled)
    let webBlock = "";
    let webReferences = [];

    if (publicSearch) {
      const queryHint =
        (typeof body.title === "string" && body.title.trim()) ||
        (typeof body.query === "string" && body.query.trim()) ||
        "";

      const q = queryHint || "Background context for rewriting an investment update";
      const results = await tavilySearch(q);
      webBlock = formatWebResultsForPrompt(results);
      webReferences = webResultsToReferences(results);
    }

    const system = `You are a precise investment-writing assistant. Rewrite the provided base text using the instructions. Preserve meaning unless instructions imply changes. Keep output clean and well formatted.`;

    const user = [
      instructions ? `Rewrite instructions:\n${instructions}\n` : "",
      publicSearch && webBlock ? `Web context:\n${webBlock}\n` : "",
      `Base text:\n${baseText}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
    });

    const content = completion?.choices?.[0]?.message?.content || "";
    const rewritten = content.trim();

    if (!rewritten) {
      return res.status(500).json({ error: "Rewrite returned empty output" });
    }

    return res.status(200).json({
      draftText: rewritten,
      references: webReferences, // ✅ keep top-level for frontend simplicity
      meta: {
        references: webReferences,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Rewrite failed" });
  }
}
