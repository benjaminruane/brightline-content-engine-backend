/**
 * B432 replay. No model calls.
 *
 *   node scripts/diagnostic/b432/replay.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { partialSentence, PARTIAL_UNRECORDED } from "../../../lib/qc/partial-sentence.mjs";
import { shownLabel, shownState, shownTier } from "../../../lib/qc/shown-verdict.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../..");

function flat(text) {
  return String(text || "").replace(/\u2013|\u2014/g, "-");
}

function isPartial(card) {
  return card?.supportState === "partial" || card?.displayVerdict === "supported_partial";
}

async function load(rel) {
  const doc = JSON.parse(await readFile(path.join(ROOT, rel), "utf8"));
  return Array.isArray(doc.cards) ? doc.cards : [];
}

function baselineState(card) {
  const fromVerdict = card?.statementVerdict?.state;
  const stored = typeof fromVerdict === "string" && fromVerdict
    ? fromVerdict
    : (typeof card?.sentenceState === "string" ? card.sentenceState : "");
  if (stored !== "nothing_raised" && stored !== "nothing_to_raise") return stored;
  const display = String(card?.displayVerdict ?? "").toLowerCase().trim();
  if (display === "conflict" || display === "conflicts" || display === "conflicting") return "conflicts";
  if (display === "not_supported" || display === "no_clear_support") return "not_in_source";
  return stored;
}

const BASELINE_LABEL = {
  not_in_source: "Not in the source",
  conflicts: "Conflicts with the source",
  beyond: "Goes beyond the source",
  nothing_raised: "Nothing raised",
  nothing_to_raise: "Nothing to raise",
  note_withheld: "Needs a look",
};

function baselineTier(state) {
  if (state === "beyond") return "light";
  if (state === "nothing_raised" || state === "nothing_to_raise") return "quiet";
  if (state === "conflicts" || state === "not_in_source" || state === "note_withheld") return "demands";
  return null;
}

function replay(name, cards) {
  const tiersBefore = { demands: 0, light: 0, quiet: 0 };
  const tiersAfter = { demands: 0, light: 0, quiet: 0 };
  const moves = [];
  const partials = [];
  for (const card of cards) {
    const beforeState = baselineState(card);
    const beforeLabel = BASELINE_LABEL[beforeState] || card.sentenceLabel;
    const beforeTier = baselineTier(beforeState) || card.tier || "missing";
    if (tiersBefore[beforeTier] != null) tiersBefore[beforeTier] += 1;
    const state = shownState(card);
    const label = shownLabel(card) || card.sentenceLabel;
    const tier = shownTier(state) || beforeTier;
    if (tiersAfter[tier] != null) tiersAfter[tier] += 1;
    const labelMoved = label !== beforeLabel;
    const tierMoved = tier !== beforeTier;
    if (labelMoved || tierMoved) {
      if (!isPartial(card)) {
        throw new Error(`${name}: a non-partial moved (${card.fixtureId} ${beforeLabel} -> ${label})`);
      }
      moves.push({
        fixtureId: card.fixtureId,
        index: card.index,
        statement: card.statement,
        fromLabel: beforeLabel,
        toLabel: label,
        fromTier: beforeTier,
        toTier: tier,
      });
    }
    if (!isPartial(card)) continue;
    const said = state === "partial" ? partialSentence(card) : null;
    partials.push({
      fixtureId: card.fixtureId,
      index: card.index,
      statement: card.statement,
      keptLabel: state === "partial" ? null : label,
      said,
      invented: said != null && said !== PARTIAL_UNRECORDED && !(card.matchExplanations || []).some((row) => row.classification === "partially_confirmed") && card.partialGround?.source !== "stage2_explanation" && !(card.unsupportedSpans || []).length,
    });
  }
  return { name, cards: cards.length, tiersBefore, tiersAfter, moves, partials };
}

function render(rows) {
  const lines = [];
  lines.push("# B432 replay");
  lines.push("");
  lines.push("No model call. A quiet partial becomes Partly in the source, tier light. A louder label stays. The sentence is the matcher's explanation after three edits, or an honest line when that explanation was not stored.");
  lines.push("");
  lines.push("The label is Partly in the source. It sits with Not in the source and Goes beyond the source. It does not say confirmed, and it does not say Nothing raised. Tier is light: part of the sentence is in the source, so it is not a conflict, and it is not quiet.");
  lines.push("");
  lines.push("Edits, and only these: drop a trailing clause that only restates the class (making the statement partially confirmed, or making the support partial); delete the word explicitly when it follows not; do not show a sentence written for a confirmed match.");
  lines.push("");
  for (const row of rows) {
    lines.push(`## ${row.name}`);
    lines.push("");
    lines.push(`Statements: ${row.cards}. Partials: ${row.partials.length}. Label or tier moves: ${row.moves.length}.`);
    lines.push(`Tiers before: demands ${row.tiersBefore.demands}, light ${row.tiersBefore.light}, quiet ${row.tiersBefore.quiet}.`);
    lines.push(`Tiers after: demands ${row.tiersAfter.demands}, light ${row.tiersAfter.light}, quiet ${row.tiersAfter.quiet}.`);
    lines.push("");
    lines.push("Moves:");
    for (const move of row.moves) {
      lines.push(`- fixture ${move.fixtureId} index ${move.index}: ${move.fromLabel} -> ${move.toLabel}; ${move.fromTier} -> ${move.toTier}. ${flat(move.statement).slice(0, 160)}`);
    }
    if (!row.moves.length) lines.push("- none");
    lines.push("");
    lines.push("What each partial says:");
    let splits = 0;
    let absent = 0;
    for (const card of row.partials) {
      if (card.invented) throw new Error(`${row.name}: invented a split`);
      if (card.said == null) {
        lines.push(`- fixture ${card.fixtureId} index ${card.index}: label stays ${card.keptLabel}. ${flat(card.statement).slice(0, 140)}`);
        continue;
      }
      if (card.said === PARTIAL_UNRECORDED) absent += 1;
      else splits += 1;
      lines.push(`- fixture ${card.fixtureId} index ${card.index}: ${flat(card.said)}`);
    }
    lines.push("");
    lines.push(`Splits from a stored partial explanation: ${splits}. Honest absence, nothing invented: ${absent}.`);
    lines.push("");
  }
  return lines.join("\n").replace(/\u2013|\u2014/g, "-");
}

async function main() {
  const passes = [
    replay("b440/pass-1.json", await load("scripts/diagnostic/b440/pass-1.json")),
    replay("b437/pass-1.json", await load("scripts/diagnostic/b437/pass-1.json")),
    replay("b437/pass-2.json", await load("scripts/diagnostic/b437/pass-2.json")),
  ];
  const report = render(passes);
  await writeFile(path.join(__dirname, "REPLAY.md"), `${report}\n`);
  for (const row of passes) {
    console.log(row.name, "moves", row.moves.length, "partials", row.partials.length, "tiers", row.tiersBefore, "->", row.tiersAfter);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
