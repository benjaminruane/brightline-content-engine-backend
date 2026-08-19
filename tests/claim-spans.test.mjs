import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  ADDITIVE_BOUNDARIES,
  RELATIONAL_CONNECTIVES,
  attachDraftOffsets,
  extractVerifiableAnchors,
  isClaimSpansEnabled,
  isCompoundCandidate,
  locateClaimSpan,
  residualHasUnclaimedAnchor,
  rollupClaimVerdicts,
  validateClaimSpans,
} from "../lib/qc/claim-spans.mjs";

const NORDHOLT_S0 =
  "Nordholt Logistics continues to perform in line with underwriting, and the fund has generated a net IRR to date of 14 per cent.";

const TWO_MONEY =
  "Revenue was EUR 10 million, and EBITDA was EUR 2 million.";

describe("isCompoundCandidate pre-filter positives", () => {
  test("Nordholt underwriting + IRR sentence passes", () => {
    assert.equal(isCompoundCandidate(NORDHOLT_S0), true);
    const kinds = extractVerifiableAnchors(NORDHOLT_S0).map((a) => a.kind);
    assert.ok(kinds.includes("named_entity") || kinds.includes("percent"));
    assert.ok(extractVerifiableAnchors(NORDHOLT_S0).length >= 2);
  });

  test("two money figures joined by ', and ' passes", () => {
    assert.equal(isCompoundCandidate(TWO_MONEY), true);
  });

  test("each additive boundary can qualify a two-anchor sentence", () => {
    for (const boundary of ADDITIVE_BOUNDARIES) {
      const sentence = `Alpha Holdings reported EUR 10 million${boundary}Beta Ltd reported EUR 2 million.`;
      assert.equal(isCompoundCandidate(sentence), true, `boundary ${JSON.stringify(boundary)}`);
    }
  });
});

describe("isCompoundCandidate pre-filter negatives", () => {
  test("single anchor fails", () => {
    assert.equal(isCompoundCandidate("Utilisation is 88 per cent."), false);
  });

  test("two anchors without an additive boundary fail", () => {
    assert.equal(
      isCompoundCandidate("Nordholt Logistics generated a net IRR of 14 per cent."),
      false
    );
  });

  test("and without the required comma is not a boundary", () => {
    assert.equal(
      isCompoundCandidate(
        "The business now operates 14 cold-chain facilities across three Nordic markets and employs 720 people."
      ),
      false
    );
  });
});

describe("relational connective blocklist", () => {
  for (const connective of RELATIONAL_CONNECTIVES) {
    test(`blocks "${connective}"`, () => {
      const sentence = `Revenue was EUR 10 million, and EBITDA was EUR 2 million ${connective} volume growth.`;
      assert.equal(isCompoundCandidate(sentence), false, connective);
    });
  }

  test("blocklist is case-insensitive", () => {
    assert.equal(
      isCompoundCandidate("Revenue was EUR 10 million, and EBITDA was EUR 2 million BECAUSE volume grew."),
      false
    );
  });

  test("does not match hyphenated prefix (step-up from is not up from)", () => {
    assert.equal(
      isCompoundCandidate(
        "Revenue was EUR 10 million, and EBITDA was EUR 2 million after a step-up from Fund IV."
      ),
      true
    );
  });
});

describe("validateClaimSpans", () => {
  test("accepts two verbatim non-overlapping claims in document order", () => {
    const out = validateClaimSpans(NORDHOLT_S0, [
      "Nordholt Logistics continues to perform in line with underwriting",
      "the fund has generated a net IRR to date of 14 per cent",
    ]);
    assert.equal(out.ok, true);
    assert.equal(out.claims.length, 2);
    assert.equal(
      NORDHOLT_S0.slice(out.claims[0].localStart, out.claims[0].localEnd),
      out.claims[0].text
    );
  });

  test("rejects a paraphrase", () => {
    const out = validateClaimSpans(NORDHOLT_S0, [
      "performance tracks underwriting",
      "the fund has generated a net IRR to date of 14 per cent",
    ]);
    assert.equal(out.ok, false);
    assert.equal(out.reason, "not_contiguous_substring");
  });

  test("rejects overlapping claims", () => {
    const parent = "Alpha Holdings grew 12 percent, and Beta Ltd grew 8 percent last year.";
    const out = validateClaimSpans(parent, [
      "Alpha Holdings grew 12 percent, and Beta Ltd",
      "Beta Ltd grew 8 percent last year",
    ]);
    assert.equal(out.ok, false);
    assert.ok(out.reason === "overlap" || out.reason === "out_of_order" || out.reason === "not_contiguous_substring");
  });

  test("rejects out-of-order claims", () => {
    const out = validateClaimSpans(NORDHOLT_S0, [
      "the fund has generated a net IRR to date of 14 per cent",
      "Nordholt Logistics continues to perform in line with underwriting",
    ]);
    assert.equal(out.ok, false);
    assert.ok(out.reason === "out_of_order" || out.reason === "not_contiguous_substring");
  });

  test("rejects an anchorless claim (all-or-nothing)", () => {
    const parent = "Alpha Holdings grew 12 percent, and the board later thanked staff.";
    const out = validateClaimSpans(parent, [
      "Alpha Holdings grew 12 percent",
      "the board later thanked staff",
    ]);
    assert.equal(out.ok, false);
    assert.equal(out.reason, "anchorless_claim");
  });

  test("rejects a single claim rather than accepting a partial set", () => {
    const out = validateClaimSpans(NORDHOLT_S0, [
      "Nordholt Logistics continues to perform in line with underwriting",
    ]);
    assert.equal(out.ok, false);
    assert.equal(out.reason, "fewer_than_two_claims");
  });
});

describe("offsets", () => {
  test("draft offsets are parent charStart plus local match index; stored text is the draft slice", () => {
    const parent = {
      text: NORDHOLT_S0,
      charStart: 40,
    };
    const validated = validateClaimSpans(NORDHOLT_S0, [
      "Nordholt Logistics continues to perform in line with underwriting",
      "the fund has generated a net IRR to date of 14 per cent",
    ]);
    assert.equal(validated.ok, true);
    const attached = attachDraftOffsets(parent, validated.claims);
    assert.equal(attached[0].draftStart, 40 + validated.claims[0].localStart);
    assert.equal(attached[0].draftEnd, 40 + validated.claims[0].localEnd);
    assert.equal(attached[0].text, NORDHOLT_S0.slice(validated.claims[0].localStart, validated.claims[0].localEnd));
    assert.equal(attached[1].text.includes("14 per cent"), true);
  });

  test("locateClaimSpan tolerates whitespace-normalised Levenshtein distance 2", () => {
    const parent = "Revenue  was EUR 10 million, and EBITDA was EUR 2 million.";
    const span = locateClaimSpan(parent, "Revenue was EUR 10 million");
    assert.ok(span);
    assert.equal(parent.slice(span.start, span.end).includes("EUR 10 million"), true);
  });
});

describe("coverage guard", () => {
  test("fires when a leftover figure sits outside every claim", () => {
    const parent = "Alpha Holdings grew 12 percent, and Beta Ltd grew 8 percent, with leftover 5 percent.";
    const validated = validateClaimSpans(parent, [
      "Alpha Holdings grew 12 percent",
      "Beta Ltd grew 8 percent",
    ]);
    assert.equal(validated.ok, true);
    const guard = residualHasUnclaimedAnchor(parent, validated.claims);
    assert.equal(guard.blocked, true);
    assert.ok(guard.anchors.some((a) => /5/.test(a.text)));
  });

  test("is clear when claims cover every anchor", () => {
    const validated = validateClaimSpans(NORDHOLT_S0, [
      "Nordholt Logistics continues to perform in line with underwriting",
      "the fund has generated a net IRR to date of 14 per cent",
    ]);
    assert.equal(validated.ok, true);
    const guard = residualHasUnclaimedAnchor(NORDHOLT_S0, validated.claims);
    assert.equal(guard.blocked, false);
  });
});

describe("rollupClaimVerdicts truth table", () => {
  const upgradeArgs = {
    vToday: "partially_confirmed",
    claimVerdicts: ["confirmed", "confirmed"],
    residualBlocked: false,
    wholeSentenceHasConflict: false,
  };

  test("upgrades partial to confirmed when all four conditions hold", () => {
    const out = rollupClaimVerdicts(upgradeArgs);
    assert.equal(out.verdict, "confirmed");
    assert.equal(out.claimUpgrade, true);
    assert.deepEqual(out.blockedBy, []);
  });

  test("does not upgrade when V_today is confirmed", () => {
    const out = rollupClaimVerdicts({ ...upgradeArgs, vToday: "confirmed" });
    assert.equal(out.verdict, "confirmed");
    assert.equal(out.claimUpgrade, false);
  });

  test("does not upgrade when V_today is conflicting", () => {
    const out = rollupClaimVerdicts({ ...upgradeArgs, vToday: "conflicting" });
    assert.equal(out.verdict, "conflicting");
    assert.equal(out.claimUpgrade, false);
  });

  test("does not upgrade when V_today is not_supported", () => {
    const out = rollupClaimVerdicts({ ...upgradeArgs, vToday: "not_supported" });
    assert.equal(out.verdict, "not_supported");
    assert.equal(out.claimUpgrade, false);
  });

  test("does not upgrade when a claim is partially_confirmed (b)", () => {
    const out = rollupClaimVerdicts({
      ...upgradeArgs,
      claimVerdicts: ["confirmed", "partially_confirmed"],
    });
    assert.equal(out.verdict, "partially_confirmed");
    assert.equal(out.claimUpgrade, false);
    assert.ok(out.blockedBy.includes("b"));
  });

  test("does not upgrade when a claim is conflicting (b)", () => {
    const out = rollupClaimVerdicts({
      ...upgradeArgs,
      claimVerdicts: ["confirmed", "conflicting"],
    });
    assert.equal(out.verdict, "partially_confirmed");
    assert.equal(out.claimUpgrade, false);
    assert.ok(out.blockedBy.includes("b"));
  });

  test("does not upgrade when a claim is not_supported (b)", () => {
    const out = rollupClaimVerdicts({
      ...upgradeArgs,
      claimVerdicts: ["confirmed", "not_supported"],
    });
    assert.equal(out.verdict, "partially_confirmed");
    assert.equal(out.claimUpgrade, false);
    assert.ok(out.blockedBy.includes("b"));
  });

  test("does not upgrade when claims are empty (b)", () => {
    const out = rollupClaimVerdicts({ ...upgradeArgs, claimVerdicts: [] });
    assert.equal(out.verdict, "partially_confirmed");
    assert.equal(out.claimUpgrade, false);
    assert.ok(out.blockedBy.includes("b"));
  });

  test("does not upgrade when residual has an unclaimed anchor (c)", () => {
    const out = rollupClaimVerdicts({ ...upgradeArgs, residualBlocked: true });
    assert.equal(out.verdict, "partially_confirmed");
    assert.equal(out.claimUpgrade, false);
    assert.deepEqual(out.blockedBy, ["c"]);
  });

  test("does not upgrade when a whole-sentence match was conflicting (d)", () => {
    const out = rollupClaimVerdicts({ ...upgradeArgs, wholeSentenceHasConflict: true });
    assert.equal(out.verdict, "partially_confirmed");
    assert.equal(out.claimUpgrade, false);
    assert.deepEqual(out.blockedBy, ["d"]);
  });

  test("does not upgrade when b, c, and d all fail", () => {
    const out = rollupClaimVerdicts({
      vToday: "partially_confirmed",
      claimVerdicts: ["partially_confirmed", "confirmed"],
      residualBlocked: true,
      wholeSentenceHasConflict: true,
    });
    assert.equal(out.verdict, "partially_confirmed");
    assert.equal(out.claimUpgrade, false);
    assert.deepEqual(out.blockedBy, ["b", "c", "d"]);
  });

  test("never returns a verdict other than V_today or confirmed", () => {
    const verdicts = ["confirmed", "partially_confirmed", "conflicting", "not_supported"];
    for (const vToday of verdicts) {
      const out = rollupClaimVerdicts({
        vToday,
        claimVerdicts: ["not_supported"],
        residualBlocked: true,
        wholeSentenceHasConflict: true,
      });
      assert.ok(out.verdict === vToday || out.verdict === "confirmed");
      if (vToday !== "partially_confirmed") assert.equal(out.verdict, vToday);
    }
  });
});

describe("isClaimSpansEnabled default ON", () => {
  test("unset env is on; 0/false/off/no is off; option overrides", () => {
    const prev = process.env.QC_CLAIM_SPANS;
    try {
      delete process.env.QC_CLAIM_SPANS;
      assert.equal(isClaimSpansEnabled(), true);
      process.env.QC_CLAIM_SPANS = "0";
      assert.equal(isClaimSpansEnabled(), false);
      process.env.QC_CLAIM_SPANS = "off";
      assert.equal(isClaimSpansEnabled(), false);
      process.env.QC_CLAIM_SPANS = "1";
      assert.equal(isClaimSpansEnabled(), true);
      assert.equal(isClaimSpansEnabled({ claimSpansEnabled: false }), false);
      assert.equal(isClaimSpansEnabled({ claimSpansEnabled: true }), true);
    } finally {
      if (prev === undefined) delete process.env.QC_CLAIM_SPANS;
      else process.env.QC_CLAIM_SPANS = prev;
    }
  });
});
