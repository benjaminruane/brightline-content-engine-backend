# Cursor summary contract (hard requirement)

This document defines the **summary contract** for Cursor implementation work in this repo. It is a non-runtime, process guard.

## Dual-summary requirement

**Every Cursor implementation summary MUST include both:**

### A) Technical summary
- What changed in code (files, functions, parameters, behavior).
- Sufficient for a developer to review the diff and understand the implementation.

### B) Plain-language summary
- One to three sentences explaining the **user-visible impact**.
- What users or operators will notice (or not notice) after the change.

## Acceptance condition

A spec or task is **NOT** considered complete unless Cursor returns **both** sections (technical and plain-language) in its final response.

## Rationale

- Technical summaries support code review and maintenance.
- Plain-language summaries support product, QA, and stakeholder alignment and ensure user impact is explicit.

---

*Referenced by: A5.19 process guard.*
