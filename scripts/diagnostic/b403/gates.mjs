/**
 * B403 gates. Sentences are in TABLE.md and are not revised here after a count.
 *   node scripts/diagnostic/b403/gates.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { elementFound, extractElements } from "../../../lib/qc/b394-elements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE_PATH = path.join(ROOT, "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt");
const RUNS = path.join(ROOT, "scripts/diagnostic/b403/runs");

const STOP = new Set("a an the of and or for to in on by its with".split(" "));

export const LOOKUPS = [
  { id: "clean-S0", arm: "clean", subject: "HICL Infrastructure", element: "performance", value: "in line with expectations", period: "five months to 28 February 2026" },
  { id: "clean-S1", arm: "clean", subject: "portfolio", element: "EBITDA growth", value: "driven by capital expenditure", period: "" },
  { id: "clean-S2", arm: "clean", subject: "growth investments", element: "EBITDA growth", value: "in line with budgets", period: "" },
  { id: "clean-S3", arm: "clean", subject: "London St. Pancras High Speed", element: "international train path bookings", value: "slightly ahead of forecast", period: "during the period" },
  { id: "clean-S4", arm: "clean", subject: "Virgin Trains", element: "operations", value: "cross-Channel operations from St. Pancras", period: "" },
  { id: "clean-S5", arm: "clean", subject: "Fortysouth", element: "new towers", value: "16", period: "during the period" },
  { id: "clean-S6", arm: "clean", subject: "company", element: "refinancing", value: "reduction in debt servicing costs", period: "" },
  { id: "clean-S7a", arm: "clean", subject: "Affinity Water", element: "appointment", value: "CEO", period: "" },
  { id: "clean-S7b", arm: "clean", subject: "Affinity Water", element: "white paper", value: "water sector reform", period: "" },
  { id: "doc-S0", arm: "doctored", subject: "HCIL Infrastructure", element: "performance", value: "in line with expectations", period: "six months to 31 December 2025" },
  { id: "doc-S1", arm: "doctored", subject: "portfolio", element: "EBITDA growth", value: "average 30%", period: "" },
  { id: "doc-S2", arm: "doctored", subject: "growth investments", element: "EBITDA growth", value: "significantly outperform budgets", period: "" },
  { id: "doc-S3", arm: "doctored", subject: "Paris St. Germain High Speed", element: "international train path bookings", value: "slightly ahead of forecast", period: "during the period" },
  { id: "doc-S4", arm: "doctored", subject: "Virgin Trains", element: "operations", value: "cross-Channel operations from St. Germain", period: "" },
  { id: "doc-S5", arm: "doctored", subject: "TowerCo", element: "new towers", value: "20", period: "during the past year" },
  { id: "doc-S6", arm: "doctored", subject: "company", element: "refinancing", value: "increase in debt servicing costs", period: "" },
  { id: "doc-S7a", arm: "doctored", subject: "Affinity Water", element: "appointment", value: "CFO", period: "" },
  { id: "doc-S7b", arm: "doctored", subject: "Affinity Water", element: "white paper", value: "electricity sector reform", period: "" },
];

function collapse(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function norm(text) {
  return collapse(text).toLowerCase();
}

export function verbatim(value, line) {
  const v = collapse(value);
  const l = collapse(line);
  if (!v || !l) return false;
  const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const left = /^\d/.test(v) ? "(?<!\\d)" : "";
  const right = /\d$/.test(v) ? "(?!\\d)" : "";
  return new RegExp(`${left}${escaped}${right}`).test(l);
}

function foldedProof(value, line) {
  const elements = extractElements(value, value, line);
  const folded = elements.filter((el) => el.kind === "figure" || el.kind === "date");
  if (!folded.length) return false;
  if (!folded.every((el) => elementFound(el, line))) return false;
  const others = elements.filter((el) => el.kind !== "figure" && el.kind !== "date");
  if (!others.every((el) => verbatim(el.surface, line))) return false;
  let residue = collapse(value);
  for (const el of [...elements].sort((a, b) => b.surface.length - a.surface.length)) {
    residue = residue.split(el.surface).join(" ");
  }
  const words = collapse(residue).split(" ").filter((word) => /[A-Za-z]/.test(word));
  return words.every((word) => verbatim(word, line));
}

export function valueOnLine(value, line) {
  if (verbatim(value, line)) return true;
  return foldedProof(value, line);
}

export function loadLines(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

export function passesG1(row, lines) {
  const lineId = typeof row?.lineId === "string" ? row.lineId.trim() : "";
  const match = /^L(\d+)$/.exec(lineId);
  if (!match) return false;
  const index = Number(match[1]) - 1;
  if (index < 0 || index >= lines.length) return false;
  if (typeof row.value !== "string" || !collapse(row.value)) return false;
  return valueOnLine(row.value, lines[index]);
}

function contentWords(subject) {
  return norm(subject)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => /[a-z]/.test(word) && !STOP.has(word));
}

export function passesG5(row, lines) {
  const match = /^L(\d+)$/.exec(String(row?.lineId || "").trim());
  if (!match) return false;
  const line = lines[Number(match[1]) - 1] || "";
  const hay = ` ${norm(line).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
  const words = contentWords(row.subject);
  if (!words.length) return false;
  return words.some((word) => hay.includes(` ${word} `));
}

function oneFigure(value) {
  const figures = extractElements(value, value, "").filter((el) => el.kind === "figure");
  if (figures.length !== 1) return null;
  return figures[0];
}

function figuresEqual(a, b) {
  if (!a || !b) return false;
  if (a.unit !== b.unit) return false;
  if (a.sign !== b.sign && a.written !== 0) return false;
  const gap = Math.abs(a.folded - b.folded);
  return gap <= Math.max(1e-6, Math.abs(a.folded) * 1e-9);
}

function sumEquals(parts, total) {
  if (parts.some((part) => part.unit !== total.unit || part.sign !== total.sign && part.written !== 0)) return false;
  const summed = parts.reduce((sum, part) => sum + part.folded, 0);
  const gap = Math.abs(summed - total.folded);
  return gap <= Math.max(1e-6, Math.abs(total.folded) * 1e-9);
}

export function dropG2(rows) {
  const drop = new Set();
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = `${norm(row.subject)}|${norm(row.period)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  for (const indexes of groups.values()) {
    const totalIndexes = indexes.filter((index) => norm(rows[index].element) === "total");
    const partIndexes = indexes.filter((index) => {
      if (norm(rows[index].element) === "total") return false;
      const figure = oneFigure(rows[index].value);
      return figure && figure.unit !== "percent";
    });
    if (totalIndexes.length && partIndexes.length >= 2) {
      const parts = partIndexes.map((index) => oneFigure(rows[index].value));
      for (const index of totalIndexes) {
        const total = oneFigure(rows[index].value);
        if (!total || total.unit === "percent" || !sumEquals(parts, total)) drop.add(index);
      }
    }
    const percentIndexes = indexes.filter((index) => oneFigure(rows[index].value)?.unit === "percent");
    if (percentIndexes.length && partIndexes.length === 2) {
      const [a, b] = partIndexes.map((index) => oneFigure(rows[index].value));
      for (const index of percentIndexes) {
        const percent = oneFigure(rows[index].value);
        const ratio = b.folded === 0 ? null : (a.folded / b.folded) * 100;
        const flipped = a.folded === 0 ? null : (b.folded / a.folded) * 100;
        const stated = percent.sign * percent.written;
        const close = (candidate) => candidate != null && Math.abs(stated - candidate) <= 1;
        if (!close(ratio) && !close(flipped)) drop.add(index);
      }
    }
  }
  const clashes = new Map();
  rows.forEach((row, index) => {
    if (!norm(row.period)) return;
    const key = `${norm(row.subject)}|${norm(row.element)}|${norm(row.period)}`;
    if (!clashes.has(key)) clashes.set(key, []);
    clashes.get(key).push(index);
  });
  for (const indexes of clashes.values()) {
    const values = new Set(indexes.map((index) => norm(rows[index].value)));
    if (values.size > 1) indexes.forEach((index) => drop.add(index));
  }
  return rows.filter((_, index) => !drop.has(index));
}

function keyOf(row) {
  return [norm(row.subject), norm(row.element), norm(row.value), norm(row.period)].join("|");
}

function classOf(row, others) {
  const partnerValue = others.find((other) =>
    norm(other.subject) === norm(row.subject)
    && norm(other.element) === norm(row.element)
    && norm(other.period) === norm(row.period)
    && norm(other.value) !== norm(row.value)
  );
  if (partnerValue) return "different value";
  const partnerSubject = others.find((other) =>
    norm(other.element) === norm(row.element)
    && norm(other.value) === norm(row.value)
    && norm(other.period) === norm(row.period)
    && norm(other.subject) !== norm(row.subject)
  );
  if (partnerSubject) return "different subject";
  return "absent";
}

export function agreeG3(left, right) {
  const used = new Set();
  const kept = [];
  const differentLine = [];
  for (const row of left) {
    const key = keyOf(row);
    const index = right.findIndex((other, otherIndex) => !used.has(otherIndex) && keyOf(other) === key);
    if (index < 0) continue;
    used.add(index);
    const other = right[index];
    const lineIds = [row.lineId, other.lineId];
    if (row.lineId !== other.lineId) {
      differentLine.push({ subject: row.subject, element: row.element, value: row.value, period: row.period, lineIds });
    }
    kept.push({
      subject: row.subject,
      element: row.element,
      value: row.value,
      period: row.period,
      lineId: row.lineId,
      lineId2: other.lineId,
    });
  }
  const leftMiss = left.filter((row) => !kept.some((item) => keyOf(item) === keyOf(row) && item.lineId === row.lineId));
  const rightMiss = right.filter((_, index) => !used.has(index));
  const disagreed = [
    ...leftMiss.map((row) => ({ side: 1, klass: classOf(row, right), ...row })),
    ...rightMiss.map((row) => ({ side: 2, klass: classOf(row, left), ...row })),
  ];
  const reached = left.length + right.length;
  const rate = reached === 0 ? 0 : (kept.length * 2) / reached;
  return { kept, differentLine, disagreed, reached, rate };
}

function valuesAgree(a, b) {
  if (norm(a) === norm(b)) return true;
  return valueOnLine(a, b) || valueOnLine(b, a);
}

export function lookup(table, query) {
  let best = { kind: "none", row: null, agreed: [] };
  for (const row of table) {
    const agreed = [];
    if (norm(row.subject) === norm(query.subject)) agreed.push("subject");
    if (norm(row.element) === norm(query.element)) agreed.push("element");
    if (norm(row.period) === norm(query.period)) agreed.push("period");
    const valueOk = valuesAgree(row.value, query.value);
    if (valueOk) agreed.push("value");
    const fields = ["subject", "element", "period"];
    const typed = fields.every((field) => agreed.includes(field));
    let kind = "none";
    if (typed && valueOk) kind = "match";
    else if (typed && !valueOk) kind = "finding";
    else if (agreed.length) kind = "partial";
    const rank = { match: 3, finding: 2, partial: 1, none: 0 };
    if (rank[kind] > rank[best.kind]) best = { kind, row, agreed };
  }
  return best;
}

function pipeline(rows, lines) {
  const g1 = rows.filter((row) => passesG1(row, lines));
  const g5 = g1.filter((row) => passesG5(row, lines));
  const g2 = dropG2(g5);
  return {
    in: rows.length,
    g1: g1.length,
    droppedG1: rows.length - g1.length,
    g5: g5.length,
    droppedG5: g1.length - g5.length,
    g2: g2.length,
    droppedG2: g5.length - g2.length,
    rows: g2,
  };
}

function selfCheck() {
  const tower = "Fortysouth delivered 16 new towers during the period";
  if (!valueOnLine("16", tower)) throw new Error("self-check: 16 should pass");
  if (valueOnLine("16", "160 towers")) throw new Error("self-check: 16 must not prove 160");
  if (!valueOnLine("£225 million", "the £225m disposal of seven UK PPP assets")) throw new Error("self-check: scale fold should pass");
  if (!valueOnLine("28 Feb 2026", "period from 1 October 2025 to 28 February 2026")) throw new Error("self-check: date normalisation should pass");
  if (valueOnLine("Chief Executive Officer", "appointed a new CEO")) throw new Error("self-check: name expansion is not allowed");
  if (valueOnLine("in line with budgets", "in line with expectations")) throw new Error("self-check: budgets must not prove expectations");
  const lines = ["", tower];
  const row = { subject: "Fortysouth", element: "new towers", value: "16", period: "during the period", lineId: "L2" };
  if (!passesG1(row, lines) || !passesG5(row, lines)) throw new Error("self-check: Fortysouth row should pass G1 and G5");
  if (passesG5({ ...row, subject: "TowerCo" }, lines)) throw new Error("self-check: TowerCo should fail G5");
  const keptTotal = dropG2([
    { subject: "sale", element: "total", value: "10", period: "2026", lineId: "L1" },
    { subject: "sale", element: "part a", value: "3", period: "2026", lineId: "L1" },
    { subject: "sale", element: "part b", value: "7", period: "2026", lineId: "L1" },
  ]);
  if (keptTotal.length !== 3) throw new Error("self-check: a true total should stay");
  const droppedTotal = dropG2([
    { subject: "sale", element: "total", value: "10", period: "2026", lineId: "L1" },
    { subject: "sale", element: "part a", value: "3", period: "2026", lineId: "L1" },
    { subject: "sale", element: "part b", value: "4", period: "2026", lineId: "L1" },
  ]);
  if (droppedTotal.some((item) => item.element === "total")) throw new Error("self-check: a false total should drop");
  const keptPercent = dropG2([
    { subject: "cover", element: "share", value: "50%", period: "2026", lineId: "L1" },
    { subject: "cover", element: "part", value: "1", period: "2026", lineId: "L1" },
    { subject: "cover", element: "whole", value: "2", period: "2026", lineId: "L1" },
  ]);
  if (keptPercent.length !== 3) throw new Error("self-check: 50 percent of 1 and 2 should stay");
  const droppedPercent = dropG2([
    { subject: "cover", element: "share", value: "80%", period: "2026", lineId: "L1" },
    { subject: "cover", element: "part", value: "1", period: "2026", lineId: "L1" },
    { subject: "cover", element: "whole", value: "2", period: "2026", lineId: "L1" },
  ]);
  if (droppedPercent.some((item) => item.value === "80%")) throw new Error("self-check: 80 percent should drop");
  const clash = dropG2([
    { subject: "towers", element: "new towers", value: "16", period: "the period", lineId: "L1" },
    { subject: "towers", element: "new towers", value: "20", period: "the period", lineId: "L1" },
  ]);
  if (clash.length !== 0) throw new Error("self-check: a period clash should drop both");
  const agreed = agreeG3(
    [{ subject: "Fortysouth", element: "new towers", value: "16", period: "the period", lineId: "L39" }],
    [{ subject: "fortysouth", element: "New towers", value: "16", period: "the period", lineId: "L40" }]
  );
  if (agreed.kept.length !== 1 || agreed.differentLine.length !== 1 || agreed.rate !== 1) {
    throw new Error("self-check: agreement should keep a case-insensitive pair and report the line");
  }
  const found = lookup(agreed.kept, { subject: "Fortysouth", element: "new towers", value: "20", period: "the period" });
  if (found.kind !== "finding") throw new Error("self-check: a different value should be a finding");
  const partial = lookup(agreed.kept, { subject: "TowerCo", element: "new towers", value: "20", period: "during the past year" });
  if (partial.kind === "match" || partial.kind === "finding") throw new Error("self-check: a partial must not be a green or a finding");
}

function main() {
  selfCheck();
  const lines = loadLines(readFileSync(SOURCE_PATH, "utf8"));
  const first = JSON.parse(readFileSync(path.join(RUNS, "facts-1.json"), "utf8"));
  const second = JSON.parse(readFileSync(path.join(RUNS, "facts-2.json"), "utf8"));
  const left = pipeline(first.rows, lines);
  const right = pipeline(second.rows, lines);
  const agreement = agreeG3(left.rows, right.rows);
  const lookups = LOOKUPS.map((query) => {
    const result = lookup(agreement.kept, query);
    return {
      id: query.id,
      arm: query.arm,
      kind: result.kind,
      agreed: result.agreed,
      row: result.row,
    };
  });
  const gated = agreement.kept.map((row) => ({
    subject: row.subject,
    element: row.element,
    value: row.value,
    period: row.period,
    lineId: row.lineId,
    lineId2: row.lineId2,
  }));
  writeFileSync(path.join(RUNS, "facts-gated.json"), JSON.stringify(gated, null, 2));
  const summary = {
    calls: { first: first.rowCount, second: second.rowCount, parseError: [first.parseError, second.parseError] },
    first: { in: left.in, g1: left.g1, droppedG1: left.droppedG1, g5: left.g5, droppedG5: left.droppedG5, g2: left.g2, droppedG2: left.droppedG2 },
    second: { in: right.in, g1: right.g1, droppedG1: right.droppedG1, g5: right.g5, droppedG5: right.droppedG5, g2: right.g2, droppedG2: right.droppedG2 },
    g3: {
      kept: agreement.kept.length,
      reached: agreement.reached,
      rate: agreement.rate,
      differentLine: agreement.differentLine,
      disagreed: agreement.disagreed,
      classes: agreement.disagreed.reduce((counts, row) => {
        counts[row.klass] = (counts[row.klass] || 0) + 1;
        return counts;
      }, {}),
    },
    lookups,
    survivors: agreement.kept.map((row) => ({
      ...row,
      line: lines[Number(String(row.lineId).slice(1)) - 1] || "",
      line2: lines[Number(String(row.lineId2).slice(1)) - 1] || "",
    })),
  };
  writeFileSync(path.join(RUNS, "gate-result.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    first: summary.first,
    second: summary.second,
    kept: summary.g3.kept,
    rate: summary.g3.rate,
    classes: summary.g3.classes,
    differentLine: summary.g3.differentLine.length,
    lookups: lookups.map((item) => `${item.id} ${item.kind}`),
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
