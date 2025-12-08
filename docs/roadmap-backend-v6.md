# Brightline Content Engine — Backend Roadmap  
Version: **v6.0.0**  
Status: Stable

---

## 🎯 Near-term backend improvements

### 1. Word-Limit Handling (Active Development)
Goal: Soft compliance but **never truncate mid-sentence.**

Plan:
- Prompt instructs model to target word limit intelligently
- Hard fail-safe cap ~20–30 words above limit
- Respect Rewrite instructions when word limit overridden

### 2. Cleanup & Consistency
- Normalize response JSON shape across all endpoints  
  `{ draftText, score, label, meta }` etc  
- Remove legacy paths not used since v4
- Improve logging for failures with `console.error` payload context

### 3. Ask AI Web Search
- Already forced ON — no dependency on UI toggle  
Next:
- Smarter query packaging (`draft summary + extracted claims`)
- Structured citations (later, roadmap)

---

## 📌 Mid-term enhancements

### Statement Analysis Engine
- Expand implication reasoning text
- Categorize confidence more granularly
- Evaluate multi-model ensemble for reliability scoring

### Source Handling
- Add PDF parsing with chunking strategy
- Auto-tag sources by type: press release, website, regulatory, internal
- URL scraping fallback via HTML→clean text heuristic upgrades

### Generation Quality
- Templates per output type (press release tone, LinkedIn shorter, etc)
- Small RAG enrichment using ingested sources
- User-defined style & terminology dictionary

---

## 🚀 Long-term architecture opportunities

### Persistence Layer (optional)
- Project storage & retrieval
- Multi-user account model (future SaaS)

### Grounding Intelligence
- Web + documents + version history -> reasoning context graph
- Evidence trails with ranked source credibility score

### Observability & Scaling
- Usage metrics (token usage, request volume per feature)
- Error dashboards
- Retries with backoff on upstream fail

---

## Principles

- **Frontend remains fast, backend stateless**
- Expand compute only when feature demands it
- Modular function design so features can be containerized later
