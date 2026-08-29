#!/usr/bin/env node
/**
 * Stop style edits masking evidence flags, and finish the register.
 *
 * Part 2  replay every unreported change across the runs on disk that retain
 *         the model's raw output, and count how many the completed
 *         house-style canonicalisation now skips.
 * Part 3  register sweep before and after excluding the authoring
 *         organisation from the named-third-party probe.
 * Part 4  three live Suggest runs per arm on the committed fixtures.
 *
 * Usage: node scripts/diagnostic/revise/register-coexistence.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, calculateLlmCostUsd, flushObservability, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { buildRevisionPrompt, finalizeSuggestRevisionText, gatherConcerns } = await import(
  "../../../lib/build-revision-prompt.mjs"
);
const { tightestUnsupportedSpans } = await import("../../../lib/revise-author-statement.mjs");
const { flagRegister, LOUD_NOTE, QUIET_NOTE, endsWithFlagRegisterNote } = await import(
  "../../../lib/revise-flag-register.mjs"
);
const { markerSpanAlignment } = await import("../../../lib/pr9-marker-span-status.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const FIXTURE_DIR = path.join(__dirname, "fixtures");
const cfg = STAGE_MODELS["writing-rewrite"];
const RUNS = 3;

/** The authoring organisation each arm's draft is written by. */
const MERIDIAN_ORG = "Partners Group";
const R10_ORG = "Halden Group";

const ARTEFACTS = [
  ["suggest-after-r10-review1.json", R10_ORG],
  ["suggest-after-r10-review2.json", R10_ORG],
  ["condition-b-review.json", R10_ORG],
  ["coverage-gap-review.json", MERIDIAN_ORG],
];

/** Every run on disk that retains the model's raw output, and its Review. */
const RAW_RUNS = [
  ["condition-a-suggest.json", "suggest-after-r10-review1.json"],
  ["condition-a-condition-b-suggest-rerun.json", "condition-b-review.json"],
  ["deterministic-removal-off-run1.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-off-run2.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-off-run3.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-on-run1.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-on-run2.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-on-run3.json", "suggest-after-r10-review1.json"],
  ["reviser-noise-floor-run1.json", "suggest-after-r10-review1.json"],
  ["reviser-noise-floor-run2.json", "suggest-after-r10-review1.json"],
  ["reviser-noise-floor-run3.json", "suggest-after-r10-review1.json"],
];

const TARGETS = [
  ["In June 2026,", "In June 2026,"],
  ["equity cheque", "equity checks of EUR 80-100 million apiece"],
];

const KEY_PERSON = "key-person risk is limited";
const DILIGENCE = "enabled deep insight";

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const normLoose = (s) => norm(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[.,;:]/g, "");
const trunc = (s, n = 88) => {
  const t = norm(s);
  return t.length <= n ? t : `${t.slice(0, n - 1)}\u2026`;
};
const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "\u2014");

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

async function statementsOf(file) {
  const json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
  const arrays = findStatementArrays(json);
  return arrays.length ? arrays.sort((a, b) => b.length - a.length)[0] : [];
}

const flaggedElementOf = (concern) => {
  const spans = tightestUnsupportedSpans(concern);
  return spans.length > 0 ? spans[0].text : concern.statementText;
};

/* ------------------------------------------------------------------ *
 * Part 3: register sweep, author excluded from the third-party probe
 * ------------------------------------------------------------------ */

async function sweep() {
  const rows = [];
  for (const [file, org] of ARTEFACTS) {
    const statements = await statementsOf(file);
    if (!statements.length) continue;
    for (const concern of gatherConcerns(statements, null)) {
      const element = flaggedElementOf(concern);
      // "before" is this same code with no organisation configured, which is
      // exactly the pre-change behaviour: every capitalised name counts.
      const before = flagRegister(concern, null, element, { authoringOrganisation: null });
      const after = flagRegister(concern, null, element, { authoringOrganisation: org });
      rows.push({
        artefact: file.replace(/\.json$/, "").replace("suggest-after-", ""),
        authoringOrganisation: org,
        statementIndex: concern.statementIndex,
        element,
        kind: concern.evidence?.kind ?? null,
        before: before.register,
        beforeSignal: before.signal,
        after: after.register,
        afterSignal: after.signal,
        moved: before.register !== after.register,
      });
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Part 2: unreported-change replay
 * ------------------------------------------------------------------ */

function unreportedFrom(label, draft, concerns, raw) {
  const finalized = finalizeSuggestRevisionText(raw, {
    originalDraft: draft,
    concerns,
    deterministicUnsupportedRemoval: false,
    log: () => {},
  });
  const revised = finalized.revisedDraft;
  return finalized.markers
    .filter((m) => m.generated && m.generatedReason === "unreported_change")
    .map((m) => {
      const align = markerSpanAlignment(draft, revised, m.start, m.end);
      return {
        label,
        before: align.origRegionText,
        after: align.revSpanText,
        note: m.note,
        intent: m.intent,
      };
    });
}

async function replayUnreported(liveRuns) {
  const byReview = new Map();
  for (const file of ["suggest-after-r10-review1.json", "condition-b-review.json"]) {
    byReview.set(file, await statementsOf(file));
  }
  const findings = [];
  for (const [runFile, reviewFile] of RAW_RUNS) {
    if (!existsSync(path.join(OUT_DIR, runFile))) continue;
    const run = JSON.parse(await readFile(path.join(OUT_DIR, runFile), "utf8"));
    if (typeof run.raw !== "string" || !run.raw.trim()) continue;
    const statements = byReview.get(reviewFile);
    const draft = statements.map((s) => norm(s.text)).join(" ");
    findings.push(
      ...unreportedFrom(runFile.replace(/\.json$/, ""), draft, gatherConcerns(statements, null), run.raw)
    );
  }
  for (const r of liveRuns) findings.push(...r.unreportedFindings);
  return findings;
}

/**
 * The 24 rows 61768a2 measured, so the replay can be reported as a delta rather
 * than as a fresh number. Keyed on the before/after pair, which is stable.
 */
async function priorUnreported() {
  try {
    const prior = JSON.parse(
      await readFile(path.join(OUT_DIR, "register-and-craft.json"), "utf8")
    );
    return prior.unreported ?? [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Part 4: live runs
 * ------------------------------------------------------------------ */

async function meridianArm() {
  const draft = (
    await readFile(path.join(FIXTURE_DIR, "meridian_production_original.txt"), "utf8")
  ).trim();
  const statements = await statementsOf("coverage-gap-review.json");
  return {
    id: "MERIDIAN",
    org: MERIDIAN_ORG,
    draft,
    statements,
    concerns: gatherConcerns(statements, null),
  };
}

async function r10Arm() {
  const statements = await statementsOf("suggest-after-r10-review1.json");
  // No draftText is stored on the r10 artefact; the draft is its statements in
  // order. It carries the key-person sentence and the recommendation, which the
  // Meridian fixture does not.
  const draft = statements.map((s) => norm(s.text)).join(" ");
  return { id: "R10", org: R10_ORG, draft, statements, concerns: gatherConcerns(statements, null) };
}

async function suggestOnce(arm, seed) {
  const prompt = buildRevisionPrompt(arm.draft, arm.concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  const completion = await callLLM({
    provider: cfg.provider,
    model: cfg.model,
    temperature: 0,
    seed,
    messages: [{ role: "user", content: prompt }],
    traceName: "register-coexistence",
    spanName: `${arm.id}-run${seed}`,
    metadata: { route: "register-coexistence", arm: arm.id, seed },
  });

  const raw = String(completion?.text ?? "")
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();

  const finalized = finalizeSuggestRevisionText(raw, {
    originalDraft: arm.draft,
    concerns: arm.concerns,
    deterministicUnsupportedRemoval: false,
    log: () => {},
  });
  const revised = finalized.revisedDraft;

  /**
   * The marker over a sentence, found by needle where the sentence survived
   * verbatim and by concern otherwise. A softened sentence still has a marker,
   * and scoring it "absent" on a needle miss would hide what the note says.
   */
  const markerOn = (needle) => {
    const direct = finalized.markers.find((mk) => revised.slice(mk.start, mk.end).includes(needle));
    if (direct) return direct;
    const concern = arm.concerns.find((c) => norm(c.statementText).includes(needle));
    if (!concern) return null;
    // The sentence may have been softened, so the needle is gone. Score every
    // marker by the content-word overlap between the revised sentence it sits
    // in and the original statement, and take the best above a floor.
    const words = (s) =>
      new Set(
        normLoose(s)
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );
    const want = words(concern.statementText);
    if (want.size === 0) return null;
    let best = null;
    let bestScore = 0;
    for (const mk of finalized.markers) {
      const from = revised.lastIndexOf(".", Math.max(0, mk.start - 1)) + 1;
      const to = revised.indexOf(".", mk.end);
      const sentence = revised.slice(from, to === -1 ? revised.length : to + 1);
      const have = words(sentence);
      const overlap = [...want].filter((w) => have.has(w)).length / want.size;
      if (overlap > bestScore) {
        bestScore = overlap;
        best = mk;
      }
    }
    return bestScore >= 0.4 ? best : null;
  };

  /** LOUD, QUIET, EDIT+LOUD, EDIT+QUIET, edit only, no marker, absent. */
  const classify = (needle) => {
    const m = markerOn(needle);
    if (!m) return revised.includes(needle) ? "no marker" : "absent";
    if (m.note === LOUD_NOTE) return "LOUD";
    if (m.note === QUIET_NOTE) return "QUIET";
    if (endsWithFlagRegisterNote(m.note)) {
      return m.note.endsWith(LOUD_NOTE) ? "EDIT+LOUD" : "EDIT+QUIET";
    }
    return "edit only";
  };

  const unreportedFindings = unreportedFrom(
    `live-${arm.id}-run${seed}`,
    arm.draft,
    arm.concerns,
    raw
  );

  return {
    arm: arm.id,
    seed,
    revised,
    targets: Object.fromEntries(TARGETS.map(([k, n]) => [k, revised.includes(n)])),
    keyPerson: classify(KEY_PERSON),
    diligence: classify(DILIGENCE),
    recommendation: classify("recommend"),
    recommendationNote: markerOn("recommend")?.note ?? null,
    keyPersonNote: markerOn(KEY_PERSON)?.note ?? null,
    markers: finalized.markers.map((m) => ({
      intent: m.intent,
      note: m.note,
      span: revised.slice(m.start, m.end),
      generated: Boolean(m.generated),
    })),
    doubleCloser: finalized.markers.filter(
      (m) => (String(m.note).match(/Confirm before publishing/g) ?? []).length > 1
    ).length,
    unreported: finalized.unreportedEvents?.length ?? 0,
    unreportedFindings,
    statementOutcomes: arm.statements.map((s, i) => ({
      index: i,
      text: norm(s.text ?? ""),
      preserved: normLoose(revised).includes(normLoose(norm(s.text ?? ""))),
    })),
    usage: completion?.usage ?? null,
    cost: completion?.usage ? calculateLlmCostUsd(cfg.provider, cfg.model, completion.usage) : 0,
  };
}

function scoreControls(runs, referencePreserved) {
  return runs[0].statementOutcomes.map((row, i) => {
    const perRun = runs.map((r) => r.statementOutcomes[i].preserved);
    const ref = referencePreserved.get(normLoose(row.text));
    const alwaysPreserved = perRun.every(Boolean);
    const selfUnstable = !alwaysPreserved && perRun.some(Boolean);
    let verdict;
    if (alwaysPreserved) verdict = "HELD";
    else if (ref === false) verdict = "VACUOUS";
    else if (selfUnstable) verdict = "INSIDE BAND";
    else verdict = "OUTSIDE BAND";
    return { index: i, text: row.text, perRun, referencePreserved: ref ?? null, verdict };
  });
}

/** The reference arm: 61768a2's three runs where available, else the noise floor. */
async function referenceMapFor(arm) {
  const drafts = [];
  try {
    const prior = JSON.parse(await readFile(path.join(OUT_DIR, "register-and-craft.json"), "utf8"));
    drafts.push(...prior.liveRuns.filter((r) => r.arm === arm.id).map((r) => r.revised));
  } catch {
    /* no reference */
  }
  if (drafts.length === 0 && arm.id === "R10") {
    for (const n of [1, 2, 3]) {
      try {
        const j = JSON.parse(
          await readFile(path.join(OUT_DIR, `reviser-noise-floor-run${n}.json`), "utf8")
        );
        if (j.revisedDraft) drafts.push(j.revisedDraft);
      } catch {
        /* skip */
      }
    }
  }
  const map = new Map();
  for (const s of arm.statements) {
    const text = normLoose(norm(s.text ?? ""));
    map.set(text, drafts.length > 0 && drafts.every((d) => normLoose(d).includes(text)));
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log("=== PART 3, REGISTER SWEEP, AUTHOR EXCLUDED FROM THIRD-PARTY PROBE ===\n");
  const rows = await sweep();
  const tally = (key) => rows.reduce((a, r) => ({ ...a, [r[key]]: (a[r[key]] || 0) + 1 }), {});
  for (const r of rows) {
    const flag = r.moved ? " <== MOVED" : "";
    console.log(
      `  ${r.before.padEnd(8)} -> ${r.after.padEnd(8)} ${r.artefact} S${r.statementIndex}  ${trunc(r.element, 58)}${flag}`
    );
    if (r.moved) console.log(`           was: ${r.beforeSignal}\n           now: ${r.afterSignal}`);
  }
  console.log(`\n  ${rows.length} flagged elements`);
  console.log(`  before: ${JSON.stringify(tally("before"))}`);
  console.log(`  after:  ${JSON.stringify(tally("after"))}`);
  console.log(`  moved:  ${rows.filter((r) => r.moved).length}\n`);

  const liveRuns = [];
  const controls = {};
  if (!hasProviderApiKey(cfg.provider)) {
    console.log("no provider API key; skipping Part 4");
  } else {
    for (const arm of [await meridianArm(), await r10Arm()]) {
      console.log(`\n=== PART 4, ARM ${arm.id}, ${RUNS} RUNS (${cfg.model}) ===\n`);
      const armRuns = [];
      for (let seed = 1; seed <= RUNS; seed++) {
        const r = await suggestOnce(arm, seed);
        armRuns.push(r);
        console.log(
          `  run${seed}  recommendation=${r.recommendation}  keyPerson=${r.keyPerson}  diligence=${r.diligence}` +
            `  unreported=${r.unreported} doubleCloser=${r.doubleCloser}` +
            (arm.id === "MERIDIAN"
              ? `  date=${r.targets["In June 2026,"] ? "kept" : "LOST"} equity=${r.targets["equity cheque"] ? "kept" : "LOST"}`
              : "")
        );
        if (r.recommendationNote) console.log(`         rec note: ${trunc(r.recommendationNote, 118)}`);
      }
      const scored = scoreControls(armRuns, await referenceMapFor(arm));
      controls[arm.id] = scored;
      console.log(`\n  controls: ${scored.length} statements`);
      for (const v of ["HELD", "INSIDE BAND", "OUTSIDE BAND", "VACUOUS"]) {
        console.log(`    ${v.padEnd(13)} ${scored.filter((c) => c.verdict === v).length}`);
      }
      for (const c of scored.filter((c) => c.verdict === "OUTSIDE BAND")) {
        console.log(`    OUTSIDE  S${c.index} ${trunc(c.text, 74)}`);
      }
      liveRuns.push(...armRuns);
    }
  }

  console.log("\n=== PART 2, UNREPORTED-CHANGE REPLAY ===\n");
  const prior = await priorUnreported();
  const now = await replayUnreported(liveRuns);
  const key = (f) => `${f.label}|${normLoose(f.before)}|${normLoose(f.after)}`;
  const nowKeys = new Set(now.map(key));
  // Live labels differ per run set, so compare the disk-replayed rows exactly
  // and the live rows by their text pair.
  const priorSubstantive = prior.filter((f) => f.klass === "substantive");
  const stillMarked = priorSubstantive.filter(
    (f) => nowKeys.has(key(f)) || now.some((n) => normLoose(n.before) === normLoose(f.before))
  );

  console.log(`  61768a2 measured   ${prior.length} unreported changes`);
  console.log(`  now                ${now.length}`);
  console.log(`  skipped            ${prior.length - now.length}`);
  console.log(
    `  substantive then   ${priorSubstantive.length}, still marked now ${stillMarked.length}`
  );
  const missing = priorSubstantive.filter((f) => !stillMarked.includes(f));
  for (const f of missing) {
    console.log(`    LOST: ${f.label} ${JSON.stringify(trunc(f.before, 50))}`);
  }
  console.log("\n  what is still marked:");
  for (const f of now) {
    console.log(`    ${f.label}: ${JSON.stringify(trunc(f.before, 44))} -> ${JSON.stringify(trunc(f.after, 44))}`);
  }

  const cost = liveRuns.reduce((a, r) => a + r.cost, 0);
  const cachedIn = liveRuns.reduce((a, r) => a + (r.usage?.cachedInputTokens ?? 0), 0);
  const totalIn = liveRuns.reduce(
    (a, r) => a + (r.usage?.promptTokens ?? r.usage?.inputTokens ?? 0),
    0
  );
  console.log(
    `\ncost $${cost.toFixed(4)} over ${liveRuns.length} calls, cache hit ${pct(cachedIn, totalIn)}`
  );

  await writeFile(
    path.join(OUT_DIR, "register-coexistence.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        model: cfg.model,
        sweep: rows,
        sweepTally: { before: tally("before"), after: tally("after") },
        unreportedBefore: prior.length,
        unreportedNow: now.length,
        unreportedSkipped: prior.length - now.length,
        substantiveBefore: priorSubstantive.length,
        substantiveStillMarked: stillMarked.length,
        unreported: now,
        liveRuns,
        controls,
        cost,
        cacheHitRate: totalIn ? cachedIn / totalIn : 0,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const sweepTable = [
    "| artefact | S | flagged element | before | after | deciding signal after |",
    "| --- | ---: | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.artefact} | ${r.statementIndex} | ${mdCell(trunc(r.element, 60))} | ${r.before} | ${r.moved ? `**${r.after}**` : r.after} | ${mdCell(r.afterSignal)} |`
    ),
  ].join("\n");

  const runTable = [
    "| arm | run | recommendation | key-person | diligence | In June 2026, | equity cheque | unreported | double closer |",
    "| --- | ---: | --- | --- | --- | --- | --- | ---: | ---: |",
    ...liveRuns.map((r) => {
      const t = (v) => (r.arm === "MERIDIAN" ? (v ? "kept" : "**LOST**") : "n/a");
      return `| ${r.arm} | ${r.seed} | ${r.recommendation} | ${r.keyPerson} | ${r.diligence} | ${t(r.targets["In June 2026,"])} | ${t(r.targets["equity cheque"])} | ${r.unreported} | ${r.doubleCloser} |`;
    }),
  ].join("\n");

  await writeFile(
    path.join(OUT_DIR, "register-coexistence.tables.md"),
    `${runTable}\n\n${sweepTable}\n`,
    "utf8"
  );

  console.log("\nwrote register-coexistence.json and .tables.md");
  await flushObservability();
}

main().catch(async (err) => {
  console.error(err);
  await flushObservability();
  process.exit(1);
});
