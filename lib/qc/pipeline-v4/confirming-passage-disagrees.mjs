/**
 * B345 / B346. A confirmed passage that gives a different figure is not support.
 * Applied after Stage 2 returns a classification and before Stage 3.
 * Does not change hasEgregiousMagnitudeGap / B71.
 *
 * Two tiers (B346, B347):
 *   (b) same kind and same name, different value -> conflicting
 *   (a) one eligible money each, not the same quantity, no (b) match ->
 *       conflicting when the source figure is tagged total and the
 *       statement figure is unqualified; otherwise partially_confirmed
 * A component-tagged money token is not eligible, so a source total is
 * compared rather than a component of that total.
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

function currencyCode(token) {
  const c = typeof token?.currency === "string" ? token.currency.trim() : "";
  return c || "";
}

/**
 * B347. Refuse rule (a) only when value and scale match and at least one
 * side's currency is unknown. A bare $ does not disagree with USD at the
 * same magnitude. Two known and different currencies are a disagreement.
 */
function moneyMagnitudeEqual(a, b) {
  if (!a || !b) return false;
  if (a.kind !== "money" || b.kind !== "money") return false;
  if (a.scale !== b.scale) return false;
  if (a.value !== b.value) return false;
  return !currencyCode(a) || !currencyCode(b);
}

function sourceTotalVsUnqualified(statementToken, passageToken) {
  if (passageToken?.total !== true) return false;
  if (statementToken?.total === true) return false;
  if (statementToken?.component === true) return false;
  return true;
}

/**
 * @returns {{ rule: "a"|"b"|null, demoteTo: "conflicting"|"partially_confirmed"|null }}
 */
export function confirmingPassageVerdict(statement, passage) {
  const stmt = asText(statement);
  const pass = asText(passage);
  if (!stmt.trim() || !pass.trim()) return { rule: null, demoteTo: null };

  const agreedStarts = new Set(findFigureAgreements(stmt, pass).map((row) => row.draft.start));
  const draftQty = eligibleTokens(stmt);
  const sourceQty = eligibleTokens(pass);
  for (const draft of draftQty) {
    if (agreedStarts.has(draft.start)) continue;
    for (const source of sourceQty) {
      if (!kindNameSame(draft, source)) continue;
      if (draft.value !== source.value) return { rule: "b", demoteTo: "conflicting" };
    }
  }

  const stmtMoney = moneyTokens(stmt);
  const passMoney = moneyTokens(pass);
  if (stmtMoney.length === 1 && passMoney.length === 1) {
    const a = stmtMoney[0];
    const b = passMoney[0];
    if (!sameQuantity(a, b) && !moneyMagnitudeEqual(a, b)) {
      const demoteTo = sourceTotalVsUnqualified(a, b) ? "conflicting" : "partially_confirmed";
      return { rule: "a", demoteTo };
    }
  }

  return { rule: null, demoteTo: null };
}

/**
 * True when a confirmed passage may not stand as support for the statement.
 */
export function confirmingPassageDisagrees(statement, passage) {
  return confirmingPassageVerdict(statement, passage).demoteTo != null;
}

export function demoteConfirmedClassification(classification, statement, passage) {
  const cls = typeof classification === "string" ? classification.trim() : "";
  if (cls !== "confirmed") return cls || classification;
  const { demoteTo } = confirmingPassageVerdict(statement, passage);
  return demoteTo || cls;
}

/**
 * Copy matches and spans. Demote confirmed in place on the copies.
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
