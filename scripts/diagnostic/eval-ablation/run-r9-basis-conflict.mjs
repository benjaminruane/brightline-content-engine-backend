#!/usr/bin/env node
/**
 * Measure R9 basis-mismatch -> conflicting against shipped R3a.
 * Stage 2 only. Cache OFF. Live stage2_v4.md is NOT edited.
 *
 * Set: 23 graded statements + F93_S0..S3 (EA_E3 already in graded set).
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-r9-basis-conflict.mjs
 *
 * Expected cost: ~$1.90. Ceiling under $3.50.
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
const R3A_PATH = path.join(__dirname, "frame-rule-winner-r3a.txt");
const R9_PATH = path.join(__dirname, "basis-conflict-r9.txt");
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const F93_SOURCE_PATH = path.join(DIAG_ROOT, "sources/93_adversarial_basis_mismatch.txt");
const CS_E3_SOURCE_PATH = path.join(
  DIAG_ROOT,
  "claim-spans/evaluative-accident/source_ic_memo.txt"
);
const STAGE2_SEED = 1;
const CONCURRENCY = 6;
const HARD_STOP_USD = 3.5;

const EXPECTED_R3A = {
  length: 12812,
  sha256: "bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c",
};

const FALSE_GREEN_IDS = ["EA_E2", "CS_E3", "F01_S10", "F04_S20", "F12_S0"];
const NOISE_FLOOR_IDS = new Set(["F12_S0", "F08_S2"]);
const INDEPENDENT_HOLD_IDS = new Set(["F18_S6", "F90_S0", "F92_S0"]);
/** Soft-spot modality controls. F08_S2 flaps at baseline (noise). */
const MODALITY_CONTROL_IDS = ["F15_S2", "F08_S2", "F08_S0", "F04_S1"];
const MODALITY_HARD_IDS = new Set(["F15_S2", "F08_S0", "F04_S1"]);

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function shortClass(c) {
  if (c === "confirmed") return "conf";
  if (c === "partially_confirmed") return "part";
  if (c === "conflicting") return "confl";
  if (c === "no_support") return "nosup";
  return String(c || "?");
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

async function matchOnce({ systemPrompt, statement, sourceText, variantId, statementId, runIndex }) {
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
    traceName: "diag-eval-ablation-r9-basis-conflict",
    spanName: "stage2-r9-basis-conflict",
    metadata: { variantId, statementId, runIndex },
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

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function loadSource(filename) {
  const { text, resolvedFrom } = await resolveSourceText(filename);
  return { text, resolvedFrom };
}

function majorityLabel(labels) {
  const counts = new Map();
  for (const l of labels) {
    if (!l) continue;
    counts.set(l, (counts.get(l) || 0) + 1);
  }
  let best = null;
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function holdsLabel(labels, target, min = 2) {
  if (!target) return false;
  return labels.filter((l) => l === target).length >= min;
}

function offConfirmed(labels, min = 2) {
  return labels.filter((l) => l && l !== "confirmed").length >= min;
}

function onLabel(labels, target, min = 2) {
  return labels.filter((l) => l === target).length >= min;
}

function fmtLabs(labs) {
  return labs.map(shortClass).join("/");
}

async function buildStatements() {
  const meridian = await readFile(MERIDIAN_PATH, "utf8");
  const csE3Source = await readFile(CS_E3_SOURCE_PATH, "utf8");
  const f93Source = await readFile(F93_SOURCE_PATH, "utf8");
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
      plant: "INDEPENDENT",
      statement:
        "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "CS_E3",
      role: "exhibit",
      plant: "INDEPENDENT",
      statement:
        "Fund IV is marked at 1.9x gross MOIC and Fund III at 1.7x, and that level speaks well of the manager's judgement.",
      sourceText: csE3Source,
      sourceFile: "scripts/diagnostic/claim-spans/evaluative-accident/source_ic_memo.txt",
    },
    {
      id: "F01_S10",
      role: "exhibit",
      plant: "PLANTED",
      statement:
        "In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F04_S20",
      role: "exhibit",
      plant: "PLANTED",
      statement:
        "In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "EA_E3",
      role: "primary",
      plant: "INDEPENDENT",
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "F93_S0",
      role: "reported_vacuous",
      plant: "PLANTED",
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: f93Source,
      sourceFile: "scripts/diagnostic/sources/93_adversarial_basis_mismatch.txt",
    },
    {
      id: "F93_S1",
      role: "fixture_control",
      plant: "PLANTED",
      statement: "Fund IV is currently marked at 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: f93Source,
      sourceFile: "scripts/diagnostic/sources/93_adversarial_basis_mismatch.txt",
    },
    {
      id: "F93_S2",
      role: "fixture_control",
      plant: "PLANTED",
      statement: "Fund IV has returned 2.6 times gross MOIC.",
      sourceText: f93Source,
      sourceFile: "scripts/diagnostic/sources/93_adversarial_basis_mismatch.txt",
    },
    {
      id: "F93_S3",
      role: "primary",
      plant: "PLANTED",
      statement: "Fund IV has returned 2.6 times net MOIC.",
      sourceText: f93Source,
      sourceFile: "scripts/diagnostic/sources/93_adversarial_basis_mismatch.txt",
    },
    {
      id: "EA_E1",
      role: "recorded_only",
      plant: "INDEPENDENT",
      statement:
        "It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "F01_S7",
      role: "control",
      plant: "PLANTED",
      statement:
        "We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F04_S13",
      role: "control",
      plant: "PLANTED",
      statement:
        "The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "F12_S0",
      role: "exhibit",
      plant: "INDEPENDENT",
      statement:
        "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F04_S1",
      role: "control",
      plant: "PLANTED",
      statement:
        "We have committed USD 10 million in the Company's Series A at a pre-money valuation of USD 40 million, for approximately 20% on a fully-diluted basis.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "F08_S0",
      role: "control",
      plant: "PLANTED",
      statement:
        'We are writing to inform you of a new investment in Helvetia Precision Components (the "Company"), a Zurich-headquartered manufacturer of high-precision machined components for the medical devices, aerospace, and semiconductor end markets.',
      sourceText: src["08_synth_industrial_buyout_memo.txt"].text,
      sourceFile: src["08_synth_industrial_buyout_memo.txt"].resolvedFrom,
    },
    {
      id: "F92_S0",
      role: "control",
      plant: "INDEPENDENT",
      statement: "Shopify is a small startup serving approximately 10,000 customers.",
      sourceText: src["91_adversarial_shopify_2010_trimmed.txt"].text,
      sourceFile: src["91_adversarial_shopify_2010_trimmed.txt"].resolvedFrom,
    },
    {
      id: "F14_S4",
      role: "control",
      plant: "PLANTED",
      statement:
        "Second, payer willingness to reimburse digital health products has improved markedly across the major European markets.",
      sourceText: src["14_synth_thesis_only_memo.txt"].text,
      sourceFile: src["14_synth_thesis_only_memo.txt"].resolvedFrom,
    },
    {
      id: "F19_S7",
      role: "control",
      plant: "PLANTED",
      statement:
        "Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 percent year-on-year); the Company has nevertheless gained share, with revenue up 6 percent, but EBITDA margins have compressed from 14 to 12 percent.",
      sourceText: src["19_synth_annual_report.pdf"].text,
      sourceFile: src["19_synth_annual_report.pdf"].resolvedFrom,
    },
    {
      id: "F12_S1",
      role: "control",
      plant: "PLANTED",
      statement:
        "NorTech is a Stockholm-headquartered manufacturer of industrial heating and cooling systems, and when we invested in 2021 it was a strong but underexposed business - dominant in the Nordics and barely visible elsewhere.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F14_S11",
      role: "control",
      plant: "PLANTED",
      statement: "We expect to bring a specific potential investment to consider over the coming months.",
      sourceText: src["14_synth_thesis_only_memo.txt"].text,
      sourceFile: src["14_synth_thesis_only_memo.txt"].resolvedFrom,
    },
    {
      id: "F18_S6",
      role: "control",
      plant: "INDEPENDENT",
      statement:
        "The investment thesis is anchored on three pillars: a genuinely market-leading product (independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen.",
      sourceText: src["18b_synth_cross_source_pair_update.txt"].text,
      sourceFile: src["18b_synth_cross_source_pair_update.txt"].resolvedFrom,
    },
    {
      id: "F15_S2",
      role: "control",
      plant: "PLANTED",
      statement: "We have invested EUR 720 million of equity for an 84% stake.",
      sourceText: src["15_synth_very_long_memo.txt"].text,
      sourceFile: src["15_synth_very_long_memo.txt"].resolvedFrom,
    },
    {
      id: "F05_S5",
      role: "control",
      plant: "PLANTED",
      statement:
        "During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability.",
      sourceText: src["05_synth_competitor_press_release.pdf"].text,
      sourceFile: src["05_synth_competitor_press_release.pdf"].resolvedFrom,
    },
    {
      id: "F17_S9",
      role: "control",
      plant: "PLANTED",
      statement:
        "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex programme to modernise three older assets, and benefiting from continued rental growth and modest yield compression.",
      sourceText: src["17_synth_real_estate_logistics.pdf"].text,
      sourceFile: src["17_synth_real_estate_logistics.pdf"].resolvedFrom,
    },
    {
      id: "F08_S2",
      role: "control",
      plant: "PLANTED",
      statement:
        "We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance.",
      sourceText: src["08_synth_industrial_buyout_memo.txt"].text,
      sourceFile: src["08_synth_industrial_buyout_memo.txt"].resolvedFrom,
    },
    {
      id: "F01_S11",
      role: "control",
      plant: "PLANTED",
      statement: "We recommend approval.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F90_S0",
      role: "control",
      plant: "INDEPENDENT",
      statement: "The firm invested in Helios Grid Controls in 2024.",
      sourceText: src["90_adversarial_b17_latent.txt"].text,
      sourceFile: src["90_adversarial_b17_latent.txt"].resolvedFrom,
    },
  ];
}

function armRowsOf(rows, variantId, id) {
  return rows
    .filter((r) => r.variantId === variantId && r.statementId === id)
    .sort((a, b) => a.runIndex - b.runIndex);
}

function scoreArm(statements, rows, variantId, r3aMajorityById) {
  const armRows = (id) => armRowsOf(rows, variantId, id);

  const eaE3 = armRows("EA_E3").map((r) => r.classification);
  const f93S0 = armRows("F93_S0").map((r) => r.classification);
  const f93S1 = armRows("F93_S1").map((r) => r.classification);
  const f93S2 = armRows("F93_S2").map((r) => r.classification);
  const f93S3 = armRows("F93_S3").map((r) => r.classification);

  const primaryEaE3 = onLabel(eaE3, "conflicting", 2);
  const primaryF93S3 = onLabel(f93S3, "conflicting", 2);
  const reportedF93S0 = onLabel(f93S0, "conflicting", 2);
  const ctrlS1 = onLabel(f93S1, "confirmed", 2);
  const ctrlS2 = onLabel(f93S2, "confirmed", 2);

  const falseGreens = {};
  let falseGreenHold = true;
  for (const id of FALSE_GREEN_IDS) {
    const labs = armRows(id).map((r) => r.classification);
    const ok = offConfirmed(labs, 2);
    falseGreens[id] = { labels: labs, ok };
    if (!ok) falseGreenHold = false;
  }

  const f19Labs = armRows("F19_S7").map((r) => r.classification);
  const f19Hold = holdsLabel(f19Labs, "partially_confirmed", 2);

  const independentBreaks = [];
  const plantedReport = [];
  for (const st of statements) {
    if (st.role !== "control") continue;
    if (st.id === "F19_S7") continue;
    if (MODALITY_CONTROL_IDS.includes(st.id)) continue;
    const labs = armRows(st.id).map((r) => r.classification);
    const r3aTarget = r3aMajorityById[st.id];
    const hold = holdsLabel(labs, r3aTarget, 2);
    const entry = {
      id: st.id,
      plant: st.plant,
      r3aMajority: r3aTarget,
      labels: labs,
      hold,
      noiseFloor: NOISE_FLOOR_IDS.has(st.id),
    };
    if (st.plant === "PLANTED" || NOISE_FLOOR_IDS.has(st.id)) {
      plantedReport.push(entry);
      continue;
    }
    if (INDEPENDENT_HOLD_IDS.has(st.id) && !hold) independentBreaks.push(entry);
  }

  const modality = {};
  let modalityHardBreaks = 0;
  let modalityNoiseBreak = false;
  for (const id of MODALITY_CONTROL_IDS) {
    const labs = armRows(id).map((r) => r.classification);
    const target = r3aMajorityById[id];
    const hold = holdsLabel(labs, target, 2);
    modality[id] = { labels: labs, r3aMajority: target, hold };
    if (MODALITY_HARD_IDS.has(id) && !hold) modalityHardBreaks += 1;
    if (id === "F08_S2" && !hold) modalityNoiseBreak = true;
  }
  // Destabilise beyond noise floor of 2 in 23: any hard modality break, or
  // hard break count + noise flap counting as excess when hard also moves.
  const modalityDestabilised = modalityHardBreaks >= 1;

  const primaryPass = primaryEaE3 && primaryF93S3;
  const controlsOk = ctrlS1 && ctrlS2;

  return {
    primaryEaE3: { labels: eaE3, ok: primaryEaE3 },
    primaryF93S3: { labels: f93S3, ok: primaryF93S3 },
    reportedF93S0: { labels: f93S0, ok: reportedF93S0 },
    ctrlS1: { labels: f93S1, ok: ctrlS1 },
    ctrlS2: { labels: f93S2, ok: ctrlS2 },
    primaryPass,
    controlsOk,
    falseGreens,
    falseGreenHold,
    f19Hold,
    f19Labels: f19Labs,
    independentBreaks,
    plantedReport,
    modality,
    modalityHardBreaks,
    modalityNoiseBreak,
    modalityDestabilised,
    f04S13Labels: armRows("F04_S13").map((r) => r.classification),
    f17S9Labels: armRows("F17_S9").map((r) => r.classification),
    eaE1Labels: armRows("EA_E1").map((r) => r.classification),
  };
}

function stoppingVerdict(score) {
  // Written before the run.
  const killFg = Object.entries(score.falseGreens).filter(([, v]) => !v.ok);
  if (killFg.length) {
    return {
      verdict: "KILL",
      reason: `Shipped fix(es) back on confirmed >=2/3: ${killFg.map(([id]) => id).join(", ")}`,
    };
  }
  if (!score.controlsOk) {
    return {
      verdict: "KILL",
      reason: `Overreach control broke: S1_ok=${score.ctrlS1.ok} (${fmtLabs(score.ctrlS1.labels)}); S2_ok=${score.ctrlS2.ok} (${fmtLabs(score.ctrlS2.labels)})`,
    };
  }
  if (score.modalityDestabilised) {
    const broke = Object.entries(score.modality)
      .filter(([id, v]) => MODALITY_HARD_IDS.has(id) && !v.hold)
      .map(([id]) => id);
    return {
      verdict: "KILL",
      reason: `Modality controls destabilised: ${broke.join(", ") || "unknown"}`,
    };
  }
  if (score.independentBreaks.length) {
    return {
      verdict: "KILL",
      reason: `Independent HOLD break(s): ${score.independentBreaks.map((e) => e.id).join(", ")}`,
    };
  }
  if (!score.f19Hold) {
    return { verdict: "KILL", reason: `F19_S7 lost partially_confirmed: ${fmtLabs(score.f19Labels)}` };
  }

  const holdsOk =
    score.falseGreenHold &&
    score.f19Hold &&
    score.independentBreaks.length === 0 &&
    !score.modalityDestabilised &&
    score.controlsOk;

  if (score.primaryPass && holdsOk) {
    return {
      verdict: "CONFIRM",
      reason: "Both PRIMARYs, both CONTROLs, every HOLD met. Proceed to Part 3.",
    };
  }

  // PARTIAL: primary lands on partially_confirmed rather than conflicting
  const eaPartial =
    !score.primaryEaE3.ok && onLabel(score.primaryEaE3.labels, "partially_confirmed", 2);
  const s3Partial =
    !score.primaryF93S3.ok && onLabel(score.primaryF93S3.labels, "partially_confirmed", 2);
  if ((eaPartial || s3Partial) && holdsOk) {
    return {
      verdict: "PARTIAL",
      reason: `Primary landed on partially_confirmed rather than conflicting (EA_E3_partial=${eaPartial} F93_S3_partial=${s3Partial}); controls intact.`,
    };
  }

  if (!score.primaryPass && holdsOk) {
    return {
      verdict: "PARTIAL",
      reason: `PRIMARY missed; HOLDs intact. EA_E3=${fmtLabs(score.primaryEaE3.labels)} F93_S3=${fmtLabs(score.primaryF93S3.labels)}`,
    };
  }

  return {
    verdict: "PARTIAL",
    reason: `PRIMARY and/or HOLD failed. EA_E3=${fmtLabs(score.primaryEaE3.labels)} F93_S3=${fmtLabs(score.primaryF93S3.labels)}`,
  };
}

function asciiPromptQuote(s) {
  return String(s || "").replace(/[—–]/g, "-").replace(/→/g, "->");
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const live = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const r3aFile = (await readFile(R3A_PATH, "utf8")).trim();
  const r9 = (await readFile(R9_PATH, "utf8")).trim();

  if (sha256(live) !== EXPECTED_R3A.sha256 || live.length !== EXPECTED_R3A.length) {
    throw new Error(`Live must be R3a. got len=${live.length} sha=${sha256(live)}`);
  }
  if (sha256(r3aFile) !== EXPECTED_R3A.sha256) {
    throw new Error("frame-rule-winner-r3a.txt hash mismatch");
  }
  if (!r9.includes("same basis")) throw new Error("R9 missing L23 same basis");
  if (!r9.includes("gross versus net")) throw new Error("R9 missing gross versus net");
  if (!r9.includes("returned, realised, or distributed")) {
    throw new Error("R9 missing modality verb expansion");
  }
  if (!r9.includes("3d) Basis mismatch")) throw new Error("R9 missing example 3d");
  if (!r9.includes("3c) Ranking is a checkable claim")) throw new Error("R9 must keep 3c");
  const partialLine = r9.split("\n").find((l) => l.includes('"partially_confirmed"'));
  if (/returned|marked at|gross versus net/.test(partialLine)) {
    throw new Error("R9 must NOT amend partially_confirmed with basis language");
  }
  if (sha256(r9) === sha256(live)) throw new Error("R9 hash must differ from R3a");

  const variants = { R3a: live, R9: r9 };
  const promptMeta = {};
  for (const [id, text] of Object.entries(variants)) {
    promptMeta[id] = { length: text.length, sha256: sha256(text) };
  }

  const statements = await buildStatements();
  if (statements.length !== 27) {
    throw new Error(`Expected 27 statements, got ${statements.length}`);
  }

  const projectedCalls = statements.length * 2 * 3;
  const projectedCost = projectedCalls * 0.012;
  console.log("R9 basis-conflict vs shipped R3a");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log(`R3a len=${promptMeta.R3a.length} sha256=${promptMeta.R3a.sha256}`);
  console.log(`R9  len=${promptMeta.R9.length} sha256=${promptMeta.R9.sha256}`);
  console.log(`Statements: ${statements.length}`);
  console.log(`Expected cost ~$${projectedCost.toFixed(2)} for ${projectedCalls} calls.`);
  if (projectedCost > HARD_STOP_USD) {
    throw new Error(`Projected cost $${projectedCost} exceeds hard stop`);
  }

  const jobs = [];
  for (const [variantId, systemPrompt] of Object.entries(variants)) {
    for (const st of statements) {
      for (let runIndex = 0; runIndex < 3; runIndex++) {
        jobs.push({ variantId, systemPrompt, st, runIndex });
      }
    }
  }
  console.log(`Calls: ${jobs.length}`);

  const results = await mapPool(jobs, CONCURRENCY, async (job) => {
    const out = await matchOnce({
      systemPrompt: job.systemPrompt,
      statement: job.st.statement,
      sourceText: job.st.sourceText,
      variantId: job.variantId,
      statementId: job.st.id,
      runIndex: job.runIndex,
    });
    process.stdout.write(
      `  ${job.variantId} ${job.st.id} r${job.runIndex + 1} ${shortClass(out.classification)}\n`
    );
    return {
      variantId: job.variantId,
      statementId: job.st.id,
      role: job.st.role,
      plant: job.st.plant,
      sourceFile: job.st.sourceFile,
      statementText: job.st.statement,
      runIndex: job.runIndex,
      ...out,
    };
  });

  const totalCost = results.reduce((s, r) => s + (r.costUsd || 0), 0);
  console.log(`Cost: $${totalCost.toFixed(4)}`);

  const r3aMajorityById = {};
  for (const st of statements) {
    const labs = armRowsOf(results, "R3a", st.id).map((r) => r.classification);
    r3aMajorityById[st.id] = majorityLabel(labs);
  }

  const scoreR3a = scoreArm(statements, results, "R3a", r3aMajorityById);
  const scoreR9 = scoreArm(statements, results, "R9", r3aMajorityById);
  const stop = stoppingVerdict(scoreR9);

  const L23 = asciiPromptQuote(r9.split("\n").find((l) => l.includes('"confirmed"') && l.includes("same basis")));
  const L27 = asciiPromptQuote(r9.split("\n").find((l) => l.includes('"conflicting"') && l.includes("gross versus net")));
  const L31 = asciiPromptQuote(r9.split("\n").find((l) => l.includes("That carve-out does not apply")));
  const idx3d = r9.indexOf("3d) Basis mismatch");
  const ex3d = asciiPromptQuote(r9.slice(idx3d, r9.indexOf("\n\nWorked examples")));

  const lines = [];
  lines.push("# R9 basis mismatch via the conflicting route");
  lines.push("");
  lines.push("Harness only. Live `stage2_v4.md` was not edited. R7 superseded.");
  lines.push("Part 0 scan: `r9-part0-gross-net-scan.md`. Fixture: `93_adversarial_basis_mismatch`.");
  lines.push("");
  lines.push("## Scoreboard");
  lines.push("");
  lines.push("```");
  lines.push("arm  EA_E3 confl  F93_S3 confl  S1+S2 ctrl  five holds  F19  indep  modality  verdict");
  const row = (name, sc, v) =>
    `${name.padEnd(4)} ${sc.primaryEaE3.ok ? "yes" : "no "}         ${sc.primaryF93S3.ok ? "yes" : "no "}         ${sc.controlsOk ? "yes" : "no "}        ${sc.falseGreenHold ? "yes" : "no "}         ${sc.f19Hold ? "yes" : "no "}  ${sc.independentBreaks.length === 0 ? "yes" : "no "}   ${sc.modalityDestabilised ? "BROKEN" : "ok "}       ${v}`;
  lines.push(row("R3a", scoreR3a, "reference"));
  lines.push(row("R9", scoreR9, stop.verdict));
  lines.push("```");
  lines.push("");
  lines.push("## Stopping rule (written before the run)");
  lines.push("");
  lines.push("CONFIRM Both PRIMARYs, both overreach CONTROLs, every HOLD. Proceed to Part 3.");
  lines.push("KILL Shipped fix back on confirmed, OR overreach control breaks, OR modality destabilises. STOP. No Part 3. No second wording.");
  lines.push("PARTIAL Primary lands on partially_confirmed rather than conflicting with controls intact. STOP and report.");
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  lines.push(`**${stop.verdict}** - ${stop.reason}`);
  lines.push("");
  lines.push("## Prompt arms");
  lines.push("");
  lines.push("```");
  lines.push(`R3a  len=${promptMeta.R3a.length}  sha256=${promptMeta.R3a.sha256}`);
  lines.push(`R9   len=${promptMeta.R9.length}  sha256=${promptMeta.R9.sha256}`);
  lines.push("```");
  lines.push("");
  lines.push("CONFIRMED: hashes differ.");
  lines.push("");
  lines.push("### R9 wording (verbatim; ASCII hyphen in report where live uses em dash)");
  lines.push("");
  lines.push("Chosen: realised/mark on the modality limb of conflicting; gross versus net as an explicit mutually-exclusive-figures item beside magnitude. Like-for-like and paraphrase carve-out name both pairs. No partially_confirmed amendment. Keep 3c. Example 3d lands on conflicting.");
  lines.push("");
  lines.push("L23:");
  lines.push("```");
  lines.push(L23);
  lines.push("```");
  lines.push("");
  lines.push("L27:");
  lines.push("```");
  lines.push(L27);
  lines.push("```");
  lines.push("");
  lines.push("L31:");
  lines.push("```");
  lines.push(L31);
  lines.push("```");
  lines.push("");
  lines.push("Example 3d:");
  lines.push("```");
  lines.push(ex3d.trim());
  lines.push("```");
  lines.push("");
  lines.push(
    `Cost: $${totalCost.toFixed(4)}. Cache OFF. Model ${stageModel.provider}/${stageModel.model}. seed=1.`
  );
  lines.push(`Statements: ${statements.length} (23 graded including eval-ablation EA_E3, plus F93_S0..S3).`);
  lines.push(
    "EA_E3 source: scripts/diagnostic/eval-ablation/meridian_source.txt (not claim-spans CS_E3; not corpus E3:S0:ic_memo)."
  );
  lines.push("F93 source: scripts/diagnostic/sources/93_adversarial_basis_mismatch.txt.");
  lines.push("");
  lines.push("## PRIMARY EA_E3 conflicting >=2/3");
  lines.push("");
  lines.push("```");
  lines.push(
    `EA_E3  R3a ${fmtLabs(scoreR3a.primaryEaE3.labels)}  R9 ${fmtLabs(scoreR9.primaryEaE3.labels)} ok=${scoreR9.primaryEaE3.ok}`
  );
  lines.push("```");
  lines.push("");
  lines.push("## PRIMARY F93_S3 gross/net conflicting >=2/3");
  lines.push("");
  lines.push("```");
  lines.push(
    `F93_S3  R3a ${fmtLabs(scoreR3a.primaryF93S3.labels)}  R9 ${fmtLabs(scoreR9.primaryF93S3.labels)} ok=${scoreR9.primaryF93S3.ok}`
  );
  lines.push("```");
  lines.push("");
  lines.push("## REPORTED F93_S0 (vacuous vs R3a reference)");
  lines.push("");
  lines.push("```");
  lines.push(
    `F93_S0  R3a ${fmtLabs(scoreR3a.reportedF93S0.labels)}  R9 ${fmtLabs(scoreR9.reportedF93S0.labels)} confl_ok=${scoreR9.reportedF93S0.ok}`
  );
  lines.push("```");
  lines.push("Vacuous against reference if R3a is already conflicting. Not a win.");
  lines.push("");
  lines.push("## CONTROL F93_S1 and F93_S2 confirmed >=2/3");
  lines.push("");
  lines.push("```");
  lines.push(
    `F93_S1  R3a ${fmtLabs(scoreR3a.ctrlS1.labels)}  R9 ${fmtLabs(scoreR9.ctrlS1.labels)} ok=${scoreR9.ctrlS1.ok}`
  );
  lines.push(
    `F93_S2  R3a ${fmtLabs(scoreR3a.ctrlS2.labels)}  R9 ${fmtLabs(scoreR9.ctrlS2.labels)} ok=${scoreR9.ctrlS2.ok}`
  );
  lines.push("```");
  lines.push("");
  lines.push("## HOLD false greens");
  lines.push("");
  lines.push("```");
  for (const id of FALSE_GREEN_IDS) {
    lines.push(
      `${id}  R3a ${fmtLabs(scoreR3a.falseGreens[id].labels)}  R9 ${fmtLabs(scoreR9.falseGreens[id].labels)} ok=${scoreR9.falseGreens[id].ok}`
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## HOLD F19_S7");
  lines.push("");
  lines.push("```");
  lines.push(
    `F19_S7  R3a ${fmtLabs(scoreR3a.f19Labels)}  R9 ${fmtLabs(scoreR9.f19Labels)} ok=${scoreR9.f19Hold}`
  );
  lines.push("```");
  lines.push("");
  lines.push("## HOLD independent (includes F92_S0)");
  lines.push("");
  lines.push("```");
  for (const id of [...INDEPENDENT_HOLD_IDS].sort()) {
    const a = armRowsOf(results, "R3a", id).map((r) => r.classification);
    const b = armRowsOf(results, "R9", id).map((r) => r.classification);
    const t = r3aMajorityById[id];
    lines.push(
      `${id}  r3aMaj=${shortClass(t)}  R3a ${fmtLabs(a)}  R9 ${fmtLabs(b)} hold=${holdsLabel(b, t, 2)}`
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## HOLD modality controls (all three runs)");
  lines.push("");
  lines.push("```");
  for (const id of MODALITY_CONTROL_IDS) {
    const m = scoreR9.modality[id];
    lines.push(
      `${id}  r3aMaj=${shortClass(m.r3aMajority)}  R3a ${fmtLabs(scoreR3a.modality[id].labels)}  R9 ${fmtLabs(m.labels)} hold=${m.hold}${id === "F08_S2" ? " (noise floor)" : ""}`
    );
  }
  lines.push(`modalityDestabilised=${scoreR9.modalityDestabilised}`);
  lines.push("```");
  lines.push("");
  lines.push("## PLANTED (not breaks); F04_S13 and F17_S9 explicit");
  lines.push("");
  lines.push("```");
  lines.push(
    `F04_S13  R3a ${fmtLabs(scoreR3a.f04S13Labels)}  R9 ${fmtLabs(scoreR9.f04S13Labels)}`
  );
  lines.push(
    `F17_S9   R3a ${fmtLabs(scoreR3a.f17S9Labels)}  R9 ${fmtLabs(scoreR9.f17S9Labels)}`
  );
  for (const e of scoreR9.plantedReport) {
    lines.push(
      `${e.id} r3a=${shortClass(e.r3aMajority)} R9 ${fmtLabs(e.labels)} hold=${e.hold}`
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## EA_E3 explanations");
  lines.push("");
  for (const variantId of ["R3a", "R9"]) {
    for (const r of armRowsOf(results, variantId, "EA_E3")) {
      lines.push(`### ${variantId} EA_E3 run ${r.runIndex + 1}: ${r.classification}`);
      lines.push("");
      lines.push("```");
      lines.push(String(r.explanation || ""));
      lines.push("```");
      lines.push("");
    }
  }
  lines.push("## F93_S3 explanations");
  lines.push("");
  for (const variantId of ["R3a", "R9"]) {
    for (const r of armRowsOf(results, variantId, "F93_S3")) {
      lines.push(`### ${variantId} F93_S3 run ${r.runIndex + 1}: ${r.classification}`);
      lines.push("");
      lines.push("```");
      lines.push(String(r.explanation || ""));
      lines.push("```");
      lines.push("");
    }
  }
  lines.push("## Recommendation / next step");
  lines.push("");
  if (stop.verdict === "CONFIRM") {
    lines.push("CONFIRM. Proceed to Part 3 corpus blast. Nothing ships in this pass.");
  } else if (stop.verdict === "KILL") {
    lines.push("KILL. Do not run Part 3. Do not write a second wording. Quote above.");
  } else {
    lines.push("PARTIAL. Stop. Ben may accept partial destination; do not rerun to force conflicting.");
  }
  lines.push("");
  lines.push("## Technical summary");
  lines.push("");
  lines.push(
    "R9 harness-only: conflicting basis limb + like-for-like + paraphrase carve-out + example 3d. Measured 27 x 2 x 3. Rows in r9-basis-conflict-rows.json."
  );
  lines.push("");
  lines.push("## Plain-language summary");
  lines.push("");
  lines.push(
    "This pass tests whether Review flags a returned-versus-mark or gross-versus-net swap as a contradiction, while leaving honest mark wording and a true returned sentence alone."
  );
  lines.push("");

  await mkdir(OUT_DIR, { recursive: true });
  const reportPath = path.join(OUT_DIR, "r9-basis-conflict.md");
  const rowsPath = path.join(OUT_DIR, "r9-basis-conflict-rows.json");
  await writeFile(reportPath, lines.join("\n"), "utf8");
  await writeFile(
    rowsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        costUsd: totalCost,
        promptMeta,
        stopping: stop,
        scores: { R3a: scoreR3a, R9: scoreR9 },
        r3aMajorityById,
        rows: results,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(`Wrote ${reportPath}`);
  console.log(`Wrote ${rowsPath}`);
  console.log(`${stop.verdict}: ${stop.reason}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
