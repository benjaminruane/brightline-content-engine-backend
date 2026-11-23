import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { beginBillableRequest, endBillableRequest, enterRequestSpend } from "../lib/spend/ledger.mjs";
import { callLLM, flushObservability, getLlmSpend, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { beginRequestBudget, FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";


function safeBody(req) {
  if (req?.body && typeof req.body === "object") return req.body;
  if (typeof req?.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeUsedFor(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length <= 20) return trimmed;
  return tokens.slice(0, 20).join(" ");
}

async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS", headers: ["x-brightline-diag"] })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (!(await beginBillableRequest(res, account))) return;
  enterRequestSpend();
  if (req.method !== "POST") return res.status(200).json({ ok: true, usedFor: "" });

  const body = safeBody(req);
  const sourceName = typeof body?.sourceName === "string" ? body.sourceName.trim() : "";
  const snippet = typeof body?.snippet === "string" ? body.snippet.trim() : "";
  const draftText = typeof body?.draftText === "string" ? body.draftText.trim().slice(0, 1000) : "";

  const modelConfig = STAGE_MODELS["summarize-source-usage"];
  beginRequestBudget({
    startedAt: Date.now(),
    maxDurationMs: FUNCTION_MAX_DURATION_MS,
    model: modelConfig.model,
  });
  if (!sourceName || !snippet || !draftText || !hasProviderApiKey(modelConfig.provider)) {
    return res.status(200).json({ ok: true, usedFor: "" });
  }

  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a document analyst. In one sentence of maximum 20 words, describe specifically what content from this source document was used in the draft. Begin with a verb (e.g. 'Provided', 'Supplied', 'Contributed'). Reference the actual subject matter — for example financial figures, product details, market context. Do not write generic descriptions. Do not describe the source document type.",
        },
        {
          role: "user",
          content: `Source name: ${sourceName}\nSnippet: ${snippet}\nDraft excerpt: ${draftText}`,
        },
      ],
      traceName: "used-for-synthesis",
      spanName: "used-for-synthesis",
      metadata: { route: "summarize-source-usage" },
    });

    const usedFor = normalizeUsedFor(completion?.text || "");
    return res.status(200).json({ ok: true, usedFor });
  } catch {
    return res.status(200).json({ ok: true, usedFor: "" });
  } finally {
    await endBillableRequest({ account, route: "summarize-source-usage", req, spend: getLlmSpend() });
    await flushObservability();
  }
}

export default withCors(handler, {});
