import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { randomUUID } from "node:crypto";
import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import {
  CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT,
  buildConstructiveFeedbackV2,
  normalizeConstructiveFeedbackPlainText,
  prependReadiness,
} from "../lib/qc/constructive-feedback-v2.mjs";
import { beginRequestBudget, FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";


export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS" })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
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
  let built;
  try {
    built = buildConstructiveFeedbackV2(body);
  } catch (err) {
    console.warn("[constructive-feedback]", err?.message || err);
    return res.status(200).json({ ok: false, feedbackText: "", isReady: false });
  }

  const traceId = randomUUID();
  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: null,
      messages: [
        { role: "system", content: CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(built.payload, null, 2) },
      ],
      traceId,
      traceName: "constructive-feedback",
      spanName: "constructive-feedback",
      metadata: { route: "constructive-feedback", findingCount: built.payload.findings.length },
    });
    const raw = typeof completion?.text === "string" ? completion.text.trim() : "";
    const feedbackText = prependReadiness(built.readiness, normalizeConstructiveFeedbackPlainText(raw));
    if (!feedbackText) {
      return res.status(200).json({ ok: false, feedbackText: "", isReady: built.readiness === "Ready" });
    }
    return res.status(200).json({
      ok: true,
      feedbackText,
      isReady: built.readiness === "Ready",
    });
  } catch (err) {
    console.warn("[constructive-feedback]", err?.message || err);
    return res.status(200).json({ ok: false, feedbackText: "", isReady: built.readiness === "Ready" });
  } finally {
    await flushObservability();
  }
}
