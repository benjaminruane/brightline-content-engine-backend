#!/usr/bin/env node
/**
 * Measure R5 realised-versus-unrealised mark rule against shipped R3a.
 * Stage 2 only. Cache OFF. Live stage2_v4.md is NOT edited.
 *
 * Measurement set: the 23-statement graded set (includes EA_E3).
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-r5-mark-rule.mjs
 *
 * Expected cost: ~$1.80. Ceiling under $3.00.
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
const R5_PATH = path.join(__dirname, "mark-rule-r5.txt");
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const CS_E3_SOURCE_PATH = path.join(
  DIAG_ROOT,
  "claim-spans/evaluative-accident/source_ic_memo.txt"
);
const STAGE2_SEED = 1;
const CONCURRENCY = 6;
const HARD_STOP_USD = 3.0;

const EXPECTED_R3A = {
  length: 12812,
  sha256: "bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c",
};

const FALSE_GREEN_IDS = ["EA_E2", "CS_E3", "F01_S10", "F04_S20", "F12_S0"];
const NOISE_FLOOR_IDS = new Set(["F12_S0", "F08_S2"]);

const FRAME_BLOCK_R3A = `Frame and period priority
Judge the period, vintage, duration or frame of a statement before judging its figures or its evaluative wording. A duration, tenure, hold length, or partnership length that the source states differently, or does not state, is enough on its own: classify partially_confirmed even when the rest of the statement matches, including when the duration sits in an otherwise matching opener. If the statement attaches a period, vintage, duration or frame the source does not support, the statement is partially_confirmed even when every figure matches and even when every other clause would otherwise confirm.`;

/** Proposed wording, unchanged. Two sentences forming the one rung. */
const MARK_RULE_WORDING = `A performance figure carries a basis as well as a value. Where the statement presents a figure as completed or realised and the source presents the same figure as a current position, a valuation or an estimate, the statement is partially_confirmed even though the figure matches.`;

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
    traceName: "diag-eval-ablation-r5-mark-rule",
    spanName: "stage2-r5-mark-rule",
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
 * 23-statement graded set (EA_E3 already included).
 */
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
      plant: "INDEPENDENT",
      adjudication: "EXHIBIT_ADJUDICATED",
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
      statement:
        "In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction.",
      sourceText: src["04_synth_vc_pinterest_style_memo.txt"].text,
      sourceFile: src["04_synth_vc_pinterest_style_memo.txt"].resolvedFrom,
    },
    {
      id: "EA_E3",
      role: "primary",
      plant: "INDEPENDENT",
      adjudication: "PRIMARY_MARK_RULE",
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
    {
      id: "EA_E1",
      role: "recorded_only",
      plant: "INDEPENDENT",
      adjudication: "RECORDED_ONLY",
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
      statement: "Shopify is a small startup serving approximately 10,000 customers.",
      sourceText: src["91_adversarial_shopify_2010_trimmed.txt"].text,
      sourceFile: src["91_adversarial_shopify_2010_trimmed.txt"].resolvedFrom,
    },
    {
      id: "F14_S4",
      role: "control",
      plant: "PLANTED",
      adjudication: "UNADJUDICATED",
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
      statement: "We expect to bring a specific potential investment to consider over the coming months.",
      sourceText: src["14_synth_thesis_only_memo.txt"].text,
      sourceFile: src["14_synth_thesis_only_memo.txt"].resolvedFrom,
    },
    {
      id: "F18_S6",
      role: "control",
      plant: "INDEPENDENT",
      adjudication: "UNADJUDICATED",
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
      statement: "We have invested EUR 720 million of equity for an 84% stake.",
      sourceText: src["15_synth_very_long_memo.txt"].text,
      sourceFile: src["15_synth_very_long_memo.txt"].resolvedFrom,
    },
    {
      id: "F05_S5",
      role: "control",
      plant: "PLANTED",
      adjudication: "UNADJUDICATED",
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
      statement: "We recommend approval.",
      sourceText: src["01_bvp_shopify_memo.txt"].text,
      sourceFile: src["01_bvp_shopify_memo.txt"].resolvedFrom,
    },
    {
      id: "F90_S0",
      role: "control",
      plant: "INDEPENDENT",
      adjudication: "UNADJUDICATED",
      statement: "The firm invested in Helios Grid Controls in 2024.",
      sourceText: src["90_adversarial_b17_latent.txt"].text,
      sourceFile: src["90_adversarial_b17_latent.txt"].resolvedFrom,
    },
  ];
}

function scoreArm(statements, rows, variantId, r3aMajorityById) {
  const armRows = (id) =>
    rows
      .filter((r) => r.variantId === variantId && r.statementId === id)
      .sort((a, b) => a.runIndex - b.runIndex);

  const eaE3Labs = armRows("EA_E3").map((r) => r.classification);
  const primaryPass = offConfirmed(eaE3Labs, 2);
  const primary = { EA_E3: { labels: eaE3Labs, ok: primaryPass } };

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
  const eaE1 = armRows("EA_E1").map((r) => r.classification);

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
    eaE3Labels: eaE3Labs,
    eaE1Labels: eaE1,
  };
}

function stoppingVerdict(scoreR5) {
  // Written before the run.
  // CONFIRM: PRIMARY met and every HOLD met. Ship CANDIDATE; do not ship in this pass.
  // KILL: any of the five shipped fixes returns to confirmed on >=2/3.
  // PARTIAL: PRIMARY missed with all HOLDs intact.
  const killFg = Object.entries(scoreR5.falseGreens).filter(([, v]) => !v.ok);
  if (killFg.length) {
    return {
      verdict: "KILL",
      reason: `False green(s) back on confirmed >=2/3: ${killFg.map(([id]) => id).join(", ")}`,
    };
  }
  const holdsOk = scoreR5.f19Hold && scoreR5.independentBreaks.length === 0;
  if (scoreR5.primaryPass && holdsOk) {
    return {
      verdict: "CONFIRM",
      reason: "PRIMARY met and every HOLD met. R5 is a ship CANDIDATE. Does not ship in this pass.",
    };
  }
  if (!scoreR5.primaryPass && holdsOk) {
    return {
      verdict: "PARTIAL",
      reason: "PRIMARY missed (EA_E3 still confirmed on >=2/3); HOLDs intact.",
    };
  }
  if (scoreR5.primaryPass && !holdsOk) {
    return {
      verdict: "PARTIAL",
      reason: `PRIMARY met but HOLD break(s): indep=${scoreR5.independentBreaks
        .map((e) => e.id)
        .join(",") || "none"}; F19=${scoreR5.f19Hold}`,
    };
  }
  return {
    verdict: "PARTIAL",
    reason: `PRIMARY missed and HOLD(s) failed. F19=${scoreR5.f19Hold} indepBreaks=${scoreR5.independentBreaks.map((e) => e.id).join(",") || "none"}`,
  };
}

function fmtLabs(labs) {
  return labs.map(shortClass).join("/");
}

function explanationNamesBasis(text) {
  const t = String(text || "").toLowerCase();
  const hits = [];
  for (const phrase of [
    "marked",
    "mark",
    "current",
    "valuation",
    "estimate",
    "unrealised",
    "unrealized",
    "returned",
    "realised",
    "realized",
    "completed",
    "basis",
  ]) {
    if (t.includes(phrase)) hits.push(phrase);
  }
  return hits;
}

function framingOnImplication(text) {
  const t = String(text || "");
  const lower = t.toLowerCase();
  if (!lower.includes("fram")) return null;
  if (
    lower.includes("impl") ||
    lower.includes("means") ||
    lower.includes("risk") ||
    lower.includes("conclusion") ||
    lower.includes("key-person") ||
    lower.includes("key person")
  ) {
    return t;
  }
  return null;
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const live = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const r3aFile = (await readFile(R3A_PATH, "utf8")).trim();
  const r5 = (await readFile(R5_PATH, "utf8")).trim();

  if (sha256(live) !== EXPECTED_R3A.sha256 || live.length !== EXPECTED_R3A.length) {
    throw new Error(
      `Live stage2_v4.md must be shipped R3a. got len=${live.length} sha=${sha256(live)}`
    );
  }
  if (sha256(r3aFile) !== EXPECTED_R3A.sha256 || r3aFile.length !== EXPECTED_R3A.length) {
    throw new Error("frame-rule-winner-r3a.txt hash/length mismatch");
  }
  if (!r5.includes(MARK_RULE_WORDING)) {
    throw new Error("R5 missing mark-rule wording");
  }
  if (!r5.includes(FRAME_BLOCK_R3A)) {
    throw new Error("R5 missing R3a frame block");
  }
  const expectedR5Len = r3aFile.length + 1 + MARK_RULE_WORDING.length;
  if (r5.length !== expectedR5Len) {
    throw new Error(`R5 length unexpected: ${r5.length} vs ${expectedR5Len}`);
  }
  if (sha256(r5) === sha256(live)) {
    throw new Error("R5 hash must differ from R3a");
  }

  const variants = { R3a: live, R5: r5 };
  const promptMeta = {};
  for (const [id, text] of Object.entries(variants)) {
    promptMeta[id] = { length: text.length, sha256: sha256(text) };
  }

  const statements = await buildStatements();
  if (statements.length !== 23) {
    throw new Error(`Expected 23 graded-set statements, got ${statements.length}`);
  }

  const projectedCalls = statements.length * 2 * 3;
  const projectedCost = projectedCalls * 0.013;
  console.log("R5 mark rule vs shipped R3a");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log(`R3a len=${promptMeta.R3a.length} sha256=${promptMeta.R3a.sha256}`);
  console.log(`R5  len=${promptMeta.R5.length} sha256=${promptMeta.R5.sha256}`);
  console.log(`Statements: ${statements.length} (23 graded set; EA_E3 included)`);
  console.log("Placement: Frame and period priority, after the existing frame paragraph");
  console.log("Wording: proposed text unchanged (no refine).");
  console.log(
    `Expected cost ~$${projectedCost.toFixed(2)} for ${projectedCalls} calls (prior ~$0.013/call). Under $${HARD_STOP_USD}.`
  );
  if (projectedCost > HARD_STOP_USD) {
    throw new Error(`Projected cost $${projectedCost} exceeds hard stop $${HARD_STOP_USD}`);
  }
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
    process.stdout.write(`  ${job.variantId} ${job.st.id} r${job.runIndex + 1} ${shortClass(out.classification)}\n`);
    return {
      variantId: job.variantId,
      statementId: job.st.id,
      role: job.st.role,
      plant: job.st.plant,
      adjudication: job.st.adjudication,
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
    const labs = results
      .filter((r) => r.variantId === "R3a" && r.statementId === st.id)
      .sort((a, b) => a.runIndex - b.runIndex)
      .map((r) => r.classification);
    r3aMajorityById[st.id] = majorityLabel(labs);
  }

  const scoreR3a = scoreArm(statements, results, "R3a", r3aMajorityById);
  const scoreR5 = scoreArm(statements, results, "R5", r3aMajorityById);
  const stop = stoppingVerdict(scoreR5);

  const eaE3R5Rows = results
    .filter((r) => r.variantId === "R5" && r.statementId === "EA_E3")
    .sort((a, b) => a.runIndex - b.runIndex);
  const eaE2R5Rows = results
    .filter((r) => r.variantId === "R5" && r.statementId === "EA_E2")
    .sort((a, b) => a.runIndex - b.runIndex);

  const framingQuotes = [];
  for (const r of [...eaE2R5Rows, ...eaE3R5Rows]) {
    const q = framingOnImplication(r.explanation);
    if (q) framingQuotes.push({ id: r.statementId, run: r.runIndex + 1, explanation: q });
  }

  const lines = [];
  lines.push("# R5 realised versus unrealised mark rule");
  lines.push("");
  lines.push("Harness only. Live `stage2_v4.md` was not edited in this pass.");
  lines.push("Scope note `claude/b109-realised-vs-unrealised-scope.md` was not in the repo.");
  lines.push("");
  lines.push("## Scoreboard (updated for R5)");
  lines.push("");
  lines.push("```");
  lines.push("arm   EA_E3 off conf  five holds  F19 hold  indep holds  verdict");
  lines.push(
    `R3a   ${scoreR3a.primaryPass ? "yes" : "no "}             ${scoreR3a.falseGreenHold ? "yes" : "no "}         ${scoreR3a.f19Hold ? "yes" : "no "}      ${scoreR3a.independentBreaks.length === 0 ? "yes" : "no "}         reference`
  );
  lines.push(
    `R5    ${scoreR5.primaryPass ? "yes" : "no "}             ${scoreR5.falseGreenHold ? "yes" : "no "}         ${scoreR5.f19Hold ? "yes" : "no "}      ${scoreR5.independentBreaks.length === 0 ? "yes" : "no "}         ${stop.verdict}`
  );
  lines.push("```");
  lines.push("");
  lines.push("## Stopping rule (written before the run)");
  lines.push("");
  lines.push("CONFIRM PRIMARY met and every HOLD met. R5 is a ship CANDIDATE. It does NOT ship in this pass. Report and stop for Ben's decision.");
  lines.push("KILL Any of the five shipped fixes returns to confirmed on >=2/3. Report and STOP. Do not write a second wording.");
  lines.push("PARTIAL PRIMARY missed with all HOLDs intact. Report the EA_E3 explanations in full and say what the model thought it was doing.");
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  lines.push(`**${stop.verdict}** — ${stop.reason}`);
  lines.push("");
  lines.push("## Prompt arms");
  lines.push("");
  lines.push("```");
  lines.push(`R3a (live / reference)  len=${promptMeta.R3a.length}  sha256=${promptMeta.R3a.sha256}`);
  lines.push(`R5  (harness only)      len=${promptMeta.R5.length}  sha256=${promptMeta.R5.sha256}`);
  lines.push("```");
  lines.push("");
  lines.push("CONFIRMED: hashes differ.");
  lines.push("R5 = R3a plus the mark-rule wording under Frame and period priority, immediately after the existing frame paragraph.");
  lines.push("Wording: proposed text unchanged (no refine). Spec said one sentence; the proposed block is two sentences forming one rung. Kept as written.");
  lines.push("");
  lines.push("```");
  lines.push(MARK_RULE_WORDING);
  lines.push("```");
  lines.push("");
  lines.push(`Cost: $${totalCost.toFixed(4)}. Cache OFF. Model ${stageModel.provider}/${stageModel.model}. seed=1.`);
  lines.push(`Unique statements: ${statements.length} (23 graded set; EA_E3 is already in the set).`);
  lines.push("EA_E3 source: scripts/diagnostic/eval-ablation/meridian_source.txt (eval-ablation Meridian E3; not claim-spans E3).");
  lines.push("");
  lines.push("## PRIMARY (EA_E3 off confirmed >=2/3)");
  lines.push("");
  lines.push("```");
  lines.push(
    `EA_E3  R3a ${fmtLabs(scoreR3a.primary.EA_E3.labels)}  R5 ${fmtLabs(scoreR5.primary.EA_E3.labels)}  R5_ok=${scoreR5.primary.EA_E3.ok}`
  );
  lines.push(`PRIMARY pass: ${scoreR5.primaryPass}`);
  lines.push("```");
  lines.push("");
  lines.push("## HOLD false greens off confirmed >=2/3");
  lines.push("");
  lines.push("```");
  for (const id of FALSE_GREEN_IDS) {
    const a = scoreR3a.falseGreens[id];
    const b = scoreR5.falseGreens[id];
    lines.push(`${id}  R3a ${fmtLabs(a.labels)}  R5 ${fmtLabs(b.labels)}  R5_ok=${b.ok}`);
  }
  lines.push(`falseGreenHold: ${scoreR5.falseGreenHold}`);
  lines.push("```");
  lines.push("");
  lines.push("## HOLD F19_S7 partially_confirmed >=2/3");
  lines.push("");
  lines.push("```");
  lines.push(
    `F19_S7  R3a ${fmtLabs(scoreR3a.f19Labels)}  R5 ${fmtLabs(scoreR5.f19Labels)}  R5_ok=${scoreR5.f19Hold}`
  );
  lines.push("```");
  lines.push("");
  lines.push("## HOLD independent controls vs R3a majority label");
  lines.push("");
  lines.push("```");
  if (scoreR5.independentBreaks.length === 0) {
    lines.push("No independent control breaks.");
  } else {
    for (const e of scoreR5.independentBreaks) {
      lines.push(
        `${e.id} plant=${e.plant} r3a=${shortClass(e.r3aMajority)} R5 ${fmtLabs(e.labels)} hold=false`
      );
    }
  }
  lines.push("```");
  lines.push("");
  lines.push("## PLANTED report (not scoreboard breaks)");
  lines.push("");
  lines.push("```");
  for (const e of scoreR5.plantedReport) {
    lines.push(
      `${e.id} plant=${e.plant} noise=${e.noiseFloor} r3a=${shortClass(e.r3aMajority)} R5 ${fmtLabs(e.labels)} hold=${e.hold}`
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## RECORD F92_S0 and EA_E1");
  lines.push("");
  lines.push("F92_S0 expected to stay confirmed on both arms. Say so.");
  lines.push("");
  lines.push("```");
  lines.push(`F92_S0  R3a ${fmtLabs(scoreR3a.f92Labels)}  R5 ${fmtLabs(scoreR5.f92Labels)}`);
  lines.push(`EA_E1   R3a ${fmtLabs(scoreR3a.eaE1Labels)}  R5 ${fmtLabs(scoreR5.eaE1Labels)}`);
  lines.push("```");
  lines.push("");
  lines.push("## EA_E3 explanations (R5), basis named unprompted?");
  lines.push("");
  lines.push("No instruction asked Stage 2 to name the basis. Reading whether it did anyway.");
  lines.push("");
  for (const r of eaE3R5Rows) {
    const hits = explanationNamesBasis(r.explanation);
    lines.push(`### R5 EA_E3 run ${r.runIndex + 1}: ${r.classification}`);
    lines.push("");
    lines.push("```");
    lines.push(String(r.explanation || "(none)"));
    lines.push("```");
    lines.push("");
    lines.push(
      hits.length
        ? `Basis-related words present unprompted: ${hits.join(", ")}.`
        : "No clear basis-related words found unprompted."
    );
    lines.push("");
  }
  lines.push("## Framing-on-implication check (THEN READ THE REASONING)");
  lines.push("");
  if (framingQuotes.length === 0) {
    lines.push("No R5 explanation on EA_E2 or EA_E3 applied the word framing to an implication.");
  } else {
    lines.push("Quoted hits:");
    for (const q of framingQuotes) {
      lines.push("");
      lines.push(`### ${q.id} run ${q.run}`);
      lines.push("");
      lines.push("```");
      lines.push(q.explanation);
      lines.push("```");
    }
  }
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
      .filter((r) => r.variantId === "R5" && r.statementId === st.id)
      .sort((x, y) => x.runIndex - y.runIndex)
      .map((r) => r.classification);
    lines.push(
      `${st.id.padEnd(8)} ${st.role.padEnd(14)} ${st.plant.padEnd(12)} R3a ${fmtLabs(a).padEnd(16)} R5 ${fmtLabs(b)}`
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  if (stop.verdict === "CONFIRM") {
    lines.push("Ship candidate. Do not ship in this pass. Wait for Ben.");
  } else if (stop.verdict === "KILL") {
    lines.push("Do not ship. Do not write a second wording. R3a stands.");
  } else {
    lines.push("PARTIAL. See EA_E3 explanations above for what the model thought it was doing.");
  }

  const reportPath = path.join(OUT_DIR, "r5-mark-rule.md");
  const rowsPath = path.join(OUT_DIR, "r5-mark-rule-rows.json");
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
  await writeFile(
    rowsPath,
    `${JSON.stringify(
      {
        meta: {
          probe: "stage2-r5-mark-rule",
          model: `${stageModel.provider}/${stageModel.model}`,
          cache: "off",
          temperature: 0,
          seed: STAGE2_SEED,
          concurrency: CONCURRENCY,
          promptMeta,
          markRuleWording: MARK_RULE_WORDING,
          placement: "Frame and period priority after existing frame paragraph",
          totalCostUsd: totalCost,
          statementCount: statements.length,
          callCount: results.length,
          stoppingVerdict: stop,
          ranAt: new Date().toISOString(),
        },
        scoreR3a,
        scoreR5,
        r3aMajorityById,
        rows: results,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log("");
  console.log(`Verdict: ${stop.verdict} — ${stop.reason}`);
  console.log(`Wrote ${reportPath}`);
  console.log(`Wrote ${rowsPath}`);
}

main().catch((err) => {
  console.error("[r5-mark-rule] fatal:", err?.message || err);
  process.exit(1);
});
