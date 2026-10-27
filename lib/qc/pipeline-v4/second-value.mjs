/**
 * B441. A source that states a second value for the same quantity is not
 * a confirmation of the first. No model call.
 *
 * The quantity is the measure phrase that belongs to the figure: the nearest
 * phrase with no other figure between them. A phrase after a different number
 * does not name this one. Unnamed figures do not pair. A broad label
 * (any margin, any growth, a stake) does not pair.
 *
 * A second number is a different quantity, and is not reported, when the
 * period, the basis, the scenario, or the subject differs, when either
 * number is only a bound of a range, or when the difference is rounding.
 */

import { locatePassageInSource } from "./stage2-match-multipassage.mjs";

const PERCENT = [
  ["gross margin", "gross_margin"],
  ["ebitda margin", "ebitda_margin"],
  ["operating margin", "operating_margin"],
  ["net margin", "net_margin"],
  ["revenue growth", "revenue_growth"],
  ["arr growth", "arr_growth"],
  ["ebitda growth", "ebitda_growth"],
  ["net irr", "irr"],
  ["margin", "margin_unspecified"],
  ["growth", "growth_unspecified"],
  ["irr", "irr"],
  ["moic", "moic"],
  ["cagr", "cagr"],
];

const MONEY = [
  ["annual recurring revenue", "arr"],
  ["assets under management", "aum"],
  ["enterprise value", "enterprise_value"],
  ["recurring revenue", "arr"],
  ["net debt", "debt"],
  ["revenue", "revenue"],
  ["ebitda", "ebitda"],
  ["equity", "equity"],
  ["valuation", "valuation"],
  ["cash", "cash"],
  ["debt", "debt"],
  ["arr", "arr"],
  ["aum", "aum"],
];

const BROAD = new Set(["margin_unspecified", "growth_unspecified", "ownership", "proceeds"]);

const GENERIC = new Set([
  "company", "group", "firm", "business", "team", "total", "management", "our", "its",
  "the", "this", "that", "has", "have", "with", "from", "into", "over", "under",
  "across", "within", "between", "generates", "generate", "generated", "representing",
  "represents", "represented", "stands", "stand", "was", "were", "is", "are", "been",
    "approximately", "around", "about", "only", "broadly", "modestly", "million",
  "billion", "percent", "cent", "trailing", "twelve", "months", "basis",
  "employs", "employ", "people", "headcount", "staff",
]);

const SCOPE = new Set([
  "infrastructure", "semiconductor", "nordic", "international", "wholesale", "retail",
  "flagship", "regional", "domestic", "european", "segment", "division", "channel",
  "subsidiary", "parent", "automotive", "aerospace",
]);

const FORECAST = /\b(expect(?:ed)?|forecast|projected|we project|expanding|by\s+(?:19|20)\d{2})\b/i;
const CURRENT = /\b(trailing|ttm|ltm|current|today|as of)\b/i;
const ENTRY = /\b(at entry|at the time of (?:our )?investment|upon entry)\b/i;
const EXIT = /\bat exit\b/i;
const PRIOR = /\b((?:two|three|several) years? prior|previously|prior year|last year)\b/i;
const YEAR_IN = /\bin\s+((?:19|20)\d{2})\b|\bfor\s+(?:the\s+)?(?:year\s+)?(?:ended\s+)?((?:19|20)\d{2})\b/i;

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
}

function displayedNumber(raw) {
  const m = String(raw || "").replace(/[,']/g, "").replace(/\u2019/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function placesOf(n) {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

function isRounding(aRaw, bRaw) {
  const a = displayedNumber(aRaw);
  const b = displayedNumber(bRaw);
  if (a == null || b == null) return false;
  if (a === b) return true;
  const rounded = Number(b.toFixed(placesOf(a)));
  if (Math.abs(rounded - a) < 1e-9) return true;
  const other = Number(a.toFixed(placesOf(b)));
  return Math.abs(other - b) < 1e-9;
}

function isBreak(text, index) {
  const ch = text[index];
  if (ch === ";" || ch === "!" || ch === "?") return true;
  if (ch === "\n") {
    if (text[index + 1] === "\n") return true;
    const prev = text.slice(0, index).trimEnd();
    const last = prev[prev.length - 1] || "";
    return last === "." || last === ";" || last === "!" || last === "?" || last === ":";
  }
  if (ch !== ".") return false;
  const prev = text[index - 1] || "";
  const next = text[index + 1] || "";
  if (/\d/.test(prev) && /\d/.test(next)) return false;
  return true;
}

function clauseBounds(text, index) {
  let start = 0;
  let end = text.length;
  for (let i = index - 1; i >= 0; i--) {
    if (isBreak(text, i)) {
      start = i + 1;
      break;
    }
  }
  for (let i = index; i < text.length; i++) {
    if (isBreak(text, i)) {
      end = text[i] === "\n" ? i : i + 1;
      break;
    }
  }
  return { start, end, text: text.slice(start, end) };
}

function phraseHits(sentence, phrases) {
  const hits = [];
  for (const [phrase, id] of phrases) {
    const re = new RegExp(`\\b${escapeRe(phrase)}\\b`, "gi");
    let m;
    while ((m = re.exec(sentence))) {
      const start = m.index;
      const end = start + m[0].length;
      if (hits.some((h) => start >= h.start && end <= h.end)) continue;
      hits.push({ start, end, id, len: end - start });
    }
  }
  return hits;
}

function between(a, b, figures) {
  const left = Math.min(a, b);
  const right = Math.max(a, b);
  return figures.some((fig) => fig.start >= left && fig.end <= right);
}

function gapTo(hit, fig) {
  if (hit.end <= fig.start) return fig.start - hit.end;
  if (hit.start >= fig.end) return hit.start - fig.end;
  return 0;
}

function blocked(hit, fig, figures) {
  const left = hit.end <= fig.start ? hit.end : fig.end;
  const right = hit.end <= fig.start ? fig.start : hit.start;
  return between(left, right, figures.filter((row) => row !== fig));
}

function assignMetric(fig, hits, figures) {
  let best = null;
  for (const hit of hits) {
    if (blocked(hit, fig, figures)) continue;
    const gap = gapTo(hit, fig);
    const nearer = figures.some((other) => {
      if (other === fig || blocked(hit, other, figures)) return false;
      const otherGap = gapTo(hit, other);
      if (otherGap < gap) return true;
      if (otherGap === gap && other.start < fig.start) return true;
      return false;
    });
    if (nearer) continue;
    if (!best || gap < best.gap || (gap === best.gap && hit.len > best.len)) {
      best = { id: hit.id, gap, len: hit.len, start: hit.start, end: hit.end };
    }
  }
  return best;
}

function collectFigures(text) {
  const t = typeof text === "string" ? text : "";
  const rough = [];
  const percentRe = /(\d+(?:\.\d+)?)\s*(?:%|(?:per\s?cent)\b)/gi;
  const moneyRe = /(USD|EUR|GBP|AUD|CAD|\$|€|£)\s*([\d,.'\u2019]+)\s*(million|billion|thousand|mm|bn|k|m)?\b|([\d,.'\u2019]+)\s*(million|billion|thousand|mm|bn)\b/gi;
  const headRe = /\b(?:employs|headcount|team of|staff of)\s+(\d{2,6})\b|\b(\d{2,6})\s+people\b/gi;
  let m;
  while ((m = percentRe.exec(t))) {
    rough.push({ kind: "percent", start: m.index, end: m.index + m[0].length, raw: m[0], phrases: PERCENT });
  }
  while ((m = moneyRe.exec(t))) {
    const raw = m[0];
    if (!/\d/.test(raw)) continue;
    rough.push({ kind: "money", start: m.index, end: m.index + raw.length, raw, phrases: MONEY, currency: (m[1] || "").toUpperCase() });
  }
  while ((m = headRe.exec(t))) {
    rough.push({ kind: "count", start: m.index, end: m.index + m[0].length, raw: m[0], phrases: [["headcount", "headcount"], ["people", "headcount"], ["team of", "headcount"], ["employs", "headcount"]] });
  }
  rough.sort((a, b) => a.start - b.start);
  const out = [];
  for (const fig of rough) {
    const clause = clauseBounds(t, fig.start);
    const localStart = fig.start - clause.start;
    const sentence = clause.text;
    const hits = phraseHits(sentence, fig.phrases);
    const localFigs = rough
      .filter((row) => row.start >= clause.start && row.end <= clause.end)
      .map((row) => ({ start: row.start - clause.start, end: row.end - clause.start, raw: row.raw }));
    const localFig = localFigs.find((row) => row.start === localStart) || { start: localStart, end: fig.end - clause.start };
    const metric = assignMetric(localFig, hits, localFigs);
    if (!metric) continue;
    if (BROAD.has(metric.id)) continue;
    const hyphen = /\d\s*[\u2013\u2014-]\s*\d/.test(sentence.slice(Math.max(0, localStart - 6), localFig.end + 6));
    const before = sentence.slice(Math.max(0, localStart - 16), localStart);
    let role = "";
    if (/\bto\s+$/i.test(before)) role = "to";
    else if (/\b(?:up\s+)?from\s+$/i.test(before)) role = "from";
    out.push({
      ...fig,
      metric: metric.id,
      metricStart: clause.start + metric.start,
      metricEnd: clause.start + metric.end,
      clauseStart: clause.start,
      clauseEnd: clause.end,
      clause: sentence.replace(/\s+/g, " ").trim(),
      hyphen,
      role,
    });
  }
  return out;
}

function clauseText(fig) {
  return fig.clause || "";
}

function anchor(fig) {
  const window = clauseText(fig);
  if (FORECAST.test(window)) return "forecast";
  if (/\b(full-year|full year)\b/i.test(window)) return "fullyear";
  if (/\bperiod\b/i.test(window)) return "period";
  if (ENTRY.test(window)) return "entry";
  if (EXIT.test(window)) return "exit";
  if (PRIOR.test(window)) return "prior";
  if (CURRENT.test(window)) return "current";
  const year = window.match(YEAR_IN);
  if (year) return `year:${year[1] || year[2]}`;
  return "";
}

function scenario(fig) {
  const m = clauseText(fig).match(/\b(upside|downside|base case|bear case|bull case)\b/i);
  return m ? m[1].toLowerCase() : "";
}

function basis(fig) {
  const window = clauseText(fig);
  const gross = /\bgross\b/i.test(window);
  const net = /\bnet\b/i.test(window);
  if (gross && !net) return "gross";
  if (net && !gross) return "net";
  return "";
}

function residue(fig, text) {
  const cut = Math.min(fig.metricStart, fig.start);
  const before = text.slice(fig.clauseStart, cut);
  const words = before.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (const word of words) {
    if (GENERIC.has(word) || word.length < 3) continue;
    if (word === fig.metric.replace(/_/g, "")) continue;
    out.push(word);
  }
  return out.slice(-4);
}

function sameSubject(aWords, bWords) {
  const aScope = aWords.some((w) => SCOPE.has(w));
  const bScope = bWords.some((w) => SCOPE.has(w));
  if (aScope !== bScope) return false;
  if (aScope && bScope) {
    return aWords.some((w) => SCOPE.has(w) && bWords.includes(w));
  }
  if (aWords.length === 0 || bWords.length === 0) return true;
  return aWords.some((w) => bWords.includes(w));
}

function sameAnchor(a, b) {
  if (!a || !b) return !a && !b ? true : a === "current" || b === "current" ? false : false;
  return a === b;
}

function currenciesDiffer(a, b) {
  const left = String(a.currency || "").replace(/[^A-Z]/g, "");
  const right = String(b.currency || "").replace(/[^A-Z]/g, "");
  if (!left || !right) return false;
  const norm = (c) => (c === "$" ? "USD" : c === "€" ? "EUR" : c === "£" ? "GBP" : c);
  return norm(left) !== norm(right);
}

/**
 * The other value, or null when the source does not state one for the same quantity.
 * @returns {{ metric: string, statementRaw: string, sourceRaw: string, passage: string, start: number, end: number, line: string } | null}
 */
export function findSecondValue(statementText, sourceText) {
  const statement = typeof statementText === "string" ? statementText : "";
  const source = typeof sourceText === "string" ? sourceText : "";
  if (!statement.trim() || !source.trim()) return null;
  const draftFigs = collectFigures(statement);
  const sourceFigs = collectFigures(source);
  let best = null;
  for (const draft of draftFigs) {
    if (draft.hyphen || draft.role) continue;
    const draftAnchor = anchor(draft);
    const draftScenario = scenario(draft);
    const draftBasis = basis(draft);
    const draftWords = residue(draft, statement);
    const agreed = sourceFigs.some((row) => {
      if (row.metric !== draft.metric) return false;
      if (!isRounding(draft.raw, row.raw) && displayedNumber(draft.raw) !== displayedNumber(row.raw)) return false;
      if (row.hyphen || row.role) return false;
      if (!sameAnchor(draftAnchor, anchor(row))) return false;
      if ((draftScenario || scenario(row)) && draftScenario !== scenario(row)) return false;
      if ((draftBasis || basis(row)) && draftBasis !== basis(row)) return false;
      if (!sameSubject(draftWords, residue(row, source))) return false;
      return true;
    });
    if (!agreed) continue;
    for (const row of sourceFigs) {
      if (row.metric !== draft.metric) continue;
      if (row.hyphen || row.role) continue;
      if (isRounding(draft.raw, row.raw) || displayedNumber(draft.raw) === displayedNumber(row.raw)) continue;
      if (currenciesDiffer(draft, row)) continue;
      if (!sameAnchor(draftAnchor, anchor(row))) continue;
      const rowScenario = scenario(row);
      if ((draftScenario || rowScenario) && draftScenario !== rowScenario) continue;
      const rowBasis = basis(row);
      if ((draftBasis || rowBasis) && draftBasis !== rowBasis) continue;
      if (!sameSubject(draftWords, residue(row, source))) continue;
      if (row.clause.toLowerCase().includes(String(draft.raw).toLowerCase())) continue;
      const passage = source.slice(row.clauseStart, row.clauseEnd).trim();
      const hit = {
        metric: draft.metric,
        statementRaw: draft.raw.trim(),
        sourceRaw: row.raw.trim(),
        passage,
        start: row.clauseStart,
        end: row.clauseEnd,
      };
      hit.line = secondValueLine(hit);
      if (!best) best = hit;
    }
  }
  return best;
}

export function secondValueLine(hit) {
  const passage = String(hit?.passage || "").replace(/\s+/g, " ").trim();
  const clean = passage.replace(/[.]+$/, "");
  return `The source also says "${clean}."`;
}

/**
 * When a confirmed match has a second value in that source, add a conflicting
 * span the reducer can vote. Does not change a classification that is already
 * louder than confirmed. Does not invent a value.
 */
export function secondValueSpans({ statementText, sourceMatches, supportSpans, sources } = {}) {
  const statement = typeof statementText === "string" ? statementText : "";
  const matches = Array.isArray(sourceMatches) ? sourceMatches : [];
  const srcs = Array.isArray(sources) ? sources : [];
  const existing = Array.isArray(supportSpans) ? supportSpans : [];
  const spans = [];
  let line = "";
  for (const match of matches) {
    if (String(match?.classification || "").trim() !== "confirmed") continue;
    const sourceIndex = Number(match?.sourceIndex);
    if (!Number.isFinite(sourceIndex)) continue;
    const alreadyConflicting = existing.some((span) => {
      const ref = Number.isFinite(Number(span?.sourceRefId)) ? Number(span.sourceRefId) : Number(span?.sourceIndex);
      return ref === sourceIndex && String(span?.classification || "") === "conflicting";
    });
    if (alreadyConflicting) continue;
    const text = typeof srcs[sourceIndex]?.text === "string" ? srcs[sourceIndex].text : "";
    const hit = findSecondValue(statement, text);
    if (!hit) continue;
    const located = locatePassageInSource(text, hit.passage);
    if (located.start == null || located.end == null) continue;
    spans.push({
      sourceRefId: sourceIndex,
      sourceIndex,
      classification: "conflicting",
      passage: hit.passage,
      start: located.start,
      end: located.end,
      secondValue: true,
    });
    if (!line) line = hit.line;
  }
  return { spans, line };
}
