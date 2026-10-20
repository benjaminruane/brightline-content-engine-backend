# B406. Where source text is shown

Read-only inventory. No product change. Evidence for the agreement counts is `scripts/diagnostic/b406/check.mjs`.

The stored source string is whatever `extractTextFromSource` saved. Since B405 that string has already had `stripLeadingPageFurniture` applied (`lib/extract-text-from-source.mjs` line 442). A URL fetch does the same after tag stripping and before the 20,000 character slice (`api/fetch-url.js` lines 88-90). Fixture files under `tests/fixtures/` were extracted before that strip and were not rewritten.

## 1. Evidence card, primary and conflict excerpts

Q1. The card face in `src/modules/drafting/StatementReviewCard.jsx` (the excerpt block around lines 1112-1128). The strings come from `resolveCardExcerpts` in `src/modules/drafting/cardExcerptDisplay.js`.

Q2. Stage 2 asks the model for a verbatim passage. `resolvePassageAgainstSource` in `lib/qc/pipeline-v4/stage2-match-sources.mjs` (line 366) keeps it only when that passage is in the source. `selectExcerpts` in `lib/qc/pipeline-v4/stage4-select-excerpts.mjs` (line 491) then picks among the located matches. That pick is deterministic given the matches. `trimExcerptToSentences` then drops sentences, caps the quote, and finishes the edges. The choice of which passage to start from is model-made. The trim is deterministic.

Q3. A character offset when the shown string is `source.slice(start, end)`. Stage 4 sets `start` and `end` from `offsetsForShownPassage`. A gap, a leading `...`, or a `…` makes both offsets null. The card fields `primaryExcerptStart` and `primaryExcerptEnd` are still written in pipeline v3 from `gateExcerpt` (`lib/qc/excerpt-locate.mjs` line 108), which recovers a slice. The passage string is also stored on its own.

Q4. The extracted text stored on the source, after the B405 strip for any file extracted since that change. The card then stores its own excerpt string, which may be a slice of that text or a decorated quote.

Q5. `excerptNotLocatable` is set in `lib/qc/pipeline-v3/stage7-assemble-card.mjs` (line 1131) when a pointer was rejected or could not be recovered. The card then shows `The matching passage could not be located in the named source.` (`cardExcerptDisplay.js` lines 11-12) and does not show a passage.

## 2. Citation popover

Q1. `src/components/ui/CitationPopover.jsx`, and the same helper on the card hover in `StatementReviewCard.jsx`.

Q2. `cleanEvidenceExcerptForDisplay` in `src/utils/cleanEvidenceExcerptForDisplay.mjs`. Heuristic. It strips header-looking lines (`stripHeaderArtifacts`, line 50) and may shorten the quote for the popover. It does not change the stored source.

Q3. Nothing. It rewrites a string. It does not keep a line id or an offset into the source.

Q4. The stored excerpt, not the source.

Q5. An empty result leaves the popover without a body. The card face still has the unrewritten passage when one was stored.

## 3. Reading view, fact occurrences

Q1. `src/modules/reading/FactChip.jsx`, `SentenceDetail.jsx` (the line extract), and `SourcePanel.jsx` (the full source, one line per row).

Q2. `buildFacts` in `lib/qc/reading-contract.mjs` (line 124) calls `locateElement` in `lib/qc/b394-elements.mjs` (line 665). Deterministic. The note beside the fact is model-made. The line it points at is not.

Q3. A line id, `L1` upward, from `indexSourceLines` (`reading-contract.mjs` line 109). The extract is the whole line.

Q4. `readingSourceText` (`lib/qc/reading-review.mjs` line 31) joins `sources[i].text` with one newline. The frontend does the same join in `linesFromSources` (`FactChip.jsx` lines 16-30). That text is the extracted, stripped string. It does not read `primaryExcerpt`.

Q5. A fact the matcher does not find is `not_found` and is shown as not in the source, with no line. A line id that is not in the split shows `LINE_MISSING` (`FactChip.jsx` line 6). A missing source throws. It is not filled in.

## 4. Sources view

Q1. The drawer `src/components/drawers/SourceReaderPanel.jsx`. The upload list `src/modules/drafting/SourcesPanel.jsx` shows names and switches, not the document text.

Q2. Nothing chooses a passage. The drawer shows the whole stored string (`SourceReaderPanel.jsx` around lines 357-380). Highlights are the review's `supportSpans`, coloured by classification. Deterministic given those spans.

Q3. Character offsets. `supportSpans[].start` and `end` index `sources[i].text`. `src/utils/sourceHighlightSegments.js` says those offsets index the verbatim response text and must not be normalised first. The drawer does not use line ids.

Q4. `buildResponseSources` in `lib/response-sources.mjs` copies the prepared source text through. That is the extracted, stripped string.

Q5. No reviewed sources: the drawer says to run Review (`SourceReaderPanel.jsx` line 254). An offset that does not fall inside the string is not highlighted. The rest of the text still shows.

## 5. Export

Q1. `buildExportQualityReviewSummary` in `src/utils/exportReport.js` (line 24), used by `src/components/modals/ExportModal.jsx`.

Q2. The review summary badge and bullets. No function selects source text.

Q3. Nothing.

Q4. None. The export summary does not include a source passage.

Q5. A failed review exports the error string. There is no missing-excerpt branch because no excerpt is exported.

## 6. Proposal and revise

Q1. The action list on the card (`StatementReviewCard.jsx`, the confirming-passage block around lines 1099-1139). Disagreement passages render through `src/modules/drafting/sourceGovernance.js` (`passageFor`, line 110).

Q2. `confirmingPassage` is copied off the card in `lib/revise-actions/run.mjs` (line 102). Disagreement passages are the passages already stored on the entry. The copy step is deterministic. The passage itself was chosen by the card path in section 1.

Q3. The confirming passage is a quoted string. A disagreement row also carries `sourceId`. Neither carries a line id.

Q4. A stored excerpt. Not a fresh read of the source.

Q5. An empty confirming passage is omitted. The card does not invent one.

## 7. B405 cap and word boundary

These run inside section 1, as the last step of `trimExcerptToSentences` in `lib/qc/excerpt-sentences.mjs`.

The must-keep cover may not exceed `MAX_EXCERPT_CHARS` (400). Past that, the must-keep sentences nearest the statement's needles are kept, and non-contiguous runs are joined with ` ... `. One sentence longer than 400 is cut at the last word boundary and ends with `…`.

`finishExcerptEdges` runs when the caller passes the source. A quote that ends mid-word extends by at most 30 characters, or cuts back to the previous word and adds `…`. A quote that starts mid-word trims forward and prepends `…`. A quote that already ends on punctuation is left as it is. `excerpt-pair.mjs` and pipeline v3 call the trimmer without a source, so they get the cap and not the extension.

`offsetsForShownPassage` in `stage4-select-excerpts.mjs` sets both offsets to null when the shown string is not one slice of the source. A capped or edge-finished quote that contains `…` or ` ... ` therefore has no offset. The sources view cannot scroll to it.
