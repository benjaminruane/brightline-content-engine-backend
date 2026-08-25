// lib/qc/evaluative-language.mjs
// Shared contract for marketing_language_excess and hyperbole_vs_qualitative:
// delete an unsupported evaluative word, or keep and flag it. Never substitute
// a milder one.

export const EVALUATIVE_LANGUAGE_INSTRUCTION = `Never substitute a milder evaluative word for a stronger one. Replacing "exceptional" with "strong" launders the claim: the milder word reads as considered judgement, the claim is no better supported, and it is then harder to challenge. This is the same test already applied to unsupported figures: never approximate an author's unbacked number into a vaguer one.

Apply one test. After the evaluative word is removed, does the remaining clause still tell a reader something?

If yes, delete the evaluative word and any intensifier attached only to it. Leave the rest. The figures or the substantive word were always doing the work. If deleting the word leaves stranded scaffolding ("that is", "which is", a hanging colon), include that scaffolding in the deletion. Do not fill the hole with a quieter adjective.
  "a track record that is genuinely exceptional: 2.4x gross MOIC and 21% gross IRR across seventeen exits" -> "a track record of 2.4x gross MOIC and 21% gross IRR across seventeen exits"
  "origination that is genuinely proprietary" -> "origination that is proprietary"

A DELETE direction must name both the removed text and the resulting phrase, in that order, so the revision can apply it literally with no inference:
  Delete 'genuinely exceptional'. The phrase becomes 'a track record of 2.4x gross MOIC and 21% gross IRR across seventeen exits'.
  Delete 'genuinely'. The phrase becomes 'origination is proprietary'.
The resulting phrase is the repaired local span, not the entire sentence. Substituting it for the span that contained the deleted words must leave grammatical prose. If the remainder cannot be repaired by stating a resulting phrase, do not invent a repair. Write: Delete 'X' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.

Deleting only an intensifier in front of a standard qualitative descriptor is substituting a milder evaluation. "exceptionally strong" must not become "strong". "genuinely exceptional" must not become "exceptional". Keep the whole phrase and flag it.

Deleting an intensifier in front of a substantive, non-evaluative word is not substitution. "proprietary" still tells the reader what the origination is. Delete "genuinely" and keep "proprietary".

If no, the evaluation is the whole point of the clause. Keep the wording and flag it. Do not weaken it and do not silently cut the author's point. A KEEP direction does not state a resulting phrase.
  "which in this market is a genuine differentiator" stays. Flag it.
  "The franchise is exceptionally strong." stays. Flag it. Do not rewrite it as "The franchise is strong."

Do not flag standard qualitative descriptors such as "strong", "high-quality", "leading" (when applied to widely-accepted market positions), "well-positioned", "robust", "defensible", "compelling", "solid" when those words are the author's original wording. They are the working vocabulary of investment writing. Do not suggest them as replacements for hyperbole.`;

export const EVALUATIVE_LANGUAGE_FIX_DIRECTION =
  "Apply the remaining-clause test. If the clause still informs after the evaluative word is removed, begin with Delete, quote the removed text, then state the resulting phrase: \"Delete 'genuinely exceptional'. The phrase becomes 'a track record of 2.4x gross MOIC and 21% gross IRR across seventeen exits'.\" The resulting phrase must be the repaired local span; substituting it literally must leave grammatical prose. If you cannot repair the remainder by stating a resulting phrase, write: \"Delete 'X' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.\" Do not emit a confident repair you are not sure of. If the evaluation is the whole point of the clause, begin with Keep and quote the phrase. Example: \"Keep 'genuine differentiator' and flag it. Removing the evaluation would empty the clause.\" Do not state a resulting phrase on Keep. Never begin with Replace. Never offer a milder synonym. Wrong: Delete 'exceptionally strong' and rewrite as 'The franchise is strong.' That is a milder substitution. Right: Keep 'exceptionally strong' and flag it.";

/**
 * @typedef {{ kind: "delete_becomes", removed: string, result: string } | { kind: "rewrite_needed", removed: string, result: null } | { kind: "delete_incomplete", removed: string, result: null }} ParsedEvaluativeDeletion
 */

/**
 * @param {string|null|undefined} direction
 * @returns {ParsedEvaluativeDeletion|null}
 */
export function parseEvaluativeDeletionDirection(direction) {
  const t = String(direction || "").trim();
  const actionable =
    t.match(
      /^Delete\s+'([\s\S]+?)'\s+and rewrite the sentence so that it reads naturally without it\./i
    ) ||
    t.match(
      /^Delete\s+"([\s\S]+?)"\s+and rewrite the sentence so that it reads naturally without it\./i
    );
  if (actionable) {
    return { kind: "rewrite_needed", removed: actionable[1], result: null };
  }
  const del = t.match(/^Delete\s+'([\s\S]+?)'\s*\./i) || t.match(/^Delete\s+"([\s\S]+?)"\s*\./i);
  if (!del) return null;
  const removed = del[1];
  if (/cannot be repaired without rewriting/i.test(t)) {
    return { kind: "rewrite_needed", removed, result: null };
  }
  const becomes =
    t.match(/The phrase becomes\s+'([\s\S]+)'\s*\.?\s*$/i) ||
    t.match(/The phrase becomes\s+"([\s\S]+)"\s*\.?\s*$/i);
  if (!becomes || !becomes[1].trim()) {
    return { kind: "delete_incomplete", removed, result: null };
  }
  return { kind: "delete_becomes", removed, result: becomes[1].trim() };
}

/**
 * Substitute the stated resulting phrase for the span that contained the
 * deleted words. No inference beyond that splice.
 * @param {string} statement
 * @param {string} direction
 * @returns {{ ok: boolean, applied: string, reason: string }}
 */
export function applyEvaluativeDeletionDirection(statement, direction) {
  const src = String(statement || "");
  const parsed = parseEvaluativeDeletionDirection(direction);
  if (!parsed) {
    return { ok: false, applied: src, reason: "not a Delete direction" };
  }
  if (parsed.kind === "rewrite_needed") {
    return {
      ok: true,
      applied: src,
      reason: "remainder cannot be repaired without rewriting; left unchanged",
    };
  }
  if (parsed.kind === "delete_incomplete") {
    return { ok: false, applied: src, reason: "Delete without a resulting phrase" };
  }
  const spliced = spliceResultPhrase(src, parsed.removed, parsed.result);
  if (spliced == null) {
    return { ok: false, applied: src, reason: "could not locate the removed text" };
  }
  return { ok: true, applied: spliced, reason: "applied resulting phrase" };
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasStrandedEvaluativeScaffolding(text) {
  const t = String(text || "");
  if (/\b(?:that|which)\s+is\s*[:.]/i.test(t)) return true;
  if (/\b(?:that|which)\s+is\s+[A-Z]/.test(t)) return true;
  if (/\bis\s*:/i.test(t)) return true;
  if (/\bof\s+across\b/i.test(t)) return true;
  if (/\bis\s+\./.test(t)) return true;
  if (/\bis The\b/.test(t)) return true;
  return false;
}

/**
 * @param {string} src
 * @param {string} removed
 * @param {string} result
 * @returns {string|null}
 */
function spliceResultPhrase(src, removed, result) {
  const srcTrim = String(src || "").trim();
  const resultTrim = String(result || "").trim();
  const srcLower = srcTrim.toLowerCase();
  const remLower = removed.toLowerCase();
  const dIdx = srcLower.indexOf(remLower);
  if (dIdx < 0) return null;
  const dEnd = dIdx + removed.length;
  const resWords = resultTrim.split(/\s+/).filter(Boolean);
  if (resWords.length === 0) return null;

  const firstSrc = srcTrim.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
  const firstRes = resWords.slice(0, 2).join(" ").toLowerCase();
  const terminal = /[.!?]$/.exec(srcTrim)?.[0] || "";
  if (firstSrc && firstSrc === firstRes && resultTrim.length >= 20) {
    return /[.!?]$/.test(resultTrim) ? resultTrim : `${resultTrim}${terminal}`;
  }

  let start = dIdx;
  for (let n = resWords.length; n >= 1; n -= 1) {
    const prefix = resWords.slice(0, n).join(" ").toLowerCase();
    const pIdx = srcLower.lastIndexOf(prefix, dIdx);
    if (pIdx < 0 || pIdx + prefix.length > dIdx) continue;
    const between = srcTrim.slice(pIdx + prefix.length, dIdx);
    if (isScaffoldBetween(between)) {
      start = pIdx;
      break;
    }
  }

  let end = dEnd;
  while (end < srcTrim.length && /[:;,\s]/.test(srcTrim[end])) end += 1;
  for (let n = resWords.length; n >= 1; n -= 1) {
    const suffix = resWords.slice(-n).join(" ").toLowerCase();
    const sIdx = srcLower.indexOf(suffix, dEnd);
    if (sIdx >= 0) {
      end = Math.max(end, sIdx + suffix.length);
      break;
    }
  }

  const out = `${srcTrim.slice(0, start)}${resultTrim}${srcTrim.slice(end)}`;
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
}

/**
 * @param {string} between
 * @returns {boolean}
 */
function isScaffoldBetween(between) {
  const t = String(between || "").trim();
  if (!t) return true;
  return /^(?:that is|which is|[:,;.-])$/i.test(t);
}

export const EVALUATIVE_DELETION_RULE_IDS = new Set([
  "marketing_language_excess",
  "hyperbole_vs_qualitative",
]);

/**
 * After stripping orphan punctuation next to the removed span and collapsing
 * whitespace, only a leftover comma or colon should remain. Stage 1 already
 * treats Levenshtein distance 2 as locate noise. A dropped word or a rewritten
 * clause is many times larger than 2.
 */
export const RESTATEMENT_EDIT_DISTANCE_BUDGET = 2;

export const EVALUATIVE_DELETION_REWRITE_NEEDED_TAIL =
  "and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.";

let evaluativeRestatementDiscardCount = 0;

/**
 * @param {string} removed
 * @returns {string}
 */
export function evaluativeDeletionRefusalDirection(removed) {
  return `Delete '${removed}' ${EVALUATIVE_DELETION_REWRITE_NEEDED_TAIL}`;
}

function recordRestatementDiscard(removed) {
  evaluativeRestatementDiscardCount += 1;
  console.log(
    `[evaluative_deletion] restatement discarded count=${evaluativeRestatementDiscardCount} ` +
      `removed=${JSON.stringify(removed)}`
  );
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} text
 * @returns {Array<{ match: string, removed: string, result: string }>}
 */
function findDeleteBecomesBlocks(text) {
  const t = String(text || "");
  const blocks = [];
  const startRe = /Delete\s+(['"])([\s\S]+?)\1\s*\.\s*The phrase becomes\s+(['"])/gi;
  let m;
  while ((m = startRe.exec(t)) !== null) {
    const quote = m[3];
    const resultStart = m.index + m[0].length;
    const rest = t.slice(resultStart);
    const close = rest.lastIndexOf(quote);
    if (close < 0) continue;
    const result = rest.slice(0, close);
    const matchEnd = resultStart + close + 1;
    blocks.push({ match: t.slice(m.index, matchEnd), removed: m[2], result });
  }
  return blocks;
}

/**
 * @param {string} text
 * @param {string} removed
 * @param {string} result
 * @param {string} refusal
 * @returns {string}
 */
function replaceDiscardedRestatementInText(text, removed, result, refusal) {
  if (typeof text !== "string" || !text) return text;
  let out = text;
  if (removed && result) {
    const patterns = [
      new RegExp(
        `Delete\\s+'${escapeRegExp(removed)}'\\s*\\.\\s*The phrase becomes\\s+'${escapeRegExp(result)}'\\.?(?:\\.{0,3})?`,
        "gi"
      ),
      new RegExp(
        `Delete\\s+"${escapeRegExp(removed)}"\\s*\\.\\s*The phrase becomes\\s+"${escapeRegExp(result)}"\\.?(?:\\.{0,3})?`,
        "gi"
      ),
    ];
    for (const p of patterns) out = out.replace(p, refusal);
  }
  if (result && out.includes(result)) {
    out = out.split(result).join("");
    out = out.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").replace(/''/g, "").replace(/""/g, "").trim();
  }
  return out;
}

/**
 * @returns {number}
 */
export function getEvaluativeRestatementDiscardCount() {
  return evaluativeRestatementDiscardCount;
}

function collapseWs(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

/**
 * Statement minus the deleted span, with whitespace collapsed and orphaned
 * punctuation adjacent to the hole (colon, comma, semicolon) stripped.
 * @param {string} statement
 * @param {string} removed
 * @returns {string|null}
 */
export function clauseMinusDeletedSpan(statement, removed) {
  const src = String(statement || "");
  const rem = String(removed || "");
  if (!src.trim() || !rem.trim()) return null;
  const idx = src.toLowerCase().indexOf(rem.toLowerCase());
  if (idx < 0) return null;
  const before = src.slice(0, idx).replace(/[\s:;,]+$/g, "");
  const after = src.slice(idx + rem.length).replace(/^[\s:;,]+/g, "");
  const joined = before && after ? `${before} ${after}` : `${before}${after}`;
  return collapseWs(joined);
}

function isNearSubstring(needle, haystack, budget) {
  const n = needle.length;
  const h = haystack.length;
  if (n === 0) return h <= budget;
  if (n > h + budget) return false;
  if (haystack.includes(needle)) return true;
  const minLen = Math.max(1, n - budget);
  const maxLen = Math.min(h, n + budget);
  for (let len = minLen; len <= maxLen; len++) {
    for (let i = 0; i + len <= h; i++) {
      if (levenshteinDistance(needle, haystack.slice(i, i + len)) <= budget) return true;
    }
  }
  return false;
}

/**
 * True when the model's restatement is the clause minus the deleted words,
 * allowing only the punctuation-repair budget.
 * @param {string} statement
 * @param {string} removed
 * @param {string} result
 * @returns {boolean}
 */
export function restatementMatchesClauseMinusSpan(statement, removed, result) {
  const remainder = clauseMinusDeletedSpan(statement, removed);
  if (remainder == null) return false;
  const rest = collapseWs(result);
  if (!rest) return false;
  if (rest.length > remainder.length + RESTATEMENT_EDIT_DISTANCE_BUDGET) return false;
  if (levenshteinDistance(rest, remainder) <= RESTATEMENT_EDIT_DISTANCE_BUDGET) return true;
  return isNearSubstring(rest, remainder, RESTATEMENT_EDIT_DISTANCE_BUDGET);
}

/**
 * After the model writes a Delete restatement, discard it if it re-authors
 * the sentence. Keep and incomplete Delete directions are left alone.
 * @param {string} statement
 * @param {string|null|undefined} direction
 * @returns {string}
 */
export function boundEvaluativeDeletionDirection(statement, direction) {
  const original = typeof direction === "string" ? direction.trim() : "";
  if (!original) return original;
  const parsed = parseEvaluativeDeletionDirection(original);
  if (!parsed) return original;
  if (parsed.kind === "rewrite_needed") {
    return evaluativeDeletionRefusalDirection(parsed.removed);
  }
  if (parsed.kind !== "delete_becomes") return original;
  if (restatementMatchesClauseMinusSpan(statement, parsed.removed, parsed.result)) {
    return original;
  }
  recordRestatementDiscard(parsed.removed);
  return evaluativeDeletionRefusalDirection(parsed.removed);
}

/**
 * @param {string} statement
 * @param {string} note
 * @returns {{ text: string, discarded: boolean, removed: string|null, result: string|null }}
 */
function boundNoteRestatements(statement, note) {
  const original = String(note || "");
  let text = original;
  let discarded = false;
  let removed = null;
  let result = null;
  for (const block of findDeleteBecomesBlocks(original)) {
    if (restatementMatchesClauseMinusSpan(statement, block.removed, block.result)) continue;
    discarded = true;
    removed = block.removed;
    result = block.result;
    text = text.replace(block.match, evaluativeDeletionRefusalDirection(block.removed));
  }
  return { text, discarded, removed, result };
}

/**
 * Attach-time bound: run after the model returns, before the concern is stored.
 * Applies to suggestedDirection and to note, so a discarded restatement cannot
 * leak into the field the UI reads or into the revision prompt.
 * @param {object[]} concerns
 * @param {string} statementText
 * @returns {object[]}
 */
export function applyEvaluativeDeletionBounds(concerns, statementText) {
  if (!Array.isArray(concerns)) return concerns;
  const statement = typeof statementText === "string" ? statementText : "";
  return concerns.map((concern) => {
    const code =
      typeof concern?.concernCode === "string"
        ? concern.concernCode.trim()
        : typeof concern?.rule === "string"
          ? concern.rule.trim()
          : "";
    if (!EVALUATIVE_DELETION_RULE_IDS.has(code)) return concern;
    const direction =
      typeof concern?.suggestedDirection === "string" ? concern.suggestedDirection : "";
    const parsedDir = parseEvaluativeDeletionDirection(direction);
    const boundedDir = boundEvaluativeDeletionDirection(statement, direction);
    const directionDiscardedRestatement =
      parsedDir?.kind === "delete_becomes" && boundedDir !== direction;

    const note = typeof concern?.note === "string" ? concern.note : "";
    const noteBound = boundNoteRestatements(statement, note);
    const noteDiscarded = noteBound.discarded && noteBound.text !== note;

    if (boundedDir === direction && !noteDiscarded) return concern;

    const next = { ...concern, suggestedDirection: boundedDir };
    if (typeof concern?.note === "string") next.note = noteBound.text;

    const removed = directionDiscardedRestatement ? parsedDir.removed : noteBound.removed;
    const result = directionDiscardedRestatement ? parsedDir.result : noteBound.result;
    if (removed && result) {
      const refusal = evaluativeDeletionRefusalDirection(removed);
      for (const key of Object.keys(next)) {
        if (typeof next[key] !== "string") continue;
        if (key === "suggestedDirection") continue;
        next[key] = replaceDiscardedRestatementInText(next[key], removed, result, refusal);
      }
    }

    if ("suggestedRewrite" in next && boundedDir !== direction) delete next.suggestedRewrite;

    if (noteDiscarded && !directionDiscardedRestatement) {
      recordRestatementDiscard(noteBound.removed);
    }
    return next;
  });
}

/**
 * Locate unverifiable evaluative assertions in residual text.
 *
 * The rest of this module is a prompt contract and a Delete-direction parser.
 * Residual-anchor use needs character offsets, so this locator was added here
 * rather than inventing a second detector. Phrase class follows
 * marketing_language_excess (exceptionality / distinction claims) plus the
 * two known false-green exhibits. Working vocabulary from the instruction
 * ("strong", "high-quality", "leading", "well-positioned", "robust",
 * "defensible", "compelling", "solid") is not matched.
 *
 * @param {string} text
 * @returns {Array<{ start: number, end: number, kind: "evaluative", text: string }>}
 */
export function extractEvaluativeAssertionSpans(text) {
  const t = typeof text === "string" ? text : "";
  if (!t) return [];
  const found = [];
  for (const spec of EVALUATIVE_ASSERTION_PATTERNS) {
    const re = new RegExp(spec.source, spec.flags.includes("g") ? spec.flags : `${spec.flags}g`);
    let m = re.exec(t);
    while (m) {
      const start = m.index;
      const end = start + m[0].length;
      if (end > start) {
        found.push({ start, end, kind: "evaluative", text: m[0] });
      }
      m = re.exec(t);
    }
  }
  found.sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenB !== lenA) return lenB - lenA;
    return a.start - b.start;
  });
  const kept = [];
  for (const span of found) {
    if (kept.some((k) => k.start < span.end && span.start < k.end)) continue;
    kept.push(span);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

/** Longer phrases first so overlap collapse keeps the full assertion. */
const EVALUATIVE_ASSERTION_PATTERNS = [
  /\bwithout\s+recourse\s+to\s+aggressive\s+leverage\b/gi,
  /\baggressive\s+leverage\b/gi,
  /\bwidely\s+regarded\b/gi,
  /\bamong\s+the\s+most\s+disciplined\b/gi,
  /\bmost\s+disciplined\b/gi,
  /\bgenuine\s+differentiator\b/gi,
  /\bworld-class\b/gi,
  /\bindustry-leading\b/gi,
  /\bmarket-leading\b/gi,
  /\bbest-in-class\b/gi,
  /\bgame-changing\b/gi,
  /\bamong\s+the\s+most\b/gi,
  /\bunparalleled\b/gi,
  /\bextraordinary\b/gi,
  /\bunmatched\b/gi,
  /\bexceptionally\b/gi,
  /\bexceptional\b/gi,
  /\brevolutionary\b/gi,
  /\btransformative\b/gi,
  /\bgenuinely\s+[A-Za-z][A-Za-z-]*\b/gi,
];
