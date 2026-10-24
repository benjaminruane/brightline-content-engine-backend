# B420. One verdict per statement

The card edge, the evidence line, the draft tint, and the header counts read `statementVerdict` in `lib/qc/statement-verdict.mjs`. Nothing else chooses a state.

States, strongest first: `not_in_source`, `conflicts`, `beyond`, `nothing_raised`. Tiers: demands, demands, light, quiet. A wording note does not set a state. A refused or missing note does not set a state. `setBy` says whether a fact, a note, or an action set it.

## Rules

Moved to evidence, contributing `beyond`:

- `overreach_unsupported_causal`

The rulebook category stays `editorial`, because the editorial pass only accepts that category and that is the pass which still raises the concern. After the pass, the statement verdict treats a hit as `beyond`, the action-list kind and id are `evidence`, and the editorial signal is recomputed without it. The concern is no longer dropped for naming the source. `suppressEvidenceLanguageConcerns` still drops `underreach_hedging` when the note uses evidence language.

Left editorial, and they do not set the statement state or tint the sentence. They still appear on the editorial row:

- `voice_consistency`
- `underreach_hedging`
- `register_mismatch`
- `audience_calibration_jargon`
- `jargon_outside_audience_competence`
- `marketing_language_excess`
- `narrative_coherence`
- `materiality`
- `structural_integrity`
- `internal_plausibility`
- `passive_voice_overuse`
- `sentence_length`
- `cliche_and_filler`

`underreach_hedging` still tells the model to judge the surrounding draft. That instruction was left with the rule. A reading note that copies it is refused by the note contract.

Sort effect, this rule only: `sortFinding` uses the evidence branch. On a silent conflict-free partial the disposition stays ACKNOWLEDGE and the reason is `partial_no_edit`. On a card a source speaks to, the finding is ACTION. The action id is `S{n}:evidence:overreach_unsupported_causal:{i}`.

## Callers

`statementVerdict` is the only state.

- `sentenceState` returns that state. A refused note and a wording note are `nothing_raised`. `not_found` still wins.
- `applyReadingContract` stamps `statementVerdict`, `sentenceState`, `sentenceLabel`, and `tier` from it, and softens `editorialVerdict` when the causal concern was the only editorial concern.
- `attachReadingView` builds the header from the stamped cards, so the counts include the action entries on the card.
- `recheckStatements` uses the same function for a changed statement, including that statement's action entries.
- `classifyCard` sets `cardTone` from the verdict when the card has one. Evidence class, editorial class, compliance class, and `needsAttention` are unchanged. Cards with no verdict keep the old tone.
- `evidenceDisplayVerdictLabel`, in both repos, turns the four states into words. It does not choose the state. A statement state is not blanked when `factualBadge` is false. The old evidence slugs are unchanged, and `evidenceCountClass` still counts those slugs.
- The draft tint reads the same state. An editorial concern does not tint the sentence. Word marks are not drawn on a `nothing_raised` sentence.
- The frontend evidence line and card edge read the stamped state. They do not walk `displayVerdict` when the verdict is present.

## Note contract

Added to `NOTE_BANNED_PHRASES`, and said in the note prompt: "the draft does not establish", "the draft does not warrant", "the statement treats", "without supporting context", "the statement fails to", "the surrounding draft", "do or do not establish".

The same check refuses a writer note. The seven stored writer notes that were kept do not contain the new phrases.

## Note re-run

Four clean drafts, the note step only. Model `claude-opus-4-7`. Cache off. 40 calls (38 notes and 2 retries). Input 233227, output 6180, cached input 0. USD 1.320635. Output: `scripts/diagnostic/b420/runs/notes.json`.

38 notes. 32 texts changed. None were refused. None contain a banned phrase. Eight changed bucket:

| Statement | Bucket |
|---|---|
| 3i S5 | wording to conflicts |
| 3i S7 | beyond to wording |
| 3i S9 | none to wording |
| 3i S11 | wording to beyond |
| HICL S4 | none to wording |
| GPI S2 | wording to none |
| ClearPoint S4 | wording to beyond |

The other 24 changed words only. HICL S2 still says the source has expectations and the statement says budgets. HICL S5 still says the source does not carry the valuation claim.

## V1. Where the three disagreed

Card verdicts are `displayVerdict` on the eight drafts in `scripts/diagnostic/b402/runs/reading.json`. Reading states are `scripts/diagnostic/b403c/runs/reading.json`. The action list is stored for the owner's clean HICL run only.

The single verdict now:

| Statement | Card before | Reading before | Action | Verdict now |
|---|---|---|---|---|
| 3i clean S1 | supported_partial | nothing_to_raise | | nothing_raised |
| 3i clean S6 | unverifiable | nothing_to_raise | | nothing_raised |
| 3i clean S9 | conflict | nothing_to_raise | | nothing_raised |
| 3i clean S10 | unverifiable | nothing_to_raise | | nothing_raised |
| 3i doctored S6 | unverifiable | nothing_to_raise | | nothing_raised |
| 3i doctored S10 | unverifiable | nothing_to_raise | | nothing_raised |
| 3i doctored S12 | supported_full | beyond | | beyond |
| HICL clean S1 | supported_full | not_in_source | overreach_unsupported_causal | not_in_source, set by the missing name HCIL |
| HICL clean S2 | supported_full | not_in_source | | not_in_source, set by budgets |
| HICL clean S5 | supported_full | beyond | | beyond, set by the note |
| HICL clean S6 | supported_partial | nothing_to_raise | evidence partial | nothing_raised |
| HICL doctored S0 | supported_full | not_in_source | | not_in_source |
| GPI clean S0 | supported_partial | nothing_to_raise | | nothing_raised |
| ClearPoint clean S1 | supported_full | beyond | | beyond |
| ClearPoint clean S2 | supported_partial | nothing_to_raise | | nothing_raised |
| ClearPoint clean S5 | supported_partial | nothing_to_raise | | nothing_raised |
| ClearPoint doctored S1 | supported_full | beyond | | beyond |
| ClearPoint doctored S3 | supported_full | conflicts | | conflicts |
| ClearPoint doctored S5 | supported_partial | nothing_to_raise | | nothing_raised |

On every one of these, the draft tint and the card edge are both taken from the verdict now. They do not differ.

## V2. Budgets

HICL clean S2. Verdict `not_in_source`, set by the fact `budgets`. Evidence line "Not in the source". Draft tint red, the same as the card edge.

## V3. Fortysouth

HICL clean S5. Verdict `beyond`, set by the note. Card edge amber. Draft tint amber.

## V4. Refinancing

HICL clean S6. The stored card was `supported_partial`. The reading was `nothing_to_raise`. The action is an evidence partial, not the causal rule. The verdict is `nothing_raised`. The sentence is not tinted. The card edge is green.

The causal concern on this run is HICL clean S1, the HCIL sentence. The missing name already sets `not_in_source`, so the causal action does not change that verdict. The edge and the tint are both red.

## V5. Stronger than the card

These stored readings were already a finding. The card had said nothing raised (`supported_full`). The line and the edge now show the finding:

- HICL clean S1, not in the source, the name HCIL
- HICL clean S2, not in the source, budgets
- HICL clean S5, beyond
- HICL doctored S0, not in the source
- 3i doctored S12, beyond
- ClearPoint clean S1, beyond
- ClearPoint doctored S1, beyond
- ClearPoint doctored S3, conflicts

No stored reading got a stronger state from the verdict function alone.

The note re-run, if those notes replace the stored ones, makes three statements stronger and one weaker:

- 3i S11, the soft ledger item, quiet to beyond. The source attributes the outperformance to the 3iN asset portfolio, not to the 9% gross investment return.
- ClearPoint S4, quiet to beyond. The new note says "from a low base" is a characterisation the source does not make.
- 3i S5, quiet to conflicts. The new note says nine reporting periods and nine months are a different period measure. The ledger calls this statement correct, so this demand is noise.
- 3i S7, beyond to quiet. The new note treats "meaningful" as a restatement of the EUR 14 million figure.

## V6. Clean ledger

Stored reading, recounted with the new verdict and no model call: demands 3, light 5, quiet 30, noise in demands 0. No statement moved.

Note re-run, facts left as stored, new notes applied: demands 4, light 6, quiet 28, noise in demands 1. The noise is 3i S5. The other movers are 3i S7, 3i S11, and ClearPoint S4, named in V5.

## Bar

On the owner's eight statements, the draft tint and the card edge are the same colour for each statement. No card with a missing fact says "Nothing raised". Budgets and HCIL both say "Not in the source".

## Writer note

Of the eight stored drafts, one writer note is absent: 3i doctored, `writerFeedback` null in `scripts/diagnostic/b402/runs/reading.json`. The measure script withheld it when `noteEndorses` was still true after one retry. The refused text was not stored, so the sentence cannot be quoted. The check is the same one that refused statement notes for "aligns with", "aligning with", and "source confirms". That refusal is the contract working. The ban was not loosened.

The owner's October HICL fixture has no writer note, because that run predates the reading layer. The stored HICL clean writer note in the eight-draft file was kept. It does not contain a banned phrase.

A withheld writer note now keeps the refused text and the phrase that refused it (`writerFeedbackRefused`, `writerFeedbackRefusal`). The screen still shows nothing. A reply whose JSON uses `feedback` or `text` instead of `note` is read, and then the same ban is applied.
