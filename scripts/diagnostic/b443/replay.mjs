/**
 * B443. Replay the stored B441 cards. No model calls.
 * The writer record is not applied to the card. Identity is the proof.
 *
 *   node scripts/diagnostic/b443/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { passStoredCard } from "../../../lib/qc/reading-review.mjs";
import { identityOf } from "../../../lib/qc/worked-record.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b441/pass-1.json");

const KEYS = ["displayVerdict", "supportState", "sentenceLabel", "tier", "concerns"];

function replay() {
  const doc = JSON.parse(readFileSync(PASS, "utf8"));
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  const moved = [];
  for (const card of cards) {
    const before = identityOf(card);
    const after = identityOf(passStoredCard(card).card);
    const diff = KEYS.filter((key) => before[key] !== after[key]);
    if (diff.length) {
      moved.push({ fixtureId: card.fixtureId, index: card.index, diff });
    }
  }
  return { cards: cards.length, moved };
}

function render(result) {
  const lines = [];
  lines.push("# B443 replay");
  lines.push("");
  lines.push("Stored cards from `scripts/diagnostic/b441/pass-1.json`, passed through `passStoredCard`. No model call.");
  lines.push("");
  lines.push(`Statements: ${result.cards}. Moved: ${result.moved.length}.`);
  lines.push("");
  if (result.moved.length === 0) {
    lines.push("Every statement is identical on display verdict, support state, sentence label, tier, and concern codes.");
  } else {
    for (const row of result.moved) {
      lines.push(`- fixture ${row.fixtureId} index ${row.index}: ${row.diff.join(", ")}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

const result = replay();
const text = render(result);
writeFileSync(path.join(__dirname, "REPLAY.md"), `${text}\n`);
process.stdout.write(text);
if (result.moved.length) process.exit(1);
