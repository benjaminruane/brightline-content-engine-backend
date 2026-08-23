import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  normalizeCutPunctuation,
  applyCutPunctuationNormalizeToRevision,
} from "../lib/pr9-cut-punctuation.mjs";
import { finalizeSuggestRevisionText } from "../lib/build-revision-prompt.mjs";

function spanOf(parsed, index = 0) {
  const m = parsed.markers[index];
  return parsed.revisedDraft.slice(m.start, m.end);
}

describe("normalizeCutPunctuation rules", () => {
  test("drops a comma, semicolon or colon immediately before terminal punctuation", () => {
    assert.equal(
      normalizeCutPunctuation(
        "The fund intends to build a portfolio of 10-14 control-oriented investments,."
      ).text,
      "The fund intends to build a portfolio of 10-14 control-oriented investments."
    );
    assert.equal(normalizeCutPunctuation("Ready;.").text, "Ready.");
    assert.equal(normalizeCutPunctuation("Note:.").text, "Note.");
    assert.equal(normalizeCutPunctuation("Ready,?").text, "Ready?");
    assert.equal(normalizeCutPunctuation("Ready,!").text, "Ready!");
  });

  test("collapses doubled punctuation but leaves an ellipsis alone", () => {
    assert.equal(normalizeCutPunctuation("Wait,,").text, "Wait,");
    assert.equal(normalizeCutPunctuation("Really??").text, "Really?");
    assert.equal(normalizeCutPunctuation("Hey!!").text, "Hey!");
    assert.equal(normalizeCutPunctuation("End..").text, "End.");
    assert.equal(normalizeCutPunctuation("Then... later.").text, "Then... later.");
  });

  test("removes a space before punctuation and collapses doubled spaces", () => {
    assert.equal(normalizeCutPunctuation("investments .").text, "investments.");
    assert.equal(normalizeCutPunctuation("Ready ?").text, "Ready?");
    assert.equal(normalizeCutPunctuation("one  two   three.").text, "one two three.");
  });

  test("does not collapse newlines into a single space", () => {
    assert.equal(normalizeCutPunctuation("one\n\ntwo.").text, "one\n\ntwo.");
  });

  test("drops a dangling lowercase conjunction left before terminal punctuation", () => {
    assert.equal(normalizeCutPunctuation("Europe and.").text, "Europe.");
    assert.equal(normalizeCutPunctuation("Europe or.").text, "Europe.");
    assert.equal(normalizeCutPunctuation("Europe but.").text, "Europe.");
    assert.equal(normalizeCutPunctuation("Europe nor.").text, "Europe.");
    assert.equal(
      normalizeCutPunctuation(
        "The fund intends to build a portfolio of 10-14 control-oriented investments with."
      ).text,
      "The fund intends to build a portfolio of 10-14 control-oriented investments."
    );
  });

  test("leaves a capitalised conjunction at sentence start alone", () => {
    assert.equal(normalizeCutPunctuation("And.").text, "And.");
    assert.equal(normalizeCutPunctuation("With.").text, "With.");
  });

  test("leaves grammatically broken leftovers that punctuation cannot repair", () => {
    assert.equal(normalizeCutPunctuation("The company trades at.").text, "The company trades at.");
    assert.equal(normalizeCutPunctuation("The team now numbers.").text, "The team now numbers.");
    assert.equal(normalizeCutPunctuation("The platform expanded including.").text, "The platform expanded including.");
  });

  test("is a no-op on clean fixture-like sentences", () => {
    const clean = [
      "The platform delivered revenue growth last year and expanded into two new markets.",
      "The company serves customers across Europe.",
      "The team operates from London and New York.",
      "BVP is evaluating an investment of up to USD 7 million in Shopify.",
    ];
    for (const text of clean) {
      assert.equal(normalizeCutPunctuation(text).text, text);
    }
  });

  test("is idempotent", () => {
    const once = normalizeCutPunctuation("investments,  and .");
    const twice = normalizeCutPunctuation(once.text);
    assert.equal(twice.text, once.text);
    assert.equal(once.text, "investments.");
  });
});

describe("applyCutPunctuationNormalizeToRevision marker remap", () => {
  test("F7 comma remnant: offsets follow the deletion and snap onto the preceding word", () => {
    const draft =
      "The fund intends to build a portfolio of 10-14 control-oriented investments,.";
    const commaAt = draft.indexOf(",");
    const parsed = applyCutPunctuationNormalizeToRevision({
      revisedDraft: draft,
      markers: [
        {
          start: commaAt,
          end: commaAt + 1,
          note: "Removed the unsupported equity check size clause. Confirm before publishing.",
          intent: "CUT",
        },
      ],
    });
    assert.equal(
      parsed.revisedDraft,
      "The fund intends to build a portfolio of 10-14 control-oriented investments."
    );
    assert.equal(spanOf(parsed), "investments");
    assert.equal(parsed.revisedDraft[parsed.markers[0].end], ".");
    assert.equal(parsed.markers[0].intent, "CUT");
  });

  test("a marker that wrapped the joiner shrinks onto the surviving word", () => {
    const draft =
      "The fund intends to build a portfolio of 10-14 control-oriented investments,.";
    const start = draft.indexOf("investments");
    const end = draft.indexOf(",") + 1;
    const parsed = applyCutPunctuationNormalizeToRevision({
      revisedDraft: draft,
      markers: [{ start, end, note: "Removed the clause. Confirm before publishing.", intent: "CUT" }],
    });
    assert.equal(spanOf(parsed), "investments");
    assert.equal(parsed.revisedDraft[parsed.markers[0].end], ".");
  });
});

describe("finalizeSuggestRevisionText cut-punctuation pass", () => {
  test("F7 raw comma remnant becomes investments. with the period outside the marker", () => {
    const original =
      "The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks of EUR 80-100 million apiece.";
    const raw =
      "The fund intends to build a portfolio of 10-14 control-oriented investments,{{,||CUT: Removed the unsupported equity check size clause.}}";
    const { revisedDraft, markers } = finalizeSuggestRevisionText(raw, { originalDraft: original });
    assert.equal(
      revisedDraft,
      "The fund intends to build a portfolio of 10-14 control-oriented investments."
    );
    assert.equal(markers.length, 1);
    assert.equal(revisedDraft.slice(markers[0].start, markers[0].end), "investments");
    assert.equal(revisedDraft[markers[0].end], ".");
    assert.equal(markers[0].intent, "CUT");
  });
});
