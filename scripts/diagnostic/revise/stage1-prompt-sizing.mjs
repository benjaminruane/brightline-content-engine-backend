#!/usr/bin/env node
/**
 * Part 1 corpus frequency, Part 2 stage 1 prompt sizing, Part 3 caching cost.
 * Zero model calls. Every block is sliced out of the REAL live prompt so the
 * counts cannot drift from what production actually sends.
 *
 * Usage: node scripts/diagnostic/revise/stage1-prompt-sizing.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

const { buildRevisionPrompt, gatherConcerns } = await import(
  "../../../lib/build-revision-prompt.mjs"
);

/** Same estimator fc25060 used, so the 8,461 baseline stays comparable. */
const tokens = (s) => Math.round(s.length / 4);

const between = (text, from, to) => {
  const a = text.indexOf(from);
  const b = to ? text.indexOf(to, a) : text.length;
  if (a < 0) throw new Error(`block not found: ${from}`);
  return text.slice(a, b < 0 ? text.length : b).trimEnd();
};

// ------------------------------------------------------------------ Part 1

async function corpusFrequency() {
  const rows = JSON.parse(
    await readFile(path.join(OUT_DIR, "removal-breadth-rows.json"), "utf8")
  );
  const selected = rows.selected ?? [];
  const silent = selected.filter((r) => r.gateReason === "remnant_lost_after_delete");
  return {
    cases: rows.caseCount,
    statements: rows.funnel?.totalStatements,
    selectedRemovals: selected.length,
    silentDeletions: silent.length,
    pct: Math.round((silent.length / selected.length) * 100),
    sentences: silent.map((r) => ({ id: r.statementId, text: r.sentenceText })),
  };
}

// ------------------------------------------------------------------ Part 2

/** The stage 1 JSON contract. Short by design: code owns markers now. */
const STAGE1_OUTPUT_CONTRACT = `OUTPUT CONTRACT (JSON only, no prose, no fences):
{
  "revised": "<the revised statement, or the statement unchanged>",
  "action": "changed" | "kept",
  "what": "<what you changed, in plain words>",
  "why": "<why, in plain words>"
}
If no change is warranted, return the statement verbatim with action "kept".`;

async function sizeStage1() {
  const draft = (
    await readFile(path.join(OUT_DIR, "fixtures", "meridian_production_original.txt"), "utf8")
  ).trim();
  const review = JSON.parse(
    await readFile(path.join(OUT_DIR, "coverage-gap-review.json"), "utf8")
  );
  const concerns = gatherConcerns(review.payload?.statements ?? [], null);

  const todaysPrompt = buildRevisionPrompt(draft, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });

  // Real blocks, sliced from the real prompt.
  const guardrails = between(todaysPrompt, "GLOBAL GUARDRAILS (must obey):", "KIND HANDLING");
  const kindHandlingAll = between(todaysPrompt, "KIND HANDLING (apply by kind=", "NAMED ENTITIES");
  const namedEntities = between(todaysPrompt, "NAMED ENTITIES (evidence keep-and-flag):", "MARKERS (reviewer-confirm spans):");
  const markersSection = between(todaysPrompt, "MARKERS (reviewer-confirm spans):", "OUTPUT INTENT:");
  const intentBlock = between(todaysPrompt, "OUTPUT INTENT:", "HOUSE STYLE RULES");
  const houseStyle = between(todaysPrompt, "HOUSE STYLE RULES (v4 Review canon", "CONCERNS TO ADDRESS:");

  // One kind's rule only. Rule (c), partial, is the equity-cheque case.
  const kindPreamble = kindHandlingAll.slice(
    0,
    kindHandlingAll.indexOf('a) kind "conflict"')
  );
  const ruleC = between(kindHandlingAll, 'c) kind "partial"', 'd) kind "deletion"');
  const kindHandlingOne = `KIND HANDLING (this concern only):\n${kindPreamble.split("\n").slice(1).join("\n").trim()}\n${ruleC}`;

  // Ordered so everything kind-INDEPENDENT comes first. Prompt caching matches
  // on an identical leading prefix, and the kind rule differs per statement, so
  // it must sit after the shared block or nothing caches at all.
  const sharedPrefix = [
    "You are revising ONE statement from a reviewed draft, using the QC Review finding on it.",
    "",
    guardrails,
    "",
    namedEntities,
    "",
    intentBlock,
    "",
    houseStyle,
    "",
    STAGE1_OUTPUT_CONTRACT,
  ].join("\n");

  const fixedPrefix = `${sharedPrefix}\n\n${kindHandlingOne}`;

  // Per-statement variable part, using the real statement and finding.
  const target = concerns.find((c) => c.statementText.includes("equity checks")) ?? concerns[0];
  const ev = target.evidence || {};
  const paraStart = Math.max(0, draft.indexOf(target.statementText) - 300);
  const paragraph = draft.slice(paraStart, paraStart + 600);

  const variable = [
    "",
    `STATEMENT TO REVISE:\n${target.statementText}`,
    "",
    `FINDING [kind=${ev.kind}]: ${ev.reason || "(none)"}`,
    ...(Array.isArray(ev.unsupportedSpans) ? ev.unsupportedSpans : []).map(
      (s) => `UNSUPPORTED ELEMENT: "${s.text}"`
    ),
    ev.excerpt ? `SOURCE EXCERPT: ${ev.excerpt}` : "",
    ev.conflictingPassage ? `CONFLICTING PASSAGE: ${ev.conflictingPassage}` : "",
    "",
    `SURROUNDING PARAGRAPH (read-only context, do NOT revise):\n${paragraph}`,
  ]
    .filter(Boolean)
    .join("\n");

  const wholeCall = `${fixedPrefix}\n${variable}`;

  const excluded = {
    markersSection: tokens(markersSection),
    otherEightKinds: tokens(kindHandlingAll) - tokens(kindHandlingOne),
  };

  return {
    today: tokens(todaysPrompt),
    sharedPrefix: tokens(sharedPrefix),
    kindRule: tokens(kindHandlingOne),
    fixedPrefix: tokens(fixedPrefix),
    variable: tokens(variable),
    wholeCall: tokens(wholeCall),
    houseStyle: tokens(houseStyle),
    guardrails: tokens(guardrails),
    excluded,
    statementText: target.statementText,
  };
}

// ------------------------------------------------------------------ main

const MEDIAN_STATEMENTS = 5.5;
const MAX_STATEMENTS = 8;

async function main() {
  const part1 = await corpusFrequency();
  const s = await sizeStage1();

  const medianTotal = Math.round(s.wholeCall * MEDIAN_STATEMENTS);
  const maxTotal = s.wholeCall * MAX_STATEMENTS;
  const ratio = (n) => (n / s.today).toFixed(2);

  // Only the kind-independent block can cache. It is written once at full
  // price, then read at ~10% (OpenAI's cached-input rate). The kind rule and
  // the statement are paid in full on every call.
  const uncached = s.kindRule + s.variable;
  const cachedTotal = (n) =>
    Math.round(s.sharedPrefix + uncached + (s.sharedPrefix * 0.1 + uncached) * (n - 1));

  console.log("");
  console.log("PART 1  code-side silent deletion, corpus frequency (8cad514 rows)");
  console.log(`corpus: ${part1.cases} cases, ${part1.statements} statements`);
  console.log(`removals reaching the delete step: ${part1.selectedRemovals}`);
  console.log(`of those, SILENT (remnant_lost_after_delete): ${part1.silentDeletions} (${part1.pct}%)`);
  for (const x of part1.sentences) console.log(`    ${x.id.padEnd(10)} ${JSON.stringify(x.text)}`);

  console.log("");
  console.log("PART 2  stage 1 prompt sizing, zero model calls");
  console.log(`today's single whole-draft call:  ${s.today} tokens`);
  console.log(`stage 1 fixed prefix:             ${s.fixedPrefix} tokens`);
  console.log(`  of which cacheable (shared):    ${s.sharedPrefix}`);
  console.log(`  of which kind rule (per call):  ${s.kindRule}`);
  console.log(`  of which house style:           ${s.houseStyle}`);
  console.log(`  of which guardrails:            ${s.guardrails}`);
  console.log(`stage 1 variable part:            ${s.variable} tokens`);
  console.log(`stage 1 typical whole call:       ${s.wholeCall} tokens`);
  console.log(`excluded, MARKERS section:        ${s.excluded.markersSection} tokens`);
  console.log(`excluded, other eight kinds:      ${s.excluded.otherEightKinds} tokens`);
  console.log("");
  console.log(`at the ${MEDIAN_STATEMENTS}-statement median: ${medianTotal} tokens  (${ratio(medianTotal)}x today)`);
  console.log(`at the ${MAX_STATEMENTS}-statement maximum:  ${maxTotal} tokens  (${ratio(maxTotal)}x today)`);

  const verdict =
    medianTotal < s.today * 0.9
      ? "CHEAPER"
      : medianTotal <= s.today * 1.1
        ? "COMPARABLE"
        : "MORE EXPENSIVE";
  console.log(`\nVERDICT: ${verdict} than today`);

  console.log("");
  console.log("PART 3  with prompt caching on the shared prefix");
  console.log(`at the median: ${cachedTotal(MEDIAN_STATEMENTS)} tokens  (${ratio(cachedTotal(MEDIAN_STATEMENTS))}x today)`);
  console.log(`at the maximum: ${cachedTotal(MAX_STATEMENTS)} tokens  (${ratio(cachedTotal(MAX_STATEMENTS))}x today)`);

  await writeFile(
    path.join(OUT_DIR, "stage1-prompt-sizing.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        part1,
        part2: { ...s, medianTotal, maxTotal, verdict },
        part3: {
          cachedMedian: cachedTotal(MEDIAN_STATEMENTS),
          cachedMax: cachedTotal(MAX_STATEMENTS),
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log("\nwrote stage1-prompt-sizing.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
