# R1.2 — gpt-4o-mini Stage 2 source-matching eval

Generated: 2026-05-03T04:30:53.431Z

## Summary

- **Total pairs in inputs:** 47
- **Mini calls with valid schema (4-way class):** 47
- **Schema validation failures (after retry):** 0
- **Retries (first attempt failed schema):** 0
- **Total mini API cost (USD, from usage × list price):** $0.0232
- **Total mini latency (sum):** 89144 ms
- **Mini latency p50 / p95:** 1796 ms / 3098 ms

## Agreement vs ground truth

- **gpt-4o agreement rate** (from `gpt4o_classification` in inputs): **87.23%** (41/47 pairs with both labels valid)
- **gpt-4o-mini agreement rate** (valid mini only): **87.23%** (41/47)

Reference locked eval: gpt-4o vs GT was **41/47 (87.23%)** on the same sheet.

### Confusion matrix — gpt-4o-mini (rows = GT, cols = mini)

| GT \ Pred | confirmed | partially_confirmed | conflicting | no_support |
|---|---|---|---|
| **confirmed** | 18 | 1 | 0 | 0 |
| **partially_confirmed** | 0 | 0 | 0 | 1 |
| **conflicting** | 3 | 0 | 1 | 0 |
| **no_support** | 1 | 0 | 0 | 22 |

### Confusion matrix — gpt-4o labels in inputs (rows = GT, cols = gpt4o)

| GT \ Pred | confirmed | partially_confirmed | conflicting | no_support |
|---|---|---|---|
| **confirmed** | 16 | 3 | 0 | 0 |
| **partially_confirmed** | 0 | 1 | 0 | 0 |
| **conflicting** | 0 | 3 | 1 | 0 |
| **no_support** | 0 | 0 | 0 | 23 |


## Pairs where mini disagrees with ground truth

- **P04**: GT=`conflicting`, mini=`confirmed` — The source explicitly states that Shopify has signed up large businesses, including Pixar, confirming the statement.
- **P24**: GT=`no_support`, mini=`confirmed` — The source confirms that Shopify has been delivering strong growth and performance, aligning with the statement that it continues to deliver against the thesis underwritten at Series A.
- **P27**: GT=`conflicting`, mini=`confirmed` — The source explicitly states that the annualized gross merchandise value transacted across Shopify-powered stores is approximately $132 million, confirming the statement.
- **P30**: GT=`conflicting`, mini=`confirmed` — The source confirms the existence and functionality of the 'App Store' as described in the statement, detailing how it allows customers to enhance their online stores.
- **P33**: GT=`confirmed`, mini=`partially_confirmed` — The source confirms that Shopify competes with Volusion and mentions it as a competitor, but does not provide specific details about Shopify's competitive positioning being differentiated against Volusion.
- **P46**: GT=`partially_confirmed`, mini=`no_support` — The source discusses Shopify and expresses excitement about its product, but it does not specifically address the statement about updating partners.

## Pairs where mini disagrees with gpt-4o (inputs)

- **P04**: gpt-4o=`partially_confirmed`, mini=`confirmed`
- **P24**: gpt-4o=`no_support`, mini=`confirmed`
- **P27**: gpt-4o=`partially_confirmed`, mini=`confirmed`
- **P29**: gpt-4o=`partially_confirmed`, mini=`confirmed`
- **P30**: gpt-4o=`partially_confirmed`, mini=`confirmed`
- **P44**: gpt-4o=`partially_confirmed`, mini=`confirmed`
- **P46**: gpt-4o=`partially_confirmed`, mini=`no_support`

## Recommendation (decision rule from spec)

1. **Mini vs GT (valid mini only):** 87.23%.
2. **gpt-4o labels vs GT (this file):** 87.23% (locked sheet reference: **87.23%**, 41/47).
3. **Serious conflict slips:** 3 pair(s) where GT is `conflicting` but mini is `no_support` or `confirmed`.
4. **Schema failures (after retry):** 0.
5. **Valid mini responses:** 47/47.

**EXPAND THE EVAL** — mini is in a borderline band (~≥80%) or disagreements look like framing/partial vs confirmed noise; widen drafts and pair count before switching.

## Cost model note

Per-pair usage is summed from OpenAI `usage` on each completion. Update `MINI_INPUT_USD_PER_1M` / `MINI_OUTPUT_USD_PER_1M` in `run_eval.mjs` when OpenAI pricing changes, then re-run to refresh dollars.
