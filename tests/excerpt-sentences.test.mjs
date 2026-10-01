/**
 * B359 Part 3. A displayed quote is whole sentences. Never mid-word,
 * mid-figure, or mid-sentence. One long sentence is shown in full.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { splitSentences } from "../lib/qc/card-honesty.mjs";
import { trimExcerptToSentences, MAX_QUOTE_SENTENCES } from "../lib/qc/excerpt-sentences.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts, trimExcerptTo300 } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));
const DOC = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "doc-review.json"), "utf8"));

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

const silentFramingJudge = async () => ({
  fire: false,
  evaluativePhrase: "",
  sourceStance: "",
  note: "",
  reason: "",
});

function excerptText(card) {
  const p = card.primaryExcerpt;
  if (p == null) return null;
  if (typeof p === "string") return p;
  if (typeof p.passage === "string") return p.passage;
  return null;
}

function supportStateToVerdict(supportState) {
  if (supportState === "supported") return "confirmed";
  if (supportState === "partial") return "partially_confirmed";
  if (supportState === "conflicting") return "conflicting";
  if (supportState === "skipped") return "not_reviewed";
  return "not_supported";
}

function excerptPointer(card, sources) {
  const label = card.primaryRefTitle || sources[0]?.label || sources[0]?.name || "";
  const p = card.primaryExcerpt;
  if (p == null) return null;
  if (typeof p === "string") return { passage: p, sourceLabel: label };
  if (typeof p.passage === "string") return { passage: p.passage, sourceLabel: p.sourceLabel || label };
  return null;
}

function matchesFromCard(card, sources) {
  const label = sources[0]?.label || sources[0]?.name || "";
  const fps = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  const pointer = excerptPointer(card, sources);
  if (fps.length > 0) {
    return fps.map((fp) => ({
      sourceIndex: Number.isFinite(fp.sourceIndex) ? fp.sourceIndex : 0,
      sourceLabel: fp.sourceLabel || label,
      classification: fp.classification,
      passage: pointer?.passage || "",
    }));
  }
  return [];
}

async function replayCard(payload, index) {
  const card = payload.statements[index].qcCard;
  const sources = payload.sources;
  const verdict = supportStateToVerdict(card.supportState);
  const sourceMatches = matchesFromCard(card, sources);
  const excerpts = selectExcerpts({
    statementMatches: sourceMatches,
    verdict,
    hasConflict: card.hasConflict === true,
    supportSpans: card.supportSpans,
    sources,
    statementText: card.statement,
  });
  return assembleCard(
    {
      statementText: card.statement,
      startChar: card.charStart,
      endChar: card.charEnd,
      supportSpans: card.supportSpans,
      sourceMatches,
      verdictResult: {
        verdict,
        hasConflict: card.hasConflict === true,
        confirmingMatches: [{ sourceIndex: 0, sourceLabel: sources[0]?.label || sources[0]?.name }],
        contributingSourceIndices: [0],
      },
      excerptResult: excerpts,
      commentaryResult: { commentary: card.evidenceSummary || "" },
      editorialResult: {
        editorialVerdict: card.editorialVerdict,
        editorialConcerns: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
        complianceVerdict: card.complianceVerdict,
        complianceConcerns: Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [],
      },
    },
    index,
    {
      pipelineRoute: "v4",
      sources,
      reviewOptions: REVIEWS_ON,
      skipEditorialDuplicationJudge: true,
      framingFidelityJudge: silentFramingJudge,
      today: new Date("2026-09-29T00:00:00.000Z"),
    }
  );
}

function quoteIsWholeSentences(shown) {
  const t = String(shown || "").trim();
  if (!t) return true;
  assert.equal(/\.{3}[A-Za-z0-9€£$]/.test(t), false, `ellipsis glued mid-token: ${t.slice(0, 80)}`);
  assert.equal(/[A-Za-z0-9€£$]\.{3}/.test(t), false, `ellipsis glued after token: ${t.slice(-80)}`);
  const stripped = t.replace(/^\.\.\.\s*/, "").replace(/\s*\.\.\.$/, "").trim();
  const sentences = splitSentences(stripped);
  assert.equal(sentences.length >= 1, true);
  const rejoined = sentences.join("");
  assert.equal(rejoined.trim(), stripped);
}

describe("B359 sentence quotes", () => {
  test("no quote on either payload starts or ends mid-word or mid-figure", async () => {
    for (const payload of [CLEAN, DOC]) {
      for (let i = 0; i < payload.statements.length; i += 1) {
        const card = await replayCard(payload, i);
        const shown = excerptText(card);
        if (!shown) continue;
        quoteIsWholeSentences(shown);
      }
    }
  }, 30000);

  test("B358 must-pass still holds", async () => {
    const s9 = await replayCard(CLEAN, 9);
    assert.match(excerptText(s9), /redeployed to acquire a/);
    assert.match(excerptText(s9), /62\.3%/);
    const s6 = await replayCard(CLEAN, 6);
    assert.match(excerptText(s6), /capital restructuring/);
    const s8 = await replayCard(CLEAN, 8);
    assert.match(excerptText(s8), /capital restructuring/);
    const s5 = await replayCard(CLEAN, 5);
    assert.match(excerptText(s5), /6\.3%/);
    const s5doc = await replayCard(DOC, 5);
    assert.match(excerptText(s5doc), /6\.3%/);
  }, 20000);

  test("a passage that is one long sentence is shown in full", () => {
    const long =
      "The vehicle acquired a further 2.2% stake in Action raising the holding to 62.3% after a capital restructuring that redeployed proceeds across the portfolio without a second full stop anywhere in this line";
    assert.equal(splitSentences(long).length, 1);
    assert.equal(long.length > 180, true);
    const trimmed = trimExcerptToSentences(long, "2.2% stake 62.3%");
    assert.equal(trimmed, long);
    assert.equal(trimmed.includes("..."), false);
  });

  test("dropped sentences are marked and must-keep figures stay", () => {
    const sentences = [];
    for (let i = 0; i < 8; i += 1) {
      sentences.push(`Filler clause number ${i} about weather and gardens.`);
    }
    sentences[3] = "The firm redeployed proceeds to acquire a further 2.2% stake.";
    sentences[4] = "Ownership rose to 62.3% as a result of this transaction.";
    const passage = sentences.join(" ");
    const trimmed = trimExcerptToSentences(passage, "redeployed to acquire a 2.2% 62.3%");
    assert.match(trimmed, /2\.2%/);
    assert.match(trimmed, /62\.3%/);
    assert.match(trimmed, /redeployed proceeds to acquire a/);
    assert.equal(trimmed.startsWith("... ") || trimmed.endsWith(" ...") || splitSentences(trimmed.replace(/^\.\.\.\s*/, "").replace(/\s*\.\.\.$/, "")).length <= MAX_QUOTE_SENTENCES, true);
    quoteIsWholeSentences(trimmed);
  });

  test("no recorded non-empty quote is lost on replay of either payload", async () => {
    for (const payload of [CLEAN, DOC]) {
      for (let i = 0; i < payload.statements.length; i += 1) {
        const before = excerptText(payload.statements[i].qcCard);
        if (!before || !String(before).trim()) continue;
        const after = excerptText(await replayCard(payload, i));
        assert.ok(after && String(after).trim(), `S${i} lost its quote`);
      }
    }
  }, 30000);

  test("trimExcerptTo300 is the sentence wrapper", () => {
    const span = CLEAN.statements[5].qcCard.supportSpans[0].passage;
    const a = trimExcerptTo300(span, CLEAN.statements[5].text);
    const b = trimExcerptToSentences(span, CLEAN.statements[5].text);
    assert.equal(a, b);
    assert.match(a, /6\.3%/);
  });
});
