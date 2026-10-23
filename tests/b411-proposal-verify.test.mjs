import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { acceptNote, READING_NOTE_PROMPT } from "../lib/qc/reading-contract.mjs";
import { PROPOSAL_PROMPT, proposeDraft } from "../lib/qc/reading-review.mjs";
import { runActionList } from "../lib/revise-actions/run.mjs";
import {
  namedReplacement,
  proposalQuotesSamePassage,
  proposalsEnabled,
  replacementInSource,
  statementAfterSubstitution,
  verifiedProposalEntries,
} from "../lib/qc/proposal-check.mjs";

const SOURCE = "Affinity Water appointed Mark Garth as Chief Executive Officer. The UK government published a paper.";

describe("B411 proposal verification", () => {
  test("the flag defaults off", () => {
    assert.equal(proposalsEnabled({}), false);
    assert.equal(proposalsEnabled({ QC_PROPOSALS: "1" }), true);
  });

  test("CEO matches Chief Executive Officer by the abbreviation table", () => {
    const fact = { kind: "name", status: "not_found", surface: "CFO" };
    assert.equal(replacementInSource(fact, "CEO", SOURCE), true);
    assert.equal(replacementInSource(fact, "Chief Executive Officer", SOURCE), true);
  });

  test("a replacement of a different kind is not offered", () => {
    const fact = { kind: "name", status: "not_found", surface: "CFO" };
    assert.equal(replacementInSource(fact, "30%", "The figure was 30%."), false);
  });

  test("none and a matched fact produce no replacement", () => {
    const missing = { kind: "name", status: "not_found", surface: "HCIL" };
    const matched = { kind: "name", status: "matched", surface: "HICL" };
    const note = { replacements: [{ index: 0, text: "none" }, { index: 1, text: "HICL" }] };
    assert.equal(namedReplacement(missing, note, 0), null);
    assert.equal(namedReplacement(matched, note, 1), null);
    assert.equal(replacementInSource(missing, "none", "HICL paid a dividend."), false);
  });

  test("a missing source is loud", () => {
    assert.throws(
      () => replacementInSource({ kind: "name", status: "not_found", surface: "HCIL" }, "HICL", undefined),
      /source text is missing/
    );
  });

  test("the optional field does not refuse a note that omits it", () => {
    const accepted = acceptNote({ bucket: "none", text: "", disputedIndices: [] }, []);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.note.replacements, undefined);
    const withNone = acceptNote({
      bucket: "conflicts",
      text: "The source says HICL.",
      disputedIndices: [],
      replacements: [{ index: 0, text: "HICL" }],
    }, [{ surface: "HCIL", kind: "name" }]);
    assert.equal(withNone.ok, true);
    assert.equal(withNone.note.replacements[0].text, "HICL");
  });

  test("a proposal that quotes a different line fails", () => {
    const card = { index: 4, primaryExcerpt: "from St. Pancras" };
    assert.equal(proposalQuotesSamePassage(card, { quotedPassage: "from St. Pancras", statementId: "4" }), true);
    assert.throws(
      () => proposalQuotesSamePassage(card, { quotedPassage: "from St. Germain", statementId: "4" }),
      /different line/
    );
  });

  test("a verified entry substitutes once and quotes the card passage", () => {
    const statement = "supporting HCIL's dividend";
    const entries = verifiedProposalEntries({
      enabled: true,
      sourceText: "HICL paid the dividend.",
      statements: [{
        qcCard: {
          index: 1,
          statement,
          primaryExcerpt: "HICL paid the dividend.",
          readingNote: { replacements: [{ index: 0, text: "HICL" }] },
          readingFacts: [{ kind: "name", status: "not_found", surface: "HCIL", start: 11, end: 15 }],
        },
      }],
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].disposition, "ACTION");
    assert.equal(entries[0].resultingSentence, "supporting HICL's dividend");
    assert.equal(entries[0].quotedPassage, "HICL paid the dividend.");
    assert.equal(verifiedProposalEntries({ enabled: false, statements: [], sourceText: "HICL" }).length, 0);
  });

  test("the note prompt does not ask for a replacement", () => {
    assert.equal(READING_NOTE_PROMPT.includes("replacements"), false);
    assert.match(PROPOSAL_PROMPT, /none is a complete answer/);
  });

  test("the proposal call is separate, and the flag off makes no call", async () => {
    let calls = 0;
    const result = await proposeDraft({
      statements: ["HCIL paid a dividend."],
      draft: "HCIL paid a dividend.",
      sourceText: "HICL paid a dividend.",
      complete: async () => {
        calls += 1;
        return JSON.stringify({ replacements: [{ index: 0, text: "none" }] });
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.proposals[0].replacements[0].text, "none");
    const quiet = await proposeDraft({
      statements: ["Performance was steady."],
      draft: "Performance was steady.",
      sourceText: "Performance was steady.",
      complete: async () => {
        throw new Error("a statement with no missing fact was called");
      },
    });
    assert.equal(quiet.proposals[0].called, false);
    const off = await runActionList([], { env: {}, sourceText: "HICL paid a dividend." });
    assert.equal(off.entries.length, 0);
  });

  test("the substitution uses the fact span", () => {
    assert.equal(
      statementAfterSubstitution("in line with budgets.", { surface: "budgets", start: 13, end: 20 }, "expectations"),
      "in line with expectations."
    );
  });
});
