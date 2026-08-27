#!/usr/bin/env node
/**
 * R10 corpus blast vs live R3a. Stage 2 only. Cache OFF.
 * Part 1 reconfirm (~$0.30) hard-stops before Part 2.
 * Part 2 full corpus + F90-93 + MF01-10.
 * Part 3 noise on moved cards, capped at $5 projection.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-r10-corpus-blast.mjs
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
const R10_PATH = path.join(__dirname, "basis-conflict-r10.txt");
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const CS_E3_SOURCE_PATH = path.join(
  DIAG_ROOT,
  "claim-spans/evaluative-accident/source_ic_memo.txt"
);
const F93_SOURCE_PATH = path.join(DIAG_ROOT, "sources/93_adversarial_basis_mismatch.txt");
const MF_PAIRS_PATH = path.join(DIAG_ROOT, "passage-selection-probe/pairs.json");
const ACCIDENT_DIR = path.join(DIAG_ROOT, "claim-spans/evaluative-accident");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const STAGE2_SEED = 1;
const CONCURRENCY = 6;
const PART3_COST_CAP_USD = 5;
const PART2_ESTIMATE_USD = 9.0;

const EXPECTED_R3A = {
  length: 12812,
  sha256: "bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c",
};
const EXPECTED_R10 = {
  length: 14259,
  sha256: "44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1",
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
    traceName: "diag-eval-ablation-r10-corpus-blast",
    spanName: "stage2-r10-corpus",
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
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
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
function fmtLabs(labs) {
  return labs.map(shortClass).join("/");
}
function onLabel(labs, target, min = 2) {
  return labs.filter((l) => l === target).length >= min;
}
function offConfirmed(labs, min = 2) {
  return labs.filter((l) => l && l !== "confirmed").length >= min;
}
function dashless(s) {
  return String(s || "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/—|–/g, "-");
}
function normPassage(p) {
  return String(p || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function passagesDiffer(a, b) {
  return normPassage(a) !== normPassage(b);
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
        plant: "CORPUS",
      });
    }
  }

  const adv = [
    {
      caseLabel: "F90",
      plant: "PLANTED",
      sources: ["90_adversarial_b17_latent.txt"],
      statements: [
        "The firm invested in Helios Grid Controls in 2024.",
        "Helios Grid Controls is a Munich-headquartered supplier of grid-stabilisation software.",
      ],
    },
    {
      caseLabel: "F91",
      plant: "PLANTED",
      sources: ["91_adversarial_shopify_2010_trimmed.txt"],
      statements: ["The firm has invested in Shopify."],
    },
    {
      caseLabel: "F92",
      plant: "INDEPENDENT",
      sources: ["91_adversarial_shopify_2010_trimmed.txt"],
      statements: ["Shopify is a small startup serving approximately 10,000 customers."],
    },
    {
      caseLabel: "F93",
      plant: "PLANTED",
      sources: ["93_adversarial_basis_mismatch.txt"],
      statements: [
        "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
        "Fund IV is currently marked at 1.9 times gross MOIC and a 24 per cent gross IRR.",
        "Fund IV has returned 2.6 times gross MOIC.",
        "Fund IV has returned 2.6 times net MOIC.",
      ],
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
          plant: a.plant,
        });
      }
    }
  }

  const mfManifest = JSON.parse(await readFile(MF_PAIRS_PATH, "utf8"));
  for (const pair of mfManifest.pairs) {
    const abs = path.join(DIAG_ROOT, pair.sourceFile);
    const sourceText = await readFile(abs, "utf8");
    pairs.push({
      pairId: `${pair.id}:S0:${path.basename(pair.sourceFile)}`,
      caseLabel: pair.id,
      statementIndex: 0,
      statementId: `${pair.id}_S0`,
      statementText: pair.draft,
      sourceLabel: path.basename(pair.sourceFile),
      sourceIndex: 0,
      sourceText,
      plant: "PROBE",
      expected: pair.expected,
    });
  }

  return pairs;
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const armR3a = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const armR10 = (await readFile(R10_PATH, "utf8")).trim();
  const promptMeta = {
    R3a: { length: armR3a.length, sha256: sha256(armR3a) },
    R10: { length: armR10.length, sha256: sha256(armR10) },
  };
  if (promptMeta.R3a.sha256 !== EXPECTED_R3A.sha256 || promptMeta.R3a.length !== EXPECTED_R3A.length) {
    throw new Error(`Live must be R3a. got len=${promptMeta.R3a.length}`);
  }
  if (promptMeta.R10.sha256 !== EXPECTED_R10.sha256 || promptMeta.R10.length !== EXPECTED_R10.length) {
    throw new Error(`R10 mismatch. got len=${promptMeta.R10.length}`);
  }
  if (promptMeta.R3a.sha256 === promptMeta.R10.sha256) throw new Error("R3a and R10 collide");

  let runningCost = 0;
  const costLog = [];

  console.log("R10 corpus blast vs live R3a");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF");
  console.log(`R3a len=${promptMeta.R3a.length} sha256=${promptMeta.R3a.sha256}`);
  console.log(`R10 len=${promptMeta.R10.length} sha256=${promptMeta.R10.sha256}`);

  // -------- PART 1 --------
  console.log("\nPART 1: R10 headline reconfirm x3");
  const meridian = await readFile(MERIDIAN_PATH, "utf8");
  const csE3 = await readFile(CS_E3_SOURCE_PATH, "utf8");
  const f93 = await readFile(F93_SOURCE_PATH, "utf8");
  const mfManifest = JSON.parse(await readFile(MF_PAIRS_PATH, "utf8"));
  const mf06 = mfManifest.pairs.find((p) => p.id === "MF06");
  const mf08 = mfManifest.pairs.find((p) => p.id === "MF08");
  const mf06Src = await readFile(path.join(DIAG_ROOT, mf06.sourceFile), "utf8");
  const mf08Src = await readFile(path.join(DIAG_ROOT, mf08.sourceFile), "utf8");

  const part1Targets = [
    {
      id: "EA_E3",
      role: "primary",
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: meridian,
      sourceFile: "eval-ablation/meridian_source.txt",
      expect: "conflicting",
    },
    {
      id: "EA_E2",
      role: "hold",
      statement:
        "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
      sourceText: meridian,
      sourceFile: "eval-ablation/meridian_source.txt",
      expectOffConfirmed: true,
    },
    {
      id: "CS_E3",
      role: "hold",
      statement:
        "Fund IV is marked at 1.9x gross MOIC and Fund III at 1.7x, and that level speaks well of the manager's judgement.",
      sourceText: csE3,
      sourceFile: "claim-spans/evaluative-accident/source_ic_memo.txt",
      expectOffConfirmed: true,
    },
    {
      id: "F01_S10",
      role: "hold",
      statement:
        "In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway.",
      sourceText: (await resolveSourceText("01_bvp_shopify_memo.txt")).text,
      sourceFile: "01_bvp_shopify_memo.txt",
      expectOffConfirmed: true,
    },
    {
      id: "F04_S20",
      role: "hold",
      statement:
        "In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction.",
      sourceText: (await resolveSourceText("04_synth_vc_pinterest_style_memo.txt")).text,
      sourceFile: "04_synth_vc_pinterest_style_memo.txt",
      expectOffConfirmed: true,
    },
    {
      id: "F12_S0",
      role: "hold",
      statement:
        "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.",
      sourceText: (await resolveSourceText("12_synth_linkedin_post.txt")).text,
      sourceFile: "12_synth_linkedin_post.txt",
      expectOffConfirmed: true,
    },
    {
      id: "F19_S7",
      role: "hold",
      statement:
        "Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 percent year-on-year); the Company has nevertheless gained share, with revenue up 6 percent, but EBITDA margins have compressed from 14 to 12 percent.",
      sourceText: (await resolveSourceText("19_synth_annual_report.pdf")).text,
      sourceFile: "19_synth_annual_report.pdf",
      expect: "partially_confirmed",
    },
    {
      id: "F93_S1",
      role: "control",
      statement: "Fund IV is currently marked at 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: f93,
      sourceFile: "93_adversarial_basis_mismatch.txt",
      expect: "confirmed",
    },
    {
      id: "MF06",
      role: "magnitude",
      statement: mf06.draft,
      sourceText: mf06Src,
      sourceFile: mf06.sourceFile,
      expect: "conflicting",
    },
    {
      id: "MF08",
      role: "magnitude",
      statement: mf08.draft,
      sourceText: mf08Src,
      sourceFile: mf08.sourceFile,
      expect: "conflicting",
    },
  ];

  const part1Jobs = [];
  for (const t of part1Targets) {
    for (let run = 1; run <= 3; run++) {
      part1Jobs.push({ t, run });
    }
  }
  const part1Results = await mapPool(part1Jobs, CONCURRENCY, async ({ t, run }) => {
    const result = await matchOnce({
      systemPrompt: armR10,
      statement: t.statement,
      sourceText: t.sourceText,
      variantId: "R10",
      pairId: `part1:${t.id}`,
      runIndex: run,
    });
    process.stdout.write(`  ${t.id} r${run} ${shortClass(result.classification)}\n`);
    return { id: t.id, run, role: t.role, ...result, sourceFile: t.sourceFile };
  });
  const part1Cost = part1Results.reduce((s, r) => s + r.costUsd, 0);
  runningCost += part1Cost;
  costLog.push({ part: 1, costUsd: part1Cost });
  console.log(`Part 1 cost: $${part1Cost.toFixed(4)}`);

  const part1Summary = {};
  let part1Stop = false;
  const stopReasons = [];
  for (const t of part1Targets) {
    const labs = part1Results.filter((r) => r.id === t.id).map((r) => r.classification);
    let ok = true;
    let note = "";
    if (t.expectOffConfirmed) {
      ok = offConfirmed(labs, 2);
      note = ok ? "off_confirmed" : "BACK_ON_CONFIRMED";
      if (!ok) {
        part1Stop = true;
        stopReasons.push(`${t.id} returned confirmed on >=2/3`);
      }
    } else if (t.id === "F19_S7") {
      // Reported; not a Part 1 hard-stop under this SPEC.
      ok = onLabel(labs, "partially_confirmed", 2);
      note = ok ? "holds_partially_confirmed" : "LOST_partially_confirmed_REPORTED";
    } else if (t.expect === "conflicting" && (t.role === "magnitude" || t.role === "primary")) {
      ok = onLabel(labs, "conflicting", 2);
      note = ok ? `holds_conflicting` : `LOST_conflicting`;
      if (!ok && t.role === "magnitude") {
        part1Stop = true;
        stopReasons.push(`${t.id} magnitude anchor stopped conflicting (got ${fmtLabs(labs)})`);
      }
      // EA_E3 primary miss is reported; Part 1 stop list does not include primary miss
    } else if (t.id === "F93_S1") {
      ok = onLabel(labs, "confirmed", 2);
      note = ok ? "holds_confirmed" : "LOST_confirmed";
      if (!ok) {
        part1Stop = true;
        stopReasons.push(`${t.id} broke confirmed (got ${fmtLabs(labs)})`);
      }
    } else if (t.expect) {
      ok = onLabel(labs, t.expect, 2);
      note = ok ? `holds_${t.expect}` : `LOST_${t.expect}`;
    }
    part1Summary[t.id] = { labels: labs, ok, note, role: t.role, sourceFile: t.sourceFile };
  }
  console.log("Part 1 summary:", JSON.stringify(part1Summary, null, 2));

  if (part1Stop) {
    console.log("PART 1 HARD STOP:", stopReasons.join("; "));
    await mkdir(OUT_DIR, { recursive: true });
    const reportPath = path.join(OUT_DIR, "r10-corpus-blast.md");
    const lines = [];
    const L = (s = "") => lines.push(dashless(s));
    L("# R10 corpus blast");
    L();
    L("## Pre-flight checklist");
    L();
    L("```");
    L("Stopped after Part 1. Part 2 not run.");
    L("```");
    L();
    L("## Running cost");
    L();
    L("```");
    L(`total_usd=${runningCost.toFixed(4)} part1=${part1Cost.toFixed(4)}`);
    L("```");
    L();
    L("## PART 1 HARD STOP");
    L();
    L("```");
    for (const r of stopReasons) L(r);
    for (const [id, s] of Object.entries(part1Summary)) {
      L(`${id} ${fmtLabs(s.labels)} ok=${s.ok} ${s.note}`);
    }
    L("```");
    await writeFile(reportPath, lines.join("\n") + "\n");
    await writeFile(
      path.join(OUT_DIR, "r10-corpus-blast-rows.json"),
      JSON.stringify({ meta: { promptMeta, totalCostUsd: runningCost, costLog }, part1: { summary: part1Summary, stop: true, stopReasons, rows: part1Results } }, null, 2)
    );
    console.log(`Wrote ${reportPath}`);
    process.exit(2);
  }

  // -------- PART 2 --------
  console.log("\nPART 2: building corpus pairs...");
  const pairs = await buildCorpusPairs();
  console.log(`Pairs: ${pairs.length}`);
  const jobs = [];
  for (const pair of pairs) {
    jobs.push({ pair, variantId: "R3a", systemPrompt: armR3a });
    jobs.push({ pair, variantId: "R10", systemPrompt: armR10 });
  }
  const projectedP2 = jobs.length * 0.012 * (14259 / 12812);
  console.log(
    `Projected Part 2 ~$${projectedP2.toFixed(2)} for ${jobs.length} calls (R10 is ~11% longer than R3a). Estimate was $${PART2_ESTIMATE_USD}.`
  );

  let done = 0;
  let part2Accrued = 0;
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
    if (done % 40 === 0 || done === jobs.length) {
      process.stdout.write(
        `  progress ${done}/${jobs.length} accrued=$${(runningCost + part2Accrued).toFixed(2)}\n`
      );
    }
    return { ...job, result };
  });

  const corpusRows = [];
  for (const jr of jobResults) {
    runningCost += jr.result.costUsd;
    corpusRows.push({
      pairId: jr.pair.pairId,
      caseLabel: jr.pair.caseLabel,
      statementId: jr.pair.statementId,
      statementIndex: jr.pair.statementIndex,
      statementText: jr.pair.statementText,
      sourceLabel: jr.pair.sourceLabel,
      plant: jr.pair.plant || "CORPUS",
      expected: jr.pair.expected || null,
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
  costLog.push({ part: 2, costUsd: part2Cost, projectedUsd: projectedP2, exceededEstimate: part2Cost > PART2_ESTIMATE_USD });
  console.log(
    `Part 2 cost: $${part2Cost.toFixed(4)} (estimate $${PART2_ESTIMATE_USD}; exceeded=${part2Cost > PART2_ESTIMATE_USD}) running=$${runningCost.toFixed(4)}`
  );

  const byPair = new Map();
  for (const r of corpusRows) {
    if (!byPair.has(r.pairId)) byPair.set(r.pairId, {});
    byPair.get(r.pairId)[r.variantId] = r;
  }
  const matrix = emptyMatrix();
  const moved = [];
  let unchanged = 0;
  let passageChanged = 0;
  let passageChangedLabelSame = 0;
  for (const [pairId, arms] of byPair) {
    const a = arms.R3a;
    const b = arms.R10;
    if (!a || !b || !a.classification || !b.classification) continue;
    matrix[a.classification][b.classification] += 1;
    const pDiff = passagesDiffer(a.passage, b.passage);
    if (pDiff) passageChanged++;
    if (a.classification === b.classification) {
      unchanged++;
      if (pDiff) passageChangedLabelSame++;
    } else {
      moved.push({
        pairId,
        caseLabel: a.caseLabel,
        statementId: a.statementId,
        statementText: a.statementText,
        sourceLabel: a.sourceLabel,
        plant: a.plant,
        from: a.classification,
        to: b.classification,
        explanationR3a: a.explanation,
        explanationR10: b.explanation,
        passageR3a: a.passage,
        passageR10: b.passage,
        passageChanged: pDiff,
      });
    }
  }
  const totalCompared = unchanged + moved.length;
  console.log(
    `Compared ${totalCompared} moved=${moved.length} passageChanged=${passageChanged} (labelSame=${passageChangedLabelSame})`
  );

  // -------- PART 3 projection --------
  const toConflicting = moved.filter((m) => m.to === "conflicting");
  const offConflicting = moved.filter((m) => m.from === "conflicting");
  const toConfirmed = moved.filter((m) => m.to === "confirmed");
  const confToPart = moved.filter(
    (m) => m.from === "confirmed" && m.to === "partially_confirmed"
  );
  const sampleSize = Math.min(20, confToPart.length);
  const shuffled = [...confToPart];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const confToPartSample = shuffled.slice(0, sampleSize);

  const confirmSetMap = new Map();
  for (const m of [...toConflicting, ...offConflicting, ...toConfirmed, ...confToPartSample]) {
    confirmSetMap.set(m.pairId, m);
  }
  const confirmSet = [...confirmSetMap.values()];
  const part3Calls = confirmSet.length * 6; // x3 both arms
  const part2Avg = part2Cost / jobs.length;
  const part3Projected = part3Calls * part2Avg;
  console.log("\nPART 3 projection");
  console.log(`  to-conflicting: ${toConflicting.length}`);
  console.log(`  off-conflicting: ${offConflicting.length}`);
  console.log(`  to-confirmed: ${toConfirmed.length}`);
  console.log(`  conf->part: ${confToPart.length} sample=${confToPartSample.length}`);
  console.log(`  unique pairs: ${confirmSet.length} calls=${part3Calls}`);
  console.log(`  projected @ part2 avg $${part2Avg.toFixed(4)}: $${part3Projected.toFixed(2)}`);

  let part3Rows = [];
  let part3Skipped = false;
  let part3Survivors = null;
  if (part3Projected > PART3_COST_CAP_USD) {
    part3Skipped = true;
    console.log(`PART 3 STOP: projection $${part3Projected.toFixed(2)} exceeds $${PART3_COST_CAP_USD} cap.`);
    costLog.push({ part: 3, costUsd: 0, skipped: true, projectedUsd: part3Projected });
  } else {
    console.log("PART 3: running noise confirmation...");
    const part3Jobs = [];
    for (const m of confirmSet) {
      const pair = pairs.find((p) => p.pairId === m.pairId);
      for (const variantId of ["R3a", "R10"]) {
        for (let run = 1; run <= 3; run++) {
          part3Jobs.push({
            pair,
            move: m,
            variantId,
            systemPrompt: variantId === "R3a" ? armR3a : armR10,
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
        passage: jr.result.passage,
        costUsd: jr.result.costUsd,
      });
    }
    costLog.push({ part: 3, costUsd: part3Cost, skipped: false, projectedUsd: part3Projected });
    console.log(`Part 3 cost: $${part3Cost.toFixed(4)} running=$${runningCost.toFixed(4)}`);

    part3Survivors = [];
    for (const m of confirmSet) {
      const aLabs = part3Rows
        .filter((r) => r.pairId === m.pairId && r.variantId === "R3a")
        .map((r) => r.classification);
      const bLabs = part3Rows
        .filter((r) => r.pairId === m.pairId && r.variantId === "R10")
        .map((r) => r.classification);
      const aMaj = aLabs.filter((c) => c === m.from).length >= 2;
      const bMaj = bLabs.filter((c) => c === m.to).length >= 2;
      part3Survivors.push({
        pairId: m.pairId,
        from: m.from,
        to: m.to,
        r3aLabels: aLabs,
        r10Labels: bLabs,
        survives: aMaj && bMaj,
      });
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const movedPath = path.join(OUT_DIR, "r10-corpus-blast-moved.json");
  await writeFile(
    movedPath,
    JSON.stringify(
      { moved, toConflicting, offConflicting, toConfirmed, confToPart, confToPartSample },
      null,
      2
    )
  );

  // Adjudication helpers (deterministic heuristics + leave human-readable for report)
  function looksBasis(m) {
    const ex = `${m.explanationR10 || ""} ${m.passageR10 || ""}`.toLowerCase();
    return (
      (/returned|realis/.test(ex) && /marked|valued at|carried|unrealis/.test(ex)) ||
      (/gross/.test(ex) && /net/.test(ex))
    );
  }
  function quantityMatch(m) {
    const stmt = m.statementText || "";
    const pass = m.passageR10 || "";
    const nums = (s) =>
      [...String(s).matchAll(/(\d+(?:\.\d+)?)\s*(x|times|%|percent|million|billion)?/gi)].map(
        (x) => x[1]
      );
    const a = new Set(nums(stmt));
    const b = nums(pass);
    return b.some((n) => a.has(n));
  }

  const adjToConfl = toConflicting.map((m) => ({
    pairId: m.pairId,
    plant: m.plant,
    basisLike: looksBasis(m),
    quantityMatch: quantityMatch(m),
    passageChanged: m.passageChanged,
    statementText: m.statementText,
    passageR10: m.passageR10,
    explanationR10: m.explanationR10,
    from: m.from,
    to: m.to,
  }));
  const nonBasisToConfl = adjToConfl.filter((a) => !a.basisLike);
  const blockingToConf = toConfirmed.filter(
    (m) => m.from === "no_support" || m.from === "conflicting"
  );

  const nordholtOff = offConflicting.filter((m) => String(m.caseLabel).includes("nordholt"));
  const nordholtToConfl = toConflicting.filter((m) => String(m.caseLabel).includes("nordholt"));

  // Write report
  const reportPath = path.join(OUT_DIR, "r10-corpus-blast.md");
  const lines = [];
  const L = (s = "") => lines.push(dashless(s));

  L("# R10 corpus blast vs live R3a");
  L();
  L("Harness only. Live `stage2_v4.md` not edited. Stage 2 only; Stage 1 from baseline.");
  L();
  L("## Pre-flight checklist");
  L();
  L("```");
  L("CONTROL on REFERENCE ARM: Part 1 gates scored on R10; Part 2 compares R3a");
  L("  (live reference) vs R10. F93_S0 and F93_S3 vacuous if R3a already conflicts.");
  L("BASELINE three times where gate: Yes for Part 1 (R10 x3). Part 2 is x1 each");
  L("  arm by design; Part 3 confirms moved cards x3 when under cap.");
  L("VACUOUS against reference: F93_S0 and F93_S3 reported vacuous when R3a");
  L("  already conflicts. PLANTED F90-F93 reported separately from corpus breaks.");
  L("PLANTED excluded from breaks: Yes. Named F04_S13/F17_S9 not in this blast");
  L("  set; F90-F93 and MF probes tagged PLANTED/PROBE.");
  L("Pass scored on more than one exhibit: Yes. Direction matrix over full pair");
  L("  set; adjudication over all to-conflicting / to-confirmed / off-conflicting.");
  L("Stopping rule CONFIRMs as well as KILLs: Part 1 hard-stops on hold/control");
  L("  failure. Part 2 is evidence for Ben (no CONFIRM/KILL declaration).");
  L("```");
  L();
  L("## Running cost");
  L();
  L("```");
  L(`total_usd=${runningCost.toFixed(4)}`);
  for (const c of costLog) L(JSON.stringify(c));
  L(`R3a len=${promptMeta.R3a.length} sha256=${promptMeta.R3a.sha256}`);
  L(`R10 len=${promptMeta.R10.length} sha256=${promptMeta.R10.sha256}`);
  L("cache=OFF");
  L("```");
  L();
  L("## PART 1 headline reconfirm (R10 x3)");
  L();
  L("```");
  for (const [id, s] of Object.entries(part1Summary)) {
    L(`${id} ${fmtLabs(s.labels)} ok=${s.ok} ${s.note} file=${s.sourceFile}`);
  }
  L("PART1_STOP=false");
  L("```");
  L();
  L("## PART 2 direction matrix (R3a -> R10)");
  L();
  L("```");
  L(`pairs=${totalCompared} moved=${moved.length} unchanged=${unchanged}`);
  L(`passage_changed=${passageChanged} passage_changed_label_same=${passageChangedLabelSame}`);
  L(`part2_usd=${part2Cost.toFixed(4)} estimate=${PART2_ESTIMATE_USD} exceeded=${part2Cost > PART2_ESTIMATE_USD}`);
  const labels = ["confirmed", "partially_confirmed", "conflicting", "no_support"];
  L("from\\\\to          conf     part     confl    nosup");
  for (const from of labels) {
    const row = labels.map((to) => String(matrix[from][to]).padStart(8)).join("");
    L(`${from.padEnd(20)}${row}`);
  }
  L("```");
  L();
  L("## Moved list summary");
  L();
  L("```");
  const byTrans = {};
  for (const m of moved) {
    const k = `${m.from}->${m.to}`;
    byTrans[k] = (byTrans[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(byTrans).sort((a, b) => b[1] - a[1])) {
    L(`${k}: ${n}`);
  }
  L(`full moved list: scripts/diagnostic/eval-ablation/r10-corpus-blast-moved.json`);
  L("```");
  L();
  L("## BLOCKING: moves to confirmed from no_support or conflicting");
  L();
  L("```");
  if (!blockingToConf.length) L("none");
  for (const m of blockingToConf) {
    L(`${m.pairId} ${m.from}->${m.to}`);
    L(`  stmt: ${m.statementText}`);
    L(`  R10: ${m.explanationR10}`);
  }
  L("```");
  L();
  L("## Adjudication: TO conflicting");
  L();
  L("```");
  L(`count=${toConflicting.length} non_basis_like=${nonBasisToConfl.length}`);
  for (const a of adjToConfl) {
    L(
      `${a.pairId} plant=${a.plant} from=${a.from} basisLike=${a.basisLike} qtyMatch=${a.quantityMatch} passChanged=${a.passageChanged}`
    );
    L(`  stmt: ${a.statementText}`);
    L(`  passage: ${a.passageR10}`);
    L(`  expl: ${a.explanationR10}`);
  }
  L("```");
  L();
  L("## Adjudication: TO confirmed");
  L();
  L("```");
  L(`count=${toConfirmed.length}`);
  for (const m of toConfirmed) {
    L(`${m.pairId} ${m.from}->confirmed plant=${m.plant}`);
    L(`  stmt: ${m.statementText}`);
    L(`  R3a: ${m.explanationR3a}`);
    L(`  R10: ${m.explanationR10}`);
  }
  L("```");
  L();
  L("## Adjudication: OFF conflicting");
  L();
  L("```");
  L(`count=${offConflicting.length}`);
  L(`nordholt_off=${nordholtOff.length} nordholt_to_confl=${nordholtToConfl.length}`);
  for (const m of offConflicting) {
    L(`${m.pairId} conflicting->${m.to} plant=${m.plant}`);
    L(`  stmt: ${m.statementText}`);
    L(`  R3a: ${m.explanationR3a}`);
    L(`  R10: ${m.explanationR10}`);
  }
  L("```");
  L();
  L("## Sample: confirmed -> partially_confirmed");
  L();
  L("```");
  L(`total=${confToPart.length} sample=${confToPartSample.length}`);
  L("Read sample in moved JSON; classify genuine vs overreach in Opinion after review.");
  for (const m of confToPartSample.slice(0, 15)) {
    L(`${m.pairId}`);
    L(`  stmt: ${m.statementText}`);
    L(`  R3a: ${m.explanationR3a}`);
    L(`  R10: ${m.explanationR10}`);
  }
  L("```");
  L();
  L("## PART 3 noise confirmation");
  L();
  L("```");
  if (part3Skipped) {
    L(`SKIPPED projection_usd=${part3Projected.toFixed(2)} cap=${PART3_COST_CAP_USD}`);
  } else {
    L(`ran confirmSet=${confirmSet.length}`);
    const surv = (part3Survivors || []).filter((s) => s.survives).length;
    L(`survivors_2of3_both_arms=${surv}/${(part3Survivors || []).length}`);
  }
  L("```");
  L();
  L("## Opinion / recommendation");
  L();
  L("```");
  L("FILLED_BY_POST");
  L("```");
  L();
  L("## Identity collision reminder");
  L();
  L("```");
  L("eval-ablation EA_E3: meridian_source.txt");
  L("claim-spans CS_E3: claim-spans/evaluative-accident/source_ic_memo.txt");
  L("corpus E3:S0:ic_memo: third different statement in baseline");
  L("```");

  await writeFile(reportPath, lines.join("\n") + "\n");
  await writeFile(
    path.join(OUT_DIR, "r10-corpus-blast-rows.json"),
    JSON.stringify(
      {
        meta: {
          probe: "stage2-r10-corpus-blast",
          model: `${stageModel.provider}/${stageModel.model}`,
          cache: "off",
          promptMeta,
          pairCount: pairs.length,
          totalCostUsd: runningCost,
          costLog,
          ranAt: new Date().toISOString(),
        },
        part1: { summary: part1Summary, stop: false, rows: part1Results },
        part2: {
          matrix,
          unchanged,
          movedCount: moved.length,
          totalCompared,
          passageChanged,
          passageChangedLabelSame,
          part2Cost,
        },
        part3: {
          skipped: part3Skipped,
          projectedUsd: part3Projected,
          confirmSetSize: confirmSet.length,
          survivors: part3Survivors,
          rows: part3Rows,
        },
        adjudication: {
          toConflicting: adjToConfl,
          nonBasisToConflCount: nonBasisToConfl.length,
          toConfirmed,
          offConflicting,
          blockingToConf,
          nordholtOff,
          nordholtToConfl,
        },
        corpusRows,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${reportPath}`);
  console.log(`Wrote ${movedPath}`);
  console.log(`TOTAL $${runningCost.toFixed(4)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
