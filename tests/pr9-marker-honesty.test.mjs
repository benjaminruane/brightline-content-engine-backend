import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  parseMarkerIntentPayload,
  findReviewVocabularyHits,
  isHouseStyleOnlyDifference,
  rewriteHonestyNote,
  applyMarkerHonestyCheck,
  MARKER_INTENT_CHANGED,
  MARKER_INTENT_KEPT,
  MARKER_INTENT_CUT,
} from "../lib/pr9-marker-honesty.mjs";
import { finalizeSuggestRevisionText } from "../lib/build-revision-prompt.mjs";

describe("parseMarkerIntentPayload", () => {
  test("reads the three intents and strips them from the note", () => {
    assert.deepEqual(parseMarkerIntentPayload("CHANGED: Removed the 22% figure."), {
      intent: MARKER_INTENT_CHANGED,
      note: "Removed the 22% figure.",
    });
    assert.deepEqual(parseMarkerIntentPayload("kept: Kept BVP as written."), {
      intent: MARKER_INTENT_KEPT,
      note: "Kept BVP as written.",
    });
    assert.deepEqual(parseMarkerIntentPayload("CUT: Removed the 14x clause."), {
      intent: MARKER_INTENT_CUT,
      note: "Removed the 14x clause.",
    });
  });

  test("missing or unrecognised intent is null", () => {
    assert.equal(parseMarkerIntentPayload("Removed the 22% figure."), null);
    assert.equal(parseMarkerIntentPayload("MAYBE: nope"), null);
    assert.equal(parseMarkerIntentPayload(""), null);
  });
});

describe("findReviewVocabularyHits", () => {
  test("catches F7 narration", () => {
    const hits = findReviewVocabularyHits(
      "The fund intends to build a portfolio of 10-14 control-oriented investments, removing the reference to equity checks, which is not supported by sources."
    );
    assert.ok(hits.some((h) => h.id === "removing_the_reference"));
    assert.ok(hits.some((h) => h.id === "which_is_not_supported" || h.id === "not_supported_by_sources"));
  });

  test("does not fire on legitimate source-of-capital prose", () => {
    const hits = findReviewVocabularyHits(
      "The sources of capital include retained earnings and a new credit facility."
    );
    assert.deepEqual(hits, []);
  });
});

describe("isHouseStyleOnlyDifference", () => {
  test("USD 7 million vs $7,000,000 is house-style only", () => {
    assert.equal(
      isHouseStyleOnlyDifference(
        "BVP is evaluating an investment of up to $7,000,000 in Shopify",
        "BVP is evaluating an investment of up to USD 7 million in Shopify"
      ),
      true
    );
  });

  test("renaming BVP is not house-style", () => {
    assert.equal(
      isHouseStyleOnlyDifference(
        "BVP is evaluating an investment of up to $7,000,000 in Shopify",
        "The firm is evaluating an investment of up to USD 7 million in Shopify"
      ),
      false
    );
  });
});

describe("applyMarkerHonestyCheck", () => {
  test("CHANGED on an identical span is a contradiction and rewrites the first clause", () => {
    const original = "The fund invests with equity checks of EUR 80-100 million apiece.";
    const span = "with equity checks of EUR 80-100 million apiece";
    const start = original.indexOf(span);
    const logs = [];
    const result = applyMarkerHonestyCheck(
      original,
      {
        revisedDraft: original,
        markers: [
          {
            start,
            end: start + span.length,
            intent: MARKER_INTENT_CHANGED,
            note: "Removed the equity check size - sources do not mention ticket size. Confirm before publishing.",
          },
        ],
      },
      { traceId: "vitest-changed-identical", log: (line) => logs.push(line) }
    );
    assert.equal(result.honestyEvents.length, 1);
    assert.equal(result.honestyEvents[0].contradiction, "changed_but_identical");
    assert.equal(result.markers.length, 1);
    assert.match(result.markers[0].note, /^Left this wording as written -/);
    assert.match(result.markers[0].note, /sources do not mention ticket size/);
    assert.match(result.markers[0].note, /Confirm before publishing\.$/);
    assert.equal(result.markers[0].intent, MARKER_INTENT_CHANGED);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /vitest-changed-identical/);
  });

  test("CUT on a true clause-cut is not a contradiction", () => {
    const original = "The company trades at 14x EV/EBITDA and serves customers across Europe.";
    const revised = "The company serves customers across Europe.";
    const result = applyMarkerHonestyCheck(original, {
      revisedDraft: revised,
      markers: [
        {
          start: 0,
          end: revised.length - 1,
          intent: MARKER_INTENT_CUT,
          note: "Removed the unsupported 14x EV/EBITDA clause - sources do not state a multiple. Confirm before publishing.",
        },
      ],
    });
    assert.equal(result.honestyEvents.length, 0);
    assert.equal(result.markers[0].note.includes("Removed the unsupported 14x"), true);
  });

  test("CUT with nothing lost is a contradiction", () => {
    const original = "The company serves customers across Europe.";
    const revised = original;
    const result = applyMarkerHonestyCheck(original, {
      revisedDraft: revised,
      markers: [
        {
          start: 0,
          end: revised.length - 1,
          intent: MARKER_INTENT_CUT,
          note: "Removed the 14x clause - sources do not state a multiple. Confirm before publishing.",
        },
      ],
    });
    assert.equal(result.honestyEvents.length, 1);
    assert.equal(result.honestyEvents[0].contradiction, "cut_but_region_unchanged");
    assert.match(result.markers[0].note, /^Left this wording as written -/);
  });

  test("KEPT with only house-style difference is honest", () => {
    const original = "BVP is evaluating an investment of up to $7,000,000 in Shopify.";
    const revised = "BVP is evaluating an investment of up to USD 7 million in Shopify.";
    const result = applyMarkerHonestyCheck(original, {
      revisedDraft: revised,
      markers: [
        {
          start: 0,
          end: revised.length - 1,
          intent: MARKER_INTENT_KEPT,
          note: "Kept 'BVP' - the source says 'the firm', not BVP, so confirm the attribution. Confirm before publishing.",
        },
      ],
    });
    assert.equal(result.honestyEvents.length, 0);
  });

  test("KEPT with a real wording change is a contradiction", () => {
    const original = "BVP is evaluating an investment of up to $7,000,000 in Shopify.";
    const revised = "The firm is evaluating an investment of up to USD 7 million in Shopify.";
    const result = applyMarkerHonestyCheck(original, {
      revisedDraft: revised,
      markers: [
        {
          start: 0,
          end: revised.length - 1,
          intent: MARKER_INTENT_KEPT,
          note: "Kept 'BVP' - the source says 'the firm'. Confirm before publishing.",
        },
      ],
    });
    assert.equal(result.honestyEvents.length, 1);
    assert.equal(result.honestyEvents[0].contradiction, "kept_but_differs");
    assert.match(result.markers[0].note, /^Revised this span -/);
  });
});

describe("finalizeSuggestRevisionText honesty", () => {
  test("does not drop a contradictory marker", () => {
    const original = "Revenue grew 40% last year.";
    const raw = "{{Revenue grew 40% last year||CHANGED: Removed the 40% figure - sources do not state a rate. Confirm before publishing.}}";
    const result = finalizeSuggestRevisionText(raw, { originalDraft: original, traceId: "vitest-finalize" });
    assert.equal(result.markers.length, 1);
    assert.equal(result.honestyEvents.length, 1);
    assert.equal(result.revisedDraft.includes("Revenue grew 40% last year"), true);
    assert.equal(result.markers[0].intent, "CHANGED");
  });
});

describe("rewriteHonestyNote", () => {
  test("preserves the reason clause and closer", () => {
    const out = rewriteHonestyNote(
      "Removed the 22% figure - sources do not state a rate. Confirm before publishing.",
      "Left this wording as written"
    );
    assert.equal(
      out,
      "Left this wording as written - sources do not state a rate. Confirm before publishing."
    );
  });
});
