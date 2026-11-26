/**
 * B602. Accept / Modify / Undo restamp without a model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { applyExitGateToResponse } from "../lib/qc/exit-gate.mjs";
import {
  applyEditRestampToResponse,
  restampAfterAccept,
  restampAfterModify,
  restampAfterUndo,
} from "../lib/qc/edit-restamp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function load(name) {
  return JSON.parse(readFileSync(path.join(ROOT, "fixtures/b602", name), "utf8"));
}

test("Accept on Lumio price fix: green, same index, others untouched; Undo restores", () => {
  const body = applyExitGateToResponse(restampAnalyseResponse(load("lumio-planted.json")));
  const priceIdx = body.statements.findIndex((s) => /recommended price is USD 59/i.test(s.text));
  assert.ok(priceIdx >= 0, "planted USD 59 statement present");
  const beforeOthers = body.statements.map((s, i) => (
    i === priceIdx ? null : {
      i,
      text: s.text,
      state: s.qcCard?.sentenceState,
      label: s.qcCard?.sentenceLabel,
    }
  ));

  const card = {
    ...body.statements[priceIdx].qcCard,
    statement: body.statements[priceIdx].text,
    primaryExcerpt: "The recommended price is USD 49.",
    primaryExcerptText: "The recommended price is USD 49.",
    readingFacts: [
      ...(body.statements[priceIdx].qcCard?.readingFacts || []),
      { kind: "figure", surface: "USD 49", status: "matched", extract: "The recommended price is USD 49.", lineId: "L3" },
    ],
  };
  // Ensure shown lines include the source figure for the recheck.
  const accepted = restampAfterAccept(card, "The recommended price is USD 49.");
  assert.equal(accepted.statement, "The recommended price is USD 49.");
  assert.equal(accepted.editMode, "accept");
  assert.equal(accepted.sentenceState, "nothing_raised");
  assert.match(accepted.shownReason, /Changed to match the source/);
  assert.equal(accepted.sentenceLabel, "Nothing raised");

  const undone = restampAfterUndo(accepted);
  assert.equal(undone.statement, "The recommended price is USD 59.");
  assert.ok(!undone.editMode);

  const whole = applyEditRestampToResponse(body, {
    statementIndex: priceIdx,
    mode: "accept",
    newStatement: "The recommended price is USD 49.",
  });
  assert.equal(whole.meta.changesSinceReview, 1);
  assert.equal(whole.statements[priceIdx].text, "The recommended price is USD 49.");
  for (const row of beforeOthers) {
    if (!row) continue;
    assert.equal(whole.statements[row.i].text, row.text);
  }

  const restored = applyEditRestampToResponse(whole, {
    statementIndex: priceIdx,
    mode: "undo",
  });
  assert.equal(restored.statements[priceIdx].text, "The recommended price is USD 59.");
  assert.equal(restored.meta.changesSinceReview, 0);
});

test("Modify stamps quiet changed-since-review note", () => {
  const body = applyExitGateToResponse(restampAnalyseResponse(load("ostara.json")));
  const card = { ...body.statements[4].qcCard, statement: body.statements[4].text };
  const modified = restampAfterModify(card, "The fund is a 2019 vintage fund.");
  assert.equal(modified.editMode, "modify");
  assert.match(modified.shownReason, /Changed since the review\. Review again to check this sentence\./);
  assert.doesNotMatch(modified.shownReason, /amber/i);
});

test("Accept keeps editorial and caution notes", () => {
  const body = applyExitGateToResponse(restampAnalyseResponse(load("lumio-planted.json")));
  const idx = body.statements.findIndex((s) => /transform every kitchen/i.test(s.text));
  const card = {
    ...body.statements[idx].qcCard,
    statement: body.statements[idx].text,
    editorialConcerns: [{ note: "Keep the claim modest.", ruleId: "tone" }],
    complianceConcerns: body.statements[idx].qcCard?.complianceConcerns || [],
  };
  const next = restampAfterAccept(
    {
      ...card,
      primaryExcerpt: "Lumio launches the Lumio Kettle on 12 May 2026.",
      readingFacts: [{ kind: "name", surface: "Lumio", status: "matched", extract: "Lumio launches" }],
    },
    "Lumio today launches the Lumio Kettle.",
  );
  assert.equal(next.editorialConcerns?.length, 1);
  assert.ok(Array.isArray(next.complianceConcerns));
});
