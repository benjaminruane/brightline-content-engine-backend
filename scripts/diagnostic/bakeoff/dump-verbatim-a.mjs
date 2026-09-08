import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { joinKey, padFixtureId } from "../accuracy/lib.mjs";
import {
  collectPassageRowsFromA,
  collectQuotesFromA,
  loadControlSet,
  locatabilityFromPassageRows,
  locatabilityFromQuotes,
  rowsFromVariantA,
  scoreRows,
  validationFromPassageRows,
} from "./score-bakeoff.mjs";

const RUNS = path.join(import.meta.dirname, "runs");
const { labels, groupAKeys, groupBKeys } = await loadControlSet();
const labelledKeys = new Set(labels.map((l) => joinKey(l.fixtureId, l.statementText, l.occurrence)));

async function loadRun(name) {
  return JSON.parse(await readFile(path.join(RUNS, name), "utf8"));
}

function emptyVerdicts(passageRows, rows) {
  const byKey = new Map();
  for (const r of rows) {
    byKey.set(joinKey(r.fixtureId, r.statementText, r.occurrence), r);
  }
  const labelledSlots = passageRows.filter((p) =>
    labelledKeys.has(joinKey(p.fixtureId, p.statementText, p.occurrence))
  );
  const emptySlots = labelledSlots.filter((p) => !String(p.passage || "").trim());
  const stmtEmpty = new Map();
  for (const p of labelledSlots) {
    const key = joinKey(p.fixtureId, p.statementText, p.occurrence);
    const rec = stmtEmpty.get(key) || { any: false, all: true, empties: 0, slots: 0 };
    rec.slots += 1;
    if (!String(p.passage || "").trim()) {
      rec.any = true;
      rec.empties += 1;
    } else {
      rec.all = false;
    }
    stmtEmpty.set(key, rec);
  }
  const counts = { confirmed: 0, partially_confirmed: 0, conflicting: 0, no_support: 0, other: 0 };
  const anyEmptyRows = [];
  for (const [key, rec] of stmtEmpty) {
    if (!rec.any) continue;
    const row = byKey.get(key);
    const mapped = row?.mapped || "unknown";
    if (counts[mapped] != null) counts[mapped] += 1;
    else counts.other += 1;
    anyEmptyRows.push({
      fixtureId: row?.fixtureId,
      mapped,
      ben: row?.ben,
      group: row?.group,
      emptySlots: rec.empties,
      slots: rec.slots,
      allEmpty: rec.all,
      statementText: row?.statementText,
    });
  }
  return {
    labelledSourceSlots: labelledSlots.length,
    emptySourceSlots: emptySlots.length,
    statementsWithAnyEmpty: anyEmptyRows.length,
    statementsAllEmpty: anyEmptyRows.filter((r) => r.allEmpty).length,
    verdictsWhenAnyEmpty: counts,
    anyEmptyRows,
  };
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
  const passageRows = collectPassageRowsFromA(run.fixtures, sourceByFixture);
  const loc = locatabilityFromPassageRows(passageRows);
  const locNonEmptyOnly = locatabilityFromQuotes(collectQuotesFromA(run.fixtures, sourceByFixture));
  const validation = validationFromPassageRows(passageRows);
  const rows = rowsFromVariantA(labels, aStatements);
  const scored = scoreRows(rows, { groupAKeys, groupBKeys, locatability: loc, offList: [] });
  return {
    scored,
    rows,
    run,
    loc,
    locNonEmptyOnly,
    validation,
    empty: emptyVerdicts(passageRows, rows),
  };
}

function diagnostic(rows, span) {
  const hit = rows.find((r) => String(r.statementText).includes(span));
  if (!hit) return null;
  return {
    fixtureId: hit.fixtureId,
    mapped: hit.mapped,
    ben: hit.ben,
    detected: hit.mapped !== "confirmed",
    statementText: hit.statementText,
    sources: hit.sourceMatches,
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

const a1 = scoreA(await loadRun("variant-a-verbatim-pass-1.json"));
const a2 = scoreA(await loadRun("variant-a-verbatim-pass-2.json"));

const out = {
  totals: { a1: a1.run.costUsd, a2: a2.run.costUsd, all: a1.run.costUsd + a2.run.costUsd },
  a1: {
    decision: a1.scored.decision,
    groupAAgreement: a1.scored.groupAAgreement,
    groupADetection: a1.scored.groupADetection,
    groupBAgreement: a1.scored.groupBAgreement,
    groupBDetection: a1.scored.groupBDetection,
    leaveAlone: a1.scored.accuracy.groupB.amongBenConfirmed,
    coverage: a1.scored.coverage,
    partialsIgnored: a1.scored.partialsIgnored,
    locatability: a1.loc,
    locNonEmptyOnly: a1.locNonEmptyOnly,
    validation: a1.validation,
    empty: a1.empty,
    costUsd: a1.run.costUsd,
    wallClockMs: a1.run.wallClockMs,
    f13: diagnostic(a1.rows, "employs 320 people"),
    f18: diagnostic(a1.rows, "ARR growth from EUR 38 million"),
  },
  a2: {
    decision: a2.scored.decision,
    groupAAgreement: a2.scored.groupAAgreement,
    groupADetection: a2.scored.groupADetection,
    groupBAgreement: a2.scored.groupBAgreement,
    groupBDetection: a2.scored.groupBDetection,
    leaveAlone: a2.scored.accuracy.groupB.amongBenConfirmed,
    coverage: a2.scored.coverage,
    partialsIgnored: a2.scored.partialsIgnored,
    locatability: a2.loc,
    locNonEmptyOnly: a2.locNonEmptyOnly,
    validation: a2.validation,
    empty: { ...a2.empty, anyEmptyRows: undefined },
    costUsd: a2.run.costUsd,
    wallClockMs: a2.run.wallClockMs,
    f13: diagnostic(a2.rows, "employs 320 people"),
    f18: diagnostic(a2.rows, "ARR growth from EUR 38 million"),
  },
  stability: stability(a1.rows, a2.rows),
  f13A1perSource: aPerSource(a1.run, "employs 320 people"),
  f13A2perSource: aPerSource(a2.run, "employs 320 people"),
  f18A1perSource: aPerSource(a1.run, "ARR growth from EUR 38 million"),
  f18A2perSource: aPerSource(a2.run, "ARR growth from EUR 38 million"),
  groupADisagreementsA1: a1.scored.accuracy.groupA.disagreements,
  groupBDisagreementsA1: a1.scored.accuracy.groupB.disagreements,
  groupADisagreementsA2: a2.scored.accuracy.groupA.disagreements,
  groupBDisagreementsA2: a2.scored.accuracy.groupB.disagreements,
  emptyRowsA1: a1.empty.anyEmptyRows,
  emptyRowsA2: a2.empty.anyEmptyRows,
};

await writeFile(path.join(RUNS, "verbatim-a-score-summary.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      totals: out.totals,
      a1: { ...out.a1, empty: { ...out.a1.empty, anyEmptyRows: out.a1.empty.anyEmptyRows.length } },
      a2: out.a2,
      stability: out.stability,
    },
    null,
    2
  )
);
