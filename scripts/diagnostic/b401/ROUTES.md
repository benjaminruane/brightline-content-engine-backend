# B401. Four routes to a green that means verified

| | |
|---|---|
| SHIPPED | SHIP VERIFIED  f922e5c  main  167 files  1828 tests |
| Cost | Ensemble USD 0.130465 discounted, 40 calls. The rest of this pass is USD 0. |
| Evidence | `scripts/diagnostic/b397/MEASUREMENT.md`, `b398/MEASUREMENT.md`, `b399/MEASUREMENT.md`, `b399/CLEAN-SET.md`, `b386/ASSESSMENT.md`, `b388/REPORT.md`, `b390/REPORT.md`, `scripts/diagnostic/b401/runs/reviewer-cost.json`, `scripts/diagnostic/b401/runs/ensemble.json`. |

No product code was changed.

## Part 1. The claim

The claim is right about the failure, and wrong in two places.

What it gets right. A green the product can stand behind has to know which sentence a fact belongs to, and it has to give the same answer on the same input. The three lexical attempts fail in that shape. B397's presence rules reach 24 of the 37 and raise 3 wrong flags on the clean set (HICL S0 "five", HICL S3 "ahead of forecast", HICL S6 polarity on the noun "company"). B398 rule B2 reaches 28, loses no B397 catch, and flags 17 correct statements. B399 rule A1 still reaches 28 and raises 16 wrong flags. The usual miss is the same one: the sentence that owns the token is not the sentence the overlap selects. The model does confirm a false sentence. The stored HICL clean S2 card is `supported_full` while the source says "expectations" and the draft says "budgets". B390 pass 1 also greened that sentence. This pass's five commentary runs all endorsed it. ClearPoint doctored S3, "vast majority", stayed green through B386 G3 and through B399.

Where it is wrong. "The model has no repeatability" is too strong. B390, same prompt, two passes, same `displayVerdict` on 203 of 219 statements. The drift is real and it is not total: B386 G13, GP Industries clean, statement 0 is partial on runs 2, 3 and 4 and full on run 5, at temperature 0 and seed 1. "Each gaining catches" is wrong for the third attempt. B399 A1 gained no catch over B398. It kept 28 and still paid 16 wrong flags. A2 reached 27 and lost hicl-S6-a.

## Part 2. The routes

All four are assessed. R1 is worth assessing because it is the only route that would make green a lookup, and the corpus shows the lookup has nothing to look up.

No fifth route to a verified green. The thing left, if none of these holds, is to stop offering that green. That is a change of promise, not another way to earn it.

## Part 3. Each route

The promises are the five in `scripts/diagnostic/b386/ASSESSMENT.md`. P1, green means verified. P2, every flag is resolvable on the card. P3, the product never asserts what it cannot show. P4, same document, same answer. P5, it leaves a record.

Today's spend for the comparison is the stored HICL clean review: USD 0.418035 discounted, 43 calls, 8 statements (`tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json`, `llmSpend`).

### R1. Structured source

Q1. "This figure is the value on the source row for this line."

Q2. The four sources are extracted prose (`lib/extract-text-from-source.mjs` into the `source-*-extracted.txt` files). Nothing in those files is a table of subject, field, value, and period. A lookup would replace Stage 2 (`lib/qc/pipeline-v4/stage2-match-sources.mjs`) and Stage 3 for the fields that arrived as data. The contract would be a source object with those fields, and a card that is green only when a field matches. That object is not an input the product receives for these documents.

Q3. Model spend is zero on a review whose source arrived as data, against USD 0.418 on the HICL review. Getting a PDF into that data is a model or a person, and that cost is not zero. Reviewer clicks are zero only after the data exists. Build is not a matter of days on this corpus, because the input is not data.

Q4. On the 37 planted substitutions and the three real errors, R1 does not run. There is no row to match "budgets" against, no row for HCIL, and no row whose period is 30 September rather than 30 June. A press-release sentence is not a cell.

Q5. A lookup is deterministic and the backend would stay authoritative. The authority is the structured input. These reviews do not have it.

Q6. P1 holds for a cell and nowhere else. P2 holds if the cell is on the card. P3 holds if the card shows the cell and does not speak for the prose around it. P4 holds for the lookup. P5 holds if the matched field is stored. None of that applies to a sentence that was never a field.

### R2. Repetition

Q1. "Five readings agreed that this sentence matches the source."

Q2. The commentary step is `generateCommentary` in `lib/qc/pipeline-v4/stage5-generate-commentary.mjs`. Calling it N times belongs in the v4 runner that already calls it once. The contract change is storing the runs and withholding a green unless they agree. The verdict the step receives is already decided upstream, in Stage 2. Repeating Stage 2 is a different build, in `stage2-match-sources.mjs`, and this pass did not do it.

Q3. Measured on the HICL clean draft: USD 0.130465 discounted for 40 calls, five passes on 8 statements. The same shape on 15 statements is about USD 0.245. That is an increase of about USD 0.10 over one commentary pass, on top of the review's USD 0.418, if only commentary is repeated. Repeating Stage 2 was not measured. It is the larger share of a review, and five of it is a different bill. Reviewer clicks do not change. The wiring is a few days. The measurement says not to spend them.

Q4. It does not catch the test case. All 5 runs endorsed HICL S2. The text was identical: the source "confirms the statement" and the growth "aligns with expectations". The draft says budgets. The note rewrites the word and still confirms the sentence. A unanimity rule accepts that. It also endorsed HICL S1, which spells the company HCIL, without ever saying the spelling is wrong. Of the 37 planted substitutions, this pass did not re-read them. The stored pipeline already leaves ClearPoint doctored S3 green, and B388's whole-draft model confirmed false sentences on the clean drafts (9 wrong flags on each held-out pass, and it also greened real discrepancies, including HICL S2 on B390 pass 1).

Q5. Five model readings are not a deterministic backend. The class agreed 5 of 5 on every statement in this run. The wording did not: 6 of the 8 statements produced more than one text. Statement 6 was mixed on all 5 runs. It opens by confirming the refinancing and then says the source does not state a reduction in debt servicing costs. Unanimity on that card would withhold a green for a sentence CLEAN-SET.md does not count as a known error. The false sentence, S2, would still go through.

Q6. P1 fails on S2. Agreement is not truth. P2 fails unless the card shows the dissent, and on S2 there was no dissent to show. P3 fails because the note asserts "expectations" while confirming a statement that says "budgets". P4 held for the class on this one draft, and B386 G13 shows it does not hold for Stage 2 on GP Industries. P5 fails unless all five texts are stored. One surviving note hides the run that might have disagreed.

### R3. The reviewer ticks

Q1. "You checked this sentence against the passage."

Q2. A stored tick, not a new `displayVerdict`. `reviewer_decisions` is append-only and is governance kinds only. A checked kind would be new. The writer is the decision API. The readers are `StatementReviewCard.jsx`, the export in `lib/qc/export-review-data.mjs`, and `evidenceDisplayVerdictLabel`, which must not turn the tick into "Confirmed". The machine verdict stays what it is. The tick is a separate line.

Q3. Model spend does not rise. It can fall if the product stops asking the model for a green. Clicks, from `reviewer-cost.json`, on the four clean drafts: 3i 37, HICL 14, GP Industries 23, ClearPoint 30. Those are B394 elements the presence check finds somewhere in the source and therefore does not settle. On the four doctored drafts the same ticks are 34, 8, 18 and 26. The ticks that stand between a planted error and a green are 3 of 6, 5 of 13, 5 of 10 and 6 of 8. Together, 19 of the 37. Build of the control is inside a week. Calling the tick a verified green is not a build. It is a false label.

Q4. Absence from the whole source blocks 18 of the 37 planted substitutions, including the 3i million-for-billion figure, the HICL date, and HCIL on the doctored draft. It does not block the five presence misses that are still in the source under another sentence (3i MAIT, 3i UK, HICL 20, ClearPoint FDA twice, ClearPoint 2027), the ratio and rank and polarity and open-wording substitutions, or HICL doctored "budgets". Of the three real errors: the 3i period date 30 June 2025 is in the source on a different sentence, so the check does not flag it and a tick is the only block. HICL S1 HCIL is absent, so the check already flags it. One of the two clean elements the check settles is that flag. The other is HICL S0 "five", which is a wrong flag. The derivation is five months, and the source does not write "five". HICL S2 "budgets" is not a figure, a date, or a name. No element tick asks about that word. A sentence tick would. An element tick would not.

Q5. The tick is deterministic once it is stored. The backend can store it and refuse to invent it. The backend cannot know the sentence is true. Authority for the truth moves to the person. That is honest only if the card says so.

Q6. P1 fails if the tick is drawn as a verified green. It holds if the line says the person checked it. P2 holds only when the passage is the one the claim is about. B386 G4 is a green whose passage does not contain the claim. A tick on that passage checks the wrong words. P3 holds if the card shows the passage and does not add a confirmation the passage does not carry. P4 holds for a stored tick and not across two people. P5 holds if the tick is stored with the passage it was made against. `reviewer_decisions` does not store that pair today.

### R4. The source read once into facts

Q1. "This figure matches the fact taken from line 12."

Q2. One model call per source, after extract, writing `facts[]` on the review: subject, element, value, period, and the source line. Stage 2 and Stage 5 stop judging. Stage 7 (`stage7-assemble-card.mjs`) looks the statement's elements up in the table. The contract is that array, stored with the review, and a card that quotes the row it matched. The model is the extractor. P20 in the operating manual is this shape: deterministic code that consumes model prose makes the model the specification.

Q3. Not measured. The direction is one call instead of the HICL review's 43, and a wrong table is then free to reuse. Reviewer clicks are zero until someone reads the table, which is the cost R3 already counted, moved from sentences to rows. A throwaway extractor on one source is a week. A table the product can stand behind is not a build for 31 October 2026.

Q4. A right table catches a planted figure, date, or name whose value differs from the row, including the 3i period if the row's period is 30 September, HCIL if the row says HICL, and "budgets" if the row says expectations and the lookup is allowed to see that noun. A wrong table does the opposite. Nothing in the 37 or the three real errors tells us which table a model would write. B390's line citations were valid ids and still the wrong lines 47 of 245 times on pass 1. A fact tied to a line can cite the neighbouring line. The vast-majority sentence is not a row. The table would have 5.9 and 12.1 and would not have "vast majority", so the lookup either refuses a green or greens the figures and stays silent on the ratio. Silence is the honest one. A green is not.

Q5. The lookup is deterministic. The extraction is not. When the extraction is wrong, the lookup repeats the wrong fact and does not notice. A person notices by reading the row against the line, which means the table has to be on the card. It is reviewable if each row shows that line. It is not self-checking. Two extractors that disagree are R2 again, and this pass already showed agreement can be agreement on the wrong reading.

Q6. P1 fails when a wrong row matches. P2 holds if the line is on the card, and fails when the line is the wrong one, which B390 measured at about 19 percent. P3 holds only for what the row shows. P4 holds for the lookup after the table is frozen, including a frozen mistake. The extraction itself has the Stage 2 problem once. P5 holds if the table is stored. A stored wrong row is a better record than today's green, and it is still a wrong green if the card treats the match as verified.

## Part 5. Decision criteria

Today is 18 October 2026. The date in D3 is 31 October 2026.

| Route | D1 | D2 | D3 | D4 |
|---|---|---|---|---|
| R1 | Not met on this corpus. A cell can be true. These sentences are not cells. | Not met. The route does not run, so it does not mark correct sentences, and it does not mark the errors either. | Not met. No date on these PDFs. A later feed that arrives as data is a different product. | Met as a statement. Spend is zero only after the data exists. Against the HICL review that is a cut from USD 0.418 to zero, and the cut is not available. |
| R2 | Not met. Five of five endorsed HICL S2. | Not met as a claim about the 32 clean statements. This run dissented on one HICL sentence, S6, which is not a known error. It did not dissent on S2. | The wiring could ship by 31 October. The result says not to ship it. | Met. USD 0.130465 measured, about USD 0.245 on a 15-statement draft of this shape, for commentary only. Stage 2 times five is not quantified. |
| R3 | Not met for "the sentence is true". Met only for "this person checked this passage", and only if that is the sentence on the card. | Met for new flags. The route adds none. The presence check it would leave in place already flags HICL "five", which is one wrong flag and inside the baseline of 3. | Met for the control, by 31 October, if the label is not "Confirmed". | Met. Model spend does not increase. Clicks are the counts in MEASURE.md. |
| R4 | Not met. A wrong fact becomes every later green. Nothing in the lookup notices. | Not met. There is no count of wrong rows. P20 says the count will not be zero. | Not met for a verified green. A throwaway table on one source is a week. A shippable one is not October. | Not met. The direction is fewer calls than 43. The number was not measured, so the increase or the cut is not quantified. |

## Part 6. Recommendation

None of the four keeps a green that means the sentence was verified. R1 has nothing to look up. R2 agreed, five times, that a false sentence was confirmed. R3 can record a person and cannot make them right, and 19 of the 37 planted errors are exactly the ones a missing tick would let through. R4 freezes the model's reading into a table and then treats the table as a fact. The decision rule was D1. A route that cannot stand behind every green is not a route to a verified green, however cheap or however soon.

What the product should promise instead is the sentence and the passage, and a note when there is one. It should not call that pair verified. B400 already drew that face for the three sentences with no figure, date, or name. The same face is the honest one for a sentence that has them, until a person has checked the passage, and even then the line should say that they checked it.

The week to prove or kill that promise: on the HICL clean draft only, show the eight sentences and the passages already on the cards, with a control that stores "checked" and does not say Confirmed. The element count on that draft is 14 ticks, plus the "five" flag the machine already raises in error, plus the budgets sentence, which no element tick asks about. If a person will not finish eight sentences, the control is dead and the card is the passage alone. Do not spend the week on R2. That kill already happened.
