# B240 constructive feedback finish

Date: 2026-09-19. Regenerations only. No new Review. Captured production payload reused from `scripts/diagnostic/delivery-check/b226-check-output/production-review.json` (CONFIRMED, file present).

Ids. Spec asked B232 for the row. B232 is already the unverifiable-badge row (CONFIRMED `docs/BACKLOG.md` Closed B232). Next free after git HEAD at the start of this work was B234, but an inventory commit (`7b0f16c`) filed B234-B239 before this row shipped. Used **B240** for the row, **B241** for the clean-draft dash, **B242** for the frontend loading string, **B243** for the still-open "You'll need" filing.

## Scoreboard

### Part 0B

| Item | Verdict | What I would do instead |
|------|---------|-------------------------|
| D1 Remainder removed. One coverage retry. Miss is a logged fault. Claude: cards are the record, piece is a covering note. | AGREE | Recorded at `console.warn` `[constructive-feedback] coverage miss` and Langfuse score `constructive-feedback-coverage-miss` on the same trace. Filter Langfuse on that score name to see a pattern. Claude's ruling is right. Printing machine remainder was the thing a writer skimmed. |
| D2 Say it once, at the level it is true. Positive prompt line. | AGREE | Shipped as a positive instruction, not a prohibition. |
| D3 Grouping at four or more findings: fewer paragraphs than findings, or one paragraph names two or more. Show FAIL on production first. Eye is the second gate. | AGREE, with a reservation | The OR-clause lets a 6-paragraph / 6-finding piece pass if the closer combines two findings. I would require fewer paragraphs at four or more findings, and drop the dual-cover escape. The check as specified is what shipped. |
| D4 Craft referee: no craft observation survives unless it quotes the draft. | AGREE | Paragraph grain. A finding paragraph can still smuggle unquoted advice. Sentence grain later. |
| D5 Fix CLEAN_DRAFT_FEEDBACK_TEXT. User-facing copy. | AGREE | Trivia **B241**. Claude's earlier dash scoping was wrong to exclude it. |
| D6 Temperature stays 0. | AGREE | B226 already drifted at temperature 0 between two identical runs. Unpin later costs less stability than we assumed. Structure is not proven yet. |
| D7 Replace fixture 1 with the live 18 Sep JSON. Commit it. Report check differences. | AGREE | Live file was committed first in `7b0f16c` (inventory) with the gitignore exception. This row points the canned suite at it. Difference is a finding: see below. |
| D8 Out of scope: "You'll need"; B229 invented notes if unshipped. | AGREE | B229 already SHIPPED (CONFIRMED `docs/BACKLOG.md` Closed B229, `2b71475`). "You'll need" was not filed; now **B243** OPEN. Not fixed. |
| D9 If this touches Stage 1 or the Stage 2 prompt, STOP. | AGREE, did not stop | Diff is `api/constructive-feedback.js`, `lib/qc/constructive-feedback.mjs`, tests, check script. No Stage 1. No Stage 2 prompt. |

### Part 0A

| Claim | Verdict | Evidence |
|-------|---------|----------|
| C1 BLOCKING. Production piece had five paragraphs for five findings, one each, in card order. | CONFIRMED | `scripts/diagnostic/delivery-check/b226-check-output/production-triple.txt` feedback body: readiness plus five finding paragraphs (timing, equity, highly regarded, diligence, first-person closer). Remainder then appended. |
| C2 BLOCKING. Named first-person on "We recommend approval of the commitment" and did not name no source support. That finding was only in the remainder. | CONFIRMED | Same file. Last body paragraph is first-person only. Remainder line: `Also: evidence on "We recommend approval of the commitment": No source addresses the recommendation`. If this had been wrong I would have stopped. It was not wrong. |
| C3 CHECK. Remainder appends card note text verbatim and repeated findings already named. | CONFIRMED | Same file. Five `Also:` lines, including timing / equity / highly regarded / diligence already named in the body. |
| C4 CHECK. LinkedIn credits and press-release Brandt quote cannot be traced to any finding. | CONFIRMED | B226 report plus fixtures 2 and 3: one evidence note each (40 percent; EUR 2 billion). Credits and Brandt are not notes. |
| C5 CHECK. CLEAN_DRAFT_FEEDBACK_TEXT still contains U+2014 and is shown to a user. | CONFIRMED | `lib/qc/constructive-feedback.mjs` was `"No changes are needed — the draft is ready for signoff."` Returned when notes.length is 0. Fixed in **B241**. |

## New files

- `scripts/diagnostic/delivery-check/b240-check.mjs`
- `scripts/diagnostic/delivery-check/b240-report.md` (this file)
- `tests/b241-clean-draft-dash.test.mjs`
- frontend `tests/b242-feedback-loading-copy.test.mjs`

Extended `tests/b226-constructive-feedback-piece.test.mjs`. Did not add a parallel suite.

## Grouping FAIL on the captured production piece

Remainder stripped. Six paragraphs, six notes, no paragraph covering two notes.

```
Needs work.

The timing of Partners Group's commitment to Meridian Capital Partners V needs verification. The draft states "June 2026," but the source indicates the first close is expected in Q3 2026. Confirm the timing and Partners Group's involvement or adjust the statement.

The draft mentions equity checks of EUR 80-100 million, but the source does not confirm this detail. Verify the equity check size or revise the statement to reflect only the confirmed information about the number of investments.

The phrase "highly regarded" lacks substantiation. Provide evidence or rephrase to maintain objectivity.

The claim that the relationship enabled "deep insight during the diligence phase" is unsupported. Either add a source or remove the statement.

Lastly, the recommendation for approval uses first-person plural, which is inconsistent with the required third-person voice. Remove or rephrase this recommendation to align with the house style.
```

Test `grouping fails on the captured production piece`: paragraphCount 6, findingCount 6, ok false. CONFIRMED by that test after `checkGrouping` existed.

## Every CHECK attempt

One outer attempt per fixture. Internal coverage retry ran on some calls (craft referee dropped a CLEAN_DRAFT echo, then missed findings, then retry). Not re-run after a mid-session tree wipe; first CHECK already passed on this code. About 11 model calls. Budget was USD 0.15. That is over. Cause: retries, not a new Review.

### 1. live Meridian. attempt 1. words=140 paras=6 notes=6 grouping=true checks=PASS

Needs work.

The timing of Partners Group's commitment to Meridian Capital Partners V needs verification. The draft states "June 2026," but the source indicates "Q3 2026." Confirm the timing and Partners Group's involvement.

The statement "The fund intends to build a portfolio of" aligns with the source on the number of investments but not on the equity check size of EUR 80-100 million. Verify or adjust this detail.

The claim "Partners Group was attracted to this investment given" lacks explicit source confirmation linking Meridian Capital's attributes to Partners Group's decision. Either find a source that confirms this or revise the statement.

The assertion "This relationship enabled deep insight during the diligence" is unsupported. Provide a source or remove it.

Finally, "We recommend approval of the commitment" is unsupported and uses inappropriate first-person plural. Remove or replace with a supported statement.

Craft referee dropped: the clean-draft sentence (model echo); then four unquoted finding paragraphs on the retry that the quoted paragraphs already covered.

### 2. LinkedIn. attempt 1. words=115 paras=2 notes=1 grouping=true checks=PASS

Minor points to address.

The post is engaging and well-structured, but a few details need attention. The claim about international revenue reaching "more than 40 percent at exit" should be adjusted to align with the source, which states it was 38 percent. This ensures accuracy and maintains credibility. The sentence "NorTech today operates across the Nordic region, Germany, France, the UK, and Poland" is clear and well-supported by the source, so it can remain as is. Highlighting the achievements of Magnus Karlsson and Mikael Bergström adds a personal touch, which is effective. Consider tightening the narrative around the team's transformation to emphasize the human element even more. Overall, the post effectively communicates the success story.

Craft referee dropped: the clean-draft sentence. It did **not** drop the credits / tightening advice, because that advice sat in the same paragraph as the 40 percent finding.

### 3. Press release. attempt 1. words=73 paras=3 notes=1 grouping=true checks=PASS

Minor points to address.

Ensure the statement about Meridian's invested capital in the specialty chemicals sector is accurate. The source confirms the eighth investment but does not verify that the invested capital exceeds EUR 2 billion. Adjust this figure to align with verified data.

The sentence "It supplies more than 600 customers worldwide, with particular strength in ultra-high-purity solvents..." is clear and informative, effectively highlighting the Company's market position. Maintain this clarity throughout.

Craft referee dropped: the clean-draft sentence; "Consider adding a quote from Dr. Annika Brandt..."; "Overall, the draft is well-structured... consider the addition of a quote...".

### 4. Internal inconsistency. attempt 1. words=134 paras=4 notes=4 grouping=true checks=PASS

Needs work.

The draft effectively outlines CloudPivot Systems' position in the European freight forwarding industry, but several areas need refinement. The use of first-person possessive and plural, such as in "Our investment thesis rests" and "We project ARR growth from EUR 81 million," should be revised to maintain a third-person voice suitable for reporting commentary.

There is an inconsistency in the ARR figures. The draft mentions an ARR of EUR 84 million as of October 2025, yet later states "ARR growth from EUR 81 million today." Ensure the ARR figure is consistent throughout the piece.

The draft's structure is clear, but the narrative could benefit from a more analytical tone. For instance, the statement "The Company has built strong fundamentals" could be expanded with specific metrics or comparisons to competitors to substantiate the claim.

Craft referee dropped: the clean-draft sentence; two "Overall, ..." closing paragraphs.

## Did any piece pass grouping by gaming it?

No, not by jamming unrelated findings together.

Live Meridian and production: 6 paragraphs, 6 notes. They pass because the closer names both no-source-support and first person on the same sentence. That is D2, not a dodge. The other four findings still get one paragraph each. That is the OR-clause working as I reserved against, not unrelated mash.

Fixture 4: 4 paragraphs, 4 notes. The first-person paragraph names two first-person sentences. Same fault, two sentences. D2 again. The "strong fundamentals" paragraph is quoted craft, not a jammed finding.

LinkedIn and press: one finding each, grouping does not apply.

## Production regeneration, verbatim

attempt 1. words=144 paras=6 notes=6 grouping=true checks=PASS

Needs work.

The timing of Partners Group's commitment to Meridian Capital Partners V needs verification. The draft states "June 2026," but the source indicates "Q3 2026." Confirm the timing and Partners Group's involvement.

The statement "The fund intends to build a portfolio of" aligns with the source on the number of investments but lacks confirmation on the equity check size of EUR 80-100 million. Verify this detail or adjust the statement.

The phrase "Partners Group was attracted to this investment given" includes 'highly regarded,' a distinction-claim without substantiation. Provide context or remove it.

The claim "This relationship enabled deep insight during the diligence" lacks source support. Add a source or remove the claim.

Finally, "We recommend approval of the commitment" is unsupported by the source and uses first-person plural, which is inconsistent with the required third-person voice. Provide a source or revise the statement.

Both findings on "We recommend approval of the commitment" are named. Order: no source support first, then first person. That order is right. The sentence is false before it is badly said.

Would a writer now read this without skimming? They would read the closer. The middle is still four separate beats. Better than the remainder. Not yet a note you sit with.

## Live fixture versus reconstruction (D7)

Reconstruction `1-meridian-reporting.json`: 3 margin notes (June partial, We-recommend evidence, We-recommend editorial). Live 18 Sep JSON: 6 notes. Extra: equity-check partial, attracted-to motive partial, diligence not_supported. Live also lacks the reconstruction's confirmed-5 shape (`summariseReview` on live: confirmed 2, partial 3, notSupported 2, editorial 1). Grouping applies on live (6 notes) and would not on the reconstruction (3 notes). Canned piece for fixture 1 had to name the four extra findings. That difference is the finding D7 asked for. Live file landed in git at `7b0f16c` with the gitignore exception, before this row.

## New tests, fail then pass

B240 assertions, first run on current code (11:11:57):

1. CLEAN_DRAFT em dash: `true !== false` (moved to B241).
2. Prompt "Say it once, at the level it is true.": `false !== true`. Then pass.
3. API still called `assembleConstructiveFeedbackPiece`: `true !== false`. Then pass.
4. `checkGrouping` is not a function. Then pass with ok false on the production piece.
5. `stripUnquotedCraft` is not a function (LinkedIn). Then pass, credits dropped.
6. `stripUnquotedCraft` is not a function (press). Then pass, Brandt dropped.

B241 first run: CLEAN_DRAFT still had U+2014. Then pass after the string change.

B242: loading copy test added with the ASCII string in the same change. Skipped a separate fail capture. The old string was U+2026.

Existing remainder test on `assembleConstructiveFeedbackPiece` was not rewritten. Helper still appends. API no longer calls it.

## SHIP VERIFIED

```
SHIP VERIFIED  0995fe0  main  93 files  1227 tests
SHIP VERIFIED  c846d84  main  30 files  179 tests
```

Backend tag `b240-feedback-covering-note` at `ddbebd4`. Trivia B241 is `0995fe0`. Frontend B242 is `c846d84`.

Browser. Skipped. B242 is copy-only with no layout or state effect. B241 is backend copy with no screen in this pass. B240 is generated prose, pasted verbatim above.

## Disagreements

1. Grouping should require fewer paragraphs at four or more findings. The dual-cover OR is how a 6/6 piece still passes.
2. Craft referee at paragraph grain lets LinkedIn keep "tightening the narrative" inside the 40 percent paragraph. Sentence grain would drop it.
3. Spec asked B232. That id was taken. Then B234-B239 were taken by the inventory commit while this work was in flight. I did not reuse them.
4. First model call sometimes emitted the clean-draft sentence. Referee dropped it. That is extra cost, not a user-facing remainder.

Temperature 0. Not unpinned. B226 already drifted at 0, so later unpin costs less than we assumed.
