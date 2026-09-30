/**
 * B349. Read-only. Does the product have one honesty fault or eight,
 * and is a sentence the right unit.
 *
 * The 29 September production payloads are not in this repo (P33).
 * Sentences below are reconstructed from the spec's verbatim fragments
 * so isCompoundCandidate can be run. They are labelled RECONSTRUCTED.
 */
import { isCompoundCandidate, ADDITIVE_BOUNDARIES, relationalConnectivesIn } from "../../../lib/qc/claim-spans.mjs";
import { gateExcerpt, rewriteSpanFromSource } from "../../../lib/qc/excerpt-locate.mjs";
import { selectExcerpts } from "../../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import {
  annotateTokens,
  findCandidatePairs,
  sameQuantity,
} from "../../../lib/revise-actions/conflict-engagement.mjs";
import { evidenceCandidates, thing1FromCandidates } from "../../../lib/revise-actions/thing1.mjs";

const LABEL = "3i HY FY2026 highlights";

/**
 * Run A, reconstructed from the spec's quoted fragments and Ben's
 * fifteen-sentence / 330-word account. Not the live payload.
 */
const RUN_A = [
  {
    i: 0,
    benMulti: true,
    text: "3i Group delivered a total return of £3,291 million, or 13% on opening shareholders' funds, in the six months to 30 June 2025.",
  },
  {
    i: 1,
    benMulti: true,
    text: "Private Equity generated a gross investment return of 14% in the first half.",
  },
  {
    i: 2,
    benMulti: true,
    text: "Action remains the largest Private Equity investment and continued to perform well.",
  },
  {
    i: 3,
    benMulti: false,
    text: "Action's new store expansion programme is on track for another record year.",
  },
  {
    i: 4,
    benMulti: true,
    text: "The Group's net asset value per share increased over the period.",
  },
  {
    i: 5,
    benMulti: true,
    text: "Action generated net sales of €11.2 billion and like-for-like sales growth of 6.3% for the nine months ending 28 September 2025.",
  },
  {
    i: 6,
    benMulti: false,
    text: "Several balance sheet transactions were completed during October 2025.",
  },
  {
    i: 7,
    benMulti: true,
    text: "Action completed a €3.1 billion repricing, extended maturities, reduced interest cost, and raised an incremental €1.6 billion.",
  },
  {
    i: 8,
    benMulti: false,
    text: "Action also completed a significant pro-rata redemption of shares.",
  },
  {
    i: 9,
    benMulti: true,
    text: "3i increased its stake in Action to 62.3% after an earlier 2.2% purchase from GIC, with £755 million redeployed for the acquisition.",
  },
  {
    i: 10,
    benMulti: false,
    text: "Realisations included MPM and MAIT at attractive money multiples.",
  },
  {
    i: 11,
    benMulti: true,
    text: "The infrastructure asset portfolio within 3iN outperformed its expected returns for the six-month period.",
  },
  {
    i: 12,
    benMulti: false,
    text: "Performance was driven primarily by share price gains at 3i Infrastructure plc.",
  },
  {
    i: 13,
    benMulti: false,
    text: "NAV per share was 2,681 pence, equivalent to £26.81.",
  },
  {
    i: 14,
    benMulti: false,
    text: "Management announced a further share buyback.",
  },
];

function compoundRow(row) {
  const text = row.text;
  const compound = isCompoundCandidate(text);
  const boundaries = ADDITIVE_BOUNDARIES.filter((b) => text.includes(b));
  const connectives = relationalConnectivesIn(text);
  return {
    i: row.i,
    benMulti: row.benMulti,
    compound,
    boundaries,
    connectives,
    chars: text.length,
    text,
  };
}

function printTable(title, rows) {
  console.log(`\n=== ${title} ===`);
  for (const row of rows) {
    console.log(
      `S${row.i}  compound=${row.compound}  benMulti=${row.benMulti}  boundaries=${JSON.stringify(row.boundaries)}  connectives=${JSON.stringify(row.connectives)}`
    );
    console.log(`     ${row.text}`);
  }
}

const compoundRows = RUN_A.map(compoundRow);
printTable("A7 isCompoundCandidate on reconstructed Run A (payloads not in repo)", compoundRows);
const admitted = compoundRows.filter((r) => r.compound).map((r) => `S${r.i}`);
console.log(`admitted: ${admitted.length ? admitted.join(", ") : "(none)"}`);
console.log(`wordCountApprox: ${RUN_A.map((r) => r.text.split(/\s+/).length).reduce((a, b) => a + b, 0)}`);

const e5Source = [
  "In October 2025, Action successfully completed two financing transactions.",
  "The first raised €1.6 billion of total",
  "incremental term loan debt.",
  "Subsequently the company applied proceeds to a pro-rata redemption of shares held by minority investors alongside a further package of documented terms that extended well beyond the first three hundred characters of this paragraph.",
].join("\n");

const excerpts = selectExcerpts({
  statementMatches: [
    {
      sourceIndex: 0,
      sourceLabel: LABEL,
      classification: "confirmed",
      passage: e5Source,
    },
  ],
  verdict: "confirmed",
  hasConflict: false,
  supportSpans: [],
  sources: [{ text: e5Source, label: LABEL }],
  statementText: "Action also completed a significant pro-rata redemption of shares.",
});
console.log("\n=== A3 Stage 4 trim on an E5-shaped passage (period then newline, not period-space) ===");
console.log(`sourceChars=${e5Source.length}`);
console.log(`primaryExcerptChars=${String(excerpts.primaryExcerpt?.passage || "").length}`);
console.log(`primaryExcerpt=${JSON.stringify(excerpts.primaryExcerpt?.passage || null)}`);
console.log(`endsWith=${JSON.stringify(String(excerpts.primaryExcerpt?.passage || "").slice(-12))}`);

const locatedSpan = {
  sourceRefId: 0,
  classification: "confirmed",
  start: 0,
  end: Math.min(e5Source.length, 360),
  passage: e5Source.slice(0, Math.min(e5Source.length, 360)),
};
const sources = [{ text: e5Source, label: LABEL }];
const rewritten = rewriteSpanFromSource(locatedSpan, sources);
const gated = gateExcerpt({
  passage: excerpts.primaryExcerpt?.passage || "",
  sourceLabel: LABEL,
  sources,
  supportSpans: [locatedSpan],
});
console.log("\n=== A1 two locators ===");
console.log(`rewriteSpanFromSource.passageChars=${String(rewritten?.passage || "").length}`);
console.log(`gateExcerpt.passage=${gated ? JSON.stringify(gated.passage).slice(0, 120) : "null"}`);
console.log("gateExcerpt voids supportSpans (excerpt-locate.mjs). Confirmed Stage 4 never reads supportSpans.");

const emptySpan = rewriteSpanFromSource(
  { sourceRefId: 0, classification: "confirmed", start: null, end: null, passage: "" },
  sources
);
console.log("\n=== A2 empty confirmation span ===");
console.log(`emptyPointerRewrite=${JSON.stringify({ passage: emptySpan?.passage, start: emptySpan?.start, end: emptySpan?.end })}`);

const s0Draft = RUN_A[0].text;
const s0Source = "3i Group delivered a total return of £3,291 million, or 13% on opening shareholders' funds, in the six months to 30 September 2025.";
const s0UnitDraft =
  "3i Group delivered a total return of £3,291 billion, or 13% on opening shareholders' funds, in the six months to 30 September 2025.";
console.log("\n=== A6 findCandidatePairs dates and units ===");
console.log("S0 date tokens in draft:", annotateTokens(s0Draft).filter((t) => t.kind === "date").map((t) => ({ raw: t.raw, kind: t.kind, value: t.value })));
console.log("S0 pairs vs September source:", findCandidatePairs(s0Draft, s0Source));
console.log("unit draft money tokens:", annotateTokens(s0UnitDraft).filter((t) => t.kind === "money").map((t) => ({ raw: t.raw, kind: t.kind, scale: t.scale, value: t.value })));
console.log("unit source money tokens:", annotateTokens(s0Source).filter((t) => t.kind === "money").map((t) => ({ raw: t.raw, kind: t.kind, scale: t.scale, value: t.value })));
const unitDraftMoney = annotateTokens(s0UnitDraft).find((t) => t.kind === "money");
const unitSourceMoney = annotateTokens(s0Source).find((t) => t.kind === "money");
console.log("sameQuantity million vs billion:", unitDraftMoney && unitSourceMoney ? sameQuantity(unitDraftMoney, unitSourceMoney) : null);
console.log("unit pairs:", findCandidatePairs(s0UnitDraft, s0Source));
console.log("standalone 'million' tokens:", annotateTokens("the unit is million").map((t) => ({ raw: t.raw, kind: t.kind })));

const fourteen = "Private Equity generated a gross investment return of 14% in the first half.";
const thirteen = "The total return of 13% represents a very good first half for the Group.";
const oneThirtyNine = "3iN generated £139 million of income and a 9% total return.";
const ceoPara = "the infrastructure asset portfolio within 3iN outperformed its expected returns for the six-month period";
const ordered = selectExcerpts({
  statementMatches: [
    { sourceIndex: 0, sourceLabel: LABEL, classification: "confirmed", passage: thirteen },
    { sourceIndex: 0, sourceLabel: LABEL, classification: "confirmed", passage: fourteen },
  ],
  verdict: "confirmed",
  hasConflict: false,
  supportSpans: [
    { sourceRefId: 0, classification: "confirmed", passage: fourteen },
    { sourceRefId: 0, classification: "confirmed", passage: ceoPara },
  ],
  sources: [{ text: `${thirteen} ${fourteen} ${ceoPara}`, label: LABEL }],
  statementText: fourteen,
});
const s11sel = selectExcerpts({
  statementMatches: [
    { sourceIndex: 0, sourceLabel: LABEL, classification: "confirmed", passage: oneThirtyNine },
    { sourceIndex: 0, sourceLabel: LABEL, classification: "confirmed", passage: ceoPara },
  ],
  verdict: "confirmed",
  hasConflict: false,
  supportSpans: [{ sourceRefId: 0, classification: "confirmed", passage: ceoPara }],
  sources: [{ text: `${oneThirtyNine} ${ceoPara}`, label: LABEL }],
  statementText: RUN_A[11].text,
});
console.log("\n=== A4 first confirmed match wins (source order), spans ignored on confirmed ===");
console.log(`S1-shaped primary=${JSON.stringify(ordered.primaryExcerpt?.passage)}`);
console.log(`S11-shaped primary=${JSON.stringify(s11sel.primaryExcerpt?.passage)}`);

const s8 = RUN_A[8].text;
const thing1 = thing1FromCandidates(
  evidenceCandidates(
    {
      unsupportedSpans: [{ text: s8, start: 0, end: s8.length }],
      evidenceSummary: 'The source does not use the word "significant" in describing the redemption.',
    },
    s8
  ),
  s8
);
console.log("\n=== A8 thing1 on a whole-sentence unsupportedSpan plus a quoted word ===");
console.log(JSON.stringify({ state: thing1.state, quote: thing1.chosen?.quote, source: thing1.chosen?.source, length: thing1.chosen?.length }));
