// /api/generate.js
//
// Generates a new draft based on scenario, sources and settings.
// - If publicSearch === true  -> Uses Responses API + web_search
// - If publicSearch === false -> Uses Chat Completions only
// JSON response shape is kept stable for the frontend.

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

// Small helper to cap how much text we send to the model per source
function truncateText(text, maxChars = 8000) {
  if (!text || typeof text !== "string") return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

// Optional helper if you ever want to estimate tokens
function approximateTokensFromWords(wordCount) {
  if (!wordCount || typeof wordCount !== "number") return null;
  // Rough: 1 token ≈ 0.75 words
  return Math.round(wordCount / 0.75);
}

// Extract plain text from a Responses API payload
function extractTextFromResponses(payload) {
  if (!payload) return "";

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (
            (block.type === "output_text" || block.type === "input_text") &&
            typeof block.text === "string" &&
            block.text.trim().length
          ) {
            return block.text.trim();
          }
        }
      }
    }
  }

  return "";
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
      title,
      notes,
      scenario,
      selectedTypes,
      versionType,
      maxWords,
      model,
      publicSearch,
      sources,
    } = req.body || {};

    if (!Array.isArray(selectedTypes) || selectedTypes.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one output type must be selected." });
    }

    const safeScenario = typeof scenario === "string" ? scenario : "generic";
    const safeTitle = typeof title === "string" ? title.trim() : "";
    const safeNotes = typeof notes === "string" ? notes.trim() : "";

    const safeSources = Array.isArray(sources) ? sources : [];

    if (safeSources.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one source is required to generate a draft." });
    }

    // Build a compact source bundle to avoid overloading the model
    const sourceSummaries = safeSources.map((s, idx) => {
      const label = s.name || s.url || `Source ${idx + 1}`;
      const text =
        typeof s.text === "string" ? truncateText(s.text, 8000) : "";
      return `Source ${idx + 1} – ${label}:\n${text}`;
    });

    const sourcesBlock = sourceSummaries.join("\n\n-----\n\n");

    // Determine scenario label used in prompt
    const scenarioLabelMap = {
      new_investment: "New direct investment",
      exit_realisation: "Direct investment exit",
      revaluation: "Direct investment revaluation",
      new_fund_commitment: "New fund commitment",
      fund_capital_call: "Fund capital call",
      fund_distribution: "Fund distribution",
    };

    const scenarioLabel =
      scenarioLabelMap[safeScenario] || "Investment-related event";

    const versionLabel =
      versionType === "public"
        ? "Public / externally safe version"
        : "Complete internal version";

    // Word-limit prompting: soft guidance + ceiling
    let lengthGuidance = "";
    let suggestedMaxTokens = 1024;

    if (typeof maxWords === "number" && maxWords > 0) {
      const rounded = Math.max(50, Math.round(maxWords));
      const approxTokens = approximateTokensFromWords(rounded);
      // Add a small buffer but keep it reasonable
      suggestedMaxTokens = approxTokens
        ? Math.min(approxTokens + 200, 2500)
        : 1200;

      lengthGuidance =
        `Target length: around ${rounded} words (soft ceiling). ` +
        `Do not exceed ${rounded} words by more than ~10–15%. ` +
        `If you can answer fully in fewer words, prefer being concise.`;
    } else {
      lengthGuidance =
        "Write a clear, well-structured draft. Be concise but complete.";
      suggestedMaxTokens = 1200;
    }

    const selectedTypeLabels = selectedTypes.map((t) => {
      switch (t) {
        case "transaction_text":
          return "Transaction text";
        case "investment_note":
          return "Investor letter";
        case "press_release":
          return "Press release";
        case "linkedin_post":
          return "LinkedIn post";
        default:
          return t;
      }
    });

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4.1-mini";

    // SYSTEM PROMPT (base)
    const baseSystemPrompt = [
      "You are a specialist writer for private markets investment content.",
      "You draft high-quality, professional text for investors and internal stakeholders.",
      "",
      "Key behaviours:",
      "- Maintain a neutral, fact-based tone.",
      "- Use the provided sources as your primary grounding.",
      "- Do not invent specific figures, dates, or names not supported by the sources.",
      "- Where the sources are silent, you may use standard market phrasing,",
      "  but keep it generic and non-misleading.",
      "- Respect the requested scenario and output types.",
      "",
      "Quality requirements:",
      "- Clear structure, short paragraphs.",
      "- Plain, professional English.",
      "- Avoid marketing hype; focus on clarity and substance.",
      "",
      "Compliance:",
      "- Avoid forward-looking or predictive statements unless clearly labelled and",
      "  supported by the materials.",
      "- Do not cherry-pick information; keep the balance of facts fair and accurate.",
    ].join("\n");

    // If publicSearch is enabled, extend system prompt with web-search behaviour
    const systemPrompt = publicSearch
      ? [
          baseSystemPrompt,
          "",
          "Web search behaviour:",
          "- You have access to a web_search tool to retrieve up-to-date, public information.",
          "- Use it to cross-check key facts (company descriptions, sector context, macro backdrop)",
          "  and to enrich the draft with relevant but non-promotional context.",
          "- Do NOT contradict the provided internal sources.",
          "- If web results conflict with internal materials, prioritise the internal materials and",
          "  mention the public discrepancy only if it is material and can be phrased neutrally.",
        ].join("\n")
      : baseSystemPrompt;

    // USER PROMPT
    const userLines = [];

    if (safeTitle) {
      userLines.push(`INTERNAL EVENT TITLE:\n${safeTitle}`);
    }

    userLines.push(`SCENARIO:\n${scenarioLabel}`);
    userLines.push(
      `REQUESTED OUTPUT TYPES:\n${selectedTypeLabels.join(", ")}`
    );
    userLines.push(`VERSION TYPE:\n${versionLabel}`);

    if (safeNotes) {
      userLines.push(`INSTRUCTIONS / CONSTRAINTS:\n${safeNotes}`);
    }

    if (lengthGuidance) {
      userLines.push(`LENGTH GUIDANCE:\n${lengthGuidance}`);
    }

    userLines.push("SOURCE MATERIAL (EXCERPTED – DO NOT HALLUCINATE):");
    userLines.push(sourcesBlock);

    userLines.push(
      [
        "TASK:",
        "- Based on the scenario, requested output types, version type and sources,",
        "  write the requested draft text.",
        "- If multiple output types are requested, structure the response so that",
        "  each type is clearly separated and labelled (e.g. headings).",
        "- Do not include any meta commentary about the drafting process.",
      ].join("\n")
    );

    const userPrompt = userLines.join("\n\n");

    const useWebSearch = !!publicSearch;
    let draftText = "";
    let usedModel = resolvedModel;

    if (useWebSearch) {
      // ---- Branch A: Responses API + web_search -------------------
      const response = await client.responses.create({
        model: resolvedModel,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: systemPrompt,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: userPrompt,
              },
            ],
          },
        ],
        tools: [
          {
            type: "web_search",
          },
        ],
        max_output_tokens: suggestedMaxTokens || 2048,
        temperature: 0.2,
      });

      draftText = extractTextFromResponses(response);
      usedModel = response.model || resolvedModel;
    } else {
      // ---- Branch B: Chat Completions only ------------------------
      const completion = await client.chat.completions.create({
        model: resolvedModel,
        temperature: 0.2,
        max_completion_tokens: suggestedMaxTokens || 2048,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      draftText =
        completion.choices?.[0]?.message?.content?.trim() || "";
      usedModel = completion.model || resolvedModel;
    }

    if (!draftText) {
      console.error("Generate: model returned empty content");
      return res
        .status(500)
        .json({ error: "Model returned empty draft text." });
    }

    // Simple length-based score fallback (backend can override this later)
    const lengthScore = (() => {
      const len = draftText.length;
      if (len < 400) return 60;
      if (len < 800) return 70;
      if (len < 1200) return 80;
      if (len < 2000) return 90;
      return 95;
    })();

    // Respond with the shape the frontend expects
    return res.status(200).json({
      draftText,
      label: `Version ${new Date()
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")}`,
      model: usedModel,
      scenario: safeScenario,
      scenarioLabel,
      versionType: versionType || "complete",
      score: lengthScore,
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Failed to generate draft",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}
