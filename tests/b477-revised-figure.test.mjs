/**
 * B477. A figure the newest source has revised is named when the dates are ordered.
 * lib/qc/reader-reason.mjs is the sentence. The screen copy is src/modules/drafting/readerReason.js.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { readerSentences, readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { reasonFault } from "../lib/qc/partial-reason.mjs";
import { floorState, liveContradiction } from "../lib/qc/contradiction-floor.mjs";
import { evidenceFindingForExport } from "../lib/qc/export-review-data.mjs";
import { shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";
import { collectBackstopFigures } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { buildAsOfBySourceIndex, resolveSupersession } from "../lib/qc/supersession.mjs";
import { loadAllFixtures } from "../scripts/diagnostic/lib/fixtures.mjs";
import { loadPipelineSources } from "../scripts/diagnostic/lib/sources.mjs";

const pass = JSON.parse(readFileSync(new URL("../scripts/diagnostic/b464/pass-1.json", import.meta.url), "utf8"));

function pad(id) {
  return String(id).padStart(2, "0");
}

function card(fixture, index) {
  const row = pass.cards.find((entry) => pad(entry.fixtureId) === fixture && entry.index === index);
  if (!row) throw new Error(`missing ${fixture}:${index}`);
  return row;
}

function pair(statement, passage, extra = {}) {
  return {
    statementFigures: collectBackstopFigures(statement),
    sourceFigures: collectBackstopFigures(passage),
    passage,
    ...extra,
  };
}

const fixtures = await loadAllFixtures();
const fixture18 = fixtures.find((fixture) => pad(fixture.data.id) === "18");
const sources18 = await loadPipelineSources(fixture18.data.sources);
const asOf18 = buildAsOfBySourceIndex(sources18);

function noted(row, sources, asOf) {
  const matches = Array.isArray(row.matchExplanations) && row.matchExplanations.length >= 2
    ? row.matchExplanations
    : [{ sourceIndex: 0, classification: "confirmed" }, { sourceIndex: 1, classification: "conflicting" }];
  const resolved = resolveSupersession({
    statement: row.statement,
    aggregateVerdict: "conflicting",
    sourceMatches: matches,
    asOfBySourceIndex: asOf,
    sources,
  });
  return { ...row, supersededSourceNotes: resolved.supersededNotes, resolved };
}

describe("B477 revised figure", () => {
  test("a sentence that already names the later document is kept, and 18:8 is not counted twice", () => {
    const kept = [3, 4, 5];
    for (const index of kept) {
      const before = card("18", index);
      const after = noted(before, sources18, asOf18);
      const reason = readerEvidenceSentence(after);
      assert.equal(shownLabel(after), "Conflicts with the source", index);
      assert.equal(shownTier(shownState(after)), "demands", index);
      assert.equal(shownLabel(before), shownLabel(after), index);
      assert.equal(before.displayVerdict, after.displayVerdict, index);
      assert.equal(before.sentenceState, after.sentenceState, index);
      assert.equal(before.tier, after.tier, index);
      assert.equal(after.resolved.verdictOverride, null, index);
      assert.deepEqual(after.resolved.demotedSourceIndices, [], index);
      assert.equal(after.supersededSourceNotes.length, 1, index);
      assert.equal(reason, readerEvidenceSentence(before), index);
      assert.notEqual(reason, after.supersededSourceNotes[0], index);
      assert.equal(reasonFault(reason), "", index);
      assert.equal(evidenceFindingForExport(after), reason, index);
    }

    const beforeEight = card("18", 8);
    const afterEight = noted(beforeEight, sources18, asOf18);
    const eightReason = readerEvidenceSentence(afterEight);
    assert.equal(shownLabel(afterEight), "Conflicts with the source");
    assert.equal(afterEight.supersededSourceNotes.length, 1);
    assert.equal(eightReason, afterEight.supersededSourceNotes[0]);
    assert.match(eightReason, /2\.6x MOIC and 21% IRR/);
    assert.match(eightReason, /2\.8x MOIC and 23% IRR/);
    assert.equal(evidenceFindingForExport(afterEight), eightReason);

    const eight = noted(card("18", 8), sources18, asOf18);
    const floorExplanation = liveContradiction(eight).explanation;
    assert.equal(floorState(eight), "conflicts");
    assert.equal(readerEvidenceSentence(card("18", 8)), floorExplanation);
    const reason = readerEvidenceSentence(eight);
    assert.equal(readerSentences(reason).includes(floorExplanation), false);
    assert.equal(reason.includes(floorExplanation), false);
  });

  test("an older objection is still cleared when the newer source confirms the draft", () => {
    const statement = "Revenue for the twelve months to 31 December 2025 was EUR 200 million.";
    const older = "Revenue for FY2019 was EUR 100 million.";
    const newer = "Revenue for FY2025 was EUR 200 million.";
    const asOf = {
      0: { date: new Date("2020-03-12T00:00:00Z"), raw: "12 March 2020", cue: "Date: label" },
      2: { date: new Date("2026-06-30T00:00:00Z"), raw: "30 June 2026", cue: "As at [date] (header)" },
    };
    const out = resolveSupersession({
      statement,
      aggregateVerdict: "confirmed",
      sourceMatches: [
        pair(statement, older, {
          sourceIndex: 0,
          sourceLabel: "annual report",
          classification: "conflicting",
          periodAssessment: { statementPeriod: "FY2025", sourcePeriod: "FY2019" },
        }),
        pair(statement, newer, {
          sourceIndex: 2,
          sourceLabel: "fund update",
          classification: "confirmed",
          periodAssessment: { statementPeriod: "FY2025", sourcePeriod: "FY2025" },
        }),
      ],
      asOfBySourceIndex: asOf,
      sources: [
        { text: older, label: "annual report" },
        { text: "", label: "unused" },
        { text: newer, label: "fund update" },
      ],
    });
    assert.deepEqual(out.demotedSourceIndices, [0]);
    assert.equal(out.verdictOverride, "confirmed");
    assert.match(out.supersededNotes[0], /^An older source/);
    assert.equal(out.supersededNotes.some((note) => note.startsWith("The later source ")), false);
  });

  test("two sources with no established order do not replace today's reason with a revision", () => {
    const before = card("18", 3);
    const sameDate = {
      0: asOf18[1],
      1: asOf18[1],
    };
    const tied = noted(before, sources18, sameDate);
    assert.equal(tied.supersededSourceNotes.some((note) => note.startsWith("The later source ")), false);
    assert.equal(readerEvidenceSentence(tied), readerEvidenceSentence(before));
    assert.equal(String(readerEvidenceSentence(tied)).includes("later source"), false);

    const undated = noted(before, sources18, { 0: asOf18[0], 1: null });
    assert.equal(undated.supersededSourceNotes.some((note) => note.startsWith("The later source ")), false);
    assert.equal(readerEvidenceSentence(undated), readerEvidenceSentence(before));
    assert.equal(String(readerEvidenceSentence(undated)).includes("later source"), false);
  });
});
