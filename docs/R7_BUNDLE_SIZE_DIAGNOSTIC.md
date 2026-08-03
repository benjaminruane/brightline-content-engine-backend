# R7 bundle-size diagnostic — api/adapt oversize after officeparser

Generated: 2026-08-02 (read-only; no code changes).  
Trigger: Vercel deploy failed — `api/adapt` ≈ **269MB uncompressed** (> **250MB** limit; **~19MB overage**).

Method: **Part A approximated** with `du` / `npm ls` (no `vercel build`). **Part B** is the decision surface — import/runtime trace via `rg` + source reading.

---

## A. Bundle breakdown (approximate — local `node_modules`)

App `node_modules` total after the swap + dep cleanup: **239M**. Deploy reported **269MB** for `api/adapt` (build/platform packaging can add beyond local install; treat local as ordered trim candidates, not an exact replica of the 269 figure).

### Top contributors (local `du -sh`, ordered)

| Approx size | Path | Role |
|------------:|------|------|
| **43M** | `node_modules/tesseract.js-core` | OCR WASM/JS cores (multiple SIMD/LSTM variants) |
| **36M** | `node_modules/pdfjs-dist` | PDF parse/render stack (via officeparser) |
| **26M** | `node_modules/@napi-rs/canvas-darwin-arm64` | Native canvas (via pdfjs-dist → `@napi-rs/canvas`; **local Darwin** platform binary — Linux deploy would pull a linux-* twin) |
| **12M** | `node_modules/officeparser` | Chosen extractor |
| **9.6M** | `node_modules/openai` | LLM client |
| **8.1M** | `node_modules/pdfkit` | PDF generation (export path) |
| **7.2M** | `node_modules/xlsx` | Still a direct app dep (non-extractor eval script) |
| **7.0M** | `node_modules/@anthropic-ai` | LLM client |
| **6.1M** | `node_modules/docx` | DOCX generation |
| **5.6M** | `node_modules/fontkit` | Fonts (pdfkit / related) |
| **4.1M** | `node_modules/jsdom` | HTML |
| **1.6M** | `node_modules/tesseract.js` | OCR JS wrapper |
| **148K** | `node_modules/@napi-rs/canvas` | Canvas package stub |

**`pdfjs-dist` internals (not mutually exclusive with the 36M):** `legacy/` 16M, `build/` 12M, `web/` 1.6M, `cmaps/` 1.6M, `wasm/` 1.5M, `standard_fonts/` 800K.

**officeparser transitive hard deps** (`npm ls` / package.json): `pdfjs-dist@6.1.200`, `tesseract.js@^7.0.0`, `@xmldom/xmldom`, `fflate`, `file-type`. **`canvas@^2.11.2` is OPTIONAL / unmet**; platform canvas arrives via **pdfjs-dist → `@napi-rs/canvas`**, not the optional `canvas` package.

**OCR-off does not uninstall these:** they are still on disk and still eligible for the function payload.

### Amplifying config (important)

`vercel.json` currently sets:

```json
"functions": { "api/*.js": { "maxDuration": 60, "includeFiles": "{node_modules/**,lib/**,tests/**}" } }
```

`includeFiles: node_modules/**` **force-includes the entire install tree into every `api/*.js` function**, independent of NFT tree-shaking. That makes officeparser’s OCR/PDF weight a **systemic** payload problem, not “only traced into adapt.”

---

## B. Import trace — why adapt carries the extractor

### Exact chain for `api/adapt`

1. **`api/adapt.js` line 21 — DIRECT static import**  
   `import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";`  
   Not a QC barrel. Not an accidental re-export from `pipeline-v4`.
2. **`lib/extract-text-from-source.mjs`** — `prepareUploadedSourcesForPipeline` → (when `contentBase64` present) → `extractTextFromSource` → **dynamic** `await import("officeparser")` (`OfficeConverter` + `terminateOcr`).
3. Dynamic import still lands officeparser (and its deps) in the function when NFT traces that module **and/or** when `includeFiles` copies all of `node_modules`.

### Does adapt extract at request time? **YES — genuine runtime need**

- Handler calls `prepareSourcesForAdaptPrompt(sources)` (≈ line 190).
- That helper **always** runs `prepareUploadedSourcesForPipeline` on the request `sources` array (batch, then per-source fallback).
- Spec comment A9.10: *“PDF (and other file) sources → plain text via pipeline”* — intentional ingestion for Adapt prompts.
- It also strips `contentBase64` from prompt JSON once `text` exists (`adaptSourceJsonForPrompt`).

**Determinant:** this is **not** an incidental shared-barrel artifact. Adapt **does need extraction** whenever a source arrives as a file (`contentBase64`).  
“Parked” UI (R4.1 comment) does **not** remove the code path — the endpoint still ships and still imports the extractor.

### Who else pulls the extractor? (`api/*`)

| `api/*` file | Pulls extractor? | How | Runtime extract? |
|--------------|------------------|------|-------------------|
| **`adapt.js`** | **YES** | direct import of `prepareUploadedSourcesForPipeline` | **YES** — every Adapt POST prepares sources |
| **`analyse-statements.js`** | **YES** | direct | **YES** — QC ingestion of uploaded sources |
| **`extract-draft-text.js`** | **YES** | direct | **YES** — primary job is extract uploaded draft |
| **`summarize-source.js`** | **YES** | direct | **YES for PDF** (`contentBase64`); text mime uses `.text` only |
| All other `api/*.js` reviewed | **NO** static/transitive import of `extract-text-from-source` / `officeparser` in source | — | — |

So: **four functions** need the extractor for real work. Under current `includeFiles: node_modules/**`, **all** `api/*.js` still risk carrying the fat tree.

---

## C. Trim candidates (OCR off) + lighter PDF feasibility

### Dead / low-value weight with `parseConfig.ocr: false`

| Candidate | Local size | Notes |
|-----------|-----------:|-------|
| `tesseract.js-core` | **43M** | Hard dep of officeparser; unused when OCR disabled |
| `tesseract.js` | **1.6M** | Same |
| `@napi-rs/canvas-*` platform native | **~26M** (darwin local) | Pulled via pdfjs; render/canvas path — candidate exclude if NFT/includeFiles allow and PDF text extract still works without shipping native canvas |
| Optional classic `canvas` | unmet | Not installed |

**OCR-only exclude ≈ 44.6M** → clears the **19MB** overage with headroom (**269 − ~45 ≈ 224MB** if those dirs are fully left out of the payload).

`pdfjs-dist` (**36M**) is **not** pure OCR dead weight — officeparser uses it for **PDF text**. Trimming whole pdfjs without an alternate PDF stack would break PDF extraction.

### officeparser “text-only / slim” import?

- Package exports `"."` (Node) and `"./slim"` (**browser** slim build). Slim is not documented/proven here as a Node serverless OCR-free path.
- Current code imports `officeparser` default entry → pulls the full dependency set declared in package.json (`tesseract.js` hard-dep even when OCR is off).
- **Feasibility of a lighter PDF path (report only):** survey already ranked **unpdf** as a PDF FAITHFUL alternative. A **split stack** (unpdf/pdfjs-serverless for PDF + officeparser for docx/pptx/xlsx, or officeparser only for Office with PDF elsewhere) is **feasible** but is a product/code change — not a config-only exclude. Do not expect `./slim` alone to fix Node function size without verification.

### Compressed 50MB limit

Unmeasured in this diagnostic (no build analyze). Flag separately before shipping a “trim” that only clears 250MB uncompressed.

---

## CONCLUSION (recommend, don’t decide)

### 1. Trim-or-split?

**Prefer BOTH, sequenced — with TRIM as the fast path that clears 19MB, and SPLIT as optional product scoping.**

- **TRIM first (strong):** Exclude OCR assets (`tesseract.js`, `tesseract.js-core`) from the function payload; strongly consider narrowing/removing `includeFiles: "node_modules/**"` so Vercel NFT doesn’t ship the entire install into every API. Optionally exclude platform `@napi-rs/canvas-*` if PDF extract still works.  
  Adapt **cannot** be “fixed” by pretending it doesn’t import the extractor — it does, on purpose.
- **SPLIT second (strategic):** Only if you want Adapt (parked) / summarize / etc. to stop carrying extraction: require pre-extracted `.text` on Adapt, or route file upload through `extract-draft-text` / analyse only. That is a **behavior** change, not just bundling hygiene. Splitting does not remove the need for a fat function somewhere (`analyse-statements`, `extract-draft-text` still need officeparser).

### 2. Expected MB saved (vs ~19MB overage)

| Action | Approx local MB removable | Clears 250MB? |
|--------|--------------------------:|---------------|
| Exclude tesseract.js + tesseract.js-core | **~45M** | **Yes** (19MB overage covered; ~224MB ballpark if 269−45) |
| + exclude platform `@napi-rs/canvas-*` | **+~26M** | Yes, larger headroom |
| Drop officeparser+pdfjs+OCR+canvas from Adapt only (runtime must stop extracting or call another API) | **~90–120M** from that function | Yes for Adapt; still need one fat ingestion function |
| Switch PDF to unpdf / lighter pdfjs build | Uncertain until remeasured; could cut much of **36M pdfjs** if successful | Possible; more design work |

### 3. Clears 250MB uncompressed?

**Yes, if OCR (`tesseract*`) is excluded from the shipped function — that alone exceeds the 19MB overage.** Revisit `includeFiles: node_modules/**` in the same pass; leaving that blast radius will keep forcing unrelated packages into every function and will fight the compressed **50MB** limit even after OCR trim.

---

## Verification

```text
# After writing this file only:
# git status → docs/R7_BUNDLE_SIZE_DIAGNOSTIC.md (and unrelated prior untracked diagnostic assets may exist)
# git diff for intentional product code → empty for this diagnostic
```

**Three CONCLUSION headlines (paste):**

1. **Trim-or-split:** BOTH — **TRIM OCR (+ reconsider `includeFiles: node_modules/**`) first**; SPLIT Adapt only if you intentionally drop runtime file extraction there.  
2. **Expected MB saved:** **~45M** from excluding `tesseract*` alone (covers **19MB** overage); +~26M if canvas native also excluded.  
3. **Clears 250MB?** **Yes** under OCR exclude (approximate); **50MB compressed still unmeasured**.
