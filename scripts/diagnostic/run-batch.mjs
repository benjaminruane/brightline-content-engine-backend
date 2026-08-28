#!/usr/bin/env node
/**
 * D1.1 — In-process v4 QC diagnostic batch runner (fixtures → runs/).
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { loadLocalEnvFiles } from "./lib/env.mjs";
import {
  batchFixturesInFives,
  filterFixtures,
  fixtureRunDirName,
  loadAllFixtures,
} from "./lib/fixtures.mjs";
import {
  collectFingerprintsDeep,
  fingerprintBanner,
  loadFingerprintManifest,
} from "./lib/fingerprint-manifest.mjs";
import { langfuseTraceUrl } from "./lib/langfuse-url.mjs";
import { RUNS_DIR } from "./lib/paths.mjs";
import { startPipelineLogCapture } from "./lib/pipeline-log-capture.mjs";
import { copySourcesToRunDir, loadPipelineSources } from "./lib/sources.mjs";
import { countVerdictMix, formatVerdictMix, statementCount } from "./lib/verdict-mix.mjs";

const PLACEHOLDER_DRAFT = "PLACEHOLDER";

let createTraceId;
let flushObservability;
let startTrace;
let updateTraceMetadata;
let runPipelineV4;

function parseArgs(argv) {
  const opts = { only: null, range: null, noConfirm: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-confirm") {
      opts.noConfirm = true;
      continue;
    }
    if (arg === "--only" && argv[i + 1]) {
      opts.only = argv[++i];
      continue;
    }
    if (arg === "--range" && argv[i + 1]) {
      const rangeArg = argv[++i];
      const m = String(rangeArg).match(/^(\d{1,2})-(\d{1,2})$/);
      if (!m) throw new Error(`Invalid --range (use NN-MM): ${rangeArg}`);
      opts.range = { from: m[1], to: m[2] };
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function runTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function normalizeRequiredVersion(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "public" ? "public" : "complete";
}

function buildPipelineOptions(fixture, traceId) {
  const cfg = fixture.data?.config && typeof fixture.data.config === "object" ? fixture.data.config : {};
  const options = {
    traceId,
    pipelineRoute: "v4",
    requiredVersion: normalizeRequiredVersion(cfg.requiredVersion),
  };
  if (typeof cfg.outputType === "string" && cfg.outputType.trim()) {
    options.outputType = cfg.outputType.trim();
  }
  if (typeof cfg.eventType === "string" && cfg.eventType.trim()) {
    options.eventType = cfg.eventType.trim();
  }
  if (cfg.evidenceEnabled === false) options.evidenceEnabled = false;
  if (cfg.editorialEnabled === false) options.editorialEnabled = false;
  if (cfg.complianceEnabled === false) options.complianceEnabled = false;
  return options;
}

/**
 * @param {string} question
 */
function askConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * @param {object} fixture
 * @param {string} runRoot
 */
async function runOneFixture(fixture, runRoot) {
  const id = String(fixture.data.id).padStart(2, "0");
  const label = fixture.data.label ?? "fixture";
  const draft = typeof fixture.data.draft === "string" ? fixture.data.draft : "";

  if (draft.trim() === PLACEHOLDER_DRAFT) {
    console.log(`skipped: draft not yet supplied — fixture ${id}: ${label}`);
    return {
      id,
      label,
      skipped: true,
      skipReason: "draft not yet supplied",
    };
  }

  const sourceFiles = Array.isArray(fixture.data.sources) ? fixture.data.sources : [];
  if (sourceFiles.length === 0) {
    console.log(`skipped: no sources listed — fixture ${id}: ${label}`);
    return {
      id,
      label,
      skipped: true,
      skipReason: "no sources",
    };
  }

  console.log(`starting fixture ${id}: ${label}`);
  const startedAt = Date.now();
  const traceId = createTraceId();
  startTrace({
    traceId,
    traceName: "qc-diag-run",
    metadata: {
      outputType: fixture.data?.config?.outputType,
      requiredVersion: normalizeRequiredVersion(fixture.data?.config?.requiredVersion),
      runStartedAt: new Date(startedAt).toISOString(),
      pipelineRoute: "v4",
    },
  });

  const outDir = path.join(runRoot, fixtureRunDirName(fixture));
  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(outDir, "sources"), { recursive: true });

  let pipelineResult = null;
  let error = null;
  let stack = null;
  let pipelineLog = "";

  try {
    const pipelineSources = await loadPipelineSources(sourceFiles);
    const options = buildPipelineOptions(fixture, traceId);
    updateTraceMetadata(traceId, {
      sourceCount: pipelineSources.length,
      sourceLabels: pipelineSources.map((s) => s.label),
      draftCharCount: draft.length,
    });
    const logCapture = startPipelineLogCapture();
    try {
      pipelineResult = await runPipelineV4(draft, pipelineSources, options);
    } finally {
      logCapture.stop();
      pipelineLog = logCapture.getText();
    }
    updateTraceMetadata(traceId, { statementCount: statementCount(pipelineResult) });
  } catch (err) {
    error = err?.message ? String(err.message) : String(err);
    stack = err?.stack ? String(err.stack) : null;
  } finally {
    await flushObservability();
  }

  const endedAt = Date.now();
  const durationMs = endedAt - startedAt;
  const mix = pipelineResult ? countVerdictMix(pipelineResult) : null;
  const stmtCount = pipelineResult ? statementCount(pipelineResult) : 0;
  const traceUrl = langfuseTraceUrl(traceId);

  await writeFile(path.join(outDir, "pipeline.log"), pipelineLog, "utf8");
  await writeFile(path.join(outDir, "draft.txt"), draft, "utf8");
  await copySourcesToRunDir(path.join(outDir, "sources"), sourceFiles);

  const resultPayload = {
    fixtureId: id,
    label,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationMs,
    traceId,
    langfuseTraceUrl: traceUrl,
    config: fixture.data.config ?? {},
    sourceFiles,
    pipelineRoute: "v4",
    error,
    stack,
    verdictMix: mix,
    statementCount: stmtCount,
    pipelineResult,
  };
  await writeFile(path.join(outDir, "result.json"), `${JSON.stringify(resultPayload, null, 2)}\n`, "utf8");

  if (error) {
    console.log(
      `fixture ${id} ERROR (${durationMs}ms) — ${error}${traceUrl ? ` | trace ${traceUrl}` : ""}`
    );
  } else {
    console.log(
      `fixture ${id} done (${durationMs}ms) statements=${stmtCount} ${formatVerdictMix(mix)}${traceUrl ? ` | trace ${traceUrl}` : ""}`
    );
  }

  return {
    id,
    label,
    skipped: false,
    durationMs,
    statementCount: stmtCount,
    verdictMix: mix,
    traceId,
    langfuseTraceUrl: traceUrl,
    error,
    outDir,
    stage2Fingerprints: collectFingerprintsDeep(pipelineResult),
  };
}

function batchLabel(batch, batchIndex, totalBatches) {
  const ids = batch.map((f) => String(f.data.id).padStart(2, "0"));
  const first = ids[0];
  const last = ids[ids.length - 1];
  return { first, last, batchIndex, totalBatches, range: `${first}–${last}` };
}

async function writeIndex(runRoot, runMeta, entries) {
  const runFingerprints = [
    ...new Set(entries.flatMap((e) => (Array.isArray(e.stage2Fingerprints) ? e.stage2Fingerprints : []))),
  ].sort();
  const banner = fingerprintBanner({
    runFingerprints,
    manifest: await loadFingerprintManifest(),
  });

  const lines = [
    ...(banner ? [banner] : []),
    `# Diagnostic run ${runMeta.timestamp}`,
    "",
    `Started: ${runMeta.startedAt}`,
    `Finished: ${runMeta.finishedAt}`,
    `Aborted: ${runMeta.aborted ? "yes" : "no"}`,
    `Stage 2 fingerprints: ${runFingerprints.length ? runFingerprints.join(", ") : "none recorded"}`,
    "",
    "| Fixture | Label | Status | Duration (ms) | Statements | Verdict mix | Langfuse | Error |",
    "|---------|-------|--------|---------------|------------|-------------|----------|-------|",
  ];

  for (const e of entries) {
    if (e.skipped) {
      lines.push(
        `| ${e.id} | ${e.label} | skipped (${e.skipReason ?? "—"}) | — | — | — | — | — |`
      );
      continue;
    }
    const mix = e.verdictMix ? formatVerdictMix(e.verdictMix) : "—";
    const trace = e.langfuseTraceUrl ? `[trace](${e.langfuseTraceUrl})` : "—";
    const status = e.error ? "error" : "ok";
    lines.push(
      `| ${e.id} | ${e.label} | ${status} | ${e.durationMs ?? "—"} | ${e.statementCount ?? "—"} | ${mix} | ${trace} | ${e.error ? String(e.error).replace(/\|/g, "\\|") : "—"} |`
    );
  }

  lines.push("");
  await writeFile(path.join(runRoot, "INDEX.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  loadLocalEnvFiles();
  process.env.QC_PIPELINE_V4 = process.env.QC_PIPELINE_V4 || "1";
  process.env.BRIGHTLINE_EDITORIAL_REVIEW = process.env.BRIGHTLINE_EDITORIAL_REVIEW || "1";

  ({
    createTraceId,
    flushObservability,
    startTrace,
    updateTraceMetadata,
  } = await import("../../lib/observability.js"));
  ({ runPipelineV4 } = await import("../../lib/qc/pipeline-v4/index.mjs"));

  const opts = parseArgs(process.argv);
  const isTty = Boolean(process.stdin.isTTY);
  if (!isTty && !opts.noConfirm) {
    console.error("[run-batch] stdin is not a TTY — re-run with --no-confirm or use an interactive terminal.");
    process.exit(1);
  }

  const all = await loadAllFixtures();
  const selected = filterFixtures(all, { only: opts.only, range: opts.range });
  if (selected.length === 0) {
    console.error("[run-batch] no fixtures matched the filter.");
    process.exit(1);
  }

  const batches = batchFixturesInFives(selected);
  const timestamp = runTimestamp();
  const runRoot = path.join(RUNS_DIR, timestamp);
  await mkdir(runRoot, { recursive: true });

  const runStarted = new Date().toISOString();
  const entries = [];
  let aborted = false;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const { first, last, batchIndex, totalBatches, range } = batchLabel(batch, b, batches.length);

    for (const fixture of batch) {
      const entry = await runOneFixture(fixture, runRoot);
      entries.push(entry);
    }

    console.log(`BATCH ${batchIndex + 1} OF ${totalBatches} COMPLETE — review and confirm to continue`);

    if (b < batches.length - 1) {
      if (opts.noConfirm) {
        continue;
      }
      const answer = await askConfirm(`Completed fixtures ${range}. Continue with next batch? (y/n) `);
      if (answer !== "y") {
        console.log("[run-batch] aborted by user.");
        aborted = true;
        break;
      }
    }
  }

  await writeIndex(runRoot, {
    timestamp,
    startedAt: runStarted,
    finishedAt: new Date().toISOString(),
    aborted,
  }, entries);

  console.log(`RUN COMPLETE — output at runs/${timestamp}/`);
  if (aborted) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("[run-batch] fatal:", err?.message || err);
  process.exit(1);
});
