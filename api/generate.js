// api/generate.js
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // --- CORS headers (allow frontend on a different domain) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const {
      mode = "generate", // "generate" | "rewrite"
      title,
      notes,
      selectedTypes,
      publicSearch,
      text,
      previousContent,
      modelId = "gpt-4o-mini",
      temperature = 0.3,
      maxTokens = 2048,
    } = req.body || {};

    const typesLabel =
      Array.isArray(selectedTypes) && selectedTypes.length
        ? selectedTypes.join(", ")
        : "general investment content";

    const baseSystemPrompt = `
You are a highly skilled investment and private markets content writer.

You produce clear, concise, professional writing suitable for:
- investor reporting commentary
- investment notes
- press releases
- LinkedIn posts

You follow the user's notes and respect the chosen output types.
When rewriting, you **preserve the structure and core points of the previous draft**
unless the user explicitly asks for a major restructure.
`.trim();

    let messages;

    if (mode === "rewrite" && previousContent) {
      // 🔁 REWRITE PATH – treat previousContent as the base to tweak
      messages = [
        {
          role: "system",
          content: baseSystemPrompt,
        },
        {
          role: "user",
          content: `You are revising an existing draft. Make **targeted edits only**, unless the instructions explicitly request broader changes.

Goals:
- Preserve overall structure, sections, and key points of the existing draft.
- Improve clarity, tone, flow, and correctness.
- Apply the rewrite instructions.
- Use the source material only to refine details or correct facts, not to rewrite from scratch.

Output types: ${typesLabel}
Title: ${title || "(untitled)"}
Include public domain search context: ${
            publicSearch
              ? "Yes (already applied on backend if enabled)"
              : "No – rely only on provided sources."
          }
`,
        },
        {
          role: "user",
          content: `REWRITE INSTRUCTIONS:\n${
            notes || "(no additional instructions provided)"
          }`,
        },
        {
          role: "user",
          content: `EXISTING DRAFT (KEEP STRUCTURE, TWEAK CONTENT):\n\n${previousContent}`,
        },
        {
          role: "user",
          content: `SOURCE MATERIAL (REFERENCE ONLY, DO NOT REPLACE DRAFT):\n\n${
            text || "(no extra source material provided)"
          }`,
        },
      ];
    } else {
      // 🆕 GENERATE PATH – fresh draft from sources
      messages = [
        {
          role: "system",
          content: baseSystemPrompt,
        },
        {
          role: "user",
          content: `You are creating a **new draft**.

Output types: ${typesLabel}
Title: ${title || "(untitled)"}
Include public domain search context: ${
            publicSearch
              ? "Yes (already applied on backend if enabled)"
              : "No – rely only on provided sources."
          }

Notes / constraints:
${notes || "(none provided)"}
`,
        },
        {
          role: "user",
          content: `SOURCE MATERIAL (PRIMARY BASIS FOR THE DRAFT):\n\n${
            text || "(no source text provided)"
          }`,
        },
      ];
    }

    const completion = await openai.chat.completions.create({
      model: modelId,
      temperature,
      max_tokens: maxTokens,
      messages,
    });

    const output =
      completion.choices?.[0]?.message?.content?.trim() ||
      "[No content generated]";

    res.status(200).json({
      mode,
      output,
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    res.status(500).json({
      error: "Error generating content",
      details: err?.message ?? String(err),
    });
  }
}
