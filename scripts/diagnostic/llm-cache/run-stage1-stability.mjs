#!/usr/bin/env node
/**
 * Stage 1 boundary stability on the B63 Test 2a edit (F15).
 * Cache OFF. Five independent re-splits of the edited draft.
 *
 * Usage:
 *   node scripts/diagnostic/llm-cache/run-stage1-stability.mjs
 */

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";

loadLocalEnvFiles();
process.env.QC_LLM_CACHE = "0";

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");

function editOneLetter(text) {
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch >= "a" && ch <= "z") {
      return `${s.slice(0, i)}${ch === "a" ? "b" : "a"}${s.slice(i + 1)}`;
    }
    if (ch >= "A" && ch <= "Z") {
      return `${s.slice(0, i)}${ch === "A" ? "B" : "A"}${s.slice(i + 1)}`;
    }
  }
  return `${s} x`;
}

function statementTexts(result) {
  return (Array.isArray(result?.statements) ? result.statements : []).map((s) =>
    typeof s?.text === "string" ? s.text : ""
  );
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }
  if (isLlmCacheEnabled()) {
    console.error("QC_LLM_CACHE must be off for this measurement");
    process.exit(1);
  }

  const fixtures = await loadAllFixtures();
  const fx = fixtures.find((f) => String(f.data.id).padStart(2, "0") === "15");
  if (!fx) throw new Error("F15 not found");
  const draft = typeof fx.data.draft === "string" ? fx.data.draft : "";

  console.log("Stage 1 baseline on F15 (unedited)");
  const baseline = await extractStatements({ draftText: draft });
  const baseTexts = statementTexts(baseline);
  if (baseTexts.length < 2) throw new Error("F15 baseline has fewer than 2 statements");
  const originalStmt = baseTexts[0];
  const unchangedExpected = baseTexts.slice(1);
  const editedStmt = editOneLetter(originalStmt);
  const editedDraft = draft.includes(originalStmt)
    ? draft.replace(originalStmt, editedStmt)
    : `${editedStmt}\n${draft}`;

  console.log(`baseline statements: ${baseTexts.length}`);
  console.log(`unedited statements to match: ${unchangedExpected.length}`);
  console.log(`edited first statement: ${JSON.stringify(originalStmt.slice(0, 80))} -> ${JSON.stringify(editedStmt.slice(0, 80))}`);

  const runs = [];
  for (let i = 1; i <= 5; i += 1) {
    console.log(`run ${i} Stage 1 on edited F15`);
    const result = await extractStatements({ draftText: editedDraft });
    const texts = statementTexts(result);
    const unmatched = unchangedExpected.filter((t) => !texts.includes(t));
    const identical = unmatched.length === 0;
    runs.push({
      run: i,
      statementCount: texts.length,
      uneditedExpected: unchangedExpected.length,
      uneditedMissing: unmatched.length,
      byteIdenticalUnedited: identical,
    });
    console.log(
      `  statements=${texts.length} uneditedMissing=${unmatched.length} identical=${identical}`
    );
    if (unmatched.length > 0) {
      for (const t of unmatched.slice(0, 3)) {
        console.log(`  missing: ${JSON.stringify(t.slice(0, 120))}`);
      }
    }
  }

  const identicalCount = runs.filter((r) => r.byteIdenticalUnedited).length;
  console.log("");
  console.log("## Stage 1 boundary stability (F15, 2a-style one-sentence edit, 5 runs, cache OFF)");
  console.log("run | statementCount | uneditedExpected | uneditedMissing | byteIdenticalUnedited");
  console.log("--- | --- | --- | --- | ---");
  for (const r of runs) {
    console.log(`${r.run} | ${r.statementCount} | ${r.uneditedExpected} | ${r.uneditedMissing} | ${r.byteIdenticalUnedited}`);
  }
  console.log("");
  console.log(`identical on ${identicalCount} of 5 runs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
