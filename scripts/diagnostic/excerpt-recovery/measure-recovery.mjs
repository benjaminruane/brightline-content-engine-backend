#!/usr/bin/env node
/**
 * B325. Replay recorded pointers through recoverExcerptFromSource. No model calls.
 *
 *   node scripts/diagnostic/excerpt-recovery/measure-recovery.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SIMILARITY_FLOOR,
  recoverExcerptFromSource,
} from "../../../lib/qc/excerpt-from-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const GATE7 = path.join(ROOT, "scripts/diagnostic/extractor-swap/outputs");
const BAKEOFF = path.join(ROOT, "scripts/diagnostic/extractor-bakeoff/outputs");
const REVIEWS = path.join(ROOT, "scripts/diagnostic/delivery-check/b163/reviews");
const OUT_JSON = path.join(ROOT, "scripts/diagnostic/excerpt-recovery/measure-recovery.json");

function exactSubstring(source, pointer) {
  const p = String(pointer || "");
  const s = String(source || "");
  if (!p || !s) return false;
  return s.includes(p);
}

function collectPointersFromCard(card, sources, origin) {
  const rows = [];
  const push = (pointer, sourceText, kind) => {
    const p = typeof pointer === "string" ? pointer.trim() : "";
    if (!p) return;
    rows.push({ origin, kind, pointer: p, sourceText: typeof sourceText === "string" ? sourceText : "" });
  };
  const srcList = Array.isArray(sources) ? sources : [];
  const sourceByIndex = (idx) => {
    const row = srcList[idx];
    return typeof row?.text === "string" ? row.text : "";
  };
  const sourceByLabel = (label) => {
    const want = String(label || "").trim();
    if (!want) return "";
    const hit = srcList.find((row) => String(row?.label || "").trim() === want);
    return typeof hit?.text === "string" ? hit.text : sourceByIndex(0);
  };

  if (typeof card?.primaryExcerpt === "string" && card.primaryExcerpt.trim()) {
    push(card.primaryExcerpt, sourceByLabel(card.primaryRefTitle), "primaryExcerpt");
  }
  const conflict = card?.conflictExcerpt;
  if (conflict && typeof conflict.passage === "string" && conflict.passage.trim()) {
    push(conflict.passage, sourceByLabel(conflict.sourceLabel), "conflictExcerpt");
  }
  const spans = Array.isArray(card?.supportSpans) ? card.supportSpans : [];
  for (const [i, span] of spans.entries()) {
    if (typeof span?.passage !== "string" || !span.passage.trim()) continue;
    push(span.passage, sourceByIndex(span.sourceRefId), `supportSpan[${i}]`);
  }
  return rows;
}

async function loadGate7Cases() {
  const names = (await readdir(GATE7)).filter((n) => /^d\d+-gate7\.json$/.test(n)).sort();
  const cases = [];
  for (const name of names) {
    const rec = JSON.parse(await readFile(path.join(GATE7, name), "utf8"));
    const id = rec.id || name.replace(/-gate7\.json$/, "");
    const pointer =
      typeof rec.newVerdict?.quote === "string" && rec.newVerdict.quote.trim()
        ? rec.newVerdict.quote.trim()
        : typeof rec.committedVerdict?.quote === "string"
          ? rec.committedVerdict.quote.trim()
          : "";
    let sourceText = "";
    try {
      sourceText = await readFile(path.join(BAKEOFF, `${id}-C.txt`), "utf8");
    } catch {
      sourceText = "";
    }
    if (!pointer) continue;
    cases.push({ origin: `extractor-swap/${name}`, kind: "gate7.quote", pointer, sourceText });
  }
  return cases;
}

async function loadB163Cases() {
  const names = (await readdir(REVIEWS)).filter((n) => /^d\d+-review\.json$/.test(n)).sort();
  const cases = [];
  for (const name of names) {
    const rec = JSON.parse(await readFile(path.join(REVIEWS, name), "utf8"));
    const sources = Array.isArray(rec.sources) ? rec.sources : [];
    const statements = Array.isArray(rec.statements) ? rec.statements : [];
    for (const [si, stmt] of statements.entries()) {
      const card = stmt?.qcCard;
      if (!card) continue;
      for (const row of collectPointersFromCard(card, sources, `b163/${name}#${si}`)) {
        cases.push(row);
      }
    }
  }
  return cases;
}

function runFloor(cases, floor) {
  const recovered = [];
  const misses = [];
  const figuresRejected = [];
  const byStep = { exact: 0, normalised: 0, window: 0, miss: 0 };
  for (const row of cases) {
    const result = recoverExcerptFromSource({
      pointer: row.pointer,
      sourceText: row.sourceText,
      floor,
    });
    const item = {
      origin: row.origin,
      kind: row.kind,
      pointer: row.pointer,
      recovered: result.passage || null,
      step: result.miss ? "miss" : result.step,
      reason: result.reason || null,
      similarity: Number.isFinite(result.similarity) ? result.similarity : null,
      rejectedPassage: result.rejectedPassage || null,
    };
    if (result.reason === "figures_guard") figuresRejected.push(item);
    if (result.miss) {
      byStep.miss += 1;
      misses.push(item);
    } else {
      byStep[result.step] = (byStep[result.step] || 0) + 1;
      recovered.push(item);
    }
  }
  return { recovered, misses, figuresRejected, byStep };
}

function misquoteCount(cases) {
  let n = 0;
  for (const row of cases) {
    if (!exactSubstring(row.sourceText, row.pointer)) n += 1;
  }
  return n;
}

const cases = [...(await loadGate7Cases()), ...(await loadB163Cases())];
const quoted = cases.filter((c) => c.pointer && c.sourceText);
const misquotes = misquoteCount(quoted);

const chosen = runFloor(quoted, DEFAULT_SIMILARITY_FLOOR);
const looser = runFloor(quoted, 0.75);
const stricter = runFloor(quoted, 0.9);

const payload = {
  floor: DEFAULT_SIMILARITY_FLOOR,
  cases: quoted.length,
  skippedEmptySource: cases.length - quoted.length,
  misquotes,
  exactSubstringOfSource: quoted.length - misquotes,
  chosen: {
    floor: DEFAULT_SIMILARITY_FLOOR,
    byStep: chosen.byStep,
    recovered: chosen.recovered.length,
    miss: chosen.misses.length,
    figuresGuardRejected: chosen.figuresRejected.length,
  },
  looser: { floor: 0.75, byStep: looser.byStep, recovered: looser.recovered.length, miss: looser.misses.length },
  stricter: { floor: 0.9, byStep: stricter.byStep, recovered: stricter.recovered.length, miss: stricter.misses.length },
  recoveries: chosen.recovered,
  figuresGuardRejected: chosen.figuresRejected,
  misses: chosen.misses,
};

await writeFile(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(
  JSON.stringify(
    {
      cases: payload.cases,
      misquotes: payload.misquotes,
      chosen: payload.chosen,
      looser: payload.looser,
      stricter: payload.stricter,
      recoveryCount: payload.recoveries.length,
      figuresGuardRejected: payload.figuresGuardRejected.length,
      json: OUT_JSON,
    },
    null,
    2
  ) + "\n"
);
