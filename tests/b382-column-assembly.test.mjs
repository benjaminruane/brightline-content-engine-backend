/**
 * B382. A page with no persistent vertical gap stays on the arm C path.
 * A page with one is read column by column, left to right.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import {
  assemblePdfPageItems,
  extractPdfDirect,
  itemsFromPdfjsTextContent,
  pageColumnLayout,
} from "../lib/extract-pdf-direct.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NATIVE = path.join(__dirname, "extraction-corpus/files/native_clean.pdf");
const RAISED = path.join(__dirname, "extraction-corpus/files/raised_characters.pdf");
const CLEARPOINT = path.join(
  __dirname,
  "fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026.pdf"
);

const NATIVE_TEXT =
  "Vantor Systems - Investment Overview\n" +
  "Vantor Systems generated revenue of $24 million in FY2024, up from $18 million in FY2023.\n" +
  "The Company employs 142 staff across three regional offices.\n" +
  "The base case generates a 2.8x MOIC and a 23% gross IRR.\n" +
  "The firm is evaluating an investment of up to seven million dollars in the Series A round.";

const RAISED_TEXT =
  "January 2 of this year was the 25th anniversary of my memo.\n" +
  " \n" +
  "We earned revenue of $180.6 billion 1 and net income of $58.5 billion.";

describe("B382 column assembly", () => {
  test("a single-column PDF is byte-identical to the pre-change extract", async () => {
    const native = await extractPdfDirect(await readFile(NATIVE));
    const raised = await extractPdfDirect(await readFile(RAISED));
    assert.equal(native.text, NATIVE_TEXT);
    assert.equal(raised.text, RAISED_TEXT);
  });

  test("one column of items has no gutter and reads top to bottom", () => {
    const items = [];
    for (let i = 0; i < 10; i += 1) {
      items.push({ str: `Only ${i}`, x: 72, y: 700 - i * 14, width: 180 });
    }
    const layout = pageColumnLayout(items);
    assert.equal(layout.gutters.length, 0);
    assert.equal(layout.crossBands, 0);
    const text = assemblePdfPageItems(items);
    assert.equal(text, items.map((it) => it.str).join("\n"));
  });

  test("two columns are concatenated left then right", () => {
    const items = [];
    for (let i = 0; i < 8; i += 1) {
      const y = 700 - i * 16;
      items.push({ str: `Left ${i}`, x: 40, y, width: 90 });
      items.push({ str: `Right ${i}`, x: 240, y, width: 90 });
    }
    const layout = pageColumnLayout(items);
    assert.equal(layout.gutters.length, 1);
    assert.equal(layout.crossBands, 8);
    const text = assemblePdfPageItems(items);
    const lefts = text.indexOf("Left 7");
    const rights = text.indexOf("Right 0");
    assert.ok(lefts > 0 && rights > lefts);
    assert.doesNotMatch(text, /Left 0\nRight 0/);
    assert.match(text, /Left 0\nLeft 1\nLeft 2/);
    assert.match(text, /Right 0\nRight 1\nRight 2/);
  });

  test("ClearPoint sidebar no longer sits inside the article sentences", async () => {
    const text = (await extractPdfDirect(await readFile(CLEARPOINT))).text;
    assert.match(
      text,
      /today announced financial results for its\nfirst quarter ended March 31, 2026\./
    );
    assert.doesNotMatch(text, /for its\nMore Press Releases\nfirst quarter/);
    assert.match(text, /of IRRAflow\nrevenue, representing 43% overall growth/);
    assert.doesNotMatch(text, /IRRA flow\nPositive BioPharma Partner Regulatory\nrevenue/);
    assert.match(text, /workflows with first\ncases now scheduled;/);
    assert.doesNotMatch(text, /with first ClearPoint Neuro to Announce/);

    const buf = await readFile(CLEARPOINT);
    const doc = await getDocument({
      data: new Uint8Array(buf),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    const page = await doc.getPage(1);
    const tc = await page.getTextContent();
    const layout = pageColumnLayout(itemsFromPdfjsTextContent(tc.items));
    assert.equal(layout.gutters.length, 1);
    assert.ok(layout.gutters[0].a > 860 && layout.gutters[0].a < 890);
    assert.ok(layout.gutters[0].b > 990 && layout.gutters[0].b < 1020);
    assert.equal(layout.crossBands, 5);
    if (typeof doc.destroy === "function") await doc.destroy();
  });
});
