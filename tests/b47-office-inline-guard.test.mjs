import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  looksLikeOfficeZipBytes,
  looksLikeRawPdfBytes,
  prepareUploadedSourcesForPipeline,
} from "../lib/extract-text-from-source.mjs";

describe("looksLikeOfficeZipBytes", () => {
  test("true for PK zip signature", () => {
    const pk = String.fromCharCode(0x50, 0x4b, 0x03, 0x04) + "rest";
    assert.equal(looksLikeOfficeZipBytes(pk), true);
  });

  test("true when text contains [Content_Types].xml", () => {
    assert.equal(
      looksLikeOfficeZipBytes('garbage before [Content_Types].xml more'),
      true
    );
  });

  test("false for normal prose", () => {
    assert.equal(looksLikeOfficeZipBytes("Revenue grew 12% year on year."), false);
    assert.equal(looksLikeOfficeZipBytes(""), false);
    assert.equal(looksLikeOfficeZipBytes(null), false);
  });

  test("does not treat PDF header as Office zip", () => {
    assert.equal(looksLikeOfficeZipBytes("%PDF-1.4\n…"), false);
    assert.equal(looksLikeRawPdfBytes("%PDF-1.4\n…"), true);
  });
});

describe("prepareUploadedSourcesForPipeline — OFFICE_INLINE_TEXT_NOT_ALLOWED", () => {
  test("rejects inline text with PK zip signature", async () => {
    const pk = String.fromCharCode(0x50, 0x4b, 0x03, 0x04) + "[Content_Types].xml";
    const result = await prepareUploadedSourcesForPipeline([
      { id: "s1", name: "memo.docx", text: pk },
    ]);
    assert.equal(result.error?.code, "OFFICE_INLINE_TEXT_NOT_ALLOWED");
  });

  test("rejects inline text that embeds [Content_Types].xml", async () => {
    const result = await prepareUploadedSourcesForPipeline([
      {
        id: "s2",
        name: "deck.pptx",
        text: "mojibake preamble [Content_Types].xml word/document.xml",
      },
    ]);
    assert.equal(result.error?.code, "OFFICE_INLINE_TEXT_NOT_ALLOWED");
  });

  test("still accepts genuine inline prose as text", async () => {
    const prose = "Located in Ottawa, Canada. Revenue grew 12%.";
    const result = await prepareUploadedSourcesForPipeline([
      { id: "s3", name: "notes.txt", text: prose, mimeType: "text/plain" },
    ]);
    assert.equal(result.error, undefined);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].text, prose);
    assert.equal(result.sources[0].meta?.extraction?.ingestionPath, "inline_text");
  });
});
