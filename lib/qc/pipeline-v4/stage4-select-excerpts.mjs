// Pipeline v4 — Stage 4: deterministic excerpt selection (QC rebuild).
// Rules per QC_Pipeline_Redesign_Architecture.docx §5.4.

import { confirmingPassageDisagrees } from "./confirming-passage-disagrees.mjs";

function normalizeClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (c === "confirmed" || c === "partially_confirmed" || c === "conflicting" || c === "no_support") {
    return c;
  }
  return "no_support";
}

/**
 * Cap at 300 chars; prefer last ". ", "! ", or "? " within the first 300 chars; else hard cut at 300 + "...".
 * @param {string} passage
 * @returns {string|null} null if no non-empty passage
 */
function trimExcerptTo300(passage) {
  const text = typeof passage === "string" ? passage : "";
  const t = text.trim();
  if (!t) return null;
  if (t.length <= 300) return t;

  const window = t.slice(0, 300);
  let lastBoundary = -1;
  for (let i = 0; i <= window.length - 2; i++) {
    const pair = window.slice(i, i + 2);
    if (pair === ". " || pair === "! " || pair === "? ") {
      lastBoundary = i;
    }
  }
  if (lastBoundary >= 0) {
    return `${window.slice(0, lastBoundary + 1).trimEnd()}...`;
  }
  return `${window.trimEnd()}...`;
}

function toExcerpt(match) {
  if (!match) return null;
  const label = typeof match.sourceLabel === "string" ? match.sourceLabel.trim() : "";
  const trimmed = trimExcerptTo300(match.passage);
  if (!trimmed || !label) return null;
  return { sourceLabel: label, passage: trimmed };
}

/**
 * First match with given classification in source upload order; skips empty passages.
 * @param {Array<Record<string, unknown>>} matches
 * @param {string} cls
 */
function firstMatchWithClassification(matches, cls) {
  const sorted = [...(Array.isArray(matches) ? matches : [])].sort(
    (a, b) => Number(a.sourceIndex) - Number(b.sourceIndex)
  );
  for (const m of sorted) {
    if (normalizeClassification(m.classification) !== cls) continue;
    const excerpt = toExcerpt(m);
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
    const passage = typeof span?.passage === "string" ? span.passage : "";
    if (!passage.trim()) continue;
    const sourceIndex = Number.isFinite(Number(span?.sourceRefId))
      ? Number(span.sourceRefId)
      : Number(span?.sourceIndex);
    const match = matches.find((m) => Number(m?.sourceIndex) === sourceIndex);
    const src = Number.isFinite(sourceIndex) ? srcs[sourceIndex] : null;
    const sourceLabel =
      (typeof match?.sourceLabel === "string" && match.sourceLabel.trim()) ||
      (typeof src?.label === "string" && src.label.trim()) ||
      (Number.isFinite(sourceIndex) ? `Source ${sourceIndex + 1}` : "");
    const excerpt = toExcerpt({ sourceLabel, passage });
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
    const excerpt = toExcerpt(m);
    if (excerpt) out.push({ excerpt, passage: excerpt.passage, from: "match" });
  }
  for (const span of Array.isArray(supportSpans) ? supportSpans : []) {
    if (normalizeClassification(span?.classification) !== cls) continue;
    const passage = typeof span?.passage === "string" ? span.passage : "";
    if (!passage.trim()) continue;
    const excerpt = toExcerpt({ sourceLabel: labelForSpan(span, matches, sources), passage });
    if (excerpt) out.push({ excerpt, passage: excerpt.passage, from: "span" });
  }
  return out;
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
    primaryExcerpt = firstMatchWithClassification(matches, "confirmed");
  } else if (v === "conflicting") {
    primaryExcerpt = firstMatchWithClassification(matches, "conflicting");
  } else if (v === "partially_confirmed") {
    primaryExcerpt = firstMatchWithClassification(matches, "partially_confirmed");
  } else {
    primaryExcerpt = null;
  }

  let conflictExcerpt = null;
  if (hasConflict === true && v !== "conflicting") {
    conflictExcerpt = firstMatchWithClassification(matches, "conflicting");
  }

  if (v === "conflicting") {
    const candidates = conflictingPassageCandidates(matches, supportSpans, sources);
    const preferred = preferDisputedFigureExcerpt(candidates, statementText);
    if (preferred) {
      primaryExcerpt = preferred.excerpt;
      conflictExcerpt = preferred.from === "span" ? preferred.excerpt : null;
    } else if (!firstMatchWithClassification(matches, "conflicting")) {
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
    } else if (!primaryExcerpt) {
      const fromSpan = firstSpanExcerpt(supportSpans, sources, matches, "partially_confirmed");
      if (fromSpan) primaryExcerpt = fromSpan;
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
