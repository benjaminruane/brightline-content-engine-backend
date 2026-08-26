#!/usr/bin/env node
/**
 * Passage-selection probe: live R3a x3 on multi-figure pairs.
 * Cache OFF. One arm only. Does not edit stage2_v4.md or sources.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-passage-selection-probe.mjs
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(DIAG_ROOT, "eval-ablation");
const PAIRS_PATH = path.join(DIAG_ROOT, "passage-selection-probe/pairs.json");
const STAGE2_PROMPT_PATH = path.join(REPO_ROOT, "lib/qc/pipeline-v4/prompts/stage2_v4.md");
const STAGE2_SEED = 1;
const CONCURRENCY = 4;
const HARD_STOP_USD = 1.25;
const RUNS = 3;

const EXPECTED_R3A = {
  length: 12812,
  sha256: "bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c",
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

function normalizePassage(p) {
  return String(p || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Corresponding if selected passage contains the corresponding cue and not only the competing cue. */
function passageCorresponds(pair, passage) {
  const selected = normalizePassage(passage);
  const corr = normalizePassage(pair.correspondingPassage);
  const comp = normalizePassage(pair.competingPassage);
  if (!selected) return { corresponds: false, note: "empty" };
  const hasCorr = corr.length > 0 && selected.includes(corr.slice(0, Math.min(48, corr.length)));
  // Stronger: check distinctive figure cues
  const cues = cueFlags(pair, passage);
  if (pair.id === "MF01" || pair.id === "MF02" || pair.id === "MF03" || pair.id === "MF06") {
    // corresponding = returned 2.6 (or mark for MF06/MF07 specials handled below)
  }
  if (["MF01", "MF02", "MF03", "MF04", "MF08"].includes(pair.id)) {
    const ok = cues.hasRet26 && !cues.hasMark19;
    return {
      corresponds: ok,
      note: ok ? "returned-2.6" : cues.hasMark19 ? "HUNT_mark" : cues.hasRet26 ? "returned-2.6+extra" : "other",
      cues,
    };
  }
  if (pair.id === "MF05") {
    const ok = cues.hasVale && cues.hasRet26 && !cues.hasMark19;
    return {
      corresponds: ok,
      note: ok ? "vale-returned-2.6" : cues.hasMark19 ? "HUNT_fund_mark" : "other",
      cues,
    };
  }
  if (pair.id === "MF06") {
    // corresponding for conflict = mark-at-1.9 (figure the draft misuses); returned-2.6 also supports conflict
    const ok = cues.hasMark19;
    return {
      corresponds: ok,
      note: ok ? "mark-1.9" : cues.hasRet26 ? "returned-2.6_also_conflict" : "other",
      cues,
    };
  }
  if (pair.id === "MF07") {
    const ok = cues.hasMark19 && !cues.hasRet26;
    return {
      corresponds: ok,
      note: ok ? "mark-1.9" : cues.hasRet26 ? "HUNT_returned-2.6" : "other",
      cues,
    };
  }
  if (pair.id === "MF08") {
    // already in MF01 set for ret26 - wait MF08 is wrong magnitude; corresponding is returned 2.6
    const ok = cues.hasRet26 && !cues.hasMark19;
    return {
      corresponds: ok,
      note: ok ? "returned-2.6" : cues.hasMark19 ? "HUNT_mark" : "other",
      cues,
    };
  }
  if (pair.id === "MF09") {
    // corresponding for conflict = fund mark (shows fund is not returned 2.6); citing Vale confirms wrong entity
    const ok = cues.hasMark19 && !cues.hasVale;
    return {
      corresponds: ok,
      note: ok ? "fund_mark" : cues.hasVale ? "HUNT_vale_deal" : "other",
      cues,
    };
  }
  if (pair.id === "MF10") {
    const ok = cues.hasNordholt && cues.hasRet31 && !cues.hasMark19;
    return {
      corresponds: ok,
      note: ok ? "nordholt-3.1" : cues.hasMark19 ? "HUNT_fund_iv_mark" : "other",
      cues,
    };
  }
  return { corresponds: hasCorr, note: hasCorr ? "substr" : "miss", cues: cueFlags(pair, passage) };
}

function cueFlags(_pair, passage) {
  const p = String(passage || "");
  return {
    hasMark19: /marked at\s*1\.9/i.test(p),
    hasRet26: /returned\s+(?:a\s+gross\s+moic\s+of\s+)?2\.6|2\.6\s*times\s+gross\s+moic|2\.6x\s+gross\s+moic/i.test(
      p
    ),
    hasRet30: /returned\s+3\.0|3\.0\s*times/i.test(p),
    hasRet31: /returned\s+3\.1|3\.1x\s+gross\s+moic/i.test(p),
    hasVale: /vale\s+forge/i.test(p),
    hasNordholt: /nordholt/i.test(p),
    hasIrr24: /24%\s+gross\s+irr/i.test(p),
  };
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
    traceName: "diag-eval-ablation-passage-selection-probe",
    spanName: "stage2-passage-selection-probe",
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
    rawText: completion?.text ?? "",
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

function atLeast(arr, pred, n = 2) {
  return arr.filter(pred).length >= n;
}

function fmtDims(d) {
  return `order=${d.order}; distance=${d.distance}; metric=${d.metric}; entity=${d.entity}; wording=${d.wording}`;
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
  const promptLen = systemPrompt.length;
  const promptSha = sha256(systemPrompt);
  if (promptLen !== EXPECTED_R3A.length || promptSha !== EXPECTED_R3A.sha256) {
    console.error(
      `R3a prompt mismatch: len=${promptLen} sha=${promptSha} expected ${EXPECTED_R3A.length} / ${EXPECTED_R3A.sha256}`
    );
    process.exit(1);
  }

  const manifest = JSON.parse(await readFile(PAIRS_PATH, "utf8"));
  const pairs = manifest.pairs;
  const loaded = [];
  for (const pair of pairs) {
    // sourceFile is relative to scripts/diagnostic/
    const abs = path.join(DIAG_ROOT, pair.sourceFile);
    const sourceText = await readFile(abs, "utf8");
    loaded.push({ ...pair, sourceText, sourcePath: abs });
  }

  const jobs = [];
  for (const pair of loaded) {
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
    const corr = passageCorresponds(pair, r.passage);
    return {
      pairId: pair.id,
      runIndex,
      expected: pair.expected,
      classification: r.classification,
      passage: r.passage,
      explanation: r.explanation,
      corresponds: corr.corresponds,
      correspondNote: corr.note,
      cues: corr.cues,
      costUsd: r.costUsd,
      systemFingerprint: r.systemFingerprint,
      skipped: false,
    };
  });

  const totalCost = results.reduce((s, r) => s + (Number(r.costUsd) || 0), 0);
  const byPair = new Map();
  for (const pair of loaded) {
    byPair.set(
      pair.id,
      results.filter((r) => r.pairId === pair.id && !r.skipped)
    );
  }

  // Aggregates
  let labelOk2of3 = 0;
  let passageOk2of3 = 0;
  let rightLabelWrongPassage = 0;
  let falseRed = 0; // expected confirmed, got conflicting >=2/3
  let overcorrection = 0; // expected conflicting, got confirmed >=2/3
  let falseRedViaWrongPassage = 0; // stopping rule: expected confirmed -> conflicting via non-corresponding >=2/3

  const pairSummaries = [];
  for (const pair of loaded) {
    const runs = byPair.get(pair.id) || [];
    const labels = runs.map((r) => r.classification);
    const passagesOk = runs.map((r) => r.corresponds);
    const labelMatch = atLeast(labels, (l) => l === pair.expected, 2);
    const passageMatch = atLeast(passagesOk, (c) => c === true, 2);
    if (labelMatch) labelOk2of3++;
    if (passageMatch) passageOk2of3++;

    const rightWrong = runs.filter(
      (r) => r.classification === pair.expected && r.corresponds === false
    );
    if (rightWrong.length >= 2) rightLabelWrongPassage++;

    const conflCount = labels.filter((l) => l === "conflicting").length;
    const confCount = labels.filter((l) => l === "confirmed").length;
    if (pair.expected === "confirmed" && conflCount >= 2) falseRed++;
    if (pair.expected === "conflicting" && confCount >= 2) overcorrection++;

    const falseRedHunt =
      pair.expected === "confirmed" &&
      runs.filter((r) => r.classification === "conflicting" && r.corresponds === false).length >= 2;
    if (falseRedHunt) falseRedViaWrongPassage++;

    pairSummaries.push({
      id: pair.id,
      expected: pair.expected,
      dimensions: pair.dimensions,
      justifyExpected: pair.justifyExpected,
      draft: pair.draft,
      correspondingPassage: pair.correspondingPassage,
      competingPassage: pair.competingPassage,
      sourceFile: pair.sourceFile,
      labels,
      labelMatch2of3: labelMatch,
      passageMatch2of3: passageMatch,
      rightLabelWrongPassage2of3: rightWrong.length >= 2,
      falseRed: pair.expected === "confirmed" && conflCount >= 2,
      falseRedViaWrongPassage: falseRedHunt,
      overcorrection: pair.expected === "conflicting" && confCount >= 2,
      runs,
    });
  }

  let stopping;
  if (overcorrection > 0) {
    stopping = {
      code: "OVERCORRECTION",
      detail: `${overcorrection} expected-conflicting pair(s) returned confirmed on at least 2 of 3.`,
    };
  }
  if (falseRedViaWrongPassage >= 2) {
    stopping = {
      code: "CONFIRMED_DEFECT",
      detail: `${falseRedViaWrongPassage} expected-confirmed pairs returned conflicting via non-corresponding passage on at least 2 of 3.`,
    };
  } else if (!stopping || stopping.code !== "OVERCORRECTION") {
    stopping = {
      code: "EDGE_CASE",
      detail: `${falseRedViaWrongPassage} expected-confirmed pair(s) with conflicting via non-corresponding on >=2/3 (threshold for CONFIRMED DEFECT is 2).`,
    };
  }
  // OVERCORRECTION can coexist; report both if both fire
  const stoppingNotes = [];
  if (falseRedViaWrongPassage >= 2) {
    stoppingNotes.push({
      code: "CONFIRMED_DEFECT",
      detail: `${falseRedViaWrongPassage} expected-confirmed pairs returned conflicting via non-corresponding passage on at least 2 of 3.`,
    });
  } else {
    stoppingNotes.push({
      code: "EDGE_CASE",
      detail: `${falseRedViaWrongPassage} expected-confirmed pair(s) with conflicting via non-corresponding on >=2/3.`,
    });
  }
  if (overcorrection > 0) {
    stoppingNotes.push({
      code: "OVERCORRECTION",
      detail: `${overcorrection} expected-conflicting pair(s) returned confirmed on at least 2 of 3.`,
    });
  }

  // Dimension cross for misses
  const missRows = pairSummaries.filter(
    (p) =>
      (p.expected === "confirmed" && p.falseRedViaWrongPassage) ||
      (p.expected === "confirmed" && !p.passageMatch2of3) ||
      (p.expected === "conflicting" && p.overcorrection) ||
      !p.labelMatch2of3
  );

  const rowsPath = path.join(OUT_DIR, "passage-selection-probe-rows.json");
  const reportPath = path.join(OUT_DIR, "passage-selection-probe.md");
  await mkdir(OUT_DIR, { recursive: true });

  const payload = {
    prompt: { path: "lib/qc/pipeline-v4/prompts/stage2_v4.md", length: promptLen, sha256: promptSha },
    cache: "OFF",
    runsPerPair: RUNS,
    totalCostUsd: totalCost,
    hardStopUsd: HARD_STOP_USD,
    aggregates: {
      pairs: loaded.length,
      labelOk2of3,
      passageOk2of3,
      rightLabelWrongPassage,
      falseRed,
      falseRedViaWrongPassage,
      overcorrection,
    },
    stoppingNotes,
    pairSummaries,
    results,
  };
  await writeFile(rowsPath, JSON.stringify(payload, null, 2), "utf8");

  const lines = [];
  const L = (s = "") => lines.push(dashless(s));

  L("# Passage selection probe (multi-figure sources)");
  L();
  L("Live R3a only. Cache OFF. Invented Halden pairs plus Meridian Nordholt case.");
  L(`Rows: \`scripts/diagnostic/eval-ablation/passage-selection-probe-rows.json\``);
  L(`Pairs: \`scripts/diagnostic/passage-selection-probe/pairs.json\``);
  L();
  L("## Pre-flight checklist");
  L();
  L("```");
  L("CONTROL on REFERENCE ARM: Yes. Every expected label is justified from source");
  L("  text alone in pairs.json justifyExpected before any run. Reference arm is");
  L("  live R3a; there is no alternate arm.");
  L("BASELINE three times: Yes. R3a x3 per pair.");
  L("VACUOUS gates: None by construction. Each pair has two performance figures");
  L("  and a draft that can match only one corresponding sentence. If a run returns");
  L("  partially_confirmed, that outcome is scored as neither expected label.");
  L("PLANTED cells excluded from breaks: N/A. All pairs are new for this probe.");
  L("Finding scored on more than one exhibit: Yes. Ten pairs (MF01 to MF10).");
  L("Stopping rule CONFIRMs as well as KILLs: Yes. Written before the run:");
  L("  CONFIRMED DEFECT (>=2 expected-confirmed conflicting via wrong passage >=2/3)");
  L("  EDGE CASE (0 or 1 such pair)");
  L("  OVERCORRECTION (any expected-conflicting returns confirmed >=2/3)");
  L("```");
  L();
  L("## Running cost");
  L();
  L("```");
  L(`total_usd=${totalCost.toFixed(4)}`);
  L(`prompt=stage2_v4.md len=${promptLen} sha256=${promptSha}`);
  L(`cache=OFF calls=${results.filter((r) => !r.skipped).length}`);
  L("```");
  L();
  L("## Expected labels (pre-run justifications)");
  L();
  L("```");
  for (const p of pairSummaries) {
    L(`${p.id} expected=${p.expected}`);
    L(`  dims: ${fmtDims(p.dimensions)}`);
    L(`  draft: ${p.draft}`);
    L(`  corresponding: ${p.correspondingPassage}`);
    L(`  justify: ${p.justifyExpected}`);
    L();
  }
  L("```");
  L();
  L("## Per-run results");
  L();
  L("```");
  for (const p of pairSummaries) {
    L(`--- ${p.id} expected=${p.expected} labels=${p.labels.map(shortClass).join("/")} ---`);
    for (const r of p.runs) {
      L(
        `run${r.runIndex}: ${shortClass(r.classification)} corresponds=${r.corresponds} note=${r.correspondNote}`
      );
      L(`  passage: ${String(r.passage || "").replace(/\n/g, " | ")}`);
    }
    L(
      `summary: label_ok_2of3=${p.labelMatch2of3} passage_ok_2of3=${p.passageMatch2of3} right_label_wrong_passage_2of3=${p.rightLabelWrongPassage2of3} false_red=${p.falseRed} false_red_via_wrong_passage=${p.falseRedViaWrongPassage} overcorrection=${p.overcorrection}`
    );
    L();
  }
  L("```");
  L();
  L("## Aggregates");
  L();
  L("```");
  L(`pairs=${loaded.length}`);
  L(`expected_label_on_at_least_2_of_3=${labelOk2of3}`);
  L(`corresponding_passage_on_at_least_2_of_3=${passageOk2of3}`);
  L(`right_label_from_wrong_passage_on_at_least_2_of_3=${rightLabelWrongPassage}`);
  L(`false_red_expected_confirmed_got_conflicting_2of3=${falseRed}`);
  L(`false_red_via_non_corresponding_passage_2of3=${falseRedViaWrongPassage}`);
  L(`overcorrection_expected_conflicting_got_confirmed_2of3=${overcorrection}`);
  L("```");
  L();
  L("## Dimension cross (misses)");
  L();
  L("```");
  if (missRows.length === 0) {
    L("No label or passage misses under the 2-of-3 bars.");
  } else {
    for (const m of missRows) {
      L(
        `${m.id} expected=${m.expected} labels=${m.labels.map(shortClass).join("/")} dims=${fmtDims(m.dimensions)} false_red_hunt=${m.falseRedViaWrongPassage} overcorrection=${m.overcorrection}`
      );
    }
  }
  L("```");
  L();
  L("## Selection rule (post-run)");
  L();
  L("```");
  L("FILLED_BY_ANALYSIS");
  L("```");
  L();
  L("## Stopping rule outcome");
  L();
  L("```");
  for (const s of stoppingNotes) {
    L(`${s.code}: ${s.detail}`);
  }
  L("```");
  L();
  L("## Identity collision reminder");
  L();
  L("```");
  L("eval-ablation EA_E3, claim-spans CS_E3, and corpus E3:S0:ic_memo are three");
  L("different statements. This probe does not use those ids. Meridian appears");
  L("only as MF10 (Nordholt 3.1x draft vs eval-ablation/meridian_source.txt).");
  L("```");

  await writeFile(reportPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${rowsPath}`);
  console.log(`Wrote ${reportPath}`);
  console.log(`cost_usd=${totalCost.toFixed(4)} stopping=${stoppingNotes.map((s) => s.code).join(",")}`);
  console.log(JSON.stringify(payload.aggregates, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
