# Rate limits, wait, and the editorial design (B276)

PROPOSAL. Two phases. Phase 1 was written from the live headers, the 429 text, and the retry code. Phase 2 was written after that, not before. Nothing built. No production Review.

Ids: **B276**. Next free after B275.

---

## Scoreboard

| | |
|--|--|
| Q1 The 2M cap | **Tier 4, gpt-4o family.** Live header `x-ratelimit-limit-tokens: 2000000`. Next published rung is Tier 5 at USD 1,000 paid: 30M TPM. That would issue 3.37M Stage 6 tokens in 6.7 s. |
| Q2 Shared or per model | **Per model family.** Same second: gpt-4o 2M, gpt-4o-mini 10M, gpt-5.1 4M. Every QC stage including Stage 5 draws from the 2M gpt-4o pot. |
| Q3 Can we simply wait | **Partly dissolves the 3,700-word miss problem. Does not dissolve the 7,400-word stop.** The 2 s cap waits for a drip, not for this request. A 17k editorial call needs ~0.52 s of refill from a full bucket. The server said 77 ms, which frees ~2.6k tokens. Four retries then give up. About 160 s of Function headroom sat unused. |
| Does any of the three dissolve the problem | **Q3 partly, for this memo's unfinished checks, with no token change. Q1's next tier would dissolve TPM on this host. Q2 changes nothing unless work moves family, which is a quality decision.** |
| Phase 2 design | Keep today's per-sentence question with the draft. Wait until the request fits. Do not batch first. Do not revive Layer B as the materiality catcher. |
| This pass spend | **List USD 0.000164.** Three 1-token probes. No production Review. |

---

## Part 0. Claims used as inputs

All CONFIRMED unless marked.

C1. Same pool 4, two days: 186/186 in 123368 ms, then 102 Stage 6 misses in 140174 ms. `docs/BACKLOG.md` B268 and the 2026-09-20 honesty ledger row.

C2. Dropping `FULL DRAFT` moved findings past the floor. B271, B275.

C3. A document-level call asking for materiality, first-use jargon, and voice-throughout recovered 0 of 7 agreed materiality findings. B275.

---

# PHASE 1. THREE NUMBERS

## Q1. The limit itself

**This account is on usage Tier 4 for gpt-4o.** CONFIRMED two independent ways, and they match.

1. Production 429 text, org `org-KFCd9S039LXddh2qObiVcoPh`: `Rate limit reached for gpt-4o-2024-08-06 (for limit gpt-4o) ... Limit 2000000`. `scripts/diagnostic/delivery-check/async-review-proposal.md` L101.
2. Live header on 2026-09-20, this pass, `gpt-4o-2024-08-06`: `x-ratelimit-limit-requests: 10000`, `x-ratelimit-limit-tokens: 2000000`.

That pair is the published gpt-4o Tier 4 row (10,000 RPM, 2,000,000 TPM). CONFIRMED [GPT-4o model page](https://developers.openai.com/api/docs/models/gpt-4o).

Published gpt-4o ladder:

| Tier | Qualification (official) | gpt-4o RPM | gpt-4o TPM | What 3.37M Stage 6 tokens cost in TPM time |
|------|--------------------------|----------:|----------:|--------------------------------------------|
| 1 | USD 5 paid | 500 | 30,000 | 112 min |
| 2 | USD 50 paid | 5,000 | 450,000 | 7.5 min |
| 3 | USD 100 paid | 5,000 | 800,000 | 4.2 min |
| 4 | USD 250 paid | **10,000** | **2,000,000** | **101 s** (this org, now) |
| 5 | USD 1,000 paid | 10,000 | **30,000,000** | **6.7 s** |

Qualification source: [OpenAI rate limits, usage tiers](https://developers.openai.com/api/docs/guides/rate-limits). The official table is cumulative **dollars paid**, plus a monthly usage ceiling (Tier 4 USD 5,000 / month; Tier 5 USD 200,000 / month). It does not list days-on-platform. Third-party writeups add 7 / 14 / 30 day waits. HYPOTHESIS. I did not read the billing dashboard.

**What the next tier costs, and what it buys.** USD 1,000 lifetime paid to OpenAI, if this org is not there yet. I cannot see cumulative billing from the API key. The live 2M header proves we are not on Tier 5 now. Graduation is automatic on spend. There is no published price to *buy* a tier; you pay for tokens until the threshold.

Against the 3.37 million Stage 6 tokens a complete memo needs (`b268-stage6-pool.md` C3): Tier 5 issues that in 6.7 s. Today's 101 s floor becomes noise. A 15,000-word memo at today's quadratic shape is about 24.7 M Stage 6 input (`editorial-review-blank-sheet.md` L306). That still fits in one Tier 5 minute (24.7 / 30 * 60 = 49 s of tokens). Latency of hundreds of pooled calls can still miss the 300 s Function. TPM would no longer be the stop.

**Above Tier 5.** The usage-tier table stops. Official remaining levers: a limit-increase request in the dashboard; OpenAI **Scale Tier** / **Reserved Tier** for enterprise capacity (same rate-limits page, "Handle rapid traffic increases"). Those are commercial products, not the next automatic rung. CONFIRMED as named. Not priced here. I did not open a support ticket.

This is the 60-second-cap class of fact. 2M is this org's current tier, not a law of the API.

## Q2. Shared or per model

**Partitioned by model family, at organisation (and project) level. Not one pot for the whole account.**

Official: "Rate limits vary by the model being used." "Some model families have shared rate limits." Snapshots under a shared-limit list share one TPM. CONFIRMED [rate limits](https://developers.openai.com/api/docs/guides/rate-limits). The 429 text names the family: `(for limit gpt-4o)` on `gpt-4o-2024-08-06`.

Live headers, same second, this pass:

| Model | RPM header | TPM header | Matches published Tier 4 |
|-------|----------:|----------:|--------------------------|
| `gpt-4o-2024-08-06` | 10,000 | **2,000,000** | gpt-4o yes |
| `gpt-4o-mini-2024-07-18` | 10,000 | **10,000,000** | gpt-4o-mini yes ([models dump](https://cdn.openai.com/API/docs/txt/llms-models-pricing.txt) gpt-4o-mini table) |
| `gpt-5.1-2025-11-13` | 10,000 | **4,000,000** | own family; 4M is the live number |

Cached tokens still count toward that family's TPM. CONFIRMED OpenAI prompt-caching FAQ, already recorded in `editorial-review-blank-sheet.md` L184.

Every production QC stage uses `gpt-4o-2024-08-06`: Stage 1, 1b, 2, 5, editorial, compliance. CONFIRMED `lib/qc/model-config.mjs` L20-27. Stage 5 and Stage 6 therefore contend for the same 2M. Mini (10M) and gpt-5.1 (4M) are unused by Stage 6. Moving a stage to another family would draw from another pot. That would be a quality decision. This answer does not propose it.

## Q3. Can we simply wait

**The retry exists. The wait does not.** CONFIRMED `lib/observability.js` L462-463, L510-514, L523-534: 4 attempts, delay = min(server wait, **2000 ms**) plus jitter, then throw. Tests lock those numbers: `tests/b266-rate-limit-retry.test.mjs` L24-26.

The server wait on this org is tens of milliseconds (42 ms Stage 5, 77 ms Stage 6). CONFIRMED `async-review-proposal.md` L101; `document-context-proposal.md` L160. OpenAI's own page says treat `Retry-After` as a **minimum**, and if the configured max delay is shorter than the server delay, **defer rather than retry sooner**. We clip to 2 s and retry sooner. CONFIRMED the same rate-limits page, "Retrying with exponential backoff".

**Why 77 ms cannot admit a Stage 6 editorial call.** TPM 2,000,000 / 60 = 33,333 tokens per second. A 17,288-token request needs 17,288 / 33,333 = **0.52 s** of refill from a full bucket. 77 ms frees 33,333 * 0.077 = **2,567 tokens**. The retry is then refused. Four of those, about 250 ms of sleep, then `not_reviewed`. Unsuccessful 429s still count toward the minute. CONFIRMED the same page: "unsuccessful requests contribute to your per-minute limit, so continuously resending a request won't work."

**Headroom.** Function cap 300 s. CONFIRMED `vercel.json`. Quiet complete run 123 s, 177 s unused (`b268-stage6-pool.md` C3). Honesty-disclosure run 140 s with 102 misses, about 160 s unused. Completing those 102 at the same means is about 1.00 M more input (58 * 14,813 + 44 * 3,325), **30 s of TPM** plus the calls' own latency. 140 + 50 is still under 300. HYPOTHESIS on the 50 s; the 30 s of tokens is arithmetic.

**Longest safe wait.** Remaining Function time minus remaining TPM-floor work minus about 10 s for Stage 7 and shutdown. At t=0 on this memo that is about **160 to 177 s** of wait in total, not per call. Per call, the physically required wait from a full bucket is `requested / (limit/60)`: about 0.5 s for one editorial call, about 3.6 s if eight in-flight calls all need ~15 k at once. The 2 s cap clips the eight-wide case. A single-slot wait of 10 to 20 s is still cheap against 160 s of slack.

**What it would recover.** The checks that today expire after 2 s of drip-retries: the 102 on 2026-09-20, the 98 on pool 24, the 39 on pool 8. Same prompts. Findings should not move.

**What it cannot recover.** Tokens faster than 2 M / min. At ~7,400 words today's all-LLM TPM floor is 308 s (`editorial-review-blank-sheet.md` L308). Waiting cannot finish that inside 300 s. A busy org that occupies the 2 M for the whole remaining window also cannot be waited out inside the Function. C1 is that second case as well as the 2 s cap: harness and production share `gpt-4o`.

**Has this been tried?** No. B266 shipped the 2 s cap on purpose as a belt behind the pool. B268 then treated the pool as the 429 fix. Neither waited for the minute to refill.

## Phase 1 close. Does any of the three dissolve the problem?

| | Dissolves unfinished checks on this memo | Dissolves the 7,400-word quadratic stop | Changes findings |
|--|--|--|--|
| Q1 Stay on Tier 4 | No. 2M is what we have. | No. | No. |
| Q1 Pay to Tier 5 | **Yes, TPM.** 6.7 s of Stage 6 tokens. | **Yes, TPM.** 15k-word Stage 6 still under 30 M. Wave latency may still miss 300 s. | No. |
| Q2 Partition fact | Nothing, while every QC stage is gpt-4o. | Nothing. | N/A. |
| Q3 Wait for fit | **Partly.** The cheap miss on a quiet-enough org is the 2 s give-up, not a shortage of Function time. Competing load can still eat the window. Never tried. | **No.** 308 s of tokens will not fit in 300 s. | No, if payloads stay. |

**Q3 is the cheapest product answer and it has never been tried.** Q1's next tier is an ops check (has this org already paid USD 1,000?). It is not required to start Q3. Q2 is a map, not a move.

---

# PHASE 2. THE DESIGN

Written after Phase 1.

## What I would actually run

Two layers of request, same as today, plus a wait that today pretends to have.

**Craft call (editorial plus style). One per sentence.**

Carries: the stable system prompt; CONTEXT BEFORE; CURRENT STATEMENT; CONTEXT AFTER; `FULL DRAFT` marked `[REVIEW THIS]`; the full craft rule list. Question: which of these rules fire on **this** sentence, given the document. That is the question B271 and B275 proved is load-bearing. A document-level "which sentences are immaterial" is a different question and found nothing.

Count: N.

**Compliance call. One per sentence.**

Carries: the statement and publication state. No draft. Question: which of these rules fire on this sentence. Leave it. It is already the small call. Count: N.

**Finding to sentence.** The call is about that sentence. `FIDELITY_DROP` still drops a quote that is not in it. Quote-locate stays in the tree, unused on this path. A failed call is `not_reviewed`, never `clean`.

**429.** Wait until this request fits: `requested / (TPM/60)` from a full bucket, or `x-ratelimit-reset-tokens` when that header is the longer number, plus jitter. Do not cap at 2 s. Do not fire four drip-retries. Bound: remaining Function time minus remaining TPM-floor work minus 10 s. If the bound is hit, stamp `not_reviewed` and log. Pool stays 4 until two production runs an hour apart show completions; C1 forbids raising it from one green day. Stage 5 stays 24 and already shares the gpt-4o pot, so it benefits from the same wait.

**Not in the first slice.** Layer A RAISE (B157). Batching. Layer B as a materiality catcher. A model-family move. A requirement that the product sit on Tier 5.

**The 7,400-word class, only if we need it on this host without Tier 5.** Then batch craft: B sentences, one system prompt, one `FULL DRAFT`, B current-statement blocks. Question still per sentence inside the batch, not "scan the memo." Bind with quote-locate. Start at B=4. Prove on the 40 against that day's floor, plus the planted fixture. Kill if the floor moves, if a planted finding lands on the wrong sentence, or if materiality goes clean. That is a later spec.

## Cost and time

Unit costs CONFIRMED at 3,698 words / 186 statements. Scaling HYPOTHESIS as in the blank sheet (N and draft both grow; short source). Wait does not change tokens. List USD is today's shape. Wall is today's complete wall plus wait. On a quiet org wait should be near zero because pool 4 already finished in 123 s once.

| | 3,700 words / 186 | 7,400 words / 372 | 15,000 words / 754 |
|--|--:|--:|--:|
| Requests (craft + compliance) | 372 | 744 | 1,508 |
| Stage 6 input | 3.37 M | 8.53 M | 24.7 M |
| Stage 6 TPM floor at 2 M | 101 s | 256 s | 740 s |
| All-LLM TPM floor at 2 M | 127 s | 308 s | 846 s |
| Wall if wait works, quiet org | ~123 s measured class | hits the 300 s cap | misses |
| List USD | ~11.19 measured | ~27 | ~73 |
| Completes inside 300 s at Tier 4, with wait | **Yes, on a quiet-enough org.** That is the Q3 claim. | **No.** Token floor > cap. | **No.** |
| Completes inside 300 s at Tier 5 (30 M TPM) | Yes | Yes on TPM (17 s of Stage 6 tokens). Wave latency HYPOTHESIS still under 300 s if the pool can rise. | TPM yes (49 s of Stage 6). Latency of 754 statements may miss 300 s even at pool 24. |

**Where it stops, this host, Tier 4:** just under **7,400 words**, same as B268. Wait moves the 3,700-word miss rate. It does not move the stop. A worker does not move the stop either (TPM is org-level). Tier 5 or fewer tokens (batching) would.

If craft were later batched at 8, Stage 6 input HYPOTHESIS: about 1.13 M / 2.43 M / 5.93 M at the three lengths (one system, one draft, eight uniques per batch; compliance unbatched). TPM floors about 34 s / 73 s / 178 s. That would move the stop past 7,400 words. Findings unproven. Not the first slice.

## What this depends on being true (falsifiers)

1. **The 3,700-word miss is wait-shaped, not continuously-over-budget-shaped.** Falsified if two production runs of the full memo, an hour apart, with wait-for-fit and the same payloads, still lose checks while wall stays under 300 s. Then the org is busy for the whole window and Q3 is not enough. Next lever is Tier 5 or fewer tokens.
2. **Same payloads keep the wobble floor.** Falsified if wait somehow moved findings. It must not: no prompt change. If it did, stop.
3. **Materiality is a per-sentence-given-the-document judgement.** Already measured true (B271, B275). Falsified if a future document-level wording recovers those seven indexes by name without moving the 40. Do not assume it. Do not ship Layer C without that recovery.
4. **Quote-locate attaches by words, not by claimed index.** Already measured true (B275 D4). Falsified if a planted quote that exists in one sentence attaches to another. Blocks batching, not the wait slice.
5. **2 M is still this org's gpt-4o TPM.** Falsified by a header that is not 2,000,000. If it becomes 30 M, the wait slice is still correct and the 7,400-word TPM stop has moved.
6. **Accuracy corpus must not move.** Any later batching or prompt change that moves it is a kill, independent of completions.

## Claude's view, argued with

Claude: batching several sentences into one request is the only surviving option, because it shares one copy of the document while keeping the question pointed at each sentence, and quote-locate now removes the misattribution risk.

**The question-shape half is right.** B275 died because it asked a document-level question. The surviving judgement is "is **this** sentence material given the document." A batch that asks that of each member, with the draft present once, is the token-saving form of today's call. A scan of the memo is not.

**"Only surviving option" is wrong.** Q3 survives and is cheaper. Same question, same draft, same N calls, wait until the request fits. It does not need quote-locate. It does not need a 40-subset A/B. It is the completeness move Ben ruled (results arrive complete). Batching is a token move for documents this host cannot finish at 2 M TPM. Different problem.

**"Quote-locate now removes the risk" is too strong.** Locate removes attachment by claimed index. It does not remove B99: a quote whose words also occur in the wrong sentence still binds there. It does not remove attention bleed inside a batch (the model reasons about sentence 4 and quotes sentence 5's shared words). B275 showed that a working bind plus a different question still lost materiality. Locate is necessary for a batch. It is not sufficient to declare batching safe.

If we batch later: size **4** first (smallest step that shares a draft). Proof: D4 planted fixture must fail before locate exists and pass after, then the 40 twice-vs-twice against that day's floor, then the 17-card control. Kill: mean codesDiffer above the floor; planted attach wrong; materiality going clean on the named indexes (44, 65, 86, 99, 107, 113, 180 on this fixture). Do not ship a batch that fails that. Do not batch because completions looked green.

---

## What was not built

No production path change. No retry change. No pool change. No batching. No Layer B wiring. No production Review. Corpus untouched.

## Cost report

Budget USD 3. This pass **list USD 0.000164**. Discounted the same (no cached input). 3 calls. 0 unpriced. USD 0 production.

| Model | Input | Output | List USD |
|-------|------:|-------:|---------:|
| gpt-4o-2024-08-06 | 14 | 1 | 0.000045 |
| gpt-4o-mini-2024-07-18 | 14 | 1 | 0.0000027 |
| gpt-5.1-2025-11-13 | 13 | 10 | 0.00011625 |

Source: this pass's header probe, rates from `lib/observability.js` L45-57. Under budget. No further calls.
