# B220 bundle report

Ids: B220, B214, B221, B222. New filings: **B223** (widen `first_person_plural` to press release), **B224** (press-release quote detector). Next free: **B225**.

No Review. No model calls.

```
SHIP VERIFIED  04c145f  main  86 files  1201 tests
SHIP VERIFIED  560b082  main  26 files  169 tests
```

Docs commit SHA is recorded after this file is committed. B221 live check: this docs push. Result is printed in chat after `git push`.

---

## Scoreboard

| Item | Result |
| --- | --- |
| Part 0 blocking | None FALSE. Built. |
| New ids | **B223**, **B224**. Next free **B225**. |
| B220 | SHIPPED backend `04c145f` tag `b220-house-voice`. Frontend `560b082`. |
| B214 | Closed with tests. Backend already had `tests/revise-actions-license.test.mjs`. Frontend `tests/b214-no-proposal-card-copy.test.mjs`. |
| B221 | `vercel.json` ignoreCommand on both repos. Frontend vercel.json landed in the frontend commit. |
| B222 | `.cursorrules` on both repos. Standing-rules row in BACKLOG. |
| Stage 1 / Stage 2 evidence prompt | Untouched. |

---

## Part 0B D1 to D8

**D1 AGREE.** Press release moves to the third-person list. `FIRST_PERSON_ACTOR_INSTRUCTION` now attaches to `voice_consistency` on press releases. CONFIRMED `houseVoiceIsThirdPerson` reads the table (`house-voice.mjs` L59-61); `firstPersonActorPromptBlock` attaches when third (`editorial-compliance-reviewer.mjs` L157-160). `first_person_plural` `applies_to` stays `["reporting_commentary"]`. It **should** widen to include `press_release`. Filed **B223**. Not built.

**D2 AGREE, with one extra importer.** One table per repo. Backend `lib/prompt-library/house-voice.mjs`. Frontend `src/constants/houseVoice.js` names the backend file as authority. `first-person-actor.mjs` re-exports. `editorialRules.js`, `style-guide.mjs`, and `output-intent.js` import it. **AMEND:** `outputTypeGuidance.js` also imports it. Without that, writing prompts would still state person in their own words and B220's user-visible claim would fail. Drift guard: each repo asserts the exact table; failure message names the other repo file. CI is per-repo, so one repo cannot read the other. A shared published package would be a stronger guard and is not worth it here.

**D3 AMEND.** Editorial rules can *instruct* the carve-out today via `reviewerNoteByOutput.press_release`. They cannot *detect* quotes without new work. Expressed as instruction. Left the body rule in place. Filed **B224**. Not built.

**D4 AGREE.** The string lives in backend `lib/revise-actions/sort.mjs` L17-18 (`NO_PROPOSAL.visible_signal`). Already asserted in `tests/revise-actions-license.test.mjs` L13-19. Frontend does not own the string; it renders `acknowledgeReasonFor(entry)` (`actionListDisplay.js` L270-272; `StatementReviewCard.jsx` L545). Cheapest honest frontend test: that helper surfaces the shipped string, and the card calls it. Built `tests/b214-no-proposal-card-copy.test.mjs`. Dropped a new backend file; extended nothing because the backend assertion already existed.

**D5 AGREE, amended ignore path.** Backend `ignoreCommand` skips when `git diff HEAD^ HEAD` is empty outside `docs/` and `scripts/diagnostic`. The extra `scripts/diagnostic` exclude is so this report, which the spec places there, does not force a production rebuild. Frontend has a pushed `docs/` directory; same ignore for `docs/` only, in frontend `vercel.json` (not listed in the spec's `git add`; said so).

**D6 AGREE.** `.cursorrules` already existed with the run-to-completion rule. Appended the standing authority. Pasted verbatim below.

**D7.** Nothing here changes Stage 1 splitting or the Stage 2 evidence prompt. CONFIRMED `04c145f` files: house-voice, first-person-actor, editorialRules, style-guide, output-intent, outputTypeGuidance, prompt-library index, vercel.json, .cursorrules, tests.

**D8.** After `389dab7` the Launch column is LAUNCH / AFTER / RECORD. New work rows went under Open work / Backend (B223, B224). B222 logging went under Standing rules. B220, B221, B222 shipped rows went under Closed "Moved from open tables". **B208, B210, B211, B217, B218 are already in Closed** (moved-from-open table, `03e2440`). The restructure report listing them as open was stale.

---

## C1 to C5

**C1 BLOCKING. CONFIRMED true on pre-change code.** `outputTypeGuidance.js` L40 said third-person. `editorialRules.js` L31-32 and `style-guide.mjs` L137-138 said first-person plural. `output-intent.js` `getPromptGuidance` L123 said nothing. After this spec those four read the table.

**C2 CHECK. CONFIRMED.** Pre-change `first-person-actor.mjs` L23-29 placed `press_release` in `FIRST_PERSON_HOUSE_VOICE_SLUGS`. Now the table puts it in third person (`house-voice.mjs` L7-12).

**C3 CHECK. CONFIRMED.** No prior test asserted the four files agreed. New: `tests/b220-house-voice-single-source.test.mjs` in both repos.

**C4 CHECK. CONFIRMED.** String in `lib/revise-actions/sort.mjs` L17-18. Reachable without a Review via `NO_PROPOSAL.visible_signal` and via `acknowledgeReasonFor`.

**C5 CHECK. CONFIRMED.** Pre-change backend `vercel.json` had no `ignoreCommand`. Every push to main built, including docs-only.

---

## Behaviours that changed because press release moved lists

1. `houseVoiceIsThirdPerson("press_release")` is true.
2. `FIRST_PERSON_ACTOR_INSTRUCTION` attaches to `voice_consistency` on press releases.
3. `FIRST-PERSON REMOVAL` prompt block is included for press releases.
4. `liveActorDescription` no longer strips the instruction on press releases.
5. `voice_consistency` `fixDirection` attaches on press releases.
6. The `voice_consistency` pronoun backstop now runs on press releases: a first-person-misuse finding whose cited span has no first-person pronoun is dropped.
7. `getPromptGuidance` for a press release now says: `Use third-person in the body. First-person plural is correct only inside an attributed quotation.`
8. Writing tone line for a press release now includes that carve-out.
9. `detectRewriteClash` only treats a first-person instruction as a clash when house voice is third person. Investor letter and LinkedIn no longer warn that "base guidance prefers third-person". Press release still does.
10. `first_person_plural` still applies only to reporting commentary. A body "we" on a press release is not a style-rule hit. **B223**.

---

## Tests: failing, then passing

New files:
- backend `tests/b220-house-voice-single-source.test.mjs`
- frontend `tests/b220-house-voice-single-source.test.mjs`
- frontend `tests/b214-no-proposal-card-copy.test.mjs`
B214 backend file not added: `tests/revise-actions-license.test.mjs` already asserted the string.

B219 instruction tests now read `houseVoiceIsThirdPerson` from the table instead of hardcoding press release as first person. That keeps the opposite-direction invariant after the ruling. Not a rewrite to hide a fail.

**B220 backend, missing module:**

```
Error: Cannot find module '../lib/prompt-library/house-voice.mjs'
```

**B220 frontend, missing module:**

```
Error: Cannot find module '../src/constants/houseVoice.js'
```

**B220 backend, table present, callers not wired: 5 failed, 2 passed.**

```
press_release is third person, not first-person plural
  HOUSE_VOICE_TABLE must match frontend src/constants/houseVoice.js
  Expected: true  Received: false

first-person-actor re-exports the same lists as house-voice.mjs
  extra in first-person-actor FIRST list: press_release

editorial voice_consistency description does not call press releases first-person plural
  Expected: false  Received: true

style-guide first_person_plural description does not list press_release as acceptable
  Expected: false  Received: true

getPromptGuidance states third person for a press release
  received: "Format as a press release. Open with FOR IMMEDIATE RELEASE. ..."
  no third-person
```

outputTypeGuidance press-release tone already said third-person, so that assertion passed on current code.

**B214 frontend: 2 passed on current code.** The copy had already shipped. That is the close.

After wiring: B220 7/7 pass. B219 9/9 pass. Backend 1201. Frontend 169.

---

## .cursorrules verbatim (both repos)

```
Run each task to completion without pausing to ask for confirmation or to report that context has been gathered. Do not ask "continue?", "proceed?", or similar. Only ask the user a question when a decision would change user-facing behaviour, alter a data contract, touch verdict/aggregation logic, or is hard to reverse. Otherwise make a reasonable choice, proceed, and report what you did at the end.

Standing authority (B222). Cursor may make a change WITHOUT a spec when the change removes a contradiction between two places that already state the same thing, fixes user-facing copy that is plainly wrong, adds a test for behaviour that already shipped, or removes duplication, PROVIDED it changes no verdict logic, no data contract, no user-facing behaviour beyond the copy itself, and is recorded in docs/BACKLOG.md in the same commit. Everything else still needs a spec.
```

---

## User-facing strings (verbatim)

Editorial prose from the table:

`Reporting commentary and Press releases use third-person. Investor letters and LinkedIn posts use first-person plural (we, our).`

Press-release writing line:

`Factual, third-person in the body, concise; suitable for external distribution. First-person plural is correct only inside an attributed quotation.`

Press-release prompt guidance:

`Use third-person in the body. First-person plural is correct only inside an attributed quotation.`

Press-release reviewer note (instruction only):

`On press_release: the body is third person. First-person plural is correct only inside an attributed quotation. Do not flag first person that sits inside quotation marks with a named speaker. Flag first person in the body. There is no deterministic quote detector; this is instruction only.`

B214 (unchanged):

`The review found a concern in this sentence. No wording change is proposed, so you can judge it yourself.`

---

## Disagreements / leftovers

- `lib/rulebook/styleGuide.js` `DEFAULT_STYLE_GUIDE` still says `Use third-person voice by default`. Legacy scaffold, not per-output-type. Not rewritten.
- Investor-letter writing still has a separate line `Third-person for portfolio company references (the firm, the company).` That is not house voice of the output type.
- B219 tests now follow the table. They no longer encode press release as first person.
- B221 ignoreCommand also excludes `scripts/diagnostic` so this report does not rebuild production. That is wider than `docs/` alone.
- Frontend `vercel.json` ignoreCommand was not in the spec's `git add` list. It is in the frontend commit.
- `detectRewriteClash` previously warned on every first-person instruction, including investor letter. It now follows the table. That is a real behaviour change for writing, not only review.
- No production Review. B214 was closed on tests, as specified.

## Technical summary

One house-voice table in `lib/prompt-library/house-voice.mjs`, mirrored on the frontend. Press release is third person. Review, style-guide copy, writing guidance, and rewrite-clash detection all import that table. `first_person_plural` scope is unchanged. Docs-only (and diagnostic-report) pushes skip the backend Vercel build. `.cursorrules` carries a standing no-spec authority with a BACKLOG logging requirement. B214 copy is covered by a frontend unit test of the card helper.

## Plain-language summary

A press release is now written and reviewed as third person in the body, so the writer is not told first person and third person at once. Docs-only commits should stop redeploying the backend. The no-proposal card line is locked by a test. Cursor may fix contradictions, copy, tests, and duplication without a spec when the change is recorded in the backlog in the same commit.
