# B354. Silence a concern only when the objection itself is in the source, account for every claim in the comment, and check who did the thing

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | 5141de2 | SHIP VERIFIED  5141de2  main  147 files  1673 tests |
| frontend | not touched | -- |

Ids used: B354 (this spec). B353 is closed as B352 Part 2 and was not altered.

Cost: USD 0. No new model calls. Stage 5 prompt gained one inventory rule; no extra API call.

Browser: skipped. No layout, control, or copy change. No Review. Deterministic assembly plus one prompt line, replayed from `tests/fixtures/real-runs-2026-09-29/`.

---

## Part 1. The drop rule must test the objectionable term

### What changed

`phraseInNormalizedPassage` no longer has a three-word window. The only containment test is the whole flagged phrase, two-word floor. Comparison is lowercased inside this module only; `normalizePassageForComparison` is unchanged.

`selectFlaggedTextsFromConcern` is the exported selector. Result shape `{ route: "quoted" | "span", texts: string[] }`. Route quoted: any quoted phrase in `note` or `suggestedDirection` is the objection; span slices are not used. Route span: no quote, fall back to `startChar`/`endChar` slices. Dedupe, two-word floor, slug `editorial_phrase_in_source`, log line, and verdict recompute are unchanged.

Does not touch: framing fidelity, Stage 6, pairing, Stage 2 recovery.

### Four required outcomes

| Case | Result |
|------|--------|
| note quotes `driven primarily by`; passage contains that phrase | DROPS |
| note quotes `returns of 14% across the entire portfolio`; passage has only `returns of 14%` | SURVIVES (the regression this part exists for) |
| note quotes `significant`; one word, below the floor | SURVIVES |
| note quotes `Record year`; passage has `record year` | DROPS |

### Existing test amended

`tests/editorial-source-awareness.test.mjs` T2 depended on the three-word window against S12's full quoted clause. Changed T2 to drop on a quoted `'driven primarily by'` and to assert that the recorded S12 concern (the whole clause) is not a substring and therefore survives replay. C1 now expects only S3 to lose a concern. T4 after-sum editorial.concerns is 2 (S8 and S12), not 1. The new rule was not weakened to keep the old T2 green.

---

## Part 2. The comment must account for every claim in the sentence

### What changed

`lib/qc/commentary-inventory.mjs` builds the inventory from `extractVerifiableAnchors` only, cap 8, order preserved, deduped. Unaddressed items that appear verbatim in a confirming passage get `The source also states <item>.` At most two clauses. Items not in any confirming passage get nothing.

Hard rule in the module header: this module never asserts confirmation the evidence layer did not establish.

Stage 5: `claimInventory` is passed at the `generateCommentary` call site and added to the user prompt. One prompt rule: address every item, including items that are fine; do not claim support the excerpts do not carry. No extra API call.

Assembly backstop: immediately after `stripContrastiveOnConfirmingSentences`, when commentary is non-empty and reviewed, using the primary passage and support-span passages only, never `conflictExcerpt`. `commentaryUnaddressed` is diagnostic. Not rendered. No frontend change.

Does not touch: verdict aggregation, pairing, editorial drop, actor check.

### Aggregation case

Statement `3i reported meaningful gains across essentially all of its investments`. `extractVerifiableAnchors` returns `[]` on that sentence (no figure, date, or 2-to-4-token Title-Case name). Unaddressed is therefore empty. No clause is appended. The overclaim phrase is not an extractable anchor, and nothing is invented. Reported rather than engineered around.

---

## Part 3. Did this name do this

### What changed

`lib/qc/actor-of-the-action.mjs` is deterministic, no flag. Vocabulary from source documents: Title-Case runs of 1 to 4 tokens, all-caps tokens of 2 or more characters, digit-initial mixed tokens such as `3i`. Trailing possessive stripped. `leadingActor` looks at the first six words. Zero names, two or more distinct names, or a first-person pronoun stands down. Equality is exact normalised match. The Jaccard matcher is not used.

Assembly, after the honesty invariant and next to the framing-fidelity cap: confirming passage is primary if present, else the first support span. Never the conflict excerpt. Does nothing on `hasConflict`, Unverifiable, or commentary not reviewed. On a mismatch, `supported_full` becomes `supported_partial` / moderate; already-partial is left; `displayVerdictReason = "actor_mismatch"`; the sentence is appended verbatim.

Closed-class one-token Title-Case words (`The`, `In`, months) are skipped at vocabulary collection so sentence-initial function words are not parties. `Action`, `MAIT`, and `3i` are kept. Noted as a structural choice.

Does not touch: editorial drop, pairing, Stage 2, Stage 5 prompt besides the inventory line.

### Tests

FIRES: doctored S8 `MAIT also completed...` against `Action completed a capital restructuring...`. `draftParty` MAIT, `sourceParty` Action, verdict capped, reason `actor_mismatch`, sentence present.

STANDS DOWN: clean S8 both Action; S10 `Elsewhere, within the private equity portfolio, 3i...` (deliberate miss: no vocabulary name in the first six words); first-person `We completed...`; `Following Action's refinancing, 3i received £944 million`; conflict cards; a name the source never uses.

---

## Fixture cards whose behaviour this changes

Clean, `tests/fixtures/real-runs-2026-09-29/clean-review.json`:

| # | Change |
|---|--------|
| S0 | Commentary may append `The source also states 13%.` Inventory item present in the confirming excerpt. Evidence verdict stays conflict. Actor stands down (`hasConflict`). |
| S3 | `record year` still drops (quoted objection is in the matched passage). |
| S5 | `EUR 11.2 billion` recorded unaddressed (source has `€11,229 million`, not that string). No clause. Verdict unchanged. |
| S7 | `EUR 3.1 billion` and `EUR 1.6 billion` unaddressed on the recorded commentary. No clause unless those strings sit in the confirming passage as written. Replay from B351 locates the October span; still no invented confirmation of a non-verbatim figure. |
| S8 | `significant` still survives. Actor stands down (both sides Action). |
| S12 | Editorial concern no longer drops. The quoted objection is the whole clause, which is not a substring of the matched passage. |

Doctored, `doc-review.json`:

| # | Change |
|---|--------|
| S0 | Same 13% clause as clean. Verdict stays conflict. |
| S5 | May append `The source also states 6.3%.` `30` and `June` unaddressed. Verdict stays conflict. |
| S8 | Actor fires. `The statement attributes this to MAIT; the source credits Action.` `displayVerdictReason` `actor_mismatch`. Recorded verdict was already `supported_partial`; it stays capped rather than being raised. |
| S12 | Same as clean: the full-clause editorial concern survives. |

No evidence verdict moved on the fifteen clean statements beyond B351.

---

## Not implemented as written, and why

1. Aggregation test phrase as an inventory item. `extractVerifiableAnchors` returns nothing for `3i reported meaningful gains across essentially all of its investments`. No new extraction was added. The safety holds: no clause is appended. Unaddressed cannot name a phrase that is not an anchor.

2. Closed-class skip on one-token Title-Case vocabulary. The spec asked for 1-to-4 token Title-Case runs. Without a skip, `The` and `In` become parties. `Action` is kept. Reported as a structural choice.

---

## Tests whose behaviour changed (C3)

`tests/editorial-source-awareness.test.mjs` T2, C1, T4. Correct under the new objection-term rule. Not a silent rewrite of expected behaviour.

`tests/author-name-blindness-guard.test.mjs` required an `AUTHOR-NAME-BLIND:` declaration on the new Title-Case regex. Added. The authoring organisation is a legitimate actor when the source credits it.

No other existing test was rewritten to hide a miss.

---

## What correct writing it could now change

Part 1: a writer who used the source's `driven primarily by` still sees a drop when that is the quoted objection; a writer who claimed `returns of 14% across the entire portfolio` no longer has that concern silenced by a shorter source phrase.

Part 2: a writer whose sentence carries a figure the commentary skipped, and that figure is in the confirming passage, now sees that figure named. A writer whose overclaim is not an extractable anchor sees no invented confirmation.

Part 3: a writer who attributed Action's redemption to MAIT is told the source credits Action. A writer who led with `Elsewhere, within the private equity portfolio, 3i` is not flagged; that miss is deliberate.
