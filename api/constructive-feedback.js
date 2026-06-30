import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import {
  buildConstructiveFeedbackUserPayload,
  CLEAN_DRAFT_FEEDBACK_TEXT,
  CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT,
  normalizeConstructiveFeedbackPlainText,
  selectConstructiveFeedbackPoints,
} from "../lib/qc/constructive-feedback.mjs";
import { computeSignoffVerdict, isReadyForSignoff } from "../lib/qc/signoff-verdict.mjs";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function extractRows(body) {
  if (Array.isArray(body.qcCards) && body.qcCards.length > 0) {
    return body.qcCards.map((card) => ({ qcCard: card }));
  }
  if (Array.isArray(body.statements) && body.statements.length > 0) {
    return body.statements;
  }
  return [];
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const modelConfig = STAGE_MODELS["constructive-feedback"];
  if (!hasProviderApiKey(modelConfig.provider)) {
    return res.status(200).json({ ok: false, feedbackText: "", isReady: false });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const draftText = typeof body.draftText === "string" ? body.draftText.trim() : "";
  const reviewOptions = body.reviewOptions && typeof body.reviewOptions === "object" ? body.reviewOptions : {};
  const activeReviewOptions = {
    evidenceEnabled: reviewOptions.evidenceEnabled !== false,
    editorialEnabled: reviewOptions.editorialEnabled !== false,
    complianceEnabled: reviewOptions.complianceEnabled !== false,
  };
  const rows = extractRows(body);

  const signoffVerdict = computeSignoffVerdict(rows);
  const isReady = isReadyForSignoff(signoffVerdict);
  const feedbackPoints = selectConstructiveFeedbackPoints(rows, activeReviewOptions);

  if (feedbackPoints.length === 0) {
    return res.status(200).json({
      ok: true,
      feedbackText: CLEAN_DRAFT_FEEDBACK_TEXT,
      isReady,
    });
  }

  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        { role: "system", content: CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify(
            buildConstructiveFeedbackUserPayload({
              draftText,
              signoffVerdict,
              isReady,
              feedbackPoints,
            }),
            null,
            2
          ),
        },
      ],
      traceName: "constructive-feedback",
      spanName: "constructive-feedback",
      metadata: { route: "constructive-feedback", pointCount: feedbackPoints.length },
    });
    const raw = typeof completion?.text === "string" ? completion.text.trim() : "";
    const feedbackText = normalizeConstructiveFeedbackPlainText(raw);
    return res.status(200).json({
      ok: true,
      feedbackText: feedbackText || CLEAN_DRAFT_FEEDBACK_TEXT,
      isReady,
    });
  } catch {
    return res.status(200).json({ ok: false, feedbackText: "", isReady });
  } finally {
    await flushObservability();
  }
}
