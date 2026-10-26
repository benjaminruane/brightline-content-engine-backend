/**
 * B439 replay. No model calls.
 * Stored accuracy cards, plus the 210 partials with no finding sentence.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeExportVerdict } from "../../../lib/qc/evidence-display-verdict.mjs";
import { partialGroundFromCard } from "../../../lib/qc/worked-record.mjs";
import { readingState, shownLabel, shownState, shownTier } from "../../../lib/qc/shown-verdict.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS_DIR = path.join(__dirname, "../b437");
const READINGS = path.join(__dirname, "../b426/readings.json");

function loadPass(name) {
  const doc = JSON.parse(readFileSync(path.join(PASS_DIR, name), "utf8"));
  return Array.isArray(doc?.cards) ? doc.cards : [];
}

function clip(text, n = 110) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > n ? `${value.slice(0, n)}...` : value;
}

function project(card) {
  const state = shownState(card);
  const priorState = readingState(card);
  const label = shownLabel(card);
  const tier = state ? shownTier(state) : card.tier ?? null;
  const priorLabel = card.sentenceLabel ?? null;
  const priorTier = card.tier ?? null;
  const exportBefore = normalizeExportVerdict(card.displayVerdict, card);
  const exportAfter = label || exportBefore;
  return {
    state,
    priorState,
    label,
    tier,
    priorLabel,
    priorTier,
    labelMoved: label != null && label !== priorLabel,
    tierMoved: tier != null && tier !== priorTier,
    exportBefore,
    exportAfter,
    exportMoved: exportAfter !== exportBefore,
  };
}

function why(card, next) {
  const display = String(card.displayVerdict || "");
  if (next.priorLabel === "Nothing raised" && next.label === "Conflicts with the source" && /conflict/i.test(display)) {
    return "The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.";
  }
  if (next.priorLabel === "Nothing raised" && next.label === "Not in the source" && /not_supported|no_clear_support/i.test(display)) {
    return "The card already holds a not-supported verdict. The sentence was quiet, so the label now says it is not in the source.";
  }
  if (next.exportMoved && !next.labelMoved) {
    return `The card already holds sentence state ${next.priorState || "none"} and display verdict ${display}. The export now prints the card's label.`;
  }
  return "";
}

export function replayPasses() {
  return ["pass-1.json", "pass-2.json"].map((file) => {
    const cards = loadPass(file);
    const rows = cards.map((card, position) => {
      const next = project(card);
      const reason = why(card, next);
      return {
        position,
        fixtureId: card.fixtureId || "",
        index: card.index,
        statement: card.statement || "",
        displayVerdict: card.displayVerdict || "",
        ...next,
        reason,
        unexplained: (next.labelMoved || next.tierMoved) && !reason,
      };
    });
    const tiers = { demands: 0, light: 0, quiet: 0 };
    const after = { demands: 0, light: 0, quiet: 0 };
    for (const row of rows) {
      if (tiers[row.priorTier] != null) tiers[row.priorTier] += 1;
      if (after[row.tier] != null) after[row.tier] += 1;
    }
    return { file, count: rows.length, rows, tiers, after };
  });
}

function standIn(text) {
  return /specific commentary is unavailable/i.test(String(text || ""));
}

export function replayPartials() {
  const doc = JSON.parse(readFileSync(READINGS, "utf8"));
  const unique = Array.isArray(doc?.unique) ? doc.unique : [];
  const quiet = unique.filter((row) => row?.primary === "no_prose");
  const grounds = quiet.map((row) => {
    const ground = partialGroundFromCard({ evidenceSummary: row.summary });
    return {
      statement: row.statement || "",
      ground,
      standIn: ground?.recorded === true && standIn(ground.text),
      reasonOnCard: typeof row.displayVerdictReason === "string" ? row.displayVerdictReason.trim() : "",
    };
  });
  return {
    unique: unique.length,
    quiet: grounds.length,
    recorded: grounds.filter((row) => row.ground?.recorded === true && !row.standIn).length,
    standIn: grounds.filter((row) => row.standIn).length,
    absent: grounds.filter((row) => row.ground?.recorded === false).length,
    withReasonField: grounds.filter((row) => row.reasonOnCard).length,
    samples: grounds.filter((row) => row.ground?.recorded === true).slice(0, 8),
  };
}

function tierLine(bag) {
  return `demands ${bag.demands}, light ${bag.light}, quiet ${bag.quiet}`;
}

export function renderReplay(passes, partials) {
  const lines = [];
  lines.push("# B439 replay");
  lines.push("");
  lines.push("Stored cards from the accuracy run on build dab9268, passed through the display rules. No model call. USD 0.");
  lines.push("");
  lines.push("Detection is unchanged. Support state, concern codes, and concern text are not written by this replay. What can move is the sentence label, the tier that follows it, the header line, the summary word, and the export.");
  lines.push("");
  lines.push("Choice for a conflict labelled Nothing raised: the evidence verdict reaches the statement verdict that the screen stores, and only when that verdict would otherwise be quiet. The label does not read the display verdict instead of the statement verdict. The card edge, the evidence line, the tier, and the header already read the statement verdict. A label-only change would leave those saying nothing was raised. A beyond note, a missing fact, or a conflict note still wins, because those are already louder.");
  lines.push("");
  lines.push("## What moved");
  lines.push("");
  for (const pass of passes) {
    const labelMoves = pass.rows.filter((row) => row.labelMoved || row.tierMoved);
    const unexplained = labelMoves.filter((row) => row.unexplained);
    const conflictQuiet = labelMoves.filter((row) => row.label === "Conflicts with the source");
    const unsupported = labelMoves.filter((row) => row.label === "Not in the source");
    lines.push(`### ${pass.file}`);
    lines.push("");
    lines.push(`- Statements: ${pass.count}. Label or tier moves: ${labelMoves.length}. Unexplained: ${unexplained.length}.`);
    lines.push(`- Problem 1, conflict that was Nothing raised: ${conflictQuiet.length}. Each moves to Conflicts with the source, tier demands.`);
    lines.push(`- Problem 1, not-supported that was Nothing raised: ${unsupported.length}. Each moves to Not in the source, tier demands.`);
    lines.push(`- Tiers before: ${tierLine(pass.tiers)}.`);
    lines.push(`- Tiers after: ${tierLine(pass.after)}.`);
    lines.push("");
    for (const row of labelMoves) {
      lines.push(`- fixture ${row.fixtureId} index ${row.index}: "${clip(row.statement)}"`);
      lines.push(`  - label ${row.priorLabel} -> ${row.label}; tier ${row.priorTier} -> ${row.tier}; display ${row.displayVerdict}`);
      lines.push(`  - ${row.reason || "UNEXPLAINED"}`);
    }
    lines.push("");
    const beyond = pass.rows.filter((row) => row.priorState === "beyond").length;
    const quietKept = pass.rows.filter((row) => row.priorState === "nothing_raised" && !row.labelMoved).length;
    const exportOnly = pass.rows.filter((row) => row.exportMoved && !row.labelMoved);
    lines.push(`- Problem 3. ${beyond} statements already say Goes beyond the source. The summary used to count those as partial support. It now says goes beyond the source, and it does not add them to the partial count. ${quietKept} statements stay Nothing raised. The summary used to count those as confirmed and could say all claims are backed. It now says Nothing raised.`);
    lines.push(`- Problem 4. Export verdict text changes on ${pass.rows.filter((row) => row.exportMoved).length} statements. ${exportOnly.length} of those keep the same sentence label. The export prints that label, or the conflict label the card now shows, instead of a different display-verdict word.`);
    lines.push(`- Problem 2. The ${conflictQuiet.length} conflict moves are now sentence state conflicts. The header line names a conflict when that state is present, including when a missing fact would otherwise be the only sentence. Nothing is added unless a statement already holds the conflict.`);
    lines.push("");
  }
  lines.push("## The 210");
  lines.push("");
  lines.push(`The census file lists ${partials.unique} unique partial statements. ${partials.quiet} are the ones with no finding sentence.`);
  lines.push("");
  lines.push(`- Would now carry a ground from the stored summary: ${partials.recorded}.`);
  lines.push(`- Would record a ground that is only the unavailable-commentary sentence: ${partials.standIn}. That sentence is not a reason for the partial.`);
  lines.push(`- Would record that the ground was absent at the match explanation: ${partials.absent}.`);
  lines.push(`- Of those absent, ${partials.withReasonField} already carry a displayVerdictReason. Those values are short slugs, such as a check name, not a sentence that names what is backed and what is not. They are not the ground a later split would use.`);
  lines.push("");
  if (partials.recorded + partials.standIn === 0) {
    lines.push("None of the 210 have a summary the recording path can keep. The ground is not on these payloads. It would have to come from the match explanation, which was not stored.");
  } else if (partials.absent > partials.quiet / 2) {
    lines.push("Most of the 210 still have nothing. The recording path can only copy a summary that was stored, or say the explanation was absent. These payloads did not keep the match explanation. That is where a ground would have to come from. B432 cannot split these sentences until that explanation is on the card.");
  }
  if (partials.samples.length) {
    lines.push("");
    lines.push("Samples of a stored summary treated as a ground:");
    lines.push("");
    for (const row of partials.samples) {
      lines.push(`- ${clip(row.statement)}: ${clip(row.ground.text)}`);
    }
  }
  lines.push("");
  lines.push("Names. Goes beyond the source stays the name for a beyond sentence. Partially confirmed stays the name for an evidence partial, which is the badge the card already uses. B432 will change what a partial says on the card, and that summary sentence will have to change with it. Nothing raised stays Nothing raised, and is not renamed to confirmed or backed.");
  lines.push("");
  lines.push("## Files");
  lines.push("");
  lines.push("- lib/qc/shown-verdict.mjs");
  lines.push("- scripts/diagnostic/b439/replay.mjs");
  lines.push("- scripts/diagnostic/b439/REPLAY.md");
  lines.push("- tests/b439-shown-verdict.test.mjs");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const passes = replayPasses();
  const partials = replayPartials();
  const report = renderReplay(passes, partials).replace(/\u2013|\u2014/g, "-");
  if (/[\u2013\u2014]/.test(report)) throw new Error("replay report contains a dash that is not a hyphen");
  const unexplained = passes.reduce(
    (sum, pass) => sum + pass.rows.filter((row) => row.unexplained).length,
    0
  );
  writeFileSync(path.join(__dirname, "REPLAY.md"), report);
  if (unexplained) throw new Error(`${unexplained} unexplained moves`);
  const moves = passes.map((pass) => pass.rows.filter((row) => row.labelMoved).length).join(",");
  process.stdout.write(`label moves ${moves} absent partials ${partials.absent} of ${partials.quiet}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
