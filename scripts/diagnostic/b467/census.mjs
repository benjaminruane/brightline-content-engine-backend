/**
 * B467. The census counts the fault the reviewer sentence names.
 * The B460 instrument is the before column. No model call.
 *
 *   node scripts/diagnostic/b467/census.mjs
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
const PASS = path.join(__dirname, "../b464/pass-1.json");
const OUT = path.join(__dirname, "CENSUS4.md");

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
    for (const drop of card.drops || []) {
      if (drop?.rule !== "source_awareness" || drop?.reason !== "dropped") continue;
      if (sourceAwarenessDropIsOutOfScope(drop.content)) awarenessClosed += 1;
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

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const { rows } = censusRows(doc.cards);
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

const fires = adjusted.filter((row) => row.status === "fires");
const zeros = adjusted.filter((row) => row.status === "zero");
const cannot = adjusted.filter((row) => row.status === "cannot");
const ordered = adjusted.slice().sort((a, b) => {
  const rank = (row) => (row.status === "cannot" ? -1 : row.n);
  if (rank(b) !== rank(a)) return rank(b) - rank(a);
  return a.index - b.index;
});

const lines = [];
lines.push("# B467. The census counts faults");
lines.push("");
lines.push("Recounted on scripts/diagnostic/b464/pass-1.json. The before number is the B460 instrument on this same pass. No model call. USD 0.");
lines.push("");
lines.push(`Sites: ${adjusted.length}. Fires: ${fires.length}. Fires zero times: ${zeros.length}. Cannot be counted: ${cannot.length}.`);
lines.push("");
lines.push("B460 on the B456 pass was Sites 88, Fires 20, Fires zero 27, Cannot 41.");
lines.push("");
lines.push("The B460 instrument on this pass, before these corrections, was Fires 16, Fires zero 31, Cannot 41. Header omissions the old line still produces: " + faults.instrumentOmits + ". House-style drops restored: " + faults.awarenessClosed + ".");
lines.push("");
lines.push("| Times | Before | Reviewer sees | Why the number moved |");
lines.push("| --- | --- | --- | --- |");
for (const row of ordered) {
  const times = row.status === "cannot" ? "cannot be counted" : row.n === 0 ? "fires zero times" : `fires ${row.n} times`;
  const before = row.before == null ? "" : String(row.before);
  const why = row.why || "";
  lines.push(`| ${times} | ${before} | ${row.reviewer} | ${why} |`);
}
lines.push("");
writeFileSync(OUT, lines.join("\n"));
console.log(`Sites ${adjusted.length} Fires ${fires.length} Zero ${zeros.length} Cannot ${cannot.length}`);
console.log("wrote", OUT);
