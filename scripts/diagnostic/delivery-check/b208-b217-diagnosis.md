# B208 to B217 diagnosis

Read-only. No product code changed in Part A. 18 Sep sweep: `live-2026-09-18-b196-sweep.md`, `export-v1.txt`.

## A1 B208. Which mechanism left Dealt with after the new Review

**Verdict: sources_agreed_kept (governance overlay). Not a B204 analysisRunId leak.** CONFIRMED.

### What the sweep did

S3 chose `18b_synth_cross_source_pair_update.txt` as the governing document. CONFIRMED `live-2026-09-18-b196-sweep.md` L38.

S4 accepted 380 to 412 and 142 to 167. CONFIRMED L47-48. Those writes put the draft onto the governing figures.

S5 rewrite kept 412 and 167 and merged them into one sentence: `At completion, Nordic SaaS Holdings served 412... 167 people...`. CONFIRMED `export-v1.txt` (the S6 draft).

S6 ran a new Review. One card still showed `Evidence Conflicting Dealt with` on that sentence. CONFIRMED sweep L82.

### Mechanism 1: B204 appliedDecisions keyed by analysisRunId

`cardGovernanceStatus` returns `dealt_with` when the statement id is in `appliedDecisions[analysisRunId]`. CONFIRMED `appliedDecisions.js` L30-40.

A new Review mints a new `analysisRunId`. Lookups for the old run do not apply. CONFIRMED L23-28 and StatementAnalysisPanel L893 `appliedRunId = analysisRunId || activeAnalysisRunId`.

S6 was a new `analyse-statements` call (sweep L80). HYPOTHESIS: that response carried a new run id. If it did, B204 store entries from S4 cannot paint S6 cards unless statement ids and the run id both leaked. No capture of the S6 run id exists in the sweep folder, so a leak is not CONFIRMED.

The S6 Dealt-with sentence is a rewrite merge of two previously accepted cards. Even a stale run id would need the new statement id to equal an old applied id. That is possible if ids are ordinals, but it is not the path the action-list code takes when a source ruling is in session.

### Mechanism 2: governanceStatusFromEntry / sources_agreed_kept

`governanceStatusFromEntry` returns `dealt_with` when the action-list evidence entry has `explainCode === "sources_agreed_kept"`. CONFIRMED `sourceGovernance.js` L71-73.

`applyDisagreementRuling` returns `sources_agreed_kept` when the reviewer has named the other source as governing and `disagreement.otherMatchesDraft` is true. CONFIRMED `conflict-engagement.mjs` L989-991.

S3 stored a session-scoped ruling that 18b governs. S6 still had those sources (export lists both). The 412 / 167 sentence now matches 18b, so `otherMatchesDraft` is true. The two sources still disagree with each other, so Stage 3 stays Conflicting. The overlay then marks the card Dealt with.

That is the mechanism that fits every captured fact: ruling still in session, sentence corrected onto the governing document, evidence still Conflicting, Dealt with still shown.

**B208 is not a B204 leak.** D3 of B204 (a new analysisRunId starts with none) can still be true. The Dealt-with badge after S6 is the source-governance overlay doing what it is written to do.

### What the card should say

`Dealt with` is the wrong phrase here. The reviewer did not accept a proposal on this new run. They answered "which document governs?" on the previous run, and the draft now agrees with that document.

Recommended copy, not built in this spec: keep the Conflicting evidence badge, and replace Dealt with with a line that names the ruling, for example "Matches the document you chose as governing." Needs attention can still drop that card, because the reviewer has already decided which figure wins. File as a new row if product wants that wording.

## A2 B209. PG demo scaffold reach and hardcoded identity

### When the scaffold is selected

`buildBasePrompt` always calls `buildPgWritingScaffold(eventType, visibility, ctx)`. CONFIRMED `lib/prompt-library/index.js` L54-59.

`buildPgWritingScaffold` returns a string only when `resolvePgWritingEventKey` matches and a template exists for that visibility. CONFIRMED `pg-writing-prompts.mjs` L269-274.

Event keys that select a scaffold:

| eventType in | resolved key | CONFIRMED |
| --- | --- | --- |
| `NEW_DIRECT_INVESTMENT` | `NEW_DIRECT_INVESTMENT` | L157-159 |
| `NEW_FUND_COMMITMENT` | `NEW_FUND_COMMITMENT` | L161-166 |
| `NEW_PRIMARY_COMMITMENT` | `NEW_FUND_COMMITMENT` | L163-166 |

Any other event type returns null. CONFIRMED L167.

Visibility: `COMPLETE` and `PUBLIC` each have a template per event key. CONFIRMED L141-149. `normalizeVisibility` maps unknown values to `COMPLETE`. CONFIRMED `output-intent.js` L64-69.

Output type does not select the scaffold. Every output type (reporting commentary, investor letter, press release, LinkedIn post) gets the PG block when the event and visibility match. Output-type guidance is prepended. CONFIRMED `index.js` L79-81.

Combinations that select a PG scaffold: 3 event keys x 2 visibilities x 4 output types = 24. All other event types use `styleGuideScaffold` instead.

### Who can reach it

Rewrite: yes. `api/rewrite.js` L705 `buildBasePrompt({ outputType, visibility, eventType })`. Assess default scenario is `NEW_DIRECT_INVESTMENT` (`useAssessState.jsx` L62), so production Assess rewrite hits the direct-investment scaffold. It does not pass `transactionDate` or `investment`. CONFIRMED rewrite L705 vs generate L693-700, which does pass those fields.

Generate: yes. `api/generate.js` L693-700, including date, investment, special instructions, and sources.

### Hardcoded real firm names in lib/prompt-library

`Partners Group` only, in `pg-writing-prompts.mjs`: L19 (twice in one bullet), L36, L42, L60, L84, L92, L93, L108, L120, L130. CONFIRMED by grep.

`Portfolio Support Group` at L117 is a value-creation example, not the house identity. Left as structure.

No person names in `lib/prompt-library`. CONFIRMED by read of that directory.

### Bracketed placeholders

Rendered when the field is missing: `[transaction date]` L238, `[investment name]` L241. CONFIRMED.

Rewrite on Assess does not send a date, so the prompt literally contains `[transaction date]`. That is the 18 Sep opening. CONFIRMED sweep L72 and rewrite L705.

## A3 B210, B211, B217. First-person rule ids

No S2/S6 analyse-statements JSON was captured on 18 Sep. Rule ids are taken from the note wording plus the rulebook, and from the 10 Sep F18 capture of the same note family.

### B210 (S2: third-person sentence flagged as first-person)

Note began: `The statement uses first-person plural 'In summary, the Company combines...' without identifying the authoring organisation.` CONFIRMED sweep L147. The quoted sentence has no first-person pronoun. CONFIRMED.

`first_person_plural` applies only to `reporting_commentary`. CONFIRMED `style-guide.mjs` L142. F18 was Investor letter. That rule is not in the prompt for this output type.

`voice_consistency` applies to all four output types, including `investor_letter`. CONFIRMED `editorialRules.js` L28-34. It carries `FIRST_PERSON_ACTOR_INSTRUCTION`. CONFIRMED L32-33.

The same note family on 10 Sep F18 is `concernCode: "voice_consistency"`. CONFIRMED `live-2026-09-10-f18-review.json` L1170-1171.

**Rule id behind B210: `voice_consistency`.** CONFIRMED by appliesTo plus note family. Not `first_person_plural`.

`first_person_plural` already has a deterministic drop when the cited span has no pronoun. CONFIRMED `editorial-compliance-reviewer.mjs` L948-957. `voice_consistency` has no such filter. CONFIRMED: only `first_person_plural` is in `STYLE_RULE_DETERMINISTIC_FILTERS` for pronouns.

### B211 (S6 export: `was attracted to` called first-person plural)

Editorial note: `The statement uses first-person plural 'was attracted to' without identifying the authoring organisation.` CONFIRMED `export-v1.txt` (Partners Group was attracted... block). Same note family as B210.

**Rule id behind B211: `voice_consistency`.** Same as B210. The cited span is a third-person verb. The worked example in `FIRST_PERSON_ACTOR_INSTRUCTION` is `"We were attracted to X" -> "{house} was attracted to X"` (`first-person-actor.mjs` L92). HYPOTHESIS: the model matched the example's right-hand side and labelled a third-person house sentence as first-person.

### B217 (S6 export: third-person told to use first-person)

Editorial note on `In Partners Group's base case, the company is expected...`: `The statement uses third-person ('the company is expected') instead of the first-person plural voice appropriate for an investor letter.` CONFIRMED `export-v1.txt` last statement.

That direction is the `voice_consistency` description itself: `Investor letters use first-person plural (we, our).` CONFIRMED `editorialRules.js` L32. The shared `FIRST_PERSON_ACTOR_INSTRUCTION` says the opposite when the output type requires third-person, and also says not to recast into `is expected to`. CONFIRMED `first-person-actor.mjs` L108-112.

**Same rule id: `voice_consistency`.** One prompt, two directives. S2/B210 followed the removal instruction. S6/B217 followed the investor-letter first-person instruction.

### Same rule as B182?

No. B182 is `first_person_plural` failing to fire on its reporting-commentary violation fixture. CONFIRMED BACKLOG B182.

Live F18 is investor letter, so `first_person_plural` is not applied. B197's question is answered: the live first-person hits are `voice_consistency`, not B182.

### Overlap with B93

Yes. `first_person_plural` (style, reporting commentary only, pronoun backstop) and `voice_consistency` (editorial, all output types, no pronoun backstop, first-person removal instruction shared) overlap on reporting commentary and fight each other on investor letter. CONFIRMED `first-person-actor.mjs` L1-3, L116-118, L136.

### Smallest honest fix (not built)

1. Do not attach `FIRST_PERSON_ACTOR_INSTRUCTION` to `voice_consistency` on output types whose house voice is first-person (investor letter, press release, LinkedIn).
2. Give `voice_consistency` the same pronoun backstop `first_person_plural` already has, so a third-person sentence cannot be labelled first-person.
3. Leave B182 as its own row: that rule still needs to fire on reporting commentary when a pronoun is present.

Do not merge the two rule ids. They apply to different output types and one of them is already filtered.

## C4 / C5 / C6 (supporting, used by Part B)

C4. Assess `currentVersion` hardcodes `versionNumber: 1`. CONFIRMED `useAssessState.jsx` L895-909. History reads `versions[].versionNumber` (`AssessVersionsPanel.jsx` L29-30). Export reads `currentVersion.versionNumber ?? 1` (`ExportModal.jsx` L52, L124).

C5. `api/export.js` L255-256 and L406-407 print `Total statements reviewed: ${review.total}` only.

C6. On Assess, New output calls `startNewReview()` then `window.location.reload()` with no confirm (`App.jsx` L219-223). Persist can save the live session onto the new review id before reload. Clear empties in place and does work (sweep L121-122). New output is meant to start a new output; it is not dead.
