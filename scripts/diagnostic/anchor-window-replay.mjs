#!/usr/bin/env node
/**
 * Free replay: presence check (and the full overlay) on stored Stage 2
 * passages vs the paragraph they came from vs the full source.
 *
 * Does not call a model. Does not change lib/.
 *
 *   node scripts/diagnostic/anchor-window-replay.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAllFixtures } from "./lib/fixtures.mjs";
import { loadPipelineSources } from "./lib/sources.mjs";
import { DIAG_ROOT } from "./lib/paths.mjs";
import { BASELINE_PATH } from "./claim-spans/baseline-cache.mjs";

process.env.AUTHORING_ORGANISATION =
  process.env.AUTHORING_ORGANISATION || "Partners Group";

const { corePropositionConfirmed, inferClaimTypeForRelation } = await import(
  "../../lib/qc/evidence-relationship.mjs"
);
const { isAuthoringOrganisationName } = await import(
  "../../lib/qc/first-person-actor.mjs"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_JSON = path.join(__dirname, "anchor-fix-corpus.json");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const ACCIDENT_DIR = path.join(DIAG_ROOT, "claim-spans/evaluative-accident");

const ANCHOR_ENTITY_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
const PRODUCTION_ORG = "Partners Group";
const LOCK_ORG = "Meridian Capital";

const quiet = (fn) => {
  const orig = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = orig;
  }
};

function corroborationAnchor(stmt, org) {
  const names = String(stmt ?? "").match(ANCHOR_ENTITY_RE) ?? [];
  for (const m of names) {
    if (isAuthoringOrganisationName(m, org)) continue;
    return m.toLowerCase();
  }
  const authorOnly = names.find((m) => isAuthoringOrganisationName(m, org));
  return authorOnly ? authorOnly.toLowerCase() : null;
}

function presence(stmt, window, org) {
  const entity = corroborationAnchor(stmt, org);
  if (!entity || entity.length < 2) return { entity, hit: false, reason: "no-anchor" };
  if (!window) return { entity, hit: false, reason: "no-window" };
  return { entity, hit: String(window).toLowerCase().includes(entity), reason: "ok" };
}

function coreOf(stmt, window) {
  return quiet(() =>
    corePropositionConfirmed(stmt, window, {
      claimType: inferClaimTypeForRelation(stmt),
    }).corePropositionConfirmed
  );
}

function collapse(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function collapsedIndexToOriginal(original, collapsedStart) {
  const compact = original.replace(/\s+/g, " ").trimStart();
  // Walk original skipping leading whitespace, then map compact index.
  let i = 0;
  while (i < original.length && /\s/.test(original[i])) i += 1;
  let c = 0;
  while (i < original.length && c < collapsedStart) {
    if (/\s/.test(original[i])) {
      while (i < original.length && /\s/.test(original[i])) i += 1;
      c += 1;
    } else {
      i += 1;
      c += 1;
    }
  }
  return i;
}

function locateSnippet(source, snippet) {
  const src = String(source ?? "");
  const snip = String(snippet ?? "").trim();
  if (!src || !snip || snip === "(excerpt not captured)") return null;
  const exact = src.indexOf(snip);
  if (exact >= 0) return { start: exact, end: exact + snip.length, how: "exact" };
  const srcC = collapse(src);
  const snipC = collapse(snip);
  if (!snipC) return null;
  let ci = srcC.indexOf(snipC);
  let how = "ws";
  let clen = snipC.length;
  if (ci < 0) {
    const head = snipC.slice(0, Math.min(80, snipC.length));
    ci = srcC.indexOf(head);
    how = "prefix";
    clen = head.length;
  }
  if (ci < 0) return null;
  const start = collapsedIndexToOriginal(src, ci);
  const end = collapsedIndexToOriginal(src, ci + clen);
  return { start, end: Math.max(end, start + 1), how };
}

function paragraphAt(source, start) {
  const src = String(source ?? "");
  if (!src) return "";
  const blank = /\n[ \t]*\n/;
  let from = 0;
  let to = src.length;
  const before = src.slice(0, start);
  const partsBefore = before.split(blank);
  const prefix = partsBefore.slice(0, -1).join("\n\n");
  from = prefix.length === 0 ? 0 : prefix.length + (before.length > prefix.length ? 2 : 0);
  // More reliable: scan backward/forward for \n\n
  let b = src.lastIndexOf("\n\n", start);
  from = b === -1 ? 0 : b + 2;
  let f = src.indexOf("\n\n", start);
  to = f === -1 ? src.length : f;
  return src.slice(from, to).trim();
}

async function loadNordholt() {
  const files = [
    ["source_1_ic_memo.txt", "IC memo"],
    ["source_2_press_release.txt", "press release"],
    ["source_3_fact_sheet.txt", "fact sheet"],
    ["source_4_lp_update.txt", "LP update"],
  ];
  const sources = [];
  for (const [name, label] of files) {
    sources.push({ text: await readFile(path.join(NORDHOLT_DIR, name), "utf8"), label });
  }
  return sources;
}

async function loadSupersession() {
  const names = [
    "source_A_annual_report_2019.txt",
    "source_B_fy2024_results.txt",
    "source_C_fund_update_2026.txt",
  ];
  const sources = [];
  for (const name of names) {
    sources.push({
      label: name.replace(/\.txt$/, ""),
      text: await readFile(path.join(SUPERSESSION_DIR, name), "utf8"),
    });
  }
  return sources;
}

async function buildSourceMap() {
  const baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  const caseSources = {};
  const skipped = [];
  try {
    const nord = await loadNordholt();
    caseSources["nordholt-clean"] = nord;
    caseSources["nordholt-dirty"] = nord;
  } catch {
    skipped.push("nordholt");
  }
  caseSources.supersession = await loadSupersession();
  const evalSource = [
    { text: await readFile(path.join(ACCIDENT_DIR, "source_ic_memo.txt"), "utf8"), label: "ic_memo" },
  ];
  for (const id of ["E1", "E2", "E3"]) caseSources[id] = evalSource;

  const fixtures = await loadAllFixtures();
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    if (!Number.isFinite(n) || n < 1 || n > 23) continue;
    caseSources[`F${String(n).padStart(2, "0")}`] = await loadPipelineSources(
      fx.data.sources || []
    );
  }

  const byPair = new Map();
  for (const [caseLabel, row] of Object.entries(baseline.cases)) {
    const sources = caseSources[caseLabel];
    if (!sources || !sources.length) {
      skipped.push(caseLabel);
      continue;
    }
    const byIdx = new Map((row.statements || []).map((s) => [s.index, s]));
    for (const m of row.matches || []) {
      const st = byIdx.get(m.statementIndex);
      const src = sources[m.sourceIndex];
      if (!st?.text || !src?.text) continue;
      const pairId = `${caseLabel}:S${m.statementIndex}:${m.sourceLabel}`;
      byPair.set(pairId, {
        pairId,
        caseLabel,
        statementText: st.text,
        sourceLabel: m.sourceLabel || src.label,
        sourceText: src.text,
      });
    }
  }
  return { byPair, skipped };
}

function trunc(s, n = 140) {
  const t = collapse(s);
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function printFlip(tag, row) {
  console.log(
    `  ${tag} ${row.pairId} entity=${JSON.stringify(row.entity)} class=${row.classification}`
  );
  console.log(`    stmt: ${trunc(row.statementText, 120)}`);
  console.log(`    w1:   ${trunc(row.w1, 120)}`);
  if (row.w2 != null) console.log(`    w2:   ${trunc(row.w2, 120)}`);
  console.log(`    locate=${row.locateHow || "none"}`);
}

const stored = JSON.parse(await readFile(CORPUS_JSON, "utf8"));
const { byPair, skipped } = await buildSourceMap();

const org = PRODUCTION_ORG;
const rows = [];
let noSource = 0;
let unlocated = 0;
let locatedExact = 0;
let locatedWs = 0;
let locatedPrefix = 0;

for (const r of stored.results) {
  const src = byPair.get(r.pairId);
  if (!src?.sourceText) {
    noSource += 1;
    rows.push({
      ...r,
      statementText: r.statementText,
      w1: r.passage,
      w2: null,
      w3: null,
      locateHow: "no-source",
      entity: corroborationAnchor(r.statementText, org),
    });
    continue;
  }
  const loc = locateSnippet(src.sourceText, r.passage);
  let w2 = null;
  if (!loc) {
    unlocated += 1;
  } else {
    w2 = paragraphAt(src.sourceText, loc.start);
    if (loc.how === "exact") locatedExact += 1;
    else if (loc.how === "ws") locatedWs += 1;
    else locatedPrefix += 1;
  }
  rows.push({
    ...r,
    statementText: r.statementText,
    sourceText: src.sourceText,
    w1: r.passage,
    w2,
    w3: src.sourceText,
    locateHow: loc?.how || "unlocated",
    entity: corroborationAnchor(r.statementText, org),
  });
}

const replayable = rows.filter((r) => r.w3);
const w2able = rows.filter((r) => r.w2);

function flips(fromKey, toKey, orgName) {
  const up = [];
  const down = [];
  const universe = rows.filter((r) => r[fromKey] != null && r[toKey] != null);
  for (const r of universe) {
    const a = presence(r.statementText, r[fromKey], orgName);
    const b = presence(r.statementText, r[toKey], orgName);
    const rec = { ...r, entity: a.entity, from: a.hit, to: b.hit };
    if (!a.hit && b.hit) up.push(rec);
    if (a.hit && !b.hit) down.push(rec);
  }
  return { universe: universe.length, up, down };
}

function coreFlips(fromKey, toKey) {
  const up = [];
  const down = [];
  const universe = rows.filter((r) => r[fromKey] != null && r[toKey] != null);
  for (const r of universe) {
    const a = coreOf(r.statementText, r[fromKey]);
    const b = coreOf(r.statementText, r[toKey]);
    if (!a && b) up.push(r);
    if (a && !b) down.push(r);
  }
  return { universe: universe.length, up, down };
}

function f02(windowKey) {
  const r = rows.find((x) => x.pairId.includes("F02:S6"));
  const p = presence(r.statementText, r[windowKey], org);
  const c = r[windowKey] ? coreOf(r.statementText, r[windowKey]) : null;
  return { pairId: r.pairId, entity: p.entity, presence: p.hit, core: c, locateHow: r.locateHow, windowChars: (r[windowKey] || "").length };
}

console.log("=== anchor-window-replay (free, no model) ===\n");
console.log(`stored pairs: ${stored.results.length}`);
console.log(`source joined: ${replayable.length}  no-source: ${noSource}  skipped cases: ${skipped.join(", ") || "(none)"}`);
console.log(`W2 located: ${w2able.length}  exact=${locatedExact} ws=${locatedWs} prefix=${locatedPrefix} unlocated=${unlocated}`);
console.log(`org for presence/core: ${org} (env ${process.env.AUTHORING_ORGANISATION})`);

console.log("\n--- F02:S6 per window ---");
for (const k of ["w1", "w2", "w3"]) {
  const x = f02(k);
  console.log(`  ${k} presence=${x.presence} core=${x.core} entity=${JSON.stringify(x.entity)} chars=${x.windowChars} locate=${x.locateHow}`);
}
const f02row = rows.find((x) => x.pairId.includes("F02:S6"));
console.log("  W1 text:", trunc(f02row.w1, 200));
console.log("  W2 text:", trunc(f02row.w2, 400));
console.log("  W2 contains investments:", String(f02row.w2 || "").toLowerCase().includes("investments"));
console.log("  W2 contains cpp:", String(f02row.w2 || "").toLowerCase().includes("cpp"));

const w2p = flips("w1", "w2", org);
const w3p = flips("w1", "w3", org);
const w2c = coreFlips("w1", "w2");
const w3c = coreFlips("w1", "w3");

console.log("\n--- presence W1 -> W2 ---");
console.log(`  universe=${w2p.universe}  false->true=${w2p.up.length}  true->false=${w2p.down.length}`);
if (w2p.up.length === 0) console.log("  (no false->true)");
for (const r of w2p.up) printFlip("UP", r);
if (w2p.down.length === 0) console.log("  (no true->false)");
for (const r of w2p.down) printFlip("DOWN", r);

console.log("\n--- presence W1 -> W3 ---");
console.log(`  universe=${w3p.universe}  false->true=${w3p.up.length}  true->false=${w3p.down.length}`);
for (const r of w3p.up) printFlip("UP", r);
if (w3p.down.length === 0) console.log("  (no true->false)");
for (const r of w3p.down) printFlip("DOWN", r);

console.log("\n--- corePropositionConfirmed W1 -> W2 ---");
console.log(`  universe=${w2c.universe}  false->true=${w2c.up.length}  true->false=${w2c.down.length}`);
for (const r of w2c.up) {
  console.log(`  UP ${r.pairId} class=${r.classification} entity=${JSON.stringify(corroborationAnchor(r.statementText, org))}`);
  console.log(`    stmt: ${trunc(r.statementText, 120)}`);
}
for (const r of w2c.down) {
  console.log(`  DOWN ${r.pairId} class=${r.classification} entity=${JSON.stringify(corroborationAnchor(r.statementText, org))}`);
}

console.log("\n--- corePropositionConfirmed W1 -> W3 ---");
console.log(`  universe=${w3c.universe}  false->true=${w3c.up.length}  true->false=${w3c.down.length}`);
for (const r of w3c.up) {
  console.log(`  UP ${r.pairId} class=${r.classification} entity=${JSON.stringify(corroborationAnchor(r.statementText, org))}`);
  console.log(`    stmt: ${trunc(r.statementText, 120)}`);
}
for (const r of w3c.down) {
  console.log(`  DOWN ${r.pairId} class=${r.classification} entity=${JSON.stringify(corroborationAnchor(r.statementText, org))}`);
}

// C: W1 presence false, W3 presence true, and W1 core is false.
// The missing name appears in the source. These are the only possible
// window-widening breaks. Adjudication of "correctly refused" is in the report.
console.log("\n--- C candidates: W1 presence false, W3 presence true, W1 core false ---");
const cands = [];
for (const r of replayable) {
  const p1 = presence(r.statementText, r.w1, org);
  const p3 = presence(r.statementText, r.w3, org);
  const c1 = coreOf(r.statementText, r.w1);
  if (!p1.hit && p3.hit && !c1) {
    cands.push({
      pairId: r.pairId,
      classification: r.classification,
      entity: p1.entity,
      stmt: r.statementText,
      w1: r.w1,
    });
  }
}
console.log(`  n=${cands.length}`);
for (const c of cands) {
  console.log(`  ${c.pairId} class=${c.classification} entity=${JSON.stringify(c.entity)}`);
  console.log(`    stmt: ${trunc(c.stmt, 140)}`);
  console.log(`    w1:   ${trunc(c.w1, 140)}`);
}

// F21 lock under Meridian, not production org
const f21 = rows.find((x) => x.pairId.includes("F21:S0"));
if (f21) {
  console.log("\n--- F21:S0 lock under Meridian Capital ---");
  for (const k of ["w1", "w2", "w3"]) {
    const p = presence(f21.statementText, f21[k], LOCK_ORG);
    const c = f21[k] ? quiet(() => {
      const prev = process.env.AUTHORING_ORGANISATION;
      process.env.AUTHORING_ORGANISATION = LOCK_ORG;
      try {
        return corePropositionConfirmed(f21.statementText, f21[k], {
          claimType: inferClaimTypeForRelation(f21.statementText),
        }).corePropositionConfirmed;
      } finally {
        process.env.AUTHORING_ORGANISATION = prev;
      }
    }) : null;
    console.log(`  ${k} presence=${p.hit} core=${c} entity=${JSON.stringify(p.entity)}`);
  }
  console.log("  source has 'project atlas':", String(f21.w3 || "").toLowerCase().includes("project atlas"));
}

console.log("\n--- W2 vs W1 identity (paragraph longer than snippet) ---");
let longer = 0;
let same = 0;
for (const r of w2able) {
  if (collapse(r.w2) === collapse(r.w1)) same += 1;
  else longer += 1;
}
console.log(`  W2 byte-identical to W1 (collapsed): ${same}`);
console.log(`  W2 strictly larger: ${longer}`);
