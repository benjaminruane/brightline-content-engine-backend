#!/usr/bin/env node
/**
 * Does per-statement revision still earn its place under the principle?
 *
 * cd9a666 justified stage 1 on the equity cheque, which is a SILENCE case and
 * is now out of scope: silence is flagged, never edited. So the value has to be
 * re-established on what remains — conflicts, source-stated values, and
 * editorial or compliance directives.
 *
 * Both fixture families, because Meridian carries no conflict and R10 does.
 * Three runs per arm per fixture. Same committed Reviews, no Review re-run.
 *
 * Usage: node scripts/diagnostic/revise/stage1-under-the-principle.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
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
const { runStage1, stage1SendDecision, directivesOn, OUTCOME_SILENCE_NOT_SENT } = await import(
  "../../../lib/revise-stage1.mjs"
);
const { findingRestsOnSilence, tightestUnsupportedSpans } = await import(
  "../../../lib/revise-author-statement.mjs"
);
const { flagRegister } = await import("../../../lib/revise-flag-register.mjs");
const { buildWhatClause } = await import("../../../lib/pr9-note-what-from-diff.mjs");
const { markerSpanAlignment } = await import("../../../lib/pr9-marker-span-status.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const FIXTURE_DIR = path.join(__dirname, "fixtures");
const cfg = STAGE_MODELS["writing-rewrite"];
const RUNS = 3;

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const nl = (s) => norm(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[.,;:]/g, "");
const trunc = (s, n = 72) => {
  const t = norm(s);
  return t.length <= n ? t : `${t.slice(0, n - 1)}\u2026`;
};
const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "\u2014");
const stripMarkers = (s) => String(s ?? "").replace(/\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g, "$1");

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

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

async function meridianFixture() {
  const draft = (
    await readFile(path.join(FIXTURE_DIR, "meridian_production_original.txt"), "utf8")
  ).trim();
  const sourceText = await readFile(
    path.join(FIXTURE_DIR, "meridian_production_source.txt"),
    "utf8"
  ).catch(() => "");
  const statements = await statementsOf("coverage-gap-review.json");
  return {
    id: "MERIDIAN",
    org: "Partners Group",
    draft,
    sourceText,
    statements,
    knownText: JSON.stringify(statements),
    knownFigures: new Set(numbersIn(`${draft} ${sourceText} ${JSON.stringify(statements)}`)),
    concerns: gatherConcerns(statements, null),
  };
}

async function r10Fixture() {
  const statements = await statementsOf("suggest-after-r10-review1.json");
  const draft = statements.map((s) => norm(s.text)).join(" ");
  const sourceText = statements
    .map((s) => s?.qcCard?.evidence?.sourcePassage ?? s?.qcCard?.evidence?.excerpt ?? "")
    .filter(Boolean)
    .join(" ");
  return {
    id: "R10",
    org: "Halden Group",
    draft,
    sourceText,
    statements,
    knownText: JSON.stringify(statements),
    knownFigures: new Set(numbersIn(`${draft} ${sourceText} ${JSON.stringify(statements)}`)),
    concerns: gatherConcerns(statements, null),
  };
}

/* ------------------------------------------------------------------ *
 * What each fixture is being scored on
 * ------------------------------------------------------------------ */

/** Every conflict finding, with the value the source states. */
function conflictsIn(fixture) {
  return fixture.concerns
    .filter((c) => c.evidence?.kind === "conflict" || c.evidence?.verdict === "conflicting")
    .map((c) => ({
      statementIndex: c.statementIndex,
      statementText: norm(c.statementText),
      sourcePassage: norm(c.evidence?.sourcePassage ?? c.evidence?.excerpt ?? ""),
      reason: norm(c.evidence?.reason ?? ""),
    }));
}

/** Every editorial or compliance concern carrying an explicit instruction. */
function directivesIn(fixture) {
  const out = [];
  for (const c of fixture.concerns) {
    for (const d of directivesOn(c)) {
      out.push({
        statementIndex: c.statementIndex,
        statementText: norm(c.statementText),
        rule: d.rule ?? d.kind ?? "unnamed",
        direction: norm(d.suggestedDirection),
      });
    }
  }
  return out;
}

/** Every finding that rests on silence, which BOTH arms must leave alone. */
function silenceIn(fixture) {
  return fixture.concerns
    .filter((c) => c.evidence?.kind && findingRestsOnSilence(c).silence)
    .map((c) => {
      const spans = tightestUnsupportedSpans(c);
      const element = spans.length > 0 ? spans[0].text : c.statementText;
      return {
        statementIndex: c.statementIndex,
        statementText: norm(c.statementText),
        element: norm(element),
        expectedRegister: flagRegister(c, null, element, { authoringOrganisation: fixture.org })
          .register,
      };
    });
}

/* ------------------------------------------------------------------ *
 * Scoring one revised draft
 * ------------------------------------------------------------------ */

/**
 * Did the revised prose take the source's value, or duck it with a hedge?
 * The value is looked for as a number, because that is what a conflict is
 * about, and hedging is what the prompt is known to fall back on.
 */
const HEDGES = /\b(?:material|significant|strong|broadly|approximately in line|solid|robust)\b/i;

function numbersIn(text) {
  return (String(text ?? "").match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
}

/**
 * Locate the statement's descendant in the revised draft. A prefix match will
 * not do: a correctly acted-on conflict changes the opening words, which is
 * precisely the case being scored. So the sentence is found by token overlap.
 */
function bestSentence(revised, statement) {
  const want = new Set(nl(statement).split(" ").filter((w) => w.length > 3));
  let best = "";
  let bestScore = 0;
  for (const s of stripMarkers(revised).split(/(?<=[.!?])\s+/)) {
    const got = nl(s).split(" ").filter((w) => want.has(w)).length;
    if (got > bestScore) {
      bestScore = got;
      best = s;
    }
  }
  return bestScore >= 3 ? best : "";
}

function scoreConflict(conflict, original, revised, knownFigures) {
  const sentence = bestSentence(revised, conflict.statementText);
  const statementUnchanged = nl(stripMarkers(revised)).includes(nl(conflict.statementText));

  // The source's distinguishing wording: content words it uses that the draft
  // did not. A conflict is not always numeric — R10's is a verb, "has returned"
  // against "is currently marked at" — so wording is scored, not just figures.
  const draftWords = new Set(nl(conflict.statementText).split(" "));
  const sourceOnly = [...new Set(nl(conflict.sourcePassage).split(" "))].filter(
    (w) => w.length > 3 && !draftWords.has(w) && !/^\d/.test(w)
  );
  const adopted = sourceOnly.filter((w) => nl(sentence).split(" ").includes(w));

  const before = numbersIn(conflict.statementText);
  const after = numbersIn(sentence);
  const figuresKept = before.every((n) => after.includes(n));

  let outcome;
  if (statementUnchanged) outcome = "not acted on";
  else if (adopted.length > 0 && figuresKept) outcome = "acted on, source value";
  else if (adopted.length > 0) outcome = "acted on, source wording, figure moved";
  else if (HEDGES.test(sentence)) outcome = "acted on, HEDGED";
  else outcome = "edited, source wording not adopted";

  return {
    ...conflict,
    outcome,
    adopted,
    revisedSentence: norm(sentence),
    inventedFigures: numbersIn(sentence).filter((n) => !knownFigures.has(n)),
  };
}

/**
 * Was the directive followed? A directive names the span and says what to do,
 * so the test is whether that span is still there.
 */
function scoreDirective(directive, revised) {
  const quoted = /'([^']{6,})'/.exec(directive.direction);
  const target = quoted ? quoted[1] : null;
  const plain = stripMarkers(revised);
  if (!target) {
    return {
      ...directive,
      target: null,
      followed: !nl(plain).includes(nl(directive.statementText)),
      note: "no quoted span in the direction; scored on whether the statement moved at all",
    };
  }
  return { ...directive, target, followed: !nl(plain).includes(nl(target)) };
}

/** Silence must be untouched, and carry a register marker, on BOTH arms. */
function scoreSilence(item, revised) {
  const plain = stripMarkers(revised);
  const preserved = nl(plain).includes(nl(item.statementText));
  const marked = /No supplied source/.test(revised);
  // The principle's sharpest failure: the statement was silent, and the arm put
  // a figure into it that the author never wrote.
  const sentence = bestSentence(revised, item.statementText);
  const before = new Set(numbersIn(item.statementText));
  const substituted = preserved ? [] : numbersIn(sentence).filter((n) => !before.has(n));
  return { ...item, preserved, marked, substituted, revisedSentence: norm(sentence) };
}

/**
 * FIDELITY. A named entity, date or figure in the revised draft that appears in
 * neither the original nor the source is an invention.
 */
function fidelityBreaches(original, revised, sourceText, knownText) {
  const corpus = `${original} ${sourceText} ${knownText}`;
  const known = new Set([...numbersIn(corpus), ...(corpus.match(/\b[A-Z][a-zA-Z&'-]+\b/g) ?? [])]);
  const plain = stripMarkers(revised);
  const invented = [];
  for (const n of new Set(numbersIn(plain))) if (!known.has(n)) invented.push(`figure ${n}`);
  for (const w of new Set(plain.match(/\b[A-Z][a-zA-Z&'-]+\b/g) ?? [])) {
    if (!known.has(w)) invented.push(`name ${w}`);
  }
  return invented;
}

/** NOTES. A note claiming a change on a span the alignment calls unchanged. */
function noteBreaches(original, revised, markers) {
  const claims = /^(Added|Removed|Replaced|Deleted)\b/;
  const out = [];
  for (const m of markers) {
    const clause = buildWhatClause(original, revised, m.start, m.end).clause;
    const changed = markerSpanAlignment(original, revised, m.start, m.end).spanStatus === "CHANGED";
    if (claims.test(norm(clause)) && !changed) {
      out.push({ span: revised.slice(m.start, m.end), clause, note: m.note });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The two arms
 * ------------------------------------------------------------------ */

async function runOld(fixture, seed) {
  const prompt = buildRevisionPrompt(fixture.draft, fixture.concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  const completion = await callLLM({
    provider: cfg.provider,
    model: cfg.model,
    temperature: 0,
    seed,
    messages: [{ role: "user", content: prompt }],
    traceName: "stage1-under-the-principle",
    spanName: `OLD-${fixture.id}-run${seed}`,
    metadata: { route: "stage1-under-the-principle", arm: "OLD", fixture: fixture.id, seed },
  });
  const raw = String(completion?.text ?? "")
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();
  return {
    raw,
    usages: completion?.usage ? [completion.usage] : [],
    stage1Events: [],
    calls: 1,
  };
}

async function runNew(fixture, seed) {
  const usages = [];
  let calls = 0;
  const out = await runStage1(fixture.draft, fixture.concerns, {
    sourceText: fixture.sourceText,
    authoringOrganisation: fixture.org,
    callModel: async (stagePrompt, meta) => {
      calls += 1;
      const completion = await callLLM({
        provider: cfg.provider,
        model: cfg.model,
        temperature: 0,
        seed,
        responseFormat: "json",
        messages: [{ role: "user", content: stagePrompt }],
        traceName: "stage1-under-the-principle",
        spanName: `NEW-${fixture.id}-run${seed}-s${meta.index}`,
        metadata: {
          route: "stage1-under-the-principle",
          arm: "NEW",
          fixture: fixture.id,
          seed,
          kind: meta.kind,
        },
      });
      if (completion?.usage) usages.push(completion.usage);
      return { text: completion?.text ?? "", usage: completion?.usage ?? null };
    },
  });
  return { raw: out.revisedDraft, usages, stage1Events: out.events, calls };
}

async function measure(fixture, arm, seed) {
  const armRun = arm === "OLD" ? runOld : runNew;
  const { raw, usages, stage1Events, calls } = await armRun(fixture, seed);

  const finalized = finalizeSuggestRevisionText(raw, {
    originalDraft: fixture.draft,
    concerns: fixture.concerns,
    deterministicUnsupportedRemoval: false,
    log: () => {},
  });
  const revised = finalized.revisedDraft;

  const cost = usages.reduce((a, u) => a + calculateLlmCostUsd(cfg.provider, cfg.model, u), 0);
  const cachedIn = usages.reduce((a, u) => a + (u.cachedInputTokens ?? 0), 0);
  const totalIn = usages.reduce((a, u) => a + (u.promptTokens ?? u.inputTokens ?? 0), 0);

  return {
    arm,
    fixture: fixture.id,
    seed,
    revised,
    calls,
    conflicts: conflictsIn(fixture).map((c) =>
      scoreConflict(c, fixture.draft, revised, fixture.knownFigures)
    ),
    directives: directivesIn(fixture).map((d) => scoreDirective(d, revised)),
    silence: silenceIn(fixture).map((s) => scoreSilence(s, revised)),
    fidelity: fidelityBreaches(fixture.draft, revised, fixture.sourceText, fixture.knownText),
    notes: noteBreaches(fixture.draft, revised, finalized.markers),
    stage1Events,
    silenceNotSent: stage1Events.filter((e) => e.outcome === OUTCOME_SILENCE_NOT_SENT).length,
    rejected: stage1Events.filter((e) => e.outcome === "rejected").length,
    exempt: stage1Events.filter((e) => e.outcome === "author_statement_exempt").length,
    // Prose and marker structure, scored apart from note text per 8145ef3.
    proseSignature: nl(stripMarkers(revised)),
    markerSignature: JSON.stringify(
      finalized.markers.map((m) => [m.intent, nl(revised.slice(m.start, m.end))])
    ),
    cost,
    cacheHit: totalIn ? cachedIn / totalIn : 0,
  };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  const fixtures = [await meridianFixture(), await r10Fixture()];

  console.log("=== PART 0d, WHAT STAGE 1 SENDS, BEFORE AND AFTER THE RESTRICTION ===\n");
  const sendCounts = [];
  for (const f of fixtures) {
    const now = f.concerns.length;
    const after = f.concerns.filter((c) => stage1SendDecision(c).send).length;
    sendCounts.push({ fixture: f.id, before: now, after });
    console.log(`  ${f.id.padEnd(9)} concerns ${now}, sent now ${now}, sent after ${after}`);
    for (const c of f.concerns) {
      const d = stage1SendDecision(c);
      console.log(
        `    S${String(c.statementIndex).padEnd(2)} ${d.send ? "SEND" : "hold"}  ${trunc(c.statementText, 52)}`
      );
      console.log(`         ${d.reason}`);
    }
    console.log("");
  }

  if (!hasProviderApiKey(cfg.provider)) {
    console.log("no provider API key; cannot measure");
    return;
  }

  const runs = [];
  for (const fixture of fixtures) {
    for (const arm of ["OLD", "NEW"]) {
      console.log(`\n=== ${arm}, ${fixture.id}, ${RUNS} RUNS (${cfg.model}) ===\n`);
      for (let seed = 1; seed <= RUNS; seed++) {
        const r = await measure(fixture, arm, seed);
        runs.push(r);
        const conf = r.conflicts.map((c) => c.outcome).join(" | ") || "none";
        const dirs = r.directives.map((d) => `${d.rule}=${d.followed ? "yes" : "NO"}`).join(" | ") || "none";
        const sil = `${r.silence.filter((s) => s.preserved).length}/${r.silence.length} preserved`;
        console.log(
          `  run${seed} calls=${r.calls} conflicts[${conf}] directives[${dirs}] silence[${sil}]` +
            ` fidelity=${r.fidelity.length} notes=${r.notes.length}` +
            (arm === "NEW" ? ` notSent=${r.silenceNotSent} rejected=${r.rejected}` : "")
        );
        for (const c of r.conflicts) console.log(`       conflict S${c.statementIndex}: ${trunc(c.revisedSentence, 92)}`);
        for (const b of r.fidelity) console.log(`       FIDELITY invention: ${b}`);
        for (const sb of r.silence.filter((x) => x.substituted.length)) {
          console.log(
            `       SUBSTITUTION ON SILENCE S${sb.statementIndex}: added ${sb.substituted.join(", ")} -> ${trunc(sb.revisedSentence, 76)}`
          );
        }
        for (const n of r.notes) console.log(`       NOTE: ${trunc(n.clause, 80)}`);
        for (const e of r.stage1Events.filter((x) => x.outcome === "rejected")) {
          console.log(`       REJECTED ${e.reason}: ${trunc(e.detail ?? "", 84)}`);
          console.log(`         on: ${trunc(e.statementText, 84)}`);
        }
      }
    }
  }

  /* ---- tallies ---- */
  const armFix = (arm, fx) => runs.filter((r) => r.arm === arm && r.fixture === fx);
  const conflictTable = [];
  const directiveTable = [];
  const silenceTable = [];
  for (const fixture of fixtures) {
    for (const arm of ["OLD", "NEW"]) {
      const rs = armFix(arm, fixture.id);
      if (!rs.length) continue;
      const nConf = rs[0].conflicts.length;
      for (let i = 0; i < nConf; i++) {
        const hits = rs.filter((r) => r.conflicts[i].outcome === "acted on, source value").length;
        conflictTable.push({
          fixture: fixture.id,
          arm,
          statementIndex: rs[0].conflicts[i].statementIndex,
          statement: rs[0].conflicts[i].statementText,
          sourceValue: rs[0].conflicts[i].sourcePassage,
          actedWithSourceValue: `${hits}/${rs.length}`,
          outcomes: rs.map((r) => r.conflicts[i].outcome),
        });
      }
      const nDir = rs[0].directives.length;
      for (let i = 0; i < nDir; i++) {
        const hits = rs.filter((r) => r.directives[i].followed).length;
        directiveTable.push({
          fixture: fixture.id,
          arm,
          rule: rs[0].directives[i].rule,
          target: rs[0].directives[i].target,
          followed: `${hits}/${rs.length}`,
        });
      }
      const nSil = rs[0].silence.length;
      let preservedAll = 0;
      for (let i = 0; i < nSil; i++) {
        if (rs.every((r) => r.silence[i].preserved)) preservedAll += 1;
      }
      silenceTable.push({
        fixture: fixture.id,
        arm,
        preservedInEveryRun: `${preservedAll}/${nSil}`,
        substitutionsOnSilence: rs.reduce(
          (a, r) => a + r.silence.filter((x) => x.substituted.length).length,
          0
        ),
        stable: rs.every((r) => r.proseSignature === rs[0].proseSignature),
      });
    }
  }

  console.log("\n\n=== CONFLICTS ===");
  for (const c of conflictTable) {
    console.log(
      `  ${c.fixture.padEnd(9)} ${c.arm.padEnd(4)} S${c.statementIndex} source-value ${c.actedWithSourceValue}  [${c.outcomes.join(", ")}]`
    );
  }
  console.log("\n=== DIRECTIVES ===");
  for (const d of directiveTable) {
    console.log(`  ${d.fixture.padEnd(9)} ${d.arm.padEnd(4)} ${d.rule.padEnd(30)} followed ${d.followed}`);
  }
  console.log("\n=== SILENCE ===");
  for (const s of silenceTable) {
    console.log(
      `  ${s.fixture.padEnd(9)} ${s.arm.padEnd(4)} preserved in every run ${s.preservedInEveryRun}  substitutions ${s.substitutionsOnSilence}  prose stable=${s.stable}`
    );
  }

  console.log("\n=== COST ===");
  const costRows = [];
  for (const fixture of fixtures) {
    for (const arm of ["OLD", "NEW"]) {
      const rs = armFix(arm, fixture.id);
      if (!rs.length) continue;
      const cost = rs.reduce((a, r) => a + r.cost, 0);
      const calls = rs.reduce((a, r) => a + r.calls, 0);
      const hit = rs.reduce((a, r) => a + r.cacheHit, 0) / rs.length;
      costRows.push({ fixture: fixture.id, arm, cost, calls, cacheHit: hit });
      console.log(
        `  ${fixture.id.padEnd(9)} ${arm.padEnd(4)} $${cost.toFixed(4)} over ${calls} calls, cache ${pct(Math.round(hit * 100), 100)}`
      );
    }
  }
  const total = runs.reduce((a, r) => a + r.cost, 0);
  console.log(`\n  total $${total.toFixed(4)}`);

  await writeFile(
    path.join(OUT_DIR, "stage1-under-the-principle.json"),
    `${JSON.stringify(
      { ranAt: new Date().toISOString(), model: cfg.model, sendCounts, runs, conflictTable, directiveTable, silenceTable, costRows, total },
      null,
      2
    )}\n`,
    "utf8"
  );

  const md = [
    "| fixture | arm | conflict | source value carried |",
    "| --- | --- | --- | ---: |",
    ...conflictTable.map(
      (c) => `| ${c.fixture} | ${c.arm} | S${c.statementIndex} ${mdCell(trunc(c.statement, 44))} | ${c.actedWithSourceValue} |`
    ),
    "",
    "| fixture | arm | directive | followed |",
    "| --- | --- | --- | ---: |",
    ...directiveTable.map((d) => `| ${d.fixture} | ${d.arm} | ${mdCell(d.rule)} | ${d.followed} |`),
  ].join("\n");
  await writeFile(path.join(OUT_DIR, "stage1-under-the-principle.tables.md"), `${md}\n`, "utf8");
  console.log("\nwrote stage1-under-the-principle.json and .tables.md");
  await flushObservability();
}

main().catch(async (err) => {
  console.error(err);
  await flushObservability();
  process.exit(1);
});
