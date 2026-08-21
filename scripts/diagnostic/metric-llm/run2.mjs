#!/usr/bin/env node
/**
 * D-METRIC-LLM-2: name metrics, do not judge comparability.
 * Diagnostic prompt copy only. Cache off. Production prompt unused.
 *
 * Usage:
 *   node scripts/diagnostic/metric-llm/run2.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { splitDraftIntoCandidatesV2 } from "../../../lib/extract-statements.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const HOME = process.env.HOME || "";
const NORDHOLT_DIR = path.join(HOME, "Downloads");
const B67_DIR = path.join(DIAG_ROOT, "b67-probe");
const B72_DIR = path.join(DIAG_ROOT, "b72-probe");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const PROBE_PROMPT_PATH = path.join(DIAG_ROOT, "metric-llm", "stage2_probe.md");
const RUNS = 3;
const FIELDS = ["statement_figure", "statement_metric", "source_figure", "source_metric"];

const { callLLM, calculateLlmCostUsd, createTraceId, startTrace, flushObservability } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { STAGE2_SEED } = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");

function safeJsonParse(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function isCreditExhausted(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || err?.error?.code || "");
  return (
    code === "credit_balance_exhausted" ||
    /credit_balance_exhausted|no credits remaining|insufficient_quota/i.test(msg)
  );
}

function fieldStr(parsed, key) {
  const v = parsed?.[key];
  return typeof v === "string" ? v.trim() : "";
}

function fieldStable(runs, key) {
  const vals = runs.map((r) => String(r[key] || "").toLowerCase());
  return vals.every((v) => v && v === vals[0]);
}

async function loadPairSources() {
  const b67Press = await readFile(path.join(B67_DIR, "source_press_release.txt"), "utf8");
  const b67Fact = await readFile(path.join(B67_DIR, "source_fact_sheet.txt"), "utf8");
  const b72Src = await readFile(path.join(B72_DIR, "source_ebitda_margin.txt"), "utf8");
  const b72Draft = (await readFile(path.join(B72_DIR, "draft.txt"), "utf8")).trim();
  const nordholtIc = await readFile(path.join(NORDHOLT_DIR, "source_1_ic_memo.txt"), "utf8");
  const nordholtPress = await readFile(path.join(NORDHOLT_DIR, "source_2_press_release.txt"), "utf8");
  const nordholtClean = await readFile(path.join(NORDHOLT_DIR, "draft_hold_update_clean.txt"), "utf8");
  const nordholtDirty = await readFile(path.join(NORDHOLT_DIR, "draft_hold_update_DIRTY.txt"), "utf8");
  const f18Sources = await loadPipelineSources([
    "18a_synth_cross_source_pair_initial.txt",
    "18b_synth_cross_source_pair_update.txt",
  ]);
  const f18b = f18Sources.find((s) => s.label === "18b_synth_cross_source_pair_update");
  const f19Sources = await loadPipelineSources(["19_synth_annual_report.pdf"]);
  const f22Sources = await loadPipelineSources(["ALP_update_memo.txt"]);
  const super2019 = await readFile(path.join(SUPERSESSION_DIR, "source_A_annual_report_2019.txt"), "utf8");
  const superDraft = await readFile(path.join(SUPERSESSION_DIR, "draft_supersession.txt"), "utf8");
  const f18Draft = JSON.parse(
    await readFile(path.join(DIAG_ROOT, "fixtures", "18_synth_cross_source_pair.json"), "utf8")
  ).draft;
  const f19Draft = JSON.parse(
    await readFile(path.join(DIAG_ROOT, "fixtures", "19_synth_annual_report.json"), "utf8")
  ).draft;
  const f22Draft = JSON.parse(await readFile(path.join(DIAG_ROOT, "fixtures", "22_alp_multisource.json"), "utf8"))
    .draft;

  const f18Sents = splitDraftIntoCandidatesV2(f18Draft).candidates;
  const f19Sents = splitDraftIntoCandidatesV2(f19Draft).candidates;
  const f22Sents = splitDraftIntoCandidatesV2(f22Draft).candidates;
  const cleanSents = splitDraftIntoCandidatesV2(nordholtClean).candidates;
  const dirtySents = splitDraftIntoCandidatesV2(nordholtDirty).candidates;
  const superSents = splitDraftIntoCandidatesV2(superDraft).candidates;

  const f18S5 = f18Sents.find((s) => s.includes("employs 142 people"));
  const f18S7 = f18Sents.find((s) => s.includes("ARR growth from EUR 38 million"));
  const f19S2 = f19Sents.find((s) => s.includes("SEK 18.4 billion"));
  const f19Full = (f19Draft.match(/The exit of NorTech Industries[\s\S]*?trajectory\./) || [""])[0].trim();
  const f22S2 = f22Sents.find((s) => s.includes("employs 210 staff"));
  const cleanS1 = cleanSents.find((s) => s.includes("employs 720 people"));
  const dirtyS2 = dirtySents.find((s) => s.includes("$155m"));
  const superS0 = superSents.find((s) => s.includes("EUR 200 million"));

  return [
    {
      id: "P1",
      statement: "ARR reached EUR 95 million.",
      source: b67Press,
      label: "b67-probe S6 x press release",
    },
    {
      id: "P2",
      statement: "ARR reached EUR 95 million.",
      source: b67Fact,
      label: "b67-probe S6 x fact sheet",
    },
    {
      id: "P3",
      statement: b72Draft,
      source: b72Src,
      label: "b72-probe",
    },
    {
      id: "P4",
      statement: f19S2,
      source: f19Sources[0]?.text || "",
      label: "F19 S2 x annual report (splitter fragment)",
    },
    {
      id: "P4-full",
      statement: f19Full,
      source: f19Sources[0]?.text || "",
      label: "F19 S2 x annual report (full sentence)",
    },
    {
      id: "P5",
      statement: "The EBITDA margin is approximately 19 per cent.",
      source: "Contracted revenue represents approximately 70 per cent of total revenue.",
      label: "B59 19 percent margin vs 70 percent contracted",
    },
    {
      id: "P6",
      statement: cleanS1,
      source: nordholtIc,
      label: "nordholt-clean S1 x IC memo",
    },
    {
      id: "P7",
      statement: f18S5,
      source: f18b?.text || "",
      label: "F18 S5 x 18b update",
    },
    {
      id: "P8",
      statement: f22S2,
      source: f22Sources[0]?.text || "",
      label: "F22 S2 x ALP update",
    },
    {
      id: "P9",
      statement: f18S7,
      source: f18b?.text || "",
      label: "F18 S7 x 18b update",
    },
    {
      id: "P10",
      statement: superS0,
      source: super2019,
      label: "supersession S0 x 2019 AR",
    },
    {
      id: "P11",
      statement: dirtyS2,
      source: nordholtPress,
      label: "nordholt-dirty S2 x press release",
    },
  ];
}

async function creditPing() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  try {
    const completion = await callLLM({
      provider: stageModel.provider,
      model: stageModel.model,
      temperature: 0,
      seed: STAGE2_SEED,
      responseFormat: "json",
      messages: [
        { role: "system", content: "Return only JSON." },
        { role: "user", content: 'Return {"ok": true}' },
      ],
      traceName: "d-metric-llm-2-credit-ping",
      spanName: "credit-ping",
    });
    return { ok: true, costUsd: calculateLlmCostUsd(stageModel.provider, stageModel.model, completion.usage) };
  } catch (err) {
    return { ok: false, exhausted: isCreditExhausted(err), err };
  }
}

async function runOne(systemPrompt, pair, runIndex, traceId) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const userPrompt = `Statement:\n${pair.statement}\n\nSource:\n${pair.source}`.trim();
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
    traceId,
    traceName: "d-metric-llm-2",
    spanName: "stage2-metric-name-probe",
    metadata: { pairId: pair.id, runIndex, sourceLabel: pair.label },
  });
  const parsed = safeJsonParse(completion?.text ?? "");
  const costUsd = calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage);
  return {
    statement_figure: fieldStr(parsed, "statement_figure"),
    statement_metric: fieldStr(parsed, "statement_metric"),
    source_figure: fieldStr(parsed, "source_figure"),
    source_metric: fieldStr(parsed, "source_metric"),
    classification: fieldStr(parsed, "classification"),
    costUsd,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const prompt = await readFile(PROBE_PROMPT_PATH, "utf8");
  if (!prompt.includes("statement_metric") || prompt.includes("figures_comparable")) {
    console.error("probe prompt must have the four naming fields and must not ask comparability");
    process.exit(1);
  }

  const pairs = await loadPairSources();
  for (const p of pairs) {
    if (!p.statement || !p.source) {
      console.error(`missing text for ${p.id}: statement=${Boolean(p.statement)} source=${Boolean(p.source)}`);
      process.exit(1);
    }
  }

  console.log("# D-METRIC-LLM-2 name-the-metrics");
  console.log(`pairs=${pairs.length} runsEach=${RUNS} seed=${STAGE2_SEED} temperature=0`);
  console.log("cache: forced off (live measurement)");

  console.log("credit ping...");
  const ping = await creditPing();
  if (!ping.ok) {
    if (ping.exhausted) {
      console.error("STOP: OpenAI credit_balance_exhausted. No live Stage 2 calls started.");
    } else {
      console.error("STOP: credit ping failed.", ping.err);
    }
    process.exit(1);
  }
  console.log(`credit ping ok costUsd=${ping.costUsd.toFixed(4)}`);

  const traceId = createTraceId();
  startTrace({
    traceId,
    traceName: "d-metric-llm-2",
    metadata: { pipelineRoute: "v4-diagnostic-only", runStartedAt: new Date().toISOString() },
  });
  console.log(`langfuseTrace=${traceId}`);

  let liveCostUsd = ping.costUsd;
  const results = [];

  for (const pair of pairs) {
    const runs = [];
    for (let i = 1; i <= RUNS; i++) {
      try {
        const row = await runOne(prompt, pair, i, traceId);
        liveCostUsd += row.costUsd;
        runs.push(row);
        console.log(
          `${pair.id} run${i} stmtFig=${JSON.stringify(row.statement_figure)} stmtMetric=${JSON.stringify(row.statement_metric)} srcFig=${JSON.stringify(row.source_figure)} srcMetric=${JSON.stringify(row.source_metric)} class=${row.classification} cost=${row.costUsd.toFixed(4)}`
        );
      } catch (err) {
        if (isCreditExhausted(err)) {
          console.error(`STOP: credits exhausted at ${pair.id} run${i}. liveCostUsd=${liveCostUsd.toFixed(4)}`);
          process.exit(1);
        }
        throw err;
      }
    }
    results.push({ pair, runs });
  }

  await flushObservability();

  console.log("");
  console.log("## Per-pair table");
  for (const row of results) {
    const { pair, runs } = row;
    console.log("");
    console.log(`${pair.id} ${pair.label}`);
    console.log(`  statement=${JSON.stringify(pair.statement)}`);
    runs.forEach((r, i) => {
      console.log(`  run${i + 1}:`);
      console.log(`    statement_figure=${JSON.stringify(r.statement_figure)}`);
      console.log(`    statement_metric=${JSON.stringify(r.statement_metric)}`);
      console.log(`    source_figure=${JSON.stringify(r.source_figure)}`);
      console.log(`    source_metric=${JSON.stringify(r.source_metric)}`);
      console.log(`    classification=${r.classification}`);
    });
    const stab = Object.fromEntries(FIELDS.map((k) => [k, fieldStable(runs, k) ? "yes" : "NO"]));
    console.log(`  stability=${JSON.stringify(stab)}`);
  }

  console.log("");
  console.log("## Field stability counts");
  for (const k of FIELDS) {
    const n = results.filter((r) => fieldStable(r.runs, k)).length;
    console.log(`  ${k} stable ${n}/${results.length}`);
  }

  console.log("");
  console.log("## P9 headline");
  const p9 = results.find((r) => r.pair.id === "P9");
  p9.runs.forEach((r, i) => {
    console.log(
      `  run${i + 1} statement_metric=${JSON.stringify(r.statement_metric)} source_metric=${JSON.stringify(r.source_metric)}`
    );
  });

  console.log("");
  console.log("## P4 vs P4-full statements");
  const p4 = results.find((r) => r.pair.id === "P4");
  const p4f = results.find((r) => r.pair.id === "P4-full");
  console.log(`  P4 statement=${JSON.stringify(p4.pair.statement)}`);
  console.log(`  P4-full statement=${JSON.stringify(p4f.pair.statement)}`);

  console.log("");
  console.log(`liveCostUsd=${liveCostUsd.toFixed(4)} langfuseTrace=${traceId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
