# Silence copy and unshown excerpt — design

Read-only design pass, 2026-09-10. No product code changed. No pipeline, extract, or evidence pass. No LLM calls. Metered spend for this pass: **USD 0.00**. The only file written is this one.

**Precedent.** In-folder diagnostic notes (`scripts/diagnostic/delivery-check/findings.md`, `scripts/diagnostic/accuracy2/readiness-findings.md`). Input is `findings.md` at `b3811e2`. Where this brief and that document disagree, the document wins and this note says so. Where the document and the code disagree, the code wins and this note says so.

**Stored run for counts.** `scripts/diagnostic/accuracy/runs/evidence-pass-lift-1/cards.json` (261 cards). Same run as the findings.

---

## Part 0. Claims carried forward

### C1 BLOCKING — silence copy on every conflict-free partial

**Verdict: confirmed. The code does this today. The predicate is not “did a source speak?”. It is “evidence gap, and no conflict signal”.**

Claude’s reading matches `findings.md` Q5/Q6 and matches `lib/revise-actions/sort.mjs` + `silence.mjs`.

Exact chain:

1. `runActionList` → `buildSortedEntries(statements)` (`sort.mjs` L102–104).
2. For every finding, `silenceOnCard = statementIsSilent(finding.card)`.
3. `statementIsSilent` (`silence.mjs` L94–98):
   - card is a non-null object
   - **and** `isEvidenceGap(card)` is true
   - **and** `sourceSpokeTestsFired(card).length === 0`
4. `isEvidenceGap` is true when `supportState` is in `{ partial, partially_confirmed, not_supported, no_support, conflicting }` **or** `displayVerdict` is in `{ supported_partial, not_supported, no_clear_support, no_support, conflict }`. A live conflict-free partial (`supportState: "partial"`, `displayVerdict: "supported_partial"`) is therefore a gap.
5. `sourceSpokeTestsFired` only runs `STRUCTURAL_TESTS` (`silence.mjs` L47–80). Every test is a **conflict** signal (`supportState`/`displayVerdict` conflicting, `hasConflict`, Stage 2 fingerprint `conflicting`, unsupported-span `conflicting`, claim role conflict, nonempty `conflictExcerpt` / `conflictValues` / `conflictEvidence`). A confirming or partial classification, a nonempty `primaryExcerpt`, and a widened `supportSpan` **do not count**. B149 removed span-conflict from this list on purpose (`tests/revise-actions-silence.test.mjs`).
6. So a conflict-free partial with a quoted passage is still silent.
7. `sortFinding` for `kind === "evidence"` (`sort.mjs` L75–77): `if (silenceOnCard) return acknowledge(..., "silence_no_edit")`.
8. Copy (`sort.mjs` L13–14): `"No supplied source speaks to this claim, either way. Nothing is proposed and the wording is yours."`
9. Frontend paints that string under the evidence expansion (`StatementReviewCard` `renderProposal` → `acknowledgeReasonFor` → `noProposalReason`). The badge is `evidenceDisplayVerdictLabel("supported_partial")` = **"Partially confirmed"**.

The same `silenceOnCard` also sends editorial/compliance findings on that card to `policy_forbids` (`sort.mjs` L80–88), whose copy is: `"This concern stands. No source speaks to the claim, so changing the wording is yours to decide, not the product's."` S1 and S3 on the r10-review1 fixture are both `displayVerdict: "supported_partial"`. So the card can show **two** “no source speaks” lines under a Partially confirmed badge: evidence `silence_no_edit` and editorial `policy_forbids`. The target end state (“never displays copy asserting that no source spoke”) covers both.

### C2 BLOCKING — object excerpt, string popover, unread string copy

**Verdict: confirmed. Correcting the type mismatch alone would not put a quote on any UI surface the reviewer already uses.**

Confirmed from `findings.md` Q1/Q3 and from code:

- Assembly (`stage7-assemble-card.mjs` L577–578, L715–767) stores Stage 4 `{ sourceLabel, passage }` on `qcCard.primaryExcerpt`, and a string duplicate on `qcCard.primaryExcerptText`.
- Schema (`qc-api-schema.mjs` L69–74) already requires `primaryExcerpt` to be `string | null`. The live analyse-statements path never calls `validateQcResponse` (only the evidence-skipped fast path does).
- `StatementReviewCard.jsx` L697: `typeof qcCard?.primaryExcerpt === "string"`. Object form is dropped.
- `primaryExcerptText`: zero frontend reads (`docs/R7_SOURCES_DRAWER_DIAGNOSTIC.md` already recorded this). Export reads it (`api/export.js` L117–121).

If the type were corrected and nothing else:

| Surface | Would a quote appear? |
|---|---|
| Citation popover Excerpt slot | The string would be eligible. The popover never opens: v4 chips require `citationHovers` `whatThisShows` (`primaryChipPopoverComplete`), which is always empty, and the non-strict chip fallback also requires `supportState === "confirmed" \| "partially_confirmed"`, which v4 never emits. |
| Source chips | Still empty. Same `citationHovers` / enum mismatch. |
| Sources drawer / magnifier | Already uses `supportSpans`, not `primaryExcerpt`. No change. |
| `focusSourceRequest` / BottomDrawer | Chrome still types `primaryExcerpt` as string. Live card path opens the reader via `openSourceView` + span offsets. No change. |
| Export | Already uses `primaryExcerptText`. No change. |
| Implement Changes prompt | `excerptPassage` already unwraps objects. No change. |

**Correction to findings Q6.** That paragraph said unwrapping `primaryExcerpt.passage` would show quotes on the card. The card has no face-level excerpt block, and the popover never mounts. Unwrap is necessary and not sufficient for Design 2’s end state. The document wins over the brief on “this is a type mismatch, not B158”. Code wins over the document on “unwrap would show quotes”.

### C3 CHECK — frozen corpus 1 score cannot move

**Design 1: confirmed. Display-side / action-list copy. Stage 1 split and Stage 2 prompt untouched. Scorer reads `displayVerdict`. Catch 9/11 and leave-alone 67/74 cannot move.**

**Design 2: confirmed for the same reason, with one bound.** Stringifying `qcCard.primaryExcerpt` and painting it is assembly + UI. Stage 1, Stage 1b, Stage 2, Stage 3, Stage 4 selection rules, and `displayVerdict` stay put. The compacted accuracy cards already store `primaryExcerpt` as a string via `excerptPassage` in `run-evidence.mjs`; scoring never reads it. Do not retune Stage 4 to backfill empty primaries from `supportSpans` in this slice — that would be a different change and is not required for C3.

### C4 CHECK — park B158 and B156

**Agree to park both, not for Claude’s exact reason.**

Claude: park them because neither changes what a reviewer sees today.

- **B156 fifth display state.** Agree, park. Findings Q6: it is the change most likely to break scorer, filters, tint, and silence. These two designs do not implement it. Design 1’s honest partial copy is not a fifth verdict.
- **B158 fill `conflictExcerpt`.** Agree, park. Findings Q4: no frontend reader; filling it would flip `conflictExcerpt_nonempty` on the 11 cards and duplicate the same quote on the 7 span-owned cards, which changes silence tests and Stage 5 prompts with no card-face gain. Design 2 will paint **`primaryExcerpt`**, so those 11 quotes become visible without touching the dedicated field. That makes B158 *less* urgent for the card face, not more. Do not fold B158 into Design 2.

Disagree with “neither changes what a reviewer sees today” as the reason to park B158 **after Design 2 ships**: the reviewer will then see the primary quote on those 11 cards. The remaining hole is the unread dedicated slot, which is a drawer/layout problem, not this slice.

---

## Design 1. The silence line on partials

**Target:** a card whose badge says a source partly confirmed the statement never displays copy asserting that no source spoke to it. Honest silence copy still appears where it is true (`not_supported` / `no_support` with no conflict signal).

### 1a. Predicate vs generation gate

**The silence predicate is a generation gate, not copy-only.**

`statementIsSilent` feeds `silenceOnCard` into `sortFinding`. That chooses **disposition**:

| Kind | Today when `silenceOnCard` | Today when not |
|---|---|---|
| evidence | `ACKNOWLEDGE` / `silence_no_edit`. **No model call.** | `ACTION`. `fillAction` calls the writing-rewrite model and returns `resultingSentence` |
| editorial / compliance | First-person-with-pronoun: `ACTION`. Else `ACKNOWLEDGE` / `policy_forbids` | `ACTION` if `suggestedDirection` is nonempty |
| framing / recency | `ACKNOWLEDGE` / `visible_signal` either way | same |

Narrowing `statementIsSilent` so a conflict-free partial is not silent would newly propose:

1. **Evidence edits on every conflict-free partial.** The model would receive `buildFindingPrompt` with `silenceOnCard: false` (“A source in the pack speaks to this claim. Follow the finding.”) and a source excerpt if one exists. Typical output: a rewritten sentence that tries to close the gap (drop the unconfirmed clause, substitute the source’s figure, hedge, or complete the claim). That is exactly the class B156 parked behind an exact-quote locator (29 August rails: only the source’s stated value, only the addressed element, never a surrounding rewrite, no proposal if it cannot be quoted exactly). **Not desirable in this slice.**
2. **Editorial/compliance edits that today are withheld.** S1 `marketing_language_excess` and S3 `overreach_unsupported_causal` on r10-review1 are partials. They are `ACKNOWLEDGE` only because the card is “silent”. If the predicate flips, both have `suggestedDirection` and become `ACTION`. `tests/revise-actions-sort.test.mjs` treats that as a failed slice (“If they come back ACTION, the slice is wrong.”). **Not desirable in this slice.**

Keep `statementIsSilent` as the gate. Change only which acknowledge string fires when the silent card is a conflict-free partial.

### 1b. Narrowest correct change

**Change copy selection in `sortFinding`. Do not change `statementIsSilent`. Do not add a “source spoke” structural test for partials.**

Add `isConflictFreePartial(card)` next to the existing gap helpers (same module as the predicate, **new export, existing predicate untouched**):

- `displayVerdict === "supported_partial"` **or** `supportState` in `{ "partial", "partially_confirmed" }`
- and not already a conflict card (`displayVerdict === "conflict"` / `supportState === "conflicting"` / `hasConflict === true` — redundant with silence, cheap to keep)

In `sortFinding`, when `silenceOnCard` is true:

- evidence + conflict-free partial → `ACKNOWLEDGE` / new reasonCode `partial_no_edit`
- editorial or compliance + conflict-free partial → `ACKNOWLEDGE` / new reasonCode `partial_policy` (not `policy_forbids`)
- everything else unchanged (`silence_no_edit`, `policy_forbids`, first-person `ACTION`)

**Rejected alternatives**

| Alternative | Why rejected |
|---|---|
| Narrow `statementIsSilent` so partials are not silent | Load-bearing generation gate (1a). Unlocks evidence rewrites and S1/S3 craft proposals. |
| Add `partially_confirmed` to `STRUCTURAL_TESTS` as “source spoke” | Same as narrowing the predicate. Semantically truer, operationally the ACTION unlock. |
| Remove partial from `isEvidenceGap` | Inventory would stop emitting the evidence finding. Editorial withhold via `silenceOnCard` would also die. Bigger than a copy fix. |
| Rewrite `silence_no_edit` so one string covers both silence and partial | Impossible. One sentence cannot say both “no source spoke” and “a source spoke in part”. |
| Frontend-only string swap | Backend is authoritative. `noProposalReason` is already the public field. Do not re-derive copy on the client. |
| Wait for the full B153 wording pass | This line is the freeze carve-out the backlog already named. The rest of B153 stays frozen. |

The brief prefers changing the predicate unless it is load-bearing elsewhere. It is: evidence ACTION vs ACKNOWLEDGE, editorial `policy_forbids` vs ACTION, B149 span tests, S1/S3 primary controls, and `buildFindingPrompt`’s “no source speaks” instruction on remaining ACTION rows (first-person on a silent card).

### 1c. Replacement copy

QC Output Language Standard (`ai/AI_OPERATING_MANUAL.md`): plain language, no system vocabulary, no generic filler, actionable, direct. Structural acknowledge lines cannot name the actual claim without becoming commentary. Existing `silence_no_edit` is already a generic structural label; this carve-out stays in that genre and stops lying.

**Evidence, conflict-free partial (`partial_no_edit`):**

> A source supports part of this statement, not all of it. Nothing is proposed. Keep or change the rest yourself.

**Editorial/compliance, conflict-free partial (`partial_policy`):**

> This concern stands. Nothing is proposed. The wording is yours.

**Unchanged, true silence (`not_supported` with no conflict signal):**

> No supplied source speaks to this claim, either way. Nothing is proposed and the wording is yours.

Do not interpolate the excerpt into these lines. Commentary (`reasoningParagraph`) already explains the gap when it ran. This slice is the acknowledge sentence only.

### 1d. Tests

**Would change verdict or copy (update assertions):**

| File | Test | What changes |
|---|---|---|
| `tests/revise-actions-sort.test.mjs` | `S1 evidence is ACKNOWLEDGE silence_no_edit` | reasonCode → `partial_no_edit`; disposition stays ACKNOWLEDGE |
| `tests/revise-actions-sort.test.mjs` | `S1 marketing is ACKNOWLEDGE policy_forbids` | reasonCode → `partial_policy`; disposition stays ACKNOWLEDGE; S1 is a partial |
| `tests/revise-actions-sort.test.mjs` | `S3 overreach is ACKNOWLEDGE policy_forbids` | same; S3 is a partial |
| `tests/revise-actions-silence.test.mjs` | `partial card whose only conflict mark is supportSpans is silent` | `statementIsSilent` stays **true**; sort reasonCode → `partial_no_edit` |
| `tests/revise-actions-copy.test.mjs` | acknowledge banned-vocabulary sweep | new strings must stay clean; add a pin that `NO_PROPOSAL.partial_no_edit` and `partial_policy` contain neither “no source speaks” nor “no supplied source” |

**Must not change:**

| File | Test | Why |
|---|---|---|
| `tests/revise-actions-silence.test.mjs` | `Stage 3 conflicting supportState alone still grants ACTION` | conflict still not silent |
| `tests/revise-actions-silence.test.mjs` | `hasConflict on a partial card still grants ACTION` | conflict signal still wins |
| `tests/revise-actions-silence.test.mjs` | `Stage 2 single-pick conflicting on a partial card still grants ACTION` | fingerprint still wins |
| `tests/revise-actions-sort.test.mjs` | `S4 evidence is ACTION` | conflicting, not silent |
| `tests/revise-actions-sort.test.mjs` | `S1 voice is ACTION` / `S7 voice` / `S8 first_person` | first-person carve-out on silent cards |
| `tests/revise-actions-license.test.mjs` | Brackenhill mix / CONVERT_IDS / KEEP_ACK_IDS | replays recorded dispositions, does not re-sort; KEEP_ACK includes `S4:evidence:partial:0` and `S6/S8/S9:evidence:not_supported:0` |

**Add:**

| File | Test name |
|---|---|
| `tests/revise-actions-silence.test.mjs` | `conflict-free partial is silent but evidence copy is partial_no_edit` |
| `tests/revise-actions-silence.test.mjs` | `not_supported with no conflict signal still uses silence_no_edit` |
| `tests/revise-actions-silence.test.mjs` | `editorial on a conflict-free partial uses partial_policy not policy_forbids` |
| `tests/revise-actions-copy.test.mjs` | `partial_no_edit and partial_policy contain no silence claim` |
| `tests/revise-actions-sort.test.mjs` | `S1 evidence copy is the partial_no_edit sentence` (byte pin) |

### 1e. B153 close vs slice

**Slice, not a full close of B153.**

This closes the acknowledgement item the backlog named: `silence_no_edit` on conflict-free partials, including the sibling `policy_forbids` lie on the same card. It does not close B153’s wording pass: proposed-sentence caption, header pill, Save count, Expand all / Collapse all, Proposed change pending, Bulk accept / Bulk reject. Those stay frozen.

Unlock of evidence proposals on honest partials remains B156’s later slice (exact-quote locator). Do not treat Design 1 as that unlock.

### Design 1 files

Inline. No new production module.

| Path | Change |
|---|---|
| `lib/revise-actions/silence.mjs` | add `isConflictFreePartial`; do not edit `statementIsSilent` / `STRUCTURAL_TESTS` / `isEvidenceGap` |
| `lib/revise-actions/sort.mjs` | two `NO_PROPOSAL` strings; copy switch in `sortFinding` |
| tests listed in 1d | assertions + new cases |
| `docs/BACKLOG.md` | at build time: annotate B153 acknowledgement as sliced, wording pass still open |

**NEW FILES (build):** no new files.

**Risk.** A later reader treats `partial_no_edit` as permission to generate. Caught by the sort tests that disposition on S1 evidence stays `ACKNOWLEDGE`, and by the B149 tests that a span-only conflict still does not grant ACTION. A later reader rewrites `silence_no_edit` itself and breaks true-silence cards. Caught by the new `not_supported` pin.

---

## Design 2. The excerpt that never reaches the card face

**Target:** when Stage 4 has selected a passage, the reviewer can see that passage on the card without opening the Sources drawer or a hover popover.

### 2a. Boundary, consumer, or both

**Both, with the backend as the contract owner.**

Principle: backend is authoritative; the frontend does not paper over a broken payload (`docs/ARCHITECTURE.md` §2, `ai/AI_OPERATING_MANUAL.md` change-surface discipline).

The schema already declares `primaryExcerpt: string | null`. Assembly emits `{ sourceLabel, passage }`. That is a backend contract violation, not a UI limitation.

1. **Boundary (required).** `assembleCard` sets `primaryExcerpt` to the passage string (or `null`), same value as `primaryExcerptText`. Keep `primaryRefTitle` as the label (already `primaryExcerpt.sourceLabel`). Stage 4’s object stays internal on `excerptResult`.
2. **Consumer (required for the end state).** Paint that string in the expanded Evidence block. Type-only unwrap does not meet the target (C2). Optionally accept `{ passage }` as a one-release shield; do not make dual-shape the contract.

**Rejected: consumer-only.** The client would keep accepting a shape the schema forbids. Next consumer (export already went the other way; a new client would guess). Violates backend authority.

**Rejected: boundary-only.** Honest payload, still no card-face block, still no chips. Findings overstated this path.

**Data-contract consequence.** `qcCard.primaryExcerpt` becomes `string | null` on the wire, matching the schema. Breaks any reader of `qcCard.primaryExcerpt.passage`. In-repo live readers already go through `excerptPassage` or `primaryExcerptText`. Stage 4 tests (`tests/conflict-excerpt-from-span.test.mjs`) assert `excerptResult`, not the assembled card, and stay. `primaryExcerptText` remains for export. Do not change `conflictExcerpt` in this slice (B158).

### 2b. Which cards gain a visible quote (lift-1)

Counts are Stage 4 `primaryExcerpt` already on the compacted cards (passage string). Design 2 paints that field. It does not backfill from `supportSpans`.

| `displayVerdict` | Cards | Nonempty `primaryExcerpt` | Gain a card-face quote | Remainder |
|---|---|---|---|---|
| `supported_full` | 200 | **187** | 187 | 13 have span quotes only; Stage 4 left primary empty |
| `supported_partial` | 34 | **24** | 24 | 10 span-only empty primary |
| `conflict` | 18 | **18** | **18** (includes the 11 B158 cards) | 0 |
| `not_supported` | 9 | **0** | 0 | Stage 4 sets primary null by rule |
| **Total** | **261** | **229** | **229** | 23 span-only empty primary; 9 silent |

The 23 with a widened span and no primary are out of this slice. Pulling `supportSpans` onto the card face is a different contract (drawer already highlights them). Do not do it here.

### 2c. Export constraint

Export already depends on the **string copy**: `hasRealExcerpt === true && typeof primaryExcerptText === "string"` (`api/export.js` L117–121). It never reads object `primaryExcerpt`.

Constraint: keep emitting `primaryExcerptText` unchanged so export does not regress if a caller still has an old card. After the boundary fix, `primaryExcerpt` and `primaryExcerptText` are the same string. Do not switch export onto `primaryExcerpt` in this slice. Do not run `cleanEvidenceExcerptForDisplay` on the card-face block; export is verbatim, the card should match.

### 2d. Downstream assumptions that the excerpt is invisible

Silence tests **do not** read `primaryExcerpt`. `STRUCTURAL_TESTS` use `conflictExcerpt`, not primary. Painting primary cannot flip `statementIsSilent`. B149 remains: a conflicting `supportSpan` still does not grant ACTION.

| Consumer | Assumes invisibility? | Effect of Design 2 |
|---|---|---|
| `STRUCTURAL_TESTS` / `statementIsSilent` | No read of primary | None |
| `conflictExcerpt_nonempty` | Reads dedicated field only | None (field unchanged) |
| Stage 5 commentary | Already gets the passage string from `excerptResult` | None |
| `lib/revise-actions/inventory.mjs` `excerptPassage(card.primaryExcerpt)` | Already unwraps both shapes | Still works; after boundary fix it is a string |
| `lib/build-revision-prompt.mjs` | Unwraps object or string | None |
| `buildFindingPrompt` “Source excerpt” | Already passed the unwrapped passage on ACTION rows | None on ACKNOWLEDGE partials (still no model call) |
| Citation popover / chips | Effectively assumes no string | Still no chips (out of scope). Card-face block is the new reader |
| Export | Reads `primaryExcerptText` | None if that field stays |

Nothing in silence, sort, or inventory requires the quote to stay off the card.

### 2e. The eleven conflict cards

**Better, not identical, not worse.**

Today the 11 B158 cards carry the competing passage in `primaryExcerpt` and an empty `conflictExcerpt`. The reviewer sees Conflicting and (if commentary ran) the paragraph. They do not see the quote without the drawer.

After Design 2 they see that same competing passage on the card, labelled as a source excerpt, under a Conflicting badge. That is better. It is not a two-source layout. The dedicated field still has no reader, so it is not B158 closed. Do not label the block “Confirmed” or the badge will argue with the quote. One label for all verdicts: **Source excerpt**. The badge already carries the verdict.

The 7 span-owned conflict cards already have identical text in both slots. They also gain the same single quote on the face. Fine.

### Design 2 files

Inline. No new production module.

| Path | Change |
|---|---|
| `lib/qc/pipeline-v3/stage7-assemble-card.mjs` | `primaryExcerpt: hasRealExcerpt ? primaryPassage : null` (string). Leave `primaryExcerptText` and `primaryRefTitle` as they are. Do not stringify `conflictExcerpt`. |
| `src/modules/drafting/StatementReviewCard.jsx` (frontend) | In the expanded Evidence block, after `confirmationSentence`, render verbatim passage when present. Resolve with: string `primaryExcerpt`, else `primaryExcerptText`, else object `.passage`. Caption `primaryRefTitle` when present. Heading “Source excerpt”. |
| `tests/assemble-primary-excerpt-type.test.mjs` | **new test file**: assembled card `primaryExcerpt` is string or null; matches `primaryExcerptText` |
| `tests/action-list-display.test.mjs` or a sibling source-read test on the frontend | assert the Evidence block contains the “Source excerpt” heading (same style as existing frozen-label tests) |

Do not add `validateQcResponse` to analyse-statements in this slice. Useful later as a catch; it would also start enforcing every other schema rule on a path that has never run it.

**NEW FILES (build):** `tests/assemble-primary-excerpt-type.test.mjs`. No new production files. Frontend test can live in an existing source-read file.

**Risk.** A consumer still does `primaryExcerpt.passage` on `qcCard`. In-repo grep of production readers is clean; diagnostic scripts (`r7-extractor-check2.mjs`, `r7-stage2-shadow.mjs`) read Stage 4 or already guard. Caught by the new assembly type test plus `excerptPassage` on the action-list path. Card-face quotes on 187 confirmed cards add height; they sit behind the existing Evidence expand (default collapsed), same click as commentary. Do not mount 187 quotes on the collapsed workbench.

---

## Both designs

### Recommendation

**Build Design 1 first, alone.** It removes the sentence the reviewer already reads. Backend only. No data-contract change. Findings Q6 ranked it the most contradiction per line of diff.

**Build Design 2 second, alone.** Backend string + frontend face. Cross-repo. Needs a live Review look at a confirmed card, a partial with a quote, and one B158 conflict card (`F05:S0` or `F18:S4`).

**Do not ship together.** Operating manual spec sequencing: different surfaces, different risk. Bundling loses the ability to tell which change caused a regression. Design 1 does not need Design 2; Design 2 does not need Design 1.

Park B156. Park B158 field-fill. Do not move the period gate. Do not retune Stage 2.

---

## Technical summary

Design 1 keeps `statementIsSilent` as the ACTION/ACKNOWLEDGE gate and switches acknowledge copy on conflict-free partials (`partial_no_edit`, `partial_policy`) so a Partially confirmed badge never sits above “no source speaks”. Design 2 stringifies `qcCard.primaryExcerpt` at assembly to match the existing schema and paints that string in the expanded Evidence block. 229 of 261 lift-1 cards would gain a visible quote, including all 18 conflict cards. Neither design touches Stage 1 or Stage 2. B158 and B156 stay parked.

## Plain-language summary

Reviewers will stop being told that no source spoke when the badge already says a source partly confirmed the statement. They will also start seeing the source passage on the card itself, including on conflict cards, without opening the drawer. Those are two separate changes and should ship one after the other.
