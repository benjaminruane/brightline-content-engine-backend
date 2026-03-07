# QC regression testing (T1.1)

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

## Implementation handoff rule

When backend logic affecting QC analysis is implemented:

1. Run the regression suite:

   ```bash
   npm run qc:test
   ```

2. Confirm all runs PASS.

3. If any run fails, investigate and resolve before committing.

This ensures deterministic QC behaviour is preserved across implementations.
