/**
 * B503. Score the one pass. No further model call.
 * Gates sit beside B490 pass 1, B490 pass 2, and the B500 replay.
 *
 *   node scripts/diagnostic/b503/score.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assessmentCountLines, combinedVerdict } from "../../../lib/qc/combined-verdict.mjs";
import { endorsementHit } from "../../../lib/qc/endorsement-phrases.mjs";
import { maskVerbatimQuotes, sourceCorpus } from "../../../lib/qc/quoted-span.mjs";
import { plainReaderText } from "../../../lib/qc/reader-plain.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { SHOWN_LABELS, shownLabel, shownState, shownTier } from "../../../lib/qc/shown-verdict.mjs";
import { statementClaimsDone } from "../../../lib/qc/transaction-state.mjs";
import { tallyLeaveAlone } from "../lib/leave-alone.mjs";
import { joinKey } from "../accuracy/lib.mjs";
import {
  afterOf,
  cardOf,
  corpusOnly,
  emptyReasonKeys,
  keyOf,
  leaveAloneCards,
  loadCards,
  loadGateContext,
  pad,
  raised,
} from "../b496/replay.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "pass-1.json");
const B490_1 = path.join(__dirname, "../b490/pass-1.json");
const B490_2 = path.join(__dirname, "../b490/pass-2.json");
const B500 = path.join(__dirname, "../b500/RESULT.md");
const RESULT = path.join(__dirname, "RESULT.md");
const FRONT_REASON = path.resolve(__dirname, "../../../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js");
const FAULTY = new Set(["conflicting", "no_support"]);
const LOUD = new Set(["conflicts", "not_in_source", "note_withheld"]);
const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);
const INTERNAL = /\brungs?\b|\bmodality\b/i;
const STATUS_IDS = ["04:0", "04:1", "08:0", "08:2", "15:0", "15:2", "17:0", "18:0", "18:2", "23:0", "25:0", "25:2"];
const MEANING_IDS = ["04:1", "18:2", "11:12", "15:12", "17:6", "05:2", "10:4", "15:25", "08:13"];
const ADDON = "We have committed funding for two to three add-on acquisitions";

function asLiveCard(card) {
  const refused = (card.silences || []).some((row) => row?.id === "note_refused");
  if (!refused || card?.readingNote?.refused === true) return card;
  return { ...card, readingNote: { ...(card.readingNote || {}), refused: true } };
}

function liveCombined(card) {
  const viewed = asLiveCard(card);
  const state = shownState(viewed);
  if (!state) throw new Error(`b503 score: shown state is missing for ${keyOf(card)}`);
  return combinedVerdict({
    verdict: { state },
    editorialConcerns: Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [],
    complianceVerdict: typeof card?.complianceVerdict === "string" ? card.complianceVerdict : null,
    complianceConcerns: Array.isArray(card?.complianceConcerns) ? card.complianceConcerns : [],
  });
}

function edgeAgrees(card) {
  const combined = liveCombined(card);
  const { label, tone } = combined;
  if (label === "Conflicts with the source" || label === "Not in the source" || label === "Compliance risk") return tone === "red";
  if (label === "Goes beyond the source" || label === "Needs a look") return tone === "amber";
  if (label === "Craft or compliance notes") return tone === "grey";
  if (label === "Nothing raised") return tone === "none";
  return false;
}

function countMismatches(cards) {
  const lines = assessmentCountLines(cards, (card) => liveCombined(card));
  const actual = new Map();
  for (const card of cards) {
    const state = liveCombined(card).state;
    actual.set(state, (actual.get(state) || 0) + 1);
  }
  const bad = [];
  for (const line of lines) {
    const sum = line.states.reduce((total, state) => total + (actual.get(state) || 0), 0);
    if (sum !== line.count) bad.push(`${line.text} counts ${line.count} cards ${sum}`);
  }
  const covered = new Set(lines.flatMap((line) => line.states));
  for (const [state, count] of actual) {
    if (count > 0 && state !== "nothing_raised" && !covered.has(state)) {
      bad.push(`${state} has ${count} cards and no assessment line`);
    }
  }
  return bad;
}

function excerptsOf(card) {
  return [card.primaryExcerpt, card.conflictExcerpt].filter((text) => typeof text === "string" && text.trim());
}

function introducedDash(text, corpus) {
  let left = String(text || "");
  if (!/[\u2014\u2013]/.test(left)) return false;
  for (const piece of corpus) {
    if (typeof piece === "string" && piece && left.includes(piece)) left = left.split(piece).join("");
  }
  return /[\u2014\u2013]/.test(left);
}

function withoutCompletion(card) {
  if (!card?.readingNote) return card;
  return { ...card, readingNote: { ...card.readingNote, completion: "none" } };
}

function baseState(card) {
  return shownState(withoutCompletion(card));
}

function completionRaw(card) {
  return String(card?.readingNote?.completion || "").trim().toLowerCase();
}

function stateUnder(card, ungated) {
  const base = baseState(card);
  const raw = completionRaw(card);
  if (raw !== "pending" && raw !== "predates") return base;
  if (LOUD.has(base)) return base;
  if (!ungated && !statementClaimsDone(card?.statement)) return base;
  return raw === "pending" ? "conflicts" : "beyond";
}

function labelUnder(card, ungated) {
  return SHOWN_LABELS[stateUnder(card, ungated)] || "";
}

function humanLabel(card, labelByJoin) {
  return labelByJoin.get(joinKey(card.fixtureId, card.statement, card.occurrence)) || "";
}

function loudFromStatus(card, ungated) {
  const raw = completionRaw(card);
  if (raw !== "pending" && raw !== "predates") return false;
  if (!QUIET.has(baseState(card))) return false;
  const next = stateUnder(card, ungated);
  return next === "conflicts" || next === "beyond";
}

function removesHedge(statement, text) {
  if (!/\b(returns?|performance|outcomes?)\b/i.test(statement || "")) return false;
  if (!/\b(believe|expect|in our view)\b/i.test(statement || "")) return false;
  const body = String(text || "");
  const quoted = [...body.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
  if (/\breplace\b/i.test(body) && /\bwith\b/i.test(body) && quoted.length >= 2) {
    if (/\b(believe|expect|in our view)\b/i.test(quoted[0]) && !/\b(believe|expect|in our view)\b/i.test(quoted[1])) return true;
  }
  return /\b(remove|drop|delet|omit|cut|strip)\b/i.test(body) && /\b(believe|expect|in our view)\b/i.test(body);
}

function gateLines(name, cards, ctx, screen) {
  const corpusCards = corpusOnly(cards);
  const judged = corpusCards.map((card) => ({ card, after: afterOf(card) }));
  const afterByJoin = new Map(judged.map((row) => [joinKey(row.card.fixtureId, row.card.statement, row.card.occurrence), row]));
  let faultyN = 0;
  let faultyRaised = 0;
  for (const row of ctx.labels) {
    if (row.kind && row.kind !== "statement") continue;
    if (!FAULTY.has(row.label)) continue;
    faultyN += 1;
    const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
    const card = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
    if (card && raised(card)) faultyRaised += 1;
  }
  let groupRaised = 0;
  for (const fault of ctx.design.faults) {
    const mappedRow = ctx.mapped.mapping.find((item) => item.id === fault.id);
    const key = mappedRow?.keys?.[0] || null;
    const judgedRow = key ? afterByJoin.get(key) : null;
    const afterCard = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
    if (afterCard && raised(afterCard)) groupRaised += 1;
  }
  const leaveCards = leaveAloneCards(cards, ctx.labels, ctx.sourcesByFixture).map((row) => row.card);
  const leave = tallyLeaveAlone(leaveCards);
  let quietCorrect = 0;
  for (const card of corpusCards) {
    const label = humanLabel(card, ctx.labelByJoin);
    if (FAULTY.has(label) || label === "partially_confirmed") continue;
    if (card.displayVerdict === "supported_full" && (card.sentenceState === "nothing_raised" || card.sentenceState === "nothing_to_raise")) {
      quietCorrect += 1;
    }
  }
  let endorsement = 0;
  let dashes = 0;
  let internal = 0;
  for (const card of corpusCards) {
    const reason = readerEvidenceSentence(card) || "";
    const corpus = sourceCorpus(card);
    const examined = corpus.length ? maskVerbatimQuotes(reason, corpus) : reason;
    if (endorsementHit(examined)) endorsement += 1;
    const pieces = [card.statement, ...excerptsOf(card), card.sourceQuote];
    const note = card.readingNote && (card.readingNote.bucket === "beyond" || card.readingNote.bucket === "conflicts")
      ? plainReaderText(card.readingNote.text || "")
      : "";
    for (const text of [shownLabel(card) || "", shownTier(shownState(card)) || "", reason, note]) {
      if (introducedDash(text, pieces)) dashes += 1;
      if (INTERNAL.test(text)) internal += 1;
    }
  }
  let parity = 0;
  if (screen) {
    for (const card of cards) {
      if ((readerEvidenceSentence(card) || "") !== (screen.readerEvidenceSentence(card) || "")) parity += 1;
    }
  }
  const empty = emptyReasonKeys(cards);
  const edges = cards.filter((card) => !edgeAgrees(card));
  const counts = countMismatches(cards);
  return {
    name,
    faultyRaised,
    faultyN,
    groupRaised,
    groupN: ctx.design.faults.length,
    leave: `${leave.evidenceLeaveAlone}/${leave.n}`,
    quiet: `${leave.combinedQuiet}/${leave.n}`,
    quietCorrect,
    endorsement,
    dashes,
    internal,
    parity,
    empty,
    edges,
    counts,
  };
}

function formatGate(row) {
  return [
    row.name,
    `catch: ${row.faultyRaised}/${row.faultyN}`,
    `group A: ${row.groupRaised}/${row.groupN}`,
    `leave-alone: ${row.leave}`,
    `combined quiet: ${row.quiet}`,
    `quiet on correct: ${row.quietCorrect}`,
    `endorsement: ${row.endorsement}`,
    `dashes: ${row.dashes}`,
    `internal words: ${row.internal}`,
    `parity: ${row.parity}`,
    `raised cards with an empty reason: ${row.empty.length}`,
    `edge vs label mismatches: ${row.edges.length}`,
    `Assessment count vs card count mismatches: ${row.counts.length}`,
  ];
}

const ctx = await loadGateContext();
const screen = await import(pathToFileURL(FRONT_REASON).href);
const cards = loadCards(PASS).map(asLiveCard);
const prior = loadCards(B490_1);
const prior2 = loadCards(B490_2);
const priorByKey = new Map(prior.map((card) => [keyOf(card), card]));
const b490Pass1 = gateLines("B490 pass 1", prior.map(asLiveCard), ctx, screen);
const b490Pass2 = gateLines("B490 pass 2", prior2.map(asLiveCard), ctx, screen);
const current = gateLines("B503", cards, ctx, screen);

const lines = ["# B503", ""];
lines.push(...formatGate(current));
if (current.empty.length) for (const key of current.empty) lines.push(`empty ${key}`);
if (current.edges.length) for (const card of current.edges) lines.push(`edge ${keyOf(card)} ${liveCombined(card).label} ${liveCombined(card).tone}`);
if (current.counts.length) for (const row of current.counts) lines.push(row);
lines.push("");
lines.push("alongside");
lines.push(formatGate(b490Pass1).join("\n"));
lines.push("");
lines.push(formatGate(b490Pass2).join("\n"));
lines.push("");
const b500 = readFileSync(B500, "utf8");
const b500Gates = b500.split("\n").filter((line) => (
  line.startsWith("catch:") || line.startsWith("group A:") || line.startsWith("raised cards")
  || line.startsWith("edge vs") || line.startsWith("Assessment count")
));
lines.push("B500 replay");
lines.push(b500Gates.length ? b500Gates.join("\n") : "missing");
lines.push("");

const refusals = [];
for (const card of cards) {
  for (const row of card.silences || []) {
    if (row?.id !== "note_refused") continue;
    refusals.push({ key: keyOf(card), reason: row.reason || "refused", rawReply: typeof row.rawReply === "string" ? row.rawReply : "" });
  }
}
const byReason = new Map();
for (const row of refusals) byReason.set(row.reason, (byReason.get(row.reason) || 0) + 1);
lines.push("REFUSALS");
lines.push(`reading notes refused: ${refusals.length} (B490 pass 1 had 4, pass 2 had 5)`);
if (!refusals.length) lines.push("none");
for (const [reason, count] of byReason) lines.push(`${reason}: ${count}`);
for (const row of refusals) {
  lines.push(`${row.key} ${row.reason}`);
  lines.push(row.rawReply || "(no raw reply)");
}
lines.push("");

function statusBlock(title, ungated) {
  const out = [title];
  const pending = cards.filter((card) => {
    const raw = completionRaw(card);
    return raw === "pending" || raw === "predates";
  });
  out.push(`cards with completion pending or predates: ${pending.length}`);
  if (!pending.length) out.push("none");
  for (const card of pending) {
    out.push(`${keyOf(card)} ${completionRaw(card)} ${labelUnder(card, ungated)}`);
    out.push(card.statement || "");
  }
  const loud = cards.filter((card) => humanLabel(card, ctx.labelByJoin) === "confirmed" && loudFromStatus(card, ungated));
  out.push(`labelled-correct statements loud from status alone: ${loud.length}`);
  if (!loud.length) out.push("none");
  for (const card of loud) out.push(`${keyOf(card)} ${labelUnder(card, ungated)} ${card.statement || ""}`);
  out.push("listed ids");
  for (const key of STATUS_IDS) {
    const card = cardOf(cards, ...key.split(":"));
    out.push(`${key} ${card ? labelUnder(card, ungated) : "missing"}`);
  }
  return out;
}

lines.push(...statusBlock("STATUS (i) current code", false));
lines.push("");
lines.push(...statusBlock("STATUS (ii) completion follows the field alone", true));
const addon = cards.find((card) => String(card.statement || "").includes(ADDON));
lines.push("");
lines.push("add-on acquisitions");
if (!addon) lines.push("missing");
else lines.push(`${keyOf(addon)} (i) ${labelUnder(addon, false)} (ii) ${labelUnder(addon, true)} completion ${completionRaw(addon) || "none"}`);
lines.push(addon?.statement || "");
lines.push(addon?.readingNote?.text || "");

const conflictsHeld = STATUS_IDS.every((key) => {
  const card = cardOf(cards, ...key.split(":"));
  if (!card) return true;
  if (labelUnder(card, false) !== "Conflicts with the source") return true;
  return labelUnder(card, true) === "Conflicts with the source";
});
const loudIi = cards.filter((card) => humanLabel(card, ctx.labelByJoin) === "confirmed" && loudFromStatus(card, true)).length;
lines.push("");
lines.push(`STATUS condition loud under (ii): ${loudIi}`);
lines.push(`STATUS condition listed Conflicts still Conflicts: ${conflictsHeld ? "yes" : "no"}`);

lines.push("");
lines.push("MEANING");
for (const key of MEANING_IDS) {
  const card = cardOf(cards, ...key.split(":"));
  lines.push(key);
  if (!card) {
    lines.push("missing");
    continue;
  }
  lines.push(`label: ${shownLabel(card) || ""}`);
  lines.push(`bucket: ${card.readingNote?.bucket || ""}`);
  lines.push(`note: ${card.readingNote?.text || ""}`);
}
const moved = [];
for (const card of cards) {
  if (humanLabel(card, ctx.labelByJoin) !== "confirmed") continue;
  const old = priorByKey.get(keyOf(card));
  if (old?.readingNote?.bucket !== "wording") continue;
  if (card.readingNote?.bucket !== "beyond") continue;
  moved.push(card);
}
lines.push(`labelled-correct statements moved from wording on B490 pass 1 to beyond: ${moved.length}`);
if (!moved.length) lines.push("none");
for (const card of moved) {
  lines.push(`${keyOf(card)} ${card.statement || ""}`);
  lines.push(card.readingNote?.text || "");
}
lines.push("");

const hedges = [];
for (const card of cards) {
  const concerns = [...(card.editorialConcerns || []), ...(card.complianceConcerns || [])];
  for (const concern of concerns) {
    if (!removesHedge(card.statement, concern.text)) continue;
    hedges.push(`${keyOf(card)} ${concern.concernCode || ""} ${concern.text || ""}`);
  }
}
lines.push("HEDGING");
lines.push(`proposed changes that remove believe, expect, or in our view from a sentence about returns, performance or outcomes: ${hedges.length}`);
if (!hedges.length) lines.push("none");
for (const row of hedges) lines.push(row);
lines.push("");

const changes = [];
for (const card of cards) {
  const old = priorByKey.get(keyOf(card));
  if (!old) continue;
  const before = shownLabel(old) || "";
  const after = shownLabel(card) || "";
  if (before !== after) changes.push({ key: keyOf(card), before, after, statement: card.statement || "" });
}
lines.push("shown label changes from B490 pass 1");
lines.push(String(changes.length));
if (!changes.length) lines.push("none");
for (const row of changes) lines.push(`${row.key}\t${row.before}\t${row.after}\t${row.statement}`);
lines.push("");

const gateFail = current.faultyRaised !== 13 || current.groupRaised !== 11 || current.empty.length || current.edges.length || current.counts.length;
lines.push(gateFail ? "GATES FAILED" : "GATES HELD");
writeFileSync(RESULT, `${lines.join("\n")}\n`);
const block = formatGate(current).join("\n");
console.log(block);
console.log(gateFail ? "GATES FAILED" : "GATES HELD");
console.log(`REFUSALS ${refusals.length}`);
console.log(`STATUS loud (i) ${cards.filter((card) => humanLabel(card, ctx.labelByJoin) === "confirmed" && loudFromStatus(card, false)).length} (ii) ${loudIi}`);
console.log(`HEDGING ${hedges.length}`);
console.log(`MEANING moved ${moved.length}`);
if (gateFail) process.exitCode = 2;
