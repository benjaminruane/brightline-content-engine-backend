import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  gatherConcerns,
  buildPublicationMap,
  buildRevisionPrompt,
  parseSoftenedMarkers,
  applyHouseStyleCharNormalizeToRevision,
  ensureMarkerSentenceTerminalPunctuation,
  finalizeSuggestRevisionText,
  normalizeMarkerNoteText,
} from "../lib/build-revision-prompt.mjs";

const cleanCard = {
  qcCard: {
    index: 0,
    statement: "Revenue grew 12%.",
    supportState: "supported",
    displayVerdict: "supported_full",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
  },
};

const evidenceGapCard = {
  qcCard: {
    index: 1,
    statement: "Returns reached 15%.",
    supportState: "not_supported",
    displayVerdict: "not_supported",
    primaryExcerpt: { sourceLabel: "Memo", passage: "Returns were approximately 12%." },
    evidenceSummary: "Sources do not support the 15% figure.",
    reasoningParagraph: "Sources do not support the 15% figure.",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
  },
};

const partialCard = {
  qcCard: {
    index: 2,
    statement: "AUM exceeded $2bn.",
    supportState: "partial",
    displayVerdict: "supported_partial",
    primaryExcerptText: "AUM was reported near $1.9bn.",
    evidenceSummary: "Partial match on AUM scale.",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
  },
};

const conflictCard = {
  qcCard: {
    index: 3,
    statement: "Revenue doubled.",
    supportState: "conflicting",
    displayVerdict: "conflict",
    primaryExcerpt: "One source says revenue rose 20%.",
    evidenceSummary: "Sources contradict the claim.",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
  },
};

const editorialCard = {
  qcCard: {
    index: 4,
    statement: "We are excited to announce incredible growth.",
    supportState: "supported",
    displayVerdict: "supported_full",
    editorialVerdict: "soft_concern",
    editorialConcerns: [
      {
        ruleId: "marketing_language_excess",
        note: "Promotional register.",
        suggestedDirection: "Replace 'incredible' with a concrete metric.",
      },
    ],
    complianceVerdict: "clean",
  },
};

const editorialRemoveMaterialityCard = {
  qcCard: {
    index: 7,
    statement: "The office also has a red kettle.",
    supportState: "supported",
    displayVerdict: "supported_full",
    editorialVerdict: "soft_concern",
    editorialConcerns: [
      {
        ruleId: "materiality",
        note: "Incidental fact that does not advance the argument.",
        suggestedDirection: "Cut the kettle detail or move it to a footnote.",
      },
    ],
    complianceVerdict: "clean",
  },
};

const editorialRemoveDirectionCard = {
  qcCard: {
    index: 8,
    statement: "A passing mention of the lobby plant.",
    supportState: "supported",
    displayVerdict: "supported_full",
    editorialVerdict: "soft_concern",
    editorialConcerns: [
      {
        ruleId: "narrative_coherence",
        note: "Aside does not connect to the surrounding argument.",
        suggestedDirection: "Remove the lobby-plant aside.",
      },
    ],
    complianceVerdict: "clean",
  },
};

const complianceCard = {
  qcCard: {
    index: 5,
    statement: "Investors will see strong returns.",
    supportState: "supported",
    displayVerdict: "supported_full",
    editorialVerdict: "clean",
    complianceVerdict: "soft_concern",
    complianceConcerns: [
      {
        note: "Promissory language without qualifier.",
        suggestedDirection: "Add hedging such as 'may' or 'could'.",
      },
    ],
  },
};

const displayVerdictFallbackCard = {
  qcCard: {
    index: 6,
    statement: "Headcount hit 500.",
    displayVerdict: "no_clear_support",
    primaryExcerptText: "Headcount was 420 at year-end.",
    evidenceSummary: "Headcount figure not found.",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
  },
};

describe("gatherConcerns", () => {
  test("collects evidence gaps, editorial, and compliance; skips confirmed-clean", () => {
    const concerns = gatherConcerns([
      cleanCard,
      evidenceGapCard,
      partialCard,
      conflictCard,
      editorialCard,
      complianceCard,
    ]);

    assert.equal(concerns.length, 5);
    assert.ok(!concerns.some((c) => c.statementIndex === 0), "confirmed-clean must be skipped");

    const evidence = concerns.find((c) => c.statementIndex === 1);
    assert.deepEqual(evidence.evidence, {
      verdict: "no_support",
      excerpt: "Returns were approximately 12%.",
      reason: "Sources do not support the 15% figure.",
      kind: "unsupported",
    });
    assert.equal(evidence.editorial.length, 0);
    assert.equal(evidence.compliance.length, 0);

    const partial = concerns.find((c) => c.statementIndex === 2);
    assert.equal(partial.evidence.verdict, "partially_confirmed");
    assert.equal(partial.evidence.excerpt, "AUM was reported near $1.9bn.");
    assert.equal(partial.evidence.kind, "partial");

    const conflict = concerns.find((c) => c.statementIndex === 3);
    assert.equal(conflict.evidence.verdict, "conflicting");
    assert.equal(conflict.evidence.excerpt, "One source says revenue rose 20%.");
    assert.equal(conflict.evidence.kind, "conflict");
    assert.equal(conflict.evidence.sourcePassage, "One source says revenue rose 20%.");

    const editorial = concerns.find((c) => c.statementIndex === 4);
    assert.equal(editorial.evidence, null);
    assert.deepEqual(editorial.editorial, [
      {
        kind: "craft",
        rule: "marketing_language_excess",
        note: "Promotional register.",
        suggestedDirection: "Replace 'incredible' with a concrete metric.",
      },
    ]);

    const compliance = concerns.find((c) => c.statementIndex === 5);
    assert.deepEqual(compliance.compliance, [
      {
        kind: "compliance_add",
        note: "Promissory language without qualifier.",
        suggestedDirection: "Add hedging such as 'may' or 'could'.",
      },
    ]);
  });

  test("tags kind for conflict / unsupported / deletion / craft / compliance sub-kinds", () => {
    const conflictWithSpan = {
      qcCard: {
        index: 10,
        statement: "Revenue was USD 50 million.",
        supportState: "conflicting",
        displayVerdict: "conflict",
        primaryExcerpt: { sourceLabel: "Shopify (text).txt", passage: "Revenue was USD 45 million." },
        supportSpans: [
          {
            sourceRefId: 0,
            classification: "conflicting",
            statementId: "10",
            passage: "Revenue was USD 45 million in the year.",
            start: 0,
            end: 38,
          },
        ],
        evidenceSummary: "Source states USD 45 million, not USD 50 million.",
        reasoningParagraph: "The draft figure conflicts with the source figure.",
        editorialVerdict: "clean",
        complianceVerdict: "clean",
      },
    };

    const concerns = gatherConcerns([
      conflictWithSpan,
      evidenceGapCard,
      editorialRemoveMaterialityCard,
      editorialRemoveDirectionCard,
      editorialCard,
      complianceCard,
    ]);

    const conflict = concerns.find((c) => c.statementIndex === 10);
    assert.equal(conflict.evidence.kind, "conflict");
    assert.equal(conflict.evidence.sourcePassage, "Revenue was USD 45 million in the year.");
    assert.equal(conflict.evidence.sourceLabel, "Shopify (text).txt");
    assert.equal(conflict.evidence.reason.includes("USD 45 million"), true);
    assert.equal(conflict.evidence.reason.includes("conflicts with the source figure"), true);

    const unsupported = concerns.find((c) => c.statementIndex === 1);
    assert.equal(unsupported.evidence.kind, "unsupported");

    const materiality = concerns.find((c) => c.statementIndex === 7);
    assert.equal(materiality.editorial.length, 1);
    assert.equal(materiality.editorial[0].kind, "deletion");
    assert.equal(materiality.editorial[0].rule, "materiality");

    const removeDir = concerns.find((c) => c.statementIndex === 8);
    assert.equal(removeDir.editorial[0].kind, "deletion");
    assert.match(removeDir.editorial[0].suggestedDirection, /^Remove /);

    const editorialOther = concerns.find((c) => c.statementIndex === 4);
    assert.equal(editorialOther.editorial[0].kind, "craft");

    const compliance = concerns.find((c) => c.statementIndex === 5);
    assert.equal(compliance.compliance[0].kind, "compliance_add");
  });

  test("full kind taxonomy: partial, deletion verbs, underreach skip, compliance sub-class, strip downgrade", () => {
    const underreachOnly = {
      qcCard: {
        index: 20,
        statement: "The Fund appears to potentially be well positioned.",
        supportState: "supported",
        displayVerdict: "supported_full",
        editorialVerdict: "soft_concern",
        editorialConcerns: [
          {
            ruleId: "underreach_hedging",
            note: "Stacked hedges.",
            suggestedDirection: "Replace 'appears to potentially be' with 'is'.",
          },
        ],
        complianceVerdict: "clean",
      },
    };
    const cutDirection = {
      qcCard: {
        index: 21,
        statement: "The office also has a red kettle.",
        supportState: "supported",
        displayVerdict: "supported_full",
        editorialVerdict: "soft_concern",
        editorialConcerns: [
          {
            ruleId: "narrative_coherence",
            note: "Incidental aside.",
            suggestedDirection: "Cut the kettle detail.",
          },
        ],
        complianceVerdict: "clean",
      },
    };
    const styleCraft = {
      qcCard: {
        index: 22,
        statement: "Revenue was $7,000,000.",
        supportState: "supported",
        displayVerdict: "supported_full",
        editorialVerdict: "soft_concern",
        editorialConcerns: [
          {
            category: "style_guide",
            ruleId: "currency_format",
            note: "Use ISO code.",
            suggestedDirection: "Replace '$7,000,000' with 'USD 7 million'.",
          },
        ],
        complianceVerdict: "clean",
      },
    };
    const flsAdd = {
      qcCard: {
        index: 23,
        statement: "The Fund will deliver 18% net IRR in 2027.",
        supportState: "supported",
        displayVerdict: "supported_full",
        editorialVerdict: "clean",
        complianceVerdict: "hard_concern",
        complianceConcerns: [
          {
            concernCode: "forward_looking_statement_without_qualifier",
            note: "Forward-looking IRR without qualifier.",
            suggestedDirection: "Add an uncertainty qualifier such as 'is expected to'.",
          },
        ],
      },
    };
    const promissoryClaim = {
      qcCard: {
        index: 24,
        statement: "Investors are guaranteed strong returns.",
        supportState: "supported",
        displayVerdict: "supported_full",
        editorialVerdict: "clean",
        complianceVerdict: "hard_concern",
        complianceConcerns: [
          {
            concernCode: "promissory_or_guaranteed_language",
            note: "Guaranteed returns.",
            suggestedDirection: "Replace 'guaranteed' with 'aims to deliver'.",
          },
        ],
      },
    };
    const namedStrip = {
      qcCard: {
        index: 25,
        statement: "Jane Smith led the diligence.",
        supportState: "supported",
        displayVerdict: "supported_full",
        supportRefIds: [0],
        editorialVerdict: "clean",
        complianceVerdict: "hard_concern",
        complianceConcerns: [
          {
            concernCode: "named_individual_attribution_in_public_content",
            note: "Named individual in public content.",
            suggestedDirection: "Remove 'Jane Smith' or replace with a role title.",
          },
        ],
      },
    };
    const irrStrip = {
      qcCard: {
        index: 26,
        statement: "Fund IV returned 22% net IRR.",
        supportState: "supported",
        displayVerdict: "supported_full",
        supportRefIds: [1],
        editorialVerdict: "clean",
        complianceVerdict: "hard_concern",
        complianceConcerns: [
          {
            concernCode: "precise_confidential_detail_in_public_version",
            note: "Exact fund IRR in a public version.",
            suggestedDirection: "Strip the precise 22% net IRR.",
          },
        ],
      },
    };

    assert.equal(gatherConcerns([underreachOnly]).length, 0, "underreach_hedging must not be gathered");

    const mixedUnderreach = {
      qcCard: {
        index: 27,
        statement: "We are excited and it appears to potentially be strong.",
        supportState: "supported",
        displayVerdict: "supported_full",
        editorialVerdict: "soft_concern",
        editorialConcerns: [
          {
            ruleId: "underreach_hedging",
            note: "Stacked hedges.",
            suggestedDirection: "Tighten the hedge.",
          },
          {
            ruleId: "marketing_language_excess",
            note: "Excited.",
            suggestedDirection: "Replace 'excited' with measured language.",
          },
        ],
        complianceVerdict: "clean",
      },
    };
    const [keptCraft] = gatherConcerns([mixedUnderreach]);
    assert.equal(keptCraft.editorial.length, 1);
    assert.equal(keptCraft.editorial[0].kind, "craft");
    assert.equal(keptCraft.editorial[0].rule, "marketing_language_excess");

    const [cutItem] = gatherConcerns([cutDirection]);
    assert.equal(cutItem.editorial[0].kind, "deletion");

    const [styleItem] = gatherConcerns([styleCraft]);
    assert.equal(styleItem.editorial[0].kind, "craft");

    const [addItem] = gatherConcerns([flsAdd]);
    assert.equal(addItem.compliance[0].kind, "compliance_add");

    const [claimItem] = gatherConcerns([promissoryClaim]);
    assert.equal(claimItem.compliance[0].kind, "compliance_claim");

    const [partialItem] = gatherConcerns([partialCard]);
    assert.equal(partialItem.evidence.kind, "partial");

    const pubMap = buildPublicationMap([
      { index: 0, publicationState: "published_external" },
      { index: 1, publicationState: "restricted" },
    ]);
    const [downgraded] = gatherConcerns([namedStrip], pubMap);
    assert.equal(downgraded.compliance[0].kind, "compliance_strip");
    assert.equal(downgraded.compliance[0].publicSourceDowngrade, true);

    const [stripped] = gatherConcerns([irrStrip], pubMap);
    assert.equal(stripped.compliance[0].kind, "compliance_strip");
    assert.equal(stripped.compliance[0].publicSourceDowngrade, undefined);

    const [strippedNoMap] = gatherConcerns([namedStrip], null);
    assert.equal(strippedNoMap.compliance[0].kind, "compliance_strip");
    assert.equal(strippedNoMap.compliance[0].publicSourceDowngrade, undefined);

    const promptWithDowngrade = buildRevisionPrompt("Jane Smith led the diligence.", [downgraded], {});
    assert.match(promptWithDowngrade, /kind=compliance_strip; publicSourceDowngrade=keep-and-flag; ACTION=KEEP-AND-FLAG \(do not strip\)/);
    assert.doesNotMatch(
      promptWithDowngrade,
      /kind=compliance_strip; ACTION=STRIP-AND-FLAG/
    );

    const promptStrip = buildRevisionPrompt("Fund IV returned 22% net IRR last year.", [stripped], {});
    assert.match(promptStrip, /kind=compliance_strip; ACTION=STRIP-AND-FLAG/);
  });

  test("falls back to displayVerdict when supportState is absent", () => {
    const concerns = gatherConcerns([displayVerdictFallbackCard]);
    assert.equal(concerns.length, 1);
    assert.equal(concerns[0].evidence.verdict, "no_support");
    assert.equal(concerns[0].evidence.excerpt, "Headcount was 420 at year-end.");
  });

  test("returns stable shape for mixed concerns on one statement", () => {
    const mixed = {
      qcCard: {
        index: 9,
        statement: "We will deliver unmatched returns.",
        supportState: "partial",
        displayVerdict: "supported_partial",
        evidenceSummary: "Returns language overreaches sources.",
        primaryExcerpt: { passage: "Net returns were mid-single digit." },
        editorialVerdict: "concern",
        editorialConcerns: [
          {
            concernCode: "overreach",
            note: "Absolute claim.",
            suggestedDirection: "Qualify scope of returns.",
          },
        ],
        complianceVerdict: "hard_concern",
        complianceConcerns: [
          {
            note: "Promissory 'will deliver'.",
            suggestedDirection: "Use 'aims to' or similar hedging.",
          },
        ],
      },
    };
    const [item] = gatherConcerns([mixed]);
    assert.equal(item.statementIndex, 9);
    assert.equal(item.statementText, "We will deliver unmatched returns.");
    assert.equal(item.evidence.verdict, "partially_confirmed");
    assert.equal(item.editorial.length, 1);
    assert.equal(item.editorial[0].kind, "craft");
    assert.equal(item.compliance.length, 1);
    assert.equal(item.compliance[0].kind, "compliance_claim");
    assert.deepEqual(Object.keys(item).sort(), [
      "compliance",
      "editorial",
      "evidence",
      "statementIndex",
      "statementText",
    ]);
  });
});

describe("buildRevisionPrompt", () => {
  const draft = "Revenue grew 12%. We are excited to announce incredible growth.";

  test("includes guardrail instructions, each concern direction, and embeds the draft", () => {
    const concerns = gatherConcerns([evidenceGapCard, editorialCard]);
    const prompt = buildRevisionPrompt(draft, concerns, {});

    assert.match(prompt, /Never FABRICATE/i);
    assert.match(prompt, /Never STRENGTHEN a claim/i);
    assert.match(prompt, /NO SCAFFOLDING/i);
    assert.match(prompt, /Revise ONLY the provided draft text/i);
    assert.match(prompt, /FOR IMMEDIATE RELEASE/);
    assert.match(prompt, /Preserve the author's voice/i);
    assert.match(prompt, /Output ONLY the full revised draft/i);
    assert.match(prompt, /suggestedDirection=Replace 'incredible' with a concrete metric\./);
    assert.match(prompt, /Evidence gap \(no_support\)/);
    assert.match(prompt, /<<<DRAFT\n[\s\S]*Revenue grew 12%/);
    assert.match(prompt, /DRAFT>>>/);
  });

  test("includes kind blocks, supported-figures, named-entity keep, strip vs downgrade", () => {
    const concerns = gatherConcerns([evidenceGapCard, conflictCard, editorialRemoveMaterialityCard]);
    const prompt = buildRevisionPrompt(draft, concerns, {
      outputType: "REPORTING_COMMENTARY",
      requiredVersion: "complete",
    });

    assert.match(prompt, /currency_format/);
    assert.match(prompt, /thousand_separator/);
    assert.match(prompt, /number_spelling/);
    assert.match(prompt, /first_person_plural/);
    assert.match(prompt, /hyperbole_vs_qualitative/);
    assert.match(prompt, /HOUSE STYLE RULES/);
    assert.match(prompt, /SUPPORTED figures: never change the author's number/i);
    assert.match(prompt, /kind "conflict"/);
    assert.match(prompt, /revised PROSE must carry that source value/i);
    assert.match(prompt, /NEVER "material growth"/);
    assert.match(prompt, /Hedge or drop the precise number ONLY when the source states no replacement value/i);
    assert.match(prompt, /kind "unsupported"/);
    assert.match(prompt, /same figure rule as conflict\/partial/);
    assert.match(prompt, /true unsupported/);
    assert.match(prompt, /kind "partial"/);
    assert.match(prompt, /Keep the CONFIRMED portion unchanged/i);
    assert.match(prompt, /around USD 1\.9 billion/);
    assert.match(prompt, /kind "deletion"/);
    assert.match(prompt, /Do NOT delete/i);
    assert.match(prompt, /consider cutting/i);
    assert.match(prompt, /kind "craft"/);
    assert.match(prompt, /APPLY SILENTLY/i);
    assert.match(prompt, /NEVER emit a \{\{text\|\|note\}\} marker for a craft edit/);
    assert.match(prompt, /Only conflict \/ unsupported \/ partial \/ deletion \/ compliance_add \/ compliance_claim \/ compliance_strip may emit markers/);
    assert.match(prompt, /kind "compliance_add"/);
    assert.match(prompt, /kind "compliance_claim"/);
    assert.match(prompt, /kind "compliance_strip"/);
    assert.match(prompt, /ACTION=STRIP-AND-FLAG/);
    assert.match(prompt, /publicSourceDowngrade=keep-and-flag/);
    assert.match(prompt, /ACTION=KEEP-AND-FLAG/);
    assert.match(prompt, /supporting source is public/i);
    assert.match(prompt, /NAMED ENTITIES on an EVIDENCE finding/i);
    assert.match(prompt, /NEVER anonymise evidence-driven names/i);
    assert.match(prompt, /LESS HEDGING/i);
    assert.match(prompt, /complete, plain-English sentence/i);
    assert.match(prompt, /\{\{softened text\|\|short reviewer note\}\}/);
    assert.match(prompt, /Sentence-ending punctuation/);
    assert.match(prompt, /stays OUTSIDE the delimiter/);
    assert.match(prompt, /ENTIRE revised draft must comply/i);
    assert.match(prompt, /natural paragraph structure/i);
  });

  test("gates first_person_plural off for investor_letter but still includes hyperbole and currency", () => {
    const promptIl = buildRevisionPrompt(draft, [], { outputType: "INVESTOR_LETTER" });
    assert.doesNotMatch(promptIl, /first_person_plural:/);
    assert.match(promptIl, /hyperbole_vs_qualitative/);
    assert.match(promptIl, /currency_format/);
  });

  test("honours outputType and requiredVersion when present", () => {
    const concerns = gatherConcerns([complianceCard]);
    const prompt = buildRevisionPrompt(draft, concerns, {
      outputType: "INVESTOR_LETTER",
      requiredVersion: "public",
    });

    assert.match(prompt, /Investor letter/i);
    assert.match(prompt, /INVESTOR_LETTER/);
    assert.match(prompt, /Public/i);
    assert.match(prompt, /PUBLIC/);
    assert.match(prompt, /publicly safe wording/i);
    assert.match(prompt, /suggestedDirection=Add hedging such as 'may' or 'could'\./);
  });

  test("maps requiredVersion internal to complete house-style and omits defaults when absent", () => {
    const withInternal = buildRevisionPrompt(draft, [], { requiredVersion: "internal" });
    assert.match(withInternal, /Internal \(complete\)/i);
    assert.match(withInternal, /COMPLETE/);

    const bare = buildRevisionPrompt(draft, [], {});
    assert.doesNotMatch(bare, /^OUTPUT INTENT:\n- Output type:/m);
    assert.doesNotMatch(bare, /Required version \/ visibility/);
    assert.match(bare, /no outputType\/requiredVersion was supplied/);
    // Style guide still injected (defaults to reporting_commentary canon).
    assert.match(bare, /currency_format/);
  });
});

describe("parseSoftenedMarkers", () => {
  test("delimiters become clean text with correct offsets and notes", () => {
    const raw =
      "Lead-in. {{revenue grew materially||draft stated 40% / $120m; sources support ~$95m — confirm}} Trailing.";
    const { revisedDraft, markers } = parseSoftenedMarkers(raw);

    assert.equal(revisedDraft, "Lead-in. revenue grew materially Trailing.");
    assert.equal(markers.length, 1);
    assert.equal(markers[0].note, "draft stated 40% / $120m; sources support ~$95m — confirm");
    assert.equal(revisedDraft.slice(markers[0].start, markers[0].end), "revenue grew materially");
    assert.equal(markers[0].start, "Lead-in. ".length);
    assert.equal(markers[0].end, "Lead-in. revenue grew materially".length);
  });

  test("parses multiple markers non-greedily", () => {
    const raw = "A {{one||n1}} B {{two||n2}} C";
    const { revisedDraft, markers } = parseSoftenedMarkers(raw);
    assert.equal(revisedDraft, "A one B two C");
    assert.equal(markers.length, 2);
    assert.equal(revisedDraft.slice(markers[0].start, markers[0].end), "one");
    assert.equal(revisedDraft.slice(markers[1].start, markers[1].end), "two");
    assert.equal(markers[0].note, "n1");
    assert.equal(markers[1].note, "n2");
  });

  test("no delimiters yields empty markers", () => {
    const { revisedDraft, markers } = parseSoftenedMarkers("Plain draft with no markers.");
    assert.equal(revisedDraft, "Plain draft with no markers.");
    assert.deepEqual(markers, []);
  });
});

describe("house-style char normalize + marker offsets", () => {
  test("offset accuracy survives the char-normalise pass", () => {
    const raw =
      "Intro {{“softened growth” claim||draft said — 40%; confirm}} end.";
    const parsed = parseSoftenedMarkers(raw);
    assert.equal(
      parsed.revisedDraft.slice(parsed.markers[0].start, parsed.markers[0].end),
      "“softened growth” claim"
    );

    const notesNormalized = {
      revisedDraft: parsed.revisedDraft,
      markers: parsed.markers.map((m) => ({
        start: m.start,
        end: m.end,
        note: normalizeMarkerNoteText(m.note),
      })),
    };
    const withPunct = ensureMarkerSentenceTerminalPunctuation(notesNormalized);
    // lowercase "end" is not a sentence boundary — no period inserted
    assert.equal(withPunct.revisedDraft, parsed.revisedDraft);

    const finalized = applyHouseStyleCharNormalizeToRevision(withPunct);
    assert.equal(finalized.revisedDraft.includes("“"), false);
    assert.equal(finalized.revisedDraft.includes("—"), false);
    assert.match(finalized.revisedDraft, /"softened growth" claim/);
    assert.equal(
      finalized.revisedDraft.slice(finalized.markers[0].start, finalized.markers[0].end),
      '"softened growth" claim'
    );
    assert.match(finalized.markers[0].note, /Draft said - 40%/);
    assert.match(finalized.markers[0].note, /\.$/);

    const viaFinalize = finalizeSuggestRevisionText(raw);
    assert.deepEqual(viaFinalize, finalized);
  });
});

describe("normalizeMarkerNoteText", () => {
  test("capitalises, adds terminal punctuation, and leaves offsets untouched", () => {
    assert.equal(normalizeMarkerNoteText("confirm the figure"), "Confirm the figure.");
    assert.equal(normalizeMarkerNoteText("Already a sentence."), "Already a sentence.");
    assert.equal(normalizeMarkerNoteText("  what about this?  "), "What about this?");
    assert.equal(normalizeMarkerNoteText("Wait!"), "Wait!");
    assert.equal(normalizeMarkerNoteText(""), "");

    const raw = "{{softened growth||draft said 40% — confirm}} trailing.";
    const parsed = parseSoftenedMarkers(raw);
    const notesNormalized = {
      revisedDraft: parsed.revisedDraft,
      markers: parsed.markers.map((m) => ({
        start: m.start,
        end: m.end,
        note: normalizeMarkerNoteText(m.note),
      })),
    };

    assert.equal(notesNormalized.revisedDraft, parsed.revisedDraft);
    assert.equal(notesNormalized.markers[0].start, parsed.markers[0].start);
    assert.equal(notesNormalized.markers[0].end, parsed.markers[0].end);
    assert.equal(
      notesNormalized.revisedDraft.slice(notesNormalized.markers[0].start, notesNormalized.markers[0].end),
      parsed.revisedDraft.slice(parsed.markers[0].start, parsed.markers[0].end)
    );
    assert.equal(notesNormalized.markers[0].note, "Draft said 40% — confirm.");
  });
});

describe("ensureMarkerSentenceTerminalPunctuation", () => {
  test("inserts period when marked span lacks terminal punct and next sentence is capitalized", () => {
    const raw =
      "{{Acme Capital delivered materially higher revenue year on year||draft stated 40% — confirm}}\nAcme Capital reports solid growth.";
    const { revisedDraft, markers } = finalizeSuggestRevisionText(raw);

    assert.equal(
      revisedDraft,
      "Acme Capital delivered materially higher revenue year on year.\nAcme Capital reports solid growth."
    );
    assert.equal(markers.length, 1);
    assert.equal(
      revisedDraft.slice(markers[0].start, markers[0].end),
      "Acme Capital delivered materially higher revenue year on year"
    );
    assert.equal(revisedDraft[markers[0].end], ".");
    assert.match(markers[0].note, /Draft stated 40% - confirm/);
    assert.match(markers[0].note, /\.$/);
  });

  test("leaves span unchanged when period already sits outside delimiter", () => {
    const raw =
      "{{A venture firm is evaluating an investment of up to USD 7 million in Shopify||confirm attribution}}. Shopify's 24 employees are located in Ottawa, Canada.";
    const { revisedDraft, markers } = finalizeSuggestRevisionText(raw);

    assert.equal(
      revisedDraft,
      "A venture firm is evaluating an investment of up to USD 7 million in Shopify. Shopify's 24 employees are located in Ottawa, Canada."
    );
    assert.equal(markers.length, 1);
    assert.equal(
      revisedDraft.slice(markers[0].start, markers[0].end),
      "A venture firm is evaluating an investment of up to USD 7 million in Shopify"
    );
    assert.equal(revisedDraft[markers[0].end], ".");
    assert.equal(markers[0].note, "Confirm attribution.");
  });

  test("end-of-text span without period gets one", () => {
    const raw =
      "Lead-in. {{Investors may benefit from improved returns as the platform scales||draft promised strong returns — confirm}}";
    const { revisedDraft, markers } = finalizeSuggestRevisionText(raw);

    assert.equal(
      revisedDraft,
      "Lead-in. Investors may benefit from improved returns as the platform scales."
    );
    assert.equal(markers.length, 1);
    assert.equal(
      revisedDraft.slice(markers[0].start, markers[0].end),
      "Investors may benefit from improved returns as the platform scales"
    );
    assert.equal(revisedDraft[markers[0].end], ".");
    assert.equal(revisedDraft.endsWith("."), true);
  });
});
