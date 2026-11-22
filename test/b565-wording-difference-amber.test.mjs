/**
 * B565. A wording difference is amber and names both forms.
 * A figure, date, name, or outcome difference stays a conflict.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { plainDifference } from "../lib/qc/wording-difference.mjs";

const REVIEW = JSON.parse(readFileSync("/Users/benjaminruane/ce-diagnostics/b565/clearpoint-pdf-review.json", "utf8"));

test("singular versus plural is amber and names both forms", () => {
  const card = REVIEW.statements[7].qcCard;
  const excerpt = card.primaryExcerpt;
  const passage = typeof excerpt === "string" ? excerpt : excerpt?.passage;
  const described = plainDifference(card.statement, passage);
  assert.equal(described.kind, "wording");
  assert.equal(
    described.reason,
    "The source says the first clinical procedure; the draft says procedures."
  );
});

test("a different figure stays a conflict and names both numbers", () => {
  const described = plainDifference(
    "Revenue grew 22%.",
    "Action reported 10.3% like-for-like sales growth."
  );
  assert.equal(described.kind, "conflict");
  assert.match(described.reason, /10\.3%/);
  assert.match(described.reason, /22%/);
  assert.equal(/states "/.test(described.reason), false);
});

test("an outcome stays a conflict", () => {
  const described = plainDifference("Profit increased in the year.", "Profit decreased in the year.");
  assert.equal(described.kind, "conflict");
  assert.match(described.reason, /decreased/);
  assert.match(described.reason, /increased/);
});
