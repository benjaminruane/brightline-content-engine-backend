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
  sentenceBoundsContaining,
} from "../lib/pr9-marker-honesty.mjs";
import { classifyNoteClaim, NOTE_AMBIGUOUS, NOTE_CLAIMS_NO_CHANGE } from "../lib/pr9-marker-note-claim.mjs";
import { finalizeSuggestRevisionText } from "../lib/build-revision-prompt.mjs";
import { LOUD_NOTE } from "../lib/revise-flag-register.mjs";

/**
 * Meridian original + Suggest1 revised pair from
 * scripts/diagnostic/revise/suggest-after-r10-suggest1.json (commit 25ae739).
 * Honesty event noteBefore strings are taken from payload.honestyEvents.
 */
const MERIDIAN_ORIGINAL = `In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V, a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.

We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.

It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.

The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.

Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.

Meridian Capital Partners V is a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.

The fund will hold investments for four to six years and will not deploy more than 30 per cent of commitments outside the EU.

On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.

The GP provided access to co-investments that would not otherwise have been available to us.

Halden Group expects the relationship to deepen over the life of the fund.`;

const MERIDIAN_SUGGEST1_REVISED = `In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V, a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.

We were attracted to Meridian on the strength of a track record of 2.4x realised gross MOIC and 21% gross IRR across 17 fully realised exits.

It has realised a gross MOIC of 2.4 times across 17 exits.

The team's stability, with no senior departures across the last three fund cycles.

Fund IV is currently marked at 1.9 times gross MOIC and a 24% gross IRR.

Meridian Capital Partners V is a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.

The fund will hold investments for four to six years and will not deploy more than 30% of commitments outside the EU.

On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.

The GP provided access to co-investments on a no-fee, no-carry basis across Funds III and IV.

Halden Group expects the relationship to deepen over the life of the fund.`;

/** honestyEvents[1].noteBefore from suggest-after-r10-suggest1.json */
const IRR_NOTE_BEFORE =
  "Changed 'has returned' to 'is currently marked at' to align with the source description. Confirm before publishing.";

/** honestyEvents[0].noteBefore from suggest-after-r10-suggest1.json */
const LEAD_NOTE_BEFORE =
  "Removed the specific 'lead commitment' detail and timing, which are not supported by the source, while retaining the broader point that Halden Group committed to the fund. Confirm before publishing.";

/**
 * Case C shape from Suggest1 deepen marker note, keep-language stem only.
 * The live Suggest1 note also said "as removing it would cut the author's point",
 * which classifyNoteClaim treats as AMBIGUOUS (kept + cut). Part 3 fires only on
 * pure keep-language; this fixture uses the keep stem from that marker.
 */
const DEEPEN_KEEP_NOTE =
  "Kept the expectation as a forward-looking view despite no direct source support. Confirm before publishing.";

/** Live Suggest1 deepen note (kept + cut) for the mixed-language guard. */
const DEEPEN_MIXED_NOTE =
  "Kept the expectation as a forward-looking view despite no direct source support, as removing it would cut the author's point. Confirm before publishing.";

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
  test("CHANGED on an identical span rewrites the note and flips intent to KEPT (policy change; was CHANGED at L104)", () => {
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
    // Policy change: intent formerly stayed CHANGED (old L104). Now flips to KEPT.
    assert.equal(result.markers[0].intent, MARKER_INTENT_KEPT);
    assert.equal(result.honestyEvents[0].repairedIntent, MARKER_INTENT_KEPT);
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

  test("CUT with nothing lost rewrites the note and flips intent to KEPT (cut_but_text_present)", () => {
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
    assert.equal(result.honestyEvents[0].contradiction, "cut_but_text_present");
    assert.match(result.markers[0].note, /^Left this wording as written -/);
    assert.equal(result.markers[0].intent, MARKER_INTENT_KEPT);
  });

  test("cut_but_text_present: CUT span verbatim, no neighbouring edits", () => {
    const original =
      "Halden Group expects the relationship to deepen over the life of the fund.";
    const revised = original;
    const span = original.replace(/\.$/, "");
    const result = applyMarkerHonestyCheck(original, {
      revisedDraft: revised,
      markers: [
        {
          start: 0,
          end: span.length,
          intent: MARKER_INTENT_CUT,
          note: "Removed this expectation - no supplied source backs that claim. Confirm before publishing.",
        },
      ],
    });
    assert.equal(result.honestyEvents.length, 1);
    assert.equal(result.honestyEvents[0].contradiction, "cut_but_text_present");
    assert.equal(result.markers[0].intent, MARKER_INTENT_KEPT);
    assert.equal(result.honestyEvents[0].repairedIntent, MARKER_INTENT_KEPT);
    assert.match(result.markers[0].note, /^Left this wording as written -/);
  });

  test("cut_but_text_present: CUT span verbatim after preceding sentence deleted (0559301 shape)", () => {
    const deepen =
      "Halden Group expects the relationship to deepen over the life of the fund.";
    const original = `The GP provided access to co-investments that would not otherwise have been available to us.\n\n${deepen}`;
    const revised = `The GP provided access to co-investments on a no-fee, no-carry basis across Funds III and IV.\n\n${deepen}`;
    const start = revised.indexOf(deepen);
    assert.ok(start >= 0);
    const result = applyMarkerHonestyCheck(original, {
      revisedDraft: revised,
      markers: [
        {
          start,
          end: start + deepen.length - 1,
          intent: MARKER_INTENT_CUT,
          note: "Removed this expectation statement because no supplied source supports a claim about the future depth of the relationship. Confirm before publishing.",
        },
      ],
    });
    assert.equal(result.honestyEvents.length, 1);
    assert.equal(result.honestyEvents[0].contradiction, "cut_but_text_present");
    assert.equal(result.markers[0].intent, MARKER_INTENT_KEPT);
    assert.equal(result.honestyEvents[0].repairedIntent, MARKER_INTENT_KEPT);
    // LCS window would have reported CHANGED (neighbour deletions); this must not depend on it.
    assert.match(result.markers[0].note, /^Left this wording as written/);
  });

  test("CUT with span genuinely absent: true clause-cut remnant, no cut_but_text_present", () => {
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
    assert.equal(result.markers[0].intent, MARKER_INTENT_CUT);
    assert.equal(
      result.honestyEvents.some((e) => e.contradiction === "cut_but_text_present"),
      false
    );
  });

  test("KEPT marker with span verbatim present is unchanged", () => {
    const original =
      "Halden Group expects the relationship to deepen over the life of the fund.";
    const revised = original;
    const result = applyMarkerHonestyCheck(original, {
      revisedDraft: revised,
      markers: [
        {
          start: 0,
          end: revised.length - 1,
          intent: MARKER_INTENT_KEPT,
          note: "Kept the expectation - no source backs it, so confirm. Confirm before publishing.",
        },
      ],
    });
    assert.equal(result.honestyEvents.length, 0);
    assert.equal(result.markers[0].intent, MARKER_INTENT_KEPT);
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

  test("KEPT on an unchanged sentence does not inherit a first-token edit in the next sentence (B140)", () => {
    const original =
      "This relationship enabled deep insight during the diligence phase. We recommend approval of the commitment.";
    const revised =
      "This relationship enabled deep insight during the diligence phase. Partners Group recommends approval of the commitment.";
    const span = "This relationship enabled deep insight during the diligence phase";
    const start = revised.indexOf(span);
    const end = start + span.length;
    const result = applyMarkerHonestyCheck(original, {
      revisedDraft: revised,
      markers: [
        {
          start,
          end,
          intent: MARKER_INTENT_KEPT,
          note: LOUD_NOTE,
        },
      ],
    });
    assert.equal(
      result.honestyEvents.some((e) => e.contradiction === "kept_but_differs"),
      false
    );
    assert.equal(result.honestyEvents.length, 0);
    assert.equal(result.markers[0].note, LOUD_NOTE);
    assert.equal(result.markers[0].note.startsWith("Revised this span"), false);
    assert.equal(result.markers[0].start, start);
    assert.equal(result.markers[0].end, end);
  });
});

describe("applyMarkerHonestyCheck Suggest1 evidence (eval-ablation Meridian)", () => {
  test("Case A IRR remnant: accurate note survives, intent not flipped, remnant_missed_edit", () => {
    // eval-ablation EA_E3 mark sentence; not claim-spans CS_E3; not corpus E3:S0:ic_memo.
    const span = "IRR";
    const start = MERIDIAN_SUGGEST1_REVISED.indexOf("24% gross IRR") + "24% gross ".length;
    assert.equal(MERIDIAN_SUGGEST1_REVISED.slice(start, start + span.length), span);
    const result = applyMarkerHonestyCheck(
      MERIDIAN_ORIGINAL,
      {
        revisedDraft: MERIDIAN_SUGGEST1_REVISED,
        markers: [
          {
            start,
            end: start + span.length,
            intent: MARKER_INTENT_CHANGED,
            note: IRR_NOTE_BEFORE,
          },
        ],
      },
      { traceId: "vitest-irr-remnant", log: () => {} }
    );
    assert.equal(result.honestyEvents.length, 1);
    assert.equal(result.honestyEvents[0].contradiction, "remnant_missed_edit");
    assert.equal(result.markers[0].note, IRR_NOTE_BEFORE);
    assert.equal(result.markers[0].intent, MARKER_INTENT_CHANGED);
  });

  test("Case B lead commitment: intent becomes KEPT; note and intent agree", () => {
    const span =
      "In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V, a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services";
    const start = MERIDIAN_SUGGEST1_REVISED.indexOf(span);
    assert.ok(start >= 0);
    const result = applyMarkerHonestyCheck(
      MERIDIAN_ORIGINAL,
      {
        revisedDraft: MERIDIAN_SUGGEST1_REVISED,
        markers: [
          {
            start,
            end: start + span.length,
            intent: MARKER_INTENT_CHANGED,
            note: LEAD_NOTE_BEFORE,
          },
        ],
      },
      { traceId: "vitest-lead", log: () => {} }
    );
    assert.equal(result.honestyEvents.length, 1);
    assert.equal(result.honestyEvents[0].contradiction, "changed_but_identical");
    assert.equal(result.markers[0].intent, MARKER_INTENT_KEPT);
    assert.match(result.markers[0].note, /Left this wording as written/);
    assert.equal(classifyNoteClaim(result.markers[0].note), NOTE_CLAIMS_NO_CHANGE);
  });

  test("Case C shape: pure keep note with CHANGED intent fires note_intent_mismatch", () => {
    const span =
      "Halden Group expects the relationship to deepen over the life of the fund";
    const start = MERIDIAN_SUGGEST1_REVISED.indexOf(span);
    assert.ok(start >= 0);
    assert.equal(classifyNoteClaim(DEEPEN_KEEP_NOTE), NOTE_CLAIMS_NO_CHANGE);
    const result = applyMarkerHonestyCheck(
      MERIDIAN_ORIGINAL,
      {
        revisedDraft: MERIDIAN_SUGGEST1_REVISED,
        markers: [
          {
            start,
            end: start + span.length,
            intent: MARKER_INTENT_CHANGED,
            note: DEEPEN_KEEP_NOTE,
          },
        ],
      },
      { traceId: "vitest-case-c", log: () => {} }
    );
    assert.ok(result.honestyEvents.some((e) => e.contradiction === "note_intent_mismatch"));
    assert.equal(result.markers[0].intent, MARKER_INTENT_KEPT);
    assert.equal(result.markers[0].note, DEEPEN_KEEP_NOTE);
  });

  test("mixed keep-and-change language does not fire note_intent_mismatch", () => {
    assert.equal(classifyNoteClaim(DEEPEN_MIXED_NOTE), NOTE_AMBIGUOUS);
    const span =
      "Halden Group expects the relationship to deepen over the life of the fund";
    const start = MERIDIAN_SUGGEST1_REVISED.indexOf(span);
    assert.ok(start >= 0);
    const result = applyMarkerHonestyCheck(
      MERIDIAN_ORIGINAL,
      {
        revisedDraft: MERIDIAN_SUGGEST1_REVISED,
        markers: [
          {
            start,
            end: start + span.length,
            intent: MARKER_INTENT_CHANGED,
            note: DEEPEN_MIXED_NOTE,
          },
        ],
      },
      { traceId: "vitest-mixed-guard", log: () => {} }
    );
    assert.equal(
      result.honestyEvents.filter((e) => e.contradiction === "note_intent_mismatch").length,
      0
    );
    assert.equal(result.markers[0].intent, MARKER_INTENT_CHANGED);
    assert.equal(result.markers[0].note, DEEPEN_MIXED_NOTE);
  });
});

describe("finalizeSuggestRevisionText honesty", () => {
  test("does not drop a contradictory marker; flips intent to KEPT when span unchanged", () => {
    const original = "Revenue grew 40% last year.";
    const raw =
      "{{Revenue grew 40% last year||CHANGED: Removed the 40% figure - sources do not state a rate. Confirm before publishing.}}";
    const result = finalizeSuggestRevisionText(raw, {
      originalDraft: original,
      traceId: "vitest-finalize",
    });
    assert.equal(result.markers.length, 1);
    assert.equal(result.honestyEvents.length, 1);
    assert.equal(result.revisedDraft.includes("Revenue grew 40% last year"), true);
    assert.equal(result.markers[0].intent, MARKER_INTENT_KEPT);
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

describe("notation house style, and the value guard", () => {
  // percentage_notation and currency_format are applied silently under rule
  // (f), but were not canonicalised here, so "24 per cent" -> "24%" scored as a
  // content-word change and every run generated an unreported-change marker.
  const cosmetic = [
    ["24 per cent", "24%"],
    ["24 percent", "24%"],
    ["30 per cent", "30%"],
    ["a 24 per cent gross IRR", "a 24% gross IRR"],
    ["1.9 times gross MOIC", "1.9x gross MOIC"],
    ["2.4 times", "2.4x"],
  ];
  for (const [a, b] of cosmetic) {
    test(`treats ${JSON.stringify(a)} -> ${JSON.stringify(b)} as cosmetic`, () => {
      assert.equal(isHouseStyleOnlyDifference(a, b), true);
      assert.equal(isHouseStyleOnlyDifference(b, a), true);
    });
  }

  // A CHANGE OF VALUE IS NEVER COSMETIC. Two independent comparisons enforce
  // it: the content-word key and the canonical amount list.
  const substantive = [
    ["24%", "22%"],
    ["24 per cent", "22%"],
    ["24%", "22 per cent"],
    ["1.9x", "2.4x"],
    ["1.9 times", "2.4x"],
    ["a 24% gross IRR", "a 22% gross IRR"],
    ["EUR 80 million", "EUR 60 million"],
  ];
  for (const [a, b] of substantive) {
    test(`treats ${JSON.stringify(a)} -> ${JSON.stringify(b)} as substantive`, () => {
      assert.equal(isHouseStyleOnlyDifference(a, b), false);
      assert.equal(isHouseStyleOnlyDifference(b, a), false);
    });
  }

  test("still treats a word deletion as substantive, notation or not", () => {
    assert.equal(
      isHouseStyleOnlyDifference("well-established and highly regarded", "well-established"),
      false
    );
  });

  test("keeps the currency and scale canonicalisation it already had", () => {
    assert.equal(isHouseStyleOnlyDifference("$7,000,000", "USD 7 million"), true);
    assert.equal(isHouseStyleOnlyDifference("$7,000,000", "USD 8 million"), false);
  });
});

describe("the honesty repair keeps a register clause", () => {
  const QUIET = "No supplied source speaks to this either way.";
  const LOUD = "No supplied source states this. Do not publish it without one.";

  test("rewrites the what clause but keeps the register clause and its closer", () => {
    const note = `Replaced "We recommend" with "Halden Group recommends" - house style. ${QUIET}`;
    const out = rewriteHonestyNote(note, "Revised this span");
    assert.equal(out, `Revised this span - house style. ${QUIET}`);
    assert.ok(!out.includes("Confirm before publishing"));
  });

  test("does the same for a LOUD clause", () => {
    const out = rewriteHonestyNote(`Replaced "a" with "b" - house style. ${LOUD}`, "Revised this span");
    assert.equal(out, `Revised this span - house style. ${LOUD}`);
    assert.ok(!out.includes("Confirm before publishing"));
  });

  test("still appends the canonical closer where there is no register clause", () => {
    const out = rewriteHonestyNote('Replaced "a" with "b" - house style.', "Revised this span");
    assert.match(out, /Confirm before publishing\.$/);
  });
});

describe("sentence bounds do not break on decimals or abbreviations", () => {
  const bound = (text, at = 0) => {
    const b = sentenceBoundsContaining(text, at, at + 1);
    return text.slice(b.start, b.end);
  };

  // Measured on the committed corpus: 19 of 67 sentences truncated, every one
  // of them a decimal in a figure. Investment writing is full of them.
  const wholeSentence = [
    "In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR 1.2 billion flagship fund from Meridian Capital targeting lower-mid-market buyouts.",
    "Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.",
    "It has realised a gross MOIC of 2.4 times across 17 exits.",
    "The fund holds approx. 20 investments across the region.",
    "The GP is Meridian Capital Management Ltd. of London and was founded in 2008.",
    "Target sectors are e.g. industrial technology and business services.",
    "See No. 4 in the appendix for the full schedule.",
    "The trailing off was gradual ... and then it stopped.",
    "J. Smith led the diligence on this transaction.",
    "The vehicle is Fund V. The predecessor closed in 2021.",
  ];
  for (const sentence of wholeSentence) {
    test(`bounds the whole of ${JSON.stringify(sentence.slice(0, 46))}`, () => {
      assert.equal(bound(sentence), sentence);
    });
  }

  // An abbreviation exclusion that swallows a real sentence boundary is worse
  // than the bug it fixes.
  test("still splits an abbreviation followed by a new sentence", () => {
    const text = "The GP is Meridian Capital Management Ltd. It was founded in 2008.";
    assert.equal(bound(text), "The GP is Meridian Capital Management Ltd.");
    assert.equal(bound(text, text.indexOf("It was")), "It was founded in 2008.");
  });

  test("still splits two ordinary sentences", () => {
    const text = "Alpha holds the stake. Beta sold the stake.";
    assert.equal(bound(text), "Alpha holds the stake.");
    assert.equal(bound(text, text.indexOf("Beta")), "Beta sold the stake.");
  });

  test("still splits after a figure that ends a sentence", () => {
    const text = "The fund returned 1.9x. Performance has since improved.";
    assert.equal(bound(text), "The fund returned 1.9x.");
    assert.equal(bound(text, text.indexOf("Performance")), "Performance has since improved.");
  });

  test("still honours ! and ?", () => {
    const text = "Is the figure 1.2 billion? Yes.";
    assert.equal(bound(text), "Is the figure 1.2 billion?");
  });

  test("still honours a blank line as a boundary", () => {
    const text = "First para at 1.2 billion.\n\nSecond para.";
    assert.equal(bound(text), "First para at 1.2 billion.");
  });
});
