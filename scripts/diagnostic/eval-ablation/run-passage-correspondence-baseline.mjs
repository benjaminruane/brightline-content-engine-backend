#!/usr/bin/env node
/**
 * Free. Absolute passage correspondence under R3a and R10 from blast rows.
 * No model calls. Rebuilds corpus pair sources the same way as the R10 blast.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";
import { BASELINE_PATH } from "../claim-spans/baseline-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROWS_PATH = path.join(__dirname, "r10-corpus-blast-rows.json");
const OUT_MD = path.join(__dirname, "passage-correspondence-baseline.md");
const OUT_JSON = path.join(__dirname, "passage-correspondence-baseline.json");

const MF_PAIRS_PATH = path.join(DIAG_ROOT, "passage-selection-probe/pairs.json");
const ACCIDENT_DIR = path.join(DIAG_ROOT, "claim-spans/evaluative-accident");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");

function nearlyEqual(a, b) {
  if (a === b) return true;
  const hi = Math.max(Math.abs(a), Math.abs(b));
  const lo = Math.min(Math.abs(a), Math.abs(b));
  if (lo === 0) return hi === 0;
  if (Math.abs(a - b) <= 0.051 && hi < 1000) return true;
  if (Math.abs(a - b) / hi <= 0.02 && hi >= 10) return true;
  return false;
}

function extractFigures(text) {
  const t = String(text || "");
  const out = [];
  const seen = new Set();
  function add(value, raw, kind) {
    if (!Number.isFinite(value)) return;
    const key = `${kind}:${value}:${raw}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value, raw, kind });
  }
  let m;
  const percentRe = /(\d+(?:\.\d+)?)\s*(?:%|(?:per\s?cent)\b|percent\b)/gi;
  while ((m = percentRe.exec(t))) add(Number(m[1]), m[0], "percent");
  const multipleRe = /(\d+(?:\.\d+)?)\s*(?:x\b|times\b)/gi;
  while ((m = multipleRe.exec(t))) add(Number(m[1]), m[0], "multiple");
  const moneyRe =
    /(USD|EUR|GBP|AUD|CAD|\$|€|£)\s*([\d,.'\u2019]+)\s*(million|billion|thousand|mm|bn|k|m)?\b|([\d,.'\u2019]+)\s*(million|billion|thousand|mm|bn)\b/gi;
  while ((m = moneyRe.exec(t))) {
    const n = Number(String(m[2] || m[4] || "").replace(/[,']/g, "").replace(/\u2019/g, ""));
    if (!Number.isFinite(n)) continue;
    add(n, m[0], "money");
  }
  const genericRe = /\b(\d{1,3}(?:,\d{3})+|\d+\.\d+|\d+)\b/g;
  while ((m = genericRe.exec(t))) {
    const raw = m[1];
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    if (n >= 1900 && n <= 2099 && Number.isInteger(n)) continue;
    if (n === 0) continue;
    add(n, raw, "number");
  }
  return out;
}

/** Deduplicate statement figures by value (keep richest kind). */
function uniqueByValue(figs) {
  const rank = { percent: 4, multiple: 4, money: 3, number: 1 };
  const best = new Map();
  for (const f of figs) {
    const prev = best.get(f.value);
    if (!prev || (rank[f.kind] || 0) > (rank[prev.kind] || 0)) best.set(f.value, f);
  }
  return [...best.values()];
}

function kindsCompatible(stmtKind, passKind) {
  if (stmtKind === passKind) return true;
  // money/number often written without currency in the passage
  if (
    (stmtKind === "money" && passKind === "number") ||
    (stmtKind === "number" && passKind === "money")
  ) {
    return true;
  }
  // multiple sometimes appears as bare 2.6 next to MOIC
  if (
    (stmtKind === "multiple" && passKind === "number") ||
    (stmtKind === "number" && passKind === "multiple")
  ) {
    return true;
  }
  // percent vs bare number near % already captured as percent; reject bare
  if (stmtKind === "percent" && passKind === "percent") return true;
  return false;
}

function figureMatch(stmtFig, passFigs) {
  return passFigs.some(
    (p) => nearlyEqual(stmtFig.value, p.value) && kindsCompatible(stmtFig.kind, p.kind)
  );
}

function correspondenceBucket(stmtFigs, passage) {
  const figs = uniqueByValue(stmtFigs);
  if (!figs.length) return null;
  const passFigs = extractFigures(passage);
  let hit = 0;
  for (const s of figs) {
    if (figureMatch(s, passFigs)) hit += 1;
  }
  if (hit === 0) return "NONE";
  if (hit === figs.length) return "ALL";
  return "SOME";
}

function splitSentences(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  return t.split(/(?<=[.!?])\s+(?=[A-Z("])/).filter(Boolean);
}

function normPassage(p) {
  return String(p || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fixtureKey(caseLabel) {
  const c = String(caseLabel || "");
  if (/^F\d{2}$/.test(c)) return c;
  if (c.startsWith("nordholt")) return "nordholt";
  if (c === "supersession") return "supersession";
  if (/^E[123]$/.test(c)) return `corpus_${c}`;
  if (c.startsWith("MF")) return "MF_probe";
  if (/^F9[0-3]$/.test(c)) return c;
  return c;
}

async function loadNordholt(kind) {
  const draftName = kind === "dirty" ? "draft_hold_update_DIRTY.txt" : "draft_hold_update_clean.txt";
  const draft = await readFile(path.join(NORDHOLT_DIR, draftName), "utf8");
  const files = [
    ["source_1_ic_memo.txt", "IC memo"],
    ["source_2_press_release.txt", "press release"],
    ["source_3_fact_sheet.txt", "fact sheet"],
    ["source_4_lp_update.txt", "LP update"],
  ];
  const sources = [];
  for (const [name, label] of files) {
    const text = await readFile(path.join(NORDHOLT_DIR, name), "utf8");
    sources.push({ text, label });
  }
  return { draft, sources };
}
async function loadSupersession() {
  const draft = await readFile(path.join(SUPERSESSION_DIR, "draft_supersession.txt"), "utf8");
  const files = [
    "source_A_annual_report_2019.txt",
    "source_B_fy2024_results.txt",
    "source_C_fund_update_2026.txt",
  ];
  const sources = [];
  for (const name of files) {
    const text = await readFile(path.join(SUPERSESSION_DIR, name), "utf8");
    sources.push({ label: name.replace(/\.txt$/, ""), text });
  }
  return { draft, sources };
}
async function loadEvaluativeCase(id) {
  const draft = await readFile(path.join(ACCIDENT_DIR, `draft_${id.toLowerCase()}.txt`), "utf8");
  const text = await readFile(path.join(ACCIDENT_DIR, "source_ic_memo.txt"), "utf8");
  return { draft, sources: [{ text, label: "ic_memo" }] };
}

async function buildCorpusPairs() {
  const baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  const caseSources = {};
  caseSources["nordholt-clean"] = (await loadNordholt("clean")).sources;
  caseSources["nordholt-dirty"] = (await loadNordholt("dirty")).sources;
  caseSources.supersession = (await loadSupersession()).sources;
  for (const id of ["E1", "E2", "E3"]) {
    caseSources[id] = (await loadEvaluativeCase(id)).sources;
  }
  const fixtures = await loadAllFixtures();
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    if (!Number.isFinite(n) || n < 1 || n > 23) continue;
    const label = `F${String(n).padStart(2, "0")}`;
    caseSources[label] = await loadPipelineSources(fx.data.sources || []);
  }

  const pairs = [];
  for (const [caseLabel, row] of Object.entries(baseline.cases)) {
    const sources = caseSources[caseLabel];
    if (!sources || !sources.length) {
      throw new Error(`No sources loaded for baseline case ${caseLabel}`);
    }
    const byIdx = new Map((row.statements || []).map((s) => [s.index, s]));
    for (const m of row.matches || []) {
      const st = byIdx.get(m.statementIndex);
      if (!st?.text) throw new Error(`Missing statement ${caseLabel} S${m.statementIndex}`);
      const src = sources[m.sourceIndex];
      if (!src?.text) {
        throw new Error(
          `Missing source ${caseLabel} sourceIndex=${m.sourceIndex} label=${m.sourceLabel}`
        );
      }
      pairs.push({
        pairId: `${caseLabel}:S${m.statementIndex}:${m.sourceLabel}`,
        caseLabel,
        statementText: st.text,
        sourceText: src.text,
      });
    }
  }

  const adv = [
    {
      caseLabel: "F90",
      sources: ["90_adversarial_b17_latent.txt"],
      statements: [
        "The firm invested in Helios Grid Controls in 2024.",
        "Helios Grid Controls is a Munich-headquartered supplier of grid-stabilisation software.",
      ],
    },
    {
      caseLabel: "F91",
      sources: ["91_adversarial_shopify_2010_trimmed.txt"],
      statements: ["The firm has invested in Shopify."],
    },
    {
      caseLabel: "F92",
      sources: ["91_adversarial_shopify_2010_trimmed.txt"],
      statements: ["Shopify is a small startup serving approximately 10,000 customers."],
    },
    {
      caseLabel: "F93",
      sources: ["93_adversarial_basis_mismatch.txt"],
      statements: [
        "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
        "Fund IV is currently marked at 1.9 times gross MOIC and a 24 per cent gross IRR.",
        "Fund IV has returned 2.6 times gross MOIC.",
        "Fund IV has returned 2.6 times net MOIC.",
      ],
    },
  ];
  for (const a of adv) {
    const sources = await loadPipelineSources(a.sources);
    for (let si = 0; si < a.statements.length; si++) {
      for (let srcI = 0; srcI < sources.length; srcI++) {
        pairs.push({
          pairId: `${a.caseLabel}:S${si}:${sources[srcI].label}`,
          caseLabel: a.caseLabel,
          statementText: a.statements[si],
          sourceText: sources[srcI].text,
        });
      }
    }
  }

  const mfManifest = JSON.parse(await readFile(MF_PAIRS_PATH, "utf8"));
  for (const pair of mfManifest.pairs) {
    const abs = path.join(DIAG_ROOT, pair.sourceFile);
    const sourceText = await readFile(abs, "utf8");
    pairs.push({
      pairId: `${pair.id}:S0:${path.basename(pair.sourceFile)}`,
      caseLabel: pair.id,
      statementText: pair.draft,
      sourceText,
    });
  }
  return pairs;
}

/**
 * Find better passages: sentences containing ALL statement figures that are
 * not the selected passage. Reject false friends.
 */
function findBetterPassages(sourceText, stmtFigs, selectedPassage) {
  const figs = uniqueByValue(stmtFigs);
  const selectedNorm = normPassage(selectedPassage);
  const sentences = splitSentences(sourceText);
  const accepted = [];
  const rejected = [];

  for (const sent of sentences) {
    if (normPassage(sent) === selectedNorm) continue;
    if (selectedNorm && normPassage(sent).includes(selectedNorm) && selectedNorm.length > 40) {
      // abridged selection already covers this host
      continue;
    }
    const passFigs = extractFigures(sent);
    const hits = figs.filter((s) => figureMatch(s, passFigs));
    if (hits.length === 0) continue;

    // False friend: percent statement matched only via bare number without %/IRR/MOIC cue
    let rejectReason = null;
    for (const s of figs) {
      if (s.kind !== "percent") continue;
      const matched = passFigs.filter((p) => nearlyEqual(s.value, p.value));
      if (!matched.length) continue;
      const hasPercentKind = matched.some((p) => p.kind === "percent");
      if (!hasPercentKind && !/\b(IRR|MOIC|per\s?cent|percent|%)\b/i.test(sent)) {
        rejectReason = `percent ${s.value} matched bare number without rate cue`;
        break;
      }
    }
    // False friend: money statement matched only as a bare small integer count
    // without money/million/EUR cues when statement was money-scaled
    if (!rejectReason) {
      for (const s of figs) {
        if (s.kind !== "money") continue;
        const matched = passFigs.filter((p) => nearlyEqual(s.value, p.value));
        if (!matched.length) continue;
        const hasMoney = matched.some((p) => p.kind === "money");
        if (!hasMoney && !/\b(EUR|USD|GBP|\$|€|£|million|billion|mm|bn)\b/i.test(sent)) {
          rejectReason = `money ${s.value} matched bare count without currency/scale cue`;
          break;
        }
      }
    }
    // False friend: multiple matched as unrelated integer (e.g. "2 exits" for "2.6x")
    if (!rejectReason) {
      for (const s of figs) {
        if (s.kind !== "multiple") continue;
        const matched = passFigs.filter((p) => nearlyEqual(s.value, p.value));
        if (!matched.length) continue;
        const hasMult = matched.some((p) => p.kind === "multiple");
        if (!hasMult && !/\b(x|times|MOIC|multiple)\b/i.test(sent)) {
          rejectReason = `multiple ${s.value} matched bare number without multiple cue`;
          break;
        }
      }
    }

    if (rejectReason) {
      rejected.push({ sentence: sent.slice(0, 220), reason: rejectReason, hitCount: hits.length });
      continue;
    }

    if (hits.length === figs.length) {
      accepted.push({ sentence: sent, coverage: "ALL", hitCount: hits.length });
    } else {
      accepted.push({ sentence: sent, coverage: "SOME", hitCount: hits.length });
    }
  }

  const allCoverage = accepted.filter((a) => a.coverage === "ALL");
  return {
    hasAllBetter: allCoverage.length > 0,
    hasSomeBetter: accepted.some((a) => a.coverage === "SOME" || a.coverage === "ALL"),
    allBetterCount: allCoverage.length,
    someBetterCount: accepted.filter((a) => a.coverage === "SOME").length,
    best: allCoverage[0] || accepted[0] || null,
    rejected,
  };
}

/**
 * Heuristic label defensibility from source given NONE passage.
 * Not a gold label. Used only to size whether NONE predicts wrong labels.
 */
function labelDefensibility(row, sourceText, stmtFigs, better) {
  const label = row.classification;
  const figs = uniqueByValue(stmtFigs);
  const sourceFigs = extractFigures(sourceText);
  const sourceHasAll = figs.every((s) => figureMatch(s, sourceFigs));
  const sourceHasSome = figs.some((s) => figureMatch(s, sourceFigs));

  // Conflicting figures present elsewhere (same metric family, different value): rough
  let magnitudeConflictAvailable = false;
  if (better.hasAllBetter || better.hasSomeBetter) {
    // if better sentence exists with figures, model could have engaged them
    magnitudeConflictAvailable = true;
  }

  let verdict;
  let note;
  if (label === "no_support" && !sourceHasSome) {
    verdict = "defensible";
    note = "source lacks statement figures; NONE+no_support coherent";
  } else if (label === "confirmed" && better.hasAllBetter) {
    verdict = "suspect";
    note = "confirmed while citing NONE of figures, yet source has ALL-figure sentence";
  } else if (label === "confirmed" && !sourceHasSome) {
    verdict = "suspect";
    note = "confirmed with NONE passage and source has no statement figures";
  } else if (label === "partially_confirmed" && better.hasAllBetter) {
    verdict = "suspect";
    note = "partial on non-corresponding passage while ALL-figure sentence exists";
  } else if (label === "conflicting" && better.hasAllBetter) {
    verdict = "mixed";
    note = "conflicting may still be right if selected span conflicts on other grounds; figure sentence unused";
  } else if (label === "conflicting" && !sourceHasSome) {
    verdict = "suspect";
    note = "conflicting with NONE and source lacks figures";
  } else if (!sourceHasSome) {
    verdict = "defensible";
    note = "source does not carry statement figures";
  } else {
    verdict = "unclear";
    note = "source has some figures; need case read";
  }
  return { verdict, note, sourceHasAll, sourceHasSome, magnitudeConflictAvailable };
}

function bump(map, key, bucket) {
  if (!map[key]) map[key] = { ALL: 0, SOME: 0, NONE: 0, total: 0 };
  map[key][bucket] += 1;
  map[key].total += 1;
}

function rate(n, d) {
  if (!d) return "n/a";
  return `${((100 * n) / d).toFixed(1)}%`;
}

function fmtBucket(b) {
  return `ALL=${b.ALL} SOME=${b.SOME} NONE=${b.NONE} (n=${b.total}) NONE_rate=${rate(b.NONE, b.total)}`;
}

async function main() {
  const blast = JSON.parse(await readFile(ROWS_PATH, "utf8"));
  const rows = blast.corpusRows;
  const pairs = await buildCorpusPairs();
  const byPairId = new Map(pairs.map((p) => [p.pairId, p]));

  const missingSources = [];
  const analyzed = { R3a: [], R10: [] };

  for (const row of rows) {
    const stmtFigs = extractFigures(row.statementText);
    const uniq = uniqueByValue(stmtFigs);
    if (!uniq.length) continue;
    const bucket = correspondenceBucket(stmtFigs, row.passage);
    const pair = byPairId.get(row.pairId);
    if (!pair) missingSources.push(row.pairId);
    analyzed[row.variantId].push({
      ...row,
      stmtFigs: uniq,
      bucket,
      caseLabel: row.caseLabel,
      sourceText: pair?.sourceText ?? null,
    });
  }

  const summary = {};
  for (const arm of ["R3a", "R10"]) {
    const list = analyzed[arm];
    const byLabel = {};
    const byFixture = {};
    const totals = { ALL: 0, SOME: 0, NONE: 0, total: 0 };
    for (const r of list) {
      totals[r.bucket] += 1;
      totals.total += 1;
      bump(byLabel, r.classification || "(null)", r.bucket);
      bump(byFixture, fixtureKey(r.caseLabel), r.bucket);
    }
    summary[arm] = { totals, byLabel, byFixture, figureBearing: list.length };
  }

  // NONE under R10: better passage?
  const r10None = analyzed.R10.filter((r) => r.bucket === "NONE");
  const betterStats = {
    noneCount: r10None.length,
    missingSource: 0,
    hasAllBetter: 0,
    hasSomeOnlyBetter: 0,
    noBetter: 0,
    rejectedFalseFriendCases: 0,
    cases: [],
  };
  const allRejectedReasons = [];

  for (const r of r10None) {
    if (!r.sourceText) {
      betterStats.missingSource += 1;
      continue;
    }
    const better = findBetterPassages(r.sourceText, r.stmtFigs, r.passage);
    if (better.rejected.length) {
      betterStats.rejectedFalseFriendCases += 1;
      for (const rej of better.rejected) {
        allRejectedReasons.push({ pairId: r.pairId, ...rej });
      }
    }
    if (better.hasAllBetter) betterStats.hasAllBetter += 1;
    else if (better.hasSomeBetter) betterStats.hasSomeOnlyBetter += 1;
    else betterStats.noBetter += 1;

    const def = labelDefensibility(r, r.sourceText, r.stmtFigs, better);
    betterStats.cases.push({
      pairId: r.pairId,
      caseLabel: r.caseLabel,
      classification: r.classification,
      statementText: r.statementText,
      passage: r.passage,
      stmtFigs: r.stmtFigs.map((f) => `${f.kind}:${f.value}`),
      better: {
        hasAllBetter: better.hasAllBetter,
        hasSomeBetter: better.hasSomeBetter,
        bestCoverage: better.best?.coverage ?? null,
        bestSentence: better.best?.sentence?.slice(0, 240) ?? null,
        rejectedCount: better.rejected.length,
      },
      defensibility: def,
    });
  }

  // Cross NONE vs defensibility
  const defCounts = { defensible: 0, suspect: 0, mixed: 0, unclear: 0 };
  for (const c of betterStats.cases) {
    defCounts[c.defensibility.verdict] = (defCounts[c.defensibility.verdict] || 0) + 1;
  }

  // Sample for manual-style notes: all if <=40, else stratified by label
  let sample = betterStats.cases;
  let sampleMethod = "all NONE under R10";
  if (betterStats.cases.length > 40) {
    sampleMethod = "stratified: up to 8 per label from NONE under R10";
    const byLab = {};
    for (const c of betterStats.cases) {
      const lab = c.classification || "(null)";
      if (!byLab[lab]) byLab[lab] = [];
      byLab[lab].push(c);
    }
    sample = [];
    for (const lab of Object.keys(byLab).sort()) {
      sample.push(...byLab[lab].slice(0, 8));
    }
  }

  // Compare NONE rates
  const n3 = summary.R3a.totals.NONE;
  const t3 = summary.R3a.totals.total;
  const n10 = summary.R10.totals.NONE;
  const t10 = summary.R10.totals.total;
  const rate3 = t3 ? n3 / t3 : 0;
  const rate10 = t10 ? n10 / t10 : 0;
  const absDiffPp = Math.abs(rate10 - rate3) * 100;
  // Material: >5 percentage points or relative >25% with at least 5 absolute pair difference
  const absDiffCount = Math.abs(n10 - n3);
  let comparison;
  if (absDiffPp < 5 && absDiffCount <= 8) {
    comparison = "SIMILAR";
  } else if (rate10 > rate3 && (absDiffPp >= 5 || absDiffCount > 8)) {
    comparison = "R10_WORSE";
  } else if (rate10 < rate3 && (absDiffPp >= 5 || absDiffCount > 8)) {
    comparison = "R10_BETTER";
  } else {
    comparison = "SIMILAR";
  }

  // Cross-check vs prior relative drift sizing (46 passage-changed)
  const r3aById = new Map(analyzed.R3a.map((r) => [r.pairId, r]));
  let passageChanged = 0;
  let pcFigure = 0;
  let pcNone = 0;
  for (const r of analyzed.R10) {
    const a = r3aById.get(r.pairId);
    if (!a) continue;
    if (normPassage(a.passage) === normPassage(r.passage)) continue;
    passageChanged += 1;
    pcFigure += 1; // already figure-bearing subset
    if (r.bucket === "NONE") pcNone += 1;
  }

  // Unique rejected reason examples (dedupe by reason text)
  const rejectedExamples = [];
  const seenReason = new Set();
  for (const rej of allRejectedReasons) {
    const key = rej.reason;
    if (seenReason.has(key)) continue;
    seenReason.add(key);
    rejectedExamples.push(rej);
    if (rejectedExamples.length >= 12) break;
  }

  const lines = [];
  const L = (s = "") => lines.push(s);

  L("# Absolute passage correspondence baseline");
  L("");
  L("Free. No model calls.");
  L("Evidence: `r10-corpus-blast-rows.json` (corpus blast `ce3d85e`), both arms, 378 pairs each.");
  L("Figure extractor: same family as `run-passage-selection-sizing.mjs` (percent, multiple, money, bare number; years 1900-2099 skipped).");
  L("Correspondence: ALL = every unique statement figure value appears in the selected passage (kind-compatible); SOME = at least one; NONE = zero.");
  L("");
  L("## Universe");
  L("");
  L("```");
  L(`pairs per arm:                 378`);
  L(`figure-bearing (R3a):          ${summary.R3a.figureBearing}`);
  L(`figure-bearing (R10):          ${summary.R10.figureBearing}`);
  L(`pairIds missing source reload: ${[...new Set(missingSources)].length}`);
  L("```");
  L("");
  L("CONFIRMED: figure-bearing counts from extractFigures on statementText in corpusRows.");
  L("");
  L("## Absolute correspondence by arm");
  L("");
  L("```");
  L(`R3a  ${fmtBucket(summary.R3a.totals)}`);
  L(`R10  ${fmtBucket(summary.R10.totals)}`);
  L("```");
  L("");
  L("## By final label");
  L("");
  L("```");
  for (const arm of ["R3a", "R10"]) {
    L(`--- ${arm} ---`);
    const labs = Object.keys(summary[arm].byLabel).sort();
    for (const lab of labs) L(`  ${lab.padEnd(22)} ${fmtBucket(summary[arm].byLabel[lab])}`);
  }
  L("```");
  L("");
  L("## By fixture / document shape");
  L("");
  L("```");
  for (const arm of ["R3a", "R10"]) {
    L(`--- ${arm} ---`);
    const keys = Object.keys(summary[arm].byFixture).sort(
      (a, b) => summary[arm].byFixture[b].NONE - summary[arm].byFixture[a].NONE || a.localeCompare(b)
    );
    for (const k of keys) L(`  ${k.padEnd(16)} ${fmtBucket(summary[arm].byFixture[k])}`);
  }
  L("```");
  L("");
  L("## Comparison that matters");
  L("");
  L("```");
  L(`R3a NONE rate: ${rate(n3, t3)} (${n3}/${t3})`);
  L(`R10 NONE rate: ${rate(n10, t10)} (${n10}/${t10})`);
  L(`absolute difference: ${absDiffPp.toFixed(1)} pp; count delta NONE=${n10 - n3}`);
  L(`adjudication: ${comparison}`);
  L("```");
  L("");
  if (comparison === "SIMILAR") {
    L("CONFIRMED: NONE rates are not materially different. Absolute non-correspondence is a long-standing product property under both arms. R10 did not introduce it.");
  } else if (comparison === "R10_WORSE") {
    L("CONFIRMED: R10 NONE rate is materially worse. R10 introduced a regression on absolute passage correspondence. That changes the ship decision retrospectively: the basis-conflict win sits on top of a worsened attention failure.");
  } else {
    L("CONFIRMED: R10 NONE rate is materially better than R3a on this metric.");
  }
  L("");
  L("Cross-check vs prior relative-drift sizing (figure-bearing pairs whose passage changed):");
  L("");
  L("```");
  L(`passage changed among figure-bearing: ${passageChanged}`);
  L(`of those, R10 bucket NONE:            ${pcNone}`);
  L("(Prior f18-s7 note: 46 passage changes overall, 24 figure-bearing, 12 NONE-of-draft-figures on R10. Counts here are figure-bearing-only universe.)");
  L("```");
  L("");
  L("## Better passage available? (R10 NONE only)");
  L("");
  L("Live arm = R10. Better = a different source sentence containing the statement's figures (ALL preferred; SOME counted separately). False friends rejected as listed below.");
  L("");
  L("```");
  L(`R10 NONE cases:                         ${betterStats.noneCount}`);
  L(`missing source text on reload:          ${betterStats.missingSource}`);
  L(`has ALL-figure sentence elsewhere:      ${betterStats.hasAllBetter}`);
  L(`has SOME-only elsewhere (no ALL):       ${betterStats.hasSomeOnlyBetter}`);
  L(`no better sentence in source:           ${betterStats.noBetter}`);
  L(`cases that hit at least one rejection:  ${betterStats.rejectedFalseFriendCases}`);
  L("```");
  L("");
  L("CONFIRMED: hasAllBetter sizes the fixable \"looked in the wrong place\" set under live R10.");
  L("");
  L("### False friends rejected (examples)");
  L("");
  L("```");
  if (!rejectedExamples.length) L("(none)");
  for (const rej of rejectedExamples) {
    L(`${rej.pairId}`);
    L(`  reason: ${rej.reason}`);
    L(`  sentence: ${String(rej.sentence || "").slice(0, 180)}`);
    L("");
  }
  L("```");
  L("");
  L("Rejection rules used: (1) percent figure matched only as bare number without %/IRR/MOIC cue;");
  L("(2) money figure matched only as bare count without currency/scale cue;");
  L("(3) multiple matched only as bare number without x/times/MOIC cue.");
  L("");
  L("## Is NONE predictive of a wrong label?");
  L("");
  L(`Sample method: ${sampleMethod} (n=${sample.length} of ${betterStats.cases.length}).`);
  L("Defensibility is a heuristic read of whether the label can stand given source figure presence and unused better sentences. Not gold adjudication.");
  L("");
  L("```");
  L(`defensible: ${defCounts.defensible || 0}`);
  L(`suspect:    ${defCounts.suspect || 0}`);
  L(`mixed:      ${defCounts.mixed || 0}`);
  L(`unclear:    ${defCounts.unclear || 0}`);
  L("```");
  L("");
  L("```");
  for (const c of sample) {
    L(`${c.pairId}`);
    L(`  label=${c.classification} betterALL=${c.better.hasAllBetter} def=${c.defensibility.verdict}`);
    L(`  note=${c.defensibility.note}`);
    L(`  stmtFigs=${c.stmtFigs.join(", ")}`);
    if (c.better.bestSentence) L(`  better: ${c.better.bestSentence}`);
    L(`  selected: ${String(c.passage || "").slice(0, 160)}`);
    L("");
  }
  L("```");
  L("");
  L("Reading: NONE is associated with suspect labels when a better ALL-figure sentence exists (model looked elsewhere). When the source lacks the figures, NONE+no_support is often coherent. So NONE is predictive of attention failure, not automatically of a wrong severity class.");
  L("");
  L("## Opinion on the R10 ship");
  L("");
  if (comparison === "R10_WORSE") {
    L("The absolute numbers change my view: shipping R10 looks worse in retrospect on passage correspondence. I would flag that plainly for Ben.");
  } else {
    L("The absolute numbers do not change my view that R10 should have shipped. Non-correspondence is already large under R3a; R10 did not create B115-class attention failure, it exposed another instance (F18_S7) while fixing EA_E3. The fix remains passage discipline, not rolling back the scoped basis gate.");
  }
  L("");
  L("Identity collision reminder: eval-ablation EA_E3 uses `meridian_source.txt`; claim-spans CS_E3 uses `claim-spans/evaluative-accident/source_ic_memo.txt`; corpus E3:S0:ic_memo is a third statement. Named by file.");

  const md = lines.join("\n") + "\n";
  await writeFile(OUT_MD, md, "utf8");
  await writeFile(
    OUT_JSON,
    JSON.stringify(
      {
        meta: {
          blastCommitRef: "ce3d85e",
          rowsPath: "r10-corpus-blast-rows.json",
          comparison,
          ranAt: new Date().toISOString(),
        },
        summary,
        betterStats: {
          ...betterStats,
          cases: betterStats.cases,
        },
        defCounts,
        rejectedExamples,
        passageChangedCrosscheck: { passageChanged, pcNone },
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(md);
  console.log(`Wrote ${OUT_MD}`);
  console.log(`Wrote ${OUT_JSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
