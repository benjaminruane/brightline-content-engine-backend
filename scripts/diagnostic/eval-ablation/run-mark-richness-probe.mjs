#!/usr/bin/env node
/**
 * Part 1: mark-sentence richness probe.
 * Live R3a x3 on RICH01, THIN93, F93_S2, MF01. Cache OFF.
 * Hard stop if anchors drift (F93_S2 confirms or MF01 conflicts).
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-mark-richness-probe.mjs
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { DIAG_ROOT, REPO_ROOT } from "../lib/paths.mjs";
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

const OUT_DIR = path.join(DIAG_ROOT, "eval-ablation");
const STAGE2_PROMPT_PATH = path.join(REPO_ROOT, "lib/qc/pipeline-v4/prompts/stage2_v4.md");
const DRAFT = "Fund IV has returned 2.6 times gross MOIC.";
const STAGE2_SEED = 1;
const CONCURRENCY = 4;
const RUNS = 3;
const HARD_STOP_USD = 0.25;

const EXPECTED_R3A = {
  length: 12812,
  sha256: "bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c",
};

const RICH_MARK =
  "Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value.";
const THIN_MARK = "Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.";
const RETURNED_26 = "Fund IV has returned 2.6 times gross MOIC.";

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
    return { classification: null, passage, explanation, periodAssessment };
  }
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
    passage: gated.passage,
    explanation: gated.explanation,
    periodAssessment,
  };
}

function passageNote(passage) {
  const p = String(passage || "");
  const hasRich = /Four of twelve platform investments are fully realised/i.test(p);
  const hasMark19 = /marked at\s*1\.9/i.test(p);
  const hasRet26 = /returned\s+2\.6/i.test(p);
  if (hasRet26 && !hasMark19) return "returned-2.6";
  if (hasMark19 && hasRich) return "HUNT_rich_mark-1.9";
  if (hasMark19) return "HUNT_thin_mark-1.9";
  if (hasRet26) return "returned-2.6+extra";
  return "other";
}

async function matchOnce({ systemPrompt, statement, sourceText, pairId, runIndex }) {
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
    traceName: "diag-eval-ablation-mark-richness",
    spanName: "stage2-mark-richness",
    metadata: { pairId, runIndex },
  });
  const parsed = safeJsonParse(completion?.text ?? "");
  const gated = applyBackstops(parsed, statement);
  const costUsd = calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage);
  return {
    classification: gated.classification,
    explanation: gated.explanation,
    passage: gated.passage,
    periodAssessment: gated.periodAssessment,
    systemFingerprint: fingerprintFromCompletion(completion),
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

function atLeast(labels, target, n = 2) {
  return labels.filter((l) => l === target).length >= n;
}

function dashless(s) {
  return String(s || "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/—|–/g, "-");
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    console.error(`No API key for provider=${stageModel.provider}. Aborting.`);
    process.exit(1);
  }

  const systemPrompt = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  if (systemPrompt.length !== EXPECTED_R3A.length || sha256(systemPrompt) !== EXPECTED_R3A.sha256) {
    console.error(
      `R3a prompt mismatch: len=${systemPrompt.length} sha=${sha256(systemPrompt)}`
    );
    process.exit(1);
  }

  const pairs = [
    {
      id: "RICH01",
      role: "swap",
      sourcePath: path.join(
        DIAG_ROOT,
        "passage-selection-probe/sources/rich01_mf01_with_rich_mark.txt"
      ),
      prior: null,
    },
    {
      id: "THIN93",
      role: "swap",
      sourcePath: path.join(
        DIAG_ROOT,
        "passage-selection-probe/sources/thin93_f93_with_thin_mark.txt"
      ),
      prior: null,
    },
    {
      id: "F93_S2",
      role: "anchor",
      sourcePath: path.join(DIAG_ROOT, "sources/93_adversarial_basis_mismatch.txt"),
      prior: { expectConflict: true, note: "prior confl x3 citing rich mark" },
    },
    {
      id: "MF01",
      role: "anchor",
      sourcePath: path.join(
        DIAG_ROOT,
        "passage-selection-probe/sources/mf01_mark_then_returned.txt"
      ),
      prior: { expectConfirm: true, note: "prior conf x3 citing returned-2.6" },
    },
  ];

  for (const p of pairs) {
    p.sourceText = await readFile(p.sourcePath, "utf8");
    p.draft = DRAFT;
  }

  // Sanity: RICH01 has rich mark + MF01 returned; THIN93 has thin mark + F93 returned
  if (!pairs[0].sourceText.includes(RICH_MARK)) {
    throw new Error("RICH01 missing fixture-93 rich mark sentence verbatim");
  }
  if (!pairs[0].sourceText.includes(RETURNED_26)) {
    throw new Error("RICH01 missing returned-2.6");
  }
  if (!pairs[1].sourceText.includes(THIN_MARK)) {
    throw new Error("THIN93 missing MF01 thin mark");
  }
  if (pairs[1].sourceText.includes("Four of twelve")) {
    throw new Error("THIN93 still has rich realised-count clause");
  }
  if (!pairs[2].sourceText.includes(RICH_MARK)) {
    throw new Error("F93 anchor missing rich mark (fixture 93 must be unchanged)");
  }
  if (!pairs[3].sourceText.includes(THIN_MARK) || pairs[3].sourceText.includes("Four of twelve")) {
    throw new Error("MF01 anchor is not thin");
  }

  const jobs = [];
  for (const pair of pairs) {
    for (let runIndex = 1; runIndex <= RUNS; runIndex++) {
      jobs.push({ pair, runIndex });
    }
  }

  console.log(`Running ${jobs.length} live R3a calls (cache OFF)...`);
  let runningCost = 0;
  const results = await mapPool(jobs, CONCURRENCY, async ({ pair, runIndex }) => {
    if (runningCost >= HARD_STOP_USD) {
      return { pairId: pair.id, runIndex, skipped: true, reason: "hard_stop" };
    }
    const r = await matchOnce({
      systemPrompt,
      statement: pair.draft,
      sourceText: pair.sourceText,
      pairId: pair.id,
      runIndex,
    });
    runningCost += r.costUsd;
    return {
      pairId: pair.id,
      runIndex,
      role: pair.role,
      classification: r.classification,
      passage: r.passage,
      explanation: r.explanation,
      passageNote: passageNote(r.passage),
      costUsd: r.costUsd,
      systemFingerprint: r.systemFingerprint,
      skipped: false,
    };
  });

  const totalCost = results.reduce((s, r) => s + (Number(r.costUsd) || 0), 0);
  const byId = Object.fromEntries(
    pairs.map((p) => [p.id, results.filter((r) => r.pairId === p.id && !r.skipped)])
  );

  const f93Labels = byId.F93_S2.map((r) => r.classification);
  const mf01Labels = byId.MF01.map((r) => r.classification);
  const richLabels = byId.RICH01.map((r) => r.classification);
  const thinLabels = byId.THIN93.map((r) => r.classification);

  const anchorBroken =
    atLeast(f93Labels, "confirmed", 2) || atLeast(mf01Labels, "conflicting", 2);
  // Also break if F93 no longer conflicts or MF01 no longer confirms (weaker: not meeting prior)
  const f93StillConflicts = atLeast(f93Labels, "conflicting", 2);
  const mf01StillConfirms = atLeast(mf01Labels, "confirmed", 2);
  const anchorsOk = f93StillConflicts && mf01StillConfirms && !anchorBroken;

  let reading;
  const richConflicts = atLeast(richLabels, "conflicting", 2);
  const thinConfirms = atLeast(thinLabels, "confirmed", 2);
  const richConfirms = atLeast(richLabels, "confirmed", 2);
  const thinConflicts = atLeast(thinLabels, "conflicting", 2);

  if (richConflicts && thinConfirms) {
    reading = "RICHNESS_CONFIRMED";
  } else if (
    (richConfirms && mf01StillConfirms && !richConflicts) ||
    (thinConflicts && f93StillConflicts && !thinConfirms)
  ) {
    // host-like: RICH01 like MF01 (confirm) AND THIN93 like F93 (conflict) = refuted
    // OR partial host behavior
    if (richConfirms && thinConflicts) {
      reading = "RICHNESS_REFUTED";
    } else {
      reading = "MIXED";
    }
  } else if (richConfirms && thinConflicts) {
    reading = "RICHNESS_REFUTED";
  } else {
    reading = "MIXED";
  }

  const payload = {
    prompt: {
      path: "lib/qc/pipeline-v4/prompts/stage2_v4.md",
      length: systemPrompt.length,
      sha256: sha256(systemPrompt),
    },
    cache: "OFF",
    draft: DRAFT,
    richMark: RICH_MARK,
    thinMark: THIN_MARK,
    totalCostUsd: totalCost,
    anchorsOk,
    reading,
    labels: {
      RICH01: richLabels,
      THIN93: thinLabels,
      F93_S2: f93Labels,
      MF01: mf01Labels,
    },
    results,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const rowsPath = path.join(OUT_DIR, "mark-richness-probe-rows.json");
  const reportPath = path.join(OUT_DIR, "mark-richness-probe.md");
  await writeFile(rowsPath, JSON.stringify(payload, null, 2), "utf8");

  const lines = [];
  const L = (s = "") => lines.push(dashless(s));

  L("# Mark-sentence richness probe");
  L();
  L("Live R3a only. Cache OFF. Hard stop if anchors drift.");
  L(`Rows: \`scripts/diagnostic/eval-ablation/mark-richness-probe-rows.json\``);
  L();
  L("## Pre-flight checklist");
  L();
  L("```");
  L("CONTROL on REFERENCE ARM: Anchors F93_S2 (expect conflicting) and MF01");
  L("  (expect confirmed) are the reference controls for this diagnosis.");
  L("BASELINE three times: Yes. R3a x3 on all four pages.");
  L("VACUOUS gates: None. RICH01 and THIN93 swap only the mark sentence;");
  L("  the draft and returned-2.6 line are shared. Anchors can fail the instrument.");
  L("PLANTED cells excluded from breaks: N/A for this diagnosis (no plant scoring).");
  L("Finding scored on more than one exhibit: Yes. RICH01 and THIN93, plus two anchors.");
  L("Stopping rule CONFIRMs as well as KILLs: Yes. RICHNESS CONFIRMED / REFUTED / MIXED;");
  L("  hard stop if anchors drift (instrument broken).");
  L("```");
  L();
  L("## Running cost");
  L();
  L("```");
  L(`total_usd=${totalCost.toFixed(4)}`);
  L(`prompt=stage2_v4.md len=${systemPrompt.length} sha256=${sha256(systemPrompt)}`);
  L(`cache=OFF calls=${results.filter((r) => !r.skipped).length}`);
  L("```");
  L();
  L("## Mark sentences under test");
  L();
  L("```");
  L(`RICH (fixture 93 verbatim):`);
  L(RICH_MARK);
  L();
  L(`THIN (MF01 verbatim):`);
  L(THIN_MARK);
  L();
  L(`Draft (all four): ${DRAFT}`);
  L("```");
  L();
  L("## Per-run results");
  L();
  L("```");
  for (const p of pairs) {
    const runs = byId[p.id];
    L(`--- ${p.id} role=${p.role} labels=${runs.map((r) => shortClass(r.classification)).join("/")} ---`);
    for (const r of runs) {
      L(`run${r.runIndex}: ${shortClass(r.classification)} note=${r.passageNote}`);
      L(`  passage: ${String(r.passage || "").replace(/\n/g, " | ")}`);
      L(`  explanation: ${String(r.explanation || "").replace(/\n/g, " ")}`);
    }
    L();
  }
  L("```");
  L();
  L("## Anchor check");
  L();
  L("```");
  L(`F93_S2 labels=${f93Labels.map(shortClass).join("/")} still_conflicts_2of3=${f93StillConflicts}`);
  L(`MF01 labels=${mf01Labels.map(shortClass).join("/")} still_confirms_2of3=${mf01StillConfirms}`);
  L(`anchors_ok=${anchorsOk}`);
  if (!anchorsOk) {
    L("HARD STOP: anchors disagree with earlier results. Part 2 must not run.");
  } else {
    L("Anchors hold. Part 2 may proceed.");
  }
  L("```");
  L();
  L("## Reading");
  L();
  L("```");
  L(`reading=${reading}`);
  L(`RICH01 conflicts_2of3=${richConflicts} confirms_2of3=${richConfirms}`);
  L(`THIN93 confirms_2of3=${thinConfirms} conflicts_2of3=${thinConflicts}`);
  L("```");
  L();
  L("## Analysis");
  L();
  L("```");
  L("FILLED_BY_POST");
  L("```");

  await writeFile(reportPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${rowsPath}`);
  console.log(`Wrote ${reportPath}`);
  console.log(
    JSON.stringify(
      {
        totalCostUsd: totalCost,
        reading,
        anchorsOk,
        labels: payload.labels,
      },
      null,
      2
    )
  );

  if (!anchorsOk) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
