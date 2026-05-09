// Pipeline v4 — Stage 4: deterministic excerpt selection (QC rebuild).
// Rules per QC_Pipeline_Redesign_Architecture.docx §5.4.

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

/**
 * @param {{
 *   statementMatches: Array<Record<string, unknown>>,
 *   verdict: string,
 *   hasConflict: boolean
 * }} params
 * @returns {{ primaryExcerpt: { sourceLabel: string, passage: string } | null, conflictExcerpt: { sourceLabel: string, passage: string } | null }}
 */
export function selectExcerpts({ statementMatches, verdict, hasConflict }) {
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

  const dbg = (x) =>
    x == null ? "null" : String(x.passage ?? "").length <= 80 ? String(x.passage ?? "") : `${String(x.passage).slice(0, 80)}…`;
  console.debug(`[stage4] primaryExcerpt=${dbg(primaryExcerpt)}, conflictExcerpt=${dbg(conflictExcerpt)}`);

  return { primaryExcerpt, conflictExcerpt };
}
