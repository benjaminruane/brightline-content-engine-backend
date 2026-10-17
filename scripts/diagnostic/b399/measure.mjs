// B399. Runs B398 rule B2, unchanged, on the assembled sources.
//
//   node scripts/diagnostic/b399/measure.mjs

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectBinding } from "../b398/bind.mjs";
import { SOURCES } from "./assemble.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(root, "scripts/diagnostic/b399/runs");

function load(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8"));
}

function scoreDir(dir) {
  const bySource = new Map(
    SOURCES.map((rel) => [rel, readFileSync(path.join(dir, path.basename(rel)), "utf8")]),
  );
  return collectBinding((rel) => {
    const text = bySource.get(rel);
    if (text == null) throw new Error(`no assembled source for ${rel}`);
    return text;
  });
}

const b397 = load("scripts/diagnostic/b397/runs/classify.json");
const b398 = load("scripts/diagnostic/b398/runs/bind.json");
const runs = {
  a1: scoreDir(path.join(OUT, "assembled")),
  a2: scoreDir(path.join(OUT, "assembled-a2")),
};

const b397ById = new Map(b397.rows.map((row) => [row.id, row]));
const b398ById = new Map(b398.planted.map((row) => [row.id, row]));

function pack(b399) {
const rows = b399.planted.map((row) => {
  const prior = b397ById.get(row.id);
  const raw = b398ById.get(row.id);
  if (!prior || !raw) throw new Error(`missing prior ${row.id}`);
  return {
    id: row.id,
    doc: row.doc,
    index: row.index,
    type: row.type,
    b397: Boolean(prior.catch),
    b398: Boolean(raw.b2Catch),
    b399: Boolean(row.b2Catch),
    b399Reason: row.b2Reason,
    b399Bound: row.b2Bound,
    b399Sentence: row.b2Sentence,
  };
});

const types = [...new Set(rows.map((row) => row.type))];
const byType = types.map((type) => {
  const subset = rows.filter((row) => row.type === type);
  return {
    type,
    n: subset.length,
    b397: subset.filter((row) => row.b397).length,
    b398: subset.filter((row) => row.b398).length,
    b399: subset.filter((row) => row.b399).length,
  };
});

const changedFromB398 = rows.filter((row) => row.b398 !== row.b399);
const missedNow = rows.filter((row) => (row.b397 || row.b398) && !row.b399);

const FIVE = ["3i-S8-a", "3i-S14-a", "hicl-S5-b", "clearpoint-S8-a", "clearpoint-S9-b"];

function cleanKey(row) {
  return `${row.doc}#${row.index}`;
}
const b398Clean = new Map(b398.clean.map((row) => [cleanKey(row), row]));
const clean = b399.clean.map((row) => {
  const raw = b398Clean.get(cleanKey(row));
  const prior = b397.clean.find((item) => item.doc === row.doc && item.index === row.index);
  if (!raw || !prior) throw new Error(`missing clean ${cleanKey(row)}`);
  return {
    doc: row.doc,
    index: row.index,
    statement: row.statement,
    b397: prior.flags,
    b398: raw.b2Flags,
    b399: row.b2Flags.map((flag) => ({
      type: flag.type,
      surface: flag.surface,
      reason: flag.reason,
      bound: flag.bound,
      score: flag.score,
      window: flag.window,
    })),
  };
});

  return {
    reach: {
      b397: rows.filter((row) => row.b397).length,
      b398: rows.filter((row) => row.b398).length,
      b399: rows.filter((row) => row.b399).length,
    },
    byType,
    changedFromB398,
    missedNow,
    five: FIVE.map((id) => rows.find((row) => row.id === id)),
    clearpointS3: rows.find((row) => row.id === "clearpoint-S3-a"),
    cleanFlagCounts: {
      b397: clean.filter((row) => row.b397.length).length,
      b398: clean.filter((row) => row.b398.length).length,
      b399: clean.filter((row) => row.b399.length).length,
    },
    clean,
    rows,
  };
}

const report = {
  a1: pack(runs.a1),
  a2: pack(runs.a2),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "measure.json"), `${JSON.stringify(report, null, 2)}\n`);

for (const [name, block] of Object.entries(report)) {
  console.log(`\n== ${name} REACH b397 ${block.reach.b397} b398 ${block.reach.b398} b399 ${block.reach.b399}`);
  for (const row of block.byType) console.log(`TYPE ${row.type} ${row.n} ${row.b397} ${row.b398} ${row.b399}`);
  console.log(`CHANGED ${block.changedFromB398.length}`);
  for (const row of block.changedFromB398) console.log(`  ${row.id} ${row.type} b398=${row.b398} b399=${row.b399} ${row.b399Reason}`);
  console.log(`MISSED NOW ${block.missedNow.length}`);
  for (const row of block.missedNow) console.log(`  ${row.id} b397=${row.b397} b398=${row.b398}`);
  console.log("FIVE");
  for (const row of block.five) console.log(`  ${row.id} b397=${row.b397} b398=${row.b398} b399=${row.b399} bound=${row.b399Bound}`);
  console.log(`S3 b397=${block.clearpointS3.b397} b398=${block.clearpointS3.b398} b399=${block.clearpointS3.b399} ${block.clearpointS3.b399Reason}`);
  console.log(`CLEAN FLAGS b397 ${block.cleanFlagCounts.b397} b398 ${block.cleanFlagCounts.b398} b399 ${block.cleanFlagCounts.b399}`);
  for (const row of block.clean.filter((item) => item.b399.length)) {
    console.log(`  ${row.doc} S${row.index}`);
    for (const flag of row.b399) {
      const window = (flag.window || "").replace(/\s+/g, " ");
      console.log(`    ${flag.type} ${flag.surface} bound=${flag.bound} score=${flag.score}`);
      console.log(`    WINDOW ${window.slice(0, 500)}`);
    }
  }
}
