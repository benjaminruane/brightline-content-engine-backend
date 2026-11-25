/**
 * B595. Replay saved preview runs through the final-stage colour and reason
 * rules. Read-only against the diagnostic inputs; writes after.csv.
 * No model call.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BE = path.resolve(HERE, "../../..");
const DIAG = path.join(process.env.HOME || "", "ce-diagnostics/b595-diag");
const INPUTS = path.join(DIAG, "inputs");
const OUT = path.join(DIAG, "after.csv");

const { shownLabel, shownTrace, SHOWN_LABELS } = await import(
  pathToFileURL(path.join(BE, "lib/qc/shown-verdict.mjs")).href
);
const { finaliseShownReason } = await import(
  pathToFileURL(path.join(BE, "lib/qc/b595-card-rules.mjs")).href
);

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function loadRuns() {
  const bundled = JSON.parse(readFileSync(path.join(INPUTS, "ce-test-runs-2026-11-25.json"), "utf8"));
  const runs = { ...bundled };
  for (const file of ["ce-run-R10-harbourline.json", "ce-run-R11-ostara.json"]) {
    const body = JSON.parse(readFileSync(path.join(INPUTS, file), "utf8"));
    const name = file.includes("R10") ? "R10-harbourline" : "R11-ostara";
    runs[name] = body;
  }
  return runs;
}

function asCard(statement, draftSentences) {
  const qc = statement?.qcCard && typeof statement.qcCard === "object" ? statement.qcCard : {};
  const statementText = typeof statement?.text === "string" ? statement.text : (qc.statement || "");
  return {
    ...qc,
    statement: statementText,
    draftSentences,
    displayVerdict: qc.displayVerdict || statement?.displayVerdict,
    supportState: qc.supportState || statement?.supportState,
    readingNote: qc.readingNote || statement?.readingNote || null,
    matchExplanations: qc.matchExplanations || statement?.matchExplanations || [],
    readingFacts: qc.readingFacts || statement?.readingFacts || [],
    statementVerdict: qc.statementVerdict || statement?.statementVerdict,
    setBy: qc.setBy || qc.statementVerdict?.setBy || statement?.setBy,
    combinedVerdict: qc.combinedVerdict || statement?.combinedVerdict,
    sentenceState: qc.sentenceState || qc.statementVerdict?.state || statement?.sentenceState,
    sentenceLabel: qc.sentenceLabel || statement?.sentenceLabel,
    evidenceSummary: qc.evidenceSummary,
    displayedEvidenceProse: qc.displayedEvidenceProse,
    evidenceLine: qc.evidenceLine,
    shownReason: qc.shownReason,
    classificationRewrites: qc.classificationRewrites,
    unmatchedElements: qc.unmatchedElements,
    stage2SourceFingerprints: qc.stage2SourceFingerprints,
    primaryExcerpt: qc.primaryExcerpt,
    primaryExcerptText: qc.primaryExcerptText,
  };
}

function labelBefore(card) {
  return clean(card.sentenceLabel)
    || clean(SHOWN_LABELS[card.sentenceState])
    || clean(SHOWN_LABELS[card.statementVerdict?.state])
    || clean(card.combinedVerdict?.label)
    || "";
}

function reasonBefore(card) {
  return clean(card.shownReason)
    || clean(card.evidenceSummary)
    || clean(card.displayedEvidenceProse)
    || clean(card.evidenceLine)
    || clean(card.readingNote?.text)
    || "";
}

function expectedGreen(run, index) {
  const key = `${run} S${index + 1}`;
  return new Set(["R12-aldermoor-generated S2", "R16-clearpoint-traps S3", "R17-lumio-clean S1", "R17-lumio-clean S2"]).has(key);
}

const EXPECTED_LABEL_CHANGES = new Set([
  "R12-aldermoor-generated S2",
  "R16-clearpoint-traps S3",
  "R17-lumio-clean S1",
  "R17-lumio-clean S2",
]);

const runs = loadRuns();
const rows = [];
const changes = [];
const unexpected = [];

for (const [runName, body] of Object.entries(runs)) {
  const statements = Array.isArray(body?.statements) ? body.statements : [];
  const draftSentences = statements.map((row) => {
    const qc = row?.qcCard || {};
    return typeof row?.text === "string" ? row.text : (qc.statement || "");
  });
  statements.forEach((statement, index) => {
    const card = asCard(statement, draftSentences);
    const beforeLabel = labelBefore(card);
    const beforeReason = reasonBefore(card);
    const traced = shownTrace(card);
    const afterLabel = SHOWN_LABELS[traced.state] || shownLabel({ ...card, statementVerdict: { ...(card.statementVerdict || {}), state: traced.state, setBy: traced.setBy } }) || traced.state;
    const face = finaliseShownReason({ ...card, statementVerdict: { ...(card.statementVerdict || {}), state: traced.state, setBy: traced.setBy } }, traced.state, beforeReason);
    const afterReason = face.shownReason;
    const sid = `S${index + 1}`;
    const key = `${runName} ${sid}`;
    const labelChanged = beforeLabel !== afterLabel;
    const reasonChanged = clean(beforeReason) !== clean(afterReason);
    rows.push({
      run: runName,
      s: sid,
      sentence: clean(card.statement).slice(0, 80),
      label_before: beforeLabel,
      label_after: afterLabel,
      reason_before: beforeReason,
      reason_after: afterReason,
      branch_after: traced.branch || "",
      label_changed: labelChanged ? "yes" : "no",
      reason_changed: reasonChanged ? "yes" : "no",
    });
    if (labelChanged || reasonChanged) {
      changes.push({ key, beforeLabel, afterLabel, beforeReason, afterReason, branch: traced.branch });
    }
    if (labelChanged) {
      const wentGreen = afterLabel === "Nothing raised" || afterLabel === "Nothing to raise";
      if (EXPECTED_LABEL_CHANGES.has(key)) {
        if (!wentGreen) unexpected.push(`${key}: expected green, got ${afterLabel}`);
      } else {
        unexpected.push(`${key}: unexpected label change ${beforeLabel} → ${afterLabel}`);
      }
    } else if (EXPECTED_LABEL_CHANGES.has(key)) {
      unexpected.push(`${key}: expected label change to green, stayed ${beforeLabel}`);
    }
    void expectedGreen;
  });
}

mkdirSync(DIAG, { recursive: true });
const header = [
  "run", "s", "sentence80", "label_before", "label_after", "reason_before", "reason_after",
  "branch_after", "label_changed", "reason_changed",
];
const lines = [header.join(",")];
for (const row of rows) {
  lines.push(header.map((key) => csvEscape(row[key])).join(","));
}
writeFileSync(OUT, `${lines.join("\n")}\n`, "utf8");

console.log(`Wrote ${OUT} (${rows.length} cards).`);
console.log("Cards whose label or reason changed:");
if (!changes.length) console.log("  (none)");
for (const row of changes) {
  console.log(`- ${row.key}`);
  console.log(`    label: ${row.beforeLabel} → ${row.afterLabel} (${row.branch})`);
  console.log(`    reason before: ${clean(row.beforeReason).slice(0, 140)}`);
  console.log(`    reason after:  ${clean(row.afterReason).slice(0, 140)}`);
}

if (unexpected.length) {
  console.error("UNEXPECTED LABEL CHANGES:");
  for (const line of unexpected) console.error(`  ${line}`);
  process.exitCode = 2;
} else {
  console.log("Label changes match expectation (R12 S2, R16 S3, R17 S1, R17 S2 → green; no others).");
}
