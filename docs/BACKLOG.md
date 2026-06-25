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
| F8  | Editorial 'spell out numbers 0–12' rule over-fires on quarter notation (flags 'Q3 2010', suggests 'third quarter'). Quarter labels are date references and should be exempt; structurally checkable (`/Q[1-4]\s?\d{4}/`) — candidate for a deterministic backstop. Belongs with R6.5 house-style cluster. **Cross-ref:** ROADMAP **EDITORIAL RULE BUG-FIX PASS** (2026-06-01 comments review). | R2.7.2 Run 1 testing | L | Post-MVP | |
| F9  | Editorial concern text duplicates its replacement instruction within a single bullet (single thousand-separator concern rendered 'Replace "10,000" with "10'000".' twice). Check for duplicated suggestion text in concern generation/rendering. **Cross-ref:** ROADMAP **COMMENTARY CALIBRATION** work-stream (2026-06-01 comments review). | R2.7.2 Run 2 testing | L | MVP | |
| F10 | Single-concern Editorial cards may render the lone concern as a bullet — check rendering consistency across single-concern Editorial cards (bulleted vs inline). | R2.7.2 Run 1 testing | L | Post-MVP | |

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
| B6  | Wire Visibility (Complete vs Public) into rebuild | userMemories | M | Post-MVP | Currently has no observable QC effect. Decide whether it should affect QC behaviour or remain UI-only metadata. |
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
| B29 | **R6.13 Tier B — v4 review-toggle behaviour.** editorialEnabled / complianceEnabled / evidenceEnabled are sent by the UI but ignored on the v4 API path (v4 always runs all stages). Decide: honour on v4, or remove from UI. Source: R6.6-audit. | R6.13-audit | M | Post-MVP | PENDING DECISION |
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
| Pr8 | Reviewer Assessment reframe — turn the assessment from restating the QC cards into substantive senior-editor feedback on the draft. | 2026-06-02 MVP review | H | MVP | Deepens Pr1 (closed). Senior-editor-quality output; likely lands within R6 Review Quality umbrella — cross-ref R6.1 / R6.2. |
| B26 | **Constructive Feedback output** (working title) — generate action in Reviewer Assessment: writer-addressed feedback synthesis over existing QC (second register of synthesis primitive; all three signals; no revised text; copy/paste-friendly for email). Sibling to Reviewer Assessment, sequenced after R6.6 (shipped 2026-06-25). Distinct from implement-changes (B9) and shelved suggest→implement. See ROADMAP **Near-term — Review output → CONSTRUCTIVE FEEDBACK OUTPUT**. **Open scoping:** (1) signal selection — all concerns vs material points only; (2) copy/paste fidelity — plain vs rich vs artifact; (3) register calibration — constructive without softening. | Reviewer Copilot-assisted feedback workflow, 2026-06 | M | MVP | |
| W1  | **internal_plausibility** — may still attempt to fire on statement-vs-source figure discrepancies (rounded vs exact). Scope wording in place (R6.2e); in testing suppression came via the fidelity gate (cited source figure absent from statement), not the model obeying the scope constraint — B14 pattern. User-visible result correct. Action: review next diagnostic batch; add targeted deterministic backstop only if it recurs in a form the fidelity gate misses. See ROADMAP **Watch items → internal_plausibility**. | R6.2e verification | -- | MVP | Watch only |

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
| B19 | Stage 5 evidence commentary uses meta phrasing referencing the tool's own plumbing ('as stated in the excerpt', 'the excerpt directly supports this'). Also redundant (narrates source AND excerpt). | `commentary-calibration` — v4 `stage5_v2.md` |
| B22 | Commentary calibration work-stream — excerpt meta-phrasing (B19) + technical/preachy/verbose register across reviewer concern prose. | `commentary-calibration` — see ROADMAP Near-term — Review output |
| B21 | Editorial schema-fallback silent failure — observability + reliability. | R6.11a `r6.11a-editorial-schema-salvage` + R6.11b `r6.11b-not-reviewed-state` / `v8.54.0-r6.11b-not-reviewed-state` — see ROADMAP **R6.11** |
| B23 | Editorial rule bug-fix pass — editorial/style (`date_format`, `percentage_notation`, `number_spelling`, `internal_plausibility`, `passive_voice_overuse`) + compliance (`comparative_claim_without_basis`, `forward_looking_statement_without_qualifier`). Diagnose-first then R6.2e/R6.2f. | `r6.2e-editorial-rule-bugfix` + `r6.2f-compliance-rule-bugfix` — see ROADMAP **EDITORIAL RULE BUG-FIX PASS** |
| B24 | Source-public-state awareness — R6.6 chapter (R6.6.1–R6.6.4). | R6.6 closed 2026-06-25 — see ROADMAP **Recently shipped → R6.6** |
| B20 | Writing-module QC (`useDraftState.jsx` `runStatementAnalysis`) did not send the user's required version or output type, so the pipeline silently ran every Writing review as Complete / Reporting Commentary. Complete was accidentally correct (default matched); Public was dropped and never engaged public calibration. The `visibility:null` log was a separate stale-field-name defect (`editorial-compliance-reviewer.mjs` logged `visibility` while the pipeline carries `requiredVersion`). Both fixed in R6.13.1; verified by 7→8 compliance rule-subset flip on Public + press_release. Regression guard added in R6.13.2. | R6.13.1 | |

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
