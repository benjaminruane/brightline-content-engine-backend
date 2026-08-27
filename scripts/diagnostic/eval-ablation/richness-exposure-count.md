# Richness-trigger exposure count

Free. Disk only. No model calls.
Scan: corpus and fixture source files under `scripts/diagnostic/sources/`,
`eval-ablation/meridian_source.txt`, claim-spans evaluative sources,
passage-selection probe sources, supersession, b67-probe, and Nordholt
Downloads sources when present. Diagnostic reports and prompt arms excluded.

Trigger definition (from mark-richness-probe.md, CONFIRMED): a mark or
valuation sentence that also carries realised-count or carrying-value content
in the same sentence or the one following, which makes it read as a
performance claim competing with a returned figure.

## Counts

```
sources scanned:                         60
sources with a mark/valuation sentence:  15
of those, with richness trigger:          3
of those 3, with a returned/realised
  draft statement paired in fixtures
  or probe pairs:                         2
```

CONFIRMED: `richness-exposure-scan.json`.

## Rich files (list)

```
eval-ablation/meridian_source.txt
  where: same_sentence
  mark: Fund IV (2019 vintage, EUR 900 million) is currently marked at 1.9x
    gross MOIC and 24% gross IRR, with 4 of 12 platform investments fully
    realised.
  returned/realised drafts against it:
    EA_E3  Fund IV has returned 1.9 times... (same quantity; basis case)
    MF10   Nordholt returned 3.1x... (different entity; probe confirmed clean)

sources/93_adversarial_basis_mismatch.txt
  where: following_sentence
  mark: Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x
    gross MOIC and 24% gross IRR.
  following: Four of twelve platform investments are fully realised; the
    remainder remain in the portfolio at carrying value.
  returned drafts against it: fixture 93 S0/S2/S3 (F93_S2 is the false red)

passage-selection-probe/sources/rich01_mf01_with_rich_mark.txt
  where: following_sentence (same rich text as fixture 93, invented probe)
  returned draft: RICH01 uses returned 2.6 (confl x3 in richness probe)
  not in the fixture corpus baseline
```

## Mark-only files (no richness clause)

```
claim-spans/evaluative-accident/source_ic_memo.txt
claim-spans/evaluative-accident/draft_e3.txt
passage-selection-probe/sources/mf01..mf10 thin mark pages (except rich01)
passage-selection-probe/sources/thin93_f93_with_thin_mark.txt
```

None of the numbered corpus sources 01 to 21, ALP_*, CRF_*, supersession
sources, or Nordholt Downloads sources matched a mark/valuation sentence under
this scan. CONFIRMED: scan rows in `richness-exposure-scan.json`.

## How exposed is the product?

```
In this corpus and fixture set: almost not at all.
  3 rich-mark sources, of which 2 are invented Halden pages (93 and RICH01)
  and 1 is the Meridian eval-ablation fixture. Zero of the main F01-F23
  production-like sources carry the trigger.

Against real LP updates: highly exposed.
  Mark-plus-realised-count wording is ordinary fund reporting. The corpus
  under-samples it. Claude's ten-pair probe (07ad532) used THIN mark lines by
  construction, so its clean EDGE_CASE result reflects the probe, not the
  product. The richness probe (c29bf5a) showed the thin/rich swap alone flips
  the label. That defect is pre-existing on live R3a and independent of R10.
```

This informs backlog only. Not a gate for the R10 blast.

## Tag / backlog reconciliation

```
Checked local tags matching stage2 / review / basis / passage / mark / r3a / r10:
  stage2-rewrite-r3a          live R3a prompt ship
  r2.3-stage2-matching        historical
  review-B48                  magnitude backstop (no MOIC multiples; landmine)
  No tag names the rich-mark passage-selection false red.

BACKLOG before this pass:
  B109  EA_E3 mark-as-returned false green (R10 graded CONFIRM in 8dc6be7;
        corpus blast is this pass). Not the richness hunting defect.
  No existing row for F93_S2 / rich-mark passage selection.

Action: add B115 for the rich-mark passage-selection false red, with the
richness trigger recorded. Do not merge into B109 (different failure mode:
false green vs false red; different quantity relationship).
```
