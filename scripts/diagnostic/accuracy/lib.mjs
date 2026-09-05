/**
 * Shared helpers for the 100-statement Review accuracy instrument.
 * No pipeline imports. Membership and sampling never read a verdict field.
 */

export const SAMPLE_SEED = 20260905;
export const F15_CAP = 6;
export const LABEL_BUDGET = 100;
export const GROUP_A_HARD_CAP = 25;
export const STABILITY_MISMATCH_THRESHOLD = 5;
export const ESCAPE_RATE_FALSIFIER = 0.15;
export const GROUP_B_BEN_CONFIRMED_FLOOR = 40;

export const BEN_LABELS = {
  C: "confirmed",
  P: "partially_confirmed",
  X: "conflicting",
  N: "no_support",
  E: "unrateable",
};

/**
 * Locked before the Stage 1 stability run. A mismatched slot is one index
 * (after padding the shorter list) where the two runs' normalised texts differ.
 */
export function normalizeStatementText(text) {
  return String(text ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

export function padFixtureId(id) {
  return String(id ?? "").padStart(2, "0");
}

export function joinKey(fixtureId, text, occurrence) {
  return `${padFixtureId(fixtureId)}::${normalizeStatementText(text)}::${Number(occurrence) || 0}`;
}

export function addOccurrenceIndices(statements) {
  const seen = new Map();
  return statements.map((row) => {
    const fid = padFixtureId(row.fixtureId);
    const norm = normalizeStatementText(row.text);
    const key = `${fid}::${norm}`;
    const occurrence = seen.get(key) || 0;
    seen.set(key, occurrence + 1);
    return { ...row, fixtureId: fid, occurrence };
  });
}

export function fixtureTexts(run, fixtureId) {
  const fid = padFixtureId(fixtureId);
  const fixtures = Array.isArray(run?.fixtures) ? run.fixtures : [];
  const row = fixtures.find((f) => padFixtureId(f.fixtureId) === fid);
  const statements = Array.isArray(row?.statements) ? row.statements : [];
  return statements.map((s) => normalizeStatementText(s?.text));
}

/**
 * @returns {{ mismatchedSlots: number, diffs: object[] }}
 */
export function countMismatchedSlots(run1, run2) {
  const ids = new Set();
  for (const run of [run1, run2]) {
    for (const f of Array.isArray(run?.fixtures) ? run.fixtures : []) {
      ids.add(padFixtureId(f.fixtureId));
    }
  }
  const diffs = [];
  let mismatchedSlots = 0;
  for (const id of [...ids].sort()) {
    const a = fixtureTexts(run1, id);
    const b = fixtureTexts(run2, id);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      const left = a[i] ?? "";
      const right = b[i] ?? "";
      if (left !== right) {
        mismatchedSlots += 1;
        diffs.push({
          fixtureId: id,
          index: i,
          run1: a[i] ?? null,
          run2: b[i] ?? null,
        });
      }
    }
  }
  return { mismatchedSlots, diffs };
}

export function flattenStatements(statementsDoc) {
  const out = [];
  for (const fx of Array.isArray(statementsDoc?.fixtures) ? statementsDoc.fixtures : []) {
    const fixtureId = padFixtureId(fx.fixtureId);
    const statements = Array.isArray(fx.statements) ? fx.statements : [];
    for (const s of statements) {
      out.push({
        fixtureId,
        label: fx.label ?? "",
        index: Number.isFinite(s?.index) ? s.index : out.length,
        text: typeof s?.text === "string" ? s.text : "",
        charStart: Number.isFinite(s?.charStart) ? s.charStart : null,
        charEnd: Number.isFinite(s?.charEnd) ? s.charEnd : null,
        occurrence: Number.isFinite(s?.occurrence) ? s.occurrence : 0,
      });
    }
  }
  return addOccurrenceIndices(out.map((row) => ({ ...row, occurrence: undefined })));
}

/**
 * A statement joins Group A if its text contains the design span.
 * Reads only faults[].fixtureId and faults[].span. Ignores any verdict field.
 */
export function mapGroupA(statements, design) {
  const faults = Array.isArray(design?.faults) ? design.faults : [];
  const mapping = [];
  const groupAByKey = new Map();
  for (const fault of faults) {
    const fixtureId = padFixtureId(fault.fixtureId);
    const span = typeof fault.span === "string" ? fault.span : "";
    const matches = statements.filter(
      (s) => padFixtureId(s.fixtureId) === fixtureId && String(s.text || "").includes(span)
    );
    const status =
      matches.length === 1 ? "unique" : matches.length === 0 ? "unmapped" : "ambiguous";
    mapping.push({
      id: fault.id,
      fixtureId,
      span,
      status,
      matchCount: matches.length,
      keys: matches.map((s) => joinKey(s.fixtureId, s.text, s.occurrence)),
    });
    if (status === "unique") {
      const stmt = matches[0];
      const key = joinKey(stmt.fixtureId, stmt.text, stmt.occurrence);
      const existing = groupAByKey.get(key);
      if (existing) {
        existing.designIds.push(fault.id);
      } else {
        groupAByKey.set(key, {
          fixtureId: stmt.fixtureId,
          text: stmt.text,
          occurrence: stmt.occurrence,
          charStart: stmt.charStart,
          charEnd: stmt.charEnd,
          index: stmt.index,
          designIds: [fault.id],
        });
      }
    }
  }
  const groupA = [...groupAByKey.values()].sort(
    (a, b) => a.fixtureId.localeCompare(b.fixtureId) || a.index - b.index
  );
  const failed = mapping.filter((m) => m.status !== "unique");
  return { groupA, mapping, failed };
}

export function mulberry32(seed) {
  let a = seed | 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function hamiltonAllocate(weights, total) {
  const ids = Object.keys(weights).sort();
  const sumW = ids.reduce((s, id) => s + Number(weights[id] || 0), 0);
  if (total <= 0 || sumW <= 0) {
    return Object.fromEntries(ids.map((id) => [id, 0]));
  }
  const rows = ids.map((id) => {
    const exact = (total * Number(weights[id] || 0)) / sumW;
    const n = Math.floor(exact);
    return { id, n, rem: exact - n };
  });
  let left = total - rows.reduce((s, r) => s + r.n, 0);
  const byRem = [...rows].sort((a, b) => b.rem - a.rem || a.id.localeCompare(b.id));
  for (let i = 0; i < byRem.length && left > 0; i += 1) {
    byRem[i].n += 1;
    left -= 1;
  }
  return Object.fromEntries(rows.map((r) => [r.id, r.n]));
}

function applyF15Cap(allocation, weights, cap) {
  const alloc = { ...allocation };
  const f15 = alloc["15"] || 0;
  if (f15 <= cap) {
    return { allocation: alloc, excessRedistributed: 0 };
  }
  const excess = f15 - cap;
  alloc["15"] = cap;
  const others = {};
  for (const [id, w] of Object.entries(weights)) {
    if (id !== "15") others[id] = w;
  }
  const extra = hamiltonAllocate(others, excess);
  for (const [id, n] of Object.entries(extra)) {
    alloc[id] = (alloc[id] || 0) + n;
  }
  return { allocation: alloc, excessRedistributed: excess };
}

function capToPoolSize(allocation, pools) {
  const alloc = { ...allocation };
  let leftover = 0;
  for (const id of Object.keys(alloc)) {
    const cap = (pools.get(id) || []).length;
    if (alloc[id] > cap) {
      leftover += alloc[id] - cap;
      alloc[id] = cap;
    }
  }
  if (leftover <= 0) return alloc;
  const spareWeights = {};
  for (const [id, pool] of pools.entries()) {
    const spare = pool.length - (alloc[id] || 0);
    if (spare > 0) spareWeights[id] = spare;
  }
  const extra = hamiltonAllocate(spareWeights, leftover);
  for (const [id, n] of Object.entries(extra)) {
    const cap = (pools.get(id) || []).length;
    alloc[id] = Math.min(cap, (alloc[id] || 0) + n);
  }
  return alloc;
}

export function sampleGroupB({ statements, groupAKeys, seed, targetCount, f15Cap }) {
  const aKeys = new Set(groupAKeys);
  const nonA = statements.filter((s) => !aKeys.has(joinKey(s.fixtureId, s.text, s.occurrence)));
  const pools = new Map();
  for (const s of nonA) {
    const id = padFixtureId(s.fixtureId);
    if (!pools.has(id)) pools.set(id, []);
    pools.get(id).push(s);
  }
  const rawWeights = {};
  for (const [id, pool] of [...pools.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rawWeights[id] = pool.length;
  }
  const allocationBeforeCap = hamiltonAllocate(rawWeights, targetCount);
  const capped = applyF15Cap(allocationBeforeCap, rawWeights, f15Cap);
  const allocationAfterCap = capToPoolSize(capped.allocation, pools);
  const rand = mulberry32(seed);
  const groupB = [];
  const drawnPerFixture = {};
  for (const id of Object.keys(allocationAfterCap).sort()) {
    const need = allocationAfterCap[id] || 0;
    const pool = [...(pools.get(id) || [])];
    shuffleInPlace(pool, rand);
    const drawn = pool.slice(0, need);
    drawnPerFixture[id] = drawn.length;
    for (const s of drawn) {
      groupB.push({
        fixtureId: s.fixtureId,
        text: s.text,
        occurrence: s.occurrence,
        charStart: s.charStart,
        charEnd: s.charEnd,
        index: s.index,
      });
    }
  }
  groupB.sort((a, b) => a.fixtureId.localeCompare(b.fixtureId) || a.index - b.index);
  return {
    groupB,
    rawWeights,
    allocationBeforeCap,
    allocationAfterCap,
    drawnPerFixture,
    excessRedistributed: capped.excessRedistributed,
    nonACount: nonA.length,
  };
}

export function wilsonInterval(agreements, n, z = 1.96) {
  if (!Number.isFinite(n) || n <= 0) {
    return { rate: null, low: null, high: null };
  }
  const k = Number(agreements) || 0;
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / den;
  return {
    rate: p,
    low: Math.max(0, centre - margin),
    high: Math.min(1, centre + margin),
  };
}

export function mapBenLabel(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s === "null") return null;
  const upper = s.toUpperCase();
  if (BEN_LABELS[upper]) return BEN_LABELS[upper];
  const lower = s.toLowerCase().replace(/ /g, "_");
  if (lower === "confirmed") return "confirmed";
  if (lower === "partially_confirmed" || lower === "partial") return "partially_confirmed";
  if (lower === "conflicting" || lower === "conflict") return "conflicting";
  if (lower === "no_support" || lower === "not_supported") return "no_support";
  if (lower === "unrateable" || lower === "e" || lower === "cannot_rate" || lower === "escape") {
    return "unrateable";
  }
  return null;
}

/**
 * Card displayVerdict is supported_full / supported_partial / conflict / not_supported
 * (lib/qc/pipeline-v3/stage7-assemble-card.mjs L413-417). Map onto the label vocabulary.
 */
export function mapDisplayVerdict(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/ /g, "_");
  if (s === "supported_full" || s === "confirmed" || s === "supported") return "confirmed";
  if (s === "supported_partial" || s === "partially_confirmed" || s === "partial") {
    return "partially_confirmed";
  }
  if (s === "conflict" || s === "conflicting") return "conflicting";
  if (s === "not_supported" || s === "no_support" || s === "no_clear_support") return "no_support";
  return null;
}

function pairClassifications(card) {
  const pairs = Array.isArray(card?.sourceMatches)
    ? card.sourceMatches
    : Array.isArray(card?.stage2)
      ? card.stage2
      : [];
  return pairs.map((p) => mapDisplayVerdict(p?.classification) || mapBenLabel(p?.classification));
}

export function isAnyConfirmedWinsDisagreement(benLabel, card) {
  if (benLabel !== "conflicting") return false;
  const pipe = mapDisplayVerdict(card?.displayVerdict);
  if (pipe !== "confirmed") return false;
  const classes = pairClassifications(card);
  const hasConflictFlag = card?.hasConflict === true || classes.includes("conflicting");
  return hasConflictFlag;
}

const RATEABLE = new Set(["confirmed", "partially_confirmed", "conflicting", "no_support"]);

function emptyConfusion() {
  const keys = [...RATEABLE];
  const grid = {};
  for (const b of keys) {
    grid[b] = {};
    for (const p of keys) grid[b][p] = 0;
  }
  return grid;
}

function scoreOneGroup(rows) {
  const confusion = emptyConfusion();
  const disagreements = [];
  let agreements = 0;
  let benConfirmed = 0;
  let pipelineAlsoConfirmed = 0;
  const anyConfirmedWins = [];
  for (const row of rows) {
    const ben = row.ben;
    const pipe = row.pipe;
    if (!RATEABLE.has(ben) || !RATEABLE.has(pipe)) continue;
    confusion[ben][pipe] += 1;
    if (ben === "confirmed") {
      benConfirmed += 1;
      if (pipe === "confirmed") pipelineAlsoConfirmed += 1;
    }
    if (ben === pipe) {
      agreements += 1;
    } else {
      const rec = {
        fixtureId: row.fixtureId,
        statementText: row.text,
        occurrence: row.occurrence,
        benLabel: ben,
        pipelineDisplayVerdict: row.displayVerdict,
        pipelineMapped: pipe,
      };
      disagreements.push(rec);
      if (isAnyConfirmedWinsDisagreement(ben, row.card)) {
        anyConfirmedWins.push(rec);
      }
    }
  }
  const n = rows.filter((r) => RATEABLE.has(r.ben) && RATEABLE.has(r.pipe)).length;
  const interval = wilsonInterval(agreements, n);
  return {
    n,
    agreements,
    rate: interval.rate,
    wilson95: interval,
    confusion,
    disagreements,
    anyConfirmedWinsCount: anyConfirmedWins.length,
    anyConfirmedWins,
    benConfirmed,
    pipelineAlsoConfirmed,
    leaveAloneRate: benConfirmed > 0 ? pipelineAlsoConfirmed / benConfirmed : null,
    leaveAloneWilson95: wilsonInterval(pipelineAlsoConfirmed, benConfirmed),
  };
}

/**
 * Score labels against pipeline cards. Never averages Group A and Group B.
 */
export function scoreAccuracy({ labels, cards, groupAKeys, groupBKeys }) {
  const cardByKey = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    const key = joinKey(card.fixtureId, card.statement ?? card.text ?? card.statementText, card.occurrence);
    cardByKey.set(key, card);
  }
  const unmatchedLabels = [];
  const matched = [];
  for (const row of Array.isArray(labels) ? labels : []) {
    const ben = mapBenLabel(row.label);
    if (ben == null) continue;
    const key = joinKey(row.fixtureId, row.statementText ?? row.text, row.occurrence);
    const card = cardByKey.get(key);
    if (!card) {
      unmatchedLabels.push({
        fixtureId: padFixtureId(row.fixtureId),
        statementText: row.statementText ?? row.text,
        occurrence: row.occurrence || 0,
        label: ben,
      });
      continue;
    }
    cardByKey.delete(key);
    matched.push({
      key,
      fixtureId: padFixtureId(row.fixtureId),
      text: row.statementText ?? row.text,
      occurrence: row.occurrence || 0,
      ben,
      card,
      displayVerdict: card.displayVerdict,
      pipe: mapDisplayVerdict(card.displayVerdict),
      group: groupAKeys.has(key) ? "A" : groupBKeys.has(key) ? "B" : null,
    });
  }
  const unmatchedPredictions = [...cardByKey.values()].map((card) => ({
    fixtureId: padFixtureId(card.fixtureId),
    statementText: card.statement ?? card.text ?? card.statementText,
    occurrence: card.occurrence || 0,
    displayVerdict: card.displayVerdict,
  }));

  const escapes = matched.filter((r) => r.ben === "unrateable");
  const escapePerFixture = {};
  for (const row of escapes) {
    escapePerFixture[row.fixtureId] = (escapePerFixture[row.fixtureId] || 0) + 1;
  }

  const rateable = matched.filter((r) => RATEABLE.has(r.ben) && RATEABLE.has(r.pipe));
  const groupARows = rateable.filter((r) => r.group === "A");
  const groupBRows = rateable.filter((r) => r.group === "B");

  const groupA = scoreOneGroup(groupARows);
  const groupB = scoreOneGroup(groupBRows);

  const labelledCount = matched.length;
  const escapeRate = labelledCount > 0 ? escapes.length / labelledCount : 0;

  return {
    groupA: {
      n: groupA.n,
      agreements: groupA.agreements,
      rate: groupA.rate,
      wilson95: groupA.wilson95,
      confusion: groupA.confusion,
      disagreements: groupA.disagreements,
    },
    groupB: {
      n: groupB.n,
      agreements: groupB.agreements,
      rate: groupB.rate,
      wilson95: groupB.wilson95,
      confusion: groupB.confusion,
      disagreements: groupB.disagreements,
      amongBenConfirmed: {
        n: groupB.benConfirmed,
        pipelineAlsoConfirmed: groupB.pipelineAlsoConfirmed,
        rate: groupB.leaveAloneRate,
        wilson95: groupB.leaveAloneWilson95,
      },
    },
    anyConfirmedWins: {
      count: groupA.anyConfirmedWinsCount + groupB.anyConfirmedWinsCount,
      groupA: groupA.anyConfirmedWinsCount,
      groupB: groupB.anyConfirmedWinsCount,
      rows: [...groupA.anyConfirmedWins, ...groupB.anyConfirmedWins],
    },
    escapes: {
      count: escapes.length,
      rate: escapeRate,
      perFixture: escapePerFixture,
    },
    unmatchedLabels,
    unmatchedPredictions,
    falsifiers: {
      escapeRate,
      escapeRateOver15: escapeRate > ESCAPE_RATE_FALSIFIER,
      groupBBenConfirmed: groupB.benConfirmed,
      groupBBenConfirmedBelow40: groupB.benConfirmed < GROUP_B_BEN_CONFIRMED_FLOOR,
    },
  };
}

export function formatScoreReport(result) {
  const lines = [];
  const dumpGroup = (name, g) => {
    lines.push(`GROUP ${name}`);
    lines.push(`  n=${g.n} agreements=${g.agreements} rate=${g.rate == null ? "n/a" : g.rate.toFixed(4)}`);
    const w = g.wilson95;
    lines.push(
      `  wilson95=[${w.low == null ? "n/a" : w.low.toFixed(4)}, ${w.high == null ? "n/a" : w.high.toFixed(4)}]`
    );
    lines.push("  confusion (rows=Ben, cols=pipeline):");
    const keys = ["confirmed", "partially_confirmed", "conflicting", "no_support"];
    lines.push(`    ${keys.join(" ")}`);
    for (const b of keys) {
      lines.push(`    ${b} ${keys.map((p) => g.confusion[b][p]).join(" ")}`);
    }
    lines.push("  disagreements:");
    if (g.disagreements.length === 0) {
      lines.push("    (none)");
    } else {
      for (const d of g.disagreements) {
        lines.push(
          `    ${d.fixtureId} ben=${d.benLabel} pipeline=${d.pipelineMapped} displayVerdict=${d.pipelineDisplayVerdict}`
        );
        lines.push(`      ${d.statementText}`);
      }
    }
  };
  dumpGroup("A", result.groupA);
  dumpGroup("B", result.groupB);
  const leave = result.groupB.amongBenConfirmed;
  lines.push("GROUP B among Ben-Confirmed (leave-alone)");
  lines.push(
    `  n=${leave.n} pipelineAlsoConfirmed=${leave.pipelineAlsoConfirmed} rate=${leave.rate == null ? "n/a" : leave.rate.toFixed(4)}`
  );
  lines.push(
    `  wilson95=[${leave.wilson95.low == null ? "n/a" : leave.wilson95.low.toFixed(4)}, ${leave.wilson95.high == null ? "n/a" : leave.wilson95.high.toFixed(4)}]`
  );
  lines.push(
    `ANY-CONFIRMED-WINS disagreements: ${result.anyConfirmedWins.count} (A=${result.anyConfirmedWins.groupA} B=${result.anyConfirmedWins.groupB})`
  );
  for (const d of result.anyConfirmedWins.rows) {
    lines.push(`  ${d.fixtureId} ${d.statementText}`);
  }
  lines.push(`ESCAPES: ${result.escapes.count} rate=${result.escapes.rate.toFixed(4)}`);
  lines.push(`  perFixture: ${JSON.stringify(result.escapes.perFixture)}`);
  lines.push(`UNMATCHED LABELS: ${result.unmatchedLabels.length}`);
  for (const u of result.unmatchedLabels) {
    lines.push(`  ${u.fixtureId} #${u.occurrence} ${u.statementText}`);
  }
  lines.push(`UNMATCHED PREDICTIONS: ${result.unmatchedPredictions.length}`);
  for (const u of result.unmatchedPredictions) {
    lines.push(`  ${u.fixtureId} #${u.occurrence} ${u.statementText}`);
  }
  if (result.falsifiers.escapeRateOver15) {
    lines.push(
      `FALSIFIER: escape rate ${result.escapes.rate.toFixed(4)} is above 15 percent. The statement unit is the wrong grain.`
    );
  }
  if (result.falsifiers.groupBBenConfirmedBelow40) {
    lines.push(
      `FALSIFIER: Group B Ben-Confirmed n=${result.falsifiers.groupBBenConfirmed} is below 40. The false-alarm number cannot be spoken aloud.`
    );
  }
  return lines.join("\n");
}

export function designHasVerdictFields(design) {
  const blob = JSON.stringify(design);
  return /"displayVerdict"|"qcCards"|"evidenceSummary"|"classification"|"commentary"/.test(blob);
}

export const WORKSHEET_PIPELINE_IMPORT_PATTERNS = [
  "pipeline-v4",
  "runPipeline",
  "displayVerdict",
  "qcCards",
  "evidenceSummary",
  "extractStatements",
  "stage2-match",
  "result.json",
];
