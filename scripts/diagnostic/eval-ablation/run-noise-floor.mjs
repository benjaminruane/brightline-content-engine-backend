#!/usr/bin/env node
/**
 * Stage 2 noise floor: live arm A x3 on the 23-statement graded set.
 * One process, cache OFF. Calibration only; not a pass/fail run.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-noise-floor.mjs
 *
 * Expected cost: ~$0.80. Ceiling under $1.50.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { DIAG_ROOT, REPO_ROOT } from "../lib/paths.mjs";
import { resolveSourceText } from "../lib/sources.mjs";
import { fingerprintFromCompletion } from "./fingerprint.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, calculateLlmCostUsd, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const {
  applyRoundingToleranceBackstop,
  applyPeriodGateBackstop,
} = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(DIAG_ROOT, "eval-ablation");
const STAGE2_PROMPT_PATH = path.join(REPO_ROOT, "lib/qc/pipeline-v4/prompts/stage2_v4.md");
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const CS_E3_SOURCE_PATH = path.join(
  DIAG_ROOT,
  "claim-spans/evaluative-accident/source_ic_memo.txt"
);
const STAGE2_SEED = 1;
const EXPECTED_A = {
  length: 12451,
  sha256: "c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe",
};

const ADJUDICATION = {
  EA_E2: "EXHIBIT_ADJUDICATED",
  CS_E3: "EXHIBIT_ADJUDICATED",
  F01_S10: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
  F04_S20: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
  F12_S0: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
  F19_S7: "CONTROL_ADJUDICATED",
  EA_E3: "RECORDED_ONLY",
  EA_E1: "RECORDED_ONLY",
};

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function safeJsonParse(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function applyBackstops(parsed, statementText) {
  const classification =
    typeof parsed?.classification === "string" ? parsed.classification.trim() : null;
  const passage = typeof parsed?.passage === "string" ? parsed.passage : null;
  const explanation = typeof parsed?.explanation === "string" ? parsed.explanation : null;
  const periodAssessment = parsed?.periodAssessment ?? null;
  if (!classification) {
    return {
      classification: null,
      preBackstopClassification: null,
      passage,
      explanation,
      periodAssessment,
      backstopChanged: false,
    };
  }
  const preBackstopClassification = classification;
  const rounded = applyRoundingToleranceBackstop(
    { classification, passage, explanation, periodAssessment },
    { statementText, periodAssessment }
  );
  const gated = applyPeriodGateBackstop(
    {
      classification: rounded.classification,
      passage: rounded.passage,
      explanation: rounded.explanation,
      periodAssessment,
    },
    { statementText }
  );
  return {
    classification: gated.classification,
    preBackstopClassification,
    passage: gated.passage,
    explanation: gated.explanation,
    periodAssessment,
    backstopChanged: gated.classification !== preBackstopClassification,
  };
}

async function matchOnce({ systemPrompt, statement, sourceText, statementId, runIndex }) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const userPrompt = `Statement:
${statement}

Source:
${sourceText}`.trim();
  const completion = await callLLM({
    provider: stageModel.provider,
    model: stageModel.model,
    temperature: 0,
    seed: STAGE2_SEED,
    responseFormat: "json",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    traceName: "diag-eval-ablation-noise-floor",
    spanName: "stage2-noise-floor-A",
    metadata: { variantId: "A", statementId, runIndex },
  });
  const parsed = safeJsonParse(completion?.text ?? "");
  const gated = applyBackstops(parsed, statement);
  const costUsd = calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage);
  return {
    classification: gated.classification,
    preBackstopClassification: gated.preBackstopClassification,
    backstopChanged: gated.backstopChanged,
    explanation: gated.explanation,
    passage: gated.passage,
    periodAssessment: gated.periodAssessment,
    systemFingerprint: fingerprintFromCompletion(completion),
    usage: {
      inputTokens: Number(completion?.usage?.inputTokens) || 0,
      outputTokens: Number(completion?.usage?.outputTokens) || 0,
    },
    costUsd: Number(costUsd) || 0,
  };
}

function shortClass(c) {
  if (c === "confirmed") return "conf";
  if (c === "partially_confirmed") return "part";
  if (c === "conflicting") return "confl";
  if (c === "no_support") return "nosup";
  return String(c || "?");
}

async function loadSource(filename) {
  const { text, resolvedFrom } = await resolveSourceText(filename);
  return { text, resolvedFrom };
}

async function buildStatements() {
  const meridian = await readFile(MERIDIAN_PATH, "utf8");
  const csE3Source = await readFile(CS_E3_SOURCE_PATH, "utf8");
  const src = {};
  for (const f of [
    "01_bvp_shopify_memo.txt",
    "04_synth_vc_pinterest_style_memo.txt",
    "05_synth_competitor_press_release.pdf",
    "08_synth_industrial_buyout_memo.txt",
    "12_synth_linkedin_post.txt",
    "14_synth_thesis_only_memo.txt",
    "15_synth_very_long_memo.txt",
    "17_synth_real_estate_logistics.pdf",
    "18b_synth_cross_source_pair_update.txt",
    "19_synth_annual_report.pdf",
    "90_adversarial_b17_latent.txt",
    "91_adversarial_shopify_2010_trimmed.txt",
  ]) {
    src[f] = await loadSource(f);
  }

  return [
    {
      id: "EA_E2",
      role: "exhibit",
      adjudication: ADJUDICATION.EA_E2,
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "CS_E3",
      role: "exhibit",
      adjudication: ADJUDICATION.CS_E3,
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "Fund IV is marked at 1.9x gross MOIC and Fund III at 1.7x, and that level speaks well of the manager's judgement.",
      sourceText: csE3Source,
      sourceFile: "scripts/diagnostic/claim-spans/evaluative-accident/source_ic_memo.txt",
    },
    {
      id: "F01_S10",
      role: "exhibit",
      adjudication: ADJUDICATION.F01_S10,
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F04_S20",
      role: "exhibit",
      adjudication: ADJUDICATION.F04_S20,
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "EA_E3",
      role: "recorded_only",
      adjudication: ADJUDICATION.EA_E3,
      baselineLabel: "confirmed",
      correctLabel: null,
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "EA_E1",
      role: "recorded_only",
      adjudication: ADJUDICATION.EA_E1,
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "F01_S7",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement:
        "We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F04_S13",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement:
        "The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "F12_S0",
      role: "exhibit",
      adjudication: ADJUDICATION.F12_S0,
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
      note: "promoted: baseline false green (duration mismatch)",
    },
    {
      id: "F04_S1",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement:
        "We have committed USD 10 million in the Company's Series A at a pre-money valuation of USD 40 million, for approximately 20% on a fully-diluted basis.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "F08_S0",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement:
        'We are writing to inform you of a new investment in Helvetia Precision Components (the "Company"), a Zurich-headquartered manufacturer of high-precision machined components for the medical devices, aerospace, and semiconductor end markets.',
      sourceText: src["08_synth_industrial_buyout_memo.txt"].text,
      sourceFile: src["08_synth_industrial_buyout_memo.txt"].resolvedFrom,
    },
    {
      id: "F92_S0",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement: "Shopify is a small startup serving approximately 10,000 customers.",
      sourceText: src["91_adversarial_shopify_2010_trimmed.txt"].text,
      sourceFile: src["91_adversarial_shopify_2010_trimmed.txt"].resolvedFrom,
    },
    {
      id: "F14_S4",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "Second, payer willingness to reimburse digital health products has improved markedly across the major European markets.",
      sourceText: src["14_synth_thesis_only_memo.txt"].text,
      sourceFile: src["14_synth_thesis_only_memo.txt"].resolvedFrom,
    },
    {
      id: "F19_S7",
      role: "control",
      adjudication: ADJUDICATION.F19_S7,
      baselineLabel: "partially_confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 percent year-on-year); the Company has nevertheless gained share, with revenue up 6 percent, but EBITDA margins have compressed from 14 to 12 percent.",
      sourceText: src["19_synth_annual_report.pdf"].text,
      sourceFile: src["19_synth_annual_report.pdf"].resolvedFrom,
    },
    {
      id: "F12_S1",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "NorTech is a Stockholm-headquartered manufacturer of industrial heating and cooling systems, and when we invested in 2021 it was a strong but underexposed business — dominant in the Nordics and barely visible elsewhere.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F14_S11",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement: "We expect to bring a specific potential investment to consider over the coming months.",
      sourceText: src["14_synth_thesis_only_memo.txt"].text,
      sourceFile: src["14_synth_thesis_only_memo.txt"].resolvedFrom,
    },
    {
      id: "F18_S6",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "The investment thesis is anchored on three pillars: a genuinely market-leading product (independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen.",
      sourceText: src["18b_synth_cross_source_pair_update.txt"].text,
      sourceFile: src["18b_synth_cross_source_pair_update.txt"].resolvedFrom,
    },
    {
      id: "F15_S2",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "conflicting",
      correctLabel: null,
      statement: "We have invested EUR 720 million of equity for an 84% stake.",
      sourceText: src["15_synth_very_long_memo.txt"].text,
      sourceFile: src["15_synth_very_long_memo.txt"].resolvedFrom,
    },
    {
      id: "F05_S5",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "conflicting",
      correctLabel: null,
      statement:
        "During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability.",
      sourceText: src["05_synth_competitor_press_release.pdf"].text,
      sourceFile: src["05_synth_competitor_press_release.pdf"].resolvedFrom,
    },
    {
      id: "F17_S9",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "conflicting",
      correctLabel: null,
      statement:
        "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex programme to modernise three older assets, and benefiting from continued rental growth and modest yield compression.",
      sourceText: src["17_synth_real_estate_logistics.pdf"].text,
      sourceFile: src["17_synth_real_estate_logistics.pdf"].resolvedFrom,
    },
    {
      id: "F08_S2",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "conflicting",
      correctLabel: null,
      statement:
        "We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance.",
      sourceText: src["08_synth_industrial_buyout_memo.txt"].text,
      sourceFile: src["08_synth_industrial_buyout_memo.txt"].resolvedFrom,
    },
    {
      id: "F01_S11",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "no_support",
      correctLabel: null,
      statement: "We recommend approval.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F90_S0",
      role: "control",
      adjudication: "UNADJUDICATED",
      baselineLabel: "no_support",
      correctLabel: null,
      statement: "The firm invested in Helios Grid Controls in 2024.",
      sourceText: src["90_adversarial_b17_latent.txt"].text,
      sourceFile: src["90_adversarial_b17_latent.txt"].resolvedFrom,
    },
  ];
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const systemPrompt = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const promptMeta = { length: systemPrompt.length, sha256: sha256(systemPrompt) };
  if (promptMeta.sha256 !== EXPECTED_A.sha256 || promptMeta.length !== EXPECTED_A.length) {
    throw new Error(
      `Arm A prompt hash/length mismatch: got ${promptMeta.length}/${promptMeta.sha256}`
    );
  }

  const statements = await buildStatements();
  if (statements.length !== 23) throw new Error(`Expected 23, got ${statements.length}`);

  console.log("Stage 2 noise floor: arm A x3");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log(`A  len=${promptMeta.length}  sha256=${promptMeta.sha256}`);
  console.log("");

  const rows = [];
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;

  for (let run = 1; run <= 3; run++) {
    console.log(`RUN ${run} of 3`);
    for (const st of statements) {
      process.stdout.write(`  ${st.id} r${run} ... `);
      const result = await matchOnce({
        systemPrompt,
        statement: st.statement,
        sourceText: st.sourceText,
        statementId: st.id,
        runIndex: run,
      });
      totalCost += result.costUsd;
      totalIn += result.usage.inputTokens;
      totalOut += result.usage.outputTokens;
      rows.push({
        statementId: st.id,
        role: st.role,
        adjudication: st.adjudication,
        baselineLabel: st.baselineLabel,
        correctLabel: st.correctLabel,
        variantId: "A",
        run,
        classification: result.classification,
        preBackstopClassification: result.preBackstopClassification,
        backstopChanged: result.backstopChanged,
        explanation: result.explanation,
        passage: result.passage,
        systemFingerprint: result.systemFingerprint ?? null,
        usage: result.usage,
        costUsd: result.costUsd,
        statement: st.statement,
        sourceFile: st.sourceFile,
        note: st.note || null,
      });
      console.log(
        `${shortClass(result.classification)} fp=${result.systemFingerprint || "null"} ($${result.costUsd.toFixed(4)})`
      );
    }
    console.log("");
  }

  const unstable = [];
  const stable = [];
  for (const st of statements) {
    const armRows = rows.filter((r) => r.statementId === st.id);
    const labels = armRows.map((r) => r.classification);
    const uniq = [...new Set(labels)];
    const fps = armRows.map((r) => r.systemFingerprint);
    const entry = {
      id: st.id,
      labels,
      fingerprints: fps,
      explanations: armRows.map((r) => r.explanation),
      stable: uniq.length === 1,
    };
    if (uniq.length === 1) stable.push(entry);
    else unstable.push(entry);
  }

  const noiseFloor = unstable.length;
  console.log("NOISE FLOOR SUMMARY");
  console.log(`identical on all 3: ${stable.length} of 23`);
  console.log(`unstable (noise floor): ${noiseFloor} of 23`);
  for (const u of unstable) {
    console.log(`  ${u.id}  ${u.labels.map(shortClass).join("/")}  fps=${[...new Set(u.fingerprints)].join(",")}`);
    for (let i = 0; i < 3; i++) {
      console.log(`    r${i + 1}: ${u.explanations[i]}`);
    }
  }
  console.log("");
  console.log(`Measured cost: $${totalCost.toFixed(6)}`);

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "noise-floor-rows.json");
  await writeFile(
    outPath,
    JSON.stringify(
      {
        meta: {
          probe: "stage2-noise-floor",
          model: `${stageModel.provider}/${stageModel.model}`,
          cache: "off",
          temperature: 0,
          seed: STAGE2_SEED,
          promptPath: "lib/qc/pipeline-v4/prompts/stage2_v4.md",
          promptMeta,
          totalCalls: rows.length,
          totalCostUsd: totalCost,
          totalInputTokens: totalIn,
          totalOutputTokens: totalOut,
          ranAt: new Date().toISOString(),
        },
        noiseFloor: {
          nOf23: noiseFloor,
          stableCount: stable.length,
          unstableIds: unstable.map((u) => u.id),
          standingConsequence:
            "From now on every arm runs its baseline x3, not x1, and no arm result counts as an effect unless it exceeds the measured noise floor.",
        },
        perStatement: statements.map((st) => {
          const armRows = rows.filter((r) => r.statementId === st.id);
          const labels = armRows.map((r) => r.classification);
          return {
            id: st.id,
            role: st.role,
            adjudication: st.adjudication,
            baselineLabel: st.baselineLabel,
            correctLabel: st.correctLabel,
            labels,
            stable: new Set(labels).size === 1,
            fingerprints: armRows.map((r) => r.systemFingerprint),
            explanations: armRows.map((r) => r.explanation),
          };
        }),
        rows,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
