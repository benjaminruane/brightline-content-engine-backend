# Claim disagreements. Output pass. 2026-09-19

Closed nothing. Filed **B247** and **B248**. Did not refile F24, B74, B173, B234, B236. Scoreboard stays **20 of 87**. No spec.

Eight analyse-statements recordings in `tests/fixtures/b247/`. No synthesize-review. No constructive-feedback call.

---

## The states

| State | Used | Reached |
|-------|------|---------|
| R1 Ready | Two-sentence Oakfield close. Source is the same text plus `This note is for internal reporting only.` All checks on. 19 words. | **Yes.** Readiness `Ready`. Both cards `supported_full` / editorial `clean` / compliance `clean`. QRS: `All claims are backed by sources and no editorial or compliance concerns were found.` |
| R2 first | Draft EUR 400 million. Source A 400. Source B 450. | **Yes.** One card `conflict`. Readiness `Needs significant work`. |
| R2 second | Same body plus `sourceRulings: [{ a: 0, b: 1, governs: 0 }]`. | **Review ran. Ruling did not apply.** Still `conflict` / `Needs significant work`. `api/analyse-statements.js` has no `sourceRulings` reader. CONFIRMED. Already filed (B173 / governance persistence). Not a new row. |
| R3 | Same Oakfield pair as R1. `editorialEnabled` false. `complianceEnabled` false. | **Yes.** QRS `Ready` / `All claims are backed by sources.` Screen editorial and compliance `Not reviewed`. Live proof of **B234**. |
| R4 | `We closed Fund III...` Evidence off. Editorial and compliance on. | **Yes.** Evidence badges `Not reviewed`. QRS `1 claim has editorial notes.` Export has no `Verdict:` line. Live proof of **B234**. |
| R5 | Good Oakfield source, `empty-memo.txt` with empty text, `oakfield-thin.txt` (`Oakfield Partners.`). | **Yes.** `empty-memo.txt` excluded `empty_after_extraction`. Thin source kept. Ready. |
| R6 near limit | Eleven-sentence Oakfield draft, 153 words, two sources. | **Mostly.** 10 cards. Stage 1 dropped `This note covers the March 2025 close.` Live draft 153 words, statements join to 146. **B248**. |
| R6 unsupported | Northaven sale. Source is the Oakfield close note. | **Not fully.** Wanted every card `not_supported`. Got one `conflict` and one `not_supported`. Surfaces agree with that payload. Accuracy is out of scope. |

Added R6 as two recordings because one draft cannot be both near the word limit and wholly unsupported.

---

## A. Claim against payload

| State | The two things | What each says |
|-------|----------------|----------------|
| r3-evidence-only | screen editorial label / `qcCard.editorialVerdict` | `Not reviewed` / `clean` |
| r3-evidence-only | screen compliance label / `qcCard.complianceVerdict` | `Not reviewed` / `clean` |
| r3-evidence-only | same on card 1 | `Not reviewed` / `clean` |
| r6-near-limit | live draft word count / statement texts joined | `153` / `146` |

Cause of the R3 rows: `lib/qc/pipeline-v3/stage7-assemble-card.mjs` L515 `editorialVerdict: editorialOn ? "not_reviewed" : "clean"`. CONFIRMED. Screen uses `reviewOptions`, not that field. **B247**.

Cause of R6: Stage 1 omitted the last sentence. CONFIRMED no `This note covers` in `r6-near-limit.json`. **B248**.

Every other counted badge, QRS count, excerpt, and drawer span on these fixtures matched the card field it was built from.

---

## B. Claim against claim

| State | The two things | What each says |
|-------|----------------|----------------|
| r3-evidence-only | screen editorial labels / export editorial lines | `Not reviewed` / `(omitted)` |
| r4-editorial-only | filter Not checked / evidence Not reviewed badges | `0` / `2` |
| r6-near-limit | constructive feedback notes (non-coherence) / unclean cards | `9` / `7` |

R1, R2, R5, R6-unsupported: readiness, QRS bullets, assessment `qcSummary` counts, and export first lines were the same words.

Assessment paragraphs and constructive-feedback covering notes were not generated. Those writers were compared on the numbers they are given, not on model prose. **B236** stays open.

---

## C. Claim against what was actually checked

Empty on the honest surfaces. R3 QRS does not name editorial notes. R4 QRS does not say claims are backed by sources. R4 export prints no evidence verdict. That is the live proof of **B234** on states that fix was never run against.

The payload field still says `clean` on R3 (table A / **B247**).

---

## Ranked by: could a user act wrongly on this?

| Rank | Disagreement | Wrong action? | Row |
|------|--------------|---------------|-----|
| 1 | R6 last sentence never became a card, live draft still 153 words | Yes. A reviewer can think the close-cover sentence was checked. | **B248** |
| 2 | R3 payload `clean` while the check was off | Yes, if anyone reads the JSON or a consumer that ignores `reviewOptions`. The app screen is honest. | **B247** |
| 3 | R4 filter Not checked 0 vs two evidence Not reviewed badges | Yes. Those cards cannot be found with Not checked. | **F24**, do not refile |
| 4 | R2 second Review still Conflicting after a ruling on the request | Yes, if they think a second Review applies the governing document. | Already filed. Do not refile |
| 5 | R3 screen `Not reviewed` vs export omitting the editorial line | Low. Silence is not a green stamp. | Annotate **B234** |
| 6 | R6 feedback 9 notes vs 7 unclean cards | Low. Two cards carry more than one note. | Intentional. No new row |

---

## Intentional, with the reason

| Item | Reason | Row |
|------|--------|-----|
| Needs attention vs readiness after an accepted fix | Not observed. No saved accept in these payloads. | **B204** |
| Filter Not checked ignores evidence Not reviewed | Filter reads editorial/compliance `summaryClass` only. CONFIRMED `qcWorkbenchFilters.js` L54-56. R4 is the live exhibit. | **F24** |
| Feedback note count > unclean cards | `collectMarginNotes` emits one row per concern, not per card. | none |
| Partial cards outside Needs attention | `needsAttention` is no-support, conflict, or signal concern. Partial is QRS-only. | none |
| R3 export omits editorial notes | Check was off. B234 refuses to print a check that did not run. | **B234** |
| R5 Ready while `empty-memo.txt` is excluded | QRS is about claims, not about every uploaded file. Exclusion is C27. | none |
| R6 QRS three problem bullets plus a word-over line | Word-over is appended after the cap. All three problem classes still printed. | **B237** not hit as a silence |

---

## Part 3. The comparison can fail

Copy of `r2-conflict-first.json`. `summaryClass.evidence` set to `confirmed` and `needsAttention` to false. `displayVerdict` left as `conflict`.

Caught:

| The two things | What each says |
|----------------|----------------|
| filter Conflicts / Conflicting badges | `0` / `1` |
| filter Needs attention / QRS needsAttention | `0` / `1` |

---

## Claims each state could not reach

Shared misses (need empty app, generate, rewrite, save, accept, export modal, history, errors): C1 empty, C2, C5, C7-C11, C15-C18, C20, C22-C26, C28-C29, C34-C35, C37 model paragraph, C40 model body, C41-C42, C44-C61, C68 control chrome, C70-C87 except C81.

| State | Extra misses |
|-------|----------------|
| R1 | C3 non-zero filters, C4 problem bullets, C6, C12, C23, C27, C49, C51, C52, C62-C65, C67, C69 |
| R2 | C14 Ready, C23 (ruling not in payload), C27, C62-C67, C66 |
| R3 | C6, C12, C23, C27, C49 (failed-on, not off), C62 evidence skip, C66 all-three-checks sentence |
| R4 | C13 evidence verdicts, C14 Ready, C27, C66 backed-by-sources |
| R5 | C12, C23, C62-C67. Reached C27. |
| R6 near limit | C14 Ready, C23, C27, C62-C67. Reached C12 on the live draft. |
| R6 unsupported | C14 Ready, C27, C62-C67. Did not reach all-`not_supported`. |

---

## What this method still cannot see

- Model sentences from reviewer assessment and constructive feedback (not billed)
- A governing ruling, because it is not in analyse-statements
- After-accept Needs attention (B204) without a saved overlay
- PDF/DOCX layout
- Hover titles, toasts, empty states, Writing route
- Whether a verdict is factually right (corpora)

---

## 20 of 87

Unchanged. These recordings are fixtures, not new e2e assertions.
