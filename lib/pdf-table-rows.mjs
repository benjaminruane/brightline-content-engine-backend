/**
 * B547. A table row is rebuilt from word positions. A small raised digit
 * next to a figure is a footnote marker and is left off the figure.
 * Prose rows are not rewritten here.
 */

const MARKER_RE = /^(\d{1,3}|[*†‡§⁎*])$/;
const CELL_GAP_PT = 12;

function median(nums) {
  const sorted = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

function gapBetween(prev, next) {
  const width = Number(prev?.width);
  const right = Number(prev?.x) + (Number.isFinite(width) ? width : 0);
  const gap = Number(next?.x) - right;
  return Number.isFinite(gap) ? gap : 0;
}

export function isFootnoteMarker(item, row) {
  const token = String(item?.str || "").trim();
  if (!MARKER_RE.test(token)) return false;
  const body = median((Array.isArray(row) ? row : []).map((other) => Number(other?.fontSize)));
  const size = Number(item?.fontSize);
  if (!(body > 0) || !(size > 0) || size >= body * 0.85) return false;
  return (Array.isArray(row) ? row : []).some((other) => other !== item && /\d/.test(String(other?.str || "")));
}

function isWideSpace(item) {
  return !String(item?.str || "").trim() && Number(item?.width) >= CELL_GAP_PT;
}

function joinCell(items) {
  let out = "";
  let prev = null;
  for (const item of items) {
    const token = String(item?.str || "").trim();
    if (!token) continue;
    if (!out) {
      out = token;
      prev = item;
      continue;
    }
    const tight = prev && gapBetween(prev, item) < 1.5;
    out = tight ? `${out}${token}` : `${out} ${token}`;
    prev = item;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Cells left to right. A wide gap, or a wide space item, starts a new cell. */
export function rebuildTableRow(row) {
  const source = Array.isArray(row) ? row : [];
  const items = source
    .filter((item) => item && (String(item.str || "").trim() || isWideSpace(item)))
    .slice()
    .sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0))
    .filter((item) => !isFootnoteMarker(item, source));
  if (!items.length) return "";
  const cells = [[]];
  for (const item of items) {
    if (isWideSpace(item)) {
      if (cells[cells.length - 1].length) cells.push([]);
      continue;
    }
    const current = cells[cells.length - 1];
    const prev = current[current.length - 1];
    if (prev && gapBetween(prev, item) >= CELL_GAP_PT) cells.push([item]);
    else current.push(item);
  }
  const rendered = cells.map((cell) => joinCell(cell)).filter(Boolean);
  if (rendered.length < 2) return rendered[0] || "";
  return rendered.join(" | ");
}

export function rowLooksTabular(row) {
  const rendered = rebuildTableRow(row);
  if (!rendered.includes(" | ")) return false;
  const cells = rendered.split(" | ");
  const numeric = cells.filter((cell) => /\d/.test(cell)).length;
  return cells.length >= 3 && numeric >= 2;
}

/**
 * Indexes of rows that belong to a detected table. A table is two or more
 * tabular rows in a row. The label row directly above that run is included
 * when it already has more than one cell.
 */
function rowTokens(row) {
  return (Array.isArray(row) ? row : []).map((item) => String(item?.str || "").trim()).filter(Boolean);
}

export function rowIsFootnoteOnly(row) {
  const tokens = rowTokens(row);
  return tokens.length > 0 && tokens.every((token) => MARKER_RE.test(token));
}

function rowIsSpacer(row) {
  const tokens = rowTokens(row);
  return tokens.length === 0 || tokens.every((token) => MARKER_RE.test(token));
}

export function detectTableRowIndexes(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const tabular = list.map((row) => rowLooksTabular(row));
  const picked = tabular.map(() => false);
  let index = 0;
  while (index < list.length) {
    if (rowIsSpacer(list[index]) || !tabular[index]) {
      index += 1;
      continue;
    }
    const members = [index];
    let cursor = index + 1;
    while (cursor < list.length) {
      if (rowIsSpacer(list[cursor])) {
        members.push(cursor);
        cursor += 1;
        continue;
      }
      if (!tabular[cursor]) break;
      members.push(cursor);
      cursor += 1;
    }
    const real = members.filter((at) => tabular[at]);
    if (real.length >= 2) {
      for (const at of members) picked[at] = true;
      let above = index - 1;
      while (above >= 0 && rowIsSpacer(list[above])) above -= 1;
      if (above >= 0 && rebuildTableRow(list[above]).includes(" | ")) picked[above] = true;
    }
    index = cursor;
  }
  return picked;
}

export function lineIsTableRow(line) {
  const text = String(line || "");
  return text.includes(" | ") && /\d/.test(text);
}
