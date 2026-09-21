# B313. Prompt-cache rate-limit probe

Four sequential `gpt-4o-2024-08-06` temperature-0 calls. One recorded editorial request from `tests/fixtures/b247/shopify-messy-full-after.json` (copied to gitignored `scripts/diagnostic/runs/stage-replay/cache-probe-payload.json`). Builders: `buildEditorialStyleSystemPrompt` and `buildEditorialStyleUserPayload`. The reordered payload is probe-only. It is not wired into any product path.

Statement index 1. Draft 3,698 words. Model `gpt-4o-2024-08-06`.

---

## The four numbers

| call | prompt_tokens | cached_tokens | completion_tokens | x-ratelimit-limit-tokens | x-ratelimit-remaining-tokens |
|------|--------------:|--------------:|------------------:|-------------------------:|-----------------------------:|
| today-1 | 14,798 | 0 | 211 | 2,000,000 | 1,982,702 |
| today-2 | 14,798 | 14,592 | 211 | 2,000,000 | 1,982,702 |
| reordered-1 | 14,734 | 9,088 | 209 | 2,000,000 | 1,982,784 |
| reordered-2 | 14,734 | 14,592 | 209 | 2,000,000 | 1,982,784 |

Reordered messages: system prompt, then unmarked draft, then the sentence and its neighbours last.

---

## Q1. Do cached tokens consume the per-minute allowance?

Today pair remaining-tokens: 1,982,702 then 1,982,702. Drop: **0**.

Reordered pair remaining-tokens: 1,982,784 then 1,982,784. Drop: **0**.

Today prompt_tokens: 14,798. Uncached on call 2: 14,798 - 14,592 = **206**.

The drop matches neither the full prompt nor the uncached remainder. It is zero on both pairs.

The first call of the today pair deducted 2,000,000 - 1,982,702 = 17,298 from the 2M limit, against prompt+completion 15,009. That first call had zero cache. The second call, with 14,592 cached tokens, left remaining unchanged.

That is consistent with cached tokens not consuming the per-minute allowance. It is also consistent with a sticky header. This probe cannot separate those. It does **not** show that cached tokens consume the allowance. The drop is not the full prompt_tokens.

---

## Q2. What does reordering actually cache?

cached_tokens on call 2 of each pair, as a percentage of prompt_tokens:

- Today's order: 14,592 / 14,798 = **98.6%**
- Reordered: 14,592 / 14,734 = **99.0%**

Reordering did not buy a larger cache on call 2. Both second calls cached 14,592 tokens. Reordered call 1 already had 9,088 cached (61.7%) because its system prompt matched the prefix from the today pair that ran first.

---

`claude/token-volume-and-caching-research.md` is not in this repo (Claude project doc). This probe cannot confirm or contradict a file it cannot read. What it does show: automatic prefix cache fires on the second identical call (98-99% of prompt_tokens); putting the unmarked draft before the sentence did not raise that second-call cache above today's order; remaining-tokens did not drop with the cached second call.

---

**TOTAL COST OF THIS SPEC IN USD (Part 2): list 0.156060, discounted 0.108220.** Four calls, zero unpriced. Rates `lib/observability.js` gpt-4o-2024-08-06 2.50 / 1.25 / 10.00 per million. Ledger row 2026-09-21 B313.
