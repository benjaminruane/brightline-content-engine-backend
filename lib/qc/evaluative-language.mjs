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
The resulting phrase is the repaired local span, not the entire sentence. Substituting it for the span that contained the deleted words must leave grammatical prose. If the remainder cannot be repaired without rewriting the sentence, do not invent a repair. Write: Delete 'X'. The remainder cannot be repaired without rewriting the sentence.

Deleting only an intensifier in front of a standard qualitative descriptor is substituting a milder evaluation. "exceptionally strong" must not become "strong". "genuinely exceptional" must not become "exceptional". Keep the whole phrase and flag it.

Deleting an intensifier in front of a substantive, non-evaluative word is not substitution. "proprietary" still tells the reader what the origination is. Delete "genuinely" and keep "proprietary".

If no, the evaluation is the whole point of the clause. Keep the wording and flag it. Do not weaken it and do not silently cut the author's point. A KEEP direction does not state a resulting phrase.
  "which in this market is a genuine differentiator" stays. Flag it.
  "The franchise is exceptionally strong." stays. Flag it. Do not rewrite it as "The franchise is strong."

Do not flag standard qualitative descriptors such as "strong", "high-quality", "leading" (when applied to widely-accepted market positions), "well-positioned", "robust", "defensible", "compelling", "solid" when those words are the author's original wording. They are the working vocabulary of investment writing. Do not suggest them as replacements for hyperbole.`;

export const EVALUATIVE_LANGUAGE_FIX_DIRECTION =
  "Apply the remaining-clause test. If the clause still informs after the evaluative word is removed, begin with Delete, quote the removed text, then state the resulting phrase: \"Delete 'genuinely exceptional'. The phrase becomes 'a track record of 2.4x gross MOIC and 21% gross IRR across seventeen exits'.\" The resulting phrase must be the repaired local span; substituting it literally must leave grammatical prose. If you cannot repair the remainder without rewriting the sentence, write: \"Delete 'X'. The remainder cannot be repaired without rewriting the sentence.\" Do not emit a confident repair you are not sure of. If the evaluation is the whole point of the clause, begin with Keep and quote the phrase. Example: \"Keep 'genuine differentiator' and flag it. Removing the evaluation would empty the clause.\" Do not state a resulting phrase on Keep. Never begin with Replace. Never offer a milder synonym. Wrong: Delete 'exceptionally strong' and rewrite as 'The franchise is strong.' That is a milder substitution. Right: Keep 'exceptionally strong' and flag it.";

/**
 * @typedef {{ kind: "delete_becomes", removed: string, result: string } | { kind: "rewrite_needed", removed: string, result: null } | { kind: "delete_incomplete", removed: string, result: null }} ParsedEvaluativeDeletion
 */

/**
 * @param {string|null|undefined} direction
 * @returns {ParsedEvaluativeDeletion|null}
 */
export function parseEvaluativeDeletionDirection(direction) {
  const t = String(direction || "").trim();
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
