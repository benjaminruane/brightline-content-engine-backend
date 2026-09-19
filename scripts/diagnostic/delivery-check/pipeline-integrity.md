# Pipeline integrity audit

Read only plus a measured run. No spec. No production-path change. Instrumentation was temporary, then removed. HEAD at start: `fc0e391`.

This is not an accuracy audit. The question is whether the conveyor loses items, and whether a human can see that it did. A `console.warn` is not a report. Langfuse canaries are operator-only.

**Instrument proof.** Coverage of draft character spans vs Stage 1 statements. Recorded `tests/fixtures/b247/r6-near-limit.json` against the eleven-sentence R6 draft: in 11, out 10, lost 1, uncovered `This note covers the March 2025 close.` Live rerun of the same draft: same numbers, and the log line `[stage1] dropped 1 non-claim statement(s)`. B248 is the `isClaim=false` filter, not an LLM omit. The instrument is not wrong.

Stages the prompt listed, plus stages it missed, are named in the fail-open table.

---

## Part 1. Every place something can leave. Ranked by whether a human can see it.

Reported: **no** = nothing on the card, screen, or payload a reviewer reads. **operator** = Langfuse canary or console only. **yes** = card field, Sources drawer, or HTTP error. **n/a** = not a loss of an item (concurrency, soft warn).

| Rank | Stage | Kind | What is lost | Condition | Reported | Fail |
|------|-------|------|--------------|-----------|----------|------|
| 1 | stage1-extract-statements | FILTER | A whole sentence never becomes a card | LLM sets `isClaim=false`; filter at `stage1-extract-statements.mjs` L378 drops it unless every sentence is non-claim | no | open |
| 2 | stage1-extract-statements | FILTER | A whole sentence never becomes a card | LLM omits a sentence. Validation maps returned texts into the draft and does **not** require the union of spans to cover the draft | no | open |
| 3 | stage1-extract-statements | CATCH | The whole draft is unreviewed | Fallback splitter throws; catch returns `statements: []` | no | open |
| 4 | stage1-extract-statements | DEFAULT | LLM split is thrown away; deterministic split used instead | Schema/validation reject, no API key, or catch | operator (`console.warn`) | open |
| 5 | stage1 fallback (`extract-statements.mjs` v2) | CAP | Sentences after the 40th | `maxCandidates: 40` on the fallback path only | no | open |
| 6 | stage1 fallback | FILTER | Short fragments | `minLen: 25` | no | open |
| 7 | stage1 fallback | TRUNCATION | Overlong sentences are split at 240 chars | `maxLen: 240` | no | open |
| 8 | stage1b-extract-claim-spans | CAP | Compound sentence stays undecomposed; inner claims are not matched separately | `MAX_DECOMPOSED_SENTENCES=12`; extras `over_sentence_cap` | operator (`console.warn`) | open |
| 9 | stage1b-extract-claim-spans | CAP | Sentence reverts undecomposed | More than `MAX_CLAIMS_PER_SENTENCE=3` claims (`over_claim_cap`) | operator | open |
| 10 | stage1b-extract-claim-spans | FILTER | Sentence reverts undecomposed | Validation fail, `fewer_than_two_claims`, no provider key, cache miss payload | operator | open |
| 11 | stage1b-extract-claim-spans | SKIP | No decomposition at all | `QC_CLAIM_SPANS` off | no | open |
| 12 | stage2-match-sources | CATCH | Real match; pair arrives as `no_support` | LLM call throws | operator; explanation string may leak into Stage 5 | open |
| 13 | stage2-match-sources | DEFAULT | Real match; pair arrives as `no_support` | Schema/normalisation fail after retry | operator + Langfuse `stage2_schema_validation_failed` | open |
| 14 | stage2-match-sources | FILTER | The passage; classification is kept | Passage not locatable in the source after normalisation | operator + Langfuse `stage2_passage_rejected` | open |
| 15 | stage2-match-sources | TRUNCATION | Tail of the cited passage | `trimPassageToLimit` 400 chars | no | open |
| 16 | stage2-match-sources | FILTER | Unsupported-span offsets | Non-exact span; rejected, offsets null | operator (debug counter) | open |
| 17 | stage2-match-sources | DEFAULT | Unknown class treated as `no_support` | `normalizeMatchClassification` / `ALLOWED_CLASSIFICATIONS` | no | open |
| 18 | stage2-match-multipassage | SKIP | Extra passages on that pair | `WIDENED_SCOPE=supporting_pairs` skips single-pick `no_support` | no | open |
| 19 | stage2-match-multipassage | CATCH | All widened passages for that pair | Matcher throws; returns `[]` | operator | open |
| 20 | stage2-match-multipassage | DEFAULT | Unknown class coerced to `no_support`, then often dropped | Row class not in allowlist | no | open |
| 21 | intra-source-reducer | FILTER | Span does not vote | Passage not locatable in the stored source | no | open |
| 22 | stage3-aggregate-verdict | DEFAULT | Unknown class votes as `no_support` | `normalizeClassification` | operator (`console.debug`) | open |
| 23 | stage4-select-excerpts | TRUNCATION | Tail of the excerpt shown on the card | Cap 300 chars, then `...` | no | open |
| 24 | stage4-select-excerpts | FILTER | Other confirming/conflicting passages | First match in upload order with a non-empty passage | no | open |
| 25 | stage5-generate-commentary | DEFAULT | Model commentary; canned fallback is shown as the note | Schema fail after retry, catch, or no API key | no (looks like a real note) | open |
| 26 | stage5-generate-commentary | SKIP | Empty commentary | `skipCommentary=true` | n/a (caller asked) | open |
| 27 | editorial-compliance-reviewer | FILTER | A concern never appears on the card | Fidelity gate, style filters, no-op / no-change / evidence-language suppress, evaluative bounds | operator (`FIDELITY_DROP`, style log) | open |
| 28 | editorial-duplication-judge (stage7) | FILTER | An editorial concern is suppressed | Judge returns that index as duplicate of the conflict | operator (`editorial_concern_suppressed_by_judgment`) | open |
| 29 | editorial-duplication-judge | CATCH | Suppression does not run (concerns kept) | Schema fail or throw returns `[]` | operator canary | closed on suppress |
| 30 | stage7-assemble-card | DEFAULT | `not_reviewed` is replaced by `clean` | Editorial or compliance **off**; `resolveAssembledVerdict` L515 | payload yes as `clean`; screen says Not reviewed (**B247**) | open |
| 31 | stage7-assemble-card | TRUNCATION | Concern text in the Langfuse canary only | `SUPPRESSED_CONCERN_TEXT_MAX_LEN=200` | n/a for the card | open |
| 32 | stage7-assemble-card | DEFAULT | Empty card shell | `safeCard` when assembly has nothing | no | open |
| 33 | editorial-compliance-reviewer | DEFAULT | Requested check did not complete | Schema fail after retry → `not_reviewed` (B202) | **yes** (card) | open |
| 34 | pipeline-v4 stage6 CATCH | CATCH | Requested check did not complete | `runEditorialComplianceReview` throws → `not_reviewed` | **yes** (card) | open |
| 35 | source prep (`analyse-statements`) | FILTER | Source never enters Stage 2 | Empty text or `unsupported_scanned` | **yes** (`excludedSources`, Sources drawer) | open for the rest |
| 36 | extract-text-from-source | TIMEOUT | The whole analyse request | 60s extraction timeout | **yes** (HTTP error) | closed |
| 37 | extract-text-from-source | CAP | The whole analyse request | PDF over `MAX_PDF_MB` (default 10) or file over 25MB | **yes** (HTTP error) | closed |

`STAGE2_CONCURRENCY=24` is in-flight only. It does not drop pairs. `LONG_SOURCE_SOFT_CHAR_WARN=60000` warns and does not truncate.

**Stages the prompt missed (and whether they lose work):**

- Source prep / `extract-text-from-source` (above).
- `resolveSupersession`: older source class rewritten to `superseded`; not a dropped statement.
- `coverage-union`: can promote partial to confirmed; not a loss.
- Framing-fidelity and source-recency: additive concerns, not drops.
- Evidence-skipped fast path: user turned evidence off.
- `lib/qc/llm-claim-extraction.mjs` (30s timeout, fail-open): **not on the v4 path**.
- `lib/qc/commentary-builder.mjs` (`MAX_WORDS=50`): **not imported**.

---

## Part 2. Which of them fired. Measured.

Live `runPipelineV4`, cache off (`QC_LLM_CACHE=0`). Three drafts. In/out are items at that stage, not tokens.

### r6-near-limit (known B248)

Eleven-sentence Oakfield draft, two sources. Instrument proof: Stage 1 lost the last sentence.

| stage | in | out | lost | reported |
|-------|----|-----|------|----------|
| stage1-extract-statements | 11 | 10 | 1 | no |
| stage1b-extract-claim-spans | 0 | 0 | 0 | no |
| stage2-match-sources | 20 | 20 | 0 | n/a |
| stage2-match-multipassage | 20 | 12 | 8 | no |
| intra-source-reducer | 12 | 12 | 0 | no |
| stage3-aggregate-verdict | 10 | 10 | 0 | n/a |
| stage4-select-excerpts | 10 | 9 | 1 | no |
| editorial-compliance-reviewer | 10 | 10 | 0 | n/a |
| stage5-generate-commentary | 10 | 10 | 0 | no |
| stage7-assemble-card | 10 | 10 | 0 | n/a |

Notes. Stage 1 log: dropped 1 non-claim. Uncovered: `This note covers the March 2025 close.` Stage 2 lost 0 rows because fail-open still emits a pair. Multipassage lost 8: `WIDENED_SCOPE` skipped `no_support` pairs. Stage 4 lost 1 excerpt: the `not_supported` card has no primary excerpt by design. Fidelity/style filters dropped concerns on statements 7, 2, 5; cards still arrived.

### long-past-caps

Twenty compound sentences, one source. Built to exceed `MAX_DECOMPOSED_SENTENCES=12`. Stage 1 kept all 20 (LLM path has no count cap).

| stage | in | out | lost | reported |
|-------|----|-----|------|----------|
| stage1-extract-statements | 20 | 20 | 0 | no |
| stage1b-extract-claim-spans | 20 | 12 | 8 | no |
| stage2-match-sources | 20 | 20 | 0 | n/a |
| stage2-match-multipassage | 20 | 20 | 0 | no |
| intra-source-reducer | 54 | 54 | 0 | no |
| stage3-aggregate-verdict | 20 | 20 | 0 | n/a |
| stage4-select-excerpts | 20 | 20 | 0 | no |
| editorial-compliance-reviewer | 20 | 20 | 0 | n/a |
| stage5-generate-commentary | 20 | 20 | 0 | no |
| stage7-assemble-card | 20 | 20 | 0 | no |

Notes. Eight 1b fallbacks `over_sentence_cap` (statements 12 to 19). Those sentences still got whole-sentence Stage 2 cards. Stage 2 sentence pairs 20; extra 24 Stage 2 generations were claim×source for the 12 decomposed sentences (Langfuse `stage2-match-sources` 44). Stage 7 `reported=no` because editorial concern count in (reviewer) and out (card) differed: duplication judge ran 9 times.

### compound-multi-source

Six compound sentences, three sources.

| stage | in | out | lost | reported |
|-------|----|-----|------|----------|
| stage1-extract-statements | 6 | 5 | 1 | no |
| stage1b-extract-claim-spans | 3 | 0 | 3 | no |
| stage2-match-sources | 15 | 15 | 0 | n/a |
| stage2-match-multipassage | 15 | 12 | 3 | no |
| intra-source-reducer | 11 | 11 | 0 | no |
| stage3-aggregate-verdict | 5 | 5 | 0 | n/a |
| stage4-select-excerpts | 5 | 4 | 1 | no |
| editorial-compliance-reviewer | 5 | 5 | 0 | n/a |
| stage5-generate-commentary | 5 | 5 | 0 | no |
| stage7-assemble-card | 5 | 5 | 0 | n/a |

Notes. Stage 1 again dropped a cover-note sentence as non-claim: `This note covers the March 2025 close, and it is for internal reporting only.` 1b reverted three candidates `fewer_than_two_claims`. Multipassage skipped 3 `no_support` pairs. Stage 4 one null primary excerpt.

Schema-invalid Stage 2 pairs: 0 / 0 / 0 on these three runs. Catch-to-`no_support` did not fire. Passage-reject did not fire in the instrument (it would not change pair count).

---

## The three to fix first

1. **Stage 1 silent drop of a draft sentence** (B248, filed as class **B249**). The reviewer sees a finished review. The sentence was never a card. Accuracy corpora cannot see it. Fired live on r6 and on the compound draft.
2. **Stage 2 fail-open `no_support`** (**B250**). A thrown call or a schema fail is shown as "the sources do not support this." That is a fake check, not a missing check. Did not fire on these three runs. Still the pipeline-scale version of the rule from this week.
3. **Passage rejected after normalisation** (**B251**). Classification stays; the quote is emptied. The card can look unsupported or unquoted with no banner. Did not fire in the counts. The warn already exists; a human still cannot see it.

1b `over_sentence_cap` fired (8 of 20) but the parent sentence still gets a card. Fix after the three above.

---

## Caps and limits

| Name | Value | Who chose it |
|------|-------|----------------|
| `MAX_CLAIMS_PER_SENTENCE` | 3 | B53a / `lib/qc/claim-spans.mjs`; architecture Stage 1b |
| `MAX_DECOMPOSED_SENTENCES` | 12 | B53a / same; architecture Stage 1b |
| `STAGE2_CONCURRENCY` | 24 | `stage2-match-sources.mjs`; in-flight only, not a drop |
| `STAGE2_SEED` | 1 | Stage 2 pin |
| `WIDENED_SCOPE` | `supporting_pairs` | R7 cost control; skip `no_support` pairs |
| Stage 1 LLM statement cap | none | Omission. LLM path is uncapped |
| Fallback `maxCandidates` | 40 | `extract-statements.mjs` v2 (`A3.14.4`) |
| Fallback `maxLen` / `minLen` | 240 / 25 | same |
| Stage 2 passage cap | 400 chars | `trimPassageToLimit` |
| Stage 4 excerpt cap | 300 chars | architecture §5.4 / `trimExcerptTo300` |
| Suppressed-concern canary text | 200 chars | `stage7-assemble-card.mjs` |
| `LONG_SOURCE_SOFT_CHAR_WARN` | 60_000 | `analyse-statements.js`; warn only |
| `DEFAULT_MAX_FILE_SIZE_BYTES` | 25MB | `extract-text-from-source.mjs` |
| `MAX_PDF_MB` | 10 (env override) | same, X1.2 |
| `EXTRACTION_TIMEOUT_MS` | 60_000 | same |
| `QC_LLM_CLAIM_EXTRACTION_TIMEOUT_MS` | 30_000 | unused on v4 |
| commentary-builder `MAX_WORDS` / `MAX_SENTENCES` | 50 / 3 | unused on v4 |
| isClaim drop | on | Stage 1 prompt plus L378 filter; salutations/closings/transitions |

---

## Fail open vs fail closed

| Stage | Mode |
|-------|------|
| extract-text timeout / PDF too large / unsupported type | **closed** (HTTP error) |
| empty or scanned source | **open** for the rest; dropped source is listed |
| stage1-extract-statements | **open** |
| stage1b-extract-claim-spans | **open** (revert undecomposed) |
| stage2-match-sources | **open** (`no_support`) |
| stage2-match-multipassage | **open** (`[]` or skip) |
| intra-source-reducer | **open** (span does not vote) |
| stage3-aggregate-verdict | **open** (unknown → `no_support`) |
| stage4-select-excerpts | **open** (null excerpt) |
| stage5-generate-commentary | **open** (canned note) |
| editorial + compliance, check ON, schema/catch fail | **open**, but stamped `not_reviewed` (honest) |
| editorial + compliance, check OFF | **open**, stamped `clean` (**B247**) |
| editorial-duplication-judge fail | **closed** on suppress (keeps concerns) |
| stage7-assemble-card | **open** (defaults, suppress, off-check `clean`) |

A stage that fails open silently is the pipeline-scale version of the rule from this week. Stage 1 and Stage 2 are that. Stage 6 when ON is the counterexample: it proceeds with less and says `not_reviewed`.

---

## What this method still cannot see

- A sentence that is kept but rephrased or internally truncated by the model.
- A wrong classification that is not a drop (accuracy corpora).
- Passage-reject and schema-fail when they do not change in/out counts (pair still arrives).
- Prompt or context-window truncation inside the provider.
- Production flag drift vs this local run (cache was forced off; `QC_CLAIM_SPANS` default ON).
- `llm-claim-extraction` and `commentary-builder` (not on the v4 conveyor).
- Source prep (these drafts used inline text, no PDF timeout).
- Whether a dropped `isClaim=false` sentence was actually structural. This pass: `This note covers the March 2025 close.` is a dated factual cover line, not a salutation.

---

## Cost

Langfuse generation `calculatedTotalCost`, paginated observations, after the traces existed. Matches each trace `totalCost`.

| Draft | USD | Generations | Unpriced | Models |
|-------|-----|-------------|----------|--------|
| r6-near-limit `8d2b8c89-690f-4227-983c-6c2230bcac45` | 0.6236 | 63 | 0 | gpt-4o-2024-08-06 |
| long-past-caps `d2249f45-4fe5-418d-8a8a-86bcaf856cea` | 1.3141 | 135 | 0 | gpt-4o-2024-08-06; gpt-4o-mini-2024-07-18 (9× editorial-duplication-judge) |
| compound-multi-source `03abdcee-ac60-4c3a-ac4c-b7d68b02cc58` | 0.3918 | 44 | 0 | gpt-4o-2024-08-06 |
| **Total** | **2.3295** | **242** | **0** | |

First fetch of r6 and compound traces 404'd at +4s; costs above are the later paginated fetch. Possible undercount only if a generation landed after that fetch. Unlikely: r6 generation count matches the earlier r6 recording (63). Budget was USD 3. Did not need more.

Instrumentation was not committed. `lib/qc/pipeline-v4/index.mjs` restored to `fc0e391`.
