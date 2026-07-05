# Brightline Content Engine — Backlog

This document is the single source of truth for known issues, deferred work, future improvements, and product enhancements that have been identified but not yet scheduled into a sprint.

It complements:
- `docs/ROADMAP.md` — the active sprint plan
- `docs/ARCHITECTURE.md` — the system design
- `ai/AI_OPERATING_MANUAL.md` — how Claude/Cursor work on this codebase

---

## How to use this file

**When something gets deferred** during a working session — a UI bug, a code-hygiene item, a future optimisation, a copy change, an architecture nuance — it gets a row in the right table below.

**When something is ready to schedule**, it moves from a backlog table into a spec (and eventually into the roadmap).

**When something is shipped**, the row is moved to the bottom of this file under "Closed" with the spec ID and tag that resolved it.

**Adding new items**: see "How to update this file" at the bottom.

---

## Tables

The backlog is split into four tables by character of work:

1. **Frontend / UI** — user-visible bugs, copy, layout, polish
2. **Backend / Pipeline** — non-blocking pipeline issues, optimisations, architecture nuances
3. **Process & governance** — operational items, eval discipline, doc maintenance
4. **Product** — net-new features, capability gaps

---

## 1. Frontend / UI

| ID  | Item | Source / context | Priority | MVP | Notes |
|-----|------|------------------|----------|-----|-------|
| F1  | "Highlight in draft" link broken in Assess module | R2.1 testing | M | MVP | Works in Quality Review module. Likely missed during Assess module build. |
| F2  | Statement-level colour-coding broken in Assess module | R2.1 testing | M | MVP | Works in Quality Review. Same root cause likely as F1. |
| F5  | UI display labels misaligned with architecture rubric | R2.3 user observation | M | MVP | "Supported" should be "Confirmed". Align all four labels: confirmed / partially confirmed / conflicting / no support. Decision: more definitive language preferred for an audit-safe product. |
| F6  | "1 claim have" grammar bug in Reviewer Assessment | userMemories | L | Post-MVP | Pre-existing item from product backlog. |
| F7  | Reinstate colour-coding of draft text and Highlight in Draft functionality in Assess module after Assess runs. Quality Review module has this in its Draft Context pane; Assess does not currently have a Draft Context pane, which is the limiting factor. | R2.4+R2.5 testing | M | MVP | |
| F8  | Editorial `number_spelling` over-fires on quarter notation (flags 'Q3 2010', suggests 'third quarter'). Quarter labels are date references and should be exempt; structurally checkable (`/Q[1-4]\s?\d{4}/`) — candidate for a deterministic backstop. **Not addressed in R6.2e** (that pass added a `number_spelling` percentage-token guard and `percentage_notation` rule only — see ROADMAP **EDITORIAL RULE BUG-FIX PASS** line ~431). Independent **L / Post-MVP** item; group with **R6.5** house-style cluster. | R2.7.2 Run 1 testing | L | Post-MVP | |
| F9  | Editorial concern text duplicates its replacement instruction within a single bullet (single thousand-separator concern rendered 'Replace "10,000" with "10'000".' twice). Check for duplicated suggestion text in concern generation/rendering. **Cross-ref:** unrelated to closed **B22** (commentary register); candidate overlap with **ROADMAP** watch → `thousand_separator` / **R6.5.5** backstop. Independent open item. | R2.7.2 Run 2 testing | L | MVP | |
| F10 | Single-concern Editorial cards may render the lone concern as a bullet — check rendering consistency across single-concern Editorial cards (bulleted vs inline). | R2.7.2 Run 1 testing | L | Post-MVP | |
| B34 | **Remove auto-detect in Review Settings (Output type / Visibility).** Detection pre-selects output type and visibility from the draft; low-value and actively annoying when wrong. Replace with a plain manual default (**Reporting commentary** / **Complete**) that the user sets themselves — no detection. | userMemories / Ben UX observation 2026-06-30 | L | Post-MVP | |
| F11 | **Author-feedback UI:** top-right controls (Hide assessment summary + View/Generate author feedback) look cluttered stacked together. Try ghost/text buttons or relocating the collapse toggle to the container edge. | B26.2.2 testing 2026-06-30 | L | Post-MVP | |

**Suggested grouping**: F1–F5 share the Assess module surface and could be bundled into a single frontend polish sprint, e.g. `v8.43-assess-polish`.

---

## 2. Backend / Pipeline

| ID  | Item | Source / context | Priority | MVP | Notes |
|-----|------|------------------|----------|-----|-------|
| B1  | Stage 2 prompt nuance: "all X, therefore not Y" patterns | R1.2.5.3 reproducibility findings (P02, P25) | L | Post-MVP | When source says "all employees in Ottawa" and draft claims "offices in Berlin," current rubric drifts between `no_support` and `conflicting` at temp 1. Worth a prompt-tightening spec eventually, but not blocking. |
| B2  | "Excerpt could not be retrieved" on conflict cards | R1.2.3, R2.3 testing | L | Post-MVP | v3 Stage 4 artifact. Architecture says Stage 2 should already return the passage; v3's separate retrieval step is unnecessary. Should resolve when R2.5 (Stage 4 in v4) lands. Substantially mitigated by r2.5.3 for bracket-abridgement cases. Residual placeholder appears only on silent-splice cases — see new backlog item B-next on splice handling. |
| B3  | Anthropic prompt caching for Stage 2 source text | R1.2.4 finding | L | Post-MVP | Stage 2 reads the same source repeatedly across statements. Anthropic cache hits are 10× cheaper on input. Potential meaningful cost saving when Anthropic models become viable for Stage 2. Currently dormant since gpt-4o is locked. |
| B4  | LLM call consolidation: merge editorial + compliance + style | userMemories | M | Post-MVP | Architecture-level optimisation. Three review calls per statement could potentially become one. Cost model projects ~19% saving on production runs. Defer until v4 is fully live. |
| B5  | Stage 2 chunking cost ceiling for long sources | userMemories | L | Post-MVP | Pre-existing. Long sources can blow up Stage 2 token cost. Defer. |
| B7  | Document "internal source contradiction" handling | R1.2.5.2 finding | L | Post-MVP | Stage 2 already handles this correctly (returns `conflicting` when a source contradicts itself), but the architecture document doesn't acknowledge this case. Add a paragraph to architecture section 5.2. |
| B8  | E2 deterministic reimplementation | userMemories | L | Post-MVP | Pre-existing. Defer. |
| B9  | Implement-changes sprint (writer applies QC suggestions) | userMemories | L | Post-MVP | Pre-existing. Defer. |
| B10 | Spring clean / codebase hygiene | userMemories | L | Post-MVP | Pre-existing. Defer to after v4 is live and v3 is deletable. |
| B11 | Public version prompt | userMemories | L | Post-MVP | Pre-existing. Defer. |
| B12 | Add canary score for non-schema Stage 2 failures (network errors, timeouts) so they're tracked in Langfuse alongside schema failures. | R2.3 implementation review | L | Post-MVP | |
| B13 | Stage 5 commentary should explicitly distinguish 'pedantic gap' partials from 'material gap' partials. For partially_confirmed verdicts, commentary must name what's confirmed precisely, name the specific gap using the source's exact language, and suggest the reviewer's action. To be designed into the Stage 5 prompt during R2.6. | R2.5.2 user observation | M | Post-MVP | |
| B14 | Model non-compliance with explicit prompt rules: gpt-4o does not reliably honour negative constraints (e.g. 'do not abridge passages') on dense compound statements, even at temp 0. Future stages should design defensively — validation layers that handle expected non-compliance modes rather than rely on the model's adherence. | R2.5.2.1 diagnostic finding | M | Post-MVP | |
| B15 | Stage 2 occasionally returns silently spliced passages (multiple non-adjacent source spans presented as contiguous, with no ellipsis marker). Validator correctly rejects these, but the resulting placeholder appears on conflict cards. Possible mitigations: (a) two-call retry asking for a single contiguous span when first call's passage fails validation, (b) accept and surface explicitly as 'spliced excerpt - confirm against source'. To consider after pipeline-v4 fully live. | R2.5.3 testing | M | Post-MVP | |
| B17 | **R2.7.2.1 — Relative-source-period resolution.** Stage 2 period matching only works explicit-vs-explicit; fails when the source period is a relative reference requiring document-date inference. Proposed fix: deterministic date-resolution pass pre-Stage-2. See ROADMAP **R2.7.2.1**. | R2.7.2 testing | M | Post-MVP | |
| B18 | Stage 5 evidence commentary editorialises rather than describes (e.g. 'This is a significant discrepancy'). Calibrate Stage 5 prompt toward neutral description per QC Output Language Standard. **Watch item** — pending next diagnostic batch after `commentary-calibration` (2026-06-03); 0 editorialising tone markers in 2026-06-01 batch. Close if next batch also clean. | R2.7.2 Run 1 testing | M | Post-MVP | |
| B25 | Verdict-label consistency across surfaces. (1) Export (`api/export.js` `normalizeVerdict`) still reads "Supported"/"Not supported"; align to card vocabulary (Confirmed / Partially confirmed / Conflicting / No support) so the filed report matches the screen. (2) Correct the unrendered evidence verdict line in `displayVerdictLabels.js`: "Conflicting sources" → "Conflicts with sources" — the conflict verdict means the statement contradicts the source, not that sources disagree with each other. Display-only; no verdict enum or logic changes. | F5 implementation (2026-06-02) | M | MVP | Card / verdict-line / export must agree. Anchor on the shared `displayVerdictLabels.js` module. Audit-safety: screen and report must not disagree. |
| B27 | **Named-individual suppression reliability on subtle attribution drift.** R6.6.3 proviso (suppress only when source uses the named person the same way the draft does) verified only on a clear-cut case — fabricated forward-looking quote. Unproven on subtler drift (same role, shifted emphasis; paraphrased vs invented quote). Fail-safe bias means subtle cases should fail toward KEEPING the concern, so risk is residual noise not silent over-suppression — but confirm on a future diagnostic batch that suppression never drops a genuine consent gap. | R6.6.3 testing | L | Post-MVP | Watch only |
| B28 | **R6.13 Tier B — eventType wiring decision.** Handler never reads eventType; defaults to NEW_DIRECT_INVESTMENT, still feeds Editorial+Style prompt framing, but was deliberately removed from Compliance. Decide: remove the field + any UI (lean), or keep-and-wire. Source: R6.6-audit. | R6.13-audit | M | Post-MVP | PENDING DECISION |
| B29 | **R6.13 Tier B — v4 review-toggle behaviour (open decision — Tier B).** editorialEnabled / complianceEnabled / evidenceEnabled are sent by the UI but ignored on the v4 API path (v4 always runs all stages). Decide: honour on v4, or remove from UI. Source: R6.6-audit. **Cross-ref: ROADMAP Active Backlog #17** — PENDING DECISION; do not mark resolved. | R6.13-audit | M | Post-MVP | PENDING DECISION |
| B30 | **Thorough regression calibration matrix (deferred).** R6.13.2 shipped light coverage (two guard fixtures). Full version: every regression fixture declares version/output-type/publication-state asserted against expected rule subsets. Build only if calibration drift starts showing up. Source: R6.13.2. | R6.13.2 | L | Post-MVP | Deferred |
| B31 | **Silent-default handler canary (deferred).** Scoped narrowly: emit a canary when a draft-review request reaches the API handler without review intent (always wrong for a real UI request); low-noise unlike per-default canaries. Source: R6.6-audit. | R6.13-audit | L | Post-MVP | Deferred |

---

## 3. Process & governance

| ID  | Item | Source / context | Priority | MVP | Notes |
|-----|------|------------------|----------|-----|-------|
| P2  | Reproducibility test pattern for future model evals | R1.2.5.3 finding | M | Post-MVP | Standard for any future eval involving reasoning models or temperature > 0: run 2–3 times, check for stability, average results. Add to `ai/AI_OPERATING_MANUAL.md` when next updated. |
| P3  | Re-eval trigger: new gpt-5-family model with materially better latency | R1.2.6 conclusion | -- | Post-MVP | Watch only. Re-run R1.2.5 if a candidate appears that addresses gpt-5's latency profile. |
| P4  | Re-eval trigger: new Anthropic Sonnet/Haiku with closed agreement gap | R1.2.6 conclusion | -- | Post-MVP | Watch only. |
| P5  | Single technical opinion risk | userMemories | M | Post-MVP | Pre-existing. Claude is the only technical sounding board. No current cross-validation. Worth flagging if anything goes wrong. |
| P6  | Business backlog gap | userMemories | M | MVP | Observability, cost modelling, pricing, second pilot user. Materially lighter than product backlog. Needs active attention. |
| P7  | Singapore government AI funding eligibility | userMemories | L | Post-MVP | Startup SG Tech POV primary, AI Accelerate parallel. Confirm prerequisites before applying. |

---

## 4. Product

| ID  | Item | Source / context | Priority | MVP | Notes |
|-----|------|------------------|----------|-----|-------|
| Pr2 | Merge duplicate concerns | userMemories | L | Post-MVP | Merge duplicate concerns — R3.4 partial fix superseded by **R6.3** (shipped 2026-05-31, `r6.3-principle-based-suppression`). Evidence-vs-Editorial duplication on conflicting statements is now handled by per-instance LLM judgment via `editorial-duplication-judge.mjs` at card assembly (not rule-ID suppression). Canary: `editorial_concern_suppressed_by_judgment`. **Remaining open:** (a) Evidence-vs-Editorial duplication on `partially_confirmed` verdicts (R3.4/R6.3 deliberately scoped to conflicting only). Reactivate if the same noise pattern shows up on partials. (b) Editorial-vs-Compliance overlap on promotional language (e.g. `marketing_language_excess` + `regulatory_prohibited_language` firing on the same sentence). Reviewed and judged intentional — both signals serve distinct reviewer decisions (craft vs regulatory). No fix planned; revisit if reviewer feedback indicates the overlap is genuinely noisy rather than complementary. |
| Pr3 | Align Direction intensity — Evidence softer than others | userMemories | L | Post-MVP | Folded into **R6.1** (ROADMAP). |
| Pr4 | Reviewer comments follow house style | userMemories | M | Post-MVP | Pre-existing. |
| Pr5 | Hide Editorial on conflict | userMemories | L | Post-MVP | Pre-existing. |
| Pr6 | Fidelity log traceability (add draft identifier) | userMemories | L | Post-MVP | Pre-existing. |
| Pr7 | R6.12 document-type-aware voice/register — see ROADMAP. Editorial voice/register rules over-fire on LinkedIn posts (fixture 12). | 2026-06-01 comments review | M | Post-MVP | |
| B32 | **Event-type awareness** (writing matrix + review expectation handling) — see ROADMAP **R6.14**. Review-side SHAPE UNDECIDED (Option 1 filter dimension vs Option 2 expectation profiles). Sequenced after B21–B23. | roadmap-eventtype scoping 2026-06-25 | M | Post-MVP | Prerequisite: **B28** (eventType wiring) |
| W1  | **internal_plausibility** — may still attempt to fire on statement-vs-source figure discrepancies (rounded vs exact). Scope wording in place (R6.2e); in testing suppression came via the fidelity gate (cited source figure absent from statement), not the model obeying the scope constraint — B14 pattern. User-visible result correct. Action: review next diagnostic batch; add targeted deterministic backstop only if it recurs in a form the fidelity gate misses. See ROADMAP **Watch items → internal_plausibility**. | R6.2e verification | -- | MVP | Watch only |
| B33 | **B21 residual (observable, not open):** a category mis-tag whose `ruleId` is in NEITHER rulebook cannot be salvaged by reclassification and would still fall back. Not observed across the B21-diag-confirm set (zero such drops). Now self-identifying in `pipeline.log` via `rejectReason` `ruleId_not_in_either_rulebook:<id>`. No action unless it appears. | B21 | L | Post-MVP | Watch only |

### B26 — Watch (signoff duplication; chapter closed, watch remains)

Readiness/signoff logic now exists in two places — `lib/qc/signoff-verdict.mjs` (backend, feeds Constructive Feedback) and the frontend hooks `useDraftState.jsx` / `useAssessState.jsx` (Reviewer Assessment). They are intentionally kept in lockstep to guarantee the two surfaces never disagree on whether a draft is ready. Any change to the frontend signoff thresholds must be mirrored in `signoff-verdict.mjs` (and vice versa). Alignment is verified live by the B26 Step 4 test (same run → same readiness on both surfaces). See ROADMAP **Watch items → B26 — Signoff logic duplication**. **B26 / B26.1 / B26.2 / B26.2.2 / B26.2.4** shipped — watch item remains open.

### Long-horizon ideas (below top 13)

- **Per-house / per-reviewer language profile** — capture preferred phrasings, tone, capitalisation, and term substitutions per reviewer or per house, included as prompt context for the language layer only (Stage 5 commentary, B26 register, future reviewer-facing prose). HARD BOUNDARY: this never touches Stage 2 classification, Stage 3/4/7 aggregation, or any verdict-layer logic. The deterministic LLM-last architecture is preserved. Origin: 'centurion vs learning' framing from Ren Education (Straits Times, June 2026).

---

## Closed

| ID  | Item | Resolved by |
|-----|------|-------------|
|     | Trace metadata for QC runs | r1.2-pre, r1.2-pre.1 |
|     | Stage 2 prompt v2 (conflict detection) | r1.2.2-prompt-eval, r1.2.3-prompt-v2-production |
|     | Multi-provider infrastructure (OpenAI + Anthropic) | r1.2.4-multi-provider-infra |
|     | Cross-provider Stage 2 eval | r1.2.5-eval, r1.2.6-eval-closed |
|     | gpt-5-mini reproducibility test | r1.2.5.3 (under r1.2.6-eval-closed) |
| P1  | Cost model spreadsheet update | R1.x |
| Pr1 | Reviewer Assessment synthesis (narrative, not dashboard) | R4.x |
|     | R1.2 gpt-4o-mini Stage 2 source-matching eval | R1.2, R1.2.4, R1.2.5 |
|     | Pipeline v4 scaffolding | r2.1-pipeline-scaffolding |
|     | Stage 1 (statement extraction) in v4 | r2.2-stage1-extraction |
|     | Stage 2 (source matching) in v4 | r2.3-stage2-matching |
| B16 | **R2.7.2 — Stage 2 semantic frame matching** | `r2.7.2-frame-matching` — period scope explicit-vs-explicit only; relative-source-period gap → **R2.7.2.1** (B17) |
| Pr2.7.2 | **R2.7.2 — Stage 2 semantic frame matching** (Product duplicate ref) | `r2.7.2-frame-matching` — see ROADMAP **R2.7.2.1** |
|     | qcCard.pipelineVersion hardcoded `"v3"` in shared `stage7-assemble-card.mjs`, now stamped from actual route | `fix-pipelineversion-label` |
| F3  | `<>` JSON copy button missing/broken in Assess module | shipped (small frontend change, tag not recorded) |
| F4  | Enter-to-execute on Assess module's primary action button | shipped (small frontend change, tag not recorded) |
| B19 | **RESOLVED** — absorbed into and closed by **B22** (anchor eliminated; excerpt meta-phrasing count 0). | Was `commentary-calibration` — v4 `stage5_v2.md` |
| B22 | **RESOLVED** — closed by B22 / B22.1 / B22.2. Prompt-only register calibration of evidence (Stage 5) and editorial/compliance concern prose. **ANCHOR (B19):** 'excerpt' meta-phrasing eliminated — 53 instances in batch 2026-06-01 → 0 across all commentary fields (Stage 5 LLM prose + Stage 5 deterministic fallback [B22.1] + editorial/compliance concern prose [B22.2]). **REGISTER:** plainer terms (active/passive, 'hedging language', 'immediate context'), preachy framing removed, Directions concise. **SPECIFICITY (B22.1):** evidence prose must name the source's own verb/direction/figures on directional/quantitative claims — vague frames ('the same growth','this aligns') banned except where a non-quantitative source genuinely adds nothing beyond confirmation (verified acceptable, F01 S5). **MATERIALITY (B22.2):** source confirmation is no longer treated as redundancy; materiality judged against surrounding DRAFT sentences. **GUARDRAIL held:** substantive observation (conflict specifics, narrative_coherence, materiality reasoning) preserved; F18 conflict prose retains both sources' figures. **VERIFICATION CAVEATS (recorded, not papered over):** (1) B22 firing-regression was compared against the 4-week-old 2026-06-01 batch with intervening pipeline work (R2.7.2, R6.6, R6.2e/f, R6.11a), so prose-vs-logic effects were confounded rather than cleanly A/B-isolated; firing-behaviour unchanged is supported by mechanism + spot-check, not by clean isolation. (2) B22.2 materiality reasoning fix verified on diagnostic fixture 01 only; materiality on fixtures 04/08/11 not re-checked under the new principle — review on next full diagnostic sweep. Tags: `b22-commentary-calibration` (orig ship: `commentary-calibration`), `b22.1-commentary-specificity`, `b22.2-editorial-excerpt-removal`. | See ROADMAP **Near-term — Review output** |
| B21 | **RESOLVED** — Editorial schema-fallback (reliability + observability chapter). | Diagnosis (**B21-diag**) found the 5 batch fallbacks (`2026-06-01-122541`) were not malformed output or over-strict schema — they were valid JSON with real concerns discarded by a pre-R6.11a fail-fast normalizer that rejected the whole payload on the first category mis-tag (model tagged `first_person_plural` as `editorial`; it is a `style_guide` rule), with retries resending the same prompt. **RELIABILITY:** already closed by R6.11a (per-concern salvage + cross-book reclassification + retry correction note); verified across the full set (**B21-diag-confirm:** F01/F06/F14×2/F20 — zero fallbacks, zero non-salvageable drops). **OBSERVABILITY:** card already distinct via R6.11b ("Needs manual review", amber, explicit copy); raw failed output now persisted to `pipeline.log` with per-attempt `rejectReason` (**B21**, this work) — closes the gap that forced Langfuse recovery during diagnosis. **Closed decision:** F06's batch `internal_plausibility` second-concern was not reproduced (model variance); fail-fast removal evidenced indirectly by two concerns surviving on one card — not chased; re-creating a historical model output proves nothing the per-concern salvage mechanism doesn't. Tags: `r6.11a-editorial-schema-salvage`, `r6.11b-not-reviewed-state` / `v8.54.0-r6.11b-not-reviewed-state`, **B21**. See ROADMAP **R6.11**. |
| B23 | **RESOLVED** — Editorial rule bug-fix pass shipped **2026-06-03** (`r6.2e-editorial-rule-bugfix`, `r6.2f-compliance-rule-bugfix`). Per-rule outcomes: ROADMAP **Near-term — Review output → EDITORIAL RULE BUG-FIX PASS** (line ~431) — `date_format`, `percentage_notation` + `number_spelling` percentage guard, `internal_plausibility` scope, `passive_voice_overuse`, `comparative_claim_without_basis`, `forward_looking_statement_without_qualifier`. | See ROADMAP line ~431 |
| B24 | Source-public-state awareness — R6.6 chapter (R6.6.1–R6.6.4). | R6.6 closed 2026-06-25 — see ROADMAP **Recently shipped → R6.6** |
| B20 | Writing-module QC (`useDraftState.jsx` `runStatementAnalysis`) did not send the user's required version or output type, so the pipeline silently ran every Writing review as Complete / Reporting Commentary. Complete was accidentally correct (default matched); Public was dropped and never engaged public calibration. The `visibility:null` log was a separate stale-field-name defect (`editorial-compliance-reviewer.mjs` logged `visibility` while the pipeline carries `requiredVersion`). Both fixed in R6.13.1; verified by 7→8 compliance rule-subset flip on Public + press_release. Regression guard added in R6.13.2. | R6.13.1 |
| Pr8 | **RESOLVED (B26, 2026-06-30)** — Reviewer Assessment reframe. Closed by **not** reframing Reviewer Assessment: **B26 / B26.1** takes detailed author-facing constructive feedback; Reviewer Assessment (`api/synthesize-review.js`) unchanged as short reviewer-facing overview. ROADMAP open list **#19**. | **B26** |
| B26 | **SHIPPED 2026-06-30** — Constructive Feedback chapter (**B26** base + **B26.1** consolidation). Tags: `b26.1-feedback-consolidation` (backend), `v8.56.0-b26.1-feedback-consolidation` (frontend). Card-derived feedback consolidated group-by-statement — one point per flagged statement, bundled by **`cardIndex`** (not `statementText`); statements ordered worst-first (conflicting/not_supported evidence → compliance-bearing → editorial-only, `cardIndex` ascending tiebreak); within bundle Evidence → Compliance → Editorial. **Supersedes** B26 global signal-tier point ordering. Register: `CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER` (editor-to-writer, warm-through-specificity, sparing earned praise, no schoolroom/system language). UI: scrollable modal, per-run cache keyed to `activeAnalysisRunId`, Regenerate, Escape/backdrop close, focus trap (**B26.1.1 / B26.1.2** folded). Resolves **Pr8** and ROADMAP **#19**. **Watch:** signoff duplication — subsection above. | See ROADMAP **Recently shipped → B26 / B26.1** |
| B26.2 | **SHIPPED 2026-06-30** — Document-level craft pass added to constructive feedback. Tags: `b26.2.1-craft-assembly` (backend), `v8.57.0-b26.2-craft-pass` (frontend). Second temp-0 LLM call reads the full reviewed-draft snapshot (`analysedDraftText`, snapshotted at QC-run time in `useDraftState` + `useAssessState`, keyed to analysis run id) across six FT-shaped dimensions (structure/flow, core-message clarity, conciseness & precision, register & tone, opening/closing, internal coherence). Draft-anchored document-level patterns; craft section first then card-derived points; one editor voice (`CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER`); single opening + continuous numbering (**B26.2.1** folded: preamble strip, renumber, strengthened dimension-6 figure-clash scan). Scoping decision #3 relaxed to draft-anchoring for craft section only; card points remain card-anchored. Internal coherence text-internal only. Independent of assess-path `lastAssessedDraftText`. Follow-up **B26.2.2** + **B26.2.4** shipped. | See ROADMAP **Recently shipped → B26.2** |
| B26.2.2 | **SHIPPED 2026-06-30** — Constructive feedback readability + UI polish. Tags: `b26.2.2-feedback-readability` (backend), `v8.58.0-b26.2.2-feedback-readability` (frontend). **Quote-length discipline:** short fragment + opening…closing ellipsis for long sentences in both craft and card prompts (prompt-only). **Figure-overlap dedupe:** craft owns internal-contradiction flag; card point on same figure addresses source reconciliation only — craft section passed to card pass + prompt instructions; neither signal suppressed. **Frontend:** Reviewer Assessment + Quality Review Summary + generate control in one bordered collapse container; generate button inline on REVIEWER ASSESSMENT header (caption removed); **Generate/View author feedback** button; modal title **Author feedback**. Resolves queued quote-length + figure-dedupe items from B26.2 testing. | See ROADMAP **Recently shipped → B26.2.2** |
| B26.2.4 | **SHIPPED 2026-07-05** — Output-type-aware craft pass. Tags: `b26.2.4-craft-output-type` (backend), `v8.59.0-b26.2.4-craft-output-type` (frontend). Frontend sends `outputType` on author-feedback request; backend normalizes (`normalizeOutputType` / `resolveConstructiveFeedbackCraftOutputType`; absent/invalid → null → generic craft). Normalized type threaded into craft call only — per-type calibration on the six existing dimensions (LinkedIn: conversational/first-person, hook opening OK; press release: factual lede, formal register; investor letter: salutation/narrative-arc, strict structure/register; reporting commentary: default). Card pass, selection, bundling, ordering, snapshot, `{ ok, feedbackText, isReady }` contract unchanged. Resolves **B35**. Editorial **R6.12** document-type-aware voice/register remains open (craft-layer only). | See ROADMAP **Recently shipped → B26.2.4** |
| SRC1 | **SHIPPED 2026-07-05** — Source publication-state pill alignment + override guard. Tag: `v8.60.0-src1-source-status-override` (frontend). Pill right-aligned in Assess and Drafting source rows (name → spacer → pill → remove). Manual override guarded against late-returning summarize-source inference via `publicationStateSource: "auto" \| "manual"`; shared `applySourceSummaryPatch.mjs` used by both hooks (skips `publicationState` write when `"manual"`, still applies `description`); covered by `tests/source-publication-state-patch.mjs`. No backend/payload/Compliance-calibration change — `publicationState` already consumed by Compliance (R6.4a). Partially resolves ROADMAP Active Backlog **#18(b)**. | See ROADMAP **Recently shipped → SRC1** |
| B35 | **RESOLVED (B26.2.4, 2026-07-05)** — Constructive Feedback craft pass was output-type-blind. Closed by **B26.2.4** craft-pass calibration (frontend `outputType` on request; backend craft prompt only). Editorial-layer **R6.12** voice/register gap unchanged — separate scope. | **B26.2.4** |
| B36 | **CLOSED 2026-07-05** — Vitest standardisation. `tests/constructive-feedback.test.mjs` (backend) and `tests/source-publication-state-patch.test.mjs` (frontend) converted to real Vitest suites (`describe`/`test`; assertions unchanged as `node:assert/strict`). `npm test` runs `vitest run` in both repos, scoped to `tests/**/*.test.mjs`. Other node:assert scripts unchanged — run via `node`. Future unit tests named `*.test.mjs` are auto-picked up by `npm test`. | Vitest standardisation 2026-07-05 |
| B6  | Wire Visibility (Complete vs Public) into rebuild — visibility now affects QC behaviour via R4.3 rule filtering and prompt calibration; Writing-path review intent wired in R6.13.1 (`versionType` / `selectedTypes` → `requiredVersion` / `outputType`). Residual Tier B decisions (review toggles, eventType) remain open — see **B28**, **B29**. | R4.3 (`r4.3-visibility-wiring`), R6.13.1 (`r6.13.1-visibility-log-fix`) | |

---

## How to update this file

This file is updated by Cursor on instruction from the user. The standard pattern:

**To add a new item**, the user gives Cursor a short instruction like:

> Add to BACKLOG.md under [section]: [one-line description]. Source: [where it came from]. Priority: [H/M/L].

Example:
> Add to BACKLOG.md under Frontend / UI: "Tooltip on Editorial signal explains the rule that fired." Source: R2.4 testing. Priority: L.

Cursor adds the row at the bottom of the relevant table with the next available ID (F7, B12, etc.) and writes the entry. No reformatting of existing rows.

**To close an item**, the user gives Cursor:

> Close BACKLOG.md item [ID]. Resolved by [tag/spec ID].

Cursor moves the row from its current table into the "Closed" table with the resolution tag noted, and adjusts the IDs only if necessary (gaps in numbering are fine — leave them).

**To re-prioritise**, the user gives Cursor:

> Update BACKLOG.md item [ID] priority to [H/M/L].

Cursor edits the priority column. No other changes.

**Periodic review**: at the end of each sprint, the user reviews this file with Claude to identify items ready to schedule. Items moving into a sprint don't get closed until shipped — they stay in the backlog with a note like "(scheduled in R3.1)".

---

## Conventions

- **Priority**: H = should pick up in next sprint or two, M = should pick up within a few sprints, L = nice-to-have, no urgency. `--` = watch-only / no priority.
- **Source / context**: where the item was identified. Useful for tracing back to a chat or Langfuse trace if context is needed.
- **IDs**: prefixed by table — F (Frontend), B (Backend), P (Process), Pr (Product). Numbers are assigned sequentially within each table and never reused.
- **No detailed specs in this file**: each row is a one-liner. When an item is scheduled, a proper spec gets written.
