import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  AI_PROVENANCE_MARKERS,
  scanDraftForAiProvenance,
  valueMatchesAiMarker,
} from "../lib/provenance-scan.mjs";

describe("AI_PROVENANCE_MARKERS", () => {
  test("includes required domain and bare-token markers", () => {
    const expected = [
      "chatgpt.com",
      "chat.openai.com",
      "openai.com",
      "claude.ai",
      "anthropic.com",
      "perplexity.ai",
      "gemini.google.com",
      "copilot.microsoft.com",
      "chatgpt",
      "claude",
      "perplexity",
      "gemini",
      "copilot",
    ];
    for (const m of expected) {
      assert.ok(AI_PROVENANCE_MARKERS.includes(m), `missing marker: ${m}`);
    }
  });
});

describe("valueMatchesAiMarker", () => {
  test("matches each known marker (case-insensitive)", () => {
    for (const marker of AI_PROVENANCE_MARKERS) {
      assert.equal(valueMatchesAiMarker(marker), true, marker);
      assert.equal(valueMatchesAiMarker(marker.toUpperCase()), true, marker);
    }
  });

  test("ignores ordinary utm values", () => {
    assert.equal(valueMatchesAiMarker("newsletter"), false);
    assert.equal(valueMatchesAiMarker("twitter"), false);
    assert.equal(valueMatchesAiMarker("linkedin"), false);
    assert.equal(valueMatchesAiMarker("email"), false);
  });
});

describe("scanDraftForAiProvenance", () => {
  test("empty / none → []", () => {
    assert.deepEqual(scanDraftForAiProvenance(""), []);
    assert.deepEqual(scanDraftForAiProvenance(null), []);
    assert.deepEqual(scanDraftForAiProvenance("No URLs here."), []);
    assert.deepEqual(
      scanDraftForAiProvenance("See https://example.com/page?utm_source=newsletter"),
      []
    );
  });

  test("detects each marker via utm_source", () => {
    for (const marker of AI_PROVENANCE_MARKERS) {
      const draft = `Link https://example.com/x?utm_source=${encodeURIComponent(marker)} end`;
      const hits = scanDraftForAiProvenance(draft);
      assert.equal(hits.length, 1, marker);
      assert.equal(hits[0].param, "utm_source");
      assert.equal(hits[0].value.toLowerCase(), marker.toLowerCase());
    }
  });

  test("flags utm_medium / utm_campaign / ref / source params", () => {
    const draft =
      "a https://a.com/?utm_medium=chatgpt " +
      "b https://b.com/?utm_campaign=claude.ai " +
      "c https://c.com/?ref=perplexity " +
      "d https://d.com/?source=gemini";
    const hits = scanDraftForAiProvenance(draft);
    assert.equal(hits.length, 4);
    assert.deepEqual(
      hits.map((h) => h.param).sort(),
      ["ref", "source", "utm_campaign", "utm_medium"]
    );
  });

  test("extracts param, value, and character offsets of the URL", () => {
    const prefix = "Intro text ";
    const url = "https://corp.example/report?utm_source=chatgpt.com&id=1";
    const draft = `${prefix}${url} trailing.`;
    const hits = scanDraftForAiProvenance(draft);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].url, url);
    assert.equal(hits[0].param, "utm_source");
    assert.equal(hits[0].value, "chatgpt.com");
    assert.equal(hits[0].startChar, prefix.length);
    assert.equal(hits[0].endChar, prefix.length + url.length);
    assert.equal(draft.slice(hits[0].startChar, hits[0].endChar), url);
  });

  test("handles multiple URLs in one draft", () => {
    const draft =
      "One https://a.example/?utm_source=chatgpt.com and " +
      "two https://b.example/path?ref=claude.ai done.";
    const hits = scanDraftForAiProvenance(draft);
    assert.equal(hits.length, 2);
    assert.equal(hits[0].value, "chatgpt.com");
    assert.equal(hits[1].value, "claude.ai");
    assert.ok(hits[0].startChar < hits[1].startChar);
  });

  test("ignores clean URLs and ordinary tracking values", () => {
    const draft =
      "https://brightline.example/doc " +
      "https://news.example/?utm_source=newsletter&utm_medium=email&utm_campaign=q1";
    assert.deepEqual(scanDraftForAiProvenance(draft), []);
  });
});
