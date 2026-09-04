/**
 * Apply accepted decisions onto the analysed draft.
 * Brackenhill 2026-09-02 recorded sample must not be regenerated.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { applyDecisions } from "../lib/revise-actions/apply.mjs";
import {
  isFirstPersonActorRule,
  statementHasFirstPersonPronoun,
  textContainsAuthoringOrganisation,
} from "../lib/qc/first-person-actor.mjs";
import { collapse } from "../lib/revise-actions/verify.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SAMPLE_PATH = path.join(
  ROOT,
  "scripts/diagnostic/revise/per-finding-action-list/brackenhill-2026-09-02.json"
);
const DRAFT_PATH = path.join(
  ROOT,
  "scripts/diagnostic/revise/per-finding-action-list/brackenhill-memo-draft.txt"
);

const LICENSED_IDS = [
  "S0:editorial:currency_format:0",
  "S1:evidence:conflicting:0",
  "S2:evidence:conflicting:0",
  "S4:editorial:voice_consistency:1",
  "S6:editorial:voice_consistency:0",
  "S9:editorial:voice_consistency:0",
];

function loadSample() {
  return JSON.parse(readFileSync(SAMPLE_PATH, "utf8"));
}

function loadDraft() {
  return readFileSync(DRAFT_PATH, "utf8");
}

function isLicensedAction(entry) {
  if (entry.disposition !== "ACTION") return false;
  if (isFirstPersonActorRule(entry.rule, entry.rule) && !statementHasFirstPersonPronoun(entry.statement)) {
    return false;
  }
  if (collapse(entry.resultingSentence) === collapse(entry.statement)) return false;
  if (
    textContainsAuthoringOrganisation(entry.resultingSentence, "Halden Group") &&
    !textContainsAuthoringOrganisation(entry.statement, "Halden Group") &&
    !statementHasFirstPersonPronoun(entry.statement)
  ) {
    return false;
  }
  return true;
}

function expectedExactReplace(draft, actions) {
  const reps = actions.map((entry) => {
    const at = draft.indexOf(entry.statement);
    assert.ok(at >= 0, `statement for ${entry.id} must be an exact substring`);
    return { at, from: entry.statement, to: entry.resultingSentence };
  });
  reps.sort((a, b) => b.at - a.at);
  let out = draft;
  for (const rep of reps) {
    out = out.slice(0, rep.at) + rep.to + out.slice(rep.at + rep.from.length);
  }
  return out;
}

describe("revise-actions apply", () => {
  test("rejecting all six licensed Brackenhill actions leaves the draft byte for byte", () => {
    const draft = loadDraft();
    const sample = loadSample();
    const licensed = sample.entries.filter((e) => LICENSED_IDS.includes(e.id));
    assert.equal(licensed.length, 6);
    const result = applyDecisions({
      draft,
      entries: sample.entries,
      decisions: licensed.map((e) => ({ id: e.id, choice: "reject" })),
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, draft);
  });

  test("applying all six licensed Brackenhill actions matches exact statement replace", () => {
    const draft = loadDraft();
    const sample = loadSample();
    const licensed = sample.entries.filter((e) => LICENSED_IDS.includes(e.id));
    assert.equal(licensed.every(isLicensedAction), true);
    const expected = expectedExactReplace(draft, licensed);
    const result = applyDecisions({
      draft,
      entries: sample.entries,
      decisions: licensed.map((e) => ({ id: e.id, choice: "accept" })),
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, expected);
    assert.notEqual(result.text, draft);
  });

  test("two accepted ACTION rows on one statement apply nothing to that sentence", () => {
    const draft = "Alpha is good. Beta is bad.\n";
    const entries = [
      {
        id: "S0:editorial:marketing_language_excess:0",
        disposition: "ACTION",
        statementId: "0",
        statement: "Alpha is good.",
        resultingSentence: "Alpha is adequate.",
      },
      {
        id: "S0:editorial:voice_consistency:1",
        disposition: "ACTION",
        statementId: "0",
        statement: "Alpha is good.",
        resultingSentence: "Halden Group finds Alpha good.",
      },
      {
        id: "S1:evidence:conflicting:0",
        disposition: "ACTION",
        statementId: "1",
        statement: "Beta is bad.",
        resultingSentence: "Beta is mixed.",
      },
    ];
    const result = applyDecisions({
      draft,
      entries,
      decisions: [
        { id: entries[0].id, choice: "accept" },
        { id: entries[1].id, choice: "accept" },
        { id: entries[2].id, choice: "accept" },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "Alpha is good. Beta is mixed.\n");
  });

  test("modify writes replacementText, not the proposal", () => {
    const draft = "Alpha is good.\n";
    const result = applyDecisions({
      draft,
      entries: [
        {
          id: "S0:editorial:voice_consistency:0",
          disposition: "ACTION",
          statementId: "0",
          statement: "Alpha is good.",
          resultingSentence: "Alpha is adequate.",
        },
      ],
      decisions: [
        {
          id: "S0:editorial:voice_consistency:0",
          choice: "modify",
          replacementText: "Alpha is acceptable.",
        },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "Alpha is acceptable.\n");
  });

  test("an ACKNOWLEDGE accept does not rewrite the sentence", () => {
    const draft = "Alpha is good.\n";
    const result = applyDecisions({
      draft,
      entries: [
        {
          id: "S0:editorial:visible_signal:0",
          disposition: "ACKNOWLEDGE",
          statementId: "0",
          statement: "Alpha is good.",
          resultingSentence: "Alpha is adequate.",
        },
      ],
      decisions: [{ id: "S0:editorial:visible_signal:0", choice: "accept" }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, draft);
  });

  test("untouched decisions leave the Brackenhill draft byte for byte", () => {
    const draft = loadDraft();
    const sample = loadSample();
    const result = applyDecisions({
      draft,
      entries: sample.entries,
      decisions: sample.entries.map((e) => ({ id: e.id, choice: "unset" })),
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, draft);
  });

  test("a collision sentence applies the chosen row and leaves the other", () => {
    const draft = "Alpha is good. Beta is bad.\n";
    const entries = [
      {
        id: "S0:editorial:marketing_language_excess:0",
        disposition: "ACTION",
        statementId: "0",
        statement: "Alpha is good.",
        resultingSentence: "Alpha is adequate.",
      },
      {
        id: "S0:editorial:voice_consistency:1",
        disposition: "ACTION",
        statementId: "0",
        statement: "Alpha is good.",
        resultingSentence: "Halden Group finds Alpha good.",
      },
    ];
    const first = applyDecisions({
      draft,
      entries,
      decisions: [
        { id: entries[0].id, choice: "accept" },
        { id: entries[1].id, choice: "unset" },
      ],
    });
    assert.equal(first.ok, true);
    assert.equal(first.text, "Alpha is adequate. Beta is bad.\n");
    const second = applyDecisions({
      draft,
      entries,
      decisions: [
        { id: entries[0].id, choice: "unset" },
        { id: entries[1].id, choice: "accept" },
      ],
    });
    assert.equal(second.ok, true);
    assert.equal(second.text, "Halden Group finds Alpha good. Beta is bad.\n");
    const neither = applyDecisions({
      draft,
      entries,
      decisions: [
        { id: entries[0].id, choice: "unset" },
        { id: entries[1].id, choice: "unset" },
      ],
    });
    assert.equal(neither.ok, true);
    assert.equal(neither.text, draft);
  });

  test("a rewritten statement is skipped and the rest still apply", () => {
    const result = applyDecisions({
      draft: "Gamma is new. Beta is bad.\n",
      entries: [
        {
          id: "S0:editorial:marketing_language_excess:0",
          disposition: "ACTION",
          statementId: "0",
          statement: "Alpha is good.",
          resultingSentence: "Alpha is adequate.",
        },
        {
          id: "S1:evidence:conflicting:0",
          disposition: "ACTION",
          statementId: "1",
          statement: "Beta is bad.",
          resultingSentence: "Beta is mixed.",
        },
      ],
      decisions: [
        { id: "S0:editorial:marketing_language_excess:0", choice: "accept" },
        { id: "S1:evidence:conflicting:0", choice: "accept" },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "Gamma is new. Beta is mixed.\n");
  });

  test("an inserted paragraph does not skip later statements", () => {
    const result = applyDecisions({
      draft: "Preface.\nAlpha is good. Beta is bad.\n",
      entries: [
        {
          id: "S0:editorial:marketing_language_excess:0",
          disposition: "ACTION",
          statementId: "0",
          statement: "Alpha is good.",
          resultingSentence: "Alpha is adequate.",
        },
        {
          id: "S1:evidence:conflicting:0",
          disposition: "ACTION",
          statementId: "1",
          statement: "Beta is bad.",
          resultingSentence: "Beta is mixed.",
        },
      ],
      decisions: [
        { id: "S0:editorial:marketing_language_excess:0", choice: "accept" },
        { id: "S1:evidence:conflicting:0", choice: "accept" },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "Preface.\nAlpha is adequate. Beta is mixed.\n");
  });

  test("duplicate sentences are assigned in extraction order", () => {
    const statements = [
      {
        id: "0",
        text: "Same line.",
        qcCard: { statement: "Same line.", charStart: 0, charEnd: 10 },
      },
      {
        id: "1",
        text: "Same line.",
        qcCard: { statement: "Same line.", charStart: 11, charEnd: 21 },
      },
    ];
    const entries = [
      {
        id: "S0:editorial:currency_format:0",
        disposition: "ACTION",
        statementId: "0",
        statement: "Same line.",
        resultingSentence: "First.",
      },
      {
        id: "S1:editorial:currency_format:0",
        disposition: "ACTION",
        statementId: "1",
        statement: "Same line.",
        resultingSentence: "Second.",
      },
    ];
    const result = applyDecisions({
      draft: "Same line. Same line.\n",
      statements,
      entries,
      decisions: [
        { id: entries[0].id, choice: "accept" },
        { id: entries[1].id, choice: "accept" },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "First. Second.\n");
  });

  test("editing the last duplicate skips only that statement", () => {
    const statements = [
      {
        id: "0",
        text: "Same line.",
        qcCard: { statement: "Same line.", charStart: 0, charEnd: 10 },
      },
      {
        id: "1",
        text: "Same line.",
        qcCard: { statement: "Same line.", charStart: 11, charEnd: 21 },
      },
    ];
    const entries = [
      {
        id: "S0:editorial:currency_format:0",
        disposition: "ACTION",
        statementId: "0",
        statement: "Same line.",
        resultingSentence: "First.",
      },
      {
        id: "S1:editorial:currency_format:0",
        disposition: "ACTION",
        statementId: "1",
        statement: "Same line.",
        resultingSentence: "Second.",
      },
    ];
    const result = applyDecisions({
      draft: "Same line. Changed.\n",
      statements,
      entries,
      decisions: [
        { id: entries[0].id, choice: "accept" },
        { id: entries[1].id, choice: "accept" },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, "First. Changed.\n");
  });
});

describe("revise-actions apply has no model", () => {
  test("apply module and route do not import a model or thing1 quotes", () => {
    const applySrc = readFileSync(path.join(ROOT, "lib/revise-actions/apply.mjs"), "utf8");
    const routeSrc = readFileSync(path.join(ROOT, "api/revise-actions-apply.js"), "utf8");
    assert.equal(/openai|chat\.completions|runActionList|thing1/i.test(applySrc), false);
    assert.equal(/openai|chat\.completions|runActionList|thing1/i.test(routeSrc), false);
  });
});
