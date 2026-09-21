import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { synthesisFindingCensus, synthesisPayloadHasBlankFinding } from "../lib/qc/blank-finding-guard.mjs";
import { READINESS_LABELS } from "../lib/qc/review-summary.mjs";
import { asReviewOptions } from "../lib/qc/review-options.mjs";
import { ASSESSMENT_REASONS, requireAssessmentReason } from "../lib/qc/assessment-reason.mjs";
import { beginRequestBudget, FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";

/** R3.7: appended voice constraints — do not alter role/length/tone preamble above the two trailing paragraphs. */
const SYNTHESIZE_REVIEW_SYSTEM_PROMPT = [
  "You are a senior investment content editor. Return one narrative paragraph only, 100-200 words, direct and authoritative, no bullet points, no headers, no system language. Write as a senior editor speaking directly to a colleague - authoritative but not stiff. Contractions are acceptable. Vary sentence length. Avoid sounding like a report.",
  "Do not use system or technical vocabulary in the narrative. Avoid phrases like 'concern level', 'verdict', 'signal', 'high concern', 'low concern'. Write as a senior editor would, referring to specific concerns by what they are (e.g. 'an unsupported claim about X', 'a partial source match on Y'), not by their system classification.",
  "Do not use generic corporate filler. Avoid phrases like 'aligning with our publication's standards', 'ensures adherence to guidelines', 'maintains our quality benchmarks'. If a draft has no editorial or compliance issues, say so plainly: 'editorial and compliance are clean' or 'no concerns flagged on the editorial side'.",
].join("\n\n");

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const modelConfig = STAGE_MODELS["synthesize-review"];
  beginRequestBudget({
    startedAt: Date.now(),
    maxDurationMs: FUNCTION_MAX_DURATION_MS,
    model: modelConfig.model,
  });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const draftText = typeof body.draftText === "string" ? body.draftText.trim() : "";
  const summary = body.qcSummary && typeof body.qcSummary === "object" ? body.qcSummary : {};
  const readiness = summary.readiness;
  function emptyAssessment(reason) {
    return res.status(200).json({
      ok: false,
      narrative: "",
      reason: requireAssessmentReason(reason),
    });
  }
  if (!READINESS_LABELS.includes(readiness)) {
    return emptyAssessment(ASSESSMENT_REASONS.INVALID_READINESS);
  }
  if (!hasProviderApiKey(modelConfig.provider)) {
    return emptyAssessment(ASSESSMENT_REASONS.MISSING_PROVIDER_KEY);
  }
  const notSupportedStatements = Array.isArray(body.notSupportedStatements) ? body.notSupportedStatements : [];
  const conflictingStatements = Array.isArray(body.conflictingStatements) ? body.conflictingStatements : [];
  const partialStatements = Array.isArray(body.partialStatements) ? body.partialStatements : [];
  const editorialConcerns = Array.isArray(body.editorialConcerns) ? body.editorialConcerns : [];
  const complianceConcerns = Array.isArray(body.complianceConcerns) ? body.complianceConcerns : [];
  const findingBody = {
    editorialConcerns,
    complianceConcerns,
    notSupportedStatements,
    conflictingStatements,
    partialStatements,
  };
  if (synthesisPayloadHasBlankFinding(findingBody)) {
    const census = synthesisFindingCensus(findingBody);
    const reason =
      census.usable === 0 ? ASSESSMENT_REASONS.NOTHING_TO_SAY : ASSESSMENT_REASONS.BLANK_FINDING;
    return emptyAssessment(reason);
  }
  const reviewOptions = body.reviewOptions && typeof body.reviewOptions === "object" ? body.reviewOptions : {};
  const activeReviewOptions = asReviewOptions(reviewOptions);
  const context = body.context === "writing" ? "writing" : "assess";

  const roleFraming =
    context === "writing"
      ? "Role: senior investment content editor reviewing your own draft before signoff."
      : "Role: senior investment content editor reviewing a draft for signoff readiness.";

  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: SYNTHESIZE_REVIEW_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              roleFraming,
              instructions: [
                "Assess what is working and what needs fixing with specific references to claims and issues.",
                "Use direct, constructive editorial language in a senior FT-style voice.",
                "Your assessment must only cover the review types that were run. Do not comment on editorial matters if editorial review was not run, and do not comment on evidence if evidence review was not run.",
                "A conflicting statement HAS evidence: two or more sources address it and they disagree. Never describe a conflict as unsupported, unsubstantiated or lacking evidence. A partially confirmed statement is partly backed, not unbacked. Only statements with no source support are unsupported.",
                "Describe a conflicting statement only as a disagreement between the sources, for example 'the two documents give different figures for X'. Never use any form of the word 'support' about a conflicting statement.",
                `State this verdict in your first sentence, in these exact words: ${readiness}.`,
                "If the label is Not fully checked, say plainly that some statements could not be checked, and do not describe them as having problems.",
                ...(context === "writing"
                  ? ["Address the writer directly using language like 'your draft', 'you should', and 'this needs' where appropriate."]
                  : []),
              ],
              draftText,
              activeReviewOptions,
              qcSummary: summary,
              notSupportedStatements,
              conflictingStatements,
              partialStatements,
              editorialConcerns,
              complianceConcerns,
            },
            null,
            2
          ),
        },
      ],
      traceName: "assess-reviewer-synthesis",
      spanName: "assess-reviewer-synthesis",
      metadata: { route: "synthesize-review" },
    });
    const narrative = typeof completion?.text === "string" ? completion.text.trim() : "";
    if (!narrative) {
      return res.status(200).json({
        ok: false,
        narrative: "",
        reason: ASSESSMENT_REASONS.EMPTY_COMPLETION,
      });
    }
    return res.status(200).json({
      ok: true,
      narrative,
      reason: ASSESSMENT_REASONS.WRITTEN,
    });
  } catch {
    return res.status(200).json({
      ok: false,
      narrative: "",
      reason: ASSESSMENT_REASONS.CALL_FAILED,
    });
  } finally {
    await flushObservability();
  }
}
