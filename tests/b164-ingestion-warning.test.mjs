/**
 * B164: wire the ingestion warning prepareUploadedSourcesForPipeline already computes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { ingestionMetaFromPrep } from "../lib/qc/ingestion-meta.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("B164 ingestion warning is surfaced", () => {
  test("prep warning becomes response meta", () => {
    const meta = ingestionMetaFromPrep({
      sourceIngestionWarning: "One or more PDF sources produced very low extracted text. Results may be incomplete.",
      totalTextLowWarning: true,
    });
    assert.equal(
      meta.sourceIngestionWarning,
      "One or more PDF sources produced very low extracted text. Results may be incomplete."
    );
    assert.equal(meta.totalTextLowWarning, true);
  });

  test("absent prep is loud and empty", () => {
    const meta = ingestionMetaFromPrep(null);
    assert.deepEqual(meta, {});
  });

  test("analyse-statements attaches ingestion meta on the main path", () => {
    const src = readFileSync(path.join(ROOT, "api/analyse-statements.js"), "utf8");
    assert.match(src, /ingestionMetaFromPrep/);
    assert.match(src, /sourceIngestionWarning/);
  });
});
