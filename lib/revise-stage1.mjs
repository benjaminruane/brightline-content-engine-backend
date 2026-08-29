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
import {
  authorStatementExemption,
  findingRestsOnSilence,
  tightestUnsupportedSpans,
  AUTHOR_STATEMENT_KEPT_NOTE,
  OUTCOME_AUTHOR_EXEMPT,
} from "./revise-author-statement.mjs";
import { flagRegister } from "./revise-flag-register.mjs";

/**
 * A statement whose findings all rest on silence was never sent to the model.
 * It is not a refusal — nothing was asked — and not an author exemption, which
 * turns on who is speaking rather than on what the sources say. Counted apart
 * from both so the measurement can tell the three cases from each other.
 */
export const OUTCOME_SILENCE_NOT_SENT = "silence_flagged_not_sent";

export { OUTCOME_AUTHOR_EXEMPT };

export const REJECT_NO_JSON = "json_unparseable_or_incomplete";
export const REJECT_NOOP_EDIT = "edit_identical_to_original";
export const REJECT_OUTSIDE_SPAN = "changed_text_outside_unsupported_span";
export const REJECT_INVENTED_FACT = "introduced_fact_absent_from_statement_and_source";
export const REJECT_NO_SPAN_ENTITY_LOSS = "no_span_edit_removed_an_entity_the_finding_does_not_name";

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

  const located = list
    .map((s) => locateSpan(original, s.text))
    .filter(Boolean)
    .map((s) => widenOverJoiner(original, s));
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

const JOINER_RE = /(?:,\s*)?\b(?:with|and|including|of|comprising|plus|alongside)\s*$/i;

/**
 * A claim-level element starts at the claim, not at the connector that attaches
 * it: the span is "equity checks of EUR 80-100 million apiece" but the
 * statement reads "...investments, with equity checks of...". Cutting the claim
 * necessarily takes the dangling "with" too, so the connector counts as part of
 * the span rather than as protected material.
 */
function widenOverJoiner(original, span) {
  const before = original.slice(0, span.start);
  const m = JOINER_RE.exec(before);
  if (!m) return span;
  return { start: span.start - m[0].length, end: span.end };
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
export function checkNoInventedFacts(original, revised, sourceText, authoringOrganisation) {
  // The author's own name is not an invented fact. The statement under revision
  // is one sentence, so naming the actor explicitly where the original said
  // "this relationship" is exactly the disambiguation the house style asks for
  // — and it was being rejected as an invention because the check never sees
  // the rest of the draft. Same carve-out as the third-party test in
  // revise-flag-register.mjs: the author is not an outside party.
  const author = collapse(authoringOrganisation ?? "");
  const haystack = collapse(`${original} ${sourceText || ""} ${author}`).toLowerCase();
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

const DATE_RE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4]|(?:19|20)\d{2})\b/g;
const ENTITY_RE = /\b[A-Z][a-zA-Z0-9&'’-]*(?:\s+(?:[A-Z][a-zA-Z0-9&'’-]*|[IVXLC]+))*\b/g;

/**
 * PART 3b, THE NO-SPAN GUARD.
 *
 * With no span the whole statement is the target, so the inverted span rule
 * cannot constrain anything and the model is free to rewrite at will. Measured
 * consequence: "In June 2026, Partners Group committed to Meridian Capital
 * Partners V..." came back as "Meridian Capital Partners V is a EUR 1.2 billion
 * flagship fund...", losing who committed and when.
 *
 * An unsupported figure is the finding; the date and the actor are not. So on
 * this path an edit may not drop a named entity or date unless the finding
 * itself named it.
 */
/**
 * A sentence-initial preposition or article capitalises like a name: "In June
 * 2026" matches as one entity. Strip the function word so the test is about
 * "June", which the finding can actually name.
 */
const LEADING_FUNCTION_WORD_RE =
  /^(?:In|On|At|By|For|The|A|An|This|These|Those|During|Following|After|Before|Since|Our|We|Its|It|As|From|To|With|Under|Over)\s+(?=[A-Z0-9])/;

function trimLeadingFunctionWord(token) {
  return token.replace(LEADING_FUNCTION_WORD_RE, "");
}

export function checkNoSpanEntitiesKept(original, revised, concern) {
  const findingText = collapse(
    [
      concern?.evidence?.reason,
      concern?.evidence?.excerpt,
      concern?.evidence?.sourcePassage,
      ...(concern?.claims || []).map((c) => c?.text),
    ]
      .filter(Boolean)
      .join(" ")
  ).toLowerCase();

  const kept = collapse(revised).toLowerCase();
  const lost = new Set();

  for (const re of [DATE_RE, ENTITY_RE]) {
    for (const m of collapse(original).matchAll(re)) {
      const tok = trimLeadingFunctionWord(collapse(m[0]));
      if (!tok || tok.length < 3) continue;
      const low = tok.toLowerCase();
      if (kept.includes(low)) continue;
      if (findingText.includes(low)) continue; // the finding named it, so losing it is the point
      lost.add(tok);
    }
  }

  if (lost.size === 0) return { ok: true };
  return { ok: false, detail: `removed without being flagged: ${[...lost].join(", ")}` };
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

  // PART 3a: the tightest element available, so a coarse span cannot license
  // deleting confirmed material sitting inside it.
  const spans = tightestUnsupportedSpans(concern);
  const spanCheck = checkOutsideSpanUnchanged(original, revised, spans);
  if (!spanCheck.ok) {
    return { accepted: false, reason: REJECT_OUTSIDE_SPAN, detail: spanCheck.detail };
  }

  if (spans.length === 0) {
    const entityCheck = checkNoSpanEntitiesKept(original, revised, concern);
    if (!entityCheck.ok) {
      return { accepted: false, reason: REJECT_NO_SPAN_ENTITY_LOSS, detail: entityCheck.detail };
    }
  }

  const factCheck = checkNoInventedFacts(original, revised, opts.sourceText, opts.authoringOrganisation);
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
/**
 * Editorial and compliance concerns carrying an explicit instruction. A
 * directive names the span and says what to do with it, so acting on it is not
 * an editorial judgement about silence — it is following an editor.
 *
 * @param {object} concern
 * @returns {Array<object>}
 */
export function directivesOn(concern) {
  return [
    ...(Array.isArray(concern?.editorial) ? concern.editorial : []),
    ...(Array.isArray(concern?.compliance) ? concern.compliance : []),
  ].filter((e) => typeof e?.suggestedDirection === "string" && e.suggestedDirection.trim());
}

/**
 * SILENCE NEVER EDITS, ENFORCED AT THE GATE RATHER THAN IN THE PROMPT.
 *
 * Stage 1 asks the model to rewrite a statement. Under the principle adopted on
 * 2026-08-29 there is nothing to ask about where every finding rests on
 * silence: the answer is always "keep it and flag it", and code can do that
 * without a model call. So the statement is not sent at all.
 *
 * A statement is sent only where a source SPOKE, or an editor gave an explicit
 * instruction:
 *   - a conflict finding, where a source states a competing value
 *   - a partial finding where the source states a value for the unsupported
 *     element rather than being silent on it
 *   - an editorial or compliance concern carrying a suggestedDirection
 *
 * @param {object} concern
 * @returns {{ send: boolean, reason: string, signals: string[] }}
 */
export function stage1SendDecision(concern) {
  const signals = [];
  const silence = findingRestsOnSilence(concern);
  const hasEvidenceFinding = Boolean(concern?.evidence?.kind);

  if (hasEvidenceFinding && !silence.silence) signals.push(`evidence: ${silence.why}`);
  const directives = directivesOn(concern);
  if (directives.length > 0) {
    signals.push(
      `directive: ${directives.map((d) => d.rule ?? d.kind ?? "unnamed").join(", ")}`
    );
  }

  if (signals.length > 0) return { send: true, reason: signals.join("; "), signals };
  return {
    send: false,
    reason: hasEvidenceFinding ? silence.why : "no finding a source spoke to",
    signals,
  };
}

export async function runStage1(draft, concerns, opts) {
  const list = (Array.isArray(concerns) ? concerns : []).filter(
    (c) => typeof c?.statementText === "string" && c.statementText.trim()
  );
  const limit = Number.isInteger(opts?.concurrency) ? opts.concurrency : DEFAULT_CONCURRENCY;

  // Author-originated statements resting on silence are never sent. An
  // exemption is not a refusal: the model was never asked, so the two are
  // recorded separately and counted separately.
  /** @type {Array<{ concern: object, reason: string }>} */
  const exempt = [];
  /** @type {Array<{ concern: object, decision: object }>} */
  const silenceOnly = [];
  const sendable = [];
  for (const concern of list) {
    // AN EDITOR'S INSTRUCTION OUTRANKS THE AUTHOR EXEMPTION.
    //
    // The exemption answers an EVIDENCE question: no supplied source speaks to
    // the author's own action, so the claim is kept and flagged rather than
    // edited. A directive is not an evidence finding — it says the wording
    // itself is wrong — so the exemption has nothing to say about it. Checking
    // the exemption first swallowed three directives on the R10 fixture,
    // measured here: marketing_language_excess and voice_consistency on the
    // author's own sentences were never acted on because the statement was
    // never sent.
    //
    // The span constraint still confines the edit to the directive's target, so
    // the silent evidence element is left alone. That is the mixed case.
    const send = stage1SendDecision(concern);
    if (send.send) {
      sendable.push(concern);
      continue;
    }
    const decision = authorStatementExemption(concern, {
      authoringOrganisation: opts?.authoringOrganisation,
      draftText: draft,
    });
    if (decision.exempt) exempt.push({ concern, reason: decision.reason });
    else silenceOnly.push({ concern, decision: send });
  }

  const results = await mapWithLimit(sendable, limit, async (concern, i) => {
    const kind = concernKind(concern) || "unsupported";
    const prompt = buildStage1Prompt(concern, kind, {
      paragraph: paragraphFor(draft, concern.statementText),
    });
    const res = await opts.callModel(prompt, { index: i, kind, concern });
    const verdict = validateStage1Response(res?.text, concern, {
      sourceText: opts.sourceText,
      authoringOrganisation: opts?.authoringOrganisation,
    });
    return { concern, kind, prompt, verdict, usage: res?.usage ?? null };
  });

  let revisedDraft = draft;
  const edits = [];
  const events = [];

  for (const { concern, reason } of exempt) {
    const at = revisedDraft.indexOf(concern.statementText);
    if (at >= 0) {
      revisedDraft =
        revisedDraft.slice(0, at) +
        wrapAsKeptMarker(concern.statementText, AUTHOR_STATEMENT_KEPT_NOTE) +
        revisedDraft.slice(at + concern.statementText.length);
    }
    events.push({
      outcome: OUTCOME_AUTHOR_EXEMPT,
      kind: concernKind(concern) || "unsupported",
      reason,
      statementText: concern.statementText,
      statementIndex: concern.statementIndex,
    });
  }

  // Silence is flagged at the volume the register sets, and the prose is left
  // exactly as the author wrote it. No model call, so nothing can drift.
  for (const { concern, decision } of silenceOnly) {
    const spans = tightestUnsupportedSpans(concern);
    const element = spans.length > 0 ? spans[0].text : concern.statementText;
    const register = flagRegister(concern, null, element, {
      authoringOrganisation: opts?.authoringOrganisation,
    });
    const at = revisedDraft.indexOf(concern.statementText);
    if (at >= 0 && register.note) {
      revisedDraft =
        revisedDraft.slice(0, at) +
        wrapAsKeptMarker(concern.statementText, register.note) +
        revisedDraft.slice(at + concern.statementText.length);
    }
    events.push({
      outcome: OUTCOME_SILENCE_NOT_SENT,
      kind: concernKind(concern) || "unsupported",
      reason: decision.reason,
      register: register.register,
      registerSignal: register.signal,
      note: register.note,
      statementText: concern.statementText,
      statementIndex: concern.statementIndex,
    });
  }

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
 * Wrap an untouched statement in a KEPT marker. Nothing changed, so there is no
 * what-from-diff to write and the note is the whole note.
 */
export function wrapAsKeptMarker(statement, note) {
  const safe = String(statement).replace(/\{\{|\}\}|\|\|/g, " ");
  const m = safe.match(/^([\s\S]*?)([.!?]+)(\s*)$/);
  const body = m ? m[1] : safe;
  const tail = m ? m[2] + m[3] : "";
  return `{{${body}||KEPT: ${collapse(note)}}}${tail}`;
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
