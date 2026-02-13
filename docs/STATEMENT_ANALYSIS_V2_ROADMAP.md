# Statement Analysis V2 — Domain Closure Roadmap

**Scope:** Domain-level assessment and sequencing for Statement Analysis post–A3.17.8. No pipeline redesign, no canonicalClaims/EvidenceMatch/reliabilityScore model redesign.

**Product bar:** Investment-grade, deterministic, audit-explainable, evidence-first, stable, internally self-consistent. Defensible in IC, due diligence memo, and LP/IC audit contexts.

---

## PART 1 — Remaining Correctness Risk Domains

Grouped by domain (not by file/function).

### 1. Emitted truth vs canonical truth semantic clarity

- **What:** Emitted statement truth = `assessment.citations` + `assessment.evidence` (and any product surface that shows “what we stand behind”). Canonical truth = `assessment.canonicalClaims` (including per-claim `citations`). Known behaviour: canonicalClaims may still contain citations when statement-level emitted support has been cleared (Low + Not Supported).
- **Why it matters:** In IC/audit, “we show no citations for this statement” must not be contradicted by another layer that still shows claim-level citations. A3.17.8 already clears emitted citations/evidence and normalizes v2Reasoning/supportTopology to emitted; the remaining risk is **interpretation** (e.g. an analyst opening canonicalClaims and inferring support).
- **Severity if left as-is:** Medium. Behaviour is intentional and documented; risk is misuse or UI surfacing canonical citations as if they were emitted.
- **Mitigation already in place:** A3.17.8 clears emitted; v2Reasoning and supportTopology are derived from assessment (post-clear). No dual truth in **emitted** surface.

### 2. Statement-level vs corpus-level reconciliation semantics

- **What:** Corpus inventory and tuple conflict detection are built from **all** statements’ canonical claims (and raw claims) and their citations. They represent “what the corpus of claims and citations implies,” not “what we emit per statement.” So corpus meta (e.g. `corpusContradictions`, `contradictionSignals`, inventory buckets) can reflect claim-level citations that no longer appear in emitted statement-level citations after A3.17.8.
- **Why it matters:** Investment-grade posture requires that “statement truth” (emitted) and “corpus truth” (aggregate claim/citation view) are **explainable** as distinct. If an LP asks “why does the corpus show a conflict involving this statement when the statement has no citations?” the answer must be crisp: corpus is built from canonical claim layer; statement emission was gated.
- **Severity if left as-is:** Low–medium. Logic is correct; the gap is **semantic documentation and, if needed, a single clarification field** (e.g. that contradictionSignals are corpus-derived, not statement-emitted).
- **Mitigation already in place:** supportTopology and per-statement contradictionSignals are computed in Pass 2 from **assessment** (emitted) for support counts; contradiction level/conflictTypes are derived from corpus tuple keys. So support counts are already statement-aligned.

### 3. Selection-mode determinism edge cases

- **What:** Selection mode uses `selectionHash` (and `statementScopeKey`) for canonical ID scope and for corpus/evidence path. Determinism depends on: same selection text → same hash; same request ordering and corpus → same claim set and scores. Edge cases: whitespace/normalization in selected text, multi-segment selection ordering, and any code path that branches on selection without normalizing input.
- **Why it matters:** “Stable across runs” and “deterministic” are non-negotiable for IC. Re-running the same memo + selection must yield the same statement outcome.
- **Severity if left as-is:** Low if current normalization (e.g. trim, hash of selected text) is consistent everywhere selection is used; medium if there are untested code paths (e.g. segment ordering, optional fields) that can change outcome.
- **Mitigation already in place:** selectionHash and statementScopeKey are used for canonical ID generation and for diagnostics; selection is passed explicitly through the pipeline. No change to selection semantics requested—only **assurance** (tests or doc) that determinism holds.

### 4. Evidence coverage interpretation edge cases

- **What:** Coverage is expressed in several places: v2Reasoning.evidenceCoverage (claim-level), supportTopology (support spread, corroboration), coverageGap (sources referenced vs total), and EvidenceMatch (hasNumericPresence, matchedNumbers). “Coverage” can mean: (a) which claims have at least one citation, (b) how many sources support the statement, (c) whether numeric anchors were found in corpus. Ambiguity: a statement can have “no emitted support” (cleared) but still have matcherSupport / EvidenceMatch truth (e.g. matcher found something that was later gated).
- **Why it matters:** For “coverage gap” and “what’s missing” to be audit-explainable, the **meaning** of each coverage signal must be clear and not conflated with emitted support.
- **Severity if left as-is:** Low for correctness (v2Reasoning is normalized to emitted; matcherSupport is explicitly additive meta). Medium for **explanation quality** if UI or narrative mixes “matcher saw support” with “we show support.”
- **Mitigation already in place:** A3.17.7/17.8: emitted cleared and v2Reasoning normalized; matcherSupport preserved as meta. So correctness is maintained; remaining work is clarity of explanation and labelling.

---

## PART 2 — Product Value Domains (Not Bug Fixes)

### 1. Evidence explanation quality

- **What:** Clear, deterministic explanations for why a statement (or claim) is Supported / Not supported: which sources, which anchors, and how they align. Today: reasons and evidence notes exist; quality is variable and not always tied to the same vocabulary as v2Reasoning/supportTopology.
- **Why high value:** Directly supports “analyst can understand why score = X” and “defensible in due diligence memo.”
- **Backend vs frontend vs shared:** Backend: ensure reasons and evidence notes are derived only from emitted truth and use consistent terminology (e.g. “supporting sources,” “no citations”). Frontend: present them without mixing in matcher-only or canonical-only signals. Shared: agree a single vocabulary (e.g. “statement support” vs “corpus conflict”).

### 2. Conflict explanation narrative quality

- **What:** When contradictionSignals or corpusContradictions exist, explain in plain language: what type of conflict (e.g. valuation, ownership), whether it’s hard (multiple sources) or soft (single source), and how it relates to the **statement** (e.g. “this statement’s claim type appears in a corpus-level conflict”).
- **Why high value:** LPs and IC need to know “there is a conflict” and “what it means for this sentence,” not just raw tuple keys.
- **Backend vs frontend vs shared:** Backend: expose conflict level, conflictTypes, and optionally a one-line narrative per statement. Frontend: surface conflict in a way that doesn’t overstate (e.g. “corpus conflict” not “this statement is contradicted” when only corpus-level). Shared: semantics of “corpus-derived” vs “statement-emitted.”

### 3. Coverage gap insight quality

- **What:** “Which sources were not used for this statement?” (coverageGap) and “which claim types had no support?” (e.g. missingClaimTypes in v2Reasoning) as actionable insight, not just numbers.
- **Why high value:** Supports “what’s missing” and “where could we strengthen evidence” without guessing.
- **Backend vs frontend vs shared:** Backend: already has totalSourceCount, referencedSourceCount, missingSourceCount; can add stable labels or IDs for “missing” sources if useful. Frontend: present gap in one place (e.g. “3 of 5 sources not cited for this statement”). Shared: keep “coverage gap” clearly as “sources not referenced,” not “matcher didn’t see them.”

### 4. “What would raise this score?” meta

- **What:** Additive, deterministic hints: e.g. “add a second source,” “add citation for valuation claim,” “resolve corpus conflict on type X.” No new scoring model—only derived from current signals (supportTopology, evidenceCoverage, contradictionSignals).
- **Why high value:** Analyst assist; reduces “black box” perception.
- **Backend vs frontend vs shared:** Backend: derive from existing meta (e.g. if supportingSourceCount === 1 → “second source would strengthen”; if missingClaimTypes.length > 0 → “cite for these claim types”). Frontend: show as suggestions. Shared: keep suggestions evidence-based and deterministic (no probabilistic “maybe”).

### 5. Cross-source weighting explanation

- **What:** When multiple sources support a statement, explain that “support is multi-source” or “single-source” (supportTopology.supportSpread) and, if desired, which sources (supportingSourceIds in v2Reasoning after normalization). No change to how weighting is computed—only clarity of explanation.
- **Why high value:** Due diligence often asks “which documents support this?”
- **Backend vs frontend vs shared:** Backend: already has supportingSourceCount and can expose supportingSourceIds in a stable way. Frontend: show “Supported by 2 sources” and optionally list them. Shared: ensure IDs align with references/citations schema.

### 6. Analyst assist layer

- **What:** Optional UI/UX that surfaces: (1) statement truth vs corpus truth, (2) conflict summary, (3) coverage gap, (4) “what would raise score,” (5) evidence explanation—in one coherent panel or tooltip set.
- **Why high value:** Turns meta into insight and reduces cognitive load for IC/LP review.
- **Backend vs frontend vs shared:** Backend: keep meta schema stable and documented. Frontend: own layout, copy, and progressive disclosure. Shared: contract for statement + meta so frontend can render without re-interpreting semantics.

---

## PART 3 — Suggested Sequencing (Macro Only)

- **Phase A — Close remaining truth ambiguity**  
  - Clarify and document: emitted vs canonical; statement vs corpus.  
  - Optional: single “semantic hint” field (e.g. `emittedSupportCleared` already exists; ensure corpus-derived signals are explicitly labelled where consumed).  
  - No algorithm change to canonicalClaims or EvidenceMatch.  
  - Outcome: No interpretative contradiction; audit trail can point to one source of truth for “what we show.”

- **Phase B — Explanation & analyst confidence layer**  
  - Improve evidence and conflict explanation quality (reasons, conflict narrative, coverage gap wording).  
  - Add deterministic “what would raise this score?” hints derived from existing meta.  
  - Keep all explanations evidence-first and deterministic.  
  - Outcome: Analyst can answer “why score = X” and “what would improve it” from the product.

- **Phase C — Corpus intelligence exploitation**  
  - Use corpus inventory and conflict candidates for analyst-facing insight (e.g. “this statement’s claim type appears in a corpus conflict”) without changing how corpus meta is computed.  
  - Optional: one-line narrative per statement for corpus conflict relevance.  
  - Outcome: Corpus truth is clearly explained and actionable where relevant.

- **Phase D — UX translation & simplification**  
  - Frontend consumption of v2Reasoning, supportTopology, coverageGap, contradictionSignals, matcherSupport (with clear labelling).  
  - Single “statement analysis” experience: score + reasons + evidence + conflicts + coverage gap + “what would raise score.”  
  - Outcome: One coherent analyst-facing surface; no dual truth in UI.

---

## PART 4 — Diminishing Returns Boundaries

Explicit boundaries beyond which further tightening adds negligible investment-grade value:

1. **Over-synchronizing canonicalClaims with emitted truth**  
   - Do not change canonicalClaims so that claim-level citations are cleared when statement is Low + Not Supported. Constraint is accepted; product surface and docs should treat “canonical” as internal/extraction layer, not the emitted guarantee.

2. **Over-modelling matcher internals into product surface**  
   - matcherSupport and EvidenceMatch are for diagnostics and optional “why we downgraded” context. Do not push matchQuality, internal thresholds, or fuzzy vs exact into primary narrative. Keep “supported / not supported” and source counts as the primary story.

3. **Over-precision in support ID semantics**  
   - supportingSourceIds and citation IDs need to be stable and consistent with references. Avoid proliferating multiple ID spaces or “support ID vs citation ID vs reference ID” distinctions in the product copy. One clear mapping is enough.

4. **Excess micro-gating layers**  
   - A3.17.8 is one clear gate (Low + Not Supported → clear emitted). Avoid adding further conditional clears or normalizations that depend on subtle phrase matches or score bands. One gate, one place.

5. **Probabilistic or generative explanation layer**  
   - Do not add “AI-generated summary of why” or confidence intervals. Investment-grade = deterministic, evidence-first explanations only.

6. **Rebuilding corpus or tuple logic for “perfect” statement alignment**  
   - Corpus inventory and tuple conflict are corpus-level by design. Do not redesign them to be statement-emitted-only; instead, document and label them as corpus truth and use them for insight, not as the single source of statement support.

---

## PART 5 — Risk If We STOP After Each Phase

- **Stop after Phase A**  
  - **Risks remaining:** Explanations may still be terse or inconsistent; no “what would raise score”; corpus conflict may be under-explained; UI may not yet surface meta.  
  - **Investment-grade:** Yes, for “truth is unambiguous and defensible.” Emitted vs canonical and statement vs corpus are clear; audit can rely on emitted + meta.  
  - **Audit posture:** Defensible. Remaining work is quality of explanation and UX, not correctness.

- **Stop after Phase B**  
  - **Risks remaining:** Corpus intelligence not yet fully surfaced; UI may still show only score/reasons without topology, gap, or conflict.  
  - **Investment-grade:** Yes. Explanation and analyst confidence are materially improved.  
  - **Audit posture:** Defensible. “Why score = X” and “what would improve” are answerable.

- **Stop after Phase C**  
  - **Risks remaining:** Frontend may not yet present a single coherent “statement analysis” view (e.g. meta still only in API).  
  - **Investment-grade:** Yes. Backend and semantics are complete; value is in clarity of conflict and corpus insight.  
  - **Audit posture:** Defensible. Remaining risk is UX completeness, not correctness or explainability.

- **Stop after Phase D**  
  - **Risks remaining:** Only incremental polish (copy, layout, performance).  
  - **Investment-grade:** Complete for v1 commercial release (see below).  
  - **Audit posture:** Full. One source of truth, clear explanations, and a single analyst-facing surface.

---

## When Is Statement Analysis “Investment-Grade Complete for v1 Commercial Release”?

**At the point where:**

1. **Emitted truth is the single product truth** for “what we show” (citations, evidence, support). Canonical and corpus layers are documented and, where surfaced, clearly labelled (Phase A).
2. **Every score is explainable** from evidence and reasons, and “what would raise this score” is deterministically derivable from existing meta (Phase B).
3. **Corpus conflict and coverage gap** are explained in plain language and not conflated with statement-level support (Phase C).
4. **The analyst sees one coherent surface** (score + reasons + evidence + support topology + coverage gap + conflict + suggestions) without dual truth or undefined terms (Phase D).

**What must be true at that point:**

- No contradiction between layers in the **emitted** product surface (already true post–A3.17.8; Phase A locks semantics and docs).
- Deterministic, evidence-first explanations only; no probabilistic or generative “why” in the guarantee path.
- Audit trail: IC/LP can point to “statement assessment + citations/evidence + meta” and reproduce the same outcome for the same inputs.
- Diminishing-returns boundaries are respected: no over-sync of canonical, no over-exposure of matcher internals, no extra micro-gates.

**Conclusion:** Statement Analysis can be considered **investment-grade complete for v1 commercial release** when **Phase D** is done and the above four conditions hold. Phases A–C are the correctness and explanation closure; Phase D is the UX translation that makes the guarantee visible and usable in one place.

---

## A3.20.9 — IC Attention Signals + Evidence Gap Priority (Implementation Summary)

**Plain Language Implementation Summary (1–3 sentences):**  
IC attention prioritisation lets analysts and IC quickly see which statements need review first—for example, strong economic claims with high risk, salient claims with fragile evidence, or claims that disagree across the document. Gap prioritisation ranks which missing deal fields matter most for decisions (e.g. missing valuation when investment is present, or missing ownership when both investment and valuation exist), so the memo owner knows what to fill in first to support pricing and outcome validation.
