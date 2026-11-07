/**
 * B481. Two documents that differ on a quantity are named, whatever the quantity is.
 * The word list in this file is the guard. lib/qc/quantity-reading.mjs must not contain it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { readerEvidenceSentence, reasonNamesRevision } from "../lib/qc/reader-reason.mjs";
import { resolveSupersession } from "../lib/qc/supersession.mjs";
import { filterFixtures, loadAllFixtures } from "../scripts/diagnostic/lib/fixtures.mjs";
import {
  mergeFreezeDocs,
  paidPassFixtureFilter,
  refuseFrozenCountMismatch,
  refuseUnfrozenStatements,
} from "../scripts/diagnostic/lib/paid-pass.mjs";

const FORBIDDEN = [
  "GW",
  "MW",
  "MOIC",
  "IRR",
  "bps",
  "basis points",
  "people",
  "staff",
  "employees",
  "stores",
  "minutes",
  "tonnes",
  "acres",
  "companies",
];

function dated(raw, iso) {
  return { date: new Date(iso), raw, cue: "Date: label" };
}

const april = dated("15 April 2025", "2025-04-15T00:00:00Z");
const may = dated("28 May 2025", "2025-05-28T00:00:00Z");

function run(asOf, phrase0, phrase1, class0 = "confirmed", class1 = "conflicting") {
  return resolveSupersession({
    statement: phrase0,
    aggregateVerdict: "conflicting",
    sourceMatches: [
      { sourceIndex: 0, sourceLabel: "alpha memo", classification: class0, passage: phrase0 },
      { sourceIndex: 1, sourceLabel: "beta memo", classification: class1, passage: phrase1 },
    ],
    asOfBySourceIndex: asOf,
    sources: [{ label: "alpha memo" }, { label: "beta memo" }],
  });
}

const ordered = { 0: april, 1: may };

describe("B481 quantity disagreement", () => {
  test("the quantity reader names no unit", () => {
    const src = readFileSync(new URL("../lib/qc/quantity-reading.mjs", import.meta.url), "utf8");
    for (const word of FORBIDDEN) {
      const pattern = word.includes(" ")
        ? new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        : new RegExp(`\\b${word}\\b`, "i");
      assert.equal(pattern.test(src), false, word);
    }
  });

  test("each pair is quoted in the words the documents used", () => {
    const pairs = [
      ["1.2 GW", "1.4 GW"],
      ["2.8x MOIC", "2.6x MOIC"],
      ["380 property management companies", "412 property management companies"],
      ["210 staff", "240 staff"],
      ["EUR 38 million", "EUR 35 million"],
      ["23%", "21%"],
      ["36 portfolio companies", "41 portfolio companies"],
    ];
    for (const [earlier, later] of pairs) {
      const note = run(ordered, earlier, later).supersededNotes[0];
      assert.equal(
        note,
        `The later source beta memo dated 28 May 2025 gives ${later}. The earlier source alpha memo dated 15 April 2025 gives ${earlier}.`,
        earlier
      );
      assert.equal(reasonNamesRevision(note), true, earlier);
    }
  });

  test("two bare numbers produce nothing", () => {
    assert.deepEqual(run(ordered, "12", "19").supersededNotes, []);
  });

  test("several numbers under one shared word produce nothing", () => {
    const draft = "Average session length is 12 minutes, against 18 minutes and a peer median of 15 minutes.";
    const same = run(ordered, draft, draft);
    assert.deepEqual(same.supersededNotes, []);
    const different = run(ordered, draft, "Average session length is 20 minutes.");
    assert.deepEqual(different.supersededNotes, []);
  });

  test("a revision with no quotable value still says the later document disagrees", () => {
    const note = run(
      ordered,
      "The board approved the terms circulated.",
      "The board rejected the terms circulated."
    ).supersededNotes[0];
    assert.equal(
      note,
      "The later source beta memo dated 28 May 2025 disagrees. The earlier source alpha memo dated 15 April 2025 does not."
    );
    const card = {
      statement: "The board approved the terms circulated.",
      sentenceState: "nothing_raised",
      statementVerdict: { state: "nothing_raised" },
      displayVerdict: "supported_full",
      supersededSourceNotes: [note],
    };
    assert.equal(readerEvidenceSentence(card), note);
  });

  test("all four date shapes, in both directions", () => {
    const earlier = "1.2 GW";
    const later = "1.4 GW";
    const revision = (asOf, firstPhrase, secondPhrase, laterName, laterDate, earlierName, earlierDate) => {
      const note = run(asOf, firstPhrase, secondPhrase).supersededNotes[0];
      assert.equal(
        note,
        `The later source ${laterName} dated ${laterDate} gives ${later}. The earlier source ${earlierName} dated ${earlierDate} gives ${earlier}.`
      );
    };
    revision(ordered, earlier, later, "beta memo", "28 May 2025", "alpha memo", "15 April 2025");
    const reversed = run({ 0: may, 1: april }, later, earlier, "conflicting", "confirmed").supersededNotes[0];
    assert.equal(
      reversed,
      "The later source alpha memo dated 28 May 2025 gives 1.4 GW. The earlier source beta memo dated 15 April 2025 gives 1.2 GW."
    );

    const differ = (asOf) => {
      const note = run(asOf, earlier, later).supersededNotes[0];
      assert.equal(note, "The documents differ. alpha memo gives 1.2 GW. beta memo gives 1.4 GW.");
      assert.equal(/\b(later|earlier)\b/i.test(note), false);
    };
    differ({ 0: april, 1: null });
    differ({ 0: null, 1: may });
    differ({ 0: may, 1: { ...may, date: new Date("2025-05-28T00:00:00Z") } });
    differ({ 0: null, 1: null });

    const swapped = run({ 0: null, 1: null }, later, earlier).supersededNotes[0];
    assert.equal(swapped, "The documents differ. alpha memo gives 1.4 GW. beta memo gives 1.2 GW.");

    const one = resolveSupersession({
      statement: earlier,
      aggregateVerdict: "conflicting",
      sourceMatches: [{ sourceIndex: 0, sourceLabel: "alpha memo", classification: "conflicting", passage: later }],
      asOfBySourceIndex: { 0: may },
      sources: [{ label: "alpha memo" }],
    });
    assert.deepEqual(one.supersededNotes, []);
    const same = run({ 0: null, 1: null }, earlier, earlier, "confirmed", "confirmed");
    assert.deepEqual(same.supersededNotes, []);
  });
});

describe("B481 paid pass fixtures", () => {
  test("a named set is selectable and the freeze guard still refuses", () => {
    assert.deepEqual(paidPassFixtureFilter(null), { range: { from: "01", to: "20" } });
    assert.deepEqual(paidPassFixtureFilter(["22", "23"]), { ids: ["22", "23"] });
    const doc = {
      fixtures: [
        { fixtureId: "18", statements: [{ text: "One statement." }] },
      ],
    };
    assert.equal(refuseUnfrozenStatements(doc, ["18"]), 1);
    assert.throws(() => refuseUnfrozenStatements(doc, ["18", "22"]), /missing/);
    assert.throws(
      () => refuseFrozenCountMismatch({
        fixtureId: "18",
        frozenRows: [{ text: "One statement." }],
        cards: [{ statement: "One statement." }, { statement: "Two." }],
        stage1Source: "frozen",
      }),
      /loaded 2 statements/
    );
    assert.throws(
      () => refuseFrozenCountMismatch({
        fixtureId: "18",
        frozenRows: [{ text: "One statement." }],
        cards: [{ statement: "Other words." }],
        stage1Source: "frozen",
      }),
      /text differs/
    );
    assert.throws(
      () => refuseFrozenCountMismatch({
        fixtureId: "18",
        frozenRows: [{ text: "One statement." }],
        cards: [{ statement: "One statement." }],
        stage1Source: "live",
      }),
      /stage1.source/
    );
    assert.throws(
      () => refuseFrozenCountMismatch({ cardCount: 4, frozenCount: 5, pass: "1" }),
      /stored 4 cards, freeze is 5/
    );
    const runner = readFileSync(new URL("../scripts/diagnostic/lib/paid-pass.mjs", import.meta.url), "utf8");
    assert.match(runner, /refuseUnfrozenStatements\(statementsDoc, selectedIds\)/);
    assert.match(runner, /refuseFrozenCountMismatch\(\{/);
    const merged = mergeFreezeDocs(doc, { fixtures: [{ fixtureId: "22", statements: [{ text: "Added." }] }] });
    assert.equal(merged.fixtures.length, 2);
    assert.equal(mergeFreezeDocs(doc, { fixtures: [{ fixtureId: "18", statements: [{ text: "Ignored." }] }] }).fixtures.length, 1);
  });

  test("named ids select those fixtures and leave the default range alone", async () => {
    const fixtures = await loadAllFixtures();
    const named = filterFixtures(fixtures, paidPassFixtureFilter(["22", "24"]));
    assert.deepEqual(named.map((fixture) => String(fixture.data.id).padStart(2, "0")), ["22", "24"]);
    const range = filterFixtures(fixtures, paidPassFixtureFilter([]));
    assert.equal(range.some((fixture) => String(fixture.data.id).padStart(2, "0") === "22"), false);
    assert.equal(range.some((fixture) => String(fixture.data.id).padStart(2, "0") === "18"), true);
  });
});
