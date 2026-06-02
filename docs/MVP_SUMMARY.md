# Brightline Content Engine — MVP Launch Blockers

> **Generated file — do not edit by hand.**
> Derived view of MVP-designated items. Sources of truth:
> `docs/BACKLOG.md` (rows where MVP column = "MVP") and
> `docs/ROADMAP.md` (items tagged "[MVP]"). Editing this file by hand
> will cause it to drift.
>
> **To regenerate:** instruct Cursor —
> "Regenerate docs/MVP_SUMMARY.md: pull every BACKLOG.md row with MVP
> column = 'MVP' and every ROADMAP.md item tagged '[MVP]' into the flat
> table, overwrite the file entirely."
>
> Last generated: 2026-06-02

## MVP-designated items (16 total)

| ID | Item | Source | Priority |
|----|------|--------|----------|
| F1 | "Highlight in draft" link broken in Assess module | BACKLOG: Frontend/UI | M |
| F2 | Statement-level colour-coding broken in Assess module | BACKLOG: Frontend/UI | M |
| F5 | UI display labels misaligned with architecture rubric | BACKLOG: Frontend/UI | M |
| F7 | Reinstate colour-coding of draft text and Highlight in Draft functionality in Assess module after Assess runs. Quality Review module has this in its Draft Context pane; Assess does not currently have a Draft Context pane, which is the limiting factor. | BACKLOG: Frontend/UI | M |
| F9 | Editorial concern text duplicates its replacement instruction within a single bullet (single thousand-separator concern rendered 'Replace "10,000" with "10'000".' twice). Check for duplicated suggestion text in concern generation/rendering. **Cross-ref:** ROADMAP **COMMENTARY CALIBRATION** work-stream (2026-06-01 comments review). | BACKLOG: Frontend/UI | L |
| B19 | Stage 5 evidence commentary uses meta phrasing referencing the tool's own plumbing ('as stated in the excerpt', 'the excerpt directly supports this'). **CONFIRMED PERVASIVE** by 2026-06-01 diagnostic: 53 instances across the batch; the single most common phrasing pattern. Also redundant (narrates source AND excerpt, which is a fragment of the source). Now folded into the **COMMENTARY CALIBRATION** work-stream (ROADMAP). Principle: describe the source once; never reference the evidence-selection mechanism. | BACKLOG: Backend/Pipeline | H |
| B20 | UI Required version = Complete reaches the handler as `visibility:null`. Visibility selection not propagating frontend → QC handler on the ad-hoc analyse-statements path. Means R4.3 visibility-dependent rules are not exercised in manual testing. Investigate frontend payload vs handler field read. | BACKLOG: Backend/Pipeline | M |
| B21 | Editorial schema-fallback silent failure — see ROADMAP (SCHEDULED NEXT, before R7). Observability + reliability. | BACKLOG: Backend/Pipeline | H |
| B22 | Commentary calibration work-stream — see ROADMAP. Anchor: 'excerpt' meta-phrasing (B19) + technical/preachy/verbose register across rules. | BACKLOG: Backend/Pipeline | H |
| B23 | Editorial rule bug-fix pass — see ROADMAP. Six bugs (`date_format`, `thousand_separator`, `number_spelling`, `internal_plausibility`, `structural_integrity`, `passive_voice` direction) + materiality scoping + forward-looking hedging recognition. Diagnose-first. | BACKLOG: Backend/Pipeline | H |
| B24 | Source-public-state awareness — see ROADMAP. One capability serving `precise_confidential_detail`, `named_individual_attribution`, and the public-source compliance gap. | BACKLOG: Backend/Pipeline | H |
| P6 | Business backlog gap | BACKLOG: Process & governance | M |
| Pr8 | Reviewer Assessment reframe — turn the assessment from restating the QC cards into substantive senior-editor feedback on the draft. | BACKLOG: Product | H |
| R5.1.2 | Confidential-detail rule covers unlabelled return multiples — expand `precise_confidential_detail_in_public_version` description to call out unlabelled return figures (e.g. “3.2x net of fees”, “delivered 4.5x”). LLM currently fires once per sentence and picks the most unambiguous metric (EV/EBITDA), missing MOIC-style figures. Promoted from R4.3 watch — pattern confirmed across two test batches. | ROADMAP | Planned |
| R6.8 | **Cross-source display semantics** — cross-source detection now **works** (F18 resolved — 0→3 conflicting, correctly). Open question is **display semantics only:** statements supported-by-source-A but contradicted-by-source-B currently read 'supported + conflict flag' (F18 S3/4/5/7). Decision needed: keep supported-with-flag, or escalate to partial/conflicting. Risk: a reviewer skimming green verdicts may miss the flag on a material discrepancy. Ben's lean: escalate — but **decide only after** reviewing how prominently the conflict flag surfaces in the UI. Reframed from 'fix aggregation' to 'decide display'. | ROADMAP | Medium |
| R7 | R7 — Sources Drawer Revival | ROADMAP | LOGGED |
