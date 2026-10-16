/**
 * B391. Sentence colour only. No comments, no model calls.
 *
 *   node scripts/diagnostic/b391/score-verdict-only.mjs
 *
 * A sentence is marked when displayVerdict is anything other than supported_full.
 * The decision thresholds are the ones in the spec. They are not adjusted from the counts.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

const HEADLINE_CLEAN = [
  { id: "3i-clean", file: "tests/fixtures/real-runs-2026-09-29/clean-review.json", expected: 15 },
  { id: "hicl-clean", file: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json", expected: 8 },
  { id: "gpi-clean-2", file: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json", expected: 5 },
  { id: "clearpoint-clean-1", file: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json", expected: 10 },
];

const GPI_RUNS = [2, 3, 4, 5].map((n) => ({
  id: `gpi-clean-${n}`,
  file: `tests/fixtures/real-runs-2026-10-06-gpi/clean-run${n}-review.json`,
  expected: 5,
}));

const CLEARPOINT_RUNS = [1, 2, 3].map((n) => ({
  id: `clearpoint-clean-${n}`,
  file: `tests/fixtures/real-runs-2026-10-06-clearpoint/clean${n}-review.json`,
  expected: 10,
}));

function marked(verdict) {
  return verdict !== "supported_full";
}

function tally(verdicts) {
  const counts = {};
  for (const verdict of verdicts) counts[verdict] = (counts[verdict] || 0) + 1;
  return counts;
}

async function loadReview(rel, expected) {
  const file = path.join(ROOT, rel);
  const doc = JSON.parse(await readFile(file, "utf8"));
  const statements = doc.statements;
  if (!Array.isArray(statements)) throw new Error(`${rel} has no statements array. Refusing to score.`);
  if (statements.length !== expected) {
    throw new Error(`${rel} has ${statements.length} statements. Expected ${expected}. Refusing to score.`);
  }
  return statements.map((statement, position) => {
    const index = statement?.qcCard?.index;
    if (index !== position) {
      throw new Error(`${rel} statement at position ${position} has qcCard.index ${index}. Refusing to score.`);
    }
    const verdict = statement?.qcCard?.displayVerdict;
    if (typeof verdict !== "string" || !verdict.trim()) {
      throw new Error(`${rel} statement ${index} has no displayVerdict. Refusing to score.`);
    }
    return { index, verdict, text: String(statement.text || "") };
  });
}

function byIndex(rows, rel) {
  const map = new Map(rows.map((row) => [row.index, row]));
  if (map.size !== rows.length) throw new Error(`${rel} has a repeated statement index. Refusing to score.`);
  return map;
}

function decide(coverage, falseMarks, conflictOnPlanted, markedPlanted, conflictOnClean, markedClean) {
  const versionB =
    coverage >= 33 &&
    falseMarks <= 12 &&
    markedPlanted > 0 &&
    conflictOnPlanted / markedPlanted >= 0.5 &&
    markedClean > 0 &&
    conflictOnClean / markedClean <= 0.25;
  const versionA = coverage <= 25 || falseMarks >= 19;
  if (versionB && versionA) throw new Error("The rule cannot return both versions. Refusing to score.");
  if (versionB) return "VERSION B";
  if (versionA) return "VERSION A";
  return "INCONCLUSIVE";
}

async function main() {
  const labels = JSON.parse(await readFile(path.join(ROOT, "scripts/diagnostic/b385/labels.json"), "utf8"));
  if (!Array.isArray(labels.runs) || labels.runs.length !== 4) {
    throw new Error(`Expected 4 labelled runs, got ${labels.runs?.length}. Refusing to score.`);
  }
  const substitutions = [];
  const plantedSentences = [];
  for (const run of labels.runs) {
    const rows = await loadReview(run.reviewPath, run.statements);
    const cards = byIndex(rows, run.reviewPath);
    const plantedIndexes = new Set();
    for (const entry of run.entries || []) {
      for (const sub of entry.substitutions || []) {
        const card = cards.get(entry.statementIndex);
        if (!card) throw new Error(`${run.runId} has no statement ${entry.statementIndex} for ${sub.id}. Refusing to score.`);
        substitutions.push({
          id: sub.id,
          runId: run.runId,
          statementIndex: entry.statementIndex,
          written: sub.written,
          verdict: card.verdict,
          marked: marked(card.verdict),
        });
        plantedIndexes.add(entry.statementIndex);
      }
    }
    for (const index of [...plantedIndexes].sort((a, b) => a - b)) {
      const card = cards.get(index);
      plantedSentences.push({ runId: run.runId, index, verdict: card.verdict, marked: marked(card.verdict) });
    }
  }
  if (substitutions.length !== 37) {
    throw new Error(`Expected 37 substitutions, got ${substitutions.length}. Refusing to score.`);
  }

  const headline = [];
  for (const spec of HEADLINE_CLEAN) {
    const rows = await loadReview(spec.file, spec.expected);
    for (const row of rows) headline.push({ ...row, id: spec.id });
  }
  if (headline.length !== 38) throw new Error(`Headline clean set is ${headline.length}, not 38. Refusing to score.`);

  const otherClean = [];
  for (const spec of [...GPI_RUNS.filter((row) => row.id !== "gpi-clean-2"), ...CLEARPOINT_RUNS.filter((row) => row.id !== "clearpoint-clean-1")]) {
    const rows = await loadReview(spec.file, spec.expected);
    for (const row of rows) otherClean.push({ ...row, id: spec.id });
  }

  const covered = substitutions.filter((row) => row.marked);
  const unmarked = substitutions.filter((row) => !row.marked);
  const byRun = {};
  for (const row of substitutions) {
    byRun[row.runId] ??= { n: 0, marked: 0 };
    byRun[row.runId].n += 1;
    if (row.marked) byRun[row.runId].marked += 1;
  }

  const markedPlanted = plantedSentences.filter((row) => row.marked);
  const markedClean = headline.filter((row) => marked(row.verdict));
  const plantedDist = tally(markedPlanted.map((row) => row.verdict));
  const cleanDist = tally(markedClean.map((row) => row.verdict));
  const conflictPlanted = plantedDist.conflict || 0;
  const conflictClean = cleanDist.conflict || 0;

  const gpiSeries = [];
  for (const spec of GPI_RUNS) gpiSeries.push({ id: spec.id, rows: await loadReview(spec.file, spec.expected) });
  const cpSeries = [];
  for (const spec of CLEARPOINT_RUNS) cpSeries.push({ id: spec.id, rows: await loadReview(spec.file, spec.expected) });

  function movers(series, label) {
    const count = series[0].rows.length;
    const stable = [];
    const moved = [];
    for (let index = 0; index < count; index += 1) {
      const verdicts = series.map((run) => {
        const row = run.rows.find((item) => item.index === index);
        if (!row) throw new Error(`${run.id} is missing statement ${index}. Refusing to score.`);
        return { run: run.id, verdict: row.verdict };
      });
      const unique = [...new Set(verdicts.map((item) => item.verdict))];
      if (unique.length === 1) stable.push({ label, index, verdict: unique[0] });
      else moved.push({ label, index, verdicts });
    }
    return { stable, moved };
  }

  const gpiStability = movers(gpiSeries, "gpi-clean");
  const cpStability = movers(cpSeries, "clearpoint-clean");
  const decision = decide(
    covered.length,
    markedClean.length,
    conflictPlanted,
    markedPlanted.length,
    conflictClean,
    markedClean.length
  );

  console.log("M1 COVERAGE", covered.length, "of", substitutions.length);
  for (const [runId, row] of Object.entries(byRun)) console.log(`  ${runId} ${row.marked} of ${row.n}`);
  console.log("M1 UNMARKED", unmarked.length);
  for (const row of unmarked) console.log(`  ${row.id} ${row.runId}#${row.statementIndex} ${row.verdict} written: ${row.written}`);
  console.log("M2 HEADLINE MARKED", markedClean.length, "of", headline.length);
  for (const row of markedClean) console.log(`  ${row.id}#${row.index} ${row.verdict}`);
  console.log("M2 OTHER CLEAN");
  for (const specId of [...new Set(otherClean.map((row) => row.id))]) {
    const rows = otherClean.filter((row) => row.id === specId);
    const flags = rows.filter((row) => marked(row.verdict));
    console.log(`  ${specId} ${flags.length} of ${rows.length}`);
    for (const row of flags) console.log(`    #${row.index} ${row.verdict}`);
  }
  console.log("M3 PLANTED SENTENCES", plantedSentences.length, "marked", markedPlanted.length);
  console.log("M3 PLANTED MARKED DIST", JSON.stringify(plantedDist));
  console.log("M3 CLEAN MARKED DIST", JSON.stringify(cleanDist));
  console.log(
    "M3 CONFLICT planted",
    conflictPlanted,
    "of",
    markedPlanted.length,
    "clean",
    conflictClean,
    "of",
    markedClean.length
  );
  for (const row of plantedSentences) console.log(`  PLANT ${row.runId}#${row.index} ${row.verdict}`);
  console.log(
    "M4 STABLE",
    gpiStability.stable.length + cpStability.stable.length,
    "of",
    gpiStability.stable.length + gpiStability.moved.length + cpStability.stable.length + cpStability.moved.length
  );
  console.log("M4 GPI MOVED", gpiStability.moved.length, "of", gpiSeries[0].rows.length);
  for (const row of gpiStability.moved) {
    console.log(`  ${row.label}#${row.index} ${row.verdicts.map((item) => `${item.run}=${item.verdict}`).join(" ")}`);
  }
  console.log("M4 CLEARPOINT MOVED", cpStability.moved.length, "of", cpSeries[0].rows.length);
  for (const row of cpStability.moved) {
    console.log(`  ${row.label}#${row.index} ${row.verdicts.map((item) => `${item.run}=${item.verdict}`).join(" ")}`);
  }
  console.log("DECISION", decision);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
