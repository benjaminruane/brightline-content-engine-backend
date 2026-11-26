import { test } from "vitest";
import assert from "node:assert/strict";
import { dropNoteSentencesAboutQuietCards } from "../lib/qc/note-card-consistency.mjs";

const rows = [
  { text: "Net IRR since inception stood at 11.2 percent as at 31 March 2025.", qcCard: { sentenceLabel: "Conflicts with the source" } },
  { text: "Total commitments were EUR 1.3 billion.", qcCard: { sentenceLabel: "Nothing raised" } },
];

test("a note sentence about a card that ended quiet is dropped (Ostara rounding)", () => {
  const note = "The draft needs reconciling before it goes out. "
    + "'Net IRR since inception' uses the fact sheet figure while the performance report gives 12.4%; confirm which is final. "
    + "'Total commitments were EUR 1.3 billion' matches neither EUR 1.2 billion nor EUR 1.25 billion; use the final figure.";
  const out = dropNoteSentencesAboutQuietCards(note, rows);
  assert.match(out, /12\.4%/);
  assert.doesNotMatch(out, /EUR 1\.3 billion/);
});

test("praise of a quiet sentence, and sentences about raised cards, are kept", () => {
  const note = "'Total commitments were EUR 1.3 billion' is correctly rounded. 'Net IRR since inception stood at 11.2 percent' conflicts with the report.";
  assert.equal(dropNoteSentencesAboutQuietCards(note, rows), note);
});

test("a sentence quoting both a quiet and a raised card is kept", () => {
  const note = "'Total commitments were EUR 1.3 billion' and 'Net IRR since inception stood at 11.2 percent' both need checking against the final figures.";
  assert.equal(dropNoteSentencesAboutQuietCards(note, rows), note);
});

test("the review route sends the reading through the exit gate", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../api/analyse-statements.js", import.meta.url), "utf8");
  const gateCall = route.slice(route.indexOf("applyExitGateToResponse("), route.indexOf("for (let i = 0; i < statements.length"));
  assert.match(gateCall, /reading: pipelineResult\.reading/);
  assert.match(route, /reading: gated\.reading \?\? pipelineResult\.reading/);
});
