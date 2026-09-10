/**
 * Exact-quote conflict engagement. Inline F18 fixtures; no diagnostic file read.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";
import {
  CONFLICT_PROPOSAL_UNENGAGED,
  applyConflictProposal,
  findCandidatePairs,
} from "../lib/revise-actions/conflict-engagement.mjs";
import { fillAction } from "../lib/revise-actions/run.mjs";
import { NO_PROPOSAL } from "../lib/revise-actions/sort.mjs";

const F18 = {
  s0: {
    statement:
      'We are writing to confirm completion of the transaction with Nordic SaaS Holdings (the "Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector.',
    primaryExcerpt:
      'We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector.',
  },
  s2: {
    statement: "We have invested EUR 158 million for a 60% controlling stake.",
    primaryExcerpt:
      'We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company")',
  },
  s3: {
    statement:
      "The Company currently serves 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.",
    primaryExcerpt:
      "The Company currently serves 412 property management companies, not 380 as stated in our initial memo.",
  },
  s4: {
    statement:
      "It generates annual recurring revenue (ARR) of EUR 38 million as of March 2025, representing strong growth from EUR 28 million the prior year.",
    primaryExcerpt:
      "Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo.",
  },
  s5: {
    statement: "The Company employs 142 people across Stockholm, Oslo, and Helsinki.",
    primaryExcerpt:
      "The Company employs 167 people as of 28 May, not 142 as stated in our initial memo....",
  },
  s7: {
    statement:
      "Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by continued organic growth, adjacent expansion into commercial property management, and selective M&A.",
    primaryExcerpt:
      "Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo.",
  },
  s8: {
    statement: "The base case generates 2.8x MOIC and 23% gross IRR.",
    primaryExcerpt:
      "Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation.",
  },
};

function conflictEntry(id, fixture, extra = {}) {
  return {
    id,
    disposition: "ACTION",
    statementId: String(id.split(":")[0].slice(1)),
    statement: fixture.statement,
    kind: "evidence",
    rule: "conflicting",
    thing1: null,
    thing1State: "NONE",
    thing2: "",
    primaryExcerpt: fixture.primaryExcerpt,
    suggestedDirection: null,
    sort: {
      policyPermit: true,
      silenceOnCard: false,
      rule: "conflicting",
      reasonCode: "permitted",
    },
    ...extra,
  };
}

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called on contradicted evidence");
  };
}

const PINNED_REPLACE = [
  ["S3:evidence:conflicting:0", F18.s3, "380", "412"],
  ["S4:evidence:conflicting:0", F18.s4, "EUR 38 million", "EUR 35 million"],
  ["S5:evidence:conflicting:0", F18.s5, "142", "167"],
  ["S7:evidence:conflicting:0", F18.s7, "EUR 38 million", "EUR 35 million"],
];
const PINNED_ACK = [
  ["S0:evidence:conflicting:0", F18.s0],
  ["S2:evidence:conflicting:0", F18.s2],
  ["S8:evidence:conflicting:0", F18.s8],
];

describe("revise-actions conflict engagement (F18 pinned 4+3)", () => {
  test("pinned split: four exact single-token replacements and three acknowledgements", async () => {
    const replaced = [];
    const acknowledged = [];
    for (const [id, fixture] of PINNED_REPLACE) {
      const result = await fillAction(conflictEntry(id, fixture), { callModel: throwingModel() });
      assert.equal(result.disposition, "ACTION", id);
      replaced.push(id);
    }
    for (const [id, fixture] of PINNED_ACK) {
      const result = await fillAction(conflictEntry(id, fixture), { callModel: throwingModel() });
      assert.equal(result.disposition, "ACKNOWLEDGE", id);
      assert.equal(result.sort?.reasonCode, "conflict_unaddressed", id);
      acknowledged.push(id);
    }
    assert.equal(replaced.length, 4);
    assert.equal(acknowledged.length, 3);
  });

  test("F18 S0 recommend-versus-complete is ACKNOWLEDGE conflict_unaddressed and does not call the model", async () => {
    let called = 0;
    const result = await fillAction(conflictEntry("S0:evidence:conflicting:0", F18.s0), {
      callModel: async () => {
        called += 1;
        return { text: "{}" };
      },
    });
    assert.equal(called, 0);
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "conflict_unaddressed");
    assert.equal(result.noProposalReason, NO_PROPOSAL.conflict_unaddressed);
    assert.equal(result.resultingSentence, undefined);
    assert.equal(result.proposedChange, undefined);
  });

  test("F18 S5 142 versus 167 is a single-token replace and does not call the model", async () => {
    let called = 0;
    const result = await fillAction(conflictEntry("S5:evidence:conflicting:0", F18.s5), {
      callModel: async () => {
        called += 1;
        return { text: "{}" };
      },
    });
    assert.equal(called, 0);
    assert.equal(result.disposition, "ACTION");
    assert.equal(result.proposedChange, "Replace '142' with '167'.");
    assert.equal(
      result.resultingSentence,
      "The Company employs 167 people across Stockholm, Oslo, and Helsinki."
    );
    assert.match(result.statement, /142/);
    assert.equal(result.resultingSentence.includes("We"), false);
    assert.equal(result.resultingSentence.includes("Halden"), false);
  });

  test("a correction-shaped source (412, not 380 as stated) IS closable", () => {
    const pairs = findCandidatePairs(F18.s3.statement, F18.s3.primaryExcerpt);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].from.raw, "380");
    assert.equal(pairs[0].to.raw, "412");
  });

  test("two figure pairs fail closed", async () => {
    const result = await fillAction(conflictEntry("S8:evidence:conflicting:0", F18.s8), {
      callModel: throwingModel(),
    });
    assert.equal(findCandidatePairs(F18.s8.statement, F18.s8.primaryExcerpt).length, 2);
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "conflict_unaddressed");
    assert.equal(result.resultingSentence, undefined);
  });

  test("Brackenhill S1 18.4 percent to 11.2 percent is the exact-quote replace", async () => {
    const result = await fillAction(
      conflictEntry("S1:evidence:conflicting:0", {
        statement: "The fund has delivered a net IRR of 18.4% since inception.",
        primaryExcerpt: "The net IRR since inception is 11.2%.",
      }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACTION");
    assert.equal(result.proposedChange, "Replace '18.4%' with '11.2%'.");
    assert.equal(result.resultingSentence, "The fund has delivered a net IRR of 11.2% since inception.");
  });

  test("a draft figure the source never mentions is ignored, not a fail-closed", async () => {
    const result = await fillAction(conflictEntry("S4:evidence:conflicting:0", F18.s4), {
      callModel: throwingModel(),
    });
    assert.equal(result.disposition, "ACTION");
    assert.match(result.resultingSentence, /EUR 28 million the prior year/);
    assert.match(result.resultingSentence, /EUR 35 million/);
  });
});

describe("conflict proposal engagement check", () => {
  const errors = [];
  const originalError = console.error;
  afterEach(() => {
    console.error = originalError;
    errors.length = 0;
  });

  test("a voice-only resultingSentence on a closable conflict is ACKNOWLEDGE and logs CONFLICT_PROPOSAL_UNENGAGED", async () => {
    console.error = (...args) => {
      errors.push(args.map(String).join(" "));
    };
    const result = await fillAction(conflictEntry("S5:evidence:conflicting:0", F18.s5), {
      callModel: throwingModel(),
      candidateProposal: {
        resultingSentence: "Halden Group employs 142 people across Stockholm, Oslo, and Helsinki.",
        proposedChange: "Replace 'The Company' with 'Halden Group'.",
        why: "First-person only.",
      },
    });
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "conflict_unaddressed");
    assert.equal(result.resultingSentence, undefined);
    assert.equal(result.proposedChange, undefined);
    assert.ok(
      errors.some((line) => line.includes(CONFLICT_PROPOSAL_UNENGAGED)),
      `expected ${CONFLICT_PROPOSAL_UNENGAGED} in ${JSON.stringify(errors)}`
    );
  });

  test("applyConflictProposal reports unengaged without leaving a proposal", () => {
    console.error = (...args) => {
      errors.push(args.map(String).join(" "));
    };
    const outcome = applyConflictProposal(conflictEntry("S5:evidence:conflicting:0", F18.s5), {
      resultingSentence: "We employ 142 people across Stockholm, Oslo, and Helsinki.",
    });
    assert.equal(outcome.status, "unengaged");
    assert.equal(outcome.proposal, null);
    assert.ok(errors.some((line) => line.includes(CONFLICT_PROPOSAL_UNENGAGED)));
  });
});
