/**
 * B388 scores. No model calls.
 *
 *   node scripts/diagnostic/b388/score.mjs --tune tune-v1
 *   node scripts/diagnostic/b388/score.mjs
 *
 * The no-argument run scores held-1 and held-2. It does not edit the prompt.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { joinKey, scoreAccuracy } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { locatePassageInSource } from "../../../lib/qc/excerpt-from-source.mjs";
import { jobsFor } from "./run.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const RUNS = path.join(__dirname, "runs");

const CLEAN = [
  { id: "2026-09-29-clean", review: "tests/fixtures/real-runs-2026-09-29/clean-review.json" },
  { id: "2026-10-04-hicl-clean", review: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json" },
  { id: "2026-10-06-gpi-clean", review: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json" },
  { id: "2026-10-06-clearpoint-clean", review: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json" },
];

const DOCTORED = {
  "3i-hy25-doctored": "2026-09-29",
  "hicl-interim-doctored": "2026-10-04-hicl",
  "gpi-press-release-doctored": "2026-10-06-gpi",
  "clearpoint-q1-2026-doctored": "2026-10-06-clearpoint",
};

function inRange(fixtureId, from, to) {
  const n = Number(fixtureId);
  return n >= from && n <= to;
}

async function loadPass(name) {
  const file = path.join(RUNS, name, "cards.json");
  const doc = JSON.parse(await readFile(file, "utf8"));
  if (doc?.arm !== "b388-draft-review") throw new Error(`${file} is not a B388 pass.`);
  return doc;
}

async function accuracyBundle(from, to) {
  const labelsDoc = JSON.parse(await readFile(path.join(ROOT, "scripts/diagnostic/accuracy/labels.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(ROOT, "scripts/diagnostic/accuracy/sample-manifest.json"), "utf8"));
  const labels = normalizeLabelsDoc({ labels: labelsDoc.labels }).filter((row) => inRange(row.fixtureId, from, to));
  const groupAKeys = new Set(
    manifest.groupA.filter((row) => inRange(row.fixtureId, from, to)).map((row) => joinKey(row.fixtureId, row.statementText, row.occurrence))
  );
  const groupBKeys = new Set(
    manifest.groupB.filter((row) => inRange(row.fixtureId, from, to)).map((row) => joinKey(row.fixtureId, row.statementText, row.occurrence))
  );
  return { labels, groupAKeys, groupBKeys };
}

function scorePass(doc, bundle) {
  const cards = doc.cards.filter((card) => inRange(card.fixtureId, 1, 99));
  return scoreAccuracy({
    labels: bundle.labels,
    cards,
    groupAKeys: bundle.groupAKeys,
    groupBKeys: bundle.groupBKeys,
  });
}

function printAccuracy(title, result) {
  const a = result.groupA;
  const b = result.groupB.amongBenConfirmed;
  const catchN = a.confusion?.conflicting?.conflicting ?? 0;
  console.log(
    `${title} CATCH ${catchN} of ${a.confusion.conflicting ? Object.values(a.confusion.conflicting).reduce((n, v) => n + v, 0) : 0} conflicting labels, group A n=${a.n}`
  );
  console.log(`${title} LEAVE-ALONE ${b.pipelineAlsoConfirmed} of ${b.n}`);
  console.log(`${title} group A disagreements ${result.groupA.disagreements.length}`);
  for (const row of result.groupA.disagreements) {
    console.log(`  A ${row.fixtureId} ben=${row.benLabel} pipe=${row.pipelineMapped} ${row.statementText.slice(0, 140)}`);
  }
  console.log(`${title} leave-alone misses`);
  for (const row of result.groupB.disagreements.filter((item) => item.benLabel === "confirmed")) {
    console.log(`  B ${row.fixtureId} pipe=${row.pipelineMapped} ${row.statementText.slice(0, 160)}`);
  }
}

function findSource(sources, sourceId) {
  if (sourceId == null) return null;
  const id = String(sourceId).trim();
  return sources.find((source) => source.id === id || source.label === id) || null;
}

function classifyPassage(sourceText, passage) {
  if (typeof sourceText !== "string" || typeof passage !== "string" || !passage) return "not_found";
  if (sourceText.indexOf(passage) !== -1) return "exact";
  const located = locatePassageInSource(sourceText, passage);
  if (located?.start != null && located?.end != null) return "normalised";
  return "not_found";
}

function citationFor(doc, jobs) {
  const byId = new Map(jobs.map((job) => [job.fixtureId, job]));
  const counts = { passages: 0, exact: 0, normalised: 0, notFound: 0, nullPassage: 0 };
  const statements = [];
  for (const card of doc.cards) {
    const job = byId.get(card.fixtureId);
    if (!job) throw new Error(`No source for ${card.fixtureId}`);
    const claimStatuses = [];
    for (const claim of card.claims || []) {
      if (typeof claim.passage !== "string" || !claim.passage) {
        counts.nullPassage += 1;
        claimStatuses.push("null");
        continue;
      }
      counts.passages += 1;
      const source = findSource(job.sources, claim.sourceId);
      const klass = source ? classifyPassage(source.text, claim.passage) : "not_found";
      if (klass === "exact") counts.exact += 1;
      else if (klass === "normalised") counts.normalised += 1;
      else counts.notFound += 1;
      claimStatuses.push(klass === "not_found" ? "not_found" : klass);
    }
    const verified = claimStatuses.filter((status) => status === "exact" || status === "normalised").length;
    const green = card.displayVerdict === "supported_full";
    const survives = green && claimStatuses.length > 0 && claimStatuses.every((status) => status === "exact" || status === "normalised");
    const losesAll = claimStatuses.length > 0 && verified === 0;
    statements.push({
      fixtureId: card.fixtureId,
      index: card.index,
      displayVerdict: card.displayVerdict,
      green,
      survives,
      losesAll,
      verified,
      claims: claimStatuses.length,
    });
  }
  const greens = statements.filter((row) => row.green);
  return {
    counts,
    greens: greens.length,
    greensSurvive: greens.filter((row) => row.survives).length,
    loseAllEvidence: statements.filter((row) => row.losesAll).length,
    statements: statements.length,
  };
}

function stability(a, b) {
  const key = (card) => `${card.fixtureId}#${card.index}`;
  const right = new Map(b.cards.map((card) => [key(card), card]));
  let agree = 0;
  let moved = 0;
  let missing = 0;
  const movers = [];
  for (const card of a.cards) {
    const other = right.get(key(card));
    if (!other) {
      missing += 1;
      continue;
    }
    if (card.displayVerdict === other.displayVerdict) agree += 1;
    else {
      moved += 1;
      movers.push({
        fixtureId: card.fixtureId,
        index: card.index,
        first: card.displayVerdict,
        second: other.displayVerdict,
        statement: card.statement,
      });
    }
  }
  return { agree, moved, missing, total: a.cards.length, movers };
}

async function pipelineClean() {
  const rows = [];
  for (const spec of CLEAN) {
    const doc = JSON.parse(await readFile(path.join(ROOT, spec.review), "utf8"));
    doc.statements.forEach((row) => {
      rows.push({
        fixtureId: spec.id,
        index: row.qcCard.index,
        displayVerdict: row.qcCard.displayVerdict,
      });
    });
  }
  const flagged = rows.filter((row) => row.displayVerdict !== "supported_full");
  return { total: rows.length, flagged: flagged.length, rows: flagged };
}

function cleanFlags(doc) {
  const ids = new Set(CLEAN.map((spec) => spec.id));
  return doc.cards
    .filter((card) => ids.has(card.fixtureId) && card.displayVerdict !== "supported_full")
    .map((card) => ({
      fixtureId: card.fixtureId,
      index: card.index,
      displayVerdict: card.displayVerdict,
      statement: card.statement,
      comments: (card.claims || []).map((claim) => ({
        verdict: claim.verdict,
        comment: claim.comment,
        passage: claim.passage,
      })),
    }));
}

async function planted(doc) {
  const labels = JSON.parse(await readFile(path.join(ROOT, "scripts/diagnostic/b385/labels.json"), "utf8"));
  const byCard = new Map(doc.cards.map((card) => [`${card.fixtureId}#${card.index}`, card]));
  const rows = [];
  for (const run of labels.runs) {
    const fixtureId = DOCTORED[run.runId];
    if (!fixtureId) throw new Error(`No doctored fixture for ${run.runId}`);
    for (const entry of run.entries) {
      const card = byCard.get(`${fixtureId}#${entry.statementIndex}`);
      if (!card) throw new Error(`Missing card ${fixtureId}#${entry.statementIndex}`);
      for (const sub of entry.substitutions) {
        rows.push({
          id: sub.id,
          written: sub.written,
          was: sub.was,
          entry: entry.entry,
          fixtureId,
          index: entry.statementIndex,
          displayVerdict: card.displayVerdict,
          comments: (card.claims || []).map((claim) => claim.comment).filter(Boolean),
        });
      }
    }
  }
  return rows;
}

async function tuneMain(passName) {
  const doc = await loadPass(passName);
  const bundle = await accuracyBundle(1, 10);
  const result = scorePass(doc, bundle);
  printAccuracy(passName, result);
  console.log(`${passName} costUsd=${Number(doc.costUsd).toFixed(4)} cards=${doc.cards.length} prompt=${doc.promptSha256}`);
}

async function heldMain() {
  const first = await loadPass("held-1");
  const second = await loadPass("held-2");
  const bundle = await accuracyBundle(11, 20);
  const score1 = scorePass(first, bundle);
  const score2 = scorePass(second, bundle);
  printAccuracy("held-1", score1);
  printAccuracy("held-2", score2);
  const jobs = await jobsFor("held-out");
  const cite1 = citationFor(first, jobs);
  const cite2 = citationFor(second, jobs);
  console.log("CITATION held-1", JSON.stringify(cite1.counts), `greens ${cite1.greensSurvive}/${cite1.greens} loseAll ${cite1.loseAllEvidence} of ${cite1.statements}`);
  console.log("CITATION held-2", JSON.stringify(cite2.counts), `greens ${cite2.greensSurvive}/${cite2.greens} loseAll ${cite2.loseAllEvidence} of ${cite2.statements}`);
  const stable = stability(first, second);
  console.log(`STABILITY agree ${stable.agree} moved ${stable.moved} missing ${stable.missing} of ${stable.total}`);
  for (const row of stable.movers) {
    console.log(`  MOVE ${row.fixtureId}#${row.index} ${row.first} -> ${row.second} ${row.statement.slice(0, 140)}`);
  }
  const pipe = await pipelineClean();
  console.log(`PIPELINE clean flagged ${pipe.flagged} of ${pipe.total}`);
  for (const row of pipe.rows) console.log(`  PIPE ${row.fixtureId}#${row.index} ${row.displayVerdict}`);
  const flags1 = cleanFlags(first);
  const flags2 = cleanFlags(second);
  console.log(`CLEAN FLAGS held-1 ${flags1.length} held-2 ${flags2.length}`);
  for (const row of flags1) {
    console.log(`CLEAN1 ${row.fixtureId}#${row.index} ${row.displayVerdict}`);
    console.log(row.statement);
    for (const claim of row.comments) console.log(`  ${claim.verdict}: ${claim.comment}`);
  }
  for (const row of flags2) {
    const same = flags1.find((item) => item.fixtureId === row.fixtureId && item.index === row.index);
    if (same && same.displayVerdict === row.displayVerdict) continue;
    console.log(`CLEAN2-ONLY ${row.fixtureId}#${row.index} ${row.displayVerdict}`);
    console.log(row.statement);
    for (const claim of row.comments) console.log(`  ${claim.verdict}: ${claim.comment}`);
  }
  const plant1 = await planted(first);
  const plant2 = await planted(second);
  console.log(`PLANTED ${plant1.length}`);
  for (let i = 0; i < plant1.length; i += 1) {
    const a = plant1[i];
    const b = plant2[i];
    console.log(`PLANT ${a.id} ${a.displayVerdict} / ${b.displayVerdict}`);
    console.log(`  written: ${a.written}`);
    console.log(`  held-1: ${a.comments.join(" || ") || "(no comment)"}`);
    console.log(`  held-2: ${b.comments.join(" || ") || "(no comment)"}`);
  }
  const summary = {
    cost: {
      held1: first.costUsd,
      held2: second.costUsd,
      held1List: first.costUsdList,
      held2List: second.costUsdList,
      calls1: first.calls,
      calls2: second.calls,
    },
    catch: {
      held1: score1.groupA.confusion.conflicting.conflicting,
      held1n: score1.groupA.n,
      held2: score2.groupA.confusion.conflicting.conflicting,
      held2n: score2.groupA.n,
    },
    leaveAlone: {
      held1: score1.groupB.amongBenConfirmed,
      held2: score2.groupB.amongBenConfirmed,
    },
    citation: { held1: cite1, held2: cite2 },
    stability: { agree: stable.agree, moved: stable.moved, missing: stable.missing, total: stable.total },
    pipelineClean: pipe,
    cleanFlags1: flags1,
    cleanFlags2: flags2,
  };
  const out = path.join(RUNS, "score-summary.json");
  await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`wrote ${out}`);
}

async function main() {
  const tune = process.argv.indexOf("--tune");
  if (tune !== -1) {
    const name = process.argv[tune + 1];
    if (!name) throw new Error("usage: score.mjs --tune <pass>");
    await tuneMain(name);
    return;
  }
  await heldMain();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
