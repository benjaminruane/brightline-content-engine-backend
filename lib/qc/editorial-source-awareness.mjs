/**
 * B352. A flagged editorial span that already appears in a passage matched
 * to this card is not a concern. Comparison is against those passages only,
 * never the whole source document. Framing fidelity is untouched.
 */
import { recomputeV4EditorialVerdictFromConcerns } from "./editorial-compliance-reviewer.mjs";
import { normalizePassageForComparison } from "./pipeline-v4/stage2-match-sources.mjs";

export const EDITORIAL_PHRASE_IN_SOURCE = "editorial_phrase_in_source";

function asText(value) {
  return typeof value === "string" ? value : "";
}

function wordCount(text) {
  const t = asText(text).trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/**
 * Two words is the floor. A single common word coincides by chance even
 * inside one passage (S8 "significant" is the control: one word, and the
 * document hit is on a different card). A two-word flagged span ("record
 * year") is distinctive enough to drop. Longer spans may also drop when a
 * three-word window of the span sits in the matched passage (S12).
 */
function phraseInNormalizedPassage(flaggedNorm, passageNorm) {
  if (!flaggedNorm || !passageNorm) return false;
  const words = flaggedNorm.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (passageNorm.includes(flaggedNorm)) return true;
  if (words.length < 3) return false;
  for (let i = 0; i <= words.length - 3; i++) {
    const window = words.slice(i, i + 3).join(" ");
    if (passageNorm.includes(window)) return true;
  }
  return false;
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

export function flaggedTextsFromConcern(concern, statement) {
  const out = [];
  const seen = new Set();
  function add(raw) {
    const t = asText(raw).trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  }
  for (const slice of spanSlices(statement, concern)) add(slice);
  for (const q of quotedPhrases(concern?.note)) add(q);
  for (const q of quotedPhrases(concern?.suggestedDirection)) add(q);
  return out;
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
  const flagged = flaggedTextsFromConcern(concern, statement).map((t) =>
    normalizePassageForComparison(t)
  );
  const hay = (Array.isArray(passages) ? passages : [])
    .map((p) => normalizePassageForComparison(p))
    .filter(Boolean);
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
 * Drop editorial concerns whose flagged span is already in a passage matched
 * to this card. Does not count towards concern total, needs-attention, or
 * colour. Records slug editorial_phrase_in_source. No new surface.
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
    prior === "not_reviewed"
      ? prior
      : recomputeV4EditorialVerdictFromConcerns(kept, outputType);
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
