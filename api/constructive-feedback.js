import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { beginBillableRequest, endBillableRequest, enterRequestSpend } from "../lib/spend/ledger.mjs";
import { randomUUID } from "node:crypto";
import { callLLM, flushObservability, getLlmSpend, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import {
  CONSTRUCTIVE_FEEDBACK_FAILED,
  constructiveFeedbackSystemPrompt,
  constructiveFeedbackFailure,
  buildConstructiveFeedbackV2,
  normalizeConstructiveFeedbackPlainText,
  polishConstructiveFeedback,
  prependReadiness,
} from "../lib/qc/constructive-feedback-v2.mjs";
import { beginRequestBudget, FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";
import { reportRouteFailure } from "../lib/problem-events.mjs";


async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS" })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (!(await beginBillableRequest(res, account))) return;
  enterRequestSpend();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const routeStartedAt = Date.now();
  const modelConfig = STAGE_MODELS["constructive-feedback"];
  beginRequestBudget({
    startedAt: routeStartedAt,
    maxDurationMs: FUNCTION_MAX_DURATION_MS,
    model: modelConfig.model,
  });
  if (!hasProviderApiKey(modelConfig.provider)) {
    await reportRouteFailure({
      account,
      route: "constructive-feedback",
      req,
      status: 200,
      error: CONSTRUCTIVE_FEEDBACK_FAILED,
      startedAt: routeStartedAt,
    });
    return res.status(200).json(constructiveFeedbackFailure(false));
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  let built;
  try {
    built = buildConstructiveFeedbackV2(body);
  } catch (err) {
    console.warn("[constructive-feedback]", err?.message || err);
    await reportRouteFailure({
      account,
      route: "constructive-feedback",
      req,
      status: 200,
      error: err,
      startedAt: routeStartedAt,
    });
    return res.status(200).json(constructiveFeedbackFailure(false));
  }

  const traceId = randomUUID();
  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: null,
      messages: [
        { role: "system", content: constructiveFeedbackSystemPrompt(body.houseStyle) },
        { role: "user", content: JSON.stringify(built.payload, null, 2) },
      ],
      traceId,
      traceName: "constructive-feedback",
      spanName: "constructive-feedback",
      metadata: { route: "constructive-feedback", findingCount: built.payload.findings.length },
    });
    const raw = typeof completion?.text === "string" ? completion.text.trim() : "";
    const normalized = normalizeConstructiveFeedbackPlainText(raw);
    const polished = polishConstructiveFeedback(normalized, {
      findings: built.payload?.findings || [],
    });
    const feedbackText = prependReadiness(built.readiness, polished);
    if (!feedbackText) {
      await reportRouteFailure({
        account,
        route: "constructive-feedback",
        req,
        status: 200,
        error: CONSTRUCTIVE_FEEDBACK_FAILED,
        startedAt: routeStartedAt,
      });
      return res.status(200).json(constructiveFeedbackFailure(built.readiness === "Ready"));
    }
    return res.status(200).json({
      ok: true,
      feedbackText,
      isReady: built.readiness === "Ready",
    });
  } catch (err) {
    console.warn("[constructive-feedback]", err?.message || err);
    await reportRouteFailure({
      account,
      route: "constructive-feedback",
      req,
      status: 200,
      error: err,
      startedAt: routeStartedAt,
    });
    return res.status(200).json(constructiveFeedbackFailure(built.readiness === "Ready"));
  } finally {
    await endBillableRequest({ account, route: "constructive-feedback", req, spend: getLlmSpend() });
    await flushObservability();
  }
}

export default withCors(handler, { problemRoute: "constructive-feedback" });
