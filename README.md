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



## Review correctness principles (non-negotiable)

These invariants define the minimum trust bar for **Statement Analysis (Review)**. If any are violated, Review output must be treated as unreliable.

1) **Truthful absence claims**  
   Review must never say a fact/term/number is “not mentioned” or “not supported” by uploaded sources unless a corpus-level search over the full uploaded text was performed and found no match.

2) **No false “missing sources” language**  
   If uploaded sources exist (or citations exist), Review must not imply that the user “provided no sources” or that “no sources exist”.

3) **Citation–evidence consistency**  
   If citations are present, evidence must be resolvable to reference titles/URLs. Uploaded sources may have `url: null` and are still valid. “Citations missing” only when citations are actually empty.

4) **Correctness over confidence**  
   Review must not emit confident absence claims if the system has not checked the full relevant corpus.

5) **Ambiguity is not absence**  
   If multiple plausible anchor values exist (e.g., multiple valuations), Review must flag ambiguity and name the competing values—never claim “not mentioned”.

6) **Contradiction scope**  
   “Contradicted” applies only to statement-vs-sources conflicts. Draft-to-draft internal consistency is out of scope for Review.

7) **Explain, don’t rewrite**  
   Review diagnoses and explains scoring; it may provide structural/evidentiary guidance (e.g., split bundled claims), but must not propose rewritten sentences verbatim.

8) **Deterministic safeguards for anchors**  
   Numeric/anchor facts (valuation, funding, dates, percentages) must be normalized (e.g., `$25mm` == `$25 million`) before declaring mismatch/absence.
