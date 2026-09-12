# B178 — editorial and style payloads no longer carry sources

A/B of removing source text from the editorial+style user payload. Product difference only. Same fixtures. Harness files from HEAD copied onto the baseline worktree so labels match.

## Commits and call counts

| Arm | Product | Combined editorial+style completions |
|---|---|---|
| **HEAD** (this B178 commit) | Sources removed from editorial/style payloads; fidelity gate passed `null` on editorial/style only | Style harness **30** + marketing harness **12** = **42** |
| **Baseline** `315e301` | Sources still in the payload | Style harness **30** + marketing harness **12** = **42** |

USD is not recorded on this path (`runEditorialStyleReview` discards usage). Call counts only.

Harnesses: `npm run diagnostic:style-guide`; `node scripts/diagnostic/marketing-language-harness.mjs`.

## Style-guide harness

Checks: **V** `firedOnViolation` · **C** `silentOnCompliant` · **2** `silentOnTwoItem` · **F** no source leaked into the prompt (foreign-source control) · **I** `noIdenticalDirection`. `SKIP` = no `foreignSource` field.

| Rule | Baseline V C 2 F I | HEAD V C 2 F I | Baseline | HEAD |
|---|---|---|---|---|
| `currency_format` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `date_format` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `em_dash` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `english_variant` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `first_person_plural` | N Y Y SKIP Y | N Y Y SKIP Y | FAIL | FAIL |
| `number_spelling` | N Y Y Y Y | Y Y Y Y Y | FAIL | PASS |
| `oxford_comma` | Y N Y N Y | Y N Y N Y | FAIL | FAIL |
| `percentage_notation` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `smart_quotes` | Y Y Y N Y | Y N Y Y Y | FAIL | FAIL |
| `thousand_separator` | Y N Y N Y | Y Y Y Y Y | FAIL | PASS |

| Check | Baseline | HEAD |
|---|---|---|
| `firedOnViolation` | 8/10 | **9/10** |
| `silentOnCompliant` | 8/10 | 8/10 |
| `silentOnTwoItem` | 10/10 | 10/10 |
| Foreign-source control | 6/9 (skipped=1) | 8/9 (skipped=1) |
| `noIdenticalDirection` | 10/10 | 10/10 |
| Rules passed | 5/10 | **7/10** |

F13:S11 inversion (`Replace "14'000" with "14,000"`) is present at baseline and **absent at HEAD**.

## Marketing-language harness (editorial coverage)

| Case | Baseline fired | HEAD fired | Baseline codes | HEAD codes |
|---|---|---|---|---|
| a (delete `genuinely exceptional`) | Y/Y/Y | Y/Y/Y | `marketing_language_excess` ×3 | `marketing_language_excess` ×3 |
| b (keep `genuine differentiator`) | Y/Y/Y | Y/Y/Y | `marketing_language_excess` ×3 | `marketing_language_excess` ×3 |
| c (delete `genuinely`, keep proprietary) | Y/Y/Y | Y/Y/Y | `marketing_language_excess` / `hyperbole_vs_qualitative` / `hyperbole_vs_qualitative` | `marketing_language_excess` ×3 |
| d (keep `exceptionally strong`) | Y/Y/Y | Y/Y/Y | `marketing_language_excess` ×3 | `marketing_language_excess` ×3 |

All 12 runs scored PASS on both arms. No milder substitution.

This harness is the editorial-rule coverage for the A/B. It exercises `marketing_language_excess` (and, at baseline only, the style twin `hyperbole_vs_qualitative`). The other thirteen editorial rules are not in this pack.

## Pinned thresholds

> **E1** No editorial rule that fires at baseline goes silent at HEAD. Zero regressions. THIS IS THE GATE.

**MET.** `marketing_language_excess` fired on every baseline run that used it (a×3, b×3, c×1, d×3). It fired on all 12 HEAD runs. No editorial rule that fired at baseline went silent.

> **E2** The built editorial and style payloads contain no source text. Proven by unit test, not by a run.

**MET.** `tests/b178-editorial-source-blind.test.mjs` T1–T4.

> **E3** Style side `firedOnViolation` does not fall below the baseline count.

**MET.** Baseline 8/10. HEAD 9/10.

> **E4** The foreign-source control is expected to pass 9 of 9 and this is evidence of absence, not of resistance. Record it that way.

**NOT MET on the 9-of-9 count** (HEAD 8/9). `oxford_comma` still raised on the house-correct list in the fourth review. That raise is the same “no change needed” narration as the compliant review; it is not the source reaching the model. E2 already proves the source text is absent from the payload.

**E4 caveat in full:** from B178 the editorial+style payload carries no source. A pass on this check means the source never reached the model, NOT that the model resisted it. `first_person_plural` has no `foreignSource` case and is SKIPPED.

## Concerns surviving at HEAD on a compliant statement

### `oxford_comma`

- **rule id:** `oxford_comma`
- **note:** The statement correctly uses the Oxford comma in the list 'legal, tax, and operations specialists'.
- **suggestedDirection:** No change needed as the Oxford comma is correctly used.

### `smart_quotes`

- **rule id:** `smart_quotes`
- **note:** The statement uses smart quotes (“ ”) instead of straight quotes (" ").
- **suggestedDirection:** Replace the smart quotes around "growth remains on track" with straight quotes.

(The compliant statement already uses straight quotes. This is a false raise, not a source inversion.)

No other fixture produced a surviving concern on a compliant statement at HEAD. `thousand_separator` on F13:S11 did not.

## What the product can no longer say

Editorial can no longer observe that a draft is hedged where the source is clear, or that a causal claim lacks source support. Both are now Evidence matters. The reviewer judges `overreach_unsupported_causal` and `underreach_hedging` from the CURRENT STATEMENT and the surrounding draft only.

## B180 confirmation run at HEAD

HEAD only. Baseline is the recorded **b371929** table above. That arm was not re-run. No total is pinned (F3): a one-check movement is noise.

Checks: **V** `firedOnViolation` · **C** `silentOnCompliant` · **2** `silentOnTwoItem` · **F** no source leaked into the prompt (foreign-source control) · **I** `noIdenticalDirection`. `SKIP` = no `foreignSource` field.

| Rule | b371929 V C 2 F I | B180 HEAD V C 2 F I | b371929 | B180 HEAD |
|---|---|---|---|---|
| `currency_format` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `date_format` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `em_dash` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `english_variant` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `first_person_plural` | N Y Y SKIP Y | N Y Y SKIP Y | FAIL | FAIL |
| `number_spelling` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `oxford_comma` | Y N Y N Y | Y Y Y Y Y | FAIL | PASS |
| `percentage_notation` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |
| `smart_quotes` | Y N Y Y Y | N Y Y Y Y | FAIL | FAIL |
| `thousand_separator` | Y Y Y Y Y | Y Y Y Y Y | PASS | PASS |

| Check | b371929 | B180 HEAD |
|---|---|---|
| `firedOnViolation` | 9/10 | 8/10 |
| `silentOnCompliant` | 8/10 | 10/10 |
| `silentOnTwoItem` | 10/10 | 10/10 |
| Foreign-source control | 8/9 (skipped=1) | 9/9 (skipped=1) |
| `noIdenticalDirection` | 10/10 | 10/10 |
| Rules passed | 7/10 | 8/10 |

No `SURVIVED` lines. Cost meter on this harness printed `costUsd=0.0000 llmCalls=0` (usages not captured on this path).

### Pinned checks (not moved after the run)

> **F1 THE GATE.** Both concerns recorded as surviving at b371929 are gone: the `oxford_comma` "No change needed" raise on the compliant statement, and the `smart_quotes` raise on the straight-quote compliant statement.

**MET.** `silentOnCompliant` 10/10. The oxford raise was dropped by `suppressNoChangeDirections` (`suggestedDirection changes nothing`, rule=`oxford_comma`). The smart_quotes compliant raise did not survive (straight-quote statement; character-presence referee). No other fixture produced a surviving concern on a compliant statement.

> **F2** `firedOnViolation` does not fall below 9 of 10.

**NOT MET.** 8/10. `first_person_plural` still misses, as at b371929. The new miss is `smart_quotes` on the **violation** statement: a concern was raised, then dropped by `suppressNoChangeDirections` (`suggestedDirection changes nothing`). After quote-character normalisation, Replace-curly-X-with-straight-X has identical inner text, so (b) treats it as a no-op.

> **F3** Do not pin a total.

Not pinned.

### Concerns surviving at HEAD on a compliant statement

None.
