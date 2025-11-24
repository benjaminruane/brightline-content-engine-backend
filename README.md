# Content Engine – Backend

This is the backend for the Content Engine prototype.  
It provides serverless API endpoints for:

- Generating investment-grade written outputs  
- Rewriting existing drafts  
- Fetching external URLs as source material  
- Reporting basic system health  

---

## 🌐 Tech Stack

- **Runtime:** Node.js (Vercel Serverless)
- **Language:** JavaScript (ES Modules)
- **AI:** OpenAI Chat Completions API
- **Hosting:** Vercel

---

## 📡 API Endpoints

### `POST /api/generate`

Generates one or more outputs based on source text.

**Request body:**

```json
{
  "title": "Optional title",
  "notes": "Operator notes",
  "text": "Source text",
  "selectedTypes": ["press_release", "transaction_text"],
  "workspaceMode": "generic",
  "scenario": "new_investment",
  "versionType": "complete",
  "modelId": "gpt-4o-mini",
  "temperature": 0.3,
  "maxTokens": 2048,
  "maxWords": 400
}
Response:

{
  "outputs": [
    {
      "outputType": "press_release",
      "text": "Generated text…",
      "score": 88,
      "metrics": {
        "clarity": 0.8,
        "accuracy": 0.78,
        "tone": 0.82,
        "structure": 0.8
      }
    }
  ],
  "scenario": "new_investment",
  "versionType": "complete"
}

POST /api/rewrite

Rewrites an existing draft with optional instructions.

Request body:

{
  "text": "Existing draft",
  "notes": "Rewrite instructions",
  "outputType": "transaction_text",
  "scenario": "exit_realisation",
  "versionType": "public"
}


Response: Same shape as /api/generate.

POST /api/fetch-url

Fetches URL contents for use as a source.

Body:

{ "url": "https://example.com/article" }

GET /api/health
{ "ok": true, "status": "healthy" }

🔑 Environment Variables

Set in Vercel → Project → Settings → Environment Variables:

OPENAI_API_KEY

🚀 Deployment Workflow

Code lives in GitHub (main branch is production).

Vercel auto-deploys each new commit to main.

Environment variables stored securely in Vercel.

Releases tagged in GitHub (e.g. v3.0.0).

🏷 Versioning

Current stable release: v3.0.0 — Clean backend with CORS + scoring

See CHANGELOG.md for history.

See ROADMAP.md for future milestones.


---

# ✅ **Frontend README.md (clean, final)**

```md
# Content Engine – Frontend

The Content Engine frontend provides a clean UI for generating and rewriting investment-grade written outputs using the backend AI engine.

---

## 🧩 Features

- Paste, upload, or fetch source text.
- Select scenario + version type (complete/public).
- Select one or more output types.
- Generate first drafts.
- Rewrite existing drafts.
- Compare versions with scoring indicators.
- Works seamlessly with the backend hosted on Vercel.

---

## 🛠 Tech Stack

- **Framework:** React
- **Styling:** Tailwind / custom CSS
- **Build:** Vite / CRA (depending on your setup)
- **Hosting:** Vercel

---

## 🔌 Backend Connection

The frontend communicates with the backend:



https://content-engine-backend-v2.vercel.app


Later this will move to environment variables.

---

## ▶️ Local Development

```bash
npm install
npm run dev


Then open the printed localhost URL.

Make sure the backend is reachable (Vercel deployment or local proxy).

🚀 Deployment

Hosted on Vercel as a static React SPA.

Production branch: main

Every commit to main triggers a deployment.

🏷 Versioning

The frontend tracks backend releases loosely.
See:

ROADMAP.md

CHANGELOG.md

for detailed status and upcoming work.


---

# ✅ **ROADMAP.md (clean, final)**

```md
# Content Engine – Roadmap

High-level roadmap for the Content Engine prototype as it evolves toward an enterprise-ready workflow tool.

---

## 🚦 Current Focus

### ✔ Stabilise backend (DONE)
- Clean `/api/generate` and `/api/rewrite`
- Working scoring model
- Fixed all CORS and deployment issues
- Unified helpers & templates

### ✔ UI stability
- Ensure clean UX when generating/rewriting
- Fix score pill styling
- Improve error handling

---

## 🔜 Next Steps

### 1. Versioning and history (High priority)
- Persist versions in local app state
- Improve versions list UI
- Display metadata (scenario, versionType, score, model)

### 2. Prompt & style guide refinement
- Add output types (LinkedIn, short summary, email, etc.)
- Expand scenario definitions
- Prepare multi-client style-guide support

### 3. Configurability
- Move backend URL to config / env
- Expose advanced model params in UI (but collapsed)

---

## 🧭 Medium-Term Goals

### 4. Source ingestion improvements
- DOCX parsing
- PDF text extraction
- HTML boilerplate stripping
- Source summary panel in UI

### 5. Workspace system
- User-selectable workspace
- Different style guides per workspace
- Different prompt packs per workspace

---

## 🛡 Long-Term Vision

- Authentication & user accounts
- Persistent project history per user
- Export to Word/PPT templates
- Audit trail for enterprise compliance
- Integration into existing client workflow systems

✅ CHANGELOG.md (clean, final)
# Changelog

Notable changes to the Content Engine project.

Based loosely on Keep a Changelog principles.

---

## [v3.0.0] – Clean backend with CORS + scoring  
**Date:** 2025-11-23

### Added
- Full model-based scoring (overall + clarity/accuracy/tone/structure)
- Expanded scenario guidance
- Soft word limit + currency normalisation
- Unified CORS handling

### Changed
- Completely rebuilt `/api/generate`
- Completely rebuilt `/api/rewrite`
- Consistent helper structure (`helpers/`)

### Fixed
- Vercel "Unexpected token ']'" syntax failures
- CORS preflight rejections from frontend

---

## [v2.0.0] – Stable backend (Previous release)

- Basic generate + rewrite functionality
- Early style guide + prompt recipes
- Initial scoring stub
- Health endpoint added

---

## [v1.0.0] – Initial prototype

- First working version of the content engine
- Simple text → output flow

If you want, I can now:
