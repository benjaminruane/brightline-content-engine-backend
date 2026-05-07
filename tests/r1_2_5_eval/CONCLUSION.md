# R1.2 Stage 2 Eval — Conclusion (R1.2.6)

**Date:** May 2026  
**Scope:** Stage 2 source matching (47-pair locked Shopify ground truth)  
**Prompt:** Stage 2 v2 system prompt (decision rule for mixed cases + Nike/Tesla example), unchanged from production.

## Candidates Evaluated

- **openai / gpt-4o** (temperature 0, v2 prompt) — baseline
- **openai / gpt-5** (temperature 1)
- **openai / gpt-5-mini** (temperature 1)
- **anthropic / claude-sonnet-4-6** (temperature 0)
- **anthropic / claude-haiku-4-5** (temperature 0)

All models were run via the unified `callLLM` wrapper, against the same 47 pairs and v2 prompt, using JSON output mode and a single retry on schema failure. Ground truth reflects the corrected conflict label for **P47**.

## Locked Headline Numbers (from `results.md`)

From `tests/r1_2_5_eval/results.md` after the P47 correction:

- **openai / gpt-4o** (temp 0):
  - Agreement vs GT: **97.87%** (46/47)
  - Conflict detection: **100%** (**5/5** GT=`conflicting`)
  - Total eval cost: **$0.4129**
  - Latency: **p50 2.6s**, **p95 5.1s**

These are the locked baseline numbers for Stage 2 v2.

## Why Non-Winning Candidates Were Rejected

Summaries below are relative to the gpt-4o baseline above, using the same `results.md` snapshot.

### openai / gpt-5 (temp 1)

- Agreement vs GT: **91.49%** — materially below baseline.
- Conflict detection: **100% (5/5)** — passes the conflict bar.
- Total eval cost: **$0.7172** — more expensive than gpt-4o.
- Latency: **p50 11.3s**, **p95 55.0s** — an order-of-magnitude slower, with a very long tail.

**Decision:** Rejected due to lower agreement, higher cost, and much worse latency tail. Even with perfect conflict detection, this does not meet the bar for Stage 2.

### openai / gpt-5-mini (temp 1)

- Agreement vs GT: **95.74%** — within the spec’s ≥95.74% threshold but ~2.1pp below gpt-4o.
- Conflict detection: **100% (5/5)** — passes the conflict bar.
- Total eval cost: **$0.1043** — meaningfully cheaper than gpt-4o.
- Latency: **p50 7.0s**, **p95 23.0s** — substantially slower than gpt-4o, especially at p95.
- Reproducibility (R1.2.5.3): multiple unstable pairs across three runs at temperature 1, including non-conflict cases; not effectively deterministic for an audit-safe Stage 2.

**Decision:** Rejected despite acceptable agreement and lower cost because (a) latency p95 is ~4× gpt-4o, and (b) reproducibility at temperature 1 is insufficient for Stage 2’s audit requirements.

### anthropic / claude-sonnet-4-6 (temp 0)

- Agreement vs GT: **89.36%** — about **−8.5pp** vs gpt-4o.
- Conflict detection: **100% (5/5)** — passes the conflict bar.
- Total eval cost: **$0.7067** — roughly **+71%** higher cost than gpt-4o on this eval.
- Latency: **p50 4.0s**, **p95 6.4s** — acceptable but not enough to compensate for the agreement/cost gap.

**Decision:** Rejected due to significantly lower agreement and notably higher cost. There is no offsetting latency advantage.

### anthropic / claude-haiku-4-5 (temp 0)

- Agreement vs GT: **89.36%** — well below gpt-4o.
- Conflict detection: **60% (3/5)** — **two conflict slips** on GT=`conflicting` pairs (`P27`, `P47`).
- Total eval cost: **$0.2346** — cheaper than gpt-4o, but not enough to compensate for conflict failures.
- Latency: **p50 2.4s**, **p95 4.6s** — fast, but again overshadowed by conflict errors.

**Decision:** Hard fail. Any Stage 2 candidate must hit 5/5 conflicts on this lock; two misses are unacceptable regardless of cost and latency.

## Decision

**Stage 2 remains on: `openai / gpt-4o` + Stage 2 v2 prompt.**

- Meets the hard conflict requirement (5/5 GT-conflicting pairs).
- Highest agreement vs GT on the lock.
- Cost and latency are both acceptable and well-characterised.
- Prompt v2 has already been adopted in production (R1.2.3); this eval confirms gpt-4o remains the right model pairing.

No production model change is recommended at the end of the R1.2 sprint.

## When to Re-Evaluate

Re-run an equivalent cross-provider Stage 2 eval when **either** of the following becomes true:

1. **New OpenAI reasoning models (gpt-5 family):**
   - A new gpt-5 or gpt-5-mini variant (or successor) is released that:
     - materially reduces latency (especially p95), **and**
     - is expected to maintain or improve agreement vs GT at a comparable or lower cost.

2. **New Anthropic Sonnet/Haiku models:**
   - A new Claude Sonnet or Haiku release that:
     - materially closes the agreement gap vs gpt-4o on evidence-based tasks, **and**
     - retains or improves cost/latency characteristics.

When re-evaluating, reuse:

- The locked 47-pair fixture (or an expanded successor set);  
- The Stage 2 v2 prompt;  
- The multi-provider harness in `tests/r1_2_5_eval` (plus any successor scripts);  
- A reproducibility check for any non–temperature-0 reasoning candidate.
