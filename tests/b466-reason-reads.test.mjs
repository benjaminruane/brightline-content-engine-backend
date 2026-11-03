/**
 * B466. A partial reason is joined only when the card has none.
 * The difference is its own sentence. The finding does not repeat it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { cardEvidenceFindings } from "../lib/qc/evidence-findings.mjs";
import { PARTIAL_UNRECORDED } from "../lib/qc/partial-sentence.mjs";
import { partialReason, reasonFault, sentenceCount } from "../lib/qc/partial-reason.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { assertsAgreement } from "../lib/qc/source-account.mjs";
import { endorsementHit } from "../lib/qc/endorsement-phrases.mjs";
import { maskVerbatimQuotes, sourceCorpus } from "../lib/qc/quoted-span.mjs";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b464/pass-1.json"),
  "utf8",
));

function cardOf(key) {
  const [fixtureId, index] = key.split(":");
  const card = pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === fixtureId && row.index === Number(index));
  if (!card) throw new Error(`missing ${key}`);
  return card;
}

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

test("08:10 is two sentences and the difference no longer starts with but", () => {
  const card = cardOf("08:10");
  const reason = partialReason(card);
  assert.match(reason, /five years\. The source does not specifically attribute this growth/);
  assert.equal(reason.includes(". but"), false);
  assert.equal(sentenceCount(reason) <= 3, true);
  assert.equal(reasonFault(reason), "");
});

test("a card that already had a reason keeps that reason", () => {
  const card = cardOf("05:7");
  const stored = clean(card.displayedEvidenceProse);
  assert.notEqual(stored, PARTIAL_UNRECORDED);
  assert.equal(readerEvidenceSentence(card), stored);
});

test("14:3 and 18:9 keep the unrecorded line once", () => {
  for (const key of ["14:3", "18:9"]) {
    const card = cardOf(key);
    assert.equal(readerEvidenceSentence(card), PARTIAL_UNRECORDED);
    const notes = cardEvidenceFindings(card, []).filter((row) => row.rule === "partial").map((row) => row.note);
    assert.equal(notes.includes(PARTIAL_UNRECORDED), false);
    assert.equal(notes.length > 0, true);
  }
});

test("on the stored pass only a missing reason changes, and every reason reads", () => {
  const changed = [];
  const withheld = [];
  const disagreement = [];
  const DISAGREEMENT = new Set(["01:0", "18:8", "19:7"]);
  let unrecorded = 0;
  for (const card of pass.cards) {
    const stored = clean(card.displayedEvidenceProse);
    const reason = clean(readerEvidenceSentence(card) || "");
    const key = `${String(card.fixtureId).padStart(2, "0")}:${card.index}`;
    if (stored && stored !== PARTIAL_UNRECORDED && assertsAgreement(stored)) {
      assert.equal(assertsAgreement(reason), false, key);
      assert.notEqual(reason, "");
      withheld.push(key);
    } else if (stored && stored !== PARTIAL_UNRECORDED && DISAGREEMENT.has(key)) {
      assert.notEqual(reason, stored, key);
      disagreement.push(key);
    } else if (stored && stored !== PARTIAL_UNRECORDED) assert.equal(reason, stored, key);
    else if (reason !== stored) {
      changed.push(`${String(card.fixtureId).padStart(2, "0")}:${card.index}`);
    }
    if (reason === PARTIAL_UNRECORDED) unrecorded += 1;
    if (!reason) continue;
    assert.equal(reasonFault(reason), "", `${card.fixtureId}:${card.index}`);
    if (reason !== PARTIAL_UNRECORDED) {
      assert.equal(endorsementHit(maskVerbatimQuotes(reason, sourceCorpus(card))), null);
    }
    const findings = cardEvidenceFindings(card, []);
    for (const row of findings) {
      if (row.rule !== "partial") continue;
      assert.notEqual(clean(row.note), reason);
      assert.notEqual(row.note, PARTIAL_UNRECORDED);
    }
    const partial = card.displayVerdict === "supported_partial"
      || card.supportState === "partial"
      || card.sentenceState === "partial";
    if (partial) assert.equal(findings.some((row) => row.rule === "partial"), true);
  }
  changed.sort((a, b) => {
    const [af, ai] = a.split(":").map(Number);
    const [bf, bi] = b.split(":").map(Number);
    return af - bf || ai - bi;
  });
  assert.deepEqual(changed, ["04:12", "04:13", "08:10", "08:12", "14:4", "15:9", "15:30", "18:6"]);
  withheld.sort();
  assert.deepEqual(withheld, ["08:3", "14:2"]);
  disagreement.sort();
  assert.deepEqual(disagreement, ["01:0", "18:8", "19:7"]);
  assert.equal(unrecorded <= 2, true);
});
