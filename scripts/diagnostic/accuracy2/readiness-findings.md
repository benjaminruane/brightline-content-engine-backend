# Corpus 2 readiness findings

Read-only diagnostic, 2026-09-09. No pipeline runs, no evidence passes, no Stage 1 extracts. Corpus 1 P29 files (`labels.json`, `group-a-design.json`, `sample-manifest.json`, `statements.json`) were read and not modified. Nothing under `scripts/diagnostic/accuracy/` was written.

**Precedent.** Corpus 1 keeps its living instrument note as `scripts/diagnostic/accuracy/README.md`. Other diagnostic packs keep findings in-folder (`scripts/diagnostic/extraction-check/REPORT.md`, `scripts/diagnostic/bakeoff/REPORT.md`). This pack follows the in-folder pattern at the path the request named. It is not a corpus 1 README rewrite.

---

## Claims C1–C4

| ID | Claim | Verdict |
|----|--------|---------|
| C1 | The extracted text of the two PDFs that completed extraction lives under `scripts/diagnostic/extraction-check/outputs/`. | **CONFIRMED** |
| C2 | A full evidence pass over 261 statements costs about USD 2.27 to 2.70 metered, i.e. about USD 0.0095 per statement per pass. | **FALSE** |
| C3 | `score.mjs` cannot express a label spanning two statements in the same draft. | **CONFIRMED** |
| C4 | `extract-stage1.mjs` and `run-evidence.mjs` currently always process fixtures 01-20 as a block, with no subset option. | **CONFIRMED** |

C1 is confirmed by `run-extraction-check.mjs` (writes `outputs/<stem>.txt`) and by the two files sitting on disk at that path. They are gitignored, not committed.

C2 is false on both the dollar range and the implied rate. Billed full-corpus passes meter **USD 2.22 to 2.93**, not 2.27 to 2.70. Per-statement is about **USD 0.0085 to 0.0112**, not a single 0.0095. Detail in Q5. The two `$0.00` passes (`evidence-pass-1`, `evidence-pass-2`) were ignored as instructed.

C3 is confirmed in code, not only in the corpus 1 README. The README sentence is accurate. Detail in Q2.

C4 is confirmed. `filterFixtures` already knows `only` and `range`, but these two runners hardcode `01-20` and expose no subset flag. Detail in Q1.

---

## Q1 Runner subset

**Verdict: no. Both runners always process fixtures 01–20 as a block. The held-out half cannot be kept unrun without a small CLI change.**

`extract-stage1.mjs` sets `const RANGE = { from: "01", to: "20" }` and `extractRange` always calls `filterFixtures(fixtures, { range: RANGE })`. The only CLI switch is `--out`. `--stability-gate` is documented in the header and never parsed; omitting `--out` always does the two-pass freeze into `statements.json`.

`run-evidence.mjs` calls `filterFixtures(await loadAllFixtures(), { range: { from: "01", to: "20" } })`. The only CLI switch is `--pass`. Freeze path is hardcoded to `scripts/diagnostic/accuracy/statements.json`. It refuses to spend unless that freeze has exactly 261 statements.

Shared helper `scripts/diagnostic/lib/fixtures.mjs` `filterFixtures` already supports `only` (one padded id) and `range` (contiguous from–to). It has no list-of-ids filter. The general diagnostic runner `scripts/diagnostic/run-batch.mjs` exposes `--only` and `--range`; the accuracy extract and evidence runners do not. There is no subset manifest and no directory convention. Fixtures always load from `scripts/diagnostic/fixtures/` via `loadAllFixtures`.

`--out` on extract-stage1 changes the write path only. It still extracts 01–20. `--pass` on run-evidence only names `runs/evidence-pass-<pass>/`. A new pass name avoids clobbering corpus 1 cards, but still runs every fixture 01–20 against the 261-row freeze.

**Smallest change that would allow a named subset** (do not implement here):

1. `scripts/diagnostic/lib/fixtures.mjs` — add `ids: string[]` to `filterFixtures` (comma-separated fixture ids; `only` is one id, `range` is contiguous, neither is a training/held-out split).
2. `scripts/diagnostic/accuracy/extract-stage1.mjs` — parse `--ids 01,03,05` (or equivalent) and pass it into `extractRange`. Keep requiring `--out` for any non-corpus-1 freeze so P29 `statements.json` is not overwritten.
3. `scripts/diagnostic/accuracy/run-evidence.mjs` — same `--ids`; add `--statements <path>` so the freeze is not the protected corpus 1 file; replace the hardcoded `frozenAll.length !== 261` check with “count of frozen rows for the selected ids”.

Until that exists, a training/held-out split cannot be operational. Running either script touches all of 01–20. `generate-worksheet.mjs` is also hardcoded 01–20; it is not required for the split itself.

---

## Q2 Label unit for pairs

**Verdict: no. A label spanning two statements in the same draft cannot be represented in the v1 schema, and `score.mjs` has no pair join. Recommend an additional label kind. Do not fork a second manifest.**

The label unit in code is one statement against the sources.

- `joinKey(fixtureId, text, occurrence)` in `lib.mjs` is `NN::<NFC + collapsed whitespace>::<occurrence>`. One text, one occurrence.
- `load-labels.mjs` writes one row per worksheet line: `{ fixtureId, statementText, occurrence, worksheetRow, group, label }` with `label` in `{ confirmed, partially_confirmed, conflicting, no_support, unrateable }`. `LETTER_TO_LABEL` has no pair kind. Every corpus 1 row has `occurrence: 0`.
- `score.mjs` / `scoreAccuracy` build `cardByKey` from one card per join key, then match each label to exactly one card via `displayVerdict`. Rateable labels are the four evidence verdicts. `unrateable` is an escape, not a pair.
- There is no `statementTextB`, `pairId`, `kind`, or second occurrence field. Extra JSON keys on a new corpus 2 file would be ignored. Stuffing two sentences into `statementText` would fail the join.

The corpus 1 README known-limit paragraph is therefore true of the code. F13 in corpus 1 was planted as same-fact source disagreement (draft cites 320 / 11.1%; another passage in the same source disagrees). That still labels one statement against sources. It is not a draft-internal two-statement label.

Altering the four protected files is not required and must not happen. Corpus 2 can have its own `labels.json`. The v1 row shape still cannot name a pair.

**Recommend: additional label kind**, not a separate scorer as the primary move, and not a separate manifest.

- A pair is a label-unit problem. Group A/B sampling stays per-statement (`mapGroupA` is span-in-statement; `sampleGroupB` draws leftover statements). A second manifest would split sampling from scoring without giving the scorer anything to join.
- A separate scorer with no schema has nothing to read. An additional kind (`kind: "statement"` default, `kind: "draft_internal_pair"` with two join keys, e.g. `statementTextA` / `occurrenceA` / `statementTextB` / `occurrenceB`) is the data contract. The existing statement scorer should skip pair rows. A small pair branch or pair scorer is the follow-on, not a substitute for the kind.
- Do not overload `unrateable` / `E`. That is the escape falsifier, already load-bearing.

The pipeline still emits one `displayVerdict` per card. A pair label measures a relation the cards do not currently report. That is expected: corpus 2 can record the pair; catching it is later product work, not a schema cheat.

---

## Q3 The ugly text

**Verdict: both extracts are on disk under the expected gitignored outputs directory. They are not committed. Regeneration is extractor-only (no LLM spend).**

The two PDFs that both reached production and finished under 60s locally are `3i-press-release-fy25-highlights.pdf` (3i highlights press release) and `hpif-factsheet-march-2026.pdf` (HarbourVest Private Investments Fund factsheet). Confirmed in `scripts/diagnostic/extraction-check/REPORT.md` and `outputs/summary.json`.

### 3i highlights press release

| | |
|---|---|
| Full path | `scripts/diagnostic/extraction-check/outputs/3i-press-release-fy25-highlights.txt` |
| Git | gitignored (`.gitignore` line `scripts/diagnostic/extraction-check/outputs/`). Not committed (`git ls-files` empty). Present on this machine. |
| Byte size | 6886 |
| Characters | 6777 |
| Line count | 98 lines in the file (`split("\n")`). `wc -l` reports 97 because the file has no trailing newline. |

First 40 lines, verbatim:

```
[Image: pdf_image_p1_1.bmp]
15 May 2025
3i Group plc announces results for the year
to 31 March 2025
[Image: pdf_image_p1_2.bmp]
A year of consistently strong growth
• Total return of £5,049 million or 25% on opening shareholders’ funds (2024: £3,839 million, 23%) and NAV per
share of 2,542 pence (31 March 2024: 2,085 pence). This includes a 27 pence per share loss on foreign exchange
translation.
• Our Private Equity business delivered a gross investment return (“GIR”) of £5,113 million or 26% (2024:
£4,059 million, 25%). This result was driven primarily by Action’s continued strong performance in FY2025. Royal
Sanders, our other longer-term hold investment, also produced a very strong return, driven by organic and
acquisitive growth. We saw good growth across several of our other consumer and private label, industrial and
healthcare portfolio companies. Trading in our services and software portfolio has been resilient, despite a cautious
IT spending environment. Market-specific challenges continue to impact a small number of portfolio companies.
• Action generated a GIR of £4,551 million, or 32%, on its opening value . It delivered annual revenue growth of
22%, like-for-like (“LFL”) sales growth of 10.3% and EBITDA growth of 29% in 2024. The business has started 2025
well, with net sales of €3,521 million (first three periods of 2024: €3,004 million), operating EBITDA of €464 million
(first three periods of 2024: €397 million) and LFL sales growth of 6.2% in the first three periods of 2025 (P3 2025
which ended on 30 March 2025). The LTM run-rate EBITDA to P3 2025, totalled €2,328 million (LTM run-rate
EBITDA to 31 March 2024: €1,848 million), representing a 26% increase on the same period last year. This strong
performance supported value growth of £4,324 million for Action in the year, in addition to realised proceeds and
dividend distributions to 3i of £1,597 million .
• At the end of week 19 (11 May 2025), Action’s year-to-date LFL sales growth was 6.8% and 76 new stores had been
added. At that date, Action’s cash balance was €427 million.
• The Private Equity team invested £1,177 million in the year, including £768 million in a further stake in Action,
£318 million in new investments in Constellation, WaterWipes and OMS Prüfservice, £39 million in a further
investment in Royal Sanders and £54 million in the further development of ten23 health. Our Private Equity portfolio
companies completed 12 bolt-on acquisitions, only one of which required further funding from 3i.
• The Private Equity team generated £659 million of realised proceeds from the realisations of nexeye and WP, both
generating money multiples of 2.0x or higher.
• Our Infrastructure business generated a GIR of £52 million, or 3% (2024: £99 million, 7%). This performance
was driven principally by a good level of dividend and interest income alongside value growth from our infrastructure
funds, which more than offset subdued share price performance from our 29% stake in 3i Infrastructure plc (“3iN”).
• In total across the Group, we received £2.4 billion of cash proceeds from the portfolio. We ended the year with
liquidity of £1,323 million, net debt of £771 million and gearing of 3%.
• Total dividend of 73.0 pence per share for FY2025, with a second FY2025 dividend of 42.5 pence per share to be
paid in July 2025 subject to shareholder approval.
Simon Borrows, 3i’s Chief Executive , commented:
“FY2025 was another successful year for 3i, continuing our track record of consistently delivering strong shareholder
```

### HarbourVest fund factsheet

| | |
|---|---|
| Full path | `scripts/diagnostic/extraction-check/outputs/hpif-factsheet-march-2026.txt` |
| Git | gitignored, not committed, present on this machine (same `.gitignore` rule). |
| Byte size | 13988 |
| Characters | 13892 |
| Line count | 195 lines in the file. `wc -l` reports 194 (no trailing newline). |

First 40 lines, verbatim:

```
[Image: pdf_image_p1_1.bmp]
[Image: pdf_image_p1_2.bmp]
HarbourVest Private Investments Fund
("HPIF")
March 2026 Factsheet
Unless otherwise stated, data is as of March 31, 2026
About HarbourVest 1
HarbourVest has a 40+ year track record of investing in private equity through a variety of private market cycles, seeking to
leverage its deep network of relationships, integrated investment strategy approach, proactive deal sourcing, and rigorous
due diligence process to best serve our clients.
$161.0B 233 1,309 675+
total AUM across all investment direct deals sourced active general
strategies professionals partner relationships
I n ve s t m e n t o b je c t ive : Se e k t o g e n e ra t e c a p it a l g ro w t h o ve r t h e lo n g -t e rm .
Key fund attributes
Direct deal flow alongside Focus on small and middle Diversified seed portfolio
experienced managers market private companies from a US institutional
investor
Seeking cost-effective private Exposure to fast growing, Private markets portfolio
investments sourced through hard-to-access companies of seasoned investments across
long-term relationships and with, in our view, strong multiple vintages seeded by
allocated on a pro-rata basis outperformance potential institutional anchor client
$653.0M 57 40+
Fund NAV Companies 2 General Partners 2
HPIF portfolio exposures 3
Strategy Industry 4 Geography V intage
 Direct 88%  Application Software 15%  North America 70%  2025 26%
 Secondary 12% 

10%
Health Care Technology  Europe 25%  2020 19%
Services 7%
IT Consulting & Other  Asia 3%  2021 18%
 Research & Consulting  Australia 2%  2022 15%
Services 7%  2026 9%
 Health Care Services 6%  2023 7%
 Other 55%  2024 5%
1. Direct deals include both co-investment and single asset continuation deals. All data is as of December 31, 2025 with the exception of direct deals sourced which
reflects calendar year 2025.
2. Based on latest available information and relative to the look through company exposure in HPIF. Assessed General Partners based on the high-level portfolio (i.e.
```

If they disappeared: re-download the PDFs from the URLs in `extraction-check/REPORT.md` into `inputs/` (also gitignored), then `node scripts/diagnostic/extraction-check/run-extraction-check.mjs`. That path is production extractor only. No LLM. Metered USD 0. Wall clock on these two files last time was 45s and 32s; the script as written walks all 11 inputs, including 60s timeouts. Do not re-run it to refresh this note.

---

## Q4 Join key under ugly text

**Verdict: the 3i extract has no duplicate normalised sentences. The HarbourVest factsheet does. If that factsheet is used as draft text, the occurrence index is fragile and the join needs a decision before any labelling.**

Join normalisation, from `scripts/diagnostic/accuracy/lib.mjs` `normalizeStatementText`: Unicode NFC, collapse whitespace runs to one space, trim. Join key is `fixtureId + that string + occurrence`. No fuzzy match. `charStart` / `charEnd` are diagnostics only.

The join does not split. Units below were split first, then that normalisation was applied. No Stage 1 LLM. Sentence units: `.!?` followed by whitespace, plus blank-line paragraph breaks, then NFC + collapse. Line units are also reported because PDF running headers and footers are usually whole lines without a terminator, so they glue onto unique following text and disappear from sentence-dup counts.

### 3i highlights

| Grain | Units considered | Distinct normalised | Types with count > 1 | Extra copies |
|-------|------------------|---------------------|----------------------|--------------|
| Lines | 98 | 98 | **0** | 0 |
| Sentences | 43 | 43 | **0** | 0 |

Five most frequent duplicates: none.

Standalone page numbers `1`, `2`, `3` appear once each. The running header does not repeat as a normalised string. Occurrence is not stressed on this file.

### HarbourVest factsheet

| Grain | Units considered | Distinct normalised | Types with count > 1 | Extra copies |
|-------|------------------|---------------------|----------------------|--------------|
| Lines | 195 | 187 | **6** | 8 |
| Sentences | 88 | 79 | **7** | 9 |

Five most frequent **sentence** duplicates (join grain):

| Count | Normalised text |
|------:|-----------------|
| 3 | `2.` |
| 3 | `3.` |
| 2 | `% of HPIF Portfolio excluding short term investments such as cash, cash equivalents, and money market funds.` |
| 2 | `4.` |
| 2 | `Accordingly, the composition of an industry or group of industries may change from time to time.` |

Remaining sentence duplicates (not in the top five): `Industry or group of industries is defined to mean those companies that are assigned the same sub-industry classification under the Global Industry Classification Standard (GICS).` (2), `The Fund is a non-diversified registered closed-end fund.` (2).

Five most frequent **line** duplicates (header/footer/table grain the sentence split under-counts):

| Count | Normalised text |
|------:|-----------------|
| 3 | `2025 N/A N/A N/A 1.03% 2.83% 1.95% -0.31% 0.75% -0.17% -0.98% 0.92% -0.17% 5.95%` |
| 3 | `HarbourVest Private Investments Fund` |
| 2 | `2026 -0.99% -0.27% -1.03% -2.27%` |
| 2 | `3` |
| 2 | `Diversification does not ensure a profit or protect against a loss. The Fund is a non-diversified registered closed-end fund.` |

Sixth line duplicate: `For the period ended March 31, 2026` (2). The fund name sits on lines 3, 50, and 95 (page starts).

**Decision required before labelling if the factsheet is used as a draft.** Corpus 1 never needed occurrence: every freeze row and every label has `occurrence: 0`. On this factsheet, identical normalised strings already collide. Footnote markers (`2.`, `3.`, `4.`) are noise. Repeated legal sentences and the repeated fund-name header are not. If Stage 1 keeps them as statements, two labels that quote the same disclaimer will depend on occurrence index, which a human worksheet will get wrong. Options, none implemented here: strip running headers, footers, and repeating disclaimers before freeze; put occurrence on the worksheet as a first-class column and reject any freeze with duplicate normalised text unless the design file names which copy is planted; or do not use this extract as draft text (use it only as a source, and write a synthetic draft whose statements are unique after NFC + collapse).

The 3i extract does not force that decision. The factsheet does. Do not start labelling against a freeze taken from the factsheet until one of those options is chosen.

---

## Q5 Real metered cost

**Verdict: C2 is false. Billed full-corpus passes cost USD 2.22 to 2.93, about USD 0.0085 to 0.0112 per statement, not 2.27–2.70 / 0.0095.**

Ignored as instructed: `evidence-pass-1` and `evidence-pass-2`, both `costUsd: 0`, 261 cards, 2026-09-05 instrumentation bug fixed in `32f3b97`.

Every billed artefact under `scripts/diagnostic/accuracy/runs/`:

| Run | Metered USD | Cards / statements | USD per statement |
|-----|------------:|-------------------:|------------------:|
| `evidence-pass-spans-1` | 2.220615 | 262 | 0.00848 |
| `evidence-pass-lift-1` | 2.266983 | 261 | 0.00869 |
| `evidence-pass-cw-2` | 2.298853 | 261 | 0.00881 |
| `evidence-pass-rt-2` | 2.425753 | 261 | 0.00929 |
| `evidence-pass-reducer-2` | 2.477763 | 261 | 0.00949 |
| `evidence-pass-reducer-1` | 2.928313 | 261 | 0.01122 |
| `evidence-pass-rt-1` | 2.929663 | 261 | 0.01122 |
| `evidence-pass-cw-1` | 2.932075 | 262 | 0.01119 |
| `f13-spans` (single-statement probe, not a full pass) | 0.022015 | 1 | 0.02202 |

`simulate.json` under `evidence-pass-spans-1` repeats that pass’s 2.220615; it is not a second spend.

Notes on the denominator:

- Frozen-list passes (`lift-1`, `reducer-1/2`, `rt-1/2`) have 261 cards and `stage1Source: "frozen"`. That is the corpus 1 freeze.
- `cw-1` and `spans-1` have 262 cards and `stage1Source: "llm"`. Live Stage 1 produced one extra statement on F07 (8 vs 7 on the freeze). `cw-2` is also `llm` but landed on 261.
- `f13-spans/result.json` is a one-statement widened-span probe (combined USD 0.022015). It is billed and listed; it is not a 261-statement pass and is not used to judge C2.

C2’s “about 2.27 to 2.70” window is the cheap later/second passes only (lift 2.27, spans 2.22, cw-2 2.30, rt-2 2.43, reducer-2 2.48). First passes of the conflict-wins, reducer, and rounding pairs are ~2.93. The 0.0095 figure is reducer-2 / 261 (0.00949), not a typical rate. Mid-range of the real full-pass band is about **USD 0.010 per statement per pass**. Corpus 1 README pair totals remain right: reducer pair 5.41, rounding pair 5.36, lift 2.27.

Budget implication for corpus 2 (~240 statements, one evidence pass, same evidence-only shape): expect roughly **USD 2.0 to 2.7** if the cheap later-pipeline cost holds, or **about USD 2.7 to 3.3** if a first-pass / heavier-matcher cost holds. Two cache-off passes scale from there. This is a reading of existing meters, not a new estimate run.

---

## Q6 Design file shape

**Verdict: corpus 2 must copy these two JSON shapes. Drop the F15 cap fields. Keep span-in-draft faults with no verdict fields, and per-statement Group A/B rows with `occurrence`.**

### `group-a-design.json`

Schema (from the file and from `mapGroupA` / `designHasVerdictFields` in `lib.mjs`):

```json
{
  "writtenAt": "YYYY-MM-DD",
  "protocol": "string — membership rule in prose. Must not mention verdicts.",
  "faults": [
    {
      "id": "string — unique fault id, e.g. F05-acquirer",
      "fixtureId": "string — zero-padded fixture id",
      "span": "string — verbatim substring of the fixture draft",
      "quotedFrom": "string — provenance path + ' draft'",
      "why": "string — why this span is a planted fault, citing the source contradiction"
    }
  ]
}
```

A statement joins Group A if and only if `statement.text.includes(fault.span)` for that `fixtureId`, and the span maps to exactly one statement (`unique`). `unmapped` or `ambiguous` fails the sample. The design blob must not contain `displayVerdict`, `qcCards`, `evidenceSummary`, `classification`, or `commentary`.

Representative row (corpus 1, unredacted):

```json
{
  "id": "F05-acquirer",
  "fixtureId": "05",
  "span": "Halden Group has agreed to acquire Norwell Aerospace Components",
  "quotedFrom": "scripts/diagnostic/fixtures/05_synth_competitor_press_release.json draft",
  "why": "Draft names Halden as acquirer from Westhaven. Source names Westhaven acquiring Norwell from Bridgepoint."
}
```

### `sample-manifest.json`

Schema (from the file and from `sample.mjs` `buildSample`):

```json
{
  "seed": 0,
  "labelBudget": 0,
  "groupACount": 0,
  "groupBCount": 0,
  "f15Cap": 0,
  "perFixtureFloor": 0,
  "weighting": {
    "method": "string",
    "weight": "string",
    "f15CapApplied": true,
    "rawWeights": { "<fixtureId>": 0 },
    "allocationBeforeCap": { "<fixtureId>": 0 },
    "allocationAfterCap": { "<fixtureId>": 0 },
    "drawnPerFixture": { "<fixtureId>": 0 },
    "excessRedistributed": 0,
    "nonACount": 0
  },
  "groupA": [
    {
      "fixtureId": "05",
      "statementText": "string",
      "occurrence": 0,
      "index": 0,
      "designIds": ["F05-acquirer"]
    }
  ],
  "groupB": [
    {
      "fixtureId": "01",
      "statementText": "string",
      "occurrence": 0,
      "index": 0
    }
  ]
}
```

Representative Group A row (unredacted):

```json
{
  "fixtureId": "05",
  "statementText": "Halden Group has agreed to acquire Norwell Aerospace Components, a leading manufacturer of structural composite components and titanium machined parts, from Westhaven Capital.",
  "occurrence": 0,
  "index": 0,
  "designIds": ["F05-acquirer"]
}
```

Representative Group B row (unredacted):

```json
{
  "fixtureId": "01",
  "statementText": "Shopify (the \"Company\") is a Canadian e-commerce platform serving small and medium businesses, founded in 2007 in Ottawa.",
  "occurrence": 0,
  "index": 0
}
```

`score.mjs` keys Group A/B from `manifest.groupA` / `manifest.groupB` via `joinKey(fixtureId, statementText, occurrence)`. Group A rows carry `designIds`; Group B rows do not.

### Do not carry forward (corpus 1 accidents)

- **`f15Cap`, `f15CapApplied`, `excessRedistributed`, and the method string “hamilton-largest-remainder then F15 cap …”.** F15 was an oversized 33-statement non-A pool that Hamilton would have given 12 Group B slots; it was capped at 6 and the excess redistributed. That is a corpus 1 fixture accident, also hardcoded as `F15_CAP = 6` in `lib.mjs`. Corpus 2 should not ship an F15 cap unless a new fixture actually blows the allocation. Keep Hamilton + cap-to-pool. Drop the named F15 fields.
- **`seed: 20260905` and `labelBudget: 100` as copied numbers.** Same keys, new values. 100 and that seed are the closed corpus 1 draw.
- **Design `quotedFrom` paths into corpus 1 fixtures.** Keep the field; point it at corpus 2 drafts.

### Carry forward

- Fault object: `id`, `fixtureId`, `span`, `quotedFrom`, `why`. Span quoted from the draft. No verdict fields.
- Group A membership = unique span-in-statement. Hard cap on `|A|` (corpus 1 used 25) is a protocol number, not an F15 accident; pick a new cap when the 54 planted faults are designed.
- `perFixtureFloor: 0` unless corpus 2 explicitly wants a floor.
- `occurrence` on every sampled row, even if most are 0. Q4 makes this load-bearing on ugly PDF drafts.
- `designIds` array on Group A (one statement may carry more than one fault).
- Weighting diagnostic block minus the F15-specific keys: `rawWeights`, allocations, `drawnPerFixture`, `nonACount`.
