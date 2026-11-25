/**
 * B592. Spelling wiring, reason de-dupe, note-card consistency, export rebuild,
 * and sourceSlicesForPassage null when a later piece cannot follow the previous.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { constructiveFeedbackSystemPrompt, HOUSE_SPELLING } from "../lib/qc/constructive-feedback-v2.mjs";
import { houseStyleNoteLine } from "../lib/house-style-choice.mjs";
import { spellingDisplay, spellingPromptLine } from "../lib/qc/house-spelling.mjs";
import { dedupeJoinedReason, stripNoteCardContradictions } from "../lib/qc/note-card-consistency.mjs";
import { writerFeedbackInstructions } from "../lib/qc/reading-review.mjs";
import { sourceSlicesForPassage } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import {
  cutLineEllipsis,
  exportBlocks,
  exportLines,
  exportTitleName,
  HOW_TO_READ_TITLE,
  lineRefLabel,
  sourceDisplayName,
} from "../lib/export/export-blocks.mjs";

test("sourceSlicesForPassage returns null for out-of-order pieces and a short repeating phrase", () => {
  const source = [
    "the fund holds cash.",
    "Alpha first.",
    "Beta second.",
    "Later the managers said more.",
  ].join("\n");
  assert.equal(
    sourceSlicesForPassage("Beta second. ... Alpha first.", source),
    null
  );
  // Short stock phrase only appears before the previous piece; do not restart from top.
  assert.equal(
    sourceSlicesForPassage("Later the managers said more. ... the fund", source),
    null
  );
  assert.match(
    sourceSlicesForPassage("Alpha first. ... Beta second.", source) || "",
    /Alpha first/
  );
});

test("spelling choice reaches review and note prompts", () => {
  assert.equal(HOUSE_SPELLING, spellingDisplay("US"));
  assert.match(spellingPromptLine("US"), /Merriam-Webster/);
  assert.match(spellingPromptLine("UK"), /Oxford/);
  const ukFeedback = constructiveFeedbackSystemPrompt({ spelling: "UK", thousands: "comma" });
  assert.match(ukFeedback, /British English spelling \(Oxford\)/);
  assert.match(houseStyleNoteLine({ spelling: "UK", thousands: "comma" }), /British English \(Oxford\)/);
  const notePrompt = writerFeedbackInstructions({
    eventType: "GENERAL",
    outputType: "REPORTING_COMMENTARY",
    visibility: "complete",
    houseStyle: { spelling: "UK", thousands: "comma" },
    cards: [{ label: "Nothing raised", reason: "The source states the figure." }],
  });
  assert.match(notePrompt, /British English spelling \(Oxford\)/);
  assert.match(notePrompt, /Nothing raised/);
  assert.match(notePrompt, /must not contradict/);
});

test("joined reasons drop repeated gap points", () => {
  const joined = dedupeJoinedReason(
    "The source does not tie the return to March. The source does not state the period. The point is not directly addressed."
  );
  assert.match(joined, /does not tie/);
  assert.equal((joined.match(/does not state|not directly addressed/gi) || []).length, 0);
});

test("note-card contradiction check drops conflicting sentences", () => {
  const quietOnly = stripNoteCardContradictions(
    "The draft is clear. Calling the green sentence an overstatement is fair.",
    [{ label: "Nothing raised", reason: "The source states the figure." }]
  );
  assert.match(quietOnly, /draft is clear/);
  assert.doesNotMatch(quietOnly, /overstatement/);

  const grounded = stripNoteCardContradictions(
    "The draft is clear. The wording is grounded in the source.",
    [{ label: "Goes beyond the source", reason: "The source does not use the words 'strong growth'." }]
  );
  assert.match(grounded, /draft is clear/);
  assert.doesNotMatch(grounded, /grounded/);
});

test("export block order, card order, headings, line refs, cut ellipsis, house style, source name", () => {
  assert.equal(exportTitleName({ subject: "PPET half-year commentary" }), "PPET half-year commentary: review");
  assert.equal(exportTitleName({ textType: "Reporting commentary" }), "Reporting commentary: review");
  assert.equal(cutLineEllipsis("NAV total return of 3.1% (31"), "NAV total return of 3.1% (31 …");
  assert.equal(cutLineEllipsis("The return was 3.1%."), "The return was 3.1%.");
  assert.equal(lineRefLabel("L15"), "(line 15)");
  assert.equal(lineRefLabel("L15–L17"), "(lines 15 to 17)");
  assert.equal(sourceDisplayName({ fileName: "half-year.pdf", name: "" }), "half-year.pdf");
  assert.equal(sourceDisplayName({ name: "Named source", fileName: "half-year.pdf" }), "Named source");
  assert.equal(sourceDisplayName({ name: "half-year.pdf" }), "half-year.pdf");

  const document = {
    title: { name: exportTitleName({ subject: "PPET half-year commentary" }) },
    summary: {
      readiness: "Needs work",
      facts: "2 of 2 figures appear in the source",
      counts: ["1 sentence needs a look"],
      houseStyle: "House style: 1 note",
      editorial: "Editorial and caution: nothing raised",
    },
    draft: [{ text: "First paragraph.\n\nSecond paragraph.", marker: "S1" }],
    cards: [
      {
        heading: "S1 · Needs a look",
        tone: "amber",
        attention: true,
        sentence: "NAV rose.",
        reason: "The source does not state the period.",
        passages: [{ text: "NAV total return of 3.1% (31", lines: "L15" }],
        also: { heading: "Also relevant", text: "Share price return of 5.5% (31", lines: "L16" },
        concerns: [],
      },
      {
        heading: "S2 · Nothing raised",
        tone: "green",
        sentence: "The dividend is 18.4 pence.",
        reason: "The source states the dividend.",
        passages: [{ text: "Proposed Dividend 18.4 pence.", lines: "L20" }],
        concerns: [],
      },
    ],
    reviewerNote: "Keep the period wording closer to the source.",
    sources: [{
      fileName: "PPET-half-year.pdf",
      name: "",
      publication: "Published externally",
      fileType: "PDF",
      description: "Interim report.",
    }],
    disclaimer: "This is one reader's view of the draft against the sources supplied.",
  };

  const lines = exportLines(document, {
    draft: true,
    sources: true,
    reviewSummary: true,
    note: true,
    cards: true,
  });
  const order = ["Draft", "Sources", "Review summary", "Reviewer's note", "Sentence review", HOW_TO_READ_TITLE];
  let cursor = -1;
  for (const heading of order) {
    const at = lines.indexOf(heading);
    assert.equal(at > cursor, true, heading);
    cursor = at;
  }
  assert.equal(lines.includes("Needs attention"), false);
  assert.equal(lines.includes("Statement"), true);
  assert.equal(lines.includes("Comment"), true);
  assert.equal(lines.includes("Source"), true);
  assert.ok(lines.some((line) => /\(line 15\)/.test(line)));
  assert.ok(lines.some((line) => /3\.1% \(31 …/.test(line)));
  assert.ok(lines.some((line) => /5\.5% \(31 …/.test(line)));
  assert.equal(lines.includes("House style: 1 note"), true);
  assert.equal(lines.includes("PPET-half-year.pdf"), true);
  assert.equal(lines.includes("Untitled source"), false);
  assert.equal(lines.some((line) => /\bcompliance\b/i.test(line)), false);
  assert.equal(lines.indexOf("S1 · Needs a look") < lines.indexOf("S2 · Nothing raised"), true);

  const blocks = exportBlocks(document, { cards: true });
  assert.equal(blocks.some((block) => block.kind === "howToRead"), true);
  assert.equal(blocks.some((block) => block.kind === "disclaimer"), false);
});
