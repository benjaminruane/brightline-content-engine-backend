/**
 * Pr9 marker-consistency classifiers (deterministic; no LLM).
 *
 * Span status: word-level LCS diff of revised vs original. A marker is CHANGED
 * if its [start, end) in the revised draft overlaps any revised word that is
 * not LCS-aligned to an identical original word. Otherwise UNCHANGED.
 *
 * Boundary cases:
 * - Alignment is on whole words (/\S+/), exact string match, case-sensitive.
 *   A word that exists elsewhere in the original does not count as unchanged
 *   unless LCS pairs it at this position.
 * - Inserted or replaced revised words are changed regions. Deleted original
 *   words do not create a revised-side range (nothing to overlap).
 * - Contiguous non-aligned revised words merge into one changed range,
 *   including the whitespace between them.
 * - A marker that covers only whitespace between two aligned words overlaps
 *   no changed word and is UNCHANGED.
 * - Zero-length markers (end <= start) are UNCHANGED (no overlap).
 * - Punctuation glued to a word is part of that word: "Shopify." vs "Shopify"
 *   is CHANGED. A period inserted outside the marker is ignored for that marker.
 * - House-style rewrites ($7,000,000 vs USD 7 million) are CHANGED even when
 *   the surrounding claim is otherwise kept. This can hide a "claims removal
 *   of a figure that is still present" defect when the same span also took a
 *   mechanical rewrite. The official bucket still follows overlap-with-changed.
 * - Byte-identical span vs original (the 2026-08-22 defect shape) is UNCHANGED.
 *
 * Note claim: whole-word match on a closed verb list, not stems. "cutting" in
 * "consider cutting" is not "cut", so keep-and-flag notes stay CLAIMS_NO_CHANGE
 * when they lead with kept/retained/left in place.
 */

export const CHANGE_VERBS = [
  "removed",
  "changed",
  "replaced",
  "corrected",
  "softened",
  "cut",
  "dropped",
  "reworded",
  "qualified",
  "added",
];

const CHANGE_VERB_RE = new RegExp(`\\b(?:${CHANGE_VERBS.join("|")})\\b`, "i");
const KEEP_RE =
  /\bkept\b|\bretained\b|\bleft in place\b|\bleave in place\b|\bleaving in place\b|\bleaves in place\b/i;
const CONFIRM_ONLY_RE =
  /^(?:confirm(?:\s+this(?:\s+softer)?\s+formulation)?(?:\s+before\s+publishing)?[.!?]*)?$/i;

export const SPAN_CHANGED = "CHANGED";
export const SPAN_UNCHANGED = "UNCHANGED";

export const NOTE_CLAIMS_CHANGE = "CLAIMS_A_CHANGE";
export const NOTE_CLAIMS_NO_CHANGE = "CLAIMS_NO_CHANGE";
export const NOTE_AMBIGUOUS = "AMBIGUOUS";

export const OUTCOME_CORRECT_CHANGE = "correct_changed_claims_change";
export const OUTCOME_CORRECT_KEEP = "correct_unchanged_claims_no_change";
export const OUTCOME_DEFECT = "defect_unchanged_claims_change";
export const OUTCOME_WRONG_KEEP_ON_CHANGE = "wrong_changed_claims_no_change";
export const OUTCOME_AMBIGUOUS = "ambiguous";

/**
 * @param {string} text
 * @returns {Array<{ text: string, start: number, end: number }>}
 */
export function tokenizeWords(text) {
  const source = typeof text === "string" ? text : "";
  const tokens = [];
  const re = /\S+/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    tokens.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * LCS-backtrack: revised token index -> true when aligned to an identical
 * original token.
 * @param {Array<{ text: string }>} originalTokens
 * @param {Array<{ text: string }>} revisedTokens
 * @returns {boolean[]}
 */
export function alignedRevisedMask(originalTokens, revisedTokens) {
  const n = originalTokens.length;
  const m = revisedTokens.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (originalTokens[i - 1].text === revisedTokens[j - 1].text) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }
  const aligned = new Array(m).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (originalTokens[i - 1].text === revisedTokens[j - 1].text) {
      aligned[j - 1] = true;
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return aligned;
}

/**
 * Changed character ranges in the revised text (merged contiguous non-aligned
 * words, whitespace between them included).
 * @param {string} original
 * @param {string} revised
 * @returns {Array<{ start: number, end: number }>}
 */
export function wordDiffChangedRanges(original, revised) {
  const originalTokens = tokenizeWords(original);
  const revisedTokens = tokenizeWords(revised);
  const aligned = alignedRevisedMask(originalTokens, revisedTokens);
  const ranges = [];
  let runStart = -1;
  let runEnd = -1;
  for (let j = 0; j < revisedTokens.length; j++) {
    if (aligned[j]) {
      if (runStart >= 0) {
        ranges.push({ start: runStart, end: runEnd });
        runStart = -1;
        runEnd = -1;
      }
      continue;
    }
    const tok = revisedTokens[j];
    if (runStart < 0) {
      runStart = tok.start;
      runEnd = tok.end;
    } else {
      runEnd = tok.end;
    }
  }
  if (runStart >= 0) ranges.push({ start: runStart, end: runEnd });
  return ranges;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * @param {string} original
 * @param {string} revised
 * @param {number} start
 * @param {number} end
 * @returns {"CHANGED"|"UNCHANGED"}
 */
export function markerSpanStatus(original, revised, start, end) {
  const s = Number.isFinite(start) ? start : 0;
  const e = Number.isFinite(end) ? end : s;
  if (e <= s) return SPAN_UNCHANGED;
  const ranges = wordDiffChangedRanges(original, revised);
  for (const r of ranges) {
    if (rangesOverlap(s, e, r.start, r.end)) return SPAN_CHANGED;
  }
  return SPAN_UNCHANGED;
}

function noteBodyWithoutCloser(note) {
  return String(note || "")
    .replace(/\s*Confirm before publishing\.?\s*$/i, "")
    .trim();
}

/**
 * @param {string} note
 * @returns {"CLAIMS_A_CHANGE"|"CLAIMS_NO_CHANGE"|"AMBIGUOUS"}
 */
export function classifyNoteClaim(note) {
  const raw = typeof note === "string" ? note.trim() : "";
  if (!raw) return NOTE_CLAIMS_NO_CHANGE;

  const claimsChange = CHANGE_VERB_RE.test(raw);
  const claimsKeep = KEEP_RE.test(raw);
  if (claimsChange && claimsKeep) return NOTE_AMBIGUOUS;
  if (claimsChange) return NOTE_CLAIMS_CHANGE;
  if (claimsKeep) return NOTE_CLAIMS_NO_CHANGE;

  const body = noteBodyWithoutCloser(raw);
  if (!body || CONFIRM_ONLY_RE.test(body)) return NOTE_CLAIMS_NO_CHANGE;
  return NOTE_AMBIGUOUS;
}

/**
 * @param {"CHANGED"|"UNCHANGED"} spanStatus
 * @param {"CLAIMS_A_CHANGE"|"CLAIMS_NO_CHANGE"|"AMBIGUOUS"} noteClaim
 * @returns {string}
 */
export function outcomeBucket(spanStatus, noteClaim) {
  if (noteClaim === NOTE_AMBIGUOUS) return OUTCOME_AMBIGUOUS;
  if (spanStatus === SPAN_UNCHANGED && noteClaim === NOTE_CLAIMS_CHANGE) return OUTCOME_DEFECT;
  if (spanStatus === SPAN_CHANGED && noteClaim === NOTE_CLAIMS_NO_CHANGE) {
    return OUTCOME_WRONG_KEEP_ON_CHANGE;
  }
  if (spanStatus === SPAN_CHANGED && noteClaim === NOTE_CLAIMS_CHANGE) {
    return OUTCOME_CORRECT_CHANGE;
  }
  return OUTCOME_CORRECT_KEEP;
}

/**
 * True when an evidence gap has no stated replacement figure in source text.
 * Heuristic: excerpt + sourcePassage contain no digit.
 * @param {object|null|undefined} evidence
 */
export function sourceIsSilent(evidence) {
  if (!evidence || typeof evidence !== "object") return false;
  const kind = evidence.kind;
  if (kind !== "unsupported" && kind !== "conflict" && kind !== "partial") return false;
  const blob = `${evidence.excerpt || ""} ${evidence.sourcePassage || ""}`;
  return !/\d/.test(blob);
}

function wordOverlapScore(a, b) {
  const setA = new Set(tokenizeWords(a).map((t) => t.text.toLowerCase()));
  const setB = new Set(tokenizeWords(b).map((t) => t.text.toLowerCase()));
  if (setA.size === 0 || setB.size === 0) return 0;
  let n = 0;
  for (const w of setA) {
    if (setB.has(w)) n += 1;
  }
  return n;
}

/**
 * Pick the gathered concern row this marker most likely belongs to.
 * @param {string} span
 * @param {string} originalDraft
 * @param {Array<object>} concerns
 */
export function matchConcernForMarker(span, originalDraft, concerns) {
  const list = Array.isArray(concerns) ? concerns : [];
  if (list.length === 0) return null;
  const spanText = typeof span === "string" ? span : "";

  if (spanText) {
    for (const row of list) {
      const stmt = typeof row.statementText === "string" ? row.statementText : "";
      if (stmt && (stmt.includes(spanText) || spanText.includes(stmt))) return row;
    }
    const at = typeof originalDraft === "string" ? originalDraft.indexOf(spanText) : -1;
    if (at >= 0) {
      for (const row of list) {
        const stmt = typeof row.statementText === "string" ? row.statementText : "";
        if (!stmt) continue;
        const stmtAt = originalDraft.indexOf(stmt);
        if (stmtAt < 0) continue;
        if (rangesOverlap(at, at + spanText.length, stmtAt, stmtAt + stmt.length)) return row;
      }
    }
  }

  let best = list[0];
  let bestScore = -1;
  for (const row of list) {
    const stmt = typeof row.statementText === "string" ? row.statementText : "";
    const score = wordOverlapScore(spanText, stmt);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

function findingKindsFromConcern(row) {
  const kinds = [];
  if (row?.evidence?.kind) kinds.push(`evidence:${row.evidence.kind}`);
  else if (row?.evidence) kinds.push("evidence:gap");
  if (Array.isArray(row?.editorial)) {
    for (const c of row.editorial) {
      if (c?.kind) kinds.push(`editorial:${c.kind}`);
    }
  }
  if (Array.isArray(row?.compliance)) {
    for (const c of row.compliance) {
      if (c?.kind) kinds.push(`compliance:${c.kind}`);
    }
  }
  return kinds;
}

/**
 * @param {string} originalDraft
 * @param {string} revisedDraft
 * @param {{ start: number, end: number, note: string }} marker
 * @param {Array<object>} concerns
 */
export function classifyMarker(originalDraft, revisedDraft, marker, concerns = []) {
  const start = Number.isFinite(marker?.start) ? marker.start : 0;
  const end = Number.isFinite(marker?.end) ? marker.end : start;
  const span = typeof revisedDraft === "string" ? revisedDraft.slice(start, end) : "";
  const note = typeof marker?.note === "string" ? marker.note : "";
  const spanStatus = markerSpanStatus(originalDraft, revisedDraft, start, end);
  const noteClaim = classifyNoteClaim(note);
  const outcome = outcomeBucket(spanStatus, noteClaim);
  const matched = matchConcernForMarker(span, originalDraft, concerns);
  const kinds = findingKindsFromConcern(matched);
  const silent = sourceIsSilent(matched?.evidence);
  return {
    start,
    end,
    span,
    note,
    spanStatus,
    noteClaim,
    outcome,
    spanExactInOriginal:
      Boolean(span) && typeof originalDraft === "string" && originalDraft.includes(span),
    statementIndex: matched?.statementIndex ?? null,
    statementText: matched?.statementText || "",
    findingKinds: kinds,
    sourceSilent: silent,
    evidenceKind: matched?.evidence?.kind || null,
  };
}

export function emptyTally() {
  return {
    markers: 0,
    [OUTCOME_CORRECT_CHANGE]: 0,
    [OUTCOME_CORRECT_KEEP]: 0,
    [OUTCOME_DEFECT]: 0,
    [OUTCOME_WRONG_KEEP_ON_CHANGE]: 0,
    [OUTCOME_AMBIGUOUS]: 0,
  };
}

export function addToTally(tally, outcome) {
  tally.markers += 1;
  if (Object.prototype.hasOwnProperty.call(tally, outcome)) tally[outcome] += 1;
  else tally[OUTCOME_AMBIGUOUS] += 1;
}
