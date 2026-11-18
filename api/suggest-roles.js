/**
 * B513. One role suggestion for the whole run, from names and descriptions only.
 * One document is facts, with no model call.
 */
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { beginBillableRequest, endBillableRequest, enterRequestSpend } from "../lib/spend/ledger.mjs";
import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { beginRequestBudget, FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";
import {
  SUGGEST_ROLES_PROMPT,
  parseSuggestRolesResponse,
  roleForSingleSource,
  suggestRolesUserMessage,
  textTypeForSummary,
} from "../lib/source-summary.mjs";


function documentRows(body) {
  const raw = Array.isArray(body?.documents) ? body.documents : [];
  return raw.map((document) => ({
    name: typeof document?.name === "string" ? document.name.trim() : "",
    description: typeof document?.description === "string" ? document.description.trim() : "",
  }));
}

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "POST,OPTIONS", headers: ["x-brightline-diag"] })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (!(await beginBillableRequest(res, account))) return;
  enterRequestSpend();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const documents = documentRows(req.body);
  if (!documents.length) {
    return res.status(400).json({ ok: false, error: "suggest roles: no documents" });
  }
  if (documents.some((document) => !document.name || !document.description)) {
    return res.status(400).json({ ok: false, error: "suggest roles: a document is missing its name or description" });
  }

  if (documents.length === 1) {
    const single = roleForSingleSource(1);
    return res.status(200).json({
      ok: true,
      documents: [{ name: documents[0].name, suggestedRole: single.suggestedRole, roleReason: single.roleReason }],
    });
  }

  const modelConfig = STAGE_MODELS["summarize-source"];
  beginRequestBudget({
    startedAt: Date.now(),
    maxDurationMs: FUNCTION_MAX_DURATION_MS,
    model: modelConfig.model,
  });
  if (!hasProviderApiKey(modelConfig.provider)) {
    return res.status(500).json({ ok: false, error: "suggest roles: the model key is missing" });
  }

  const namedType = textTypeForSummary(req.body?.eventType);
  if (!namedType) {
    return res.status(400).json({ ok: false, error: "suggest roles: text type is missing" });
  }

  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        { role: "system", content: SUGGEST_ROLES_PROMPT },
        { role: "user", content: suggestRolesUserMessage(namedType.label, documents) },
      ],
      responseFormat: "json",
      traceName: "suggest-roles",
      spanName: "suggest-roles",
      metadata: { route: "suggest-roles" },
    });
    const suggestions = parseSuggestRolesResponse(completion?.text, documents.map((document) => document.name));
    return res.status(200).json({ ok: true, documents: suggestions });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "suggest roles failed";
    return res.status(502).json({ ok: false, error: message });
  } finally {
    await endBillableRequest({ account, route: "suggest-roles", req });
    await flushObservability();
  }
}
