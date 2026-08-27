#!/usr/bin/env node
/**
 * Measure R10 (R9 + quantity-scoped basis gate) against shipped R3a.
 * Stage 2 only. Cache OFF. Live stage2_v4.md is NOT edited.
 *
 * Set: 23 graded + F93_S0..S3 + MF01..MF10.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-r10-scoped-basis-gate.mjs
 *
 * Expected cost: ~$1.90. Ceiling under $2.75.
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
const R10_PATH = path.join(__dirname, "basis-conflict-r10.txt");
const MF_PAIRS_PATH = path.join(DIAG_ROOT, "passage-selection-probe/pairs.json");
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const F93_SOURCE_PATH = path.join(DIAG_ROOT, "sources/93_adversarial_basis_mismatch.txt");
const CS_E3_SOURCE_PATH = path.join(
  DIAG_ROOT,
  "claim-spans/evaluative-accident/source_ic_memo.txt"
);
const STAGE2_SEED = 1;
const CONCURRENCY = 6;
const HARD_STOP_USD = 2.75;

const EXPECTED_R3A = {
  length: 12812,
  sha256: "bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c",
};
const EXPECTED_R9 = {
  length: 13728,
  sha256: "bf42e8fba016aeb511f95f8b8d95c2056df63c582d629c4078a06a52661b956a",
};
const EXPECTED_R10 = {
  length: 14259,
  sha256: "44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1",
};
const MF_EXPECTED = {
  MF01: "confirmed",
  MF02: "confirmed",
  MF03: "confirmed",
  MF04: "confirmed",
  MF05: "confirmed",
  MF06: "conflicting",
  MF07: "conflicting",
  MF08: "conflicting",
  MF09: "conflicting",
  MF10: "confirmed",
};
const FIXTURE_PROBE_IDS = [
  "F93_S0",
  "F93_S1",
  "F93_S2",
  "F93_S3",
  ...Object.keys(MF_EXPECTED),
];

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

  const base = [
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
      role: "reported_f93s2",
      plant: "PLANTED",
      statement: "Fund IV has returned 2.6 times gross MOIC.",
      sourceText: f93Source,
      sourceFile: "scripts/diagnostic/sources/93_adversarial_basis_mismatch.txt",
    },
    {
      id: "F93_S3",
      role: "reported_vacuous",
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

  const mfManifest = JSON.parse(await readFile(MF_PAIRS_PATH, "utf8"));
  for (const pair of mfManifest.pairs) {
    const abs = path.join(DIAG_ROOT, pair.sourceFile);
    const sourceText = await readFile(abs, "utf8");
    base.push({
      id: pair.id,
      role: "mf_probe",
      plant: "INDEPENDENT",
      expected: pair.expected,
      statement: pair.draft,
      sourceText,
      sourceFile: `scripts/diagnostic/${pair.sourceFile}`,
    });
  }
  return base;
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
  const primaryEaE3Partial = onLabel(eaE3, "partially_confirmed", 2);
  const ctrlS1 = onLabel(f93S1, "confirmed", 2);

  const mf = {};
  let mfAllHold = true;
  const mfFlip = [];
  for (const [id, expected] of Object.entries(MF_EXPECTED)) {
    const labs = armRows(id).map((r) => r.classification);
    const ok = onLabel(labs, expected, 2);
    mf[id] = { labels: labs, expected, ok };
    if (!ok) {
      mfAllHold = false;
      mfFlip.push(id);
    }
  }

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
  const vacuousControlSkipped = [];
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
    if (INDEPENDENT_HOLD_IDS.has(st.id) && !hold) {
      const r3aLabs = armRowsOf(rows, "R3a", st.id).map((r) => r.classification);
      const heldOnRef = holdsLabel(r3aLabs, r3aTarget, 2);
      if (heldOnRef) independentBreaks.push({ ...entry, r3aLabels: r3aLabs });
      else
        vacuousControlSkipped.push({
          ...entry,
          r3aLabels: r3aLabs,
          note: "ref did not hold; not a KILL",
        });
    }
  }

  const modality = {};
  let modalityHardBreaks = 0;
  let modalityNoiseBreak = false;
  for (const id of MODALITY_CONTROL_IDS) {
    const labs = armRows(id).map((r) => r.classification);
    const target = r3aMajorityById[id];
    const hold = holdsLabel(labs, target, 2);
    const r3aLabs = armRowsOf(rows, "R3a", id).map((r) => r.classification);
    const heldOnRef = holdsLabel(r3aLabs, target, 2);
    modality[id] = { labels: labs, r3aMajority: target, hold, heldOnRef, r3aLabels: r3aLabs };
    if (MODALITY_HARD_IDS.has(id) && !hold && heldOnRef) modalityHardBreaks += 1;
    if (id === "F08_S2" && !hold) modalityNoiseBreak = true;
  }
  const modalityDestabilised = modalityHardBreaks >= 1;

  return {
    primaryEaE3: { labels: eaE3, ok: primaryEaE3, partial: primaryEaE3Partial },
    f93S0Labels: f93S0,
    f93S1: { labels: f93S1, ok: ctrlS1 },
    f93S2Labels: f93S2,
    f93S3Labels: f93S3,
    mf,
    mfAllHold,
    mfFlip,
    falseGreens,
    falseGreenHold,
    f19Hold,
    f19Labels: f19Labs,
    independentBreaks,
    vacuousControlSkipped,
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

function stoppingVerdict(score, scoreR3a) {
  const killFg = Object.entries(score.falseGreens).filter(([, v]) => !v.ok);
  if (killFg.length) {
    return {
      verdict: "KILL",
      reason: `Shipped fix(es) back on confirmed >=2/3: ${killFg.map(([id]) => id).join(", ")}`,
    };
  }
  if (score.mfFlip.length) {
    return {
      verdict: "KILL",
      reason: `MF polarity flip(s): ${score.mfFlip.join(", ")}`,
    };
  }
  if (!score.f93S1.ok) {
    if (scoreR3a.f93S1.ok) {
      return {
        verdict: "KILL",
        reason: `F93_S1 lost confirmed: ${fmtLabs(score.f93S1.labels)}`,
      };
    }
    return {
      verdict: "UNJUDGED",
      reason: `F93_S1 failed on R10 and on R3a reference; instrument broken`,
    };
  }
  if (score.modalityDestabilised) {
    const broke = Object.entries(score.modality)
      .filter(([id, v]) => MODALITY_HARD_IDS.has(id) && !v.hold && v.heldOnRef)
      .map(([id]) => id);
    return {
      verdict: "KILL",
      reason: `Modality controls destabilised beyond noise floor: ${broke.join(", ") || "unknown"}`,
    };
  }
  if (score.independentBreaks.length) {
    return {
      verdict: "KILL",
      reason: `Independent HOLD break(s): ${score.independentBreaks.map((e) => e.id).join(", ")}`,
    };
  }
  if (!score.f19Hold) {
    if (scoreR3a.f19Hold) {
      return { verdict: "KILL", reason: `F19_S7 lost partially_confirmed: ${fmtLabs(score.f19Labels)}` };
    }
    return {
      verdict: "UNJUDGED",
      reason: `F19_S7 failed on R10 and on R3a; instrument broken`,
    };
  }

  const holdsOk =
    score.falseGreenHold &&
    score.f19Hold &&
    score.independentBreaks.length === 0 &&
    !score.modalityDestabilised &&
    score.f93S1.ok &&
    score.mfAllHold;

  if (score.primaryEaE3.ok && holdsOk) {
    return {
      verdict: "CONFIRM",
      reason:
        "PRIMARY EA_E3 conflicting, all MF polarities hold, F93_S1 holds, every HOLD met. Ship candidate; do not ship in this pass.",
    };
  }

  if (score.primaryEaE3.partial && holdsOk) {
    return {
      verdict: "PARTIAL",
      reason: `EA_E3 landed on partially_confirmed rather than conflicting; controls intact. Labels=${fmtLabs(score.primaryEaE3.labels)}`,
    };
  }

  if (!score.primaryEaE3.ok && holdsOk) {
    return {
      verdict: "PARTIAL",
      reason: `PRIMARY missed; HOLDs intact. EA_E3=${fmtLabs(score.primaryEaE3.labels)}`,
    };
  }

  return {
    verdict: "PARTIAL",
    reason: `PRIMARY and/or HOLD failed. EA_E3=${fmtLabs(score.primaryEaE3.labels)} mfFlip=${score.mfFlip.join(",") || "none"}`,
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
  const r9 = (await readFile(R9_PATH, "utf8")).trim();
  const r10 = (await readFile(R10_PATH, "utf8")).trim();

  if (sha256(live) !== EXPECTED_R3A.sha256 || live.length !== EXPECTED_R3A.length) {
    throw new Error(`Live must be R3a. got len=${live.length} sha=${sha256(live)}`);
  }
  if (sha256(r9) !== EXPECTED_R9.sha256 || r9.length !== EXPECTED_R9.length) {
    throw new Error(`R9 hash/len mismatch. got len=${r9.length} sha=${sha256(r9)}`);
  }
  if (sha256(r10) !== EXPECTED_R10.sha256 || r10.length !== EXPECTED_R10.length) {
    throw new Error(`R10 hash/len mismatch. got len=${r10.length} sha=${sha256(r10)}`);
  }
  if (!r10.includes("may be classified conflicting only when the statement and the cited passage state the same quantity")) {
    throw new Error("R10 missing quantity-scoped basis gate wording");
  }
  if (sha256(r10) === sha256(live) || sha256(r10) === sha256(r9) || sha256(r9) === sha256(live)) {
    throw new Error("R3a, R9, R10 hashes must all differ");
  }

  const variants = { R3a: live, R10: r10 };
  const promptMeta = {};
  for (const [id, textP] of Object.entries({ R3a: live, R9: r9, R10: r10 })) {
    promptMeta[id] = { length: textP.length, sha256: sha256(textP) };
  }

  const statements = await buildStatements();
  if (statements.length !== 37) {
    throw new Error(`Expected 37 statements (27 graded/fixture + 10 MF), got ${statements.length}`);
  }

  const projectedCalls = statements.length * 2 * 3;
  const projectedCost = projectedCalls * 0.009;
  console.log("R10 scoped basis gate vs shipped R3a");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log(`R3a len=${promptMeta.R3a.length} sha256=${promptMeta.R3a.sha256}`);
  console.log(`R9  len=${promptMeta.R9.length} sha256=${promptMeta.R9.sha256}`);
  console.log(`R10 len=${promptMeta.R10.length} sha256=${promptMeta.R10.sha256}`);
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

  let runningCost = 0;
  const results = await mapPool(jobs, CONCURRENCY, async (job) => {
    if (runningCost >= HARD_STOP_USD) {
      return {
        variantId: job.variantId,
        statementId: job.st.id,
        skipped: true,
        costUsd: 0,
        classification: null,
        passage: null,
        explanation: null,
        runIndex: job.runIndex,
      };
    }
    const out = await matchOnce({
      systemPrompt: job.systemPrompt,
      statement: job.st.statement,
      sourceText: job.st.sourceText,
      variantId: job.variantId,
      statementId: job.st.id,
      runIndex: job.runIndex,
    });
    runningCost += out.costUsd || 0;
    process.stdout.write(
      `  ${job.variantId} ${job.st.id} r${job.runIndex + 1} ${shortClass(out.classification)}\n`
    );
    return {
      variantId: job.variantId,
      statementId: job.st.id,
      role: job.st.role,
      plant: job.st.plant,
      expected: job.st.expected || null,
      sourceFile: job.st.sourceFile,
      statementText: job.st.statement,
      runIndex: job.runIndex,
      skipped: false,
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
  const scoreR10 = scoreArm(statements, results, "R10", r3aMajorityById);
  const stop = stoppingVerdict(scoreR10, scoreR3a);

  const gatePara = asciiPromptQuote(
    r10
      .split("\n")
      .find((l) => l.includes("may be classified conflicting only when the statement and the cited passage state the same quantity"))
  );

  const lines = [];
  const L = (s = "") => lines.push(String(s).replace(/\u2013|\u2014|—|–/g, "-"));

  L("# R10 scoped basis gate");
  L();
  L("Harness only. Live `stage2_v4.md` was not edited. R10 = R9 + quantity-scoped basis limb.");
  L("Part 1 richness: `mark-richness-probe.md` (RICHNESS_CONFIRMED).");
  L();
  L("## Pre-flight checklist");
  L();
  L("```");
  L("CONTROL on REFERENCE ARM: F93_S1 must stay confirmed on R3a in this run");
  L("  (vacuous-control guard). MF expected labels from pairs.json. Shipped");
  L("  fixes must stay off confirmed on R3a majority.");
  L("BASELINE three times: Yes. R3a x3 and R10 x3.");
  L("VACUOUS gates: F93_S0 and F93_S3 are vacuous against R3a if R3a already");
  L("  conflicts (report, not wins). Controls that fail on R3a cannot KILL R10.");
  L("PLANTED cells excluded from breaks: Yes. F04_S13 and F17_S9 named.");
  L("Pass scored on more than one exhibit: Yes. EA_E3 primary + ten MF pairs +");
  L("  F93_S1 + five shipped-fix HOLDs + F19 + independents.");
  L("Stopping rule CONFIRMs as well as KILLs: Yes. CONFIRM / KILL / PARTIAL.");
  L("```");
  L();
  L("## Running cost");
  L();
  L("```");
  L(`total_usd=${totalCost.toFixed(4)}`);
  L(`cache=OFF calls=${results.filter((r) => !r.skipped).length}`);
  L(`model=${stageModel.provider}/${stageModel.model} seed=1`);
  L("```");
  L();
  L("## Prompt arms");
  L();
  L("```");
  L(`R3a  len=${promptMeta.R3a.length}  sha256=${promptMeta.R3a.sha256}`);
  L(`R9   len=${promptMeta.R9.length}  sha256=${promptMeta.R9.sha256}`);
  L(`R10  len=${promptMeta.R10.length}  sha256=${promptMeta.R10.sha256}`);
  L("hashes_all_differ=true");
  L("```");
  L();
  L("## R10 change (verbatim; only addition beyond R9)");
  L();
  L("Placement: immediately after the R9 same-figure basis carve-out sentence");
  L("(the paragraph that begins 'That carve-out does not apply...'). Why: that");
  L("is the basis limb's quantity claim; gating here scopes basis without");
  L("touching the magnitude limb ('a number that differs...').");
  L();
  L("```");
  L(gatePara);
  L("```");
  L();
  L("## Stopping rule (written before the run)");
  L();
  L("```");
  L("CONFIRM  PRIMARY EA_E3 confl>=2/3, all MF polarities, F93_S1, every HOLD.");
  L("         Ship candidate only; no live edit in this pass.");
  L("KILL     Shipped fix back on confirmed, OR MF polarity flip, OR modality");
  L("         beyond noise floor of 2 in 23. STOP. Do not reword R10.");
  L("PARTIAL  EA_E3 partially_confirmed with controls intact. STOP and report.");
  L("```");
  L();
  L("## Verdict");
  L();
  L("```");
  L(`${stop.verdict}: ${stop.reason}`);
  L("```");
  L();
  L("## PRIMARY EA_E3 (eval-ablation/meridian_source.txt)");
  L();
  L("```");
  L(
    `EA_E3  R3a ${fmtLabs(scoreR3a.primaryEaE3.labels)}  R10 ${fmtLabs(scoreR10.primaryEaE3.labels)} ok=${scoreR10.primaryEaE3.ok}`
  );
  L("```");
  L();
  L("## CONTROL MF pairs (both polarities)");
  L();
  L("```");
  for (const id of Object.keys(MF_EXPECTED)) {
    L(
      `${id} expected=${MF_EXPECTED[id]}  R3a ${fmtLabs(scoreR3a.mf[id].labels)}  R10 ${fmtLabs(scoreR10.mf[id].labels)} ok=${scoreR10.mf[id].ok}`
    );
  }
  L(`mfAllHold=${scoreR10.mfAllHold} flips=${scoreR10.mfFlip.join(",") || "none"}`);
  L("```");
  L();
  L("## CONTROL F93_S1");
  L();
  L("```");
  L(
    `F93_S1  R3a ${fmtLabs(scoreR3a.f93S1.labels)}  R10 ${fmtLabs(scoreR10.f93S1.labels)} ok=${scoreR10.f93S1.ok}`
  );
  L("```");
  L();
  L("## REPORTED F93_S2 (most informative cell)");
  L();
  L("```");
  L(
    `F93_S2  R3a ${fmtLabs(scoreR3a.f93S2Labels)}  R10 ${fmtLabs(scoreR10.f93S2Labels)}`
  );
  L("If the scoped gate works, the false red should disappear under R10.");
  L("```");
  L();
  L("## REPORTED vacuous F93_S0 and F93_S3");
  L();
  L("```");
  L(
    `F93_S0  R3a ${fmtLabs(scoreR3a.f93S0Labels)}  R10 ${fmtLabs(scoreR10.f93S0Labels)} vacuous_vs_ref=${onLabel(scoreR3a.f93S0Labels, "conflicting", 2)}`
  );
  L(
    `F93_S3  R3a ${fmtLabs(scoreR3a.f93S3Labels)}  R10 ${fmtLabs(scoreR10.f93S3Labels)} vacuous_vs_ref=${onLabel(scoreR3a.f93S3Labels, "conflicting", 2)}`
  );
  L("Not wins when R3a already conflicts.");
  L("```");
  L();
  L("## HOLD false greens (EA_E2 above all)");
  L();
  L("```");
  for (const id of FALSE_GREEN_IDS) {
    L(
      `${id}  R3a ${fmtLabs(scoreR3a.falseGreens[id].labels)}  R10 ${fmtLabs(scoreR10.falseGreens[id].labels)} ok=${scoreR10.falseGreens[id].ok}`
    );
  }
  L("```");
  L();
  L("## HOLD F19_S7");
  L();
  L("```");
  L(
    `F19_S7  R3a ${fmtLabs(scoreR3a.f19Labels)}  R10 ${fmtLabs(scoreR10.f19Labels)} ok=${scoreR10.f19Hold}`
  );
  L("```");
  L();
  L("## HOLD independent (includes F92_S0)");
  L();
  L("```");
  for (const id of [...INDEPENDENT_HOLD_IDS].sort()) {
    const a = armRowsOf(results, "R3a", id).map((r) => r.classification);
    const b = armRowsOf(results, "R10", id).map((r) => r.classification);
    const t = r3aMajorityById[id];
    L(
      `${id}  r3aMaj=${shortClass(t)}  R3a ${fmtLabs(a)}  R10 ${fmtLabs(b)} hold=${holdsLabel(b, t, 2)}`
    );
  }
  if (scoreR10.vacuousControlSkipped.length) {
    L("vacuous_control_skipped:");
    for (const e of scoreR10.vacuousControlSkipped) {
      L(`  ${e.id} r3a=${fmtLabs(e.r3aLabels)} r10=${fmtLabs(e.labels)} (${e.note})`);
    }
  }
  L("```");
  L();
  L("## HOLD modality controls (all three runs)");
  L();
  L("```");
  for (const id of MODALITY_CONTROL_IDS) {
    const m = scoreR10.modality[id];
    L(
      `${id}  r3aMaj=${shortClass(m.r3aMajority)}  R3a ${fmtLabs(scoreR3a.modality[id].labels)}  R10 ${fmtLabs(m.labels)} hold=${m.hold}${id === "F08_S2" ? " (noise floor)" : ""}`
    );
  }
  L(`modalityDestabilised=${scoreR10.modalityDestabilised}`);
  L("```");
  L();
  L("## PLANTED (not breaks); F04_S13 and F17_S9 explicit");
  L();
  L("```");
  L(
    `F04_S13  R3a ${fmtLabs(scoreR3a.f04S13Labels)}  R10 ${fmtLabs(scoreR10.f04S13Labels)}`
  );
  L(
    `F17_S9   R3a ${fmtLabs(scoreR3a.f17S9Labels)}  R10 ${fmtLabs(scoreR10.f17S9Labels)}`
  );
  for (const e of scoreR10.plantedReport) {
    L(`${e.id} r3a=${shortClass(e.r3aMajority)} R10 ${fmtLabs(e.labels)} hold=${e.hold}`);
  }
  L("```");
  L();
  L("## Fixture and probe passages (every run)");
  L();
  L("```");
  for (const id of FIXTURE_PROBE_IDS) {
    L(`--- ${id} ---`);
    for (const variantId of ["R3a", "R10"]) {
      for (const r of armRowsOf(results, variantId, id)) {
        L(
          `${variantId} r${r.runIndex + 1}: ${shortClass(r.classification)} passage=${String(r.passage || "").replace(/\n/g, " | ")}`
        );
      }
    }
    L();
  }
  L("```");
  L();
  L("## EA_E3 explanations");
  L();
  for (const variantId of ["R3a", "R10"]) {
    for (const r of armRowsOf(results, variantId, "EA_E3")) {
      L(`### ${variantId} EA_E3 run ${r.runIndex + 1}: ${r.classification}`);
      L();
      L("```");
      L(String(r.explanation || ""));
      L("```");
      L();
    }
  }
  L("## Opinion");
  L();
  L("```");
  L("FILLED_BY_POST");
  L("```");
  L();
  L("## Identity collision reminder");
  L();
  L("```");
  L("eval-ablation EA_E3 uses meridian_source.txt.");
  L("claim-spans CS_E3 uses claim-spans/evaluative-accident/source_ic_memo.txt.");
  L("corpus E3:S0:ic_memo is a third different statement.");
  L("```");

  await mkdir(OUT_DIR, { recursive: true });
  const reportPath = path.join(OUT_DIR, "r10-scoped-basis-gate.md");
  const rowsPath = path.join(OUT_DIR, "r10-scoped-basis-gate-rows.json");
  await writeFile(reportPath, lines.join("\n") + "\n", "utf8");
  await writeFile(
    rowsPath,
    JSON.stringify(
      {
        promptMeta,
        totalCostUsd: totalCost,
        stop,
        scoreR3a,
        scoreR10,
        r3aMajorityById,
        results,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`Wrote ${reportPath}`);
  console.log(`Wrote ${rowsPath}`);
  console.log(`VERDICT ${stop.verdict}: ${stop.reason}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

