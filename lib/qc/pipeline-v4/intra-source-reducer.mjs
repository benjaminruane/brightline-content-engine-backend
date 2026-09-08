/**
 * Intra-source reducer: one statement-source pair takes the most serious
 * classification among the single-pick Stage 2 result and every locatable
 * widened supportSpan for that same pair.
 *
 * Locatable span classifications vote after an optional rounding LIFT.
 * The magnitude FORCE arm of applyRoundingToleranceBackstop is not applied:
 * confirmed and partially_confirmed spans keep their model class.
 * A conflicting span whose figures agree within tolerance is lifted to confirmed.
 */

import { locatePassageInSource } from "./stage2-match-multipassage.mjs";
import { applyRoundingToleranceBackstop } from "./stage2-match-sources.mjs";

const RANK = {
  conflicting: 4,
  partially_confirmed: 3,
  confirmed: 2,
  no_support: 1,
  not_supported: 1,
};

function normalizeClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (c === "confirmed" || c === "partially_confirmed" || c === "conflicting" || c === "no_support") {
    return c;
  }
  if (c === "not_supported") return "no_support";
  return "no_support";
}

function sourceTextFor(sources, sourceIndex) {
  const srcs = Array.isArray(sources) ? sources : [];
  const src = srcs[sourceIndex];
  return typeof src?.text === "string" ? src.text : "";
}

/**
 * Whether a widened span is allowed to vote on the pair classification.
 * @param {{ passage?: string, start?: number|null, end?: number|null }} span
 * @param {string} sourceText
 */
export function spanVotes(span, sourceText) {
  const passage = typeof span?.passage === "string" ? span.passage : "";
  if (!passage.trim()) return false;
  const loc = locatePassageInSource(sourceText, passage);
  return loc.start != null && loc.end != null;
}

/**
 * Rounding LIFT only. Never promote confirmed or partial to conflicting.
 * Conflicting spans go through applyRoundingToleranceBackstop so within-tolerance
 * figures become confirmed. The force arm is skipped because it only fires on
 * non-conflicting classifications.
 */
export function spanVoteClassification(span, statementText) {
  const cls = normalizeClassification(span?.classification);
  if (cls !== "conflicting") return cls;
  const passage = typeof span?.passage === "string" ? span.passage : "";
  const treated = applyRoundingToleranceBackstop(
    { classification: "conflicting", passage, explanation: "" },
    { statementText }
  );
  return treated.classification;
}

function mostSerious(classes) {
  let best = "no_support";
  let bestRank = -1;
  for (const raw of classes) {
    const c = normalizeClassification(raw);
    const rank = RANK[c] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = c;
    }
  }
  return best;
}

/**
 * Copy sourceMatches with each pair's classification reduced against locatable spans.
 * Does not mutate the input array or its objects. Does not append span rows.
 *
 * @param {{
 *   sourceMatches?: Array<{ sourceIndex?: number, classification?: string }>,
 *   supportSpans?: Array<{ sourceRefId?: number, sourceIndex?: number, classification?: string, passage?: string }>,
 *   sources?: Array<{ text?: string }>,
 *   statementText?: string,
 * }} args
 */
export function applyIntraSourceReducer({ sourceMatches, supportSpans, sources, statementText } = {}) {
  const matches = Array.isArray(sourceMatches) ? sourceMatches : [];
  const spans = Array.isArray(supportSpans) ? supportSpans : [];
  const statement = typeof statementText === "string" ? statementText : "";

  return matches.map((m) => {
    const sourceIndex = Number(m?.sourceIndex);
    const text = sourceTextFor(sources, sourceIndex);
    const pairSpans = spans.filter((s) => {
      const ref = Number.isFinite(Number(s?.sourceRefId)) ? Number(s.sourceRefId) : Number(s?.sourceIndex);
      return ref === sourceIndex;
    });
    const votes = [m?.classification];
    for (const span of pairSpans) {
      if (!spanVotes(span, text)) continue;
      votes.push(spanVoteClassification(span, statement));
    }
    return {
      ...m,
      classification: mostSerious(votes),
    };
  });
}
