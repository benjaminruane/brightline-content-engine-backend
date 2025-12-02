// /api/generate.js
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
      title,
      notes,
      scenario,
      selectedTypes,
      versionType,
      maxWords,
      model,
      publicSearch,
      sources,
      projectId,
    } = req.body || {};

    // --- Build a userPrompt from the structured payload ------------------

    const safeTitle = (title || "").trim() || "Untitled event";
    const safeScenario = scenario || "unspecified";
    const safeTypes =
      Array.isArray(selectedTypes) && selectedTypes.length
        ? selectedTypes.join(", ")
        : "unspecified";
    const safeVersionType = versionType || "complete";

    const safeMaxWords =
      typeof maxWords === "number" && maxWords > 0
        ? maxWords
        : null;

    const instructionBlock =
      (notes || "").trim() ||
      "No special extra instructions. Write in a clear, concise, investor-facing tone suitable for private markets communications.";

    const sourcesArray = Array.isArray(sources) ? sources : [];
    const sourceBlocks =
      sourcesArray.length > 0
        ? sourcesArray
            .map((s, idx) => {
              const label = s.name || s.url || `Source ${idx + 1}`;
              const kind = s.kind || "text";
              const text = (s.text || "").slice(0, 60000); // avoid huge payloads
              return `【${idx + 1} – ${kind}: ${label}】\n${text}`;
            })
            .join("\n\n")
        : "(no source text provided – if this happens, create a well-structured placeholder draft based on the context and instructions only).";

    const userPrompt = `
You are assisting with drafting content for a private-markets investor communications tool.

Context:
- Title: ${safeTitle}
- Scenario id: ${safeScenario}
- Desired output types (internal ids): ${safeTypes}
- Version type: ${safeVersionType}
- Target length: ${
      safeMaxWords
        ? `${safeMaxWords} words (approximate; do not exceed this by too much).`
        : "No strict word limit; be concise but complete."
    }
- Public web search allowed flag (for your awareness only): ${
      publicSearch ? "true" : "false"
    }

User instructions / notes:
${instructionBlock}

Source material (verbatim extracts to rely on for facts):
${sourceBlocks}

Task:
Write a single cohesive draft that fulfils the brief above. Do NOT mention scenario ids, internal labels, or that you are an AI. Write directly as the final text, in a professional, investor-facing tone.
`.trim();

    const baseSystem =
      "You are a careful, precise financial writer. You specialise in private markets and investment communications. You write in clear, concise English, suitable for sophisticated professional investors, avoiding marketing fluff and exaggeration.";

    // --- Call OpenAI ------------------------------------------------------

    const completion = await client.chat.completions.create({
      model: model || "gpt-4o-mini",
      temperature: 0.3,
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: baseSystem },
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
      return res.status(500).json({
        error: "Model returned empty content",
      });
    }

    // --- Response shape expected by the frontend --------------------------
    return res.status(200).json({
      draftText, // frontend uses this
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
