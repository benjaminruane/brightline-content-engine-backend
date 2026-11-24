/**
 * B591. A confirmation whose passage is blank or cannot be found gets one retry for the
 * exact source sentence. The export cleans table and bullet characters instead of refusing.
 * No model call: the retry is a mocked function.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  applyPassageRetry,
  locateRetryPassage,
  normalizeValidResponse,
  passageRetryUserPrompt,
} from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { cleanPassageText, exportBlocks } from "../lib/export/export-blocks.mjs";

const SOURCE = [
  "The NAV total return for the six months to 31 March 2026 was 3.1%.",
  "Share Price Total Return* 5.5%",
  "NAV Per Share | 862.5p | 845.5p",
].join("\n");
const STATEMENT = "PPET delivered a NAV total return of 3.1% in the six months to March 2026.";
const OPTIONS = { sourceLabel: "Patria", statementText: STATEMENT, statementIndex: 0 };

function refusedFirst() {
  const parsed = {
    classification: "confirmed",
    passage: "",
    explanation: "The source confirms the NAV total return of 3.1% for the six months.",
  };
  const normalized = normalizeValidResponse(parsed, SOURCE, OPTIONS);
  return { parsed, normalized };
}

test("a blank confirming passage is refused before the retry", () => {
  const { normalized } = refusedFirst();
  assert.equal(normalized.classification, "not_reviewed");
  assert.equal(normalized.emptyConfirmationRefused, true);
});

test("a verbatim retry gives a located passage and a completed check", async () => {
  const { parsed, normalized } = refusedFirst();
  let calls = 0;
  const out = await applyPassageRetry({
    normalized,
    validParsed: parsed,
    statementText: STATEMENT,
    sourceText: SOURCE,
    normalizeOptions: OPTIONS,
    retry: async () => {
      calls += 1;
      return { parsed: { passage: "The NAV total return for the six months to 31 March 2026 was 3.1%." } };
    },
  });
  assert.equal(calls, 1);
  assert.equal(out.normalized.classification, "confirmed");
  assert.equal(out.normalized.emptyConfirmationRefused, false);
  assert.match(out.normalized.passage, /3\.1%/);
  assert.deepEqual(out.passageRetry, { attempted: true, succeeded: true });
});

test("a NONE retry keeps the refusal", async () => {
  const { parsed, normalized } = refusedFirst();
  const out = await applyPassageRetry({
    normalized,
    validParsed: parsed,
    statementText: STATEMENT,
    sourceText: SOURCE,
    normalizeOptions: OPTIONS,
    retry: async () => ({ parsed: { passage: "NONE" } }),
  });
  assert.equal(out.normalized.classification, "not_reviewed");
  assert.equal(out.normalized.emptyConfirmationRefused, true);
  assert.equal(out.passageRetry.succeeded, false);
  assert.equal(out.passageRetry.reply, "NONE");
});

test("an unlocatable retry keeps the refusal", async () => {
  const { parsed, normalized } = refusedFirst();
  const out = await applyPassageRetry({
    normalized,
    validParsed: parsed,
    statementText: STATEMENT,
    sourceText: SOURCE,
    normalizeOptions: OPTIONS,
    retry: async () => ({ parsed: { passage: "Returns were strong across every region in the period." } }),
  });
  assert.equal(out.normalized.classification, "not_reviewed");
  assert.equal(out.passageRetry.succeeded, false);
  assert.match(out.passageRetry.reply, /Returns were strong/);
});

test("a retry that throws keeps the refusal", async () => {
  const { parsed, normalized } = refusedFirst();
  const out = await applyPassageRetry({
    normalized,
    validParsed: parsed,
    statementText: STATEMENT,
    sourceText: SOURCE,
    normalizeOptions: OPTIONS,
    retry: async () => {
      throw new Error("network");
    },
  });
  assert.equal(out.normalized.classification, "not_reviewed");
  assert.deepEqual(out.passageRetry, { attempted: true, succeeded: false });
});

test("no retry when the first passage locates", async () => {
  const parsed = {
    classification: "confirmed",
    passage: "The NAV total return for the six months to 31 March 2026 was 3.1%.",
    explanation: "The source gives the NAV total return.",
  };
  const normalized = normalizeValidResponse(parsed, SOURCE, OPTIONS);
  let calls = 0;
  const out = await applyPassageRetry({
    normalized,
    validParsed: parsed,
    statementText: STATEMENT,
    sourceText: SOURCE,
    normalizeOptions: OPTIONS,
    retry: async () => {
      calls += 1;
      return { parsed: { passage: "NONE" } };
    },
  });
  assert.equal(calls, 0);
  assert.equal(out.passageRetry, null);
  assert.equal(out.normalized.classification, "confirmed");
});

test("locateRetryPassage ignores NONE and empty replies", () => {
  assert.equal(locateRetryPassage({ passage: "NONE" }, SOURCE), "");
  assert.equal(locateRetryPassage({ passage: "none." }, SOURCE), "");
  assert.equal(locateRetryPassage({}, SOURCE), "");
});

test("the retry prompt asks for verbatim sentences or NONE and carries the explanation", () => {
  const text = passageRetryUserPrompt({ statement: STATEMENT, sourceText: SOURCE, explanation: "Because." });
  assert.match(text, /word for word/);
  assert.match(text, /NONE/);
  assert.match(text, /Because\./);
  assert.match(text, /Statement:\nPPET delivered/);
});

test("cleanPassageText renders table cells with spacing and drops printed bullets", () => {
  assert.equal(cleanPassageText("NAV Per Share | 862.5p | 845.5p"), "NAV Per Share   862.5p   845.5p");
  assert.equal(
    cleanPassageText("· New Investments - 10 new investments"),
    "New Investments - 10 new investments"
  );
  assert.equal(cleanPassageText("• Outstanding Commitments"), "Outstanding Commitments");
});

function documentWith(passages, also) {
  return {
    title: { name: "Reporting commentary review" },
    disclaimer: "Evidence flags compare the draft with the sources you provided.",
    draft: [{ text: "One." }],
    needsAttention: [],
    nothingRaised: [
      {
        heading: "S2 · Nothing raised",
        sentence: "NAV per share rose to 862.5 pence.",
        reason: "The half-year report gives NAV per share of 862.5p.",
        tone: "green",
        passages,
        also,
      },
    ],
  };
}

test("the export no longer refuses a table-row or bulleted passage", () => {
  const doc = documentWith(
    [
      { text: "NAV Per Share | 862.5p | 845.5p", lines: "L73" },
      { text: "· Portfolio Return (in local Currency)* | 2.7% | 8.0%", lines: "L74" },
    ],
    { heading: "Also relevant", text: "· From a private equity perspective | slower M&A", lines: "L120" }
  );
  const blocks = exportBlocks(doc, { cards: true });
  const passageText = blocks
    .filter((b) => b.kind === "passage" || b.kind === "also")
    .map((b) => b.text)
    .join("\n");
  assert.ok(passageText.length > 0);
  assert.doesNotMatch(passageText, /\|/);
  assert.doesNotMatch(passageText, /[·•]/);
  assert.match(passageText, /862\.5p/);
});

import { readFileSync } from "node:fs";
import { validatePassageAgainstSource, verbatimPiecesPassage } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";

const cut = JSON.parse(readFileSync(new URL("./fixtures/b591/patria-cut-lines.json", import.meta.url), "utf8"));

test("B591c: on a source with lines cut off at the edge, the retry keeps only the words that are in the source", () => {
  for (const reply of cut.replies) {
    const passage = locateRetryPassage({ passage: reply }, cut.source);
    assert.ok(passage.length > 0, reply.slice(0, 60));
    assert.equal(validatePassageAgainstSource(passage, cut.source).accepted, true);
  }
  const nav = locateRetryPassage({ passage: cut.replies[0] }, cut.source);
  assert.match(nav, /PPET delivered a NAV total return of 3\.1% \(31/);
  assert.doesNotMatch(nav, /Hormuz/);
  assert.doesNotMatch(nav, /5\.9%\) and a share price/);
  const navPerShare = locateRetryPassage({ passage: cut.replies[1] }, cut.source);
  assert.match(navPerShare, /845\.5 pence\), reflecting continued earnings growth/);
  assert.doesNotMatch(navPerShare, /862\.5 pence/);
});

test("B591c: a stock phrase found in several places is not used as a piece", () => {
  assert.equal(verbatimPiecesPassage("During the six months to 31 March 2026, something else entirely.", cut.source), "");
});

test("B591c: a reply with nothing from the source gives no passage", () => {
  assert.equal(verbatimPiecesPassage("Returns were strong across every region in the period under review here.", cut.source), "");
});

import { gateExcerpt } from "../lib/qc/excerpt-locate.mjs";
import { storedExcerpt } from "../lib/qc/excerpt-sentences.mjs";

test("B591d: retried pieces are the source's own characters, so the card keeps them as its passage", () => {
  const sources = [{ label: "Patria", sourceLabel: "Patria", text: cut.source }];
  for (const reply of cut.replies) {
    const passage = locateRetryPassage({ passage: reply }, cut.source);
    assert.doesNotMatch(passage, /…/);
    const stored = storedExcerpt(passage, cut.source, 0);
    assert.ok(stored, passage.slice(0, 60));
    assert.ok(stored.lineIds.length > 0);
    const gated = gateExcerpt({ passage, sourceLabel: "Patria", sources, supportSpans: [], statementIndex: 0 });
    assert.equal(gated?.passage, passage);
  }
});

import { assembleCard } from "../lib/qc/assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const PATRIA_STATEMENTS = [
  "In the six months to March 2026, Patria Private Equity Trust (PPET) delivered a NAV total return of 3.1% and a share price total return of 5.5%, despite volatile markets driven by Middle East tensions, higher energy prices, and weaker public software valuations.",
  "NAV per share rose to 862.5 pence, supported by portfolio revenue and earnings growth, with the underlying portfolio generating a 2.7% local-currency return.",
  "PPET committed to ten new investments and commitments across primary funds, a secondary, new direct investments, a Patria-managed co-investment fund, and a follow-on.",
  "Realisations and drawdowns reflected continued but slower M&A activity, while outstanding commitments, overcommitment, liquidity, and net gearing all remained within the manager's stated parameters.",
];

test("B591d: a confirmed card built from retried pieces stays green and shows every piece with its lines", async () => {
  const label = "Patria";
  const sources = [{ index: 0, id: "s1", label, text: cut.source, role: "facts" }];
  for (let i = 0; i < cut.replies.length; i += 1) {
    const statementText = PATRIA_STATEMENTS[i];
    const passage = locateRetryPassage({ passage: cut.replies[i] }, cut.source);
    const sourceMatches = [
      { sourceIndex: 0, sourceLabel: label, role: "facts", classification: "confirmed", passage, explanation: "The source confirms the statement." },
    ];
    const supportSpans = [{ sourceRefId: 0, classification: "confirmed", statementId: String(i), passage: "", start: null, end: null }];
    const excerptResult = selectExcerpts({ statementMatches: sourceMatches, verdict: "confirmed", hasConflict: false, supportSpans, sources, statementText });
    const card = await assembleCard(
      {
        statementText,
        startChar: 0,
        endChar: statementText.length,
        supportSpans,
        sourceMatches,
        verdictResult: { verdict: "confirmed", hasConflict: false, confirmingMatches: [{ sourceIndex: 0, sourceLabel: label }], contributingSourceIndices: [0] },
        excerptResult,
        commentaryResult: { commentary: "The source confirms the statement." },
        editorialResult: { editorialVerdict: "clean", editorialConcerns: [], complianceVerdict: "clean", complianceConcerns: [] },
      },
      i,
      { pipelineRoute: "v4", sources, reviewOptions: { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true } }
    );
    assert.equal(card.displayVerdict, "supported_full", statementText.slice(0, 40));
    assert.equal(card.evidenceNotReviewedReason, null);
    assert.ok(Array.isArray(card.primaryExcerptParts) && card.primaryExcerptParts.length > 1);
    assert.ok(card.primaryExcerptLineIds.length > 1);
    for (const part of card.primaryExcerptParts) assert.ok(cut.source.includes(part));
  }
}, 60000);

test("B591g: a tidy sentence the clipped source does not contain cannot displace a real quote", () => {
  const sources = [{ index: 0, label: "Patria", text: cut.source }];
  const statementText = PATRIA_STATEMENTS[1];
  const passage = "2025: 845.5 pence), reflecting continued earnings growth across the underlying portfolio ... currency basis, delivered a portfolio return of approximately 2.7% during the period (31";
  const invented = "NAV per share increased to 862.5 pence (30 September 2025: 845.5 pence), reflecting continued earnings growth across the underlying portfolio, which, on a local currency basis, delivered a portfolio return of approximately 2.7% during the period.";
  const { primaryExcerpt } = selectExcerpts({
    statementMatches: [{ sourceIndex: 0, sourceLabel: "Patria", classification: "confirmed", passage }],
    verdict: "confirmed",
    hasConflict: false,
    supportSpans: [{ sourceRefId: 0, classification: "confirmed", passage: invented }],
    sources,
    statementText,
  });
  assert.equal(primaryExcerpt.parts.length, 2);
  for (const part of primaryExcerpt.parts) assert.ok(cut.source.includes(part));
});

import { evidenceFindingsForReader } from "../lib/qc/reading-review.mjs";

test("B591h: one source not covering a sentence is not passed to the reader when another source confirms it", () => {
  const card = {
    matchExplanations: [
      { classification: "confirmed", explanation: "The press release gives the 2020 investment and the family-owned status." },
      { classification: "no_support", explanation: "The distribution notice does not address the investment year." },
    ],
  };
  assert.equal(evidenceFindingsForReader(card).point, "");
  const partial = {
    matchExplanations: [
      { classification: "confirmed", explanation: "The report gives the date." },
      { classification: "partially_confirmed", explanation: "The report does not give the location." },
    ],
  };
  assert.equal(evidenceFindingsForReader(partial).point, "");
  const conflictAndSilent = {
    matchExplanations: [
      { classification: "no_support", explanation: "The notice does not address NAV." },
      { classification: "conflicting", explanation: "The report gives EUR 678 million, and does not give EUR 652 million." },
    ],
  };
  assert.match(evidenceFindingsForReader(conflictAndSilent).point, /EUR 678 million/);
  const alone = { matchExplanations: [{ classification: "no_support", explanation: "The source does not mention the fund." }] };
  assert.match(evidenceFindingsForReader(alone).point, /does not mention the fund/);
});
