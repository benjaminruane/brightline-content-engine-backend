/**
 * B606 C4. Drop heading-only and unrelated passages; keep at least the best.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { filterRelevantPassages, isHeadingOnlyLine } from "../lib/qc/relevant-passages.mjs";
import { filterCardPassages } from "../lib/qc/b606-card-rules.mjs";

test("heading-only lines are detected", () => {
  assert.equal(
    isHeadingOnlyLine("QUARTERLY REPORT - Q2 2026 (PERIOD ENDED 30 JUNE 2026)"),
    true,
  );
  assert.equal(
    isHeadingOnlyLine("Record volumes were delivered in the quarter across the estate."),
    false,
  );
});

test("Harbourline S10 shape drops unrelated and heading lines", () => {
  const statement = "The company delivered record volumes in the quarter.";
  const pieces = [
    { text: "Record volumes were delivered in the quarter across the estate.", lineIds: ["L10"] },
    { text: "Five of the six largest UK grocers stock the brand over the holding period.", lineIds: ["L4"] },
    { text: "QUARTERLY REPORT - Q2 2026 (PERIOD ENDED 30 JUNE 2026)", lineIds: ["L34"] },
  ];
  const kept = filterRelevantPassages(pieces, statement);
  assert.equal(kept.length, 1);
  assert.match(kept[0].text, /Record volumes/);
  assert.doesNotMatch(kept.map((row) => row.text).join(" "), /Five of the six/);
  assert.doesNotMatch(kept.map((row) => row.text).join(" "), /QUARTERLY REPORT/);
});

test("always keeps at least the best passage", () => {
  const kept = filterRelevantPassages(
    [
      { text: "Completely unrelated furniture about pensions administration.", lineIds: ["L1"] },
      { text: "QUARTERLY REPORT - Q2 2026 (PERIOD ENDED 30 JUNE 2026)", lineIds: ["L2"] },
    ],
    "The company delivered record volumes in the quarter.",
  );
  assert.equal(kept.length, 1);
});

test("filterCardPassages drops unrelated and heading lines on the stamped card", () => {
  const card = {
    statement: "The company delivered record volumes in the quarter.",
    sentenceState: "nothing_raised",
    primaryExcerptParts: [
      { text: "Record volumes were delivered in the quarter across the estate." },
      { text: "Five of the six largest UK grocers stock the brand over the holding period." },
      { text: "QUARTERLY REPORT - Q2 2026 (PERIOD ENDED 30 JUNE 2026)" },
    ],
    supportSpans: [
      { passage: "Record volumes were delivered in the quarter across the estate." },
      { passage: "Five of the six largest UK grocers stock the brand over the holding period." },
      { passage: "QUARTERLY REPORT - Q2 2026 (PERIOD ENDED 30 JUNE 2026)" },
    ],
  };
  const out = filterCardPassages(card);
  const joined = [
    ...(out.primaryExcerptParts || []).map((part) => part.text || part),
    ...(out.supportSpans || []).map((span) => span.passage),
  ].join(" ");
  assert.match(joined, /Record volumes/i);
  assert.doesNotMatch(joined, /Five of the six/i);
  assert.doesNotMatch(joined, /QUARTERLY REPORT/i);
});

test("heading-only primary excerpt yields to a relevant support span", () => {
  const out = filterCardPassages({
    statement:
      "In the quarter to 30 June 2026 Harbourline reported record volumes, launched a new range of premium ready meals, and secured a listing with a sixth major UK retailer.",
    primaryExcerpt: "QUARTERLY REPORT - Q2 2026 (PERIOD ENDED 30 JUNE 2026)",
    supportSpans: [
      {
        passage:
          "In the quarter Harbourline reported record volumes and launched a new range of premium ready meals with two national grocers.",
      },
      {
        passage: "Five of the six largest UK grocers stock the brand over the holding period.",
      },
    ],
  });
  assert.match(String(out.primaryExcerpt || ""), /record volumes/i);
  assert.doesNotMatch(String(out.primaryExcerpt || ""), /QUARTERLY REPORT/i);
  assert.doesNotMatch(
    (out.supportSpans || []).map((span) => span.passage).join(" "),
    /Five of the six/i,
  );
});
