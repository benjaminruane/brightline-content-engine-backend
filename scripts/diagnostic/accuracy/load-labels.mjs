#!/usr/bin/env node
/**
 * Write adjudicated labels into labels.json from worksheet row numbers.
 * No pipeline. No spend.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  LABEL_KIND_DRAFT_INTERNAL_PAIR,
  LABEL_KIND_STATEMENT,
  assertNotP29ProtectedWrite,
  flattenStatements,
  joinKey,
  labelKind,
  normalizeStatementText,
  padFixtureId,
  writeAccuracyFile,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_WORKSHEET_PATH = path.join(__dirname, "worksheet.md");
export const DEFAULT_MANIFEST_PATH = path.join(__dirname, "sample-manifest.json");
export const DEFAULT_STATEMENTS_PATH = path.join(__dirname, "statements.json");
export const DEFAULT_OUT_PATH = path.join(__dirname, "labels.json");

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
  "13": ["C", "C", "C", "X", "X", "C", "C", "P"],
  "14": ["C", "C", "C", "P", "X", "N"],
  "15": ["C", "P", "C", "C", "C", "C"],
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

/**
 * Missing kind reads as "statement" so corpus 1 labels.json parses unchanged.
 */
export function normalizeLabelRow(row) {
  const kind = labelKind(row);
  if (kind === LABEL_KIND_DRAFT_INTERNAL_PAIR) {
    return {
      kind: LABEL_KIND_DRAFT_INTERNAL_PAIR,
      fixtureId: padFixtureId(row.fixtureId),
      statementTextA: typeof row.statementTextA === "string" ? row.statementTextA : "",
      occurrenceA: Number(row.occurrenceA) || 0,
      statementTextB: typeof row.statementTextB === "string" ? row.statementTextB : "",
      occurrenceB: Number(row.occurrenceB) || 0,
      worksheetRow: row.worksheetRow ?? null,
      group: row.group ?? null,
      label: row.label ?? null,
    };
  }
  return {
    kind: LABEL_KIND_STATEMENT,
    fixtureId: padFixtureId(row.fixtureId),
    statementText: typeof row.statementText === "string" ? row.statementText : typeof row.text === "string" ? row.text : "",
    occurrence: Number(row.occurrence) || 0,
    worksheetRow: row.worksheetRow ?? null,
    group: row.group ?? null,
    label: row.label ?? null,
  };
}

export function normalizeLabelsDoc(doc) {
  const labels = Array.isArray(doc?.labels) ? doc.labels : Array.isArray(doc) ? doc : [];
  return labels.map((row) => normalizeLabelRow(row));
}

export function parseLoadLabelsArgs(argv) {
  const out = { worksheet: null, manifest: null, statements: null, out: null };
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--worksheet" && args[i + 1]) out.worksheet = args[++i];
    else if (args[i] === "--manifest" && args[i + 1]) out.manifest = args[++i];
    else if (args[i] === "--statements" && args[i + 1]) out.statements = args[++i];
    else if (args[i] === "--out" && args[i + 1]) out.out = args[++i];
  }
  return out;
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
      labels.push(
        normalizeLabelRow({
          fixtureId: stmt.fixtureId,
          statementText: stmt.text,
          occurrence: stmt.occurrence,
          worksheetRow: rows[i].worksheetRow,
          group: groupByKey.get(key) || null,
          label: LETTER_TO_LABEL[letter],
        })
      );
    }
  }
  return { labels, unmatched, mix, count: labels.length };
}

export async function writeLabels({ worksheetPath, manifestPath, statementsPath, outPath }) {
  const resolvedOut = path.resolve(outPath);
  assertNotP29ProtectedWrite(resolvedOut);
  const worksheetMd = await readFile(path.resolve(worksheetPath), "utf8");
  const statementsDoc = JSON.parse(await readFile(path.resolve(statementsPath), "utf8"));
  const manifest = JSON.parse(await readFile(path.resolve(manifestPath), "utf8"));
  const built = buildLabels({ worksheetMd, statementsDoc, manifest });
  if (built.unmatched.length > 0) {
    for (const u of built.unmatched) {
      console.error(`UNMATCHED F${u.fixtureId} row ${u.worksheetRow} matches=${u.matchCount}`);
      console.error(`  ${u.text}`);
    }
    throw new Error("JOIN FAILED. Not writing labels.json. Not spending.");
  }
  if (built.count !== 100) throw new Error(`expected 100 labels, got ${built.count}`);
  if (built.mix.C !== 74 || built.mix.P !== 13 || built.mix.X !== 12 || built.mix.N !== 1 || built.mix.E !== 0) {
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
  await writeAccuracyFile(resolvedOut, `${JSON.stringify(doc, null, 2)}\n`);
  return { built, outPath: resolvedOut, doc };
}

async function main() {
  const args = parseLoadLabelsArgs(process.argv.slice(2));
  const { built, outPath } = await writeLabels({
    worksheetPath: args.worksheet ? path.resolve(args.worksheet) : DEFAULT_WORKSHEET_PATH,
    manifestPath: args.manifest ? path.resolve(args.manifest) : DEFAULT_MANIFEST_PATH,
    statementsPath: args.statements ? path.resolve(args.statements) : DEFAULT_STATEMENTS_PATH,
    outPath: args.out ? path.resolve(args.out) : DEFAULT_OUT_PATH,
  });
  console.log(`labels in: ${built.count} unmatched: ${built.unmatched.length}`);
  console.log(`mix C=${built.mix.C} P=${built.mix.P} X=${built.mix.X} N=${built.mix.N} E=${built.mix.E}`);
  const groupA = built.labels.filter((l) => l.group === "A").length;
  const groupB = built.labels.filter((l) => l.group === "B").length;
  console.log(`groups A=${groupA} B=${groupB}`);
  console.log(`JOIN OK 100 labels in, 100 matched, 0 unmatched. wrote ${outPath}`);
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
