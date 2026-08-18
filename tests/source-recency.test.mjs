import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import {
  detectSourceRecency,
  extractSourceAsOfDate,
} from "../lib/qc/source-recency.mjs";

const TODAY = new Date("2026-08-18T00:00:00Z");

const STALE_SOURCE_TEXT = `INVESTMENT MEMO
Date: 15 October 2010

Company overview.
`;

const RECENT_SOURCE_TEXT = `INVESTMENT MEMO
Date: 1 March 2026

Company overview.
`;

const NO_ANCHOR_SOURCE_TEXT = `Company overview.

Later in the body the text mentions January 2010 results and a 2010 board meeting.
The appendix also cites 12 March 2009 as a content date, not a document as-of.
`;

function detect(statement, sourceText) {
  return detectSourceRecency({ statement, sourceText, today: TODAY });
}

describe("source as-of extractor", () => {
  test("returns a Date: header and ignores in-body content dates", () => {
    const hit = extractSourceAsOfDate(STALE_SOURCE_TEXT);
    assert.ok(hit);
    assert.equal(hit.raw, "15 October 2010");
    assert.equal(extractSourceAsOfDate(NO_ANCHOR_SOURCE_TEXT), null);
  });
});

describe("source-recency detector", () => {
  test("fires on a stale current-state metric", () => {
    const det = detect("The company has 24 employees.", STALE_SOURCE_TEXT);
    assert.equal(det.fire, true);
    assert.match(det.note, /15 October 2010/);
    assert.match(det.note, /old/);
  });

  test("is quiet on a dated claim", () => {
    const det = detect("The company had 24 employees in 2010.", STALE_SOURCE_TEXT);
    assert.equal(det.fire, false);
  });

  test("is quiet on a durable categorical claim", () => {
    const det = detect(
      "The company is a software platform headquartered in Ottawa.",
      STALE_SOURCE_TEXT
    );
    assert.equal(det.fire, false);
  });

  test("is quiet on a recent source", () => {
    const det = detect("The company has 24 employees.", RECENT_SOURCE_TEXT);
    assert.equal(det.fire, false);
  });

  test("is quiet when there is no confident as-of anchor", () => {
    const det = detect("The company has 24 employees.", NO_ANCHOR_SOURCE_TEXT);
    assert.equal(det.fire, false);
    assert.equal(det.asOf, null);
  });
});

describe("stage7 source-recency emit", () => {
  const statement = "The company has 24 employees.";
  const entry = {
    statementText: statement,
    startChar: 0,
    endChar: statement.length,
    sourceMatches: [{ sourceIndex: 0, classification: "confirmed", sourceLabel: "stale" }],
    verdictResult: {
      verdict: "confirmed",
      hasConflict: false,
      confirmingMatches: [{ sourceIndex: 0, sourceLabel: "stale" }],
      contributingSourceIndices: [0],
    },
    excerptResult: {
      primaryExcerpt: { passage: "24 employees", sourceLabel: "stale" },
    },
    editorialResult: {
      editorialVerdict: "clean",
      editorialConcerns: [],
      complianceVerdict: "clean",
      complianceConcerns: [],
    },
  };

  test("emits the concern without changing the evidence verdict", async () => {
    const card = await assembleCard(entry, 0, {
      pipelineRoute: "v4",
      sources: [{ text: STALE_SOURCE_TEXT, label: "stale" }],
      today: TODAY,
    });
    assert.equal(card.supportState, "supported");
    assert.equal(card.displayVerdict, "supported_full");
    assert.equal(card.concernLevel, "none");
    assert.equal(card.hasConflict, false);
    assert.equal(card.editorialVerdict, "clean");
    assert.deepEqual(card.editorialConcerns, []);
    assert.deepEqual(card.complianceConcerns, []);
    assert.equal(card.sourceRecencyConcerns.length, 1);
    assert.equal(card.sourceRecencyConcerns[0].category, "source_recency");
    assert.equal(card.sourceRecencyConcerns[0].concernCode, "source_recency");
    assert.equal(card.sourceRecencyConcerns[0].span[0].endChar, statement.length);
    assert.match(card.sourceRecencyConcerns[0].note, /15 October 2010/);
    assert.equal(card.materiality.level, "material");
  });

  test("does not emit when sources are absent (fail-safe)", async () => {
    const card = await assembleCard(entry, 0, { pipelineRoute: "v4", today: TODAY });
    assert.equal(card.supportState, "supported");
    assert.equal(card.displayVerdict, "supported_full");
    assert.deepEqual(card.sourceRecencyConcerns, []);
  });
});
