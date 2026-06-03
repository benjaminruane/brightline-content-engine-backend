/**
 * R6.11a verification — short-circuit callLLM / logCanaryScore when globals are set.
 * Use: node --experimental-loader ./scripts/diagnostic/verify-r6-11a-loader.mjs ...
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OBS_FILE = fileURLToPath(new URL("../../lib/observability.js", import.meta.url));

function isObservabilityModule(url) {
  try {
    return fileURLToPath(url) === OBS_FILE;
  } catch {
    return false;
  }
}

export async function load(url, context, nextLoad) {
  if (!isObservabilityModule(url)) {
    return nextLoad(url, context, nextLoad);
  }

  const source = readFileSync(OBS_FILE, "utf8");
  const patched = source
    .replace(
      `  const cleanProvider = String(provider || "openai").trim().toLowerCase();
  const startedAt = Date.now();`,
      `  if (typeof globalThis.__R611A_MOCK_HANDLER === "function") {
    const text = await globalThis.__R611A_MOCK_HANDLER({
      provider,
      model,
      messages,
      temperature,
      responseFormat,
      traceId,
      traceName,
      spanName,
      metadata,
    });
    return {
      text: typeof text === "string" ? text : "",
      usage: { inputTokens: 0, outputTokens: 0 },
      model,
      provider: "mock",
      latencyMs: 0,
      raw: null,
    };
  }
  const cleanProvider = String(provider || "openai").trim().toLowerCase();
  const startedAt = Date.now();`
    )
    .replace(
      "export function logCanaryScore({ traceId, name, value = 1, comment = null, metadata = null }) {",
      `export function logCanaryScore({ traceId, name, value = 1, comment = null, metadata = null }) {
  if (Array.isArray(globalThis.__R611A_CANARIES)) {
    globalThis.__R611A_CANARIES.push({ traceId, name, value, comment, metadata });
  }`
    );

  return {
    format: "module",
    source: patched,
    shortCircuit: true,
    context,
  };
}
