import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { joinKey, padFixtureId } from "../accuracy/lib.mjs";
import { mapVariantB } from "./map-variant-b.mjs";
import {
  collectQuotesFromA,
  collectQuotesFromB,
  loadControlSet,
  locatabilityFromQuotes,
  rowsFromVariantA,
  rowsFromVariantB,
  scoreRows,
} from "./score-bakeoff.mjs";

const RUNS = path.join(import.meta.dirname, "runs");
const { labels, groupAKeys, groupBKeys } = await loadControlSet();

async function loadRun(name) {
  return JSON.parse(await readFile(path.join(RUNS, name), "utf8"));
}

function scoreA(run) {
  const aStatements = [];
  const sourceByFixture = new Map();
  for (const fx of run.fixtures || []) {
    sourceByFixture.set(padFixtureId(fx.fixtureId), fx.sources || []);
    for (const s of fx.statements || []) {
      aStatements.push({
        fixtureId: padFixtureId(fx.fixtureId),
        statementText: s.statementText,
        occurrence: s.occurrence,
        overall: s.overall,
        sources: s.sources,
      });
    }
  }
  const loc = locatabilityFromQuotes(collectQuotesFromA(run.fixtures, sourceByFixture));
  const rows = rowsFromVariantA(labels, aStatements);
  return { scored: scoreRows(rows, { groupAKeys, groupBKeys, locatability: loc, offList: [] }), rows, run };
}

function scoreB(run) {
  const findings = [];
  const stmts = labels.map((l) => ({
    fixtureId: padFixtureId(l.fixtureId),
    statementText: l.statementText,
    occurrence: l.occurrence,
  }));
  for (const fx of run.fixtures || []) {
    for (const f of fx.findings || []) {
      findings.push({ ...f, fixtureId: padFixtureId(fx.fixtureId) });
    }
  }
  const mapped = mapVariantB({ findings, statements: stmts });
  const sourceByFixture = new Map((run.fixtures || []).map((fx) => [padFixtureId(fx.fixtureId), fx.sources || []]));
  const loc = locatabilityFromQuotes(collectQuotesFromB(findings, sourceByFixture));
  const rows = rowsFromVariantB(labels, mapped);
  return {
    scored: scoreRows(rows, { groupAKeys, groupBKeys, locatability: loc, offList: mapped.offList }),
    rows,
    mapped,
    run,
  };
}

function stability(rows1, rows2) {
  let same = 0;
  const moved = [];
  const byKey = new Map(rows2.map((r) => [joinKey(r.fixtureId, r.statementText, r.occurrence), r]));
  for (const a of rows1) {
    const b = byKey.get(joinKey(a.fixtureId, a.statementText, a.occurrence));
    if (!b) continue;
    if (a.mapped === b.mapped) same += 1;
    else moved.push({ fixtureId: a.fixtureId, statementText: a.statementText, run1: a.mapped, run2: b.mapped });
  }
  return { n: rows1.length, same, moved };
}

function diagnostic(rows, span) {
  const hit = rows.find((r) => String(r.statementText).includes(span));
  if (!hit) return null;
  return {
    fixtureId: hit.fixtureId,
    mapped: hit.mapped,
    ben: hit.ben,
    detected: hit.mapped !== "confirmed",
    silent: hit.silent === true,
    statementText: hit.statementText,
  };
}

const F13 = "employs 320 people";
const F18 = "ARR growth from EUR 38 million";

function compactScore(name, pack) {
  const s = pack.scored;
  return {
    name,
    costUsd: pack.run.costUsd,
    wallClockMs: pack.run.wallClockMs,
    decision: s.decision,
    groupAAgreement: s.groupAAgreement,
    groupADetection: s.groupADetection,
    groupBAgreement: s.groupBAgreement,
    leaveAlone: s.accuracy.groupB.amongBenConfirmed,
    coverage: s.coverage,
    partialsIgnored: s.partialsIgnored,
    locatability: s.locatability,
    offListCount: (s.offList || []).length,
    f13: diagnostic(pack.rows, F13),
    f18: diagnostic(pack.rows, F18),
  };
}

function aPerSource(run, span) {
  for (const fx of run.fixtures || []) {
    for (const s of fx.statements || []) {
      if (String(s.statementText).includes(span)) {
        return { fixtureId: fx.fixtureId, overall: s.overall, sources: s.sources };
      }
    }
  }
  return null;
}

const a1 = scoreA(await loadRun("variant-a-pass-1.json"));
const a2 = scoreA(await loadRun("variant-a-pass-2.json"));
const b1 = scoreB(await loadRun("variant-b-pass-1.json"));
const b2 = scoreB(await loadRun("variant-b-pass-2.json"));

const offListB1 = (b1.scored.offList || []).map((f) => ({
  fixtureId: f.fixtureId,
  draftQuote: f.draftQuote,
  problem: f.problem,
  issueClass: f.issueClass,
  betweenDraftSentences: f.betweenDraftSentences === true,
  mappedLabel: f.mappedLabel,
}));
const offListB2 = (b2.scored.offList || []).map((f) => ({
  fixtureId: f.fixtureId,
  draftQuote: f.draftQuote,
  problem: f.problem,
  issueClass: f.issueClass,
  betweenDraftSentences: f.betweenDraftSentences === true,
  mappedLabel: f.mappedLabel,
}));

const out = {
  totals: {
    a1: a1.run.costUsd,
    a2: a2.run.costUsd,
    b1: b1.run.costUsd,
    b2: b2.run.costUsd,
    all: a1.run.costUsd + a2.run.costUsd + b1.run.costUsd + b2.run.costUsd,
  },
  a1: compactScore("A1", a1),
  a2: compactScore("A2", a2),
  b1: compactScore("B1", b1),
  b2: compactScore("B2", b2),
  stabilityA: stability(a1.rows, a2.rows),
  stabilityB: stability(b1.rows, b2.rows),
  f13A1perSource: aPerSource(a1.run, F13),
  f18A1perSource: aPerSource(a1.run, F18),
  offListB1,
  offListB2,
  betweenDraftOffListB1: offListB1.filter((f) => f.betweenDraftSentences),
  betweenDraftOffListB2: offListB2.filter((f) => f.betweenDraftSentences),
  groupARowsA1: a1.rows.filter((r) => r.group === "A").map((r) => ({
    mapped: r.mapped,
    ben: r.ben,
    text: r.statementText,
  })),
  groupARowsB1: b1.rows.filter((r) => r.group === "A").map((r) => ({
    mapped: r.mapped,
    ben: r.ben,
    silent: r.silent,
    text: r.statementText,
  })),
  groupADisagreementsA1: a1.scored.accuracy.groupA.disagreements,
  groupBDisagreementsA1: a1.scored.accuracy.groupB.disagreements.slice(0, 20),
};

await writeFile(path.join(RUNS, "score-summary.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ totals: out.totals, a1: out.a1, a2: out.a2, b1: out.b1, b2: out.b2, stabilityA: out.stabilityA, stabilityB: out.stabilityB }, null, 2));
