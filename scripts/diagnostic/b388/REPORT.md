# B388. A tuned whole-draft model review, scored on precision

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  b7ec0b9  main  166 files  1817 tests` |
| Cost | USD 1.6351 discounted across 56 calls. Ceiling USD 15. Not crossed. One earlier fixture 04 call timed out and was not metered. |
| Model | `gpt-5.1-2025-11-13`, temperature 0, seed 1, cache off. Same pin as B381. |
| Split | Tune: accuracy fixtures 01 to 10. Held-out, scored once: fixtures 11 to 20, the four doctored drafts, the four clean drafts. Two held-out passes. The prompt was not changed after the first held-out call. |
| Evidence | `scripts/diagnostic/b388/runs/tune-v1/cards.json`, `tune-final/cards.json`, `held-1/cards.json`, `held-2/cards.json`, `score-summary.json`, `score-stdout.txt`. |

## 1. Clean false flags

Both passes flagged 17 of 38 clean statements. Anything other than `supported_full` counts as a flag. On each pass, 9 of the 17 are wrong and 8 name a real discrepancy in the author's own clean draft. The membership moves. The counts do not.

The pipeline's stored cards on these same four documents are not `supported_full` on 12 of 38: 9 partial or conflict, and 3 unverifiable (3i clean statements 6, 7 and 10). B387's best-match arm flagged 38 of 38. B381 was not run on these clean drafts, so there is no B381 clean number to beat.

### Wrong flags

These nine are the precision failure. The source supports the sentence. The comment objects to a paraphrase, a joined fact, a dropped figure, or a plainer verb.

3i clean statement 1, both passes, `supported_partial`. "The private equity business generated gross investment returns of 14% for the period and accounted for the vast majority of the overall total return."

> The 14% gross investment return for the Private Equity business is supported. However, the assertion that it "accounted for the vast majority of the overall total return" is not stated in the source; while it is plausibly inferable from the numbers, the document does not explicitly characterise it this way.

Private equity gross investment return is £3,234 million. Total return is £3,291 million. That is the vast majority. The phrase is a paraphrase of the figures.

3i clean statement 2, pass 1 only, `supported_partial`. Pass 2 left it `supported_full`. "This was driven largely by Action, which continues to trade strongly."

> The claim that Action "continues to trade strongly" is supported. The specific causal wording that the Private Equity return "was driven largely by Action" is not explicitly stated, although the source notes strong performance at Action and a large value uplift; this causal dominance is an inference, not directly supported.

The source says Action's performance supported value growth of £2,118 million. Pass 2 agreed the sentence is supported.

3i clean statement 8, pass 1 only, `supported_partial`. Pass 2 left it. "Action also completed a pro-rata redemption of shares, which generated significant proceeds for 3i."

> The pro-rata redemption of shares and the fact that it returned proceeds to 3i are supported. The description of the proceeds as "significant" is interpretive but reasonable. However, the source quantifies the proceeds as £944m; the draft omits this figure but does not contradict it, so the only unsupported element is the qualitative "significant", which is an interpretation rather than a factual claim.

The comment says the figure was omitted and not contradicted. Omission is not a defect. £944 million is significant.

3i clean statement 12, both passes, `supported_partial`. "Performance was driven primarily by share price gains at 3i Infrastructure plc, which continues to report positive performance across its portfolio, including meaningful gains on its investment in TCR."

> The first part is supported: performance was driven primarily by a 14% increase in 3iN's share price. The source also says 3iN's underlying portfolio continues to perform well and notes a significant valuation uplift in TCR. However, the wording "continues to report positive performance across its portfolio" is not used in the source, and "meaningful gains" is a paraphrase of "significant valuation uplift". The overall sense is broadly aligned but some phrasing goes beyond the text, so this is best treated as partially supported.

The comment names the paraphrase and then flags it. The source's words are "continues to perform well" and "a significant valuation uplift in TCR."

3i clean statement 13, pass 2 only, `supported_partial`. "In light of the overall good performance of the portfolio, 3i declared a dividend of GBP 0.365 per share, which will be paid in January 2026."

> The dividend amount (36.5p = £0.365) and payment timing (January 2026) are supported. However, the source does not state that the dividend was declared 'in light of the overall good performance of the portfolio'; that causal framing is not in the document.

The amount and the date match. The opening clause is framing. The CEO's comment in the same source calls the half "very good."

HICL clean statement 6, both passes, `supported_partial`. "The company also recently completed an oversubscribed refinancing, which will lead to a reduction in debt servicing costs."

> The source confirms that Fortysouth completed an accretive refinancing that was about 30% oversubscribed and that this enabled a step-down in debt margins earlier than forecast. The draft's "oversubscribed refinancing" is supported. However, the explicit claim that this "will lead to a reduction in debt servicing costs" is an inference; the source does not state this outcome, even if it is economically plausible.

A step-down in the debt margin is a reduction in the cost of servicing that debt.

HICL clean statement 7, both passes, `supported_partial`. "Meanwhile, Affinity Water appointed a new CEO with significant sector experience and stands to benefit from the UK government's recently published white paper on water sector reform."

> The appointment of a new CEO with significant sector experience is fully supported. The source also notes that many recommendations in the white paper are expected to be beneficial for strong performers such as Affinity Water. However, the phrase "stands to benefit" slightly overstates this by implying a more definite outcome than the source's more conditional "many of which are expected to be beneficial," so that part is not strictly supported.

That is a hedge the prompt told the model not to flag.

GPI clean statement 1, both passes, `supported_partial`. "The company currently operates three facilities in Malaysia, two in Vietnam, and one in Thailand, alongside two other plants in the UK and one plant in China, which will now focus primarily on the European and Asian markets."

> The source confirms three facilities in Malaysia, two in Vietnam, one in Thailand, and two plants in the UK, and that the China facility will now focus primarily on European and Asian markets. However, the source does not state that there is only "one plant in China"; it refers generically to "its China facility" without specifying the number of plants. The count of one plant in China is therefore not supported.

"Its China facility" is one facility. B386 already recorded the pipeline's flag on this sentence as false.

ClearPoint clean statement 1, both passes, `supported_partial`. "The company delivered 43% year-on-year growth in revenue to USD 12.1 million, driven by an expansion of the activated installed base to more than 175 global centers and ongoing integration of the recently-acquired IRRAflow product portfolio."

> The source states Q1 2026 revenue of $12.1 million and 43% overall growth versus Q1 2025, which is year-on-year growth.
> The source lists revenue growth, installed base size, and IRRAflow integration as separate highlights but does not state that the 43% revenue growth was driven by the installed base expansion and integration. The causal wording "driven by" is not supported.

All three facts are in the source. The frozen prompt says two facts the source states separately may be stated in one sentence.

ClearPoint clean statement 3, both passes, `supported_partial`. "Topline growth was driven by the neurosurgery navigation, therapy and access division, which achieved an 80% increase in revenue to USD 5.9 million, benefitting from contributions from the IRRAflow product line and the 3.0 operating room navigation software."

> The 80% increase to $5.9 million is supported. However, the assertion that overall topline growth was driven by this division is not explicitly stated in the source; it is an inference, so only the quantitative part is confirmed.
> The source explicitly attributes the increase in this revenue line to IRRAflow product sales and the 3.0 operating room navigation software.

The line went from $3.3 million to $5.9 million inside a quarter whose revenue was $12.1 million. The source says that line's increase is driven by IRRAflow and the 3.0 software. The comment confirms the numbers and flags the join.

ClearPoint clean statement 9, pass 2 only, `supported_partial`. "The company provided updated revenue guidance of USD 52-56 million for 2026."

> The range $52-56 million is correct, but the source does not say this guidance was 'updated'; it simply presents the estimate. The 'updated' characterization is not supported.

The source says the company estimates 2026 revenue between $52.0 million and $56.0 million. The range and the year match. B386 G14 records the pipeline's conflict on this sentence as a false flag from reading the hyphen as 52 and then 56,000,000. The model's flag is the word "updated."

### Real discrepancies

These eight are in the author's clean draft. Counting them as false flags would hide that.

3i clean statement 0, both passes, `conflict`. "3i Group delivered a total return of GBP 3.3 billion for the six months to 30 June 2025, representing a 13% return on opening shareholders funds."

> The figures for total return (£3,291m, i.e. c. £3.3bn) and 13% on opening shareholders' funds are correct, but the period is wrong. The source clearly states the period is the six months to 30 September 2025 (first half of FY2026), not to 30 June 2025.

The source headline is the six months to 30 September 2025. The clean draft says 30 June 2025.

3i clean statement 5, both passes, `supported_partial`. "Net sales for the nine months to 28 September 2025 amounted to EUR 11.2 billion, with like-for-like sales growth of 6.3%."

> The figures for net sales (€11,229m, about €11.2bn) and LFL growth of 6.3% and the end date 28 September 2025 are correct. However, the source describes "nine reporting periods" (P9), not "nine months"; equating reporting periods with months is not supported.

The source says nine reporting periods ending on 28 September 2025, labelled P9. It does not say nine months.

3i clean statement 6, pass 1 only, `supported_partial`. Pass 2 left it. "Meanwhile, Action successfully completed several balance sheet transactions in October 2025."

> The timing (October 2025) and the fact that Action completed transactions successfully are supported. The source specifies "two financing transactions"; describing them as "several balance sheet transactions" changes both the number (two vs. several) and the characterisation (financing vs. balance sheet), so that part is not supported.

The source says two financing transactions.

3i clean statement 7, pass 2 only, `supported_partial`. "The company repriced EUR 3.1 billion of existing term debt, extending maturities and generating meaningful annual interest cost savings, while also raising an incremental EUR 1.6 billion of new term loan."

> The amounts (€1.6bn incremental term loan and €3.1bn repriced term loan), the repricing, extension of maturities, and annual interest cost savings are supported. However, the source specifies that only 'a portion' of the debt's maturity was extended, whereas the claim implies the entire €3.1bn had maturities extended. That part is not supported.

The source says the repricing extended the maturity of a portion of the debt.

3i clean statement 11, both passes, `supported_partial`. "On the infrastructure side, gross investment returns stood at 9% for the period, outperforming expectations for the six-month period."

> The 9% gross investment return for Infrastructure is supported. However, the claim that this "outperformed expectations" conflates two points: the source says the infrastructure asset portfolio within 3iN outperformed its expected returns, not that the 3i Infrastructure business's 9% GIR itself outperformed expectations. That extension is not supported.

The 9% is the infrastructure business. The outperformance sentence is about the asset portfolio inside 3iN.

HICL clean statement 1, both passes, `supported_partial`. The sentence says "HCIL's dividend program."

> The source confirms robust operational performance, capex programmes driving EBITDA growth, and resilient cash generation supporting the dividend (via dividend cash cover). However, the statement contains a typo/misnaming: "HCIL's dividend program" is not supported; the company is HICL. The rest of the claim is supported, so the verdict is partially_confirmed.

The clean draft spells the company HCIL. The source is HICL.

HICL clean statement 2, both passes, `supported_partial`. "Across the portfolio, growth investments continue to perform well, with significant investment in expansion programs driving EBITDA growth that continues to perform in line with budgets."

> The source confirms that growth investments continue to perform well, that significant expansion capex programmes are being progressed, and that EBITDA is in line with expectations. The draft's reference to "across the portfolio" slightly overgeneralises, but the main issue is the phrase "in line with budgets," which is not mentioned in the source. Expectations are not explicitly equated with budgets, so that part is not supported.

The source says EBITDA in line with expectations. The draft says budgets.

HICL clean statement 5, both passes, `supported_partial`. Fortysouth "expected to support continued growth in EBITDA and valuation gains."

> The source confirms delivery of 16 new towers, active progression of incremental co-location opportunities, and that both are expected to support continued EBITDA growth in line with valuation assumptions. However, the statement adds "and valuation gains," which is not stated in the source. That additional element is not supported.

The source says "in line with HICL's valuation assumption." It does not say valuation gains.

GPI clean statement 3, both passes, `supported_partial`. "Meanwhile, Gold Peak Technology (parent of GP Industries) is planning an investment program in Johor, Malaysia, to produce next-generation batteries to support data centres."

> The source confirms that Gold Peak Technology Group is the parent (86.18% owner) of GP Industries and is planning a multi-million-dollar investment in Johor to produce next-generation battery to support data centres. However, the draft adds that Johor is in Malaysia, which is not stated in the source document. The investment "program" wording is an acceptable paraphrase of "multi-million-dollar investment." The geographic specification "Malaysia" is not supported by the source.

Johor is in the source. Malaysia is not. The flag is an added place name, not a contradiction of a stated country.

## 2. Held-out catch and leave-alone

Scored by `scripts/diagnostic/accuracy/score.mjs` on fixtures 11 to 20 only. Group A on this half is 8 conflicting labels. Group B confirmed is 40. The pipeline's 65 of 74 and B381's 56 and 59 of 74 are the full corpus. The same-slice numbers below are the comparison that uses one denominator.

| Arm | Catch, of 8 | Leave-alone, of 40 |
|---|---|---|
| B381 draft-1 | 6 | 30 |
| B381 draft-2 | 5 | 32 |
| B388 held-1 | 5 | 37 |
| B388 held-2 | 5 | 31 of 35 scored |

Pass 2's denominator is 35 because fixture 15 returned no parseable JSON. Five confirmed labels on that fixture were not rateable. They were not left alone and they were not flagged. Counting them as not left alone, pass 2 is 31 of 40.

Catch did not improve. Leave-alone improved on the pass that returned a verdict for every fixture (37 against 30 and 32). It did not improve on pass 2.

The three catch misses are the same on both passes.

Fixture 13, EBITDA margin 11.1% on EUR 76 million. Label conflicting. Model `supported_full`. Comment: "TTM revenue and EBITDA margin figures match the source exactly." The accuracy README records a second figure, approximately 13%, which this comment does not mention. The model quoted the matching line and greened the sentence.

Fixture 13, 320 people in London, Hamburg, Lisbon, and Bangalore. Label conflicting. Model `supported_partial`. Comment: the offices and 320 are in section 1, and section 6 says 285, so the claim matches one part of the source. It saw the inconsistency and did not call it conflicting.

Fixture 18, "confirm completion of the transaction" with Nordic SaaS Holdings. Label conflicting. Model `supported_partial`. Comment: the company description is supported, and neither memo says the transaction has completed. It named the fault and did not use conflicting.

Leave-alone misses on pass 1, three of 40:

- Fixture 13, "The Company has built strong fundamentals." `not_supported`. The comment calls it an evaluative characterisation the memo does not use.
- Fixture 13, ARR from EUR 81 million to about EUR 195 million, 19% CAGR. `supported_partial`. The comment says the projection matches and then flags the draft for also saying EUR 84 million elsewhere.
- Fixture 18, "We have invested EUR 158 million for a 60% controlling stake." `supported_partial`. The comment says the amount and the stake match, and the memo recommends the investment rather than stating it has been made.

Pass 2 adds one: fixture 11, "Manufacturing footprint optimisation and the new Polish facility completed the operational picture." `supported_partial`. Pass 1 had left it confirmed.

## 3. The 37

The bar is B381's: the comment says what is wrong. It is not label agreement. Both passes name 36 of 37. The model arm in B381 named 36 of 37. The current route named 27 of 37.

The miss on both passes is GPI doctored S4, "sold" written as "bartered." Pass 1 quotes the word and does not call it wrong: "the draft uses the unusual term 'bartered'. The size ranking and production volume figures in the claim conflict with the source." The outlets fact is called supported. Pass 2 does not mention bartered. It names "the largest" against "second-largest" and "60 billion" against "six billion," which are the other two substitutions in that sentence.

B381's miss was a different substitution: HICL S5, "during the period" written as "during the past year." Both passes here name that change, with the tower count and the TowerCo name.

ClearPoint S8, "completed" written as "has been commenced," is the same shape B381 counted as naming the difference without calling it a contradiction. Both comments say commenced is weaker, or consistent, with a completed case. Counted as named, as B381 counted it. The sentence is still flagged because the same sentence writes Health Canada as the FDA, and that fault is named.

Every other substitution is named on both passes, including the amount, the period, the actor, the place, the figure, and the year. Several roll to `supported_partial` rather than `conflict`. The comment still names the written words. The full comments are in `runs/score-stdout.txt`.

## 4. Stability

Same rolled `displayVerdict` on both passes. 172 of 219 agree. 47 moved. None missing.

33 of the 47 are fixture 15 on pass 2. The call finished with `stop`. The body is one JSON object of 23,862 characters. `JSON.parse` rejects it: a trailing comma after the last property of the last claim, at the brace that closes that claim. `extractJsonObject` therefore stored no claims. The raw text is on that fixture in `held-2/cards.json`. It was not repaired and the fixture was not called again.

Among the 186 statements both passes parsed, 172 agree and 14 moved. On fixtures 11 to 20 alone, 105 of 143 agree, or 105 of 110 once fixture 15 is set aside. On the four clean drafts, 32 of 38 agree.

B381's two passes agreed on 90 of 100 fixture statements. The pipeline's repeated runs agreed on 94 to 97 of 100. This arm is below both, on the full held-out set and on the fixture slice.

The 14 parsed moves are:

- Fixture 11 statements 7 and 8, full to partial.
- Fixture 12 statement 5, not supported to partial.
- Fixture 13 statement 13, full to partial.
- Fixture 14 statement 12, partial to full.
- GPI doctored statements 0 and 4, partial to conflict.
- ClearPoint doctored statement 3, conflict to partial.
- 3i clean statements 2, 6 and 8, partial to full. Statements 7 and 13, full to partial.
- ClearPoint clean statement 9, full to partial.

## 5. Citation verification

Every quoted passage was checked against the named source. Exact is `indexOf`. Normalised is `locatePassageInSource`. A passage that matches neither is not in the source. A null passage is counted separately and does not verify.

| Pass | Passages | Exact | Normalised | Not in the source | Null |
|---|---|---|---|---|---|
| held-1 | 229 | 118 | 40 | 71 | 4 |
| held-2 | 203 | 99 | 35 | 69 | 4 |

61 of the 71 not-found passages on pass 1 contain an ellipsis. 47 of 69 on pass 2 do. The model joined two spans with `...`. That string is not in the source. The prompt said a passage that is not verbatim is discarded with its comment.

Under a rule that a green survives only when every claim on it has a verifying passage, exact or normalised:

- Pass 1: 106 of 143 greens survive. 37 do not.
- Pass 2: 78 of 109 greens survive. 31 do not.

Statements that have at least one claim and zero verifying passages: 67 of 219 on pass 1, and 59 of 219 on pass 2. Those statements lose their evidence entirely. Pass 2's fixture 15 is inside the 59, because it has no claims that verify. The other losses are quotes that do not locate.

## 6. Spend

Discounted meter, `calculateLlmCostUsd`. List price is the published rate with no cache discount. Unpriced calls are 0.

| Pass | Calls | Discounted USD | List USD | Input | Cached input | Output |
|---|---|---|---|---|---|---|
| tune-v1 | 10 | 0.3005 | 0.3005 | 28008 | 0 | 26551 |
| tune-final | 10 | 0.3002 | 0.3002 | 30808 | 0 | 26170 |
| held-1 | 18 | 0.5374 | 0.5524 | 68897 | 13312 | 46629 |
| held-2 | 18 | 0.4969 | 0.5683 | 68897 | 63488 | 48221 |
| Total | 56 | 1.6351 | 1.7215 | 196610 | 76800 | 147571 |

The runner printed `B388 DISCOUNTED TOTAL USD 1.6351`. The ceiling was USD 15. The sum of the four `costUsd` fields is USD 1.6350725.

Before the resume, fixture 04 on tune-v1 threw `APIConnectionTimeoutError` after about 25 minutes. That response never arrived, so it is not in the table. The resume then completed fixture 04 at USD 0.0423 metered. If the provider billed the timed-out request, that charge is outside this meter.

## 7. Prompt revision history

Two attempts. The held-out set was not read while either was written.

Attempt 1, `prompt-v1.md`, sha256 `d36930298b5990f17bfce7b390ed6a0309c1c27d16c5ce0f9b42753f2fa76fc1`. Started from `scripts/diagnostic/b381/prompt.md`. Added the paraphrase examples (healthy for good, like-for-like for LFL, additional for incremental), format equivalence for the same figure, and the warning that a different number, date, name, or period is not a format difference. Added that saying less than the source is supported, and that wording, tone, and a missing hedge are not flags. Partially confirmed only when part of the claim contradicts the source or is absent. A different actor, figure, date, name, or period for the same action is conflicting. Name the words at fault. A passage that is not verbatim is discarded with its comment.

Tune, fixtures 01 to 10. Catch 2 of 3. Leave-alone 31 of 34. B381 on this same slice was catch 1 of 3 and 2 of 3, leave-alone 26 of 34 and 27 of 34. The catch miss was fixture 05, "Halden Group will support continued growth," marked `not_supported`. The other two fixture 05 conflicts were caught. The three leave-alone misses were fixture 04 "8 employees" (the comment agreed the count and flagged the dropped word "full-time"), fixture 04 the risk-adjusted sentence (two supported facts joined), and fixture 08 the principal-risks sentence (the comment said the summary slightly over-generalises).

Attempt 2, `prompt-final.md`, sha256 `c3ebc01acbb8581c37876367c71aedf7dd8e8547927fdb956f211620e61649ad`. This is the prompt that was scored. It keeps attempt 1 and adds four instructions aimed at those tune misses. A dropped qualifier is confirmed when the figure is the same, with the eight-employees example. Facts the source states in different sentences may be joined, with the risk-adjusted example. A summary that names the risks the source names, and says they are handled when the source describes the handling, is confirmed. If the facts match, the verdict is confirmed. A claim that gives an action to an actor the source does not name, when the source gives that action to someone else, is conflicting even if other words in the claim are also absent.

Tune again. Leave-alone moved from 31 of 34 to 34 of 34. Those three misses became confirmed. Catch stayed 2 of 3. The Halden sentence stayed `not_supported`. No third attempt. Held-out was then run twice on this text.

## 8. Can a tuned model review meet the five promises

Catch did not improve over B381. On the same 8 held-out conflicts, this prompt caught 5 on both passes. B381 caught 6 and 5. Leave-alone did improve on the one pass that returned a verdict for every fixture: 37 of 40, against 30 and 32 of the same 40. The second pass is 31 of 40 if the five unscored confirmed statements are counted as not left alone. On the clean drafts, which B381 never scored, the model flagged 17 of 38 statements and 9 of those flags are wrong. That is the deciding number. It is more precise than B387, which flagged 38 of 38, and it is not quieter than the pipeline, which left a non-full verdict on 12 of 38.

P1. Green means verified. No. On pass 1, 37 of 143 greens have a passage that does not verify. On pass 2, 31 of 109 do not. One held-out conflict, the 11.1% margin, was greened by quoting the line that matches and not the line that does not.

P2. Every flag is resolvable on the card. No. The comment names the planted fault on 36 of 37, which is the comment half. 71 of 229 quoted passages on pass 1 are not in the named source, 61 of them because they contain an ellipsis. A reviewer cannot settle the flag from a quote that is not in the source.

P3. The product never asserts what it cannot show. No. Those 71 passages are attached to comments that state what the source says. The quote does not locate, so the comment is an assertion the card cannot show.

P4. Same document, same answer. No. 172 of 219 verdicts agree. 14 moved where both passes parsed. One 33-statement draft returned no JSON on the second pass because of a trailing comma. B381 agreed on 90 of 100. The pipeline agreed on 94 to 97 of 100.

P5. It leaves a record. Not established. This pass stores the model's claims, passages, and comments in `cards.json`. It does not build a product card. Fixture 15 on pass 2 stores the raw text and an empty claim list. Whether a reviewer could recover a record from that output was not tested.
