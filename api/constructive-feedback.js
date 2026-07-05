import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import {
  assembleCraftAndCardFeedback,
  buildConstructiveFeedbackCraftSystemPrompt,
  buildConstructiveFeedbackCraftUserPayload,
  buildConstructiveFeedbackUserPayload,
  CLEAN_DRAFT_FEEDBACK_TEXT,
  CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT,
  normalizeConstructiveFeedbackCraftText,
  normalizeConstructiveFeedbackPlainText,
  resolveConstructiveFeedbackCraftOutputType,
  selectConstructiveFeedbackBundles,
  splitCardFeedbackSections,
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

function resolveCraftInput(body, draftText) {
  const snapshot = typeof body.analysedDraftText === "string" ? body.analysedDraftText : "";
  if (snapshot.trim()) return snapshot;
  return draftText;
}

async function runCraftPass({
  craftInput,
  signoffVerdict,
  isReady,
  includeOpeningClosing,
  outputType,
  craftModelConfig,
}) {
  const completion = await callLLM({
    provider: craftModelConfig.provider,
    model: craftModelConfig.model,
    temperature: 0,
    messages: [
      { role: "system", content: buildConstructiveFeedbackCraftSystemPrompt(includeOpeningClosing, outputType) },
      {
        role: "user",
        content: JSON.stringify(
          buildConstructiveFeedbackCraftUserPayload({
            analysedDraftText: craftInput,
            signoffVerdict,
            isReady,
            includeOpeningClosing,
            outputType,
          }),
          null,
          2
        ),
      },
    ],
    traceName: "constructive-feedback-craft",
    spanName: "constructive-feedback-craft",
    metadata: { route: "constructive-feedback-craft", ...(outputType ? { outputType } : {}) },
  });
  const raw = typeof completion?.text === "string" ? completion.text.trim() : "";
  return normalizeConstructiveFeedbackCraftText(raw);
}

async function runCardPass({
  draftText,
  signoffVerdict,
  isReady,
  feedbackBundles,
  craftHandledSeparately,
  craftSectionContext,
  modelConfig,
}) {
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
            feedbackBundles,
            craftHandledSeparately,
            craftSectionContext,
          }),
          null,
          2
        ),
      },
    ],
    traceName: "constructive-feedback",
    spanName: "constructive-feedback",
    metadata: { route: "constructive-feedback", bundleCount: feedbackBundles.length },
  });
  const raw = typeof completion?.text === "string" ? completion.text.trim() : "";
  return normalizeConstructiveFeedbackPlainText(raw);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const modelConfig = STAGE_MODELS["constructive-feedback"];
  const craftModelConfig = STAGE_MODELS["constructive-feedback-craft"];
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
  const feedbackBundles = selectConstructiveFeedbackBundles(rows, activeReviewOptions);

  const craftInput = resolveCraftInput(body, draftText);
  const craftOutputType = resolveConstructiveFeedbackCraftOutputType(body.outputType);
  const canRunCraft =
    typeof craftInput === "string" &&
    craftInput.trim().length > 0 &&
    hasProviderApiKey(craftModelConfig.provider);

  if (feedbackBundles.length === 0 && !canRunCraft) {
    return res.status(200).json({
      ok: true,
      feedbackText: CLEAN_DRAFT_FEEDBACK_TEXT,
      isReady,
    });
  }

  try {
    const hasBundles = feedbackBundles.length > 0;
    const craftIncludeOpeningClosing = !hasBundles;

    let craftSection = "";
    if (canRunCraft) {
      craftSection = await runCraftPass({
        craftInput,
        signoffVerdict,
        isReady,
        includeOpeningClosing: craftIncludeOpeningClosing,
        outputType: craftOutputType,
        craftModelConfig,
      });
    }

    let cardFeedback = "";
    if (hasBundles) {
      cardFeedback = await runCardPass({
        draftText,
        signoffVerdict,
        isReady,
        feedbackBundles,
        craftHandledSeparately: canRunCraft,
        craftSectionContext: canRunCraft ? craftSection : "",
        modelConfig,
      });
    }

    const hasCraft = !!craftSection;

    if (!hasBundles && !hasCraft) {
      return res.status(200).json({
        ok: true,
        feedbackText: CLEAN_DRAFT_FEEDBACK_TEXT,
        isReady,
      });
    }

    let feedbackText;
    if (!hasBundles && hasCraft) {
      feedbackText = craftSection;
    } else if (hasBundles && !hasCraft) {
      feedbackText = cardFeedback || CLEAN_DRAFT_FEEDBACK_TEXT;
    } else {
      const { opening, cardPoints, closing } = splitCardFeedbackSections(cardFeedback);
      feedbackText = assembleCraftAndCardFeedback({
        opening,
        craftSection,
        cardPoints,
        closing,
      });
    }

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
