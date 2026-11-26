import { test } from "vitest";
import assert from "node:assert/strict";
import { partitionClaimStatements } from "../lib/qc/pipeline-v4/stage1-extract-statements.mjs";
import { computeDraftCoverage } from "../lib/qc/draft-coverage.mjs";

const VIEW = "We remain constructive on the remaining portfolio.";
const HEADING = "Lumio launches the Lumio Kettle";
const FACT = "The fund is a 2019 vintage.";

test("an own-view sentence is dropped with the own_view reason, a heading keeps not_a_claim", () => {
  const draft = `${HEADING}\n\n${FACT} ${VIEW}`;
  const rows = [
    { text: HEADING, charStart: 0, charEnd: HEADING.length, isClaim: false },
    { text: FACT, charStart: draft.indexOf(FACT), charEnd: draft.indexOf(FACT) + FACT.length, isClaim: true },
    { text: VIEW, charStart: draft.indexOf(VIEW), charEnd: draft.indexOf(VIEW) + VIEW.length, isClaim: true },
  ];
  const split = partitionClaimStatements(rows);
  assert.deepEqual(split.statements.map((r) => r.text), [FACT]);
  const byText = Object.fromEntries(split.droppedNonClaims.map((r) => [r.text, r]));
  assert.equal(byText[VIEW].reason, "own_view");
  assert.equal(byText[VIEW].reasonText, "A view, not checked against the sources.");
  assert.equal(byText[HEADING].reason, "not_a_claim");

  const coverage = computeDraftCoverage({
    draftText: draft,
    cards: [{ charStart: rows[1].charStart, charEnd: rows[1].charEnd }],
    dropped: split.droppedNonClaims,
  });
  const viewRow = coverage.dropped.find((r) => r.text === VIEW);
  assert.equal(viewRow.reason, "own_view");
  assert.equal(coverage.uncoveredCount, 0);
});
