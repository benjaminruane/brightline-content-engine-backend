/**
 * B381. One model call per draft. Sources, then the draft, then the
 * numbered statements. No pipeline stages. No labels. No README.
 * The prompt file is read once and is not revised from a score.
 *
 *   node scripts/diagnostic/b381/run-draft-review.mjs --pass draft-1
 *   node scripts/diagnostic/b381/run-draft-review.mjs --pass draft-2
 *   node scripts/diagnostic/b381/run-draft-review.mjs --real-runs
 *
 * Ceiling USD 10 across every pass this arm writes, on
 * calculateLlmCostUsd of recorded usage. If the meter passes the
 * ceiling, the cards written so far are kept and the process stops.
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
const ARM = "b381-draft-review";

const REAL_RUNS = [
  {
    fixtureId: "2026-09-29",
    label: "3i-hy25-doctored",
    reviewPath: "tests/fixtures/real-runs-2026-09-29/doc-review.json",
    draftPath: null,
    sourcePath: "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt",
    sourceLabel: "source-3i-hy25-extracted",
  },
  {
    fixtureId: "2026-10-04-hicl",
    label: "hicl-interim-doctored",
    reviewPath: "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json",
    draftPath: null,
    sourcePath: "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt",
    sourceLabel: "source-hicl-interim-extracted",
  },
  {
    fixtureId: "2026-10-06-gpi",
    label: "gpi-press-release-doctored",
    reviewPath: "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json",
    draftPath: "tests/fixtures/real-runs-2026-10-06-gpi/draft.txt",
    sourcePath: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt",
    sourceLabel: "source-gpi-press-release-extracted",
  },
  {
    fixtureId: "2026-10-06-clearpoint",
    label: "clearpoint-q1-2026-doctored",
    reviewPath: "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json",
    draftPath: "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty-draft.txt",
    sourcePath: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt",
    sourceLabel: "source-clearpoint-q1-2026-extracted",
  },
];

export function parseArgs(argv) {
  let pass = null;
  let realRuns = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--pass" && argv[i + 1]) pass = String(argv[++i]);
    else if (argv[i] === "--real-runs") realRuns = true;
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  if (realRuns && pass) throw new Error("Pass --pass or --real-runs, not both.");
  if (realRuns) pass = "real-runs";
  if (!pass) {
    throw new Error(
      "usage: node scripts/diagnostic/b381/run-draft-review.mjs --pass draft-1 | --pass draft-2 | --real-runs"
    );
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(pass)) throw new Error(`Refusing pass id ${JSON.stringify(pass)}`);
  return { pass, realRuns: pass === "real-runs" };
}

export function listUsd(model, usage, pricing) {
  const rate = pricing?.openai?.[model];
  if (!rate || !usage) return null;
  const input = Number(usage.inputTokens) || 0;
  const output = Number(usage.outputTokens) || 0;
  return (input / 1_000_000) * rate.input + (output / 1_000_000) * rate.output;
}

function matchBrace(text, open) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return null;
}

export function extractJsonObject(text) {
  const raw = typeof text === "string" ? text : "";
  const chunks = [];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) chunks.push(fence[1]);
  chunks.push(raw);
  const objects = [];
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      if (chunk[i] !== "{") continue;
      const end = matchBrace(chunk, i);
      if (end == null) continue;
      try {
        const value = JSON.parse(chunk.slice(i, end + 1));
        if (value && typeof value === "object" && !Array.isArray(value)) objects.push(value);
      } catch {
        // Prose can contain a brace. Keep scanning.
      }
      i = end;
    }
  }
  const withClaims = objects.filter((value) => Array.isArray(value.claims));
  if (withClaims.length > 0) return { parseOk: true, value: withClaims[withClaims.length - 1] };
  if (objects.length > 0) return { parseOk: false, error: "JSON object had no claims array" };
  return { parseOk: false, error: "no JSON object found" };
}

export function mapVerdict(raw) {
  const token = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (token === "confirmed") return "confirmed";
  if (token === "partially_confirmed") return "partially_confirmed";
  if (token === "conflicting") return "conflicting";
  if (token === "not_supported" || token === "unsupported") return "not_supported";
  return null;
}

export function rollupClaims(claims) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return { displayVerdict: null, rollupReason: "no_claim" };
  }
  if (claims.some((claim) => !claim.verdict)) {
    return { displayVerdict: null, rollupReason: "unknown_verdict" };
  }
  if (claims.some((claim) => claim.verdict === "conflicting")) {
    return { displayVerdict: "conflict", rollupReason: "any_conflicting" };
  }
  if (claims.every((claim) => claim.verdict === "not_supported")) {
    return { displayVerdict: "not_supported", rollupReason: "every_not_supported" };
  }
  if (claims.some((claim) => claim.verdict !== "confirmed")) {
    return { displayVerdict: "supported_partial", rollupReason: "any_not_confirmed" };
  }
  return { displayVerdict: "supported_full", rollupReason: "all_confirmed" };
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
  const verdict = mapVerdict(raw?.verdict);
  let passage = null;
  if (raw?.passage === null || raw?.passage === undefined) passage = null;
  else if (typeof raw.passage === "string") passage = raw.passage.length ? raw.passage : null;
  else passage = null;
  let sourceId = null;
  if (raw?.sourceId === null || raw?.sourceId === undefined) sourceId = null;
  else if (typeof raw.sourceId === "string" || typeof raw.sourceId === "number") {
    const id = String(raw.sourceId).trim();
    sourceId = id.length ? id : null;
  }
  return {
    statementIndex: Number.isInteger(statementIndex) ? statementIndex : null,
    claim: typeof raw?.claim === "string" ? raw.claim : "",
    verdict,
    rawVerdict: raw?.verdict ?? null,
    passage,
    passageWasNotString: raw?.passage != null && typeof raw.passage !== "string",
    sourceId,
    comment: typeof raw?.comment === "string" ? raw.comment : "",
  };
}

function gapText(gap) {
  if (gap === 1) return " ";
  if (gap === 2) return "\n\n";
  if (gap === 3) return " \n\n";
  throw new Error(`Cannot rebuild a draft across a gap of ${gap} characters.`);
}

export function statementsFromReview(doc) {
  const rows = Array.isArray(doc?.statements) ? doc.statements : [];
  return rows.map((row, index) => {
    const text = typeof row?.text === "string" ? row.text : "";
    const start = Number(row?.qcCard?.charStart);
    const end = Number(row?.qcCard?.charEnd);
    return {
      index,
      text,
      charStart: Number.isInteger(start) ? start : null,
      charEnd: Number.isInteger(end) ? end : null,
    };
  });
}

export function draftFromStatementSpans(rows) {
  if (rows.length === 0) throw new Error("Review payload has no statements.");
  let draft = rows[0].text;
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const row = rows[i];
    if (prev.charEnd == null || row.charStart == null) {
      throw new Error(`Statement ${row.index} has no character span, so the draft cannot be rebuilt.`);
    }
    draft += gapText(row.charStart - prev.charEnd) + row.text;
  }
  return draft;
}

function userMessage(sources, draft, statements) {
  const sourceBlocks = sources.map((source) => `SOURCE id=${source.id} label=${source.label}\n${source.text}`);
  const numbered = statements.map((row) => `[${row.index}] ${row.text}`).join("\n");
  return [
    "SOURCES:",
    sourceBlocks.join("\n\n"),
    "",
    "DRAFT:",
    draft,
    "",
    "STATEMENTS:",
    numbered,
  ].join("\n");
}

function stampOccurrence(cards) {
  return addOccurrenceIndices(cards.map((card) => ({ ...card, text: card.statement }))).map((card) => {
    const { text, ...rest } = card;
    return { ...rest, statement: text };
  });
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
    displayVerdictReason: rolled.displayVerdict ? "b381_draft_review" : `b381_draft_review_${rolled.rollupReason}`,
    supportState: rolled.displayVerdict,
    evidenceNotReviewedReason: rolled.displayVerdict ? null : rolled.rollupReason,
    excerptNotLocatable: false,
    hasRealExcerpt: passage.length > 0,
    rollupReason: rolled.rollupReason,
    claimCount: claims.length,
    claims,
  };
}

async function spentByOtherPasses(thisPass) {
  let discounted = 0;
  let list = 0;
  const names = [];
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
      if (doc?.arm !== ARM) continue;
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

export async function accuracyJobs() {
  const statementsDoc = JSON.parse(await readFile(STATEMENTS_PATH, "utf8"));
  const freezeById = frozenByFixture(statementsDoc);
  const fixtures = filterFixtures(await loadAllFixtures(), { range: RANGE });
  if (fixtures.length !== 20) {
    throw new Error(`Expected fixtures 01 to 20, loaded ${fixtures.length}. Not calling.`);
  }
  const jobs = [];
  for (const fixture of fixtures) {
    const id = padFixtureId(fixture.data.id);
    const freeze = freezeById.get(id) || [];
    if (freeze.length === 0) throw new Error(`Freeze has no statements for fixture ${id}. Not calling.`);
    const draft = typeof fixture.data.draft === "string" ? fixture.data.draft : "";
    if (!draft.trim()) throw new Error(`Fixture ${id} has no draft. Not calling.`);
    const loaded = await loadPipelineSources(fixture.data.sources || []);
    if (loaded.length === 0) throw new Error(`Fixture ${id} has no source text. Not calling.`);
    const sources = loaded.map((source, index) => ({
      id: String(index),
      label: source.label,
      text: source.text,
    }));
    if (sources.some((source) => !source.text || !source.text.trim())) {
      throw new Error(`Fixture ${id} has an empty source. Not calling.`);
    }
    const statements = freeze.map((row) => ({ index: row.index, text: row.text }));
    for (const row of statements) {
      if (!draft.includes(row.text)) {
        throw new Error(`Frozen statement ${id} [${row.index}] is not in the draft. Not calling.`);
      }
    }
    jobs.push({
      fixtureId: id,
      label: fixture.data.label || id,
      draft,
      sources,
      statements,
    });
  }
  return jobs;
}

export async function realRunJobs() {
  const jobs = [];
  for (const spec of REAL_RUNS) {
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

function finishReasonOf(result) {
  const reason = result?.raw?.choices?.[0]?.finish_reason;
  return typeof reason === "string" ? reason : null;
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
  const noClaimStatementIndexes = cards.filter((card) => card.claimCount === 0).map((card) => card.index);
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
      noClaimStatementIndexes,
      claims,
    },
    cards,
  };
}

async function writeCards(outPath, payload) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function payloadFor(pass, realRuns, cfg, prompt, fixtures, cards, spend, prior, stopped, stopReason, pricing) {
  return {
    arm: ARM,
    pass,
    realRuns,
    model: cfg.model,
    provider: cfg.provider,
    temperature: TEMPERATURE,
    seed: SEED,
    cache: "off",
    modelsTried: 1,
    promptFile: "scripts/diagnostic/b381/prompt.md",
    promptSha256: createHash("sha256").update(prompt).digest("hex"),
    range: realRuns ? "real-runs" : "01-20",
    frozenFrom: realRuns ? null : "scripts/diagnostic/accuracy/statements.json",
    stage1Called: false,
    labelsRead: false,
    pipelineOutputRead: false,
    readmeRead: false,
    costUsd: spend.costUsd,
    costUsdList: listUsd(cfg.model, spend, pricing),
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
    noClaimCards: cards.filter((card) => card.claimCount === 0).length,
    extractedAt: new Date().toISOString(),
    fixtures,
    cards: stampOccurrence(cards),
  };
}

async function main() {
  loadLocalEnvFiles({ liveMeasurement: true });
  process.env.QC_LLM_CACHE = "0";
  delete process.env.QC_LLM_CACHE_DISK;

  const { pass, realRuns } = parseArgs(process.argv.slice(2));
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

  const jobs = realRuns ? await realRunJobs() : await accuracyJobs();
  resetLlmSpend();
  const outPath = path.join(RUNS_ROOT, pass, "cards.json");
  const fixturesOut = [];
  const cards = [];
  let stopped = false;
  let stopReason = null;

  for (const job of jobs) {
    if (stopped) break;
    console.log(
      `pass ${pass} ${job.fixtureId} statements=${job.statements.length} sources=${job.sources.length} draftChars=${job.draft.length}`
    );
    const before = getLlmSpend();
    const result = await callLLM({
      provider: cfg.provider,
      model: cfg.model,
      temperature: TEMPERATURE,
      seed: SEED,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userMessage(job.sources, job.draft, job.statements) },
      ],
      traceName: "b381-draft-review",
      spanName: `b381-${pass}-${job.fixtureId}`,
      metadata: { pass, fixtureId: job.fixtureId },
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
    const finishReason = finishReasonOf(result);
    const extracted = extractJsonObject(result?.text);
    const built = buildFixtureRecord(job, extracted, finishReason);
    built.record.callUsage = callUsage;
    if (!extracted.parseOk) built.record.rawText = typeof result?.text === "string" ? result.text : "";
    fixturesOut.push(built.record);
    cards.push(...built.cards);
    const spentNow = prior.discounted + after.costUsd;
    await writeCards(
      outPath,
      payloadFor(pass, realRuns, cfg, prompt, fixturesOut, cards, after, prior, false, null, pricing)
    );
    console.log(
      `pass ${pass} ${job.fixtureId} parseOk=${extracted.parseOk} claims=${built.record.claimCount} noClaim=${built.record.noClaimStatementIndexes.length} finish=${finishReason || "none"} costUsd=${callCost.toFixed(4)} spent=${spentNow.toFixed(4)}`
    );
    if (!extracted.parseOk) console.log(`pass ${pass} ${job.fixtureId} parseError=${extracted.error}`);
    if (spentNow > CEILING_USD) {
      stopped = true;
      stopReason = `Meter ${spentNow.toFixed(4)} USD passed the ceiling of ${CEILING_USD} after ${job.fixtureId}.`;
    }
  }

  const spend = getLlmSpend();
  await writeCards(
    outPath,
    payloadFor(pass, realRuns, cfg, prompt, fixturesOut, cards, spend, prior, stopped, stopReason, pricing)
  );
  const combined = prior.discounted + spend.costUsd;
  console.log(
    `PASS ${pass} ${stopped ? "STOPPED" : "DONE"} cards=${cards.length} costUsd=${spend.costUsd.toFixed(4)} combined=${combined.toFixed(4)} wrote ${outPath}`
  );
  if (stopReason) console.log(stopReason);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
