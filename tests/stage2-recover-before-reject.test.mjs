/**
 * B352 Part 3. A rejected quote gets one forgiving look before it is binned.
 * Strings from tests/fixtures/real-runs-2026-09-29/. No paraphrases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { recoverExcerptFromSource } from "../lib/qc/excerpt-from-source.mjs";
import {
  applyEmptyConfirmationRefusal,
  normalizeValidResponse,
  resolvePassageAgainstSource,
  validatePassageAgainstSource,
} from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));
const SOURCE = CLEAN.sources[0].text;

const REAL_SENTENCE = "The sales\nachieved sterling money multiples of 3.2x and 2.8x respectively.";
const NEAR_MISS = "The sales recorded sterling money multiples of 3.2x and 2.8x respectively.";
const INVENTED = "The quantum flux capacitor yielded 9.9x on Mars during the period.";

describe("B352 recover before reject", () => {
  test("T9 a near miss one word changed from a real source sentence is recovered and the classification survives", () => {
    assert.equal(SOURCE.includes(REAL_SENTENCE), true);
    const strict = validatePassageAgainstSource(NEAR_MISS, SOURCE);
    assert.equal(strict.accepted, false);

    const resolved = resolvePassageAgainstSource(NEAR_MISS, SOURCE);
    assert.equal(resolved.passageRejected, false);
    assert.equal(resolved.passageRecovered, true);
    assert.match(resolved.passage.replace(/\s+/g, " "), /sterling money multiples of 3\.2x and 2\.8x/);

    const normalized = normalizeValidResponse(
      { classification: "confirmed", passage: NEAR_MISS, explanation: "Matches the source." },
      SOURCE,
      { sourceLabel: "3i-hy25-highlights.pdf", statementText: CLEAN.statements[10].qcCard.statement }
    );
    assert.equal(normalized.classification, "confirmed");
    assert.equal(normalized.passageRejected, false);
    assert.equal(normalized.passageRecovered, true);
    assert.equal(normalized.emptyConfirmationRefused, false);
    assert.ok(normalized.passage.trim());
  });

  test("T10 an invented sentence that appears nowhere in the source is still rejected", () => {
    const resolved = resolvePassageAgainstSource(INVENTED, SOURCE);
    assert.equal(resolved.passageRejected, true);
    assert.equal(resolved.passageRecovered, false);
    assert.equal(resolved.passage, "");

    const normalized = normalizeValidResponse(
      { classification: "partially_confirmed", passage: INVENTED, explanation: "Not in the source." },
      SOURCE,
      { sourceLabel: "3i-hy25-highlights.pdf" }
    );
    assert.equal(normalized.classification, "partially_confirmed");
    assert.equal(normalized.passageRejected, true);
    assert.equal(normalized.passage, "");
  });

  test("T11 a recovery that would drop a figure is refused", () => {
    const pointer = "The company raised EUR 95 million in 2024.";
    const source = "The company raised EUR 59 million in 2024. Operations continued as planned.";
    const recovered = recoverExcerptFromSource({ pointer, sourceText: source });
    assert.equal(recovered.miss, true);
    assert.equal(recovered.reason, "figures_guard");

    const resolved = resolvePassageAgainstSource(pointer, source);
    assert.equal(resolved.passageRejected, true);
    assert.equal(resolved.passageRecovered, false);
    assert.equal(resolved.passage, "");

    const normalized = normalizeValidResponse(
      { classification: "confirmed", passage: pointer, explanation: "A number." },
      source,
      { sourceLabel: "memo", statementText: pointer }
    );
    assert.equal(normalized.passageRejected, true);
    assert.equal(normalized.classification, "not_reviewed");
    assert.equal(normalized.emptyConfirmationRefused, true);
  });

  test("T12 S10 from the clean fixture: the original pointer is not recoverable", () => {
    const card = CLEAN.statements[10].qcCard;
    assert.equal(card.supportSpans[0].passage, "");
    assert.equal(card.supportSpans[0].start, null);
    assert.equal(card.supportSpans[0].end, null);
    assert.equal(card.primaryExcerpt == null || card.primaryExcerpt === "", true);

    const resolved = resolvePassageAgainstSource(card.supportSpans[0].passage, SOURCE);
    assert.equal(resolved.passageRecovered, false);
    assert.equal(resolved.passageRejected, false);

    const refused = applyEmptyConfirmationRefusal({
      classification: "confirmed",
      passage: card.supportSpans[0].passage,
      sourceLabel: "3i-hy25-highlights.pdf",
    });
    assert.equal(refused.classification, "not_reviewed");
    assert.equal(refused.emptyConfirmationRefused, true);
  });
});
