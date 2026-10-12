#!/usr/bin/env node
/**
 * B385. Assemble the current-route cards for the four doctored drafts.
 * Read-only. No model calls. Does not write into tests/fixtures/.
 *
 *   node scripts/diagnostic/b385/score-current-route.mjs
 *
 * The script does not decide whether a comment names the fault.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const LABELS_PATH = path.join(__dirname, "labels.json");

const EXPECTED = {
  "3i-hy25-doctored": { entries: 6, substitutions: 6 },
  "hicl-interim-doctored": { entries: 8, substitutions: 13 },
  "gpi-press-release-doctored": { entries: 5, substitutions: 10 },
  "clearpoint-q1-2026-doctored": { entries: 7, substitutions: 8 },
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function countSubstitutions(entries) {
  return entries.reduce((sum, entry) => sum + (Array.isArray(entry.substitutions) ? entry.substitutions.length : 0), 0);
}

function excerptEmpty(value) {
  return value == null || value === "";
}

async function main() {
  const labels = JSON.parse(await readFile(LABELS_PATH, "utf8"));
  const runs = Array.isArray(labels.runs) ? labels.runs : null;
  if (!runs) fail("labels.json has no runs array");

  const seen = new Set();
  let totalEntries = 0;
  let totalSubs = 0;
  for (const run of runs) {
    const expected = EXPECTED[run.runId];
    if (!expected) fail(`unexpected runId ${run.runId}`);
    seen.add(run.runId);
    const entries = Array.isArray(run.entries) ? run.entries : [];
    const subs = countSubstitutions(entries);
    if (entries.length !== expected.entries || subs !== expected.substitutions) {
      fail(
        `${run.runId} count mismatch: entries ${entries.length} (expected ${expected.entries}), substitutions ${subs} (expected ${expected.substitutions})`
      );
    }
    totalEntries += entries.length;
    totalSubs += subs;
  }
  for (const runId of Object.keys(EXPECTED)) {
    if (!seen.has(runId)) fail(`missing run ${runId}`);
  }
  if (totalEntries !== 26 || totalSubs !== 37) {
    fail(`TOTAL count mismatch: entries ${totalEntries} substitutions ${totalSubs}`);
  }

  console.log(`COUNTS entries=${totalEntries} substitutions=${totalSubs}`);
  for (const run of runs) {
    const payloadPath = path.join(ROOT, run.reviewPath);
    let payload;
    try {
      payload = JSON.parse(await readFile(payloadPath, "utf8"));
    } catch (err) {
      fail(`${run.runId} missing payload ${run.reviewPath}: ${err.message}`);
    }
    const statements = Array.isArray(payload.statements) ? payload.statements : null;
    if (!statements) fail(`${run.runId} payload has no statements array`);
    if (statements.length !== run.statements) {
      fail(`${run.runId} statement count ${statements.length} does not match labels ${run.statements}`);
    }
    const byIndex = new Map();
    for (const row of statements) {
      const card = row?.qcCard;
      if (!card || !Number.isInteger(card.index)) {
        fail(`${run.runId} statement is missing qcCard.index`);
      }
      if (byIndex.has(card.index)) fail(`${run.runId} duplicate card index ${card.index}`);
      byIndex.set(card.index, card);
    }

    console.log(`RUN ${run.runId} statements=${statements.length} sourceLabel=${run.sourceLabel}`);
    for (const entry of run.entries) {
      const card = byIndex.get(entry.statementIndex);
      if (!card) fail(`${run.runId} statementIndex ${entry.statementIndex} has no card`);
      for (const key of ["displayVerdict", "supportState", "hasConflict", "evidenceSummary", "unsupportedSpans", "conflictValues", "primaryExcerptText"]) {
        if (!Object.prototype.hasOwnProperty.call(card, key)) {
          fail(`${run.runId} statementIndex ${entry.statementIndex} card is missing ${key}`);
        }
      }
      if (typeof card.evidenceSummary !== "string") {
        fail(`${run.runId} statementIndex ${entry.statementIndex} evidenceSummary is not a string`);
      }
      console.log(`ENTRY ${run.runId} statementIndex=${entry.statementIndex}`);
      console.log(`entry: ${entry.entry}`);
      for (const sub of entry.substitutions) {
        console.log(`substitution ${sub.id} was=${JSON.stringify(sub.was)} written=${JSON.stringify(sub.written)}`);
      }
      console.log(`displayVerdict=${card.displayVerdict}`);
      console.log(`supportState=${card.supportState}`);
      console.log(`hasConflict=${card.hasConflict}`);
      console.log(`primaryExcerptTextEmpty=${excerptEmpty(card.primaryExcerptText)}`);
      console.log(`unsupportedSpans=${JSON.stringify(card.unsupportedSpans)}`);
      console.log(`conflictValues=${JSON.stringify(card.conflictValues)}`);
      console.log("EVIDENCE");
      console.log(card.evidenceSummary);
      console.log("END EVIDENCE");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
