// lib/qc/editorial-compliance-reviewer.mjs
// A7.14 / A8.22: Rulebook-driven style, editorial, and compliance LLM review per statement.

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

const EDITORIAL_INTRO = `You are a senior editor at a leading financial publication
with deep experience reviewing investment analysis, copy and
commentary, and professional communications for institutional
audiences. You apply the same rigour to every sentence that
you would apply to copy destined for publication or
distribution to sophisticated investors.

You are reviewing a single sentence from a professional
financial document.

You will be given:
- The full draft text, for context
- The specific sentence under review, marked with [REVIEW THIS]
- The source evidence the writer had access to
- The document context: event type, output type, required version

Use the full draft to assess coherence, consistency, and
narrative logic. Your verdict and note must address the sentence
under review specifically.

Evaluate the statement below against each rule in the list.
For each rule, decide whether the statement violates it.`;

const EDITORIAL_CONSTRAINTS = `CONSTRAINTS
- Assess editorial quality only. Do not comment on source
  backing — that is assessed separately.
- The source evidence block is provided for context only. Do
  not assess the evidence text for style, formatting, or
  language quality. All concerns must be raised against the
  specific sentence marked [REVIEW THIS] in the draft, not
  against any text in the evidence block.
- Before raising any concern, ask yourself: would this concern
  disappear if the evidence block were removed from your context?
  If yes, do not raise it. Every concern must be grounded
  exclusively in the sentence marked [REVIEW THIS], not in
  anything you read in the evidence block.
- Apply a materiality threshold appropriate to the document type
  and length. In a short investment summary, raise only concerns
  that would meaningfully affect how a sophisticated reader
  interprets or acts on the sentence. Do not flag minor issues
  that are insignificant relative to the document's purpose.
- Be specific. A note that could apply to any sentence has
  failed.
- Be direct. No diplomatic softening.
- Surface all concerns found, ordered by severity — most
  significant first.
- A clean verdict requires genuine confidence. Do not default
  to clean when uncertain — flag the concern and let the
  writer judge.
- Any concern about formatting, currency notation, number style,
  punctuation, spelling conventions, or register — regardless of
  which concernCode is assigned — must produce soft_concern only.
  hard_concern is reserved exclusively for issues that materially
  affect the accuracy or integrity of what is being claimed. A
  formatting issue is never a hard_concern, even if labelled
  imprecision.
- Each entry in violations must represent a distinct issue.
  Do not assign multiple concern codes to the same underlying problem.
- Each concern note must address exactly one issue. Do not combine
  two separate observations into a single note. If a sentence has
  both a currency formatting issue and an acronym issue, raise them
  as two separate concerns with separate notes.`;

const STYLE_INTRO_PREFIX = `You are a style guide reviewer for`;

const STYLE_INTRO_SUFFIX = `documents.

You are reviewing a single sentence from a professional
financial document.

You will be given:
- Output type conventions that apply to this document
- The full draft text, for context
- The specific sentence under review, marked with [REVIEW THIS]
- The source evidence the writer had access to
- The document context: event type, output type, required version

Use the full draft to assess coherence, consistency, and
narrative logic. Your assessment must address the sentence
under review specifically.

Evaluate the statement below against each rule in the list.
For each rule, decide whether the statement violates it.`;

const COMPLIANCE_DOC_CONTEXT = `DOCUMENT CONTEXT INTERPRETATION
Use the document context provided to calibrate your review:

OUTPUT TYPE shapes the detail threshold and audience:
- Reporting commentary: brief periodic update for existing
  investors. Low detail threshold. Omissions acceptable if the
  document is intentionally concise.
- Investor letter: detailed event-driven update for existing
  investors. High detail threshold. Material omissions are more
  likely to be flagged.
- Press release: public-facing, event-driven. Must be appropriate
  for readers with no prior relationship to the firm. Avoid
  confidential or NDA-protected information.
- LinkedIn post: concise social media update. Very low detail
  threshold. Compliance exposure is minimal unless confidential
  information is disclosed.

REQUIRED VERSION is the most important compliance signal:
- Complete: full coverage permitted. Readers are existing investors
  subject to NDA. Confidential financials, non-public deal terms,
  and internal assessments may be included.
- Public: strict restrictions apply. Readers may not be NDA-bound.
  Do not flag omissions of information that is appropriately
  withheld for a public audience. Do flag any disclosure of
  non-public financials, confidential deal terms, or information
  that should not be in the public domain.

INVESTMENT THESIS DOCUMENTS: When the document is an investment
thesis, commentary, or recommendation, it is inherently an
affirmative case. Do not flag the absence of balance as a concern
unless the document makes claims that are materially misleading
without qualification. An investment thesis is not required to
present both sides equally.`;

const COMPLIANCE_INTRO = `You are a senior editor at a leading financial publication
with deep experience reviewing investment analysis, copy and
commentary, and professional communications for institutional
audiences. You have particular expertise in identifying
compliance risks in financial communications — not as a
lawyer, but as an experienced editor who knows where language
creates regulatory, reputational, or disclosure risk.

You are reviewing a single sentence from a professional
financial document.

${COMPLIANCE_DOC_CONTEXT}

You will be given:
- The full draft text, for context
- The specific sentence under review, marked with [REVIEW THIS]
- The document context: event type, output type, required version
- The source evidence the writer had access to

Use the full draft to assess balance, cherry-picking, and
consistency of treatment across the document. Your verdict
and note must address the sentence under review specifically.

The required version matters: Public version requires that
claims be supportable by publicly available information and
must not contain non-public financials, undisclosed deal
terms, or internal assessments not yet in the public domain.
Complete version permits greater detail for NDA-bound
investors but is not without constraint.

Evaluate the statement below against each rule in the list.
For each rule, decide whether the statement violates it.`;

const COMPLIANCE_VOICE = `VOICE STANDARD
Write all notes and directions in this voice:
- Neutral, professional, institution-grade tone.
- Assume a financially literate audience.
- Plain language over jargon. When specialised terminology is
  required, use it precisely and consistently.
- Avoid marketing language, superlatives, or subjective claims.
- Clear, concise sentences. No colloquial expressions or casual
  phrasing.
- Write in US English throughout (e.g. 'analyze' not 'analyse').`;

const COMPLIANCE_CONSTRAINTS = `CONSTRAINTS
- Assess compliance risk in language and disclosure only. Do
  not comment on prose style or evidence backing.
- Do not flag grammatical errors, spelling, punctuation, or prose
  style. These are editorial concerns. Assess compliance risk in
  language and disclosure only.
- Do not raise concerns about house style, writing style, style
  guide rules, writing guidelines, writing rules, formatting
  conventions, grammar, spelling, punctuation, or any other
  presentational or stylistic matter. These are exclusively
  editorial concerns. Only flag compliance risk in language,
  disclosure, balance, and appropriateness of content.
- For jurisdiction-specific rules, flag the risk pattern and
  note that jurisdiction-specific review is recommended rather
  than making a determination.
- Asset-level confidentiality requirements are not assessed
  here — apply your firm's information policies before
  publishing.
- Every note must quote the specific words from the sentence under
  review that create the risk, in single quotation marks. If you
  cannot point to a specific phrase, do not raise the concern.
  The phrases 'a reasonable reader', 'the audience', and 'the reader'
  are banned. Do not use them under any circumstances.
- Surface all concerns found, ordered by severity — most
  significant first.
- Each concern note must address exactly one issue. Do not combine
  two separate observations into a single note. If a sentence has
  both a currency formatting issue and an acronym issue, raise them
  as two separate concerns with separate notes.`;

const RESPONSE_JSON_INSTRUCTIONS = `Only evaluate the rules listed above. Do not raise concerns
outside this list.

RESPONSE FORMAT
Return a JSON object with exactly one key "violations" whose value is an array.
For each violated rule, include:
- concernCode (the rule id exactly as given in the list)
- note (one or two short sentences; direct, specific, reviewer voice; reference the actual words in the sentence; never generic; no system jargon)
- suggestedDirection (optional, short)
- suggestedRewrite (optional, if a specific rewrite applies)

If no rules are violated, return {"violations":[]}.

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

function formatRulesForPrompt(rules) {
  return rules
    .map((r, i) => `${i + 1}. ${r.id}: ${String(r.description).trim()} (severity: ${r.severity})`)
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

function aggregateVerdictFromConcerns(concerns, ruleMap) {
  let max = 0;
  for (const c of concerns) {
    const rule = ruleMap.get(c.concernCode);
    const s = rule?.severity ?? "soft_concern";
    max = Math.max(max, severityRank(s));
  }
  if (max >= 3) return "hard_concern";
  if (max >= 2) return "soft_concern";
  return "clean";
}

function sortConcernsBySeverity(concerns, ruleMap) {
  return [...concerns].sort((a, b) => {
    const ra = ruleMap.get(a.concernCode)?.severity ?? "soft_concern";
    const rb = ruleMap.get(b.concernCode)?.severity ?? "soft_concern";
    return severityRank(rb) - severityRank(ra);
  });
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

function buildEditorialUserPayload(draftMarked, sentenceText, evidenceBlock, ctx) {
  const eventLabel = getEventTypeLabel(ctx.eventType);
  const visLabel = getVisibilityLabel(ctx.requiredVersion);
  return `---

DOCUMENT CONTEXT
- Event type: ${eventLabel}
- Output type: ${ctx.outputTypeLabel}
- Required version: ${visLabel} (${String(ctx.requiredVersion)})

FULL DRAFT (sentence marked with [REVIEW THIS] where matched):
---
${draftMarked}
---

SPECIFIC SENTENCE (verbatim):
${sentenceText}

SOURCE EVIDENCE (factual context only — do not assess this
text for style, formatting, or language quality):
${evidenceBlock}`;
}

function buildStyleUserPayload(styleConventions, draftMarked, sentenceText, evidenceBlock, ctx) {
  const eventLabel = getEventTypeLabel(ctx.eventType);
  const visLabel = getVisibilityLabel(ctx.requiredVersion);
  return `${styleConventions}

---

DOCUMENT CONTEXT
- Event type: ${eventLabel}
- Output type: ${ctx.outputTypeLabel}
- Required version: ${visLabel} (${String(ctx.requiredVersion)})

FULL DRAFT (sentence marked with [REVIEW THIS] where matched):
---
${draftMarked}
---

SPECIFIC SENTENCE (verbatim):
${sentenceText}

SOURCE EVIDENCE (factual context only — do not assess this
text for style, formatting, or language quality):
${evidenceBlock}`;
}

function buildComplianceUserPayload(draftMarked, sentenceText, evidenceBlock, ctx) {
  const visLabel = getVisibilityLabel(ctx.requiredVersion);
  return `DOCUMENT CONTEXT
- Output type: ${ctx.outputTypeLabel}
- Required version: ${visLabel} (${String(ctx.requiredVersion)})

FULL DRAFT (sentence marked with [REVIEW THIS] where matched):
---
${draftMarked}
---

SPECIFIC SENTENCE (verbatim):
${sentenceText}

SOURCE EVIDENCE (factual context only — do not assess this
text for style, formatting, or language quality):
${evidenceBlock}`;
}

function buildEditorialSystemPrompt(outputTypeLabel, rules) {
  return `${EDITORIAL_INTRO}

You are reviewing for output type: ${outputTypeLabel}.

${EDITORIAL_CONSTRAINTS}

RULES:
${formatRulesForPrompt(rules)}

${RESPONSE_JSON_INSTRUCTIONS}`;
}

function buildStyleSystemPrompt(outputTypeLabel, rules) {
  return `${STYLE_INTRO_PREFIX} ${outputTypeLabel} ${STYLE_INTRO_SUFFIX}

${EDITORIAL_CONSTRAINTS}

RULES:
${formatRulesForPrompt(rules)}

${RESPONSE_JSON_INSTRUCTIONS}`;
}

function buildComplianceSystemPrompt(outputTypeLabel, rules) {
  return `${COMPLIANCE_INTRO}

You are reviewing for output type: ${outputTypeLabel}.

${COMPLIANCE_VOICE}

${COMPLIANCE_CONSTRAINTS}

RULES:
${formatRulesForPrompt(rules)}

${RESPONSE_JSON_INSTRUCTIONS}`;
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
 * A8.22: Run style-guide LLM review for one statement context.
 * @param {import("openai").default} client
 * @param {{ draftMarked: string, sentenceText: string, evidenceBlock: string, ctx: object, rules: object[] }} args
 */
export async function runStyleGuideReview(client, args) {
  const { draftMarked, sentenceText, evidenceBlock, ctx, rules } = args;
  const systemPrompt = buildStyleSystemPrompt(ctx.outputTypeLabel, rules);
  const conventions = buildOutputTypeConventionsBlock(ctx.outputType);
  const userContent = buildStyleUserPayload(conventions, draftMarked, sentenceText, evidenceBlock, ctx);
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
  return { raw, violations };
}

/**
 * A8.22: Run editorial LLM review for one statement context.
 * @param {import("openai").default} client
 * @param {{ draftMarked: string, sentenceText: string, evidenceBlock: string, ctx: object, rules: object[] }} args
 */
export async function runEditorialReview(client, args) {
  const { draftMarked, sentenceText, evidenceBlock, ctx, rules } = args;
  const systemPrompt = buildEditorialSystemPrompt(ctx.outputTypeLabel, rules);
  const userContent = buildEditorialUserPayload(draftMarked, sentenceText, evidenceBlock, ctx);
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
  return { raw, violations };
}

/**
 * A8.22: Run compliance LLM review for one statement context.
 * @param {import("openai").default} client
 * @param {{ draftMarked: string, sentenceText: string, evidenceBlock: string, ctx: object, rules: object[] }} args
 */
export async function runComplianceReview(client, args) {
  const { draftMarked, sentenceText, evidenceBlock, ctx, rules } = args;
  const systemPrompt = buildComplianceSystemPrompt(ctx.outputTypeLabel, rules);
  const userContent = buildComplianceUserPayload(draftMarked, sentenceText, evidenceBlock, ctx);
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
  return { raw, violations };
}

function applyComplianceResult(qcCard, violations, ruleMap) {
  const allowed = new Set(ruleMap.keys());
  const normalized = [];
  for (const v of violations) {
    const n = normalizeViolation(v, "compliance", allowed);
    if (n) normalized.push(n);
  }
  const sorted = sortConcernsBySeverity(normalized, ruleMap);
  qcCard.complianceConcerns = sorted;
  qcCard.complianceVerdict = aggregateVerdictFromConcerns(sorted, ruleMap);
  if (sorted.length === 0) {
    qcCard.complianceNote = "No compliance concerns identified under the listed rules.";
    qcCard.complianceSuggestedDirection = null;
    qcCard.complianceSuggestedRewrite = null;
  } else {
    qcCard.complianceNote = null;
    const top = sorted[0];
    qcCard.complianceSuggestedDirection = top.suggestedDirection ?? null;
    qcCard.complianceSuggestedRewrite = top.suggestedRewrite ?? null;
  }
}

function applyMergedEditorialAndStyle(qcCard, styleViolations, editorialViolations, styleRules, editorialRules) {
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

  const sorted = sortConcernsBySeverity(merged, mergedMap);
  qcCard.editorialConcerns = sorted;
  qcCard.editorialVerdict = aggregateVerdictFromConcerns(sorted, mergedMap);
  if (sorted.length === 0) {
    qcCard.editorialNote = "No editorial or style concerns identified under the listed rules.";
    qcCard.editorialSuggestedDirection = null;
    qcCard.editorialSuggestedRewrite = null;
  } else {
    qcCard.editorialNote = null;
    const top = sorted[0];
    qcCard.editorialSuggestedDirection = top.suggestedDirection ?? null;
    qcCard.editorialSuggestedRewrite = top.suggestedRewrite ?? null;
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
  const ctx = { outputType, requiredVersion, eventType, outputTypeLabel };

  const outputSlug = rulebookOutputSlug(outputType);
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
    toProcess.map(async (stmt) => {
      if (!stmt || typeof stmt !== "object") return;
      if (!stmt.qcCard || typeof stmt.qcCard !== "object") return;

      const sentenceText = typeof stmt.text === "string" ? stmt.text : "";
      const draftMarked = buildMarkedDraft(draftText, sentenceText);
      const evidenceBlock = buildEvidenceBlock(stmt);

      if (!editorialEnabled) {
        clearEditorialQcCard(stmt.qcCard);
      }
      if (!complianceEnabled) {
        clearComplianceQcCard(stmt.qcCard);
      }

      const reviewArgs = { draftMarked, sentenceText, evidenceBlock, ctx };
      const styleP = editorialEnabled && runStyleGuideReview(client, { ...reviewArgs, rules: styleFiltered });
      const editorialP = editorialEnabled && runEditorialReview(client, { ...reviewArgs, rules: editorialFiltered });
      const complianceP = complianceEnabled && runComplianceReview(client, { ...reviewArgs, rules: complianceFiltered });

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
            applyMergedEditorialAndStyle(stmt.qcCard, styleV, edV, styleFiltered, editorialFiltered);
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
            applyComplianceResult(stmt.qcCard, complianceV, complianceMap);
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
            applyMergedEditorialAndStyle(stmt.qcCard, styleV, edV, styleFiltered, editorialFiltered);
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
            applyComplianceResult(stmt.qcCard, complianceV, complianceMap);
          }
        }
      }
    })
  );
}
