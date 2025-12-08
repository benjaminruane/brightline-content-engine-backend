// /api/generate.js
//
// Generates a draft based on event metadata, sources and options.
// Uses the Responses API and *respects* an optional maxWords cap
// without hard-truncating mid-sentence.

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

    const safeTitle = typeof title === "string" ? title.trim() : "";
    const safeNotes = typeof notes === "string" ? notes.trim() : "";
    const safeScenario = typeof scenario === "string" ? scenario : "unspecified";
    const safeSelectedTypes = Array.isArray(selectedTypes)
      ? selectedTypes
      : [];
    const safeSources = Array.isArray(sources) ? sources : [];

    const numericMaxWords =
      typeof maxWords === "number" && maxWords > 0
        ? maxWords
        : null;

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-5.1";

    // Helper: quick word count
    const countWords = (text) =>
      text ? text.trim().split(/\s+/).filter(Boolean).length : 0;

    // Build compact source snippets
    const sourceSnippets = safeSources
      .slice(0, 4)
      .map((s, idx) => {
        const name = s.name || s.url || `Source ${idx + 1}`;
        const text =
          typeof s.text === "string" ? s.text.slice(0, 4000) : "";
        return `Source ${idx + 1} – ${name}:\n${text}`;
      })
      .join("\n\n");

    const outputTypesLabel =
      safeSelectedTypes.length > 0
        ? safeSelectedTypes.join(", ")
        : "Not specified";

    const versionHint =
      versionType === "public"
        ? "Write in a more generic, publicly-safe way, avoiding non-public details."
        : "You may use the full internal context; assume the reader is an informed LP or internal stakeholder.";

    const maxWordsHint = numericMaxWords
      ? `Aim for a coherent, complete draft of **no more than ${numericMaxWords} words**. Do NOT just cut the text off to meet the limit; instead, summarise and prioritise. Shorter is fine.`
      : "Length: use a concise but fully informative length appropriate for the context.";

    const systemPrompt =
      "You are an assistant that drafts high-quality, investment-style text.\n" +
      "- Your audience is sophisticated investors or internal stakeholders.\n" +
      "- Be precise, factual and concrete.\n" +
      "- Follow the requested output type(s) and scenario.\n" +
      `- ${versionHint}\n` +
      `- ${maxWordsHint}\n` +
      "- Do not include headings like 'Draft:' or meta commentary.";

    const userPrompt =
      `Event title: ${safeTitle || "(none provided)"}\n` +
      `Scenario: ${safeScenario}\n` +
      `Requested output types: ${outputTypesLabel}\n` +
      (safeNotes ? `Additional instructions:\n${safeNotes}\n\n` : "") +
      (sourceSnippets
        ? `Here are the supporting sources and materials:\n\n${sourceSnippets}\n\n`
        : "No supporting sources were provided.\n\n") +
      "Now write a single coherent draft that fulfils this brief.";

    const baseBody = {
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
      // Rough token cap: ~4 tokens/word when a maxWords cap is set
      max_output_tokens: numericMaxWords ? numericMaxWords * 4 : 1200,
      temperature: 0.35,
    };

    if (publicSearch) {
      baseBody.tools = [{ type: "web_search" }];
    }

    const firstResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(baseBody),
    });

    if (!firstResponse.ok) {
      const errorPayload = await firstResponse.text();
      console.error("OpenAI /v1/responses error (generate, first):", errorPayload);
      return res.status(502).json({
        error: "Upstream OpenAI responses API error",
        details: errorPayload,
      });
    }

    const firstPayload = await firstResponse.json();

    const extractText = (payload) => {
      if (payload.output_text && typeof payload.output_text === "string") {
        return payload.output_text.trim();
      }
      if (Array.isArray(payload.output)) {
        for (const item of payload.output) {
          if (item.type === "message" && Array.isArray(item.content)) {
            for (const block of item.content) {
              if (block.type === "output_text" && block.text?.length) {
                return block.text.trim();
              }
            }
          }
        }
      }
      return "";
    };

    let draftText = extractText(firstPayload);

    if (!draftText) {
      console.error("Responses API returned no output_text (generate, first):", firstPayload);
      return res.status(500).json({
        error: "Model returned empty content",
      });
    }

    // If we have a maxWords and the draft is clearly over, run a SECOND pass
    // asking the model to shorten it coherently to <= maxWords words.
    if (numericMaxWords) {
      const firstCount = countWords(draftText);

      if (firstCount > numericMaxWords) {
        const shortenSystem =
          "You are editing an investment-style draft.\n" +
          `Your task is to rewrite the draft so that it is **no more than ${numericMaxWords} words**, while keeping it coherent and not cutting sentences mid-way.\n` +
          "Prioritise the most important points and remove repetition.";

        const shortenUser =
          "Here is the current draft. Rewrite it as a single coherent piece that meets the word limit described by the system message above:\n\n" +
          draftText;

        const shortenBody = {
          model: resolvedModel,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: shortenSystem,
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: shortenUser,
                },
              ],
            },
          ],
          max_output_tokens: numericMaxWords * 4,
          temperature: 0.3,
        };

        const shortenResponse = await fetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(shortenBody),
          }
        );

        if (shortenResponse.ok) {
          const shortenPayload = await shortenResponse.json();
          const shortened = extractText(shortenPayload);
          if (shortened) {
            draftText = shortened;
          }
        } else {
          const errorPayload = await shortenResponse.text();
          console.error(
            "OpenAI /v1/responses error (generate, shorten):",
            errorPayload
          );
          // If shortening fails, we just keep the original draftText.
        }
      }
    }

    // Simple length-based score (same spirit as frontend fallback)
    let score = null;
    const len = draftText.length;
    if (len > 0) {
      if (len < 400) score = 60;
      else if (len < 800) score = 70;
      else if (len < 1200) score = 80;
      else if (len < 2000) score = 90;
      else score = 95;
    }

    return res.status(200).json({
      draftText,
      score,
      label: null, // frontend falls back to "Version N"
      model: firstPayload.model || resolvedModel,
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
