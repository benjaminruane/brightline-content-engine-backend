#!/usr/bin/env node
/**
 * Regenerate docs/LAUNCH_SUMMARY.md from docs/BACKLOG.md (Launch column).
 * Overwrites the output file entirely.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BACKLOG_PATH = path.join(ROOT, "docs", "BACKLOG.md");
const OUTPUT_PATH = path.join(ROOT, "docs", "LAUNCH_SUMMARY.md");

const TABLE_SECTION_RE = /^## (\d+\. .+|Parked)$/;
const TABLE_ROW_RE = /^\|(.+)\|$/;

/** @param {string} line */
function parseTableCells(line) {
  const m = line.match(TABLE_ROW_RE);
  if (!m) return null;
  return m[1].split("|").map((c) => c.trim());
}

/** @param {string[]} cells */
function isSeparatorRow(cells) {
  return cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * @param {string} backlogText
 * @returns {{ section: string, id: string, item: string, priority: string }[]}
 */
function parseLaunchRows(backlogText) {
  const lines = backlogText.split("\n");
  /** @type {{ section: string, id: string, item: string, priority: string }[]} */
  const rows = [];
  let currentSection = "";
  let inWorkTables = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## Closed")) break;
    if (line.startsWith("## Findings log")) break;
    if (line.startsWith("## Standing rules")) break;

    const sectionMatch = line.match(TABLE_SECTION_RE);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      inWorkTables = true;
      continue;
    }

    if (!inWorkTables || !currentSection) continue;

    const cells = parseTableCells(line);
    if (!cells || cells.length < 2) continue;
    if (isSeparatorRow(cells)) continue;

    const first = cells[0];
    if (first === "ID") {
      const launchIdx = cells.findIndex((c) => c === "Launch");
      const priorityIdx = cells.findIndex((c) => c === "Priority");
      if (launchIdx === -1 || priorityIdx === -1) continue;

      let j = i + 1;
      while (j < lines.length) {
        const dataLine = lines[j];
        if (dataLine.startsWith("## ")) break;
        if (dataLine.startsWith("**Suggested")) break;
        if (dataLine === "---") break;

        const dataCells = parseTableCells(dataLine);
        if (!dataCells || isSeparatorRow(dataCells)) {
          j += 1;
          continue;
        }
        if (dataCells[0] === "ID") break;

        const launchVal = dataCells[launchIdx]?.trim() ?? "";
        if (launchVal === "LAUNCH") {
          rows.push({
            section: currentSection,
            id: dataCells[0].trim(),
            item: dataCells[1] ?? "",
            priority: (dataCells[priorityIdx] ?? "").trim(),
          });
        }
        j += 1;
      }
      i = j - 1;
    }
  }

  return rows;
}

/** @param {string} cell */
function escapeTableCell(cell) {
  return cell.replace(/\|/g, "\\|");
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param {{ section: string, id: string, item: string, priority: string }[]} rows
 */
function buildMarkdown(rows) {
  const date = todayIso();
  const bySection = new Map();
  for (const r of rows) {
    if (!bySection.has(r.section)) bySection.set(r.section, []);
    bySection.get(r.section).push(r);
  }

  const header = `# Brightline Content Engine - Launch rows

> **Generated file. Do not edit by hand.**
> Derived view of BACKLOG.md rows where Launch = LAUNCH.
> Source of truth: \`docs/BACKLOG.md\`.
>
> **To regenerate:** \`npm run launch:summary\`
>
> Last generated: ${date}

LAUNCH means needed before a first client uses the product. See the Launch plan in \`docs/ROADMAP.md\`.

## LAUNCH rows (${rows.length} total)

`;

  const parts = [header];
  for (const [section, sectionRows] of bySection) {
    parts.push(`### ${section} (${sectionRows.length})\n`);
    parts.push("| ID | Item | Priority |");
    parts.push("|----|------|----------|");
    for (const r of sectionRows) {
      parts.push(
        `| ${escapeTableCell(r.id)} | ${escapeTableCell(r.item)} | ${escapeTableCell(r.priority)} |`
      );
    }
    parts.push("");
  }

  return parts.join("\n");
}

async function main() {
  const backlogText = await readFile(BACKLOG_PATH, "utf8");
  const rows = parseLaunchRows(backlogText);
  const markdown = buildMarkdown(rows);
  await writeFile(OUTPUT_PATH, markdown, "utf8");
  console.log(`launch rows: ${rows.length}`);
  const counts = new Map();
  for (const r of rows) counts.set(r.section, (counts.get(r.section) || 0) + 1);
  for (const [section, n] of counts) console.log(`  ${section}: ${n}`);
  console.log(`wrote: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
