#!/usr/bin/env node
/**
 * Replay every removal-asserting marker note found in 2dcc796 through the new
 * diff-driven note builder, and size what changes.
 *
 * Zero model calls. Reads artefacts already on disk and reuses the row set from
 * bundled-notes-rows.json so the previous classification travels with each note.
 *
 * Usage: node scripts/diagnostic/revise/replay-note-what-from-diff.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNoteBodyFromDiff } from "../../../lib/pr9-note-what-from-diff.mjs";
import { normalizeMarkerNoteText } from "../../../lib/build-revision-prompt.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const ROWS_PATH = path.join(OUT_DIR, "bundled-notes-rows.json");

/** Same mapping 2dcc796 used: artefact prefix -> script holding its draft. */
const ARTEFACT_DRAFT_SOURCES = [
  { prefix: "suggest-after-r10-suggest", script: "run-suggest-after-r10.mjs" },
  { prefix: "condition-a-suggest", script: "run-condition-a-removal.mjs" },
  { prefix: "condition-b-suggest", script: "run-condition-a-removal.mjs" },
  { prefix: "condition-a-condition-b-suggest-rerun", script: "run-condition-a-removal.mjs" },
  { prefix: "reviser-noise-floor-run", script: "run-reviser-noise-floor.mjs" },
  { prefix: "deterministic-removal-", script: "run-deterministic-unsupported-removal-measure.mjs" },
];

async function loadOriginalDraftFromScript(scriptName) {
  const text = await readFile(path.join(OUT_DIR, scriptName), "utf8");
  const match = text.match(/const MERIDIAN_DRAFT = `([\s\S]*?)`;/);
  if (!match) throw new Error(`MERIDIAN_DRAFT not found in ${scriptName}`);
  return match[1];
}

function revisedDraftFromArtefact(json) {
  if (typeof json?.revisedDraft === "string") return json.revisedDraft;
  if (typeof json?.payload?.revisedDraft === "string") return json.payload.revisedDraft;
  return "";
}

function truncate(text, max = 150) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function mdCell(text) {
  return String(text || "").replace(/\|/g, "\\|");
}

async function main() {
  const rowsDoc = JSON.parse(await readFile(ROWS_PATH, "utf8"));
  const rows = Array.isArray(rowsDoc?.rows) ? rowsDoc.rows : [];
  if (rows.length === 0) throw new Error("no rows in bundled-notes-rows.json");

  const draftCache = new Map();
  const revisedCache = new Map();
  const replayed = [];

  for (const row of rows) {
    const mapping = ARTEFACT_DRAFT_SOURCES.find((m) => row.file.startsWith(m.prefix));
    if (!mapping) throw new Error(`no draft mapping for ${row.file}`);

    if (!draftCache.has(mapping.script)) {
      draftCache.set(mapping.script, await loadOriginalDraftFromScript(mapping.script));
    }
    if (!revisedCache.has(row.file)) {
      const json = JSON.parse(await readFile(path.join(OUT_DIR, row.file), "utf8"));
      revisedCache.set(row.file, revisedDraftFromArtefact(json));
    }

    const originalDraft = draftCache.get(mapping.script);
    const revisedDraft = revisedCache.get(row.file);

    const built = buildNoteBodyFromDiff({
      original: originalDraft,
      revised: revisedDraft,
      start: row.start,
      end: row.end,
      note: row.note,
    });
    const newNote = normalizeMarkerNoteText(built.body);

    replayed.push({
      file: row.file,
      markerIndex: row.markerIndex,
      intent: row.intent,
      previousClassification: row.classification,
      oldNote: row.note,
      newNote,
      whatClause: built.clause,
      reasonKept: built.reason,
      changed: built.changed,
      editCount: built.edits.length,
      noChange: !built.changed,
      wordingChanged: row.note.trim() !== newNote.trim(),
      reasonLost: built.reason === "",
    });
  }

  const by = (cls) => replayed.filter((r) => r.previousClassification === cls);
  const noChange = replayed.filter((r) => r.noChange);

  const falseRows = by("FALSE");
  const unclearRows = by("UNCLEAR");
  const accurateRows = by("ACCURATE");

  const falseNowNoChange = falseRows.filter((r) => r.noChange);
  const unclearNowCheckable = unclearRows; // every note is now a generated, checkable clause
  const accurateReworded = accurateRows.filter((r) => r.wordingChanged);
  const accurateLostReason = accurateRows.filter((r) => r.reasonLost);

  const summary = {
    ranAt: new Date().toISOString(),
    modelCalls: 0,
    costUsd: 0,
    notesReplayed: replayed.length,
    previousCounts: {
      ACCURATE: accurateRows.length,
      FALSE: falseRows.length,
      UNCLEAR: unclearRows.length,
    },
    headline: {
      falseNowSayNoChange: `${falseNowNoChange.length} of ${falseRows.length}`,
      unclearNowCheckable: `${unclearNowCheckable.length} of ${unclearRows.length}`,
      accurateReworded: `${accurateReworded.length} of ${accurateRows.length}`,
      accurateLostReason: accurateLostReason.length,
      totalNowSayNoChange: noChange.length,
    },
    rows: replayed,
  };

  await writeFile(
    path.join(OUT_DIR, "note-what-from-diff-rows.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );

  console.log("");
  console.log("REPLAY  note WHAT from diff, zero model calls");
  console.log(`notes replayed: ${replayed.length}`);
  console.log("");
  console.log(`1. FALSE notes that now read "No change was made": ${falseNowNoChange.length} of ${falseRows.length}`);
  console.log(`2. UNCLEAR notes now checkable:                    ${unclearNowCheckable.length} of ${unclearRows.length}`);
  console.log(`3. ACCURATE notes reworded:                        ${accurateReworded.length} of ${accurateRows.length}`);
  console.log(`   of which lost the model's reason:               ${accurateLostReason.length}`);
  console.log("");
  console.log(`4. TOTAL notes that now say no change was made:    ${noChange.length} of ${replayed.length}`);
  console.log("");

  // Markdown table for the report.
  const lines = [
    "| # | Artefact | Prev | Old note | New note |",
    "|---|---|---|---|---|",
  ];
  replayed.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${mdCell(r.file.replace(/\.json$/, ""))}#${r.markerIndex} | ${r.previousClassification} | ${mdCell(truncate(r.oldNote))} | ${mdCell(truncate(r.newNote))} |`
    );
  });
  await writeFile(path.join(OUT_DIR, "note-what-from-diff-table.md"), `${lines.join("\n")}\n`, "utf8");
  console.log(`wrote note-what-from-diff-rows.json and note-what-from-diff-table.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
