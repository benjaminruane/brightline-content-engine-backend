/**
 * B599 items 7–9. Amber reasons name the issue; figure conflicts keep a correction;
 * no internal voice.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { stripInternalVoice } from "../lib/qc/exit-gate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "fixtures/b599/harbourline-after-b598.json");

function load() {
  return JSON.parse(readFileSync(FIX, "utf8"));
}

test("Harbourline after B598: S1 green, S5 names 30 September, S12 keeps EUR 678 proposal", () => {
  const body = restampAnalyseResponse(load());
  const s1 = body.statements[0].qcCard;
  const s5 = body.statements[4].qcCard;
  const s12 = body.statements[11].qcCard;

  assert.equal(s1.sentenceLabel, "Nothing raised");
  assert.match(s1.shownReason || "", /supports/i);
  assert.doesNotMatch(s1.shownReason || "", /Needs a look against the source/i);

  assert.equal(s5.sentenceLabel, "Needs a look");
  assert.match(s5.shownReason || "", /30 September 2026/);
  assert.doesNotMatch(s5.shownReason || "", /evidence check/i);

  assert.equal(s12.sentenceLabel, "Conflicts with the source");
  assert.equal(s12.combinedVerdict?.tone, "red");
  const proposal = s12.conflictProposal?.resultingSentence
    || s12.suggestedImprovement
    || "";
  assert.match(proposal, /EUR 678 million/);
  assert.match(proposal, /30 June 2026/);
});

test("stripInternalVoice removes evidence-check sentences", () => {
  const raw = "The press release supports the sentence. The evidence check notes a later distribution notice reporting completion.";
  const out = stripInternalVoice(raw);
  assert.match(out, /press release supports/i);
  assert.doesNotMatch(out, /evidence check/i);
});

test("no left-for-caller-to-enrich path remains in b595 guard source", () => {
  const src = readFileSync(path.join(HERE, "../lib/qc/b595-card-rules.mjs"), "utf8");
  assert.doesNotMatch(src, /left for caller to enrich/);
});
