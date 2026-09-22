# B318. Extract-at-upload groundwork

Read-only. Facts from code. No recommendations. Date 2026-09-22. Ids: this file is B318; the structure flag that shipped in the same spec is B317.

---

## G1. What the frontend holds today for an uploaded source

From add to Review POST, Assess is the live path.

**Shape on add (PDF / Office).** `useAssessState.jsx` L1013-1021:

- `id` (`assess_src_${Date.now()}_${random}`)
- `name` (file.name)
- `mimeType`
- `contentBase64`
- `type`: `"file"`
- `publicationState`: `"unknown"`
- `publicationStateSource`: `"auto"`

There is no `text` field on that object. Extracted bytes of the PDF are not stored on the source.

**Shape on add (plain text).** Same file L1027-1035: `id`, `name`, `mimeType`, `text`, `type`, `publicationState`, `publicationStateSource`. No `contentBase64`.

**Draft path (same product, `/writing` style hook).** `useDraftState.jsx` L421-431 (Office) and L437-446 (text). Office object also has `kind: "file"`, `url: null`. Still no extracted PDF text.

**Base64 is retained** on the in-memory `sources` array from add until the source is removed, the tab is cleared, or a persist restore runs. It is sent on Review: `toSourcePayload` `useAssessState.jsx` L126-136 copies `contentBase64` and omits `text` for office binaries. Review POST `useAssessState.jsx` L1127-1132 `sources: sources.map(toSourcePayload)`. Same mapping on generate L589.

**It is not retained across refresh.** Autosave snapshot fields for a source are `id`, `name`, `mimeType`, `type`, `text`, `publicationState`, `publicationStateSource`, `description` (`reviewStateSnapshot.js` `SOURCE_SNAPSHOT_FIELDS` L25-34). `contentBase64` is not in that list. Restore also deletes it if present (`useAssessState.jsx` `applyPersistedSnapshot` L367-372). After restore, `sourceNeedsReupload` is true (`officeSourceFormat.js` L70-72) and the Review button is blocked (`AssessModule.jsx` L248-254, L641-652). Pill copy: "Re-upload to run again" (`AssessModule.jsx` L391-394).

There is no TTL. Duration is: in-memory for the life of that `sources` entry in the tab; never in `review_state`.

---

## G2. What summarize-source returns and what the frontend stores

**Returns** (`api/summarize-source.js` L152): `{ ok: true, description, publicationState }`. Empty path is `{ ok: true, description: "", publicationState: "unknown" }` (L7, L120, L124, L154).

For `mimeType === "application/pdf"` it runs `prepareUploadedSourcesForPipeline` (L108-117), takes `prep.sources[0].text`, requires length >= 50 (L118-121), then uses `extractedText.slice(0, 2000)` as `llmInput` (L122). The extracted text is not in the JSON response.

**Frontend stores** from that response: `description` and `publicationState` only.

- Call: `apiSummarizeSource` (`src/utils/api.js` L142-158) reads `data.description` and `data.publicationState`. It does not return or keep `ok`.
- Patch: `applySourceSummaryPatch` (`src/utils/applySourceSummaryPatch.mjs` L7-20) writes `description`, and writes `publicationState` unless `publicationStateSource === "manual"`.
- Assess apply: `useAssessState.jsx` L981-991 `patchSourceSummary(sourceId, { description, publicationState })`.
- Draft apply: `useDraftState.jsx` L389-399, same two fields.

The 2,000-character extract used for the summary is discarded on the server. It is not written onto the source object.

---

## G3. Every place the Review path assumes contentBase64 rather than text

1. **Frontend payload omits text for PDF/Office.** `toSourcePayload` `useAssessState.jsx` L126-136: if `isOfficeBinarySource`, the body is `id`, `kind`, `name`, `title`, `contentBase64`, `mimeType`, `publicationState`. No `text`. Draft equivalent `sourcePayloadItem` `useDraftState.jsx` L531-540.

2. **Frontend Review is blocked without bytes.** `sourceNeedsReupload` `officeSourceFormat.js` L70-72: office/PDF and missing/empty `contentBase64`. `AssessModule.jsx` L248-254 `canAssess` is false; L641-652 Review click toasts "Re-upload PDF or Office files to run again." Protects against posting a restored source that has a name but no file bytes.

3. **Client body budget counts base64, not extract text, for binaries.** `sourceRequestBudget.js` L101-102 `rawBytesFromBase64(source.contentBase64)`; L116-117 encoded length. `wouldExceedBudget` is called before generate (`useAssessState.jsx` L569) and before summarize (`L979`). Protects against a CORS-masked 4.5 MB Vercel 413 (`sourceRequestBudget.js` L13-14 `MAX_REQUEST_BYTES = 4_200_000`).

4. **`PDF_INLINE_TEXT_NOT_ALLOWED` when name looks like a PDF and there is inline text and no `contentBase64`.** `isPdfSource` `lib/extract-text-from-source.mjs` L425-429: name/title/filename ends `.pdf` or `mimeType === "application/pdf"`. Then `prepareUploadedSourcesForPipeline` L581-614: `hasText && !hasContent && isPdf` returns that code (L606-614). Protects against a PDF presented as already-extracted text instead of raw file bytes. Second site of the same code: L585-592 when the inline string starts `%PDF-` (`looksLikeRawPdfBytes` L437-439), even if the name is not `.pdf`. Protects against raw PDF bytes stuffed into `text`.

5. **`OFFICE_INLINE_TEXT_NOT_ALLOWED`.** Same function L595-603 when `looksLikeOfficeZipBytes` (L448-454: `PK` signature or `[Content_Types].xml` in `text`). Protects against docx/pptx/xlsx bytes in the text field.

6. **Buffer path requires `contentBase64`.** L577 `hasContent` is a non-empty `contentBase64` string. L647-654 `Buffer.from(s.contentBase64, "base64")`; invalid decode is `invalid_base64`. L657-664 `file_too_large` against `DEFAULT_MAX_FILE_SIZE_BYTES` 25 MB (L32). L669-676 `pdf_too_large` against `MAX_PDF_BYTES` (L34-37, default 10 MB). These only run when bytes were sent. They protect against oversized or undecodable uploads, not against missing text.

7. **Review handler does not accept a pre-extracted PDF text substitute.** `api/analyse-statements.js` L172 `prepareUploadedSourcesForPipeline(candidateSources)`. On `prep.error` it does not abort; it maps missing rows to empty `text` (L173-184), then `splitSourcesForResponse` drops them (`lib/response-sources.mjs` L33-41). A PDF_INLINE_TEXT_NOT_ALLOWED source becomes `empty_after_extraction` in the response, not a used extract.

`computeGuardrailForSource` (`extract-text-from-source.mjs` L491) is not called by `analyse-statements.js`. It is not a Review-path gate. Scanned drop uses `extraction.status` from the text convert (`response-sources.mjs` L13-14), not `contentBase64`.

---

## G4. What would have to travel with extracted text for those guards to be satisfied honestly

From what the guards actually check, not from a design:

- **`contentBase64`**, non-empty string. L577, L647. This is the only identifier of the file bytes in today's code. There is no SHA, etag, or content hash on the source object in either repo.
- **`mimeType`.** `isPdfSource` L428; `detectFileType` L667; frontend `isOfficeBinarySource` `officeSourceFormat.js` L40-48.
- **`name` (and `title` / `filename`).** `isPdfSource` L427 `/\.pdf$/i.test(name)`. A source whose name ends `.pdf` cannot travel as `text` without `contentBase64` without hitting L606-614.
- **`text` must not look like raw PDF or OOXML.** `looksLikeRawPdfBytes` L437-439; `looksLikeOfficeZipBytes` L448-454.
- **Decoded byte length** after base64: `rawBytesLength` is set from `buffer.length` at L735. `pdf_too_large` L669 and `file_too_large` L657 compare that length. `computeGuardrailForSource` L508 uses `rawBytesLength` with `extractedTextLength` for `extract_too_short_for_pdf_size`.
- **Frontend `sourceNeedsReupload`** still keys off `contentBase64` length (L72). A text-only office source is treated as missing the file.

Nothing in today's source object binds extracted text to a digest of the bytes it came from. The bytes themselves (`contentBase64`) are that binding.

---

## G5. Where extracted text could be stored, given what exists today

Options that exist in this codebase, with the size limits that already exist:

1. **In-memory React `sources` array.** Assess `useAssessState.jsx` L172 `useState(ASSESS_STATE_CACHE.sources)`. No coded cap besides heap. PDF sources today hold `contentBase64` here, not extract text. The Review request that would carry either is capped by the client at `MAX_REQUEST_BYTES = 4_200_000` (`sourceRequestBudget.js` L14) plus `REQUEST_JSON_OVERHEAD_BYTES = 8_192` (L22). Vercel edge rejects bodies over 4.5 MB (`vercel.json` does not set that; it is the platform body limit recorded in `sourceRequestBudget.js` L4-6). Extractor PDF cap is `MAX_PDF_MB` default 10 (`extract-text-from-source.mjs` L34-37), `DEFAULT_MAX_FILE_SIZE_BYTES` 25 MB (L32).

2. **`review_state.state` jsonb.** Schema `db/migrations/001_review_state.sql` L1-6. App cap `MAX_STATE_BYTES = 4 * 1024 * 1024` (`lib/db/review-state.mjs` L1, enforced L55-57, HTTP 413 `api/review-state.js` L116-120). Snapshot already allows a source `text` field (`reviewStateSnapshot.js` L30) and already drops `contentBase64`. Autosave debounce 2000 ms (`useReviewStatePersistence.js` L16). One row per `review_id`, overwrite on save (L67-70).

3. **`reviewer_decisions.payload` jsonb.** Schema `db/migrations/003_reviewer_decisions.sql` L1-10. App writer `buildReviewerDecisionPayload` (`lib/db/reviewer-decisions.mjs` L23-36) is labels, figures, passages, `chosenLabel`. No byte cap in that module besides Postgres jsonb. GET cap 200 rows (`LIST_LIMIT` L6). Kinds are `source_governance`, `source_override`, `applied_fix` (L1-5). This table is not a source-file store.

4. **No blob / object store.** No IndexedDB in the frontend `src/` tree. `Pr14` is the deferred blob-storage row; it is not implemented.

**`review_state` / `reviewer_decisions` usability.** Local `DATABASE_URL` failed password authentication for `neondb_owner` when probed 2026-09-22 (same class of failure as B103, 2026-08-25, and the 2026-09-21 note in `scripts/diagnostic/delivery-check/b294-card-colour.md` L49). Production is the path that has worked (B103: local only, production works). Locally that database path is not currently usable.

---

## G6. What breaks if the same file is uploaded twice, or replaced under the same name

Current behaviour. Not a fix.

**Same file uploaded twice.** `checkAddingSource` (`sourceRequestBudget.js` L237-257) checks size only, not name and not bytes. Each add creates a new `id` (`useAssessState.jsx` L1014). Both rows sit in `sources`. Review posts both (`L1132`). The pipeline extracts each `contentBase64` separately (`prepareUploadedSourcesForPipeline` sequential loop). Two sources with the same filename and the same bytes are two sources. Matcher and cards treat them as two documents. The display label is `name` (`response-sources.mjs` `resolveLabel` L44-50).

**A different file under the same name.** There is no replace-by-name. Add appends. If the user removes the old row and adds a new file that happens to share `name`, the new row has a new `id` and new `contentBase64`. Review extracts the new bytes. The UI still shows the same filename. Nothing compares the new bytes to the old bytes. After restore, the snapshot keeps `name` and drops `contentBase64` (`reviewStateSnapshot.js` L25-34). A re-upload of a different PDF with that same name is accepted as that source's bytes. The name did not change. The bytes did. There is no hash to notice.

**Name vs bytes is the honesty hazard.** `isPdfSource` keys off `.pdf` on the name (L427-429). B163 recorded sixteen Review POSTs whose source `name` ended `.pdf` while the payload was inline extract text; every source dropped as `empty_after_extraction` (`b163-ingestion-reality.md` L204). The extractor never ran on those bytes. The user-facing copy is "No readable text could be extracted."

---

## G7. The 300-second cap at upload, structure flag off

Cap is 300_000 ms: `vercel.json` `api/*.js` `maxDuration` 300; `EXTRACTION_TIMEOUT_MS` `extract-text-from-source.mjs` L40; `FUNCTION_MAX_DURATION_MS` `lib/qc/request-budget.mjs` L9. Upload today already extracts on `POST /api/summarize-source` (`api/summarize-source.js` L106-122), same Function cap.

B163 Gate 4 production times include both converts (`b163-ingestion-reality.md` L108-133). B312 convert split is in `scripts/diagnostic/extraction-check/REPORT-2026-09-21.md` L33-44. Structure-off estimate: B312 `textConvertMs` where that file is in the eleven; otherwise half of the B163 measured wall (the measurement includes the chunks convert). d13 production was killed; local wall 342563 ms is the complete two-convert measurement.

| id | file | measured ms (chunks on) | structure-off ms | still fail 300s? |
|----|------|------------------------:|-----------------:|------------------|
| d01 | 3i-press-release-fy2025.pdf | B163 prod 207727; B312 wall 205120 / text 103639 | 103639 | no |
| d02 | 3i-press-release-fy25-highlights.pdf | B163 prod 48371; B312 text 22646 | 22646 | no |
| d03 | 3i-overview-and-strategy-2025.pdf | B163 prod 174747; B312 text 80537 | 80537 | no |
| d04 | hpif-report-march-2026.pdf | B163 prod 74596; B312 text 35321 | 35321 | no |
| d05 | 3i-q1-fy25-performance-update.pdf | 54720 | 27360 | no |
| d06 | 3i-hy25-highlights.pdf | 10598 | 5299 | no |
| d07 | pg-annual-results-2025-press-release.pdf | 66804 | 33402 | no |
| d08 | berkshire-2024-shareholder-letter.pdf | 41405 | 20702 | no |
| d09 | berkshire-2023-shareholder-letter.pdf | 47882 | 23941 | no |
| d10 | berkshire-2022-shareholder-letter.pdf | 32041 | 16020 | no |
| d11 | berkshire-2021-shareholder-letter.pdf | 32234 | 16117 | no |
| d12 | berkshire-2020-shareholder-letter.pdf | 41045 | 20522 | no |
| d13 | jpm-ceo-letter-2024.pdf | prod 301388 (fetch failed); local 342563 | 171281 (half of local) | no |
| d14 | oaktree-on-bubble-watch.pdf | 57956 | 28978 | no |
| d15 | oaktree-nobody-knows-yet-again.pdf | 53111 | 26555 | no |
| d16 | oaktree-gimme-credit.pdf | 58924 | 29462 | no |
| d17 | oaktree-the-calculus-of-value.pdf | 64555 | 32277 | no |
| d18 | oaktree-mr-market-miscalculates.pdf | 57683 | 28841 | no |
| d19 | oaktree-2024-in-review.pdf | 46714 | 23357 | no |
| d20 | oaktree-further-thoughts-on-sea-change.pdf | 72388 | 36194 | no |

This pass's harness (B317) measured d01 structure-off wall 102215 ms and d04 35402 ms, in line with the B312 text convert.

**None of the twenty would still fail the 300-second cap if extraction happened at upload with the structure flag off.** d13 is the only one that fails the cap today (production `fetch failed` at 301388 ms). With chunks skipped, the estimate is 171281 ms.
