#!/usr/bin/env node
/**
 * B313. Four editorial calls: today's payload twice, then a reordered probe twice.
 * Probe-only. Not wired into any product path.
 *
 *   node scripts/diagnostic/cache-probe/run-cache-probe.mjs
 */

import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import {
  DEFAULT_HOUSE,
  DEFAULT_OUTPUT_TYPE,
  DEFAULT_REQUIRED_VERSION,
  loadReviewStatements,
  neighbourTexts,
  reconstructDraft,
} from "../stage-replay/lib.mjs";

loadLocalEnvFiles();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const RUNS_DIR = path.join(ROOT, "scripts/diagnostic/runs/stage-replay");
const COMMITTED_FIXTURE = path.join(ROOT, "tests/fixtures/b247/shopify-messy-full-after.json");
const MODEL = "gpt-4o-2024-08-06";
const OUT_JSON = path.join(__dirname, "last-run.json");

function wordCount(text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return 0;
  return t.split(/\s+/).length;
}

async function resolveRecordedPayload() {
  await mkdir(RUNS_DIR, { recursive: true });
  let names = [];
  try {
    names = (await readdir(RUNS_DIR)).filter((n) => n.endsWith(".json"));
  } catch {
    names = [];
  }
  const recorded = names.find((n) => n.includes("shopify") || n.includes("payload") || n === "cache-probe-payload.json");
  const dest = path.join(RUNS_DIR, "cache-probe-payload.json");
  if (!recorded) {
    await copyFile(COMMITTED_FIXTURE, dest);
    return dest;
  }
  return path.join(RUNS_DIR, recorded);
}

function headerNumber(headers, name) {
  const raw = headers.get(name);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

async function chat(messages, label) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages,
      response_format: { type: "json_object" },
    }),
  });
  const limitTokens = headerNumber(res.headers, "x-ratelimit-limit-tokens");
  const remainingTokens = headerNumber(res.headers, "x-ratelimit-remaining-tokens");
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`${label} HTTP ${res.status} ${JSON.stringify(body?.error || body)}`);
  }
  const usage = body?.usage || {};
  const prompt_tokens = Number(usage.prompt_tokens) || 0;
  const completion_tokens = Number(usage.completion_tokens) || 0;
  const cached_tokens = Number(usage.prompt_tokens_details?.cached_tokens) || 0;
  return {
    label,
    prompt_tokens,
    cached_tokens,
    completion_tokens,
    limit_tokens: limitTokens,
    remaining_tokens: remainingTokens,
  };
}

function neighbourBlock(prev, next, sentence) {
  const before =
    typeof prev === "string" && prev.trim()
      ? prev.trim()
      : "(none — this is the first statement)";
  const after =
    typeof next === "string" && next.trim()
      ? next.trim()
      : "(none — this is the last statement)";
  return `CONTEXT BEFORE:
${before}

CURRENT STATEMENT (evaluate only this):
${sentence}

CONTEXT AFTER:
${after}`;
}

async function main() {
  const {
    buildEditorialStyleSystemPrompt,
    buildEditorialStyleUserPayload,
  } = await import("../../../lib/qc/editorial-compliance-reviewer.mjs");
  const { resolveStyleGuide } = await import("../../../lib/qc/style-guide.mjs");
  const editorialRules = (await import("../../../lib/rulebook/editorialRules.js")).default;
  const {
    normalizeOutputType,
    normalizeVisibility,
    getOutputTypeLabel,
  } = await import("../../../lib/output-intent.js");
  const { identifyAuthoringOrganisation, resolveAuthoringOrganisationName } = await import(
    "../../../lib/qc/first-person-actor.mjs"
  );
  const { calculateLlmCostUsd } = await import("../../../lib/observability.js");

  const payloadPath = await resolveRecordedPayload();
  const payload = JSON.parse(await readFile(payloadPath, "utf8"));
  const all = loadReviewStatements(payload);
  const draftText = reconstructDraft(payload);
  const pick =
    all.find((s) => s.text && s.text.length > 40 && editorialSucceededSafe(s)) || all.find((s) => s.text) || all[0];
  if (!pick) throw new Error("no statement on recorded payload");
  const neighbours = neighbourTexts(all, pick.index);
  const outputType = normalizeOutputType(DEFAULT_OUTPUT_TYPE);
  const requiredVersion = normalizeVisibility(DEFAULT_REQUIRED_VERSION);
  const outputTypeLabel = getOutputTypeLabel(outputType);
  const outputSlug = "reporting_commentary";
  const versionSlug = requiredVersion === "public" ? "public" : "complete";
  const editorialFiltered = editorialRules.filter((r) => {
    if (!Array.isArray(r.appliesTo) || !r.appliesTo.includes(outputSlug)) return false;
    if (r.appliesToVersion == null) return true;
    return Array.isArray(r.appliesToVersion) && r.appliesToVersion.includes(versionSlug);
  });
  const houseName = identifyAuthoringOrganisation(
    draftText,
    resolveAuthoringOrganisationName(DEFAULT_HOUSE)
  );
  const structuredStyleRules = resolveStyleGuide({
    outputType,
    authoringOrganisation: DEFAULT_HOUSE,
    promptHouseName: houseName,
  });
  const systemPrompt = buildEditorialStyleSystemPrompt({
    outputTypeLabel,
    editorialRules: editorialFiltered,
    structuredStyleRules,
    outputSlug,
    outputType,
    houseName,
  });
  const userToday = buildEditorialStyleUserPayload({
    sentenceText: pick.text,
    outputTypeLabel,
    requiredVersion,
    draftText,
    evidenceExcerpt: null,
    contextBefore: neighbours.previousStatementText,
    contextAfter: neighbours.nextStatementText,
    evidenceBlock: "",
    authoringOrganisation: DEFAULT_HOUSE,
  });
  const unmarkedDraft = draftText;
  const sentenceLast = neighbourBlock(
    neighbours.previousStatementText,
    neighbours.nextStatementText,
    pick.text
  );

  const todayMessages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userToday },
  ];
  const reorderedMessages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: unmarkedDraft },
    { role: "user", content: sentenceLast },
  ];

  const calls = [];
  calls.push(await chat(todayMessages, "today-1"));
  calls.push(await chat(todayMessages, "today-2"));
  calls.push(await chat(reorderedMessages, "reordered-1"));
  calls.push(await chat(reorderedMessages, "reordered-2"));

  let listUsd = 0;
  let discountedUsd = 0;
  for (const c of calls) {
    const usage = {
      inputTokens: c.prompt_tokens,
      outputTokens: c.completion_tokens,
      cachedInputTokens: c.cached_tokens,
    };
    discountedUsd += calculateLlmCostUsd("openai", MODEL, usage);
    listUsd +=
      (c.prompt_tokens / 1_000_000) * 2.5 + (c.completion_tokens / 1_000_000) * 10.0;
  }

  const result = {
    spec: "B313",
    payloadPath,
    statementIndex: pick.index,
    statementText: pick.text,
    draftWordCount: wordCount(draftText),
    calls,
    listUsd: Number(listUsd.toFixed(6)),
    discountedUsd: Number(discountedUsd.toFixed(6)),
  };
  await writeFile(OUT_JSON, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

function editorialSucceededSafe(s) {
  const v = typeof s?.qcCard?.editorialVerdict === "string" ? s.qcCard.editorialVerdict.trim() : "";
  return v === "clean" || v === "concern";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
