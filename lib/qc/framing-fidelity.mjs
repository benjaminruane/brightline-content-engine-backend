import { callLLM, hasProviderApiKey } from "../observability.js";
import { STAGE_MODELS } from "./model-config.mjs";

export const FRAMING_FIDELITY_CONCERN_CODE = "framing_fidelity";

const EVALUATIVE_RE =
  /\b(?:dominant|defensible|exceptional|exceptionally|attractive|meaningful|credible|conviction|well[- ]positioned|strong|headroom|moat|high[- ]quality|important|importantly|clear runway)\b/i;

const SYSTEM_PROMPT = `You detect only one issue: framing that goes beyond the source.

You receive a draft statement plus the matched supporting source passage(s).

Task:
1. Identify whether the statement contains an EVALUATIVE characterisation about the source-backed content.
2. FIRE only when that evaluative characterisation:
   - clearly CONTRADICTS the source's own stance, or
   - clearly OVERSTATES it in a material way.
3. DO NOT FIRE when:
   - the statement is purely factual,
   - the statement is mainly a forward-looking or factual claim without evaluative framing,
   - the language is only mild praise / fair colour that a positive source reasonably supports.

Examples that should NOT fire:
- "strong growth" on real 36% growth
- "strong re-up" on 96%
- "meaningful margin expansion" on real expansion
- "attractive returns" on a positive base case
- "genuinely exceptional" when the source already says "exceptional"
- "Importantly" on a sourced point

Examples that SHOULD fire:
- "defensible" when the source says defensibility is uncertain
- "dominant in the Nordics" when the source says strong in Sweden and under-represented elsewhere

Return JSON only with this shape:
{
  "fire": boolean,
  "evaluativePhrase": string,
  "sourceStance": string,
  "note": string,
  "reason": string
}

Rules for fields:
- If fire is false, set the string fields to "".
- If fire is true, write note in plain language for a reviewer, with no jargon.
- Keep evaluativePhrase and sourceStance brief.
- Only use fire=true for clear contradiction or clear overstatement. When unsure, return fire=false.`;

function safeJsonParse(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeJudgeResult(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const fire = parsed.fire === true;
  const evaluativePhrase =
    typeof parsed.evaluativePhrase === "string" ? parsed.evaluativePhrase.trim() : "";
  const sourceStance =
    typeof parsed.sourceStance === "string" ? parsed.sourceStance.trim() : "";
  const note = typeof parsed.note === "string" ? parsed.note.trim() : "";
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
  if (!fire) {
    return { fire: false, evaluativePhrase: "", sourceStance: "", note: "", reason: "" };
  }
  if (!evaluativePhrase || !sourceStance || !note) return null;
  return { fire: true, evaluativePhrase, sourceStance, note, reason };
}

export function hasPotentialFramingJudgment(statement) {
  return EVALUATIVE_RE.test(String(statement || ""));
}

function dedupePassages(passages) {
  const out = [];
  const seen = new Set();
  for (const p of Array.isArray(passages) ? passages : []) {
    const text = typeof p === "string" ? p.trim() : "";
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function collectFramingEvidence(entry) {
  const primaryPassage =
    typeof entry?.excerptResult?.primaryExcerpt?.passage === "string"
      ? entry.excerptResult.primaryExcerpt.passage
      : typeof entry?.primaryExcerptText === "string"
        ? entry.primaryExcerptText
        : "";
  const supportPassages = Array.isArray(entry?.supportSpans)
    ? entry.supportSpans
        .map((s) => (typeof s?.passage === "string" ? s.passage : ""))
        .filter(Boolean)
    : [];
  const evidenceSummary =
    typeof entry?.commentaryResult?.commentary === "string"
      ? entry.commentaryResult.commentary.trim()
      : typeof entry?.evidenceSummary === "string"
        ? entry.evidenceSummary.trim()
        : "";
  return {
    passages: dedupePassages([primaryPassage, ...supportPassages]),
    evidenceSummary,
  };
}

function buildUserPrompt(statement, passages, evidenceSummary) {
  return `Statement:
${statement}

Matched source passages:
${passages.map((p, i) => `[${i + 1}] ${p}`).join("\n")}

Evidence summary:
${evidenceSummary || "(none)"}`;
}

async function runDefaultJudge({ statement, passages, evidenceSummary, traceId, statementIndex }) {
  const modelConfig = STAGE_MODELS["framing-fidelity-judge"];
  if (!modelConfig || !hasProviderApiKey(modelConfig.provider)) {
    return { fire: false, evaluativePhrase: "", sourceStance: "", note: "", reason: "" };
  }
  const userPrompt = buildUserPrompt(statement, passages, evidenceSummary);
  async function callJudge(attempt) {
    return callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      responseFormat: "json",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      traceId,
      traceName: "qc-run",
      spanName: "framing-fidelity-judge",
      metadata: {
        module: "framing-fidelity",
        attempt,
        statementIndex: Number.isFinite(statementIndex) ? Number(statementIndex) : null,
        passageCount: passages.length,
      },
    });
  }

  let completion = await callJudge(1);
  let normalized = normalizeJudgeResult(safeJsonParse(completion?.text ?? ""));
  if (normalized === null) {
    completion = await callJudge(2);
    normalized = normalizeJudgeResult(safeJsonParse(completion?.text ?? ""));
  }
  return normalized ?? { fire: false, evaluativePhrase: "", sourceStance: "", note: "", reason: "" };
}

/**
 * @param {{
 *   statement: string,
 *   passages: string[],
 *   evidenceSummary?: string,
 *   traceId?: string,
 *   statementIndex?: number,
 *   runJudge?: (args: {
 *     statement: string,
 *     passages: string[],
 *     evidenceSummary?: string,
 *     traceId?: string,
 *     statementIndex?: number,
 *   }) => Promise<{ fire: boolean, evaluativePhrase?: string, sourceStance?: string, note?: string, reason?: string } | null>
 * }} args
 */
export async function detectFramingFidelity(args = {}) {
  const statement = typeof args.statement === "string" ? args.statement.trim() : "";
  const passages = dedupePassages(args.passages);
  const evidenceSummary =
    typeof args.evidenceSummary === "string" ? args.evidenceSummary.trim() : "";
  if (!statement || passages.length === 0) {
    return { fire: false, evaluativePhrase: "", sourceStance: "", note: "", reason: "" };
  }
  if (!hasPotentialFramingJudgment(statement)) {
    return { fire: false, evaluativePhrase: "", sourceStance: "", note: "", reason: "" };
  }
  const judge = typeof args.runJudge === "function" ? args.runJudge : runDefaultJudge;
  try {
    const judged = await judge({
      statement,
      passages,
      evidenceSummary,
      traceId: args.traceId,
      statementIndex: args.statementIndex,
    });
    return normalizeJudgeResult(judged) ?? { fire: false, evaluativePhrase: "", sourceStance: "", note: "", reason: "" };
  } catch {
    return { fire: false, evaluativePhrase: "", sourceStance: "", note: "", reason: "" };
  }
}

export function buildFramingFidelityConcern({ statement, note }) {
  const text = typeof statement === "string" ? statement : "";
  return {
    concernCode: FRAMING_FIDELITY_CONCERN_CODE,
    category: FRAMING_FIDELITY_CONCERN_CODE,
    note: typeof note === "string" ? note : "",
    span: [{ startChar: 0, endChar: text.length }],
  };
}
