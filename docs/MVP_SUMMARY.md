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
> Last generated: 2026-08-03

## MVP-designated items (13 total)

| ID | Item | Source | Priority |
|----|------|--------|----------|
| F1 | "Highlight in draft" link broken in Assess module | BACKLOG: Frontend/UI | M |
| F2 | Statement-level colour-coding broken in Assess module | BACKLOG: Frontend/UI | M |
| F5 | UI display labels misaligned with architecture rubric | BACKLOG: Frontend/UI | M |
| F7 | Reinstate colour-coding of draft text and Highlight in Draft functionality in Assess module after Assess runs. Quality Review module has this in its Draft Context pane; Assess does not currently have a Draft Context pane, which is the limiting factor. | BACKLOG: Frontend/UI | M |
| F9 | Editorial concern text duplicates its replacement instruction within a single bullet (single thousand-separator concern rendered 'Replace "10,000" with "10'000".' twice). Check for duplicated suggestion text in concern generation/rendering. **Cross-ref:** unrelated to closed **B22** (commentary register); candidate overlap with **ROADMAP** watch → `thousand_separator` / **R6.5.5** backstop. Independent open item. | BACKLOG: Frontend/UI | L |
| F12 | **R7 Sources Drawer UI** — extracted-text view with tiered highlight (highlight where extract offsets resolve cleanly; page/slide/sheet navigation via extractor structure metadata elsewhere); confirm/partial/conflict colour; per-span hover (statement back-ref). **DEPENDS ON Build B offsets (B40).** Rendered-document fidelity view = later sub-item. See ROADMAP **R7**. | BACKLOG: Frontend/UI | H |
| B40 | **R7 Build B — offset population on `supportSpans`.** Locate each Build A passage in the (now faithful) extracted source text; repair-normalised deterministic matching (curly/dash/whitespace); authoritative-span-or-drop (no fuzzy). Offsets currently null on emit. **DEPENDS ON** extractor swap (shipped `extractor-officeparser-swap`). **BLOCKS** drawer highlight (**F12**). See ROADMAP **R7**. | BACKLOG: Backend/Pipeline | H |
| P6 | Business backlog gap | BACKLOG: Process & governance | M |
| W1 | **internal_plausibility** — may still attempt to fire on statement-vs-source figure discrepancies (rounded vs exact). Scope wording in place (R6.2e); in testing suppression came via the fidelity gate (cited source figure absent from statement), not the model obeying the scope constraint — B14 pattern. User-visible result correct. Action: review next diagnostic batch; add targeted deterministic backstop only if it recurs in a form the fidelity gate misses. See ROADMAP **Watch items → internal_plausibility**. | BACKLOG: Product | -- |
| W2 | **R6.12 residual LinkedIn editorial noise** — F12 S6 `structural_integrity` and S8 hyperbole borderline on social formats after R6.12 ship. Monitor if more LinkedIn fixtures added. See ROADMAP **Watch items → R6.12 residual LinkedIn editorial noise**. | BACKLOG: Product | -- |
| R5.1.2 | Confidential-detail rule covers unlabelled return multiples — expand `precise_confidential_detail_in_public_version` description to call out unlabelled return figures (e.g. “3.2x net of fees”, “delivered 4.5x”). LLM currently fires once per sentence and picks the most unambiguous metric (EV/EBITDA), missing MOIC-style figures. Promoted from R4.3 watch — pattern confirmed across two test batches. | ROADMAP | Planned |
| R6.8 | **Cross-source display semantics** — cross-source detection now **works** (F18 resolved — 0→3 conflicting, correctly). Open question is **display semantics only:** statements supported-by-source-A but contradicted-by-source-B currently read 'supported + conflict flag' (F18 S3/4/5/7). Decision needed: keep supported-with-flag, or escalate to partial/conflicting. Risk: a reviewer skimming green verdicts may miss the flag on a material discrepancy. Ben's lean: escalate — but **decide only after** reviewing how prominently the conflict flag surfaces in the UI. Reframed from 'fix aggregation' to 'decide display'. | ROADMAP | Medium |
| R7 | R7 — Sources Drawer Revival | ROADMAP | IN PROGRESS |
