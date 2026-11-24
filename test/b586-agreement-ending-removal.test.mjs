/**
 * B586. An amber reason drops the whole agreement clause, not only the last phrase.
 * No model call.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { stripAgreementClosing } from "../lib/qc/card-reason.mjs";

const STEM = "The source says the speed of the raise stands out in a fundraising market where many managers spend well over a year on the road, and points to continued LP concentration in established middle-market managers";
const POINT = "The source does not state that the market has become more selective.";
const CLEAN = `${STEM}. ${POINT}`;

const ENDINGS = [
  ", which is consistent with the statement",
  ", which supports the statement",
  ", in line with the statement",
  ", as the statement says",
  ", consistent with the statement",
  " and is consistent with the statement",
  " and supports the statement",
  " and in line with the statement",
  " and as the statement says",
  " and consistent with the statement",
];

test("the gemspring S1 fragment becomes a finished sentence", () => {
  const broken = `${STEM}, which is. ${POINT}`;
  assert.equal(stripAgreementClosing(broken), CLEAN);
  assert.equal(stripAgreementClosing(`${STEM}, which is consistent with the statement. ${POINT}`), CLEAN);
  assert.equal(CLEAN.endsWith("managers. The source does not state that the market has become more selective."), true);
});

test("each agreement ending leaves the clause in front of it", () => {
  const short = "The source says the fund closed in three months";
  for (const ending of ENDINGS) {
    assert.equal(stripAgreementClosing(`${short}${ending}.`), `${short}.`, ending);
  }
});

test("an incomplete remainder ends at the last complete clause", () => {
  const text = "The source states the fund closed in three months. The raise, which is consistent with the statement.";
  assert.equal(stripAgreementClosing(text), "The source states the fund closed in three months.");
});
