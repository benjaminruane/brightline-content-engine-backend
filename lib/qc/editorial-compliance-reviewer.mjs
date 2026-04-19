// lib/qc/editorial-compliance-reviewer.mjs
// A7.14 / A8.22–A8.29: Rulebook-driven style, editorial, and compliance LLM review per statement.

import { outputTypeGuidance } from "../prompt-library/outputTypeGuidance.js";
import styleGuideRules from "../rulebook/styleGuide.js";
import editorialRules from "../rulebook/editorialRules.js";
import complianceRules from "../rulebook/complianceRules.js";
import {
  OUTPUT_TYPE,
  VISIBILITY,
  normalizeOutputType,
  normalizeVisibility,
  getOutputTypeLabel,
  getVisibilityLabel,
} from "../output-intent.js";
import { normalizeEventType, getEventTypeLabel } from "../event-type.js";

const STYLE_PREAMBLE = `You are a style guide reviewer for institutional financial writing. You evaluate the current statement strictly against the numbered rules below.`;

const VIOLATIONS_ONLY_CONTRACT = `Return a violation ONLY when the rule is actually violated by the CURRENT STATEMENT. If you evaluated a rule and the statement is compliant, OMIT the rule entirely from your response. Do not include compliant rules with notes such as 'this is correct', 'no change needed', 'not applicable', or 'this concern is not applicable'. Your output contains only actual violations.`;

const STYLE_SCOPE_CURRENT_ONLY = `Evaluate only the CURRENT STATEMENT below. Do not flag phrases, figures, or other content that does not appear in the CURRENT STATEMENT. If the CURRENT STATEMENT does not contain a violation of a rule, omit the rule from your output.`;

const COMPLIANCE_SCOPE_CURRENT_ONLY = `Evaluate only the CURRENT STATEMENT below. Do not flag phrases, figures, or other content that does not appear in the CURRENT STATEMENT. If the CURRENT STATEMENT does not contain a violation of a rule, omit the rule from your output.`;

const SUGGESTED_DIRECTION_FORMAT_META = `When a rule specifies a fixDirection, follow it as guidance for how to construct your suggestedDirection output. Every suggestedDirection MUST be a single, complete imperative sentence that (a) quotes the exact phrase from the CURRENT STATEMENT that triggered the concern, and (b) states the corrected form. Do not emit two fragments joined by 'and'. Do not emit template placeholders like '[X]' or '[N]'. Do not emit a list, a sketch, or a pair of values. The output must read as an instruction a writer could act on.`;

const STYLE_META_RULES = `META-RULES
- ${VIOLATIONS_ONLY_CONTRACT}
- Only evaluate the rules in the list provided. Do not raise concerns outside this list.
- Style rules do not apply to text inside quotation marks, blockquotes, or cited passages. Only flag violations in the surrounding prose. When quoting a source, preserve the source's original formatting exactly.
- Keep notes concise: one to two sentences per concern.
- Each violation must name the rule id and the specific wording or pattern that triggers it.
- ${SUGGESTED_DIRECTION_FORMAT_META}`;

const EDITORIAL_PREAMBLE = `You are a senior editor at a top-tier financial publication reviewing a draft for a writer. You value precision, clean structure, and a direct line of argument. Your feedback is constructive and craft-oriented. You prefer short sentences over long ones, active voice over passive, concrete nouns over abstract ones, and specific claims over vague ones. You flag hedging that softens a clear statement, and overreach that extends beyond the evidence. You care about rhythm and readability. Your voice is measured, authoritative, and unsentimental.`;

const EDITORIAL_EVALUATION_SCOPE = `You evaluate only the CURRENT STATEMENT. Phrases, figures, or facts appearing in CONTEXT BEFORE or CONTEXT AFTER are for reference only — do not raise concerns about them. The single exception is narrative_coherence (E8), which evaluates how the CURRENT STATEMENT flows with the surrounding context. All other rules apply strictly to the CURRENT STATEMENT.`;

const EDITORIAL_E2_IMPRECISION_GATE = `EDITORIAL_E2_IMPRECISION_GATE:

The imprecision_when_precision_available rule has strict
pre-conditions. Before emitting this concern, you must verify
each of the following points. If any fails, you MUST omit the
concern entirely — not emit it with a note, not adjust the
wording, not soften it. Omit.

Pre-check 1 — Approximator word in the statement.
Identify the specific approximator word in the CURRENT
STATEMENT. It must be exactly one of: 'nearly', 'roughly',
'approximately', 'around', 'about', 'some'. If none of these
words appears in the statement next to a specific figure, the
rule does not apply. Omit.

Pre-check 2 — Precise figure is LITERALLY in the evidence.
The precise figure must appear word-for-word in the EVIDENCE
EXCERPT. You may not compute, derive, infer, or calculate a
precise figure from other figures in the excerpt. Example:
the excerpt says 'nearly 10,000 today (+81% Y/Y)'. Do not
compute 5,500 × 1.81 = 9,955 and present 9,955 as the
precise figure — 9,955 is not in the excerpt. If the precise
figure is not literally present, the rule does not apply.
Omit.

Pre-check 3 — Equivalent approximators.
The words 'approximately', 'roughly', 'around', and 'about'
are all the same tier of vagueness and are treated as the
same qualifier. If the statement and evidence both use any
of these four words — even different words from that group —
the evidence is not more precise than the statement. The
rule does not apply. Omit.

Pre-check 4 — Same underlying fact.
Confirm the statement figure and the evidence figure refer
to the SAME underlying quantity. A customer count is not a
growth rate. A pre-money valuation is not a funding amount.
If the figures describe different facts, the rule does not
apply. Omit.

Pre-check 5 — Not a numeric conflict.
If the statement figure and the evidence figure are DIFFERENT
numbers for the SAME fact (e.g. $30mm in statement, $20mm in
evidence), this is a numeric conflict handled by the evidence
pipeline. E2 does not fire on conflicts. Omit.

If all five pre-checks pass, emit the concern with a
suggestedDirection that follows the fixDirection format: a
single suggestion sentence (not a command) that names the
vague phrase and the precise figure literally stated in the
evidence.`;

const EDITORIAL_META_RULES = `META-RULES
- Only evaluate the rules in the list provided. Do not raise concerns outside this list.
- Style-of-writing concerns about formatting, spelling, and mechanical convention are not your responsibility — those belong to a separate reviewer.
- Keep notes concise: one to two sentences per concern.
- Each note must be actionable: say what is wrong and what the writer should do about it.
- Style rules do not apply to text inside quotation marks, blockquotes, or cited passages.
- The SOURCE EVIDENCE block below is supplementary context; do not raise editorial concerns about text that appears only there and not in the CURRENT STATEMENT.
- ${SUGGESTED_DIRECTION_FORMAT_META}`;

const COMPLIANCE_PREAMBLE = `You are a senior compliance reviewer at an investment management firm. Your role is to identify genuine regulatory, legal, and disclosure risks in written content. You understand the difference between a positive claim that is well-supported (acceptable) and a positive claim that misleads, overreaches, or omits material information (flagged). You do not penalise affirmative language in an investment thesis for being affirmative. You flag claims that could mislead a reader about material risk, performance, confidentiality, or regulatory position.`;

const COMPLIANCE_META_RULES = `META-RULES
- ${VIOLATIONS_ONLY_CONTRACT}
- Only evaluate the rules in the list provided. Do not raise concerns outside this list.
- Do not flag affirmative claims as unbalanced merely for being affirmative. Investment thesis documents are inherently affirmative.
- A rule triggers only when there is specific evidence of the violation. Speculation is not sufficient.
- Keep notes concise: one to two sentences per concern.
- Each note must name the specific rule, the specific phrase or omission that triggers it, and the action the writer should take.
- Style rules do not apply to content inside quotation marks, blockquotes, or cited passages.
- Do not assess the source evidence text for compliance issues here; anchor concerns to the sentence under review in the draft.
- ${SUGGESTED_DIRECTION_FORMAT_META}`;

const RESPONSE_JSON_STYLE = `Return only the rules that are violated as JSON:
{
  "violations": [
    {
      "concernCode": "[rule id]",
      "note": "[one-to-two-sentence explanation]",
      "suggestedDirection": "[required — follow the violated rule's fixDirection guidance using the actual words and figures from the CURRENT STATEMENT, never bracket placeholders]",
      "suggestedRewrite": "[optional full-sentence rewrite]"
    }
  ]
}

If no rules are violated, return {"violations":[]}.

The "violations" array contains ONLY actual violations. An empty array is the correct response when the statement is compliant across all applicable rules. Do not populate the array with compliant-rule entries.

Respond with valid JSON only. No markdown, no code fences.`;

const RESPONSE_JSON_EDITORIAL_COMPLIANCE = `Return only the rules that are violated as JSON:
{
  "violations": [
    {
      "concernCode": "[rule id]",
      "note": "[one-to-two-sentence explanation]",
      "suggestedDirection": "[actionable fix when helpful — optional]",
      "suggestedRewrite": "[optional full-sentence rewrite]"
    }
  ]
}

If no rules are violated, return {"violations":[]}.

The "violations" array contains ONLY actual violations. An empty array is the correct response when the statement is compliant across all applicable rules. Do not populate the array with compliant-rule entries.

Respond with valid JSON only. No markdown, no code fences.`;

const CANONICAL_TO_RULEBOOK_OUTPUT = {
  [OUTPUT_TYPE.REPORTING_COMMENTARY]: "reporting_commentary",
  [OUTPUT_TYPE.INVESTOR_LETTER]: "investor_letter",
  [OUTPUT_TYPE.PRESS_RELEASE]: "press_release",
  [OUTPUT_TYPE.LINKEDIN_POST]: "linkedin_post",
};

function rulebookOutputSlug(canonicalOt) {
  return CANONICAL_TO_RULEBOOK_OUTPUT[canonicalOt] ?? "reporting_commentary";
}

function rulebookVersionSlug(visibility) {
  return visibility === VISIBILITY.PUBLIC ? "public" : "complete";
}

function filterRulesForRun(rules, outputSlug, versionSlug) {
  return rules.filter((r) => {
    if (!Array.isArray(r.appliesTo) || !r.appliesTo.includes(outputSlug)) return false;
    if (r.appliesToVersion == null) return true;
    if (Array.isArray(r.appliesToVersion) && r.appliesToVersion.includes(versionSlug)) return true;
    return false;
  });
}

/** A8.23: Default severity for this output type (supports severityByOutput map). */
function effectiveSeverity(rule, outputSlug) {
  if (!rule) return "soft_concern";
  if (rule.severityByOutput && typeof rule.severityByOutput === "object") {
    const s = rule.severityByOutput[outputSlug];
    if (typeof s === "string" && s.trim()) return s.trim();
  }
  return rule.severity ?? "soft_concern";
}

function formatRulesForPrompt(rules, outputSlug, kind) {
  return rules
    .map((r, i) => {
      const sev = effectiveSeverity(r, outputSlug);
      let block = `${i + 1}. ${r.id}: ${String(r.description).trim()}\n   severity (default): ${sev}`;
      if (kind === "editorial") {
        const scope = r.id === "narrative_coherence" ? "CURRENT + CONTEXT" : "CURRENT only";
        block += `\n   scope: ${scope}`;
        if (typeof r.fixDirection === "string" && r.fixDirection.trim()) {
          block += `\n   fixDirection: ${r.fixDirection.trim()}`;
        }
      }
      if (kind === "style" && typeof r.fixDirection === "string" && r.fixDirection.trim()) {
        block += `\n   fixDirection: ${r.fixDirection.trim()}`;
      }
      if (kind === "compliance" && typeof r.reviewerNote === "string" && r.reviewerNote.trim()) {
        block += `\n   reviewerNote: ${r.reviewerNote.trim()}`;
      }
      return block;
    })
    .join("\n\n");
}

function buildRuleMap(rules) {
  const m = new Map();
  for (const r of rules) m.set(r.id, r);
  return m;
}

function severityRank(sev) {
  if (sev === "hard_concern") return 3;
  if (sev === "soft_concern") return 2;
  if (sev === "clean") return 0;
  return 1;
}

function aggregateVerdictFromConcerns(concerns, ruleMap, outputSlug) {
  let max = 0;
  for (const c of concerns) {
    const rule = ruleMap.get(c.concernCode);
    const s = effectiveSeverity(rule, outputSlug);
    max = Math.max(max, severityRank(s));
  }
  if (max >= 3) return "hard_concern";
  if (max >= 2) return "soft_concern";
  return "clean";
}

function sortConcernsBySeverity(concerns, ruleMap, outputSlug) {
  return [...concerns].sort((a, b) => {
    const ra = effectiveSeverity(ruleMap.get(a.concernCode), outputSlug);
    const rb = effectiveSeverity(ruleMap.get(b.concernCode), outputSlug);
    return severityRank(rb) - severityRank(ra);
  });
}

/** A8.25: First non-empty string field on concerns in array order (post-sort). */
function pickFirstConcernField(concerns, field) {
  if (!Array.isArray(concerns) || concerns.length === 0) return null;
  for (const c of concerns) {
    const v = c?.[field];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

function safeParseJsonObject(raw) {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    // fall through
  }
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseViolationsArray(raw) {
  const parsed = safeParseJsonObject(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const v =
    parsed.violations ??
    parsed.concerns ??
    parsed.editorialConcerns ??
    parsed.complianceConcerns ??
    null;
  if (!Array.isArray(v)) return null;
  return v;
}

function normalizeViolation(entry, category, allowedIds) {
  const code = typeof entry?.concernCode === "string" ? entry.concernCode.trim() : "";
  if (!code || !allowedIds.has(code)) return null;
  const note = typeof entry?.note === "string" ? entry.note.trim() : "";
  if (!note) return null;
  const out = {
    concernCode: code,
    note,
    category,
  };
  if (entry.suggestedDirection != null && String(entry.suggestedDirection).trim() !== "") {
    out.suggestedDirection = String(entry.suggestedDirection).trim();
  }
  if (entry.suggestedRewrite != null && String(entry.suggestedRewrite).trim() !== "") {
    out.suggestedRewrite = String(entry.suggestedRewrite).trim();
  }
  return out;
}

function buildMarkedDraft(draftText, sentenceText) {
  const d = typeof draftText === "string" ? draftText : "";
  const s = typeof sentenceText === "string" ? sentenceText : "";
  if (!s.trim()) return d;
  const idx = d.indexOf(s);
  if (idx >= 0) {
    return d.slice(0, idx) + "[REVIEW THIS]" + d.slice(idx + s.length);
  }
  return `${d}\n\n[STATEMENT UNDER REVIEW — not found verbatim in draft]\n${s}`;
}

/** A8.24: Stage-4-style primary excerpt string for Editorial E2, or null. */
function getEditorialSourceExcerpt(stmt, documentContext) {
  if (stmt && typeof stmt.editorialSourceExcerpt === "string" && stmt.editorialSourceExcerpt.trim()) {
    return stmt.editorialSourceExcerpt.trim();
  }
  if (documentContext?.editorialSourceExcerpt != null) {
    const v = documentContext.editorialSourceExcerpt;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }
  const qc = stmt?.qcCard;
  if (qc && typeof qc.primaryExcerpt === "string" && qc.primaryExcerpt.trim()) {
    return qc.primaryExcerpt.trim();
  }
  return null;
}

function buildEvidenceBlock(stmt) {
  const qc = stmt?.qcCard;
  const parts = [];
  if (qc && typeof qc.primaryExcerpt === "string" && qc.primaryExcerpt.trim()) {
    parts.push(`Primary excerpt: ${qc.primaryExcerpt.trim()}`);
  }
  if (Array.isArray(qc?.evidenceTrace)) {
    for (const t of qc.evidenceTrace) {
      if (t && typeof t.excerptText === "string" && t.excerptText.trim()) {
        const name = typeof t.sourceName === "string" ? t.sourceName : "Source";
        parts.push(`${name}: ${t.excerptText.trim()}`);
      }
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : "(No excerpt text available for this statement.)";
}

function buildOutputTypeConventionsBlock(outputType) {
  const ot = normalizeOutputType(outputType);
  const guidance = outputTypeGuidance[ot] ?? outputTypeGuidance[OUTPUT_TYPE.REPORTING_COMMENTARY];
  const outputTypeLabel = getOutputTypeLabel(ot);
  const toneVoice = (guidance.toneVoice || []).join("\n");
  const structure = (guidance.structure || []).join("\n");
  return `Output type conventions for ${outputTypeLabel}:\n${toneVoice}\n${structure}`;
}

function buildEditorialUserPayload(
  draftMarked,
  sentenceText,
  evidenceBlock,
  ctx,
  previousText,
  nextText,
  sourceExcerpt
) {
  const eventLabel = getEventTypeLabel(ctx.eventType);
  const visLabel = getVisibilityLabel(ctx.requiredVersion);
  const prev =
    typeof previousText === "string" && previousText.trim()
      ? previousText.trim()
      : "(none — this is the first statement)";
  const next =
    typeof nextText === "string" && nextText.trim()
      ? nextText.trim()
      : "(none — this is the last statement)";
  const excerptBlock =
    typeof sourceExcerpt === "string" && sourceExcerpt.trim()
      ? sourceExcerpt.trim()
      : "(no excerpt available)";
  return `OUTPUT TYPE: ${ctx.outputTypeLabel}

CONTEXT BEFORE:
${prev}

CURRENT STATEMENT (evaluate only this):
${sentenceText}

CONTEXT AFTER:
${next}

EVIDENCE EXCERPT (from the source supporting this statement):
${excerptBlock}

---

DOCUMENT CONTEXT
- Event type: ${eventLabel}
- Output type: ${ctx.outputTypeLabel}
- Required version: ${visLabel} (${String(ctx.requiredVersion)})

FULL DRAFT (current sentence marked with [REVIEW THIS] where matched):
---
${draftMarked}
---

SOURCE EVIDENCE (factual context only — do not assess this
text for style, formatting, or language quality):
${evidenceBlock}`;
}

function buildStyleUserPayload(sentenceText, ctx) {
  return `OUTPUT TYPE: ${ctx.outputTypeLabel}

CURRENT STATEMENT:
${sentenceText}`;
}

function buildComplianceUserPayload(sentenceText, ctx) {
  const visLabel = getVisibilityLabel(ctx.requiredVersion);
  return `OUTPUT TYPE: ${ctx.outputTypeLabel}
VERSION: ${visLabel} (${String(ctx.requiredVersion)})

CURRENT STATEMENT:
${sentenceText}`;
}

function buildEditorialSystemPrompt(outputTypeLabel, rules, outputSlug) {
  return `${EDITORIAL_PREAMBLE}

You are reviewing for output type: ${outputTypeLabel}.

${EDITORIAL_EVALUATION_SCOPE}

${EDITORIAL_E2_IMPRECISION_GATE}

${VIOLATIONS_ONLY_CONTRACT}

${EDITORIAL_META_RULES}

RULES:
${formatRulesForPrompt(rules, outputSlug, "editorial")}

${RESPONSE_JSON_EDITORIAL_COMPLIANCE}`;
}

function buildStyleSystemPrompt(outputTypeLabel, rules, outputSlug, outputType) {
  const conventions = buildOutputTypeConventionsBlock(outputType);
  return `${STYLE_PREAMBLE} Output type: ${outputTypeLabel}.

${STYLE_META_RULES}

${STYLE_SCOPE_CURRENT_ONLY}

OUTPUT-TYPE VOICE AND STRUCTURE (reference only — not the text under review):
${conventions}

RULES:
${formatRulesForPrompt(rules, outputSlug, "style")}

${RESPONSE_JSON_STYLE}`;
}

function buildComplianceSystemPrompt(outputTypeLabel, rules, outputSlug) {
  return `${COMPLIANCE_PREAMBLE}

You are reviewing for output type: ${outputTypeLabel}.

${COMPLIANCE_META_RULES}

${COMPLIANCE_SCOPE_CURRENT_ONLY}

RULES:
${formatRulesForPrompt(rules, outputSlug, "compliance")}

${RESPONSE_JSON_EDITORIAL_COMPLIANCE}`;
}

/** A9.12: Clear LLM editorial fields on qcCard when that review type was not requested. */
function clearEditorialQcCard(qcCard) {
  if (!qcCard || typeof qcCard !== "object") return;
  qcCard.editorialVerdict = null;
  qcCard.editorialConcerns = null;
  qcCard.editorialNote = null;
  qcCard.editorialSuggestedDirection = null;
  qcCard.editorialSuggestedRewrite = null;
}

/** A9.12: Clear LLM compliance fields on qcCard when that review type was not requested. */
function clearComplianceQcCard(qcCard) {
  if (!qcCard || typeof qcCard !== "object") return;
  qcCard.complianceVerdict = null;
  qcCard.complianceConcerns = null;
  qcCard.complianceNote = null;
  qcCard.complianceSuggestedDirection = null;
  qcCard.complianceSuggestedRewrite = null;
}

/**
 * A8.22 / A8.25: Run style-guide LLM review (CURRENT STATEMENT user payload only).
 * @param {import("openai").default} client
 * @param {{ sentenceText: string, ctx: object, rules: object[], statementIndex?: number|null }} args
 */
export async function runStyleGuideReview(client, args) {
  const { sentenceText, ctx, rules, statementIndex } = args;
  const idx = statementIndex ?? null;
  console.log("[STYLE_REVIEW] starting", { statementIndex: idx });
  const outputSlug = ctx.outputSlug ?? rulebookOutputSlug(ctx.outputType);
  const systemPrompt = buildStyleSystemPrompt(ctx.outputTypeLabel, rules, outputSlug, ctx.outputType);
  const userContent = buildStyleUserPayload(sentenceText, ctx);
  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });
  const raw = completion?.choices?.[0]?.message?.content;
  const violations = parseViolationsArray(raw);
  const concernCount = Array.isArray(violations) ? violations.length : 0;
  console.log("[STYLE_REVIEW] completed", { statementIndex: idx, concernCount });
  return { raw, violations };
}

/**
 * A8.22: Run editorial LLM review for one statement context.
 * @param {import("openai").default} client
 * @param {{ draftMarked: string, sentenceText: string, evidenceBlock: string, ctx: object, rules: object[], previousText?: string|null, nextText?: string|null, sourceExcerpt?: string|null, statementIndex?: number|null }} args
 */
export async function runEditorialReview(client, args) {
  const { draftMarked, sentenceText, evidenceBlock, ctx, rules, previousText, nextText, sourceExcerpt, statementIndex } =
    args;
  const idx = statementIndex ?? null;
  const outputSlug = ctx.outputSlug ?? rulebookOutputSlug(ctx.outputType);
  const systemPrompt = buildEditorialSystemPrompt(ctx.outputTypeLabel, rules, outputSlug);
  const userContent = buildEditorialUserPayload(
    draftMarked,
    sentenceText,
    evidenceBlock,
    ctx,
    previousText,
    nextText,
    sourceExcerpt
  );
  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });
  const raw = completion?.choices?.[0]?.message?.content;
  const violations = parseViolationsArray(raw);
  const concernCount = Array.isArray(violations) ? violations.length : 0;
  console.log("[EDITORIAL_REVIEW] completed", { statementIndex: idx, concernCount });
  return { raw, violations };
}

/**
 * A8.22 / A8.25: Run compliance LLM review (CURRENT STATEMENT user payload only).
 * @param {import("openai").default} client
 * @param {{ sentenceText: string, ctx: object, rules: object[], statementIndex?: number|null }} args
 */
export async function runComplianceReview(client, args) {
  const { sentenceText, ctx, rules, statementIndex } = args;
  const idx = statementIndex ?? null;
  const outputSlug = ctx.outputSlug ?? rulebookOutputSlug(ctx.outputType);
  const systemPrompt = buildComplianceSystemPrompt(ctx.outputTypeLabel, rules, outputSlug);
  const userContent = buildComplianceUserPayload(sentenceText, ctx);
  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });
  const raw = completion?.choices?.[0]?.message?.content;
  const violations = parseViolationsArray(raw);
  const concernCount = Array.isArray(violations) ? violations.length : 0;
  console.log("[COMPLIANCE_REVIEW] completed", { statementIndex: idx, concernCount });
  return { raw, violations };
}

function applyComplianceResult(qcCard, violations, ruleMap, outputSlug) {
  const allowed = new Set(ruleMap.keys());
  const normalized = [];
  for (const v of violations) {
    const n = normalizeViolation(v, "compliance", allowed);
    if (n) normalized.push(n);
  }
  const sorted = sortConcernsBySeverity(normalized, ruleMap, outputSlug);
  qcCard.complianceConcerns = sorted;
  qcCard.complianceVerdict = aggregateVerdictFromConcerns(sorted, ruleMap, outputSlug);
  if (sorted.length === 0) {
    qcCard.complianceNote = "No compliance concerns identified under the listed rules.";
    qcCard.complianceSuggestedDirection = null;
    qcCard.complianceSuggestedRewrite = null;
  } else {
    qcCard.complianceNote = null;
    qcCard.complianceSuggestedDirection = pickFirstConcernField(sorted, "suggestedDirection");
    qcCard.complianceSuggestedRewrite = pickFirstConcernField(sorted, "suggestedRewrite");
  }
}

function applyMergedEditorialAndStyle(qcCard, styleViolations, editorialViolations, styleRules, editorialRules, outputSlug) {
  const styleMap = buildRuleMap(styleRules);
  const editorialMap = buildRuleMap(editorialRules);
  const mergedMap = new Map([...styleMap.entries(), ...editorialMap.entries()]);

  const styleAllowed = new Set(styleMap.keys());
  const edAllowed = new Set(editorialMap.keys());

  const merged = [];
  for (const v of styleViolations || []) {
    const n = normalizeViolation(v, "style_guide", styleAllowed);
    if (n) merged.push(n);
  }
  for (const v of editorialViolations || []) {
    const n = normalizeViolation(v, "editorial", edAllowed);
    if (n) merged.push(n);
  }

  const sorted = sortConcernsBySeverity(merged, mergedMap, outputSlug);
  qcCard.editorialConcerns = sorted;
  qcCard.editorialVerdict = aggregateVerdictFromConcerns(sorted, mergedMap, outputSlug);
  if (sorted.length === 0) {
    qcCard.editorialNote = "No editorial or style concerns identified under the listed rules.";
    qcCard.editorialSuggestedDirection = null;
    qcCard.editorialSuggestedRewrite = null;
  } else {
    qcCard.editorialNote = null;
    qcCard.editorialSuggestedDirection = pickFirstConcernField(sorted, "suggestedDirection");
    qcCard.editorialSuggestedRewrite = pickFirstConcernField(sorted, "suggestedRewrite");
  }
}

/**
 * A7.14 / A8.22: Run style + editorial + compliance LLM review per statement (parallel calls per statement).
 *
 * @param {Array<object>} statements - Visible statements (suppressInQcWorkbench !== true), max 20 processed
 * @param {object} documentContext
 * @param {string} [documentContext.outputType]
 * @param {string} [documentContext.requiredVersion] VISIBILITY: COMPLETE | PUBLIC
 * @param {string} [documentContext.eventType]
 * @param {string} [documentContext.draftText] Full draft for coherence review
 * @param {boolean} [documentContext.editorialEnabled] A9.12: default true; false skips editorial LLM
 * @param {boolean} [documentContext.complianceEnabled] A9.12: default true; false skips compliance LLM
 * @param {string|null} [documentContext.previousStatementText] A8.23: prior sentence when batch is a single statement
 * @param {string|null} [documentContext.nextStatementText] A8.23: following sentence when batch is a single statement
 * @param {string|null} [documentContext.editorialSourceExcerpt] A8.24: primary source passage for Editorial (per statement when batch size 1)
 * @param {number} [documentContext.statementIndex] A8.24: global statement index for logs (optional)
 */
export async function runEditorialComplianceReview(statements, documentContext = {}) {
  if (process.env.BRIGHTLINE_EDITORIAL_REVIEW !== "1") {
    console.log("[EDITORIAL_REVIEW] gated off — raw value:", JSON.stringify(process.env.BRIGHTLINE_EDITORIAL_REVIEW));
    return;
  }
  const editorialEnabled = documentContext.editorialEnabled !== false;
  const complianceEnabled = documentContext.complianceEnabled !== false;
  console.log("[EDITORIAL_REVIEW] starting", {
    statementCount: statements.length,
    outputType: documentContext.outputType ?? null,
    visibility: documentContext.visibility ?? null,
    eventType: documentContext.eventType ?? null,
    editorialEnabled,
    complianceEnabled,
  });
  if (!Array.isArray(statements) || statements.length === 0) {
    return;
  }

  const outputType = normalizeOutputType(documentContext.outputType);
  const requiredVersion = normalizeVisibility(documentContext.requiredVersion);
  const eventType = normalizeEventType(documentContext.eventType);
  const draftText = typeof documentContext.draftText === "string" ? documentContext.draftText : "";
  const outputTypeLabel = getOutputTypeLabel(outputType);
  const outputSlug = rulebookOutputSlug(outputType);
  const ctx = { outputType, requiredVersion, eventType, outputTypeLabel, outputSlug };

  const versionSlug = rulebookVersionSlug(requiredVersion);

  const styleFiltered = filterRulesForRun(styleGuideRules, outputSlug, versionSlug);
  const editorialFiltered = filterRulesForRun(editorialRules, outputSlug, versionSlug);
  const complianceFiltered = filterRulesForRun(complianceRules, outputSlug, versionSlug);

  const toProcess = statements.slice(0, 20);

  if (!editorialEnabled && !complianceEnabled) {
    for (const stmt of toProcess) {
      clearEditorialQcCard(stmt?.qcCard);
      clearComplianceQcCard(stmt?.qcCard);
    }
    return;
  }

  let apiKey = process.env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    console.warn("[EDITORIAL_COMPLIANCE_ERROR] missing OPENAI_API_KEY");
    return;
  }
  apiKey = apiKey.trim();

  try {
    await import("openai/shims/web");
  } catch (_) {}
  const openaiMod = await import("openai");
  const OpenAI = openaiMod.default;
  const client = new OpenAI({ apiKey });

  await Promise.allSettled(
    toProcess.map(async (stmt, index) => {
      if (!stmt || typeof stmt !== "object") return;
      if (!stmt.qcCard || typeof stmt.qcCard !== "object") return;

      const sentenceText = typeof stmt.text === "string" ? stmt.text : "";
      const draftMarked = buildMarkedDraft(draftText, sentenceText);
      const evidenceBlock = buildEvidenceBlock(stmt);

      const adjacentFromDocumentContext =
        Object.prototype.hasOwnProperty.call(documentContext, "previousStatementText") ||
        Object.prototype.hasOwnProperty.call(documentContext, "nextStatementText");
      const previousText = adjacentFromDocumentContext
        ? documentContext.previousStatementText ?? null
        : index > 0 && typeof toProcess[index - 1]?.text === "string"
          ? toProcess[index - 1].text
          : null;
      const nextText = adjacentFromDocumentContext
        ? documentContext.nextStatementText ?? null
        : index < toProcess.length - 1 && typeof toProcess[index + 1]?.text === "string"
          ? toProcess[index + 1].text
          : null;

      const statementIndex = documentContext.statementIndex ?? index;
      const sourceExcerpt = getEditorialSourceExcerpt(stmt, documentContext);

      if (!editorialEnabled) {
        clearEditorialQcCard(stmt.qcCard);
      }
      if (!complianceEnabled) {
        clearComplianceQcCard(stmt.qcCard);
      }

      const reviewArgs = { draftMarked, sentenceText, evidenceBlock, ctx };
      const styleP =
        editorialEnabled &&
        runStyleGuideReview(client, { sentenceText, ctx, rules: styleFiltered, statementIndex });
      const editorialP =
        editorialEnabled &&
        runEditorialReview(client, {
          ...reviewArgs,
          rules: editorialFiltered,
          previousText,
          nextText,
          sourceExcerpt,
          statementIndex,
        });
      const complianceP =
        complianceEnabled &&
        runComplianceReview(client, { sentenceText, ctx, rules: complianceFiltered, statementIndex });

      if (editorialEnabled && complianceEnabled) {
        const [styleSettled, editorialSettled, complianceSettled] = await Promise.allSettled([
          styleP,
          editorialP,
          complianceP,
        ]);

        if (styleSettled.status !== "fulfilled" || editorialSettled.status !== "fulfilled") {
          console.warn("[EDITORIAL_COMPLIANCE_ERROR] style or editorial review failed", {
            style: styleSettled.status,
            editorial: editorialSettled.status,
          });
          clearEditorialQcCard(stmt.qcCard);
        } else {
          const styleV = styleSettled.value?.violations;
          const edV = editorialSettled.value?.violations;
          if (styleV == null || edV == null) {
            console.warn("[EDITORIAL_COMPLIANCE_ERROR] parse failed", {
              stylePreview: String(styleSettled.value?.raw).slice(0, 200),
              editorialPreview: String(editorialSettled.value?.raw).slice(0, 200),
            });
            clearEditorialQcCard(stmt.qcCard);
          } else {
            applyMergedEditorialAndStyle(stmt.qcCard, styleV, edV, styleFiltered, editorialFiltered, outputSlug);
          }
        }

        if (complianceSettled.status !== "fulfilled") {
          console.warn("[EDITORIAL_COMPLIANCE_ERROR]", complianceSettled.reason?.message || String(complianceSettled.reason));
          clearComplianceQcCard(stmt.qcCard);
        } else {
          const complianceV = complianceSettled.value?.violations;
          const complianceMap = buildRuleMap(complianceFiltered);
          if (complianceV == null) {
            console.warn("[EDITORIAL_COMPLIANCE_ERROR] compliance parse failed", {
              preview: String(complianceSettled.value?.raw).slice(0, 200),
            });
            clearComplianceQcCard(stmt.qcCard);
          } else {
            applyComplianceResult(stmt.qcCard, complianceV, complianceMap, outputSlug);
          }
        }
      } else if (editorialEnabled) {
        const [styleSettled, editorialSettled] = await Promise.allSettled([styleP, editorialP]);
        if (styleSettled.status !== "fulfilled" || editorialSettled.status !== "fulfilled") {
          console.warn("[EDITORIAL_COMPLIANCE_ERROR] style or editorial review failed");
          clearEditorialQcCard(stmt.qcCard);
        } else {
          const styleV = styleSettled.value?.violations;
          const edV = editorialSettled.value?.violations;
          if (styleV == null || edV == null) {
            clearEditorialQcCard(stmt.qcCard);
          } else {
            applyMergedEditorialAndStyle(stmt.qcCard, styleV, edV, styleFiltered, editorialFiltered, outputSlug);
          }
        }
      } else if (complianceEnabled) {
        let complianceSettled;
        try {
          const value = await complianceP;
          complianceSettled = { status: "fulfilled", value };
        } catch (reason) {
          complianceSettled = { status: "rejected", reason };
        }
        if (complianceSettled.status !== "fulfilled") {
          clearComplianceQcCard(stmt.qcCard);
        } else {
          const complianceV = complianceSettled.value?.violations;
          const complianceMap = buildRuleMap(complianceFiltered);
          if (complianceV == null) {
            clearComplianceQcCard(stmt.qcCard);
          } else {
            applyComplianceResult(stmt.qcCard, complianceV, complianceMap, outputSlug);
          }
        }
      }
    })
  );
}
