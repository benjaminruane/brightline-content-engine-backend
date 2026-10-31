import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { combinedVerdict } from "../lib/qc/combined-verdict.mjs";
import { applyReadingContract } from "../lib/qc/reading-contract.mjs";
import { classifyCard } from "../lib/qc/review-summary.mjs";
import { statementVerdict } from "../lib/qc/statement-verdict.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fact(status, surface = "budgets") {
  return { status, surface, kind: "benchmark" };
}

test("states follow the strongest reviewer and leave the statement verdict alone", () => {
  const quiet = statementVerdict({
    facts: [fact("matched")],
    note: { bucket: "none", text: "" },
    entries: [],
  });
  const before = JSON.stringify(quiet);
  const compliance = combinedVerdict({
    verdict: quiet,
    editorialConcerns: [],
    complianceVerdict: "hard_concern",
    complianceConcerns: [{ concernCode: "forward_looking_statement_without_qualifier" }],
  });
  assert.equal(JSON.stringify(quiet), before);
  assert.equal(quiet.state, "nothing_raised");
  assert.equal(quiet.tier, "quiet");
  assert.equal(compliance.state, "compliance_risk");
  assert.equal(compliance.tier, "demands");
  assert.equal(compliance.tone, "red");
  assert.equal(compliance.label, "Compliance risk");
  assert.equal(compliance.setBy.source, "compliance");

  const wording = combinedVerdict({
    verdict: quiet,
    editorialConcerns: [{ concernCode: "structural_integrity" }],
    complianceVerdict: "clean",
    complianceConcerns: [],
  });
  assert.equal(wording.state, "wording");
  assert.equal(wording.tone, "slate");
  assert.equal(wording.label, "Wording to fix");

  const soft = combinedVerdict({
    verdict: quiet,
    editorialConcerns: [],
    complianceVerdict: "soft_concern",
    complianceConcerns: [],
  });
  assert.equal(soft.state, "wording");

  const beyond = statementVerdict({
    facts: [fact("matched")],
    note: { bucket: "beyond", text: "The source does not say this." },
    entries: [],
  });
  const held = combinedVerdict({
    verdict: beyond,
    editorialConcerns: [{ concernCode: "structural_integrity" }],
    complianceVerdict: "soft_concern",
    complianceConcerns: [{ concernCode: "x" }],
  });
  assert.equal(held.state, "beyond");
  assert.equal(held.tone, "amber");

  const missing = statementVerdict({
    facts: [fact("not_found", "budgets")],
    note: { bucket: "conflicts", text: "The period is wrong." },
    entries: [],
  });
  const top = combinedVerdict({
    verdict: missing,
    editorialConcerns: [],
    complianceVerdict: "hard_concern",
    complianceConcerns: [{ concernCode: "x" }],
  });
  assert.equal(top.state, "not_in_source");
  assert.equal(top.label, "Not in the source");
});

test("the card carries both verdicts and the ledger class is unchanged", () => {
  const card = {
    statement: "The company completed the refinancing.",
    displayVerdict: "supported_full",
    factualBadge: true,
    editorialConcerns: [{ concernCode: "structural_integrity", severity: "soft_concern" }],
    editorialVerdict: "concern",
    complianceConcerns: [],
    complianceVerdict: "clean",
  };
  const stamped = applyReadingContract(card, {
    facts: [fact("matched", "company")],
    note: { bucket: "none", text: "", refused: false },
  });
  assert.equal(stamped.statementVerdict.state, "nothing_raised");
  assert.equal(stamped.sentenceState, "nothing_raised");
  assert.equal(stamped.tier, "quiet");
  assert.equal(stamped.combinedVerdict.state, "wording");
  assert.equal(stamped.combinedVerdict.tone, "slate");
  const counted = classifyCard(stamped, {
    evidenceEnabled: true,
    editorialEnabled: true,
    complianceEnabled: true,
  });
  assert.equal(counted.counted, true);
  assert.equal(counted.cardTone, "green");
});

test("the clean ledger still counts statementVerdict", () => {
  const stored = JSON.parse(readFileSync(path.join(root, "scripts/diagnostic/b403c/runs/reading.json"), "utf8"));
  const ledger = { demands: 0, light: 0, quiet: 0, noise: [] };
  for (const draft of stored.drafts || []) {
    if (draft.arm !== "clean") continue;
    for (const statement of draft.statements || []) {
      const notFound = Array.isArray(statement.notFound) ? statement.notFound : [];
      const facts = notFound.map((surface) => ({ status: "not_found", surface: String(surface) }));
      if (facts.length === 0) facts.push({ status: "matched", surface: "" });
      const bucket = typeof statement.bucket === "string" ? statement.bucket : "none";
      const refused = Boolean(statement.withheldText) && !statement.shownNote;
      const note = refused ? { refused: true, bucket } : { bucket, text: statement.shownNote || "" };
      const verdict = statementVerdict({ facts, note, entries: [] });
      ledger[verdict.tier] += 1;
      if (verdict.tier === "demands" && statement.ledger !== "firm") {
        ledger.noise.push(`${draft.doc} S${statement.index}`);
      }
      const combined = combinedVerdict({
        verdict,
        editorialConcerns: [],
        complianceVerdict: null,
        complianceConcerns: [],
      });
      assert.equal(combined.state, verdict.state);
    }
  }
  // HICL S1 is a wording note on the name HCIL. The headline does not say it is absent.
  assert.equal(ledger.demands, 2);
  assert.equal(ledger.light, 5);
  assert.equal(ledger.quiet, 31);
  assert.deepEqual(ledger.noise, []);
});
