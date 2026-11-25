/**
 * B598. Reasons checked against shown evidence, Rule B on refusedReading,
 * counts match displayed concerns, clean table-row passages.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { applyConflictProposal } from "../lib/revise-actions/conflict-engagement.mjs";
import { passageWithLineRef, cutLineEllipsis } from "../lib/export/passage-cut.mjs";
import {
  displayedComplianceConcerns,
  displayedEditorialConcerns,
  displayedHouseStyleConcerns,
} from "../lib/qc/review-summary.mjs";
import { PROTECTED_BRANCH_WHY } from "../lib/qc/b596-stamp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(ROOT, "fixtures/b598");

function load(name) {
  return JSON.parse(readFileSync(path.join(FIX, name), "utf8"));
}

test("Harbourline S8 goes green with no differ on", () => {
  const body = restampAnalyseResponse(load("harbourline-R-937B.json"));
  const card = body.statements[7].qcCard;
  assert.equal(card.sentenceLabel, "Nothing raised");
  assert.equal(card.combinedVerdict?.state, "nothing_raised");
  assert.doesNotMatch(card.shownReason || "", /differ on/i);
});

test("Harbourline S5 reason is one well-formed sentence, no differ on The", () => {
  const body = restampAnalyseResponse(load("harbourline-R-937B.json"));
  const card = body.statements[4].qcCard;
  assert.equal(card.sentenceLabel, "Needs a look");
  assert.doesNotMatch(card.shownReason || "", /differ on The/i);
  // B599: later-document completion is named (replaces the older "states" template).
  assert.match(card.shownReason || "", /^(The sentence (?:states|says)|The source)/);
  assert.match(card.shownReason || "", /\.$/);
  assert.match(card.shownReason || "", /complet/i);
});

test("Harbourline S12 stays red with the EUR 678 million proposal", () => {
  const body = restampAnalyseResponse(load("harbourline-R-937B.json"));
  const row = body.statements[11];
  const card = row.qcCard;
  assert.equal(card.sentenceLabel, "Conflicts with the source");
  assert.equal(card.combinedVerdict?.tone, "red");
  assert.match(card.shownReason || "", /EUR 678 million/);
  const out = applyConflictProposal({
    statement: row.text,
    primaryExcerpt: card.primaryExcerpt || card.primaryExcerptText,
    supportSpans: card.supportSpans || [{ text: card.primaryExcerpt }],
  });
  assert.match(out.proposal?.proposedChange || "", /EUR 678 million/);
});

test("Harbourline S13 stays amber and names net", () => {
  const body = restampAnalyseResponse(load("harbourline-R-937B.json"));
  const card = body.statements[12].qcCard;
  assert.equal(card.sentenceLabel, "Needs a look");
  assert.match(card.shownReason || "", /\bnet\b/i);
});

test("Aldermoor S3 goes green and S1 stays amber", () => {
  const body = restampAnalyseResponse(load("aldermoor-R-456E.json"));
  const s1 = body.statements[0].qcCard;
  const s3 = body.statements[2].qcCard;
  assert.equal(s3.sentenceLabel, "Nothing raised");
  assert.equal(s3.combinedVerdict?.state, "nothing_raised");
  assert.equal(s1.sentenceLabel, "Needs a look");
  assert.match(s1.shownReason || "", /recommend/i);
});

test("summary counts equal displayed concerns on all three fixtures", () => {
  for (const name of ["harbourline-R-937B.json", "aldermoor-R-456E.json", "patria-R-12AA.json"]) {
    const body = restampAnalyseResponse(load(name));
    const cards = body.statements.map((row) => row.qcCard);
    const summary = body.meta.reviewSummary;
    const editorialShown = cards.reduce((n, card) => n + displayedEditorialConcerns(card).length, 0);
    const complianceShown = cards.reduce((n, card) => n + displayedComplianceConcerns(card).length, 0);
    const houseShown = cards.reduce((n, card) => n + displayedHouseStyleConcerns(card).length, 0);
    assert.equal(summary.editorial?.concerns ?? 0, editorialShown, `${name} editorial`);
    assert.equal(summary.compliance?.concerns ?? 0, complianceShown, `${name} compliance`);
    assert.equal(summary.houseStyle?.concerns ?? 0, houseShown, `${name} houseStyle`);
  }
});

test("Harbourline S12 source line has no trailing ellipsis and a space before (line 48)", () => {
  const body = restampAnalyseResponse(load("harbourline-R-937B.json"));
  const card = body.statements[11].qcCard;
  const excerpt = String(card.primaryExcerptText || card.primaryExcerpt || "");
  // Prefer the NAV table row when present.
  const navLine = excerpt.split(/\n/).find((line) => /net asset value/i.test(line)) || excerpt;
  const cut = cutLineEllipsis(navLine.replace(/\s+/g, " ").trim(), "Next row");
  assert.doesNotMatch(cut, / …$/);
  const withRef = passageWithLineRef(navLine, ["L48"]);
  assert.match(withRef, / \(line 48\)$/);
  assert.doesNotMatch(withRef, /…\s*\(line/);
});

test("protected branches each have a why line", () => {
  for (const [branch, why] of Object.entries(PROTECTED_BRANCH_WHY)) {
    assert.ok(why && why.length > 10, branch);
  }
});
