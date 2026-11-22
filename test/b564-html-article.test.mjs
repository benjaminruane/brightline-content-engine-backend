/**
 * B564. The ClearPoint saved page is read as the release, not the page chrome.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { extractArticleFromHtml } from "../lib/html-article-extract.mjs";
import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";

const html = readFileSync(new URL("./fixtures/b564/clearpoint.html", import.meta.url), "utf8");

function words(text) {
  return String(text).split(/\s+/).filter(Boolean).length;
}

test("the ClearPoint page yields the release, with the figures, under 5,000 words", async () => {
  const text = extractArticleFromHtml(html);
  assert.match(text, /\$12\.1 million/);
  assert.match(text, /43%/);
  assert.match(text, /64%/);
  assert.match(text, /\$35\.6 million/);
  assert.equal(words(text) < 5000, true);
  assert.equal(text.includes("<script"), false);
  assert.equal(/cookie/i.test(text), false);

  const prepared = await prepareUploadedSourcesForPipeline([
    {
      name: "ClearPoint Neuro Reports First Quarter 2026 Results | Newswire.html",
      mimeType: "text/html",
      text: html,
      type: "file",
    },
  ]);
  assert.equal(prepared.error, undefined);
  const sent = prepared.sources[0].text;
  assert.match(sent, /\$12\.1 million/);
  assert.equal(words(sent) < 5000, true);
  assert.equal(sent.length < html.length / 2, true);
});
