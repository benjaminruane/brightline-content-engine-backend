/**
 * B345. A confirmed passage that gives a different figure is not support.
 * Applied after Stage 2 returns a classification and before Stage 3.
 * Does not change hasEgregiousMagnitudeGap / B71.
 */

import {
  annotateTokens,
  findFigureAgreements,
  kindNameSame,
  sameQuantity,
} from "../../revise-actions/conflict-engagement.mjs";

function asText(value) {
  return typeof value === "string" ? value : "";
}

function isBlocked(token) {
  if (!token || typeof token !== "object") return true;
  if (token.kind === "date") return true;
  if (token.component) return true;
  if (token.rangeRole) return true;
  return false;
}

function eligibleTokens(text) {
  return annotateTokens(asText(text)).filter((token) => !isBlocked(token));
}

function moneyTokens(text) {
  return eligibleTokens(text).filter((token) => token.kind === "money");
}

/**
 * True when a confirmed passage disagrees with the statement on a figure.
 * (a) each side has exactly one eligible money token and sameQuantity is false.
 * (b) kindNameSame finds a same-kind same-name quantity with a different value.
 */
export function confirmingPassageDisagrees(statement, passage) {
  const stmt = asText(statement);
  const pass = asText(passage);
  if (!stmt.trim() || !pass.trim()) return false;

  const stmtMoney = moneyTokens(stmt);
  const passMoney = moneyTokens(pass);
  if (stmtMoney.length === 1 && passMoney.length === 1 && !sameQuantity(stmtMoney[0], passMoney[0])) {
    return true;
  }

  const agreedStarts = new Set(
    findFigureAgreements(stmt, pass).map((row) => row.draft.start)
  );
  const draftQty = eligibleTokens(stmt);
  const sourceQty = eligibleTokens(pass);
  for (const draft of draftQty) {
    if (agreedStarts.has(draft.start)) continue;
    for (const source of sourceQty) {
      if (!kindNameSame(draft, source)) continue;
      if (draft.value !== source.value) return true;
    }
  }
  return false;
}

export function demoteConfirmedClassification(classification, statement, passage) {
  const cls = typeof classification === "string" ? classification.trim() : "";
  if (cls !== "confirmed") return cls || classification;
  if (confirmingPassageDisagrees(statement, passage)) return "conflicting";
  return cls;
}

/**
 * Copy matches and spans. Demote confirmed -> conflicting in place on the copies.
 * Never drops a passage. Never weakens conflicting or partially_confirmed.
 */
export function demoteConfirmedClassifications({ statementText, sourceMatches, supportSpans } = {}) {
  const statement = asText(statementText);
  const matches = Array.isArray(sourceMatches) ? sourceMatches : [];
  const spans = Array.isArray(supportSpans) ? supportSpans : [];
  return {
    sourceMatches: matches.map((m) => {
      const passage = typeof m?.passage === "string" ? m.passage : "";
      const next = demoteConfirmedClassification(m?.classification, statement, passage);
      if (next === m?.classification) return { ...m };
      return { ...m, classification: next, preDemoteClassification: m?.classification };
    }),
    supportSpans: spans.map((s) => {
      const passage = typeof s?.passage === "string" ? s.passage : "";
      const next = demoteConfirmedClassification(s?.classification, statement, passage);
      if (next === s?.classification) return { ...s };
      return { ...s, classification: next, preDemoteClassification: s?.classification };
    }),
  };
}
