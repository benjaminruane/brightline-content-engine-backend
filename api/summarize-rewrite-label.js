// A8.2: Short LLM summary of rewrite instructions (fire-and-forget from client; non-blocking for save).
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { beginBillableRequest, endBillableRequest, enterRequestSpend } from "../lib/spend/ledger.mjs";
import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { beginRequestBudget, FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";


function stripTrailingPunctuation(s) {
  return typeof s === "string" ? s.replace(/[.!?,;:]+$/g, "").trim() : "";
}

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS", headers: ["x-brightline-diag"] })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (!(await beginBillableRequest(res, account))) return;
  enterRequestSpend();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const instruction =
    typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
  if (!instruction) {
    return res.status(200).json({ ok: true, label: "" });
  }

  const modelConfig = STAGE_MODELS["summarize-rewrite-label"];
  beginRequestBudget({
    startedAt: Date.now(),
    maxDurationMs: FUNCTION_MAX_DURATION_MS,
    model: modelConfig.model,
  });
  if (!hasProviderApiKey(modelConfig.provider)) {
    return res.status(200).json({ ok: true, label: "" });
  }

  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: `Summarise this rewrite instruction in 5–8 words from the writer's perspective. Be concrete and specific. Examples: 'Shortened text to 30 words', 'Expanded focus on investment thesis', 'Sharpened wording and removed marketing language'. Return only the summary, no punctuation at the end.

Instruction:
${instruction}`,
        },
      ],
      traceName: "rewrite-label-summary",
      spanName: "rewrite-label-summary",
      metadata: { route: "summarize-rewrite-label" },
    });
    const raw = completion?.text;
    const label = stripTrailingPunctuation(typeof raw === "string" ? raw.trim() : "");
    return res.status(200).json({ ok: true, label: label || "" });
  } catch (err) {
    return res.status(200).json({ ok: true, label: "" });
  } finally {
    await endBillableRequest({ account, route: "summarize-rewrite-label", req });
    await flushObservability();
  }
}
