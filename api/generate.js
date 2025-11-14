// api/generate.js
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Defensive check: warn if API key is missing ---
if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ Warning: OPENAI_API_KEY is not set. /api/generate will not work.");
}

export default async function handler(req, res) {
  // --- CORS headers so the frontend can call us ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      error: "Method not allowed",
      method: req.method,
    });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({
      error: "Server misconfiguration: OPENAI_API_KEY is not set",
    });
    return;
  }

  try {
    const body = req.body || {};

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
    } = body;

    // -----------------------------
    // 1) Detect explicit word limit in notes
    //    e.g. "max 30 words", "maximum 50 words", "up to 75 words"
    // -----------------------------
    let wordLimit = null;
    if (typeof notes === "string") {
      const match = notes.match(
        /\b(?:max(?:imum)?|up to)\s+(\d+)\s+words?\b/i
      );
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          wordLimit = parsed;
          console.log("Detected word limit from notes:", wordLimit);
        }
      }
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

You follow the user's notes and respect the chosen output types.
When rewriting, you **preserve the structure and core points of the previous draft**
unless the user explicitly asks for a major restructure.
`.trim();

    let messages;

    // -----------------------------
    // 2) Rewrite path – targeted edits, not full rewrite
    // -----------------------------
    if (mode === "rewrite" && previousContent) {
      messages = [
        {
          role: "system",
          content: baseSystemPrompt,
        },
        {
          role: "user",
          content: `You are revising an existing draft.

Rewrite goals (VERY IMPORTANT):
- Make **targeted edits** to the existing draft.
- Preserve the overall structure, section order, and key points where possible.
- Improve clarity, tone, flow, and correctness.
- **STRICTLY follow the rewrite instructions**, especially any word or length limits.
- If the instructions specify a hard length (for example "max 100 words"), you MUST keep the final answer within that limit, even if you must aggressively summarize.

Context:
- Output types: ${typesLabel}
- Title: ${title || "(untitled)"}
- Include public domain search context: ${
            publicSearch
              ? "Yes (already applied on backend if enabled)"
              : "No – rely only on provided sources."
          }
`,
        },
        {
          role: "user",
          content: `REWRITE INSTRUCTIONS (APPLY STRICTLY):\n${
            notes || "(no additional instructions provided)"
          }`,
        },
        {
          role: "user",
          content: `EXISTING DRAFT (THIS IS THE BASE YOU EDIT):\n\n${previousContent}`,
        },
        {
          role: "user",
          content: `SOURCE MATERIAL (REFERENCE ONLY. Use this to correct or sharpen details, but do NOT replace the structure of the draft):\n\n${
            text || "(no extra source material provided)"
          }`,
        },
      ];
    } else {
      // -----------------------------
      // 3) Generate path – fresh draft from sources
      // -----------------------------
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

    // -----------------------------
    // 4) Call OpenAI
    // -----------------------------
    const completion = await openai.chat.completions.create({
      model: modelId,
      temperature,
      max_tokens: maxTokens,
      messages,
    });

    let output =
      completion.choices?.[0]?.message?.content?.trim() ||
      "[No content generated]";

    // -----------------------------
    // 5) Enforce word limit (if detected)
    // -----------------------------
    if (
      wordLimit &&
      typeof output === "string" &&
      Number.isFinite(wordLimit) &&
      wordLimit > 0
    ) {
      const words = output.split(/\s+/).filter(Boolean);
      if (words.length > wordLimit) {
        output = words.slice(0, wordLimit).join(" ");
        console.log(
          `Applied hard word limit (${wordLimit}), original length was ${words.length} words.`
        );
      }
    }

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
