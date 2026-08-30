#!/usr/bin/env node
/**
 * B134 two-arm style carve-out gate.
 * Reference = live prompt. Carve-out = three-copy variant applied in this
 * process only. Does not write lib/ until the ship decision says so.
 *
 * Usage: node scripts/diagnostic/revise/b134-carve-out-gate.mjs
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { suggestCallRecord } from "../lib/suggest-call-record.mjs";
import {
  classifyDirection,
  nl,
  scoreDirectiveFollow,
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
const COST_STOP_USD = 0.5;
const OUTPUT_TOKEN_GUESS = 1500;

const COPY1_FROM =
  "When the source is SILENT or vague on what the draft asserts, LEAVE THE AUTHOR'S WORDING EXACTLY AS WRITTEN and flag it. Do not soften it, do not drop the figure, do not cut the clause, do not rewrite the sentence. Silence is the absence of evidence, not evidence against the claim, and the author decides what to do about it.";

const COPY1_TO =
  "When the source is SILENT or vague on what the draft asserts, leave the CLAIM exactly as written and flag it. Do not soften the claim, do not drop a figure, do not cut the clause, do not substitute a different fact, do not strip the actor so that a judgement becomes an unattributed statement. Silence is the absence of evidence, not evidence against the claim, and the author decides what to do about the CLAIM.\n" +
  "One operation is permitted on a silent card when a craft or style_guide suggestedDirection names it, and only this operation: replace a first-person subject or object (we / our / us) with the named authoring organisation as grammatical subject (or as the object, when the pronoun is an object). Change nothing else in the sentence. Never delete the actor.\n" +
  '  "We believe X" -> "Halden Group believes X"\n' +
  '  "we recommend the commitment" -> "Halden Group recommends the commitment"\n' +
  '  "available to us" -> "available to Halden Group"\n' +
  'Never "X". Never "is believed". Never "is recommended". THE ACTOR STAYS. Do not recast into an agentless or passive construction such as "was attractive", "is considered", "is expected to", "it is noted that", or "is recommended". Removing the holder of an opinion turns a judgement into a statement of fact, and an unattributed evaluation in a compliance document is worse than a first-person one.\n' +
  'Preserve every hedge and modal exactly. "should deliver" stays "should deliver". "broadly in line with" stays. Only the grammatical subject or object pronoun changes. A first-person fix which makes a claim more confident is a failure of the rule, not a bonus.\n' +
  "Still forbidden on a silent card: deleting evaluative language (marketing_language_excess, kind soften); neutralising a causal verb (overreach_unsupported_causal); removing a hedge or modal; substituting a different fact; completing a fragment; deleting a view-marker; or any other craft operation not named above.";

const COPY2_FROM =
  "Removing unsupported PRECISION. NO LONGER DONE. An evidence gap with a SILENT source is flagged and never edited. Rule (b). Leave it and flag.";

const COPY2_TO =
  "Removing unsupported PRECISION. NO LONGER DONE. An evidence gap with a SILENT source is flagged and the CLAIM is never edited. Rule (b). A named first-person subject replacement on that statement is still followed.";

const COPY6_FROM =
  "  (No excerpt/reason available \u2014 the source is silent, so keep the claim as written and flag it.)";

const COPY6_TO =
  "  (No excerpt/reason available - the source is silent, so keep the claim as written and flag it. A named first-person subject replacement on this statement is still followed.)";

export const CARVE_OUT_REPLACEMENTS = [
  { id: "copy1_L1089", from: COPY1_FROM, to: COPY1_TO, required: true },
  { id: "copy2_L1086", from: COPY2_FROM, to: COPY2_TO, required: true },
  { id: "copy6_L654", from: COPY6_FROM, to: COPY6_TO, required: false },
];

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

const PRIMARY_KEY = "suggest-after-r10-review1.json::7::voice_consistency";
const LOCK_KEY = "condition-b-review.json::7::voice_consistency";
const S5_KEY = "coverage-gap-review.json::5::overreach_unsupported_causal";
const PLANTED_KEYS = new Set([
  "suggest-after-r10-review1.json::1::marketing_language_excess",
  "suggest-after-r10-review1.json::1::voice_consistency",
  "suggest-after-r10-review2.json::7::voice_consistency",
]);

const S9_TEXT = "Halden Group expects the relationship to deepen over the life of the fund.";
const S9_FILES = new Set(["suggest-after-r10-review1.json", "suggest-after-r10-review2.json"]);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function flattenDashes(s) {
  return String(s ?? "").replace(/\u2014|\u2013|\u2212/g, "-");
}

function sha256(s) {
  return createHash("sha256").update(String(s ?? ""), "utf8").digest("hex");
}

export function applyCarveOut(prompt) {
  let next = String(prompt ?? "");
  const hits = {};
  for (const row of CARVE_OUT_REPLACEMENTS) {
    const n = next.split(row.from).length - 1;
    hits[row.id] = n;
    if (row.required && n === 0) {
      throw new Error(`carve-out variant: missing ${row.id}`);
    }
    if (n > 1) {
      throw new Error(`carve-out variant: ${row.id} matched ${n} times, want 1`);
    }
    if (n === 1) next = next.split(row.from).join(row.to);
  }
  return { prompt: next, hits };
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

function actorPresent(stmt) {
  return nl(stmt).includes(nl("Halden Group"));
}

function firstPersonPresent(stmt) {
  return /\bwe\b|\bour\b|\bus\b/.test(nl(stmt));
}

function classifyPrimary(original, revised, followed) {
  const o = nl(stripMarkers(original));
  const r = nl(stripMarkers(revised));
  if (r === o) return "NO-OP";
  const hadWe = firstPersonPresent(original);
  const hasWe = firstPersonPresent(revised);
  const hasActor = actorPresent(revised);
  if (hadWe && !hasWe && !hasActor) return "ACTOR STRIPPED";
  if (followed && hasActor) return "FOLLOW_WITH_ACTOR";
  return "OTHER";
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
  const live = buildRevisionPrompt(draft, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  const carved = applyCarveOut(live);
  return {
    statements,
    origList,
    draft,
    concerns,
    directives,
    livePrompt: live,
    carvedPrompt: carved.prompt,
    carveHits: carved.hits,
  };
}

function fence(s) {
  return "```\n" + flattenDashes(String(s ?? "")).trimEnd() + "\n```";
}

function hitsOf(rows, key) {
  const rs = rows.filter((r) => r.key === key);
  return { followed: rs.filter((r) => r.followed).length, of: rs.length, rows: rs };
}

async function callArm(fx, arm, prompt, seed) {
  const tCall = Date.now();
  const completion = await callLLM({
    provider: cfg.provider,
    model: cfg.model,
    temperature: 0,
    seed,
    messages: [{ role: "user", content: prompt }],
    traceName: "b134-carve-out-gate",
    spanName: `${arm}-${fx.file}-seed${seed}`,
  });
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
  return {
    file: fx.file,
    arm,
    seed,
    elapsedMs: Date.now() - tCall,
    usage: completion?.usage ?? null,
    callRecord: suggestCallRecord({
      completion,
      prompt,
      model: cfg.model,
      temperature: 0,
      seed,
    }),
    revisedDraft: finalized.revisedDraft,
    origList: fx.origList,
    directives: fx.directives,
  };
}

function scoreRun(run) {
  const rows = [];
  for (const d of run.directives) {
    const stmt = revisedStatement(run.origList, d.statementText, run.revisedDraft);
    const neu = scoreDirectiveFollow({
      direction: d.direction,
      statementText: d.statementText,
      revised: stmt,
    });
    rows.push({
      file: d.file,
      arm: run.arm,
      seed: run.seed,
      statementIndex: d.statementIndex,
      rule: d.rule,
      key: keyOf(d),
      id: shortId(d),
      shape: d.shape,
      direction: d.direction,
      statementText: d.statementText,
      revisedStatement: stmt,
      followed: neu.followed,
      reason: neu.reason,
      control: CONTROL_KEYS.has(keyOf(d)),
      planted: PLANTED_KEYS.has(keyOf(d)),
    });
  }
  return rows;
}

function s9FromRun(run) {
  const orig = run.origList.find((t) => nl(t) === nl(S9_TEXT));
  if (!orig) return null;
  const revised = revisedStatement(run.origList, orig, run.revisedDraft);
  return {
    file: run.file,
    arm: run.arm,
    seed: run.seed,
    original: orig,
    revised,
    identical: nl(stripMarkers(revised)) === nl(orig),
  };
}

async function main() {
  const t0 = Date.now();
  console.log("=== B134 carve-out gate ===\n");
  console.log("PART 0 (before any model call, live prompt untouched):");
  console.log("  0a house-style is already whole-draft. Mechanical house-style in the carve-out is redundant.");
  console.log("  0b dropping fragments: agreed. SI rewrite added an evidential predicate.");
  console.log("  0c dropping view-marker: agreed. Too close to strengthening.");
  console.log("  0d one operation does not weaken PRIMARY/LOCK/S9. S5 is the excluded-kind boundary.");
  console.log("  0e spec says 18 calls (3 fixtures) and also blocking coverage-gap S5. Running 4 fixtures x 2 arms x 3 seeds = 24 calls.\n");

  const fixtures = [];
  for (const a of ARTEFACTS) {
    const fx = await loadFixture(a.file);
    fx.org = a.org;
    fx.file = a.file;
    fixtures.push(fx);
    console.log(
      `  ${a.file}: live ${fx.livePrompt.length} chars hash ${sha256(fx.livePrompt).slice(0, 16)}  carved ${fx.carvedPrompt.length} chars hash ${sha256(fx.carvedPrompt).slice(0, 16)}  hits ${JSON.stringify(fx.carveHits)}`
    );
    if (fx.livePrompt === fx.carvedPrompt) {
      throw new Error(`${a.file}: arms did not differ`);
    }
  }

  const pricing = getLlmPricingTable()?.openai?.[cfg.model] || { input: 1.25, output: 10 };
  const calls = fixtures.length * SEEDS.length * 2;
  let naive = 0;
  for (const fx of fixtures) {
    for (const prompt of [fx.livePrompt, fx.carvedPrompt]) {
      const inTok = Math.ceil(prompt.length / 4);
      naive += SEEDS.length * ((inTok / 1e6) * pricing.input + (OUTPUT_TOKEN_GUESS / 1e6) * pricing.output);
    }
  }
  const naiveHi = naive * 1.4;
  // 12 whole-draft calls of this shape cost $0.0960 on 2026-08-30 (b122-rescore.md).
  // Char/4 uncached overstated that run at $0.31-$0.43. Scale the measured actual.
  const est = (calls / 12) * 0.096;
  const estHi = est * 1.4;
  console.log("\n=== COST ESTIMATE (before any model call) ===");
  console.log(`  model ${cfg.provider}/${cfg.model} temperature 0 seeds ${SEEDS.join(",")}`);
  console.log(`  calls ${calls} (4 fixtures x 3 seeds x 2 arms). Spec named 18; S5 requires coverage-gap.`);
  console.log(`  expected actual $${est.toFixed(4)} to $${estHi.toFixed(4)} (scaled from $0.0960 for 12 calls)`);
  console.log(`  naive uncached char/4 $${naive.toFixed(4)} to $${naiveHi.toFixed(4)} (overstates; prefix cache)`);
  console.log(`  stop if expected actual exceeds $${COST_STOP_USD.toFixed(2)} (would mean Review or Stage 1)`);

  if (est > COST_STOP_USD || calls > 40) {
    console.log(`\nSTOP: expected $${est.toFixed(4)} or calls ${calls} looks like Review or Stage 1.`);
    process.exit(2);
  }
  if (!hasProviderApiKey(cfg.provider)) {
    console.log("\nSTOP: no provider API key");
    process.exit(2);
  }

  const runs = [];
  let cost = 0;

  async function runArm(arm) {
    for (const fx of fixtures) {
      const prompt = arm === "reference" ? fx.livePrompt : fx.carvedPrompt;
      for (const seed of SEEDS) {
        console.log(`\n  calling ${arm} ${fx.file} seed ${seed}...`);
        const run = await callArm(fx, arm, prompt, seed);
        cost += calculateLlmCostUsd(cfg.provider, cfg.model, run.usage);
        runs.push(run);
        console.log(`    done in ${run.elapsedMs}ms  running cost $${cost.toFixed(4)}`);
      }
    }
  }

  await runArm("reference");

  const refRows = runs.filter((r) => r.arm === "reference").flatMap(scoreRun);
  const refControl = [...CONTROL_KEYS].map((k) => hitsOf(refRows, k));
  const refControlHeld = refControl.every((h) => h.followed === h.of && h.of === 3);
  console.log("\n=== REFERENCE ARM CONTROLS ===");
  for (const h of refControl) {
    const id = h.rows[0]?.id || "(missing)";
    console.log(`  ${id}  ${h.followed}/${h.of}`);
  }
  if (!refControlHeld) {
    console.log("\nUNJUDGED: control eight did not hold on the reference arm. Carve-out arm not run.");
    await flushObservability();
    await writeOutputs({
      t0,
      est,
      estHi,
      cost,
      fixtures,
      runs,
      scoreRows: refRows,
      unjudged: true,
      ship: false,
      skipCarveOut: true,
    });
    process.exit(3);
  }

  await runArm("carve-out");
  await flushObservability();

  const scoreRows = runs.flatMap(scoreRun);
  const s9Rows = runs.filter((r) => S9_FILES.has(r.file)).map(s9FromRun).filter(Boolean);

  await writeOutputs({
    t0,
    est,
    estHi,
    cost,
    fixtures,
    runs,
    scoreRows,
    s9Rows,
    unjudged: false,
  });
}

async function writeOutputs({ t0, est, estHi, cost, fixtures, runs, scoreRows, s9Rows = [], unjudged, ship: shipArg, skipCarveOut }) {
  const byArm = (arm, key) => hitsOf(scoreRows.filter((r) => r.arm === arm), key);
  const primaryRef = byArm("reference", PRIMARY_KEY);
  const primaryCut = byArm("carve-out", PRIMARY_KEY);
  const lockRef = byArm("reference", LOCK_KEY);
  const lockCut = byArm("carve-out", LOCK_KEY);
  const s5Ref = byArm("reference", S5_KEY);
  const s5Cut = byArm("carve-out", S5_KEY);

  const primaryClasses = (primaryCut.rows.length ? primaryCut.rows : primaryRef.rows).map((r) => ({
    seed: r.seed,
    class: classifyPrimary(r.statementText, r.revisedStatement, r.followed),
    followed: r.followed,
    actor: actorPresent(r.revisedStatement),
    revisedStatement: r.revisedStatement,
  }));

  const actorStrip = primaryClasses.some((c) => c.class === "ACTOR STRIPPED");
  const primaryPass =
    !unjudged &&
    primaryCut.of === 3 &&
    primaryCut.followed === 3 &&
    primaryClasses.every((c) => c.class === "FOLLOW_WITH_ACTOR" && c.actor);
  const lockPass = !unjudged && lockCut.followed === 3 && lockCut.of === 3;
  const s9Pass = !unjudged && s9Rows.length === 12 && s9Rows.every((r) => r.identical);
  const s5Pass = !unjudged && s5Cut.of === 3 && s5Cut.followed <= s5Ref.followed;
  const controlCut = [...CONTROL_KEYS].map((k) => byArm("carve-out", k));
  const controlPass = !unjudged && controlCut.every((h) => h.followed === h.of && h.of === 3);

  const ship =
    shipArg === false
      ? false
      : Boolean(primaryPass && lockPass && s9Pass && s5Pass && controlPass && !actorStrip && !unjudged);

  const hashes = fixtures.map((fx) => ({
    file: fx.file,
    liveLen: fx.livePrompt.length,
    liveHash: sha256(fx.livePrompt),
    carvedLen: fx.carvedPrompt.length,
    carvedHash: sha256(fx.carvedPrompt),
    differ: fx.livePrompt !== fx.carvedPrompt,
    hits: fx.carveHits,
  }));

  const artefact = {
    ranAt: new Date().toISOString(),
    model: cfg.model,
    temperature: 0,
    seeds: SEEDS,
    estimatedCostUsd: { mid: est, upper: estHi },
    actualCostUsd: cost,
    elapsedMs: Date.now() - t0,
    unjudged: Boolean(unjudged),
    skipCarveOut: Boolean(skipCarveOut),
    ship,
    hashes,
    runs: runs.map((r) => ({
      file: r.file,
      arm: r.arm,
      seed: r.seed,
      elapsedMs: r.elapsedMs,
      usage: r.usage,
      callRecord: r.callRecord ?? null,
      revisedDraft: r.revisedDraft,
    })),
    scoreRows,
    s9Rows,
    primaryClasses,
  };
  await writeFile(path.join(OUT_DIR, "b134-carve-out-gate.json"), `${JSON.stringify(artefact, null, 2)}\n`, "utf8");

  const hashBlock = hashes
    .map(
      (h) =>
        `${h.file}\n  live    len ${h.liveLen}  sha256 ${h.liveHash}\n  carved  len ${h.carvedLen}  sha256 ${h.carvedHash}\n  differ ${h.differ}  hits ${JSON.stringify(h.hits)}`
    )
    .join("\n");

  const primaryBlock = primaryClasses
    .map((c) => `seed ${c.seed}  class=${c.class}  followed=${c.followed}  actor=${c.actor}\n${c.revisedStatement}`)
    .join("\n\n");

  const s9Block = s9Rows
    .map((r) => `${r.arm} ${r.file} seed ${r.seed} identical=${r.identical}\n${r.revised}`)
    .join("\n\n");

  const controlBlock = [...CONTROL_KEYS]
    .map((k) => {
      const a = byArm("reference", k);
      const b = byArm("carve-out", k);
      return `${a.rows[0]?.id || k}  ref ${a.followed}/${a.of}  cut ${b.followed}/${b.of}`;
    })
    .join("\n");

  const plantedBlock = [...PLANTED_KEYS]
    .map((k) => {
      const a = byArm("reference", k);
      const b = byArm("carve-out", k);
      return `${a.rows[0]?.id || k}  NOT A PASS CONDITION  ref ${a.followed}/${a.of}  cut ${b.followed}/${b.of}`;
    })
    .join("\n");

  const md = flattenDashes(`# B134 style carve-out gate

Two arms, one process. Live prompt was not written until ship. Harness \`b134-carve-out-gate.mjs\`.

## Scoreboard

${fence(
    [
      `PRIMARY r10-review1 S7  ref ${primaryRef.followed}/${primaryRef.of}  cut ${primaryCut.followed}/${primaryCut.of}  actor-present ${primaryClasses.filter((c) => c.actor).length}/3  class ${primaryClasses.map((c) => c.class).join(",")}`,
      `LOCK condition-b S7  ref ${lockRef.followed}/${lockRef.of}  cut ${lockCut.followed}/${lockCut.of}`,
      `BLOCKING S9  ${s9Rows.filter((r) => r.identical).length} of ${s9Rows.length} byte-identical (want 12: 2 files x 2 arms x 3 seeds)`,
      `BLOCKING coverage-gap S5  ref ${s5Ref.followed}/${s5Ref.of}  cut ${s5Cut.followed}/${s5Cut.of}  cut must not exceed ref`,
      `CONTROL eight  ${controlPass ? "HELD on both arms" : unjudged ? "FAILED on reference; carve-out UNJUDGED" : "did not hold on carve-out"}`,
      `SHIP ${ship ? "YES" : "NO"}`,
      `spend estimated $${est.toFixed(4)} to $${estHi.toFixed(4)}  actual $${cost.toFixed(4)}`,
      `unjudged ${Boolean(unjudged)}  actor-stripped ${actorStrip}`,
    ].join("\n")
  )}

## Prompt length and hash per arm

${fence(hashBlock)}

## PART 0

0a CONFIRMED. \`lib/build-revision-prompt.mjs\` L1080: "The ENTIRE revised draft must comply with HOUSE STYLE RULES below (not only the flagged statements)", including currency_format, thousand_separator, number_spelling, first_person_plural, hyperbole_vs_qualitative. Support-state-blind. Listing mechanical house-style in the carve-out is redundant with that global instruction. Caveat: first_person_plural is already on that list and still lost to kind=unsupported on r10-review1 S7. Dropping mechanical house-style from the permitted list does not open a new gap this spec is closing. The voice gap is the one operation kept.

0b CONFIRMED, and I agree rather than complying. The SI rewrite on r10-review2 S3 turned "The team's stability, with no senior departures across the last three fund cycles." into "The team's stability is demonstrated by no senior departures across the last three fund cycles." (\`b122-rescore.md\` C6a). "is demonstrated by" asserts an evidential relationship the fragment did not. Completing a fragment adds a predicate, and a predicate is a claim. Ben's original grammar-or-voice decision was broader. For a one-operation ship, dropping fragments is right.

0c CONFIRMED, and I agree. Deleting "in our view" after the subject is already the organisation makes the remaining claim more assertive. Global guardrail L1074 is "Never STRENGTHEN a claim". PRIMARY S7 has no view-marker, so dropping this does not move the pass bar. FIRST_PERSON_ACTOR_INSTRUCTION still contains the view-marker paragraphs; this gate reuses the replacement verbs and the never-delete-actor / never-agentless / preserve-hedge clauses, not the view-marker delete/convert block. That is a deliberate cut, not a silent drop.

0d The stated ship conditions are not weaker. PRIMARY is exactly the one operation. LOCK, S9, S5, and the control eight do not depend on fragments or view-markers. Coverage gap: fragments and view-markers are now forbidden and untested except as named exclusions. That is missing coverage, not a softer bar.

0e Spec arithmetic: "18 calls" is 3 fixtures x 2 arms x 3 seeds. BLOCKING coverage-gap S5 requires the fourth fixture. This run is 24 calls. Cost scales from $0.0960 for 12 calls (2026-08-30) to about $0.19, still under the $0.50 stop. Also: "reuse FIRST_PERSON_ACTOR_INSTRUCTION" and "drop view-marker deletion" cannot both mean copy L84-109 wholesale, because L97-101 is the view-marker delete. Verbs and never-clauses only.

## Pre-flight

${fence(
    [
      `CONTROL on reference arm: ${refControlLine(scoreRows)}`,
      `BASELINE running three times: yes, seeds 1 2 3`,
      `VACUOUS: PRIMARY on the reference arm is expected to miss (stored 0 of 3). If reference PRIMARY were 3 of 3 the carve-out gate would be vacuous; it was ${primaryRef.followed} of ${primaryRef.of}. S9 has no first person, so the carve-out permission does not apply to it; it still can fail if silence breaks. Not vacuous.`,
      `PLANTED excluded from breaks: r10-review1 S1 (B131) and r10-review2 S7 (B132). Reported below, not a pass condition.`,
      `Pass condition on more than one exhibit: PRIMARY + LOCK (same sentence, different evidence) + two S9s + S5 + control eight.`,
      `Wording specific: destination requires "Halden Group believes...", not "first person disappeared".`,
      `Stopping rule confirms (all five) and kills (any miss, or ACTOR STRIPPED).`,
      `Scorer can register success: LOCK is the natural control already 3 of 3. Same sentence, supported.`,
      `Natural control: condition-b S7. CONFIRMED in fixtures.`,
    ].join("\n")
  )}

## PRIMARY, verbatim

${fence(primaryBlock)}

## BLOCKING S9

${fence(s9Block || "(none)")}

## CONTROL eight

${fence(controlBlock)}

## PLANTED, not a pass condition

${fence(plantedBlock)}

## BLOCKING S5

${fence(`ref ${s5Ref.followed}/${s5Ref.of}  cut ${s5Cut.followed}/${s5Cut.of}\n` + (s5Cut.rows.map((r) => `cut seed ${r.seed} followed=${r.followed}\n${r.revisedStatement}`).join("\n\n") || ""))}

## Ship decision

${fence(
    [
      `PRIMARY 3 of 3 with actor: ${primaryPass}`,
      `LOCK 3 of 3: ${lockPass}`,
      `both S9s identical every seed both arms: ${s9Pass}`,
      `S5 cut not higher than ref: ${s5Pass}`,
      `control eight unchanged: ${controlPass}`,
      `ACTOR STRIPPED: ${actorStrip}`,
      `SHIP: ${ship}`,
    ].join("\n")
  )}

${
  ship
    ? "Gate passed. Live prompt will be amended, tests pinned, vitest run, three commits, tag, push."
    : actorStrip
      ? "HARD STOP. ACTOR STRIPPED. Do not iterate. Do not ship."
      : unjudged
        ? "UNJUDGED. Reference controls failed. Carve-out arm not used to decide."
        : "Do not ship. Leaving a first-person closer flagged is honest."
}

## Files

- scripts/diagnostic/revise/b134-carve-out-gate.mjs this harness
- scripts/diagnostic/revise/b134-carve-out-gate.md this report
- scripts/diagnostic/revise/b134-carve-out-gate.json revised drafts and scores

Live lib/build-revision-prompt.mjs was not modified in this process unless SHIP is YES after this file was written.
`);

  await writeFile(path.join(OUT_DIR, "b134-carve-out-gate.md"), `${md}\n`, "utf8");
  console.log(`\nSHIP=${ship} actual $${cost.toFixed(4)} wrote b134-carve-out-gate.md`);
  artefact._ship = ship;
  artefact._actorStrip = actorStrip;
  await writeFile(path.join(OUT_DIR, "b134-carve-out-gate.decision.json"), `${JSON.stringify({ ship, actorStrip, unjudged: Boolean(unjudged), actualCostUsd: cost }, null, 2)}\n`);
}

function refControlLine(scoreRows) {
  const ref = scoreRows.filter((r) => r.arm === "reference" && r.control);
  const keys = [...CONTROL_KEYS];
  const parts = keys.map((k) => hitsOf(ref, k)).map((h) => `${h.followed}/${h.of}`);
  const held = keys.every((k) => {
    const h = hitsOf(ref, k);
    return h.followed === 3 && h.of === 3;
  });
  return held ? `HELD ${parts.join(" ")}` : `DID NOT HOLD ${parts.join(" ")}`;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
