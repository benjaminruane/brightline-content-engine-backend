# Brightline Content Engine — Master Roadmap

> **Vision:** Enable investment writers to produce, review, and govern institutional-grade content with speed, auditability, and confidence.

Last updated: 2026-08-31 (B140 shipped; B123 accepted-not-fixed; B141-B146 opened)

Next work: accept, reject or MODIFY per change (**Pr17**, operator decision 2026-08-31; mechanism not decided; also the answer to **B143**), then internal consistency in Review (**Pr16**), then Suggest stability floor (**B135**). The false-red arc is closed as accepted-not-fixed (**B123**).

---

## Working rules

### UI naming

- The app's **UI name** is **Content Engine** (working title). User-visible strings — footers, modals, disclaimers, exports, and other copy shown to reviewers — use **Content Engine** or no product name. **Brightline** does not appear in UI strings.
- **Brightline Content Engine** remains the **internal project name** (repos, roadmap, architecture docs, operator-facing material).

### Production baseline (post-R5)

- **Pipeline:** v4 in production.
- **Cost / call volume (baseline 2026-06-28):** ~16 LLM calls per run at 4 statements / 1 source; interactive Review production cost ~**$2/run**. **Diagnostic batch (separate):** full ~20-fixture batch ~**$25–30** total (~$1.25–1.50 per fixture) — flag before full-batch runs; prefer targeted `--only` subsets first.
- **Production baseline (deployment-verified 2026-06-28 via Vercel):** live deploy `b23-docsync` (commit `9ab91c1`, main). All editorial-cluster code shipped and live — B21, B22 / B22.1 / B22.2 (latest code ship `b22.2-editorial-excerpt-removal`); subsequent commits (B22-docsync, b23-docsync, docs-hygiene) are documentation-only. Frontend `v8.54.1-r6.13.1-writing-intent-wiring`.
- **Diagnostic re-run 2026-06-01** (batch `2026-06-01-122541`) confirmed in production that R6.3, R6.4 (incl. R6.4c jurisdiction-scope fix), and R6.5 landed: evidence layer strong (F18 cross-source aggregation resolved; no evidence regressions), editorial noise down, compliance jurisdiction miscalibration fixed. See `docs/diagnostic_rerun_findings_2026-06-01.md`.
- **Review-quality arc CLOSED 2026-08-21** (backend-only). Residuals in BACKLOG: **B61** (unblocked-but-not-built: store exists, wrong shape; do not treat as a blanket prerequisite, see **B83**), **B53b**, **B74**. **B62** / **B66** / **B68** parked. Arc-close tag: `review-quality-arc` (`7d5a9a3`).
- **Review-state persistence SHIPPED 2026-08-21.** Tags: `persist-review-state`, `review-state-cors-local`, `v8.71.0-review-state-restore`, `v8.72.0-review-state-cleanup`, `v8.73.0-review-state-no-blobs`, `v8.74.0-review-state-tidy`. **Accepted limitation (F16):** restored PDF/Office sources need re-upload before Review can run again. **Size-limit chapter 2026-08-22:** guard shipped (**F20** `v8.75.0-source-size-guard` + `3fce4fb`; **F21** `v8.76.0-size-message-wording`). Ceiling remains **B79** (OPEN, GUARDED). Blob storage **Pr14** deferred. Unblocked-but-not-built: **B9**, **B61**, **Pr13**. Persistence questions (storage location/jurisdiction, user accounts, retention) remain OPEN.
- **Pr9 rewrite-correctness SHIPPED 2026-08-23.** Tags: `pr9-claim-spans` (`d8ab2df`), `pr9-soften-or-cut` (`0cd76a5`), `pr9-marker-intent` (`00cce35`), `pr9-cut-punctuation` (`71500c4`). Together they fixed a revision that could attach a note claiming a removal to text it left untouched, reproduced 3/3 on the production sentence. Residuals still open: **B80**, **B81**. Honesty repair-policy follow-on **B119** shipped 2026-08-27 (`ade84fc`). **Superseded in part 2026-08-29 (Revise arc):** the soften and cut branches of `pr9-soften-or-cut` were removed when the silence rule reversed. Keep-and-flag is now the only branch on silence. See **Recently shipped → Revise arc**. **Pr15** closed 2026-08-24 (Meridian re-run; flow holds). Harness caveat: **P15**. Narrative Claude project docs for this arc live outside the GitHub tree (sync does not carry `claude/*`); in-repo record is this ROADMAP section and BACKLOG Closed **Pr9-correctness**.
- **False-green arc CLOSED 2026-08-27.** All six known Stage 2 false-green shapes fixed in production. R3a (`stage2-rewrite-r3a`, `7ff4aa4`) fixed five; R10 (`stage2-basis-conflict-r10`, `971370f`) fixed the sixth (eval-ablation EA_E3 mark-as-return on `meridian_source.txt`; not claim-spans CS_E3; not corpus E3:S0:ic_memo). Production verify: R3a `72f61aa`; R10 `baed6ed` / `r10-production-verify.md` (mark card conflict / high). Percent extraction fix `1581bb8` (closes **B111**; zero corpus verdict changes). Prompt hash pin + rule-level assertions: `7c3cfaa`, updated on R10 ship. Fixture 93 and MF01-MF10 probe set created for basis / passage work. **Accepted costs (not unknown):** nordholt-dirty S5 (**B116**); F18_S7 (**B117**, instance of **B115**); F92_S0 (**B110**). Open residual: **B115** resized (do not quote the 25% absolute NONE rate as the defect size; real attention failures ~1.5% to 4.5% of figure-bearing pairs; `passage-correspondence-baseline.md` `4caf1d1`). **B48 landmine:** do not add MOIC multiples to the magnitude backstop without a corresponding-passage check. Open uncertainty (**B118**): Meridian draft statement 7 ("On balance, we believe the fund should deliver returns") flipped not_supported/high (R3a verify) to supported_partial/moderate (R10 verify); one run vs one run; not a known regression.
- **Stage 2 rewrite R3a SHIPPED 2026-08-26.** Tag: `stage2-rewrite-r3a` (`7ff4aa4`). Five proven false greens fixed. Residuals after this arc: **B108** (R4 measured PARTIAL, not shipped), **B110**/**B116**/**B117** (accepted costs), **B112**-**B115**, **B118**. **B109** closed by R10; **B111** closed by `1581bb8`.
- **Stage 2 basis-conflict R10 SHIPPED 2026-08-27.** Live `lib/qc/pipeline-v4/prompts/stage2_v4.md` is R10 (trimmed len 14259, promptHash `44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1`). Tag: `stage2-basis-conflict-r10` (`971370f`). Quantity-scoped basis limb: returned/realised/distributed versus marked/valued/carried/unrealised conflicts only when quantities match; magnitude route untouched. Graded gate `8dc6be7`; corpus blast `ce3d85e` (20/378 moved). Production verify `baed6ed`. Recovered nordholt-dirty S1 (press release) and F18_S3. F18_S7 accepted as **B117**.
- **Revise arc CLOSED 2026-08-29. Silence protects the claim, not first-person voice.** The governing rule reversed: where a source is **silent or vague** on what the draft asserts, the **claim** is left as written and flagged; the author decides. **B134 shipped 2026-08-30** (`revise-style-carve-out`, `c0e1482` feat / `ef6bdbc` test / `6c05d9b` gate): one permitted operation replaces we/our/us with the named authoring organisation; hedges and actor stay. Confirmed LIVE x3 on Production Meridian. Silence is the absence of evidence, not evidence against the claim. Deterministic whole-sentence removal and the soften-and-cut branches no longer run (`api/suggest-revision.js` passes `deterministicUnsupportedRemoval: false`). **B138 shipped 2026-08-30** (`b138-silent-card-withhold`, feat `4baffc4` / test `ac618b1`): on `no_support` cards, `collectEditorialConcerns` copies only first-person actor rules into the reviser; the card still shows the withheld flag. Closes the Production causal-soften silence breach without a prompt change. Confirmed LIVE x2. **B139 shipped 2026-08-30** (`b139-hyperbole-reconciliation`): text reconciliation only — `hyperbole_vs_qualitative` is no longer an entire-draft Suggest obligation; do not cite as a measured change in what Suggest does. Falsifier fired once and is RESOLVED AS FLAP (deleted, retained, deleted across three live runs). **B140 shipped 2026-08-31** (`b140-kept-honesty-confine`, `c469fac`): KEPT-only confine of the honesty region to the marker's own sentence. Gate was NOT vacuous. LIVE x1, both halves. **Marker honesty:** the note's what-clause is now generated from the **real diff** rather than the model's prose (`7399333`), with unreported changes marked (`fc25060`), a concern-reason fallback (`bf9d9e8`), and the evidence flag kept when a sentence is also edited (`a5be4f0`). Residual: intent is still model-authored (**B80**, labelling residual, seen live x3 in both directions; not **B140**). **Author identity:** the authoring organisation is no longer mistaken for a third party (`b55ab00`), narrowed at `3122708` with a different-actor refusal and an author-anchor fallback, guarded by `tests/author-name-blindness-guard.test.mjs`. **Corpus re-baselined at `3122708`** — `gpt-4o-2024-08-06`, 29 cases, 296 statements, 360 pairs, prompt sha `44847c61b07b`, recorded as `corpusBaseline` in `scripts/diagnostic/fingerprint-manifest.json`. **The baseline is a SET of three fingerprints, not one**, because a single 360-call run spans all three concurrently; compare against the set. **Cost measurement corrected (`1560579`):** caching was already active at a 97% hit rate; cached tokens were being discarded and every input token billed at full rate, and `gpt-5.1` had no price entry, so **every reviser cost reported before that commit was zero and is wrong, not imprecise** (Closed **B3**). **Per-statement rebuild ABANDONED on evidence** (**B130**). **B122 closed 2026-08-30** (the ~7 in 10 follow-rate was a scorer artefact plus Review defects plus silence beating craft; split to **B131**-**B133** and **B134**, now shipped). Still open from this arc: **B123** F02:S6 ACCEPTED AND NOT FIXED at overlay and at Stage 2 (still live for a user; no fix coming; falsifier a second live false red of that shape; reopening condition in `claude/evidence-model-limits.md`), **B137** tokeniser hygiene (net negative alone and does not combine with B123), **B98** revision-layer instability (note-wording framing contradicted by one cell; superseded by **B135**), **B135** stability floor, **B136** directive-vs-evidence principle (parent of **B131**, deferred **B132**, shipped **B138**; do not bundle). Next three pieces of work: **Pr17**, **Pr16**, **B135**.

---

## Completed

### Core Platform
- Generate, Rewrite, Adapt, Ask AI, Version History workflows
- Frontend/backend separation and clean repo naming
- Modularised UI: Draft Output, Sources, Versions, Ask AI, Rewrite panels
- `useDraftState` core hook with in-memory version model
- Auto-scroll, loading states, fade-in animations

### QC Pipeline — Three-Signal Framework
- Evidence QC: deterministic pipeline, statement extraction, evidence binding, support/conflict/unverifiable verdicts
- Editorial review: `gpt-4o`, temp 0 — precision, materiality, narrative coherence, register, overreach, structural integrity, audience calibration, house style
- Compliance review: `gpt-4o`, temp 0 — calibrated to output type and required version
- Parallel execution per statement; all statements parallelised
- Signal strip on each QC card with badges, concern notes, direction
- Worst-signal border logic driving card left border colour
- Review options popup: Evidence, Editorial, Compliance independently toggleable per run
- Pipeline v4 rebuild (R2.1–R3.6.1): ground-up replacement of the v3 evidence pipeline addressing the original Evidence Pipeline Quality Sprint items. Stages 1–5 owned by v4 modules; Editorial+Style consolidated into one call; Compliance separate; rule-based suppression of duplicate editorial concerns on conflicts; PDF source extraction; Visibility wiring; aligned summary blocks and pill logic. Sentence fragmentation, false `not_supported` verdicts, excerpt-quality issues, and subclaim atomisation corruption all resolved by architectural redesign rather than patching v3.

### Output Types & Adaptation
- Four output types: Reporting commentary, Investor letter, Press release, LinkedIn post
- Two required versions: Complete, Public
- Adapt flow: format-aware prompt per target type, direction-aware guidance
- **Assess (A10):** Adapt live — modal + `handleAdapt` in `useAssessState`; labelled version-timeline entries; Review on adapted drafts with full QC cards (no master-only banner). `/api/adapt` unchanged.
- Writing route: tabbed presentation of master + adaptations in Draft Output panel (route off/dead; consolidation deferred — **A11.3**)
- Version History unified across output types with grouped collapsible sections
- Output type prompt scaffolding: LP salutation, narrative arc, press release structure, LinkedIn first-person voice
- PDF source text extraction in adapt pipeline (`prepareUploadedSourcesForPipeline`)
- Conditional Adapt modal fields: press release quote attribution, LinkedIn post URL
- Required version pre-selection and locking per output type

### Writing Setup
- Event type selection (9 types)
- Banned words: prevention layer (injected into generate/rewrite/QC prompts) + detection layer (QC-stage scan); stored in localStorage
- Banned word highlights rendered as priority layer in Draft Context view
- Deal information fields: Investment name, Program/Mandate/Product name, Reference date, Transaction date — stored in session meta, not injected into prompts

### Version History
- Vertical timeline with LLM-synthesised change labels
- Expandable diffs
- Save draft (local checkpoint) vs Save as new version (formal commit)
- Adapted versions labelled with source version reference
- Version History unified across output types

### Export
- PDF and DOCX export
- Cover/header with output type, required version, word count, date
- Deal metadata in header (non-empty fields only)
- Draft text with meta
- Sources Used section
- Statement Review: verdict, evidence finding, excerpt, editorial note, compliance note — flat mapped, no raw QC objects
- PDF stack overflow resolved via full payload serialisation and footer removal
- Document title derived from session metadata

### Source Management
- LLM-generated source description on upload
- Source type detection (PDF, text, URL)
- Source text extraction pipeline (`lib/extract-text-from-source.mjs`)
- Assess module: paste/upload draft, run QC, reviewer synthesis in senior editor voice
- Reviewer Assessment in Quality Review panel (Writing view), Assess export, config panel aligned with Document Setup

### Backend Architecture
- LLM-last architecture: verdict, classification, and concern level deterministic; LLM commentary runs after
- `StatementReviewCard`, `statementAnalysisHelpers.js`, `qcWorkbenchFilters.js` extracted
- `qc-v2-pipeline.mjs` split into focused modules

---

## Recently shipped (closed specs)

### Revise arc (closed 2026-08-29)

Backend-only. The arc that decided what Suggest is allowed to do without being asked.

**The governing rule reversed: silence protects the claim.** Where a source is silent or vague on what the draft asserts, Revise leaves the **claim** exactly as written and flags it. It does not soften it, drop the figure, cut the clause, or substitute a different fact. Silence is the absence of evidence, not evidence against the claim, and the author decides what to do about the claim (`build-revision-prompt.mjs` rule (b)). **B134 (`revise-style-carve-out`, 2026-08-30)** amended that definition: one operation is permitted on a silent card when a craft or style_guide direction names it — replace we/our/us with the named authoring organisation as grammatical subject; hedges preserved; actor preserved. Deterministic whole-sentence removal and the soften-and-cut branches no longer run; `api/suggest-revision.js` passes `deterministicUnsupportedRemoval: false` at both call sites. This supersedes the soften-or-cut description in **Pr9 rewrite-correctness** below.

**Marker honesty.** A note's what-clause is now generated from the real diff instead of the model's prose (`7399333`), which closes the false-note class and one instance of **P20**. Changes the model made but never reported now get markers (`fc25060`); a missing separable reason falls back to the concern's own (`bf9d9e8`); the evidence flag survives a sentence that is also edited, cosmetic changes are skipped by shape, and the author stopped being treated as a third party (`a5be4f0`). **B140** (`b140-kept-honesty-confine`, `c469fac`) confines the KEPT honesty region to the marker's own sentence. Residual: intent is still model-authored, so a clause-cut can still be labelled CHANGED (**B80**, labelling residual, not the B140 comparator lie). LEFT leak **B141**. Generic note **B142**.

**The author is not a third party.** Swept every site reasoning about named entities (`b55ab00`) and narrowed at `3122708` with two deterministic rules: refuse confirmation when the passage names a different organisation performing the anchored relation, and fall back to the author as anchor where it is the only name in the statement. Guarded by `tests/author-name-blindness-guard.test.mjs`, which flags a new Title-Case regex in `lib/` unless the site calls `isAuthoringOrganisationName` or carries an `AUTHOR-NAME-BLIND:` declaration.

**Corpus re-baselined at `3122708`.** `gpt-4o-2024-08-06`, 29 cases, 296 statements, 360 pairs, prompt sha `44847c61b07b`; recorded as `corpusBaseline` in `scripts/diagnostic/fingerprint-manifest.json`. **The baseline is a SET of three fingerprints, not one** — a single 360-call run spans all three concurrently, so compare against the set, not a value. Distinct from the claim-spans baseline, which is untouched and still stale (**B114**).

**Cost measurement corrected (`1560579`).** Prompt caching turned out to be already active at a 97% hit rate with no opt-in needed; the real gap was that cached tokens were discarded and every input token billed at full rate, and `gpt-5.1` had no price entry at all. Consequence: every reviser cost this project reported before that commit was **zero**, so any historical figure for `writing-rewrite`, `generate`, `adapt` or `ask` is wrong rather than imprecise. Closes **B3** as a correction.

**Per-statement revision ABANDONED on evidence (`2528a32`, recorded as **B130**).** Deliberately abandoned, not failed and not deferred. Its case was measured away in three stages: the equity cheque left scope once silence stopped being editable, conflicts turned out to be handled identically by both paths, and directives came back level across 14 cases (29 of 42 whole-draft against 30 of 42 per-statement). Stage 1 remains behind `body.perStatementRevise`, off in production, costing nothing. If revived it retains run-to-run determinism, a structural rather than requested guarantee on silence, and lower cost.

**B122 CLOSED 2026-08-30.** Opened as "an editorial instruction naming an exact span is followed about seven times in ten, cause unknown". Every clause of that was wrong. Passes: instrument `0d12440`, scorer+re-score `235def4` / `4f88ad2` / `ee170f7`, residual adjudication `cf32a76`. What the 29 of 42 was made of: 3 cells the scorer could not register (`structural_integrity` followed 3 of 3, verbatim); 3 cells the scorer credited the wrong directive; 6 cells Review emitted two directives that cannot both be satisfied (**B131**); 3 cells Review emitted a wrong directive and Suggest obeyed it (**B132**); the rest silence-never-edits beating craft on a mixed card (**B134**, now shipped). Operator observation 2026-08-31: the two scorer errors pointed in opposite directions and nearly cancelled, so the headline looked stable and meant nothing. Apostrophe truncation of `note_quote` spans is **B133** (cosmetic; evidence spans are a separate path). Protect from **P29**: `author-confusion-sweep.json`, `b122-rescore.json`, `b134-carve-out-gate.json`, `directive-follow-scorer.mjs`, `tests/directive-follow-scorer.test.mjs`, `scripts/diagnostic/lib/suggest-call-record.mjs`, `scripts/diagnostic/anchor-fix-corpus.json`, `scripts/diagnostic/anchor-window-replay.mjs`, `scripts/diagnostic/revise/b132-voice-false-positive.mjs`.

**B134 SHIPPED 2026-08-30** at tag `revise-style-carve-out` (`c0e1482` feat, `ef6bdbc` test, `6c05d9b` gate). Silence protects the claim, not first-person voice. One permitted operation: replace we/our/us with the named authoring organisation, hedges preserved, actor preserved. B134 changed silence to protect the claim rather than first-person voice. It shipped on coherence: the prompt had been giving Suggest contradictory instructions on the same statement. The only same-process comparison of the amendment was 3 of 3 against 3 of 3. Do not cite B134 as a measured improvement in directive follow. Shipped on a VACUOUS gate: the reference arm was also 3 of 3 on the primary, and the coverage-gap S5 blocking control read 0 of 3 against 0 of 3 on a cell known to flap, so it discriminated nothing. Confirmed LIVE x3 on Production Meridian.

**B138 SHIPPED 2026-08-30** at tag `b138-silent-card-withhold` (feat `4baffc4`, test `ac618b1`). Withhold, do not suppress. On silent cards (`resolveEvidenceKind` → `no_support`), `collectEditorialConcerns` copies only `voice_consistency` and `first_person_plural` into the reviser prompt. Every other editorial/style concern stays on the card and is omitted from Suggest. No prompt change. No Review change. Gate: PRIMARY coverage-gap S5 `overreach_unsupported_causal` absent from the built prompt; 13 locks including B134's silent closer; card still carries the withheld flag. 1 of 14 stored directives withheld. Confirmed LIVE x2 on Production Meridian.

**B139 SHIPPED 2026-08-30** at tag `b139-hyperbole-reconciliation` (feat `e2277d7`, test `6e6f5ee`). B139 reconciled two contradictory instructions in the reviser prompt: the silence rule forbade deleting evaluative language on an unsupported sentence while house style required it across the whole draft. The gate was a text assertion. No behavioural evidence was gathered, and none exists either way. Do not cite B139 as a measured change in what Suggest does. Suggest-only drop of `hyperbole_vs_qualitative` from the entire-draft obligation; Review unchanged. Formatting rules stay global; assertion-changing rules do not. Falsifier fired once and is RESOLVED AS FLAP: deleted, retained, deleted across three live Production Meridian runs. Operator observation 2026-08-31. Not over-scoped.

**B140 SHIPPED 2026-08-31** at tag `b140-kept-honesty-confine` (`c469fac`). KEPT-only: `applyMarkerHonestyCheck` confines the honesty region to the marker's own sentence so a neighbour-sentence edit no longer makes a byte-identical KEPT span look rewritten. The gate was NOT vacuous: the new test was shown failing on the reference code first, and exactly one of eight stored rows flipped, the predicted one. LIVE x1, both halves. Out of scope on purpose: **B141** (LEFT leak) and **B142** (generic note). Distinct from **B80**.

**Open from this arc:** **B123** F02:S6 ACCEPTED AND NOT FIXED at the overlay AND at Stage 2. Not closed as done. Not left open as pending. The bug is still live for a user and there is no fix coming. Evidence format is one contiguous quote capped at 400 characters; F02's two facts sit 952 characters apart. Entity-omission already live in `stage2_v4.md` L156-158 and did not fire (definitional absorption). Seven overlay approaches are dead; the last one never worked (`investments` contains `invest`). 29 of 360 quotes are corresponding-but-incomplete; exactly one produces a user-visible false red of this shape. Falsifier: a second live false red of that shape. Reopening condition: `claude/evidence-model-limits.md`. Sibling of **B115** (figure correspondence, R10 SOME); B123 is figure ALL and incomplete for a NAME. Do not fold them. **B137** is net negative alone and does not combine; do not treat B137 and B123 as separable. **B98** revision-layer instability — quantified at 8 of 10 cards on one unchanged Review and generated in the revision layer, but the "almost entirely note wording" framing is contradicted by one cell and superseded by **B135**. New Review rows from the B122 split: **B131** contradictory `suggestedDirection` pair (cross-link **Pr16**; 1 of 2 multi-directive statements in stored review output, 1 of 36 statements; production occurrence not established), **B132** DEFERRED (fixture-only; three live runs, never seen; on every one the `voice_consistency` raise was CORRECT; fix is free, unblocking is not), **B133** `note_quote` apostrophe truncation (1 of 17 `note_quote` spans; evidence spans are a separate path). **B135** measured stability floor for Suggest (not urgent; ~$0.70/week). **B136** unscoped principle: a style directive should never reach Suggest on a card where the evidence rule forbids the edit (parent of **B131**, deferred **B132**, shipped **B138**; do not bundle). New from the 2026-08-31 Meridian runs: **B141** LEFT leak (2 of 8 stored rows; whole-draft substring test rejected; operator observation: not seen across three production runs of the Meridian fixture, 2026-08-30 and 2026-08-31), **B142** generic honesty note (cosmetic; repair fires correctly, replacement text is wrong; do not touch while B140 is one run old), **B143** "run until clean" does not converge (change nothing in Review; answer is **Pr17**), **B144** unsourced attribution of motivation (RECORDED; not to be built or billed; not B113; operator observation 2026-08-31: an earlier write-up had the direction backwards), **B145** serial comma flips Stage 1b prefilter (cost lever), **B146** function-word corroboration anchors (108 of 355 absent from snippet; free to size; do not propose a fix in the same pass). New hygiene: **B124**-**B126**, **B137**, **P29** (ten files protected), **P30**. Next three pieces of work: **Pr17** accept, reject or MODIFY per change (operator decision 2026-08-31; mechanism not decided; also the answer to **B143**), **Pr16** internal consistency in Review (Ben, must-have; after Pr17), **B135** Suggest stability floor.


### Review-layer chapter (closed 2026-08-24)

Backend-only. Named-actor follow-on ships verified against git: `review-actor-supply` (`9285e95`), `review-direction-bound` (`eef3f3c`), `review-view-marker-subject` (`a448e18`), `review-direction-actionable` (`5ff7ced`). `review-hype-repair` had shipped by the earlier Meridian reconcile (`02a0212`); it is closed, not left open.

**First-person removal names the actor** (shipped 2026-08-24). `first_person_plural` (style_guide) and `voice_consistency` (editorial) share one substitution contract: replace we/our/us with the named authoring organisation as the grammatical subject; never recast into an agentless or passive construction; preserve every hedge. Fixes a live defect where a style rule could strip the owner from a forward-looking return statement, turning a hedged opinion into an unattributed institutional prediction. Observed identically across two production runs on the same draft. The actor is identified only when a known house name already appears in the draft; otherwise the concern is raised and the first person is left in place. Targeted harness: `scripts/diagnostic/first-person-actor-harness.mjs`. Tag: `review-first-person-actor` (`63de82f`). Meridian re-run 2026-08-24: live cards took the fallback path because the production default was a real firm that was not in the draft. Closed by `review-actor-supply` (`9285e95`) / **BACKLOG B86**. Remaining supply gaps: **B95**, **B96**.

**Authoring organisation is configuration** (shipped 2026-08-24). `AUTHORING_ORGANISATION` env var rather than a hardcoded one-entry list. Production default was a real firm (`Partners Group`). Synthetic fixtures and the first-person harness identify as **Halden Group**. Tag: `review-actor-config` (`cc69abc`). Follow-on: **B86** / `review-actor-supply` (`9285e95`) removed the real-firm default. Deployed env is now the fixture name (**B96**).

**Authoring organisation must be supplied** (shipped 2026-08-24). Diagnosis inverted the fix. There was no detection. The resolver read an env var, fell back to the constant "Partners Group", and then tested whether that already-chosen name appeared in the draft. Unset env meant every production review assumed a real firm, and the named-actor path fired only on a draft containing that firm's name. The substitution inserts the CONFIGURED name, never a name read out of the draft, so the presence check is safety, not identification. Do not loosen it. Default is now null. Request body `authoringOrganisation`, then `AUTHORING_ORGANISATION`, then null. Tag: `review-actor-supply` (`9285e95`). Closes **BACKLOG B86**. Residues: request-body path never executed (**B95**); Production and Preview env is Halden Group (**B96**).

**Real published press releases keep the real house name** (shipped 2026-08-24). Follow-on to actor-config: fixtures 02 and 03 restored to the real house. Real-versus-invented principle recorded in `scripts/diagnostic/README.md`. Tag: `fixtures-real-vs-invented` (`2f5f403`).

**View-marker delete vs convert** (shipped 2026-08-24). A parenthetical view-marker is deleted when the sentence subject is already the named actor, and converted when it is not. Tag: `review-view-marker` (`bd45d08`). Follow-on: `review-view-marker-subject`.

**View-marker subject is tested after first-person substitution** (shipped 2026-08-24). The delete-versus-convert rule lived only in the prompt, which already said to apply the test after the first-person substitution. The model scored the original sentence, where the subject was still "We", and converted where it should have deleted. Now backstopped deterministically: if substituting We/we will make the authoring organisation the grammatical subject, a parenthetical view-marker is deleted, not converted. Tag: `review-view-marker-subject` (`a448e18`). Added straight to Closed; was never an open backlog row.

**Unsupported evaluative language is deleted** (shipped 2026-08-24). `marketing_language_excess` and `hyperbole_vs_qualitative` no longer substitute a milder word. Same laundering shape as approximating an unsupported figure. Tag: `review-hype-delete` (`63c359f`).

**Evaluative-deletion directions state the resulting phrase** (shipped 2026-08-24). Literal application must not leave stranded scaffolding. Tag: `review-hype-repair` (`02a0212`). Follow-on: **B87** / `review-direction-bound` discards a restatement that re-authors the sentence.

**A Delete restatement that re-authors the sentence is discarded** (shipped 2026-08-24). After the model writes the resulting phrase, code compares it to the clause minus the deleted span. Whitespace collapse, orphan punctuation, and a Levenshtein budget of 2. Anything further is replaced by the refusal form. The bound discriminates correctly: it discarded a restatement that re-authored most of a sentence, and passed a short correct one through untouched, in the same run. Tag: `review-direction-bound` (`eef3f3c`). Residues closed by `review-direction-actionable`.

**A discarded restatement falls back to an actionable instruction** (shipped 2026-08-25). Verified on a production run: "a track record that is, in our view, genuinely exceptional" became "its track record". Hype word deleted, no milder substitute, view marker deleted, nothing stranded. The fix was three causes, not one: the actionable refusal form; a live note leak (`gatherConcerns` passes both `note` and `suggestedDirection`); and a soften-kind instruction telling the reviser to leave wording unchanged. All three in one commit. The attribution is still clean: actor resolved plus inert form, phrase survived; actor resolved plus actionable form, phrase gone. Tag: `review-direction-actionable` (`5ff7ced`). Closes **BACKLOG B87**.

**Statement-level unsupported span (B88), shipped behind a flag 2026-08-25. Value needs re-assessment.** Spans exist only when `QC_STAGE2_SPAN` is ON; that flag also governs the reviser wire. The original evidence base is stale: assessed against verdicts that have since changed under R3a and R10, and Review now emits plain-language reasoning that names the specific problem (the input the reviser was shown to act on). Do not treat B88 as parked or as a settled win; re-measure before investing further. Sequence of tags:

- `review-stage2-span` (`04f4779`): appended-prompt span. SUPERSEDED and removed from the tree; recoverable at the tag only.
- `review-span-two-step` (`76032fc`): two-step span elicitation after Stage 2 classification. Gate: zero pair and card verdict deltas.
- `review-span-on-card` (`2d1edd3`): additive `qcCard.unsupportedSpans` passthrough at Stage 7.
- `review-span-wired` (`e6bee3a`): `gatherConcerns` / `formatConcernsBlock` name validated shorter spans on the statement-level Evidence gap block; whole-statement spans suppressed; one-sentence reviser hint. No second flag.
- `review-span-wired-gate` (`26145a3`): three-fixture, three-repeat revision measurement. Report only; no automatic pass/fail.

**Coverage-union (2026-08-25). UNEXERCISED.** `review-coverage-diagnostic` (`a5a8bef`) measured the candidate population at zero on this corpus. `review-coverage-union` (`ec639b7`) ships the promotion behind `QC_MULTISOURCE_COVERAGE` (inert unless `QC_STAGE2_SPAN` is also ON). Gate: zero promotions. Built on a premise that was refuted (jointly covered multi-source demos are already greened by any-confirmed-wins). Record as UNEXERCISED, not as working and not as disproven.

**Invented fixture 04 no longer names real partners** (shipped 2026-08-24). `04_synth_vc_pinterest_style_memo` From-line is Nathan Calder / Helen Rusk. Same principle as the house-name rule, applied to individuals. Commit: `acdfcb8`. Closes **BACKLOG P17**.

**Pr15 narrative flow CLOSED 2026-08-24 and stays closed.** The Meridian draft was taken through Review, Suggest revision, then Review again. The revised draft was read. The flow holds. Contributing rules were `first_person_plural` and `marketing_language_excess`, both addressed in this chapter. Subsequent re-runs after this close were about the named-actor path, not narrative flow. Mechanical residual **B87** is now closed (`review-direction-actionable`, `5ff7ced`); that was never a reason to reopen Pr15.

**Still open from this chapter and chapter five:** **B104** (decomposition does not improve verdicts; 32 decompositions, zero verdict changes; B53a earns its place on the revision side), **B105** (corpus almost entirely single-source; blocks measuring multi-source mechanisms), **B106** (unsupported region is not always contiguous; one-span-per-pair model; observed floor 2 of 57), **B107** (QUESTION: `aggregateVerdict` is any-confirmed-wins; a confirming source may outrank a conflicting one on the same statement; not investigated), **B97** (fallback direction contaminates unrelated edits), **B98** (revision layer unstable run to run; note-wording framing contradicted by one cell, superseded by **B135**), **B99** (editorial reviewer files concerns against the wrong statement), **B100** (a missing authoring-organisation resolution log, b missing editorial concern count; c closed as not a defect: Stage 2 fingerprint is OpenAI `system_fingerprint`, not in the LLM cache key), **B101** (database failure path not graceful), **B102** (`em_dash` false positive on a hyphen), **B103** (local development environment broken), **B92** (contradictory findings: downgraded; trust problem; durable fix is an output check), **B93** (rule taxonomy overlap; `hyperbole_vs_qualitative` routes to CRAFT, `marketing_language_excess` to SOFTEN; separate from **B61** before B61 is scoped), **B82** (routing keys off a model-authored verb; LATENT; the marketing special case is a guard, not a trap), **B94** (first-person-actor harness score is soft), **B95** (request-body supply never executed), **B96** (`AUTHORING_ORGANISATION` is Halden Group in Production and Preview), **B83** (editorial-layer instability; refines **B61**; part of the 4 of 10 is **B93**), **B85** (fixture 01 is a temporal hybrid), **B89** (supportSpans classification mislabel; priority M; R10 mark card is the live exhibit), **B90** / **B91** (B91 intermittent), **P16** / **P18** / **P19** / **P20** / **P21** / **P22** / **P23** / **P24** / **P25** / **P26** / **P27** / **P28** (standing process rules). **B84** closed with the false-green arc. **B87** closed. **B88** shipped behind `QC_STAGE2_SPAN` and needs value re-assessment after R3a/R10. Route A of **B84** closed earlier by `review-upgrade-off`. **Pr15** stays closed. **B9** unchanged: acting on a finding and acting on an edit are two different workflows; B9 as scoped covers only the first.

### Pr9 rewrite-correctness (closed 2026-08-23)

Follow-on to the original Pr9 ship (2026-08-14). Backend-only. Together these four tags fixed a revision that could attach a note claiming a removal to text it left untouched, reproduced 3/3 on the production sentence.

- **`pr9-claim-spans` (`d8ab2df`)** — `gatherConcerns` emits per-claim evidence spans when a card is decomposed, so mixed sentences are unambiguous.
- **`pr9-soften-or-cut` (`0cd76a5`)** — one test on an unsupported figure: SOFTEN, CUT THE CLAUSE, or keep-and-flag the whole sentence. Never approximate the author's unsupported figure. **SUPERSEDED 2026-08-29 — this no longer describes the product.** The SOFTEN and CUT branches were removed when the silence rule reversed. On silence, keep-and-flag is the default: the **claim** is left as written. **B134** later permitted one first-person subject replacement on a silent card. Retained here as the historical record of what `0cd76a5` shipped. See **Recently shipped → Revise arc**.
- **`pr9-marker-intent` (`00cce35`)** — markers declare CHANGED / KEPT / CUT. Deterministic honesty check. Missing or unrecognised intent is malformed.
- **`pr9-cut-punctuation` (`71500c4`)** — deletions-only punctuation tidy after a clause cut, with marker offsets remapped.

**Process (BACKLOG P15):** the Pr9 marker harness measures honesty, not correctness. Three separate faults passed it clean with perfectly consistent notes: an invented figure, meaningless filler, and a malformed sentence. Any future Pr9 change must be judged by inspecting quoted output rather than the cross-tabulation.

**Still open:** **B80** (a clause-cut can be labelled CHANGED rather than CUT), **B81** (punctuation pass does not repair stranded prepositions, articles, verbs, or connectives). **Shipped follow-on:** **B119** (`ade84fc`) repair-policy fix so honesty does not clobber accurate notes on wrong remnants and flips intent to KEPT when the span is unchanged. **Pr15** closed 2026-08-24 (Meridian re-run; flow holds). **B9** reframe: acting on a finding and acting on an edit are two different workflows; B9 as scoped covers only the first; the chapter's first question is where in the flow the human makes each decision, not how accept and reject work on a card.

Narrative Claude project docs for this arc live outside the GitHub tree (sync does not carry `claude/*`). See **BACKLOG Pr9-correctness** (closed), **B119** (shipped), **B80**, **B81**, **P15**, **Pr15** (closed), **B9**.

### Review-quality arc (CLOSED 2026-08-21)

The review-quality arc is **CLOSED**. It ran 19-21 August 2026, backend-only: no frontend commit after `review-card-density` (18 August). The work was to stop Review from contradicting itself on figures that are not the same thing, and to let compound sentences confirm when every piece of the sentence is actually supported.

What landed: claim spans with an upgrade-only rollup so one card can go from partial to confirmed without inventing extra cards; spelled-out numbers and mid-sentence names as claim anchors; money and percent figures scoped to a metric (and money also to currency and scale), so `$155m` revenue is not forced against EUR 155 million ARR, and a gross margin is not forced against an EBITDA margin; periods that do not overlap cannot conflict; Stage 1b copies claims verbatim instead of rewriting them; unevidenced superlatives ("record", "highest") surface as editorial only. An in-process LLM cache cuts repeat-run cost inside one serverless instance; a disk cache exists for local diagnostics only. A dash-splitter change is insurance for the fallback path, not a live Stage 1 fix (**B75**).

Parked rather than built: **B62** and **B66** (widening the claim-span funnel produced no additional upgrades); **B68** (logged, not building). Still open: **B61** (residual `hasConflict` drift; store now exists but is the wrong shape; do not treat as a blanket prerequisite, see **B83**), **B53b** (compound supersession), **B74** (Stage 1 bullet-marker text variance). Per-item tags remain in the sections below and in BACKLOG Closed. Arc-close tag: `review-quality-arc` (`7d5a9a3`).

### Review-state persistence (closed 2026-08-21)

Durable Neon store plus frontend autosave/restore of the in-progress review. One active review per browser. Not a library of past reviews.

- **Backend store** — `GET` / `POST` / `DELETE` `/api/review-state`. Autosave buffer (overwrite is correct), not an audit record. Tag: `persist-review-state` (`8af163d`; store commit `efccb11`).
- **Localhost CORS** on that route only. Tag: `review-state-cors-local` (`c5ff204`).
- **Frontend restore** — debounce 2s autosave, silent hydrate on refresh. Tag: `v8.71.0-review-state-restore`.
- **Abandoned-row delete** on New output. Tag: `v8.72.0-review-state-cleanup`.
- **No raw file bytes in the snapshot.** `contentBase64` dropped; a post-Review session with one large PDF serialised to 47,182B (limit 4,194,304B). Tag: `v8.73.0-review-state-no-blobs`.
- **Tidy** — pill "Re-upload to run again"; snapshot log removed; API base debug is Vite DEV only. Tag: `v8.74.0-review-state-tidy`.

**Accepted limitation (BACKLOG F16):** a restored PDF or Office source must be re-uploaded before Review can run again. The backend deliberately refuses inline text for PDFs (`PDF_INLINE_TEXT_NOT_ALLOWED`), so extraction always happens server-side from the original bytes. Autosave still restores draft, extracted text, version history, and cards.

**Persistence questions remain OPEN.** Shipping the autosave buffer did not answer: (1) where client draft content may be stored and under which jurisdiction, (2) whether user accounts are needed, (3) retention. Frankfurt (`fra1`, **P12**) is the Vercel function region, not a jurisdiction decision for client files. A retention rule was agreed for blob storage, but blob storage was deferred (**Pr14**), so no client source files are stored and that rule governs nothing. Do not record it as active policy.

**Unblocked-but-not-built** now that a store exists: **B9** (needs append-only finding-decision events, not an overwrite buffer; acting on a finding and acting on an edit are two different workflows, and B9 as scoped covers only the first), **B61** (needs a durable LLM-result cache, not the frontend snapshot), **Pr13** approved-text library (needs a library of past texts; restore explicitly shipped without list/picker/history UI). See BACKLOG.

**Platform pins (same day, untagged commits):** Node `engines` **22.x** (`86ada5d`; frontend `888f6a8`). Vercel functions `regions: ["fra1"]` Frankfurt (`060d1ce`). Backend `installCommand` is `npm ci` (`vercel.json` since `9b5bd90`, 2026-01-25): any commit that changes dependencies must include the lockfile. See BACKLOG **P11** / **P12** / **P13**.

### Source size ceiling (guard shipped 2026-08-22; ceiling remains)

Vercel rejects any function request body over 4.5 MB at the edge. After base64 inflation the practical ceiling is about 3 MB of source documents in total across all sources, not per file. Confirmed in production 2026-08-21 with an 11.3 MB PDF: the function never runs, CORS headers are never set, and the browser reports `TypeError: Load failed`. Pre-existing since first deployment. Unrelated to persistence.

- **Guard shipped.** Client-side refusal before the request is sent. Tags: `v8.75.0-source-size-guard` (`d0bbcc5`), untagged `3fce4fb` (draft upload on the same budget; stale 10 MB PDF cap removed), `v8.76.0-size-message-wording` (`16a8cd1`). See BACKLOG **F20** / **F21**.
- **Ceiling remains OPEN and GUARDED (B79).** The failure is now honest. The tool still cannot review a document over about 3 MB. Real fix is blob storage (**Pr14**), deferred. Local verification is invalid (**P14**).

### Diagnostic harness (closed 26 May 2026)

- **D1.1 — Diagnostic harness build** (closed 2026-05-26). In-process batch runner under `scripts/diagnostic/`; fixtures through v4 pipeline; timestamped `runs/` output.
- **D1.1.1 — Fixture regeneration from disk** (closed 2026-05-26). Inventory and fixture JSONs regenerated from actual `sources/` filenames.
- **D1.2 — JSON copy button restored** (closed 2026-05-26). Frontend `<>` control beside Backend status for ad-hoc QC JSON capture.
- **D1.3 — Populate fixture drafts** (closed 2026-05-26; **superseded by D1.3.2**). Initial load reported v2 drafts but disk state retained v1 content on several fixtures — follow-up required explicit grep verification (see D1.3.2).
- **D1.3.1 — Output type corrections** (closed 2026-05-26). Fixtures 01, 13, 16 set to `reporting_commentary` per v2 expected-outcomes doc.
- **D1.3.2 — V2 drafts into 8 fixtures with verification** (closed 2026-05-26). Fixtures 01, 04, 08, 10, 13, 14, 15, 18 updated; positive-anchor and v1-contaminant grep verification required in summary.

### R6.5 — Two-layer style guide framework (closed 27 May 2026)

- **R6.5 — Two-layer structured style guide live** (closed 2026-05-27). `lib/qc/style-guide.mjs` introduces `STYLE_GUIDE_LAYER_1` (5 universal rules) and `STYLE_GUIDE_LAYER_2_CLIENT` (9 client-specific rules). Editorial reviewer scaffolds prompt from structured rules at call time; Layer 2 overrides Layer 1 by matching rule id with override logging. Diagnostic harness includes per-rule fixtures and `npm run diagnostic:style-guide` for 10-minute rule edit cycles. Tag: `r6.5-style-guide-framework`.

- **R6.5.1 —** `date_format` and `oxford_comma` rule wording tightened; `number_spelling` fixture strengthened. Rule-authoring conventions comment added to `style-guide.mjs` (every rule must state standard, violation, AND explicit non-firing cases).

- **R6.5.2 —** Deterministic backstop framework introduced. New `STYLE_RULE_DETERMINISTIC_FILTERS` registry in `editorial-compliance-reviewer.mjs` (v4 combined editorial+style path only). `oxford_comma` filter drops concerns where the cited span structurally cannot be a three-or-more-item list (no comma + conjunction).

- **R6.5.3 —** `english_variant` deterministic backstop added. Drops concerns where cited span has no detectable British spelling. `US_ALLOWLIST` handles standalone `-ise` words (rise, wise, advise, etc.) as false-British matches.

- **R6.5.4 —** Three more deterministic backstops added: `thousand_separator` (drops when cited span uses apostrophe and no comma), `currency_format` (drops when ISO 4217 code precedes amount), `defined_term_capitalisation` (drops when cited span starts with capitalised defined term).

- **R6.5.5 —** Broadened `thousand_separator` and `currency_format` filters to statement scope (regex runs on full `statementText`, not the LLM-returned span which is often too narrow to contain the structural pattern).

- **R6.5.6 —** `defined_term_capitalisation` made draft-aware. Rule now only applies when the term is defined in the draft (e.g. "Shopify (the Company)"). When no definition exists, the rule is silent. When a definition exists, only genuine violations fire (lowercase noun or omitted "the"); correct mid-sentence "the Company" is suppressed. Tag: `r6.5.6-defined-term-refinement`.

- **F01 live regression validation:** total editorial concerns reduced from 8 (pre-R6.5) to 4 (post-R6.5.6). All remaining concerns are genuine (em-dash, marketing language, first-person plural in reporting commentary).

- **Deterministic filter framework** now covers 5 of the 9 Layer 2 rules. Pattern available for future rules that have a structurally-checkable property.

### R6.4 — Public version compliance (closed 2026-05-31)

R6.4 chapter closed across four sub-items addressing the diagnostic finding on Compliance over-firing on already-public PG content (F02/F03).

**R6.4a — Source publication state inference + Compliance suppression** (closed 2026-05-30, tag `r6.4a.3-restricted-rename` + frontend `v8.53.0-r6.4b-publication-state-ui`). See earlier "Recently shipped" entry for R6.4a/b detail.

**R6.4c — Regulatory rule scope refinement** (closed 2026-05-31, tag `r6.4c-regulatory-rule-scope`). Refined the `description` field of compliance rule `regulatory_prohibited_language` in `lib/rulebook/complianceRules.js` to make fund-vs-portfolio scope explicit. Rule now applies to fund/firm claims (fund performance superlatives, firm-level absolute claims, promissory phrasing) and to language that solicits investment or links portfolio performance to a fund marketing pitch; rule does NOT apply to ordinary portfolio-company descriptive language in transaction releases or operational updates. Jurisdictional variance (SEC, FCA, MAS, BaFin) acknowledged in rule wording; reviewer note added to frame concerns as review prompts rather than determinations. Validated across three test runs (portfolio-company superlative cleared; fund-level superlative caught; solicitation crossover caught).

**R6.4d — Sensitivity-tier calibration** (closed 2026-05-31, no ship). Diagnostic evidence was hypothetical, not observed. Real PG behaviour (F02 IRR/MOIC suppression) confirms current architecture is correct: if content is in a published source, suppression is appropriate by definition (the source has been through compliance review). User can manually override per source via R6.4b pill if stricter handling needed. No new code; closed as non-issue.

### B26 / B26.1 — Constructive Feedback Output (closed 2026-06-30)

**B26 — Constructive Feedback (base).** On-demand author-addressed feedback synthesis from assembled qcCards (`api/constructive-feedback.js`). Reviewer Assessment unchanged (`api/synthesize-review.js`). Deterministic selection/ordering/signoff (`lib/qc/signoff-verdict.mjs`); LLM prose only (`gpt-4o`, temp 0). Resolves ROADMAP open list **#19** and **BACKLOG Pr8** (closed by not reframing Reviewer Assessment). Commit: `feat(B26): author-addressed constructive feedback synthesis from QC cards`.

**B26.1 — Group-by-statement consolidation + editor register + modal** (shipped 2026-06-30). Tags: backend `b26.1-feedback-consolidation`, frontend `v8.56.0-b26.1-feedback-consolidation`. Commits: `feat(B26.1): group-by-statement consolidation, editor register, scrollable modal`; fixes `fix(B26.1.1)` (modal cache), `fix(B26.1.2)` (cache invalidation on new QC run, caption font size, Escape-to-close).

- **Consolidation:** card-derived feedback bundled **group-by-statement** — one numbered point per flagged statement. Join key **`cardIndex`** (from v4 assembly `statementIndex`), **not** `statementText` (duplicate text must not merge distinct cards). Bundle shape: `{ cardIndex, statementText, evidence?, compliance[], editorial[] }`. **Within** each bundle: Evidence → Compliance → Editorial. **Between** statements (worst-first): conflicting/not_supported evidence → compliance-bearing → editorial-only; `cardIndex` ascending tiebreak. **Supersedes** B26's global Evidence→Compliance→Editorial **point** ordering — ordering is now between statements, not between signals.
- **Register:** single editor-to-writer voice in `CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER` (warm-through-specificity, sparing earned praise, no praise-sandwich, no schoolroom/system language, third person on subject / imperative on fix, one voice — reused verbatim by B26.2).
- **UI:** scrollable modal (not inline); Escape and backdrop close; focus trap; Copy copies plain `feedbackText`. Generated once per QC run, cached keyed to **`activeAnalysisRunId`**; cache clears when Review starts; explicit **Regenerate** in modal. **B26.1.1 / B26.1.2** folded: cache across open/close, invalidation fix (not `runKey`/`analysedAt`), caption `text-sm`, Escape-to-close.

**Watch (carried):** signoff logic duplication — see **Watch items → B26 — Signoff logic duplication** and **BACKLOG B26 — Watch**.

### B26.2 — Document-level craft pass (closed 2026-06-30)

**B26.2 — Craft pass + reviewed-draft snapshot** (shipped 2026-06-30). Tags: backend `b26.2.1-craft-assembly`, frontend `v8.57.0-b26.2-craft-pass`. Commits: `feat(B26.2): document-level craft feedback pass (FT-shaped, draft-anchored)` (backend); `feat(B26.2): snapshot analysed draft for craft pass` (frontend); fix `fix(B26.2.1): single opening, continuous numbering, active figure-coherence in craft pass` (backend assembly + prompts).

- **Craft pass:** second temp-0 LLM call (`constructive-feedback-craft`, `gpt-4o`) reads the full **reviewed-draft snapshot** and produces craft feedback across six FT-shaped dimensions: structure/argument flow, core-message clarity, conciseness & precision, register & tone consistency, opening/closing strength, internal coherence. Draft-anchored, document-level patterns only (dimension 6 excepted — active figure-clash scan). Craft section precedes card-derived points in assembled `feedbackText`.
- **Voice:** one editor voice — `CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER` shared with B26.1 card synthesis; observations-only craft register omits opening/closing framing (B26.2.1).
- **Assembly (B26.2.1 folded):** single opening (card pass only), continuous numbering across craft then card points (deterministic renumber), deterministic craft-preamble strip before assembly.
- **Scoping decision #3:** card-anchoring relaxed to **draft-anchoring for the craft section ONLY**; card-derived points remain strictly card-anchored.
- **Internal coherence:** text-internal only — real-world plausibility excluded; dimension 6 actively compares figures/dates/quantities across the draft (single cross-sentence clash in scope).
- **Consistency:** reviewed draft snapshotted at QC-run time (`analysedDraftTextByRunId`, keyed to analysis run id) in both `useDraftState` and `useAssessState`; craft pass reads `analysedDraftText` (fallback `draftText`). Craft and card feedback always describe the same draft version even after post-QC edits. Independent of assess-path `lastAssessedDraftText`.

### B26.2.2 — Constructive feedback readability + UI polish (closed 2026-06-30)

**B26.2.2 — Readability + assess summary UI** (shipped 2026-06-30). Tags: backend `b26.2.2-feedback-readability`, frontend `v8.58.0-b26.2.2-feedback-readability`. Commits: `fix(B26.2.2): cap quoted spans, dedupe figure overlap in feedback` (backend); `feat(B26.2.2): bordered collapse group, inline generate button, author-feedback label` (frontend).

- **Quote-length discipline:** both craft and card prompts instruct short identifying fragments (~8–10 words) with opening…closing ellipsis for long sentences; short spans quoted as-is. Prompt-only — no deterministic truncation.
- **Figure-overlap dedupe:** craft owns internal-contradiction flag; card point on the same figure addresses source reconciliation only — craft section passed into card pass as `craftSectionForFigureDedupe` + prompt instructions; neither signal suppressed. Sequential craft→card dispatch (craft result unavailable under prior parallel dispatch).
- **Frontend:** Reviewer Assessment + Quality Review Summary + generate control wrapped in one bordered collapse container; generate button inline on REVIEWER ASSESSMENT header (helper caption removed); button relabelled **Generate author feedback** / **View author feedback**; modal title **Author feedback**. Resolves **BACKLOG B26.2.2** (quote-length + figure-dedupe queued under B26.2 testing).

### B26.2.4 — Output-type-aware craft pass (closed 2026-07-05)

**B26.2.4 — Craft pass output-type calibration** (shipped 2026-07-05). Tags: backend `b26.2.4-craft-output-type`, frontend `v8.59.0-b26.2.4-craft-output-type`. Commits: `feat(B26.2.4): output-type-aware craft pass calibration` (backend); `feat(B26.2.4): send outputType on constructive-feedback request` (frontend).

- **Frontend:** `StatementAnalysisPanel` sends top-level `outputType` on the author-feedback request (`getSessionVersionOutputTypeKey(currentVersion)`, fallback `reporting_commentary`).
- **Backend:** `api/constructive-feedback.js` reads `body.outputType`, normalizes via `normalizeOutputType()` (`resolveConstructiveFeedbackCraftOutputType`); absent/invalid → `null` → generic craft behaviour (no per-type guidance block). Normalized type threaded into the **craft call only** — `buildConstructiveFeedbackCraftSystemPrompt` + `buildConstructiveFeedbackCraftUserPayload`.
- **Craft calibration:** per-type guidance on the existing six dimensions (no new dimensions) — **LinkedIn post:** conversational/first-person register acceptable, hook/non-thesis opening fine, do not flag promotional-leaning tone as register drift, brevity over formal structure (genuine faults still flagged); **press release:** strong factual lede, quote/attribution structure normal, formal register; **investor letter:** salutation/narrative-arc norms, measured register, buried lede and structure judged strictly; **reporting commentary:** current default. Instruction: judge each dimension against the norms of the given output type; do not impose investor-letter norms on social or short formats.
- **Unchanged:** card pass, selection, bundling, ordering, reviewed-draft snapshot, output contract `{ ok, feedbackText, isReady }`.
- **Resolves BACKLOG B35** (output-type-blind craft pass). Editorial-layer voice/register calibration shipped separately as **R6.12** (2026-07-05).

### R6.12 — Editorial output-type voice/register calibration (closed 2026-07-05)

**R6.12 — Editorial output-type voice/register calibration** (shipped 2026-07-05). Tag: backend `r6.12-editorial-output-type`.

- **Prompt calibration:** `buildEditorialOutputTypeCalibration(outputType)` added to `lib/qc/editorial-compliance-reviewer.mjs` (mirrors B26.2.4 craft pattern). Inserted into **`buildEditorialStyleSystemPrompt`** (v4 combined path) and **`buildEditorialSystemPrompt`** (legacy split path), adjacent to `VISIBILITY_CALIBRATION_EDITORIAL_STYLE`. Per-type guidance: **LinkedIn post** — conversational/first-person register acceptable (singular author voice or third-person firm subject in deal announcements); hooks like "Excited to see" acceptable; name/list fragments OK; standard qualitative descriptors not promotional excess; genuine faults still flagged. **Press release** — factual lede, formal register, quote/attribution structure normal. **Investor letter / reporting commentary** — current institutional norms (default).
- **Rulebook:** `reviewerNoteByOutput.linkedin_post` on **`voice_consistency`**, **`register_mismatch`**, **`structural_integrity`** — resolves contradictory voice/register pair on LinkedIn; structural rule kept with LinkedIn fragment carve-out.
- **Prompt formatter:** `formatRulesForPrompt` now emits **`reviewerNote`** for `kind === "editorial"` (via `effectiveReviewerNote`; was compliance-only).
- **Verified:** F12 — `voice_consistency` + `register_mismatch` over-fire cleared. F09 control — no regression. Diagnostic harness env load order fixed in `run-batch.mjs` (env before dynamic import of observability/pipeline) to enable batch verification.
- **Closes editorial half of document-type-awareness gap** (craft half was **B26.2.4**). Broader document-type norms (salutations, first-mention business descriptions, investor-letter framing) remain in **Layer 2 style rules backlog** / future work — not in this ship.
- **Residual watch:** F12 S6 `structural_integrity` and S8 hyperbole borderline on social formats — monitor if more LinkedIn fixtures added. See **Watch items → R6.12 residual LinkedIn editorial noise**.

### SRC1 — Source status pill alignment + override guard (closed 2026-07-05)

**SRC1 — Source publication-state pill alignment + override guard** (shipped 2026-07-05). Tag: frontend `v8.60.0-src1-source-status-override`. Commit: `feat(SRC1): source publication-state pill alignment and override guard`.

- **Pill alignment:** publication-state pill right-aligned in source rows (name left → spacer → pill → remove) in **Assess** (`AssessModule.jsx`) and **Drafting** (`SourcesPanel.jsx`); shared `SourcePublicationStatePill.jsx`.
- **Override guard:** `publicationStateSource: "auto" | "manual"` on source state. New uploads → `"auto"`. Dropdown override → `"manual"`. Shared `applySourceSummaryPatch.mjs` used by `useDraftState` and `useAssessState` — skips `publicationState` write when `"manual"`, still applies `description`. Covered by `tests/source-publication-state-patch.mjs`.
- **Scope:** frontend only — no backend, payload, or Compliance-calibration change. `publicationState` already consumed by Compliance (R6.4a).
- **Partially resolves ROADMAP Active Backlog #18(b)** — pill column alignment; **#18(a)** in-flight "Classifying…" indicator remains deferred.

### B34 — Remove Assess Review Settings auto-detect (closed 2026-07-05)

**B34 — Remove Assess Review Settings auto-detect** (shipped 2026-07-05). Tags: backend `b34-assess-auto-detect-removal`, frontend `v8.61.0-b34-assess-auto-detect-removal`. Commit: `feat(B34): remove Assess Review Settings auto-detect`.

- **Frontend:** removed `trySessionAutoDetect`, `setDraftTextTracked`, `defaultVisibilityForOutputType`, `lockReviewSettingsManual`, `isAutoDetectedType`, and override lock refs (`sessionAutoDetectDoneRef`, `reviewSettingsLockedRef`, `detectRequestSeqRef`) from `useAssessState.jsx`; removed "Auto-detected" badge and lock calls from `AssessModule.jsx`; dropped `apiDetectOutputType` from `api.js`. Restored plain `setDraftText`. Review Settings are manual-only; session default **Reporting commentary** / **Complete** unchanged.
- **Backend:** deleted `api/detect-output-type.js`; removed `"detect-output-type"` stage entry from `lib/qc/model-config.mjs` (dead code).
- **Scope:** Assess module only. No change to Drafting (`useDraftState.jsx`, `FocusLeftRail`, `OutputTypesPanel`), generate/rewrite/analyse/export, or QC.

### B25 — Verdict-label consistency across surfaces (closed 2026-07-05)

**B25 — Verdict-label consistency across surfaces** (shipped 2026-07-05). Tags: backend `b25-verdict-label-consistency`, frontend `v8.63.0-b25-verdict-label-consistency`. Commit: `feat(B25): verdict-label consistency across surfaces`.

- **Export:** `api/export.js` `normalizeVerdict` verdict strings aligned to card vocabulary — Confirmed / Partially confirmed / Conflicting / No support — with `supported_partial` split from `supported_full` (was collapsed to "Supported"). "not reviewed" → null and "Unverifiable" default unchanged.
- **Frontend:** conflict long-line in `displayVerdictLabels.js` (`evidenceVerdictLineFromCard` + `evidenceVerdictLineFromSupportState`) corrected "Conflicting sources" → "Conflicts with sources" (short badge "Conflicting" unchanged).
- **Scope:** display strings only; no verdict enum or logic change.

### B29 / B29.1 — v4 review toggles + skipped-signal card rows (closed 2026-07-05)

**B29 / B29.1 — v4 review-toggle honouring + skipped-signal card rows** (shipped 2026-07-05). Tags: backend `b29-v4-review-toggles`, frontend `v8.65.0-b29.1-not-reviewed-rows`.

- **Backend (B29):** v4 now honours `editorialEnabled` / `complianceEnabled` / `evidenceEnabled` from the analyse-statements request (default true when absent). Each stage skipped when its toggle is off — evidence via existing skipped fast path (`supportState: "skipped"`, `displayVerdict: "Not reviewed"`); editorial/compliance halves gated in `runEditorialComplianceReview`; all-off returns `nothingReviewed` with no LLM calls. Deterministic aggregation and card-assembly contract unchanged. `meta.reviewOptions` echoed on response.
- **Frontend (B29):** evidence row shows **Not reviewed** + grey dot when evidence skipped (fixed misleading **Confirmed** fallback in `evidenceDisplayVerdictLabel`).
- **Frontend (B29.1):** editorial/compliance rows show **Not reviewed** + grey dot when their toggle is off — keyed on `meta.reviewOptions`, not card `editorialVerdict` / `complianceVerdict` (unreliable: null on skipped path, `"clean"` on full path via assemble coercion).
- **Export:** already omits skipped-evidence verdict/finding line (B25). **All-off Review button** already disabled in UI.
- **Resolves ROADMAP Active Backlog #17** and **BACKLOG B29**.

### B28 — Remove unused eventType from QC path (closed 2026-07-05)

**B28 — Remove unused eventType from QC path** (shipped 2026-07-05). Tag: backend `b28-remove-eventtype`.

- **Removed from QC path:** editorial DOCUMENT CONTEXT `Event type` line (v3 split `buildEditorialUserPayload` + v4 combined `buildEditorialStyleUserPayload`); `eventType` field from `buildEditorialReviewContext` (`pipeline-v4/index.mjs`); `normalizeEventType(body?.eventType)` read in `evidence-skipped-fast-path.mjs`; `normalizeEventType` / `getEventTypeLabel` imports and normalize/store in `editorial-compliance-reviewer.mjs`.
- **Unchanged:** compliance user payloads (already excluded `eventType`); rule filtering and verdict aggregation; Generate/Rewrite event-type framing (`api/generate.js`, `api/rewrite.js`, `lib/event-type.js`).
- **Re-add to QC** if **R6.14** event-type-aware review ships (**BACKLOG B32**).
- **Resolves ROADMAP Active Backlog #3** and **BACKLOG B28**.

### WR1 — Writing scaffold (closed 2026-07-06)

**WR1 — Writing scaffold** (shipped 2026-07-06). Tags: backend `wr1-writing-scaffold`, frontend `v8.66.0-wr1-writing-scaffold`. PG demo writing path for **new direct investment** and **new fund commitment** (Complete / Public each).

- **PG prompt library:** `lib/prompt-library/pg-writing-prompts.mjs` keyed `eventType` × `visibility` for `NEW_DIRECT_INVESTMENT` and `NEW_FUND_COMMITMENT`; consumed by `buildBasePrompt` on the generate path. Binding-precedence constraints (last instruction the model reads): transaction date from modal input (not source dates); investment name exact; Partners Group naming; two-paragraph structure (Complete) / one paragraph (Public); US English; USD not `$`; month spelled out in prose; strict commentary word limits (150 Complete / 80 Public).
- **Methodology Note:** generation half + mandatory Methodology Note delimited by `---METHODOLOGY---`; word limit applies to commentary only. SELF-CHECK apparatus excluded — Review owns QC.
- **Deterministic backstops:** PG commentary cleanup (`pg-commentary-cleanup.mjs` — artifact/smart-quote/dash strip); investment-name punctuation trim (`normalizePgInvestmentName`); fund-commitment exclusion filter (`applyPgFundCommitmentPostFilter` — lead-commitment → committed to; GP → manager; strip prior-fund figures/exit returns/fund mechanics); sentence-boundary word-limit enforcement for fund commitment (no mid-sentence cuts). Canaries: `pg_fund_exclusion_filtered`, `pg_word_limit_exceeded`.
- **Frontend:** `WritingInputModal` (transaction type, investment name, month+year picker emitting MMM YYYY, Complete/Public, special instructions); wired into Assess generate path (`useAssessState`); one version per Generate. Drafting panel: **Configure text inputs** secondary button opens modal (modal retains **Generate draft**). Methodology Note in collapsible block below draft (`MethodologyNotePanel`, default collapsed), excluded from word count.
- **Demo sources:** `Shopify (text).txt` (direct investment); `CVC VIII.txt` (fund commitment). **Learning:** source shape drives output — track-record-dense sources fight the exclusions; close-memo/strategy-led sources generate clean from the prompt. Armitage IC memo retained as fund-filter stress-test fixture.
- **Scope:** generation path only; no QC or deterministic verdict change (**B28** retained).
- **Follow-on (post-demo):** true both-version output (**WR2**); blank-transaction-date guard on modal (**WR2.1**); broader event types (**B32** / **R6.14**). Unblocks **Pr9** scheduling.

### A10 — Adapt into Assess (closed 2026-07-09)

**A10 sprint — Adapt into Assess** (shipped 2026-07-09). Frontend tag: `v8.51.0-rA10-adapt-into-assess`. Backend `/api/adapt` unchanged.

- **A10 — Adapt ported into Assess:** draft transform via Assess Adapt modal + `handleAdapt` in `useAssessState`; adapted drafts captured as labelled version-timeline entries with `meta.derivation`. Review runs on adapted drafts with full QC cards; Assess keeps adaptation-review enabled (`isActiveOutputAdaptation: false` — no master-only banner).
- **A10.1 — Adapt UI polish:** Adapt button right-most with neutral outline (matches Clear/Export); pale-yellow Beta pills on button + modal; LinkedIn link field relabel + helper; press-release quote field labels.
- **A10.2 / A10.2.1 / A10.2.2 — Adapt draft-panel polish:** `meta.derivation` persisted on adapt timeline entries and carried forward through Review/Save (`findCarriedDerivation`); **↳ Adapted from {type}** chip with case-normalised display label; draft textarea fills panel height; post-layout scroll-to-top (`requestAnimationFrame`); non-functional resize grip removed (`resize-none`).

**Follow-on (deferred):** **A10.3** — remaining Assess polish (layout, scroll, export order). Refresh/autosave shipped 2026-08-21 (`v8.71.0-review-state-restore` through `v8.74.0-review-state-tidy`; backend `persist-review-state`, `review-state-cors-local`). **Accepted limitation F16:** restored PDF/Office need re-upload before Review. **A10.4** — Assess final polish. **A11.1–A11.3** — per-version QC, tabbed base↔adaptation view, single-view consolidation (see **Parked → Assess horizon**).

### R7 Build A — Additive multi-span emit (closed 2026-08)

**R7 Build A — Stage-2 widened multi-span emit** (shipped; tag `r7-build-a`). Additive `qcCard.supportSpans` from a widened Stage-2 pass. **Verdict-safe via separation:** single-pick Stage-2 feeds Stages 3–4 / evidence verdict; widened pass feeds `supportSpans` only (does not change aggregation). Classification gate: emit `confirmed` / `partially_confirmed` / `conflicting`; drop `no_support` and empty passages. Offsets on spans were **null** until Build B (now shipped — see **R7 Build B** below). See **R7 — Sources Drawer Revival**.

### Extractor swap — officeparser (closed 2026-08)

**Extractor swap → officeparser@7.5.1** (shipped; tag `extractor-officeparser-swap`). Foundational ingestion change: replaced live `pdf-parse` / `mammoth` / `jszip` (+ pptx XML) path with **officeparser** for pdf/docx/pptx/xlsx. **OCR disabled** (`parseConfig.ocr: false`); scanned/near-empty sources flagged `unsupported_scanned` (no OCR). Faithful typography (fixes apostrophe→`n` / C1 mangling on born-digital PDFs); recovers bad-XRef PDFs the prior stack failed; additive `extraction.structure` page/slide/sheet identity; primary return shape unchanged (`{ text, extraction }`). **Verdict-adjacent revalidation:** CHECK1 `.txt` regression suite 9/9 evidence-pass identical to baseline; CHECK2 binary-source attribution **IMPROVEMENT=9 / NEUTRAL=41 / REGRESSION=0** (`docs/R7_EXTRACTOR_CHECK2_ATTRIBUTION.md`). Enabled Build B offset work and drawer navigation on structure metadata.

**Also shipped (later superseded):** Node `engines` **20.x → 24.x** (`ad8a634`, Vercel Node 20 hard deadline 2026-10-01). **Current pin is 22.x** (`86ada5d`, 2026-08-21). Bundle-size excludeFiles/trim and `VERCEL_SUPPORT_LARGE_FUNCTIONS` stopgap — see **BACKLOG B42** / **B43**.

### R7 Build B — supportSpans offsets (closed 2026-08-09)

**R7 Build B — offset population on `qcCard.supportSpans`** (shipped; tag `r7-build-b`). Deterministic locate of each Build A passage in the stored extracted source text (`source.text`): exact `indexOf` first, then repair-normalised locate (whitespace collapse; curly quotes → straight; en/em dash → hyphen) with a parallel original-index map; first match only. **Authoritative-span-or-drop:** miss leaves `start`/`end` null and keeps the span (passage still displays); never guesses a position. Offsets are relative to the stored source text F12 must highlight against. **Verdict path untouched:** `supportSpans` still attach only at assemble; `aggregateVerdictV4` / `selectExcerptsV4` take single-pick matches only. **Tests:** 15/15 in `tests/r7-b40-support-spans-offsets.test.mjs` — exact match (slice equals passage); repair-normalised (curly quotes, em-dash, en-dash, whitespace collapse, newline-vs-space); miss (null offsets, span kept); first-occurrence. **Live run:** real Review over 2 DOCX sources; matcher passages resolved with correct offsets; slice-back verified against source text. Unblocks drawer highlight (**BACKLOG F12**). See **R7 — Sources Drawer Revival**.

### R7 Build C — source emit for drawer (closed 2026-08-09)

**R7 Build C — aligned source text + excludedSources in analyse-statements response** (shipped; tag `r7-build-c`). Additive `sources` array built from post-filter `v3Sources` in sourceIndex order: each entry has `index` / `id` / `label` / `text` / `publicationState`; **exact-string contract** `sources[i].text === v3Sources[i].text` (the B40 offset string); **alignment** `sources` index === `sourceIndex` === `supportSpans.sourceRefId`. Separate `excludedSources` for empty-text drops (reason CODE only; never in aligned `sources`). Pure helpers in `lib/response-sources.mjs` (`splitSourcesForResponse`, `buildResponseSources`, `buildExcludedSources`). **Verdict path untouched.** **Tests:** 58/58 including drop/re-index alignment (middle empty source does not misalign later `sourceRefId`). F12 data prerequisite (source text + aligned ids). See **R7 — Sources Drawer Revival**.

### R7 F12 — Sources Drawer v1 (closed 2026-08-09)

**R7 F12 — Sources Drawer v1** (shipped; tag `v8.68.0-f12-sources-drawer`). Frontend-only reader on Assess: left reviewed-source list + right highlighted extracted-text pane; three openers (Results **Sources** button / per-row magnifier / card Evidence finding icon); verdict-coloured passage highlights (confirmed→green / partially_confirmed→amber / conflicting→red via existing tone fills); per-span hover naming the statement and relation. Consumes Build A/B/C data (`qcCard.supportSpans` + response `sources[]`); no verdict/pipeline change. **Alongside:** **B47** Office-source ingestion fix — FE base64-encodes pdf/docx/pptx/xlsx uploads so officeparser runs; BE rejects inline office-zip text (`OFFICE_INLINE_TEXT_NOT_ALLOWED`). Tags: `b47-office-inline-guard` (backend), `v8.67.0-b47-office-upload-fix` (frontend). ~~Deferred from v1: excluded-sources display (**BACKLOG F13**)~~ — **shipped 2026-08-11** (Sprint 1). See **R7 — Sources Drawer Revival**.

### Pr9 — Suggest revised draft (closed 2026-08-14)

**Pr9 — Suggest revised draft** (shipped 2026-08-11–14). Lighter prequel to Implement-changes sprint (**B9**). One-click revised draft from gathered Review/Assess card concerns → single temp-0 LLM call → whole-draft holistic rewrite; finding-handling rulebook + note-wording pass. Tags: `Pr9-BE`, `Pr9-handling-BE`, `Pr9-notes-BE` (backend); `Pr9-FE`, `Pr9-handling-FE` (frontend). See **BACKLOG Pr9** (closed). **Rewrite-correctness follow-on shipped 2026-08-23** — see **Recently shipped → Pr9 rewrite-correctness**.

### Review-quality cluster (closed 2026-08-18)

Sprint 2 review-quality fixes, shipped through diagnose-first + read-only shadow gate methodology on all verdict-adjacent changes.

- **B48 — Evidence conflict-vs-partial calibration** (shipped 2026-08-16). Non-confirmation (e.g. source says 'the firm', draft says 'BVP') labelled `conflicting` rather than `partially_confirmed`; recalibrated. Tag: `review-B48`.
- **B13 — Stage 5 material-vs-pedantic partial distinction** (shipped 2026-08-16). Stage 5 commentary now distinguishes pedantic-gap partials from material-gap partials with materiality signal. Tag: `review-B13`.
- **F8 — number_spelling quarter-notation backstop** (shipped 2026-08-18). Deterministic backstop `isQuarterNotationSpan` exempts quarter labels (Q3 2010, 1st quarter 2024) from `number_spelling` firing. Tag: `review-F8`.
- **F9 — Duplicated suggestion-text de-noiser** (shipped 2026-08-18). Frontend de-duplicates identical suggestion text within a single editorial concern bullet. Tag: `review-F9`.
- **B37 — Framing-goes-beyond-source flag** (shipped 2026-08-18). Framing-escalation flag collapsed; material-only. Tags: `review-framing-BE` (backend), `review-framing-FE` (frontend).
- **Source-recency flag** (shipped 2026-08-18). Structural source as-of-date extraction (`extractSourceAsOfDate`) + 18-month, claim-aware present-tense recency signal; additive, verdict-safe. `lib/qc/source-recency.mjs`. Tags: `review-recency-BE` (backend), `review-recency-FE` (frontend).
- **Card density UX** (shipped 2026-08-18). Option A compact clean-line: clean dimensions collapse to one quiet line. Tag: `review-card-density` (frontend).

### Source supersession (closed 2026-08-18)

**Source supersession (verdict-layer)** (shipped 2026-08-18). Period-aware; newer dated source's figure supersedes an older different-period source; draft-matches-current → supported + historical note (`qcCard.supersededSourceNotes`); same-period restatement and draft-behind stay conflict; confident-dates-only; reconciled with B48 magnitude backstop. New pure module `lib/qc/supersession.mjs`. Fixture `scripts/diagnostic/supersession/`. **VERDICT-ADJACENT** — shipped through diagnose-first + read-only shadow gate. Tag: `review-supersession`.

### Recency anchoring + first-person FP fixes (closed 2026-08-19)

**Recency anchoring + first-person-plural false positive + no-op suggestion fixes** (shipped 2026-08-19). `recencySourceIndices()` in `stage7-assemble-card.mjs` anchors to supporting source (confirmed/partially_confirmed); `STYLE_RULE_DETERMINISTIC_FILTERS.first_person_plural` requires a real first-person pronoun in the cited span; `suppressNoOpSuggestions()` drops any house-style concern whose `suggestedRewrite` equals the statement text (general guard). Shadow-gated: Nordholt clean+dirty drafts verified four targeted transitions + zero verdict/hasConflict movement. Tag: `review-recency-anchor-firstperson`.

### Cheap-fixes arc — per cent / number_spelling / extractPercents (closed 2026-08-19)

- **B54 — `percentage_notation` on "per cent"** (shipped 2026-08-19). Rule text names the two-word British "per cent"; drop-filter uses `\bper\s?cent\b`. Tag: `review-percent-number-style`.
- **F14 — `number_spelling` on spelled-out 0–12** (shipped 2026-08-19). Deterministic filter drops cited "twelve" / "twelve months"; durations are prose counts, not physical units. Tag: `review-percent-number-style`.
- **B59 — `extractPercents` "per cent" + same-metric percent guard** (shipped 2026-08-19). Extractor matches `per\s?cent`; magnitude backstop requires a non-empty metric-key intersection before forcing a percent conflict. **VERDICT-ADJACENT** — diagnose + read-only shadow gate. Tag: `review-percent-extract`. Money/count later guarded by **B60** / **B60.1** (shipped). Compound follow-on: **B53a** / **B53c** shipped; **B53b** still open.

### B53a — internal claim spans (closed 2026-08-19)

**B53a — Internal claim spans with upgrade-only rollup** (shipped 2026-08-19). One QC card per sentence; whole-sentence Stage 2/3 stays authoritative; per-claim matching may only upgrade `partially_confirmed` → `confirmed`. Full-corpus shadow: one verdict change (F06 S5, signed off), zero regressions. Determinism harness: verdict instability 1/38 OFF → 0/38 ON. Flag `QC_CLAIM_SPANS` default ON (`review-claim-spans-on`, `e6e59a6`); set `0`/`false`/`off` to disable without a deploy.

Resolving tags: `review-claim-spans` (`c290cee`, implementation), `review-claim-spans-on` (`e6e59a6`, default ON + concurrency 24). Untagged in the same arc: `48d8483` (determinism harness, sizing counts, shadow baseline cache), `b81929b` (Stage 2 `seed=1`, `systemFingerprint` logging, concurrency cap, two-arm harness, word-boundary connective matching). Seed does not pin the OpenAI backend (three `system_fingerprint` values in one diagnostic).

Also in this ship: Stage 2 concurrency raised to 24; claim-span shadow caches shared Stage 1 + whole-sentence Stage 2 to gitignored `.baseline.json`.

### B69 — disk-backed LLM cache for local diagnostics (closed 2026-08-20)

**B69 — Disk-backed LLM cache for local diagnostics** (shipped 2026-08-20). File-backed store behind `QC_LLM_CACHE_DISK`. Unset = memory only (production unchanged). Diagnostic scripts default to gitignored `scripts/diagnostic/.llm-cache.json`; `--no-disk-cache` / `--refresh-cache`. Three live-measurement scripts force the cache off. Does not close B61. Tag: `review-cache-disk`.

### B64 — claim-span anchors (closed 2026-08-20)

**B64 — Spelled-out numbers, acronyms, and mid-sentence proper nouns** (shipped 2026-08-20). Widens the claim-spans validity and coverage-guard anchor test only; the Stage 1b pre-filter, `collectBackstopFigures`, and materiality are unchanged. Shadow (one process, shared LLM cache): `anchorless_claim` 14 → 8; decomposed 20 → 26; zero verdict changes; zero `hasConflict` changes. Tag: `review-claim-anchors`.

### B63 — LLM result cache (cost optimisation only, closed 2026-08-20)

**B63 — LLM result cache for the verdict path** (shipped 2026-08-20, flag `QC_LLM_CACHE` default ON). Stages 1, 1b, and 2. Process-local in-memory LRU, logical collection `qc_llm_cache`, caps 1024 entries / 16 MiB. Gate identity with LRU in place: 479 entries, eviction count 0, diff count 0; warm hit rate 100% inside one process. **Limitation:** the cache does not survive a cold start or an instance change, so cross-session repeatability is not delivered. **Does not close B61.** Tags: `review-llm-cache` (`e6fd99c`), `review-llm-cache-on`.

### B70 — plain "m" as million (closed 2026-08-20)

**B70 — Parse plain `m` as million** (shipped 2026-08-20). `extractMoney` already scaled `million|billion|thousand|mm|bn|k`; `$155m` was read as 155 and the magnitude backstop forced a conflict against `EUR 155 million`. Plain `m` is now million, case-insensitive, word-bounded, and only in the currency-prefix alternative so `155 m` with no currency is not money. Tag: `review-money-scale`.

### B60 — money metric keys (closed 2026-08-20)

**B60 — Money metric ids and same-metric guard** (shipped 2026-08-20). Money figures get one canonical `metric` from a longest-first word-boundary phrase list (ARR vs revenue does not share an id). The magnitude backstop suppresses a forced money conflict only when both sides resolved and those ids differ; unrecognised metrics fail closed. Count and percent are untouched. Shadow: `scripts/diagnostic/b60-money/run-shadow.mjs`. Tag: `review-money-metric-keys`.

### B60.1 — sentence-scoped money metric (closed 2026-08-20)

**B60.1 — Sentence-scoped metric resolution** (shipped 2026-08-20). Replaces the 48-character window. A money figure takes its metric from the sentence that contains it (Stage 1 fallback splitter `splitDraftIntoCandidatesV2`; whole passage if no boundary). Within that sentence the nearest longest-first phrase wins, so two metrics in one sentence do not share an id. Truncation cannot assign a wrong id. Percent later migrated in **B72**. Tag: `review-money-metric-scope`. Currency recorded in **B71**.

### B73 splitter dash (closed 2026-08-21, insurance)

**B73.** `splitDraftIntoCandidatesV2` does not treat a dash as a sentence boundary. Full stops, question marks, exclamation marks, colons, and semicolons are unchanged. **Insurance, not a live-path fix:** production Stage 1 uses the LLM extractor and already kept the long dashed sentence whole; fallback is reached only when that output is rejected. See **BACKLOG B75**. Tag: `review-splitter-dash`.

### B53c superlative absorption (closed 2026-08-21)

**B53c.** Framing fidelity flags unevidenced superlatives (record, highest, lowest, best, strongest, unprecedented, first ever, all-time, never before) when the matched source does not use the same phrase. Deterministic; editorial only. Tag: `review-superlative`.

### B65 Stage 1b claim fidelity (closed 2026-08-21)

**B65.** Stage 1b prompt requires each claim to be copied character for character from the parent. The model must not insert entity names from earlier in the sentence. A claim that starts with a pronoun or bare verb phrase is correct. Tag: `review-claim-fidelity`.

### B71 money currency (closed 2026-08-21)

**B71.** Money figures carry a recognised currency (USD/EUR/GBP/AUD/CAD from `$`/`€`/`£` or ISO code). The magnitude backstop does not force a conflict when both sides have a currency and they differ. Unknown currency fails closed. Tag: `review-money-currency`.

### Period overlap (closed 2026-08-21)

**Period overlap.** Two figures whose parseable periods do not overlap cannot contradict. The magnitude backstop no longer forces a conflict on such a pair; the period gate rewrites `confirmed` and `conflicting` to `no_support` (Stage 2; aggregates as `not_supported`) and names both periods in the explanation. Unparseable periods fail closed (unchanged). Range claims are not parsed. Tag: `review-period-overlap`.

### B72 percent metric scope (closed 2026-08-20)

**B72.** Percent figures use the same sentence-scoped nearest-phrase resolver as money (`lib/qc/pipeline-v4/metric-scope.mjs`), with a separate longest-first vocabulary. One canonical id per figure. `margin_unspecified` does not match `gross_margin` or `ebitda_margin`, so a 45 vs 19 false force is suppressed. Percent still only forces when both ids resolved and equal (unknown does not fail closed, unlike money). Tag: `review-percent-metric-scope`. Probe: `scripts/diagnostic/b72-probe/`.

**Review-quality arc CLOSED 2026-08-21.** Next scheduled build is not this arc. Still open: **B61** (hasConflict only, M; store exists, wrong shape, unblocked-but-not-built), **B53b**, **B74**. Parked: **B62**, **B66**, **B68**.

---

### R2.7.2 — Stage 2 semantic frame matching (closed 2026-06-01)

**R2.7.2 — Stage 2 semantic frame matching.** Shipped (`r2.7.2-frame-matching`; production sign-off **2026-06-01** after explicit-vs-explicit gating re-test). Distinguishes numeric equivalence from semantic frame equivalence across metric, basis/scope, and period dimensions. Metric and basis land reliably. **PERIOD is scoped to EXPLICIT-vs-EXPLICIT only:** a deterministic backstop (`applyPeriodGateBackstop`) compares normalised tokens (Q[1-4] YYYY or bare YYYY). Non-overlapping periods cannot contradict: `confirmed` and `conflicting` become `no_support`. Overlapping but unequal tokens (quarter vs containing year) still downgrade `confirmed` to `conflicting` when roles match. **LIMITATION:** when the source states the period as a **RELATIVE** reference ('over the same period', 'today'), gpt-4o resolves it unreliably at temp 0 — it resolves to whichever period confirms the match — across both prose and structured-field prompt mechanisms. Relative-source-period resolution descoped to **R2.7.2.1**. Mechanism retained: Stage-2-internal structured `periodAssessment` field + deterministic backstop. Verified: explicit mismatch (draft 2018 vs source 2019) → conflicting; explicit match (2019) → supported; metric mismatch (revenue vs GMV) → conflicting; paraphrase regression → confirmed.

**fix-pipelineversion-label** (same session): `qcCard.pipelineVersion` in shared `stage7-assemble-card.mjs` now stamps from `assemblyContext.pipelineRoute` instead of hardcoding `"v3"`, aligning per-card label with handler `meta.pipelineVersion` on v4 runs.

### R6.11 — Editorial schema-fallback observability (chapter closed 2026-06-25)

Three-layer resolution — reliability, card, log:

- **R6.11a — Schema salvage (reliability)** (closed 2026-06-03, tag `r6.11a-editorial-schema-salvage`). Per-concern validation on combined v4 editorial+style output; drop invalid rows without aborting the whole response; reclassify concerns when `ruleId` is valid in the other category; retry attempt 2 appends structured correction feedback; canaries for dropped/reclassified concerns; empty `concern` verdict with zero survivors returns null (retry/fallback path). Verified closed on the full 2026-06-01 fallback set (**B21-diag-confirm**, 2026-06-25).
- **R6.11b — not_reviewed visible state (card)** (closed 2026-06-03, backend `r6.11b-not-reviewed-state`, frontend `v8.54.0-r6.11b-not-reviewed-state`). After two failed schema validations, fallback emits `editorialVerdict: "not_reviewed"` (not `clean`); Stage 7 assembly preserves `not_reviewed`; export flags treat it as an editorial signal; frontend shows amber "Needs manual review", workbench filters, and summary counts. Audit signal documented in `ai/AI_OPERATING_MANUAL.md`. **B21-diag** confirmed distinct from clean/concern — no further card work.
- **B21 — pipeline.log observability (log)** (closed 2026-06-25). On double failure, `[EDITORIAL_STYLE_REVIEW] fallback raw output` logs per-attempt `rawOutput` (capped) and `rejectReason` — closes the gap that forced Langfuse recovery during **B21-diag**. Diagnosis: batch fallbacks were valid JSON with real concerns discarded by pre-R6.11a fail-fast on category mis-tags (`first_person_plural` tagged `editorial`). See `docs/b21_schema_fallback_diagnosis_2026-06-25.md`, `docs/b21_diag_confirm_2026-06-25.md`, `docs/b21_observability_2026-06-25.md`. Residual watch: **BACKLOG B33**.

### R6.6 — Source-public-state awareness (closed 2026-06-25)

Closed on substance. Suppression mechanism shipped in R6.4a; R6.6 chapter verified wiring, residual legs, and named-individual scope.

**Resolution:**
- **Figure leg** — **R6.6.1** (diagnostic harness carries `publicationState`; fixtures 02 + 10 `published_external`). F02 S0 `precise_confidential_detail` concernCount 1 → 0; prior fire was a harness artifact (`publicationState=unknown` on batch path).
- **Rename leg** — out of scope by design. Renamed-subject comparative/superlative claims correctly remain outside suppression (`comparative_claim_without_basis` exclusion unchanged); a renamed subject is a new claim the public source no longer backs. Verified F21 S1 (R6.6.2).
- **Named-individual leg** — **R6.6.3** (content-bound suppression in `VISIBILITY_CALIBRATION_COMPLIANCE`: suppress when name + attribution context match a `published_external` source; keep when draft adds attribution the source does not carry). Verified both directions on F21 S2 (suppress) / S3 (fabricated quote still fires).

**Sub-refs:** **R6.6-diag** (temporary diagnostic logging; removed **R6.6.4**). **R6.6.1** (harness wiring). **R6.6.2** (residual verification + permanent F21 regression fixture). **R6.6.3** (named-individual suppression). **R6.6.4** (diag-logging removal).

**Watch:** subtle attribution-drift reliability on named-individual suppression — see **BACKLOG B27**.

### R6.13 — Review-intent wiring (substantially shipped 2026-06-25)

Silent-default wiring audit and fixes for review intent on the Writing QC path and regression suite. **Tier B decisions remain open** — see **BACKLOG B30–B31** (review toggles closed **B29**, 2026-07-05; `eventType` lean removal closed **B28**, 2026-07-05).

- **R6.13-audit** — silent-default wiring audit across six constructor paths. Report: `docs/audit_silent_defaults_2026-06-25.md`. (Working label during the run: **R6.6-audit** — both refs identify the same artifact.)
- **R6.13.1** — wired Writing-path `versionType` + `selectedTypes` into the QC payload; fixed stale `visibility` log (`editorial-compliance-reviewer.mjs` now logs `requiredVersion`). Closes **B20**. Verified: 7→8 compliance rule-subset flip on Public + press_release.
- **R6.13.2** — regression calibration coverage: per-spec v4 opt-in; `publicationState` / `versionType` / `selectedTypes` carry-through; two v4 guard fixtures (`calibration_published_suppression_v1`, `calibration_public_press_release_v1`).

**Tier D (no action):** v3 pipeline hardcodes `undefined` for `outputType` / `requiredVersion` / `eventType` (`qc-pipeline-v3.mjs:62-64`). Not fixed — v3 is retiring. Recorded so it isn't rediscovered as a bug.

### R6.14 — Event-type awareness (scoped; shape undecided)

**Status:** **SCOPED, SHAPE UNDECIDED.** Sequenced after the editorial cluster (B21, B22, B23 — shipped) — touches the rule/review model B23 reworked. QC path no longer carries `eventType` (**B28**, 2026-07-05); re-add when this spec ships. Generate/Rewrite framing retained via `lib/event-type.js`.

**Writing side — settled in principle (not yet specced):** Generation prompts branch on event type **and** output type as a matrix (event type sets substance/scope; output type sets format). Independent of the review model.

**Review/Assess side — need confirmed, mechanism open:** Reviews should reflect that different information is expected for different event types (e.g. a valuation basis expected for a revaluation but not a new-investment announcement). Recorded examples (2026-06-25 scoping):

- **New direct investment:** context; investment identity; headline valuation; headline financials (revenue, EBITDA); thesis summary; value-creation strategy.
- **Fund distribution:** fund identity; timing; trigger (e.g. sale of Company A); deal context; headline exit valuation; exit return metrics; [conditional: full exit → original entry date + value creation over hold].
- **Fund revaluation:** fund identity; direction; trigger (write-up/down of Company A); driving factors; [conditional: writedown → mitigants / how addressed].

**Open design question (no decision yet — do not pre-commit):** Two candidate shapes identified; trade-off understood; choice deferred:

- **Option 1 — event type as a rule-model filter dimension** (`appliesToEvent`, symmetric with `appliesToVersion`); expected-element checks authored as individual event-scoped rules via the normal rule-addition cycle. Lower build/risk; sheds conditional-element complexity; rules stay in one maintainable cycle. Loses the grouped "completeness profile" view.
- **Option 2 — per-event expectation profiles** as a new completeness-check review mode (gap signals distinct from concerns). Richer; supports conditionals and a grouped completeness view; new machinery; higher absence-detection risk (**B14** — false-present silently passes a gap).

**Cross-cutting constraints** (hold under either shape): (a) **EXPECTED ≠ REQUIRED** — missing element is a soft, dismissable signal, never a hard concern or verdict downgrade; (b) **fail-safe bias** — when uncertain whether an element is present, flag as possibly-missing, never assume present.

### R6.3 — Principle-based Editorial concern suppression on Evidence conflict (closed 2026-05-31)

Closed 2026-05-31, tag `r6.3-principle-based-suppression`. Replaces R3.4's rule-ID-based suppression list with per-instance semantic judgment via a gpt-4o-mini call at card assembly time.

**Mechanism:** When Evidence verdict is `conflicting` and Editorial has concerns, a small LLM judge (gpt-4o-mini, temp 0, constrained JSON schema) reads the statement, the Evidence-conflict explanation, and the list of Editorial concerns. For each Editorial concern it decides DUPLICATE (the concern materially restates the Evidence finding) or INDEPENDENT (the concern is about register, voice, structure, defined terms, style, or any other dimension unrelated to the factual conflict). Defaults to INDEPENDENT when in doubt. Returns indices of concerns to suppress. Suppressed concerns are dropped from the card; remaining concerns render normally. Editorial verdict recomputes via existing `recomputeV4EditorialVerdictFromConcerns`; if all concerns suppress, Editorial renders Clean.

**Why principle-based not rule-ID:** Rule-ID matching is the wrong granularity. Two concerns from the same rule code on different statements may differ in whether they duplicate the Evidence finding. Per-instance LLM judgment handles per-instance variance; rule-ID matching produces brittle coverage gaps as new rules are added.

**Architecture:** Judge lives in new module `lib/qc/editorial-duplication-judge.mjs`. Suppression branch lives in `stage7-assemble-card.mjs` (replaced R3.4 logic, which is fully removed). Editorial review continues to run in parallel with Evidence — judge is downstream at card-assembly time only. `assembleCard` is now async, ripples to callers `qc-pipeline-v3.mjs` and `pipeline-v4/index.mjs` (await Promise.all).

**Failure mode:** Schema-validation failure after one retry → suppress nothing, emit canary `editorial_duplication_judge_failed`. System errs toward showing the reviewer everything.

**Observability:** Per-suppression canary `editorial_concern_suppressed_by_judgment` emitted via Langfuse `score()` with statementIndex, suppressedRuleId, and truncated concernText.

**Validated:** Three test runs against `r6_4c_test_source.txt`:
- Run 1 (Evidence Conflicting on IRR claim + hyperbole phrasing): judge suppressed the IRR-related Editorial concern (duplicative); kept the "absolutely stellar" hyperbole concern (independent). Editorial count: 1.
- Run 2 (Evidence Supported): judge did not fire. Editorial Clean naturally.
- Run 3 (Evidence Conflicting on IRR alone, no independent issues): judge suppressed all Editorial concerns. Editorial Clean.

Per-instance behaviour confirmed across statements.

- **R5 sequence — COMPLETE** (closed 2026-05-19). R5.1 (span derivation), R5.2 (span-based duplicate merge), R5.3a/b (overlay surface + traffic-light tints), R5.4 (Highlight in draft + concern scroll-and-underline), R5.4.1–R5.4.6 (card→draft navigation polish), R5.5 (disclaimer footer). Bidirectional draft↔card navigation is live. R5.1.2 remains planned separately.
- **R5.4.6 — Concern-click fallback underline** (shipped 2026-05-19). When a concern has no R5.1 spans, the click now blue-underlines the whole statement instead of yellow-highlighting it. Yellow highlighter is reserved exclusively for “Highlight in draft” clicks. Tag: `v8.50.6-concern-fallback-underline`.
- **R5.4.5 — Verdict tints clear during loading** (shipped 2026-05-19). Verdict tints hide when `analysisStatus === "loading"` on re-Review; toggle visual state unchanged.
- **R5.4.4 — Single statement highlight + re-Review clear + toggle link** (shipped 2026-05-19). One yellow statement highlight at a time; highlights clear on re-Review; “Remove highlighting” toggle on active card.
- **R5.4.3 — Highlight visibility under tints + statement/phrase coexistence** (shipped 2026-05-19). CSS cascade fix; split `activeStatementHighlight` / `activePhraseHighlight` state.
- **R5.4.2 — Highlighter-yellow statement visual** (shipped 2026-05-19). Statement highlight uses yellow highlighter background.
- **R5.4.1 — Statement highlight rendering fix + bolder phrase underline** (shipped 2026-05-19). Statement border → overlay highlighter; phrase underline weight increased.
- **R5.3b.2 — Tint hygiene and signal-colour alignment** (shipped 2026-05-20). Tint alpha bumped from 0.08–0.10 to 0.12–0.15 for better visibility. Tints auto-clear when draft text changes after Review. QC card left-border colour now uses worst-signal-wins (matches tint colour for the same statement). Tag: `v8.49.2-tint-hygiene`.
- **R5.3a — Convert “Your Draft” textarea to overlay-capable surface** (shipped 2026-05-18). Frontend foundation only; no visible behaviour change. Tag: `v8.48.0-draft-overlay`.
- **R5.2 — Span-based within-signal duplicate concern merge** (shipped 2026-05-18). Threshold: 80% overlap of the longer span. Format: numbered-list `(i)` `(ii)` … within a single concern. Multi-span derivation extended in R5.1 helper. Tag: `r5.2-duplicate-concern-merge`.
- **R5.5 — Compliance disclaimer footer** (shipped 2026-05-18). Results panel page footer plus PDF/DOCX export footer (canonical copy, single constant); timestamp consistency audit with shared `formatRelativeTime` / `formatAbsoluteTime` helpers. **Frontend:** `v8.47.0-disclaimer-and-timestamps`. **Backend:** `r5.5-export-disclaimer`.
- **R4.3 — Visibility wiring** (shipped 2026-05-17). Expanded confidential-detail rule, new disclosure-absent rule, new jargon rule (version-aware), Compliance and Editorial+Style system-prompt visibility calibration. Tag: `r4.3-visibility-wiring`.
- **R5.1 — Per-concern span derivation on v4** (shipped 2026-05-17). Editorial coverage ~96%, Compliance ~56%. Tag: `r5.1-concern-spans`.
- **R5.1.1 — Compliance prompt instructs phrase quoting** (shipped 2026-05-17). Compliance span coverage rose from ~56% to ~83% across post-deploy validation runs. Tag: `r5.1.1-compliance-phrase-quoting`.
- **Reviewer Assessment synthesis** (closed in R4.x). Narrative synthesis in senior editor voice; see Completed → Source Management.
- **Cost model spreadsheet** (closed in R1.x). See `docs/BACKLOG.md` Closed → P1.
- **R1.2 gpt-4o-mini Stage 2 source-matching evaluation** (closed via R1.2, R1.2.4, R1.2.5). Production Stage 2 remains gpt-4o + prompt v2.

### Governance docs (frontend repo)

- **`docs/FRONTEND_CONVENTIONS.md`** (brightline-content-engine-frontend) — created with R5.5. Documents the user-visible timestamp convention: **relative** time for lists and drawers (`formatRelativeTime`, tier definitions: Just now → minutes/hours → Yesterday at HH:MM → days ago → DD/MM/YYYY); **absolute** time for audit moments (`formatAbsoluteTime`, `DD/MM/YYYY, HH:MM GMT+8`). Canonical review disclaimer constant location also noted. **R5.3a:** `DraftOverlay` at `src/components/draft/DraftOverlay.jsx` — future “highlight in draft” work consumes it via the `highlights` prop; font config is shared with the textarea via `draftSurfaceFont.js` to prevent drift.

---

## QC rebuild backlog

Status of rebuild optimisation and cost items from the v4 planning track:

| ID | Item | Status |
|----|------|--------|
| **(A)** | LLM call consolidation | **R3.1 shipped** — Style+Editorial merged on v4 (`runEditorialStyleReview`). **Compliance deliberately kept separate** (different cognitive frame, reviewer trust; ~$0.02/run saving not worth signal dilution). **R3.2** (Stage 5 into Stage 2) **DEFERRED** — needs Stage 2 restructure; loses parallelisation. |
| **(B)** | Visibility wiring (Complete vs Public) | **CLOSED** via R4.3 (`r4.3-visibility-wiring`). |
| **(C)** | Stage 2 chunking cost ceiling for long sources | **Open** — not an immediate concern (F15 ran clean at ~4,800 words in diagnostic). Scope during **R6 Review Quality** when long-source warnings recur (see Parked → (C) below). |
| **(D)** | $2/run production cost target | **Tracking** — interactive Review ~$2/run (baseline). Full diagnostic batch ~$25–30 separate — see **D1.8**, **Working rules → Cost**. |

---

## R5 — Concern spans & draft highlighting

Sequence locked in 2026-05-17 planning session (in delivery order):

| Spec | Summary | Status |
|------|---------|--------|
| **R5.1** | Per-concern span derivation on v4 | **SHIPPED** — `r5.1-concern-spans` |
| **R5.1.1** | Compliance prompt encourages phrase quoting | **SHIPPED** — `r5.1.1-compliance-phrase-quoting` |
| **R5.1.2 [MVP]** | Confidential-detail rule covers unlabelled return multiples — expand `precise_confidential_detail_in_public_version` description to call out unlabelled return figures (e.g. “3.2x net of fees”, “delivered 4.5x”). LLM currently fires once per sentence and picks the most unambiguous metric (EV/EBITDA), missing MOIC-style figures. Promoted from R4.3 watch — pattern confirmed across two test batches. | Planned |
| **R5.2** | Span-based within-signal duplicate concern merge (supersedes product backlog “merge duplicate concerns”; uses R5.1 spans) | **SHIPPED** — `r5.2-duplicate-concern-merge` |
| **R5.3a** | Convert “Your Draft” textarea to overlay-capable surface (frontend foundation). **Path Y locked**; DraftContextPanel revival ruled out | **SHIPPED** — `v8.48.0-draft-overlay`. Ready for R5.3b/R5.4 consumers. |
| **R5.3b** | Statement-level traffic-light colour-coding in draft area with toggle (auto-on after Review unless reviewer toggles off); draft→card click navigation; word/char count — consumes R5.3a overlay | **SHIPPED** — follow-ups **R5.3b.1** (transparent textarea, auto-on on `statementRows`, toggle keyboard), **R5.3b.2** (`v8.49.2-tint-hygiene`) |
| **R5.4** | Wire existing “Highlight in draft” button (dead since R4.1) plus concern bullets, using R5.1 spans, to scroll-and-highlight phrases in the draft area on the R5.3a surface | **SHIPPED** — `v8.50.6-concern-fallback-underline` (base card→draft navigation) |
| **R5.4.1** | Statement highlight rendering fix + bolder phrase underline | **SHIPPED** |
| **R5.4.2** | Highlighter-yellow as the statement highlight visual | **SHIPPED** |
| **R5.4.3** | Highlight visibility under tints + statement/phrase coexistence | **SHIPPED** |
| **R5.4.4** | Single statement highlight, clear on re-Review, toggle link text | **SHIPPED** |
| **R5.4.5** | Verdict tints clear during loading state | **SHIPPED** |
| **R5.4.6** | Concern-click fallback as whole-statement blue underline | **SHIPPED** — `v8.50.6-concern-fallback-underline` |
| **R5.5** | Compliance disclaimer footer (Results panel + PDF/DOCX exports); timestamp consistency audit | **SHIPPED** — frontend `v8.47.0-disclaimer-and-timestamps`, backend `r5.5-export-disclaimer` |

**R5 sequence: COMPLETE.** All R5.x specs above shipped except **R5.1.2** (unlabelled return multiples — remains planned). **Bidirectional draft↔card navigation is live:** draft→card (R5.3b verdict tints + textarea click), card→draft (R5.4 concern underline + “Highlight in draft” yellow marker).

**Span contract (R5.1 → R5.2 → R5.4):** R5.1 introduced `span` as a single `{ startChar, endChar, source }` object on each concern. R5.2 generalises this to an **array** of one or more such entries (multi-phrase concerns emit multiple spans; merge concatenates and dedupes). **R5.4** consumes the array for click-to-highlight in the Assess draft overlay (phrase underline from spans; whole-statement blue underline when spans are absent — see R5.4.6).

**Note — macOS Safari keyboard accessibility:** The Verdicts toggle (R5.3b) uses correct ARIA switch semantics on a native `<button>`, but macOS Safari does not tab to buttons by default. Users on Safari must enable **Preferences → Advanced → “Press Tab to highlight each item on a webpage”** to navigate the toggle via keyboard. This is a Safari preference, not a code defect.

---

## R6 — Review Quality

**Status:** **SCOPING** (diagnostic batch complete 26 May 2026; candidates below informed by diagnostic findings)

**Objective:** Lift the quality, reliability, and insight of Review output. This is the moat. Pure-UI sprints have diminishing returns until Review output catches up.

**Evidence base:** Diagnostic batch runs `2026-05-26-205208` and `2026-05-26-212900` (see `docs/diagnostic_findings.md` and per-fixture `runs/` output); re-run `2026-06-01-122541` (see `docs/diagnostic_rerun_findings_2026-06-01.md`).

Items in scope (order indicative, not locked):

| Spec | Summary | Priority | Prior backlog |
|------|---------|----------|---------------|
| **R6.1** | **Direction intensity** — surface how strong a concern is, not just that one exists | — | Was product backlog #2 |
| **R6.2** | **Reviewer comments house style** — tighten commentary tone, remove filler, enforce QC Output Language Standard from AI Operating Manual | — | Was product backlog #3 |
| **R6.3** | **Hide Editorial on conflict** — principle-based suppression of duplicative Editorial concerns when Evidence is conflicting | **SHIPPED 2026-05-31** | `r6.3-principle-based-suppression` |
| **R6.4** | **Public version compliance** — R4.3 shipped wiring; sub-items R6.4a/b shipped 2026-05-30; R6.4c shipped 2026-05-31; R6.4d closed as non-issue | **SHIPPED — chapter closed 2026-05-31** | See Recently shipped → R6.4 |
| **R6.5** | **House style framework** — Layer 1 (universal writing quality) + Layer 2 (client default) + structured style guide input to the editorial reviewer | **SHIPPED 2026-05-27** | `r6.5.6-defined-term-refinement` — Framework + 5 deterministic backstops. See Recently shipped. |
| **R6.6** | **Source-public-state awareness** — harness wiring, residual-leg verification, content-bound named-individual suppression | **SHIPPED 2026-06-25** | R6.4a base; R6.6.1–R6.6.4; F21 fixture. See Recently shipped → R6.6 |
| **R6.7** | **Forward-looking statement review** — distinguish forward-looking claims; hedging, plausibility, visibility-calibration, alignment with stated risks | Medium | Diagnostic (F02, F03, F05, F08, F09) |
| **R6.8 [MVP]** | **Cross-source display semantics** — cross-source detection now **works** (F18 resolved — 0→3 conflicting, correctly). Open question is **display semantics only:** statements supported-by-source-A but contradicted-by-source-B currently read 'supported + conflict flag' (F18 S3/4/5/7). Decision needed: keep supported-with-flag, or escalate to partial/conflicting. Risk: a reviewer skimming green verdicts may miss the flag on a material discrepancy. Ben's lean: escalate — but **decide only after** reviewing how prominently the conflict flag surfaces in the UI. Reframed from 'fix aggregation' to 'decide display'. | Medium | Diagnostic (F18); re-run 2026-06-01 |
| **R6.9** | **Non-claim statement handling** — Stage 1 classifies each statement as claim/non-claim and drops pure non-claims (salutations, closings, bare transitions) after span mapping, so they never become QC cards or reach evidence/editorial/compliance review. Classification is statement-level: a statement is dropped only if entirely structural with no verifiable content; mixed structural+factual sentences are kept. Bias toward keeping when uncertain. All-non-claim safeguard prevents empty results. | **SHIPPED 2026-05-28** — `r6.9-non-claim-handling` | Diagnostic (F04, F11, F12, F14, F18, F20). **Follow-up elevated:** **R6.9.1** rhetorical/opinion statements still evidence-assessed (LinkedIn adapt, 2026-07-09) — see **Parked → R6.9.1**, **BACKLOG B37**. **Residual watch:** functional-element statements that survive Stage 1 — see **Watch items → R6.9 residual functional-element noise**. |
| **R6.10** | **Source quality audit** — independent of draft, audit each source for internal inconsistencies | Low | Diagnostic (F13 — caught 2/3 deliberate inconsistencies) |
| **R6.12** | **Document-type voice/register (editorial)** — output-type calibration block + LinkedIn `reviewerNoteByOutput` on voice/register/structural rules; closes editorial half of document-type-awareness gap (craft: **B26.2.4**). Broader salutation/business-description norms deferred to Layer 2 backlog. | **SHIPPED 2026-07-05** — `r6.12-editorial-output-type` | Diagnostic F12/F09; comments review 2026-06-01. Residual watch: F12 S6/S8 — see **Watch items → R6.12 residual LinkedIn editorial noise** |
| **R6.13** | **Review-intent wiring** — silent-default audit (R6.13-audit); Writing-path QC payload + stale log fix (R6.13.1, closes B20); regression calibration guards (R6.13.2); v4 review toggles (**B29**, 2026-07-05); QC `eventType` removal (**B28**, 2026-07-05) | **SUBSTANTIALLY SHIPPED 2026-06-25** (review toggles **B29**, `eventType` **B28** 2026-07-05) | Tier B open: BACKLOG B30–B31. See Recently shipped → R6.13, **B29 / B29.1**, **B28** |
| **R6.14** | **Event-type awareness** — writing matrix (event × output type); review-side expected-element handling (shape undecided: Option 1 rule filter vs Option 2 expectation profiles) | **SCOPED — SHAPE UNDECIDED** | Sequenced after B21–B23; QC path cleaned (**B28**). See **R6.14 — Event-type awareness** |

**R6.2 sub-items (commentary quality):**

- **R6.2a** — Disentangle promotional-language flags into hyperbole vs qualitative-descriptor. **SHIPPED 2026-05-30** — `r6.2a.1-promotional-language-calibration` (combined R6.2a + R6.2a.1). Option A locked: flag explicit hyperbole only when unsubstantiated; never flag standard qualitative descriptors. Three coordinated edits: `marketing_language_excess` (editorial rulebook) hyperbole list tightened with explicit do-not-flag list for standard descriptors; `hyperbole_vs_qualitative` (style guide Layer 1) aligned same; `VISIBILITY_CALIBRATION_EDITORIAL_STYLE` no longer tightens on promotional language. R6.2a.1 follow-up strengthened the substantiation carve-out (adjacent figure/comparator suppresses flag — Run E example: "exceptional 22% net IRR vs benchmark 14%" no longer fires), softened compliance "typically restricted under fund marketing regulations" prose, and removed schoolroom framing ("not permissible", "is not acceptable") from editorial concern text. Validated across 6-run suite: standard descriptors clean on both Complete and Public; hyperbole still fires when bare; substantiated hyperbole does not fire.
- **commentary-calibration (minor)** — Collapse unsubstantiated "leading" superlative concern prose to the standardised single line (`"leading" is an unsubstantiated superlative; remove or substantiate.`). Logged from `commentary-calibration` ship (2026-06-03): prompt instructs the line; output may not yet conform consistently.
- **R6.2b** — Structural recommendations as editorial sub-dimension (bullet candidates, paragraph breaks). Evidence: F08, F11.
- **R6.2c** — Dimension-naming for "off phrasing" feedback. Evidence: F08, F11, F19.
- Low-materiality / cosmetic-change over-firing (observed R6.9 edge-case testing 2026-05-28): editorial reviewer fired a concern suggesting "Yours sincerely," → "Sincerely," — a cosmetic change with no codified house rule behind it and no material improvement to the copy. Proposed R6.2 calibration principle: a concern is only worth surfacing if acting on it would change the copy in a way the writer would care about. Do not flag stylistic preferences that are not codified house rules, and do not flag changes whose substance is unchanged. Testable principle for R6.2a/c scoping.
- **Side observation 2026-05-30** — R6.2a.1 Run F: the previously-observed voice misread ("The Fund has" interpreted as first-person, recommending "The Fund reports") did NOT recur after the schoolroom-framing guidance was added to `CONCERN_TEXT_META`. Plausible reason: the gatekeeping guidance generally raised the LLM's threshold for emitting concerns, so borderline/wrong-direction concerns dropped below the firing bar. Single observation only — do not treat as a fix; if the voice misread recurs in future testing, log under a dedicated rule-misclassification item.

### Layer 2 style rules backlog (running list)

The R6.5 two-layer style guide is designed to accrete client-specific rules over time. As the editorial reviewer fires stylistic concerns that contradict actual PG house style, those gaps are logged here and batched into periodic rule-addition passes (fast edit cycle: `style-guide.mjs` + `npm run diagnostic:style-guide`).

Rules to add:
- Salutation conventions per output type. PG house style uses "Dear valued investors," as the salutation for investor letter outputs. The editorial reviewer currently flags this as too personal and suggests "Dear Investors," because no Layer 2 rule covers salutations. Add a rule codifying correct salutations by output type. Surfaced 2026-05-28 (R6.9 edge-case testing).

(Future salutation/style gaps appended here as discovered.)

### R6.2d — Editorial fidelity discipline

- Fidelity discipline — eliminate fabricated quotes in editorial commentary. Evidence: `[FIDELITY_DROP]` log entries from both diagnostic runs; feeds **D1.5**.
- **Fidelity-drop-on-corrected-phrase pattern** (observed R6.5.1 testing): LLM cites the corrected form of a violation rather than the offending text. Examples: `number_spelling` cites `'12'` when statement contains `'7 investments'`; `currency_format` cites `'EUR 445 million'` when statement contains `'€445m'`; `english_variant` cites `'organize'` when statement contains `'organise'`. Fidelity guard correctly rejects but the concern is lost.
- **Contradictory-concern-field pattern** (observed R6.5.1, R6.5.4 testing): LLM produces a concern where the note acknowledges the text is correct, the `suggestedDirection` asks for a change, and the `suggestedRewrite` is identical to the input. Examples: S3 `defined_term_capitalisation` pre-R6.5.4 produced "Change 'The Company is profitable' to 'The Company is profitable'"; S9 `defined_term_capitalisation` pre-R6.5.6 produced "Change 'the Company' to 'the Company'".
- **Source-style conflation pattern** (observed R6.5 F01 live regression): LLM treats source text style as authoritative over house style. Statement uses `5'500` (PG-correct apostrophe separator); source uses `5,500` (comma separator); LLM fires `thousand_separator` concern recommending changing the correct draft to match the source's incorrect form. Resolved at the filter layer via R6.5.5.

**R6.4 sub-items (Public version compliance):**

- **R6.4a** — Visibility-context awareness (recognise when source is already public). **SHIPPED 2026-05-30** — `r6.4a-source-publication-state` (backend) + `v8.52.0-r6.4a-publication-state` (frontend). Combined R6.4a + R6.4a.1 + R6.4a.2 in one tag.

  **Scope shipped:**
  - R6.4a: structured publicationState field on source objects (published_external / restricted / unknown). LLM inference at upload via api/summarize-source.js. Persistence through pipeline. Compliance receives per-source publication state in user payload. New SOURCE PUBLICATION STATE AWARENESS block in VISIBILITY_CALIBRATION_COMPLIANCE instructs the LLM to suppress confidential-detail, hyperbole, and marketing-language-superlative concerns when the offending content is materially present in a published_external source. Suppression is content-bound (new claims still fire) and rule-scoped (forward-looking, comparative, selective-hedging rules unaffected).
  - R6.4a.1: classifier prompt recalibration — explicit markers list (FOR IMMEDIATE RELEASE, location+date header, media contact, About boilerplate, SEC identifiers, etc.) treated as sufficient for published_external without independent verification. Conservatism reframed as tie-breaker, not default.
  - R6.4a.2: missing call site wired. The Assess upload path (useAssessState.jsx handleUploadSourceFiles) had never called apiSummarizeSource — every source defaulted to "unknown". Ported summariseSourceInBackground pattern from useDraftState.jsx. This was the actual unlock; R6.4a.1's prompt iteration was diagnosing a problem in the wrong layer because the classifier was never running.

  **Validated end-to-end:**
  - Published press release → published_external → Compliance suppressed (hyperbole + EV concerns dropped)
  - Generic source → unknown → Compliance unchanged (regression intact)
  - Mixed draft (source content + new claim) → suppression on source content, new claim still flagged correctly (content-bound)

  **Out of scope, deferred:**
  - Full source metadata UI (description display, drawer context) — R6.4b shipped publicationState pill + override in Assess Sources panel (2026-05-30); description display and drawer redesign deferred to R7.

  **R6.4a.3 + R6.4b — Combined ship 2026-05-30:**
  - Backend tag: `r6.4a.3-restricted-rename`
  - Frontend tag: `v8.53.0-r6.4b-publication-state-ui`

  R6.4a.3 (backend): Renamed the publicationState enum value `internal_or_draft` to `restricted`. The previous name was misleading for external-but-restricted documents (e.g. an external fund's investor report is neither internal nor a draft, but it is restricted-distribution and should not relax Compliance). Broadened classifier criteria to recognise:
    - External-but-restricted: investor letters, LP reports, capital call notices, distribution notices, fund quarterly/annual reports, AGM/EGM materials, pitch decks for defined audiences
    - Internal: IC papers, valuation papers, strategy/market decks, internal AGM materials, board papers (criteria already present, retained)

  Calibration note added to classifier prompt: polished production format does NOT equal public distribution. A professionally-designed LP presentation deck is still 'restricted' if its audience is a defined set of investors rather than the general public. Judge audience and distribution, not production quality.

  R6.4b (frontend): Added a small pill component to each source row in the Assess Sources panel showing the current publicationState as a plain English label ("Published externally" / "Restricted" / "Unclassified"). Clicking the pill opens a dropdown allowing the user to override the LLM's auto-inference. Override is session-scoped (resets on page reload / re-upload). Pill order in the dropdown: Published externally, Restricted, Unclassified.

  Validation across four phases:
  - Phase A (rename regression): published_press_release.txt → published_external; internal_memo.txt → restricted; generic_text.txt → unknown
  - Phase B (broadened criteria): external_fund_investor_letter.txt, internal_valuation_paper.txt, lp_capital_call.txt all classify as restricted
  - Phase C (UI override): override reaches Compliance; user can change pill value via dropdown; Compliance applies the user-selected state on next Review
  - Phase D (R6.4a regression): R6.4a headline suppression behaviour preserved after rename; hyperbole and EV concerns on AtNorth draft still suppressed when source is published_external

  **Suppression boundary — subject substitution.** Phase C live testing surfaced that Compliance suppression engages cleanly for confidential-detail concerns (specific figures present in the source) but does NOT engage for hyperbole concerns when the draft renames the subject of the claim. Example: source contains "the asset is exceptionally well positioned in its niche"; draft contains "Project Lumen is exceptionally well positioned in its niche". With the source overridden to published_external, the EV concern on a separate statement suppressed cleanly, but the hyperbole concern on the renamed statement still fired.

  The LLM appears to treat subject renaming (a generic noun becoming a specific named entity not in the source) as breaking the content-bound link, even though the hyperbole language itself is verbatim from the source. This is defensible behaviour — it prevents abuse where someone could lift hyperbolic language from one source and apply it to a different subject — but it limits the perceived effectiveness of override on hyperbole concerns.

  Confirmed across two test cases (AtNorth where subject "AtNorth" appears verbatim in source → suppression worked; Project Lumen where "the asset" was renamed to "Project Lumen" → suppression did not engage).

  Possible future fix: prompt edit to explicitly instruct that subject substitution is a normal editorial choice that does not unbind content from the source. Risk: looser suppression opens potential abuse (applying source hyperbole to a different subject). Not addressing tonight; revisit if real reviewer usage surfaces complaints. Logged 2026-05-30.
- **R6.4b** — Jurisdiction-aware fund marketing rules. Evidence: F02.S5 `hard_concern` on "exceptionally well positioned" was fund-marketing-regulation flag misapplied to portfolio transaction release. **Addressed by R6.4c** (regulatory rule scope refinement) — see Recently shipped → R6.4.
- **R6.4c** — Regulatory rule scope refinement. **SHIPPED 2026-05-31** — `r6.4c-regulatory-rule-scope`. See Recently shipped → R6.4.
- **R6.4d** — Sensitivity-tier calibration. **CLOSED 2026-05-31 as non-issue** — see Recently shipped → R6.4.

**Side observation 2026-05-30** (R5.2(a) Run 3): compliance correctly fired on "The Fund is genuinely exceptional and unparalleled" (fund performance superlatives) and "is genuinely best-in-class" (fund performance superlative) in Runs 1 and 2, but did NOT fire on "the team is unparalleled" in Run 3 — superlative applied to the team, not fund performance or returns. This is correct behaviour: `regulatory_prohibited_language` is calibrated to flag superlatives applied to fund characteristics and performance, where fund marketing regulations apply. Confirms that compliance is well-calibrated on the "which superlatives carry regulatory weight" dimension. No action needed; banked as positive calibration evidence.

**Watch items to fold into R6 scoping:**

- **R2.7.1** — **Watch OPEN** (see **Watch items → R2.7.1**). Shipped 2026-05-28; ongoing trace review for conflict/partial edge cases. **Not modified by R2.7.2** — period work did not touch conflict/partial routing for relative or absent-fact statements.
- **Rebuild backlog (C)** — Stage 2 chunking ceiling. Not immediate (F15 clean at ~4,800 words). Scope when long-source warnings recur.
- **Rebuild backlog (D)** — Production cost tracking. Diagnostic pass complete; baseline ~16 calls / 4 statements / 1 source; interactive Review ~$2/run. Full diagnostic batch ~$25–30 (see **Working rules → Cost**).

---

## R2.7.1 — Stage 2 conflict vs partial (spec candidate)

**Status:** **SHIPPED 2026-05-28** — `r2.7.1-conflict-partial-calibration`

**Shipped scope (prompt-only, stage2_v4.md):** (1) Voice/framing/person differences are not contradictions when the underlying fact is identical (F12.S0 fix). (2) Resolved an internal prompt contradiction on entity handling: a different entity in the same role (replacement) is `conflicting`; a missing entity not replaced (omission) is `partially_confirmed`. (3) A statement with no verifiable claim cannot be `conflicting` (at most `no_support`). Validated across four cases: voice difference -> confirmed; entity replacement -> conflicting; entity omission -> partially_confirmed; figure contradiction guard -> conflicting.

**One-line:** Tighten Stage 2 distinction between `conflicting` and `partially_confirmed` — absent-fact statements, voice rephrasing, and semantic disagreement should not land as `conflicting` when the source does not directly contradict.

**Why elevated now:** Diagnostic batch confirmed the issue is live — F12 voice-rephrasing-as-conflict; broader Stage 2 classification observations across fixtures. This is upstream of R6 editorial/compliance work and may need to ship sooner than the R6 umbrella.

**Relationship to R2.7.2:** Semantic frame matching (R2.7.2) improves partial-vs-conflict discrimination on numeric/frame mismatches; R2.7.1 addresses classification tone and absence-vs-contradiction boundaries.

**Scope when specced:** Stage 2 prompt and classification guidance. No new verdict enum values.

---

## R2.7.2 — Stage 2 semantic frame matching

**Status:** **SHIPPED 2026-06-01** — `r2.7.2-frame-matching`. See **Recently shipped → R2.7.2** for full scope, period limitation, and verification notes.

---

## R2.7.2.1 — Relative-source-period resolution

**Status:** **LOGGED** (backlog **B17**)

**One-line:** Stage 2 period matching fails when the **source** expresses the period relatively ('over the same period', 'today') requiring inference from the document date.

Four prompt-mechanism attempts (two prose, two structured-field) all failed: the model resolves the relative reference to whatever period confirms the statement rather than computing it from the document date. Prompt-only approaches exhausted (B14 pattern).

**Proposed mechanism:** a **deterministic date-resolution pass** that computes the source's calendar period from the document date **before** Stage 2 and hands the matcher a pre-normalised `sourcePeriod`. New capability, not a prompt tweak.

**Priority:** M. Independent of R6.

**PARKED (practical blocker, 2026-06-01 scoping).** Diagnostic confirmed no structured source publication date exists anywhere in the upload→Stage1→Stage2 path; only `publicationState` survives to Stage 2 and is dropped before matching. The deterministic date-resolution pass would require threading a new date field through the pipeline PLUS an upstream date-extraction step. Extraction is reliable only for press-release datelines; GP reports / IC docs carry dates unstructured and often multiple-per-document, where extraction would resolve the wrong date — re-introducing the inference unreliability upstream. Decision: stay parked at M; explicit-vs-explicit gating (shipped in R2.7.2) covers the tractable case. Reactivate only if relative-source-period mismatches prove common in real reviewer drafts.

---

## Near-term — Review output (2026-06-01 diagnostic + comments review)

**Recommended order:** ~~commentary calibration (B22 + B22.1 + B22.2)~~ → ~~editorial rule bug-fix pass (B23 / R6.2e + R6.2f)~~ → ~~editorial schema-fallback (R6.11a + R6.11b + B21)~~ → ~~**R6.6 (source-public-state)**~~ → ~~**B26 / B26.1 (constructive feedback output)**~~ → ~~**B26.2 (constructive feedback craft pass)**~~ → ~~**B26.2.2 (constructive feedback readability)**~~ → ~~**B26.2.4 (output-type-aware craft pass)**~~ → ~~**R6.12 (editorial output-type voice/register)**~~ → R7.

| Item | Summary | Priority |
|------|---------|----------|
| **COMMENTARY CALIBRATION (Stage 5 / reviewer-prompt)** | **SHIPPED / closed (B22 chapter)** — B22 + B22.1 + B22.2. Tags: `b22-commentary-calibration` (orig `commentary-calibration`), `b22.1-commentary-specificity`, `b22.2-editorial-excerpt-removal`. Full closeout + verification caveats: **BACKLOG B22**. | Shipped |
| **EDITORIAL RULE BUG-FIX PASS** | **SHIPPED 2026-06-03** — Tags: `r6.2e-editorial-rule-bugfix` (editorial/style), `r6.2f-compliance-rule-bugfix` (compliance). Outcome per rule: **`date_format`** — fixed; full-month house standard (`19 January 2026`) required; abbreviated/US/ISO flagged; deterministic backstop added. **`percentage_notation`** — new Layer 2 rule (`5.4%` not `5.4 percent`) + `number_spelling` guard + fidelity carve-out; silent-strip failure resolved. **`internal_plausibility`** — scope language added (intra-sentence only); see **Watch items → internal_plausibility** (B14 fidelity pattern). **`passive_voice_overuse`** — concise-Direction discipline added. **`comparative_claim_without_basis`** — recognises in-sentence/immediate-context basis; bare superlative still fires (R6.2f). **`forward_looking_statement_without_qualifier`** — `we expect` / `expect` / `expects` / `expected` adequate hedging on Complete and Public; visibility-calibration contradiction removed (R6.2f). **Parked (do not spec):** `structural_integrity` — not reproducible, watch only; `thousand_separator` — already fixed by R6.5.5 statement-scoped backstop — confirm clean on next diagnostic batch. Symptom mislabelled as `materiality` was **`comparative_claim_without_basis`** (fixed in R6.2f). | Shipped |
| **R6.11 — EDITORIAL SCHEMA-FALLBACK (silent failure)** | **SHIPPED / chapter closed 2026-06-25** — Three layers: **R6.11a** reliability (per-concern salvage, cross-book reclassification, retry correction note; verified **B21-diag-confirm**); **R6.11b** card (`not_reviewed` — amber "Needs manual review", distinct from clean/concern); **B21** log (`[EDITORIAL_STYLE_REVIEW] fallback raw output` with per-attempt `rawOutput` + `rejectReason` in `pipeline.log`). Fallback emits `editorialVerdict: "not_reviewed"` with `editorialConcerns: []` and `editorialNote: ""`; genuine clean retains the canonical note. **Minor follow-up (no spec yet):** `not_reviewed` borrows the soft-concern tier in the frontend composite badge (`StatementAnalysisPanel`); counting and surfacing are correct. Residual watch: **BACKLOG B33**. | Shipped |
| **R6.12 — EDITORIAL OUTPUT-TYPE VOICE/REGISTER** | **SHIPPED 2026-07-05** — See **Recently shipped → R6.12**. Prompt calibration block (v4 combined + legacy editorial paths); `reviewerNoteByOutput` on `voice_consistency` / `register_mismatch` / `structural_integrity` for `linkedin_post`; editorial `reviewerNote` emission in `formatRulesForPrompt`. Verified F12 (voice/register over-fire cleared) + F09 control. Closes editorial half of document-type-awareness gap (craft: **B26.2.4**). Residual watch: F12 S6/S8. Tag: `r6.12-editorial-output-type`. | Shipped |
| **B26 / B26.1 — CONSTRUCTIVE FEEDBACK OUTPUT** | **SHIPPED 2026-06-30** — See **Recently shipped → B26 / B26.1**. Base **B26** + consolidation **B26.1** (group-by-statement bundles keyed on `cardIndex`, worst-first statement order, `CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER`, scrollable modal + per-run cache). Tags: `b26.1-feedback-consolidation`, `v8.56.0-b26.1-feedback-consolidation`. **Resolves open list #19** (Reviewer Assessment not reframed). | Shipped |
| **B26.2 — CONSTRUCTIVE FEEDBACK CRAFT PASS** | **SHIPPED 2026-06-30** — See **Recently shipped → B26.2**. Document-level craft pass + reviewed-draft snapshot; B26.2.1 assembly (single opening, continuous numbering, dimension-6 figure scan). Tags: `b26.2.1-craft-assembly` (backend), `v8.57.0-b26.2-craft-pass` (frontend). | Shipped |
| **B26.2.2 — CONSTRUCTIVE FEEDBACK READABILITY** | **SHIPPED 2026-06-30** — See **Recently shipped → B26.2.2**. Quote-length discipline + figure-overlap dedupe (backend); assess summary bordered collapse + author-feedback button/modal labels (frontend). Tags: `b26.2.2-feedback-readability`, `v8.58.0-b26.2.2-feedback-readability`. | Shipped |
| **B26.2.4 — OUTPUT-TYPE-AWARE CRAFT PASS** | **SHIPPED 2026-07-05** — See **Recently shipped → B26.2.4**. Frontend sends `outputType` on author-feedback request; backend normalizes and threads into craft call only (null → generic). Six craft dimensions calibrate per format (LinkedIn, press release, investor letter, reporting commentary default). Card pass, selection, bundling, ordering, snapshot, output contract unchanged. Resolves **BACKLOG B35**. Editorial voice/register: **R6.12** (shipped 2026-07-05). Tags: `b26.2.4-craft-output-type`, `v8.59.0-b26.2.4-craft-output-type`. | Shipped |
| **SRC1 — SOURCE STATUS PILL ALIGNMENT + OVERRIDE GUARD** | **SHIPPED 2026-07-05** — See **Recently shipped → SRC1**. Pill right-aligned in Assess + Drafting source rows; `publicationStateSource` auto/manual guard via shared `applySourceSummaryPatch.mjs`; test `tests/source-publication-state-patch.mjs`. Frontend-only — no backend/payload/Compliance change. Tag: `v8.60.0-src1-source-status-override`. Resolves **Active Backlog #18(b)** (pill alignment); **#18(a)** in-flight indicator deferred. | Shipped |
| **B34 — REMOVE ASSESS REVIEW SETTINGS AUTO-DETECT** | **SHIPPED 2026-07-05** — See **Recently shipped → B34**. Removed `trySessionAutoDetect`, badge, lock refs, and `apiDetectOutputType`; Review Settings manual-only (default **Reporting commentary** / **Complete**). Backend `detect-output-type` endpoint + model-config stage deleted. No change to Drafting, generate/rewrite/analyse/export, or QC. Tags: `b34-assess-auto-detect-removal` (backend), `v8.61.0-b34-assess-auto-detect-removal` (frontend). | Shipped |
| **B28 — REMOVE UNUSED EVENTTYPE FROM QC PATH** | **SHIPPED 2026-07-05** — See **Recently shipped → B28**. Removed editorial DOCUMENT CONTEXT `eventType` line and related QC reads; Generate/Rewrite framing retained. Tag: `b28-remove-eventtype`. | Shipped |
| **WR1 — WRITING SCAFFOLD (PG DEMO)** | **SHIPPED 2026-07-06** — See **Recently shipped → WR1**. PG prompt library (`eventType` × visibility); Writing input modal; Methodology Note; deterministic backstops + canaries; Assess generate wiring. Tags: `wr1-writing-scaffold` (backend), `v8.66.0-wr1-writing-scaffold` (frontend). Resolves **WSC1** / **Near-term — Writing scaffold**. | Shipped |
| **A10 — ADAPT INTO ASSESS** | **SHIPPED 2026-07-09** — See **Recently shipped → A10**. Adapt modal + `handleAdapt` in Assess; derivation on timeline entries; full QC on adapted drafts. Sub-ships: **A10.1** (button/Beta/labels), **A10.2** / **A10.2.1** / **A10.2.2** (lineage carry-forward, chip label, panel fill, scroll-to-top, resize-none). Tag: `v8.51.0-rA10-adapt-into-assess` (frontend). | Shipped |
| **R6.6 — SOURCE-PUBLIC-STATE AWARENESS** | **SHIPPED 2026-06-25** — See Recently shipped → **R6.6**. Figure leg (R6.6.1 harness); rename leg out of scope; named-individual leg (R6.6.3 content-bound suppression, F21 both directions). Residual watch: **BACKLOG B27**. | Shipped |

### B26 — Scoping inputs (superseded)

Pre-spec inputs from Straits Times / Ren analysis informed B26 but are **superseded** by shipped **B26 / B26.1** (see **Recently shipped → B26 / B26.1**). Register: `CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER` (editor-to-writer, warm-through-specificity). Per-house language profile remains a long-horizon idea (below).

---

## Near-term — Writing scaffold (demo-facing)

**Status:** **SHIPPED 2026-07-06 — WR1**. See **Recently shipped → WR1**.

PG-grade Generate for the Tuesday PG demo via scaffolded prompt library + Writing input modal. Two event types — **new fund commitment** and **new direct investment** — each with Complete / Public blocks. Generation path only; no QC change (**B28**).

**Follow-on (post-demo):** true both-version output (**WR2**); blank-transaction-date guard on modal (**WR2.1**); broader event types (**B32** / **R6.14**).

**Cross-refs:** **BACKLOG WR1** (closed); **Pr9** (interim suggest-revised-draft — now unblocked post-demo).

---

## R7 — Sources Drawer Revival [MVP]

**Status:** **CORE COMPLETE** — Build A (`r7-build-a`); extractor swap (`extractor-officeparser-swap`); Build B (`r7-build-b`); Build C (`r7-build-c`); drawer UI v1 (**BACKLOG F12** / `v8.68.0-f12-sources-drawer`); Office ingestion fix (**BACKLOG B47**); excluded-sources display (**BACKLOG F13** / Sprint 1). Remaining optional: depth-of-support (**BACKLOG B41**).

**Objective:** Restore the Sources drawer and wire card→source navigation, completing the draft↔card↔source triangle.

**Premise correction (2026-08 — prior assumption falsified):** The old claim that “existing `evidenceTrace` already carries a source id + locatable span” is **false**. On live v4, Stage 7 emits `evidenceTrace: []` (empty); the card contract has **no** reliable offset field there; the frontend **never reads** `evidenceTrace`. Do not design the drawer around it.

**Actual data surface (after Build A + extractor swap + Build B + Build C + F12):**

- **Multi-span evidence data** lives on **`qcCard.supportSpans`** (Build A + B): per-span `sourceRefId`, classification, statement id, passage text; **offsets populated** where the passage locates in stored source text (null on miss).
- **Source text for the drawer** — analyse-statements response emits an aligned **`sources`** array (index === `sourceRefId`; each entry has extracted `text`, `id`, `label`, `publicationState`) plus a separate **`excludedSources`** list (reason code), for all source kinds including PDF (**BACKLOG B46** / Build C). **B47** ensures Office uploads reach officeparser as binary (not inline zip text).
- **Verdict path unchanged:** single-pick Stage-2 still feeds aggregation / primary excerpt; widened emit is additive only.
- **Navigation** rests on **`supportSpans` + response `sources[]`** (and later extractor `extraction.structure` metadata for page/slide/sheet) — **not** on `evidenceTrace`.
- **Highlight surface (v1 shipped):** extracted-text drawer with verdict-coloured highlights where offsets resolve; rendered-document fidelity view remains a later sub-item.

**Shipped this chapter:**

- **Build A** — see **Recently shipped → R7 Build A**. Tag: `r7-build-a`.
- **Extractor → officeparser@7.5.1** — see **Recently shipped → Extractor swap**. Tag: `extractor-officeparser-swap`. Foundational for faithful locate + structure IDs.
- **Build B** — see **Recently shipped → R7 Build B**. Tag: `r7-build-b`. Offsets on `supportSpans`; unblocks drawer highlight.
- **Build C** — see **Recently shipped → R7 Build C**. Tag: `r7-build-c`. Aligned `sources` + `excludedSources` in analyse-statements response.
- **F12 Sources Drawer v1** — see **Recently shipped → R7 F12**. Tag: `v8.68.0-f12-sources-drawer`. Reader + three openers + verdict colours + hover.
- **B47 Office ingestion** — shipped alongside F12. Tags: `b47-office-inline-guard`, `v8.67.0-b47-office-upload-fix`.

**Remaining:**

1. ~~**Excluded-sources display**~~ — **SHIPPED 2026-08-11** (**BACKLOG F13** / Sprint 1). Drawer “Excluded · Not reviewed”; exclusion includes `unsupported_scanned`.
2. **Optional parallel:** Stage-2 multi-passage depth-of-support (matcher emits multiple passages per statement×source) — verdict-adjacent; needs own neutrality diagnostic. **BACKLOG B41**.

**Watch (F12 / conflict-vs-partial):** widened-matcher classification can mislabel a non-confirmation (or confirming-looking passage) as `conflicting` on `supportSpans` (seen in Build B live run and F12 drawer red highlights). Affects drawer span colour; `supportSpans` never feed the evidence verdict aggregation, but Stage-2 classification is still verdict-adjacent if ever unified. Tracked as **BACKLOG B48** (conflict-vs-partial calibration — read-only diagnostic + neutrality/shadow check before change).

**Earlier context (still valid, unchanged intent):**

- **2026-05-30 (R6.4a/b):** publicationState pill + override shipped in Assess Sources panel; full description display and drawer redesign remained R7. publicationState badge reused in the drawer.
- Card→source navigation and browsable source content remain the product goal; the **backend path** to spans is now `supportSpans` + structure metadata, not `evidenceTrace`.

---

## R4.2 — Dead-code cleanup (parked)

Parked pending dogfooding evidence. Bundle:

- **Cosmetic:** `[EDITORIAL_REVIEW] starting` log prints `visibility: null` before `normalize*` — stale pre-normalisation values (`lib/qc/editorial-compliance-reviewer.mjs`).
- **v3 retirement:** decommission v3 route and dual-path editorial/compliance code once dogfooding evidence accumulates (target: 15–25 production traces, no canary fires; see Architectural debt → R3.1).
- **Legacy timestamp formatting (frontend):** `DraftOutputPanel.jsx`, `WritingBadge.jsx`, and `DraftContextPanel.jsx` still use `toLocaleString` for timestamp display (legacy Writing/Quality surfaces). Intentionally not touched in R5.5. **Reachability check 2026-08-22 supports deletion rather than repair** (same evidence as **BACKLOG Pr12**): `addUrlSource` is unreachable from any rendered control; its only caller is the URL field in `SourcesPanel.jsx`, which nothing imports; `/writing`, `/quality` and `/quality-review` all redirect to `/assess`; `FocusWorkspace` and `QualityPageLayout` remain in `App.jsx` but are on no live route. A miswiring in `addUrlSource` (it calls the URL-building helper rather than a client for `/api/fetch-url`) is not user-visible and was deliberately not fixed.

---

## Diagnostic harness backlog

Infrastructure follow-ups from the 26 May 2026 diagnostic session (not R6 product work):

| ID | Summary | Priority |
|----|---------|----------|
| **D1.4** | Incremental `INDEX.md` write per fixture — currently written only at end of batch run; deviates from D1.1 spec | Low |
| **D1.5** | Pipeline log analysis — CLOSED 2026-05-27 without completion. Investigation found the diagnostic harness did not capture stdout to disk, so the historical `[FIDELITY_DROP]`, `[EDITORIAL_STYLE_REVIEW]`, and `[stage2]` log entries from runs `2026-05-26-205208` and `2026-05-26-212900` are not recoverable. Decision: skip the data-collection. The three qualitative **R6.2d** candidate patterns captured in R6.5 testing (fidelity-drop-on-corrected-phrase, contradictory-concern-fields, source-style-conflation) carry forward as primary evidence for **R6.2d** scoping. | Closed |
| **D1.6** | Diagnostic harness stdout capture — modify `scripts/diagnostic/run-batch.mjs` to capture per-fixture stdout to a `pipeline.log` file alongside `result.json`. Surfaced during D1.5 attempt: the bracketed pipeline log entries (`[FIDELITY_DROP]` et al.) print to stdout but are not persisted to disk, making post-hoc analysis impossible. Small change; do before next diagnostic batch. | Low |
| **D1.8** | **Diagnostic batch cost discipline.** Full ~20-fixture batch ~$25–30 total (~$1.25–1.50 per fixture). **Flag before full-batch runs**; prefer targeted `--only` subsets first. Distinct from interactive Review production cost (~$2/run). Logged 2026-07-09 (post-A10 doc sync). | Low |
| **D1.7** | Re-audit fixtures with unexpected verdict deltas (F06, F08, F09, F11, F17, F19) — per-statement walk to determine whether pipeline or expected outcome is correct | Low |

---

## Sequencing — Attention-Router throughline

PG feedback (review-aware drafting + direct the reviewer to what needs a human) resolves into a single **human-attention router**: **prevent** (drafting) → **triage** (Review) → **clear the mechanical** (Pr9). The product reframes from “flags everything” to “routes scarce reviewer attention.”

**Proposed sprint sequence** (each delivers standalone value and advances the router):

1. ~~**Foundation & quick wins (Sprint 1)**~~ — **SHIPPED 2026-08-11** — excluded-sources display (**F13**) + **B45** URL provenance. (**F1** / **F2** / **F7** Assess surface verified resolved 2026-08-09 — DraftOverlay path.) Tags: `b45-url-provenance-scan` / `v8.69.0-b45-provenance-display`; `f13-scanned-source-exclusion` / `v8.70.0-f13-excluded-sources`.
2. **Close the loop (Sprint 2 — next up)** — **Pr9** Suggest revised draft (interim shape, not full **B9**) = the router’s auto-apply bridge.
3. **Sharpen the signal (Sprint 3 — deliberate, verdict-adjacent stretch)** — **B13** + conflict-vs-partial calibration (**B48**) (+ optional **B37**); each needs its own diagnostic + neutrality check. These are the materiality/confidence inputs triage needs. Do not rush; review-quality chapter.
4. **Triage derivation** — deterministic “Human check required” shortlist over Review output (the PG ask); trustworthy once step 3 lands.
5. **Review-aware drafting** — apply the shared **R6.5** rulebook at generation to shrink the mechanical lane at source (**WR2** substrate).

**Parallel tracks:** Adapt maturity (**Pr10**→**Pr11**, gate on usage); **B42** bundle debt; **P6** business.

Triage/router items stay **concept/backlog** until their calibration prerequisites land — not “in progress” yet. Sequence lives here; backlog rows keep their priorities until scheduled.

---

## Open product backlog (prioritised)

Tracked here for roadmap visibility; detail rows also live in `docs/BACKLOG.md`. Top = highest priority.

1. ~~**WSC1 / WR1 — Writing scaffold (demo-facing)**~~ — **SHIPPED 2026-07-06** — see **Recently shipped → WR1**. PG prompt library, Writing input modal, Methodology Note, deterministic backstops, Assess generate wiring. Tags: `wr1-writing-scaffold` (backend), `v8.66.0-wr1-writing-scaffold` (frontend).
1b. ~~**A10 — Adapt into Assess**~~ — **SHIPPED 2026-07-09** — see **Recently shipped → A10**. Frontend `v8.51.0-rA10-adapt-into-assess`; backend `/api/adapt` unchanged.
2. **R6 — Review Quality** (active scoping) — umbrella for R6.1–R6.10, R6.12. **R6.5** house style framework shipped 2026-05-27. **R6.4** chapter closed 2026-05-31 (R6.4a/b/c shipped; R6.4d closed as non-issue). **R6.3** shipped 2026-05-31. **R6.6** source-public-state awareness shipped 2026-06-25. **B53a** claim spans shipped 2026-08-19 (default ON). **B63** LLM result cache shipped 2026-08-20 as a cost optimisation only (flag default ON; does not close B61). **B70** plain `m` as million, **B60** money metric keys, **B60.1** sentence-scoped money metrics, and **B72** percent metric scope shipped 2026-08-20. **Next: B61** (hasConflict residual; durable storage). Near-term work-streams from 2026-06-01 diagnostic + comments review — see **Near-term — Review output** above.
3. ~~**R6.11 — EDITORIAL SCHEMA-FALLBACK**~~ — **SHIPPED / chapter closed 2026-06-25** (R6.11a + R6.11b + **B21**). See **Near-term — Review output** and **Recently shipped → R6.11**.
4. ~~**COMMENTARY CALIBRATION (B22 chapter)**~~ — **SHIPPED / closed** (B22 + B22.1 + B22.2). ~~**EDITORIAL RULE BUG-FIX PASS (B23)**~~ — **SHIPPED** (R6.2e + R6.2f). ~~**R6.6 (source-public-state)**~~ — **SHIPPED 2026-06-25**. ~~**B26 / B26.1 (constructive feedback output)**~~ — **SHIPPED 2026-06-30** — see **Recently shipped → B26 / B26.1**. ~~**B26.2 (constructive feedback craft pass)**~~ — **SHIPPED 2026-06-30** — see **Recently shipped → B26.2**. ~~**B26.2.2 (constructive feedback readability)**~~ — **SHIPPED 2026-06-30** — see **Recently shipped → B26.2.2**. ~~**B26.2.4 (output-type-aware craft pass)**~~ — **SHIPPED 2026-07-05** — see **Recently shipped → B26.2.4**. ~~**R6.12 (editorial output-type voice/register)**~~ — **SHIPPED 2026-07-05** — see **Recently shipped → R6.12**. Next: **R7**.
5. **Relative-source-period resolution (R2.7.2.1)** — **parked** (2026-06-01 scoping); see **R2.7.2.1** above and backlog **B17**.
6. ~~**R7 — Sources Drawer Revival**~~ — **CORE COMPLETE** (drawer UI v1 + **F13** excluded-sources shipped) — see **R7 — Sources Drawer Revival** / **Recently shipped → R7 F12**. **B48** conflict-vs-partial closed (`review-B48`). Remaining optional: **B41** (depth).
7. ~~**B45 — URL provenance scan.**~~ — **SHIPPED 2026-08-11** (Sprint 1). Tags: `b45-url-provenance-scan` (backend), `v8.69.0-b45-provenance-display` (frontend). See **BACKLOG B45** (Closed).
8. **Align Direction intensity (R6.1)** — surface how strong a concern is, not just that one exists. Folded into R6.
9. **Reviewer comments house style (R6.2)** — tighten commentary tone; sub-items R6.2a–R6.2d from diagnostic.
10. ~~**Hide Editorial on conflict (R6.3)**~~ — **SHIPPED** 2026-05-31. See Recently shipped → R6.3.
11. ~~**Public version compliance (R6.4)**~~ — **SHIPPED — chapter closed** 2026-05-31. See Recently shipped → R6.4.
12. **House style framework (R6.5)** — **SHIPPED** 2026-05-27. See Recently shipped → R6.5.
13. ~~**Document-type voice/register — editorial (R6.12)**~~ — **SHIPPED 2026-07-05** (see **Recently shipped → R6.12**). ~~**Source-public-state awareness (R6.6)**~~ — **SHIPPED 2026-06-25** (see Recently shipped → R6.6). **Forward-looking statement review (R6.7)** — Medium. **Cross-source display semantics (R6.8)** — Medium. **Non-claim statement handling (R6.9)** — shipped 2026-05-28; **R6.9.1** rhetorical/opinion follow-up **elevated H** (LinkedIn adapt surfaced category error — see **Parked → R6.9.1**). Residual functional-element noise: **Watch items → R6.9 residual**. **Source quality audit (R6.10)** — Low.
14. **Tool output style compliance (R6.2b candidate).** The Content Engine reviews drafts against house style but the tool's own user-facing prose — concern text, suggested directions, suggested rewrites, evidence summaries, Stage 5 commentary, Quality Review Summary bullets, Reviewer Assessment synthesis, sign-off verdict labels — is not held to the same standard. Symptoms already surfaced and patched piecemeal: schoolroom framing ("not permissible") removed in R6.2a.1; absolute compliance prose ("restricted under fund marketing regulations") softened in R6.2a.1. Broader gap remains — house style rules like em-dash replacement, smart quotes, English variant, and hyperbole avoidance probably apply to tool output prose too, but no codified standard exists for the tool's own voice register.

    **Scope when picked up:**
    - Inventory all tool-output text surfaces (~7 known: editorial concerns, compliance concerns, evidence summary, Stage 5 commentary, Quality Review Summary, Reviewer Assessment, sign-off labels).
    - Determine which house-style rules apply to tool prose vs draft prose (e.g. thousand separators probably don't; em-dashes and hyperbole probably do; defined-term capitalisation probably doesn't).
    - Define the tool's own voice register: direct, descriptive, third-person, no first-person plural, no schoolroom framing, no hyperbole — likely a short character document, not a rulebook.
    - Choose mechanism per surface: prompt-level guidance (LLM-generated prose), deterministic post-filter (structural rules like em-dash, smart quotes), or both. The existing R6.5 deterministic-backstop pattern is a strong candidate for structural rules.
    - Sequence by impact: editorial/compliance concern text is highest volume and most directly visible; Reviewer Assessment is the most prominent piece of prose.

    **Connection to existing work:** `AI_OPERATING_MANUAL.md` already includes a "QC Output Language Standard" that articulates principles for tool prose but is not rigorously enforced via prompts or filters. This item is partly about strengthening that standard's enforcement, partly about extending it to cover house-style rules the standard doesn't currently mention.

    **Priority:** High-leverage (touches every Review output) but not urgent — symptoms are addressable piecemeal as observed. Scope as R6.2b when ready. Logged 2026-05-30 from a one-off observation.
15. **Fidelity log traceability** — folded into **R6.2d** and **D1.5** pipeline log analysis.

### Long-horizon ideas (below top 15)

- **Per-house / per-reviewer language profile** — capture preferred phrasings, tone, capitalisation, and term substitutions per reviewer or per house, included as prompt context for the language layer only (Stage 5 commentary, B26 register, future reviewer-facing prose). HARD BOUNDARY: this never touches Stage 2 classification, Stage 3/4/7 aggregation, or any verdict-layer logic. The deterministic LLM-last architecture is preserved. Origin: 'centurion vs learning' framing from Ren Education (Straits Times, June 2026).

16. **E2 deterministic reimplementation** — open.
17. ~~**Pr9 — Interim: Suggest revised draft**~~ — **SHIPPED 2026-08-14** — see **Recently shipped → Pr9**. Tags: `Pr9-BE`, `Pr9-handling-BE`, `Pr9-notes-BE` (backend); `Pr9-FE`, `Pr9-handling-FE` (frontend).
18. **Implement-changes sprint** (`suggestedRewrite` → UI, accept/reject/refine) — see Active Backlog → Implement-Changes Sprint. Acting on a finding and acting on an edit are two different workflows; **B9** as scoped covers only the first. The chapter's first question is where in the flow the human makes each decision, not how accept and reject work on a card. Full workflow remains separate from **Pr9**.
19. **`visibility:null` stale log (R4.2)** — parked in **R4.2**; `[EDITORIAL_REVIEW] starting` log before normalisation.
20. **Unlabelled return-multiple watch (R5.1.2)** — expand confidential-detail rule for MOIC-style figures.
21. **Web Search relook** — **DEFERRED** behind R6 and R7. Pre-spec: UI placement, verdict contract for web-sourced confirmation, cost/latency on ~16 calls/run.
22. **Diagnostic harness follow-ups (D1.4, D1.5, D1.7)** — see **Diagnostic harness backlog** above.
23. **Short-draft visual balance.** On very short drafts (e.g. a single 13-word sentence), Review output volume is disproportionate to input — Reviewer Assessment prose, Quality Review Summary, and fixed-format QC cards combine to a >15:1 output-to-input ratio. Reviewer Assessment is the largest fixed-size contributor and its length does not scale with draft length.

    Possible directions when picked up:
    - Length-scaled Reviewer Assessment: synthesise-review generates prose proportional to draft length (~30 words for short drafts scaling to ~150 words for long ones).
    - Collapse Reviewer Assessment behind "Show assessment" by default; Quality Review Summary continues to handle quick triage.
    - More structural — examine whether the assessment is doing real work beyond the Quality Review Summary bullets and card list, and either repurpose it (see next backlog item) or remove.

    UX-shaped, not calibration-shaped. Worth a small scoping pass when next addressing UI. Logged 2026-05-30.
24. ~~**Reviewer Assessment purpose reframe.**~~ **RESOLVED (B26, 2026-06-30)** — closed by **not** reframing Reviewer Assessment. **Constructive Feedback (B26 / B26.1)** is the separate on-demand author-facing surface (per-statement consolidated rationale, no revised text). Reviewer Assessment stays the short reviewer-facing overview (`api/synthesize-review.js` unchanged). See **Recently shipped → B26 / B26.1**. **Same work-stream:** **BACKLOG B26** (closed), **BACKLOG Pr8** (resolved).

**Also tracked (below top 24):** Spring clean / refactor — defer until after R6; see Active Backlog → Spring Clean.

**Closed (removed from open list):**

| Item | Closed via |
|------|------------|
| Merge duplicate concerns | R5.2 (`r5.2-duplicate-concern-merge`) |
| Align Direction intensity | Folded into **R6.1** |
| Reviewer comments follow house style | Folded into **R6.2** |
| Hide Editorial on conflict | Folded into **R6.3** |
| Public version prompt | Folded into **R6.4** (R4.3 shipped wiring) |
| R6.5 (house style framework) | Shipped via `r6.5.6-defined-term-refinement` |
| R6.3 (Hide Editorial on conflict) | Shipped via `r6.3-principle-based-suppression` |
| R6.4 (Public version compliance, chapter) | Shipped via `r6.4a.3-restricted-rename`, `v8.53.0-r6.4b-publication-state-ui`, `r6.4c-regulatory-rule-scope` |
| Reviewer Assessment purpose reframe (open list #19) | **B26 / B26.1** — resolved by not reframing; Constructive Feedback takes author-facing role |
| B26 / B26.1 — Constructive Feedback Output | `b26.1-feedback-consolidation` (backend), `v8.56.0-b26.1-feedback-consolidation` (frontend) |
| B26.2 — Constructive Feedback craft pass | `b26.2.1-craft-assembly` (backend), `v8.57.0-b26.2-craft-pass` (frontend) |
| B26.2.2 — Constructive Feedback readability + UI polish | `b26.2.2-feedback-readability` (backend), `v8.58.0-b26.2.2-feedback-readability` (frontend) |
| B26.2.4 — Output-type-aware craft pass | `b26.2.4-craft-output-type` (backend), `v8.59.0-b26.2.4-craft-output-type` (frontend) |
| SRC1 — Source status pill alignment + override guard | `v8.60.0-src1-source-status-override` (frontend) |
| B34 — Remove Assess Review Settings auto-detect | `b34-assess-auto-detect-removal` (backend), `v8.61.0-b34-assess-auto-detect-removal` (frontend) |
| B25 — Verdict-label consistency across surfaces | `b25-verdict-label-consistency` (backend), `v8.63.0-b25-verdict-label-consistency` (frontend) |
| B29 / B29.1 — v4 review toggles + skipped-signal card rows | `b29-v4-review-toggles` (backend), `v8.65.0-b29.1-not-reviewed-rows` (frontend) |
| WR1 — Writing scaffold (PG demo) | `wr1-writing-scaffold` (backend), `v8.66.0-wr1-writing-scaffold` (frontend) |
| A10 — Adapt into Assess (A10.1, A10.2, A10.2.1, A10.2.2) | `v8.51.0-rA10-adapt-into-assess` (frontend) |
| R6.12 — Editorial output-type voice/register calibration | `r6.12-editorial-output-type` (backend) |
| Pr9 — Suggest revised draft | `Pr9-BE`, `Pr9-handling-BE`, `Pr9-notes-BE` (backend); `Pr9-FE`, `Pr9-handling-FE` (frontend) |
| Pr9 rewrite-correctness — claim spans | `pr9-claim-spans` (`d8ab2df`) |
| Pr9 rewrite-correctness — soften or cut | `pr9-soften-or-cut` (`0cd76a5`) |
| Pr9 rewrite-correctness — marker intent | `pr9-marker-intent` (`00cce35`) |
| Pr9 rewrite-correctness — cut punctuation | `pr9-cut-punctuation` (`71500c4`) |
| B48 — Evidence conflict-vs-partial calibration | `review-B48` |
| B13 — Stage 5 material-vs-pedantic partial distinction | `review-B13` |
| F8 — number_spelling quarter-notation backstop | `review-F8` |
| F9 — Duplicated suggestion-text de-noiser | `review-F9` |
| B37 — Framing-goes-beyond-source flag | `review-framing-BE`, `review-framing-FE` |
| Source-recency flag | `review-recency-BE`, `review-recency-FE` |
| Card density UX | `review-card-density` |
| Source supersession (verdict-layer) | `review-supersession` |
| Recency anchoring + first-person FP fixes | `review-recency-anchor-firstperson` |
| B54 — percentage_notation on "per cent" | `review-percent-number-style` |
| F14 — number_spelling spelled-out 0–12 | `review-percent-number-style` |
| B59 — extractPercents "per cent" + same-metric percent guard | `review-percent-extract` |
| B70 — parse plain m as million | `review-money-scale` |
| B60 — money metric ids and same-metric guard | `review-money-metric-keys` |
| B60.1 — sentence-scoped money metric resolution | `review-money-metric-scope` |
| B72 — percent canonical ids, sentence scope | `review-percent-metric-scope` |
| B53a — internal claim spans, upgrade-only rollup | `review-claim-spans` (`c290cee`) |
| B53a default ON + Stage 2 concurrency 24 | `review-claim-spans-on` (`e6e59a6`) |
| Stage 2 conflict vs partial (R2.7.1) | `r2.7.1-conflict-partial-calibration` |
| Stage 2 semantic frame matching (R2.7.2) | `r2.7.2-frame-matching` |
| qcCard.pipelineVersion label | `fix-pipelineversion-label` |

---

## Watch items

No spec until trigger conditions met. Do not schedule ahead of dogfooding signal.

### R5.2 — Duplicate-merge threshold tuning

Two related issues observed across multiple R6.2a / R6.2a.1 test runs:

(a) **Dedupe gap on functionally-identical concerns. SHIPPED 2026-05-30** — `r5.2a-concern-dedupe`. Backend `lib/qc/pipeline-v3/stage7-assemble-card.mjs`: added DUPLICATE_TEXT_SIMILARITY_THRESHOLD (0.85), normaliseConcernText and concernTextSimilarity helpers (token-set Jaccard on normalised text), and a dedupe pass inside mergeConcernGroup that runs after span grouping. When two concerns under the SAME concernCode have ≥85% normalised text similarity, the later one is dropped. Single survivors emit as unnumbered concerns (no "(i)" prefix), restoring the natural single-concern shape. ≥2 survivors continue to emit with "(i)/(ii)" labelling unchanged. New canary `${signalName}_duplicate_concerns_deduped` fires when the dedupe collapses a group. Validated across three live runs — previously duplicated concerns (R6.2a Run D, R6.2a.1 Runs D + F) now emit as single concerns; multi-concern path untouched. Item (b) (threshold tuning) remains in place and evidence-gated.

(b) **Threshold tuning** (original watch item content). Merge canary fires (`editorial_duplicate_concerns_merged`, `compliance_duplicate_concerns_merged`) — initial test runs produced zero merges, all correctly per 80% threshold. If reviewer use surfaces under-merging — especially nested Compliance concerns on the same phrase (e.g. forward-looking + comparative basis) — revisit threshold (lower overlap to 60–65%, or add containment rule).

### R2.7.1 — Stage 2 conflict vs partial

**SHIPPED 2026-05-28** (`r2.7.1-conflict-partial-calibration`). Voice/framing no longer classified as conflict; entity replacement vs omission distinguished; no-claim statements cannot conflict. **Watch remains OPEN** for the next 10–20 production traces — conflict/partial routing on relative or absent-fact edge cases. **R2.7.2 did not modify this routing** (period work is a separate dimension; frame-mismatch guidance coexists with R2.7.1 voice/entity rules in `stage2_v4.md`). **R2.7.2** shipped separately (`r2.7.2-frame-matching`); relative-source-period gap descoped to **R2.7.2.1**.

### R4.3 — Public version prompt quality (folded into R6.4)

**R4.3** shipped visibility wiring (`r4.3-visibility-wiring`, 2026-05-17). Prompt calibration for Public visibility is tracked as **R6.4**, not a standalone backlog item. Lineage preserved here so R4.3 scope is not mistaken for complete.

### R5.1 — Span coverage gap (concern click fallback)

After **R5.4.6**, concerns without R5.1 quoted-phrase spans get a **whole-statement blue underline** in the draft rather than a phrase-level underline. Visually heavier than span-derived highlights. **Action if reviewers find this noisy:** improve R5.1 span coverage in a future sprint (Editorial ~96%, Compliance ~83% post-R5.1.1 — gaps remain on concerns that omit quoted phrases). No frontend change required until then.

### Evidence concern click-to-highlight

Evidence findings (supported / partial / conflicting) currently lack the click-to-highlight-in-draft behaviour that editorial and compliance concerns have (R5.4). Clicking an evidence finding does not highlight the relevant text in the draft.

- Minimum fix: clicking an evidence finding highlights the whole statement in the draft (reuse the R5.4.6 whole-statement blue-underline fallback).
- Stretch: for partial / conflicting verdicts, highlight the specific unsupported or conflicting clause rather than the whole statement. Requires evidence sub-spans emitted from Stage 2 / Stage 4 — backend work, not just frontend wiring.

Frontend-heavy for the minimum fix; backend work for the stretch. Belongs near R7 (Sources Drawer Revival) bidirectional-navigation work, or as an R5.x follow-up. Logged 2026-05-28.

### internal_plausibility — statement-vs-source rounding (R6.2e watch)

**Logged 2026-06-03** (R6.2e). `internal_plausibility` may still attempt to fire on statement-vs-source figure discrepancies (rounded vs exact). Scope wording is in place (intra-sentence only; statement-vs-source rounding is Evidence), but in testing suppression came via the fidelity gate (cited source figure absent from statement), not the model obeying the scope constraint — **B14** pattern. User-visible result is correct. **Action:** review on next diagnostic batch; add a targeted deterministic backstop only if it recurs in a form the fidelity gate misses. Do not spec until then. See **BACKLOG W1**.

### R6.9 residual — functional-element not_supported noise (watch)

**Logged 2026-06-01 diagnostic** (unchanged from 26-May; not regressed). Functional-element statements that survive Stage 1 — recommendations ("We recommend approval"), salutations, sentiment lines ("the numbers tell one story") — return `not_supported`, which reads as "this claim failed verification" when there is nothing to verify. Cosmetically misleading; distinct from **R6.9** shipped scope (pure non-claim drop). See `docs/diagnostic_rerun_findings_2026-06-01.md` §1.4. Not scheduled; review on next diagnostic sweep.

### Post-B22 materiality and commentary regression (next full diagnostic sweep)

**Logged 2026-06-28** (B22.2 closeout). **Materiality:** confirmation≠redundancy principle (B22.2) verified on diagnostic fixture 01 only; check materiality firing on fixtures **04**, **08**, and **11** on the next full batch (not **BACKLOG F8**, which is quarter-notation `number_spelling`). **Commentary register:** confirm no 'excerpt' / 'passage' / 'snippet' regression on long-memo fixture **15** (Stage 5 fallback path). See **BACKLOG B22** verification caveats.

### R6.12 residual — LinkedIn editorial noise (watch)

**Logged 2026-07-05** (R6.12 verification). F12 voice/register over-fire cleared (`voice_consistency`, `register_mismatch`). **Borderline remains:** F12 S6 `structural_integrity` on name-plus-relative-clause credit lines; F12 S8 `marketing_language_excess` on "genuinely exceptional" (hyperbole vs acceptable social praise). Not scheduled; monitor if more LinkedIn fixtures are added to the diagnostic set. See **BACKLOG W2**.

### B26 — Signoff logic duplication (watch)

**Logged 2026-06-30** (B26). Readiness/signoff logic now exists in two places — `lib/qc/signoff-verdict.mjs` (backend, feeds Constructive Feedback) and the frontend hooks `useDraftState.jsx` / `useAssessState.jsx` (Reviewer Assessment). They are intentionally kept in lockstep so the two surfaces never disagree on whether a draft is ready. **Action:** any change to frontend signoff thresholds must be mirrored in `signoff-verdict.mjs` (and vice versa). Alignment is verified live by the B26 Step 4 test (same run → same readiness on both surfaces). See **BACKLOG B26**.

### D1 — Conflict-with-confirmation card surfacing (review candidate)

**Logged 2026-07-09** (post-A10). When one source confirms and another conflicts on the same statement, aggregated verdict is confirmed (`supported_full` / `concernLevel` none) while `hasConflict` stays true and a separate `conflictExcerpt` is selected. `deriveTintClass` does not read `hasConflict`, so such a statement can render green if editorial/compliance are clean. Defensible ("any confirming source is sufficient; disagreement flagged separately in data") but in mild tension with "conflicts always surface" on the card surface. **Post-demo review candidate — no change now.** See **BACKLOG B39**.

**Parked from EDITORIAL RULE BUG-FIX PASS (do not spec):**

- **`structural_integrity`** — appositive false-positive not reproducible in post-fix verification; watch only.
- **`thousand_separator`** — source-style conflation addressed by R6.5.5 statement-scoped backstop; confirm clean on next diagnostic batch.

---

## Active Backlog (Rough Priority Order)

1. *(Consolidated into Watch items → R2.7.1.)* Stage 2 conflict-vs-partial classification — see **Watch items** above.

2. *(Resolved — R6.13.1 / **BACKLOG B20**.)* Misleading `[EDITORIAL_STYLE_REVIEW] starting` log (`visibility: null` before normalisation) in `lib/qc/editorial-compliance-reviewer.mjs`. Stale `visibility` field name fixed (`requiredVersion` logged); Writing-path review intent wired. Verified: 7→8 compliance rule-subset flip on Public + press_release.

3. *(Closed — **B28** / `b28-remove-eventtype`, 2026-07-05.)* EventType not reaching backend on v4 QC runs — lean decision: removed dead `eventType` from QC path (editorial DOCUMENT CONTEXT line, `buildEditorialReviewContext`, evidence-skipped read, reviewer normalize/imports). Compliance already excluded it; no rule/verdict change. Generate/Rewrite framing retained. Re-add to QC if **R6.14** ships. See **Recently shipped → B28**.

4. Route selection should fail loud. Today, an unset `QC_PIPELINE_V4` env var silently falls back to v3 without any warning. R3.2 testing was nearly invalidated because `vercel dev` did not load `.env.local` into the function process and the selector defaulted to v3 without indicating the env var was undefined. Action: add a one-line log in `api/analyse-statements.js` at the route selection point that prints the resolved env var value alongside the route choice, every request. Example: `console.log(\`[handler] route: ${route} (QC_PIPELINE_V4=${process.env.QC_PIPELINE_V4 ?? "unset"})\`);` — makes the env var state observable in dev logs without needing a Langfuse trace or a temporary log.

5. Document the Vercel dev env setup in the backend README. Today the v4 route selection silently fell back to v3 because `vercel dev` did not load `.env.local` into the function process. The durable fix is registering env vars in Vercel directly: `npx vercel env add QC_PIPELINE_V4 development` then `npx vercel env pull .env.development.local`. Add a "Local development environment" section to the backend README documenting this process — the env vars that must be registered for v4 to work locally (`QC_PIPELINE_V4` at minimum, plus any other vars discovered as the rebuild progresses), the two commands above, and a note that simply having a value in `.env.local` is not sufficient for `vercel dev` to inject it into the function process. This protects future sessions (and any future collaborators) from the same lost-hour debugging cycle.

6. *(Closed — R5.2 shipped; Product backlog #1.)* Within-signal duplicate concern merge. **R3.4 superseded by R6.3 (closed 2026-05-31):** per-instance LLM judgment via `editorial-duplication-judge.mjs` replaces the old rule-ID suppression set; canary `editorial_concern_suppressed_by_judgment`. Editorial-vs-Compliance overlap on promotional language remains intentional unless reviewer feedback says otherwise. Threshold tuning: see **Watch items → R5.2**.

7. Recalibrate signoffVerdict thresholds. The current logic in `useAssessState.jsx` and `useDraftState.jsx` grades a single Conflicting evidence verdict as "Needs targeted revision". Reviewer feedback (R3.6 testing) suggests this is too soft — a direct numeric contradiction warrants stronger language than a "targeted revision". Action: review the thresholds in the signoffVerdict computation; consider grading any Conflicting evidence as "Needs significant work" regardless of overall concern count, or introduce a separate signoff state for unresolved factual contradictions.

8. Tune the synthesise-review system prompt voice. Reviewer feedback (R3.6 testing) flagged two phrasings as off-key: "given the high concern level for evidence" reads as system language leaking into reviewer-facing prose; "aligning with our publication's standards" sounds canned and corporate. Action: revise the system prompt at `api/synthesize-review.js` to instruct the LLM against system-vocabulary leakage ("concern level", "verdict", "signal") and against generic corporate filler ("aligning with our standards", "ensures adherence to guidelines"). Replace with specific, concrete reviewer language.

9. Investigate Editorial review run-to-run variance. R3.6 testing observed that the same draft (causal claim about GDP growth being "driven by expansion of real incomes") produced an editorial concern on one run and no concern on a later run, despite temperature 0. This is a known property of LLM APIs (provider-side variance even at temp 0). Action: assess the scale of the variance with a small repeatability study (run the same 5–10 drafts through Assess 3 times each, log which concerns fire each time, compare). If variance is material, consider mitigations: lower-variance models, ensemble-of-N voting on borderline cases, prompt strengthening on the specific rules that show variance. **Additional evidence (R6.5.4):** F01 live regression S10 `marketing_language_excess` fires on R6.5.4 run, does not fire on R6.5.5 run, with identical statement text and identical source.

10. Confirm that the Statement 1 currency hallucination bug from v3 does not recur on v4. Origin: Evidence Pipeline Quality Sprint (now retired). The v3 pipeline could produce a hallucinated currency reference on the first statement of certain drafts. v4's redesigned Stage 1 (LLM-based extraction with deterministic fallback) should not exhibit this, but it has not been explicitly tested. Action: construct a test draft known to have triggered the bug in v3 (or any draft whose first statement contains ambiguous currency phrasing), run on v4, confirm Stage 1 output and Stage 5 commentary are clean.

11. Consider whether an editorial plausibility cross-check on evidence verdicts adds reviewer value. Origin: Evidence Pipeline Quality Sprint (now retired). The original idea: after Stage 3 deterministically aggregates the evidence verdict, run a lightweight LLM check that asks "given the statement and the source passages, does this verdict look reasonable?" — flagging cases where the deterministic aggregation might be brittle. v4's stages are individually more accurate than v3 was, so the marginal value of this cross-check has decreased. Not on active backlog. Reactivate if pilot testing surfaces cases where v4's verdict logic produces unintuitive results that a plausibility pass would have caught.

12. Stage 1 should filter sign-off blocks and document-structure text. Today Stage 1 sentence extraction treats sign-offs ("Yours sincerely,"), salutations, signature blocks ("The Investment Team"), dates, and "To:" / "From:" / "Re:" headers as content statements requiring evidence verification. This produces false-negative QC cards (Evidence Not Supported on text that shouldn't be checked) and downstream Editorial false positives (voice/tone concerns on closing blocks). Surfaced during R4.1.6 testing using the Lumin Robotics investment memo. Action: extend Stage 1's prompt or add a post-extraction filter to identify and exclude document-structure text. Document the patterns to filter (salutations, dates, signature blocks, header lines) and test against a fixture that contains them.

13. *(Consolidated into Watch items → R2.7.1.)*

14. *(Closed 2026-05-31 via R6.3.)* Expand R3.4 suppression scope to additional editorial rules. **CLOSED 2026-05-31 via R6.3.** Principle-based per-instance LLM judgment replaces rule-ID suppression entirely. New rules added to the editorial rulebook automatically participate in the duplication judgment without requiring suppression-list maintenance. The brittleness this item was attempting to address is dissolved by the architecture change.

15. Upload draft button placement in Your Draft section. R4.1.8 made the Your Draft section flex-grow so the textarea resizes when other sections expand. The Upload draft button remains visible but its visual placement at the bottom of the textarea looks awkward when sections are tight — the button appears to overlap the textarea bottom edge rather than sitting cleanly below it. Two candidate fixes considered and deferred: (a) move the Upload draft button into the section header row alongside History/Save draft/Rewrite, treating it as a draft-loading action consistent with the other draft-management actions, or (b) reduce the textarea's minimum height to give the button more space. Action: pick a fix when next polishing the Setup panel; (a) is the recommended approach as it groups all draft-management actions in one location.

16. **Two-direction concern violations.** `SUGGESTED_DIRECTION_FORMAT_META` in `lib/qc/editorial-compliance-reviewer.mjs` requires every `suggestedDirection` to be a single complete imperative sentence ("Do not emit two fragments joined by 'and'"). Observed in R6.2a.1 Run C that the LLM emitted two directions in one concern: "Replace with more measured language or provide supporting evidence. Replace 'genuinely exceptional and unparalleled in its sector' with 'strong performer in its sector' or similar language." First half is high-level guidance, second half is the specific rewrite — both useful, but split into two sentences violates the meta-rule and produces awkward UI output. Likely fix: strengthen the meta-rule wording to make explicit that "Replace... or provide..." constructions count as two directions, OR introduce a separate `suggestedGuidance` field for the high-level hint distinct from the concrete rewrite. The latter is the cleaner product fix but requires schema work. Lower priority than R5.2 (a). Logged 2026-05-30.

    **Additional evidence 2026-05-30** (R5.2(a) validation runs): pattern observed across all three R5.2(a) test runs. Editorial concerns under `marketing_language_excess` consistently emit two-sentence suggestedDirection of the form "Replace with [high-level guidance]. Replace 'X' with [specific rewrite]." First sentence is generic guidance; second is the specific rewrite. Both are useful but the two-sentence format violates SUGGESTED_DIRECTION_FORMAT_META. Pattern is reproducible — fix is now well-supported by evidence. Likely the right product fix is a separate field for high-level guidance vs concrete rewrite, but a stronger meta-rule wording could also work as a contained interim fix.

17. ~~**Review-toggle wiring not honoured (open decision — Tier B).**~~ **RESOLVED (B29 / B29.1, 2026-07-05).** v4 now honours `editorialEnabled` / `complianceEnabled` / `evidenceEnabled` — each stage skipped when its toggle is off; frontend shows **Not reviewed** grey rows for skipped signals (keyed on `meta.reviewOptions`). Tags: `b29-v4-review-toggles`, `v8.65.0-b29.1-not-reviewed-rows`. See **Recently shipped → B29 / B29.1**, **BACKLOG B29** (closed).

18. **R6.4b UI polish (deferred).** Two cosmetic items from R6.4b live testing (2026-05-30):
  (a) Pills initially show "Unclassified" for several seconds while the LLM classifier runs in the background, then update to the inferred value once classification completes. Visually confusing — looks like the system is wrong, then "fixes itself". Replace initial pill state with an explicit in-flight indicator ("Classifying..." or a subtle loading state). Show one of the three terminal labels only once the publicationState is final.
  (b) ~~Pill positions are inconsistent across source rows because the filename column has variable width. Right-align pills (adjacent to the X remove button) so they line up in a column for cleaner scanning.~~ **SHIPPED 2026-07-05 — SRC1** (`v8.60.0-src1-source-status-override`). See **Recently shipped → SRC1**.

Item (a) remains cosmetic, not behavioural. Defer to R7 (Sources Drawer Revival) or fold into a small polish pass when the broader source-row UI is touched. Item (b) closed by **SRC1**.

### Web Search Functionality Sprint
- Scope and reliability of public search integration
- Citation transparency (URLs and snippets surfaced to user)
- Blending rules: draft first, sources second, web last

### Implement-Changes Sprint
- **Pr9 — Interim: Suggest revised draft** (lighter prequel; shipped) — one-click holistic rewrite from all Review/Assess card concerns. See **BACKLOG Pr9** (closed). Rewrite-correctness follow-on shipped 2026-08-23 (`pr9-claim-spans`, `pr9-soften-or-cut`, `pr9-marker-intent`, `pr9-cut-punctuation`). Residuals **B80**, **B81**. **Pr15** closed 2026-08-24. Harness caveat **P15**. **Superseded in part 2026-08-29:** soften and cut removed; silence protects the claim. **B134** 2026-08-30: one first-person replacement permitted on a silent card. See **Recently shipped → Revise arc**.
- **B9 — full accept / reject / refine** — **unblocked-but-not-built (2026-08-21).** A store exists (`persist-review-state`) but `review_state` overwrites; B9 needs append-only finding-decision event rows in a separate table. **Reframe (2026-08-23):** acting on a finding and acting on an edit are two different workflows. B9 as scoped covers only the first. The chapter's first question is where in the flow the human makes each decision, not how accept and reject work on a card. Per-change accept, reject or MODIFY on Suggest is **Pr17** (next work; operator decision 2026-08-31; mechanism not decided; also the answer to **B143**). Pr9 rewrite-correctness narrative also lives in Claude project docs outside this GitHub tree; in-repo record is ROADMAP Pr9 rewrite-correctness.
- Surface `suggestedRewrite` from QC cards to UI
- Rewrite notes redesign — deferred from earlier sprint, belongs here

### Spring Clean / Refactor Sprint
- `analyse-statements-impl.mjs` ~38k lines — high risk without test surface coverage; do not start until regression coverage is sufficient
- DEV TOOLS bar removal
- Selection mode removal (identified as legacy)
- Scrolling fix in Draft Output panel — deferred, low priority

### Audio Input
- Optional microphone input for selected text fields: Generate notes, Rewrite instructions, Ask AI
- Browser-native Web Speech API preferred (no backend speech-to-text responsibility)
- Transcribed text treated identically to typed input
- Must not interfere with existing Enter-to-execute behaviour

### Quality Scores
- Definition and rubric TBD — blocked until scoring criteria confirmed
- Word limit behaviour in Adapt (overrides not respected — known bug) — fix in this sprint once rubric is defined

---

## Parked, evidence-gated

These items are intentionally not in the active rebuild backlog. They stay visible so design intent is not lost, but work does not resume until the stated evidence triggers.

### Adapt (live in Assess — A10)

**Status: LIVE in Assess (A10, 2026-07-09).** `/api/adapt` is wired via the Assess Adapt modal + `handleAdapt` in `useAssessState.jsx`. Adapted drafts appear as labelled version-timeline entries with `meta.derivation`; Review runs on adapted drafts with full QC cards. Backend endpoint unchanged.

**History:** Parked as R4.1 before A10 — endpoint and code retained; Writing-route Adapt UI remains off/dead. Tabbed master↔adaptation presentation deferred (**A11.2**); single-view consolidation deferred (**A11.3**).

### Assess horizon (post-A10, deferred)

- **A11.1 — Per-version QC storage in Assess** — Assess stores a single flat `analysisResult`; loading an earlier version shows the "re-run Review" banner even when that version was already reviewed. Prerequisite for **A11.2**. Post-Monday. See **BACKLOG Pr10**.
- **A11.2 — Tabbed base↔adaptation view** — deferred; depends on **A11.1** + real multi-version model in Assess. Current presentation: labelled timeline entries. See **BACKLOG Pr11**.
- **A11.3 — Single-view consolidation** — collapse Assess/Writing naming into one unified **Content Engine** view. Deferred until Adapt-into-Assess settles (A10 was step one). Writing route remains off/dead. **2026-08-22:** reachability evidence favours deleting the legacy Writing surfaces rather than repairing them. See **BACKLOG Pr12**.
- **A10.3 / A10.4** — remaining Assess polish. Refresh/autosave shipped (`v8.71.0-review-state-restore` through `v8.74.0-review-state-tidy`); size guard shipped (`v8.75.0-source-size-guard`, `v8.76.0-size-message-wording`). Restored PDF/Office re-upload is an accepted limitation (**F16**). Upload ceiling remains **B79** (about 3 MB, GUARDED). Layout, scroll, export order, and **A10.4** final polish not scheduled.

### R6.9.1 — Rhetorical / opinion non-claim handling (elevated, pre-Monday)

**Elevated H (2026-07-09).** LinkedIn adaptation surfaced a category error: rhetorical/opinion statements (e.g. "quietly proved them wrong", "poised to run away with it") receive `not_supported` / high-concern evidence verdicts. Claim/non-claim machinery partially works (bare URL line correctly not evidence-assessed). **Target:** distinguish verifiable claims from rhetorical/opinion statements in the evidence layer (Stage 2); leave "is this framing appropriate" to editorial/compliance. **Do not touch pre-Monday.** See **BACKLOG B37**.

### Grok 4.5 output-quality eval (parked)

**P8 — Grok 4.5 eval.** Test **language layers only** (Stage 5 commentary, editorial, compliance, B26); hold Stage 2 on gpt-4o (locked). For clean comparison, hold Stage 2 output constant across gpt-4o baseline and Grok arm. Full diagnostic batch ~$25–30; prefer `--only` subset first. Revisit only when measured cost/quality problem points at the model. See **BACKLOG P8**.

### API batching / caching (parked)

**B38 — API batching / caching.** (a) Batch API (50% off, up to 24h latency) for **offline** diagnostic/regression sweeps only. (b) Prompt caching (50% off cached input) for the **live** QC path. Do not apply batch latency to interactive Review. See **BACKLOG B38**.

### Adapt (parked R4.1) — superseded

*Superseded by **Adapt (live in Assess — A10)** above.*

### (C) Stage 2 chunking — cost ceiling for long sources

**Open in QC rebuild backlog (C); not an immediate concern.** R3.3 instrumentation logs a warning when any source exceeds 60,000 characters. Initial real-world testing with a 71,463-character PDF source confirmed Stage 2 (`gpt-4o`) still produces clean verdicts at this scale. **Diagnostic evidence (26 May 2026):** F15 (`synth_very_long_memo`, ~4,800 words) ran clean without chunking issues. Reactivate implementation when source-length warnings appear regularly in dev or production logs, OR when typical pilot source documents exceed ~100k characters, OR when verdict quality degrades on long sources. Architecture document section 10 defines the chunking strategy; this is sequencing, not design.

### (D) $2/run production cost target

**Tracking in QC rebuild backlog (D).** Diagnostic pass scheduled inside **R6 scoping** to baseline call count and cost before prompt changes. Current baseline: ~16 LLM calls per run at 4 statements / 1 source; ~**$2/run** for interactive Review in production. **Diagnostic batch cost is separate:** full ~20-fixture batch ~$25–30 (~$1.25–1.50 per fixture) — see **Working rules → Cost** and **Diagnostic harness backlog → D1.8**. Depends on Stage 2 chunking (C), model choices, and cost-model baseline from R1.x.

### Collapsible left rail post-Review

The left Setup panel takes significant horizontal space post-Review.
The "Hide assessment summary" toggle (in the Results panel header)
already addresses most vertical cramping for QC cards.

A future enhancement could collapse the left Setup panel to an
expandable rail post-Review, with Setup section icons visible (Sources,
Drafting, Your Draft, Review settings) and click-to-expand behaviour.
Reviewer Assessment and Quality Review Summary would move to a
collapsible header above the cards (default expanded on first view of
a run, collapsed after first card interaction).

Three-panel composition post-Review:
- Left: collapsed rail with Setup section icons
- Middle: Your Draft (with R5.3a overlay surface)
- Right: QC cards, full vertical height

Reactivation trigger: vertical cramping recurs as a real issue in
dogfooding, OR a demo/pilot reveals the current layout is hurting the
reviewer experience.

Discussed and parked 2026-05-27.

---

## Architectural debt to revisit when v3 retires

### R3.4 — Rule-ID Editorial suppression on Evidence conflict (superseded)

**R3.4 superseded by R6.3 (closed 2026-05-31).** R6.3 removed the `SUPPRESSED_ON_EVIDENCE_CONFLICT` set and the rule-ID suppression branch entirely from `stage7-assemble-card.mjs`. Editorial concern suppression on Evidence conflict is now handled by per-instance LLM judgment via `editorial-duplication-judge.mjs`. The R3.4 entry is retained here as historical context; no further code references remain.

### R3.1 — Editorial+Style consolidation routing

R3.1 introduced a v4-only combined Editorial+Style review call
while leaving v3's separate Style and Editorial calls in place.
Two coupling points were accepted as pragmatic trade-offs at
the time and should be cleaned up when v3 is decommissioned:

1. `runEditorialComplianceReview` in
   `lib/qc/editorial-compliance-reviewer.mjs` now contains an
   internal branch that selects between the legacy three-call
   path (style + editorial + compliance) and the combined
   two-call path (editorial+style + compliance) based on
   `documentContext.pipelineRoute === "v4"`. The shared wrapper
   carries pipeline-aware logic, which is slightly more coupling
   than ideal. When v3 retires, the wrapper should be simplified
   to call the combined function directly and the route flag
   should be removed.

2. The merged editorial result shape (`editorialConcerns`,
   `editorialVerdict`, `editorialNote`, `editorialSuggestedDirection`,
   `editorialSuggestedRewrite`) is now produced in two places:
   `applyMergedEditorialAndStyle` (used by v3) and the
   combined `runEditorialStyleReview` return contract (used by
   v4). The two paths must stay in sync until v3 retires. When
   v3 is removed, `applyMergedEditorialAndStyle` and the two
   separate functions `runStyleGuideReview` and
   `runEditorialReview` can all be deleted.

No action required today. Note exists so the next person (or
future Ben) doesn't wonder why two code paths produce the same
shape.

### R3.3 — PDF extraction step shared by v3 and v4 routes

R3.3 wired `prepareUploadedSourcesForPipeline` into `api/analyse-statements.js`, which feeds both v3 and v4. This is a preprocessing step in the API handler, not in either pipeline module. When v3 retires, the preprocessing step stays put — it is route-level, not pipeline-level. No cleanup needed. Logged here only so the location of source extraction is documented for future maintainers.

---

## Future Capabilities

### Writing & Intelligence
- Style Guide Engine: persistent investment-writing rules per team, brand, or output type (tone constraints, forbidden phrases, preferred language patterns) — extends current banned words into a full rule set
- Multilingual: draft translation (input or output)
- Guided revision: stepwise editing suggestions with structured improve cycles
- Multi-model orchestration: large models for reasoning, cheaper models for summarisation

### Export & Audit
- Export Packager: full bundle — draft + source trace + statement table + Q&A log + version trail
- Document traceability and audit logs: each version logged with full metadata

### Knowledge & Memory
- Org document embeddings: private corpus grounding for long-term projects
- Knowledge memory retrieval: persistent source library across sessions
- **Pr13 — Approved-text library** — **unblocked-but-not-built (2026-08-21).** A store exists, but it holds one in-progress review (`review_state`), not a library of past approved texts. Restore shipped without list, picker, or history UI.

### Analytics & Dashboards (Pre-Enterprise)
- Writer-facing dashboard: personal QC history, recurring flags, common evidence gaps, quality trends over time
- Management-facing dashboard: team output volume, QC pass/fail rates, common compliance and editorial issues across the team, coverage by output type
- Both views still need a session/document store beyond the current one-row autosave buffer. The in-progress review snapshot is persisted (`persist-review-state` / `v8.71.0-review-state-restore`); dashboards and libraries are not.

### Quality Score Visualisation (Pre-Enterprise)
- Radar/web chart displaying quality score across defined axes (e.g. evidence strength, editorial clarity, compliance risk, structural integrity)
- Requires Quality Scores to be defined and implemented first (currently parked in backlog)
- Intended as a writer-facing tool for understanding draft quality at a glance

### Enterprise
- Multi-user accounts: reviewer comments, approvals, link-share
- Enterprise connectors: eFront, OneSource, SharePoint, Teams, Outlook, Drive
- Approval chain and audit trail logging
- No-public-domain safety setting (compliance mode, non-web search option)
- Customer tenant deployment / managed hosting
- Workflow automation: job triggers, job queuing, assignment to writers, post-approval upload to Content Management Systems (CMS connectors will be client-specific; Export Packager is the prerequisite)

---

## Where This File Lives

Backend repo only (`brightline-content-engine-backend`), at `docs/ROADMAP.md`. Single source of truth. Do not duplicate into the frontend repo or the repo root.

---

## Review Correctness Principles (Non-Negotiable)

These invariants define the minimum trust bar for the QC evidence pipeline. If any are violated, Review output must be treated as unreliable. All backend development affecting statement analysis must be checked against these before handoff.

1. **Truthful absence claims** — Review must never say a fact, term, or number is "not mentioned" or "not supported" unless a corpus-level search over the full uploaded text was performed and found no match.
2. **No false "missing sources" language** — If uploaded sources exist, Review must not imply the user "provided no sources" or that "no sources exist."
3. **Citation–evidence consistency** — If citations are present, evidence must be resolvable to reference titles or URLs. Uploaded sources may have `url: null` and are still valid. "Citations missing" only when citations are actually empty.
4. **Correctness over confidence** — Review must not emit confident absence claims if the system has not checked the full relevant corpus.
5. **Ambiguity is not absence** — If multiple plausible anchor values exist (e.g. multiple valuations), Review must flag ambiguity and name the competing values — never claim "not mentioned."
6. **Contradiction scope** — "Contradicted" applies only to statement-vs-sources conflicts. Draft-to-draft internal consistency is out of scope for Review.
7. **Explain, don't rewrite** — Review diagnoses and explains; it may provide structural or evidentiary guidance but must not propose rewritten sentences verbatim.
8. **Deterministic safeguards for anchors** — Numeric and anchor facts (valuation, funding, dates, percentages) must be normalised (e.g. `$25mm` == `$25 million`) before declaring mismatch or absence.
