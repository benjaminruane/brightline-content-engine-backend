# B404. Walkthrough

| | |
|---|---|
| SHIPPED | SHIP VERIFIED  0bbd1bf  main  172 files  1864 tests |
| Cost | Estimate printed before the saved run, no cache assumed, output ceiling 300. 9 calls, 30543 input tokens at chars/4, USD 0.2202 list. Model `claude-opus-4-7`. Measured list and discounted USD 0.261010, 9 calls, input 44792, output 1482, cached 0. Opus has no cached rate, so the two figures are equal. Source: `spend` in `scripts/diagnostic/b404/runs/reading.json`. An earlier run of the same 9 calls crashed before the file was written. Its dollars were not stored. See the ledger. |
| Gate | `QC_READING_VIEW` defaults on. Set it to `0` to leave the card untouched. The frontend link uses `VITE_READING_VIEW`, also default on, and only appears when the payload is present. |

## How the source reaches the screen

The review response already includes each source's text. `buildResponseSources` in `lib/response-sources.mjs` copies `sources[i].text` through unchanged, and the results screen already reads `analysisResult.sources`. The reading view splits that same text on newlines. Line `L22` is the 22nd line. One source is used as it is. Several sources are joined with a single newline between them, in the same order, on both sides. The payload does not carry a second copy of the document.

## The positive line

Nothing in the demands tier, and no fact missing, now takes the positive line. A light note and a wording note do not suppress it. Recomputed from the stored B403C states, two of the eight drafts show it:

- GP Industries clean: `Well sourced. Every figure, date and name appears in the source. 1 statement goes a little further than it does.`
- ClearPoint clean: `Well sourced. Every figure, date and name appears in the source. 2 statements go a little further than it does.`

The other six do not. Each has a missing fact or a statement in conflict, so the older second sentence still wins. HICL clean, on this run, is `2 facts are not in the source.`

## What rendered

Live path: `attachReadingView` on the assembled HICL clean cards and the HICL interim source. The note step is the same Opus call the pipeline now makes. The eight existing card fields `displayVerdict` and `factualBadge` were unchanged.

Header, as sent:

`16 of 18 facts matched · 2 to look at · 1 worth a glance · 4 wording notes`

`2 facts are not in the source.`

Footnote, once, at the bottom:

`Your facts are matched against the source and your interpretation is read and commented on. Your judgement still decides.`

Writer note, under the header:

`The draft reads with a confident, analyst-style voice and moves logically from portfolio-level performance into specific holdings, which gives the reader a clear sense of what is driving results. The holding-level color on St. Pancras, Fortysouth, and Affinity Water adds useful texture rather than just restating headline numbers.`

`The weakness is repetition and density as a pattern: EBITDA growth and "across the portfolio" phrasing recur in back-to-back sentences, and several paragraphs stack multiple ideas (operations, commercial, refinancing) without a connective thread, which flattens emphasis. Watch also for small consistency issues like the HICL/HCIL spelling and clarify whether items such as the refinancing refer to the company or to a specific holding, since the antecedents drift.`

Closed rows show the sentence, the fact marks, and a wording marker where the bucket is wording. The note paragraph is not on the row. It appears when the row is opened. Four rows carry the marker: S0, S1, S3, S6.

S0. Quiet. Nothing to raise. Wording marker.

`HICL Infrastructure’s performance for the five months to 28 February 2026 was positive and largely in line with expectations.`

Facts: HICL Infrastructure matched, lines L1 and L6. 28 February 2026 matched, line L12. expectations matched, lines L22, L35, L36, and `and 2 more`.

Opened note: `The source describes operational performance as "in line with expectations" and "robust" over the period 1 October 2025 to 28 February 2026. The statement's "positive and largely in line with expectations" restates the same assertion in other words.`

S1. Demands. Not in the source. Wording marker. Strong weight.

`Across the portfolio, operational performance was robust, with EBITDA growth driven by capital expenditure, and resilient cashflow generation supporting HCIL’s dividend program.`

Facts: EBITDA matched, lines L16, L22, L36, and `and 1 more`. HCIL not found.

Opened note: `The statement paraphrases the Chair's remarks about robust operational performance, capex-driven EBITDA growth, and resilient cash generation supporting the dividend. "HCIL" appears to be a typo for HICL but does not change the claim.`

S2. Demands. Not in the source. Strong weight. No wording marker.

`Across the portfolio, growth investments continue to perform well, with significant investment in expansion programs driving EBITDA growth that continues to perform in line with budgets.`

Facts: EBITDA matched, lines L16, L22, L36, and `and 1 more`. budgets not found.

Opened detail shows `Not in the source`, then the note: `The source says EBITDA is being delivered "in line with expectations" and in line with HICL's "valuation assumption." The statement says EBITDA is in line with "budgets," which is a different benchmark.`

Beside the missing word the card shows `budgets, not in the source`, then the benchmark words the source does use:

- expectations, L22. Portfolio performance in line with expectations, with capex programmes across HICL's growth assets continuing to drive EBITDA growth.
- forecast, L25. The dividend outlook line, which includes forecast cash cover.
- guidance, L40. Cash generation from the PPP portfolio continues to be in line with expectations, underpinning dividend cover in line with market guidance.
- target, L16. The Chair's sentence, which includes achieving our target dividend cash cover.

S3. Quiet. Nothing to raise. Wording marker.

`Among the significant holdings, London St. Pancras High Speed performed well during the period, with international train path bookings slightly ahead of forecast.`

Facts: London St. Pancras High Speed matched, L38. forecast matched, L25, L35, L38, and `and 3 more`.

Opened note: `The source states London St. Pancras High Speed performed well with international train path bookings slightly ahead of forecast. The statement says the same, adding the framing "among the significant holdings," which does not change the claim.`

S4. Quiet. Nothing to raise. No note text.

`On the commercial front, progress has been made on adding a second international operator on the route, while Virgin Trains recently announced its intentions for cross-Channel operations from St. Pancras.`

Facts: Virgin Trains matched, L38. Channel matched, L38. St. Pancras matched, L38.

S5. Light. Goes beyond the source. Outline weight.

`Elsewhere, Fortysouth delivered 16 new towers during the period and is actively progressing additional co-location opportunities, both of which are expected to support continued growth in EBITDA and valuation gains.`

Facts: Fortysouth matched and disputed, L39. 16 matched, L39. EBITDA matched, L16, L22, L36, and `and 1 more`.

Opened note: `The source says the 16 new towers and co-location opportunities are expected to support continued growth in EBITDA in line with HICL's valuation assumption. The statement adds "and valuation gains," which the source does not assert.`

S6. Quiet. Nothing to raise. Wording marker. No facts were extracted.

`The company also recently completed an oversubscribed refinancing, which will lead to a reduction in debt servicing costs.`

Opened note: `The source says Fortysouth completed an accretive refinancing that was c.30% oversubscribed and enabled a step-down on debt margins earlier than forecast. The statement restates this as an oversubscribed refinancing leading to reduced debt servicing costs, which is the same assertion in other words.`

S7. Quiet. Nothing to raise. No note text.

`Meanwhile, Affinity Water appointed a new CEO with significant sector experience and stands to benefit from the UK government’s recently published white paper on water sector reform.`

Facts: Affinity Water matched, L30 and L37. CEO matched, L37. UK matched, L23, L37, L38, and `and 2 more`.

## W1

Yes. S1 and S2 are the two demanding sentences. S1 is Not in the source because HCIL is not found. S2 is Not in the source because budgets is not found, and the detail shows `budgets, not in the source` beside expectations, forecast, guidance, and target, each with its line.

## W2

Yes. Every matched fact on this draft has at least one line. None is over the date threshold, so each shows up to three lines and `and N more` when there are more. The rendered chip for L22 carries the line and its two neighbours in the hover text. Clicking a chip sets the source panel's active line. The panel is the source in order, with that line marked. There is no search.

## W3

USD 0.261010 for this run. 9 calls. List and discounted are the same figure. The crashed run before it was also 9 calls and is unpriced.

## W4

S1's note says HCIL does not change the claim, and the bucket is wording. The sentence is still demands, because the name is not in the source, and the opened detail shows both the label Not in the source and that note. The element is doing the work the note refuses.

The budgets card lists every benchmark word in the whole source. Forecast, guidance, and target sit beside expectations. That is the rule from B403C. On this sentence the swapped word is expectations, and the other three are from other lines, so the detail is wider than the one phrase.

The page I opened was the component rendered without the app stylesheet, so I am not treating its spacing as the product. The tree of that page had the header, the eight sentences, S2 open with the budgets card, and the source lines through L58.
