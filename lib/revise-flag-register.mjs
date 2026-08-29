/**
 * Silence never edits. It flags — at one of three volumes.
 *
 * Ben reversed the removal rule on 2026-08-29. Revise acts ONLY where a source
 * SAYS something: it contradicts the draft, or it states a specific value.
 * Where no source speaks to a claim the draft is flagged and never touched.
 *
 * But "no source speaks to this" is not one message. An unsupported EUR 80-100
 * million equity cheque and an unsupported "we recommend approval" are both
 * unbacked, and treating them alike either cries wolf about boilerplate or
 * shrugs at an unbacked figure. So:
 *
 *   LOUD      the flagged element carries something checkable — a figure,
 *             percentage, currency amount, multiple, date or period, ranking
 *             or superlative, a named third party, or a causal claim
 *   QUIET     it carries none of those
 *   ORDINARY  a source SAID something, so Revise is editing, not flagging
 *
 * DECIDED FROM materiality.features WHERE THEY SUFFICE, FROM THE ELEMENT TEXT
 * WHERE THEY DO NOT. Features are computed against the whole STATEMENT, not
 * the flagged element, and they cannot be relied on alone for two measured
 * reasons:
 *
 *   1. On a no_support or conflicting verdict, materiality level is "material"
 *      by verdict alone (lib/qc/materiality.mjs L193-199), regardless of
 *      features. The production card for "This relationship enabled deep
 *      insight during the diligence phase." is level "material" with features
 *      []. Level therefore carries no register signal on exactly the findings
 *      this module exists to classify.
 *   2. Nothing in extractStatementFeatures captures a CAUSAL claim, and Ben
 *      has decided causal claims are material. That sentence's "enabled" is
 *      the whole claim and no feature sees it.
 *
 * Every decision returns the signal that made it, so this is inspectable
 * rather than a black box.
 *
 * Deterministic. No model call. Reads cards; changes nothing about them.
 */

/** Features that, on their own, mean the statement carries checkable content. */
const LOUD_FEATURES = new Set([
  "monetary_figure",
  "percentage_metric",
  "date_period_claim",
  "named_person_entity_attribution",
  "comparative_superlative",
  "regulated_sensitive",
]);

/**
 * "forward_looking" is deliberately NOT loud. It fires on "expects", "intends"
 * and "plan to", which is most of what an author says about their own
 * intentions, and a stated intention is not a checkable third-party fact.
 */
export const NON_LOUD_FEATURES = new Set(["forward_looking"]);

export const REGISTER_LOUD = "LOUD";
export const REGISTER_QUIET = "QUIET";
export const REGISTER_ORDINARY = "ORDINARY";

/**
 * LOUD is deliberately more emphatic than the ordinary register: it states the
 * absence as a fact and gives an instruction, rather than inviting a check.
 */
export const LOUD_NOTE = "No supplied source states this. Do not publish it without one.";

/**
 * QUIET carries no "Confirm before publishing" closer. Nothing is being asked
 * of the user; the note exists to explain why nothing was done.
 */
export const QUIET_NOTE = "No supplied source speaks to this either way.";

const collapse = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Element-text probes, in the order they are reported. */
const TEXT_SIGNALS = [
  ["currency_amount", /(?:USD|EUR|GBP|AUD|CAD|CHF|JPY|\$|€|£)\s*[\d,.]+/i],
  ["figure", /\b\d[\d,.]*\b/],
  ["percentage", /\d+(?:\.\d+)?\s*%|\bper\s*cent\b|\bpercent(?:age)?\b/i],
  ["multiple", /\b\d+(?:\.\d+)?\s*(?:x\b|times\b)/i],
  [
    "date_or_period",
    /\b(?:Q[1-4]|FY|H[12])\s*20\d{2}\b|\b(?:19|20)\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\b(?:year[- ]on[- ]year|YoY|TTM|as at|as of)\b/i,
  ],
  [
    "ranking_or_superlative",
    /\b(?:top|first|largest|biggest|best|worst|leading|highest|lowest|only|quartile|decile|benchmark|peer group|outperform|underperform|more than|less than|greater than|versus|vs\.?|compared (?:with|to))\b/i,
  ],
  [
    "causal_claim",
    /\b(?:enabled|enables|enabling|caused|causes|causing|drove|drives|driven by|led to|leads to|resulted in|results in|resulting in|because of|thanks to|owing to|due to|meant that|means that|allowed|allowing|underpinned|gave (?:us|them) )\b/i,
  ],
];

/**
 * A capitalised multi-word name that is not the sentence opener. Single
 * capitalised words are excluded: a sentence-initial "This" or "The" is not a
 * named third party, and the false positive rate on one-word matches is high.
 */
const NAMED_THIRD_PARTY_RE = /\b[A-Z][a-zA-Z0-9&'’-]+(?:\s+(?:[A-Z][a-zA-Z0-9&'’-]+|[IVXLC]{1,5}\b))+/;

/**
 * Does a source SAY something here, as opposed to saying nothing?
 *
 * This is the ORDINARY gate and it is checked first. A conflict, or an
 * unsupported finding where the source states a competing value, is a case
 * where Revise edits; the loud/quiet distinction does not apply to it.
 *
 * @param {object} concern
 * @returns {{ sourceSpoke: boolean, signal: string }}
 */
export function sourceSpoke(concern) {
  const kind = concern?.evidence?.kind;
  const verdict = String(concern?.evidence?.verdict ?? "");

  if (kind === "conflict" || verdict === "conflicting") {
    return { sourceSpoke: true, signal: "evidence.kind=conflict" };
  }
  const claims = Array.isArray(concern?.claims) ? concern.claims : [];
  if (claims.some((c) => c?.role === "conflict")) {
    return { sourceSpoke: true, signal: "a decomposed claim conflicts" };
  }
  if (collapse(concern?.evidence?.sourcePassage)) {
    return { sourceSpoke: true, signal: "evidence.sourcePassage states a value" };
  }
  return { sourceSpoke: false, signal: "" };
}

/**
 * Which features the card carries that make the statement checkable.
 * @param {object} card
 * @returns {string[]}
 */
export function loudFeaturesOf(card) {
  const features = Array.isArray(card?.materiality?.features) ? card.materiality.features : [];
  return features.filter((f) => LOUD_FEATURES.has(f));
}

/**
 * Which element-text probes fire.
 * @param {string} elementText
 * @returns {string[]}
 */
export function loudTextSignalsOf(elementText) {
  const text = collapse(elementText);
  if (!text) return [];
  const fired = TEXT_SIGNALS.filter(([, re]) => re.test(text)).map(([name]) => name);
  if (NAMED_THIRD_PARTY_RE.test(text)) fired.push("named_third_party");
  return fired;
}

/**
 * The register for one flagged element.
 *
 * @param {object} concern    a gatherConcerns row
 * @param {object} [card]     anything carrying materiality — the qcCard, or the
 *                            concern itself, which gatherConcerns gives a
 *                            read-only copy. Defaults to the concern.
 * @param {string} [elementText]  the flagged element; defaults to the statement
 * @returns {{
 *   register: "LOUD"|"QUIET"|"ORDINARY",
 *   note: string|null,
 *   signal: string,
 *   featureSignals: string[],
 *   textSignals: string[],
 * }}
 */
export function flagRegister(concern, card = null, elementText = undefined) {
  const spoke = sourceSpoke(concern);
  if (spoke.sourceSpoke) {
    return {
      register: REGISTER_ORDINARY,
      note: null,
      signal: spoke.signal,
      featureSignals: [],
      textSignals: [],
    };
  }

  const element = collapse(elementText) || collapse(concern?.statementText);
  const featureSignals = loudFeaturesOf(card ?? concern);
  const textSignals = loudTextSignalsOf(element);

  // Features are computed over the whole statement, so they only decide the
  // register when the flagged element IS the whole statement. Where a tighter
  // element is flagged, a feature firing elsewhere in the sentence says
  // nothing about it, and the element text is the only honest signal.
  const elementIsWholeStatement = element === collapse(concern?.statementText);
  const useFeatures = elementIsWholeStatement && featureSignals.length > 0;

  if (textSignals.length > 0) {
    return {
      register: REGISTER_LOUD,
      note: LOUD_NOTE,
      signal: `element text: ${textSignals.join(", ")}`,
      featureSignals,
      textSignals,
    };
  }
  if (useFeatures) {
    return {
      register: REGISTER_LOUD,
      note: LOUD_NOTE,
      signal: `materiality.features: ${featureSignals.join(", ")}`,
      featureSignals,
      textSignals,
    };
  }
  return {
    register: REGISTER_QUIET,
    note: QUIET_NOTE,
    signal: featureSignals.length
      ? `no checkable content in the flagged element (statement features ${featureSignals.join(", ")} sit outside it)`
      : "no checkable content in the flagged element",
    featureSignals,
    textSignals,
  };
}

/**
 * The register notes are exempt from note normalisation and from
 * what-from-diff, the same carve-out AUTHOR_STATEMENT_KEPT_NOTE needs.
 *
 * QUIET must not acquire a "Confirm before publishing." closer, because there
 * is nothing to resolve. LOUD already ends on its own instruction, and
 * appending the softer closer after "Do not publish it without one." would
 * undercut exactly the emphasis the loud register exists to carry.
 * what-from-diff would overwrite both with a no-change account.
 *
 * @param {unknown} note
 * @returns {boolean}
 */
export function isFlagRegisterNote(note) {
  const text = collapse(note);
  return text === collapse(LOUD_NOTE) || text === collapse(QUIET_NOTE);
}
