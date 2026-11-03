# B468. The guard keeps what it can

Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.

Problems: none.

## What was built

A stored explanation is split on sentence boundaries. A sentence that says the source supports the statement is dropped. A later sentence that names the difference is kept, in the words the model wrote. Where no sentence survives, the card falls back to the evidence line.

The header counts the sentence label. It does not count the verdict field. A fact line is spoken only for cards labelled Not in the source. A conflict leads when a card is labelled Conflicts with the source.

The final comma and the spelling of 0 to 12 are scans. The review prompt no longer asks for those two. The other four prompt-only rules stay: thousand_separator, currency_format, english_variant, and date_format. A stored drop that objects to a comma or a number is not put back on the card. Relevance still is.

Callers. accept and readerSentences: the reader reason, and the screen's allowed(). attentionHeader: the reading header, the B460 census, and the reading-view test. SCANNED_STYLE_RULE_IDS: the review prompt filter and source awareness. scanListCommas and scanNumberForm: the editorial review, beside the mechanics scan. restoredSourceAwarenessConcerns: the card and the screen copy.

## Problem 1. The difference is kept

08:3 before:

08_synth_industrial_buyout_memo states "First, the Company occupies an enviable competitive position."

08:3 after:

However, 'exceptional' is a broader evaluative claim that the source does not state.

14:2 before:

The source says "the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances."

14:2 after:

However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.

Sentences from which a clause was dropped:

- 08:3
  Dropped: The source describes the company's competitive position as 'enviable' in a specific vertical, which supports the statement's claim of an 'exceptional' competitive position.
  Kept: However, 'exceptional' is a broader evaluative claim that the source does not state.
  Shown: However, 'exceptional' is a broader evaluative claim that the source does not state.
- 14:2
  Dropped: The source states that the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances, which partially supports the statement that the regulatory pathway has matured.
  Kept: However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.
  Shown: However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.

Cards whose shown reason is not the stored prose: 08:3, 14:2.

Cards with no reason under a raised verdict: 0.

The five B462 probe sentences still return an empty reason. The three quote lines are still released: 06:3 and 15:9 on supported, 17:7 on structurally supported.

## Problem 2. The header uses the label

Draft 19 before: 3 statements conflict with the source. 2 facts are not in the source, across 2 of your 14 statements

Draft 19 after: 2 facts are not in the source, across 2 of your 14 statements. 1 worth a glance

Draft 19 labels:

- 19:0 Nothing raised
- 19:1 Nothing raised
- 19:2 Not in the source
- 19:3 Nothing raised
- 19:4 Nothing raised
- 19:5 Nothing raised
- 19:6 Nothing raised
- 19:7 Not in the source
- 19:8 Nothing raised
- 19:9 Nothing raised
- 19:10 Nothing raised
- 19:11 Nothing raised
- 19:12 Nothing raised
- 19:13 Goes beyond the source

Draft 02 before: 1 statement needs a look. 1 worth a glance

Draft 02 after: 1 statement needs a look. 1 worth a glance

Draft 02 labels:

- 02:0 Nothing raised
- 02:1 Nothing raised
- 02:2 Nothing raised
- 02:3 Nothing raised
- 02:4 Needs a look
- 02:5 Goes beyond the source
- 02:6 Nothing raised
- 02:7 Nothing raised
- 02:8 Nothing raised

Every draft. Before is shown only where the line changed.

- 01 (12): 1 fact is not in the source, across 1 of your 12 statements. 2 worth a glance
  Before: 2 facts are not in the source, across 2 of your 12 statements. 2 worth a glance
- 02 (9): 1 statement needs a look. 1 worth a glance
- 03 (9): 1 statement conflicts with the source. 1 worth a glance
- 04 (21): 1 statement conflicts with the source. 7 worth a glance
- 05 (8): 1 statement conflicts with the source. 2 facts are not in the source, across 2 of your 8 statements
  Before: 2 facts are not in the source, across 2 of your 8 statements. 1 statement conflicts with the source
- 06 (12): (empty)
- 07 (7): (empty)
- 08 (18): 2 statements conflict with the source. 7 worth a glance
- 09 (15): 1 statement conflicts with the source. 2 worth a glance
- 10 (7): (empty)
- 11 (14): 1 worth a glance
  Before: 1 fact is not in the source, across 1 of your 14 statements. 1 worth a glance
- 12 (10): 2 statements conflict with the source. 4 facts are not in the source, across 2 of your 10 statements. 1 worth a glance
  Before: 4 facts are not in the source, across 2 of your 10 statements. 2 statements conflict with the source. 1 worth a glance
- 13 (16): 2 statements conflict with the source. 2 facts are not in the source, across 1 of your 16 statements. 4 worth a glance
  Before: 2 facts are not in the source, across 1 of your 16 statements. 2 statements conflict with the source. 4 worth a glance
- 14 (13): 1 statement conflicts with the source. 5 worth a glance
- 15 (33): 2 statements conflict with the source. 3 worth a glance
- 16 (13): 2 worth a glance
- 17 (11): 1 statement conflicts with the source. 1 statement needs a look
  Before: 1 statement conflicts with the source
- 18 (10): 6 statements conflict with the source. 3 worth a glance
- 19 (14): 2 facts are not in the source, across 2 of your 14 statements. 1 worth a glance
  Before: 3 statements conflict with the source. 2 facts are not in the source, across 2 of your 14 statements
- 20 (9): 1 fact is not in the source, across 1 of your 9 statements

Header mismatches: 0.

The verdict field and the sentence label disagree when they are not the same family. supported_partial covers Partly in the source and Goes beyond the source. supported_full covers Nothing raised and Needs a look. Those pairs are not listed. The disagreement is reported and not fixed.

Disagreements: 25.

- 01:0 verdict supported_full | label Not in the source
- 01:4 verdict supported_full | label Goes beyond the source
- 03:3 verdict supported_full | label Goes beyond the source
- 03:7 verdict supported_full | label Conflicts with the source
- 04:7 verdict supported_full | label Goes beyond the source
- 04:19 verdict supported_full | label Goes beyond the source
- 04:20 verdict supported_partial | label Conflicts with the source
- 05:0 verdict conflict | label Not in the source
- 05:7 verdict supported_partial | label Not in the source
- 08:8 verdict supported_full | label Conflicts with the source
- 08:9 verdict supported_full | label Goes beyond the source
- 08:17 verdict not_supported | label Goes beyond the source
- 09:2 verdict supported_full | label Goes beyond the source
- 09:4 verdict supported_full | label Conflicts with the source
- 11:6 verdict supported_full | label Goes beyond the source
- 11:9 verdict not reviewed | label Nothing raised
- 12:3 verdict supported_partial | label Not in the source
- 13:9 verdict supported_partial | label Not in the source
- 13:15 verdict not_supported | label Goes beyond the source
- 15:12 verdict not reviewed | label Nothing raised
- 18:8 verdict conflict | label Goes beyond the source
- 19:2 verdict conflict | label Not in the source
- 19:7 verdict conflict | label Not in the source
- 19:13 verdict conflict | label Goes beyond the source
- 20:8 verdict supported_partial | label Not in the source

## Problem 3. The two form checks

16:0 is not restored. The comma before and is already in the statement. The scan finds no miss. 15:24 is not restored. 7.2 is a decimal, and spelling it as seven would change the number. The scan finds no miss. 09:12 is still restored. It is relevance.

Comma hits:

None.

Number hits:

- 04:13: 8
  The number is written '8'. Write it as eight.
  Statement: The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.
- 09:10: 12
  The number is written '12'. Write it as twelve.
  Statement: The financial impact is small (approximately EUR 3 million in returns and rework) but the customer has placed HPC on enhanced quality monitoring for 12 months.
- 17:0: 11
  The number is written '11'. Write it as eleven.
  Statement: We are writing to inform you of a new investment in the Urbis Logistics Portfolio, a portfolio of 11 last-mile logistics properties located in major European urban areas.
- 19:6: 12
  The number is written '12'. Write it as twelve.
  Statement: We have responded with operational changes including a new Chief Operating Officer and a structured cost reduction programme targeting EUR 22 million of annualised savings; early progress is encouraging but the realisation timeline has lengthened by approximately 12 months.
- 20:7: 10, 12
  The numbers are written '10' and '12'. Write them as ten and twelve.
  Statement: We anticipate 10 to 12 platform investments over the four-year deployment period, with typical equity tickets in the EUR 300 to 700 million range.

What the model raised, beside what the scan says:

- 04:13 number_spelling. Shown now: yes.
  Model: The statement uses the numeral '8' for a number that should be spelled out according to the rule for numbers 0 to 12.
  Scan: The number is written '8'. Write it as eight.
- 09:1 oxford_comma. Shown now: no.
  Model: The list '4 percent above plan, and EBITDA of EUR 58 million was 7 percent above plan with margins of 18.3 percent' lacks an Oxford comma before 'and'.
  Scan: no hit
- 15:24 stored drop. Shown now: no.
  Model: The number '7.2' should be spelled out as it is below 13 and not a percentage, currency amount, date, age, or measured physical unit. Change '7.2 years' to 'seven years'.
  Scan: no hit
- 16:0 stored drop. Shown now: no.
  Model: The list 'hormonal balance, energy and recovery, skin and hair health, and pregnancy and postnatal nutrition' is missing an Oxford comma before 'and pregnancy and postnatal nutrition'.
  Scan: no hit
- 20:4 oxford_comma. Shown now: no.
  Model: The list 'three of the largest US public pension funds, two Asian sovereign wealth funds, and a number of European and North American family offices and endowments' is missing an Oxford comma before 'and a number of European and North American family offices and endowments'.
  Scan: no hit

One concern per rule. Two misses on one statement are two spans on that concern. The model is no longer asked. That half is visible on the next live pass, as B444 was visible on B446.

## Readability

Reason faults: 0. Partial cards that name the source and not the difference: 0. Unrecorded line: 2.
Longest reason: 16:10, 436 characters.

The source states that premium women's health is a structurally attractive emerging category, growing at approximately 14% annually in Europe. It also mentions that Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand. However, the source does not specifically mention the international expansion runway in France, Italy, Spain, and selectively in the US over a five-year hold.

## Invariants

Verdict fields unchanged: 261 of 261.
Catch: 13 of 13. Group A: 11 of 11.
Evidence leave-alone 48 of 74. Combined quiet 30 of 74.
With the sentence label: evidence leave-alone 48, combined quiet 30.
Before the relevance restore: 48 and 30. Label definition 48 and 30.
Editorial movement on the confirmed set: none. 16:0 and 15:24 are no longer restored. Removing those two false objections does not move the 48 or the 30.
Screen drift: 0. Export differs: 0. Wording notes shown: 0.

## Assertions that moved

tests/b467-agreement-reach.test.mjs required 08:3 and 14:2 to quote the evidence line. That kept the fallback and dropped the difference. The assertion now requires the difference sentence.

tests/b467-source-awareness-scope.test.mjs and the screen header test required the Oxford comma drop and the spelled-out drop to be shown. Those objections are false. The scan is the detector, so they stay dropped. 09:12 still comes back.

tests/b444-mechanics-scan.test.mjs required oxford_comma in the review prompt. The scan now finds it, so the prompt no longer asks. thousand_separator, currency_format, english_variant, and date_format stay.

tests/b180-style-fail-closed.test.mjs used a spanless oxford_comma concern as the example of a rule that is kept. The model concern is now dropped. The example is date_format, which is still kept when it has no span.

tests/style-percent-number-fixes.test.mjs and tests/f8-number-spelling-quarter.test.mjs required a model number_spelling concern on the numeral 7 to be kept. The scan finds that numeral. The model concern is dropped so it cannot arrive twice.

The screen header test and tests/reading-view.test.mjs required a conflict count taken from the verdict field, and required the fact line to lead while a card was labelled Conflicts with the source. The label is the count, and the conflict leads.

