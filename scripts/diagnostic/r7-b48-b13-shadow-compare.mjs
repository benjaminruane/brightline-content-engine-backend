#!/usr/bin/env node
/**
 * Shadow compare: baseline run vs new run (B48 verdicts + B13 materiality).
 * Usage: node scripts/diagnostic/r7-b48-b13-shadow-compare.mjs --before <ts> --after <ts>
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RUNS_DIR } from "./lib/paths.mjs";

const TRUE_CONFLICT_KEYS = [
  ["05", 0],
  ["05", 5],
  ["15", 2],
  ["17", 9],
  ["18", 0],
  ["18", 2],
  ["19", 2],
  ["21", 0],
];

const COVER_OPENER_KEYS = [
  ["04", 1],
  ["08", 0],
  ["15", 0],
  ["17", 0],
  ["22", 0],
  ["23", 0],
];

const PARTIAL_GAP_KEYS = [
  ["08", 2],
  ["11", 7],
  ["12", 0],
  ["12", 1],
  ["14", 4],
  ["14", 11],
  ["15", 11],
  ["19", 7],
  ["19", 13],
];

const ROUNDING_KEY = ["06", 1];

function parseArgs(argv) {
  const opts = { before: null, after: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--before" && argv[i + 1]) opts.before = argv[++i];
    else if (argv[i] === "--after" && argv[i + 1]) opts.after = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!opts.before || !opts.after) throw new Error("Required: --before <ts> --after <ts>");
  return opts;
}

async function loadRun(ts) {
  const root = path.isAbsolute(ts) ? ts : path.join(RUNS_DIR, ts);
  const names = (await readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const byId = new Map();
  for (const dir of names) {
    try {
      const data = JSON.parse(await readFile(path.join(root, dir, "result.json"), "utf8"));
      byId.set(String(data.fixtureId).padStart(2, "0"), data);
    } catch {
      /* skip */
    }
  }
  return { root, byId };
}

function statements(data) {
  const stage2 = Array.isArray(data?.pipelineResult?.stage2) ? data.pipelineResult.stage2 : [];
  return stage2.map((e) => ({
    index: e.statementIndex,
    text: e.statementText || "",
    verdict: e?.verdictResult?.verdict || "not_supported",
    hasConflict: e?.verdictResult?.hasConflict === true,
  }));
}

function cards(data) {
  return Array.isArray(data?.pipelineResult?.qcCards) ? data.pipelineResult.qcCards : [];
}

function keyOf(id, idx) {
  return `${String(id).padStart(2, "0")}:${idx}`;
}

function trunc(s, n = 70) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

async function main() {
  const opts = parseArgs(process.argv);
  const before = await loadRun(opts.before);
  const after = await loadRun(opts.after);

  const flips = [];
  const afterVerdicts = new Map();
  const beforeVerdicts = new Map();

  for (const [id, data] of after.byId) {
    const prev = before.byId.get(id);
    const aStmts = statements(data);
    const bStmts = prev ? statements(prev) : [];
    const bByIdx = new Map(bStmts.map((s) => [s.index, s]));
    for (const s of aStmts) {
      afterVerdicts.set(keyOf(id, s.index), s);
      const old = bByIdx.get(s.index);
      if (old) beforeVerdicts.set(keyOf(id, s.index), old);
      if (old && old.verdict !== s.verdict) {
        flips.push({
          fixture: id,
          index: s.index,
          text: s.text,
          from: old.verdict,
          to: s.verdict,
        });
      }
    }
  }

  function checkKeys(keys, expect) {
    return keys.map(([id, idx]) => {
      const s = afterVerdicts.get(keyOf(id, idx));
      const ok = s && expect(s.verdict);
      return { id, idx, verdict: s?.verdict || "MISSING", ok, text: s?.text || "" };
    });
  }

  const trueConflict = checkKeys(TRUE_CONFLICT_KEYS, (v) => v === "conflicting");
  const coverOpeners = checkKeys(COVER_OPENER_KEYS, (v) => v === "confirmed");
  const partials = checkKeys(PARTIAL_GAP_KEYS, (v) => v === "partially_confirmed");
  const rounding = checkKeys([ROUNDING_KEY], (v) => v === "confirmed" || v === "partially_confirmed");

  const confirmedToPartial = flips.filter((f) => f.from === "confirmed" && f.to === "partially_confirmed");
  const confirmedToNone = flips.filter((f) => f.from === "confirmed" && f.to === "not_supported");
  const confirmedToConflict = flips.filter((f) => f.from === "confirmed" && f.to === "conflicting");

  function pairNote(id, idx) {
    const data = after.byId.get(String(id).padStart(2, "0"));
    const stage2 = Array.isArray(data?.pipelineResult?.stage2) ? data.pipelineResult.stage2 : [];
    const entry = stage2.find((e) => e.statementIndex === idx);
    if (!entry) return "MISSING";
    const matches = Array.isArray(entry.sourceMatches) ? entry.sourceMatches : [];
    return matches.map((m) => `${m.classification}: ${(m.explanation || "").replace(/\s+/g, " ").slice(0, 180)}`).join(" || ");
  }

  let mat = { material: 0, minor: 0, mechanical: 0, missing: 0, n: 0 };
  const spot = [];
  for (const [id, data] of after.byId) {
    for (const c of cards(data)) {
      mat.n += 1;
      const level = c?.materiality?.level;
      if (level && mat[level] !== undefined) mat[level] += 1;
      else mat.missing += 1;
      const stmt = c.statement || "";
      if (/we recommend approval/i.test(stmt) || (c.editorialConcerns || []).some((x) => x.concernCode === "voice_consistency") || (c.editorialConcerns || []).some((x) => x.concernCode === "marketing_language_excess")) {
        if (spot.length < 25) {
          spot.push({
            id,
            index: c.index,
            stmt,
            level,
            features: c?.materiality?.features || [],
            editorial: (c.editorialConcerns || []).map((x) => x.concernCode),
            verdict: c.supportState,
          });
        }
      }
    }
  }

  const lines = [];
  lines.push(`# B48/B13 shadow compare`);
  lines.push(`Before: ${before.root}`);
  lines.push(`After: ${after.root}`);
  lines.push("");
  lines.push(`## Verdict flips (${flips.length})`);
  lines.push(`| Fixture | Stmt | From | To | Statement |`);
  lines.push(`|---|---|---|---|---|`);
  for (const f of flips) {
    lines.push(`| ${f.fixture} | ${f.index} | ${f.from} | ${f.to} | ${trunc(f.text)} |`);
  }
  if (flips.length === 0) lines.push(`| — | — | none | — | — |`);
  lines.push("");
  lines.push(`## TRUE_CONFLICT still conflicting (F13 S7 excluded)`);
  for (const r of trueConflict) {
    lines.push(`- F${r.id} S${r.idx}: ${r.verdict} ${r.ok ? "OK" : "FAIL"}`);
    if (!r.ok) lines.push(`  - model: ${pairNote(r.id, r.idx)}`);
  }
  lines.push("");
  lines.push(`## Cover/opener sentences back to confirmed`);
  for (const r of coverOpeners) {
    lines.push(`- F${r.id} S${r.idx}: ${r.verdict} ${r.ok ? "OK" : "FAIL"}`);
    if (!r.ok) lines.push(`  - model: ${pairNote(r.id, r.idx)}`);
  }
  lines.push("");
  lines.push(`## PARTIAL_GAP now partial`);
  for (const r of partials) {
    lines.push(`- F${r.id} S${r.idx}: ${r.verdict} ${r.ok ? "OK" : "FAIL"}`);
  }
  lines.push("");
  lines.push(`## Rounding F06 S1 (expect confirmed, partial acceptable)`);
  for (const r of rounding) {
    lines.push(`- F${r.id} S${r.idx}: ${r.verdict} ${r.ok ? "OK" : "FAIL"}`);
  }
  lines.push("");
  lines.push(`## Total verdict changes: ${flips.length}`);
  lines.push(`confirmed→partial: ${confirmedToPartial.length}; confirmed→not_supported: ${confirmedToNone.length}; confirmed→conflicting: ${confirmedToConflict.length}`);
  lines.push("");
  lines.push(`### confirmed → partially_confirmed`);
  for (const f of confirmedToPartial) {
    lines.push(`- F${f.fixture} S${f.index}: ${trunc(f.text, 90)}`);
  }
  if (confirmedToPartial.length === 0) lines.push(`- (none)`);
  lines.push("");
  lines.push(`### confirmed → not_supported`);
  for (const f of confirmedToNone) {
    lines.push(`- F${f.fixture} S${f.index}: ${trunc(f.text, 90)}`);
  }
  if (confirmedToNone.length === 0) lines.push(`- (none)`);
  lines.push("");
  lines.push(`### confirmed → conflicting`);
  for (const f of confirmedToConflict) {
    lines.push(`- F${f.fixture} S${f.index}: ${trunc(f.text, 90)}`);
  }
  if (confirmedToConflict.length === 0) lines.push(`- (none)`);
  lines.push("");
  const total = mat.material + mat.minor + mat.mechanical;
  const pct = (n) => (total ? `${((n / total) * 100).toFixed(0)}%` : "n/a");
  lines.push(`## B13 distribution`);
  lines.push(`material=${mat.material} (${pct(mat.material)}) minor=${mat.minor} (${pct(mat.minor)}) mechanical=${mat.mechanical} (${pct(mat.mechanical)}) missing=${mat.missing} n=${mat.n}`);
  lines.push(`Prior diagnostic prototype: 78% / 19% / 3%`);
  lines.push("");
  lines.push(`## Over-promotion spot-check`);
  for (const s of spot) {
    lines.push(`- F${s.id} S${s.index} level=${s.level} editorial=[${s.editorial.join(",")}] ${trunc(s.stmt, 60)}`);
  }

  const out = path.join(after.root, "B48_B13_SHADOW.md");
  await writeFile(out, `${lines.join("\n")}\n`, "utf8");
  console.log(lines.join("\n"));
  console.log(`\nWrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
