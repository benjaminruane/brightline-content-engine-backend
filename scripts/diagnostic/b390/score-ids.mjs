/**
 * B390 Part A scores. No model calls.
 *
 *   node scripts/diagnostic/b390/score-ids.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { joinKey, scoreAccuracy } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { jobsFor } from "../b388/run.mjs";
import { missingElements } from "../b389/gate.mjs";
import { numberLines } from "./number-lines.mjs";

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

const B388_PASS1_WRONG = [
  ["2026-09-29-clean", 1],
  ["2026-09-29-clean", 2],
  ["2026-09-29-clean", 8],
  ["2026-09-29-clean", 12],
  ["2026-10-04-hicl-clean", 6],
  ["2026-10-04-hicl-clean", 7],
  ["2026-10-06-gpi-clean", 1],
  ["2026-10-06-clearpoint-clean", 1],
  ["2026-10-06-clearpoint-clean", 3],
];
const B388_PASS1_REAL = [
  ["2026-09-29-clean", 0],
  ["2026-09-29-clean", 5],
  ["2026-09-29-clean", 6],
  ["2026-09-29-clean", 11],
  ["2026-10-04-hicl-clean", 1],
  ["2026-10-04-hicl-clean", 2],
  ["2026-10-04-hicl-clean", 5],
  ["2026-10-06-gpi-clean", 3],
];

function inRange(fixtureId, from, to) {
  const n = Number(fixtureId);
  return n >= from && n <= to;
}

async function loadPass(name) {
  const file = path.join(RUNS, name, "cards.json");
  const doc = JSON.parse(await readFile(file, "utf8"));
  if (doc?.arm !== "b390-line-ids") throw new Error(`${file} is not a B390 pass.`);
  return doc;
}

function findSource(sources, sourceId) {
  if (sourceId == null) return null;
  const id = String(sourceId).trim();
  if (!id) return null;
  return sources.find((source) => source.id === id || source.label === id) || null;
}

function parseOne(token, sourceIds, nested = false) {
  if (typeof token === "number" && Number.isInteger(token)) return { status: "ids", ids: [token], sourceId: null };
  if (Array.isArray(token)) return parseArray(token, sourceIds, nested);
  if (token && typeof token === "object") {
    const sourceId = token.sourceId == null ? null : String(token.sourceId);
    if (Array.isArray(token.lines)) return { ...parseArray(token.lines, sourceIds), sourceId };
    const start = Number(token.start ?? token.from ?? token.line);
    const end = Number(token.end ?? token.to ?? token.line ?? start);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return { status: "malformed", ids: [], sourceId };
    if (end < start) return { status: "reversed", ids: [], sourceId };
    return { status: "ids", ids: spanIds(start, end), sourceId };
  }
  if (typeof token !== "string") return { status: "malformed", ids: [], sourceId: null };
  const text = token.trim();
  if (!text) return { status: "malformed", ids: [], sourceId: null };
  const single = text.match(/^[Ll]?(\d+)$/);
  if (single) return { status: "ids", ids: [Number(single[1])], sourceId: null };
  const range = text.match(/^[Ll]?(\d+)\s*(?:[-–—:]|to)\s*[Ll]?(\d+)$/i);
  if (!range) return { status: "malformed", ids: [], sourceId: null };
  const start = Number(range[1]);
  const end = Number(range[2]);
  if (end < start) return { status: "reversed", ids: [], sourceId: null };
  return { status: "ids", ids: spanIds(start, end), sourceId: null };
}

function spanIds(start, end) {
  const ids = [];
  for (let id = start; id <= end; id += 1) ids.push(id);
  return ids;
}

function parseArray(items, sourceIds, nested) {
  if (
    nested &&
    items.length === 2 &&
    items.every((item) => typeof item === "number" && Number.isInteger(item)) &&
    sourceIds.has(String(items[0]))
  ) {
    return { status: "ids", ids: [items[1]], sourceId: String(items[0]) };
  }
  if (items.length === 3 && items.every((item) => typeof item === "number") && sourceIds.has(String(items[0]))) {
    const start = items[1];
    const end = items[2];
    if (!Number.isInteger(start) || !Number.isInteger(end)) return { status: "malformed", ids: [], sourceId: String(items[0]) };
    if (end < start) return { status: "reversed", ids: [], sourceId: String(items[0]) };
    return { status: "ids", ids: spanIds(start, end), sourceId: String(items[0]) };
  }
  if (items.length === 2 && items.every((item) => typeof item === "number" && Number.isInteger(item))) {
    if (items[1] < items[0]) return { status: "ids", ids: [items[0], items[1]], sourceId: null };
    return { status: "ids", ids: spanIds(items[0], items[1]), sourceId: null };
  }
  if (items.every((item) => typeof item === "number" && Number.isInteger(item))) {
    return { status: "ids", ids: items, sourceId: null };
  }
  return { status: "list", items };
}

export function parseCitation(value, sourceIds) {
  const ids = sourceIds instanceof Set ? sourceIds : new Set(["0"]);
  if (value == null || value === "") return { kind: "null", parts: [] };
  if (typeof value === "string" && /[,;]/.test(value)) {
    const bits = value.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
    return flatten(bits.map((bit) => parseOne(bit, ids)));
  }
  return flatten([parseOne(value, ids)], ids);
}

function flatten(nodes, sourceIds) {
  const parts = [];
  for (const node of nodes) {
    if (node.status === "list") {
      for (const item of node.items) parts.push(parseOne(item, sourceIds, true));
    } else parts.push(node);
  }
  const resolved = [];
  for (const part of parts) {
    if (part.status === "list") {
      resolved.push({ status: "malformed", ids: [], sourceId: null });
    } else resolved.push(part);
  }
  return { kind: "pending", parts: resolved };
}

function citationStats(doc, jobs) {
  const byId = new Map(jobs.map((job) => [job.fixtureId, job]));
  const counts = {
    citations: 0,
    nullCitations: 0,
    textInstead: 0,
    valid: 0,
    invalid: 0,
    malformed: 0,
    reversed: 0,
    outOfRangeIds: 0,
    validIds: 0,
    invalidUnits: 0,
    contained: 0,
    containedWithElements: 0,
    withElements: 0,
    vacuous: 0,
    wrongLines: 0,
    missingSource: 0,
    cap6: 0,
    over6: 0,
    tight: 0,
    tightContained: 0,
  };
  const lengths = {};
  const wrong = [];
  for (const fixture of doc.fixtures || []) {
    if (fixture.parseOk === false) continue;
    const job = byId.get(fixture.fixtureId);
    if (!job) throw new Error(`No job for ${fixture.fixtureId}`);
    const lookups = new Map(job.sources.map((source) => [source.id, numberLines(source.text)]));
    for (const claim of fixture.claims || []) {
      const hasLines = !(claim.lines == null || claim.lines === "" || (Array.isArray(claim.lines) && claim.lines.length === 0));
      const hasPassage = typeof claim.passage === "string" && claim.passage.length > 0;
      if (!hasLines && !hasPassage) {
        counts.nullCitations += 1;
        continue;
      }
      counts.citations += 1;
      if (!hasLines && hasPassage) {
        counts.textInstead += 1;
        counts.invalid += 1;
        counts.malformed += 1;
        counts.invalidUnits += 1;
        continue;
      }
      const sourceIds = new Set(job.sources.map((source) => source.id));
      const parsed = parseCitation(claim.lines, sourceIds);
      const chunks = [];
      const seen = new Set();
      let partMalformed = 0;
      let partReversed = 0;
      let partOut = 0;
      let partValidIds = 0;
      for (const part of parsed.parts) {
        if (part.status === "malformed") {
          partMalformed += 1;
          continue;
        }
        if (part.status === "reversed") {
          partReversed += 1;
          continue;
        }
        const sourceId = part.sourceId || (claim.sourceId != null ? String(claim.sourceId) : null) || (job.sources.length === 1 ? job.sources[0].id : null);
        const source = findSource(job.sources, sourceId);
        const numbered = source ? lookups.get(source.id) : null;
        if (!numbered) {
          partMalformed += 1;
          counts.missingSource += 1;
          continue;
        }
        if (claim.sourceId == null && part.sourceId == null) counts.missingSource += 1;
        for (const id of part.ids) {
          if (!Number.isInteger(id) || id < 1 || id > numbered.maxId || !numbered.lookup.has(id)) {
            partOut += 1;
            continue;
          }
          partValidIds += 1;
          const key = `${source.id}:${id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          chunks.push(numbered.lookup.get(id));
        }
      }
      counts.validIds += partValidIds;
      counts.malformed += partMalformed;
      counts.reversed += partReversed;
      counts.outOfRangeIds += partOut;
      counts.invalidUnits += partMalformed + partReversed + partOut;
      if (partMalformed || partReversed || partOut || chunks.length === 0) {
        counts.invalid += 1;
        continue;
      }
      counts.valid += 1;
      const len = chunks.length;
      lengths[len] = (lengths[len] || 0) + 1;
      if (len === 6) counts.cap6 += 1;
      if (len > 6) counts.over6 += 1;
      if (len <= 6) counts.tight += 1;
      const text = chunks.join("\n");
      const missing = missingElements(claim.claim, text);
      const elementCount = missing.length + elementHits(claim.claim, text);
      if (elementCount === 0) {
        counts.vacuous += 1;
        counts.contained += 1;
        if (len <= 6) counts.tightContained += 1;
      } else if (missing.length === 0) {
        counts.contained += 1;
        counts.containedWithElements += 1;
        counts.withElements += 1;
        if (len <= 6) counts.tightContained += 1;
      } else {
        counts.withElements += 1;
        counts.wrongLines += 1;
        if (wrong.length < 40) {
          wrong.push({
            fixtureId: fixture.fixtureId,
            statementIndex: claim.statementIndex,
            lines: claim.lines,
            missing: missing.slice(0, 6),
            claim: claim.claim.slice(0, 180),
          });
        }
      }
    }
  }
  const referenceUnits = counts.validIds + counts.invalidUnits;
  return {
    counts,
    lengths,
    wrongSample: wrong,
    invalidRate: referenceUnits ? counts.invalidUnits / referenceUnits : null,
    containmentRate: counts.citations ? counts.contained / counts.citations : null,
    containmentWithElementsRate: counts.withElements ? counts.containedWithElements / counts.withElements : null,
  };
}

function elementHits(claim, text) {
  const missing = missingElements(claim, text);
  const all = missingElements(claim, "");
  return Math.max(0, all.length - missing.length);
}

async function accuracyBundle() {
  const labelsDoc = JSON.parse(await readFile(path.join(ROOT, "scripts/diagnostic/accuracy/labels.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(ROOT, "scripts/diagnostic/accuracy/sample-manifest.json"), "utf8"));
  const labels = normalizeLabelsDoc({ labels: labelsDoc.labels }).filter((row) => inRange(row.fixtureId, 11, 20));
  const groupAKeys = new Set(
    manifest.groupA.filter((row) => inRange(row.fixtureId, 11, 20)).map((row) => joinKey(row.fixtureId, row.statementText, row.occurrence))
  );
  const groupBKeys = new Set(
    manifest.groupB.filter((row) => inRange(row.fixtureId, 11, 20)).map((row) => joinKey(row.fixtureId, row.statementText, row.occurrence))
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
  const conflicting = a.confusion.conflicting ? Object.values(a.confusion.conflicting).reduce((n, v) => n + v, 0) : 0;
  console.log(`${title} CATCH ${catchN} of ${conflicting} conflicting labels, group A n=${a.n}`);
  console.log(`${title} LEAVE-ALONE ${b.pipelineAlsoConfirmed} of ${b.n}`);
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
        lines: claim.lines,
      })),
    }));
}

function stillFlagged(flags, pairs) {
  return pairs.map(([fixtureId, index]) => {
    const row = flags.find((item) => item.fixtureId === fixtureId && item.index === index);
    return { fixtureId, index, flagged: Boolean(row), displayVerdict: row?.displayVerdict || "supported_full" };
  });
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

function printCite(title, cite) {
  const c = cite.counts;
  const units = c.validIds + c.invalidUnits;
  console.log(
    `${title} CITATIONS ${c.citations} null ${c.nullCitations} valid ${c.valid} invalid ${c.invalid} textInstead ${c.textInstead} malformed ${c.malformed} reversed ${c.reversed} outOfRangeIds ${c.outOfRangeIds} validIds ${c.validIds} invalidUnits ${c.invalidUnits} of ${units}`
  );
  console.log(
    `${title} CONTAINED ${c.contained} of ${c.citations} withElements ${c.containedWithElements} of ${c.withElements} vacuous ${c.vacuous} WRONG-LINES ${c.wrongLines} cap6 ${c.cap6} over6 ${c.over6} tight ${c.tightContained} of ${c.tight} missingSource ${c.missingSource}`
  );
  console.log(`${title} LENGTHS ${JSON.stringify(cite.lengths)}`);
}

async function main() {
  const first = await loadPass("ids-1");
  const second = await loadPass("ids-2");
  const jobs = await jobsFor("held-out");
  const bundle = await accuracyBundle();
  const score1 = scorePass(first, bundle);
  const score2 = scorePass(second, bundle);
  printAccuracy("ids-1", score1);
  printAccuracy("ids-2", score2);
  const cite1 = citationStats(first, jobs);
  const cite2 = citationStats(second, jobs);
  printCite("ids-1", cite1);
  printCite("ids-2", cite2);
  for (const row of cite1.wrongSample) {
    console.log(`WRONG1 ${row.fixtureId}#${row.statementIndex} lines=${JSON.stringify(row.lines)} missing=${JSON.stringify(row.missing)}`);
    console.log(`  ${row.claim}`);
  }
  const stable = stability(first, second);
  console.log(`STABILITY agree ${stable.agree} moved ${stable.moved} missing ${stable.missing} of ${stable.total}`);
  for (const row of stable.movers) {
    console.log(`  MOVE ${row.fixtureId}#${row.index} ${row.first} -> ${row.second} ${row.statement.slice(0, 140)}`);
  }
  const parse1 = (first.fixtures || []).filter((row) => row.parseOk === false);
  const parse2 = (second.fixtures || []).filter((row) => row.parseOk === false);
  console.log(`PARSE FAIL ids-1 ${parse1.map((row) => `${row.fixtureId}:${row.parseError}`).join(", ") || "none"}`);
  console.log(`PARSE FAIL ids-2 ${parse2.map((row) => `${row.fixtureId}:${row.parseError}`).join(", ") || "none"}`);
  const flags1 = cleanFlags(first);
  const flags2 = cleanFlags(second);
  console.log(`CLEAN FLAGS ids-1 ${flags1.length} ids-2 ${flags2.length}`);
  console.log(`B388 PASS1 WRONG still flagged ${JSON.stringify(stillFlagged(flags1, B388_PASS1_WRONG))}`);
  console.log(`B388 PASS1 REAL still flagged ${JSON.stringify(stillFlagged(flags1, B388_PASS1_REAL))}`);
  console.log(`B388 PASS1 WRONG on ids-2 ${JSON.stringify(stillFlagged(flags2, B388_PASS1_WRONG))}`);
  console.log(`B388 PASS1 REAL on ids-2 ${JSON.stringify(stillFlagged(flags2, B388_PASS1_REAL))}`);
  for (const row of flags1) {
    console.log(`CLEAN1 ${row.fixtureId}#${row.index} ${row.displayVerdict}`);
    console.log(row.statement);
    for (const claim of row.comments) console.log(`  ${claim.verdict}: ${claim.comment}`);
  }
  for (const row of flags2) {
    const same = flags1.find((item) => item.fixtureId === row.fixtureId && item.index === row.index);
    if (same && same.displayVerdict === row.displayVerdict) continue;
    console.log(`CLEAN2-DIFF ${row.fixtureId}#${row.index} ${row.displayVerdict}`);
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
    console.log(`  ids-1: ${a.comments.join(" || ") || "(no comment)"}`);
    console.log(`  ids-2: ${b.comments.join(" || ") || "(no comment)"}`);
  }
  console.log(
    `COST ids-1 ${Number(first.costUsd).toFixed(4)} ids-2 ${Number(second.costUsd).toFixed(4)} combined ${Number(second.combinedCostUsd).toFixed(4)} calls ${first.calls}+${second.calls}`
  );
  const summary = {
    cost: { ids1: first.costUsd, ids2: second.costUsd, combined: second.combinedCostUsd, calls1: first.calls, calls2: second.calls },
    catch: {
      ids1: score1.groupA.confusion.conflicting.conflicting,
      ids2: score2.groupA.confusion.conflicting.conflicting,
    },
    leaveAlone: {
      ids1: score1.groupB.amongBenConfirmed,
      ids2: score2.groupB.amongBenConfirmed,
    },
    citation: {
      ids1: { counts: cite1.counts, lengths: cite1.lengths, invalidRate: cite1.invalidRate, containmentRate: cite1.containmentRate, containmentWithElementsRate: cite1.containmentWithElementsRate },
      ids2: { counts: cite2.counts, lengths: cite2.lengths, invalidRate: cite2.invalidRate, containmentRate: cite2.containmentRate, containmentWithElementsRate: cite2.containmentWithElementsRate },
    },
    stability: { agree: stable.agree, moved: stable.moved, missing: stable.missing, total: stable.total },
    parseFail: { ids1: parse1.map((row) => row.fixtureId), ids2: parse2.map((row) => row.fixtureId) },
    cleanFlags: { ids1: flags1.length, ids2: flags2.length },
  };
  const out = path.join(RUNS, "score-summary.json");
  await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`wrote ${out}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
