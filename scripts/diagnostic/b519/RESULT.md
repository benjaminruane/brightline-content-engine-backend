# B519

pass: /Users/benjaminruane/CE DEV (local)/GitHub/brightline-content-engine-backend/scripts/diagnostic/b503/pass-1.json
cards: 288
model calls: 0

## G1
Partials reading Nothing raised: before 5, after 0.
08:3: Nothing raised -> Needs a look (light)
12:1: Nothing raised -> Needs a look (light)
14:3: Nothing raised -> Needs a look (light)
14:8: Nothing raised -> Needs a look (light)
24:6: Nothing raised -> Needs a look (light)

## G2
Red or amber headline with no reason line, after the fallback: 0.
C3 count: 0.
no card uses the empty-headline sentence

## G3
Stage 4 was called on the stored matches. It does not call a model.
Stored matches with a passage: 0. Stored matches with preBackstopClassification: 0.
Stage 4 cannot show a kept passage from this pass. The stored matches do not carry the passage or preBackstopClassification, and recovering either would need a model call. Item 3 ships on the unit test. No card on this pass gained a passage.
Re-run excerpt strings that differ because the stored match has no passage: 281.
That difference is the missing stored passage. It is not a card gaining a passage from a rewrite.

## G4
Label or tier changes against the removed quiet override: 5.
08:3: Nothing raised (quiet) -> Needs a look (light)
12:1: Nothing raised (quiet) -> Needs a look (light)
14:3: Nothing raised (quiet) -> Needs a look (light)
14:8: Nothing raised (quiet) -> Needs a look (light)
24:6: Nothing raised (quiet) -> Needs a look (light)
Every other card is identical on label and tier.

## G5
label_override silences, counted by rule:
applyReaderDecides: 5
applyReaderSupportedIncomplete: 2

## G6
Recomputed from the stored cards with the new display code. The pass was not re-run.
catch: 13/13
group A: 11/11

## Decisions
Empty confirmation still changes a class to not_reviewed and already records that row. It was not retargeted to no_support.
A failed apply returns before setDraftText. The draft text is unchanged, so the apply failure sentence is the unchanged-draft sentence.
Re-check clears findings only for statement ids mapped from the cleared decision ids. An id that cannot be mapped leaves the map as it is.
Label override rows are recorded in applyReadingContract, where sentenceLabel is stored, from the full-card trace. The thin shownLabel call that writes sentenceLabel is unchanged.
anchor-window-replay.mjs names Halden Group. It does not build a prompt and does not call a model.

