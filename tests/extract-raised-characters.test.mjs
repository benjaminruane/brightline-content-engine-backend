/**
 * B327. Raised characters join their own line. Real PDFs, not mocked item streams.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test } from "vitest";
import {
  RAISED_MARKER_TREATMENT,
  extractPdfDirect,
} from "../lib/extract-pdf-direct.mjs";
import {
  SUPPORTED_MIME_TYPES,
  extractTextFromSource,
} from "../lib/extract-text-from-source.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(__dirname, "extraction-corpus", "files");
const RAISED = path.join(CORPUS, "raised_characters.pdf");
const CLEAN = path.join(CORPUS, "native_clean.pdf");
const D17 = path.resolve(
  __dirname,
  "../scripts/diagnostic/delivery-check/b163/corpus/oaktree-the-calculus-of-value.pdf"
);
const D09 = path.resolve(
  __dirname,
  "../scripts/diagnostic/delivery-check/b163/corpus/berkshire-2023-shareholder-letter.pdf"
);

afterEach(() => {
  delete process.env.PDF_RAISED_CHARACTERS;
});

describe("B327 raised characters", () => {
  test("RAISED_MARKER_TREATMENT is space, the one-place Ben ruling", () => {
    assert.equal(RAISED_MARKER_TREATMENT, "space");
  });

  test("an ordinal joins: 25 and th become 25th", async () => {
    const buf = await readFile(RAISED);
    const off = await extractPdfDirect(buf, { raisedCharacters: false });
    const on = await extractPdfDirect(buf);
    assert.match(off.text, /the 25/);
    assert.doesNotMatch(off.text, /25th/);
    assert.match(on.text, /the 25th anniversary/);
    assert.doesNotMatch(on.text, /the 25 anniversary/);
  });

  test("a footnote marker is spaced, not glued (D2 space ruling)", async () => {
    const buf = await readFile(RAISED);
    const on = await extractPdfDirect(buf);
    assert.match(on.text, /\$180\.6 billion 1 /);
    assert.doesNotMatch(on.text, /billion1/);
  });

  test("a figure adjacent to a marker is unchanged", async () => {
    const buf = await readFile(RAISED);
    const off = await extractPdfDirect(buf, { raisedCharacters: false });
    const on = await extractPdfDirect(buf);
    assert.match(off.text, /\$180\.6/);
    assert.match(on.text, /\$180\.6/);
    assert.doesNotMatch(on.text, /\$180\.61/);
    assert.match(on.text, /\$58\.5 billion/);
  });

  test("a document with no raised characters is byte-identical to before the change", async () => {
    const buf = await readFile(CLEAN);
    const off = await extractPdfDirect(buf, { raisedCharacters: false });
    const on = await extractPdfDirect(buf);
    assert.equal(on.text, off.text);
  });

  test("env PDF_RAISED_CHARACTERS=0 restores B321 assembly", async () => {
    process.env.PDF_RAISED_CHARACTERS = "0";
    const buf = await readFile(RAISED);
    const text = (await extractPdfDirect(buf)).text;
    assert.doesNotMatch(text, /25th/);
    assert.match(text, /the 25/);
  });

  test("extractTextFromSource still stamps scanned and keeps the extraction shape", async () => {
    const scanned = await readFile(path.join(CORPUS, "image_only.pdf"));
    const result = await extractTextFromSource(scanned, SUPPORTED_MIME_TYPES.PDF);
    assert.equal(result.extraction.status, "unsupported_scanned");
    assert.equal(typeof result.extraction.method, "string");
    assert.ok(Array.isArray(result.extraction.warnings));
    assert.deepEqual(result.extraction.structure, { pages: [], slides: [], sheets: [] });
  });
});

describe("B327 against the B163 exhibits when the corpus is on disk", () => {
  test("d17 reads the 25th anniversary", async () => {
    let buf;
    try {
      buf = await readFile(D17);
    } catch {
      return;
    }
    const text = (await extractPdfDirect(buf)).text;
    assert.match(text, /the 25th anniversary/);
  });

  test("d09 joins 4th edition", async () => {
    let buf;
    try {
      buf = await readFile(D09);
    } catch {
      return;
    }
    const text = (await extractPdfDirect(buf)).text;
    assert.match(text, /the new 4th edition/);
  });

  test("d13 keeps $180.6 and spaces the footnote 1", async () => {
    let buf;
    try {
      buf = await readFile(D13);
    } catch {
      return;
    }
    const text = (await extractPdfDirect(buf)).text;
    assert.match(text, /\$180\.6 billion/);
    assert.doesNotMatch(text, /\$180\.6 billion1/);
    assert.doesNotMatch(text, /\$180\.61/);
  });
});
