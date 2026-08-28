# Can house style leave the prompt, and is caching actually working

Cost: **2 cents**, two live calls for the cache probe. The Part 2
classification and the arm C re-run are zero model calls.

---

## Verdict first

**GUIDE MUST STAY.** Only 999 of the guide's 3,560 tokens (28%) can leave the
prompt. Two rules — `hyperbole_vs_qualitative` at 1,180 tokens and
`first_person_plural` at 1,137 — are **65% of the entire guide on their own**,
and both are irreducibly JUDGEMENT. Trimming everything else takes a stage 1
call from 5,427 to 4,428 tokens, which is still **2.86x** today at the median.
The cost problem does not dissolve.

**The decisive test passed, and it did not rescue the idea.** Arm C's style
violations were 2 en-dashes across 3 runs, and the existing code normalisers
fixed **2 of 2, with none surviving**. So code does catch what the missing guide
let through. But the conclusion does not follow from the premise, because the
rules code can absorb are the cheap ones. Removing every MECHANICAL and
ENFORCEABLE rule in the guide buys 999 tokens.

**Caching is not hypothetical — it is already running at 96.7%.** The live probe
sent our real reviser prompt twice: run 1 cached 0 of 6,754 tokens, run 2 cached
**6,528 of 6,754**. Cost fell from $0.01052 to $0.00315, a 70% reduction on an
identical call. efaed13 treated caching as work to be done. It is already
happening; we simply could not see it and were not billing it.

That settles the direction. **Cache the prefix, keep the guide.** Caching alone
puts stage 1 at 1.31x. Building nine deterministic normalisers on top of that
only reaches 1.13x, which is not worth the code.

---

## Part 1, capturing and billing cached tokens

### The gpt-5.1 hole

`gpt-5.1-2025-11-13` was **absent from `PRICING`**, and `calculateLlmCostUsd`
returns 0 for any unlisted model. That model backs `writing-generate`,
`writing-rewrite`, `adapt`, `ask-query` and `query-sources`. **Every reviser,
generate, adapt and ask call this project has ever costed reported exactly
zero.** Any `costUsd` field in an existing diagnostic artefact for those stages
is wrong, not merely imprecise.

Rates added, from OpenAI's published model pages (checked 28 August 2026):

| Model | Input $/M | Cached input $/M | Output $/M |
|---|---|---|---|
| gpt-5.1, gpt-5.1-2025-11-13 | 1.25 | 0.125 | 10.00 |
| gpt-5 | 1.25 | 0.125 | 10.00 |
| gpt-5-mini | 0.25 | 0.025 | 2.00 |
| gpt-4o, gpt-4o-2024-08-06 | 2.50 | 1.25 | 10.00 |
| gpt-4o-mini, gpt-4o-mini-2024-07-18 | 0.15 | 0.075 | 0.60 |

Cache reads are discounted 90% on the gpt-5 family and 50% on the 4o family.

### What changed

- `callProviderOnce` reads `prompt_tokens_details.cached_tokens` from the OpenAI
  response and returns `cachedInputTokens` and `cacheHitRate` on the usage
  object. Set `DEBUG_LLM_CACHE=1` for a per-call debug line.
- `resolveUsageForCost` treats cached tokens as a **subset** of input, not an
  addition, and clamps to the input count so a bad payload cannot produce a
  negative bill.
- `calculateLlmCostUsd` bills fresh input at `rate.input` and cached input at
  `rate.cachedInput`, falling back to the full input rate where no cached rate
  is published, so an unpriced cache read is over-reported rather than silently
  free.
- The Langfuse generation now carries `cachedInputTokens` and `cacheHitRate`.
- Anthropic usage reports zeros explicitly. No `cache_control` breakpoints were
  added, as specified.

Ten new tests in `tests/observability-cached-tokens.test.mjs`, including a guard
that every OpenAI entry publishes a `cachedInput` rate — the failure mode that
caused the gpt-5.1 hole in the first place.

### The measured hit rate

Two identical calls, the real reviser prompt, `gpt-5.1-2025-11-13`:

| Run | Input | Cached | Hit rate | Cost |
|---|---|---|---|---|
| 1 | 6,754 | 0 | 0.0% | $0.01052 |
| 2 | 6,754 | 6,528 | **96.7%** | $0.00315 |

Caching is **active today**, needs no opt-in, and delivers a 70% cost reduction
on a repeated prefix. It is not 100% because OpenAI caches in 128-token blocks
and the tail of the prompt is not cached.

Two things follow. First, wherever the pipeline sends a repeated prefix we have
been **overstating** cost — on top of gpt-5.1 reporting zero. Second, and more
usefully, the stage 1 rebuild's dependency on caching is already satisfied.

One caveat: OpenAI evicts idle cache entries after a few minutes. Stage 1 calls
for one draft run within seconds of each other, so hits are near-certain, but a
retry minutes later would pay full price.

Incidentally, the probe shows the real prompt is **6,754 tokens where chars/4
estimated 8,507** — the estimator runs about 26% high. Ratios and multipliers
throughout this work are unaffected, but absolute token counts in fc25060 and
efaed13 should be read as roughly a quarter too large.

---

## Part 2, classifying the guide

Fifteen rules, 3,560 tokens, plus a 55-token header.

### MECHANICAL — 96 tokens, already enforced

| Rule | Tokens | Enforced by |
|---|---|---|
| smart_quotes | 52 | `normalizePgHouseStyleCharacters`, pg-commentary-cleanup.mjs L14-15 |
| em_dash | 44 | `normalizePgHouseStyleCharacters`, pg-commentary-cleanup.mjs L16 |

These two run on every revision already. They are also, not coincidentally, the
only two rules arm C actually violated.

### ENFORCEABLE — 905 tokens, buildable but not built

| Rule | Tokens | What it would take |
|---|---|---|
| defined_term_capitalisation | 174 | Detect `X (the Term)` to build the defined-term set, then case-correct later bare uses. The rule's carve-outs are mechanical. |
| english_variant | 148 | British-to-US word list plus a proper-noun exclusion list ("Partners Group", "Centre Court"). |
| number_spelling | 134 | Spell out 0-12, numerals for 13+, with the listed carve-outs; each carve-out is detectable from the adjacent token. |
| oxford_comma | 124 | The rule already states the counting algorithm. Nested clauses need care. |
| percentage_notation | 98 | One regex: "per cent"/"percent" after a number becomes "%". |
| date_format | 97 | Parse the four named non-conforming shapes, re-emit DD FullMonthName YYYY. `05/26/2026` needs a locale assumption. |
| thousand_separator | 65 | Digit-group regex, skipping years and currency amounts. |
| currency_format | 65 | Symbol-to-ISO map plus magnitude-suffix expander. Finite symbol set. |

Every one is genuinely deterministic. Together they are 905 tokens, or 25% of
the guide.

### JUDGEMENT — 2,506 tokens, cannot leave the prompt

| Rule | Tokens | Why |
|---|---|---|
| hyperbole_vs_qualitative | 1,180 | The banned word list is detectable, but the required *edit* is the remaining-clause test: delete the evaluative word only if the clause still informs, otherwise keep and flag. It also forbids milder substitution, which requires knowing what a replacement would mean. |
| first_person_plural | 1,137 | Pronoun substitution is mechanical; the view-marker test is not. "In our view" is deleted when the sentence subject is already the authoring organisation and converted when it is not, which needs the grammatical subject resolved *after* substitution. Every hedge and modal must survive. |
| sentence_structure_clarity | 66 | "Favour clarity over density" has no deterministic test. |
| active_voice_preference | 64 | Conditioned on the subject being known and stating it being appropriate. |
| register_consistency | 59 | Tone consistency across a document; no surface form to match. |

**These two rules are 65% of the guide by themselves**, and they are exactly the
two that cannot be mechanised. That is the whole answer to Part 2.

It is worth noting *why* they are so long: both were expanded specifically to
stop the model laundering claims — substituting "strong" for "exceptional", or
recasting "we believe" into an agentless "is considered". Those are the failure
modes the length is buying protection against, and both are semantic.

---

## The decisive test: arm C through the real code

fc25060's three arm C raw outputs, run through `parseSoftenedMarkers`,
`applyHouseStyleCharNormalizeToRevision` and
`applyCutPunctuationNormalizeToRevision` — the real chain, in the real order.

| Run | Violations before | After code | Result |
|---|---|---|---|
| 1 | none | none | clean either way |
| 2 | en/em dash | none | **fixed** |
| 3 | en/em dash | none | **fixed** |

**2 violations found, 2 fixed, 0 survived.** All three runs normalise to the
identical, house-style-correct sentence:

> The fund intends to build a portfolio of 10-14 investments.

The test passes. But it is **weak evidence**, and it should not be read as more
than it is. Arm C's target was a single short factual sentence containing no
evaluative language and no first-person pronouns, so it had no opportunity to
violate the two rules that actually matter. It tripped the one rule already
mechanised. A fair test of "can the guide leave the prompt" would need a
statement that puts `hyperbole_vs_qualitative` and `first_person_plural` at
risk, and no such run exists.

### What this does to the cost

| | Tokens | vs today |
|---|---|---|
| Today, one whole-draft call | 8,507 | 1.00x |
| Stage 1 as designed | 5,427 | — |
| Stage 1, guide trimmed to JUDGEMENT | 4,428 | — |
| Trimmed, 5.5-statement median | 24,354 | **2.86x** |
| Trimmed, 8-statement maximum | 35,424 | 4.16x |

**GUIDE MUST STAY**, forced by `hyperbole_vs_qualitative` and
`first_person_plural`. The spec's hoped-for ~1,900-token call assumed the whole
3,560 could go; 2,506 of it cannot.

### Trimming versus caching

With the measured 96.7% hit rate and the 90% cached discount:

| Approach | Median | Maximum |
|---|---|---|
| No caching, full guide | 3.51x | 5.10x |
| **Caching, full guide** | **1.31x** | 1.69x |
| Caching + trimmed guide | 1.13x | 1.47x |

Caching does essentially all the work. Adding the ENFORCEABLE trim on top moves
the median from 1.31x to 1.13x, and the price of that 0.18x is building and
maintaining eight new deterministic normalisers — date parsing, British-to-US
spelling with proper-noun exclusions, Oxford comma insertion — each with its own
false-positive surface on the author's prose. **Not worth it.**

If any of them are built, build `percentage_notation` and `currency_format`
first: they are the simplest, and unlike the others they close real correctness
gaps rather than just saving tokens.

---

## Arm C dropped "control-oriented": which failure is that

**A separate failure of the minimal prompt, not a house style failure.** Only
the style failure is addressed here.

"Control-oriented" was confirmed material — the Review backed it, and no finding
touched it. No house style rule mentions it, and no normaliser could restore it,
because code cannot know that a word the model deleted was supposed to survive.
It is a **content-fidelity failure**: the model was told in rule (c) to "keep the
CONFIRMED portion unchanged" and did not.

That matters for the rebuild. Arm C *contained* rule (c) and still dropped
confirmed material, which means the instruction alone is insufficient — exactly
the argument for the span contract from ddf6ee8, where code constrains edits to
flagged spans and protects everything unflagged. The two failures need different
machinery: normalisers for style, span constraints for fidelity. Neither
substitutes for the other, and the arm C result should not be read as evidence
that the minimal prompt is safe.

---

## Technical summary

- **`lib/observability.js`.** Added `cachedInput` rates to every OpenAI entry and
  added the missing `gpt-5.1` / `gpt-5.1-2025-11-13` entries, which had been
  zeroing all reviser cost telemetry. `callProviderOnce` captures
  `prompt_tokens_details.cached_tokens` and returns `cachedInputTokens` plus
  `cacheHitRate`; `DEBUG_LLM_CACHE=1` logs it. `resolveUsageForCost` treats
  cached tokens as a clamped subset of input and now exports `cacheHitRate`.
  `calculateLlmCostUsd` bills fresh and cached input separately, falling back to
  the full rate where no cached rate exists. Langfuse metadata carries both new
  fields. Anthropic reports zeros; no `cache_control` added.
- **New** `tests/observability-cached-tokens.test.mjs`, 10 cases, including a
  guard that every OpenAI entry publishes a cached rate.
- **New** `scripts/diagnostic/revise/house-style-in-code.mjs` and
  `house-style-in-code.json`. Zero model calls by default; `--cache-probe` runs
  the two-call live measurement.
- Suite green, 574 tests, 34 files. No prompt changes.

## Plain-language summary

We discovered our own cost reporting was broken: the model behind the reviser
was missing from the price list, so every revision this project has run reported
as costing nothing. That is fixed, and we now also track how much of each prompt
is served from the provider's cache. Testing that revealed good news — caching is
already working at 97%, cutting the cost of a repeated call by 70% — which means
the planned per-sentence rebuild is affordable without further work. We also
checked whether the writing style guide could be moved out of the prompt and
enforced in code instead: mostly it cannot, because the two longest rules are
about judgement rather than formatting, and caching already solves the cost
problem those rules were creating.
