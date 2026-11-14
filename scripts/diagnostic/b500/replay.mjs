/**
 * B500. Replay the stored B490 passes after one combined state.
 * No model call.
 *
 *   node scripts/diagnostic/b500/replay.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessmentCountLines, combinedVerdict } from "../../../lib/qc/combined-verdict.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { shownState } from "../../../lib/qc/shown-verdict.mjs";
import { joinKey } from "../accuracy/lib.mjs";
import {
  afterOf,
  cardOf,
  corpusOnly,
  emptyReasonKeys,
  keyOf,
  loadCards,
  loadGateContext,
  raised,
} from "../b496/replay.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASSES = [
  ["pass 1", path.join(__dirname, "../b490/pass-1.json")],
  ["pass 2", path.join(__dirname, "../b490/pass-2.json")],
];
const RESULT = path.join(__dirname, "RESULT.md");
const FAULTY = new Set(["conflicting", "no_support"]);

function asLiveCard(card) {
  const refused = (card.silences || []).some((row) => row?.id === "note_refused");
  if (!refused || card?.readingNote?.refused === true) return card;
  return { ...card, readingNote: { ...(card.readingNote || {}), refused: true } };
}

function liveCombined(card) {
  const state = shownState(card);
  if (!state) throw new Error(`b500 replay: shown state is missing for ${keyOf(card)}`);
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
  const lines = assessmentCountLines(cards, liveCombined);
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

function changedCards(cards) {
  const rows = [];
  for (const card of cards) {
    const before = shownState(card) || "";
    const after = liveCombined(card);
    if (before === after.state) continue;
    rows.push(`${keyOf(card)} ${before || "(none)"} -> ${after.state} (${after.label}, ${after.tone})`);
  }
  return rows;
}

async function main() {
  const { labels, design, mapped } = await loadGateContext();
  const lines = ["# B500 replay", ""];
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
      const combined = liveCombined(card);
      return `${keyOf(card)} ${combined.label} edge ${combined.tone}`;
    });
    const counts = countMismatches(cards);
    const changes = changedCards(cards);
    const gateFail = faultyRaised !== 13 || groupRaised !== 11 || empty.length || edges.length || counts.length;
    if (gateFail) failed = true;
    const block = [
      name,
      `catch: ${faultyRaised}/${faultyN}`,
      `group A: ${groupRaised}/${design.faults.length}`,
      `raised cards with an empty reason: ${empty.length}`,
      `edge vs label mismatches: ${edges.length}`,
      `Assessment count vs card count mismatches: ${counts.length}`,
    ];
    if (empty.length) block.push(...empty.map((key) => `empty ${key} ${readerEvidenceSentence(cardOf(cards, ...key.split(":"))) || ""}`));
    if (edges.length) block.push(...edges);
    if (counts.length) block.push(...counts);
    block.push(`cards whose combined state is not the evidence state: ${changes.length}`);
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
