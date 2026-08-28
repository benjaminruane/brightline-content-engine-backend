/**
 * Stage 1: per-statement revision with code-enforced span constraints.
 *
 * Behind opts.perStatementRevise. The whole-draft path is untouched.
 *
 * WHY CODE ENFORCES THE SPAN. 1560579 arm C carried the rule telling it to keep
 * confirmed material and dropped "control-oriented" anyway. Instruction does not
 * protect fidelity, so the validator does: no edit is applied until it has been
 * checked against the original.
 *
 * THE INVERTED RULE. ddf6ee8 showed the confirmed-span-verbatim rule is
 * unimplementable — no card carries a statement-frame confirmed span. So we
 * invert it: where the statement names an UNSUPPORTED span, everything OUTSIDE
 * that span must come back unchanged. That is the same protection, expressed in
 * spans that actually exist.
 *
 * A rejection is data, not an error. We do not retry.
 */

import { buildStage1Prompt } from "./revise-stage1-prompt.mjs";
import { concernKind, CONCERN_KIND_REASONS } from "./pr9-note-what-from-diff.mjs";

export const REJECT_NO_JSON = "json_unparseable_or_incomplete";
export const REJECT_NOOP_EDIT = "edit_identical_to_original";
export const REJECT_OUTSIDE_SPAN = "changed_text_outside_unsupported_span";
export const REJECT_INVENTED_FACT = "introduced_fact_absent_from_statement_and_source";

/** Default concurrency. Statements are independent; see stage1-measure.md Part 0c. */
export const DEFAULT_CONCURRENCY = 4;

const collapse = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * Statement-frame span location.
 *
 * unsupportedSpans carry TEXT ONLY — every span in the corpus has
 * start/end undefined — so offsets are never trusted. The text is located in
 * the statement instead, which sidesteps the coordinate-frame problem in
 * ddf6ee8 entirely.
 *
 * @returns {?{ start: number, end: number }}
 */
export function locateSpan(statementText, spanText) {
  const hay = String(statementText ?? "");
  const needle = String(spanText ?? "");
  if (!needle) return null;
  const at = hay.indexOf(needle);
  if (at >= 0) return { start: at, end: at + needle.length };
  // Whitespace in the span may not match the statement's exactly.
  const loose = hay.replace(/\s+/g, " ").indexOf(collapse(needle));
  if (loose < 0) return null;
  return { start: loose, end: loose + collapse(needle).length };
}

/**
 * THE INVERTED SPAN RULE. Everything outside the unsupported span must survive.
 * Comparison is whitespace-normalised, so a spacing change passes and a word
 * change does not.
 *
 * @returns {{ ok: boolean, detail?: string }}
 */
export function checkOutsideSpanUnchanged(original, revised, spans) {
  const list = Array.isArray(spans) ? spans.filter((s) => s?.text) : [];
  if (list.length === 0) return { ok: true }; // no-span fallback: whole statement is the target

  const located = list.map((s) => locateSpan(original, s.text)).filter(Boolean);
  if (located.length === 0) return { ok: true }; // span text not findable; cannot constrain

  located.sort((a, b) => a.start - b.start);
  const prefix = wordKeys(original.slice(0, located[0].start));
  const suffix = wordKeys(original.slice(located[located.length - 1].end));
  const got = wordKeys(revised);

  // Compared as word sequences, not raw strings. Cutting a trailing clause
  // necessarily rewrites the punctuation joining it ("investments," becomes
  // "investments."), and rejecting that would reject every legitimate cut. A
  // changed WORD still fails, which is the protection we actually want.
  if (!startsWithSeq(got, prefix)) {
    return { ok: false, detail: `words before the span changed: ${JSON.stringify(prefix.join(" "))}` };
  }
  if (!endsWithSeq(got, suffix)) {
    return { ok: false, detail: `words after the span changed: ${JSON.stringify(suffix.join(" "))}` };
  }
  return { ok: true };
}

/** Words reduced to their letters and digits, for punctuation-tolerant compare. */
function wordKeys(text) {
  return String(text ?? "")
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase())
    .filter(Boolean);
}

const startsWithSeq = (got, want) => want.every((w, i) => got[i] === w);
const endsWithSeq = (got, want) =>
  want.every((w, i) => got[got.length - want.length + i] === w);

const FIGURE_RE = /\b\d[\d,'’.]*\s*(?:%|per cent|percent|million|billion|bn|m|x)?\b/gi;
const PROPER_NOUN_RE = /\b(?:[A-Z][a-z]{2,})(?:\s+[A-Z][a-z]{2,})*\b/g;

/**
 * Reject a revision that introduces a figure, date or proper noun found in
 * neither the original statement nor the supplied source text.
 */
export function checkNoInventedFacts(original, revised, sourceText) {
  const haystack = collapse(`${original} ${sourceText || ""}`).toLowerCase();
  const seen = new Set();

  for (const m of collapse(revised).matchAll(FIGURE_RE)) {
    const tok = collapse(m[0]).toLowerCase();
    if (!tok || /^\d{1,2}$/.test(tok)) continue; // small bare integers are noise
    if (!haystack.includes(tok)) seen.add(tok);
  }
  for (const m of collapse(revised).matchAll(PROPER_NOUN_RE)) {
    const tok = collapse(m[0]);
    if (!tok) continue;
    if (!haystack.includes(tok.toLowerCase())) seen.add(tok);
  }

  if (seen.size === 0) return { ok: true };
  return { ok: false, detail: `not in statement or source: ${[...seen].join(", ")}` };
}

/**
 * Validate one stage 1 response against its statement.
 *
 * @param {string} rawText              the model's raw reply
 * @param {object} concern
 * @param {{ sourceText?: string }} [opts]
 * @returns {{ accepted: boolean, action?: string, revised?: string, what?: string, why?: string, reason?: string, detail?: string }}
 */
export function validateStage1Response(rawText, concern, opts = {}) {
  const original = String(concern?.statementText ?? "");

  let parsed;
  try {
    const cleaned = String(rawText ?? "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { accepted: false, reason: REJECT_NO_JSON, detail: "response did not parse as JSON" };
  }

  const action = parsed?.action;
  if (action !== "edit" && action !== "no_change") {
    return { accepted: false, reason: REJECT_NO_JSON, detail: `action was ${JSON.stringify(action)}` };
  }
  if (typeof parsed?.what !== "string" || typeof parsed?.why !== "string") {
    return { accepted: false, reason: REJECT_NO_JSON, detail: "what/why missing or not strings" };
  }

  if (action === "no_change") {
    return { accepted: true, action, revised: null, what: parsed.what, why: parsed.why };
  }

  const revised = parsed?.revised_statement;
  if (typeof revised !== "string" || !revised.trim()) {
    return { accepted: false, reason: REJECT_NO_JSON, detail: "revised_statement missing on an edit" };
  }
  if (collapse(revised) === collapse(original)) {
    return { accepted: false, reason: REJECT_NOOP_EDIT, detail: "edit returned the original text" };
  }

  const spanCheck = checkOutsideSpanUnchanged(
    original,
    revised,
    concern?.evidence?.unsupportedSpans
  );
  if (!spanCheck.ok) {
    return { accepted: false, reason: REJECT_OUTSIDE_SPAN, detail: spanCheck.detail };
  }

  const factCheck = checkNoInventedFacts(original, revised, opts.sourceText);
  if (!factCheck.ok) {
    return { accepted: false, reason: REJECT_INVENTED_FACT, detail: factCheck.detail };
  }

  return { accepted: true, action, revised, what: parsed.what, why: parsed.why };
}

/** The paragraph containing the statement, as read-only context. */
export function paragraphFor(draft, statementText) {
  const at = draft.indexOf(statementText);
  if (at < 0) return "";
  const start = draft.lastIndexOf("\n\n", at);
  const end = draft.indexOf("\n\n", at);
  return draft.slice(start < 0 ? 0 : start + 2, end < 0 ? draft.length : end).trim();
}

async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Run stage 1 over every flagged statement of a draft.
 *
 * Statements with no concerns are never sent and never touched. Calls run in
 * parallel; nothing in the call path holds shared mutable state keyed by
 * anything other than traceId.
 *
 * @param {string} draft
 * @param {Array<object>} concerns
 * @param {{
 *   callModel: (prompt: string, meta: object) => Promise<{ text: string, usage?: object }>,
 *   sourceText?: string,
 *   concurrency?: number,
 *   log?: Function,
 * }} opts
 * @returns {Promise<{ revisedDraft: string, edits: Array<object>, events: Array<object>, usage: Array<object> }>}
 */
export async function runStage1(draft, concerns, opts) {
  const list = (Array.isArray(concerns) ? concerns : []).filter(
    (c) => typeof c?.statementText === "string" && c.statementText.trim()
  );
  const limit = Number.isInteger(opts?.concurrency) ? opts.concurrency : DEFAULT_CONCURRENCY;

  const results = await mapWithLimit(list, limit, async (concern, i) => {
    const kind = concernKind(concern) || "unsupported";
    const prompt = buildStage1Prompt(concern, kind, {
      paragraph: paragraphFor(draft, concern.statementText),
    });
    const res = await opts.callModel(prompt, { index: i, kind, concern });
    const verdict = validateStage1Response(res?.text, concern, { sourceText: opts.sourceText });
    return { concern, kind, prompt, verdict, usage: res?.usage ?? null };
  });

  let revisedDraft = draft;
  const edits = [];
  const events = [];

  for (const r of results) {
    const { concern, kind, verdict } = r;
    if (!verdict.accepted) {
      events.push({
        outcome: "rejected",
        reason: verdict.reason,
        detail: verdict.detail,
        kind,
        statementText: concern.statementText,
      });
      continue;
    }
    if (verdict.action === "no_change") {
      events.push({
        outcome: "no_change",
        kind,
        why: verdict.why,
        statementText: concern.statementText,
      });
      continue;
    }

    const at = revisedDraft.indexOf(concern.statementText);
    if (at < 0) {
      events.push({
        outcome: "rejected",
        reason: "statement_not_found_in_draft",
        kind,
        statementText: concern.statementText,
      });
      continue;
    }

    // Emit the substitution already wrapped in a marker, in the same syntax the
    // whole-draft model emits. finalizeSuggestRevisionText then owns note
    // normalisation, what-from-diff, deterministic removal and the honesty
    // check unchanged — and the fc25060 unreported-change detector finds
    // nothing, because every change code made is already declared.
    const reason = usableReason(verdict.why) || CONCERN_KIND_REASONS[kind] || "";
    const marked = wrapAsMarker(verdict.revised, verdict.what, reason);

    revisedDraft =
      revisedDraft.slice(0, at) + marked + revisedDraft.slice(at + concern.statementText.length);

    edits.push({
      kind,
      original: concern.statementText,
      revised: verdict.revised,
      what: verdict.what,
      why: verdict.why,
      reason,
    });
    events.push({ outcome: "edited", kind, what: verdict.what, statementText: concern.statementText });
  }

  return { revisedDraft, edits, events, usage: results.map((r) => r.usage).filter(Boolean) };
}

/**
 * Wrap a revised statement in the marker syntax the finalise chain parses.
 * Terminal punctuation stays outside the delimiter, as the prompt requires.
 */
export function wrapAsMarker(revised, what, reason) {
  // Delimiter characters inside the payload would corrupt the parse.
  const safe = String(revised).replace(/\{\{|\}\}|\|\|/g, " ");
  const m = safe.match(/^([\s\S]*?)([.!?]+)(\s*)$/);
  const body = m ? m[1] : safe;
  const tail = m ? m[2] + m[3] : "";
  const note = [collapse(what), collapse(reason)].filter(Boolean).join(" - ");
  return `{{${body}||CHANGED: ${note}}}${tail}`;
}

/**
 * The model's "why" as a marker reason, when it is usable. Falls back to the
 * concern-class reason otherwise, the same fallback the whole-draft path uses.
 */
export function usableReason(why) {
  const text = collapse(why);
  if (!text) return "";
  if (text.length > 160) return "";
  if (/\{\{|\|\||confirm before publishing|marker|underline|highlight/i.test(text)) return "";
  return text.replace(/[.\s]+$/, "");
}
