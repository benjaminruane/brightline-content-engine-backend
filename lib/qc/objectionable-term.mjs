/**
 * B355. The objectionable term comes from the concern, not the quote.
 * The quoted phrase is the stretch of the draft the objection sits in.
 * Causal and evaluative families name the exact words. Other codes keep
 * the B354 flagged texts, whole-phrase, two-word floor.
 */
import {
  EVALUATIVE_DELETION_RULE_IDS,
  parseEvaluativeDeletionDirection,
} from "./evaluative-language.mjs";

export const FLAGGED_TEXT_ROUTE = {
  QUOTED: "quoted",
  SPAN: "span",
};

export const CAUSAL_CONNECTIVES = [
  "driven primarily by",
  "driven largely by",
  "driven mainly by",
  "as a result of",
  "on the back of",
  "attributable to",
  "resulting from",
  "because of",
  "thanks to",
  "driven by",
  "due to",
  "led by",
  "helped by",
  "reflecting",
  "following",
];

function asText(value) {
  return typeof value === "string" ? value : "";
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
 * suggestedDirection is the flagged stretch; span slices are not used.
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

function concernCodeOf(concern) {
  if (typeof concern?.concernCode === "string" && concern.concernCode.trim()) {
    return concern.concernCode.trim();
  }
  if (typeof concern?.code === "string" && concern.code.trim()) return concern.code.trim();
  return "";
}

function causalConnectivesIn(text) {
  const hay = asText(text).toLowerCase();
  if (!hay) return [];
  const sorted = [...CAUSAL_CONNECTIVES].sort((a, b) => b.length - a.length);
  const found = [];
  const taken = [];
  for (const connective of sorted) {
    const needle = connective.toLowerCase();
    let from = 0;
    while (from <= hay.length - needle.length) {
      const idx = hay.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      const overlaps = taken.some(([s, e]) => idx < e && end > s);
      if (!overlaps) {
        found.push(connective);
        taken.push([idx, end]);
        break;
      }
      from = idx + 1;
    }
  }
  return found;
}

/**
 * @returns {{ family: "causal" | "evaluative" | "other", terms: string[] }}
 */
export function objectionableTerms(concern, statement) {
  const code = concernCodeOf(concern);
  if (code === "overreach_unsupported_causal") {
    const flagged = flaggedTextsFromConcern(concern, statement);
    const terms = [];
    const seen = new Set();
    for (const stretch of flagged) {
      for (const c of causalConnectivesIn(stretch)) {
        const key = c.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        terms.push(c);
      }
    }
    return { family: "causal", terms };
  }
  if (EVALUATIVE_DELETION_RULE_IDS.has(code)) {
    const parsed = parseEvaluativeDeletionDirection(concern?.suggestedDirection);
    const removed = typeof parsed?.removed === "string" ? parsed.removed.trim() : "";
    return { family: "evaluative", terms: removed ? [removed] : [] };
  }
  return { family: "other", terms: flaggedTextsFromConcern(concern, statement) };
}
