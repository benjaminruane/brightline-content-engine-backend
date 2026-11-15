/**
 * B513 Part G. Replays the context rule and the reason rule on the cards
 * stored by B512. No model call.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shownTrace } from "../../../lib/qc/shown-verdict.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORED = join(HERE, "../b512/run.json");
const RESULT = join(HERE, "RESULT.md");

function reconstruct(card) {
  const role = card.sourceRole === "context" ? "context" : "facts";
  const branch = card.setBy?.branch || "";
  const wordingFacts = branch === "evidenceDisplay" && role === "facts" && card.noteBucket === "wording" && card.noteText;
  const classification = branch === "floorState" || wordingFacts ? "conflicting" : "not_found";
  const displayByState = {
    conflicts: "conflict",
    partial: "supported_partial",
    not_in_source: "not_supported",
  };
  const statementState = branch === "floorState"
    ? "note_withheld"
    : branch === "statementVerdict" || branch === "completionEffect" || branch === "uncheckedLook" || branch === "refusedReading"
      ? card.state
      : "nothing_raised";
  return {
    statement: card.statement,
    displayVerdict: branch === "evidenceDisplay" ? (displayByState[card.state] || "") : "",
    primaryRefTitle: card.sourceName || "",
    sourceName: card.sourceName || "",
    sourceQuote: card.quote || "",
    statementVerdict: { state: statementState },
    readingNote: {
      text: typeof card.noteText === "string" ? card.noteText : "",
      bucket: card.noteBucket || "none",
    },
    matchExplanations: card.sourceName
      ? [{
          sourceLabel: card.sourceName,
          role,
          classification,
          writtenFor: "candidate",
          explanation: wordingFacts || branch === "floorState" ? (card.noteText || "") : "",
        }]
      : [],
  };
}

function beforeReason(card) {
  const note = typeof card.noteText === "string" ? card.noteText.trim() : "";
  if (note) return note;
  return typeof card.quote === "string" ? card.quote.trim() : "";
}

function run() {
  const stored = JSON.parse(readFileSync(STORED, "utf8"));
  const fixtures = Array.isArray(stored.fixtures) ? stored.fixtures : [];
  const changes = [];
  const checks = [];
  for (const fixture of fixtures) {
    for (const card of fixture.raised || []) {
      const rebuilt = reconstruct(card);
      const traced = shownTrace(rebuilt);
      const reason = readerEvidenceSentence(rebuilt) || "";
      const before = beforeReason(card);
      const stateChanged = traced.state !== card.state;
      const reasonChanged = reason.trim() !== before;
      if (stateChanged || reasonChanged) {
        changes.push({
          textType: fixture.textType,
          statement: card.statement,
          beforeState: card.state,
          afterState: traced.state,
          beforeReason: before,
          afterReason: reason,
          setBy: traced.setBy,
        });
      }
      checks.push({ textType: fixture.textType, statement: card.statement, state: traced.state, reason, role: card.sourceRole, sourceName: card.sourceName });
    }
  }

  const q2 = checks.filter((row) => (
    row.textType === "FUND_REVALUATION"
    && row.sourceName === "35_kestrel_q2_2026_report.txt"
    && row.role === "context"
    && /renewed as planned|Harbourline Foods completed/.test(row.statement)
  ));
  const secondary = checks.find((row) => (
    row.textType === "NEW_SECONDARY_INVESTMENT"
    && /has agreed to acquire/.test(row.statement)
  ));
  const q2Ok = q2.length === 2 && q2.every((row) => row.state === "nothing_raised" || row.state === "note_withheld");
  const secondaryOk = Boolean(
    secondary
    && secondary.state === "conflicts"
    && /recommend|approval|status/i.test(secondary.reason)
    && !/restates|in other words|matches/i.test(secondary.reason)
  );

  const lines = [
    "# B513 replay",
    "",
    `Stored cards re-read: ${checks.length}. Cards whose state or reason changes: ${changes.length}.`,
    "",
    `Q2 context cards clear or amber: ${q2Ok ? "yes" : "no"} (${q2.map((row) => row.state).join(", ") || "none"}).`,
    `Secondary acquisition card stays conflicts with a status reason: ${secondaryOk ? "yes" : "no"}.`,
    "",
  ];
  for (const row of changes) {
    lines.push(`## ${row.textType}`);
    lines.push("");
    lines.push(row.statement);
    lines.push("");
    lines.push(`Before: ${row.beforeState}`);
    lines.push(row.beforeReason || "(no reason)");
    lines.push("");
    lines.push(`After: ${row.afterState}. setBy: ${JSON.stringify(row.setBy)}`);
    lines.push(row.afterReason || "(no reason)");
    lines.push("");
  }
  mkdirSync(HERE, { recursive: true });
  writeFileSync(RESULT, `${lines.join("\n")}\n`);
  if (!q2Ok || !secondaryOk) {
    console.error("replay did not match the expected cards");
    console.error(RESULT);
    process.exit(1);
  }
  console.log(`replay wrote ${changes.length} changes`);
  process.exit(0);
}

run();
