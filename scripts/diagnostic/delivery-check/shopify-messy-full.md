# First end-to-end Review of a real document

MEASUREMENT RUN. No production-path change. No fix. HEAD at start: `8b73438`.

Draft: full extractor output of `scripts/diagnostic/r7-samples/Shopify_text_longform_messy.pdf`, 22163 characters, 3698 words. Source: extractor output of `scripts/diagnostic/r7-samples/B1_shopify_source_1_7m.pdf` (officeparser; identical 83 characters from the companion `.docx`). All three checks on. Cache off. `outputType=reporting_commentary`, `requiredVersion=complete`, authoring organisation Halden Group.

Fixture: `tests/fixtures/b247/shopify-messy-full.json`. Trace `409b791c-56ee-434a-bc2e-fa9f1c9c219b`.

B1 is the pack's companion source, not a supporting IC pack. It is two lines. A same-length source was not used: Stage 2 token add from a 22k source is a few dollars on top of this run, but Stage 5 already failed open on 184 parallel calls, and wall clock already missed 60 seconds. Substituting a longer source would have changed the reader-facing file and the clock. The pair that was run is named below.

---

## 1. COST

| | |
|--|--|
| USD | **10.3994** |
| Generations | **791** |
| Priced | 607 |
| Unpriced | **184** |
| Unpriced models | `gpt-4o-2024-08-06` |
| Per statement | **0.0565** (10.3994 / 184 cards) |
| Per thousand words | **2.81** (10.3994 / 3.698) |
| Source of the figure | Langfuse generation `calculatedTotalCost` summed across paginated observations on trace `409b791c-56ee-434a-bc2e-fa9f1c9c219b`. Same number as trace `totalCost` (10.399386749933). |

Generations by name: Stage 1 1, Stage 1b 1, Stage 2 match 192, widened 27, editorial-style 184, compliance 184, Stage 5 commentary 184, editorial-duplication-judge 18. Models: 773× `gpt-4o-2024-08-06`, 18× `gpt-4o-mini-2024-07-18`.

The 184 unpriced generations are the 184 Stage 5 commentary calls. They exist on the trace and cost zero. That is an undercount of what a successful Stage 5 would have billed, never a silent zero. Prefix Part 5 was 0.0561 per card with working commentary; this run's priced remainder is the same unit cost because Stage 5 contributed nothing.

Budget was USD 15. This is under. The document was not trimmed.

---

## 2. WALL CLOCK

Total pipeline `wallMs` **61170** (61.17 seconds). Process elapsed 63276 ms including fixture write.

Stamps from the captured log (ISO):

| Stage | When | Duration |
|-------|------|----------|
| start | 10:37:25.841Z | |
| Stage 1 drop log | 10:38:01.010Z | **35.2 s** |
| Stage 2 first / last fingerprint | 10:38:02.001Z / ~10:38:12 | **~10 s** |
| Stage 1b fallback | 10:38:12.221Z | ~1 s |
| Stage 6 editorial start / last FIDELITY_DROP | 10:38:14.299Z / 10:38:23.543Z | **~9 s** |
| Stage 5 + assembly to wall end | after editorial, wall 61.17 s | **~4 s** |

No per-LLM-stage timeout fired. Extraction was already done (officeparser, under the 60 s extract cap). `lib/qc/llm-claim-extraction.mjs` 30 s timeout is not on the v4 path.

**This would not survive the 60-second production limit** (`vercel.json` `"api/*.js": { "maxDuration": 60 }`). It missed by 1.17 seconds with Stage 5 already fail-open. A working Stage 5 on 184 cards would miss by more.

What size still survives:

- Recovered prefix (2001 chars, 17 cards, self-source) was about 12 seconds. Survives.
- This memo (22163 chars, 184 cards, 83-char source) is 61.17 seconds. Does not.
- Stage 1 is one call and took 35.2 seconds of the 61. The cliff is this size, not a much larger one. A same-length source would add Stage 2 time on top. Roughly: under about 17 cards / 2k chars is fine; at about 3700 words / 180 cards / 22k chars, with one short source, production already dies. Do not interpolate as if Stage 1 were free.

Stage 2 filled `STAGE2_CONCURRENCY=24` (184 jobs). That pool is no longer unproven (**P10**). It was not the timeout. Stage 1 was.

---

## 3. SPLITTING (B249 exhibit on a real document)

Naive sentence split of the extract: 191. Stage 1 source: `llm`.

| | |
|--|--|
| LLM statements before `isClaim` filter | 218 (184 kept + 34 dropped) |
| Statements out (cards) | **184** |
| Dropped as not-a-claim | **34** (log: `[stage1] dropped 34 non-claim statement(s) (salutations/closings/transitions)`) |
| Uncovered draft regions | **21** (adjacent non-claims merge) |
| Uncovered characters | 1275 / 22163 = 5.8% |

The 34 individual pre-filter texts are not on the payload (the filter drops them before `stage1.statements`). The 21 uncovered regions are the B249 exhibit: draft bytes that never became a card. Verbatim:

```
Shopify — Long-form memo
Shopify
To: BVP Group
From: Alex Ferrara, Trevor Oelschig
```

```
Re: Shopify
```

```
Why?
```

```
Market Opportunity
Shopify plays into two themes:
```

```
Customers & Pricing
```

```
Product
```

```
* Customize storefront n s look & feel.
```

```
* Organize and manage products.
```

```
* Perform basic inventory management.
* Accept credit card payments through payment gateways.
* Track and respond to orders.
```

```
Some examples:
```

```
Customer Acquisition & Retention
```

```
Market Opportunity
```

```
Competition
```

```
Team
```

```
Is this first-time founder capable of recruiting top talent and growing a team that scales with
the company? Carrying out their vision while running a business?
```

```
Summary Financials
```

```
Summary P&L
Deal
```

```
Outcomes Analysis
```

```
Conclusion
```

```
Appendix
Consumerization of Enterprise Software Roadmap
```

```
Because barriers-to-entry are low and customer churn can be high, we believe that breakout
companies will have the following characteristics:
* Product categories with well-known and well-defined pain points and a natural stickiness
* Companies achieving strong growth with limited marketing spend
* Companies with good customer acquisition economics, even if still early
* Companies beginning to build a brand and scale relative to competitors
* Teams with a strong product design sense and consumer Internet DNA
```

Headers, section titles, bullets, `Why?`, the founder questions, and the appendix list are gone. `Date: October 12, 2010` was kept and reviewed. No user-visible report of the 34 drops.

---

## 4. DECOMPOSITION

Claude's advance expectation: about 179 of 191 get no claim spans.

| | |
|--|--|
| Cards | 184 |
| `isCompoundCandidate` true | **4** |
| Cards with claim spans (`decomposed` / `claims.length >= 2`) | **3** |
| Hit `MAX_DECOMPOSED_SENTENCES=12` | **0** |
| Stage 1b fallbacks | 1 (`statementIndex=105`, `llm_missing_sentence`) |

181 of 184 got none (98.4%). The expectation was right on the shape: almost none. Naive 191 vs 184 cards is the Stage 1 filter, not 1b.

What that means for the sources drawer: on this real memo the drawer almost never has inner claim spans to highlight. It is whole-sentence matching, or nothing. The 12-sentence cap is not why. The pre-filter is. The three decomposed sentences still each got one card; inner claims were matched against the 83-char stub and did not change the parent path in a way a reviewer could use.

---

## 5. FIDELITY

Same checks as the fidelity pass, on this payload.

### Part 1. Card statement vs draft

A1: **184 exact / 0 whitespace / 0 punctuation / 0 wording.** Inexact cases: none.

Exact here means the card equals `draft.slice(charStart, charEnd)`, including mid-sentence hard line breaks from the extractor. Same as the prefix. The PDF sentence was one line. The card shows two. **B257**, **B258** (`n s` on 21 cards).

### Part 2. Quoted passages vs source

B1, counting every `primaryExcerpt` string and every `supportSpans[].passage`:

| | exact | whitespace | punctuation | wording |
|--|-------|------------|-------------|---------|
| Offsets treated as missing when null, then `source.includes(passage)` | **33** | 0 | 0 | 0 |
| Naive slice at `Number(null)===0` (the prefix analyser) | 7 | 0 | 0 | 26 |

The 26 "wording" hits from the prefix method are the same stub sentence with `primaryExcerptStart/End` null. The passage string is exactly `The firm is evaluating an investment of up to $7,000,000.`, which is the whole source after the title. Not a wording change. Offsets are missing.

Quotes total 33. 26 are that stub sentence as `primaryExcerpt` with no offsets. 7 are locatable.

B2 card quote vs drawer highlight (`supportSpans` start/end into `sources[].text`):

| exact | whitespace | wording | no locatable span | no card quote |
|-------|------------|---------|-------------------|---------------|
| 6 | 0 | 0 | **20** | **158** |

178 of 184 cards have no drawer highlight. The 20 no-span cards still show the stub sentence on the card.

Inexact / empty-drawer cases, cap 10, verbatim (all the same passage):

| card | |
|------|--|
| 4, 11, 12, 13, 15, 39, 55, 57, 58, 60 | card quote `The firm is evaluating an investment of up to $7,000,000.` / drawer none |

---

## 6. WHAT THE READER SEES

Readiness: **Needs significant work**

Quality summary bullets (max 3):

- 157 claims have no source behind them. Remove them or find supporting evidence before this draft is final.
- 26 claims conflict with the cited sources. Reconcile the contradictions before this draft is final.
- 1 claim has only partial support from the cited sources. Strengthen the evidence where you can.

Counts from `summariseReview`: statements 184; evidence confirmed 0, partial 1, conflicting 26, notSupported 157; editorial concerns 134; compliance concerns 1; notChecked 0; needsAttention 184.

Display-verdict histogram: `not_supported` 157, `conflict` 26, `supported_partial` 1.

First 40 lines of the synthesized export (same QRS + statement-review printers as `api/export.js`; PDF/DOCX have no line-oriented golden). Verbatim:

```
Reporting commentary
Output type: Reporting commentary
Required version: Complete
2026-09-19T10:38:27.370Z  |  3698 words  |  22163 characters
Sources used
B1_shopify_source_1_7m.pdf
• File type: PDF
Quality review summary
Needs significant work
157 claims have no source behind them. Remove them or find supporting evidence before this draft is final.
26 claims conflict with the cited sources. Reconcile the contradictions before this draft is final.
1 claim has only partial support from the cited sources. Strengthen the evidence where you can.
Statement review
"Date: October 12, 2010"
Verdict: Conflicting (high evidence concern)
Evidence finding: Verdict: conflicting. Specific commentary is unavailable from the system; please reconcile the contradiction or remove the claim.
Excerpt: "The firm is evaluating an investment of up to $7,000,000."
Editorial note: The date 'October 12, 2010' uses the US date format, which is not the required format for this document type.
Compliance note: No compliance concerns identified under the listed rules.
"We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider
of e-commerce software to SMBs."
Verdict: Partially confirmed (moderate evidence concern)
Evidence finding: Verdict: partially confirmed. Specific commentary is unavailable from the system; please review the source and adjust the statement to match the source language.
Editorial note: (i) The statement uses first-person plural 'We seek approval', which is not appropriate for reporting commentary that requires third-person voice. (ii) The statement uses first-person plural 'We seek approval', which is not acceptable in reporting commentary. The statement uses '$7mm' for currency, which should be written with the ISO code before the amount.
Compliance note: No compliance concerns identified under the listed rules.
"Shopify sells a simple SaaS solution that enables a business to
quickly setup and run an online retail store."
Verdict: No support (high evidence concern)
Evidence finding: Verdict: not supported. Specific commentary is unavailable from the system; add a supporting source or remove the claim.
Editorial note: The phrase 'enables a business to quickly setup and run an online retail store' uses passive voice, which can obscure the subject. An active voice construction would be clearer.
Compliance note: No compliance concerns identified under the listed rules.
"A typical customer signs up using their credit
card and is up and running in a few hours with no long-term contract."
Verdict: No support (high evidence concern)
Evidence finding: Verdict: not supported. Specific commentary is unavailable from the system; add a supporting source or remove the claim.
Editorial note: The statement 'A typical customer signs up using their credit card and is up and running in a few hours with no long-term contract' does not add meaningful information beyond what is already provided in the surrounding context about Shopify's ease of use and target customers.
Compliance note: No compliance concerns identified under the listed rules.
"Shopify targets SMBs and
at-home capitalists (e.g., eBay and Etsy sellers) who pay an average of $45 per month, with the
goal of servicing these customers as they scale to become larger customers with more
```

Every one of 184 evidence findings is the Stage 5 canned line. Editorial notes are real. Compliance is almost all clean (1 concern).

Browser skipped: no UI change, local `runPipelineV4` plus export printers, not a screen.

---

## 7. ANYTHING THAT SURPRISED

1. Stage 5 died on the whole document. 184/184 canned. Integrity's three short drafts never saw **B254**. Here it is the entire evidence-finding column. The catch logs nothing. Langfuse still records 184 generations at cost 0. A reviewer reads "Specific commentary is unavailable from the system" 184 times and can think that is the check.
2. Wall clock missed production by 1.17 seconds, and Stage 1 alone was 35 seconds. The 60-second cap is already too tight for this memo. Stage 2's pool of 24 was fine.
3. 34 silent non-claim drops on a real memo, not one cover-note sentence. Section titles, bullets, `Why?`, and a five-bullet appendix thesis never became cards. **B249** at document scale.
4. `Date: October 12, 2010` is Conflicting, excerpt the $7m stub sentence. Twenty-six cards reuse that sentence as the quote, including claims that are not about the cheque.
5. Decomposition expectation was right. The sources drawer on a real memo almost never has claim spans. The 12-cap did not fire.
6. Per-card priced cost matched the 17-card prefix to four cents in a thousand, because Stage 5 billed nothing. The launch unit cost for a working commentary path is the prefix number (about USD 0.056 per card, about USD 2.81 per thousand words at this density) plus Stage 5, not this run's 10.40 as a ceiling.

No code was changed.
