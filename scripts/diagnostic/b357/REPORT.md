# B357. The actor finding leads the comment

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | 2e44851 | SHIP VERIFIED  2e44851  main  150 files  1693 tests |
| frontend | not touched | -- |

Ids used: B357 (this spec). Placement only. When the actor sentence fires is unchanged.

Cost: USD 0. No model calls.

Browser: skipped. No layout or control change. Deterministic comment rewrite only. No Review.

---

## What changed

`applyActorOfTheAction` in `lib/qc/actor-of-the-action.mjs` PREPENDS the actor sentence. Non-empty comment: sentence, one space, then the comment. Empty comment: the sentence alone, as today. The sentence text is unchanged.

Does not touch: stand-down conditions, verdict cap, concernLevel, slug `actor_mismatch`, Stage 7 log line. B356 inventory placement is unchanged and is not routed through this helper.

---

## Doctored statement 8

Recorded comment (before):

The source confirms that a pro-rata redemption of shares was completed, returning £944 million of gross proceeds to 3i. However, it does not specify that these proceeds were 'significant' for 3i, which is an evaluative claim not covered by the source. The reviewer should consider whether the term 'significant' is necessary or if additional context is needed to support this characterization.

After:

The statement attributes this to MAIT; the source credits Action. The source confirms that a pro-rata redemption of shares was completed, returning £944 million of gross proceeds to 3i. However, it does not specify that these proceeds were 'significant' for 3i, which is an evaluative claim not covered by the source. The reviewer should consider whether the term 'significant' is necessary or if additional context is needed to support this characterization.

The actor sentence is the first sentence. The three sentences about "significant" follow unaltered, including the reviewer instruction.

---

## Other cards whose comment changes

None. Applied `applyActorOfTheAction` to every card in `tests/fixtures/real-runs-2026-09-29/clean-review.json` and `doc-review.json` with the recorded statement, confirming excerpt, sources, `hasConflict`, `displayVerdict`, and `evidenceSummary`. Only doctored S8 returns a hit. Clean S8 stands down: both sides credit Action.

---

## Tests whose expectation moved

`tests/actor-of-the-action.test.mjs`: placement assertions on the recorded doctored S8 comment; empty commentary still equals the sentence alone; a card where both actor and B356 fire keeps the actor sentence first and `2.2% matches the source.` immediately before the trailing reviewer instruction. Every existing stand-down case still stands down.

`tests/commentary-clause-placement.test.mjs`, `tests/commentary-inventory.test.mjs`, `tests/card-honesty-invariant.test.mjs`, and `tests/sentence-split-decimals.test.mjs` unchanged and passing.
