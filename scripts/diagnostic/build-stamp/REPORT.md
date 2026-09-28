# B340. The product says which build served the request and what it is actually set to

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | 0883627 | SHIP VERIFIED  0883627  main  133 files  1592 tests |
| frontend | a83be83 | SHIP VERIFIED  a83be83  main  44 files  252 tests |

Ids used: B340.

Cost: USD 0. No model calls.

Browser: local `http://localhost:5173/assess`. Hover copy only. No Review run. SAW: green `Backend: Up`; amber pill label `database unreachable`; hover `Pipeline v4 · House name: Halden Group · Revise action list: on · Editorial review: on · Database: unreachable · Backend build: unavailable`; sibling header `(Build: 3f37565)`. Amber rules unchanged.

---

## Part 0A

A1 TRUE. Before this spec, `api/health.js` returned exactly those six keys. No build identity.

Quoted `api/health.js` at `9a38ff3`:

```
  return res.status(200).json({
    ok: true,
    service: "backend",
    ts: new Date().toISOString(),
    houseWordLimits: buildHouseWordLimits(),
    environment,
    database,
  });
```

Live Production `GET /api/health` on 2026-09-28 00:59 UTC still matched that shape (no `build`).

A2 TRUE. Before this spec, `readEnvironmentSummary` returned only those five keys.

Quoted `api/_lib/env-flags.js` at `9a38ff3`:

```
  return {
    pipelineRoute,
    authoringOrganisation,
    reviseActionList: isReviseActionListEnabled(env),
    editorialReview,
    ok: pipelineRoute === "v4" && authoringOrganisation !== null && editorialReview === true,
  };
```

A3 TRUE. Success `meta` carried `pipelineVersion` and `modelConfig` (plus spend, schedules, warnings). No backend commit.

Quoted `api/analyse-statements.js` at `9a38ff3`:

```
      meta: {
        pipelineVersion: useV4 ? "v4" : "v3",
        stagesComplete: pipelineResult?._stagesComplete ?? null,
        ...
        llmSpend: getLlmSpend(),
        modelConfig,
        ...(typeof sourceIngestionWarning === "string" ? { sourceIngestionWarning } : {}),
```

The header `(Build: …)` is the frontend Vite commit (`src/utils/version.js` / `VITE_BUILD_COMMIT`). It does not name the backend that served the request.

A4 PARTLY. Vercel documents `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, and `VERCEL_GIT_COMMIT_MESSAGE` at build and, when system environment variables are exposed, at runtime. This product already reads SHA and REF at frontend build. Quoted `vite.config.js`:

```
  const vercelSha = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim();
  ...
  const buildBranch = String(process.env.VERCEL_GIT_COMMIT_REF || "").trim();
```

Production frontend header pills have shown short SHAs, so SHA is present on this project's Production builds. REF is wired into the frontend build title. MESSAGE is not read anywhere in either repo.

Locally all three are unset:

```
{"SHA":null,"REF":null,"MSG":null}
```

This spec does not guess a local `git rev-parse`. Backend runtime identity is reported by `readBuildIdentity`: `source` is `"vercel-env"` when SHA or REF is present, otherwise `"unavailable"`.

A5 TRUE. Editorial counts only the exact trimmed string `"1"`. Quoted `api/_lib/env-flags.js`:

```
export function isEditorialReviewEnabled(env = process.env) {
  return String(env?.BRIGHTLINE_EDITORIAL_REVIEW || "").trim() === "1";
}
```

Stricter than editorial:

- `QC_PIPELINE_V4`: exact `"1"`, no trim. Quoted `readEnvironmentSummary`: `env.QC_PIPELINE_V4 === "1" ? "v4" : "v3"`.
- `QC_EXTRACT_STRUCTURE`: exact `"true"` or `"1"`, no lower and no trim. Quoted `lib/extract-text-from-source.mjs`: `return v === "true" || v === "1";`.
- `PDF_RAISED_CHARACTERS`: off set is `0` / `false` / `off` after trim+lower. No `"no"`. Quoted `lib/extract-pdf-direct.mjs`: `if (v === "0" || v === "false" || v === "off") return false;`.

Looser than editorial:

- `REVISE_ACTION_LIST`: `1` / `true` / `yes` / `on` after trim+lower.
- `QC_STAGE2_SPAN`: `1` / `true` / `yes` / `on` after trim+lower.
- `QC_MULTISOURCE_COVERAGE`: same tokens, and only if span is on.
- `QC_CLAIM_SPANS` and `QC_LLM_CACHE`: opt-out. Default ON. Off tokens `0` / `false` / `no` / `off`. Claim spans also accepts `"no"`; raised characters does not.

A6 TRUE. File `src/utils/environmentPill.js`, function `environmentPillView`, rendered by `BackendStatusPill` in `src/App.jsx`. The pill label is the pipeline route (or an amber reason list). Hover before this spec:

Quoted `src/utils/environmentPill.js` at frontend `3f37565`:

```
  return `Pipeline ${environment.pipelineRoute} · House name: ${houseName} · Revise action list: ${revise}${editorialPart}${databasePart}`;
```

The frontend build is a sibling header span, not that hover. Quoted `src/App.jsx` `FocusTopBar`:

```
          <span className="text-[12px] text-slate-500 whitespace-nowrap shrink-0" title={versionTitle}>
            {version}
          </span>
```

`version` comes from `getAppVersion()` in `src/utils/version.js` (`(Build: <sha|dev>)`).

---

## Part 0B

B1 AGREE. `/api/health` now includes `build: { commit, ref, source }`. Absent values are `"unavailable"`. No throw. No `git rev-parse`.

B2 AGREE. The seven settings named in the spec are reported by calling `isClaimSpansEnabled`, `isStage2SpanEnabled`, `isLlmCacheEnabled`, `isMultisourceCoverageEnabled`, `resolvePdfEngine`, `isExtractStructureEnabled`, and `isRaisedCharactersEnabled`. No second parser. No secret or connection string.

B3 AGREE. `environment.unrecognisedFlags` is an array of names. A non-empty value the resolver does not recognise lists the name only.

B4 AMEND. `differsFromDefault` is on the seven B2 flags. The existing four (`pipelineRoute`, `authoringOrganisation`, `reviseActionList`, `editorialReview`) stay booleans so `environment.ok` and the pill amber formula do not change (B7).

B5 AGREE. Success `meta`, incomplete `meta` (`buildIncompleteReviewResponse`), and the catch-path `meta` all carry the same `build` object.

B6 AMEND. The frontend build was already a sibling header span, not a line inside the environment-pill hover. The hover now always includes `Backend build: <short sha|unavailable>`. No layout change, no new component, no colour change. If the third argument is omitted, the line says `unavailable` rather than being hidden.

B7 AGREE. Health is not added to any export. Amber rules are unchanged. Pipeline resolvers are not rewritten; two private helpers were exported with the same body.

---

## Tests

`tests/health-build-and-flags.test.mjs` T1–T7. T7 hits the real `analyse-statements` preflight refuse (80k-word draft, no model call) and `buildIncompleteReviewResponse`. Frontend: `tests/environment-pill.test.mjs` and `tests/b245-results-screen-claims.test.mjs` titles append ` · Backend build: unavailable`.

---

## Production-shaped health payload

Live Production on 2026-09-28 00:59 UTC still served the old six-key body. After this ship, the same request is this shape. `ts` omitted. `build.commit` is the short SHA of the serving backend deploy. Secrets: none present; none redacted.

Known live Production values kept: `pipelineRoute` v4, house name Halden Group, revise action list on, editorial on, database reachable. The seven B2 flags below are the code defaults (empty env). If Production still has `QC_STAGE2_SPAN=1`, `stage2Span` will be `{ "resolved": true, "differsFromDefault": true }` instead of the default shown here.

```json
{
  "ok": true,
  "service": "backend",
  "houseWordLimits": {
    "NEW_DIRECT_INVESTMENT": { "public": 80, "complete": 150 },
    "NEW_FUND_COMMITMENT": { "public": 80, "complete": 150 }
  },
  "environment": {
    "pipelineRoute": "v4",
    "authoringOrganisation": "Halden Group",
    "reviseActionList": true,
    "editorialReview": true,
    "ok": true,
    "claimSpans": { "resolved": true, "differsFromDefault": false },
    "stage2Span": { "resolved": false, "differsFromDefault": false },
    "llmCache": { "resolved": true, "differsFromDefault": false },
    "multisourceCoverage": { "resolved": false, "differsFromDefault": false },
    "pdfEngine": { "resolved": "direct", "differsFromDefault": false },
    "extractStructure": { "resolved": false, "differsFromDefault": false },
    "raisedCharacters": { "resolved": true, "differsFromDefault": false },
    "unrecognisedFlags": [],
    "database": "reachable"
  },
  "database": {
    "state": "reachable",
    "configured": true,
    "reachable": true
  },
  "build": {
    "commit": "<short sha of the serving deploy>",
    "ref": "main",
    "source": "vercel-env"
  }
}
```

If Vercel does not expose system env to the function at runtime, `build` is `{ "commit": "unavailable", "ref": "unavailable", "source": "unavailable" }` instead of guessed.

Local measured payload (git env absent, `QC_PIPELINE_V4` unset, SQL overridden reachable):

```json
{
  "ok": true,
  "service": "backend",
  "houseWordLimits": {
    "NEW_DIRECT_INVESTMENT": { "public": 80, "complete": 150 },
    "NEW_FUND_COMMITMENT": { "public": 80, "complete": 150 }
  },
  "environment": {
    "pipelineRoute": "v3",
    "authoringOrganisation": null,
    "reviseActionList": false,
    "editorialReview": false,
    "ok": false,
    "claimSpans": { "resolved": true, "differsFromDefault": false },
    "stage2Span": { "resolved": false, "differsFromDefault": false },
    "llmCache": { "resolved": true, "differsFromDefault": false },
    "multisourceCoverage": { "resolved": false, "differsFromDefault": false },
    "pdfEngine": { "resolved": "direct", "differsFromDefault": false },
    "extractStructure": { "resolved": false, "differsFromDefault": false },
    "raisedCharacters": { "resolved": true, "differsFromDefault": false },
    "unrecognisedFlags": [],
    "database": "reachable"
  },
  "database": {
    "state": "reachable",
    "configured": true,
    "reachable": true
  },
  "build": {
    "commit": "unavailable",
    "ref": "unavailable",
    "source": "unavailable"
  }
}
```

Not reported: TPM, because it is an OpenAI account limit rather than an environment variable, and reading it would need a billed provider call. `QC_LLM_CACHE_DISK` is also omitted because it is a filesystem path.

---

## Browser

Local `http://localhost:5173/assess`. Copy and hover only. No Review.

SAW: green `Backend: Up`. Amber environment pill labelled `database unreachable` (local database is unreachable; that amber rule was not changed). Hover title: `Pipeline v4 · House name: Halden Group · Revise action list: on · Editorial review: on · Database: unreachable · Backend build: unavailable`. Sibling header span `(Build: 3f37565)`. The backend build line is present rather than hidden. No layout or colour change on the pill itself beyond the pre-existing amber for an unreachable database.
