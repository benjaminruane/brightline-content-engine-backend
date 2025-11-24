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
