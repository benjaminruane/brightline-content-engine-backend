/**
 * B602. House notes, status selector stamps, false conflicts, status scope,
 * gross/net, multi-source figures, evidence/reason, proposals.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { applyExitGateToResponse } from "../lib/qc/exit-gate.mjs";
import { displayedHouseStyleConcerns, summariseReview } from "../lib/qc/review-summary.mjs";
import { decideTransactionStatus } from "../lib/qc/transaction-status.mjs";
import { polishConstructiveFeedback } from "../lib/qc/constructive-feedback-v2.mjs";
import { groupHouseStyle } from "../lib/qc/house-style.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function load(name) {
  return JSON.parse(readFileSync(path.join(ROOT, "fixtures/b602", name), "utf8"));
}

function face(card) {
  const q = card?.qcCard || card || {};
  return {
    label: q.sentenceLabel || q.combinedVerdict?.label || "",
    reason: q.shownReason || "",
    state: q.sentenceState || q.statementVerdict?.state || "",
    statusDependent: q.statusDependent === true,
    statusNeedsConfirm: q.statusNeedsConfirm === true,
    primary: q.primaryExcerptText || q.primaryExcerpt || "",
    house: Array.isArray(q.houseStyleConcerns) ? q.houseStyleConcerns : [],
    compliance: Array.isArray(q.complianceConcerns) ? q.complianceConcerns : [],
    empty: q.emptyEvidenceCopy || "",
    askGoverning: q.askGoverningSource === true,
  };
}

function gate(body, extra = {}) {
  return applyExitGateToResponse(restampAnalyseResponse(body), extra);
}

test("F59 Aldermoor house range notes count in summary and groups", () => {
  const out = gate(load("aldermoor.json"), {
    dealStatus: "Signed or agreed",
    subject: "Aldermoor Capital Fund VI",
    eventType: "NEW_PRIMARY_COMMITMENT",
  });
  const s3 = out.statements[2].qcCard;
  const notes = displayedHouseStyleConcerns(s3);
  assert.equal(notes.length, 2);
  assert.ok(notes.every((n) => /hyphen/i.test(n.message || n.note || "")));
  const summary = summariseReview(out.statements.map((s) => s.qcCard), out.meta?.reviewOptions);
  assert.equal(summary.houseStyle?.concerns, 2);
  const groups = groupHouseStyle(out.statements.map((s) => ({ qcCard: s.qcCard })));
  assert.ok(groups.some((g) => g.code === "numeric_range" && g.count >= 2));
});

test("F59 Helvetia spelling notes (favourable, programme) still count", () => {
  const helvetia = JSON.parse(
    readFileSync(path.join(ROOT, "fixtures/b601/helvetia-r31.json"), "utf8"),
  );
  const out = gate({
    ...helvetia,
    meta: { ...(helvetia.meta || {}), houseStyle: { spelling: "US" } },
  });
  const house = out.statements.flatMap((s) => displayedHouseStyleConcerns(s.qcCard));
  const text = house.map((h) => h.message || h.note || "").join(" ");
  assert.match(text, /favourable|favorable|programme|program/i);
});

test("F60 Aldermoor S1 stays statusDependent with quiet line when status set", () => {
  const out = gate(load("aldermoor.json"), {
    dealStatus: "Signed or agreed",
    subject: "Aldermoor Capital Fund VI",
    eventType: "NEW_PRIMARY_COMMITMENT",
  });
  const s1 = face(out.statements[0]);
  assert.equal(s1.statusDependent, true);
  assert.equal(s1.statusNeedsConfirm, false);
  assert.match(s1.reason, /Signed or agreed|supports the sentence/i);
});

test("A3 constructive feedback drops figure-matches-status filler", () => {
  const raw = `The draft is ready.\nTo fix\n- "EUR 65 million" The figure matches the source but the decision status does not.\n- Fix the date.`;
  const polished = polishConstructiveFeedback(raw, { findings: [] });
  assert.doesNotMatch(polished, /figure matches the source but the decision status does not/i);
  assert.match(polished, /Fix the date/i);
});

test("F47 Harbourline S7 invested-in-2020 is not statusDependent", () => {
  const body = load("harbourline.json");
  const statement = body.statements[6].text;
  const source = (body.sources || []).map((s) => s.text || "").join("\n");
  const ruling = decideTransactionStatus({
    statement,
    dealStatus: "Signed or agreed",
    sourceText: source,
    subject: "Harbourline Foods",
    eventType: "EXIT_OR_REALISATION",
  });
  assert.equal(ruling.statusDependent, false);

  const out = gate(body, {
    dealStatus: "Signed or agreed",
    subject: "Harbourline Foods",
    eventType: "EXIT_OR_REALISATION",
  });
  const s7 = face(out.statements[6]);
  assert.equal(s7.statusDependent, false);
});

test("F48 Harbourline S3 does not ask which source governs", () => {
  const out = gate(load("harbourline.json"), {
    dealStatus: "Signed or agreed",
    subject: "Harbourline Foods",
    eventType: "EXIT_OR_REALISATION",
  });
  const s3 = face(out.statements[2]);
  assert.equal(s3.askGoverning, false);
  assert.doesNotMatch(s3.reason, /which source governs/i);
  if (s3.primary) {
    assert.match(s3.primary, /17 June|agreed/i);
    assert.doesNotMatch(s3.primary, /30 September/);
  }
});

test("F37 Ostara S2 with Net in sentence has no gross-or-net caution", () => {
  const out = gate(load("ostara.json"));
  const s2 = face(out.statements[1]);
  assert.equal(
    s2.compliance.some((c) => /gross_net|gross or net/i.test(JSON.stringify(c))),
    false,
  );
});

test("F49 Harbourline S13 drops duplicate gross-net compliance when evidence names it", () => {
  const out = gate(load("harbourline.json"), {
    dealStatus: "Signed or agreed",
    subject: "Harbourline Foods",
    eventType: "EXIT_OR_REALISATION",
  });
  const s13 = face(out.statements[12]);
  assert.equal(
    s13.compliance.some((c) => String(c.concernCode || c.ruleId || "").includes("gross_net")),
    false,
  );
});

test("F38 Ostara S4 multi-source commitments: rounding or named figures", () => {
  const out = gate(load("ostara.json"));
  const s4 = face(out.statements[3]);
  if (s4.state === "nothing_raised") {
    assert.match(s4.reason, /rounded to EUR 1\.3 billion/i);
  } else {
    assert.match(s4.reason, /quarterly|fact sheet/i);
    assert.match(s4.reason, /1\.2|1\.25/);
  }
});

test("F42/F56 Northwharf S2: nothing in the source addresses this", () => {
  const out = gate(load("northwharf.json"));
  const s2 = face(out.statements[1]);
  assert.equal(s2.primary, "");
  assert.match(s2.empty || s2.reason, /Nothing in the source addresses this/i);
});

test("F43 Ostara S4 does not glue Also in the source into primary", () => {
  const out = gate(load("ostara.json"));
  const s4 = out.statements[3].qcCard;
  const primary = s4.primaryExcerptText || s4.primaryExcerpt || "";
  assert.doesNotMatch(primary, /Also in the source \(line/i);
});
