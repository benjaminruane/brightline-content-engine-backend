# Which editorial rules need the document, and whether that can be paid for once

PROPOSAL. Not a build spec. No production-path change. Stage 6 pool left at 24.

Every claim is **CONFIRMED** (file and line, or a named committed artefact) or **HYPOTHESIS**. No model calls this pass.

B271 artefacts: `scripts/diagnostic/runs/stage-replay/old-a.json` (and old-b, new-a, new-b). Fixture `tests/fixtures/b247/shopify-messy-full-after.json`.

---

## Scoreboard

| | |
|--|--|
| How many of the 14 editorial rules need the whole draft, by the rule text? | **Three:** `materiality`, `voice_consistency` (the throughout clause), `audience_calibration_jargon` (first use). |
| Does that match B271? | **Mostly.** Eight of twelve stable shifts were `materiality` going clean. One was `audience_calibration_jargon` dropping. That matches. `narrative_coherence` also moved, against its own rule text. Measurement wins on that one. |
| P2: paying once per document | **(b) if findings stay per sentence. (c) if they become document findings. (a) is (b) under another name.** (c) is a question for Ben. |
| Recommendation | **Do neither C1 nor C2. Keep the draft on the per-sentence editorial call. Take the slower fix for the missing checks (tighten the Stage 6 pool, B268).** |
| P6 fallback (send fewer at a time) | **Still available. Changes no findings. Still needed.** P3's payload stance does not recover the 98. Named size: try 8. Wait up ~30 s (HYPOTHESIS, `review-cost-proposal.md` L296). TPM floor if all Stage 6 complete: about 101 s of tokens. Cap is 300 s. |
| Compact document context (Claude's favourite) | **Trap.** Claude's prediction is right. Materiality on this memo was proportion and restatement. A summary removes both. |
| This pass spend | **USD 0.** No ledger row. |

---

## P1. Which rules need the document?

Need: `sentence` = current statement only. `neighbours` = current plus CONTEXT BEFORE / AFTER. `document` = the whole draft. Evidence is the rule `description` in `lib/rulebook/editorialRules.js` / `complianceRules.js`, plus B271 where it contradicts that text.

### Editorial (14)

| id | Need | Why, from the rule text | B271 cross-check |
|----|------|-------------------------|------------------|
| `voice_consistency` | Mixed. Sentence for the first-person clause. Document for the throughout clause. | L33-36: "maintained throughout". "Flag unintended switches in voice within the document." The concatenated first-person instruction (`first-person-actor.mjs` L94-108) is about pronouns in the sentence under review. | Did not appear as a stable shift. The document half was not what the Shopify memo was paying for. Sentence-local half stands. |
| `overreach_unsupported_causal` | Neighbours | L52: "Judge this from the CURRENT STATEMENT and the surrounding draft only." "Surrounding draft" here is the B178 wall against sources, not a licence to scan the memo. CONTEXT BEFORE / AFTER is the surrounding the runner already supplies. CONFIRMED `editorial-compliance-reviewer.mjs` L1387-1394, L76. | No stable shift. Reading holds. |
| `underreach_hedging` | Sentence | L61: stacked hedges in the wording. Same "surrounding draft" sentence as overreach, same B178 purpose. | No stable shift. Reading holds. |
| `register_mismatch` | Sentence | L70: colloquialisms vs formality of the output type. Output type is already in the payload header. | No stable shift. Reading holds. |
| `audience_calibration_jargon` | Document | L83: "explained on first use". First use is a fact about the rest of the draft. | Index 60: both olds `audience_calibration_jargon` + `structural_integrity`; both news `structural_integrity` only. Matches. |
| `jargon_outside_audience_competence` | Sentence | L92: whether a term obstructs the intended reader. Visibility is in the payload. No first-use test. | No stable shift. Reading holds. |
| `marketing_language_excess` | Sentence | L109-110: listed hyperbole in the wording, plus `EVALUATIVE_LANGUAGE_INSTRUCTION` (`evaluative-language.mjs` L6-27), which is a remaining-clause test on this sentence. | No stable shift. Reading holds. |
| `narrative_coherence` | Neighbours by the rule. **Document-sensitive in the measurement.** | L120: "Evaluate against the previous and next statement where available." CONFIRMED. L76 names this as the only exception to current-statement-only. | **Measurement wins.** Index 93: both olds `narrative_coherence`, both news clean. Index 180: both olds `materiality`, both news `narrative_coherence`. CONTEXT BEFORE / AFTER were kept in B271. The extra sibling text in `FULL DRAFT` still moved this rule. That is the B99 leak, not a misread of L120. |
| `materiality` | Document | L129: "restating information already given", "incidental facts without relevance to the thesis". "Already given" and "thesis" are document facts. | **Matches.** Indexes 3, 65, 73, 86, 99, 113: both olds `materiality`, both news clean. Index 180: `materiality` to `narrative_coherence`. Eight of twelve stable shifts. |
| `structural_integrity` | Sentence | L138: grammar of this sentence. | Index 60 kept `structural_integrity` after the jargon code dropped. Did not move on its own. Reading holds. |
| `internal_plausibility` | Sentence | L151: "within the CURRENT STATEMENT only. Never compare the statement against source evidence or against other statements." | No stable shift. Reading holds. |
| `passive_voice_overuse` | Neighbours | L160: "flagged when used habitually across adjacent sentences". Adjacent, not the whole memo. | No stable shift. Reading holds. |
| `sentence_length` | Sentence | L169: word count and clause packing of this sentence. | No stable shift. Reading holds. |
| `cliche_and_filler` | Sentence | L178: listed filler phrases in the wording. | No stable shift. Reading holds. |

The live editorial call is not these 14 alone. Style is merged on v4. CONFIRMED `ARCHITECTURE.md` L46-48. One style rule is document-shaped: `abbreviation_first_use_expansion` (`styleGuide.js` L188, "expanded on first use"). It did not appear in the B271 stable set. The style moves that did appear (index 12 `currency_format` / `thousand_separator`, index 22 `defined_term_capitalisation` to `sentence_structure_clarity`, index 110 extra `oxford_comma`) are sentence-local by their rule text. Spec: measurement wins. Those three are wobble-or-leak, not a reason to keep the draft. They are not a reason to drop it either; B271 already used them as part of the 26.25 mean, which is why old-versus-old (13) is the floor.

### The three texts already disagree

| Text | What it says about using the draft | Where |
|------|------------------------------------|-------|
| Materiality rule | Needs "already given" and "the thesis" | `editorialRules.js` L129 |
| Evaluation scope | Only CURRENT STATEMENT. Sole exception `narrative_coherence`. | `editorial-compliance-reviewer.mjs` L76 |
| User payload | Pastes `FULL DRAFT` every time | L1404-1407 |

B271: the model follows the rule and the payload, and ignores L76. CONFIRMED by the eight `materiality` stables.

### What those eight sentences actually were (free read, no model)

| Index | Sentence (truncated) | Kind |
|------:|----------------------|------|
| 3 | A typical customer signs up using their credit card... | Incidental vs thesis. Not a duplicate string. |
| 65 | Shopify is a SaaS application for setting up and running an online store. | Restatement of the opener. The one n-gram case. |
| 73 | Track payment and shipping status on orders with detailed reports. | Feature list vs thesis. |
| 86 | Until just two months ago Shopify had not talked to a single company in the app ecosystem. | Looks like new information. Draft-on was a materiality flag; draft-off cleared it. |
| 99 | For Shopify, this is no different. | Deixis. Neighbours were present. Still moved. |
| 113 | It is in this area that Shopify is dedicating a large portion of its resources. | Deixis plus thesis. |
| 180 | They would love to move down market. | Became `narrative_coherence`, not clean. |
| 60 | Pricing plans are tiered... (jargon drop, not materiality) | First-use / insider term. Matches `audience_calibration_jargon`. |

A deterministic restatement detector would recover index 65. It would not recover the rest. **HYPOTHESIS, from the sentence text, not from a new run.** That is why a billed "materiality-only" replay was not worth even USD 0.60.

### Compliance (10)

Compliance user payload has no draft. CONFIRMED `editorial-compliance-reviewer.mjs` L1424-1431. If a compliance rule needs the document, it currently does not get it.

| id | Need by the rule text | Gets it today? |
|----|-----------------------|----------------|
| `promissory_or_guaranteed_language` | Sentence. Listed promise words. L14. | Yes. |
| `return_figure_gross_net_qualifier_missing` | Neighbours. "in the sentence or the immediately surrounding context." L23. | No neighbours in the compliance payload. **Gap.** HYPOTHESIS: the model uses only this sentence, so a qualifier in the previous sentence is missed. |
| `forward_looking_statement_without_qualifier` | Neighbours. "disclaimer nearby." L32. | Same gap. |
| `precise_confidential_detail_in_public_version` | Sentence shape. L41. Public only. | Yes. |
| `expected_disclosure_language_absent_on_public` | Document. Reviewer note L57: "Confirm the appropriate disclaimer is present elsewhere in the document or add one." | **No.** The note asks for a document the payload does not send. Public only; this Shopify run was `complete`, so it was not in B271. |
| `material_omission` | Sentence, tightly scoped to a missing counter-fact. L63. | Yes, as scoped. A counter-fact that lives elsewhere in the draft is out of scope as written. |
| `regulatory_prohibited_language` | Sentence. Fund-level claims in this wording. L72. | Yes. |
| `named_individual_attribution_in_public_content` | Sentence. A named person in this wording. L83. Public, press/LinkedIn. | Yes. |
| `selective_presentation_of_data` | Sentence, "specific counter-fact ... identifiable and missing." L94. | Same as material_omission. |
| `comparative_claim_without_basis` | Neighbours. "same sentence or immediate context." L109. | Same neighbour gap as return-figure. |

Compliance is not where the 55% lives. CONFIRMED `review-cost-proposal.md` L44-46: editorial 55.4%, compliance 15.0%. Do not redesign it to save the editorial bill.

---

## P2. The tension

A document-level rule still has to attach its finding to a sentence. One sentence, one card. CONFIRMED `ARCHITECTURE.md` L21, L59-60. The runner already calls Stage 6 with a one-statement array. CONFIRMED `pipeline-v4/index.mjs` L164, L605.

| Option | Verdict | Why |
|--------|---------|-----|
| (a) Not really batching, because the model sees one document and returns findings about it | **False.** | If those findings still name sentences, the model is judging a list of sentences in one window. That is the B99 defect made larger. CONFIRMED `docs/BACKLOG.md` B99: even one statement plus surrounding draft misattributes. A whole-memo call that returns per-sentence `materiality` is the same class. |
| (b) Batching wearing a different hat | **True, for any once-per-document LLM that still emits per-sentence codes.** | Same risk as the batched-x6 design already rejected in `review-cost-proposal.md` L161-173. Cost was never why sentences were isolated. CONFIRMED L145. |
| (c) Document-level findings, not per-sentence ones | **True as a product change, not as an optimisation.** | The screen and the contract have nowhere to put "this memo restates GMV too often" except on a card. CONFIRMED `ARCHITECTURE.md` L21 Stage 6 output shape: `editorialConcerns[]` on the statement. Inventing a document finding is a question for Ben: new surface, new contract, new QRS. Not a token trick. |

There is no (a). Choose (b) and accept B99, or choose (c) and ask Ben, or keep paying per sentence with the draft.

---

## P3. The design (written before arguing Claude's list)

The problem in one line: the editorial call is 55% of the bill and loses checks to TPM because every sentence carries the whole document, and B271 showed that document is load-bearing for `materiality` (and first-use jargon), not dead weight.

**Keep the per-sentence editorial call, keep `FULL DRAFT`, do not batch, do not summarise.** Recover the missing checks by tightening the Stage 6 pool (already filed as **B268**), not by starving `materiality`.

| Piece | What happens |
|-------|----------------|
| What the model receives | Unchanged: system rulebook (cached ~9,088 tokens. CONFIRMED `review-cost-proposal.md` L106) plus user CONTEXT BEFORE / CURRENT STATEMENT / CONTEXT AFTER / `FULL DRAFT`. CONFIRMED L1404-1407. House name still from `formatAuthoringOrganisationPromptBlock`, which reads the draft without pasting it. CONFIRMED `first-person-actor.mjs` L308-322. |
| How many calls a document costs | Unchanged: one combined editorial+style call per statement, one compliance call per statement. 186 + 186 on this memo. CONFIRMED `ARCHITECTURE.md` L21. Peak in-flight 48 at pool 24. CONFIRMED `pipeline-v4/index.mjs` L45, L575. |
| Which rules are judged where | All 14 editorial plus the style guide, on that per-sentence call, as today. No second document stage. |
| A finding about the document rather than a sentence | Does not exist. `materiality` remains a per-sentence code that happens to need document input. If Ben wants a document finding, that is P2(c), not this pass. |
| Prompt honesty, not a save | L76 currently forbids using the draft for every rule except `narrative_coherence`. The model uses it for `materiality` anyway. A later spec may except `materiality` and first-use jargon in that scope line so the prompt stops lying. That is not a cost lever. HYPOTHESIS: it could add flags, not remove tokens. |

Why not a clever split: splitting the 14 into two per-sentence calls leaves the draft on the expensive one, 186 times, and adds a cheap one. Net tokens go up. See P4 C1. Why not a once-per-doc materiality call: that is P2(b) or (c). Why not a summary: P4 C2.

| | Expected saving vs comparable Shopify editorial | Expected risk to findings, B271 terms |
|--|-----------------------------------------------:|--------------------------------------|
| This design (pay, then pool) | **USD 0** on the bill. Completions: 122/186 editorial toward 186/186, wall clock up. CONFIRMED the 122/186 hole is B268, not this proposal. | **0 vs the 13/40 old-versus-old floor.** |
| B271 as already measured (drop the draft) | On the 40: input 592,509 to 401,572 (32%). Cache hit 82-85% to 94-95%. Scale HYPOTHESIS on a full 186: about USD 2.2 list on editorial input (186 * 4,773 tokens * 2.50 / 1e6). Cached tokens still count toward TPM, so 429s may still happen. | **26.25/40 mean codesDiffer vs 13/40 wobble. 12 stable shifts.** Already killed. |

The honest answer is to leave the payload alone and pay. A design I do not believe in would be worse than that.

---

## P4. Claude's three, after P3

| Candidate | What is wrong | Better than P3? | The number |
|-----------|---------------|-----------------|------------|
| C1 Split the rules. Send the draft only on calls whose rules need it. | If the split is still per sentence, the draft still goes out 186 times on the document-rule call. Local call ~10,039 tokens (B271 new). Document call still ~14,813. Two calls: 186 * (10,039 + 14,813) vs today's 186 * 14,813. **More tokens, more TPM, more 429s.** If the document rules run once and return per-sentence codes, that is P2(b). | No. | **3 of 14** need the draft by rule text (`materiality`, `voice_consistency` throughout, `audience_calibration_jargon` first use). Not six. Even at 3/14, per-sentence split is not worth the complexity. The complexity is a second Stage 6 path, a second system prompt, a merge of two concern lists, and a new wobble floor. The save is negative. |
| C2 Compact document context (headings, opening lines, key figures). Claude's favourite. Claude has been wrong twice in this area. Claude's own prediction: trap, because materiality is proportion and a summary removes proportion. | **That prediction is right.** Index 65 is restatement of the opener: a summary would keep the opener and drop the restatement, which is the finding. Indexes 3, 73, 99, 113 are incidental-vs-thesis and deixis: a summary is exactly the thesis with the incidental lines removed, which is the proportion being judged. CONFIRMED by the sentence read above. | No. It is B271 with different missing sentences. | Token save would look like B271 or better. Finding risk would be at least B271's 12 stables, HYPOTHESIS worse. |
| C3 Do neither. Accept the cost. Take the slower fix for the missing checks. | Nothing is wrong with it as a findings stance. What is wrong is only if someone wanted a cost cut *and* complete checks *and* unchanged materiality. Those three are not available together. CONFIRMED B271 + B268. | **This is P3.** Pool tighten is the 429 fix. It does not cut cost. CONFIRMED `review-cost-proposal.md` L29. That sentence is still true. The sentence on L30 ("stop sending the full marked draft") is the one B271 killed. | Saving USD 0. Completions are the prize. |

---

## P5. How it would be proven

P3 is "do not change the payload." Stage-replay cannot A/B a no-change. The proof that this is right is B271 itself: old-versus-new 26.25 > old-versus-old 13, small control 4.5 vs 5. That result already killed dropping the draft.

| If someone still builds | Comparison on `scripts/diagnostic/stage-replay/` | Result that kills it |
|-------------------------|--------------------------------------------------|----------------------|
| C1 per-sentence split | Same 40, same four-run protocol, old = today's combined call, new = local call merged with document-rule call. Small control = prefix fixture. | Old-versus-new codesDiffer (on statements that succeeded in all four) **larger than** old-versus-old. Or the small control moves as much as the long memo. Or call count / list USD goes up. |
| C1 once-per-doc materiality | Same 40 cannot host it fairly: the once-call sees the whole memo, the 40 are a subset. Would need the 122 succeeded editorial cards, still four runs, still the prefix control. Cost HYPOTHESIS about USD 2-3 list if editorial-only on 122+17, which is the USD 3 cap. **Do not run it in this pass.** | Any stable `materiality` (or first-use jargon) codesDiffer vs today's per-sentence draft-on call, above the 13/40 floor, **or** B99-shaped misattribution (a quoted phrase that lives in a different statement). |
| C2 compact context | Identical to B271 protocol. Old = full draft. New = compact block. Same 40, same prefix. | Same kill as B271: old-versus-new > old-versus-old on the long memo. Expect a kill. |
| C3 / this recommendation | Not a payload A/B. Prove the fallback by a production completion count: editorial and compliance completed out of 186, against 122 and 152. CONFIRMED those denominators `docs/BACKLOG.md` B268. See P6. | If completions do not rise after a pool tighten, the fallback is wrong and we are back to TPM, not to C1/C2. |

---

## P6. The fallback, confirmed

98 checks lost: editorial `not_reviewed` 64/186, compliance 34/186. CONFIRMED `docs/BACKLOG.md` B268; Langfuse 64 + 34 ERROR on `de18131c-507f-4111-85ec-ffc15be7de8c`. Sample 429 TPM, Requested about 17288, try again in 77 ms. Four retries cannot buy a new minute. CONFIRMED `lib/observability.js` L462-463 (`RATE_LIMIT_MAX_ATTEMPTS = 4`, `RATE_LIMIT_MAX_DELAY_MS = 2000`).

| Question | Answer |
|----------|--------|
| Still available? | **Yes.** `STAGE6_CONCURRENCY = 24` is one constant. CONFIRMED `lib/qc/pipeline-v4/index.mjs` L45, used at L164 (replay) and L575-577 (production). `mapPool` already bounds in-flight statements. CONFIRMED `lib/qc/map-pool.mjs` L8. Peak calls are 2N because each statement fires editorial and compliance together. CONFIRMED `docs/BACKLOG.md` B265. Lower N. The named size is try 8. CONFIRMED `review-cost-proposal.md` L296. Tests that pin 24 (`tests/b265-stage-concurrency-pool.test.mjs` L23, `tests/b270-stage-replay-harness.test.mjs` L27) would move with it. Stage 5 stays at 24: it is already 186/186. CONFIRMED `async-review-build.md` L5. |
| Changes findings? | **No.** Same prompt, same one-statement array, same `FULL DRAFT`, same temperature 0. Only how many statements sit in `mapPool` at once. Editorial wobble (C4 / B271 old-versus-old 13/40) remains an API property. The pool does not add a new finding mechanism. It is the no-verdict-risk 429 patch named when B271 was held in reserve. CONFIRMED `review-cost-proposal.md` L275. |
| Wall clock already paid to reach 24 | About **21 s** on this memo: 61170 ms unbounded with Stage 5 fail-open, vs 81898 ms pooled at 24 with Stage 5 actually running. CONFIRMED `async-review-build.md` L43, L82. That 21 s is pooling plus real Stage 5, not a clean Stage 6-only delta. Fits the 300 s Function cap. CONFIRMED `ARCHITECTURE.md` L30. |
| Wall clock to finish the 98 | **HYPOTHESIS.** Two numbers, same direction. Named fallback size: lower to 8, whole-review wait **up ~30 s** from today's 82 s, so about **112 s**. CONFIRMED the estimate lives at `review-cost-proposal.md` L296; the 30 s itself is HYPOTHESIS. TPM floor if every Stage 6 call completes: priced Stage 6 input is 2.31M (editorial 1,807,204 + compliance 505,449). CONFIRMED `review-cost-proposal.md` L45-46, L271. Completing the misses at the same means: 64 * 14,813 + 34 * 3,325 ≈ 1.06M more input. Full Stage 6 input ≈ 3.37M. OpenAI TPM cap on the 429 text is 2,000,000 / min. CONFIRMED `async-review-proposal.md` L101. Floor: 3.37 / 2.0 * 60 ≈ **101 s of Stage 6 tokens**, before Stage 1 (35 s on this memo) and Stage 2. Whole-review wall today is 82 s with the 98 missing. A complete Stage 6 must wait longer. Band for the whole POST: **100 to 130 s**. Still under 300 s. Langfuse USD goes **up** (the 98 become priced), not down. Cached tokens still count toward TPM. CONFIRMED `review-cost-proposal.md` L271, L283. |
| Does P3 fix the 98 as a side effect? | **No.** P3 keeps `FULL DRAFT`. Mean editorial input stays ~14,813. CONFIRMED B271 old-a 592,509 / 40. The 429 is TPM, not schema. Same tokens per call, same burst shape at N=24, same 98. The pool tighten is not a side effect of P3. It **is** P3's 429 move. **Still needed.** Dropping the draft might have cut TPM enough to close B268 (HYPOTHESIS in `review-cost-proposal.md` L295). B271 killed that payload. Do not count an unshipped token cut as a 429 fix. |
| Retry instead of a tighter pool? | **No.** The server says try again in 77 ms. Four attempts capped at 2 s cannot open a new minute. CONFIRMED B268. |

The cost-proposal order is now complete: draft-drop A/B first (B271, failed), then tighten the pool as the findings-safe 429 patch. That patch is the next spec, not this one.

---

## Where this disagrees with Claude

| Claude said | This pass |
|-------------|-----------|
| `review-cost-proposal.md` L30: first move is stop sending the full marked draft. | **Killed by B271.** That was Claude. Do not retry. |
| C2 compact context is the favourite, and also a predicted trap. | Agree with the prediction. Disagree with treating it as a candidate worth building. |
| Implied C1: if only some rules need the draft, send it only then. | Only works if those rules run once. Once-plus-per-sentence-output is B99. The 3-of-14 split still duplicates the draft 186 times. |
| C3 accept the cost, slower fix for missing checks. | **Agree.** That is the recommendation. |
| P2(a) as a way around batching. | **Disagree.** (a) is (b). |

---

## Cost report

| | |
|--|--|
| Model calls this pass | 0 |
| List USD | 0 |
| Discounted USD | 0 |
| Measurement declined | A materiality-only 8-statement A/B would have been about USD 0.60 list. The sentence read already showed 1 of 7 cleared `materiality` cases is a duplicate string. Not enough to change P3. |
| Ledger row | None. Nothing billed. |

Prior comparable editorial share, for scale: list USD 4.684 of 8.450 on the Shopify after-run, 122 priced editorial of 186. CONFIRMED `review-cost-proposal.md` L44-45. B271 40-subset old list USD 1.54 / 1.53, new 1.05 / 1.05. CONFIRMED `docs/SPEND_LEDGER.md` 2026-09-20 row and the run files named above.
