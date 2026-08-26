#!/usr/bin/env node
/**
 * Measure R7 (four-site basis amendment) and R8 (R7 minus example 3c)
 * against shipped R3a. Stage 2 only. Cache OFF. Live stage2_v4.md is NOT edited.
 *
 * Measurement set: 23-statement graded set + EA_E3 (already in set) + F93_S0/S1.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-r7-r8-basis-ladder.mjs
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
const R3A_PATH = path.join(__dirname, "frame-rule-winner-r3a.txt");
const R7_PATH = path.join(__dirname, "basis-ladder-r7.txt");
const R8_PATH = path.join(__dirname, "basis-ladder-r8.txt");
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const F93_SOURCE_PATH = path.join(DIAG_ROOT, "sources/93_adversarial_realised_vs_mark.txt");
const CS_E3_SOURCE_PATH = path.join(
  DIAG_ROOT,
  "claim-spans/evaluative-accident/source_ic_memo.txt"
);
const STAGE2_SEED = 1;
const CONCURRENCY = 6;
const HARD_STOP_USD = 4.0;

const EXPECTED_R3A = {
  length: 12812,
  sha256: "bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c",
};

const FALSE_GREEN_IDS = ["EA_E2", "CS_E3", "F01_S10", "F04_S20", "F12_S0"];
const NOISE_FLOOR_IDS = new Set(["F12_S0", "F08_S2"]);
/** Independent controls that HOLD against R3a majority. F92_S0 is on this list for R7/R8. */
const INDEPENDENT_HOLD_IDS = new Set(["F18_S6", "F90_S0", "F92_S0"]);

const WORDING_NOTES = {
  L23:
    'like-for-like includes "same basis"; paraphrase does not cover returned/realised/distributed vs marked at/valued at/carried at/unrealised',
  L25:
    "frame/period-role mismatch list gains returned, realised or distributed versus marked at, valued at, carried at or unrealised",
  L31:
    "paraphrase carve-out does not apply where statement uses returned/realised/distributed and source uses marked at/valued at/carried at/unrealised for the same figure",
  EXAMPLE_3D: `3d) Realised versus mark -> partially_confirmed
Statement: 'Fund IV has returned 1.9 times gross MOIC.'
Source: 'Fund IV is currently marked at 1.9 times gross MOIC.'
Correct classification: partially_confirmed
Reasoning: The figure matches. The statement presents it as returned; the source presents it as a current mark. That is a basis mismatch, not paraphrase.`,
};

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
    traceName: "diag-eval-ablation-r7-r8-basis",
    spanName: "stage2-r7-r8-basis",
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

function onConfirmed(labels, min = 2) {
  return labels.filter((l) => l === "confirmed").length >= min;
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
      id: "F93_S0",
      role: "primary",
      plant: "PLANTED",
      adjudication: "PRIMARY_FIXTURE_MARK_SWAP",
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: f93Source,
      sourceFile: "scripts/diagnostic/sources/93_adversarial_realised_vs_mark.txt",
    },
    {
      id: "F93_S1",
      role: "fixture_control",
      plant: "PLANTED",
      adjudication: "CONTROL_FIXTURE_HONEST_MARK",
      statement: "Fund IV is currently marked at 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: f93Source,
      sourceFile: "scripts/diagnostic/sources/93_adversarial_realised_vs_mark.txt",
    },
    {
      id: "EA_E1",
      role: "recorded_only",
      plant: "INDEPENDENT",
      adjudication: "RECORDED_RANKING_SHAPE",
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
      adjudication: "INDEPENDENT_HOLD",
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
      adjudication: "INDEPENDENT_HOLD",
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
      adjudication: "INDEPENDENT_HOLD",
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

  const eaE3Labs = armRows("EA_E3").map((r) => r.classification);
  const f93S0Labs = armRows("F93_S0").map((r) => r.classification);
  const f93S1Labs = armRows("F93_S1").map((r) => r.classification);

  const primaryEaE3 = offConfirmed(eaE3Labs, 2);
  const primaryF93 = offConfirmed(f93S0Labs, 2);
  const fixtureControlOk = onConfirmed(f93S1Labs, 2);
  const primaryPass = primaryEaE3 && primaryF93;

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
    if (INDEPENDENT_HOLD_IDS.has(st.id) && !hold) {
      independentBreaks.push(entry);
    }
  }

  return {
    primaryEaE3: { labels: eaE3Labs, ok: primaryEaE3 },
    primaryF93: { labels: f93S0Labs, ok: primaryF93 },
    fixtureControl: { labels: f93S1Labs, ok: fixtureControlOk },
    primaryPass,
    falseGreens,
    falseGreenHold,
    f19Hold,
    f19Labels: f19Labs,
    independentBreaks,
    plantedReport,
    f92Labels: armRows("F92_S0").map((r) => r.classification),
    f04S13Labels: armRows("F04_S13").map((r) => r.classification),
    eaE1Labels: armRows("EA_E1").map((r) => r.classification),
  };
}

function stoppingVerdict(score) {
  // Written before the run.
  // CONFIRM: both PRIMARYs, fixture CONTROL, every HOLD.
  // KILL: five shipped fixes back on confirmed, OR fixture control breaks.
  // PARTIAL: primary missed with all HOLDs intact.
  const killFg = Object.entries(score.falseGreens).filter(([, v]) => !v.ok);
  if (killFg.length) {
    return {
      verdict: "KILL",
      reason: `False green(s) back on confirmed >=2/3: ${killFg.map(([id]) => id).join(", ")}`,
    };
  }
  if (!score.fixtureControl.ok) {
    return {
      verdict: "KILL",
      reason: `Fixture control F93_S1 broke (overreach): ${fmtLabs(score.fixtureControl.labels)}`,
    };
  }
  const holdsOk =
    score.falseGreenHold && score.f19Hold && score.independentBreaks.length === 0;
  if (score.primaryPass && holdsOk && score.fixtureControl.ok) {
    return {
      verdict: "CONFIRM",
      reason:
        "Both PRIMARYs, fixture CONTROL, and every HOLD met. Ship CANDIDATE. Does not ship in this pass.",
    };
  }
  if (!score.primaryPass && holdsOk) {
    return {
      verdict: "PARTIAL",
      reason: `PRIMARY missed; HOLDs intact. EA_E3_ok=${score.primaryEaE3.ok} F93_S0_ok=${score.primaryF93.ok}`,
    };
  }
  if (score.primaryPass && !holdsOk) {
    return {
      verdict: "PARTIAL",
      reason: `PRIMARY met but HOLD break(s): indep=${
        score.independentBreaks.map((e) => e.id).join(",") || "none"
      }; F19=${score.f19Hold}`,
    };
  }
  return {
    verdict: "PARTIAL",
    reason: `PRIMARY missed and HOLD(s) failed. F19=${score.f19Hold} indepBreaks=${
      score.independentBreaks.map((e) => e.id).join(",") || "none"
    }`,
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
    "distributed",
    "basis",
  ]) {
    if (t.includes(phrase)) hits.push(phrase);
  }
  return hits;
}

function scoreboardRow(name, score, verdict) {
  const bothPrimary = score.primaryEaE3.ok && score.primaryF93.ok;
  return `${name.padEnd(4)} ${bothPrimary ? "yes" : "no "}              ${
    score.fixtureControl.ok ? "yes" : "no "
  }         ${score.falseGreenHold ? "yes" : "no "}         ${score.f19Hold ? "yes" : "no "}      ${
    score.independentBreaks.length === 0 ? "yes" : "no "
  }         ${verdict}`;
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const live = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const r3aFile = (await readFile(R3A_PATH, "utf8")).trim();
  const r7 = (await readFile(R7_PATH, "utf8")).trim();
  const r8 = (await readFile(R8_PATH, "utf8")).trim();

  if (sha256(live) !== EXPECTED_R3A.sha256 || live.length !== EXPECTED_R3A.length) {
    throw new Error(
      `Live stage2_v4.md must be shipped R3a. got len=${live.length} sha=${sha256(live)}`
    );
  }
  if (sha256(r3aFile) !== EXPECTED_R3A.sha256 || r3aFile.length !== EXPECTED_R3A.length) {
    throw new Error("frame-rule-winner-r3a.txt hash/length mismatch");
  }
  if (!r7.includes("same basis")) {
    throw new Error("R7 missing L23 same-basis amendment");
  }
  if (!r7.includes("That carve-out does not apply")) {
    throw new Error("R7 missing L31 carve-out amendment");
  }
  if (!r7.includes("3d) Realised versus mark")) {
    throw new Error("R7 missing example 3d");
  }
  if (!r7.includes("3c) Ranking is a checkable claim")) {
    throw new Error("R7 must still contain example 3c");
  }
  if (r8.includes("3c) Ranking is a checkable claim")) {
    throw new Error("R8 must remove example 3c");
  }
  if (!r8.includes("3d) Realised versus mark")) {
    throw new Error("R8 missing example 3d");
  }
  if (sha256(r7) === sha256(live) || sha256(r8) === sha256(live) || sha256(r7) === sha256(r8)) {
    throw new Error("R3a / R7 / R8 hashes must all differ");
  }

  const variants = { R3a: live, R7: r7, R8: r8 };
  const promptMeta = {};
  for (const [id, text] of Object.entries(variants)) {
    promptMeta[id] = { length: text.length, sha256: sha256(text) };
  }

  const statements = await buildStatements();
  if (statements.length !== 25) {
    throw new Error(`Expected 25 statements (23 + F93_S0 + F93_S1), got ${statements.length}`);
  }

  const projectedCalls = statements.length * 3 * 3;
  const projectedCost = projectedCalls * 0.013;
  console.log("R7/R8 basis ladder vs shipped R3a");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log(`R3a len=${promptMeta.R3a.length} sha256=${promptMeta.R3a.sha256}`);
  console.log(`R7  len=${promptMeta.R7.length} sha256=${promptMeta.R7.sha256}`);
  console.log(`R8  len=${promptMeta.R8.length} sha256=${promptMeta.R8.sha256}`);
  console.log(`Statements: ${statements.length} (23 graded + F93_S0 + F93_S1)`);
  console.log(
    `Expected cost ~$${projectedCost.toFixed(2)} for ${projectedCalls} calls. Under $${HARD_STOP_USD}.`
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
    process.stdout.write(
      `  ${job.variantId} ${job.st.id} r${job.runIndex + 1} ${shortClass(out.classification)}\n`
    );
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
  if (totalCost > HARD_STOP_USD) {
    console.warn(`WARNING: cost $${totalCost} exceeded hard stop $${HARD_STOP_USD}; reporting first result anyway.`);
  }

  const r3aMajorityById = {};
  for (const st of statements) {
    const labs = results
      .filter((r) => r.variantId === "R3a" && r.statementId === st.id)
      .sort((a, b) => a.runIndex - b.runIndex)
      .map((r) => r.classification);
    r3aMajorityById[st.id] = majorityLabel(labs);
  }

  const scoreR3a = scoreArm(statements, results, "R3a", r3aMajorityById);
  const scoreR7 = scoreArm(statements, results, "R7", r3aMajorityById);
  const scoreR8 = scoreArm(statements, results, "R8", r3aMajorityById);
  const stopR7 = stoppingVerdict(scoreR7);
  const stopR8 = stoppingVerdict(scoreR8);

  const lines = [];
  lines.push("# R7 / R8 basis ladder");
  lines.push("");
  lines.push("Harness only. Live `stage2_v4.md` was not edited in this pass.");
  lines.push("Part 1 fixture: `93_adversarial_realised_vs_mark` (Halden Group).");
  lines.push("");
  lines.push("## Scoreboard");
  lines.push("");
  lines.push("```");
  lines.push(
    "arm  both PRIMARYs  F93_S1 ctrl  five holds  F19 hold  indep holds  verdict"
  );
  lines.push(scoreboardRow("R3a", scoreR3a, "reference"));
  lines.push(scoreboardRow("R7", scoreR7, stopR7.verdict));
  lines.push(scoreboardRow("R8", scoreR8, stopR8.verdict));
  lines.push("```");
  lines.push("");
  lines.push("## Stopping rule (written before the run)");
  lines.push("");
  lines.push(
    "CONFIRM An arm meets both PRIMARYs, the fixture CONTROL, and every HOLD. If both qualify, recommend one. Neither ships in this pass."
  );
  lines.push(
    "KILL Any of the five shipped fixes returns to confirmed on >=2/3, or the fixture control breaks (overreach). Report, STOP, quote the reasoning. Do not write a third wording."
  );
  lines.push(
    "PARTIAL A primary missed with all HOLDs intact. Quote the EA_E3 explanations in full. If it again names the basis and confirms anyway, the next move is the code backstop, not more prose."
  );
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  lines.push(`R7: **${stopR7.verdict}** - ${stopR7.reason}`);
  lines.push(`R8: **${stopR8.verdict}** - ${stopR8.reason}`);
  lines.push("");
  lines.push("## Prompt arms");
  lines.push("");
  lines.push("```");
  lines.push(`R3a (live / reference)  len=${promptMeta.R3a.length}  sha256=${promptMeta.R3a.sha256}`);
  lines.push(`R7  (harness only)      len=${promptMeta.R7.length}  sha256=${promptMeta.R7.sha256}`);
  lines.push(`R8  (harness only)      len=${promptMeta.R8.length}  sha256=${promptMeta.R8.sha256}`);
  lines.push("```");
  lines.push("");
  lines.push("CONFIRMED: all three hashes differ.");
  lines.push("");
  lines.push("### R7 wording (verbatim four-site amendment)");
  lines.push("");
  lines.push("Chosen verbs: returned, realised, distributed against marked at, valued at, carried at, unrealised.");
  lines.push("Why: R5 lost by staying abstract; R3a beat R3b by naming duration/tenure; live exhibit is returned vs marked at.");
  lines.push("Distributed is included because it is a realised-cash cousin in PE copy; valued at / carried at cover mark synonyms.");
  lines.push("L27 modality list untouched.");
  lines.push("No fifth abstract Frame sentence.");
  lines.push("");
  lines.push("L23 amendment intent:");
  lines.push("```");
  lines.push(WORDING_NOTES.L23);
  lines.push("```");
  lines.push("");
  lines.push("L25 amendment intent:");
  lines.push("```");
  lines.push(WORDING_NOTES.L25);
  lines.push("```");
  lines.push("");
  lines.push("L31 amendment intent:");
  lines.push("```");
  lines.push(WORDING_NOTES.L31);
  lines.push("```");
  lines.push("");
  lines.push("Example 3d (added):");
  lines.push("```");
  lines.push(WORDING_NOTES.EXAMPLE_3D);
  lines.push("```");
  lines.push("");
  lines.push("R8 = R7 with example 3c removed only.");
  lines.push("");
  lines.push(
    `Cost: $${totalCost.toFixed(4)}. Cache OFF. Model ${stageModel.provider}/${stageModel.model}. seed=1.`
  );
  lines.push(
    `Unique statements: ${statements.length} (23 graded set including eval-ablation EA_E3, plus F93_S0 and F93_S1).`
  );
  lines.push(
    "EA_E3 source: scripts/diagnostic/eval-ablation/meridian_source.txt (eval-ablation Meridian; not claim-spans CS_E3; not corpus E3:S0:ic_memo)."
  );
  lines.push(
    "F93 source: scripts/diagnostic/sources/93_adversarial_realised_vs_mark.txt (Halden Group invented)."
  );
  lines.push("");
  lines.push("## PRIMARY EA_E3 off confirmed >=2/3");
  lines.push("");
  lines.push("```");
  lines.push(
    `EA_E3  R3a ${fmtLabs(scoreR3a.primaryEaE3.labels)}  R7 ${fmtLabs(scoreR7.primaryEaE3.labels)} ok=${scoreR7.primaryEaE3.ok}  R8 ${fmtLabs(scoreR8.primaryEaE3.labels)} ok=${scoreR8.primaryEaE3.ok}`
  );
  lines.push("```");
  lines.push("");
  lines.push("## PRIMARY F93_S0 mark-swap off confirmed >=2/3");
  lines.push("");
  lines.push("```");
  lines.push(
    `F93_S0  R3a ${fmtLabs(scoreR3a.primaryF93.labels)}  R7 ${fmtLabs(scoreR7.primaryF93.labels)} ok=${scoreR7.primaryF93.ok}  R8 ${fmtLabs(scoreR8.primaryF93.labels)} ok=${scoreR8.primaryF93.ok}`
  );
  lines.push("```");
  lines.push("");
  lines.push("## CONTROL F93_S1 honest mark stays confirmed >=2/3");
  lines.push("");
  lines.push("```");
  lines.push(
    `F93_S1  R3a ${fmtLabs(scoreR3a.fixtureControl.labels)}  R7 ${fmtLabs(scoreR7.fixtureControl.labels)} ok=${scoreR7.fixtureControl.ok}  R8 ${fmtLabs(scoreR8.fixtureControl.labels)} ok=${scoreR8.fixtureControl.ok}`
  );
  lines.push("```");
  lines.push("");
  lines.push("## HOLD false greens off confirmed >=2/3");
  lines.push("");
  lines.push("```");
  for (const id of FALSE_GREEN_IDS) {
    lines.push(
      `${id}  R3a ${fmtLabs(scoreR3a.falseGreens[id].labels)}  R7 ${fmtLabs(scoreR7.falseGreens[id].labels)} ok=${scoreR7.falseGreens[id].ok}  R8 ${fmtLabs(scoreR8.falseGreens[id].labels)} ok=${scoreR8.falseGreens[id].ok}`
    );
  }
  lines.push(`falseGreenHold R7=${scoreR7.falseGreenHold} R8=${scoreR8.falseGreenHold}`);
  lines.push("```");
  lines.push("");
  lines.push("## HOLD F19_S7 partially_confirmed >=2/3");
  lines.push("");
  lines.push("```");
  lines.push(
    `F19_S7  R3a ${fmtLabs(scoreR3a.f19Labels)}  R7 ${fmtLabs(scoreR7.f19Labels)} ok=${scoreR7.f19Hold}  R8 ${fmtLabs(scoreR8.f19Labels)} ok=${scoreR8.f19Hold}`
  );
  lines.push("```");
  lines.push("");
  lines.push("## HOLD independent controls vs R3a majority (includes F92_S0)");
  lines.push("");
  lines.push("```");
  for (const id of [...INDEPENDENT_HOLD_IDS].sort()) {
    const a = armRowsOf(results, "R3a", id).map((r) => r.classification);
    const b = armRowsOf(results, "R7", id).map((r) => r.classification);
    const c = armRowsOf(results, "R8", id).map((r) => r.classification);
    const target = r3aMajorityById[id];
    lines.push(
      `${id}  r3aMaj=${shortClass(target)}  R3a ${fmtLabs(a)}  R7 ${fmtLabs(b)} hold=${holdsLabel(b, target, 2)}  R8 ${fmtLabs(c)} hold=${holdsLabel(c, target, 2)}`
    );
  }
  if (scoreR7.independentBreaks.length === 0) {
    lines.push("R7 independent breaks: none");
  } else {
    for (const e of scoreR7.independentBreaks) {
      lines.push(`R7 BREAK ${e.id} r3a=${shortClass(e.r3aMajority)} ${fmtLabs(e.labels)}`);
    }
  }
  if (scoreR8.independentBreaks.length === 0) {
    lines.push("R8 independent breaks: none");
  } else {
    for (const e of scoreR8.independentBreaks) {
      lines.push(`R8 BREAK ${e.id} r3a=${shortClass(e.r3aMajority)} ${fmtLabs(e.labels)}`);
    }
  }
  lines.push("```");
  lines.push("");
  lines.push("## PLANTED report (not scoreboard breaks); F04_S13 explicit");
  lines.push("");
  lines.push("```");
  lines.push(
    `F04_S13  R3a ${fmtLabs(scoreR3a.f04S13Labels)}  R7 ${fmtLabs(scoreR7.f04S13Labels)}  R8 ${fmtLabs(scoreR8.f04S13Labels)}`
  );
  for (const e of scoreR7.plantedReport) {
    const r8Entry = scoreR8.plantedReport.find((x) => x.id === e.id);
    lines.push(
      `${e.id} plant=${e.plant} noise=${e.noiseFloor} r3a=${shortClass(e.r3aMajority)} R7 ${fmtLabs(e.labels)} hold=${e.hold} R8 ${fmtLabs(r8Entry?.labels || [])} hold=${r8Entry?.hold}`
    );
  }
  lines.push("```");
  lines.push("");
  lines.push("## R8 only: ranking shape (EA_E1) after removing example 3c");
  lines.push("");
  lines.push("```");
  lines.push(
    `EA_E1  R3a ${fmtLabs(scoreR3a.eaE1Labels)}  R7 ${fmtLabs(scoreR7.eaE1Labels)}  R8 ${fmtLabs(scoreR8.eaE1Labels)}`
  );
  lines.push("```");
  const r3aE1Maj = majorityLabel(scoreR3a.eaE1Labels);
  const r8E1Maj = majorityLabel(scoreR8.eaE1Labels);
  lines.push(
    `R8 vs R3a majority on EA_E1: ${r3aE1Maj} -> ${r8E1Maj} (${r3aE1Maj === r8E1Maj ? "no move" : "MOVED"}).`
  );
  lines.push("");
  lines.push("## EA_E3 explanations");
  lines.push("");
  for (const variantId of ["R3a", "R7", "R8"]) {
    const rows = armRowsOf(results, variantId, "EA_E3");
    for (const r of rows) {
      lines.push(`### ${variantId} EA_E3 run ${r.runIndex + 1}: ${r.classification}`);
      lines.push("");
      lines.push("```");
      lines.push(String(r.explanation || ""));
      lines.push("```");
      lines.push("");
      lines.push(
        `Basis-related words: ${explanationNamesBasis(r.explanation).join(", ") || "(none)"}.`
      );
      lines.push("");
    }
  }
  lines.push("## F93_S0 explanations");
  lines.push("");
  for (const variantId of ["R3a", "R7", "R8"]) {
    const rows = armRowsOf(results, variantId, "F93_S0");
    for (const r of rows) {
      lines.push(`### ${variantId} F93_S0 run ${r.runIndex + 1}: ${r.classification}`);
      lines.push("");
      lines.push("```");
      lines.push(String(r.explanation || ""));
      lines.push("```");
      lines.push("");
    }
  }
  lines.push("## What the model thought it was doing");
  lines.push("");
  const anyPrimaryMiss =
    !scoreR7.primaryEaE3.ok ||
    !scoreR7.primaryF93.ok ||
    !scoreR8.primaryEaE3.ok ||
    !scoreR8.primaryF93.ok;
  if (anyPrimaryMiss) {
    lines.push(
      "At least one PRIMARY missed. Read the EA_E3 explanations above. If an arm names marked/returned and still confirms, the definitional amendment failed on that arm and the next move is the code backstop, not more prose."
    );
  } else {
    lines.push("Both PRIMARYs met on both measured arms (see scoreboard).");
  }
  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  const bothConfirm = stopR7.verdict === "CONFIRM" && stopR8.verdict === "CONFIRM";
  if (bothConfirm) {
    lines.push(
      "Both R7 and R8 CONFIRM. Prefer R7: it keeps example 3c (ranking teaching) while landing the basis rule; R8's 3c removal is only justified if EA_E1 or ranking controls improve, which they need not if both already pass."
    );
  } else if (stopR7.verdict === "CONFIRM") {
    lines.push("Recommend R7 as ship CANDIDATE. R8 did not qualify. Neither ships in this pass.");
  } else if (stopR8.verdict === "CONFIRM") {
    lines.push(
      "Recommend R8 as ship CANDIDATE (R7 missed). Removing 3c appears necessary on this run. Neither ships in this pass."
    );
  } else if (stopR7.verdict === "KILL" || stopR8.verdict === "KILL") {
    lines.push("KILL on at least one arm. Do not write a third wording. Quote reasoning above. Stop for Ben.");
  } else {
    lines.push(
      "PARTIAL. Do not ship. If explanations again name the basis and confirm, next move is the code backstop, not more prose."
    );
  }
  lines.push("");
  lines.push("## Opinion");
  lines.push("");
  lines.push(
    "Four-site amendment is the right instrument: one rule written where the pre-emptors live. Whether the wording is enough is the scoreboard, not the design."
  );
  lines.push(
    "Removing 3c was worth measuring once because R2 only measured its addition. If EA_E1 holds, the removal was unnecessary cost for this primary."
  );
  lines.push("");
  lines.push("## Technical summary");
  lines.push("");
  lines.push(
    "Harness arms R7/R8 built from R3a without editing live stage2_v4.md. Measured 25 statements x 3 arms x 3 runs. Rows in r7-r8-basis-ladder-rows.json."
  );
  lines.push("");
  lines.push("## Plain-language summary");
  lines.push("");
  lines.push(
    "This pass tests whether naming realised-versus-mark in the definitions stops Review putting a green tick on a draft that turns a paper valuation into money returned, while still confirming an honest current-mark sentence."
  );
  lines.push("");

  await mkdir(OUT_DIR, { recursive: true });
  const reportPath = path.join(OUT_DIR, "r7-r8-basis-ladder.md");
  const rowsPath = path.join(OUT_DIR, "r7-r8-basis-ladder-rows.json");
  await writeFile(reportPath, lines.join("\n"), "utf8");
  await writeFile(
    rowsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        costUsd: totalCost,
        promptMeta,
        wordingNotes: WORDING_NOTES,
        stopping: { R7: stopR7, R8: stopR8 },
        scores: { R3a: scoreR3a, R7: scoreR7, R8: scoreR8 },
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
  console.log(`R7 ${stopR7.verdict}: ${stopR7.reason}`);
  console.log(`R8 ${stopR8.verdict}: ${stopR8.reason}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
