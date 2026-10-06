# Architecture

How the QC pipeline runs after the v4 rebuild, as of 2026-09-25. Cursor reads this before a spec that touches Review. It is the pipeline contract, not the sprint board. For status and backlog see `docs/ROADMAP.md` and `docs/BACKLOG.md`. Last audit: `docs/DOC_TRUTH_AUDIT.md` (B305 drift check 2026-09-21).

High-level flow: uploaded sources plus draft text go through pipeline stages to one qcCard per sentence-level statement. The frontend renders that contract. It does not re-derive evidence verdicts.

---

## 1. Pipeline stages (v4)

The v4 route (`lib/qc/pipeline-v4/`) runs seven logical stages. QC LLM stages use the pinned snapshot in `lib/qc/model-config.mjs` (`gpt-4o-2024-08-06`) at temperature 0. Do not spec a floating `gpt-4o` alias.

| Stage | Purpose | LLM or deterministic | Frequency | Output shape |
|-------|---------|----------------------|-----------|--------------|
| **1 Statement extraction** | Split the draft into sentence-level statements with character offsets. | LLM, deterministic fallback if validation fails | Once per QC run | `{ text, charStart, charEnd, index }` plus `source` (llm or fallback), `errors`, and `droppedNonClaims` (text, offsets, reason) for sentences the model marked not-a-claim. The split is unchanged. Coverage after the split names remaining uncovered runs on `meta.draftCoverage` (**B249**). Residual: **B248** is one instance of that class. |
| **1b Claim-span extraction (B53a)** | For sentences that pass a deterministic compound pre-filter, extract internal claim spans (verbatim contiguous substrings of the parent). Failed validation reverts undecomposed. Flag `QC_CLAIM_SPANS` (default ON). | Deterministic pre-filter plus batched LLM; all-or-nothing code validation | Once per QC run, one batched call, up to 12 candidate sentences | Per decomposed sentence: 2-3 `{ text, localStart, localEnd, draftStart, draftEnd }`. Caps: 3 claims per sentence, 12 decomposed sentences per run (`claim-spans.mjs`). |
| **2 Source matching** | For each statement (and, when decomposed, each claim), ask each uploaded source whether the text is supported, partially supported, contradicted, or not addressed. | LLM | Once per statement x source pair (plus claim x source when 1b decomposed) | `{ statementIndex, sourceIndex, classification, passage, explanation, systemFingerprint }`. Classifications: `confirmed`, `partially_confirmed`, `conflicting`, `no_support`, `not_reviewed`. Cap `STAGE2_CONCURRENCY` (24). Every request sends `seed=1`. A throw or schema fail stamps `not_reviewed` and continues (**B250**). A passage the matcher cannot re-locate is emptied; the classification is kept (**B251**), except a `confirmed` class with an empty passage is refused as `not_reviewed` (**B351**). Before blanking, Stage 2 tries B325 recovery once; a rescued source slice is kept and logged as recovered (**B352**). Exact and normalised recovery use the full pointer. The Levenshtein window path is bounded at 400 characters; hitting that bound is a logged miss (`window_bound`, statement index and length), never a truncated match (**B359**). Recovery's figures guard still runs. When a pointer is two source sentences that are not one stretch, recovery locates each sentence and joins them with a visible gap in the one passage string. |
| **3 Verdict aggregation** | Combine pair classifications into one evidence verdict, then optional B53a upgrade-only rollup. Each pair is first run through a confirming-passage figure demotion (**B345**, **B346**, **B347**, **B372**): a `confirmed` passage with a `kindNameSame` quantity at a different value becomes `conflicting`; a `confirmed` passage with one eligible money token that is not the same quantity, and no rule-(b) match, becomes `conflicting` when the source figure is tagged `total` and the statement figure is unqualified, otherwise `partially_confirmed`. The same rule-(b) loop compares a statement date to a source date of the same subject family (reporting period vs year-end; month-count must match when both sides name one; `from` is not `to`). Before that demotion, assembly may append one source sentence that carries a date of that family even when the value differs, only when no existing span already holds such a date (**B372**). No date of that family in the source means no span is added and no comparison runs. A component-tagged money token is not eligible. Currency symbols `€` `£` `¥` resolve to EUR/GBP/JPY; a bare `$` does not. Then the pair is reduced to the most serious of its single-pick classification and every locatable widened `supportSpan` (conflicting, then partially_confirmed, then confirmed, then not_supported). `not_reviewed` pairs are non-voters. Widened passages are not extra Stage 3 voters. | Deterministic | Once per statement | `{ verdict, hasConflict, contributingSourceIndices }`. Precedence: any `conflicting` then conflicting; else any `confirmed` then confirmed; else any `partially_confirmed` then partial; else `not_supported`. If every pair is `not_reviewed`, the card is `not_reviewed`. `hasConflict` is true if any reduced pair is `conflicting`. Upgrade-only rollup (flag ON): if base is `partially_confirmed`, every claim is `confirmed`, no unclaimed verifiable anchor remains, and no whole-sentence source returned `conflicting`, verdict becomes `confirmed`. Claim spans may never downgrade a verdict, alter `hasConflict`, or override a sentence-level conflict. Supersession can demote a pair before this step. Coverage-union can promote a partial to confirmed only when `QC_MULTISOURCE_COVERAGE` is on (default OFF). |
| **4 Excerpt selection** | Pick which source passages appear on the QC card. On a conflicting or partially_confirmed verdict, prefer a stored passage of that class that carries the disputed figure (**B345**, **B346**). A number-free confirming quote may not be the only quote on such a card. On a conflicting verdict, if `conflictExcerpt` would be null or not a distinct passage from `primaryExcerpt`, fill it from another stored span when one exists (**B348**, **B360**). A conflict card with only one stored passage leaves `conflictExcerpt` empty with `conflictExcerptEmptyReason: no_distinct_passage` (**B362**, reopening **B158**). A confirmed or partial card may use the same second slot for a distinct supporting passage. Ceiling two. A second passage is kept only when it carries at least one of the claim's terms. On a non-conflict face it must add a term the primary does not already show. Neighbouring cards are not consulted (**B364**). On a confirmed verdict, fall back to a stored span when the single-pick is empty, and prefer the locatable passage with the highest overlap on the statement's own figures and distinctive phrasing (**B351**). A displayed quote is whole sentences (**B359**, succeeding the 300-character window of **B358**). A ceiling of six sentences may drop whole sentences, lowest relevance first, never the ones carrying the claim's figures, dates, or names. A drop is marked with an ellipsis at the cut. One long sentence is shown in full. The ceiling never decides whether a quote was found. | Deterministic | Once per statement | Stage 4 still builds excerpt objects with `passage` (a pointer) and `sourceLabel`. Scoring uses the full held passage. Assembly recovers a source slice via `lib/qc/excerpt-from-source.mjs` and writes that slice as `primaryExcerpt`, never the model's typing (**B325**). Only a recovered slice is stored; a miss is null with `excerptNotLocatable: true` (**B259**, **B251**). When a located `supportSpan` exists, assembly uses the widest held span that contains the pointer, then trims to whole sentences (**B351**, **B358**, **B359**). `conflictExcerpt` is still an object, with `passage` also a source slice or null. A supported or partial card with no pointer and no locatable span searches the uploaded sources for sentences that carry the statement's own figures and names and shows those, joined with a visible gap when they are not one stretch (**B359**). `primaryExcerpt` remains a string. `conflictExcerpt` is the second shown passage when it is distinct from primary. A one-passage conflict card does not copy primary. The frontend labels a distinct second quote `Conflicting excerpt` only on a conflict face (**B360**, **B362**). |
| **5 Commentary generation** | Reviewer-facing prose explaining the evidence finding, not the verdict. | LLM | Once per statement | Success: prose on `evidenceSummary` / `reasoningParagraph`. Miss: empty strings plus `commentaryNotReviewed: true`. A miss is not a finding (**B254**). The user prompt includes `claimInventory` (verifiable anchors plus a closed scale and cause lexicon from the statement, cap 8). The prompt requires the commentary to address every item, including items that are fine, and not to claim support the excerpts do not carry (**B354**). A card that is not green opens with what is wrong, in one sentence, before any restatement (**B364**). Concurrency is planned at run time from the live TPM remaining window (**B277**). |
| **6 Editorial+Style and Compliance** | Apply rulebook-driven craft and regulatory concerns. Evaluation scope is the current statement. The editorial user payload still includes CONTEXT BEFORE / AFTER and the full draft marked `[REVIEW THIS]`. Those are different facts. Do not cite "current statement only" as a cost claim. `narrative_coherence` is omitted from the listed rules unless `QC_NARRATIVE_COHERENCE` is on (default off) (**B348**). Editorial still ran; switching the rule off is not switching the check off. | LLM, two calls per statement (combined Editorial+Style, Compliance separate) | Once per statement | `editorialVerdict`, `editorialConcerns[]`, `complianceVerdict`, `complianceConcerns[]`, notes, direction/rewrite. Optional `span` (R5.1). Concurrency is planned at run time from statement count, estimated tokens per call, and live `x-ratelimit-remaining-tokens` (**B277**). A 429 waits until the call can fit, inside remaining Function time minus the TPM-floor of remaining work (**B278**). Hitting that bound stamps honest `not_reviewed` with reason `rate_limit_window`, never `clean`. |
| **7 Card assembly** | Merge evidence, commentary, and review results into the qcCard contract. | Deterministic | Once per statement | Shared assembler `lib/qc/pipeline-v3/stage7-assemble-card.mjs`. When editorial or compliance is off, the payload stamps `not_reviewed` (**B247**). Absent `reviewOptions` is `not_reviewed`, never `clean` (**B302**). A check-ran flag is `=== true`, never `!== false` (**B299**). `classifyCard` then stamps `summaryClass`, including `cardTone` and `turnedOffLine` (**B294**, **B296**, **B298**). `joinCheckNames` is the only joiner for the turned-off and clean footer lists (**B304**). Off is `null` on that signal and does not vote on colour. An unlocatable primary excerpt is stored as null with `excerptNotLocatable: true` (**B259**, **B251**). The displayed passage is always sliced from the named source; the model's pointer is never shown (**B325**). If the evidence verdict would otherwise read Confirmed (`supported_full`) with no locatable excerpt, `displayVerdict` is `unverifiable` with `evidenceNotReviewedReason: excerpt_not_locatable` (**B325**, succeeding **B322**), unless a rewritten `supportSpan` holds a locatable passage, in which case that passage is shown (**B351**). A supported card with no locatable passage anywhere, including empty confirmation, first searches the source for claim-bearing sentences (**B359**); if none are found it reads `not reviewed` with the excerpt reason, never a silent Confirmed (**B351**). A conflict whose only stated ground is that the source does not mention something a stored span contains as a verbatim slice is not a conflict (**B351**). A "does not mention" sentence is dropped, without changing the verdict, when a displayed quote already holds the subject of that clause (names and figures together), not a neighbouring figure (**B362**). If that drop would leave a non-green card with no sentence saying why, the rule does not fire and the skip is logged. A confirming sentence in assembled commentary is not introduced by a contrastive (**B351**). On a non-green card, a confirming sentence joined with Additionally or Also is marked Separately (**B364**). An offered Implement Changes replacement is restyled to house form (unambiguous currency glyph to ISO, and the other token-safe style-guide rules) before it is shown; the source quote is not rewritten (**B364**). The proposal engine can substitute a swapped name the source states on the card, together with any uniquely paired figure in the same sentence, or it offers nothing (**B374**). Sentence splitting for that strip and for omission-conflict drop does not treat a decimal point as a terminator (**B355**). A flagged editorial concern is dropped when its objectionable term is already in a passage matched to that card. Causal and evaluative families use the connective or the deleted word, with no two-word floor. Causal connectives compare by a suffix stem on the closed list tokens only, not by exact spelling, so `driven by` and `driving` are the same relation (**B372**, succeeding **B355** for word endings). Other codes keep whole-phrase containment and the two-word floor (**B355**, succeeding **B354** Part 1 for those two families). Empty terms never fall back to the whole phrase. Framing fidelity is untouched. After contrastive stripping, assembly may append at most two match-the-source sentences for inventory items that appear verbatim in a confirming passage, never from `conflictExcerpt`; leftover items sit on diagnostic `commentaryUnaddressed` and are not rendered (**B354**, **B356**). A figure or date is worded `13% matches the source.`; a phrase is worded `The phrase 'driven primarily by' matches the source.` (**B363**). Those match sentences are dropped when the assembled card is not green, so a finding is not followed by reassurance (**B363**). A confirming card whose leading actor (first six words) is a different source-vocabulary name from the confirming passage is displayed as `conflict` / high with `displayVerdictReason: "actor_mismatch"` (**B358**, succeeding the **B354** partial cap), only when `QC_ACTOR_OF_THE_ACTION` is on; the check exists and is off by default (**B371**). A first-person subject in a confirming source passage is resolved to the unique name the source uses of itself in its opening; the draft's first person is never resolved (**B364**). Where a draft and a displayed quote each name exactly one party after the same role preposition (`from`, `to`, `by`, `with`) and those names are not the same word, assembly prepends `The statement attributes this to X; the source credits Y.`. A green card is displayed as `conflict` / high with `displayVerdictReason: "role_party_mismatch"`; an already non-green card keeps its verdict (**B363**). Zero or several names on either side, the same name, or more than one preposition firing, stands down. Comparison is exact after case and trailing possessive. The Jaccard name matcher is not used. A leftover `supported_partial` card whose draft subject is generic (`the company` / `the firm` / `the group`), with no named-check slug, may be lifted to `supported_full` when the immediately preceding statement names exactly one source-vocabulary party and the confirming passage names that party and itself uses `the company`. The guess never creates a finding, never moves a verdict toward conflict, and never asserts support on a silent card. Defined-term `the Company` stands down. Zero or several antecedents, or a passage that does not name that party, leaves the card unchanged (**B372**). A confirming card that claims a universal set (`essentially all` / `all of its` / `across ... investments`) whose confirming passage names exactly one holding as the gain is displayed as `conflict` / high with `displayVerdictReason: "scale_set_one_holding"` (**B362**). Arithmetic over two comparable money figures (exactly one money figure in each of two displayed passages) can demote when the claimed scale fails; a prior-year pair in one quote is not comparable. `supportState` is unchanged except on the B351 omission-conflict path. The row reads Unverifiable, not Confirmed and not Not checked, when a pointer existed and could not be recovered. Not checked stays for a check that was off or did not run. A requested miss carries `editorialNotReviewedReason` / `complianceNotReviewedReason` / `evidenceNotReviewedReason` (**B300**, **B322**, **B325**). A `supported_full` card that carries at least one `framingFidelityConcerns` entry is displayed as `supported_partial` with concern level `moderate` and `displayVerdictReason: "framing_fidelity"` (**B348**). `supportState` stays `supported`. The framing note is unchanged. A card that shows a quote always carries a comment; an empty comment under a verdict is not an acceptable state (**B369**). |

Execution in `runPipelineV4`: Stage 1, then 1b when the flag is on, then Stage 2, then the widened matcher, then Stage 3 (and supersession / coverage-union), then Stage 6, then Stage 5, then Stage 7. Stage numbers follow the architecture spec (evidence block first, then commentary, then craft/compliance), not wall-clock order.

Real-run fixtures: `tests/fixtures/real-runs-2026-10-02/` is the shipped pipeline (build `438169f`, including the empty-confirmation refusal at the Stage 2 writer). `tests/fixtures/real-runs-2026-09-29/` pins the older shape from before that refusal. Keep both.

Party names (**B366**). A country, region, or currency code is not a party. A geography token followed by an organisation word is a party (`the UK government`). When the product names a party from the draft, it uses the draft's own words, including a leading article where the draft has one. Shared lists live in `lib/qc/party-tokens.mjs`. Callers: `actor-of-the-action.mjs`, `role-party.mjs`, `generic-company.mjs` (**B372**), and `source-dateline.mjs` (**B378**).

Announcement dateline (**B378**). `extractSourceAsOfDate` reads a date in the first six lines when the line is under 40 characters, and parses the matched date substring, so `13 November 2025, Singapore` yields an as-of date. Direct callers: `supersession.mjs`, `pipeline-v4/index.mjs`, and `source-dateline.mjs`. Stage 7 calls it through source recency and through the dateline rule. A statement that opens by dating an act of saying or announcing (`announced`, `said`, `stated`, `reported`, `disclosed`, `declared`) by a party named in that source's opening is compared to that as-of month and year. One source only. Agreement confirms the timing and drops a commentary sentence that says the source does not specify it. When that was the only gap on a partial card with a confirming passage, the card is shown confirmed. A different month or year is a conflict, and the dateline line is the quoted evidence. No as-of date, more than one source, or no such clause: the card is unchanged. `date-subject.mjs` is not used: a document dateline has no reporting-period cue. A geography or a currency is not the announcing subject. The thousands-separator style rule does not fire when the cited figure contains no separator character. The gate is `STYLE_RULE_DETERMINISTIC_FILTERS.thousand_separator` in `editorial-compliance-reviewer.mjs`. Number words are not quantity tokens: `tokenizeQuantities` feeds `annotateTokens`, which confirming-passage demotion uses, so a word token can change a verdict.

Empty-confirmation recovery (**B366**). A skipped card whose matcher returned `confirmed` with an empty passage, refused at the Stage 2 writer (`emptyConfirmationRefused`), may run the B359 claim-sentence search. Evidence-off skipped and matcher-throw `not_reviewed` do not. If locate finds nothing the card is unchanged. If it finds claim-bearing sentences the displayed verdict follows that recovered evidence, not the refused classification. The flag is copied from Stage 2 onto the pair and, when true, onto `stage2SourceFingerprints`. Do not infer it from `skipped` plus `not_reviewed`.

Quote without comment (**B369**). A card that shows a quote always carries a comment. If assembly would otherwise leave `evidenceSummary` empty while a passage is shown, Stage 7 writes a deterministic sentence from the terms the quote actually carries, or a single factual fallback that does not assert support. No new model call.

Wrong-company check (**B371**). The actor-of-the-action check exists and is off unless `QC_ACTOR_OF_THE_ACTION` is on. See **B371** in `docs/BACKLOG.md`.

Stage 1b pre-filter (all required): two or more verifiable anchors (number, date, or Title-Case name); an additive coordinating boundary (`, and `, `, with `, `, while `, `, including `, `; `, ` as well as `); no relational connective (`driven by`, `because`, `up from`, and the rest, word-boundary match). The batched LLM must return verbatim contiguous substrings. Validation uses the same substring / Levenshtein-<=2 locate standard as Stage 1. Each claim must also contain a verifiable anchor (B64). Any failure reverts that sentence undecomposed.

Why the Stage 3 rollup is upgrade-only: decomposition is lossy. A sentence can assert a relation that lives in the connective. Whole-sentence Stage 2/3 stays authoritative.

Function cap: `vercel.json` `api/*.js` `maxDuration` 300 (**B263**). Extraction timeout tracks that cap (**B267**). `callLLM` retries 429 until the call fits or remaining Function time minus remaining-work margin is gone (**B278**). Stages 5 and 6 concurrency is derived per review (**B277**). A review that cannot finish inside 300 seconds even at full budget is refused in plain language before any model call.

---

## 2. Core principles

### LLM-last

Deterministic code is the referee. The LLM is the commentator, and in Stages 2 and 6 the classifier inside a fixed rubric.

- Evidence verdict (Stage 3) and display fields (`supportState`, `displayVerdict`, `concernLevel`) are computed in code from Stage 2 classifications. Commentary cannot change the verdict.
- A failed commentary call does not downgrade a `confirmed` or upgrade a `not_supported`.
- For Editorial and Compliance, the model flags concerns and quotes phrases. It does not return character offsets. Spans are derived in code. See section 4.

### The rule must test the thing it silences (R1)

A rule that silences or drops something must test the thing being objected to, not a token that happens to sit beside it. This shape shipped three times:

1. **B352 / B354.** Editorial drop used the whole flagged phrase, then an empty-term fallback to that phrase, rather than the words the concern objected to. A causal concern dropped because a neighbouring figure was already in the source. **B355** retargeted causal and evaluative families to the connective or the deleted word, and stopped empty terms falling back to the whole phrase.
2. **B354 empty-term fallback**, named separately because it is the same shape inside that drop: when the objectionable term was empty, the rule tested the rest of the phrase that sat beside the concern.
3. **B360.** The silence strip treated a figure (`2.2%`) in a displayed quote as covering an omission whose subject was AGIC. **B362** retargeted the strip to the omission clause's names and figures together. A neighbouring figure is not enough.

Do not ship a fourth instance.

### Three-signal separation

Evidence, Editorial+Style, and Compliance are separate LLM calls with separate prompts and rulebooks.

- Different cognitive frames do not share a prompt. R3.1 merged Style into Editorial on v4 because both are craft. Compliance stayed separate.
- Do not merge Compliance to save money. B99 already shows sibling draft text misattributes concerns. The 2026-05 "~$0.02/run" figure is not the live cost. On a real memo, Stage 6 was most of the Langfuse bill. The product rule is still: keep Compliance separate.

### Conflicts always surface

Stage 3 is conflict-wins. If any reduced pair is `conflicting`, the card verdict is `conflicting` and `hasConflict` is true. A confirming source does not outrank a contradicting one. A second passage fills `conflictExcerpt` when one exists (**B360**). A one-passage conflict card leaves that slot empty with a reason (**B362**, **B158**).

### Deterministic verdicts

Same draft plus same sources should yield the same aggregated evidence verdict given fixed Stage 2 outputs. Temperature 0 on QC LLM stages. Run-to-run variance on Editorial concerns at temp 0 is a known API property. Flag `QC_LLM_CACHE` (default ON; set `0`/`false`/`off` to disable) replays Stages 1, 1b, and 2 from a process-local LRU. Production does not set `QC_LLM_CACHE_DISK`, so the store is memory only and dies on cold start. Neither mode closes residual `hasConflict` drift (**B61**). Stage 5 and Stage 6 are not in that cache.

### No extra cards from decomposition

One sentence is one QC card. The legacy pipeline split sentences into subclaims and produced multiple cards. v4 does not. Claim spans never create additional cards.

### Backend authority

The backend produces the qcCard JSON contract. The frontend renders badges, borders, and copy from those fields. It does not re-derive evidence verdicts, re-run rules, or reinterpret concern severity.

### Complete or nothing

A review is whole or it is nothing. If a run cannot finish, the payload carries no cards
and an honest account of what happened instead (**B329**). Three checkpoints: a pre-flight
fail-safe size pin, a deadline check after Stage 1, and a provider refusal mid-run. Five
causes: `too_large`, `deadline`, `capacity`, `billing`, `error`. `lib/qc/review-deadline.mjs`
owns the causes, the screen copy (`REVIEW_COPY`) and the next step (`REVIEW_NEXT_STEP`).
The recorded cause stays the machine slug, including `error`; the screen never prints it.
Partial results are not shown, not cached and not exported.

---

## 3. Three-signal framework

### Evidence (Stages 1-5 plus assembly)

| | |
|---|---|
| Evaluates | Whether each statement is supported, partially supported, contradicted, or not addressed by uploaded sources. |
| Does not evaluate | Writing quality, regulatory framing, or marketing register. |
| qcCard fields | `supportState`, `displayVerdict`, `concernLevel`, `hasConflict`, `statement`, `charStart` / `charEnd`, `draftSpan`, `primaryExcerpt` (string or null), `conflictExcerpt` (object or null; second shown passage when distinct) (**B360**, **B362**), `conflictExcerptEmptyReason` (`no_distinct_passage` when a conflict face has no distinct second passage), `evidenceSummary`, `reasoningParagraph`, `commentaryNotReviewed`, `commentaryUnaddressed` (diagnostic; not rendered), `supportRefIds`, `supportRefTitles`, `hasRealExcerpt`, `excerptNotLocatable`, `evidenceNotReviewedReason`, `supportSpans`. When claim spans ran: additive `decomposed`, `claimUpgrade`, `claims[]` (frontend does not read these; verdict still flows through `displayVerdict` / `supportState`). |
| Interaction | R6.3 (v4 only): when evidence verdict is `conflicting`, editorial concerns that duplicate the Evidence-conflict finding are dropped at card assembly via a gpt-4o-mini judgment (`lib/qc/editorial-duplication-judge.mjs`). The judge runs only on `conflicting`. Errs toward keeping. Canary: `editorial_concern_suppressed_by_judgment`. Editorial and Compliance on the same promotional phrase may both appear. Intentional. |

### Editorial+Style (Stage 6, combined on v4)

| | |
|---|---|
| Evaluates | Craft, per `lib/rulebook/editorialRules.js` and `lib/rulebook/styleGuide.js`. House voice is one table: `lib/prompt-library/house-voice.mjs`. |
| Does not evaluate | Source-by-source factual matching, or fund-marketing regulatory rules. |
| qcCard fields | `editorialVerdict`, `editorialConcerns[]`, `editorialNote`, `editorialSuggestedDirection`, `editorialSuggestedRewrite`, `editorialNotReviewedReason` (machine-readable; not shown on the card). |
| Interaction | Subject to R6.3 on conflicting evidence. Otherwise independent of Compliance. |

A requested editorial check that does not complete is `editorialVerdict: "not_reviewed"`. A genuine clean note is `No editorial or style concerns identified under the listed rules.` Style rules with a structurally checkable property have a deterministic backstop in `STYLE_RULE_DETERMINISTIC_FILTERS`.

### Compliance (Stage 6, separate call)

| | |
|---|---|
| Evaluates | Regulatory and disclosure risk, per `lib/rulebook/complianceRules.js`, filtered by output type and visibility. |
| Does not evaluate | Whether a source confirms a number, or whether a sentence is clumsy. |
| qcCard fields | `complianceVerdict`, `complianceConcerns[]`, `complianceNote`, `complianceSuggestedDirection`, `complianceSuggestedRewrite`, `complianceNotReviewedReason` (machine-readable; not shown on the card). |
| Interaction | Independent of Editorial except shared sentence text. Visibility (section 5) changes which rules are in the prompt. |

Concern list shape: `concernCode`, `note`, `category`. Optional: `suggestedDirection`, `suggestedRewrite`, `concernText`, `span: { startChar, endChar, source }`.

---

## 4. Span derivation (R5.1)

Spans tell the UI which phrase in the statement a concern refers to, without asking the model for character positions.

1. The LLM writes concerns with quoted phrases in `note` and/or `suggestedDirection`.
2. Code runs `extractQuotedSnippets` (same parser as the compliance fidelity gate) on those fields.
3. For each quoted phrase (length >= 4), code searches `statementText` case-insensitively and takes the earliest match.
4. On success, the concern gains `span: { startChar, endChar, source }` where `source` is `note_quote` or `direction_quote`.

The LLM is never asked for offsets. Statement-level concerns, and concerns with no quote, are valid without a span. Reserved `source: "code_match"` is not implemented. v3 path does not attach spans. Coverage figures from early dogfooding are not current; canaries `editorial_concern_span_coverage` and `compliance_concern_span_coverage` still fire.

---

## 5. Visibility calibration (R4.3)

QC runs carry required version: Complete or Public. This drives which rules appear in Stage 6 prompts.

### Complete (NDA-bound, existing-investor audience)

- Standard threshold on existing rules.
- Compliance rules omitted because they only apply to Public:
  - `precise_confidential_detail_in_public_version`
  - `named_individual_attribution_in_public_content`
- Editorial+Style: borderline promotional or hedging language may be allowed when substance is accurate.

### Public (wider, non-NDA audience)

- Stricter calibration in Editorial+Style and Compliance system prompts.
- Additional Compliance rules engaged: `precise_confidential_detail_in_public_version`, `expected_disclosure_language_absent_on_public`.
- Editorial rule with version-aware calibration: `jargon_outside_audience_competence`.

Implemented via `appliesToVersion` on rulebook entries and `filterRulesForRun` in `lib/qc/editorial-compliance-reviewer.mjs`.

---

## 6. What v2 dropped

- Subclaim atomisation (multiple QC cards per sentence). Internal claim spans exist. They do not create extra cards.
- Component-level deterministic matching as primary evidence logic.
- Role compatibility gates.
- Numeric tuple authorisation.
- Excerpt quality gates as verdict drivers.
- Binding diagnostics.
- Multi-candidate classification with opaque precedence.

Evidence quality now flows: Stage 2 LLM rubric, Stage 3 aggregation, Stage 4 excerpt pick, Stage 5 explanation.

---

## 7. What v4 kept from v3

- LLM-based statement splitting with deterministic validation fallback (Stage 1).
- Three-signal review framework, with Style merged into Editorial on v4 only.
- qcCard as the frontend contract. The shape has grown. New fields are additive.
- Regression suite (`scripts/run_qc_regression.mjs`, `npm run qc:test`).
- Product plumbing: version history, export (PDF/DOCX), banned words.

---

## 8. Pipeline routing

| Mechanism | Behaviour |
|-----------|-----------|
| `QC_PIPELINE_V4=1` | Selects v4 (`runPipelineV4` in `lib/qc/pipeline-v4/index.mjs`). |
| Unset or other | Falls back to legacy v3 (`lib/qc/pipeline-v3/`). |
| Request body | `options.pipelineRoute === "v4"` also selects v4. |

Production is configured to run v4. v3 remains in the tree as the unset-env fallback and is still statically imported on every Review request. `qcCard.pipelineVersion` is stamped from the route `assembleCard` runs under.

R4.2 (remove v3) is parked. Handler logs `[handler] route selected: v4|v3` and does not print the env var.

---

## 9. Persistence

Neon Postgres in AWS Europe Central 1 (Frankfurt), matching Vercel `fra1`. Repo docs say Postgres 18.

`review_state` is an autosave buffer, not an audit record. One row per `review_id`, opaque JSON `state`, plus `owner_key`. Overwriting the row is correct. API: GET / POST / DELETE `/api/review-state`.

`reviewer_decisions` is append-only (**B186**). First kinds: `source_governance` and `source_override`. Changing a ruling appends a new row. There is no update or delete path. POST / GET `/api/reviewer-decisions`. Missing database returns 503 and Review continues. Per-finding accept/reject is still not recorded. That is still B9.

`owner_key` (`x-owner-key` header) stops one browser reading another browser's row. It is not authentication.

Pooled `DATABASE_URL` for routes. Unpooled `DATABASE_URL_UNPOOLED` for migrations (`npm run db:migrate`).

`getSql` names three states, not two (**B330**). `DB_NOT_CONFIGURED` is an absent
`DATABASE_URL`. `DB_UNREACHABLE` is a present URL that refuses, which previously surfaced
as an unhandled rejection that killed the function process. Reachable is the third.
Review-state and reviewer-decisions return 503 `db_unreachable`. The model-drift watchdog
degrades to in-process memory on any failure, not only on an absent URL. `/api/health`
reports reachability and the environment pill goes amber when the database is unreachable.
A reviewer decision that cannot be persisted is told to the reviewer (**B331**) rather than
dropped silently.

---

## Related documents

| Document | Role |
|----------|------|
| `docs/ROADMAP.md` | Sprint status, watches, backlog of sequencing. Not the pipeline contract. |
| `docs/BACKLOG.md` | Open work, standing rules, closed rows. |
| `docs/ROADMAP.md` Review Correctness Principles | Evidence invariants. Principle 6 (draft-vs-draft out of scope) is current code and sits next to **Pr16**, which is not built. Principle 7 (explain, do not rewrite) does not describe Implement Changes or `suggestedRewrite`. |
| `docs/SPEND_LEDGER.md` | Named USD. Use this, not a baseline paragraph. |
| `ai/AI_OPERATING_MANUAL.md` | How Cursor works on this codebase. |
| `ai/SPEC_TEMPLATE.md` | Spec form in use. |
