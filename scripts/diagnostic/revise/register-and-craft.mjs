#!/usr/bin/env node
/**
 * Fix the causal miss, and find out what the unreported craft changes are.
 *
 * Part 1  register sweep over every flagged statement in every committed
 *         Review artefact, before and after the causal change. "Before" is
 *         recomputed here from the pre-change rules rather than read from an
 *         old artefact, so the two columns are the same corpus and differ only
 *         in the code under test.
 * Part 2  DIAGNOSIS ONLY. Every unreported change the detector generates,
 *         across every run on disk that retains the model's raw output, plus
 *         the three Part 3 runs. Classified mechanical or substantive by the
 *         shape of the change.
 * Part 3  three live Suggest runs on the committed production fixtures.
 *
 * Usage: node scripts/diagnostic/revise/register-and-craft.mjs
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
const { flagRegister, LOUD_NOTE, QUIET_NOTE, loudFeaturesOf, sourceSpoke } = await import(
  "../../../lib/revise-flag-register.mjs"
);
const { isHouseStyleOnlyDifference } = await import("../../../lib/pr9-marker-honesty.mjs");
const { markerSpanAlignment } = await import("../../../lib/pr9-marker-span-status.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const FIXTURE_DIR = path.join(__dirname, "fixtures");
const cfg = STAGE_MODELS["writing-rewrite"];
const RUNS = 3;

const ARTEFACTS = [
  "suggest-after-r10-review1.json",
  "suggest-after-r10-review2.json",
  "condition-b-review.json",
  "coverage-gap-review.json",
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

const KEY_PERSON = "means key-person risk is limited";
const DILIGENCE = "enabled deep insight";
const RECOMMENDATION = "we recommend the commitment";

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

/** The element a register decision is made about: tightest span, else statement. */
function flaggedElementOf(concern) {
  const spans = tightestUnsupportedSpans(concern);
  return spans.length > 0 ? spans[0].text : concern.statementText;
}

/* ------------------------------------------------------------------ *
 * Part 1: the register before the change, recomputed
 * ------------------------------------------------------------------ */

/**
 * The 73bca5d causal probe and register, reproduced exactly so the before
 * column is a fair comparison rather than an artefact read from an old run.
 * Everything except the causal handling is identical to the shipped module, so
 * only the causal rows can move.
 */
const OLD_CAUSAL_RE =
  /\b(?:enabled|enables|enabling|caused|causes|causing|drove|drives|driven by|led to|leads to|resulted in|results in|resulting in|because of|thanks to|owing to|due to|meant that|means that|allowed|allowing|underpinned|gave (?:us|them) )\b/i;

function registerBefore(concern, element) {
  const spoke = sourceSpoke(concern);
  if (spoke.sourceSpoke) return { register: "ORDINARY", signal: spoke.signal };

  // Reuse the shipped module for every non-causal probe, then subtract the
  // signals the old code could not produce.
  const now = flagRegister(concern, null, element);
  const textSignals = now.textSignals.filter((s) => s !== "causal_connective_lexicon");
  if (OLD_CAUSAL_RE.test(norm(element))) textSignals.push("causal_claim");

  const featureSignals = loudFeaturesOf(concern);
  const elementIsWholeStatement = norm(element) === norm(concern?.statementText);

  if (textSignals.length > 0) {
    return { register: "LOUD", signal: `element text: ${textSignals.join(", ")}` };
  }
  if (elementIsWholeStatement && featureSignals.length > 0) {
    return { register: "LOUD", signal: `materiality.features: ${featureSignals.join(", ")}` };
  }
  return { register: "QUIET", signal: "no checkable content in the flagged element" };
}

async function sweep() {
  const rows = [];
  for (const file of ARTEFACTS) {
    const statements = await statementsOf(file);
    if (!statements.length) continue;
    for (const concern of gatherConcerns(statements, null)) {
      const element = flaggedElementOf(concern);
      const before = registerBefore(concern, element);
      const after = flagRegister(concern, null, element);
      rows.push({
        artefact: file.replace(/\.json$/, "").replace("suggest-after-", ""),
        statementIndex: concern.statementIndex,
        statementText: concern.statementText,
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
 * Part 2: what the unreported changes actually are
 * ------------------------------------------------------------------ */

const PUNCTUATION_ONLY = (a, b) =>
  a.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase() === b.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
const CASING_ONLY = (a, b) => a !== b && a.toLowerCase() === b.toLowerCase();

/**
 * The house-style equivalences `isHouseStyleOnlyDifference` does NOT cover.
 *
 * That helper canonicalises currency symbols against ISO codes, million/billion
 * scale words, thousand separators and spelled-out numbers 0-12. It does not
 * canonicalise percentage notation or multiples, so "24 per cent" -> "24%" and
 * "1.9 times" -> "1.9x" come back as content-word changes and score
 * substantive. Both are `percentage_notation` and `currency_format` house-style
 * rules that rule (f) applies silently, so both are mechanical in fact.
 *
 * Applied here, in the diagnostic only. Part 2 is diagnosis, and the helper is
 * shared with the honesty check, so widening it would change craft behaviour.
 */
function houseStyleExtras(text) {
  return String(text ?? "")
    .replace(/(\d)\s*(?:%|per\s*cent(?:age)?|percent(?:age)?)/gi, "$1<pct>")
    .replace(/(\d(?:\.\d+)?)\s*(?:x\b|times\b)/gi, "$1<mult>")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mechanical or substantive, decided by the SHAPE OF THE CHANGE alone. Nothing
 * here looks at which concern the change sits near, which is the point: the
 * question Part 2 d3 asks is how far a shape-based test gets on its own.
 */
function classifyChange(before, after) {
  const a = norm(before);
  const b = norm(after);
  if (!a && !b) return { klass: "mechanical", basis: "empty" };
  if (a === b) return { klass: "mechanical", basis: "no textual difference" };
  if (CASING_ONLY(a, b)) return { klass: "mechanical", basis: "casing only" };
  if (PUNCTUATION_ONLY(a, b)) return { klass: "mechanical", basis: "punctuation/whitespace only" };
  if (isHouseStyleOnlyDifference(a, b)) return { klass: "mechanical", basis: "house style only" };
  const ha = houseStyleExtras(a);
  const hb = houseStyleExtras(b);
  if (ha === hb || isHouseStyleOnlyDifference(ha, hb)) {
    return {
      klass: "mechanical",
      basis: "house style only (percentage/multiple notation, not covered by isHouseStyleOnlyDifference)",
    };
  }
  // Words gained or lost that are not accounted for by the above.
  const wa = new Set(normLoose(a).split(" ").filter(Boolean));
  const wb = new Set(normLoose(b).split(" ").filter(Boolean));
  const lost = [...wa].filter((w) => !wb.has(w));
  const gained = [...wb].filter((w) => !wa.has(w));
  return {
    klass: "substantive",
    basis: `words lost ${JSON.stringify(lost.slice(0, 6))}, gained ${JSON.stringify(gained.slice(0, 6))}`,
    lost,
    gained,
  };
}

/** The original region a generated marker covers, and the text now in its place. */
function beforeAfterFor(original, revised, marker) {
  const align = markerSpanAlignment(original, revised, marker.start, marker.end);
  return {
    before: align.origRegionText,
    after: align.revSpanText,
  };
}

/**
 * Replay one raw model output through finalize and collect every marker the
 * unreported-change detector generated.
 */
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
      const { before, after } = beforeAfterFor(draft, revised, m);
      const cls = classifyChange(before, after);
      // Which concern, if any, the detector attributed the change to. Read
      // from the note's reason clause, which is where the attribution lands.
      const attributed = concerns.find((c) =>
        normLoose(c.statementText).includes(normLoose(before || after).slice(0, 40))
      );
      const editorialRules = (attributed?.editorial ?? []).map((e) => e.rule).filter(Boolean);
      return {
        label,
        before,
        after,
        klass: cls.klass,
        basis: cls.basis,
        attributedStatement: attributed ? trunc(attributed.statementText, 70) : null,
        attributedEvidenceKind: attributed?.evidence?.kind ?? null,
        attributedEditorialRules: editorialRules,
        craftAttributed: editorialRules.length > 0 && !attributed?.evidence?.kind,
        note: m.note,
        intent: m.intent,
      };
    });
}

async function diagnoseUnreported(liveRuns) {
  const r10 = await statementsOf("suggest-after-r10-review1.json");
  const condB = await statementsOf("condition-b-review.json");
  const draftFor = new Map([
    ["suggest-after-r10-review1.json", { statements: r10 }],
    ["condition-b-review.json", { statements: condB }],
  ]);

  const findings = [];
  for (const [runFile, reviewFile] of RAW_RUNS) {
    if (!existsSync(path.join(OUT_DIR, runFile))) continue;
    const run = JSON.parse(await readFile(path.join(OUT_DIR, runFile), "utf8"));
    if (typeof run.raw !== "string" || !run.raw.trim()) continue;
    const { statements } = draftFor.get(reviewFile);
    const draft = statements.map((s) => norm(s.text)).join(" ");
    const concerns = gatherConcerns(statements, null);
    findings.push(
      ...unreportedFrom(runFile.replace(/\.json$/, ""), draft, concerns, run.raw)
    );
  }
  for (const r of liveRuns) findings.push(...r.unreportedFindings);
  return findings;
}

/* ------------------------------------------------------------------ *
 * Part 3: live runs
 * ------------------------------------------------------------------ */

async function meridianArm() {
  const draft = (
    await readFile(path.join(FIXTURE_DIR, "meridian_production_original.txt"), "utf8")
  ).trim();
  const statements = await statementsOf("coverage-gap-review.json");
  return { id: "MERIDIAN", draft, statements, concerns: gatherConcerns(statements, null) };
}

async function r10Arm() {
  const statements = await statementsOf("suggest-after-r10-review1.json");
  // No draftText is stored on the r10 artefact; the draft is its statements in
  // order. Used to exercise the key-person and recommendation sentences, which
  // the Meridian fixture does not contain.
  const draft = statements.map((s) => norm(s.text)).join(" ");
  return { id: "R10", draft, statements, concerns: gatherConcerns(statements, null) };
}

async function suggestOnce(arm, seed) {
  const opts = { outputType: "reporting_commentary", requiredVersion: "complete" };
  const prompt = buildRevisionPrompt(arm.draft, arm.concerns, opts);
  const completion = await callLLM({
    provider: cfg.provider,
    model: cfg.model,
    temperature: 0,
    seed,
    messages: [{ role: "user", content: prompt }],
    traceName: "register-and-craft",
    spanName: `${arm.id}-run${seed}`,
    metadata: { route: "register-and-craft", arm: arm.id, seed },
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

  const markerOn = (needle) =>
    finalized.markers.find((mk) => revised.slice(mk.start, mk.end).includes(needle)) ?? null;
  const noteOn = (needle) => {
    const m = markerOn(needle);
    if (!m) return revised.includes(needle) ? "no marker" : "absent";
    if (m.note === LOUD_NOTE) return "LOUD";
    if (m.note === QUIET_NOTE) return "QUIET";
    return "other";
  };

  return {
    arm: arm.id,
    seed,
    raw,
    revised,
    targets: Object.fromEntries(TARGETS.map(([k, n]) => [k, revised.includes(n)])),
    keyPerson: noteOn(KEY_PERSON),
    diligence: noteOn(DILIGENCE),
    recommendation: noteOn("recommend"),
    recommendationNote: markerOn("recommend")?.note ?? null,
    keyPersonNote: markerOn(KEY_PERSON)?.note ?? null,
    markers: finalized.markers.map((m) => ({
      intent: m.intent,
      note: m.note,
      span: revised.slice(m.start, m.end),
      generated: Boolean(m.generated),
    })),
    loud: finalized.markers.filter((m) => m.note === LOUD_NOTE).length,
    quiet: finalized.markers.filter((m) => m.note === QUIET_NOTE).length,
    unreported: finalized.unreportedEvents?.length ?? 0,
    unreportedFindings: unreportedFrom(`live-${arm.id}-run${seed}`, arm.draft, arm.concerns, raw),
    statementOutcomes: arm.statements.map((s, i) => ({
      index: i,
      text: norm(s.text ?? ""),
      preserved: normLoose(revised).includes(normLoose(norm(s.text ?? ""))),
    })),
    usage: completion?.usage ?? null,
    cost: completion?.usage ? calculateLlmCostUsd(cfg.provider, cfg.model, completion.usage) : 0,
  };
}

/**
 * A statement is INSIDE the band when it did not hold across the three runs, or
 * the reference arm already showed it moving. Vacuous-control guard: a control
 * that never held on the reference arm cannot count against this change.
 */
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

async function referenceMapFor(arm) {
  const map = new Map();
  const drafts = [];
  if (arm.id === "MERIDIAN") {
    try {
      const prior = JSON.parse(
        await readFile(path.join(OUT_DIR, "silence-never-edits-prompt.json"), "utf8")
      );
      drafts.push(...prior.meridian.runs.map((r) => r.revised));
    } catch {
      /* no reference */
    }
  } else {
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
  for (const s of arm.statements) {
    const text = normLoose(norm(s.text ?? ""));
    // Held on the reference arm only if every reference run preserved it.
    map.set(text, drafts.length > 0 && drafts.every((d) => normLoose(d).includes(text)));
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log("=== PART 1, REGISTER SWEEP, BEFORE AND AFTER ===\n");
  const rows = await sweep();
  const tally = (key) =>
    rows.reduce((a, r) => ({ ...a, [r[key]]: (a[r[key]] || 0) + 1 }), {});
  for (const r of rows) {
    const flag = r.moved ? " <== MOVED" : "";
    console.log(
      `  ${r.before.padEnd(8)} -> ${r.after.padEnd(8)} ${r.artefact} S${r.statementIndex}  ${trunc(r.element, 62)}${flag}`
    );
    if (r.moved) console.log(`           signal: ${r.afterSignal}`);
  }
  console.log(`\n  ${rows.length} flagged elements`);
  console.log(`  before: ${JSON.stringify(tally("before"))}`);
  console.log(`  after:  ${JSON.stringify(tally("after"))}`);
  console.log(`  moved:  ${rows.filter((r) => r.moved).length}\n`);

  let liveRuns = [];
  let controls = {};
  if (!hasProviderApiKey(cfg.provider)) {
    console.log("no provider API key; skipping Part 3");
  } else {
    for (const arm of [await meridianArm(), await r10Arm()]) {
      console.log(`\n=== PART 3, ARM ${arm.id}, ${RUNS} RUNS (${cfg.model}) ===\n`);
      const armRuns = [];
      for (let seed = 1; seed <= RUNS; seed++) {
        const r = await suggestOnce(arm, seed);
        armRuns.push(r);
        console.log(
          `  run${seed}  keyPerson=${r.keyPerson}  diligence=${r.diligence}  recommendation=${r.recommendation}` +
            `  LOUD=${r.loud} QUIET=${r.quiet} unreported=${r.unreported}` +
            (arm.id === "MERIDIAN"
              ? `  date=${r.targets["In June 2026,"] ? "kept" : "LOST"} equity=${r.targets["equity cheque"] ? "kept" : "LOST"}`
              : "")
        );
      }
      const scored = scoreControls(armRuns, await referenceMapFor(arm));
      controls[arm.id] = scored;
      console.log(`\n  controls: ${scored.length} statements`);
      for (const v of ["HELD", "INSIDE BAND", "OUTSIDE BAND", "VACUOUS"]) {
        console.log(`    ${v.padEnd(13)} ${scored.filter((c) => c.verdict === v).length}`);
      }
      for (const c of scored.filter((c) => c.verdict === "OUTSIDE BAND")) {
        console.log(`    OUTSIDE  S${c.index} ${trunc(c.text, 76)}`);
      }
      liveRuns.push(...armRuns);
    }
  }

  console.log("\n=== PART 2, UNREPORTED CHANGES, DIAGNOSIS ONLY ===\n");
  const findings = await diagnoseUnreported(liveRuns);
  for (const f of findings) {
    console.log(`  [${f.klass}] ${f.label}`);
    console.log(`      before: ${JSON.stringify(trunc(f.before, 76))}`);
    console.log(`      after : ${JSON.stringify(trunc(f.after, 76))}`);
    console.log(`      basis : ${f.basis}`);
    console.log(
      `      concern: evidence=${f.attributedEvidenceKind ?? "none"} editorial=${JSON.stringify(f.attributedEditorialRules)} craftOnly=${f.craftAttributed}`
    );
    console.log(`      note  : ${trunc(f.note, 120)}`);
  }
  const mechanical = findings.filter((f) => f.klass === "mechanical");
  const substantive = findings.filter((f) => f.klass === "substantive");
  const craftOnly = findings.filter((f) => f.craftAttributed);
  const substantiveCraftAttributed = substantive.filter((f) => f.craftAttributed);
  console.log(`\n  d1: ${findings.length} total, ${mechanical.length} mechanical, ${substantive.length} substantive`);
  console.log(`  d2: ${craftOnly.length} craft-attributed, of which ${substantiveCraftAttributed.length} are SUBSTANTIVE`);
  for (const f of substantiveCraftAttributed) {
    console.log(`      would be wrongly exempted: ${JSON.stringify(trunc(f.before, 60))} -> ${JSON.stringify(trunc(f.after, 60))}`);
  }

  const cost = liveRuns.reduce((a, r) => a + r.cost, 0);
  const cachedIn = liveRuns.reduce((a, r) => a + (r.usage?.cachedInputTokens ?? 0), 0);
  const totalIn = liveRuns.reduce(
    (a, r) => a + (r.usage?.promptTokens ?? r.usage?.inputTokens ?? 0),
    0
  );
  console.log(`\ncost $${cost.toFixed(4)} over ${liveRuns.length} calls, cache hit ${pct(cachedIn, totalIn)}`);

  await writeFile(
    path.join(OUT_DIR, "register-and-craft.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        model: cfg.model,
        sweep: rows,
        sweepTally: { before: tally("before"), after: tally("after") },
        unreported: findings,
        unreportedSummary: {
          total: findings.length,
          mechanical: mechanical.length,
          substantive: substantive.length,
          craftAttributed: craftOnly.length,
          substantiveCraftAttributed: substantiveCraftAttributed.length,
        },
        liveRuns: liveRuns.map(({ raw, ...rest }) => ({ ...rest, rawLength: raw.length })),
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
    "| artefact | S | kind | flagged element | before | after | deciding signal after |",
    "| --- | ---: | --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.artefact} | ${r.statementIndex} | ${r.kind ?? "\u2014"} | ${mdCell(trunc(r.element, 64))} | ${r.before} | ${r.moved ? `**${r.after}**` : r.after} | ${mdCell(r.afterSignal)} |`
    ),
  ].join("\n");

  const unreportedTable = [
    "| run | before | after | class | basis | craft-attributed | note the user sees |",
    "| --- | --- | --- | --- | --- | :-: | --- |",
    ...findings.map(
      (f) =>
        `| ${f.label} | ${mdCell(trunc(f.before, 46))} | ${mdCell(trunc(f.after, 46))} | ${f.klass} | ${mdCell(f.basis)} | ${f.craftAttributed ? "y" : ""} | ${mdCell(trunc(f.note, 90))} |`
    ),
  ].join("\n");

  await writeFile(
    path.join(OUT_DIR, "register-and-craft.tables.md"),
    `${sweepTable}\n\n${unreportedTable}\n`,
    "utf8"
  );

  console.log("\nwrote register-and-craft.json and .tables.md");
  await flushObservability();
}

main().catch(async (err) => {
  console.error(err);
  await flushObservability();
  process.exit(1);
});
