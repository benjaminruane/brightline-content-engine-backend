#!/usr/bin/env node
/**
 * Pr9 marker-note vs revised-span consistency measurement.
 *
 * Live rewrite (the thing being measured): cache OFF.
 * Concerns are already on the Pr9 fixture cards; no QC pipeline call.
 *
 * Usage:
 *   node scripts/diagnostic/pr9-marker-consistency.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnvFiles } from "./lib/env.mjs";
import { RUNS_DIR } from "./lib/paths.mjs";
import { PR9_FIXTURES } from "./pr9-fixtures.mjs";
import {
  classifyMarker,
  emptyTally,
  addToTally,
  targetFigureDisposition,
  OUTCOME_CORRECT_CHANGE,
  OUTCOME_CORRECT_KEEP,
  OUTCOME_DEFECT,
  OUTCOME_WRONG_KEEP_ON_CHANGE,
  OUTCOME_AMBIGUOUS,
} from "./lib/pr9-marker-consistency.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, flushObservability, hasProviderApiKey, calculateLlmCostUsd } = await import(
  "../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../lib/qc/model-config.mjs");
const {
  gatherConcerns,
  buildPublicationMap,
  buildRevisionPrompt,
  finalizeSuggestRevisionText,
} = await import("../../lib/build-revision-prompt.mjs");

const modelConfig = STAGE_MODELS["writing-rewrite"];
if (!hasProviderApiKey(modelConfig.provider)) {
  console.error(`[pr9-marker-consistency] Missing API key for provider ${modelConfig.provider}`);
  process.exit(1);
}

function stripCodeFence(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  const fence = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = trimmed.match(fence);
  return match ? match[1].trim() : trimmed;
}

function estimateTokensFromChars(charCount) {
  return Math.ceil(Number(charCount) / 4);
}

function costUsdFromUsage(model, usage) {
  const direct = calculateLlmCostUsd(modelConfig.provider, model, usage);
  if (direct > 0) return direct;
  return calculateLlmCostUsd(modelConfig.provider, "gpt-5", usage);
}

function frac(n, d) {
  if (!d) return "0/0";
  const pct = ((n / d) * 100).toFixed(1);
  return `${n}/${d} (${pct}%)`;
}

function clusterKey(row) {
  const kinds = Array.isArray(row.findingKinds) && row.findingKinds.length > 0
    ? row.findingKinds.join("+")
    : "unmatched";
  const silent = row.sourceSilent ? "source_silent" : "source_has_value_or_n/a";
  return `${kinds} | ${silent}`;
}

function expandJobs(fixtures) {
  const jobs = [];
  for (const fixture of fixtures) {
    const repeats =
      Number.isFinite(fixture.repeats) && fixture.repeats > 0 ? Math.floor(fixture.repeats) : 1;
    for (let runIndex = 1; runIndex <= repeats; runIndex++) {
      jobs.push({ fixture, runIndex, repeats });
    }
  }
  return jobs;
}

async function runFixture(fixture, runIndex = 1) {
  const publicationMap = buildPublicationMap(fixture.sources);
  const concerns = gatherConcerns(fixture.statements, publicationMap);
  const prompt = buildRevisionPrompt(fixture.draftText, concerns, {
    outputType: fixture.outputType,
    requiredVersion: fixture.requiredVersion,
  });

  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
    traceName: "pr9-marker-consistency",
    spanName: "pr9-marker-consistency",
    metadata: {
      route: "pr9-marker-consistency",
      fixture: fixture.id,
      runIndex,
      concernCount: concerns.length,
    },
  });

  const raw = stripCodeFence(typeof completion?.text === "string" ? completion.text : "");
  const usage = completion?.usage || { inputTokens: 0, outputTokens: 0 };
  const costUsd = costUsdFromUsage(modelConfig.model, usage);

  if (!raw.trim()) {
    return {
      ok: false,
      fixtureId: fixture.id,
      label: fixture.label,
      cohort: fixture.cohort || "baseline",
      runIndex,
      error: "empty completion",
      promptChars: prompt.length,
      usage,
      costUsd,
      concerns,
      markers: [],
      classified: [],
      figureDisposition: targetFigureDisposition("", fixture.targetFigure),
      revisedDraft: "",
      draftText: fixture.draftText,
    };
  }

  const { revisedDraft, markers } = finalizeSuggestRevisionText(raw);
  const classified = markers.map((m) =>
    classifyMarker(fixture.draftText, revisedDraft, m, concerns)
  );

  return {
    ok: true,
    fixtureId: fixture.id,
    label: fixture.label,
    cohort: fixture.cohort || "baseline",
    runIndex,
    draftText: fixture.draftText,
    revisedDraft,
    raw,
    promptChars: prompt.length,
    usage,
    costUsd,
    concerns,
    markers,
    classified,
    figureLabel: fixture.targetFigure?.label || null,
    figureDisposition: targetFigureDisposition(revisedDraft, fixture.targetFigure),
  };
}

function printEstimate(jobs) {
  let promptChars = 0;
  for (const job of jobs) {
    const fixture = job.fixture;
    const publicationMap = buildPublicationMap(fixture.sources);
    const concerns = gatherConcerns(fixture.statements, publicationMap);
    const prompt = buildRevisionPrompt(fixture.draftText, concerns, {
      outputType: fixture.outputType,
      requiredVersion: fixture.requiredVersion,
    });
    promptChars += prompt.length;
  }
  const inputTok = estimateTokensFromChars(promptChars);
  // Last live run (6 calls) used ~78 output tokens each. High band 500/call.
  const outputTokLow = jobs.length * 80;
  const outputTokHigh = jobs.length * 500;
  const inRate = 1.25 / 1_000_000;
  const outRate = 10.0 / 1_000_000;
  const low = inputTok * inRate + outputTokLow * outRate;
  const high = inputTok * inRate + outputTokHigh * outRate;
  console.log("[pr9-marker-consistency] COST ESTIMATE (before live calls)");
  console.log(`  jobs: ${jobs.length} (fixture-runs, including repeats)`);
  console.log(`  model: ${modelConfig.provider}/${modelConfig.model} temp=0 (rewrites not cached)`);
  console.log(`  prompt chars (all jobs): ${promptChars} (~${inputTok} input tokens at chars/4)`);
  console.log(`  expected output: ~${outputTokLow}-${outputTokHigh} tokens`);
  console.log(`  expected cost: $${low.toFixed(2)}-$${high.toFixed(2)} using gpt-5 list rates`);
  console.log("  expected wall clock: 1-4 minutes sequential");
  if (high > 1) {
    console.log("  STOP: high estimate exceeds $1.00");
    return { low, high, proceed: false };
  }
  console.log("  cap: proceed because high estimate is under $1.00");
  return { low, high, proceed: true };
}

function printNewFixtureRuns(results) {
  const newRuns = results.filter((r) => r.cohort === "silent_unsupported");
  console.log("\n========== NEW FIXTURES: PER-RUN MARKERS ==========\n");
  if (newRuns.length === 0) {
    console.log("(none)");
    return;
  }

  const byId = Object.create(null);
  for (const result of newRuns) {
    byId[result.fixtureId] = byId[result.fixtureId] || [];
    byId[result.fixtureId].push(result);
  }

  for (const fixtureId of Object.keys(byId).sort()) {
    const runs = byId[fixtureId].sort((a, b) => a.runIndex - b.runIndex);
    const dispositions = runs.map((r) => r.figureDisposition).filter(Boolean);
    const uniqueDisp = [...new Set(dispositions)];
    const vary = uniqueDisp.length > 1 ? "varies" : uniqueDisp[0] || "n/a";
    const label = runs[0]?.label || fixtureId;
    const figureLabel = runs[0]?.figureLabel || "(no target figure)";
    console.log(`### ${fixtureId} ${label}`);
    console.log(`target figure: ${figureLabel}`);
    console.log(`keep/drop across runs: ${dispositions.join(", ")} => ${vary}`);
    console.log("");
    for (const result of runs) {
      console.log(`-- run ${result.runIndex}/${runs.length} ok=${result.ok} figure=${result.figureDisposition} --`);
      if (!result.ok) {
        console.log(`error: ${result.error}`);
        console.log("");
        continue;
      }
      console.log("ORIGINAL:");
      console.log(result.draftText);
      console.log("REVISED DRAFT:");
      console.log(result.revisedDraft);
      if (!result.classified.length) {
        console.log("MARKERS: (none)");
        console.log("");
        continue;
      }
      for (let i = 0; i < result.classified.length; i++) {
        const row = result.classified[i];
        console.log(`MARKER ${i + 1} outcome=${row.outcome} spanStatus=${row.spanStatus} noteClaim=${row.noteClaim}`);
        console.log("ORIGINAL STATEMENT:");
        console.log(row.statementText || result.draftText);
        console.log("REVISED SPAN:");
        console.log(row.span);
        console.log("NOTE:");
        console.log(row.note);
      }
      console.log("");
    }
  }
}

function printSilentUnsupportedRate(results) {
  const newRuns = results.filter((r) => r.cohort === "silent_unsupported" && r.ok);
  if (newRuns.length === 0) return;
  let runsWithDefect = 0;
  const perFixture = Object.create(null);
  for (const result of newRuns) {
    const hasDefect = result.classified.some((row) => row.outcome === OUTCOME_DEFECT);
    if (hasDefect) runsWithDefect += 1;
    const slot = (perFixture[result.fixtureId] = perFixture[result.fixtureId] || {
      runs: 0,
      defectRuns: 0,
      dispositions: [],
    });
    slot.runs += 1;
    if (hasDefect) slot.defectRuns += 1;
    if (result.figureDisposition) slot.dispositions.push(result.figureDisposition);
  }
  console.log("========== SILENT-UNSUPPORTED DEFECT RATE ==========\n");
  console.log(`new-fixture runs with at least one defect: ${frac(runsWithDefect, newRuns.length)}`);
  for (const id of Object.keys(perFixture).sort()) {
    const slot = perFixture[id];
    const unique = [...new Set(slot.dispositions)];
    const vary = unique.length > 1 ? "varies" : unique[0] || "n/a";
    console.log(
      `${id}: defect runs ${frac(slot.defectRuns, slot.runs)}; figure ${slot.dispositions.join("/")} (${vary})`
    );
  }
  console.log("");
}

function printReport(results) {
  printNewFixtureRuns(results);
  printSilentUnsupportedRate(results);

  const tally = emptyTally();
  const defects = [];
  const wrongKeeps = [];
  const ambiguous = [];
  const cluster = Object.create(null);
  let fixturesWithDefect = 0;
  let fixturesOk = 0;
  let totalCost = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const result of results) {
    totalCost += Number(result.costUsd) || 0;
    inputTokens += Number(result.usage?.inputTokens) || 0;
    outputTokens += Number(result.usage?.outputTokens) || 0;
    if (!result.ok) continue;
    fixturesOk += 1;
    let fixtureHadDefect = false;
    for (const row of result.classified) {
      addToTally(tally, row.outcome);
      const key = clusterKey(row);
      cluster[key] = cluster[key] || {
        total: 0,
        [OUTCOME_DEFECT]: 0,
        [OUTCOME_WRONG_KEEP_ON_CHANGE]: 0,
        [OUTCOME_AMBIGUOUS]: 0,
        [OUTCOME_CORRECT_CHANGE]: 0,
        [OUTCOME_CORRECT_KEEP]: 0,
      };
      cluster[key].total += 1;
      cluster[key][row.outcome] += 1;
      const packed = {
        fixtureId: result.fixtureId,
        label: result.label,
        runIndex: result.runIndex,
        figureDisposition: result.figureDisposition,
        ...row,
      };
      if (row.outcome === OUTCOME_DEFECT) {
        defects.push(packed);
        fixtureHadDefect = true;
      } else if (row.outcome === OUTCOME_WRONG_KEEP_ON_CHANGE) {
        wrongKeeps.push(packed);
      } else if (row.outcome === OUTCOME_AMBIGUOUS) {
        ambiguous.push(packed);
      }
    }
    if (fixtureHadDefect) fixturesWithDefect += 1;
  }

  const nFix = results.length;
  const nMark = tally.markers;

  console.log("\n========== CROSS-TAB ==========\n");
  console.log(`fixtures run: ${nFix}  ok: ${fixturesOk}`);
  console.log(`markers: ${nMark}`);
  console.log(
    `changed span + claims a change (correct):           ${frac(tally[OUTCOME_CORRECT_CHANGE], nMark)}`
  );
  console.log(
    `unchanged span + claims no change (keep-and-flag):  ${frac(tally[OUTCOME_CORRECT_KEEP], nMark)}`
  );
  console.log(
    `unchanged span + CLAIMS A CHANGE (DEFECT):          ${frac(tally[OUTCOME_DEFECT], nMark)}`
  );
  console.log(
    `changed span + claims no change (also wrong):       ${frac(tally[OUTCOME_WRONG_KEEP_ON_CHANGE], nMark)}`
  );
  console.log(
    `ambiguous (either span status):                     ${frac(tally[OUTCOME_AMBIGUOUS], nMark)}`
  );
  console.log(
    `fixtures with at least one defect:                  ${frac(fixturesWithDefect, nFix)}`
  );
  console.log(`usage: input=${inputTokens} output=${outputTokens} billedCost~$${totalCost.toFixed(4)}`);

  console.log("\n========== DEFECT INSTANCES (unchanged span, note claims a change) ==========\n");
  if (defects.length === 0) {
    console.log("(none)");
  } else {
    for (const d of defects) {
      console.log(`--- ${d.fixtureId} run ${d.runIndex} ${d.label} statement[${d.statementIndex}] ---`);
      console.log(`findingKinds: ${d.findingKinds.join(", ") || "(none)"}`);
      console.log(`evidenceKind: ${d.evidenceKind || "(none)"}  sourceSilent: ${d.sourceSilent}`);
      console.log(`spanExactInOriginal: ${d.spanExactInOriginal}`);
      console.log("ORIGINAL STATEMENT:");
      console.log(d.statementText || "(unmatched)");
      console.log("REVISED SPAN:");
      console.log(d.span);
      console.log("NOTE:");
      console.log(d.note);
      console.log("");
    }
  }

  console.log("========== ALSO WRONG (changed span, note claims no change) ==========\n");
  if (wrongKeeps.length === 0) {
    console.log("(none)");
  } else {
    for (const d of wrongKeeps) {
      console.log(`--- ${d.fixtureId} statement[${d.statementIndex}] ---`);
      console.log(`findingKinds: ${d.findingKinds.join(", ") || "(none)"} sourceSilent: ${d.sourceSilent}`);
      console.log(`span: ${d.span}`);
      console.log(`note: ${d.note}`);
      console.log("");
    }
  }

  console.log("========== AMBIGUOUS ==========\n");
  if (ambiguous.length === 0) {
    console.log("(none)");
  } else {
    for (const d of ambiguous) {
      console.log(`--- ${d.fixtureId} statement[${d.statementIndex}] spanStatus=${d.spanStatus} ---`);
      console.log(`findingKinds: ${d.findingKinds.join(", ") || "(none)"} sourceSilent: ${d.sourceSilent}`);
      console.log(`span: ${d.span}`);
      console.log(`note: ${d.note}`);
      console.log("");
    }
  }

  console.log("========== CLUSTER BY FINDING TYPE ==========\n");
  const clusterKeys = Object.keys(cluster).sort();
  for (const key of clusterKeys) {
    const c = cluster[key];
    console.log(key);
    console.log(
      `  n=${c.total} defect=${c[OUTCOME_DEFECT]} wrongKeep=${c[OUTCOME_WRONG_KEEP_ON_CHANGE]} ambiguous=${c[OUTCOME_AMBIGUOUS]} correctChange=${c[OUTCOME_CORRECT_CHANGE]} correctKeep=${c[OUTCOME_CORRECT_KEEP]}`
    );
  }

  const silentDefects = defects.filter((d) => d.sourceSilent);
  const evidenceGapDefects = defects.filter((d) => String(d.evidenceKind || "").length > 0);
  console.log("\n========== SOURCE-SILENT CONCENTRATION ==========\n");
  console.log(`defects on source-silent evidence gaps: ${silentDefects.length}/${defects.length}`);
  console.log(`defects with any evidence kind: ${evidenceGapDefects.length}/${defects.length}`);

  return {
    tally,
    fixturesWithDefect,
    fixtureCount: nFix,
    defects,
    wrongKeeps,
    ambiguous,
    cluster,
    totalCost,
    inputTokens,
    outputTokens,
  };
}

const fixtures = PR9_FIXTURES;
const jobs = expandJobs(fixtures);
const estimate = printEstimate(jobs);
if (!estimate.proceed) {
  process.exit(2);
}

const results = [];
try {
  for (const job of jobs) {
    const { fixture, runIndex, repeats } = job;
    console.log(
      `\n[pr9-marker-consistency] running ${fixture.id} run ${runIndex}/${repeats} ${fixture.label}`
    );
    const result = await runFixture(fixture, runIndex);
    results.push(result);
    if (!result.ok) {
      console.error(`[pr9-marker-consistency] FAIL ${fixture.id} run ${runIndex}: ${result.error}`);
    } else {
      console.log(
        `[pr9-marker-consistency] ${fixture.id}#${runIndex} markers=${result.classified.length} figure=${result.figureDisposition} cost~$${Number(result.costUsd).toFixed(4)}`
      );
    }
  }
} finally {
  await flushObservability();
}

const summary = printReport(results);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(RUNS_DIR, `pr9-marker-consistency-${stamp}`);
await mkdir(outDir, { recursive: true });
const payload = {
  generatedAt: new Date().toISOString(),
  model: `${modelConfig.provider}/${modelConfig.model}`,
  summary,
  results: results.map((r) => ({
    ok: r.ok,
    fixtureId: r.fixtureId,
    label: r.label,
    cohort: r.cohort,
    runIndex: r.runIndex,
    error: r.error || null,
    draftText: r.draftText,
    revisedDraft: r.revisedDraft,
    figureLabel: r.figureLabel || null,
    figureDisposition: r.figureDisposition,
    usage: r.usage,
    costUsd: r.costUsd,
    classified: r.classified,
  })),
};
await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`\n[pr9-marker-consistency] wrote ${path.join(outDir, "report.json")}`);

if (results.some((r) => !r.ok)) {
  process.exit(1);
}
