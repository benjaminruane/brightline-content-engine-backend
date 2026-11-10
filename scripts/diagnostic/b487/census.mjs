/**
 * B487. The B467 census, pointed at the B486 pass. No model call.
 *
 *   node scripts/diagnostic/b487/census.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { censusRows } from "../b460/census.mjs";
import { attentionHeader } from "../../../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js";
import { relationPrefix } from "../../../../brightline-content-engine-frontend/src/utils/sourceRelationPrefix.js";
import { classifyCard, summariseReview } from "../../../lib/qc/review-summary.mjs";
import { summaryBulletsFromReview } from "../../../lib/qc/summary-bullets.mjs";
import { evidenceFindingForExport } from "../../../lib/qc/export-review-data.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { notCheckedReasonSentence } from "../../../lib/qc/not-reviewed-reason.mjs";
import { sourceAwarenessDropIsOutOfScope } from "../../../lib/qc/editorial-source-awareness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b486/pass-1.json");
const OUT = path.join(__dirname, "CENSUS5.md");

function instrumentHeader(sentences) {
  const rows = Array.isArray(sentences) ? sentences : [];
  let light = 0;
  let conflicts = 0;
  for (const row of rows) {
    if (row?.sentenceState === "beyond" || row?.sentenceState === "partial") light += 1;
    const state = typeof row?.sentenceState === "string" ? row.sentenceState : "";
    const display = String(row?.displayVerdict || "").toLowerCase();
    const quiet = state === "nothing_raised" || state === "nothing_to_raise";
    if (quiet && display === "supported_partial") light += 1;
    if (state === "conflicts" || (quiet && (display === "conflict" || display === "conflicts"))) conflicts += 1;
  }
  const parts = [];
  if (conflicts === 1) parts.push("1 statement conflicts with the source");
  else if (conflicts > 1) parts.push(`${conflicts} statements conflict with the source`);
  if (light === 1) parts.push("1 worth a glance");
  else if (light > 1) parts.push(`${light} worth a glance`);
  return parts.join(". ");
}

function byFixture(cards) {
  const groups = new Map();
  for (const card of cards) {
    const id = String(card.fixtureId).padStart(2, "0");
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(card);
  }
  return groups;
}

function bulletSlots(summary) {
  const ev = summary?.evidence || {};
  const slots = [];
  if (ev.notSupported > 0) slots.push("unsupported");
  if (ev.conflicting > 0) slots.push("conflicting");
  if ((summary?.notChecked || 0) > 0) slots.push("not checked");
  if (ev.beyond > 0) slots.push("beyond");
  if (ev.partial > 0) slots.push("partial");
  if (ev.needsLook > 0) slots.push("needs a look");
  if ((summary?.signalConcerns || 0) > 0) slots.push("editorial or compliance");
  if (ev.unbadged > 0) slots.push("unbadged");
  return slots;
}

function faultCounts(cards) {
  let beyondLeftOut = 0;
  let summaryCut = 0;
  let editorialCut = 0;
  for (const [, group] of byFixture(cards)) {
    const summary = summariseReview(group, { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true });
    const slots = bulletSlots(summary);
    const bullets = summaryBulletsFromReview(summary);
    if (slots.length > bullets.length) summaryCut += 1;
    if (slots.includes("editorial or compliance") && !bullets.some((line) => /editorial|compliance/i.test(line))) {
      editorialCut += 1;
    }
    for (const card of group) {
      if (card.sentenceState !== "beyond") continue;
      const cls = classifyCard(card, { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true });
      if (!cls.needsAttention) beyondLeftOut += 1;
    }
  }
  let unnamed = 0;
  for (const card of cards) {
    for (const row of card.matchExplanations || []) {
      const cls = String(row.classification || "");
      if (!cls) continue;
      if (relationPrefix(cls) === "Relates to the statement:") unnamed += 1;
    }
  }
  let exportDiff = 0;
  let emptyWhy = 0;
  for (const card of cards) {
    const reason = readerEvidenceSentence(card);
    if (reason == null) continue;
    const finding = evidenceFindingForExport(card, false) || "";
    if (finding !== reason) exportDiff += 1;
    if (!String(reason).trim()) emptyWhy += 1;
  }
  let headerOmits = 0;
  let headerLeadsLight = 0;
  let instrumentOmits = 0;
  for (const [, group] of byFixture(cards)) {
    const view = group.map((card) => ({
      sentenceState: card.sentenceState,
      displayVerdict: card.displayVerdict,
      facts: card.readingFacts || [],
    }));
    const line = attentionHeader(view);
    const old = instrumentHeader(group.map((card) => ({
      sentenceState: card.sentenceState,
      displayVerdict: card.displayVerdict,
      facts: [],
    })));
    const hasConflict = group.some((card) => card.sentenceState === "conflicts" || card.displayVerdict === "conflict");
    if (hasConflict && line && !/conflict/i.test(line)) headerOmits += 1;
    if (hasConflict && line && /^(?:\d+ worth a glance|\d+ facts? )/.test(line) && !/conflict/i.test(line)) headerLeadsLight += 1;
    if (hasConflict && old && !/conflict/i.test(old)) instrumentOmits += 1;
  }
  let notCheckedHidden = 0;
  for (const card of cards) {
    const slug = [card.evidenceNotReviewedReason, card.editorialNotReviewedReason, card.complianceNotReviewedReason, card.commentaryNotReviewedReason]
      .find((value) => typeof value === "string" && value.trim());
    if (!slug) continue;
    const sentence = notCheckedReasonSentence(slug);
    if (!sentence || sentence === slug) notCheckedHidden += 1;
  }
  let awarenessStill = 0;
  let awarenessClosed = 0;
  for (const card of cards) {
    const drops = Array.isArray(card.drops) ? card.drops : [];
    if (drops.length) {
      for (const drop of drops) {
        if (drop?.rule !== "source_awareness" || drop?.reason !== "dropped") continue;
        if (sourceAwarenessDropIsOutOfScope(drop.content)) awarenessClosed += 1;
        else awarenessStill += 1;
      }
      continue;
    }
    for (const row of card.silences || []) {
      if (row?.id !== "source_awareness") continue;
      const content = Array.isArray(row.content) ? row.content.join(" ") : row.content;
      if (sourceAwarenessDropIsOutOfScope(content)) awarenessClosed += 1;
      else awarenessStill += 1;
    }
  }
  return {
    beyondLeftOut,
    summaryCut,
    editorialCut,
    unnamed,
    exportDiff,
    emptyWhy,
    headerOmits,
    headerLeadsLight,
    instrumentOmits,
    notCheckedHidden,
    awarenessStill,
    awarenessClosed,
  };
}

const WHY = [
  {
    test: /A beyond sentence is left out of To look at/,
    take: (f) => f.beyondLeftOut,
    why: "The instrument counted every beyond sentence. To look at already includes them. The ones left out are zero.",
  },
  {
    test: /The summary stops after three points/,
    take: (f) => f.summaryCut,
    why: "The instrument counted drafts with more than three slots. The summary now prints every non-zero slot, so none are cut.",
  },
  {
    test: /The header is replaced, and the replacement does not name a conflict/,
    take: (f) => f.headerOmits,
    before: (f) => f.instrumentOmits,
    why: "The instrument counted a conflict only when the sentence state was conflicts. Draft 19 carries the conflict on other states, and the line now names it.",
  },
  {
    test: /painted amber and prefixed Relates to the statement/,
    take: (f) => f.unnamed,
    why: "The instrument counted every class other than confirmed, partial, and conflicting. Those classes now have their own prefix. None still use Relates to the statement.",
  },
  {
    test: /quotes a different evidence sentence/,
    take: (f) => f.exportDiff,
    before: () => 8,
    why: "The instrument compared the export with the stored prose and got 8. The sentence on the card is the reader sentence, and the export matches it.",
  },
  {
    test: /The row says Not checked/,
    take: (f) => f.notCheckedHidden,
    why: "The instrument counted a stored slug. The row now shows the sentence for that slug. The same two cards were counted once for each heading.",
  },
  {
    test: /The header leads with a light item/,
    take: (f) => f.headerLeadsLight,
    before: (f) => f.instrumentOmits,
    why: "The instrument used the same conflict count as the replaced-header row. Draft 02 led with a glance while a needs-a-look card sat underneath, and that line now leads with the heavier card.",
  },
  {
    test: /Editorial and compliance notes never reach the summary/,
    take: (f) => f.editorialCut,
    why: "The instrument counted drafts with more than three slots. The editorial or compliance bullet is in the summary whenever that count is non-zero.",
  },
  {
    test: /words also appear in the source disappears/,
    take: (f) => f.awarenessStill,
    why: "The instrument counted every source-awareness silence. House style, number form, and relevance are shown again. The number that remains is the evaluative objections the check is still meant to drop.",
  },
  {
    test: /The label stands and the why sentence is empty/,
    take: (f) => f.emptyWhy,
    why: "The instrument counted an empty stored prose field. The why sentence is the reader sentence.",
  },
];

const CANNOT = [
  {
    test: /A framing or recency note is on the card and there is no proposal/,
    why: "The instrument counted every framing and recency note. A proposal is not on the card, so a note with no proposal cannot be split from the population.",
  },
  {
    test: /A sentence with no support is not searched again/,
    why: "The instrument counted every no-support match. Nothing on the card says whether that sentence was searched again.",
  },
];

function silenceCount(cards, id) {
  let n = 0;
  for (const card of cards) {
    for (const row of card.silences || []) {
      if (row?.id === id) n += 1;
    }
  }
  return n;
}

function rewriteCount(cards, rule) {
  let n = 0;
  for (const card of cards) {
    for (const row of card.classificationRewrites || []) {
      if (row?.rule === rule) n += 1;
    }
  }
  return n;
}

function siteCodes() {
  const markdown = readFileSync(path.join(__dirname, "../b426/CENSUS.md"), "utf8");
  const codes = [];
  let inTable = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("# ")) {
      inTable = false;
      continue;
    }
    if (line.startsWith("| site |")) {
      inTable = true;
      continue;
    }
    if (!inTable || !line.startsWith("|")) continue;
    if (line.startsWith("| ---")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) continue;
    codes.push(cells[0]);
  }
  codes.push("Two runs of the same draft.");
  return codes;
}

function lives(code, section) {
  const file = String(code || "");
  if (/useReviewStatePersistence/.test(file)) return "screen editing flow";
  if (/^`?assemble-card|assembleCard` empty catch|applyDuplicateMerge|editorial duplication judge/.test(file)) {
    return "card assembly";
  }
  if (/^12\./.test(section)) return "export";
  if (/^9\./.test(section)) return "screen editing flow";
  if (/^4\.|^5\.|^8\.|^11\./.test(section)) return "screen display";
  if (/generic-company|card-honesty|source-dateline/.test(file)) return "card assembly";
  if (/^3\./.test(section) && /summariseReview|attentionHeader|reviewSummaryDisplay|StatementAnalysisPanel|readableExcerpt|actionListDisplay/.test(file)) {
    return "screen display";
  }
  if (/^6\./.test(section) && /draftCoverageDisplay|StatementAnalysisPanel|DraftContextPanel/.test(file)) {
    return "screen display";
  }
  if (/^7\./.test(section) && /actionListDisplay|concernDisplayText|StatementReviewCard/.test(file)) {
    return "screen display";
  }
  return "review backend";
}

function census4Counts() {
  const markdown = readFileSync(path.join(__dirname, "../b467/CENSUS4.md"), "utf8");
  const queues = new Map();
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("| fires") && !line.startsWith("| cannot")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const times = cells[0];
    const reviewer = cells[2];
    let count = "cannot";
    const fired = times.match(/^fires (\d+) times$/);
    if (fired) count = fired[1];
    else if (times === "fires zero times") count = "0";
    if (!queues.has(reviewer)) queues.set(reviewer, []);
    queues.get(reviewer).push(count);
  }
  return queues;
}

function shownCount(row) {
  if (row.status === "cannot") return "cannot";
  return String(row.n);
}

function moveWhy(row, prior) {
  const reviewer = row.reviewer;
  if (/label stands and the why sentence is empty/.test(reviewer)) {
    return "The reader sentence is empty on 01:0, 18:4, 19:7, and 25:4. CENSUS4 was zero.";
  }
  if (/header is replaced|header leads with a light item/.test(reviewer)) {
    return "Draft 19. Cards 2, 7, and 13 have displayVerdict conflict under another label. The header names the label. The line is 1 worth a glance.";
  }
  if (/note tried to name never appears/.test(reviewer)) {
    return "This pass stores 23 note_rejections silences. CENSUS4 stored 14.";
  }
  if (/forward-looking compliance note/.test(reviewer)) {
    return "Fixture 07 card 5 stores silence forward_looking. CENSUS4 had none.";
  }
  if (/small disagreement/.test(reviewer)) {
    return "Five matches store a prior class on writtenFor. CENSUS4 stored four.";
  }
  if (/words also appear in the source/.test(reviewer)) {
    return `Evaluative source-awareness silences on this pass: ${row.n}. CENSUS4 was ${prior}. The compact card has no drops field, so the split reads the silence text.`;
  }
  if (/editorial concern whose quote is not in the sentence/.test(reviewer)) {
    return "The v4 compliance fidelity gate and the editorial drop both write silence id fidelity. CENSUS4 could not count the compliance drop.";
  }
  if (/On a conflict, an editorial note can disappear/.test(reviewer)) {
    return "The duplication judge writes silence id editorial_duplication. This pass has 1. CENSUS4 could not count it.";
  }
  if (/passage already contains the point/.test(reviewer)) {
    return "classificationRewrites rule omission_covered is on the card. This pass has 17:9 and 19:4. CENSUS4 could not count it.";
  }
  if (/sign-off sentence is marked no support/.test(reviewer)) {
    return "classificationRewrites rule procedural_closer is the record. This pass has 0. CENSUS4 could not count it.";
  }
  return `This pass counts ${shownCount(row)}. CENSUS4 counted ${prior}.`;
}

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const { rows } = censusRows(doc.cards);
const codes = siteCodes();
const faults = faultCounts(doc.cards);
const adjusted = rows.map((row) => {
  const cannot = CANNOT.find((item) => item.test.test(row.reviewer));
  if (cannot && row.status !== "cannot") {
    return { ...row, status: "cannot", n: null, why: cannot.why, before: row.n };
  }
  const rule = WHY.find((item) => item.test.test(row.reviewer));
  if (!rule) return { ...row, why: "", before: row.n };
  const n = rule.take(faults);
  const before = rule.before ? rule.before(faults) : row.n;
  return {
    ...row,
    n,
    status: n === 0 ? "zero" : "fires",
    why: n === before ? "" : rule.why,
    before,
  };
});

const STORED = [
  {
    test: /An editorial concern whose quote is not in the sentence/,
    n: silenceCount(doc.cards, "fidelity"),
    fix: "The v4 compliance fidelity gate writes silence id fidelity onto the card, and the editorial drop writes the same id. The B467 rule still returned null.",
  },
  {
    test: /On a conflict, an editorial note can disappear/,
    n: silenceCount(doc.cards, "editorial_duplication"),
    fix: "The duplication judge writes silence id editorial_duplication. The B467 rule still returned null.",
  },
  {
    test: /passage already contains the point the card called omitted/,
    n: rewriteCount(doc.cards, "omission_covered"),
    fix: "omission_covered is stored on classificationRewrites. The B467 rule still returned null.",
  },
  {
    test: /sign-off sentence is marked no support/,
    n: rewriteCount(doc.cards, "procedural_closer"),
    fix: "procedural_closer is stored on classificationRewrites. The B467 rule still returned null.",
  },
];

const fixes = [
  "Source-awareness split. The B486 card has silences and no drops field. The B467 count read drops, so both halves were 0. The split now reads the silence text.",
];
const counted = adjusted.map((row) => {
  const stored = STORED.find((item) => item.test.test(row.reviewer));
  if (!stored) return row;
  fixes.push(stored.fix);
  return {
    ...row,
    n: stored.n,
    status: stored.n === 0 ? "zero" : "fires",
    before: row.before == null ? row.n : row.before,
  };
});

const fires = counted.filter((row) => row.status === "fires");
const zeros = counted.filter((row) => row.status === "zero");
const cannot = counted.filter((row) => row.status === "cannot");
const ordered = counted.slice().sort((a, b) => {
  const rank = (row) => (row.status === "cannot" ? -1 : row.n);
  if (rank(b) !== rank(a)) return rank(b) - rank(a);
  return a.index - b.index;
});
const priorCounts = census4Counts();
const used = new Map();

function priorFor(row) {
  const queue = priorCounts.get(row.reviewer) || [];
  const at = used.get(row.reviewer) || 0;
  used.set(row.reviewer, at + 1);
  return queue[at] == null ? "" : queue[at];
}

const figureCards = [];
for (const card of doc.cards) {
  for (const match of card.matchExplanations || []) {
    if (!match?.writtenFor || match.writtenFor === match.classification) continue;
    const rules = (match.classificationRewrites || []).map((item) => item.rule).filter(Boolean);
    figureCards.push({
      id: `${String(card.fixtureId).padStart(2, "0")}:${card.index}`,
      writtenFor: match.writtenFor,
      classification: match.classification,
      rules,
    });
  }
}

const proseWithheld = [];
const wordingWithheld = [];
for (const card of doc.cards) {
  const id = `${String(card.fixtureId).padStart(2, "0")}:${card.index}`;
  for (const row of card.silences || []) {
    if (row?.id === "reader_prose_withheld") proseWithheld.push(id);
    if (row?.id === "wording_note_withheld") wordingWithheld.push(id);
  }
}

const lines = [];
lines.push("# B487. The census recounted");
lines.push("");
lines.push("Pass: scripts/diagnostic/b486/pass-1.json. No model call. USD 0.");
lines.push("");
lines.push("Fixes");
lines.push("");
for (const fix of fixes) lines.push(`- ${fix}`);
lines.push("");
lines.push("1. Totals");
lines.push("");
lines.push(`Sites: ${counted.length} (CENSUS4 88). Fires: ${fires.length} (CENSUS4 3). Fires zero: ${zeros.length} (CENSUS4 42). Cannot be counted: ${cannot.length} (CENSUS4 43).`);
lines.push("");
lines.push("2. Sites");
lines.push("");
lines.push("| Times | Before | Reviewer sees | Why the number moved | CENSUS4 | Lives |");
lines.push("| --- | --- | --- | --- | --- | --- |");
for (const row of ordered) {
  const times = row.status === "cannot" ? "cannot be counted" : row.n === 0 ? "fires zero times" : `fires ${row.n} times`;
  const before = row.before == null ? "" : String(row.before);
  const why = row.why || "";
  const prior = priorFor(row);
  const now = shownCount(row);
  const moved = prior !== "" && prior !== now ? `${prior}. moved. ${moveWhy(row, prior)}` : prior;
  const home = row.status === "fires" ? "" : lives(codes[row.index] || "", row.section || "");
  lines.push(`| ${times} | ${before} | ${row.reviewer} | ${why} | ${moved} | ${home} |`);
}
lines.push("");
lines.push("3. The figure-pair site");
lines.push("");
lines.push("A small disagreement is shown as agreement, or two figures that are not the same quantity are shown as a contradiction.");
lines.push("");
lines.push(`Count on B486: ${figureCards.length}.`);
lines.push("");
for (const card of figureCards) {
  const rule = card.rules.length ? `, rewrite ${card.rules.join(", ")}` : "";
  lines.push(`- ${card.id}. writtenFor ${card.writtenFor}, classification ${card.classification}${rule}.`);
}
lines.push("");
lines.push("4. Where a zero or an uncountable site lives");
lines.push("");
lines.push("The Lives column is filled for fires zero and cannot be counted. The values are review backend, card assembly, screen display, screen editing flow, and export.");
lines.push("");
lines.push("5. The B426 ten, and the B451 extras");
lines.push("");
lines.push("1. A refused note labelled Nothing raised, and Needs a look never assigned. Closed. statementVerdict returns note_withheld when the note is refused. The label is Needs a look. This pass: 06:3, 17:7, 18:6.");
lines.push("2. A partial labelled Nothing raised and counted as confirmed, with no evidence finding. Closed. A quiet partial is its own state. The summary gives beyond and nothing_raised their own buckets. cardEvidenceFindings adds a partial row when the headline is partial.");
lines.push("3. Causal overreach removed from the editorial verdict and from the evidence line. Partly closed. The editorial reviewer does not raise overreach_unsupported_causal. editorialVerdictWithoutCausal still strips that rule, and cardEvidenceFindings still skips it when it set the headline.");
lines.push("4. A drop recomputes the verdict to clean, with no count on the card. Partly closed. The duplication judge records silence editorial_duplication when it drops a concern. The compliance fidelity gate records silence fidelity when it drops a concern, on the v4 call that passes the card. The screen does not render silences.");
lines.push("5. The attention header replaces the backend header and omits a conflict. Partly closed. readingHeaderParts still drops the backend line when the attention line is set. The line names the label Conflicts with the source. Draft 19 on this pass is 1 worth a glance.");
lines.push("6. The summary calls a beyond sentence partial, calls Nothing raised backed, and stops at three bullets. Closed. beyond and nothing_raised are their own buckets. summaryBulletsFromReview prints every non-zero count.");
lines.push("7. The company step, lib/qc/generic-company.mjs. Open. applyGenericCompanySuppress still returns supported_full, and stripGapSentences still deletes a gap sentence. Assembly still applies it. A silence is written only when the summary text changes.");
lines.push("8. A backstop rewrites a class and drops the prior, and a no-support result drops the passage. Partly closed. classificationRewrites stores from and to. writtenFor stores a prior class when the matcher sentence stays. A period rewrite that replaces the explanation does not store writtenFor.");
lines.push("9. Export prints a different verdict from the card. Closed. The export uses the reader sentence. Both export rows on this pass are zero.");
lines.push("10. A re-check that is not stale writes the new sentence onto the old verdict. Closed. recheckStatements sets stale true on the rebuilt card.");
lines.push("Needs a look is assigned. Closed. note_withheld is the state, and the label is Needs a look.");
lines.push("The screen renders silences. Open. No screen list reads card.silences. readerReason reads reassurance_stripped to choose a cleared sentence.");
lines.push("partialSentence reads evidence_summary as well as the matcher explanation. Closed.");
lines.push("The LinkedIn credit-line drop records silence linkedin_credit_line. Closed. This pass has 0.");
lines.push("A wording note is stored and not shown. Open. wording_note_withheld is 139 on this pass. The census has no row for it.");
lines.push("");
lines.push("6. Sites the census does not have");
lines.push("");
lines.push(`wording_note_withheld. ${wordingWithheld.length}. Review backend. The note is on wordingNoteWithheld. It is not the reader sentence.`);
lines.push(`reader_prose_withheld. ${proseWithheld.length}. Review backend. Cards: ${proseWithheld.join(", ")}.`);
lines.push("");
writeFileSync(OUT, lines.join("\n"));
console.log(`Sites ${counted.length} Fires ${fires.length} Zero ${zeros.length} Cannot ${cannot.length}`);
console.log("wrote", OUT);
