# B225 / B226 report

IDs used: **B225** (Row 1, assessment finding text, frontend), **B226** (Row 2, constructive-feedback rebuild, backend). Next free after this ship, ignoring the census rows B227-B231 already filed, is **B232**.

SHIP VERIFIED  f0bc71f  main  27 files  173 tests
SHIP VERIFIED  d41f3ea  main  87 files  1212 tests

B226 follow-ups after CHECK: `5eba0bf`, `e2b28b3`. Tag `b226-constructive-feedback` points at `d41f3ea`. Frontend Row 2 had no code change.

---

## Scoreboard

| Item | Verdict |
| --- | --- |
| A1 | AGREE. Both rows in this spec, assessment first. |
| A2 | AGREE. Finding text only. Readiness and counts byte-identical on Meridian. |
| A3 | AGREE. One payload item per concern. |
| A4 | AGREE. Bound held by leaving the 100-200 prompt. Filled payload 136-142 words. Nothing of the findings was dropped. |
| A5 | AGREE. Dashes fixed only in the listed user-facing prose prompts. Stage 2 / Stage 1 / load-bearing forbid-the-character rules left. |
| A6 | AGREE. Four fixtures are the regression set. 18 Sep Meridian snapshotted, not re-run, for that set. |
| A7 | AGREE. Nothing here touches Stage 1 splitting or the Stage 2 evidence prompt. Did not stop. |
| C1 | CONFIRMED. Dead fields. Empty finding text. |
| C2 | CONFIRMED. Buckets, counts, readiness come from the backend review summary. Not C1. |
| C3 | CONFIRMED. `stage2_v4.md` is hash pinned. |

---

## Part 0B A1 to A7

**A1 AGREE.** Both rows shipped in this spec, assessment first. B225 frontend `f0bc71f` before B226 backend `d41f3ea`. No alternative.

**A2 AGREE.** Assessment fix changes only finding text. Readiness, counts, bucket membership, and the synthesize-review prompt (aside from A5 dash) are unchanged. Asserted byte-identical `qcSummary` on the Meridian fixture in `tests/b225-assessment-finding-text.test.mjs` L47-60. CONFIRMED.

**A3 AGREE.** `concernItemsFromRow` in `src/utils/reviewerSynthesisPayload.js` L36-48 emits one item per `editorialConcerns[]` / `complianceConcerns[]` note. A sentence with evidence and editorial arrives as two descriptions. Test L80-103 and L105-138. CONFIRMED.

**A4 AGREE.** Held the 100-200 bound by not changing the length instruction in `api/synthesize-review.js` L7 (`100-200 words`). A2 forbids changing the prompt. Filled-payload regenerations: 139 then 136 words. Production assessment: 142 words. Before (empty findings): 126 then 112 words. All inside the bound. What was lost: nothing of the card notes. The model still summarises; it does not paste every card sentence. CONFIRMED by the word counts below.

**A5 AGREE.** Changed dashes only in prompts whose output is prose a user reads:

Changed:
- `lib/qc/constructive-feedback.mjs`: `CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER`, `CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT`, craft register, craft system/user strings, leftover B26 user-payload dashes.
- `api/synthesize-review.js` L8 (`'low concern'. Write`).
- `api/rewrite.js` L815 (`1 to 2 sentences`) and L789 (`20-25%`).
- `api/generate.js` L742 (`20-25%`).
- `lib/prompt-library/outputTypeGuidance.js` L35, L49 (`2 to 3 sentences`), L64 (`1 to 3 short paragraphs`).

Deliberately left:
- `lib/qc/pipeline-v4/prompts/stage2_v4.md` and its multipassage / shadow copies. Hash pin. A7.
- Any Stage 1 prompt.
- `api/generate.js` L338-339 and `api/rewrite.js` L368-369: regex matching dashes in user/source text, not instruction prose.
- Style-guide / rulebook lines that quote the dash as the character to forbid.
- `CLEAN_DRAFT_FEEDBACK_TEXT` (the ready-draft sentence still uses U+2014). Product copy, not a prompt. Left as in the proposal.
- `CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS` internal dashes. Not sent after B226.
- Comments.
- `api/rewrite.js` L916 empty-instruction placeholder (U+2014).

**A6 AGREE.** Permanent regression set:

1. `tests/fixtures/b226/1-meridian-reporting.json` (copied from `tests/fixtures/b225-meridian-review.json`). Snapshotted, not a live re-run. HYPOTHESIS as a replica of the 18 Sep live JSON (that JSON was not in the repo). CONFIRMED facts used: June vs Q3, Needs work, first-person on We recommend.
2. `tests/fixtures/b226/2-linkedin-post.json` from `scripts/diagnostic/fixtures/12_synth_linkedin_post.json`. Cards frozen for B226, not a live Review.
3. `tests/fixtures/b226/3-press-release.json` from `scripts/diagnostic/fixtures/10_synth_public_press_release.json`. Same.
4. `tests/fixtures/b226/4-internal-inconsistency.json` from `scripts/diagnostic/fixtures/13_synth_internal_inconsistency_memo.json`. Same.

**A7 AGREE.** Nothing here touches Stage 1 splitting or the Stage 2 evidence prompt. Files changed: assessment payload (frontend), constructive-feedback lib/API, listed prose prompts. Did not stop.

---

## C1 to C3

**C1 BLOCKING. CONFIRMED.** Before B225, `reviewerSynthesisPayload.js` read `editorialCommentary`, `assessmentExplanation`, and `row.assessment`. None exist on a v4 card. P6 cited the old L25-29. Current code reads `evidenceSummary` / `reasoningParagraph` (`src/utils/reviewerSynthesisPayload.js` L7-18) and `editorialConcerns[].note` (`L36-48`). Empty-payload regen below reproduces the wrong reason: editorial described as lack of justification. Filled payload names first-person voice.

**C2 CHECK. CONFIRMED.** Bucket membership, counts, and readiness are NOT affected by C1. They come from `readReviewSummary` (`src/modules/drafting/reviewSummaryDisplay.js` L9-12), which reads `result.meta.reviewSummary`. That object is computed by `summariseReview` (`lib/qc/review-summary.mjs` L108-187) from `summaryClass` / verdicts, not from the dead fields. `qcSummary` in the payload is copied from that summary (`reviewerSynthesisPayload.js` L85-95). Frontend test L30-61: readiness Needs work, statements 7, confirmed 5, partial 1, conflicting 0, notSupported 1, editorialFlagCount 1, complianceFlagCount 0, notChecked 0, byte-identical JSON. If any of those had come from a dead field, this would have been a bigger row. They did not. Did not stop.

**C3 CHECK. CONFIRMED.** `tests/stage2-b48-calibration.test.mjs` L633-642 pins `stage2_v4.md` to hash `44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1`. Editing it re-baselines both accuracy corpora. This spec did not edit it.

---

## New files

Row 1 (frontend):
- `tests/b225-assessment-finding-text.test.mjs`
- `tests/fixtures/b225-meridian-review.json`
- `src/utils/reviewerSynthesisPayload.js` (rewritten reads)

Row 2 (backend):
- `tests/b226-constructive-feedback-piece.test.mjs`
- `tests/fixtures/b226/1-meridian-reporting.json`
- `tests/fixtures/b226/2-linkedin-post.json`
- `tests/fixtures/b226/3-press-release.json`
- `tests/fixtures/b226/4-internal-inconsistency.json`
- `lib/qc/constructive-feedback.mjs` (piece builders; old bundle builders kept so existing tests still pass)
- `api/constructive-feedback.js` (one call)
- `scripts/diagnostic/delivery-check/b226-check.mjs`
- `scripts/diagnostic/delivery-check/b226-production-review.mjs`
- `scripts/diagnostic/delivery-check/b226-check-output/`

Existing tests were not rewritten.

---

## Assessment before and after

The 18 Sep live paragraph is not in the repo. Before is reconstructed by sending the saved Meridian payload with empty finding text (C1). After is the same payload with card notes. Both temp 0, `gpt-4o-2024-08-06`. Two regenerations because the check script ran twice. Temp 0 still drifted.

### Before (empty findings), attempt 1, 126 words

Needs work. The draft has a few issues that need addressing before it's ready for signoff. The statement recommending approval of the commitment is unsupported, lacking any evidence to back this recommendation. This is a critical point that needs substantiation or should be rephrased to reflect the available evidence. Additionally, the claim about Partners Group's commitment to Meridian Capital Partners V is only partially confirmed. Ensure that all details about the fund's size, focus, and Partners Group's involvement are fully backed by reliable sources. On the editorial side, the recommendation statement also raises a flag, likely due to its lack of support. Otherwise, compliance is clean, and no other editorial issues were flagged. Let's tighten up these areas to ensure the draft is robust and defensible.

### After (filled findings), attempt 1, 139 words

Needs work. The draft has a few issues that need addressing before it's ready for signoff. The recommendation to approve the commitment lacks source support, as no evidence backs this statement. You'll need to either provide a source or remove the recommendation. Additionally, the statement about Partners Group's commitment to Meridian Capital Partners V is only partially confirmed. While the fund's target size and strategy are verified, the specific commitment by Partners Group and the June 2026 date aren't supported by the sources. There's also a discrepancy with the expected first close in Q3 2026, which conflicts with the June date. Please verify these details or adjust the statement. On the editorial side, the use of "We recommend" should be revised to maintain a third-person perspective, naming Partners Group as the subject. Compliance is clean, so no issues there.

### Before (empty findings), attempt 2, 112 words

Needs work. The draft has a few issues that need addressing before it's ready for signoff. The recommendation for approval lacks any supporting evidence, which is a significant gap. We can't endorse a commitment without clear justification or evidence backing that recommendation. Additionally, the statement about Partners Group's commitment to Meridian Capital Partners V is only partially confirmed. We need more robust evidence to fully substantiate this claim. On the editorial side, the recommendation statement also raises a flag. It's crucial to ensure that any recommendations are clearly justified within the text. Compliance is clean, so no issues there. Let's tighten up these areas to ensure the draft is solid and defensible.

### After (filled findings), attempt 2, 136 words

Needs work. The draft has a few issues that need addressing before it's ready for signoff. The recommendation to approve the commitment lacks source support, as no evidence backs this statement. You'll need to either provide a source or remove the recommendation. Additionally, the statement about Partners Group's commitment to Meridian Capital Partners V is only partially confirmed. While the fund's target size and strategy are verified, the specific commitment by Partners Group and the June 2026 date aren't supported by the sources. The source suggests a first close in Q3 2026, which conflicts with the June date. Please verify these details or adjust the statement. On the editorial side, the use of "We recommend" should be revised to maintain a third-person perspective, naming Partners Group as the subject. Compliance is clean, so no issues there.

CHECK: the editorial concern on "We recommend approval of the commitment" is described as first-person voice after, not as a lack of justification. Before, both attempts call the editorial flag a lack of support / justification. CONFIRMED.

---

## Every feedback attempt, with word counts

Temperature 0. Model `gpt-4o-2024-08-06`. Seven mechanical checks passed on every attempt below. Attempt 1 ran before the coverage-remainder fix. Attempt 2 ran after `5eba0bf`.

### Fixture 1 Meridian. Attempt 1. 186 words. checks PASS (remainder appended)

Needs work.

The draft requires several adjustments for accuracy and consistency. The date of Partners Group's commitment to Meridian Capital Partners V is stated as "June 2026," but the source indicates a first close expected in "Q3 2026." Verify the timing and adjust the statement to align with the source. Additionally, the draft mentions a recommendation to approve the commitment, but no source supports this recommendation. Remove or substantiate this claim.

The use of "We recommend" should be replaced with a third-person construction, such as "Partners Group is recommended to approve the commitment," to maintain the appropriate voice for a reporting commentary.

The draft effectively outlines the fund's strategy and Partners Group's rationale for investment, but ensure all claims are supported by the source material. Address these points to enhance the draft's accuracy and adherence to reporting norms.

Also: evidence on "We recommend approval of the commitment": No source addresses a recommendation to approve the commitment.
Also: editorial on "We recommend approval of the commitment": The statement uses first-person plural 'We' in a reporting commentary that requires third-person voice. Name Partners Group as the grammatical subject.

### Fixture 1 Meridian. Attempt 2. 127 words. checks PASS

Needs work.

The draft requires several adjustments for accuracy and consistency. First, the timing of Partners Group's commitment to Meridian Capital Partners V needs verification. The draft states "June 2026," but the source indicates a first close expected in Q3 2026. Align these details with the source or clarify the discrepancy.

The recommendation to approve the commitment should be rephrased to maintain an objective tone. Replace "We recommend approval of the commitment" with a third-person construction, such as "Approval of the commitment is recommended."

Additionally, ensure that the draft consistently uses third-person voice throughout, particularly in sections where first-person plural is currently used. For example, instead of "We recommend," use "Partners Group recommends."

These changes will enhance the draft's clarity and adherence to standard reporting commentary norms.

### Fixture 2 LinkedIn. Attempt 1. 143 words. checks PASS (remainder appended)

Minor points to address.

The draft captures the essence of NorTech's transformation well, but a few details need refining. The statement about international revenue should align with the source, which notes it reached 38 percent, not "more than 40 percent." Adjust this for accuracy. The narrative around the team's contributions is compelling; however, consider tightening the section on individual credits to maintain focus and flow. Highlighting Magnus Karlsson and Mikael Bergström's roles is effective, but ensure it doesn't overshadow the broader team effort. The closing sentiment is strong, leaving readers with anticipation for NorTech's future. Once these tweaks are made, the post will be ready to engage your LinkedIn audience.

Also: evidence on "NorTech today operates across the Nordic region, Germany,": The source confirms the geographic expansion. It does not give a figure of more than 40 percent for international revenue at exit.

### Fixture 2 LinkedIn. Attempt 2. 113 words. checks PASS

Minor points to address.

The draft captures the essence of NorTech's transformation well, but a few details need refining. The statement about international revenue should align with the source, which states it was 38 percent at exit, not "more than 40 percent." Adjust this for accuracy. The narrative around the team's contributions is compelling, but consider tightening the section on individual credits to maintain focus and flow. Highlighting the broader team effort is effective, so ensure it complements the individual achievements without overshadowing them. Overall, the post is engaging and informative. Once these minor adjustments are made, it will effectively showcase the success of the NorTech investment. Looking forward to the final version.

### Fixture 3 press release. Attempt 1. 141 words. checks PASS (remainder appended)

Minor points to address.

Ensure the statement about the invested capital is accurate. The draft claims, "Total invested capital from the Meridian platform in the specialty chemicals sector now exceeds EUR 2 billion," but the source only confirms the eighth investment, not the capital amount. Verify and adjust this figure to align with the source.

The draft effectively highlights the strategic focus on the Asian electronics market and potential acquisitions. Maintain this emphasis, as it clearly outlines Meridian's future direction.

Consider adding a quote from Dr. Annika Brandt to personalize the announcement and provide insight into the leadership's vision post-acquisition. This would enhance the release's engagement and depth.

Also: evidence on "The transaction represents the eighth investment from Meridian's": The source confirms this is the eighth European Industrials investment. It does not confirm that specialty-chemicals invested capital exceeds EUR 2 billion.

### Fixture 3 press release. Attempt 2. 117 words. checks PASS

Minor points to address.

Ensure the statement about the total invested capital in the specialty chemicals sector is accurate. The source confirms the eighth investment but does not verify that the invested capital exceeds EUR 2 billion. Clarify this figure or adjust it to align with verified data.

The draft effectively highlights the strategic focus on the Asian electronics market and potential acquisitions. Maintain this emphasis, as it clearly outlines Meridian's future direction.

Consider adding a quote from Dr. Annika Brandt or a Meridian executive to provide a personal touch and reinforce the strategic vision. This will enhance the release's engagement and credibility. Keep the formal tone consistent throughout, as it suits the press release format well.

### Fixture 4 internal inconsistency. Attempt 1. 245 words. checks PASS (remainder appended)

Needs work.

The draft provides a comprehensive overview of CloudPivot Systems, but several areas need refinement. The use of first-person possessive and plural pronouns, such as "Our" and "We," should be replaced with third-person voice to align with standard reporting commentary norms.

The ARR figures are inconsistent; the draft mentions EUR 84 million and EUR 81 million in different sections. Ensure the ARR figure is accurate and consistent throughout the piece.

The statement "The Company has built strong fundamentals" is vague. Specify which fundamentals are strong, such as revenue growth or customer retention, to provide clarity and depth.

The investment thesis is well-structured, but the transition from market analysis to financial projections could be smoother. Consider integrating the market opportunity with the financial outlook more cohesively.

Finally, the summary should focus on the company's strategic advantages and potential risks, rather than fitting the investment into a broader portfolio strategy. This will provide a more balanced view of the investment opportunity.

Also: editorial on "Our investment thesis rests on three pillars": The statement uses first-person possessive 'Our' in a reporting commentary that requires third-person voice.
Also: evidence on "We project ARR growth from EUR 81 million": The draft's own earlier sentence states ARR of EUR 84 million as of October 2025. No source supports a current ARR of EUR 81 million.
Also: editorial on "We project ARR growth from EUR 81 million": The statement uses first-person plural 'We' in a reporting commentary that requires third-person voice.

### Fixture 4 internal inconsistency. Attempt 2. 206 words. checks PASS (remainder still on editorial)

Needs work.

The draft provides a comprehensive overview of CloudPivot Systems, but several areas need refinement. The use of first-person possessive and plural pronouns, such as "Our" and "We," should be replaced with third-person voice to align with standard reporting commentary norms.

The ARR figures are inconsistent; the draft mentions EUR 84 million and EUR 81 million in different sections. Ensure the ARR figure is accurate and consistent throughout the piece.

The statement "The Company has built strong fundamentals" is vague. Specify which fundamentals are strong, such as revenue growth or customer retention, to provide clarity and depth.

The investment thesis is well-structured, but the transition from market analysis to financial projections could be smoother. Consider integrating the market opportunity with the financial outlook to create a cohesive narrative.

Finally, the summary should focus on the investment's strategic fit and potential returns without reiterating earlier points. This will provide a concise conclusion that reinforces the investment's appeal.

Also: editorial on "Our investment thesis rests on three pillars": The statement uses first-person possessive 'Our' in a reporting commentary that requires third-person voice.
Also: editorial on "We project ARR growth from EUR 81 million": The statement uses first-person plural 'We' in a reporting commentary that requires third-person voice.

LinkedIn attempt 2 and press attempt 2 read as the same piece with different nouns: one sourced-figure correction, then unsolicited craft (tighten credits / add a quote). Temp 0, so further attempts would not diverge. The seven checks still passed because invented-craft is scoped to the 18 Sep hook complaint and the "no internal contradictions" paragraph, not to every extra observation. I would tighten craft permission with a post-filter, not by raising temperature.

---

## The four fixtures' pieces in full

The attempt-2 pieces above are the post-fix set. Fixture 1 127 words. Fixture 2 113 words. Fixture 3 117 words. Fixture 4 206 words. They are not the same skeleton once quotes and figures are stripped: Meridian is dates plus first-person closer; LinkedIn is exit mix plus hook-is-fine-implied; press is EUR 2 billion plus lede-is-fine; internal is ARR clash plus first-person thesis. CONFIRMED by `skeletonsCollide` on the canned set; live LinkedIn/press share more craft filler than I wanted.

---

## Production badge, assessment, and feedback

Production `POST /api/analyse-statements` on the Meridian fixture draft (with closer) plus `meridian_production_source.txt`. All three review types on. Authoring organisation Partners Group.

http=200 ms=20133 statements=7 readiness=Needs work
pipeline=v4 trace=e4eaefc7-2f53-45eb-9548-af8290cbb5d2

The live cards found more than the frozen snapshot: equity-check size not confirmed, `highly regarded` editorial, diligence-insight not supported, plus June/Q3 and the We-recommend pair. That is a real Review, not the reconstructed fixture.

### Badge

v4  Needs work

### Assessment (142 words)

Needs work. The draft has several unsupported claims and editorial issues that need addressing. The statement about the relationship enabling deep insight during the diligence phase lacks any source support, so either find a source or remove it. Similarly, the recommendation for approval isn't backed by any evidence; it should be substantiated or omitted. The timing of Partners Group's commitment to Meridian Capital Partners V is partially confirmed, but the June 2026 date doesn't align with the source's Q3 2026 first close expectation. Verify the timing and Partners Group's involvement. The equity check size also lacks confirmation; ensure this detail is accurate or adjust the statement. Editorially, the phrase 'highly regarded' needs substantiation, and the use of 'We recommend' should be revised to maintain a consistent third-person narrative. Compliance is clean, but these editorial and evidence issues must be resolved before signoff.

### Constructive feedback

Needs work.

The timing of Partners Group's commitment to Meridian Capital Partners V needs verification. The draft states "June 2026," but the source indicates the first close is expected in Q3 2026. Confirm the timing and Partners Group's involvement or adjust the statement.

The draft mentions equity checks of EUR 80-100 million, but the source does not confirm this detail. Verify the equity check size or revise the statement to reflect only the confirmed information about the number of investments.

The phrase "highly regarded" lacks substantiation. Provide evidence or rephrase to maintain objectivity.

The claim that the relationship enabled "deep insight during the diligence phase" is unsupported. Either add a source or remove the statement.

Lastly, the recommendation for approval uses first-person plural, which is inconsistent with the required third-person voice. Remove or rephrase this recommendation to align with the house style.

Also: evidence on "The fund intends to build a portfolio of": The source confirms that the fund plans to make 10-14 platform investments, which aligns with the statement's claim about the number of control-oriented investments. However, the source does not mention the equity check size of EUR 80-100 million each. The reviewer should verify the equity check size or adjust the statement to reflect only the confirmed information.
Also: editorial on "Partners Group was attracted to this investment given": 'highly regarded' is a distinction-claim without substantiation in the immediate context.
Also: evidence on "This relationship enabled deep insight during the diligence": No source addresses the claim that the relationship enabled deep insight during the diligence phase. The reviewer should add a source that supports this claim or remove it.
Also: evidence on "We recommend approval of the commitment": No source addresses the recommendation for approval of the commitment. The source provides details about the fund's strategy, terms, track record, and risks, but does not include any recommendation. Please add a supporting source or remove the claim.
Also: editorial on "We recommend approval of the commitment": The statement uses first-person plural 'We recommend', which is inconsistent with the third-person voice required for reporting commentary.

All three agree on readiness: Needs work. CONFIRMED.

None of them describes a finding the cards do not contain. The assessment and the piece name June/Q3, equity checks, highly regarded, diligence insight, unsupported recommendation, and first-person We. Those are on the production cards. The remainder repeats card notes the piece had already named, because coverage still wants a statement fragment. That is referee noise, not an invented finding.

---

## Every new test failing then passing

### B225 (prior session, current code already green)

On the old payload the new assertions failed: empty `evidenceFinding` on June/Q3; empty evidence on We recommend; `editorialConcerns.length` 1 not 2 when two notes sit on one sentence. The readiness/counts test passed on that same run, which is C2. After the payload rewrite, `tests/b225-assessment-finding-text.test.mjs` passed. Existing tests were not rewritten.

### B226 on current form-based code, before the rebuild

```
 ❯ tests/b226-constructive-feedback-piece.test.mjs (6 tests | 5 failed) 5ms
   x system prompt does not require one numbered point per bundle
     true !== false
   x register does not tell the model to say a weak draft needs real work
     true !== false
   ✓ craft dimensions are not listed as a numbered checklist in the system prompt
   x piece prompts contain no en-dash or em-dash
     true !== false
   x card payload is not an ordered feedbackBundles array
     buildConstructiveFeedbackPieceUserPayload is not a function
   x constructive-feedback route no longer runs a separate craft pass
     true !== false
```

After the rebuild, and after adding the seven-check suite:

```
 ✓ tests/b226-constructive-feedback-piece.test.mjs (11 tests)
 ✓ tests/constructive-feedback.test.mjs (12 tests)
 Test Files  87 passed (87)
      Tests  1212 passed (1212)
```

Existing `tests/constructive-feedback.test.mjs` still passes. Old bundle builders remain. They are unused by the API.

---

## SHIP VERIFIED lines

SHIP VERIFIED  f0bc71f  main  27 files  173 tests
SHIP VERIFIED  d41f3ea  main  87 files  1212 tests

Frontend Row 1 commit: `fix(assessment): the reviewer paragraph is given the card notes (B225)`
Backend Row 2 commit: `fix(feedback): constructive feedback is a piece, not a form (B226)`
Backend tag: `b226-constructive-feedback`

---

## Anything else I disagree with

1. Craft as a permission, without a post-filter, still invents advice (LinkedIn individual credits, press-release quote). The seven checks as written do not catch that. I would add a "no note, no observation" referee for craft sentences that cannot quote the draft.
2. The coverage remainder is still too loud on a production card set. The piece named the findings; the referee appended them again because it wants statement fragments. Follow-ups `5eba0bf` and `e2b28b3` reduced it on the frozen fixtures. Production still dumped five Also-lines.
3. `CLEAN_DRAFT_FEEDBACK_TEXT` still contains an em-dash. A5 scoped dashes to prompts. I left it. I would still change it: users read it.
4. The 18 Sep Meridian review JSON was not in the repo. Fixture 1 is reconstructed. HYPOTHESIS as a snapshot of that live run.
5. Row 2 had no frontend code. Modal subtitle left (P7). I did not invent a frontend commit so there would be a tag.
6. Assessment still says "You'll need" in assess context. Pre-existing role mix. Out of scope.

---

## Technical summary

Row 1: frontend payload now reads v4 card fields and emits one item per concern. Row 2: constructive feedback is one temp-0 call on an annotated draft. Code writes `{readiness}.` Craft dimensions are not sent. A figure-clash scan can add a coherence margin note. Seven mechanical checks live in `tests/b226-constructive-feedback-piece.test.mjs` over four fixtures. Dashes stripped from listed user-facing prose prompts only. Stage 1 and Stage 2 untouched.

## Plain-language summary

The reviewer paragraph now names the actual card notes, so a first-person "We recommend" is described as voice, not as a missing justification. Constructive feedback is a short editor's note that opens on the readiness label, instead of a numbered form of six craft dimensions plus one point per card.
