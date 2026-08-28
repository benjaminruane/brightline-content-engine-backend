import { describe, it, expect } from "vitest";

import {
  AUTHOR_STATEMENT_KEPT_NOTE,
  OUTCOME_AUTHOR_EXEMPT,
  authorStatementExemption,
  findingRestsOnSilence,
  isAuthorOriginatedStatement,
  isAuthorStatementKeptNote,
  tightestUnsupportedSpans,
} from "../lib/revise-author-statement.mjs";
import { normalizeMarkerNoteText } from "../lib/build-revision-prompt.mjs";
import {
  applyDeterministicUnsupportedRemoval,
  DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE,
} from "../lib/pr9-deterministic-unsupported-removal.mjs";
import {
  checkNoSpanEntitiesKept,
  runStage1,
  validateStage1Response,
  REJECT_NO_SPAN_ENTITY_LOSS,
  REJECT_OUTSIDE_SPAN,
} from "../lib/revise-stage1.mjs";

const HOUSE = "Halden Group";

const silence = (extra = {}) => ({
  evidence: { kind: "unsupported", verdict: "no_support", reason: "no source mentions this" },
  ...extra,
});

describe("the author-originated test", () => {
  it("treats a first-person view as the author's own", () => {
    const r = isAuthorOriginatedStatement(
      "We were attracted to Meridian on the strength of its track record.",
      [],
      { authoringOrganisation: HOUSE }
    );
    expect(r.authorOriginated).toBe(true);
    expect(r.reason).toMatch(/first person/i);
  });

  it("treats the named organisation as the subject as the author's own", () => {
    const r = isAuthorOriginatedStatement(
      "In June 2026, Partners Group committed to Meridian Capital Partners V.",
      [],
      { authoringOrganisation: "Partners Group" }
    );
    expect(r.authorOriginated).toBe(true);
    expect(r.reason).toContain("Partners Group");
  });

  it("does not fire on a third-party subject", () => {
    const r = isAuthorOriginatedStatement(
      "Fund IV has returned 1.9 times gross MOIC.",
      [],
      { authoringOrganisation: HOUSE }
    );
    expect(r.authorOriginated).toBe(false);
  });

  it("does not fire on a possessive: the subject is the thing, not the author", () => {
    const r = isAuthorOriginatedStatement(
      "Halden Group's Fund III returned 2.1 times gross MOIC.",
      [],
      { authoringOrganisation: HOUSE }
    );
    expect(r.authorOriginated).toBe(false);
  });

  it("does not fire when the author is the subject of no action, view or intention", () => {
    const r = isAuthorOriginatedStatement("Halden Group is a European investor.", [], {
      authoringOrganisation: HOUSE,
    });
    expect(r.authorOriginated).toBe(false);
  });

  it("does not fire on a reporting frame that carries a third-party figure", () => {
    const r = isAuthorOriginatedStatement("We note that Meridian's IRR is 24 per cent.", [], {
      authoringOrganisation: HOUSE,
    });
    expect(r.authorOriginated).toBe(false);
  });

  it("does not fire when the flagged element is an appositive about a third party", () => {
    const r = isAuthorOriginatedStatement(
      "In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR 1.2 billion flagship fund.",
      [{ text: "a EUR 1.2 billion flagship fund" }],
      { authoringOrganisation: "Partners Group" }
    );
    expect(r.authorOriginated).toBe(false);
    expect(r.reason).toMatch(/third party/i);
  });

  it("still fires when the flagged element sits in the author's own clause", () => {
    const r = isAuthorOriginatedStatement(
      "On balance, we believe the fund should deliver in line with its predecessor and we recommend the commitment.",
      [{ text: "we recommend the commitment" }],
      { authoringOrganisation: HOUSE }
    );
    expect(r.authorOriginated).toBe(true);
  });

  it("names no organisation when none is configured, so only first person can fire", () => {
    expect(
      isAuthorOriginatedStatement("Halden Group committed to the fund.", [], {}).authorOriginated
    ).toBe(false);
    expect(
      isAuthorOriginatedStatement("We committed to the fund.", [], {}).authorOriginated
    ).toBe(true);
  });

  it("requires the configured name to be present in the draft, never scraping one", () => {
    const r = isAuthorOriginatedStatement("Halden Group committed to the fund.", [], {
      authoringOrganisation: HOUSE,
      draftText: "A draft that never names the house.",
    });
    expect(r.authorOriginated).toBe(false);
  });
});

describe("silence versus contradiction", () => {
  it("treats an aggregated not_supported verdict as silence", () => {
    expect(findingRestsOnSilence(silence()).silence).toBe(true);
  });

  it("treats the unsupported element of a partial as silence", () => {
    expect(
      findingRestsOnSilence({ evidence: { kind: "partial", verdict: "partially_confirmed" } })
        .silence
    ).toBe(true);
  });

  it("does NOT treat a conflict as silence", () => {
    const r = findingRestsOnSilence({ evidence: { kind: "conflict", verdict: "conflicting" } });
    expect(r.silence).toBe(false);
    expect(r.why).toMatch(/contradicts/);
  });

  it("does NOT treat a source stating a competing value as silence", () => {
    const r = findingRestsOnSilence({
      evidence: { kind: "unsupported", verdict: "no_support", sourcePassage: "the IRR was 18%" },
    });
    expect(r.silence).toBe(false);
    expect(r.why).toMatch(/competing value/);
  });

  it("does NOT treat a decomposed conflicting claim as silence", () => {
    const r = findingRestsOnSilence({
      evidence: { kind: "partial", verdict: "partially_confirmed" },
      claims: [{ role: "conflict", text: "24 per cent gross IRR" }],
    });
    expect(r.silence).toBe(false);
  });
});

describe("the exemption combines both, and only both", () => {
  it("exempts an author statement resting on silence", () => {
    const d = authorStatementExemption({
      statementText: "Halden Group expects the relationship to deepen over the life of the fund.",
      ...silence(),
    }, { authoringOrganisation: HOUSE });
    expect(d.exempt).toBe(true);
    expect(d.reason).toBeTruthy();
  });

  it("REFUSES to exempt an author statement a source contradicts", () => {
    const d = authorStatementExemption({
      statementText: "Halden Group committed EUR 100 million to the fund.",
      evidence: { kind: "conflict", verdict: "conflicting", sourcePassage: "EUR 50 million" },
    }, { authoringOrganisation: HOUSE });
    expect(d.exempt).toBe(false);
    expect(d.authorOriginated).toBe(true);
    expect(d.reason).toMatch(/contradicts/);
  });

  it("does not exempt a third-party statement resting on silence", () => {
    const d = authorStatementExemption({
      statementText: "The fund intends to build a portfolio of 10-14 investments.",
      ...silence(),
    }, { authoringOrganisation: HOUSE });
    expect(d.exempt).toBe(false);
  });
});

describe("the quiet note register", () => {
  it("carries no Confirm before publishing closer", () => {
    expect(AUTHOR_STATEMENT_KEPT_NOTE).not.toMatch(/confirm before publishing/i);
  });

  it("is distinct from the loud empty-draft note", () => {
    expect(AUTHOR_STATEMENT_KEPT_NOTE).not.toBe(DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE);
    expect(DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE).toMatch(/kept only because/);
    expect(AUTHOR_STATEMENT_KEPT_NOTE).toMatch(/your own position or action/);
  });

  it("survives note normalisation without acquiring a closer", () => {
    expect(normalizeMarkerNoteText(AUTHOR_STATEMENT_KEPT_NOTE)).toBe(AUTHOR_STATEMENT_KEPT_NOTE);
    expect(isAuthorStatementKeptNote(AUTHOR_STATEMENT_KEPT_NOTE)).toBe(true);
    expect(isAuthorStatementKeptNote("Something else.")).toBe(false);
  });

  it("still appends the closer to an ordinary note", () => {
    expect(normalizeMarkerNoteText("Softened the claim")).toMatch(/Confirm before publishing\.$/);
  });
});

describe("deterministic removal honours the exemption", () => {
  const draft =
    "Halden Group expects the relationship to deepen over the life of the fund. The team has been stable for a decade.";
  const concern = {
    statementIndex: 9,
    statementText: "Halden Group expects the relationship to deepen over the life of the fund.",
    ...silence(),
  };

  it("keeps the sentence and emits the quiet note instead of deleting it", () => {
    const out = applyDeterministicUnsupportedRemoval({ revisedDraft: draft, markers: [] }, [concern], {
      enabled: true,
      originalDraft: draft,
      authoringOrganisation: HOUSE,
    });
    expect(out.revisedDraft).toContain("Halden Group expects the relationship to deepen");
    expect(out.removalEvents.filter((e) => e.action === "removed")).toHaveLength(0);
    const kept = out.removalEvents.find((e) => e.action === "author_statement_kept");
    expect(kept).toBeTruthy();
    expect(kept.note).toBe(AUTHOR_STATEMENT_KEPT_NOTE);
    expect(out.markers.some((m) => m.intent === "KEPT" && m.note === AUTHOR_STATEMENT_KEPT_NOTE)).toBe(
      true
    );
  });

  it("still removes a third-party unsupported sentence", () => {
    const withTail =
      "Halden Group expects the relationship to deepen over the life of the fund.\n\nThe team has been stable for a decade.";
    const thirdParty = {
      statementIndex: 2,
      statementText: "The team has been stable for a decade",
      ...silence(),
    };
    const out = applyDeterministicUnsupportedRemoval(
      { revisedDraft: withTail, markers: [] },
      [thirdParty],
      { enabled: true, originalDraft: withTail, authoringOrganisation: HOUSE }
    );
    expect(out.removalEvents.filter((e) => e.action === "removed")).toHaveLength(1);
    expect(out.revisedDraft).not.toContain("stable for a decade");
  });
});

describe("part 3a, the tightest span wins", () => {
  const concern = {
    statementText:
      "The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks of EUR 80-100 million apiece.",
    evidence: {
      kind: "unsupported",
      verdict: "no_support",
      unsupportedSpans: [
        { text: "control-oriented investments, with equity checks of EUR 80-100 million apiece." },
      ],
    },
    claims: [
      { role: "partial", text: "The fund intends to build a portfolio of 10-14 control-oriented investments" },
      { role: "unsupported", text: "equity checks of EUR 80-100 million apiece" },
    ],
  };

  it("prefers the claim-level element over the coarser span", () => {
    const spans = tightestUnsupportedSpans(concern);
    expect(spans).toHaveLength(1);
    expect(spans[0].source).toBe("claim");
    expect(spans[0].text).toBe("equity checks of EUR 80-100 million apiece");
  });

  it("falls back to unsupportedSpans when decomposition did not run", () => {
    const spans = tightestUnsupportedSpans({ ...concern, claims: null });
    expect(spans[0].source).toBe("span");
  });

  it("now REJECTS the edit that deleted control-oriented", () => {
    const res = validateStage1Response(
      JSON.stringify({
        action: "edit",
        revised_statement: "The fund intends to build a portfolio of 10-14 investments.",
        what: "cut the equity cheque figures",
        why: "no source backs them",
      }),
      concern
    );
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe(REJECT_OUTSIDE_SPAN);
  });

  it("accepts an edit that cuts only the unsupported claim", () => {
    const res = validateStage1Response(
      JSON.stringify({
        action: "edit",
        revised_statement:
          "The fund intends to build a portfolio of 10-14 control-oriented investments.",
        what: "cut the equity cheque figures",
        why: "no source backs them",
      }),
      concern
    );
    expect(res.accepted).toBe(true);
  });
});

describe("part 3b, the no-span guard", () => {
  const original = "In June 2026, Partners Group committed to Meridian Capital Partners V.";
  const concern = {
    statementText: original,
    evidence: { kind: "unsupported", verdict: "no_support", reason: "no source mentions the commitment" },
  };

  it("rejects an edit that drops a date and an actor the finding never named", () => {
    const check = checkNoSpanEntitiesKept(
      original,
      "Meridian Capital Partners V is a flagship fund.",
      concern
    );
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/June|Partners Group/);
  });

  it("allows an edit that drops something the finding did name", () => {
    const withFinding = {
      ...concern,
      evidence: { ...concern.evidence, reason: "no source supports the June 2026 date" },
    };
    const check = checkNoSpanEntitiesKept(
      original,
      "Partners Group committed to Meridian Capital Partners V.",
      withFinding
    );
    expect(check.ok).toBe(true);
  });

  it("wires into the validator on the no-span path", () => {
    const res = validateStage1Response(
      JSON.stringify({
        action: "edit",
        revised_statement: "Meridian Capital Partners V is a flagship fund.",
        what: "recast",
        why: "unsupported",
      }),
      concern
    );
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe(REJECT_NO_SPAN_ENTITY_LOSS);
  });
});

describe("stage 1 records an exemption, not a refusal", () => {
  const draft =
    "Halden Group expects the relationship to deepen over the life of the fund. Fund IV returned 1.9 times.";

  it("never calls the model for an exempt statement and marks it quietly", async () => {
    const calls = [];
    const out = await runStage1(
      draft,
      [
        {
          statementIndex: 0,
          statementText: "Halden Group expects the relationship to deepen over the life of the fund.",
          ...silence(),
        },
      ],
      {
        authoringOrganisation: HOUSE,
        callModel: async (p) => {
          calls.push(p);
          return { text: "{}" };
        },
      }
    );

    expect(calls).toHaveLength(0);
    const event = out.events.find((e) => e.outcome === OUTCOME_AUTHOR_EXEMPT);
    expect(event).toBeTruthy();
    expect(out.events.some((e) => e.outcome === "rejected")).toBe(false);
    expect(out.edits).toHaveLength(0);
    expect(out.revisedDraft).toContain(`||KEPT: ${AUTHOR_STATEMENT_KEPT_NOTE}`);
  });

  it("still sends a contradicted author statement for editing", async () => {
    const calls = [];
    await runStage1(
      draft,
      [
        {
          statementIndex: 0,
          statementText: "Halden Group expects the relationship to deepen over the life of the fund.",
          evidence: { kind: "conflict", verdict: "conflicting", sourcePassage: "the mandate ends in 2027" },
        },
      ],
      {
        authoringOrganisation: HOUSE,
        callModel: async (p) => {
          calls.push(p);
          return { text: JSON.stringify({ action: "no_change", what: "", why: "" }) };
        },
      }
    );
    expect(calls).toHaveLength(1);
  });
});
