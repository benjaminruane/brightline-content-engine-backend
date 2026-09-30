/**
 * B351. A card may not assert anything its stored evidence contradicts,
 * and may not report that it could not find something it is holding.
 * Deterministic. No model call.
 */

const CONTRASTIVE_LEAD = /^(however|but|nevertheless|yet)\b[,:\s]*/i;
const OMISSION_CLAIM = /\bdoes not mention\s+((?:(?!\.(?:\s|$)).)+)/gi;

function asText(value) {
  return typeof value === "string" ? value : "";
}

function sentenceConfirms(text) {
  const t = asText(text);
  if (!t.trim()) return false;
  if (/\bdoes not\b/i.test(t) && !/\bconfirm(?:s|ed|ing)\b/i.test(t)) return false;
  return /\b(confirm(?:s|ed|ing)?|aligns with|verifies|matches)\b/i.test(t);
}

/**
 * Split on a run of . ! ? unless that run is a single "." with a digit
 * immediately before and a digit immediately after. No abbreviation
 * handling. Leading whitespace stays on the following sentence so
 * rejoining does not change spacing.
 */
export function splitSentences(text) {
  const t = asText(text);
  if (!t) return [];
  const out = [];
  let start = 0;
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const digitBefore = i > 0 && t[i - 1] >= "0" && t[i - 1] <= "9";
    const digitAfter = i + 1 < t.length && t[i + 1] >= "0" && t[i + 1] <= "9";
    const isDecimal = ch === "." && digitBefore && digitAfter;
    if (isDecimal) continue;
    let j = i;
    while (j < t.length && (t[j] === "." || t[j] === "!" || t[j] === "?")) j += 1;
    out.push(t.slice(start, j));
    start = j;
    i = j - 1;
  }
  if (start < t.length) out.push(t.slice(start));
  return out;
}

/**
 * A confirming sentence may not be introduced by a contrastive.
 */
export function stripContrastiveOnConfirmingSentences(commentary) {
  const raw = asText(commentary);
  if (!raw.trim()) return raw;
  return splitSentences(raw)
    .map((sentence) => {
      const trimmed = sentence.replace(/^\s+/, "");
      const lead = trimmed.match(CONTRASTIVE_LEAD);
      if (!lead) return sentence;
      const rest = trimmed.slice(lead[0].length);
      if (!sentenceConfirms(rest)) return sentence;
      const indent = sentence.match(/^\s*/)[0];
      const restStart = rest.charAt(0);
      const recased = restStart && /[a-z]/.test(restStart) ? restStart.toUpperCase() + rest.slice(1) : rest;
      return `${indent}${recased}`;
    })
    .join("");
}

function wordBoundaryHas(haystack, needle) {
  const h = asText(haystack);
  const n = asText(needle).trim();
  if (!n) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i").test(h);
}

/**
 * Checkable tokens from an omission clause: percentages, all-caps names, Title-Case names.
 */
export function omissionTokensFromClause(clause) {
  const t = asText(clause);
  if (!t.trim()) return [];
  const out = [];
  const seen = new Set();
  function add(token) {
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(token);
  }
  for (const m of t.match(/\d+(?:\.\d+)?%/g) || []) add(m);
  for (const m of t.match(/\b[A-Z]{2,}\b/g) || []) add(m);
  // AUTHOR-NAME-BLIND: omission tokens are facts the source is alleged to lack.
  // The authoring organisation's name in that clause is a checkable token like
  // any other; if a stored span contains it, the omission claim is false.
  for (const m of t.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []) {
    if (m.length >= 3) add(m);
  }
  return out;
}

function spanPassages(spans) {
  return (Array.isArray(spans) ? spans : [])
    .map((s) => asText(s?.passage))
    .filter((p) => p.trim());
}

/**
 * True when commentary's only stated conflict ground is an omission, and a
 * stored span contains that thing as a verbatim slice (word-boundary).
 */
export function omissionConflictCoveredBySpans(commentary, spans) {
  const text = asText(commentary);
  const matches = [...text.matchAll(OMISSION_CLAIM)];
  if (matches.length === 0) return false;
  const hay = spanPassages(spans).join("\n");
  if (!hay.trim()) return false;
  for (const m of matches) {
    const tokens = omissionTokensFromClause(m[1]);
    if (tokens.length === 0) return false;
    if (!tokens.every((tok) => wordBoundaryHas(hay, tok))) return false;
  }
  return true;
}

function dropOmissionConflictSentences(commentary) {
  const raw = asText(commentary);
  if (!raw.trim()) return raw;
  const kept = [];
  for (const sentence of splitSentences(raw)) {
    const t = sentence.trim();
    if (/\bdoes not mention\b/i.test(t)) continue;
    if (/\breviewer should (?:verify|reconcile|adjust)\b/i.test(t)) continue;
    if (/\bthe conflict arises\b/i.test(t)) continue;
    kept.push(sentence);
  }
  return kept.join("").replace(/\s+$/, "").trim();
}

/**
 * If a conflict card's only stated ground is an omission the spans already
 * hold, the card is not a conflict (Ben: fully backed).
 */
export function applyOmissionConflictInvariant({
  commentary,
  spans,
  supportState,
  hasConflict,
  displayVerdict,
} = {}) {
  const conflictFace =
    supportState === "conflicting" || displayVerdict === "conflict" || hasConflict === true;
  if (!conflictFace) {
    return {
      applied: false,
      commentary: asText(commentary),
      supportState,
      hasConflict,
      displayVerdict,
    };
  }
  if (!omissionConflictCoveredBySpans(commentary, spans)) {
    return {
      applied: false,
      commentary: asText(commentary),
      supportState,
      hasConflict,
      displayVerdict,
    };
  }
  const cleaned = dropOmissionConflictSentences(commentary);
  return {
    applied: true,
    commentary: cleaned,
    supportState: "supported",
    hasConflict: false,
    displayVerdict: "supported_full",
  };
}
