/**
 * B460. Every site named in scripts/diagnostic/b426/CENSUS.md, counted on the
 * B456 pass. A site fires, fires zero times, or cannot be counted from a
 * stored card. The words are what the reviewer sees.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attentionHeader } from "../../../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js";
import { evidenceFindingForExport } from "../../../lib/qc/export-review-data.mjs";
import { classifyCard, summariseReview } from "../../../lib/qc/review-summary.mjs";
import { shownLabel } from "../../../lib/qc/shown-verdict.mjs";

const CENSUS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../b426/CENSUS.md");

function ascii(text) {
  return String(text || "")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sitesFromCensus(markdown) {
  const sites = [];
  let section = "";
  let inTable = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("# ")) {
      section = line.replace(/^#\s+/, "").trim();
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
    sites.push({
      section: ascii(section),
      code: ascii(cells[0]),
      lost: ascii(cells[1]),
      knows: ascii(cells[2]),
      learns: ascii(cells[3]),
    });
  }
  sites.push({
    section: "10. It answered differently on the same draft",
    code: "Two runs of the same draft.",
    lost: "Whether the same sentence got a different verdict.",
    knows: "This file is one pass.",
    learns: "No.",
  });
  return sites;
}

function silenceCount(cards, id) {
  let n = 0;
  for (const card of cards) {
    for (const row of card.silences || []) {
      if (row?.id === id) n += 1;
    }
  }
  return n;
}

function concerns(card, field) {
  return Array.isArray(card?.[field]) ? card[field] : [];
}

function concernText(row) {
  return [row?.note, row?.concernText, row?.text, row?.suggestedDirection].filter((part) => typeof part === "string").join(" ");
}

function isCausal(row) {
  const code = String(row?.concernCode || row?.rule || "");
  return code === "overreach_unsupported_causal" || /overreach_unsupported_causal/.test(concernText(row));
}

function reasonSlug(card) {
  return [card?.evidenceNotReviewedReason, card?.editorialNotReviewedReason, card?.complianceNotReviewedReason, card?.commentaryNotReviewedReason]
    .some((value) => typeof value === "string" && value.trim());
}

function writtenForRows(cards) {
  const rows = [];
  for (const card of cards) {
    for (const match of card.matchExplanations || []) {
      if (match?.writtenFor && match.writtenFor !== match.classification) rows.push(match);
    }
  }
  return rows;
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

function measure(cards) {
  const rewrites = writtenForRows(cards);
  const toConflicting = rewrites.filter((row) => row.classification === "conflicting");
  const toNotSupported = rewrites.filter((row) => row.classification === "no_support" || row.classification === "not_supported");
  const summaries = [];
  for (const [id, group] of byFixture(cards)) {
    summaries.push({ id, summary: summariseReview(group, { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true }), cards: group });
  }
  let beyondAsPartial = 0;
  let nothingAsConfirmed = 0;
  let cap = 0;
  let crowded = 0;
  for (const row of summaries) {
    const slots = bulletSlots(row.summary);
    if (slots.length > 3) cap += 1;
    const evidenceFilled = slots.slice(0, 3).every((name) => name !== "editorial or compliance");
    if (slots.includes("editorial or compliance") && slots.length > 3 && evidenceFilled) crowded += 1;
    for (const card of row.cards) {
      const cls = classifyCard(card, { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true });
      if (card.sentenceState === "beyond" && cls.evidence === "partial") beyondAsPartial += 1;
      if ((card.sentenceState === "nothing_raised" || card.sentenceState === "nothing_to_raise") && cls.evidence === "confirmed") {
        nothingAsConfirmed += 1;
      }
    }
  }
  let headerOmitsConflict = 0;
  let headerReplaces = 0;
  for (const [, group] of byFixture(cards)) {
    const line = attentionHeader(group.map((card) => ({
      sentenceState: card.sentenceState,
      displayVerdict: card.displayVerdict,
      facts: [],
    })));
    const hasConflict = group.some((card) => card.sentenceState === "conflicts" || card.displayVerdict === "conflict");
    if (line) headerReplaces += 1;
    if (hasConflict && line && !/conflict/i.test(line)) headerOmitsConflict += 1;
  }
  let exportLabelDiffers = 0;
  let exportNotRecorded = 0;
  let exportProseDiffers = 0;
  for (const card of cards) {
    const label = shownLabel(card);
    if (label && card.sentenceLabel && label !== card.sentenceLabel) exportLabelDiffers += 1;
    const finding = evidenceFindingForExport({ ...card, reasoningParagraph: card.evidenceSummary || "" }, false);
    if (finding === "Not recorded.") exportNotRecorded += 1;
    const prose = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
    if (prose && finding && finding !== prose && finding !== "Not checked.") exportProseDiffers += 1;
  }
  const causalCards = cards.filter((card) => concerns(card, "editorialConcerns").some(isCausal));
  const causalClean = causalCards.filter((card) => String(card.editorialVerdict || "").toLowerCase() === "clean");
  const beyondEmpty = cards.filter((card) => {
    const state = card.sentenceState;
    if (state !== "beyond" && state !== "conflicts" && state !== "not_in_source") return false;
    const prose = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
    return !prose;
  });
  const partials = cards.filter((card) => card.displayVerdict === "supported_partial" || card.supportState === "partial");
  const partialNoFinding = partials.filter((card) => !Array.isArray(card.evidenceFindings) || card.evidenceFindings.length === 0);
  const partialNothingRaised = partials.filter((card) => card.sentenceState === "nothing_raised" || card.sentenceLabel === "Nothing raised");
  const emptyConcerns = cards.filter((card) =>
    [...concerns(card, "editorialConcerns"), ...concerns(card, "complianceConcerns")].some((row) => !concernText(row).trim())
  );
  const framingOther = cards.reduce((n, card) => n + concerns(card, "framingFidelityConcerns").filter((row) => !/beyond/i.test(concernText(row))).length, 0);
  const framingAll = cards.reduce((n, card) => n + concerns(card, "framingFidelityConcerns").length, 0);
  const recencyAll = cards.reduce((n, card) => n + concerns(card, "sourceRecencyConcerns").length, 0);
  const punctuation = cards.filter((card) => {
    const text = typeof card.primaryExcerpt === "string" ? card.primaryExcerpt.trim() : "";
    return text && !/[A-Za-z0-9]/.test(text);
  });
  const noSupportMatches = cards.reduce((n, card) => n + (card.matchExplanations || []).filter((row) => row.classification === "no_support" || row.classification === "not_supported").length, 0);
  const otherClass = cards.reduce((n, card) => n + (card.matchExplanations || []).filter((row) => {
    const cls = String(row.classification || "");
    return cls && cls !== "confirmed" && cls !== "partially_confirmed" && cls !== "conflicting";
  }).length, 0);
  const beyond = cards.filter((card) => card.sentenceState === "beyond").length;
  const joined = cards.reduce((n, card) => n + [...concerns(card, "editorialConcerns"), ...concerns(card, "complianceConcerns")].filter((row) => /\(i\)/.test(concernText(row)) && /\(ii\)/.test(concernText(row))).length, 0);
  const emptyNoteWithState = cards.filter((card) => {
    const bucket = card.readingNote?.bucket;
    const text = typeof card.readingNote?.text === "string" ? card.readingNote.text.trim() : "";
    return (bucket === "conflicts" || bucket === "beyond") && !text;
  });
  const refusedNothing = cards.filter((card) =>
    (card.silences || []).some((row) => row?.id === "note_refused")
    && (card.sentenceLabel === "Nothing raised" || card.sentenceState === "nothing_raised")
  );
  const noteWithheldState = cards.filter((card) => card.sentenceState === "note_withheld").length;
  const datelineReason = cards.filter((card) => card.displayVerdictReason === "announcement_dateline").length;
  const notSupportedEmpty = cards.filter((card) => card.displayVerdict === "not_supported" && !(card.primaryExcerpt || "").trim()).length;

  return {
    rewrites: rewrites.length,
    toConflicting: toConflicting.length,
    toNotSupported: toNotSupported.length,
    beyondAsPartial,
    nothingAsConfirmed,
    cap,
    crowded,
    headerOmitsConflict,
    headerReplaces,
    exportLabelDiffers,
    exportNotRecorded,
    exportProseDiffers,
    causalClean: causalClean.length,
    beyondEmpty: beyondEmpty.length,
    partials: partials.length,
    partialNoFinding: partialNoFinding.length,
    partialNothingRaised: partialNothingRaised.length,
    emptyConcerns: emptyConcerns.length,
    framingOther,
    framingAll,
    recencyAll,
    punctuation: punctuation.length,
    noSupportMatches,
    otherClass,
    beyond,
    joined,
    emptyNoteWithState: emptyNoteWithState.length,
    refusedNothing: refusedNothing.length,
    noteWithheldState,
    datelineReason,
    notSupportedEmpty,
    drafts: summaries.length,
  };
}

function reviewer(site, text) {
  return text || site.learns || site.lost;
}

const RULES = [
  { test: /Second acceptNote fails|refused per-statement note/, reviewer: "A note was refused, and the sentence still says Nothing raised.", count: (c, m) => m.refusedNothing },
  { test: /never returns note_withheld/, reviewer: "A refused note and a sentence with nothing to say wear the same label.", count: () => 0, note: "The state is assigned. 06:3 and 17:7 are Needs a look. They are not labelled Nothing raised." },
  { test: /drops accepted.rejections|rejections from acceptNote/, reviewer: "A point the note tried to name never appears.", count: (c) => silenceCount(c, "note_rejections") },
  { test: /suppressReassurance/, reviewer: "The sentence keeps a conflicts or beyond label and the reason under it is gone.", count: (c) => silenceCount(c, "reassurance_stripped") },
  { test: /normalizeCombinedConcern/, reviewer: "A formed editorial concern disappears, and the row can end up Not checked.", count: () => null, store: "The dropped concern, its rule, and the reason. A schema_invalid reason is only the retry, not the drop." },
  { test: /stated category is the other book/, reviewer: "A concern shows under the other heading, with no word that it was moved.", count: () => null, store: "The category the model stated, next to the category on the card." },
  { test: /applyFidelityGate/, reviewer: "An editorial concern whose quote is not in the sentence disappears, and the row can read clean.", count: () => null, note: "The editorial gate writes a silence, and that silence is 0 on this pass. The compliance gate writes no silence.", store: "The dropped compliance concern and the reason." },
  { test: /applyDeterministicStyleFilters/, reviewer: "A style concern is removed and the reader is not told.", count: (c) => silenceCount(c, "style_backstop") },
  { test: /suppressNoOpSuggestions/, reviewer: "A suggestion that would have changed nothing is removed, and the reader is not told one was raised.", count: (c) => silenceCount(c, "no_op") },
  { test: /suppressNoChangeDirections/, reviewer: "A direction that changes nothing is removed, and the reader is not told.", count: (c) => silenceCount(c, "no_change") },
  { test: /suppressEvidenceLanguageConcerns/, reviewer: "An editorial note that is really about the source is deleted rather than shown as evidence.", count: (c) => silenceCount(c, "evidence_language") },
  { test: /dropNarrativeCoherenceConcerns/, reviewer: "A narrative concern disappears and the editorial row can read clean.", count: (c) => silenceCount(c, "narrative_coherence") },
  { test: /editorial duplication judge/, reviewer: "On a conflict, an editorial note can disappear and that row can read clean.", count: () => null, store: "The concern the duplication judge removed, and its rule. The canary is not on the card." },
  { test: /applyDuplicateMerge/, reviewer: "Two overlapping notes become one, sometimes joined as (i) and (ii).", count: (c) => silenceCount(c, "duplicate_merge") },
  { test: /applyEditorialSourceAwareness/, reviewer: "An objection whose words also appear in the source disappears, and the editorial row can read clean.", count: (c) => silenceCount(c, "source_awareness") },
  { test: /dropForwardLookingInExcerpt/, reviewer: "A forward-looking compliance note disappears because the phrase is already in the passage.", count: (c) => silenceCount(c, "forward_looking") },
  { test: /Any throw inside assembleCard|assembleCard empty catch/, reviewer: "The whole review of that sentence becomes Not checked, with no reason.", count: (c) => silenceCount(c, "assemble_failed") },
  { test: /editorialVerdictWithoutCausal/, reviewer: "The editorial row says clean while the causal objection is taken off that list.", count: (_c, m) => m.causalClean },
  { test: /cardEvidenceFindings/, reviewer: "Goes beyond the source, or a partial, with no finding under the headline.", count: (_c, m) => m.partialNoFinding },
  { test: /applyGenericCompanySuppress|stripGapSentences/, reviewer: "A partial becomes fully backed and the sentence that named the gap is gone.", count: (c) => silenceCount(c, "gap_sentences_stripped"), note: "The silence records a strip that changed the summary. A lift that leaves the summary unchanged is not on the card. Store the prior verdict and the antecedent." },
  { test: /applyPeriodGateBackstop/, reviewer: "A conflict becomes no support, or a confirmed sentence becomes a conflict, and the quote can go with it.", count: () => null, store: "The rewrite record: the prior class, the new class, the rule, and the two periods. writtenFor is absent when the explanation was replaced. On this pass the visible writtenFor rows are a different rewrite, the figure pair, and they are counted under the rounding row." },
  { test: /applyRoundingToleranceBackstop/, reviewer: "A small disagreement is shown as agreement, or two figures that are not the same quantity are shown as a contradiction.", count: (_c, m) => m.rewrites, note: "B451 counted a rewrite to not supported and scored this as zero. writtenFor is any class change that left the matcher's sentence in place. That includes a confirmed class rewritten to conflicting, which is the figure pair. A rounding lift to confirmed would be in the same field. A period rewrite that replaces the explanation is not." },
  { test: /applyOmissionConflictInvariant/, reviewer: "A conflict becomes fully backed because the passage already contains the point the card called omitted.", count: () => null, store: "The prior verdict and the span that already contained the point. B460 records this on a future card as omission_covered. This pass does not have that field." },
  { test: /applySourceDatelineToCard/, reviewer: "A timing partial becomes fully backed, or a date disagreement becomes a conflict, and the earlier class is not named.", count: (_c, m) => m.datelineReason, note: "displayVerdictReason announcement_dateline is the disagree path. The lift that clears a partial stores nothing. Store the prior verdict and the spans that were cleared." },
  { test: /marksForCards|droppedMarks stored/, reviewer: "A mark was dropped and the reader is not told.", count: () => null, store: "droppedMarks, the surface, and the reason. The compact card does not carry the count." },
  { test: /stripUnquotedCraft/, reviewer: "A paragraph of the writer note is missing.", count: () => null, store: "The dropped paragraph. The writer note is not on this card." },
  { test: /statementVerdict.state nothing_raised counts as confirmed/, reviewer: "The summary calls a beyond sentence partial support, or calls Nothing raised backed.", count: (_c, m) => m.beyondAsPartial + m.nothingAsConfirmed },
  { test: /Bullets stop at three/, reviewer: "The summary stops after three points, and does not say the list was cut.", count: (_c, m) => m.cap },
  { test: /attentionHeader.js 9-32/, reviewer: "The header is replaced, and the replacement does not name a conflict.", count: (_c, m) => m.headerOmitsConflict, note: "Fact status is not on the card, so the not-found half of the header is not in this count. The conflict half is. Drafts where the replacement line is shown are a separate number, in the note on the glance row." },
  { test: /suppressInQcWorkbench/, reviewer: "A card is missing from the totals, with no line saying it was hidden.", count: () => null, store: "suppressInQcWorkbench on the card." },
  { test: /recheckClearedDecisionIds/, reviewer: "Findings disappear from every card after a re-check, with no word that the map was cleared.", count: () => null, store: "The cleared ids. They live in the session, not on the card." },
  { test: /Kind is not evidence, editorial, or compliance/, reviewer: "A proposal is dropped, and the screen does not say how many were dropped.", count: () => null, store: "orphanCount. It is computed and not stored on the card." },
  { test: /Kind is framing or recency/, reviewer: "A framing or recency note is on the card and there is no proposal for it.", count: (_c, m) => m.framingAll + m.recencyAll },
  { test: /no letter or digit/, reviewer: "The passage is punctuation only, and the card does not say there is no passage to show.", count: (_c, m) => m.punctuation },
  { test: /State beyond increments evidence.partial|beyond increments evidence.partial/, reviewer: "The summary says partial support where the card says Goes beyond the source.", count: (_c, m) => m.beyondAsPartial },
  { test: /nothing_raised increments confirmed|State nothing_raised increments/, reviewer: "The summary says the claims are backed where the card says Nothing raised.", count: (_c, m) => m.nothingAsConfirmed },
  { test: /displayVerdict is not the label/, reviewer: "The evidence row says Nothing raised, or is blank, while the check found a partial or a conflict.", count: (_c, m) => m.partialNothingRaised },
  { test: /cardBorderTone|green edge/, reviewer: "A green edge sits on a sentence whose only editorial objection was causal.", count: (_c, m) => m.causalClean },
  { test: /needsAttention is true/, reviewer: "A beyond sentence is left out of To look at, and the filter does not say so.", count: (_c, m) => m.beyond },
  { test: /forced to dealt_with|statement id was written/, reviewer: "The chip says Dealt with while the finding is still on the card.", count: () => null, store: "The written statement id. This pass is not a re-check." },
  { test: /Wording and nothing-raised get no draft wash/, reviewer: "After an edit, the colour is gone and the banner does not say the colours were removed.", count: () => null, store: "The session after an edit. This pass is a finished review." },
  { test: /painted amber/, reviewer: "A source is painted amber and prefixed Relates to the statement, for a class the screen does not name.", count: (_c, m) => m.otherClass },
  { test: /Framing goes beyond the source/, reviewer: "The framing row is titled Framing goes beyond the source even when the note says something else.", count: (_c, m) => m.framingOther },
  { test: /buildReviewData|export-review-data/, reviewer: "The file the reader can send quotes a different evidence sentence from the one on the card.", count: (_c, m) => m.exportProseDiffers, note: "The verdict matches the sentence label on every card. Not recorded is 0. The export prints the stored difference. The card shows the reading note." },
  { test: /displayedEvidenceProse/, reviewer: "The label stands and the why sentence is empty.", count: (_c, m) => m.beyondEmpty },
  { test: /Reason slugs are on the card|requested check finished not_reviewed|slug is on the card and is not in the export/, reviewer: "The row says Not checked. The reason that was stored is not on the screen.", count: (c) => c.filter(reasonSlug).length },
  { test: /Neither note nor concernText/, reviewer: "The row says a number of concerns and the opened list has an empty bullet.", count: (_c, m) => m.emptyConcerns },
  { test: /fingerprint|periodAssessment/, reviewer: "A rewritten class is shown with no period sentence, once the quote has been dropped.", count: () => null, store: "periodAssessment, the prior class, and whether the passage was rejected. writtenFor is missing when the explanation was replaced." },
  { test: /DATE_EXTRACT_LIMIT/, reviewer: "A date says N lines and does not show the lines.", count: () => null, store: "The date extracts and the count. Facts are not on this card." },
  { test: /citation chips|cut at 5/, reviewer: "Sources past five, or sources missing a body, disappear with no N more.", count: () => null, store: "supportRefIds and the chip fields. They are not on this card." },
  { test: /isClaim === false/, reviewer: "A heading or a salutation is listed as not checked as a claim.", count: () => null, store: "draftCoverage.dropped. It is not on this card." },
  { test: /computeDraftCoverage uncovered/, reviewer: "A slice of the draft was not reviewed, and the screen can say so only when coverage was stored.", count: () => null, store: "draftCoverage.uncovered." },
  { test: /coverageIsVisible|draftCoverage is absent/, reviewer: "Coverage was not computed, and the screen looks as if the whole draft was covered.", count: () => null, store: "A field that says coverage was not computed. Absence is what this card has, and absence is the bug, so the count cannot be separated from a full draft." },
  { test: /draftSpan does not locate/, reviewer: "The sentence could not be found in the draft, and on a replaced draft that note is suppressed.", count: () => null, store: "The locate failure. This pass is not a replaced draft." },
  { test: /pairNeedsWidenedPass/, reviewer: "A sentence with no support is not searched again, and the reader is not told the search stopped.", count: (_c, m) => m.noSupportMatches },
  { test: /recommendation or sign-off/, reviewer: "A sign-off sentence is marked no support, with no word that it was treated as a closer.", count: () => null, store: "The rewrite record procedural_closer. B460 writes it on a future card. This pass does not have it. A no_support match with no writtenFor cannot be split into the model and the closer." },
  { test: /rollupClaimVerdicts|upgrade = false/, reviewer: "A partial stays partial, and the reader is not told a span check was switched off.", count: () => null, store: "claimUpgrade. It is not on this card. The code forces it false, so the reader-visible result is every partial, which is a different count." },
  { test: /last sentence starts with delete/, reviewer: "The bullet shows the complaint and leaves out the correction.", count: () => null, store: "The full note beside the bullet. The card stores one text, not the sentence that was cut." },
  { test: /proposeDraft|no not_found fact/, reviewer: "A sentence whose facts all matched never gets a proposal, even when the note says what to change.", count: () => null, store: "The proposal call, and the facts. Facts are not on this card." },
  { test: /first_person_unnamed/, reviewer: "A first-person proposal is dropped and nothing is rendered for that row.", count: () => null, store: "sort.reasonCode on the proposal. Proposals are not on this card." },
  { test: /no longer the sentence the proposal/, reviewer: "The reader is told they rewrote the sentence, and the proposed sentence is not shown.", count: () => null, store: "The proposal and the current draft text. This pass is not an edit." },
  { test: /noProposalReason/, reviewer: "There is no fix, and the reason is shown only for an acknowledgement.", count: () => null, store: "noProposalReason on the finding. It is not on this card." },
  { test: /COMBINED_RANK/, reviewer: "The list orders a source conflict above a wording note.", count: () => 0, note: "The order does not hide a conflict under a wording note. Counted as zero because the reviewer-visible defect the census was hunting does not occur." },
  { test: /Not-found facts are named/, reviewer: "The header leads with a light item while a conflict is not in the line.", count: (_c, m) => m.headerOmitsConflict, note: "Fact status is not on the card, so the not-found half of the line is not in this count." },
  { test: /editorial or compliance bullet/, reviewer: "Editorial and compliance notes never reach the summary once two evidence points have filled it.", count: (_c, m) => m.crowded },
  { test: /computeCardMateriality/, reviewer: "A mechanical style note and a partial can sit together with no rank between them.", count: () => null, store: "card.materiality.level. It is not on this card." },
  { test: /next.stale is not true/, reviewer: "After an edit that is not marked stale, the old finding stays on the new sentence and nothing says so.", count: () => null, store: "The stale flag and both texts. This pass is not a re-check." },
  { test: /Apply does not write|Failed to load version/, reviewer: "A missed edit and a missed load share one toast.", count: () => null, store: "The error from the apply call. It is not on this card." },
  { test: /applyNoticeCopy|empty notice/, reviewer: "An empty notice renders nothing.", count: () => null, store: "The notice object. It is not on this card." },
  { test: /classifySignal returns null|Toggle off/, reviewer: "A check that was turned off says so.", count: () => 0, note: "The turned-off line is the one this site says is spoken. It is not a hidden miss." },
  { test: /BRIGHTLINE_EDITORIAL_REVIEW/, reviewer: "Editorial did not run, and the screen says the check failed.", count: () => null, store: "A reason that says the check was off, distinct from a miss. A not-reviewed row with an empty reason cannot be split." },
  { test: /stage5-generate-commentary/, reviewer: "The commentary did not come back, and the evidence row says Not checked without the reason.", count: (c) => c.filter((card) => card.commentaryNotReviewedReason).length, note: "Only a stored reason is visible. An empty commentary with a null reason cannot be split from a finished card. Store the reason on every commentary miss, not only the rate-limit case." },
  { test: /skipCommentary/, reviewer: "Commentary was skipped and the card looks like a finished sentence with nothing to say.", count: () => null, store: "The skip flag. An empty summary is also a finished card, so the two cannot be split from this file." },
  { test: /VITE_REVISE_ACTION_LIST/, reviewer: "Proposals were not loaded, and the screen does not say so.", count: () => null, store: "The flag. It is not on this card." },
  { test: /reviewDidNotRun|The review did not run/, reviewer: "The review did not run, and the screen says so.", count: () => 0, note: "This pass ran. The site is a spoken failure, not a hidden one." },
  { test: /summaryClass itself is null|turnedOffLineOf/, reviewer: "The concern lists and the turned-off line are both missing, so off and a miss look the same.", count: () => null, store: "summaryClass. It is not on this card." },
  { test: /writerFeedbackStatus === .withheld/, reviewer: "The writer note was withheld. The reading view says so. The export and the card screen do not.", count: () => null, store: "writerFeedbackStatus on the card. The note lives in a separate file, not on this pass." },
  { test: /meta.replayed/, reviewer: "A replayed review is not saved, and a refresh does not say so.", count: () => null, store: "meta.replayed. It is not on this card." },
  { test: /state_too_large|413/, reviewer: "A save failed. The too-large case is spoken. Any other failure is only a console warning.", count: () => null, store: "The save error. It is not on this card." },
  { test: /Two runs of the same draft/, reviewer: "The same sentence got a different verdict on a second run.", count: () => null, store: "A second pass of the same drafts, with sentenceState, supportState, displayVerdict, and the concern codes." },
];

function matchRule(site) {
  return RULES.find((rule) => rule.test.test(site.code));
}

export function censusRows(cards) {
  const sites = sitesFromCensus(readFileSync(CENSUS, "utf8"));
  const stats = measure(cards);
  const rows = sites.map((site, index) => {
    const rule = matchRule(site);
    if (!rule) {
      return {
        index,
        section: site.section,
        reviewer: reviewer(site, ""),
        status: "cannot",
        n: null,
        note: "",
        store: `Store what the code already knows and does not put on the card. The census says: ${site.knows}`,
      };
    }
    const n = rule.count(cards, stats);
    if (n == null) {
      return {
        index,
        section: site.section,
        reviewer: rule.reviewer,
        status: "cannot",
        n: null,
        note: rule.note || "",
        store: rule.store || site.knows,
      };
    }
    return {
      index,
      section: site.section,
      reviewer: rule.reviewer,
      status: n === 0 ? "zero" : "fires",
      n,
      note: rule.note || "",
      store: "",
    };
  });
  return { rows, stats };
}

export function censusMarkdown(cards) {
  const { rows, stats } = censusRows(cards);
  const ordered = rows.slice().sort((a, b) => {
    const rank = (row) => (row.status === "cannot" ? -1 : row.n);
    if (rank(b) !== rank(a)) return rank(b) - rank(a);
    return a.index - b.index;
  });
  const fires = ordered.filter((row) => row.status === "fires");
  const zeros = ordered.filter((row) => row.status === "zero");
  const cannot = ordered.filter((row) => row.status === "cannot");
  const lines = [];
  lines.push("# B460. The census, counted on the B456 pass");
  lines.push("");
  lines.push("Every site in the tables of `scripts/diagnostic/b426/CENSUS.md`, sections 3 to 12, plus the mode that has no row. One stored pass, `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0.");
  lines.push("");
  lines.push("A site is counted by the condition it describes. A silence that the code writes when the drop happens is that condition. A test that looked only for a rewrite to not supported was narrower than a rewrite to conflicting, and that narrower test is not used here.");
  lines.push("");
  lines.push(`Sites: ${rows.length}. Fires: ${fires.length}. Fires zero times: ${zeros.length}. Cannot be counted from a stored card: ${cannot.length}.`);
  lines.push("");
  lines.push(`Class changes visible as writtenFor: ${stats.rewrites}. Of those, ${stats.toConflicting} are to conflicting and ${stats.toNotSupported} are to not supported. B451 on the earlier pass saw 15, of which 9 were confirmed rewritten to conflicting, and scored the not-supported slice as the whole site.`);
  lines.push(`The attention line is non-empty on ${stats.headerReplaces} of ${stats.drafts} drafts. Fact status is not on the card, so that is a floor.`);
  lines.push("");
  lines.push("The words in the reviewer column are what the reviewer sees. The same condition named twice is counted twice, and the note says so.");
  lines.push("");
  lines.push("| Order | Times | Reviewer sees | Where the census put it |");
  lines.push("| --- | --- | --- | --- |");
  ordered.forEach((row, place) => {
    const times = row.status === "cannot" ? "cannot be counted" : row.n === 0 ? "fires zero times" : `fires ${row.n} times`;
    const extra = [row.note, row.store ? `What would need storing: ${row.store}` : ""].filter(Boolean).join(" ");
    const sees = extra ? `${row.reviewer} ${extra}` : row.reviewer;
    lines.push(`| ${place + 1} | ${times} | ${ascii(sees)} | ${ascii(row.section)} |`);
  });
  lines.push("");
  return { markdown: lines.join("\n"), rows, ordered };
}
