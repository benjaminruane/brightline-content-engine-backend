import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  gatherConcerns,
  buildRevisionPrompt,
  parseSoftenedMarkers,
  applyHouseStyleCharNormalizeToRevision,
  ensureMarkerSentenceTerminalPunctuation,
  finalizeSuggestRevisionText,
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
    });
    assert.equal(evidence.editorial.length, 0);
    assert.equal(evidence.compliance.length, 0);

    const partial = concerns.find((c) => c.statementIndex === 2);
    assert.equal(partial.evidence.verdict, "partially_confirmed");
    assert.equal(partial.evidence.excerpt, "AUM was reported near $1.9bn.");

    const conflict = concerns.find((c) => c.statementIndex === 3);
    assert.equal(conflict.evidence.verdict, "conflicting");
    assert.equal(conflict.evidence.excerpt, "One source says revenue rose 20%.");

    const editorial = concerns.find((c) => c.statementIndex === 4);
    assert.equal(editorial.evidence, null);
    assert.deepEqual(editorial.editorial, [
      {
        rule: "marketing_language_excess",
        note: "Promotional register.",
        suggestedDirection: "Replace 'incredible' with a concrete metric.",
      },
    ]);

    const compliance = concerns.find((c) => c.statementIndex === 5);
    assert.deepEqual(compliance.compliance, [
      {
        note: "Promissory language without qualifier.",
        suggestedDirection: "Add hedging such as 'may' or 'could'.",
      },
    ]);
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
    assert.equal(item.compliance.length, 1);
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

    assert.match(prompt, /NEVER fabricate or invent supporting facts/i);
    assert.match(prompt, /do NOT silently delete a substantive claim/i);
    assert.match(prompt, /Preserve the author's voice/i);
    assert.match(prompt, /Output ONLY the full revised draft/i);
    assert.match(prompt, /suggestedDirection=Replace 'incredible' with a concrete metric\./);
    assert.match(prompt, /Evidence gap \(no_support\)/);
    assert.match(prompt, /<<<DRAFT\n[\s\S]*Revenue grew 12%/);
    assert.match(prompt, /DRAFT>>>/);
  });

  test("includes resolved style-guide rules, first-person, hyperbole, and figure-no-substitution", () => {
    const concerns = gatherConcerns([evidenceGapCard]);
    const prompt = buildRevisionPrompt(draft, concerns, {
      outputType: "REPORTING_COMMENTARY",
      requiredVersion: "complete",
    });

    assert.match(prompt, /currency_format/);
    assert.match(prompt, /thousand_separator/);
    assert.match(prompt, /number_spelling/);
    assert.match(prompt, /first_person_plural/);
    assert.match(prompt, /hyperbole_vs_qualitative/);
    assert.match(prompt, /DO NOT substitute a value from the source/i);
    assert.match(prompt, /Never adopt an unsupported source number/i);
    assert.match(prompt, /Softening must be surgical/i);
    assert.match(prompt, /soften\/flag ONLY that unsupported element/i);
    assert.match(prompt, /KEEP those supported facts accurate/i);
    assert.match(prompt, /Never replace a supported specific figure with a vague magnitude/i);
    assert.match(prompt, /Supported facts stay unmarked and accurate/i);
    assert.match(prompt, /MOST specific characterisation the SOURCE supports/i);
    assert.match(prompt, /not maximum vagueness/i);
    assert.match(prompt, /natural, professional prose/i);
    assert.match(prompt, /Avoid clunky or mechanical hedges/i);
    assert.match(prompt, /natural paragraph structure/i);
    assert.match(prompt, /\{\{softened text\|\|short reviewer note\}\}/);
    assert.match(prompt, /Sentence-ending punctuation/);
    assert.match(prompt, /stays OUTSIDE the delimiter/);
    assert.match(prompt, /ENTIRE revised draft must comply/i);
    assert.match(prompt, /HOUSE STYLE RULES/);
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

    const withPunct = ensureMarkerSentenceTerminalPunctuation(parsed);
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
    assert.match(finalized.markers[0].note, /draft said - 40%/);

    const viaFinalize = finalizeSuggestRevisionText(raw);
    assert.deepEqual(viaFinalize, finalized);
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
    assert.match(markers[0].note, /draft stated 40% - confirm/);
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
