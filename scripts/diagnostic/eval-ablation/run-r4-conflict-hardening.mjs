#!/usr/bin/env node
/**
 * Measure R4 conflict hardening against shipped R3a.
 * Stage 2 only. Cache OFF. Live stage2_v4.md is NOT edited (must already be R3a).
 *
 * Measurement set: 23 graded-set statements + nordholt-dirty S1 + nordholt-dirty S5
 * (F92_S0 is already in the graded set; unique total = 25).
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-r4-conflict-hardening.mjs
 *
 * Expected cost: ~$1.80.
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
const R4_PATH = path.join(__dirname, "conflict-hardening-r4.txt");
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const CS_E3_SOURCE_PATH = path.join(
  DIAG_ROOT,
  "claim-spans/evaluative-accident/source_ic_memo.txt"
);
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const STAGE2_SEED = 1;
const CONCURRENCY = 6;

const EXPECTED_R3A = {
  length: 12812,
  sha256: "bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c",
};

const FALSE_GREEN_IDS = ["EA_E2", "CS_E3", "F01_S10", "F04_S20", "F12_S0"];
const NOISE_FLOOR_IDS = new Set(["F12_S0", "F08_S2"]);

const HARDENING_SENTENCE =
  "Where the statement and the source give figures for the same thing that cannot both be true, or name plans that cannot both hold, that is conflicting. Do not route it to partially_confirmed because the statement also carries extra or evaluative wording.";

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
    traceName: "diag-eval-ablation-r4-conflict-hardening",
    spanName: "stage2-r4-hardening",
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
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
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

/**
 * PLANTED / INDEPENDENT annotations match rewrite-ladder.md Part 1.
 */
async function buildStatements() {
  const meridian = await readFile(MERIDIAN_PATH, "utf8");
  const csE3Source = await readFile(CS_E3_SOURCE_PATH, "utf8");
  const factSheet = await readFile(path.join(NORDHOLT_DIR, "source_3_fact_sheet.txt"), "utf8");
  const lpUpdate = await readFile(path.join(NORDHOLT_DIR, "source_4_lp_update.txt"), "utf8");
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
      adjudication: "EXHIBIT_ADJUDICATED",
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
      plant: "INDEPENDENT",
      adjudication: "EXHIBIT_ADJUDICATED",
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
      plant: "PLANTED",
      adjudication: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
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
      plant: "PLANTED",
      adjudication: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
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
      plant: "INDEPENDENT",
      adjudication: "RECORDED_ONLY",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "EA_E1",
      role: "recorded_only",
      plant: "INDEPENDENT",
      adjudication: "RECORDED_ONLY",
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
      plant: "PLANTED",
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
      plant: "PLANTED",
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
      plant: "INDEPENDENT",
      adjudication: "EXHIBIT_ADJUDICATED_FALSE_GREEN",
      baselineLabel: "confirmed",
      correctLabel: "partially_confirmed",
      statement:
        "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F04_S1",
      role: "control",
      plant: "PLANTED",
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
      plant: "PLANTED",
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
      plant: "INDEPENDENT",
      adjudication: "RECORDED_FALSE_GREEN",
      baselineLabel: "confirmed",
      correctLabel: null,
      statement: "Shopify is a small startup serving approximately 10,000 customers.",
      sourceText: src["91_adversarial_shopify_2010_trimmed.txt"].text,
      sourceFile: src["91_adversarial_shopify_2010_trimmed.txt"].resolvedFrom,
    },
    {
      id: "F14_S4",
      role: "control",
      plant: "PLANTED",
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
      plant: "PLANTED",
      adjudication: "CONTROL_ADJUDICATED",
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
      plant: "PLANTED",
      adjudication: "UNADJUDICATED",
      baselineLabel: "partially_confirmed",
      correctLabel: null,
      statement:
        "NorTech is a Stockholm-headquartered manufacturer of industrial heating and cooling systems, and when we invested in 2021 it was a strong but underexposed business - dominant in the Nordics and barely visible elsewhere.",
      sourceText: src["12_synth_linkedin_post.txt"].text,
      sourceFile: src["12_synth_linkedin_post.txt"].resolvedFrom,
    },
    {
      id: "F14_S11",
      role: "control",
      plant: "PLANTED",
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
      plant: "INDEPENDENT",
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
      plant: "PLANTED",
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
      plant: "PLANTED",
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
      plant: "PLANTED",
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
      plant: "PLANTED",
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
      plant: "PLANTED",
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
      plant: "INDEPENDENT",
      adjudication: "UNADJUDICATED",
      baselineLabel: "no_support",
      correctLabel: null,
      statement: "The firm invested in Helios Grid Controls in 2024.",
      sourceText: src["90_adversarial_b17_latent.txt"].text,
      sourceFile: src["90_adversarial_b17_latent.txt"].resolvedFrom,
    },
    {
      id: "ND_S1",
      role: "primary",
      plant: "INDEPENDENT",
      adjudication: "CORPUS_LOST_CONTRADICTION",
      baselineLabel: "conflicting",
      correctLabel: "conflicting",
      statement: "We now run 15 cold-chain facilities across four Nordic markets and employ over 800 people.",
      sourceText: factSheet,
      sourceFile: "~/Downloads/source_3_fact_sheet.txt",
      pairId: "nordholt-dirty:S1:fact sheet",
    },
    {
      id: "ND_S5",
      role: "primary",
      plant: "INDEPENDENT",
      adjudication: "CORPUS_LOST_CONTRADICTION",
      baselineLabel: "conflicting",
      correctLabel: "conflicting",
      statement:
        "We expect to complete at least five further bolt-on acquisitions this year and anticipate a full exit by 2027, which will deliver strong double-digit returns.",
      sourceText: lpUpdate,
      sourceFile: "~/Downloads/source_4_lp_update.txt",
      pairId: "nordholt-dirty:S5:LP update",
    },
  ];
}

function scoreArm(statements, rows, variantId, r3aMajorityById) {
  const armRows = (id) =>
    rows.filter((r) => r.variantId === variantId && r.statementId === id).sort((a, b) => a.runIndex - b.runIndex);

  const primary = {};
  let primaryPass = true;
  for (const id of ["ND_S1", "ND_S5"]) {
    const labs = armRows(id).map((r) => r.classification);
    const ok = holdsLabel(labs, "conflicting", 2);
    primary[id] = { labels: labs, ok };
    if (!ok) primaryPass = false;
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
  const plantedReport = [];
  for (const st of statements) {
    if (st.role !== "control") continue;
    if (st.id === "F19_S7") continue;
    if (FALSE_GREEN_IDS.includes(st.id)) continue;
    const labs = armRows(st.id).map((r) => r.classification);
    const r3aTarget = r3aMajorityById[st.id];
    const hold = holdsLabel(labs, r3aTarget, 2);
    const entry = {
      id: st.id,
      role: st.role,
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
    // F92_S0 is RECORD (expected confirmed both arms), not a HOLD break.
    if (st.id === "F92_S0") continue;
    if (!hold) independentBreaks.push(entry);
  }

  const f92 = armRows("F92_S0").map((r) => r.classification);
  const eaE3 = armRows("EA_E3").map((r) => r.classification);

  return {
    primary,
    primaryPass,
    falseGreens,
    falseGreenHold,
    f19Hold,
    f19Labels: f19Labs,
    independentBreaks,
    plantedReport,
    f92Labels: f92,
    eaE3Labels: eaE3,
  };
}

function stoppingVerdict(scoreR4) {
  // Written before the run.
  // CONFIRM: PRIMARY met and every HOLD met.
  // KILL: any of the five false greens returns to confirmed on >=2/3.
  // PARTIAL: PRIMARY met but one independent control breaks, or PRIMARY missed with HOLDs intact.
  const killFg = Object.entries(scoreR4.falseGreens).filter(([, v]) => !v.ok);
  if (killFg.length) {
    return {
      verdict: "KILL",
      reason: `False green(s) back on confirmed >=2/3: ${killFg.map(([id]) => id).join(", ")}`,
    };
  }
  const holdsOk = scoreR4.f19Hold && scoreR4.independentBreaks.length === 0;
  if (scoreR4.primaryPass && holdsOk) {
    return { verdict: "CONFIRM", reason: "PRIMARY met and every HOLD met." };
  }
  if (scoreR4.primaryPass && !holdsOk) {
    return {
      verdict: "PARTIAL",
      reason: `PRIMARY met but independent control break(s): ${scoreR4.independentBreaks
        .map((e) => e.id)
        .join(", ")}${scoreR4.f19Hold ? "" : "; F19_S7 broke"}`,
    };
  }
  if (!scoreR4.primaryPass && holdsOk) {
    return {
      verdict: "PARTIAL",
      reason: `PRIMARY missed (S1 ok=${scoreR4.primary.ND_S1.ok}, S5 ok=${scoreR4.primary.ND_S5.ok}); HOLDs intact.`,
    };
  }
  return {
    verdict: "PARTIAL",
    reason: `PRIMARY missed and HOLD(s) failed. S1=${scoreR4.primary.ND_S1.ok} S5=${scoreR4.primary.ND_S5.ok} F19=${scoreR4.f19Hold} indepBreaks=${scoreR4.independentBreaks.map((e) => e.id).join(",") || "none"}`,
  };
}

function fmtLabs(labs) {
  return labs.map(shortClass).join("/");
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const live = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const r3aFile = (await readFile(R3A_PATH, "utf8")).trim();
  const r4 = (await readFile(R4_PATH, "utf8")).trim();

  if (sha256(live) !== EXPECTED_R3A.sha256 || live.length !== EXPECTED_R3A.length) {
    throw new Error(
      `Live stage2_v4.md must be shipped R3a. got len=${live.length} sha=${sha256(live)}`
    );
  }
  if (sha256(r3aFile) !== EXPECTED_R3A.sha256 || r3aFile.length !== EXPECTED_R3A.length) {
    throw new Error("frame-rule-winner-r3a.txt hash/length mismatch");
  }
  if (!r4.includes(HARDENING_SENTENCE)) {
    throw new Error("R4 missing hardening sentence");
  }
  if (!r4.startsWith(r3aFile.slice(0, 200))) {
    throw new Error("R4 does not appear to be R3a-based");
  }
  // R4 = R3a + one sentence (254 chars including newline)
  if (r4.length !== r3aFile.length + 1 + HARDENING_SENTENCE.length) {
    throw new Error(
      `R4 length unexpected: ${r4.length} vs ${r3aFile.length + 1 + HARDENING_SENTENCE.length}`
    );
  }

  const variants = { R3a: live, R4: r4 };
  const promptMeta = {};
  for (const [id, text] of Object.entries(variants)) {
    promptMeta[id] = { length: text.length, sha256: sha256(text) };
  }

  const statements = await buildStatements();
  if (statements.length !== 25) {
    throw new Error(`Expected 25 unique statements, got ${statements.length}`);
  }

  console.log("R4 conflict hardening vs shipped R3a");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log(`R3a len=${promptMeta.R3a.length} sha256=${promptMeta.R3a.sha256}`);
  console.log(`R4  len=${promptMeta.R4.length} sha256=${promptMeta.R4.sha256}`);
  console.log(`Statements: ${statements.length} (23 graded + nordholt S1/S5; F92 already in graded)`);
  console.log("Placement: Numeric rules, after same-metric magnitude line");
  console.log(`Hardening sentence unchanged from proposed wording.`);
  console.log("");

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
    return {
      variantId: job.variantId,
      statementId: job.st.id,
      pairId: job.st.pairId || null,
      role: job.st.role,
      plant: job.st.plant,
      adjudication: job.st.adjudication,
      sourceFile: job.st.sourceFile,
      runIndex: job.runIndex,
      ...out,
    };
  });

  const totalCost = results.reduce((s, r) => s + (r.costUsd || 0), 0);
  console.log(`Cost: $${totalCost.toFixed(4)}`);

  const r3aMajorityById = {};
  for (const st of statements) {
    const labs = results
      .filter((r) => r.variantId === "R3a" && r.statementId === st.id)
      .sort((a, b) => a.runIndex - b.runIndex)
      .map((r) => r.classification);
    r3aMajorityById[st.id] = majorityLabel(labs);
  }

  const scoreR3a = scoreArm(statements, results, "R3a", r3aMajorityById);
  const scoreR4 = scoreArm(statements, results, "R4", r3aMajorityById);
  const stop = stoppingVerdict(scoreR4);

  const lines = [];
  lines.push("# R4 conflict hardening vs shipped R3a");
  lines.push("");
  lines.push("Harness only. Live `stage2_v4.md` was not edited in this pass.");
  lines.push("");
  lines.push("## Stopping rule (written before the run)");
  lines.push("");
  lines.push("CONFIRM PRIMARY met and every HOLD met. R4 goes live as its own commit in a later pass, after Ben reads the result.");
  lines.push("KILL Any of the five false greens returns to confirmed on >=2/3. The hardening sentence has cost more than it bought. Report and STOP. Do not write a second wording. R3a stands as shipped.");
  lines.push("PARTIAL PRIMARY met but one independent control breaks, or PRIMARY missed with all HOLDs intact. Report which, recommend, and stop.");
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  lines.push(`**${stop.verdict}** — ${stop.reason}`);
  lines.push("");
  lines.push("## Prompt arms");
  lines.push("");
  lines.push("```");
  lines.push(`R3a (live / reference)  len=${promptMeta.R3a.length}  sha256=${promptMeta.R3a.sha256}`);
  lines.push(`R4  (harness only)      len=${promptMeta.R4.length}  sha256=${promptMeta.R4.sha256}`);
  lines.push("```");
  lines.push("");
  lines.push("R4 = R3a plus one sentence under Numeric rules, immediately after the same-metric magnitude line.");
  lines.push("Wording: proposed text unchanged (no refine).");
  lines.push("");
  lines.push("```");
  lines.push(HARDENING_SENTENCE);
  lines.push("```");
  lines.push("");
  lines.push(`Cost: $${totalCost.toFixed(4)}. Cache OFF. Model ${stageModel.provider}/${stageModel.model}. seed=1.`);
  lines.push(`Unique statements: ${statements.length} (spec said 26; F92_S0 is already in the 23 graded set, so 23+2=25 unique).`);
  lines.push("");
  lines.push("## PRIMARY (nordholt-dirty lost contradictions)");
  lines.push("");
  lines.push("```");
  for (const id of ["ND_S1", "ND_S5"]) {
    const a = scoreR3a.primary[id];
    const b = scoreR4.primary[id];
    const st = statements.find((s) => s.id === id);
    lines.push(
      `${id} ${st.pairId}  R3a ${fmtLabs(a.labels)}  R4 ${fmtLabs(b.labels)}  R4_ok=${b.ok}`
    );
  }
  lines.push(`PRIMARY pass: ${scoreR4.primaryPass}`);
  lines.push("```");
  lines.push("");
  lines.push("## HOLD false greens off confirmed >=2/3");
  lines.push("");
  lines.push("```");
  for (const id of FALSE_GREEN_IDS) {
    const a = scoreR3a.falseGreens[id];
    const b = scoreR4.falseGreens[id];
    lines.push(`${id}  R3a ${fmtLabs(a.labels)}  R4 ${fmtLabs(b.labels)}  R4_ok=${b.ok}`);
  }
  lines.push(`falseGreenHold: ${scoreR4.falseGreenHold}`);
  lines.push("```");
  lines.push("");
  lines.push("## HOLD F19_S7 partially_confirmed >=2/3");
  lines.push("");
  lines.push("```");
  lines.push(`F19_S7  R3a ${fmtLabs(scoreR3a.f19Labels)}  R4 ${fmtLabs(scoreR4.f19Labels)}  R4_ok=${scoreR4.f19Hold}`);
  lines.push("```");
  lines.push("");
  lines.push("## HOLD independent controls vs R3a majority label");
  lines.push("");
  lines.push("```");
  if (scoreR4.independentBreaks.length === 0) {
    lines.push("No independent control breaks.");
  } else {
    for (const e of scoreR4.independentBreaks) {
      lines.push(
        `BREAK ${e.id} plant=${e.plant} r3aMajority=${shortClass(e.r3aMajority)} R4 ${fmtLabs(e.labels)}`
      );
    }
  }
  lines.push("```");
  lines.push("");
  lines.push("## PLANTED report (not scoreboard breaks)");
  lines.push("");
  lines.push("```");
  for (const e of scoreR4.plantedReport) {
    lines.push(
      `${e.id} plant=${e.plant} noise=${e.noiseFloor} r3a=${shortClass(e.r3aMajority)} R4 ${fmtLabs(e.labels)} hold=${e.hold}`
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## RECORD F92_S0 and EA_E3 (expected confirmed both arms)");
  lines.push("");
  lines.push("Both are expected to stay confirmed. Naming them so they do not pass unmentioned.");
  lines.push("");
  lines.push("```");
  lines.push(`F92_S0  R3a ${fmtLabs(scoreR3a.f92Labels)}  R4 ${fmtLabs(scoreR4.f92Labels)}`);
  lines.push(`EA_E3   R3a ${fmtLabs(scoreR3a.eaE3Labels)}  R4 ${fmtLabs(scoreR4.eaE3Labels)}`);
  lines.push("```");
  lines.push("");
  lines.push("F92_S0 source: 91_adversarial_shopify_2010_trimmed (adversarial Shopify 2010 trim).");
  lines.push("EA_E3 source: scripts/diagnostic/eval-ablation/meridian_source.txt (eval-ablation Meridian E3; not claim-spans E3).");
  lines.push("");
  lines.push("## Full label grid");
  lines.push("");
  lines.push("```");
  for (const st of statements) {
    const a = results
      .filter((r) => r.variantId === "R3a" && r.statementId === st.id)
      .sort((x, y) => x.runIndex - y.runIndex)
      .map((r) => r.classification);
    const b = results
      .filter((r) => r.variantId === "R4" && r.statementId === st.id)
      .sort((x, y) => x.runIndex - y.runIndex)
      .map((r) => r.classification);
    lines.push(
      `${st.id.padEnd(8)} ${st.role.padEnd(14)} ${st.plant.padEnd(12)} R3a ${fmtLabs(a).padEnd(16)} R4 ${fmtLabs(b)}`
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  if (stop.verdict === "CONFIRM") {
    lines.push(
      "Ship R4 as its own live prompt commit in a later pass after Ben reads this. Do not auto-edit stage2_v4.md here."
    );
  } else if (stop.verdict === "KILL") {
    lines.push("Do not ship R4. R3a stands. Do not write a second wording.");
  } else {
    lines.push(
      "PARTIAL: report above. Recommend holding R3a live and deciding whether the PRIMARY miss or control break is worth another instrument later. Do not write a second wording in this pass."
    );
  }
  lines.push("");

  const report = lines.join("\n");
  await mkdir(OUT_DIR, { recursive: true });
  const rowsPath = path.join(OUT_DIR, "r4-conflict-hardening-rows.json");
  const mdPath = path.join(OUT_DIR, "r4-conflict-hardening.md");
  await writeFile(
    rowsPath,
    JSON.stringify(
      {
        meta: {
          promptMeta,
          totalCostUsd: totalCost,
          statementCount: statements.length,
          hardeningSentence: HARDENING_SENTENCE,
          placement: "Numeric rules after same-metric magnitude line",
          wordingRefined: false,
          stoppingVerdict: stop,
          scoreR3a,
          scoreR4,
          r3aMajorityById,
        },
        statements: statements.map((s) => ({
          id: s.id,
          role: s.role,
          plant: s.plant,
          adjudication: s.adjudication,
          sourceFile: s.sourceFile,
          pairId: s.pairId || null,
          statement: s.statement,
        })),
        rows: results,
      },
      null,
      2
    )
  );
  await writeFile(mdPath, report);
  console.log("");
  console.log(report);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${rowsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
