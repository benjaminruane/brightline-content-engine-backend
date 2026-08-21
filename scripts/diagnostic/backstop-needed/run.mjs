#!/usr/bin/env node
/**
 * D-BACKSTOP-NEEDED: live Stage 2 with cache off.
 * Production prompt unchanged. Magnitude backstop still runs in production
 * post-processing; this script reads preBackstopClassification and replays
 * period-gate-only so the model's own class is visible.
 *
 * Usage:
 *   node scripts/diagnostic/backstop-needed/run.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const TODAY = new Date("2026-08-21T00:00:00Z");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const B67_DIR = path.join(DIAG_ROOT, "b67-probe");
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(SCRIPT_DIR, "out");
const REPEATS = 3;
const MAX_LIVE_COST_USD = 8;

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const {
  matchAllSources,
  hasEgregiousMagnitudeGap,
  applyRoundingToleranceBackstop,
  applyPeriodGateBackstop,
  STAGE2_SEED,
} = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { callLLM, calculateLlmCostUsd, createTraceId, startTrace, flushObservability } =
  await import("../../../lib/observability.js");

const EIGHT = [
  {
    id: "nordholt-clean S1 x IC memo (720 vs 640 people)",
    label: "nordholt-clean",
    sourceIncludes: "IC memo",
    stmtIncludes: "720 people",
  },
  {
    id: "nordholt-dirty S1 x IC memo (800 vs 640)",
    label: "nordholt-dirty",
    sourceIncludes: "IC memo",
    stmtIncludes: "800 people",
  },
  {
    id: "b67-probe S1 x IC memo (800 vs 640)",
    label: "b67-probe",
    sourceIncludes: "IC memo",
    stmtIncludes: "800 people",
  },
  {
    id: "supersession S1 x 2019 AR (720 vs 640)",
    label: "supersession",
    sourceIncludes: "source_A_annual_report_2019",
    stmtIncludes: "720 people",
  },
  {
    id: "F18 S5 x 18b update (142 vs 167)",
    label: "F18",
    sourceIncludes: "18b_synth_cross_source_pair_update",
    stmtIncludes: "employs 142",
  },
  {
    id: "F22 S2 x ALP update (210 vs 240)",
    label: "F22",
    sourceIncludes: "ALP_update_memo",
    stmtIncludes: "employs 210",
  },
  {
    id: "F19 S2 x annual report (SEK 18.4bn vs 12.8bn proceeds)",
    label: "F19",
    sourceIncludes: "19_synth_annual_report",
    stmtIncludes: "18.4",
  },
  {
    id: "supersession S0 x 2019 AR (revenue 200 vs 100)",
    label: "supersession",
    sourceIncludes: "source_A_annual_report_2019",
    stmtIncludes: "200 million",
  },
];

const EXTRA_SEVEN = [
  {
    id: "nordholt-dirty S2 x press release ($155m vs EUR 155 million)",
    label: "nordholt-dirty",
    sourceIncludes: "press release",
    stmtIncludes: "$155m",
  },
  {
    id: "nordholt-dirty S2 x fact sheet ($155m vs EUR 155 million)",
    label: "nordholt-dirty",
    sourceIncludes: "fact sheet",
    stmtIncludes: "$155m",
  },
  {
    id: "b67-probe S2 x press release ($155m vs EUR 155 million)",
    label: "b67-probe",
    sourceIncludes: "press release",
    stmtIncludes: "$155m",
  },
  {
    id: "b67-probe S2 x fact sheet ($155m vs EUR 155 million)",
    label: "b67-probe",
    sourceIncludes: "fact sheet",
    stmtIncludes: "$155m",
  },
  {
    id: "b67-probe S6 x press release (ARR 95 vs combined revenue 155)",
    label: "b67-probe",
    sourceIncludes: "press release",
    stmtIncludes: "ARR reached",
  },
  {
    id: "b67-probe S6 x fact sheet (ARR 95 vs combined revenue 155)",
    label: "b67-probe",
    sourceIncludes: "fact sheet",
    stmtIncludes: "ARR reached",
  },
  {
    id: "F18 S7 x 18b update (ARR 38 vs 35)",
    label: "F18",
    sourceIncludes: "18b_synth_cross_source_pair_update",
    stmtIncludes: "ARR growth from EUR 38",
  },
];

const FORCED_15 = [...EIGHT, ...EXTRA_SEVEN];

function trunc(s, n = 160) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}...`;
}

function pairKey(label, statementIndex, sourceLabel) {
  return `${label}|S${statementIndex}|${sourceLabel}`;
}

function isCreditExhausted(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || err?.error?.code || "");
  return (
    code === "credit_balance_exhausted" ||
    /credit_balance_exhausted|no credits remaining|insufficient_quota/i.test(msg)
  );
}

function replayMagnitudeOff(statementText, match) {
  const pre = match.preBackstopClassification;
  return applyPeriodGateBackstop(
    {
      classification: pre,
      passage: typeof match.passage === "string" ? match.passage : "",
      explanation: typeof match.explanation === "string" ? match.explanation : "",
      periodAssessment: match.periodAssessment ?? null,
    },
    { statementText, sourceLabel: match.sourceLabel }
  );
}

function backstopRole(statementText, match) {
  const pre = match.preBackstopClassification;
  const passage = typeof match.passage === "string" ? match.passage : "";
  const explanation = typeof match.explanation === "string" ? match.explanation : "";
  const rounded = applyRoundingToleranceBackstop(
    { classification: pre, passage, explanation },
    { statementText }
  );
  const off = replayMagnitudeOff(statementText, match);
  const gapOn = hasEgregiousMagnitudeGap(statementText, passage);
  const onClass = match.classification;
  let role = "agrees";
  if (rounded.classification !== pre) {
    if (gapOn) role = pre === "conflicting" ? "redundant" : "overrides";
    else if (pre === "conflicting" && rounded.classification === "confirmed") role = "rounding_lift";
    else role = "other_backstop_change";
  } else if (gapOn && pre === "conflicting") {
    role = "redundant";
  }
  return {
    pre,
    offClass: off.classification,
    onClass,
    gapOn,
    roundedClass: rounded.classification,
    role,
  };
}

function findPair(rows, spec) {
  const matches = rows.filter(
    (r) =>
      r.label === spec.label &&
      String(r.sourceLabel || "").includes(spec.sourceIncludes) &&
      String(r.statement || "").includes(spec.stmtIncludes)
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const exact = matches.find((r) => r.sourceLabel === spec.sourceIncludes);
    return exact || matches[0];
  }
  return null;
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
  return { label: kind === "dirty" ? "nordholt-dirty" : "nordholt-clean", draft, sources };
}

async function loadB67Probe() {
  const draft = await readFile(path.join(B67_DIR, "draft_dirty.txt"), "utf8");
  const files = [
    ["source_ic_memo.txt", "IC memo"],
    ["source_press_release.txt", "press release"],
    ["source_fact_sheet.txt", "fact sheet"],
    ["source_lp_update.txt", "LP update"],
  ];
  const sources = [];
  for (const [name, label] of files) {
    const text = await readFile(path.join(B67_DIR, name), "utf8");
    sources.push({ text, label });
  }
  return { label: "b67-probe", draft, sources };
}

async function loadSupersessionFixture() {
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
  return { label: "supersession", draft, sources };
}

async function loadCorpus() {
  const out = [];
  for (const kind of ["clean", "dirty"]) {
    out.push(await loadNordholt(kind));
  }
  out.push(await loadB67Probe());
  out.push(await loadSupersessionFixture());
  const fixtures = await loadAllFixtures();
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    if (!Number.isFinite(n) || n < 1 || n > 23) continue;
    const draft = typeof fx.data.draft === "string" ? fx.data.draft : "";
    if (!draft.trim() || draft.trim() === "PLACEHOLDER") continue;
    const sources = await loadPipelineSources(fx.data.sources || []);
    if (!sources.length) continue;
    out.push({ label: `F${String(fx.data.id).padStart(2, "0")}`, draft, sources });
  }
  return out;
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
      traceName: "d-backstop-needed-credit-ping",
      spanName: "credit-ping",
    });
    return { ok: true, costUsd: calculateLlmCostUsd(stageModel.provider, stageModel.model, completion.usage) };
  } catch (err) {
    return { ok: false, exhausted: isCreditExhausted(err), err };
  }
}

function rowFromMatch(label, stmt, match, sourceText) {
  const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : Number(match.statementIndex) || 0;
  const statement = typeof stmt?.text === "string" ? stmt.text : "";
  const sourceLabel = match.sourceLabel || "";
  const role = backstopRole(statement, match);
  return {
    key: pairKey(label, statementIndex, sourceLabel),
    label,
    statementIndex,
    sourceLabel,
    statement,
    sourceText: typeof sourceText === "string" ? sourceText : "",
    passage: match.passage || "",
    explanation: match.explanation || "",
    preBackstopClassification: match.preBackstopClassification,
    offClass: role.offClass,
    onClass: role.onClass,
    roundedClass: role.roundedClass,
    gapOn: role.gapOn,
    role: role.role,
    schemaValid: match.schemaValid !== false,
    costUsd: Number(match.costUsd) || 0,
    periodAssessment: match.periodAssessment ?? null,
  };
}

async function writeSnapshot(dir, name, data) {
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  return filePath;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const origDebug = console.debug;
  console.debug = (...args) => {
    if (String(args[0] || "").startsWith("[stage2]") || String(args[0] || "").startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  console.log("# D-BACKSTOP-NEEDED");
  console.log(`seed=${STAGE2_SEED} temperature=0 cache=forced off`);
  console.log("credit ping...");
  const ping = await creditPing();
  if (!ping.ok) {
    if (ping.exhausted) {
      console.error("STOP: OpenAI credit_balance_exhausted. No live Stage 2 calls started.");
    } else {
      console.error(`STOP: credit ping failed. ${ping.err?.message || ping.err}`);
    }
    process.exit(1);
  }
  console.log(`credit ping ok costUsd=${Number(ping.costUsd || 0).toFixed(4)}`);

  const cases = await loadCorpus();
  console.log(`corpus cases (${cases.length}): ${cases.map((c) => c.label).join(", ")}`);

  const traceId = createTraceId();
  startTrace({
    traceId,
    traceName: "d-backstop-needed",
    metadata: { pipelineRoute: "v4", runStartedAt: new Date().toISOString() },
  });
  console.log(`langfuse trace=${traceId}`);

  let liveCostUsd = Number(ping.costUsd) || 0;
  const pairRows = [];
  const sourceByLabel = new Map();

  for (const caseRow of cases) {
    const { label, draft, sources } = caseRow;
    const srcMap = new Map(sources.map((s) => [s.label, s.text]));
    sourceByLabel.set(label, srcMap);
    let stage1;
    try {
      stage1 = await extractStatements({ draftText: draft, traceId });
    } catch (err) {
      if (isCreditExhausted(err)) {
        console.error("STOP: OpenAI credit_balance_exhausted during Stage 1.");
        process.exit(1);
      }
      throw err;
    }
    liveCostUsd += Number(stage1?.costUsd) || 0;
    const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
    let matched;
    try {
      matched = await matchAllSources({ statements, sources, traceId });
    } catch (err) {
      if (isCreditExhausted(err)) {
        console.error("STOP: OpenAI credit_balance_exhausted during Stage 2.");
        process.exit(1);
      }
      throw err;
    }
    const matches = Array.isArray(matched?.matches) ? matched.matches : [];
    for (const m of matches) liveCostUsd += Number(m?.costUsd) || 0;
    const exhaustedMatch = matches.find((m) =>
      isCreditExhausted({ message: String(m?.explanation || "") })
    );
    if (exhaustedMatch) {
      console.error("STOP: OpenAI credit_balance_exhausted during Stage 2.");
      process.exit(1);
    }
    if (liveCostUsd > MAX_LIVE_COST_USD) {
      console.error(`STOP: live costUsd=${liveCostUsd.toFixed(4)} exceeded ${MAX_LIVE_COST_USD}.`);
      process.exit(1);
    }
    console.log(
      `  ${label} statements=${statements.length} pairs=${matches.length} costUsd=${liveCostUsd.toFixed(4)}`
    );
    for (const stmt of statements) {
      const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : 0;
      const rowMatches = matches.filter((m) => Number(m.statementIndex) === statementIndex);
      for (const m of rowMatches) {
        pairRows.push(rowFromMatch(label, stmt, m, srcMap.get(m.sourceLabel)));
      }
    }
  }

  await writeSnapshot(SCRIPT_DIR, "corpus.json", {
    traceId,
    liveCostUsd,
    pairRows: pairRows.map(({ sourceText, ...rest }) => rest),
  });

  const differ = pairRows.filter((r) => r.offClass !== r.onClass);
  const unaidedConflict = pairRows.filter((r) => r.offClass === "conflicting" && r.gapOn !== true);
  const eightRows = EIGHT.map((spec) => ({ spec, row: findPair(pairRows, spec) }));
  const fifteenRows = FORCED_15.map((spec) => ({ spec, row: findPair(pairRows, spec) }));

  const repeatTargets = fifteenRows.map(({ spec, row }) => {
    if (!row) return { spec, row: null };
    return { spec, row };
  });

  console.log("");
  console.log(`## Repeats (${REPEATS}) on 15 forced pairs`);
  const repeatResults = [];
  for (let runIndex = 1; runIndex <= REPEATS; runIndex++) {
    const runRows = [];
    for (const { spec, row } of repeatTargets) {
      if (!row) {
        runRows.push({ specId: spec.id, missing: true });
        continue;
      }
      const statements = [{ index: row.statementIndex, text: row.statement }];
      const sources = [{ label: row.sourceLabel, text: row.sourceText }];
      let matched;
      try {
        matched = await matchAllSources({ statements, sources, traceId });
      } catch (err) {
        if (isCreditExhausted(err)) {
          console.error("STOP: OpenAI credit_balance_exhausted during repeats.");
          process.exit(1);
        }
        throw err;
      }
      const m = Array.isArray(matched?.matches) ? matched.matches[0] : null;
      if (m) liveCostUsd += Number(m.costUsd) || 0;
      if (liveCostUsd > MAX_LIVE_COST_USD) {
        console.error(`STOP: live costUsd=${liveCostUsd.toFixed(4)} exceeded ${MAX_LIVE_COST_USD}.`);
        process.exit(1);
      }
      const built = m ? rowFromMatch(row.label, statements[0], m, row.sourceText) : null;
      runRows.push({
        specId: spec.id,
        key: row.key,
        offClass: built?.offClass || null,
        pre: built?.preBackstopClassification || null,
        explanation: built?.explanation || "",
        costUsd: built?.costUsd || 0,
      });
    }
    repeatResults.push({ runIndex, rows: runRows });
    console.log(`  repeat ${runIndex} done costUsd=${liveCostUsd.toFixed(4)}`);
  }

  const stability = fifteenRows.map(({ spec, row }) => {
    const classes = repeatResults.map((run) => {
      const hit = run.rows.find((r) => r.specId === spec.id);
      return hit?.offClass || null;
    });
    const unique = [...new Set(classes.filter(Boolean))];
    const touchedConflicting = classes.some((c) => c === "conflicting") && classes.some((c) => c && c !== "conflicting");
    return {
      id: spec.id,
      key: row?.key || null,
      classes,
      stable: unique.length === 1,
      unique,
      conflictingDrift: touchedConflicting,
    };
  });

  const report = {
    specId: "D-BACKSTOP-NEEDED",
    traceId,
    liveCostUsd,
    pairCount: pairRows.length,
    differCount: differ.length,
    unaidedConflictCount: unaidedConflict.length,
    eight: eightRows.map(({ spec, row }) => ({
      id: spec.id,
      found: Boolean(row),
      key: row?.key || null,
      modelOff: row?.offClass || null,
      pre: row?.preBackstopClassification || null,
      onClass: row?.onClass || null,
      gapOn: row?.gapOn ?? null,
      role: row?.role || null,
      explanation: row?.explanation || null,
      statement: row?.statement || null,
    })),
    fifteen: fifteenRows.map(({ spec, row }) => ({
      id: spec.id,
      found: Boolean(row),
      key: row?.key || null,
      modelOff: row?.offClass || null,
      pre: row?.preBackstopClassification || null,
      onClass: row?.onClass || null,
      gapOn: row?.gapOn ?? null,
      role: row?.role || null,
      explanation: row?.explanation || null,
    })),
    differ: differ.map((r) => ({
      key: r.key,
      offClass: r.offClass,
      onClass: r.onClass,
      pre: r.preBackstopClassification,
      gapOn: r.gapOn,
      role: r.role,
    })),
    unaidedConflict: unaidedConflict.map((r) => ({
      key: r.key,
      offClass: r.offClass,
      onClass: r.onClass,
      statement: trunc(r.statement, 140),
    })),
    stability,
    today: TODAY.toISOString(),
  };

  const reportPath = await writeSnapshot(OUT_DIR, "report.json", report);

  console.log("");
  console.log("## a. Eight genuine conflicts (magnitude backstop off)");
  for (const row of report.eight) {
    if (!row.found) {
      console.log(`  MISSING ${row.id}`);
      continue;
    }
    console.log(
      `  ${row.id} | model=${row.modelOff} main=${row.onClass} gapOn=${row.gapOn ? "1" : "0"} role=${row.role}`
    );
    console.log(`    ${row.explanation}`);
  }

  console.log("");
  console.log("## b. Fifteen B60 forced pairs");
  for (const row of report.fifteen) {
    if (!row.found) {
      console.log(`  MISSING ${row.id}`);
      continue;
    }
    console.log(
      `  ${row.id} | model=${row.modelOff} main=${row.onClass} gapOn=${row.gapOn ? "1" : "0"} role=${row.role}`
    );
    console.log(`    ${row.explanation}`);
  }

  console.log("");
  console.log("## c. Stability across three repeats");
  const stableCount = stability.filter((s) => s.stable).length;
  console.log(`  stable ${stableCount}/${stability.length}`);
  for (const s of stability) {
    const flag = s.conflictingDrift ? " CONFLICTING-DRIFT" : "";
    console.log(`  ${s.stable ? "stable" : "DRIFT "} ${s.id} [${s.classes.join(", ")}]${flag}`);
  }

  console.log("");
  console.log("## d. Whole corpus comparison");
  console.log(`  pairs=${pairRows.length} differ off-vs-on=${differ.length}`);
  for (const r of differ) {
    console.log(`  ${r.key} ${r.offClass} -> ${r.onClass} gapOn=${r.gapOn ? "1" : "0"} role=${r.role}`);
  }

  console.log("");
  console.log("## e. Unaided conflicting (model conflicting, backstop gap not on)");
  console.log(`  count=${unaidedConflict.length}`);
  for (const r of unaidedConflict) {
    console.log(`  ${r.key} ${r.offClass} (main ${r.onClass}) | ${r.statement}`);
  }

  console.log("");
  console.log("## g. Cost");
  console.log(`  liveCostUsd=${liveCostUsd.toFixed(4)} trace=${traceId}`);
  console.log(`  report=${reportPath}`);

  await flushObservability();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
