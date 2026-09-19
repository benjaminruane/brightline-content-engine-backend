# B244 / B245 delivery report

Date: 2026-09-19. Ids used: **B244** (replay path), **B245** (end-to-end assertions). Last filed before this spec was B243.

**Scoreboard: 20 of 87.**

No Review. No model call. Browser skipped: this is instrument. Default results-screen strings are unchanged. The editorial-off export path is asserted in tests, not walked in the browser.

---

## Part 0B D1 to D9

**D1 AMEND.** Claude wanted an HTTP intercept so the real frontend runs from the response onward. That is how the app works in `import.meta.env.DEV` when `sessionStorage.ce.replayAnalyse` is set: `apiAnalyseStatements` fetches `/ce-dev/replay/analyse-statements` and then `stampReplayed` + `ingestAnalyseStatementsResponse` (CONFIRMED `src/utils/api.js`, `src/utils/analysisReplayGuard.js`). Tests cannot mount React. Vitest is node. Playwright is in neither repo (CONFIRMED frontend `package.json` has vitest only). Tests therefore call `ingestAnalyseStatementsResponse` and the same display helpers the UI already calls. What that stops: layout, click paths, toasts, drawers as mounted components. What it still covers: every string those helpers emit from the recorded payload.

**D2 AGREE.** Vite plugin `apply: "serve"` (CONFIRMED `vite-plugins/reviewReplayPlugin.js`). Intercept is behind `import.meta.env.DEV` and a dynamic import. Production `vite build` does not register the plugin. `meta.replayed` makes `analysisBlocksPersistence` true, so `useReviewStatePersistence` returns without writing `review_state`, and Assess skips synthesize-review. Tested in `tests/b244-replay-path.test.mjs`.

**D3 AGREE, with two limits.** (a) results-screen strings from `collectResultsScreenClaims`. (b) exported file as canonical UTF-8 text, not PDF bytes (pdfkit object ids are not stable). (c) payloads to the assessment writer, constructive-feedback margin notes, and the revise-action list, not the prose a model would return. Claude is right that (c) is the honest limit.

**D4 AMEND.** One committed file `tests/fixtures/b245/meridian-2026-09-18.export.txt`, compared byte for byte. Re-bless is deliberate: `UPDATE_EXPORT_GOLDEN=meridian-2026-09-18`. Setting it to `1` does nothing. Then commit the new file as its own decision. See `tests/fixtures/b245/README.md`.

**D5 AGREE.** All three corruptions move the happy-path assertions (output below). Dedicated tests then encode the honest result. Finding kept: flipping `editorialEnabled` does not rewrite the stamped QRS, so the file still contains `1 claim has editorial notes.` after D5.ii. Statement-review editorial notes are omitted. Do not weaken the corruption.

**D6** 20 of 87. Table in `claims-inventory.md` Part 3. Remaining grouped below.

**D7 CONFIRM.** Still untested: the prose models actually write (reviewer assessment, constructive feedback body), and any draft text from rewrite, generate, apply, or adapt. A second phase would need recorded model responses for those writers, then the same replay ingest. Not built.

**D8** Frontend B244+B245 wall-clock **0.82s** (15 tests). Backend B245 **0.72s** (8 tests). It belongs in `verify:ship`. It already runs there via `npm test`.

**D9 AMEND, did not stop.** Stage 1 and the Stage 2 prompt were not touched. Production `api/export.js` now calls `buildReviewData(qcResult, qcResult?.meta?.reviewOptions)` and omits editorial/compliance notes when that check is off. Required by D5.ii. All-on path on this fixture is unchanged (golden). **B234** stays open: the file now omits the line rather than printing `Not reviewed`.

---

## C1 to C4

**C1 BLOCKING CONFIRMED** (`docs` inventory limitation; `src/utils/reviewStateSnapshot.js` vs analyse-statements shape). A stored analyse-statements payload could not be loaded into local Assess as `review_state`. B244 removes that for dev/test only.

**C2 CHECK CONFIRMED** `tests/fixtures/b226/1-meridian-reporting-live-2026-09-18.json`: `ok: true`, 7 statements, sources, `meta.reviewSummary`, `meta.reviewOptions`. Single shared fixture. Not forked.

**C3 CHECK CONFIRMED.** Frontend: vitest node, no jsdom, no Playwright, no RTL. Rendering in tests is by calling the same helpers the components call. Backend: vitest. Playwright is in neither `package.json`.

**C4 CHECK CONFIRMED.** Export statement-review rows are `buildReviewData` with no model call. Canonical text is `renderCanonicalExportText`. Golden comparison is deterministic.

---

## The three corruptions, each failing, with output

Happy-path assertions run against one corruption at a time. Each failed. Dedicated tests then encode the honest result.

### i unrecognised displayVerdict slug

Frontend happy-path badge list:

```
FAIL  D5.i happy-path badge list on unknown slug
Expected values to be strictly equal:
+ actual - expected
+ 'Unverifiable'
- 'Partially confirmed'
```

Backend golden:

```
FAIL  D5.i golden still matches after unknown slug
+   'Verdict: Unverifiable (moderate concern)\n' +
-   'Verdict: Partially confirmed (moderate concern)\n' +
```

Nothing rendered it as Confirmed. Dedicated tests pass on Unverifiable (B232 already shipped).

### ii editorial turned off

Frontend:

```
FAIL  D5.ii happy-path editorial label with editorial off
Expected values to be strictly equal:
+ actual - expected
+ 'Not reviewed'
- '1 concern'
```

Backend, before honouring `reviewOptions` on notes:

```
FAIL  tests/b245-export-and-payloads.test.mjs > B245 corruptions > ii editorialEnabled false does not describe editorial as checked
AssertionError: Expected values to be strictly equal:
true !== false
- Expected
+ Received
- false
+ true
 ❯ tests/b245-export-and-payloads.test.mjs:129:12
    assert.equal(flipped.includes(EDITORIAL_NOTE_FRAGMENT), false);
```

After the export helper omits notes when editorial is off, the dedicated test passes. Happy-path golden vs flipped still fails (editorial lines removed). Finding: QRS line `1 claim has editorial notes.` is stamped on the payload and still present.

### iii empty editorial note

Frontend:

```
FAIL  D5.iii happy-path assessment still builds with empty note
Expected values to be strictly equal:
false !== true
```

Dedicated test: `buildReviewerSynthesisPayload` returns null (B227). Backend guard `synthesisPayloadHasBlankFinding` is true. Margin notes drop the empty editorial card note:

```
FAIL  D5.iii margin notes still include first-person after empty note
Expected values to be strictly equal:
false !== true
```

---

## N of 87, and what remains grouped by reason

**20 of 87 yes:** C3, C4, C6, C12, C13, C14, C16, C19, C21, C30, C31, C32, C33, C36, C38, C39, C43, C63, C67, C81.

**Needs a recorded model response (second phase):** C37 reviewer assessment paragraph; C40 constructive feedback body; C56 generate; C57 rewrite; C61 adapt; C50 methodology note; C87 house name inside generated/rewritten draft; C73 toasts for those actions.

**Needs after-review UI state this fixture does not have** (ruling, accept, proposals, history, stale draft, excluded sources, skipped evidence, Ready, Not checked > 0): C5, C9, C11, C22, C23, C24, C27, C28, C34, C35, C41, C42, C44, C48, C49, C51, C52, C58, C59, C60, C62, C64, C65, C66, C68, C69, C74, C75, C82, C83, C84.

**Empty Assess, settings, header identity, toasts, errors, Writing-only:** C1, C2, C15, C17, C18, C20, C25, C45, C46, C47, C53, C54, C55, C70, C71, C72, C76, C77, C78, C79, C80, C86.

**Export PDF/DOCX chrome not in the canonical text golden:** C7 header words/chars/time; C8 modal checkboxes; C10 deal dates; C26 section checkboxes; C29 file type; C85 Output type / Required version / Version.

---

## Suite wall-clock and verify:ship

Frontend B244+B245: real 0.82s, 15 tests. Backend B245: real 0.72s, 8 tests. Put it in verify:ship. It already is, via `npm test`.

SHIP VERIFIED lines:

```
SHIP VERIFIED  7302ece  main  32 files  194 tests
SHIP VERIFIED  64cc94d  main  94 files  1235 tests
```

---

## Every new test failing then passing

**B244** (already shipped `f22e96c`): fail-first was missing `analysisReplayGuard.js`. Then 10 tests green.

**B245 frontend** `tests/b245-results-screen-claims.test.mjs`: 5 tests. Happy path and dedicated D5 i/iii/ii were green once the collector existed (D5.ii screen labels already honour `reviewOptions`). Vacuous-proof run against corruptions failed as above, which is the point.

**B245 backend** `tests/b245-export-and-payloads.test.mjs`:

```
❯ tests/b245-export-and-payloads.test.mjs (8 tests | 3 failed) 9ms
   × canonical export matches the committed golden file
     → missing golden at .../tests/fixtures/b245/meridian-2026-09-18.export.txt
   × re-blessing the golden requires the fixture token, not 1
   × ii editorialEnabled false does not describe editorial as checked
```

Golden then written with `UPDATE_EXPORT_GOLDEN=meridian-2026-09-18`. Re-bless assertion fixed so it does not match its own `"1"` string. D5.ii production helper omits notes when the check is off. Then 8 passed.

---

## New files

Frontend: `src/utils/analysisReplayGuard.js`, `src/dev/reviewReplay.js`, `vite-plugins/reviewReplayPlugin.js` (B244); `src/utils/resultsScreenClaims.js`, `src/utils/sourceRelationPrefix.js`, `tests/b245-results-screen-claims.test.mjs`, `tests/helpers/loadMeridianLiveFixture.mjs` (B244 helper).

Backend: `tests/helpers/loadMeridianLiveFixture.mjs`, `tests/b245-export-and-payloads.test.mjs`, `tests/fixtures/b245/meridian-2026-09-18.export.txt`, `tests/fixtures/b245/README.md`. `lib/qc/export-review-data.mjs` gained `buildReviewData` / `renderCanonicalExportText`. `api/export.js` uses the shared builder.

---

## Disagreements

1. Tests do not mount React. HTTP intercept is real in DEV; the assertion row calls the post-fetch writers. That is the cheapest honest limit given no Playwright.
2. Golden is canonical UTF-8, not PDF bytes.
3. D5.ii QRS still names editorial notes from the stamped summary. Reported, not weakened.
4. Honouring `reviewOptions` in export is a production path for checks that were off. Stage 1 / Stage 2 were not touched. B234 stays open.
5. `formatRelationLine` still uses the original curly quotes from SourceReaderPanel. New copy in this spec is ASCII.
