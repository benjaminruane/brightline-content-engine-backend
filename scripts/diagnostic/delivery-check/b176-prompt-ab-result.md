# B176 step 1 — prompt A/B on the source-present style harness

Read-only against product code. Harness and fixtures only. No pipeline, accuracy run, or action-list. Combined editorial+style path (`runEditorialStyleReview`).

## Commits compared

| Arm | Commit | Prompt |
|---|---|---|
| Baseline | `ac30e96` (`b1fde9a~1`) | Pre-change. No `HOUSE_STYLE_IS_THE_STANDARD`. Old “preserve the source's original formatting exactly” line still present. |
| HEAD | `b1fde9a` | Step 1 prompt in. House style named as the only formatting standard. |

Both arms used the **same** new harness and the **same** fixtures (copied into a detached worktree). The only product difference is the prompt.

**C3 (pre-change three-check suite).** The ten files in `scripts/diagnostic/fixtures/style-guide-rules/` were the R6.5 passing suite under the old three checks (`firedOnViolation`, `silentOnCompliant`, `silentOnTwoItem`). That three-check path was not re-billed as a separate run before the fourth review was added.

**C2.** `thousand_separator` compliant statement is F13:S11 from `scripts/diagnostic/delivery-check/house-style-inversion-findings.md`. `date_format` compliant statement is the F11:S1 sentence that contains `19 January 2026` (full wording is not quoted in that file; taken from the committed F11 fixture `scripts/diagnostic/fixtures/11_synth_investor_letter_exit.json`). Foreign sources invert those house forms (`14,000`; `19 Jan 2026`).

## Metered spend

Not captured as USD. `runEditorialStyleReview` discards provider usage; the harness fetch tap recorded **0** LLM HTTP bodies (OpenAI SDK uses its own shim, not `globalThis.fetch`). Completed combined reviews: **30 at HEAD**, **30 at baseline**. Printed `costUsd=0.0000` is the tap miss, not a measured zero. Do not treat it as USD 0.00 of model spend.

## Results by rule

Checks: **V** `firedOnViolation` · **C** `silentOnCompliant` · **2** `silentOnTwoItem` · **F** `silentOnForeignSource` · **I** `noIdenticalDirection`. `SKIP` = no `foreignSource` field.

| Rule | Baseline V C 2 F I | HEAD V C 2 F I | Baseline pass | HEAD pass |
|---|---|---|---|---|
| `currency_format` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `date_format` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `em_dash` | N Y Y Y Y | N Y Y Y Y | FAIL | FAIL |
| `english_variant` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `first_person_plural` | N Y Y SKIP Y | N Y Y SKIP Y | FAIL | FAIL |
| `number_spelling` | N Y Y Y Y | N Y Y Y Y | FAIL | FAIL |
| `oxford_comma` | Y Y Y N Y | Y N Y N Y | FAIL | FAIL |
| `percentage_notation` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `smart_quotes` | Y Y Y Y Y | Y Y Y N Y | PASS | FAIL |
| `thousand_separator` | Y Y Y N Y | Y N Y N Y | FAIL | FAIL |

### Totals

| Check | Baseline | HEAD |
|---|---|---|
| `firedOnViolation` | 7/10 | 7/10 |
| `silentOnCompliant` | 10/10 | 8/10 |
| `silentOnTwoItem` | 10/10 | 10/10 |
| `silentOnForeignSource` | 7/9 (skipped=1) | 6/9 (skipped=1) |
| `noIdenticalDirection` | 10/10 | 10/10 |
| Rules passed | **5/10** | **4/10** |

The prompt did not lift the class. HEAD is one rule worse (`smart_quotes` foreign-source inversion; `oxford_comma` and `thousand_separator` also noisy on the compliant statement at HEAD).

## Pinned thresholds

> **A** compliant statement with conflicting source: zero concerns, 10 of 10

**NOT MET.** HEAD `silentOnForeignSource` 6/9 plus one skip. Inversions remained on `thousand_separator`, `oxford_comma`, and `smart_quotes`.

> **B** no rule that fired on its violation at baseline goes silent at HEAD

**MET.** Baseline fired on `currency_format`, `date_format`, `english_variant`, `oxford_comma`, `percentage_notation`, `smart_quotes`, `thousand_separator`. All seven still fired at HEAD. `em_dash`, `first_person_plural`, and `number_spelling` missed the violation on both arms (fidelity drop / wrong category / filter), so they are not a HEAD silence of a baseline hit.

> **C** zero identical-replacement directions at HEAD

**MET.** `noIdenticalDirection` 10/10. The live inversion on F13:S11 is `Replace '14'000' with '14,000'` — replacement is not identical to the quoted original; it is the B176 Correct-to-Incorrect write.

> **D** baseline recorded, not gated

**MET.** Baseline ran in a detached worktree at `ac30e96` with the new harness copied in. It is recorded here. It does not gate the commit.

## Concerns that survived at HEAD on a compliant or foreign-source statement

Verbatim from the HEAD run. Rule id is the fixture `ruleId`.

### `oxford_comma` — compliant

- **rule id:** `oxford_comma`
- **note:** The statement correctly uses the Oxford comma in the list 'legal, tax, and operations specialists'.
- **suggestedDirection:** No change needed.

### `oxford_comma` — foreign-source

- **rule id:** `oxford_comma`
- **note:** The list 'legal, tax, and operations specialists' correctly uses the Oxford comma, which is consistent with the style guide requirement for lists of three or more items.
- **suggestedDirection:** No change needed.

### `smart_quotes` — foreign-source

- **rule id:** `smart_quotes`
- **note:** The statement uses smart quotes (“ ”) instead of straight quotes (" ").
- **suggestedDirection:** Replace the smart quotes with straight quotes: "The CEO said \"growth remains on track\"."

(The current statement already uses straight quotes. The source uses curly quotes. The model attributed the source’s quotes to the statement.)

### `thousand_separator` — compliant

- **rule id:** `thousand_separator`
- **note:** The statement uses a high comma as a thousands separator, which is correct. However, the previous statement uses a low comma, which is inconsistent.
- **suggestedDirection:** Replace '5,500' with '5'500' in the previous statement for consistency.

### `thousand_separator` — foreign-source

- **rule id:** `thousand_separator`
- **note:** The statement uses a high comma as a thousands separator instead of a low comma.
- **suggestedDirection:** Replace '14'000' with '14,000'.

(This is the F13:S11 inversion from the committed diagnostic.)

No other fixture produced a surviving concern on the compliant or foreign-source review at HEAD. `date_format` and `english_variant` raises on those reviews were dropped by the existing filters before the card.

## Verdict

Step 2 must still catch **`thousand_separator`** (spanless apostrophe trap; Correct-to-Incorrect `14'000` → `14,000`), **`oxford_comma`** on an already-correct serial comma (filter keeps that shape), and **`smart_quotes`** (no DROP filter; source curly quotes attributed to a straight-quote statement). `em_dash` on a sentence containing no dash was not reproduced here (fidelity dropped the raise); it remains a no-filter residual, not closed by the prompt.

## Caveat

`first_person_plural` has no `foreignSource` case. The harness reports that check as SKIPPED. It is not a measured foreign-source silence.
