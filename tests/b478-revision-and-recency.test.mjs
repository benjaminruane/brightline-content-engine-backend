/**
 * B478. A revision the matcher already paired is named. A sentence that names
 * the later document is kept. An older source is shown. An undated pair names
 * both documents and claims no order. A stale-source note is dropped once the
 * reason has named the revision.
 * lib/qc/reader-reason.mjs is the sentence. The screen copy is src/modules/drafting/readerReason.js.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { readerEvidenceSentence, sourceRecencyForReader } from "../lib/qc/reader-reason.mjs";
import { shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";
import { collectBackstopFigures } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { resolveSupersession, revisionSentence } from "../lib/qc/supersession.mjs";

const pass = JSON.parse(readFileSync(new URL("../scripts/diagnostic/b464/pass-1.json", import.meta.url), "utf8"));
const ORDER = /\b(later|earlier|newer|older|current|first|before|after|revised|revises|update|updated)\b/i;

function pad(id) {
  return String(id).padStart(2, "0");
}

function card(fixture, index) {
  const row = pass.cards.find((entry) => pad(entry.fixtureId) === fixture && entry.index === index);
  if (!row) throw new Error(`missing ${fixture}:${index}`);
  return row;
}

function dated(raw, iso) {
  return { date: new Date(iso), raw, cue: "Date: label" };
}

const statement = "The firm has a team of 40.";
const older = "The firm has a team of 40.";
const newer = "The firm has a team of 55.";

function teamMatches() {
  return [
    {
      sourceIndex: 0,
      sourceLabel: "alpha memo",
      classification: "confirmed",
      statementFigures: collectBackstopFigures(statement),
      sourceFigures: collectBackstopFigures(older),
    },
    {
      sourceIndex: 1,
      sourceLabel: "beta memo",
      classification: "conflicting",
      statementFigures: collectBackstopFigures(statement),
      sourceFigures: collectBackstopFigures(newer),
    },
  ];
}

function teamSources() {
  return [
    { text: older, label: "alpha memo" },
    { text: newer, label: "beta memo" },
  ];
}

function teamArgs(asOf, matches = teamMatches()) {
  return {
    statement,
    aggregateVerdict: "conflicting",
    sourceMatches: matches,
    asOfBySourceIndex: asOf,
    sources: teamSources(),
  };
}

const ordered = {
  0: dated("15 April 2025", "2025-04-15T00:00:00Z"),
  1: dated("28 May 2025", "2025-05-28T00:00:00Z"),
};

function quiet(notes) {
  return {
    statement,
    sentenceState: "nothing_raised",
    statementVerdict: { state: "nothing_raised" },
    displayVerdict: "supported_full",
    supersededSourceNotes: notes,
  };
}

describe("B478 revision and recency", () => {
  test("a revision the matcher paired is named when the regex list misses it", () => {
    const bare = teamMatches().map((row) => ({ ...row, statementFigures: [], sourceFigures: [] }));
    assert.deepEqual(resolveSupersession(teamArgs(ordered, bare)).supersededNotes, []);
    const out = resolveSupersession(teamArgs(ordered));
    assert.equal(out.verdictOverride, null);
    assert.deepEqual(out.demotedSourceIndices, []);
    assert.equal(out.supersededNotes.length, 1);
    assert.match(out.supersededNotes[0], /^The later source beta memo dated 28 May 2025 gives team of 55\./);
    assert.match(out.supersededNotes[0], /The earlier source alpha memo dated 15 April 2025 gives team of 40\./);
  });

  test("a quiet card with that revision is Conflicts with the source", () => {
    const out = resolveSupersession(teamArgs(ordered));
    const row = quiet(out.supersededNotes);
    assert.equal(shownState(row), "conflicts");
    assert.equal(shownLabel(row), "Conflicts with the source");
    assert.equal(shownTier(shownState(row)), "demands");
    assert.equal(readerEvidenceSentence(row), out.supersededNotes[0]);
  });

  test("an already raised card keeps its label", () => {
    const out = resolveSupersession(teamArgs(ordered));
    const row = {
      statement,
      sentenceState: "partial",
      statementVerdict: { state: "partial" },
      displayVerdict: "supported_partial",
      displayedEvidenceProse: "Part of the headcount is in the source.",
      supersededSourceNotes: out.supersededNotes,
    };
    assert.equal(shownState(row), "partial");
    assert.equal(shownLabel(row), "Partly in the source");
    assert.equal(shownTier(shownState(row)), "light");
  });

  test("no revision is claimed when only one source is dated", () => {
    const asOf = { 0: ordered[0], 1: null };
    assert.equal(revisionSentence(teamArgs(asOf)), "");
    const out = resolveSupersession(teamArgs(asOf));
    assert.equal(out.verdictOverride, null);
    assert.equal(out.supersededNotes.some((note) => note.startsWith("The later source ")), false);
    assert.equal(shownState(quiet(out.supersededNotes)), "nothing_raised");
  });

  test("no revision is claimed when two sources share the latest date", () => {
    const day = dated("28 May 2025", "2025-05-28T00:00:00Z");
    const asOf = { 0: day, 1: { ...day, date: new Date("2025-05-28T00:00:00Z") } };
    assert.equal(revisionSentence(teamArgs(asOf)), "");
    const out = resolveSupersession(teamArgs(asOf));
    assert.equal(out.verdictOverride, null);
    assert.equal(out.supersededNotes.some((note) => note.startsWith("The later source ")), false);
    assert.equal(shownState(quiet(out.supersededNotes)), "nothing_raised");
  });

  test("an older source is shown on a quiet card, and the card stays quiet", () => {
    const claim = "Revenue for the twelve months to 31 December 2025 was EUR 200 million.";
    const olderText = "Revenue for FY2019 was EUR 100 million.";
    const newerText = "Revenue for FY2025 was EUR 200 million.";
    const out = resolveSupersession({
      statement: claim,
      aggregateVerdict: "confirmed",
      sourceMatches: [
        {
          sourceIndex: 0,
          sourceLabel: "annual report",
          classification: "conflicting",
          statementFigures: collectBackstopFigures(claim),
          sourceFigures: collectBackstopFigures(olderText),
          periodAssessment: { statementPeriod: "FY2025", sourcePeriod: "FY2019" },
        },
        {
          sourceIndex: 2,
          sourceLabel: "fund update",
          classification: "confirmed",
          statementFigures: collectBackstopFigures(claim),
          sourceFigures: collectBackstopFigures(newerText),
          periodAssessment: { statementPeriod: "FY2025", sourcePeriod: "FY2025" },
        },
      ],
      asOfBySourceIndex: {
        0: dated("12 March 2020", "2020-03-12T00:00:00Z"),
        2: dated("30 June 2026", "2026-06-30T00:00:00Z"),
      },
      sources: [
        { text: olderText, label: "annual report" },
        { text: "", label: "unused" },
        { text: newerText, label: "fund update" },
      ],
    });
    assert.deepEqual(out.demotedSourceIndices, [0]);
    assert.equal(out.verdictOverride, "confirmed");
    assert.match(out.supersededNotes[0], /^An older source \(annual report/);
    const row = {
      statement: claim,
      sentenceState: "nothing_raised",
      statementVerdict: { state: "nothing_raised" },
      displayVerdict: "supported_full",
      supersededSourceNotes: out.supersededNotes,
    };
    assert.equal(shownState(row), "nothing_raised");
    assert.equal(shownTier(shownState(row)), "quiet");
    assert.equal(readerEvidenceSentence(row), out.supersededNotes[0]);
    assert.match(readerEvidenceSentence(row), /EUR 100 million/);
  });

  test("an undated pair names both documents and claims no order", () => {
    const out = resolveSupersession(teamArgs({ 0: null, 1: null }));
    assert.equal(out.supersededNotes.length, 1);
    const sentence = out.supersededNotes[0];
    assert.equal(sentence, "The documents differ. alpha memo gives team of 40. beta memo gives team of 55.");
    const stripped = sentence.replaceAll("alpha memo", "").replaceAll("beta memo", "");
    assert.equal(ORDER.test(stripped), false);
    const row = quiet(out.supersededNotes);
    assert.equal(shownState(row), "nothing_raised");
    assert.equal(readerEvidenceSentence(row), sentence);
    const raised = {
      statement,
      sentenceState: "conflicts",
      statementVerdict: { state: "conflicts" },
      displayVerdict: "conflict",
      displayedEvidenceProse: "The source states a different headcount.",
      supersededSourceNotes: out.supersededNotes,
    };
    assert.equal(shownLabel(raised), "Conflicts with the source");
  });

  test("a stale-source note is dropped only when the reason carries both figures", () => {
    const concern = { note: "Check the source date." };
    const named = "The initial memo stated 142 employees, but the confirmatory diligence update corrects this to 167 people.";
    const note = "The later source update dated 28 May 2025 gives 167 people. The earlier source memo dated 15 April 2025 gives 142 people.";
    assert.deepEqual(sourceRecencyForReader([concern], named, note), []);
    assert.deepEqual(
      sourceRecencyForReader([concern], "The later source beta memo dated 28 May 2025 gives team of 55. The earlier source alpha memo dated 15 April 2025 gives team of 40."),
      []
    );
    assert.deepEqual(sourceRecencyForReader([concern], "The later source beta memo dated 28 May 2025 gives team of 55.", note), [concern]);
    assert.deepEqual(
      sourceRecencyForReader([concern], "alpha memo states \"The firm has a team of 40.\"", note),
      [concern]
    );
    assert.equal(sourceRecencyForReader(card("18", 5).sourceRecencyConcerns, readerEvidenceSentence(card("18", 5)), note).length, 0);
    const arrNote = "The later source update dated 28 May 2025 gives EUR 35 million. The earlier source memo dated 15 April 2025 gives EUR 38 million.";
    assert.equal(sourceRecencyForReader(card("18", 7).sourceRecencyConcerns, readerEvidenceSentence(card("18", 7)), arrNote).length, 0);
    assert.equal(sourceRecencyForReader(card("18", 2).sourceRecencyConcerns, readerEvidenceSentence(card("18", 2))).length, 1);
    assert.equal(sourceRecencyForReader(card("18", 6).sourceRecencyConcerns, readerEvidenceSentence(card("18", 6))).length, 1);
    const assembly = readFileSync(new URL("../lib/qc/assemble-card.mjs", import.meta.url), "utf8");
    assert.match(assembly, /sourceRecencyForReader\(/);
  });
});
