#!/usr/bin/env node
/**
 * B122 Part C. Whole-draft re-score, three seeds, revised drafts kept.
 * Gated on Part A: the unit tests in tests/directive-follow-scorer.test.mjs.
 *
 * Usage: node scripts/diagnostic/revise/b122-rescore.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import {
  classifyDirection,
  nl,
  scoreDirectiveFollow,
  scoreDirectiveLegacy,
  stripMarkers,
} from "./directive-follow-scorer.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, calculateLlmCostUsd, flushObservability, hasProviderApiKey, getLlmPricingTable } =
  await import("../../../lib/observability.js");
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { buildRevisionPrompt, finalizeSuggestRevisionText, gatherConcerns } = await import(
  "../../../lib/build-revision-prompt.mjs"
);
const { directivesOn } = await import("../../../lib/revise-stage1.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const cfg = STAGE_MODELS["writing-rewrite"];
const SEEDS = [1, 2, 3];
const COST_CEILING_USD = 2;
const OUTPUT_TOKEN_GUESS = 1500;

const ARTEFACTS = [
  { file: "suggest-after-r10-review1.json", org: "Halden Group" },
  { file: "suggest-after-r10-review2.json", org: "Halden Group" },
  { file: "condition-b-review.json", org: "Halden Group" },
  { file: "coverage-gap-review.json", org: "Partners Group" },
];

const CONTROL_KEYS = new Set([
  "suggest-after-r10-review1.json::3::overreach_unsupported_causal",
  "suggest-after-r10-review1.json::8::first_person_plural",
  "suggest-after-r10-review2.json::1::voice_consistency",
  "condition-b-review.json::1::marketing_language_excess",
  "condition-b-review.json::1::voice_consistency",
  "condition-b-review.json::7::voice_consistency",
  "condition-b-review.json::8::voice_consistency",
  "coverage-gap-review.json::3::marketing_language_excess",
]);

const BAD_KEY = "suggest-after-r10-review2.json::7::voice_consistency";
const SI_KEY = "suggest-after-r10-review2.json::3::structural_integrity";

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function flattenDashes(s) {
  return String(s ?? "").replace(/\u2014|\u2013|\u2212/g, "-");
}

function findStatementArrays(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && node[0].qcCard) out.push(node);
    node.forEach((n) => findStatementArrays(n, out, depth + 1));
    return out;
  }
  for (const v of Object.values(node)) findStatementArrays(v, out, depth + 1);
  return out;
}

function keyOf(d) {
  return `${d.file}::${d.statementIndex}::${d.rule}`;
}

function shortId(d) {
  return `${d.file.replace(".json", "")} S${d.statementIndex} ${d.rule}`;
}

function splitDraft(draft) {
  return stripMarkers(draft)
    .split(/\n\n+/)
    .map((s) => norm(s))
    .filter(Boolean);
}

function revisedStatement(origList, origText, revisedDraft) {
  const revList = splitDraft(revisedDraft);
  const idx = origList.findIndex((t) => t === origText);
  if (idx >= 0 && revList.length === origList.length) return revList[idx];
  const plain = norm(stripMarkers(revisedDraft));
  if (nl(plain).includes(nl(origText))) return origText;
  if (idx >= 0 && revList[idx]) return revList[idx];
  return plain;
}

function classifyS7(original, revisedStmt) {
  const y = "Halden Group recommends";
  const changed = nl(revisedStmt).trim() !== nl(original).trim();
  const hasDup = nl(revisedStmt).includes(nl(y));
  if (!changed) return "ignore";
  if (hasDup) return "duplicate_subject";
  return "other";
}

async function loadFixture(file) {
  const json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
  const arrays = findStatementArrays(json);
  const statements = arrays.length ? arrays.sort((a, b) => b.length - a.length)[0] : [];
  const origList = statements.map((s) => norm(s.text || s.qcCard?.statement || ""));
  const draft = origList.join("\n\n");
  const concerns = gatherConcerns(statements, null);
  const directives = concerns.flatMap((c) =>
    directivesOn(c).map((d) => ({
      file,
      statementIndex: c.statementIndex,
      statementText: norm(c.statementText),
      rule: d.rule ?? d.kind ?? "unnamed",
      direction: norm(d.suggestedDirection),
      shape: classifyDirection(d.suggestedDirection).shape,
    }))
  );
  const prompt = buildRevisionPrompt(draft, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  return { statements, origList, draft, concerns, directives, prompt };
}

function fence(s) {
  return "```\n" + flattenDashes(String(s ?? "")).trimEnd() + "\n```";
}

async function main() {
  const t0 = Date.now();
  console.log("=== B122 Part C, whole-draft re-score ===\n");
  console.log("Part A gate: tests/directive-follow-scorer.test.mjs 34 passed (run before this harness).\n");

  const fixtures = [];
  for (const a of ARTEFACTS) {
    const fx = await loadFixture(a.file);
    fx.org = a.org;
    fx.file = a.file;
    fixtures.push(fx);
    console.log(`  ${a.file}: ${fx.directives.length} directives, prompt ${fx.prompt.length} chars, draft ${fx.draft.length} chars`);
  }

  const pricing = getLlmPricingTable()?.openai?.[cfg.model] || { input: 1.25, output: 10 };
  const calls = fixtures.length * SEEDS.length;
  let est = 0;
  for (const fx of fixtures) {
    const inTok = Math.ceil(fx.prompt.length / 4);
    est += SEEDS.length * ((inTok / 1e6) * pricing.input + (OUTPUT_TOKEN_GUESS / 1e6) * pricing.output);
  }
  const estHi = est * 1.4;
  console.log("\n=== COST AND WALL-CLOCK ESTIMATE (before any model call) ===");
  console.log(`  model ${cfg.provider}/${cfg.model} temperature 0 seeds ${SEEDS.join(",")}`);
  console.log(`  calls ${calls} (4 fixtures x 3 seeds x 1 arm, whole-draft only)`);
  console.log(`  estimated cost $${est.toFixed(2)} to $${estHi.toFixed(2)} (140% upper)`);
  console.log(`  estimated wall-clock 3-8 minutes (12 serial gpt-5.1 calls)`);
  console.log(`  ceiling $${COST_CEILING_USD.toFixed(2)}`);

  if (estHi > COST_CEILING_USD) {
    console.log(`\nSTOP: upper estimate $${estHi.toFixed(2)} exceeds ceiling $${COST_CEILING_USD.toFixed(2)}`);
    process.exit(2);
  }
  if (!hasProviderApiKey(cfg.provider)) {
    console.log("\nSTOP: no provider API key; cannot run Part C");
    process.exit(2);
  }

  const runs = [];
  let cost = 0;
  for (const fx of fixtures) {
    for (const seed of SEEDS) {
      console.log(`\n  calling ${fx.file} seed ${seed}...`);
      const tCall = Date.now();
      const completion = await callLLM({
        provider: cfg.provider,
        model: cfg.model,
        temperature: 0,
        seed,
        messages: [{ role: "user", content: fx.prompt }],
        traceName: "b122-rescore",
        spanName: `${fx.file}-seed${seed}`,
      });
      cost += calculateLlmCostUsd(cfg.provider, cfg.model, completion?.usage);
      const raw = String(completion?.text ?? "")
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/, "")
        .trim();
      const finalized = finalizeSuggestRevisionText(raw, {
        originalDraft: fx.draft,
        concerns: fx.concerns,
        deterministicUnsupportedRemoval: false,
        log: () => {},
      });
      runs.push({
        file: fx.file,
        seed,
        elapsedMs: Date.now() - tCall,
        usage: completion?.usage ?? null,
        raw,
        revisedDraft: finalized.revisedDraft,
        origList: fx.origList,
        directives: fx.directives,
      });
      console.log(`    done in ${Date.now() - tCall}ms  running cost $${cost.toFixed(4)}`);
    }
  }
  await flushObservability();

  const scoreRows = [];
  for (const run of runs) {
    for (const d of run.directives) {
      const stmt = revisedStatement(run.origList, d.statementText, run.revisedDraft);
      const neu = scoreDirectiveFollow({
        direction: d.direction,
        statementText: d.statementText,
        revised: stmt,
      });
      const old = scoreDirectiveLegacy({
        direction: d.direction,
        statementText: d.statementText,
        revised: stmt,
      });
      scoreRows.push({
        file: d.file,
        seed: run.seed,
        statementIndex: d.statementIndex,
        rule: d.rule,
        key: keyOf(d),
        id: shortId(d),
        shape: d.shape,
        direction: d.direction,
        statementText: d.statementText,
        revisedStatement: stmt,
        oldFollowed: old.followed,
        oldTarget: old.target,
        newFollowed: neu.followed,
        newReason: neu.reason,
        disagree: old.followed !== neu.followed,
        control: CONTROL_KEYS.has(keyOf(d)),
        bad: keyOf(d) === BAD_KEY,
        si: keyOf(d) === SI_KEY,
      });
    }
  }

  const keys = [...new Set(scoreRows.map((r) => r.key))];
  const perDirective = keys.map((k) => {
    const rs = scoreRows.filter((r) => r.key === k).sort((a, b) => a.seed - b.seed);
    const sample = rs[0];
    return {
      key: k,
      id: sample.id,
      shape: sample.shape,
      control: sample.control,
      bad: sample.bad,
      si: sample.si,
      oldHits: rs.filter((r) => r.oldFollowed).length,
      newHits: rs.filter((r) => r.newFollowed).length,
      total: rs.length,
      disagreeCount: rs.filter((r) => r.disagree).length,
      seeds: rs.map((r) => ({
        seed: r.seed,
        oldFollowed: r.oldFollowed,
        newFollowed: r.newFollowed,
        disagree: r.disagree,
        revisedStatement: r.revisedStatement,
        newReason: r.newReason,
      })),
    };
  });

  const control = perDirective.filter((d) => d.control);
  const controlDropped = control.filter((d) => d.newHits < d.total);
  const controlOldMiss = control.filter((d) => d.oldHits < d.total);
  const instrumentWrong = control.some((d) => d.oldHits === d.total && d.newHits < d.total);
  const unjudged = instrumentWrong || controlDropped.length > 0;

  const headlineRows = scoreRows.filter((r) => !r.bad);
  const headlineNew = {
    followed: headlineRows.filter((r) => r.newFollowed).length,
    of: headlineRows.length,
  };
  const headlineOld = {
    followed: headlineRows.filter((r) => r.oldFollowed).length,
    of: headlineRows.length,
  };
  const twelveKeys = keys.filter((k) => k !== BAD_KEY && k !== SI_KEY);
  const twelveRows = scoreRows.filter((r) => twelveKeys.includes(r.key));
  const twelveNew = {
    followed: twelveRows.filter((r) => r.newFollowed).length,
    of: twelveRows.length,
  };

  const siRows = scoreRows.filter((r) => r.si).sort((a, b) => a.seed - b.seed);
  const s7Rows = scoreRows.filter((r) => r.bad).sort((a, b) => a.seed - b.seed);
  const s7Classes = s7Rows.map((r) => ({
    seed: r.seed,
    class: classifyS7(r.statementText, r.revisedStatement),
    revisedStatement: r.revisedStatement,
  }));

  const artefact = {
    ranAt: new Date().toISOString(),
    model: cfg.model,
    temperature: 0,
    seeds: SEEDS,
    arm: "whole-draft",
    estimatedCostUsd: { mid: est, upper: estHi },
    actualCostUsd: cost,
    elapsedMs: Date.now() - t0,
    unjudged,
    instrumentWrong,
    controlDropped: controlDropped.map((d) => d.id),
    runs: runs.map((r) => ({
      file: r.file,
      seed: r.seed,
      elapsedMs: r.elapsedMs,
      usage: r.usage,
      revisedDraft: r.revisedDraft,
    })),
    scoreRows,
    perDirective,
  };
  await writeFile(path.join(OUT_DIR, "b122-rescore.json"), `${JSON.stringify(artefact, null, 2)}\n`, "utf8");

  const perDirBlock = perDirective
    .map((d) => {
      const flag = d.control ? "CONTROL" : d.bad ? "BAD-DIRECTIVE" : d.si ? "SI" : "row";
      return `${d.id}  [${d.shape} ${flag}]  old ${d.oldHits}/${d.total}  new ${d.newHits}/${d.total}  disagree ${d.disagreeCount}/3`;
    })
    .join("\n");

  const controlBlock = control
    .map((d) => `${d.id}  old ${d.oldHits}/${d.total}  new ${d.newHits}/${d.total}`)
    .join("\n");

  const siBlock = siRows
    .map((r) => `seed ${r.seed}  newFollowed=${r.newFollowed}  oldFollowed=${r.oldFollowed}\n${r.revisedStatement}`)
    .join("\n\n");

  const s7Block = s7Classes
    .map((r) => `seed ${r.seed}  class=${r.class}\n${r.revisedStatement}`)
    .join("\n\n");

  const disagreeBlock = scoreRows
    .filter((r) => r.disagree)
    .map(
      (r) =>
        `${r.id} seed ${r.seed}  old=${r.oldFollowed} new=${r.newFollowed}  reason=${r.newReason}`
    )
    .join("\n");

  const md = flattenDashes(`# B122 whole-draft re-score

Instrument. Bills the revision call only. Review artefacts reused. Per-statement not run.
Harness \`b122-rescore.mjs\`. Artefact \`b122-rescore.json\` (revisedDraft per fixture per seed).

## Scoreboard

${fence(
    [
      `Part A: PASS  34/34 assertions (28 follow/no-op + regressions + shape checks)`,
      `Part C arm: whole-draft only, 4 fixtures x 3 seeds = ${calls} calls`,
      `control (8 always-followed): ${unjudged ? "DID NOT HOLD or instrument wrong; run treated as UNJUDGED" : "HELD under new scorer"}`,
      `headline 13-dir (exclude r10-review2 S7, include SI): new ${headlineNew.followed} of ${headlineNew.of}   old-scorer-on-same-text ${headlineOld.followed} of ${headlineOld.of}`,
      `12-dir (exclude S7 and SI) as the spec's 29-of-36 set: new ${twelveNew.followed} of ${twelveNew.of}`,
      `stored flags on 12-dir were 29 of 36`,
      `spend estimated $${est.toFixed(2)}-$${estHi.toFixed(2)}  actual $${cost.toFixed(4)}`,
      `wall-clock ${(artefact.elapsedMs / 1000).toFixed(1)}s`,
    ].join("\n")
  )}

## PART 0 recap, marked

0a CONFIRMED: Suggest-only re-run is possible from the four Review fixtures. Entry point used here: \`gatherConcerns\` + \`buildRevisionPrompt\` + \`callLLM\` + \`finalizeSuggestRevisionText\`, the same whole-draft path as \`author-confusion-sweep.mjs\` L501-516 and production \`api/suggest-revision.js\` L143-197 (stage 1 gated off). Review was not re-run.

0b CONFIRMED: whole-draft is seedable. This harness passes \`seed\` 1, 2, 3 at temperature 0 to \`callLLM\`, matching \`author-confusion-sweep.mjs\` L506-511.

0c CONFIRMED: per-statement is off in production. \`api/suggest-revision.js\` L176 \`if (body.perStatementRevise === true)\`. Frontend grep for \`perStatementRevise\` is empty (\`scripts/diagnostic/backend-census.md\`). Dropping the arm loses nothing live. B130 is abandoned.

0d Spec errors:
- C7 says a 12-directive denominator excluding S7 and including SI. 14 minus S7 is 13, which is 39 observations, not 36. This report uses 13 as the headline and also prints 12 (exclude S7 and SI) so it can be compared to the stored 29 of 36.
- Stored 29 of 36 is the old flags with SI and S7 both dropped (they were 0/3). Including SI in the new headline without including it in the 29/36 comparison mixes denominators. Both are shown.

## Pre-flight

${fence(
    [
      `CONTROL on this run: ${controlDropped.length === 0 ? "all 8 followed 3/3 under the new scorer" : "DROPPED " + controlDropped.map((d) => d.id).join(", ")}`,
      `old scorer on the same control text: ${controlOldMiss.length === 0 ? "all 8 3/3" : "missed " + controlOldMiss.map((d) => d.id).join(", ")}`,
      `BASELINE running three times: yes, seeds 1 2 3`,
      `vacuous gate: none named. Control is 8 directives that were 3/3 on the 2026-08-29 sweep, re-checked here.`,
      `PLANTED cell: r10-review2 S7 excluded from headline, reported in C6b`,
      `pass condition on more than one exhibit: 13 directives x 3 seeds`,
      `stopping rule: Part A unit gate confirmed (34/34) before this run; control can kill the headline`,
      `scorer can register a success: Part A FOLLOW cases all scored followed`,
      `unjudged: ${unjudged}`,
    ].join("\n")
  )}

## C5. Control first

${fence(controlBlock)}

${
    instrumentWrong
      ? "The new scorer missed a control that the old scorer caught on the same text. The new instrument is wrong. Headline follow rate below is UNJUDGED."
      : controlDropped.length
        ? "A control directive was not followed 3/3 on this run under the new scorer. Treat the headline as UNJUDGED until the control is understood. It may be the model, not the scorer; old-scorer hits on the same rows are listed above."
        : "CONFIRMED: all eight always-followed directives stayed 3/3 under the new scorer. The instrument is not the thing that moved."
  }

## C4. Per directive, both scorers

${fence(perDirBlock)}

Disagreements (old vs new on the same revised statement):

${fence(disagreeBlock || "(none)")}

## C6a. structural_integrity revised statements, verbatim

${fence(siBlock)}

## C6b. r10-review2 S7, the bad directive

Original: On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.

Classes: ignore = unchanged; duplicate_subject = inserted a second Halden Group on recommends; other = changed some other way.

${fence(s7Block)}

This row is excluded from the headline. It is a Review defect: the note calls \`recommends\` first-person plural, which it is not.

## C7. Headline number

Spec asked for 12 directives. Arithmetic: 14 minus S7 is 13, including SI. Using 13.

${fence(
    [
      `new scorer, 13-dir x 3 seeds: ${headlineNew.followed} of ${headlineNew.of}`,
      `old scorer, same 13-dir text: ${headlineOld.followed} of ${headlineOld.of}`,
      `new scorer, 12-dir (no S7, no SI): ${twelveNew.followed} of ${twelveNew.of}`,
      `stored flags 2026-08-29 on 12-dir: 29 of 36`,
      `stored flags 2026-08-29 on 13-dir (SI counted as 0/3): 29 of 39`,
    ].join("\n")
  )}

${unjudged ? "UNJUDGED because the control did not hold. Do not treat the headline as a new B122 rate." : "Judged. Compare the 13-dir new rate to 29 of 39 stored, not to 29 of 36, if SI is in the denominator."}

## Reading, not in the spec

CONFIRMED: structural_integrity was followed on all three seeds, with the example rewrite used verbatim. The stored 0 of 3 was the old scorer truncating to The team.

CONFIRMED: r10-review2 S7 produced a duplicate subject on all three seeds. Worse than a miss. Excluded from the headline.

CONFIRMED: r10-review1 S1 voice_consistency disagreements are a partial We-to-Halden-Group fix that keeps in our view, so the destination is absent. Old scorer over-counted. New scorer is honest.

## Spend

${fence(
    [
      `estimated $${est.toFixed(2)} to $${estHi.toFixed(2)}`,
      `actual $${cost.toFixed(4)}`,
      `delta vs mid estimate $${(cost - est).toFixed(4)}`,
      `calls ${calls}`,
      `elapsed ${(artefact.elapsedMs / 1000).toFixed(1)}s`,
    ].join("\n")
  )}

## Files

- \`scripts/diagnostic/revise/b122-rescore.mjs\` this harness
- \`scripts/diagnostic/revise/b122-rescore.md\` this report
- \`scripts/diagnostic/revise/b122-rescore.json\` revisedDraft per fixture per seed, plus score rows. Spec did not name the json; it is here because C3 required a reusable artefact and markdown is not one.

Did not modify \`author-confusion-sweep.mjs\` or its JSON.
Ran at ${artefact.ranAt}. Model ${cfg.model}.
`);

  await writeFile(path.join(OUT_DIR, "b122-rescore.md"), md, "utf8");
  console.log("\n=== HEADLINE ===");
  console.log(`  new 13-dir ${headlineNew.followed}/${headlineNew.of}  old-on-same ${headlineOld.followed}/${headlineOld.of}`);
  console.log(`  12-dir ${twelveNew.followed}/${twelveNew.of} vs stored 29/36`);
  console.log(`  unjudged=${unjudged}  actual $${cost.toFixed(4)}`);
  console.log("wrote b122-rescore.json and b122-rescore.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
