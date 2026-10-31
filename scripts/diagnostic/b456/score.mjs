/**
 * Score the B456 pass. No model calls.
 *
 *   node scripts/diagnostic/b456/score.mjs
 *
 * Agreement is counted by assertsAgreement in lib/qc/source-account.mjs.
 * That function strips quoted copies, then looks for a relation in which
 * the source and the sentence are said to fit. It does not use NOTE_BANNED_PHRASES.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PARTIAL_UNRECORDED } from "../../../lib/qc/partial-sentence.mjs";
import { sealReaderCard } from "../../../lib/qc/reader-prose-guard.mjs";
import { noteEndorsement } from "../../../lib/qc/reading-contract.mjs";
import {
  assertsAgreement,
  productSentences,
  sentenceIsTemplate,
} from "../../../lib/qc/source-account.mjs";
import { shownState } from "../../../lib/qc/shown-verdict.mjs";
import { layerSpoken, tallyLeaveAlone } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "pass-1.json");
const B455 = path.join(__dirname, "../b455/pass-1.json");
const B446 = path.join(__dirname, "../b446/pass-1.json");
const ESTIMATE = path.join(__dirname, "estimate.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const OUT = path.join(__dirname, "RESULT.md");
const ACCOUNT = path.join(__dirname, "../../../lib/qc/source-account.mjs");

const JUDGEMENTS = {
  "01:4": "Worse. The two-thirds figure is in the passage. The claim that the App Store is the strategic moat is not, and the card is fully backed again.",
  "01:7": "Worse. Marketing and international expansion are in the passage. Continued development of the App Store ecosystem is wider than that, and the card is fully backed again.",
  "01:9": "Worse. The passage gives 24 employees in Ottawa and the same cost band. The card is a conflict over talent wording.",
  "02:5": "Equivalent. The card stays partial. The passage says AI is accelerating location-agnostic workloads and that atNorth has strong foundations. It does not say exceptionally well positioned. The difference points at the demand clause, whose meaning is already in the passage.",
  "04:6": "Better. The passage already calls the metrics exceptional for a consumer investment. Fully backed is the fair class, and a confirmed card is quiet again.",
  "04:7": "Worse. The passage describes one unusual engagement model. The sentence says the user base is unusual in two respects. The card is fully backed and names no difference.",
  "04:19": "Worse. The passage covers a total-loss stress test and the engagement signal. It does not mention the founder team. The card is fully backed.",
  "06:5": "Equivalent. The revenue matches. The difference sets around 14 percent beside 14.2 percent, and the class is a conflict, which is the class it had before the shared prompt.",
  "08:6": "Equivalent. The passage gives 17.1 percent and the sentence says 17 percent. The difference states that rounding. The class is a conflict, as it was before the shared prompt.",
  "08:10": "Worse. The passage gives a 9 percent growth build. It does not mention aerospace. The card is fully backed.",
  "08:14": "Better. The passage expects two to three add-on acquisitions. It does not say the funding is committed, and it does not say a priority pipeline has been identified. Partial is right.",
  "08:15": "Worse. The four risks are in the passage. Specific mitigations in place is not, and the card is fully backed again.",
  "08:16": "Better. The passage does not mention a credible M&A roadmap. Partial names that, where the previous pass had marked the card fully backed.",
  "09:4": "Worse. June, the chief executive, procurement, and the footprint are in the passage. Commercial priorities identified at IC is not, and the card is fully backed again.",
  "09:7": "Better. The passage gives EUR 105 million against EUR 122 million. The card is fully backed again, after a pass that had marked it not reviewed.",
  "09:9": "Better. A corrective action plan in October at the second-largest medical customer is the same fact. Fully backed is right.",
  "11:5": "Better. The passage gives 42 percent international at exit and 81 percent Nordic at entry, which is the 19 percent. The card is no longer not reviewed.",
  "11:7": "Worse. The passage states four bolt-on acquisitions and HeatTech at SEK 1.1 billion, which is the sentence. The card is a conflict and the difference was not recorded.",
  "12:5": "Better. The passage describes the move from a Swedish business to an international one. Partial keeps that and marks the numbers as absent.",
  "13:9": "Better. The passage gives 1,200 of about 14,000 firms and names legacy software. It does not give 40 percent. Partial shows both.",
  "13:13": "Better. The passage states 2.6x MOIC and 21 percent IRR. Fully backed is right. A missing word, gross, is not a conflicting figure.",
  "14:2": "Equivalent. The passage says the EU MDR pathway is well understood. The card treats matured as a further claim. No figure changed.",
  "14:6": "Better. The passage says there is an opportunity to genuinely improve clinical workflows. That is the sentence. Fully backed is right.",
  "15:10": "Worse. The passage describes Atelier 73 as a small, design-led format for a younger urban customer. The card is a conflict.",
  "15:19": "Equivalent. The passage calls homeware a discretionary purchase and describes demand that moves with the economy. Fully backed does not add a fact.",
  "15:25": "Worse. The passage says the model was stress-tested and the impact on returns is modest. The card treats modest lease renegotiation as absent.",
  "15:32": "Worse. The passage calls the team strong and the plan well defined. High conviction and further updates are not there, and the card is fully backed again.",
  "16:1": "Better. The passage states an enterprise value of EUR 310 million and a 72 percent stake. Fully backed is right.",
  "16:10": "Better. The category, the brand, and France, Italy, and Spain are in the passage. The United States and the five-year hold are not. Partial is right.",
  "17:9": "Worse. The passage says the embedded reversion is about 18 percent. The sentence says about 40 percent. The card is fully backed.",
  "18:6": "Equivalent. The difference names the underpenetrated market and the founder team as absent. The product comparison can still sit in another passage. No figure in the class is new.",
  "19:2": "Better. The passage says SEK 12.8 billion. The sentence says SEK 18.4 billion. The card is a conflict again, and the difference names both figures.",
  "19:3": "Equivalent. Strong performance across the substantial majority, with two issues, is the same picture as broadly positive with two challenges. Fully backed does not change a figure.",
  "19:4": "Better. The passage gives the Brightway and Eltex growth rates and the backlog from EUR 285 million to EUR 480 million. The card is no longer not reviewed.",
  "20:8": "Equivalent. The card is partial again. The difference treats both the pipeline preparation and the second-quarter capital call as absent, which is a harder reading than the class.",
};

function pad(id) {
  return String(id).padStart(2, "0");
}

function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}

function money(value) {
  return Number(value || 0).toFixed(6);
}

function quoteBlock(text) {
  return String(text || "").split("\n").map((line) => `> ${line}`).join("\n");
}

function explanations(card) {
  return (Array.isArray(card?.matchExplanations) ? card.matchExplanations : [])
    .map((row) => (typeof row?.explanation === "string" ? row.explanation.trim() : ""))
    .filter(Boolean);
}

function indexCards(list) {
  const byKey = new Map();
  for (const card of list) byKey.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);
  return byKey;
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

function confirmedCards(cards, labelByKey) {
  const byKey = indexCards(cards);
  const out = [];
  for (const [key, row] of labelByKey) {
    if (row.label !== "confirmed") continue;
    const card = byKey.get(key);
    if (!card) throw new Error(`b456 score: confirmed label has no card (${key})`);
    out.push(card);
  }
  return out;
}

function silenceCounts(cards) {
  const counts = new Map();
  for (const card of cards) {
    const sealed = sealReaderCard(card);
    const seen = new Set();
    for (const row of Array.isArray(sealed.silences) ? sealed.silences : []) {
      if (row?.id !== "reader_prose_withheld") continue;
      const cardKey = `${keyOf(card)}|${row.field}|${row.reason}`;
      if (seen.has(cardKey)) continue;
      seen.add(cardKey);
      counts.set(row.field || "missing", (counts.get(row.field) || 0) + 1);
    }
  }
  return counts;
}

function readerProductText(card) {
  const parts = [];
  const difference = typeof card.sourceDifference === "string" ? card.sourceDifference.trim() : "";
  if (difference) parts.push(difference);
  const summary = typeof card.evidenceSummary === "string" ? card.evidenceSummary.trim() : "";
  if (summary && summary !== difference) parts.push(summary);
  const shown = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  if (shown && shown !== difference && shown !== summary) parts.push(shown);
  for (const field of ["framingFidelityConcerns", "editorialConcerns"]) {
    for (const row of Array.isArray(card[field]) ? card[field] : []) {
      const text = typeof row?.text === "string" && row.text.trim()
        ? row.text.trim()
        : (typeof row?.note === "string" ? row.note.trim() : "");
      if (text) parts.push(text);
    }
  }
  return parts;
}

function quotedSpans(text) {
  const found = [];
  const re = /"([^"]*)"/g;
  let match;
  while ((match = re.exec(String(text || "")))) found.push(match[1]);
  return found;
}

function accountIsFrame(text) {
  const body = typeof text === "string" ? text.trim() : "";
  if (!body) return true;
  if (sentenceIsTemplate(body)) return true;
  const parts = body.split(/(?<=\.)\s+(?=The sentence says )/);
  return parts.length > 1 && parts.every((part) => sentenceIsTemplate(part));
}

function isPartial(card) {
  return shownState(card) === "partial" || card?.displayVerdict === "supported_partial" || card?.supportState === "partial";
}

function showsReason(card) {
  const difference = typeof card.sourceDifference === "string" ? card.sourceDifference.trim() : "";
  if (!difference || difference === PARTIAL_UNRECORDED) return false;
  return !noteEndorsement(difference);
}

const nextDoc = JSON.parse(readFileSync(PASS, "utf8"));
const b455Doc = JSON.parse(readFileSync(B455, "utf8"));
const b446Doc = JSON.parse(readFileSync(B446, "utf8"));
const cards = nextDoc.cards;
if (!Array.isArray(cards) || cards.length !== 261) throw new Error(`b456 score: expected 261 cards, found ${cards?.length}`);

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

const fixtures = await loadAllFixtures();
const sourcesByFixture = new Map();
for (const fixture of fixtures) {
  const id = pad(fixture.data.id);
  sourcesByFixture.set(id, await loadPipelineSources(fixture.data.sources || []));
}

const quoteMisses = [];
const spanMisses = [];
for (const card of cards) {
  const quote = typeof card.sourceQuote === "string" ? card.sourceQuote : "";
  if (quote.trim()) {
    const sources = sourcesByFixture.get(pad(card.fixtureId)) || [];
    const found = sources.some((source) => typeof source.text === "string" && source.text.includes(quote));
    if (!found) quoteMisses.push(keyOf(card));
  }
  const difference = typeof card.sourceDifference === "string" ? card.sourceDifference : "";
  for (const span of quotedSpans(difference)) {
    const inSentence = typeof card.statement === "string" && card.statement.includes(span);
    const inQuote = quote.includes(span);
    if (!inSentence && !inQuote) spanMisses.push(`${keyOf(card)}: ${span}`);
  }
}

const agreementHits = [];
const offTemplate = [];
for (const card of cards) {
  for (const text of readerProductText(card)) {
    const sentences = productSentences(text);
    for (const sentence of sentences.length ? sentences : [text]) {
      if (assertsAgreement(sentence)) agreementHits.push({ key: keyOf(card), sentence });
    }
  }
  if (card.sourceAccount === true && !accountIsFrame(card.sourceDifference)) {
    offTemplate.push({ key: keyOf(card), sentence: card.sourceDifference || "" });
  }
}

const partials = cards.filter(isPartial);
const showing = partials.filter(showsReason);
const silences = silenceCounts(cards);
const priorSilences = silenceCounts(b455Doc.cards);
const b446Silences = silenceCounts(b446Doc.cards);

const confirmed = confirmedCards(cards, labelByKey);
const tally = tallyLeaveAlone(confirmed);
const tally455 = tallyLeaveAlone(confirmedCards(b455Doc.cards, labelByKey));
const tally446 = tallyLeaveAlone(confirmedCards(b446Doc.cards, labelByKey));
const caught = catchOf(indexCards(cards), design, mapped);
const caught455 = catchOf(indexCards(b455Doc.cards), design, mapped);
const caught446 = catchOf(indexCards(b446Doc.cards), design, mapped);

const by455 = indexCards(b455Doc.cards);
const by446 = indexCards(b446Doc.cards);
const movers = [];
for (const card of cards) {
  const join = joinKey(card.fixtureId, card.statement, card.occurrence);
  const a = by455.get(join);
  const b = by446.get(join);
  const moved455 = a && (a.displayVerdict !== card.displayVerdict || a.supportState !== card.supportState);
  const moved446 = b && (b.displayVerdict !== card.displayVerdict || b.supportState !== card.supportState);
  if (!moved455 && !moved446) continue;
  movers.push({
    key: keyOf(card),
    statement: card.statement,
    now: `${card.displayVerdict} (${card.supportState})`,
    at455: a ? `${a.displayVerdict} (${a.supportState})` : "missing",
    at446: b ? `${b.displayVerdict} (${b.supportState})` : "missing",
    difference: typeof card.sourceDifference === "string" ? card.sourceDifference : "",
    quote: typeof card.sourceQuote === "string" ? card.sourceQuote : "",
  });
}

function pick(kind, pred, n) {
  const seen = new Set();
  const out = [];
  for (const card of cards) {
    if (!pred(card)) continue;
    const fixture = pad(card.fixtureId);
    if (seen.has(fixture)) continue;
    if (!(card.sourceQuote || card.sourceDifference)) continue;
    seen.add(fixture);
    out.push(card);
    if (out.length === n) break;
  }
  return out.map((card) => ({ kind, key: keyOf(card), verdict: card.displayVerdict, card }));
}

const quotes = [
  ...pick("partial", (card) => card.displayVerdict === "supported_partial", 3),
  ...pick("conflicting", (card) => card.displayVerdict === "conflict" || card.displayVerdict === "conflicting", 3),
  ...pick("fully backed", (card) => card.displayVerdict === "supported_full", 4),
];

const accountSource = readFileSync(ACCOUNT, "utf8");
const agreeStart = accountSource.indexOf("export function assertsAgreement");
const agreeEnd = accountSource.indexOf("export function renderDifference");
const agreeCode = accountSource.slice(agreeStart, agreeEnd).trim();

let estimateUsd = null;
try {
  estimateUsd = JSON.parse(readFileSync(ESTIMATE, "utf8"))?.onePass?.usd ?? null;
} catch {
  estimateUsd = null;
}
const spend = nextDoc.spend || {};
const spend455 = b455Doc.spend || {};
const fieldLine = (counts, field) => counts.get(field) || 0;

const lines = [
  "# B456 result",
  "",
  "One pass of fixtures 01 to 20, cache off, frozen statements. The same harness as B455. The estimate printed before the calls was list USD 26.613613, under the ceiling of USD 40.",
  "",
  `Recorded build on the pass file: \`${nextDoc.gitSha || "missing"}\`. The account is in this commit. The pass file records the parent, because the pass and the account are committed together.`,
  "",
  "## What was built",
  "",
  "`lib/qc/source-account.mjs`. Builds the reader account after the verdict exists. Returns a quote and a difference. It does not return a verdict.",
  "",
  "`lib/qc/pipeline-v4/prompts/source-difference.md`. The separate call. It copies spans. It does not write a sentence and it does not choose the class.",
  "",
  "`lib/qc/pipeline-v4/prompts/stage2_v4.md`. The explanation section that told the matcher how to talk to the reader is gone. The passage instruction no longer stops at 400 characters. The classification rules are the ones from before that section.",
  "",
  "`lib/qc/framing-fidelity.mjs`. The judge no longer receives the commentary. The note the reader sees is built from a phrase copied out of the sentence. The model's own note is not shown.",
  "",
  "`lib/qc/pipeline-v3/stage7-assemble-card.mjs`. The primary passage is no longer cut to 300 characters. The account is attached after the verdict, the framing demotion, the omission check, the actor check, the scale check, and the role check. When one of those checks has already written a fixed sentence, that sentence is the difference and the model is not asked.",
  "",
  "The screen, `SourceQuote.jsx` and `sourceQuoteLayout.js`. A passage longer than 80 characters, or one with a line break, steps out on its own line at the craft note's 72-character measure.",
  "",
  "## Why the wording cannot move the verdict",
  "",
  "The verdict is finished before `buildSourceAccount` is called. That function's return is `sourceQuote` and `sourceDifference`. It is not passed to `applyOmissionConflictInvariant`, `applyActorOfTheAction`, or `detectFramingFidelity`. The stage 2 prompt does not contain the account's sentences. The difference prompt is a different file, loaded only by the account. The framing judge's user prompt is the statement and the passages. Editing the account templates changes `source-account.mjs` and `source-difference.md`. Neither file is an input to the classification call.",
  "",
  "The quote is copied from the passage. A fully backed card has that quote and no second sentence. A partial or a conflict adds a sentence only by filling a fixed frame with spans that were checked as verbatim copies. There is no field whose job is to say the source agrees.",
  "",
  "## How agreement was counted",
  "",
  "The count is not the sixteen banned phrases. Quoted copies are removed first. What remains is an agreement when it says the source and the sentence fit: the source or the passage confirms, supports, verifies, matches, aligns, agrees, backs, or corroborates, or the sentence is said to be confirmed, supported, verified, or correct. The function is `assertsAgreement` in `lib/qc/source-account.mjs`.",
  "",
  "```",
  agreeCode,
  "```",
  "",
  `Statements that tell the reader the sources agree: ${agreementHits.length}.`,
  ...(agreementHits.length ? agreementHits.slice(0, 20).map((row) => `- ${row.key}. ${row.sentence}`) : ["- None."]),
  "",
  `Account sentences that are not one of the fixed frames: ${offTemplate.length}.`,
  ...(offTemplate.length ? offTemplate.slice(0, 20).map((row) => `- ${row.key}. ${row.sentence}`) : ["- None."]),
  "",
  "## Acceptance",
  "",
  `- Partial cards showing a reason: ${showing.length} of ${partials.length}.`,
  `- reader_prose_withheld, evidenceSummary. B446 ${fieldLine(b446Silences, "evidenceSummary")}. B455 ${fieldLine(priorSilences, "evidenceSummary")}. This pass ${fieldLine(silences, "evidenceSummary")}.`,
  `- reader_prose_withheld, partialSentence. B446 ${fieldLine(b446Silences, "partialSentence")}. B455 ${fieldLine(priorSilences, "partialSentence")}. This pass ${fieldLine(silences, "partialSentence")}.`,
  `- reader_prose_withheld, displayedEvidenceProse. B446 ${fieldLine(b446Silences, "displayedEvidenceProse")}. B455 ${fieldLine(priorSilences, "displayedEvidenceProse")}. This pass ${fieldLine(silences, "displayedEvidenceProse")}.`,
  `- reader_prose_withheld, framingFidelityConcerns. B446 ${fieldLine(b446Silences, "framingFidelityConcerns")}. B455 ${fieldLine(priorSilences, "framingFidelityConcerns")}. This pass ${fieldLine(silences, "framingFidelityConcerns")}.`,
  `- reader_prose_withheld, editorialConcerns. B446 ${fieldLine(b446Silences, "editorialConcerns")}. B455 ${fieldLine(priorSilences, "editorialConcerns")}. This pass ${fieldLine(silences, "editorialConcerns")}. The editorial prompt was not changed.`,
  `- Catch. B446 ${caught446.raised} of ${caught446.n}. B455 ${caught455.raised} of ${caught455.n}. This pass ${caught.raised} of ${caught.n}.${caught.misses.length ? ` Misses: ${caught.misses.join(", ")}.` : ""}`,
  `- Evidence leave-alone. B446 ${tally446.evidenceLeaveAlone} of ${tally446.n}. B455 ${tally455.evidenceLeaveAlone} of ${tally455.n}. This pass ${tally.evidenceLeaveAlone} of ${tally.n}.`,
  `- Combined quiet. B446 ${tally446.combinedQuiet} of ${tally446.n}. B455 ${tally455.combinedQuiet} of ${tally455.n}. This pass ${tally.combinedQuiet} of ${tally.n}.`,
  "",
  "## Verbatim",
  "",
  `Quoted passages checked against the fixture source text: ${cards.filter((card) => card.sourceQuote).length}. Not found in the cited source: ${quoteMisses.length}.`,
  ...(quoteMisses.length ? quoteMisses.map((key) => `- ${key}`) : ["- None."]),
  "",
  `Difference spans not found in the sentence or the passage: ${spanMisses.length}.`,
  ...(spanMisses.length ? spanMisses.slice(0, 20).map((row) => `- ${row}`) : ["- None."]),
  "",
  "## Classification changes",
  "",
  `${movers.length} cards differ from B455 or from B446 on displayVerdict or supportState.`,
  "",
];

for (const row of movers) {
  lines.push(`### ${row.key}`, "");
  lines.push(row.statement, "");
  lines.push(`B446: ${row.at446}. B455: ${row.at455}. This pass: ${row.now}.`, "");
  if (row.quote) lines.push("Quote:", "", quoteBlock(row.quote), "");
  if (row.difference) lines.push("Difference:", "", quoteBlock(row.difference), "");
  lines.push(`Judgement: ${JUDGEMENTS[row.key] || "UNJUDGED"}`, "");
}

lines.push("## Ten cards", "");
for (const row of quotes) {
  lines.push(`### ${row.kind}, fixture ${row.key}, ${row.verdict}`, "");
  lines.push(row.card.statement, "");
  if (row.card.sourceQuote) lines.push("Quote:", "", quoteBlock(row.card.sourceQuote), "");
  lines.push("Difference:", "", quoteBlock(row.card.sourceDifference || "(none)"), "");
}

lines.push(
  "",
  "## Spend",
  "",
  `Estimate before the calls: ${estimateUsd == null ? "not stored" : `USD ${money(estimateUsd)} list`}. The harness estimate does not add the difference call. Ceiling USD 40.`,
  "",
  `This pass. List USD ${money(spend.listUsd)}. Discounted USD ${money(spend.costUsd)}. Calls ${spend.calls ?? 0}. Unpriced ${spend.unpricedCalls ?? 0}.`,
  `B455. List USD ${money(spend455.listUsd)}. Discounted USD ${money(spend455.costUsd)}. Calls ${spend455.calls ?? 0}.`,
  "",
);

for (const [name, bucket] of Object.entries(spend.byModel || {})) {
  const before = spend455.byModel?.[name] || {};
  lines.push(
    `- ${name}. Calls ${bucket.calls} (B455 ${before.calls ?? 0}). Discounted USD ${money(bucket.costUsd)} (B455 ${money(before.costUsd)}). Output tokens ${bucket.outputTokens} (B455 ${before.outputTokens ?? 0}).`,
  );
}

lines.push("");
writeFileSync(OUT, lines.join("\n"));
const missing = movers.filter((row) => !JUDGEMENTS[row.key]);
console.log(JSON.stringify({
  agreement: agreementHits.length,
  offTemplate: offTemplate.length,
  showing: `${showing.length}/${partials.length}`,
  silences: Object.fromEntries(silences),
  catch: caught,
  leaveAlone: { evidence: tally.evidenceLeaveAlone, quiet: tally.combinedQuiet },
  quoteMisses: quoteMisses.length,
  spanMisses: spanMisses.length,
  movers: movers.map((row) => row.key),
  quotes: quotes.length,
  unjudged: missing.length,
  spend: { list: spend.listUsd, discounted: spend.costUsd, calls: spend.calls },
}, null, 2));
if (missing.length) {
  console.error(`b456 score: ${missing.length} cards have no judgement`);
  process.exit(2);
}
