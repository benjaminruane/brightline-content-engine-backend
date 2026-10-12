#!/usr/bin/env node
/**
 * B383. Gap between adjacent items on a band, in ems.
 * next.x - (prev.x + prev.width), divided by the previous item's fontSize.
 *
 *   node scripts/diagnostic/b383/space-check.mjs
 *
 * PDFs: every file in scripts/diagnostic/extraction-check/inputs/,
 * plus the committed ClearPoint source.
 * Does not change how lines are joined.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { itemsFromPdfjsTextContent, pageJoinRows } from "../../../lib/extract-pdf-direct.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const INPUTS = path.join(ROOT, "scripts/diagnostic/extraction-check/inputs");
const CLEARPOINT = path.join(
  ROOT,
  "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026.pdf"
);

const CUTS = [0.05, 0.1, 0.15, 0.2, 0.3];
const BINS = [
  ["<0", (e) => e < 0],
  ["0-0.02", (e) => e >= 0 && e < 0.02],
  ["0.02-0.05", (e) => e >= 0.02 && e < 0.05],
  ["0.05-0.08", (e) => e >= 0.05 && e < 0.08],
  ["0.08-0.10", (e) => e >= 0.08 && e < 0.1],
  ["0.10-0.12", (e) => e >= 0.1 && e < 0.12],
  ["0.12-0.15", (e) => e >= 0.12 && e < 0.15],
  ["0.15-0.18", (e) => e >= 0.15 && e < 0.18],
  ["0.18-0.20", (e) => e >= 0.18 && e < 0.2],
  ["0.20-0.25", (e) => e >= 0.2 && e < 0.25],
  ["0.25-0.30", (e) => e >= 0.25 && e < 0.3],
  ["0.30-0.40", (e) => e >= 0.3 && e < 0.4],
  ["0.40-0.60", (e) => e >= 0.4 && e < 0.6],
  ["0.60-1", (e) => e >= 0.6 && e < 1],
  [">=1", (e) => e >= 1],
];

function ends(s) {
  const raw = String(s).replace(/\s+/g, " ");
  const tail = raw.slice(-18);
  const head = raw.slice(0, 18);
  return raw.length > 18 ? `…${tail}` : head;
}

async function rowsOf(filePath) {
  const buf = await readFile(filePath);
  const doc = await getDocument({
    data: new Uint8Array(buf),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const rows = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    rows.push(...pageJoinRows(itemsFromPdfjsTextContent(tc.items)));
  }
  if (typeof doc.destroy === "function") {
    try {
      await doc.destroy();
    } catch {
      /* ignore */
    }
  }
  return rows;
}

function pairsOf(rows) {
  const pairs = [];
  let noSize = 0;
  for (const row of rows) {
    const items = row.filter((it) => it && it.str);
    for (let i = 1; i < items.length; i += 1) {
      const prev = items[i - 1];
      const next = items[i];
      const width = Number(prev.width);
      const gap = Number(next.x) - (Number(prev.x) + (Number.isFinite(width) ? width : 0));
      const size = prev.fontSize > 0 ? prev.fontSize : next.fontSize > 0 ? next.fontSize : 0;
      if (!(size > 0) || !Number.isFinite(gap)) {
        noSize += 1;
        continue;
      }
      const prevTrim = String(prev.str).trim();
      const nextTrim = String(next.str).trim();
      pairs.push({
        em: gap / size,
        gap,
        size,
        prev: prev.str,
        next: next.str,
        content: prevTrim.length > 0 && nextTrim.length > 0,
      });
    }
  }
  return { pairs, noSize };
}

function summarise(name, pairs, noSize) {
  const below = {};
  for (const cut of CUTS) below[cut] = 0;
  const bins = Object.fromEntries(BINS.map(([label]) => [label, 0]));
  for (const pair of pairs) {
    for (const cut of CUTS) if (pair.em < cut) below[cut] += 1;
    for (const [label, test] of BINS) {
      if (test(pair.em)) {
        bins[label] += 1;
        break;
      }
    }
  }
  return { name, pairs: pairs.length, noSize, below, bins };
}

function printFile(row) {
  const cuts = CUTS.map((cut) => `lt${cut}=${row.below[cut]}`).join(" ");
  console.log(`FILE ${row.name} pairs=${row.pairs} noSize=${row.noSize} ${cuts}`);
}

async function main() {
  const names = (await readdir(INPUTS)).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  const files = [
    ...names.map((name) => ({ name, filePath: path.join(INPUTS, name) })),
    { name: path.basename(CLEARPOINT), filePath: CLEARPOINT },
  ];
  const totals = summarise("TOTAL", [], 0);
  const contentTotals = summarise("CONTENT", [], 0);
  const examples = Object.fromEntries(BINS.map(([label]) => [label, []]));
  for (const file of files) {
    const { pairs, noSize } = pairsOf(await rowsOf(file.filePath));
    const row = summarise(file.name, pairs, noSize);
    const content = summarise(`${file.name} content`, pairs.filter((pair) => pair.content), 0);
    printFile(row);
    printFile(content);
    totals.pairs += row.pairs;
    totals.noSize += row.noSize;
    contentTotals.pairs += content.pairs;
    for (const cut of CUTS) {
      totals.below[cut] += row.below[cut];
      contentTotals.below[cut] += content.below[cut];
    }
    for (const [label] of BINS) {
      totals.bins[label] += row.bins[label];
      contentTotals.bins[label] += content.bins[label];
    }
    for (const pair of pairs) {
      if (!pair.content) continue;
      for (const [label, test] of BINS) {
        if (!test(pair.em)) continue;
        const bag = examples[label];
        if (bag.length < 8) {
          bag.push(`${file.name} ${pair.em.toFixed(3)} "${ends(pair.prev)}" | "${ends(pair.next)}"`);
        }
        break;
      }
    }
  }
  printFile(totals);
  printFile(contentTotals);
  console.log("BINS all");
  for (const [label] of BINS) console.log(`BIN ${label} ${totals.bins[label]}`);
  console.log("BINS content");
  for (const [label] of BINS) console.log(`BIN ${label} ${contentTotals.bins[label]}`);
  console.log("EXAMPLES content-content");
  for (const [label] of BINS) {
    console.log(`EG ${label}`);
    for (const line of examples[label]) console.log(`  ${line}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
