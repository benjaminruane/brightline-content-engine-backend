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
> Last generated: 2026-06-28 (docs-hygiene sync)

## MVP-designated items (13 total)

| ID | Item | Source | Priority |
|----|------|--------|----------|
| F1 | "Highlight in draft" link broken in Assess module | BACKLOG: Frontend/UI | M |
| F2 | Statement-level colour-coding broken in Assess module | BACKLOG: Frontend/UI | M |
| F5 | UI display labels misaligned with architecture rubric | BACKLOG: Frontend/UI | M |
| F7 | Reinstate colour-coding of draft text and Highlight in Draft functionality in Assess module after Assess runs. Quality Review module has this in its Draft Context pane; Assess does not currently have a Draft Context pane, which is the limiting factor. | BACKLOG: Frontend/UI | M |
| F9 | Editorial concern text duplicates its replacement instruction within a single bullet (single thousand-separator concern rendered 'Replace "10,000" with "10'000".' twice). Check for duplicated suggestion text in concern generation/rendering. **Cross-ref:** unrelated to closed **B22**; candidate overlap with **ROADMAP** watch → `thousand_separator` / **R6.5.5** backstop. Independent open item. | BACKLOG: Frontend/UI | L |
| B25 | Verdict-label consistency across surfaces. (1) Export (`api/export.js` `normalizeVerdict`) still reads "Supported"/"Not supported"; align to card vocabulary (Confirmed / Partially confirmed / Conflicting / No support) so the filed report matches the screen. (2) Correct the unrendered evidence verdict line in `displayVerdictLabels.js`: "Conflicting sources" → "Conflicts with sources" — the conflict verdict means the statement contradicts the source, not that sources disagree with each other. Display-only; no verdict enum or logic changes. | BACKLOG: Backend/Pipeline | M |
| P6 | Business backlog gap | BACKLOG: Process & governance | M |
| Pr8 | Reviewer Assessment reframe — turn the assessment from restating the QC cards into substantive senior-editor feedback on the draft. **Same work-stream:** **B26**, ROADMAP **Near-term → CONSTRUCTIVE FEEDBACK OUTPUT**, ROADMAP open list **#19**. | BACKLOG: Product | H |
| B26 | Constructive Feedback output (working title) — see ROADMAP **Near-term → CONSTRUCTIVE FEEDBACK OUTPUT**. **Same work-stream:** **Pr8**, ROADMAP open list **#19**. | BACKLOG: Product | M |
| W1 | **internal_plausibility** — may still attempt to fire on statement-vs-source figure discrepancies (rounded vs exact). Scope wording in place (R6.2e); in testing suppression came via the fidelity gate (cited source figure absent from statement), not the model obeying the scope constraint — B14 pattern. User-visible result correct. Action: review next diagnostic batch; add targeted deterministic backstop only if it recurs in a form the fidelity gate misses. See ROADMAP **Watch items → internal_plausibility**. | BACKLOG: Product (watch) | — |
| R5.1.2 | Confidential-detail rule covers unlabelled return multiples — expand `precise_confidential_detail_in_public_version` description to call out unlabelled return figures (e.g. "3.2x net of fees", "delivered 4.5x"). LLM currently fires once per sentence and picks the most unambiguous metric (EV/EBITDA), missing MOIC-style figures. Promoted from R4.3 watch — pattern confirmed across two test batches. | ROADMAP | Planned |
| R6.8 | **Cross-source display semantics** — cross-source detection now **works** (F18 resolved — 0→3 conflicting, correctly). Open question is **display semantics only:** statements supported-by-source-A but contradicted-by-source-B currently read 'supported + conflict flag' (F18 S3/4/5/7). Decision needed: keep supported-with-flag, or escalate to partial/conflicting. Risk: a reviewer skimming green verdicts may miss the flag on a material discrepancy. Ben's lean: escalate — but **decide only after** reviewing how prominently the conflict flag surfaces in the UI. Reframed from 'fix aggregation' to 'decide display'. | ROADMAP | Medium |
| R7 | R7 — Sources Drawer Revival | ROADMAP | LOGGED |

## Closed MVP items (removed from table above)

| ID | Resolved by |
|----|-------------|
| B19 | Closed by **B22** |
| B20 | **R6.13.1** |
| B21 | **R6.11a** + **R6.11b** + **B21** |
| B22 | **B22** / **B22.1** / **B22.2** — see BACKLOG Closed |
| B23 | **R6.2e** + **R6.2f** |
| B24 | **R6.6** |
