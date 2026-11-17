import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";
import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { beginRequestBudget, FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";
import {
  SUMMARIZE_SYSTEM_PROMPT,
  parseSummarizeResponse,
  roleForSingleSource,
  summaryUserMessage,
  textTypeForSummary,
} from "../lib/source-summary.mjs";

const EMPTY_RESPONSE = { ok: true, description: "", publicationState: "unknown", suggestedRole: "", roleReason: "" };

export { SUMMARIZE_SYSTEM_PROMPT, parseSummarizeResponse };


export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS", headers: ["x-brightline-diag"] })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "POST") return res.status(200).json(EMPTY_RESPONSE);

  beginRequestBudget({
    startedAt: Date.now(),
    maxDurationMs: FUNCTION_MAX_DURATION_MS,
    model: STAGE_MODELS["summarize-source"].model,
  });

  const source = req.body && typeof req.body === "object" ? req.body : {};
  const mimeType = typeof source?.mimeType === "string" ? source.mimeType.trim() : "";
  const sourceName = typeof source?.name === "string" ? source.name : "Untitled source";
  const sourceType = typeof source?.type === "string" ? source.type : "file";
  let llmInput = "";

  if (mimeType === "application/pdf") {
    try {
      const prep = await prepareUploadedSourcesForPipeline([
        {
          id: "summarize_source",
          name: sourceName,
          title: sourceName,
          type: sourceType,
          mimeType,
          contentBase64: typeof source?.contentBase64 === "string" ? source.contentBase64 : "",
        },
      ]);
      const extractedText = typeof prep?.sources?.[0]?.text === "string" ? prep.sources[0].text.trim() : "";
      if (extractedText.length < 50) {
        return res.status(200).json(EMPTY_RESPONSE);
      }
      llmInput = extractedText.slice(0, 2000);
    } catch {
      return res.status(200).json(EMPTY_RESPONSE);
    }
  } else {
    const text = typeof source?.text === "string" ? source.text.trim() : "";
    if (!text) return res.status(200).json(EMPTY_RESPONSE);
    llmInput = text.slice(0, 2000);
  }

  if (!llmInput) return res.status(200).json(EMPTY_RESPONSE);

  const modelConfig = STAGE_MODELS["summarize-source"];
  if (!hasProviderApiKey(modelConfig.provider)) return res.status(200).json(EMPTY_RESPONSE);

  try {
    const namedType = textTypeForSummary(source?.eventType);
    const single = roleForSingleSource(source?.sourceCount);
    if (!namedType && !single) {
      console.warn("[summarize-source] text type is missing; no suggested role");
    }
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
        { role: "user", content: summaryUserMessage(namedType?.label, llmInput) },
      ],
      responseFormat: "json",
      traceName: "source-description-generation",
      spanName: "source-description-generation",
      metadata: { route: "summarize-source" },
    });
    const parsed = parseSummarizeResponse(completion?.text, { allowRole: false });
    const suggestedRole = single ? single.suggestedRole : "";
    const roleReason = single ? single.roleReason : "";
    return res.status(200).json({
      ok: true,
      description: parsed.description,
      publicationState: parsed.publicationState,
      suggestedRole,
      roleReason,
    });
  } catch {
    return res.status(200).json(EMPTY_RESPONSE);
  } finally {
    await flushObservability();
  }
}
