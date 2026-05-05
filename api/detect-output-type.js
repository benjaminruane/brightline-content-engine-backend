import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";

const OUTPUT_TYPES = new Set([
  "reporting_commentary",
  "investor_letter",
  "press_release",
  "linkedin_post",
]);

const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

function fallbackResponse() {
  return { outputType: "reporting_commentary", confidence: "low" };
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(200).json(fallbackResponse());

  const draftText = typeof req.body?.draftText === "string" ? req.body.draftText.trim() : "";
  if (draftText.length < 50) {
    return res.status(200).json(fallbackResponse());
  }

  const modelConfig = STAGE_MODELS["detect-output-type"];
  if (!hasProviderApiKey(modelConfig.provider)) {
    return res.status(200).json(fallbackResponse());
  }

  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      responseFormat: "json",
      messages: [
        {
          role: "system",
          content:
            "Classify the draft into exactly one outputType: reporting_commentary, investor_letter, press_release, or linkedin_post. Use format cues: reporting_commentary is neutral analytical prose, investor_letter addresses investors in update-letter form, press_release is announcement style with headline/dateline/quote cues, linkedin_post is social short-form post style. Return strict JSON: {\"outputType\":\"...\",\"confidence\":\"high|medium|low\"}.",
        },
        {
          role: "user",
          content: draftText.slice(0, 6000),
        },
      ],
      traceName: "detect-output-type",
      spanName: "detect-output-type",
      metadata: { route: "detect-output-type" },
    });

    const raw = completion?.text;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : null;
    const outputType = typeof parsed?.outputType === "string" ? parsed.outputType.trim() : "";
    const confidence = typeof parsed?.confidence === "string" ? parsed.confidence.trim() : "";
    if (!OUTPUT_TYPES.has(outputType) || !CONFIDENCE_LEVELS.has(confidence)) {
      return res.status(200).json(fallbackResponse());
    }
    return res.status(200).json({ outputType, confidence });
  } catch {
    return res.status(200).json(fallbackResponse());
  } finally {
    await flushObservability();
  }
}
