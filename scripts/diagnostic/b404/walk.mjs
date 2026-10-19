/**
 * B404 walkthrough. One live reading attachment on the HICL clean draft.
 * Prints the estimate, then calls the same attachReadingView the pipeline uses.
 *
 *   node scripts/diagnostic/b404/walk.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b404/runs/reading.json");
const SOURCE = "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt";
const CLEAN = "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json";

const { READING_NOTE_PROMPT, WRITER_FEEDBACK_PROMPT } = await import("../../../lib/qc/reading-contract.mjs");
const { attachReadingView } = await import("../../../lib/qc/reading-review.mjs");

const sourceText = readFileSync(path.join(ROOT, SOURCE), "utf8");
const review = JSON.parse(readFileSync(path.join(ROOT, CLEAN), "utf8"));
const cards = review.statements.map((row) => {
  const text = row?.text || row?.qcCard?.statement || "";
  if (!text.trim()) throw new Error("HICL clean statement is empty");
  const card = row.qcCard && typeof row.qcCard === "object" ? { ...row.qcCard } : { displayVerdict: null, factualBadge: null };
  card.statement = text;
  delete card.readingFacts;
  delete card.readingNote;
  delete card.wordingLine;
  delete card.sentenceState;
  delete card.sentenceLabel;
  delete card.tier;
  return card;
});

const inputChars = cards.reduce((sum, card) => {
  return sum + READING_NOTE_PROMPT.length + sourceText.length + card.statement.length + 400;
}, WRITER_FEEDBACK_PROMPT.length + cards.map((card) => card.statement).join("\n").length);
const calls = cards.length + 1;
const inputTokens = Math.ceil(inputChars / 4);
const estimate = (inputTokens / 1_000_000) * 5 + ((calls * 300) / 1_000_000) * 25;
console.log(`B404 estimate: ${calls} calls, ${inputTokens} input tokens at chars/4, output ceiling 300, USD ${estimate.toFixed(4)} list. Model claude-opus-4-7. No cache assumed.`);
if (estimate > 3) {
  console.log("Estimate is above USD 3. Not run.");
  process.exit(0);
}

const before = cards.map((card) => ({
  displayVerdict: card.displayVerdict ?? null,
  factualBadge: card.factualBadge ?? null,
}));
const attached = await attachReadingView({
  cards,
  sources: [{ text: sourceText, label: "HICL interim" }],
});
mkdirSync(path.dirname(OUT), { recursive: true });
const payload = {
  source: SOURCE,
  draft: CLEAN,
  header: attached.reading.header,
  writerFeedback: attached.reading.writerFeedback,
  writerFeedbackStatus: attached.reading.writerFeedbackStatus,
  spend: attached.reading.spend,
  model: attached.reading.model,
  sentences: attached.reading.sentences,
};
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
attached.cards.forEach((card, index) => {
  const verdict = card.displayVerdict ?? null;
  const badge = card.factualBadge ?? null;
  if (verdict !== before[index].displayVerdict || badge !== before[index].factualBadge) {
    throw new Error(`S${index} changed an existing card field`);
  }
});
console.log(attached.reading.header.numbers);
console.log(attached.reading.header.line);
console.log(`USD ${attached.reading.spend.costUsd.toFixed(6)} calls ${attached.reading.spend.calls}`);
for (const row of attached.reading.sentences) {
  const facts = (row.facts || []).map((fact) => `${fact.kind}:${fact.surface}:${fact.status}`).join(", ");
  console.log(`S${row.index} ${row.tier} ${row.sentenceLabel} ${facts}`);
}
