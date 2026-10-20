/**
 * B403. Two extraction calls on the HICL interim source.
 * Prints the estimate and the call count before the first call.
 * Does not call when the estimate is above USD 3.
 * No retry. A bad JSON reply is stored and not called again.
 *
 *   node scripts/diagnostic/b403/extract-facts.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE_PATH = "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt";
const OUT_DIR = path.join(ROOT, "scripts/diagnostic/b403/runs");
const MODEL = "gpt-4o-2024-08-06";
const CEILING_USD = 3;
const CALLS = 2;
const OUTPUT_TOKEN_CEILING = 16384;
const INPUT_RATE = 2.5;
const OUTPUT_RATE = 10;

export const SYSTEM_PROMPT = `You extract facts. You do not give a verdict, a judgement, or a comment.
Return a JSON object with one key, rows.
Each row has exactly these fields and no others: subject, element, value, period, lineId.
subject is the thing the fact is about, in the source's own words.
element is the attribute, in the source's own words.
value is copied from the cited line, not a paraphrase.
period is the period that governs the value, copied from the source, or an empty string when the cited line states no period.
lineId is L followed by the line number printed beside that line, for example L16.
One row per fact. No prose, no score, and no extra key.`;

function numberedSource(text) {
  const lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return lines.map((line, index) => `L${index + 1} ${line}`).join("\n");
}

function estimateUsd(inputTokens) {
  return CALLS * ((inputTokens / 1_000_000) * INPUT_RATE + (OUTPUT_TOKEN_CEILING / 1_000_000) * OUTPUT_RATE);
}

function listUsd(usage) {
  const input = Number(usage?.inputTokens) || 0;
  const output = Number(usage?.outputTokens) || 0;
  return (input / 1_000_000) * INPUT_RATE + (output / 1_000_000) * OUTPUT_RATE;
}

function discountedUsd(usage) {
  const input = Number(usage?.inputTokens) || 0;
  const cached = Number(usage?.cachedInputTokens) || 0;
  const output = Number(usage?.outputTokens) || 0;
  const fresh = Math.max(0, input - cached);
  return (fresh / 1_000_000) * INPUT_RATE + (cached / 1_000_000) * 1.25 + (output / 1_000_000) * OUTPUT_RATE;
}

function parseRows(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { rows: [], parseError: err.message, raw: text };
  }
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : null;
  if (!rows) return { rows: [], parseError: "rows is not an array", raw: text };
  return {
    rows: rows.map((row) => ({
      subject: typeof row?.subject === "string" ? row.subject : "",
      element: typeof row?.element === "string" ? row.element : "",
      value: typeof row?.value === "string" ? row.value : "",
      period: typeof row?.period === "string" ? row.period : "",
      lineId: typeof row?.lineId === "string" ? row.lineId : "",
    })),
    parseError: null,
    raw: null,
  };
}

async function main() {
  const source = readFileSync(path.join(ROOT, SOURCE_PATH), "utf8");
  if (!source.trim()) throw new Error(`empty source ${SOURCE_PATH}`);
  const user = `${SYSTEM_PROMPT}\n\nSource:\n${numberedSource(source)}`;
  const inputTokens = Math.ceil((SYSTEM_PROMPT.length + user.length) / 4);
  const estimate = estimateUsd(inputTokens);
  console.log(
    `B403 estimate: ${CALLS} calls, ${inputTokens} input tokens at chars/4, output ceiling ${OUTPUT_TOKEN_CEILING}, USD ${estimate.toFixed(4)} list. Model ${MODEL}. Ceiling USD ${CEILING_USD}. No cache assumed.`
  );
  if (estimate > CEILING_USD) {
    const body = `# B403 probe\n\nNot run. The estimate is USD ${estimate.toFixed(4)} list for ${CALLS} calls, above the ceiling of USD ${CEILING_USD}.\n`;
    writeFileSync(path.join(ROOT, "scripts/diagnostic/b403/PROBE.md"), body);
    console.log("Estimate is above USD 3. Not run.");
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  mkdirSync(OUT_DIR, { recursive: true });
  const spend = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    listUsd: 0,
    costUsd: 0,
  };
  for (let n = 1; n <= CALLS; n += 1) {
    const raw = await client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      seed: 1,
      max_tokens: OUTPUT_TOKEN_CEILING,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    });
    const text = raw?.choices?.[0]?.message?.content ?? "";
    const usage = {
      inputTokens: Number(raw?.usage?.prompt_tokens) || 0,
      outputTokens: Number(raw?.usage?.completion_tokens) || 0,
      cachedInputTokens: Number(raw?.usage?.prompt_tokens_details?.cached_tokens) || 0,
    };
    spend.calls += 1;
    spend.inputTokens += usage.inputTokens;
    spend.outputTokens += usage.outputTokens;
    spend.cachedInputTokens += usage.cachedInputTokens;
    spend.listUsd += listUsd(usage);
    spend.costUsd += discountedUsd(usage);
    const parsed = parseRows(text);
    const payload = {
      model: MODEL,
      temperature: 0,
      seed: 1,
      source: SOURCE_PATH,
      call: n,
      finishReason: raw?.choices?.[0]?.finish_reason ?? null,
      usage,
      rowCount: parsed.rows.length,
      parseError: parsed.parseError,
      rows: parsed.rows,
      raw: parsed.raw,
    };
    writeFileSync(path.join(OUT_DIR, `facts-${n}.json`), JSON.stringify(payload, null, 2));
    console.log(`Call ${n}: rows ${parsed.rows.length}, finish ${payload.finishReason}, parse ${parsed.parseError || "ok"}, input ${usage.inputTokens}, output ${usage.outputTokens}, cached ${usage.cachedInputTokens}`);
  }
  writeFileSync(path.join(OUT_DIR, "spend.json"), JSON.stringify(spend, null, 2));
  console.log(
    `B403 spent: ${spend.calls} calls, list USD ${spend.listUsd.toFixed(6)}, discounted USD ${spend.costUsd.toFixed(6)}, input ${spend.inputTokens}, output ${spend.outputTokens}, cached ${spend.cachedInputTokens}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
