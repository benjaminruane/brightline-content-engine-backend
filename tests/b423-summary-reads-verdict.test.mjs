import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { summariseReview } from "../lib/qc/review-summary.mjs";
import { summaryBulletsFromReview } from "../lib/qc/summary-bullets.mjs";
import { statementVerdict } from "../lib/qc/statement-verdict.mjs";

const OPTIONS = { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true };

test("statement verdict counts, and a card with none keeps the old class", () => {
  const counted = summariseReview([
    { statementVerdict: { state: "not_in_source" }, displayVerdict: "supported_full" },
    { statementVerdict: { state: "conflicts" }, displayVerdict: "supported_full" },
    { statementVerdict: { state: "beyond" }, displayVerdict: "supported_full" },
    { statementVerdict: { state: "nothing_raised" }, displayVerdict: "conflict" },
  ], OPTIONS);
  assert.deepEqual(counted.evidence, {
    confirmed: 0,
    partial: 0,
    beyond: 1,
    conflicting: 2,
    notSupported: 1,
    unbadged: 0,
  });

  const legacy = summariseReview([{ displayVerdict: "supported_partial" }], OPTIONS);
  assert.equal(legacy.evidence.partial, 1);
  assert.equal(legacy.evidence.confirmed, 0);
});

test("the clean HICL summary follows the statement verdict and does not say every claim is backed", () => {
  const review = JSON.parse(readFileSync(new URL("./fixtures/real-runs-2026-10-04-hicl/clean-review.json", import.meta.url), "utf8"));
  const reading = JSON.parse(readFileSync(new URL("../scripts/diagnostic/b403c/runs/reading.json", import.meta.url), "utf8"));
  const clean = reading.drafts.find((draft) => draft.doc === "HICL" && draft.arm === "clean");
  const byText = new Map(clean.statements.map((row) => [row.text, row]));
  const cards = review.statements.map((row) => {
    const card = row.qcCard;
    const stored = byText.get(card.statement);
    const facts = (stored?.notFound || []).map((surface) => ({ status: "not_found", surface: String(surface) }));
    if (facts.length === 0) facts.push({ status: "matched", surface: "" });
    const note = stored
      ? { bucket: stored.bucket || "none", text: stored.shownNote || "", refused: Boolean(stored.withheldText) && !stored.shownNote }
      : null;
    const verdict = statementVerdict({
      facts,
      note,
      entries: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
    });
    return { ...card, statementVerdict: verdict };
  });
  const summary = summariseReview(cards, review.meta.reviewOptions);
  assert.equal(summary.readiness, "Needs work");
  assert.notEqual(summary.readiness, "Ready");
  const bullets = summaryBulletsFromReview(summary);
  assert.equal(bullets.some((line) => line.includes("All claims are backed by sources")), false);
  assert.ok(summary.evidence.notSupported > 0);
});
