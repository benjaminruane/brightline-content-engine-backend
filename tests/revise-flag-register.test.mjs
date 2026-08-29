import { describe, it, expect } from "vitest";

import {
  LOUD_NOTE,
  QUIET_NOTE,
  REGISTER_LOUD,
  REGISTER_ORDINARY,
  REGISTER_QUIET,
  flagRegister,
  isFlagRegisterNote,
  loudTextSignalsOf,
  sourceSpoke,
  causalLexiconFires,
  causalEditorialRuleOn,
  CAUSAL_EDITORIAL_RULE,
  namedThirdPartiesIn,
  endsWithFlagRegisterNote,
  findingAddressedByEdit,
} from "../lib/revise-flag-register.mjs";
import { normalizeMarkerNoteText } from "../lib/build-revision-prompt.mjs";
import { AUTHOR_STATEMENT_KEPT_NOTE } from "../lib/revise-author-statement.mjs";

const silent = (statementText, extra = {}) => ({
  statementIndex: 0,
  statementText,
  evidence: { kind: "unsupported", verdict: "no_support" },
  ...extra,
});

describe("ORDINARY: a source said something, so Revise is editing", () => {
  it("classifies a conflict as ORDINARY", () => {
    const r = flagRegister({
      statementText: "Fund IV returned 1.9 times gross MOIC.",
      evidence: { kind: "conflict", verdict: "conflicting" },
    });
    expect(r.register).toBe(REGISTER_ORDINARY);
    expect(r.note).toBeNull();
    expect(r.signal).toBe("evidence.kind=conflict");
  });

  it("classifies a source-stated competing value as ORDINARY even on unsupported", () => {
    const r = flagRegister({
      statementText: "The fund is EUR 1.2 billion.",
      evidence: { kind: "unsupported", sourcePassage: "the fund closed at EUR 900 million" },
    });
    expect(r.register).toBe(REGISTER_ORDINARY);
    expect(r.signal).toMatch(/sourcePassage/);
  });

  it("classifies a decomposed conflicting claim as ORDINARY", () => {
    const r = flagRegister({
      statementText: "The fund is large.",
      evidence: { kind: "partial" },
      claims: [{ role: "conflict", text: "the fund is large" }],
    });
    expect(r.register).toBe(REGISTER_ORDINARY);
  });

  it("does not treat plain silence as a source speaking", () => {
    expect(sourceSpoke(silent("Anything at all.")).sourceSpoke).toBe(false);
  });
});

describe("LOUD: the flagged element carries something checkable", () => {
  const loudCases = [
    ["a currency amount", "equity checks of EUR 80-100 million apiece", "currency_amount"],
    ["a percentage", "delivered 22% revenue growth", "percentage"],
    ["a multiple", "a gross MOIC of 2.4 times", "multiple"],
    ["a date", "the transaction closed in March 2026", "date_or_period"],
    ["a ranking", "placing it in the top quartile of European managers", "ranking_or_superlative"],
    ["a causal claim", "This relationship enabled deep insight", "causal_connective_lexicon"],
    ["a named third party", "advised by Meridian Capital on the deal", "named_third_party"],
  ];

  for (const [label, element, signal] of loudCases) {
    it(`fires on ${label}`, () => {
      const r = flagRegister(silent(element), null, element);
      expect(r.register).toBe(REGISTER_LOUD);
      expect(r.note).toBe(LOUD_NOTE);
      expect(r.textSignals).toContain(signal);
      expect(r.signal).toMatch(/^element text:/);
    });
  }

  it("reports the element-text signal that decided it, not a black box", () => {
    const element = "equity checks of EUR 80-100 million apiece";
    expect(loudTextSignalsOf(element)).toContain("currency_amount");
  });
});

describe("QUIET: nothing checkable in the flagged element", () => {
  const quietCases = [
    "We recommend approval.",
    "The investment fits well with the broader portfolio strategy.",
    "We will provide further detail when the work is sufficiently advanced.",
  ];

  for (const element of quietCases) {
    it(`stays quiet on ${JSON.stringify(element.slice(0, 40))}`, () => {
      const r = flagRegister(silent(element), null, element);
      expect(r.register).toBe(REGISTER_QUIET);
      expect(r.note).toBe(QUIET_NOTE);
    });
  }
});

describe("materiality.features decide only when they can", () => {
  it("uses features when the flagged element is the whole statement", () => {
    const statement = "The relationship deepened over the fund's life.";
    const r = flagRegister({
      ...silent(statement),
      materiality: { level: "material", features: ["monetary_figure"] },
    });
    expect(r.register).toBe(REGISTER_LOUD);
    expect(r.signal).toBe("materiality.features: monetary_figure");
  });

  it("ignores features that sit outside a tighter flagged element", () => {
    const statement = "The fund raised EUR 1.2 billion and the team works well together.";
    const element = "the team works well together";
    const r = flagRegister(
      { ...silent(statement), materiality: { level: "material", features: ["monetary_figure"] } },
      null,
      element
    );
    expect(r.register).toBe(REGISTER_QUIET);
    expect(r.signal).toMatch(/sit outside it/);
  });

  it("does not treat forward_looking as loud on its own", () => {
    const statement = "We intend to keep the reviewer updated.";
    const r = flagRegister({
      ...silent(statement),
      materiality: { level: "material", features: ["forward_looking"] },
    });
    expect(r.register).toBe(REGISTER_QUIET);
  });

  it("stays quiet on a material level with no features, deciding from text instead", () => {
    // The measured production card: level material by verdict alone, features [].
    const statement = "This relationship enabled deep insight during the diligence phase.";
    const r = flagRegister({
      ...silent(statement),
      materiality: { level: "material", features: [] },
    });
    expect(r.register).toBe(REGISTER_LOUD);
    expect(r.textSignals).toContain("causal_connective_lexicon");
  });
});

describe("the three sanity-check sentences", () => {
  it("the equity cheque is LOUD", () => {
    const element = "equity checks of EUR 80-100 million apiece";
    expect(flagRegister(silent(element), null, element).register).toBe(REGISTER_LOUD);
  });

  it("'We recommend approval.' is QUIET", () => {
    expect(flagRegister(silent("We recommend approval.")).register).toBe(REGISTER_QUIET);
  });

  it("the diligence sentence is LOUD", () => {
    const s = "This relationship enabled deep insight during the diligence phase.";
    expect(flagRegister(silent(s)).register).toBe(REGISTER_LOUD);
  });
});

describe("note register and its carve-outs", () => {
  it("LOUD is visibly more emphatic than the ordinary register", () => {
    expect(LOUD_NOTE).toMatch(/Do not publish/);
    expect(LOUD_NOTE).not.toMatch(/confirm before publishing/i);
  });

  it("QUIET carries no Confirm before publishing closer", () => {
    expect(QUIET_NOTE).not.toMatch(/confirm before publishing/i);
  });

  it("both survive note normalisation unchanged", () => {
    expect(normalizeMarkerNoteText(LOUD_NOTE)).toBe(LOUD_NOTE);
    expect(normalizeMarkerNoteText(QUIET_NOTE)).toBe(QUIET_NOTE);
  });

  it("still appends the closer to an ordinary note", () => {
    expect(normalizeMarkerNoteText("Softened the claim")).toMatch(/Confirm before publishing\.$/);
  });

  it("recognises only its own two notes", () => {
    expect(isFlagRegisterNote(LOUD_NOTE)).toBe(true);
    expect(isFlagRegisterNote(QUIET_NOTE)).toBe(true);
    expect(isFlagRegisterNote(AUTHOR_STATEMENT_KEPT_NOTE)).toBe(false);
    expect(isFlagRegisterNote("Something else.")).toBe(false);
  });

  it("keeps all three quiet-ish registers distinct from one another", () => {
    const notes = new Set([LOUD_NOTE, QUIET_NOTE, AUTHOR_STATEMENT_KEPT_NOTE]);
    expect(notes.size).toBe(3);
  });
});

describe("causal claims are LOUD, from the card first and the lexicon second", () => {
  it("prefers Review's own causal rule, however narrow the flagged element", () => {
    const concern = silent("This relationship enabled deep insight during the diligence phase.", {
      editorial: [{ kind: "craft", rule: CAUSAL_EDITORIAL_RULE }],
    });
    // A fragment with no causal word in it at all: only the card can decide.
    const r = flagRegister(concern, null, "deep insight");
    expect(r.register).toBe(REGISTER_LOUD);
    expect(r.note).toBe(LOUD_NOTE);
    expect(r.signal).toBe(`editorial rule ${CAUSAL_EDITORIAL_RULE}`);
  });

  it("reads the rule off a card's editorialConcerns, where it is called concernCode", () => {
    const card = { editorialConcerns: [{ concernCode: CAUSAL_EDITORIAL_RULE }] };
    expect(causalEditorialRuleOn({}, card)).toBe(true);
    expect(causalEditorialRuleOn({}, { editorialConcerns: [{ concernCode: "em_dash" }] })).toBe(
      false
    );
  });

  // The measured miss from 73bca5d: the old list held "means that", not "means".
  it("catches the key-person sentence, which QUIET wrongly claimed", () => {
    const element = "means key-person risk is limited";
    expect(causalLexiconFires(element)).toBe(true);
    const r = flagRegister(
      silent(
        "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited."
      ),
      null,
      element
    );
    expect(r.register).toBe(REGISTER_LOUD);
    expect(r.textSignals).toContain("causal_connective_lexicon");
  });

  it.each([
    "The relationship enabled deep insight",
    "returns were driven by multiple expansion",
    "the restructuring led to a write-down",
    "the delay resulted in a missed close",
    "strong performance, therefore the fund reopened",
    "the covenant ensures the fund cannot overcommit",
    "as a result the manager reduced the target",
    "the discount stems from the illiquidity",
    "which is why the team was expanded",
  ])("fires on %j", (element) => {
    expect(causalLexiconFires(element)).toBe(true);
  });

  it.each([
    ["by means of a co-investment vehicle", "instrument, not cause"],
    ["a means of accessing the asset class", "instrument, not cause"],
    ["the report is due to be published in Q3", "scheduled, not caused"],
    ["managers are allowed to hold cash", "permission, not effect"],
    ["the fund completed due diligence on four targets", "'due diligence' is not 'due to'"],
    ["we recommend the commitment", "an author's own position"],
    ["the team has fourteen investment professionals", "a plain count"],
  ])("does not fire on %j (%s)", (element) => {
    expect(causalLexiconFires(element)).toBe(false);
  });

  it("neutralises only the false friend, so a real cause beside one still fires", () => {
    expect(causalLexiconFires("by means of a vehicle, which enabled the co-investment")).toBe(true);
  });

  it("never reaches the lexicon when the SOURCE is the one making the causal claim", () => {
    const r = flagRegister({
      statementText: "The write-down resulted in a lower NAV.",
      evidence: { kind: "unsupported", sourcePassage: "the write-down reduced NAV to EUR 880m" },
    });
    expect(r.register).toBe(REGISTER_ORDINARY);
    expect(r.textSignals).toEqual([]);
  });

  it("leaves the author's own recommendation QUIET", () => {
    const r = flagRegister(
      silent(
        "On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment."
      ),
      null,
      "we recommend the commitment"
    );
    expect(r.register).toBe(REGISTER_QUIET);
    expect(r.note).toBe(QUIET_NOTE);
  });
});

describe("the author is not a third party", () => {
  const HALDEN = "Halden Group expects the relationship to deepen over the life of the fund";

  it("does not count the configured authoring organisation as a third party", () => {
    expect(namedThirdPartiesIn(HALDEN, "Halden Group")).toEqual([]);
    expect(loudTextSignalsOf(HALDEN, "Halden Group")).not.toContain("named_third_party");
  });

  it("moves the author's own expectation out of LOUD", () => {
    const before = flagRegister(silent(HALDEN), null, HALDEN, { authoringOrganisation: null });
    const after = flagRegister(silent(HALDEN), null, HALDEN, {
      authoringOrganisation: "Halden Group",
    });
    expect(before.register).toBe(REGISTER_LOUD);
    expect(before.textSignals).toContain("named_third_party");
    expect(after.register).toBe(REGISTER_QUIET);
    expect(after.note).toBe(QUIET_NOTE);
  });

  it("still sees a genuine third party in the same sentence", () => {
    const text = "Halden Group committed to Meridian Capital Partners V";
    expect(namedThirdPartiesIn(text, "Halden Group")).toEqual(["Meridian Capital Partners V"]);
    expect(loudTextSignalsOf(text, "Halden Group")).toContain("named_third_party");
  });

  it("excludes names the house name leads, but not unrelated ones", () => {
    expect(namedThirdPartiesIn("Halden Group Partners advised", "Halden Group")).toEqual([]);
    expect(namedThirdPartiesIn("Halden Advisory Group advised", "Halden Group")).toEqual([
      "Halden Advisory Group",
    ]);
  });

  it("is unchanged where no organisation is configured", () => {
    expect(namedThirdPartiesIn(HALDEN, null)).toEqual(["Halden Group"]);
    expect(loudTextSignalsOf(HALDEN, null)).toContain("named_third_party");
  });
});

describe("closer exemption and the addressed test", () => {
  it("recognises a combined note as closing on its register clause", () => {
    expect(endsWithFlagRegisterNote(`Replaced "a" with "b" - house style. ${QUIET_NOTE}`)).toBe(
      true
    );
    expect(endsWithFlagRegisterNote(`Replaced "a" with "b" - house style. ${LOUD_NOTE}`)).toBe(
      true
    );
    expect(endsWithFlagRegisterNote("Replaced \"a\" with \"b\". Confirm before publishing.")).toBe(
      false
    );
  });

  it("calls a voice rewrite unaddressed, because the claim survives it", () => {
    expect(
      findingAddressedByEdit("we recommend the commitment", "Halden Group recommends the commitment")
    ).toBe(false);
  });

  it("calls a clause cut addressed, because the claim is gone", () => {
    expect(
      findingAddressedByEdit(
        "with equity checks of EUR 80-100 million apiece",
        "The fund intends to build a portfolio of 10-14 control-oriented investments."
      )
    ).toBe(true);
  });

  it("treats an empty element as unaddressed, since ties favour keeping the flag", () => {
    expect(findingAddressedByEdit("", "anything at all")).toBe(false);
  });
});
