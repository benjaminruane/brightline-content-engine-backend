/**
 * B317: QC_EXTRACT_STRUCTURE default off. Text convert unchanged.
 * Chunks convert skipped when off; empty page/slide/sheet shape; status still ok.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test } from "vitest";
import {
  SUPPORTED_MIME_TYPES,
  extractTextFromSource,
} from "../lib/extract-text-from-source.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(__dirname, "extraction-corpus", "files");
const NATIVE = path.join(CORPUS, "native_clean.pdf");
const MULTIPAGE = path.join(CORPUS, "multipage.pdf");
const SCANNED = path.join(CORPUS, "image_only.pdf");

const FLAG = "QC_EXTRACT_STRUCTURE";

function setFlag(value) {
  if (value == null) delete process.env[FLAG];
  else process.env[FLAG] = value;
}

afterEach(() => {
  delete process.env[FLAG];
});

describe("B317 QC_EXTRACT_STRUCTURE", () => {
  test(
    "flag off: empty structure, status ok, chunkConvertMs 0, text identical to flag on",
    async () => {
      const buf = await readFile(MULTIPAGE);

      setFlag(undefined);
      const off = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);

      setFlag("true");
      const on = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);

      assert.equal(off.extraction.status, "ok");
      assert.deepEqual(off.extraction.structure, { pages: [], slides: [], sheets: [] });
      assert.equal(off.extraction.chunkConvertMs, 0);
      assert.equal(typeof off.extraction.textConvertMs, "number");
      assert.ok(off.extraction.textConvertMs >= 0);

      assert.equal(on.extraction.status, "ok");
      assert.ok(Array.isArray(on.extraction.structure?.pages));
      assert.ok(on.extraction.structure.pages.length > 0);
      assert.ok(on.extraction.chunkConvertMs > 0);

      assert.equal(off.text, on.text);
    },
    120_000
  );

  test(
    "flag on: structure populated, unchanged shape from today",
    async () => {
      const buf = await readFile(NATIVE);
      setFlag("1");
      const on = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);
      assert.equal(on.extraction.status, "ok");
      const structure = on.extraction.structure;
      assert.equal(typeof structure, "object");
      assert.ok(Array.isArray(structure.pages));
      assert.ok(Array.isArray(structure.slides));
      assert.ok(Array.isArray(structure.sheets));
      assert.equal(structure.slides.length, 0);
      assert.equal(structure.sheets.length, 0);
      assert.ok(structure.pages.length > 0);
      for (const page of structure.pages) {
        assert.equal(typeof page.page, "number");
        assert.equal(typeof page.text, "string");
      }
    },
    60_000
  );

  test(
    "scanned-detection status is the same with the flag on or off",
    async () => {
      const buf = await readFile(SCANNED);

      setFlag(undefined);
      const off = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);
      setFlag("true");
      const on = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);

      assert.equal(off.extraction.status, "unsupported_scanned");
      assert.equal(on.extraction.status, off.extraction.status);
      assert.equal(off.text, on.text);
    },
    60_000
  );
});
