/**
 * B503. Live stage 1 on the drafts. The frozen statement files are not written.
 *
 *   node scripts/diagnostic/b503/stage1-check.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { filterFixtures, loadAllFixtures } from "../lib/fixtures.mjs";
import { flattenStatements, joinKey, mapGroupA, normalizeStatementText, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCURACY = path.join(__dirname, "../accuracy");
const OUT = path.join(__dirname, "STAGE1.md");
const IDS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "22", "23", "24", "25"];
const FAULTY = new Set(["conflicting", "no_support"]);
const NAMED = [
  ["14", "We will provide further detail when the work is sufficiently advanced."],
  ["14", "We expect to bring a specific potential investment to consider over the coming months."],
];

loadLocalEnvFiles({ liveMeasurement: true });

function norm(text) {
  return normalizeStatementText(text);
}

function loadFrozen() {
  const primary = JSON.parse(readFileSync(path.join(ACCURACY, "statements.json"), "utf8"));
  const extra = JSON.parse(readFileSync(path.join(ACCURACY, "statements-after-20.json"), "utf8"));
  const rows = [...flattenStatements(primary), ...flattenStatements(extra)];
  const byId = new Map();
  for (const row of rows) {
    const id = padFixtureId(row.fixtureId);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  }
  return byId;
}

function protectedTexts(frozenById) {
  const labelsDoc = JSON.parse(readFileSync(path.join(ACCURACY, "labels.json"), "utf8"));
  const design = JSON.parse(readFileSync(path.join(ACCURACY, "group-a-design.json"), "utf8"));
  const statements = JSON.parse(readFileSync(path.join(ACCURACY, "statements.json"), "utf8"));
  const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
  const mapped = mapGroupA(flattenStatements(statements), design);
  const rows = [];
  for (const row of labels) {
    if (row.kind && row.kind !== "statement") continue;
    if (!FAULTY.has(row.label)) continue;
    rows.push({ id: padFixtureId(row.fixtureId), text: row.statementText, why: `labelled ${row.label}` });
  }
  for (const fault of design.faults) {
    const item = mapped.mapping.find((entry) => entry.id === fault.id);
    const key = item?.keys?.[0] || null;
    if (!key) {
      rows.push({ id: padFixtureId(fault.fixtureId), text: fault.span, why: `group A ${fault.id} unmapped` });
      continue;
    }
    const fixtureId = key.split("::")[0];
    const frozen = (frozenById.get(fixtureId) || []).find((row) => joinKey(row.fixtureId, row.text, row.occurrence) === key);
    rows.push({
      id: fixtureId,
      text: frozen?.text || fault.span,
      why: `group A ${fault.id}`,
    });
  }
  for (const [id, text] of NAMED) {
    rows.push({ id, text, why: "named closing or timing sentence" });
  }
  return rows;
}

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const fixtures = filterFixtures(await loadAllFixtures(), { ids: IDS });
const frozenById = loadFrozen();
const liveById = new Map();
const lines = ["# B503 stage 1", "", "Live extraction. Frozen statement files were not written.", ""];
let cost = 0;
const sourceRows = [];

for (const fixture of fixtures) {
  const id = padFixtureId(fixture.data.id);
  const draft = fixture.data.draft;
  if (typeof draft !== "string" || !draft.trim()) throw new Error(`b503 stage1: fixture ${id} has no draft`);
  const result = await extractStatements({ draftText: draft, traceId: `b503-stage1-${id}` });
  cost += Number(result?.costUsd) || 0;
  const source = result?.source || "missing";
  sourceRows.push(`${id} ${source} USD ${(Number(result?.costUsd) || 0).toFixed(6)}`);
  const flags = new Map();
  const kept = Array.isArray(result?.statements) ? result.statements : [];
  const dropped = Array.isArray(result?.droppedNonClaims) ? result.droppedNonClaims : [];
  for (const row of kept) {
    const key = norm(row.text);
    if (!flags.has(key)) flags.set(key, []);
    flags.get(key).push(true);
  }
  for (const row of dropped) {
    const key = norm(row.text);
    if (!flags.has(key)) flags.set(key, []);
    flags.get(key).push(false);
  }
  liveById.set(id, { flags, source, kept, dropped });
  console.log(`F${id} ${source} claims ${kept.length} dropped ${dropped.length} USD ${(Number(result?.costUsd) || 0).toFixed(6)}`);
}

function nowOf(id, text) {
  const flags = liveById.get(id)?.flags?.get(norm(text));
  if (!flags || !flags.length) return "absent";
  if (flags.every((flag) => flag === true)) return "true";
  if (flags.every((flag) => flag === false)) return "false";
  return "mixed";
}

const diffs = [];
for (const id of IDS) {
  const frozen = frozenById.get(id) || [];
  const seen = new Set();
  for (const row of frozen) {
    const key = norm(row.text);
    seen.add(key);
    const now = nowOf(id, row.text);
    if (now !== "true") diffs.push({ id, sentence: row.text, frozen: "true", now });
  }
  const live = liveById.get(id);
  const rows = [...(live?.kept || []), ...(live?.dropped || [])];
  for (const row of rows) {
    const key = norm(row.text);
    if (seen.has(key)) continue;
    seen.add(key);
    const now = nowOf(id, row.text);
    if (now === "false") continue;
    diffs.push({ id, sentence: row.text, frozen: "false", now });
  }
}

const guarded = protectedTexts(frozenById);
const failures = [];
for (const row of guarded) {
  const now = nowOf(row.id, row.text);
  if (now === "false" || now === "absent" || now === "mixed") {
    failures.push(`${row.id} ${row.why}: ${now} | ${row.text}`);
  }
}
for (const id of IDS) {
  const source = liveById.get(id)?.source;
  if (source !== "llm") failures.push(`${id} extraction source is ${source || "missing"}`);
}

lines.push(`cost USD ${cost.toFixed(6)}`);
lines.push("");
lines.push("sources");
lines.push(...sourceRows);
lines.push("");
lines.push(`sentences whose isClaim differs: ${diffs.length}`);
if (!diffs.length) lines.push("none");
for (const row of diffs) {
  lines.push(`${row.id}\tfrozen ${row.frozen}\tnow ${row.now}\t${row.sentence}`);
}
lines.push("");
lines.push(`labelled faulty or group A now not a claim: ${failures.length}`);
if (!failures.length) lines.push("none");
for (const row of failures) lines.push(row);
lines.push("");
lines.push(failures.length ? "GATE FAILED" : "GATE HELD");
writeFileSync(OUT, `${lines.join("\n")}\n`);
console.log(`cost USD ${cost.toFixed(6)}`);
console.log(`differences ${diffs.length}`);
console.log(failures.length ? "GATE FAILED" : "GATE HELD");
if (failures.length) {
  for (const row of failures) console.log(row);
  process.exitCode = 2;
}
