#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUTS_PATH = join(__dirname, "..", "r1_2_mini_eval", "inputs.json");
const V2_PATH = join(__dirname, "openai_gpt4o_outputs.json");
const V3_PATH = join(__dirname, "openai_gpt4o_v3prompt_outputs.json");
const BASELINE_RESULTS_PATH = join(__dirname, "results.md");
const OUT_PATH = join(__dirname, "results_v3prompt.md");

const CLASS_ORDER = ["confirmed", "partially_confirmed", "conflicting", "no_support"];

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function emptyMatrix() {
  const matrix = {};
  for (const gt of CLASS_ORDER) {
    matrix[gt] = {};
    for (const pred of CLASS_ORDER) matrix[gt][pred] = 0;
  }
  return matrix;
}

function formatMatrix(matrix) {
  const header = `| GT \\\\ Pred | ${CLASS_ORDER.join(" | ")} |`;
  const sep = `| --- | ${CLASS_ORDER.map(() => "---").join(" | ")} |`;
  const rows = CLASS_ORDER.map(
    (gt) => `| **${gt}** | ${CLASS_ORDER.map((pred) => matrix[gt][pred]).join(" | ")} |`
  );
  return [header, sep, ...rows].join("\n");
}

function score(pairs, rows) {
  const byId = new Map(rows.map((row) => [String(row.pairId), row]));
  const matrix = emptyMatrix();
  let agree = 0;
  let conflictCorrect = 0;
  let conflictTotal = 0;
  let schemaFails = 0;
  let totalCost = 0;
  const latencies = [];
  const disagreements = [];
  for (const pair of pairs) {
    const row = byId.get(String(pair.pairId));
    const pred = row?.classification;
    const valid = CLASS_ORDER.includes(pred);
    if (!valid || row?.schema_valid === false) schemaFails += 1;
    totalCost += Number(row?.costUsd) || 0;
    if (typeof row?.latencyMs === "number" && Number.isFinite(row.latencyMs)) latencies.push(row.latencyMs);
    if (pair.gt_classification === "conflicting") {
      conflictTotal += 1;
      if (pred === "conflicting") conflictCorrect += 1;
    }
    if (valid) {
      matrix[pair.gt_classification][pred] += 1;
      if (pred === pair.gt_classification) agree += 1;
      else {
        disagreements.push({
          pairId: pair.pairId,
          gt: pair.gt_classification,
          predicted: pred,
          explanation: row?.explanation || "",
          passage: row?.passage || "",
        });
      }
    } else {
      disagreements.push({
        pairId: pair.pairId,
        gt: pair.gt_classification,
        predicted: String(pred || "invalid"),
        explanation: row?.explanation || "",
        passage: row?.passage || "",
      });
    }
  }

  return {
    byId,
    matrix,
    disagreements,
    agreementRate: agree / pairs.length,
    conflictRate: conflictTotal > 0 ? conflictCorrect / conflictTotal : 0,
    conflictLabel: `${conflictCorrect}/${conflictTotal}`,
    totalCost,
    p50Latency: percentile(latencies, 50),
    p95Latency: percentile(latencies, 95),
    schemaFails,
  };
}

function extractV2SummaryRow() {
  const md = readFileSync(BASELINE_RESULTS_PATH, "utf8");
  const line = md
    .split("\n")
    .find((l) => l.startsWith("| openai | gpt-4o | 0 |"));
  return line || "";
}

function main() {
  const pairs = loadJson(INPUTS_PATH).pairs;
  const v2Rows = loadJson(V2_PATH);
  const v3Rows = loadJson(V3_PATH);
  const v2 = score(pairs, v2Rows);
  const v3 = score(pairs, v3Rows);
  const byIdV2 = v2.byId;
  const byIdV3 = v3.byId;

  const changedPairs = [];
  for (const pair of pairs) {
    const a = byIdV2.get(String(pair.pairId));
    const b = byIdV3.get(String(pair.pairId));
    const aClass = a?.classification || "invalid";
    const bClass = b?.classification || "invalid";
    const aPassage = String(a?.passage || "");
    const bPassage = String(b?.passage || "");
    if (aClass !== bClass || aPassage !== bPassage) {
      changedPairs.push({
        pairId: pair.pairId,
        gt: pair.gt_classification,
        v2Class: aClass,
        v3Class: bClass,
        v2Passage: aPassage,
        v3Passage: bPassage,
      });
    }
  }

  const conflictPairs = pairs
    .filter((p) => p.gt_classification === "conflicting")
    .map((p) => ({ pairId: p.pairId, passage: String(byIdV3.get(String(p.pairId))?.passage || "") }))
    .filter((p) => p.passage.trim().length > 0)
    .slice(0, 3);

  const lines = [];
  lines.push("# R2.5.2 — gpt-4o prompt v3 evaluation", "");
  lines.push(`Generated: ${new Date().toISOString()}`, "");
  lines.push("## Headline summary: gpt-4o + v2 vs gpt-4o + v3 prompt", "");
  lines.push("| Prompt | Agreement vs GT | Conflict rate | Total cost | p50 latency | p95 latency | Schema fails |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  lines.push("| v2 | 97.87% | 5/5 | $0.41 | (existing) | (existing) | 0 |");
  lines.push(
    `| v3 | ${(v3.agreementRate * 100).toFixed(2)}% | ${v3.conflictLabel} | $${v3.totalCost.toFixed(2)} | ${Math.round(v3.p50Latency)} ms | ${Math.round(v3.p95Latency)} ms | ${v3.schemaFails} |`
  );
  lines.push("");
  lines.push("Reference v2 row from `results.md`:", "");
  lines.push(`- ${extractV2SummaryRow()}`);
  lines.push("");

  lines.push("## Confusion matrix (v3 prompt)", "");
  lines.push(formatMatrix(v3.matrix), "");

  lines.push("## Pairs where v3 disagrees with GT", "");
  if (v3.disagreements.length === 0) {
    lines.push("_None._", "");
  } else {
    for (const d of v3.disagreements) {
      lines.push(`- **${d.pairId}**: GT=\`${d.gt}\`, v3=\`${d.predicted}\` — ${String(d.explanation).replace(/\n/g, " ")}`);
    }
    lines.push("");
  }

  lines.push("## Pairs where v3 differs from v2", "");
  if (changedPairs.length === 0) {
    lines.push("_None._", "");
  } else {
    for (const d of changedPairs) {
      lines.push(`- **${d.pairId}** (GT=\`${d.gt}\`): v2=\`${d.v2Class}\`, v3=\`${d.v3Class}\``);
      lines.push(`  - v2 passage: ${d.v2Passage ? `"${d.v2Passage}"` : "(empty)"}`);
      lines.push(`  - v3 passage: ${d.v3Passage ? `"${d.v3Passage}"` : "(empty)"}`);
    }
    lines.push("");
  }

  lines.push("## Spot-check: conflict passages (v3 prompt)", "");
  for (const row of conflictPairs) {
    const hasEllipsisMarker = row.passage.includes("[...]");
    lines.push(
      `- **${row.pairId}**: ${hasEllipsisMarker ? "contains" : "does not contain"} \`[...]\`; passage=${row.passage ? `"${row.passage}"` : "(empty)"}`
    );
  }
  lines.push("");

  writeFileSync(OUT_PATH, lines.join("\n"), "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

main();
