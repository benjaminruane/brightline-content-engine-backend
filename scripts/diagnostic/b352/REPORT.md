# B352. A concern the source already made, a correction we can derive, and a second look before a quote is thrown away

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | unpushed | not yet run |
| frontend | not touched | -- |

Ids used: B352 (this spec), B353 (closed by Part 2).

Cost: USD 0. No model calls. No prompt change.

Browser: skipped. No layout, control, or copy change. No Review. Deterministic only, replayed from `tests/fixtures/real-runs-2026-09-29/`.

---

## Part 1. A concern the source already made is not a concern

### 0A-1  Places produced and filtered

Produced: Stage 6 LLM in `lib/qc/editorial-compliance-reviewer.mjs` (parse, span derive from quotes). `lib/qc/document-level-review.mjs` can append.

Filtered before the card: `assembleCard` drops `narrative_coherence` when the flag is off; the duplication judge; `applyConcernDuplicateMerges`.

Chose a new filter in `assembleCard` after spans are rewritten and the excerpt is gated, `applyEditorialSourceAwareness` in `lib/qc/editorial-source-awareness.mjs`. Stage 6 does not see sources (B178). Matched passages exist at assembly. Framing fidelity is a separate list and is not passed through this filter.

### 0A-2  S3, S8, S12 from the clean fixture

S3 flagged: "record year" (note quote; statement slice). Matched passage: "Action's new store expansion programme is on track for another record year with an excellent reception to the new stores in Switzerland and Romania." Substring holds.

S8 flagged: "generated significant proceeds" / "significant". Matched span: October financing and pro-rata redemption returning 944 million. No "significant". S12's span holds "a significant valuation uplift in TCR". Scope is the card.

S12 flagged: "Performance was driven primarily by share price gains at 3i Infrastructure plc". Matched passage: "This was driven primarily by a 14% increase in 3i Infrastructure plc's ("3iN") share price in the six-month period to 30 September 2025." Full span is not a literal substring. Three-word window "driven primarily by" is.

### 0B-1  AGREE, with an amend on S12

Drop when the flagged span, after `normalizePassageForComparison`, is a substring of a passage matched to that card. Concern is removed. Verdict recomputed. Does not count towards concern total, needs-attention, or colour. Slug `editorial_phrase_in_source`. Log at the writer.

AMEND: S12's full quoted span is not a literal substring of the matched passage. A three-word window of a longer span may drop. Two-word full spans still drop (S3 "record year").

### 0B-2  SHORT SPANS

Minimum two words for a full-span match. Single words never drop. S8 "significant" is one word and is not in that card's passages, so it survives either way. The floor exists so "the" / "of" inside one passage cannot coincide by chance.

### 0B-3  AGREE

No note-only display for a dropped concern. Card-level `editorialNote` is the empty-clean line, not a per-concern comment. Drop the concern and record the slug. Do not invent a surface.

### 0B-4  AGREE

Framing fidelity untouched.

### Tests

T1 S3 dropped. T2 S12 dropped. T3 S8 survives. T4 S3 colour amber to green, needsAttention true to false, review editorial.concerns 3 to 1.

Correct writing this could now change: a writer who used the source's "record year" or "driven primarily" may leave those phrases standing instead of deleting them on a craft flag.

---

## Part 2. Dates and scale words in the pairing

### 0A-3  CONFIRMED

`findCandidatePairs` skipped dates: `if (draft.kind === "date") continue;` in `lib/revise-actions/conflict-engagement.mjs`.

Scale participates as identity, not as a comparable dimension. `kindKey` is `money:million:GBP` vs `money:billion:GBP`, so million and billion cannot pair.

### 0A-4  Printed today, before this spec, on doctored S0

Statement: "3i Group delivered a total return of GBP 3.3 million for the six months to 30 June 2025..."
Displayed excerpt: "3i Group delivered strong performance in the first half of FY2026 • Total return of £3,291 million or 13%..."

`findCandidatePairs` returned `[]`.

Nothing paired. Same scale (million) and same currency (GBP), but `namesMatch` Jaccard is 2/11 (source names {total, return} vs a wide draft window). Not already derivable after B347. The pair was missing, and the names bind was too strict for a tight source window.

### 0B-5  AGREE

Dates pair when the source passage asserts a date for the same subject, unique bind, both month+year. Parenthetical dates are not asserted. Ambiguous bind stands down (`continue`), and does not abort money pairs.

### 0B-6  AGREE

Magnitude is part of the quantity. Money pairing allows different scale. Source names covered by the draft window bind to the total-return figure, not the empty-named prior-year £2,046 million.

### 0B-7  The S0 date is not offered

The source's "six months to 30 September 2025" sits in the document title, not the passage matched to S0. The displayed excerpt has September 2024 only inside a parenthetical. Date correction is not offered. Stated, not engineered around.

### Tests

T5 offers `Replace 'GBP 3.3 million' with '£3,291 million'.` Date stays 30 June 2025.
T6 offers the date when it is in the displayed passage.
T7 two source dates, no proposal.
T8 B336 still withholds 119 to 330. B345 visibility still withholds a pair whose source figure is not on the card.

Correct writing this could now change: a writer who put 3.3 million instead of 3,291 million is offered the displayed figure. A writer who put June instead of September is offered the date only when that date is on the card.

---

## Part 3. A rejected quote gets one forgiving look before it is binned

### 0A-5  CONFIRMED

Before this spec, `normalizeValidResponse` in `lib/qc/pipeline-v4/stage2-match-sources.mjs`:

```
    if (!validation.accepted) {
      ...
      passage = "";
      passageRejected = true;
    }
```

`validatePassageAgainstSource` is a normalised substring. Recovery is `recoverExcerptFromSource` in `lib/qc/excerpt-from-source.mjs`. Guards: empty pointer, empty source, similarity floor 0.85, `figuresAgree` (numbers, currency codes, multi-word proper nouns, months) inside `acceptSlice`. `excerpt-from-source.mjs` has no imports. Stage 2 did not import it. No cycle.

### 0B-8  AGREE

On rejection, recover against the same source before blanking. Success keeps the source slice and the classification. Miss blanks and sets `passageRejected` as today. B351 empty confirmation still applies.

### 0B-9  AGREE

Invented passages still reject. Figures guard still runs (T11 EUR 95 vs 59).

### 0B-10  AGREE

Log `[stage2] passage recovered` / canary `stage2_passage_recovered`, distinct from accepted and from `stage2_passage_rejected`.

### Tests

T9 near miss "recorded" vs "achieved" recovers; confirmed survives.
T10 invented sentence rejected; partial class kept (B251).
T11 figures-guard miss; confirmed empty then B351 not_reviewed.
T12 S10: recorded passage is empty, offsets null, `primaryExcerpt` null. Original pointer is not in the fixture. Recovery cannot run. Empty confirmation still refused.

Correct writing this could now change: none on S10, because the pointer is gone. A near-miss matcher quote can now stay on the card instead of disappearing.

---

## Fifteen-row control (clean fixture)

Evidence verdicts relative to the recorded payload. B351 already moved S6, S7, S9, S10. This spec does not move any evidence verdict.

| # | Recorded verdict | After verdict | Concern / excerpt notes |
|---|------------------|---------------|-------------------------|
| S0 | conflict | conflict | catch kept |
| S1 | supported_partial | supported_partial | excerpt is the 14% PE span (B351) |
| S2 | supported_full | supported_full | |
| S3 | supported_full | supported_full | "record year" concern dropped (B352) |
| S4 | supported_full | supported_full | paraphrase kept |
| S5 | supported_full | supported_full | catch kept |
| S6 | unverifiable | supported_full | B351 |
| S7 | unverifiable | supported_full | B351 |
| S8 | supported_full | supported_full | "significant" survives; excerpt not mid-word (B351) |
| S9 | conflict | supported_full | B351 |
| S10 | unverifiable | not reviewed | B351; pointer not recoverable (B352 T12) |
| S11 | supported_full | supported_full | outperformed-expected-returns excerpt (B351) |
| S12 | supported_full | supported_full | "driven primarily" concern dropped (B352) |
| S13 | supported_full | supported_full | pence-to-pounds kept |
| S14 | supported_full | supported_full | |

---

## C3. Tests whose behaviour changed

`tests/card-honesty-invariant.test.mjs` T9. S3 and S12 now drop editorial concerns. The control still forbids evidence-verdict movement and forbids new findings. The assertion was widened to allow those two drops. Correct: that is Part 1.

No other existing test was rewritten to hide a miss.
