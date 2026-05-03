# R1.2.2 — Stage 2 prompt v1 vs v2 (conflict focus)

Generated: 2026-05-03T05:03:25.755Z

## Q1 & Q2 (executive)

**Q1:** Does prompt tightening fix gpt-4o’s hedging on conflicts (partially_confirmed where GT is conflicting)?

**Q2:** Does prompt tightening fix gpt-4o-mini’s false `confirmed` on GT-conflicting pairs?

See **Conflict detection** and **Conflict slips** below per combination.

## Agreement vs ground truth (47 pairs)

_gpt-4o + v1 uses locked `gpt4o_classification` in `inputs.json` (no stored passage or explanation)._

- **gpt-4o + v1:** 87.23% (41/47; invalid or missing predictions count as disagreements)
- **gpt-4o-mini + v1:** 87.23% (41/47; invalid or missing predictions count as disagreements)
- **gpt-4o + v2:** 97.87% (46/47; invalid or missing predictions count as disagreements)
- **gpt-4o-mini + v2:** 87.23% (41/47; invalid or missing predictions count as disagreements)

## Conflict detection rate

_Definition:_ (pairs with GT = `conflicting` and prediction = `conflicting`) / (total pairs with GT = `conflicting`).

- **gpt-4o + v1:** **25.0%** (1/4 GT-conflicting pairs)
- **gpt-4o-mini + v1:** **25.0%** (1/4 GT-conflicting pairs)
- **gpt-4o + v2:** **100.0%** (4/4 GT-conflicting pairs)
- **gpt-4o-mini + v2:** **50.0%** (2/4 GT-conflicting pairs)

## Per-combination cost & latency

- **gpt-4o + v1:** ~$0.0000 USD (usage × list rates in script), latency sum 0 ms
- **gpt-4o-mini + v1:** ~$0.0232 USD (usage × list rates in script), latency sum 89144 ms
- **gpt-4o + v2:** ~$0.8109 USD (usage × list rates in script), latency sum 61152 ms
- **gpt-4o-mini + v2:** ~$0.0249 USD (usage × list rates in script), latency sum 168686 ms

## Confusion matrices (rows = GT, cols = pred)

### gpt-4o + v1

| GT \ Pred | confirmed | partially_confirmed | conflicting | no_support |
| --- | --- | --- | --- | --- |
| **confirmed** | 16 | 3 | 0 | 0 |
| **partially_confirmed** | 0 | 1 | 0 | 0 |
| **conflicting** | 0 | 3 | 1 | 0 |
| **no_support** | 0 | 0 | 0 | 23 |

### gpt-4o-mini + v1

| GT \ Pred | confirmed | partially_confirmed | conflicting | no_support |
| --- | --- | --- | --- | --- |
| **confirmed** | 18 | 1 | 0 | 0 |
| **partially_confirmed** | 0 | 0 | 0 | 1 |
| **conflicting** | 3 | 0 | 1 | 0 |
| **no_support** | 1 | 0 | 0 | 22 |

### gpt-4o + v2

| GT \ Pred | confirmed | partially_confirmed | conflicting | no_support |
| --- | --- | --- | --- | --- |
| **confirmed** | 19 | 0 | 0 | 0 |
| **partially_confirmed** | 1 | 0 | 0 | 0 |
| **conflicting** | 0 | 0 | 4 | 0 |
| **no_support** | 0 | 0 | 0 | 23 |

### gpt-4o-mini + v2

| GT \ Pred | confirmed | partially_confirmed | conflicting | no_support |
| --- | --- | --- | --- | --- |
| **confirmed** | 16 | 3 | 0 | 0 |
| **partially_confirmed** | 1 | 0 | 0 | 0 |
| **conflicting** | 1 | 1 | 2 | 0 |
| **no_support** | 0 | 0 | 0 | 23 |

## Conflict slips (GT = conflicting, prediction ≠ conflicting)

### gpt-4o + v1

- **P04**: GT=`conflicting`, predicted=`partially_confirmed` — — (locked `gpt4o_classification` in inputs.json; no stored passage/explanation for v1 API runs.)
- **P27**: GT=`conflicting`, predicted=`partially_confirmed` — — (locked `gpt4o_classification` in inputs.json; no stored passage/explanation for v1 API runs.)
- **P30**: GT=`conflicting`, predicted=`partially_confirmed` — — (locked `gpt4o_classification` in inputs.json; no stored passage/explanation for v1 API runs.)

### gpt-4o-mini + v1

- **P04**: GT=`conflicting`, predicted=`confirmed` — The source explicitly states that Shopify has signed up large businesses, including Pixar, confirming the statement.
- **P27**: GT=`conflicting`, predicted=`confirmed` — The source explicitly states that the annualized gross merchandise value transacted across Shopify-powered stores is approximately $132 million, confirming the statement.
- **P30**: GT=`conflicting`, predicted=`confirmed` — The source confirms the existence and functionality of the 'App Store' as described in the statement, detailing how it allows customers to enhance their online stores.

### gpt-4o + v2

_None._

### gpt-4o-mini + v2

- **P27**: GT=`conflicting`, predicted=`confirmed` — The source confirms that the annualized gross merchandise value transacted across Shopify's platform is approximately $132 million, directly supporting the statement.
- **P30**: GT=`conflicting`, predicted=`partially_confirmed` — The source confirms that the App Store was launched a year ago and that roughly two-thirds of customers use at least one app. However, it contradicts the claim that the App Store now hosts over 100 applications, stating instead that it has over 54 applications.

## Recommendation matrix

| Model | v1 conflict rate | v2 conflict rate | v1 agreement | v2 agreement | Verdict |
| --- | --- | --- | --- | --- | --- |
| gpt-4o | 25.0% (1/4) | 100.0% (4/4) | 87.23% | 97.87% | Candidate v2 |
| gpt-4o-mini | 25.0% (1/4) | 50.0% (2/4) | 87.23% | 87.23% | Improved |

### Decision summary

**Recommend gpt-4o + prompt v2 for Stage 2 in the rebuild** — rule (a): 4/4 conflict detection on gpt-4o and agreement within −2pp of gpt-4o v1.

_Rules:_ (a) 4/4 conflicts on either model with agreement within −2pp of that model’s v1 → recommend that model + v2. (b) If mini satisfies (a), prefer mini + v2 (cost). (c) Improvement but not 4/4 → EXPAND. (d) Clear regression on conflict detection → KEEP v1 + gpt-4o and investigate.
