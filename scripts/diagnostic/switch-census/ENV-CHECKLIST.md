# Environment checklist (Vercel)

For Ben, reading the Production (and Preview) settings page. Expected value is what the live product is built to run with. If a row says "unset", the box should be empty, not `0`.

Live `/api/health` on 27 September 2026, 11:56 UTC: `pipelineRoute: v4`, `authoringOrganisation: Halden Group`, `reviseActionList: true`, `editorialReview: true`, `database: reachable`.

| Variable | Expected | If it is not that |
|----------|----------|-------------------|
| `QC_PIPELINE_V4` | `1` | Review silently runs the old v3 pipeline. Cards and concurrency are a different product. The grey `v4` pill will go amber. |
| `AUTHORING_ORGANISATION` | The real house name, or empty. **Not** `Halden Group`. | First-person "we" is rewritten as whatever is in this box. Today it is the test name Halden Group. A draft that never mentions that name is safe. A draft that does is treated as written by the test firm. |
| `BRIGHTLINE_EDITORIAL_REVIEW` | `1` exactly | Editorial concerns disappear. The footer says the check was turned off. `true` / `on` / `yes` do **not** count. |
| `REVISE_ACTION_LIST` | `1` or `true` or `on` | Implement Changes is empty. Conflicts still show on the card. |
| `DATABASE_URL` | Set, and the database accepts it | Decisions are not recorded. The header pill goes amber (`database unreachable`). Health already reports this. |
| `OPENAI_API_KEY` | Set | Review does not run. |
| `LANGFUSE_PUBLIC_KEY` | Set if you want traces | Reviews still run. You cannot see cost or traces. |
| `LANGFUSE_SECRET_KEY` | Set if you want traces | Same as the public key. Both are required together. |
| `LANGFUSE_HOST` | Your Langfuse host, or empty for the default cloud host | Traces go to the wrong project, or nowhere. |
| `QC_CLAIM_SPANS` | Empty (on by default) | `0` / `false` / `off` skips sentence split. Inner claims are never matched. Health does not show this flag. |
| `QC_STAGE2_SPAN` | `1` if extra source passages should be collected | Empty means off. Conflicting cards may quote one passage when the source had two. Health does not show this flag. |
| `QC_LLM_CACHE` | Empty (on by default) | `0` / `false` / `off` re-bills Stages 1, 1b, and 2 on every run. Stage 5 and 6 are never cached either way. |
| `QC_LLM_CACHE_DISK` | Empty in Production | A path here writes a cache file on the server. Production should be memory only. |
| `QC_MULTISOURCE_COVERAGE` | Empty (off by default) | `1` can promote a partial card to confirmed when two sources cover different parts of the sentence. |
| `PDF_ENGINE` | Empty or `direct` | `officeparser` puts PDF extract back on the old slow path. Reviews of long PDFs can hit the 300 second wall. |
| `QC_EXTRACT_STRUCTURE` | Empty (off) | `1` asks for page and table chunks. Extra work. Default off on purpose. |
| `PDF_RAISED_CHARACTERS` | Empty (on) | `0` / `false` / `off` drops superscripts. `25th` can become `25`. Footnote marks vanish. |
| `MAX_PDF_MB` | Empty (10) or `10` | A larger number does **not** beat the Vercel 4.5 MB request cap. A smaller number rejects files the app would otherwise try. |
| `X1_1B_MIN_TEXT_LEN_PDF` | Empty (200) | Lower: scanned PDFs look like they extracted. Higher: thin born-digital PDFs look empty. |
| `X1_1B_MIN_TOTAL_TEXT` | Empty (300) | Same idea across all sources in one Review. |
| `MIN_EXTRACT_LEN_PDF` | Empty (500) | Quality warn threshold. Wrong value only changes whether a warning is stamped. |
| `MIN_EXTRACT_LEN_WARN_PDF` | Empty (1200) | Same. |
| `MIN_RAW_BYTES_FOR_EXPECTED_TEXT` | Empty (50000) | Same. |
| `MIN_PRINTABLE_RATIO` | Empty (0.75) | Same. |
| `ANTHROPIC_API_KEY` | Empty unless a stage is pinned to Anthropic | Unused on the current pinned OpenAI stages. Setting it does not switch models. |
| `TAVILY_API_KEY` | Empty unless web search is in use | `/api/query` and web search fail without it. Review of uploaded sources does not use it. |
| `BRIGHTLINE_API_BASE_URL` | Empty in Production | Writing routes call themselves. A stale URL sends Draft/Rewrite to the wrong host. |
| `BRIGHTLINE_ALLOW_DIAG_HEADER` | Empty in Production | `1` lets a request header turn on verbose diagnostics in Production. |
| `BRIGHTLINE_DIAG_VERBOSE` | Empty | `1` prints extract samples to logs. |
| `DEBUG_LLM_CACHE` | Empty | `1` prints cache hit lines to logs. |
| `CONSTRUCTIVE_FEEDBACK_DEBUG_CRAFT` | Empty | `1` prints dropped craft lines to logs. |
| `DIAG_EXTRACT_SAMPLES` | Empty | `1` / `true` dumps extract snippets to logs. |
| `QC_LLM_CLAIM_EXTRACTION_MODEL` | Empty | No live caller. Changing it does nothing. |
| `QC_LLM_CLAIM_EXTRACTION_TIMEOUT_MS` | Empty | No live caller. Changing it does nothing. |
| `BRIGHTLINE_QC_V3` | Empty. There is no reader. | If you still see this box, it is leftover. It does not select a pipeline. `QC_PIPELINE_V4` does. |
| `VERCEL_ENV` | Leave to Vercel | Used only to lock diagnostic headers in Production. Do not type this by hand. |

Frontend (separate project, same kind of page):

| Variable | Expected | If it is not that |
|----------|----------|-------------------|
| `VITE_API_BASE_URL` | The Production backend URL | The app talks to the wrong backend, or fails to load. |
| `VITE_REVISE_ACTION_LIST` | Matches backend `REVISE_ACTION_LIST` | Header hover says the two sides disagree. Implement Changes can be on in the API and off on the screen. |

Not on this page, and still able to change the product: OpenAI account tokens-per-minute (the 27 September class of wall). The code assumes 2,000,000 TPM for gpt-4o until the first response header arrives. A lower account tier waits inside the 300 second cap and then returns no cards.
