/**
 * B560. A figure in a published_external source is not a confidential detail.
 * The row 13b total-return line comes from the 3i press release.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { deterministicCautionConcerns } from "../lib/qc/general-caution.mjs";

const STATEMENT = "3i Group today announced results for the year to 31 March 2025, delivering a total return of GBP 5.0 billion, or 25% on opening shareholders' funds.";
const RELEASE = "3i is a private equity investor. Private label sales grew. Total return of £5,049 million or 25% on opening shareholders' funds. Action grew revenue 22%.";

function codes(sources) {
  return deterministicCautionConcerns(STATEMENT, sources, { visibility: "public" }).map((row) => row.concernCode);
}

test("the press release figure is not confidential, and a restricted-only figure is", () => {
  assert.equal(codes([{ text: RELEASE, publicationState: "published_external" }]).includes("caution_private_detail"), false);
  const restricted = deterministicCautionConcerns(
    "The holding returned 22%.",
    [{ text: "Confidential. The holding returned 22%.", publicationState: "restricted" }],
    { visibility: "public" }
  );
  assert.equal(restricted.some((row) => row.concernCode === "caution_private_detail"), true);
});
