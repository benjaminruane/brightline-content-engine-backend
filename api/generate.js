// api/generate.js

import OpenAI from "openai";
import { PROMPT_RECIPES } from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import { DEFAULT_STYLE_GUIDE } from "../helpers/styleGuides.js";

const BASE_STYLE_GUIDE = DEFAULT_STYLE_GUIDE;

const SCENARIO_INSTRUCTIONS = {
  new_investment: `
Treat this as a new direct investment transaction.
- Focus on describing the company, what it does, and key operational highlights.
- Explain the investment thesis and why Partners Group was attracted to the opportunity.
- Mention whether it is a lead, joint, or co-investment if that information is available.
- Avoid discussing exits or portfolio performance; stay focused on the entry transaction context.
  `,
    new_fund_commitment: `
Treat this as a new commitment by Partners Group to a private markets fund or program.

COMPLETE VERSION (internal / investor commentary):
- Aim for around 150 words, in two paragraphs:
  - Paragraph 1: describe the fund
  - Paragraph 2: explain the investment merits and why Partners Group was attracted to it.
- Start with a formulation similar to:
  "In TRANSACTION DATE, Partners Group committed to INVESTMENT, a ..."
- Where the information is available in the source material, include:
  - A clear description of the fund and its target size.
  - The fund's investment strategy and whether this is a new strategy or a continuation of an existing strategy.
  - How many underlying investments the fund plans to make.
  - Key sectors the fund targets.
  - Typical target equity or enterprise value range for each deal.
  - The manager's value creation approach, described both thematically and structurally
    (for example: "digital transformation" and "Portfolio Support Group").
  - The main investment merits, grouped into themes such as track record, entry valuation and operating team.
  - Why Partners Group was attracted to the commitment, using a narrative tone that remains factual and neutral.
  - If the fund has already started investing or has seed assets, briefly mention these
    (e.g. asset name and one-line description) only where supported by the sources.
- Do not introduce fund terms such as fee levels, carry rates, hurdle rates or GP commitments unless they are clearly
  and publicly disclosed.
- Do not invent numerical details (target size, number of investments, valuation ranges, etc.) that are not supported
  by the source material.

GENERAL:
- Keep tone factual, concise and professional.
- Follow the STYLE GUIDE strictly for language, number formatting and terminology.
`,
  
  exit_realisation: `
Treat this as a realisation or exit of an existing investment.
- Describe what happened in the transaction (e.g., full exit, partial sale, recapitalisation).
- Provide concise context on the asset and holding period if available.
- Focus on drivers of value creation that are explicitly supported by the source material.
- Avoid disclosing sensitive or non-public valuation or return metrics.
  `,
  revaluation: `
Treat this as a valuation update for an existing investment.
- Describe the asset briefly and the key drivers of the valuation movement (if given).
- Focus on operational or market factors mentioned in the source material.
- Avoid speculating about performance or outlook beyond the evidence provided.
  `,
    fund_distribution: `
Treat this as a distribution or exit event at fund level, where a fund returns proceeds to investors.

COMPLETE VERSION (internal / investor commentary):
- Aim for around 140 words in a single paragraph.
- Focus on the largest component of the distribution, while acknowledging there may be multiple sources.
- Use a formulation similar to:
  "In TRANSACTION DATE, INVESTMENT distributed proceeds from ..."
- Where supported by the sources, include:
  - The source of the distribution: what was realised or sold, when it occurred and how
    (for example, full exit, partial sale, recapitalisation or refinancing).
  - A concise description of the asset or assets sold or realised (or partially realised).
  - Returns on the investment, if known and clearly supported by the source documents
    (for example, high-level multiple or performance indicators), keeping in mind sensitivity.
  - Key transformation or value-creation actions implemented since the original investment
    (for example, operational improvements, add-on acquisitions, strategic repositioning), only where explicitly supported.
- If there are multiple sources of distribution, focus on the largest and qualify this with
  wording such as "among others" to signal that there were additional smaller contributors.
- Avoid disclosing sensitive or non-public valuation or return metrics; keep performance commentary high-level and
  consistent with the STYLE GUIDE and source materials.

GENERAL:
- Keep tone factual, concise and neutral.
- Follow the STYLE GUIDE strictly, including number formatting and avoidance of speculative language.
`,

    fund_capital_call: `
Treat this as a capital call by a fund, focusing on the main use of proceeds.

COMPLETE VERSION (internal / investor commentary):
- Aim for around 140 words in a single paragraph.
- Focus on the largest use of funds that gave rise to the capital call, while acknowledging there may be other uses.
- Use a formulation similar to:
  "In TRANSACTION DATE, INVESTMENT called capital for ..."
- Where supported by the sources, include:
  - The primary purpose of the capital call (for example, funding a new investment, follow-on capital,
    fees and expenses or other specific uses).
  - A concise description of the asset acquired or financed and the transaction (what was acquired, when and how).
  - Any headline valuation metric for the underlying transaction (for example, enterprise value)
    only if explicitly provided in the source material.
  - A clear investment thesis: why this use of capital is attractive or strategic for the fund.
  - A brief value-creation plan (for example, operational improvements, organic growth, M&A),
    described thematically and only where supported by the sources.
  - Any latest developments or early results that are clearly value-adding and safe to mention.
- If there are multiple uses of the called capital, describe the largest explicitly and qualify this with
  wording such as "among others" to signal that other uses exist.
- Avoid disclosing sensitive or non-public financial terms beyond what is clearly stated in the sources.

GENERAL:
- Keep tone factual, concise and professional.
- Follow the STYLE GUIDE strictly, including number handling and terminology.
`,

  default: `
Write clear, concise, fact-based commentary aligned with the given scenario.
- Follow the STYLE GUIDE exactly.
- Keep the tone neutral and professional.
- Do not invent facts or rationales that are not supported by the source material.
  `,
};

const VERSION_INSTRUCTIONS = {
  complete: `
Treat this as an internal, complete version.

- You may use all information in the uploaded source documents.
- You may include non-public details where they are relevant and not obviously sensitive,
  but still avoid anything that looks like detailed deal terms or confidential fund economics.
- You should follow the WRITING GUIDELINES carefully.
- Focus on clarity, completeness and accuracy for an internal investor audience.
  `,

  publimaxWords, // optional soft word limit from the frontendc: `
Treat this as an external, public-facing version.

- Prefer information that is clearly public (e.g. press releases, official announcements)
  or clearly non-sensitive (high-level business description, strategy, sector, geography).
- Avoid or generalise obviously sensitive information, including:
  detailed transaction terms, non-public valuation metrics, detailed performance numbers,
  internal process descriptions, and fund economics.
- You may keep neutral descriptive statements that are not obviously confidential
  (e.g. "a leading provider of X in Y", "a diversified portfolio of Z"), even if they
  only appear in internal documents.
- When in doubt, bias toward caution and higher-level wording.
- The output should still follow the WRITING GUIDELINES and remain coherent and useful.
  `,
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- CORS helper -------------------------------------------------

const ALLOWED_ORIGINS = [
  "https://content-engine-frontend-gilt.vercel.app",
  "http://localhost:3000",
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// -----------------------------------------------------------------

// Prototype scoring stub – replace later with real rubric-based scoring.
async function scoreOutput() {
  return {
    overall: 85,
    clarity: 0.8,
    accuracy: 0.75,
    tone: 0.8,
    structure: 0.78,
  };
}

function normalizeCurrencies(text) {
  if (!text) return text;
  return text
    .replace(/\$([0-9])/g, "USD $1")
    .replace(/€([0-9])/g, "EUR $1")
    .replace(/£([0-9])/g, "GBP $1");
}

function enforceWordLimit(text, maxWords) {
  if (!maxWords || maxWords <= 0 || !text) return text;

  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  // Try to trim at sentence boundaries first
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) {
    return words.slice(0, maxWords).join(" ");
  }

  let rebuilt = "";
  for (const s of sentences) {
    const countSoFar = rebuilt.split(/\s+/).filter(Boolean).length;
    const sentenceCount = s.split(/\s+/).filter(Boolean).length;
    if (countSoFar + sentenceCount > maxWords) break;
    rebuilt += s.trim() + " ";
  }

  const trimmed = rebuilt.trim();
  return trimmed || words.slice(0, maxWords).join(" ");
}

export default async function handler(req, res) {
  // Set CORS headers on every request
  setCorsHeaders(req, res);

  // Handle preflight OPTIONS request
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
  text,
  selectedTypes = [],
  workspaceMode = "generic",
  scenario = "default",
  versionType = "complete",
  modelId = "gpt-4o-mini",
  temperature = 0.3,
  maxTokens = 2048,
  maxWords, // optional soft word limit from the frontend
} = req.body || {};


    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (!Array.isArray(selectedTypes) || selectedTypes.length === 0) {
      return res.status(400).json({ error: "No output types selected" });
    }

    const numericMaxWords =
      typeof maxWords === "number"
        ? maxWords
        : maxWords
        ? parseInt(maxWords, 10) || 0
        : 0;

    const styleGuide = BASE_STYLE_GUIDE;
    const promptPack = PROMPT_RECIPES.generic;

    const outputs = [];

    for (const outputType of selectedTypes) {
      const template =
        promptPack.templates[outputType] ||
        promptPack.templates.press_release;

      const userPromptBase = fillTemplate(template, {
        title,
        notes,
        text,
        scenario,
      });

   const scenarioExtra =
  SCENARIO_INSTRUCTIONS[scenario] || SCENARIO_INSTRUCTIONS.default;

const versionExtra =
  VERSION_INSTRUCTIONS[versionType] || VERSION_INSTRUCTIONS.complete;

const lengthGuidance =
  numericMaxWords > 0
    ? `\nLength guidance:\n- Aim for no more than approximately ${numericMaxWords} words.\n`
    : "";

const userPrompt =
  userPromptBase +
  "\n\nScenario-specific guidance:\n" +
  scenarioExtra.trim() +
  "\n\nVersion-type guidance:\n" +
  versionExtra.trim() +
  "\n" +
  lengthGuidance;


      const systemPrompt =
        promptPack.systemPrompt +
        "\n\nYou must follow the STYLE GUIDE strictly. " +
        "If the source uses currency symbols (e.g. $, €, £), rewrite them using the correct three-letter currency code " +
        "(e.g. USD, EUR, GBP). Apply ALL formatting rules from the STYLE GUIDE consistently, even when the source does not." +
        "\n\nSTYLE GUIDE:\n" +
        styleGuide;

      const completion = await client.chat.completions.create({
        model: modelId,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      let output =
        completion.choices?.[0]?.message?.content?.trim() ||
        "[No content returned]";

      // Normalize style-related details and apply a softer word cap
      output = normalizeCurrencies(output);
      output = enforceWordLimit(output, numericMaxWords);

      const scoring = await scoreOutput({
        outputText: output,
        scenario,
        outputType,
      });

      outputs.push({
        outputType,
        text: output,
        score: scoring.overall,
        metrics: {
          clarity: scoring.clarity,
          accuracy: scoring.accuracy,
          tone: scoring.tone,
          structure: scoring.structure,
        },
      });
    }

    return res.status(200).json({
      outputs,
      scenario,
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message || String(err),
    });
  }
}
