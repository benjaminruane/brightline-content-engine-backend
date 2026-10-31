# B458. Drop the equivalence sentence, honour a hedged figure, and let the measure see the label.

Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0.

## Equivalence sentences

Cards whose evidence line contains a sentence explaining that two forms are equivalent: 104 before, 0 after.

## Hedged figures

A hedge is a qualifier sitting immediately in front of the figure. `over the period` and `under its ownership` are not hedges. `more than`, `less than`, `over`, and `under` require the source number to sit strictly on that side. An equal number does not satisfy them, unless the source uses the same hedge on that number. A far larger number does satisfy `more than`, because the words are true of it. `modestly above` requires the source number to be greater and no more than 15 percent above. `nearly` requires the source number to be under the draft number: within 5 percent for a round amount, or one percentage point for a whole-number percent. `approximately`, `around`, `roughly`, and `about` use that band on either side. A bare count of 20 or less may be one either side. A figure written with a decimal stays within 1 percent, so a nearby but different percentage in the same source does not count.

Hedged statements: 37. Fully backed among them: 28. The brief counted 24. The table is every statement where the code finds a qualifier immediately in front of a figure, so the extra ones are visible rather than dropped to hit 24.

| Card | Display verdict | Sentence before | Sentence after | Hedged figure unmatched before | After |
|---|---|---|---|---|---|
| 01:1 | supported_full | Nothing raised | Nothing raised | - (nearly 10'000) | - |
| 01:2 | supported_full | Nothing raised | Nothing raised | figure:150% (gt 150%) | - |
| 02:3 | supported_full | Nothing raised | Nothing raised | - (gt 30%) | - |
| 02:4 | supported_full | Nothing raised | Nothing raised | - (gt 100) | - |
| 03:0 | supported_full | Nothing raised | Nothing raised | - (gt EUR 120 million) | - |
| 04:1 | supported_full | Nothing raised | Nothing raised | - (approx 20%) | - |
| 04:3 | conflict | Conflicts with the source | Conflicts with the source | - (approx 14, approx 7) | - |
| 04:4 | supported_full | Nothing raised | Nothing raised | - (approx six) | - |
| 04:5 | supported_full | Nothing raised | Nothing raised | - (approx eight) | - |
| 05:3 | supported_full | Nothing raised | Nothing raised | - (approx 3,200) | - |
| 05:4 | supported_full | Nothing raised | Nothing raised | - (approx 11 percent) | - |
| 06:1 | supported_full | Nothing raised | Nothing raised | - (approx 19 percent) | - |
| 06:5 | conflict | Conflicts with the source | Conflicts with the source | - (modestly_above EUR 196 million, approx 14 percent) | - |
| 09:10 | supported_full | Nothing raised | Nothing raised | - (approx EUR 3 million) | - |
| 10:1 | supported_full | Nothing raised | Nothing raised | - (approx 850) | - |
| 10:2 | supported_full | Nothing raised | Nothing raised | - (gt 600) | - |
| 11:1 | supported_full | Nothing raised | Nothing raised | - (approx EUR 1.62 billion) | - |
| 12:0 | conflict | Conflicts with the source | Conflicts with the source | - (gt four) | - |
| 12:3 | supported_partial | Not in the source | Not in the source | figure:40 percent (gt 40 percent) | figure:40 percent |
| 13:3 | supported_full | Nothing raised | Nothing raised | - (gt 1'200) | - |
| 13:9 | supported_partial | Not in the source | Not in the source | figure:40% (approx 40%) | figure:40% |
| 13:12 | supported_full | Nothing raised | Nothing raised | - (approx EUR 195 million) | - |
| 15:13 | supported_full | Nothing raised | Nothing raised | - (approx EUR 1.04 billion) | - |
| 15:14 | supported_full | Nothing raised | Nothing raised | - (approx EUR 295 million) | - |
| 15:29 | supported_full | Nothing raised | Nothing raised | - (approx 10) | - |
| 16:6 | supported_full | Nothing raised | Nothing raised | - (approx 64 percent) | - |
| 16:10 | supported_partial | Partly in the source | Partly in the source | - (approx 14 percent) | - |
| 16:11 | supported_full | Nothing raised | Nothing raised | - (approx EUR 195 million) | - |
| 17:1 | supported_full | Nothing raised | Nothing raised | - (approx EUR 1,820) | - |
| 17:6 | supported_full | Nothing raised | Nothing raised | - (approx 18 percent) | - |
| 17:9 | supported_full | Nothing raised | Nothing raised | - (approx 40 percent) | - |
| 18:3 | conflict | Conflicts with the source | Conflicts with the source | - (gt 240'000) | - |
| 18:6 | supported_partial | Partly in the source | Partly in the source | - (approx 40%) | - |
| 18:7 | conflict | Conflicts with the source | Conflicts with the source | - (approx EUR 95 million) | - |
| 19:6 | supported_full | Nothing raised | Nothing raised | - (approx 12) | - |
| 19:10 | supported_full | Nothing raised | Nothing raised | - (approx 12 percent) | - |
| 20:3 | supported_full | Nothing raised | Nothing raised | - (approx EUR 1.2 billion) | - |

The display verdict is not an input to the figure check, so it does not move. The sentence label moves only when the hedge was the reason the figure was unmatched and no louder note remains. 06:5 stays Conflicts with the source. The source already states both EUR 218 million and EUR 196 million, so the hedge is satisfied and the conflict is not an unmatched figure. The other conflicts in the table did not move either.

## Catch

Labelled faulty statements: 13 of 13.
Group A design faults: 11 of 11.
Catch uses the original six layers. The new sentence layer is not part of it.

## Leave-alone

The old definition is the one the series back to B437 uses. It reads the display verdict, the note bucket, and whether a concern is present. The new definition also reads the sentence label and the tier.

| Corpus | Old evidence leave-alone | Old combined quiet | New evidence leave-alone | New combined quiet |
|---|---:|---:|---:|---:|
| B456 stored pass | 49 of 74 | 32 of 74 | 47 of 74 | 30 of 74 |
| B457 replay, form match, no hedge | 49 of 74 | 32 of 74 | 49 of 74 | 32 of 74 |
| B458 replay, hedge honoured | 49 of 74 | 32 of 74 | 49 of 74 | 32 of 74 |

Confirmed cards the new measure sees and the old one calls evidence-quiet, on the stored pass: 01:3 not_in_source, 19:9 not_in_source.
Confirmed cards whose stored sentence is Needs a look: none.
Needs a look outside that 74, on the stored pass: 06:3, 17:7. Both were evidence-quiet under the old definition. The new definition sees the label, so they are not quiet. They are not in the 74, which is why B453 did not move 49 or 32.
On the B457 replay: none.
On the B458 replay: none.

## Evidence lines

Cards with no evidence line: 0.

## Five cards

### 01:1

Verdict: supported_full. Sentence: Nothing raised.

> The Company has grown rapidly, with customers increasing from 5'500 a year ago to nearly 10'000 today.

Before:

> The source states customers increased from 5,500 a year ago to nearly 10,000 today. The statement conveys the same figures using a different thousands separator.

After:

> The source states customers increased from 5,500 a year ago to nearly 10,000 today.

### 01:2

Verdict: supported_full. Sentence: Nothing raised.

> Monthly recurring revenue has grown from USD 164'000 to USD 438'000 over the same period, representing growth of more than 150% year on year.

Before:

> The source states MRR grew from $164K to $438K, +151% Y/Y. The statement says "more than 150%", which is the same claim phrased differently.

After:

> The source states MRR grew from $164K to $438K, +151% Y/Y.

### 01:5

Verdict: supported_full. Sentence: Nothing raised.

> The product is simple enough that a non-technical user can set up a fully functioning online store within a few hours.

Before:

> The source states "The product is simple enough so that anyone can set up a fully functioning online store in a matter of hours" and "A non-techie can start taking orders from a professional-looking online store in a few hours after sign-up." The statement rephrases this with equivalent meaning.

After:

> The source states "The product is simple enough so that anyone can set up a fully functioning online store in a matter of hours" and "A non-techie can start taking orders from a professional-looking online store in a few hours after sign-up."

### 01:7

Verdict: supported_full. Sentence: Nothing raised.

> We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem.

Before:

> The source lists three growth opportunities: marketing, international expansion and product localization, and business development to expand App Store applications. The statement restates these same three levers in slightly different words.

After:

> The source lists three growth opportunities: marketing, international expansion and product localization, and business development to expand App Store applications.

### 01:8

Verdict: supported_full. Sentence: Nothing raised.

> The team, led by founder-CEO Mr. Lütke, has demonstrated strong product and management instincts despite Mr. Lütke being a first-time CEO.

Before:

> The source describes Tobi Lütke as a young, first-time CEO who is thoughtful with good product and management instincts. The statement restates this in different words without changing the claim.

After:

> The source describes Tobi Lütke as a young, first-time CEO who is thoughtful with good product and management instincts.

## Design

The evidence line keeps a sentence that says what the source says. It drops a sentence whose job is to say the draft's wording is the same claim, including a thousands separator, a restatement, or a figures-match. On a wording note, a clause that turns to what the statement says is cut, because that clause is the comparison. If nothing about the source remains, the line names the file and quotes the passage. A conflict note that names two different figures is left as it is. A refused note is still not explained.

`more than 150%` is matched by 151% and is not matched by 150% or 149%. `nearly 10,000` is matched by 9,700 and is not matched by 9,400 or by 10,400. `modestly above EUR 196 million` is matched by EUR 218 million and is not matched by EUR 400 million or by a number below 196. Callers of `elementFound` are `buildFacts`, `proposal-check`, and the diagnostic scripts that re-export the extractor. A hedged figure can now be found. `displayVerdict` is not one of those callers, so the class does not move.

`layerSpoken`, `quietOf`, `evidenceQuietOf`, and `tallyLeaveAlone` are unchanged. `layerSpokenWithLabel` adds the sentence label and tier. A confirmed card whose headline says Not in the source, or Needs a look, is no longer quiet.

## Files

- `lib/qc/evidence-line.mjs`. Drops the equivalence sentence. Already composed the line.
- `lib/qc/b394-elements.mjs`. A hedge is part of the figure, and a source number that satisfies it counts as found.
- `scripts/diagnostic/lib/leave-alone.mjs`. The new tally. The old tally stays, so B437 onward can still be read.
- `tests/b458-hedge-and-label.test.mjs`. Locks the bands, the dropped sentence, and that the old tally does not grow a seventh key.
- `scripts/diagnostic/b458/replay.mjs`. Replays the pass. No model call.
- `tests/b457-form-and-line.test.mjs`. The note test now expects the source sentence without the separator sentence. The 150 test now expects 151 to satisfy more than 150, and 150 and 149 to fail. No exemption was added.

`Claude outputs/` is already in `.gitignore`, from `139fd54`. The HTML preview stays on disk and does not dirty the tree.
