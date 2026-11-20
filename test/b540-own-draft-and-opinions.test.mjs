import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { applyDeterministicStyleFilters } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { applyListCommas } from "../lib/qc/list-comma-scan.mjs";
import { applyDraftHouseStyle } from "../lib/qc/draft-house-style.mjs";
import { fitToWordCeiling } from "../lib/qc/word-ceiling.mjs";
import { stripLengthClaims } from "../lib/qc/writer-note-length.mjs";
import { isOwnViewWithoutFact } from "../lib/qc/own-view.mjs";
import { resolveIsClaim } from "../lib/qc/pipeline-v4/stage1-extract-statements.mjs";
import { shownTrace } from "../lib/qc/shown-verdict.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { replaceFirstPerson } from "../lib/qc/first-person-replace.mjs";
import { countWords } from "../lib/qc/token-estimate.mjs";

describe("B540 own draft and opinions", () => {
  test("a month and year with no day is not a date to reformat", () => {
    const statement = "Fund VI has a first close in January 2027, where the firm intends to participate.";
    const start = statement.indexOf("January 2027");
    const out = applyDeterministicStyleFilters(
      [{
        rule: "date_format",
        concernCode: "date_format",
        note: "Reformat the date.",
        span: [{ startChar: start, endChar: start + "January 2027".length }],
      }],
      statement,
      statement
    );
    assert.equal(out.length, 0);
    const bare = applyDeterministicStyleFilters(
      [{ rule: "date_format", concernCode: "date_format", note: "Reformat the date." }],
      statement,
      statement
    );
    assert.equal(bare.length, 0);
    const us = "The closing occurred on January 19, 2026.";
    const kept = applyDeterministicStyleFilters(
      [{ rule: "date_format", concernCode: "date_format", note: "Reformat the date." }],
      us,
      us
    );
    assert.equal(kept.length, 1);
  });

  test("drafting inserts the Oxford comma the review scans for", () => {
    const raw = "Aldermoor Capital focuses on the DACH region, the Benelux and the Nordics, with an emphasis on healthcare, business services and industrial technology.";
    const next = applyListCommas(raw);
    assert.equal(next.includes("the Benelux, and the Nordics"), true);
    assert.equal(next.includes("business services, and industrial"), true);
    assert.equal(applyListCommas(next), next);
    const styled = applyDraftHouseStyle("Costs were 4 percent of the fund.", { outputType: "REPORTING_COMMENTARY" });
    assert.equal(styled.includes("4%"), true);
    assert.equal(styled.includes("percent"), false);
  });

  test("a draft past the ceiling is cut back to it", () => {
    const draft = [
      "The manager invests in the mid-market and the thesis is control.",
      "The optional portfolio construction runs long and adds companies, values, and sectors that the brief marks as room permitting only.",
      "The relationship since 2015 is the history the brief asks for and this paragraph is what pushes the count over.",
    ].join("\n\n");
    const ceiling = 30;
    assert.equal(countWords(draft) > ceiling, true);
    const fitted = fitToWordCeiling(draft, ceiling);
    assert.equal(countWords(fitted) <= ceiling, true);
    assert.equal(fitted.includes("The manager invests"), true);
  });

  test("the reviewer's note does not contradict the length line", () => {
    const note = "The commentary lands the essentials. Length is within range, so there is no need to add anything.";
    const next = stripLengthClaims(note);
    assert.equal(next.includes("Length is within range"), false);
    assert.equal(next.includes("lands the essentials"), true);
    const under = stripLengthClaims("You are also well under the 100-word floor, so there is room.");
    assert.equal(under.includes("floor"), false);
  });

  test("an opinion with no checkable fact is not flagged", () => {
    const line = "We remain constructive on the remaining portfolio.";
    assert.equal(isOwnViewWithoutFact(line), true);
    assert.equal(resolveIsClaim(line, true), false);
    assert.equal(isOwnViewWithoutFact("We recommend approval of the commitment."), false);
    const card = {
      statement: line,
      displayVerdict: "supported_partial",
      readingNote: { bucket: "none", text: "The claim is supported.", refused: false },
      displayedEvidenceProse: "Part of this statement is in the source. Which part was not recorded.",
      matchExplanations: [{ classification: "partially_confirmed", writtenFor: "partially_confirmed", explanation: "Part of this statement is in the source." }],
    };
    const traced = shownTrace(card);
    assert.equal(traced.state, "nothing_raised");
    const reason = readerEvidenceSentence(card);
    const amber = traced.state === "note_withheld" && reason.includes("found it supported");
    assert.equal(amber, false);
  });

  test("first person takes the organisation's name and the verb agrees", () => {
    const replaced = replaceFirstPerson("We recommend approval of the commitment.", "Halden Group");
    assert.equal(replaced.text, "Halden Group recommends approval of the commitment.");
    assert.deepEqual(replaced.changes, [{ from: "We recommend", to: "Halden Group recommends" }]);
    assert.equal(replaceFirstPerson("We would recommend it.", "Halden Group").text, "Halden Group would recommend it.");
  });
});
