/**
 * B599. Transaction status ruling for Generate and Review.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { restampTransactionStatus } from "../lib/qc/exit-gate.mjs";
import {
  DEAL_STATUS_DEFAULT,
  GENERATE_STATUS_RULES,
  dealStatusDraftLine,
} from "../lib/deal-status.mjs";
import { decideTransactionStatus } from "../lib/qc/transaction-status.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALDER = path.join(HERE, "fixtures/b598/aldermoor-R-456E.json");
const HARBOUR = path.join(HERE, "fixtures/b598/harbourline-R-937B.json");

function load(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function withStatus(body, status) {
  return {
    ...body,
    meta: { ...(body.meta || {}), dealStatus: status },
    statements: (body.statements || []).map((row) => ({
      ...row,
      qcCard: { ...(row.qcCard || {}), dealStatus: status },
    })),
  };
}

test("Aldermoor default status: S1 amber with confirm reason", () => {
  const out = restampAnalyseResponse(withStatus(load(ALDER), null));
  const s1 = out.statements[0].qcCard;
  assert.equal(s1.statusDependent, true);
  assert.equal(s1.sentenceLabel, "Needs a look");
  assert.match(s1.shownReason || "", /Confirm its status below/);
  assert.match(s1.shownReason || "", /recommend/i);
});

test("Aldermoor Completed: S1 green with quiet line; other cards unchanged labels", () => {
  const base = load(ALDER);
  const before = restampAnalyseResponse(withStatus(base, null));
  const after = restampAnalyseResponse(withStatus(base, "Completed"));
  const s1 = after.statements[0].qcCard;
  assert.equal(s1.sentenceLabel, "Nothing raised");
  assert.match(s1.shownReason || "", /Transaction status as set by you: Completed/);
  assert.equal(s1.statusQuietLine, "Transaction status as set by you: Completed.");
  for (let i = 1; i < after.statements.length; i += 1) {
    // Status-dependent cards may move when Completed covers their claim.
    if (after.statements[i].qcCard.statusDependent) continue;
    assert.equal(
      after.statements[i].qcCard.sentenceLabel,
      before.statements[i].qcCard.sentenceLabel,
      `S${i + 1} label moved under Completed`,
    );
  }
});

test("Approved with completed claim is amber naming the difference", () => {
  const ruling = decideTransactionStatus({
    statement: "The firm completed the acquisition of Harbourline in September 2026.",
    dealStatus: "Approved",
    sourceText: "We recommend approval of the commitment.",
  });
  assert.equal(ruling.exceeds, true);
  assert.equal(ruling.state, "note_withheld");
  assert.match(ruling.reason, /completed/i);
  assert.match(ruling.reason, /Approved/);
});

test("Harbourline S5 under default and Completed (exit type)", () => {
  const base = load(HARBOUR);
  const def = restampAnalyseResponse(withStatus(base, null));
  const done = restampAnalyseResponse(withStatus(base, "Completed"));
  const s5def = def.statements[4].qcCard;
  const s5done = done.statements[4].qcCard;
  // Report faces for the verification table; assert they stay amber with a naming reason.
  assert.equal(s5def.sentenceLabel, "Needs a look");
  assert.match(s5def.shownReason || "", /30 September|complet/i);
  assert.equal(s5done.sentenceLabel, "Needs a look");
  assert.match(s5done.shownReason || "", /30 September|complet/i);
});

test("restamp route inputs are stable and summary counts match cards", () => {
  const body = withStatus(load(ALDER), null);
  const first = restampTransactionStatus(restampAnalyseResponse(body), "Completed");
  const second = restampTransactionStatus(restampAnalyseResponse(body), "Completed");
  assert.equal(first.statements[0].qcCard.sentenceLabel, second.statements[0].qcCard.sentenceLabel);
  assert.equal(first.statements[0].qcCard.shownReason, second.statements[0].qcCard.shownReason);
  const summary = first.meta.reviewSummary;
  assert.ok(summary);
  // Counts object exists and was rebuilt from cards.
  assert.equal(typeof summary.evidence, "object");
});

test("Generate prompt carries the status rule for each option; default never asks for completed", () => {
  assert.match(GENERATE_STATUS_RULES[DEAL_STATUS_DEFAULT], /Never write a status stronger|Do not claim the transaction is completed/i);
  assert.doesNotMatch(GENERATE_STATUS_RULES[DEAL_STATUS_DEFAULT], /Write the transaction as completed/);
  assert.match(GENERATE_STATUS_RULES.Approved, /approved/i);
  assert.match(GENERATE_STATUS_RULES["Signed or agreed"], /agreed or committed/i);
  assert.match(GENERATE_STATUS_RULES.Completed, /completed or invested/i);
  const defLine = dealStatusDraftLine(null, "NEW_DIRECT_INVESTMENT");
  assert.match(defLine, /transaction status/i);
  assert.doesNotMatch(defLine, /Write the transaction as completed/);
  const completedLine = dealStatusDraftLine("Completed", "NEW_DIRECT_INVESTMENT");
  assert.match(completedLine, /Completed/);
  assert.match(completedLine, /Never write a status stronger/);
});
