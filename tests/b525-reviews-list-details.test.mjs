/**
 * B525. The texts list returns an excerpt, the output type, the source count,
 * and the last completed review, read from the snapshot fields in SQL.
 * A missing value is null. The query does not select the state column.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { LIST_REVIEWS_SQL, draftExcerpt, listAccountReviews } from "../lib/db/accounts.mjs";

test("the excerpt keeps a whole word and stops at 160 characters", () => {
  assert.equal(draftExcerpt(""), null);
  assert.equal(draftExcerpt("   "), null);
  assert.equal(draftExcerpt(null), null);
  assert.equal(draftExcerpt("  A short note.  "), "A short note.");
  assert.equal(draftExcerpt("x".repeat(160)), "x".repeat(160));
  assert.equal(draftExcerpt("x".repeat(161)), `${"x".repeat(160)}...`);

  const words = Array.from({ length: 50 }, (_, index) => `word${index}`).join(" ");
  const excerpt = draftExcerpt(words);
  assert.equal(excerpt.endsWith("..."), true);
  assert.equal(excerpt.slice(0, -3).endsWith(" "), false);
  assert.equal(/\s/.test(excerpt.slice(0, -3).slice(-1)), false);
  assert.equal(excerpt.slice(0, -3).length <= 160, true);
  assert.equal(words.startsWith(excerpt.slice(0, -3)), true);
});

test("the list query reads the new fields without loading the snapshot", async () => {
  assert.equal(/\bselect\s+state\b/i.test(LIST_REVIEWS_SQL), false);
  for (const piece of ["160", "'...'", "selectedTypes", "jsonb_array_length", "lastAnalysedAt", "state->>'scenario'"]) {
    assert.equal(LIST_REVIEWS_SQL.includes(piece), true, piece);
  }

  const reviews = await listAccountReviews({
    async query() {
      return [
        {
          review_id: "reviewed",
          draft_head: "Hello there",
          excerpt: "Hello there",
          word_count: 12,
          text_type: "FUND_CAPITAL_CALL",
          output_type: "investor_letter",
          source_count: 1,
          last_reviewed_at: "2026-11-18T02:00:00.000Z",
          updated_at: "2026-11-18T03:00:00.000Z",
        },
        {
          review_id: "unreviewed",
          draft_head: "",
          excerpt: null,
          word_count: 0,
          text_type: "",
          output_type: "",
          source_count: null,
          last_reviewed_at: null,
          updated_at: "2026-11-17T03:00:00.000Z",
        },
      ];
    },
  }, "acc");
  assert.equal(reviews[0].excerpt, "Hello there");
  assert.equal(reviews[0].outputType, "investor_letter");
  assert.equal(reviews[0].textType, "FUND_CAPITAL_CALL");
  assert.equal(reviews[0].wordCount, 12);
  assert.equal(reviews[0].sourceCount, 1);
  assert.equal(reviews[0].lastReviewedAt, "2026-11-18T02:00:00.000Z");
  assert.equal(reviews[1].excerpt, null);
  assert.equal(reviews[1].outputType, null);
  assert.equal(reviews[1].textType, null);
  assert.equal(reviews[1].sourceCount, null);
  assert.equal(reviews[1].lastReviewedAt, null);
  assert.equal(reviews[1].wordCount, 0);
});
