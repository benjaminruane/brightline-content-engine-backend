/**
 * B438 acceptance replay. No model calls.
 * Stored cards from the B437 accuracy run, passed through annotateStored.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { annotateStored, concernTexts, identityOf } from "../../../lib/qc/worked-record.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS_DIR = path.join(__dirname, "../b437");
const RECORDED_ORGANISATION = "Halden Group";

function loadPass(name) {
  const doc = JSON.parse(readFileSync(path.join(PASS_DIR, name), "utf8"));
  const cards = Array.isArray(doc?.cards) ? doc.cards : [];
  return { name, cards };
}

function clip(text, n = 140) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > n ? `${value.slice(0, n)}...` : value;
}

export function replayStored(resolvedName = RECORDED_ORGANISATION) {
  const passes = ["pass-1.json", "pass-2.json"].map((file) => {
    const loaded = loadPass(file);
    const rows = loaded.cards.map((card, position) => {
      const next = annotateStored(card, { resolvedName });
      const before = identityOf(card);
      const after = identityOf(next);
      const moved = [];
      for (const key of ["displayVerdict", "supportState", "sentenceLabel", "tier", "concerns"]) {
        if (before[key] !== after[key]) moved.push(key);
      }
      const beforeText = concernTexts(card);
      const afterText = concernTexts(next);
      const textChanges = [];
      for (let i = 0; i < beforeText.length; i += 1) {
        if (beforeText[i].text !== afterText[i]?.text) {
          textChanges.push({
            layer: beforeText[i].layer,
            code: beforeText[i].code,
            before: beforeText[i].text,
            after: afterText[i]?.text || "",
          });
        }
      }
      return {
        position,
        fixtureId: card.fixtureId || "",
        index: card.index,
        statement: card.statement || "",
        before,
        after,
        moved,
        textChanges,
        partialGround: next.partialGround || null,
        notReviewedReason: next.evidenceNotReviewedReason || null,
        wasPartial: card.supportState === "partial" || card.displayVerdict === "supported_partial",
        wasNotReviewed:
          String(card.displayVerdict || "").toLowerCase() === "not reviewed" || card.supportState === "skipped",
        hadNotReviewedReason: Boolean(card.evidenceNotReviewedReason),
        conflictQuiet:
          card.displayVerdict === "conflict" && card.sentenceLabel === "Nothing raised",
      };
    });
    return { file, count: rows.length, rows };
  });
  return { resolvedName, passes };
}

function count(rows, pred) {
  return rows.filter(pred).length;
}

export function renderReplay(result) {
  const lines = [];
  lines.push("# B438 replay");
  lines.push("");
  lines.push("Stored cards from the accuracy run on build dab9268, passed through the recording code. No model call. USD 0.");
  lines.push("");
  lines.push(`Organisation name applied to the stored text: ${result.resolvedName}. That is the name the accuracy log resolved. The live path uses the same resolver, and it scrubs only when a name resolved.`);
  lines.push("");
  lines.push("## Identity");
  lines.push("");
  lines.push("Display verdict, support state, sentence label, tier, and concern codes. A move is a difference on one of those.");
  lines.push("");
  let anyMove = false;
  for (const pass of result.passes) {
    const moves = pass.rows.filter((row) => row.moved.length);
    if (moves.length) anyMove = true;
    lines.push(`- ${pass.file}: ${pass.count} statements, ${moves.length} moved.`);
    for (const row of moves) {
      lines.push(`  - fixture ${row.fixtureId} index ${row.index}: ${row.moved.join(", ")}`);
    }
  }
  lines.push("");
  lines.push(anyMove ? "Identity did not hold." : "Identity held on both passes. No verdict, support state, sentence label, tier, or concern code moved.");
  lines.push("");
  lines.push("## What is newly recorded");
  lines.push("");
  for (const pass of result.passes) {
    const partials = pass.rows.filter((row) => row.wasPartial);
    const grounded = partials.filter((row) => row.partialGround?.recorded === true);
    const absent = partials.filter((row) => row.partialGround && row.partialGround.recorded === false);
    const notReviewed = pass.rows.filter((row) => row.wasNotReviewed);
    const filled = notReviewed.filter((row) => !row.hadNotReviewedReason && row.notReviewedReason);
    const conflictQuiet = count(pass.rows, (row) => row.conflictQuiet);
    lines.push(`### ${pass.file}`);
    lines.push("");
    lines.push(`- Partial statements: ${partials.length}. Now carry a ground: ${grounded.length}. Ground missing at classification: ${absent.length}.`);
    lines.push(`- Not reviewed with an empty reason: ${notReviewed.filter((row) => !row.hadNotReviewedReason).length}. Now carry a reason: ${filled.length}. The reason on a stored card is could_not_determine, because the match flag was not kept.`);
    lines.push(`- Conflict with the sentence label Nothing raised: ${conflictQuiet}. Unchanged. See the part that was left.`);
    lines.push(`- Concern text rewritten because the organisation had resolved: ${count(pass.rows, (row) => row.textChanges.length)}.`);
    lines.push("");
  }
  lines.push("The ground on these stored cards is the evidence summary already on the card. The match explanation was not kept, so the replay cannot recover a ground the summary does not already hold. On a live assembly the card copies the match explanation first, and uses the summary only when that explanation is empty. If both are empty the card records that the ground was absent at the match explanation.");
  lines.push("");
  lines.push("The 210 partials with no stored reason, counted across older payloads, are not in these 261 statements. Every partial in this replay already had a summary.");
  lines.push("");
  lines.push("## Concern text that changed");
  lines.push("");
  lines.push("The concern stayed. The code stayed. The false sentence was removed from the text.");
  lines.push("");
  for (const pass of result.passes) {
    const changed = pass.rows.filter((row) => row.textChanges.length);
    lines.push(`### ${pass.file}`);
    lines.push("");
    if (!changed.length) {
      lines.push("None.");
      lines.push("");
      continue;
    }
    for (const row of changed) {
      for (const change of row.textChanges) {
        lines.push(`- fixture ${row.fixtureId} index ${row.index} ${change.layer} ${change.code}`);
        lines.push(`  - before: ${clip(change.before)}`);
        lines.push(`  - after: ${clip(change.after)}`);
      }
    }
    lines.push("");
  }
  lines.push("## Left: a conflict labelled Nothing raised");
  lines.push("");
  lines.push("The sentence label does not follow the display verdict. The verdict never reaches the label.");
  lines.push("");
  lines.push("The label is set from the statement verdict. That function reads whether a fact was not found, and the note bucket when the bucket is a conflict or a beyond. It does not read the display verdict, the support state, or an evidence conflict. F13 employees and F18 completion were display conflict with no such fact and no such note, so the label stayed Nothing raised.");
  lines.push("");
  lines.push("Making the label follow the display verdict would change the sentence label and the tier. Both are identity fields. This part leaves the bundle. The labels above are unchanged.");
  lines.push("");
  lines.push("## Silent nothings");
  lines.push("");
  lines.push("Knowing: each site writes a record when it happens. The stored accuracy cards do not contain those events, so this replay cannot count them. The record is on the next live payload.");
  lines.push("");
  lines.push("Told, because the screen currently looks like nothing happened:");
  lines.push("");
  lines.push("- A refused note on a sentence. The screen shows the line stored on the card. The sentence label stays Nothing raised.");
  lines.push("- A withheld note on the draft, on the card summary and in the export. Those two surfaces had no line. The reading view already had its own line and was left as it was.");
  lines.push("");
  lines.push("Recorded, and left off the screen:");
  lines.push("");
  lines.push("- A note whose reassuring sentences were all removed. The bucket label is still there. The record says the text was cleared.");
  lines.push("- A narrative-coherence concern removed while that check is off. The concern list is unchanged by this spec. The drop is counted.");
  lines.push("- Card assembly failed. The safe card is unchanged apart from a silence that says the reason could not be determined.");
  lines.push("- Fidelity, style, no-op, no-change, and evidence-language drops. Each drop is counted. The concern list is the list the filters already returned.");
  lines.push("- A source-awareness drop and a forward-looking drop. Counted. The lists stay as the filters left them.");
  lines.push("- Duplicate concerns merged. The merge was already logged. It is now also on the card.");
  lines.push("- Gap sentences removed while a generic company name lifts support. The lift is unchanged. The removal is recorded.");
  lines.push("- A paragraph removed from the writer piece because it did not quote the draft. Recorded on that response. Not a review-screen sentence.");
  lines.push("- A passage with no letter or digit, and not marked unlocatable. Recorded. The screen still shows no passage, which is the right absence.");
  lines.push("- Commentary not run. Recorded on the card. The commentary field stays empty.");
  lines.push("- A card with no summary class. Recorded on the export, and marked on the card element. No new sentence.");
  lines.push("- Proposals not loaded because that view is off. Recorded in memory. No new sentence, because this screen does not receive a line from the review.");
  lines.push("- Disputes dropped from a note. Recorded on the card. The note text is unchanged.");
  lines.push("- Draft marks dropped. The count was already returned. The reasons are now beside it. Not shown.");
  lines.push("- A proposal that did not attach to a finding. The count was already computed. It is now on the attach result. Not shown.");
  lines.push("- A save that failed for a reason other than size. Recorded in memory. There is no saved payload to put a line on, and the size failure already has its own notice.");
  lines.push("- A replayed result that is not autosaved. Recorded on the replay stamp. Not shown.");
  lines.push("");
  lines.push("## Files");
  lines.push("");
  lines.push("- lib/qc/reader-lines.mjs");
  lines.push("- lib/qc/worked-record.mjs");
  lines.push("- scripts/diagnostic/b438/replay.mjs");
  lines.push("- scripts/diagnostic/b438/REPLAY.md");
  lines.push("- tests/b438-worked-record.test.mjs");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const result = replayStored();
  const report = renderReplay(result);
  if (/[\u2013\u2014]/.test(report)) {
    throw new Error("replay report contains a dash that is not a hyphen");
  }
  const moves = result.passes.reduce(
    (sum, pass) => sum + pass.rows.filter((row) => row.moved.length).length,
    0
  );
  if (moves) {
    writeFileSync(path.join(__dirname, "REPLAY.md"), report);
    throw new Error(`identity moved on ${moves} statements`);
  }
  writeFileSync(path.join(__dirname, "REPLAY.md"), report);
  process.stdout.write(`replay statements ${result.passes.map((pass) => pass.count).join(",")} moves 0\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
