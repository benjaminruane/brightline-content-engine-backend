/**
 * B504. A revision card shows its sentence. A period rewrite and a figure-pair
 * class change are recorded on the card. No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/assemble-card.mjs";
import { figurePairSilences, demoteConfirmedClassifications } from "../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { normalizeValidResponse } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { readerEvidenceSentence as screenSentence } from "../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function card23() {
  const doc = JSON.parse(readFileSync(path.join(__dirname, "../scripts/diagnostic/b503/pass-1.json"), "utf8"));
  const card = doc.cards.find((row) => String(row.fixtureId).padStart(2, "0") === "23" && Number(row.index) === 2);
  if (!card) throw new Error("b504: 23:2 is missing from the stored pass");
  return card;
}

describe("B504 revision reason", () => {
  test("23:2 shows the revision sentence, and the screen uses the same sentence", () => {
    const card = card23();
    const reason = readerEvidenceSentence(card);
    assert.equal(reason.length > 0, true);
    assert.equal(screenSentence(card), reason);
    assert.match(reason, /CRF_IC_memo/);
    assert.match(reason, /CRF_diligence_update/);
    assert.match(reason, /1\.2 GW/);
    assert.match(reason, /1\.4 GW/);
  });
});

describe("B504 recorded changes", () => {
  test("a period rewrite keeps the earlier explanation and class", () => {
    const source = "Revenue for FY2025 was GBP 312 million.";
    const normalized = normalizeValidResponse(
      {
        classification: "confirmed",
        passage: source,
        explanation: "Revenue matches.",
        periodAssessment: {
          statementPeriod: "FY2024",
          sourcePeriod: "FY2025",
          statementPeriodRole: "figure_period",
          sourcePeriodRole: "figure_period",
        },
      },
      source,
      { sourceLabel: "memo", statementText: "Revenue for FY2024 was GBP 312 million." }
    );
    assert.equal(normalized.classification, "no_support");
    assert.equal(Array.isArray(normalized.rewrites), true);
    assert.equal(normalized.rewrites.length, 1);
    const row = normalized.rewrites[0];
    assert.equal(row.rule, "period_non_overlap");
    assert.equal(row.before.classification, "confirmed");
    assert.equal(row.before.explanation, "Revenue matches.");
    assert.equal(row.after.classification, "no_support");
    assert.match(row.after.explanation, /FY2024/);
    assert.match(row.after.explanation, /FY2025/);
  });

  test("a figure-pair class change is a silence with the passage and both classes", async () => {
    const statement = "Like-for-like sales growth reached 12% for the period.";
    const passage = "Like-for-like sales growth reached 9% for the period.";
    const demoted = demoteConfirmedClassifications({
      statementText: statement,
      sourceMatches: [{ sourceIndex: 0, classification: "confirmed", passage, explanation: "The figures match." }],
      supportSpans: [],
    });
    const silences = figurePairSilences(demoted.sourceMatches[0]);
    assert.equal(silences.length, 1);
    assert.equal(silences[0].id, "figure_pair");
    assert.equal(silences[0].reason, "confirmed to conflicting");
    assert.deepEqual(silences[0].content, [passage]);

    const card = await assembleCard(
      {
        statementText: statement,
        startChar: 0,
        endChar: statement.length,
        sourceMatches: [{
          ...demoted.sourceMatches[0],
          sourceLabel: "memo",
          rewrites: [{
            rule: "period_non_overlap",
            before: { classification: "confirmed", explanation: "Revenue matches." },
            after: { classification: "no_support", explanation: "The source covers FY2025 while the statement claims FY2024." },
          }],
        }],
        verdictResult: { verdict: "conflicting", hasConflict: true, contributingSourceIndices: [0] },
        excerptResult: { primaryExcerpt: { passage, sourceLabel: "memo" } },
        supportSpans: [],
        editorialResult: {
          editorialVerdict: "clean",
          editorialConcerns: [],
          complianceVerdict: "clean",
          complianceConcerns: [],
        },
      },
      0,
      {
        pipelineRoute: "v4",
        skipEditorialDuplicationJudge: true,
        reviewOptions: { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true },
        sources: [{ text: passage, label: "memo" }],
      }
    );
    assert.equal(card.rewrites.length, 1);
    assert.equal(card.rewrites[0].rule, "period_non_overlap");
    assert.equal(card.rewrites[0].before.explanation, "Revenue matches.");
    const onCard = card.silences.find((row) => row.id === "figure_pair");
    assert.equal(onCard.reason, "confirmed to conflicting");
    assert.deepEqual(onCard.content, [passage]);
  });
});
