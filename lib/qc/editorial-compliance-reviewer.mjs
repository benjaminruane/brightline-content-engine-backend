// lib/qc/editorial-compliance-reviewer.mjs
// A7.14: Optional LLM editorial + compliance review per statement (after evidence QC).

import { DEFAULT_STYLE_GUIDE } from "../../helpers/styleGuides.js";
import { outputTypeGuidance } from "../prompt-library/outputTypeGuidance.js";
import {
  OUTPUT_TYPE,
  normalizeOutputType,
  normalizeVisibility,
  getOutputTypeLabel,
  getVisibilityLabel,
} from "../output-intent.js";
import { normalizeEventType, getEventTypeLabel } from "../event-type.js";

const EDITORIAL_SYSTEM_PROMPT = `You are a senior editor at a leading financial publication
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
- The house style rules that apply to this document

Use the full draft to assess coherence, consistency, and
narrative logic. Your verdict and note must address the sentence
under review specifically.

Assess across the following dimensions. Not every dimension
will apply — use judgment.

PRECISION
Is the sentence stated with exactly the right degree of
certainty? Flag any mismatch between the certainty of the
language and what the evidence actually supports.

MATERIALITY
Does this sentence earn its place in the document? Flag
sentences that add no meaningful information for this audience
and document type.

NARRATIVE COHERENCE
Does this sentence follow logically from its context in the
full draft? Flag sentences that break the logical flow or
assume context not yet established.

REGISTER AND PRECISION OF LANGUAGE
Flag vague quantifiers where precise figures are available.
Flag jargon used imprecisely. Flag language pitched at the
wrong level for the intended reader.

OVERREACH AND UNDERREACH
Overreach: claiming more than the evidence supports.
Underreach: hedging so heavily the sentence loses meaning.
Both are editorial failures.

STRUCTURAL INTEGRITY
Flag hidden dependencies and unearned causal claims.

INTERNAL PLAUSIBILITY AND BUSINESS LOGIC
Flag claims that are internally inconsistent with other
statements, defy normal business logic, or assert a
relationship that does not follow from the surrounding context.
This is not external fact-checking — it is a judgment about
coherence within the document itself.

AUDIENCE CALIBRATION
Even for existing investors, do not assume they will recall
specific metrics or prior developments — each document should
be substantially self-contained. Flag sentences that assume
too much prior knowledge or omit necessary context.

HOUSE STYLE
Flag any violation of the house style rules injected above —
number formatting, currency conventions, punctuation, US
English spelling, or register.

RESPONSE FORMAT
Return a JSON object with exactly these fields:
{
  "editorialVerdict": "clean" | "soft_concern" | "hard_concern",
  "editorialConcerns": [
    {
      "concernCode": "overreach" | "underreach" | "imprecision" |
                     "misalignment" | "immaterial" | "incoherent" |
                     "register" | "implausible" |
                     "unsupported_causal" |
                     "internal_contradiction" |
                     "audience_calibration" | "house_style",
      "note": "1 to 3 sentences. Direct, specific, reviewer
               voice. Reference the actual words in the sentence.
               Never generic."
    }
  ],
  "editorialNote": "If clean: one sentence confirming what makes
                    this sentence editorially sound. If concerns
                    exist: null.",
  "suggestedDirection": "One actionable direction for the most
                          significant concern. Not a rewrite. What
                          should change and why, in one sentence.
                          Null if clean.",
  "suggestedRewrite": "A suggested rewrite of the sentence, or a
                       structural suggestion if a rewrite is not
                       the right fix. Null if clean."
}

editorialVerdict reflects the most significant concern found:
hard_concern: materially affects accuracy, integrity, or
              appropriateness
soft_concern: minor, stylistic, or marginal
clean: no concerns found

CONSTRAINTS
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
- Each entry in editorialConcerns must represent a distinct issue.
  Do not assign multiple concern codes to the same underlying problem.
- Each concern note must address exactly one issue. Do not combine
  two separate observations into a single note. If a sentence has
  both a currency formatting issue and an acronym issue, raise them
  as two separate concerns with separate notes.

Respond with valid JSON only. No markdown, no code fences.`;

const COMPLIANCE_SYSTEM_PROMPT = `You are a senior editor at a leading financial publication
with deep experience reviewing investment analysis, copy and
commentary, and professional communications for institutional
audiences. You have particular expertise in identifying
compliance risks in financial communications — not as a
lawyer, but as an experienced editor who knows where language
creates regulatory, reputational, or disclosure risk.

You are reviewing a single sentence from a professional
financial document.

DOCUMENT CONTEXT INTERPRETATION
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
present both sides equally.

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

Assess across the following dimensions. Not every dimension
will apply — use judgment.

CHERRY-PICKING
Does this sentence present a selectively positive picture by
omitting material context that would qualify or contradict it?
Assess against both the source evidence and the full draft.

PROMISSORY LANGUAGE
Does this sentence make or imply a promise about future
performance, outcomes, or returns? Flag language that could
be read as a forward-looking commitment rather than an
assessment.

SELECTIVE HEDGING
Are risks and negatives hedged more heavily than positives,
or vice versa? Flag asymmetric treatment of uncertainty across
the document.

MATERIAL OMISSION
Does this sentence omit context a reasonable reader would need
to assess the claim fairly? For Public versions the threshold
is higher.

AUDIENCE APPROPRIATENESS
For Public versions: does this sentence contain information
that should not be in the public domain — specific fund
economics, non-public financials, undisclosed deal terms, or
internal assessments? For Complete versions: is the detail
appropriate for NDA-bound investors?

BALANCE
In the context of the full draft, does this sentence
contribute to a one-sided picture with no acknowledgment of
risk, challenge, or uncertainty?

VOICE STANDARD
Write all notes and directions in this voice:
- Neutral, professional, institution-grade tone.
- Assume a financially literate audience.
- Plain language over jargon. When specialised terminology is
  required, use it precisely and consistently.
- Avoid marketing language, superlatives, or subjective claims.
- Clear, concise sentences. No colloquial expressions or casual
  phrasing.
- Write in US English throughout (e.g. 'analyze' not 'analyse').

RESPONSE FORMAT
Return a JSON object with exactly these fields:
{
  "complianceVerdict": "clean" | "soft_concern" | "hard_concern",
  "complianceConcerns": [
    {
      "concernCode": "cherry_picking" | "promissory_language" |
                     "selective_hedging" | "material_omission" |
                     "audience_appropriateness" | "balance",
      "note": "1 to 3 sentences. Direct, specific, reviewer
               voice. Go straight to the substance. Reference
               the actual words. Never generic."
    }
  ],
  "complianceNote": "If clean: one sentence confirming no
                     compliance concerns. If concerns exist:
                     null.",
  "suggestedDirection": "One actionable direction for the most
                           significant concern. Null if clean.",
  "suggestedRewrite": "A suggested rewrite or structural
                       suggestion. Null if clean."
}

complianceVerdict reflects the most significant concern:
hard_concern: material compliance, regulatory, or reputational
              risk
soft_concern: minor or contextual
clean: no concerns found

CONSTRAINTS
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
  as two separate concerns with separate notes.

Respond with valid JSON only. No markdown, no code fences.`;

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

function buildStyleRulesInjection(outputType) {
  const ot = normalizeOutputType(outputType);
  const guidance = outputTypeGuidance[ot] ?? outputTypeGuidance[OUTPUT_TYPE.REPORTING_COMMENTARY];
  const outputTypeLabel = getOutputTypeLabel(ot);
  const toneVoice = (guidance.toneVoice || []).join("\n");
  const structure = (guidance.structure || []).join("\n");
  return `The following house style rules apply to this document.
Assess the sentence against these standards and flag any
violations in your note:

${DEFAULT_STYLE_GUIDE.trim()}

Output type conventions for ${outputTypeLabel}:
${toneVoice}
${structure}`;
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

function buildUserPayload(styleBlock, draftMarked, sentenceText, evidenceBlock, ctx) {
  const eventLabel = getEventTypeLabel(ctx.eventType);
  const visLabel = getVisibilityLabel(ctx.requiredVersion);
  return `${styleBlock}

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

function applyEditorialSettled(stmt, settled) {
  const qc = stmt.qcCard;
  if (!qc || typeof qc !== "object") return;
  if (settled.status === "fulfilled") {
    const editorialRaw = settled.value?.choices?.[0]?.message?.content;
    const editorialParsed = safeParseJsonObject(editorialRaw);
    if (editorialParsed && typeof editorialParsed === "object") {
      qc.editorialVerdict = editorialParsed.editorialVerdict ?? null;
      qc.editorialConcerns = Array.isArray(editorialParsed.editorialConcerns) ? editorialParsed.editorialConcerns : [];
      qc.editorialNote = editorialParsed.editorialNote ?? null;
      qc.editorialSuggestedDirection = editorialParsed.suggestedDirection ?? null;
      qc.editorialSuggestedRewrite = editorialParsed.suggestedRewrite ?? null;
    } else {
      console.warn("[EDITORIAL_COMPLIANCE_ERROR] editorial parse failed", { preview: String(editorialRaw).slice(0, 200) });
      clearEditorialQcCard(qc);
    }
  } else {
    console.warn("[EDITORIAL_COMPLIANCE_ERROR]", settled.reason?.message || String(settled.reason));
    clearEditorialQcCard(qc);
  }
}

function applyComplianceSettled(stmt, settled) {
  const qc = stmt.qcCard;
  if (!qc || typeof qc !== "object") return;
  if (settled.status === "fulfilled") {
    const complianceRaw = settled.value?.choices?.[0]?.message?.content;
    const complianceParsed = safeParseJsonObject(complianceRaw);
    if (complianceParsed && typeof complianceParsed === "object") {
      qc.complianceVerdict = complianceParsed.complianceVerdict ?? null;
      qc.complianceConcerns = Array.isArray(complianceParsed.complianceConcerns) ? complianceParsed.complianceConcerns : [];
      qc.complianceNote = complianceParsed.complianceNote ?? null;
      qc.complianceSuggestedDirection = complianceParsed.suggestedDirection ?? null;
      qc.complianceSuggestedRewrite = complianceParsed.suggestedRewrite ?? null;
    } else {
      console.warn("[EDITORIAL_COMPLIANCE_ERROR] compliance parse failed", { preview: String(complianceRaw).slice(0, 200) });
      clearComplianceQcCard(qc);
    }
  } else {
    console.warn("[EDITORIAL_COMPLIANCE_ERROR]", settled.reason?.message || String(settled.reason));
    clearComplianceQcCard(qc);
  }
}

/** A7.24: Compliance user message — same document context and content as editorial, without house style block. */
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

/**
 * A7.14: Run editorial + compliance LLM review per statement (concurrent statements; concurrent calls per statement).
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

  const styleBlock = buildStyleRulesInjection(outputType);
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
      const userContent = buildUserPayload(styleBlock, draftMarked, sentenceText, evidenceBlock, ctx);
      const complianceUserContent = buildComplianceUserPayload(draftMarked, sentenceText, evidenceBlock, ctx);

      if (!editorialEnabled) {
        clearEditorialQcCard(stmt.qcCard);
      }
      if (!complianceEnabled) {
        clearComplianceQcCard(stmt.qcCard);
      }

      const editorialPromise = editorialEnabled
        ? client.chat.completions.create({
            model: "gpt-4o",
            temperature: 0,
            messages: [
              { role: "system", content: EDITORIAL_SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
          })
        : null;
      const compliancePromise = complianceEnabled
        ? client.chat.completions.create({
            model: "gpt-4o",
            temperature: 0,
            messages: [
              { role: "system", content: COMPLIANCE_SYSTEM_PROMPT },
              { role: "user", content: complianceUserContent },
            ],
          })
        : null;

      if (editorialPromise && compliancePromise) {
        const [editorialSettled, complianceSettled] = await Promise.allSettled([
          editorialPromise,
          compliancePromise,
        ]);
        applyEditorialSettled(stmt, editorialSettled);
        applyComplianceSettled(stmt, complianceSettled);
      } else if (editorialPromise) {
        let editorialSettled;
        try {
          const value = await editorialPromise;
          editorialSettled = { status: "fulfilled", value };
        } catch (reason) {
          editorialSettled = { status: "rejected", reason };
        }
        applyEditorialSettled(stmt, editorialSettled);
      } else if (compliancePromise) {
        let complianceSettled;
        try {
          const value = await compliancePromise;
          complianceSettled = { status: "fulfilled", value };
        } catch (reason) {
          complianceSettled = { status: "rejected", reason };
        }
        applyComplianceSettled(stmt, complianceSettled);
      }
    })
  );
}
