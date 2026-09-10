# Proposal engagement and house-name authority

Design pass, 2026-09-10. Do not build from this note until a spec is written. No product code changed here. No LLM call, pipeline, extract, evidence pass, or action-list run. Metered spend: **USD 0.00**.

Code authority: `scripts/diagnostic/delivery-check/proposal-layer-findings.md` (`b4f8e15`). Where this brief and that note disagree on mechanism, this file follows the note. Live integers follow the restored payload.

---

## Artifact restore

`scripts/diagnostic/delivery-check/live-2026-09-10-f18-review.json` was an 80-byte paste command (`b3f7ac9`). Copied from `~/Desktop/JSON.txt` (81,794 bytes). Parses. Top keys: `ok`, `statements`, `references`, `sources`, `excludedSources`, `meta`. **10** statements.

The named file is analyse-statements output. It has **no** `proposedChange` / `resultingSentence`. Claude’s S0 evidence proposal was from a later action-list render, not this JSON. S0’s card shape is what that render would consume.

### Live integers (replace every NOT COUNTABLE in the findings note)

| Fact | Restored file | Brief FACTS | Findings note (`b4f8e15`) |
|---|---|---|---|
| Statement count | **10** | 10 | 0 (stub) |
| `conflict` / `supported_full` / `supported_partial` | **7 / 2 / 1** | 7 / 2 / 1 | lift-1 F18 7/2/1 (same evidence shape) |
| `primaryExcerpt` is a string | **10 / 10** | 10 | not countable |
| `conflictExcerpt` object / null | **1 / 9** (object on S7 only) | object on 1, null on 9 | not countable; lift-1 compact used `""` |
| S0 `editorialSuggestedDirection` | byte-exact `Replace 'We are writing' with 'The authoring organisation is writing'.` | same | not byte-checked |
| S0 `concernCode` / card `concernLevel` | `voice_consistency` / card `high` | same | code-only |
| S0 `supportRefIds` / `citationHovers` | both `[]` | both empty | — |
| `claimType` on the card | **absent on all 10** | absent on S0 | — |
| Excerpt endings | **2** four ASCII dots (S1, S5), **1** period + Unicode `…` (S9), **1** no marker (S2 ends `")`), **6** single period | same | lift-1 F18 was 1 / 1 / 1 / 7 — **disagree; live wins** |
| Dual ACTION-capable pairs | **4** (S0, S2, S5, S7) | not in FACTS | NOT COUNTABLE |

---

## Part 0. Claude’s claims

### C1 BLOCKING — unconditional first-person-only head of the rewrite prompt

**Verdict: confirmed.** `buildFindingPrompt` (`lib/revise-actions/prompt.mjs` L28) always prints “One operation is then permitted, and only this operation: replace a first-person subject or object (we / our / us) with ${org}… Change nothing else in the sentence.” That line is not gated on `silenceOnCard`. The silence flag only switches the later sentence (L37–39): silent → “do only the substitution”; speaking → “Follow the finding.” A conflict card is never silent (`statementIsSilent` fails `STRUCTURAL_TESTS`). Evidence ACTION therefore still leads with first-person-only. A completion that only swaps We → org leaves the contradicted claim, which is O1.

### C2 BLOCKING — no engagement check on a conflict proposal

**Verdict: confirmed.** `sortFinding` (`lib/revise-actions/sort.mjs` L78–85): evidence + not silent → ACTION. No read of excerpt vs statement. `fillAction` (`lib/revise-actions/run.mjs`): first-person pronoun gate, draft-presence gate **only** when `isFirstPersonActorRule`, identity collapse, `resultAddsUnlicensedOrganisation` (which *allows* a house insert when the statement has we/our/us), then `verifyAction`. `verifyAction` (`lib/revise-actions/verify.mjs`) checks that a stated replace/delete/keep matches `resultingSentence`. It does not read `displayVerdict`, `hasConflict`, or the excerpt. Nothing asks whether the proposal touched the contradicted fact.

### C3 BLOCKING — draft-presence gate is first-person-rule only

**Verdict: confirmed.** `fillAction` L143–147 calls `identifyAuthoringOrganisation` only inside `isFirstPersonActorRule(entry.rule, entry.rule)`. Inventory evidence `rule` is `conflicting` / `partial` / … (`inventory.mjs` L90). Evidence skips the gate. `orgName()` in the rewrite prompt interpolates env/request (`AUTHORING_ORGANISATION`, live Halden Group) or the placeholder. `resultAddsUnlicensedOrganisation` refuses a new house name only when the original statement has **no** first-person pronoun. S0 has “We”. Same mechanism as findings Q2.

### C4 CHECK — each design without Stage 1 split or Stage 2 prompt

**Verdict: confirmed for A and for B, separately.** Frozen accuracy corpus is Stage 2 hash-pinned. Neither design touches Stage 1 splitting or `stage2_v4.md` / `stage2-match-sources.mjs` prompts. Design A is `lib/revise-actions/*` plus tests. Design B is the house-name gate in `first-person-actor.mjs` / `fillAction` plus a post-hoc placeholder strip on editorial public fields (Stage 6 *salvage*, not the Stage 2 matcher). Stage 6 prompt hygiene is optional in B and is still not Stage 2. Do not re-run the corpus.

### C5 CHECK — S0 recommend-versus-complete is a correct conflict

**Verdict: confirmed. Do not retune anything upstream.** Live S0: draft “confirm completion of the transaction”; `evidenceSummary` says the source is a recommendation to invest, not a completed deal; `displayVerdict` `conflict`; `hasConflict` true. Findings Q1/Q6: that is Stage 2/3 doing its job. Design A changes what a proposal may do *after* that verdict. It does not change the verdict.

---

## Design A. What a proposal may do on a contradicted sentence

**Target:** a reviewer never sees a proposal presented as the answer to a flagged contradiction when it does not address that contradiction.

### A(a). First-person-only: not silence alone

**Do not gate the first-person-only block on `silenceOnCard` only.** Gate it on **silence or a first-person-actor finding**. Silence-only would strip the shipped B134 voice path on a speaking card that still has a `voice_consistency` / `first_person_plural` ACTION.

Print the first-person-only operation (and “Change nothing else”) if and only if:

- `silenceOnCard === true`, **or**
- `isFirstPersonActorRule(finding.rule, finding.rule)`.

Otherwise print only the speaking-source rule: follow the finding; do not invent a value the source does not state. Do not lead with a voice-only operation.

| Path today | After this gate | Change? |
|---|---|---|
| Silent evidence (`not_supported` / conflict-free partial) | Still ACKNOWLEDGE. Prompt not called. | No |
| Silent first-person editorial with pronoun (B134 carve-out) | Still ACTION. Prompt still first-person-only. | No |
| Silent first-person without pronoun | Still ACKNOWLEDGE `visible_signal`. | No |
| Conflict-free partial editorial/compliance (non-FP) | Still ACKNOWLEDGE `partial_policy`. B156 stays parked. | No |
| Conflict evidence ACTION | Prompt no longer leads with first-person-only. Fill uses A(b)/A(c), not a voice swap. | **Yes. This is the fix.** |
| Conflict + first-person editorial ACTION (house present in draft) | Still first-person-only, because the *finding* is a first-person rule. Lives under Editorial, not as the evidence answer. | No |
| Speaking non-FP editorial/compliance ACTION (currency, materiality, …) | Loses the first-person-only lead. Prompt is “Follow the finding.” | Yes, prompt-only; stops telling a delete/figure fix to change nothing else |

Do not narrow `statementIsSilent`. Do not unlock evidence ACTION on conflict-free partials (findings + silence design: that is B156).

### A(b). When the contradiction can be closed by an exact quoted value

**Proposal: replace only the draft’s contradicted token with the source’s stated value, quoted exactly from the excerpt. Nothing else.** Same rails already recorded against B156 (29 August): only the source’s stated value, only the addressed element, never a surrounding rewrite, no proposal if it cannot be quoted exactly.

This slice applies those rails to **conflict evidence ACTION**. It does **not** implement B156’s fifth display state and does **not** unlock partials.

Do it in code, not with the writing-rewrite model:

1. Locator reads the statement and the painted excerpt (`primaryExcerpt` string, else `conflictExcerpt.passage` if the primary has no competing value).
2. A closable conflict is exactly one substitutable pair: a figure or date token in the statement, a **different** figure or date of the same kind as a contiguous substring of the excerpt, and the excerpt does not also contain the draft token as the source’s own value.
3. `resultingSentence` = statement with that one token replaced. `proposedChange` = `Replace '<draft token>' with '<source token>'.` `why` names the two values. No first-person change on this path (Design B owns naming).
4. Two or more candidate pairs → fail closed (A(c)). Qualitative contradiction with no figure/date pair → A(c). Draft figure already equal to the excerpt figure (S2’s EUR 158 million vs a recommendation) → not a value swap → A(c).

Live F18:

- S5 `142` vs excerpt `167` → **closable**.
- S3 `380` vs `412` → **closable** (if 412 is in the excerpt).
- S4 / S7 ARR `38` vs `35` → **closable** if a single pair; S4 also carries `28 million` — if the locator sees more than one unmatched figure, fail closed.
- S8 `2.8x` / `23%` vs `2.6x` / `21%` → **two pairs → fail closed**.
- S0 recommend vs complete → **not closable**.
- S2 invested vs recommended → **not closable**.

Brackenhill recorded rows S1 (`18.4%` → `11.2%`) and S2 (`1.9` → `1.4`) are the success shape. They stay ACTION. The model is not called.

### A(c). When it cannot be closed that way

**No proposal. Honest acknowledgement. Not a labelled voice-only evidence proposal.**

A labelled voice-only row still sits under Evidence as the proposed sentence. The user can Accept and believe the Conflicting badge is handled. That is Q1, ranked highest for first-time trust. Voice belongs on the editorial finding when the house is named in the draft; on unnamed drafts editorial is already `first_person_unnamed`.

New `NO_PROPOSAL` string, reasonCode `conflict_unaddressed`:

> A source contradicts this statement. Nothing is proposed. Decide whether the sentence should match the source.

QC Output Language Standard: plain language, no system vocabulary, names the issue (contradiction), tells the writer the next move (decide), does not invent a fix. Parallel to `partial_no_edit` / `silence_no_edit` (“Nothing is proposed”).

`fillAction` cheap-paths this **before** any model call, same pattern as `first_person_unnamed`.

### A(d). After-generation engagement check

**Yes. Loud. Deterministic. No second model call.**

The locator in A(b) is the check. Prefer not to call the model at all on conflict evidence. If a model result still exists (legacy stub, or a later non-conflict speaking path):

**Can determine without a model**

- Result is identity with the statement → already ACKNOWLEDGE.
- Result differs only by we/our/us → named org (or placeholder) → did not engage. Fail.
- Closable pair was known and the result still contains the draft token, or lacks the source token → did not engage. Fail.
- Closable pair was known and the result changes any other non-whitespace span → surrounding rewrite. Fail.
- Not closable, but a proposal was returned anyway → fail.

**Cannot determine without a model**

- Whether a qualitative rewrite “captures the spirit” of recommend-versus-complete. Do not try. Those cards never get a proposal (A(c)).

**On failure:** convert the row to ACKNOWLEDGE `conflict_unaddressed`, drop `proposedChange` / `resultingSentence` / `why`, `console.error` with a stable code (`CONFLICT_PROPOSAL_UNENGAGED`). Do not leave the proposal on the card with a warning badge. Do not retry the model.

`verifyAction` stays as the quote-shape check on rows that pass. It is not the engagement check.

### A(e). Tests

**Change (existing)**

| File | Test name | Why |
|---|---|---|
| `tests/revise-actions-license.test.mjs` | `three identity rows and three unnamed-voice rows convert; three ACTION stay` | S1/S2 evidence conflicting stay ACTION but must **not** call the model; resulting sentence comes from the locator. Stub-model assertions change. |
| `tests/revise-actions-sort.test.mjs` | `S4 evidence is ACTION` | Sort can stay ACTION; add a fill-level assertion that a non-closable conflict is ACKNOWLEDGE. Do not flip this sort test unless sort itself cheap-paths. **Prefer fill, not sort.** |
| `tests/revise-actions-silence.test.mjs` | `Stage 3 conflicting supportState alone still grants ACTION`; `hasConflict on a partial card still grants ACTION`; `Stage 2 single-pick conflicting on a partial card still grants ACTION` | Sort unchanged. Add sibling fill tests if those cards are not closable. |
| `tests/revise-actions-copy.test.mjs` | `acknowledge reasons contain no banned internal vocabulary` | New string must pass. |

**Add**

| File | Test name |
|---|---|
| `tests/revise-actions-prompt.test.mjs` | `speaking evidence prompt does not lead with first-person-only` |
| `tests/revise-actions-prompt.test.mjs` | `silent prompt still leads with first-person-only` |
| `tests/revise-actions-prompt.test.mjs` | `first-person editorial prompt on a speaking card still leads with first-person-only` |
| `tests/revise-actions-conflict-engagement.test.mjs` | `F18 S0 recommend-versus-complete is ACKNOWLEDGE conflict_unaddressed and does not call the model` |
| `tests/revise-actions-conflict-engagement.test.mjs` | `F18 S5 142 versus 167 is a single-token replace and does not call the model` |
| `tests/revise-actions-conflict-engagement.test.mjs` | `two figure pairs fail closed` |
| `tests/revise-actions-conflict-engagement.test.mjs` | `Brackenhill S1 18.4 percent to 11.2 percent is the exact-quote replace` |
| `tests/revise-actions-conflict-engagement.test.mjs` | `a voice-only resultingSentence on a closable conflict is ACKNOWLEDGE and logs CONFLICT_PROPOSAL_UNENGAGED` |
| `tests/revise-actions-copy.test.mjs` | `conflict_unaddressed wording is clean and byte-stable` |

### A files

**Inline:** `lib/revise-actions/prompt.mjs` (conditional first-person block), `lib/revise-actions/run.mjs` (`fillAction` cheap-path + loud fail), `lib/revise-actions/sort.mjs` (`NO_PROPOSAL.conflict_unaddressed` only; disposition still decided in fill).

**New module:** `lib/revise-actions/conflict-engagement.mjs` — locator, closable-pair test, exact replace, engagement predicate. Keep prompt/run thin.

**NEW FILES (eventual build):** `lib/revise-actions/conflict-engagement.mjs`, `tests/revise-actions-conflict-engagement.test.mjs`, `tests/revise-actions-prompt.test.mjs`.

**Risk:** locator misses a closable figure (honest ack, user still sees the excerpt) or swaps the wrong token (caught by the Brackenhill + F18 S5 tests and by `verifyAction` on the stated replace). Speaking editorial prompts lose the first-person-only lead; currency/materiality tests that stub the model still pass if they already “follow the finding.” Do not change Stage 2. A false ack is preferred to a voice-only evidence proposal.

**Park:** B156 fifth display and partial unlock. Stage 1 split. Stage 2 prompt. S0 verdict.

---

## Design B. Which call may write the house name

**Target:** one rule decides whether the configured organisation name may be written into a sentence, and every path obeys it, so a card can never deny the author is identifiable while naming them.

### B(a). Same draft-presence gate. Do not change editorial’s claim.

**Evidence rewrite uses editorial’s gate:** `identifyAuthoringOrganisation(draft, house)` must succeed before any path interpolates or inserts the configured name.

| Option | Cost |
|---|---|
| **Evidence uses the draft-presence gate (pick)** | On F18-shaped drafts the evidence path can no longer insert Halden Group. Card agrees with itself. B86 safety stays. Named-actor substitution still works when the house *is* in the draft. Cost: Review still has no request-body house (**B95**), so the only way to name the house is to have written it somewhere in the draft already. That is the existing editorial rule. |
| Editorial’s claim changes (“identified” whenever env is set) | The card would assert an author who does not appear in the draft. That is B86’s original failure. Do not. |

Do **not** reuse `NO_PROPOSAL.first_person_unnamed` on evidence rows. That copy is a reporting-commentary voice rule. Evidence that cannot name the house simply must not write a name (A(c) already acks conflict; a speaking non-conflict path, if any, acks without inserting a firm).

`resultAddsUnlicensedOrganisation` today allows a new house name when the statement has we/our/us. **Close that exception.** A newly inserted configured name is unlicensed unless the presence check passed.

### B(b). Conflict + first person + name not in the draft

**No proposal that names anyone.** Evidence: A(c) acknowledgement (`conflict_unaddressed`) when the contradiction is not quote-closable; if it *is* quote-closable, the exact-quote replace still must not add a house name (S5 has no “We”; S0 is not closable). Editorial: existing `first_person_unnamed`. Not a voice-only evidence proposal. Not a proposal that writes the placeholder.

### B(c). Placeholder guard, fail loud

`AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER` is `"the authoring organisation"`. Live S0/S2/S7 `editorialSuggestedDirection` already echo it. `orgName()` in `prompt.mjs` interpolates it when resolve returns null. Both are leaks.

**Impossible, not unlikely:**

1. **Never interpolate the placeholder as the house.** `orgName()` returns null when unresolved. The first-person-only block is not printed without a real house name (B134 on unnamed drafts is already fillAction ACKNOWLEDGE `first_person_unnamed`; the prompt is not reached). Worked examples in *model-only* instruction text may still use the placeholder **only** inside clearly marked examples, never as `Authoring organisation: the authoring organisation`.
2. **Public-field guard** in `lib/qc/first-person-actor.mjs`: `assertNoUnresolvedAuthoringOrganisationPlaceholder(text)` matches the placeholder case-insensitively, including a leading capital T. Call it on every string that can reach a reviewer: `suggestedDirection`, `note`, `editorialSuggestedDirection`, `proposedChange`, `resultingSentence`, `why`.
3. **On hit:** do not ship the string. Editorial salvage blanks `suggestedDirection` (empty direction → sort ACKNOWLEDGE `visible_signal`) and `console.error` `PLACEHOLDER_LEAK`. Action-list fill converts the row to ACKNOWLEDGE (`first_person_unnamed` if it is a first-person rule, else `visible_signal`) and logs the same code. Do not fail the whole Review or the whole action-list request (other rows stay). Tests treat a leaked string as a failed assertion.

Where it sits: one helper next to `AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER`. Editorial: `lib/qc/editorial-compliance-reviewer.mjs` when concerns are normalised / `editorialSuggestedDirection` is picked. Action-list: `fillAction` after parse, before `publicEntry`. Prompt: `buildFindingPrompt` never writes the placeholder into `Authoring organisation:`.

Stage 6 prompt retune is optional hygiene, not required if the salvage guard holds. It is still not Stage 2.

### B(d). Backlog rows this does not close

**New residue, not a close.**

- **B95** — Review still does not send `authoringOrganisation`. Unexercised request path remains.
- **B96** — Production/Preview env can stay Halden Group. The gate stops writing it into unnamed drafts; the env value is not removed.
- **B124** — still one env identity per deployment.
- **B155** — shipped cheap path for *editorial* unnamed first-person. This design is the evidence-path hole B155 already pointed at (“B124 / B95 remain for evidence author-identity”). Do not mark B155 re-opened or closed again.

File a new row when this ships. Do not close B95/B96/B124 from the design pass.

### B(e). Tests

**Change**

| File | Test name | Why |
|---|---|---|
| `tests/revise-actions-license.test.mjs` | `organisation in the result, not the original, with no pronoun is not ACTION` | Keep. Add a sibling: **with** a pronoun, unnamed draft, evidence conflicting, result names Halden → ACKNOWLEDGE, no proposed sentence. |
| `tests/revise-actions-license.test.mjs` | `fillAction does not call the model on first-person when the draft does not name the house` | Unchanged editorial cheap-path. |
| `tests/revise-actions-license.test.mjs` | `fillAction still proposes when this statement names the configured house` / `…when another sentence in the draft names the house` | Unchanged named-actor. |
| `tests/first-person-actor.test.mjs` | `style prompt formatting uses the placeholder when no house name is resolved` | May still allow *example* lines; must **not** allow a public-field leak. Split if the helper would fail this test. |

**Add**

| File | Test name |
|---|---|
| `tests/first-person-actor.test.mjs` | `assertNoUnresolvedAuthoringOrganisationPlaceholder catches the S0 direction byte-exactly` |
| `tests/first-person-actor.test.mjs` | `identifyAuthoringOrganisation is required before any licensed house insert` |
| `tests/revise-actions-license.test.mjs` | `evidence ACTION on an unnamed first-person conflict does not insert the env house` |
| `tests/revise-actions-prompt.test.mjs` | `unresolved house is not interpolated as Authoring organisation: the authoring organisation` |
| Editorial salvage test (extend the existing reviewer/first-person file that already checks `formatAuthoringOrganisationPromptBlock`) | `suggestedDirection containing the placeholder is blanked and logged PLACEHOLDER_LEAK` |

### B files

**Inline, no new product module.** Helpers on `lib/qc/first-person-actor.mjs`. Call sites: `lib/revise-actions/run.mjs`, `lib/revise-actions/prompt.mjs`, `lib/qc/editorial-compliance-reviewer.mjs` (public direction/note only).

**NEW FILES:** no new files. Tests extend `tests/first-person-actor.test.mjs`, `tests/revise-actions-license.test.mjs`, `tests/revise-actions-prompt.test.mjs` (the last is created by A; if B ships second, it already exists).

**Risk:** blanking `suggestedDirection` on a first-person concern removes the painted direction on Review (O4 goes away; the note still says the organisation is not identified). That is the point. False-positive match on a draft that legitimately contains the words “the authoring organisation” is the loud-fail cost; log and blank; caught by a test that a real house name “Halden Group” is not stripped. `resultAddsUnlicensedOrganisation` tightening must not break named-actor tests where the house *is* in the draft.

---

## Ship together or separately

**Separately. A first, then B.**

A is Q1 (highest trust). It does not need the house-name gate: conflict evidence either exact-quotes a figure or acks. S0’s evidence proposal disappears even if env is still Halden Group.

B is Q2/Q3. Without A, tightening the evidence gate would still leave a speaking-source rewrite prompt that leads with first-person-only; the model can propose a nameless voice change or, if someone loosens the gate, Halden again.

Together on S0 they also clear O3 (editorial ack vs evidence proposal) because evidence no longer proposes. They do not clear competing proposals (S5 update vs delete) — that is B166.

Bisect: A then B, two commits.

---

## Recorded, not designed

### B166 — competing proposals (new)

Evidence and editorial on one sentence can propose incompatible actions. Live F18: **4** of 10 cards (S0 voice vs conflict, S2 voice vs conflict, S5 **142→167 vs delete the sentence**, S7 voice vs ARR). Apply already refuses a double write. Harm is confusion. Duplication judge classifies voice/delete as INDEPENDENT, which is why it did not fire. Out of scope for A and B.

### B158 — amended, conflictExcerpt shape

Live F18: `primaryExcerpt` string on 10/10; `conflictExcerpt` object on 1/10, null on 9. Design 2 stringified primary only. Stringify `conflictExcerpt` to the same wire type (passage string or null) so the card does not carry two excerpt fields in two shapes. That is in addition to the empty-slot hole already in B158. Do not treat this as a Design 2 reopen in A or B.

### B167 — truncation markers (new)

Three behaviours on the card face:

1. **Four ASCII dots (`....`)** — Stage 4 `trimExcerptTo300` appends ASCII `...` after a period. Live S1, S5. Artifact of the intended cap, not a third policy.
2. **Period + Unicode ellipsis (`.…`)** — Stage 2 `trimPassageToLimit`. Live S9. Not the card-facing clip.
3. **No marker** — passage under the cap, returned unchanged. Live S2 ends on `")`. Intended for short quotes; can look like a hard cut.

Intended: Stage 4’s 300-cap with a cut marker, and no marker when under the cap. Four dots are that marker colliding with a sentence that already ended. Unicode `…` is Stage 2. Design 2 paints verbatim. Do not retune the Stage 2 prompt. Cosmetic. Parked.

---

## Rank reminder (from findings, still)

Fix first when building: **Design A**. Then B. Park B166, B158 shape, B167, B156, B95/B96/B124, Stage 1, Stage 2 prompt, S0 verdict.
