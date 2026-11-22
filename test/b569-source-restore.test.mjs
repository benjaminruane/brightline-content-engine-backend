/**
 * B569. A saved review keeps extracted source text.
 * Refresh and the Welcome menu both load that row.
 * No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "vitest";
import handler from "../api/review-state.js";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";

const PDF = readFileSync(new URL("../tests/extraction-corpus/files/native_clean.pdf", import.meta.url));
const PDF_BASE64 = PDF.toString("base64");
const REVIEW_ID = "b569restore01";
const OWNER = "b569ownerkey01";

function memorySql() {
  const rows = new Map();
  return {
    async query(text, params) {
      if (String(text).includes("select review_id")) {
        const row = rows.get(params[0]);
        return row ? [row] : [];
      }
      if (String(text).includes("insert into review_state")) {
        const reviewId = params[0];
        const state = JSON.parse(params[2]);
        const row = {
          review_id: reviewId,
          owner_key: params[1],
          state,
          updated_at: new Date("2026-11-22T00:00:00.000Z"),
          account_id: null,
        };
        rows.set(reviewId, row);
        return [{ review_id: reviewId, updated_at: row.updated_at }];
      }
      return [];
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

afterEach(() => {
  setSqlOverrideForTests(null);
});

test("upload, save, then refresh and the menu restore the same extracted text", async () => {
  const fresh = await prepareUploadedSourcesForPipeline([
    {
      id: "src-pdf",
      name: "native_clean.pdf",
      mimeType: "application/pdf",
      contentBase64: PDF_BASE64,
      role: "facts",
    },
  ]);
  assert.equal(fresh.error, undefined);
  const freshText = fresh.sources[0].text;
  assert.equal(freshText.trim().length > 0, true);
  const freshIndexes = fresh.sources[0].meta.extraction.furnitureLineIndexes;

  setSqlOverrideForTests(memorySql());
  const saved = createRes();
  await handler({
    method: "POST",
    headers: { "x-owner-key": OWNER },
    query: {},
    body: {
      reviewId: REVIEW_ID,
      state: {
        draftText: "A short draft.",
        sources: [
          {
            id: "src-pdf",
            name: "native_clean.pdf",
            mimeType: "application/pdf",
            contentBase64: PDF_BASE64,
            role: "facts",
            publicationState: "unknown",
          },
          {
            id: "src-old",
            name: "older-file.pdf",
            mimeType: "application/pdf",
            role: "context",
          },
        ],
      },
    },
  }, saved);
  assert.equal(saved.statusCode, 200);

  const refresh = createRes();
  const menu = createRes();
  const get = {
    method: "GET",
    headers: { "x-owner-key": OWNER },
    query: { reviewId: REVIEW_ID },
  };
  await handler(get, refresh);
  await handler(get, menu);
  assert.equal(refresh.statusCode, 200);
  assert.equal(menu.statusCode, 200);

  for (const loaded of [refresh.body.state, menu.body.state]) {
    const pdf = loaded.sources.find((source) => source.id === "src-pdf");
    const older = loaded.sources.find((source) => source.id === "src-old");
    assert.equal(pdf.savedExtraction, true);
    assert.equal(pdf.text, freshText);
    assert.equal(Object.prototype.hasOwnProperty.call(pdf, "contentBase64"), false);
    assert.deepEqual(pdf.furnitureLineIndexes, freshIndexes);
    assert.equal(older.savedExtraction, undefined);
    assert.equal(typeof older.text === "string" && older.text.trim().length > 0, false);
  }

  const restored = refresh.body.state.sources[0];
  const rerun = await prepareUploadedSourcesForPipeline([
    {
      id: restored.id,
      name: restored.name,
      mimeType: restored.mimeType,
      savedExtraction: true,
      text: restored.text,
      furnitureLineIndexes: restored.furnitureLineIndexes,
      role: restored.role,
    },
  ]);
  assert.equal(rerun.error, undefined);
  assert.equal(rerun.sources[0].text, freshText);
  const phrase = freshText.trim().slice(0, 40);
  const start = freshText.indexOf(phrase);
  assert.equal(start >= 0, true);
  assert.equal(rerun.sources[0].text.slice(start, start + phrase.length), freshText.slice(start, start + phrase.length));
  assert.equal(rerun.sources[0].text.indexOf(phrase), start);
  assert.deepEqual(rerun.sources[0].furnitureLineIndexes, freshIndexes);
});
