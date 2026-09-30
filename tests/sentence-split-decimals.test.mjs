/**
 * B355 Part 2. A decimal point is not the end of a sentence.
 * Input is the recorded comment for statement 9 of
 * tests/fixtures/real-runs-2026-09-29/clean-review.json.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  applyOmissionConflictInvariant,
  splitSentences,
  stripContrastiveOnConfirmingSentences,
} from "../lib/qc/card-honesty.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLEAN = JSON.parse(
  readFileSync(path.join(ROOT, "tests/fixtures/real-runs-2026-09-29/clean-review.json"), "utf8")
);

const S9_COMMENT = CLEAN.statements[9].qcCard.evidenceSummary;
const S9_SPANS = CLEAN.statements[9].qcCard.supportSpans;

const CONTROL_NO_DECIMALS =
  "The source confirms the statement. However, the source confirms the figure. Extra sentence here.";
const CONTROL_STRIPPED_TODAY =
  "The source confirms the statement. The source confirms the figure. Extra sentence here.";

function legacySplit(raw) {
  const out = [];
  String(raw || "").replace(/[^.!?]+[.!?]+|[^.!?]+$/g, (sentence) => {
    out.push(sentence);
    return sentence;
  });
  return out;
}

function legacyStripContrastive(commentary) {
  const CONTRASTIVE_LEAD = /^(however|but|nevertheless|yet)\b[,:\s]*/i;
  function sentenceConfirms(text) {
    const t = String(text || "");
    if (!t.trim()) return false;
    if (/\bdoes not\b/i.test(t) && !/\bconfirm(?:s|ed|ing)\b/i.test(t)) return false;
    return /\b(confirm(?:s|ed|ing)?|aligns with|verifies|matches)\b/i.test(t);
  }
  const raw = String(commentary || "");
  if (!raw.trim()) return raw;
  return raw.replace(/[^.!?]+[.!?]+|[^.!?]+$/g, (sentence) => {
    const trimmed = sentence.replace(/^\s+/, "");
    const lead = trimmed.match(CONTRASTIVE_LEAD);
    if (!lead) return sentence;
    const rest = trimmed.slice(lead[0].length);
    if (!sentenceConfirms(rest)) return sentence;
    const indent = sentence.match(/^\s*/)[0];
    const restStart = rest.charAt(0);
    const recased = restStart && /[a-z]/.test(restStart) ? restStart.toUpperCase() + rest.slice(1) : rest;
    return `${indent}${recased}`;
  });
}

describe("B355 sentence split does not cut at decimals", () => {
  test("S9 omission drop keeps the 62.3% sentence whole", () => {
    assert.match(S9_COMMENT, /an earlier 2\.2% stake/);
    const result = applyOmissionConflictInvariant({
      commentary: S9_COMMENT,
      spans: S9_SPANS,
      supportState: "conflicting",
      hasConflict: true,
      displayVerdict: "conflict",
    });
    assert.equal(result.applied, true);
    assert.equal(result.commentary.endsWith("and the resulting 62.3% total stake."), true);
    const sentences = splitSentences(result.commentary);
    for (const s of sentences) {
      assert.equal(/^\d+%/.test(s.trim()), false);
      assert.equal(s.trim().startsWith("2% stake"), false);
    }
    assert.equal(/\bdoes not mention\b/i.test(result.commentary), false);
    assert.equal(/\bthe conflict arises\b/i.test(result.commentary), false);
    assert.equal(/\breviewer should (?:verify|reconcile|adjust)\b/i.test(result.commentary), false);
  });

  test("S9 splitSentences never begins a sentence with a digit percent", () => {
    const sentences = splitSentences(S9_COMMENT);
    assert.equal(sentences.join(""), S9_COMMENT);
    for (const s of sentences) {
      assert.equal(/^\d+%/.test(s.trim()), false);
    }
    assert.equal(sentences.some((s) => s.trim().startsWith("2% stake")), false);
  });

  test("the three removal phrases still remove their whole sentences", () => {
    const commentary =
      "The source confirms the 2.2% stake. The conflict arises because the source does not mention GIC. The reviewer should verify the details. The reviewer should reconcile the claim. The reviewer should adjust the wording.";
    const result = applyOmissionConflictInvariant({
      commentary,
      spans: [{ passage: "In September 2025, 3i acquired 2.2% of Action equity from GIC" }],
      supportState: "conflicting",
      hasConflict: true,
      displayVerdict: "conflict",
    });
    assert.equal(result.applied, true);
    assert.equal(result.commentary, "The source confirms the 2.2% stake.");
  });

  test("a control with no decimals is byte-identical to today's output", () => {
    assert.deepEqual(splitSentences(CONTROL_NO_DECIMALS), legacySplit(CONTROL_NO_DECIMALS));
    assert.equal(splitSentences(CONTROL_NO_DECIMALS).join(""), CONTROL_NO_DECIMALS);
    const stripped = stripContrastiveOnConfirmingSentences(CONTROL_NO_DECIMALS);
    assert.equal(stripped, CONTROL_STRIPPED_TODAY);
    assert.equal(stripped, legacyStripContrastive(CONTROL_NO_DECIMALS));
  });

  test("stripContrastiveOnConfirmingSentences keeps decimals whole", () => {
    const stripped = stripContrastiveOnConfirmingSentences(S9_COMMENT);
    assert.match(stripped, /the resulting 62\.3% total stake\./);
    for (const s of splitSentences(stripped)) {
      assert.equal(/^\d+%/.test(s.trim()), false);
      assert.equal(s.trim().startsWith("2% stake"), false);
    }
    assert.equal(/\bHowever, the source indicates/.test(stripped), false);
  });
});
