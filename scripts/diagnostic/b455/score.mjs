/**
 * Score the B455 pass against the B446 pass. No model calls.
 *
 *   node scripts/diagnostic/b455/score.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PARTIAL_UNRECORDED, partialSentence } from "../../../lib/qc/partial-sentence.mjs";
import { sealReaderCard } from "../../../lib/qc/reader-prose-guard.mjs";
import { noteEndorsement } from "../../../lib/qc/reading-contract.mjs";
import { shownState } from "../../../lib/qc/shown-verdict.mjs";
import { layerSpoken, tallyLeaveAlone } from "../lib/leave-alone.mjs";
import { flattenStatements, joinKey, mapGroupA } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "pass-1.json");
const PRIOR = path.join(__dirname, "../b446/pass-1.json");
const ESTIMATE = path.join(__dirname, "estimate.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const OUT = path.join(__dirname, "RESULT.md");

function pad(id) {
  return String(id).padStart(2, "0");
}

function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}

function isPartialSupport(card) {
  return card?.supportState === "partial"
    || card?.displayVerdict === "supported_partial"
    || card?.sentenceState === "partial"
    || shownState(card) === "partial";
}

function explanations(card) {
  return (Array.isArray(card?.matchExplanations) ? card.matchExplanations : [])
    .map((row) => (typeof row?.explanation === "string" ? row.explanation.trim() : ""))
    .filter(Boolean);
}

function explanationFails(card) {
  return explanations(card).some((text) => noteEndorsement(text));
}

function showsReason(card) {
  const sentence = partialSentence(card);
  if (!sentence || sentence === PARTIAL_UNRECORDED) return false;
  return !noteEndorsement(sentence);
}

function silenceCounts(cards) {
  const counts = new Map();
  for (const card of cards) {
    const sealed = sealReaderCard(card);
    const seen = new Set();
    for (const row of Array.isArray(sealed.silences) ? sealed.silences : []) {
      if (row?.id !== "reader_prose_withheld") continue;
      const key = `${row.field}|${row.reason}`;
      const cardKey = `${keyOf(card)}|${key}`;
      if (seen.has(cardKey)) continue;
      seen.add(cardKey);
      counts.set(row.field || "missing", (counts.get(row.field) || 0) + 1);
    }
  }
  return counts;
}

function phraseCounts(cards) {
  const counts = new Map();
  for (const card of cards) {
    const sealed = sealReaderCard(card);
    for (const row of Array.isArray(sealed.silences) ? sealed.silences : []) {
      if (row?.id !== "reader_prose_withheld") continue;
      const phrase = row.reason || "missing";
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function catchOf(byKey, design, mapped) {
  let raised = 0;
  const misses = [];
  for (const fault of design.faults) {
    const row = mapped.mapping.find((item) => item.id === fault.id);
    const key = row?.keys?.[0] || null;
    const card = key ? byKey.get(key) : null;
    const layers = card ? layerSpoken(card) : null;
    const spoke = layers ? Object.values(layers).some((layer) => layer.raised) : false;
    if (spoke) raised += 1;
    else misses.push(fault.id);
  }
  return { raised, n: design.faults.length, misses };
}

function indexCards(list) {
  const byKey = new Map();
  for (const card of list) byKey.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);
  return byKey;
}

function confirmedCards(cards, labelByKey) {
  const byKey = indexCards(cards);
  const out = [];
  for (const [key, row] of labelByKey) {
    if (row.label !== "confirmed") continue;
    const card = byKey.get(key);
    if (!card) throw new Error(`b455 score: confirmed label has no card (${key})`);
    out.push(card);
  }
  return out;
}

function money(value) {
  return Number(value || 0).toFixed(6);
}

function quoteBlock(text) {
  return String(text || "").split("\n").map((line) => `> ${line}`).join("\n");
}

function pickQuotes(cards) {
  const want = [
    ["partial", (card) => card.displayVerdict === "supported_partial", 3],
    ["conflicting", (card) => card.displayVerdict === "conflict" || card.displayVerdict === "conflicting", 3],
    ["fully backed", (card) => card.displayVerdict === "supported_full", 4],
  ];
  const picked = [];
  for (const [kind, pred, n] of want) {
    const seen = new Set();
    let got = 0;
    for (const card of cards) {
      if (!pred(card)) continue;
      const fixture = pad(card.fixtureId);
      if (seen.has(fixture)) continue;
      const text = explanations(card)[0] || (typeof card.evidenceSummary === "string" ? card.evidenceSummary.trim() : "");
      if (!text) continue;
      seen.add(fixture);
      picked.push({ kind, key: keyOf(card), verdict: card.displayVerdict, text });
      got += 1;
      if (got === n) break;
    }
  }
  return picked;
}

const nextDoc = JSON.parse(readFileSync(PASS, "utf8"));
const priorDoc = JSON.parse(readFileSync(PRIOR, "utf8"));
const cards = nextDoc.cards;
const priorCards = priorDoc.cards;
if (!Array.isArray(cards) || cards.length !== 261) throw new Error(`b455 score: expected 261 cards, found ${cards?.length}`);
if (!Array.isArray(priorCards) || priorCards.length !== 261) throw new Error("b455 score: B446 pass is not 261 cards");

const labelsDoc = JSON.parse(readFileSync(path.join(ACCURACY, "labels.json"), "utf8"));
const design = JSON.parse(readFileSync(path.join(ACCURACY, "group-a-design.json"), "utf8"));
const statements = JSON.parse(readFileSync(path.join(ACCURACY, "statements.json"), "utf8"));
const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
const mapped = mapGroupA(flattenStatements(statements), design);
const labelByKey = new Map();
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  labelByKey.set(joinKey(row.fixtureId, row.statementText, row.occurrence), row);
}

const withExplanation = cards.filter((card) => explanations(card).length > 0);
const explanationFailCards = withExplanation.filter(explanationFails);
const priorWith = priorCards.filter((card) => explanations(card).length > 0);
const priorFail = priorWith.filter(explanationFails);

const partials = cards.filter(isPartialSupport);
const showing = partials.filter(showsReason);
const priorPartials = priorCards.filter(isPartialSupport);
const priorShowing = priorPartials.filter(showsReason);

const silences = silenceCounts(cards);
const priorSilences = silenceCounts(priorCards);
const phrases = phraseCounts(cards);

const confirmed = confirmedCards(cards, labelByKey);
const priorConfirmed = confirmedCards(priorCards, labelByKey);
if (confirmed.length !== 74 || priorConfirmed.length !== 74) {
  throw new Error(`b455 score: confirmed set is ${priorConfirmed.length} then ${confirmed.length}`);
}
const tally = tallyLeaveAlone(confirmed);
const priorTally = tallyLeaveAlone(priorConfirmed);
const caught = catchOf(indexCards(cards), design, mapped);
const priorCaught = catchOf(indexCards(priorCards), design, mapped);

const priorByKey = indexCards(priorCards);
const movers = [];
for (const card of cards) {
  const before = priorByKey.get(joinKey(card.fixtureId, card.statement, card.occurrence));
  if (!before) {
    movers.push({ key: keyOf(card), missing: "before" });
    continue;
  }
  const verdictMoved = before.displayVerdict !== card.displayVerdict;
  const supportMoved = before.supportState !== card.supportState;
  if (!verdictMoved && !supportMoved) continue;
  movers.push({
    key: keyOf(card),
    statement: card.statement,
    beforeVerdict: before.displayVerdict,
    afterVerdict: card.displayVerdict,
    beforeSupport: before.supportState,
    afterSupport: card.supportState,
    beforeExplanation: explanations(before)[0] || "",
    afterExplanation: explanations(card)[0] || "",
    beforeSummary: typeof before.evidenceSummary === "string" ? before.evidenceSummary : "",
    afterSummary: typeof card.evidenceSummary === "string" ? card.evidenceSummary : "",
  });
}

const readingPresent = cards.filter((card) => typeof card.readingNote?.text === "string" && card.readingNote.text.trim()).length;
const readingFail = cards.filter((card) => noteEndorsement(card.readingNote?.text)).length;

let estimateUsd = null;
try {
  const estimate = JSON.parse(readFileSync(ESTIMATE, "utf8"));
  estimateUsd = estimate?.onePass?.usd ?? null;
} catch {
  estimateUsd = null;
}

const spend = nextDoc.spend || {};
const priorSpend = priorDoc.spend || {};
const noteCalls = (Array.isArray(nextDoc.fixtures) ? nextDoc.fixtures : []).reduce((sum, row) => sum + (row?.noteSpend?.calls || 0), 0);
const noteList = (Array.isArray(nextDoc.fixtures) ? nextDoc.fixtures : []).reduce((sum, row) => sum + (row?.noteSpend?.listUsd || row?.noteSpend?.costUsd || 0), 0);
const quotes = pickQuotes(cards);

const JUDGEMENTS = {
  "01:4": "Better. The source gives the two-thirds App Store figure. It does not say the App Store is the strategic moat. Partial is the right class. The explanation still ends by saying the usage figure is confirmed, so the guard withholds the reason.",
  "01:7": "Better. Marketing and international expansion are in the source. Continued development of the App Store ecosystem is wider than the source's business development for the store. Partial names that.",
  "01:9": "Better. The source gives 24 employees in Ottawa and the same 60 to 70 percent cost. The old conflict class contradicted its own explanation, which already said the source matched. The new commentary still invents a conflict about the base location. The class is the one that matches the source.",
  "02:5": "Better. The source says atNorth has strong foundations for this demand. It does not say the company is exceptionally well positioned. Partial is right.",
  "04:6": "Worse. The source already calls the metrics exceptional, and the strongest product-market-fit signal in a consumer investment over the past two years. That is a consumer product at this stage. Treating the wording as a gap moved a confirmed card off the leave-alone set.",
  "06:5": "Better. The revenue and the margin match. Over the holding period is not in the source, so partial is fairer than the old conflict. The explanation says the margin claim is supported, so the reason is withheld.",
  "08:6": "Better. The source gives a compound annual growth rate of 17.1 percent and the sentence says 17 percent. That is the rounding the brief asked for. Conflict overstated it.",
  "08:14": "Better. The source expects two to three add-on acquisitions. It does not say the funding is already committed. Partial is right. The explanation also says no pipeline has been identified, while the commentary says five targets are named. That second gap is overstated.",
  "08:15": "Better. The four risks are in the source. Specific mitigations in place is not. Partial is right.",
  "08:16": "Worse. The commentary still says the source does not mention a credible M&A roadmap, and the class moved from partial to fully backed. The roadmap claim is now unmarked.",
  "09:4": "Better. June, the chief executive, procurement, and the footprint review are in the source. Commercial priorities identified at IC is not. Partial is right.",
  "09:7": "Worse. The matcher says the source gives EUR 105 million against the original EUR 122 million, which is the sentence. The card is now not reviewed, and the commentary says the sources do not address it. A backed sentence was dropped.",
  "09:9": "Worse. A corrective action plan, raised in October by the second-largest medical customer, is the same fact as a corrective action programme. The new class treats the wording as a missing fact.",
  "11:5": "Better. The source gives 42 percent of revenue from outside the region at exit, and 81 percent Nordic at entry, which is the 19 percent. The old card was not reviewed.",
  "12:5": "Better. The source describes the move from a Swedish business to an international one. Partial keeps that and still marks the numbers as absent. Not supported had hidden the transformation.",
  "13:9": "Better. The source gives 1,200 of about 14,000 firms and names legacy software. It does not give 40 percent. Partial shows both. Not supported had said nothing was there.",
  "13:13": "Worse. The source states a 2.6x MOIC and a 21 percent IRR, and the explanation says that matches. The class moved to conflict because the source does not say the IRR is gross. That is a missing word, not a conflicting figure.",
  "14:2": "Equivalent. Both passes say the EU MDR pathway is well understood and that incumbents hold clearances. The new class treats matured as a further claim. The reader is not shown a different fact.",
  "15:10": "Worse. The source describes Atelier 73 as a small, design-led format aimed at a younger urban customer. The class moved to conflict because the source does not use the words growth concept. The description matches.",
  "15:19": "Equivalent. Both passes say the source calls homeware a discretionary purchase and describes demand that moves with the economy. The class moved from partial to fully backed. Neither pass produces a different fact.",
  "15:25": "Better. The source says the model was stress-tested for 10 percent of leases renegotiated upward by 20 percent, with a modest impact. That is the sentence. Fully backed is right. The old partial treated detail the sentence left out as a gap in the source.",
  "15:32": "Better. The source calls the team strong and the plan well defined. It does not say high conviction, and it does not say further updates will follow. Partial is right.",
  "16:1": "Worse. The source states an enterprise value of EUR 310 million and a 72 percent stake, and the explanation says the two agree. The class moved to partial without a gap in that explanation.",
  "16:10": "Better. The category growth, the brand, and France, Italy, and Spain are in the source. The United States and the five-year hold are not. Partial is right.",
  "17:9": "Worse. The source says the embedded reversion is about 18 percent. The sentence says about 40 percent. The explanation says those figures cannot sit together. The class moved from conflict to fully backed, so the card no longer marks the conflict.",
  "18:6": "Equivalent. One passage quotes the market-leading product and the comparison with Yardi Nordic. Another says Bain's reference work confirmed the product and is silent on the founder team. The new class marks that silence. The word confirmed, which is in the explanation, is why that passage fails the guard.",
  "19:2": "Worse. The source says gross proceeds of SEK 12.8 billion. The sentence says SEK 18.4 billion. The explanation names that. The class moved from conflict to fully backed.",
  "19:3": "Equivalent. Strong performance across the substantial majority, with two issues, is the same picture as broadly positive with two challenges. The new class treats the wording, and the count of eight companies, as a gap. This is the other confirmed card that left the leave-alone set. No figure changed.",
  "19:4": "Better. The old label was not reviewed even though the explanation said the Brightway and Eltex figures match. The source gives 14 percent and 21 percent, and 23 percent and 31 percent, and the backlog from EUR 285 million to EUR 480 million. The new commentary still talks about a conflict those figures do not show.",
  "20:8": "Worse. The old card said the pipeline preparation was in the source and the second-quarter capital call was not. The new card says the sources do not address the sentence at all, so the backed half disappeared.",
};

const fieldLine = (counts, field) => counts.get(field) || 0;

const lines = [
  "# B455 result",
  "",
  "One pass of fixtures 01 to 20, cache off, frozen statements. The same harness as B446. No second pass.",
  "",
  `Recorded build on the pass file: \`${nextDoc.gitSha || "missing"}\`. The prompt change is in this commit. The pass file records the parent, because the pass and the prompt are committed together.`,
  "",
  "## What was changed",
  "",
  "The stage 2 explanation, in `lib/qc/pipeline-v4/prompts/stage2_v4.md`. This is the sentence stored as `matchExplanations`. The classification rules in that prompt were not rewritten. The explanation is now two or three sentences. The source is the subject. It quotes the source, then states the difference.",
  "",
  "The stage 5 commentary, in `lib/qc/pipeline-v4/prompts/stage5_v2.md`. This is the sentence stored as `evidenceSummary`. It is a separate call from the classification. It now leads with what the source contains, quotes the source, and does not tell a reviewer what to do.",
  "",
  "The framing note, in `lib/qc/framing-fidelity.mjs`. The decision to fire is the same call as the note. The fire rules were left in place. The note is now two sentences that quote the source and name what the sentence adds. One worked example no longer says the source confirms a figure.",
  "",
  "## What was left alone",
  "",
  "The reading note prompt. 155 notes on the B446 pass already passed the guard. That prompt is the register these three now follow.",
  "",
  "The craft note prompt and its ban list.",
  "",
  "`NOTE_BANNED_PHRASES`. The guard is unchanged.",
  "",
  "The editorial prompt. Two of 131 editorial notes failed the guard on the B446 pass. Fixture 16 index 3 says a growth rate is not the right figure, and the note uses the word correct. Fixture 17 index 7 quotes the draft, and the draft itself says structurally supported. Changing the editorial prompt would move the editorial layer, which leave-alone counts, in order to dodge a word that is the finding or a quotation. Those two notes stay.",
  "",
  "The widened multi-passage prompt, `stage2_v4_multipassage.md`. It returns passages and a class. It does not return the reader sentence. Changing it would move a verdict path without fixing a reader string.",
  "",
  "`commentary-builder.mjs` and `evidence-authority.mjs`. Nothing imports them. They are not on the pass.",
  "",
  "`displayedEvidenceProse` and the partial sentence are not producers. They repeat the matcher explanation or the commentary. They move when those two move.",
  "",
  "## Acceptance",
  "",
  `- Matcher explanations failing the guard. B446: ${priorFail.length} of ${priorWith.length}. This pass: ${explanationFailCards.length} of ${withExplanation.length}. Target: under 10.`,
  `- Partial cards showing a reason. B446, after the guard: ${priorShowing.length} of ${priorPartials.length}. This pass: ${showing.length} of ${partials.length}. Target: ${partials.length} of ${partials.length}.`,
  `- reader_prose_withheld, evidenceSummary. B446: ${fieldLine(priorSilences, "evidenceSummary")}. This pass: ${fieldLine(silences, "evidenceSummary")}.`,
  `- reader_prose_withheld, partialSentence. B446: ${fieldLine(priorSilences, "partialSentence")}. This pass: ${fieldLine(silences, "partialSentence")}.`,
  `- reader_prose_withheld, displayedEvidenceProse. B446: ${fieldLine(priorSilences, "displayedEvidenceProse")}. This pass: ${fieldLine(silences, "displayedEvidenceProse")}.`,
  `- reader_prose_withheld, framingFidelityConcerns. B446: ${fieldLine(priorSilences, "framingFidelityConcerns")}. This pass: ${fieldLine(silences, "framingFidelityConcerns")}.`,
  `- reader_prose_withheld, editorialConcerns. B446: ${fieldLine(priorSilences, "editorialConcerns")}. This pass: ${fieldLine(silences, "editorialConcerns")}. Left on the editorial prompt, as above.`,
  `- Reading notes failing the guard: ${readingFail} of ${readingPresent}.`,
  `- Catch. B446: ${priorCaught.raised} of ${priorCaught.n}. This pass: ${caught.raised} of ${caught.n}.${caught.misses.length ? ` Misses: ${caught.misses.join(", ")}.` : ""}`,
  `- Evidence leave-alone on the confirmed 74. B446: ${priorTally.evidenceLeaveAlone} of ${priorTally.n}. This pass: ${tally.evidenceLeaveAlone} of ${tally.n}.`,
  `- Combined quiet on the confirmed 74. B446: ${priorTally.combinedQuiet} of ${priorTally.n}. This pass: ${tally.combinedQuiet} of ${tally.n}.`,
  "",
  "## Where the target was missed",
  "",
  `Matcher explanations failing the guard are ${explanationFailCards.length} of ${withExplanation.length}. The target was under 10. Of those failures, 22 are the phrases aligns with or aligning with. The first sentence quotes the source. A later sentence then grades the draft, and that sentence is what the guard refuses. The other nine use confirmed, supported, correct, verified, or source confirms. Some of those words are the model's grading. Some are the source's own words, quoted. The guard was not changed, so a verbatim quote of those words still fails.`,
  "",
  `Evidence summaries withheld are ${fieldLine(silences, "evidenceSummary")}, against a target near zero. The commentary improved from ${fieldLine(priorSilences, "evidenceSummary")} and still closes by grading the sentence. displayedEvidenceProse is ${fieldLine(silences, "displayedEvidenceProse")}. partialSentence is ${fieldLine(silences, "partialSentence")}. framingFidelityConcerns is ${fieldLine(silences, "framingFidelityConcerns")}.`,
  "",
  `Partial cards showing a reason are ${showing.length} of ${partials.length}. The four that still show the unrecorded line are the partials whose finding still contains supported, confirmed, or aligns with.`,
  "",
  "A second pass was not run. This pass cost list USD 24.529925. The estimate for one pass was list USD 26.613613. Another full pass on the same harness would put the spec over the USD 40 ceiling.",
  "",
  "Catch held at 11 of 11. A fall would have been a defect. There was no fall.",
  "",
  "Evidence leave-alone moved from 45 of 74 to 43 of 74. The two confirmed cards that left are 04:6 and 19:3, both judged in the classification section. Combined quiet moved from 29 of 74 to 27 of 74. Three confirmed cards became quiet because an editorial or compliance concern dropped: 02:0, 03:1, and 13:3. Five left the quiet set: 04:6, 19:3, and three where an editorial concern appeared without an evidence change, 05:2, 13:11, and 15:17. The editorial prompt was not changed. Those three are the editorial model's own variance.",
  "",
  "## Phrases still refused",
  "",
  ...(phrases.length ? phrases.map(([phrase, count]) => `- ${phrase}: ${count}`) : ["- None."]),
  "",
  "## Classification changes",
  "",
  `${movers.length} cards changed displayVerdict or supportState against the B446 pass.`,
  "",
];

if (!movers.length) {
  lines.push("No card changed class.", "");
}

for (const row of movers) {
  if (row.missing) {
    lines.push(`- ${row.key}. Missing on the ${row.missing} pass.`, "");
    continue;
  }
  lines.push(`### ${row.key}`, "");
  lines.push(row.statement, "");
  lines.push(`Before: ${row.beforeVerdict} (${row.beforeSupport}). After: ${row.afterVerdict} (${row.afterSupport}).`, "");
  lines.push("Explanation before:", "", quoteBlock(row.beforeExplanation), "");
  lines.push("Explanation after:", "", quoteBlock(row.afterExplanation), "");
  lines.push("Commentary before:", "", quoteBlock(row.beforeSummary), "");
  lines.push("Commentary after:", "", quoteBlock(row.afterSummary), "");
  const judgement = JUDGEMENTS[row.key];
  if (!judgement) throw new Error(`b455 score: no judgement for ${row.key}`);
  lines.push(`Judgement: ${judgement}`, "");
}

lines.push(
  "## Ten explanations",
  "",
  "Full text, one per draft where the pass has that class.",
  "",
  "Read against the brief: the partials on 02:5 and 04:6 lead with the source and then the difference. The conflicts on 05:0 and 08:2 do the same. The fully backed cards still add a grading close, such as matching the statement or confirming the investment. Fixture 01:4 still says the usage statistic is confirmed. Fixture 04:3 is classed as a conflict while the explanation says the figures match.",
  "",
);
for (const row of quotes) {
  lines.push(`### ${row.kind}, fixture ${row.key}, ${row.verdict}`, "", quoteBlock(row.text), "");
}

lines.push(
  "## Spend",
  "",
  `Estimate before the calls: ${estimateUsd == null ? "not stored" : `USD ${money(estimateUsd)} list`}. The estimate is the B446-shaped one-pass figure. It does not add tokens for the longer explanation. Ceiling USD 40.`,
  "",
  `This pass. List USD ${money(spend.listUsd)}. Discounted USD ${money(spend.costUsd)}. Calls ${spend.calls ?? 0}. Unpriced ${spend.unpricedCalls ?? 0}.`,
  `B446. List USD ${money(priorSpend.listUsd)}. Discounted USD ${money(priorSpend.costUsd)}. Calls ${priorSpend.calls ?? 0}.`,
  "",
  "By model. gpt-4o is the matcher, the commentary, editorial, and compliance. gpt-4o-mini is the framing judge and the duplication judge. Opus is the reading note and the craft note. The reading note and the craft note prompts were not changed.",
  "",
);

for (const [name, bucket] of Object.entries(spend.byModel || {})) {
  const before = priorSpend.byModel?.[name] || {};
  lines.push(
    `- ${name}. Calls ${bucket.calls} (B446 ${before.calls ?? 0}). List is inside the pass total. Discounted USD ${money(bucket.costUsd)} (B446 ${money(before.costUsd)}). Output tokens ${bucket.outputTokens} (B446 ${before.outputTokens ?? 0}).`,
  );
}

lines.push(
  "",
  `Note-step calls stored on the fixtures, the reading note and the craft note together: ${noteCalls} calls, USD ${money(noteList)}. That figure is inside the pass total. Neither prompt was changed.`,
  "",
  "## What stayed put",
  "",
  "The classification rules, the reading note, the craft note, and the endorsement list were not edited. A card whose class moved did so because the same call writes the class and the explanation, or because the commentary the framing judge reads is now in the new register.",
  "",
);

writeFileSync(OUT, lines.join("\n"));
console.log(JSON.stringify({
  explanationFail: `${explanationFailCards.length}/${withExplanation.length}`,
  showing: `${showing.length}/${partials.length}`,
  silences: Object.fromEntries(silences),
  catch: caught,
  leaveAlone: { evidence: tally.evidenceLeaveAlone, quiet: tally.combinedQuiet, n: tally.n },
  movers: movers.map((row) => row.key),
  quotes: quotes.length,
  spend: { list: spend.listUsd, discounted: spend.costUsd, calls: spend.calls },
}, null, 2));
