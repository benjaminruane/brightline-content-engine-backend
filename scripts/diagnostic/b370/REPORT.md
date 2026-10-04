# B370. What the matcher finds, and what it gets wrong

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | 8c28cb5 | SHIP VERIFIED  8c28cb5  main  160 files  1767 tests |
| frontend | not touched | |

Ids used: B370 (this diagnostic).

Cost: USD 0. No model calls. No Review.

Browser: skipped. No layout, control, or card-face change.

---

## Answerable from disk, and not

Answerable now, with no run:

1. What the matcher is asked, and how many calls. This is the live code, not a stored trace.
2. How often the returned quote is not literally in the source, split by kind. Two stored corpora still hold the model's own string. The R10 corpus blast (`scripts/diagnostic/eval-ablation/r10-corpus-blast-rows.json`, 378 R10 pairs, 2026-08-27) stored the raw passage before the writer blanks it. The B325 pointer set (`scripts/diagnostic/excerpt-recovery/measure-recovery.json`, 56 pointers, 2026-09-24) stored real-PDF quotes. The live prompt trim is still sha256 `44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1`, length 14259, the same hash the blast recorded.
3. Empty confirmation, as a count on those 378 pairs and on the three stored 3i payloads.
4. Quotes that are not one contiguous stretch, on the same 378.
5. Whether one contiguous span is a hard limit, from the prompt and the schema, plus what the widened call actually returned on the private equity card.
6. Confirmation against a passage that does not carry the statement's figure, on the 378. The specific "USD 1.5 billion, three runs out of three" is not in these files.
7. How many stored statements carry more than one checkable figure, and whether the one passage contains them.
8. Tokens and USD per statement per source, for the single-pick call, on the 378. Input tracks source length. Correlation 0.9987.

Not answerable from the accuracy cards or the real-run fingerprints:

- `scripts/diagnostic/accuracy/runs/*/cards.json` stores `sourceMatches` as classification and sourceIndex only. Lift-1, the rounding pair, and the reducer pair do not store the single-pick passage, the usage, or the cost per pair. Lift-1 does store widened `supportSpans[].passage`. Those were measured. They are the second call, not the first.
- Real-run `stage2SourceFingerprints` are classification, sourceIndex, sourceLabel, and systemFingerprint. The displayed excerpt is a source slice after B325. Comparing it to the source measures the slicer, not the model.
- Widened-call tokens are not stored anywhere. The user message is the same shape (statement plus the whole source). A meter of those 332 extra calls on this corpus is a projection from the measured single-pick mean, not a bill: about USD 4.04. A run would settle the output-token half.
- Whether real PDF line-break misses are still two thirds after the raised-character extractor (B327) is not remeasured. The 56 pointers are the last stored set. A fresh Stage 2 pass of those pairs would settle it. It is not priced on disk. The measured single-pick call on the fixture corpus is USD 0.01218 mean (source median 5,676 characters). PDF extracts run longer than that median, so USD 0.01218 times 56 (about USD 0.68) is a floor, not a quote.

Nordholt source text was reread from `~/Downloads`, the same path `run-passage-correspondence-baseline.mjs` uses. It is not in git. All 378 pair ids joined. If those four files have changed since 27 August, only the Nordholt rows would move.

---

## Measured rates

| What | Corpus | Rate |
|------|--------|------|
| Quote is an exact substring | R10 single-pick, 378 pairs | 270/378 |
| Quote differs only by whitespace | same | 87/378 |
| Same letters in one block after punctuation and replacement characters are stripped | same | 5/378 |
| Verbatim words, not one block (stitched) | same | 14/378 |
| Not a quote ("The source does not address...") | same | 2/378 |
| Paraphrase (partial word overlap, not verbatim) | same | 0/378 |
| Not exact, of which whitespace | same | 108/378, of which 87 are whitespace |
| Exact / whitespace-normalised / near-copy / miss | PDF pointers, 56 | 19 / 33 / 3 / 1 |
| Widened span exact / whitespace / punctuation-block / stitch | accuracy lift-1, 343 spans | 264 / 69 / 4 / 6 |
| Empty passage | R10 378 | 0/378 |
| Empty confirmation on the stored 3i sentence | September clean and doctored; October doctored | 2/2 confirmed with an empty span; October refused, 1/15 cards |
| Confirmed, figure in the source, passage names no figure | R10 confirmed figure-bearing pairs | 1/101 (F18 S6, the 40%) |
| One passage contains every figure, when the statement has two or more | R10, 54 pairs | 41/54 |
| Same, when those figures sit in different source sentences | R10, 24 pairs | 19/24 contain every figure; 4/24 omit at least one; 1/24 names both money figures but rounds 19 to 18.6 |
| Statements with two or more backstop figures | accuracy lift-1, 261 statements | 47/261 |
| Statements the compound prefilter admits | same | 38/261 |
| Input tokens per single-pick call | R10 378 | min 2,997, median 4,013, p90 7,451, max 9,243 |
| Output tokens | same | min 40, median 102, p90 153, max 218 |
| USD per single-pick call | same, list price on the stored usage | sum USD 4.604783, median USD 0.01117, max USD 0.02506 |

---

## Recommendation

Keep catching quote misses downstream. Do not open a Stage 2 rewrite to make the model a better copyist.

The miss is one cause. On the fixture corpus, 87 of the 108 quotes that are not exact differ only by whitespace. Another 5 are the same letters in one block once punctuation or a replacement character is ignored. On the real-PDF pointers the not-exact rate is 37/56, and 33 of those 37 are whitespace-normalised with similarity 1.0. The two-thirds figure is still the right description of PDF extracts. It is not the rate on clean text, and it is not a mix of paraphrase and invention. Paraphrase, measured as partial word overlap, is absent from both sets. The two inventions are the model writing "The source does not address..." into the passage field on a `no_support` pair.

A prompt that says "copy the characters" would be asking the model to do the thing these rows show it does not do. B325 already turns that pointer into the source's own characters. That is the fix that matches the rate.

The second cause is small and different: 14/378 quotes are verbatim pieces with something left out between them. That is a stitch, not a new sentence. B359's segment join is the catch for it. It is not a reason to rebuild Stage 2.

What is worth changing in the matcher, later, is not the bytes. One passage per pair cannot name two places that sit thousands of characters apart. On the 3i card the 14% private equity sentence and the 13% total-return sentence are 2,898 characters apart. The widened call returned both. The single-pick schema cannot. That showed up as 4 of 24 two-sentence figure pairs whose one passage omits a figure. It is not the whitespace problem, and it is not most pairs.

Empty confirmation is real and rare: 0/378 on the blast, and one sentence on the stored 3i runs. Catching it is the right size of response.

### Which recovery layer each answer retires

Keep catching, which is the recommendation. None of the four becomes unnecessary.

- B325 stays. It is the catch for the dominant miss, whitespace.
- B351 stays. The span fallback is how a second located passage is used when the single-pick pointer fails. The empty-confirmation refusal is how a confirmed empty passage stops reading as confirmed. The blast never produced an empty passage. The 3i sentence did.
- B359 stays. It joins the 14 stitches, and it is how two source runs become one shown quote.
- B366 stays. It is the locate step for the refused empty confirmation. That is one sentence in these files, not a reason to delete the door.

Fix quoting in the matcher, so the returned string is an exact slice. B325's normalised recovery would go idle on the whitespace miss. It would not retire the other three. Stitches would still miss an exact slice. Empty confirmation is not a whitespace bug.

Also stop empty confirmations in the matcher. B351's refusal and B366's recovery of that refusal would go idle. B325 and B359 would not.

Also stop stitches, and let the widened call be the way two places are expressed. B359's segment join would go idle for stitches. The widened call, and the two display slots, would still be what carries the private equity pair. Those are not recovery layers. They are the data model.

Dead scaffolding would be keeping a layer after the miss it exists for has gone to zero. None of the four is there.

---

## 1. What it is asked

One statement against the whole source. `matchSingleSource` sends the statement and `sourceText` with no slice and no retrieval (`lib/qc/pipeline-v4/stage2-match-sources.mjs`). `matchAllSources` builds one pair per statement per source and runs them at concurrency 24. There is no chunker in front of that call. The only split in that file is trimming the returned passage, not the source.

Calls per statement per source, on the live path:

- One single-pick call. A second call only if the first response fails schema validation. The blast runner did not retry. None of the 378 R10 rows has a null classification, so this file does not show a retry.
- One widened call when the single-pick class is `confirmed`, `partially_confirmed`, or `conflicting`. That is 332/378 on this corpus. `no_support` skips it. The widened user message is again the whole source.
- One extra single-pick per claim per source when Stage 1b decomposes the sentence. The flag defaults on. The prefilter admitted 38/261 accuracy statements and 2/15 sentences on each stored 3i run. Those claim calls are not in the 378.
- The unsupported-span elicit is off unless `QC_STAGE2_SPAN` is set.

The largest stored prompt is 9,243 input tokens (source 32,401 characters). That is the whole document plus the system prompt, not a slice. Nothing in this corpus is near a 128k context window, so the answer is not being cut off by a window. When a figure is missed, it was in the document and the model quoted a different stretch.

The fixed part of the prompt is about 2,700 input tokens. The smallest source is 212 characters and still cost 3,008 input tokens. Output stays near 100 tokens while input scales with the source. Correlation of source characters with input tokens is 0.9987. Correlation of passage length with output tokens is 0.55.

## 2. Quotes that are not in the source

The two-thirds rate is the PDF set, and it is still the right reading of that set. 37/56 pointers are not an exact substring. 33 of those 37 normalise onto the source with similarity 1.0: line breaks and spaces. 3 are near-copies (similarity 0.980, 0.995, 0.990). 1 does not recover (ambiguous tie). That split was already in `measure-recovery.json`. It is not paraphrase, and it is not invention.

On clean fixture text the not-exact rate is 108/378, not two thirds, because those sources have fewer hard line breaks. The composition is the same. 87 are whitespace. 5 match as one block of letters after punctuation and replacement characters are removed (the Shopify memo stores a replacement character where the model wrote "Lütke" or an en dash). 14 are stitched verbatim. 2 are the non-quote sentences. 0 are paraphrases. Word coverage on the 14 stitches is 1.00. Word coverage on the 2 non-quotes is 0.00. There is no band in between.

Widened spans on the 8 September accuracy run, 343 passages: 264 exact, 69 whitespace, 4 letter-block, 6 stitch. Same shape.

## 3. Empty confirmation

0/378 passages on the blast are empty, in any class.

On the stored 3i runs the shape is one sentence, both September payloads: statement 10, classification `confirmed`, support span passage empty, primary excerpt empty, display Unverifiable. October, after the refusal, is `not_reviewed`, no span, no excerpt, supportState `skipped`. That is 2/30 September cards and 1/15 October cards, all the same sentence. It is not a rate to put next to the whitespace rate.

## 4. Not one contiguous stretch

Whitespace and the 5 letter-block cases are one stretch. The locator can take them. The 14 stitches are not. 14/378 is the guaranteed loss for a locator that requires one block, before B359 joins segments. On the PDF 56, the 33 normalised hits are one stretch after the whitespace fold. The two-thirds miss is not this problem.

## 5. Two places

The single-pick schema is one string. The prompt says the passage must be a single contiguous verbatim excerpt, and if the context is longer, return the single most relevant span (`stage2_v4.md`). That is a hard limit of this call. The widened call is an array, and its prompt forbids merging two places into one item.

The private equity sentence on the stored 3i cards is: "The private equity business generated gross investment returns of 14% for the period and accounted for the vast majority of the overall total return." It does not itself state 13%. The 14% sentence and "The total return of 13%..." are 2,898 characters apart in the October extract. Both September runs and the October run store two support spans, one for each. The widened matcher expressed the pair. The single-pick field is not on the payload, so this file cannot show which of the two the first call picked.

Where a statement's own figures already sit in different source sentences (24 R10 pairs), the one passage still contains every figure 19 times. It omits at least one figure 4 times (F15 stake, F16 stake, F17 reversion and capex, F19 the long portfolio sentence). F06 names both money figures and the source's 18.6 percent against the statement's 19. That is rounding inside one quote, not a dropped place.

## 6. Confirmed against a passage that does not carry the figure

Measurable. Among 101 confirmed pairs whose statement has a percent, a money figure, or a headcount:

- 94 passages contain every one of those figures.
- 4 contain some.
- 3 contain none, and two of those three are not the shape. The Nordholt fact sheet says "Employees: 720 Facilities: 14" and the extractor did not treat the bare integers as figures. The margin pair quotes 18.6 per cent against approximately 19 per cent, so the amount is named.

The one clean case is F18 S6. The statement includes "approximately 40% of Nordic property management companies still use legacy systems or spreadsheets." That 40% is in the source. The confirmed passage quotes the market-leading product and names no figure. 1/101.

The USD 1.5 billion sentence confirmed against a passage with no amount, three runs out of three, is not in the blast, the accuracy cards, or the 3i payloads. B345 T1 is a hand-built pair for the demoter. A stored three-run rate for that sentence does not exist here.

The earlier correspondence count on these same rows, broader extractor, was 3/128 confirmed pairs with none of the statement's figure values in the passage (`passage-correspondence-baseline.md`). That count and the 1/101 above are the same file read two ways. Neither is large next to whitespace.

## 7. More than one checkable claim

The sentence is still the unit the single-pick call judges. Counts on the 261 accuracy statements, one frozen list:

| Grain | Statements |
|-------|------------|
| Two or more `claimAnchors` (figures, names, multiples, short capitals) | 133/261 |
| Two or more verifiable anchors | 119/261 |
| `isCompoundCandidate` (the prefilter that actually launches a second call) | 38/261 |
| Two or more backstop figures (percent, money, headcount) | 47/261 |

`claimAnchors` over-counts. It picks up "The Company", a currency code already inside a money figure, and "may" inside "may not". The figure row is the one that is checkable without that argument. 47/261 statements carry two or more figures. The prefilter admits 38/261, so most multi-figure sentences are still sent as one string.

On the 54 R10 pairs whose statement has two or more figures, the one passage contains all of them 41 times, some 9 times, and none 4 times. The class mix on those 54 is confirmed 42, conflicting 6, partially confirmed 4, no support 2. The matcher does not grow a second passage. When it succeeds, it quotes a block long enough to hold the figures. When the block is not long enough, a figure is absent and the class can still be confirmed (F18, F19).

Each stored 3i draft is 15 sentences. The prefilter admits 2. Four sentences have two or more figures. Seven have two or more claim anchors. Two sentences are decomposed.

## 8. Cost shape

Single-pick, R10 arm only, 378 calls, cache off, list price from the stored usage at the gpt-4o rates in `lib/observability.js` (USD 2.50 per million input, USD 10 per million output):

| | Input tokens | Output tokens | USD |
|--|--------------|---------------|-----|
| Sum | 1,681,273 | 40,160 | 4.604783 |
| Median | 4,013 | 102 | 0.01117 |
| Max | 9,243 | 218 | 0.02506 |

What drives it is the source. Quartile 1 sources (212 to 943 characters) average 3,076 input tokens and USD 0.00859. Quartile 4 (7,735 to 32,401 characters) averages 6,812 input tokens and USD 0.01817. Output barely moves (about 90 to 114). A change that adds a second full-source call, which the widened pass already is, costs about as much again per supporting pair. 332 such calls at the measured mean of USD 0.01218 is about USD 4.04. That figure is a projection. The widened usage is not in the file.

Lift-1 metered USD 2.2669825 for 271 pairs, widened included, on fixtures 01 to 20 only. That is a different, shorter corpus. It is not a second measurement of these 378.

Accuracy cards and the 3i payloads have no token fields. Do not read a per-statement Stage 2 cost out of them.

---

## Technical summary

No product code. The report measures stored Stage 2 output. The live single-pick call sends the whole source once per statement per source. On 378 R10 pairs the raw quote is exact 270 times, whitespace-only 87 times, a punctuation or replacement-character variant 5 times, a verbatim stitch 14 times, and a non-quote 2 times. Paraphrase is 0. The PDF pointer set is 19 exact, 33 normalised, 3 near-copy, 1 miss. Empty passages are 0/378, and one 3i sentence in the real-run fixtures. One passage is a hard limit of the single-pick schema. The widened call returned both the 14% and the 13% spans, 2,898 characters apart. Confirmed passages that name none of a figure the source does contain: 1/101. Single-pick cost on the 378 is USD 4.604783, median USD 0.01117, and input tokens track source length.

## Plain-language summary

The matcher usually finds the right passage and types it with the wrong spacing. That is the miss the later recovery steps are catching, and it is the right thing to catch. It almost never invents a quote. The separate, smaller problem is a sentence that needs two places far apart in the source: the first call can only bring one of them back.
