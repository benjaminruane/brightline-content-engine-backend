/**
 * B321. Read PDF text from the pdfjs-dist build officeparser already ships.
 * Assembly is B319 arm C: per page, group items by rounded y, then sort by x.
 * B382. A persistent vertical gap splits that page into columns. Each column
 * is assembled with arm C, then the columns are concatenated left to right.
 * A page with no such gap takes the arm C path unchanged.
 * B327. Raised, smaller items are reattached to the body line they sit on.
 * Scanned status is not stamped here. extractTextFromSource runs the same length test.
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const PDFJS_OPTS = {
  disableWorker: true,
  isEvalSupported: false,
  useSystemFonts: true,
};

/**
 * Node 22 still has no DOMMatrix / ImageData / Path2D. officeparser polyfills the
 * first two before it calls getDocument (node_modules/officeparser/dist/utils/envUtils.js).
 * getTextContent uses the matrix for item transforms. It does not render, so canvas
 * is not loaded. Path2D is stubbed in case a font path touches it.
 */
function ensurePdfjsPolyfills() {
  if (typeof globalThis.DOMMatrix !== "function") {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        if (Array.isArray(init) && init.length >= 6) {
          this.a = init[0];
          this.b = init[1];
          this.c = init[2];
          this.d = init[3];
          this.e = init[4];
          this.f = init[5];
        } else if (init && typeof init === "object") {
          this.a = init.a;
          this.b = init.b;
          this.c = init.c;
          this.d = init.d;
          this.e = init.e;
          this.f = init.f;
        } else {
          this.a = this.d = 1;
          this.b = this.c = this.e = this.f = 0;
        }
      }
      get m11() {
        return this.a;
      }
      get m12() {
        return this.b;
      }
      get m21() {
        return this.c;
      }
      get m22() {
        return this.d;
      }
      get m41() {
        return this.e;
      }
      get m42() {
        return this.f;
      }
      multiply(other) {
        return new DOMMatrix([
          this.a * other.a + this.c * other.b,
          this.b * other.a + this.d * other.b,
          this.a * other.c + this.c * other.d,
          this.b * other.c + this.d * other.d,
          this.a * other.e + this.c * other.f + this.e,
          this.b * other.e + this.d * other.f + this.f,
        ]);
      }
      inverse() {
        const det = this.a * this.d - this.b * this.c;
        if (det === 0) return new DOMMatrix();
        return new DOMMatrix([
          this.d / det,
          -this.b / det,
          -this.c / det,
          this.a / det,
          (this.c * this.f - this.d * this.e) / det,
          (this.b * this.e - this.a * this.f) / det,
        ]);
      }
      transformPoint(point) {
        const x = point?.x ?? 0;
        const y = point?.y ?? 0;
        return {
          x: x * this.a + y * this.c + this.e,
          y: x * this.b + y * this.d + this.f,
        };
      }
    };
  }
  if (typeof globalThis.ImageData !== "function") {
    globalThis.ImageData = class ImageData {
      constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };
  }
  if (typeof globalThis.Path2D !== "function") {
    globalThis.Path2D = class Path2D {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
    };
  }
}

/**
 * B327. AWAITING BEN'S RULING.
 * How a recognised footnote marker is emitted once it has been reattached
 * to the body line. One place. "space" keeps the marker as its own token
 * (`billion 1`). "drop" removes it. "glue" concatenates (`billion1`).
 * Preferred: space. Drop quietly loses content. Glue is the B326 danger.
 */
export const RAISED_MARKER_TREATMENT = "space";

const ORDINAL_RE = /^(st|nd|rd|th)$/i;
const MARKER_RE = /^(\d{1,3}|[*†‡§⁎*])$/;
const TIGHT_PUNCT_RE = /^[.,;:)\]]/;
const TRADE_RE = /^[™®©°]$/;

export function isRaisedCharactersEnabled(options = {}) {
  if (options.raisedCharacters === false) return false;
  const v = typeof process.env.PDF_RAISED_CHARACTERS === "string" ? process.env.PDF_RAISED_CHARACTERS.trim() : "";
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

function itemRecord(it) {
  const tr = Array.isArray(it?.transform) ? it.transform : [];
  const sx = Number(tr[0]);
  return {
    str: typeof it?.str === "string" ? it.str : "",
    x: Number(tr[4]),
    y: Number(tr[5]),
    width: Number.isFinite(Number(it?.width)) ? Number(it.width) : 0,
    fontSize: Number.isFinite(sx) ? Math.abs(sx) : 0,
  };
}

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  return a[Math.floor(a.length / 2)];
}

function bandStats(row) {
  const ys = [];
  const sizes = [];
  let maxLen = 0;
  for (const it of row) {
    if (Number.isFinite(it.y)) ys.push(it.y);
    if (it.fontSize > 0) sizes.push(it.fontSize);
    const n = it.str.trim().length;
    if (n > maxLen) maxLen = n;
  }
  return { anchorY: median(ys), med: median(sizes), maxLen };
}

function xAdjacent(it, row, bodyFont) {
  const gapMax = Math.max(bodyFont * 1.5, 8);
  const itRight = it.x + (it.width || 0);
  for (const other of row) {
    const left = other.x;
    const right = other.x + (other.width || 0);
    const after = it.x - right;
    const before = left - itRight;
    if (after >= -1 && after <= gapMax) return true;
    if (before >= -1 && before <= gapMax) return true;
  }
  return false;
}

function mergeCloseBands(bands, maxDy = 1.25) {
  const keys = [...bands.keys()].sort((a, b) => b - a);
  for (let i = 0; i < keys.length; i += 1) {
    const a = bands.get(keys[i]);
    if (!a?.length) continue;
    const ya = median(a.map((x) => x.y));
    for (let j = i + 1; j < keys.length; j += 1) {
      const b = bands.get(keys[j]);
      if (!b?.length) continue;
      const yb = median(b.map((x) => x.y));
      if (Math.abs(ya - yb) <= maxDy) {
        a.push(...b);
        b.length = 0;
      }
    }
  }
}

function clusterByRoundedY(items) {
  const bands = new Map();
  for (const it of items) {
    if (!it.str) continue;
    const y = Number.isFinite(it.y) ? it.y : 0;
    const key = Math.round(y);
    const row = bands.get(key) || [];
    row.push(it);
    bands.set(key, row);
  }
  return bands;
}

function reattachRaised(bands) {
  const keys = [...bands.keys()];
  const stats = new Map(keys.map((k) => [k, bandStats(bands.get(k))]));
  const moves = [];
  for (const k of keys) {
    const row = bands.get(k);
    for (const it of row) {
      const token = it.str.trim();
      if (token.length === 0 || token.length > 4) continue;
      if (!(it.fontSize > 0)) continue;
      let best = null;
      for (const bk of keys) {
        if (bk === k) continue;
        const st = stats.get(bk);
        const target = bands.get(bk);
        if (!st || !target?.length || !(st.med > 0)) continue;
        if (st.maxLen < 2) continue;
        const dy = Math.abs(it.y - st.anchorY);
        if (dy < 1.0 || dy > st.med * 0.65) continue;
        if (it.fontSize >= st.med * 0.85) continue;
        if (!xAdjacent(it, target, st.med)) continue;
        const afterDigit =
          ORDINAL_RE.test(token) &&
          target.some((other) => {
            const after = it.x - (other.x + (other.width || 0));
            return after >= -1 && after <= Math.max(st.med * 1.5, 8) && /\d\s*$/.test(other.str);
          });
        const dyScore = afterDigit ? dy - 100 : dy;
        if (!best || dyScore < best.dy) best = { bk, dy: dyScore };
      }
      if (best) moves.push({ it, from: k, to: best.bk });
    }
  }
  for (const m of moves) {
    const from = bands.get(m.from);
    if (!from) continue;
    const idx = from.indexOf(m.it);
    if (idx >= 0) from.splice(idx, 1);
    const to = bands.get(m.to);
    if (to) to.push(m.it);
  }
}

function joinLine(row, markerTreatment) {
  const parts = row.map((it) => it.str).filter((s) => s);
  if (!parts.length) return "";
  let out = parts[0];
  for (let i = 1; i < parts.length; i += 1) {
    const token = parts[i];
    const trimmed = token.trim();
    if (!trimmed) {
      if (!/\s$/.test(out)) out += token;
      continue;
    }
    const prevTrim = out.trimEnd();
    const ordinalJoin = ORDINAL_RE.test(trimmed) && /\d$/.test(prevTrim);
    const punctAfterOrdinal = TIGHT_PUNCT_RE.test(trimmed) && /(?:st|nd|rd|th)$/i.test(prevTrim);
    const tradeJoin = TRADE_RE.test(trimmed);
    const marker = MARKER_RE.test(trimmed);
    if (ordinalJoin || punctAfterOrdinal || tradeJoin) {
      out = prevTrim + trimmed;
      continue;
    }
    if (marker && markerTreatment === "drop") continue;
    if (marker && markerTreatment === "glue") {
      out = prevTrim + trimmed;
      continue;
    }
    out = `${out} ${token}`;
  }
  return out;
}

/**
 * B382. A gutter is an x-run at least 12pt wide that at most 6 y-bands touch,
 * with text on both sides (at least 6 bands within 72pt of each edge).
 * Word spaces are narrower than 12pt and do not line up down the page, so a
 * single column has no gutter. A table whose cells leave a gap the rest of
 * the page also covers does not open a gutter; a gap that stays empty down
 * the page does.
 */
const COLUMN_GAP_MIN_PT = 12;
const COLUMN_GAP_MAX_BANDS = 6;
const COLUMN_SIDE_MIN_BANDS = 6;
const COLUMN_SHOULDER_PT = 72;

function assembleBands(items, options = {}) {
  const bands = clusterByRoundedY(items);
  const raisedOn = isRaisedCharactersEnabled(options);
  if (raisedOn) {
    mergeCloseBands(bands);
    reattachRaised(bands);
  }
  const yKeys = [...bands.keys()].sort((a, b) => b - a);
  const lines = [];
  for (const y of yKeys) {
    const row = bands.get(y);
    if (!row?.length) continue;
    row.sort((a, b) => (a.x || 0) - (b.x || 0));
    if (raisedOn) lines.push(joinLine(row, RAISED_MARKER_TREATMENT));
    else lines.push(row.map((it) => it.str).join(" "));
  }
  return lines.join("\n");
}

/**
 * Column geometry for one page of item records (`str`, `x`, `y`, `width`).
 * `gutters` is empty on a single-column page. `crossBands` is how many
 * rounded-y bands hold items from more than one column.
 * @param {Array<{ str?: string, x?: number, y?: number, width?: number }>} items
 */
export function pageColumnLayout(items) {
  const list = Array.isArray(items) ? items : [];
  const bands = new Map();
  let minX = Infinity;
  let maxX = -Infinity;
  for (const it of list) {
    if (!it?.str || !String(it.str).trim()) continue;
    const x = Number(it.x);
    const y = Number(it.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const width = Number(it.width);
    const right = x + (Number.isFinite(width) && width > 0 ? width : 0);
    if (x < minX) minX = x;
    if (right > maxX) maxX = right;
    const key = Math.round(y);
    const row = bands.get(key);
    const seg = { x, right };
    if (row) row.push(seg);
    else bands.set(key, [seg]);
  }
  const bandCount = bands.size;
  const span = maxX - minX;
  const base = {
    minX: Number.isFinite(minX) ? minX : null,
    maxX: Number.isFinite(maxX) ? maxX : null,
    bandCount,
    gutters: [],
    crossBands: 0,
  };
  if (!bandCount || !(span > 0) || bandCount < COLUMN_SIDE_MIN_BANDS) return base;

  const bins = Math.ceil(span);
  const cover = new Uint16Array(bins);
  for (const row of bands.values()) {
    const seen = new Uint8Array(bins);
    for (const seg of row) {
      let a = Math.floor(seg.x - minX);
      let b = Math.floor(seg.right - minX);
      if (a < 0) a = 0;
      if (b >= bins) b = bins - 1;
      if (b < a) continue;
      for (let i = a; i <= b; i += 1) seen[i] = 1;
    }
    for (let i = 0; i < bins; i += 1) cover[i] += seen[i];
  }

  const gutters = [];
  let run = -1;
  for (let i = 0; i <= bins; i += 1) {
    const low = i < bins && cover[i] <= COLUMN_GAP_MAX_BANDS;
    if (low && run < 0) run = i;
    if (!low && run >= 0) {
      const width = i - run;
      if (width >= COLUMN_GAP_MIN_PT) {
        const leftFrom = Math.max(0, run - COLUMN_SHOULDER_PT);
        const rightTo = Math.min(bins, i + COLUMN_SHOULDER_PT);
        let leftMax = 0;
        let rightMax = 0;
        for (let j = leftFrom; j < run; j += 1) if (cover[j] > leftMax) leftMax = cover[j];
        for (let j = i; j < rightTo; j += 1) if (cover[j] > rightMax) rightMax = cover[j];
        if (leftMax >= COLUMN_SIDE_MIN_BANDS && rightMax >= COLUMN_SIDE_MIN_BANDS) {
          gutters.push({ a: minX + run, b: minX + i });
        }
      }
      run = -1;
    }
  }
  if (!gutters.length) return base;

  let crossBands = 0;
  for (const row of bands.values()) {
    const cols = new Set();
    for (const seg of row) {
      const mid = seg.x + (seg.right - seg.x) / 2;
      cols.add(columnIndex(mid, gutters));
    }
    if (cols.size > 1) crossBands += 1;
  }
  return { ...base, gutters, crossBands };
}

function columnIndex(mid, gutters) {
  if (!Number.isFinite(mid)) return 0;
  let col = 0;
  for (const g of gutters) {
    if (mid < g.a) return col;
    if (mid <= g.b) return mid - g.a <= g.b - mid ? col : col + 1;
    col += 1;
  }
  return col;
}

function columnOf(it, gutters) {
  const x = Number(it?.x);
  const width = Number(it?.width);
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const mid = Number.isFinite(x) ? x + w / 2 : Number.NaN;
  return columnIndex(mid, gutters);
}

export function itemsFromPdfjsTextContent(tcItems) {
  return (Array.isArray(tcItems) ? tcItems : []).map(itemRecord);
}

function pageTextArmC(items, options = {}) {
  const layout = pageColumnLayout(items);
  if (!layout.gutters.length) return assembleBands(items, options);
  const groups = Array.from({ length: layout.gutters.length + 1 }, () => []);
  for (const it of items) groups[columnOf(it, layout.gutters)].push(it);
  const parts = [];
  for (const group of groups) {
    if (!group.length) continue;
    const text = assembleBands(group, options);
    if (text) parts.push(text);
  }
  return parts.join("\n");
}

/** B382. Page text from item records. Single-column input is arm C. */
export function assemblePdfPageItems(items, options = {}) {
  return pageTextArmC(items, options);
}

/**
 * @param {Buffer|Uint8Array} fileBuffer
 * @param {{ timeoutMs?: number, raisedCharacters?: boolean }} [options]
 * @returns {Promise<{ text: string, pages: Array<{ page: number, text: string }>, textConvertMs: number }>}
 */
export async function extractPdfDirect(fileBuffer, options = {}) {
  ensurePdfjsPolyfills();
  const timeoutMs = options.timeoutMs;
  const t0 = Date.now();

  const run = async () => {
    // pdfjs rejects Node Buffer even though Buffer extends Uint8Array.
    const data = new Uint8Array(fileBuffer);
    const doc = await getDocument({ data, ...PDFJS_OPTS }).promise;
    const pages = [];
    const parts = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = (Array.isArray(tc.items) ? tc.items : []).map(itemRecord);
      const text = pageTextArmC(items, options);
      pages.push({ page: p, text });
      parts.push(text);
      parts.push("");
    }
    if (typeof doc.destroy === "function") {
      try {
        await doc.destroy();
      } catch (_) {
        /* ignore */
      }
    }
    const text = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return { text, pages };
  };

  try {
    const result =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? await Promise.race([
            run(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("extraction_timeout")), timeoutMs)
            ),
          ])
        : await run();
    const textConvertMs = Date.now() - t0;
    return { text: result.text, pages: result.pages, textConvertMs };
  } catch (e) {
    const textConvertMs = Date.now() - t0;
    if (e?.message === "extraction_timeout") {
      const err = new Error("extraction_timeout");
      err.textConvertMs = textConvertMs;
      err.chunkConvertMs = 0;
      throw err;
    }
    throw e;
  }
}
