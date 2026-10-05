# B377. Can a model bridge the gap the matcher found

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | 6642182 | SHIP VERIFIED  6642182  main  163 files  1795 tests |
| frontend | not touched | |

Ids used: B377. No product code. `lib/` unchanged.

Browser: skipped. No visible surface.

---

## Part 1. The population

`isConflictFreePartial` returned 7 cards. That is the expected seven, in this order:

| Payload | S | displayVerdict | supportState | hasConflict | Flagged phrases | Confirmed passages | Called |
|---------|---|----------------|--------------|-------------|-----------------|--------------------|--------|
| hicl-doc | 1 | supported_partial | partial | false | 1 | 3 | yes |
| hicl-doc | 2 | supported_partial | partial | false | 1 | 1 | yes |
| hicl-clean | 6 | supported_partial | partial | false | 1 | 1 | yes |
| 3i-sep-doc | 8 | supported_partial | partial | false | 1 | 0 | no |
| 3i-sep-doc | 14 | supported_partial | partial | false | 1 | 1 | yes |
| 3i-sep-clean | 1 | supported_partial | partial | false | 0 | 1 | yes |
| 3i-oct-doc | 14 | supported_partial | partial | false | 1 | 1 | yes |

Model: `gpt-5.1-2025-11-13`. Provider: `openai`. Temperature 0. Seed 1 on every pass. `max_completion_tokens` 512.

Context sent: the statement, the flagged phrase text from `unsupportedSpans`, and `supportSpans` passages whose `classification` is `confirmed`. Nothing else. The full source document was not sent.

---

## Part 2 and Part 3. Passes and checks

Checks are the functions in `lib/revise-stage1.mjs`. `checkNoInventedFacts` received the confirmed passages joined, not the document. `checkNoSpanEntitiesKept` was called with `{ claims }` from the card. These cards have no `evidence` object, so the finding-named exception is empty. That is recorded on each pass. No new validator was written.

A refusal is not a proposal. The four checks run only when `offer` is true and `resultingSentence` is a non-empty string.

### hicl-doc S1

Statement: Across the portfolio, operational performance was robust, with average 30% EBITDA growth driven by capital expenditure, and resilient cashflow generation supporting HCIL’s dividend program.

Flagged phrase: with average 30% EBITDA growth

Confirmed passages sent: 3.

#### Pass 1

Finish reason: stop.
Offer: true.

Removed text: "average 30% "

Resulting sentence: "Across the portfolio, operational performance was robust, with EBITDA growth driven by capital expenditure, and resilient cashflow generation supporting HCIL’s dividend program."

Reason: The confirmed passages support EBITDA growth driven by capex but do not substantiate an average 30% figure.

locateSpan: pass. start 58, end 88. text "with average 30% EBITDA growth"
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

#### Pass 2

Finish reason: stop.
Offer: true.

Removed text: "average 30% "

Resulting sentence: "Across the portfolio, operational performance was robust, with EBITDA growth driven by capital expenditure, and resilient cashflow generation supporting HCIL’s dividend program."

Reason: The confirmed passages support EBITDA growth driven by capex but do not substantiate an average 30% figure.

locateSpan: pass. start 58, end 88. text "with average 30% EBITDA growth"
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

#### Pass 3

Finish reason: stop.
Offer: true.

Removed text: "average 30% "

Resulting sentence: "Across the portfolio, operational performance was robust, with EBITDA growth driven by capital expenditure, and resilient cashflow generation supporting HCIL’s dividend program."

Reason: The confirmed passages support EBITDA growth driven by capex but do not substantiate an average 30% figure.

locateSpan: pass. start 58, end 88. text "with average 30% EBITDA growth"
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

Stability: the three passes agree: an offer exists, and it is the same offer.

### hicl-doc S2

Statement: Across the portfolio, growth investments continue to perform well, with significant investment in expansion programs driving EBITDA growth that continues to significantly outperform budgets.

Flagged phrase: driving EBITDA growth that continues to significantly outperform budgets

Confirmed passages sent: 1.

#### Pass 1

Finish reason: stop.
Offer: true.

Removed text: "driving EBITDA growth that continues to significantly outperform budgets"

Resulting sentence: "Across the portfolio, growth investments continue to perform well, with significant investment in expansion programs."

Reason: The confirmed passage only supports that EBITDA is in line with expectations, not significantly outperforming budgets.

locateSpan: pass. start 117, end 189. text "driving EBITDA growth that continues to significantly outperform budgets"
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: fail. removed without being flagged: EBITDA
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

#### Pass 2

Finish reason: stop.
Offer: true.

Removed text: "driving EBITDA growth that continues to significantly outperform budgets"

Resulting sentence: "Across the portfolio, growth investments continue to perform well, with significant investment in expansion programs delivering EBITDA in line with expectations."

Reason: Replaced the flagged phrase with wording directly supported by the confirmed passage about EBITDA being in line with expectations.

locateSpan: pass. start 117, end 189. text "driving EBITDA growth that continues to significantly outperform budgets"
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

#### Pass 3

Finish reason: stop.
Offer: true.

Removed text: "driving EBITDA growth that continues to significantly outperform budgets"

Resulting sentence: "Across the portfolio, growth investments continue to perform well, with significant investment in expansion programs delivering EBITDA in line with expectations."

Reason: Replaced the flagged phrase with wording directly supported by the confirmed passage about EBITDA being in line with expectations.

locateSpan: pass. start 117, end 189. text "driving EBITDA growth that continues to significantly outperform budgets"
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

Stability: the three passes agree that an offer exists. The offers are not the same.

### hicl-clean S6

Statement: The company also recently completed an oversubscribed refinancing, which will lead to a reduction in debt servicing costs.

Flagged phrase: which will lead to a reduction in debt servicing costs

Confirmed passages sent: 1.

#### Pass 1

Finish reason: stop.
Offer: true.

Removed text: "which will lead to a reduction in debt servicing costs"

Resulting sentence: "The company also recently completed an oversubscribed refinancing, which enabled a step-down on debt margins earlier than forecast."

Reason: Replaced the unsubstantiated claim about reduced debt servicing costs with the supported description of a step-down on debt margins from the passage.

locateSpan: pass. start 67, end 121. text "which will lead to a reduction in debt servicing costs"
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

#### Pass 2

Finish reason: stop.
Offer: true.

Removed text: "which will lead to a reduction in debt servicing costs"

Resulting sentence: "The company also recently completed an oversubscribed refinancing, which enabled a step-down on debt margins earlier than forecast."

Reason: Replaced the flagged phrase with the supported description from the confirmed passage about a step-down on debt margins.

locateSpan: pass. start 67, end 121. text "which will lead to a reduction in debt servicing costs"
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

#### Pass 3

Finish reason: stop.
Offer: true.

Removed text: "which will lead to a reduction in debt servicing costs"

Resulting sentence: "The company also recently completed an oversubscribed refinancing, which enabled a step-down on debt margins earlier than forecast."

Reason: Replaced the unsubstantiated claim about reduced debt servicing costs with the supported description of a step-down on debt margins from the passage.

locateSpan: pass. start 67, end 121. text "which will lead to a reduction in debt servicing costs"
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

Stability: the three passes agree: an offer exists, and it is the same offer.

### 3i-sep-doc S8

Statement: MAIT also completed a pro-rata redemption of shares, which generated significant proceeds for 3i.

Flagged phrase: MAIT also completed a pro-rata redemption of shares, which generated significant proceeds for 3i.

Not called. no supportSpan with classification confirmed.

Stability: not called.

### 3i-sep-doc S14

Statement: Looking ahead, the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies.

Flagged phrase: the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies.

Confirmed passages sent: 1.

#### Pass 1

Finish reason: stop.
Offer: true.

Removed text: "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."

Resulting sentence: "Looking ahead, we remain cautious in the deployment of capital into new investment, but will continue to allocate selectively, including to lower-risk reinvestments in businesses we know and trust."

Reason: Replaced the flagged phrase with the confirmed passage to ensure alignment with the source text.

locateSpan: pass. start 15, end 209. text "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

#### Pass 2

Finish reason: stop.
Offer: true.

Removed text: "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."

Resulting sentence: "Looking ahead, we remain cautious in the deployment of capital into new investment, but will continue to allocate selectively, including to lower-risk reinvestments in businesses we know and trust."

Reason: Replaced the flagged phrase with the confirmed passage to align exactly with the supported wording and facts.

locateSpan: pass. start 15, end 209. text "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

#### Pass 3

Finish reason: stop.
Offer: true.

Removed text: "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."

Resulting sentence: "Looking ahead, we remain cautious in the deployment of capital into new investment, but will continue to allocate selectively, including to lower-risk reinvestments in businesses we know and trust."

Reason: Replaced the flagged phrase with the directly supported wording from the confirmed passage to avoid introducing unsupported subject and phrasing.

locateSpan: pass. start 15, end 209. text "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

Stability: the three passes agree: an offer exists, and it is the same offer.

### 3i-sep-clean S1

Statement: The private equity business generated gross investment returns of 14% for the period and accounted for the vast majority of the overall total return.

Flagged phrase: none.

Confirmed passages sent: 1.

#### Pass 1

Finish reason: stop.
Offer: false.

Removed text: ""

Resulting sentence: ""

Reason: No phrase is flagged for editing, so no repair consistent with the instructions is possible.

Checks not run. The model refused.

#### Pass 2

Finish reason: stop.
Offer: false.

Removed text: ""

Resulting sentence: ""

Reason: No phrase is flagged for editing, so no repair consistent with the instructions is possible.

Checks not run. The model refused.

#### Pass 3

Finish reason: stop.
Offer: false.

Removed text: ""

Resulting sentence: ""

Reason: No phrase is flagged for editing, so no repair consistent with the instructions is possible.

Checks not run. The model refused.

Stability: the three passes agree: no offer.

### 3i-oct-doc S14

Statement: Looking ahead, the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies.

Flagged phrase: the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies.

Confirmed passages sent: 1.

#### Pass 1

Finish reason: stop.
Offer: true.

Removed text: "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."

Resulting sentence: "Looking ahead, we remain cautious in the deployment of capital into new investment, but will continue to allocate selectively, including to lower-risk reinvestments in businesses we know and trust."

Reason: Replaced the flagged phrase with the confirmed passage text to align exactly with supported wording and facts.

locateSpan: pass. start 15, end 209. text "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

#### Pass 2

Finish reason: stop.
Offer: true.

Removed text: "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."

Resulting sentence: "Looking ahead, we remain cautious in the deployment of capital into new investment, but will continue to allocate selectively, including to lower-risk reinvestments in businesses we know and trust."

Reason: Replaced the flagged phrase with the wording from the confirmed passage to ensure factual alignment.

locateSpan: pass. start 15, end 209. text "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

#### Pass 3

Finish reason: stop.
Offer: true.

Removed text: "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."

Resulting sentence: "Looking ahead, we remain cautious in the deployment of capital into new investment, but will continue to allocate selectively, including to lower-risk reinvestments in businesses we know and trust."

Reason: Replaced the flagged phrase with the confirmed passage to ensure alignment with the source text.

locateSpan: pass. start 15, end 209. text "the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies."
checkOutsideSpanUnchanged: pass. (none)
checkNoInventedFacts: pass. (none)
checkNoSpanEntitiesKept: pass. (none)
called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.

Stability: the three passes agree: an offer exists, and it is the same offer.

---

## Cost

Rates from `getLlmPricingTable()` for `gpt-5.1-2025-11-13`: input 1.25 USD per million, cached input 0.125, output 10. List USD counts every input token at the input rate. Discounted USD is `calculateLlmCostUsd` on the recorded usage, which prices cached input at the cached rate.

Calls made: 18. Unpriced calls: 0.

List USD 0.022644. Discounted USD 0.022644.

Input tokens 5523. Cached input tokens 0. Output tokens 1574. Reasoning tokens 0.

Ceiling USD 0.15 was not crossed.

| Card | Pass | Input | Cached | Output | Reasoning | List USD |
|------|------|------:|-------:|-------:|----------:|---------:|
| hicl-doc S1 | 1 | 362 | 0 | 85 | 0 | 0.001303 |
| hicl-doc S1 | 2 | 362 | 0 | 85 | 0 | 0.001303 |
| hicl-doc S1 | 3 | 362 | 0 | 85 | 0 | 0.001303 |
| hicl-doc S2 | 1 | 277 | 0 | 77 | 0 | 0.001116 |
| hicl-doc S2 | 2 | 277 | 0 | 85 | 0 | 0.001196 |
| hicl-doc S2 | 3 | 277 | 0 | 85 | 0 | 0.001196 |
| hicl-clean S6 | 1 | 295 | 0 | 90 | 0 | 0.001269 |
| hicl-clean S6 | 2 | 295 | 0 | 84 | 0 | 0.001209 |
| hicl-clean S6 | 3 | 295 | 0 | 90 | 0 | 0.001269 |
| 3i-sep-doc S14 | 1 | 314 | 0 | 113 | 0 | 0.001522 |
| 3i-sep-doc S14 | 2 | 314 | 0 | 115 | 0 | 0.001543 |
| 3i-sep-doc S14 | 3 | 314 | 0 | 119 | 0 | 0.001583 |
| 3i-sep-clean S1 | 1 | 279 | 0 | 40 | 0 | 0.000749 |
| 3i-sep-clean S1 | 2 | 279 | 0 | 40 | 0 | 0.000749 |
| 3i-sep-clean S1 | 3 | 279 | 0 | 40 | 0 | 0.000749 |
| 3i-oct-doc S14 | 1 | 314 | 0 | 115 | 0 | 0.001543 |
| 3i-oct-doc S14 | 2 | 314 | 0 | 113 | 0 | 0.001522 |
| 3i-oct-doc S14 | 3 | 314 | 0 | 113 | 0 | 0.001522 |

---

## Technical summary

Diagnostic script `scripts/diagnostic/b377/bridge.mjs` calls `gpt-5.1-2025-11-13` three times on each conflict-free partial that has a confirmed passage, then runs `locateSpan`, `checkOutsideSpanUnchanged`, `checkNoInventedFacts`, and `checkNoSpanEntitiesKept`. No file under `lib/` changed. Population 7. Called 6. hicl-doc S1 offers 3 of 3. hicl-doc S2 offers 3 of 3. hicl-clean S6 offers 3 of 3. 3i-sep-doc S14 offers 3 of 3. 3i-sep-clean S1 offers 0 of 3. 3i-oct-doc S14 offers 3 of 3.

## Plain-language summary

Nothing in the product changed. This run asked the writing model, three times, whether it could propose a small repair on each partial card that already shows a confirmed passage, and then let the existing revision checks accept or reject that proposal. The offers are listed verbatim in this report for a separate read.
