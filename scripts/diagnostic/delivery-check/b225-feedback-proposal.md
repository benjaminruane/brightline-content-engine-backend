# B225 — Constructive feedback proposal

Proposal pass. Not a build spec. No model called. Two copy ships only.

---

## P1 — How I would build this

One call. The model writes a piece. Code writes the opening line and referees coverage. Craft is a permission, not a section.

### What the model receives

1. The analysed draft, once, as the thing being read.
2. The readiness label, already written by code as sentence one of the output. The model is told that line exists and must not be restated or reworded. Missing or unknown readiness is refused the way `api/synthesize-review.js` already refuses (`READINESS_LABELS` check at L30–33).
3. Findings as **margin notes on the draft**, not as `feedbackBundles[]`. Each note carries:
   - `kind`: evidence | editorial | compliance
   - the card's own words: `evidenceSummary` / `editorialConcerns[].note` / `complianceConcerns[].note`
   - for evidence, a `draftSays` / `sourceSays` pair taken from the statement and the excerpt or Stage 5 commentary, so "June 2026" versus "first close expected Q3 2026" cannot be generalised into "does not confirm the timing"
4. Output type, so LinkedIn first-person is not scolded.
5. No dimension list. One line of permission: if a document-level pattern is true of this draft and is not already in a margin note, it may be said, quoted. If not, say nothing on craft.

That is the opposite of today's payload. Today the card pass gets an ordered array (`buildConstructiveFeedbackUserPayload`, `lib/qc/constructive-feedback.mjs` L603–653) and the craft pass gets a numbered list of six dimensions (`CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS` L285–292, inserted as `1. … 6. …` in `buildConstructiveFeedbackCraftUserPayload` L402–403). Assembly then concatenates craft points ahead of card points (`assembleCraftAndCardFeedback` L574–584). That is the form.

### How the prompt is structured

System, in this order:

- Role: senior editor giving notes to a good writer who is new. Concise, crisp, useful, lightly encouraging without being soft.
- Register constraints already in `CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER` (anti-patterns: no praise-sandwich, no schoolroom, no system language, third person on the subject / imperative on the fix). Keep those. Drop the line that tells the model to say a weak draft "needs real work" (L255). That fights F1.
- Hard rules F1–F4, in code-enforced language where they can be: F1 is code; F2 is a coverage check after the call; F3 is "no worked example of a finished piece"; F4 is a length budget derived from readiness and draft length, not from card count.
- "Write a piece a writer wants to read. Not a form. Do not write one observation per note. Do not number unless the piece needs numbers. Do not roll-call structure, core message, conciseness, register, opening, or coherence."

No second system prompt. No craft call. `runCraftPass` + `runCardPass` + `splitCardFeedbackSections` + `assembleCraftAndCardFeedback` go away for this path.

I do **not** believe the register needs a worked example of a finished piece. The failure on 18 Sep was imitation of the **form** (six dimensions, one point per bundle, numbered list). Anti-patterns plus a role are enough. If a later pass still sounds like a report, tighten the anti-patterns. Do not add an example.

### How craft is handled

Delete `CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS` from anything the model sees. A six-item numbered list is a form. The 18 Sep invented hook and the "no internal contradictions" paragraph are that list being filled.

Internal figure clash, if we still want it, is a **code** scan that becomes a margin note (the deterministic half of **Pr16**). It is not dimension 6 of a craft essay.

### How the piece is ordered

Code writes: `{readiness}.` as line one.

The model then writes the body in the order a writer needs as they reread **their** draft, which is document order with the serious things said first when they are serious, not "craft block then worst-first bundles". Worst-first is itself a template: it is why the two cards that needed attention were points 7 and 8 of 11.

Code does not concatenate two numbered lists. If F2 finds a named concern missing from the body, append a short deterministic remainder that quotes the missing notes. That is a referee, not generative fallback.

### What stops it becoming a new template

- Payload shape is not an outline (see P2).
- Prompt does not require numbered points, one-per-bundle, or six dimensions.
- No finished-piece example (F3).
- Post-check: fail the piece if it contains the six dimension names as a roll-call, or if point count equals bundle count plus six.
- Length budget from readiness (F4), so a seven-sentence `Needs work` draft cannot lawfully become eleven points.
- Prove it at temperature 0 (P3, P4) so sampling is not the thing that makes it look different.

---

## P2 — Payload shape (agree with Claude)

**Agree with Claude.** An ordered JSON array is an outline. The 18 Sep piece mapped 1:1 onto that array (and onto the dimension list before it). Removing "exactly ONE numbered point per statement bundle" (`buildConstructiveFeedbackUserPayload` L615) while still sending `feedbackBundles: [ … ]` in given order (L649, and "in the order given, worst-first" at L624) will still produce an ordered list. Models complete the shape they are handed. Prose instructions lose.

A JSON object keyed by statement is not enough either. `JSON.stringify` preserves insertion order; the model still sees a sequence.

**What I would pass instead:** the draft with margin notes interleaved at the sentences they belong to.

```
DRAFT
[sentence]
  [evidence] draft says "June 2026"; source says "first close expected Q3 2026"
    card: <evidenceSummary verbatim>
[sentence]
[sentence]
  [editorial] "We" — first-person voice on a reporting commentary
    card: <editorialConcerns[].note verbatim>
  [evidence] no source addresses a recommendation
    card: <evidenceSummary verbatim>
```

That is how an editor reads. It is document order, not worst-first. Several notes can sit on one sentence without becoming one numbered point and without flattening kinds (P6). There is no array of "points to write".

If a structured blob is still wanted for tests, put it under a key named `marginNotesByStatement` and tell the model, once, that this is not the outline of the piece. Do not call it `feedbackBundles`. Do not number it.

---

## P3 — How to prove it is not a template (disagree with Claude)

Claude's test — four reviews of different shapes, assert opening words, paragraph count, and length differ — is **necessary and not sufficient**.

F1 already forces different opening words whenever readiness differs. F4 already forces different length and paragraph count whenever severity differs. A form can pass that test and still be a form: "Needs work. 1. Structure… 2. Core-message… 3. Conciseness…" on a short dirty memo, versus a longer version of the same skeleton on a long dirty memo.

### What I would add

Mechanical, at temperature 0, no seed (today's call already has no seed):

1. **No dimension roll-call.** None of the six `CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS` names appear as headings or as a 1–6 sequence.
2. **Point count is not bundle count, and not bundle count + 6.** The 18 Sep failure is exactly 6 + 5 = 11.
3. **Fact survival.** If a card's `evidenceSummary` names both "June 2026" and "Q3 2026", both strings (or the source's own wording) appear in the piece. "Does not confirm the timing" without the dates fails.
4. **F2 coverage.** Every margin note's quoted span or statement fragment appears in the piece.
5. **F1 exact.** First sentence is the readiness label verbatim. "This draft needs significant work" fails when readiness is "Needs work".
6. **No invented craft on a short draft with two real cards.** The 18 Sep hook complaint and the "no internal contradictions" paragraph must not appear when the notes do not contain them and the draft does not warrant them.
7. **Skeleton check.** Strip readiness, quotes, and figures. The remaining sentence stems must not match across the four fixtures (no shared "The opening lacks a hook" / "There were no internal contradictions" / "1. Structure & argument flow" pattern).

Claude's surface stats stay as a smoke check only.

### The four fixtures

Genuinely different **shapes**, not four dirty IC memos:

| # | Shape | Fixture | Why |
| --- | --- | --- | --- |
| 1 | Short dirty reporting commentary, two real cards, mixed evidence + first-person on the closer | The **18 Sep Meridian** run itself, snapshotted (seven-sentence draft, readiness "Needs work") | The known failure. If this still emits eleven points or an invented hook, the redesign has not landed. |
| 2 | Different genre, first-person allowed, hook opening fine | `scripts/diagnostic/fixtures/12_synth_linkedin_post.json` | Craft-today would still be tempted to flag the hook and the first person. The piece must not. |
| 3 | Different genre, lede + quotes + formal register | `scripts/diagnostic/fixtures/10_synth_public_press_release.json` | Structure advice that is wrong for LinkedIn is right here only if it is true of **this** draft, not because dimension 1 exists. |
| 4 | Same genre as (1), different disease: internal figure clash, first-person thesis, almost-ready length | `scripts/diagnostic/fixtures/13_synth_internal_inconsistency_memo.json` | Proves length still follows severity, that a real coherence problem is sayable without a six-dimension roll-call, and that the skeleton is not the Meridian skeleton with different quotes. |

Do not use four runs of Meridian. Do not use temperature to create the difference.

---

## P4 — Temperature, seed, model (agree in part, disagree in part)

**Today**

- Model: `gpt-4o-2024-08-06` (`STAGE_MODELS["constructive-feedback"]` and `["constructive-feedback-craft"]` in `lib/qc/model-config.mjs` L40–41).
- Temperature: **0**, hardcoded in both `runCraftPass` and `runCardPass` (`api/constructive-feedback.js` L53 and L91). Not read from model-config.
- Seed: **not sent**. `callLLM` only forwards `seed` when `Number.isInteger(seed)` (`lib/observability.js` L429–431). Neither constructive-feedback call passes `seed`.

Claude's "every other call is pinned" is slightly stronger than the code. Dated model snapshot + temperature 0 is the house default. A numeric seed is **not** on every call. Stage 2 is the one that pins `seed: 1` (`STAGE2_SEED` in `lib/qc/pipeline-v4/stage2-match-sources.mjs` L58–59). Synthesize-review, editorial, Stage 5, Stage 1 are temp 0 with no seed, same as this call.

**Agree with Claude** that this output is never scored, counted, or aggregated, so pinning it buys no verdict stability.

**Disagree with Claude** that we should raise temperature as the way out of the form, and **disagree** that P3 should run at a raised temperature.

A raised temperature would make Claude's P3 test **unfalsifiable**. Opening words, paragraph count, and length will differ from sampling noise even if the prompt is still "one point per bundle, six dimensions first". That is the opposite of a proof.

Order: prove the prompt and payload at **temperature 0** (P3 as I restated it). Then this call is the one deliberate production exception: drop the temp-0 pin for voice. Do not use sampling to hide a form.

If production later runs hotter, keep a seeded temp-0 replay of the four fixtures in CI so the structure test stays falsifiable.

---

## P5 — What each piece of writing is for (do not merge)

Read from the prompts and the B26 split, not from the names.

### Reviewer Assessment (`api/synthesize-review.js`)

Audience: a colleague deciding signoff (`roleFraming` L48–51: "reviewing a draft for signoff readiness"; writing-context only then switches to "your draft"). Job: one narrative paragraph, 100–200 words, diagnostic. "Assess what is working and what needs fixing" (L69). Must state readiness in the first sentence in exact words (L74). Must not use system vocabulary (L8). Covers only the review types that ran (L71). Closed as **not** the author-facing piece: BACKLOG Pr8 / ROADMAP B26, "Closed by not reframing Reviewer Assessment".

### Constructive Feedback (`lib/qc/constructive-feedback.mjs` + `api/constructive-feedback.js`)

Audience: the author. Job: notes you would paste into an email (`StatementAnalysisPanel.jsx` modal copy). Editor-to-writer register (L252–258). Today: opening + numbered points + closing, one point per bundle, craft block first. Selection is card-derived (`selectConstructiveFeedbackBundles`). On-demand, not part of Review.

### Overlap

Both speak in a senior-editor voice. Both are handed readiness. Both are supposed to talk about evidence, editorial, and compliance findings. Both currently fail the writer in related ways: assessment describes a finding it was not given (P6); feedback paraphrases away a finding it **was** given (18 Sep dates).

### Where they disagree

| | Assessment | Feedback |
| --- | --- | --- |
| Reader | Reviewer / colleague (or writer-as-self in Writing) | Writer, as an editor would write to them |
| Shape | One paragraph | A piece; length follows severity (F4) |
| Job | Signoff diagnosis | What to do, specifically enough to act |
| Specificity | May summarise | Must not be less informative than the cards |
| Craft dimensions | Not its job | Not a checklist; only true patterns |

### What one should not say that the other should not inherit

- Assessment should **not** prescribe sentence-level rewrites or first-person substitutions. That is the cards, then feedback, then Implement Changes. If we "fix" assessment by pouring bundle-style directions into the paragraph, we have merged them.
- Feedback should **not** brief a reviewer ("editorial and compliance are clean", QRS counts, "statements could not be checked"). That is assessment.
- Assessment should **not** invent craft-dimension coverage. Feedback should not either; it currently does.
- Feedback should **not** choose or reword readiness (F1). Assessment already has the exact-words rule; keep them aligned in **code**, not by copying prose between prompts.
- Neither should describe the other signal's finding as its own (P6).

Do not merge them. Do not fix one by pasting the other's prompt into it.

---

## P6 — Two findings on one sentence, flattened (do not build)

The 18 Sep assessment treated the editorial problem on "We recommend approval of the commitment" as a lack of justification. Lack of justification is the **evidence** problem on that sentence. The editorial problem is first-person voice.

**Where**

`src/utils/reviewerSynthesisPayload.js` in the frontend.

```25:29:src/utils/reviewerSynthesisPayload.js
function editorialConcernFromRow(row) {
  return {
    statement: String(row?.text ?? ""),
    concern: String(row?.qcCard?.editorialCommentary ?? row?.qcCard?.assessmentExplanation ?? ""),
  };
}
```

Same pattern for compliance at L32–36. Evidence at L3–7 uses `qcCard.assessmentExplanation ?? row.assessment`.

None of those fields exist on a v4 card. Backend stores:

- evidence in `qcCard.evidenceSummary` / `reasoningParagraph` (`lib/qc/pipeline-v3/stage7-assemble-card.mjs` L741–788, L805)
- editorial in `qcCard.editorialConcerns[].note` (and `editorialNote` only when clean)
- classification in `qcCard.summaryClass` (stamped in `api/analyse-statements.js` L317)

So a sentence that is both `notSupported` and editorial-concern produces:

- `notSupportedStatements[]`: `{ statement, evidenceFinding: "" }`
- `editorialConcerns[]`: `{ statement, concern: "" }`

One object per **row**, not per finding. Empty notes. The model is given the sentence twice, in two buckets, with no note text, plus the draft. It infers one story from "We recommend approval" sitting in the unsupported list: no justification. The first-person note on the card never leaves the card.

Constructive feedback does **not** share this bug. `collectConcernInputs` (`lib/qc/constructive-feedback.mjs` L76–88) reads `editorialConcerns[].note`. Its flatten is later: "weave … into a single editor's observation" (L615). Different flatten, different place.

Card assembly `applyConcernDuplicateMerges` (`stage7-assemble-card.mjs` L377–402) only merges overlapping same-signal concerns. It does not merge evidence into editorial. Not this bug.

**Smallest honest fix (not built):** in `editorialConcernFromRow`, pass `qcCard.editorialConcerns[].note` (all of them). Never fall back to `assessmentExplanation`. Same for compliance (`complianceConcerns[].note`). For evidence, pass `evidenceSummary`. Prefer one payload item per concern, not per statement, so two findings on one sentence stay two descriptions. Add nothing to the synthesize-review prompt until the payload is honest; the model cannot name a note it never received.

---

## P7 — What this pass did not ask

1. **Kill the two-call assembly.** Craft-then-cards concatenation (`assembleCraftAndCardFeedback`) is the ordering bug. One call.
2. **Code-write readiness.** Do not ask the model to "match tone to the readiness level" while also forbidding it to choose the label. Inject the label.
3. **Pass facts, not commentary to rewrite.** Stage 5 already named June 2026 versus Q3 2026. Feedback paraphrased it. `draftSays` / `sourceSays` on the margin note.
4. **Drop `CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS` from the prompt.** Permission, not a checklist. Figure clash in code if we still want it (Pr16).
5. **Rewrite the register line at L255** ("on a weak draft, say it needs real work"). It licensed "This draft needs significant work" against readiness "Needs work".
6. **Fix P6 on the assessment path in the same spec or the one after, without copying feedback into assessment.** Otherwise we will keep "fixing" feedback and still ship a reviewer paragraph that cannot see first-person.
7. **Post-filter F2 and the dimension roll-call** in code. Do not trust the model (B14).
8. **Leave the modal subtitle** ("Author-facing notes from this review. Copy to paste into email.") unless copy is being unified; it is not "author feedback" and it is still true.
9. **Do not raise temperature until P3 as restated is green at temp 0.**

---

## Disagreements with Claude, by name

| Item | Claude | This pass |
| --- | --- | --- |
| P2 | Ordered array still produces an ordered list after dropping one-per-bundle | **Agree.** Pass an annotated draft, not an array and not a keyed object that still serialises in insertion order. |
| P3 | Four shapes; assert opening words, paragraph count, length differ | **Disagree.** That test is too weak. F1 and F4 already force those diffs. Add roll-call, point-count, fact-survival, F2, F1-exact, no-invented-craft, and a stripped-skeleton check. |
| P4 | Unpin this call; raised temp is the voice exception | **Agree** it may be the one production exception, **after** structure is proven. **Disagree** that raising temperature is how we beat the form, and that P3 should run hot. Hot P3 is unfalsifiable. |
| P4 pinning | Every other call is pinned | **Amend.** Temp 0 + dated snapshot is the house default. Numeric seed is Stage 2 (and some revise), not every call. This call is already temp 0, no seed, same as synthesize-review. |

F3: register can be conveyed without a finished-piece example. Did not stop.

---

## Claim A — frontend copy (shipped)

True. `9925cda` (`feat(B26.2.2): bordered collapse group, inline generate button, author-feedback label`) renamed the three UI strings. Reverted in `StatementAnalysisPanel.jsx`:

- L2369 `View constructive feedback`
- L2370 `Generate constructive feedback`
- L2837 heading `Constructive feedback`

L2845 was already `Generating constructive feedback…`. L1752 toast was already `Copied constructive feedback to clipboard.`

### Every other place that still says "author feedback"

**Frontend (live code)**

- `src/modules/drafting/StatementAnalysisPanel.jsx` L419 comment: `quiet author-feedback` (not user-visible)

**Frontend (not "author feedback")**

- L2840 subtitle: `Author-facing notes from this review. Copy to paste into email.` Left as-is.

**Backend docs (not UI)**

- `docs/BACKLOG.md` F11, B26.2.2, B26.2.4
- `docs/ROADMAP.md` B26.2.2 / B26.2.4 recently-shipped notes (Generate/View author feedback, modal title Author feedback, "author-feedback request")

Copy-only. No browser pass.

---

## Claim B — en-dash in quote discipline (shipped)

True. `CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE` had `~8–10` (U+2013). Replaced with `~8-10`. Also replaced the unicode ellipsis in that same string with `...` so the prompt is ASCII. Test now asserts the hyphen and the absence of U+2013 / U+2014 in that constant.

`CLEAN_DRAFT_FEEDBACK_TEXT` (`No changes are needed — the draft is ready for signoff.`) still has an em-dash. It is returned as product copy when there is nothing to send the model. It does **not** reach a prompt. Left as-is.

### Remaining en-dash / em-dash in strings that reach a model prompt

Frontend: **none**. Frontend does not own LLM prompts. Remaining dashes in `src/` are UI placeholders (`—`) and display copy.

Backend, after this ship. En-dash (U+2013) first, then em-dash (U+2014). Comments excluded. Intentional examples of the character being forbidden are marked.

**En-dash still in a prompt string**

| File | Line | Note |
| --- | --- | --- |
| `lib/qc/constructive-feedback.mjs` | 363 | `dimensions 1–5` in the craft system prompt |
| `api/summarize-rewrite-label.js` | 43 | `5–8 words` |
| `api/query-sources.js` | 98 | `3–6 bullets` |
| `api/rewrite.js` | 815 | `1–2 sentences` in the rewrite output contract |
| `lib/qc/style-guide.mjs` | 171 | `0–12` in the number-spelling rule |
| `lib/qc/editorial-compliance-reviewer.mjs` | 904 | `0–12 number` in a drop-log / concern filter string |
| `lib/rulebook/styleGuide.js` | 17, 33, 156 | `2–4`, `10–15`, `3–5`; L156 names en-dash as the character to avoid |
| `lib/prompt-library/outputTypeGuidance.js` | 49, 64 | `2–3 sentences`, `1–3 short paragraphs` |
| `api/generate.js` | 338–339 | regex matching en/em dashes in **user/source text**, not prose instruction |
| `api/rewrite.js` | 368–369 | same regex |
| `lib/build-revision-prompt.mjs` | 826 | regex class `[-–—]` on marker notes |

**Em-dash still in a prompt string** (counts are remaining prompt lines, not comments)

| File | Em-dash lines | Role |
| --- | --- | --- |
| `lib/qc/constructive-feedback.mjs` | ~19 remaining | Editor register, craft instructions, bundle-weave rule. L228 clean-draft copy is **not** a prompt. |
| `api/synthesize-review.js` | 8 | Assessment system prompt |
| `lib/qc/editorial-compliance-reviewer.mjs` | many | Meta-rules, JSON schema hints, evaluation scope. L46 and L81 are **examples of em-dashes to flag**. |
| `lib/qc/style-guide.mjs` | 49, 81, 118, 120, 128, 171 | Rule text; L118/L120 **are** the em-dash rule (must contain —). |
| `lib/rulebook/styleGuide.js` | 63, 156, 254 | Same: L63/L156 name the forbidden character. |
| `lib/rulebook/editorialRules.js` | 75, 96, 129, 143, 160 | Rule `reviewerNote` / `fixDirection` injected into editorial prompts |
| `lib/qc/editorial-duplication-judge.mjs` | 10 | Judge system prompt |
| `lib/qc/llm-claim-verifier.mjs` | 56, 68 | Verifier prompt |
| `lib/build-revision-prompt.mjs` | many from L1082 | Suggest-revision instructions |
| `lib/revise-stage1-prompt.mjs` | 22 | `OUTPUT CONTRACT —` |
| `lib/prompt-library/outputTypeGuidance.js` | 35 | Generate/rewrite guidance |
| `api/summarize-source.js` | 12, 14, 23, 44 | Source-class prompt; L14 is a press-release dateline example |
| `api/summarize-source-usage.js` | 57 | Usage summary prompt |
| `lib/qc/pipeline-v4/prompts/stage2_v4.md` | 23, 25, 27, 29, 108, 114, 120 | Stage 2 system prompt |
| `lib/qc/pipeline-v4/prompts/stage2_v4_multipassage.md` | many | Widened matcher prompt |
| `lib/qc/pipeline-v4/prompts/stage2_v4_multipassage_shadow.md` | many | Shadow copy of the same |
| `lib/qc/pipeline-v4/prompts/stage5_v2.md` | 8, 9, 15, 16, 54, 57 | Stage 5 commentary prompt |
| `lib/qc/pipeline-v4/prompts/stage5_v1.md` | 46 | Unused-if-v2, still on disk |
| `lib/qc/pipeline-v4/stage1-extract-statements.mjs` | 25, 27, 28 | Stage 1 prompt |
| `lib/qc/pipeline-v3/stage1-extract-statements.mjs` | 15 | Legacy Stage 1 prompt |
| `lib/qc/pipeline-v3/stage2-match-sources.mjs` | 16, 36–39, 45 | Legacy Stage 2 prompt (L10/L354 failure strings are not prompts) |
| `lib/qc/pipeline-v3/stage5-generate-commentary.mjs` | 9, 11, 19 | Legacy Stage 5 prompt |
| `lib/qc/pipeline-v4/stage2-match-sources.mjs` | 53 | `DEFAULT_FAILURE_EXPLANATION` — not a prompt, a stored failure string |

Style-guide and rulebook hits that **show** an em-dash as the thing to replace are load-bearing. Do not strip those as a hygiene pass.

---

## SHIP VERIFIED

SHIP VERIFIED  4547577  main  26 files  169 tests
SHIP VERIFIED  (backend; this commit, printed in chat after `npm run verify:ship`)
