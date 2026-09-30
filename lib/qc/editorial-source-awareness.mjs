/**
 * B352 / B354. A flagged editorial phrase that already appears in a passage
 * matched to this card is not a concern. Comparison is against those
 * passages only, never the whole source document. Framing fidelity is
 * untouched.
 *
 * B354: the drop tests the objectionable term. Quoted phrases from the
 * note or suggestedDirection are the objection; span slices are only a
 * fallback when nothing is quoted. Whole-phrase containment, two-word
 * floor. No three-word window.
 */
import { recomputeV4EditorialVerdictFromConcerns } from "./editorial-compliance-reviewer.mjs";
import { normalizePassageForComparison } from "./pipeline-v4/stage2-match-sources.mjs";

export const EDITORIAL_PHRASE_IN_SOURCE = "editorial_phrase_in_source";

export const FLAGGED_TEXT_ROUTE = {
  QUOTED: "quoted",
  SPAN: "span",
};

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

/**
 * Two words is the floor. A single common word coincides by chance even
 * inside one passage (S8 "significant" is the control). The only
 * containment test is the whole flagged phrase.
 */
function phraseInNormalizedPassage(flaggedNorm, passageNorm) {
  if (!flaggedNorm || !passageNorm) return false;
  const words = flaggedNorm.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return passageNorm.includes(flaggedNorm);
}

function quotedPhrases(text) {
  const t = asText(text);
  const out = [];
  const re = /'([^']+)'|"([^"]+)"/g;
  let m;
  while ((m = re.exec(t))) {
    const hit = (m[1] || m[2] || "").trim();
    if (hit) out.push(hit);
  }
  return out;
}

function spanSlices(statement, concern) {
  const stmt = asText(statement);
  const span = concern?.span;
  const rows = Array.isArray(span) ? span : span && typeof span === "object" ? [span] : [];
  const out = [];
  for (const row of rows) {
    const start = Number(row?.startChar);
    const end = Number(row?.endChar);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const slice = stmt.slice(start, end).trim();
    if (slice) out.push(slice);
  }
  return out;
}

function dedupeTexts(raws) {
  const out = [];
  const seen = new Set();
  for (const raw of raws) {
    const t = asText(raw).trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Two-route selector. Route quoted: any quoted phrase in note or
 * suggestedDirection is the objection; span slices are not used.
 * Route span: no quoted phrase, fall back to startChar/endChar slices.
 * @returns {{ route: "quoted" | "span", texts: string[] }}
 */
export function selectFlaggedTextsFromConcern(concern, statement) {
  const quoted = dedupeTexts([
    ...quotedPhrases(concern?.note),
    ...quotedPhrases(concern?.suggestedDirection),
  ]);
  if (quoted.length > 0) {
    return { route: FLAGGED_TEXT_ROUTE.QUOTED, texts: quoted };
  }
  return { route: FLAGGED_TEXT_ROUTE.SPAN, texts: dedupeTexts(spanSlices(statement, concern)) };
}

export function flaggedTextsFromConcern(concern, statement) {
  return selectFlaggedTextsFromConcern(concern, statement).texts;
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
  const flagged = flaggedTextsFromConcern(concern, statement).map((t) => foldForEditorialCompare(t));
  const hay = (Array.isArray(passages) ? passages : []).map((p) => foldForEditorialCompare(p)).filter(Boolean);
  if (hay.length === 0) return false;
  for (const phrase of flagged) {
    if (wordCount(phrase) < 2) continue;
    for (const passage of hay) {
      if (phraseInNormalizedPassage(phrase, passage)) return true;
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
    if (concernPhraseInMatchedPassages(concern, statement, passages)) {
      const code =
        typeof concern?.concernCode === "string"
          ? concern.concernCode
          : typeof concern?.code === "string"
            ? concern.code
            : "";
      dropped.push({ concernCode: code, slug: EDITORIAL_PHRASE_IN_SOURCE });
      console.info(
        `[editorial] source-awareness dropped concernCode=${code || "unknown"} slug=${EDITORIAL_PHRASE_IN_SOURCE}`
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
