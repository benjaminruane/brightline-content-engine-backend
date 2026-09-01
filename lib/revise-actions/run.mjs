/**
 * Sort a stored Review card into ACTION / ACKNOWLEDGE rows.
 * One writing-rewrite call per ACTION finding. ACKNOWLEDGE skips the model.
 * Vercel maxDuration is 60s; concurrency is capped at 4. A long draft will not fit.
 */
import { callLLM } from "../observability.js";
import { STAGE_MODELS } from "../qc/model-config.mjs";
import { resolveAuthoringOrganisationName } from "../qc/first-person-actor.mjs";
import { buildFindingPrompt } from "./prompt.mjs";
import { buildSortedEntries } from "./sort.mjs";
import { verifyAction } from "./verify.mjs";

export const ACTION_LIST_CONCURRENCY = 4;

async function mapPool(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  const results = new Array(list.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      results[index] = await mapper(list[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function stripCodeFence(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  const fence = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = trimmed.match(fence);
  return match ? match[1].trim() : trimmed;
}

function parseJsonObject(text) {
  const raw = stripCodeFence(text);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    return null;
  }
  return null;
}

function publicEntry(entry) {
  const out = {
    id: entry.id,
    disposition: entry.disposition,
    statementId: entry.statementId,
    statement: entry.statement,
    kind: entry.kind,
    rule: entry.rule,
    thing1: entry.thing1,
    thing2: entry.thing2,
    sort: entry.sort,
  };
  if (entry.disposition === "ACKNOWLEDGE") {
    out.noProposalReason = entry.noProposalReason;
  }
  if (entry.disposition === "ACTION") {
    out.proposedChange = entry.proposedChange ?? null;
    out.resultingSentence = entry.resultingSentence ?? null;
    out.why = entry.why ?? null;
    out.verification = entry.verification ?? { status: "unverified", detail: "No model result." };
  }
  return out;
}

async function fillAction(entry, { authoringOrganisation, callModel }) {
  const prompt = buildFindingPrompt(entry, {
    authoringOrganisation,
    silenceOnCard: entry.sort?.silenceOnCard === true,
  });
  const completion = await callModel(prompt, { id: entry.id });
  const parsed = parseJsonObject(typeof completion?.text === "string" ? completion.text : "");
  if (!parsed) {
    throw new Error(`Action list model returned non-JSON for ${entry.id}`);
  }
  const proposedChange = typeof parsed.proposedChange === "string" ? parsed.proposedChange : "";
  const resultingSentence = typeof parsed.resultingSentence === "string" ? parsed.resultingSentence : "";
  const why = typeof parsed.why === "string" ? parsed.why : "";
  const verification = verifyAction({ proposedChange, why, resultingSentence });
  return publicEntry({
    ...entry,
    proposedChange,
    resultingSentence,
    why,
    verification,
  });
}

export async function runActionList(statements, options = {}) {
  const authoringOrganisation = resolveAuthoringOrganisationName(
    options.authoringOrganisation ?? options.requestName
  );
  const sorted = buildSortedEntries(statements);
  const defaultModel = STAGE_MODELS["writing-rewrite"];
  const callModel =
    typeof options.callModel === "function"
      ? options.callModel
      : async (prompt, meta) => {
          const completion = await callLLM({
            provider: defaultModel.provider,
            model: defaultModel.model,
            temperature: 0,
            seed: 1,
            responseFormat: "json",
            messages: [{ role: "user", content: prompt }],
            traceName: `revise-actions-${meta.id}`,
            spanName: `revise-actions-${meta.id}`,
            metadata: { route: "revise-actions", findingId: meta.id },
          });
          return { text: completion?.text ?? "" };
        };

  const filled = await mapPool(sorted, ACTION_LIST_CONCURRENCY, async (entry) => {
    if (entry.disposition !== "ACTION") return publicEntry(entry);
    return fillAction(entry, { authoringOrganisation, callModel });
  });

  return { ok: true, entries: filled };
}
