import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";

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
  if (!hasProviderApiKey(modelConfig.provider)) return res.status(200).json({ ok: false, narrative: "" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const draftText = typeof body.draftText === "string" ? body.draftText.trim() : "";
  const summary = body.qcSummary && typeof body.qcSummary === "object" ? body.qcSummary : {};
  const notSupportedStatements = Array.isArray(body.notSupportedStatements) ? body.notSupportedStatements : [];
  const editorialConcerns = Array.isArray(body.editorialConcerns) ? body.editorialConcerns : [];
  const complianceConcerns = Array.isArray(body.complianceConcerns) ? body.complianceConcerns : [];
  const reviewOptions = body.reviewOptions && typeof body.reviewOptions === "object" ? body.reviewOptions : {};
  const activeReviewOptions = {
    evidenceEnabled: reviewOptions.evidenceEnabled !== false,
    editorialEnabled: reviewOptions.editorialEnabled !== false,
    complianceEnabled: reviewOptions.complianceEnabled !== false,
  };
  const context = body.context === "writing" ? "writing" : "assess";
  const signoffVerdict =
    summary.signoffVerdict === "Ready for signoff" ||
    summary.signoffVerdict === "Needs targeted revision" ||
    summary.signoffVerdict === "Needs significant work"
      ? summary.signoffVerdict
      : "Needs targeted revision";

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
          content:
            "You are a senior investment content editor. Return one narrative paragraph only, 100-200 words, direct and authoritative, no bullet points, no headers, no system language. Write as a senior editor speaking directly to a colleague - authoritative but not stiff. Contractions are acceptable. Vary sentence length. Avoid sounding like a report.",
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
                `Conclude explicitly with one of these exact labels: ${signoffVerdict}.`,
                ...(context === "writing"
                  ? ["Address the writer directly using language like 'your draft', 'you should', and 'this needs' where appropriate."]
                  : []),
              ],
              draftText,
              activeReviewOptions,
              qcSummary: summary,
              notSupportedStatements,
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
    return res.status(200).json({ ok: true, narrative });
  } catch {
    return res.status(200).json({ ok: false, narrative: "" });
  } finally {
    await flushObservability();
  }
}
