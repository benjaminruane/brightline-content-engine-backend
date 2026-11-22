/**
 * B568. A saved extraction is reused verbatim. A PDF pasted as text is still refused.
 * No model call.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";

const TEXT = "GP Industries gross margin for batteries rose to 25% in the year.\nThe second line stays put.";

test("a saved extraction is the same string a fresh run would match against", async () => {
  const prepared = await prepareUploadedSourcesForPipeline([
    {
      id: "s1",
      name: "gp-industries.pdf",
      mimeType: "application/pdf",
      savedExtraction: true,
      text: TEXT,
      publicationState: "published_external",
      role: "facts",
      furnitureLineIndexes: [1],
    },
  ]);
  assert.equal(prepared.error, undefined);
  assert.equal(prepared.sources[0].text, TEXT);
  const start = TEXT.indexOf("gross margin");
  const end = start + "gross margin for batteries".length;
  assert.equal(prepared.sources[0].text.slice(start, end), TEXT.slice(start, end));
  assert.deepEqual(prepared.sources[0].furnitureLineIndexes, [1]);
  assert.equal(prepared.sources[0].publicationState, "published_external");
});

test("a PDF with inline text and no saved extraction is still refused", async () => {
  const prepared = await prepareUploadedSourcesForPipeline([
    {
      id: "s2",
      name: "gp-industries.pdf",
      mimeType: "application/pdf",
      text: TEXT,
    },
  ]);
  assert.equal(prepared.error?.code, "PDF_INLINE_TEXT_NOT_ALLOWED");
});

test("saved text that is raw PDF bytes is still refused", async () => {
  const prepared = await prepareUploadedSourcesForPipeline([
    {
      id: "s3",
      name: "gp-industries.pdf",
      mimeType: "application/pdf",
      savedExtraction: true,
      text: "%PDF-1.4 raw bytes",
    },
  ]);
  assert.equal(prepared.error?.code, "PDF_INLINE_TEXT_NOT_ALLOWED");
});
