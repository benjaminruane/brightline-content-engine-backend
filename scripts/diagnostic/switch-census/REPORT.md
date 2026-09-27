# B339. The switch census

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | pending push | not yet run |
| frontend | not touched | -- |

Ids used: B339 (this census), B340, B341.

Cost: USD 0. No model calls.

Browser: skipped. No layout, control, or copy change. Live confirmation is `GET /api/health` on Production, 27 September 2026 11:56 UTC.

---

## Part 0A

A1 PARTLY. The vacant fields are real. The capability is on. It does not "return nothing" because it is switched off.

`isClaimSpansEnabled` defaults true. Quoted `lib/qc/claim-spans.mjs`:

```
const v = String(process.env.QC_CLAIM_SPANS || "").trim().toLowerCase();
if (v === "0" || v === "false" || v === "no" || v === "off") return false;
return true;
```

When the flag is on, every statement is stamped with an empty payload before Stage 1b admits anything. Quoted `lib/qc/pipeline-v4/index.mjs`:

```
let claimSpans = claimSpansEnabled ? emptyClaimSpanPayload() : null;
```

`emptyClaimSpanPayload` is `{ decomposed: false, claimUpgrade: false, claims: [] }`. `sentenceSubclaimCount` and `qcClaimId` are always `null` in `assembleCard`, including on cards that did decompose (live F18 10 September JSON, cards with `decomposed: true` still have both null).

The three 27 September payloads are not in git. Reconstruction: `node scripts/diagnostic/switch-census/census.mjs` ran `isCompoundCandidate` on the four evidence statements from that draft. All four printed `false`. Stage 1b therefore never calls the model (`candidates.length === 0` returns). That is correct for this draft. It is not evidence the flag is off.

Separately, the upgrade that would change a Review verdict is hardcoded off. Quoted `lib/qc/claim-spans.mjs`:

```
const upgrade = false;
```

Commit `68940c3` (`review-upgrade-off`, 2026-08-25). Measured: one false green on a synthetic fixture, zero correct firings on 254 production-fixture cards.

A2 TRUE. Live Production health 27 September 2026 11:56 UTC:

```
"authoringOrganisation": "Halden Group"
```

Same value on 17 and 18 September health checks. Backlog **B96**. Code default is `null` (`DEFAULT_AUTHORING_ORGANISATION`). The fixture is the deployed env, not the code default.

A3 TRUE. `/api/health` returns `ok`, `service`, `ts`, `houseWordLimits`, `environment`, `database`. No git sha. Quoted `api/health.js` return body: those six keys only.

The Review payload `meta` carries `pipelineVersion`, `modelConfig` (pinned model ids and Stage 2 fingerprints), spend, and schedules. No backend commit. The header `(Build: ...)` is the frontend Vite commit (`src/utils/version.js` / `VITE_BUILD_COMMIT`). It does not name the backend that served the request.

---

## C1. Environment flags

Every `process.env` read in `lib/` and `api/`. Collector: `scripts/diagnostic/switch-census/census.mjs`. Production values that health reports are marked live. The rest are code defaults unless a cited earlier census recorded a Production override.

`*` = default differs from what a reader of the docs or the grey pill would expect.

| Name | Default when unset | Values that change behaviour | What changes if wrong | Default safe? |
|------|--------------------|------------------------------|-----------------------|---------------|
| `QC_PIPELINE_V4` * | v3 | `1` selects v4 | Whole Review path. Unset is v3. Docs say Production is v4. Live health: v4. | No |
| `AUTHORING_ORGANISATION` * | `null` | any non-empty string | First-person rewrite uses this name. Live: `Halden Group` (fixture). | Code default yes. Deployed value no. |
| `BRIGHTLINE_EDITORIAL_REVIEW` * | off | exactly `1` | Editorial concerns. `true`/`on` do not count. Live: on. | No, for the product as shipped |
| `REVISE_ACTION_LIST` | off | `1`/`true`/`yes`/`on` | Implement Changes list. Live: on. | Off is safe; on is the current product |
| `QC_CLAIM_SPANS` | ON | `0`/`false`/`no`/`off` disables | Stage 1b + per-claim Stage 2. Health does not report it. | On matches docs. Verdict upgrade is separately hardcoded off |
| `QC_STAGE2_SPAN` * | OFF | `1`/`true`/`yes`/`on` | Extra passages after Stage 2. Earlier census said Production sets `1`. Health does not report it. | Off matches the code comment, not the Production practice |
| `QC_LLM_CACHE` | ON | `0`/`false`/`no`/`off` disables | Stages 1, 1b, 2 replay. Not 5, not 6. | Yes |
| `QC_LLM_CACHE_DISK` | unset (memory) | a file path | Process-local file cache. Must be empty in Production. | Yes |
| `QC_MULTISOURCE_COVERAGE` | OFF | `1`/`true`/`yes`/`on`, and only if span is on | Can promote partial to confirmed. | Yes (off is the conservative default) |
| `PDF_ENGINE` | `direct` | `officeparser` | PDF extract path. `officeparser` is the old slow wall. | Yes |
| `QC_EXTRACT_STRUCTURE` | off | `true`/`1` | Page/table chunks. | Yes |
| `PDF_RAISED_CHARACTERS` | on | `0`/`false`/`off` | Superscripts dropped. | Yes |
| `MAX_PDF_MB` | 10 | integer >= 1 | Per-file extract cap. Does not beat the 4.5 MB Vercel body cap (**B79**). | Yes |
| `X1_1B_MIN_TEXT_LEN_PDF` | 200 | integer >= 50 | Scanned vs born-digital stamp. | Guess |
| `X1_1B_MIN_TOTAL_TEXT` | 300 | integer >= 100 | Empty-source warn. | Guess |
| `MIN_EXTRACT_LEN_PDF` | 500 | integer | Quality warn. | Guess |
| `MIN_EXTRACT_LEN_WARN_PDF` | 1200 | integer | Quality warn. | Guess |
| `MIN_RAW_BYTES_FOR_EXPECTED_TEXT` | 50000 | integer | Quality warn. | Guess |
| `MIN_PRINTABLE_RATIO` | 0.75 | 0.1 to 1 | Quality warn. | Guess |
| `DATABASE_URL` | unset | a URL | Persistence. Live: reachable. | Unset is loud after **B330** |
| `OPENAI_API_KEY` | unset | a key | Review cannot run. | Must be set in Production |
| `ANTHROPIC_API_KEY` | unset | a key | Unused on current pinned stages. | Yes |
| `LANGFUSE_PUBLIC_KEY` / `SECRET_KEY` / `HOST` | unset | keys + host | Traces and cost. Review still runs. | Yes for Review; no for spend visibility (**B310**) |
| `TAVILY_API_KEY` | unset | a key | Web search / `/api/query` only. | Yes |
| `BRIGHTLINE_API_BASE_URL` | unset | a URL | Writing routes call this host. | Empty is correct in Production |
| `BRIGHTLINE_ALLOW_DIAG_HEADER` | off | `1` | Diagnostic headers in Production. | Yes (off) |
| `BRIGHTLINE_DIAG_VERBOSE` | off | `1` | Extra logs. | Yes |
| `DEBUG_LLM_CACHE` | off | `1` | Cache logs. | Yes |
| `CONSTRUCTIVE_FEEDBACK_DEBUG_CRAFT` | off | `1` | Craft debug logs. | Yes |
| `DIAG_EXTRACT_SAMPLES` | off | `1`/`true` | Extract dump logs. | Yes |
| `QC_LLM_CLAIM_EXTRACTION_MODEL` | dead | n/a | No live caller. | Harmless |
| `QC_LLM_CLAIM_EXTRACTION_TIMEOUT_MS` | dead | n/a | No live caller. | Harmless |
| `VERCEL_ENV` | set by Vercel | `production` locks diag headers | Do not type by hand. | Yes |
| `NODE_ENV` | platform | read only by `api/web-test.js` | Test endpoint. | Yes |
| `NODE_OPTIONS` | platform | read only by `api/debug-node.js` | Debug endpoint. | Yes |

Not read in JS, previously recorded as set in Production: `BRIGHTLINE_QC_V3`. No reader. Leftover. Checklist says leave it empty.

---

## C2. Capabilities that run and produce nothing

27 September payloads are not committed. Intersection of vacant qcCard fields is reconstructed from `assembleCard` constants plus the empty claim-span payload that Stage 1b stamps when the prefilter admits nobody. Live F18 10 September JSON shows the same vacant constants even on `decomposed: true` cards. The four evidence statements from 27 September all fail `isCompoundCandidate` (census.mjs).

| Field | Value on those cards | Correct for this draft, or dead? |
|-------|----------------------|----------------------------------|
| `decomposed` | false | Correct for this draft. Prefilter. Capability is on. |
| `claims` | `[]` | Same. |
| `claimUpgrade` | false | Always. Upgrade hardcoded off since `68940c3`, not this draft. |
| `sentenceSubclaimCount` | null | Dead key. Never written. Even decomposed F18 cards are null. |
| `qcClaimId` | null | Dead key. Never written. |
| `citationHovers` | `[]` | Dead. Frontend still branches on it (**B231**). Source chips do not render. |
| `conflictValues` | null | Dead. Frontend still formats it. |
| `reasoningHeadline` | null | Dead. |
| `evidenceTrace` | `[]` | Dead. |
| `selectedExcerptReason` | null | Dead. |
| `excerptMatchType` | `"none"` | Constant. Not a live matcher type. |
| `suggestedImprovement` | null | Dead. |
| `whyItMatters` | null | Dead. Frontend still reads it. |
| `primaryExcerptTrusted` | false | Constant false. |
| `conflictEvidence` | null | Dead. |
| `primaryRefId` | null | Dead. |
| `primarySourceOrigin` | null | Dead. |
| `primaryExcerptStart` / `End` | null unless a gated excerpt has offsets | Often null. |
| `secondarySupportCount` | 0 | Constant 0. |
| `supportingReferenceIds` / `Titles` | `[]` | Constant empty. |
| `coverageUnion` | absent | Flag default off. Not this draft. |

Other stages that execute and return empty / false every time:

| Thing | What runs | What comes back | Verdict |
|-------|-----------|-----------------|---------|
| Stage 1b on the 27 September draft | Prefilter loop | 0 candidates, no LLM | Correct for this draft |
| `rollupClaimVerdicts` | Called whenever a sentence actually decomposes | `claimUpgrade: false` always | Hardcoded off. Extra Stage 2 cost, no Review verdict change |
| `lib/qc/llm-claim-extraction.mjs` | Nothing. No importer in `lib/` or `api/` | n/a | Orphan. Its two env vars are dead |
| Coverage union | Gated off | no field | Off by design |
| Deterministic unsupported removal | Called, `enabled: false` | immediate return | Flag-off, not a 27 September exhibit |

---

## C3. Hard-coded thresholds and caps

| Thing | Value | Introduced | Evidence or guess |
|-------|-------|------------|-------------------|
| Name-match Jaccard (`namesMatch`) | 0.6 | `4536ac7` quantity-matching | Guess. 27 September S1 failed it until B338 added LFL abbrev. No report picked 0.6. |
| Concern-text Jaccard (`DUPLICATE_TEXT_SIMILARITY_THRESHOLD`) | 0.85 | `fe9ec23` R5.2(a) | Spec number. No later measure. |
| Concern overlap (`DUPLICATE_OVERLAP_THRESHOLD`) | 0.8 | same file, R5.2 | Spec number. |
| `MAX_CLAIMS_PER_SENTENCE` | 3 | `c290cee` B53a | Spec cap. Revert reason `over_claim_cap`. |
| `MAX_DECOMPOSED_SENTENCES` | 12 | `c290cee` B53a | Spec cap. **B252** measured 8 of 20 extras on a long draft. |
| `STAGE2_CONCURRENCY` | 24 | 8 in `b81929b`, raised `e6e59a6` when claim spans defaulted on | Cap, not a measurement of the account. |
| Stage 5 / 6 concurrency | planned at run time from remaining TPM | `8f15563` B277 | Measured path. Uses live remaining headers after the first response. |
| gpt-4o TPM assumption | 2,000,000 | `8f15563` | Guess of the account tier until headers arrive. The WHY tokens-per-minute wall. |
| gpt-5.1 TPM assumption | 4,000,000 | same | Guess. |
| Function / extract timeout | 300,000 ms | vercel.json; extract matched in `6c20b67` B267 | Platform cap. Measured. |
| Request body | 4.5 MB Vercel edge | platform | **B79**. Measured. Practical source ceiling ~3 MB after base64. |
| `MAX_PDF_MB` | 10 | `81c6ddd` X1.1 | Does not beat B79. |
| `RATE_LIMIT_MAX_ATTEMPTS` | 1000 | `0ffce91` / `7cdb1c9` | Arithmetic backstop so a 1s retry-after cannot loop the 300s cap. |
| First-call refuse bound | 8,000 ms | `NOTHING_REVIEWED_RETRY_BOUND_MS` | Measured against a billing-stop hang. |
| No-budget fallback wait | 6,000 ms | `8f15563` | Pre-B278 three gaps of 2s. |
| Review response margin | 2,000 ms | B329 | Guess of serialize time. |
| Preflight pin (draft/source/tokens/idle) | 3698 / 3558 / 5,459,667 / 146,918 | B329 from B277 Run 4 | Measured. |
| Excerpt cap | 300 chars | Stage 4 | Spec. **B167** on stacked dots. |
| Claim-span locate | Levenshtein <= 2 | B53a | Same standard as Stage 1. |
| `ACTION_LIST_CONCURRENCY` | 4 | `d7a38d2` | Guess. |
| `DEFAULT_CONCURRENCY` (revise stage 1) | 4 | revise-stage1 | Flag-off path. |
| Fallback splitter | 40 candidates, 240 chars | Stage 1 fallback | **B256**. Did not fire on the measured drafts. |
| `SCANNED_NEAR_EMPTY_CHARS` | 50 | extract | Guess. |
| Constructive-feedback word cap | `min(280, 100 + 0.6 * draftWords)` | constructive-feedback | Guess. |
| Cache LRU | process memory | B63 | Dies on cold start. Documented. |

---

## C4. Written and never read

qcCard keys written empty, still read by the frontend (chips, conflict summary, subclaim count): listed under C2. Harmless to the verdict. They mean a UI branch cannot fire. Already **B231**. Do not delete in a drive-by.

Exported with no product caller:

| Symbol | Callers | Harmless or protection gone |
|--------|---------|-----------------------------|
| `lib/qc/llm-claim-extraction.mjs` | none in `lib/` or `api/` | Harmless orphan. Two env vars go nowhere. |
| `buildFindingPrompt` | tests only, after B338 | Harmless. The model path that used it is gone. |
| `fillAction` `callModel` argument | voided (`void callModel`) | Harmless. B338 invariant. |
| `PLACEHOLDER_LEAK` on an action-list proposal | cannot fire; no model writes that proposal | The guard targeted composed prose. Composed prose is no longer proposed. Protection is not needed. Editorial still flags. |
| First-person replace proposal | withheld as authored | Same. Concern remains. |
| `resultIsIdentity` | removed with the model parse path | Same. |

B338 did not disable a safety check on derived corrections. Derived replaces still go through pairing, B336, the displayed-figure gate, and governance.

---

## C5. Fixture values that reached Production config

| Thing | Deployed value | How we know | What a user sees |
|-------|----------------|-------------|------------------|
| `AUTHORING_ORGANISATION` | `Halden Group` | Live health 27 September 2026 11:56 UTC. **B96**. | House hover: `House name: Halden Group`. First-person rewrite uses that name when the draft contains it. |
| `REVISE_ACTION_LIST` | on | Live health | Implement Changes is the product. Started as a flag. |

Code default for the house name is `null`. The fixture is only in Vercel. Preview has been the same name since at least 17 September.

---

## Part 2

### R1. Five most likely silently wrong right now

1. **`AUTHORING_ORGANISATION` = Halden Group.** A first-person sentence is rewritten as the test firm when the draft happens to contain that name. A real client draft that never mentions it silently skips the named-actor path. Hover already shows the name.
2. **Backend git sha is not on health or the Review payload.** The grey `(Build: ...)` is the frontend. A backend-only ship is invisible. That is how a timeout, a flag, and a fixture survived.
3. **gpt-4o TPM assumed 2,000,000 until the first header.** A lower account tier over-schedules the first wave, waits inside 300 s, then returns no cards. This is the tokens-per-minute wall class.
4. **`QC_STAGE2_SPAN` default OFF, not in health.** If Production ever lost the override, conflicting cards would quote one passage and nobody would see a flag flip.
5. **`QC_CLAIM_SPANS` default ON, not in health, upgrade hardcoded off.** 27 September looked like a dead capability. It was the prefilter. On a compound draft it still spends extra Stage 2 and never changes the Review verdict.

### R2. Survived defaults, never a decision

- Name-match Jaccard 0.6
- `ACTION_LIST_CONCURRENCY` 4
- Extract quality thresholds (`X1_1B_*`, `MIN_EXTRACT_*`, printable ratio)
- `MAX_PDF_MB` 10 (independent of the real 4.5 MB body cap)
- `DUPLICATE_TEXT_SIMILARITY_THRESHOLD` 0.85 and overlap 0.8 after the original spec
- Review response margin 2,000 ms
- `QC_PIPELINE_V4` unset = v3 (the dangerous one; Production currently sets `1`)
- `BRIGHTLINE_EDITORIAL_REVIEW` unset = off, and only the string `1` turns it on

### R3. Actively wrong today. Not fixed. Filed.

- **B340.** Neither `/api/health` nor the Review payload names the backend git sha. Health reports four flags (`pipelineRoute`, house name, revise action list, editorial). It does not report `QC_CLAIM_SPANS`, `QC_STAGE2_SPAN`, `QC_LLM_CACHE`, `PDF_ENGINE`, or TPM. A switch can change the product with no pill.
- **B341.** Claim spans default ON. 27 September six statements: `isCompoundCandidate` false on all four evidence lines, empty payload, no Stage 1b LLM. The upgrade has been `false` since `68940c3`. Architecture still describes an upgrade-only rollup. Do not flip the flag in a drive-by.

`AUTHORING_ORGANISATION` = Halden Group is already **B96**. Not refiled.

### R4. ENV-CHECKLIST.md

`scripts/diagnostic/switch-census/ENV-CHECKLIST.md`. Written for the Vercel settings page.

---

## Cheapest next probe

Category most likely to be hiding another finding of the WHY kind: **C1 environment flags that health does not report**, especially `QC_STAGE2_SPAN` and the OpenAI account TPM, because both can change what a card quotes or whether a Review finishes, and neither appears on the pill.

Cheapest probe: open the Vercel Production env page with `ENV-CHECKLIST.md` next to it, and on the OpenAI usage page read the live TPM for the key in `OPENAI_API_KEY`. No Review required.

---

## What was not built

No product code. No behaviour change. No test changes. Frontend not touched.
