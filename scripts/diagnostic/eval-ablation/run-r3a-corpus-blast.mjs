#!/usr/bin/env node
/**
 * R3a corpus blast-radius check against live arm A.
 * Stage 2 only. Cache OFF. Live stage2_v4.md untouched.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-r3a-corpus-blast.mjs
 *
 * Expected cost: ~$8 to $13 (Part 3 capped at $5 projection).
 */
import { createHash, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources, resolveSourceText } from "../lib/sources.mjs";
import { DIAG_ROOT, REPO_ROOT } from "../lib/paths.mjs";
import { BASELINE_PATH } from "../claim-spans/baseline-cache.mjs";
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
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const CS_E3_SOURCE_PATH = path.join(
  DIAG_ROOT,
  "claim-spans/evaluative-accident/source_ic_memo.txt"
);
const ACCIDENT_DIR = path.join(DIAG_ROOT, "claim-spans/evaluative-accident");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const STAGE2_SEED = 1;
const CONCURRENCY = 6;
const PART3_COST_CAP_USD = 5;
const AVG_COST_PER_CALL = 0.012; // projection prior

const EXPECTED_A = {
  length: 12451,
  sha256: "c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe",
};
const EXPECTED_R3A = {
  length: 12812,
  sha256: "bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c",
};

const FALSE_GREENS = [
  {
    id: "EA_E2",
    statement:
      "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
    sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    loadSource: async () => readFile(MERIDIAN_PATH, "utf8"),
  },
  {
    id: "CS_E3",
    statement:
      "Fund IV is marked at 1.9x gross MOIC and Fund III at 1.7x, and that level speaks well of the manager's judgement.",
    sourceFile: "scripts/diagnostic/claim-spans/evaluative-accident/source_ic_memo.txt",
    loadSource: async () => readFile(CS_E3_SOURCE_PATH, "utf8"),
  },
  {
    id: "F01_S10",
    statement:
      "In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway.",
    sourceFile: "01_bvp_shopify_memo.txt",
    loadSource: async () => (await resolveSourceText("01_bvp_shopify_memo.txt")).text,
  },
  {
    id: "F04_S20",
    statement:
      "In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction.",
    sourceFile: "04_synth_vc_pinterest_style_memo.txt",
    loadSource: async () => (await resolveSourceText("04_synth_vc_pinterest_style_memo.txt")).text,
  },
  {
    id: "F12_S0",
    statement:
      "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.",
    sourceFile: "12_synth_linkedin_post.txt",
    loadSource: async () => (await resolveSourceText("12_synth_linkedin_post.txt")).text,
  },
];

const F19 = {
  id: "F19_S7",
  statement:
    "Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 percent year-on-year); the Company has nevertheless gained share, with revenue up 6 percent, but EBITDA margins have compressed from 14 to 12 percent.",
  sourceFile: "19_synth_annual_report.pdf",
  loadSource: async () => (await resolveSourceText("19_synth_annual_report.pdf")).text,
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

async function matchOnce({ systemPrompt, statement, sourceText, variantId, pairId, runIndex }) {
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
    traceName: "diag-eval-ablation-r3a-corpus-blast",
    spanName: "stage2-r3a-corpus",
    metadata: { variantId, pairId, runIndex },
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

async function loadNordholt(kind) {
  const draftName = kind === "dirty" ? "draft_hold_update_DIRTY.txt" : "draft_hold_update_clean.txt";
  const draft = await readFile(path.join(NORDHOLT_DIR, draftName), "utf8");
  const files = [
    ["source_1_ic_memo.txt", "IC memo"],
    ["source_2_press_release.txt", "press release"],
    ["source_3_fact_sheet.txt", "fact sheet"],
    ["source_4_lp_update.txt", "LP update"],
  ];
  const sources = [];
  for (const [name, label] of files) {
    const text = await readFile(path.join(NORDHOLT_DIR, name), "utf8");
    sources.push({ text, label });
  }
  return { draft, sources };
}

async function loadSupersession() {
  const draft = await readFile(path.join(SUPERSESSION_DIR, "draft_supersession.txt"), "utf8");
  const files = [
    "source_A_annual_report_2019.txt",
    "source_B_fy2024_results.txt",
    "source_C_fund_update_2026.txt",
  ];
  const sources = [];
  for (const name of files) {
    const text = await readFile(path.join(SUPERSESSION_DIR, name), "utf8");
    sources.push({ label: name.replace(/\.txt$/, ""), text });
  }
  return { draft, sources };
}

async function loadEvaluativeCase(id) {
  const draft = await readFile(path.join(ACCIDENT_DIR, `draft_${id.toLowerCase()}.txt`), "utf8");
  const text = await readFile(path.join(ACCIDENT_DIR, "source_ic_memo.txt"), "utf8");
  return { draft, sources: [{ text, label: "ic_memo" }] };
}

async function buildCorpusPairs() {
  const baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  const caseSources = {};

  caseSources["nordholt-clean"] = (await loadNordholt("clean")).sources;
  caseSources["nordholt-dirty"] = (await loadNordholt("dirty")).sources;
  caseSources.supersession = (await loadSupersession()).sources;
  for (const id of ["E1", "E2", "E3"]) {
    caseSources[id] = (await loadEvaluativeCase(id)).sources;
  }

  const fixtures = await loadAllFixtures();
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    if (!Number.isFinite(n) || n < 1 || n > 23) continue;
    const label = `F${String(n).padStart(2, "0")}`;
    caseSources[label] = await loadPipelineSources(fx.data.sources || []);
  }

  const pairs = [];
  for (const [caseLabel, row] of Object.entries(baseline.cases)) {
    const sources = caseSources[caseLabel];
    if (!sources || !sources.length) {
      throw new Error(`No sources loaded for baseline case ${caseLabel}`);
    }
    const byIdx = new Map((row.statements || []).map((s) => [s.index, s]));
    for (const m of row.matches || []) {
      const st = byIdx.get(m.statementIndex);
      if (!st?.text) throw new Error(`Missing statement ${caseLabel} S${m.statementIndex}`);
      const src = sources[m.sourceIndex];
      if (!src?.text) {
        throw new Error(
          `Missing source ${caseLabel} sourceIndex=${m.sourceIndex} label=${m.sourceLabel}`
        );
      }
      pairs.push({
        pairId: `${caseLabel}:S${m.statementIndex}:${m.sourceLabel}`,
        caseLabel,
        statementIndex: m.statementIndex,
        statementId: `${caseLabel}_S${m.statementIndex}`,
        statementText: st.text,
        sourceLabel: m.sourceLabel || src.label,
        sourceIndex: m.sourceIndex,
        sourceText: src.text,
        baselineCachedClassification: m.classification,
      });
    }
  }

  // F90 / F91 / F92: statement texts from fixture drafts (no Stage 1).
  const adv = [
    {
      caseLabel: "F90",
      sources: ["90_adversarial_b17_latent.txt"],
      statements: [
        "The firm invested in Helios Grid Controls in 2024.",
        "Helios Grid Controls is a Munich-headquartered supplier of grid-stabilisation software.",
      ],
    },
    {
      caseLabel: "F91",
      sources: ["91_adversarial_shopify_2010_trimmed.txt"],
      statements: ["The firm has invested in Shopify."],
    },
    {
      caseLabel: "F92",
      sources: ["91_adversarial_shopify_2010_trimmed.txt"],
      statements: ["Shopify is a small startup serving approximately 10,000 customers."],
    },
  ];
  for (const a of adv) {
    const sources = await loadPipelineSources(a.sources);
    for (let si = 0; si < a.statements.length; si++) {
      for (let srcI = 0; srcI < sources.length; srcI++) {
        pairs.push({
          pairId: `${a.caseLabel}:S${si}:${sources[srcI].label}`,
          caseLabel: a.caseLabel,
          statementIndex: si,
          statementId: `${a.caseLabel}_S${si}`,
          statementText: a.statements[si],
          sourceLabel: sources[srcI].label,
          sourceIndex: srcI,
          sourceText: sources[srcI].text,
          baselineCachedClassification: null,
        });
      }
    }
  }

  return pairs;
}

function emptyMatrix() {
  const labels = ["confirmed", "partially_confirmed", "conflicting", "no_support"];
  const m = {};
  for (const from of labels) {
    m[from] = {};
    for (const to of labels) m[from][to] = 0;
  }
  return m;
}

function truncate(s, n = 120) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 3)}...`;
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const armA = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const armR3a = (await readFile(R3A_PATH, "utf8")).trim();
  const promptMeta = {
    A: { length: armA.length, sha256: sha256(armA) },
    R3a: { length: armR3a.length, sha256: sha256(armR3a) },
  };
  if (promptMeta.A.sha256 !== EXPECTED_A.sha256) throw new Error("A hash mismatch");
  if (promptMeta.R3a.sha256 !== EXPECTED_R3A.sha256) throw new Error("R3a hash mismatch");
  if (promptMeta.A.sha256 === promptMeta.R3a.sha256) throw new Error("A and R3a collide");

  let runningCost = 0;
  const costLog = [];

  console.log("R3a corpus blast-radius check");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log("ARM HASHES");
  console.log(`A    len=${promptMeta.A.length}  sha256=${promptMeta.A.sha256}`);
  console.log(`R3a  len=${promptMeta.R3a.length}  sha256=${promptMeta.R3a.sha256}`);
  console.log("");

  // -------- PART 1 --------
  console.log("PART 1: reconfirm five false greens + F19_S7 on R3a x3");
  const part1Rows = [];
  const part1Targets = [...FALSE_GREENS, F19];
  for (const t of part1Targets) {
    const sourceText = await t.loadSource();
    for (let run = 1; run <= 3; run++) {
      process.stdout.write(`  ${t.id} r${run} ... `);
      const result = await matchOnce({
        systemPrompt: armR3a,
        statement: t.statement,
        sourceText,
        variantId: "R3a",
        pairId: `part1:${t.id}`,
        runIndex: run,
      });
      runningCost += result.costUsd;
      part1Rows.push({
        id: t.id,
        run,
        classification: result.classification,
        explanation: result.explanation,
        costUsd: result.costUsd,
        systemFingerprint: result.systemFingerprint,
        sourceFile: t.sourceFile,
      });
      console.log(`${shortClass(result.classification)} ($${result.costUsd.toFixed(4)})`);
    }
  }
  costLog.push({ part: 1, costUsd: part1Rows.reduce((s, r) => s + r.costUsd, 0) });
  console.log(`Part 1 cost: $${costLog[0].costUsd.toFixed(4)}  running total: $${runningCost.toFixed(4)}`);

  const part1Summary = {};
  let part1Fail = false;
  for (const t of FALSE_GREENS) {
    const labs = part1Rows.filter((r) => r.id === t.id).map((r) => r.classification);
    const confCount = labs.filter((c) => c === "confirmed").length;
    const ok = confCount < 2;
    if (!ok) part1Fail = true;
    part1Summary[t.id] = { labels: labs, confirmedCount: confCount, ok };
  }
  {
    const labs = part1Rows.filter((r) => r.id === "F19_S7").map((r) => r.classification);
    part1Summary.F19_S7 = {
      labels: labs,
      holdPartial: labs.filter((c) => c === "partially_confirmed").length >= 2,
    };
  }
  console.log("Part 1 summary:", JSON.stringify(part1Summary));
  if (part1Fail) console.log("PART 1 WARNING: at least one false green returned confirmed on >=2/3");
  console.log("");

  // -------- PART 2 --------
  console.log("PART 2: building corpus pairs...");
  const pairs = await buildCorpusPairs();
  console.log(`Pairs: ${pairs.length} (baseline matches + F90/F91/F92)`);
  console.log(`Projected Part 2 calls: ${pairs.length * 2}`);

  const corpusRows = [];
  const jobs = [];
  for (const pair of pairs) {
    jobs.push({ pair, variantId: "A", systemPrompt: armA });
    jobs.push({ pair, variantId: "R3a", systemPrompt: armR3a });
  }

  let done = 0;
  let part2Accrued = 0;
  console.log(`Running ${jobs.length} Stage 2 calls (concurrency ${CONCURRENCY})...`);
  const jobResults = await mapPool(jobs, CONCURRENCY, async (job) => {
    const result = await matchOnce({
      systemPrompt: job.systemPrompt,
      statement: job.pair.statementText,
      sourceText: job.pair.sourceText,
      variantId: job.variantId,
      pairId: job.pair.pairId,
      runIndex: 1,
    });
    done++;
    part2Accrued += result.costUsd;
    if (done % 50 === 0 || done === jobs.length) {
      process.stdout.write(
        `  progress ${done}/${jobs.length} accrued=$${(runningCost + part2Accrued).toFixed(2)}\n`
      );
    }
    return { ...job, result };
  });

  for (const jr of jobResults) {
    runningCost += jr.result.costUsd;
    corpusRows.push({
      pairId: jr.pair.pairId,
      caseLabel: jr.pair.caseLabel,
      statementId: jr.pair.statementId,
      statementIndex: jr.pair.statementIndex,
      statementText: jr.pair.statementText,
      sourceLabel: jr.pair.sourceLabel,
      variantId: jr.variantId,
      classification: jr.result.classification,
      preBackstopClassification: jr.result.preBackstopClassification,
      backstopChanged: jr.result.backstopChanged,
      explanation: jr.result.explanation,
      passage: jr.result.passage,
      systemFingerprint: jr.result.systemFingerprint,
      costUsd: jr.result.costUsd,
      usage: jr.result.usage,
    });
  }
  const part2Cost = jobResults.reduce((s, j) => s + j.result.costUsd, 0);
  costLog.push({ part: 2, costUsd: part2Cost });
  console.log(`Part 2 cost: $${part2Cost.toFixed(4)}  running total: $${runningCost.toFixed(4)}`);

  // Direction matrix
  const byPair = new Map();
  for (const r of corpusRows) {
    if (!byPair.has(r.pairId)) byPair.set(r.pairId, {});
    byPair.get(r.pairId)[r.variantId] = r;
  }
  const matrix = emptyMatrix();
  const moved = [];
  let unchanged = 0;
  for (const [pairId, arms] of byPair) {
    const a = arms.A;
    const b = arms.R3a;
    if (!a || !b || !a.classification || !b.classification) continue;
    matrix[a.classification][b.classification] += 1;
    if (a.classification === b.classification) unchanged++;
    else {
      moved.push({
        pairId,
        caseLabel: a.caseLabel,
        statementId: a.statementId,
        statementText: a.statementText,
        sourceLabel: a.sourceLabel,
        from: a.classification,
        to: b.classification,
        explanationA: a.explanation,
        explanationR3a: b.explanation,
        passageA: a.passage,
        passageR3a: b.passage,
      });
    }
  }
  const totalCompared = unchanged + moved.length;
  console.log(`Compared pairs: ${totalCompared}  moved: ${moved.length} (${((100 * moved.length) / totalCompared).toFixed(1)}%)`);

  // -------- PART 3 projection --------
  const toConfirmed = moved.filter((m) => m.to === "confirmed");
  const offConflicting = moved.filter((m) => m.from === "conflicting");
  const confToPart = moved.filter(
    (m) => m.from === "confirmed" && m.to === "partially_confirmed"
  );

  // Random sample of 30 conf->part (or all if fewer)
  const sampleSize = Math.min(30, confToPart.length);
  const shuffled = [...confToPart];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const confToPartSample = shuffled.slice(0, sampleSize);

  // Deduplicate confirmation set by pairId
  const confirmSetMap = new Map();
  for (const m of [...toConfirmed, ...offConflicting, ...confToPartSample]) {
    confirmSetMap.set(m.pairId, m);
  }
  const confirmSet = [...confirmSetMap.values()];
  // x3 both arms = 6 calls per pair
  const part3Calls = confirmSet.length * 6;
  const part3Projected = part3Calls * AVG_COST_PER_CALL;
  // Better projection from Part 2 avg
  const part2Avg = part2Cost / jobs.length;
  const part3ProjectedActual = part3Calls * part2Avg;

  console.log("");
  console.log("PART 3 projection");
  console.log(`  to-confirmed moves: ${toConfirmed.length}`);
  console.log(`  off-conflicting moves: ${offConflicting.length}`);
  console.log(`  conf->part total: ${confToPart.length}  sample: ${confToPartSample.length}`);
  console.log(`  unique confirmation pairs: ${confirmSet.length}`);
  console.log(`  calls (x3 both arms): ${part3Calls}`);
  console.log(`  projected cost @ part2 avg $${part2Avg.toFixed(4)}: $${part3ProjectedActual.toFixed(2)}`);

  let part3Rows = [];
  let part3Skipped = false;
  let part3Survivors = null;
  if (part3ProjectedActual > PART3_COST_CAP_USD) {
    part3Skipped = true;
    console.log(`PART 3 STOP: projection $${part3ProjectedActual.toFixed(2)} exceeds $${PART3_COST_CAP_USD} cap. Not billing.`);
    costLog.push({ part: 3, costUsd: 0, skipped: true, projectedUsd: part3ProjectedActual });
  } else {
    console.log("PART 3: running noise confirmation...");
    const part3Jobs = [];
    for (const m of confirmSet) {
      const pair = pairs.find((p) => p.pairId === m.pairId);
      for (const variantId of ["A", "R3a"]) {
        for (let run = 1; run <= 3; run++) {
          part3Jobs.push({
            pair,
            move: m,
            variantId,
            systemPrompt: variantId === "A" ? armA : armR3a,
            run,
          });
        }
      }
    }
    const p3Results = await mapPool(part3Jobs, CONCURRENCY, async (job) => {
      const result = await matchOnce({
        systemPrompt: job.systemPrompt,
        statement: job.pair.statementText,
        sourceText: job.pair.sourceText,
        variantId: job.variantId,
        pairId: job.pair.pairId,
        runIndex: job.run,
      });
      return { ...job, result };
    });
    let part3Cost = 0;
    for (const jr of p3Results) {
      part3Cost += jr.result.costUsd;
      runningCost += jr.result.costUsd;
      part3Rows.push({
        pairId: jr.pair.pairId,
        from: jr.move.from,
        to: jr.move.to,
        variantId: jr.variantId,
        run: jr.run,
        classification: jr.result.classification,
        explanation: jr.result.explanation,
        costUsd: jr.result.costUsd,
      });
    }
    costLog.push({ part: 3, costUsd: part3Cost, skipped: false, projectedUsd: part3ProjectedActual });
    console.log(`Part 3 cost: $${part3Cost.toFixed(4)}  running total: $${runningCost.toFixed(4)}`);

    // Survivors: move A-majority from -> R3a-majority to on x3
    part3Survivors = [];
    for (const m of confirmSet) {
      const aLabs = part3Rows
        .filter((r) => r.pairId === m.pairId && r.variantId === "A")
        .map((r) => r.classification);
      const bLabs = part3Rows
        .filter((r) => r.pairId === m.pairId && r.variantId === "R3a")
        .map((r) => r.classification);
      const aMaj = aLabs.filter((c) => c === m.from).length >= 2;
      const bMaj = bLabs.filter((c) => c === m.to).length >= 2;
      part3Survivors.push({
        pairId: m.pairId,
        from: m.from,
        to: m.to,
        aLabels: aLabs,
        r3aLabels: bLabs,
        survives: aMaj && bMaj,
      });
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const movedPath = path.join(OUT_DIR, "r3a-corpus-blast-moved.json");
  await writeFile(movedPath, JSON.stringify({ moved, toConfirmed, offConflicting, confToPart }, null, 2));

  const outPath = path.join(OUT_DIR, "r3a-corpus-blast-rows.json");
  await writeFile(
    outPath,
    JSON.stringify(
      {
        meta: {
          probe: "stage2-r3a-corpus-blast",
          model: `${stageModel.provider}/${stageModel.model}`,
          cache: "off",
          temperature: 0,
          seed: STAGE2_SEED,
          concurrency: CONCURRENCY,
          promptMeta,
          pairCount: pairs.length,
          totalCostUsd: runningCost,
          costLog,
          ranAt: new Date().toISOString(),
        },
        part1: { summary: part1Summary, fail: part1Fail, rows: part1Rows },
        part2: {
          matrix,
          unchanged,
          movedCount: moved.length,
          totalCompared,
          movedPct: totalCompared ? (100 * moved.length) / totalCompared : 0,
        },
        part3: {
          skipped: part3Skipped,
          projectedUsd: part3ProjectedActual,
          confirmSetSize: confirmSet.length,
          toConfirmedCount: toConfirmed.length,
          offConflictingCount: offConflicting.length,
          confToPartCount: confToPart.length,
          confToPartSampleIds: confToPartSample.map((m) => m.pairId),
          survivors: part3Survivors,
          rows: part3Rows,
        },
        corpusRows,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${movedPath}`);
  console.log(`TOTAL COST: $${runningCost.toFixed(6)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
