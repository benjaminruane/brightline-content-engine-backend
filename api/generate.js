// /api/generate.js (or .ts if you're using TypeScript)
import OpenAI from "openai";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader(
    "Access-Control-Allow-Origin",
    origin === "null" ? "*" : origin
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      modelId,
      temperature,
      maxTokens,
      baseSystem,
      userPrompt,
      projectId,
    } = req.body || {};

    if (!userPrompt || typeof userPrompt !== "string") {
      return res
        .status(400)
        .json({ error: "Missing or invalid userPrompt" });
    }

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4o-mini",
      temperature:
        typeof temperature === "number" ? temperature : 0.3,
      max_tokens:
        typeof maxTokens === "number" && maxTokens > 0
          ? maxTokens
          : 2048,
      messages: [
        { role: "system", content: baseSystem || "You are a helpful assistant." },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent = completion?.choices?.[0]?.message?.content;

    const draftText =
      typeof rawContent === "string" ? rawContent.trim() : "";

    if (!draftText) {
      console.error(
        "No draft text in OpenAI completion:",
        JSON.stringify(completion, null, 2)
      );
      // IMPORTANT: return a clear error, not "API returned no draft text"
      // so we can distinguish between backend issues and toast text.
      return res.status(500).json({
        error: "Model returned empty content",
      });
    }

    // Shape this to exactly what your frontend expects:
    return res.status(200).json({
      draftText, // <- THIS is what the frontend will use
      model: completion.model,
      projectId: projectId || null,
      usage: completion.usage || null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Failed to generate draft",
      details: err.message || String(err),
    });
  }
}
