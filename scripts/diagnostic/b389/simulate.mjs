/**
 * B389. Apply the committed gate to the stored B388 passes.
 * No model calls.
 *
 *   node scripts/diagnostic/b389/simulate.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { joinKey, scoreAccuracy } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { repairNormaliseWithMap } from "../../../lib/qc/excerpt-from-source.mjs";
import { jobsFor } from "../b388/run.mjs";
import {
  agreementState,
  findSource,
  gateStatement,
  hasEllipsis,
  normaliseForLocate,
  passageVerifies,
  scoreVerdict,
} from "./gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const CLEAN = new Set([
  "2026-09-29-clean",
  "2026-10-04-hicl-clean",
  "2026-10-06-gpi-clean",
  "2026-10-06-clearpoint-clean",
]);

const DOCTORED = {
  "3i-hy25-doctored": "2026-09-29",
  "hicl-interim-doctored": "2026-10-04-hicl",
  "gpi-press-release-doctored": "2026-10-06-gpi",
  "clearpoint-q1-2026-doctored": "2026-10-06-clearpoint",
};

const B388_CLEAN = {
  "held-1": {
    wrong: [
      ["2026-09-29-clean", 1],
      ["2026-09-29-clean", 2],
      ["2026-09-29-clean", 8],
      ["2026-09-29-clean", 12],
      ["2026-10-04-hicl-clean", 6],
      ["2026-10-04-hicl-clean", 7],
      ["2026-10-06-gpi-clean", 1],
      ["2026-10-06-clearpoint-clean", 1],
      ["2026-10-06-clearpoint-clean", 3],
    ],
    real: [
      ["2026-09-29-clean", 0],
      ["2026-09-29-clean", 5],
      ["2026-09-29-clean", 6],
      ["2026-09-29-clean", 11],
      ["2026-10-04-hicl-clean", 1],
      ["2026-10-04-hicl-clean", 2],
      ["2026-10-04-hicl-clean", 5],
      ["2026-10-06-gpi-clean", 3],
    ],
  },
  "held-2": {
    wrong: [
      ["2026-09-29-clean", 1],
      ["2026-09-29-clean", 12],
      ["2026-09-29-clean", 13],
      ["2026-10-04-hicl-clean", 6],
      ["2026-10-04-hicl-clean", 7],
      ["2026-10-06-gpi-clean", 1],
      ["2026-10-06-clearpoint-clean", 1],
      ["2026-10-06-clearpoint-clean", 3],
      ["2026-10-06-clearpoint-clean", 9],
    ],
    real: [
      ["2026-09-29-clean", 0],
      ["2026-09-29-clean", 5],
      ["2026-09-29-clean", 7],
      ["2026-09-29-clean", 11],
      ["2026-10-04-hicl-clean", 1],
      ["2026-10-04-hicl-clean", 2],
      ["2026-10-04-hicl-clean", 5],
      ["2026-10-06-gpi-clean", 3],
    ],
  },
};

function keyOf(fixtureId, index) {
  return `${fixtureId}#${index}`;
}

function tally(rows) {
  const counts = { verified_green: 0, flagged: 0, could_not_verify: 0 };
  for (const row of rows) counts[row.state] += 1;
  return counts;
}

function inRange(fixtureId, from, to) {
  const n = Number(fixtureId);
  return n >= from && n <= to;
}

async function loadPass(name) {
  const file = path.join(ROOT, "scripts/diagnostic/b388/runs", name, "cards.json");
  const doc = JSON.parse(await readFile(file, "utf8"));
  if (doc?.arm !== "b388-draft-review") throw new Error(`${file} is not a B388 pass.`);
  return doc;
}

function gatePass(doc, jobs) {
  const byId = new Map(jobs.map((job) => [job.fixtureId, job]));
  return doc.cards.map((card) => {
    const job = byId.get(card.fixtureId);
    if (!job) throw new Error(`No source job for ${card.fixtureId}.`);
    const gated = gateStatement(card.claims, job.sources);
    return {
      fixtureId: card.fixtureId,
      index: card.index,
      occurrence: card.occurrence,
      statement: card.statement,
      stored: card.displayVerdict,
      state: gated.state,
      claims: gated.claims,
      job,
    };
  });
}

function withAgreement(rows, other) {
  const right = new Map(other.map((row) => [keyOf(row.fixtureId, row.index), row]));
  return rows.map((row) => {
    const twin = right.get(keyOf(row.fixtureId, row.index));
    return { ...row, state: agreementState(row.state, twin?.state) };
  });
}

function toScoreCards(rows) {
  return rows.map((row) => ({
    fixtureId: row.fixtureId,
    statement: row.statement,
    occurrence: row.occurrence,
    index: row.index,
    displayVerdict: scoreVerdict(row.state, row.stored),
  }));
}

async function accuracyBundle(from, to) {
  const labelsDoc = JSON.parse(await readFile(path.join(ROOT, "scripts/diagnostic/accuracy/labels.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(ROOT, "scripts/diagnostic/accuracy/sample-manifest.json"), "utf8"));
  const labels = normalizeLabelsDoc({ labels: labelsDoc.labels }).filter((row) => inRange(row.fixtureId, from, to));
  const groupAKeys = new Set(
    manifest.groupA
      .filter((row) => inRange(row.fixtureId, from, to))
      .map((row) => joinKey(row.fixtureId, row.statementText, row.occurrence))
  );
  const groupBKeys = new Set(
    manifest.groupB
      .filter((row) => inRange(row.fixtureId, from, to))
      .map((row) => joinKey(row.fixtureId, row.statementText, row.occurrence))
  );
  return { labels, groupAKeys, groupBKeys };
}

function accuracyOf(rows, bundle) {
  const cards = toScoreCards(rows).filter((card) => inRange(card.fixtureId, 11, 20));
  const result = scoreAccuracy({
    labels: bundle.labels,
    cards,
    groupAKeys: bundle.groupAKeys,
    groupBKeys: bundle.groupBKeys,
  });
  const catchN = result.groupA.confusion?.conflicting?.conflicting ?? 0;
  const catchDenom = result.groupA.confusion?.conflicting
    ? Object.values(result.groupA.confusion.conflicting).reduce((n, v) => n + v, 0)
    : 0;
  return {
    catch: catchN,
    catchDenom,
    leave: result.groupB.amongBenConfirmed.pipelineAlsoConfirmed,
    leaveDenom: result.groupB.amongBenConfirmed.n,
    unmatched: result.unmatchedLabels.length,
    groupADisagreements: result.groupA.disagreements.map((row) => ({
      fixtureId: row.fixtureId,
      ben: row.benLabel,
      pipe: row.pipelineMapped,
      text: row.statementText,
    })),
  };
}

function cleanBlock(rows, passName) {
  const clean = rows.filter((row) => CLEAN.has(row.fixtureId));
  if (clean.length !== 38) throw new Error(`${passName} clean statements ${clean.length}, expected 38.`);
  const counts = tally(clean);
  const byKey = new Map(clean.map((row) => [keyOf(row.fixtureId, row.index), row]));
  const spec = B388_CLEAN[passName];
  const place = (pairs) =>
    pairs.map(([fixtureId, index]) => {
      const row = byKey.get(keyOf(fixtureId, index));
      if (!row) throw new Error(`Missing clean statement ${fixtureId}#${index}.`);
      return { fixtureId, index, state: row.state, stored: row.stored, statement: row.statement };
    });
  const flaggedOutside = clean
    .filter((row) => row.state === "flagged")
    .filter((row) => ![...spec.wrong, ...spec.real].some(([fixtureId, index]) => fixtureId === row.fixtureId && index === row.index))
    .map((row) => ({ fixtureId: row.fixtureId, index: row.index, stored: row.stored }));
  return { counts, wrong: place(spec.wrong), real: place(spec.real), flaggedOutside };
}

function greensOf(rows) {
  return rows.filter((row) => row.stored === "supported_full");
}

function survivesG1(row) {
  return row.claims.length > 0 && row.claims.every((claim) => claim.verifies);
}

function citationOnPass(doc, jobs) {
  const byId = new Map(jobs.map((job) => [job.fixtureId, job]));
  const buckets = { all: emptyCite(), fixtures: emptyCite(), withoutClean: emptyCite() };
  for (const card of doc.cards) {
    const job = byId.get(card.fixtureId);
    if (!job) throw new Error(`No source job for ${card.fixtureId}.`);
    for (const claim of card.claims || []) {
      if (typeof claim.passage !== "string" || !claim.passage.trim()) continue;
      const source = findSource(job.sources, claim.sourceId);
      const sourceText = source?.text || "";
      const needle = normaliseForLocate(claim.passage);
      const hay = repairNormaliseWithMap(sourceText).normalised;
      const verbatim = Boolean(source) && needle.length > 0 && hay.indexOf(needle) !== -1;
      const rescued = !verbatim && hasEllipsis(claim.passage) && source ? passageVerifies(sourceText, claim.passage) : false;
      addCite(buckets.all, verbatim, claim.passage, rescued);
      if (inRange(card.fixtureId, 11, 20)) addCite(buckets.fixtures, verbatim, claim.passage, rescued);
      if (!String(card.fixtureId).includes("clean")) addCite(buckets.withoutClean, verbatim, claim.passage, rescued);
    }
  }
  return buckets;
}

function emptyCite() {
  return { passages: 0, verbatim: 0, fail: 0, failEllipsis: 0, ellipsisRescued: 0, genuine: 0 };
}

function addCite(bucket, verbatim, passage, rescued) {
  bucket.passages += 1;
  if (verbatim) {
    bucket.verbatim += 1;
    return;
  }
  bucket.fail += 1;
  if (hasEllipsis(passage)) {
    bucket.failEllipsis += 1;
    if (rescued) bucket.ellipsisRescued += 1;
  }
  if (!rescued) bucket.genuine += 1;
}

function withheld(rows) {
  let comments = 0;
  let claimsFailed = 0;
  let verdictNoEvidence = 0;
  for (const row of rows) {
    const anyVerified = row.claims.some((claim) => claim.verifies);
    if (row.stored && !anyVerified) verdictNoEvidence += 1;
    for (const claim of row.claims) {
      if (!claim.verifies) {
        claimsFailed += 1;
        if (claim.comment.trim()) comments += 1;
      }
    }
  }
  return { comments, claimsFailed, verdictNoEvidence, statements: rows.length };
}

function stability(a, b) {
  const right = new Map(b.map((row) => [keyOf(row.fixtureId, row.index), row]));
  let agree = 0;
  const movers = [];
  for (const row of a) {
    const other = right.get(keyOf(row.fixtureId, row.index));
    if (other && other.state === row.state) agree += 1;
    else {
      movers.push({
        fixtureId: row.fixtureId,
        index: row.index,
        first: row.state,
        second: other ? other.state : null,
      });
    }
  }
  return { agree, total: a.length, moved: a.length - agree, movers };
}

async function planted(rows) {
  const labels = JSON.parse(await readFile(path.join(ROOT, "scripts/diagnostic/b385/labels.json"), "utf8"));
  const byCard = new Map(rows.map((row) => [keyOf(row.fixtureId, row.index), row]));
  const out = [];
  for (const run of labels.runs) {
    const fixtureId = DOCTORED[run.runId];
    if (!fixtureId) throw new Error(`No doctored fixture for ${run.runId}.`);
    for (const entry of run.entries) {
      const row = byCard.get(keyOf(fixtureId, entry.statementIndex));
      if (!row) throw new Error(`Missing ${fixtureId}#${entry.statementIndex}.`);
      const surviving = row.claims
        .filter((claim) => !claim.confirmed && claim.verifies && claim.comment.trim())
        .map((claim) => claim.comment);
      for (const sub of entry.substitutions) {
        const hay = surviving.join("\n");
        out.push({
          id: sub.id,
          written: sub.written,
          was: sub.was,
          state: row.state,
          stored: row.stored,
          mentionsWritten: hay.includes(sub.written),
          surviving,
        });
      }
    }
  }
  if (out.length !== 37) throw new Error(`Expected 37 substitutions, got ${out.length}.`);
  return out;
}

function stateCounts(items) {
  const counts = { verified_green: 0, flagged: 0, could_not_verify: 0 };
  for (const item of items) counts[item.state] += 1;
  return counts;
}

async function main() {
  const jobs = await jobsFor("held-out");
  const firstDoc = await loadPass("held-1");
  const secondDoc = await loadPass("held-2");
  const first = gatePass(firstDoc, jobs);
  const second = gatePass(secondDoc, jobs);
  const firstAgree = withAgreement(first, second);
  const secondAgree = withAgreement(second, first);
  const bundle = await accuracyBundle(11, 20);

  const pipelineDoc = JSON.parse(
    await readFile(path.join(ROOT, "scripts/diagnostic/accuracy/runs/evidence-pass-oct-06-b378/cards.json"), "utf8")
  );
  const pipelineCards = pipelineDoc.cards.filter((card) => inRange(card.fixtureId, 11, 20));
  const pipeline = scoreAccuracy({
    labels: bundle.labels,
    cards: pipelineCards,
    groupAKeys: bundle.groupAKeys,
    groupBKeys: bundle.groupBKeys,
  });

  const summary = {
    clean: {
      held1: cleanBlock(first, "held-1"),
      held2: cleanBlock(second, "held-2"),
      held1Agreement: cleanBlock(firstAgree, "held-1"),
      held2Agreement: cleanBlock(secondAgree, "held-2"),
    },
    planted: {
      held1: await planted(first),
      held2: await planted(second),
    },
    accuracy: {
      held1: accuracyOf(first, bundle),
      held2: accuracyOf(second, bundle),
      held1Agreement: accuracyOf(firstAgree, bundle),
      held2Agreement: accuracyOf(secondAgree, bundle),
      pipeline: {
        catch: pipeline.groupA.confusion.conflicting.conflicting,
        catchDenom: Object.values(pipeline.groupA.confusion.conflicting).reduce((n, v) => n + v, 0),
        leave: pipeline.groupB.amongBenConfirmed.pipelineAlsoConfirmed,
        leaveDenom: pipeline.groupB.amongBenConfirmed.n,
        unmatched: pipeline.unmatchedLabels.length,
      },
    },
    greens: {},
    citation: {
      held1: citationOnPass(firstDoc, jobs),
      held2: citationOnPass(secondDoc, jobs),
    },
    withheld: { held1: withheld(first), held2: withheld(second) },
    stability: {
      base: stability(first, second),
      agreement: stability(firstAgree, secondAgree),
    },
  };

  for (const [name, rows, agreed] of [
    ["held1", first, firstAgree],
    ["held2", second, secondAgree],
  ]) {
    const greens = greensOf(rows);
    const g1 = greens.filter(survivesG1).length;
    const g2 = greens.filter((row) => row.state === "verified_green").length;
    const g4 = agreed.filter((row) => row.stored === "supported_full" && row.state === "verified_green").length;
    summary.greens[name] = { greens: greens.length, surviveG1: g1, surviveG1G2: g2, surviveAgreement: g4 };
  }

  const outDir = path.join(__dirname, "runs");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "summary.json");
  await writeFile(outFile, `${JSON.stringify(summary, null, 2)}\n`);

  const c1 = summary.clean.held1.counts;
  const c2 = summary.clean.held2.counts;
  console.log(
    `CLEAN held-1 green ${c1.verified_green} flagged ${c1.flagged} unverified ${c1.could_not_verify}`
  );
  console.log(
    `CLEAN held-2 green ${c2.verified_green} flagged ${c2.flagged} unverified ${c2.could_not_verify}`
  );
  console.log("CLEAN held-1 wrong", JSON.stringify(stateCounts(summary.clean.held1.wrong)));
  console.log("CLEAN held-1 real", JSON.stringify(stateCounts(summary.clean.held1.real)));
  console.log("CLEAN held-2 wrong", JSON.stringify(stateCounts(summary.clean.held2.wrong)));
  console.log("CLEAN held-2 real", JSON.stringify(stateCounts(summary.clean.held2.real)));
  console.log("CLEAN agreement held-1", JSON.stringify(summary.clean.held1Agreement.counts));
  console.log("CLEAN agreement held-2", JSON.stringify(summary.clean.held2Agreement.counts));
  console.log("FLAGGED OUTSIDE", JSON.stringify(summary.clean.held1.flaggedOutside), JSON.stringify(summary.clean.held2.flaggedOutside));
  for (const pass of ["held1", "held2"]) {
    const plant = summary.planted[pass];
    const flagged = plant.filter((row) => row.state === "flagged");
    const named = flagged.filter((row) => row.mentionsWritten);
    const unverified = plant.filter((row) => row.state === "could_not_verify");
    const green = plant.filter((row) => row.state === "verified_green");
    console.log(
      `PLANTED ${pass} flagged ${flagged.length} mentionsWritten ${named.length} unverified ${unverified.length} green ${green.length}`
    );
  }
  console.log("ACCURACY", JSON.stringify(summary.accuracy, null, 0));
  console.log("GREENS", JSON.stringify(summary.greens));
  console.log("CITATION", JSON.stringify(summary.citation));
  console.log("WITHHELD", JSON.stringify(summary.withheld));
  console.log(
    `STABILITY base ${summary.stability.base.agree} of ${summary.stability.base.total} agreement-column ${summary.stability.agreement.agree} of ${summary.stability.agreement.total}`
  );
  console.log(`wrote ${outFile}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
