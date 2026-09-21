import { randomUUID } from "node:crypto";
import { callLLM, flushObservability, hasProviderApiKey, logCanaryScore } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import {
  buildConstructiveFeedbackPieceUserPayload,
  CLEAN_DRAFT_FEEDBACK_TEXT,
  collectMarginNotes,
  CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT,
  coverageRetryInstruction,
  normalizeConstructiveFeedbackPlainText,
  prependReadiness,
  stripUnquotedCraft,
  unnamedFindings,
} from "../lib/qc/constructive-feedback.mjs";
import { READINESS_LABELS, summariseReview } from "../lib/qc/review-summary.mjs";
import { asReviewOptions } from "../lib/qc/review-options.mjs";
import { beginRequestBudget, FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";

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

function finishPiece(bodyText, { readiness, draftText, notes }) {
  const labelled = prependReadiness(readiness, bodyText);
  return stripUnquotedCraft(labelled, { draftText, notes });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const modelConfig = STAGE_MODELS["constructive-feedback"];
  beginRequestBudget({
    startedAt: Date.now(),
    maxDurationMs: FUNCTION_MAX_DURATION_MS,
    model: modelConfig.model,
  });
  if (!hasProviderApiKey(modelConfig.provider)) {
    return res.status(200).json({ ok: false, feedbackText: "", isReady: false });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const draftText = typeof body.draftText === "string" ? body.draftText.trim() : "";
  const reviewOptions = body.reviewOptions && typeof body.reviewOptions === "object" ? body.reviewOptions : {};
  const activeReviewOptions = asReviewOptions(reviewOptions);
  const rows = extractRows(body);
  const cards = rows.map((row) => (row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : row));
  const reviewSummary = summariseReview(cards, activeReviewOptions);
  const signoffVerdict = reviewSummary.readiness;
  if (!READINESS_LABELS.includes(signoffVerdict)) {
    return res.status(200).json({ ok: false, feedbackText: "", isReady: false });
  }
  const isReady = signoffVerdict === "Ready";
  const notes = collectMarginNotes(rows, activeReviewOptions, draftText);
  const cleanPiece = finishPiece(CLEAN_DRAFT_FEEDBACK_TEXT, {
    readiness: signoffVerdict,
    draftText,
    notes,
  });

  if (notes.length === 0) {
    return res.status(200).json({
      ok: true,
      feedbackText: cleanPiece,
      isReady,
    });
  }

  const payload = buildConstructiveFeedbackPieceUserPayload({
    draftText,
    readiness: signoffVerdict,
    outputType: body.outputType,
    statements: rows,
    reviewOptions: activeReviewOptions,
  });
  const traceId = randomUUID();

  async function generatePiece(extraInstruction, spanName) {
    const messages = [
      { role: "system", content: CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload, null, 2) },
    ];
    if (extraInstruction) {
      messages.push({ role: "user", content: extraInstruction });
    }
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages,
      traceId,
      traceName: "constructive-feedback",
      spanName,
      metadata: { route: "constructive-feedback", noteCount: notes.length },
    });
    const raw = typeof completion?.text === "string" ? completion.text.trim() : "";
    return finishPiece(normalizeConstructiveFeedbackPlainText(raw), {
      readiness: signoffVerdict,
      draftText,
      notes,
    });
  }

  try {
    let feedbackText = await generatePiece(null, "constructive-feedback");
    let missed = unnamedFindings(feedbackText, notes);
    if (missed.length > 0) {
      feedbackText = await generatePiece(coverageRetryInstruction(missed), "constructive-feedback-coverage-retry");
      missed = unnamedFindings(feedbackText, notes);
      if (missed.length > 0) {
        const comment = missed
          .map((note) => `${note.kind}:${quoteFrag(note.statementText)}`)
          .join("; ");
        console.warn(`[constructive-feedback] coverage miss remaining=${missed.length} ${comment}`);
        logCanaryScore({
          traceId,
          name: "constructive-feedback-coverage-miss",
          value: missed.length,
          comment,
        });
      }
    }
    return res.status(200).json({
      ok: true,
      feedbackText: feedbackText || cleanPiece,
      isReady,
    });
  } catch {
    return res.status(200).json({ ok: false, feedbackText: "", isReady });
  } finally {
    await flushObservability();
  }
}

function quoteFrag(statementText) {
  return String(statementText || "")
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}
