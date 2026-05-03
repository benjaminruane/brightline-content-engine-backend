#!/usr/bin/env node
/**
 * Build tests/r1_2_mini_eval/inputs.json from:
 * 1) argv[2] path if provided
 * 2) locked_ground_truth_v1.csv in this folder (canonical lock file)
 * 3) Brightline_R1.2_GroundTruth_v1.xlsx (sheet "All pairs") if present
 * 4) gt_pairs.seed.tsv
 *
 * CSV must be parsed with RFC-aware quoting (commas inside quoted statement fields).
 * Do not use naive line.split(",").
 *
 * Expected columns (case-insensitive; flexible names):
 *   pairId, draftName, statement, sourceLabel, gt_classification, gpt4o_classification
 *   sourceText (optional) OR sourceFile — load from tests/qc_corpus/
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "csv-parse/sync";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(__dirname, "../qc_corpus");
const OUT = join(__dirname, "inputs.json");

const KNOWN_SOURCE_FILES = new Set([
  "Shopify (text).txt",
  "PR_shopify_enterprise_payments_launch_press_release.txt",
]);

const ALLOWED_CLASSIFICATIONS = new Set([
  "confirmed",
  "partially_confirmed",
  "conflicting",
  "no_support",
]);

function loadCorpusText(filename) {
  const fn = String(filename || "").trim();
  if (!KNOWN_SOURCE_FILES.has(fn)) {
    throw new Error(`Unknown sourceFile "${fn}". Add mapping in build_inputs.mjs or use full sourceText in sheet.`);
  }
  return readFileSync(join(CORPUS_DIR, fn), "utf8");
}

function normKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function mapRow(raw) {
  const by = {};
  for (const [k, v] of Object.entries(raw)) {
    by[normKey(k)] = v;
  }
  const pairId = by.pair_id || by.pairid || by.id || "";
  const draftName = by.draftname || by.draft || "";
  const statement = by.statement || by.claim || "";
  const sourceLabel = by.sourcelabel || by.source || by.source_name || "";
  let sourceText = by.sourcetext || by.source_text || "";
  const sourceFile = (by.sourcefile || by.source_file || "").trim();
  const gt =
    by.gt_classification ||
    by.gtclassification ||
    by.gt ||
    by.ground_truth ||
    by.groundtruth ||
    by.final_gt ||
    "";
  const gpt4o =
    by.gpt4o_classification ||
    by.gpt4oclassification ||
    by.gpt4o ||
    by.gpt_4o ||
    "";

  if (!sourceText && sourceFile) {
    sourceText = loadCorpusText(sourceFile);
  }
  if (!sourceText) {
    const guess =
      /press|pr_|enterprise\s+payments/i.test(sourceLabel) || /pr/i.test(draftName)
        ? "PR_shopify_enterprise_payments_launch_press_release.txt"
        : "Shopify (text).txt";
    sourceText = loadCorpusText(guess);
  }

  return {
    pairId,
    draftName,
    statement,
    sourceLabel,
    sourceText,
    gt_classification: gt,
    gpt4o_classification: gpt4o,
  };
}

/** RFC 4180 CSV / TSV via csv-parse — required when statements contain commas. */
function parseDelimitedFile(text, pathHint) {
  const delimiter = String(pathHint || "").toLowerCase().endsWith(".tsv") ? "\t" : ",";
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    delimiter,
  });
}

function readFromXlsx(path) {
  const wb = XLSX.readFile(path);
  const sheetName = wb.SheetNames.includes("All pairs") ? "All pairs" : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return data.map((raw) => mapRow(raw));
}

function assertClassificationLabels(pairs) {
  pairs.forEach((p, i) => {
    const gt = p.gt_classification;
    const g4 = p.gpt4o_classification;
    if (!ALLOWED_CLASSIFICATIONS.has(gt)) {
      throw new Error(
        `Row ${i + 1} (${p.pairId}): invalid gt_classification ${JSON.stringify(gt)} — expected one of ${[...ALLOWED_CLASSIFICATIONS].join(", ")}`
      );
    }
    if (!ALLOWED_CLASSIFICATIONS.has(g4)) {
      throw new Error(
        `Row ${i + 1} (${p.pairId}): invalid gpt4o_classification ${JSON.stringify(g4)} — expected one of ${[...ALLOWED_CLASSIFICATIONS].join(", ")}`
      );
    }
  });
}

function main() {
  const xlsxPath = join(__dirname, "Brightline_R1.2_GroundTruth_v1.xlsx");
  const lockedCsvPath = join(__dirname, "locked_ground_truth_v1.csv");
  const argPath = process.argv[2];
  let pairs = [];

  if (argPath && existsSync(argPath)) {
    if (argPath.endsWith(".xlsx")) {
      pairs = readFromXlsx(argPath);
    } else {
      const text = readFileSync(argPath, "utf8");
      const rawRows = parseDelimitedFile(text, argPath);
      pairs = rawRows.map((r) => mapRow(r));
    }
  } else if (existsSync(lockedCsvPath)) {
    const text = readFileSync(lockedCsvPath, "utf8");
    const rawRows = parseDelimitedFile(text, lockedCsvPath);
    pairs = rawRows.map((r) => mapRow(r));
  } else if (existsSync(xlsxPath)) {
    pairs = readFromXlsx(xlsxPath);
  } else {
    const seed = join(__dirname, "gt_pairs.seed.tsv");
    if (!existsSync(seed)) {
      console.error("No input source: place locked_ground_truth_v1.csv, Brightline_R1.2_GroundTruth_v1.xlsx, or pass path to CSV/TSV.");
      process.exit(1);
    }
    const text = readFileSync(seed, "utf8");
    const rawRows = parseDelimitedFile(text, seed);
    pairs = rawRows.map((r) => mapRow(r));
  }

  const bad = pairs.filter((p) => !p.pairId || !p.statement || !p.sourceText);
  if (bad.length) {
    console.error("Rows missing pairId, statement, or sourceText:", bad.length);
    process.exit(1);
  }

  try {
    assertClassificationLabels(pairs);
  } catch (e) {
    console.error(e.message || String(e));
    process.exit(1);
  }

  writeFileSync(OUT, JSON.stringify({ pairs, builtAt: new Date().toISOString() }, null, 2), "utf8");
  console.log(`Wrote ${pairs.length} pairs to ${OUT}`);
}

main();
