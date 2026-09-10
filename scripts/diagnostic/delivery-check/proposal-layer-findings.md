# Proposal-layer findings

Read-only diagnostic, 2026-09-10. No product code changed. No pipeline, extract, evidence pass, or action-list run. No proposals regenerated. Metered spend: **USD 0.00**.

**Named input.** `scripts/diagnostic/delivery-check/live-2026-09-10-f18-review.json` is **not** an analyse-statements payload. It is 80 bytes, committed as `b3f7ac9` (`JSON upload`), and contains only:

```
blbe
pbpaste > scripts/diagnostic/delivery-check/live-2026-09-10-f18-review.json
```

That is the shell command that was meant to save the live run. The clipboard never landed. **Zero statements** parse from it. Payload-only integers that need that file cannot be counted. They are marked **NOT COUNTABLE**.

**What was used instead.** Code at HEAD (`4a89a16` assembly, `9980553` silence copy, `659b5ef` card-face excerpt). Stored accuracy cards `scripts/diagnostic/accuracy/runs/evidence-pass-lift-1/cards.json`, fixture 18, **10** statements, `skipCommentary: true`, editorial and compliance off. Those cards can confirm evidence verdicts and excerpt endings. They structurally cannot contain commentary, editorial concerns, or proposals. Claude's rendered-card observations (O1–O5) are therefore checked against **code** (can this happen) and against **lift-1 F18** (does the evidence shape match), not against the missing live JSON.

**O6 and stop.** O6 asked to stop if the live payload did not have string `primaryExcerpt` and object `conflictExcerpt`. The named file has neither. That is a missing artefact, not a measured type regression. Assembly at `4a89a16` does emit that pair. The rest of this note continues.

---

## Part 0. Claude's observations

### O1 — conflict card, one evidence proposal that only swaps first person

**Verdict: possible, and the code is built to allow it. Lift-1 F18 S0 is `conflict` for recommend-versus-complete. The live proposal text is not in the named file.**

Lift-1 F18 index 0 (`displayVerdict: "conflict"`):

> We are writing to confirm completion of the transaction with Nordic SaaS Holdings…

`primaryExcerpt` is the source line that **recommends** an investment, not a completion. `hasConflict: true`. That matches Claude's factual reading of the badge.

A conflict card is **not silent** (`statementIsSilent` requires an evidence gap **and** no structural conflict signal; `hasConflict` / `displayVerdict === "conflict"` fire `STRUCTURAL_TESTS`). `sortFinding` therefore sends `kind === "evidence"` to **ACTION** (`lib/revise-actions/sort.mjs`). Inventory sets `suggestedDirection: null` on evidence findings (`inventory.mjs`). `fillAction` then calls the writing-rewrite model with `buildFindingPrompt`.

That prompt **always** opens with: one permitted operation is replace we/our/us with the resolved organisation, change nothing else (`lib/revise-actions/prompt.mjs`). Only later does it say, when `silenceOnCard` is false, “A source in the pack speaks to this claim. Follow the finding.” A model that obeys the first block produces a first-person substitution, leaves the completion claim intact, and can say so in `why`. The UI paints `resultingSentence` and `why` under the evidence expansion (`StatementReviewCard` `ProposedChangePair`). The badge still says Conflicting. The user can read `why` if the model admits the claim was kept; nothing in the chrome says “this proposal does not address the verdict.”

### O2 — editorial says the organisation is not identified; the proposal inserts a configured name

**Verdict: two different presence checks. Same family as B95/B124/B86, different manifestation: evidence ACTION skips the draft-presence gate that editorial and first-person fillAction use.**

Editorial payload (`formatAuthoringOrganisationPromptBlock` in `lib/qc/first-person-actor.mjs`): names the house **only** when `identifyAuthoringOrganisation(draft, house)` finds that exact configured name in the draft. Otherwise the model is told, verbatim: `AUTHORING ORGANISATION: not identified in this draft.` Fixture 18's draft is Nordic SaaS / “We are writing…”. It does not contain the Production env value **Halden Group** (**B96**). The editorial concern that the organisation is not identified is the presence check working.

The name in a **proposal** does not come from that block. `runActionList` resolves `authoringOrganisation` via `resolveAuthoringOrganisationName` (request, then **`AUTHORING_ORGANISATION` env**, then null). `fillAction` applies `identifyAuthoringOrganisation` **only** when `isFirstPersonActorRule(entry.rule)` is true. Evidence findings have `rule` = `conflicting` / `partial` / etc. They skip the gate. `buildFindingPrompt` then interpolates `orgName(authoringOrganisation)` = env name or the placeholder `"the authoring organisation"`. `resultAddsUnlicensedOrganisation` refuses a newly inserted house name only when the **original statement has no first-person pronoun**. S0 has “We”. Inserting Halden Group is therefore licensed on the evidence path.

**B95** is the unused request-body supply route. **B124** is every tenant sharing one env identity. **B86** closed the old default-firm substitution; the presence check is the remaining safety. This card is that safety on editorial and the env name on evidence ACTION at once. Same defect family, not the same ticket: B95/B124 are who-is-the-house; this is which call is allowed to write the house.

Env is involved whenever Production/Preview `AUTHORING_ORGANISATION` is set (**B96**: Halden Group). Request `authoringOrganisation` is not sent from Review (`runStatementAnalysis` payload has no such field).

### O3 — editorial acknowledgement says nothing is proposed; a proposal above it does the editorial fix

**Verdict: two findings, two dispositions. Expected given O1+O2.**

On a non-silent card, first-person editorial with a pronoun and a nonempty `suggestedDirection` is ACTION **until** `fillAction` cheap-paths it. If `identifyAuthoringOrganisation` fails, fillAction returns ACKNOWLEDGE `first_person_unnamed`: “This sentence is written in the first person… Nothing is proposed…” (`NO_PROPOSAL.first_person_unnamed`, B155). Evidence ACTION on the same card can still emit the substitution (O1). The frontend renders the evidence proposal in the Evidence expansion and the editorial `noProposalReason` in the Editorial expansion (`acknowledgeReasonFor` → `noProposalReason`). They are not one finding contradicting itself. They are two findings the user reads as one card.

### O4 — `editorialSuggestedDirection` is the literal “Replace 'We are writing' with 'The authoring organisation is writing.'”

**Verdict: model output echoing a prompt placeholder, not a resolved name. Cannot byte-check the live field; the string is what the unnamed-house instruction plus worked examples produce.**

`AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER` is `"the authoring organisation"` (`first-person-actor.mjs`). `buildFirstPersonActorInstruction(null)` and static `FIRST_PERSON_ACTOR_INSTRUCTION` interpolate that into worked examples. `resolveStyleGuide` puts those examples on `first_person_plural` when the presence-checked house is null. `FIRST_PERSON_ACTOR_FIX_DIRECTION` tells the model to “state the substitution with the named authoring organisation as subject.” Combined with `AUTHORING ORGANISATION: not identified in this draft`, a typical `suggestedDirection` is exactly Claude's sentence, with conventional capital T.

It is **not** intended as user-facing copy. It is a worked-example / instruction template. It is **not** interpolated to Halden Group on this path, because interpolation is gated on presence in the draft.

### O5 — statement 5: evidence would update a figure; editorial would delete the sentence

**Verdict: lift-1 F18 S5 is a headcount conflict (142 vs 167). Dual ACTION with no merge is how the product works. Live editorial delete text is not in the named file.**

Lift-1 F18 index 5: `The Company employs 142 people across Stockholm, Oslo, and Helsinki.` `displayVerdict: "conflict"`. Primary excerpt: `The Company employs 167 people as of 28 May, not 142…`. Evidence ACTION on a speaking-source card is told “Follow the finding,” which for a figure conflict is an update. Editorial on the same non-silent card is ACTION if `suggestedDirection` is nonempty (delete is a direction). Nothing in sort, fill, or the duplication judge reconciles them (Q4).

### O6 BLOCKING — live `primaryExcerpt` string, `conflictExcerpt` object

**Verdict: NOT CONFIRMED on the named file (0 cards). CONFIRMED in assembly code. Lift-1 compacted cards are the wrong shape for this check.**

`assembleCard` (`stage7-assemble-card.mjs` after `4a89a16`): `primaryExcerpt: hasRealExcerpt ? primaryPassage : null` (string or null). `conflictExcerpt` is still `entry.excerptResult.conflictExcerpt` (Stage 4 `{ sourceLabel, passage }` or null). Export still reads `primaryExcerptText`.

Lift-1 cards store `primaryExcerpt` as a passage **string** (including `""`) and `conflictExcerpt` as `""`, not as an object. That is the accuracy compact, not the live wire.

---

## Q1. The proposal-versus-verdict mismatch

**Verdict: the conflict finding is what is ACTION'd; the shared rewrite prompt still leads with first-person-only, so the model can “fix” voice and leave the contradiction. By design of that prompt, not of the badge.**

**What produces the proposal.** `runActionList` → `buildSortedEntries` → one row per inventory finding. For evidence: if the card is not silent, `disposition === "ACTION"`. One `fillAction` / writing-rewrite call per ACTION row. Inventory evidence `rule` is `supportState` (`conflicting`, `partial`, …). `suggestedDirection` is always null on evidence. The model is steered by `thing2` (`evidenceSummary` / commentary), `primaryExcerpt`, and the prompt rules.

**What the proposal is permitted to change.** On a **silent** card the prompt forbids substance edits and allows only we/our/us → named org (B134). On a **speaking** card (`silenceOnCard === false`, which includes every `conflict` card) the same first-person-only block is still printed first; then “Follow the finding.” There is no second prompt that says “you must change the contradicted fact.” `verifyAction` checks quote/reason shape, not “did this touch the conflict.” `resultIsIdentity` only drops no-ops.

**How first-person substitution becomes the evidence proposal on a factual contradiction.** S0 is `conflict` → not silent → evidence ACTION → `buildFindingPrompt` with `silenceOnCard: false` still contains the unconditional “One operation is then permitted… replace a first-person subject… Change nothing else.” A completion that does only that passes `resultAddsUnlicensedOrganisation` because the statement contains “We.”

**Can the user tell.** Only if they read `why` and compare it to the Conflicting badge and the source excerpt. The proposal sits under Evidence, captioned as a proposed sentence (`PROPOSED_SENTENCE_CAPTION`). There is no “this does not address the verdict” flag.

**By design?** The **carve-out** (first-person still editable when the claim is silent) is by design (B134, B155). Applying that same leading instruction to evidence ACTION on a **conflict** card is a prompt-structure leak, not a separately specified product rule. The conflict **verdict** is by design of Stage 2/3 (recommend vs complete). Do not retune Stage 2 to “fix” this. The rewrite prompt is the lever.

**Stage 1 / Stage 2:** the mismatch is not a splitter or Stage 2 prompt bug. Park those.

---

## Q2. The identity contradiction, tested

**Verdict: editorial reads “name in this draft?”; the evidence rewriter reads “env/request name.” They disagree on fixture 18 because Halden Group is not in the draft.**

| Surface | Function | What it uses | On F18-shaped draft |
|---|---|---|---|
| Editorial prompt block | `formatAuthoringOrganisationPromptBlock` | `identifyAuthoringOrganisation(draft, house)` | “not identified in this draft” |
| Style `first_person_plural` examples | `resolveStyleGuide` + `exampleAuthoringOrganisationName` | presence-checked house, else placeholder | “the authoring organisation” in examples |
| First-person **editorial** ACTION fill | `fillAction` + `isFirstPersonActorRule` | same presence check; fail → ACKNOWLEDGE, no model | nothing proposed |
| Evidence ACTION fill | `fillAction` without that gate; `orgName()` | `resolveAuthoringOrganisationName` = env **Halden Group** | proposal can insert Halden Group |

Request-body `authoringOrganisation` is parsed in `api/analyse-statements.js` and `api/revise-actions.js` but Review's `runStatementAnalysis` does not send it (**B95** unexercised). Env is the live house (**B96**, **B124**).

Same family as B95/B124/B86 (presence check vs configured name). Different from B95's unused request path: here the env name **does** execute, on the wrong finding kind.

---

## Q3. The placeholder

**Verdict: “The authoring organisation” is a worked-example template that leaked into model `suggestedDirection`. It is not a resolved house name.**

**Origin.** `AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER` is `"the authoring organisation"`. Used by `exampleAuthoringOrganisationName`, `buildFirstPersonActorInstruction`, static `FIRST_PERSON_ACTOR_INSTRUCTION` (baked with null house), `FIRST_PERSON_ACTOR_FIX_DIRECTION` (“named authoring organisation”), and `buildFindingPrompt`'s `orgName()` when resolve returns null.

**Every other place a similar unresolved placeholder can reach the user** (user-visible copy, not internal prompts):

1. `qcCard.editorialConcerns[].suggestedDirection` and `.note` / combined concern text — model echo (O4).
2. Action-list `proposedChange`, `resultingSentence`, `why` — if env is unset, `orgName` is the placeholder and the evidence/first-person model can write it into the sentence the card shows.
3. Style/editorial rule descriptions in the **model** prompt (`first_person_plural` + `voice_consistency` carry `FIRST_PERSON_ACTOR_INSTRUCTION`). Those are not painted, but they are the source of (1) and (2).
4. Deterministic `NO_PROPOSAL` strings do **not** contain the placeholder. `first_person_unnamed` tells the writer to rewrite in the third person; it does not name a firm.

`formatAuthoringOrganisationPromptBlock`'s fallback line is “not identified in this draft,” which **is** intended user-adjacent instruction to the model and can be paraphrased into the concern note.

---

## Q4. Competing proposals

**Verdict: no content reconciliation. Display both. Save/apply refuses two writes on one sentence. The duplication judge did not fire on first-person or delete-the-sentence because those are INDEPENDENT of the factual conflict by its own prompt.**

**Reconciliation.** None at generation. `sortFinding` does not look at sibling findings. `fillAction` is per row.

**Ordering.** Inventory order: evidence gap row first, then editorial, compliance, framing, recency. UI: separate Evidence / Editorial expansions.

**Suppression.**

- Duplication judge (`judgeEditorialDuplication`): runs only on v4 assembly when `verdict === "conflicting"` and there is at least one editorial concern (`stage7-assemble-card.mjs`). Prompt: suppress only when the editorial concern is the **same factual disagreement** as the evidence-conflict explanation. Voice, register, delete-the-sentence, first person: **INDEPENDENT**. “When in doubt, classify as INDEPENDENT.” First-person on S0 and a delete direction on a figure-conflict card are exactly the independent class. Empty `evidenceExplanation` (skipCommentary) still runs the judge but gives it nothing to match; fail-closed is `[]` (keep all). Missing API key: keep all.
- Apply: `plannedWrites` drops a statement if more than one accepted write (`list.length !== 1`). Frontend `collisionStatementIds`: bulk accept leaves colliding rows `unset`; choosing a second write unchooses the first (`withRowChoice`). That is collision handling, not “evidence wins” or “editorial wins.”

**Count of incompatible pairs on the saved payload: NOT COUNTABLE (0 statements in the named file).**

Lift-1 F18, evidence shape only (no editorial, so not a pair count): **7** of 10 cards are `conflict` (indices 0, 2, 3, 4, 5, 7, 8). Any of those plus a nonempty editorial `suggestedDirection` would be a dual-ACTION candidate in a live Review run. That is a ceiling, not a live count.

---

## Q5. Truncation markers

**Verdict: three producers, two alphabets. Four ASCII dots are Stage 4 appending `...` after a period. Unicode `…` is Stage 2's clip. No marker means the passage was under the cap. Stage 4's sentence-boundary+`...` is the documented intent; four dots are an artifact of that intent.**

Cannot list distinct endings from the live payload. Lift-1 F18 `primaryExcerpt` endings (compacted strings, 10 cards):

| Ending | F18 indices | Count |
|---|---|---|
| Single period, no ellipsis | 0, 3, 4, 5, 6, 7, 8 | 7 |
| Four ASCII dots (`....` = `.` + `...`) | 1 | 1 |
| No ellipsis, ends on `")` (hard cut / short quote) | 2 | 1 |
| Period + Unicode ellipsis (`.…`) | 9 | 1 |

Lift-1 all 261 cards (same compact): 183 single period; 28 four ASCII dots; 8 period+`…`; 6 ASCII `...` without a preceding extra dot; 32 empty; 2 end on a word; 2 other.

**Where each is produced (live v4 path the card face now paints):**

1. **Four full stops (`....`).** `lib/qc/pipeline-v4/stage4-select-excerpts.mjs` `trimExcerptTo300`: if length > 300, last `. ` / `! ` / `? ` in the first 300 chars, then `` `${slice including the period}...` ``. A period plus ASCII `...` is four dots. Intended rule: cap 300, prefer a sentence boundary, mark the cut. Unintended glyph: stacking `...` on `.`.
2. **Full stop + ellipsis character (`.…`).** `trimPassageToLimit` in `lib/qc/pipeline-v4/stage2-match-sources.mjs` (default 400 chars): if whole sentences fit under the cap but the passage was longer, `` `${out}…` `` (Unicode `…`). Same file's last-`.` fallback: `` `${candidate.slice(0, cut + 1)}…` ``. Intended as Stage 2's locatable clip, not as card-face punctuation.
3. **No marker.** Stage 2 and Stage 4 both return the passage unchanged when it is under their cap (400 / 300). Intended for short quotes. Design 2 paints this string verbatim (`cardExcerptDisplay.js` trims whitespace only; no further ellipsis).

Debug `console.debug` in Stage 4 also slices to 80 chars + `…` for **logs only**, not the card.

**Which is intended.** Stage 4's documented cap is the card-facing clip. Unicode `…` is Stage 2. Four ASCII dots are not a third policy; they are Stage 4's marker colliding with a sentence that already ended. Design 2 explicitly said do not ellipsise on paint; it did not remove Stage 4's 300-cap.

Not a Stage 1 split or Stage 2 **prompt** issue. Clipping is post-prompt.

---

## Q6. The event type gap

**Verdict: Review QC does not use event type (B28). Paste-into-Review never sends it. Output type silently defaults to reporting commentary. Drafting-only event type is deliberate.**

**What the pipeline does with an absent event type.** `api/analyse-statements.js` never reads `eventType`. Editorial prompts have `eventType removed (B28)` comments (`editorial-compliance-reviewer.mjs`). `normalizeEventType("")` would default to `NEW_DIRECT_INVESTMENT` if called (`lib/event-type.js`); Review does not call it. Generate/Rewrite still send `eventType: effectiveScenario` (`useAssessState` confirmWritingInputModal / generate).

**Which rules depend on it.** QC style/editorial/compliance `appliesTo` is **output type**, not event type. `first_person_plural` applies to `reporting_commentary` only (`style-guide.mjs`). Event-type framing (`getEventTypeFraming`) and PG word-limit scaffolds are generate-path (`api/generate.js`, `pg-word-limit.mjs`). **B32** / **R6.14** (event-type-aware **review**) is Post-MVP, not built.

**Silent default.** Review `selectedTypes` default `["reporting_commentary"]`; `versionType` default `"complete"` (`ASSESS_STATE_CACHE`). `resolveOutputType` returns `""` if none of options/root/selectedTypes match; `normalizeOutputType("")` on the reviewer path becomes reporting commentary. The user is not asked for event type on paste-and-Review. They may still pick output type and visibility on the Assess chrome (`AssessModule` output type / visibility clicks). Event type lives on `WritingInputModal` / drafting `scenario`, default `NEW_DIRECT_INVESTMENT`, used when generating, not when analysing.

**What the user loses.** Event-specific **generate** framing (thesis-forward vs exit vs capital call, etc.). PG new-fund-commitment word-limit behaviour if they never generate. They do **not** lose a QC rule that currently keys off event type, because none does. They do get reporting-commentary first-person rules unless they change output type.

**Deliberate?** Yes. **B28** shipped 2026-07-05: remove unused `eventType` from the QC path. Generate/Rewrite framing retained. Re-add only if R6.14 ships. Restricting event type to drafting is that decision, not an accident of the paste UI.

Do not fix on this track. Park.

---

## Rank (first-time user trust)

1. **Q1** — Conflicting badge, proposal keeps the contradicted claim. Highest. User can Accept and think the conflict is handled.
2. **Q2** — Card says the house is unidentified and simultaneously writes a configured name into the sentence. Same card as Q1 on S0.
3. **Q3** — Placeholder as suggested wording. Looks unfinished; less dangerous than inserting the wrong firm, more embarrassing.
4. **Q4** — Two incompatible proposals. Apply already refuses a double write; trust hit is confusion, not silent merge.
5. **Q5** — Truncation punctuation. Cosmetic once the quote is on the face.
6. **Q6** — Event type. No current QC effect. Drafting-only by B28.

**Fix first: Q1** (rewrite prompt: do not lead evidence ACTION on a speaking-source / conflict card with the first-person-only operation). That is `lib/revise-actions/prompt.mjs` + tests. Not Stage 1 splitting. Not the Stage 2 prompt.

**Park (Stage 1 / Stage 2 prompt):** none of Q1–Q5 require those. Q6 is already parked as R6.14 / B32. Do not “fix” F18 S0 by retuning Stage 2; recommend-versus-complete is the correct conflict.

**Related tickets, not closed here:** B95, B96, B124, B155, B28, B32, B134, B152 (collision).
