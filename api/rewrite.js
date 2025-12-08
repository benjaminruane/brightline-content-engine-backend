// /api/rewrite.js
//
// Rewrites an existing draft based on user instructions.
// Respects an optional maxWords cap via prompt + a second
// shortening pass, but allows rewrite instructions to override.

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
      text,
      notes,
      scenario,
      versionType,
      model,
      publicSearch,
      maxWords,
    } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing or invalid text to rewrite" });
    }

    const safeNotes = typeof notes === "string" ? notes.trim() : "";
    const safeScenario = typeof scenario === "string" ? scenario : "unspecified";

    const numericMaxWords =
      typeof maxWords === "number" && maxWords > 0
        ? maxWords
        : null;

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-5.1";

    const countWords = (t) =>
      t ? t.trim().split(/\s+/).filter(Boolean).length : 0;

    // Very simple heuristic: if the notes clearly ask for *more* length
    // or to ignore limits, we won't try to enforce maxWords with a second pass.
    const notesOverrideLimit =
      !!safeNotes &&
      /\b(longer|much longer|at least|min\.?|minimum|no limit|ignore.*word limit|don't shorten|do not shorten|keep length|same length)\b/i.test(
        safeNotes
      );

    const versionHint =
      versionType === "public"
        ? "Write in a more generic, publicly-safe way, avoiding non-public details."
        : "You may use the full internal context; assume the reader is an informed LP or internal stakeholder.";

    const maxWordsHint = numericMaxWords
      ? "There is a requested word limit. You should aim to keep the final draft within that limit *unless* the user instructions explicitly ask for a different length; in that case, follow the instructions even if the limit is exceeded."
      : "There is no explicit word limit; choose a length appropriate for the context.";

    const systemPrompt =
      "You are an assistant that rewrites investment-style text.\n" +
      "- Preserve the core meaning and key facts.\n" +
      "- Apply the rewrite instructions carefully.\n" +
      `- Scenario: ${safeScenario}.\n` +
      `- ${versionHint}\n` +
      `- ${maxWordsHint}\n` +
      "- Do not include headings like 'Rewrite:' or meta commentary.";

    const userPrompt =
      "Here is the existing draft that you should rewrite:\n\n" +
      text +
      "\n\nRewrite this draft according to the user's instructions below.\n" +
      "If the instructions talk about length (shorter, longer, specific length), follow them even if an internal word limit exists.\n\n" +
      (safeNotes
        ? `User rewrite instructions:\n${safeNotes}`
        : "User rewrite instructions: (none; make sensible refinements only).");

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
      console.error("OpenAI /v1/responses error (rewrite, first):", errorPayload);
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

    let rewrittenText = extractText(firstPayload);

    if (!rewrittenText) {
      console.error("Responses API returned no output_text (rewrite, first):", firstPayload);
      return res.status(500).json({
        error: "Model returned empty rewrite",
      });
    }

    // If we have a maxWords, the notes do NOT override it, and the draft is
    // clearly longer than the limit, run a second pass to shorten coherently.
    if (numericMaxWords && !notesOverrideLimit) {
      const firstCount = countWords(rewrittenText);

      if (firstCount > numericMaxWords) {
        const shortenSystem =
          "You are editing an investment-style draft.\n" +
          `Your task is to shorten the draft to **no more than ${numericMaxWords} words**, while keeping it coherent and not cutting sentences mid-way.\n` +
          "Prioritise the most important points and remove repetition.";

        const shortenUser =
          "Here is the current rewritten draft. Shorten it as described by the system message above:\n\n" +
          rewrittenText;

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
            rewrittenText = shortened;
          }
        } else {
          const errorPayload = await shortenResponse.text();
          console.error(
            "OpenAI /v1/responses error (rewrite, shorten):",
            errorPayload
          );
          // If shortening fails, we keep the first rewrittenText.
        }
      }
    }

    // Simple length-based score, mirroring generate
    let score = null;
    const len = rewrittenText.length;
    if (len > 0) {
      if (len < 400) score = 60;
      else if (len < 800) score = 70;
      else if (len < 1200) score = 80;
      else if (len < 2000) score = 90;
      else score = 95;
    }

    return res.status(200).json({
      text: rewrittenText,
      score,
      label: null,
      model: firstPayload.model || resolvedModel,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Failed to rewrite draft",
      details: err.message || String(err),
    });
  }
}
