# Content Engine – Backend

This is the backend for the Content Engine prototype.  
It provides a small set of HTTP endpoints for:

- Generating first-draft investment commentary
- Rewriting existing drafts
- Fetching external URLs as sources
- Health / status checks

It is designed to run as **serverless functions on Vercel**.

---

## Tech stack

- **Runtime:** Node.js (Vercel serverless, ESM modules)
- **Language:** JavaScript (ES Modules)
- **AI:** OpenAI Chat Completions API
- **Hosting:** Vercel

---

## API endpoints

### `POST /api/generate`

Generate one or more outputs from source text.

**Request body (simplified):**

```json
{
  "title": "Optional title",
  "notes": "Optional operator notes or instructions",
  "text": "Source text to analyse",
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

json
Copy code
{
  "outputs": [
    {
      "outputType": "press_release",
      "text": "Generated content...",
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
Rewrite an existing draft with optional instructions.

Request body (simplified):

json
Copy code
{
  "text": "Existing draft text",
  "notes": "Rewrite instructions (tone, emphasis, exclusions)",
  "outputType": "transaction_text",
  "scenario": "new_investment",
  "versionType": "complete",
  "modelId": "gpt-4o-mini",
  "temperature": 0.3,
  "maxTokens": 2048,
  "maxWords": 400
}
Response:

Same shape as /api/generate, but with a single outputs[0] entry.

POST /api/fetch-url
Fetch the contents of a URL (used as an ingestion helper).

Body:

json
Copy code
{ "url": "https://example.com/article" }
Response (simplified):

json
Copy code
{
  "ok": true,
  "status": 200,
  "contentType": "text/html; charset=utf-8",
  "body": "<!doctype html>..."
}
GET /api/health
Simple health check:

json
Copy code
{ "ok": true, "status": "healthy" }
Environment variables
The backend expects the following env vars:

OPENAI_API_KEY – API key for OpenAI

Set this in Vercel → Project → Settings → Environment Variables.

Development & deployment
This repo is designed primarily for deployment on Vercel:

Connect the GitHub repo to a Vercel project.

Set the Production branch to main.

Add OPENAI_API_KEY in Vercel’s Project Settings.

Every push to main triggers a deployment.

For local development you can optionally use the Vercel CLI:

bash
Copy code
npm install
# if you have vercel CLI installed:
vercel dev
Versioning
GitHub Releases are used to mark stable backends.

Current stable: v3.0.0 – Clean backend with CORS + scoring

See CHANGELOG.md and ROADMAP.md for more detail.

yaml
Copy code

---

## 3. Frontend README text

In your **frontend repo**, put something like this in `README.md`:

```md
# Content Engine – Frontend

This is the React frontend for the Content Engine prototype.

It provides a single-page UI where an operator can:

- Paste or upload source text
- Select scenario and version type (complete / public)
- Choose one or more output types (press release, transaction text, etc.)
- Trigger **Generate** and **Rewrite** flows
- View previous versions and scores

The frontend talks to the backend hosted at:

```text
https://content-engine-backend-v2.vercel.app
(We may later move this into an environment variable.)

Tech stack
UI: React

Styling: Your existing CSS / component setup (Tailwind / custom classes)

Hosting: Vercel (static frontend)

Key behaviours
Generate: sends a POST /api/generate request with:

source text

selected output types

scenario

version type

model settings (temperature, max tokens, soft word limit)

Rewrite: sends a POST /api/rewrite request with:

existing draft text

operator instructions

scenario + version type

Responses are rendered into a versions list with:

generated text

score pills

metadata (scenario, version type, model)

Local development
If you want to run the frontend locally:

bash
Copy code
npm install
npm run dev   # or npm start, depending on your setup
Then open the printed http://localhost:xxxx URL in your browser.

Make sure the backend URL is reachable from your local machine.
(At the moment it’s hardcoded to the deployed backend; later we can switch this to a config variable.)

Deployment
The frontend is deployed as a static site on Vercel:

Production branch: main

Each push to main triggers a new deployment

Versioning
Frontend versions broadly track backend releases but are lighter-weight.

See the main project ROADMAP.md and CHANGELOG.md for overall history and planned work.

yaml
Copy code

If you’d prefer a shorter frontend README, we can trim this down later.

---

## 4. ROADMAP.md

You can put **one shared roadmap** in each repo (same content), or just in the backend and link to it from the frontend README.

Here’s a ROADMAP that matches everything we’ve been working on:

```md
# Content Engine – Roadmap

This roadmap is intentionally high level. It focuses on the sequence of improvements for the prototype as it evolves towards an “enterprise-portable” product.

---

## Now (current focus)

### 1. Stabilise core flows
- ✅ Stable `/api/generate` and `/api/rewrite` with OpenAI
- ✅ Consistent CORS handling across all endpoints
- ✅ Scenario + version type wiring end-to-end
- ✅ Model-based scoring returned to the frontend

### 2. UX / UI polish
- Ensure clear feedback for:
  - loading state while generating / rewriting
  - error states (network, backend errors, missing fields)
- Make scenario + version-type selection obvious and hard to misconfigure.

---

## Next

### 3. Versioning & history
- Persist versions (locally for now) with:
  - timestamp
  - scenario
  - version type
  - model
  - score
- Improve the versions list UI:
  - clear pill styling for scores (green / amber / red / neutral)
  - ability to select and re-open a previous version

### 4. Prompt & style refinements
- Iterate on the default style guide to better match target institutional tone.
- Add at least one additional output template:
  - e.g. short internal note or one-paragraph summary.
- Start capturing “prompt packs” for different workspaces / clients.

### 5. Configurability
- Move backend URL and model defaults into config / environment variables.
- Allow simple toggling of:
  - temperature
  - max tokens
  - soft word limit

---

## Later

### 6. Source ingestion improvements
- Support ingestion of:
  - PDF
  - DOCX
  - HTML pages (with cleaner boilerplate stripping)
- Design a simple “sources” panel in the UI:
  - list of ingested documents / URLs
  - ability to re-run generate against updated sources

### 7. Multi-workspace & style guides
- Introduce workspaces with:
  - separate style guides
  - separate prompt recipes
- Allow the user to choose a workspace at the start of a session.

### 8. Analytics and auditability
- Track basic usage metrics:
  - number of generations / rewrites
  - average score per output type
- Log enough metadata (without storing raw client text) to:
  - explain how an output was produced
  - support simple “show your work” discussions with stakeholders.

---

## Long-term vision

- Harden privacy and compliance (no raw client text stored by default).
- Add authentication and per-user project history.
- Provide export templates (Word / PowerPoint) suitable for institutional reporting.
- Position the engine as an internal tool that can sit in front of existing document repositories and workflow systems.
