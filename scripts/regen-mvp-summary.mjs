#!/usr/bin/env node
/**
 * Regenerate docs/MVP_SUMMARY.md from docs/BACKLOG.md (MVP column) and
 * docs/ROADMAP.md ([MVP] tag). Overwrites the output file entirely.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BACKLOG_PATH = path.join(ROOT, "docs", "BACKLOG.md");
const ROADMAP_PATH = path.join(ROOT, "docs", "ROADMAP.md");
const OUTPUT_PATH = path.join(ROOT, "docs", "MVP_SUMMARY.md");

const TABLE_SECTION_RE = /^## \d+\. (.+)$/;
const TABLE_ROW_RE = /^\|(.+)\|$/;

/** @param {string} line */
function parseTableCells(line) {
  const m = line.match(TABLE_ROW_RE);
  if (!m) return null;
  return m[1].split("|").map((c) => c.trim());
}

/** @param {string} cell */
function isSeparatorRow(cells) {
  return cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Map BACKLOG section title to Source label used in MVP_SUMMARY.
 * @param {string} sectionTitle
 */
function sourceTableLabel(sectionTitle) {
  const t = sectionTitle.trim();
  if (t === "Frontend / UI") return "Frontend/UI";
  if (t === "Backend / Pipeline") return "Backend/Pipeline";
  if (t === "Process & governance") return "Process & governance";
  if (t === "Product") return "Product";
  return t.replace(/\s*\/\s*/g, "/");
}

/**
 * @param {string} backlogText
 * @returns {{ id: string, item: string, source: string, priority: string, tableOrder: number }[]}
 */
function parseBacklogMvpRows(backlogText) {
  const lines = backlogText.split("\n");
  /** @type {{ id: string, item: string, source: string, priority: string, tableOrder: number }[]} */
  const rows = [];
  let currentSection = "";
  let tableOrder = -1;
  let inCharacterTables = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionMatch = line.match(TABLE_SECTION_RE);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (/^(Frontend|Backend|Process|Product)/i.test(currentSection)) {
        inCharacterTables = true;
        tableOrder += 1;
      }
      continue;
    }

    if (line.startsWith("## Closed")) {
      break;
    }

    if (!inCharacterTables || !currentSection) continue;

    const cells = parseTableCells(line);
    if (!cells || cells.length < 2) continue;
    if (isSeparatorRow(cells)) continue;

    const first = cells[0];
    if (first === "ID") {
      const mvpIdx = cells.findIndex((c) => c === "MVP");
      const priorityIdx = cells.findIndex((c) => c === "Priority");
      if (mvpIdx === -1 || priorityIdx === -1) continue;

      let j = i + 1;
      while (j < lines.length) {
        const dataLine = lines[j];
        if (dataLine.startsWith("## ") && !dataLine.match(TABLE_SECTION_RE)) break;
        if (dataLine.startsWith("## ") && dataLine.match(TABLE_SECTION_RE)) break;
        if (dataLine.startsWith("**Suggested")) break;
        if (dataLine === "---") break;

        const dataCells = parseTableCells(dataLine);
        if (!dataCells || isSeparatorRow(dataCells)) {
          j += 1;
          continue;
        }
        if (dataCells[0] === "ID") break;

        const mvpVal = dataCells[mvpIdx]?.trim() ?? "";
        if (mvpVal === "MVP") {
          rows.push({
            id: dataCells[0].trim(),
            item: dataCells[1] ?? "",
            source: `BACKLOG: ${sourceTableLabel(currentSection)}`,
            priority: (dataCells[priorityIdx] ?? "").trim(),
            tableOrder,
          });
        }
        j += 1;
      }
      i = j - 1;
    }
  }

  const idSortKey = (/** @type {string} */ id) => {
    const m = id.match(/^([A-Za-z]+)(\d+(?:\.\d+)?)$/);
    if (!m) return [id, 0];
    return [m[1], parseFloat(m[2])];
  };

  rows.sort((a, b) => {
    if (a.tableOrder !== b.tableOrder) return a.tableOrder - b.tableOrder;
    const ak = idSortKey(a.id);
    const bk = idSortKey(b.id);
    if (ak[0] !== bk[0]) return String(ak[0]).localeCompare(String(bk[0]));
    return Number(ak[1]) - Number(bk[1]);
  });

  return rows;
}

/** @param {string} raw */
function stripMarkdownBold(raw) {
  return raw.replace(/\*\*/g, "").trim();
}

/** @param {string} raw */
function stripMvpTag(raw) {
  return raw.replace(/\s*\[MVP\]\s*/g, "").trim();
}

/**
 * @param {string} roadmapText
 * @returns {{ id: string, item: string, priority: string, lineNo: number }[]}
 */
function parseRoadmapMvpItems(roadmapText) {
  const lines = roadmapText.split("\n");
  /** @type {{ id: string, item: string, priority: string, lineNo: number }[]} */
  const items = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("[MVP]")) continue;

    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      const full = stripMvpTag(stripMarkdownBold(headingMatch[1]));
      const idMatch = full.match(/^(R[\d.]+)\s*[—–-]/);
      const id = idMatch ? idMatch[1] : full.split(/\s/)[0];
      let priority = "";
      for (let k = i + 1; k < Math.min(i + 8, lines.length); k++) {
        const statusMatch = lines[k].match(/\*\*Status:\*\*\s*\*\*([^*]+)\*\*/);
        if (statusMatch) {
          priority = statusMatch[1].trim();
          break;
        }
      }
      items.push({ id, item: full, priority, lineNo: i });
      continue;
    }

    const cells = parseTableCells(line);
    if (!cells || isSeparatorRow(cells)) continue;

    const labelCell = cells[0] ?? "";
    if (!labelCell.includes("[MVP]")) continue;

    const id = stripMvpTag(stripMarkdownBold(labelCell));
    const item = cells[1] ?? "";
    let priority = "";
    if (cells.length >= 3) {
      const last = cells[cells.length - 1].trim();
      const secondLast = cells[cells.length - 2]?.trim() ?? "";
      if (/^(Planned|Medium|Low|High|—|--)$/i.test(last) || /^(Planned|Medium|Low|High)$/i.test(last)) {
        priority = last;
      } else if (/^(Planned|Medium|Low|High)$/i.test(secondLast)) {
        priority = secondLast;
      } else {
        priority = last;
      }
    }

    items.push({ id, item, priority, lineNo: i });
  }

  items.sort((a, b) => a.lineNo - b.lineNo);
  return items;
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
 * @param {{ id: string, item: string, source: string, priority: string }[]} backlogRows
 * @param {{ id: string, item: string, priority: string }[]} roadmapRows
 */
function buildMarkdown(backlogRows, roadmapRows) {
  const total = backlogRows.length + roadmapRows.length;
  const date = todayIso();

  const header = `# Brightline Content Engine — MVP Launch Blockers

> **Generated file — do not edit by hand.**
> Derived view of MVP-designated items. Sources of truth:
> \`docs/BACKLOG.md\` (rows where MVP column = "MVP") and
> \`docs/ROADMAP.md\` (items tagged "[MVP]"). Editing this file by hand
> will cause it to drift.
>
> **To regenerate:** instruct Cursor —
> "Regenerate docs/MVP_SUMMARY.md: pull every BACKLOG.md row with MVP
> column = 'MVP' and every ROADMAP.md item tagged '[MVP]' into the flat
> table, overwrite the file entirely."
>
> Last generated: ${date}

## MVP-designated items (${total} total)

| ID | Item | Source | Priority |
|----|------|--------|----------|
`;

  const tableLines = [];
  for (const r of backlogRows) {
    tableLines.push(
      `| ${escapeTableCell(r.id)} | ${escapeTableCell(r.item)} | ${escapeTableCell(r.source)} | ${escapeTableCell(r.priority)} |`
    );
  }
  for (const r of roadmapRows) {
    tableLines.push(
      `| ${escapeTableCell(r.id)} | ${escapeTableCell(r.item)} | ROADMAP | ${escapeTableCell(r.priority)} |`
    );
  }

  return header + tableLines.join("\n") + "\n";
}

async function main() {
  const [backlogText, roadmapText] = await Promise.all([
    readFile(BACKLOG_PATH, "utf8"),
    readFile(ROADMAP_PATH, "utf8"),
  ]);

  const backlogRows = parseBacklogMvpRows(backlogText);
  const roadmapItems = parseRoadmapMvpItems(roadmapText);
  const roadmapRows = roadmapItems.map((r) => ({
    id: r.id,
    item: r.item,
    priority: r.priority,
  }));

  const backlogCount = backlogRows.length;
  const roadmapCount = roadmapRows.length;
  const total = backlogCount + roadmapCount;

  if (total !== backlogCount + roadmapCount) {
    console.error(
      `Self-check failed: total (${total}) !== backlog (${backlogCount}) + roadmap (${roadmapCount})`
    );
    process.exit(1);
  }

  const markdown = buildMarkdown(backlogRows, roadmapRows);
  await writeFile(OUTPUT_PATH, markdown, "utf8");

  console.log(`backlog matches: ${backlogCount}`);
  console.log(`roadmap matches: ${roadmapCount}`);
  console.log(`total: ${total}`);
  console.log(`wrote: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
