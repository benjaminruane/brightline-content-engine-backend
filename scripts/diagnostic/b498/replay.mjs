/**
 * B498. Replay the stored B490 passes after the card scale.
 * No model call.
 *
 *   node scripts/diagnostic/b498/replay.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { combinedVerdict } from "../../../lib/qc/combined-verdict.mjs";
import { isHouseStyleConcern } from "../../../lib/qc/house-style.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { summariseReview } from "../../../lib/qc/review-summary.mjs";
import { shownLabel, shownState, shownTier, SHOWN_LABELS } from "../../../lib/qc/shown-verdict.mjs";
import { joinKey } from "../accuracy/lib.mjs";
import {
  afterOf,
  cardOf,
  corpusOnly,
  emptyReasonKeys,
  keyOf,
  loadCards,
  loadGateContext,
  pad,
  raised,
} from "../b496/replay.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASSES = [
  ["pass 1", path.join(__dirname, "../b490/pass-1.json")],
  ["pass 2", path.join(__dirname, "../b490/pass-2.json")],
];
const RESULT = path.join(__dirname, "RESULT.md");
const OPTIONS = { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true };
const FAULTY = new Set(["conflicting", "no_support"]);

function countIn(line, pattern) {
  const match = String(line || "").match(pattern);
  return match ? Number(match[1]) : 0;
}

/** The stored passes keep a refusal as a silence. The live card also sets readingNote.refused. */
function asLiveCard(card) {
  const refused = (card.silences || []).some((row) => row?.id === "note_refused");
  if (!refused || card?.readingNote?.refused === true) return card;
  return { ...card, readingNote: { ...(card.readingNote || {}), refused: true } };
}

function craftEditorial(card) {
  const list = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
  return list.filter((concern) => !isHouseStyleConcern(concern));
}

function edgeTone(card) {
  const state = shownState(card) || "nothing_raised";
  return combinedVerdict({
    verdict: { state },
    editorialConcerns: craftEditorial(card),
    complianceVerdict: typeof card?.complianceVerdict === "string" ? card.complianceVerdict : null,
    complianceConcerns: Array.isArray(card?.complianceConcerns) ? card.complianceConcerns : [],
  }).tone;
}

/** Red labels need a red edge. Needs a look is amber. Goes beyond is amber unless a worse finding is red. */
function edgeAgrees(card) {
  const label = shownLabel(card) || "";
  const tone = edgeTone(card);
  if (label === "Conflicts with the source" || label === "Not in the source") return tone === "red";
  if (label === "Needs a look") return tone === "amber";
  if (label === "Goes beyond the source") return tone === "amber" || tone === "red";
  return true;
}

function byFixture(cards) {
  const by = new Map();
  for (const card of cards) {
    const id = pad(card.fixtureId);
    if (!by.has(id)) by.set(id, []);
    by.get(id).push(card);
  }
  return by;
}

function summaryDisagreements(cards, attentionHeader) {
  const bad = [];
  for (const [id, rows] of byFixture(cards)) {
    const line = attentionHeader(rows) || "";
    const summary = summariseReview(rows, OPTIONS);
    const evidence = summary.evidence || {};
    const conflicts = countIn(line, /(\d+) statements? conflict/);
    const looks = countIn(line, /(\d+) statements? needs? a look/);
    const light = countIn(line, /(\d+) worth a glance/);
    const problems = [];
    if ((evidence.conflicting || 0) !== conflicts) problems.push(`conflicts header ${conflicts} summary ${evidence.conflicting || 0}`);
    if ((evidence.needsLook || 0) !== looks) problems.push(`look header ${looks} summary ${evidence.needsLook || 0}`);
    if ((evidence.beyond || 0) !== light) problems.push(`beyond header ${light} summary ${evidence.beyond || 0}`);
    if (problems.length) bad.push(`${id} ${problems.join("; ")}`);
  }
  return bad;
}

function previousLabel(state) {
  if (state === "partial") return "Partly in the source";
  return SHOWN_LABELS[state] || "";
}

function previousTier(state) {
  if (state === "note_withheld") return "demands";
  return shownTier(state) || "";
}

function previousEdge(card, state) {
  if (state === "note_withheld") return "red";
  return edgeTone(card);
}

function changedCards(rawCards, liveCards) {
  const rows = [];
  for (let i = 0; i < liveCards.length; i += 1) {
    const before = rawCards[i];
    const after = liveCards[i];
    const beforeState = shownState(before) || "";
    const afterState = shownState(after) || "";
    const beforeLabel = previousLabel(beforeState);
    const afterLabel = shownLabel(after) || "";
    const beforeTierValue = previousTier(beforeState);
    const afterTier = shownTier(afterState) || "";
    const beforeEdge = previousEdge(before, beforeState);
    const afterEdge = edgeTone(after);
    if (beforeLabel === afterLabel && beforeTierValue === afterTier && beforeEdge === afterEdge) continue;
    rows.push([
      keyOf(after),
      `label: ${beforeLabel || "(none)"} -> ${afterLabel || "(none)"}`,
      `tier: ${beforeTierValue || "(none)"} -> ${afterTier || "(none)"}`,
      `edge: ${beforeEdge} -> ${afterEdge}`,
    ].join(" | "));
  }
  return rows;
}

async function main() {
  const { labels, design, mapped, attentionHeader } = await loadGateContext();
  const lines = ["# B498 replay", ""];
  let failed = false;
  const blocks = [];

  for (const [name, file] of PASSES) {
    const raw = loadCards(file);
    const cards = raw.map(asLiveCard);
    const corpusCards = corpusOnly(cards);
    const judged = corpusCards.map((card) => ({ card, after: afterOf(card) }));
    const afterByJoin = new Map(judged.map((row) => [joinKey(row.card.fixtureId, row.card.statement, row.card.occurrence), row]));
    let faultyN = 0;
    let faultyRaised = 0;
    for (const row of labels) {
      if (row.kind && row.kind !== "statement") continue;
      if (!FAULTY.has(row.label)) continue;
      faultyN += 1;
      const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
      const card = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
      if (card && raised(card)) faultyRaised += 1;
    }
    let groupRaised = 0;
    for (const fault of design.faults) {
      const mappedRow = mapped.mapping.find((item) => item.id === fault.id);
      const key = mappedRow?.keys?.[0] || null;
      const judgedRow = key ? afterByJoin.get(key) : null;
      const afterCard = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
      if (afterCard && raised(afterCard)) groupRaised += 1;
    }
    const empty = emptyReasonKeys(cards);
    const edges = cards.filter((card) => !edgeAgrees(card)).map((card) => {
      return `${keyOf(card)} ${shownLabel(card)} edge ${edgeTone(card)}`;
    });
    const headers = summaryDisagreements(cards, attentionHeader);
    const changes = changedCards(raw, cards);
    const gateFail = faultyRaised !== 13 || groupRaised !== 11 || empty.length || edges.length || headers.length;
    if (gateFail) failed = true;
    const block = [
      name,
      `catch: ${faultyRaised}/${faultyN}`,
      `group A: ${groupRaised}/${design.faults.length}`,
      `raised cards with an empty reason: ${empty.length}`,
      `edge disagrees with the shown label: ${edges.length}`,
      `header vs summary disagreements: ${headers.length}`,
    ];
    if (empty.length) block.push(...empty.map((key) => `empty ${key} ${readerEvidenceSentence(cardOf(cards, ...key.split(":"))) || ""}`));
    if (edges.length) block.push(...edges);
    if (headers.length) block.push(...headers);
    block.push(`cards whose label, tier, or edge changed: ${changes.length}`);
    block.push(...(changes.length ? changes : ["none"]));
    blocks.push(block.join("\n"));
    lines.push(block.join("\n"), "");
  }

  lines.push(failed ? "GATES FAILED" : "GATES HELD");
  writeFileSync(RESULT, `${lines.join("\n")}\n`);
  process.stdout.write(`${blocks.join("\n\n")}\n${failed ? "GATES FAILED" : "GATES HELD"}\n`);
  if (failed) process.exitCode = 1;
}

await main();
