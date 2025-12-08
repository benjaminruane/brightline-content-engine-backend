// api/generate.js
//
// Generates a draft AND scores it using the scoreDraft() helper.
// Updated to use the OpenAI Responses API (with optional web search)
// while keeping the JSON response shape the same for the frontend.

import { scoreDraft } from "../utils/scoreDraft.js";

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
      model: modelId,
      temperature,
      maxWords,
      publicSearch,
      scenario,
      selectedTypes,
      sources,
      title,
      notes,
      versionType,
    } = req.body || {};

    // --------- Build prompts -------------------------------------------------
    const baseSystem =
      "You are an expert investment writer who produces clear, neutral, institutional-grade text. " +
      "Write in concise, factual, professional language suitable for internal investment committees and sophisticated LPs.";

    const sourceSection = Array.isArray(sources)
      ? sources
          .map(
            (s) =>
              `Source (${s.kind} – ${s.name || s.url || "Untitled"}):\n${
                s.text || ""
              }`
          )
          .join("\n\n")
      : "";

    const userPrompt = `
TITLE: ${title || "(none)"}

INSTRUCTIONS:
${notes || "(none)"}

SCENARIO: ${scenario || "(unspecified)"}
OUTPUT TYPES: ${
      Array.isArray(selectedTypes) && selectedTypes.length > 0
        ? selectedTypes.join(", ")
        : "(none)"
    }

VERSION TYPE: ${versionType || "complete"}
PUBLIC SEARCH: ${publicSearch ? "enabled" : "disabled"}

MAX WORDS: ${maxWords || "not specified"}

SOURCES:
${sourceSection}
`;

    // --------- Call OpenAI Responses API ------------------------------------
    const resolvedModel =
      typeof modelId === "string" && modelId.trim().length > 0
        ? modelId.trim()
        : "gpt-4o-mini";

    const maxOutput =
      typeof maxWords === "number" ||
      (typeof maxWords === "string" && maxWords.trim() !== "")
        ? Number(maxWords) + 200
        : 2048;

    const body = {
      model: resolvedModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: baseSystem,
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
      max_output_tokens: maxOutput,
      temperature:
        typeof temperature === "number" && Number.isFinite(temperature)
          ? temperature
          : 0.3,
    };

    // Only enrich with web search when explicitly allowed via the toggle
    if (publicSearch) {
      body.tools = [{ type: "web_search" }];
    }

    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error("OpenAI /v1/responses error in /api/generate:", payload);
      return res.status(502).json({
        error: "Failed to generate draft from OpenAI",
        details: payload,
      });
    }

    // --------- Extract text from Responses payload --------------------------
    let draftText = "";

    if (typeof payload.output_text === "string") {
      draftText = payload.output_text.trim();
    } else if (Array.isArray(payload.output)) {
      for (const item of payload.output) {
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const block of item.content) {
            if (
              block.type === "output_text" &&
              typeof block.text === "string"
            ) {
              draftText = block.text.trim();
              break;
            }
          }
        }
        if (draftText) break;
      }
    }

    if (!draftText) {
      console.error("Responses API returned empty draftText:", payload);
      return res.status(500).json({
        error: "Model returned empty content",
      });
    }

    // --------- Compute score (heuristic) ------------------------------------
    const score = await scoreDraft(draftText, resolvedModel);

    return res.status(200).json({
      draftText,
      score, // 0–1; frontend converts to % where needed
      model: payload.model || resolvedModel,
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
