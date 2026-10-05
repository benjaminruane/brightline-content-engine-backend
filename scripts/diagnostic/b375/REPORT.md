# B375. Can an editorial finding become a proposal

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | pending | not yet run |
| frontend | not touched | |

Ids used: B375 (this diagnostic). Filed in the findings log. No build row.

Cost: USD 0. No model calls. No Review.

Browser: skipped. No product surface. Read of stored payloads and the editorial rulebook.

---

## e. Do not build it

None of this is worth building. The gates in R1 to R7 leave one offer across five stored reviews, 61 statements, and 10 editorial concerns. That offer deletes the word `significant` from a sentence the evidence layer marked confirmed, on a card whose matched passage states the proceeds as £944 million. The product would be editing a fair adjective and would not be putting the figure in. That is the same family of harm as the September rewrite failures, reached by deletion instead of a milder synonym.

The smallest version the gates would allow is still that one offer: `marketing_language_excess` only, and only when the direction is `Delete 'X'. The phrase becomes 'Y'.`, the evidence verdict is confirmed, and `restatementMatchesClauseMinusSpan` already accepts Y. `rewrite_needed` stays a refusal. Every other editorial code stays an acknowledgement. If that were built, the measurement afterwards is the next real review of this size: count of offers, whether the deleted token is a closed hyperbole word or a model-chosen adjective, and whether the source states a figure that makes the adjective fair. Stopping rule: one live offer that deletes a fair magnitude word on a confirmed sentence ends it. These payloads already are that case, so the stopping rule is met before a line of product code.

---

## a. Which codes could qualify

The live editorial rulebook is the 14 ids in `lib/rulebook/editorialRules.js`. `imprecision_when_precision_available` is commented out at lines 18 to 25 and is not a live code. `hyperbole_vs_qualitative` shares the evaluative deletion parser and is a style rule, not an editorial one. Compliance is out under R5. These five payloads contain no compliance concerns.

A code can qualify only when its own repair is the removal of a named span, and the resulting sentence is the statement minus that span inside the existing restatement budget (`RESTATEMENT_EDIT_DISTANCE_BUDGET` is 2, `lib/qc/evaluative-language.mjs` line 184). A synonym, an inserted name, or a recast clause cannot.

### Could qualify, on a concern that already names a pure deletion

**`marketing_language_excess`** (`editorialRules.js` lines 99 to 114). The repair the rule asks for is delete the evaluative span, or keep it and flag it. Never a milder word (`EVALUATIVE_LANGUAGE_INSTRUCTION`). A `delete_becomes` direction is checkable: `restatementMatchesClauseMinusSpan` (lines 338 to 345) and `applyEvaluativeDeletionDirection` (lines 74 to 95). A `Keep` direction has nothing to offer. A `rewrite_needed` direction is the model saying the remainder cannot be repaired without a rewrite, which R1 forbids, and the applier leaves the sentence unchanged.

**`cliche_and_filler`** (lines 174 to 180). A filler phrase such as `needless to say` can be a removable span. Dropping it, and repairing only the comma and a capital, can sit inside budget 2. The rule does not forbid a synonym, so a Replace direction fails R1. There is no Delete parser and no stored concern. It does not change the build decision.

### Cannot

**`overreach_unsupported_causal`** (lines 48 to 55). The objectionable term is a connective (`driven by`, `driven primarily by`, and the rest of `CAUSAL_CONNECTIVES`). Removing the connective does not leave a sentence (`Performance was share price gains`). Removing the quoted clause leaves a fragment (`with and`, or a bare `which continues`). Every stored direction is `Rephrase` or `Replace` with `associated with`. That is the milder-word laundering R1 bans. This is the code behind the first two September failures, and the stored cards still say it.

**`underreach_hedging`** (lines 57 to 64). The repair is unstacking hedges (`may possibly indicate`). That changes the verb. It is a recast, not the statement minus a span. No stored concern.

**`voice_consistency`** (lines 29 to 46). `fixDirection` is `FIRST_PERSON_ACTOR_FIX_DIRECTION` (`lib/qc/first-person-actor.mjs` line 129): substitute the named organisation. The module says substitute the named actor and never delete them (line 3). Inserting a name is far past budget 2.

**`register_mismatch`** (lines 66 to 77). A colloquialism is replaced with formal wording. Substitution.

**`audience_calibration_jargon`** (lines 79 to 86). Explain on first use, or replace with plainer language. Insertion or substitution.

**`jargon_outside_audience_competence`** (lines 88 to 97). The reviewer note says suggest a plain-language equivalent or an in-line definition, and do not strip the term (line 96).

**`narrative_coherence`** (lines 116 to 123). The concern is how this sentence sits against its neighbours. That does not name an interior span. Omitted from the prompt unless `QC_NARRATIVE_COHERENCE` is on (B348). Fails R3.

**`materiality`** (lines 125 to 131). The unit is the whole sentence. Fails R3.

**`structural_integrity`** (lines 133 to 145). Agreement, fragments, and dangling modifiers are repairs of the wording. A rewrite.

**`internal_plausibility`** (lines 147 to 154). A contradiction or a numeric impossibility is fixed by changing a figure or a clause. Choosing which claim survives is a rewrite, and it is often an evidence matter (R2).

**`passive_voice_overuse`** (lines 156 to 163). The rule tells the reviewer to give the active recast of that clause (line 160). R1 puts a clause rewrite out permanently.

**`sentence_length`** (lines 165 to 172). The repair is to break the sentence up. Not a deletion.

---

## b. How many stored concerns qualify

Five review payloads. 61 statements. 10 editorial concerns, all `category: "editorial"`. Five are `overreach_unsupported_causal`. Five are `marketing_language_excess`. No other editorial code fires.

Payloads: `tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json`, `doc-review.json` (build `2b68499`), `tests/fixtures/real-runs-2026-09-29/clean-review.json`, `doc-review.json` (build `a22e894`), `tests/fixtures/real-runs-2026-10-02/doc-review.json` (build `438169f`). Counts read from those files with `concernCandidates`, `objectionableTerms`, `parseEvaluativeDeletionDirection`, `restatementMatchesClauseMinusSpan`, and `applyEvaluativeDeletionDirection`.

**One concern qualifies under R1 to R4.**

1. 3i September clean, S8, `marketing_language_excess`. Evidence `confirmed`, `supportState` `supported`, `hasConflict` false. No framing, recency, or compliance sibling. Direction: `Delete 'significant'. The phrase becomes 'generated proceeds for 3i'.` Budget match true. Applied sentence: `Action also completed a pro-rata redemption of shares, which generated proceeds for 3i.` That is the statement minus `significant`. Thing 1 is the phrase `significant`, not the whole sentence.

The other nine do not.

| Payload | S | Code | Evidence | Why it fails |
|---------|---|------|----------|----------------|
| HICL clean | 1 | `overreach_unsupported_causal` | confirmed | `Rephrase 'EBITDA growth driven by capital expenditure'`. No checkable deletion. Minus the quote: `with and resilient cashflow`. Minus `driven by`: `EBITDA growth capital expenditure`. The connective is already in the matched passage (`inSource` true). |
| HICL doctored | 2 | `overreach_unsupported_causal` | partial | R2. Also a `Rephrase`, and the quote is most of the sentence. |
| 3i Sep clean | 3 | `marketing_language_excess` | confirmed | `rewrite_needed` on `record year`. Applier leaves the sentence unchanged. `inSource` true. |
| 3i Sep clean | 12 | `overreach_unsupported_causal` | confirmed | `Replace ... with 'Performance was associated with share price gains at 3i Infrastructure plc'.` Laundering. `inSource` true. |
| 3i Sep doctored | 2 | `overreach_unsupported_causal` | confirmed | `Rephrase 'driven largely by Action' ... such as 'largely associated with Action's strong trading performance'.` Laundering, and the replacement adds a market phrase the sentence does not contain. |
| 3i Sep doctored | 3 | `marketing_language_excess` | confirmed | Same `record year` refusal as the clean copy. `inSource` true. |
| 3i Sep doctored | 8 | `marketing_language_excess` | partial | Same `significant` deletion as the qualifying row. R2 blocks it. The sentence says `MAIT`, which is the planted name. |
| 3i Sep doctored | 12 | `overreach_unsupported_causal` | confirmed | `Rephrase` the `driven primarily by` clause. No resulting sentence. `inSource` true. |
| 3i Oct doctored | 8 | `marketing_language_excess` | conflicting | Same deleted word, `significant`. Direction edge differs (`which generated proceeds for 3i`). R2 blocks it. Splice still lands on the same full sentence as the September doctored copy. |

R6 does not add a further block on the one qualifier: that card has a single concern and a confirmed evidence verdict. It does block the two doctored `significant` rows, which R2 already blocks, because the sentence still has an evidence problem the deletion would leave in place.

Five of the ten concerns are `inSource` true under `concernPhraseInMatchedPassages` (HICL clean S1, both `record year` rows, both `driven primarily by` rows). Current assembly would drop those before a reviewer sees them. The stored payloads still contain them. A proposal built from the stored concern, without that drop, would delete a phrase the matched passage already uses.

---

## c. What varies, and what does not

The model varies whether a concern fires, and the edge of the restatement it writes. It does not, in these payloads, vary which word a deletion removes.

These are not three identical reruns. September is build `a22e894`, October is `438169f`, HICL is `2b68499`. The editorial call still receives the surrounding draft, so a clean draft and a doctored draft are different inputs even when one sentence matches. What follows is byte-identical statement text across those payloads, which is the closest stored comparison.

Four groups carry an editorial concern in at least one copy.

1. `This was driven largely by Action, which continues to trade strongly.` Present in all three 3i payloads. Fired on 1 of 3 (September doctored only). The direction is a rephrase to `largely associated with`, not a deletion. There is no second deleted word to compare.

2. The `record year` sentence. Present in all three. Fired on 2 of 3 (both September copies), with the same direction both times: delete `record year` and rewrite so it reads naturally. October is silent. The applier does not change the sentence on either firing. Not a different word.

3. `MAIT also completed a pro-rata redemption of shares, which generated significant proceeds for 3i.` September doctored and October doctored, identical text. Both delete `significant`. September says the phrase becomes `generated proceeds for 3i`. October says `which generated proceeds for 3i`. Both pass the budget check. Both splice to `MAIT also completed a pro-rata redemption of shares, which generated proceeds for 3i.` The deleted word is stable. The model's restatement moves by one word, and the existing splice does not follow that move.

4. The doctored `driven primarily by` sentence. September fired a `Rephrase` with no replacement sentence. October did not fire. Not a deletion.

Nine statements are byte-identical across all three 3i payloads. Fifteen are byte-identical across the two doctored 3i payloads. No pair deletes a different word.

The premise that the concern is shown either way does not hold for firing. Groups 1, 2, and 4 are sometimes a concern and sometimes silence. That variance is already on the card. It would become a document edit only if those directions were proposals. They are not: group 1 and group 4 are rephrases, and group 2 is `rewrite_needed`. Group 3 is shown both times, deletes the same word both times, and is blocked by R2 both times (partial, then conflicting), so a proposal would not be offered on either copy. The one qualifying sentence (September clean S8, `Action` rather than `MAIT`) has no second copy in these payloads.

What the product does with a stored `delete_becomes` direction does not vary. `applyEvaluativeDeletionDirection` is a splice. Same statement, same removed word, same resulting sentence, including when the model's `phrase becomes` clause differs by `which`. What would vary is following a `Rephrase` or `Replace` direction. Those are the directions R1 refuses.

---

## d. What R1 to R7 do not prevent

The one concern that passes the gates is the one that should not be offered.

September clean S8 is confirmed. The matched `supportSpans` passage states the redemption as `returning £944 million of gross proceeds to 3i` (`tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt` lines 27 to 28; the span on the card contains `944`, the 144-character `primaryExcerpt` does not). The word `significant` is not in that passage, so source-awareness keeps the concern. The evidence summary then repeats the draft: `which generated significant proceeds for 3i`. R2 looks at the verdict, sees confirmed, and would allow a proposal. The proposal deletes a magnitude word on a sentence the card has just confirmed, and it does not insert £944 million. The sentence becomes more measured and less informative. R1 bans a milder synonym. It does not ban this deletion. Editorial has been source-blind since B178, so the concern was never a finding that the source contradicted the adjective.

The budget check keeps a broken deletion and rejects a grammatical repair. On the `record year` sentence, `restatementMatchesClauseMinusSpan` returns true for the mechanical remainder `set for another with new stores in Switzerland and Romania being well received`, and true for that same broken tail as a local phrase. It returns false for a grammatical repair (`The company's new store expansion program continues, with new stores...`). The stored direction happens to be `rewrite_needed`, so today's applier refuses. R4 as operated by the existing checker does not require the remainder to be a sentence. A later model that writes `Delete 'record year'. The phrase becomes 'set for another with new stores...'` would pass the budget and be offerable. The check that saves the stored card is model prose (P20), not the budget.

A concern names more than one span. S8 stores `generated significant proceeds` from the note and `significant` from the direction. Deleting the note span leaves `which for 3i`. The evaluative parser uses the `Delete` quote, which is why this card is safe under today's code. R3 says the concern must name a span. It does not say which span wins when the note and the direction disagree. A design that took the first `span` entry would offer the broken sentence, and the budget check would accept it, because that remainder is the statement minus that span.

R1 to R7 do not re-run source-awareness. Five stored concerns are phrases the matched passage already contains, on confirmed cards. A proposal read off the stored payload would delete them. HICL clean S1 is the false positive B372 drops on `driven` / `driving`. The `record year` and `driven primarily by` rows are the drops B355 already performs at assembly. The gates in this brief do not include that drop.

Firing is unstable on identical sentences, and a proposal would make that instability a change to the draft. The Action causal sentence is a concern in one of three stored copies. If a rephrase were allowed through, Implement Changes would edit that sentence on one review and leave it on the other two. R1 stops the rephrase. It does not stop the same pattern on the next adjective the model decides to delete. The clean `significant` sentence was not repeated here, so there is no stored second run to show the word would stay put.

The September failures were editorial edits on sentences that were also factually wrong. R2 is aimed at that. The residual is the other way around: a factually accepted sentence, and an editorial deletion that makes it sound more careful. These payloads contain one of those, and the gates let it through.

---

## What was not built

No proposal path. No code change. The acknowledgement in `fillAction` (`lib/revise-actions/run.mjs`, authored rows stay acknowledgements) stays as it is.

---

## Cost report

Zero. No billed run.

---

## Technical summary

Read-only. Classified the 14 live editorial ids in `lib/rulebook/editorialRules.js` against R1 to R4. Counted editorial concerns on the HICL 4 October payloads and the 3i 29 September and 2 October payloads: 10 concerns, 1 of which passes the gates (`marketing_language_excess` deleting `significant` on September clean S8). Compared byte-identical statements across those payloads: no pair deletes a different word; firing and the restatement edge do move. Filed B375 in the findings log as measured and not shipped.

## Plain-language summary

Editorial notes should stay notes. The only change these stored reviews would have been allowed to propose is deleting the word "significant" from a sentence the product had already accepted, about a share redemption the source puts at £944 million. That is not a fix worth offering.
