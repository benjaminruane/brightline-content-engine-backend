/**
 * B504. Replay the stored passes after the revision sentence and the tidy.
 * No model call.
 *
 *   node scripts/diagnostic/b504/replay.mjs
 *
 * Compares the shown reason with the reader committed before this change.
 * Label, tier, edge and the Assessment counts do not read that sentence.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assessmentCountLines, combinedVerdict } from "../../../lib/qc/combined-verdict.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { shownState, shownTier } from "../../../lib/qc/shown-verdict.mjs";
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
const ROOT = path.join(__dirname, "../../..");
const PASSES = [
  ["b490 pass 1", path.join(__dirname, "../b490/pass-1.json")],
  ["b490 pass 2", path.join(__dirname, "../b490/pass-2.json")],
  ["b503 pass 1", path.join(__dirname, "../b503/pass-1.json")],
];
const RESULT = path.join(__dirname, "RESULT.md");
const DELETED = path.join(__dirname, "deleted.json");
const FAULTY = new Set(["conflicting", "no_support"]);

function asLiveCard(card) {
  const refused = (card.silences || []).some((row) => row?.id === "note_refused");
  if (!refused || card?.readingNote?.refused === true) return card;
  return { ...card, readingNote: { ...(card.readingNote || {}), refused: true } };
}

function liveCombined(card) {
  const state = shownState(card);
  if (!state) throw new Error(`b504 replay: shown state is missing for ${keyOf(card)}`);
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

function shownView(card, reasonFor) {
  const combined = liveCombined(card);
  return {
    label: combined.label,
    tier: shownTier(shownState(card)),
    edge: combined.tone,
    reason: reasonFor(card),
    counts: assessmentCountLines([card], liveCombined).map((line) => line.text).join(" | "),
  };
}

async function beforeReason() {
  const source = execFileSync("git", ["show", "HEAD:lib/qc/reader-reason.mjs"], { cwd: ROOT });
  const dir = mkdtempSync(path.join(tmpdir(), "b504-before-"));
  const file = path.join(dir, "reader-reason.mjs");
  const text = source.toString("utf8").replaceAll('from "./', `from "${pathToFileURL(path.join(ROOT, "lib/qc/")).href}`);
  writeFileSync(file, text);
  const mod = await import(pathToFileURL(file).href);
  return {
    sentence: mod.readerEvidenceSentence,
    close() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function read06(cards) {
  const card = cardOf(cards, "06", 1);
  if (!card) return ["06:1 is missing from this pass"];
  const matches = Array.isArray(card.matchExplanations) ? card.matchExplanations : [];
  const lines = [
    "06:1 read (no behaviour change)",
    `statement: ${card.statement || ""}`,
    `shown label: ${liveCombined(card).label}`,
    `sentence state: ${shownState(card)}`,
    `reading note: ${card.readingNote?.text || ""}`,
    `bucket: ${card.readingNote?.bucket || ""}`,
    `evidence summary: ${card.evidenceSummary || ""}`,
    `displayed evidence prose: ${card.displayedEvidenceProse || ""}`,
    `source quote: ${card.sourceQuote || ""}`,
    `primary excerpt: ${card.primaryExcerpt || ""}`,
    `conflict excerpt: ${card.conflictExcerpt || ""}`,
    `source difference: ${card.sourceDifference || ""}`,
    `second value line: ${card.secondValueLine || ""}`,
    `display verdict: ${card.displayVerdict || ""}`,
    `support state: ${card.supportState || ""}`,
    `completion: ${card.completionEffect || card.completion || ""}`,
    `label rule: the shown label follows the reading-note bucket stored as sentence state (${shownState(card)}). The matcher display verdict is ${card.displayVerdict || "(none)"}.`,
  ];
  matches.forEach((row, index) => {
    lines.push(
      `match ${index}: classification ${row.classification || ""} writtenFor ${row.writtenFor || ""} label ${row.sourceLabel || ""} explanation ${row.explanation || ""}`
    );
  });
  return lines;
}

function deletedLines() {
  try {
    const doc = JSON.parse(readFileSync(DELETED, "utf8"));
    const lines = ["Deleted files"];
    for (const [repo, files] of Object.entries(doc)) {
      lines.push(`${repo}: ${files.length ? files.join(", ") : "(none)"}`);
    }
    return lines;
  } catch {
    return ["Deleted files", "deleted.json was not written"];
  }
}

async function main() {
  const prior = await beforeReason();
  const { labels, design, mapped } = await loadGateContext();
  const lines = ["# B504 replay", ""];
  let failed = false;
  let otherDiff = false;
  const blocks = [];
  const reasonChanges = [];

  try {
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
      const diffs = [];
      for (const card of cards) {
        const before = shownView(card, prior.sentence);
        const after = shownView(card, readerEvidenceSentence);
        const sameFace = before.label === after.label && before.tier === after.tier && before.edge === after.edge;
        if (!sameFace) {
          otherDiff = true;
          diffs.push(`${keyOf(card)} face ${before.label}/${before.tier}/${before.edge} -> ${after.label}/${after.tier}/${after.edge}`);
        }
        if (before.reason === after.reason) continue;
        if (before.reason === "" && after.reason !== "") {
          reasonChanges.push(`${name} ${keyOf(card)}: ${after.reason}`);
          diffs.push(`${keyOf(card)} reason was empty, now: ${after.reason}`);
          continue;
        }
        otherDiff = true;
        diffs.push(`${keyOf(card)} reason changed from "${before.reason}" to "${after.reason}"`);
      }
      const gateFail = faultyRaised !== 13 || groupRaised !== 11 || empty.length || edges.length || counts.length;
      if (gateFail || otherDiff) failed = true;
      const block = [
        name,
        `catch: ${faultyRaised}/${faultyN}`,
        `group A: ${groupRaised}/${design.faults.length}`,
        `raised cards with an empty reason: ${empty.length}`,
        `edge vs label mismatches: ${edges.length}`,
        `Assessment count vs card count mismatches: ${counts.length}`,
      ];
      if (empty.length) block.push(...empty.map((key) => `empty ${key}`));
      if (edges.length) block.push(...edges);
      if (counts.length) block.push(...counts);
      if (diffs.length) block.push(...diffs);
      blocks.push(block.join("\n"));
      lines.push(block.join("\n"), "");
      if (name === "b503 pass 1") {
        lines.push(...read06(cards), "");
      }
    }
  } finally {
    prior.close();
  }

  lines.push("Cards whose shown reason changed", ...(reasonChanges.length ? reasonChanges : ["none"]), "");
  lines.push(...deletedLines(), "");
  lines.push(otherDiff ? "OTHER DIFFERENCE: stop before committing" : "No other difference on shown label, tier, edge, reason, or Assessment counts.");
  lines.push(failed ? "GATES FAILED" : "GATES HELD");
  writeFileSync(RESULT, `${lines.join("\n")}\n`);
  process.stdout.write(`${blocks.join("\n\n")}\n${reasonChanges.length ? reasonChanges.join("\n") : "no reason changes"}\n${failed ? "GATES FAILED" : "GATES HELD"}\n`);
  if (otherDiff) process.exitCode = 2;
  else if (failed) process.exitCode = 1;
}

await main();
