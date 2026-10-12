# B386. Design

No product code. Options, not a chosen build. Where two options change what the reviewer sees, the notes say which is cheaper, which is more honest, and which is harder to reverse.

The causes are the eight in `scripts/diagnostic/b386/ASSESSMENT.md`. Stages 3, 4, and 7 are the regression gates. A design moves a gate when it changes the function those tests lock.

- Stage 3: `aggregateVerdict`, `applyIntraSourceReducer`, `demoteConfirmedClassifications`. Tests include `tests/stage3-conflict-precedence.test.mjs` and `tests/confirming-passage-cannot-confirm.test.mjs`.
- Stage 4: `selectExcerpts`. Tests include `tests/excerpt-selection.test.mjs` and `tests/excerpt-sentences.test.mjs`.
- Stage 7: `assembleCard` and the display checks it calls (scale, dateline, role, quote-without-comment, omission strip). Tests include `tests/card-honesty-invariant.test.mjs`, `tests/b362-silence-and-scale.test.mjs`, `tests/b366-party-and-empty-quote.test.mjs`, `tests/b369-quote-without-comment.test.mjs`, `tests/b378-dateline-and-word-numbers.test.mjs`.

Stage 2 elicitation and Stage 5 commentary are not those gates. A prompt change there still changes the card.

## 1. Options per cause

### A. A confirming class, plus a passage that need not contain the claim

This is the live remainder of G1, the name half of G2, and G4's first route.

Option A1. Keep the class, and add more closed checks (scale phrases, party names, period phrases) beside `applyScaleCauseCheck` and `appendDateSubjectSpans`. Cheaper: no new call, Stage 7 only, and Stage 3 only when a check demotes a class before aggregation. More of the same shape that already caught TCR and the HICL date. Less honest when the next miss is a phrase the list does not contain. Easy to reverse one check at a time. Hard to finish: the list is how "vast majority" was missed.

Option A2. Green requires a locate, defined in section 5. The class `confirmed` becomes a proposal the assembler may ignore. More honest. Moves the Stage 7 gate, and the Stage 3 gate if `confirmed` stops winning aggregation on its own. Harder to reverse because every current green was earned by the class. False flags rise on correct sentences whose wording is not in the source (paraphrase, "the company"). That is G14's side of P1.

Option A3. Turn `QC_ACTOR_OF_THE_ACTION` back on. Rejected in section 6. B371 turned it off because it false-flagged the labelled set. It also would not see HCIL as a leading-actor swap unless the first six words match the rule. It is not the name fix.

### B. Empty-confirmation recovery forces green

`assembleCard` lines 984-987. G3, G12, and GP Industries clean S1.

Option B1. Recovery may attach the located sentence and may not set `supported_full`. The card stays `not reviewed`, or stays partial if some other class already said so. Cheaper: one assignment, Stage 7 gate (`tests/b366-party-and-empty-quote.test.mjs` expects the verdict to follow the recovered evidence, so that test moves). More honest than a green. The reviewer sees a quote and is not told the sentence was verified. On a true sentence whose matcher returned an empty passage, this is a new flag (the clean S1 runs). Easier to reverse than A2.

Option B2. Recovery may set green only when every figure and every capitalised name in the statement occurs in the located passage. ClearPoint S3 would still go green: 80% and 3.0 are in the passage, and "vast majority" is neither a figure nor a name. This option does not fix G3. It does stop a recovery that located "plants in the UK" from greening a sentence about China.

Option B3. A scale-lexicon phrase with no computable ratio is not green. "vast majority" is in `SCALE_RATIO`, and `arithmeticScaleCheck` returned null because the denominator is not on the card. This catches S3. It also refuses green for a true "majority" or "vast majority" whenever the two figures are not sitting in two singleton passages. Stage 7 gate (`tests/b362-silence-and-scale.test.mjs`). More honest about scale. Broader false flags than B1. The arithmetic could be taught to read two money figures in one passage plus a total elsewhere in the source. That is a wider search, and a prior-year pair in the same sentence is the case B362 already refused to treat as a part and a whole.

### C. One draft mark, and none for no_support or for a conflict born later

G5, G6, G7. The elicit returns one string. `no_support` is not eligible. The reducer can conflict a pair the elicit never saw. The client does not paint the array (B342).

Option C1. Ask the elicit for a list, and keep every exact substring. One sentence can mark the FDA clause and the verb clause. Moves Stage 7 only as a pass-through the schema already allows (`qc-api-schema.mjs` already requires an array). The elicit prompt is Stage 2, not a gated stage. The client change is outside the three gates and is required before the reviewer sees the second mark. More honest. A model list is still one model's choice of boundaries, so G6 becomes "several model strings" rather than "the differing tokens". Harder to reverse once the client paints them.

Option C2. Derive the marks in code from tokens in the statement that do not occur in the located passage (figures, dates, names, and the closed scale list). No second model call. Deterministic, so G13 does not move the marks. Misses a verb swap ("bartered" / "sold", "commenced" / "completed") unless the verb is on a list. Cheaper than C1. More honest where it fires, silent where the list is short. Stage 7. Easier to reverse.

Option C3. When the reducer or a demotion changes the class to conflicting after elicitation, run the elicit then, or mark the tokens that caused the demotion. Closes the HICL S3 hole (the Pancras span is the evidence; the draft tokens that differ can be marked by C2 without a call). A late elicit is another model call and inherits G13. Prefer C2 for conflicts the code itself created.

### D. The comment is Stage 5 prose

G8, G9, G10, G11. Section 3 is this cause. The options here are only the ones that change what a comment is allowed to say, not how it is phrased.

Option D1. The comment is a template filled from the marked spans and the located source tokens. Stage 5's prose is dropped on evidence, or kept only where a template cannot be filled and is then labelled as unchecked. Moves Stage 7 if assembly replaces `evidenceSummary`. Does not move Stage 3 or Stage 4. More honest. Less useful on a card whose only good sentence today is the model's (HICL S7 names three errors and shows no passage). Harder to reverse because the voice of the card changes.

Option D2. Keep Stage 5, and reject any comment sentence that asserts a draft wording the passage does not contain, or denies a wording the passage does contain. The omission strip grows from "does not mention" to the denial verbs already in the wild ("does not specify", "does not confirm", "does not state"). A confirming sentence that uses the draft's verb is dropped when the passage has a different verb. Stage 7. Cheaper than D1. Less complete: a comment can still mis-describe a gap the strip does not parse. Easier to reverse. This is the minimum that makes G10 and the margin half of G11 structurally harder. It does not make them impossible.

Option D3. Prompt edits that ask Stage 5 to be more careful. Rejected in section 6. The confirmed branch already orders the affirmation G8 exhibits.

### E. Stage 2's class is not repeatable

G13. Aggregation is already deterministic. The class is not.

Option E1. Do not use the class as a green. Section 5. A flip from `confirmed` to `partially_confirmed` can still flag a true sentence. It can no longer pass a false one. P4's green half holds. The flag half still moves. This is A2 applied to repeatability.

Option E2. A durable cache of Stage 2 completions, keyed by statement and source bytes. Same bytes, same class, until the prompt changes. B61 records that the memory cache does not survive a cold start, and that `seed=1` does not pin the class. A store would make a re-run of the same build repeat. It would not make two prompt versions agree, and it would replay a wrong class forever. More repeatable, not more true. Moves no verdict gate until a replay differs from a live call. Harder to reverse once production is serving cached classes.

Option E3. Run Stage 2 twice and green only on agreement. Doubles the Stage 2 bill. A pair of wrong agreements still greens. Rejected as a way to buy P1.

### F. The hyphenated range parses as two magnitudes

G14. "USD 52-56 million" becomes 52 and 56,000,000. The source is 52,000,000 and 56,000,000. `pairRelationship` returns `mutually_exclusive`. The lift keeps the model's conflict.

Option F1. When a hyphen joins two numbers and a scale word follows the second, apply the scale to both, then compare the pair as a range if the source says "between A and B" or "A to B". Stage 2's figure parser, which is an input to Stage 3. The Stage 3 gate moves because classes change. Predicted false-conflict removal is this one card, stable across three clean runs, so a re-assembly can show it without a model call. Risk: a real conflict of 52 against 52 million gets glued into a range and disappears. The rule has to require the hyphen and the shared scale word, not a bare 52 next to a million somewhere else.

Option F2. Leave the parser, and do not let a model conflict survive when both endpoints match after a scale repair. Same rule, applied only as a lift, so it cannot create a conflict. Narrower. Stage 3 gate still moves for cards the lift currently keeps as conflict. More honest on this card. Easier to reverse than teaching every money parser the hyphen.

### G. Dateline

No new option. `assessAnnouncementDateline` returns agree on the stored GP Industries sentence and source. The capture build is older than B378. A further dateline change is not the fix. Re-assembly of runs 2 to 4 is the demonstration that the shipped rule clears the false "does not specify November" sentence. One live re-run is not that demonstration (G13).

### H. Proposals and the hand-back copy

G16, G17. Rewriting is not the target.

Option H1. Retire the proposal layer for evidence conflicts. The card keeps the passage and the marks. No "wording is yours". Cheaper to operate (the revise-actions call goes away for those rows). More honest about what the product does. Harder to reverse if a later spec wants a licensed name swap back: B374's replace path is the part worth keeping, and it is not a rewrite. The two-genre conflict cards still produce no pair, so retiring the layer changes their copy and does not remove a proposal they were receiving.

Option H2. Keep a replace only for a licensed pair (the B374 name, the unique figure). Everything else gets a direction that names the marked words and the source words, and does not say the wording is the reviewer's. The four `NO_PROPOSAL` lines and `GENERIC_CONTRADICTION` change. Copy only, no verdict gate, no Stage 3, 4, or 7. Easier to reverse. More honest than the current sentences. The product owner has rejected the hand-back and has not supplied the replacement sentences. Those sentences are a product decision. Do not invent them in a drive-by.

Option H3. Make the proposal layer try harder (more pair kinds, a model rewrite). Rejected. It moves the product toward the thing the target excludes.

## 2. G5. What a card shows when no supporting passage is found

Five of the 37 substitutions. The shipped locator is not the answer. On HICL S7 it returns null, because it looks for the draft's own words and those words are the error. On ClearPoint S9 it returns a 2027 cost-synergy sentence, not the guidance. Showing that sentence as the excerpt would assert the wrong place.

Three shapes.

Nearest-miss passage. Search for a source sentence that shares the most non-error tokens (Affinity Water, white paper, appointed; revenue guidance, million) and show it under a label that is not "the source confirms" and not "the source contradicts". Cheaper if it reuses `locateClaimSentencesInSources`, and that reuse is the dishonest version, as the S9 result shows. An honest nearest-miss needs a different search and a visible label. More useful when the counterpart sentence shares tokens (CEO near CFO). Harder to reverse once reviewers treat the quote as the finding. Moves Stage 4.

State what was searched. The card lists the figures, dates, and names that were looked for, and says none of them occur in the source. No passage. Cheaper than a new search. More honest than a wrong quote. The reviewer still cannot settle CFO against CEO without the source, so P2 is not met. Easier to reverse. Stage 7 copy, no Stage 3 change. This is the right content for the case where the search finds nothing, and the wrong content if it is the only case the product has.

A third state, beside green and flagged. `not_addressed`: the source was searched, these tokens were not found, and the product is not calling the sentence false and not calling it verified. Today `not_supported` is already a verdict, and the screen treats it as a flag (high concern, a comment that says remove the claim). The missing state is not another verdict name. It is a card that does not pretend the comment's source facts were shown. Adding a colour or a badge is a client contract change on top of `displayVerdict`. Harder to reverse than copy. More honest than painting `not_supported` in the same chrome as a contradiction. It does not, by itself, put the CEO sentence on the card.

What P2 requires when the counterpart exists: the counterpart sentence, located by code, labelled as the nearest source sentence that shares the claim's topic and not as support. What P2 requires when it does not: the searched-for tokens, and no invented passage. A third colour is warranted only if `not_supported` cannot be rendered without looking like a conflict. The payload already distinguishes `not_supported` from `conflict`. The failure is the empty face, not the number of colours.

## 3. Comment from the marked spans

Yes, if the comment is allowed to say only what the marks and the located tokens support. G8 and G9 then cannot happen: there is no sentence that can affirm "bartered", and no sentence that can discuss "significant" while the mark is MAIT, because the comment cannot mention a draft word that is not in a mark or a source word that was not located.

What it costs. The model comment is sometimes the only place the fault is named (HICL S7, three errors, no span, and the comment is right). A template would say that the searched-for tokens were not found, and would not name CEO or water until a passage is located. That is a loss of usefulness and a gain on P3, because those right words are currently an assertion with no passage on the card. Fluency goes. "The reviewer should reconcile or remove" goes, unless it is a fixed tail and not a claim about the source. G10's wrong instruction goes with it, which is the point: a template cannot tell the writer to delete a purchase the span does not show as absent.

A hybrid that keeps Stage 5 and then deletes illegal sentences (option D2) keeps more usefulness and does not make G8 impossible. The model can still affirm an error using words the strip does not catch. That is the prompt-dependent version. Section 6 rejects it as the whole fix. It is a reasonable backstop after the template, not instead of it.

Stage 7 moves. Stage 5 can stay in the pipeline for editorial and compliance, which are not this target.

## 4. More than one marked error

A card can carry more than one mark without a second card. The schema already allows `unsupportedSpans` as an array of `{ text, start, end, classification }`. Assembly already copies the array. The producer writes at most one entry per source match, and only for a partial or conflicting single-pick.

Stage 7 has to keep a list rather than one elicit field, and has to accept marks that code derived (section 1, C2) as well as elicit strings. The verdict stays one per sentence. Architecture: claim spans never add cards, and they may not downgrade. Multiple marks are not claim cards. They do not vote a second verdict.

The client contract. The frontend does not read `unsupportedSpans`. The draft highlight is `draftSpan`, the whole sentence (`StatementAnalysisPanel.jsx` builds `claimSpan` from it). Until the client paints every span with a start and end, a second mark is invisible. That paint is the contract change: an array of ranges on the statement, not a new verdict field. `conflictValues` staying null does not block it. The passage is already the evidence; the ranges say which draft words the passage is about.

A sentence with two errors then shows two ranges and one verdict. The verdict is the more serious of the two (conflict over partial over not supported), which is the reducer's rule already. The comment, if it is the template in section 3, has one sentence per range.

## 5. What P1 requires

A sentence may be called green only when all of the following are true.

1. At least one passage was sliced from the named source by code, not typed by the model.
2. Every figure, date, and capitalised name in the statement that the card is treating as confirmed occurs in that passage, by a locate that can be re-run from the two strings.
3. Every closed scale phrase in the statement (`SCALE_RATIO`, and the universal-set regex) either passes its arithmetic or holding check, or is absent. A scale phrase whose ratio cannot be computed is not green.
4. No demotion is standing (`applyScaleCauseCheck`, date rule (b), role-party, dateline conflict).
5. The reason stored on the card is the locate (the passage and the tokens), not a model class. `stage2SourceFingerprints` may record the class. They may not be why the badge is green.

A model may have proposed the passage. The green is the locate. If the locate fails, the sentence is not green, whether the model said confirmed or said nothing.

Current code cannot enforce this. It enforces a weaker rule: `supported_full` requires some located string (`applyExcerptHonestyToDisplay`), and a short list of regexes may demote afterwards. `aggregateVerdict` will still return `confirmed` from a class whose passage shares no disputed token. Recovery sets `supported_full` when any anchor sentence is found. The confirmed branch of the Stage 5 prompt then states that the source confirms the statement.

The rule can be enforced in `assembleCard` without giving the model a vote, by computing the display verdict from the locate and ignoring `confirmed` as a sufficient condition. That moves the Stage 7 gate. It moves the Stage 3 gate only if `supportState` stops being `supported` when the locate fails. P1 is about the badge the reviewer sees, which is `displayVerdict`. `supportState` can stay as the Stage 3 record if the badge does not follow it. Keeping them apart is the smaller gate (Stage 7 only) and leaves a card whose two fields disagree, which is a P5 defect. Setting both from the locate is the honest record and moves Stage 3's meaning in the tests that treat `supportState: supported` as the green.

## Candidate and verify

The whole-draft arm found 36 of 37. B381's fabrication table is the other half of that result: on draft-1, 73 of 316 passages were not in the named source. The information is in the source. A model's locate is not yet evidence.

The shape: a model proposes claims and passages. Code verifies each proposal before it is shown and before any sentence is green. The model does not decide the verdict.

P1. This holds if, and only if, section 5 is the green rule and a model class is never sufficient. A proposal whose passage fails `locatePassageInSource` is dropped, comment included, the way B381's own fabrication check would have withheld it. Under that rule a model upstream of the verifier does not break P1. Under any rule that copies `confirmed` onto the badge, it breaks P1, and this assessment rejects that version. The stored greens are that version already: Stage 2 is a model class treated as a verdict.

P4. B381's two passes agreed on 90 of 100 labelled statements and moved 10. G13 shows the current Stage 2 class moving on one real document. If a sentence is green when a proposal verifies and not green when the model stays silent, those misses become different badges on the same document. The green half of P4 holds only when the locate does not depend on the model having spoken: code searches for the anchors whether or not a proposal arrived. The flag half does not hold for any flag that exists only because the model proposed it. A deterministic contradiction (the range parse, the date, the one holding) does not flicker. A model-proposed contradiction that code then confirms will flicker whenever the proposal flickers.

Cost. B381 metered the four doctored drafts as the `real-runs` row: 4 calls, discounted USD 0.12288250, input 14,074, output 10,529, model `gpt-5.1-2025-11-13` (`scripts/diagnostic/b381/REPORT.md`, Metered spend). That is one call per draft, not a full Review. This pass did not re-meter Stage 2, Stage 5, or Stage 6. Adding the arm on top of those stages is that 0.12288250 plus an unpriced Review. Replacing Stage 2 with it is a different architecture and is not what that row measures. Latency: one round trip per draft against the current per-statement, per-source Stage 2 calls, plus a second elicit call on partial and conflicting pairs. No wall-clock figure is claimed here.

Do not adopt the shape because it scored 36. Adopt the verifier. The proposer is optional, and only as a hint about where to look, discarded when the locate fails, and unable to create a green by speaking or by staying silent. That is section 5 with a search hint. It is not a new verdict path.

## 6. Rejected

Verdict authority to a model. Any design in which `confirmed`, `conflicting`, or `not_supported` from a model becomes `displayVerdict` without a locate. That includes using the whole-draft arm as the reviewer, and using its class when the passage happens to locate. The passage locating is not the claim locating.

Turning the actor check on as the HCIL fix. B371 stands until a check exists that does not false-flag the labelled set. This pass did not design that check.

Calling `locateClaimSentencesInSources` on `not_supported` and showing the string as the excerpt. ClearPoint S9 demonstrates the wrong sentence.

Running Stage 2 twice and greening on agreement. Two wrong answers agree. The bill doubles. P1 is not met.

A durable cache as a truth fix. It replays whatever the model said, including the GP Industries flip, for as long as the key matches.

Prompt-only edits to Stage 5. The confirmed instructions already order the affirmation G8 exhibits. A softer prompt does not change what a comment is allowed to assert. P20: if code trusts the prose, the model is the specification.

Teaching the proposal layer to compose a sentence. The target excludes rewriting. H3 in section 1.

Anything whose only demonstration is one live re-run of the four drafts, or a one-count move on the labelled hundred. B162: the hundred moved 4 points on identical runs, and the catch-of-11 interval is 43 points wide. G13: the deterministic route's input moved on GP Industries across five runs. A single re-run is not evidence. A re-assembly of stored stage outputs, with no model call, is evidence for a Stage 7 change. A Stage 2 change needs at least two live passes, reported as a range, and a predicted count written before the run.

## 7. Sequencing

The single change that buys the most is B1. Empty-confirmation recovery may show the quote and may not set `supported_full`.

It is the live false green. G1's TCR sentence and G2's date are already demoted by checks on main, which the stored cards predate. G3 is not. One wrong green forces the reviewer to read the source for the rest of the document. Five empty `not_supported` cards (G5) are the larger count and the worse daily experience, and they are already flags. They are second.

Predicted movement on the 37, before any implementation.

Re-assemble the four stored doctored payloads through current Stage 7, no model call. Count this separately from the new line, because it is the code already shipped:

- 3i S12 leaves `supported_full` (`applyScaleCauseCheck` on the stored span). One substitution.
- HICL S0 leaves `supported_full` (date sentence appended, rule (b) demotes). Two substitutions. The name is not what the check marks.
- ClearPoint S3 stays `supported_full`.

Then B1, same re-assembly:

- ClearPoint S3 leaves `supported_full`. One substitution. The quote can remain. The badge cannot be green. The B369 sentence "80% and 3.0 match the source" must not be emitted as a confirmation, because `allowMatchSentences` is true only for green.

That is the new line's movement: 1 of 37. Together with the shipped checks, the 4 substitutions that sit on a green card in the B385 payloads are no longer on a green card. The "comment names the error" count of 27 is not predicted to move. G5, G6, and G8 stay.

Outside the 37, state it so it can be scored: GP Industries clean S1 on the runs whose only path to green is recovery (runs 3, 4, and 5 in the stored fingerprints) becomes not reviewed. That is a new flag on a true sentence. It is the cost of B1, and it is acceptable only because the alternative is a green whose excerpt is one clause.

Do not demonstrate B1 with a live Review. G13 means the Stage 2 class on that document moves. Re-assembly cannot move.

Second, after B1 is scored: C2 plus the section 3 template, so a flag names the tokens and nothing else. Predicted before that work, not as this change's number: the five G5 substitutions gain a searched-for list and still gain no passage until a counterpart search exists; the G6 sentences gain a second mark only where a second token is absent from the passage. "bartered" and "commenced" will not gain a mark from a figure-and-name diff. That limit should be written down before the code, and scored by re-assembly, not by a re-run.

## Technical summary

No product code. `scripts/diagnostic/b386/ASSESSMENT.md` ties each of the seventeen gaps to a function and splits capture from live. `scripts/diagnostic/b386/DESIGN.md` gives options per cause, rejects a model verdict, and predicts that stopping recovery from setting green moves 1 of 37, with 3i S12 and HICL S0 moving only because checks already on main fire when the stored spans are re-assembled.

## Plain-language summary

The product still passes one planted error as verified, by treating a nearby true sentence as proof of the whole line. Two of the other passed errors would not pass if today's checks were run on the saved cards. The first fix is to stop calling that nearby sentence a pass. It does not, by itself, make the empty flags understandable.
