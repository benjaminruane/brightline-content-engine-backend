/**
 * B516. Replay the quiet rule on the stored B514 cards and the labelled B503 cards.
 * No model call.
 *
 *   node scripts/diagnostic/b516/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { shownTrace } from "../../../lib/qc/shown-verdict.mjs";
import { entriesFromCard, statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { joinKey, padFixtureId } from "../accuracy/lib.mjs";
import { loadGateContext } from "../b496/replay.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const B514 = path.join(HERE, "../b514/run.json");
const B503 = path.join(HERE, "../b503/pass-1.json");
const RESULT = path.join(HERE, "RESULT.md");
const MATCH_EMPTY = "This check did not run, because the match came back empty.";
const RESULT_EMPTY = "This check did not run, because the result came back empty.";
const QUIET = new Set(["nothing_raised", "nothing_to_raise", ""]);
const FAULTY = new Set(["conflicting", "no_support"]);

function line(text) {
  return String(text || "").replace(/[\u2013\u2014]/g, "-");
}

function raised(state) {
  return !QUIET.has(state);
}

function reconstruct(card) {
  const reason = typeof card.reason === "string" ? card.reason : "";
  const matchEmpty = reason === MATCH_EMPTY;
  const resultEmpty = reason === RESULT_EMPTY;
  const incomplete = matchEmpty || resultEmpty;
  const bucket = typeof card.noteBucket === "string" ? card.noteBucket : "";
  return {
    statement: card.statement,
    displayVerdict: incomplete ? "not reviewed" : "",
    supportState: incomplete ? "skipped" : "",
    evidenceNotReviewedReason: matchEmpty ? "empty_confirmation_refused" : "",
    statementVerdict: { state: incomplete ? "nothing_raised" : (card.state || "") },
    sentenceState: incomplete ? "nothing_raised" : (card.state || ""),
    readingNote: bucket ? { bucket, text: "", refused: false } : null,
    readingFacts: [],
  };
}

function replayStored() {
  const stored = JSON.parse(readFileSync(B514, "utf8"));
  const changes = [];
  let raisedCount = 0;
  for (const draft of stored.drafts || []) {
    for (const card of draft.raised || []) {
      raisedCount += 1;
      const rebuilt = reconstruct(card);
      const traced = shownTrace(rebuilt);
      const reason = readerEvidenceSentence(rebuilt) || "";
      const empty = card.reason === MATCH_EMPTY || card.reason === RESULT_EMPTY;
      const stateChanged = traced.state !== card.state;
      const reasonChanged = empty && reason.trim() !== String(card.reason || "").trim();
      if (!stateChanged && !reasonChanged) continue;
      changes.push({
        textType: draft.textType,
        statement: card.statement,
        beforeState: card.state,
        afterState: traced.state,
        beforeReason: card.reason || "",
        afterReason: reason,
        branch: traced.setBy?.branch || "",
        noteBucket: card.noteBucket || "",
      });
    }
  }
  return { raisedCount, changes };
}

export async function replayLabelled() {
  const doc = JSON.parse(readFileSync(B503, "utf8"));
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  if (!cards.length) throw new Error("b516 replay: B503 cards are missing");
  const ctx = await loadGateContext();
  const groupKeys = new Set();
  for (const fault of ctx.design.faults || []) {
    const mapped = ctx.mapped.mapping.find((item) => item.id === fault.id);
    if (mapped?.keys?.[0]) groupKeys.add(mapped.keys[0]);
  }
  const lost = [];
  let errored = 0;
  for (const card of cards) {
    const before = card.sentenceState || card.statementVerdict?.state || "";
    let traced;
    try {
      const facts = Array.isArray(card.readingFacts) ? card.readingFacts : [];
      const verdict = statementVerdict({
        facts,
        note: card.readingNote ?? null,
        entries: entriesFromCard(card),
        statement: card.statement,
      });
      traced = shownTrace({ ...card, readingFacts: facts, statementVerdict: verdict });
    } catch (error) {
      errored += 1;
      lost.push({ statement: card.statement, error: error.message });
      continue;
    }
    if (!raised(before) || raised(traced.state)) continue;
    const key = joinKey(card.fixtureId, card.statement, card.occurrence);
    const label = ctx.labelByJoin.get(key) || "";
    const trueProblem = FAULTY.has(label) || groupKeys.has(key);
    if (!trueProblem) continue;
    lost.push({
      fixtureId: padFixtureId(card.fixtureId),
      index: card.index,
      statement: card.statement,
      before,
      after: traced.state,
      label,
      noteBucket: card.readingNote?.bucket || "",
    });
  }
  return { cards: cards.length, lost, errored, gate: lost.length === 0 && errored === 0 ? "pass" : "fail" };
}

function render(stored, labelled) {
  const lines = [
    "# B516 replay",
    "",
    "No model call. Spend USD 0.",
    "",
    `B514 raised cards read: ${stored.raisedCount}. Cards whose state or reason changes: ${stored.changes.length}.`,
    `Empty-check cards now nothing raised: ${stored.changes.filter((row) => row.afterState === "nothing_raised" && (row.beforeReason === MATCH_EMPTY || row.beforeReason === RESULT_EMPTY)).length}.`,
    "",
    "## B514 cards that change",
    "",
  ];
  if (!stored.changes.length) lines.push("None.");
  for (const row of stored.changes) {
    lines.push(`## ${row.textType}`);
    lines.push("");
    lines.push(line(row.statement));
    lines.push("");
    lines.push(`Before: ${row.beforeState}`);
    lines.push(line(row.beforeReason) || "(no reason)");
    lines.push(`After: ${row.afterState} (${row.branch}) bucket ${row.noteBucket || "(none)"}`);
    lines.push(line(row.afterReason) || "(no reason)");
    lines.push("");
  }
  lines.push("## B503 labelled true problems");
  lines.push("");
  lines.push(`Cards read: ${labelled.cards}. Errors: ${labelled.errored}.`);
  lines.push(`Labelled true problems that stop being raised: ${labelled.lost.length}.`);
  lines.push(`Gate: ${labelled.gate}.`);
  lines.push("");
  if (!labelled.lost.length) lines.push("None.");
  for (const row of labelled.lost) {
    if (row.error) {
      lines.push(`- error: ${line(row.error)}`);
      continue;
    }
    lines.push(`- ${row.fixtureId} #${row.index} ${row.before} -> ${row.after} label ${row.label} bucket ${row.noteBucket || "(none)"}`);
    lines.push(`  ${line(row.statement)}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const stored = replayStored();
const labelled = await replayLabelled();
writeFileSync(RESULT, render(stored, labelled));
console.log(`B514 changes ${stored.changes.length}. B503 lost ${labelled.lost.length}. Gate ${labelled.gate}.`);
if (labelled.gate !== "pass") process.exitCode = 1;
