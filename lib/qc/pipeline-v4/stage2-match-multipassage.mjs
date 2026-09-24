// Pipeline v4 — Stage 2 widened multi-passage matcher (R7 build A).
// Used to populate supportSpans. NEVER merged into sourceMatches.
// Locatable span classifications are read by the intra-source reducer to
// produce one pair-level class for Stage 3. They are not extra Stage 3 voters.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { calculateLlmCostUsd, callLLM, hasProviderApiKey } from "../../observability.js";
import { STAGE_MODELS } from "../model-config.mjs";
import { locatePassageInSource, repairNormaliseWithMap } from "../excerpt-from-source.mjs";

export { locatePassageInSource, repairNormaliseWithMap };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(__dirname, "prompts", "stage2_v4_multipassage.md");

const ALLOWED = new Set([
  "confirmed",
  "partially_confirmed",
  "conflicting",
  "no_support",
]);

const SUPPORTING = new Set(["confirmed", "partially_confirmed", "conflicting"]);

/** @type {"supporting_pairs"|"all_pairs"} */
export const WIDENED_SCOPE = "supporting_pairs";

function resolveSourceText(ctx, sourceIndex) {
  if (typeof ctx?.getSourceText === "function") {
    const t = ctx.getSourceText(sourceIndex);
    return typeof t === "string" ? t : "";
  }
  const sources = ctx?.sources;
  if (Array.isArray(sources)) {
    const src = sources[sourceIndex];
    return typeof src?.text === "string" ? src.text : "";
  }
  return "";
}

let promptCache = null;

async function getSystemPrompt() {
  if (typeof promptCache === "string" && promptCache.trim()) return promptCache;
  promptCache = (await readFile(PROMPT_PATH, "utf8")).trim();
  return promptCache;
}

function safeJsonParse(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/**
 * One widened (statement × source) call — gpt-4o temp 0 via callLLM.
 * @returns {Promise<Array<{ passage: string, classification: string }>>}
 */
export async function matchMultipassagePair({
  statementText,
  sourceText,
  statementIndex,
  sourceIndex,
  sourceLabel,
  traceId,
}) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    return [];
  }

  const systemPrompt = await getSystemPrompt();
  const userPrompt = `
Statement:
${typeof statementText === "string" ? statementText : ""}

Source:
${typeof sourceText === "string" ? sourceText : ""}
`.trim();

  try {
    const completion = await callLLM({
      provider: stageModel.provider,
      model: stageModel.model,
      temperature: 0,
      responseFormat: "json",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      traceId,
      traceName: "qc-run",
      spanName: "stage2-match-multipassage",
      metadata: {
        stage: "stage2-match-multipassage",
        statementIndex,
        sourceIndex,
        sourceLabel,
      },
    });

    const parsed = safeJsonParse(completion?.text ?? "");
    const rows = Array.isArray(parsed?.matches)
      ? parsed.matches
      : Array.isArray(parsed)
        ? parsed
        : null;
    if (!rows) return [];

    const costUsd = calculateLlmCostUsd(completion?.provider, completion?.model, completion?.usage);
    return rows
      .map((row) => {
        const classification = ALLOWED.has(row?.classification)
          ? row.classification
          : "no_support";
        const passage = typeof row?.passage === "string" ? row.passage : "";
        return { passage, classification, costUsd };
      })
      .filter((r) => r.classification !== "no_support" || r.passage.trim());
  } catch (err) {
    console.warn(
      `stage2-multipassage: match failed for statement ${statementIndex}, source ${sourceIndex}: ${err?.message || err}`
    );
    return [];
  }
}

/**
 * R7 build A / B40 — gate + resolve widened passages into supportSpans with offsets.
 * sourceRefId = sourceIndex (0-based). Matches v4 supportRefIds which are sourceIndex values
 * from confirmingMatches (stage7-assemble-card.mjs). v3Sources in analyse-statements have no
 * separate id field; array order IS the index.
 *
 * statementId: String(statementIndex) — matches analyse-statements response `id: String(card.index)`.
 * (Legacy stmt_${versionId}_${i+1} is not present on the v4 assemble path.)
 *
 * Offsets (start/end) are relative to safeSources[sourceIndex].text — the stored extracted
 * source string the widened matcher already reads. F12 must highlight that same string.
 *
 * @param {Array<{ sourceIndex: number, passage: string, classification: string }>} rawPassages
 * @param {{ statementIndex: number, sources?: Array<{ text?: string }>, getSourceText?: (sourceIndex: number) => string }} ctx
 */
export function buildSupportSpans(rawPassages, ctx) {
  const statementIndex = ctx?.statementIndex;
  const stmtId = String(Number.isFinite(statementIndex) ? statementIndex : 0);
  const seen = new Set();
  const out = [];

  for (const row of Array.isArray(rawPassages) ? rawPassages : []) {
    const classification = typeof row?.classification === "string" ? row.classification.trim() : "";
    if (!SUPPORTING.has(classification)) continue;
    const passage = typeof row?.passage === "string" ? row.passage : "";
    if (!passage.trim()) continue;

    const sourceIndex = Number(row?.sourceIndex);
    if (!Number.isFinite(sourceIndex)) continue;

    // sourceRefId === sourceIndex (join key for drawer / supportRefIds)
    const sourceRefId = sourceIndex;
    const dedupeKey = `${sourceRefId}\0${passage}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const sourceText = resolveSourceText(ctx, sourceIndex);
    const { start, end } = locatePassageInSource(sourceText, passage);

    out.push({
      sourceRefId,
      classification,
      statementId: stmtId,
      passage,
      start,
      end,
    });
  }

  return out;
}

/**
 * Whether a single-pick pair classification warrants a widened call under WIDENED_SCOPE.
 * @param {string} classification
 */
export function pairNeedsWidenedPass(classification) {
  if (WIDENED_SCOPE === "all_pairs") return true;
  // WIDENED_SCOPE === "supporting_pairs" (default): skip no_support pairs — cost control.
  return SUPPORTING.has(
    typeof classification === "string" ? classification.trim() : ""
  );
}
