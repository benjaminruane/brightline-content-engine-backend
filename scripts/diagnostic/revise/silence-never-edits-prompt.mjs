#!/usr/bin/env node
/**
 * Finish the principle in the prompt, and fix two note defects.
 *
 * Three Suggest runs per arm on committed fixtures, same Review, no Review
 * re-run for the concerns. One run has misled on this path twice, so the band
 * is computed from the runs themselves and every statement is scored, not
 * only the two targets.
 *
 *   arm MERIDIAN  the production fixture that produced the 2026-08-29 run.
 *                 Carries both targets. Every silence finding on it is LOUD.
 *   arm R10       suggest-after-r10-review1, the noise-floor draft. Carries
 *                 the QUIET elements, which MERIDIAN cannot exercise, and has
 *                 a measured three-run instability band already on disk.
 *
 * Then one Review on MERIDIAN run 1's draft, using the captured production
 * request payload with draftText swapped, to confirm the equity cheque
 * statement does not come back supported_full.
 *
 * Usage: node scripts/diagnostic/revise/silence-never-edits-prompt.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, calculateLlmCostUsd, flushObservability, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { buildRevisionPrompt, finalizeSuggestRevisionText, gatherConcerns } = await import(
  "../../../lib/build-revision-prompt.mjs"
);
const { LOUD_NOTE, QUIET_NOTE } = await import("../../../lib/revise-flag-register.mjs");
const { sentenceBoundsContaining } = await import("../../../lib/pr9-marker-honesty.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const FIXTURE_DIR = path.join(__dirname, "fixtures");
const cfg = STAGE_MODELS["writing-rewrite"];

const RUNS = 3;
const REVIEW_URL =
  process.env.QC_REGRESSION_BASE_URL || "https://brightline-content-engine-backend.vercel.app";

/** The two claims the 2026-08-29 run destroyed. */
const TARGETS = [
  ["date", "In June 2026,"],
  ["equity cheque", "equity checks of EUR 80-100 million apiece"],
];

/** Present-or-not checks the spec asks for by name. */
const PRESENCE = [
  ["diligence sentence", "enabled deep insight"],
  ["recommendation", "We recommend"],
];

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const normLoose = (s) => norm(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[.,;:]/g, "");
const trunc = (s, n = 88) => {
  const t = norm(s);
  return t.length <= n ? t : `${t.slice(0, n - 1)}\u2026`;
};
const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "—");

/* ------------------------------------------------------------------ *
 * Arms
 * ------------------------------------------------------------------ */

async function meridianArm() {
  const draft = (
    await readFile(path.join(FIXTURE_DIR, "meridian_production_original.txt"), "utf8")
  ).trim();
  const review = JSON.parse(await readFile(path.join(OUT_DIR, "coverage-gap-review.json"), "utf8"));
  const statements = review.payload?.statements ?? [];
  return {
    id: "MERIDIAN",
    draft,
    statements,
    concerns: gatherConcerns(statements, null),
    opts: { outputType: "reporting_commentary", requiredVersion: "complete" },
  };
}

async function r10Arm() {
  const review = JSON.parse(
    await readFile(path.join(OUT_DIR, "suggest-after-r10-review1.json"), "utf8")
  );
  const statements = review.payload?.statements ?? [];
  // The r10 artefact stores no draftText; the draft is its statements in order.
  // Used only to exercise the QUIET register, never as a production comparison.
  const draft = statements.map((s) => norm(s.text)).join(" ");
  return {
    id: "R10",
    draft,
    statements,
    concerns: gatherConcerns(statements, null),
    opts: { outputType: "reporting_commentary", requiredVersion: "complete" },
  };
}

/* ------------------------------------------------------------------ *
 * Span-leak detector: does a note quote text from outside its own span?
 * ------------------------------------------------------------------ */

/**
 * Fragments the note quotes. Split rather than matched: a regex pair-matches
 * across the gap between two quotations ("a", Added "b") and reports the
 * connective as a quoted fragment.
 */
function quotedFragments(note) {
  const parts = String(note ?? "").split('"');
  return parts.filter((_, i) => i % 2 === 1);
}

/**
 * A note may quote its own revised span, or the original sentence that span
 * sits in. Anything else is a leak: the note is describing a change that
 * happened somewhere it does not cover.
 */
function noteLeaks(original, revised, marker) {
  const span = revised.slice(marker.start, marker.end);
  const revBounds = sentenceBoundsContaining(revised, marker.start, marker.end);
  const revSentence = revised.slice(revBounds.start, revBounds.end);
  // The matching original sentence, by best word overlap with the revised one.
  const origSentences = original.split(/(?<=[.!?])\s+/);
  let origSentence = "";
  let bestScore = 0;
  const revWords = new Set(normLoose(revSentence).split(" "));
  for (const s of origSentences) {
    const words = normLoose(s).split(" ");
    const score = words.filter((w) => revWords.has(w)).length / Math.max(words.length, 1);
    if (score > bestScore) {
      bestScore = score;
      origSentence = s;
    }
  }
  const haystack = normLoose(`${span} ${revSentence} ${origSentence}`);
  const leaks = [];
  for (const fragment of quotedFragments(marker.note)) {
    const quoted = normLoose(fragment).replace(/\u2026$/, "").replace(/\.\.\.$/, "");
    if (quoted.length < 4) continue;
    if (!haystack.includes(quoted)) leaks.push(fragment);
  }
  return leaks;
}

/* ------------------------------------------------------------------ *
 * One Suggest run
 * ------------------------------------------------------------------ */

async function suggestOnce(arm, seed) {
  const prompt = buildRevisionPrompt(arm.draft, arm.concerns, arm.opts);
  const completion = await callLLM({
    provider: cfg.provider,
    model: cfg.model,
    temperature: 0,
    seed,
    messages: [{ role: "user", content: prompt }],
    traceName: "silence-never-edits-prompt",
    spanName: `${arm.id}-run${seed}`,
    metadata: { route: "silence-never-edits-prompt", arm: arm.id, seed },
  });

  const raw = String(completion?.text ?? "")
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();

  // Exactly the production options: deterministic removal stays off.
  const finalized = finalizeSuggestRevisionText(raw, {
    originalDraft: arm.draft,
    concerns: arm.concerns,
    deterministicUnsupportedRemoval: false,
    log: () => {},
  });

  const revised = finalized.revisedDraft;
  const markers = finalized.markers.map((m) => ({
    intent: m.intent,
    note: m.note,
    span: revised.slice(m.start, m.end),
    leaks: noteLeaks(arm.draft, revised, m),
  }));

  return {
    seed,
    revised,
    markers,
    targets: Object.fromEntries(TARGETS.map(([k, needle]) => [k, revised.includes(needle)])),
    presence: Object.fromEntries(PRESENCE.map(([k, needle]) => [k, revised.includes(needle)])),
    loud: markers.filter((m) => m.note === LOUD_NOTE),
    quiet: markers.filter((m) => m.note === QUIET_NOTE),
    unreported: finalized.unreportedEvents?.length ?? 0,
    removals: (finalized.removalEvents ?? []).filter((e) => e.action === "removed").length,
    leakingNotes: markers.filter((m) => m.leaks.length > 0),
    // Every statement, preserved verbatim or not. This is the control set.
    statementOutcomes: arm.statements.map((s, i) => {
      const text = norm(s.text ?? "");
      return {
        index: i,
        text,
        preserved: normLoose(revised).includes(normLoose(text)),
        flagged: arm.concerns.some((c) => norm(c.statementText) === text),
      };
    }),
    usage: completion?.usage ?? null,
    cost: completion?.usage ? calculateLlmCostUsd(cfg.provider, cfg.model, completion.usage) : 0,
  };
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

/**
 * A statement is INSIDE the band when it did not hold constant across the
 * three identical runs of a reference arm. Vacuous-control guard: a statement
 * that never held on the reference arm cannot count against this change, so it
 * is scored VACUOUS rather than OUTSIDE.
 */
function scoreControls(runs, referencePreserved, bandUnstable) {
  const out = [];
  const n = runs[0].statementOutcomes.length;
  for (let i = 0; i < n; i++) {
    const row = runs[0].statementOutcomes[i];
    const results = runs.map((r) => r.statementOutcomes[i].preserved);
    const alwaysPreserved = results.every(Boolean);
    const neverPreserved = results.every((v) => !v);
    const ref = referencePreserved.get(normLoose(row.text));
    const selfUnstable = !alwaysPreserved && !neverPreserved;
    const unstable = selfUnstable || bandUnstable.has(normLoose(row.text));

    let verdict;
    if (alwaysPreserved) verdict = "HELD";
    else if (ref === false) verdict = "VACUOUS";
    else if (unstable) verdict = "INSIDE BAND";
    else verdict = "OUTSIDE BAND";

    out.push({
      index: i,
      text: row.text,
      flagged: row.flagged,
      perRun: results,
      referencePreserved: ref ?? null,
      verdict,
    });
  }
  return out;
}

/** Preservation on the 2026-08-29 reference run, for the vacuous guard. */
function referenceMap(referenceDraft, statements) {
  const map = new Map();
  if (!referenceDraft) return map;
  for (const s of statements) {
    const text = norm(s.text ?? "");
    map.set(normLoose(text), normLoose(referenceDraft).includes(normLoose(text)));
  }
  return map;
}

/**
 * The r10 three-run band already measured at 2026-08-27, and that arm's own
 * reference draft. A statement the noise floor never preserved is vacuous:
 * this change cannot be blamed for a move that had already happened.
 */
async function r10Reference(statements) {
  const unstable = new Set();
  let referenceDraft = null;
  try {
    const runs = await Promise.all(
      [1, 2, 3].map(async (n) =>
        JSON.parse(await readFile(path.join(OUT_DIR, `reviser-noise-floor-run${n}.json`), "utf8"))
      )
    );
    referenceDraft = runs[0].revisedDraft ?? null;
    for (const s of statements) {
      const text = norm(s.text ?? "");
      const seen = runs.map((r) => normLoose(r.revisedDraft ?? "").includes(normLoose(text)));
      if (!seen.every(Boolean) && !seen.every((v) => !v)) unstable.add(normLoose(text));
      // Preserved in none of the three: it never held on the reference arm.
      if (seen.every((v) => !v)) unstable.add(normLoose(text));
    }
  } catch {
    /* band unavailable; self-instability still applies */
  }
  return { unstable, referenceDraft };
}

/* ------------------------------------------------------------------ *
 * Review re-run
 * ------------------------------------------------------------------ */

async function reviewDraft(draftText) {
  const captured = JSON.parse(
    await readFile(path.join(FIXTURE_DIR, "meridian_production_request.json"), "utf8")
  );
  const body = { ...captured, draftText };
  const res = await fetch(`${REVIEW_URL.replace(/\/$/, "")}/api/analyse-statements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  const statements = payload?.statements ?? [];
  const target = statements.find((s) => /equity check|10-14 control-oriented/i.test(s.text ?? ""));
  const card = target?.qcCard ?? target?.card ?? {};
  return {
    httpStatus: res.status,
    statementCount: statements.length,
    targetText: target?.text ?? null,
    supportState: card.supportState ?? null,
    displayVerdict: card.displayVerdict ?? null,
    isSupportedFull:
      String(card.supportState ?? "").toLowerCase() === "supported_full" ||
      String(card.displayVerdict ?? "").toLowerCase() === "supported_full",
  };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function runArm(arm, referenceDraft, bandUnstable) {
  console.log(`\n=== ARM ${arm.id}, ${RUNS} RUNS (${cfg.model}) ===\n`);
  // The two targets and the two presence checks live only in the Meridian
  // draft. Reporting them on R10 would manufacture three false losses a run.
  const carriesTargets = TARGETS.every(([, needle]) => arm.draft.includes(needle));
  const runs = [];
  for (let seed = 1; seed <= RUNS; seed++) {
    const r = await suggestOnce(arm, seed);
    r.carriesTargets = carriesTargets;
    runs.push(r);
    console.log(
      `  run${seed}  ` +
        TARGETS.map(([k]) => `${k}=${!carriesTargets ? "n/a" : r.targets[k] ? "KEPT" : "LOST"}`).join("  ") +
        `  LOUD=${r.loud.length} QUIET=${r.quiet.length}` +
        `  unreported=${r.unreported} removals=${r.removals} leaks=${r.leakingNotes.length}` +
        `  ` +
        PRESENCE.map(([k]) => `${k}=${!carriesTargets ? "n/a" : r.presence[k] ? "y" : "n"}`).join(" ")
    );
    for (const m of r.loud) console.log(`         LOUD  ${trunc(m.span, 70)}`);
    for (const m of r.quiet) console.log(`         QUIET ${trunc(m.span, 70)}`);
    for (const m of r.leakingNotes) {
      console.log(`         LEAK  ${trunc(m.span, 40)} :: quoted ${JSON.stringify(m.leaks)}`);
    }
  }

  const controls = scoreControls(runs, referenceMap(referenceDraft, arm.statements), bandUnstable);
  const bad = controls.filter((c) => c.verdict === "OUTSIDE BAND");
  console.log(`\n  controls: ${controls.length} statements scored`);
  for (const v of ["HELD", "INSIDE BAND", "OUTSIDE BAND", "VACUOUS"]) {
    console.log(`    ${v.padEnd(13)} ${controls.filter((c) => c.verdict === v).length}`);
  }
  for (const c of bad) console.log(`    OUTSIDE  S${c.index} ${trunc(c.text, 78)}`);

  return { arm: arm.id, runs, controls, outsideBand: bad.length };
}

async function main() {
  if (!hasProviderApiKey(cfg.provider)) {
    console.log("no provider API key; nothing to measure");
    return;
  }

  const meridian = await meridianArm();
  const r10 = await r10Arm();

  const promptHash = crypto
    .createHash("sha256")
    .update(buildRevisionPrompt(meridian.draft, meridian.concerns, meridian.opts))
    .digest("hex")
    .slice(0, 16);
  console.log(`prompt hash ${promptHash}`);

  // The 2026-08-29 production run, for the vacuous-control guard.
  let referenceDraft = null;
  try {
    const prior = JSON.parse(
      await readFile(path.join(OUT_DIR, "silence-never-edits.json"), "utf8")
    );
    referenceDraft = prior?.partC?.revisedDraft ?? null;
  } catch {
    /* no reference on disk */
  }

  const meridianResult = await runArm(meridian, referenceDraft, new Set());
  const r10Ref = await r10Reference(r10.statements);
  const r10Result = await runArm(r10, r10Ref.referenceDraft, r10Ref.unstable);

  console.log("\n=== REVIEW RE-RUN ON MERIDIAN RUN 1 ===\n");
  const review = await reviewDraft(meridianResult.runs[0].revised);
  console.log(`  http=${review.httpStatus} statements=${review.statementCount}`);
  console.log(`  target: ${trunc(review.targetText ?? "(not found)", 90)}`);
  console.log(`  supportState=${review.supportState} displayVerdict=${review.displayVerdict}`);
  console.log(`  supported_full? ${review.isSupportedFull ? "YES (FAIL)" : "no (pass)"}`);

  const all = [...meridianResult.runs, ...r10Result.runs];
  const cost = all.reduce((a, r) => a + r.cost, 0);
  const cachedIn = all.reduce((a, r) => a + (r.usage?.cachedInputTokens ?? 0), 0);
  const totalIn = all.reduce((a, r) => a + (r.usage?.promptTokens ?? r.usage?.inputTokens ?? 0), 0);
  console.log(
    `\ncost $${cost.toFixed(4)} over ${all.length} calls, cache hit ${pct(cachedIn, totalIn)}`
  );

  const payload = {
    ranAt: new Date().toISOString(),
    model: cfg.model,
    promptHash,
    meridian: meridianResult,
    r10: r10Result,
    review,
    cost,
    cacheHitRate: totalIn ? cachedIn / totalIn : 0,
  };
  await writeFile(
    path.join(OUT_DIR, "silence-never-edits-prompt.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );

  const table = [
    "| arm | run | In June 2026, | equity cheque | LOUD | QUIET | diligence | recommendation | unreported | leaking notes |",
    "| --- | ---: | --- | --- | ---: | ---: | --- | --- | ---: | ---: |",
    ...[meridianResult, r10Result].flatMap((res) =>
      res.runs.map((r) => {
        const t = (v) => (!r.carriesTargets ? "n/a" : v ? "kept" : "**LOST**");
        const p = (v) => (!r.carriesTargets ? "n/a" : v ? "y" : "n");
        return `| ${res.arm} | ${r.seed} | ${t(r.targets.date)} | ${t(r.targets["equity cheque"])} | ${r.loud.length} | ${r.quiet.length} | ${p(r.presence["diligence sentence"])} | ${p(r.presence.recommendation)} | ${r.unreported} | ${r.leakingNotes.length} |`;
      })
    ),
  ].join("\n");

  const controlTable = [
    "| arm | S | flagged | run1 | run2 | run3 | reference | verdict |",
    "| --- | ---: | :-: | :-: | :-: | :-: | :-: | --- |",
    ...[meridianResult, r10Result].flatMap((res) =>
      res.controls.map(
        (c) =>
          `| ${res.arm} | ${c.index} | ${c.flagged ? "y" : ""} | ${c.perRun.map((v) => (v ? "y" : "n")).join(" | ")} | ${c.referencePreserved === null ? "—" : c.referencePreserved ? "y" : "n"} | ${c.verdict === "OUTSIDE BAND" ? "**OUTSIDE BAND**" : c.verdict} |`
      )
    ),
  ].join("\n");

  await writeFile(
    path.join(OUT_DIR, "silence-never-edits-prompt.tables.md"),
    `${table}\n\n${controlTable}\n\n<!-- statement text -->\n\n${[meridianResult, r10Result]
      .flatMap((res) => res.controls.map((c) => `- ${res.arm} S${c.index}: ${mdCell(c.text)}`))
      .join("\n")}\n`,
    "utf8"
  );

  console.log("\nwrote silence-never-edits-prompt.json and .tables.md");
  await flushObservability();
}

main().catch(async (err) => {
  console.error(err);
  await flushObservability();
  process.exit(1);
});
