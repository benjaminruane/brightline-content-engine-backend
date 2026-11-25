/**
 * B600. Status claims scoped to this transaction; live Aldermoor fixture.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { applyExitGateToResponse, restampTransactionStatus } from "../lib/qc/exit-gate.mjs";
import {
  decideTransactionStatus,
  isThisTransactionStatusClaim,
  transactionSubject,
} from "../lib/qc/transaction-status.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(ROOT, "fixtures/b600/aldermoor-live-b599.json");

function load() {
  return JSON.parse(readFileSync(FIXTURE, "utf8"));
}

function face(card) {
  const q = card?.qcCard || card || {};
  return {
    label: q.sentenceLabel || q.combinedVerdict?.label || "",
    tone: q.combinedVerdict?.tone === "none" ? "green" : (q.combinedVerdict?.tone || ""),
    reason: q.shownReason || "",
    statusDependent: q.statusDependent === true,
    statusNeedsConfirm: q.statusNeedsConfirm === true,
    quiet: q.statusQuietLine || null,
  };
}

test("S1 is statusDependent; S5 prior-history is not and goes green", () => {
  const body = load();
  const out = applyExitGateToResponse(restampAnalyseResponse(body), {
    dealStatus: body.meta?.dealStatus || null,
    subject: body.meta?.subjectName || "Aldermoor Capital Fund VI",
  });
  const s1 = face(out.statements[0]);
  const s5 = face(out.statements[4]);
  assert.equal(s1.statusDependent, true);
  assert.equal(s1.statusNeedsConfirm, true);
  assert.equal(s1.label, "Needs a look");
  assert.match(s1.reason, /Confirm its status below/i);
  assert.equal(s5.statusDependent, false);
  assert.equal(s5.statusNeedsConfirm, false);
  assert.equal(s5.label, "Nothing raised");
});

test("isThisTransactionStatusClaim scopes completed-action claims to the subject", () => {
  const subject = "Aldermoor Capital Fund VI";
  const source = 'The team recommends that the Committee approve a commitment of EUR 65 million to Aldermoor Capital Fund VI ("Fund VI").';
  assert.equal(
    isThisTransactionStatusClaim(
      "In October 2026, Halden Group committed to Aldermoor Capital Fund VI, a European mid-market buyout fund managed by Aldermoor Capital.",
      { subject, sourceText: source },
    ),
    true,
  );
  assert.equal(
    isThisTransactionStatusClaim(
      "Halden Group has invested with Aldermoor since 2015 across three prior funds, has completed two co-investments alongside the manager, and sits on the advisory committees of Funds IV and V.",
      { subject, sourceText: source },
    ),
    false,
  );
  assert.match(transactionSubject({ sourceText: source }), /Aldermoor Capital Fund VI/);
});

test("Completed restamp greens S1 with quiet line; other cards unchanged labels", () => {
  const body = load();
  const before = applyExitGateToResponse(restampAnalyseResponse(body), {
    subject: "Aldermoor Capital Fund VI",
  });
  const after = restampTransactionStatus(
    restampAnalyseResponse({
      ...before,
      meta: { ...before.meta, subjectName: "Aldermoor Capital Fund VI" },
    }),
    "Completed",
  );
  const s1 = face(after.statements[0]);
  assert.equal(s1.label, "Nothing raised");
  assert.match(s1.reason, /Transaction status as set by you: Completed/);
  assert.equal(s1.quiet, "Transaction status as set by you: Completed.");
  for (let i = 1; i < before.statements.length; i += 1) {
    if (before.statements[i].qcCard?.statusDependent) continue;
    assert.equal(
      after.statements[i].qcCard?.sentenceLabel,
      before.statements[i].qcCard?.sentenceLabel,
      `S${i + 1} label moved`,
    );
  }
});

test("default decideTransactionStatus still confirms Aldermoor S1", () => {
  const ruling = decideTransactionStatus({
    statement: "In October 2026, Halden Group committed to Aldermoor Capital Fund VI, a European mid-market buyout fund managed by Aldermoor Capital.",
    dealStatus: null,
    sourceText: 'The team recommends that the Committee approve a commitment of EUR 65 million to Aldermoor Capital Fund VI ("Fund VI").',
    subject: "Aldermoor Capital Fund VI",
  });
  assert.equal(ruling.statusDependent, true);
  assert.equal(ruling.needsConfirm, true);
});
