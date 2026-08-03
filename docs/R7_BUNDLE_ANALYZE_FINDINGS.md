# R7 bundle analyze findings — excludeFiles zero effect on api/adapt

Generated: 2026-08-03 (read-only).  
Trigger: `excludeFiles: "node_modules/{tesseract.js,tesseract.js-core}/**"` was committed and deployed; **api/adapt stayed 269.01MB — byte-identical, zero effect**.

---

## Method status — analyze build NOT obtained in Cursor

Attempted:

```bash
VERCEL_ANALYZE_BUILD_OUTPUT=1 npx vercel build
```

**Result:** CLI failed immediately with `project_settings_required` —

> No project settings found locally. Run pull to retrieve them, or re-run with `--yes` to pull automatically.

Per instruction, **did not** run `vercel pull` / production deploy. **Definitive payload contents for api/adapt therefore require Ben to run locally:**

```bash
vercel pull --yes --environment preview   # if settings missing
VERCEL_ANALYZE_BUILD_OUTPUT=1 npx vercel build
```

…and paste the **api/adapt** analyze section (large-deps list + totals).

This document is the **fallback proxy** plus the deploy evidence already in hand.

---

## Fallback proxy (local)

### Exclude glob ↔ real paths

```text
$ ls -d node_modules/tesseract.js node_modules/tesseract.js-core
node_modules/tesseract.js
node_modules/tesseract.js-core
```

Sizes (unchanged from prior diagnostic): **~1.6M** + **~43M**.

Current `vercel.json`:

```json
{
  "functions": {
    "api/*.js": {
      "maxDuration": 60,
      "includeFiles": "{node_modules/**,lib/**,tests/**}",
      "excludeFiles": "node_modules/{tesseract.js,tesseract.js-core}/**"
    }
  }
}
```

The exclude glob **matches** those directories (brace expands to `tesseract.js/**` and `tesseract.js-core/**`). A “wrong glob / path miss” is **unlikely** as the sole explanation of a **byte-identical** 269.01MB payload — missing ~45MB of tesseract would have to change the size.

### Deploy fact (already observed)

After excludeFiles shipped, **api/adapt = 269.01MB uncompressed, byte-identical vs pre-exclude.** That is the strongest available evidence that **tesseract (and everything else under `node_modules/**`) is still in the function payload**.

### Hypotheses ranked

| # | Hypothesis | Fits byte-identical 269.01? | Needs analyze to lock? |
|---|------------|----------------------------|-------------------------|
| **1** | **`includeFiles: "node_modules/**"` re-includes (or wins over) `excludeFiles`**, so the blanket include nullifies the exclude | **Yes** — full tree still shipped | Confirm tesseract still listed in adapt analyze |
| 2 | `excludeFiles` ignored / not applied for this builder path | Yes | Same — if tesseract present, cause is packaging pipeline |
| 3 | Glob syntax silently no-op | Unlikely alone (would leave ~45MB reduction missing; byte-identical fits only if exclude never ran) | Analyze + Vercel build logs |

**Working conclusion pending analyze paste:** treat **include overrides / nullifies exclude** as the decision fact for the next fix — **excludeFiles alone cannot fix this**; systemic `includeFiles` rework is required.

Public docs ([vercel.json functions](https://vercel.com/docs/project-configuration/vercel-json), [250MB troubleshooting](https://vercel.com/kb/guide/troubleshooting-function-250mb-limit)) document both fields but **do not explicitly state precedence** when `includeFiles` is a superset of `excludeFiles`. The byte-identical deploy is the operational proof of ineffective exclude under the current include blanket.

---

## Awaiting from analyze output (api/adapt) — checklist for Ben’s paste

When available, fill:

| Item | Status |
|------|--------|
| **(a)** `node_modules/tesseract.js` / `tesseract.js-core` still in payload? | **Not confirmed from analyze** — **YES implied** by byte-identical 269.01MB |
| **(b)** Top ~15 largest contributors | Not available (no build). Prior local `du` proxy: tesseract.js-core 43M, pdfjs-dist 36M, @napi-rs/canvas-* ~26M, officeparser 12M, openai ~10M, pdfkit ~8M, xlsx ~7M, … |
| **(c)** `tests/**` present? | Not available from analyze. **Likely yes** given `includeFiles` includes `tests/**` — note for includeFiles rework |
| **(d)** Uncompressed total | Deploy: **269.01MB**. Compressed vs **50MB**: **unmeasured** (no analyze) |

---

## Implication for the fix

1. **excludeFiles alone is insufficient** under the current load-bearing `includeFiles: "node_modules/**"` configuration — empirical zero effect.
2. Next work is the **systemic includeFiles rework** (narrow/replace the blanket while preserving the NFT OpenAI transitive-deps need that originally required broad include), **not** another exclude tweak.
3. While reworking: account for **`tests/**`** still in the include string (extra bloat) and the **still-unmeasured 50MB compressed** limit.

---

## Headline (paste)

**Is tesseract still in api/adapt’s payload?**  
**YES (implied by deploy: 269.01MB byte-identical after excludeFiles).**  
**Not yet file-list-confirmed** — Cursor could not run `VERCEL_ANALYZE_BUILD_OUTPUT=1 npx vercel build` (`project_settings_required`). Paste the api/adapt analyze section to lock the file list.

---

## Verification

```text
git status → docs/R7_BUNDLE_ANALYZE_FINDINGS.md (new/untracked findings only for this diagnostic)
# No vercel.json / extractor code changes in this diagnostic.
```
