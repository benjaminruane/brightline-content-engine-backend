# B366. A country is not a party, and a refused confirmation can get its quote back

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | this commit | see implementer response SHIPPED row |
| frontend | not touched | |

Ids used: B366 (this spec). Closes **B365**. Succeeds B364.

Cost: USD 0. No model calls.

Browser: skipped. No layout, control, or card-face chrome change. Cards checked by replaying `tests/fixtures/real-runs-2026-10-02/` (live must-passes) and `tests/fixtures/real-runs-2026-09-29/` (older shape).

---

## Design decisions

1. **Shared party lists, two callers.** `lib/qc/party-tokens.mjs`. Geography singletons and multi-word names, ISO currency codes, organisation words. Exact match after lowercasing. P34 callers: `actor-of-the-action.mjs` (vocabulary collect, leading actor, first-person token) and `role-party.mjs` (`readPartyNameAt`). No other caller.

2. **A geography is a party only with an organisation word.** `UK` is not a party. `the UK government` is. `US sales` is not. Organisation words are a bounded list: government, govt, group, plc, ltd, limited, inc, incorporated, corp, corporation, company, bank, fund, partners, holdings, holding, authority, ministry, commission, department, office, agency, council, parliament, treasury, administration, board, committee, llp, nv, sa, ag. Currency codes are never parties, even next to an organisation word.

3. **Print the draft's own words.** The actor sentence uses the slice from the first six words, including a leading `the` / `a` / `an` where the draft has one. It does not print the source vocabulary token (`UK`). Role-party already prints the raw name after the preposition; a bare geography or currency there is dropped, and a geography plus organisation words is kept (`UK government`).

4. **ALL-CAPS `US` is not the pronoun `us`.** `FIRST_PERSON` is case-insensitive, so `US sales` used to stand down as first person. An all-caps geography or currency token is not a pronoun. Lowercase `us` still is.

5. **Empty-confirmation recovery is flag-gated, not inferred.** Locate on a skipped card runs only when `emptyConfirmationRefused === true`, evidence is on, and no match is `matchNotReviewed`. October fingerprints do not carry the flag. Tests inject it. Dump reconstructs only with an explicit flag. `skipped` plus `not_reviewed` is not enough (matcher-throw collision).

6. **The verdict follows recovered evidence.** The matcher had confirmed. If locate finds claim-bearing sentences, `supportState` becomes `supported` and `displayVerdict` `supported_full`. Commentary that says no source addresses the claim is cleared. If locate finds nothing, the card is unchanged.

7. **The existing B359 path is unchanged.** Supported or partial cards still search when there is no pointer, no span, and no `passageRejected` / `emptyConfirmationRefused` match. September S10 stays on that path because its recorded state predates the refusal.

8. **Flag threading (P34).** `emptyConfirmationRefused` callers after this spec: Stage 2 writer (`applyEmptyConfirmationRefusal`), Stage 2 success return, `pipeline-v4/index.mjs` sourceMatches copy, Stage 7 locate gate, Stage 7 fingerprints (key present only when true). Schema-fail, throw, and no-key paths do not set it.

---

## New files created

- `lib/qc/party-tokens.mjs`
- `tests/b366-party-and-empty-quote.test.mjs`
- `scripts/diagnostic/b366/REPORT.md`
- `scripts/diagnostic/b366/dump-cards.mjs`
- `scripts/diagnostic/b366/card-display.json`

---

## Part one. A country is not a party, and a party is named properly

Checked against the October payload unless stated.

October S14 statement: `Looking ahead, the UK government maintains its cautious stance...`. Confirming passage is first person. After: `conflict` / high / `actor_mismatch`. Comment leads with `The statement attributes this to the UK government; the source credits 3i Group plc.` Not `to UK`.

Constructed `US sales grew 5% in the period` against the same first-person source: no finding. `leadingActor` is `no_actor`.

Constructed `Action sales grew 5% in the period` against the same source: fires, `Action` vs `3i Group plc`. MAIT vs Action still fires on September doctored S8.

MAIT (September S8 replay): still `conflict` / `actor_mismatch` / the MAIT sentence. October S8 recorded is already a Stage 3 conflict (`hasConflict` true), so actor stands down; the Stage 5 comment still names MAIT vs Action. Unchanged.

AGIC: September S9 replay still prepends `The statement attributes this to AGIC; the source credits GIC.` October recorded S9 is `conflict` / `role_party_mismatch` with that sentence. The helper still fires on the recorded primary plus GIC span. A dump replay of October S9 without a conflict face drops the GIC quote (B364 `keepSecondPassage` on a supported card). That is not this spec. See not done.

September clean S14 uses `management`. Actor stands down. Verdict is not `actor_mismatch`.

Existing actor and role-party stand-downs still hold (clean S8 same name, Elsewhere no actor, draft first person, two opening names, already a conflict, same name after `from`, two `from` names on the quote, `from US` is not a party).

---

## Part two. The blank card, narrowly

October S10 recorded: `supportState` skipped, fingerprint `not_reviewed`, no `emptyConfirmationRefused`, comment `No source addresses the claim...`, no quote.

Replay without the flag: unchanged. Do not infer.

Replay with `emptyConfirmationRefused: true` injected:

```
• Our Private Equity team completed the realisation of MPM and signed the realisation of MAIT in the period . ... The sales
achieved sterling money multiples of 3.2x and 2.8x respectively.
```

Verdict `supported_full`. Comment no longer says no source addresses the claim.

Evidence-off skipped: flag present, `evidenceEnabled` false, no quote, still skipped.

Matcher-throw: `matchNotReviewed` true, with or without the refusal flag, no quote, still skipped.

Empty-confirmation refusal whose recovery finds nothing: constructed `ZXQ completed a 9.7x exit of QRM during the period.` against the 3i source. Flag present. Locate finds nothing. Card stays skipped and still says no source addresses the claim.

September S10: recorded `supported` plus empty, no refusal flag. B359 locate still recovers MPM, MAIT, 3.2x, 2.8x.

---

## Cards whose verdict, comment, or quotes change

B366 moves, versus the recorded fixture face:

| Card | Fixture | What moved |
|------|---------|------------|
| DOC S14 | September 29 | Comment `to UK` becomes `to the UK government`. Verdict was already `conflict` / `actor_mismatch` from B364. |
| DOC S14 | October 2 | Verdict `supported_partial` to `conflict`. Reason `actor_mismatch`. Comment prepends the UK government sentence. Quote unchanged. |
| DOC S10 | October 2, flag injected | Verdict `not reviewed` to `supported_full`. Quote recovered (MPM, MAIT, 3.2x, 2.8x). Absence comment cleared. Without the flag the recorded skipped card does not move. |

September clean S14 does not move.

Dump replay of older captured cards still shows B359 quote recovery (September S6/S7/S10 unverifiable to supported_full, and similar). Those are not new in this spec. October dump S9 drops the GIC second quote on a supported face (B364). Listed so the dump is not silent:

| Card | Fixture | Dump-only, not this spec |
|------|---------|--------------------------|
| OCT DOC S9 | October 2 | Recorded `conflict` / GIC second quote. Replay of `supportState` supported drops the second quote (B364) and the badge becomes `supported_full`. Recorded comment still names AGIC. Live strings and the helper still fire. |

---

## Constructed false-positive cases (part one)

| Case | Result |
|------|--------|
| `US sales grew 5% in the period` vs first-person 3i passage | No finding |
| `Action sales grew 5% in the period` vs first-person 3i passage | Fires. `Action` vs `3i Group plc` |

---

## Must-pass checklist

| Must-pass | Fixture |
|-----------|---------|
| S14 names `the UK government`, stays a conflict | October 2 |
| `US sales grew 5%...` no finding | constructed, October sources |
| Real company in the opening still fires | constructed Action; September S8 MAIT |
| MAIT and AGIC unchanged | September 29 replay; October recorded S8/S9 |
| Clean S14 `management` stands down | September 29 clean |
| Existing actor and role-party stand-downs | September 29 strings |
| S10 quote MPM, MAIT, 3.2x, 2.8x, no absence comment | October 2, flag injected |
| Evidence-off skipped gains nothing | October 2 S10, evidence off |
| Matcher-throw not_reviewed gains nothing | October 2 S10, `matchNotReviewed` |
| Empty-confirmation miss gains nothing | constructed ZXQ / QRM |
| September S10 unaffected | September 29 doctored |

---

## Tests whose expectation moved, and why

`tests/b364-house-style-source-quote.test.mjs`: the UK government card now expects `to the UK government`, not `to UK`. R2. Same conflict.

---

## Anything not done, and why

- Role-party does not skip a leading article after `from` / `to` / `by` / `with`. `from the UK government` still stands down because `the` is a closed singleton. No fixture needs it. Actor already prints `the UK government` from the opening.
- The organisation-word and geography lists are bounded, not exhaustive. `Romania` is not on the geography list. S3 does not put it in the first six words.
- October S9 dump replay still drops the GIC quote on a supported face. That is B364 `keepSecondPassage`. Out of scope. The recorded card and the helper keep the AGIC finding.
- No new model calls. Stage 5 absence prose on a recovered S10 is cleared rather than rewritten.

---

## P34 callers

`party-tokens.mjs`: `actor-of-the-action.mjs`, `role-party.mjs`.

`emptyConfirmationRefused`: Stage 2 writer, Stage 2 success return, v4 index sourceMatches copy, Stage 7 locate, Stage 7 fingerprints.
