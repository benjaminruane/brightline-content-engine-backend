# Backend code census

Read-only. No deletions. No model calls. Counts from `node scripts/diagnostic/backend-census.mjs` on this commit.

## Section 6 headline

The 94,000-line "app" figure is the wrong unit. It mixed Production code with `scripts/diagnostic` harnesses. Split correctly:

```
LIVE Production code (api + reachable lib, current deploy):  26,254 lines
FLAG OFF (would run only if a Production flag flipped):       2,023 lines
ORPHAN (not reachable from product APIs, scripts, or tests): 17,429 lines
DIAGNOSTIC (scripts/ + tests/ code):                         65,563 lines
api+lib+helpers+utils including orphans (old "app" without scripts): 46,766
```

The hypothesis that a large share of the 94,000 is superseded pipeline-v3 / flag-off v4 paths is **false at that scale**. pipeline-v3 except the live assembler is **1,060 lines**. Coverage union plus per-statement revision is another **963 lines**. What *is* true: there is a real **~17k orphan island** of pre-v4 QC (`canonicalClaims`, `analyse-statements-helpers`, the P3/P4/P5 `.cjs` builders, unused evidence-* modules), counted twice in places because `api/_lib` duplicates `lib`. The other large pile is **tracked diagnostic JSON** (169,290 lines, 8.0 MB), not code.

94,000 is not the right size for this product. About **26k of live backend code** for Review, Suggest, and the still-shipped Draft/Assess writing routes is plausible. The tree is oversized because of orphans, duplicates, and committed diagnostic dumps, not because v4 secretly contains a second full pipeline.

What I would delete first is in Section 6 at the end. Evidence that must leave the tree first is listed there.

---

## Part 0: what this census would mislead

### a. Directory line counts

Line count by top-level directory is a poor unit here. `scripts/` is 242,613 raw lines, almost all `scripts/diagnostic`, and most of that is JSON. `lib/` is 35,995 and mixes live v4, live Suggest, flag-off v3, and dead pre-v4 QC in one folder. `lib/qc/` (16,423) is the only second-level number that roughly tracks "the Review engine", and even that folder still holds orphans (`llm-claim-extraction.mjs`, `commentary-builder.mjs`, `evidence-authority.mjs`) and flag-off files (`coverage-union.mjs`, `pipeline-v3/` stages).

Better unit, and the one used in Section 2: **file, classified by execution reachability from Production API entrypoints, with flag cuts applied**. Directory totals stay in Section 1 because the spec asked for them. Do not treat Section 1 as the live-versus-dead answer.

A second unit that matters for slope: **api+lib+helpers+utils code only** (46,766). That is what a naive "app lines" count should have been. The earlier 93,977 included diagnostic `.mjs` files.

### b. Static import-graph reachability

Not trustworthy without overlays. Mechanisms that would make an "unreachable" module a false positive, or a "reachable" module a false live:

1. **Eager dual import, runtime branch.** `api/analyse-statements.js` statically imports both `runPipelineV3` and `runPipelineV4`. Vercel loads v3 on every Review request. This census still classifies v3 stages as FLAG OFF because they are not *executed* when `QC_PIPELINE_V4=1`. If you used a naive import graph, all of v3 would look LIVE.

2. **Request-body flag, not env.** `runStage1` is imported by `api/suggest-revision.js` and runs only when `body.perStatementRevise === true`. The frontend never sends that field. Static graph says LIVE. Execution says FLAG OFF.

3. **Hardcoded `enabled: false`, function still called.** `applyDeterministicUnsupportedRemoval` is imported and invoked on every Suggest finalize. The body returns immediately when `opts.enabled !== true`. File class LIVE. Mechanism FLAG OFF. Same pattern as `rollupClaimVerdicts` (`upgrade = false` inside a function that still runs).

4. **`readFile` of prompt paths.** Stage prompts are not ESM imports. They are `path.join(__dirname, "prompts", ...)`. A pure import graph marks them ORPHAN. The harness force-marks the five prompts the live stages actually read. `stage5_v1.md` and `stage2_v4_multipassage_shadow.md` stay unused.

5. **`vercel.json` `includeFiles`: `{node_modules/**,lib/**,tests/**}`.** Every function bundle includes all of `lib/` and `tests/`, including orphans. Bundle membership is not reachability. Orphans still inflate deploy size.

6. **No string-keyed module registry** was found for pipeline selection. Route selection is the `QC_PIPELINE_V4 === "1"` boolean plus `options.pipelineRoute === "v4"`. `BRIGHTLINE_QC_V3=1` is set in Production and has **no reader in JS**. Dead env, not a dispatcher.

### c. What this census gets wrong about v3 / v4

It will look like v3 is "in Production" because the handler imports it and because `stage7-assemble-card.mjs` lives under `pipeline-v3/` and *is* live. The assembler is shared. Stages 1 to 5 under `pipeline-v3/` are the fallback route. Architecture still says unset `QC_PIPELINE_V4` falls back to v3. Production has `QC_PIPELINE_V4=1`. Frontend Review payloads can also send `pipelineRoute: "v4"`; the handler ORs those two.

It will under-count v4 Stage 2 if you only look at `stage2-match-sources.mjs`. The live path also runs `stage2-match-multipassage.mjs` (widened support spans) and, with `QC_STAGE2_SPAN=1` in Production, the span-elicit prompt. Default in code for that flag is OFF. Production overrides it ON. A census that trusted the code default would mark span elicit FLAG OFF. That would be wrong on this deploy.

It will over-state "decomposition is off" if it only reads the upgrade disable. Stage 1b and per-claim Stage 2 matching still run (`QC_CLAIM_SPANS` default ON, unset in Production). The upgrade does not change the Review verdict. The claim rows still land on the qcCard and Suggest reads them.

---

## Section 1: where the lines are

Git-tracked text files only. `node_modules`, lockfile, binaries excluded. Raw = physical lines. nonblank = raw minus empty. noncomment_nonblank = JS comments stripped, then empty dropped (markdown/JSON: same as nonblank).

### 1.1 top-level directories

```
scripts                      files= 389  raw= 242,613  nonblank= 232,881  noncomment_nonblank= 230,984
lib                          files= 110  raw=  35,995  nonblank=  32,391  noncomment_nonblank=  28,002
tests                        files=  73  raw=  15,212  nonblank=  13,729  noncomment_nonblank=  13,549
api                          files=  27  raw=   9,425  nonblank=   8,297  noncomment_nonblank=   7,370
docs                         files=  18  raw=   4,526  nonblank=   3,171  noncomment_nonblank=   3,171
scratch                      files=   2  raw=   1,559  nonblank=   1,379  noncomment_nonblank=   1,337
init-audit.json              files=   1  raw=   1,073  nonblank=   1,073  noncomment_nonblank=   1,073
tools                        files=   4  raw=     439  nonblank=     376  noncomment_nonblank=     367
logs                         files=  23  raw=     424  nonblank=     292  noncomment_nonblank=     292
ai                           files=   2  raw=     293  nonblank=     200  noncomment_nonblank=     200
helpers                      files=   4  raw=     169  nonblank=     143  noncomment_nonblank=     123
utils                        files=   1  raw=      89  nonblank=      74  noncomment_nonblank=      49
db                           files=   2  raw=      23  nonblank=      19  noncomment_nonblank=      19
```

### 1.1 lib/ second level (largest)

```
lib/qc                                            53 files   16,423 raw
lib/canonicalClaims.js                             1 file     3,443 raw
lib/analyse-statements-helpers.cjs                 1 file     2,264 raw
lib/build-revision-prompt.mjs                      1 file     1,144 raw
lib/pr9-deterministic-unsupported-removal.mjs      1 file     1,025 raw
lib/prompt-library                                 6 files      930 raw
lib/corpusSearch.js                                1 file       903 raw
lib/pr9-marker-honesty.mjs                         1 file       733 raw
lib/extract-text-from-source.mjs                   1 file       720 raw
```

### 1.1 scripts/ second level

```
scripts/diagnostic           files= 386  raw= 241,688
scripts/run_qc_regression.mjs files=   1  raw=     572
scripts/regen-mvp-summary.mjs files=   1  raw=     296
scripts/db                   files=   1  raw=      57
```

### 1.1 the split the 94k hid

```
api+lib+helpers+utils code     139 files   46,766 raw
scripts/ code                  115 files   49,899 raw
tests/ code                     44 files   13,570 raw
```

### 1.2 thirty largest tracked text files

Reachable here means execution-reachable from a product API on the current deploy (same rules as Section 2). JSON dumps are DIAGNOSTIC even when a live module later reads them as fixtures.

```
 1. 18,659  DIAGNOSTIC  scripts/diagnostic/eval-ablation/r10-corpus-blast-rows.json
    Current Stage 2 reference blast (R10). Not executed in Production.

 2. 17,097  DIAGNOSTIC  scripts/diagnostic/eval-ablation/r3a-corpus-blast-rows.json
    Prior Stage 2 blast (R3a). Stale vs R10 for Stage 2. Not Production.

 3.  9,573  DIAGNOSTIC  scripts/diagnostic/coverage-union/rows.json
    Coverage-union measure dump. Flag off in Production.

 4.  9,190  DIAGNOSTIC  scripts/diagnostic/stage2-span/rows.json
    B88 span gate dump. Harness output, not the live matcher.

 5.  8,366  DIAGNOSTIC  scripts/diagnostic/eval-ablation/rewrite-ladder-rows.json
    Prompt-ablation ladder rows. Pre-R10 Stage 2 evidence.

 6.  7,616  DIAGNOSTIC  scripts/diagnostic/backstop-needed/corpus.json
    Backstop diagnostic corpus dump.

 7.  7,506  DIAGNOSTIC  scripts/diagnostic/coverage-union/gate-rows.json
    Coverage-union gate dump.

 8.  6,552  DIAGNOSTIC  scripts/diagnostic/eval-ablation/r10-scoped-basis-gate-rows.json
    R10 scoped-basis gate rows.

 9.  6,506  DIAGNOSTIC  scripts/diagnostic/eval-ablation/frame-rule-head-to-head-rows.json
    Frame-rule ablation rows. Stage 2 history.

10.  6,435  DIAGNOSTIC  scripts/diagnostic/eval-ablation/r7-r8-basis-ladder-rows.json
    R7/R8 basis ladder. Superseded by R10 for Stage 2.

11.  4,492  DIAGNOSTIC  scripts/diagnostic/eval-ablation/r4-conflict-hardening-rows.json
    R4 conflict-hardening rows. Stage 2 history.

12.  4,454  DIAGNOSTIC  scripts/diagnostic/eval-ablation/r9-basis-conflict-rows.json
    R9 basis-conflict rows. Pre-R10.

13.  4,281  DIAGNOSTIC  scripts/diagnostic/eval-ablation/seven-site-deletion-rows.json
    Prompt-deletion ablation.

14.  3,956  DIAGNOSTIC  scripts/diagnostic/eval-ablation/r5-mark-rule-rows.json
    R5 mark-rule rows. Pre-R10.

15.  3,836  DIAGNOSTIC  scripts/diagnostic/revise/bundled-notes-rows.json
    Suggest diagnostic. Not Production.

16.  3,812  DIAGNOSTIC  scripts/diagnostic/evidence-span-population/rows.json
    Evidence-span population dump.

17.  3,443  ORPHAN  api/_lib/canonicalClaims.js
    Byte-copy of lib/canonicalClaims.js. No importer. Pre-v4 canonical layer.

18.  3,443  ORPHAN  lib/canonicalClaims.js
    Same module in lib/. No importer from api, scripts, or tests.

19.  2,875  DIAGNOSTIC  scripts/diagnostic/span-wired/rows.json
    B88 wire gate dump.

20.  2,728  DIAGNOSTIC  scripts/diagnostic/eval-ablation/arm-d-examples-removed-rows.json
    Ablation arm D rows.

21.  2,342  LIVE  lib/qc/editorial-compliance-reviewer.mjs
    Stage 6 Editorial+Style and Compliance. Reachable from analyse-statements via v4.

22.  2,271  DIAGNOSTIC  scripts/diagnostic/stage2-span/adjudication.md
    Human adjudication notes for the span dump.

23.  2,264  ORPHAN  lib/analyse-statements-helpers.cjs
    Pre-v4 statement-analysis helpers. No importer.

24.  2,148  DIAGNOSTIC  scripts/diagnostic/eval-ablation/noise-floor-rows.json
    Stage 2 noise-floor dump.

25.  1,657  DIAGNOSTIC  scripts/diagnostic/eval-ablation/passage-correspondence-baseline.json
    Passage-correspondence baseline.

26.  1,646  LIVE  lib/qc/pipeline-v4/stage2-match-sources.mjs
    Live Stage 2 matcher. Reachable from analyse-statements via v4.

27.  1,641  DIAGNOSTIC  scripts/diagnostic/eval-ablation/passage-selection-probe-rows.json
    Passage-selection probe.

28.  1,537  DIAGNOSTIC  scripts/diagnostic/eval-ablation/r10-production-verify.json
    R10 production-verify dump.

29.  1,517  DIAGNOSTIC  scripts/diagnostic/revise/register-and-craft.json
    Suggest register/craft diagnostic.

30.  1,465  DIAGNOSTIC  scripts/diagnostic/revise/stage1-under-the-principle.json
    Per-statement revision diagnostic. Path is flag off in Production.
```

### 1.3 files over 2,000 lines

Twenty-four files. Twenty-one are diagnostic JSON or md. Three are code:

```
2,342  LIVE    lib/qc/editorial-compliance-reviewer.mjs
3,443  ORPHAN  lib/canonicalClaims.js
3,443  ORPHAN  api/_lib/canonicalClaims.js   (duplicate)
2,264  ORPHAN  lib/analyse-statements-helpers.cjs
```

No live pipeline-v4 stage file exceeds 2,000 except editorial-compliance-reviewer (Stage 6). Stage 2 matcher is 1,646.

### 1.4 handwritten versus generated versus vendored

Rule used:

```
generated  = diagnostic runner output identified by path:
             scripts/diagnostic/**/*rows.json
             scripts/diagnostic/**/corpus.json
             scripts/diagnostic/eval-ablation/*.json (except package.json, none)
             scripts/diagnostic/coverage-union/*.json
             scripts/diagnostic/stage2-span/*.json
             scripts/diagnostic/span-*/*.json
             scripts/diagnostic/evidence-span-population/*.json
             init-audit.json
             tests/r1_2*outputs*
             any tracked .log
handwritten = everything else git-tracked and counted
vendored    = none. No third-party source trees in git. node_modules is gitignored.
```

```
handwritten  files=612  raw=165,140
generated    files= 60  raw=147,367
vendored     files=  0  raw=      0
```

Caveat: `scripts/diagnostic/fixtures/*.json` is handwritten corpus, not generated, and is excluded from the generated rule. Some eval-ablation `.md` reports are handwritten commentary sitting next to generated JSON; they count as handwritten.

---

## Section 2: live versus not live

### How reachability was resolved

1. Product entrypoints: every `api/*.js` the frontend calls (listed below). Debug `api/*test*` routes are deployed and counted LIVE as HTTP handlers; they add almost no unique lib.
2. Build a static+dynamic import graph (`from`, `import()`, `require`, `path.join` prompt filenames).
3. LIVE BFS from product entrypoints **without** following three cuts (current Production values):
   - `qc-pipeline-v3.mjs` because `QC_PIPELINE_V4=1`
   - `revise-stage1.mjs` because `perStatementRevise` is not sent
   - `coverage-union.mjs` because `QC_MULTISOURCE_COVERAGE` is unset (default OFF)
4. FLAG_OFF BFS from those three roots, minus anything already LIVE (shared deps such as `observability.js` stay LIVE).
5. Paths under `scripts/`, `tests/`, `tools/`, `fixtures/`, `scratch/` are DIAGNOSTIC even if they import live modules.
6. Remaining code files (and unused prompts) are ORPHAN.
7. Five live `readFile` prompts are force-marked LIVE. See Part 0.b.4.

Production env values read from Vercel Production (names and non-secret flags only):

```
QC_PIPELINE_V4=1
QC_STAGE2_SPAN=1
QC_CLAIM_SPANS          unset  (code default ON)
QC_MULTISOURCE_COVERAGE unset  (code default OFF)
QC_LLM_CACHE            unset  (code default ON)
BRIGHTLINE_EDITORIAL_REVIEW=1
QC_LLM_CLAIM_EXTRACTION=true   (module has no importer)
BRIGHTLINE_QC_V3=1             (no JS reader)
```

### Product entrypoints

```
api/analyse-statements.js
api/suggest-revision.js
api/generate.js
api/adapt.js
api/rewrite.js
api/extract-draft-text.js
api/summarize-source.js
api/summarize-rewrite-label.js
api/synthesize-review.js
api/constructive-feedback.js
api/export.js
api/review-state.js
api/health.js
api/query.js
api/query-sources.js
api/web-search.js
api/fetch-url.js
api/summarize-source-usage.js
```

Debug, still deployed: `debug-node`, `web-test`, `stacktrace-test`, `import-openai-test`, `import-web-helper-test`, `generate-minimal`.

### Class totals (code + live pipeline prompts)

```
LIVE        files= 90  raw= 26,254  ncn= 21,021
FLAG_OFF    files=  9  raw=  2,023  ncn=  1,595
DIAGNOSTIC  files=168  raw= 65,563  ncn= 58,012
ORPHAN      files= 45  raw= 17,429  ncn= 12,951
```

FLAG OFF files (complete):

```
569  lib/revise-stage1.mjs                         perStatementRevise, frontend never sends
360  lib/qc/pipeline-v3/stage2-match-sources.mjs   QC_PIPELINE_V4=1
255  lib/qc/pipeline-v3/stage1-extract-statements.mjs
224  lib/qc/coverage-union.mjs                     QC_MULTISOURCE_COVERAGE unset
176  lib/qc/pipeline-v3/stage5-generate-commentary.mjs
170  lib/revise-stage1-prompt.mjs
135  lib/qc/pipeline-v3/qc-pipeline-v3.mjs
 85  lib/qc/pipeline-v3/stage4-select-excerpts.mjs
 49  lib/qc/pipeline-v3/stage3-aggregate-verdict.mjs
```

Largest ORPHAN code (not the full list; harness prints all):

```
3,443  api/_lib/canonicalClaims.js          duplicate of lib/
3,443  lib/canonicalClaims.js
2,264  lib/analyse-statements-helpers.cjs
  903  api/_lib/corpusSearch.js             duplicate of lib/
  903  lib/corpusSearch.js
  515  lib/qc/evidence-authority.mjs
  454  lib/build-source-intelligence.cjs
  381  lib/qc/evidence-relationship.mjs
  374  lib/build-suggest-items.cjs
  364  lib/qc/llm-claim-extraction.mjs      env QC_LLM_CLAIM_EXTRACTION is set, unused
  287  lib/qc/commentary-builder.mjs        pre-v4 commentary path
  117  api/_lib/web.js                      duplicate of lib/web.js
```

`lib/pr9-deterministic-unsupported-removal.mjs` (1,025) is **LIVE as a file** (imported, called, helper `findStatementTextInDraft` used by live note-what-from-diff). The removal *mechanism* is off. See 3b.

`lib/qc/claim-spans.mjs` (558) is **LIVE**. Upgrade is disabled inside it. See 3e.

---

## Section 3: known superseded paths

Every claim is CONFIRMED with file:line, or HYPOTHESIS.

### 3a. pipeline-v3 in full

```
all pipeline-v3                 7 files   1,875 raw
live (stage7-assemble-card)     1 file      815 raw   LIVE
flag-off rest                   6 files   1,060 raw   FLAG_OFF
```

**CONFIRMED** Production selects v4: `api/analyse-statements.js:244-263` (`QC_PIPELINE_V4 === "1"` OR `pipelineRoute === "v4"`). Production env `QC_PIPELINE_V4=1`.

**CONFIRMED** stage7 is live from v4: `lib/qc/pipeline-v4/index.mjs:12` imports `assembleCard` from `../pipeline-v3/stage7-assemble-card.mjs`.

Remaining importers of `qc-pipeline-v3.mjs`: only `api/analyse-statements.js`. Remaining importers of stage7: v3 runner, v4 runner, plus tests and diagnostic gates.

If the six FLAG_OFF v3 files were deleted: Review would break only if `QC_PIPELINE_V4` were unset *and* the client omitted `pipelineRoute: "v4"`. Current Production would keep working. `run_qc_regression.mjs` still has a v3 route (`USE_V4_ROUTE`); that suite would need the env kept at v4. Do not delete stage7 with them.

### 3b. deterministic removal (described as retired)

File: `lib/pr9-deterministic-unsupported-removal.mjs` (1,025). Class: **LIVE file, FLAG OFF mechanism**.

**CONFIRMED** Production hardcodes off: `api/suggest-revision.js:64` and `:149` `deterministicUnsupportedRemoval: false`. Comment at `:60-63` says the module stays on disk until stage 1 is proven.

**CONFIRMED** the function no-ops when disabled: `lib/pr9-deterministic-unsupported-removal.mjs:643-651` (`if (!enabled) return ...`).

**CONFIRMED** it is still invoked: `lib/build-revision-prompt.mjs:989-990`.

Importers of the file: `build-revision-prompt.mjs`, `pr9-note-what-from-diff.mjs` (uses `findStatementTextInDraft`), tests, two diagnostic scripts.

If deleted whole: live Suggest would break because `findStatementTextInDraft` and the always-called apply wrapper would vanish. If only the removal body (lines after the enabled guard) were deleted, Production behaviour would not change. That is a later spec, not this pass.

### 3c. per-statement revision rebuild (built, switched off)

Files: `lib/revise-stage1.mjs` (569) + `lib/revise-stage1-prompt.mjs` (170). Class: **FLAG OFF**.

**CONFIRMED** gated on request body: `api/suggest-revision.js:176` `if (body.perStatementRevise === true)`.

**CONFIRMED** frontend never sends it: grep of the frontend repo for `perStatementRevise` is empty. `apiSuggestRevision` posts the payload it is given; Assess/Draft UI does not set the field.

Importers: `api/suggest-revision.js` (import only), three diagnostic scripts, two tests.

If deleted: Production Suggest would keep working after dropping the unused import. Diagnostics `stage1-measure`, `stage1-under-the-principle`, `author-statements` would break. Move those reports out first if the measurements still matter.

### 3d. coverage union (built, off, unexercised)

File: `lib/qc/coverage-union.mjs` (224). Class: **FLAG OFF**.

**CONFIRMED** default OFF: `lib/qc/coverage-union.mjs:10-16` requires `QC_STAGE2_SPAN` on *and* `QC_MULTISOURCE_COVERAGE` in `{1,true,yes,on}`. Production has span ON and coverage unset.

**CONFIRMED** v4 only calls it inside the flag: `lib/qc/pipeline-v4/index.mjs:479-486`.

Importers: `pipeline-v4/index.mjs`, `scripts/diagnostic/coverage-union/{gate,measure}.mjs`, `tests/coverage-union.test.mjs`.

If deleted: Production Review unchanged. Delete the test and the two diagnostic scripts/JSON with it, or they fail. ROADMAP already records UNEXERCISED (`docs/ROADMAP.md` coverage-union paragraph; `docs/BACKLOG.md` coverage-union closed row).

### 3e. claim upgrade (disabled)

File: `lib/qc/claim-spans.mjs` function `rollupClaimVerdicts`. Class: **LIVE file, mechanism hardcoded off** (not an env flag).

**CONFIRMED** `lib/qc/claim-spans.mjs:507-549` comment `DISABLED 2026-08-25 (review-upgrade-off)` and `const upgrade = false` then `claimUpgrade: false`, `verdict: vToday`.

**CONFIRMED** v4 still calls it: `lib/qc/pipeline-v4/index.mjs:461-472`. The `if (rolled.claimUpgrade)` branch is dead.

**CONFIRMED** tests encode the disable: `tests/claim-spans.test.mjs:212-217` "does not upgrade even when all four conditions hold". That test *can* fail if someone turns upgrade back on. Not a fake.

If the upgrade code (conditions a-d, the dead if) were deleted: Production verdicts unchanged. Suggest still needs `claims[]` on the card. Do not delete `claim-spans.mjs` or Stage 1b with the upgrade.

### 3f. decomposition, retained for spans only

**CONFIRMED** Stage 1b still runs when the flag is on (default ON): `lib/qc/pipeline-v4/index.mjs:249-287` `extractClaimSpans` then `matchClaimSourcePairs`. Production does not set `QC_CLAIM_SPANS`, so this is live cost (extra Stage 2 calls on decomposed sentences).

**CONFIRMED** claim rows are stamped on the qcCard: `lib/qc/pipeline-v3/stage7-assemble-card.mjs:802-805`.

**CONFIRMED** Suggest reads them: `lib/build-revision-prompt.mjs:508-548` `extractDecomposedClaims`; `lib/revise-author-statement.mjs:93-108` prefers claim-level unsupported text over `unsupportedSpans`.

So "spans only" is true for **Review verdicts**. It is false that decomposition is idle. It still spends Stage 2 and still feeds Suggest. B104 in BACKLOG matches this.

Frontend does not read `decomposed` / `claims` (grep in `src/` empty). **CONFIRMED** the UI does not display them; Suggest does.

### 3g. other parallel implementations found

Not on the original list. Looked; the list was incomplete.

```
v3/v4 duplicate stages 1-5     FLAG_OFF / LIVE pair, counted in 3a and 3g harness
lib/extract-statements.mjs     LIVE deterministic Stage 1 fallback (v4 stage1 imports it)
stage5_v1.md vs stage5_v2.md   v4 stage5 reads v2 (LIVE). v1 is ORPHAN (47 lines)
stage2_v4_multipassage.md      LIVE widened matcher prompt
stage2_v4_multipassage_shadow.md  ORPHAN; only scripts/diagnostic/r7-stage2-shadow.mjs
lib/qc/commentary-builder.mjs  ORPHAN (287). Replaced by v4 stage5-generate-commentary
lib/qc/llm-claim-extraction.mjs + llm-claim-verifier.mjs + claim-validation.mjs
                               ORPHAN. Pre-v4 claim LLM. Env QC_LLM_CLAIM_EXTRACTION is set and unused.
lib/qc/evidence-authority.mjs and evidence-relationship, evidence-relevance,
targeted-excerpt, binding-directness, citation-authority
                               ORPHAN cluster. Pre-v4 evidence stack. Architecture section 6
                               listed these mechanisms as removed.
api/_lib/{canonicalClaims,corpusSearch,web}.js
                               ORPHAN duplicates of lib/ copies. No importer of api/_lib.
P3/P4/P5 lib/build-*.cjs       ORPHAN. Old scoring/suggest builders. No require/import.
```

**CONFIRMED** no importer of `lib/canonicalClaims.js` or `api/_lib/canonicalClaims.js` in js/mjs/cjs.

**CONFIRMED** v4 stage5 prompt path is v2: `lib/qc/pipeline-v4/stage5-generate-commentary.mjs:10`.

---

## Section 4: tests

### 4.1 test lines to app lines, per lib/ second level

Harness attribute: a test's full line count is charged to every `lib/` module it imports, so ratios overstate shared tests. Useful as "has any test" / "heavily tested", not as coverage percent.

```
lib/qc                              app=15,924  test_ref=5,029  test/app=0.316
lib/build-revision-prompt.mjs       app= 1,144  test_ref=4,570  test/app=3.995
lib/canonicalClaims.js              app= 3,443  test_ref=    0  test/app=0.000
lib/analyse-statements-helpers.cjs  app= 2,264  test_ref=    0  test/app=0.000
lib/pr9-* (honesty, removal, notes) app= several  test_ref high (Suggest is tested)
all lib/build-*.cjs                 app= 2,000+ test_ref=    0
lib/corpusSearch.js                 app=   903  test_ref=    0
```

Orphan pre-v4 QC has no tests. Live Suggest has many. Live `lib/qc` as a bucket is 0.32 because Stage 6 and Stage 2 are large and only partly directly imported by tests.

### 4.2 pipeline-v4 stages with no direct test

Direct = a file under `tests/` imports that stage module.

```
stage1-extract-statements.mjs     445  (none)
stage1b-extract-claim-spans.mjs   330  (none)  claim-spans.test.mjs tests claim-spans.mjs, not 1b
stage2-match-sources.mjs        1,646  tests/stage2-b48-calibration.test.mjs
                                       tests/stage2-unsupported-span.test.mjs
                                       tests/supersession.test.mjs (collectBackstopFigures only)
stage2-match-multipassage.mjs     277  tests/r7-b40-support-spans-offsets.test.mjs
stage3-aggregate-verdict.mjs       60  (none)
stage4-select-excerpts.mjs         96  (none)
stage5-generate-commentary.mjs    244  (none)
index.mjs                         643  (none)
```

No direct test: Stage 1, Stage 1b runner, Stage 3, Stage 4, Stage 5, v4 index. Stage 3 is 60 lines of any-confirmed-wins; still untested as a module. Stage 1 LLM path is untested except the deterministic splitter (`tests/extract-statements.test.mjs` imports `lib/extract-statements.mjs`).

### 4.3 fake that cannot fail (only if spotted)

While reading `tests/claim-spans.test.mjs` for 3e: the upgrade truth table asserts `claimUpgrade === false` even when a-d all hold. That *can* fail if upgrade is re-enabled. Not a fake.

No other test was inspected for this. Spec said not to go looking.

---

## Section 5: tracked data

### 5.1 JSON under scripts/diagnostic/

```
TOTAL files=125  raw=169,290  bytes=7,994,961  (~7.6 MB)
```

By subdirectory:

```
scripts/diagnostic/eval-ablation             files=27  raw= 99,076  bytes=5,014,952
scripts/diagnostic/revise                    files=51  raw= 27,790  bytes=1,423,247
scripts/diagnostic/coverage-union            files= 2  raw= 17,079  bytes=  520,518
scripts/diagnostic/stage2-span               files= 1  raw=  9,190  bytes=  296,283
scripts/diagnostic/backstop-needed           files= 1  raw=  7,616  bytes=  398,184
scripts/diagnostic/evidence-span-population  files= 1  raw=  3,812  bytes=  134,808
scripts/diagnostic/span-wired                files= 1  raw=  2,875  bytes=  107,157
scripts/diagnostic/span-two-step             files= 1  raw=    743  bytes=   29,331
scripts/diagnostic/fixtures                  files=37  raw=    580  bytes=   54,147
scripts/diagnostic (root json)               files= 2  raw=    350  bytes=    8,069
scripts/diagnostic/passage-selection-probe   files= 1  raw=    179  bytes=    8,265
```

### 5.2 which of it is superseded (Stage 2)

Current reference: `r10-corpus-blast-rows.json` (18,659). Keep that if any Stage 2 dump stays in git.

Stale for Stage 2 (predates R3a+R10 live prompt, or is an intermediate ablation on an old prompt). **CONFIRMED** by ROADMAP: R3a shipped `7ff4aa4`, R10 shipped `971370f`, live prompt is R10. Everything in eval-ablation that is not the R10 blast, R10 scoped-basis gate, or R10 production-verify is stale as a Stage 2 verdict oracle. That includes:

```
r3a-corpus-blast-rows.json
rewrite-ladder-rows.json
frame-rule-head-to-head-rows.json
r7-r8-basis-ladder-rows.json
r4-conflict-hardening-rows.json
r9-basis-conflict-rows.json
r5-mark-rule-rows.json
arm-d-examples-removed-rows.json
noise-floor-rows.json
short-prompt-rows.json
eval-ablation/rows.json
and the other pre-R10 ablation JSON in that folder
```

`r3a-corpus-blast-rows.json` is the previous reference, not the current one. Keep only if you still need the R3a delta versus R10 (`r3a-corpus-blast-moved.json` / r10 moved file).

Coverage-union JSON and stage2-span JSON are not Stage 2 prompt oracles; they are mechanism dumps. Stale as *verdict* evidence after R3a/R10 (ROADMAP says the B88 evidence base is stale). Fixtures JSON is handwritten corpus and is not superseded.

### 5.3 repo size

```
working tree on disk (includes node_modules): 533.5 MB
node_modules:                                 239.0 MB
.git:                                          86.7 MB
git-tracked file bytes:                        16.9 MB
```

The 533 MB number is mostly dependencies plus git history, not source. Tracked diagnostic JSON is ~8 MB of the 16.9 MB tracked.

### 5.4 does the repo grow automatically?

Not on Production request. Diagnostic runners write JSON/md **when someone runs them**, often to tracked paths, and growth happens if those outputs are committed.

Gitignored (do not grow the repo): `scripts/diagnostic/runs/`, `scripts/diagnostic/sources-extracted/`, several `out/` dirs, `.llm-cache.json` (see `.gitignore`). `run-batch.mjs` writes under `runs/`.

Tracked writers (literal paths the harness matched). Running these and committing will grow git:

```
scripts/diagnostic/eval-ablation/run-r10-corpus-blast.mjs
  -> r10-corpus-blast-rows.json (and moved.json, .md)
scripts/diagnostic/eval-ablation/run-r3a-corpus-blast.mjs
  -> r3a-corpus-blast-rows.json
scripts/diagnostic/coverage-union/{gate,measure}.mjs
  -> rows.json, gate-rows.json
scripts/diagnostic/stage2-span/gate.mjs
  -> rows.json
scripts/diagnostic/backstop-needed/run.mjs
  -> corpus.json
plus the other eval-ablation/revise scripts listed by the harness
```

`lib/qc/llm-cache.mjs` can write a disk cache only if `QC_LLM_CACHE_DISK` is set. Production does not set it. Default store is in-memory. **CONFIRMED** architecture.md and `llm-cache.mjs` header.

---

## Section 6: what I would delete first

Ranked. This pass does not delete anything. Evidence to move first so it is not lost.

### 1. Stale Stage 2 diagnostic JSON (~80k+ lines in eval-ablation minus the R10 reference)

Move: keep `r10-corpus-blast-rows.json` (and maybe `r10-production-verify.json`, `r10-corpus-blast.md`) in git or in a tagged artefact. Snapshot the rest as a git tag (`census-pre-json-prune`) or object storage. Then drop the pre-R10 row dumps from HEAD.

Why first: largest, not executed, already declared stale for Stage 2. No Production importer.

### 2. Duplicate `api/_lib` copies (3,443 + 903 + 117)

Move: nothing unique. They match `lib/`. Delete after a one-line diff check against `lib/`.

### 3. Orphan pre-v4 QC island (~12k after removing duplicates)

`lib/canonicalClaims.js`, `lib/analyse-statements-helpers.cjs`, `lib/corpusSearch.js`, all `lib/build-*.cjs`, `lib/canonicalise-drivers-p4.cjs`, `lib/qc/{llm-claim-extraction,llm-claim-verifier,claim-validation,commentary-builder,commentary-quality,evidence-authority,evidence-relationship,evidence-relevance,targeted-excerpt,binding-directness,citation-authority}.mjs`, `lib/corpus/dealterms-value-typing.mjs`, `lib/corpus-numeric-anchor.mjs`.

Move: Architecture section 6 already records that this stack was dropped. If any measurement still cites those files, point at the git tag from step 1. No test imports them.

### 4. pipeline-v3 stages 1-5 + runner (1,060)

Move: keep a tag (`legacy-v3-route`) because `QC_PIPELINE_V4` unset still selects v3. ROADMAP R4.2 already planned this retirement. Do not move stage7.

### 5. Flag-off Suggest/Review extras (963)

`revise-stage1.mjs` + prompt (739) and `coverage-union.mjs` (224). Move the diagnostic markdown that justified parking them (`scripts/diagnostic/revise/stage1-measure.md`, coverage-union report) into `docs/` or the tag if you still want the argument in-tree.

### 6. Diagnostic harness `.mjs` (the 49,899)

Last, not first. They are how the JSON in (1) was produced. Delete dumps before harnesses, or you lose the ability to regenerate.

### What I actually think about 94,000

Disagree with treating 94,000 as the product. Disagree that the product is only Review and Suggest: `api/generate.js`, `adapt.js`, `rewrite.js`, `query.js`, and friends are still frontend-called and LIVE (~3k in those handlers plus prompt-library). ROADMAP still lists Generate, Rewrite, Adapt, Ask AI as completed platform.

Agree that the tree is larger than the live product. The extra is **orphans (~17k)** plus **diagnostic code (~50k)** plus **diagnostic JSON (~169k lines / 8 MB)**, not a hidden second pipeline. Live Review+Suggest+Draft at ~26k source lines is not shocking. Stage 2 (1,646) plus editorial reviewer (2,342) plus Suggest finalize (build-revision-prompt 1,144 plus pr9-* ) is where the live weight is, and that weight is doing work on this deploy.

---

## Section 7: the number

App lines = api+lib+helpers+utils code (orphans included, scripts excluded). Test lines = `tests/` code. Tracked data lines = json/txt/csv/tsv/log. Repo MB = working tree on disk including node_modules.

```
2026-08-29, TO_BE_REPLACED_WITH_COMMIT_SHA, 46766, 13570, 174825, 533.5
```
