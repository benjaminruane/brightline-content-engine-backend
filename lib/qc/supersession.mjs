/**
 * Period-aware source supersession.
 * Deterministic, no LLM. Runs after Stage 3. Does not weaken the B48 backstop.
 *
 * Authoritative figure = value in the newest-dated source that covers the claim's period.
 * Prefer explicit period match. If the claim has no explicit period, newest source by as-of.
 * Draft must match the authoritative figure or nothing changes.
 * Strictly older, different-period disagreements may be demoted conflicting to superseded.
 * Same-period disagreement is not supersession. Confident-dates-only.
 * When the newest source states a different figure and an older source states the draft's
 * figure, and the dates put one document strictly later, the note names that revision.
 * The verdict is not moved. No date order, no note.
 */

import { extractSourceAsOfDate } from "./source-recency.mjs";
import { normalizePeriodToken } from "./pipeline-v4/stage2-match-sources.mjs";

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const MONTHS_ABBR = "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const MONTH = `(?:${MONTHS}|${MONTHS_ABBR})`;

const EMPTY = Object.freeze({
  verdictOverride: null,
  supersededNotes: [],
  demotedSourceIndices: [],
});

function sanitizeDashes(value) {
  return String(value || "")
    .replace(/[\u2014\u2013\u2012\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPeriodLabel(token) {
  const t = String(token || "").trim();
  if (/^\d{4}$/.test(t)) return `FY${t}`;
  return t;
}

/**
 * Explicit claim period token, or null when the statement names none.
 * Calendar-year-end phrasing maps to the year token so it matches FY2025 → "2025".
 * @param {unknown} statementText
 * @returns {string|null}
 */
export function extractClaimPeriod(statementText) {
  const t = String(statementText || "");
  if (!t.trim()) return null;

  let m = t.match(/\bFY\s*((?:19|20)\d{2})\b/i);
  if (m) return normalizePeriodToken(`FY${m[1]}`) || m[1];

  m = t.match(
    new RegExp(
      `\\b(?:twelve months|12 months|year)\\s+(?:to|ended|ending)\\s+\\d{1,2}\\s+${MONTH}\\s+((?:19|20)\\d{2})\\b`,
      "i"
    )
  );
  if (m) return m[1];

  m = t.match(new RegExp(`\\byear ended\\s+\\d{1,2}\\s+${MONTH}\\s+((?:19|20)\\d{2})\\b`, "i"));
  if (m) return m[1];

  m = t.match(/\bH([12])\s*((?:19|20)\d{2})\b/i);
  if (m) return `H${m[1]} ${m[2]}`;

  m = t.match(/\b(?:first|second)\s+half\s+((?:19|20)\d{2})\b/i);
  if (m) {
    const half = /first/i.test(m[0]) ? "1" : "2";
    return `H${half} ${m[1]}`;
  }

  m = t.match(/\bQ([1-4])\s*((?:19|20)\d{2})\b/i);
  if (m) return `Q${m[1]} ${m[2]}`;

  m = t.match(
    new RegExp(`\\b(?:as at|as of)\\s+\\d{1,2}\\s+${MONTH}\\s+((?:19|20)\\d{2})\\b`, "i")
  );
  if (m) return m[1];

  return null;
}

function tokenFromPeriodField(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return normalizePeriodToken(s) || extractClaimPeriod(s) || null;
}

/**
 * Period token for a figure already matched by Stage 2, from a window around that figure.
 * Used by tests and GATE B reconstruction when periodAssessment is absent.
 * @param {unknown} passageText
 * @param {{ raw?: string, value?: number }|null|undefined} matchedValue
 * @returns {string|null}
 */
export function extractSourcePeriodForFigure(passageText, matchedValue) {
  const passage = String(passageText || "");
  if (!passage.trim()) return null;
  const raw = matchedValue?.raw ? String(matchedValue.raw) : "";
  let window = passage;
  if (raw) {
    const idx = passage.toLowerCase().indexOf(raw.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 96);
      const end = Math.min(passage.length, idx + raw.length + 96);
      window = passage.slice(start, end);
    }
  }
  return extractClaimPeriod(window) || extractClaimPeriod(passage);
}

/**
 * @param {Array<{ text?: string }>} sources
 * @returns {Record<number, { date: Date, raw: string, cue: string }|null>}
 */
export function buildAsOfBySourceIndex(sources) {
  const arr = Array.isArray(sources) ? sources : [];
  /** @type {Record<number, { date: Date, raw: string, cue: string }|null>} */
  const out = {};
  for (let i = 0; i < arr.length; i++) {
    const text = typeof arr[i]?.text === "string" ? arr[i].text : "";
    out[i] = extractSourceAsOfDate(text);
  }
  return out;
}

function asOfOf(asOfBySourceIndex, sourceIndex) {
  const hit = asOfBySourceIndex?.[sourceIndex];
  if (!hit || !(hit.date instanceof Date) || Number.isNaN(hit.date.getTime())) return null;
  return hit;
}

function claimPeriodFromMatches(statement, sourceMatches) {
  const matches = Array.isArray(sourceMatches) ? sourceMatches : [];
  for (const m of matches) {
    const tok = tokenFromPeriodField(m?.periodAssessment?.statementPeriod);
    if (tok) return tok;
  }
  return extractClaimPeriod(statement);
}

function overlappingSourceFigure(stmtFigs, srcFigs) {
  const kinds = ["percent", "money", "count"];
  for (const kind of kinds) {
    const s = (stmtFigs || []).filter((f) => f?.kind === kind);
    const p = (srcFigs || []).filter((f) => f?.kind === kind);
    if (!s.length || !p.length) continue;
    const stmt = s[0];
    let best = p[0];
    let bestDiff = Math.abs(Number(stmt.value) - Number(best.value));
    for (const fig of p) {
      const d = Math.abs(Number(stmt.value) - Number(fig.value));
      if (d < bestDiff) {
        best = fig;
        bestDiff = d;
      }
    }
    return { kind, stmt, src: best };
  }
  return null;
}

function figuresAgree(stmtFigs, srcFigs) {
  const kinds = ["percent", "money", "count"];
  let anyOverlap = false;
  for (const kind of kinds) {
    const s = (stmtFigs || []).filter((f) => f?.kind === kind);
    const p = (srcFigs || []).filter((f) => f?.kind === kind);
    if (!s.length || !p.length) continue;
    anyOverlap = true;
    for (const sf of s) {
      let best = null;
      let bestDiff = Infinity;
      for (const pf of p) {
        const d = Math.abs(Number(sf.value) - Number(pf.value));
        if (d < bestDiff) {
          bestDiff = d;
          best = pf;
        }
      }
      if (!best) return false;
      if (Number(best.value) !== Number(sf.value)) return false;
    }
  }
  if (!anyOverlap) return null;
  return true;
}

function sourcePeriodToken(match, statement) {
  const fromPa = tokenFromPeriodField(match?.periodAssessment?.sourcePeriod);
  if (fromPa) return fromPa;
  const overlap = overlappingSourceFigure(match?.statementFigures, match?.sourceFigures);
  return extractSourcePeriodForFigure(match?.passage, overlap?.src || overlap?.stmt);
}

function isConfidentlyDated(match, asOfBySourceIndex) {
  if (asOfOf(asOfBySourceIndex, Number(match?.sourceIndex))) return true;
  const pa = match?.periodAssessment;
  if (tokenFromPeriodField(pa?.sourcePeriod) || tokenFromPeriodField(pa?.statementPeriod)) return true;
  if (sourcePeriodToken(match, "")) return true;
  return false;
}

function formatNote({
  olderLabel,
  olderDateRaw,
  olderRaw,
  olderPeriod,
  currentRaw,
  currentPeriod,
}) {
  const label = sanitizeDashes(olderLabel || "source");
  const date = sanitizeDashes(olderDateRaw || "");
  const olderBit = sanitizeDashes(olderRaw || "a different figure");
  const currentBit = sanitizeDashes(currentRaw || "the current figure");
  const olderPeriodBit = olderPeriod ? ` for ${formatPeriodLabel(olderPeriod)}` : "";
  const currentPeriodBit = currentPeriod ? ` (${formatPeriodLabel(currentPeriod)})` : "";
  const dateBit = date ? `, ${date}` : "";
  return `An older source (${label}${dateBit}) reports ${olderBit}${olderPeriodBit}. The current figure of ${currentBit}${currentPeriodBit} is more recent.`;
}

/**
 * @param {{
 *   statement: string,
 *   aggregateVerdict: string,
 *   sourceMatches: Array<object>,
 *   asOfBySourceIndex: Record<number, { date: Date, raw: string, cue: string }|null>,
 *   today?: Date,
 * }} args
 * @returns {{ verdictOverride: string|null, supersededNotes: string[], demotedSourceIndices: number[] }}
 */
function figureRows(text) {
  const body = String(text || "");
  const rows = [];
  const push = (kind, key, raw, value, index) => {
    const before = body.slice(Math.max(0, index - 48), index);
    const retired = /\b(?:not|rather than|compared with(?: the)?|previously|from|up from)\s+$/i.test(before)
      || /\bto\s+(?:approximately\s+|about\s+)?$/i.test(before);
    rows.push({ kind, key, raw: String(raw).trim(), value, retired });
  };
  for (const match of body.matchAll(/\b(EUR|USD|GBP)\s+(\d[\d,.'’]*(?:\.\d+)?)\s*(million|billion|thousand)\b/gi)) {
    const start = Math.max(body.lastIndexOf(".", match.index), body.lastIndexOf("\n", match.index)) + 1;
    const endAt = body.indexOf(".", match.index + match[0].length);
    const sentence = body.slice(start, endAt === -1 ? body.length : endAt + 1);
    const metric = /\barr\b|annual recurring revenue/i.test(sentence)
      ? "arr"
      : /\brevenue\b/i.test(sentence)
        ? "revenue"
        : /\bebitda\b/i.test(sentence)
          ? "ebitda"
          : "";
    if (!metric) continue;
    push("money", `money:${metric}:${match[3].toLowerCase()}`, match[0], Number(match[2].replace(/[,']/g, "")), match.index);
  }
  for (const match of body.matchAll(/\b(\d+(?:\.\d+)?)\s*x\s+MOIC\b/gi)) {
    push("multiple", "multiple:moic", match[0], Number(match[1]), match.index);
  }
  for (const match of body.matchAll(/\b(\d+(?:\.\d+)?)%\s*(?:gross\s+)?IRR\b/gi)) {
    push("percent", "percent:irr", match[0], Number(match[1]), match.index);
  }
  for (const match of body.matchAll(/\bemploys\s+(\d{2,6})\s+people\b/gi)) {
    push("count", "count:people", `${match[1]} people`, Number(match[1]), match.index);
  }
  for (const match of body.matchAll(/\b(\d{2,6})\s+property management companies\b/gi)) {
    push("count", "count:companies", match[0], Number(match[1]), match.index);
  }
  return rows;
}

function givenValues(text, key) {
  const rows = figureRows(text).filter((row) => row.key === key && !row.retired);
  const values = [...new Set(rows.map((row) => row.value))];
  return { values, raw: rows[0]?.raw || "" };
}

function sourceLabelAt(sources, matches, index) {
  const fromSource = sources?.[index]?.label;
  if (typeof fromSource === "string" && fromSource.trim()) return fromSource.trim();
  const match = (Array.isArray(matches) ? matches : []).find((row) => Number(row?.sourceIndex) === index);
  if (typeof match?.sourceLabel === "string" && match.sourceLabel.trim()) return match.sourceLabel.trim();
  return "";
}

/**
 * The sentence that names a revised figure, or "" when the order or the figures are not established.
 * @param {{
 *   statement: string,
 *   sourceMatches: Array<object>,
 *   asOfBySourceIndex: Record<number, { date: Date, raw: string }|null>,
 *   sources?: Array<{ text?: string, label?: string }>,
 * }} args
 */
export function revisionSentence(args) {
  const sources = Array.isArray(args?.sources) ? args.sources : [];
  if (sources.length < 2) return "";
  const asOfMap = args?.asOfBySourceIndex && typeof args.asOfBySourceIndex === "object" ? args.asOfBySourceIndex : {};
  const dated = [];
  for (let index = 0; index < sources.length; index += 1) {
    const asOf = asOfOf(asOfMap, index);
    const text = typeof sources[index]?.text === "string" ? sources[index].text : "";
    if (!asOf || !text.trim()) continue;
    dated.push({ index, asOf, text });
  }
  if (dated.length < 2) return "";
  dated.sort((a, b) => a.asOf.date.getTime() - b.asOf.date.getTime());
  const latest = dated[dated.length - 1];
  const tiedLatest = dated.filter((row) => row.asOf.date.getTime() === latest.asOf.date.getTime());
  if (tiedLatest.length !== 1) return "";
  const laterLabel = sourceLabelAt(sources, args.sourceMatches, latest.index);
  if (!laterLabel) return "";

  const claimed = figureRows(args?.statement).filter((row) => !row.retired);
  const keys = [];
  for (const row of claimed) {
    if (!keys.includes(row.key)) keys.push(row.key);
  }
  const shifts = [];
  let earlierIndex = null;
  for (const key of keys) {
    const statementValues = [...new Set(claimed.filter((row) => row.key === key).map((row) => row.value))];
    if (statementValues.length !== 1) continue;
    const laterGiven = givenValues(latest.text, key);
    if (laterGiven.values.length !== 1 || laterGiven.values[0] === statementValues[0]) continue;
    const givers = dated.filter((row) => {
      if (row.index === latest.index) return false;
      if (!(row.asOf.date.getTime() < latest.asOf.date.getTime())) return false;
      const given = givenValues(row.text, key);
      return given.values.length === 1 && given.values[0] === statementValues[0];
    });
    if (!givers.length) continue;
    givers.sort((a, b) => a.asOf.date.getTime() - b.asOf.date.getTime());
    const earlier = givers[givers.length - 1];
    const sameEarlierDate = givers.filter((row) => row.asOf.date.getTime() === earlier.asOf.date.getTime());
    if (sameEarlierDate.length !== 1) continue;
    if (earlierIndex == null) earlierIndex = earlier.index;
    if (earlierIndex !== earlier.index) return "";
    const earlierGiven = givenValues(earlier.text, key);
    shifts.push({ later: laterGiven.raw, earlier: earlierGiven.raw });
  }
  if (!shifts.length || earlierIndex == null) return "";
  const earlierLabel = sourceLabelAt(sources, args.sourceMatches, earlierIndex);
  const earlierDated = dated.find((row) => row.index === earlierIndex);
  if (!earlierLabel || !earlierDated) return "";
  const laterBits = shifts.map((row) => row.later).join(" and ");
  const earlierBits = shifts.map((row) => row.earlier).join(" and ");
  if (!laterBits || !earlierBits) return "";
  return `The later source ${laterLabel} dated ${latest.asOf.raw} gives ${laterBits}. The earlier source ${earlierLabel} dated ${earlierDated.asOf.raw} gives ${earlierBits}.`;
}

function withRevision(result, args) {
  if (result.supersededNotes.length || result.verdictOverride) return result;
  const note = revisionSentence(args);
  if (!note) return result;
  return { verdictOverride: null, supersededNotes: [note], demotedSourceIndices: [] };
}

export function resolveSupersession({
  statement,
  aggregateVerdict,
  sourceMatches,
  asOfBySourceIndex,
  today,
  sources,
}) {
  void today;
  const args = { statement, aggregateVerdict, sourceMatches, asOfBySourceIndex, sources };
  const matches = Array.isArray(sourceMatches) ? sourceMatches : [];
  if (matches.length < 2) return withRevision({ ...EMPTY }, args);

  const stmtText = typeof statement === "string" ? statement : "";
  const claimPeriod = claimPeriodFromMatches(stmtText, matches);
  const asOfMap = asOfBySourceIndex && typeof asOfBySourceIndex === "object" ? asOfBySourceIndex : {};

  const covering = [];
  for (const m of matches) {
    if (!isConfidentlyDated(m, asOfMap)) continue;
    const asOf = asOfOf(asOfMap, Number(m.sourceIndex));
    if (!asOf) continue;
    const agree = figuresAgree(m.statementFigures, m.sourceFigures);
    if (agree == null) continue;
    if (claimPeriod) {
      const srcTok = sourcePeriodToken(m, stmtText);
      if (!srcTok || srcTok !== claimPeriod) continue;
    }
    covering.push({ match: m, asOf, agree });
  }

  if (covering.length === 0) return withRevision({ ...EMPTY }, args);

  covering.sort((a, b) => a.asOf.date.getTime() - b.asOf.date.getTime());
  const auth = covering[covering.length - 1];
  if (auth.agree !== true) return withRevision({ ...EMPTY }, args);

  const authAsOf = auth.asOf;
  const authOverlap = overlappingSourceFigure(auth.match.statementFigures, auth.match.sourceFigures);
  const authPeriod = claimPeriod || sourcePeriodToken(auth.match, stmtText);

  const demotedSourceIndices = [];
  const supersededNotes = [];

  for (const m of matches) {
    if (String(m?.classification || "").trim() !== "conflicting") continue;
    const idx = Number(m.sourceIndex);
    if (!Number.isFinite(idx) || idx === Number(auth.match.sourceIndex)) continue;
    if (!isConfidentlyDated(m, asOfMap) || !isConfidentlyDated(auth.match, asOfMap)) continue;
    const olderAsOf = asOfOf(asOfMap, idx);
    if (!olderAsOf) continue;
    if (!(olderAsOf.date.getTime() < authAsOf.date.getTime())) continue;

    if (claimPeriod) {
      const srcTok = sourcePeriodToken(m, stmtText);
      if (srcTok == null) continue;
      if (srcTok === claimPeriod) continue;
    }

    const olderOverlap = overlappingSourceFigure(m.statementFigures, m.sourceFigures);
    if (!olderOverlap) continue;
    if (Number(olderOverlap.src.value) === Number(olderOverlap.stmt.value)) continue;

    demotedSourceIndices.push(idx);
    supersededNotes.push(
      formatNote({
        olderLabel: m.sourceLabel,
        olderDateRaw: olderAsOf.raw,
        olderRaw: olderOverlap.src.raw,
        olderPeriod: sourcePeriodToken(m, stmtText),
        currentRaw: authOverlap?.stmt?.raw || authOverlap?.src?.raw,
        currentPeriod: authPeriod,
      })
    );
  }

  if (demotedSourceIndices.length === 0) return withRevision({ ...EMPTY }, args);

  const remainingConflict = matches.some((m) => {
    if (String(m?.classification || "").trim() !== "conflicting") return false;
    return !demotedSourceIndices.includes(Number(m.sourceIndex));
  });
  const anyConfirmed = matches.some((m) => String(m?.classification || "").trim() === "confirmed");
  const anyPartial = matches.some((m) => String(m?.classification || "").trim() === "partially_confirmed");

  let verdictOverride = aggregateVerdict;
  if (anyConfirmed) verdictOverride = "confirmed";
  else if (remainingConflict) verdictOverride = "conflicting";
  else if (anyPartial) verdictOverride = "partially_confirmed";
  else verdictOverride = "not_supported";

  return { verdictOverride, supersededNotes, demotedSourceIndices };
}
