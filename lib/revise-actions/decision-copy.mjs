/**
 * Closed explanation templates for contradicted evidence.
 * Filled from locator values. Pure. No model client.
 */

export const GENERIC_CONTRADICTION =
  "A source contradicts this statement. Decide whether the sentence should match the source.";

/** Every shipped template. A key added here without a pin in tests/revise-actions-decision-copy.test.mjs is a failure. */
export const TEMPLATE_IDS = Object.freeze([
  "generic",
  "correction_one",
  "correction_multi",
  "qualifier_silent",
  "dependents",
  "self_disagreement",
  "year_ambiguous",
  "qualifier_clash",
]);

export const EXPLAIN_CODES = Object.freeze({
  correction: "correction",
  qualifier_silent: "qualifier_silent",
  dependents: "dependents",
  self_disagreement: "self_disagreement",
  year_ambiguous: "year_ambiguous",
  qualifier_clash: "qualifier_clash",
});

function joinAnd(items) {
  const list = (Array.isArray(items) ? items : []).map((row) => String(row ?? "").trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

function pairRows(values) {
  const pairs = Array.isArray(values?.pairs) ? values.pairs : [];
  return pairs
    .map((pair) => ({
      fromRaw: String(pair?.fromRaw ?? "").trim(),
      toRaw: String(pair?.toRaw ?? "").trim(),
      measurePhrase: String(pair?.measurePhrase ?? "").trim(),
    }))
    .filter((pair) => pair.fromRaw && pair.toRaw);
}

export function correctionLine(values) {
  const rows = pairRows(values);
  if (rows.length === 0) return "";
  if (rows.length === 1) {
    const { fromRaw, toRaw, measurePhrase } = rows[0];
    if (measurePhrase) {
      return `The source gives ${toRaw} ${measurePhrase}, not the ${fromRaw} in this sentence.`;
    }
    return `The source gives ${toRaw}, not the ${fromRaw} in this sentence.`;
  }
  return `The source gives ${joinAnd(rows.map((row) => row.toRaw))}, against the ${joinAnd(rows.map((row) => row.fromRaw))} in this sentence.`;
}

function qualifierSilentLine(values) {
  const base = correctionLine(values);
  const word = String(values?.silentWord ?? "").trim();
  const value = String(values?.silentValue ?? "").trim();
  if (!base || !word || !value) return "";
  return `${base} It does not say whether its ${value} is gross or net, so the word ${word} is left as written.`;
}

function dependentsLine(values) {
  const source = String(values?.toRaw ?? "").trim();
  const draft = String(values?.fromRaw ?? "").trim();
  const dest = String(values?.destRaw ?? "").trim();
  if (!source || !draft || !dest) return "";
  return `The source gives ${source}, not the ${draft} in this sentence. The ${dest} target and the growth it implies are built on that figure, and no source covers them, so the projection needs reworking rather than one correction.`;
}

function selfDisagreementLine(values) {
  const figure = String(values?.figure ?? "").trim();
  if (!figure) return "";
  return `The same source states ${figure} elsewhere, so the figures cannot be reconciled from it.`;
}

function yearAmbiguousLine(values) {
  const sourceMonth = String(values?.sourceMonth ?? "").trim();
  const draftDate = String(values?.draftDate ?? "").trim();
  if (!sourceMonth || !draftDate) return "";
  return `The source states ${sourceMonth} without a year, and this sentence states ${draftDate}. The year has to be settled before the figure can be.`;
}

function qualifierClashLine(values) {
  const sourcePhrase = String(values?.sourcePhrase ?? "").trim();
  const draftPhrase = String(values?.draftPhrase ?? "").trim();
  const unnamed = String(values?.unnamedRaw ?? "").trim();
  if (!sourcePhrase || !draftPhrase || !unnamed) return "";
  return `The source gives ${sourcePhrase} against the ${draftPhrase} in this sentence, and does not name the ${unnamed}. The two are not necessarily the same measure.`;
}

/**
 * @param {{ code?: string, values?: object } | null | undefined} explain
 * @returns {string}
 */
export function fillDecisionCopy(explain) {
  const code = explain?.code;
  const values = explain?.values && typeof explain.values === "object" ? explain.values : {};
  if (code === EXPLAIN_CODES.qualifier_silent) return qualifierSilentLine(values);
  if (code === EXPLAIN_CODES.correction) return correctionLine(values);
  if (code === EXPLAIN_CODES.dependents) return dependentsLine(values);
  if (code === EXPLAIN_CODES.self_disagreement) return selfDisagreementLine(values);
  if (code === EXPLAIN_CODES.year_ambiguous) return yearAmbiguousLine(values);
  if (code === EXPLAIN_CODES.qualifier_clash) return qualifierClashLine(values);
  return "";
}
