/**
 * B321. Read PDF text from the pdfjs-dist build officeparser already ships.
 * Assembly is B319 arm C: per page, group items by rounded y, then sort by x.
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

function itemRecord(it) {
  const tr = Array.isArray(it?.transform) ? it.transform : [];
  return {
    str: typeof it?.str === "string" ? it.str : "",
    x: Number(tr[4]),
    y: Number(tr[5]),
  };
}

function pageTextArmC(items) {
  const bands = new Map();
  for (const it of items) {
    if (!it.str) continue;
    const y = Number.isFinite(it.y) ? it.y : 0;
    const key = Math.round(y);
    const row = bands.get(key) || [];
    row.push(it);
    bands.set(key, row);
  }
  const yKeys = [...bands.keys()].sort((a, b) => b - a);
  const lines = [];
  for (const y of yKeys) {
    const row = bands.get(y).slice().sort((a, b) => (a.x || 0) - (b.x || 0));
    lines.push(row.map((it) => it.str).join(" "));
  }
  return lines.join("\n");
}

/**
 * @param {Buffer|Uint8Array} fileBuffer
 * @param {{ timeoutMs?: number }} [options]
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
      const text = pageTextArmC(items);
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
