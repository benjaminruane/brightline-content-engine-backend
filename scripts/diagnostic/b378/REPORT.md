# B378. The source dateline, numbers as words, and a separator misfire

## Scoreboard

| | |
|---|---|
| SHIPPED | SHIP VERIFIED  55e8cd8  main  164 files  1805 tests |
| Cost | USD 0. No model calls. |
| Fixtures | `8db103f` fixtures: GP Industries press release, doctored run and five clean runs |
| Tests | 164 files, 1805 tests, passed locally before this commit |
| Accuracy | Outstanding. The labelled hundred was not re-run. Parts 1A and 1B can move a verdict. Ben's call when to spend the pass. |

## Part 1A. Blast radius

`extractSourceAsOfDate` passed the whole header line to `parseDateLoose`. That parser is anchored at both ends, so `13 November 2025, Singapore` matched the date test and then returned null.

The fix passes the matched date substring. The line must still be under 40 characters, and it must still be in the first six lines.

Stored review payloads under `tests/fixtures/` that contain a `sources` array: 22. Sources whose as-of date goes from null to a value: **5**. Other as-of changes: **0**.

All five are the same GP Industries press release, one source each:

| payload | before | after |
|---|---|---|
| real-runs-2026-10-06-gpi/clean-run2-review.json | null | 2025-11-13 |
| real-runs-2026-10-06-gpi/clean-run3-review.json | null | 2025-11-13 |
| real-runs-2026-10-06-gpi/clean-run4-review.json | null | 2025-11-13 |
| real-runs-2026-10-06-gpi/clean-run5-review.json | null | 2025-11-13 |
| real-runs-2026-10-06-gpi/doc-review.json | null | 2025-11-13 |

That is the document this spec is about. Not large. The fix shipped.

Direct callers of `extractSourceAsOfDate`: `lib/qc/supersession.mjs`, `lib/qc/pipeline-v4/index.mjs`, `lib/qc/source-dateline.mjs`. Stage 7 reaches it through source recency and through the dateline rule. Supersession can demote a pair only when more than one dated source is in play. Each of these five payloads has one source, so the new date does not demote a pair on the stored set.

## Part 1B. Design

A statement dates an act of saying by the source's own party only when all of these hold:

- There is exactly one source with text. Two sources stand down.
- `extractSourceAsOfDate` returns a date. No date stands down.
- The statement opens `In <Month> <Year>, <Name> <verb>`. The verb is one of announced, announces, said, says, stated, states, reported, reports, disclosed, discloses, declared, declares. A date attached to anything else, including a date later in the sentence, does not match.
- The name is capitalised words, and it is not a geography or a currency. That rejection is `isBareNonParty` from `lib/qc/party-tokens.mjs`.
- The same name appears, after lowercasing, in the first 12 non-empty lines of the source. That is the opening, where this press release names GP Industries. A party that shows up only in the body, such as the parent, does not qualify. The comparison is an exact substring. No Jaccard.

`lib/qc/date-subject.mjs` does not fit. `datesSameSubject` requires a reporting-period cue, and its own comment says a document dateline is not a subject we compare. Month and year are read from the as-of `Date` (UTC) and from the `In <Month> <Year>` clause.

`party-tokens.mjs` does not name the speaker. It only rejects a geography or a currency. The speaker is the subject of the announcing verb, accepted only when that phrase is in the opening.

Agree: commentary sentences that say the source does not specify or address the timing are removed, as is advice that only tells the reviewer to verify the announcement date. A sentence that also names another gap (a percent, a figure, oil prices) stays. If the card is partial, every unsupported span is only that announcing clause (a short tail such as "that it intends to", no other number), and a confirming passage is already on the card, the card is shown confirmed.

Differ: unless the card is already a conflict, it becomes a conflict. `conflictExcerpt.passage` is the dateline line. `displayVerdictReason` is `announcement_dateline`. An existing conflict is left as it is.

## Part 2. Reach. Not built

`tokenizeQuantities` is imported only by `lib/revise-actions/source-governance.mjs` and `lib/revise-actions/conflict-engagement.mjs`. Both sit in the proposal layer.

That is not the whole reach. `annotateTokens` calls `tokenizeQuantities`. `lib/qc/pipeline-v4/confirming-passage-disagrees.mjs` imports `annotateTokens` and runs before Stage 3. A new count or money token with a different value, same kind and same name, demotes a confirmed passage to conflicting. That is a verdict. `lib/qc/date-subject.mjs` also imports `annotateTokens`, but it keeps only `kind === "date"`, so a word-number count would not move it. The confirming-passage path is enough.

The distinction the spec asked for is clean: a number word from one to twenty becomes a token only when the next word is `million`, `billion`, or a counted noun, and not when the next word is a function word (`of`, `in`, `other`). It was not built. Teaching `TOKEN_RE` would put those tokens on the verdict path. A side reader inside `findCandidatePairs` only would have dodged that path and was not added.

Doctored S1 and S4 still produce no candidate pairs. `findCandidatePairs` returns `[]` on every support span of both cards, before and after. The source still writes "three facilities", "over six billion", and "one million", and the tokenizer still requires digits.

## Part 3. The separator gate

The gate is `STYLE_RULE_DETERMINISTIC_FILTERS.thousand_separator` in `lib/qc/editorial-compliance-reviewer.mjs`. It runs inside `applyDeterministicStyleFilters`.

If the cited span is non-empty, that span is judged. If it is empty, the statement is judged. A thousands separator is a comma, apostrophe, or dot with three digits after it. No such character: the concern is dropped. The rest of the rule is unchanged, including the drop when the statement already uses an apostrophe and no comma.

The style-guide description for `thousand_separator` now tells the model not to flag a figure with no separator character. The deterministic gate is what removes the offer.

On the doctored S4 card the cited span is `60 billion` (characters 85 to 95). The gate drops the concern. The captured `doc-actions.json` and the stored card still contain the historical string `60'000 million`. A new review does not keep that concern, so the offer is not produced again.

## Measurement

`node scripts/diagnostic/b378/measure.mjs`. Machine output: `scripts/diagnostic/b378/results.json`.

| check | before | after |
|---|---|---|
| As-of null to a value, per source | 0 of these five read | 5, all 2025-11-13, listed above. No other payload |
| Clean run 2 S0 | supported_partial | supported_full. Timing-silence sentence gone |
| Clean run 3 S0 | supported_partial | supported_full. Timing-silence sentence gone |
| Clean run 4 S0 | supported_partial | supported_full. Timing-silence sentence gone |
| Clean run 5 S0 | supported_full | supported_full. Verdict unchanged. The sentence that said the timing is not addressed is removed |
| Doctored S0 | supported_partial | conflict. Quote `13 November 2025, Singapore`. Reason `announcement_dateline`. The mixed sentence that also names the 75% figure stays |
| Doctored S1 candidate pairs | [] on both spans | [] on both spans. Part 2 was not built |
| Doctored S4 candidate pairs | [] on both conflicting spans | [] on both conflicting spans. Part 2 was not built |
| Doctored S4 `60'000 million` offer | present on the stored concern | dropped by the gate |

Evidence verdict or disposition movers outside the GP fixtures: **none**.

Commentary-only change outside those four verdict movers: clean run 5 S0, verdict unchanged, timing sentence removed. That card was already confirmed.

Style concerns the gate now drops, each explained:

| payload | statement | cited figure | why it drops |
|---|---|---|---|
| b247/recovered-shopify-messy-prefix.json S15 | In 2010, $132mm in GMV... | (no span; the statement) | The note claims a comma separator. The statement has none |
| b247/shopify-messy-full-after.json S15 | same sentence | (no span; the statement) | Same misfire |
| b247/shopify-messy-full-after.json S102 | monthly churn ranges from 3 n 5% | `3 n 5%` | The letter n is not a thousands separator |
| b247/shopify-messy-full.json S102 | same sentence | `3 n 5%` | Same |
| b247/shopify-messy-full.json S157 | 13.5% option pool | `13.5%` | A decimal percent is not a thousands separator. The note claims a comma the span does not contain |
| real-runs-2026-10-06-gpi/doc-review.json S4 | over 60 billion | `60 billion` | No separator character. This is the spec case |

These six are style-concern drops, not evidence verdict changes. Each cited figure has no thousands separator, which is the rule Part 3 added.

## Outstanding accuracy pass

Parts 1A and 1B can move a verdict. On this stored set the only evidence verdict movers are the four GP S0 cards above. The labelled hundred was not re-run. That pass is outstanding. It is Ben's call when to spend it.

Browser: skipped. This change has no layout. The verdict effect was measured by replaying stored payloads. A new Review was not run.

## Technical summary

`extractSourceAsOfDate` now parses the date substring of a short header line, so a press-release dateline of the form date plus city yields an as-of date. New `lib/qc/source-dateline.mjs`, called at the end of `assembleCard`, confirms the timing when a statement opens by dating an announcement by the party in the source opening and the month and year match that as-of date, and turns a mismatch into a conflict quoted from the dateline line. `tokenizeQuantities` was not taught number words, because `annotateTokens` feeds confirming-passage demotion. `STYLE_RULE_DETERMINISTIC_FILTERS.thousand_separator` drops a concern whose cited figure contains no thousands separator character.

## Plain-language summary

A press release dated "13 November 2025, Singapore" is now read as dated that day. When the draft says GP Industries announced something in November 2025, the review no longer says the source never gives the timing. When the draft says October, that date is a conflict against the dateline. Figures written as words ("three facilities", "six billion") still do not produce a suggested replacement, because teaching the reader those words would also change verdicts. The review no longer asks the author to rewrite "60 billion" as "60'000 million".
