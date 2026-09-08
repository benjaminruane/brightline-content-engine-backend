/**
 * Score bake-off cards against the frozen labelled set.
 * Reuses scoreAccuracy. Does not touch scripts/diagnostic/accuracy/ data files.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  joinKey,
  padFixtureId,
  scoreAccuracy,
  wilsonInterval,
} from "../accuracy/lib.mjs";
import { locatePassageInSource } from "../../../lib/qc/pipeline-v4/stage2-match-multipassage.mjs";
import { validatePassageAgainstSource } from "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { mapVariantB } from "./map-variant-b.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACC = path.join(__dirname, "../accuracy");

export const PIPELINE_BASELINE = {
  groupACatch: { n: 11, k: 3 },
  groupADetection: { n: 11, k: 4 },
  groupBAgreement: { n: 89, k: 75 },
  leaveAlone: { n: 76, k: 70 },
  groupBNonConfirmedCorrect: { n: 13, k: 5 },
  stability: { n: 100, k: 97 },
};

export function mappedToDisplayVerdict(label) {
  if (label === "confirmed") return "supported_full";
  if (label === "partially_confirmed") return "supported_partial";
  if (label === "conflicting") return "conflict";
  if (label === "no_support") return "not_supported";
  return null;
}

export function isDetected(label) {
  return label === "partially_confirmed" || label === "conflicting" || label === "no_support";
}

export function locatabilityFromQuotes(quotes) {
  const list = Array.isArray(quotes) ? quotes.filter((q) => q && String(q.passage || "").trim()) : [];
  if (list.length === 0) {
    return { quoted: 0, located: 0, empty: 0, rate: 0, pass: false, failZeroQuotes: true };
  }
  let located = 0;
  for (const q of list) {
    const hit = locatePassageInSource(q.sourceText || "", q.passage);
    if (hit.start != null) located += 1;
  }
  const rate = located / list.length;
  return {
    quoted: list.length,
    located,
    empty: 0,
    rate,
    pass: rate >= 0.95,
    failZeroQuotes: false,
  };
}

/**
 * Locatability for Variant A verbatim re-run.
 * Empty passages stay in the denominator as misses. Zero non-empty quotes is a fail.
 */
export function locatabilityFromPassageRows(rows) {
  const list = Array.isArray(rows) ? rows.filter((q) => q) : [];
  const nonEmpty = list.filter((q) => String(q.passage || "").trim());
  const empty = list.length - nonEmpty.length;
  if (nonEmpty.length === 0) {
    return {
      quoted: 0,
      located: 0,
      empty,
      slots: list.length,
      rate: 0,
      pass: false,
      failZeroQuotes: true,
    };
  }
  let located = 0;
  for (const q of list) {
    const passage = String(q.passage || "");
    if (!passage.trim()) continue;
    const hit = locatePassageInSource(q.sourceText || "", q.passage);
    if (hit.start != null) located += 1;
  }
  const rate = located / list.length;
  return {
    quoted: nonEmpty.length,
    located,
    empty,
    slots: list.length,
    rate,
    pass: rate >= 0.95,
    failZeroQuotes: false,
  };
}

export function validationFromPassageRows(rows) {
  const list = Array.isArray(rows) ? rows.filter((q) => q) : [];
  let empty = 0;
  let accepted = 0;
  let rejected = 0;
  for (const r of list) {
    const passage = String(r.passage || "");
    if (!passage.trim()) {
      empty += 1;
      continue;
    }
    const named = r.sourceText || "";
    const acceptedFlag =
      typeof r.passageValidated === "boolean"
        ? r.passageValidated
        : validatePassageAgainstSource(passage, named).accepted === true;
    if (acceptedFlag) accepted += 1;
    else rejected += 1;
  }
  const nonEmpty = accepted + rejected;
  return {
    n: list.length,
    empty,
    nonEmpty,
    accepted,
    rejected,
    failureRateNonEmpty: nonEmpty ? rejected / nonEmpty : 0,
    failureRateIncludingEmpty: list.length ? (rejected + empty) / list.length : 0,
  };
}

export function decisionRule({ catchK, catchN, leaveK, leaveN, locatability, flaggedNonC, flaggedNonCNeed }) {
  const catchNSafe = catchN || 11;
  const leaveNSafe = leaveN || 76;
  const loc = locatability || { quoted: 0, rate: 0 };
  const flaggedNeed = flaggedNonCNeed || 5;
  const wins =
    catchK >= 7 &&
    leaveK >= 68 &&
    loc.quoted > 0 &&
    loc.rate >= 0.95 &&
    flaggedNonC >= flaggedNeed;
  const loses = catchK <= 4 || leaveK < 60 || loc.quoted === 0 || loc.rate < 0.9;
  let verdict = "BETWEEN";
  if (wins) verdict = "WINS";
  else if (loses) verdict = "LOSES";
  return { verdict, wins, loses };
}

export function detectionRate(rows, group) {
  const subset = rows.filter((r) => r.group === group);
  const n = subset.length;
  const k = subset.filter((r) => isDetected(r.mapped)).length;
  return { n, k, rate: n ? k / n : null, wilson95: wilsonInterval(k, n) };
}

export function agreementRate(rows, group) {
  const subset = rows.filter((r) => r.group === group);
  const n = subset.length;
  const k = subset.filter((r) => r.mapped === r.ben).length;
  return { n, k, rate: n ? k / n : null, wilson95: wilsonInterval(k, n) };
}

export async function loadControlSet() {
  const labelsDoc = JSON.parse(await readFile(path.join(ACC, "labels.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(ACC, "sample-manifest.json"), "utf8"));
  const statementsDoc = JSON.parse(await readFile(path.join(ACC, "statements.json"), "utf8"));
  const labels = Array.isArray(labelsDoc.labels) ? labelsDoc.labels : [];
  const groupAKeys = new Set((manifest.groupA || []).map((r) => joinKey(r.fixtureId, r.statementText, r.occurrence)));
  const groupBKeys = new Set((manifest.groupB || []).map((r) => joinKey(r.fixtureId, r.statementText, r.occurrence)));
  return { labels, manifest, statementsDoc, groupAKeys, groupBKeys };
}

export function rowsFromVariantA(labelled, aStatements) {
  const byKey = new Map();
  for (const s of Array.isArray(aStatements) ? aStatements : []) {
    byKey.set(joinKey(s.fixtureId, s.statementText || s.statement || s.text, s.occurrence), s);
  }
  return labelled.map((lab) => {
    const key = joinKey(lab.fixtureId, lab.statementText, lab.occurrence);
    const hit = byKey.get(key);
    const mapped = hit?.overall || hit?.mappedLabel || "confirmed";
    return {
      fixtureId: padFixtureId(lab.fixtureId),
      statementText: lab.statementText,
      occurrence: lab.occurrence || 0,
      group: lab.group,
      ben: lab.label,
      mapped,
      silent: !hit,
      sourceMatches: Array.isArray(hit?.sources) ? hit.sources : [],
      quotes: Array.isArray(hit?.quotes) ? hit.quotes : [],
    };
  });
}

export function rowsFromVariantB(labelled, mappedB) {
  const byKey = new Map();
  for (const r of mappedB.rows || []) {
    byKey.set(joinKey(r.fixtureId, r.statementText, r.occurrence), r);
  }
  return labelled.map((lab) => {
    const key = joinKey(lab.fixtureId, lab.statementText, lab.occurrence);
    const hit = byKey.get(key);
    const mapped = hit?.mappedLabel || "confirmed";
    return {
      fixtureId: padFixtureId(lab.fixtureId),
      statementText: lab.statementText,
      occurrence: lab.occurrence || 0,
      group: lab.group,
      ben: lab.label,
      mapped,
      silent: hit ? hit.silent === true : true,
      findings: hit?.findings || [],
      quotes: Array.isArray(hit?.quotes) ? hit.quotes : [],
    };
  });
}

export function scoreRows(rows, { groupAKeys, groupBKeys, locatability, offList, extra }) {
  const cards = rows.map((r) => ({
    fixtureId: r.fixtureId,
    statement: r.statementText,
    occurrence: r.occurrence,
    displayVerdict: mappedToDisplayVerdict(r.mapped),
    hasConflict: Array.isArray(r.sourceMatches)
      ? r.sourceMatches.some((m) => String(m.classification || "").includes("conflict"))
      : false,
    sourceMatches: r.sourceMatches || [],
  }));
  const accuracy = scoreAccuracy({
    labels: rows.map((r) => ({
      fixtureId: r.fixtureId,
      statementText: r.statementText,
      occurrence: r.occurrence,
      label: r.ben,
    })),
    cards,
    groupAKeys,
    groupBKeys,
  });
  const groupADet = detectionRate(rows, "A");
  const groupBDet = detectionRate(rows, "B");
  const groupAAgr = agreementRate(rows, "A");
  const groupBAgr = agreementRate(rows, "B");
  const nonC = rows.filter((r) => r.group === "B" && r.ben !== "confirmed");
  const partialsIgnored = nonC.filter((r) => r.silent || r.mapped === "confirmed").length;
  const flaggedNonC = nonC.filter((r) => isDetected(r.mapped)).length;
  const leave = accuracy.groupB.amongBenConfirmed;
  const coverage = rows.filter((r) => isDetected(r.mapped)).length;
  const decision = decisionRule({
    catchK: groupAAgr.k,
    catchN: 11,
    leaveK: leave.pipelineAlsoConfirmed,
    leaveN: leave.n,
    locatability,
    flaggedNonC,
    flaggedNonCNeed: 5,
  });
  return {
    accuracy,
    groupADetection: groupADet,
    groupBDetection: groupBDet,
    groupAAgreement: groupAAgr,
    groupBAgreement: groupBAgr,
    coverage: { n: rows.length, k: coverage },
    partialsIgnored: { n: nonC.length, k: partialsIgnored, flagged: flaggedNonC },
    locatability,
    offList: offList || [],
    decision,
    extra: extra || null,
  };
}

export function collectQuotesFromA(fixtureResults, sourceByFixture) {
  const quotes = [];
  for (const fx of Array.isArray(fixtureResults) ? fixtureResults : []) {
    const sources = sourceByFixture.get(fx.fixtureId) || [];
    for (const stmt of fx.statements || []) {
      for (const s of Array.isArray(stmt.sources) ? stmt.sources : []) {
        const passage = typeof s.passage === "string" ? s.passage : "";
        if (!passage.trim()) continue;
        const idx = Number.isFinite(s.sourceIndex) ? s.sourceIndex : Number(s.index);
        const src = sources[idx] || sources[0];
        quotes.push({ fixtureId: fx.fixtureId, passage, sourceText: src?.text || "" });
      }
    }
  }
  return quotes;
}

export function collectPassageRowsFromA(fixtureResults, sourceByFixture) {
  const rows = [];
  for (const fx of Array.isArray(fixtureResults) ? fixtureResults : []) {
    const sources = sourceByFixture.get(fx.fixtureId) || [];
    for (const stmt of fx.statements || []) {
      for (const s of Array.isArray(stmt.sources) ? stmt.sources : []) {
        const passage = typeof s.passage === "string" ? s.passage : "";
        const idx = Number.isFinite(s.sourceIndex) ? s.sourceIndex : Number(s.index);
        const src = sources[idx] || sources[0];
        rows.push({
          fixtureId: fx.fixtureId,
          statementText: stmt.statementText,
          occurrence: stmt.occurrence,
          overall: stmt.overall,
          classification: s.classification,
          passage,
          sourceText: src?.text || "",
          passageValidated: s.passageValidated,
          passageEmpty: s.passageEmpty === true || !passage.trim(),
        });
      }
    }
  }
  return rows;
}

export function collectQuotesFromB(findings, sourceByFixture) {
  const quotes = [];
  for (const f of Array.isArray(findings) ? findings : []) {
    const passage = typeof f.evidenceQuote === "string" ? f.evidenceQuote : "";
    if (!passage.trim()) continue;
    const sources = sourceByFixture.get(padFixtureId(f.fixtureId)) || [];
    const idx = Number.isFinite(f.sourceIndex) ? f.sourceIndex : 0;
    quotes.push({
      fixtureId: f.fixtureId,
      passage,
      sourceText: sources[idx]?.text || "",
    });
  }
  return quotes;
}

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const runPath = argv[argv.indexOf("--run") + 1];
  const variant = argv[argv.indexOf("--variant") + 1] || "a";
  if (!runPath || argv.indexOf("--run") < 0) {
    console.error("usage: node score-bakeoff.mjs --variant a|b --run path/to/run.json");
    process.exit(2);
  }
  const { labels, groupAKeys, groupBKeys } = await loadControlSet();
  const run = JSON.parse(await readFile(path.resolve(runPath), "utf8"));
  let rows;
  let loc;
  let offList = [];
  let extra = null;
  if (variant === "b") {
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
    offList = mapped.offList;
    const sourceByFixture = new Map((run.fixtures || []).map((fx) => [padFixtureId(fx.fixtureId), fx.sources || []]));
    loc = locatabilityFromQuotes(collectQuotesFromB(findings, sourceByFixture));
    rows = rowsFromVariantB(labels, mapped);
    for (const r of rows) {
      const rec = mapped.rows.find(
        (x) => joinKey(x.fixtureId, x.statementText, x.occurrence) === joinKey(r.fixtureId, r.statementText, r.occurrence)
      );
      r.quotes = rec?.findings?.map((f) => f.evidenceQuote).filter(Boolean) || [];
    }
  } else {
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
    rows = rowsFromVariantA(labels, aStatements);
    const passageRows = collectPassageRowsFromA(run.fixtures, sourceByFixture);
    loc = locatabilityFromPassageRows(passageRows);
    extra = { validation: validationFromPassageRows(passageRows) };
  }
  const scored = scoreRows(rows, { groupAKeys, groupBKeys, locatability: loc, offList, extra });
  console.log(
    JSON.stringify(
      {
        variant,
        decision: scored.decision,
        groupAAgreement: scored.groupAAgreement,
        groupADetection: scored.groupADetection,
        groupBAgreement: scored.groupBAgreement,
        coverage: scored.coverage,
        partialsIgnored: scored.partialsIgnored,
        locatability: scored.locatability,
        validation: extra?.validation || null,
        offListCount: offList.length,
      },
      null,
      2
    )
  );
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
