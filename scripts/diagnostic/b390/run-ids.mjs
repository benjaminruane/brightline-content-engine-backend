/**
 * B390 Part A. Held-out only. Two passes. No tuning.
 * The numbered source replaces the plain source. Ceiling USD 8 discounted.
 *
 *   node scripts/diagnostic/b390/run-ids.mjs
 */
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { addOccurrenceIndices } from "../accuracy/lib.mjs";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { extractJsonObject, listUsd, rollupClaims } from "../b381/run-draft-review.mjs";
import { jobsFor } from "../b388/run.mjs";
import { numberLines } from "./number-lines.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_ROOT = path.join(__dirname, "runs");
const CEILING_USD = 8;
const SEED = 1;
const TEMPERATURE = 0;
const MODEL = "gpt-5.1-2025-11-13";
const ARM = "b390-line-ids";
const PROMPT_FILE = path.join(__dirname, "prompt-final-ids.md");

function userMessage(sources, draft, statements) {
  const sourceBlocks = sources.map((source) => {
    const numbered = numberLines(source.text);
    return `SOURCE id=${source.id} label=${source.label}\n${numbered.text}`;
  });
  const numbered = statements.map((row) => `[${row.index}] ${row.text}`).join("\n");
  return ["SOURCES:", sourceBlocks.join("\n\n"), "", "DRAFT:", draft, "", "STATEMENTS:", numbered].join("\n");
}

function asStringList(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normaliseClaim(raw) {
  const statementIndex = Number(raw?.statementIndex);
  const verdictToken = String(raw?.verdict ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  let verdict = null;
  if (verdictToken === "confirmed") verdict = "confirmed";
  else if (verdictToken === "partially_confirmed") verdict = "partially_confirmed";
  else if (verdictToken === "conflicting") verdict = "conflicting";
  else if (verdictToken === "not_supported" || verdictToken === "unsupported") verdict = "not_supported";
  let sourceId = null;
  if (typeof raw?.sourceId === "string" || typeof raw?.sourceId === "number") {
    const id = String(raw.sourceId).trim();
    sourceId = id.length ? id : null;
  }
  const lines = raw?.lines === undefined ? null : raw.lines;
  let passage = null;
  if (typeof raw?.passage === "string" && raw.passage.length) passage = raw.passage;
  return {
    statementIndex: Number.isInteger(statementIndex) ? statementIndex : null,
    claim: typeof raw?.claim === "string" ? raw.claim : "",
    verdict,
    rawVerdict: raw?.verdict ?? null,
    lines,
    passage,
    sourceId,
    comment: typeof raw?.comment === "string" ? raw.comment : "",
  };
}

function cardFrom(fixtureId, row, claims) {
  const rolled = rollupClaims(claims);
  return {
    fixtureId,
    statement: row.text,
    index: row.index,
    displayVerdict: rolled.displayVerdict,
    hasConflict: rolled.displayVerdict === "conflict",
    sourceMatches: [],
    supportSpans: [],
    primaryExcerpt: "",
    conflictExcerpt: "",
    displayVerdictReason: rolled.displayVerdict ? "b390_line_ids" : `b390_line_ids_${rolled.rollupReason}`,
    supportState: rolled.displayVerdict,
    evidenceNotReviewedReason: rolled.displayVerdict ? null : rolled.rollupReason,
    excerptNotLocatable: false,
    hasRealExcerpt: false,
    rollupReason: rolled.rollupReason,
    claimCount: claims.length,
    claims,
  };
}

function stampOccurrence(cards) {
  return addOccurrenceIndices(cards.map((card) => ({ ...card, text: card.statement }))).map((card) => {
    const { text, ...rest } = card;
    return { ...rest, statement: text };
  });
}

function buildFixtureRecord(job, extracted, finishReason) {
  const claims = extracted.parseOk ? extracted.value.claims.map(normaliseClaim) : [];
  const byIndex = new Map();
  const unmatchedClaims = [];
  const known = new Set(job.statements.map((row) => row.index));
  for (const claim of claims) {
    if (claim.statementIndex == null || !known.has(claim.statementIndex)) {
      unmatchedClaims.push(claim);
      continue;
    }
    if (!byIndex.has(claim.statementIndex)) byIndex.set(claim.statementIndex, []);
    byIndex.get(claim.statementIndex).push(claim);
  }
  const cards = job.statements.map((row) => cardFrom(job.fixtureId, row, byIndex.get(row.index) || []));
  return {
    record: {
      fixtureId: job.fixtureId,
      label: job.label,
      parseOk: extracted.parseOk === true,
      parseError: extracted.parseOk ? null : extracted.error || "unparsed",
      finishReason,
      assessment: extracted.parseOk && typeof extracted.value.assessment === "string" ? extracted.value.assessment : "",
      strengths: extracted.parseOk ? asStringList(extracted.value.strengths) : [],
      improvements: extracted.parseOk ? asStringList(extracted.value.improvements) : [],
      claimCount: claims.length,
      unmatchedClaims,
      noClaimStatementIndexes: cards.filter((card) => card.claimCount === 0).map((card) => card.index),
      claims,
    },
    cards,
  };
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function spentByOtherPasses(thisPass) {
  let discounted = 0;
  const names = [];
  let entries = [];
  try {
    entries = await readdir(RUNS_ROOT);
  } catch {
    return { discounted, names };
  }
  for (const name of entries) {
    if (name === thisPass) continue;
    const file = path.join(RUNS_ROOT, name, "cards.json");
    try {
      const doc = JSON.parse(await readFile(file, "utf8"));
      if (doc?.arm !== ARM) continue;
      discounted += Number(doc.costUsd) || 0;
      names.push(name);
    } catch {
      // A pass that has not written cards yet is not spend.
    }
  }
  return { discounted, names };
}

function addUsage(base, extra) {
  return {
    costUsd: (Number(base?.costUsd) || 0) + (Number(extra?.costUsd) || 0),
    calls: (Number(base?.calls) || 0) + (Number(extra?.calls) || 0),
    inputTokens: (Number(base?.inputTokens) || 0) + (Number(extra?.inputTokens) || 0),
    cachedInputTokens: (Number(base?.cachedInputTokens) || 0) + (Number(extra?.cachedInputTokens) || 0),
    outputTokens: (Number(base?.outputTokens) || 0) + (Number(extra?.outputTokens) || 0),
    unpricedCalls: (Number(base?.unpricedCalls) || 0) + (Number(extra?.unpricedCalls) || 0),
  };
}

function withTimeout(promise, ms, label) {
  promise.catch(() => {});
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Call timed out after ${ms}ms on ${label}. Resume will retry it.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function finishReasonOf(result) {
  const reason = result?.raw?.choices?.[0]?.finish_reason;
  return typeof reason === "string" ? reason : null;
}

async function writeCards(outPath, payload) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function runPass({ pass, callLLM, calculateLlmCostUsd, getLlmSpend, resetLlmSpend, pricing, cfg }) {
  const prompt = await readFile(PROMPT_FILE, "utf8");
  if (!prompt.trim()) throw new Error(`${PROMPT_FILE} is empty. Refusing to call.`);
  const promptSha256 = createHash("sha256").update(prompt).digest("hex");
  const outPath = path.join(RUNS_ROOT, pass, "cards.json");
  let existing = null;
  if (await fileExists(outPath)) {
    existing = JSON.parse(await readFile(outPath, "utf8"));
    if (existing?.arm !== ARM) throw new Error(`${outPath} is not a B390 pass. Refusing to skip it.`);
    if (existing.promptSha256 && existing.promptSha256 !== promptSha256) {
      throw new Error(`${outPath} was written with a different prompt. Refusing to resume it.`);
    }
  }
  const prior = await spentByOtherPasses(pass);
  const already = Number(existing?.costUsd) || 0;
  if (prior.discounted + already >= CEILING_USD) {
    throw new Error(
      `Spend is already ${(prior.discounted + already).toFixed(4)} USD, at or over the ceiling of ${CEILING_USD}. Not calling. Passes: ${prior.names.join(", ") || "none"}.`
    );
  }
  const allJobs = await jobsFor("held-out");
  if (allJobs.length !== 18) throw new Error(`Expected 18 held-out drafts, got ${allJobs.length}. Not calling.`);
  const doneIds = new Set((existing?.fixtures || []).map((row) => row.fixtureId));
  const jobs = allJobs.filter((job) => !doneIds.has(job.fixtureId));
  if (jobs.length === 0) {
    console.log(`pass ${pass} already written, not calling. costUsd=${already.toFixed(4)}`);
    return existing;
  }
  if (doneIds.size) console.log(`pass ${pass} resuming. ${doneIds.size} fixtures kept, ${jobs.length} left.`);
  resetLlmSpend();
  const fixturesOut = [...(existing?.fixtures || [])];
  const cards = [];
  const jobById = new Map(allJobs.map((job) => [job.fixtureId, job]));
  for (const row of existing?.fixtures || []) {
    const job = jobById.get(row.fixtureId);
    if (!job) throw new Error(`Resume cannot find job ${row.fixtureId}.`);
    const built = buildFixtureRecord(
      job,
      {
        parseOk: row.parseOk === true,
        value: { claims: row.claims, assessment: row.assessment, strengths: row.strengths, improvements: row.improvements },
        error: row.parseError,
      },
      row.finishReason
    );
    cards.push(...built.cards);
  }
  let stopped = false;
  let stopReason = null;
  for (const job of jobs) {
    const spentBeforeCall = prior.discounted + already + getLlmSpend().costUsd;
    if (spentBeforeCall >= CEILING_USD) {
      stopped = true;
      stopReason = `Meter ${spentBeforeCall.toFixed(4)} USD is at the ceiling of ${CEILING_USD} before ${job.fixtureId}. Not calling.`;
      console.log(stopReason);
      break;
    }
    console.log(`pass ${pass} ${job.fixtureId} statements=${job.statements.length} sources=${job.sources.length} draftChars=${job.draft.length}`);
    const before = getLlmSpend();
    const result = await withTimeout(
      callLLM({
        provider: cfg.provider,
        model: cfg.model,
        temperature: TEMPERATURE,
        seed: SEED,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userMessage(job.sources, job.draft, job.statements) },
        ],
        traceName: "b390-line-ids",
        spanName: `b390-${pass}-${job.fixtureId}`,
        metadata: { pass, fixtureId: job.fixtureId, set: "held-out" },
      }),
      240000,
      `${pass} ${job.fixtureId}`
    );
    const after = getLlmSpend();
    const callUsage = result?.usage || null;
    const callCost = calculateLlmCostUsd(cfg.provider, cfg.model, callUsage);
    if ((Number(callUsage?.inputTokens) || 0) + (Number(callUsage?.outputTokens) || 0) > 0 && !(callCost > 0)) {
      throw new Error(`Call returned tokens and a zero price for ${cfg.model}. Stopping.`);
    }
    if (after.unpricedCalls > before.unpricedCalls) {
      throw new Error("An unpriced model call was recorded. Stopping.");
    }
    const extracted = extractJsonObject(result?.text);
    const built = buildFixtureRecord(job, extracted, finishReasonOf(result));
    built.record.callUsage = callUsage;
    if (!extracted.parseOk) built.record.rawText = typeof result?.text === "string" ? result.text : "";
    fixturesOut.push(built.record);
    cards.push(...built.cards);
    const spentNow = prior.discounted + already + after.costUsd;
    const passUsage = addUsage(existing, after);
    const payload = {
      arm: ARM,
      pass,
      set: "held-out",
      model: cfg.model,
      provider: cfg.provider,
      temperature: TEMPERATURE,
      seed: SEED,
      cache: "off",
      promptFile: "scripts/diagnostic/b390/prompt-final-ids.md",
      promptSha256,
      costUsd: passUsage.costUsd,
      costUsdList: (Number(existing?.costUsdList) || 0) + (listUsd(cfg.model, after, pricing) || 0),
      calls: passUsage.calls,
      inputTokens: passUsage.inputTokens,
      cachedInputTokens: passUsage.cachedInputTokens,
      outputTokens: passUsage.outputTokens,
      unpricedCalls: passUsage.unpricedCalls,
      priorPasses: prior.names,
      priorCostUsd: prior.discounted,
      combinedCostUsd: spentNow,
      ceilingUsd: CEILING_USD,
      stopped: false,
      stopReason: null,
      noClaimCards: cards.filter((card) => card.claimCount === 0).length,
      extractedAt: new Date().toISOString(),
      fixtures: fixturesOut,
      cards: stampOccurrence(cards),
    };
    await writeCards(outPath, payload);
    console.log(
      `pass ${pass} ${job.fixtureId} parseOk=${extracted.parseOk} claims=${built.record.claimCount} noClaim=${built.record.noClaimStatementIndexes.length} finish=${built.record.finishReason || "none"} costUsd=${callCost.toFixed(4)} spent=${spentNow.toFixed(4)}`
    );
    if (!extracted.parseOk) console.log(`pass ${pass} ${job.fixtureId} parseError=${extracted.error}`);
    if (spentNow > CEILING_USD) {
      stopped = true;
      stopReason = `Meter ${spentNow.toFixed(4)} USD passed the ceiling of ${CEILING_USD} after ${job.fixtureId}.`;
      payload.stopped = true;
      payload.stopReason = stopReason;
      await writeCards(outPath, payload);
      console.log(stopReason);
      break;
    }
  }
  const spend = addUsage(existing, getLlmSpend());
  const written = JSON.parse(await readFile(outPath, "utf8"));
  written.costUsd = spend.costUsd;
  written.costUsdList = (Number(existing?.costUsdList) || 0) + (listUsd(cfg.model, getLlmSpend(), pricing) || 0);
  written.calls = spend.calls;
  written.inputTokens = spend.inputTokens;
  written.cachedInputTokens = spend.cachedInputTokens;
  written.outputTokens = spend.outputTokens;
  written.unpricedCalls = spend.unpricedCalls;
  written.combinedCostUsd = prior.discounted + spend.costUsd;
  written.stopped = stopped;
  written.stopReason = stopReason;
  written.cards = stampOccurrence(cards);
  await writeCards(outPath, written);
  console.log(
    `PASS ${pass} ${stopped ? "STOPPED" : "DONE"} cards=${cards.length} costUsd=${Number(spend.costUsd).toFixed(4)} combined=${written.combinedCostUsd.toFixed(4)}`
  );
  return written;
}

async function printTotal() {
  const spent = await spentByOtherPasses("");
  console.log(`B390 DISCOUNTED TOTAL USD ${spent.discounted.toFixed(4)} ceiling ${CEILING_USD} passes ${spent.names.join(", ") || "none"}`);
  if (spent.discounted > CEILING_USD) {
    throw new Error(`Discounted spend ${spent.discounted.toFixed(4)} USD is over the ceiling of ${CEILING_USD}.`);
  }
}

async function main() {
  loadLocalEnvFiles({ liveMeasurement: true });
  process.env.QC_LLM_CACHE = "0";
  delete process.env.QC_LLM_CACHE_DISK;

  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
  const { callLLM, calculateLlmCostUsd, getLlmPricingTable, getLlmSpend, resetLlmSpend, hasProviderApiKey } =
    await import("../../../lib/observability.js");
  const cfg = STAGE_MODELS["writing-rewrite"];
  if (cfg?.model !== MODEL || cfg?.provider !== "openai") {
    throw new Error(`writing-rewrite is ${cfg?.provider}/${cfg?.model}. B390 pins ${MODEL}. Not calling.`);
  }
  if (!hasProviderApiKey(cfg.provider)) throw new Error("OPENAI_API_KEY required");
  const pricing = getLlmPricingTable();
  if (!pricing?.openai?.[MODEL]) throw new Error(`No published price for ${MODEL}. Refusing to call.`);

  const tools = { callLLM, calculateLlmCostUsd, getLlmSpend, resetLlmSpend, pricing, cfg };
  await runPass({ pass: "ids-1", ...tools });
  await runPass({ pass: "ids-2", ...tools });
  await printTotal();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
