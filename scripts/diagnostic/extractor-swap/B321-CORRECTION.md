# B321 correction

Id: **B322**. Written 2026-09-24. No model calls. USD 0.

B321's reasoning existed only in a chat reply. This file is the committed record of what was wrong, how it was found, the corrected numbers, and the Part 0 answers that this spec required.

## What was wrong

`scripts/diagnostic/extractor-swap/verify-swap.mjs` stored `newQuoteCard.evidenceVerdict || null` and compared that to the committed B163 `evidenceVerdict`. The assembled qcCard never writes `evidenceVerdict`. It writes `displayVerdict`. So every new record was null, nineteen of twenty committed records had a value, and the "moved" test compared a value against null. The report's claim that twenty of twenty verdicts moved is an artefact.

d07 is the exception on the committed side: its B163 record also has a null `evidenceVerdict`. That one comparison was null against null on the verdict field, and still flagged moved because the quote appeared.

## How it was found

B322 Part 0A re-read the twenty `scripts/diagnostic/extractor-swap/outputs/dNN-gate7.json` files and compared `displayVerdict` and `quote` instead of `evidenceVerdict`.

## Corrected numbers

- On `displayVerdict`, 16 of 20 are identical.
- 13 of 20 keep the same quote.
- Four verdicts moved: d04, d07, d13, d17.
- Three kept their verdict and changed their quote: d10, d11, d12.
- Headline: the extractor swap moved four verdicts, not twenty.

Section 2.3 of `REPORT.md` now states those numbers. The original per-document dump sits under "2.3 (superseded)" so the wrong table is not deleted.

## Part 0A. Factual claims

C1 BLOCKING. **PARTLY.** `scripts/diagnostic/extractor-swap/verify-swap.mjs` L261 and L274 store `card?.evidenceVerdict || null` with no fallthrough to `displayVerdict`. All twenty new records have `evidenceVerdict: null`. Nineteen of twenty committed B163 records carry a value. d07's committed record is also null (`outputs/d07-gate7.json`). The "twenty of twenty moved" claim is still an artefact of comparing a populated field against a null one; it is not true that every committed record carries a value.

C2 BLOCKING. **TRUE.** Re-read of all twenty `outputs/dNN-gate7.json` files. `displayVerdict` identical on 16 of 20. Quote identical on 13 of 20. Moved: d04 `conflict` to `supported_partial`, d07 `null` to `supported_partial`, d13 `conflict` to `supported_partial`, d17 `conflict` to `supported_full`. Quote-only: d10, d11, d12.

C3 BLOCKING. **The harness never read it.** The assembled v4 card never writes `evidenceVerdict` as a stored field. `lib/qc/pipeline-v3/stage7-assemble-card.mjs` passes `evidenceVerdict: verdict` only as an argument to `computeCardMateriality` (Stage 3 `verdictResult.verdict`). The card object stamps `displayVerdict`, not `evidenceVerdict`. `docs/ARCHITECTURE.md` lists `displayVerdict` / `supportState` on qcCard and does not list `evidenceVerdict`. This is not a v4 drop of a field the card used to carry. The kill condition ("the v4 card no longer carries evidenceVerdict at all: stop, do not proceed to Part 3") does not fire: the comparison was never against a card field, and `displayVerdict` is still present. Filed as **B323**. Not fixed here.

C4 BLOCKING. **TRUE.** Recorded `outputs/d17-recheck.json`: `displayVerdict` `supported_full`, `hasRealExcerpt` false, `excerptNotLocatable` true, `primaryExcerpt` empty. B259 (`lib/qc/excerpt-locate.mjs` `gateExcerpt`, `cardExcerptDisplay.js` `resolveCardExcerpt`) hides the bogus span. The evidence row stays (`StatementReviewCard.jsx` L1019, `evidenceRequested`). The reviewer still sees Confirmed plus "The matching passage could not be located in the named source."

C5 CHECK. **TRUE.** Ben's 21 September rule is in the code. `StatementReviewCard.jsx` L1019 renders the evidence row when `evidenceRequested` (`checkWasRequested(summaryClass.evidence)`). `classifyEvidence` in `lib/qc/review-summary.mjs` returns null only when evidence is off. A requested check keeps the row whatever the verdict, including `notChecked`.

C6 CHECK. Before this spec: `api/extract-draft-text.js` accepted `body.pdfEngine` of `officeparser` or `direct`; any other string fell back to the env default. The handler has no auth. A caller sending `officeparser` on a large PDF selected the slow path (B321 report: d13 officeparser 174828 ms). After Part 4.1 the body value is ignored. Env `PDF_ENGINE` remains the switch. Local `prepareUploadedSourcesForPipeline({ pdfEngine })` still works for diagnostics.

## Part 0B. Design

B0. On the recorded d17 card a reviewer sees a green Confirmed evidence row, the locatable-failure sentence in the excerpt slot, a clean line for the other checks, no turned-off line, and `Verdict: Confirmed` in the export. That is a false green. The sentence was not checked against a locatable source passage. The right question is not "did B259 hide the span?" (it did) but "does Confirmed still claim the check succeeded?" It does. This spec should ship the honesty guard. Refusing to build would leave the false green in production.

B1 **AGREE.** Part 1 is a component-level test fed the recorded d17 card from `scripts/diagnostic/extractor-swap/outputs/`. `tests/evidence-card-no-excerpt.test.mjs` loads `d17-gate7.json` and `d17-recheck.json`.

B2 **AGREE.** The recorded card is a false green, so the spec ships the honest minimum. Guard is in `assembleCard`, not the component. `displayVerdict` becomes `not reviewed` with reason slug `excerpt_not_locatable`. `supportState` stays `supported`. Screen and export both read as Not checked. No new user-facing copy.

B3 **REJECT as the outcome.** The reviewer did not already see something honest. B2 fired.

B4 **AGREE.** Section 2.3 of `REPORT.md` is rewritten in place. The original dump sits under a superseded heading.

B5 **AGREE.** This spec does not revert the engine, table detection, the upload cap, or extraction.

## Part 1. What the reviewer sees

Recorded d17 card (`outputs/d17-recheck.json` plus `d17-gate7.json` newVerdict), run through `classifyCard`, `evidenceDisplayVerdictLabel`, `evidenceRowLabel`, and `renderCanonicalExportText`. Editorial and compliance were not in the artefact; they are stamped `clean` as a successful v4 card would be.

Verbatim, before the B322 guard (the B321 artefact):

- badge text: `Confirmed`
- evidence row: `Evidence Confirmed`
- excerpt slot: `The matching passage could not be located in the named source.`
- clean line: `Clean: Editorial, Compliance, Source recency and Framing.`
- turned-off line: none
- export line: `Verdict: Confirmed`

A reviewer would believe that sentence was checked against a source and confirmed. That is false. The excerpt is not locatable.

After the B322 guard (`assembleCard` on the same recorded statement, confirmed, passage rejected / not locatable):

- badge text: `Not reviewed`
- evidence row: `Evidence Not checked`
- excerpt slot: none (requested miss hides the locatable copy, same as any `notChecked` evidence row)
- clean line: `Clean: Editorial and Compliance.`
- turned-off line: none
- export line: `Verdict: Not checked`

The card no longer reads as Confirmed. Screen and export agree.

## Part 2. Consumers of `evidenceVerdict`

The assembled card does not carry `evidenceVerdict`. Consumers across both repos:

| consumer | what it reads | currently reading nothing from the card field? |
|----------|---------------|-----------------------------------------------|
| `lib/qc/pipeline-v3/stage7-assemble-card.mjs` | passes Stage 3 `verdict` into `computeCardMateriality({ evidenceVerdict })` | No. Argument, not a card field. |
| `lib/qc/materiality.mjs` | function argument `evidenceVerdict` | No. |
| `lib/qc/pipeline-v3/qc-pipeline-v3.mjs` L74 | `entry.verdictResult?.verdict` as editorial context | No. |
| `lib/qc/pipeline-v4/index.mjs` L209 | hardcoded `null` on skipped-evidence editorial context | N/A. |
| `lib/qc/pipeline-v4/index.mjs` L667 | `entry.verdictResult?.verdict` as editorial context | No. |
| `scripts/diagnostic/extractor-swap/verify-swap.mjs` L261, L274 | `card?.evidenceVerdict \|\| null` | **Yes.** Stored null on all twenty new records. |
| `scripts/diagnostic/extractor-swap/verify-swap.mjs` L167 | `card?.evidenceVerdict \|\| card?.displayVerdict` | No. Kill detector has the fallthrough the store path lacks. |
| `scripts/diagnostic/delivery-check/b163/production-gates.mjs` L118 | `card?.evidenceVerdict \|\| card?.displayVerdict` | No. That is why B163 records are populated. |
| `scripts/diagnostic/revise/b122-directive-breakdown.mjs` | `card?.supportState \|\| card?.displayVerdict` | No. Local name only. |
| `src/modules/drafting/StatementReviewCard.jsx` L438 | `const evidenceVerdict = qcCard?.displayVerdict` | No. Local alias of `displayVerdict`. |

Filed as **B323**. Not fixed in this spec.

## Part 4

4.1 `pdfEngine` on extract-draft-text was validated to `officeparser` or `direct` but an ordinary POST could still select officeparser. Body override removed. Unknown values already fell back; they still do, because the body is no longer read. Env `PDF_ENGINE` is unchanged.

4.2 **B324.** Neither the old nor the new PDF path configures character maps. Documents with embedded non-Latin fonts may extract poorly. Unchanged from before the swap. Known gap, not a regression.
