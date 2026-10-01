// Pipeline v4 — Stage 4: deterministic excerpt selection (QC rebuild).
// Rules per QC_Pipeline_Redesign_Architecture.docx §5.4.

import { confirmingPassageDisagrees } from "./confirming-passage-disagrees.mjs";
import { collectBackstopFigures } from "./stage2-match-sources.mjs";
import { extractVerifiableAnchors } from "../claim-spans.mjs";
import { splitSentences } from "../card-honesty.mjs";
import { sourceTextAt } from "../excerpt-locate.mjs";
import { trimExcerptToSentences } from "../excerpt-sentences.mjs";
import { fillSecondExcerpt, isDistinctExcerpt } from "../excerpt-pair.mjs";

function normalizeClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (c === "confirmed" || c === "partially_confirmed" || c === "conflicting" || c === "no_support") {
    return c;
  }
  return "no_support";
}

const EXCERPT_BUDGET = 300;

function isInsideFigure(text, index) {
  if (index <= 0 || index >= text.length) return false;
  const prev = text[index - 1];
  const next = text[index];
  if (/\d/.test(prev) && (/\d/.test(next) || next === "." || next === "%" || next === ",")) return true;
  if ((prev === "." || prev === ",") && /\d/.test(text[index - 2] || "") && /\d/.test(next)) return true;
  if ((next === "." || next === ",") && /\d/.test(prev) && /\d/.test(text[index + 1] || "")) return true;
  if (prev === "%" && /\d/.test(text[index - 2] || "")) return true;
  return false;
}

function figureSafeBounds(text, start, end) {
  let s = Math.max(0, start);
  let e = Math.min(text.length, end);
  while (s > 0 && isInsideFigure(text, s)) s -= 1;
  while (e < text.length && isInsideFigure(text, e)) e += 1;
  while (s < e && /\s/.test(text[s])) s += 1;
  while (e > s && /\s/.test(text[e - 1])) e -= 1;
  return { s, e };
}

function statementNeedles(statement) {
  const s = typeof statement === "string" ? statement : "";
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const t = String(raw || "").trim();
    if (t.length < 2) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  for (const span of extractVerifiableAnchors(s) || []) add(span?.text);
  for (const fig of collectBackstopFigures(s) || []) add(fig?.raw);
  const folded = s
    .toLowerCase()
    .replace(/[^a-z0-9%\-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 6 || (w.includes("-") && w.length >= 4));
  for (const w of folded) add(w);
  return out;
}

function sentenceScore(sentence, needles) {
  if (!needles.length) return 0;
  const hay = String(sentence || "").toLowerCase();
  let n = 0;
  for (const needle of needles) {
    if (hay.includes(needle.toLowerCase())) n += 1;
  }
  return n;
}

function markWindow(text, start, end) {
  const { s, e } = figureSafeBounds(text, start, end);
  if (e <= s) return null;
  const core = text.slice(s, e).trim();
  if (!core) return null;
  const lead = s > 0 ? "..." : "";
  const tail = e < text.length ? "..." : "";
  return `${lead}${core}${tail}`;
}

function trimLeadingWindow(t) {
  const window = t.slice(0, EXCERPT_BUDGET);
  let lastSentence = -1;
  for (let i = 0; i < window.length; i++) {
    const ch = window[i];
    if ((ch === "." || ch === "!" || ch === "?") && (i + 1 >= window.length || /\s/.test(window[i + 1]))) {
      lastSentence = i;
    }
  }
  if (lastSentence >= 0) {
    return `${window.slice(0, lastSentence + 1).trimEnd()}...`;
  }
  let lastWs = -1;
  for (let i = window.length - 1; i >= 0; i--) {
    if (/\s/.test(window[i]) && !isInsideFigure(t, i)) {
      lastWs = i;
      break;
    }
  }
  if (lastWs > 0) {
    return `${window.slice(0, lastWs).trimEnd()}...`;
  }
  let cut = window.length;
  while (cut > 0 && isInsideFigure(t, cut)) cut -= 1;
  return `${window.slice(0, cut).trimEnd()}...`;
}

function overlappingPositives(scored, start, end) {
  let n = 0;
  for (const row of scored) {
    if (row.score > 0 && row.start < end && row.end > start) n += 1;
  }
  return n;
}

function windowAroundNeedles(t, needles) {
  const sentences = splitSentences(t);
  if (sentences.length === 0) return trimLeadingWindow(t);
  const scored = [];
  let offset = 0;
  for (const sentence of sentences) {
    scored.push({
      text: sentence,
      start: offset,
      end: offset + sentence.length,
      score: sentenceScore(sentence, needles),
    });
    offset += sentence.length;
  }
  const positive = scored.filter((row) => row.score > 0);
  if (positive.length === 0) return trimLeadingWindow(t);

  const candidates = [];
  for (let i = 0; i < scored.length; i++) {
    for (let j = i; j < scored.length; j++) {
      const run = scored.slice(i, j + 1);
      const start = run[0].start;
      const end = run[run.length - 1].end;
      if (end - start > EXCERPT_BUDGET && run.length > 1) continue;
      if (end - start > EXCERPT_BUDGET) continue;
      candidates.push({
        start,
        end,
        posCount: overlappingPositives(scored, start, end),
        scoreSum: run.reduce((n, row) => n + row.score, 0),
      });
    }
  }
  const coverStart = positive[0].start;
  const coverEnd = positive[positive.length - 1].end;
  if (coverEnd - coverStart <= EXCERPT_BUDGET) {
    candidates.push({
      start: coverStart,
      end: coverEnd,
      posCount: overlappingPositives(scored, coverStart, coverEnd),
      scoreSum: positive.reduce((n, row) => n + row.score, 0),
    });
  } else {
    const sliceEnd = coverEnd;
    const sliceStart = Math.max(coverStart, sliceEnd - EXCERPT_BUDGET);
    candidates.push({
      start: sliceStart,
      end: sliceEnd,
      posCount: overlappingPositives(scored, sliceStart, sliceEnd),
      scoreSum: positive.reduce((n, row) => n + row.score, 0),
    });
  }
  let best = null;
  for (const cand of candidates) {
    const rank = [cand.posCount, cand.end, cand.scoreSum, cand.end - cand.start];
    const better =
      !best ||
      rank[0] > best.rank[0] ||
      (rank[0] === best.rank[0] && rank[1] > best.rank[1]) ||
      (rank[0] === best.rank[0] && rank[1] === best.rank[1] && rank[2] > best.rank[2]) ||
      (rank[0] === best.rank[0] && rank[1] === best.rank[1] && rank[2] === best.rank[2] && rank[3] > best.rank[3]);
    if (better) best = { ...cand, rank };
  }
  if (!best) return trimLeadingWindow(t);
  return markWindow(t, best.start, best.end) || trimLeadingWindow(t);
}

/**
 * Quote is whole sentences (B359). Name kept for callers. A ceiling may
 * drop sentences; it never cuts one and never decides whether a quote
 * was found.
 * @param {string} passage
 * @param {string} [statementText]
 * @returns {string|null} null if no non-empty passage
 */
export function trimExcerptTo300(passage, statementText) {
  return trimExcerptToSentences(passage, statementText);
}

/**
 * Prefer the longest stored span that contains the gated pointer, so trim
 * can window the held passage rather than a leading stub.
 */
export function widestHeldPassage(pointer, supportSpans) {
  const raw = typeof pointer === "string" ? pointer : "";
  const p = raw.replace(/\.\.\.$/, "").trim();
  if (!p) return "";
  let best = p;
  for (const span of Array.isArray(supportSpans) ? supportSpans : []) {
    const sp = typeof span?.passage === "string" ? span.passage.trim() : "";
    if (!sp) continue;
    if (sp.length <= best.length) continue;
    if (sp.includes(p) || p.includes(sp.slice(0, Math.min(80, sp.length)))) best = sp;
  }
  return best;
}

function passageTextFromMatch(match, sources) {
  const pointer = typeof match?.passage === "string" ? match.passage : "";
  const srcIdx = Number.isFinite(Number(match?.sourceIndex))
    ? Number(match.sourceIndex)
    : Number(match?.sourceRefId);
  const src = sourceTextAt(sources, srcIdx);
  const start = Number(match?.start);
  const end = Number(match?.end);
  if (src && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= src.length) {
    return src.slice(start, end);
  }
  return pointer;
}

function toExcerpt(match, sources, statementText) {
  if (!match) return null;
  const label = typeof match.sourceLabel === "string" ? match.sourceLabel.trim() : "";
  const full = passageTextFromMatch(match, sources);
  const trimmed = trimExcerptTo300(full, statementText);
  if (!trimmed || !label) return null;
  return { sourceLabel: label, passage: trimmed, fullPassage: full };
}

/**
 * First match with given classification in source upload order; skips empty passages.
 * @param {Array<Record<string, unknown>>} matches
 * @param {string} cls
 */
function firstMatchWithClassification(matches, cls, sources, statementText) {
  const sorted = [...(Array.isArray(matches) ? matches : [])].sort(
    (a, b) => Number(a.sourceIndex) - Number(b.sourceIndex)
  );
  for (const m of sorted) {
    if (normalizeClassification(m.classification) !== cls) continue;
    const excerpt = toExcerpt(m, sources, statementText);
    if (excerpt) return excerpt;
  }
  return null;
}

function firstSpanExcerpt(supportSpans, sources, statementMatches, cls, statementText) {
  const spans = Array.isArray(supportSpans) ? supportSpans : [];
  const matches = Array.isArray(statementMatches) ? statementMatches : [];
  const srcs = Array.isArray(sources) ? sources : [];
  for (const span of spans) {
    if (normalizeClassification(span?.classification) !== cls) continue;
    const sourceIndex = Number.isFinite(Number(span?.sourceRefId))
      ? Number(span.sourceRefId)
      : Number(span?.sourceIndex);
    const match = matches.find((m) => Number(m?.sourceIndex) === sourceIndex);
    const src = Number.isFinite(sourceIndex) ? srcs[sourceIndex] : null;
    const sourceLabel =
      (typeof match?.sourceLabel === "string" && match.sourceLabel.trim()) ||
      (typeof src?.label === "string" && src.label.trim()) ||
      (Number.isFinite(sourceIndex) ? `Source ${sourceIndex + 1}` : "");
    const excerpt = toExcerpt(
      {
        sourceLabel,
        passage: span?.passage,
        start: span?.start,
        end: span?.end,
        sourceRefId: span?.sourceRefId,
        sourceIndex,
      },
      sources,
      statementText
    );
    if (excerpt) return excerpt;
  }
  return null;
}

function firstConflictingSpanExcerpt(supportSpans, sources, statementMatches, statementText) {
  return firstSpanExcerpt(supportSpans, sources, statementMatches, "conflicting", statementText);
}

function labelForSpan(span, matches, sources) {
  const sourceIndex = Number.isFinite(Number(span?.sourceRefId))
    ? Number(span.sourceRefId)
    : Number(span?.sourceIndex);
  const match = (Array.isArray(matches) ? matches : []).find((m) => Number(m?.sourceIndex) === sourceIndex);
  const src = Number.isFinite(sourceIndex) && Array.isArray(sources) ? sources[sourceIndex] : null;
  return (
    (typeof match?.sourceLabel === "string" && match.sourceLabel.trim()) ||
    (typeof src?.label === "string" && src.label.trim()) ||
    (Number.isFinite(sourceIndex) ? `Source ${sourceIndex + 1}` : "")
  );
}

function passageCandidates(matches, supportSpans, sources, cls, statementText) {
  const out = [];
  for (const m of Array.isArray(matches) ? matches : []) {
    if (normalizeClassification(m?.classification) !== cls) continue;
    const excerpt = toExcerpt(m, sources, statementText);
    if (excerpt) out.push({ excerpt, passage: excerpt.fullPassage || excerpt.passage, from: "match" });
  }
  for (const span of Array.isArray(supportSpans) ? supportSpans : []) {
    if (normalizeClassification(span?.classification) !== cls) continue;
    const sourceIndex = Number.isFinite(Number(span?.sourceRefId))
      ? Number(span.sourceRefId)
      : Number(span?.sourceIndex);
    const excerpt = toExcerpt(
      {
        sourceLabel: labelForSpan(span, matches, sources),
        passage: span?.passage,
        start: span?.start,
        end: span?.end,
        sourceRefId: span?.sourceRefId,
        sourceIndex,
      },
      sources,
      statementText
    );
    if (excerpt) out.push({ excerpt, passage: excerpt.fullPassage || excerpt.passage, from: "span" });
  }
  return out;
}

function figureKey(fig) {
  return `${fig?.kind}:${fig?.value}`;
}

function contentTokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 6);
}

function prefixHit(statementTokens, passage) {
  const pass = contentTokens(passage);
  let n = 0;
  for (const s of statementTokens) {
    const stem = s.slice(0, 6);
    if (pass.some((p) => p.startsWith(stem) || stem.startsWith(p.slice(0, 6)))) n += 1;
  }
  return n;
}

function scoreAnchorOverlap(statement, passage) {
  const stmtFigs = collectBackstopFigures(statement);
  const passFigs = collectBackstopFigures(passage);
  const stmtKeys = new Set(stmtFigs.map(figureKey));
  const overlapFigs = passFigs.filter((f) => stmtKeys.has(figureKey(f))).length;
  const extraFigs = passFigs.filter((f) => !stmtKeys.has(figureKey(f))).length;
  const phrase = prefixHit(contentTokens(statement), passage);
  return { overlapFigs, extraFigs, phrase, len: String(passage || "").length };
}

/**
 * B351 / B6. Highest overlap on the statement's own figures and distinctive
 * words, then shortest, then source order. Do not show a passage that
 * introduces a figure the statement does not use when another stored passage
 * carries the statement's distinctive phrasing.
 */
export function pickBestAnchorExcerpt(candidates, statementText) {
  const statement = typeof statementText === "string" ? statementText : "";
  const rows = (Array.isArray(candidates) ? candidates : []).filter((c) => c?.excerpt?.passage);
  if (rows.length === 0) return null;
  const collapsed = (p) => String(p || "").replace(/\s+/g, " ").replace(/\.+$/, "").trim();
  const withoutPrefix = rows.filter((row) => {
    const a = collapsed(row.passage);
    if (a.length < 20) return true;
    return !rows.some((other) => {
      if (other === row) return false;
      const b = collapsed(other.passage);
      return b.length > a.length && (b.startsWith(a) || b.includes(a.slice(0, Math.min(40, a.length))));
    });
  });
  const usable = withoutPrefix.length > 0 ? withoutPrefix : rows;
  if (!statement.trim()) return usable[0];
  const scored = usable.map((c, i) => ({ ...c, i, s: scoreAnchorOverlap(statement, c.passage) }));
  const hasPhraseNoExtra = scored.some((c) => c.s.phrase > 0 && c.s.extraFigs === 0);
  const pool = hasPhraseNoExtra
    ? scored.filter((c) => !(c.s.extraFigs > 0 && c.s.phrase === 0))
    : scored;
  const use = pool.length > 0 ? pool : scored;
  use.sort((a, b) => {
    const phraseFigA = a.s.overlapFigs + a.s.phrase;
    const phraseFigB = b.s.overlapFigs + b.s.phrase;
    if (phraseFigB !== phraseFigA) return phraseFigB - phraseFigA;
    if (a.s.extraFigs !== b.s.extraFigs) return a.s.extraFigs - b.s.extraFigs;
    if (a.s.len !== b.s.len) return a.s.len - b.s.len;
    return a.i - b.i;
  });
  return use[0];
}

function conflictingPassageCandidates(matches, supportSpans, sources, statementText) {
  return passageCandidates(matches, supportSpans, sources, "conflicting", statementText);
}

function preferFigureOverConfirmingQuote(primaryExcerpt, supportSpans, sources, matches, statementText, cls) {
  const statement = typeof statementText === "string" ? statementText : "";
  if (!statement.trim()) return primaryExcerpt;
  if (primaryExcerpt && confirmingPassageDisagrees(statement, primaryExcerpt.passage)) {
    return primaryExcerpt;
  }
  const figureSpan = firstSpanExcerpt(supportSpans, sources, matches, cls, statementText);
  if (figureSpan && confirmingPassageDisagrees(statement, figureSpan.passage)) {
    return figureSpan;
  }
  return primaryExcerpt;
}

function preferDisputedFigureExcerpt(candidates, statementText) {
  const statement = typeof statementText === "string" ? statementText : "";
  if (!statement.trim()) return null;
  for (const row of candidates) {
    if (confirmingPassageDisagrees(statement, row.passage)) return row;
  }
  return null;
}

function secondConflictingExcerpt(primaryExcerpt, matches, supportSpans, sources) {
  const candidates = conflictingPassageCandidates(matches, supportSpans, sources);
  for (const row of candidates) {
    if (isDistinctExcerpt(primaryExcerpt, row.excerpt)) return row.excerpt;
  }
  return null;
}

/**
 * @param {{
 *   statementMatches: Array<Record<string, unknown>>,
 *   verdict: string,
 *   hasConflict: boolean,
 *   supportSpans?: Array<Record<string, unknown>>,
 *   sources?: Array<{ text?: string, label?: string }>,
 *   statementText?: string,
 * }} params
 * @returns {{ primaryExcerpt: { sourceLabel: string, passage: string } | null, conflictExcerpt: { sourceLabel: string, passage: string } | null }}
 */
export function selectExcerpts({ statementMatches, verdict, hasConflict, supportSpans, sources, statementText }) {
  const matches = Array.isArray(statementMatches) ? statementMatches : [];
  const v = typeof verdict === "string" ? verdict : "not_supported";
  const statement = typeof statementText === "string" ? statementText : "";

  let primaryExcerpt = null;
  if (v === "confirmed") {
    const confirmedCandidates = passageCandidates(matches, supportSpans, sources, "confirmed", statement);
    const bestConfirmed = pickBestAnchorExcerpt(confirmedCandidates, statement);
    primaryExcerpt =
      bestConfirmed?.excerpt ||
      firstMatchWithClassification(matches, "confirmed", sources, statement) ||
      firstSpanExcerpt(supportSpans, sources, matches, "confirmed", statement);
  } else if (v === "conflicting") {
    primaryExcerpt = firstMatchWithClassification(matches, "conflicting", sources, statement);
  } else if (v === "partially_confirmed") {
    primaryExcerpt = firstMatchWithClassification(matches, "partially_confirmed", sources, statement);
  } else {
    primaryExcerpt = null;
  }

  let conflictExcerpt = null;
  if (hasConflict === true && v !== "conflicting") {
    conflictExcerpt = firstMatchWithClassification(matches, "conflicting", sources, statement);
  }

  if (v === "conflicting") {
    const candidates = conflictingPassageCandidates(matches, supportSpans, sources, statement);
    const preferred = preferDisputedFigureExcerpt(candidates, statement);
    if (preferred) {
      primaryExcerpt = preferred.excerpt;
      conflictExcerpt = null;
    } else if (!firstMatchWithClassification(matches, "conflicting", sources, statement)) {
      const fromSpan = firstConflictingSpanExcerpt(supportSpans, sources, matches, statement);
      if (fromSpan) {
        if (!primaryExcerpt) primaryExcerpt = fromSpan;
        conflictExcerpt = isDistinctExcerpt(primaryExcerpt, fromSpan) ? fromSpan : null;
      }
    }
    const figured = preferFigureOverConfirmingQuote(
      primaryExcerpt,
      supportSpans,
      sources,
      matches,
      statement,
      "conflicting"
    );
    if (figured !== primaryExcerpt) {
      primaryExcerpt = figured;
      if (!isDistinctExcerpt(primaryExcerpt, conflictExcerpt)) conflictExcerpt = null;
    }
    const conflictSameAsPrimary =
      conflictExcerpt == null || !isDistinctExcerpt(primaryExcerpt, conflictExcerpt);
    if (conflictSameAsPrimary) {
      const second = secondConflictingExcerpt(primaryExcerpt, matches, supportSpans, sources);
      if (second) conflictExcerpt = second;
    }
  }

  if (v === "partially_confirmed") {
    const candidates = passageCandidates(matches, supportSpans, sources, "partially_confirmed", statement);
    const preferred = preferDisputedFigureExcerpt(candidates, statement);
    if (preferred) {
      primaryExcerpt = preferred.excerpt;
    } else {
      const mixed = [
        ...passageCandidates(matches, supportSpans, sources, "confirmed", statement),
        ...candidates,
      ];
      const best = pickBestAnchorExcerpt(mixed, statement);
      if (best) primaryExcerpt = best.excerpt;
      else if (!primaryExcerpt) {
        const fromSpan = firstSpanExcerpt(supportSpans, sources, matches, "partially_confirmed", statement);
        if (fromSpan) primaryExcerpt = fromSpan;
      }
    }
    primaryExcerpt = preferFigureOverConfirmingQuote(
      primaryExcerpt,
      supportSpans,
      sources,
      matches,
      statement,
      "partially_confirmed"
    );
  }

  conflictExcerpt = fillSecondExcerpt({
    primaryExcerpt,
    conflictExcerpt,
    supportSpans,
    sources,
    statement,
    conflictFace: v === "conflicting" || hasConflict === true,
    matches,
  });

  const dbg = (x) =>
    x == null ? "null" : String(x.passage ?? "").length <= 80 ? String(x.passage ?? "") : `${String(x.passage).slice(0, 80)}…`;
  console.debug(`[stage4] primaryExcerpt=${dbg(primaryExcerpt)}, conflictExcerpt=${dbg(conflictExcerpt)}`);

  return { primaryExcerpt, conflictExcerpt };
}
