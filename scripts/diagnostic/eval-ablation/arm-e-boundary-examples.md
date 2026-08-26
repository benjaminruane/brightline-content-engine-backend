# Arm E boundary examples, arm G measured, B48 backstop read

Date: 2026-08-26
Harness: `scripts/diagnostic/eval-ablation/run-arm-e-boundary-examples.mjs`
Rows: `scripts/diagnostic/eval-ablation/arm-e-boundary-examples-rows.json`
Live prompt untouched: `lib/qc/pipeline-v4/prompts/stage2_v4.md`
Meridian: `scripts/diagnostic/eval-ablation/meridian_source.txt` (Halden copy)
Model: openai/gpt-4o, temperature 0, seed 1, cache OFF
Fingerprint on drift call: `fp_17e3c4f467`

## Verdict

```
STOP BEFORE E/G BILLING.

Arm A x1 drift check failed on 1 of 23 statements.
F12_S0: expected confirmed (2026-08-26 label), got partially_confirmed.
E x3 and G x3 were not run. Primary / secondary / CONFIRM|SPLIT|STOP
stopping rule for EA_E2 was not tested.

Measured cost: $0.270728 (drift only).
```

Assessment: the stop is correct under the written rule. Separately, F12_S0's
new label is probably the better read of the source (duration mismatch), and
arm D already flagged that. The 2026-08-26 "confirmed" baseline for F12_S0 is
a soft reference, not an adjudicated truth. Still: do not bill E/G until the
drift baseline is resolved deliberately.

---

## Part 1: Why the B48 magnitude backstop did not hold F17_S9

### 1. Conditions under which the magnitude backstop fires

From `lib/qc/pipeline-v4/stage2-match-sources.mjs`:

`applyRoundingToleranceBackstop` forces conflicting when
`hasEgregiousMagnitudeGap(statementText, passage)` is true (and periods are
not a non-overlap case that preserves the model class):

```
const gap = hasEgregiousMagnitudeGap(statementText, passage);
...
if (gap) {
  return { classification: "conflicting", passage, explanation };
}
```

`hasEgregiousMagnitudeGap` returns true only when, for percent / money / count
groups extracted from statement AND returned passage:

```
if (!stmtFigs.length || !srcFigs.length) continue;
...
if (best.value === s.value || isCorrectRounding(best.value, s.value)) continue;
if (!isEgregiousPair(s.value, best.value, kind)) continue;
```

Egregious pair (percent):

```
if (kind === "percent") return ratio >= 1.8 || diff >= 15;
```

Percent force also requires matching non-empty metric ids:

```
if (kind === "percent") {
  const a = figureMetricId(s);
  const b = figureMetricId(best);
  if (!a || !b || a !== b) {
    ...
    continue;
  }
}
```

It does not read the model explanation. It does not scan the full source file.
Only statement text plus the passage the model returned.

### 2. Why it did not force conflicting on F17_S9 under arm D

Arm D row (run 1; runs 2 and 3 same pattern), source file
`scripts/diagnostic/sources-extracted/17_synth_real_estate_logistics.txt`:

```
statementId: F17_S9
variantId: D
run: 1
classification: partially_confirmed
preBackstopClassification: partially_confirmed
backstopChanged: false
explanation: The source confirms the 40% lease roll and mentions a EUR 38
  million capex plan. However, it estimates embedded rental reversion at 18%,
  not 40%, creating a frame mismatch. ...
passage: capture of embedded reversion as approximately 40% of leases roll
  during the hold period, value-add capex returning a yield-on-cost of
  approximately 8.5%, and exit at a 5.0% yield reflecting modest yield
  compression supported by continued strong investor demand for the asset class.
```

Two concrete failures:

1. Passage selection. The returned passage has the lease-roll 40% language and
   does not include the source's ~18% reversion figure. The backstop cannot
   compare 40 vs 18 if 18 is not in the passage.

2. Percent extraction. The regex is
   `/(\d+(?:\.\d+)?)\s*(?:%|per\s?cent)\b/gi`.
   `"40 percent"` extracts. `"40%"` / `"18%"` / `"8.5%"` extract as empty
   because `\b` does not hold after `%`. Replayed on the arm D texts:
   statement figures = [{40, "40 percent", lease}, {38e6 EUR capex}];
   passage figures = []. Gap = false. Hence `backstopChanged: false`.

Replay note (assessment, settled by code): if the passage had been
`embedded rental reversion of approximately 18 percent` against a statement
claim of `40 percent` reversion, `hasEgregiousMagnitudeGap` returns true and
would force conflicting. The backstop works when the model returns the right
passage in `percent` word form with matching metric ids. It is not a safety net
against a wrong or `%`-only passage.

### 3. Period gate that held F90_S0: different mechanism

`applyPeriodGateBackstop` is a separate function. It uses
`result.periodAssessment` (model-emitted periods and roles). When periods do
not overlap and the class is confirmed or conflicting, it maps to
`no_support`.

F90_S0 under prior arms: model preBackstop was `conflicting`; period gate held
final `no_support`. That is not magnitude logic. It needs the model to emit a
usable `periodAssessment`. It is not statement-text-only.

### 4. Prompt-independent vs not (graded set)

```
PROMPT-INDEPENDENT (or nearly; settled by code on statement text alone):
  F01_S11  procedural closer regex -> no_support
           (isProceduralCloserStatement; no passage needed)

NOT A GUARANTEE (prompt / model passage / periodAssessment matter):
  F17_S9   magnitude backstop needs comparable figures in the returned
           passage, working percent extraction, matching metric ids
  F90_S0   period gate needs periodAssessment (+ class) from the model

ADJUDICATED CORRECT LABELS (independent of the prompt under test;
established against source in prior pass, not by harness baseline):
  EA_E2     partially_confirmed   exhibit
            source: scripts/diagnostic/eval-ablation/meridian_source.txt
  CS_E3     partially_confirmed   exhibit
            source: scripts/diagnostic/claim-spans/evaluative-accident/source_ic_memo.txt
  F01_S10   partially_confirmed   exhibit (baseline confirmed = FALSE GREEN)
            source: 01_bvp_shopify_memo
  F04_S20   partially_confirmed   exhibit (baseline confirmed = FALSE GREEN)
            source: 04_synth_vc_pinterest_style_memo
  F19_S7    partially_confirmed   control (baseline CORRECT)
            source: 19_synth_annual_report

RECORDED ONLY (not gated):
  EA_E3     no arm carries a mark rule
  EA_E1     already partial at baseline

EVERY OTHER LABEL IN HARNESS OUTPUT: UNADJUDICATED
```

Assessment: treating "code backstop" as a guarantee was wrong. Procedural
closer is the only graded-set backstop that is statement-deterministic.
Magnitude and period gate are conditional on what the model returns. F17_S9's
arm D failure is evidence, not a fluke.

---

## Part 2: Graded set update

```
id         role      adj                         correctLabel           baseline
EA_E2      exhibit   EXHIBIT_ADJUDICATED         partially_confirmed    confirmed (FALSE GREEN)
CS_E3      exhibit   EXHIBIT_ADJUDICATED         partially_confirmed    confirmed (FALSE GREEN)
F01_S10    exhibit   EXHIBIT_ADJUDICATED_FALSE_GREEN  partially_confirmed  confirmed (FALSE GREEN)
F04_S20    exhibit   EXHIBIT_ADJUDICATED_FALSE_GREEN  partially_confirmed  confirmed (FALSE GREEN)
F19_S7     control   CONTROL_ADJUDICATED         partially_confirmed    partially_confirmed (CORRECT)
EA_E3      recorded  RECORDED_ONLY               (none)                 confirmed
EA_E1      recorded  RECORDED_ONLY               (none)                 partially_confirmed
F01_S7     control   UNADJUDICATED               (none)                 confirmed
F04_S13    control   UNADJUDICATED               (none)                 confirmed
F12_S0     control   UNADJUDICATED               (none)                 confirmed
F04_S1     control   UNADJUDICATED               (none)                 confirmed
F08_S0     control   UNADJUDICATED               (none)                 confirmed
F92_S0     control   UNADJUDICATED               (none)                 confirmed
F14_S4     control   UNADJUDICATED               (none)                 partially_confirmed
F12_S1     control   UNADJUDICATED               (none)                 partially_confirmed
F14_S11    control   UNADJUDICATED               (none)                 partially_confirmed
F18_S6     control   UNADJUDICATED               (none)                 partially_confirmed
F15_S2     control   UNADJUDICATED               (none)                 conflicting
F05_S5     control   UNADJUDICATED               (none)                 conflicting
F17_S9     control   UNADJUDICATED               (none)                 conflicting
             [flag: magnitude backstop is NOT prompt-independent]
F08_S2     control   UNADJUDICATED               (none)                 conflicting
F01_S11    control   UNADJUDICATED               (none)                 no_support
             [flag: procedural closer IS prompt-independent]
F90_S0     control   UNADJUDICATED               (none)                 no_support
             [flag: period gate is NOT fully prompt-independent]
```

Naming: eval-ablation E1/E2/E3 and claim-spans E1/E2/E3 are different
statements. Only EA_* use meridian; CS_E3 uses the claim-spans IC memo.

---

## Part 3: Arms E and G (not billed)

### Arm construction

```
A  live stage2_v4.md baseline
D  prior nested arm (C minus worked examples)  REFERENCE LENGTH ONLY HERE
E  = D + G's three boundary examples inserted where G places them
     (after Evaluative claims, before Numeric rules). One change from D.
G  = existing short buildG() verbatim. REFERENCE ARM, not nested from D.
```

### Prompt hashes and lengths (built; E/G not LLM-run)

```
arm  len    sha256
A    12451  c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe
D    6052   bd1b4b2fea1716b75992b3bd80eb9a0b03db06d92289856ebd663065f3321367
E    7206   3b859368a944e629e42de8d060670d6f2febae0ce855ea267f46156dfafce8b3
G    4195   08e793df1977f120acdd3a3cf5aefc921fbac34ecfd0fe6aba707393f127a15f
```

G carries exactly three boundary examples. All three were used for E.

### Three boundary examples (verbatim; audited from G / inserted into E)

```
1) Rounding → confirmed
Statement: 'Revenue grew to GBP 312 million, a compound annual growth rate of approximately 19 percent.'
Source: 'Revenue has grown to GBP 312 million … representing a compound annual growth rate of 18.6 percent.'
Correct classification: confirmed
Reasoning: 18.6 percent correctly rounds to approximately 19 percent on the same CAGR.
```

```
3) Extra framing, same claim → confirmed
Statement: 'In summary, the Company combines a defensible competitive position in a specialised vertical with high switching costs.'
Source: 'NSH occupies a strong position in a deeply specialised vertical with high switching costs.'
Correct classification: confirmed
Reasoning: Substance matches. 'In summary' and 'defensible' do not add a separate checkable claim.
```

```
3c) Ranking is a checkable claim → partially_confirmed
Statement: 'The fund returned 2.4x gross MOIC, placing it in the top quartile of European peers.'
Source: 'The fund returned 2.4x gross MOIC across seventeen exits.'
Correct classification: partially_confirmed
Reasoning: The MOIC matches. 'Top quartile of European peers' is a ranking the source does not state.
```

### Drift check (arm A x1 vs 2026-08-26 labels)

```
id        got     expect  result
EA_E2     conf    conf    OK
CS_E3     conf    conf    OK
F01_S10   conf    conf    OK
F04_S20   conf    conf    OK
EA_E3     conf    conf    OK
EA_E1     part    part    OK
F01_S7    conf    conf    OK
F04_S13   conf    conf    OK
F12_S0    part    conf    FAIL
F04_S1    conf    conf    OK
F08_S0    conf    conf    OK
F92_S0    conf    conf    OK
F14_S4    part    part    OK
F19_S7    part    part    OK
F12_S1    part    part    OK
F14_S11   part    part    OK
F18_S6    part    part    OK
F15_S2    confl   confl   OK
F05_S5    confl   confl   OK
F17_S9    confl   confl   OK
F08_S2    confl   confl   OK
F01_S11   nosup   nosup   OK
F90_S0    nosup   nosup   OK
```

F12_S0 FAIL detail (source: `scripts/diagnostic/sources/12_synth_linkedin_post.txt`):

```
got: partially_confirmed
preBackstop: partially_confirmed
backstopChanged: false
explanation: ... eighteen-month partnership, whereas the statement claims a
  partnership of more than four years ...
passage: After eighteen months of work alongside the team, I'm delighted that
  Meridian Capital has completed the sale of NorTech Industries to Brookfield
  this week.
```

### E x3 / G x3 grids

```
NOT RUN. Drift stop fired first.
```

### Stopping-rule verdict (EA_E2 mechanism)

```
NOT APPLICABLE.
Neither CONFIRM (E moves EA_E2), SPLIT (only G moves), nor STOP (neither
moves) can be scored. Re-run after drift baseline is fixed or waived.
```

---

## Assessment

1. Code backstops are not a guarantee. Magnitude needs the right passage and
   working figure extraction; period gate needs model periods. Only the
   procedural closer is statement-deterministic on this set.

2. F12_S0 drift is likely the model finally noticing a real duration mismatch
   the 2026-08-26 baseline treated as confirmed. Arm D already called this out.
   Spec was right to stop billing; the baseline label for F12_S0 should not be
   treated as adjudicated truth on the next pass.

3. What I think is wrong in this / prior framing: calling F17_S9 "backstop-held
   conflicting" in earlier probes was overstated whenever the model already
   returned conflicting. Under D the backstop did nothing. Do not plan rewrites
   as if B48 will catch magnitude misses.

4. Arm E is built and hashed (7206 / 3b859368...). The boundary-example
   hypothesis remains untested. Next productive step is either (a) accept
   F12_S0 partial as the new A reference and re-run E/G, or (b) waive F12_S0
   from the drift gate with an explicit note. Do not invent another prompt
   variant until E/G actually run.
