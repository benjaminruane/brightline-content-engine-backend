/**
 * B275 D4. A planted document-level finding must land on the sentence
 * the quote lives in, never on a claimed index.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { attachDocumentFindings } from "../lib/qc/quote-locate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "tests/fixtures/planted-document-finding.json");

function loadPlanted() {
  return JSON.parse(readFileSync(FIXTURE, "utf8"));
}

describe("B275 quote-locate misattribution guard", () => {
  test("C2 planted sentences slice the draft on their stored offsets", () => {
    const planted = loadPlanted();
    for (const sentence of planted.sentences) {
      assert.equal(planted.draft.slice(sentence.charStart, sentence.charEnd), sentence.text);
    }
  });

  test("a first-person finding lands on sentence 1 and on no other", () => {
    const planted = loadPlanted();
    const voice = planted.findings.find((f) => f.id === "voice-on-sentence-1");
    const result = attachDocumentFindings({
      findings: [voice],
      sentences: planted.sentences,
      draftText: planted.draft,
    });
    assert.equal(result.attached.length, 1);
    assert.equal(result.attached[0].index, voice.correctIndex);
    assert.equal(result.attached[0].index, 1);
    assert.notEqual(result.attached[0].index, voice.claimedIndex);
    assert.equal(result.unplaced.length, 0);
  });

  test("a restatement finding lands on sentence 3, not on the thesis it restates", () => {
    const planted = loadPlanted();
    const restatement = planted.findings.find((f) => f.id === "materiality-on-sentence-3");
    const result = attachDocumentFindings({
      findings: [restatement],
      sentences: planted.sentences,
      draftText: planted.draft,
    });
    assert.equal(result.attached.length, 1);
    assert.equal(result.attached[0].index, restatement.correctIndex);
    assert.equal(result.attached[0].index, 3);
    assert.notEqual(result.attached[0].index, restatement.claimedIndex);
  });

  test("a quote that cannot be located is unplaced, never a guessed sentence", () => {
    const planted = loadPlanted();
    const missing = planted.findings.find((f) => f.id === "unplaceable-quote");
    const result = attachDocumentFindings({
      findings: [missing],
      sentences: planted.sentences,
      draftText: planted.draft,
    });
    assert.equal(result.attached.length, 0);
    assert.equal(result.unplaced.length, 1);
    assert.equal(result.unplaced[0].ruleId, "audience_calibration_jargon");
    assert.equal(result.unplaced[0].reason, "quote_not_found");
  });

  test("claimedIndex is ignored even when it is the only index the caller supplies", () => {
    const planted = loadPlanted();
    const result = attachDocumentFindings({
      findings: planted.findings,
      sentences: planted.sentences,
      draftText: planted.draft,
    });
    const attachedIndexes = result.attached.map((row) => row.index).sort((a, b) => a - b);
    assert.deepEqual(attachedIndexes, [1, 3]);
    assert.equal(
      result.attached.some((row) => row.index === 2),
      false
    );
  });
});
