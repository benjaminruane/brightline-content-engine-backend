/**
 * An ACTION must be a licensed change. Identity, unlicensed organisation,
 * and first-person-without-pronoun are acknowledgements.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { fillAction, runActionList } from "../lib/revise-actions/run.mjs";
import { NO_PROPOSAL } from "../lib/revise-actions/sort.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVIEW2_PATH = path.join(
  __dirname,
  "..",
  "scripts",
  "diagnostic",
  "revise",
  "suggest-after-r10-review2.json"
);
const SAMPLE_PATH = path.join(
  __dirname,
  "..",
  "scripts",
  "diagnostic",
  "revise",
  "per-finding-action-list",
  "brackenhill-2026-09-02.json"
);

const CONVERT_IDS = [
  "S5:evidence:partial:0",
  "S5:editorial:overreach_unsupported_causal:0",
  "S7:evidence:partial:0",
];
const KEEP_ACTION_IDS = [
  "S0:editorial:currency_format:0",
  "S1:evidence:conflicting:0",
  "S2:evidence:conflicting:0",
  "S4:editorial:voice_consistency:1",
  "S6:editorial:voice_consistency:0",
  "S9:editorial:voice_consistency:0",
];
const KEEP_ACK_IDS = [
  "S4:evidence:partial:0",
  "S4:editorial:marketing_language_excess:0",
  "S4:framing:framing_fidelity:0",
  "S6:evidence:not_supported:0",
  "S8:evidence:not_supported:0",
  "S9:evidence:not_supported:0",
];

function loadReview2Statements() {
  const json = JSON.parse(readFileSync(REVIEW2_PATH, "utf8"));
  return json?.payload?.statements ?? [];
}

function loadSample() {
  return JSON.parse(readFileSync(SAMPLE_PATH, "utf8"));
}

function asSortedAction(recorded) {
  const { proposedChange, resultingSentence, why, verification, ...rest } = recorded;
  void proposedChange;
  void resultingSentence;
  void why;
  void verification;
  return rest;
}

function stubModel(recorded) {
  return async () => ({
    text: JSON.stringify({
      proposedChange: recorded.proposedChange,
      resultingSentence: recorded.resultingSentence,
      why: recorded.why,
    }),
  });
}

function actionEntry(overrides) {
  return {
    id: "S0:editorial:overreach_unsupported_causal:0",
    disposition: "ACTION",
    statementId: "0",
    statement: "The firm's senior team has been stable, which means execution risk is limited.",
    kind: "editorial",
    rule: "overreach_unsupported_causal",
    thing1: null,
    thing1State: "NONE",
    thing2: "Causal overreach.",
    sort: {
      policyPermit: true,
      silenceOnCard: false,
      rule: "overreach_unsupported_causal",
      reasonCode: "permitted",
    },
    ...overrides,
  };
}

describe("revise-actions licensed change", () => {
  test("collapsed resultingSentence equal to the statement is not ACTION", async () => {
    const statement =
      "The firm's senior team has been stable, which means execution risk on Fund III\nis limited.";
    const resultingSentence =
      "The firm's senior team has been stable, which means execution risk on Fund III is limited.";
    let called = 0;
    const result = await fillAction(actionEntry({ statement }), {
      authoringOrganisation: "Halden Group",
      callModel: async () => {
        called += 1;
        return {
          text: JSON.stringify({
            proposedChange: "No change to the text.",
            resultingSentence,
            why: "Nothing licensed.",
          }),
        };
      },
    });
    assert.equal(called, 1);
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "visible_signal");
    assert.equal(result.noProposalReason, NO_PROPOSAL.visible_signal);
    assert.equal(result.resultingSentence, undefined);
  });

  test("r10-review2 S7 voice does not call the model", async () => {
    const calledIds = [];
    const result = await runActionList(loadReview2Statements(), {
      callModel: async (_prompt, meta) => {
        calledIds.push(meta.id);
        return {
          text: JSON.stringify({
            proposedChange: "Replace 'recommends' with 'Halden Group recommends'.",
            resultingSentence:
              "On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and Halden Group recommends the commitment.",
            why: "Third-person voice.",
          }),
        };
      },
    });
    const found = result.entries.find((e) => e.id === "S7:editorial:voice_consistency:0");
    assert.ok(found, "S7 voice finding must exist");
    assert.equal(found.disposition, "ACKNOWLEDGE");
    assert.equal(found.sort?.reasonCode, "visible_signal");
    assert.equal(found.noProposalReason, NO_PROPOSAL.visible_signal);
    assert.equal(calledIds.includes("S7:editorial:voice_consistency:0"), false);
  });

  test("organisation in the result, not the original, with no pronoun is not ACTION", async () => {
    const statement =
      "Comparable managers in North American healthcare services have returned a median 2.3 times gross MOIC over the same period.";
    const resultingSentence = `${statement} to Halden Group.`;
    const result = await fillAction(
      actionEntry({
        id: "S7:evidence:partial:0",
        statementId: "7",
        statement,
        kind: "evidence",
        rule: "partial",
        sort: { policyPermit: true, silenceOnCard: false, rule: "partial", reasonCode: "permitted" },
      }),
      {
        authoringOrganisation: "Halden Group",
        callModel: async () => ({
          text: JSON.stringify({
            proposedChange: "Add 'to Halden Group'.",
            resultingSentence,
            why: "Unlicensed actor.",
          }),
        }),
      }
    );
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "visible_signal");
    assert.equal(result.noProposalReason, NO_PROPOSAL.visible_signal);
    assert.equal(result.resultingSentence, undefined);
  });

  test("fillAction does not call the model on a slipped first-person ACTION with no pronoun", async () => {
    let called = 0;
    const result = await fillAction(
      actionEntry({
        id: "S7:editorial:voice_consistency:0",
        statement:
          "On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.",
        kind: "editorial",
        rule: "voice_consistency",
        sort: {
          policyPermit: true,
          silenceOnCard: true,
          rule: "voice_consistency",
          reasonCode: "permitted",
        },
      }),
      {
        authoringOrganisation: "Halden Group",
        callModel: async () => {
          called += 1;
          return {
            text: JSON.stringify({
              proposedChange: "x",
              resultingSentence: "y",
              why: "z",
            }),
          };
        },
      }
    );
    assert.equal(called, 0);
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.noProposalReason, NO_PROPOSAL.visible_signal);
  });
});

describe("Brackenhill 2026-09-02 recorded sample", () => {
  test("three named rows convert; six ACTION and six ACKNOWLEDGE stay", async () => {
    const sample = loadSample();
    assert.equal(sample.entries.length, 15);
    const replayed = [];
    for (const entry of sample.entries) {
      if (entry.disposition !== "ACTION") {
        replayed.push(entry);
        continue;
      }
      replayed.push(
        await fillAction(asSortedAction(entry), {
          authoringOrganisation: "Halden Group",
          callModel: stubModel(entry),
        })
      );
    }
    const byId = Object.fromEntries(replayed.map((e) => [e.id, e]));
    for (const id of CONVERT_IDS) {
      assert.equal(byId[id]?.disposition, "ACKNOWLEDGE", `${id} must convert`);
      assert.equal(byId[id]?.sort?.reasonCode, "visible_signal", `${id} reason`);
      assert.equal(byId[id]?.noProposalReason, NO_PROPOSAL.visible_signal, `${id} copy`);
    }
    for (const id of KEEP_ACTION_IDS) {
      assert.equal(byId[id]?.disposition, "ACTION", `${id} must stay ACTION`);
      assert.ok(byId[id]?.resultingSentence, `${id} keeps the proposal`);
    }
    for (const id of KEEP_ACK_IDS) {
      assert.equal(byId[id]?.disposition, "ACKNOWLEDGE", `${id} must stay ACKNOWLEDGE`);
    }
  });
});
