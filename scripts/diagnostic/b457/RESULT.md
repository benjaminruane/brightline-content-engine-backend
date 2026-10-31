# B457. A card must not contradict its own evidence, and the evidence line gets one voice.

Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0.

## What was measured

Cards: 261.
Headline contradicts the evidence, before: 24. After: 0.
Catch on labelled faulty statements (conflicting and no_support): 13 of 13.
Catch on the group A design faults: 11 of 11.
Evidence leave-alone: 49 of 74. Combined quiet: 32 of 74.
Fully backed cards that still record an unmatched element: 2.
- 01:2 sentence Nothing raised. Unmatched: figure:150%.
- 11:5 sentence Nothing raised. Unmatched: figure:19 percent.
Of the original 24 contradictory cards, 5 sit in the confirmed 74. Sentence state is not a leave-alone layer, so clearing a false Not in the source does not move this tally.
Cards with no evidence line: 0.
Quoted spans that are not in the source and not in the statement, after line breaks are collapsed: 0. A passage the line inserts is copied only when the source contains it character for character.

## Why the remaining headlines are legitimate

None remain.

## Ten cards

### 01:1

Verdict: supported_full. Sentence: Nothing raised.

> The Company has grown rapidly, with customers increasing from 5'500 a year ago to nearly 10'000 today.

> The source states customers increased from 5,500 a year ago to nearly 10,000 today. The statement conveys the same figures using a different thousands separator.

### 01:2

Verdict: supported_full. Sentence: Nothing raised.

> Monthly recurring revenue has grown from USD 164'000 to USD 438'000 over the same period, representing growth of more than 150% year on year.

> The source states MRR grew from $164K to $438K, +151% Y/Y. The statement says "more than 150%", which is the same claim phrased differently.

### 01:3

Verdict: supported_full. Sentence: Nothing raised.

> The Company is profitable and has raised just USD 1 million to date.

> 01_bvp_shopify_memo states "The business is profitable and largely bootstrapped, having raised just $1mm to date and having $1.3m of cash on its balance sheet with no debt.".

### 06:3

Verdict: supported_full. Sentence: Needs a look.

> We see continued strong demand for managed IT services in the UK and Irish mid-market and view Cirrus as well positioned to keep gaining share.

> 06_synth_listed_pe_report_excerpt states "Looking forward, we see continued growth opportunity for Cirrus in the UK and Irish mid-market,
> supported by structural demand for managed IT services as enterprises migrate to hybrid cloud
> architectures and address heightened cybersecurity requirements. The Company is
> well-positioned to continue gaining share, supported by a clear product roadmap and a
> high-quality management team.".

### 11:5

Verdict: supported_full. Sentence: Nothing raised.

> International expansion took revenue contribution from outside the Nordic region from 19 percent at entry to 42 percent at exit.

> The source states that 81% of revenue was from the Nordic region at entry (implying 19% international) and 42% international at exit. The statement expresses the same figures as the non-Nordic share.

### 17:7

Verdict: supported_full. Sentence: Needs a look.

> Urban last-mile is one of the most structurally supported segments of European commercial real estate.

> 17_synth_real_estate_logistics states "Urban last-mile logistics is one of the most structurally supported segments of European
> commercial real estate.".

### 01:4

Verdict: supported_full. Sentence: Goes beyond the source.

> Shopify's strategic moat is its App Store, which two-thirds of customers actively use.

> The source describes the App Store as "a big competitive differentiator" and says roughly two-thirds of customers use at least one app. It does not characterize the App Store as Shopify's "strategic moat," which adds a stronger claim than the source states.

### 02:0

Verdict: supported_full. Sentence: Nothing raised.

> Partners Group has agreed to sell atNorth, a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board and Equinix in a transaction valuing the Company at an enterprise value of USD 4 billion.

> 02_pg_atnorth_exit states "Partners Group, one of the largest firms in the global private markets industry, acting on behalf of its clients, has agreed to sell atNorth (or "the Company"), a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board ("CPP Investments") and Equinix, the world's digital infrastructure company. The transaction values atNorth at an enterprise value ("EV") of USD 4 billion.".

### 01:10

Verdict: supported_partial. Sentence: Goes beyond the source.

> In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway.

> The source discusses Shopify's organic growth, App Store differentiation, and growth opportunities, but it does not characterize the unit economics as "exceptional" or the competitive position as "defensible" in those terms. These are added judgements the source does not make.

### 01:9

Verdict: conflict. Sentence: Conflicts with the source.

> Shopify's 24 employees are based in Ottawa, where the Company has recruited strong design and engineering talent at 60-70% of comparable Silicon Valley or New York costs.

> The source states Shopify's 24 employees are in Ottawa and that the company recruits top development and design talent at 60%-70% of the cost of similar talent in Silicon Valley or New York. The statement says "design and engineering" instead of "development and design," which conveys the same claim in other words.

## Design

A figure, quantity, date, or name counts as found when the source has the same value in another written form. The comparison is deterministic. It does not call a model and it does not change displayVerdict. Apostrophe thousands separators match commas. A spelled number from zero to twenty matches the numeral. The word percent matches the symbol. An ISO code matches the currency symbol, and mm means million only when a currency is present. An en dash or an em dash joins a range so the currency and the scale carry across. A name matches with or without an honorific, in either case, and a defined-term Company is ignored. An initialism matches the words, and the words match the initialism. A source token whose character was replaced by the replacement character still matches the name.

150 does not match 151, and 19 percent is not inferred from 81 percent. Those two facts stay unmatched. The note on each card is bucket wording: it already says the difference does not change the claim. A wording note does not leave the headline saying the figure is absent. The unmatched fact is still stored, so the next read can see which element failed.

The evidence line is the reader's note when that note has text. A refused note is not explained. When there is nothing to report, the line names the source file and quotes the passage, and it stops. It does not say the passage supports the statement. The span call is gone. The prompt file is gone. The model key is gone.

Leave-alone does not rise. The tally reads displayVerdict, the note bucket, editorial, compliance, framing, and recency. It does not read sentence state. The 24 false headlines were never an input to it.

## Files

- `lib/qc/evidence-line.mjs`. Composes the one line. A note with text is the line. Otherwise the file name and a verbatim passage.
- `lib/qc/b394-elements.mjs`. The form comparison. House style and the other equivalent forms count as found. 150 does not count as 151.
- `tests/b457-form-and-line.test.mjs`. Locks the forms, the two non-matches, and the line. Also locks that the span prompt and the model call are gone.
- `scripts/diagnostic/b457/replay.mjs`. Replays the B456 pass. No model call.
- `lib/qc/pipeline-v4/prompts/source-difference.md`. Deleted. The span call is not left on disk.

Tests rewritten to the new line, not deleted: `tests/actor-of-the-action.test.mjs`, `tests/b360-two-passages.test.mjs`, `tests/b362-silence-and-scale.test.mjs`, `tests/b363-role-party.test.mjs`, `tests/b364-house-style-source-quote.test.mjs`, `tests/b366-party-and-empty-quote.test.mjs`, `tests/b369-quote-without-comment.test.mjs`, `tests/b371-actor-off.test.mjs`, `tests/b372-relation-company-date.test.mjs`, `tests/commentary-inventory.test.mjs`, `tests/card-honesty-invariant.test.mjs`, `tests/editorial-source-awareness.test.mjs`, `tests/b421-combined-verdict.test.mjs`. Each still asserts the verdict. The comment they used to require was the span sentence or an empty summary. They now require the evidence line.

`tests/b369-quote-without-comment.test.mjs` again requires a comment whenever a quote is shown. The exception for a fully backed card and for a missing difference is gone.
