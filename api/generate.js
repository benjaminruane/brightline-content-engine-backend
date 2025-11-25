// api/generate.js

import OpenAI from "openai";
import { PROMPT_RECIPES } from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import { DEFAULT_STYLE_GUIDE } from "../helpers/styleGuides.js";
import { scoreOutput } from "../helpers/scoring.js";

const BASE_STYLE_GUIDE = DEFAULT_STYLE_GUIDE;

// --- Scenario-specific guidance -----------------------------------
const SCENARIO_INSTRUCTIONS = {
  new_investment: `
Treat this as a new direct investment transaction.
- Focus on describing the company, what it does, and key operational highlights.
- Explain the investment thesis and why the investor was attracted to the opportunity.
- Mention whether it is a lead, joint, or co-investment if that information is available.
- Avoid discussing exits or portfolio performance; stay focused on the entry transaction context.
  `,
  new_fund_commitment: `
Treat this as a new commitment to a fund or program.
- Describe the fund’s strategy, target sectors, and stage.
- Summarise the rationale for committing to this fund (team, track record, access, differentiation).
- Keep commentary neutral, factual, and aligned with the STYLE GUIDE.
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
  fund_capital_call: `
Treat this as a capital call at the fund level.
- Emphasise the main use(s) of proceeds.
- Describe the key underlying transaction(s) or investments funded.
- Keep language neutral and aligned with the STYLE GUIDE.
  `,
  fund_distribution: `
Treat this as a distribution from a fund.
- Emphasise the largest source of funds driving the distribution.
- If there are multiple sources, name the largest and qualify with "among others" when appropriate.
- Keep language neutral and aligned with the STYLE GUIDE.
  `,
  default: `
Write clear, concise, fact-based commentary aligned with the given scenario.
- Follow the STYLE GUIDE exactly.
- Keep the tone neutral and professional.
- Do not invent facts or rationales that are not supported by the source material.
  `
};

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

// --- Helpers ------------------------------------------------------

// Normalise quotes and dashes: no smart quotes, no em dashes.
function normalizeQuotesAndDashes(text) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/—/g, "-");
}

// Enforce currency formatting (simple normaliser for now)
function normalizeCurrencies(text) {
  return text
    .replace(/\$([0-9])/g, "USD $1")
    .replace(/€([0-9])/g, "EUR $1")
    .replace(/£([0-9])/g, "GBP $1");
}

// Format digits with apostrophe thousands separators for 4+ digit numbers
function formatWithApostrophe(numStr) {
  // Insert an apostrophe every 3 digits from the right
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, "’");
}

function applyThousandsSeparatorsToDigits(text) {
  return text.replace(/\b\d{4,}\b/g, (match) => formatWithApostrophe(match));
}

// Soft word limit: keep whole sentences where possible
function enforceWordLimit(text, maxWords) {
  if (!maxWords || maxWords <= 0) return text;

  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) {
    // Fall back to a hard cut if we can't detect sentences
    return words.slice(0, maxWords).join(" ");
  }

  let rebuilt = "";
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const currentWordCount = rebuilt.split(/\s+/).filter(Boolean).length;
    const sentenceWords = s.split(/\s+/).length;
    if (currentWordCount + sentenceWords > maxWords) break;
    rebuilt += s.trim() + " ";
  }

  const trimmed = rebuilt.trim();
  return trimmed || words.slice(0, maxWords).join(" ");
}

// Convert simple spelled-out numbers to numerals when followed by a unit.
// This is a light heuristic and does NOT cover every possible phrasing.
function normalizeUnitNumbers(text) {
  const WORD_TO_NUMBER = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };

  const UNIT_PATTERN =
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(customers|investors|employees|clients|people|users|companies|deals|transactions|assets|funds|projects|loans|borrowers|partners|years|months|quarters|countries|regions|markets|offices)\b/gi;

  return text.replace(UNIT_PATTERN, (match, word, unit) => {
    const num = WORD_TO_NUMBER[word.toLowerCase()];
    if (!num) return match;
    const formatted = formatWithApostrophe(String(num));
    return `${formatted} ${unit}`;
  });
}

// Apply all normalisation steps in a single pass.
function normalizeFinalText(text, maxWords) {
  let t = text || "";
  t = normalizeQuotesAndDashes(t);
  t = normalizeCurrencies(t);
  t = applyThousandsSeparatorsToDigits(t);
  t = normalizeUnitNumbers(t);
  t = enforceWordLimit(t, maxWords);
  return t;
}


// --- Handler ------------------------------------------------------

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
      text,
      selectedTypes = [],
      workspaceMode = "generic",
      scenario = "default",
      versionType = "complete", // "complete" or "public"
      modelId = "gpt-4o-mini",
      temperature = 0.3,
      maxTokens = 2048,
      maxWords, // optional soft word limit from the frontend
      publicSearch = false, // flag from frontend – wired for future use
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    const typesArray =
      Array.isArray(selectedTypes) && selectedTypes.length > 0
        ? selectedTypes
        : ["press_release"];

    const wsMode = workspaceMode || "generic";
    const scenarioKey = scenario || "default";
    const verType = versionType || "complete";
    const model = modelId || "gpt-4o-mini";
    const temp = typeof temperature === "number" ? temperature : 0.3;
    const maxTok = typeof maxTokens === "number" ? maxTokens : 2048;
    const numericMaxWords =
      typeof maxWords === "number"
        ? maxWords
        : parseInt(maxWords, 10) || 0;

    // Placeholder for future public web / knowledge-base sources.
    // For now this stays empty, but the frontend is ready to display it.
    const publicSources = [];
    
    const styleGuide = BASE_STYLE_GUIDE;
    const promptPack = PROMPT_RECIPES[wsMode] || PROMPT_RECIPES.generic;

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const outputs = [];

    for (let i = 0; i < typesArray.length; i += 1) {
      const outputType = typesArray[i];

      const template =
        promptPack.templates[outputType] || promptPack.templates.press_release;

      const baseFilled = fillTemplate(template, {
        title: title || "",
        notes,
        text,
        scenario: scenarioKey
      });

      const scenarioExtra =
        SCENARIO_INSTRUCTIONS[scenarioKey] ||
        SCENARIO_INSTRUCTIONS.default;

      const lengthGuidance =
        numericMaxWords > 0
          ? "\nLength guidance:\n- Aim for no more than approximately " +
            numericMaxWords +
            " words.\n"
          : "";

      const versionGuidance =
        verType === "public"
          ? `
This is a PUBLIC-FACING version:
- Base all statements primarily on information that is publicly available.
- If some details from internal sources are used, ensure they are not highly sensitive and are phrased at a high, non-specific level.
- When in doubt, prefer omission or very general wording over specific, non-public metrics.`
          : `
This is a COMPLETE / INTERNAL version:
- Follow the full brief, and incorporate all relevant, non-sensitive details from the source material.
- You may use internal details as long as they are not explicitly flagged as highly sensitive.`;

      const userPrompt =
        baseFilled +
        "\n\nScenario-specific guidance:\n" +
        scenarioExtra.trim() +
        "\n" +
        versionGuidance +
        "\n" +
        lengthGuidance;

            const systemPrompt =
        promptPack.systemPrompt +
        "\n\nYou must follow the STYLE GUIDE strictly. " +
        "Apply ALL formatting rules consistently, even when the source does not." +
        "\n\nSTYLE GUIDE:\n" +
        styleGuide;


      const completion = await client.chat.completions.create({
        model,
        temperature: temp,
        max_tokens: maxTok,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });

      let firstChoice = null;
      if (
        completion &&
        completion.choices &&
        Array.isArray(completion.choices) &&
        completion.choices.length > 0
      ) {
        firstChoice = completion.choices[0];
      }

      let outputText = "[No content returned]";
      if (
        firstChoice &&
        firstChoice.message &&
        typeof firstChoice.message.content === "string"
      ) {
        outputText = firstChoice.message.content.trim();
      }

// Apply full normalisation pipeline (quotes, dashes, currencies, separators, units, length)
      outputText = normalizeFinalText(outputText, numericMaxWords);


      const scoring = await scoreOutput({
        outputText,
        scenario: scenarioKey,
        outputType,
        versionType: verType
      });

      outputs.push({
        outputType,
        text: outputText,
        score: scoring.overall,
        metrics: {
          clarity: scoring.clarity,
          accuracy: scoring.accuracy,
          tone: scoring.tone,
          structure: scoring.structure
        }
      });
    }

        return res.status(200).json({
      outputs,
      scenario,
      versionType,
      publicSources,
    });

  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err && err.message ? err.message : String(err)
    });
  }
}
