/**
 * B380. Does each quoted passage occur in the source the arm named?
 * Exact substring first, then locatePassageInSource (whitespace collapse,
 * curly quotes, dashes). Anything that matches neither is not found.
 *
 *   node scripts/diagnostic/b380/quote-fidelity.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { locatePassageInSource } from "../../../lib/qc/excerpt-from-source.mjs";
import { filterFixtures, loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { joinKey, mapDisplayVerdict, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const RUNS = path.join(__dirname, "runs");
const LABELS_PATH = path.join(ROOT, "scripts/diagnostic/accuracy/labels.json");

function classifyPassage(sourceText, passage) {
  if (typeof sourceText !== "string" || typeof passage !== "string" || !passage) {
    return "not_found";
  }
  if (sourceText.indexOf(passage) !== -1) return "exact";
  const located = locatePassageInSource(sourceText, passage);
  if (located.start != null && located.end != null) return "normalised";
  return "not_found";
}

function findSource(sources, sourceId) {
  if (sourceId == null) return null;
  const id = String(sourceId).trim();
  return sources.find((source) => source.id === id || source.label === id) || null;
}

async function sourcesByFixture() {
  const fixtures = filterFixtures(await loadAllFixtures(), { range: { from: "01", to: "20" } });
  const out = new Map();
  for (const fixture of fixtures) {
    const id = padFixtureId(fixture.data.id);
    const loaded = await loadPipelineSources(fixture.data.sources || []);
    out.set(
      id,
      loaded.map((source, index) => ({ id: String(index), label: source.label, text: source.text }))
    );
  }
  return out;
}

function isDecidingVerdict(card) {
  const arm = card?.armVerdict;
  const display = card?.displayVerdict;
  return (
    arm === "confirmed" ||
    arm === "conflicting" ||
    display === "supported_full" ||
    display === "conflict"
  );
}

function hasPassage(card) {
  return typeof card?.passage === "string" && card.passage.length > 0;
}

async function readPass(name) {
  const file = path.join(RUNS, name, "cards.json");
  const doc = JSON.parse(await readFile(file, "utf8"));
  return doc;
}

function scorePass(doc, sourcesById) {
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  const counts = { passages: 0, exact: 0, normalised: 0, notFound: 0, noPassage: 0 };
  const notFound = [];
  let deciding = 0;
  let decidingWithoutPassage = 0;
  for (const card of cards) {
    const decidingVerdict = isDecidingVerdict(card);
    if (decidingVerdict) deciding += 1;
    if (!hasPassage(card)) {
      counts.noPassage += 1;
      if (decidingVerdict) decidingWithoutPassage += 1;
      continue;
    }
    counts.passages += 1;
    const sources = sourcesById.get(padFixtureId(card.fixtureId)) || [];
    const source = findSource(sources, card.sourceId);
    const kind = source ? classifyPassage(source.text, card.passage) : "not_found";
    if (kind === "exact") counts.exact += 1;
    else if (kind === "normalised") counts.normalised += 1;
    else {
      counts.notFound += 1;
      notFound.push({
        fixtureId: padFixtureId(card.fixtureId),
        index: card.index,
        occurrence: card.occurrence,
        displayVerdict: card.displayVerdict,
        armVerdict: card.armVerdict,
        sourceId: card.sourceId,
        sourceLabel: source ? source.label : null,
        claimedSourceMissing: !source,
        passage: card.passage,
      });
    }
  }
  return { cards: cards.length, counts, deciding, decidingWithoutPassage, notFound };
}

function stability(labelsDoc, left, right) {
  const rows = normalizeLabelsDoc(labelsDoc);
  const leftBy = indexCards(left);
  const rightBy = indexCards(right);
  let labelled = 0;
  let same = 0;
  let moved = 0;
  let missing = 0;
  const movers = [];
  for (const row of rows) {
    if (row.kind && row.kind !== "statement") continue;
    labelled += 1;
    const key = joinKey(row.fixtureId, row.statementText ?? row.text, row.occurrence);
    const a = leftBy.get(key);
    const b = rightBy.get(key);
    if (!a || !b) {
      missing += 1;
      continue;
    }
    const va = mapDisplayVerdict(a.displayVerdict);
    const vb = mapDisplayVerdict(b.displayVerdict);
    if (va != null && va === vb) same += 1;
    else {
      moved += 1;
      movers.push({
        fixtureId: padFixtureId(row.fixtureId),
        occurrence: row.occurrence || 0,
        llm1: a.displayVerdict,
        llm2: b.displayVerdict,
        mapped1: va,
        mapped2: vb,
        statement: row.statementText ?? row.text,
      });
    }
  }
  return { labelled, same, moved, missing, movers };
}

function indexCards(doc) {
  const map = new Map();
  for (const card of Array.isArray(doc?.cards) ? doc.cards : []) {
    map.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);
  }
  return map;
}

async function main() {
  const sourcesById = await sourcesByFixture();
  const llm1 = await readPass("llm-1");
  let llm2 = null;
  try {
    llm2 = await readPass("llm-2");
  } catch {
    llm2 = null;
  }
  const pass1 = scorePass(llm1, sourcesById);
  const pass2 = llm2 ? scorePass(llm2, sourcesById) : null;
  let stable = null;
  if (llm2) {
    const labelsDoc = JSON.parse(await readFile(LABELS_PATH, "utf8"));
    stable = stability(labelsDoc, llm1, llm2);
  }
  const out = {
    helper: "locatePassageInSource after an exact indexOf. The helper collapses whitespace and folds curly quotes and dashes.",
    llm1: { ...pass1, costUsd: llm1.costUsd, costUsdList: llm1.costUsdList, calls: llm1.calls, stopped: llm1.stopped },
    llm2: pass2
      ? { ...pass2, costUsd: llm2.costUsd, costUsdList: llm2.costUsdList, calls: llm2.calls, stopped: llm2.stopped }
      : null,
    stability: stable,
  };
  const outPath = path.join(RUNS, "quote-fidelity.json");
  await writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`);
  printPass("llm-1", pass1);
  if (pass2) printPass("llm-2", pass2);
  if (stable) {
    console.log(
      `STABILITY labelled=${stable.labelled} same=${stable.same} moved=${stable.moved} missing=${stable.missing}`
    );
    for (const row of stable.movers) {
      console.log(`MOVE ${row.fixtureId} #${row.occurrence} ${row.mapped1} -> ${row.mapped2}`);
      console.log(`  ${row.statement}`);
    }
  }
  console.log(`wrote ${outPath}`);
}

function printPass(name, result) {
  const c = result.counts;
  console.log(
    `${name} cards=${result.cards} passages=${c.passages} exact=${c.exact} normalised=${c.normalised} notFound=${c.notFound} noPassage=${c.noPassage}`
  );
  console.log(
    `${name} confirmed-or-conflicting=${result.deciding} of-which-no-passage=${result.decidingWithoutPassage}`
  );
  for (const row of result.notFound) {
    console.log(
      `NOT FOUND ${name} F${row.fixtureId} i=${row.index} verdict=${row.armVerdict} sourceId=${JSON.stringify(row.sourceId)} label=${row.sourceLabel || "(no such source)"}`
    );
    console.log(row.passage);
    console.log("---");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
