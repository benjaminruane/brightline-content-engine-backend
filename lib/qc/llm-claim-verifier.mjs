// lib/qc/llm-claim-verifier.mjs
// A7.1: LLM anchor phrase + plain-language explanation for QC claim verification (uploaded source only).

const SYSTEM_PROMPT =
  "You are a document reviewer. Respond with a JSON object only.\n" +
  "No preamble, no markdown, no code fences. Your response must be\n" +
  "valid JSON and nothing else.";

const BANNED_EXPLANATION_SUBSTRINGS = [
  "entity",
  "corpus",
  "canonical claim",
  "claim type",
  "pipeline",
];

/**
 * Lowercase, collapse internal whitespace to single spaces, trim (for anchor search).
 * @param {string} s
 */
function normalizeAnchorSpace(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Map each index in normalized string to the start index of that logical character in the original.
 * @param {string} original
 * @returns {{ normalized: string, normToOrig: number[] }}
 */
function buildNormToOrigMap(original) {
  const o = String(original || "");
  const normChars = [];
  const normToOrig = [];
  let i = 0;
  let needSpace = false;
  while (i < o.length) {
    const ch = o[i];
    if (/\s/.test(ch)) {
      while (i < o.length && /\s/.test(o[i])) i++;
      if (normChars.length > 0) needSpace = true;
      continue;
    }
    if (needSpace) {
      normChars.push(" ");
      normToOrig.push(i);
      needSpace = false;
    }
    normChars.push(ch.toLowerCase());
    normToOrig.push(i);
    i++;
  }
  return { normalized: normChars.join(""), normToOrig };
}

/**
 * Extract one sentence from original containing the match span [origStart, origEnd).
 * @param {string} original
 * @param {number} origMatchStart
 */
function extractSentenceAroundIndex(original, origMatchStart) {
  const t = String(original || "");
  const n = t.length;
  if (n === 0) return "";
  const pos = Math.max(0, Math.min(origMatchStart, n - 1));

  let sentStart = 0;
  for (let i = pos; i > 0; i--) {
    const c = t[i - 1];
    if (c === "." || c === "!" || c === "?") {
      let j = i;
      while (j < n && /\s/.test(t[j])) j++;
      sentStart = j;
      break;
    }
  }

  let sentEnd = n;
  for (let i = pos; i < n; i++) {
    const c = t[i];
    if (c === "." || c === "!" || c === "?") {
      sentEnd = i + 1;
      break;
    }
  }

  return t.slice(sentStart, sentEnd).trim();
}

/**
 * Trim to maxLen at a word boundary (space).
 * @param {string} passage
 * @param {number} maxLen
 */
function trimPassageToWordBoundary(passage, maxLen) {
  const p = String(passage || "");
  if (p.length <= maxLen) return p;
  let cut = maxLen;
  while (cut > 0 && !/\s/.test(p[cut - 1])) cut--;
  if (cut <= 0) return p.slice(0, maxLen).trim();
  return p.slice(0, cut).trim();
}

/**
 * @param {string} claimText
 * @param {string} sourceFullText
 * @param {"confirmed"|"partially_confirmed"|"conflict"} verdictHint
 * @param {{ claimId?: string, maxSourceChars?: number }} [options]
 * @returns {Promise<{ anchor: string|null, explanation: string }|null>}
 */
export async function verifyClaimWithLLM(claimText, sourceFullText, verdictHint, options = {}) {
  const maxSourceChars =
    typeof options.maxSourceChars === "number" && Number.isFinite(options.maxSourceChars) && options.maxSourceChars > 0
      ? Math.floor(options.maxSourceChars)
      : 8000;

  const apiKey = typeof process !== "undefined" ? process.env?.OPENAI_API_KEY : undefined;
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return null;
  }

  const src = typeof sourceFullText === "string" ? sourceFullText : "";
  const truncated = src.length > maxSourceChars ? src.slice(0, maxSourceChars) : src;

  const userPrompt = `You will receive a claim, a verdict hint (for focus only), and an excerpt of a source document.

Claim:
${claimText}

Verdict hint (assist focus only — do not let it override your reading of the source):
${verdictHint}

Source text:
${truncated}

Return exactly this JSON shape (and nothing else):
{
  "anchor": "<a verbatim phrase of 6–10 words copied exactly from the source text that most directly relates to the claim, or null if the source does not address the claim>",
  "explanation": "<one to two sentence plain-language explanation of what the source does or does not say about the claim, written as an experienced reviewer would write to a writer>"
}

Rules:
- The anchor must be copied character for character from the source text above; do not paraphrase or alter any word.
- The anchor should be 6–10 words — a distinctive fragment, not a full sentence.
- The explanation must be specific and concrete — reference the actual claim and actual source content; no generic filler; do not use these words (or close variants): entity, corpus, pipeline, canonical claim, claim type.
- If the source does not address the claim, set anchor to null and explain what the source says instead.
- The verdict hint is provided to assist focus, not to override your reading.`;

  try {
    try {
      await import("openai/shims/web");
    } catch (_) {}
    const openaiMod = await import("openai");
    const OpenAI = openaiMod.default;
    const client = new OpenAI({ apiKey: apiKey.trim() });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent = completion?.choices?.[0]?.message?.content;
    if (typeof rawContent !== "string" || !rawContent.trim()) return null;

    let parsed;
    try {
      parsed = JSON.parse(rawContent.trim());
    } catch {
      const start = rawContent.indexOf("{");
      const end = rawContent.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(rawContent.slice(start, end + 1));
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }

    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} rawOutput
 * @param {string} sourceFullText
 * @returns {{ valid: boolean, passage: string|null, explanation: string, failReason?: string }}
 */
export function validateLLMVerifierOutput(rawOutput, sourceFullText) {
  if (rawOutput == null || typeof rawOutput !== "object" || Array.isArray(rawOutput)) {
    return { valid: false, passage: null, explanation: "", failReason: "null_or_invalid_output" };
  }

  const anchorRaw = rawOutput.anchor;
  const explanationRaw = rawOutput.explanation;

  const anchor =
    anchorRaw === null
      ? null
      : typeof anchorRaw === "string"
        ? anchorRaw
        : undefined;
  const explanation =
    typeof explanationRaw === "string" ? explanationRaw : undefined;

  if (anchor === undefined || explanation === undefined) {
    return { valid: false, passage: null, explanation: "", failReason: "json_parse_failure" };
  }

  let passage = null;
  if (anchor !== null) {
    const source = String(sourceFullText || "");
    const normAnchor = normalizeAnchorSpace(anchor);
    if (!normAnchor) {
      return { valid: false, passage: null, explanation: "", failReason: "anchor_not_found" };
    }
    const { normalized: normSource, normToOrig } = buildNormToOrigMap(source);
    const normIdx = normSource.indexOf(normAnchor);
    if (normIdx < 0) {
      return { valid: false, passage: null, explanation: "", failReason: "anchor_not_found" };
    }
    const lastNormIdx = normIdx + normAnchor.length - 1;
    if (lastNormIdx >= normToOrig.length) {
      return { valid: false, passage: null, explanation: "", failReason: "anchor_not_found" };
    }
    const origMatchStart = normToOrig[normIdx];
    const passageRaw = extractSentenceAroundIndex(source, origMatchStart);
    passage = trimPassageToWordBoundary(passageRaw, 300);
  }

  const explTrim = explanation.trim();
  if (explTrim.length === 0) {
    return { valid: false, passage: null, explanation: "", failReason: "explanation_empty" };
  }
  if (explTrim.length < 20 || explTrim.length > 600) {
    return { valid: false, passage: null, explanation: "", failReason: "explanation_length" };
  }

  const explLower = explTrim.toLowerCase();
  for (const banned of BANNED_EXPLANATION_SUBSTRINGS) {
    if (explLower.includes(banned.toLowerCase())) {
      return { valid: false, passage: null, explanation: "", failReason: "explanation_system_language" };
    }
  }

  return { valid: true, passage, explanation: explTrim };
}
