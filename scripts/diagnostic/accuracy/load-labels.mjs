#!/usr/bin/env node
/**
 * Write adjudicated labels into labels.json from worksheet row numbers.
 * No pipeline. No spend.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  flattenStatements,
  joinKey,
  normalizeStatementText,
  padFixtureId,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Worksheet row number -> C/P/X/N. Source: Claude proposed, Ben adjudicated, 2026-09-05. */
export const ADJUDICATED_ROWS = {
  "01": ["P", "C", "C", "C"],
  "02": ["C", "P", "C"],
  "03": ["C", "C", "C"],
  "04": ["P", "C", "C", "C", "C", "C", "C", "C"],
  "05": ["X", "C", "C", "X", "X"],
  "06": ["C", "C", "C", "C"],
  "07": ["C", "C", "C"],
  "08": ["P", "C", "C", "P", "P", "C", "C"],
  "09": ["C", "P", "P", "C", "C", "C"],
  "10": ["C", "C"],
  "11": ["C", "C", "C", "C", "C", "C"],
  "12": ["P", "C", "C", "C"],
  "13": ["C", "C", "C", "X", "X", "C", "C", "C"],
  "14": ["C", "C", "C", "P", "X", "N"],
  "15": ["C", "C", "C", "C", "C", "C"],
  "16": ["C", "C", "C", "C", "C"],
  "17": ["P", "C", "C", "C"],
  "18": ["X", "C", "X", "X", "X", "X", "X"],
  "19": ["C", "C", "C", "C", "C", "C"],
  "20": ["C", "C", "C"],
};

const LETTER_TO_LABEL = {
  C: "confirmed",
  P: "partially_confirmed",
  X: "conflicting",
  N: "no_support",
  E: "unrateable",
};

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

export function parseWorksheetRows(markdown) {
  const byFixture = new Map();
  let current = null;
  for (const line of String(markdown || "").split("\n")) {
    const heading = line.match(/^## F(\d{2})\b/);
    if (heading) {
      current = heading[1];
      if (!byFixture.has(current)) byFixture.set(current, []);
      continue;
    }
    const row = line.match(/^\| (\d+) \| (.*) \|  \|  \|$/);
    if (row && current) {
      const text = row[2].replace(/\\\|/g, "|");
      byFixture.get(current).push({ worksheetRow: Number(row[1]), text });
    }
  }
  return byFixture;
}

export function buildLabels({ worksheetMd, statementsDoc, manifest }) {
  const worksheet = parseWorksheetRows(worksheetMd);
  const frozen = flattenStatements(statementsDoc);
  const frozenByNorm = new Map();
  for (const s of frozen) {
    const k = `${s.fixtureId}::${normalizeStatementText(s.text)}`;
    if (!frozenByNorm.has(k)) frozenByNorm.set(k, []);
    frozenByNorm.get(k).push(s);
  }
  const groupByKey = new Map();
  for (const row of manifest.groupA || []) {
    groupByKey.set(joinKey(row.fixtureId, row.statementText, row.occurrence), "A");
  }
  for (const row of manifest.groupB || []) {
    groupByKey.set(joinKey(row.fixtureId, row.statementText, row.occurrence), "B");
  }

  const labels = [];
  const unmatched = [];
  const mix = { C: 0, P: 0, X: 0, N: 0, E: 0 };
  for (const fid of Object.keys(ADJUDICATED_ROWS).sort()) {
    const letters = ADJUDICATED_ROWS[fid];
    const rows = worksheet.get(fid) || [];
    if (rows.length !== letters.length) {
      throw new Error(
        `F${fid}: worksheet has ${rows.length} rows, adjudicated list has ${letters.length}`
      );
    }
    for (let i = 0; i < letters.length; i += 1) {
      const letter = letters[i];
      const text = rows[i].text;
      const bucket = frozenByNorm.get(`${fid}::${normalizeStatementText(text)}`) || [];
      if (bucket.length !== 1) {
        unmatched.push({
          fixtureId: fid,
          worksheetRow: rows[i].worksheetRow,
          text,
          matchCount: bucket.length,
        });
        continue;
      }
      const stmt = bucket[0];
      const key = joinKey(stmt.fixtureId, stmt.text, stmt.occurrence);
      mix[letter] += 1;
      labels.push({
        fixtureId: stmt.fixtureId,
        statementText: stmt.text,
        occurrence: stmt.occurrence,
        worksheetRow: rows[i].worksheetRow,
        group: groupByKey.get(key) || null,
        label: LETTER_TO_LABEL[letter],
      });
    }
  }
  return { labels, unmatched, mix, count: labels.length };
}

async function main() {
  const worksheetMd = await readFile(path.join(__dirname, "worksheet.md"), "utf8");
  const statementsDoc = JSON.parse(await readFile(path.join(__dirname, "statements.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(__dirname, "sample-manifest.json"), "utf8"));
  const built = buildLabels({ worksheetMd, statementsDoc, manifest });
  console.log(`labels in: ${built.count} unmatched: ${built.unmatched.length}`);
  console.log(`mix C=${built.mix.C} P=${built.mix.P} X=${built.mix.X} N=${built.mix.N} E=${built.mix.E}`);
  const groupA = built.labels.filter((l) => l.group === "A").length;
  const groupB = built.labels.filter((l) => l.group === "B").length;
  console.log(`groups A=${groupA} B=${groupB}`);
  if (built.unmatched.length > 0) {
    for (const u of built.unmatched) {
      console.error(`UNMATCHED F${u.fixtureId} row ${u.worksheetRow} matches=${u.matchCount}`);
      console.error(`  ${u.text}`);
    }
    throw new Error("JOIN FAILED. Not writing labels.json. Not spending.");
  }
  if (built.count !== 100) throw new Error(`expected 100 labels, got ${built.count}`);
  if (built.mix.C !== 76 || built.mix.P !== 11 || built.mix.X !== 12 || built.mix.N !== 1 || built.mix.E !== 0) {
    throw new Error(`mix mismatch: ${JSON.stringify(built.mix)}`);
  }
  const doc = {
    schema: "accuracy-labels-v1",
    status: "adjudicated",
    labelledAt: "2026-09-05",
    source: "Claude proposed, Ben adjudicated, 2026-09-05",
    mix: built.mix,
    labels: built.labels,
  };
  await writeFile(path.join(__dirname, "labels.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log("JOIN OK 100 labels in, 100 matched, 0 unmatched. wrote labels.json");
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
