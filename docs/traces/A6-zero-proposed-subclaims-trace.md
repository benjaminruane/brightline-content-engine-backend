# A6 Per-Sentence LLM Extraction — Zero Proposed Subclaims (Read-Only Trace)

## Plain-language summary

The A6 path runs and calls the LLM for all three sentences, but **proposedSubclaimsCount** is 0. The code never logs the raw LLM response or parse result per sentence, so we cannot see from current logs whether the model returns empty output, malformed JSON, a different key (e.g. `"claims"` instead of `"subclaims"`), or valid items that are all filtered out. The **most likely** cause is a **prompt/API mismatch**: the prompt asks for a **top-level JSON array** while the API uses `response_format: { type: "json_object" }`, which encourages a **JSON object**. If the model returns an object with a key other than `"subclaims"` (e.g. `"claims"`), the parser only reads `parsed?.subclaims`, so the list is empty and we get zero proposed subclaims. The **smallest concrete fix** is to (1) add one log line per sentence with `sentenceIndex`, `parseError` (if any), `subclaimsLength`, and optionally `rawContentLength` or a short sample of `rawContent`, then (2) either align the prompt to request an object with key `"subclaims"` so it matches both `json_object` and the parser, and/or make the parser accept common alternate keys (e.g. `claims`, `items`) when `parsed.subclaims` is missing.

---

## 1. Full execution path inside `lib/qc/llm-claim-extraction.mjs`

1. **Entry:** `extractClaimsFromDraftLLM(draftText, opts)`  
   - Normalizes draft, splits into sentences, emits `LLM_CLAIM_EXTRACTION_START`, checks provider, builds OpenAI client.

2. **Per-sentence loop** (for each of the 3 sentences):
   - `emit("LLM_CLAIM_EXTRACTION_SENTENCE_START", { sentenceIndex });`
   - `result = await extractSubclaimsForSentence(client, model, timeoutMs, sent.text);`
   - If `result.parseError` → **continue** (no increment to `totalProposedSubclaims`).
   - Else `totalProposedSubclaims += result.subclaims.length;`
   - For each item in `result.subclaims`, validate and push to `allCandidates` (duplicate check, `subclaim_text`, `subclaim_index`).

3. After loop:
   - `emit("LLM_CLAIM_EXTRACTION_RESPONSE", { proposedSubclaimsCount: totalProposedSubclaims });`  
   - Observed: `proposedSubclaimsCount: 0` → so for every sentence either `result.parseError` was set, or `result.subclaims.length === 0`.

4. **Single-sentence call:** `extractSubclaimsForSentence(client, model, timeoutMs, sentence)`:
   - Builds user message via `buildPerSentenceUserMessage(sentence)`.
   - Calls `client.chat.completions.create({ model, temperature: 0, max_tokens: 1024, response_format: { type: "json_object" }, messages: [ system, user ] })`.
   - Reads `rawContent = completion?.choices?.[0]?.message?.content`.
   - If `rawContent == null || typeof rawContent !== "string"` → returns `{ subclaims: [], parseError: "empty_completion" }`.
   - Else returns `parseSubclaimResponse(rawContent)` (no other logging).

5. **Parsing:** `parseSubclaimResponse(rawContent)`:
   - Empty/whitespace → `{ subclaims: [], parseError: "empty_response" }`.
   - Strips optional markdown code block, then:
     - If `"["` and `"]"` found with `lastArr > firstArr` → `parsed = JSON.parse(trimmed.slice(firstArr, lastArr + 1))`.
     - Else if `"{"` and `"}"` found → `parsed = JSON.parse(trimmed.slice(firstObj, lastObj + 1))`.
     - Else → `{ subclaims: [], parseError: "no_json" }`.
   - `rawList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.subclaims) ? parsed.subclaims : [])`.
   - For each element of `rawList`: keep only objects with `subclaim_text` (string, non-empty after trim) and `subclaim_index` (integer ≥ 1). Push to `subclaims`.
   - Returns `{ subclaims }` (no `parseError` when JSON parsed successfully).

So **zero proposed subclaims** can only come from:

- **Path A:** Every sentence returns with `parseError` set → we `continue`, never add to `totalProposedSubclaims`.
- **Path B:** Every sentence returns with no `parseError` but `result.subclaims.length === 0` (parser returned empty list: empty array, or object with wrong/missing key, or all items failed validation).

Current code does **not** log per sentence: sentence text, raw LLM content, parseError, or subclaims length. So we cannot tell A vs B or the exact model output from existing logs.

---

## 2. Per-sentence: sentence text, prompt shape, response, parsing

- **Sentence text:** Not logged. It is `sent.text` from `deterministicSentenceSplit(normalizedDraft)` for `sentenceIndex` 0, 1, 2.
- **Prompt shape:**  
  - **System:** `A6_8R_SENTENCE_SYSTEM_PROMPT` (see below).  
  - **User:** `buildPerSentenceUserMessage(sentence)` →  
    `Sentence:\n"""\n${sentence}\n"""\n\nReturn JSON: [ { "subclaim_index": 1, "subclaim_text": "..." }, ... ]`
- **Raw LLM response:** Not logged. It is `completion?.choices?.[0]?.message?.content` (string or null).
- **Parsing step:** `parseSubclaimResponse(rawContent)`; result (subclaims array or parseError) is not logged.

So for a single Review run we **cannot** show the exact sentence text, exact prompt, exact raw response, or exact parse result from the code path alone; we can only describe the logic and the possible causes below.

---

## 3. Why zero? Possible causes (code-based)

| Cause | How it happens in code | Log evidence today |
|-------|------------------------|--------------------|
| **Model returns empty output** | `rawContent` null or non-string → `empty_completion` → `parseError` → `continue` → 0 count. | None (parseError not logged). |
| **Malformed JSON** | Parse throws or no `[...]`/`{...}` found → `parseError`: `json_parse_failed` or `no_json` → `continue` → 0. | None. |
| **Parser expecting wrong key** | Model returns object with key other than `"subclaims"` (e.g. `"claims"`). Then `rawList = parsed?.subclaims ?? []` → `[]`. No parseError. | None. |
| **Per-sentence results discarded after parse** | Only discarded if `result.parseError` (we `continue`). Not “discarded” otherwise; we add `result.subclaims.length`. So this is the same as “all sentences have parseError or empty subclaims”. | N/A. |
| **Validation/filtering removing all parsed subclaims** | Parser only keeps objects with `subclaim_text` (string, non-empty) and `subclaim_index` (integer ≥ 1). If model uses different keys (e.g. `claim_text`, `index`) every item is dropped → `subclaims: []`, no parseError. | None. |

**Most likely from design:** The API uses `response_format: { type: "json_object" }`. OpenAI’s docs refer to the output as a “complete JSON **object**”. The prompt asks for a **top-level array** `[ { "subclaim_index": 1, "subclaim_text": "..." }, ... ]`. If the model obeys `json_object` and returns an object, it may use a key such as `"claims"` or `"items"` instead of `"subclaims"`. The parser only uses `parsed.subclaims` when the root is an object, so `rawList` becomes empty and we get zero proposed subclaims with no parseError.

---

## 4. Expected vs actual schema

**Expected (prompt + parser):**

- **Prompt:** Top-level array: `[ { "subclaim_index": 1, "subclaim_text": "..." }, ... ]`  
  Or (when parser treats root as object): root object with key `"subclaims"` and value that array.
- **Parser:**
  - Accepts root array → `rawList = parsed`.
  - Accepts root object with `parsed.subclaims` array → `rawList = parsed.subclaims`.
  - Each element must have:
    - `subclaim_text`: string, non-empty after trim.
    - `subclaim_index`: integer ≥ 1 (or string coercible to such).

**Actual returned schema:** Unknown; not logged. To know it you must add logging of `rawContent` (or a safe truncation) and of `parseError` / `result.subclaims.length` per sentence.

---

## 5. Smallest concrete fix

1. **Add one log line per sentence** (e.g. right after `result = await extractSubclaimsForSentence(...)`):
   - Emit something like `LLM_CLAIM_EXTRACTION_SENTENCE_RESULT` with:
     - `sentenceIndex`
     - `parseError` (if present)
     - `subclaimsLength: result.subclaims.length`
     - Optionally `rawContentLength` or first N characters of the raw content (if you add a return or internal log from `extractSubclaimsForSentence`).

2. **Run one Review** and inspect:
   - If you see `parseError` every time → fix parsing or prompt (e.g. ensure valid JSON, or handle refusal/empty).
   - If you see `subclaimsLength: 0` and no `parseError` → model is likely returning an object with a key other than `"subclaims"`, or an empty array, or items with wrong keys. Then either:
     - **Option A:** Change the prompt to explicitly request an object with key `"subclaims"` and the array as value, so it matches both `json_object` and the parser (e.g. “Return a JSON object with a single key \"subclaims\" whose value is an array of objects with \"subclaim_index\" and \"subclaim_text\".”), and keep parser as is.
     - **Option B:** In the parser, when `parsed` is an object and `parsed.subclaims` is not an array, set `rawList = parsed.claims ?? parsed.items ?? []` (or similar) so one alternate key is accepted.

After adding the log and running once, the exact fix is determined by what appears in `LLM_CLAIM_EXTRACTION_SENTENCE_RESULT` and (if logged) the raw content.

---

## 6. Reference: system prompt and parser key usage

**System prompt (excerpt) — requested shape:**  
“Return JSON:\n[\n  {\n    \"subclaim_index\": 1,\n    \"subclaim_text\": \"...\"\n  }\n]”

**Parser (exact key usage):**

- `rawList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.subclaims) ? parsed.subclaims : []);`
- For each item: `c.subclaim_text`, `c.subclaim_index` (no other keys accepted for the list or for the fields).

So the only object key that populates the list when the root is an object is **`subclaims`**. Any other key (e.g. `claims`) yields an empty list and therefore zero proposed subclaims.
