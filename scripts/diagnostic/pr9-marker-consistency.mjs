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

async function runFixture(fixture) {
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
      error: "empty completion",
      promptChars: prompt.length,
      usage,
      costUsd,
      concerns,
      markers: [],
      classified: [],
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
    draftText: fixture.draftText,
    revisedDraft,
    raw,
    promptChars: prompt.length,
    usage,
    costUsd,
    concerns,
    markers,
    classified,
  };
}

function printEstimate(fixtures) {
  let promptChars = 0;
  for (const fixture of fixtures) {
    const publicationMap = buildPublicationMap(fixture.sources);
    const concerns = gatherConcerns(fixture.statements, publicationMap);
    const prompt = buildRevisionPrompt(fixture.draftText, concerns, {
      outputType: fixture.outputType,
      requiredVersion: fixture.requiredVersion,
    });
    promptChars += prompt.length;
  }
  const inputTok = estimateTokensFromChars(promptChars);
  const outputTokLow = fixtures.length * 400;
  const outputTokHigh = fixtures.length * 8000;
  const inRate = 1.25 / 1_000_000;
  const outRate = 10.0 / 1_000_000;
  const low = inputTok * inRate + outputTokLow * outRate;
  const high = inputTok * inRate + outputTokHigh * outRate;
  console.log("[pr9-marker-consistency] COST ESTIMATE (before live calls)");
  console.log(`  fixtures: ${fixtures.length}`);
  console.log(`  model: ${modelConfig.provider}/${modelConfig.model} temp=0 (rewrites not cached)`);
  console.log(`  prompt chars (all): ${promptChars} (~${inputTok} input tokens at chars/4)`);
  console.log(`  expected output: ~${outputTokLow}-${outputTokHigh} tokens (gpt-5.1 reasoning band)`);
  console.log(`  expected cost: $${low.toFixed(2)}-$${high.toFixed(2)} using gpt-5 list rates`);
  console.log("  expected wall clock: 2-6 minutes sequential");
  console.log("  cap: proceed because high estimate is under $1.00");
  return { low, high };
}

function printReport(results) {
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
      const packed = { fixtureId: result.fixtureId, label: result.label, ...row };
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
      console.log(`--- ${d.fixtureId} ${d.label} statement[${d.statementIndex}] ---`);
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
printEstimate(fixtures);

const results = [];
try {
  for (const fixture of fixtures) {
    console.log(`\n[pr9-marker-consistency] running ${fixture.id} ${fixture.label}`);
    const result = await runFixture(fixture);
    results.push(result);
    if (!result.ok) {
      console.error(`[pr9-marker-consistency] FAIL ${fixture.id}: ${result.error}`);
    } else {
      console.log(
        `[pr9-marker-consistency] ${fixture.id} markers=${result.classified.length} cost~$${Number(result.costUsd).toFixed(4)}`
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
    error: r.error || null,
    draftText: r.draftText,
    revisedDraft: r.revisedDraft,
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
