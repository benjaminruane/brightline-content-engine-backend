/**
 * B597 Part A. Explain five open findings on the preview runs (build dc5d62f).
 * Loads Harbourline R-937B, Aldermoor (October opener), and Patria from
 * ~/ce-diagnostics/b597-diag/inputs/ (dumped from preview review_state).
 * Read-only on product code. No model call. USD 0.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BE = path.resolve(HERE, "../../..");
const OUT = path.join(process.env.HOME || "", "ce-diagnostics/b597-diag");
const INPUTS = path.join(OUT, "inputs");

const { matcherNamedGaps, checksDisagreeGoesGreen, everyReadingFactMatched } = await import(
  pathToFileURL(path.join(BE, "lib/qc/b595-card-rules.mjs")).href
);
const { draftFlow, draftFlowPlain } = await import(
  pathToFileURL(path.join(BE, "lib/export/export-blocks.mjs")).href
);
const { renderPdf } = await import(
  pathToFileURL(path.join(BE, "lib/export/render-pdf.mjs")).href
);

mkdirSync(INPUTS, { recursive: true });
mkdirSync(OUT, { recursive: true });

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function loadEnvLocal() {
  const raw = readFileSync(path.join(BE, ".env.local"), "utf8");
  const m = raw.match(/PREVIEW_DATABASE_URL_UNPOOLED=["']?([^"'\n]+)/);
  if (!m) throw new Error("explain-findings: PREVIEW_DATABASE_URL_UNPOOLED missing from .env.local");
  return m[1].replace(/^['"]|['"]$/g, "");
}

async function ensurePartAInputs() {
  const needed = {
    "harbourline-R-937B.json": null,
    "aldermoor-october.json": null,
    "patria.json": null,
    "patria.state.json": null,
  };
  const missing = Object.keys(needed).filter((name) => !existsSync(path.join(INPUTS, name)));
  if (!missing.length) return;

  const sql = neon(loadEnvLocal());
  const rows = await sql`
    select review_id, updated_at, state
    from review_state
    where state::text ilike '%R-937B%'
       or state::text ilike '%In October 2026, Halden Group committed to Aldermoor%'
       or state::text ilike '%six months to March 2026, Patria%'
    order by updated_at desc
    limit 30
  `;

  let harbour = null;
  let alder = null;
  let patria = null;
  for (const row of rows) {
    const draft = String(row.state?.draftText || row.state?.draft || "");
    const analysis = row.state?.analysisResult;
    const ref = analysis?.meta?.reviewReference || row.state?.reviewReference || "";
    if (!harbour && (ref === "R-937B" || /Harbourline Foods/.test(draft))) {
      harbour = { row, analysis, draft };
    }
    if (!alder && /In October 2026, Halden Group committed to Aldermoor/.test(draft)) {
      alder = { row, analysis, draft };
    }
    if (!patria && /In the six months to March 2026, Patria/.test(draft)) {
      patria = { row, analysis, draft };
    }
  }
  if (!harbour?.analysis) throw new Error("explain-findings: Harbourline R-937B not in preview DB");
  if (!alder?.analysis) throw new Error("explain-findings: Aldermoor October not in preview DB");
  if (!patria?.analysis) throw new Error("explain-findings: Patria not in preview DB");

  writeFileSync(path.join(INPUTS, "harbourline-R-937B.json"), `${JSON.stringify(harbour.analysis, null, 2)}\n`);
  writeFileSync(path.join(INPUTS, "aldermoor-october.json"), `${JSON.stringify(alder.analysis, null, 2)}\n`);
  writeFileSync(path.join(INPUTS, "patria.json"), `${JSON.stringify(patria.analysis, null, 2)}\n`);
  writeFileSync(
    path.join(INPUTS, "patria.state.json"),
    `${JSON.stringify({ review_id: patria.row.review_id, updated_at: patria.row.updated_at, state: patria.row.state }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(INPUTS, "harbourline-R-937B.state.json"),
    `${JSON.stringify({ review_id: harbour.row.review_id, updated_at: harbour.row.updated_at, state: harbour.row.state }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(INPUTS, "aldermoor-october.state.json"),
    `${JSON.stringify({ review_id: alder.row.review_id, updated_at: alder.row.updated_at, state: alder.row.state }, null, 2)}\n`,
  );
}

function cardFace(body, index) {
  const row = body.statements[index];
  const card = row?.qcCard || {};
  const text = typeof row?.text === "string" ? row.text : (card.statement || "");
  const match = (Array.isArray(card.matchExplanations) ? card.matchExplanations : [])
    .map((m) => `${m.classification}: ${clean(m.explanation).slice(0, 160)}`);
  const reader = clean(card.readingNote?.text) || clean(card.displayedEvidenceProse) || "";
  return {
    index,
    text,
    branch: card.combinedVerdict?.setBy?.branch
      || card.setBy?.branch
      || card.statementVerdict?.setBy?.branch
      || card.shownTrace?.branch
      || "",
    shownTrace: card.shownTrace || null,
    matcher: match,
    readerVerdict: card.displayVerdict || card.supportState || "",
    readerNote: reader,
    combinedVerdict: card.combinedVerdict || null,
    sentenceLabel: card.sentenceLabel || card.combinedVerdict?.label || "",
    shownReason: card.shownReason || card.evidenceSummary || "",
    stampAuthority: card.stampAuthority || body.meta?.stampAuthority || "",
    stampGuard: card.stampGuard || "",
    gaps: matcherNamedGaps(card),
    factsMatched: everyReadingFactMatched(card),
    ruleB: checksDisagreeGoesGreen(card),
    editorial: card.editorialConcerns || [],
    compliance: card.complianceConcerns || [],
    houseStyle: card.houseStyleConcerns || [],
    card,
  };
}

function draftMarkers(draft, cards) {
  let cursor = 0;
  const sentences = [];
  for (const card of cards) {
    const at = draft.indexOf(card.sentence, cursor);
    if (at < 0) throw new Error(`export: ${card.number} is not in the draft`);
    if (at > cursor) {
      const gap = draft.slice(cursor, at);
      if (/^\s*$/.test(gap) && sentences.length) sentences[sentences.length - 1].text += gap;
      else sentences.push({ text: gap, marker: "" });
    }
    sentences.push({ text: card.sentence, marker: card.number });
    cursor = at + card.sentence.length;
  }
  if (cursor < draft.length) {
    const gap = draft.slice(cursor);
    if (/^\s*$/.test(gap) && sentences.length) sentences[sentences.length - 1].text += gap;
    else sentences.push({ text: gap, marker: "" });
  }
  return sentences.filter((part) => part.text);
}

await ensurePartAInputs();

const harbour = JSON.parse(readFileSync(path.join(INPUTS, "harbourline-R-937B.json"), "utf8"));
const alder = JSON.parse(readFileSync(path.join(INPUTS, "aldermoor-october.json"), "utf8"));
const patria = JSON.parse(readFileSync(path.join(INPUTS, "patria.json"), "utf8"));
const patriaState = JSON.parse(readFileSync(path.join(INPUTS, "patria.state.json"), "utf8"));
const patriaDraft = String(patriaState.state?.draftText || "");

const s5 = cardFace(harbour, 4);
const s8 = cardFace(harbour, 7);
const s13 = cardFace(harbour, 12);
const a3 = cardFace(alder, 2);

const answers = [];

answers.push({
  id: 1,
  title: "Harbourline S8 amber “differ on” Irish listings / revenue / Cork",
  face: {
    branch: s8.branch,
    matcher: s8.matcher,
    readerVerdict: s8.readerVerdict,
    readerNote: s8.readerNote.slice(0, 240),
    combinedVerdict: s8.combinedVerdict,
    sentenceLabel: s8.sentenceLabel,
    shownReason: s8.shownReason,
    stampAuthority: s8.stampAuthority,
    stampGuard: s8.stampGuard,
    gaps: s8.gaps,
  },
  whyAmber: [
    "shownTrace / combinedVerdict.setBy.branch is checksDisagree (facts source: Q2 quarterly report).",
    "displayVerdict is conflict while the press-release reading note supports the sentence — checks disagree.",
    "matcherNamedGaps extracts from the partially_confirmed Q2 match explanation the clause after “does not address”: “the listings with Irish retailers, revenue doubling, or capacity doubling at the Cork site”.",
    "Those named gaps block Rule B (checksDisagreeGoesGreen requires zero named gaps), so the card stays amber.",
    "The press-release line that states all three is the reader note / primary press extract; the amber “differ on” list is not from that line — it is from the Q2 matcher’s partially_confirmed explanation.",
  ],
  reasonPath: "lib/qc/b596-stamp.mjs guardAmberOrRedReason → matcherNamedGaps → template `The sentence and the source differ on ${gaps[0]}.` (guard named_gap). Live stampAuthority=b596 on the card; shownReason already carries that template output.",
});

answers.push({
  id: 2,
  title: "Aldermoor S3 amber support-only / why Rule B did not green",
  face: {
    branch: a3.branch,
    matcher: a3.matcher,
    readerVerdict: a3.readerVerdict,
    combinedVerdict: a3.combinedVerdict,
    sentenceLabel: a3.sentenceLabel,
    shownReason: a3.shownReason,
    gaps: a3.gaps,
    factsMatched: a3.factsMatched,
    ruleBEligible: a3.ruleB,
  },
  whyNotGreen: [
    "combinedVerdict.setBy.branch is refusedReading (PROTECTED_BRANCHES in b596-stamp.mjs).",
    "guardAmberOrRedReason only applies Rule B when branch is checksDisagree / checksDisagreeFacts, or the branch is not protected. refusedReading is protected, so Rule B never runs even though everyReadingFactMatched and checksDisagreeGoesGreen would both be true on the card facts/matcher.",
    "The preferred reason (“The source says Aldermoor expects…”) does not match SUPPORTS (no supports/confirms/in line with) and does not match GAP_LANGUAGE, so it is neither reasonOnlySupports nor reasonStatesGap.",
    "named_gap fill requires gaps.length && (reasonOnlySupports || !reason) — gaps are empty and reason is present, so named_gap does not fire.",
    "look_fallback only replaces support-only or empty reasons — this restatement is kept. Result: amber with a reason that names nothing missing.",
  ],
  reasonPath: "lib/qc/shown-verdict.mjs shownTrace → refusedReading sets note_withheld; lib/qc/b596-stamp.mjs guardAmberOrRedReason → guard kept (protected branch, non-gap restatement).",
});

answers.push({
  id: 3,
  title: "Harbourline S5 “differ on The sentence states…”",
  face: {
    branch: s5.branch,
    matcher: s5.matcher,
    readerVerdict: s5.readerVerdict,
    combinedVerdict: s5.combinedVerdict,
    sentenceLabel: s5.sentenceLabel,
    shownReason: s5.shownReason,
    gaps: s5.gaps,
  },
  template: "lib/qc/b596-stamp.mjs L133: `The sentence and the source differ on ${gaps[0]}.`",
  howGlued: [
    "matcherNamedGaps (lib/qc/b595-card-rules.mjs): for classification conflicting/partially_confirmed with no quoted span and no “does not address …” clause, pushes explanation.slice(0, 120).",
    "The conflicting match explanation already begins with “The sentence states the sale is expected to complete in the third quarter, but the source confirms…”.",
    "That whole slice becomes gaps[0], so the template glues a full sentence into the “differ on” slot, producing a capital letter after “differ on”.",
  ],
  reasonPath: "guardAmberOrRedReason named_gap path (preferred reason empty or support-only at stamp time) → matcherNamedGaps → template above.",
});

const patriaCards = (patria.statements || []).map((row, i) => ({
  number: `S${i + 1}`,
  sentence: row.text,
}));
const marked = draftMarkers(patriaDraft, patriaCards);
const eventsWithDraft = draftFlow(marked, patriaDraft);
const eventsWithout = draftFlow(marked.map((part) => ({
  ...part,
  text: part.text.replace(/\n+/g, " ").trim(),
})), "");
const buf = await renderPdf({
  title: {
    name: "Patria real",
    verdict: "Ready",
    detail: "",
    writingFor: "",
    reviewed: "",
    sourceNames: [],
    exported: "",
  },
  draft: marked,
  fullDraft: patriaDraft,
  cards: [],
  sources: [],
  howToRead: {
    title: "How to read this review",
    labels: ["Nothing raised: the sentence sits with the source."],
    lineNote: "Line numbers refer to the source text as Content Engine read it.",
    disclaimer: "Diagnostic B597 render of the real Patria draft.",
  },
  disclaimer: "Diagnostic B597 render of the real Patria draft.",
}, { draft: true });
writeFileSync(path.join(OUT, "patria-real.pdf"), buf);

answers.push({
  id: 4,
  title: "Patria PDF loses paragraph spacing before Read more",
  draftChars: patriaDraft.length,
  draftHasBlankLines: /\n\n/.test(patriaDraft),
  paragraphCount: patriaDraft.split(/\n\n+/).filter(Boolean).length,
  draftPreview: patriaDraft,
  markedTrailingBreaks: marked.map((part) => ({
    marker: part.marker,
    trailingNewlines: (part.text.match(/\n+$/) || [""])[0].length,
    leadingNewlines: (part.text.match(/^\n+/) || [""])[0].length,
    start: part.text.slice(0, 40).replace(/\n/g, "\\n"),
  })),
  breaksWithFullDraft: eventsWithDraft.filter((e) => e.kind === "break").length,
  breaksStrippedSpans: eventsWithout.filter((e) => e.kind === "break").length,
  plainWithFullDraft: draftFlowPlain(eventsWithDraft) === patriaDraft,
  whereLost: [
    "Real draftText in review_state has \\n\\n between paragraphs and before “Read more here”.",
    "FE buildExportDocument.draftMarkers folds whitespace gaps into the previous sentence span (or leaves an unmarked gap span). That is correct when fullDraft is also passed.",
    "The live R-12AA export (Downloads PDF, build c9574b4, before B596 fullDraft wiring on this run) painted via draftFlow(sentences) with no usable between-span breaks: draftFlow only counted trailing \\n inside each sentence text. Paragraph breaks that lived between claim spans never became break events, so render-pdf.mjs never called moveDown for a paragraph gap.",
    "Loss point: lib/export/export-blocks.mjs draftFlow (pre-fullDraft / empty fullDraft path) → lib/export/render-pdf.mjs draft painter. B596 added fullDraft into export-blocks and FE buildExportDocument; the R-12AA PDF on disk still shows the old flush layout.",
  ],
  png: path.join(OUT, "patria-real.png"),
  pdf: path.join(OUT, "patria-real.pdf"),
});

answers.push({
  id: 5,
  title: "Harbourline editorial count 1 with no editorial on any card",
  summaryEditorial: harbour.meta?.reviewSummary?.editorial,
  concern: s13.editorial[0] || null,
  cardLabel: s13.sentenceLabel,
  whyHidden: [
    `meta.reviewSummary.editorial.concerns=1 counts S13 returns_form on “${s13.text}”.`,
    "StatementReviewCard builds editorial lines via craftEditorialConcerns → dropSharedPhrase → visibleConcerns.",
    "visibleConcerns(..., { evidenceRaised: evidenceLevel === \"red\" || evidenceLevel === \"amber\" }) drops every editorial concern when the card’s evidence face is amber or red.",
    "S13 is Needs a look (amber) for the gross/net / statementVerdict path, so returns_form is counted in the summary and suppressed on the card face. The card shows the compliance / shownReason gross-net line instead.",
  ],
  reasonPath: "backend summariseReview counts editorialConcerns; FE src/modules/drafting/cardReason.js visibleConcerns hides them when evidenceRaised.",
});

const report = {
  generatedAt: new Date().toISOString(),
  builds: {
    harbourline: harbour.meta?.build,
    aldermoor: alder.meta?.build,
    patria: patria.meta?.build,
  },
  refs: {
    harbourline: harbour.meta?.reviewReference,
    aldermoor: alder.meta?.reviewReference,
    patria: patria.meta?.reviewReference,
  },
  answers,
};

writeFileSync(path.join(OUT, "part-a.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  refs: report.refs,
  builds: report.builds,
  answers: answers.map((a) => ({ id: a.id, title: a.title })),
  patriaPdfBytes: buf.length,
  out: path.join(OUT, "part-a.json"),
}, null, 2));
