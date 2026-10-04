# B372. Match the relation not the spelling, resolve what the company means, and look for a date before judging one

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | e3a0c7f | SHIP VERIFIED  e3a0c7f  main  162 files  1790 tests |
| frontend | not touched | |

Ids used: B372 (this spec), B373 (valuation leftover, filed not built).

Cost: USD 0. No model calls. No billed run (R4).

Browser: skipped. No layout, control, or card-face chrome change. Deterministic assembly and selection only. Checked by replaying `tests/fixtures/real-runs-2026-10-04-hicl/` and the 3i payloads.

---

## Part one. Word endings.

Chosen stem: a short suffix rule over the closed `CAUSAL_CONNECTIVES` list, applied only to those list tokens and to candidate words on the other side under the same rule. Not a general stemmer. No new dependency.

Why: the list is ours and small. `driven` and `driving` both cut to `driv`. A Porter stemmer would buy inflection we do not want (`following` vs every `follow` in a passage) and would stem the passage as a document, which the brief forbids.

Clean HICL S1 `EBITDA growth driven by capital expenditure` against `capex programmes driving EBITDA growth` now drops. The 3i `driven primarily by` case still drops on the exact phrase, and still would via the stem. `returns of 14% across the entire portfolio` is not a causal family and still survives. A constructed `driven by` against a passage with no `driv*` relation still survives.

P34. Callers of `applyEditorialSourceAwareness`: Stage 7 assembly, and the editorial tests. Stemming runs only when `objectionableTerms` family is `causal`. Evaluative and other codes are unchanged.

---

## Part two. What "the company" refers to.

### Design

Lookback is the immediately preceding statement only. The preceding statement must name exactly one source-vocabulary party after a case-sensitive match, skipping acronyms, geographies, and generic `company`/`firm`/`group`. The confirming passage must name that party and must itself contain `the company`. Then, and only then, a leftover `supported_partial` with no named-check slug lifts to `supported_full`. The However-plus-not gap sentence is stripped from the comment.

Defined-term form `[Tt]he Company` stands down. The source defines `the Company` as HICL and uses the capitalised form for HICL, lowercase `the company` for Fortysouth. The draft imports neither convention. Reading the source's defined terms to force `the company` to mean HICL would recreate today's false partial, or create a finding. R2 forbids that. We do not use the defined term to assert support.

When the guess is wrong, or when any gate fails, the helper returns null and the card is exactly as today.

### Rejected

- Unbounded lookback. Too many named parties accumulate. Ambiguity stands down, so S6 would never lift.
- A window of two or three preceding statements. Clean S4 names Virgin Trains and St Pancras; S5 names Fortysouth. Two names in range, stand down.
- Nearest named entity without a passage check. A preceding TowerCo with a Fortysouth quote would suppress on the wrong name.
- Using the source's `the Company` = HICL mapping to create or keep a HICL reading. That is a finding, or it preserves the false partial. R2.

### When it is wrong

Null. No new slug. No move toward conflict. No support asserted on a silent card. Doctored S6 stays conflict (increase vs reduction). A draft with no antecedent is unchanged. A draft where two different companies sit between the reference and its antecedent is unchanged, because the preceding statement is the nearer company and the quote names the further one.

Clean HICL S6 comes back confirmed. Antecedent Fortysouth. Comment loses the However sentence that said the source does not confirm `the company`. Leftover copy still asks the reviewer to clarify Fortysouth vs the entire company. That sentence is not a finding.

---

## Part three. A wrong date must be found.

Selection now searches the source for a sentence carrying a date of the same subject family as the statement date, whether or not the value matches, then B345/B347 rule (b) compares. Dates stay blocked in the money eligibility path. No Jaccard. No new checker.

Subject family is closed period cues (`months to`, `period from`, `reporting periods ending`) versus year-end cues (`year ending`, `year to`, `financial year`). A `from` date is not a `to` date. When both sides name a month-count, the counts must match, so `six months to` is not `12 months to`. A date with no period or year cue is not a subject. No date of that family in the source means no span is added and no comparison runs.

An agreeing same-subject date is preferred when one exists. A disagreeing date is appended only when every existing locatable span is confirmed, and only when no existing span already carries a date of that family. That keeps 3i period findings on their existing spans.

Doctored HICL S0 is no longer Confirmed. The card quotes `The Board of HICL is issuing this Interim Update Statement, which relates to the period from 1 October 2025 to 28 February 2026.` Clean S0 stays Confirmed and still shows that period passage. A statement with no date is unaffected.

P34. Callers of `confirmingPassageVerdict` / `demoteConfirmedClassifications`: `lib/qc/pipeline-v4/index.mjs` (live writer, after `appendDateSubjectSpans`), and the confirming-passage / currency / total-disagreement / framing / second-conflict-quote tests. Money fixtures have no same-subject date pair, so they do not newly demote. 3i support-span classifications are unchanged.

Live Stage 5 will see the new conflict and write to it. Fixture commentary is not rewritten (R4).

---

## Cards that change

Source: `scripts/diagnostic/b372/changed-cards.json`, replay of assembly plus the date path against stored payloads. Face-changing rows:

| Payload | S | What changes |
|---------|---|--------------|
| HICL clean | 1 | Editorial `overreach_unsupported_causal` drops. Verdict stays Confirmed. Quotes unchanged. |
| HICL clean | 6 | `supported_partial` / moderate becomes `supported_full` / none. Comment drops the However gap sentence. Quote unchanged. |
| HICL doctored | 0 | `supported_full` / none becomes `conflict` / high. Primary quote becomes the period sentence naming 1 October 2025 to 28 February 2026. |

3i September S3 and S12 still drop `record year` and `driven primarily by` at assembly. That is B355 against the stored payload, not a new B372 face change. No 3i card gains a finding. No 3i period span moves.

---

## Also recorded, not fixed. Valuation gains.

Both HICL runs confirm S5 `valuation gains` against the source's `in line with HICL's valuation assumption`. Not planted. The author's own clean sentence claims an outcome the source does not state. Filed **B373**.

Part three would not have caught it. There is no date in that discrepancy. The shape of a later check is a claimed financial outcome (`valuation gains`) against source language that only aligns performance with an assumption or budget, without stating that outcome.

---

## New files

- `lib/qc/causal-stem.mjs`
- `lib/qc/generic-company.mjs`
- `lib/qc/date-subject.mjs`
- `tests/b372-relation-company-date.test.mjs`
- `scripts/diagnostic/b372/REPORT.md`
- `scripts/diagnostic/b372/dump-changed.mjs`
- `scripts/diagnostic/b372/changed-cards.json`
- `tests/fixtures/real-runs-2026-10-04-hicl/` (README, payloads, source extract)

## Design decisions

1. Suffix stem, not a stemmer package, list tokens only.
2. Generic-company lookback is one preceding statement, unique non-acronym vocab party, passage must name that party and `the company`. Suppress leftover partial only.
3. Do not resolve from the source's defined term `the Company`.
4. Date subject families by closed cues, not Jaccard names. Month-count must match when both sides have one. Prefer agreeing, then disagreeing. Do not append a disagreeing date onto a card that already has a non-confirmed span.
5. B345 rule (b) compares the dates. No new checker.

---

## Cost report

Zero. No billed run.
