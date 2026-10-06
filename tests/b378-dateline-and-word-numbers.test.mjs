import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, test } from "vitest";
import { applyDeterministicStyleFilters } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { extractSourceAsOfDate } from "../lib/qc/source-recency.mjs";
import {
  applySourceDatelineToCard,
  assessAnnouncementDateline,
} from "../lib/qc/source-dateline.mjs";
import { findCandidatePairs, tokenizeQuantities } from "../lib/revise-actions/conflict-engagement.mjs";

const GPI = "tests/fixtures/real-runs-2026-10-06-gpi";

function load(name) {
  return JSON.parse(fs.readFileSync(`${GPI}/${name}`, "utf8"));
}

function card(payload, id) {
  return payload.statements.find((row) => String(row.id) === String(id)).qcCard;
}

describe("B378 dateline reader", () => {
  test("a date plus a city in the first six lines yields the date", () => {
    const text = "Press Release\nFor Immediate Release\n13 November 2025, Singapore\nGP Industries to shift production\n";
    const hit = extractSourceAsOfDate(text);
    assert.equal(hit.raw, "13 November 2025");
    assert.equal(hit.date.toISOString().slice(0, 10), "2025-11-13");
    assert.equal(hit.cue, "standalone header date line");
  });

  test("a line of 40 characters or more is not a header date", () => {
    const line = "13 November 2025, Singapore, and further notes";
    assert.ok(line.length >= 40);
    const text = `Press Release\n${line}\nBody with no header date.\n`;
    assert.equal(extractSourceAsOfDate(text), null);
  });

  test("a date on the seventh line is not a header date", () => {
    const text = ["One", "Two", "Three", "Four", "Five", "Six", "13 November 2025, Singapore"].join("\n");
    assert.equal(extractSourceAsOfDate(text), null);
  });

  test("the GP press release as-of date is 13 November 2025", () => {
    const text = fs.readFileSync(`${GPI}/source-gpi-press-release-extracted.txt`, "utf8");
    const hit = extractSourceAsOfDate(text);
    assert.equal(hit.raw, "13 November 2025");
    assert.equal(hit.date.toISOString().slice(0, 10), "2025-11-13");
  });
});

describe("B378 announcement dateline", () => {
  test("November on the clean draft agrees and the partial card is no longer flagged", () => {
    const payload = load("clean-run2-review.json");
    const before = card(payload, 0);
    const assessment = assessAnnouncementDateline({ statement: before.statement, sources: payload.sources });
    assert.equal(assessment.status, "agree");
    const after = applySourceDatelineToCard(before, payload.sources);
    assert.equal(after.displayVerdict, "supported_full");
    assert.equal(after.supportState, "supported");
    assert.equal(after.hasConflict, false);
    assert.equal(after.summaryClass.evidence, "confirmed");
    assert.doesNotMatch(after.evidenceSummary, /does not specify|not addressed|announcement date/i);
  });

  test("October on the doctored draft conflicts with the 13 November dateline", () => {
    const payload = load("doc-review.json");
    const before = card(payload, 0);
    const assessment = assessAnnouncementDateline({ statement: before.statement, sources: payload.sources });
    assert.equal(assessment.status, "conflict");
    const after = applySourceDatelineToCard(before, payload.sources);
    assert.equal(after.displayVerdict, "conflict");
    assert.equal(after.supportState, "conflicting");
    assert.equal(after.hasConflict, true);
    assert.equal(after.displayVerdictReason, "announcement_dateline");
    assert.equal(after.conflictExcerpt.passage, "13 November 2025, Singapore");
    assert.match(after.evidenceSummary, /13 November 2025, Singapore/);
    assert.match(after.evidenceSummary, /October 2025/);
  });

  test("a second source, a missing verb, or a party outside the opening stands down", () => {
    const payload = load("doc-review.json");
    const source = payload.sources[0];
    const statement = card(payload, 0).statement;
    assert.equal(
      assessAnnouncementDateline({ statement, sources: [source, { ...source, label: "other" }] }).status,
      "stand_down"
    );
    assert.equal(
      assessAnnouncementDateline({
        statement: "In November 2025, revenue at GP Industries rose.",
        sources: [source],
      }).reason,
      "no_announcing_clause"
    );
    assert.equal(
      assessAnnouncementDateline({
        statement: "In November 2025, Silver Hill Technology announced a shift.",
        sources: [source],
      }).reason,
      "subject_not_in_opening"
    );
    assert.equal(
      assessAnnouncementDateline({
        statement: "In November 2025, Singapore announced a shift.",
        sources: [source],
      }).reason,
      "subject_not_a_party"
    );
  });
});

describe("B378 thousands separator gate", () => {
  test("60 billion has no separator character, so the concern is dropped", () => {
    const payload = load("doc-review.json");
    const statement = card(payload, 4);
    const kept = applyDeterministicStyleFilters(statement.editorialConcerns, statement.statement, statement.statement);
    assert.equal(kept.length, 0);
    assert.equal(statement.statement.slice(85, 95), "60 billion");
  });

  test("a real comma thousands separator is still kept", () => {
    const statement = "Headcount reached 5,500 by year end.";
    const kept = applyDeterministicStyleFilters(
      [
        {
          concernCode: "thousand_separator",
          rule: "thousand_separator",
          note: "Replace '5,500' with '5'500'.",
          span: [{ startChar: 18, endChar: 23 }],
        },
      ],
      statement,
      statement
    );
    assert.equal(kept.length, 1);
  });
});

describe("B378 number words", () => {
  test("word numbers stay unread, because a token here can reach a verdict", () => {
    assert.deepEqual(tokenizeQuantities("three facilities"), []);
    assert.deepEqual(tokenizeQuantities("over six billion"), []);
    assert.deepEqual(tokenizeQuantities("one million outlets"), []);
    assert.deepEqual(tokenizeQuantities("one of the two plants"), []);
    const payload = load("doc-review.json");
    for (const id of ["1", "4"]) {
      const row = card(payload, id);
      for (const span of row.supportSpans || []) {
        assert.deepEqual(findCandidatePairs(row.statement, span.passage), []);
      }
    }
  });
});
