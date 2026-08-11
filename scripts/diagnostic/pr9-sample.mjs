#!/usr/bin/env node
/**
 * Pr9 throwaway diagnostic — build prompt → writing-rewrite LLM (temp 0) →
 * parse/normalize with the same pure helpers the endpoint uses.
 * Prints RAW model output (pre-parse), revisedDraft, and markers per fixture.
 *
 * Usage:
 *   node scripts/diagnostic/pr9-sample.mjs
 *
 * Requires OPENAI_API_KEY (loaded from .env.local / .env). No API server needed.
 */

import { loadLocalEnvFiles } from "./lib/env.mjs";

loadLocalEnvFiles();

const { callLLM, flushObservability, hasProviderApiKey } = await import("../../lib/observability.js");
const { STAGE_MODELS } = await import("../../lib/qc/model-config.mjs");
const {
  gatherConcerns,
  buildRevisionPrompt,
  finalizeSuggestRevisionText,
} = await import("../../lib/build-revision-prompt.mjs");

const modelConfig = STAGE_MODELS["writing-rewrite"];
if (!hasProviderApiKey(modelConfig.provider)) {
  console.error(`[pr9-sample] Missing API key for provider ${modelConfig.provider}`);
  process.exit(1);
}

const FIXTURE_1 = {
  label: "FIXTURE 1 — Acme growth / marketing / returns",
  draftText:
    "Acme Capital grew revenue 40% year on year to $120m. We are excited to announce incredible growth across every segment. Investors will see strong returns as we scale the platform.",
  statements: [
    {
      text: "Acme Capital grew revenue 40% year on year to $120m.",
      qcCard: {
        index: 0,
        statement: "Acme Capital grew revenue 40% year on year to $120m.",
        supportState: "not_supported",
        displayVerdict: "not_supported",
        primaryExcerpt: {
          sourceLabel: "IC memo",
          passage: "Revenue increased approximately 18% to about $95m.",
        },
        evidenceSummary: "Sources support material growth but not the 40% / $120m figures stated.",
        editorialVerdict: "clean",
        complianceVerdict: "clean",
      },
    },
    {
      text: "We are excited to announce incredible growth across every segment.",
      qcCard: {
        index: 1,
        statement: "We are excited to announce incredible growth across every segment.",
        supportState: "supported",
        displayVerdict: "supported_full",
        editorialVerdict: "soft_concern",
        editorialConcerns: [
          {
            ruleId: "marketing_language_excess",
            note: "Promotional register ('incredible', 'excited to announce').",
            suggestedDirection:
              "Replace 'incredible growth' with a concrete, evidence-backed description of segment performance.",
          },
        ],
        complianceVerdict: "clean",
      },
    },
    {
      text: "Investors will see strong returns as we scale the platform.",
      qcCard: {
        index: 2,
        statement: "Investors will see strong returns as we scale the platform.",
        supportState: "partial",
        displayVerdict: "supported_partial",
        primaryExcerptText: "The firm aims to improve returns as AUM scales.",
        evidenceSummary: "Sources describe an aim, not a promise of strong returns.",
        editorialVerdict: "clean",
        complianceVerdict: "soft_concern",
        complianceConcerns: [
          {
            note: "Promissory 'will see strong returns' lacks hedging.",
            suggestedDirection:
              "Hedge with language such as 'may' or 'aims to' and avoid promising returns.",
          },
        ],
      },
    },
  ],
  outputType: "REPORTING_COMMENTARY",
  requiredVersion: "complete",
};

const FIXTURE_2 = {
  label: "FIXTURE 2 — BVP / Shopify conflict + house-style",
  draftText:
    "BVP is evaluating an investment of up to $7,000,000 in Shopify. Shopify's 24 employees are located in Ottawa, Canada.",
  statements: [
    {
      text: "BVP is evaluating an investment of up to $7,000,000 in Shopify.",
      qcCard: {
        index: 0,
        statement: "BVP is evaluating an investment of up to $7,000,000 in Shopify.",
        supportState: "conflicting",
        displayVerdict: "conflict",
        primaryExcerpt: {
          sourceLabel: "Shopify_memo",
          passage: "The firm is evaluating an investment of up to $7,000,000.",
        },
        evidenceSummary:
          "Source says 'the firm' is evaluating the investment without naming BVP; the BVP attribution is not confirmed.",
        editorialVerdict: "soft_concern",
        editorialConcerns: [
          {
            ruleId: "thousand_separator",
            note: "Comma thousands separator.",
            suggestedDirection: "Replace '$7,000,000' with '$7'000'000'.",
          },
          {
            ruleId: "currency_format",
            note: "Currency symbol before amount.",
            suggestedDirection: "Use ISO code + spelled magnitude, e.g. 'USD 7 million'.",
          },
        ],
        complianceVerdict: "clean",
      },
    },
    {
      text: "Shopify's 24 employees are located in Ottawa, Canada.",
      qcCard: {
        index: 1,
        statement: "Shopify's 24 employees are located in Ottawa, Canada.",
        supportState: "supported",
        displayVerdict: "supported_full",
        primaryExcerpt: {
          sourceLabel: "Shopify_memo",
          passage: "Shopify's 24 employees are located in Ottawa, Canada.",
        },
        evidenceSummary: "Source confirms 24 employees in Ottawa.",
        editorialVerdict: "clean",
        complianceVerdict: "clean",
      },
    },
  ],
  outputType: "REPORTING_COMMENTARY",
  requiredVersion: "complete",
};

function stripCodeFence(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  const fence = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = trimmed.match(fence);
  return match ? match[1].trim() : trimmed;
}

async function runFixture(fixture) {
  const concerns = gatherConcerns(fixture.statements);
  const prompt = buildRevisionPrompt(fixture.draftText, concerns, {
    outputType: fixture.outputType,
    requiredVersion: fixture.requiredVersion,
  });

  console.log(`\n${"=".repeat(72)}`);
  console.log(fixture.label);
  console.log("=".repeat(72));
  console.log(`[pr9-sample] concerns: ${concerns.length}`);
  console.log(`[pr9-sample] model: ${modelConfig.provider}/${modelConfig.model} temp=0`);

  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
    traceName: "suggest-revision-diag",
    spanName: "suggest-revision-diag",
    metadata: {
      route: "pr9-sample",
      fixture: fixture.label,
      concernCount: concerns.length,
    },
  });

  const raw = stripCodeFence(typeof completion?.text === "string" ? completion.text : "");
  if (!raw.trim()) {
    console.error("[pr9-sample] EMPTY raw completion");
    return { ok: false };
  }

  const { revisedDraft, markers } = finalizeSuggestRevisionText(raw);

  console.log("\n——— RAW (pre-parse, delimiters intact) ———\n");
  console.log(raw);
  console.log("\n——— revisedDraft (clean) ———\n");
  console.log(revisedDraft);
  console.log("\n——— markers ———\n");
  console.log(JSON.stringify(markers, null, 2));
  console.log("\n——— end fixture ———\n");

  return { ok: true, raw, revisedDraft, markers };
}

const fixtures = [FIXTURE_1, FIXTURE_2];
let failed = 0;

try {
  for (const fixture of fixtures) {
    const result = await runFixture(fixture);
    if (!result.ok) failed += 1;
  }
} finally {
  await flushObservability();
}

if (failed > 0) {
  console.error(`[pr9-sample] ${failed}/${fixtures.length} fixture(s) failed`);
  process.exit(1);
}

console.log(`[pr9-sample] done — ${fixtures.length} fixtures`);
