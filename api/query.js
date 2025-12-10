// /api/query.js
//
// Ask AI – answers questions about the current draft + sources,
// always using web search. Returns:
//   { answer, confidence, references: [{ url, title }] }

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- CORS helper --------------------------------------------------
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
// ------------------------------------------------------------------

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
      question,
      draft,
      sources,
      model,
      // publicSearch is ignored here – Ask AI always uses web search
    } = req.body || {};

    const safeQuestion =
      typeof question === "string" ? question.trim() : "";
    const safeDraft =
      typeof draft === "string" ? draft.trim() : "";

    const safeSources = Array.isArray(sources) ? sources : [];

    if (!safeQuestion) {
      return res
        .status(400)
        .json({ error: "Question is required." });
    }

    // Compact the sources to avoid sending huge blobs
    const sourceSummaries = safeSources.map((s, idx) => {
      const label = s.name || s.url || `Source ${idx + 1}`;
      const text =
        typeof s.text === "string"
          ? s.text.slice(0, 6000)
          : "";
      return `Source ${idx + 1} – ${label}:\n${text}`;
    });

    const sourcesBlock =
      sourceSummaries.length > 0
        ? sourceSummaries.join("\n\n-----\n\n")
        : "No explicit sources were provided; rely on the draft text and web search.";

    const resolvedModel =
      typeof model === "string" && model.trim()
        ? model.trim()
        : "gpt-4.1-mini";

    const systemPrompt = [
      "You are a cautious research assistant for a private-markets investment writer.",
      "You always base your answers on three things, in this order:",
      "1) The provided draft text.",
      "2) The provided sources.",
      "3) Carefully selected external web search results.",
      "",
      "Rules:",
      "- Use web search to validate or extend the picture, but never contradict clear facts",
      "  in the draft or sources unless the newer data is obviously more up-to-date.",
      "- If you are unsure or information is conflicting, say so explicitly.",
      "- Prefer concise, structured answers with bullet points or short sections.",
      "- When you rely on external information, mark it with inline citations like [1], [2], [3].",
      "- Do NOT invent URLs. Only reference web pages you actually saw in search.",
    ].join("\n");

    const userParts = [];

    userParts.push(`QUESTION:\n${safeQuestion}`);

    if (safeDraft) {
      userParts.push(`DRAFT TEXT:\n${safeDraft}`);
    }

    userParts.push(`SOURCES:\n${sourcesBlock}`);

    userParts.push(
      [
        "TASK:",
        "- Answer the question as clearly and concretely as possible.",
        "- Use inline citation markers [1], [2], ... when you use information from web results.",
        "- After thinking, return your answer only – do NOT include a separate 'Sources' section.",
      ].join("\n")
    );

    const userPrompt = userParts.join("\n\n");

    // Use Responses API with web_search tool.
    // Keep max_output_tokens modest for speed.
    const response = await client.responses.create({
      model: resolvedModel,
      input: userPrompt,
      tools: [
        {
          type: "web_search",
          // Tighter search config for speed:
          web_search: {
            max_results: 4,
          },
        },
      ],
      max_output_tokens: 700,
    });

    // Extract main answer text
    let answer = "";
    const firstOutput = response.output?.[0];
    if (
      firstOutput &&
      firstOutput.content &&
      firstOutput.content[0]?.type === "output_text"
    ) {
      answer = firstOutput.content[0].text?.value || "";
    }

    if (!answer.trim()) {
      console.error("Ask AI: empty answer from Responses API", response);
      return res
        .status(500)
        .json({ error: "Model returned empty answer" });
    }

    // Extract citations (URLs + titles) from annotations, if available
    const referencesMap = new Map();

    const annotations =
      firstOutput?.content?.[0]?.text?.annotations || [];

    for (const ann of annotations) {
      const url = ann?.url;
      const title = ann?.title || ann?.site_name;
      if (url) {
        const key = url;
        if (!referencesMap.has(key)) {
          referencesMap.set(key, {
            url,
            title: title || url,
          });
        }
      }
    }

    const references = Array.from(referencesMap.values());

    // Rough “confidence” from how much web search was used
    const confidence =
      references.length === 0 ? 0.6 : references.length <= 2 ? 0.75 : 0.85;

    return res.status(200).json({
      answer,
      confidence,
      references,
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      error: "Failed to answer query",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}
