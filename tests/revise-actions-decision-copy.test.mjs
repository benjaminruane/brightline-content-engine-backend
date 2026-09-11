/**
 * Pinned decision-copy templates and the hedge sweep.
 * A TEMPLATE_IDS key without a pin here is a failure.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  EXPLAIN_CODES,
  GENERIC_CONTRADICTION,
  TEMPLATE_IDS,
  fillDecisionCopy,
} from "../lib/revise-actions/decision-copy.mjs";
import { findHedgedUserCopy, findUnshippableUserCopy } from "../lib/revise-actions/user-copy.mjs";
import { NO_PROPOSAL } from "../lib/revise-actions/sort.mjs";

const PINNED = {
  generic: "A source contradicts this statement. Decide whether the sentence should match the source.",
  correction_one:
    "The source gives 412 property management companies, not the 380 in this sentence.",
  correction_multi: "The source gives 2.6x and 21%, against the 2.8x and 23% in this sentence.",
  qualifier_silent:
    "The source gives 2.6x and 21%, against the 2.8x and 23% in this sentence. It does not say whether its 21% is gross or net, so the word gross is left as written.",
  dependents:
    "The source gives EUR 35 million, not the EUR 38 million in this sentence. The EUR 95 million target and the growth it implies are built on that figure, and no source covers them, so the projection needs reworking rather than one correction.",
  self_disagreement: "The same source states 320 people elsewhere, so the figures cannot be reconciled from it.",
  year_ambiguous:
    "The source states February without a year, and this sentence states March 2025. The year has to be settled before the figure can be.",
  qualifier_clash:
    "The source gives 21% IRR against the 23% gross IRR in this sentence, and does not name the 23%. The two are not necessarily the same measure.",
};

const FILLED = {
  generic: GENERIC_CONTRADICTION,
  correction_one: fillDecisionCopy({
    code: EXPLAIN_CODES.correction,
    values: {
      pairs: [{ fromRaw: "380", toRaw: "412", measurePhrase: "property management companies" }],
    },
  }),
  correction_multi: fillDecisionCopy({
    code: EXPLAIN_CODES.correction,
    values: {
      pairs: [
        { fromRaw: "2.8x", toRaw: "2.6x" },
        { fromRaw: "23%", toRaw: "21%" },
      ],
    },
  }),
  qualifier_silent: fillDecisionCopy({
    code: EXPLAIN_CODES.qualifier_silent,
    values: {
      pairs: [
        { fromRaw: "2.8x", toRaw: "2.6x" },
        { fromRaw: "23%", toRaw: "21%" },
      ],
      silentWord: "gross",
      silentValue: "21%",
    },
  }),
  dependents: fillDecisionCopy({
    code: EXPLAIN_CODES.dependents,
    values: { fromRaw: "EUR 38 million", toRaw: "EUR 35 million", destRaw: "EUR 95 million" },
  }),
  self_disagreement: fillDecisionCopy({
    code: EXPLAIN_CODES.self_disagreement,
    values: { figure: "320 people" },
  }),
  year_ambiguous: fillDecisionCopy({
    code: EXPLAIN_CODES.year_ambiguous,
    values: { sourceMonth: "February", draftDate: "March 2025" },
  }),
  qualifier_clash: fillDecisionCopy({
    code: EXPLAIN_CODES.qualifier_clash,
    values: {
      sourcePhrase: "21% IRR",
      draftPhrase: "23% gross IRR",
      unnamedRaw: "23%",
    },
  }),
};

const HEDGE_REFUSALS = [
  "might",
  "may be",
  "could be",
  "possibly",
  "perhaps",
  "likely",
  "probably",
  "uncertain",
  "unclear",
  "unknown",
  "unspecified",
  "not sure",
  "not certain",
  "use with caution",
  "treat with caution",
  "please check",
  "please verify",
  "please confirm",
  "risk that",
  "unreliable",
  "unsafe",
  "this might be wrong",
  "may be wrong",
  "could be wrong",
  "if this is wrong",
];

function swept(text) {
  const raw = String(text ?? "");
  if (findUnshippableUserCopy(raw).length > 0) return GENERIC_CONTRADICTION;
  return raw;
}

describe("decision-copy templates", () => {
  test("every template is pinned", () => {
    assert.deepEqual([...TEMPLATE_IDS].sort(), [...Object.keys(PINNED)].sort());
    assert.deepEqual([...TEMPLATE_IDS].sort(), [...Object.keys(FILLED)].sort());
  });

  for (const id of TEMPLATE_IDS) {
    test(`${id} is byte-pinned and passes the hedge sweep`, () => {
      assert.equal(FILLED[id], PINNED[id]);
      assert.deepEqual(findHedgedUserCopy(PINNED[id]), []);
      assert.deepEqual(findUnshippableUserCopy(PINNED[id]), []);
    });
  }

  test("generic matches the shipped conflict_unaddressed string", () => {
    assert.equal(NO_PROPOSAL.conflict_unaddressed, PINNED.generic);
  });
});

describe("decision-copy hedge sweep", () => {
  for (const term of HEDGE_REFUSALS) {
    test(`refuses ${JSON.stringify(term)}`, () => {
      const hits = findHedgedUserCopy(`The source gives 21%. ${term} the figure.`);
      assert.ok(hits.length > 0, `expected a hit for ${term}`);
    });
  }

  test("a hedge hit falls back to the generic contradiction string", () => {
    const hedged = fillDecisionCopy({
      code: EXPLAIN_CODES.correction,
      values: { pairs: [{ fromRaw: "380", toRaw: "might be 412" }] },
    });
    assert.match(hedged, /might/i);
    assert.equal(swept(hedged), GENERIC_CONTRADICTION);
  });

  test("internal vocabulary remains refused", () => {
    assert.ok(findUnshippableUserCopy("in line with the rule that only first-person references may be altered").length > 0);
  });
});
