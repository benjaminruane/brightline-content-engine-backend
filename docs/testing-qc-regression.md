# QC regression testing (T1.1 / R2.1)

- **Test corpus:** `tests/qc_corpus/` — fixed source files for deterministic QC runs. Source filenames in requests are resolved only from this directory.
- **Enabling the test endpoint:** Set `ENABLE_QC_TEST_ENDPOINT=true` in the environment. The endpoint is **disabled** otherwise (returns 404). Do not set this in production.

## Running the QC regression suite

Run the regression harness with:

```bash
npm run qc:test
```

This command executes the deterministic QC regression suite using the test corpus in `tests/qc_corpus`.

Outputs are written to:

- **`tests/output/`**

These files are generated artifacts and are ignored by Git.

Optional: `QC_REGRESSION_BASE_URL=http://localhost:3000` (default). Start the backend (e.g. `npm run dev` or `vercel dev`) before running the suite.

## Suite format and assertions (R2.1)

The suite file `tests/qc_regression_suite.json` defines one or more runs. Each run can specify optional expectation fields under `expect`:

- **supportState** — required; value or array of allowed values for the first statement’s `qcCard.supportState`.
- **concernState** — optional; value or array of allowed values for `qcCard.concernState`.
- **supportRefIdsUnique** — optional; if `true`, asserts `qcCard.supportRefIds` has no duplicates.
- **reasoningHeadline** — optional; value or array of allowed values for `qcCard.reasoningHeadline`.
- **reasoningParagraphIncludes** — optional; array of substrings that must all appear in `qcCard.reasoningParagraph`.
- **reasoningParagraphIncludesAny** — optional; array of substrings; if a paragraph exists, it must include at least one.
- **reasoningParagraphExcludes** — optional; array of substrings that must not appear in `qcCard.reasoningParagraph`.
- **primaryRefTitleIncludes** — optional; array of substrings; `qcCard.primaryRefTitle` must include at least one.
- **supportRefTitlesInclude** — optional; array of titles that must each appear in `qcCard.supportRefTitles`.

All of these except `supportState` are optional. If any assertion fails, the run fails and the harness exits non-zero.

## Implementation handoff rule

When backend logic affecting QC analysis is implemented:

1. Run the regression suite:

   ```bash
   npm run qc:test
   ```

2. Confirm all runs PASS.

3. If any run fails, investigate and resolve before committing.

This ensures deterministic QC behaviour is preserved across implementations.
