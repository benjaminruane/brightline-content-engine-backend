# B406. The line shift, and whether the surfaces agree

| | |
|---|---|
| SHIPPED | This file. No product change. |
| Cost | USD 0. No model calls. |
| Evidence | `node scripts/diagnostic/b406/check.mjs` |

Notes on the clean set are the stored B403C notes. The matcher was re-run on stripped text. The note model was not called again.

## Part 1. The B405 regression

### G1. The line counts hold. The "only occurrence" claim does not.

`stripLeadingPageFurniture` on the four corpus files:

| Document | Lines before | Lines after | Removed |
|---|---:|---:|---|
| 3i | 120 | 120 | none |
| HICL | 58 | 56 | L1 and L6, both `HICL Infrastructure PLC` |
| GP Industries | 75 | 73 | L1 `Press Release`, L2 `For Immediate Release` |
| ClearPoint | 446 | 445 | L1 `Products  Pricing  Customer Stories  Resources  Newsroom` |

The counts in the spec hold, including 3i unchanged. The tail after the removed lines matches byte for byte.

The spec said HICL lost only line 1, and that the line was the only occurrence of `HICL Infrastructure PLC`. The file has that line twice. Line 6 is the same phrase. Both sit in the head, before the first real sentence, and both are dropped. The phrase occurs 2 times before the strip and 0 times after. `HICL Infrastructure` has the same counts, because those two title lines are the only places it appears. The body says `HICL` and `the Company`. It does not say `HICL Infrastructure`.

The name is treated as furniture because `isPageFurnitureLine` drops a line of 2 to 8 capitalised words with no verb and no sentence terminator (`lib/extract-boilerplate.mjs`). `HICL Infrastructure PLC` is three such words. It has no currency symbol, no percentage, and no year, so the keep-rule does not save it.

On the HICL clean draft the missing facts before the strip are `HCIL` on S1 and `budgets` on S2. After the strip there are three. The third is `HICL Infrastructure` on S0. S0 is a correct sentence on the clean ledger. That part of the spec holds.

GP Industries and ClearPoint lose head lines and do not move a clean fact. See G2.

### G2. The clean ledger moves.

Replayed with the stored B403C note bucket and the matcher on stripped text. 38 clean statements.

| | B403C | After the strip |
|---|---:|---:|
| demands | 3 | 4 |
| light | 5 | 5 |
| quiet | 30 | 29 |
| noise in demands | 0 | 1 |

The one move is HICL clean S0, ledger `correct`, from `nothing_to_raise` / quiet to `not_in_source` / demands. The missing fact is the name `HICL Infrastructure`.

HICL clean header, stored against the unstripped fixture:

`16 of 18 facts matched · 2 to look at · 1 worth a glance · 4 wording notes`

`2 facts are not in the source.`

Tiers on that draft: demands 2, light 1, quiet 5.

Same notes, stripped source:

`15 of 18 facts matched · 3 to look at · 1 worth a glance · 4 wording notes`

`3 facts are not in the source.`

Tiers: demands 3, light 1, quiet 4.

S1 (`HCIL`) and S2 (`budgets`) stay demands. No other clean statement changes tier.

### G3. Which line ids are now wrong

Two lines are removed, so the shift is not one step all the way down. Old L2 through L5 become L1 through L4. Old L1 and L6 are gone. An old id above 6 becomes that id minus 2.

`scripts/diagnostic/b403c/MEASURE.md` cites L16, L22, L25, and L40. After the strip those sentences are at L14, L20, L23, and L38. The extracts are still in the body. The ids no longer point at them.

`scripts/diagnostic/b404/WALKTHROUGH.md` cites L1, L6, L12, L16, L22, L23, L25, L30, L35, L36, L37, L38, L39, L40, and L58. L1 and L6 are the deleted title lines. The walkthrough's claim that `HICL Infrastructure` is matched on L1 and L6 is the match that the strip destroys. Every later id in that list is two lines high.

`scripts/diagnostic/b403c/runs/reading.json` and `scripts/diagnostic/b404/runs/reading.json` store 122 HICL rows that have both a `lineId` and an `extract`. After the strip, none of those extracts sits on that line number. They were counted against the fixture text, which still contains the two title lines. B405 did not rewrite fixtures.

`tests/fixtures/` has no `lineId`. The stored reviews carry `primaryExcerptStart` and `primaryExcerptEnd` into the source text saved on that review. Those offsets still match that saved text. They would not match a freshly stripped extraction of the same file.

The 3i fixture file and the source embedded in `clean-review.json` are not the same string (9,735 characters and 120 lines, against 7,441 characters and 98 lines). HICL's fixture file and the source on the HICL review are the same string. A line id from the 3i ledger is not a line id in the 3i review's sources view.

## Part 3. Do the card and the reading view agree

The check uses the source string stored on the review, because that is the string `primaryExcerptStart` indexes. A fact agrees when one of its occurrence lines is a line the primary excerpt occupies.

### A1. HICL clean and 3i clean

HICL. 8 statements have a primary excerpt. 5 agree (S3, S4, S5, S6, S7). 3 disagree.

- S0. The excerpt is L22, the expectations bullet. `HICL Infrastructure` is on L1 and L6, the two titles. `28 February 2026` is on L12. The benchmark `expectations` does sit on L22.
- S1. `HCIL` is not in the source, so it has no line. The card still shows an excerpt.
- S2. `budgets` is not in the source, so it has no line. The card still shows an excerpt.

3i. 12 statements have a primary excerpt. 5 agree (S2, S3, S4, S5, S14). 7 disagree. On every one of these the offset still brackets the excerpt. The disagreement is the line, not a missing string.

- S0. Excerpt L4-L5. `six` is on L2, L33, L44, L59, L83. `30 June 2025` is on L12.
- S1. Excerpt L39, the 13% sentence. `14%` is on L9 and L33.
- S8. Excerpt L20-L21, cut at `Su`. The name `3i` is not on those lines.
- S9. Same cut excerpt, L20-L21. `2.2%` is on L17, L23, L83. `GIC` is on L17 and L83. `3i` is not on L20-L21. `62.3%` is on L24.
- S11. Excerpt L32-L34, the 9% paragraph. `expectations` is on L89.
- S12. Excerpt L32-L34, which stops before TCR. `TCR` is on L35.
- S13. Excerpt L36-L37, the dividend sentence. The name `3i` is not on those lines.

S6, S7, and S10 have no primary excerpt (`excerptNotLocatable`). They are not in the 12.

### A2. The same string, two paths

`indexSourceLines` (the reading view) and a newline split of the same string (the text the sources drawer shows) return the same characters.

| Draft | Line | Text |
|---|---|---|
| 3i | L1 | `13 November 2025` |
| 3i | L12 | The 98% earnings sentence |
| 3i | L98 | `2` |
| HICL | L1 | `HICL Infrastructure PLC` |
| HICL | L12 | The interim update sentence, through `28 Febru` |
| HICL | L58 | `-Ends-` |

The sources drawer does not look up line ids. It shows the whole string. Given one string, a line id and a newline split land on the same text. They stop agreeing when they are handed different copies, which is the 3i fixture against the 3i review, in G3.

### A3. Text the user cannot find in the sources view

On these two reviews, every stored primary excerpt with offsets satisfies `source.slice(start, end) === passage`. Those quotes are in the drawer. The check found no decorated ` ... ` or `…` quote on these stored cards.

Three 3i cards (S6, S7, S10) show `The matching passage could not be located in the named source.` That sentence is not in the source.

A quote produced after B405 that contains `…` or ` ... ` has null offsets in stage 4. The drawer cannot scroll to it, and the decorated string is not a slice of the source.

The citation popover can show a further rewrite from `cleanEvidenceExcerptForDisplay`. That rewrite is not indexed, so a shortened popover body need not be the slice the drawer highlights.

## Part 4. Furniture as an attribute

The proposal: stop deleting furniture lines. Keep every line, mark the furniture ones, and let each surface decide whether to show them.

### F1. What would change

`extract-boilerplate.mjs`. `stripLeadingPageFurniture` stops being the function that returns a shorter string. It, or a sibling, returns the original text plus the indexes `isPageFurnitureLine` would have dropped. `isPageFurnitureSentence` stays, so a furniture sentence is still skipped when a quote is chosen.

`extract-text-from-source.mjs` line 442. Call the marker after `normaliseExtractedText` and store the indexes on the extraction metadata. Save the unstripped text.

`api/fetch-url.js` lines 88-90. Stop passing the fetched text through the deleter. Mark lines instead. This path collapses whitespace to one line before the call, so a line mark does nothing until the collapse stops eating newlines. That collapse has to stay in front of the marker, or the marker has to run on the text while it still has line breaks.

### F2. The 20,000 character clip

The clip runs after the strip. Keeping the lines puts those characters back inside the 20,000, and the body loses the same number of characters off the end. On these four files the removed heads are 0, 48, 36, and 57 characters, and only ClearPoint is over 20,000 (21,376 before, 21,319 after). A web page with a long menu can push a real paragraph past the clip.

Keep the furniture lines, and do not let them spend the budget. Take 20,000 characters of non-furniture text, and keep any furniture line that sits inside that span, so the line numbers of the saved string still match what was fetched.

### F3. Structure and extraction health

`structure` is built from the PDF page list or the officeparser chunks (`extract-text-from-source.mjs` line 443). It is not derived from the stripped string. Marking instead of deleting does not change it.

`computeExtractionHealth` (line 125) runs on the string that was saved. `textLength` and `numLines` are the stripped counts today (HICL 12,263 characters and 56 lines, against 12,311 characters and 58 lines on the fixture). They would go back to the full text. `hasCurrencyToken` and `hasDigits` do not move on these four files, because the removed lines contain neither. A short-text warning could move on a file whose head was a large share of a short extract. The 30% safety valve already refuses that case for the deleter.

### F4. The proposal is the right one

Deleting the line is what made a correct HICL sentence a demand. Both copies of the name were in the head, so there is nothing left for the matcher to find. A display flag hides the title in the drawer and keeps the line id, and the name stays findable.

If deletion stayed, the guard would have to be: do not drop a line when it is the last copy of a multi-word name. The currency, percentage, and year guards did not fire on `HICL Infrastructure PLC`. A last-copy guard would have, but only if it saw that both copies were about to go. Marking the line does not need that guess.

## Part 5. One mechanism

### P1. One index, two choices

The mechanism that already exists is the stored source string, split into lines, with a line id. The reading view and the sources drawer both read `sources[i].text`. On one string they agree, which A2 shows. No third locator is needed.

The card's Stage 4 passage is a different choice: a passage, not the matcher's first hit. It should keep choosing, and the passage should carry the line ids of the slice it came from. Furniture is a flag on those lines, not a second copy of the document.

### P2. What each surface changes

The card keeps `selectExcerpts` and records the line ids of `source.slice(start, end)`. A cap or a word-boundary cut stays inside that slice. The `…` and the ` ... ` are display marks. They are not characters in the stored passage, so the offset stays valid.

The reading view already uses the line id. It hides a furniture line unless a fact's only hit is on that line. HICL S0 is that case: the title is the only line with the name, so the chip still shows it.

The sources drawer already shows the string. It dims a furniture line. It does not remove it, so L22 stays L22.

The export does not show source text. Nothing to point.

The confirming passage and the disagreement passages follow the card. They show the same slice, with the same line ids.

### P3. What is lost if the card stops choosing

The matcher's line and the card's passage are not the same choice. On HICL S0 the matcher lands on the title (L1 and L6) and the card quotes the expectations bullet (L22). If the card stopped choosing, that bullet would not be the quote. A figure or a date that hits many lines would show the first hit, which can be a header or a table. The conflict excerpt, which is a second passage, would have nowhere to come from.

The card should keep choosing. What it stops doing is showing a string the drawer cannot find.

### P4. Stored reviews

Stage 4 and `gateExcerpt` stay. Reviews already stored have a passage string and character offsets into the text saved on that review. Those offsets are consistent with that text, including the pre-strip fixtures. Deleting the passage path would blank those cards.

A new review can add line ids. An old review without them still renders the passage. Re-extracting an old source and keeping the old offsets would point the offsets at the wrong place. That is the same bug as the line ids in G3. Old reviews should keep the source text they were run on.

## Part 6. The standing rule

Proposed wording, for a row P37 in `docs/BACKLOG.md` and a matching bullet in `ai/AI_OPERATING_MANUAL.md` under the lessons that are read before every spec:

Any change to extraction, boilerplate, or excerpt selection re-runs the clean ledger in `scripts/diagnostic/b403c/CLEAN-LEDGER.md` on the text that change would store, and reports demands, light, quiet, and noise in demands before it commits. The bar is demands 3, light 5, quiet 30, noise in demands 0. A statement that moves is named.

The operating manual is the file Cursor reads before a spec. A backlog row that the manual does not mention is not read on the next pass. P34 is the pattern: the rule is in the manual, and the backlog row points at it. P37 is the next free process id. This pass does not add the rule. It only writes the wording.
