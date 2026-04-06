/**
 * A6.4 / A6.4b / A6.4c / A6.6 / A6.7 / A6.8r: LLM-first draft claim extraction.
 * A6.8r: Deterministic sentence authority. Server normalizes draft, splits into sentences, then LLM extracts subclaims per sentence.
 * Schema: sentence_span, subclaim_index, subclaim_text. Highlighting remains sentence-level.
 * @module lib/qc/llm-claim-extraction
 */

/**
 * Proposed claim shape returned by LLM (and validated by claim-validation).
 * @typedef {Object} ProposedClaim
 * @property {string} claimText
 * @property {number} draftSpanStart
 * @property {number} draftSpanEnd
 * @property {string} sourceSentenceText
 * @property {string} claimType
 * @property {boolean} isCheckable
 * @property {boolean} [fromSentenceAuthority] - A6.8r: skip traceability check; span = full sentence
 * @property {string} [sentence_span] - A6.8r: authoritative sentence text
 * @property {number} [subclaim_index] - A6.8r: 1-based index within sentence
 * @property {string[]} [normalizedEntities]
 * @property {number[]} [normalizedNumbers]
 * @property {number} [confidence]
 */

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MODEL = "gpt-4o-mini";
const PROVIDER_NAME = "openai";

/** Emit machine-readable runtime log event. Event name first, then JSON payload. */
function emit(eventName, payload) {
  if (typeof console !== "undefined" && console.log) {
    console.log(eventName, typeof payload === "object" ? JSON.stringify(payload) : payload);
  }
}

// --- A6.8r: Draft normalization and sentence segmentation ---

/**
 * Normalize draft text before sentence segmentation and span validation.
 * Smart quotes → straight, normalize whitespace and non-breaking spaces, trim.
 * @param {string} draft
 * @returns {string}
 */
function normalizeDraftText(draft) {
  if (typeof draft !== "string") return "";
  let s = draft
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
  return s;
}

/**
 * Deterministic sentence segmentation: split on ". ", "? ", "! " while preserving punctuation.
 * Returns array of { text, start, end } for each sentence in the normalized draft.
 * @param {string} normalizedDraft
 * @returns {{ text: string, start: number, end: number }[]}
 */
function deterministicSentenceSplit(normalizedDraft) {
  if (typeof normalizedDraft !== "string" || !normalizedDraft.length) return [];
  const re = /[^.!?]+[.!?]/g;
  const results = [];
  let m;
  while ((m = re.exec(normalizedDraft)) !== null) {
    const text = m[0].trim();
    if (text) results.push({ text, start: m.index, end: m.index + m[0].length });
  }
  const lastEnd = results.length ? results[results.length - 1].end : 0;
  if (lastEnd < normalizedDraft.length) {
    const remainder = normalizedDraft.slice(lastEnd).trim();
    if (remainder) results.push({ text: remainder, start: lastEnd, end: normalizedDraft.length });
  }
  if (results.length === 0 && normalizedDraft.trim()) {
    results.push({
      text: normalizedDraft.trim(),
      start: 0,
      end: normalizedDraft.length,
    });
  }
  return results;
}

// A6.8r / A6.10 / A6.12: Per-sentence subclaim extraction. Output must be a JSON object with root key "subclaims".
const A6_8R_SENTENCE_SYSTEM_PROMPT = `You will receive a single sentence from a draft.

Your task is to extract atomic claims from that sentence.

Rules:

1 Split compound sentences into separate claims when they contain multiple independent facts.

2 Extract all explicit statements in the sentence, including expectation, commentary, or attribution statements, so long as they are explicitly written in the sentence.

3 Do NOT infer information.

4 Do NOT evaluate whether claims are supported by sources.

5 Do NOT filter editorial or predictive claims. Do NOT filter expectation statements, attributed commentary statements, or management guidance statements.

6 Preserve the meaning of the original sentence.

Output format: You must return valid JSON. The root must be a JSON object with exactly one key: "subclaims". The value of "subclaims" must be an array. Each element must be an object with:
- "subclaim_index" (number, 1-based)
- "subclaim_text" (string)

Example (multiple subclaims):

{
  "subclaims": [
    {
      "subclaim_index": 1,
      "subclaim_text": "Shopify raised $5 million in Series A funding."
    },
    {
      "subclaim_index": 2,
      "subclaim_text": "Shopify launched an enterprise payments platform for large merchants."
    }
  ]
}

Example (single subclaim / expectation):

{
  "subclaims": [
    {
      "subclaim_index": 1,
      "subclaim_text": "Management expects the new launch to materially strengthen enterprise adoption this year."
    }
  ]
}

If there are no subclaims to extract from the sentence, return:

{
  "subclaims": []
}
`;

/**
 * Build user message for per-sentence subclaim extraction (A6.8r / A6.12).
 * @param {string} sentence
 * @returns {string}
 */
function buildPerSentenceUserMessage(sentence) {
  return `Sentence:
"""
${sentence}
"""

Return a JSON object with a single key "subclaims" whose value is an array of objects, each with "subclaim_index" and "subclaim_text".`;
}

/**
 * Parse LLM response for one sentence. Accepts root object with "subclaims" (preferred), "claims", or "items"; or root array.
 * @param {string} rawContent
 * @returns {{ subclaims: { subclaim_index: number, subclaim_text: string }[], parseError?: string, parsedRootType: "array"|"object"|"other"|"none", parsedKeys: string[] }}
 */
function parseSubclaimResponse(rawContent) {
  const none = { subclaims: [], parsedRootType: "none", parsedKeys: [] };
  if (typeof rawContent !== "string" || !rawContent.trim()) {
    return { ...none, parseError: "empty_response" };
  }
  let parsed;
  try {
    let trimmed = rawContent.trim();
    const codeBlock = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
    const m = trimmed.match(codeBlock);
    if (m) trimmed = m[1].trim();
    const firstArr = trimmed.indexOf("[");
    const lastArr = trimmed.lastIndexOf("]");
    const firstObj = trimmed.indexOf("{");
    const lastObj = trimmed.lastIndexOf("}");
    if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
      parsed = JSON.parse(trimmed.slice(firstArr, lastArr + 1));
    } else if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
      parsed = JSON.parse(trimmed.slice(firstObj, lastObj + 1));
    } else {
      return { ...none, parseError: "no_json" };
    }
  } catch (e) {
    return { ...none, parseError: "json_parse_failed" };
  }
  const parsedRootType = Array.isArray(parsed) ? "array" : typeof parsed === "object" && parsed !== null ? "object" : "other";
  const parsedKeys = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? Object.keys(parsed) : [];
  const rawList = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.subclaims) ? parsed.subclaims : Array.isArray(parsed?.claims) ? parsed.claims : Array.isArray(parsed?.items) ? parsed.items : []);
  const subclaims = [];
  for (let i = 0; i < rawList.length; i++) {
    const c = rawList[i];
    if (!c || typeof c !== "object") continue;
    const text = typeof c.subclaim_text === "string" ? c.subclaim_text.trim() : "";
    if (!text) continue;
    let idx = c.subclaim_index;
    if (typeof idx !== "number" && typeof idx === "string") idx = parseInt(idx, 10);
    if (!Number.isInteger(idx) || idx < 1) continue;
    subclaims.push({ subclaim_index: idx, subclaim_text: text });
  }
  return { subclaims, parsedRootType, parsedKeys };
}

/**
 * Normalize string for duplicate check: trim, collapse whitespace, lowercase.
 * @param {string} s
 * @returns {string}
 */
function normalizeForDuplicate(s) {
  if (typeof s !== "string") return "";
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A6.8r: Duplicate key = sentence_span + subclaim_index (both must match). */
function subclaimDuplicateKey(sentenceSpan, subclaimIndex) {
  return normalizeForDuplicate(sentenceSpan) + "\n" + String(subclaimIndex);
}

const RAW_CONTENT_PREVIEW_MAX = 200;

/**
 * Call LLM once for a single sentence; return parsed subclaims and diagnostics for logging.
 * @param {Object} client - OpenAI client
 * @param {string} model
 * @param {number} timeoutMs
 * @param {string} sentence
 * @returns {Promise<{ subclaims: { subclaim_index: number, subclaim_text: string }[], parseError?: string, parsedRootType: string, parsedKeys: string[], rawContentLength: number, rawContentPreview?: string }>}
 */
async function extractSubclaimsForSentence(client, model, timeoutMs, sentence) {
  const userMessage = buildPerSentenceUserMessage(sentence);
  const completion = await Promise.race([
    client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: A6_8R_SENTENCE_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("QC_LLM_CLAIM_EXTRACTION_TIMEOUT")), timeoutMs)
    ),
  ]);
  const rawContent = completion?.choices?.[0]?.message?.content;
  if (rawContent == null || typeof rawContent !== "string") {
    return { subclaims: [], parseError: "empty_completion", parsedRootType: "none", parsedKeys: [], rawContentLength: 0 };
  }
  const rawContentLength = rawContent.length;
  const rawContentPreview = rawContent.length > RAW_CONTENT_PREVIEW_MAX ? rawContent.slice(0, RAW_CONTENT_PREVIEW_MAX).replace(/\n/g, " ") + "…" : rawContent.replace(/\n/g, " ");
  const parsed = parseSubclaimResponse(rawContent);
  return { ...parsed, rawContentLength, rawContentPreview };
}

/**
 * Extract checkable claims from draft text via LLM (A6.8r: normalize → sentence split → per-sentence subclaim extraction).
 * Returns proposed claims with sentence_span, subclaim_index, subclaim_text; draft span = full sentence for highlighting.
 *
 * @param {string} draftText - Full draft text
 * @param {{ runId?: string, reqSig?: string }} [opts]
 * @returns {Promise<{ claims: ProposedClaim[], fallback_mode?: false } | { fallback_mode: true, error?: string }>}
 */
export async function extractClaimsFromDraftLLM(draftText, opts = {}) {
  const { runId = null, reqSig = null } = opts;
  const rid = runId ?? reqSig ?? null;

  if (typeof draftText !== "string" || !draftText.trim()) {
    emit("LLM_CLAIM_EXTRACTION_DONE", { fallback_mode: true, fallback_reason: "empty_draft", acceptedClaimsCount: 0, reason: "empty_draft" });
    return { fallback_mode: true, error: "empty_draft" };
  }

  const normalizedDraft = normalizeDraftText(draftText);
  const sentences = deterministicSentenceSplit(normalizedDraft);
  const draftLen = normalizedDraft.length;
  emit("LLM_CLAIM_EXTRACTION_START", { rid, draftLength: draftLen, sentenceCount: sentences.length });

  const apiKey = typeof process !== "undefined" ? process.env?.OPENAI_API_KEY : undefined;
  const providerAvailable = Boolean(apiKey && typeof apiKey === "string" && apiKey.trim());
  emit("LLM_CLAIM_EXTRACTION_PROVIDER", { provider: PROVIDER_NAME, providerAvailable });

  if (!providerAvailable) {
    emit("LLM_CLAIM_EXTRACTION_DONE", { fallback_mode: true, fallback_reason: "missing_openai_api_key", acceptedClaimsCount: 0, reason: "missing_openai_api_key" });
    return { fallback_mode: true, error: "missing_openai_api_key" };
  }

  const model = (typeof process !== "undefined" && process.env?.QC_LLM_CLAIM_EXTRACTION_MODEL)?.trim() || DEFAULT_MODEL;
  const timeoutMs = Math.max(5000, Math.min(60000, Number(process.env?.QC_LLM_CLAIM_EXTRACTION_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS));

  let client;
  try {
    try {
      await import("openai/shims/web");
    } catch (_) {}
    const openaiMod = await import("openai");
    const OpenAI = openaiMod.default;
    client = new OpenAI({ apiKey: apiKey.trim() });
  } catch (importErr) {
    const msg = importErr?.message || String(importErr);
    emit("LLM_CLAIM_EXTRACTION_DONE", { fallback_mode: true, fallback_reason: "provider_unavailable", acceptedClaimsCount: 0, reason: "provider_unavailable" });
    return { fallback_mode: true, error: msg };
  }

  const seenKey = new Set();
  const allCandidates = [];
  let totalProposedSubclaims = 0;

  sentences.forEach((_, sentenceIndex) => {
    emit("LLM_CLAIM_EXTRACTION_SENTENCE_START", { sentenceIndex });
  });
  const settleds = await Promise.allSettled(
    sentences.map((sent) => extractSubclaimsForSentence(client, model, timeoutMs, sent.text))
  );

  for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex++) {
    const sent = sentences[sentenceIndex];
    const settled = settleds[sentenceIndex];
    let result;
    if (settled?.status === "rejected" || !settled?.value) {
      const apiErr = settled?.reason;
      const msg = apiErr?.message || String(apiErr);
      const isTimeout = /timeout|TIMEOUT/i.test(msg);
      const reason = isTimeout ? "timeout" : "api_error";
      emit("LLM_CLAIM_EXTRACTION_DONE", { fallback_mode: true, fallback_reason: reason, acceptedClaimsCount: 0, reason });
      return { fallback_mode: true, error: msg };
    } else {
      result = settled.value;
    }

    emit("LLM_CLAIM_EXTRACTION_SENTENCE_RESULT", {
      sentenceIndex,
      sentenceLength: sent.text.length,
      rawContentLength: result.rawContentLength ?? 0,
      parseError: result.parseError ?? null,
      parsedRootType: result.parsedRootType ?? "none",
      parsedKeys: result.parsedKeys ?? [],
      subclaimsLength: result.subclaims.length,
      ...(result.rawContentPreview != null && { rawContentPreview: result.rawContentPreview }),
    });

    if (result.parseError) continue;
    totalProposedSubclaims += result.subclaims.length;

    for (const sc of result.subclaims) {
      if (!sc.subclaim_text || !(Number.isInteger(sc.subclaim_index) && sc.subclaim_index >= 1)) continue;
      const key = subclaimDuplicateKey(sent.text, sc.subclaim_index);
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      allCandidates.push({
        claimText: sc.subclaim_text,
        draftSpanStart: sent.start,
        draftSpanEnd: sent.end,
        sourceSentenceText: sent.text,
        claimType: "factual",
        isCheckable: true,
        fromSentenceAuthority: true,
        sentence_span: sent.text,
        subclaim_index: sc.subclaim_index,
      });
    }
  }

  emit("LLM_CLAIM_EXTRACTION_RESPONSE", { proposedSubclaimsCount: totalProposedSubclaims });
  emit("LLM_CLAIM_EXTRACTION_FINAL", { finalSubclaimCount: allCandidates.length });

  if (allCandidates.length === 0) {
    emit("LLM_CLAIM_EXTRACTION_DONE", { fallback_mode: true, fallback_reason: "zero_proposed_claims", acceptedClaimsCount: 0, reason: "zero_proposed_claims" });
    return { fallback_mode: true, error: "zero_proposed_claims" };
  }

  emit("LLM_CLAIM_EXTRACTION_DONE", { fallback_mode: false, acceptedClaimsCount: allCandidates.length });
  return { claims: allCandidates, normalizedDraft, fallback_mode: false };
}
