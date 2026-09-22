/**
 * B321. Direct pdfjs PDF path keeps the extractTextFromSource return shape,
 * stamps scanned on image_only.pdf, and leaves structure empty when the flag is off.
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
const SCANNED = path.join(CORPUS, "image_only.pdf");

const ENGINE = "PDF_ENGINE";
const STRUCTURE = "QC_EXTRACT_STRUCTURE";
const ENGINES = ["direct", "officeparser"];
const SCANNED_WARNINGS = ["very_low_text", "likely_scanned_pdf", "unsupported_scanned"];

function setEngine(value) {
  if (value == null) delete process.env[ENGINE];
  else process.env[ENGINE] = value;
}

function setStructure(value) {
  if (value == null) delete process.env[STRUCTURE];
  else process.env[STRUCTURE] = value;
}

afterEach(() => {
  delete process.env[ENGINE];
  delete process.env[STRUCTURE];
});

function assertReturnShape(result) {
  assert.equal(typeof result, "object");
  assert.equal(typeof result.text, "string");
  const ex = result.extraction;
  assert.equal(typeof ex, "object");
  assert.equal(typeof ex.fileType, "string");
  assert.equal(typeof ex.method, "string");
  assert.equal(typeof ex.textLength, "number");
  assert.equal(typeof ex.numLines, "number");
  assert.equal(typeof ex.hasCurrencyToken, "boolean");
  assert.equal(typeof ex.hasDigits, "boolean");
  assert.ok(Array.isArray(ex.warnings));
  assert.ok(ex.status === "ok" || ex.status === "unsupported_scanned");
  assert.equal(typeof ex.structure, "object");
  assert.ok(Array.isArray(ex.structure.pages));
  assert.ok(Array.isArray(ex.structure.slides));
  assert.ok(Array.isArray(ex.structure.sheets));
  assert.equal(typeof ex.textConvertMs, "number");
  assert.equal(typeof ex.chunkConvertMs, "number");
  assert.equal(typeof ex.scannedNearEmptyChars, "number");
  assert.equal(typeof ex.meaningfulTextLength, "number");
}

describe("B321 extract-pdf-direct", () => {
  for (const engine of ENGINES) {
    test(
      `${engine}: image_only.pdf stamps unsupported_scanned with the scanned warnings`,
      async () => {
        setEngine(engine);
        setStructure(undefined);
        const buf = await readFile(SCANNED);
        const result = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);
        assertReturnShape(result);
        assert.equal(result.extraction.status, "unsupported_scanned");
        for (const w of SCANNED_WARNINGS) {
          assert.ok(
            result.extraction.warnings.includes(w),
            `missing warning ${w}: ${JSON.stringify(result.extraction.warnings)}`
          );
        }
        assert.ok(result.extraction.meaningfulTextLength < result.extraction.scannedNearEmptyChars);
      },
      60_000
    );

    test(
      `${engine}: native text PDF returns text and status ok`,
      async () => {
        setEngine(engine);
        setStructure(undefined);
        const buf = await readFile(NATIVE);
        const result = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);
        assertReturnShape(result);
        assert.equal(result.extraction.status, "ok");
        assert.ok(result.text.length > 50);
        assert.match(result.text, /Vantor Systems/i);
      },
      60_000
    );

    test(
      `${engine}: QC_EXTRACT_STRUCTURE off returns the empty structure shape, not undefined`,
      async () => {
        setEngine(engine);
        setStructure(undefined);
        const buf = await readFile(NATIVE);
        const result = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);
        assertReturnShape(result);
        assert.deepEqual(result.extraction.structure, { pages: [], slides: [], sheets: [] });
        assert.equal(result.extraction.chunkConvertMs, 0);
      },
      60_000
    );
  }

  test(
    "direct: structure on fills pages only and leaves chunkConvertMs at 0",
    async () => {
      setEngine("direct");
      setStructure("true");
      const buf = await readFile(NATIVE);
      const result = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);
      assertReturnShape(result);
      assert.equal(result.extraction.status, "ok");
      assert.ok(result.extraction.structure.pages.length > 0);
      assert.equal(result.extraction.structure.slides.length, 0);
      assert.equal(result.extraction.structure.sheets.length, 0);
      assert.equal(result.extraction.chunkConvertMs, 0);
      assert.equal(result.extraction.method, "pdfjs-direct");
    },
    60_000
  );
});
