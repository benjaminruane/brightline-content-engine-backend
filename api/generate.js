// /api/rewrite.js
//
// Rewrites an existing draft based on user instructions.
// Uses Chat Completions. JSON response shape is stable for the frontend.

import OpenAI from "openai";

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

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Optional helper if you ever want to estimate tokens
function approximateTokensFromWords(wordCount) {
  if (!wordCount || typeof wordCount !== "number") return null;
  // Rough: 1 token ≈ 0.75 words
  return Math.round(wordCount / 0.75);
}

// Try to infer a word-count target from rewrite instructions like
// "expand to 100 words" or "around 250 words".
function inferWordCountFromNotes(notes) {
  if (!notes || typeof notes !== "string") return null;
  const match = notes.match(/(\d+)\s*(word|words)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (Number.isNaN(value) || value <= 0) return null;
  return value;
}

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
      text,
      notes,
      scenario,
      versionType,
      maxWords,
      model,
      publicSearch, // currently unused but kept for compatibility
    } = req.body || {};

    const baseText =
      typeof text === "string" && text.trim().length > 0
        ? text.trim()
        : "";

    if (!baseText) {
      return res
        .status(400)
        .json({ error: "Base text is required for rewrite." });
    }

    const safeNotes =
      typeof notes === "string" && notes.trim().length > 0
        ? notes.trim()
        : "";

    if (!safeNotes) {
      return res
        .status(400)
        .json({ error: "Rewrite instructions are required." });
    }

    const safeScenario = typeof scenario === "string" ? scenario : "generic";
    const safeVersionType = versionType || "complete";

    // Work out length guidance:
    // 1) Start from maxWords (if any)
    // 2) Let explicit word-count instructions in notes override that
    let numericMaxWords = null;
    if (typeof maxWords === "number") {
      numericMaxWords = maxWords;
    } else if (typeof maxWords === "string" && maxWords.trim()) {
      const parsed = Number(maxWords.trim());
      if (!Number.isNaN(parsed) && parsed > 0) {
        numericMaxWords = parsed;
      }
    }

    const inferredFromNotes = inferWordCountFromNotes(safeNotes);
    if (inferredFromNotes && inferredFromNotes > 0) {
      numericMaxWords = inferredFromNotes;
    }

    let lengthGuidance = "";
    let suggestedMaxTokens = 1024;

    if (numericMaxWords && numericMaxWords > 0) {
      const rounded = Math.max(50, Math.round(numericMaxWords));
      const approxTokens = approximateTokensFromWords(rounded);
      suggestedMaxTokens = approxTokens
        ? Math.min(approxTokens + 200, 2500)
        : 1200;

      lengthGuidance =
        `Target length for the rewritten text: around ${rounded} words. ` +
        `This is a primary constraint: aim to stay reasonably close to this length. ` +
        `If the previous draft had a different limit, the new instructions override it.`;
    } else {
      lengthGuidance =
        "There is no strict word limit; keep the text concise but fully responsive to the rewrite instructions.";
      suggestedMaxTokens = 1200;
    }

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4.1-mini";

    // SYSTEM PROMPT
    const systemPrompt = [
      "You are a specialist writer for private markets investment content.",
      "You rewrite existing drafts to follow user instructions while keeping meaning and compliance intact.",
      "",
      "Key behaviours:",
      "- Preserve all core facts, figures, and narrative flow unless the user explicitly asks to add or remove content.",
      "- Use the provided original text as the base and apply the rewrite instructions carefully.",
      "- If the user asks to expand, you may add reasonable detail as long as it does not contradict or fabricate facts.",
      "",
      "Style and formatting:",
      "- Always normalise currency amounts into the format 'USD 10 million', 'EUR 250 million', etc.",
      "- Do NOT use short forms such as '$10m', 'US$10m', '10mm', '10mn', 'm USD', or 'bn'.",
      "- Spell out 'million' and 'billion' in full.",
      "- Use 'USD', 'EUR', etc. as three-letter currency codes before the amount.",
      "- Maintain a professional, neutral tone.",
      "",
      "Compliance:",
      "- Avoid forward-looking or predictive statements unless clearly labelled and supported.",
      "- Do not cherry-pick information or present an overly biased view.",
      "",
      "Length behaviour:",
      "- Respect the latest rewrite instructions above all for length.",
      "- If the user specifies a word count (e.g. 'expand to 100 words'), treat that as the main target length.",
    ].join("\n");

    // USER PROMPT
    const userLines = [];

    userLines.push("ORIGINAL TEXT:");
    userLines.push(baseText);

    userLines.push("");
    userLines.push("REWRITE INSTRUCTIONS:");
    userLines.push(safeNotes);

    if (lengthGuidance) {
      userLines.push("");
      userLines.push("LENGTH GUIDANCE:");
      userLines.push(lengthGuidance);
    }

    userLines.push("");
    userLines.push(
      "TASK:\n" +
        "- Rewrite the original text according to the rewrite instructions.\n" +
        "- Preserve factual content, but adjust structure, emphasis, or tone based on the instructions.\n" +
        "- Apply the style, formatting, and compliance rules from the system prompt.\n" +
        "- Do not include meta commentary about the rewriting process."
    );

    const userPrompt = userLines.join("\n");

    const completion = await client.chat.completions.create({
      model: resolvedModel,
      temperature: 0.25,
      max_completion_tokens: suggestedMaxTokens || 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const rewrittenText =
      completion.choices?.[0]?.message?.content?.trim() || "";

    if (!rewrittenText) {
      console.error("OpenAI completion returned empty content:", completion);
      return res
        .status(500)
        .json({ error: "Model returned empty rewrite text." });
    }

    // Simple length-based score fallback
    const lengthScore = (() => {
      const len = rewrittenText.length;
      if (len < 400) return 60;
      if (len < 800) return 70;
      if (len < 1200) return 80;
      if (len < 2000) return 90;
      return 95;
    })();

    return res.status(200).json({
      text: rewrittenText,
      label: `Rewrite ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      model: resolvedModel,
      scenario: safeScenario,
      versionType: safeVersionType,
      score: lengthScore,
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Failed to rewrite draft",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}
