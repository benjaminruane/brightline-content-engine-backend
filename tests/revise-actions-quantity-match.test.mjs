/**
 * Pinned quantity-matching table. Inline fixtures; no diagnostic file read.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  applyConflictProposal,
  findCandidatePairs,
  finishedSentenceIsLicensed,
} from "../lib/revise-actions/conflict-engagement.mjs";
import { fillAction } from "../lib/revise-actions/run.mjs";
import { NO_PROPOSAL } from "../lib/revise-actions/sort.mjs";

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called on contradicted evidence");
  };
}

function conflictEntry(id, fixture) {
  return {
    id,
    disposition: "ACTION",
    statementId: String(id.split(":")[0].replace(/^S/, "")),
    statement: fixture.statement,
    kind: "evidence",
    rule: "conflicting",
    thing1: null,
    thing1State: "NONE",
    thing2: "",
    primaryExcerpt: fixture.primaryExcerpt,
    card: fixture.card,
    sort: {
      policyPermit: true,
      silenceOnCard: false,
      rule: "conflicting",
      reasonCode: "permitted",
    },
  };
}

async function filled(id, fixture) {
  return fillAction(conflictEntry(id, fixture), { callModel: throwingModel() });
}

const ROWS = {
  "F05-S0": {
    statement:
      "Halden Group has agreed to acquire Norwell Aerospace Components, a leading manufacturer of structural composite components and titanium machined parts, from Westhaven Capital.",
    primaryExcerpt: "Westhaven Capital agrees to acquire Norwell Aerospace Components from Bridgepoint",
  },
  "F05-S5": {
    statement:
      "During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability.",
    primaryExcerpt:
      "The Company has invested significantly in new composite manufacturing capability during the Bridgepoint ownership period and now operates three of the most advanced automated composite layup facilities in North America.",
  },
  "F08-S2": {
    statement:
      "We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance.",
    primaryExcerpt:
      "Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management.",
  },
  "F12-S0": {
    statement:
      "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.",
    primaryExcerpt:
      "After eighteen months of work alongside the team, I'm delighted that Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.",
  },
  "F13-S7": {
    statement: "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore.",
    primaryExcerpt:
      "The total team of 285 people is split approximately as follows: engineering 110, customer success and implementation 75, sales 55, customer support 35, and general & administrative 10.",
    card: {
      supportSpans: [
        {
          sourceRefId: 0,
          classification: "confirmed",
          statementId: "7",
          passage:
            "CloudPivot employs 320 people across offices in London (headquarters), Hamburg, Lisbon, and Bangalore.",
          start: 1662,
          end: 1764,
        },
        {
          sourceRefId: 0,
          classification: "conflicting",
          statementId: "7",
          passage:
            "The total team of 285 people is split approximately as follows: engineering 110, customer success and implementation 75, sales 55, customer support 35, and general & administrative 10.",
          start: 6559,
          end: 6743,
        },
      ],
      sourceMatches: [{ classification: "confirmed", sourceIndex: 0 }],
    },
  },
  "F14-S11": {
    statement: "We expect to bring a specific potential investment to consider over the coming months.",
    primaryExcerpt:
      "We are not yet in dialogue with any specific company. The purpose is to seek Committee endorsement of the thesis itself, which would authorise the team to begin active sourcing and to engage with potential targets at the appropriate level.",
  },
  "F15-S2": {
    statement: "We have invested EUR 720 million of equity for an 84% stake.",
    primaryExcerpt:
      "We seek IC approval for an investment of up to EUR 720 million of equity in the acquisition of Casa Verde Group S.p.A.",
  },
  "F15-S11": {
    statement:
      "The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above.",
    primaryExcerpt:
      "Fifth, the Atelier 73 concept has the potential to become a meaningful third growth pillar. The 18 stores operating today generate average four-wall margins of 18%, slightly below the core Casa Verde concept, but the format is younger, less proven, and at much earlier scale.",
  },
  "F17-S9": {
    statement:
      "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex programme to modernise three older assets, and benefiting from continued rental growth and modest yield compression.",
    primaryExcerpt:
      "Embedded rental reversion is estimated at approximately 18% across the portfolio, with the strongest reversion potential in the London and Amsterdam assets where market rents have grown most rapidly over the past three years.",
  },
  "F18-S0": {
    statement:
      'We are writing to confirm completion of the transaction with Nordic SaaS Holdings (the "Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector.',
    primaryExcerpt:
      'We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector.',
  },
  "F18-S2": {
    statement: "We have invested EUR 158 million for a 60% controlling stake.",
    primaryExcerpt:
      'We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company")',
  },
  "F18-S3": {
    statement:
      "The Company currently serves 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.",
    primaryExcerpt:
      "The Company currently serves 412 property management companies, not 380 as stated in our initial memo.",
    expected:
      "The Company currently serves 412 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.",
  },
  "F18-S4": {
    statement:
      "It generates annual recurring revenue (ARR) of EUR 38 million as of March 2025, representing strong growth from EUR 28 million the prior year.",
    primaryExcerpt:
      "Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo.",
    expected:
      "It generates annual recurring revenue (ARR) of EUR 35 million as of April 2025, representing strong growth from EUR 28 million the prior year.",
  },
  "F18-S5": {
    statement: "The Company employs 142 people across Stockholm, Oslo, and Helsinki.",
    primaryExcerpt: "The Company employs 167 people as of 28 May, not 142 as stated in our initial memo.",
    expected: "The Company employs 167 people across Stockholm, Oslo, and Helsinki.",
  },
  "F18-S7": {
    statement:
      "Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by continued organic growth, adjacent expansion into commercial property management, and selective M&A.",
    primaryExcerpt:
      "Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo.",
  },
  "F18-S8": {
    statement: "The base case generates 2.8x MOIC and 23% gross IRR.",
    primaryExcerpt:
      "Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation.",
    expected: "The base case generates 2.6x MOIC and 21% gross IRR.",
  },
  "F19-S2": {
    statement:
      "The exit of NorTech Industries — which closed in January 2026 at SEK 18.4 billion and generated a 3.56x gross MOIC / 31.4 percent gross IRR — is the largest realisation in the Fund's history and the principal driver of the Fund's current returns trajectory.",
    primaryExcerpt:
      "The realisation of NorTech Industries closed on 19 January 2026 (post year-end, but discussed here given its significance to the Fund). The exit generated gross proceeds of SEK 12.8 billion to Fund IV on invested capital of SEK 3.6 billion, representing a 3.56x gross MOIC and 31.4% gross IRR....",
  },
  "F19-S13": {
    statement:
      "Brightway Industrial Coatings and Eltex Power Systems are both progressing toward exit-readiness, with formal processes likely to launch in the first and third quarters respectively.",
    primaryExcerpt:
      "We anticipate two additional realisations during 2026, with Brightway Industrial Coatings and Eltex Power Systems both progressing toward exit-readiness. We will provide further updates as these processes develop.",
  },
  W2: {
    statement: "The fund has delivered a net IRR of 18.4% since inception.",
    primaryExcerpt: "The net IRR since inception is 11.2%.",
    expected: "The fund has delivered a net IRR of 11.2% since inception.",
  },
};

const PROPOSE = ["F18-S3", "F18-S4", "F18-S5", "F18-S8", "W2"];
const DECLINE = [
  "F05-S0",
  "F05-S5",
  "F08-S2",
  "F12-S0",
  "F13-S7",
  "F14-S11",
  "F15-S2",
  "F15-S11",
  "F17-S9",
  "F18-S0",
  "F18-S2",
  "F18-S7",
  "F19-S2",
  "F19-S13",
];

describe("quantity-matching pinned table", () => {
  for (const id of PROPOSE) {
    test(`${id} PROPOSE exact resulting sentence`, async () => {
      const fixture = ROWS[id];
      const result = await filled(`${id}:evidence:conflicting:0`, fixture);
      assert.equal(result.disposition, "ACTION", id);
      assert.equal(result.resultingSentence, fixture.expected, id);
      assert.equal(applyConflictProposal(conflictEntry(`${id}:evidence:conflicting:0`, fixture)).status, "replace");
    });
  }

  for (const id of DECLINE) {
    test(`${id} DECLINE no writable pairs`, async () => {
      const fixture = ROWS[id];
      const entry = conflictEntry(`${id}:evidence:conflicting:0`, fixture);
      const outcome = applyConflictProposal(entry);
      assert.equal(outcome.status, "unaddressed", id);
      assert.equal(outcome.proposal, null, id);
      assert.equal(outcome.pairs.length, 0, id);
      const result = await filled(`${id}:evidence:conflicting:0`, fixture);
      assert.equal(result.disposition, "ACKNOWLEDGE", id);
      assert.equal(result.sort?.reasonCode, "conflict_unaddressed", id);
      assert.equal(result.noProposalReason, NO_PROPOSAL.conflict_unaddressed, id);
      assert.equal(result.resultingSentence, undefined, id);
    });
  }

  test("live F18 membership is replace S3 S4 S5 S8 and acknowledge S0 S2 S7", async () => {
    const replace = ["F18-S3", "F18-S4", "F18-S5", "F18-S8"];
    const ack = ["F18-S0", "F18-S2", "F18-S7"];
    for (const id of replace) {
      const result = await filled(`${id}:evidence:conflicting:0`, ROWS[id]);
      assert.equal(result.disposition, "ACTION", id);
    }
    for (const id of ack) {
      const result = await filled(`${id}:evidence:conflicting:0`, ROWS[id]);
      assert.equal(result.disposition, "ACKNOWLEDGE", id);
    }
  });
});

describe("quantity-matching guards", () => {
  test("a written value that is not a substring of the source passage drops the whole proposal", async () => {
    assert.equal(
      finishedSentenceIsLicensed(
        "The Company currently serves 380 property management companies.",
        "The Company currently serves 413 property management companies.",
        "The Company currently serves 412 property management companies, not 380 as stated."
      ),
      false
    );
    const fixture = {
      statement: "The Company currently serves 380 property management companies.",
      primaryExcerpt: "The Company currently serves 412 property management companies, not 380 as stated.",
    };
    const ok = applyConflictProposal(conflictEntry("S3:evidence:conflicting:0", fixture));
    assert.equal(ok.status, "replace");
    assert.equal(ok.proposal.resultingSentence.includes("412"), true);
    assert.equal(
      finishedSentenceIsLicensed(fixture.statement, ok.proposal.resultingSentence, fixture.primaryExcerpt),
      true
    );
  });

  test("a source month earlier in the year than the draft's month declines rather than inheriting a year", async () => {
    const fixture = {
      statement:
        "It generates annual recurring revenue (ARR) of EUR 38 million as of March 2025, representing strong growth from EUR 28 million the prior year.",
      primaryExcerpt:
        "Annual recurring revenue at end of February was EUR 35 million, not EUR 38 million as stated in our initial memo.",
    };
    const outcome = applyConflictProposal(conflictEntry("S4:evidence:conflicting:0", fixture));
    assert.equal(outcome.status, "unaddressed");
    const result = await filled("S4:evidence:conflicting:0", fixture);
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "conflict_unaddressed");
    assert.equal(result.resultingSentence, undefined);
  });

  test("a draft sentence with no year declines the date replacement but does not block a figure replacement that writes no date", async () => {
    const fixture = {
      statement: "The Company employs 142 people across Stockholm, Oslo, and Helsinki.",
      primaryExcerpt: "The Company employs 167 people as of 28 May, not 142 as stated in our initial memo.",
    };
    const result = await filled("S5:evidence:conflicting:0", fixture);
    assert.equal(result.disposition, "ACTION");
    assert.equal(result.resultingSentence, "The Company employs 167 people across Stockholm, Oslo, and Helsinki.");
    assert.equal(result.resultingSentence.includes("May"), false);
    assert.equal(result.resultingSentence.includes("2025"), false);
  });
});

describe("quantity-matching R1 uses card spans", () => {
  test("F13-S7 pairs without spans would form, and spans veto", () => {
    const fixture = ROWS["F13-S7"];
    assert.equal(findCandidatePairs(fixture.statement, fixture.primaryExcerpt).length >= 1, true);
    const withSpans = applyConflictProposal(conflictEntry("S7:evidence:conflicting:0", fixture));
    assert.equal(withSpans.status, "unaddressed");
    const { card, ...noCard } = fixture;
    void card;
    const withoutSpans = applyConflictProposal(conflictEntry("S7:evidence:conflicting:0", noCard));
    assert.equal(withoutSpans.status, "replace");
  });
});
