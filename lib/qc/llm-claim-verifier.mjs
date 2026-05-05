// lib/qc/llm-claim-verifier.mjs
// A7.3: Excerpt-only LLM explanation for QC claim verification.
import { callLLM, hasProviderApiKey } from "../observability.js";
import { STAGE_MODELS } from "./model-config.mjs";

const SYSTEM_PROMPT = `You are a document reviewer. Respond with a JSON object only.
No preamble, no markdown, no code fences. Your response must be
valid JSON and nothing else.`;

const BANNED_EXPLANATION_SUBSTRINGS = [
  "entity",
  "corpus",
  "canonical claim",
  "claim type",
  "pipeline",
];

function safeParseJsonObject(raw) {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    // Fall through and try extracting the JSON object.
  }
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param {string} claimText
 * @param {string} excerptText
 * @param {"confirmed"|"partially_confirmed"|"conflict"} verdictHint
 * @param {{ claimId?: string }} [options]
 * @returns {Promise<{ explanation: string }|null>}
 */
export async function verifyClaimWithLLM(claimText, excerptText, verdictHint, options = {}) {
  const modelConfig = STAGE_MODELS["claim-verifier"];
  if (!hasProviderApiKey(modelConfig.provider)) return null;

  const claim = typeof claimText === "string" ? claimText : "";
  const excerpt = typeof excerptText === "string" ? excerptText : "";
  if (!excerpt.trim()) return null;

  const userPrompt = `You will receive the atomic claim being checked, a verdict hint (for context only), and a selected excerpt.

Claim:
${claim}

Verdict hint (provided for context only — do not override your reading):
${verdictHint}

Selected excerpt:
${excerpt.trim()}

Return exactly this JSON shape (and nothing else):
{
  "explanation": "<one to two sentence plain-language explanation of what the excerpt shows relative to the claim, written as an experienced reviewer would write to a writer>"
}

Rules:
- explanation must be specific and concrete — reference the actual claim and actual excerpt content
- no generic filler
- no system language (do not use: entity, corpus, pipeline, canonical claim, claim type)
- Do not reference "the excerpt" in your explanation. Write as though speaking directly about what the source document shows relative to the claim. Example: "The source confirms that..." or "According to the source..." not "The excerpt states..." or "The excerpt confirms..."
- verdictHint is provided for context only`;

  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      responseFormat: "json",
      traceName: "qc-claim-verifier",
      spanName: "qc-claim-verifier",
      metadata: { module: "llm-claim-verifier", claimId: options?.claimId ?? null },
    });

    const rawContent = completion?.text;
    const parsed = safeParseJsonObject(rawContent);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} rawOutput
 * @returns {{ valid: boolean, explanation: string, failReason?: string }}
 */
export function validateLLMVerifierOutput(rawOutput) {
  if (rawOutput == null || typeof rawOutput !== "object" || Array.isArray(rawOutput)) {
    return { valid: false, explanation: "", failReason: "null_or_invalid_output" };
  }

  const explanationRaw = rawOutput.explanation;
  const explanation = typeof explanationRaw === "string" ? explanationRaw : undefined;
  if (explanation === undefined) {
    return { valid: false, explanation: "", failReason: "json_parse_failure" };
  }

  const explTrim = explanation.trim();
  if (explTrim.length === 0) {
    return { valid: false, explanation: "", failReason: "explanation_empty" };
  }
  if (explTrim.length < 20 || explTrim.length > 400) {
    return { valid: false, explanation: "", failReason: "explanation_length" };
  }

  const explLower = explTrim.toLowerCase();
  for (const banned of BANNED_EXPLANATION_SUBSTRINGS) {
    if (explLower.includes(banned.toLowerCase())) {
      return { valid: false, explanation: "", failReason: "explanation_system_language" };
    }
  }

  return { valid: true, explanation: explTrim };
}
