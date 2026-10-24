/**
 * Two accepted substitutions on one statement are one write.
 * A refusal is a message. A stored whole-sentence write stays one per statement.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { applyDecisions } from "../lib/revise-actions/apply.mjs";
import { sourceSentenceContaining } from "../lib/qc/proposal-check.mjs";
import { decisionsAfterRecheck, statementChanges } from "../lib/qc/reading-review.mjs";

const AFFINITY =
  "Meanwhile, Affinity Water appointed a new CFO with significant sector experience and stands to benefit from the French government\u2019s recently published white paper on electricity sector reform.";
const CFO = AFFINITY.indexOf("CFO");
const FRENCH = AFFINITY.indexOf("French");
const BOTH =
  "Meanwhile, Affinity Water appointed a new CEO with significant sector experience and stands to benefit from the UK government\u2019s recently published white paper on electricity sector reform.";

const HICL = readFileSync(
  new URL("./fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt", import.meta.url),
  "utf8"
);

function entry(id, extra) {
  return {
    id,
    disposition: "ACTION",
    statementId: "0",
    statement: AFFINITY,
    ...extra,
  };
}

function accept(id) {
  return { id, choice: "accept" };
}

describe("B414 two fixes on one sentence", () => {
  test("two accepted substitutions are one write and both appear", () => {
    const result = applyDecisions({
      draft: AFFINITY,
      entries: [
        entry("cfo", {
          resultingSentence: AFFINITY.replace("CFO", "CEO"),
          substitution: { start: CFO, end: CFO + 3, replacement: "CEO" },
        }),
        entry("french", {
          resultingSentence: AFFINITY.replace("French", "UK"),
          substitution: { start: FRENCH, end: FRENCH + 6, replacement: "UK" },
        }),
      ],
      decisions: [accept("cfo"), accept("french")],
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.writtenStatementIds, ["0"]);
    assert.equal(result.notices.length, 0);
    assert.match(result.text, /appointed a new CEO/);
    assert.match(result.text, /the UK government\u2019s/);
    assert.equal(result.text, BOTH);
  });

  test("the order of acceptance does not change the result", () => {
    const entries = [
      entry("french", {
        resultingSentence: AFFINITY.replace("French", "UK"),
        substitution: { start: FRENCH, end: FRENCH + 6, replacement: "UK" },
      }),
      entry("cfo", {
        resultingSentence: AFFINITY.replace("CFO", "CEO"),
        substitution: { start: CFO, end: CFO + 3, replacement: "CEO" },
      }),
    ];
    const forward = applyDecisions({
      draft: AFFINITY,
      entries,
      decisions: [accept("cfo"), accept("french")],
    });
    const reverse = applyDecisions({
      draft: AFFINITY,
      entries,
      decisions: [accept("french"), accept("cfo")],
    });
    assert.equal(forward.text, reverse.text);
    assert.equal(forward.text, BOTH);
  });

  test("two overlapping substitutions produce no write and a message", () => {
    const result = applyDecisions({
      draft: AFFINITY,
      entries: [
        entry("cfo", {
          resultingSentence: AFFINITY.replace("CFO", "CEO"),
          substitution: { start: CFO, end: CFO + 3, replacement: "CEO" },
        }),
        entry("overlap", {
          resultingSentence: AFFINITY,
          substitution: { start: CFO + 1, end: CFO + 3, replacement: "EO" },
        }),
      ],
      decisions: [accept("cfo"), accept("overlap")],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, AFFINITY);
    assert.deepEqual(result.writtenStatementIds, []);
    assert.equal(result.notices.length, 1);
    assert.equal(result.notices[0].kind, "overlap");
    assert.equal(result.notices[0].message, "CFO to CEO and FO to EO overlap. Only one can be taken.");
  });

  test("an accepted Modify wins and the proposal is reported", () => {
    const edited = "Meanwhile, Affinity Water appointed a new CEO.";
    const result = applyDecisions({
      draft: AFFINITY,
      entries: [
        entry("cfo", {
          resultingSentence: AFFINITY.replace("CFO", "CEO"),
          substitution: { start: CFO, end: CFO + 3, replacement: "CEO" },
        }),
        entry("edit", { resultingSentence: AFFINITY }),
      ],
      decisions: [accept("cfo"), { id: "edit", choice: "modify", replacementText: edited }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, edited);
    assert.deepEqual(result.writtenStatementIds, ["0"]);
    assert.equal(result.notices[0].kind, "modify");
    assert.equal(result.notices[0].message, "Your edit was applied. CFO to CEO is no longer applicable.");
  });

  test("a single accepted proposal is the resulting sentence", () => {
    const sentence = AFFINITY.replace("CFO", "CEO");
    const result = applyDecisions({
      draft: AFFINITY,
      entries: [
        entry("cfo", {
          resultingSentence: sentence,
          substitution: { start: CFO, end: CFO + 3, replacement: "CEO" },
        }),
      ],
      decisions: [accept("cfo")],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, sentence);
    assert.equal(result.notices.length, 0);
  });

  test("an entry with only a resulting sentence is one write", () => {
    const sentence = AFFINITY.replace("CFO", "CEO");
    const result = applyDecisions({
      draft: AFFINITY,
      entries: [entry("cfo", { resultingSentence: sentence })],
      decisions: [accept("cfo")],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, sentence);
    assert.equal(result.notices.length, 0);
  });

  test("two whole-sentence writes on one statement still write nothing, and say so", () => {
    const result = applyDecisions({
      draft: `${AFFINITY} Other stays.`,
      entries: [
        entry("a", { resultingSentence: "First rewrite." }),
        entry("b", { resultingSentence: "Second rewrite." }),
        {
          id: "other",
          disposition: "ACTION",
          statementId: "1",
          statement: "Other stays.",
          resultingSentence: "Other changed.",
        },
      ],
      decisions: [accept("a"), accept("b"), accept("other")],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, `${AFFINITY} Other changed.`);
    assert.deepEqual(result.writtenStatementIds, ["1"]);
    assert.equal(
      result.notices[0].message,
      "First rewrite. and Second rewrite. cannot both be applied. Only one can be taken."
    );
  });

  test("a sentence that is no longer in the draft is named, and the other write still applies", () => {
    const result = applyDecisions({
      draft: "Other stays.",
      entries: [
        entry("gone", { resultingSentence: "Gone." }),
        {
          id: "other",
          disposition: "ACTION",
          statementId: "1",
          statement: "Other stays.",
          resultingSentence: "Other changed.",
        },
      ],
      decisions: [accept("gone"), accept("other")],
    });
    assert.equal(result.text, "Other changed.");
    assert.equal(
      result.notices.find((notice) => notice.statementId === "0").message,
      "This sentence is no longer in the draft, so the change was not applied."
    );
  });

  test("overlapping sentences in the draft are refused in words", () => {
    const draft = "Alpha Beta Gamma.";
    const result = applyDecisions({
      draft,
      entries: [
        {
          id: "a",
          disposition: "ACTION",
          statementId: "0",
          statement: "Alpha Beta",
          resultingSentence: "Left.",
        },
        {
          id: "b",
          disposition: "ACTION",
          statementId: "1",
          statement: "Beta Gamma.",
          resultingSentence: "Right.",
        },
      ],
      decisions: [accept("a"), accept("b")],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "Left. Gamma.");
    assert.deepEqual(result.writtenStatementIds, ["0"]);
    assert.equal(
      result.notices.find((notice) => notice.statementId === "1").message,
      "This sentence overlaps another change in the draft, so it was not applied."
    );
  });

  test("a combined write marks the statement stale and clears both decisions", () => {
    const other = "The dividend was unchanged.";
    const draft = `${AFFINITY} ${other}`;
    const entries = [
      entry("cfo", {
        resultingSentence: AFFINITY.replace("CFO", "CEO"),
        substitution: { start: CFO, end: CFO + 3, replacement: "CEO" },
      }),
      entry("french", {
        resultingSentence: AFFINITY.replace("French", "UK"),
        substitution: { start: FRENCH, end: FRENCH + 6, replacement: "UK" },
      }),
      {
        id: "other",
        disposition: "ACTION",
        statementId: "1",
        statement: other,
        resultingSentence: other,
      },
    ];
    const decisions = {
      cfo: { choice: "accept" },
      french: { choice: "accept" },
      other: { choice: "unset" },
    };
    const applied = applyDecisions({
      draft,
      entries,
      decisions: [accept("cfo"), accept("french")],
    });
    const changes = statementChanges(
      [
        { index: 0, text: AFFINITY },
        { index: 1, text: other },
      ],
      applied.text
    );
    assert.deepEqual(changes.changes.map((change) => change.index), [0]);
    const after = decisionsAfterRecheck(decisions, entries, changes.changes.map((change) => change.index));
    assert.deepEqual(after.cleared.sort(), ["cfo", "french"]);
    assert.deepEqual(Object.keys(after.kept), ["other"]);
  });

  test("the HICL name passage is the title alone", () => {
    const passage = sourceSentenceContaining(HICL, "HICL Infrastructure PLC", "HICL Infrastructure PLC");
    assert.equal(passage, "HICL Infrastructure PLC");
    assert.equal(passage.includes("04 March 2026"), false);
  });
});
