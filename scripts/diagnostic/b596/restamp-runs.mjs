/**
 * B596. Re-stamp saved preview runs with B595 + B596 backend rules.
 * Read-only on inputs; writes copies under ~/ce-diagnostics/b596-diag/restamped/.
 * No model call.
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BE = path.resolve(HERE, "../../..");
const INPUTS = path.join(process.env.HOME || "", "ce-diagnostics/b595-diag/inputs");
const AFTER_CSV = path.join(process.env.HOME || "", "ce-diagnostics/b595-diag/after.csv");
const OUT_DIR = path.join(process.env.HOME || "", "ce-diagnostics/b596-diag/restamped");
const REPORT = path.join(process.env.HOME || "", "ce-diagnostics/b596-diag/restamp-report.txt");

const { restampAnalyseResponse, applyFinalStamp } = await import(
  pathToFileURL(path.join(BE, "lib/qc/b596-stamp.mjs")).href
);
const { draftHeader } = await import(
  pathToFileURL(path.join(BE, "lib/qc/reading-contract.mjs")).href
);
const { SHOWN_LABELS } = await import(
  pathToFileURL(path.join(BE, "lib/qc/shown-verdict.mjs")).href
);

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function loadAfterCsv() {
  const text = readFileSync(AFTER_CSV, "utf8");
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = new Map();
  for (const line of lines.slice(1)) {
    // Simple CSV: fields may be quoted.
    const cells = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    const run = cells[idx.run];
    const s = cells[idx.s];
    rows.set(`${run} ${s}`, {
      label_after: cells[idx.label_after],
      reason_after: cells[idx.reason_after],
      branch_after: cells[idx.branch_after],
    });
  }
  return rows;
}

function loadRuns() {
  const bundled = JSON.parse(readFileSync(path.join(INPUTS, "ce-test-runs-2026-11-25.json"), "utf8"));
  const runs = { ...bundled };
  for (const file of readdirSync(INPUTS)) {
    if (!file.startsWith("ce-run-") || !file.endsWith(".json")) continue;
    const body = JSON.parse(readFileSync(path.join(INPUTS, file), "utf8"));
    const name = file.replace(/^ce-run-/, "").replace(/\.json$/, "");
    runs[name] = body;
  }
  return runs;
}

mkdirSync(OUT_DIR, { recursive: true });
const after = loadAfterCsv();
const runs = loadRuns();
const labelChanges = [];
const report = [];

for (const [runName, body] of Object.entries(runs)) {
  const restamped = restampAnalyseResponse(body);
  const header = draftHeader(
    (restamped.statements || []).map((row) => ({
      text: row?.text || row?.qcCard?.statement || "",
      sentenceState: row?.qcCard?.sentenceState,
      statementVerdict: row?.qcCard?.statementVerdict,
      readingFacts: row?.qcCard?.readingFacts,
    })),
  );
  restamped.reading = {
    ...(restamped.reading || {}),
    header: {
      stamp: header.stamp,
      numbers: header.numbers,
      line: header.line,
      footnote: header.footnote,
      counts: header.counts,
    },
  };
  const outFile = path.join(OUT_DIR, `${runName}.json`);
  writeFileSync(outFile, `${JSON.stringify(restamped, null, 2)}\n`, "utf8");
  report.push(`Wrote ${outFile}`);

  (restamped.statements || []).forEach((row, index) => {
    const card = row.qcCard || {};
    const sid = `S${index + 1}`;
    const key = `${runName} ${sid}`;
    const label = clean(card.sentenceLabel) || clean(SHOWN_LABELS[card.sentenceState]) || "";
    const prior = after.get(key);
    const priorLabel = prior ? clean(prior.label_after) : "";
    if (priorLabel && priorLabel !== label) {
      labelChanges.push({
        key,
        before: priorLabel,
        after: label,
        guard: card.stampGuard || "",
        reason: clean(card.shownReason).slice(0, 160),
      });
    }
  });
}

report.push("");
report.push("Cards whose label changed versus after.csv:");
if (!labelChanges.length) report.push("  (none)");
for (const row of labelChanges) {
  report.push(`- ${row.key}: ${row.before} → ${row.after} (guard=${row.guard})`);
  report.push(`    reason: ${row.reason}`);
}

// Item 2 only: reason-guard greens / state moves are allowed.
const unexpected = labelChanges.filter((row) => {
  const allowedGuard = row.guard === "rule_b_or_facts"
    || row.guard === "gross_net_gap"
    || row.guard === "named_gap"
    || row.guard === "look_fallback"
    || row.guard === "reasonGuard";
  // Also allow when after.csv was still Needs a look and B596 reason-guard greened it.
  return !allowedGuard && !(row.before === "Needs a look" && row.after === "Nothing raised");
});

report.push("");
if (unexpected.length) {
  report.push("UNEXPECTED label changes (not item-2 reason guard):");
  for (const row of unexpected) report.push(`  ${row.key}`);
} else {
  report.push("All label changes versus after.csv are item-2 reason-guard (or none).");
}

writeFileSync(REPORT, `${report.join("\n")}\n`, "utf8");
console.log(report.join("\n"));
if (unexpected.length) process.exitCode = 2;

void applyFinalStamp;
