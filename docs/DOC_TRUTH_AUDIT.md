# What is still true (B269)

Audit of `docs/ARCHITECTURE.md` and `ai/AI_OPERATING_MANUAL.md` against the tree on 2026-09-20, before the rewrite. No product code was changed in this pass.

TRUE: matches the code or a committed fixture today.
STALE: was true, is now incomplete, dated, or missing a later mechanism.
WRONG: contradicts the code today.

Rows marked **CITED** were used as authority in a September 2026 spec report.

---

## docs/ARCHITECTURE.md

| # | Claim (where) | Verdict | Evidence |
|---|----------------|---------|----------|
| A1 | High-level flow: sources + draft to pipeline to one qcCard per sentence; frontend does not re-interpret verdicts (L4-5) | TRUE | Backend `assembleCard` is the contract. Frontend maps `displayVerdict` to labels and colours (`src/modules/drafting/displayVerdictLabels.js` L12). It does not re-run Stage 3. |
| A2 | v4 lives at `lib/qc/pipeline-v4/`; LLM stages use gpt-4o at temperature 0 via `lib/qc/model-config.mjs` (L11) | STALE | Temperature 0 is still set on v4 LLM stages (`stage1-extract-statements.mjs` L309, `stage2-match-sources.mjs` L1052, `stage5-generate-commentary.mjs` L171, `editorial-compliance-reviewer.mjs` L1611). `STAGE_MODELS` pins `gpt-4o-2024-08-06`, not the floating alias (`model-config.mjs` L19-27). |
| A3 | Seven logical stages, table L15-22 | TRUE on existence and order of work. STALE on several cells. See A4-A12. | `lib/qc/pipeline-v4/index.mjs` runs 1, 1b, 2, widened match, 3, 4, 6, 5, 7. |
| A4 | Stage 1: LLM split with deterministic fallback; `{ text, charStart, charEnd, index }` (L15) | TRUE | `stage1-extract-statements.mjs`. Fallback still exists. Silent drop of `isClaim=false` is later (`B248`/`B249`), not in this sentence. |
| A5 | Stage 1b: `QC_CLAIM_SPANS` default ON; caps 3 claims / 12 sentences (L16) | TRUE | `claim-spans.mjs` L9-10, L97-101: unset env returns true. |
| A6 | Stage 2: classifications `confirmed` / `partially_confirmed` / `conflicting` / `no_support`; concurrency 24; `seed=1` (L17) | TRUE | `STAGE2_CONCURRENCY = 24` and `STAGE2_SEED = 1` (`stage2-match-sources.mjs` L59-63). Schema fail defaults the pair to `no_support` (`B250`), not stated here. |
| A7 | Stage 3 conflict-wins, then optional upgrade-only claim rollup; intra-source reducer (L18) | TRUE | `stage3-aggregate-verdict.mjs` L31-37; reducer `applyIntraSourceReducer`; rollup in `claim-spans.mjs`. Missing: supersession can demote a pair before this (`index.mjs` L61-79). Missing: coverage-union can promote partial to confirmed when `QC_MULTISOURCE_COVERAGE` is on, default OFF (`coverage-union.mjs` L10-15). |
| A8 | Stage 4 returns `{ primaryExcerpt, conflictExcerpt }` each with `passage`, `sourceLabel` (L19) | WRONG on the assembled card | Stage 4 still builds excerpt objects. Assembly writes `primaryExcerpt` as a passage string or null (`stage7-assemble-card.mjs` L751-793). `conflictExcerpt` is still the object. **B158** still open. |
| A9 | Stage 5 commentary stored as `evidenceSummary` / `reasoningParagraph` (L20) | STALE | True when the call succeeds. A miss now stamps empty strings plus `commentaryNotReviewed: true` (`stage7-assemble-card.mjs` L745-749, L796). The four canned "Specific commentary is unavailable" strings are gone (**B254**). |
| A10 | Stage 6: current statement only; two parallel LLM calls per statement (L21) **CITED** `scripts/diagnostic/delivery-check/review-cost-proposal.md` L26, L126 | TRUE as evaluation scope. STALE as a description of the prompt. | `EDITORIAL_EVALUATION_SCOPE` (`editorial-compliance-reviewer.mjs` L76). The same payload then pastes the full marked draft (`L1354-1357`, `L1404-1407`). Cited this month as the reason not to batch sentences. Evaluation rule is still that. Token cost is the full draft every time. |
| A11 | Stage 7 assembles the qcCard the frontend already expects (L22) | STALE | Assembler is still shared (`pipeline-v3/stage7-assemble-card.mjs`). Additive fields since the rebuild: `commentaryNotReviewed`, `supportSpans`, `disagreementPassages`, and others. Frontend still does not re-derive the evidence verdict. |
| A12 | Execution: 1b after 1, widened matcher before 3, Stage 6 before Stage 5 (L24) | TRUE | `index.mjs` L575-656. Missing: Stage 5 and Stage 6 are pooled at 24 (`STAGE5_CONCURRENCY` / `STAGE6_CONCURRENCY` L44-45). |
| A13 | Stage 1b pre-filter and B64 anchors (L26) | TRUE | `claim-spans.mjs` additive boundaries L13-20; relational connectives L27 onward. |
| A14 | Upgrade-only rationale (L28) | TRUE | Comment in `claim-spans.mjs` L1-4. |
| A15 | LLM-last: Stage 3 and display fields are code; commentary cannot change the verdict (L38-42) | TRUE | Stage 5 writes prose only. `commentaryNotReviewed` does not change `displayVerdict`. |
| A16 | Model does not return offsets; spans derived from quotes (L42, section 4) | TRUE | `extractQuotedSnippets` path in editorial-compliance-reviewer. `source: "code_match"` still reserved, not implemented. |
| A17 | Three-signal separation; Style merged into Editorial; Compliance separate (L46-50) **CITED** review-cost-proposal L49, L127, L139 | TRUE as product rule. STALE on the cost sentence. | Two calls still run (`runEditorialStyleReview`, `runComplianceReview`). "~$0.02/run not worth signal dilution" is a 2026-05 planning estimate. On the comparable Shopify memo, editorial was 55% of the Langfuse bill and compliance 15% (`review-cost-proposal.md` L44-46). The product rule (do not merge Compliance) still holds because of B99, not because of that two-cent figure. |
| A18 | Conflicts always surface; residual B158 (L54) | TRUE | Conflict-wins `stage3-aggregate-verdict.mjs` L31-32. **B158** still OPEN (`docs/BACKLOG.md` L131). |
| A19 | Temperature 0; `QC_LLM_CACHE` default ON, memory only in production; does not close B61 (L58) **CITED** review-cost-proposal L245 | TRUE | `llm-cache.mjs` L4-9, L24 `STAGES = stage1, stage1b, stage2`. Stage 5 and 6 are not in that cache. **B61** still OPEN. |
| A20 | One sentence = one QC card; claim spans never create extra cards (L62-64) | TRUE | `index.mjs` still assembles one card per statement. |
| A21 | Backend authority (L68) **CITED** `silence-and-excerpt-design.md` L214 | TRUE | Unchanged. |
| A22 | Evidence qcCard field list (L80) | STALE | Missing `commentaryNotReviewed`, `supportSpans`, `disagreementPassages`. `primaryExcerpt` is string or null, not an excerpt object. `whyItMatters` is hardcoded null at assembly L820. |
| A23 | R6.3 editorial duplication judge on conflicting evidence only (L81) | TRUE | `editorial-duplication-judge.mjs`; temperature 0 at L106; model `gpt-4o-mini-2024-07-18` (`model-config.mjs` L43). |
| A24 | Editorial+Style evaluates craft per editorialRules.js and styleGuide.js (L87) | TRUE | Files exist. House voice is now a single table (`lib/prompt-library/house-voice.mjs`, **B220**), not mentioned here. |
| A25 | Compliance evaluates regulatory rules filtered by output type and visibility (L96-99) | TRUE | `filterRulesForRun` / `appliesToVersion` still in `editorial-compliance-reviewer.mjs`. |
| A26 | Near-term work-streams: CONSTRUCTIVE FEEDBACK OUTPUT, R6.12, R7 (L103) | WRONG as "current" | R6.12 shipped 2026-07-05 (`docs/ROADMAP.md` L399). B26 family shipped 2026-06-30. Constructive feedback is a covering note (**B226**/**B240**), not a near-term work-stream. |
| A27 | Span derivation steps (section 4) | TRUE | Parser plus earliest case-insensitive match. |
| A28 | Coverage editorial ~96%, compliance ~56% (L122) | STALE | Early dogfooding numbers. Not re-measured in this pass. Canary names still exist (`editorial-compliance-reviewer.mjs` L2479, L2493). |
| A29 | v3 path does not attach spans (L124) | TRUE | v3 editorial path is the fallback route. Production selects v4. |
| A30 | Visibility Complete vs Public (section 5) | TRUE | Still injected into Stage 6 prompts. Not re-audited rule-by-rule in this pass. HYPOTHESIS: the two named Public-only compliance rules still exist in `complianceRules.js`. |
| A31 | What v2 dropped (section 6) | TRUE | v4 still does not create extra cards, does not use role gates, does not drive verdicts from excerpt-quality failure. |
| A32 | What was kept: LLM split, three-signal, qcCard, regression suite, plumbing (section 7) | STALE | Regression suite still exists (`package.json` L14 `qc:test`). qcCard has grown. "rebuild did not require qcCard field changes" is no longer a useful sentence. |
| A33 | `QC_PIPELINE_V4=1` or `options.pipelineRoute === "v4"` selects v4; else v3 (L182-184) | TRUE | `api/analyse-statements.js` L245-246; `env-flags.js` L13. |
| A34 | As of 2026-05-17 production and development run v4 (L186) | STALE date, still true in production | `scripts/diagnostic/backend-census.md` L364. v3 modules are still imported on every request. |
| A35 | `qcCard.pipelineVersion` stamped from the route (L188) | TRUE | `index.mjs` L129, L156, L688; assembly L830. |
| A36 | Planned retirement R4.2 after 15-25 traces (L190) | STALE | R4.2 is parked (`docs/ROADMAP.md` L954-959). v3 is still the unset-env fallback. |
| A37 | Operational gap: log the resolved env var every request (L192) | STALE | Handler logs `[handler] route selected: v4\|v3` (`analyse-statements.js` L247). It does not print `QC_PIPELINE_V4`. |
| A38 | Neon Postgres 18, Frankfurt, matching `fra1` (L198) **CITED** persistence notes this month | TRUE as repo documentation | `README.md` L49; `vercel.json` regions `fra1`. Postgres 18 is not asserted from a live `SELECT version()` in this pass. |
| A39 | `review_state` is an autosave buffer; B9 append-only decisions come later (L200) **CITED** ARCHITECTURE §9 | STALE | `review_state` is still an overwrite blob. `reviewer_decisions` now exists (`db/migrations/003_reviewer_decisions.sql`; **B186**). First kinds are source governance and override, not per-finding accept/reject. B9 is not closed. |
| A40 | Review correctness summary (L221) | TRUE for current Review evidence. STALE vs product intent. | ROADMAP still lists the eight principles (L1395-1406). Principle 6 (draft-vs-draft out of scope) is current code and contradicts **Pr16** (must-have, not built). Principle 7 (explain, do not rewrite) is WRONG for Implement Changes and for `suggestedRewrite` on cards. |

Omitted from architecture entirely, and now load-bearing:

| Missing | Why it matters |
|---------|----------------|
| Model snapshots, not aliases | Specs that say "gpt-4o" are already wrong against `model-config.mjs`. |
| Stage 5/6 pool at 24 | **B265**. Peak Stage 6 in-flight is 48. |
| Function `maxDuration` 300 | **B263**. `vercel.json`. |
| `commentaryNotReviewed` | **B254**. A Stage 5 miss is not a finding. |
| Editorial/compliance off stamps `clean` in the payload, `Not reviewed` on screen | **B247**. `stage7-assemble-card.mjs` L515. |
| Coverage union, default OFF | Can change a partial to confirmed when the flag is on. |
| Supersession | Demotes a pair before Stage 3. |
| `reviewer_decisions` | Persistence is no longer only `review_state`. |
| Stage 6 still 429s at document scale | **B268**. Honest `not_reviewed`, not a fake finding. |

---

## ai/AI_OPERATING_MANUAL.md

| # | Claim (where) | Verdict | Evidence |
|---|----------------|---------|----------|
| M1 | Product one-liner (L3-4) | TRUE | Still the product. |
| M2 | Core principles (L7-13) | TRUE | Still the working rules. Also in `.cursor/rules/ce-core-rule.mdc`. |
| M3 | Working model: spec, Cursor implements, Ben commits immediately, Vercel deploys, Ben tests live, evidence, next spec (L16-22) | STALE | Cursor commits when asked. `npm run verify:ship` is the ship gate and requires the commits on the remote (`scripts/verify-ship.mjs` L65-90). Live Review is required only for work downstream of a Review. Specs this month stacked on the same day. |
| M4 | Response rules (L25-30) | TRUE as intent | Still the right tone. |
| M5 | Spec expectations: plain-language summary, one-line commit, spec inside the spec block (L33-37) | WRONG as a description of the form in use | September specs are BUILD SPEC documents with Part 0 claims, Part 0B design, a scoreboard, and a cost report. The June template (`ai/SPEC_TEMPLATE.md`) is the old form. Dual summary lives in `.cursor/rules/summary-contract.mdc`. |
| M6 | `editorialVerdict: "not_reviewed"` is the audit signal; clean note is canonical (L41-45) | TRUE | `markEditorialNotReviewed` (`editorial-compliance-reviewer.mjs` L1569-1572). Canonical clean note L1929, L2039. When editorial is off, assembly stamps `clean` (**B247**), so "not_reviewed means unchecked" is true only when the check was requested. |
| M7 | First-person category routing essay (L47-49) | STALE | R6.11a salvage still exists (`editorial-compliance-reviewer.mjs` L580). House voice is now one table (**B220**). `first_person_plural` still does not apply to press release (**B223**). The essay is a lesson (B14: do not prompt-police category), not a current map of the rules. |
| M8 | One ref, R-series, appears in spec/commit/tag/ROADMAP/BACKLOG (L53-66) | WRONG as the current convention | Work this year is identified by BACKLOG ids (B254, B269). Tags are `b263-function-duration-300`, not `r6.2e-...`. Frontend v8.x tags are no longer the way frontend ships. The invariant that remains: a BACKLOG row plus a commit. |
| M9 | Verification-by-grep (L88-96) | TRUE as a discipline | Still required when a previous implementer claimed success wrongly. |
| M10 | R6.4a live-path story (L100-102) | TRUE as a lesson | The lesson is: trace the live path before iterating a prompt. The incident is historical. |
| M11 | Testing: max 3 runs; ~$2/run at 4 statements / 1 source; diagnostic batch $25-30 (L105-109) | STALE | Four-statement baseline is not how real documents behave. Comparable Shopify memo: USD 8.4497 (`docs/SPEND_LEDGER.md` L12). Cost must come from Langfuse, not from this paragraph. |
| M12 | QC output language standard (L116-125) | TRUE as a rule | `whatThisShows` / `whatIsNotShown` / `whyItMattersText` / `commentaryPayload` are not the live card face. Live fields are `evidenceSummary`, `reasoningParagraph`, concern `note` / `suggestedDirection`. |
| M13 | Deterministic style backstops in `STYLE_RULE_DETERMINISTIC_FILTERS` (L128-143) | TRUE | `editorial-compliance-reviewer.mjs` L813, applied L1161. |
| M14 | Change-surface discipline (L147-155) | TRUE | Still the right spec rule. "canonical claims" is leftover v2 vocabulary. |
| M15 | Diagnostic discipline (L157-191) | TRUE as a rule | Standing rules P19, P22, P24, P26 say the same thing more sharply. |
| M16 | Spec sequencing, R5 and R3.1 examples (L193-204) | TRUE as a rule, STALE as examples | Split when surfaces differ. The examples are 2026-05 history. |
| M17 | Principle-based signal suppression, R6.3 (L206-217) | TRUE | Matches A23. |
| M18 | Doc-sync: draft a prompt at the moment of decision (L219-242) | WRONG as a working pattern | Cursor should edit `docs/BACKLOG.md` when a decision lands. Drafting a later prompt is how this manual itself went 72 days without an update. |
| M19 | File is for "how Claude/Cursor work" (`docs/BACKLOG.md` L8) | STALE | Claude is a sounding board outside this tree. This file is for Cursor. |

Standing rules in `docs/BACKLOG.md` L282-305 (18 rows) do not appear in this manual. Only **B222** appears in `.cursorrules`. That is the failure this spec exists to close.

---

## What this month already trusted

| Citation | File | Verdict now |
|----------|------|-------------|
| Stage 6 is current-statement-only | `review-cost-proposal.md` L26, L126 | TRUE as evaluation. STALE if read as "the prompt is small". |
| Cost is not why Compliance is a separate call | `review-cost-proposal.md` L26, L139 | TRUE as product history. STALE as a cost figure. |
| `QC_LLM_CACHE` covers stages 1, 1b, 2 | `review-cost-proposal.md` L245 | TRUE |
| Persistence is `review_state` plus ARCHITECTURE §9 | `source-governance-persistence-findings.md` L12 | STALE: `reviewer_decisions` exists |
| Backend is authoritative | `silence-and-excerpt-design.md` L214 | TRUE |
