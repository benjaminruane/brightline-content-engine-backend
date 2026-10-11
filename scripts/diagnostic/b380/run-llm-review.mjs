/**
 * B380. A pure model review of each frozen statement against the full
 * sources for that fixture. No pipeline stages. No labels. No pipeline
 * output. The prompt file is read once and is not revised from a score.
 *
 *   node scripts/diagnostic/b380/run-llm-review.mjs --pass llm-1
 *   node scripts/diagnostic/b380/run-llm-review.mjs --pass llm-2
 *
 * Ceiling USD 10 across both passes, on calculateLlmCostUsd of recorded
 * usage. If the meter passes the ceiling, the cards written so far are
 * kept and the process stops.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { filterFixtures, loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import {
  addOccurrenceIndices,
  flattenStatements,
  padFixtureId,
} from "../accuracy/lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const PROMPT_PATH = path.join(__dirname, "prompt.md");
const STATEMENTS_PATH = path.join(ROOT, "scripts/diagnostic/accuracy/statements.json");
const RUNS_ROOT = path.join(__dirname, "runs");
const CEILING_USD = 10;
const RANGE = { from: "01", to: "20" };
const SEED = 1;
const TEMPERATURE = 0;

const VERDICT_TO_DISPLAY = {
  confirmed: "supported_full",
  partially_confirmed: "supported_partial",
  conflicting: "conflict",
  not_supported: "not_supported",
};

function parsePass(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--pass" && argv[i + 1]) return String(argv[++i]);
  }
  throw new Error("usage: node scripts/diagnostic/b380/run-llm-review.mjs --pass <id>");
}

function listUsd(model, usage, pricing) {
  const rate = pricing?.openai?.[model];
  if (!rate || !usage) return null;
  const input = Number(usage.inputTokens) || 0;
  const output = Number(usage.outputTokens) || 0;
  return (input / 1_000_000) * rate.input + (output / 1_000_000) * rate.output;
}

async function spentByOtherPasses(thisPass) {
  let discounted = 0;
  let list = 0;
  let names = [];
  let entries = [];
  try {
    entries = await readdir(RUNS_ROOT);
  } catch {
    return { discounted, list, names };
  }
  for (const name of entries) {
    if (name === thisPass) continue;
    const file = path.join(RUNS_ROOT, name, "cards.json");
    try {
      const doc = JSON.parse(await readFile(file, "utf8"));
      if (doc?.arm !== "b380-llm-review") continue;
      discounted += Number(doc.costUsd) || 0;
      list += Number(doc.costUsdList) || 0;
      names.push(name);
    } catch {
      // A pass that has not written cards yet is not spend.
    }
  }
  return { discounted, list, names };
}

function frozenByFixture(doc) {
  const byId = new Map();
  for (const row of flattenStatements(doc)) {
    const id = padFixtureId(row.fixtureId);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  }
  return byId;
}

function userMessage(statement, sources) {
  const blocks = sources.map((source) => `SOURCE id=${source.id} label=${source.label}\n${source.text}`);
  return ["STATEMENT:", statement, "", "SOURCES:", blocks.join("\n\n")].join("\n");
}

function parseReply(text) {
  const raw = typeof text === "string" ? text : "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { parseOk: false, error: err instanceof Error ? err.message : String(err), raw };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { parseOk: false, error: "JSON was not an object", raw };
  }
  const verdict = typeof parsed.verdict === "string" ? parsed.verdict.trim() : "";
  const known = Object.prototype.hasOwnProperty.call(VERDICT_TO_DISPLAY, verdict);
  let passage = null;
  if (parsed.passage === null) passage = null;
  else if (typeof parsed.passage === "string") passage = parsed.passage.length ? parsed.passage : null;
  else if (parsed.passage != null) {
    return { parseOk: false, error: "passage was not a string or null", raw, verdict };
  }
  let sourceId = null;
  if (parsed.sourceId === null || parsed.sourceId === undefined) sourceId = null;
  else if (typeof parsed.sourceId === "string" || typeof parsed.sourceId === "number") {
    const id = String(parsed.sourceId).trim();
    sourceId = id.length ? id : null;
  } else {
    return { parseOk: false, error: "sourceId was not a string, number, or null", raw, verdict };
  }
  const reason = typeof parsed.reason === "string" ? parsed.reason : "";
  if (!known) {
    return {
      parseOk: false,
      error: `verdict ${JSON.stringify(parsed.verdict)} is not one of the four`,
      raw,
      verdict,
      passage,
      sourceId,
      reason,
    };
  }
  return { parseOk: true, verdict, passage, sourceId, reason, raw };
}

function stampOccurrence(fixtureCards) {
  return addOccurrenceIndices(fixtureCards.map((card) => ({ ...card, text: card.statement }))).map((card) => {
    const { text, ...rest } = card;
    return { ...rest, statement: text };
  });
}

function cardFrom(freezeRow, reply, callUsage) {
  const displayVerdict = reply.parseOk ? VERDICT_TO_DISPLAY[reply.verdict] : null;
  const passage = reply.passage ?? null;
  return {
    fixtureId: freezeRow.fixtureId,
    statement: freezeRow.text,
    index: freezeRow.index,
    displayVerdict,
    hasConflict: displayVerdict === "conflict",
    sourceMatches: [],
    supportSpans: [],
    primaryExcerpt: typeof passage === "string" ? passage : "",
    conflictExcerpt: "",
    displayVerdictReason: reply.parseOk ? "b380_llm_review" : "b380_llm_review_unparsed",
    supportState: displayVerdict,
    evidenceNotReviewedReason: reply.parseOk ? null : reply.error || "unparsed",
    excerptNotLocatable: false,
    hasRealExcerpt: typeof passage === "string" && passage.length > 0,
    armVerdict: reply.verdict || null,
    passage,
    sourceId: reply.sourceId ?? null,
    reason: reply.reason || "",
    parseOk: reply.parseOk === true,
    parseError: reply.parseOk ? null : reply.error || "unparsed",
    callUsage: callUsage || null,
  };
}

async function writeCards(outPath, payload) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  loadLocalEnvFiles({ liveMeasurement: true });
  process.env.QC_LLM_CACHE = "0";
  delete process.env.QC_LLM_CACHE_DISK;

  const pass = parsePass(process.argv.slice(2));
  const prompt = await readFile(PROMPT_PATH, "utf8");
  if (!prompt.trim()) throw new Error("prompt.md is empty. Refusing to call.");

  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
  const { callLLM, calculateLlmCostUsd, getLlmPricingTable, getLlmSpend, resetLlmSpend, hasProviderApiKey } =
    await import("../../../lib/observability.js");
  const cfg = STAGE_MODELS["writing-rewrite"];
  if (!cfg?.model || !cfg?.provider) throw new Error("STAGE_MODELS writing-rewrite is missing.");
  if (!hasProviderApiKey(cfg.provider)) throw new Error("OPENAI_API_KEY required");
  const pricing = getLlmPricingTable();
  if (!pricing?.openai?.[cfg.model]) {
    throw new Error(`No published price for ${cfg.model}. Refusing to call.`);
  }

  const prior = await spentByOtherPasses(pass);
  if (prior.discounted >= CEILING_USD) {
    throw new Error(
      `Other passes already spent ${prior.discounted.toFixed(4)} USD, at or over the ceiling of ${CEILING_USD}. Not calling. Passes: ${prior.names.join(", ") || "none"}.`
    );
  }

  const statementsDoc = JSON.parse(await readFile(STATEMENTS_PATH, "utf8"));
  const freezeById = frozenByFixture(statementsDoc);
  const fixtures = filterFixtures(await loadAllFixtures(), { range: RANGE });
  if (fixtures.length !== 20) {
    throw new Error(`Expected fixtures 01 to 20, loaded ${fixtures.length}. Not calling.`);
  }

  resetLlmSpend();
  const outPath = path.join(RUNS_ROOT, pass, "cards.json");
  const cards = [];
  let stopped = false;
  let stopReason = null;

  for (const fixture of fixtures) {
    if (stopped) break;
    const id = padFixtureId(fixture.data.id);
    const freeze = freezeById.get(id) || [];
    if (freeze.length === 0) {
      throw new Error(`Freeze has no statements for fixture ${id}. Not calling.`);
    }
    const loaded = await loadPipelineSources(fixture.data.sources || []);
    if (loaded.length === 0) {
      throw new Error(`Fixture ${id} has no source text. Not calling.`);
    }
    const sources = loaded.map((source, index) => ({
      id: String(index),
      label: source.label,
      text: source.text,
    }));
    if (sources.some((source) => !source.text || !source.text.trim())) {
      throw new Error(`Fixture ${id} has an empty source. Not calling.`);
    }
    console.log(`pass ${pass} F${id} statements=${freeze.length} sources=${sources.length}`);
    const fixtureCards = [];
    for (const row of freeze) {
      const before = getLlmSpend();
      const result = await callLLM({
        provider: cfg.provider,
        model: cfg.model,
        temperature: TEMPERATURE,
        seed: SEED,
        responseFormat: "json",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userMessage(row.text, sources) },
        ],
        traceName: "b380-llm-review",
        spanName: `b380-${pass}-F${id}-${row.index}`,
        metadata: { pass, fixtureId: id, index: row.index },
      });
      const after = getLlmSpend();
      const callUsage = result?.usage || null;
      const callCost = calculateLlmCostUsd(cfg.provider, cfg.model, callUsage);
      if ((Number(callUsage?.inputTokens) || 0) + (Number(callUsage?.outputTokens) || 0) > 0 && !(callCost > 0)) {
        throw new Error(`Call returned tokens and a zero price for ${cfg.model}. Stopping.`);
      }
      if (after.unpricedCalls > before.unpricedCalls) {
        throw new Error("An unpriced model call was recorded. Stopping.");
      }
      const reply = parseReply(result?.text);
      fixtureCards.push(cardFrom(row, reply, callUsage));
      const withOccurrence = stampOccurrence(fixtureCards);
      const spentNow = prior.discounted + after.costUsd;
      await writeCards(
        outPath,
        payloadFor(pass, cfg, prompt, cards.concat(withOccurrence), after, prior, false, null, pricing)
      );
      console.log(
        `pass ${pass} F${id} i=${row.index} verdict=${reply.parseOk ? reply.verdict : "UNPARSED"} costUsd=${callCost.toFixed(4)} spent=${spentNow.toFixed(4)}`
      );
      if (spentNow > CEILING_USD) {
        stopped = true;
        stopReason = `Meter ${spentNow.toFixed(4)} USD passed the ceiling of ${CEILING_USD} after fixture ${id} statement ${row.index}.`;
        break;
      }
    }
    cards.push(...stampOccurrence(fixtureCards));
    const spend = getLlmSpend();
    await writeCards(outPath, payloadFor(pass, cfg, prompt, cards, spend, prior, stopped, stopReason, pricing));
    if (stopped) break;
  }

  const spend = getLlmSpend();
  await writeCards(outPath, payloadFor(pass, cfg, prompt, cards, spend, prior, stopped, stopReason, pricing));
  const combined = prior.discounted + spend.costUsd;
  console.log(
    `PASS ${pass} ${stopped ? "STOPPED" : "DONE"} cards=${cards.length} costUsd=${spend.costUsd.toFixed(4)} combined=${combined.toFixed(4)} wrote ${outPath}`
  );
  if (stopReason) console.log(stopReason);
}

function payloadFor(pass, cfg, prompt, cards, spend, prior, stopped, stopReason, pricing) {
  const list = listUsd(cfg.model, spend, pricing);
  return {
    arm: "b380-llm-review",
    pass,
    model: cfg.model,
    provider: cfg.provider,
    temperature: TEMPERATURE,
    seed: SEED,
    cache: "off",
    promptFile: "scripts/diagnostic/b380/prompt.md",
    promptSha256: createHash("sha256").update(prompt).digest("hex"),
    range: "01-20",
    frozenFrom: "scripts/diagnostic/accuracy/statements.json",
    stage1Called: false,
    labelsRead: false,
    pipelineOutputRead: false,
    costUsd: spend.costUsd,
    costUsdList: list,
    calls: spend.calls,
    inputTokens: spend.inputTokens,
    cachedInputTokens: spend.cachedInputTokens,
    outputTokens: spend.outputTokens,
    unpricedCalls: spend.unpricedCalls,
    priorPasses: prior.names,
    priorCostUsd: prior.discounted,
    combinedCostUsd: prior.discounted + spend.costUsd,
    ceilingUsd: CEILING_USD,
    stopped,
    stopReason,
    extractedAt: new Date().toISOString(),
    cards,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
