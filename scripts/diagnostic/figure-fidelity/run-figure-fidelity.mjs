#!/usr/bin/env node
/**
 * B326. Do the two PDF extractors agree about numbers on the B163 twenty.
 * Read-only. No model calls. No product-code changes.
 *
 *   node scripts/diagnostic/figure-fidelity/run-figure-fidelity.mjs
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  SUPPORTED_MIME_TYPES,
  extractTextFromSource,
} from "../../../lib/extract-text-from-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const B163 = path.resolve(ROOT, "../delivery-check/b163");
const CORPUS = path.join(B163, "corpus");
const CATALOG = path.join(B163, "catalog.json");
const REVIEWS = path.join(B163, "reviews");
const SWAP_OUT = path.resolve(ROOT, "../extractor-swap/outputs");
const OUT = path.join(ROOT, "outputs");

const PDFJS_OPTS = {
  disableWorker: true,
  isEvalSupported: false,
  useSystemFonts: true,
};

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const MAG = "billion|million|thousand|bn";
const CUR = "EUR|USD|GBP|CHF|SGD|HKD";
const ORD = "st|nd|rd|th";

function collapse(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function digitsOf(raw) {
  const s = String(raw || "").replace(/,/g, "");
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? m[0] : "";
}

function itemRecord(it, styles) {
  const tr = Array.isArray(it?.transform) ? it.transform : [];
  const fontName = typeof it?.fontName === "string" ? it.fontName : null;
  const style = fontName && styles && styles[fontName] ? styles[fontName] : null;
  return {
    str: typeof it?.str === "string" ? it.str : "",
    x: Number(tr[4]),
    y: Number(tr[5]),
    width: Number.isFinite(Number(it?.width)) ? Number(it.width) : null,
    height: Number.isFinite(Number(it?.height)) ? Number(it.height) : null,
    fontName,
    fontFamily: style?.fontFamily || null,
    fontSize: Number.isFinite(Number(tr[0])) ? Number(tr[0]) : null,
  };
}

async function loadPdfjsPages(buf) {
  const doc = await getDocument({ data: new Uint8Array(buf), ...PDFJS_OPTS }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const styles = tc.styles && typeof tc.styles === "object" ? tc.styles : {};
    const items = (Array.isArray(tc.items) ? tc.items : []).map((it) => itemRecord(it, styles));
    pages.push({ page: p, items });
  }
  if (typeof doc.destroy === "function") {
    try {
      await doc.destroy();
    } catch {
      /* ignore */
    }
  }
  return pages;
}

function addMatch(out, kind, m, text) {
  const start = m.index;
  const end = start + m[0].length;
  for (const prev of out) {
    if (start < prev.end && end > prev.start) return;
  }
  const raw = m[0];
  const left = text.slice(Math.max(0, start - 80), start);
  const right = text.slice(end, Math.min(text.length, end + 80));
  const leftToks = collapse(left).split(" ").filter(Boolean).slice(-5);
  const rightToks = collapse(right).split(" ").filter(Boolean).slice(0, 5);
  out.push({
    kind,
    raw,
    digits: digitsOf(raw),
    start,
    end,
    left: collapse(left).slice(-60),
    right: collapse(right).slice(0, 60),
    leftToks,
    rightToks,
    key: `${leftToks.join(" ")} :: ${rightToks.join(" ")}`,
  });
}

function inventory(text) {
  const src = String(text || "");
  const found = [];
  const specs = [
    ["date", new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:${ORD})?,?\\s+\\d{4}\\b|\\b\\d{1,2}(?:${ORD})?\\s+(?:${MONTHS})\\s+\\d{4}\\b`, "gi")],
    ["currency_mag", new RegExp(`(?:${CUR}|\\$|£|€)\\s*\\d[\\d,]*(?:\\.\\d+)?\\s*(?:${MAG})\\b`, "gi")],
    ["percent", /\b\d[\d,]*(?:\.\d+)?\s*(?:%|per\s+cent|percent)\b/gi],
    ["ordinal", new RegExp(`\\b\\d+(?:${ORD})\\b`, "gi")],
    ["ordinal_split", new RegExp(`\\b\\d+\\s+(?:${ORD})\\b`, "gi")],
    ["magnitude", new RegExp(`\\b\\d[\\d,]*(?:\\.\\d+)?\\s*(?:${MAG})\\b`, "gi")],
    ["currency", new RegExp(`(?:${CUR}|\\$|£|€)\\s*\\d[\\d,]*(?:\\.\\d+)?`, "gi")],
    ["year", /\b(?:19|20)\d{2}\b/g],
    ["bare", /\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b/g],
  ];
  for (const [kind, re] of specs) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) addMatch(found, kind, m, src);
  }
  found.sort((a, b) => a.start - b.start || b.raw.length - a.raw.length);
  const kept = [];
  for (const row of found) {
    if (kept.some((p) => row.start < p.end && row.end > p.start)) continue;
    kept.push(row);
  }
  return kept;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let n = 0;
  for (const x of A) if (B.has(x)) n += 1;
  return n / (A.size + B.size - n);
}

function digitGained(a, b) {
  const da = a.digits;
  const db = b.digits;
  if (!da || !db || da === db) return false;
  if (da.length === db.length + 1 && (da.startsWith(db) || da.endsWith(db))) return true;
  if (db.length === da.length + 1 && (db.startsWith(da) || db.endsWith(da))) return true;
  return false;
}

function ordinalPair(a, b) {
  const ord = new Set(["ordinal", "ordinal_split"]);
  if (a.digits !== b.digits || !a.digits) return false;
  return ord.has(a.kind) !== ord.has(b.kind) || (ord.has(a.kind) && ord.has(b.kind) && collapse(a.raw) !== collapse(b.raw));
}

function sameFigure(a, b) {
  return collapse(a.raw) === collapse(b.raw) && a.digits === b.digits;
}

function classifyPair(a, b) {
  if (sameFigure(a, b)) return "SAME";
  if (digitGained(a, b)) return "DIGIT_GAINED";
  if (ordinalPair(a, b) || (a.digits === b.digits && /(?:st|nd|rd|th)/i.test(a.raw + b.raw) && collapse(a.raw) !== collapse(b.raw))) {
    return "ORDINAL_LOST";
  }
  if (a.digits && b.digits && a.digits !== b.digits) return "VALUE_CHANGED";
  if (collapse(a.raw) !== collapse(b.raw)) return "VALUE_CHANGED";
  return "SAME";
}

function pairInventories(oldFigs, newFigs) {
  const usedNew = new Set();
  const rows = [];
  for (const a of oldFigs) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < newFigs.length; i += 1) {
      if (usedNew.has(i)) continue;
      const b = newFigs[i];
      let score = 0;
      if (a.key && a.key === b.key) score += 5;
      const side = jaccard([...a.leftToks, ...a.rightToks], [...b.leftToks, ...b.rightToks]);
      score += side;
      if (a.digits && a.digits === b.digits) score += 0.4;
      if (digitGained(a, b)) score += 0.8;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const b = best >= 0 ? newFigs[best] : null;
    const side = b ? jaccard([...a.leftToks, ...a.rightToks], [...b.leftToks, ...b.rightToks]) : 0;
    const keyed = b && a.key && a.key === b.key;
    if (!b || (bestScore < 1.15 && !keyed && side < 0.5 && !digitGained(a, b))) {
      rows.push({ cls: "PRESENT_ABSENT", in: "officeparser", officeparser: a, direct: null });
      continue;
    }
    usedNew.add(best);
    rows.push({ cls: classifyPair(a, b), in: "both", officeparser: a, direct: b });
  }
  for (let i = 0; i < newFigs.length; i += 1) {
    if (usedNew.has(i)) continue;
    rows.push({ cls: "PRESENT_ABSENT", in: "direct", officeparser: null, direct: newFigs[i] });
  }
  return rows;
}

function nearbyItems(pages, digits, contextLeft, contextRight) {
  if (!digits) return [];
  const needle = digits.replace(/\./g, "\\.");
  const hits = [];
  for (const pg of pages) {
    for (let i = 0; i < pg.items.length; i += 1) {
      const it = pg.items[i];
      if (!it.str || !it.str.includes(digits.split(".")[0])) continue;
      const window = pg.items
        .slice(Math.max(0, i - 6), Math.min(pg.items.length, i + 7))
        .map((x) => x.str)
        .join(" ");
      const ctx = collapse(`${contextLeft} ${contextRight}`).slice(0, 80);
      hits.push({
        page: pg.page,
        index: i,
        window,
        ctxScore: ctx && collapse(window).includes(digits) ? 1 : 0,
        items: pg.items.slice(Math.max(0, i - 6), Math.min(pg.items.length, i + 7)).map((x) => ({
          str: x.str,
          x: Number.isFinite(x.x) ? Number(x.x.toFixed(2)) : null,
          y: Number.isFinite(x.y) ? Number(x.y.toFixed(2)) : null,
          width: x.width == null ? null : Number(Number(x.width).toFixed(2)),
          fontSize: x.fontSize == null ? null : Number(Number(x.fontSize).toFixed(2)),
          fontName: x.fontName,
        })),
      });
    }
  }
  hits.sort((a, b) => b.ctxScore - a.ctxScore || a.page - b.page);
  const uniq = [];
  const seen = new Set();
  for (const h of hits) {
    const k = `${h.page}:${h.index}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(h);
    if (uniq.length >= 3) break;
  }
  void needle;
  return uniq;
}

function superscriptHint(itemWindows) {
  const notes = [];
  for (const win of itemWindows) {
    const sizes = win.items.map((it) => it.fontSize).filter((n) => Number.isFinite(n) && n > 0);
    if (sizes.length < 2) continue;
    const median = sizes.slice().sort((a, b) => a - b)[Math.floor(sizes.length / 2)];
    const ys = win.items.map((it) => it.y).filter((n) => Number.isFinite(n));
    const yMed = ys.length ? ys.slice().sort((a, b) => a - b)[Math.floor(ys.length / 2)] : null;
    for (const it of win.items) {
      const small = Number.isFinite(it.fontSize) && Number.isFinite(median) && it.fontSize < median * 0.85;
      const raised = Number.isFinite(it.y) && Number.isFinite(yMed) && it.y > yMed + 1.5;
      if ((small || raised) && /\d/.test(it.str) && it.str.trim().length <= 3) {
        notes.push({
          page: win.page,
          str: it.str,
          fontSize: it.fontSize,
          medianFont: Number(median.toFixed(2)),
          y: it.y,
          medianY: yMed == null ? null : Number(yMed.toFixed(2)),
          small,
          raised,
        });
      }
    }
  }
  return notes;
}

function figureInPassages(fig, passages) {
  if (!fig) return false;
  const token = collapse(fig.raw);
  if (!token) return false;
  const ctx = collapse(`${fig.left} ${fig.raw} ${fig.right}`);
  for (const p of passages) {
    const hay = collapse(p);
    if (!hay) continue;
    if (hay.includes(token) && (hay.includes(collapse(fig.left).slice(-20)) || hay.includes(collapse(fig.right).slice(0, 20)) || hay.includes(ctx.slice(0, 40)))) {
      return true;
    }
    if (hay.includes(token) && token.length >= 4) return true;
  }
  return false;
}

async function loadRecordedPassages() {
  const byDoc = new Map();
  const add = (id, text) => {
    if (!id || typeof text !== "string" || !text.trim()) return;
    const list = byDoc.get(id) || [];
    list.push(text);
    byDoc.set(id, list);
  };
  let names = [];
  try {
    names = await readdir(SWAP_OUT);
  } catch {
    names = [];
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const rec = JSON.parse(await readFile(path.join(SWAP_OUT, name), "utf8"));
    const id = rec.id || name.replace(/-.*$/, "");
    add(id, rec.newVerdict?.quote);
    add(id, rec.committedVerdict?.quote);
    add(id, rec.supportSpan0);
    for (const row of Array.isArray(rec.killCards) ? rec.killCards : []) add(id, row?.quote);
  }
  let reviewNames = [];
  try {
    reviewNames = (await readdir(REVIEWS)).filter((n) => /^d\d+-review\.json$/.test(n));
  } catch {
    reviewNames = [];
  }
  for (const name of reviewNames) {
    const rec = JSON.parse(await readFile(path.join(REVIEWS, name), "utf8"));
    const id = name.replace(/-review\.json$/, "");
    for (const stmt of Array.isArray(rec.statements) ? rec.statements : []) {
      const card = stmt?.qcCard;
      if (!card) continue;
      if (typeof card.primaryExcerpt === "string") add(id, card.primaryExcerpt);
      if (typeof card.conflictExcerpt?.passage === "string") add(id, card.conflictExcerpt.passage);
      for (const span of Array.isArray(card.supportSpans) ? card.supportSpans : []) {
        if (typeof span?.passage === "string") add(id, span.passage);
      }
    }
  }
  return byDoc;
}

function emptyCounts() {
  return { SAME: 0, VALUE_CHANGED: 0, DIGIT_GAINED: 0, ORDINAL_LOST: 0, PRESENT_ABSENT: 0 };
}

async function extractEngine(buf, engine) {
  const t0 = Date.now();
  const extracted = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF, { pdfEngine: engine });
  const wallMs = Date.now() - t0;
  const text = typeof extracted?.text === "string" ? extracted.text : "";
  const method = extracted?.extraction?.method || null;
  return { text, wallMs, method, charCount: text.length };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
  const docs = Array.isArray(catalog.documents) ? catalog.documents : [];
  if (docs.length !== 20) {
    throw new Error(`catalog has ${docs.length} documents, expected 20`);
  }
  const passages = await loadRecordedPassages();
  const perDoc = [];
  const s3 = [];
  let oldOrdinals = 0;
  let newOrdinals = 0;
  let oldMs = 0;
  let newMs = 0;
  let itemMs = 0;
  const verdictTally = { officeparser_matches_body: 0, direct_matches_body: 0, inconclusive: 0, superscript_seen: 0 };

  for (const doc of docs) {
    const pdfPath = path.join(CORPUS, doc.filename);
    let buf;
    try {
      buf = await readFile(pdfPath);
    } catch {
      throw new Error(`missing corpus PDF ${pdfPath}. Re-fetch from catalog. Do not substitute.`);
    }
    process.stderr.write(`extract officeparser ${doc.id} ${doc.filename}\n`);
    const oldEx = await extractEngine(buf, "officeparser");
    process.stderr.write(`  officeparser ${oldEx.wallMs}ms chars=${oldEx.charCount} method=${oldEx.method}\n`);
    process.stderr.write(`extract direct ${doc.id}\n`);
    const newEx = await extractEngine(buf, "direct");
    process.stderr.write(`  direct ${newEx.wallMs}ms chars=${newEx.charCount} method=${newEx.method}\n`);
    const tItems = Date.now();
    const pages = await loadPdfjsPages(buf);
    itemMs += Date.now() - tItems;
    oldMs += oldEx.wallMs;
    newMs += newEx.wallMs;
    await writeFile(path.join(OUT, `${doc.id}-officeparser.txt`), oldEx.text, "utf8");
    await writeFile(path.join(OUT, `${doc.id}-direct.txt`), newEx.text, "utf8");

    const oldFigs = inventory(oldEx.text);
    const newFigs = inventory(newEx.text);
    oldOrdinals += oldFigs.filter((f) => f.kind === "ordinal" || f.kind === "ordinal_split").length;
    newOrdinals += newFigs.filter((f) => f.kind === "ordinal" || f.kind === "ordinal_split").length;
    const paired = pairInventories(oldFigs, newFigs);
    const counts = emptyCounts();
    const docPassages = passages.get(doc.id) || [];
    for (const row of paired) {
      counts[row.cls] = (counts[row.cls] || 0) + 1;
      if (row.cls !== "VALUE_CHANGED" && row.cls !== "DIGIT_GAINED") continue;
      const digits = row.officeparser?.digits || row.direct?.digits || "";
      const items = nearbyItems(
        pages,
        digits,
        row.officeparser?.left || row.direct?.left || "",
        row.officeparser?.right || row.direct?.right || ""
      );
      const superHints = superscriptHint(items);
      if (superHints.length) verdictTally.superscript_seen += 1;
      let bodyCall = "inconclusive";
      if (row.cls === "DIGIT_GAINED" && superHints.length) {
        const glued = (row.officeparser?.digits || "").length > (row.direct?.digits || "").length ? "officeparser" : "direct";
        bodyCall = glued === "officeparser" ? "direct_matches_body" : "officeparser_matches_body";
      } else if (row.cls === "VALUE_CHANGED" && superHints.length) {
        const longer = (row.officeparser?.digits || "").length >= (row.direct?.digits || "").length ? "officeparser" : "direct";
        bodyCall = longer === "officeparser" ? "direct_matches_body" : "officeparser_matches_body";
      }
      verdictTally[bodyCall] = (verdictTally[bodyCall] || 0) + 1;
      const seen =
        figureInPassages(row.officeparser, docPassages) || figureInPassages(row.direct, docPassages);
      s3.push({
        id: doc.id,
        filename: doc.filename,
        cls: row.cls,
        officeparser: row.officeparser
          ? { raw: row.officeparser.raw, kind: row.officeparser.kind, left: row.officeparser.left, right: row.officeparser.right }
          : null,
        direct: row.direct
          ? { raw: row.direct.raw, kind: row.direct.kind, left: row.direct.left, right: row.direct.right }
          : null,
        inRecordedPassage: seen,
        superscripts: superHints,
        rawItems: items,
        bodyCall,
      });
    }
    perDoc.push({
      id: doc.id,
      filename: doc.filename,
      oldMs: oldEx.wallMs,
      newMs: newEx.wallMs,
      oldChars: oldEx.charCount,
      newChars: newEx.charCount,
      oldMethod: oldEx.method,
      newMethod: newEx.method,
      oldFigures: oldFigs.length,
      newFigures: newFigs.length,
      counts,
    });
  }

  const totals = emptyCounts();
  for (const row of perDoc) {
    for (const k of Object.keys(totals)) totals[k] += row.counts[k] || 0;
  }
  const payload = {
    id: "B326",
    ranAt: new Date().toISOString(),
    oldMs,
    newMs,
    itemMs,
    totals,
    oldOrdinals,
    newOrdinals,
    verdictTally,
    perDoc,
    s3,
  };
  await writeFile(path.join(OUT, "summary.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(
    JSON.stringify(
      {
        docs: perDoc.length,
        oldMs,
        newMs,
        totals,
        oldOrdinals,
        newOrdinals,
        s3: s3.length,
        valueChanged: s3.filter((r) => r.cls === "VALUE_CHANGED").length,
        digitGained: s3.filter((r) => r.cls === "DIGIT_GAINED").length,
        inPassage: s3.filter((r) => r.inRecordedPassage).length,
        verdictTally,
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
