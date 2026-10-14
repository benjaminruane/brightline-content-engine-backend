/**
 * B388. One model call per draft. Tune set is accuracy fixtures 01-10.
 * Held-out is fixtures 11-20, the four doctored drafts, and the four clean
 * drafts. The prompt file is chosen by the caller. Held-out is never an
 * input to a prompt edit.
 *
 *   node scripts/diagnostic/b388/run.mjs --set tune --prompt v1 --pass tune-v1
 *   node scripts/diagnostic/b388/run.mjs
 *
 * With no arguments, runs any missing pass: tune-v1, tune-final when
 * prompt-final.md differs from prompt-v1.md, then held-1 and held-2 on
 * prompt-final.md. A pass that already has cards.json is not called again.
 *
 * Ceiling USD 15 discounted across every pass this arm writes. If the meter
 * is already at the ceiling, the next call is not made.
 */
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { addOccurrenceIndices } from "../accuracy/lib.mjs";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import {
  accuracyJobs,
  draftFromStatementSpans,
  extractJsonObject,
  listUsd,
  realRunJobs,
  rollupClaims,
  statementsFromReview,
} from "../b381/run-draft-review.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const RUNS_ROOT = path.join(__dirname, "runs");
const CEILING_USD = 15;
const SEED = 1;
const TEMPERATURE = 0;
const MODEL = "gpt-5.1-2025-11-13";
const ARM = "b388-draft-review";

const CLEAN_RUNS = [
  {
    fixtureId: "2026-09-29-clean",
    label: "3i-hy25-clean",
    reviewPath: "tests/fixtures/real-runs-2026-09-29/clean-review.json",
    draftPath: null,
    sourcePath: "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt",
    sourceLabel: "source-3i-hy25-extracted",
  },
  {
    fixtureId: "2026-10-04-hicl-clean",
    label: "hicl-interim-clean",
    reviewPath: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json",
    draftPath: null,
    sourcePath: "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt",
    sourceLabel: "source-hicl-interim-extracted",
  },
  {
    fixtureId: "2026-10-06-gpi-clean",
    label: "gpi-press-release-clean",
    reviewPath: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json",
    draftPath: "tests/fixtures/real-runs-2026-10-06-gpi/clean-draft.txt",
    sourcePath: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt",
    sourceLabel: "source-gpi-press-release-extracted",
  },
  {
    fixtureId: "2026-10-06-clearpoint-clean",
    label: "clearpoint-q1-2026-clean",
    reviewPath: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json",
    draftPath: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean-draft.txt",
    sourcePath: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt",
    sourceLabel: "source-clearpoint-q1-2026-extracted",
  },
];

function promptPath(name) {
  if (name === "v1") return path.join(__dirname, "prompt-v1.md");
  if (name === "final") return path.join(__dirname, "prompt-final.md");
  throw new Error(`Unknown prompt ${JSON.stringify(name)}. Use v1 or final.`);
}

export function parseArgs(argv) {
  let set = null;
  let prompt = null;
  let pass = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--set" && argv[i + 1]) set = String(argv[++i]);
    else if (argv[i] === "--prompt" && argv[i + 1]) prompt = String(argv[++i]);
    else if (argv[i] === "--pass" && argv[i + 1]) pass = String(argv[++i]);
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  if (!set && !prompt && !pass) return { protocol: true };
  if (!set || !prompt || !pass) throw new Error("Pass --set, --prompt, and --pass together, or no arguments.");
  if (set !== "tune" && set !== "held-out") throw new Error(`Unknown set ${JSON.stringify(set)}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(pass)) throw new Error(`Refusing pass id ${JSON.stringify(pass)}`);
  return { protocol: false, set, prompt, pass };
}

function userMessage(sources, draft, statements) {
  const sourceBlocks = sources.map((source) => `SOURCE id=${source.id} label=${source.label}\n${source.text}`);
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
  let passage = null;
  if (typeof raw?.passage === "string") passage = raw.passage.length ? raw.passage : null;
  let sourceId = null;
  if (typeof raw?.sourceId === "string" || typeof raw?.sourceId === "number") {
    const id = String(raw.sourceId).trim();
    sourceId = id.length ? id : null;
  }
  return {
    statementIndex: Number.isInteger(statementIndex) ? statementIndex : null,
    claim: typeof raw?.claim === "string" ? raw.claim : "",
    verdict,
    rawVerdict: raw?.verdict ?? null,
    passage,
    sourceId,
    comment: typeof raw?.comment === "string" ? raw.comment : "",
  };
}

function cardFrom(fixtureId, row, claims) {
  const rolled = rollupClaims(claims);
  const passage = claims.find((claim) => typeof claim.passage === "string" && claim.passage.length)?.passage || "";
  return {
    fixtureId,
    statement: row.text,
    index: row.index,
    displayVerdict: rolled.displayVerdict,
    hasConflict: rolled.displayVerdict === "conflict",
    sourceMatches: [],
    supportSpans: [],
    primaryExcerpt: passage,
    conflictExcerpt: "",
    displayVerdictReason: rolled.displayVerdict ? "b388_draft_review" : `b388_draft_review_${rolled.rollupReason}`,
    supportState: rolled.displayVerdict,
    evidenceNotReviewedReason: rolled.displayVerdict ? null : rolled.rollupReason,
    excerptNotLocatable: false,
    hasRealExcerpt: passage.length > 0,
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

async function cleanJobs() {
  const jobs = [];
  for (const spec of CLEAN_RUNS) {
    const review = JSON.parse(await readFile(path.join(ROOT, spec.reviewPath), "utf8"));
    const statements = statementsFromReview(review);
    if (statements.length === 0 || statements.some((row) => !row.text.trim())) {
      throw new Error(`${spec.fixtureId} has an empty statement. Not calling.`);
    }
    const sourceText = await readFile(path.join(ROOT, spec.sourcePath), "utf8");
    if (!sourceText.trim()) throw new Error(`${spec.fixtureId} has an empty source. Not calling.`);
    const draft = spec.draftPath
      ? await readFile(path.join(ROOT, spec.draftPath), "utf8")
      : draftFromStatementSpans(statements);
    for (const row of statements) {
      if (!draft.includes(row.text)) {
        throw new Error(`Statement ${spec.fixtureId} [${row.index}] is not in the draft. Not calling.`);
      }
    }
    jobs.push({
      fixtureId: spec.fixtureId,
      label: spec.label,
      draft,
      sources: [{ id: "0", label: spec.sourceLabel, text: sourceText }],
      statements,
    });
  }
  return jobs;
}

export async function jobsFor(set) {
  if (set === "tune") {
    const jobs = await accuracyJobs();
    return jobs.filter((job) => Number(job.fixtureId) >= 1 && Number(job.fixtureId) <= 10);
  }
  if (set === "held-out") {
    const accuracy = await accuracyJobs();
    const held = accuracy.filter((job) => Number(job.fixtureId) >= 11 && Number(job.fixtureId) <= 20);
    if (held.length !== 10) throw new Error(`Expected fixtures 11 to 20, got ${held.length}. Not calling.`);
    return [...held, ...(await realRunJobs()), ...(await cleanJobs())];
  }
  throw new Error(`Unknown set ${set}`);
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

export async function runPass({ set, promptName, pass, callLLM, calculateLlmCostUsd, getLlmSpend, resetLlmSpend, pricing, cfg }) {
  const file = promptPath(promptName);
  const prompt = await readFile(file, "utf8");
  if (!prompt.trim()) throw new Error(`${file} is empty. Refusing to call.`);
  const promptSha256 = createHash("sha256").update(prompt).digest("hex");
  const outPath = path.join(RUNS_ROOT, pass, "cards.json");
  let existing = null;
  if (await fileExists(outPath)) {
    existing = JSON.parse(await readFile(outPath, "utf8"));
    if (existing?.arm !== ARM) throw new Error(`${outPath} is not a B388 pass. Refusing to skip it.`);
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
  const allJobs = await jobsFor(set);
  if (allJobs.length === 0) throw new Error(`${set} produced no jobs. Not calling.`);
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
        parseOk: true,
        value: { claims: row.claims, assessment: row.assessment, strengths: row.strengths, improvements: row.improvements },
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
    const result = await withTimeout(callLLM({
      provider: cfg.provider,
      model: cfg.model,
      temperature: TEMPERATURE,
      seed: SEED,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userMessage(job.sources, job.draft, job.statements) },
      ],
      traceName: "b388-draft-review",
      spanName: `b388-${pass}-${job.fixtureId}`,
      metadata: { pass, fixtureId: job.fixtureId, set },
    }), 240000, `${pass} ${job.fixtureId}`);
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
      set,
      model: cfg.model,
      provider: cfg.provider,
      temperature: TEMPERATURE,
      seed: SEED,
      cache: "off",
      promptFile: path.relative(ROOT, file),
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

async function readPromptSha(name) {
  const file = promptPath(name);
  if (!(await fileExists(file))) return null;
  const text = await readFile(file, "utf8");
  return createHash("sha256").update(text).digest("hex");
}

async function printTotal() {
  const spent = await spentByOtherPasses("");
  console.log(`B388 DISCOUNTED TOTAL USD ${spent.discounted.toFixed(4)} ceiling ${CEILING_USD} passes ${spent.names.join(", ") || "none"}`);
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
    throw new Error(`writing-rewrite is ${cfg?.provider}/${cfg?.model}. B388 pins ${MODEL}. Not calling.`);
  }
  if (!hasProviderApiKey(cfg.provider)) throw new Error("OPENAI_API_KEY required");
  const pricing = getLlmPricingTable();
  if (!pricing?.openai?.[MODEL]) throw new Error(`No published price for ${MODEL}. Refusing to call.`);

  const args = parseArgs(process.argv.slice(2));
  const tools = { callLLM, calculateLlmCostUsd, getLlmSpend, resetLlmSpend, pricing, cfg };
  if (!args.protocol) {
    await runPass({ set: args.set, promptName: args.prompt, pass: args.pass, ...tools });
    await printTotal();
    return;
  }
  await runPass({ set: "tune", promptName: "v1", pass: "tune-v1", ...tools });
  const v1Sha = await readPromptSha("v1");
  const finalSha = await readPromptSha("final");
  if (!finalSha) {
    console.log("prompt-final.md is missing. Held-out was not run.");
    await printTotal();
    return;
  }
  if (finalSha !== v1Sha) {
    await runPass({ set: "tune", promptName: "final", pass: "tune-final", ...tools });
  }
  await runPass({ set: "held-out", promptName: "final", pass: "held-1", ...tools });
  await runPass({ set: "held-out", promptName: "final", pass: "held-2", ...tools });
  await printTotal();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
