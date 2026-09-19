# Fidelity and identity audit

Read only on recorded payloads, plus one Review of recovered PDF text. No spec. No production-path change. HEAD at start: `050313c`.

Rank question: could a reviewer be shown something they did not write, or be pointed at the wrong place?

**They differ. Say this first.** On recovered PDF text the splitter copies mid-sentence hard line breaks into the card statement. The passage matcher and the card excerpt flatten those line breaks to spaces. Typed fixtures never contain that class of text, so the eight b247 states and both accuracy corpora cannot see it. The drawer still lands on the right region. The quote on the card is not the same bytes as the source slice it claims.

---

## Prove the method can fail

Copies of `r1-ready`. Not committed.

Word corruption (400 million to 401 million on the card):

| | |
|--|--|
| kind | wording |
| draft slice | `Oakfield Partners closed Fund III at EUR 400 million in March 2025.` |
| card text | `Oakfield Partners closed Fund III at EUR 401 million in March 2025.` |

Range corruption (start 0 to 10, end 67 to 77):

| | |
|--|--|
| kind | wording |
| A2 | off_by_many, foundAt 0 |
| draft slice | `artners closed Fund III at EUR 400 million in March 2025. The fund ` |
| card text | `Oakfield Partners closed Fund III at EUR 400 million in March 2025.` |

Both caught.

---

## Part 1. Card statement vs draft

Drafts reconstructed from `scripts/diagnostic/delivery-check/record-claim-states.mjs` (fixtures do not store `draftText`). long-past-caps and compound-multi-source from the integrity run have no stored cards; they are not in these tables.

### A1 exact / whitespace / punctuation / wording

| state | cards | exact | whitespace | punctuation | wording |
|-------|-------|-------|------------|-------------|---------|
| r1-ready | 2 | 2 | 0 | 0 | 0 |
| r2-conflict-first | 1 | 1 | 0 | 0 | 0 |
| r2-conflict-second | 1 | 1 | 0 | 0 | 0 |
| r3-evidence-only | 2 | 2 | 0 | 0 | 0 |
| r4-editorial-only | 2 | 2 | 0 | 0 | 0 |
| r5-excluded-source | 2 | 2 | 0 | 0 | 0 |
| r6-near-limit | 10 | 10 | 0 | 0 | 0 |
| r6-unsupported | 2 | 2 | 0 | 0 | 0 |
| **typed total** | **22** | **22** | **0** | **0** | **0** |
| recovered-shopify-messy-prefix | 17 | 17 | 0 | 0 | 0 |

A1 inexact cases on typed: none. Recovered A1 is exact because the card keeps the extractor's newlines. Example, card 1 statement (verbatim, newline is real):

```
We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider
of e-commerce software to SMBs.
```

That is `draft.slice(118, 244)`. The PDF sentence was one line. The card shows two.

### A2 ranges

| state | pointerOk | offByOne | offByMany | outside | overlap |
|-------|-----------|----------|-----------|---------|---------|
| r1-ready | 2 | 0 | 0 | 0 | 0 |
| r2-conflict-first | 1 | 0 | 0 | 0 | 0 |
| r2-conflict-second | 1 | 0 | 0 | 0 | 0 |
| r3-evidence-only | 2 | 0 | 0 | 0 | 0 |
| r4-editorial-only | 2 | 0 | 0 | 0 | 0 |
| r5-excluded-source | 2 | 0 | 0 | 0 | 0 |
| r6-near-limit | 10 | 0 | 0 | 0 | 0 |
| r6-unsupported | 2 | 0 | 0 | 0 | 0 |
| recovered-shopify-messy-prefix | 17 | 0 | 0 | 0 | 0 |

### A3 consecutive order

All nine states: in order, overlaps 0. Recovered card 0 is `Date: October 12, 2010` at [83, 105], after dropped header lines. Remaining cards follow draft order.

---

## Part 2. Quoted passages vs source

### B1

| state | exact | whitespace | punctuation | wording | noSource | offsetMismatch |
|-------|-------|------------|-------------|---------|----------|----------------|
| r1-ready | 4 | 0 | 0 | 0 | 0 | 0 |
| r2-conflict-first | 3 | 0 | 0 | 0 | 0 | 0 |
| r2-conflict-second | 3 | 0 | 0 | 0 | 0 | 0 |
| r3-evidence-only | 4 | 0 | 0 | 0 | 0 | 0 |
| r4-editorial-only | 0 | 0 | 0 | 0 | 0 | 0 |
| r5-excluded-source | 4 | 0 | 0 | 0 | 0 | 0 |
| r6-near-limit | 16 | 0 | 0 | 0 | 0 | 0 |
| r6-unsupported | 1 | 0 | 0 | 0 | 0 | 0 |
| **typed total** | **35** | **0** | **0** | **0** | **0** | **0** |
| recovered-shopify-messy-prefix | 2 | 30 | 0 | 0 | 0 | 15 |

r4 has no quotes (evidence off). Typed inexact cases: none.

Recovered B1 inexact, one pair verbatim (card 1 supportSpan):

| | |
|--|--|
| source slice at [118, 244] | `We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider\nof e-commerce software to SMBs.` |
| passage on the card | `We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider of e-commerce software to SMBs.` |

Same words. Newline vs space. 15 supportSpans have offsets whose source slice is not byte-equal to the stored passage. `locatePassageInSource` repair-normalises whitespace, so the highlight region is still that sentence. The stored passage string is flattened.

### B2 card quote vs drawer highlight

Drawer uses locatable `supportSpans` start/end into `sources[].text` (`StatementReviewCard.jsx` `resolveLocatableSupportSpan`). `primaryExcerptStart` / `End` are null on every typed card.

| state | exact match | whitespace-only | mismatch wording | no locatable span | no card quote |
|-------|-------------|-----------------|------------------|-------------------|---------------|
| r1-ready | 2 | 0 | 0 | 0 | 0 |
| r2-conflict-first | 1 | 0 | 0 | 0 | 0 |
| r2-conflict-second | 1 | 0 | 0 | 0 | 0 |
| r3-evidence-only | 2 | 0 | 0 | 0 | 0 |
| r4-editorial-only | 0 | 0 | 0 | 0 | 2 |
| r5-excluded-source | 2 | 0 | 0 | 0 | 0 |
| r6-near-limit | 8 | 0 | 0 | 0 | 2 |
| r6-unsupported | 0 | 0 | 0 | 1 | 1 |
| recovered-shopify-messy-prefix | 0 | 16 | 0 | 0 | 1 |

r6-unsupported card 0 (Northaven sale, verdict conflicting):

| | |
|--|--|
| card statement | `Northaven Logistics sold its Scandinavian depot network for EUR 90 million in January 2026.` |
| card primaryExcerpt | `Oakfield Partners closed Fund III at EUR 400 million in March 2025. The fund invests in European manufacturing companies. This note is for internal reporting only.` |
| supportSpans | `[]` |
| drawer | cannot highlight |

The excerpt is an exact substring of the Oakfield source. It is not a substring of the draft. The magnifier has nothing to point at.

### B3 truncation at 400 / 300

None of the typed quotes or the recovered quotes sat at those caps. Nothing to tell the reader because nothing was truncated. Caps remain silent when they do fire (integrity **B251** / excerpt 300).

---

## Part 3. Identity

| state | ids | unique | index = position | index = draft order |
|-------|-----|--------|------------------|---------------------|
| r1-ready | 0,1 | yes | yes | yes |
| r2-conflict-first | 0 | yes | yes | yes |
| r2-conflict-second | 0 | yes | yes | yes |
| r3-evidence-only | 0,1 | yes | yes | yes |
| r4-editorial-only | 0,1 | yes | yes | yes |
| r5-excluded-source | 0,1 | yes | yes | yes |
| r6-near-limit | 0..9 | yes | yes | yes |
| r6-unsupported | 0,1 | yes | yes | yes |
| recovered-shopify-messy-prefix | 0..16 | yes | yes | yes |

C3. Downstream treats ids as ordinals because they are minted that way:

- `api/analyse-statements.js` L280: `id: String(card.index)`
- `lib/qc/pipeline-v4/stage2-match-multipassage.mjs`: `statementId: String(statementIndex)`
- frontend `statementIdOf`: `row.id`, else `qcCard.index`
- `appliedDecisions.js`: store keyed by `analysisRunId`, then statement id
- revise-actions / action list: `statementId` on each entry, finding id `S{statementId}:{n}`
- `findStatementRow`: `qcCard.index` or `String(id)`

A reused id inside one review would attach a decision to the wrong sentence. Not observed. A new Review remints `0..n` under a new `analysisRunId`, so cross-run collision is gated on the run key.

---

## Part 4. Added text

D1. Statement with no corresponding draft span: none.

D2. Quoted passage that appears in no supplied source: none. (r6-unsupported excerpt is in the Oakfield source.)

D3. Sample, not exhaust. Tokens harvested from `evidenceSummary`, `reasoningParagraph`, `editorialNote`, `complianceNote` with a figure regex, a date/period regex, and a two-to-four-word Title Case regex. A token counts if it is not a literal substring of draft plus sources.

Typed eight states: 0 hits.

Recovered: 12 hits, all figure expansions in commentary (`$7mm` to `7 million`, `$132mm` to `132 million`, `$1mm` / `$1.3m` to `1 million` / `1.3 million`). Sample is every card in that one Review, those four fields only. Suggested rewrites and Stage 2 explanations were not harvested.

---

## Part 5. Recovered text vs typed text

PDF: `scripts/diagnostic/r7-samples/Shopify_text_longform_messy.pdf`. Extractor finished (`officeparser`, status `ok`, 22163 chars, about 191 sentences). Full memo as a Review would have exceeded the USD 1 budget (estimate about USD 8). The Review used lines 1 to 29 of that extract (2001 chars) as both draft and source. Fixture: `tests/fixtures/b247/recovered-shopify-messy-prefix.json`.

Also extracted, not Reviewed: `Shopify_text_longform_clean.pdf`, `native_typography.pdf`, `native_clean.pdf`, `multipage.pdf`, `Investor_letter_InvestorLetter_V1_20260918.pdf`. All finished.

### Parts 1 to 3 beside typed

See the tables above. Typed A1/B1 exact. Recovered A1 exact (newlines kept on the statement). Recovered B1 2 exact / 30 whitespace. Recovered B2 0 exact / 16 whitespace-only.

### Do the splitter and the passage matcher behave the same on recovered text as on typed text?

No.

- **Splitter (Stage 1):** still an exact substring of the draft, including hard line breaks. It also dropped 6 header/transition lines as non-claim (`[stage1] dropped 6 non-claim statement(s)`), and kept `Date: October 12, 2010` as a not-supported card. Typed drafts have no headers, so they never show that.
- **Passage matcher:** returns a flattened passage. Offsets are translated through `repairNormaliseWithMap`, so the drawer covers the line-broken region. The string on the card is not `source.slice(start, end)`. Typed drafts have no mid-sentence newlines, so B1 stays exact there.

**Scope.** This class is invisible on every hand-typed fixture in b247 and on both accuracy corpora, which are the same kind of tidy text. It is not a handful of cards. It is the wrong kind of input for the thing under test. It does not mean typed A1 is a lie: on typed text the card still says what the user wrote.

### Artefacts looked for

| Artefact | Hit? | Example |
|----------|------|---------|
| Hard line breaks inside sentences | yes | `a provider\nof e-commerce software` |
| Words hyphenated across a line ending | no | 0 matches of `letter-\nletter` in the extract |
| Repeated headers and footers | yes | leading `Shopify` / `To:` / `From:` / `Re:` lines; 6 dropped as non-claim |
| Page numbers in the flow | no | 0 lone numeric lines in this extract |
| Curly quotes | not in Shopify messy extract (0). yes in `native_typography.pdf` extract (`“robust and well-diversified”`) | Shopify Review did not include that file |
| Ligatures | no | 0 in every file extracted |
| Curly apostrophe damage | yes | extractor wrote `Shopify n s`, `That n s`, `they n d`, `n App Store n`. Card 14 statement is `Shopify n s target focus...`. That is exact to the extract, not to the PDF |
| Em dash in extract | yes | First line of the Shopify messy extract contains U+2014 between Shopify and Long-form memo |

`native_typography.pdf` keeps curly quotes, en dashes, and an em dash, and still wraps `company's\nstrong momentum`. Not Reviewed (budget).

---

## Ranked by the one question

1. Recovered text: card excerpt flattened, statement keeps extractor line breaks; ` n s` apostrophes shown as the user's words. Drawer region is right; bytes on the card are not the source slice. Typed corpora cannot see it. **B257**, **B258**.
2. r6-unsupported conflict card pastes the entire unrelated Oakfield source as the excerpt and has no locatable span. Reviewer is shown the wrong document's text with nowhere to point. **B259**.
3. Recovered header `Date: October 12, 2010` becomes a not-supported card; six other header lines vanish with no user report. **B260**.
4. Stage 5 commentary expands `$7mm` to `7 million`. Sampled. Not on the statement face. **B261**.
5. Typed b247 A1/A2/A3/B1 exact. No rephrased statement on those eight states.

---

## What this method still cannot see

- A rephrase that Stage 1 then maps with Levenshtein <= 2 (would still be an exact slice of the draft, not of the model text).
- long-past-caps and compound-multi-source (no stored cards).
- The remaining 160-odd sentences of the Shopify memo (not Reviewed).
- Ligatures, hyphenated line-ends, page-number lines (looked for, not present).
- Whether the frontend renders a `\n` inside `qcCard.statement` as a line break or a space.
- Accuracy of verdicts.
- `primaryExcerptStart` is unused; a future writer could diverge from `supportSpans` without this check noticing until B2 is run.

---

## Cost

Parts 1 to 4: USD 0. Part 5 estimate USD 0.30 to 0.50 for one short Review. Full Shopify extract is about 191 sentences; that Review was not run. Actual: USD **0.9541**, 85 generations, 0 unpriced, all `gpt-4o-2024-08-06`, Langfuse `calculatedTotalCost` on trace `3a7e6228-ae7e-4bb2-9e59-c71855734e20` (same as trace `totalCost`). Under the USD 1 budget. Over the 0.30-0.50 estimate because the slice produced 17 cards, not about 8.
