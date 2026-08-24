// lib/qc/editorial-compliance-reviewer.mjs
// A7.14 / A8.22–A8.30: Rulebook-driven style, editorial, and compliance LLM review per statement.

import { outputTypeGuidance } from "../prompt-library/outputTypeGuidance.js";
import styleGuideRules from "../rulebook/styleGuide.js";
import editorialRules from "../rulebook/editorialRules.js";
import { formatStyleGuideRulesForPrompt, resolveStyleGuide } from "./style-guide.mjs";
import complianceRules from "../rulebook/complianceRules.js";
import {
  OUTPUT_TYPE,
  VISIBILITY,
  normalizeOutputType,
  normalizeVisibility,
  getOutputTypeLabel,
  getVisibilityLabel,
} from "../output-intent.js";
import { callLLM, hasProviderApiKey, logCanaryScore } from "../observability.js";
import { buildSourcePublicationStateBlock } from "../source-publication-state.mjs";
import { STAGE_MODELS } from "./model-config.mjs";
import { applyEvaluativeDeletionBounds } from "./evaluative-language.mjs";
import {
  FIRST_PERSON_ACTOR_INSTRUCTION,
  applyViewMarkerSubjectBounds,
  buildFirstPersonActorInstruction,
  formatAuthoringOrganisationPromptBlock,
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
Example for two thousand_separator violations:
'The statement uses a comma as a thousands separator instead of a high comma. Replace "5,500" with "5'500" and "10,000" with "10'000".'`;

const STYLE_META_RULES = `META-RULES
- ${VIOLATIONS_ONLY_CONTRACT}
- Only evaluate the rules in the list provided. Do not raise concerns outside this list.
- Style rules do not apply to text inside quotation marks, blockquotes, or cited passages. Only flag violations in the surrounding prose. When quoting a source, preserve the source's original formatting exactly.
- Keep notes concise: one to two sentences per concern.
- Each violation must name the rule id and the specific wording or pattern that triggers it.
- ${SUGGESTED_DIRECTION_FORMAT_META}
- ${CONCERN_TEXT_META}
- ${ONE_CONCERN_PER_RULE_META}`;

const EDITORIAL_PREAMBLE = `You are a senior editor at a top-tier financial publication reviewing a draft for a writer. You value precision, clean structure, and a direct line of argument. Your feedback is constructive and craft-oriented. You prefer short sentences over long ones, active voice over passive, concrete nouns over abstract ones, and specific claims over vague ones. You flag hedging that softens a clear statement, and overreach that extends beyond the evidence. You care about rhythm and readability. Your voice is measured, authoritative, and unsentimental.`;

const EDITORIAL_EVALUATION_SCOPE = `You evaluate only the CURRENT STATEMENT. Phrases, figures, or facts appearing in CONTEXT BEFORE or CONTEXT AFTER are for reference only — do not raise concerns about them. The single exception is narrative_coherence (E8), which evaluates how the CURRENT STATEMENT flows with the surrounding context. All other rules apply strictly to the CURRENT STATEMENT.`;

const EDITORIAL_META_RULES = `META-RULES
- Only evaluate the rules in the list provided. Do not raise concerns outside this list.
- Style-of-writing concerns about formatting, spelling, and mechanical convention are not your responsibility — those belong to a separate reviewer.
- Keep notes concise: one to two sentences per concern.
- Each note must be actionable: say what is wrong and what the writer should do about it.
- Style rules do not apply to text inside quotation marks, blockquotes, or cited passages.
- The SOURCE EVIDENCE block below is supplementary context; do not raise editorial concerns about text that appears only there and not in the CURRENT STATEMENT.
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

function firstPersonActorPromptBlock(houseName) {
  return `FIRST-PERSON REMOVAL (applies equally to first_person_plural and voice_consistency)
${buildFirstPersonActorInstruction(houseName)}`;
}

const COMMENTARY_CALIBRATION_CONCERN_PROSE = `COMMENTARY PROSE CALIBRATION
Apply to every note and suggestedDirection (and concernText when returned):

Source language (editorial and compliance concern prose):
- Do NOT reference the tool's evidence-selection mechanism. Never use "the evidence excerpt", "the excerpt", "the passage", or "the snippet" in concern prose.
- If a note needs to refer to source support, say "the source". This mirrors the Stage 5 evidence-commentary rule.

Register:
- For voice_consistency: describe the issue in plain terms (e.g. active vs passive voice, first person vs third person). Do not rely on abstract labels like "voice consistency" without saying what the reader sees.
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

- A statement being supported or confirmed by a source is NOT evidence of redundancy or immateriality. Source confirmation is an Evidence matter, not an editorial-value test.
- Flag immateriality only when the CURRENT STATEMENT adds nothing relative to surrounding DRAFT sentences — e.g. it restates a point already made in CONTEXT BEFORE or CONTEXT AFTER, introduces an incidental fact with no bearing on the draft's line of argument, or fails to advance the thesis given its position in the draft.
- Do NOT flag a statement as immaterial because it matches, paraphrases, or repeats source content. Matching the source is expected for evidenced claims; the question is whether the sentence earns its place in the draft.`;

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

function liveActorDescription(description, houseName) {
  const text = String(description || "");
  if (!text.includes(FIRST_PERSON_ACTOR_INSTRUCTION)) return text;
  return text.replace(FIRST_PERSON_ACTOR_INSTRUCTION, buildFirstPersonActorInstruction(houseName));
}

function formatRulesForPrompt(rules, outputSlug, kind, houseName) {
  return rules
    .map((r, i) => {
      const sev = effectiveSeverity(r, outputSlug);
      const description = liveActorDescription(r.description, houseName);
      let block = `${i + 1}. ${r.id}: ${description.trim()}\n   severity (default): ${sev}`;
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
      const reviewerNote =
        kind === "compliance" || kind === "editorial" ? effectiveReviewerNote(r, outputSlug) : null;
      if (reviewerNote) {
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
const STYLE_RULE_DETERMINISTIC_FILTERS = {
  oxford_comma: (citedSpan, _statementText) => {
    const hasComma = citedSpan.includes(",");
    const hasConjunction = / and /i.test(citedSpan) || / or /i.test(citedSpan);
    if (!hasComma && hasConjunction) {
      console.log(
        `[style_guide] oxford_comma concern dropped by deterministic filter ` +
          `(cited span "${citedSpan}" has no comma — two-item list)`
      );
      return false;
    }
    return true;
  },
  english_variant: (citedSpan, _statementText) => {
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
  date_format: (citedSpan, _statementText) => {
    const FULL_MONTH_DATE =
      /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i;
    if (FULL_MONTH_DATE.test(String(citedSpan || "").trim())) {
      console.log(
        `[style_guide] date_format concern dropped by deterministic filter ` +
          `(cited span "${citedSpan}" already matches DD FullMonthName YYYY)`
      );
      return false;
    }
    return true;
  },
  number_spelling: (citedSpan, _statementText) => {
    const trimmed = String(citedSpan || "").trim();
    const PERCENT_TOKEN = /\d[\d.,]*\s*(?:%|percent)\b/i;
    if (PERCENT_TOKEN.test(trimmed)) {
      console.log(
        `[style_guide] number_spelling concern dropped by deterministic filter ` +
          `(cited span "${citedSpan}" is a percentage token — use percentage_notation instead)`
      );
      return false;
    }
    if (isQuarterNotationSpan(trimmed)) {
      console.log(
        `[style_guide] number_spelling concern dropped by deterministic filter ` +
          `(cited span "${citedSpan}" is quarter notation, not a number-spelling violation)`
      );
      return false;
    }
    const SPELLED_0_TO_12 =
      /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;
    if (SPELLED_0_TO_12.test(trimmed)) {
      console.log(
        `[style_guide] number_spelling concern dropped by deterministic filter ` +
          `(cited span "${citedSpan}" is a spelled-out 0–12 number — already correct)`
      );
      return false;
    }
    return true;
  },
  percentage_notation: (citedSpan, statementText) => {
    const trimmed = String(citedSpan || "").trim();
    const fullText = String(statementText || "");
    if (/\d[\d.,]*\s*%/.test(trimmed) && !/\bper\s?cent\b/i.test(trimmed)) {
      console.log(
        `[style_guide] percentage_notation concern dropped by deterministic filter ` +
          `(cited span "${citedSpan}" already uses % symbol)`
      );
      return false;
    }
    if (/\d[\d.,]*\s*%/.test(fullText) && !/\d[\d.,]*\s+per\s?cent\b/i.test(fullText)) {
      console.log(
        `[style_guide] percentage_notation concern dropped by deterministic filter ` +
          `(statement uses % symbol throughout — already correct)`
      );
      return false;
    }
    return true;
  },
  thousand_separator: (citedSpan, statementText) => {
    const fullText = String(statementText || "");
    const hasApostropheSeparator = /\d['\u2019]\d{3}/.test(fullText);
    const hasCommaSeparator = /\d,\d{3}/.test(fullText);
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
  first_person_plural: (citedSpan, statementText) => {
    const text = String(citedSpan || statementText || "");
    const FIRST_PERSON_RE = /\b(?:we|our|ours|us|we're|we've|we'll|we'd|ourselves)\b/i;
    if (!FIRST_PERSON_RE.test(text)) {
      console.log(
        `[style_guide] first_person_plural concern dropped by deterministic filter ` +
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
};

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

export function applyDeterministicStyleFilters(concerns, statementText, fullDraftText) {
  if (!Array.isArray(concerns)) return concerns;
  return concerns.filter((c) => {
    const ruleId = typeof c?.rule === "string" ? c.rule : typeof c?.concernCode === "string" ? c.concernCode : "";
    if (!ruleId) return true;
    const filter = STYLE_RULE_DETERMINISTIC_FILTERS[ruleId];
    if (!filter) return true;
    const spans = Array.isArray(c.span) ? c.span : [];
    const firstSpan = spans[0];
    if (
      !firstSpan ||
      typeof firstSpan.startChar !== "number" ||
      typeof firstSpan.endChar !== "number"
    ) {
      return true;
    }
    const cited = String(statementText || "").slice(firstSpan.startChar, firstSpan.endChar);
    return filter(cited, statementText, fullDraftText);
  });
}

function applyFidelityGate({ violations, reviewer, statementIndex, statementText, evidenceExcerpt }) {
  const list = Array.isArray(violations) ? violations : [];
  const kept = [];
  for (const concern of list) {
    const check = verifyFidelity({ concern, statementText, evidenceExcerpt });
    if (check.pass) {
      kept.push(concern);
      continue;
    }
    const rule = typeof concern?.concernCode === "string" && concern.concernCode.trim() ? concern.concernCode.trim() : "(unknown)";
    console.log(
      `[FIDELITY_DROP] statementIndex=${statementIndex} reviewer=${reviewer} rule=${rule} reason="${check.reason ?? "failed fidelity check"}"`
    );
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

OUTPUT TYPE CALIBRATION (LinkedIn post): Conversational and first-person register are acceptable — first-person singular author voice and third-person firm subject in deal announcements are both valid; do not flag either as voice inconsistency. Hooks and openers such as "Excited to see" are acceptable register, not too informal. Name-plus-relative-clause fragments and short list-style lines are acceptable structure. Standard qualitative descriptors ("strong", "substantial", "high-quality") are not promotional excess. Still flag genuine faults — unsupported claims, real incoherence, run-ons, internal contradictions.`;
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

function buildEditorialUserPayload(
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
  const excerptBlock =
    typeof sourceExcerpt === "string" && sourceExcerpt.trim()
      ? sourceExcerpt.trim()
      : "(no excerpt available)";
  // eventType removed (B28); re-add if R6.14 event-type-aware review ships.
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
- Output type: ${ctx.outputTypeLabel}
- Required version: ${visLabel} (${String(ctx.requiredVersion)})

${formatAuthoringOrganisationPromptBlock(draftMarked, ctxHouseName(ctx))}

FULL DRAFT (current sentence marked with [REVIEW THIS] where matched):
---
${draftMarked}
---

SOURCE EVIDENCE (factual context only — do not assess this
text for style, formatting, or language quality):
${evidenceBlock}`;
}

function buildEditorialStyleUserPayload({
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
  const excerptBlock =
    typeof evidenceExcerpt === "string" && evidenceExcerpt.trim()
      ? evidenceExcerpt.trim()
      : "(no excerpt available)";
  const draftMarked = buildMarkedDraft(typeof draftText === "string" ? draftText : "", sentenceText);
  // eventType removed (B28); re-add if R6.14 event-type-aware review ships.
  return `OUTPUT TYPE: ${outputTypeLabel}

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
- Output type: ${outputTypeLabel}
- Required version: ${visLabel} (${String(requiredVersion)})

${formatAuthoringOrganisationPromptBlock(draftText, resolveAuthoringOrganisationName(authoringOrganisation))}

FULL DRAFT (current sentence marked with [REVIEW THIS] where matched):
---
${draftMarked}
---

SOURCE EVIDENCE (factual context only — do not assess this
text for style, formatting, or language quality):
${evidenceBlock}`;
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

function buildComplianceUserPayload(sentenceText, ctx) {
  const visLabel = getVisibilityLabel(ctx.requiredVersion);
  const publicationBlock = buildSourcePublicationStateBlock(ctx.sources);
  return `OUTPUT TYPE: ${ctx.outputTypeLabel}
VERSION: ${visLabel} (${String(ctx.requiredVersion)})

CURRENT STATEMENT:
${sentenceText}${publicationBlock}`;
}

function buildEditorialSystemPrompt(outputTypeLabel, rules, outputSlug, outputType, houseName) {
  const outputTypeCalibration = buildEditorialOutputTypeCalibration(outputType);
  const calibrationBlock = outputTypeCalibration
    ? `${VISIBILITY_CALIBRATION_EDITORIAL_STYLE}\n\n${outputTypeCalibration}`
    : VISIBILITY_CALIBRATION_EDITORIAL_STYLE;
  return `${EDITORIAL_PREAMBLE}

You are reviewing for output type: ${outputTypeLabel}.

${EDITORIAL_EVALUATION_SCOPE}

${VIOLATIONS_ONLY_CONTRACT}

${EDITORIAL_META_RULES}

${EDITORIAL_MATERIALITY_AND_INFORMATION_VALUE}

${firstPersonActorPromptBlock(houseName)}

${calibrationBlock}

RULES:
${formatRulesForPrompt(rules, outputSlug, "editorial", houseName)}

${RESPONSE_JSON_EDITORIAL_COMPLIANCE}`;
}

function buildStyleSystemPrompt(outputTypeLabel, rules, outputSlug, outputType, houseName) {
  const conventions = buildOutputTypeConventionsBlock(outputType);
  return `${STYLE_PREAMBLE} Output type: ${outputTypeLabel}.

${STYLE_META_RULES}

${STYLE_SCOPE_CURRENT_ONLY}

${firstPersonActorPromptBlock(houseName)}

OUTPUT-TYPE VOICE AND STRUCTURE (reference only — not the text under review):
${conventions}

RULES:
${formatRulesForPrompt(rules, outputSlug, "style", houseName)}

${RESPONSE_JSON_STYLE}`;
}

function buildEditorialStyleSystemPrompt({
  outputTypeLabel,
  editorialRules,
  structuredStyleRules,
  outputSlug,
  outputType,
  houseName,
}) {
  const conventions = buildOutputTypeConventionsBlock(outputType);
  const styleBlock = formatStyleGuideRulesForPrompt(structuredStyleRules);
  const outputTypeCalibration = buildEditorialOutputTypeCalibration(outputType);
  const calibrationBlock = outputTypeCalibration
    ? `${VISIBILITY_CALIBRATION_EDITORIAL_STYLE}\n\n${outputTypeCalibration}`
    : VISIBILITY_CALIBRATION_EDITORIAL_STYLE;
  return `${EDITORIAL_STYLE_COMBINED_PREAMBLE}

You are reviewing for output type: ${outputTypeLabel}.

${EDITORIAL_EVALUATION_SCOPE}

${STYLE_SCOPE_CURRENT_ONLY}

${VIOLATIONS_ONLY_CONTRACT}

${EDITORIAL_META_RULES}

${EDITORIAL_MATERIALITY_AND_INFORMATION_VALUE}

${STYLE_META_RULES}

${firstPersonActorPromptBlock(houseName)}

OUTPUT-TYPE VOICE AND STRUCTURE (reference only — not the text under review):
${conventions}

${calibrationBlock}

## Editorial rules
${formatRulesForPrompt(editorialRules, outputSlug, "editorial", houseName)}

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
    ctxHouseName(ctx)
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
    ctxHouseName(ctx)
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
    editorialRules,
    outputSlug,
    authoringOrganisation,
    traceId,
    statementIndex,
  } = args;
  const idx = statementIndex ?? null;
  const houseName = resolveAuthoringOrganisationName(authoringOrganisation);
  const structuredStyleRules = resolveStyleGuide({ outputType, authoringOrganisation });
  const modelConfig = STAGE_MODELS["editorial-style-review"];
  const systemPrompt = buildEditorialStyleSystemPrompt({
    outputTypeLabel,
    editorialRules,
    structuredStyleRules,
    outputSlug,
    outputType,
    houseName,
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
    console.warn("[EDITORIAL_STYLE_REVIEW] schema validation failed after retry; applying clean fallback", {
      statementIndex: idx,
      retried,
    });
    return {
      editorialConcerns: [],
      editorialVerdict: "not_reviewed",
      editorialNote: "",
      editorialSuggestedDirection: null,
      editorialSuggestedRewrite: null,
      retried,
      schemaValid: false,
    };
  }

  const fidelityChecked = applyFidelityGate({
    violations: combined.normalized,
    reviewer: "editorial-style",
    statementIndex: idx,
    statementText: sentenceText,
    evidenceExcerpt,
  });
  const withSpans = attachConcernSpans(fidelityChecked, sentenceText);
  const styleFiltered = applyDeterministicStyleFilters(withSpans, sentenceText, draftText);
  const noOpFiltered = suppressNoOpSuggestions(styleFiltered, sentenceText);
  const restatementBound = applyEvaluativeDeletionBounds(noOpFiltered, sentenceText);
  const viewMarkerBound = applyViewMarkerSubjectBounds(restatementBound, sentenceText, houseName);
  const sorted = sortConcernsBySeverity(viewMarkerBound, mergedMap, outputSlug);
  const hasConcerns = sorted.length > 0;
  return {
    editorialConcerns: sorted,
    editorialVerdict: hasConcerns ? "concern" : "clean",
    editorialNote: hasConcerns ? null : "No editorial or style concerns identified under the listed rules.",
    editorialSuggestedDirection: pickFirstConcernField(sorted, "suggestedDirection"),
    editorialSuggestedRewrite: pickFirstConcernField(sorted, "suggestedRewrite"),
    retried,
    schemaValid: true,
  };
}

/**
 * A8.22 / A8.25: Run compliance LLM review (CURRENT STATEMENT user payload only).
 * @param {import("openai").default} client
 * @param {{ sentenceText: string, ctx: object, rules: object[], statementIndex?: number|null }} args
 */
export async function runComplianceReview(args) {
  const { sentenceText, ctx, rules, statementIndex, traceId } = args;
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
  const raw = completion?.text;
  const violations = parseViolationsArray(raw);
  const concernCount = Array.isArray(violations) ? violations.length : 0;
  console.log("[COMPLIANCE_REVIEW] completed", { statementIndex: idx, concernCount });
  return { raw, violations };
}

function applyComplianceResult(qcCard, violations, ruleMap, outputSlug, statementText = null) {
  const allowed = new Set(ruleMap.keys());
  const normalized = [];
  for (const v of violations) {
    const n = normalizeViolation(v, "compliance", allowed);
    if (n) normalized.push(n);
  }
  const withSpans =
    typeof statementText === "string" && statementText
      ? attachConcernSpans(normalized, statementText)
      : normalized;
  const sorted = sortConcernsBySeverity(withSpans, ruleMap, outputSlug);
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

  const bounded = applyViewMarkerSubjectBounds(
    applyEvaluativeDeletionBounds(merged, sentenceText),
    sentenceText,
    houseName
  );
  const sorted = sortConcernsBySeverity(bounded, mergedMap, outputSlug);
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
  const useCombinedEditorialStyle = documentContext.pipelineRoute === "v4";

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

  const styleProvider = STAGE_MODELS["style-review"]?.provider;
  const editorialProvider = STAGE_MODELS["editorial-review"]?.provider;
  const editorialStyleProvider = STAGE_MODELS["editorial-style-review"]?.provider;
  const complianceProvider = STAGE_MODELS["compliance-review"]?.provider;
  const missingProviderKey =
    (editorialEnabled &&
      (useCombinedEditorialStyle
        ? !hasProviderApiKey(editorialStyleProvider)
        : !hasProviderApiKey(styleProvider) || !hasProviderApiKey(editorialProvider))) ||
    (complianceEnabled && !hasProviderApiKey(complianceProvider));
  if (missingProviderKey) {
    console.warn("[EDITORIAL_COMPLIANCE_ERROR] missing LLM provider API key for configured review models");
    return;
  }
  const traceId = typeof documentContext?.traceId === "string" ? documentContext.traceId : undefined;

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
      const editorialStyleP =
        editorialEnabled &&
        useCombinedEditorialStyle &&
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
        });
      const styleP =
        editorialEnabled &&
        !useCombinedEditorialStyle &&
        runStyleGuideReview({ sentenceText, ctx, rules: styleFiltered, statementIndex, traceId });
      const editorialP =
        editorialEnabled &&
        !useCombinedEditorialStyle &&
        runEditorialReview({
          ...reviewArgs,
          rules: editorialFiltered,
          previousText,
          nextText,
          sourceExcerpt,
          statementIndex,
          traceId,
        });
      const complianceP =
        complianceEnabled &&
        runComplianceReview({ sentenceText, ctx, rules: complianceFiltered, statementIndex, traceId });

      if (useCombinedEditorialStyle && editorialEnabled && complianceEnabled) {
        const [editorialStyleSettled, complianceSettled] = await Promise.allSettled([editorialStyleP, complianceP]);
        if (editorialStyleSettled.status !== "fulfilled") {
          console.warn("[EDITORIAL_COMPLIANCE_ERROR] combined editorial/style review failed", {
            editorialStyle: editorialStyleSettled.status,
          });
          clearEditorialQcCard(stmt.qcCard);
        } else {
          const result = editorialStyleSettled.value;
          stmt.qcCard.editorialConcerns = Array.isArray(result?.editorialConcerns) ? result.editorialConcerns : [];
          stmt.qcCard.editorialVerdict =
            typeof result?.editorialVerdict === "string" ? result.editorialVerdict : "clean";
          stmt.qcCard.editorialNote = typeof result?.editorialNote === "string" ? result.editorialNote : null;
          stmt.qcCard.editorialSuggestedDirection =
            typeof result?.editorialSuggestedDirection === "string" ? result.editorialSuggestedDirection : null;
          stmt.qcCard.editorialSuggestedRewrite =
            typeof result?.editorialSuggestedRewrite === "string" ? result.editorialSuggestedRewrite : null;
        }

        if (complianceSettled.status !== "fulfilled") {
          console.warn("[EDITORIAL_COMPLIANCE_ERROR]", complianceSettled.reason?.message || String(complianceSettled.reason));
          clearComplianceQcCard(stmt.qcCard);
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
            clearComplianceQcCard(stmt.qcCard);
          } else {
            const complianceV = applyFidelityGate({
              violations: complianceRaw,
              reviewer: "compliance",
              statementIndex,
              statementText: sentenceText,
              evidenceExcerpt: sourceExcerpt,
            });
            applyComplianceResult(
              stmt.qcCard,
              complianceV,
              complianceMap,
              outputSlug,
              useCombinedEditorialStyle ? sentenceText : null
            );
          }
        }
        return;
      }

      if (useCombinedEditorialStyle && editorialEnabled) {
        let editorialStyleSettled;
        try {
          const value = await editorialStyleP;
          editorialStyleSettled = { status: "fulfilled", value };
        } catch (reason) {
          editorialStyleSettled = { status: "rejected", reason };
        }
        if (editorialStyleSettled.status !== "fulfilled") {
          clearEditorialQcCard(stmt.qcCard);
        } else {
          const result = editorialStyleSettled.value;
          stmt.qcCard.editorialConcerns = Array.isArray(result?.editorialConcerns) ? result.editorialConcerns : [];
          stmt.qcCard.editorialVerdict =
            typeof result?.editorialVerdict === "string" ? result.editorialVerdict : "clean";
          stmt.qcCard.editorialNote = typeof result?.editorialNote === "string" ? result.editorialNote : null;
          stmt.qcCard.editorialSuggestedDirection =
            typeof result?.editorialSuggestedDirection === "string" ? result.editorialSuggestedDirection : null;
          stmt.qcCard.editorialSuggestedRewrite =
            typeof result?.editorialSuggestedRewrite === "string" ? result.editorialSuggestedRewrite : null;
        }
        return;
      }

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
          const styleRaw = styleSettled.value?.violations;
          const edRaw = editorialSettled.value?.violations;
          if (styleRaw == null || edRaw == null) {
            logCanaryScore({
              traceId,
              name: "schema_validation_failed",
              value: 1,
              comment: "Editorial/style reviewer returned invalid schema.",
            });
            console.warn("[EDITORIAL_COMPLIANCE_ERROR] parse failed", {
              stylePreview: String(styleSettled.value?.raw).slice(0, 200),
              editorialPreview: String(editorialSettled.value?.raw).slice(0, 200),
            });
            clearEditorialQcCard(stmt.qcCard);
          } else {
            const styleV = applyFidelityGate({
              violations: styleRaw,
              reviewer: "style",
              statementIndex,
              statementText: sentenceText,
              evidenceExcerpt: sourceExcerpt,
            });
            const edV = applyFidelityGate({
              violations: edRaw,
              reviewer: "editorial",
              statementIndex,
              statementText: sentenceText,
              evidenceExcerpt: sourceExcerpt,
            });
            applyMergedEditorialAndStyle(
              stmt.qcCard,
              styleV,
              edV,
              styleFiltered,
              editorialFiltered,
              outputSlug,
              sentenceText,
              ctxHouseName(ctx)
            );
          }
        }

        if (complianceSettled.status !== "fulfilled") {
          console.warn("[EDITORIAL_COMPLIANCE_ERROR]", complianceSettled.reason?.message || String(complianceSettled.reason));
          clearComplianceQcCard(stmt.qcCard);
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
            clearComplianceQcCard(stmt.qcCard);
          } else {
            const complianceV = applyFidelityGate({
              violations: complianceRaw,
              reviewer: "compliance",
              statementIndex,
              statementText: sentenceText,
              evidenceExcerpt: sourceExcerpt,
            });
            applyComplianceResult(
              stmt.qcCard,
              complianceV,
              complianceMap,
              outputSlug,
              useCombinedEditorialStyle ? sentenceText : null
            );
          }
        }
      } else if (editorialEnabled) {
        const [styleSettled, editorialSettled] = await Promise.allSettled([styleP, editorialP]);
        if (styleSettled.status !== "fulfilled" || editorialSettled.status !== "fulfilled") {
          console.warn("[EDITORIAL_COMPLIANCE_ERROR] style or editorial review failed");
          clearEditorialQcCard(stmt.qcCard);
        } else {
          const styleRaw = styleSettled.value?.violations;
          const edRaw = editorialSettled.value?.violations;
          if (styleRaw == null || edRaw == null) {
            clearEditorialQcCard(stmt.qcCard);
          } else {
            const styleV = applyFidelityGate({
              violations: styleRaw,
              reviewer: "style",
              statementIndex,
              statementText: sentenceText,
              evidenceExcerpt: sourceExcerpt,
            });
            const edV = applyFidelityGate({
              violations: edRaw,
              reviewer: "editorial",
              statementIndex,
              statementText: sentenceText,
              evidenceExcerpt: sourceExcerpt,
            });
            applyMergedEditorialAndStyle(
              stmt.qcCard,
              styleV,
              edV,
              styleFiltered,
              editorialFiltered,
              outputSlug,
              sentenceText,
              ctxHouseName(ctx)
            );
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
          const complianceRaw = complianceSettled.value?.violations;
          const complianceMap = buildRuleMap(complianceFiltered);
          if (complianceRaw == null) {
            clearComplianceQcCard(stmt.qcCard);
          } else {
            const complianceV = applyFidelityGate({
              violations: complianceRaw,
              reviewer: "compliance",
              statementIndex,
              statementText: sentenceText,
              evidenceExcerpt: sourceExcerpt,
            });
            applyComplianceResult(
              stmt.qcCard,
              complianceV,
              complianceMap,
              outputSlug,
              useCombinedEditorialStyle ? sentenceText : null
            );
          }
        }
      }
    })
  );

  if (useCombinedEditorialStyle && traceId) {
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
