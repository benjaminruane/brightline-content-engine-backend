/**
 * Stage-replay helpers (B270). No LLM imports. Vitest can load this file.
 */

export const DEFAULT_HOUSE = "Halden Group";
export const DEFAULT_OUTPUT_TYPE = "reporting_commentary";
export const DEFAULT_REQUIRED_VERSION = "complete";

export function editorialSucceeded(qcCard) {
  const v = typeof qcCard?.editorialVerdict === "string" ? qcCard.editorialVerdict.trim() : "";
  return v === "clean" || v === "concern";
}

export function complianceSucceeded(qcCard) {
  const v = typeof qcCard?.complianceVerdict === "string" ? qcCard.complianceVerdict.trim() : "";
  return v === "clean" || v === "hard_concern" || v === "soft_concern";
}

export function concernCodes(qcCard, signal) {
  const key = signal === "compliance" ? "complianceConcerns" : "editorialConcerns";
  const list = Array.isArray(qcCard?.[key]) ? qcCard[key] : [];
  return list
    .map((c) => (typeof c?.concernCode === "string" ? c.concernCode.trim() : ""))
    .filter(Boolean)
    .slice()
    .sort();
}

export function signalVerdict(qcCard, signal) {
  if (signal === "compliance") {
    return typeof qcCard?.complianceVerdict === "string" ? qcCard.complianceVerdict : "not_reviewed";
  }
  return typeof qcCard?.editorialVerdict === "string" ? qcCard.editorialVerdict : "not_reviewed";
}

export function loadReviewStatements(payload) {
  const statements = Array.isArray(payload?.statements) ? payload.statements : [];
  return statements.map((s, i) => {
    const text = typeof s?.text === "string" ? s.text : "";
    const qc = s?.qcCard && typeof s.qcCard === "object" ? s.qcCard : {};
    const index = Number.isFinite(qc.index) ? qc.index : i;
    return { index, text, qcCard: qc };
  });
}

export function reconstructDraft(payload) {
  if (typeof payload?._auditDraft === "string" && payload._auditDraft.trim()) {
    return payload._auditDraft;
  }
  return loadReviewStatements(payload)
    .map((s) => s.text)
    .join(" ");
}

export function reconstructSources(payload) {
  return Array.isArray(payload?.sources) ? payload.sources : [];
}

/**
 * Neighbours from the FULL recorded memo, not from the subset.
 * A 40-statement slice must not rewrite CONTEXT BEFORE / AFTER.
 */
export function neighbourTexts(allStatements, index) {
  const pos = allStatements.findIndex((s) => s.index === index);
  const i = pos >= 0 ? pos : index;
  const prev = i > 0 ? allStatements[i - 1] : null;
  const next = i >= 0 && i < allStatements.length - 1 ? allStatements[i + 1] : null;
  return {
    previousStatementText: prev && typeof prev.text === "string" ? prev.text : null,
    nextStatementText: next && typeof next.text === "string" ? next.text : null,
  };
}

function spreadPick(list, n) {
  if (n <= 0) return [];
  if (list.length <= n) return list.slice();
  const out = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (list.length - 1)) / (n - 1));
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(list[idx]);
  }
  for (let i = 0; out.length < n && i < list.length; i++) {
    if (seen.has(i)) continue;
    seen.add(i);
    out.push(list[i]);
  }
  return out;
}

/**
 * 40 statements from succeeded editorial cards, mixed concern/clean, spread
 * across the memo so first, middle, and last are represented.
 */
export function selectSubset(allStatements, n, signal = "editorial") {
  const ok = allStatements.filter((s) =>
    signal === "compliance" ? complianceSucceeded(s.qcCard) : editorialSucceeded(s.qcCard)
  );
  const concerns = ok.filter((s) => {
    const v = signalVerdict(s.qcCard, signal);
    return v === "concern" || v === "hard_concern" || v === "soft_concern";
  });
  const cleans = ok.filter((s) => signalVerdict(s.qcCard, signal) === "clean");
  if (ok.length <= n) return ok.map((s) => s.index);
  const nConcern = Math.min(concerns.length, Math.round((n * concerns.length) / Math.max(1, ok.length)));
  const nClean = Math.min(cleans.length, n - nConcern);
  const picked = [...spreadPick(concerns, nConcern), ...spreadPick(cleans, nClean)];
  const seen = new Set(picked.map((s) => s.index));
  const extra = n - picked.length;
  if (extra > 0) {
    for (const s of spreadPick(ok, ok.length)) {
      if (seen.has(s.index)) continue;
      picked.push(s);
      seen.add(s.index);
      if (picked.length >= n) break;
    }
  }
  return picked.map((s) => s.index).sort((a, b) => a - b);
}

export function codesKey(codes) {
  return JSON.stringify(Array.isArray(codes) ? codes.slice().sort() : []);
}

export function diffRuns(runA, runB, signal = "editorial") {
  const byIndexA = new Map((runA.statements || []).map((s) => [s.index, s]));
  const byIndexB = new Map((runB.statements || []).map((s) => [s.index, s]));
  const indexes = [...new Set([...byIndexA.keys(), ...byIndexB.keys()])].sort((a, b) => a - b);
  const rows = [];
  let bothSucceeded = 0;
  let codesDiffer = 0;
  let verdictDiffer = 0;
  for (const index of indexes) {
    const a = byIndexA.get(index);
    const b = byIndexB.get(index);
    if (!a || !b) {
      rows.push({ index, inBoth: false, bothSucceeded: false });
      continue;
    }
    const aOk = a.succeeded === true;
    const bOk = b.succeeded === true;
    const both = aOk && bOk;
    if (both) bothSucceeded += 1;
    const codeChanged = codesKey(a.codes) !== codesKey(b.codes);
    const verdictChanged = a.verdict !== b.verdict;
    if (both && codeChanged) codesDiffer += 1;
    if (both && verdictChanged) verdictDiffer += 1;
    rows.push({
      index,
      inBoth: true,
      bothSucceeded: both,
      aVerdict: a.verdict,
      bVerdict: b.verdict,
      aCodes: a.codes,
      bCodes: b.codes,
      codesDiffer: both && codeChanged,
      verdictDiffer: both && verdictChanged,
    });
  }
  return {
    signal,
    compared: indexes.length,
    bothSucceeded,
    codesDiffer,
    verdictDiffer,
    moved: codesDiffer + verdictDiffer > 0,
    rows,
  };
}

export function honestyAgainstStored(replay, allStatements, signal = "editorial") {
  const storedByIndex = new Map(allStatements.map((s) => [s.index, s]));
  const rows = [];
  let storedSucceeded = 0;
  let matched = 0;
  let mismatched = 0;
  for (const rec of replay.statements || []) {
    const stored = storedByIndex.get(rec.index);
    if (!stored) continue;
    const ok =
      signal === "compliance" ? complianceSucceeded(stored.qcCard) : editorialSucceeded(stored.qcCard);
    if (!ok) continue;
    storedSucceeded += 1;
    const storedCodes = concernCodes(stored.qcCard, signal);
    const storedVerdict = signalVerdict(stored.qcCard, signal);
    const codesMatch = codesKey(storedCodes) === codesKey(rec.codes);
    const verdictMatch = storedVerdict === rec.verdict;
    const hit = codesMatch && verdictMatch;
    if (hit) matched += 1;
    else mismatched += 1;
    rows.push({
      index: rec.index,
      storedVerdict,
      replayVerdict: rec.verdict,
      storedCodes,
      replayCodes: rec.codes,
      match: hit,
    });
  }
  return { storedSucceeded, matched, mismatched, rows };
}

export function listCostFromSpend(spend, pricing) {
  const byModel = spend?.byModel && typeof spend.byModel === "object" ? spend.byModel : {};
  let usd = 0;
  for (const [key, bucket] of Object.entries(byModel)) {
    const slash = key.indexOf("/");
    const provider = slash >= 0 ? key.slice(0, slash) : "openai";
    const model = slash >= 0 ? key.slice(slash + 1) : key;
    const rate = pricing?.[provider]?.[model];
    if (!rate) continue;
    usd += ((Number(bucket.inputTokens) || 0) / 1_000_000) * rate.input;
    usd += ((Number(bucket.outputTokens) || 0) / 1_000_000) * rate.output;
  }
  return usd;
}

export function cacheHitRate(spend) {
  const input = Number(spend?.inputTokens) || 0;
  const cached = Number(spend?.cachedInputTokens) || 0;
  return input > 0 ? cached / input : 0;
}

export function emptyEditorialCard() {
  return {
    suppressInQcWorkbench: false,
    editorialVerdict: null,
    editorialConcerns: null,
    editorialNote: null,
    editorialSuggestedDirection: null,
    editorialSuggestedRewrite: null,
    complianceVerdict: null,
    complianceConcerns: null,
    complianceNote: null,
    complianceSuggestedDirection: null,
    complianceSuggestedRewrite: null,
  };
}
