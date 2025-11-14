// /api/rewrite.js
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      previousContent,     // the draft to tweak
      notes,               // rewrite instructions
      text,                // optional source material
      selectedTypes,
      title,
      publicSearch,
      modelId = "gpt-4o-mini",
      temperature = 0.3,
      maxTokens = 2048,
    } = req.body;

    if (!previousContent || typeof previousContent !== "string") {
      return res.status(400).json({
        error: "previousContent is required and must be a string",
      });
    }

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

When rewriting, you **preserve the structure and core points of the previous draft**
unless the user explicitly asks for major restructuring.
`.trim();

    const messages = [
      {
        role: "system",
        content: baseSystemPrompt,
      },
      {
        role: "user",
        content: `You are revising an existing draft. Make **targeted edits only**.

Goals:
- Preserve the existing section structure and ordering
- Keep all major points, unless they clearly contradict the source material
- Improve clarity, tone, grammar, and flow
- Apply the rewrite instructions
- Use the source material to refine/correct details, not to rewrite from scratch

Output types: ${typesLabel}
Title: ${title || "(untitled)"}
Public domain search: ${publicSearch ? "Enabled" : "Disabled"}
`,
      },
      {
        role: "user",
        content: `REWRITE INSTRUCTIONS:\n${notes || "(none provided)"}`,
      },
      {
        role: "user",
        content: `EXISTING DRAFT (KEEP STRUCTURE, TWEAK CONTENT):\n\n${previousContent}`,
      },
      {
        role: "user",
        content: `SOURCE MATERIAL (REFERENCE ONLY):\n\n${text || "(none provided)"}`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: modelId,
      temperature,
      max_tokens: maxTokens,
      messages,
    });

    const output =
      completion.choices?.[0]?.message?.content?.trim() ||
      "[No content generated]";

    return res.status(200).json({
      mode: "rewrite",
      output,
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Error rewriting content",
      details: err?.message || String(err),
    });
  }
}
