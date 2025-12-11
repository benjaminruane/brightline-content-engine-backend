// api/analyse-statements.js
//
// Analyses a draft into atomic statements, assigns a reliability
// score (0–1) and category to each, and returns a summary object
// with safe defaults. Uses chat.completions.create() WITHOUT
// response_format or tools.

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

const EMPTY_ANALYSIS = {
  ok: true,
  summary: {
    totalStatements: 0,
    byCategory: {
      factual: 0,
      subjective: 0,
      speculative: 0,
      uncertain: 0,
    },
  },
  statements: [],
};

const ANALYSIS_STYLE_GUIDE = `
You are an analytical assistant embedded in an internal tool called "Content Engine".

You must:
- Split the input text into short, atomic statements.
- For each statement, assign:
  - reliability: a number between 0 and 1 (inclusive). 1 = highly reliable, 0 = unreliable.
  - category: one of ["factual", "subjective", "speculative", "uncertain"].
  - implication: 2–3 short sentences explaining:
      • why you assigned that reliability and category (e.g. forward-looking, incomplete data, management judgement, strong disclosure support, etc.), and
      • what that means for how confidently the statement can be used in investor-facing materials (e.g. “safe to present as factual”, “better framed as aspiration”, “requires specific caveats”, etc.).
- Follow the same financial writing style guide as the main system:
  - Use "USD" and English thousand separators for currency (USD 1,500,000).
  - Do not insert thousand separators in years (2025, 1999).
  - Prefer straight double quotes "like this".
`;

function buildSystemPrompt() {
  return [
    ANALYSIS_STYLE_GUIDE,
    `Return results as pure JSON only. Do not wrap in markdown or add commentary.`,
  ].join("\n\n");
}

function buildUserPrompt({ draftText, maxStatements }) {
  const safeDraft = draftText || "";
  const maxCount =
    typeof maxStatements === "number" && maxStatements > 0
      ? maxStatements
      : 40;

  return [
    `You will receive a block of text from an investor-facing draft document.`,
    `Your task is to help a compliance-conscious investment writer understand which statements are strong and which are weak.`,
    ``,
    `1. Identify up to ${maxCount} of the most important, distinct statements.`,
    `2. For each, assign reliability (0–1), category, and implication.`,
    `   - Focus reliability on how well-supported and precise the claim is.`,
    `   - Use the categories consistently:`,
    `       • "factual"      – concrete, well-supported, verifiable claims`,
    `       • "subjective"   – opinions, qualitative judgements, tone statements`,
    `       • "speculative"  – forward-looking or contingent claims, scenario language`,
    `       • "uncertain"    – ambiguous, internally inconsistent, or clearly under-specified claims`,
    `3. For implication, give 2–3 short sentences describing:`,
    `       • why you gave that score and category (e.g. relies on unaudited data, extrapolates from limited sample, depends heavily on management judgement, etc.), and`,
    `       • what this means for investor communication (e.g. should be softened, requires specific caveats, probably fine as-is, etc.).`,
    `4. Summarise the overall mix of statements at the end.`,
    ``,
    `INPUT DRAFT:`,
    safeDraft.trim(),
    ``,
    `RESPONSE FORMAT (IMPORTANT):`,
    `Respond ONLY with a single JSON object that matches this TypeScript type:`,
    ``,
    `type StatementCategory = "factual" | "subjective" | "speculative" | "uncertain";`,
    `type AnalysedStatement = {`,
    `  id: string;           // "s1", "s2", ...`,
    `  text: string;         // the atomic statement`,
    `  reliability: number;  // between 0 and 1`,
    `  category: StatementCategory;`,
    `  implication: string;  // 2–3 sentences as described above`,
    `};`,
    ``,
    `type AnalysisResult = {`,
    `  summary: {`,
    `    totalStatements: number;`,
    `    byCategory: {`,
    `      factual: number;`,
    `      subjective: number;`,
    `      speculative: number;`,
    `      uncertain: number;`,
    `    };`,
    `  };`,
    `  statements: AnalysedStatement[];`,
    `};`,
    ``,
    `Respond with valid JSON for AnalysisResult. Do NOT include backticks or any text before/after the JSON.`,
  ].join("\n");
}

/**
 * Try to parse model output as JSON safely. If parsing fails or
 * the shape is wrong, return our EMPTY_ANALYSIS instead of 500.
 */
function safeParseAnalysis(rawContent) {
  if (!rawContent || typeof rawContent !== "string") {
    return EMPTY_ANALYSIS;
  }

  let jsonText = rawContent.trim();

  // If the model accidentally wraps JSON in markdown or extra text,
  // try to extract the first {...} block.
  const braceMatch = jsonText.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    jsonText = braceMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonText);

    if (!parsed || typeof parsed !== "object") {
      return EMPTY_ANALYSIS;
    }

    const summary = parsed.summary || {};
    const byCategory = summary.byCategory || {};

    const normalised = {
      ok: true,
      summary: {
        totalStatements:
          typeof summary.totalStatements === "number"
            ? summary.totalStatements
            : Array.isArray(parsed.statements)
            ? parsed.statements.length
            : 0,
        byCategory: {
          factual:
            typeof byCategory.factual === "number" ? byCategory.factual : 0,
          subjective:
            typeof byCategory.subjective === "number"
              ? byCategory.subjective
              : 0,
          speculative:
            typeof byCategory.speculative === "number"
              ? byCategory.speculative
              : 0,
          uncertain:
            typeof byCategory.uncertain === "number"
              ? byCategory.uncertain
              : 0,
        },
      },
      statements: Array.isArray(parsed.statements) ? parsed.statements : [],
    };

    return normalised;
  } catch (err) {
    console.error("Failed to parse analysis JSON:", err);
    return EMPTY_ANALYSIS;
  }
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

    const { draftText, modelId, maxStatements } = body;

    if (!draftText || typeof draftText !== "string" || draftText.trim().length === 0) {
      // For empty or missing draft, return a safe empty analysis instead of 400/500.
      return res.status(200).json(EMPTY_ANALYSIS);
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({ draftText, maxStatements });

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4o-mini",
      temperature: 0,
      max_completion_tokens: 1400,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const message = completion.choices?.[0]?.message;
    const rawContent = message?.content || "";

    const analysis = safeParseAnalysis(rawContent);

    return res.status(200).json({
      ...analysis,
      model: completion.model || null,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
        totalTokens: completion.usage?.total_tokens ?? null,
      },
    });
  } catch (err) {
    console.error("Statement analysis /api/analyse-statements error:", err);
    // Even if OpenAI fails, we still return a safe empty analysis with an error flag.
    return res.status(200).json({
      ...EMPTY_ANALYSIS,
      ok: false,
      error: "Failed to analyse statements",
    });
  }
}
