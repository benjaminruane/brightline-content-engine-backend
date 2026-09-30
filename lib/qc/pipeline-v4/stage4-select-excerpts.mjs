// Pipeline v4 — Stage 4: deterministic excerpt selection (QC rebuild).
// Rules per QC_Pipeline_Redesign_Architecture.docx §5.4.

import { confirmingPassageDisagrees } from "./confirming-passage-disagrees.mjs";
import { collectBackstopFigures } from "./stage2-match-sources.mjs";
import { sourceTextAt } from "../excerpt-locate.mjs";

function normalizeClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (c === "confirmed" || c === "partially_confirmed" || c === "conflicting" || c === "no_support") {
    return c;
  }
  return "no_support";
}

/**
 * Cap at 300 chars. Prefer a sentence boundary (period/!/? plus whitespace,
 * including newline). Else the last whitespace in the window. Never cut
 * inside a word. B351.
 * @param {string} passage
 * @returns {string|null} null if no non-empty passage
 */
export function trimExcerptTo300(passage) {
  const text = typeof passage === "string" ? passage : "";
  const t = text.trim();
  if (!t) return null;
  if (t.length <= 300) return t;

  const window = t.slice(0, 300);
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
    if (/\s/.test(window[i])) {
      lastWs = i;
      break;
    }
  }
  if (lastWs > 0) {
    return `${window.slice(0, lastWs).trimEnd()}...`;
  }
  return `${window.trimEnd()}...`;
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

function toExcerpt(match, sources) {
  if (!match) return null;
  const label = typeof match.sourceLabel === "string" ? match.sourceLabel.trim() : "";
  const trimmed = trimExcerptTo300(passageTextFromMatch(match, sources));
  if (!trimmed || !label) return null;
  return { sourceLabel: label, passage: trimmed };
}

/**
 * First match with given classification in source upload order; skips empty passages.
 * @param {Array<Record<string, unknown>>} matches
 * @param {string} cls
 */
function firstMatchWithClassification(matches, cls, sources) {
  const sorted = [...(Array.isArray(matches) ? matches : [])].sort(
    (a, b) => Number(a.sourceIndex) - Number(b.sourceIndex)
  );
  for (const m of sorted) {
    if (normalizeClassification(m.classification) !== cls) continue;
    const excerpt = toExcerpt(m, sources);
    if (excerpt) return excerpt;
  }
  return null;
}

function firstSpanExcerpt(supportSpans, sources, statementMatches, cls) {
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
      sources
    );
    if (excerpt) return excerpt;
  }
  return null;
}

function firstConflictingSpanExcerpt(supportSpans, sources, statementMatches) {
  return firstSpanExcerpt(supportSpans, sources, statementMatches, "conflicting");
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

function passageCandidates(matches, supportSpans, sources, cls) {
  const out = [];
  for (const m of Array.isArray(matches) ? matches : []) {
    if (normalizeClassification(m?.classification) !== cls) continue;
    const excerpt = toExcerpt(m, sources);
    if (excerpt) out.push({ excerpt, passage: excerpt.passage, from: "match" });
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
      sources
    );
    if (excerpt) out.push({ excerpt, passage: excerpt.passage, from: "span" });
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

function conflictingPassageCandidates(matches, supportSpans, sources) {
  return passageCandidates(matches, supportSpans, sources, "conflicting");
}

function preferFigureOverConfirmingQuote(primaryExcerpt, supportSpans, sources, matches, statementText, cls) {
  const statement = typeof statementText === "string" ? statementText : "";
  if (!statement.trim()) return primaryExcerpt;
  if (primaryExcerpt && confirmingPassageDisagrees(statement, primaryExcerpt.passage)) {
    return primaryExcerpt;
  }
  const figureSpan = firstSpanExcerpt(supportSpans, sources, matches, cls);
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

function normalizeExcerptText(value) {
  const raw = typeof value === "string" ? value : typeof value?.passage === "string" ? value.passage : "";
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

function excerptsAreSame(a, b) {
  const na = normalizeExcerptText(a);
  const nb = normalizeExcerptText(b);
  return na.length > 0 && na === nb;
}

function secondConflictingExcerpt(primaryExcerpt, matches, supportSpans, sources) {
  const candidates = conflictingPassageCandidates(matches, supportSpans, sources);
  for (const row of candidates) {
    if (!excerptsAreSame(primaryExcerpt, row.excerpt)) return row.excerpt;
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

  let primaryExcerpt = null;
  if (v === "confirmed") {
    const confirmedCandidates = passageCandidates(matches, supportSpans, sources, "confirmed");
    const bestConfirmed = pickBestAnchorExcerpt(confirmedCandidates, statementText);
    primaryExcerpt =
      bestConfirmed?.excerpt ||
      firstMatchWithClassification(matches, "confirmed", sources) ||
      firstSpanExcerpt(supportSpans, sources, matches, "confirmed");
  } else if (v === "conflicting") {
    primaryExcerpt = firstMatchWithClassification(matches, "conflicting", sources);
  } else if (v === "partially_confirmed") {
    primaryExcerpt = firstMatchWithClassification(matches, "partially_confirmed", sources);
  } else {
    primaryExcerpt = null;
  }

  let conflictExcerpt = null;
  if (hasConflict === true && v !== "conflicting") {
    conflictExcerpt = firstMatchWithClassification(matches, "conflicting", sources);
  }

  if (v === "conflicting") {
    const candidates = conflictingPassageCandidates(matches, supportSpans, sources);
    const preferred = preferDisputedFigureExcerpt(candidates, statementText);
    if (preferred) {
      primaryExcerpt = preferred.excerpt;
      conflictExcerpt = preferred.from === "span" ? preferred.excerpt : null;
    } else if (!firstMatchWithClassification(matches, "conflicting", sources)) {
      const fromSpan = firstConflictingSpanExcerpt(supportSpans, sources, matches);
      if (fromSpan) {
        conflictExcerpt = fromSpan;
        if (!primaryExcerpt) primaryExcerpt = fromSpan;
      }
    }
    const figured = preferFigureOverConfirmingQuote(
      primaryExcerpt,
      supportSpans,
      sources,
      matches,
      statementText,
      "conflicting"
    );
    if (figured !== primaryExcerpt) {
      primaryExcerpt = figured;
      conflictExcerpt = figured;
    }
    const conflictSameAsPrimary =
      conflictExcerpt == null || excerptsAreSame(primaryExcerpt, conflictExcerpt);
    if (conflictSameAsPrimary) {
      const second = secondConflictingExcerpt(primaryExcerpt, matches, supportSpans, sources);
      if (second) conflictExcerpt = second;
    }
    if (conflictExcerpt != null && excerptsAreSame(primaryExcerpt, conflictExcerpt)) {
      conflictExcerpt = null;
    }
  }

  if (v === "partially_confirmed") {
    const candidates = passageCandidates(matches, supportSpans, sources, "partially_confirmed");
    const preferred = preferDisputedFigureExcerpt(candidates, statementText);
    if (preferred) {
      primaryExcerpt = preferred.excerpt;
    } else {
      const mixed = [...passageCandidates(matches, supportSpans, sources, "confirmed"), ...candidates];
      const best = pickBestAnchorExcerpt(mixed, statementText);
      if (best) primaryExcerpt = best.excerpt;
      else if (!primaryExcerpt) {
        const fromSpan = firstSpanExcerpt(supportSpans, sources, matches, "partially_confirmed");
        if (fromSpan) primaryExcerpt = fromSpan;
      }
    }
    primaryExcerpt = preferFigureOverConfirmingQuote(
      primaryExcerpt,
      supportSpans,
      sources,
      matches,
      statementText,
      "partially_confirmed"
    );
  }

  const dbg = (x) =>
    x == null ? "null" : String(x.passage ?? "").length <= 80 ? String(x.passage ?? "") : `${String(x.passage).slice(0, 80)}…`;
  console.debug(`[stage4] primaryExcerpt=${dbg(primaryExcerpt)}, conflictExcerpt=${dbg(conflictExcerpt)}`);

  return { primaryExcerpt, conflictExcerpt };
}
