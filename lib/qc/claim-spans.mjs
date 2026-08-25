/**
 * B53a: internal claim spans (pure). Upgrade-only rollup.
 * Claim results may never downgrade a verdict, alter hasConflict, or
 * override a sentence-level conflict.
 */

import { collectBackstopFigures } from "./pipeline-v4/stage2-match-sources.mjs";

export const MAX_CLAIMS_PER_SENTENCE = 3;
export const MAX_DECOMPOSED_SENTENCES = 12;

/** Additive coordinating boundaries. Exact tokens from the B53a spec. */
export const ADDITIVE_BOUNDARIES = [
  ", and ",
  ", with ",
  ", while ",
  ", including ",
  "; ",
  " as well as ",
];

/**
 * Relational connectives. Meaning lives in the connective, not in either
 * claim span. Word-boundary match; hyphenated prefixes do not count
 * ("step-up from" is not "up from").
 */
export const RELATIONAL_CONNECTIVES = [
  "driven by",
  "as a result",
  "because",
  "due to",
  "following",
  "after which",
  "compared with",
  "compared to",
  "up from",
  "down from",
  "versus",
  " vs ",
  "which meant",
  "leading to",
  "resulting in",
  "thereby",
];

/** Same date/period tokens as extractStatementFeatures in materiality.mjs. */
const DATE_PERIOD_RE =
  /\b(?:Q[1-4]\s*20\d{2}|FY\s*20\d{2}|H[12]\s*20\d{2}|20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December|year[- ]on[- ]year|YoY|TTM|as at|as of)\b/gi;

/** Same Title-Case run as extractStatementFeatures named-entity cue. */
const NAMED_ENTITY_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g;

const GENERIC_NUMBER_RE = /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g;

/**
 * Spelled-out cardinals for the claim-spans anchor test only.
 * Not used by collectBackstopFigures or materiality.
 */
const SPELLED_NUMBER_RE =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/gi;

/** All-caps tokens of two or more letters (ARR, EBITDA, IRR, MOIC, LP, IC). */
const ACRONYM_RE = /\b[A-Z]{2,}\b/g;

/** Capitalised words of two or more letters. Lone letters are not tokens here. */
const CAPITALISED_TOKEN_RE = /\b[A-Z][A-Za-z]+\b/g;

function asText(value) {
  return typeof value === "string" ? value : "";
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary matcher for a blocklist token. Hyphen on the left is not a
 * boundary, so "step-up from" does not match "up from".
 */
export function relationalConnectiveRe(connective) {
  const raw = String(connective || "");
  const trimmed = raw.trim();
  const escaped = escapeRegex(trimmed).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "i");
}

export function relationalConnectivesIn(text) {
  const t = asText(text);
  return RELATIONAL_CONNECTIVES.filter((c) => relationalConnectiveRe(c).test(t));
}

export function isClaimSpansEnabled(options = {}) {
  if (options.claimSpansEnabled === true) return true;
  if (options.claimSpansEnabled === false) return false;
  const v = String(process.env.QC_CLAIM_SPANS || "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

function levenshteinDistance(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function buildWhitespaceNormalizedMapping(text) {
  const t = asText(text);
  const normChars = [];
  const startOrig = [];
  const endOrig = [];
  let i = 0;
  while (i < t.length) {
    if (/\s/.test(t[i])) {
      const wsStart = i;
      while (i < t.length && /\s/.test(t[i])) i += 1;
      if (normChars.length === 0 || normChars[normChars.length - 1] !== " ") {
        normChars.push(" ");
        startOrig.push(wsStart);
        endOrig.push(i);
      }
    } else {
      normChars.push(t[i]);
      startOrig.push(i);
      endOrig.push(i + 1);
      i += 1;
    }
  }
  return { norm: normChars.join(""), startOrig, endOrig };
}

function normalizeForMatch(text) {
  return asText(text).replace(/\s+/g, " ").trim();
}

function origToNormIndex(mapping, origIndex) {
  const { startOrig, norm } = mapping;
  const minOrig = Math.max(0, origIndex);
  for (let i = 0; i < startOrig.length; i += 1) {
    if (startOrig[i] >= minOrig) return i;
  }
  return norm.length;
}

/**
 * Locate `needle` as a contiguous span of `haystack` after whitespace
 * normalisation, within Levenshtein distance 2. Same standard as Stage 1.
 * Search begins at original offset `minStart`.
 * @returns {{ start: number, end: number } | null}
 */
export function locateClaimSpan(haystack, needle, minStart = 0) {
  const parent = asText(haystack);
  const sliceNeedle = asText(needle).trim();
  const normNeedle = normalizeForMatch(needle);
  if (!parent || !normNeedle) return null;
  const from = Math.max(0, minStart);

  const exact = parent.indexOf(sliceNeedle, from);
  if (exact >= 0) {
    return { start: exact, end: exact + sliceNeedle.length };
  }

  const mapping = buildWhitespaceNormalizedMapping(parent);
  const { norm, startOrig, endOrig } = mapping;
  if (!norm) return null;

  const cursorNorm = origToNormIndex(mapping, from);
  const L = normNeedle.length;
  const exactNorm = norm.indexOf(normNeedle, cursorNorm);
  if (exactNorm >= 0) {
    return {
      start: startOrig[exactNorm],
      end: endOrig[exactNorm + L - 1],
    };
  }

  const minWin = Math.max(1, L - 2);
  const maxWin = L + 2;
  for (let i = cursorNorm; i < norm.length; i += 1) {
    for (let wlen = minWin; wlen <= maxWin; wlen += 1) {
      if (i + wlen > norm.length) break;
      const slice = norm.slice(i, i + wlen);
      if (levenshteinDistance(normNeedle, slice) <= 2) {
        return {
          start: startOrig[i],
          end: endOrig[i + wlen - 1],
        };
      }
    }
  }
  return null;
}

function pushSpan(out, start, end, kind, text) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
  out.push({ start, end, kind, text: asText(text) });
}

function collectRegexSpans(text, regex, kind) {
  const t = asText(text);
  const out = [];
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  let m = re.exec(t);
  while (m) {
    pushSpan(out, m.index, m.index + m[0].length, kind, m[0]);
    m = re.exec(t);
  }
  return out;
}

function collectFigureSpans(text) {
  const t = asText(text);
  const out = [];
  const figures = collectBackstopFigures(t);
  for (const fig of figures) {
    const raw = asText(fig?.raw);
    if (!raw) continue;
    let from = 0;
    while (from < t.length) {
      const idx = t.indexOf(raw, from);
      if (idx < 0) break;
      const end = idx + raw.length;
      const taken = out.some((s) => !(end <= s.start || idx >= s.end) && s.text === raw);
      if (!taken) {
        pushSpan(out, idx, end, fig.kind || "figure", raw);
        break;
      }
      from = idx + 1;
    }
  }
  return out;
}

function spansOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function collapseOverlappingSpans(spans) {
  const sorted = [...spans].sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenB !== lenA) return lenB - lenA;
    return a.start - b.start;
  });
  const kept = [];
  for (const span of sorted) {
    if (kept.some((k) => spansOverlap(k, span))) continue;
    kept.push(span);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

/**
 * Distinct verifiable anchors: numbers, percentages, money, dates, Title-Case
 * named entities. Reuses collectBackstopFigures plus the materiality date and
 * named-entity regexes. Generic digit runs fill the remaining number class.
 */
export function extractVerifiableAnchors(text) {
  const t = asText(text);
  if (!t) return [];
  const raw = [
    ...collectFigureSpans(t),
    ...collectRegexSpans(t, DATE_PERIOD_RE, "date"),
    ...collectRegexSpans(t, NAMED_ENTITY_RE, "named_entity"),
    ...collectRegexSpans(t, GENERIC_NUMBER_RE, "number"),
  ];
  return collapseOverlappingSpans(raw);
}

function firstTokenSpan(parent) {
  const t = asText(parent);
  const m = /\b[A-Za-z0-9]+\b/.exec(t);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length, text: m[0] };
}

function collectProperNounSpansFromParent(parent) {
  const t = asText(parent);
  const first = firstTokenSpan(t);
  const out = [];
  const re = new RegExp(CAPITALISED_TOKEN_RE.source, "g");
  let m = re.exec(t);
  while (m) {
    if (!(first && m.index === first.start)) {
      pushSpan(out, m.index, m.index + m[0].length, "proper_noun", m[0]);
    }
    m = re.exec(t);
  }
  return out;
}

function spansOverlapRange(span, start, end) {
  return span.start < end && span.end > start;
}

/**
 * Claim-spans anchor test (B64). Wraps extractVerifiableAnchors and adds
 * spelled-out numbers, all-caps acronyms, and non-sentence-initial
 * capitalised tokens. Local to claim-spans: the pre-filter still uses
 * extractVerifiableAnchors so conflict detection and materiality do not
 * change.
 *
 * Position for capitalised tokens is taken from the parent sentence, not
 * the claim: a claim may begin with a proper noun that sits mid-sentence.
 */
export function extractClaimSpanAnchors(text, options = {}) {
  const t = asText(text);
  const parent = asText(options.parentSentence || t);
  const fromText = [
    ...extractVerifiableAnchors(t),
    ...collectRegexSpans(t, SPELLED_NUMBER_RE, "spelled_number"),
    ...collectRegexSpans(t, ACRONYM_RE, "acronym"),
  ];

  const proper = collectProperNounSpansFromParent(parent);
  const claimedSpans = Array.isArray(options.claimedSpans) ? options.claimedSpans : null;
  const localStart = Number.isFinite(options.localStart) ? options.localStart : null;

  if (claimedSpans) {
    const unclaimedProper = proper.filter(
      (p) => !claimedSpans.some((s) => spansOverlapRange(p, s.start, s.end))
    );
    return [...collapseOverlappingSpans(fromText), ...unclaimedProper];
  }

  if (localStart != null) {
    const localEnd = localStart + t.length;
    for (const p of proper) {
      if (p.start >= localStart && p.end <= localEnd) {
        fromText.push({
          start: p.start - localStart,
          end: p.end - localStart,
          kind: p.kind,
          text: p.text,
        });
      }
    }
  } else if (parent === t) {
    fromText.push(...proper);
  } else {
    const first = firstTokenSpan(parent);
    for (const span of collectRegexSpans(t, CAPITALISED_TOKEN_RE, "proper_noun")) {
      if (first && span.start === 0 && span.text === first.text && parent.indexOf(t) === 0) {
        continue;
      }
      fromText.push(span);
    }
  }

  return collapseOverlappingSpans(fromText);
}

export function isCompoundCandidate(sentenceText) {
  const t = asText(sentenceText);
  if (!t.trim()) return false;
  const anchors = extractVerifiableAnchors(t);
  if (anchors.length < 2) return false;
  const hasBoundary = ADDITIVE_BOUNDARIES.some((b) => t.includes(b));
  if (!hasBoundary) return false;
  if (relationalConnectivesIn(t).length > 0) return false;
  return true;
}

function residualText(parent, spans) {
  const t = asText(parent);
  const sorted = [...spans].filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end)).sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const span of sorted) {
    const start = Math.max(0, span.start);
    const end = Math.max(start, span.end);
    if (start > cursor) out += t.slice(cursor, start);
    out += " ";
    cursor = Math.max(cursor, end);
  }
  out += t.slice(cursor);
  return out;
}

/**
 * All-or-nothing. Any failure discards every claim for the sentence.
 * @returns {{ ok: true, claims: Array<{ text: string, localStart: number, localEnd: number }> } | { ok: false, reason: string }}
 */
export function validateClaimSpans(parentSentence, claims) {
  const parent = asText(parentSentence);
  const raw = Array.isArray(claims) ? claims : [];
  if (raw.length < 2) return { ok: false, reason: "fewer_than_two_claims", failedClaim: asText(raw[0]) };
  if (raw.length > MAX_CLAIMS_PER_SENTENCE) return { ok: false, reason: "over_claim_cap", failedClaim: asText(raw[MAX_CLAIMS_PER_SENTENCE]) };

  const located = [];
  let minStart = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const modelText = asText(raw[i]);
    if (!modelText.trim()) return { ok: false, reason: "empty_claim", failedClaim: modelText };
    let span = locateClaimSpan(parent, modelText, minStart);
    if (!span) {
      const anywhere = locateClaimSpan(parent, modelText, 0);
      if (anywhere && anywhere.start < minStart) {
        return {
          ok: false,
          reason: anywhere.start < (located[located.length - 1]?.localStart ?? 0) ? "out_of_order" : "overlap",
          failedClaim: modelText,
        };
      }
      return { ok: false, reason: "not_contiguous_substring", failedClaim: modelText };
    }
    if (located.length > 0 && span.start < located[located.length - 1].localEnd) {
      return { ok: false, reason: "overlap", failedClaim: modelText };
    }
    const slice = parent.slice(span.start, span.end);
    if (extractClaimSpanAnchors(slice, { parentSentence: parent, localStart: span.start }).length < 1) {
      return { ok: false, reason: "anchorless_claim", failedClaim: slice || modelText };
    }
    located.push({
      text: slice,
      localStart: span.start,
      localEnd: span.end,
    });
    minStart = span.end;
  }

  return { ok: true, claims: located };
}

export function attachDraftOffsets(parentStatement, locatedClaims) {
  const charStart = Number.isFinite(parentStatement?.charStart)
    ? parentStatement.charStart
    : Number.isFinite(parentStatement?.startChar)
      ? parentStatement.startChar
      : 0;
  const parentText = asText(parentStatement?.text);
  return (Array.isArray(locatedClaims) ? locatedClaims : []).map((c, index) => {
    const localStart = Number.isFinite(c.localStart) ? c.localStart : 0;
    const localEnd = Number.isFinite(c.localEnd) ? c.localEnd : localStart;
    return {
      index,
      text: parentText.slice(localStart, localEnd),
      localStart,
      localEnd,
      draftStart: charStart + localStart,
      draftEnd: charStart + localEnd,
    };
  });
}

/**
 * Residual coverage diagnostic. Reports whether uncovered parent text still
 * holds a figure, date, name, spelled number, acronym, or mid-sentence
 * capitalised token. Diagnostic only: it does not gate the verdict. Route B
 * work will want "the claims do not cover all of this sentence".
 *
 * @param {string} parentSentence
 * @param {Array<object>} claims
 */
export function residualHasUnclaimedAnchor(parentSentence, claims) {
  const parent = asText(parentSentence);
  const spans = (Array.isArray(claims) ? claims : [])
    .map((c) => {
      if (Number.isFinite(c?.localStart) && Number.isFinite(c?.localEnd)) {
        return { start: c.localStart, end: c.localEnd };
      }
      if (Number.isFinite(c?.draftStart) && Number.isFinite(c?.draftEnd) && Number.isFinite(c?._parentCharStart)) {
        return { start: c.draftStart - c._parentCharStart, end: c.draftEnd - c._parentCharStart };
      }
      const text = asText(c?.text);
      if (!text) return null;
      const idx = parent.indexOf(text);
      if (idx < 0) return null;
      return { start: idx, end: idx + text.length };
    })
    .filter(Boolean);
  const residual = residualText(parent, spans);
  const anchors = extractClaimSpanAnchors(residual, {
    parentSentence: parent,
    claimedSpans: spans,
  });
  return {
    blocked: anchors.length > 0,
    residual,
    anchors,
  };
}

function emptyPayload() {
  return { decomposed: false, claimUpgrade: false, claims: [] };
}

/**
 * Upgrade-only, monotonic. Final verdict is V_today except when all four
 * conditions hold, in which case it is confirmed.
 *
 * DISABLED 2026-08-25 (`review-upgrade-off`). The upgrade is not applied.
 * Verdict is always V_today. claimUpgrade is always false. Conditions a-d
 * remain so the structure is still readable.
 *
 * Why it is off: across 296 corpus cards, exactly one reached this function
 * with vToday=partially_confirmed and all claims confirmed, and that one was
 * the synthetic E1 accident fixture, where the upgrade produced a false
 * green. On 254 production fixture cards the upgrade fired zero times; every
 * confirmed card was already confirmed at Stage 3. Zero observed correct
 * firings, one observed incorrect one. Every card in every Meridian
 * production run carried claimUpgrade false, so neither observed false-green
 * exhibit came through this path.
 *
 * Reconsider if a production corpus shows the four conditions holding on a
 * card whose residual is only connective scaffolding and whose unsupported
 * material actually sits inside a confirmed claim span.
 *
 * a. V_today is partially_confirmed
 * b. every claim verdict is confirmed (after per-claim supersession)
 * c. residualHasUnclaimedAnchor is false
 * d. no source returned conflicting on the whole-sentence match
 */
export function rollupClaimVerdicts({
  vToday,
  claimVerdicts,
  residualBlocked,
  wholeSentenceHasConflict,
} = {}) {
  const claims = Array.isArray(claimVerdicts) ? claimVerdicts : [];
  const a = vToday === "partially_confirmed";
  const b = claims.length > 0 && claims.every((v) => v === "confirmed");
  const c = residualBlocked !== true;
  const d = wholeSentenceHasConflict !== true;
  const upgrade = false;
  const blockedBy = [];
  if (a && !upgrade) {
    if (!b) blockedBy.push("b");
    if (!c) blockedBy.push("c");
    if (!d) blockedBy.push("d");
  }
  return {
    verdict: vToday,
    claimUpgrade: false,
    blockedBy,
    conditions: { a, b, c, d },
  };
}

export function emptyClaimSpanPayload() {
  return emptyPayload();
}
