# B474. Which layers are given the source

Read of the code and of `scripts/diagnostic/b464/pass-1.json`. No model call. USD 0. No product code, prompt, rule, or test was changed.

Stored pass: 261 cards. gitSha on the file: 273b678b.

## What each layer receives

| Layer | What it receives | Call site |
| --- | --- | --- |
| Stage 1, statement split | Nothing. The call takes the draft. | lib/qc/pipeline-v4/stage1-extract-statements.mjs:311 |
| Stage 2 matcher, one pair | The whole text of one source. The user prompt is Statement, then Source, then that text. | lib/qc/pipeline-v4/stage2-match-sources.mjs:1209 |
| Stage 2 matcher, the loop | One pair per statement and per source. Each pair carries that source's text only. | lib/qc/pipeline-v4/stage2-match-sources.mjs:1695, lib/qc/pipeline-v4/stage2-match-sources.mjs:1739 |
| Stage 2 claim matcher | The same one-source call. A claim is matched to one source text. | lib/qc/pipeline-v4/stage2-match-sources.mjs:1724 |
| Widened passage pass | The whole text of one source, in a prompt headed Source. | lib/qc/pipeline-v4/stage2-match-multipassage.mjs:71 |
| As-of date | The whole text of one source, once per source, before any comparison. | lib/qc/pipeline-v4/index.mjs:518 |
| Supersession | Match records for the statement, and the as-of date already taken from each source. Not the document text. It returns immediately when fewer than two match records are present. | lib/qc/supersession.mjs:242 |
| Intra-source reducer | The source array. It reads a source's text field. The call is in process, not a model prompt. | lib/qc/pipeline-v4/intra-source-reducer.mjs:41 |
| Second-value spans | The source array. It slices one source's text around a figure. The call is in process, not a model prompt. | lib/qc/pipeline-v4/second-value.mjs:391 |
| Excerpt selection | The source array. It slices one span with source.slice(start, end) and keeps that passage. The call is in process, not a model prompt. | lib/qc/pipeline-v4/stage4-select-excerpts.mjs:237 |
| Editorial field, v4 main path | A selected passage: the primary excerpt, prefixed with its label. Null when that passage is missing. | lib/qc/pipeline-v4/index.mjs:749 |
| Editorial field, v4 skipped-evidence path | Null. This path assigns the field to null. | lib/qc/pipeline-v4/index.mjs:253 |
| Editorial field, v3 | A selected passage, the primary excerpt, or null when that passage is missing. Same shape as the v4 main path. | lib/qc/pipeline-v3/qc-pipeline-v3.mjs:46 |
| Editorial prompt | Nothing of the source. The payload builder discards the excerpt and the evidence block. | lib/qc/editorial-compliance-reviewer.mjs:1405 |
| Editorial style prompt | Nothing of the source. The style payload builder discards the excerpt and the evidence block. | lib/qc/editorial-compliance-reviewer.mjs:1454 |
| Compliance prompt | A name and a publication state for each source that has one. Not the source text. | lib/source-publication-state.mjs:36 |
| Editorial source awareness | Selected passages already on the card: primary excerpt, conflict excerpt, support spans, and match passages. Not the whole document. | lib/qc/pipeline-v3/stage7-assemble-card.mjs:1601 |
| Reading note | The whole text of every source, joined with a newline. The joiner adds no document label. | lib/qc/reading-review.mjs:72 |
| Route selector | v4 when QC_PIPELINE_V4 is exactly 1, or the request sets pipelineRoute to v4. Otherwise v3. | api/analyse-statements.js:262 |
| Supersession notes, v4 | The notes resolveSupersession returned. An empty array when it returned none. | lib/qc/pipeline-v4/index.mjs:729 |

The editorial and style prompts are the layers that decide the rulebook. Both discard the excerpt before the model sees the message. `buildEditorialUserPayload` voids `sourceExcerpt` and `evidenceBlock`. `buildEditorialStyleUserPayload` voids `evidenceExcerpt` and `evidenceBlock`. v4 sets `pipelineRoute` to `v4`, so it takes the style payload. v3 takes the editorial payload. The discard is in both.

Mechanics scan does not take a document. The word source in `lib/qc/mechanics-scan.mjs` is a regular expression's `.source` property. It was not given a row because it is not handed source material.

## Two sources at once

A model prompt is given two source texts in one call in one place. `readingSourceText` joins every source's text with a newline and the reading note is asked to compare one statement with that string. The joiner does not add a label saying which document a sentence came from. The prompt says to compare the statement with the source. It does not ask whether one source revises another. Whether the model would notice a revision inside that string was not run.

The matcher is not that place. `matchAllSources` builds one call per statement per source, and `matchSingleSource` puts one `sourceText` under Source. The widened pass does the same in `matchMultipassagePair`. A card can still carry more than one source fingerprint, because the pairs are stored together after the calls return.

Cards on this pass with more than one stage-2 source fingerprint: 10 of 261. That count is stored pair records, not one prompt that held two documents.

In process, these functions are handed the source array: excerpt selection, the intra-source reducer, second-value spans, and the compliance publication block. Supersession is handed the match records from every source for that statement, not the documents.

## A later source revising an earlier one

`resolveSupersession` is the stage whose job is a later source and an earlier one. It runs after the verdict, in `lib/qc/pipeline-v4/index.mjs`, and again for claim matches. It compares figures and periods on the match records, using the as-of date taken from each source on its own. It does not read the two documents. A recommendation in one source and a completion in a later source is not a figure, so this stage does not see it.

To notice that kind of revision it would have to be given the text of both sources, or the passage from each that states the transaction, and which source is later.

The field that stores the result is `supersededSourceNotes`. v4 assigns whatever `resolveSupersession` returned, at `lib/qc/pipeline-v4/index.mjs`. The fallback card `safeCard` in `lib/qc/pipeline-v3/stage7-assemble-card.mjs` starts that field as an empty array. The assembled card copies `entry.supersededSourceNotes` when the entry has an array. `buildSkippedEvidenceQcCard` does not set the field.

Cards on this pass with a non-empty supersededSourceNotes array: 0 of 261. The writer exists. On this pass it recorded nothing.

## The null excerpt, and which pipeline runs

Two pipelines are in the repo. v4 is `runPipelineV4` in `lib/qc/pipeline-v4/index.mjs`. v3 is `runPipelineV3` in `lib/qc/pipeline-v3/qc-pipeline-v3.mjs`. `api/analyse-statements.js` runs v4 when `QC_PIPELINE_V4` is exactly `1`, or when the request sets `options.pipelineRoute` to `v4`. Otherwise it runs v3. An unset flag is v3.

This read did not call the live health endpoint, so the deployed value of the flag was not re-measured. The operating manual says production sets the flag to 1. The switch census says the same, from an earlier health read. Those are documents, not a measurement taken for this spec.

The stored pass records pipelineVersion on the card: v4 261. That pass was produced by v4.

The excerpt field is not null on every v4 path. The main path sets it to the primary excerpt passage, or to null when that passage is missing (`lib/qc/pipeline-v4/index.mjs`, the `const editorialSourceExcerpt` assignment). The skipped-evidence path assigns `editorialSourceExcerpt: null`. v3 sets the same passage-or-null value as the v4 main path. The prompt then discards the field on both pipelines, so the model is given nothing either way.

The commit that discards the excerpt is b3719298 (B178). It is an ancestor of the pass sha 273b678b: yes. The commit that assigns null on the skipped-evidence path is e63c7252. It is an ancestor of that sha: yes. The firing counts below are from a pass whose prompt builder already discarded the excerpt.

Cards whose assembled primaryExcerpt is empty: 5 of 261. The card does not store the editorialSourceExcerpt field, so this is the assembled excerpt, not a log of the prompt. An empty assembled excerpt is the case where the main path would have set the field to null before the prompt discarded it.

## Rules whose wording names the source

A rule is listed when its description, reviewer note, or fix direction contains source, passage, quotation, or quote. Editorial rules: 14. Compliance rules: 10. Listed: 6.

| Rule | Book | Words | Requires a reading of the source | What the layer is given | Fired on this pass | Why |
| --- | --- | --- | --- | --- | --- | --- |
| voice_consistency | editorial | quote, quotation | no | Nothing. The prompt discards the excerpt. | 1 | Quotation here is speech already in the draft, not a source passage. |
| overreach_unsupported_causal | editorial | source | yes | Nothing. The prompt discards the excerpt. | 0 | The wording asks what the source reports. |
| underreach_hedging | editorial | source | no | Nothing. The prompt discards the excerpt. | 0 | The wording names the source in order to forbid reading it. |
| marketing_language_excess | editorial | quote | no | Nothing. The prompt discards the excerpt. | 13 | Quote here means repeat the draft's own words in the fix. It does not ask what a source states. |
| internal_plausibility | editorial | source | no | Nothing. The prompt discards the excerpt. | 0 | The wording names the source in order to forbid reading it. |
| comparative_claim_without_basis | compliance | source | no | A publication state and a name. Not the text. | 4 | Source here is a citation in the same sentence, not the uploaded document. |

Rules that do not contain those words were not listed. `material_omission` and `selective_presentation_of_data` talk about a missing counter-fact. They do not name the source, the passage, or a quotation, so they are outside this test.

## Rules that cannot do their job as wired

- overreach_unsupported_causal (editorial) requires the source text. Its layer is given none: the prompt discards the excerpt. It fired 0 times on this pass, across 261 cards.

The editorial source-awareness step can drop a concern after the model has fired, by looking at passages already matched to the card. That step is not the rule. It does not give the rule the source.

## What this read could not settle

The deployed value of `QC_PIPELINE_V4` was not re-measured. No request was sent.

Whether the reading note would notice one source revising another, if both texts are in the joined string, was not run.

The stored card does not record the editorial prompt, so the empty-excerpt count above is the assembled passage, not the bytes sent to the model. The discard itself is in the source, and that commit is an ancestor of the pass.

No product code, prompt, rule, or test was changed.
