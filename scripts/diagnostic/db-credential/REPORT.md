# B330. A database that is refusing connections must say so

No production Review. No model calls. USD 0.

Id: **B330**. Next free after B329.

-----------------------------------------------------------------------------
PART 0A. FACTUAL CLAIMS
-----------------------------------------------------------------------------

C1 BLOCKING. TRUE. CONFIRMED `lib/db/client.mjs` (as shipped before this spec): `getSql` threw `DB_NOT_CONFIGURED` only when `DATABASE_URL` was unset. The neon client is constructed lazily and cached. A rejected password does not fire until `sql.query` runs, outside that guard.

C2 BLOCKING. TRUE. CONFIRMED `lib/qc/model-drift-reporter.mjs` before this spec: `loadDbModules` returned null only when `DATABASE_URL` was unset (L20), and that was the only path that read `inProcessLatest`. When the URL was present, a refused query went to the outer catch, logged `[model-drift] stage=... check_failed reason=...`, and returned `{ level: "silent", changed: false }` without using the memory. That is the production line the spec names. The module comment already promised a fallback when the log is unavailable. The code only honoured a missing string.

C3 BLOCKING. TRUE as to the APIs. PARTLY as to what a reviewer sees, in this sense: both routes were silent to the person.

`api/review-state.js` and `api/reviewer-decisions.js` caught `DB_NOT_CONFIGURED` at `getSql` and returned HTTP 503 `{ error: "db_not_configured" }`. When the URL was present and the credential was rejected, `getSql` succeeded. The subsequent query threw. There was no catch around load/save/insert. The function returned a generic 500 (or an unhandled rejection, B101).

Frontend, CONFIRMED:

- Review-state save (`src/hooks/useReviewStatePersistence.js` L86-97): 413 shows a quiet notice. Any other failure is `console.warn("[review-state] save failed")`. `lastSavedAt` is not updated. The reviewer is told nothing.
- Source governance (`src/modules/drafting/SourceGovernanceQuestion.jsx` before this spec): local state was applied first, then `apiPostReviewerDecision` fired in the background. On failure: `console.warn("[reviewer-decisions] write failed")`. The card then showed "You set {label} as governing..." or the leave-as-written line. A saved decision failed and the user is told nothing.
- Applied fix (`src/modules/drafting/StatementAnalysisPanel.jsx` before this spec): version history saved, then a fire-and-forget write. On failure: `console.warn("[reviewer-decisions] applied fix write failed")`. Toast: "Draft saved to version history." The reviewer is told nothing about the missing decision row.

C4 BLOCKING. TRUE. CONFIRMED `api/health.js` before this spec: HTTP 200 `{ ok: true, service, ts, houseWordLimits, environment }` from `readEnvironmentSummary()`. No database field. The environment pill (`src/utils/environmentPill.js`, B189) already has an amber path: `tone: "warn"` when `environment.ok !== true` or revise flags disagree. Ben 18 September: the pill is an operator check and should show to a client's reviewer only when something is off-nominal. Unreachable belongs on that amber path. Not configured (local, no URL) does not.

C5 CHECK. TRUE. Consumers of this database, both repos:

| Consumer | Today when a query is refused (before this spec) |
|---|---|
| `lib/db/client.mjs` `getSql` | Does not see it. Client is already built. |
| `api/review-state.js` | Uncaught. Generic 500. Reviewer told nothing. |
| `api/reviewer-decisions.js` | Uncaught. Generic 500. Reviewer told nothing if they just made a ruling. |
| `lib/db/review-state.mjs` / `reviewer-decisions.mjs` / `model-fingerprint-log.mjs` | Throw the neon error through. |
| `lib/qc/model-drift-reporter.mjs` via `api/analyse-statements.js` and `api/suggest-revision.js` | Logs `check_failed`, returns silent, Review continues. Drift inside the instance is missed. |
| `scripts/db/migrate.mjs` | Uses `DATABASE_URL_UNPOOLED`, not `getSql`. Operator CLI. Out of product path. |
| Frontend | No direct DB. Only the three HTTP surfaces above. |

A Review does not query this database except through `reportModelDrift`. CONFIRMED `api/analyse-statements.js` does not import `lib/db/client.mjs`.

-----------------------------------------------------------------------------
PART 0B. DESIGN
-----------------------------------------------------------------------------

B0. This class of failure is: configured, reachable in principle, refusing.

The check belongs on `/api/health` as one `SELECT 1` per poll, not on Review. Review already calls `reportModelDrift`; that call must degrade, not probe extra. Decision writes already pay for a query; classify the error when it fails. `getSql` stays lazy. It cannot observe reachability without a query, so the three states are: throw `DB_NOT_CONFIGURED` (no URL), return a client (URL present), and `DB_UNREACHABLE` at query/probe time.

Cost on a normal Review: zero extra queries. Cost on health: one round trip per poll. Cost on a decision POST: the write itself, already paid.

P34 callers of `getSql`: `api/review-state.js` (named 503), `api/reviewer-decisions.js` (named 503), `lib/qc/model-drift-reporter.mjs` (memory fallback), `api/health.js` (probe). No other product callers.

B1 AGREE. Fallback on any database failure, not only a missing string.

B2 AMEND. `getSql` and its callers distinguish three named errors (`DB_NOT_CONFIGURED`, reachable probe, `DB_UNREACHABLE`). `getSql` itself cannot know reachable vs refusing without a query. Tests distinguish by `err.code`, not by matching the neon message.

B3 AGREE, with this bound: the pill goes amber when unreachable. It does not go amber when the URL is unset. That is local-dev normal, not off-nominal for a client's reviewer.

B4 AGREE. Wording in `src/modules/drafting/decisionSaveCopy.js`: "That decision was not saved. Please try again." AWAITING BEN'S RULING. Persist first, then apply local state. If persist fails, the settled "you set / you left" line is not shown.

B5 AGREE. Dated note `MODEL_DRIFT_BLIND_PERIOD` from 2026-09-21 in `lib/qc/model-drift-reporter.mjs`, this report, and BACKLOG. After rotation the next written row is a new baseline.

B6 AGREE. Not built.

-----------------------------------------------------------------------------
PART 1. BUILD
-----------------------------------------------------------------------------

Shipped:

- `lib/db/client.mjs` named errors, probe, `readDatabaseStatus`.
- `lib/qc/model-drift-reporter.mjs` memory fallback on any failure. Blind-period constant.
- `api/health.js` reports `database` and sets `environment.ok` false when unreachable.
- `api/review-state.js` / `api/reviewer-decisions.js` 503 `db_unreachable`.
- Query wrappers in `lib/db/review-state.mjs`, `reviewer-decisions.mjs`, `model-fingerprint-log.mjs`.
- Tests `tests/db-unreachable.test.mjs`.
- Frontend: pill amber `database unreachable`. Decision persist-then-apply. Copy awaiting Ben.

-----------------------------------------------------------------------------
PART 2. THE RECORD. NO MODEL CALLS.
-----------------------------------------------------------------------------

## 2.1 What the reviewer saw BEFORE, and after

BEFORE, when a source-governance ruling or leave-as-written override failed to save:

The card applied the ruling locally first. The reviewer then saw either "You set {label} as governing where these two documents disagree." or "You left this sentence as written with the sources in disagreement." The failed write was `console.warn("[reviewer-decisions] write failed")`. A saved decision failed and the user is told nothing.

BEFORE, when an accepted fix failed to record:

Toast: "Draft saved to version history." Warn: `[reviewer-decisions] applied fix write failed`. Told nothing about the missing row.

AFTER, same three actions:

Copy (awaiting Ben): "That decision was not saved. Please try again."

Source governance: persist first. On failure the settled line is not shown. The copy appears on the card in rose. On success the settled line appears as before.

Accepted fix: toast "Draft saved to version history. That decision was not saved. Please try again." The draft version is still saved. The decision is not presented as recorded.

## 2.2 The three states, exact health response

HTTP 200 in all three. The Function is up. The database field is the operator fact.

not configured (`DATABASE_URL` unset):

```json
{
  "ok": true,
  "service": "backend",
  "database": {
    "state": "not_configured",
    "configured": false,
    "reachable": false
  },
  "environment": {
    "database": "not_configured"
  }
}
```

`environment.ok` follows pipeline / house / editorial as before. The pill stays grey if those are nominal.

configured and reachable:

```json
{
  "ok": true,
  "service": "backend",
  "database": {
    "state": "reachable",
    "configured": true,
    "reachable": true
  },
  "environment": {
    "database": "reachable"
  }
}
```

configured and refusing (refused password):

```json
{
  "ok": true,
  "service": "backend",
  "database": {
    "state": "unreachable",
    "configured": true,
    "reachable": false
  },
  "environment": {
    "database": "unreachable",
    "ok": false
  }
}
```

Pill: amber, label `database unreachable`, tooltip includes `Database: unreachable`.

Decision POST when refusing: HTTP 503 `{ "error": "db_unreachable" }`. Missing URL: HTTP 503 `{ "error": "db_not_configured" }`. Named codes `DB_UNREACHABLE` and `DB_NOT_CONFIGURED` on the thrown error, not a string match on the neon message.

## 2.3 The blind period

Earliest committed confirmation that this credential was refusing:

- 2026-09-21. `scripts/diagnostic/delivery-check/b294-card-colour.md` L49: local `DATABASE_URL` has previously failed authentication (B103). Spec names the production log from the same date: `[model-drift] check_failed reason=password authentication failed for user 'neondb_owner'`. That exact production line is not in git. HYPOTHESIS that production drift writes stopped on 21 September, as the spec states.
- 2026-08-25. B103: local credential already stale.
- 2026-09-22. `scripts/diagnostic/delivery-check/extract-at-upload-groundwork.md` L99: local `SELECT` failed with password authentication for `neondb_owner`.

What is missing from the drift record: every `model_fingerprint_log` row that would have been written from 2026-09-21 until the credential is rotated. In-process memory on warm instances may have caught some changes and then died with the Function. After rotation, the next successful `reportModelDrift` write is a new baseline. Constant `MODEL_DRIFT_BLIND_PERIOD.from = "2026-09-21"`.

## 2.4 What Ben must do that code cannot

Rotate the Neon password for `neondb_owner` and update the Vercel environment setting `DATABASE_URL` (and `DATABASE_URL_UNPOOLED` if migrate still uses it). After that, `GET /api/health` is the confirmation: `database.state` must be `reachable`. That check needs no deploy.

-----------------------------------------------------------------------------
COST
-----------------------------------------------------------------------------

USD 0. No model calls. No production Review.

-----------------------------------------------------------------------------
NOT BUILT
-----------------------------------------------------------------------------

Permanent decision record. Accounts. Moving off this database. Retrying failed writes. Queueing decisions for later. Amber pill for `not_configured`.
