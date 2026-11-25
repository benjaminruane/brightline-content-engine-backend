// lib/qc/editorial-compliance-reviewer.mjs
// A7.14 / A8.22–A8.30: Rulebook-driven style, editorial, and compliance LLM review per statement.

import { outputTypeGuidance } from "../prompt-library/outputTypeGuidance.js";
import editorialRules from "../rulebook/editorialRules.js";
import { formatStyleGuideRulesForPrompt, resolveStyleGuide } from "./style-guide.mjs";
import { mechanicalStyleRuleIds, renderReviewStyleRules, resolveStyleChoices } from "../style-guide/render.mjs";
import { scanListCommas } from "./list-comma-scan.mjs";
import { scanPeriodForm, scanPeriodPlacement } from "../style-guide/period-placement.mjs";
import { scanPenceForm } from "../style-guide/pence.mjs";
import { scanMagnitude } from "./magnitude-scan.mjs";
import { scanMechanics, SCANNED_STYLE_RULE_IDS, statementInsideDraftQuotation } from "./mechanics-scan.mjs";
import { normalizePublicationState } from "../source-publication-state.mjs";
import { scanNumberForm } from "./number-form-scan.mjs";
import { suppressLinkedInCreditLines } from "./linkedin-credit-line.mjs";
import complianceRules from "../rulebook/complianceRules.js";
import { cautionFindingsForStatement, cautionRulesForRun } from "./general-caution.mjs";
import { isExpectedPlaceholderStatement } from "../prompt-library/placeholder-guard.mjs";
import {
  OUTPUT_TYPE,
  VISIBILITY,
  normalizeOutputType,
  normalizeVisibility,
  getOutputTypeLabel,
  getVisibilityLabel,
} from "../output-intent.js";
import { calculateLlmCostUsd, callLLM, hasProviderApiKey, logCanaryScore } from "../observability.js";
import { concernContent, dropRecord, removedByIdentity } from "./drop-record.mjs";
import { CAUSAL_EVIDENCE_RULE } from "./statement-verdict.mjs";
import { normalizePassageForComparison } from "./pipeline-v4/stage2-match-sources.mjs";
import { spanIsPassive } from "./passive-voice-gate.mjs";
import { incrementBoundHit } from "./request-budget.mjs";
import {
  logCheckNotReviewed,
  notReviewedReasonFromFailure,
  NOT_REVIEWED_REASONS,
  providerRequestIdFrom,
  requireNotReviewedReason,
} from "./not-reviewed-reason.mjs";
import { buildSourcePublicationStateBlock } from "../source-publication-state.mjs";
import { extractSourceAsOfDate } from "./source-recency.mjs";
import { STAGE_MODELS } from "./model-config.mjs";
import { applyEvaluativeDeletionBounds } from "./evaluative-language.mjs";
import {
  dropNarrativeCoherenceConcerns,
  gateNarrativeCoherenceRules,
} from "./narrative-coherence.mjs";
import {
  FIRST_PERSON_ACTOR_INSTRUCTION,
  houseVoiceIsThirdPerson,
  statementHasFirstPersonPronoun,
  applyViewMarkerSubjectBounds,
  assertNoUnresolvedAuthoringOrganisationPlaceholder,
  blankPlaceholderLeaksInPublicConcern,
  buildFirstPersonActorInstruction,
  formatAuthoringOrganisationPromptBlock,
  identifyAuthoringOrganisation,
  resolveAuthoringOrganisationName,
} from "./first-person-actor.mjs";

const STYLE_PREAMBLE = `You are a style guide reviewer for institutional financial writing. You evaluate the current statement strictly against the numbered rules below.`;

const VIOLATIONS_ONLY_CONTRACT = `Return a violation ONLY when the rule is actually violated by the CURRENT STATEMENT. If you evaluated a rule and the statement is compliant, OMIT the rule entirely from your response. Do not include compliant rules with notes such as 'this is correct', 'no change needed', 'not applicable', or 'this concern is not applicable'. Your output contains only actual violations.`;

const STYLE_SCOPE_CURRENT_ONLY = `Evaluate only the CURRENT STATEMENT below. Do not flag phrases, figures, or other content that does not appear in the CURRENT STATEMENT. If the CURRENT STATEMENT does not contain a violation of a rule, omit the rule from your output.`;

const COMPLIANCE_SCOPE_CURRENT_ONLY = `Evaluate only the CURRENT STATEMENT below. Do not flag phrases, figures, or other content that does not appear in the CURRENT STATEMENT. If the CURRENT STATEMENT does not contain a violation of a rule, omit the rule from your output.`;

const SUGGESTED_DIRECTION_FORMAT_META = `When a rule specifies a fixDirection, follow it as guidance for how to construct your suggestedDirection output. Every suggestedDirection MUST be a single, complete imperative sentence that (a) quotes the exact phrase from the CURRENT STATEMENT that triggered the concern, and (b) states the corrected form. Do not emit two fragments joined by 'and'. Do not emit template placeholders like '[X]' or '[N]'. Do not emit a list, a sketch, or a pair of values. The output must read as an instruction a writer could act on.`;
const CONCERN_TEXT_META = `For each violation, return a single concernText field containing one coherent prose unit that states both the issue and the fix. Write it as a senior editor would write a margin note: direct, specific, no repetition. State the specific phrase or value in the statement that violates the rule, state what is wrong with it, then state the fix. Avoid repeating the quoted phrase — when stating the fix, use constructions like 'Replace with ...' or 'Change to ...' rather than repeating the whole original phrase. Keep to one or two sentences. No 'Direction:' label. No 'Note:' label.
Example for a currency-notation violation:
'The statement uses "$30mm" — currency should be written as USD [number] million. Replace with "USD 30 million".'
Example for a promissory-language violation:
'The phrase "will deliver guaranteed returns of 15% IRR" guarantees investment outcomes. Replace with "aims to achieve a target of 15% IRR" or similar hedging language.'

Do NOT use gatekeeping or schoolroom framing such as 'which is not permissible', 'is not acceptable', 'is not allowed', 'must not appear', 'is prohibited'. These phrases read as institutional gatekeeping rather than editorial feedback. State the issue directly, then state the fix. For example:

Avoid: 'The statement uses hyperbolic language 'X' without substantiation, which is not permissible in reporting commentary. Replace 'X' with...'

Prefer: ''X' is a hyperbolic claim without substantiation. Replace with...'

The reader knows the concern was raised because it is a concern; they do not need a gatekeeping clause. Keep prose direct and craft-oriented.`;
const ONE_CONCERN_PER_RULE_META = `If a rule is violated in multiple places within the CURRENT STATEMENT, return ONE concern for that rule. The concernText should state the pattern and list each specific fix in the same prose unit.
Example for two violations of one rule:
'The statement uses two unsupported superlatives. Replace "best" and "unique" with the specific fact.'`;

const HOUSE_STYLE_IS_THE_STANDARD = `The style rules above are the only formatting standard. If the CURRENT STATEMENT already matches a rule's Correct example, that rule is satisfied: omit it. Never propose changing text from a form the rules call Correct to a form they call Incorrect. Never emit a suggestedDirection whose replacement text is identical to the text it replaces.`;

const STYLE_META_RULES = `META-RULES
- ${HOUSE_STYLE_IS_THE_STANDARD}
- ${VIOLATIONS_ONLY_CONTRACT}
- Only evaluate the rules in the list provided. Do not raise concerns outside this list.
- Style rules do not apply to text inside quotation marks, blockquotes, or cited passages. Only flag violations in the surrounding prose. Where the CURRENT STATEMENT quotes a source inside quotation marks, leave that quoted text as the writer set it. This exemption covers quoted text inside the CURRENT STATEMENT only. It is not a reason to match the statement to the formatting of the source documents.
- Keep notes concise: one to two sentences per concern.
- Each violation must name the rule id and the specific wording or pattern that triggers it.
- ${SUGGESTED_DIRECTION_FORMAT_META}
- ${CONCERN_TEXT_META}
- ${ONE_CONCERN_PER_RULE_META}`;

const EDITORIAL_PREAMBLE = `You are a senior editor at a top-tier financial publication reviewing a draft for a writer. You value precision, clean structure, and a direct line of argument. Your feedback is constructive and craft-oriented. You prefer short sentences over long ones, active voice over passive, concrete nouns over abstract ones, and specific claims over vague ones. You flag hedging that softens a clear statement, and overreach that extends beyond the evidence. You care about rhythm and readability. Your voice is measured, authoritative, and unsentimental.`;

const GENERAL_EDITORIAL_PREAMBLE = `You are an editor reviewing a draft for a writer. You value precision, clean structure, and a direct line of argument. Your feedback is constructive. You prefer short sentences, active voice, concrete nouns, and specific claims. You flag hedging that softens a clear statement, and overreach that extends beyond the evidence. Do not use the voice of an investment firm.`;

const EDITORIAL_EVALUATION_SCOPE_CURRENT_ONLY = `You evaluate only the CURRENT STATEMENT. Phrases, figures, or facts appearing in CONTEXT BEFORE or CONTEXT AFTER are for reference only — do not raise concerns about them. All rules apply strictly to the CURRENT STATEMENT.`;

const EDITORIAL_EVALUATION_SCOPE_WITH_COHERENCE = `You evaluate only the CURRENT STATEMENT. Phrases, figures, or facts appearing in CONTEXT BEFORE or CONTEXT AFTER are for reference only — do not raise concerns about them. The single exception is narrative_coherence (E8), which evaluates how the CURRENT STATEMENT flows with the surrounding context. All other rules apply strictly to the CURRENT STATEMENT.`;

function editorialEvaluationScope(editorialRulesList) {
  const listed = Array.isArray(editorialRulesList) ? editorialRulesList : [];
  const hasNarrativeCoherence = listed.some((r) => r?.id === "narrative_coherence");
  return hasNarrativeCoherence ? EDITORIAL_EVALUATION_SCOPE_WITH_COHERENCE : EDITORIAL_EVALUATION_SCOPE_CURRENT_ONLY;
}

const EDITORIAL_META_RULES = `META-RULES
- Only evaluate the rules in the list provided. Do not raise concerns outside this list.
- Style-of-writing concerns about formatting, spelling, and mechanical convention are not your responsibility — those belong to a separate reviewer.
- Keep notes concise: one to two sentences per concern.
- Each note must be actionable: say what is wrong and what the writer should do about it.
- Style rules do not apply to text inside quotation marks, blockquotes, or cited passages.
- ${SUGGESTED_DIRECTION_FORMAT_META}
- ${CONCERN_TEXT_META}
- ${ONE_CONCERN_PER_RULE_META}`;

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
- A return figure is also a concern when the statement adds gross or net to a figure the source gives without it, and when the statement drops gross or net from a figure the source gives with it. A draft that says 23% gross IRR against a source that says 23% IRR is that added qualifier. Compare the qualifier only. Do not raise this when the statement and the source use the same qualifier, or when neither uses one.
- ${SUGGESTED_DIRECTION_FORMAT_META}
- ${CONCERN_TEXT_META}
- ${ONE_CONCERN_PER_RULE_META}`;

const VISIBILITY_CALIBRATION_COMPLIANCE = `VISIBILITY CALIBRATION
The visibility setting (Complete or Public) is provided in the user payload. Apply calibration as follows:

Complete visibility: NDA-bound, existing investor audience. Apply rules at standard threshold. Borderline cases (e.g. mildly promotional language, soft comparative claims, lightly hedged forward-looking statements) may be allowed where the substance is accurate.

Public visibility: Wider, non-NDA audience. Apply rules at stricter threshold. Borderline cases that would be allowed on Complete should be flagged on Public. Specifically:
  - Forward-looking claims without an uncertainty qualifier should be flagged on Public; 'we expect', 'expect', 'expects', and 'expected' are adequate hedging — do NOT flag statements that already contain them
  - Comparative or superlative claims without a stated basis in the same sentence or immediate context should be flagged
  - Selective hedging (one favourable claim hedged precisely while a less favourable claim is left unqualified) should be flagged
  - Marketing language and superlatives ('exceptional', 'world-class', 'transformative', 'industry-leading') should be flagged unless accompanied by specific substantiation

SOURCE PUBLICATION STATE AWARENESS
When the user payload includes a SOURCE PUBLICATION STATE block, the listed sources have been classified by an upstream step. Apply this awareness:

- If the CURRENT STATEMENT quotes or paraphrases content that is materially present in a source marked 'published_external', do NOT flag that content for confidential-detail rules, hyperbole rules, marketing-language-superlative rules, or named_individual_attribution_in_public_content. The content is by definition publishable because the source is already public.

- This suppression applies ONLY when the specific phrase, figure, or piece of language being flagged appears materially in the published_external source. It does NOT apply when the statement introduces new claims, new figures, or new framing beyond what the published source contains.

- For named_individual_attribution_in_public_content only, suppress ONLY when BOTH hold: (a) the individual's name appears in a published_external source, AND (b) the source uses that individual in the same role, action, or context the draft does. Do NOT suppress — keep the concern — if the draft attributes to the named individual anything the source does not: a quote, an endorsement, a forward-looking statement, a recommendation, or a role or title the source does not give them. When uncertain whether the use matches, KEEP the concern.

- This suppression does NOT apply to forward-looking-statement qualifier rules, comparative-claim-without-basis rules, selective-hedging rules, or any rule concerned with the draft's own framing or risk (as distinct from the underlying content's publishability).

- Sources marked 'restricted' or 'unknown' produce no suppression. Apply rules normally as today.

Be careful: 'published_external' means the source as a document is publicly available — it does not mean every claim within it is true, accurate, or applicable beyond the source's original context. Apply other rules normally.`;

const COMPLIANCE_PHRASE_QUOTING = `PHRASE QUOTING
When a concern points at identifiable text in the statement, quote that specific phrase in single quotes within the note field. Examples:

Good:
  "The statement 'will continue to outperform peer benchmarks' is a forward-looking claim without hedging language."

  "This sentence includes an 'EV/EBITDA multiple of 12.5x', which has the hallmarks of confidential detail in a public version."

Avoid (when a quotable phrase exists):
  "This sentence includes an EV/EBITDA multiple of 12.5x, which has the hallmarks of confidential detail..."  ← phrase identified but not quoted

Quote the phrase even when the concern is also substantively about the broader statement, as long as the issue is anchored to a specific phrase the writer could rewrite.

Exception: Omit quoting only when the concern is genuinely statement-level — i.e. it applies to the whole assertion and no specific phrase carries the issue. Examples of legitimate exceptions:

- Missing disclosure language: the issue is the absence of a disclaimer attached to the whole forward-looking claim, not a specific phrase.
- Whole-sentence stance: the issue is the overall posture of the assertion (e.g. an entire sentence reads as promotional in a context that requires neutrality), with no single phrase carrying the concern.

In all other cases, quote the specific phrase.`;

const VISIBILITY_CALIBRATION_EDITORIAL_STYLE = `VISIBILITY CALIBRATION
The visibility setting (Complete or Public) is provided in the user payload. On Public visibility, apply tighter tolerance to:
  - Register and promotional language are calibrated by the rulebook rules on both Complete and Public visibility; visibility calibration does not tighten promotional-language thresholds on Public.`;

function ctxHouseName(ctx) {
  return resolveAuthoringOrganisationName(ctx?.authoringOrganisation);
}

function styleRulesForReviewPrompt(rules) {
  const mechanical = mechanicalStyleRuleIds();
  return (Array.isArray(rules) ? rules : []).filter((rule) => {
    if (SCANNED_STYLE_RULE_IDS.has(rule?.id)) return false;
    if (mechanical.has(rule?.id)) return false;
    const kind = rule?.enforcement?.kind;
    if (kind === "auto-fix" || rule?.enforcement?.scanId) return false;
    if (rule?.id === "derived_figure") return false;
    return true;
  });
}

const COMMENTARY_CALIBRATION_CONCERN_PROSE = `COMMENTARY PROSE CALIBRATION
Apply to every note and suggestedDirection (and concernText when returned):

Source language (editorial and compliance concern prose):
- Do NOT reference the tool's evidence-selection mechanism. Never use "the evidence excerpt", "the excerpt", "the passage", or "the snippet" in concern prose.
- If a note needs to refer to source support, say "the source". This mirrors the Stage 5 evidence-commentary rule.

Register:
- For voice_consistency: describe the issue in plain terms (e.g. active voice versus passive voice). Do not rely on abstract labels like "voice consistency" without saying what the reader sees.
- Do not use "causal relationship" or "causation"; state what the statement implies (e.g. "implies X caused Y" or "treats correlation as cause").
- Do not use "uncertainty qualifier"; use "hedging language" instead.
- For marketing_language_excess: when locating substantiation, say "in the immediate context" — not "in the same or adjacent sentence".
- For unsubstantiated "leading" as a superlative market-position claim, use exactly: '"leading" is an unsubstantiated superlative; remove or substantiate.'

Framing:
- State the concern and the change. Do not add schoolroom or normative tails (e.g. "which is not appropriate for…", "which is not permissible for…").

Verbosity:
- Keep the short quoted triggering phrase from the CURRENT STATEMENT in single quotes in note and suggestedDirection — span highlighting depends on it.
- Do not restate the entire flagged sentence verbatim in suggestedDirection or concernText. State the change concisely; the quoted phrase is the locator.

Substance:
- Do not flatten substantive editorial observation. narrative_coherence and materiality notes should retain their analytic content. This calibration targets register, meta-phrasing, and full-sentence echo only.`;

const EDITORIAL_MATERIALITY_AND_INFORMATION_VALUE = `MATERIALITY AND INFORMATION-VALUE EVALUATION
For materiality and any rule that judges whether a statement "adds information" or "advances the argument":

- Flag immateriality only when the CURRENT STATEMENT adds nothing relative to surrounding DRAFT sentences — e.g. it restates a point already made in CONTEXT BEFORE or CONTEXT AFTER, introduces an incidental fact with no bearing on the draft's line of argument, or fails to advance the thesis given its position in the draft.`;

const RESPONSE_JSON_STYLE = `Return only the rules that are violated as JSON:
{
  "violations": [
    {
      "concernCode": "[rule id]",
      "note": "[one-to-two-sentence explanation]",
      "suggestedDirection": "[required — follow the violated rule's fixDirection guidance using the actual words and figures from the CURRENT STATEMENT, never bracket placeholders]",
      "concernText": "[required — one coherent prose unit that states the issue and the fix, one to two sentences]",
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
      "concernText": "[required — one coherent prose unit that states the issue and the fix, one to two sentences]",
      "suggestedRewrite": "[optional full-sentence rewrite]"
    }
  ]
}

If no rules are violated, return {"violations":[]}.

The "violations" array contains ONLY actual violations. An empty array is the correct response when the statement is compliant across all applicable rules. Do not populate the array with compliant-rule entries.

Respond with valid JSON only. No markdown, no code fences.`;

const EDITORIAL_STYLE_COMBINED_PREAMBLE = `You are a combined editorial-and-style reviewer for institutional financial writing. Evaluate one CURRENT STATEMENT against two complementary rulebooks: editorial rules (writing craft and argument quality) and style rules (mechanical and formatting conventions). Keep category discipline: editorial concerns must be tagged "editorial" and style concerns must be tagged "style_guide".`;

const RESPONSE_JSON_EDITORIAL_STYLE_COMBINED = `Return JSON only in this exact shape:
{
  "concerns": [
    {
      "category": "editorial" | "style_guide",
      "ruleId": "<rule id from the relevant section below>",
      "rule": "<same rule id — required for style_guide concerns>",
      "note": "<one-to-two-sentence explanation>",
      "suggestedDirection": "<required actionable imperative sentence>",
      "suggestedRewrite": "<optional full-sentence rewrite or empty string>"
    }
  ],
  "verdict": "clean" | "concern",
  "verdictNote": "<string or empty>"
}

Rules:
- Return ONLY actual concerns in concerns[].
- If no concerns, return {"concerns":[],"verdict":"clean","verdictNote":""}.
- Every concern MUST include category, ruleId, note, suggestedDirection.
- For style_guide concerns, also include rule (same value as ruleId).
- Category MUST match the section where ruleId appears.
- Respond with valid JSON only. No markdown, no code fences.`;

const CANONICAL_TO_RULEBOOK_OUTPUT = {
  [OUTPUT_TYPE.GENERAL_TEXT]: "general_text",
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

function withoutCausalRule(rules) {
  return (Array.isArray(rules) ? rules : []).filter((rule) => rule?.id !== CAUSAL_EVIDENCE_RULE);
}

/** B348. Output/version filter, then omit narrative_coherence unless QC_NARRATIVE_COHERENCE is on. The causal rule is no longer raised here. */
export function editorialRulesForRun(rules, outputSlug, versionSlug, env = process.env) {
  return withoutCausalRule(gateNarrativeCoherenceRules(filterRulesForRun(rules, outputSlug, versionSlug), env));
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

/** R6.12: Per-output reviewerNote (supports reviewerNoteByOutput map). */
function effectiveReviewerNote(rule, outputSlug) {
  if (!rule) return null;
  if (rule.reviewerNoteByOutput && typeof rule.reviewerNoteByOutput === "object") {
    const n = rule.reviewerNoteByOutput[outputSlug];
    if (typeof n === "string" && n.trim()) return n.trim();
  }
  if (typeof rule.reviewerNote === "string" && rule.reviewerNote.trim()) {
    return rule.reviewerNote.trim();
  }
  return null;
}

export const REQUIRED_HEDGING_LINE = "A belief or expectation marker (we believe, we expect, in our view) on a sentence about future returns, performance or outcomes is required hedging, not redundant. Never propose removing it.";

function liveActorDescription(description, houseName, outputSlug, ruleId) {
  let text = String(description || "");
  if (ruleId === "underreach_hedging" && !text.includes(REQUIRED_HEDGING_LINE)) {
    text = `${text} ${REQUIRED_HEDGING_LINE}`;
  }
  if (ruleId === "voice_consistency" && !houseVoiceIsThirdPerson(outputSlug)) {
    if (text.includes(FIRST_PERSON_ACTOR_INSTRUCTION)) {
      text = text.replace(FIRST_PERSON_ACTOR_INSTRUCTION, "").trimEnd();
    }
  }
  if (!text.includes(FIRST_PERSON_ACTOR_INSTRUCTION)) return text;
  return text.replace(FIRST_PERSON_ACTOR_INSTRUCTION, buildFirstPersonActorInstruction(houseName));
}

function formatRulesForPrompt(rules, outputSlug, kind, houseName) {
  return rules
    .map((r, i) => {
      const sev = effectiveSeverity(r, outputSlug);
      const description = r.id === "voice_consistency"
        ? "The voice appropriate for the output type is maintained throughout. Flag an unintended switch in voice within the document."
        : liveActorDescription(r.description, houseName, outputSlug, r.id);
      let block = `${i + 1}. ${r.id}: ${description.trim()}\n   severity (default): ${sev}`;
      const attachFixDirection = r.id !== "voice_consistency";
      if (kind === "editorial") {
        const scope = r.id === "narrative_coherence" ? "CURRENT + CONTEXT" : "CURRENT only";
        block += `\n   scope: ${scope}`;
        if (attachFixDirection && typeof r.fixDirection === "string" && r.fixDirection.trim()) {
          block += `\n   fixDirection: ${r.fixDirection.trim()}`;
        }
      }
      if (kind === "style" && typeof r.fixDirection === "string" && r.fixDirection.trim()) {
        block += `\n   fixDirection: ${r.fixDirection.trim()}`;
      }
      const reviewerNote =
        kind === "compliance" || kind === "editorial" ? effectiveReviewerNote(r, outputSlug) : null;
      const asksModelForFirstPerson = r.id === "voice_consistency" && /flag first person/i.test(reviewerNote || "");
      if (reviewerNote && !asksModelForFirstPerson) {
        block += `\n   reviewerNote: ${reviewerNote}`;
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

/**
 * R3.4: After assembly-time filtering of editorial concerns, recompute v4 qcCard editorialVerdict.
 * V4 combined editorial+style review stores "concern"|"clean"; uses the same severity aggregation
 * as applyMergedEditorialAndStyle, then maps any non-clean aggregate to "concern".
 *
 * @param {unknown[]} editorialConcerns
 * @param {string|undefined} outputType
 * @returns {"clean"|"concern"}
 */
export function recomputeV4EditorialVerdictFromConcerns(editorialConcerns, outputType) {
  const outputSlug = rulebookOutputSlug(normalizeOutputType(outputType));
  const styleMap = buildRuleMap(resolveStyleGuide({ outputType }));
  const editorialMap = buildRuleMap(editorialRules);
  const mergedMap = new Map([...styleMap.entries(), ...editorialMap.entries()]);
  const concerns = Array.isArray(editorialConcerns) ? editorialConcerns : [];
  const sorted = sortConcernsBySeverity(concerns, mergedMap, outputSlug);
  const agg = aggregateVerdictFromConcerns(sorted, mergedMap, outputSlug);
  return agg === "clean" ? "clean" : "concern";
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

function stripPlaceholderLeaksFromConcerns(concerns) {
  if (!Array.isArray(concerns)) return concerns;
  return concerns.map((concern) => blankPlaceholderLeaksInPublicConcern(concern));
}

function pickDisplayedField(concerns, field) {
  const picked = pickFirstConcernField(concerns, field);
  if (assertNoUnresolvedAuthoringOrganisationPlaceholder(picked)) return null;
  return picked;
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

function parseEditorialStyleCombinedPayload(raw) {
  const parsed = safeParseJsonObject(raw);
  if (!parsed || typeof parsed !== "object") return null;
  if (!Array.isArray(parsed.concerns)) return null;
  const verdict = typeof parsed.verdict === "string" ? parsed.verdict.trim() : "";
  if (verdict !== "clean" && verdict !== "concern") return null;
  const verdictNote = typeof parsed.verdictNote === "string" ? parsed.verdictNote.trim() : "";
  return { concerns: parsed.concerns, verdict, verdictNote };
}

const FALLBACK_RAW_LOG_CAP = 4000;

function truncateForFallbackLog(raw) {
  const text = typeof raw === "string" ? raw : "";
  if (text.length <= FALLBACK_RAW_LOG_CAP) return text;
  return `${text.slice(0, FALLBACK_RAW_LOG_CAP)}…[truncated ${text.length - FALLBACK_RAW_LOG_CAP} chars]`;
}

function describeCombinedParseFailure(raw) {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) return "empty_model_output";
  const parsed = safeParseJsonObject(raw);
  if (!parsed || typeof parsed !== "object") return "unparseable_json";
  if (!Array.isArray(parsed.concerns)) return "concerns_not_array";
  const verdict = typeof parsed.verdict === "string" ? parsed.verdict.trim() : "";
  if (verdict !== "clean" && verdict !== "concern") {
    return `invalid_verdict:${verdict || "(missing)"}`;
  }
  return null;
}

function describeNormalizeCombinedConcernRejection(entry, allowedStyleIds, allowedEditorialIds) {
  const statedCategory = typeof entry?.category === "string" ? entry.category.trim() : "";
  const ruleId =
    typeof entry?.ruleId === "string"
      ? entry.ruleId.trim()
      : typeof entry?.rule === "string"
        ? entry.rule.trim()
        : "";
  if (statedCategory !== "editorial" && statedCategory !== "style_guide") {
    return `invalid_category:${statedCategory || "(missing)"}`;
  }
  if (!ruleId) return "missing_ruleId";
  const inEditorial = allowedEditorialIds.has(ruleId);
  const inStyle = allowedStyleIds.has(ruleId);
  const validForStated =
    (statedCategory === "editorial" && inEditorial) ||
    (statedCategory === "style_guide" && inStyle);
  if (!validForStated) {
    if (
      (statedCategory === "editorial" && inStyle) ||
      (statedCategory === "style_guide" && inEditorial)
    ) {
      return null;
    }
    return `ruleId_not_in_either_rulebook:${ruleId}`;
  }
  const note = typeof entry?.note === "string" ? entry.note.trim() : "";
  if (!note) return `missing_note:${ruleId}`;
  const suggestedDirection =
    typeof entry?.suggestedDirection === "string" ? entry.suggestedDirection.trim() : "";
  if (!suggestedDirection) return `missing_suggestedDirection:${ruleId}`;
  return null;
}

function describeVerdictConcernZeroNormalized(concerns, allowedStyleIds, allowedEditorialIds) {
  const drops = [];
  for (const concern of concerns || []) {
    const ruleId =
      typeof concern?.ruleId === "string"
        ? concern.ruleId.trim()
        : typeof concern?.rule === "string"
          ? concern.rule.trim()
          : "";
    const reason = describeNormalizeCombinedConcernRejection(
      concern,
      allowedStyleIds,
      allowedEditorialIds
    );
    drops.push(`${ruleId || "(unknown)"}:${reason ?? "dropped"}`);
  }
  return `verdict_concern_zero_normalized[${drops.join("; ")}]`;
}

function normalizeCombinedConcern(entry, allowedStyleIds, allowedEditorialIds) {
  const statedCategory = typeof entry?.category === "string" ? entry.category.trim() : "";
  if (statedCategory !== "editorial" && statedCategory !== "style_guide") return null;
  const ruleId =
    typeof entry?.ruleId === "string"
      ? entry.ruleId.trim()
      : typeof entry?.rule === "string"
        ? entry.rule.trim()
        : "";
  if (!ruleId) return null;

  const inEditorial = allowedEditorialIds.has(ruleId);
  const inStyle = allowedStyleIds.has(ruleId);
  const validForStated =
    (statedCategory === "editorial" && inEditorial) ||
    (statedCategory === "style_guide" && inStyle);

  let category = statedCategory;
  if (!validForStated) {
    if (statedCategory === "editorial" && inStyle) {
      category = "style_guide";
    } else if (statedCategory === "style_guide" && inEditorial) {
      category = "editorial";
    } else {
      return null;
    }
  }

  const note = typeof entry?.note === "string" ? entry.note.trim() : "";
  if (!note) return null;
  const suggestedDirection =
    typeof entry?.suggestedDirection === "string" ? entry.suggestedDirection.trim() : "";
  if (!suggestedDirection) return null;
  const out = {
    concernCode: ruleId,
    note,
    category,
    suggestedDirection,
  };
  if (category === "style_guide") {
    out.rule = ruleId;
  }
  if (entry.suggestedRewrite != null && String(entry.suggestedRewrite).trim() !== "") {
    out.suggestedRewrite = String(entry.suggestedRewrite).trim();
  }
  return out;
}

/** R6.11a: Mechanical retry hint when attempt 1 had category/ruleId mismatches. */
function buildCombinedRetryCorrectionNote(concerns, allowedStyleIds, allowedEditorialIds) {
  const seen = new Set();
  const lines = [];
  for (const entry of concerns || []) {
    const stated = typeof entry?.category === "string" ? entry.category.trim() : "";
    const ruleId =
      typeof entry?.ruleId === "string"
        ? entry.ruleId.trim()
        : typeof entry?.rule === "string"
          ? entry.rule.trim()
          : "";
    if (!ruleId) continue;
    const inStyle = allowedStyleIds.has(ruleId);
    const inEditorial = allowedEditorialIds.has(ruleId);
    let line = null;
    if (stated === "editorial" && !inEditorial && inStyle) {
      line = `Rule '${ruleId}' is a style_guide rule, not editorial.`;
    } else if (stated === "style_guide" && !inStyle && inEditorial) {
      line = `Rule '${ruleId}' is an editorial rule, not style_guide.`;
    }
    if (line && !seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  if (lines.length === 0) return "";
  return `${lines.join(" ")} Return corrected JSON in the required shape.`;
}

const STATEMENT_CUES = [
  "the statement",
  "in the statement",
  "statement uses",
  "statement says",
  "statement mentions",
  "the sentence uses",
  "in the sentence",
  "phrase in the statement",
];

const EVIDENCE_CUES = [
  "the source",
  "in the source",
  "source says",
  "source states",
  "source gives",
  "the evidence",
  "in the evidence",
  "the excerpt",
  "in the excerpt",
  "evidence provides",
  "evidence shows",
];

function collapseWhitespace(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function normalizeApostrophes(text) {
  return String(text ?? "").replace(/[\u2018\u2019]/g, "'");
}

function normalizeQuotesForExtraction(text) {
  return String(text ?? "").replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
}

function extractQuotedSnippets(text, field) {
  const normalized = normalizeQuotesForExtraction(text);
  const rx = /(["'])([^"']+)\1/g;
  const out = [];
  let m;
  while ((m = rx.exec(normalized))) {
    const quote = collapseWhitespace(m[2]);
    if (!quote) continue;
    const context = normalized
      .slice(Math.max(0, m.index - 120), Math.min(normalized.length, rx.lastIndex + 120))
      .toLowerCase();
    out.push({ quote, context, field });
  }
  return out;
}

function hasCue(context, cues) {
  return cues.some((cue) => context.includes(cue));
}

function quoteInText(quote, text) {
  const q = collapseWhitespace(normalizeApostrophes(quote));
  const t = collapseWhitespace(normalizeApostrophes(text));
  if (!q || !t) return false;
  return t.includes(q);
}

/**
 * A8.30: Deterministic quote/source fidelity gate on LLM concerns.
 * @param {{ concern: object, statementText: string, evidenceExcerpt: string|null }} args
 * @returns {{ pass: boolean, reason?: string }}
 */
function isPercentageNotationSymbolQuote(concern, quote, statementText) {
  const code =
    typeof concern?.concernCode === "string"
      ? concern.concernCode
      : typeof concern?.rule === "string"
        ? concern.rule
        : "";
  if (code !== "percentage_notation" || !/%/.test(quote)) return false;
  return /\d[\d.,]*\s+percent\b/i.test(String(statementText || ""));
}

export function verifyFidelity({ concern, statementText, evidenceExcerpt }) {
  const note = typeof concern?.note === "string" ? concern.note : "";
  const direction = typeof concern?.suggestedDirection === "string" ? concern.suggestedDirection : "";
  const snippets = [
    ...extractQuotedSnippets(note, "note"),
    ...extractQuotedSnippets(direction, "suggestedDirection"),
  ];

  for (const s of snippets) {
    const statementAssociated = hasCue(s.context, STATEMENT_CUES);
    const evidenceAssociated = hasCue(s.context, EVIDENCE_CUES);
    if (!statementAssociated && !evidenceAssociated) continue;

    if (statementAssociated && !quoteInText(s.quote, statementText)) {
      if (isPercentageNotationSymbolQuote(concern, s.quote, statementText)) continue;
      return { pass: false, reason: `quote '${s.quote}' cited as statement phrase not found in statement` };
    }

    if (evidenceAssociated) {
      if (typeof evidenceExcerpt !== "string" || !evidenceExcerpt.trim()) {
        return { pass: false, reason: `quote '${s.quote}' cited as source figure not found in excerpt` };
      }
      if (!quoteInText(s.quote, evidenceExcerpt)) {
        return { pass: false, reason: `quote '${s.quote}' cited as source figure not found in excerpt` };
      }
    }
  }

  return { pass: true };
}

const MIN_CONCERN_SPAN_PHRASE_LENGTH = 4;

/**
 * R5.1: Locate a quoted phrase in statement text (case-insensitive; earliest match).
 * @returns {{ startChar: number, endChar: number } | null}
 */
function findPhraseSpanInStatement(phrase, statementText) {
  const needle = collapseWhitespace(normalizeApostrophes(phrase));
  if (!needle || needle.length < MIN_CONCERN_SPAN_PHRASE_LENGTH) return null;
  if (typeof statementText !== "string" || !statementText) return null;
  const lowerHay = statementText.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const startChar = lowerHay.indexOf(lowerNeedle);
  if (startChar < 0) return null;
  return { startChar, endChar: startChar + needle.length };
}

function dedupeIdenticalSpans(spans) {
  const seen = new Set();
  const out = [];
  for (const s of spans) {
    const key = `${s.startChar}:${s.endChar}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * R5.1 / R5.2: Derive character spans for a concern from quoted phrases in note / suggestedDirection.
 * Multiple quoted phrases yield multiple spans (deduped by startChar+endChar).
 * @param {{ concern: object, statementText: string }} args
 * @returns {Array<{ startChar: number, endChar: number, source: string }> | null}
 */
export function deriveConcernSpan({ concern, statementText }) {
  try {
    if (!concern || typeof statementText !== "string" || !statementText) return null;
    const note = typeof concern.note === "string" ? concern.note : "";
    const direction = typeof concern.suggestedDirection === "string" ? concern.suggestedDirection : "";
    const spans = [];

    for (const { quote } of extractQuotedSnippets(note, "note")) {
      const match = findPhraseSpanInStatement(quote, statementText);
      if (match) spans.push({ ...match, source: "note_quote" });
    }
    for (const { quote } of extractQuotedSnippets(direction, "suggestedDirection")) {
      const match = findPhraseSpanInStatement(quote, statementText);
      if (match) spans.push({ ...match, source: "direction_quote" });
    }
    if (spans.length === 0) return null;
    return dedupeIdenticalSpans(spans);
  } catch {
    return null;
  }
}

function concernHasSpanField(concern) {
  const span = concern?.span;
  if (!span) return false;
  if (Array.isArray(span)) return span.length > 0;
  return Number.isFinite(span.startChar) && Number.isFinite(span.endChar);
}

function countConcernSpans(concern) {
  const span = concern?.span;
  if (!span) return 0;
  if (Array.isArray(span)) return span.length;
  if (Number.isFinite(span.startChar) && Number.isFinite(span.endChar)) return 1;
  return 0;
}

function attachConcernSpans(concerns, statementText) {
  if (!Array.isArray(concerns)) return concerns;
  return concerns.map((concern) => {
    try {
      const span = deriveConcernSpan({ concern, statementText });
      if (span) return { ...concern, span };
      return concern;
    } catch {
      return concern;
    }
  });
}

// Deterministic backstops for style rules where the LLM unreliably
// evaluates a structurally-checkable property. Each entry is a
// predicate that returns TRUE to KEEP the concern, FALSE to DROP it.
//
// LLM-last architecture: rule wording is the primary instruction;
// these filters catch the residual error rate where the property is
// deterministically checkable.
function noteReviewSpend(spend, provider, model, completion) {
  if (!spend || typeof spend !== "object") return;
  const usage = completion?.usage && typeof completion.usage === "object" ? completion.usage : {};
  const cost = calculateLlmCostUsd(provider, model, usage);
  spend.calls += 1;
  spend.inputTokens += Number(usage.inputTokens) || 0;
  spend.outputTokens += Number(usage.outputTokens) || 0;
  spend.cachedInputTokens += Number(usage.cachedInputTokens) || 0;
  spend.costUsd += Number(cost) || 0;
  spend.listUsd += Number(cost) || 0;
}

function excerptText(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.passage === "string") return value.passage;
  return "";
}

function phraseInExcerpt(phrase, excerpt) {
  const left = normalizePassageForComparison(phrase).toLowerCase();
  const right = normalizePassageForComparison(excerpt).toLowerCase();
  if (!left || !right) return false;
  return right.includes(left);
}

/**
 * Drop a forward-looking concern only when its span is already in the
 * primary excerpt or the conflict excerpt. Nothing else is touched.
 */
export function dropForwardLookingInExcerpt(concerns, { statementText, primaryExcerpt, conflictExcerpt } = {}) {
  const list = Array.isArray(concerns) ? concerns : [];
  const statement = typeof statementText === "string" ? statementText : "";
  const primary = excerptText(primaryExcerpt);
  const conflict = excerptText(conflictExcerpt);
  const kept = [];
  const dropped = [];
  for (const concern of list) {
    const rule = typeof concern?.concernCode === "string" && concern.concernCode.trim()
      ? concern.concernCode.trim()
      : typeof concern?.rule === "string"
        ? concern.rule.trim()
        : "";
    if (rule !== "forward_looking_statement_without_qualifier") {
      kept.push(concern);
      continue;
    }
    const span = Array.isArray(concern?.span) ? concern.span[0] : concern?.span;
    const start = Number(span?.startChar);
    const end = Number(span?.endChar);
    const phrase = Number.isInteger(start) && Number.isInteger(end) ? statement.slice(start, end) : "";
    if (phrase && (phraseInExcerpt(phrase, primary) || phraseInExcerpt(phrase, conflict))) {
      console.info(`[compliance] forward_looking_statement_without_qualifier dropped, span ${JSON.stringify(phrase)}`);
      dropped.push(concern);
      continue;
    }
    kept.push(concern);
  }
  return { concerns: kept, dropped };
}

const MONTH_INDEX = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function allDateParts(value) {
  const text = String(value || "");
  const found = [];
  const named = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+((?:19|20)\d{2})\b/gi;
  for (const match of text.matchAll(named)) {
    found.push({ month: MONTH_INDEX[match[1].toLowerCase()], year: Number(match[2]) });
  }
  const iso = /\b((?:19|20)\d{2})-(\d{2})(?:-\d{2})?\b/g;
  for (const match of text.matchAll(iso)) {
    const month = Number(match[2]) - 1;
    if (month >= 0 && month <= 11) found.push({ year: Number(match[1]), month });
  }
  return found;
}

function concernRule(concern) {
  if (typeof concern?.concernCode === "string" && concern.concernCode.trim()) return concern.concernCode.trim();
  if (typeof concern?.rule === "string" && concern.rule.trim()) return concern.rule.trim();
  if (typeof concern?.code === "string" && concern.code.trim()) return concern.code.trim();
  return "";
}

function treatsAsPrediction(concern) {
  const rule = concernRule(concern);
  const note = [concern?.note, concern?.concernText, concern?.text]
    .filter((part) => typeof part === "string")
    .join(" ");
  if (/forward[_-]?looking|prediction/i.test(rule)) return true;
  if (/\bprediction\b|forward[- ]looking|future outcome|without hedging/i.test(note)) return true;
  return false;
}

function predictionBasis(concern, statement) {
  const spans = Array.isArray(concern?.span) ? concern.span : concern?.span ? [concern.span] : [];
  const pieces = [];
  if (statement) pieces.push(statement);
  for (const span of spans) {
    const start = Number(span?.startChar);
    const end = Number(span?.endChar);
    if (statement && Number.isInteger(start) && Number.isInteger(end) && end > start) {
      pieces.push(statement.slice(start, end));
    }
    if (typeof span?.text === "string" && span.text.trim()) pieces.push(span.text);
  }
  return pieces.join(" ");
}

function datesAreOnOrBefore(dates, ref) {
  if (!dates.length || !ref) return false;
  const later = dates.some((row) => row.year > ref.year || (row.year === ref.year && row.month > ref.month));
  if (later) return false;
  return dates.every((row) => row.year < ref.year || (row.year === ref.year && row.month <= ref.month));
}

const HEDGE_VERB = /\b(?:will|expect|forecast|anticipat|plan to|may|might|could)\b/i;
const ADDED_HEDGE = [/\bis expected to\b/i, /\bmay\b/i, /\bwill\b/i];

function introducesHedge(text, statement) {
  const value = String(text || "");
  if (!value.trim()) return false;
  if (/\badd hedging\b/i.test(value)) return true;
  return ADDED_HEDGE.some((pattern) => pattern.test(value) && !pattern.test(statement));
}

function withoutHedgeOffer(concern, statement) {
  const rewrite = typeof concern?.suggestedRewrite === "string" ? concern.suggestedRewrite : "";
  const direction = typeof concern?.suggestedDirection === "string" ? concern.suggestedDirection : "";
  const rewriteAdds = introducesHedge(rewrite, statement);
  const directionAdds = introducesHedge(direction, statement);
  if (!rewriteAdds && !directionAdds) return concern;
  const next = { ...concern };
  if (rewriteAdds) delete next.suggestedRewrite;
  if (directionAdds) delete next.suggestedDirection;
  console.info("[compliance] hedging proposal dropped for a date on or before the reference date");
  return next;
}

/**
 * The document date, from the draft header, then a source date. Empty when
 * none is written down. The caller logs and uses today.
 */
export function documentReferenceDate(draftText, sources) {
  const fromDraft = extractSourceAsOfDate(typeof draftText === "string" ? draftText : "");
  if (fromDraft?.raw) return fromDraft.raw.trim();
  for (const source of Array.isArray(sources) ? sources : []) {
    if (source && typeof source === "object") {
      if (typeof source.date === "string" && source.date.trim()) return source.date.trim();
      if (typeof source.asOf === "string" && source.asOf.trim()) return source.asOf.trim();
    }
    const text = typeof source === "string" ? source : source?.text || "";
    const found = extractSourceAsOfDate(text);
    if (found?.raw) return found.raw.trim();
  }
  return "";
}

function referenceParts(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) - 1 };
  const named = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+((?:19|20)\d{2})\b/i);
  if (named) return { year: Number(named[2]), month: MONTH_INDEX[named[1].toLowerCase()] };
  return null;
}

/**
 * A prediction or forward-looking flag whose only basis is a date on or
 * before the document's reference date is dropped, whatever its code. A
 * later date, or a hedge-worthy verb in the statement, is kept. A proposal
 * that adds hedging to a past-dated event is not offered. A missing
 * reference date is logged and today is used. A missing statement is logged
 * and nothing is dropped.
 */
export function dropDatedForwardLooking(concerns, { statementText, referenceDate } = {}) {
  const list = Array.isArray(concerns) ? concerns : [];
  const statement = typeof statementText === "string" ? statementText : "";
  if (!statement) {
    console.error("[compliance] statement text is missing; dated prediction flags were not dropped");
    return { concerns: list.slice(), dropped: [] };
  }
  let ref = referenceParts(referenceDate);
  if (!ref) {
    console.error("[compliance] reference date is missing; today is the reference");
    const today = new Date();
    ref = { year: today.getFullYear(), month: today.getMonth() };
  }
  const kept = [];
  const dropped = [];
  for (const concern of list) {
    const basis = predictionBasis(concern, statement);
    const past = datesAreOnOrBefore(allDateParts(basis), ref);
    const hedgeVerb = HEDGE_VERB.test(basis);
    if (treatsAsPrediction(concern) && past && !hedgeVerb) {
      console.info("[compliance] forward-looking date on or before the reference date was dropped");
      dropped.push(concern);
      continue;
    }
    kept.push(past ? withoutHedgeOffer(concern, statement) : concern);
  }
  return { concerns: kept, dropped };
}

function settleDatedPredictions(card, sentenceText, referenceDate) {
  if (!card || typeof card !== "object") return;
  const dated = dropDatedForwardLooking(card.complianceConcerns, {
    statementText: sentenceText,
    referenceDate,
  });
  card.complianceConcerns = dated.concerns;
  if (dated.dropped.length > 0 && dated.concerns.length === 0 && card.complianceVerdict !== "not_reviewed") {
    card.complianceVerdict = "clean";
    card.complianceNote = "No caution concerns identified under the listed rules.";
    card.complianceSuggestedDirection = null;
    card.complianceSuggestedRewrite = null;
    return;
  }
  const rewrite = dated.concerns
    .map((row) => (typeof row?.suggestedRewrite === "string" ? row.suggestedRewrite.trim() : ""))
    .find(Boolean) || null;
  const direction = dated.concerns
    .map((row) => (typeof row?.suggestedDirection === "string" ? row.suggestedDirection.trim() : ""))
    .find(Boolean) || null;
  card.complianceSuggestedRewrite = rewrite;
  card.complianceSuggestedDirection = direction;
}

const STYLE_RULE_DETERMINISTIC_FILTERS = {
  active_voice_preference: (citedSpan) => {
    if (spanIsPassive(citedSpan)) return true;
    console.log(`[STYLE_FILTER] active_voice_preference dropped, ${citedSpan}`);
    return false;
  },
  oxford_comma: () => {
    console.log("[style_guide] oxford_comma model concern dropped; the scan is the detector");
    return false;
  },
  english_variant: (citedSpan, _statementText, _full, ctx) => {
    if (ctx?.houseStyle?.spelling === "UK") {
      const american = /\b(organize|organized|color|colors|behavior|center|realize|realize[sd]|realizing|recognize|defense|program|programs|neighbor|neighbors)\b/i;
      if (american.test(citedSpan)) return true;
      console.log("[style_guide] english_variant concern dropped by deterministic filter (UK spelling, no US form in the span)");
      return false;
    }
    const BRITISH_PATTERNS = [
      /\b\w*ise\b/i,
      /\b\w*ised\b/i,
      /\b\w*ising\b/i,
      /\b\w*isation\b/i,
      /\b\w*our\b/i,
      /\b\w*ours\b/i,
      /\b\w*oured\b/i,
      /\b\w*ouring\b/i,
      /\bcentre\b/i,
      /\bcentres\b/i,
      /\btheatre\b/i,
      /\blitre\b/i,
      /\bmetre\b/i,
      /\bdefence\b/i,
      /\boffence\b/i,
      /\blicence\b/i,
      /\bgrey\b/i,
      /\bjudgement\b/i,
      /\bcheque\b/i,
      /\btravelled\b/i,
      /\btravelling\b/i,
      /\bcancelled\b/i,
      /\bcancelling\b/i,
      /\bmodelled\b/i,
      /\bmodelling\b/i,
      /\blabelled\b/i,
      /\blabelling\b/i,
      /\bwhilst\b/i,
      /\bamongst\b/i,
      /\btowards\b/i,
      /\bprogramme\b/i,
      /\bprogrammes\b/i,
      /\bneighbour\b/i,
      /\bneighbours\b/i,
      /\brealisation\b/i,
      /\brealisations\b/i,
    ];
    const US_ALLOWLIST = /\b(rise|wise|advise|exercise|promise|surprise|supervise|comprise|devise|revise|enterprise|franchise|merchandise|disguise|despise|chastise|paradise|expertise|otherwise|likewise)\b/i;
    const hasBritish = BRITISH_PATTERNS.some((re) => re.test(citedSpan));
    if (hasBritish && !US_ALLOWLIST.test(citedSpan)) {
      return true;
    }
    console.log(
      `[style_guide] english_variant concern dropped by deterministic filter ` +
        `(cited span "${citedSpan}" contains no British English spelling)`
    );
    return false;
  },
  date_format: (citedSpan, statementText) => {
    const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)";
    const judged = String(citedSpan || "").trim() || String(statementText || "");
    const full = new RegExp(`\\b\\d{1,2}\\s+${MONTH}\\s+\\d{4}\\b`, "i");
    const monthYear = new RegExp(`\\b${MONTH}\\s+\\d{4}\\b`, "i");
    const dayAfter = new RegExp(`\\b${MONTH}\\s+\\d{1,2}\\b`, "i");
    const dayBefore = new RegExp(`\\b\\d{1,2}\\s+${MONTH}\\b`, "i");
    const numeric = /\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\b\d{4}-\d{2}-\d{2}\b/;
    const monthAndYearOnly = monthYear.test(judged) && !dayBefore.test(judged) && !dayAfter.test(judged) && !numeric.test(judged);
    if (full.test(judged) || monthAndYearOnly) {
      console.log(
        `[style_guide] date_format concern dropped by deterministic filter ` +
          `(cited span "${citedSpan}" is a full date or a month and year with no day)`
      );
      return false;
    }
    return true;
  },
  number_spelling: () => {
    console.log("[style_guide] number_spelling model concern dropped; the scan is the detector");
    return false;
  },
  percentage_notation: () => {
    console.log(
      "[style_guide] percentage_notation model concern dropped; the scan is the detector"
    );
    return false;
  },
  thousand_separator: (citedSpan, statementText, _full, ctx) => {
    const cited = String(citedSpan || "").trim();
    const judged = cited || String(statementText || "");
    if (!/\d[,'.\u2019\u2018]\d{3}(?!\d)/.test(judged)) {
      console.log(
        `[style_guide] thousand_separator concern dropped by deterministic filter ` +
          `(cited figure contains no thousands separator character)`
      );
      return false;
    }
    const fullText = String(statementText || "");
    const hasApostropheSeparator = /\d['\u2019]\d{3}/.test(fullText);
    const hasCommaSeparator = /\d,\d{3}/.test(fullText);
    if (ctx?.houseStyle?.thousands === "comma") {
      if (hasCommaSeparator && !hasApostropheSeparator) {
        console.log("[style_guide] thousand_separator concern dropped by deterministic filter (statement uses a comma separator, which this account chose)");
        return false;
      }
      return true;
    }
    if (hasApostropheSeparator && !hasCommaSeparator) {
      console.log(
        `[style_guide] thousand_separator concern dropped by deterministic filter ` +
          `(statement uses apostrophe separator throughout — already correct)`
      );
      return false;
    }
    return true;
  },
  currency_format: (citedSpan, statementText) => {
    const fullText = String(statementText || "");
    const ISO_BEFORE_AMOUNT = /\b[A-Z]{3}\s+\d/;
    const SYMBOL_PREFIX = /[\$\u20ac\u00a3\u00a5]\s?\d/;
    const SUFFIX_CODE = /\d\s+[A-Z]{3}\b/;
    const hasIsoBefore = ISO_BEFORE_AMOUNT.test(fullText);
    const hasSymbolPrefix = SYMBOL_PREFIX.test(fullText);
    const hasSuffixCode = SUFFIX_CODE.test(fullText);
    if (hasIsoBefore && !hasSymbolPrefix && !hasSuffixCode) {
      console.log(
        `[style_guide] currency_format concern dropped by deterministic filter ` +
          `(statement uses ISO 4217 code before amount throughout — already correct)`
      );
      return false;
    }
    return true;
  },
  first_person_plural: () => {
    console.log(
      "[style_guide] first_person_plural model concern dropped; the scan is the detector"
    );
    return false;
  },
  voice_consistency: (citedSpan, statementText, _fullDraftText, ctx) => {
    const statement = String(statementText || "");
    if (findingClaimsFirstPersonMisuse(ctx?.concern) && statementHasFirstPersonPronoun(statement)) {
      console.log(
        "[style_guide] voice_consistency first-person model concern dropped; the scan is the detector"
      );
      return false;
    }
    if (!houseVoiceIsThirdPerson(ctx?.outputType)) return true;
    if (!findingClaimsFirstPersonMisuse(ctx?.concern)) return true;
    const text = String(citedSpan || statement);
    if (!statementHasFirstPersonPronoun(text)) {
      console.log(
        `[style_guide] voice_consistency concern dropped by deterministic filter ` +
          `(cited span "${String(citedSpan || "").slice(0, 120)}" contains no first-person-plural pronoun)`
      );
      return false;
    }
    return true;
  },
  defined_term_capitalisation: (citedSpan, _statementText, fullDraftText) => {
    const TERM_NOUNS = [
      "Company",
      "Fund",
      "Investment",
      "Sponsor",
      "Group",
      "Partnership",
      "Manager",
      "Adviser",
      "Issuer",
      "Borrower",
    ];
    const trimmed = citedSpan.trim();
    const termMatch = trimmed.match(new RegExp(`\\b(${TERM_NOUNS.join("|")})\\b`, "i"));
    if (!termMatch) return true;
    const term = termMatch[1];
    const canonicalTerm = TERM_NOUNS.find((t) => t.toLowerCase() === term.toLowerCase());
    if (!canonicalTerm) return true;

    const fullText = String(fullDraftText || "");
    const definitionPattern = new RegExp(
      `\\(\\s*(?:the\\s+)?["']?${canonicalTerm}["']?\\s*\\)`,
      "i"
    );
    const isDefined = definitionPattern.test(fullText);

    if (!isDefined) {
      console.log(
        `[style_guide] defined_term_capitalisation concern dropped — ` +
          `"${canonicalTerm}" is not defined in the draft, rule does not apply`
      );
      return false;
    }

    const hasCorrectCapitalisedNoun = new RegExp(`\\b${canonicalTerm}\\b`).test(trimmed);

    if (hasCorrectCapitalisedNoun) {
      console.log(
        `[style_guide] defined_term_capitalisation concern dropped — ` +
          `cited span "${trimmed}" already uses correct capitalised noun "${canonicalTerm}"`
      );
      return false;
    }

    return true;
  },
  smart_quotes: (_citedSpan, statementText) => {
    const text = String(statementText || "");
    if (/[\u201C\u201D\u2018\u2019]/.test(text)) return true;
    console.log(
      `[style_guide] smart_quotes concern dropped by deterministic filter ` +
        `(statement contains no curly quotation marks)`
    );
    return false;
  },
  em_dash: () => {
    console.log("[style_guide] em_dash model concern dropped; the scan is the detector");
    return false;
  },
  magnitude: () => {
    console.log("[style_guide] magnitude model concern dropped; the scan is the detector");
    return false;
  },
  derived_figure: () => {
    console.log("[style_guide] derived_figure concern dropped; linking a figure is drafting guidance");
    return false;
  },
};

const STYLE_RULE_STATEMENT_SCOPED = new Set([
  "derived_figure",
  "thousand_separator",
  "currency_format",
  "smart_quotes",
  "em_dash",
  "date_format",
]);

// A "replace X with Y" direction for these rules is SUPPOSED to look
// like a no-op: the whole violation lives in characters that quote and
// apostrophe normalisation removes. Never judge them as no-ops.
const NO_OP_DETECTION_EXEMPT_RULES = new Set([
  "smart_quotes",
  "em_dash",
  "thousand_separator",
]);

/** True when the cited span is a fiscal/calendar quarter label (Qn, Qn YYYY, nQ, n quarter). */
export function isQuarterNotationSpan(citedSpan) {
  const t = String(citedSpan || "").trim();
  if (!t) return false;
  const core =
    "(?:Q[1-4](?:\\s*\\d{2,4})?|[1-4]Q(?:\\d{2,4})?|" +
    "(?:[1-4](?:st|nd|rd|th)?|(?:first|second|third|fourth))\\s+quarters?(?:\\s+\\d{4})?)";
  return new RegExp(`^(?:(?:in|for|of|during)\\s+)?${core}$`, "i").test(t);
}

function normalizeWs(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

export function suppressNoOpSuggestions(concerns, statementText) {
  if (!Array.isArray(concerns)) return concerns;
  const stmtNorm = normalizeWs(statementText);
  return concerns.filter((c) => {
    const rewrite = typeof c?.suggestedRewrite === "string" ? c.suggestedRewrite : "";
    if (rewrite && normalizeWs(rewrite) === stmtNorm) {
      console.log(
        `[style_guide] concern dropped — suggestedRewrite is identical to source text ` +
          `(rule=${c?.concernCode || c?.rule || "unknown"})`
      );
      return false;
    }
    return true;
  });
}

const NO_CHANGE_DIRECTION_RE = /^no\s+chang(e|es)\s+(is\s+|are\s+)?(needed|required)\b/i;

function replacePairsAreAllNoOp(direction) {
  const text = collapseWhitespace(direction);
  if (!/\breplace\b/i.test(text) || !/\bwith\b/i.test(text)) return false;
  const snippets = extractQuotedSnippets(direction, "suggestedDirection");
  if (snippets.length < 2) return false;
  const pairs = [];
  for (let i = 0; i + 1 < snippets.length; i += 2) {
    pairs.push({
      from: collapseWhitespace(normalizeApostrophes(snippets[i].quote)),
      to: collapseWhitespace(normalizeApostrophes(snippets[i + 1].quote)),
    });
  }
  return pairs.length > 0 && pairs.every((p) => p.from === p.to);
}

const EVIDENCE_LANGUAGE_RULES = new Set(["underreach_hedging"]);
const EVIDENCE_LANGUAGE_RE = /\b(?:evidence|source|supported|unsupported|substantiat)/i;

export function suppressEvidenceLanguageConcerns(concerns) {
  if (!Array.isArray(concerns)) return concerns;
  return concerns.filter((c) => {
    const ruleId = typeof c?.rule === "string" ? c.rule : typeof c?.concernCode === "string" ? c.concernCode : "";
    if (!EVIDENCE_LANGUAGE_RULES.has(ruleId)) return true;
    const note = typeof c?.note === "string" ? c.note : "";
    const direction = typeof c?.suggestedDirection === "string" ? c.suggestedDirection : "";
    if (!EVIDENCE_LANGUAGE_RE.test(note) && !EVIDENCE_LANGUAGE_RE.test(direction)) return true;
    console.log(
      `[editorial] ${ruleId} concern dropped by deterministic filter ` +
        `(rule=${c?.concernCode || c?.rule || "unknown"})`
    );
    return false;
  });
}

export function suppressNoChangeDirections(concerns) {
  if (!Array.isArray(concerns)) return concerns;
  return concerns.filter((c) => {
    const ruleId = typeof c?.rule === "string" ? c.rule : typeof c?.concernCode === "string" ? c.concernCode : "";
    const direction = typeof c?.suggestedDirection === "string" ? c.suggestedDirection : "";
    const trimmed = collapseWhitespace(direction);
    const noChangeAdvice = NO_CHANGE_DIRECTION_RE.test(trimmed);
    // Deeper fix, out of scope: compare raw text before normalisation.
    // That needs the extractor to preserve offsets (B133), not a new
    // helper here. Exempt character-content rules from (b) instead.
    const identicalReplace = NO_OP_DETECTION_EXEMPT_RULES.has(ruleId)
      ? false
      : replacePairsAreAllNoOp(direction);
    if (!noChangeAdvice && !identicalReplace) return true;
    console.log(
      `[style_guide] concern dropped — suggestedDirection changes nothing ` +
        `(rule=${c?.concernCode || c?.rule || "unknown"})`
    );
    return false;
  });
}

function findingClaimsFirstPersonMisuse(concern) {
  const blob = [concern?.note, concern?.suggestedDirection, concern?.concernText]
    .map((s) => String(s || ""))
    .join(" ");
  return /\bfirst[- ]person\b/i.test(blob);
}

export function applyDeterministicStyleFilters(concerns, statementText, fullDraftText, options) {
  if (!Array.isArray(concerns)) return concerns;
  if (isExpectedPlaceholderStatement(statementText)) {
    console.log("[style_guide] concerns dropped; the statement is an expected placeholder");
    return [];
  }
  const outputType = options?.outputType;
  return concerns.filter((c) => {
    const ruleId = typeof c?.rule === "string" ? c.rule : typeof c?.concernCode === "string" ? c.concernCode : "";
    if (!ruleId) return true;
    if (ruleId === "oxford_comma" || ruleId === "number_spelling") {
      console.log(`[style_guide] ${ruleId} model concern dropped; the scan is the detector`);
      return false;
    }
    const filter = STYLE_RULE_DETERMINISTIC_FILTERS[ruleId];
    if (!filter) return true;
    const ctx = { outputType, concern: c, houseStyle: options?.houseStyle };
    const spans = Array.isArray(c.span) ? c.span : [];
    const firstSpan = spans[0];
    if (
      !firstSpan ||
      typeof firstSpan.startChar !== "number" ||
      typeof firstSpan.endChar !== "number"
    ) {
      if (STYLE_RULE_STATEMENT_SCOPED.has(ruleId)) {
        return filter("", statementText, fullDraftText, ctx);
      }
      return true;
    }
    const cited = String(statementText || "").slice(firstSpan.startChar, firstSpan.endChar);
    return filter(cited, statementText, fullDraftText, ctx);
  });
}

function applyFidelityGate({ violations, reviewer, statementIndex, statementText, evidenceExcerpt, card, drop = true }) {
  const list = Array.isArray(violations) ? violations : [];
  const kept = [];
  const dropped = [];
  for (const concern of list) {
    const check = verifyFidelity({ concern, statementText, evidenceExcerpt });
    if (check.pass) {
      kept.push(concern);
      continue;
    }
    const rule = typeof concern?.concernCode === "string" && concern.concernCode.trim() ? concern.concernCode.trim() : "(unknown)";
    const why = check.reason || "failed fidelity check";
    if (!drop) {
      console.log(
        `[FIDELITY_KEPT] statementIndex=${statementIndex} reviewer=${reviewer} rule=${rule} reason="${why}"`
      );
      kept.push(concern);
      continue;
    }
    console.log(
      `[FIDELITY_DROP] statementIndex=${statementIndex} reviewer=${reviewer} rule=${rule} reason="${why}"`
    );
    const record = dropRecord("fidelity", `${reviewer}: ${why}`, concernContent(concern) || rule);
    if (record) dropped.push(record);
  }
  if (dropped.length && card && typeof card === "object") {
    card.silences = [
      ...(Array.isArray(card.silences) ? card.silences : []),
      { id: "fidelity", reason: "dropped", count: dropped.length, content: dropped.map((row) => row.content) },
    ];
    card.drops = [...(Array.isArray(card.drops) ? card.drops : []), ...dropped];
  }
  return kept;
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
  if (entry.concernText != null && String(entry.concernText).trim() !== "") {
    out.concernText = String(entry.concernText).trim();
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

/** A8.24: Stage-4-style primary excerpt string for Editorial checks, or null. */
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

const EDITORIAL_OUTPUT_TYPE_CALIBRATION_INSTRUCTION =
  "Apply output-type calibration below when judging editorial rules. Do not impose reporting-commentary or investor-letter norms on social or short formats.";

/**
 * R6.12 — per-type editorial voice/register calibration (prompt text only).
 * @param {string|undefined|null} outputType — canonical OUTPUT_TYPE enum or slug
 * @returns {string} Calibration block, or "" when type is unknown
 */
function buildEditorialOutputTypeCalibration(outputType) {
  if (outputType == null || (typeof outputType === "string" && !outputType.trim())) {
    return "";
  }
  const ot = normalizeOutputType(outputType);
  switch (ot) {
    case OUTPUT_TYPE.LINKEDIN_POST:
      return `${EDITORIAL_OUTPUT_TYPE_CALIBRATION_INSTRUCTION}

OUTPUT TYPE CALIBRATION (LinkedIn post): The firm is we, in the first person plural. Do not accept a first-person singular author voice or a third-person firm subject as the firm's voice. Hooks and openers such as "Excited to see" are acceptable register. Name-plus-relative-clause fragments and short list-style lines are acceptable structure. Standard qualitative descriptors ("strong", "substantial", "high-quality") are not promotional excess. Still flag genuine faults: unsupported claims, real incoherence, run-ons, internal contradictions.`;
    case OUTPUT_TYPE.PRESS_RELEASE:
      return `${EDITORIAL_OUTPUT_TYPE_CALIBRATION_INSTRUCTION}

OUTPUT TYPE CALIBRATION (Press release): Expect a strong factual lede up top; formal register; quote and attribution structure is normal.`;
    case OUTPUT_TYPE.INVESTOR_LETTER:
      return `${EDITORIAL_OUTPUT_TYPE_CALIBRATION_INSTRUCTION}

OUTPUT TYPE CALIBRATION (Investor letter): Salutation and narrative-arc norms apply; measured register; judge buried lede and structure strictly (current institutional default).`;
    case OUTPUT_TYPE.REPORTING_COMMENTARY:
      return `${EDITORIAL_OUTPUT_TYPE_CALIBRATION_INSTRUCTION}

OUTPUT TYPE CALIBRATION (Reporting commentary): Use standard investment commentary norms (current institutional default).`;
    default:
      return "";
  }
}

export function buildEditorialUserPayload(
  draftMarked,
  sentenceText,
  evidenceBlock,
  ctx,
  previousText,
  nextText,
  sourceExcerpt
) {
  const visLabel = getVisibilityLabel(ctx.requiredVersion);
  const prev =
    typeof previousText === "string" && previousText.trim()
      ? previousText.trim()
      : "(none — this is the first statement)";
  const next =
    typeof nextText === "string" && nextText.trim()
      ? nextText.trim()
      : "(none — this is the last statement)";
  // B178 removed sourceExcerpt / evidenceBlock from the prompt deliberately.
  void evidenceBlock;
  void sourceExcerpt;
  return `OUTPUT TYPE: ${ctx.outputTypeLabel}

CONTEXT BEFORE:
${prev}

CURRENT STATEMENT (evaluate only this):
${sentenceText}

CONTEXT AFTER:
${next}

---

DOCUMENT CONTEXT
- Output type: ${ctx.outputTypeLabel}
- Required version: ${visLabel} (${String(ctx.requiredVersion)})

${formatAuthoringOrganisationPromptBlock(draftMarked, ctxHouseName(ctx))}

FULL DRAFT (current sentence marked with [REVIEW THIS] where matched):
---
${draftMarked}
---
`;
}

export function buildEditorialStyleUserPayload({
  sentenceText,
  outputTypeLabel,
  requiredVersion,
  draftText,
  evidenceExcerpt,
  contextBefore,
  contextAfter,
  evidenceBlock,
  authoringOrganisation,
}) {
  const visLabel = getVisibilityLabel(requiredVersion);
  const prev =
    typeof contextBefore === "string" && contextBefore.trim()
      ? contextBefore.trim()
      : "(none — this is the first statement)";
  const next =
    typeof contextAfter === "string" && contextAfter.trim()
      ? contextAfter.trim()
      : "(none — this is the last statement)";
  const draftMarked = buildMarkedDraft(typeof draftText === "string" ? draftText : "", sentenceText);
  // B178 removed evidenceExcerpt / evidenceBlock from the prompt deliberately.
  void evidenceExcerpt;
  void evidenceBlock;
  return `OUTPUT TYPE: ${outputTypeLabel}

CONTEXT BEFORE:
${prev}

CURRENT STATEMENT (evaluate only this):
${sentenceText}

CONTEXT AFTER:
${next}

---

DOCUMENT CONTEXT
- Output type: ${outputTypeLabel}
- Required version: ${visLabel} (${String(requiredVersion)})

${formatAuthoringOrganisationPromptBlock(draftText, resolveAuthoringOrganisationName(authoringOrganisation))}

FULL DRAFT (current sentence marked with [REVIEW THIS] where matched):
---
${draftMarked}
---
`;
}

function buildStyleUserPayload(sentenceText, ctx) {
  const draftText =
    typeof ctx?.draftText === "string" && ctx.draftText.trim()
      ? ctx.draftText
      : sentenceText;
  return `OUTPUT TYPE: ${ctx.outputTypeLabel}

${formatAuthoringOrganisationPromptBlock(draftText, ctxHouseName(ctx))}

CURRENT STATEMENT:
${sentenceText}`;
}

const RETURN_OR_PERFORMANCE = /\b(?:IRR|MOIC|TVPI|DPI|RVPI|yield)\b|\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*x\b|\b(?:gross|net)\b/i;

/** A return or a performance figure is the only reason compliance reads the source. */
export function statementHasReturnFigure(text) {
  return RETURN_OR_PERFORMANCE.test(String(text || ""));
}

function complianceSourceBlock(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const blocks = [];
  for (let index = 0; index < list.length; index += 1) {
    const source = list[index];
    const text = typeof source === "string" ? source : source?.text;
    if (typeof text !== "string" || !text.trim()) continue;
    const label = source && typeof source.label === "string" && source.label.trim()
      ? source.label.trim()
      : `document ${index + 1}`;
    blocks.push(`Document: ${label}\n${text}`);
  }
  if (!blocks.length) return "";
  return `\n\nSOURCE DOCUMENTS (use these only to compare a gross or net qualifier on a return figure):\n${blocks.join("\n\n")}`;
}

export function buildComplianceUserPayload(sentenceText, ctx) {
  const visLabel = getVisibilityLabel(ctx.requiredVersion);
  const publicationBlock = buildSourcePublicationStateBlock(ctx.sources);
  const sourceBlock = statementHasReturnFigure(sentenceText) ? complianceSourceBlock(ctx.sources) : "";
  return `${sourceBlock}${publicationBlock}
OUTPUT TYPE: ${ctx.outputTypeLabel}
VERSION: ${visLabel} (${String(ctx.requiredVersion)})

CURRENT STATEMENT:
${sentenceText}`.trim();
}

function buildEditorialSystemPrompt(outputTypeLabel, rules, outputSlug, outputType, houseName, preamble = EDITORIAL_PREAMBLE) {
  const craftIds = ["active_voice_preference", "hyperbole_vs_qualitative", "register_consistency", "sentence_structure_clarity", "jargon"];
  const present = new Set((Array.isArray(rules) ? rules : []).map((rule) => rule.id));
  const craft = renderReviewStyleRules(resolveStyleChoices(null), { all: true })
    .filter((rule) => craftIds.includes(rule.id) && !present.has(rule.id))
    .map((rule) => ({
      id: rule.id,
      category: "editorial",
      severity: "soft_concern",
      description: rule.description,
      appliesTo: ["reporting_commentary", "investor_letter", "press_release", "linkedin_post", "general_text"],
      appliesToVersion: null,
      fixDirection: rule.fixDirection,
    }));
  const listed = withoutCausalRule(gateNarrativeCoherenceRules([...(Array.isArray(rules) ? rules : []), ...craft]));
  const outputTypeCalibration = preamble === EDITORIAL_PREAMBLE ? buildEditorialOutputTypeCalibration(outputType) : "";
  const calibrationBlock = outputTypeCalibration
    ? `${VISIBILITY_CALIBRATION_EDITORIAL_STYLE}\n\n${outputTypeCalibration}`
    : VISIBILITY_CALIBRATION_EDITORIAL_STYLE;
  return `${preamble}

You are reviewing for output type: ${outputTypeLabel}.

${editorialEvaluationScope(listed)}

${VIOLATIONS_ONLY_CONTRACT}

${EDITORIAL_META_RULES}

${EDITORIAL_MATERIALITY_AND_INFORMATION_VALUE}

${calibrationBlock}

RULES:
${formatRulesForPrompt(listed, outputSlug, "editorial", houseName)}

${RESPONSE_JSON_EDITORIAL_COMPLIANCE}`;
}

export function buildStyleSystemPrompt(outputTypeLabel, rules, outputSlug, outputType, houseName) {
  const conventions = buildOutputTypeConventionsBlock(outputType);
  return `${STYLE_PREAMBLE} Output type: ${outputTypeLabel}.

${STYLE_META_RULES}

${STYLE_SCOPE_CURRENT_ONLY}

OUTPUT-TYPE VOICE AND STRUCTURE (reference only — not the text under review):
${conventions}

RULES:
${formatRulesForPrompt(styleRulesForReviewPrompt(rules), outputSlug, "style", houseName)}

${RESPONSE_JSON_STYLE}`;
}

const GENERAL_STYLE_PREAMBLE = `You are an editor reviewing one sentence of general writing. Evaluate the CURRENT STATEMENT for clarity, accuracy, and the style rules given. Do not use the voice of an investment firm. Keep category discipline: editorial concerns must be tagged "editorial" and style concerns must be tagged "style_guide".`;

export function buildEditorialStyleSystemPrompt({
  outputTypeLabel,
  editorialRules,
  structuredStyleRules,
  outputSlug,
  outputType,
  houseName,
  neutral = false,
}) {
  const listedEditorial = withoutCausalRule(gateNarrativeCoherenceRules(editorialRules));
  const conventions = neutral ? "Write clearly and accurately. Do not invent facts." : buildOutputTypeConventionsBlock(outputType);
  const styleBlock = formatStyleGuideRulesForPrompt(styleRulesForReviewPrompt(structuredStyleRules));
  const outputTypeCalibration = neutral ? "" : buildEditorialOutputTypeCalibration(outputType);
  const calibrationBlock = outputTypeCalibration
    ? `${VISIBILITY_CALIBRATION_EDITORIAL_STYLE}\n\n${outputTypeCalibration}`
    : VISIBILITY_CALIBRATION_EDITORIAL_STYLE;
  return `${neutral ? GENERAL_STYLE_PREAMBLE : EDITORIAL_STYLE_COMBINED_PREAMBLE}

You are reviewing for output type: ${outputTypeLabel}.

${editorialEvaluationScope(listedEditorial)}

${STYLE_SCOPE_CURRENT_ONLY}

${VIOLATIONS_ONLY_CONTRACT}

${EDITORIAL_META_RULES}

${EDITORIAL_MATERIALITY_AND_INFORMATION_VALUE}

${STYLE_META_RULES}

OUTPUT-TYPE VOICE AND STRUCTURE (reference only — not the text under review):
${conventions}

${calibrationBlock}

## Editorial rules
${formatRulesForPrompt(listedEditorial, outputSlug, "editorial", houseName)}

## Style rules
${styleBlock}

${COMMENTARY_CALIBRATION_CONCERN_PROSE}

${RESPONSE_JSON_EDITORIAL_STYLE_COMBINED}`;
}

function buildComplianceSystemPrompt(outputTypeLabel, rules, outputSlug) {
  return `${COMPLIANCE_PREAMBLE}

You are reviewing for output type: ${outputTypeLabel}.

${COMPLIANCE_META_RULES}

${COMPLIANCE_SCOPE_CURRENT_ONLY}

${VISIBILITY_CALIBRATION_COMPLIANCE}

${COMPLIANCE_PHRASE_QUOTING}

RULES:
${formatRulesForPrompt(rules, outputSlug, "compliance")}

${COMMENTARY_CALIBRATION_CONCERN_PROSE}

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

/** B202 / B300: the check was requested and did not complete. Never a silent clean. Always a reason. */
function markEditorialNotReviewed(qcCard, reason, meta = {}) {
  if (!qcCard || typeof qcCard !== "object") return;
  qcCard.editorialVerdict = "not_reviewed";
  qcCard.editorialConcerns = [];
  qcCard.editorialNote = "";
  qcCard.editorialSuggestedDirection = null;
  qcCard.editorialSuggestedRewrite = null;
  const why = requireNotReviewedReason(reason);
  qcCard.editorialNotReviewedReason = why;
  logCheckNotReviewed({
    kind: "editorial",
    statementIndex: meta.statementIndex,
    reason: why,
    requestId: meta.requestId ?? null,
  });
}

/** B202 / B300: the check was requested and did not complete. Never a silent clean. Always a reason. */
function markComplianceNotReviewed(qcCard, reason, meta = {}) {
  if (!qcCard || typeof qcCard !== "object") return;
  qcCard.complianceVerdict = "not_reviewed";
  qcCard.complianceConcerns = [];
  qcCard.complianceNote = "";
  qcCard.complianceSuggestedDirection = null;
  qcCard.complianceSuggestedRewrite = null;
  const why = requireNotReviewedReason(reason);
  qcCard.complianceNotReviewedReason = why;
  logCheckNotReviewed({
    kind: "compliance",
    statementIndex: meta.statementIndex,
    reason: why,
    requestId: meta.requestId ?? null,
  });
}

function stampNotReviewedFromFailure(qcCard, err, kind, statementIndex) {
  const reason = notReviewedReasonFromFailure(err);
  if (reason === NOT_REVIEWED_REASONS.RATE_LIMIT_WINDOW) {
    incrementBoundHit(kind === "compliance" ? "compliance" : "editorial");
  }
  const meta = {
    statementIndex,
    requestId: providerRequestIdFrom(err),
  };
  if (kind === "compliance") markComplianceNotReviewed(qcCard, reason, meta);
  else markEditorialNotReviewed(qcCard, reason, meta);
}

function applyEditorialSettledValue(qcCard, result, statementIndex) {
  const meta = {
    statementIndex,
    requestId: result?.requestId ?? providerRequestIdFrom(result) ?? null,
  };
  if (result?.schemaValid === false) {
    markEditorialNotReviewed(
      qcCard,
      result?.notReviewedReason || NOT_REVIEWED_REASONS.SCHEMA_INVALID,
      meta
    );
    return;
  }
  if (typeof result?.editorialVerdict !== "string") {
    markEditorialNotReviewed(qcCard, NOT_REVIEWED_REASONS.EMPTY_RESULT, meta);
    return;
  }
  qcCard.editorialConcerns = Array.isArray(result?.editorialConcerns) ? result.editorialConcerns : [];
  qcCard.editorialVerdict = result.editorialVerdict;
  qcCard.editorialNote = typeof result?.editorialNote === "string" ? result.editorialNote : null;
  qcCard.editorialSuggestedDirection =
    typeof result?.editorialSuggestedDirection === "string" ? result.editorialSuggestedDirection : null;
  qcCard.editorialSuggestedRewrite =
    typeof result?.editorialSuggestedRewrite === "string" ? result.editorialSuggestedRewrite : null;
}

function schemaFailReason(attemptFailures) {
  if (
    Array.isArray(attemptFailures) &&
    attemptFailures.length > 0 &&
    attemptFailures.every((row) => !String(row?.rawOutput || "").trim())
  ) {
    return NOT_REVIEWED_REASONS.EMPTY_COMPLETION;
  }
  return NOT_REVIEWED_REASONS.SCHEMA_INVALID;
}

/**
 * A8.22 / A8.25: Run style-guide LLM review (CURRENT STATEMENT user payload only).
 * @param {import("openai").default} client
 * @param {{ sentenceText: string, ctx: object, rules: object[], statementIndex?: number|null }} args
 */
export async function runStyleGuideReview(args) {
  const { sentenceText, ctx, rules, statementIndex, traceId } = args;
  const idx = statementIndex ?? null;
  console.log("[STYLE_REVIEW] starting", { statementIndex: idx });
  const outputSlug = ctx.outputSlug ?? rulebookOutputSlug(ctx.outputType);
  const systemPrompt = buildStyleSystemPrompt(
    ctx.outputTypeLabel,
    rules,
    outputSlug,
    ctx.outputType,
    identifyAuthoringOrganisation(ctx?.draftText, ctxHouseName(ctx))
  );
  const userContent = buildStyleUserPayload(sentenceText, ctx);
  const modelConfig = STAGE_MODELS["style-review"];
  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    responseFormat: "json",
    traceId,
    traceName: "qc-run",
    spanName: "qc-style-review",
    metadata: { stage: "editorial-style", statementIndex: idx },
  });
  const raw = completion?.text;
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
export async function runEditorialReview(args) {
  const { draftMarked, sentenceText, evidenceBlock, ctx, rules, previousText, nextText, sourceExcerpt, statementIndex, traceId } =
    args;
  const idx = statementIndex ?? null;
  const outputSlug = ctx.outputSlug ?? rulebookOutputSlug(ctx.outputType);
  const systemPrompt = buildEditorialSystemPrompt(
    ctx.outputTypeLabel,
    rules,
    outputSlug,
    ctx.outputType,
    identifyAuthoringOrganisation(ctx?.draftText, ctxHouseName(ctx))
  );
  const userContent = buildEditorialUserPayload(
    draftMarked,
    sentenceText,
    evidenceBlock,
    ctx,
    previousText,
    nextText,
    sourceExcerpt
  );
  const modelConfig = STAGE_MODELS["editorial-review"];
  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    responseFormat: "json",
    traceId,
    traceName: "qc-run",
    spanName: "qc-editorial-review",
    metadata: { stage: "editorial", statementIndex: idx },
  });
  const raw = completion?.text;
  const violations = parseViolationsArray(raw);
  const concernCount = Array.isArray(violations) ? violations.length : 0;
  console.log("[EDITORIAL_REVIEW] completed", { statementIndex: idx, concernCount });
  return { raw, violations };
}

/**
 * R3.1: Run combined editorial+style LLM review for one statement context (v4 route).
 * @param {{
 *   sentenceText: string,
 *   outputType: string,
 *   outputTypeLabel: string,
 *   requiredVersion: string,
 *   draftText: string,
 *   evidenceExcerpt: string|null,
 *   contextBefore: string|null,
 *   contextAfter: string|null,
 *   evidenceBlock: string,
 *   editorialRules: object[],
 *   outputSlug: string,
 *   authoringOrganisation?: string|null,
 *   traceId?: string,
 *   statementIndex?: number|null
 * }} args
 */
export async function runEditorialStyleReview(args) {
  const {
    sentenceText,
    outputType,
    outputTypeLabel,
    requiredVersion,
    draftText,
    evidenceExcerpt,
    contextBefore,
    contextAfter,
    evidenceBlock,
    editorialRules: editorialRulesIn,
    outputSlug,
    authoringOrganisation,
    traceId,
    statementIndex,
    spend,
    houseStyle,
    eventType,
    sourceText,
  } = args;
  const idx = statementIndex ?? null;
  const editorialRules = withoutCausalRule(gateNarrativeCoherenceRules(editorialRulesIn));
  const resolved = resolveAuthoringOrganisationName(authoringOrganisation);
  const houseName = identifyAuthoringOrganisation(draftText, resolved);
  const structuredStyleRules = resolveStyleGuide({
    outputType,
    authoringOrganisation,
    promptHouseName: houseName,
    houseStyle,
  });
  const modelConfig = STAGE_MODELS["editorial-style-review"];
  const systemPrompt = buildEditorialStyleSystemPrompt({
    outputTypeLabel,
    editorialRules,
    structuredStyleRules,
    outputSlug,
    outputType,
    houseName,
    neutral: eventType === "GENERAL",
  });
  const userContent = buildEditorialStyleUserPayload({
    sentenceText,
    outputTypeLabel,
    requiredVersion,
    draftText,
    evidenceExcerpt,
    contextBefore,
    contextAfter,
    evidenceBlock,
    authoringOrganisation,
  });
  const editorialMap = buildRuleMap(editorialRules);
  const styleMap = buildRuleMap(structuredStyleRules);
  const mergedMap = new Map([...styleMap.entries(), ...editorialMap.entries()]);
  const styleAllowed = new Set(styleMap.keys());
  const editorialAllowed = new Set(editorialMap.keys());

  let retryCorrectionNote = "";
  const recorded = [];
  const attemptFailures = [];

  async function callCombined(attempt) {
    const userPayload =
      attempt === 2 && retryCorrectionNote
        ? `${userContent}\n\n${retryCorrectionNote}`
        : userContent;
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPayload },
      ],
      responseFormat: "json",
      traceId,
      traceName: "qc-run",
      spanName: "editorial-style-review",
      metadata: {
        stage: "editorial-style-review",
        statementIndex: idx,
        outputType,
        requiredVersion,
        attempt,
      },
    });
    noteReviewSpend(spend, modelConfig.provider, modelConfig.model, completion);
    const raw = typeof completion?.text === "string" ? completion.text : "";
    const parsed = parseEditorialStyleCombinedPayload(raw);
    if (!parsed) {
      attemptFailures.push({
        attempt,
        rawOutput: truncateForFallbackLog(raw),
        rejectReason: describeCombinedParseFailure(raw),
      });
      return null;
    }
    const normalized = [];
    for (const concern of parsed.concerns) {
      const statedCategory =
        typeof concern?.category === "string" ? concern.category.trim() : "";
      const ruleId =
        typeof concern?.ruleId === "string"
          ? concern.ruleId.trim()
          : typeof concern?.rule === "string"
            ? concern.rule.trim()
            : "";
      const n = normalizeCombinedConcern(concern, styleAllowed, editorialAllowed);
      if (!n) {
        const note = typeof concern?.note === "string" ? concern.note.trim() : "";
        recorded.push(dropRecord(
          "normalize_combined",
          "the concern was not a valid editorial or style concern",
          note || `${statedCategory || "unknown"} ${ruleId || "unknown"}`
        ));
        console.log(
          `[EDITORIAL_STYLE_REVIEW] concern dropped statementIndex=${
            Number.isFinite(idx) ? idx : "unknown"
          } ruleId=${ruleId || "(unknown)"} category=${statedCategory || "(unknown)"}`
        );
        logCanaryScore({
          traceId,
          name: "editorial_concern_dropped",
          value: 1,
          comment: `Dropped invalid combined concern at statement ${
            Number.isFinite(idx) ? idx : "unknown"
          }.`,
          metadata: {
            statementIndex: idx,
            ruleId: ruleId || null,
            category: statedCategory || null,
          },
        });
        continue;
      }
      if (
        (statedCategory === "editorial" || statedCategory === "style_guide") &&
        n.category !== statedCategory
      ) {
        console.log(
          `[EDITORIAL_STYLE_REVIEW] concern reclassified statementIndex=${
            Number.isFinite(idx) ? idx : "unknown"
          } ruleId=${ruleId} from=${statedCategory} to=${n.category}`
        );
        recorded.push(dropRecord(
          "category_moved",
          `stated ${statedCategory}, filed as ${n.category}`,
          n.note
        ));
        logCanaryScore({
          traceId,
          name: "editorial_concern_reclassified",
          value: 1,
          comment: `Reclassified '${ruleId}' from ${statedCategory} to ${n.category}.`,
          metadata: {
            statementIndex: idx,
            ruleId,
            fromCategory: statedCategory,
            toCategory: n.category,
          },
        });
      }
      normalized.push(n);
    }
    if (parsed.verdict === "concern" && normalized.length === 0) {
      attemptFailures.push({
        attempt,
        rawOutput: truncateForFallbackLog(raw),
        rejectReason: describeVerdictConcernZeroNormalized(
          parsed.concerns,
          styleAllowed,
          editorialAllowed
        ),
      });
      if (attempt === 1) {
        retryCorrectionNote = buildCombinedRetryCorrectionNote(
          parsed.concerns,
          styleAllowed,
          editorialAllowed
        );
      }
      return null;
    }
    return { parsed, normalized };
  }

  let combined = await callCombined(1);
  let retried = false;
  if (!combined) {
    retried = true;
    combined = await callCombined(2);
  }

  if (!combined) {
    for (const failure of attemptFailures) {
      console.warn("[EDITORIAL_STYLE_REVIEW] fallback raw output", {
        statementIndex: idx,
        attempt: failure.attempt,
        rawOutput: failure.rawOutput,
        rejectReason: failure.rejectReason,
      });
    }
    logCanaryScore({
      traceId,
      name: "editorial_style_schema_validation_failed",
      value: 1,
      comment: `Combined editorial/style schema validation failed after retry for statement ${
        Number.isFinite(idx) ? idx : "unknown"
      }.`,
    });
    console.warn("[EDITORIAL_STYLE_REVIEW] schema validation failed after retry; marking not_reviewed", {
      statementIndex: idx,
      retried,
      reason: schemaFailReason(attemptFailures),
    });
    console.log("[EDITORIAL_REVIEW] completed", { statementIndex: idx, concernCount: 0 });
    return {
      editorialConcerns: [],
      editorialVerdict: "not_reviewed",
      editorialNote: "",
      editorialSuggestedDirection: null,
      editorialSuggestedRewrite: null,
      retried,
      schemaValid: false,
      notReviewedReason: schemaFailReason(attemptFailures),
    };
  }

  const silences = recorded.filter(Boolean).map((row) => ({
    id: row.rule,
    reason: row.reason,
    count: 1,
    content: [row.content],
  }));
  const noteDrop = (id, before, after) => {
    if (!Array.isArray(before) || !Array.isArray(after) || after.length >= before.length) return;
    const gone = removedByIdentity(before, after);
    const content = (gone.length ? gone : []).map((row) => concernContent(row)).filter(Boolean);
    silences.push({
      id,
      reason: "dropped",
      count: before.length - after.length,
      content,
    });
  };
  const fidelityChecked = applyFidelityGate({
    violations: combined.normalized,
    reviewer: "editorial-style",
    statementIndex: idx,
    statementText: sentenceText,
    evidenceExcerpt: null,
  });
  noteDrop("fidelity", combined.normalized, fidelityChecked);
  const withSpans = attachConcernSpans(fidelityChecked, sentenceText);
  const styleFiltered = applyDeterministicStyleFilters(withSpans, sentenceText, draftText, {
    outputType: outputSlug,
    houseStyle,
  });
  noteDrop("style_backstop", withSpans, styleFiltered);
  const mechanics = scanMechanics({ statement: sentenceText, outputType: outputSlug });
  const formScans = [
    ...scanListCommas({ statement: sentenceText, sourceText: typeof sourceText === "string" ? sourceText : "" }),
    ...scanPeriodPlacement({ statement: sentenceText, periods: houseStyle?.periods }),
    ...scanPeriodForm({ statement: sentenceText, draftText, periods: houseStyle?.periods }),
    ...scanPenceForm({ statement: sentenceText, pence: houseStyle?.pence }),
    ...scanNumberForm({ statement: sentenceText, styleRules: structuredStyleRules }),
    ...scanMagnitude({ statement: sentenceText, houseStyle }),
  ];
  const withMechanics = styleFiltered.concat(mechanics, formScans);
  const noOpFiltered = suppressNoOpSuggestions(withMechanics, sentenceText);
  noteDrop("no_op", withMechanics, noOpFiltered);
  const noChangeFiltered = suppressNoChangeDirections(noOpFiltered);
  noteDrop("no_change", noOpFiltered, noChangeFiltered);
  const evidenceLanguageFiltered = suppressEvidenceLanguageConcerns(noChangeFiltered);
  noteDrop("evidence_language", noChangeFiltered, evidenceLanguageFiltered);
  const creditLineFiltered = suppressLinkedInCreditLines(evidenceLanguageFiltered, sentenceText, outputSlug);
  noteDrop("linkedin_credit_line", evidenceLanguageFiltered, creditLineFiltered);
  const restatementBound = applyEvaluativeDeletionBounds(creditLineFiltered, sentenceText);
  const viewMarkerBound = applyViewMarkerSubjectBounds(restatementBound, sentenceText, houseName);
  const placeholderStripped = stripPlaceholderLeaksFromConcerns(viewMarkerBound);
  const coherenceGated = dropNarrativeCoherenceConcerns(placeholderStripped);
  noteDrop("narrative_coherence", placeholderStripped, coherenceGated);
  const sorted = sortConcernsBySeverity(coherenceGated, mergedMap, outputSlug);
  const offTheCard = new Set(["voice_consistency", "first_person_plural", "materiality"]);
  const onCard = sorted.filter((concern) => {
    const code = String(concern?.concernCode || concern?.rule || "");
    const text = `${concern?.note || ""} ${concern?.concernText || ""}`;
    if (!String(concern?.note || concern?.concernText || "").trim()) return false;
    if (offTheCard.has(code)) return false;
    if (/does not add meaningful information/i.test(text)) return false;
    return true;
  });
  const hasConcerns = onCard.length > 0;
  console.log("[EDITORIAL_REVIEW] completed", {
    statementIndex: idx,
    concernCount: sorted.length,
  });
  return {
    editorialConcerns: onCard,
    editorialVerdict: hasConcerns ? "concern" : "clean",
    editorialNote: hasConcerns ? null : "No editorial or style concerns identified under the listed rules.",
    editorialSuggestedDirection: pickDisplayedField(sorted, "suggestedDirection"),
    editorialSuggestedRewrite: pickDisplayedField(sorted, "suggestedRewrite"),
    retried,
    schemaValid: true,
    ...(silences.length ? { silences } : {}),
  };
}

/**
 * A8.22 / A8.25: Run compliance LLM review (CURRENT STATEMENT user payload only).
 * @param {import("openai").default} client
 * @param {{ sentenceText: string, ctx: object, rules: object[], statementIndex?: number|null }} args
 */
export async function runComplianceReview(args) {
  const { sentenceText, ctx, rules, statementIndex, traceId, spend } = args;
  const idx = statementIndex ?? null;
  const outputSlug = ctx.outputSlug ?? rulebookOutputSlug(ctx.outputType);
  const systemPrompt = buildComplianceSystemPrompt(ctx.outputTypeLabel, rules, outputSlug);
  const userContent = buildComplianceUserPayload(sentenceText, ctx);
  const modelConfig = STAGE_MODELS["compliance-review"];
  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    responseFormat: "json",
    traceId,
    traceName: "qc-run",
    spanName: "qc-compliance-review",
    metadata: { stage: "compliance", statementIndex: idx },
  });
  noteReviewSpend(spend, modelConfig.provider, modelConfig.model, completion);
  const raw = completion?.text;
  const violations = parseViolationsArray(raw);
  const concernCount = Array.isArray(violations) ? violations.length : 0;
  console.log("[COMPLIANCE_REVIEW] completed", { statementIndex: idx, concernCount });
  return { raw, violations };
}

/**
 * B421. One changed statement. Editorial-and-style, then compliance.
 * Two model calls, plus a retry inside the style reviewer when the schema fails.
 */
export async function reviewStatementConcerns({
  sentenceText,
  outputType,
  requiredVersion,
  draftText,
  authoringOrganisation,
  statementIndex,
  primaryExcerpt,
  conflictExcerpt,
  spend,
  eventType,
  houseStyle,
  referenceDate,
} = {}) {
  if (typeof sentenceText !== "string" || !sentenceText.trim()) {
    throw new Error("reviewStatementConcerns: statement text is missing");
  }
  if (typeof outputType !== "string" || !outputType.trim()) {
    throw new Error("reviewStatementConcerns: output type is missing");
  }
  if (typeof requiredVersion !== "string" || !requiredVersion.trim()) {
    throw new Error("reviewStatementConcerns: version is missing");
  }
  const normalizedType = normalizeOutputType(outputType);
  const normalizedVersion = normalizeVisibility(requiredVersion);
  const outputTypeLabel = getOutputTypeLabel(normalizedType);
  const outputSlug = rulebookOutputSlug(normalizedType);
  const versionSlug = rulebookVersionSlug(normalizedVersion);
  const generalWriting = eventType === "GENERAL";
  const editorialFiltered = editorialRulesForRun(editorialRules, outputSlug, versionSlug);
  const complianceFiltered = generalWriting
    ? cautionRulesForRun(normalizedVersion)
    : filterRulesForRun(complianceRules, outputSlug, versionSlug);
  const draft = typeof draftText === "string" ? draftText : sentenceText;
  const editorial = await runEditorialStyleReview({
    sentenceText,
    outputType: normalizedType,
    outputTypeLabel,
    requiredVersion: normalizedVersion,
    draftText: draft,
    evidenceExcerpt: null,
    contextBefore: null,
    contextAfter: null,
    evidenceBlock: "",
    editorialRules: editorialFiltered,
    outputSlug,
    authoringOrganisation: authoringOrganisation ?? null,
    statementIndex,
    spend,
    houseStyle,
    eventType,
  });
  const compliance = await runComplianceReview({
    sentenceText,
    ctx: {
      outputType: normalizedType,
      requiredVersion: normalizedVersion,
      outputTypeLabel,
      outputSlug,
      sources: [],
      draftText: draft,
      authoringOrganisation: authoringOrganisation ?? null,
    },
    rules: complianceFiltered,
    statementIndex,
    spend,
  });
  const card = {};
  if (compliance.violations == null) {
    card.complianceConcerns = [];
    card.complianceVerdict = "not_reviewed";
  } else {
    const gated = applyFidelityGate({
      violations: compliance.violations,
      reviewer: "compliance",
      statementIndex,
      statementText: sentenceText,
      evidenceExcerpt: null,
      drop: false,
    });
    applyComplianceResult(card, gated, buildRuleMap(complianceFiltered), outputSlug, sentenceText, [], generalWriting ? { skipGrossNet: true, caution: true, visibility: normalizedVersion } : null);
  }
  const inExcerpt = dropForwardLookingInExcerpt(card.complianceConcerns, {
    statementText: sentenceText,
    primaryExcerpt,
    conflictExcerpt,
  });
  const dated = dropDatedForwardLooking(inExcerpt.concerns, {
    statementText: sentenceText,
    referenceDate: referenceDate || documentReferenceDate(draftText, []),
  });
  const forward = {
    concerns: dated.concerns,
    dropped: [...inExcerpt.dropped, ...dated.dropped],
  };
  let complianceVerdict = card.complianceVerdict;
  if (forward.dropped.length > 0 && forward.concerns.length === 0 && complianceVerdict !== "not_reviewed") {
    complianceVerdict = "clean";
  }
  return {
    editorialConcerns: Array.isArray(editorial?.editorialConcerns) ? editorial.editorialConcerns : [],
    editorialVerdict: typeof editorial?.editorialVerdict === "string" ? editorial.editorialVerdict : "not_reviewed",
    complianceConcerns: forward.concerns,
    complianceVerdict,
  };
}

function returnReads(text) {
  const found = [];
  const re = /(\d+(?:\.\d+)?)%\s*(gross|net)?\s*IRR/gi;
  let match;
  while ((match = re.exec(String(text || "")))) {
    found.push({ figure: match[1], qualifier: (match[2] || "").toLowerCase() });
  }
  return found;
}

/**
 * The statement adds gross or net to a return figure the source gives without
 * it, or drops a qualifier the source gives. Null when they agree, or when
 * no source text was passed in to compare.
 */
export function addedQualifierConcern(statement, sources) {
  const draft = returnReads(statement);
  if (!draft.length) return null;
  const list = Array.isArray(sources) ? sources : [];
  const sourceText = list.map((source) => (typeof source === "string" ? source : source?.text || "")).join("\n");
  if (!sourceText.trim()) return null;
  const fromSource = returnReads(sourceText);
  for (const row of draft) {
    const sameFigure = fromSource.filter((item) => item.figure === row.figure);
    if (!sameFigure.length) continue;
    if (sameFigure.some((item) => item.qualifier === row.qualifier)) continue;
    const sourceQualifier = sameFigure.find((item) => item.qualifier)?.qualifier || "";
    const draftWords = row.qualifier ? `${row.figure}% ${row.qualifier} IRR` : `${row.figure}% IRR`;
    const sourceWords = sourceQualifier ? `${row.figure}% ${sourceQualifier} IRR` : `${row.figure}% IRR`;
    return {
      concernCode: "return_figure_gross_net_qualifier_missing",
      note: `The statement says ${draftWords}. The source gives ${sourceWords}.`,
      category: "compliance",
    };
  }
  return null;
}

function sourcesArePublished(sources) {
  const list = Array.isArray(sources) ? sources : [];
  return list.length > 0 && list.every((source) => normalizePublicationState(source?.publicationState) === "published_external");
}

function applyComplianceResult(qcCard, violations, ruleMap, outputSlug, statementText = null, sources = null, options = null) {
  const allowed = new Set(ruleMap.keys());
  const published = sourcesArePublished(sources);
  const normalized = [];
  for (const v of violations) {
    const n = normalizeViolation(v, "compliance", allowed);
    if (!n) continue;
    if (published && (n.concernCode === "precise_confidential_detail_in_public_version" || n.concernCode === "caution_private_detail")) {
      console.log("[compliance] confidential concern dropped; the source is published_external");
      continue;
    }
    normalized.push(n);
  }
  if (!options?.skipGrossNet) {
    const qualifier = addedQualifierConcern(statementText, sources);
    if (qualifier && !normalized.some((row) => row.concernCode === qualifier.concernCode)) {
      normalized.push(qualifier);
    }
  }
  for (const row of cautionFindingsForStatement(statementText, sources, options)) {
    if (!allowed.has(row.concernCode)) continue;
    if (!normalized.some((item) => item.concernCode === row.concernCode)) normalized.push(row);
  }
  const withSpans =
    typeof statementText === "string" && statementText
      ? attachConcernSpans(normalized, statementText)
      : normalized;
  const sorted = sortConcernsBySeverity(
    stripPlaceholderLeaksFromConcerns(withSpans),
    ruleMap,
    outputSlug
  );
  qcCard.complianceConcerns = sorted;
  qcCard.complianceVerdict = aggregateVerdictFromConcerns(sorted, ruleMap, outputSlug);
  if (sorted.length === 0) {
    qcCard.complianceNote = "No caution concerns identified under the listed rules.";
    qcCard.complianceSuggestedDirection = null;
    qcCard.complianceSuggestedRewrite = null;
  } else {
    qcCard.complianceNote = null;
    qcCard.complianceSuggestedDirection = pickDisplayedField(sorted, "suggestedDirection");
    qcCard.complianceSuggestedRewrite = pickDisplayedField(sorted, "suggestedRewrite");
  }
}

function applyMergedEditorialAndStyle(
  qcCard,
  styleViolations,
  editorialViolations,
  styleRules,
  editorialRules,
  outputSlug,
  sentenceText,
  houseName
) {
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

  const creditLineFiltered = suppressLinkedInCreditLines(
    suppressEvidenceLanguageConcerns(merged),
    sentenceText,
    outputSlug
  );
  const bounded = applyViewMarkerSubjectBounds(
    applyEvaluativeDeletionBounds(creditLineFiltered, sentenceText),
    sentenceText,
    houseName
  );
  const sorted = sortConcernsBySeverity(
    stripPlaceholderLeaksFromConcerns(bounded),
    mergedMap,
    outputSlug
  );
  qcCard.editorialConcerns = sorted;
  qcCard.editorialVerdict = aggregateVerdictFromConcerns(sorted, mergedMap, outputSlug);
  if (sorted.length === 0) {
    qcCard.editorialNote = "No editorial or style concerns identified under the listed rules.";
    qcCard.editorialSuggestedDirection = null;
    qcCard.editorialSuggestedRewrite = null;
  } else {
    qcCard.editorialNote = null;
    qcCard.editorialSuggestedDirection = pickDisplayedField(sorted, "suggestedDirection");
    qcCard.editorialSuggestedRewrite = pickDisplayedField(sorted, "suggestedRewrite");
  }
}

/**
 * A7.14 / A8.22: Run style + editorial + compliance LLM review per statement (parallel calls per statement).
 *
 * @param {Array<object>} statements - Visible statements (suppressInQcWorkbench !== true)
 * @param {object} documentContext
 * @param {string} [documentContext.outputType]
 * @param {string} [documentContext.requiredVersion] VISIBILITY: COMPLETE | PUBLIC
 * @param {string} [documentContext.draftText] Full draft for coherence review
 * @param {Array<object>} [documentContext.sources] Uploaded sources with publicationState for Compliance
 * @param {boolean} [documentContext.editorialEnabled] A9.12: default true; false skips editorial LLM
 * @param {boolean} [documentContext.complianceEnabled] A9.12: default true; false skips compliance LLM
 * @param {string|null} [documentContext.previousStatementText] A8.23: prior sentence when batch is a single statement
 * @param {string|null} [documentContext.nextStatementText] A8.23: following sentence when batch is a single statement
 * @param {string|null} [documentContext.editorialSourceExcerpt] A8.24: primary source passage for Editorial (per statement when batch size 1)
 * @param {number} [documentContext.statementIndex] A8.24: global statement index for logs (optional)
 * @param {string|null} [documentContext.authoringOrganisation] Optional request-supplied house name
 */
function statementSpan(stmt, draft, sentence) {
  const card = stmt?.qcCard || {};
  const span = card.draftSpan;
  if (span && Number.isInteger(span.startChar) && Number.isInteger(span.endChar) && span.endChar > span.startChar) {
    return [span.startChar, span.endChar];
  }
  if (Number.isInteger(card.charStart) && Number.isInteger(card.charEnd) && card.charEnd > card.charStart) {
    return [card.charStart, card.charEnd];
  }
  const at = typeof draft === "string" && sentence ? draft.indexOf(sentence) : -1;
  if (at < 0) return null;
  return [at, at + sentence.length];
}

export async function runEditorialComplianceReview(statements, documentContext = {}) {
  if (process.env.BRIGHTLINE_EDITORIAL_REVIEW !== "1") {
    console.log("[EDITORIAL_REVIEW] gated off — raw value:", JSON.stringify(process.env.BRIGHTLINE_EDITORIAL_REVIEW));
    return;
  }
  const editorialEnabled = documentContext.editorialEnabled === true;
  const complianceEnabled = documentContext.complianceEnabled === true;
  console.log("[EDITORIAL_REVIEW] starting", {
    statementCount: statements.length,
    outputType: documentContext.outputType ?? null,
    requiredVersion: documentContext.requiredVersion ?? null,
    editorialEnabled,
    complianceEnabled,
  });
  if (!Array.isArray(statements) || statements.length === 0) {
    return;
  }

  const outputType = normalizeOutputType(documentContext.outputType);
  const requiredVersion = normalizeVisibility(documentContext.requiredVersion);
  const draftText = typeof documentContext.draftText === "string" ? documentContext.draftText : "";
  const referenceDate = documentReferenceDate(draftText, Array.isArray(documentContext.sources) ? documentContext.sources : []);
  const outputTypeLabel = getOutputTypeLabel(outputType);
  const outputSlug = rulebookOutputSlug(outputType);
  const complianceSources = Array.isArray(documentContext.sources) ? documentContext.sources : [];
  const ctx = {
    outputType,
    requiredVersion,
    outputTypeLabel,
    outputSlug,
    sources: complianceSources,
    draftText,
    authoringOrganisation: documentContext.authoringOrganisation ?? null,
  };

  const versionSlug = rulebookVersionSlug(requiredVersion);

  const generalWriting = documentContext.eventType === "GENERAL";
  const editorialFiltered = editorialRulesForRun(editorialRules, outputSlug, versionSlug);
  const complianceFiltered = generalWriting
    ? cautionRulesForRun(requiredVersion)
    : filterRulesForRun(complianceRules, outputSlug, versionSlug);
  const complianceOptions = generalWriting
    ? { skipGrossNet: true, caution: true, visibility: requiredVersion }
    : null;

  const toProcess = statements;

  if (!editorialEnabled && !complianceEnabled) {
    for (const stmt of toProcess) {
      clearEditorialQcCard(stmt?.qcCard);
      clearComplianceQcCard(stmt?.qcCard);
    }
    return;
  }

  const editorialStyleProvider = STAGE_MODELS["editorial-style-review"]?.provider;
  const complianceProvider = STAGE_MODELS["compliance-review"]?.provider;
  const missingProviderKey =
    (editorialEnabled && !hasProviderApiKey(editorialStyleProvider)) ||
    (complianceEnabled && !hasProviderApiKey(complianceProvider));
  if (missingProviderKey) {
    console.warn("[EDITORIAL_COMPLIANCE_ERROR] missing LLM provider API key for configured review models");
    for (const stmt of toProcess) {
      const card = stmt?.qcCard;
      if (!card || typeof card !== "object") continue;
      const statementIndex = documentContext.statementIndex ?? null;
      if (editorialEnabled) {
        markEditorialNotReviewed(card, NOT_REVIEWED_REASONS.MISSING_PROVIDER_KEY, { statementIndex });
      }
      if (complianceEnabled) {
        markComplianceNotReviewed(card, NOT_REVIEWED_REASONS.MISSING_PROVIDER_KEY, { statementIndex });
      }
    }
    return;
  }
  const traceId = typeof documentContext?.traceId === "string" ? documentContext.traceId : undefined;

  await Promise.allSettled(
    toProcess.map(async (stmt, index) => {
      if (!stmt || typeof stmt !== "object") return;
      if (!stmt.qcCard || typeof stmt.qcCard !== "object") return;

      const sentenceText = typeof stmt.text === "string" ? stmt.text : "";
      const span = statementSpan(stmt, draftText, sentenceText);
      const quoteExempt = Boolean(span && statementInsideDraftQuotation(draftText, span[0], span[1]));
      if (quoteExempt) {
        if (editorialEnabled) {
          stmt.qcCard.editorialConcerns = [];
          stmt.qcCard.editorialVerdict = "clean";
          stmt.qcCard.editorialNote = "No editorial or style concerns identified under the listed rules.";
          stmt.qcCard.editorialSuggestedDirection = null;
          stmt.qcCard.editorialSuggestedRewrite = null;
          const silences = Array.isArray(stmt.qcCard.silences) ? stmt.qcCard.silences : [];
          stmt.qcCard.silences = [...silences, {
            id: "inside_quotation",
            reason: "the statement is inside a quotation",
            count: 1,
          }];
        }
        if (!complianceEnabled) {
          clearComplianceQcCard(stmt.qcCard);
          return;
        }
      }
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

      const editorialStyleP =
        editorialEnabled &&
        !quoteExempt &&
        runEditorialStyleReview({
          sentenceText,
          outputType: ctx.outputType,
          outputTypeLabel: ctx.outputTypeLabel,
          requiredVersion: ctx.requiredVersion,
          draftText,
          evidenceExcerpt: sourceExcerpt,
          contextBefore: previousText,
          contextAfter: nextText,
          evidenceBlock,
          editorialRules: editorialFiltered,
          outputSlug,
          authoringOrganisation: ctx.authoringOrganisation,
          traceId,
          statementIndex,
          houseStyle: documentContext.houseStyle,
          eventType: documentContext.eventType,
          sourceText: complianceSources.map((source) => (typeof source === "string" ? source : source?.text || "")).filter(Boolean).join("\n"),
        });
      const complianceP =
        complianceEnabled &&
        runComplianceReview({ sentenceText, ctx, rules: complianceFiltered, statementIndex, traceId });

      if (editorialEnabled && !quoteExempt && complianceEnabled) {
        const [editorialStyleSettled, complianceSettled] = await Promise.allSettled([editorialStyleP, complianceP]);
        if (editorialStyleSettled.status !== "fulfilled") {
          console.warn("[EDITORIAL_COMPLIANCE_ERROR] combined editorial/style review failed", {
            editorialStyle: editorialStyleSettled.status,
          });
          stampNotReviewedFromFailure(stmt.qcCard, editorialStyleSettled.reason, "editorial", statementIndex);
        } else {
          applyEditorialSettledValue(stmt.qcCard, editorialStyleSettled.value, statementIndex);
        }

        if (complianceSettled.status !== "fulfilled") {
          console.warn("[EDITORIAL_COMPLIANCE_ERROR]", complianceSettled.reason?.message || String(complianceSettled.reason));
          stampNotReviewedFromFailure(stmt.qcCard, complianceSettled.reason, "compliance", statementIndex);
        } else {
          const complianceRaw = complianceSettled.value?.violations;
          const complianceMap = buildRuleMap(complianceFiltered);
          if (complianceRaw == null) {
            logCanaryScore({
              traceId,
              name: "schema_validation_failed",
              value: 1,
              comment: "Compliance reviewer returned invalid schema.",
            });
            console.warn("[EDITORIAL_COMPLIANCE_ERROR] compliance parse failed", {
              preview: String(complianceSettled.value?.raw).slice(0, 200),
            });
            markComplianceNotReviewed(stmt.qcCard, NOT_REVIEWED_REASONS.SCHEMA_INVALID, {
              statementIndex,
              requestId: providerRequestIdFrom(complianceSettled.value),
            });
          } else {
            const complianceV = applyFidelityGate({
              violations: complianceRaw,
              reviewer: "compliance",
              statementIndex,
              statementText: sentenceText,
              evidenceExcerpt: sourceExcerpt,
              card: stmt.qcCard,
            });
            applyComplianceResult(
              stmt.qcCard,
              complianceV,
              complianceMap,
              outputSlug,
              sentenceText,
              complianceSources,
              complianceOptions
            );
            settleDatedPredictions(stmt.qcCard, sentenceText, referenceDate);
          }
        }
        return;
      }

      if (editorialEnabled && !quoteExempt) {
        let editorialStyleSettled;
        try {
          const value = await editorialStyleP;
          editorialStyleSettled = { status: "fulfilled", value };
        } catch (reason) {
          editorialStyleSettled = { status: "rejected", reason };
        }
        if (editorialStyleSettled.status !== "fulfilled") {
          stampNotReviewedFromFailure(stmt.qcCard, editorialStyleSettled.reason, "editorial", statementIndex);
        } else {
          applyEditorialSettledValue(stmt.qcCard, editorialStyleSettled.value, statementIndex);
        }
        return;
      }

      if (complianceEnabled) {
        let complianceSettled;
        try {
          const value = await complianceP;
          complianceSettled = { status: "fulfilled", value };
        } catch (reason) {
          complianceSettled = { status: "rejected", reason };
        }
        if (complianceSettled.status !== "fulfilled") {
          stampNotReviewedFromFailure(stmt.qcCard, complianceSettled.reason, "compliance", statementIndex);
        } else {
          const complianceRaw = complianceSettled.value?.violations;
          const complianceMap = buildRuleMap(complianceFiltered);
          if (complianceRaw == null) {
            markComplianceNotReviewed(stmt.qcCard, NOT_REVIEWED_REASONS.SCHEMA_INVALID, { statementIndex });
          } else {
            const complianceV = applyFidelityGate({
              violations: complianceRaw,
              reviewer: "compliance",
              statementIndex,
              statementText: sentenceText,
              evidenceExcerpt: sourceExcerpt,
              card: stmt.qcCard,
            });
            applyComplianceResult(
              stmt.qcCard,
              complianceV,
              complianceMap,
              outputSlug,
              sentenceText,
              complianceSources,
              complianceOptions
            );
            settleDatedPredictions(stmt.qcCard, sentenceText, referenceDate);
          }
        }
      }
    })
  );

  if (traceId) {
    let editorialTotal = 0;
    let editorialWithSpan = 0;
    let editorialSpanCount = 0;
    let complianceTotal = 0;
    let complianceWithSpan = 0;
    let complianceSpanCount = 0;
    for (const stmt of toProcess) {
      const card = stmt?.qcCard;
      if (!card || typeof card !== "object") continue;
      const editorialConcerns = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
      for (const c of editorialConcerns) {
        editorialTotal += 1;
        if (concernHasSpanField(c)) {
          editorialWithSpan += 1;
          editorialSpanCount += countConcernSpans(c);
        }
      }
      const complianceConcerns = Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [];
      for (const c of complianceConcerns) {
        complianceTotal += 1;
        if (concernHasSpanField(c)) {
          complianceWithSpan += 1;
          complianceSpanCount += countConcernSpans(c);
        }
      }
    }
    if (editorialTotal > 0) {
      logCanaryScore({
        traceId,
        name: "editorial_concern_span_coverage",
        value: editorialWithSpan / editorialTotal,
        metadata: {
          totalConcerns: editorialTotal,
          concernsWithSpan: editorialWithSpan,
          ...(editorialWithSpan > 0
            ? { averageSpansPerConcern: editorialSpanCount / editorialWithSpan }
            : {}),
        },
      });
    }
    if (complianceTotal > 0) {
      logCanaryScore({
        traceId,
        name: "compliance_concern_span_coverage",
        value: complianceWithSpan / complianceTotal,
        metadata: {
          totalConcerns: complianceTotal,
          concernsWithSpan: complianceWithSpan,
          ...(complianceWithSpan > 0
            ? { averageSpansPerConcern: complianceSpanCount / complianceWithSpan }
            : {}),
        },
      });
    }
  }
}
