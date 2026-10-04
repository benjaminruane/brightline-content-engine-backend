# B371. The wrong-company check is off until it can be designed properly

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | 2b68499 | SHIP VERIFIED  2b68499  main  161 files  1774 tests |
| frontend | not touched | |

Ids used: B371 (this spec). Standing ruling recorded next to B348.

Cost: USD 0. No model calls. No billed run (R4).

Browser: skipped. No layout, control, or card-face chrome change. The off switch is an assembly flag. Default off is checked by replaying `tests/fixtures/real-runs-2026-10-02/` (October S14, S9, S12).

---

## Corrected score. Prediction held.

Ben's prediction **holds**.

| Measure | 8 September lift-1 | Billed oct-04-baseline | Arithmetic with actor movers removed |
|---------|--------------------|------------------------|--------------------------------------|
| Catch (Group A) | 9 of 11 | 10 of 11 | **9 of 11** |
| Leave-alone (Group B Ben-Confirmed) | 67 of 74 | 61 of 74 | **64 of 74 (86.5%)** |

86.5% clears the 85% PASS bar. It does not clear the 89% BUILD-QUALITY bar.

Labels were not moved. The labelled set was not changed.

Arithmetic lives in `scripts/diagnostic/b371/corrected-score.json`. Source: `scripts/diagnostic/accuracy/runs/evidence-pass-oct-04-baseline/movers.json`.

Replay of assembly against those stored cards was **not run**. `cards.json` is compact: source-match class and excerpt text, no source documents, no `evidenceSummary`. That is not enough to re-run Stage 7 with the check off. The arithmetic stands on its own.

---

## What the arithmetic removes

Five labelled movers carried `displayVerdictReason: actor_mismatch`. Detector not narrowed against them (R2).

| Statement | Shape | Group | After the check is off |
|-----------|-------|-------|------------------------|
| "The Company's competitive position is exceptional." | "Company" as a party | B | Reverts to `supported_partial`. Already partial on 8 September. Not in the leave-alone denominator. |
| "The Brno automation programme has progressed..." | a city as a party | B | Returns to leave-alone. |
| "It supplies more than 600 customers worldwide..." | no subject present | B | Returns to leave-alone. |
| "EBITDA margin is 11.1% on trailing twelve months..." | a metric as a party | A | Catch reverts. Accidental. The passage that would settle the sentence is still not found (**B161**). |
| "Bloom is supported by a clinical advisory board..." | passive; not the actor | B | Returns to leave-alone. |

Catch 10 minus F13 = 9 of 11.
Leave-alone 61 plus Brno, 600 customers, advisory = 64 of 74.

On the 2 October live run the check fired on zero of fifteen cards. That does not change this score.

---

## The real loss on live writing

On the 2 October draft, the UK government sentence (S14) reverts from a conflict naming 3i Group plc to a partly confirmed card saying the source does not specifically mention the UK government. That is the only correct finding the check has produced on real writing. It is a real loss. It is smaller than four false conflicts per hundred labelled sentences.

Role-party and scale stay on (R3). Neither moved a labelled verdict. Tests: October S9 still `role_party_mismatch`; October S12 still `scale_set_one_holding`.

---

## Remaining leave-alone losses

The three remaining leave-alone losses versus 8 September, after this spec, have no shipped change behind them and are attributed to run-to-run variation in the matcher. They are not fixed by this spec. They are the reason the matcher diagnostic exists (**B370**).

- F01 employees
- F09 period revenue
- F16 gross margin

F04 risk-adjusted return also left leave-alone on the billed pass; F08 principal risks joined. Those two offset. The net 67 to 64 gap is the three rows above.

---

## Design

Flag `QC_ACTOR_OF_THE_ACTION`, same style as `QC_NARRATIVE_COHERENCE` (**B348**). On values: `1`, `true`, `yes`, `on`. Everything else, including unset, is off.

Off means the check does not run. `applyActorOfTheAction` returns null on the first line. No `actor_mismatch`, no leading sentence, no verdict change. Output is not written and then suppressed. Detector `actorMismatch` / `leadingActor` stays in `lib/qc/actor-of-the-action.mjs`. It is not narrowed against the labelled hundred.

P34 callers of `applyActorOfTheAction`: `lib/qc/pipeline-v3/stage7-assemble-card.mjs` (the production writer; now a no-op when the flag is off). Tests that still need a firing stub the flag on.

Health reports `actorOfTheAction` next to `narrativeCoherence`, default false.

---

## Conditions for the check to come back

Recorded in Standing rules **B371**, same shape as **B348**:

1. A design that does not read a capitalised word near the front of a sentence as a party.
2. Evidence from writing other than the labelled hundred and other than the 3i drafts.
3. One scored pass here afterwards, not before.

---

## New files created

- `tests/b371-actor-off.test.mjs`
- `scripts/diagnostic/b371/REPORT.md`
- `scripts/diagnostic/b371/corrected-score.json`
