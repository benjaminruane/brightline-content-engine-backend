# B389. The verification gate, simulated on stored model output

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  8432ffd  main  166 files  1817 tests` |
| Cost | USD 0. No model calls. No live runs. The passes were already in `scripts/diagnostic/b388/runs/`. |
| Rules | `scripts/diagnostic/b389/GATE.md`, committed as `40c9626` before `simulate.mjs` was run. |
| Evidence | `scripts/diagnostic/b389/runs/summary.json`. |

The rules in GATE.md were not revised after any score was seen.

## 1. The three-state split on the clean drafts

Thirty-eight statements. The reviewer skips a verified green, settles a flag on the card, and has to read the source for anything the gate could not verify.

| | Verified green | Flagged | Could not verify |
|---|---|---|---|
| Pass 1 | 13 | 16 | 9 |
| Pass 2 | 13 | 11 | 14 |
| Pass 1, agreement column | 10 | 16 | 12 |
| Pass 2, agreement column | 10 | 11 | 17 |

Pass 1 saves a full source read on 13 of 38 sentences and still asks for one on 9. The other 16 are flags. Pass 2 asks for a source read on 14 of 38. The agreement column asks for one on 12 and 17 of 38. Skipping the verified sentences does not make the draft a short list of flags.

B388's 9 wrong flags and 8 real discrepancies, after the gate:

| | Wrong flags still flagged | Wrong flags unverified | Wrong flags greened | Real discrepancies still flagged | Real discrepancies unverified | Real discrepancies greened |
|---|---|---|---|---|---|---|
| Pass 1 | 9 | 0 | 0 | 7 | 1 | 0 |
| Pass 2 | 7 | 2 | 0 | 4 | 4 | 0 |

The gate did not green any of the 8. It also did not remove the wrong flags on pass 1: all 9 are still flags. On pass 2, 2 of the 9 and 4 of the 8 lose the flag and become could-not-verify. The lost real flag on pass 1 is HICL clean statement 1, the HCIL spelling. Its passage does not locate, so the comment that names the spelling is withheld. The reviewer is sent to the source and is not told the word.

No clean statement outside those 17 was flagged.

## 2. The 37

A usable flag is a statement the gate marks flagged, with a verified passage, whose surviving comment names the fault. Could-not-verify is counted on its own. It is not a miss and it is not a usable flag.

| | Usable | Flagged, comment does not name this substitution | Could not verify | Greened |
|---|---|---|---|---|
| Pass 1 | 34 | 2 | 1 | 0 |
| Pass 2 | 32 | 2 | 3 | 0 |

B388 named 36 of 37. The current route named 27 of 37.

The could-not-verify substitutions are ClearPoint S0, "April", on pass 1, and all three GP Industries S0 substitutions on pass 2 (October 2025, 75 percent, escalating oil prices). The passage did not locate. The comment was withheld. The product stops the reviewer without a reason.

The two that stay flagged without naming the substitution are the same on both passes. GP Industries S4, "bartered", is the miss B388 already recorded: the surviving comment calls the word unusual and treats the outlets fact as supported. ClearPoint S8, "has been commenced", loses the comment that described it. The comment that survives names the FDA error on the same sentence and does not mention commenced.

Every other flagged substitution is named by a comment whose passage located. The comments are in `runs/summary.json`.

## 3. Held-out catch and leave-alone

Fixtures 11 to 20. Could-not-verify is passed to the scorer as `not_supported`, so it is neither a catch nor a leave-alone. The pipeline slice is `scripts/diagnostic/accuracy/runs/evidence-pass-oct-06-b378/cards.json`.

| | Catch of 8 | Leave-alone of 40 |
|---|---|---|
| Pipeline, 6 October | 7 | 36 |
| B388 pass 1 | 5 | 37 |
| B388 pass 2 | 5 | 31 of 40, of which 5 had no verdict |
| Gate, pass 1 | 1 | 34 |
| Gate, pass 2 | 0 | 27 |
| Gate, agreement column | 1 and 0 | 27 and 27 |

The one remaining catch on pass 1 is not the 11.1 percent margin. That sentence stays verified green. Its label is conflicting. The gate quoted the line that matches and did not see the line that does not.

## 4. Demotion accounting

Of the greens B388 stored:

| | Greens | Survive G1 | Survive G1 and G2 | Survive G1, G2, and agreement |
|---|---|---|---|---|
| Pass 1 | 143 | 136 | 117 | 80 |
| Pass 2 | 109 | 100 | 84 | 80 |

G1 removes 7 of 143 greens (4.9 percent) and 9 of 109 (8.3 percent). G1 and G2 together remove 26 of 143 (18.2 percent) and 25 of 109 (22.9 percent).

Claude's citation check was: of 186 claim passages on pass 1, 131 verify verbatim after whitespace and quote normalisation, 55 do not, 49 of those 55 contain an ellipsis, and 42 of those 49 have every fragment in the source. Genuine non-locating is about 13 of 186.

That count replicates on the passages that are not from the four clean drafts: 186 passages, 131 verbatim, 55 failures, 49 with an ellipsis, 42 rescued by the fragment rule, 13 not rescued. The clean drafts add 43 passages. The whole of pass 1 is therefore 229 passages, 158 verbatim, 71 failures, 61 with an ellipsis, 54 rescued, 17 not rescued. The difference from 186 is those 43 clean-draft passages, not a different normalisation.

## 5. Withheld comments

A comment is withheld when its passage fails G1. Pass 1 withholds 21 comments, all of them on the 21 claims whose passages fail. Nineteen statements have a stored verdict and no passage that locates. Pass 2 withholds 31 comments on 31 failed claims. Twenty-six statements have a stored verdict and no locating passage.

A confirmed claim that passes G1 and fails G2 keeps its comment. That is 19 of the pass-1 greens and 16 of the pass-2 greens: the passage locates, an element in the claim is absent from it, and the confirming comment is still displayable.

## 6. Stability after the gate

The two gated passes agree on 163 of 219 statements. B388's ungated passes agreed on 172 of 219. The gate does not absorb the instability. It passes it through, and 9 more statements disagree because a passage locates on one pass and not the other.

The agreement column agrees on 196 of 219. That rise is the column turning a one-sided green into could-not-verify. It is not the two readings becoming the same flag.

## 7. The four promises

P5 is out of scope. It is not scored.

P1. Green means verified. No. The gate's own greens have a locating passage and, where G2 applied, the claim's figures, dates, and multi-word names in that passage. That is not enough. Fixture 13, "EBITDA margin is 11.1% on trailing twelve months revenue of EUR 76 million," stays verified green on both passes. The label is conflicting. One known conflict is in the skip pile.

P2. Every flag is resolvable on the card. Yes, for a flag the gate emits. A flagged statement has at least one not-confirmed claim whose passage located, and that comment is shown. There is no flagged claim with a failed passage. On the clean drafts that is 16 flags and 11 flags. Two planted substitutions sit on flagged sentences whose surviving comment names a different fault in the same sentence.

P3. The product never asserts what it cannot show. No. Nineteen pass-1 greens and 16 pass-2 greens are demoted by G2 and keep the comment that says the claim is confirmed. Could-not-verify was defined so that it would not assert. Those comments still do.

P4. Same document, same answer. No. 163 of 219 gated verdicts agree. B388 was 172 of 219. The pipeline's repeated runs were 94 to 97 of 100.

## 8. Claude's five predictions

Quoted, then scored. Each pass is scored on its own.

"G1 demotes about 7 per cent of greens." Pass 1 is 4.9 percent (7 of 143). That is not about 7 percent. Pass 2 is 8.3 percent (9 of 109). That is about 7 percent. The prediction does not hold for the pass it was aimed at, the 143.

"G1 and G2 together demote between 15 and 30 per cent of greens." Pass 1 is 18.2 percent (26 of 143). Pass 2 is 22.9 percent (25 of 109). Both hold.

"Usable flags on the 37 fall from 36 to between 30 and 34." Pass 1 is 34. Pass 2 is 32. Both hold. The could-not-verify substitutions are not in that usable count.

"Wrong flags on the 38 clean statements fall from 9 to between 5 and 7." Pass 1 is still 9. It does not hold. Pass 2 is 7. It holds. None of the 9 were greened.

"The green set surviving the gate and agreement is 60 to 75 per cent the size of a single pass's gated green set." Pass 1 is 80 of 117, 68.4 percent. It holds. Pass 2 is 80 of 84, 95.2 percent. It does not hold. Almost every gated green on the smaller pass was also green on the other pass.

## 9. Does verifying the model's reading meet the promises

On pass 2 the reviewer still reads the source for 14 of 38 clean sentences. With the agreement column that is 17 of 38. On pass 1 it is 9 of 38, plus 16 flags to settle, and only 13 sentences to skip. The split does not take the draft off the desk.

The promises are not met. P1 fails on a conflict that stays green. P3 fails because a demoted confirmation keeps its comment. P4 fails because the gate passes the two-pass disagreement through and adds to it. P2 holds for the flags that remain, and those flags include all 9 wrong flags on pass 1. The gate did not green the 8 real discrepancies. It also did not make the wrong flags go away.

## 10. What this pass could not establish

It simulates one gate on one prompt's stored output, `prompt-final.md`, from one model, `gpt-5.1-2025-11-13`. It does not test the gate on a second prompt or a second model. It does not build the gate into a card. The 8 real discrepancies and the 9 wrong flags are B388's judgements, applied to the gated states. They were not re-read as a new labelling. P5 was not scored.
