# Source-governance persistence findings

Read-only diagnostic, 2026-09-13. No pipeline, extract, evidence pass, action-list, or accuracy run. No LLM calls. No database writes. Metered spend: **USD 0.00**. The only file written is this one. No product code changed.

**The question.** When two uploaded sources disagree on the same quantity, the card is meant to ask which source governs. That answer is scoped to this piece of work, must survive a second Review and a draft edit, must not follow the same files into a different piece of work, must survive a third source being added, and must die if either source in the pair is replaced. Where would that ruling live today?

**Short answer.** There is no durable piece of work. There is a browser-generated `review_id` in localStorage that keys one overwrite JSON blob in `review_state`. Reviewer decisions are specified to live in a separate append-only table (B9). That table does not exist. A stored ruling could not reach the proposal layer even if it did, because `POST /api/revise-actions` and `POST /api/analyse-statements` are stateless and do not read the database. The ruling cannot be stored and read today as specified.

**Sources used.**

- Schema: `db/migrations/001_review_state.sql`, `db/migrations/002_model_fingerprint_log.sql`. Only two migrations exist.
- Persistence: `lib/db/review-state.mjs`, `api/review-state.js`, `docs/ARCHITECTURE.md` §9.
- Frontend identity and snapshot (read-only): `src/utils/reviewSession.js`, `src/utils/reviewStateSnapshot.js`, `src/hooks/useReviewStatePersistence.js`, `src/hooks/useAssessState.jsx`, `src/utils/api.js`.
- Review and proposal path: `api/analyse-statements.js`, `lib/response-sources.mjs`, `lib/qc/pipeline-v4/index.mjs`, `lib/qc/supersession.mjs`, `lib/qc/source-recency.mjs`, `api/revise-actions.js`, `lib/revise-actions/run.mjs`, `lib/revise-actions/conflict-engagement.mjs`.
- Backlog / architecture: `docs/BACKLOG.md` B9 / B173 / Pr13 / B51; `docs/ROADMAP.md` persistence and B9 notes.
- Earlier diagnostic: `scripts/diagnostic/delivery-check/cross-document-disagreement-findings.md`.
- Committed cards and tests for supersession fire: `tests/supersession.test.mjs`, `tests/stage3-conflict-precedence.test.mjs`; live F18 `scripts/diagnostic/delivery-check/live-2026-09-10-f18-review.json`; grep of committed `*.json` for nonempty `supersededSourceNotes`.
- Database: `.env.local` has `DATABASE_URL` set. A read-only `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'` was attempted and failed with password authentication error. No rows were read or written. Live catalog is unknown; answers below are from schema and migrations.

---

## Part 0. Claims from Claude, not from code

### C1  BLOCKING. `review_state` vs the decisions table

**Both halves are true. The decisions table does not exist. The rest of this diagnostic is written on that fact.**

**Half 1 — `review_state` is one JSON blob per review, overwritten on every save.** Confirmed.

- Migration `001_review_state.sql`: `review_id text PK`, `owner_key text not null`, `state jsonb not null`, `created_at`, `updated_at`. Index `(owner_key, updated_at desc)`.
- Save (`lib/db/review-state.mjs`): `INSERT ... ON CONFLICT (review_id) DO UPDATE SET state = excluded.state, updated_at = now()`. The whole blob is replaced. Cap `MAX_STATE_BYTES = 4MB`.
- API: `GET` / `POST` / `DELETE /api/review-state`. Owner is the `x-owner-key` header. Architecture §9: `owner_key` is “not authentication.”
- The only other table in migrations is `model_fingerprint_log` (`002_model_fingerprint_log.sql`). Unrelated append-only observability log.

ARCHITECTURE §9, in those words: “`review_state` is an autosave buffer, not an audit record… The table does not store finding decisions, accept or reject markers, or any other reviewer decision. Those arrive later with B9 as append-only event rows in their own table.”

**Half 2 — reviewer decisions were specified as a separate append-only table, scoped as the per-finding accept/reject/modify item, and have not been built.** Confirmed.

- B9 (`docs/BACKLOG.md`, `docs/ROADMAP.md`): unblocked-but-not-built. Needs append-only finding-decision event rows in a **separate** table. Pr17 shipped per-change accept/reject/modify **in the UI**; that does not close B9.
- No migration, no schema sketch, no API route, no test names that table. Repo-wide `create table` hits only the two files above.
- Pr17 `actionDecisions` live in React `useState({})` in `StatementAnalysisPanel.jsx` and are reset when the action list refetches. They are not in `REVIEW_STATE_SNAPSHOT_FIELDS` (frontend test asserts `actionDecisions` and `actionListEntries` are excluded). Apply POSTs them once to `/api/revise-actions-apply` as `body.decisions`. That is a one-shot apply payload, not a store.

If that table later appears, this diagnostic’s RANK changes. It has not.

### C2  CHECK. What is held per source

**Raw files are not stored as a server-side source library. Source metadata and, when present, extracted text are held inside the `review_state` blob. PDF/Office bytes are not.**

Snapshot allow-list (`SOURCE_SNAPSHOT_FIELDS` in `src/utils/reviewStateSnapshot.js`):

| Field | In autosave blob? |
|---|---|
| `id` | yes |
| `name` | yes |
| `mimeType` | yes |
| `type` | yes |
| `text` | yes, if already on the object |
| `publicationState` | yes |
| `publicationStateSource` | yes |
| `description` | yes |
| `contentBase64` | **no** |
| `url` / `kind` / File / Blob | **no** |

On restore (`applyPersistedSnapshot`), any `contentBase64` that slipped through is **deleted**. Text uploads persist `text`. Office/PDF bytes do not survive refresh unless extracted `text` was already on the upload object (it is not copied back after Review). After a Review, extracted text also sits nested in `analysisResult.sources[].text` (the whole `analysisResult` object is snapshotted). That nested copy is the last run’s response, not a source store, and is not what `toSourcePayload` sends on the next Review.

ARCHITECTURE / ROADMAP: no client source files are stored; blob storage was deferred (Pr14). That matches the snapshot allow-list.

### C3  CHECK. Supersession did not fire on the live example

**Confirmed from code and from `cross-document-disagreement-findings.md`.**

`resolveSupersession` (`lib/qc/supersession.mjs`) requires, among other gates:

1. At least two source matches.
2. A covering set of matches that are confidently dated **and** have an as-of from `asOfBySourceIndex` (built by `extractSourceAsOfDate` on source **text**, first ~15 non-empty lines, structural header cues: `Date:`, `Dated:`, `As of`, `As at`, etc.).
3. Figures that overlap the claim (`figuresAgree` not null). If the claim names a period, the source period token must match that period to enter the covering set.
4. The **newest** covering source **agrees with the draft**. If it does not, the function returns empty. The conflict stands.
5. An older `conflicting` match may be demoted only when it is strictly older, **different period**, and disagrees on the figure. Same-period restatement is not supersession.

Live F18 (diagnostic 1): both documents carry `Date:` headers (15 April 2025 vs 28 May 2025), so dates were available. `supersededSourceNotes` is `[]` on all ten cards. It did not fire because the draft matches the **older** memo. Condition 4 failed. The update is treated as a contradiction, not as an authority.

---

## Q1  Is there a durable piece of work, or only runs

**There is no identity beyond a single browser’s local key. That is the load-bearing answer.**

What identifies a review row today: `review_id` (primary key) plus `owner_key`. Both are minted in the browser with `crypto.randomUUID()` (`src/utils/reviewSession.js`), stored in **localStorage** as `blce.reviewId` and `blce.ownerKey`, and sent on `/api/review-state` (`reviewId` in the body/query, `x-owner-key` header). They are **browser-generated**. They are not derived from draft or source content. The server does not mint a work id. There are no user accounts.

What creates a new row: first save with a new `review_id`. **New output** on `/assess` calls `startNewReview()` (new UUID, best-effort `DELETE` of the old row) and reloads. A 403 `owner_mismatch` on restore also calls `startNewReview()`.

Live product persistence is only Assess (`useAssessState` → `useReviewStatePersistence`). `useDraftState` does not persist to `review_state`.

| Case | Same identity? | Key | Kind |
|---|---|---|---|
| **(a)** Press Review a second time, same draft and sources | Yes, the **row**. No, the **run**. | `review_id` unchanged. New `analysisRunId` (`assess_analysis_${Date.now()}_…`). `analysisResult` / `statementRows` overwritten in the same blob. | Browser UUID + client run id |
| **(b)** Edit the draft and press Review again | Same `review_id`. New draft version appended inside the same blob (`assess_v_${Date.now()}_…`). Analysis overwritten. | Same | Browser UUID |
| **(c)** Close the browser and return later, **same browser** | Survives if localStorage still holds `blce.reviewId` / `blce.ownerKey` and the DB row still exists. Restore loads the blob. | localStorage UUID | Browser-generated |
| **(d)** Open the same work in a **different browser** | **No.** New `ownerKey` and `reviewId`. Cannot load the other browser’s row (403 → `startNewReview()`). | None shared | — |

A second Review is a new run (`analysisRunId`), not a new piece of work. There is no server-generated work id, no account, no content-derived id. “This piece of work” today means “this browser’s current autosave cookie.” Clearing localStorage, New output, or another device is a different piece of work even if the files are the same.

That decides the rest: a ruling keyed on `review_id` as it exists today is keyed on a browser-local autosave cookie, not on a piece of work the product can name.

---

## Q2  Draft versions

Draft version history lives **inside the same `review_state.state` blob**, fields `versions[]` and `selectedVersionId`. Creating a version does **not** create a new review row.

Identity of a version: `id: assess_v_${Date.now()}_${random}` plus a monotonic `versionNumber`. Client-generated. `captureAssessVersion` appends. Review (`qc-run`) also appends a version of the analysed draft text.

A hard-coded `versionIdRef = "assess-session-v1"` is sent on the Review request as `versionId`. The analyse-statements handler does not read it. It is not a version identity.

Would a ruling attached to the review survive a new draft version? **Yes, if it were stored on the `review_id` row** — same blob, same row. It would **not** be version-scoped unless you added that. It would be **orphaned** by New output / a new `review_id`. It would also be **invisible to the next action list** unless posted again: `analysisByVersionId` and Pr17 `actionDecisions` are not in the snapshot; Review results on the blob are one current run, overwritten on the next Review.

---

## Q3  Source identity across runs

### Fields per source

| Field | Autosave snapshot | Review request (`toSourcePayload`) | Stable across a re-run of Review? |
|---|---|---|---|
| Frontend `id` (`assess_src_${Date.now()}_${random}`) | yes | yes | Yes **if the same in-memory / restored object**. New upload = new random id. Not a content hash. |
| `name` / `title` | yes | yes | User-editable; not identity. |
| `text` | yes if already extracted on the upload object | yes for text sources | Yes for text files in the same session. PDFs: see `contentBase64`. |
| `contentBase64` | **no** | yes while still in session memory | Lost on restore. Re-Review after refresh cannot resend Office/PDF bytes from the snapshot. |
| `mimeType` / `type` | yes | sometimes | Not identity. |
| `kind` | no (`"file"` is added at request time) | yes | Not identity. |
| `publicationState` (+ `publicationStateSource` / `description`) | yes | `publicationState` only | Not identity. |
| Pipeline `sourceIndex` / `supportSpans.sourceRefId` | not stored as such; implied by array order | **upload/kept array order** | **Shifts** if a source is removed, or dropped after extraction, anywhere before it. |
| Response `sources[].id` | nested inside `analysisResult` after a Review | copied through `resolveId`; **inert to the pipeline** | Same as frontend `id` for that run. Pipeline does not key on it. |

`lib/draft-hash.js` hashes the **draft** (8-char sha256 prefix, observability). It does not hash sources.

### Can anything identify “the same document” across two runs?

**Not as a content identity.** The only stable handle today is “the same frontend `id` still sitting in this browser’s snapshot.” That fails on re-upload of the same file, on another browser, and on PDF restore (bytes gone; `id` may remain on a hollow object that cannot be re-reviewed).

A hash of extracted source text is **available in principle** at both save time and Review time when `text` is present (snapshot `sources[].text` for text uploads; `prepareUploadedSourcesForPipeline` → `.text` at Review). It is **not computed or stored** at either boundary. For a PDF that has never been reviewed, save time has no extracted text. After a Review, extracted text lives on `analysisResult.sources[].text`, which is a nested copy of the last response, not a field the next Review request is built from.

### Ordering and silent shift

Uploads **append**. Remove is `filter` by `id`. There is no reorder UI. Adding a third source at the end does **not** change indices 0 and 1. Removing a middle source, or dropping a middle source after extraction (empty text / `unsupported_scanned`), **compacts** the kept array. Later `sourceRefId`s **do shift**. The test `tests/r7-b46-response-sources.test.mjs` states this in those words: “C was upload index 2 but becomes sourceRefId / sources index 1 after the middle drop.” Frontend `id` on remaining objects does not change; the integer the pipeline and locator use does.

Replacing a file is remove-by-id then append: new `assess_src_…` id, typically at the end. A ruling keyed on `sourceIndex` would silently point at the wrong document if anything earlier in the list disappeared. A ruling keyed on frontend `id` would invalidate on replace (desired) and would survive an append (desired), and would **not** survive re-upload of the same bytes under a new id.

---

## Q4  The decisions table

**It is not designed anywhere beyond being named.** B9 / ARCHITECTURE §9 name “append-only finding-decision event rows in a separate table.” There is no migration, schema sketch, API route, or test. Pr17 is in-memory UI state plus a one-shot apply POST. Pr13 (approved-text library) is a different unbuilt store, also explicitly not this.

**Minimum table and route, not built.** To hold `{piece of work, source A, source B, which governs, when, by whom}`:

- Table (append-only): `id` (bigserial), `work_id` (today that would be `review_id`, which Q1 already said is the wrong kind of identity), `source_a` and `source_b` as **stable ids or content hashes — not `sourceIndex`**, `governs` (`a` | `b`), `created_at`, `actor` (today only `owner_key`; there are no user accounts). Invalidate by **inserting a superseding row** (or by failing to match when either source hash disappears). Do not `UPDATE`.
- Route: something that can write that row and later list the live ruling for a work. `/api/review-state` is the wrong shape (overwrite blob, no event history). `/api/revise-actions-apply` is the wrong grain (per action-list entry, after the list exists).

**Two tables (or two row kinds), not one.** B9/Pr17 is per-**finding** accept/reject/modify on an action-list **entry id**. That grain is statement-scoped and dies when the list is rebuilt (the UI already resets `actionDecisions` on refetch). A governance ruling is per **source pair × piece of work**. It must survive Review re-run and draft edit, must not be wiped when findings are regenerated, and is invalidated by source replacement rather than by a new action-list id. Sharing one physical event-log with a `kind` discriminator is a storage convenience; sharing B9’s **meaning** would mix “I accepted this proposal on this sentence this run” with “in this work, document A governs document B.” They should not be the same item.

---

## Q5  Can a stored ruling even reach the proposal layer

**The action-list path is a stateless function with no database access. A stored ruling would have to be passed in with the request. Nothing of that shape crosses the boundary today.**

### Trace

1. Assess Review → `POST /api/analyse-statements` `{ draftText, sources, selectedTypes, versionType, versionId, evidence/editorial/compliance flags, optional bannedWords }`. No `reviewId`. No `owner_key`. Handler prepares sources, splits kept/dropped, calls `runPipelineV4`. **No `lib/db` import.** Supersession runs here from scraped dates. Cards come back with `supportSpans`, `sourceIndex` / `sourceRefId`, optional empty `supersededSourceNotes`.
2. `StatementAnalysisPanel` effect, once `analysisStatus === "done"` → `apiReviseActions({ statements: stmts })` only. No `reviewId`, no owner key, no sources, no rulings. CORS allow-headers on that route are `Content-Type, x-brightline-diag` — not `x-owner-key`.
3. `api/revise-actions.js` → `runActionList(statements, { authoringOrganisation, draftText })`. `runActionList` / `fillAction` / `applyConflictProposal` are functions over the posted cards. They do not import `lib/db`. Contradicted evidence findings never call the rewrite model; `applyConflictProposal` pairs the statement against the painted excerpt and `card.supportSpans`. R1 is same-`sourceRefId` only.

### Request boundary

A ruling that should change the **proposal** (B173: acknowledge, propose nothing, name both figures) must enter **`POST /api/revise-actions`** in the body, or `runActionList` must grow a database read it does not have.

A ruling that should change the **badge** (drive supersession: green the card / demote a source) must enter **`POST /api/analyse-statements`** → `runPipelineV4` / `resolveSupersession`. That is a second, earlier boundary. Also no database.

**What already crosses those boundaries that looks adjacent:**

| Crossing | Shape | Is it a ruling? |
|---|---|---|
| `sources[].id` on analyse-statements | frontend random id, inert to the pipeline | No. Pipeline keys `sourceIndex`. |
| `qcCard.supportSpans` on revise-actions | `sourceRefId`, classification, passage, offsets | No. Evidence from this run, not a person choosing a document. |
| `authoringOrganisation` on revise-actions | optional string | No. House name, unused by conflict locator. |
| `decisions` on `/api/revise-actions-apply` | per action-list entry, after the list exists | No. Cannot feed the locator. Different call, later. |
| `review_state` POST | the autosave blob | Never read by analyse-statements or revise-actions. |

Storing a row in a new table does nothing for this feature until one of those two POSTs carries the ruling (or the route starts reading the database). Diagnostic 1 placed B173 on the **proposal** card, not on Stage 3. The locator boundary is the one that matters for “acknowledge and say the sources disagree.” Supersession is the one that matters for greening the badge.

---

## Q6  The supersession mechanism, in detail

### Conditions (code, not comments)

`resolveSupersession` in `lib/qc/supersession.mjs`. Module header: authoritative figure = newest-dated covering source; draft must match that figure or nothing changes; strictly older **different-period** disagreements may be demoted; same-period disagreement is not supersession; confident-dates-only; no LLM.

Operationally:

1. `< 2` matches → empty.
2. Covering set: `isConfidentlyDated` **and** `asOfOf(asOfBySourceIndex, sourceIndex)` present. The covering loop requires the as-of map entry, which comes from `extractSourceAsOfDate(source.text)` (header cues in the first ~15 non-empty lines). A Stage 2 `periodAssessment` without a header date does **not** get a match into the covering set.
3. `figuresAgree` must not be null (overlapping percent/money/count). If the claim has a period token, the source period must equal it to cover.
4. Sort covering by as-of. Newest must `agree === true` with the draft. Else empty.
5. Demote older `conflicting` matches that are confidently dated, strictly older as-of, different period when a claim period exists, and whose overlapping figure disagrees.
6. If anything was demoted: verdict override = confirmed if any remaining confirmed, else remaining conflict / partial / not_supported.

### Where it is called

- After intra-source reduce + Stage 3 in `lib/qc/pipeline-v4/index.mjs` (`resolveSupersession` on reduced matches). On hit: sets `originalClassification`, `classification = "superseded"` on demoted matches, then re-aggregates and **overwrites** verdict with `verdictOverride`.
- Again per claim-span via `applySupersessionToClaimMatches` in the same file.
- Writes `supersededSourceNotes` onto the assembly entry; `assembleCard` copies the array onto `qcCard.supersededSourceNotes`.

### What it writes onto the card, and what the frontend renders

On fire: `supersededSourceNotes` is an array of strings of the form “An older source (label, date) reports X for period. The current figure of Y (period) is more recent.” Demoted matches are classified `"superseded"` in memory. Frontend grep for `supersededSourceNotes`: **no matches**. Delivery-check `findings.md` already labelled the field COMPUTED BUT NEVER SHOWN. Source recency (`sourceRecencyConcerns`) is a different detector and **is** rendered; it is not this mechanism.

### What would have to change for a stated ruling to drive it in place of a scraped date

`asOfBySourceIndex` / `extractSourceAsOfDate` would stop being the authority signal. `resolveSupersession` (or a sibling) would need an explicit `{sourceA, sourceB, governs}` keyed by something other than `sourceIndex`, passed in through **`POST /api/analyse-statements`**. Date extraction, “newest agrees with the draft,” and “different period” are the current gates; they would be replaced or bypassed.

**Conditions that still make sense when the signal is a person’s answer, not a date:**

- Scope to this piece of work; do not rank the documents globally.
- Pair identity that survives adding a third source and dies if either source is replaced.
- “Draft must match the governing source or the badge stays conflicting” still makes sense: the person named who governs; if the draft already follows that source, demote the other conflict; if the draft follows the other source, keep the conflict so the proposal layer can offer the swap or (B173) refuse to propose and explain. That is the existing “nothing changes unless the draft already matches authority” idea, with authority chosen by a person.

**Conditions that do not still make sense:**

- Confident header dates on every covering source.
- Newest-by-calendar.
- Different-period-only demotion. Same-period restatement is exactly the F18 shape. The person’s answer is the substitute for period+date. Keeping the period gate would refuse the ruling on the live example.

Diagnostic 1 put B173 on the locator, not Stage 3: the badge is already `conflicting`, and the required behaviour is acknowledge / name both figures / propose nothing. Driving supersession would **remove** the evidence finding when the draft already matches the chosen source. That is a different product: “this document governs, so the card goes green.” Say that when the feature is scoped; do not assume the ruling belongs in `resolveSupersession`.

### Where it has actually fired in committed artifacts

**It has never fired outside a unit test.**

- `tests/supersession.test.mjs`, `tests/stage3-conflict-precedence.test.mjs`, and a reducer test inject an `asOfBySourceIndex` map and assert nonempty `supersededNotes`. Those are unit tests. They do not run the pipeline on live sources.
- Committed Review JSON grepped for a nonempty `supersededSourceNotes` array: **no matches**. Live F18: empty on 10/10 cards. Other committed review dumps (`scripts/diagnostic/revise/*.json`, `eval-ablation/*-production-verify.json`) are empty arrays.
- Fixture texts exist at `scripts/diagnostic/supersession/` (annual report 2019 / FY2024 / fund update 2026). They are inputs for the unit mechanism, not a stored production fire.
- Frontend has never rendered a note, so a fire would still have been invisible to a reviewer.

---

## RANK

**The ruling cannot be stored and read today as specified. The decisions table has to be built first — but that is not sufficient, and it is not the smallest missing thing.**

`review_state` is the wrong shape: one overwrite blob, not append-only, not pair-scoped, not a reviewer-decision store (ARCHITECTURE §9 forbids it). The B9 table does not exist. Stuffing a ruling into the blob would survive refresh and draft versions **in one browser**, die on New output, fail in another browser, overwrite on every save, and still never reach `runActionList` unless also POSTed.

**The single smallest thing that has to exist before this feature can be built is a durable piece-of-work identity that is not a browser localStorage UUID**, plus a source-pair identity that is not `sourceIndex`. Without those, there is nothing to hang “this work, these two documents” on. Today `review_id` is a browser-generated autosave cookie; source `id` is a random client string; the pipeline keys array order.

That identity is **not** scoped in the backlog as its own item. B9 is the nearest named store: append-only **finding-decision** events, unblocked-but-not-built. Adjacent, **wrong grain**. B173 names the reviewer-facing behaviour (acknowledge, propose nothing, say the sources disagree) and does not name persistence. User accounts, which architecture says would replace `owner_key`, do not exist.

Even after a table exists, the ruling still has to cross `POST /api/revise-actions` (proposal) and/or `POST /api/analyse-statements` (badge). Nothing of that shape crosses either boundary today. A table nobody reads at those routes does not implement the feature.
