/**
 * B547. A table row is rebuilt from word positions. A small raised digit
 * next to a figure is a footnote marker and is left off the figure.
 * B548. A rebuilt row keeps the column heading on each figure, and a short
 * row label on its own line is attached to the year rows it sits between.
 * Prose rows are not rewritten here.
 */

const MARKER_RE = /^(\d{1,3}|[*†‡§⁎*])$/;
const CELL_GAP_PT = 12;
const HEADER_ALIGN_PT = 18;
const CHART_GLYPH_RE = /[\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2190-\u21FF\u2600-\u26FF\u2700-\u27BF\u2B00-\u2BFF\uE000-\uF8FF\uFFFD\uFFFC]/g;

/** Chart legend boxes and other non-text symbols. Letters, digits, and punctuation stay. */
export function stripChartGlyphs(value) {
  return String(value || "").replace(CHART_GLYPH_RE, "");
}

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
export function rowCells(row) {
  const source = Array.isArray(row) ? row : [];
  const items = source
    .filter((item) => item && (String(item.str || "").trim() || isWideSpace(item)))
    .slice()
    .sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0))
    .filter((item) => !isFootnoteMarker(item, source));
  if (!items.length) return [];
  const groups = [[]];
  for (const item of items) {
    if (isWideSpace(item)) {
      if (groups[groups.length - 1].length) groups.push([]);
      continue;
    }
    const current = groups[groups.length - 1];
    const prev = current[current.length - 1];
    if (prev && gapBetween(prev, item) >= CELL_GAP_PT) groups.push([item]);
    else current.push(item);
  }
  return groups
    .map((group) => ({ text: joinCell(group), x: Number(group[0]?.x) || 0 }))
    .filter((cell) => cell.text);
}

export function rebuildTableRow(row) {
  const rendered = rowCells(row).map((cell) => cell.text);
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
 * A share-class letter on its own line, as in the HPIF monthly table ("A"
 * under the 2025 row). A longer line is prose and still breaks a table run.
 */
export function isLoneRowLabel(row) {
  if (rowLooksTabular(row) || rowIsSpacer(row)) return false;
  const cells = rowCells(row);
  if (cells.length !== 1) return false;
  const text = cells[0].text;
  return /^[A-Za-z]$/.test(text) || /^Class [A-Za-z]$/.test(text);
}

const HEADING_WORD = /^(share|class|return|total|year|ytd|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/i;

/** One anchor per word. Items closer than 1.5pt are one word, so "Y" + "ear" is Year. */
export function wordAnchors(row) {
  const source = Array.isArray(row) ? row : [];
  const items = source
    .filter((item) => item && String(item.str || "").trim() && !isFootnoteMarker(item, source))
    .slice()
    .sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0));
  const anchors = [];
  for (const item of items) {
    const token = String(item.str).trim();
    const prev = anchors[anchors.length - 1];
    if (prev && gapBetween(prev.item, item) < 1.5) {
      prev.text += token;
      prev.item = item;
    } else {
      anchors.push({ text: token, x: Number(item.x) || 0, item });
    }
  }
  return anchors.map(({ text, x }) => ({ text, x }));
}

/** A short row of column titles, including one that sits above or below the month names. */
export function isHeaderFragment(row) {
  if (rowLooksTabular(row) || rowIsSpacer(row) || isLoneRowLabel(row)) return false;
  const words = wordAnchors(row).map((anchor) => anchor.text.replace(/\d{1,3}$/, "")).filter(Boolean);
  if (!words.length || words.length > 6) return false;
  return words.every((word) => HEADING_WORD.test(word));
}

/** Month names and other column titles. A row of figures is not a header. */
export function rowLooksLikeHeader(row) {
  if (rowLooksTabular(row)) return false;
  const months = wordAnchors(row).filter((anchor) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/i.test(anchor.text));
  if (months.length >= 4) return true;
  const cells = rowCells(row);
  if (cells.length < 3) return false;
  const numeric = cells.filter((cell) => /\d/.test(cell.text)).length;
  if (numeric >= 2) return false;
  const words = cells.filter((cell) => /[A-Za-z]/.test(cell.text) && cell.text.length <= 20);
  return words.length >= 3;
}

function nearestHeading(cell, headers) {
  let best = "";
  let bestDist = HEADER_ALIGN_PT;
  for (const header of headers) {
    const dist = Math.abs(header.x - cell.x);
    if (dist <= bestDist) {
      best = header.text;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * One row, with the column heading on each figure.
 * "A | 2025 | May: 2.83% | Jun: 1.95%". A year under a Year heading stays bare.
 * Headings are paired by horizontal position, so a far-right total is not called December.
 */
function asAnchors(header) {
  if (!header) return [];
  if (Array.isArray(header) && header.length && header.every((entry) => entry && typeof entry.text === "string" && entry.str == null)) {
    return header;
  }
  return wordAnchors(header);
}

export function renderHeadedRow(row, headerRow, label) {
  const cells = rowCells(row);
  const headers = asAnchors(headerRow);
  const parts = [];
  for (const cell of cells) {
    const heading = nearestHeading(cell, headers);
    const bare = !heading || /^year$/i.test(heading) || /^\d{4}$/.test(cell.text);
    parts.push(bare ? cell.text : `${heading}: ${cell.text}`);
  }
  if (label && parts[0] !== label) parts.unshift(label);
  if (parts.length < 2) return parts[0] || "";
  return parts.join(" | ");
}

/**
 * Indexes of rows that belong to a detected table. A table is two or more
 * tabular rows in a row. A short row label, or an empty spacer, does not
 * break the run. The column-heading row directly above that run is included.
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
      if (rowIsSpacer(list[cursor]) || isLoneRowLabel(list[cursor])) {
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
      let stepped = 0;
      while (above >= 0 && !tabular[above] && stepped < 6) {
        const row = list[above];
        if (rowIsSpacer(row) || isLoneRowLabel(row) || rowLooksLikeHeader(row) || isHeaderFragment(row)) {
          picked[above] = true;
          above -= 1;
          stepped += 1;
          continue;
        }
        break;
      }
    }
    index = cursor;
  }
  return picked;
}

export function lineIsTableRow(line) {
  const text = String(line || "");
  return text.includes(" | ") && /\d/.test(text);
}

/**
 * The lines to emit for a page of rows. A heading row and a lone row label
 * are folded into the figure rows, so the table is not also printed flat.
 * A row outside the table is left null and the caller keeps the prose line.
 */
export function planTableEmission(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const picked = detectTableRowIndexes(list);
  const lines = list.map(() => null);
  let start = 0;
  while (start < list.length) {
    if (!picked[start]) {
      start += 1;
      continue;
    }
    let end = start;
    while (end < list.length && picked[end]) end += 1;
    const block = [];
    for (let at = start; at < end; at += 1) block.push(at);
    const labelAt = block.filter((at) => isLoneRowLabel(list[at]));
    const dataAt = block.filter((at) => rowLooksTabular(list[at]));
    const headerGroups = [];
    let group = null;
    for (const at of block) {
      const isHead = !rowLooksTabular(list[at]) && (rowLooksLikeHeader(list[at]) || isHeaderFragment(list[at]));
      if (!isHead) {
        if (group) headerGroups.push(group);
        group = null;
        continue;
      }
      if (!group) group = { at, anchors: [] };
      for (const anchor of wordAnchors(list[at])) {
        const bare = anchor.text.replace(/\d{1,3}$/, "");
        group.anchors.push(HEADING_WORD.test(bare) ? { ...anchor, text: bare } : anchor);
      }
    }
    if (group) headerGroups.push(group);
    const anchorsBefore = (at) => {
      let chosen = null;
      for (const candidate of headerGroups) {
        if (candidate.at < at) chosen = candidate;
        else break;
      }
      return chosen ? chosen.anchors : [];
    };
    for (const at of dataAt) {
      let label = "";
      let best = Infinity;
      for (const mark of labelAt) {
        const dist = Math.abs(mark - at);
        if (dist < best && dist <= 3) {
          best = dist;
          label = rowCells(list[mark])[0]?.text || "";
        }
      }
      const anchors = anchorsBefore(at);
      lines[at] = anchors.length
        ? renderHeadedRow(list[at], anchors, label)
        : (label ? `${label} | ${rebuildTableRow(list[at])}` : rebuildTableRow(list[at]));
    }
    start = end;
  }
  return { inTable: picked, lines };
}
