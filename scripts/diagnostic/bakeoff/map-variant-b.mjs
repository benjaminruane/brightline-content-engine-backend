/**
 * Variant B mapping, frozen before the run.
 * Join by containment. Most-serious-wins. Silence = confirmed.
 */

export const ISSUE_TO_LABEL = {
  contrary_fact: "conflicting",
  outruns_source: "partially_confirmed",
  not_addressed: "no_support",
};

export const SEVERITY = {
  conflicting: 3,
  partially_confirmed: 2,
  no_support: 1,
  confirmed: 0,
};

export function normalizeBakeoffText(text) {
  return String(text ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

export function containmentJoin(quote, statementText) {
  const q = normalizeBakeoffText(quote);
  const s = normalizeBakeoffText(statementText);
  if (!q || !s) return false;
  return q.includes(s) || s.includes(q);
}

export function mostSeriousLabel(labels) {
  let best = "confirmed";
  for (const raw of Array.isArray(labels) ? labels : []) {
    const l = String(raw || "");
    if ((SEVERITY[l] || 0) > (SEVERITY[best] || 0)) best = l;
  }
  return best;
}

/**
 * Map a finding's issueClass (and problem text as fallback).
 * NEVER maps "does not support" to conflicting unless issueClass is contrary_fact.
 */
export function mapFindingToLabel(finding) {
  const cls = String(finding?.issueClass || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (cls === "contrary_fact" || cls === "contradicts" || cls === "contrary") {
    return "conflicting";
  }
  if (cls === "outruns_source" || cls === "outruns" || cls === "partial") {
    return "partially_confirmed";
  }
  if (cls === "not_addressed" || cls === "not_address" || cls === "absence") {
    return "no_support";
  }
  const problem = String(finding?.problem || "").toLowerCase();
  if (/\bcontrary fact\b/.test(problem) || /\bsource states a (different|contrary)\b/.test(problem)) {
    return "conflicting";
  }
  if (/\boutrun|\bpart(ly| is) supported|\bbeyond the source\b/.test(problem)) {
    return "partially_confirmed";
  }
  return "no_support";
}

export function joinFindingToStatements(finding, statements) {
  const quote = finding?.draftQuote;
  const fid = String(finding?.fixtureId || "");
  const matches = [];
  for (const stmt of Array.isArray(statements) ? statements : []) {
    if (fid && String(stmt.fixtureId) !== fid) continue;
    if (containmentJoin(quote, stmt.statementText || stmt.text)) {
      matches.push(stmt);
    }
  }
  return matches;
}

/**
 * Apply findings onto frozen labelled statements for one fixture.
 * Unmatched findings are off-list.
 */
export function mapVariantB({ findings, statements }) {
  const byKey = new Map();
  for (const stmt of Array.isArray(statements) ? statements : []) {
    const key = `${stmt.fixtureId}::${normalizeBakeoffText(stmt.statementText || stmt.text)}::${Number(stmt.occurrence) || 0}`;
    byKey.set(key, {
      fixtureId: stmt.fixtureId,
      statementText: stmt.statementText || stmt.text,
      occurrence: Number(stmt.occurrence) || 0,
      mappedLabel: "confirmed",
      findingLabels: [],
      findings: [],
      silent: true,
    });
  }

  const offList = [];
  let multiJoinCount = 0;
  for (const finding of Array.isArray(findings) ? findings : []) {
    const matches = joinFindingToStatements(finding, statements);
    const label = mapFindingToLabel(finding);
    const row = {
      ...finding,
      mappedLabel: label,
      joinCount: matches.length,
    };
    if (matches.length === 0) {
      offList.push(row);
      continue;
    }
    if (matches.length > 1) multiJoinCount += 1;
    for (const stmt of matches) {
      const key = `${stmt.fixtureId}::${normalizeBakeoffText(stmt.statementText || stmt.text)}::${Number(stmt.occurrence) || 0}`;
      const rec = byKey.get(key);
      if (!rec) continue;
      rec.silent = false;
      rec.findingLabels.push(label);
      rec.findings.push(row);
      rec.mappedLabel = mostSeriousLabel(rec.findingLabels);
    }
  }

  return {
    rows: [...byKey.values()],
    offList,
    multiJoinCount,
    coverageCount: [...byKey.values()].filter((r) => !r.silent).length,
  };
}

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
}

void runningAsMain;
