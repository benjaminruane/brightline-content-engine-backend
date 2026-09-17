# B195 category noise floor

Measured 2026-09-17. Local `vercel dev`, no product code changes. Never re-run for a cleaner result.

Cost source: Langfuse trace `totalCost` / `calculatedTotalCost` when the trace was readable after the HTTP response. 18 of 34 runs had no readable cost (Langfuse lag). Those are recorded as `costUsd: null`, not guessed.

## Scoreboard

### Part 0B Claude's design

| id | verdict | note |
| --- | --- | --- |
| D1 | AGREE | Production cache would hide Stage 1/1b/2 noise. A revised draft misses the cache, so Revise measurement needs uncached noise. |
| D2 | AGREE | Local health had `authoringOrganisation: null`. Added `AUTHORING_ORGANISATION` to backend Vercel Development (house name, not a secret). Frontend Development already had `VITE_REVISE_ACTION_LIST`; pulled `.env.development.local` (does not touch `.env.local`). |
| D3 | AGREE | Third fixture: **10** (`synth_public_press_release`). Single source, so no cross-source conflict by construction. Press-release / public, marketing language (`leading`), forward-looking `intends`. Observed: Conflicting 0 on all 10 runs. Editorial 0-1. Compliance 0 on all 10. It did not raise compliance notes. Recorded, not swapped. |
| D4 | AGREE | Sequential HTTP. Raw `/tmp/b195-server.log` not committed. Per-run log counts live on each run JSON. |
| D5 | AGREE | Control run as specified. Pin failed (see P2): local `vercel dev` logged the cache summary but never hit. |
| D6 | AGREE | Extracted from the analyse-statements body plus a byte-sliced server log. Cost from Langfuse when readable. |
| D7 | AGREE | Tables below. Cards matched by statement text. Split never moved. |
| D8 | AGREE | Written before the runs. Filled in below. No fixture produced a category range of 2 or more, so the 3-before / 3-after clause is not triggered. A delta equal to the range is still noise. |

### Part 0C 17 Sep reading

| id | verdict | evidence |
| --- | --- | --- |
| R1 | AGREE that the closing sentence is the same verdict as the badge. Removing the instruction does risk the paragraph drifting to a different verdict with nothing to anchor it. | 17 Sep assessment ends `This draft needs significant work.` (`live-2026-09-17-b194-f18-run.md`). `readinessFromCounts` in `lib/qc/review-summary.mjs`. The badge already prints `readiness`. |
| R2 | DISAGREE that the wording is therefore fine. Still a defect of precision, not the B193 forbidden-words error. | Prompt forbids `unsupported, unsubstantiated or lacking evidence`. 17 Sep used `not consistently supported by the sources` on conflict cards (`displayVerdict: conflict`). That is not the banned phrase. It still reads a disagreement as an evidence gap. `lack consensus among the evidence` is the better of the two. |
| R3 | AGREE Needs attention staying at 9 is correct under current code. | `governanceStatusFromEntry` (`sourceGovernance.js` L71-75) returns `dealt_with` only for `sources_agreed_kept` and `overridden` only for `sources_disagree_neither`. 17 Sep notes do not list per-card `explainCode`. 15 Sep and 17 Sep both show proposed replacements after choosing 18b, which is `use_other` in `applyDisagreementRuling` (`conflict-engagement.mjs` L989-993), not `sources_agreed_kept`. Accepting a proposed fix does **not** drop Needs attention: the filter reads only `governanceStatus` (`qcWorkbenchFilters.js` L34-37). Accept writes `actionDecisions` and Implement Changes rebuilds the draft; it does not set `dealt_with`. It should stay until the next Review of the new draft. |
| R4 | CONFIRMED | `classifySignal` (`lib/qc/review-summary.mjs` L37-43) maps anything unrecognised, including `null` (`String(null) === "null"`), to `"clean"`. `clearComplianceQcCard` sets `complianceVerdict` to `null` (`editorial-compliance-reviewer.mjs` L1527-1529). A failed compliance check therefore reads as clean. Backlog **B202**, not fixed here. |
| R5 | AGREE | 17 Sep `about 3 seconds` is the gap between response completion timestamps (`analyse-statements` 03:09:37Z, `synthesize-review` 03:09:40Z), not a stopwatch from the click. |
| R6 | Captures cannot tell. | 17 Sep table is `summaryClass.compliance`, all `clean`, `notChecked` 0. That is indistinguishable from `null` mapped to clean (R4). 15 Sep has no per-card `complianceVerdict`. Harness counted `complianceNullOn` separately; all B195 runs were 0. |

### C1 to C6

| id | result |
| --- | --- |
| C1 BLOCKING | CONFIRMED. `isLlmCacheEnabled` default true; `0`/`false`/`no`/`off` disables (`llm-cache.mjs` L278-283). Stages `stage1`, `stage1b`, `stage2` only (`STAGES` L24). In-memory Map per process (`createMemoryStore`). |
| C2 CHECK | CONFIRMED. Editorial/compliance call `callLLM` directly (`editorial-compliance-reviewer.mjs`). `withLlmCache` is Stage 1 only. Stage 1b/2 use `getLlmCache`/`putLlmCache` gated by `isLlmCacheEnabled`. |
| C3 CHECK | CONFIRMED. `logCacheRunSummary` is `console.log` only (`llm-cache.mjs` L431-439). Not on the API body. |
| C4 BLOCKING | CONFIRMED. `/api/health` returns `readEnvironmentSummary()` (`api/health.js` L40, `api/_lib/env-flags.js` L8-16). Local before the gate: `authoringOrganisation: null`, `ok: false`. Production: `Halden Group`, `ok: true`. |
| C5 CHECK | CONFIRMED. `scripts/diagnostic/fixtures/18_synth_cross_source_pair.json` (sources 18a/18b), `24_synth_peer_sources.json`. |
| C6 CHECK | CONFIRMED. Parse fail: `clearComplianceQcCard` at L2186, `complianceVerdict` null at L1529, warn `[EDITORIAL_COMPLIANCE_ERROR] compliance parse failed` at L2183. Editorial schema fail: `editorialVerdict: "not_reviewed"` at L1841, warn `[EDITORIAL_STYLE_REVIEW] schema validation failed after retry` at L1834. |

### Environment

Stopped Ben's usual backend (`node ... vc dev --listen 3000`, pid 82776) before starting the B195 server.

Variables added:

- Backend Vercel Development: `AUTHORING_ORGANISATION` (value is the production house name, not a secret).
- Frontend: none added. `VITE_REVISE_ACTION_LIST` was already on Development, Preview, Production. Pulled into frontend `.env.development.local` (does not touch `.env.local`).

Local vs production health after the add and restart:

| field | production | local |
| --- | --- | --- |
| pipelineRoute | v4 | v4 |
| authoringOrganisation | Halden Group | Halden Group |
| reviseActionList | true | true |

Frontend was not running, so the pill was not seen in a browser. Backend `environment.ok` is now true. A local frontend restarted against this backend, with the pulled `VITE_REVISE_ACTION_LIST`, should show a grey `v4` pill.

### Tests

`tests/category-noise-floor-score.test.mjs` failed first (`Cannot find module '.../score-category-noise-floor.mjs'`). After the scorer existed: 7 passed. Full `npx vitest run`: 78 files, 1164 tests.

Harness commit: `836cc4b` `chore(diag): category noise-floor harness (B195)`.

### Pilot

Fixture 18, 1 run, label `pilot`. HTTP 200. 10 statements. Wall 20773 ms. Cost USD 0.2211 (Langfuse). D6 fields present. Log counts zero (cache off, no schema failures). COST GATE 1: 0.2211 x 32 = 7.08, under USD 25.

## D7 tables (cache-off, 10 runs each)

Statement split never changed on any fixture.

### Fixture 18 (10 statements)

| category | min | max | range |
| --- | --- | --- | --- |
| All | 10 | 10 | 0 |
| Confirmed | 1 | 2 | 1 |
| Partial | 1 | 2 | 1 |
| Conflicting | 7 | 7 | 0 |
| No support | 0 | 0 | 0 |
| Editorial | 5 | 5 | 0 |
| Compliance | 0 | 0 | 0 |
| Not checked | 0 | 0 | 0 |
| compliance null with compliance on | 0 | 0 | 0 |
| Needs attention | 8 | 9 | 1 |
| readiness label | Needs significant work | Needs significant work | 0 |

Flipped cards (matched by statement text):

- Investment-thesis sentence: `displayVerdict` supported_full (runs 1-2) -> supported_partial (run 3) -> supported_full (runs 4-10).
- ARR 38 million sentence: `editorialVerdict` clean except run 8 concern.
- In-summary sentence: `editorialVerdict` concern except run 8 clean; `needsAttention` true except run 8 false. Editorial **count** stayed 5 because the ARR card picked up the concern the summary card dropped.

### Fixture 24 (7 statements)

| category | min | max | range |
| --- | --- | --- | --- |
| All | 7 | 7 | 0 |
| Confirmed | 2 | 2 | 0 |
| Partial | 1 | 2 | 1 |
| Conflicting | 3 | 4 | 1 |
| No support | 0 | 0 | 0 |
| Editorial | 3 | 3 | 0 |
| Compliance | 0 | 0 | 0 |
| Not checked | 0 | 0 | 0 |
| compliance null with compliance on | 0 | 0 | 0 |
| Needs attention | 5 | 6 | 1 |
| readiness label | Needs significant work | Needs significant work | 0 |

Flipped cards:

- Opening Ostara sentence: `displayVerdict` conflict on every run except run 8 (`supported_partial`). `needsAttention` followed that (true except run 8 false).

### Fixture 10 (7 statements)

| category | min | max | range |
| --- | --- | --- | --- |
| All | 7 | 7 | 0 |
| Confirmed | 7 | 7 | 0 |
| Partial | 0 | 0 | 0 |
| Conflicting | 0 | 0 | 0 |
| No support | 0 | 0 | 0 |
| Editorial | 0 | 1 | 1 |
| Compliance | 0 | 0 | 0 |
| Not checked | 0 | 0 | 0 |
| compliance null with compliance on | 0 | 0 | 0 |
| Needs attention | 0 | 1 | 1 |
| readiness label | Ready / Minor points to address | (two labels) | 1 |

Flipped cards:

- Opening Meridian / Lumen sentence: `editorialVerdict` oscillated clean/concern on runs 4, 6, 8 (concern) vs the others (clean). Needs attention and readiness (`Ready` vs `Minor points to address`) followed that one card.

Compliance never fired on this fixture.

## D5 control (fixture 18, QC_LLM_CACHE=1, 3 runs)

Cache summary **did** log (so the flag was on): 35 misses, 0 hits, every run, including 2 and 3. Stage 1 0/1, Stage 1b 0/4, Stage 2 0/30. Evidence classes did **not** match run 1 (Confirmed 1,2,2). Local `vercel dev` appears not to keep the process-local Map across HTTP requests. P2 FAIL. Not re-run.

## Pins

| pin | result |
| --- | --- |
| P1 every cache-off run logs zero cache hits | PASS (30/30, and no cache summary line) |
| P2 cache-on runs 2 and 3 log hits above zero and match run 1 evidence | FAIL (hits 0/0/0; evidence Confirmed 1 vs 2 vs 2) |
| P3 every editorialVerdict not_reviewed coincides with a logged editorial schema failure | PASS (vacuous: no `not_reviewed` on any run) |
| P4 every null complianceVerdict (compliance on) coincides with a logged compliance parse failure | PASS (vacuous: no null complianceVerdict on any run) |

## Cost and time

COST GATE 2 not hit.

| slice | runs | Langfuse-readable cost USD | runs with no cost | wall ms |
| --- | --- | --- | --- | --- |
| pilot 18 | 1 | 0.2211 | 0 | 20773 |
| cache-off 18 | 10 | 3.6337 | 1 | 183610 |
| cache-off 24 | 10 | 0.4911 | 9 | 106320 |
| cache-off 10 | 10 | 0.1964 | 8 | 113431 |
| cache-on 18 | 3 | 0.7460 | 0 | 49820 |
| **total** | **34** | **5.2882** | **18** | **473954 (7.90 min of request time)** |

The USD 5.29 figure is an undercount. 18 traces were not readable in the 1.5 s window. Not backfilled by re-running.

## D8 rule, numbers filled in

A before-and-after change in a category counts as real only if it is larger than that category's range on that fixture.

Fixture 18 (10 statements): All 0, Confirmed 1, Partial 1, Conflicting 0, No support 0, Editorial 0, Compliance 0, Not checked 0, compliance-null 0, Needs attention 1, readiness 0.

No category range is 2 or more, so the written 3-before / 3-after clause does not fire. A Confirmed or Needs-attention move of 1 on fixture 18 is still inside the floor and must not be reported as Revise improving the draft.

View of the rule: keep it. Equal-to-range is not real. Editorial on fixture 18 had range 0 on the **count** while named cards still swapped concerns with each other, so even a stable count can hide card-level noise. For Revise, prefer named-card matching plus the count rule.

## SHIP

Harness: `836cc4b` (this file's run artefacts land on the follow-up docs commit).
