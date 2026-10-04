/**
 * B352 / B354 / B355. A flagged editorial phrase that already appears in a
 * passage matched to this card is not a concern. Comparison is against
 * those passages only, never the whole source document. Framing fidelity
 * is untouched.
 *
 * B355: causal and evaluative families drop on the concern's own term
 * (connective or deleted word), with no two-word floor. Other codes keep
 * B354 whole-phrase containment and the two-word floor. Empty terms
 * never fall back to the whole phrase.
 */
import { recomputeV4EditorialVerdictFromConcerns } from "./editorial-compliance-reviewer.mjs";
import { normalizePassageForComparison } from "./pipeline-v4/stage2-match-sources.mjs";
import { objectionableTerms } from "./objectionable-term.mjs";
import { passageHasCausalRelation } from "./causal-stem.mjs";

export const EDITORIAL_PHRASE_IN_SOURCE = "editorial_phrase_in_source";

export {
  FLAGGED_TEXT_ROUTE,
  flaggedTextsFromConcern,
  selectFlaggedTextsFromConcern,
} from "./objectionable-term.mjs";

function asText(value) {
  return typeof value === "string" ? value : "";
}

function wordCount(text) {
  const t = asText(text).trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/**
 * Fold for this module only. normalizePassageForComparison does not
 * lowercase; other callers depend on that.
 */
function foldForEditorialCompare(text) {
  return normalizePassageForComparison(text).toLowerCase();
}

function termInPassages(term, hay, { requireTwoWords }) {
  const needle = foldForEditorialCompare(term);
  if (!needle) return false;
  if (requireTwoWords && wordCount(needle) < 2) return false;
  for (const passage of hay) {
    if (passage.includes(needle)) return true;
  }
  return false;
}

export function matchedPassagesFromCard({
  primaryExcerpt,
  conflictExcerpt,
  supportSpans,
  sourceMatches,
} = {}) {
  const out = [];
  function add(raw) {
    if (typeof raw === "string" && raw.trim()) out.push(raw);
    else if (raw && typeof raw.passage === "string" && raw.passage.trim()) out.push(raw.passage);
  }
  add(primaryExcerpt);
  add(conflictExcerpt);
  for (const span of Array.isArray(supportSpans) ? supportSpans : []) add(span);
  for (const m of Array.isArray(sourceMatches) ? sourceMatches : []) add(m);
  return out;
}

export function concernPhraseInMatchedPassages(concern, statement, passages) {
  const { family, terms } = objectionableTerms(concern, statement);
  const hay = (Array.isArray(passages) ? passages : []).map((p) => foldForEditorialCompare(p)).filter(Boolean);
  if (hay.length === 0) return false;
  if (terms.length === 0) return false;
  const noFloor = family === "causal" || family === "evaluative";
  for (const term of terms) {
    if (termInPassages(term, hay, { requireTwoWords: !noFloor })) return true;
    if (family === "causal") {
      for (const passage of hay) {
        if (passageHasCausalRelation(term, passage)) return true;
      }
    }
  }
  return false;
}

/**
 * Drop editorial concerns whose objectionable term is already in a
 * passage matched to this card. Does not count towards concern total,
 * needs-attention, or colour. Records slug editorial_phrase_in_source.
 * No new surface.
 */
export function applyEditorialSourceAwareness({
  statement,
  concerns,
  passages,
  editorialVerdict,
  outputType,
} = {}) {
  const list = Array.isArray(concerns) ? concerns : [];
  const kept = [];
  const dropped = [];
  for (const concern of list) {
    const { family } = objectionableTerms(concern, statement);
    if (concernPhraseInMatchedPassages(concern, statement, passages)) {
      const code =
        typeof concern?.concernCode === "string"
          ? concern.concernCode
          : typeof concern?.code === "string"
            ? concern.code
            : "";
      dropped.push({ concernCode: code, slug: EDITORIAL_PHRASE_IN_SOURCE, family });
      console.info(
        `[editorial] source-awareness dropped concernCode=${code || "unknown"} slug=${EDITORIAL_PHRASE_IN_SOURCE} family=${family}`
      );
      continue;
    }
    kept.push(concern);
  }
  if (dropped.length === 0) {
    return {
      concerns: list,
      dropped,
      editorialVerdict,
      suggestedDirection: undefined,
      suggestedRewrite: undefined,
    };
  }
  const prior = typeof editorialVerdict === "string" ? editorialVerdict : "";
  const nextVerdict =
    prior === "not_reviewed" ? prior : recomputeV4EditorialVerdictFromConcerns(kept, outputType);
  const first = kept[0];
  return {
    concerns: kept,
    dropped,
    editorialVerdict: nextVerdict,
    suggestedDirection:
      kept.length === 0
        ? null
        : typeof first?.suggestedDirection === "string"
          ? first.suggestedDirection
          : null,
    suggestedRewrite:
      kept.length === 0
        ? null
        : typeof first?.suggestedRewrite === "string"
          ? first.suggestedRewrite
          : null,
  };
}
