/**
 * Period-aware source supersession.
 * Deterministic, no LLM. Runs after Stage 3. Does not weaken the B48 backstop.
 *
 * Authoritative figure = value in the newest-dated source that covers the claim's period.
 * Prefer explicit period match. If the claim has no explicit period, newest source by as-of.
 * Draft must match the authoritative figure or nothing changes.
 * Strictly older, different-period disagreements may be demoted conflicting to superseded.
 * Same-period disagreement is not supersession. Confident-dates-only.
 * When the later dated reading disagrees with the statement and an earlier dated reading
 * agrees with it, the note names that revision. The figures are the ones already paired
 * with each document. The verdict is not moved.
 * When no document is dated and two readings disagree, the note names both and claims no order.
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
function datedReadings(args) {
  const matches = Array.isArray(args?.sourceMatches) ? args.sourceMatches : [];
  const asOfMap = args?.asOfBySourceIndex && typeof args.asOfBySourceIndex === "object" ? args.asOfBySourceIndex : {};
  const seen = new Set();
  const dated = [];
  for (const match of matches) {
    const index = Number(match?.sourceIndex);
    if (!Number.isFinite(index) || seen.has(index)) continue;
    seen.add(index);
    const asOf = asOfOf(asOfMap, index);
    if (!asOf) continue;
    dated.push({ index, asOf });
  }
  return dated;
}

export function revisionSentence(args) {
  const dated = datedReadings(args);
  if (dated.length < 2) return "";
  dated.sort((a, b) => a.asOf.date.getTime() - b.asOf.date.getTime());
  const latest = dated[dated.length - 1];
  const tiedLatest = dated.filter((row) => row.asOf.date.getTime() === latest.asOf.date.getTime());
  if (tiedLatest.length !== 1) return "";
  return figureShiftFromMatches(args, dated, latest);
}

function disagreedFigurePairs(stmtFigs, srcFigs) {
  const kinds = ["percent", "money", "count"];
  const pairs = [];
  for (const kind of kinds) {
    const stated = (stmtFigs || []).filter((fig) => fig?.kind === kind);
    const found = (srcFigs || []).filter((fig) => fig?.kind === kind);
    if (!stated.length || !found.length) continue;
    for (const stmt of stated) {
      let best = found[0];
      let bestDiff = Math.abs(Number(stmt.value) - Number(best.value));
      for (const fig of found) {
        const diff = Math.abs(Number(stmt.value) - Number(fig.value));
        if (diff < bestDiff) {
          best = fig;
          bestDiff = diff;
        }
      }
      if (Number(best.value) !== Number(stmt.value)) pairs.push({ stmt, src: best });
    }
  }
  return pairs;
}

function figureShiftFromMatches(args, dated, latest) {
  const matches = Array.isArray(args?.sourceMatches) ? args.sourceMatches : [];
  const latestMatch = matches.find((row) => Number(row?.sourceIndex) === latest.index);
  const stmt = latestMatch?.statementFigures;
  if (!Array.isArray(stmt) || !stmt.length) return "";
  if (figuresAgree(stmt, latestMatch.sourceFigures) !== false) return "";
  const pairs = disagreedFigurePairs(stmt, latestMatch.sourceFigures);
  if (!pairs.length) return "";
  const givers = dated.filter((row) => {
    if (row.index === latest.index) return false;
    if (!(row.asOf.date.getTime() < latest.asOf.date.getTime())) return false;
    const match = matches.find((item) => Number(item?.sourceIndex) === row.index);
    return figuresAgree(stmt, match?.sourceFigures) === true;
  });
  if (!givers.length) return "";
  givers.sort((a, b) => a.asOf.date.getTime() - b.asOf.date.getTime());
  const earlier = givers[givers.length - 1];
  const sameEarlier = givers.filter((row) => row.asOf.date.getTime() === earlier.asOf.date.getTime());
  if (sameEarlier.length !== 1) return "";
  const earlierMatch = matches.find((item) => Number(item?.sourceIndex) === earlier.index);
  const laterLabel = sourceLabelAt(args.sources, matches, latest.index);
  const earlierLabel = sourceLabelAt(args.sources, matches, earlier.index);
  if (!laterLabel || !earlierLabel || !earlierMatch) return "";
  const laterBits = [];
  const earlierBits = [];
  for (const pair of pairs) {
    const laterRaw = String(pair.src?.raw || "").trim();
    const held = overlappingSourceFigure([pair.stmt], earlierMatch.sourceFigures);
    const earlierRaw = String(held?.src?.raw || "").trim();
    if (!laterRaw || !earlierRaw) return "";
    laterBits.push(laterRaw);
    earlierBits.push(earlierRaw);
  }
  return `The later source ${laterLabel} dated ${latest.asOf.raw} gives ${laterBits.join(" and ")}. The earlier source ${earlierLabel} dated ${earlier.asOf.raw} gives ${earlierBits.join(" and ")}.`;
}

function unorderedFromMatches(args) {
  const matches = Array.isArray(args?.sourceMatches) ? args.sourceMatches : [];
  const sources = Array.isArray(args?.sources) ? args.sources : [];
  const stmt = matches.find((row) => Array.isArray(row?.statementFigures) && row.statementFigures.length)?.statementFigures;
  if (!stmt) return "";
  const holders = [];
  const seen = new Set();
  for (const match of matches) {
    const index = Number(match?.sourceIndex);
    if (!Number.isFinite(index) || seen.has(index)) continue;
    const gap = overlappingSourceFigure(stmt, match?.sourceFigures);
    if (!gap) continue;
    const label = sourceLabelAt(sources, matches, index);
    const raw = String(gap.src?.raw || "").trim();
    if (!label || !raw) continue;
    seen.add(index);
    holders.push({ index, label, raw, value: Number(gap.src.value) });
  }
  holders.sort((a, b) => a.index - b.index);
  if (holders.length !== 2 || holders[0].value === holders[1].value) return "";
  return `The documents differ. ${holders[0].label} gives ${holders[0].raw}. ${holders[1].label} gives ${holders[1].raw}.`;
}

function unorderedDifference(args) {
  if (datedReadings(args).length > 0) return "";
  return unorderedFromMatches(args);
}

function withRevision(result, args) {
  if (result.supersededNotes.length || result.verdictOverride) return result;
  const note = revisionSentence(args) || unorderedDifference(args);
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
