/**
 * B401 R3. Zero model spend.
 * Counts B394 elements (figure, date, name) and which of them the
 * whole-source presence check already settles.
 *
 * A present element is not settled. Whole-source presence is the check
 * B398 and B399 showed does not know which sentence the fact belongs to.
 * An absent element is settled: the check flags it, and a person does not
 * have to tick it to stop a green.
 *
 *   node scripts/diagnostic/b401/reviewer-cost.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { elementFound, extractElements } from "../b392/elements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b401/runs");

const DOCS = [
  {
    doc: "3i",
    runId: "3i-hy25-doctored",
    source: "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-09-29/doc-review.json",
    clean: "tests/fixtures/real-runs-2026-09-29/clean-review.json",
  },
  {
    doc: "HICL",
    runId: "hicl-interim-doctored",
    source: "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json",
    clean: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json",
  },
  {
    doc: "GPI",
    runId: "gpi-press-release-doctored",
    source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json",
    clean: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json",
  },
  {
    doc: "ClearPoint",
    runId: "clearpoint-q1-2026-doctored",
    source: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json",
    clean: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json",
  },
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function load(rel) {
  return JSON.parse(read(rel));
}

function foldLocate(text) {
  return String(text).replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-");
}

function locate(statement, written) {
  const foldedStatement = foldLocate(statement);
  const variants = [
    written,
    written.replace(/£/g, "GBP ").replace(/\$/g, "USD ").replace(/€/g, "EUR ").replace(/\s+/g, " ").trim(),
    written.replace(/£/g, "GBP").replace(/\$/g, "USD").replace(/€/g, "EUR"),
  ];
  for (const variant of variants) {
    const folded = foldLocate(variant);
    const at = foldedStatement.indexOf(folded);
    if (at >= 0) return { start: at, end: at + folded.length };
  }
  return null;
}

function statementText(row) {
  if (typeof row?.text === "string" && row.text.trim()) return row.text;
  if (typeof row?.qcCard?.statement === "string") return row.qcCard.statement;
  return "";
}

function countDraft(doc, arm, reviewPath, source, plantedSubs) {
  const review = load(reviewPath);
  const statements = Array.isArray(review.statements) ? review.statements : [];
  const draft = statements.map(statementText).join("\n");
  const rows = statements.map((row, index) => {
    const text = statementText(row);
    const elements = extractElements(text, draft, source).map((item) => {
      const found = elementFound(item, source);
      return {
        kind: item.kind,
        surface: item.surface,
        found,
        settled: !found,
      };
    });
    const settled = elements.filter((item) => item.settled).length;
    return {
      index,
      elements: elements.length,
      settled,
      ticks: elements.length - settled,
      detail: elements,
    };
  });
  const planted = plantedSubs.map((sub) => {
    const text = statementText(statements[sub.statementIndex]);
    const span = locate(text, String(sub.written || ""));
    const inSpan = span
      ? extractElements(text, draft, source).filter(
          (item) => item.start < span.end && item.end > span.start
        )
      : [];
    const machineBlocks = inSpan.some((item) => !elementFound(item, source));
    return {
      id: sub.id,
      statementIndex: sub.statementIndex,
      written: sub.written,
      elementsInWritten: inSpan.map((item) => item.surface),
      machineBlocks,
      tickStandsBetweenErrorAndGreen: !machineBlocks,
    };
  });
  return {
    doc: doc.doc,
    arm,
    statements: statements.length,
    elements: rows.reduce((sum, row) => sum + row.elements, 0),
    settled: rows.reduce((sum, row) => sum + row.settled, 0),
    ticks: rows.reduce((sum, row) => sum + row.ticks, 0),
    planted: planted.length,
    ticksBetweenErrorAndGreen: planted.filter((sub) => sub.tickStandsBetweenErrorAndGreen).length,
    perStatement: rows,
    plantedDetail: planted,
  };
}

function main() {
  const labels = load("scripts/diagnostic/b385/labels.json");
  const byRun = new Map(labels.runs.map((run) => [run.runId, run]));
  const drafts = [];
  for (const doc of DOCS) {
    const source = read(doc.source);
    if (!source.trim()) throw new Error(`empty source ${doc.source}`);
    const run = byRun.get(doc.runId);
    if (!run) throw new Error(`no labels for ${doc.runId}`);
    const subs = [];
    for (const entry of run.entries) {
      for (const sub of entry.substitutions) {
        subs.push({ ...sub, statementIndex: entry.statementIndex });
      }
    }
    drafts.push(countDraft(doc, "clean", doc.clean, source, []));
    drafts.push(countDraft(doc, "doctored", doc.doctored, source, subs));
  }
  const report = {
    definition:
      "B394 elements are figure, date, and name. Settled means the element is absent from the whole source, so the presence check flags it. A tick is an element the check finds somewhere in the source and therefore does not settle. A planted substitution needs a tick to stop a green when no element inside the written text is absent from the source.",
    drafts: drafts.map(({ perStatement, plantedDetail, ...rest }) => rest),
    perStatement: drafts.map((row) => ({
      doc: row.doc,
      arm: row.arm,
      rows: row.perStatement,
    })),
    planted: drafts
      .filter((row) => row.arm === "doctored")
      .map((row) => ({ doc: row.doc, substitutions: row.plantedDetail })),
  };
  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, "reviewer-cost.json");
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  for (const row of report.drafts) {
    console.log(
      `${row.doc} ${row.arm}: statements ${row.statements}, elements ${row.elements}, settled ${row.settled}, ticks ${row.ticks}, planted ${row.planted}, ticksBetweenErrorAndGreen ${row.ticksBetweenErrorAndGreen}`
    );
  }
}

main();
