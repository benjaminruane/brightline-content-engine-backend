# Brightline Content Engine — Backend Roadmap

Baseline lock: **v6.1.0-phase2**  
Production branch: **main**

This roadmap is authoritative.  
Backend work must align strictly with frontend UX constraints.

---

## PHASE 1 — Foundations & Stability
✅ Complete (locked)
 
Delivered:
- Stable API endpoints:
  - /api/generate
  - /api/rewrite
  - /api/query (Ask AI)
  - /api/analyse-statements
- Clear separation of Generate / Rewrite / Ask AI logic
- Calm, user-safe failure states
- No technical fallback text returned to users

Phase 1 is closed.

---

## PHASE 2 — Reliability & Behaviour Baseline
✅ Complete and locked at `v6.1.0-phase2`

Locked semantics:
- Ask AI always uses web search
- Statement Analysis always uses web search
- Generate and Rewrite use web search only if `publicSearch = true`
- Word limits treated as soft constraints
- Reliability scoring returned consistently
- No internal or debug language exposed

Phase 2 is closed.

---

## PHASE 3 — Quality & Correctness
🟡 Active (strictly scoped)

Phase 3 improves output quality and correctness only.

---

### A) Ask AI (Enquire)
- Improve answer depth and usefulness
- Improve citation relevance and clarity
- Reinstate structured **confidence rationale** field
- Maintain always-on web search

---

### B) Statement Analysis (Review)
- Improve reliability scoring logic
- Improve explanations and summaries
- Maintain calm empty / failure states
- No technical fallback language

---

### C) Rewrite Word-Count Precedence
Rules:
- Generate v1:
  - Word Limit field is authoritative
- Rewrite:
  - Explicit target length in rewrite instructions overrides Word Limit
  - Override applies to that run only

---

### D) Audio Input Support
- Accept transcribed instruction text from frontend
- No backend speech-to-text responsibility
- Treat audio input identically to typed input

---

## PHASE 4 — Workflow Maturity
⏸️ Deferred (out of scope)

Deferred:
- Endpoint refactors
- New API surfaces
- Major prompt architecture changes

---

## PHASE 5 — Ask AI Evolution
⏸️ Parked

Deferred:
- Structured grounding transparency
- Explicit draft vs source vs web prioritisation
- Structured citation objects
- Debug views for web search

---

## PHASE 6 — Core Engine & Architecture
🔮 Future / Optional

- Multi-model orchestration
- Embedding and caching
- Style-guide engine
- Export formats

---

## PHASE 7 — Enterprise Readiness
🔮 Long-term vision

- Multi-tenant support
- Audit logging
- Enterprise deployment options
