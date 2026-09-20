# Where the tokens go, and what could be sent less often

PROPOSAL. Not a build spec. No production-path change. Stage 6 pool left at 24.

Every claim is **CONFIRMED** (file and line, or named URL) or **HYPOTHESIS**.

Traces (already billed; no new model calls this pass):

| Label | Trace | Cards | Wall | Langfuse USD | Gens | Unpriced |
|-------|-------|------:|-----:|-------------:|-----:|---------:|
| Large before | `409b791c-56ee-434a-bc2e-fa9f1c9c219b` | 184 | 61170 ms | 10.3994 | 791 | 184 Stage 5 |
| Large after (comparable) | `de18131c-507f-4111-85ec-ffc15be7de8c` | 186 | 81898 ms | 8.4497 | 818 | 98 Stage 6 |
| Small prefix (lines 1 to 29) | `3a7e6228-ae7e-4bb2-9e59-c71855734e20` | 17 | 11.867 s | 0.9541 | 85 | 0 |

Langfuse host path prefix `/project/cmocxe6sh0295ad079aaovjn4/traces/<id>`. Token rows below sum paginated `GET /api/public/observations` (usageDetails input/output; cache from generation metadata `cachedInputTokens`, written by `lib/observability.js` L627).

---

## Scoreboard

| | |
|--|--|
| Where the tokens go on the comparable memo | **Stage 6 editorial 55% of the Langfuse bill**, compliance 15%, Stage 2 match 19%, Stage 5 8%. |
| The repeated part (the prize) | **Editorial system prompt ~9,088 tokens, identical every sentence.** User payload is 97% the full 22,163-character draft, placed *after* a unique sentence, so it does not prefix-cache. |
| Large-document problem or constant tax? | **Both.** Rulebook is a per-sentence tax. Full draft copied onto every editorial call is the large-document multiplier. |
| Why one request per sentence | **Product rule, not an accident.** `ARCHITECTURE.md` L21 "current statement only". Cost was *not* why Compliance is a separate call (`ARCHITECTURE.md` L49). B99 already shows sibling draft text misattributes concerns. |
| Batching sentences | **Biggest save, and it can change editorial verdicts.** Do not build it first. |
| Prefix cache | **Already on.** Helps the bill, not TPM. OpenAI: cached tokens still count toward rate limits. |
| Tightening the Stage 6 pool | Recovers the 98 missing checks and makes the run slower. **Does not cut cost.** Wrong first move if the goal is limit *and* cost *and* wait. |
| Recommended first move | **Stop sending the full marked draft on every Stage 6 editorial call.** Keep CONTEXT BEFORE / CONTEXT AFTER. Evidence before ship. |
| This pass spend | **USD 0.** No ledger row. |

---

## P1. Where the tokens actually go

Langfuse `calculatedTotalCost` prices every input token at the full gpt-4o input rate. OpenAI already discounts cached input at 50% (`lib/observability.js` L49 `cachedInput` 1.25 vs input 2.50). The ledger number is the Langfuse list figure. OpenAI-after-cache is derived from the same traces' `metadata.cachedInputTokens`.

### Large after (comparable production run)

Trace `de18131c-507f-4111-85ec-ffc15be7de8c`. Langfuse USD **8.4497**. Input tokens **3,189,442**. Cached **2,656,512** (83.3% of input). Output **48,695**.

| Stage | Calls | Tokens in | Tokens out | Cached in | Langfuse USD | Share of 8.4497 | Notes |
|-------|------:|----------:|-----------:|----------:|-------------:|----------------:|-------|
| editorial-style-review | 186 | 1,807,204 | 16,632 | 1,600,512 | 4.684 | **55.4%** | 64 ERROR unpriced (429). 122 priced. |
| qc-compliance-review | 186 | 505,449 | 762 | 470,144 | 1.271 | 15.0% | 34 ERROR unpriced (429). |
| stage2-match-sources | 194 | 579,853 | 13,186 | 466,560 | 1.581 | 18.7% | |
| stage5-generate-commentary | 186 | 227,792 | 9,248 | 69,632 | 0.662 | 7.8% | 186/186 priced. |
| stage2-match-multipassage | 27 | 54,353 | 735 | 44,800 | 0.143 | 1.7% | |
| stage1-extract-statements | 1 | 5,060 | 6,950 | 4,864 | 0.082 | 1.0% | |
| stage2-span-elicit | 27 | 4,687 | 908 | 0 | 0.021 | 0.2% | Below cache minimum. |
| stage1b-extract-claim-spans | 1 | 774 | 183 | 0 | 0.004 | 0.0% | |
| editorial-duplication-judge | 10 | 4,270 | 91 | 0 | 0.001 | 0.0% | gpt-4o-mini. |
| **Total** | **818** | **3,189,442** | **48,695** | **2,656,512** | **8.450** | 100% | 98 unpriced. |

OpenAI-after-cache for this trace (4o fresh 528,660 * 2.50/1M + cached 2,656,512 * 1.25/1M + 4o out 48,604 * 10/1M, plus mini USD 0.0007): about **USD 5.13**. CONFIRMED arithmetic from the token table and `lib/observability.js` L43-51. The USD 8.45 ledger figure does not apply that discount.

Priced editorial mean input **14,813** tokens (1,807,204 / 122). Sample 429 on this trace requested about **17,288** (`scripts/diagnostic/delivery-check/async-review-build.md`). Sample success: input 14,805 to 14,842.

### Large before (same memo, Stage 5 all 429, Stage 6 all completed)

Trace `409b791c-56ee-434a-bc2e-fa9f1c9c219b`. Langfuse USD **10.3994**. Input **3,978,038**. Cached **1,765,376** (44.4%).

| Stage | Calls | Tokens in | Tokens out | Cached in | Langfuse USD | Share of 10.3994 |
|-------|------:|----------:|-----------:|----------:|-------------:|-----------------:|
| editorial-style-review | 184 | 2,725,626 | 24,933 | 776,192 | 7.063 | **67.9%** |
| qc-compliance-review | 184 | 611,920 | 1,026 | 473,216 | 1.540 | 14.8% |
| stage2-match-sources | 192 | 573,898 | 13,132 | 480,128 | 1.566 | 15.1% |
| stage2-match-multipassage | 27 | 54,353 | 702 | 35,840 | 0.143 | 1.4% |
| stage1-extract-statements | 1 | 5,060 | 6,950 | 0 | 0.082 | 0.8% |
| stage5-generate-commentary | 184 | 0 | 0 | 0 | 0 | 0% |
| editorial-duplication-judge | 18 | 6,407 | 147 | 0 | 0.001 | 0.0% |
| stage1b | 1 | 774 | 183 | 0 | 0.004 | 0.0% |
| **Total** | **791** | **3,978,038** | **47,073** | **1,765,376** | **10.399** | 100% |

Editorial completed 184/184, mean input **14,813** (same unit as after). Cache hit on editorial **28.5%** of input (unbounded `Promise.all` that run). After pooling at 24, editorial cache among successes **88.6%**. CONFIRMED: parallelism reduces cache hits. It does not reduce TPM.

### Small prefix (17 cards, 2,001-character draft)

Trace `3a7e6228-ae7e-4bb2-9e59-c71855734e20`. Langfuse USD **0.9541**. Draft slice CONFIRMED `tests/fixtures/b247/recovered-shopify-messy-prefix.json` `_auditSliceLines` "1-29 of extractor output"; length CONFIRMED `scripts/diagnostic/delivery-check/fidelity-and-identity.md`.

| Stage | Calls | Tokens in | Tokens out | Cached in | Langfuse USD | Share of 0.9541 |
|-------|------:|----------:|-----------:|----------:|-------------:|----------------:|
| editorial-style-review | 17 | 178,774 | 2,355 | 159,616 | 0.470 | **49.3%** |
| stage2-match-sources | 17 | 58,449 | 1,588 | 40,576 | 0.162 | 17.0% |
| qc-compliance-review | 17 | 56,561 | 85 | 51,200 | 0.142 | 14.9% |
| stage2-match-multipassage | 16 | 39,379 | 1,050 | 21,504 | 0.109 | 11.4% |
| stage5-generate-commentary | 17 | 21,242 | 822 | 0 | 0.061 | 6.4% |
| stage1-extract-statements | 1 | 760 | 717 | 0 | 0.009 | 0.9% |
| **Total** | **85** | **355,165** | **6,617** | **272,896** | **0.954** | 100% |

| Per card | Small (17) | Large after (186) |
|----------|-----------:|------------------:|
| Langfuse USD | 0.0561 | 0.0454 |
| Editorial input tokens / priced call | 10,516 | 14,813 |
| Draft characters in the user payload | 2,001 | 22,163 |

The per-card bill is a **constant tax**. The extra ~4,300 editorial input tokens on the full memo is the **large-document adder** (the full draft on every editorial call). CONFIRMED: 14,813 - 10,516 = 4,297, in line with 20,162 extra draft characters.

### Identical from one call to the next

Measured by building `buildEditorialStyleSystemPrompt` / `buildEditorialStyleUserPayload` (`lib/qc/editorial-compliance-reviewer.mjs` L1480-1408) on the Shopify extract (`_auditDraft` 22,163 chars) and by Langfuse cache metadata.

| Stage | What is identical call to call | Share of that call's input | Does prefix cache see it? |
|-------|--------------------------------|---------------------------:|---------------------------|
| Stage 6 editorial system | Full rulebook + preamble. 45,873 chars. Sample cache **9,088** tokens. | ~61% (9,088 / 14,813) | **Yes.** Cross-statement typical hit. CONFIRMED sampleMeta on before-run L editorial 9,088 / 14,829 = 61.3%. |
| Stage 6 editorial user | OUTPUT TYPE header only. Longest common *prefix* of two user payloads: **51 characters** (0.2%). | ~39% of input is user | **No.** Unique CONTEXT BEFORE starts immediately. CONFIRMED L1361-1408. |
| Stage 6 editorial user, content not prefix | FULL DRAFT block **22,234 characters**, 97% of the user payload. Marker `[REVIEW THIS]` moves. | ~5,700 tokens / call | **No.** Shared text sits *after* the unique sentence. CONFIRMED L1404-1407. |
| Stage 6 compliance system | Compliance rulebook. Sample cache **3,072** of **3,345**. | ~92% | **Yes.** User is CURRENT STATEMENT only (L1424-1431). |
| Stage 2 system | `prompts/stage2_v4.md` 14,260 chars. | Most of ~3,040 input (stub source) | **Yes.** 87% cached on after-run match calls. B3 closed at 97% on a denser corpus (`docs/BACKLOG.md` B3). |
| Stage 2 user | `Statement:` then `Source:` (L1097-1103). Statement varies first. | Small here (83-char B1 stub) | Source would not cache on a long source (statement-first). Not visible on this stub. |
| Stage 5 system | `prompts/stage5_v2.md` 5,246 chars. Input ~1,250. | Nearly all | Borderline vs 1,024 minimum (`lib/observability.js` L437-440). Small run: **0 / 17** cached (one parallel wave). After: 69,632 / 227,792 = 30.6%, 68/186 calls. |

**The prize is the editorial system prompt (already cached) plus the full draft in the user payload (not cached, sent 186 times).**

Peak in-flight at Stage 6: `STAGE6_CONCURRENCY = 24` (`lib/qc/pipeline-v4/index.mjs` L45, L575) times two calls per statement (`Promise.all` L2206). Peak **48**. CONFIRMED.

---

## P2. The big lever, and the reason it might be wrong

### Why one request per sentence

| Claim | Status | Where |
|-------|--------|-------|
| Stage 6 evaluates the **current statement only** | CONFIRMED | `docs/ARCHITECTURE.md` L21 |
| Combined editorial+style is one LLM call per statement; compliance is a second | CONFIRMED | `ARCHITECTURE.md` L21, L50; `runEditorialStyleReview` L1696; `runComplianceReview` L1938 |
| The runner is documented per statement since A7.14 / A8.22 | CONFIRMED | `editorial-compliance-reviewer.mjs` L2, L2050 |
| Pipeline hands Stage 6 a **one-statement array** | CONFIRMED | `pipeline-v4/index.mjs` L164, L605 `runEditorialComplianceReview([reviewStatement], ...)` |
| Prompt text: "Evaluate only the CURRENT STATEMENT" | CONFIRMED | `EDITORIAL_EVALUATION_SCOPE` L76, `STYLE_SCOPE_CURRENT_ONLY` L39 |
| B206 removed a *count* cap of 20 statements, still one request each | CONFIRMED | `docs/BACKLOG.md` B206 |

This is how it was **written as a product rule**, not a leftover from a 20-statement slice.

### The "cost was not the reason" decision is a different isolation

| Isolation | What was isolated | Cost as the reason? | Where |
|-----------|-------------------|---------------------|-------|
| Signal type | Compliance kept out of the Editorial+Style call | **No.** "~$0.02/run saving not worth signal dilution" | `ARCHITECTURE.md` L49; `docs/ROADMAP.md` R3.1 (L695) |
| Sibling *source* material | B178 stripped evidence/source from the editorial payload because the model copied source style over house style | **No.** Quality defect. | `editorial-compliance-reviewer.mjs` L1382-1383; `docs/ROADMAP.md` B178 |
| Sibling *statements* | Prompt forbids flagging CONTEXT BEFORE / AFTER, except `narrative_coherence` | Intended. Already leaky. | L76; **B99** `docs/BACKLOG.md` |

B99 CONFIRMED: the reviewer is called with `statementCount` 1, still receives the surrounding draft, and files concerns against the wrong statement.

**The R3.1 reasoning does not apply to batching sentences.** R3.1 isolated *signal types*. One-per-sentence is *target isolation*. Batching would put sibling statements in one window, which is the B99 defect made larger, and the same class as B178 (wrong neighbouring text in the model's window). Cost was never why sentences were isolated.

### What batching would save (not built)

Assume 6 sentences per editorial request, one shared system prompt, one unmarked draft, 6 current statements.

| | Today's full memo if Stage 6 all completed | Batched x6 (HYPOTHESIS) |
|--|------------------------------------------:|------------------------:|
| Editorial calls | 186 | 31 |
| Editorial input tokens | ~2.75M (186 * 14,813) | ~0.50M (31 * ~16k: 9.1k system + 5.7k draft + 6 sentences) |
| Editorial Langfuse USD | ~7.14 (186/122 * 4.684) | ~1.3 |
| Stage 6 TPM burst | editorial 2.75M + compliance 0.61M | ~1.1M if compliance stays one-per-sentence |
| 429 on this memo | 98 misses at 2.0M TPM | HYPOTHESIS: fits |

Savings vs today's *billed* editorial (only 122 completed): smaller, because we did not pay for the 64 errors. The 98 misses are the quality hole, not a cost hole.

### What it would risk

It **can change editorial (and if batched, compliance) verdicts**. Not Stage 3 evidence. The model can attach a concern to the wrong sentence (B99, already observed with only neighbour context). Attention dilution across 6 rule-evaluations. Cross-talk between sentences.

Evidence that would settle it, before any ship:

| Arm | Same draft, same HEAD, cache off |
|-----|----------------------------------|
| A | Today's one-per-sentence |
| B | Batched (fixed N, say 6) |
| Compare | Per-statement concern code sets, `editorialVerdict`, `complianceVerdict`. Pass only if codes match on a frozen fixture (this Shopify memo plus one short control). |

Do not build it in this pass. Do not build it as the first spec.

---

## P3. The safer levers, sized

Ordered by saving per day of work against *this* problem (first-run bill, 429, wait). Re-review-only saves are called out.

### Ranked

| Rank | Lever | Applies here? | Save on this memo | Build | Saving per day of work | Hits 429? | Hits wait? |
|------|-------|---------------|-------------------|-------|------------------------|-----------|------------|
| 1 | Drop the full draft from the editorial user payload (keep neighbours) | **Yes.** Draft is 97% of the user message and is already duplicated as CONTEXT BEFORE/AFTER. | ~1.06M input tokens; about **USD 2.6** Langfuse (full rate) / **USD 1.3** if those tokens would have been cached. HYPOTHESIS: Stage 6 burst falls near or under 2.0M TPM. | 0.5 to 1 day plus A/B | **Highest** | Likely | Slightly faster (smaller payloads) |
| 2 | Mechanical rules decided in code, omitted from the prompt for every sentence | Partial. Filters today only DROP after the model fires. | Style block 14,478 chars of 45,873 system. Mechanical subset HYPOTHESIS ~1 to 2k tokens * 186. About **USD 0.3 to 0.6**. | 1 to 2 days plus A/B | Medium | Small | Small |
| 3 | Durable sentence cache for Stage 5 and 6 | Applies to *re-review*, not first run. | First run: **USD 0**. Re-review of this memo: from 8.45 toward Stage 1 only (~0.08) if every sentence hashes equal. | 2 to 3 days | High *if* re-reviews are common (unknown) | No on first run | No on first run |
| 4 | Smaller model for mechanical rules | Mini already used for judges. | If the *whole* editorial call moved to mini: ~16x cheaper on that 55% (about **USD 4.4** Langfuse). TPM count unchanged unless mini's ceiling is higher (not confirmed from public docs). | 1 day plus a quality gate that may take weeks | High dollars, slow evidence | Unknown | Unknown |
| 5 | Prefix-cache warmup | Already qualifying, already hitting after the first wave. | ~USD 0.3 on the first 24 misses. | 0.5 day | Low | **No** | Slightly slower (one serial call) |
| 6 | Output-type rule filter | **Already on** for this memo. | **USD 0** more on reporting_commentary. | 0 | None here | No | No |

### 3a. Provider prefix cache

| Question | Answer | Status |
|----------|--------|--------|
| Does this project qualify? | **Yes.** Chat Completions, `gpt-4o-2024-08-06`, prompts over 1,024 tokens. Automatic, no opt-in. | CONFIRMED `lib/observability.js` L435-440; [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) |
| Discount on this model | 50% of input (`cachedInput` 1.25 vs 2.50). Not the 90% GPT-5.6 figure. | CONFIRMED `lib/observability.js` L49; OpenAI "Other earlier models" table |
| Is it already hitting? | **Yes.** After-run editorial 1,600,512 / 1,807,204 = 88.6% of billed input cached (122/122 successes). Before-run unbounded parallel: 28.5%. | CONFIRMED Langfuse metadata |
| Does firing everything in parallel defeat it? | **It lowers hit rate.** Cached state lives on one machine; traffic above **15 requests per minute** can overflow-route. First wave has nothing to read. | CONFIRMED [prompt caching, Cache location](https://developers.openai.com/api/docs/guides/prompt-caching) |
| Would one warmup call raise hit rate? | **HYPOTHESIS: a little**, on the first 24. After-run successes already cache. Before-run shows the all-parallel miss. | HYPOTHESIS |
| Bill, or rate limit too? | **Bill (and some input latency) only.** | CONFIRMED FAQ "Do cached prompts count toward rate limits? Yes. Cached input tokens still count toward tokens-per-minute limits. Prompt caching does not change how rate limits are calculated." [same URL](https://developers.openai.com/api/docs/guides/prompt-caching) |
| Unsuccessful retries | Count toward the per-minute limit. | CONFIRMED [OpenAI rate limits](https://developers.openai.com/api/docs/guides/rate-limits) "unsuccessful requests contribute to your per-minute limit" |

Putting the unmarked draft *before* the unique sentence would raise the cached share (OpenAI: "Put stable developer instructions and shared reference material first"). That still would **not** cut TPM. Do not sell reordering as a 429 fix.

B3 CONFIRMED closed as a correction: Stage 2 was already at 97% prefix cache; the missing piece was billing (`docs/BACKLOG.md` B3).

### 3b. Only send rules that apply to this output type

Already implemented: `filterRulesForRun` L271-277; `resolveStyleGuide` + `applies_to` (`lib/qc/style-guide.mjs` L247-253).

This memo is `reporting_commentary` / `complete`.

| Book | Sent / total | Notes |
|------|--------------|-------|
| Editorial | **14 / 14** | All apply to reporting_commentary. |
| Compliance | **7 / 10** | 3 already dropped for this type. |
| Structured style | **15 / 15** for RC | `first_person_plural` is RC-only (`style-guide.mjs` L142). Other types get 14. |

**How much is sent regardless of type:** for this output type, **the whole editorial book and the whole structured style book**, plus 7 of 10 compliance rules. LinkedIn complete would drop 3 editorial and 5 compliance. **USD 0 extra save on this document.**

Per-sentence rule subset (skip `em_dash` when the sentence has no dash) would *change the system prompt every call* and **break the 9,088-token prefix cache**. Do not do that.

### 3c. Mechanically decidable in code

Today the deterministic layer **DROPs false flags after the model fires**. It does not RAISE. CONFIRMED L806-812 "TRUE to KEEP, FALSE to DROP"; LLM-last.

| Rule | Filter exists? | Could code decide outright? | Caveat |
|------|----------------|-----------------------------|--------|
| `em_dash` | DROP if no em/en dash (L1039) | **Yes**, presence | Quoted-text exemption (L67). |
| `smart_quotes` | DROP if no curly quotes (L1030) | **Yes** | Same exemption. |
| `thousand_separator`, `currency_format`, `number_spelling`, `date_format`, `oxford_comma`, `percentage_notation`, `english_variant` | DROP filters L814-959 | Partial. Presence is easy. House-correct vs house-wrong is how B176/B178 were born. | Raising in code can change which cards show a style concern, so `editorialVerdict` can move clean to concern. |

Parked `imprecision_when_precision_available` already says "Reinstate as a deterministic check" (`lib/rulebook/editorialRules.js` L18-25). That is evidence-adjacent, not Stage 6 style.

A RAISE would change editorial verdicts. Evidence: same A/B as P2, concern codes for those rule ids only.

### 3d. Unchanged sentence, skip re-check

| Cache | Stages | Production | Survives cold start? |
|-------|--------|------------|----------------------|
| `QC_LLM_CACHE` memory LRU | **stage1, stage1b, stage2 only** | Default ON | **No** |
| `QC_LLM_CACHE_DISK` | Same stages | Unset in production | Local diagnostics only |

CONFIRMED `lib/qc/llm-cache.mjs` L24 `STAGES = stage1, stage1b, stage2`; `ARCHITECTURE.md` L57-58; B63 / B69.

There is **no** Stage 5 or Stage 6 result cache. Durable LLM cache was scoped for B61 and never built: Neon `persist-review-state` is the frontend autosave blob, not Stage 2/6 results (`docs/BACKLOG.md` B61; `docs/ROADMAP.md` "Unblocked-but-not-built").

| Run | What you pay today | What you could pay |
|-----|--------------------|--------------------|
| First review of this memo | Langfuse **USD 8.45** (OpenAI ~5.13) | Unchanged by a cache |
| Re-review, new process (production) | Same again. Stage 2 memory cache is cold. | With a durable Stage 5+6 sentence hash: **near USD 0** for unchanged sentences; Stage 1 still runs unless draft-hashed too |
| Re-review, same process, cache warm | Stage 2 replay (save ~USD 1.58). Stage 5+6 still full (~USD 6.6 list) | Stage 5+6 hash would take that to ~0 |

`narrative_coherence` depends on neighbours, so a sentence hash must include context before/after or it can skip a check that should re-fire. That is a verdict risk. Evidence required.

### 3e. Smaller model for mechanical rules

Already on mini (`gpt-4o-mini-2024-07-18`): `claim-extraction`, `editorial-duplication-judge`, `framing-fidelity-judge`, scoring (`lib/qc/model-config.mjs` L29-30, L42-44). Editorial, compliance, Stage 2, Stage 5 stay `gpt-4o-2024-08-06`.

Mini input is 0.15/2.50 = **6%** of 4o (`lib/observability.js` L49-51). Moving only mechanical style to mini means **splitting** the combined call (undoing part of R3.1) and *adding* TPM. Moving the whole editorial call to mini is the dollar win and a quality bet (B176 house-style inversion, `first_person_plural`, `narrative_coherence`).

Public rate-limit docs do not list this org's mini TPM. HYPOTHESIS only: mini often has a higher ceiling. Do not treat that as a 429 fix without reading the project limits page.

---

## P4. The Stage 6 pool decision, held on purpose

Claude, in `scripts/diagnostic/delivery-check/async-review-build.md` D6: Stage 6 429s are "a reason to tighten Stage 6's pool later." B268's next-step cell says the same: "Tighten Stage 6, not async the Review."

Tightening the pool **works** for the 98 misses: 2.31M Stage 6 tokens need ~69 s at 2.0M TPM instead of a 30 to 40 s burst (HYPOTHESIS on the window; CONFIRMED 2.0M cap from the 429 text). Wait goes up. Langfuse USD **does not go down**. Cached tokens still count.

P2 (batch) and P3 draft-drop cut tokens, so they can hit **limit, cost, and wait together**. The pool cannot.

**Recommendation:** do not tighten the Stage 6 pool as the first move. First spec: drop the full marked draft from the editorial user payload, A/B on this fixture, then ship only if concern sets hold. If that A/B fails, *then* tighten the pool as the no-verdict-risk 429 patch.

**What not to do:**

| Do not | Why |
|--------|-----|
| Batch sentences first | Can change editorial verdicts (B99). Needs evidence. Biggest lever, wrong first spec. |
| Tighten Stage 6 concurrency first | Fixes 429 only. Slower. No bill cut. |
| Warmup-only, or reorder-only, as a 429 fix | OpenAI: cached tokens still count toward TPM. |
| Per-sentence rulebook subset | Breaks the 9,088-token prefix cache. |
| Merge compliance into editorial | R3.1 already judged that not worth signal dilution. |
| Touch Stage 1 splitting or the Stage 2 prompt | Out of scope; B3 already closed. |
| Async jobs for this class | Already rejected in the previous proposal. |

---

## P5. What I would do, in order

| Step | Days | Expected save on this memo | Verdict risk? | Evidence before ship? |
|------|-----:|----------------------------|---------------|------------------------|
| 1. Drop full draft from Stage 6 editorial user (keep CONTEXT BEFORE/AFTER). Do not change the pool. | 0.5 to 1 | ~USD 2.6 list / ~1.06M tokens. HYPOTHESIS: 429s fall enough to close B268. Wait slightly down. | **Yes**, `editorialVerdict` / `narrative_coherence` / `materiality` | A/B this Shopify fixture vs a 17-card control. Concern codes per index. |
| 2. If step 1 fails A/B: lower `STAGE6_CONCURRENCY` (try 8). | 0.5 | USD 0. Recovers `not_reviewed`. Wall clock up ~30 s (HYPOTHESIS). | **No** (same prompts, fewer in flight) | Count `not_reviewed` on a production re-run of this memo. |
| 3. Omit mechanical style rules from the (stable) system prompt; RAISE in code for `em_dash` and `smart_quotes` only. | 1 to 2 | USD 0.3 to 0.6 | **Yes**, those style concerns | A/B on those rule ids. |
| 4. Sentence-hash cache for Stage 5+6, key includes neighbours. Durable later (B61 shape). | 2 to 3 | First run USD 0. Re-review of an unchanged memo: most of USD 8.45. | **Yes** if the key omits context | Replay two reviews of the same draft. |
| 5. Batch sentences, N=6, only after B99 has a failing test and a fix. | 2 plus the B99 fix | ~USD 5 editorial if all complete | **Yes** | Frozen A/B, codes must match. |
| 6. Mini for editorial | 1 plus a quality week | ~USD 4.4 if it holds | **Yes** | Same frozen pack as style inversion. |

**Leave alone:** Stage 1 prompt, Stage 2 prompt, R3.1 split, output-type filter (already correct for this type), prefix-cache warmup as a 429 project, per-sentence rule filtering, the Stage 6 pool until step 1 is measured.

Steps that can change a verdict (editorial/compliance, not Stage 3 evidence): **1, 3, 4, 5, 6**. Step 2 cannot.

---

## Where I disagree with Claude

| Claude said | I say |
|-------------|-------|
| Tighten the Stage 6 pool later to finish the 98 missing checks (`async-review-build.md` D6; B268 next-step). | That is the right *fallback*, not the right *first* move. It trades wait for completeness and leaves the USD 8.45 (and the 2.0M TPM math) intact. |
| Pool at 24 was the right Stage 5 fix (D2). | **Agree.** Stage 5 is small (~1,250 tokens) and now 186/186. Do not unwind D2. |
| One longer Function, not async jobs (D6). | **Agree.** Unchanged. |

I am not disagreeing that a tighter pool would recover checks. I am disagreeing that it is the lever for cost, limit, and wait together.

---

## Cost report

| | |
|--|--|
| New model calls this pass | **0** |
| Langfuse reads | Paginated observations on the three traces above |
| Spend | **USD 0** |
| Ledger row | None |

Budget was USD 2. Unspent.
