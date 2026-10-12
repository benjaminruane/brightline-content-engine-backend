#!/usr/bin/env node
/**
 * B382. Per page: the x-interval of text items, whether a persistent
 * vertical gap splits that interval into columns, and how many y-bands
 * hold items from more than one of those columns.
 *
 *   node scripts/diagnostic/b382/column-check.mjs
 *
 * PDFs: every file in scripts/diagnostic/extraction-check/inputs/,
 * plus the committed ClearPoint source.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { itemsFromPdfjsTextContent, pageColumnLayout } from "../../../lib/extract-pdf-direct.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const INPUTS = path.join(ROOT, "scripts/diagnostic/extraction-check/inputs");
const CLEARPOINT = path.join(
  ROOT,
  "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026.pdf"
);

function fmt(n) {
  return Number.isFinite(n) ? n.toFixed(1) : "-";
}

async function pagesOf(filePath) {
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
    const layout = pageColumnLayout(itemsFromPdfjsTextContent(tc.items));
    const columns = layout.gutters.length ? layout.gutters.length + 1 : 1;
    rows.push({ page: p, layout, columns });
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

function printPage(name, row) {
  const { layout } = row;
  const gaps = layout.gutters.map((g) => `${g.a.toFixed(1)}-${g.b.toFixed(1)}`).join(",");
  console.log(
    [
      name,
      `page=${row.page}`,
      `x=${fmt(layout.minX)}..${fmt(layout.maxX)}`,
      `columns=${row.columns}`,
      `gap=${layout.gutters.length ? "yes" : "no"}`,
      gaps ? `gutters=${gaps}` : "gutters=-",
      `crossBands=${layout.crossBands}`,
    ].join(" ")
  );
}

async function main() {
  const names = (await readdir(INPUTS)).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  const files = names.map((name) => path.join(INPUTS, name));
  files.push(CLEARPOINT);

  let pages = 0;
  let multi = 0;
  let cross = 0;
  for (const filePath of files) {
    const name = path.basename(filePath);
    const rows = await pagesOf(filePath);
    let fileMulti = 0;
    let fileCross = 0;
    for (const row of rows) {
      printPage(name, row);
      pages += 1;
      if (row.columns > 1) {
        multi += 1;
        fileMulti += 1;
      }
      cross += row.layout.crossBands;
      fileCross += row.layout.crossBands;
    }
    console.log(`FILE ${name} pages=${rows.length} multi=${fileMulti} crossBands=${fileCross}`);
  }
  console.log(`TOTAL pages=${pages} multi=${multi} crossBands=${cross}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
