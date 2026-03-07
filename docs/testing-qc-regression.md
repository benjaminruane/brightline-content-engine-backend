# QC regression testing (T1.1)

- **Test corpus:** `tests/qc_corpus/` — fixed source files for deterministic QC runs. Source filenames in requests are resolved only from this directory.
- **Enabling the test endpoint:** Set `ENABLE_QC_TEST_ENDPOINT=true` in the environment. The endpoint is **disabled** otherwise (returns 404). Do not set this in production.
- **Running the regression suite:** Start the backend (e.g. `npm run dev` or `vercel dev`), then run:
  ```bash
  node scripts/run_qc_regression.mjs
  ```
  Optional: `QC_REGRESSION_BASE_URL=http://localhost:3000` (default). Full JSON outputs are written to `tests/output/<runName>.json`.
