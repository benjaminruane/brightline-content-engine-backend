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

| ID  | Item | Source / context | Priority | Notes |
|-----|------|------------------|----------|-------|
| F1  | "Highlight in draft" link broken in Assess module | R2.1 testing | M | Works in Quality Review module. Likely missed during Assess module build. |
| F2  | Statement-level colour-coding broken in Assess module | R2.1 testing | M | Works in Quality Review. Same root cause likely as F1. |
| F3  | `<>` JSON copy button missing/broken in Assess module | R2.3 testing | L | Exists in Quality Review. Frontend chore, ~10 lines. |
| F4  | Enter-to-execute on Assess module's primary action button | R2.3 user request | L | Standard UX pattern. Useful for power users. |
| F5  | UI display labels misaligned with architecture rubric | R2.3 user observation | M | "Supported" should be "Confirmed". Align all four labels: confirmed / partially confirmed / conflicting / no support. Decision: more definitive language preferred for an audit-safe product. |
| F6  | "1 claim have" grammar bug in Reviewer Assessment | userMemories | L | Pre-existing item from product backlog. |
| F7  | Reinstate colour-coding of draft text and Highlight in Draft functionality in Assess module after Assess runs. Quality Review module has this in its Draft Context pane; Assess does not currently have a Draft Context pane, which is the limiting factor. | R2.4+R2.5 testing | M | |

**Suggested grouping**: F1–F5 share the Assess module surface and could be bundled into a single frontend polish sprint, e.g. `v8.43-assess-polish`.

---

## 2. Backend / Pipeline

| ID  | Item | Source / context | Priority | Notes |
|-----|------|------------------|----------|-------|
| B1  | Stage 2 prompt nuance: "all X, therefore not Y" patterns | R1.2.5.3 reproducibility findings (P02, P25) | L | When source says "all employees in Ottawa" and draft claims "offices in Berlin," current rubric drifts between `no_support` and `conflicting` at temp 1. Worth a prompt-tightening spec eventually, but not blocking. |
| B2  | "Excerpt could not be retrieved" on conflict cards | R1.2.3, R2.3 testing | L | v3 Stage 4 artifact. Architecture says Stage 2 should already return the passage; v3's separate retrieval step is unnecessary. Should resolve when R2.5 (Stage 4 in v4) lands. Substantially mitigated by r2.5.3 for bracket-abridgement cases. Residual placeholder appears only on silent-splice cases — see new backlog item B-next on splice handling. |
| B3  | Anthropic prompt caching for Stage 2 source text | R1.2.4 finding | L | Stage 2 reads the same source repeatedly across statements. Anthropic cache hits are 10× cheaper on input. Potential meaningful cost saving when Anthropic models become viable for Stage 2. Currently dormant since gpt-4o is locked. |
| B4  | LLM call consolidation: merge editorial + compliance + style | userMemories | M | Architecture-level optimisation. Three review calls per statement could potentially become one. Cost model projects ~19% saving on production runs. Defer until v4 is fully live. |
| B5  | Stage 2 chunking cost ceiling for long sources | userMemories | L | Pre-existing. Long sources can blow up Stage 2 token cost. Defer. |
| B6  | Wire Visibility (Complete vs Public) into rebuild | userMemories | M | Currently has no observable QC effect. Decide whether it should affect QC behaviour or remain UI-only metadata. |
| B7  | Document "internal source contradiction" handling | R1.2.5.2 finding | L | Stage 2 already handles this correctly (returns `conflicting` when a source contradicts itself), but the architecture document doesn't acknowledge this case. Add a paragraph to architecture section 5.2. |
| B8  | E2 deterministic reimplementation | userMemories | L | Pre-existing. Defer. |
| B9  | Implement-changes sprint (writer applies QC suggestions) | userMemories | L | Pre-existing. Defer. |
| B10 | Spring clean / codebase hygiene | userMemories | L | Pre-existing. Defer to after v4 is live and v3 is deletable. |
| B11 | Public version prompt | userMemories | L | Pre-existing. Defer. |
| B12 | Add canary score for non-schema Stage 2 failures (network errors, timeouts) so they're tracked in Langfuse alongside schema failures. | R2.3 implementation review | L | |
| B13 | Stage 5 commentary should explicitly distinguish 'pedantic gap' partials from 'material gap' partials. For partially_confirmed verdicts, commentary must name what's confirmed precisely, name the specific gap using the source's exact language, and suggest the reviewer's action. To be designed into the Stage 5 prompt during R2.6. | R2.5.2 user observation | M | |
| B14 | Model non-compliance with explicit prompt rules: gpt-4o does not reliably honour negative constraints (e.g. 'do not abridge passages') on dense compound statements, even at temp 0. Future stages should design defensively — validation layers that handle expected non-compliance modes rather than rely on the model's adherence. | R2.5.2.1 diagnostic finding | M | |
| B15 | Stage 2 occasionally returns silently spliced passages (multiple non-adjacent source spans presented as contiguous, with no ellipsis marker). Validator correctly rejects these, but the resulting placeholder appears on conflict cards. Possible mitigations: (a) two-call retry asking for a single contiguous span when first call's passage fails validation, (b) accept and surface explicitly as 'spliced excerpt - confirm against source'. To consider after pipeline-v4 fully live. | R2.5.3 testing | M | |

---

## 3. Process & governance

| ID  | Item | Source / context | Priority | Notes |
|-----|------|------------------|----------|-------|
| P2  | Reproducibility test pattern for future model evals | R1.2.5.3 finding | M | Standard for any future eval involving reasoning models or temperature > 0: run 2–3 times, check for stability, average results. Add to `ai/AI_OPERATING_MANUAL.md` when next updated. |
| P3  | Re-eval trigger: new gpt-5-family model with materially better latency | R1.2.6 conclusion | -- | Watch only. Re-run R1.2.5 if a candidate appears that addresses gpt-5's latency profile. |
| P4  | Re-eval trigger: new Anthropic Sonnet/Haiku with closed agreement gap | R1.2.6 conclusion | -- | Watch only. |
| P5  | Single technical opinion risk | userMemories | M | Pre-existing. Claude is the only technical sounding board. No current cross-validation. Worth flagging if anything goes wrong. |
| P6  | Business backlog gap | userMemories | M | Observability, cost modelling, pricing, second pilot user. Materially lighter than product backlog. Needs active attention. |
| P7  | Singapore government AI funding eligibility | userMemories | L | Startup SG Tech POV primary, AI Accelerate parallel. Confirm prerequisites before applying. |

---

## 4. Product

| ID  | Item | Source / context | Priority | Notes |
|-----|------|------------------|----------|-------|
| Pr2 | Merge duplicate concerns | userMemories | L | Merge duplicate concerns — partial fix shipped in R3.4. R3.4 addressed the Evidence-vs-Editorial duplication on conflicting statements by suppressing `overreach_unsupported_causal` and `internal_plausibility` from `editorialConcerns` when Evidence verdict is `conflicting`. The Langfuse canary `editorial_concern_suppressed_by_evidence` tracks suppression frequency. **Remaining open:** (a) Evidence-vs-Editorial duplication on `partially_confirmed` verdicts (R3.4 deliberately scoped to conflicting only). Reactivate if the same noise pattern shows up on partials. (b) Editorial-vs-Compliance overlap on promotional language (e.g. `marketing_language_excess` + `regulatory_prohibited_language` firing on the same sentence). Reviewed and judged intentional — both signals serve distinct reviewer decisions (craft vs regulatory). No fix planned; revisit if reviewer feedback indicates the overlap is genuinely noisy rather than complementary. |
| Pr3 | Align Direction intensity — Evidence softer than others | userMemories | L | Pre-existing. |
| Pr4 | Reviewer comments follow house style | userMemories | M | Pre-existing. |
| Pr5 | Hide Editorial on conflict | userMemories | L | Pre-existing. |
| Pr6 | Fidelity log traceability (add draft identifier) | userMemories | L | Pre-existing. |

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
