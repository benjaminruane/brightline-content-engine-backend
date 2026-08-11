import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  buildResponseSources,
  buildExcludedSources,
  splitSourcesForResponse,
} from "../lib/response-sources.mjs";

describe("buildResponseSources", () => {
  test("preserves order and sets index === array position", () => {
    const v3Sources = [
      { id: "a", label: "A", text: "alpha", publicationState: "published_external" },
      { id: "b", label: "B", text: "beta", publicationState: "restricted" },
      { id: null, label: "C", text: "gamma", publicationState: "unknown" },
    ];
    const sources = buildResponseSources(v3Sources);
    assert.equal(sources.length, 3);
    assert.deepEqual(
      sources.map((s) => s.index),
      [0, 1, 2]
    );
    assert.equal(sources[0].label, "A");
    assert.equal(sources[1].label, "B");
    assert.equal(sources[2].label, "C");
  });

  test("exact-string contract: sources[i].text === v3Sources[i].text (no trim)", () => {
    // Trailing/leading whitespace and newlines must survive — B40 offsets index into this string.
    const raw = "  Revenue grew 12%.\n\n";
    const v3Sources = [{ id: "s1", label: "Report", text: raw, publicationState: "unknown" }];
    const sources = buildResponseSources(v3Sources);
    assert.equal(sources[0].text, raw);
    assert.equal(sources[0].text, v3Sources[0].text);
    assert.notEqual(sources[0].text, raw.trim());
  });

  test("id present passthrough; missing/empty id → null", () => {
    const sources = buildResponseSources([
      { id: "upload-9", label: "X", text: "t", publicationState: "unknown" },
      { label: "Y", text: "u", publicationState: "unknown" },
      { id: "", label: "Z", text: "v", publicationState: "unknown" },
      { id: null, label: "W", text: "w", publicationState: "unknown" },
    ]);
    assert.equal(sources[0].id, "upload-9");
    assert.equal(sources[1].id, null);
    assert.equal(sources[2].id, null);
    assert.equal(sources[3].id, null);
  });

  test("carries label and publicationState; shape is index/id/label/text/publicationState", () => {
    const sources = buildResponseSources([
      {
        id: "id-1",
        name: "file.pdf",
        label: "Annual Report",
        text: "body",
        publicationState: "restricted",
      },
    ]);
    assert.deepEqual(Object.keys(sources[0]).sort(), [
      "id",
      "index",
      "label",
      "publicationState",
      "text",
    ]);
    assert.equal(sources[0].label, "Annual Report");
    assert.equal(sources[0].publicationState, "restricted");
    assert.equal(sources[0].name, undefined);
  });

  test("empty input yields empty array", () => {
    assert.deepEqual(buildResponseSources([]), []);
    assert.deepEqual(buildResponseSources(null), []);
    assert.deepEqual(buildResponseSources(undefined), []);
  });

  test("alignment: sources[sourceRefId].text.slice(start, end) matches passage for B40-style offsets", () => {
    const text = "Prefix SUPPORTING PASSAGE suffix";
    const start = 7;
    const end = 25;
    const passage = "SUPPORTING PASSAGE";
    const sources = buildResponseSources([
      { id: "s0", label: "S0", text: "other", publicationState: "unknown" },
      { id: "s1", label: "S1", text, publicationState: "unknown" },
    ]);
    const sourceRefId = 1;
    assert.equal(sources[sourceRefId].text.slice(start, end), passage);
  });
});

describe("buildExcludedSources", () => {
  test("emits id, label, reason code only — no prose", () => {
    const excluded = buildExcludedSources([
      { id: "drop-1", label: "Empty PDF", reason: "empty_after_extraction" },
      { id: null, label: "Missing", reason: "no_text_field" },
      { id: "drop-3", label: "Failed", reason: "extraction_failed" },
    ]);
    assert.equal(excluded.length, 3);
    assert.deepEqual(excluded[0], {
      id: "drop-1",
      label: "Empty PDF",
      reason: "empty_after_extraction",
    });
    assert.equal(excluded[1].id, null);
    assert.equal(excluded[1].reason, "no_text_field");
    assert.equal(excluded[2].reason, "extraction_failed");
    for (const row of excluded) {
      assert.deepEqual(Object.keys(row).sort(), ["id", "label", "reason"]);
      assert.equal(typeof row.reason, "string");
      assert.ok(!row.reason.includes(" "));
    }
  });

  test("empty id → null; missing reason falls back to empty_after_extraction", () => {
    const excluded = buildExcludedSources([
      { id: "", label: "Bare", reason: "" },
      { label: "No reason" },
    ]);
    assert.equal(excluded[0].id, null);
    assert.equal(excluded[0].reason, "empty_after_extraction");
    assert.equal(excluded[1].id, null);
    assert.equal(excluded[1].reason, "empty_after_extraction");
  });

  test("empty input yields empty array", () => {
    assert.deepEqual(buildExcludedSources([]), []);
    assert.deepEqual(buildExcludedSources(null), []);
  });

  test("excluded sources never affect response sources alignment", () => {
    // Simulates: uploaded [kept, dropped, kept] → v3Sources is filter(Boolean) of kept only.
    const v3Sources = [
      { id: "keep-0", label: "First", text: "one", publicationState: "unknown" },
      { id: "keep-2", label: "Third", text: "three", publicationState: "unknown" },
    ];
    const dropped = [
      { id: "drop-1", label: "Second", reason: "empty_after_extraction" },
    ];
    const sources = buildResponseSources(v3Sources);
    const excluded = buildExcludedSources(dropped);
    assert.equal(sources.length, 2);
    assert.equal(sources[0].index, 0);
    assert.equal(sources[1].index, 1);
    assert.equal(sources[0].text, "one");
    assert.equal(sources[1].text, "three");
    assert.equal(excluded.length, 1);
    assert.equal(excluded[0].id, "drop-1");
    // Dropped must not appear in sources
    assert.ok(!sources.some((s) => s.id === "drop-1"));
  });
});

describe("splitSourcesForResponse", () => {
  test("middle empty-text source is dropped and does not misalign later sourceRefId", () => {
    const candidateSources = [
      { id: "id-A", name: "A.pdf", text: "text of A", publicationState: "published_external" },
      { id: "id-B", name: "B.pdf", text: "", publicationState: "restricted" },
      { id: "id-C", name: "C.pdf", text: "text of C", publicationState: "unknown" },
    ];
    // preparedSources mirrors route post-prepare rows (same index as candidates).
    const preparedSources = [
      { text: "text of A", label: "A", name: "A.pdf", publicationState: "published_external" },
      { text: "", label: "B", name: "B.pdf", publicationState: "restricted" },
      { text: "text of C", label: "C", name: "C.pdf", publicationState: "unknown" },
    ];

    const { kept, dropped } = splitSourcesForResponse(preparedSources, candidateSources);

    assert.equal(kept.length, 2);
    assert.equal(kept[0].id, "id-A");
    assert.equal(kept[0].text, "text of A");
    assert.equal(kept[1].id, "id-C");
    assert.equal(kept[1].text, "text of C");

    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].id, "id-B");
    assert.equal(dropped[0].label, "B");
    assert.equal(dropped[0].reason, "empty_after_extraction");

    const sources = buildResponseSources(kept);
    assert.equal(sources.length, 2);
    assert.equal(sources[0].index, 0);
    assert.equal(sources[0].id, "id-A");
    assert.equal(sources[0].text, "text of A");
    // C was upload index 2 but becomes sourceRefId / sources index 1 after the middle drop.
    assert.equal(sources[1].index, 1);
    assert.equal(sources[1].id, "id-C");
    assert.equal(sources[1].text, "text of C");
    assert.ok(!sources.some((s) => s.id === "id-B"));

    const excluded = buildExcludedSources(dropped);
    assert.deepEqual(excluded, [
      { id: "id-B", label: "B", reason: "empty_after_extraction" },
    ]);
  });

  test("unsupported_scanned with non-empty placeholder text is dropped, not kept", () => {
    const placeholder = "[Image: scan-page-1.bmp]\n[Image: scan-page-2.bmp]";
    const candidateSources = [
      { id: "id-ok", name: "real.pdf", text: "Revenue grew 12%.", publicationState: "unknown" },
      {
        id: "id-scan",
        name: "scanned.pdf",
        contentBase64: "AAAA",
        mimeType: "application/pdf",
        publicationState: "unknown",
      },
    ];
    const preparedSources = [
      {
        text: "Revenue grew 12%.",
        label: "real.pdf",
        name: "real.pdf",
        publicationState: "unknown",
        meta: { extraction: { status: "ok", warnings: [] } },
      },
      {
        text: placeholder,
        label: "scanned.pdf",
        name: "scanned.pdf",
        publicationState: "unknown",
        meta: {
          extraction: {
            status: "unsupported_scanned",
            warnings: ["unsupported_scanned"],
            meaningfulTextLength: 0,
          },
        },
      },
    ];

    const { kept, dropped } = splitSourcesForResponse(preparedSources, candidateSources);

    assert.equal(kept.length, 1);
    assert.equal(kept[0].id, "id-ok");
    assert.equal(kept[0].text, "Revenue grew 12%.");
    assert.ok(!kept.some((s) => s.id === "id-scan"));

    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].id, "id-scan");
    assert.equal(dropped[0].label, "scanned.pdf");
    assert.equal(dropped[0].reason, "unsupported_scanned");

    const sources = buildResponseSources(kept);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].index, 0);
    assert.equal(sources[0].id, "id-ok");
    assert.ok(!sources.some((s) => s.id === "id-scan"));

    const excluded = buildExcludedSources(dropped);
    assert.deepEqual(excluded, [
      { id: "id-scan", label: "scanned.pdf", reason: "unsupported_scanned" },
    ]);
  });
});
