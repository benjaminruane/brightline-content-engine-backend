import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  tokenizeWords,
  wordDiffChangedRanges,
  markerSpanStatus,
  classifyNoteClaim,
  outcomeBucket,
  sourceIsSilent,
  matchConcernForMarker,
  classifyMarker,
  SPAN_CHANGED,
  SPAN_UNCHANGED,
  NOTE_CLAIMS_CHANGE,
  NOTE_CLAIMS_NO_CHANGE,
  NOTE_AMBIGUOUS,
  OUTCOME_CORRECT_CHANGE,
  OUTCOME_CORRECT_KEEP,
  OUTCOME_DEFECT,
  OUTCOME_WRONG_KEEP_ON_CHANGE,
  OUTCOME_AMBIGUOUS,
} from "../scripts/diagnostic/lib/pr9-marker-consistency.mjs";

describe("tokenizeWords", () => {
  test("records character offsets", () => {
    const tokens = tokenizeWords("with equity checks of EUR 80-100 million apiece");
    assert.equal(tokens[0].text, "with");
    assert.equal(tokens[0].start, 0);
    assert.equal(tokens[5].text, "80-100");
    assert.equal(
      tokens[5].start,
      "with equity checks of EUR ".length
    );
  });
});

describe("wordDiffChangedRanges / markerSpanStatus", () => {
  test("identical texts yield no changed ranges and UNCHANGED span", () => {
    const t = "with equity checks of EUR 80-100 million apiece";
    assert.deepEqual(wordDiffChangedRanges(t, t), []);
    assert.equal(markerSpanStatus(t, t, 0, t.length), SPAN_UNCHANGED);
  });

  test("production shape: marked original phrase is UNCHANGED", () => {
    const original =
      "The fund invests with equity checks of EUR 80-100 million apiece in Europe.";
    const revised = original;
    const start = original.indexOf("with equity checks");
    const end = start + "with equity checks of EUR 80-100 million apiece".length;
    assert.equal(markerSpanStatus(original, revised, start, end), SPAN_UNCHANGED);
  });

  test("replaced figure is CHANGED", () => {
    const original = "Revenue grew 40% year on year to $120m.";
    const revised = "Revenue grew approximately 18% year on year to about USD 95 million.";
    const start = revised.indexOf("approximately 18%");
    const end = revised.indexOf("million.") + "million".length;
    assert.equal(markerSpanStatus(original, revised, start, end), SPAN_CHANGED);
  });

  test("unchanged neighbour of a replacement stays UNCHANGED", () => {
    const original = "Alpha Bravo Charlie";
    const revised = "Alpha Bravo Delta";
    const start = 0;
    const end = "Alpha".length;
    assert.equal(markerSpanStatus(original, revised, start, end), SPAN_UNCHANGED);
    const deltaStart = revised.indexOf("Delta");
    assert.equal(
      markerSpanStatus(original, revised, deltaStart, deltaStart + "Delta".length),
      SPAN_CHANGED
    );
  });

  test("same word elsewhere in original does not mark this insert unchanged", () => {
    const original = "Revenue grew. Other grew later.";
    const revised = "Sales grew. Other grew later.";
    const start = 0;
    const end = "Sales".length;
    assert.equal(markerSpanStatus(original, revised, start, end), SPAN_CHANGED);
  });

  test("whitespace-only marker between aligned words is UNCHANGED", () => {
    const original = "The office also has a red kettle.";
    const revised = original;
    const start = "The office".length;
    const end = start + 1;
    assert.equal(revised.slice(start, end), " ");
    assert.equal(markerSpanStatus(original, revised, start, end), SPAN_UNCHANGED);
  });

  test("zero-length marker is UNCHANGED", () => {
    assert.equal(markerSpanStatus("abc def", "abc def", 4, 4), SPAN_UNCHANGED);
  });

  test("house-style amount rewrite is CHANGED", () => {
    const original = "up to $7,000,000 in Shopify";
    const revised = "up to USD 7 million in Shopify";
    const start = revised.indexOf("USD");
    const end = revised.indexOf(" in");
    assert.equal(markerSpanStatus(original, revised, start, end), SPAN_CHANGED);
  });
});

describe("classifyNoteClaim", () => {
  test("claims a change on listed verbs", () => {
    assert.equal(
      classifyNoteClaim(
        "Removed the specific equity check size because it is not supported by the sources, while keeping the confirmed portfolio size. Confirm before publishing."
      ),
      NOTE_CLAIMS_CHANGE
    );
    assert.equal(
      classifyNoteClaim("Changed from 40% to 18% to match the IC memo. Confirm before publishing."),
      NOTE_CLAIMS_CHANGE
    );
    assert.equal(
      classifyNoteClaim("Softened 'incredible growth' to a neutral description. Confirm before publishing."),
      NOTE_CLAIMS_CHANGE
    );
    assert.equal(
      classifyNoteClaim("Dropped the 40% figure - the sources don't back it. Confirm before publishing."),
      NOTE_CLAIMS_CHANGE
    );
  });

  test("keep-and-flag including consider cutting", () => {
    assert.equal(
      classifyNoteClaim(
        "Kept the kettle detail - review flagged it as immaterial, so consider cutting. Confirm before publishing."
      ),
      NOTE_CLAIMS_NO_CHANGE
    );
    assert.equal(
      classifyNoteClaim("Retained Jane Smith - a supporting source is already public. Confirm before publishing."),
      NOTE_CLAIMS_NO_CHANGE
    );
  });

  test("does not treat unchanged as a change verb", () => {
    assert.equal(
      classifyNoteClaim("The figure is unchanged in the draft. Confirm before publishing."),
      NOTE_AMBIGUOUS
    );
  });

  test("confirm-only and empty are claims no change", () => {
    assert.equal(classifyNoteClaim("Confirm before publishing."), NOTE_CLAIMS_NO_CHANGE);
    assert.equal(classifyNoteClaim(""), NOTE_CLAIMS_NO_CHANGE);
  });

  test("both keep and change verbs are ambiguous", () => {
    assert.equal(
      classifyNoteClaim("Kept the name but removed the title. Confirm before publishing."),
      NOTE_AMBIGUOUS
    );
  });

  test("hedged without a listed verb is ambiguous", () => {
    assert.equal(
      classifyNoteClaim("Hedged the returns claim. Confirm before publishing."),
      NOTE_AMBIGUOUS
    );
  });
});

describe("outcomeBucket", () => {
  test("cross-tab cells", () => {
    assert.equal(outcomeBucket(SPAN_CHANGED, NOTE_CLAIMS_CHANGE), OUTCOME_CORRECT_CHANGE);
    assert.equal(outcomeBucket(SPAN_UNCHANGED, NOTE_CLAIMS_NO_CHANGE), OUTCOME_CORRECT_KEEP);
    assert.equal(outcomeBucket(SPAN_UNCHANGED, NOTE_CLAIMS_CHANGE), OUTCOME_DEFECT);
    assert.equal(outcomeBucket(SPAN_CHANGED, NOTE_CLAIMS_NO_CHANGE), OUTCOME_WRONG_KEEP_ON_CHANGE);
    assert.equal(outcomeBucket(SPAN_CHANGED, NOTE_AMBIGUOUS), OUTCOME_AMBIGUOUS);
    assert.equal(outcomeBucket(SPAN_UNCHANGED, NOTE_AMBIGUOUS), OUTCOME_AMBIGUOUS);
  });
});

describe("sourceIsSilent", () => {
  test("unsupported without a digit is silent", () => {
    assert.equal(
      sourceIsSilent({ kind: "unsupported", excerpt: "The memo discusses growth in general terms." }),
      true
    );
  });

  test("unsupported with a stated figure is not silent", () => {
    assert.equal(
      sourceIsSilent({ kind: "unsupported", excerpt: "Revenue increased approximately 18% to about $95m." }),
      false
    );
  });

  test("no evidence is not silent", () => {
    assert.equal(sourceIsSilent(null), false);
  });
});

describe("matchConcernForMarker / classifyMarker", () => {
  test("matches a span that still sits in the original statement", () => {
    const concerns = [
      { statementIndex: 0, statementText: "Revenue grew 12% year on year.", evidence: null, editorial: [], compliance: [] },
      {
        statementIndex: 1,
        statementText: "The office also has a red kettle.",
        evidence: null,
        editorial: [{ kind: "deletion" }],
        compliance: [],
      },
    ];
    const hit = matchConcernForMarker("The office also has a red kettle", concerns[1].statementText, concerns);
    assert.equal(hit.statementIndex, 1);
  });

  test("end-to-end defect on byte-identical span", () => {
    const original = "The fund invests with equity checks of EUR 80-100 million apiece.";
    const revised = original;
    const start = original.indexOf("with equity checks");
    const end = start + "with equity checks of EUR 80-100 million apiece".length;
    const row = classifyMarker(
      original,
      revised,
      {
        start,
        end,
        note: "Removed the specific equity check size because it is not supported by the sources. Confirm before publishing.",
      },
      [
        {
          statementIndex: 0,
          statementText: original,
          evidence: { kind: "unsupported", excerpt: "The portfolio is described without check sizes." },
          editorial: [],
          compliance: [],
        },
      ]
    );
    assert.equal(row.spanStatus, SPAN_UNCHANGED);
    assert.equal(row.noteClaim, NOTE_CLAIMS_CHANGE);
    assert.equal(row.outcome, OUTCOME_DEFECT);
    assert.equal(row.sourceSilent, true);
    assert.equal(row.spanExactInOriginal, true);
  });
});
