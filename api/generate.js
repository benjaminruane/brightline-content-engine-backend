// api/generate.js
//
// Generates a new draft based on the selected output types, scenario,
// notes and attached sources. Uses OpenAI chat.completions.create()
// with no tools, no response_format, and returns a single draftText
// string plus basic metadata.

import OpenAI from "openai";

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Shared style-guide instructions
const STYLE_GUIDE_INSTRUCTIONS = `
You are part of an internal writing tool called "Content Engine".

Follow this style guide in all outputs:

- Currency:
  - Use "USD" followed by a space and a number with standard English thousand separators.
    Example: USD 1,500,000.
- Years:
  - Do NOT insert thousand separators into years: 2025, 1999.
- Quotation marks:
  - Prefer straight double quotes "like this" for titles, terms, and citations.
  - Use single quotes only for quotes-within-quotes.
- Tone:
  - Clear, concise, neutral, professional.
`;

function buildSystemPrompt() {
  return [
    `You are the draft-generation assistant for the Content Engine.`,
    `You create high-quality investor-facing drafts using the user's scenario, notes, output types and attached sources.`,
    `If the user has selected multiple output types, structure the draft in a way that satisfies them all.`,
    STYLE_GUIDE_INSTRUCTIONS,
  ].join("\n\n");
}

function buildUserPrompt({
  title,
  notes,
  scenario,
  selectedTypes,
  versionType,
  maxWords,
  sources,
}) {
  const safeTitle = (title || "").trim();
  const safeNotes = (notes || "").trim();
  const safeScenario = (scenario || "").trim();

  const typesLabel =
    Array.isArray(selectedTypes) && selectedTypes.length > 0
      ? selectedTypes.join(", ")
      : "[none specified]";

  const versionLabel = versionType || "initial";

  const maxWordsInstruction =
    typeof maxWords === "number" && maxWords > 0
      ? `Aim for no more than ${maxWords} words overall.`
      : `Use your judgment on length: concise, but sufficiently detailed for an investor audience.`;

  // Concatenate source snippets into a single context block.
  const sourceSummaries = Array.isArray(sources)
    ? sources
        .filter((s) => s && typeof s.text === "string" && s.text.trim().length > 0)
        .map((s, idx) => {
          const name = s.name || `Source ${idx + 1}`;
          const kind = s.kind || "document";
          const urlPart = s.url ? ` (URL: ${s.url})` : "";
          const snippet = s.text.trim();
          const truncated =
            snippet.length > 4000 ? snippet.slice(0, 4000) + " [...]" : snippet;

          return [
            `--- SOURCE ${idx + 1} ---`,
            `Name: ${name}`,
            `Kind: ${kind}${urlPart}`,
            ``,
            truncated,
          ].join("\n");
        })
    : [];

  const sourcesBlock =
    sourceSummaries.length > 0
      ? sourceSummaries.join("\n\n")
      : "[No detailed source text was provided. Write in general but realistic terms, and do not invent specific numbers that are not implied by the notes.]";

  return [
    `TITLE:`,
    safeTitle || "[No explicit title provided]",
    "",
    `SCENARIO / CONTEXT:`,
    safeScenario || "[No explicit scenario provided]",
    "",
    `NOTES FROM USER:`,
    safeNotes || "[No additional notes provided]",
    "",
    `REQUESTED OUTPUT TYPES:`,
    typesLabel,
    "",
    `VERSION TYPE:`,
    versionLabel,
    "",
    `ATTACHED SOURCES (summarised):`,
    sourcesBlock,
    "",
    `INSTRUCTIONS:`,
    `- Produce a single coherent draft suitable for an investor-facing document.`,
    `- Make sure the draft clearly corresponds to the requested output types (e.g. executive summary, talking points, etc.).`,
    `- Do not fabricate highly specific data (valuations, returns, dates, counterparties) unless they are either:`,
    `  (a) explicitly given in the sources or notes, or`,
    `  (b) clearly illustrative placeholders (e.g. "XX%" or "USD X million").`,
    `- ${maxWordsInstruction}`,
  ].join("\n");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const {
      title,
      notes,
      scenario,
      selectedTypes,
      versionType,
      maxWords,
      model,
      // The frontend may still send publicSearch; we ignore it for now.
      // publicSearch,
      sources,
    } = body;

    // Basic validation: we need at least one output type and one source.
    if (
      !Array.isArray(selectedTypes) ||
      selectedTypes.length === 0 ||
      !Array.isArray(sources) ||
      sources.length === 0
    ) {
      return res.status(400).json({
        error:
          "Missing selectedTypes or sources. At least one output type and one source are required.",
      });
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      title,
      notes,
      scenario,
      selectedTypes,
      versionType,
      maxWords:
        typeof maxWords === "number" && Number.isFinite(maxWords)
          ? maxWords
          : null,
      sources,
    });

    const completion = await client.chat.completions.create({
      model: model || "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const message = completion.choices?.[0]?.message;
    const draftText = (message?.content || "").trim();

    if (!draftText) {
      // Do NOT throw a 500 here; return a graceful 200 with an error instead.
      return res.status(200).json({
        ok: false,
        draftText: "",
        error: "Model returned empty draft text.",
        model: completion.model || null,
        usage: {
          promptTokens: completion.usage?.prompt_tokens ?? null,
          completionTokens: completion.usage?.completion_tokens ?? null,
          totalTokens: completion.usage?.total_tokens ?? null,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      draftText,
      score: null, // frontend will compute score client-side via scoreDraft()
      model: completion.model || null,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
        totalTokens: completion.usage?.total_tokens ?? null,
      },
    });
  } catch (err) {
    console.error("/api/generate error:", err);
    const message =
      err && typeof err === "object" && "message" in err
        ? err.message
        : "Unknown error";
    return res.status(500).json({
      error: "Failed to generate draft",
      details: message,
    });
  }
}
