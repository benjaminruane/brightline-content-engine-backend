/**
 * B402. Facts, four editorial buckets, sentence state from both.
 * The contract is not applied unless a caller applies it.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  BUCKETS,
  FOOTNOTE,
  HEADER_BANNED,
  NOTE_BANNED_PHRASES,
  READING_NOTE_PROMPT,
  STATE_LABELS,
  STAMP,
  WELL_SOURCED_LINE,
  acceptNote,
  applyReadingContract,
  buildFacts,
  draftHeader,
  headerCopyBanned,
  noteEndorses,
  sentenceState,
  settleFacts,
} from "../lib/qc/reading-contract.mjs";

const SOURCE = ["The prior sentence.", "HICL grew in the period.", "The following sentence."].join("\n");

function fact(status, surface = "HICL") {
  return { kind: "name", surface, status };
}

describe("B402 reading contract", () => {
  test("a matched element carries the matcher line, its extract, and its neighbours", () => {
    const facts = buildFacts({
      statement: "HICL grew.",
      draft: "HICL grew.",
      sourceText: SOURCE,
      matcherLines: [{ surface: "HICL", lineId: "L2" }],
    });
    const matched = facts.find((row) => row.surface === "HICL");
    assert.ok(matched);
    assert.equal(matched.status, "matched");
    assert.equal(matched.lineId, "L2");
    assert.ok(matched.extract.includes("HICL"));
    assert.equal(matched.lineBeforeId, "L1");
    assert.equal(matched.lineAfterId, "L3");
  });

  test("a not_found element carries no line, extract, or neighbour", () => {
    const facts = buildFacts({
      statement: "HCIL grew.",
      draft: "HCIL grew.",
      sourceText: SOURCE,
    });
    const missing = facts.find((row) => row.surface === "HCIL");
    assert.ok(missing);
    assert.equal(missing.status, "not_found");
    assert.equal(missing.lineId, undefined);
    assert.equal(missing.extract, undefined);
    assert.equal(missing.lineBeforeId, undefined);
    assert.equal(missing.lineAfterId, undefined);
  });

  test("the four buckets round-trip", () => {
    const elements = [fact("matched")];
    for (const bucket of BUCKETS) {
      const accepted = acceptNote(
        { bucket, text: "The source says one thing and the statement says another.", disputedElements: [] },
        elements
      );
      assert.equal(accepted.ok, true);
      assert.equal(accepted.note.bucket, bucket);
    }
  });

  test("sentence state follows the five-step order", () => {
    const cases = [
      { facts: [fact("not_found")], note: { bucket: "conflicts", disputedElements: ["HCIL"] }, state: "not_in_source" },
      { facts: [fact("matched")], note: { bucket: "conflicts", disputedElements: [] }, state: "conflicts" },
      { facts: [fact("matched")], note: { bucket: "beyond", disputedElements: [] }, state: "beyond" },
      { facts: [fact("matched")], note: { bucket: "wording", disputedElements: [] }, state: "worth_a_look" },
      { facts: [fact("matched")], note: { bucket: "none", disputedElements: [] }, state: "nothing_to_raise" },
    ];
    for (const row of cases) {
      assert.equal(sentenceState(row.facts, row.note), row.state);
      assert.equal(STATE_LABELS[row.state] != null, true);
    }
  });

  test("a note cannot turn not_found into matched", () => {
    const settled = settleFacts([fact("not_found", "HCIL")], {
      bucket: "none",
      disputedElements: [],
    });
    assert.equal(settled[0].status, "not_found");
    const disputed = settleFacts([fact("not_found", "HCIL")], {
      bucket: "conflicts",
      disputedElements: ["HCIL"],
    });
    assert.equal(disputed[0].status, "not_found");
  });

  test("a note cannot clear matched_disputed back to matched", () => {
    const settled = settleFacts([fact("matched_disputed")], {
      bucket: "none",
      disputedElements: [],
    });
    assert.equal(settled[0].status, "matched_disputed");
    const wording = settleFacts([fact("matched_disputed")], {
      bucket: "wording",
      disputedElements: [],
    });
    assert.equal(wording[0].status, "matched_disputed");
  });

  test("a note cannot produce nothing_to_raise when an element is not_found", () => {
    const state = sentenceState([fact("not_found", "HCIL")], { bucket: "none", disputedElements: [] });
    assert.equal(state, "not_in_source");
    assert.notEqual(state, "nothing_to_raise");
  });

  test("no bucket may carry endorsing language", () => {
    const elements = [fact("matched")];
    for (const bucket of BUCKETS) {
      for (const ban of NOTE_BANNED_PHRASES) {
        const accepted = acceptNote({ bucket, text: `The note says ${ban.phrase}.`, disputedElements: [] }, elements);
        assert.equal(accepted.ok, false, ban.phrase);
        assert.equal(accepted.reason, "endorsing_language");
        assert.equal(noteEndorses(ban.phrase), true);
      }
    }
  });

  test("the prompt states both note rules", () => {
    assert.match(READING_NOTE_PROMPT, /confirmed, verified, correct, or supported/);
    assert.match(READING_NOTE_PROMPT, /does not replace the statement's word/);
    assert.match(READING_NOTE_PROMPT, /The note names that gap/);
  });

  test("a surface outside the statement is rejected and not disputed", () => {
    const accepted = acceptNote(
      { bucket: "conflicts", text: "The source says HICL.", disputedElements: ["not-an-element"] },
      [fact("matched")]
    );
    assert.equal(accepted.ok, true);
    assert.deepEqual(accepted.note.disputedElements, []);
    assert.equal(accepted.rejections[0].surface, "not-an-element");
    assert.equal(accepted.rejections[0].reason, "not_in_statement");
    const settled = settleFacts([fact("matched")], accepted.note);
    assert.equal(settled[0].status, "matched");
  });

  test("a wording note never disputes an element", () => {
    const accepted = acceptNote(
      { bucket: "wording", text: "The source puts the point differently.", disputedElements: ["HICL"] },
      [fact("matched")]
    );
    assert.equal(accepted.rejections[0].reason, "wording_never_disputes");
    const settled = settleFacts([fact("matched")], accepted.note);
    assert.equal(settled[0].status, "matched");
  });

  test("conflicts marks a listed element matched_disputed", () => {
    const settled = settleFacts([fact("matched")], {
      bucket: "conflicts",
      disputedElements: ["HICL"],
    });
    assert.equal(settled[0].status, "matched_disputed");
  });

  test("header and footnote contain none of the banned words", () => {
    const headers = [
      draftHeader([{ facts: [fact("matched"), fact("matched")], sentenceState: "nothing_to_raise" }]),
      draftHeader([{ facts: [fact("matched")], sentenceState: "beyond" }]),
      draftHeader([{ facts: [fact("matched")], sentenceState: "conflicts" }]),
      draftHeader([
        { facts: [fact("not_found", "HCIL")], sentenceState: "not_in_source" },
        { facts: [fact("matched")], sentenceState: "nothing_to_raise" },
      ]),
    ];
    assert.equal(headers[0].line, WELL_SOURCED_LINE);
    assert.equal(headers[1].line, "Figures all check out. 1 statement goes further than the source does.");
    assert.equal(headers[2].line, "Figures all check out, but 1 statement conflicts with the source.");
    assert.equal(headers[3].line, "1 fact is not in the source.");
    assert.equal(headers[3].numbers.startsWith("1 of 2 facts matched"), true);
    for (const header of headers) {
      for (const part of [header.stamp, header.numbers, header.line, header.footnote]) {
        assert.deepEqual(headerCopyBanned(part), []);
      }
      assert.equal(header.stamp, STAMP);
      assert.equal(header.footnote, FOOTNOTE);
      assert.equal(partHasPercent(header), false);
    }
    for (const ban of HEADER_BANNED) {
      assert.equal(headerCopyBanned(`This draft is ${ban.phrase}.`).includes(ban.phrase), true);
    }
  });

  test("a card the contract did not touch keeps its fields", () => {
    const untouched = {
      statement: "Leave this card alone.",
      displayVerdict: "supported_full",
      factualBadge: true,
      concernLevel: "none",
    };
    const before = structuredClone(untouched);
    const other = {
      statement: "HICL grew.",
      displayVerdict: "conflict",
      factualBadge: false,
    };
    const applied = applyReadingContract(other, {
      facts: [fact("matched")],
      note: { bucket: "none", text: "", disputedElements: [] },
      sentenceState: "nothing_to_raise",
    });
    assert.deepEqual(untouched, before);
    assert.equal(applied.displayVerdict, "conflict");
    assert.equal(applied.factualBadge, false);
    assert.equal(applied.statement, "HICL grew.");
    assert.equal(applied.sentenceState, "nothing_to_raise");
    assert.equal(applied.sentenceLabel, "Nothing to raise");
    assert.equal(other.readingFacts, undefined);
    assert.equal(other.sentenceState, undefined);
  });
});

function partHasPercent(header) {
  return [header.stamp, header.numbers, header.line, header.footnote].some((part) => String(part || "").includes("%"));
}
