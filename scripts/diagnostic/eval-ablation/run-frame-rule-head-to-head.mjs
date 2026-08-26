#!/usr/bin/env node
/**
 * Frame rule head-to-head: R3a (specific) vs R3b (principled).
 * Each arm is measured R3 with only the Frame and period priority block swapped.
 * Live stage2_v4.md untouched. Cache OFF.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-frame-rule-head-to-head.mjs
 *
 * Expected cost: ~$2.40. Ceiling under $4.00.
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
const R3_PATH = path.join(__dirname, "rewrite-ladder-r3-prompt.txt");
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
const EXPECTED_R3 = {
  length: 12540,
  sha256: "071c3ef29af1ca31ef5479cba86281afdb34e15cea4715c2bef7a27ff7adf9ba",
};

/** Measured R3 first-run frame block (the one being replaced). */
const FRAME_BLOCK_R3 = `Frame and period priority
Judge the period, vintage, duration or frame of a statement before judging its figures or its evaluative wording. If the statement attaches a period, vintage, duration or frame the source does not support, the statement is partially_confirmed even when every figure matches and even when every other clause would otherwise confirm.`;

/** R3a: specific wording from rewrite-ladder PARTIAL fix, verbatim. */
const FRAME_BLOCK_R3A = `Frame and period priority
Judge the period, vintage, duration or frame of a statement before judging its figures or its evaluative wording. A duration, tenure, hold length, or partnership length that the source states differently, or does not state, is enough on its own: classify partially_confirmed even when the rest of the statement matches, including when the duration sits in an otherwise matching opener. If the statement attaches a period, vintage, duration or frame the source does not support, the statement is partially_confirmed even when every figure matches and even when every other clause would otherwise confirm.`;

/** R3b: de-enumerated time-claim test. Spec wording, unchanged. */
const FRAME_BLOCK_R3B = `Frame and period priority
Judge every time claim in the statement before judging its figures or its wording. A time claim is anything the statement asserts about when something happened or how long it lasted. If the source does not state that same time claim, or states a different one, the statement is partially_confirmed however well the rest of the statement matches.`;

const FALSE_GREEN_IDS = ["EA_E2", "CS_E3", "F01_S10", "F04_S20", "F12_S0"];
const NOISE_FLOOR_IDS = new Set(["F12_S0", "F08_S2"]);

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function swapFrameBlock(r3Text, newBlock, label) {
  if (!r3Text.includes(FRAME_BLOCK_R3)) {
    throw new Error(`${label}: measured R3 frame block not found`);
  }
  const out = r3Text.replace(FRAME_BLOCK_R3, newBlock);
  if (out === r3Text) throw new Error(`${label}: replace was a no-op`);
  if (out.includes(FRAME_BLOCK_R3)) throw new Error(`${label}: old frame block still present`);
  if ((out.split(newBlock).length - 1) !== 1) {
    throw new Error(`${label}: new block must appear exactly once`);
  }
  // Rest of prompt must be byte-identical aside from the swapped block.
  if (out.replace(newBlock, FRAME_BLOCK_R3) !== r3Text) {
    throw new Error(`${label}: rest of prompt is not byte-identical to R3`);
  }
  return out.trim();
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
    traceName: "diag-eval-ablation-frame-h2h",
    spanName: "stage2-frame-rule-h2h",
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

function shortClass(c) {
  if (c === "confirmed") return "conf";
  if (c === "partially_confirmed") return "part";
  if (c === "conflicting") return "confl";
  if (c === "no_support") return "nosup";
  return String(c || "?");
}

function holdsLabel(rows, label, minOf = 2) {
  return rows.filter((r) => r.classification === label).length >= minOf;
}

function offConfirmed(rows, minOf = 2) {
  return rows.filter((r) => r.classification && r.classification !== "confirmed").length >= minOf;
}

function correctCount(labels, correctLabel) {
  return labels.filter((c) => c === correctLabel).length;
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
      note: "expected to stay confirmed; no mark rule",
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
  ];
}

function scoreArm(rows, statements, vid, aLabelsById) {
  const armRows = (id) => rows.filter((r) => r.variantId === vid && r.statementId === id);

  const primary = {};
  let primaryPass = true;
  let fixed = 0;
  for (const id of FALSE_GREEN_IDS) {
    const rs = armRows(id);
    const labels = rs.map((r) => r.classification);
    const ok = offConfirmed(rs, 2);
    primary[id] = { ok, labels };
    if (ok) fixed++;
    else primaryPass = false;
  }

  const f19 = armRows("F19_S7");
  const f19Pass = holdsLabel(f19, "partially_confirmed", 2);

  const independentBreaks = [];
  const plantedReport = [];
  for (const st of statements) {
    if (st.role !== "control") continue;
    const rs = armRows(st.id);
    const aLabs = aLabelsById[st.id];
    const stableOnA = new Set(aLabs).size === 1;
    const hold = holdsLabel(rs, st.baselineLabel, 2);
    const entry = {
      id: st.id,
      plant: st.plant,
      baselineLabel: st.baselineLabel,
      aLabels: aLabs,
      labels: rs.map((r) => r.classification),
      stableOnA,
      hold,
    };
    if (st.plant === "PLANTED" || NOISE_FLOOR_IDS.has(st.id)) {
      plantedReport.push(entry);
      continue;
    }
    if (st.id === "F19_S7") continue;
    if (stableOnA && !hold) independentBreaks.push(entry);
  }

  const f12 = armRows("F12_S0");
  const f12Labels = f12.map((r) => r.classification);
  const aF12 = aLabelsById.F12_S0;
  const aCorrect = correctCount(aF12, "partially_confirmed");
  const armCorrect = correctCount(f12Labels, "partially_confirmed");
  const noRegression = armCorrect >= aCorrect;
  const worseThanA = armCorrect < aCorrect;

  const eaE3 = armRows("EA_E3").map((r) => r.classification);

  const controlIndepPass = independentBreaks.length === 0;
  let broken = 0;
  if (!f19Pass) broken++;
  broken += independentBreaks.length;

  return {
    primary,
    primaryPass,
    f19Pass,
    f19Labels: f19.map((r) => r.classification),
    independentBreaks,
    plantedReport,
    f12Labels,
    aF12Labels: aF12,
    aCorrect,
    armCorrect,
    noRegression,
    worseThanA,
    eaE3Labels: eaE3,
    fixed,
    broken,
    net: fixed - broken,
    controlIndepPass,
  };
}

function stoppingVerdict(scoreA, scoreB) {
  const confA = scoreA.primaryPass && scoreA.f19Pass && scoreA.controlIndepPass;
  const confB = scoreB.primaryPass && scoreB.f19Pass && scoreB.controlIndepPass;
  if (confA || confB) {
    return { verdict: "CONFIRM", confA, confB };
  }

  const accept = (s) =>
    !s.primary.F12_S0.ok &&
    s.noRegression &&
    s.f19Pass &&
    s.controlIndepPass &&
    s.primary.EA_E2.ok &&
    s.primary.CS_E3.ok &&
    s.primary.F01_S10.ok &&
    s.primary.F04_S20.ok;

  const accA = accept(scoreA);
  const accB = accept(scoreB);
  if (accA || accB) {
    return { verdict: "ACCEPT", accA, accB };
  }

  if (scoreA.worseThanA && scoreB.worseThanA) {
    return { verdict: "KILL" };
  }

  // Neither CONFIRM nor ACCEPT nor both-worse KILL: still report as KILL-ish
  // only when both worse; otherwise PARTIAL-like ACCEPT failure.
  return { verdict: "ACCEPT_FAIL", accA, accB, worseA: scoreA.worseThanA, worseB: scoreB.worseThanA };
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const baseline = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const r3 = (await readFile(R3_PATH, "utf8")).trim();
  if (sha256(baseline) !== EXPECTED_A.sha256 || baseline.length !== EXPECTED_A.length) {
    throw new Error("Arm A hash/length mismatch");
  }
  if (sha256(r3) !== EXPECTED_R3.sha256 || r3.length !== EXPECTED_R3.length) {
    throw new Error("Measured R3 hash/length mismatch");
  }

  const r3a = swapFrameBlock(r3, FRAME_BLOCK_R3A, "R3a");
  const r3b = swapFrameBlock(r3, FRAME_BLOCK_R3B, "R3b");
  const variants = { A: baseline, R3: r3, R3a: r3a, R3b: r3b };
  const promptMeta = {};
  for (const id of Object.keys(variants)) {
    promptMeta[id] = { length: variants[id].length, sha256: sha256(variants[id]) };
  }
  const hashes = ["A", "R3", "R3a", "R3b"].map((id) => promptMeta[id].sha256);
  if (new Set(hashes).size !== 4) throw new Error("Arm hashes collide");

  console.log("Stage 2 frame rule head-to-head: R3a vs R3b");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log("Refinements: none; R3a and R3b wording used verbatim from the spec/report.");
  console.log("");
  console.log("ARM HASHES AND LENGTHS");
  for (const id of ["A", "R3", "R3a", "R3b"]) {
    console.log(`${id}  len=${promptMeta[id].length}  sha256=${promptMeta[id].sha256}`);
  }
  console.log("");

  const statements = await buildStatements();
  if (statements.length !== 23) throw new Error(`Expected 23, got ${statements.length}`);

  const rows = [];
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;

  async function runArm(vid) {
    console.log(`ARM ${vid} x3`);
    for (let run = 1; run <= 3; run++) {
      for (const st of statements) {
        process.stdout.write(`  ${st.id} ${vid} r${run} ... `);
        const result = await matchOnce({
          systemPrompt: variants[vid],
          statement: st.statement,
          sourceText: st.sourceText,
          variantId: vid,
          statementId: st.id,
          runIndex: run,
        });
        totalCost += result.costUsd;
        totalIn += result.usage.inputTokens;
        totalOut += result.usage.outputTokens;
        rows.push({
          statementId: st.id,
          role: st.role,
          plant: st.plant,
          adjudication: st.adjudication,
          baselineLabel: st.baselineLabel,
          correctLabel: st.correctLabel,
          variantId: vid,
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
    }
    console.log("");
  }

  await runArm("A");

  // Drift notes only; no stop on UNADJUDICATED.
  const aNotes = [];
  for (const st of statements) {
    const aRs = rows.filter((r) => r.variantId === "A" && r.statementId === st.id);
    const labels = aRs.map((r) => r.classification);
    const majorityBaseline = holdsLabel(aRs, st.baselineLabel, 2);
    if (!majorityBaseline) {
      aNotes.push({
        id: st.id,
        labels,
        expectedBaseline: st.baselineLabel,
        adjudication: st.adjudication,
        note: NOISE_FLOOR_IDS.has(st.id)
          ? "noise-floor; continue"
          : st.adjudication === "UNADJUDICATED" || st.adjudication === "RECORDED_ONLY"
            ? "UNADJUDICATED/recorded drift; continue"
            : "adjudicated false-green or soft cell; continue",
      });
    }
  }
  console.log("A DRIFT NOTES");
  for (const n of aNotes) console.log(`  ${JSON.stringify(n)}`);
  console.log("");

  await runArm("R3a");
  await runArm("R3b");

  const aLabelsById = {};
  for (const st of statements) {
    aLabelsById[st.id] = rows
      .filter((r) => r.variantId === "A" && r.statementId === st.id)
      .map((r) => r.classification);
  }

  const scoreR3a = scoreArm(rows, statements, "R3a", aLabelsById);
  const scoreR3b = scoreArm(rows, statements, "R3b", aLabelsById);
  const stop = stoppingVerdict(scoreR3a, scoreR3b);

  let winner = null;
  let winnerReason = null;
  if (stop.verdict === "CONFIRM") {
    if (stop.confA && stop.confB) {
      winner = promptMeta.R3a.length <= promptMeta.R3b.length ? "R3a" : "R3b";
      winnerReason = `both CONFIRM; took shorter (${winner} len=${promptMeta[winner].length})`;
    } else {
      winner = stop.confA ? "R3a" : "R3b";
      winnerReason = `${winner} alone meets CONFIRM`;
    }
  } else if (stop.verdict === "ACCEPT") {
    if (stop.accA && stop.accB) {
      winner = promptMeta.R3a.length <= promptMeta.R3b.length ? "R3a" : "R3b";
      winnerReason = `both ACCEPT; took shorter (${winner})`;
    } else {
      winner = stop.accA ? "R3a" : "R3b";
      winnerReason = `${winner} alone meets ACCEPT (four fixes, no F12 regression)`;
    }
  }

  const matrix = {};
  for (const st of statements) {
    matrix[st.id] = {};
    for (const vid of ["A", "R3a", "R3b"]) {
      const rs = rows.filter((r) => r.variantId === vid && r.statementId === st.id);
      matrix[st.id][vid] = {
        labels: rs.map((r) => r.classification),
        explanations: rs.map((r) => r.explanation),
      };
    }
  }

  console.log("SCORE R3a");
  console.log(
    `  fixed=${scoreR3a.fixed} broken=${scoreR3a.broken} net=${scoreR3a.net} primary=${scoreR3a.primaryPass} f19=${scoreR3a.f19Pass} noReg=${scoreR3a.noRegression} worse=${scoreR3a.worseThanA}`
  );
  console.log(
    `  F12 A=${scoreR3a.aF12Labels.map(shortClass).join("/")} R3a=${scoreR3a.f12Labels.map(shortClass).join("/")} correct ${scoreR3a.armCorrect} vs A ${scoreR3a.aCorrect}`
  );
  console.log("SCORE R3b");
  console.log(
    `  fixed=${scoreR3b.fixed} broken=${scoreR3b.broken} net=${scoreR3b.net} primary=${scoreR3b.primaryPass} f19=${scoreR3b.f19Pass} noReg=${scoreR3b.noRegression} worse=${scoreR3b.worseThanA}`
  );
  console.log(
    `  F12 A=${scoreR3b.aF12Labels.map(shortClass).join("/")} R3b=${scoreR3b.f12Labels.map(shortClass).join("/")} correct ${scoreR3b.armCorrect} vs A ${scoreR3b.aCorrect}`
  );
  console.log(`EA_E3 R3a=${scoreR3a.eaE3Labels.map(shortClass).join("/")} R3b=${scoreR3b.eaE3Labels.map(shortClass).join("/")} (expected conf)`);
  console.log(`STOPPING VERDICT: ${stop.verdict}`);
  console.log(`WINNER: ${winner || "none"}  ${winnerReason || ""}`);
  console.log(`Measured cost: $${totalCost.toFixed(6)}`);

  await mkdir(OUT_DIR, { recursive: true });
  let winningArmPath = null;
  if (winner) {
    winningArmPath = path.join(OUT_DIR, `frame-rule-winner-${winner.toLowerCase()}.txt`);
    await writeFile(winningArmPath, variants[winner] + "\n");
    console.log(`Wrote winning arm ${winningArmPath}`);
  }

  const outPath = path.join(OUT_DIR, "frame-rule-head-to-head-rows.json");
  await writeFile(
    outPath,
    JSON.stringify(
      {
        meta: {
          probe: "stage2-frame-rule-head-to-head",
          model: `${stageModel.provider}/${stageModel.model}`,
          cache: "off",
          temperature: 0,
          seed: STAGE2_SEED,
          baseR3Path: "scripts/diagnostic/eval-ablation/rewrite-ladder-r3-prompt.txt",
          frameBlocks: {
            R3: FRAME_BLOCK_R3,
            R3a: FRAME_BLOCK_R3A,
            R3b: FRAME_BLOCK_R3B,
          },
          refinements: "none",
          totalCalls: rows.length,
          totalCostUsd: totalCost,
          totalInputTokens: totalIn,
          totalOutputTokens: totalOut,
          ranAt: new Date().toISOString(),
          promptMeta,
        },
        scoreboard: {
          R3a: { fixed: scoreR3a.fixed, broken: scoreR3a.broken, net: scoreR3a.net },
          R3b: { fixed: scoreR3b.fixed, broken: scoreR3b.broken, net: scoreR3b.net },
        },
        scoreR3a,
        scoreR3b,
        stopping: stop,
        winner,
        winnerReason,
        winningArmPath: winningArmPath
          ? path.relative(REPO_ROOT, winningArmPath)
          : null,
        aNotes,
        matrix,
        arms: { R3a: r3a, R3b: r3b },
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
