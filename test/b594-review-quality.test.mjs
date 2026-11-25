/**
 * B594. Export paragraph and table-row fixes, plus four review-quality fixes.
 * No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { draftFlow, draftFlowPlain } from "../lib/export/export-blocks.mjs";
import { cutLineEllipsis, isCompleteCutLine, nextLineContinuesSentence } from "../lib/export/passage-cut.mjs";
import { applyConflictProposal } from "../lib/revise-actions/conflict-engagement.mjs";
import {
  cardReason,
  plainSourceSays,
  reconcileAbsenceWithPassage,
  withoutFileVoice,
} from "../lib/qc/card-reason.mjs";
import { evidenceLine } from "../lib/qc/evidence-line.mjs";
import { partialSentence, PARTIAL_UNRECORDED } from "../lib/qc/partial-sentence.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FE_ROOT = path.resolve(ROOT, "../../brightline-content-engine-frontend");
const HARBOURLINE = readFileSync(
  path.join(FE_ROOT, "src/modules/examples/content/harbourline-letter.txt"),
  "utf8"
);

const PATRIA_DRAFT =
  "Sentence one holds the first claim. Sentence two finishes the first paragraph.\n\n"
  + "Sentence three opens the second paragraph. Sentence four closes it.\n\n"
  + "Read more here: www.sample-link.com";

test("export draftFlow keeps paragraph breaks and places S-markers inline", () => {
  const sentences = [
    { text: "Sentence one holds the first claim.", marker: "S1" },
    { text: " Sentence two finishes the first paragraph.\n\n", marker: "S2" },
    { text: "Sentence three opens the second paragraph.", marker: "S3" },
    { text: " Sentence four closes it.\n\n", marker: "S4" },
    { text: "Read more here: www.sample-link.com", marker: "" },
  ];
  const events = draftFlow(sentences);
  const plain = draftFlowPlain(events);
  assert.equal(plain, PATRIA_DRAFT);
  const markers = events.filter((event) => event.kind === "marker").map((event) => event.text);
  assert.deepEqual(markers, ["S1", "S2", "S3", "S4"]);
  // A break only comes from an explicit "\\n", never after every sentence.
  const breaks = events.filter((event) => event.kind === "break").length;
  assert.equal(breaks, 4);
  // S2 sits before the blank line that ends its paragraph, not after S1 alone.
  const s2At = events.findIndex((event) => event.kind === "marker" && event.text === "S2");
  assert.equal(events[s2At + 1].kind, "break");
  assert.equal(events[s2At + 2].kind, "break");
});

test("table rows and finished figure lines do not get mid-sentence ellipsis", () => {
  assert.equal(isCompleteCutLine("NAV Per Share | 862.5p | 845.5p"), true);
  assert.equal(cutLineEllipsis("NAV Per Share | 862.5p | 845.5p", "Next row starts here"), "NAV Per Share | 862.5p | 845.5p");
  assert.equal(cutLineEllipsis("The fund rose 12%", "in the quarter."), "The fund rose 12%");
  assert.equal(nextLineContinuesSentence("in the quarter."), true);
  assert.equal(nextLineContinuesSentence("Next row starts here"), false);
  assert.equal(
    cutLineEllipsis("The portfolio includes three holdings that", "remain under review."),
    "The portfolio includes three holdings that …"
  );
  assert.equal(
    cutLineEllipsis("The portfolio includes three holdings that", "Remaining capital is dry powder."),
    "The portfolio includes three holdings that"
  );
});

test("F01: Harbourline NAV proposal keeps 30 June and corrects the figure", () => {
  const statement = "At 30 June 2026 the fund's net asset value stood at EUR 652 million.";
  assert.match(HARBOURLINE, /Net asset value \(EUR m\)\s+678\s+652/);
  const finding = {
    statement,
    primaryExcerpt: HARBOURLINE,
    supportSpans: [{ text: HARBOURLINE }],
  };
  const out = applyConflictProposal(finding);
  assert.equal(out.status, "replace");
  assert.match(out.proposal.proposedChange, /EUR 652 million/);
  assert.match(out.proposal.proposedChange, /EUR 678 million/);
  assert.equal(
    out.proposal.resultingSentence,
    "At 30 June 2026 the fund's net asset value stood at EUR 678 million."
  );
  assert.doesNotMatch(out.proposal.resultingSentence, /31 March/i);
});

test("F02: reason that denies IRR is dropped when the passage shows IRR", () => {
  const statement = "The fund reports an IRR of 15.9 percent.";
  const passage = "Net IRR                                  15.9%           15.4%";
  const card = {
    statement,
    sentenceLabel: "Goes beyond the source",
    combinedVerdict: { tone: "amber", state: "partial" },
    primaryExcerpt: { passage },
    readingNote: {
      text: "The source does not address any IRR figures.",
    },
  };
  const reason = cardReason(card, { sourceText: HARBOURLINE, passage });
  assert.doesNotMatch(reason, /does not address any IRR/i);
  assert.match(reason, /gross or net/i);
  // Colour / label unchanged by this step.
  assert.equal(card.combinedVerdict.tone, "amber");
  assert.equal(card.sentenceLabel, "Goes beyond the source");
  const direct = reconcileAbsenceWithPassage(
    "The source does not address any IRR figures.",
    card,
    { sourceText: HARBOURLINE, passage }
  );
  assert.match(direct, /gross or net/i);
});

test("F05: fallback reason never starts with a file name or states", () => {
  const passage = "The single close at hard cap points to LP concentration in established middle-market managers.";
  const line = evidenceLine({
    fileName: "Gemspring Capital Closed Fund IV ... | HedgeCo Insig.html",
    quote: passage,
  });
  assert.doesNotMatch(line, /\bstates\b/i);
  assert.doesNotMatch(line, /\.(html?|pdf|docx?)\b/i);
  assert.match(line, /^The source says /);
  assert.doesNotMatch(line, /^The source says "/);
  assert.equal(
    plainSourceSays(passage),
    "The source says the single close at hard cap points to LP concentration in established middle-market managers."
  );
  const spoken = withoutFileVoice(
    'Gemspring Capital Closed Fund IV ... | HedgeCo Insig.html states "The single close at hard cap points to LP concentration in established middle-market managers."'
  );
  assert.doesNotMatch(spoken, /\bstates\b/i);
  assert.doesNotMatch(spoken, /\.html\b/i);
  const card = {
    statement: "Fund IV closed at the hard cap.",
    sentenceLabel: "Nothing raised",
    combinedVerdict: { tone: "green", state: "nothing_raised" },
    evidenceLine: 'Gemspring Capital Closed Fund IV ... | HedgeCo Insig.html states "The single close at hard cap points to LP concentration in established middle-market managers."',
  };
  const reason = cardReason(card);
  assert.ok(reason);
  assert.doesNotMatch(reason, /\.(html?|pdf|docx?)\b/i);
  assert.doesNotMatch(reason, /\bstates "/i);
  assert.doesNotMatch(reason, /HedgeCo Insig/i);
});

test("F06: partial card names the unsupported part from the matcher explanation", () => {
  const card = {
    displayVerdict: "supported_partial",
    statement: "The team is experienced and the pipeline is contractual.",
    matchExplanations: [
      {
        classification: "partially_confirmed",
        explanation:
          "The source confirms the strength of the product. However, it does not address the credibility of the operational team, making the support partial.",
      },
    ],
  };
  const said = partialSentence(card);
  assert.notEqual(said, PARTIAL_UNRECORDED);
  assert.match(said, /operational team|credibility/i);

  const named = partialSentence({
    displayVerdict: "supported_partial",
    statement: "Revenue grew and headcount doubled.",
    unmatchedElements: [{ surface: "headcount doubled" }],
  });
  assert.equal(named, 'Not in the source: "headcount doubled".');
  assert.notEqual(named, PARTIAL_UNRECORDED);
});
