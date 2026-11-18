/**
 * B531. Harbourline verdicts.
 * A refused note is not an unexplained conflict.
 * A stale objection where the newest source agrees is light.
 * A dropped gross or net word is shown.
 * The NAV conflict stays a conflict.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { acceptNote, applyReadingContract } from "../lib/qc/reading-contract.mjs";
import { grossNetQualifierMissing, noteForCard } from "../lib/qc/reading-review.mjs";
import { resolveSupersession } from "../lib/qc/supersession.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/b530-harbourline-focus.json", import.meta.url), "utf8"));

function asCard(row, extra = {}) {
  return { ...row, statement: row.text, ...extra };
}

function accepted(raw, elements) {
  const note = {
    bucket: raw.bucket,
    text: raw.text || raw.note || "",
    completion: raw.completion,
    disputedIndices: raw.disputedIndices,
    disputedElements: raw.disputedElements,
    documentValues: raw.documentValues,
  };
  const result = acceptNote(note, elements, "");
  assert.equal(result.ok, true, result.reason || "note refused");
  return result.note;
}

test("s4 a none note that matches both documents is supported", () => {
  const stored = fixture.cards.s4;
  const raw = fixture.inputs.s4RawNote;
  const note = accepted(raw, []);
  assert.equal(note.bucket, "none");
  const matches = stored.matchExplanations.map((row) => (
    row.classification === "conflicting" ? { ...row, writtenFor: fixture.inputs.s4WrittenFor } : row
  ));
  const out = applyReadingContract(asCard(stored, { matchExplanations: matches }), {
    facts: [],
    note,
  });
  assert.equal(out.sentenceState, "nothing_raised");
  assert.equal(out.sentenceLabel, "Nothing raised");
  assert.notEqual(out.sentenceLabel, "Conflicts with the source");
  assert.equal(out.readingNote?.refused, undefined);
});

test("s5 the newest source agrees, so the stale objection is light", () => {
  const stored = fixture.cards.s5;
  const matches = stored.matchExplanations.map((row, index) => ({
    ...row,
    passage: fixture.inputs.s5Passages[index],
  }));
  const resolved = resolveSupersession({
    statement: stored.text,
    aggregateVerdict: "conflicting",
    sourceMatches: matches,
    asOfBySourceIndex: {},
    sources: fixture.inputs.sources,
  });
  assert.equal(resolved.verdictOverride, "partially_confirmed");
  assert.match(resolved.supersededNotes[0], /complet/i);
  assert.match(resolved.supersededNotes[0], /expected/i);
  const elements = stored.text.split(/\s+/).map((surface) => ({ surface }));
  const note = accepted(stored.readingNote, elements);
  assert.equal(note.disputedElements.includes("The"), false);
  const out = applyReadingContract(asCard(stored, {
    matchExplanations: matches,
    supersededSourceNotes: resolved.supersededNotes,
  }), {
    facts: [],
    note,
  });
  assert.equal(out.tier, "light");
  assert.notEqual(out.sentenceState, "conflicts");
  assert.notEqual(out.sentenceLabel, "Conflicts with the source");
  assert.match(out.displayedEvidenceProse, /complet/i);
  assert.match(out.displayedEvidenceProse, /expected/i);
});

test("s12 the NAV conflict stays a conflict", () => {
  const stored = fixture.cards.s12;
  const out = applyReadingContract(asCard(stored), {
    facts: [],
    note: stored.readingNote,
  });
  assert.equal(out.sentenceState, "conflicts");
  assert.equal(out.sentenceLabel, "Conflicts with the source");
  assert.equal(out.tier, "demands");
  assert.match(out.displayedEvidenceProse, /678/);
  assert.match(out.displayedEvidenceProse, /652/);
});

test("s13 a dropped net word is Needs a look", () => {
  const stored = fixture.cards.s13;
  const note = noteForCard(stored.text, stored.readingNote);
  assert.equal(note.escalate, "gross_net");
  const out = applyReadingContract(asCard(stored), {
    facts: [],
    note,
  });
  assert.equal(out.sentenceLabel, "Needs a look");
  assert.equal(out.sentenceState, "note_withheld");
  assert.equal(out.tier, "light");
  assert.equal(out.combinedVerdict.tone, "amber");
  assert.match(out.displayedEvidenceProse, /gross|net/i);
  assert.equal(out.complianceConcerns.length > 0, true);
  assert.equal(out.wordingNoteWithheld, undefined);
});

test("a red verdict with a null reason becomes amber", () => {
  const card = {
    statement: "The figure is 10.",
    displayVerdict: "conflict",
    displayVerdictReason: null,
    displayedEvidenceProse: null,
    readingNote: null,
    matchExplanations: [{ classification: "conflicting", writtenFor: "candidate" }],
  };
  const out = applyReadingContract(card, { facts: [], note: null });
  assert.equal(out.sentenceLabel, "Needs a look");
  assert.equal(out.combinedVerdict.tone, "amber");
  assert.equal(out.silences.some((row) => row.id === "conflict_without_reason_downgraded"), true);
  const explained = applyReadingContract({
    ...card,
    displayedEvidenceProse: "The source says 12 and the statement says 10.",
  }, { facts: [], note: { bucket: "conflicts", text: "The source says 12 and the statement says 10." } });
  assert.equal(explained.sentenceState, "conflicts");
});

test("a missing gross or net on a cited multiple is partial, and a bare multiple is not", () => {
  assert.equal(grossNetQualifierMissing("TVPI of 1.8x", "Net TVPI 1.8x"), true);
  assert.equal(grossNetQualifierMissing("TVPI of 1.8x", "TVPI 1.8x"), false);
  const escalated = noteForCard("TVPI of 1.8x", {
    bucket: "wording",
    text: "The source says Net TVPI 1.8x.",
    documentValues: [{ document: "report", value: "Net TVPI 1.8x" }],
  });
  assert.equal(escalated.escalate, "gross_net");
  const plain = noteForCard("TVPI of 1.8x", {
    bucket: "wording",
    text: "The source says TVPI 1.8x.",
    documentValues: [{ document: "report", value: "TVPI 1.8x" }],
  });
  assert.equal(plain.bucket, "wording");
  assert.equal(plain.escalate, undefined);
});
