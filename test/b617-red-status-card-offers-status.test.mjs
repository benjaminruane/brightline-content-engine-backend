/**
 * B617. Status buttons stay on red cards when the reason is a status-recommend
 * ask; a memo-date conflict is appended after the status sentence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { applyExitGate } from "../lib/qc/exit-gate.mjs";
import { DECISION_AS_MADE_REASON } from "../lib/qc/decision-as-made.mjs";
import { statusAttachedFactConflict } from "../lib/qc/transaction-status.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const R249D = JSON.parse(
  readFileSync(path.join(ROOT, "../scripts/diagnostic/b617/R-249D-review.json"), "utf8"),
);

const STATEMENT = R249D.statements[0].text;
const SOURCE = R249D.sources[0].text;

test("status-recommend plus memo date keeps statusDependent and both reasons", () => {
  const hit = statusAttachedFactConflict(STATEMENT, SOURCE);
  assert.equal(hit.state, "conflicts");
  assert.equal(hit.statusDependent, true);
  assert.equal(hit.needsConfirm, true);
  assert.match(hit.reason, /recommend/i);
  assert.match(hit.reason, /memo is dated 12 October 2010/i);
  assert.match(hit.reason, /November 2026/);
  assert.ok(hit.reason.indexOf(DECISION_AS_MADE_REASON) === 0);
});

test("exit gate leaves Confirm its status buttons on the red S1 card", () => {
  const pre = {
    ...structuredClone(R249D.statements[0].qcCard),
    statement: STATEMENT,
    sentenceState: "note_withheld",
    statementVerdict: {
      state: "note_withheld",
      tier: "light",
      setBy: { branch: "decisionAsMade", source: "display" },
    },
    setBy: { branch: "decisionAsMade", source: "display" },
    shownReason: DECISION_AS_MADE_REASON,
    evidenceSummary: DECISION_AS_MADE_REASON,
    statusDependent: false,
    statusNeedsConfirm: false,
    sourceCorpus: SOURCE,
  };
  const out = applyExitGate(pre, { sourceTexts: [SOURCE] });
  assert.equal(out.sentenceState, "conflicts");
  assert.equal(out.statusDependent, true);
  assert.match(out.shownReason || "", /confirm the decision was taken/i);
  assert.match(out.shownReason || "", /memo is dated 12 October 2010/i);
});
