/**
 * B275. Document-level editorial call, quote-locate merge, Layer C without the draft.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test, vi } from "vitest";
import { fileURLToPath } from "node:url";
import editorialRules from "../lib/rulebook/editorialRules.js";
import * as observability from "../lib/observability.js";
import {
  DOCUMENT_LEVEL_EDITORIAL_RULE_IDS,
  attachedByIndex,
  documentLevelEditorialRules,
  mergeDocumentLevelConcerns,
  runDocumentLevelReview,
  sentenceLocalEditorialRules,
} from "../lib/qc/document-level-review.mjs";
import { attachDocumentFindings } from "../lib/qc/quote-locate.mjs";
import {
  buildEditorialStyleSystemPrompt,
  buildEditorialStyleUserPayload,
} from "../lib/qc/editorial-compliance-reviewer.mjs";
import { OUTPUT_TYPE, VISIBILITY, getOutputTypeLabel } from "../lib/output-intent.js";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";
import { STAGE6_CONCURRENCY } from "../lib/qc/pipeline-v4/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLANTED = path.join(ROOT, "tests/fixtures/planted-document-finding.json");
const SHOPIFY = path.join(ROOT, "tests/fixtures/b247/shopify-messy-full-after.json");

function emptyCard() {
  return {
    editorialVerdict: "clean",
    editorialConcerns: [],
    editorialNote: "No editorial or style concerns identified under the listed rules.",
    editorialSuggestedDirection: null,
    editorialSuggestedRewrite: null,
  };
}

describe("B275 document-level editorial review", () => {
  test("C3 document-level rules are materiality, first-use jargon, and voice throughout", () => {
    assert.deepEqual(DOCUMENT_LEVEL_EDITORIAL_RULE_IDS, [
      "materiality",
      "audience_calibration_jargon",
      "voice_consistency",
    ]);
    const local = sentenceLocalEditorialRules(editorialRules).map((r) => r.id);
    assert.equal(local.includes("narrative_coherence"), true);
    assert.equal(local.includes("materiality"), false);
    assert.equal(local.includes("voice_consistency"), false);
    assert.equal(documentLevelEditorialRules(editorialRules).map((r) => r.id).includes("narrative_coherence"), false);
  });

  test("D7 production Stage 6 pool stays 4 because this slice did not ship", () => {
    assert.equal(STAGE6_CONCURRENCY, 4);
  });

  test("production Layer C payload still carries FULL DRAFT (B275 did not ship the drop)", () => {
    const production = buildEditorialStyleUserPayload({
      sentenceText: "Revenue grew.",
      outputTypeLabel: getOutputTypeLabel(OUTPUT_TYPE.REPORTING_COMMENTARY),
      requiredVersion: VISIBILITY.COMPLETE,
      draftText: "The thesis is growth. Revenue grew. Costs fell.",
      evidenceExcerpt: null,
      contextBefore: "The thesis is growth.",
      contextAfter: "Costs fell.",
      evidenceBlock: null,
      authoringOrganisation: "Halden Group",
    });
    assert.equal(production.includes("FULL DRAFT"), true);
    assert.equal(production.includes("CONTEXT BEFORE"), true);
  });

  test("Layer C system prompt with local rules does not list the three document-level ids", () => {
    const prompt = buildEditorialStyleSystemPrompt({
      outputTypeLabel: getOutputTypeLabel(OUTPUT_TYPE.REPORTING_COMMENTARY),
      editorialRules: sentenceLocalEditorialRules(editorialRules),
      structuredStyleRules: resolveStyleGuide({
        outputType: OUTPUT_TYPE.REPORTING_COMMENTARY,
        promptHouseName: "Halden Group",
      }),
      outputSlug: "reporting_commentary",
      outputType: OUTPUT_TYPE.REPORTING_COMMENTARY,
      houseName: "Halden Group",
    });
    assert.equal(/\n\d+\. materiality:/.test(prompt), false);
    assert.equal(/\n\d+\. audience_calibration_jargon:/.test(prompt), false);
    assert.equal(/\n\d+\. voice_consistency:/.test(prompt), false);
    assert.equal(/\n\d+\. narrative_coherence:/.test(prompt), true);
  });

  test("a failed document-level call is not_reviewed, never a silent clean", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockImplementation(async () => {
      throw new Error("429 Rate limit");
    });
    const planted = JSON.parse(readFileSync(PLANTED, "utf8"));
    const result = await runDocumentLevelReview({
      draftText: planted.draft,
      sentences: planted.sentences,
      outputType: "reporting_commentary",
      requiredVersion: "complete",
      authoringOrganisation: "Halden Group",
    });
    assert.equal(result.status, "not_reviewed");
    assert.equal(result.attachedCount, 0);
    assert.notEqual(result.status, "reviewed");
    vi.restoreAllMocks();
  });

  test("a malformed document-level response is not_reviewed", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "not json" });
    const planted = JSON.parse(readFileSync(PLANTED, "utf8"));
    const result = await runDocumentLevelReview({
      draftText: planted.draft,
      sentences: planted.sentences,
      outputType: "reporting_commentary",
      requiredVersion: "complete",
    });
    assert.equal(result.status, "not_reviewed");
    assert.equal(result.reason, "malformed");
    vi.restoreAllMocks();
  });

  test("merge attaches a located finding onto that sentence only", () => {
    const planted = JSON.parse(readFileSync(PLANTED, "utf8"));
    const voice = planted.findings.find((f) => f.id === "voice-on-sentence-1");
    const bound = attachDocumentFindings({
      findings: [voice],
      sentences: planted.sentences,
      draftText: planted.draft,
    });
    const cards = planted.sentences.map(() => emptyCard());
    const byIndex = attachedByIndex(bound.attached);
    planted.sentences.forEach((sentence, i) => {
      mergeDocumentLevelConcerns(cards[i], byIndex.get(sentence.index));
    });
    assert.equal(cards[1].editorialVerdict, "concern");
    assert.equal(cards[1].editorialConcerns[0].concernCode, "voice_consistency");
    assert.equal(cards[1].editorialConcerns[0].source, "document_level");
    assert.equal(cards[0].editorialVerdict, "clean");
    assert.equal(cards[2].editorialVerdict, "clean");
    assert.equal(cards[3].editorialVerdict, "clean");
  });

  test("recorded Shopify materiality quotes locate back onto the same card", () => {
    const payload = JSON.parse(readFileSync(SHOPIFY, "utf8"));
    const statements = payload.statements.map((s, i) => ({
      index: Number.isFinite(s.qcCard?.index) ? s.qcCard.index : i,
      text: s.text,
      charStart: s.qcCard?.charStart,
      charEnd: s.qcCard?.charEnd,
    }));
    const materialityCards = payload.statements.filter((s) =>
      (s.qcCard?.editorialConcerns || []).some((c) => c.concernCode === "materiality")
    );
    assert.equal(materialityCards.length > 0, true);
    for (const row of materialityCards.slice(0, 8)) {
      const index = row.qcCard.index;
      const quote = row.text.slice(0, Math.min(48, row.text.length));
      const bound = attachDocumentFindings({
        findings: [
          {
            ruleId: "materiality",
            quote,
            note: "Recorded-state locate check.",
            suggestedDirection: `Keep the quote '${quote}' on this sentence.`,
          },
        ],
        sentences: statements,
        draftText: payload._auditDraft,
      });
      assert.equal(bound.attached.length, 1, `index ${index} quote did not locate`);
      assert.equal(bound.attached[0].index, index);
    }
  });
});
