# B364. Corrections follow house style, the source can name itself, and a quote must earn its place

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | pending push | pending |
| frontend | not touched | |

Ids used: B364 (this spec). Filed **B365** (skipped recovery for empty confirmation). Succeeds B363. Addresses B58 part five.

Cost: USD 0. No model calls.

Browser: skipped. Prompt and copy. No layout, control, or card-face chrome change. Cards checked by replaying `tests/fixtures/real-runs-2026-09-29/`. Implement Changes checked through `fillAction`.

---

## Design decisions

1. **House style runs on the offered token, not on the pair internals.** `lib/revise-actions/house-style-offer.mjs`. `findCandidatePairs` still records the source glyph. `buildReplaceProposal` restyles `pair.to` before the sentence is offered. The source quote is never rewritten. License accepts the ISO form of an excerpt glyph so `GBP 3,291 million` is licensed by `£3,291 million`.
2. **Style rules applied to the offer.** Unambiguous currency glyphs (`£` to GBP, `€` to EUR, `US$` to USD). Percent-word to `%`. US, abbreviated, and ISO dates to DD FullMonth YYYY. Curly quotes to straight. Unicode em/en dash to hyphen. Idempotent on ISO currency and on dates already in house form.
3. **Style rules not applied, and why.** `thousand_separator` would change `3,291` to `3'291` against the ruling that digits stay as the source wrote them. `number_spelling` and `english_variant` would rewrite the source's own words. `oxford_comma` and `defined_term` are not token-level. `first_person` and register are not a replacement token. Bare `$` and the yen glyph are not a unique ISO code. Slash dates collide MDY with DMY.
4. **Source self-name is read from the opening, not from a setting.** `lib/qc/source-self-name.mjs`. Window: first 1500 characters, or up to the first bullet if that bullet sits near that bound. Pattern: a Title-Case or digit-initial name, optional company words, then `announces` / `announced` / `reports` / `reported`. One hit required. Several different names stand down. Several sources must share one name. `AUTHOR-NAME-BLIND` is declared: the name being read is the party the source uses of itself.
5. **First person is resolved only on the source passage.** `leadingActor` still stands down on a draft `we`. On a confirming passage, `first_person` is replaced by the self-name when one exists. Existing actor stand-downs are unchanged: no passage, draft first person, no actor, two opening names, already a conflict, unverifiable, commentary not reviewed.
6. **A second passage must add something.** `keepSecondPassage` in `lib/qc/excerpt-pair.mjs`. A candidate with none of the claim's terms is dropped. On a conflict face, any claim term is enough (the GIC span is `partially_confirmed` and would otherwise lose `2.2%` / `acquire` already shown on the October primary). On a non-conflict face the candidate must add a term the primary does not already show.
7. **The quote chooser does not look at adjacent cards.** Cards are independent. Coupling to assembly order is hard to reverse. The October quote already contains `two financing transactions`, so the comment is supported without reading the repricing card. Overlapping stretches of one paragraph can be the right quote for two different claims.
8. **Confirmation inside a conflict is marked only on a non-green card.** `markConfirmingInsideConflict` rewrites Additionally / Also / Moreover / Furthermore / In addition on a confirming sentence to `Separately`. It runs next to the R3 match-clause drop, after actor, role, and scale demotions. Green cards keep Additionally. Recorded DOC S5 never had the live Additionally sentence; the helper is tested on that live string.
9. **Part five is prompt only.** Stage 5 is told to lead with the finding on a non-green card. Existing inventory and no-invented-support rules stay. Wording is not tuned against this run.

---

## New files created

- `lib/revise-actions/house-style-offer.mjs`
- `lib/qc/source-self-name.mjs`
- `tests/b364-house-style-source-quote.test.mjs`
- `scripts/diagnostic/b364/REPORT.md`
- `scripts/diagnostic/b364/dump-cards.mjs`
- `scripts/diagnostic/b364/card-display.json`

---

## Part one. A correction follows house style

Pair internals still hold `£3,291 million`. The offer is `GBP 3,291 million`. Digits `3,291` and the scale word `million` are unchanged. `GBP 3,291 million` already in ISO form is unchanged.

Must-pass on doctored S0: `Replace 'GBP 3.3 million' with 'GBP 3,291 million'.`

---

## Part two. Resolve "we" in the source to the source's own name

Opening hit on both fixture sources: `3i Group plc announces results for the six months to 30 September 2025`.

Doctored S14 statement: `Looking ahead, the UK government maintains its cautious stance...`. Confirming passage: `We remain cautious in the deployment of capital into new investment...`. After: `conflict` / high / `actor_mismatch`. Comment leads with `The statement attributes this to UK; the source credits 3i Group plc.`

Clean S14 statement uses `management`, not a vocabulary name. Actor stands down. Verdict stays `supported_full`.

A draft written in the first person still stands down. A source whose opening does not identify itself stands down.

---

## Part three. A second passage must add something

### Private equity, both payloads

Statement (clean): private equity `accounted for the vast majority of the overall total return`.

Primary quote (unchanged in substance; the 14% PE return):

```
Our Private Equity business delivered a gross investment return of £3,234 million or 14% (September 2024:
£2,071 million, 11%).
```

Second quote before (B363):

```
The total return of 13% represents a very good first half for the Group.
```

Second quote after: none. The 13% line adds no claim term the primary does not already show. `vast majority` is not in that line.

### Adjacent-card decision

No. See design decision 7. October S6 quote still contains `two financing transactions` and the comment names those transactions.

### GIC second passage kept

Doctored S9 is a conflict face. The GIC span carries `2.2%`. That is a claim term, so the second slot stays. Unique-term-only would have dropped it because those needles already sit on the October primary.

---

## Part four. Mark a confirmation inside a conflict

Identifying the confirming sentence is safe: `sentenceConfirms` already exists. Continuing connectives on a confirming sentence become `Separately` on a non-green card.

Live net-sales string (not in the recorded DOC S5 comment):

Before:

```
The periods do not match, leading to a conflict in the reported figures. Additionally, the source confirms a like-for-like sales growth of 6.3%, which aligns with the statement.
```

After:

```
The periods do not match, leading to a conflict in the reported figures. Separately, the source confirms a like-for-like sales growth of 6.3%, which aligns with the statement.
```

Recorded DOC S5 has no Additionally clause (B363 already dropped the match sentence). Green CLEAN S7 keeps `Additionally, the source verifies`.

---

## Part five. Lead with the finding

Prompt only. `lib/qc/pipeline-v4/prompts/stage5_v2.md`. A card that is not green opens with what is wrong, in one sentence, before any restatement. Partial, conflict, and not-supported branches repeat that. Inventory and no-invented-support stay. Not tuned against this run.

---

## Part six. Diagnose. Read-only. No fix.

The MPM and MAIT sentence. Recorded payload (both clean and doctored S10): `supportState` `supported`, `displayVerdict` `unverifiable`, `primaryExcerpt` null, empty confirmed span, Stage 2 fingerprint `confirmed` with no `emptyConfirmationRefused` flag. Replay of that recorded state runs B359 `locateClaimSentencesInSources` and recovers:

```
• Our Private Equity team completed the realisation of MPM and signed the realisation of MAIT in the period . ... The sales
achieved sterling money multiples of 3.2x and 2.8x respectively.
```

Live on build `438169f`: `supportState` `skipped`, classification `not_reviewed`. B359 never fires.

### a. What differs between the two runs

Recorded S10 is a post-assembly card from a run that kept `confirmed` plus an empty passage, then stamped Unverifiable (B325 / B351 honesty). Live Stage 2 `applyEmptyConfirmationRefusal` rewrites that pair to `not_reviewed` with `emptyConfirmationRefused: true` before aggregation. Stage 3, with every pair `not_reviewed`, returns `not_reviewed`. Stage 7 maps that to `skipped`. The stored fingerprints on the recorded card do not carry the refusal flag, so a dump replay still looks like supported-plus-empty and recovers.

### b. What "skipped" means here

Not a matcher decline in the sense of `no_support`. The matcher returned `confirmed` with an empty passage. That output was discarded later by `applyEmptyConfirmationRefusal` in `lib/qc/pipeline-v4/stage2-match-sources.mjs`. Stage 3 then has no reviewed pair. `mapVerdictToSupportState` in Stage 7 maps `not_reviewed` to `skipped`. A second skipped producer exists: evidence off (`buildSkippedEvidenceQcCard`). Those are different.

B359 locate runs only when `supportState` is `supported` or `partial`, and only when there is no pointer, no locatable span, and no `passageRejected` / `emptyConfirmationRefused` match. Live hits both gates.

### c. Should B359 also run on a skipped card?

Not on every skipped card. Evidence-off skipped (B247) and matcher-throw `not_reviewed` (B250) must not grow a quote and look reviewed. The empty-confirmation subset is the candidate: the matcher said confirmed, the passage was empty, the writer refused it. Risk of widening to all skipped: a check that did not run, or a pair that failed, would be painted as Confirmed. Filed **B365**.

### d. How often "skipped" appears in tests/fixtures

463 cards scanned under `tests/fixtures`. 2 skipped, both `tests/fixtures/b247/r4-editorial-only.json`, both with evidence off. No correlation with empty confirmation. Fixture skipped and live S10 skipped are different producers.

### e. Best hypothesis and cheapest test

Hypothesis: live S10 is empty-confirmation refusal, not a matcher miss and not evidence off. The recorded payload predates that refusal at the Stage 2 writer, so dump replay still recovers.

Cheapest test: replay recorded S10 as today (B359 recovers). Then stamp the match `not_reviewed` plus `emptyConfirmationRefused: true` and replay; the card stays skipped with no quote. No new model call. Not built here.

---

## Cards whose comment, quote, or verdict changes versus B363

House-style offer is not a card field. Three card-face moves:

| Card | What moved |
|------|------------|
| CLEAN S1 | Second quote dropped (13% total-return line). Verdict still `supported_partial`. Comment unchanged. |
| DOC S1 | Second quote dropped. Verdict still `supported_full`. Comment unchanged. |
| DOC S14 | Verdict `supported_partial` to `conflict`. Reason `actor_mismatch`. Comment prepends the 3i Group plc sentence. |

### CLEAN S1 comment (unchanged)

```
The source confirms that the private equity business generated a gross investment return of 14% for the period. However, it does not explicitly state that this accounted for the vast majority of the overall total return. The total return for the group was 13%, which suggests alignment, but the source does not directly attribute the majority of this return to the private equity business. The reviewer should consider clarifying or sourcing the claim about the private equity business's contribution to the overall total return.
```

### DOC S14 comment, after

```
The statement attributes this to UK; the source credits 3i Group plc. The source confirms the cautious stance on capital deployment into new investments and the openness to selective allocations to lower-risk reinvestments. However, it does not specifically mention the UK government, which is a key element of the statement. The reviewer should either find a source that explicitly references the UK government's position or adjust the statement to align with the broader scope presented in the source.
```

Dump versus recorded still lists 22 moved cards. Those extra moves are prior specs (B359 quote recovery, B360/B362 second slot, B362 scale, B354 actor on DOC S8). B364-specific moves versus B363 replay are the three rows above.

---

## Tests whose expectation moved, and why

- `tests/pairing-dates-and-scale.test.mjs` T5: the offered replacement is `GBP 3,291 million`, not the glyph. Pair internals still hold the glyph.
- `tests/b360-two-passages.test.mjs` S1: one passage. The 13% line adds nothing to `vast majority`.
- `tests/b362-silence-and-scale.test.mjs` "two distinct passages": uses doctored S9 (GIC), not clean S1.

New: `tests/b364-house-style-source-quote.test.mjs`.

---

## Not done

Part six is diagnosis only. Filed **B365**.

Part five is not verified on a live Review. Prompt change only.

Slash dates, yen, bare `$`, thousand separators, number spelling, English variant, Oxford comma: not applied at offer time. Reasons in design decision 3.

Adjacent-card quote awareness: not built. Decision 7.

The actor sentence still names the draft party as `UK` (first-six-words vocabulary hit), not the words `UK government`. The source party is `3i Group plc`.

Frontend: none.

Live Additionally on net sales is not in the recorded DOC S5 comment. Assembly will mark it when Stage 5 emits that connective on a non-green card.
