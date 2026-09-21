# B305. Roadmap and backlog match what actually happened

Documentation only. No product code. No tests added. No model calls. No production Review.

**TOTAL COST OF THIS SPEC IN USD: 0.00.** Zero model calls. Zero Langfuse generations. `verify:ship` is not a billed pass.

---

## Part 1. Verify before you write

Every BACKLOG row that claims SHIPPED or KILLED and carries a date on or after 2026-09-19 was checked against the repository: `git cat-file` for named commits, `git rev-parse` for named tags, filesystem for named tests and reports. Named artefacts that exist: VERIFIED. Named artefacts that were missing from the row: filled in place from `git log`, then re-checked. Nothing was quietly dropped.

B273 and B275 say MEASURED AND NOT SHIPPED. They were excluded from this table. They are not ships.

Rows corrected in place because they named no commit, or named a now-untrue joiner:

- Open B276 restored (it had been replaced while inserting B306) and given `8f15563` / tag `b277-b278-scheduler-and-wait` / `tests/b278-rate-limit-wait.test.mjs`.
- B262, B270, B272, B269, B289, B295, B301: commits, tests, and reports named.
- Closed F24, B164, B247, B249, B250, B251, B259, B274, B278, B285, B286, B287, B288, B290, B291, B292, B293, B294, B296, B297, B298, B299, B300, B302, B303, B304: commits filled from git.
- B196 Launch column RECORD. The sweep is done. It is not an open launch task.
- B298 example string amended to the B304 joiner (`Editorial and Compliance reviews.`).
- B305: this spec. Report is this file. Commit is the B305 git commit.

### SHIPPED / KILLED since 2026-09-19

| ID | Claim | Result | Evidence |
|----|-------|--------|----------|
| B254 | SHIPPED | VERIFIED | commit 30d3b9a (backend); commit 9621ff2 (frontend); test tests/b254-commentary-not-a-finding.test.mjs (backend); report scripts/diagnostic/delivery-check/async-review-build.md |
| B262 | SHIPPED | VERIFIED | commit 30d3b9a (backend); commit 9621ff2 (frontend); test tests/b254-commentary-not-a-finding.test.mjs (backend); report scripts/diagnostic/delivery-check/async-review-build.md |
| B263 | SHIPPED | VERIFIED | commit 1d9df5e (backend); tag b263-function-duration-300 (backend) |
| B265 | SHIPPED | VERIFIED | commit 3fe9348 (backend); test tests/b265-stage-concurrency-pool.test.mjs (backend) |
| B266 | SHIPPED | VERIFIED | commit 0ffce91 (backend); test tests/b266-rate-limit-retry.test.mjs (backend) |
| B267 | SHIPPED | VERIFIED | commit 6c20b67 (backend); test tests/b267-extraction-timeout.test.mjs (backend) |
| B268 | SHIPPED | VERIFIED | commit badb55e (backend); tag b268-stage6-pool-4 (backend); test tests/b268-stage6-pool.test.mjs (backend); report scripts/diagnostic/delivery-check/b268-stage6-pool.md |
| B270 | SHIPPED | VERIFIED | commit 6efe866 (backend); test tests/b270-stage-replay-harness.test.mjs (backend); report scripts/diagnostic/stage-replay/ |
| B276 | SHIPPED | VERIFIED | commit 8f15563 (backend); test tests/b278-rate-limit-wait.test.mjs (backend) |
| B272 | SHIPPED | VERIFIED | commit b449975 (backend); report docs/SPEND_LEDGER.md |
| B225 | SHIPPED | VERIFIED | commit f0bc71f (frontend); test tests/b225-assessment-finding-text.test.mjs (frontend) |
| B226 | SHIPPED | VERIFIED | commit d41f3ea (backend); commit 5eba0bf (backend); commit e2b28b3 (backend); tag b226-constructive-feedback (backend); test tests/b226-constructive-feedback-piece.test.mjs (backend); report scripts/diagnostic/delivery-check/b225-b226-report.md |
| B232 | SHIPPED | VERIFIED | commit 9254b37 (backend); commit 0ca8bf7 (frontend); tag b232-unverifiable-badge (backend/frontend); test tests/b232-export-verdict-label.test.mjs (backend); test tests/b232-display-verdict-label.test.mjs (frontend) |
| B227 | SHIPPED | VERIFIED | commit c48a464 (backend); commit 1113dde (frontend); test tests/b227-assessment-blank-finding.test.mjs (backend/frontend) |
| B228 | SHIPPED | VERIFIED | commit 48d7518 (backend); test tests/b228-export-finding-hole.test.mjs (backend) |
| B229 | SHIPPED | VERIFIED | commit 2b71475 (backend); test tests/b229-feedback-omit-empty-notes.test.mjs (backend) |
| B230 | SHIPPED | VERIFIED | commit 243c998 (backend); test tests/b230-revise-blank-finding-acknowledge.test.mjs (backend) |
| B240 | SHIPPED | VERIFIED | commit ddbebd4 (backend); tag b240-feedback-covering-note (backend); test tests/b226-constructive-feedback-piece.test.mjs (backend); report scripts/diagnostic/delivery-check/b240-check.mjs; report scripts/diagnostic/delivery-check/b240-report.md |
| B241 | SHIPPED | VERIFIED | commit 0995fe0 (backend); test tests/b241-clean-draft-dash.test.mjs (backend) |
| B242 | SHIPPED | VERIFIED | commit c846d84 (frontend); test tests/b242-feedback-loading-copy.test.mjs (frontend) |
| B244 | SHIPPED | VERIFIED | commit f22e96c (frontend); test tests/b244-replay-path.test.mjs (frontend) |
| B245 | SHIPPED | VERIFIED | commit 7302ece (frontend); commit 64cc94d (backend); tag b245-claims-e2e (backend/frontend); report scripts/diagnostic/delivery-check/b244-b245-report.md |
| B246 | SHIPPED | VERIFIED | commit 03f539d (frontend); commit 794736c (backend); test tests/b246-readiness-drift.test.mjs (backend/frontend) |
| B234 | SHIPPED | VERIFIED | commit 78d725c (frontend); commit ecbb7f2 (backend); report scripts/diagnostic/delivery-check/b233-b235-report.md |
| B235 | SHIPPED | VERIFIED | commit 7ff5716 (frontend); commit d877296 (backend) |
| B233 | SHIPPED | VERIFIED | commit 4d10005 (backend); commit 4b32e34 (backend) |
| B269 | SHIPPED | VERIFIED | commit b2e8c9c (backend); commit 4e5f7c2 (frontend); report docs/DOC_TRUTH_AUDIT.md; report docs/ARCHITECTURE.md |
| F24 | SHIPPED | VERIFIED | commit 33c83c6 (frontend); test tests/f24-not-checked-filter.test.mjs (frontend) |
| B164 | SHIPPED | VERIFIED | commit 75318f9 (backend); test tests/b164-ingestion-warning.test.mjs (backend) |
| B247 | SHIPPED | VERIFIED | commit 75318f9 (backend); test tests/b247-stored-verdict-honesty.test.mjs (backend) |
| B249 | SHIPPED | VERIFIED | commit 75318f9 (backend); test tests/b249-unchecked-sentences.test.mjs (backend) |
| B250 | SHIPPED | VERIFIED | commit 75318f9 (backend); test tests/b250-failed-match-not-supported.test.mjs (backend) |
| B251 | SHIPPED | VERIFIED | commit 75318f9 (backend); test tests/b259-unlocatable-excerpt.test.mjs (backend) |
| B259 | SHIPPED | VERIFIED | commit 75318f9 (backend); test tests/b259-unlocatable-excerpt.test.mjs (backend) |
| B274 | SHIPPED | VERIFIED | commit 33c83c6 (frontend); test tests/review-progress-estimate.test.mjs (frontend) |
| B277 | SHIPPED | VERIFIED | commit 8f15563 (backend); tag b277-b278-scheduler-and-wait (backend); test tests/b277-stage-schedule.test.mjs (backend); test tests/b277-preflight-guard.test.mjs (backend); report scripts/diagnostic/delivery-check/b277-scheduler-and-wait.md |
| B278 | SHIPPED | VERIFIED | commit 8f15563 (backend); tag b277-b278-scheduler-and-wait (backend); test tests/b278-rate-limit-wait.test.mjs (backend) |
| B279 | SHIPPED | VERIFIED | commit 6df12bd (frontend); tag b279-progress-count (frontend); test tests/review-progress-estimate.test.mjs (frontend) |
| B285 | SHIPPED | VERIFIED | commit 7cdb1c9 (backend); test tests/b278-rate-limit-wait.test.mjs (backend); report scripts/diagnostic/delivery-check/b285-shared-wait-regression.md |
| B286 | SHIPPED | VERIFIED | commit 7cdb1c9 (backend); test tests/b286-endpoint-budget.test.mjs (backend) |
| B287 | SHIPPED | VERIFIED | commit deda15a (frontend); test tests/review-progress-estimate.test.mjs (frontend) |
| B288 | SHIPPED | VERIFIED | commit deda15a (frontend); test tests/b288-b289-cancel-and-dead-buttons.test.mjs (frontend) |
| B289 | SHIPPED | VERIFIED | commit deda15a (frontend); test tests/b288-b289-cancel-and-dead-buttons.test.mjs (frontend) |
| B290 | SHIPPED | VERIFIED | commit f02323c (backend); commit 7ea2db9 (frontend); test tests/b290-capacity-wait.test.mjs (backend/frontend); report scripts/diagnostic/delivery-check/b290-what-hung.md |
| B291 | SHIPPED | VERIFIED | commit 3f08bd9 (backend); test tests/b291-refusal-recorded.test.mjs (backend) |
| B292 | SHIPPED | VERIFIED | commit 3f08bd9 (backend); test tests/b292-terminal-refusal.test.mjs (backend); report scripts/diagnostic/delivery-check/b291-why-no-capacity.md |
| B293 | SHIPPED | VERIFIED | commit aa1bff6 (frontend); test tests/b293-counter-honest.test.mjs (frontend) |
| B294 | SHIPPED | VERIFIED | commit 74e75c9 (backend); test tests/b294-not-requested.test.mjs (backend); report scripts/diagnostic/delivery-check/b294-card-colour.md |
| B295 | SHIPPED | VERIFIED | commit 74e75c9 (backend); test tests/b294-not-requested.test.mjs (backend); report scripts/diagnostic/delivery-check/b294-card-colour.md |
| B296 | SHIPPED | VERIFIED | commit 74e75c9 (backend); commit fe906d4 (frontend); test tests/b296-card-colour-grid.test.mjs (backend) |
| B297 | SHIPPED | VERIFIED | commit fe906d4 (frontend); test tests/b296-card-colour-retry.test.mjs (frontend) |
| B298 | SHIPPED | VERIFIED | commit 142e6f5 (frontend); commit 0d62c8f (backend); test tests/b298-turned-off-line.test.mjs (frontend); report scripts/diagnostic/delivery-check/b298-turned-off-and-reasons.md |
| B299 | SHIPPED | VERIFIED | commit 6bc97cf (backend); test tests/b299-absent-setting.test.mjs (backend) |
| B304 | SHIPPED | VERIFIED | commit 78df276 (backend); commit 1d3669a (frontend); test tests/b304-name-list.test.mjs (backend/frontend); report scripts/diagnostic/delivery-check/b298-turned-off-and-reasons.md |
| B303 | SHIPPED | VERIFIED | commit d128ac5 (frontend); test tests/b303-assessment-states.test.mjs (frontend) |
| B302 | SHIPPED | VERIFIED | commit 1d7e5b8 (backend); test tests/b301-assessment-states.test.mjs (backend); test tests/b302-absent-options-not-clean.test.mjs (backend) |
| B301 | KILLED | VERIFIED | commit 7095b03 (backend); test tests/b227-assessment-blank-finding.test.mjs (backend/frontend); report scripts/diagnostic/delivery-check/b301-assessment-empty.md |
| B300 | SHIPPED | VERIFIED | commit 6bc97cf (backend); test tests/b300-not-reviewed-reasons.test.mjs (backend) |
| B305 | SHIPPED | VERIFIED | this spec; report scripts/diagnostic/delivery-check/b305-doc-sync.md; commit is the B305 git commit |

59 rows. 59 VERIFIED. 0 WRONG after in-place correction.

### ROADMAP ids named as open (15 September paragraph)

| ID | ROADMAP said | Result | Evidence |
|----|--------------|--------|----------|
| B194 | Next open | CLOSED. SHIPPED 2026-09-17 | backend `ef66891` tag `b194-one-review-vocabulary`; frontend `21da610` same tag |
| B195 | Next open | CLOSED as MEASURED 2026-09-17 | commits `836cc4b`, `7de5e98` |
| B196 | Next open | SWEPT 2026-09-18. Launch RECORD | commit `4b1f530`; report `live-2026-09-18-b196-sweep.md` |
| B197 | Next open | ANSWERED 2026-09-18 | report `b208-b217-diagnosis.md`; misfires are B219 |
| B153 | Remains open and frozen | OPEN | BACKLOG Open work, frozen wording pass |
| B156 | Remains scoped, not built | OPEN LAUNCH | BACKLOG Open work |
| Pr16 | Remains | OPEN LAUNCH | BACKLOG Product |
| B158 | Remains | OPEN LAUNCH | BACKLOG Open work |
| B171 | Named in the order | OPEN LAUNCH | BACKLOG Open work |
| B172 | Named in the order | OPEN AFTER | BACKLOG Open work. Line on the existing finding shipped; row not closed |
| B151 / B152 | Implement Changes residuals | RECORD, not open work | Findings log. B151 deviation accepted. B152 replaced |
| B162 | Frozen corpus, do not re-run | RECORD constraint | Findings log; `scripts/diagnostic/accuracy/README.md` |

B173, B186, B187, B178, B180, B188-B193 were already described as shipped in that paragraph. Not re-opened.

---

## Part 2. Roadmap to 21 September

- Last updated: 2026-09-21.
- 15 September next-work paragraph kept in full, marked **Superseded 2026-09-21**.
- New **Position as of 2026-09-21**: TIER 1 OF THE REPAIR PLAN IS CLOSED. THE ACTIVE BLOCK IS INGESTION. B163 then B258.
- Leftover opens from the superseded paragraph listed: B153, B156, Pr16, B158, B171, B172, B151 / B152, B162.
- Launch plan: Decided 19 September 2026 (Ben): SOURCE TYPES ARE PROSE ONLY, with tables and fact sheets detected and marked not checked, never guessed at. HOSTED BY BEN, one deployment, not in a client's environment. Still pending: the first client and what they do with it; cost per review and price.
- B193 recently-shipped line no longer says B194 remains. It now says B194 shipped 2026-09-17.

---

## Part 3. Findings that only existed in reports

| ID | Table | Launch | Finding report | Notes |
|----|-------|--------|----------------|-------|
| B306 | 2. Backend / Pipeline | AFTER | B304 Part 4 | Endpoint accepts every check off. Modal refuses. API-only today. |
| B307 | 2. Backend / Pipeline | AFTER | B304 | `joinCheckNames` twice, no shared package. |
| B308 | 2. Backend / Pipeline | AFTER | B301 Q4 | Stage 5 miss can leave blank `evidenceSummary` / `reasoningParagraph`. Latent. |
| B309 | Findings log | RECORD | B277 Part D | 3700-word ceiling measured on a half-spent window. Floor on the ceiling. |
| B310 | 3. Process & governance | LAUNCH | B291 Q1 | Product API key cannot read usage or billing (403, `api.usage.read`). |
| B311 | 4. Product | AFTER | B291 | Operator billing failure looks like a product failure. Accounts work. |
| B264 | annotated, no new row | LAUNCH | B305 3.7 | B259 residue. 26 to 6. Six spanned B1 quotes remain. Needs real documents. |
| B251 | annotated, no new row | RECORD | B305 3.8 | "The matching passage could not be located in the named source." Same hole from the card. Remaining spanned quotes are B264. |
| B259 | annotated, no new row | RECORD | B305 3.7 | Cross-link: unlocatable quotes now show this hole. |

---

## Part 4. Standing rules earned this week

Added to the Standing rules table. Not scheduled.

- **P34.** A spec that changes a shared helper must enumerate every caller. Exhibit: B278. Already in `ai/AI_OPERATING_MANUAL.md`.
- **P35.** A spec that claims to fix an observed symptom must name the proving log line before the fix is written. Exhibit: B285.
- **P36.** A default that treats a missing answer as yes is a lie waiting to happen. Prefer `=== true`. Exhibit: B299, fifteen `!== false` occurrences.

---

## Part 5. Launch list regenerated

`npm run launch:summary` on 2026-09-21.

**Open LAUNCH rows: 19 total.**

| Table | Open LAUNCH |
|-------|-------------|
| 1. Frontend / UI | 0 |
| 2. Backend / Pipeline | 15 |
| 3. Process & governance | 2 |
| 4. Product | 1 |
| Parked | 1 |

Composition change from the stale 2026-09-19 summary (also 19, different rows): dropped shipped B164, B234, B235 and swept B196; picked up already-open B257, B258, B264; added B310 (spend visibility). Product remains Pr16. Parked remains Pr14.

Backend 15: B79, B89, B96, B100, B101, B124, B156, B158, B163, B165, B166, B171, B257, B258, B264.

Process 2: P6, B310.

---

## Part 6. Architecture and operating manual

### Changed

- `docs/ARCHITECTURE.md` header: as of 2026-09-21. Last-audit line names this B305 drift check.
- Stage 7: absent `reviewOptions` is `not_reviewed`, never `clean` (B302). Check-ran flag is `=== true`, never `!== false` (B299). `joinCheckNames` is the only joiner for turned-off and clean footer lists (B304).
- `ai/AI_OPERATING_MANUAL.md` audit date 2026-09-21.
- Change Surface Discipline labelled **P34**.
- Lessons list: **P34**, **P35**, **P36**.
- Cost fact: the 3700-word figure is a floor on the ceiling, measured on a half-spent token window (B309).

### Checked and correct

- Stage 2: throw or schema fail stamps `not_reviewed` (B250). Unlocatable matcher passage emptied, class kept (B251).
- Stage 5: miss is empty prose plus `commentaryNotReviewed: true`, not a canned finding (B254). Still true. The latent blank-finding consequence is filed as B308, not an architecture lie.
- Stage 6: concurrency from live TPM (B277). A 429 waits until it fits, inside remaining Function time minus remaining-work margin (B278). Hitting the bound is `not_reviewed` with reason `rate_limit_window`, never `clean`.
- Card: `cardTone` and `turnedOffLine` (B294, B296, B298). Off is `null` and does not vote on colour. Requested miss carries machine-readable reasons (B300).
- Pipeline facts in the operating manual: off checks stamp `not_reviewed` and `summaryClass` null (B247, B294); screen names them `Turned off for this run` below Clean (B298). Still true.
- Function cap 300 seconds (B263). Extraction timeout tracks it (B267).
- Backend is authoritative. Frontend does not re-derive evidence verdicts.
- `editorialVerdict: "not_reviewed"` means the check did not complete. Genuine clean note is the listed-rules sentence.

Skipped the browser. Documentation only. No layout, controls, or Review output changed.

---

## Dual summary

**Technical.** Governance docs brought to 2026-09-21. 59 SHIPPED/KILLED rows since 19 September verified against git and the filesystem; thin rows filled in place. ROADMAP next-work superseded; ingestion is the active block. Six new backlog rows (B306-B311), three standing rules (P34-P36), B264/B251/B259 annotated. LAUNCH_SUMMARY regenerated: 19 open LAUNCH rows. Architecture Stage 7 and the operating manual updated where the last three days had made them incomplete.

**Plain language.** The plan documents now describe the product as it is on 21 September. Nothing found in the last three days lives only inside a diagnostic report. The launch list is 19 items. This spec cost nothing.
