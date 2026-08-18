/**
 * Period-aware source supersession.
 * Deterministic, no LLM. Runs after Stage 3. Does not weaken the B48 backstop.
 *
 * Authoritative figure = value in the newest-dated source that covers the claim's period.
 * Prefer explicit period match. If the claim has no explicit period, newest source by as-of.
 * Draft must match the authoritative figure or nothing changes.
 * Strictly older, different-period disagreements may be demoted conflicting → superseded.
 * Same-period disagreement is not supersession. Confident-dates-only.
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
export function resolveSupersession({
  statement,
  aggregateVerdict,
  sourceMatches,
  asOfBySourceIndex,
  today,
}) {
  void today;
  const matches = Array.isArray(sourceMatches) ? sourceMatches : [];
  if (matches.length < 2) return { ...EMPTY };

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

  if (covering.length === 0) return { ...EMPTY };

  covering.sort((a, b) => a.asOf.date.getTime() - b.asOf.date.getTime());
  const auth = covering[covering.length - 1];
  if (auth.agree !== true) return { ...EMPTY };

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

  if (demotedSourceIndices.length === 0) return { ...EMPTY };

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
