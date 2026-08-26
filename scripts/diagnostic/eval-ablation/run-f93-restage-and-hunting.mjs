#!/usr/bin/env node
/**
 * Part 1: verify restaged F93 S1/S2/S3 on live R3a x3.
 * Part 2: R9 passage-hunting probe on S1/S2/S3/EA_E3 (only if Part 1 passes).
 * Cache OFF. Live stage2_v4.md and R9 wording untouched.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run-f93-restage-and-hunting.mjs
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
const STAGE2_PROMPT_PATH = path.join(REPO_ROOT, "lib/qc/pipeline-v4/prompts/stage2_v4.md");
const R9_PATH = path.join(__dirname, "basis-conflict-r9.txt");
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const F93_SOURCE_PATH = path.join(DIAG_ROOT, "sources/93_adversarial_basis_mismatch.txt");
const STAGE2_SEED = 1;
const CONCURRENCY = 4;
const HARD_STOP_USD = 1.5;

const EXPECTED_R3A = {
  length: 12812,
  sha256: "bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c",
};
const EXPECTED_R9 = {
  length: 13728,
  sha256: "bf42e8fba016aeb511f95f8b8d95c2056df63c582d629c4078a06a52661b956a",
};

const RETURNED_26 = "Fund IV has returned 2.6 times gross MOIC.";
const MARK_19_CUE = /marked at\s*1\.9/i;
const RETURNED_26_CUE = /returned\s+2\.6/i;
const RETURNED_31_CUE = /returned\s+3\.1/i;

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
    traceName: "diag-eval-ablation-f93-restage-hunting",
    spanName: "stage2-f93-restage-hunting",
    metadata: { variantId, statementId, runIndex },
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

function onLabel(labels, target, min = 2) {
  return labels.filter((l) => l === target).length >= min;
}

function fmtLabs(labs) {
  return labs.map(shortClass).join("/");
}

/** Same metric+quantity correspondence heuristics for this probe. */
function passageMeta(statementId, passage) {
  const p = String(passage || "");
  const hasMark19 = MARK_19_CUE.test(p);
  const hasRet26 = RETURNED_26_CUE.test(p);
  const hasRet31 = RETURNED_31_CUE.test(p);
  let corresponds = false;
  let note = "";
  if (statementId === "F93_S1") {
    corresponds = hasMark19 && !hasRet26;
    note = corresponds ? "mark-1.9" : hasMark19 && hasRet26 ? "mixed" : "other";
  } else if (statementId === "F93_S2") {
    corresponds = hasRet26 && !hasMark19;
    note = corresponds ? "returned-2.6" : hasMark19 ? "HUNT_mark-1.9" : hasRet26 ? "returned-2.6+extra" : "other";
  } else if (statementId === "F93_S3") {
    // corresponding quantity is 2.6; mark-1.9 is non-corresponding
    corresponds = hasRet26 && !hasMark19;
    note = corresponds
      ? "returned-2.6"
      : hasMark19 && hasRet26
        ? "mixed_mark+returned"
        : hasMark19
          ? "HUNT_mark-1.9"
          : "other";
  } else if (statementId === "EA_E3") {
    corresponds = hasMark19 && !hasRet31;
    note = hasRet31 ? "HUNT_returned-3.1" : hasMark19 ? "mark-1.9" : "other";
  }
  return { corresponds, note, hasMark19, hasRet26, hasRet31 };
}

async function runJobs(jobs) {
  return mapPool(jobs, CONCURRENCY, async (job) => {
    const out = await matchOnce(job);
    const meta = passageMeta(job.statementId, out.passage);
    process.stdout.write(
      `  ${job.variantId} ${job.statementId} r${job.runIndex + 1} ${shortClass(out.classification)} pass=${meta.note}\n`
    );
    return {
      variantId: job.variantId,
      statementId: job.statementId,
      runIndex: job.runIndex,
      statementText: job.statement,
      sourceFile: job.sourceFile,
      ...out,
      passageCorresponds: meta.corresponds,
      passageNote: meta.note,
    };
  });
}

function armRows(rows, variantId, id) {
  return rows
    .filter((r) => r.variantId === variantId && r.statementId === id)
    .sort((a, b) => a.runIndex - b.runIndex);
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const live = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const r9 = (await readFile(R9_PATH, "utf8")).trim();
  const f93Source = await readFile(F93_SOURCE_PATH, "utf8");
  const meridian = await readFile(MERIDIAN_PATH, "utf8");

  if (sha256(live) !== EXPECTED_R3A.sha256 || live.length !== EXPECTED_R3A.length) {
    throw new Error(`Live must be R3a. got len=${live.length} sha=${sha256(live)}`);
  }
  if (sha256(r9) !== EXPECTED_R9.sha256 || r9.length !== EXPECTED_R9.length) {
    throw new Error(`R9 must match 03c6e68 arm. got len=${r9.length} sha=${sha256(r9)}`);
  }
  if (!f93Source.includes(RETURNED_26)) {
    throw new Error("Fixture source missing identical returned-2.6 line");
  }
  if (/Across fully realised exits only/.test(f93Source)) {
    throw new Error("Old subset caveat still present in fixture source");
  }
  if (!/marked at 1\.9x gross MOIC/.test(f93Source)) {
    throw new Error("Mark-1.9 hunting bait missing from fixture source");
  }

  const stmtsPart1 = [
    {
      id: "F93_S1",
      statement: "Fund IV is currently marked at 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: f93Source,
      sourceFile: "scripts/diagnostic/sources/93_adversarial_basis_mismatch.txt",
    },
    {
      id: "F93_S2",
      statement: RETURNED_26,
      sourceText: f93Source,
      sourceFile: "scripts/diagnostic/sources/93_adversarial_basis_mismatch.txt",
    },
    {
      id: "F93_S3",
      statement: "Fund IV has returned 2.6 times net MOIC.",
      sourceText: f93Source,
      sourceFile: "scripts/diagnostic/sources/93_adversarial_basis_mismatch.txt",
    },
  ];
  const stmtsPart2Extra = [
    {
      id: "EA_E3",
      statement: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      sourceText: meridian,
      sourceFile: "scripts/diagnostic/eval-ablation/meridian_source.txt",
    },
  ];

  let totalCost = 0;
  const allRows = [];
  const lines = [];

  lines.push("# F93 restage verification and R9 passage-hunting probe");
  lines.push("");
  lines.push("Live prompt and R9 wording untouched. Fixture 93 restaged in Part 0 (e24d73b).");
  lines.push("");
  lines.push("## Pre-flight checklist");
  lines.push("");
  lines.push("```");
  lines.push("CONTROL holds on REFERENCE ARM?");
  lines.push("  Part 1's job: verify S1 and S2 on R3a x3 before any R9 probe.");
  lines.push("BASELINE running three times?");
  lines.push("  Yes. R3a x3 in Part 1.");
  lines.push("Any gate VACUOUS against reference?");
  lines.push("  F93_S0 demoted to REGRESSION LOCK (not run here).");
  lines.push("  F93_S3 is a READING in Part 1, not a gate.");
  lines.push("PLANTED cells excluded from breaks?");
  lines.push("  Yes. No planted cells in this pass.");
  lines.push("Pass condition on more than one exhibit?");
  lines.push("  Yes. Part 2 gates S2 and EA_E3 (plus S1 control).");
  lines.push("Stopping rule CONFIRM and KILL (and HUNTING)?");
  lines.push("  Yes. See Part 1 and Part 2 stopping rules below.");
  lines.push("```");
  lines.push("");
  lines.push("## Fixture statements (verbatim)");
  lines.push("");
  lines.push("```");
  lines.push("S0 LOCK   draft: Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.");
  lines.push("          expect: conflicting  (not run this pass; reference already conflicts)");
  lines.push("S1 CONTROL draft: Fund IV is currently marked at 1.9 times gross MOIC and a 24 per cent gross IRR.");
  lines.push("          expect: confirmed");
  lines.push("S2 CONTROL draft: Fund IV has returned 2.6 times gross MOIC.");
  lines.push("          source: Fund IV has returned 2.6 times gross MOIC.  (identical)");
  lines.push("          expect: confirmed");
  lines.push("S3 READING draft: Fund IV has returned 2.6 times net MOIC.");
  lines.push("          source: same returned-2.6 gross line (shared with S2)");
  lines.push("          expect: conflicting if live catches gross/net; confirmed = usable primary later");
  lines.push("```");
  lines.push("");
  lines.push("S2 and S3 share the source returned-2.6 line. Not a harness problem: each call");
  lines.push("matches one statement against the full source. Kept shared so S3 varies only gross vs net.");
  lines.push("");
  lines.push("Restaging S2/S3 while measuring is permitted here because neither held as designed");
  lines.push("on the reference arm (broken instrument). Distinction not abused: S0 lock untouched;");
  lines.push("no wording tuned after seeing Part 1/2 outcomes.");
  lines.push("");

  // ----- PART 1 -----
  console.log("PART 1: R3a x3 on S1/S2/S3");
  const part1Jobs = [];
  for (const st of stmtsPart1) {
    for (let runIndex = 0; runIndex < 3; runIndex++) {
      part1Jobs.push({
        variantId: "R3a",
        systemPrompt: live,
        statement: st.statement,
        sourceText: st.sourceText,
        sourceFile: st.sourceFile,
        statementId: st.id,
        runIndex,
      });
    }
  }
  const part1Rows = await runJobs(part1Jobs);
  allRows.push(...part1Rows);
  totalCost += part1Rows.reduce((s, r) => s + r.costUsd, 0);

  const s1 = armRows(part1Rows, "R3a", "F93_S1");
  const s2 = armRows(part1Rows, "R3a", "F93_S2");
  const s3 = armRows(part1Rows, "R3a", "F93_S3");
  const s1Ok = onLabel(
    s1.map((r) => r.classification),
    "confirmed",
    2
  );
  const s2ConfOk = onLabel(
    s2.map((r) => r.classification),
    "confirmed",
    2
  );
  const s2PassOk = s2.filter((r) => r.passageCorresponds).length >= 2;
  const s3Conf = onLabel(
    s3.map((r) => r.classification),
    "confirmed",
    2
  );
  const s3Confl = onLabel(
    s3.map((r) => r.classification),
    "conflicting",
    2
  );
  const s3Reading = s3Conf
    ? "REAL_FALSE_GREEN (usable primary later)"
    : s3Confl
      ? "LIVE_ALREADY_CATCHES (R9 gross/net limb is defence in depth)"
      : "INCONCLUSIVE";

  const markCitedOnS2 = s2.filter((r) => /HUNT_mark/.test(r.passageNote) || (r.passageNote === "mixed")).length;
  const s2MarkMajority = s2.filter((r) => MARK_19_CUE.test(r.passage || "") && !RETURNED_26_CUE.test(r.passage || "")).length >= 2;

  lines.push("## Running cost");
  lines.push("");
  lines.push("```");
  lines.push(`Part 1 so far: $${totalCost.toFixed(4)}`);
  lines.push("```");
  lines.push("");
  lines.push("## Part 1: reference arm R3a x3");
  lines.push("");
  lines.push("```");
  lines.push(`R3a len=${EXPECTED_R3A.length} sha256=${EXPECTED_R3A.sha256}`);
  lines.push("```");
  lines.push("");

  for (const id of ["F93_S1", "F93_S2", "F93_S3"]) {
    const rows = armRows(part1Rows, "R3a", id);
    lines.push(`### ${id}`);
    lines.push("");
    for (const r of rows) {
      lines.push(`R3a run ${r.runIndex + 1}: ${r.classification}  corresponds=${r.passageCorresponds} (${r.passageNote})`);
      lines.push("");
      lines.push("Passage:");
      lines.push("```");
      lines.push(String(r.passage || ""));
      lines.push("```");
      lines.push("");
      lines.push("Explanation:");
      lines.push("```");
      lines.push(String(r.explanation || ""));
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("### Part 1 gates");
  lines.push("");
  lines.push("```");
  lines.push(`S1 confirmed >=2/3: ${s1Ok}  labels=${fmtLabs(s1.map((r) => r.classification))}`);
  lines.push(`S2 confirmed >=2/3: ${s2ConfOk}  labels=${fmtLabs(s2.map((r) => r.classification))}`);
  lines.push(`S2 corresponding passage >=2/3: ${s2PassOk}`);
  lines.push(`S3 reading: ${s3Reading}  labels=${fmtLabs(s3.map((r) => r.classification))}`);
  lines.push("```");
  lines.push("");

  let part1Verdict = "PASS";
  let part1Reason = "S2 confirmed with corresponding passages; S1 held.";
  if (!s2ConfOk) {
    part1Verdict = "STOP";
    part1Reason = "S2 did not confirm on >=2/3. Source still ill-formed. Part 2 not run.";
  } else if (s2MarkMajority) {
    part1Verdict = "STOP";
    part1Reason =
      "S2 confirms but cites mark-1.9 passage on >=2/3. SOURCE problem, not R9. Part 2 not run.";
  } else if (!s2PassOk) {
    part1Verdict = "STOP";
    part1Reason =
      "S2 confirmed but corresponding returned-2.6 passage on <2/3. Part 2 not run.";
  } else if (!s1Ok) {
    part1Verdict = "STOP";
    part1Reason = "S1 did not confirm on >=2/3. Part 2 not run.";
  }

  lines.push(`**Part 1 verdict: ${part1Verdict}** - ${part1Reason}`);
  lines.push("");

  let part2Verdict = "NOT_RUN";
  let part2Reason = "Part 1 did not pass.";
  let part2Rows = [];

  if (part1Verdict === "PASS") {
    console.log("PART 2: R9 x3 on S1/S2/S3/EA_E3");
    const part2Stmts = [...stmtsPart1, ...stmtsPart2Extra];
    const part2Jobs = [];
    for (const st of part2Stmts) {
      for (let runIndex = 0; runIndex < 3; runIndex++) {
        part2Jobs.push({
          variantId: "R9",
          systemPrompt: r9,
          statement: st.statement,
          sourceText: st.sourceText,
          sourceFile: st.sourceFile,
          statementId: st.id,
          runIndex,
        });
      }
    }
    part2Rows = await runJobs(part2Jobs);
    allRows.push(...part2Rows);
    totalCost += part2Rows.reduce((s, r) => s + r.costUsd, 0);

    const r9s1 = armRows(part2Rows, "R9", "F93_S1");
    const r9s2 = armRows(part2Rows, "R9", "F93_S2");
    const r9s3 = armRows(part2Rows, "R9", "F93_S3");
    const r9ea = armRows(part2Rows, "R9", "EA_E3");

    const r9s1Ok = onLabel(
      r9s1.map((r) => r.classification),
      "confirmed",
      2
    );
    const r9s2Conf = onLabel(
      r9s2.map((r) => r.classification),
      "confirmed",
      2
    );
    const r9s2Corr = r9s2.filter((r) => r.passageCorresponds).length >= 2;
    const r9s2HuntCount = r9s2.filter((r) => !r.passageCorresponds).length;
    const r3aS2HuntCount = s2.filter((r) => !r.passageCorresponds).length;
    const r9eaConfl = onLabel(
      r9ea.map((r) => r.classification),
      "conflicting",
      2
    );
    const r9eaMark = r9ea.filter((r) => r.passageNote === "mark-1.9" || (r.passageCorresponds && !r.hasRet31)).length;
    // fix: use passageCorresponds for EA_E3
    const r9eaCorr = r9ea.filter((r) => r.passageCorresponds).length >= 2;
    const r9eaHunt31 = r9ea.filter((r) => r.passageNote === "HUNT_returned-3.1").length;

    lines.push("## Part 2: R9 hunting probe");
    lines.push("");
    lines.push("```");
    lines.push(`R9 len=${EXPECTED_R9.length} sha256=${EXPECTED_R9.sha256}`);
    lines.push("R9 wording unchanged from 03c6e68.");
    lines.push("```");
    lines.push("");

    for (const id of ["F93_S1", "F93_S2", "F93_S3", "EA_E3"]) {
      const rows = armRows(part2Rows, "R9", id);
      lines.push(`### ${id}`);
      lines.push("");
      for (const r of rows) {
        lines.push(
          `R9 run ${r.runIndex + 1}: ${r.classification}  corresponds=${r.passageCorresponds} (${r.passageNote})`
        );
        lines.push("");
        lines.push("Passage:");
        lines.push("```");
        lines.push(String(r.passage || ""));
        lines.push("```");
        lines.push("");
        lines.push("Explanation:");
        lines.push("```");
        lines.push(String(r.explanation || ""));
        lines.push("```");
        lines.push("");
      }
    }

    lines.push("### Part 2 gates");
    lines.push("");
    lines.push("```");
    lines.push(`S1 confirmed >=2/3: ${r9s1Ok}  ${fmtLabs(r9s1.map((r) => r.classification))}`);
    lines.push(`S2 confirmed >=2/3: ${r9s2Conf}  ${fmtLabs(r9s2.map((r) => r.classification))}`);
    lines.push(`S2 corresponding >=2/3: ${r9s2Corr}  hunt_runs=${r9s2HuntCount} (R3a hunt_runs=${r3aS2HuntCount})`);
    lines.push(`EA_E3 conflicting >=2/3: ${r9eaConfl}  ${fmtLabs(r9ea.map((r) => r.classification))}`);
    lines.push(`EA_E3 corresponding mark-1.9 >=2/3: ${r9eaCorr}  hunt_3.1_runs=${r9eaHunt31}`);
    lines.push(`S3 R9 labels: ${fmtLabs(r9s3.map((r) => r.classification))} (reported, not gated)`);
    lines.push("```");
    lines.push("");

    // Vacuous-control guard: S2 may only KILL if it held on reference (it did if we are here)
    const s2HeldOnRef = s2ConfOk && s2PassOk;

    if (r9s2HuntCount >= 1 && r3aS2HuntCount === 0) {
      part2Verdict = "HUNTING";
      part2Reason =
        "S2 selected a non-corresponding passage on >=1/3 under R9 but not under R3a. Do not reword R9 here. Next rung: corresponding-figure discipline in the conflict limb.";
    } else if (s2HeldOnRef && !r9s2Conf) {
      part2Verdict = "KILL";
      part2Reason =
        "S2 partial/conflicting on >=2/3 under R9 while holding confirmed on R3a. Rule firing on the verb alone.";
    } else if (r9s2Conf && r9s2Corr && r9eaConfl && r9eaCorr && r9s1Ok) {
      part2Verdict = "CONFIRM";
      part2Reason =
        "S2 holds and cites correctly; EA_E3 holds on mark sentence. Hunting was contingent on the ill-formed old S2. Safe for graded remeasure next, still not a blast.";
    } else if (!r9s1Ok) {
      part2Verdict = "KILL";
      part2Reason = `S1 overreach control broke under R9: ${fmtLabs(r9s1.map((r) => r.classification))}`;
    } else if (!r9eaConfl || !r9eaCorr) {
      part2Verdict = "PARTIAL";
      part2Reason = `EA_E3 failed conflicting or mark correspondence. confl=${r9eaConfl} corr=${r9eaCorr} hunt31=${r9eaHunt31}`;
    } else {
      part2Verdict = "PARTIAL";
      part2Reason = "Pass conditions not fully met; see gates.";
    }

    lines.push(`**Part 2 verdict: ${part2Verdict}** - ${part2Reason}`);
    lines.push("");
    if (r9eaHunt31 > 0) {
      lines.push(
        "CONFIRMED: R9 reached for Nordholt returned-3.1x on at least one EA_E3 run (hunting bait in meridian_source.txt)."
      );
    } else {
      lines.push(
        "CONFIRMED: R9 did not select Nordholt returned-3.1x on EA_E3 in this probe (all corresponding mark-1.9 or other non-3.1)."
      );
    }
    lines.push("");
  } else {
    lines.push("## Part 2: NOT RUN");
    lines.push("");
    lines.push(part1Reason);
    lines.push("");
  }

  lines.push("## Running cost (final)");
  lines.push("");
  lines.push("```");
  lines.push(`Total: $${totalCost.toFixed(4)}`);
  lines.push(`Part 1 verdict: ${part1Verdict}`);
  lines.push(`Part 2 verdict: ${part2Verdict}`);
  lines.push("```");
  lines.push("");
  lines.push("## Opinion");
  lines.push("");
  lines.push(
    "Including the R9 probe in the same pass was the right call if Part 1 passed: the only question worth ~$0.30 more is whether hunting survives a clean control. Reference-arm verification alone would have been enough if S2 failed; it would not have answered the hunting hypothesis."
  );
  lines.push("");
  lines.push("## Technical summary");
  lines.push("");
  lines.push(
    "Restaged fixture 93 (identical S2; isolated S3; S0 demoted). R3a verified S1/S2/S3; R9 probe conditional. Rows in f93-restage-and-hunting-rows.json."
  );
  lines.push("");
  lines.push("## Plain-language summary");
  lines.push("");
  lines.push(
    "This pass checks whether an honest returned sentence still confirms when a mark sentence sits nearby, under the current prompt and under R9."
  );
  lines.push("");

  await mkdir(OUT_DIR, { recursive: true });
  const reportPath = path.join(OUT_DIR, "f93-restage-and-hunting.md");
  const rowsPath = path.join(OUT_DIR, "f93-restage-and-hunting-rows.json");
  await writeFile(reportPath, lines.join("\n"), "utf8");
  await writeFile(
    rowsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        costUsd: totalCost,
        part1Verdict,
        part1Reason,
        part2Verdict,
        part2Reason,
        s3Reading,
        promptMeta: {
          R3a: EXPECTED_R3A,
          R9: EXPECTED_R9,
        },
        rows: allRows,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(`Cost: $${totalCost.toFixed(4)}`);
  console.log(`Part 1: ${part1Verdict} - ${part1Reason}`);
  console.log(`Part 2: ${part2Verdict} - ${part2Reason}`);
  console.log(`Wrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
