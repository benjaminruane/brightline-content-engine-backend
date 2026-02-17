# Wave 1 — Quality Check (Review) Trace Report

**Read-only trace.** No code changes. Covers current QC entrypoints, backend contract, performance/caching, minimal Writing badge payload, drill IDs, and UI restructure impact.

---

## 1. Plain-English Summary (business-readable)

Review (Quality Check) today runs when the user clicks **Review** in the **Statement Analysis** tab of the **right-hand Tools drawer**, or uses the **TEMP Review** button in the header. The app sends the **current draft text**, **version id**, and **sources** to the backend; the backend runs the full analysis pipeline (extract statements, verify claims, evidence judgement, P4/P5 meta) and returns **statements**, **references**, and **meta**. There is **no snapshot caching**: every Review run is a full server run. The response already contains everything needed for a **Writing badge** (overall posture, top risk, freshness) from existing doc-level and statement-level meta; no extra computation is required. **Stable IDs** exist for references (numeric `id`) and for suggest items (composite `origin:code:stmtId:severity`); **statements** and **themes/drivers** have no first-class stable id today—only array index or client-side `row_${idx}`. Moving QC to a **top-level page** is straightforward: the Review UI is already a panel that can be rendered in a drawer or inline; the right drawer would keep Version History, Source detail, Evidence deep dive, and Export, with QC surfaced as its own route/page.

---

## 2. Current Quality Check (Review) Entrypoints

### 2.1 Frontend routes / components that invoke Review

| Location | What invokes QC |
|----------|------------------|
| **Right drawer → Statement Analysis tab** | Primary entry: user clicks **Review** inside `StatementAnalysisPanel` (opens drawer via Tools icon, default tab is "Statement Analysis"). |
| **Header (dev/temp)** | **TEMP Review** button runs the same analysis without opening the drawer. |
| **App.jsx (dev panel)** | Same **TEMP Review** + Copy JSON for last run (generate/rewrite/review). |

**Relevant files**

- **`src/components/drawers/RightDrawer.jsx`**  
  - Tabs: Version History (`versions`), **Statement Analysis** (`analysis`), Enquire (`enquire`).  
  - Statement Analysis tab renders: `<StatementAnalysisPanel context="drawer" />` (lines 112–117).

- **`src/modules/drafting/StatementAnalysisPanel.jsx`**  
  - **Review** button and “Run Review” flow (lines ~1004–1013, 1260–1263).  
  - `onReview` calls `runStatementAnalysis(versionId, draftText)` then `setStatementPanelCollapsed(false)`.  
  - Uses `statementRows`, `result`, `lastAnalysedAt` from `useDraftState`; displays summary bar, statement cards, “Last reviewed” timestamp.

- **`src/App.jsx`**  
  - Top bar / dev: `handleTempReview` (lines 136–141), TEMP Review button (262–271).  
  - Layout: `rightDrawer={<RightDrawer />}`, `bottomDrawer={<BottomDrawer />}` (359–360).

- **`src/components/Layout/Header.jsx`**  
  - TEMP Review button (65–77), same `handleTempReview` from context.

- **`src/state/useWorkspaceChromeState.jsx`**  
  - `RIGHT_DRAWER_DEFAULT_TAB = "analysis"` (line 8).  
  - `openRightDrawer(tab)`, `toggleRightDrawer`, etc. (20–34, 52–53).

No dedicated **route** for Review: it’s a tab inside the right drawer. Routing is effectively “Focus Writing” with drawer state (open/closed + active tab).

---

## 3. Backend endpoint(s) and request/response

### 3.1 Endpoints

| Endpoint | When used |
|----------|------------|
| **`POST /api/analyse-statements-v2`** | When `?engine=v2` (from `getEngineFromLocation()`). |
| **`POST /api/analyse-statements`** | Default (V1). |

Both go through **`api/analyse-statements-entry.js`**, which dynamically imports **`lib/analyse-statements-impl.mjs`** and returns the payload; the route handlers send `res.status(200).json(payload)`.

**Files**

- **`src/utils/api.js`**  
  - `apiAnalyseStatements(payload, extraHeaders)` (lines 114–129): chooses path by engine, POST with JSON body, returns `{ data, status }`.

- **Backend**  
  - **`api/analyse-statements-v2.js`** (lines 16–92): sets `req.body.engine = "v2"`, calls entry, enforces `ok: true` only when `meta.fullPipelineCompleted === true`.  
  - **`api/analyse-statements.js`** (lines 16–78): same pattern, no engine flag.  
  - **`api/analyse-statements-entry.js`** (lines 12–215): builds `implHref` to `../lib/analyse-statements-impl.mjs`, imports it, returns `impl(req, res)`.

### 3.2 Request parameters (from client)

Built in **`src/hooks/useDraftState.jsx`** inside `runStatementAnalysis` (lines 364–369):

```js
const payload = {
  draftText: text,      // current draft content
  versionId,             // current version id (string)
  publicSearch: true,   // fixed in this path
  sources,               // array of source objects (id, kind, name, text, url, etc.)
};
```

Optional (not sent for the main Review flow): `selectionText`, `selectionUsed` / `selectionMode`, `uploadedSources`, `modelId`.  
**Selection mode** uses the same endpoints with `selectionText` (and optionally `selectionUsed`/`selectionMode`); **`/api/analyse-selected-statements`** is a separate selection-only endpoint (see `runSelectionAnalysis` and `apiAnalyseSelectedStatements` in frontend).

### 3.3 Typical response payload shape (high-level)

Backend returns a **single JSON object** (no streaming). Success path builds **`finalResponseObject`** in **`lib/analyse-statements-impl.mjs`** (lines 28927–28947, then many `finalResponseObject.meta.*` assignments) and returns it (line 31928).

**Top-level**

- **`ok`**: `true` only when `meta.fullPipelineCompleted === true` (V2 enforces this).
- **`statements`**: Array of statement objects (see below).
- **`references`**: Array of reference objects `{ id, title, url, type }` (e.g. `type`: `"uploaded"` | `"web"`).
- **`meta`**: Object with pipeline and document-level meta (see below).

**`statements[]` (each item)**

- **`text`** (or `statement` / `claim`): statement text.
- **`assessment`**: claims, citations, reasons, reliabilityScore, etc.
- **`meta`**: evidenceJudgement (fragilityDrivers, consistency, …), judgement (fragilityPosture, primaryDrivers, confidence, narrative), scoringBridge (fragilitySeverityScore, evidenceQualityScore, confidenceScore), suggestPriority (riskPriorityScore, riskPriorityBand), suggestThemes, suggestImpactEstimates, suggestExecutionPlan, suggest (items, summary), and other signals.
- **`id`**: Optional; not guaranteed. Frontend fallback: `row?.id || \`row_${idx}\``.

**`meta` (response-level)**

- **`fullPipelineCompleted`**, **`extractionQuality`**, **`rid`** (when set), **`analysedAt`** (if set; see below), **`evidenceJudgementSummary`**, **`suggestSummary`**, **`explanationOverview`**, **`dealCoverageMap`**, **`icCoverageSummary`**, selection-related fields when in selection mode, etc.
- **Document-level judgement/scoring** (for “whole draft”): **`meta.judgement`** (fragilityPosture, primaryDrivers, confidence, narrative, dominantRiskPattern), **`meta.scoringBridge`** (fragilitySeverityScore, evidenceQualityScore, confidenceScore). These are set on **`finalResponseObject`** (the doc) by **`buildJudgementAggregationP4`** and **`buildScoringBridgeP4`** in impl.

**Note:** **`meta.analysedAt`** is **not** set in the backend response today. The frontend uses `data?.analysedAt || new Date().toISOString()` (useDraftState line 398), so it can add a server-side timestamp later without changing client contract.

---

## 4. Performance and caching

### 4.1 Where time is spent (server-side)

- **`lib/analyse-statements-impl.mjs`**: single large handler; stages are logged with `logStage(..., { rid })` (e.g. START, CORPUS_EFFECTIVE, TAVILY_*, OPENAI_*, DONE). No built-in timing breakdown in the response.
- Heavy phases typically include: statement extraction, corpus/search, OpenAI calls (claim extraction, evidence, etc.), verification, evidence judgement (P3/P4), P5 suggest priority/bundle/execution, and final meta aggregation.
- **`analyse-statements-entry.js`** only imports the impl and delegates; no timing there.

### 4.2 Existing caching, hashes, request IDs, memoization

- **Request ID:** **`rid`** — set in route handlers (`req._brightlineRid` or header `x-brightline-rid`), passed through impl; used for logging. Not used for response caching.
- **Request signature:** **`reqSig`** — computed in impl from `draftText`, `sources` (ids/names), `webSearchEnabled` via **`generateReqSig(draftText, sources, webSearchEnabled)`** (lines 5050–5065). Used for diagnostics only; not exposed in response and not used as cache key.
- **Selection hash:** **`selectionHash`** — when `selectionText` is present, SHA-256 (first 16 hex chars) in impl (lines 1459–1460). Used for selection context, not for caching.
- **No response caching or memoization** for analyse-statements in backend or frontend. Each Review run is a full POST with no cache lookup.

### 4.3 Best place(s) to add a snapshot cache (keyed by hash(draft + sources + appliedSuggestionsState))

- **Safest place:** In the **route layer** (e.g. **`api/analyse-statements-entry.js`** or the V2 wrapper), **before** calling the impl:
  1. Compute a **cache key** = hash(draftText + canonical sources representation + optional appliedSuggestionsState if/when that exists). Use a fast hash (e.g. SHA-256 of normalized string).
  2. **Look up** in a cache store (in-memory Map, or Redis if multi-instance). If hit, return the stored payload (and optionally refresh `meta.analysedAt` / `rid` for freshness).
  3. If miss, call the impl as today, then **store** the result (or a sanitized subset) under the key with a TTL.
- **Important:** Do **not** change the impl’s logic or return shape for the cache. The impl remains stateless; only the entry (or wrapper) does key computation and get/set. This keeps core behaviour unchanged and limits risk.

---

## 5. Minimal payload for Writing badge

### 5.1 Required for badge

- **Overall posture classification** (e.g. robust / supported_with_caveats / fragile).
- **Top risk short label** (e.g. dominant driver or “Evidence Strength” style label).
- **Freshness timestamp** (when this QC result was produced).

### 5.2 Smallest subset of current response that can drive this

- **Posture:** **`meta.judgement.fragilityPosture`** (document-level). Already set by **`buildJudgementAggregationP4`** on **`finalResponseObject.meta`**.
- **Top risk:** **`meta.judgement.primaryDrivers[0]`** or **`meta.judgement.dominantRiskPattern`** (or first **`meta.suggestThemes`** theme from doc if you expose doc-level themes). All already computed.
- **Freshness:** **`meta.analysedAt`**. Not set by backend today; client uses `data?.analysedAt || new Date().toISOString()`. Backend can set **`finalResponseObject.meta.analysedAt = new Date().toISOString()`** once before return (e.g. in impl near `fullPipelineCompleted = true`) so the badge has a server timestamp without extra computation.

### 5.3 Can we return/derive this without extra computation?

**Yes.** All of the above are either already in the response (posture, top risk from doc judgement/themes) or a single assignment (analysedAt). No new pipeline steps or model calls are required.

---

## 6. Drill/navigation IDs

### 6.1 What exists today

| Entity | Stable ID? | Where | Notes |
|--------|------------|--------|--------|
| **Statements** | **No** | — | Backend does not set `stmt.id`. Frontend uses `row?.id || \`row_${idx}\`` (StatementAnalysisPanel rows, line 564). Array index is implicit. |
| **Sources / references** | **Yes** | **`references[].id`** | Set in impl: uploaded 1..N, web N+1..M (lines 25651–25666). Numeric; frontend normalizes with `String(id)` (StatementAnalysisPanel line 556). |
| **Themes / drivers** | **No** | — | **`stmt.meta.suggestThemes`** and **`stmt.meta.judgement.primaryDrivers`** are arrays of strings (theme names, driver names). No theme or driver id. |
| **Suggestions** | **Yes (composite)** | **`stmt.meta.suggest.items[].id`** | Built in **`lib/build-suggest-items.cjs`**: **`stableId(origin, signalTypeOrCode, stmtIdOrIndex, severity)`** → `"origin:code:stmtIdOrIndex:severity"` (lines 76–79, 134–139). **`stmtIdOrIndex`** is `stmt.id` or `idx${idx+1}`; so stable per statement + origin + code + severity. |

### 6.2 Gaps and minimal additive IDs (no redesign)

- **Statements:** Add a **stable statement id** in the backend when building each statement for the final array (e.g. `stmtId = \`stmt_${runId}_${index}\`` or hash of versionId + index + normalized text prefix). Attach as **`stmt.id`** so the frontend can use it for drill links and keys. Small change in impl where statements are pushed into the final list.
- **Themes/drivers:** Optional: add **`themeId`** / **`driverId`** to **`suggestThemes`** / **`primaryDrivers`** (e.g. `theme_Evidence Strength`, `driver_single_source_over_reliance`) for URL or deep-link. Purely additive to existing string fields.

---

## 7. UI restructure impact (QC as top-level page, keep drawers)

### 7.1 Where the “right drawer” pattern is implemented

- **`src/layout/FocusWritingLayout.jsx`**: Renders **`rightDrawer`** (and bottom drawer) as overlay panels; **`rightDrawerOpen`** controls visibility; transform/width for slide-in (lines 94–113, 115–122).
- **`src/state/useWorkspaceChromeState.jsx`**: **`rightDrawerOpen`**, **`rightDrawerActiveTab`**, **`openRightDrawer(tab)`**, **`toggleRightDrawer`**, **`closeRightDrawer`**.
- **`src/components/drawers/RightDrawer.jsx`**: Tab strip (Version History, Statement Analysis, Enquire) and tab panels; **Statement Analysis** is one panel (lines 112–116).
- **`src/App.jsx`**: Passes **`rightDrawer={<RightDrawer />}`** into **FocusWritingLayout** (359).

So: “right drawer” = one drawer component with three tabs; QC is the **Statement Analysis** tab content (**StatementAnalysisPanel** with **context="drawer"**).

### 7.2 Easiest path to move QC to a top-level page and keep other drawers

- **Option A — New route, same panel:** Add a route (e.g. `/review` or `/writing/review`) that renders the **main content** as **`<StatementAnalysisPanel context="inline" />`** (or a new context like `"page"`), reusing the same component. Left rail / top bar stay; right drawer still exists but **default tab** can be changed from `"analysis"` to `"versions"` so opening the drawer shows Version History by default. Review is then reached via route + optional “Open in drawer” from the page.
- **Option B — Drawer tab becomes “preview”:** Keep **Statement Analysis** in the drawer as a compact “preview” or “quick view”, and add a **“Open full Review”** link that navigates to the new QC page (same **StatementAnalysisPanel** or a full-page wrapper). Version History, Source detail, Evidence deep dive, Export remain drawer tabs.
- **Option C — QC only on page:** Remove **Statement Analysis** from the drawer tabs; drawer only has Version History, Enquire, and (if desired) Sources/Evidence/Export. All Review UI lives on the new top-level page; **StatementAnalysisPanel** is only used there (or in both page and a “mini” drawer variant).

**Recommendation:** **Option A** or **B** for lowest risk: introduce a **Review page** that mounts **StatementAnalysisPanel** (or a thin wrapper) as the main content; keep the drawer for versions, source detail, evidence deep dive, export. No change to analysis or API; only routing and where the panel is rendered.

---

## 8. Key files and functions (with line ranges)

| File | Lines (approx) | Purpose |
|------|------------------|--------|
| **Frontend** | | |
| `src/modules/drafting/StatementAnalysisPanel.jsx` | 2–3, 323–324, 514–521, 547–580, 718–832, 876–880, 1004–1013, 1025–1064, 1153–1247, 1232–1263 | Review UI, statement cards, summary bar, onReview, runKey, rows from statementRows + result |
| `src/hooks/useDraftState.jsx` | 23, 336–430, 450–492, 512–531, 1381–1404, 1531–1533 | runStatementAnalysis, payload build, apiAnalyseStatements, currentAnalysis, statementRows, lastAnalysedAt |
| `src/utils/api.js` | 109–129, 133–147 | apiAnalyseStatements (v1/v2 path), apiAnalyseSelectedStatements |
| `src/components/drawers/RightDrawer.jsx` | 1–129 | Right drawer, tabs (versions / analysis / enquire), StatementAnalysisPanel in drawer |
| `src/state/useWorkspaceChromeState.jsx` | 2–24, 34–53, 83–96 | rightDrawerOpen, rightDrawerActiveTab, openRightDrawer, RIGHT_DRAWER_DEFAULT_TAB |
| `src/App.jsx` | 19–21, 117, 232–234, 331, 359–360 | RightDrawer import, toggleRightDrawer, handleTempReview, openRightDrawer("versions"), layout slots |
| `src/components/Layout/Header.jsx` | 18–24, 65–77 | canRunReview, handleTempReview, TEMP Review button |
| `src/layout/FocusWritingLayout.jsx` | 26–41, 94–122 | rightDrawer prop, rightDrawerOpen, drawer transform/width |
| **Backend** | | |
| `api/analyse-statements-v2.js` | 16–92 | V2 route, CORS, body.engine=v2, entry call, fullPipelineCompleted contract |
| `api/analyse-statements.js` | 16–78 | V1 route, CORS, entry call |
| `api/analyse-statements-entry.js` | 12–215 | Dynamic import of impl, return impl(req, res) |
| `lib/analyse-statements-impl.mjs` | 25099–25102, 25108, 25311–25315, 25320–25330, 25558–25565, 28927–28972, 29603–29619, 31550, 31794–31928 | rid, body.draftText/versionId/sources, selectionUsed, finalResponseObject build, meta assignments, return |
| `lib/build-suggest-items.cjs` | 76–79, 114–146, 258–298 | stableId, buildSuggestItems (suggestion id), buildSuggestSummary, aggregateSuggestSummary |

---

## 9. Proposed Wave 1 implementation path (lowest-risk steps)

1. **Minimal Writing badge payload (backend)**  
   - In **`lib/analyse-statements-impl.mjs`**, immediately before setting `fullPipelineCompleted = true`, set **`finalResponseObject.meta.analysedAt = new Date().toISOString()`**.  
   - Document that **Writing badge** uses **`meta.judgement.fragilityPosture`**, **`meta.judgement.primaryDrivers[0]`** (or **dominantRiskPattern**), and **`meta.analysedAt`**. No new computation.

2. **Stable statement ids (backend)**  
   - In the same impl, where the final **`statements`** array is built and assigned to **`finalResponseObject.statements`**, ensure each statement has **`stmt.id`** (e.g. `stmt_${runId}_${index}` or hash-based). Use a single loop or assignment so every returned statement has an id. Frontend already supports `row.id`; this makes it stable across runs for the same response.

3. **Snapshot cache (optional, entry layer)**  
   - In **`api/analyse-statements-entry.js`** (or in the V2 wrapper):  
     - Parse body; compute **cacheKey = hash(draftText + normalized sources)** (and optionally appliedSuggestionsState later).  
     - If cache has key and not expired, return cached payload (optionally refresh **meta.analysedAt** and **meta.rid**).  
     - On miss, call impl as today; store result under key with TTL.  
   - No changes inside **analyse-statements-impl.mjs**.

4. **QC as top-level page (frontend)**  
   - Add route **e.g. `/review`** or **`/writing/review`** that renders **StatementAnalysisPanel** (or a wrapper) as main content.  
   - Keep **RightDrawer** with Version History, (optional) compact Review preview, Enquire, Sources/Export.  
   - Link “Review” in nav/header to the new route.  
   - Optionally set **RIGHT_DRAWER_DEFAULT_TAB** to **`"versions"`** so opening the drawer no longer defaults to Statement Analysis.

5. **Theme/driver ids (optional, additive)**  
   - When building **stmt.meta.suggestThemes** / **stmt.meta.judgement.primaryDrivers**, add **themeId** / **driverId** string (e.g. slug of theme/driver name) for future deep-links. No change to existing string fields.

---

*End of report.*
