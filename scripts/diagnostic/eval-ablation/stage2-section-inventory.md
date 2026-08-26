# Stage 2 prompt section inventory and fixture coverage

Read only. Prompt file: `lib/qc/pipeline-v4/prompts/stage2_v4.md` (162 lines, 12452 chars including trailing newline; pipeline hashes the `.trim()` form, 12451 chars, promptHash `c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe`).

No pipeline run. No model calls. Cached verdicts below are Stage 2 `classification` from `scripts/diagnostic/claim-spans/.baseline.json` unless marked disk-cache.

Purpose lines are HYPOTHESIS unless marked CONFIRMED with a commit or doc.

Character counts are the heading plus body for the stated line range, including internal newlines, excluding the blank line after the section.

---

## 1. SECTION INVENTORY

```
S00 JSON contract / opener
  lines 1-13  chars 681
  type: rule
  worked examples inside: 0
  purpose (HYPOTHESIS): stop free-text or missing-field replies so Stage 2 can parse classification, passage, explanation, and periodAssessment.

S01 periodAssessment include and role
  lines 15-16  chars 421
  type: rule
  worked examples inside: 0
  purpose (CONFIRMED R2.7.2 commit 8d9369a): force a structured period/vintage judgement before classification, so relative source dates are resolved and vintage is not treated as the metric's operating year.

S02 Passage rule
  lines 18-19  chars 209
  type: rule
  worked examples inside: 0
  purpose (HYPOTHESIS): stop stitched or paraphrased excerpts; one contiguous span for the reviewer.

S03 Classification values
  lines 21-29  chars 1778
  type: definition
  worked examples inside: 0
  purpose (CONFIRMED as the four-way rubric; current wording B48 commit b4bc974): name the four legal labels and the like-for-like test.

S03a "confirmed" bullet
  line 23  chars 273
  type: definition
  worked examples inside: 0
  purpose (CONFIRMED b4bc974 extra-framing clause; like-for-like from same commit): allow paraphrase, formatting, rounding, and extra framing, so those do not block confirmed.

S03b "partially_confirmed" bullet
  line 25  chars 418
  type: definition
  worked examples inside: 0
  purpose (CONFIRMED b4bc974 rounding/scope/vintage to partial): send extra checkable claims, broader scope, and frame/period-role mismatch to partial, while keeping mere adjectives on confirmed.

S03c "conflicting" bullet
  line 27  chars 786
  type: definition
  worked examples inside: 0
  purpose (CONFIRMED R2.7.1 entity replacement; B48 modality carve-out in b4bc974): conflict only on like-for-like mutually exclusive facts (entity swap, magnitude, completed-vs-proposed). Do not fire modality-conflict on committed / cover / holds.

S03d "no_support" bullet
  line 29  chars 272
  type: definition
  worked examples inside: 0
  purpose (CONFIRMED R2.7.1 no-claim cannot conflict; B48 procedural closer): silence is no_support; related/narrower/broader is partial; a non-factual closer is no_support not conflict.

S04 Worked examples (block)
  lines 31-127  chars 6701
  type: worked example
  worked examples inside: 16 (1, 2, 3, 3b, 4, 5, 6, 7, 8, 9, 10, 11, 11b, 11c, 12, 13)
  purpose (CONFIRMED B48 prompt anchors in tests/stage2-b48-calibration.test.mjs): case law for the definitions. This block is 54% of the prompt by character count.

S04.1 Rounding -> confirmed
  lines 33-37  chars 358
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED b4bc974 "rounding ... to partial" inverted: rounding stays confirmed): stop treating 18.6 vs approximately 19 as a magnitude conflict.

S04.2 Extra framing, same claim -> confirmed
  lines 39-43  chars 484
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED B48 prompt anchor "Extra framing, same claim"): stop partial on extra wording that is not a new checkable fact.

S04.3 Extra framing, same claim -> confirmed (second copy)
  lines 45-49  chars 407
  type: worked example
  worked examples inside: 1
  purpose (HYPOTHESIS; same failure as S04.2): stop partial on "In summary" / "defensible" around a supported position claim.

S04.3b Checkable fact matches -> confirmed
  lines 51-55  chars 435
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED B48 prompt anchor "Checkable fact matches"): stop the model writing "the fact matches" and still emitting partially_confirmed.

S04.4 Scope-broadening -> partially_confirmed
  lines 57-61  chars 329
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED b4bc974 scope to partial): stop confirming a broader geography than the source (Sweden is not the Nordics).

S04.5 Related but narrower product -> partially_confirmed
  lines 63-67  chars 425
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED B48 prompt anchor CDS / digital health): stop no_support when the source addresses a narrower product class.

S04.6 Added named party / extra checkable detail -> partially_confirmed
  lines 69-73  chars 515
  type: worked example
  worked examples inside: 1
  purpose (HYPOTHESIS; b4bc974 added it, commit does not name it): stop treating an extra retained party as an entity swap (conflict) when the missing name is addition not replacement.

S04.7 Vintage year vs operating year -> partially_confirmed
  lines 75-79  chars 399
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED R2.7.2 and b4bc974 vintage to partial): stop pairing an investment vintage year with a later operating-year metric as if they were the same frame.

S04.8 Future intent vs not-yet-in-dialogue -> partially_confirmed
  lines 81-85  chars 474
  type: worked example
  worked examples inside: 1
  purpose (HYPOTHESIS): stop no_support on a sourcing-path statement the source does address, with a gap.

S04.9 Entity swap in the same role -> conflicting
  lines 87-91  chars 284
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED R2.7.1 Nike/Tesla example, still in ROADMAP): stop partial when a named entity in the same slot is replaced.

S04.10 Ownership / context swap -> conflicting
  lines 93-97  chars 442
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED R2.7.1 ownership-period role; B48 prompt anchor): stop confirming an investment claim under the wrong owner.

S04.11 Status / modality, definite completed action -> conflicting
  lines 99-103  chars 421
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED B48): stop confirming "have invested" when the source still seeks approval.

S04.11b Cover / opener sentence, not a modality conflict
  lines 105-109  chars 532
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED B48): stop conflicting a cover sentence that names a new investment without a closed-transaction verb.

S04.11c Deal terms without a closed-transaction verb -> confirmed
  lines 111-115  chars 529
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED B48 "committed" carve-out): stop treating "committed" + matching terms as completed-vs-proposed conflict.

S04.12 Magnitude beyond rounding -> conflicting
  lines 117-121  chars 378
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED B48 magnitude backstop): stop partial or confirmed on same-metric 40 vs 18.

S04.13 Procedural closer -> no_support
  lines 123-127  chars 242
  type: worked example
  worked examples inside: 1
  purpose (CONFIRMED R2.7.1 no-claim; B48 procedural closer): stop conflicting or confirming "We recommend approval."

S05 Numeric rules
  lines 129-133  chars 544
  type: rule
  worked examples inside: 0 (points at examples 1 and 12)
  purpose (CONFIRMED b4bc974 rounding vs magnitude): restates S04.1 and S04.12 in rule form, plus "do not pair different metric frames".

S06 Frame and period
  lines 135-140  chars 435
  type: rule
  worked examples inside: 0
  purpose (CONFIRMED R2.7.2): periodAssessment first; both periods stated and different -> conflicting; sourcePeriod null -> partial; vintage vs operating -> partial; matching/absent period does not block confirmed.

S07 Voice
  lines 142-145  chars 385
  type: rule
  worked examples inside: 0 (points at examples 11 and 11b)
  purpose (CONFIRMED R2.7.1 / F12.S0, ROADMAP): person/voice difference is not conflict; completed-action vs proposed is not voice; cover sentence is not modality-conflict.

S08 Entity roles
  lines 147-149  chars 229
  type: rule
  worked examples inside: 0 (points at examples 9 and 10)
  purpose (CONFIRMED R2.7.1): replacement in the same role is conflicting; omission with no replacement is partial.

S09 Mixed statements
  lines 151-156  chars 662
  type: rule
  worked examples inside: 0
  purpose (HYPOTHESIS for 152-153, 155; CONFIRMED for 154 via S04.3b / B48): compound routing (conflict wins; extra checkable -> partial; facts-match+extra-wording -> confirmed; related/narrower -> partial; no verifiable fact -> no_support, cannot conflict).

S10 Parent sentence
  line 158  chars 212
  type: rule
  worked examples inside: 0
  purpose (CONFIRMED B53a commit c290cee): when Stage 1b sends a claim with parent context, classify the claim not the parent.

S11 Passage length cap
  lines 160-161  chars 172
  type: rule
  worked examples inside: 0
  purpose (HYPOTHESIS): keep excerpts short enough for the card; trim at a sentence boundary.
```

---

## 2. LINE 154 DEPENDENCY MAP

Line 154 text:

```
If the checkable facts match the source, classify confirmed even if the explanation mentions extra wording. Do not classify partially_confirmed while stating that the fact matches.
```

The spec named four sites. There are more than four. Neutralising a subset (as ablation variant C did to line 154 only) leaves the same instruction in force. That will look like saturation.

Complete list of places that push confirmed when checkable facts match, including extra wording / adjectives / framing / voice around a supported claim:

```
L23 S03a confirmed definition
  "...including paraphrase, formatting, correct rounding, and extra descriptive or framing words that are not additional checkable claims."

L25 S03b partially_confirmed definition (last sentence)
  "Mere adjectives, voice, or richer wording around a supported claim stay confirmed."

L39-43 S04.2 example 2
  title: "2) Extra framing, same claim -> confirmed"
  "Correct classification: confirmed"
  "The source supports the same growth-headroom claim. Extra wording is framing, not a new checkable fact."

L45-49 S04.3 example 3
  title: "3) Extra framing, same claim -> confirmed"
  "Correct classification: confirmed"
  "Substance matches. 'In summary' and 'defensible' do not add a separate checkable claim."

L51-55 S04.3b example 3b
  title: "3b) Checkable fact matches -> confirmed"
  "Correct classification: confirmed"
  "The checkable counts match. Do not classify partially_confirmed while the explanation is that the fact matches."

L143 S07 Voice (first sentence)
  "A difference in voice or grammatical person with the same underlying fact is confirmed."

L154 S09 Mixed statements (the line named in the spec)
  "If the checkable facts match the source, classify confirmed even if the explanation mentions extra wording. Do not classify partially_confirmed while stating that the fact matches."
```

That is seven sites, not four. Example 2 and example 3 are two copies of the same rule. Example 3b is line 154 restated as a story. L23 and L25 are the definition form. L143 is the voice form of the same "same fact -> confirmed" push.

Related but not the same instruction (confirm for other reasons). Do not treat these as line-154 duplicates:

```
L130-131 S05  Exact figures / formatting / rounding-to-approximate -> confirmed
L140 S06      Periods match, or no period claim -> period does not block confirmed
L108 S04.11b  Cover sentence -> confirmed (modality carve-out, not extra-wording)
L114 S04.11c  "Committed" matching terms -> confirmed (modality carve-out)
```

---

## 3. FIXTURE COVERAGE CHECK

Verdicts are claim-spans baseline Stage 2 `classification` unless noted. One hit per section. "Would plausibly change" means deleting that section removes the only prompt instruction that maps this shape to that label. Where the statement is a planted copy of the example itself, that is noted: deleting the example may still leave the definition.

```
S00 JSON contract
  No fixture. Deleting this breaks parse, not a label among valid outputs.

S01 periodAssessment include and role
  F90 S0 (disk cache, current promptHash)
  "The firm invested in Helios Grid Controls in 2024."
  cached: no_support (preBackstopClassification conflicting)
  Fixture notes: source Date 15 March 2023 says "we invested last year" (calendar 2022).
  Also F19 S7 vintage vs operating, baseline partial (see S04.7).

S02 Passage rule
  No fixture. Classification would not move if this were deleted; excerpt shape might.

S03 / four definitions
  Covered by the bullets below. The heading line itself has no independent fixture.

S03a confirmed extra-framing clause
  F01 S10
  "In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway."
  cached: confirmed
  If this clause and its copies (S04.2, S04.3, L25, L154) all stayed, deleting S03a alone would likely not move this. Cluster, not a single line.

S03b extra checkable / scope / frame -> partial; adjectives stay confirmed
  F14 S4
  "Second, payer willingness to reimburse digital health products has improved markedly across the major European markets."
  cached: partially_confirmed
  Also claim-spans E3 (framing kept confirmed): "Fund IV is marked at 1.9x gross MOIC and Fund III at 1.7x, and that level speaks well of the manager's judgement." cached: confirmed

S03c modality + entity + magnitude
  F15 S2
  "We have invested EUR 720 million of equity for an 84% stake."
  cached: conflicting
  (planted copy of example 11)

S03d procedural closer / related-is-partial
  F01 S11
  "We recommend approval."
  cached: no_support

S04.1 Rounding
  No fixture exercises 18.6 rounding to approximately 19 as the difference-maker.
  Nearest: F92 S0 (disk cache) "Shopify is a small startup serving approximately 10,000 customers." cached: confirmed
  That is an approx qualifier against "nearly 10,000", not the CAGR rounding case.

S04.2 Extra framing (headroom)
  F01 S7
  "We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem."
  cached: confirmed
  This statement is the example. Tests memorisation of the example, not generalisation.

S04.3 Extra framing (In summary / defensible)
  F04 S20
  "In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction."
  cached: confirmed
  Near-copy of example 3. Same cluster as S03a / L154.

S04.3b Checkable counts
  F04 S13
  "The Company currently has 8 employees, including the founders, and 1.5 million monthly active users."
  cached: confirmed
  This statement is the example.

S04.4 Scope-broadening Nordics
  F12 S1
  "NorTech is a Stockholm-headquartered manufacturer of industrial heating and cooling systems, and when we invested in 2021 it was a strong but underexposed business - dominant in the Nordics and barely visible elsewhere."
  cached: partially_confirmed
  Near-copy of example 4.

S04.5 Narrower product CDS vs digital health
  F14 S4
  (same statement as S03b)
  cached: partially_confirmed
  This statement is the example.

S04.6 Extra named party
  No clean fixture. F08 S2 is the planted sentence ("founding Schiller family and management retaining the balance") but cached conflicting on modality ("have invested" vs proposed), so deleting S04.6 would not change that verdict.

S04.7 Vintage vs operating
  F19 S7
  "Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 percent year-on-year); ..."
  cached: partially_confirmed
  Near-copy of example 7.

S04.8 Future intent vs not in dialogue
  F14 S11
  "We expect to bring a specific potential investment to consider over the coming months."
  cached: partially_confirmed
  This statement is the example.

S04.9 Same-role entity swap (Nike / Tesla)
  No fixture. No draft in F01-F23 or F90-F92 names a replaced customer in the same slot.

S04.10 Ownership-period swap
  F05 S5
  "During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability."
  cached: conflicting
  This statement is the example.

S04.11 Completed vs proposed
  F15 S2 (see S03c) cached: conflicting
  Also F08 S2 cached: conflicting

S04.11b Cover / opener
  F08 S0
  "We are writing to inform you of a new investment in Helvetia Precision Components ..."
  cached: confirmed
  This statement is the example. Also F04 S0, F15 S0, F17 S0, all confirmed.

S04.11c Committed / deal terms
  F04 S1
  "We have committed USD 10 million in the Company's Series A at a pre-money valuation of USD 40 million, for approximately 20% on a fully-diluted basis."
  cached: confirmed
  Near-copy of example 11c.

S04.12 Magnitude 40 vs 18
  F17 S9
  "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, ..."
  cached: conflicting
  Near-copy of example 12. Code backstop (B48 magnitude) can force this even if the prompt example is deleted.

S04.13 Procedural closer
  F01 S11 (see S03d) cached: no_support

S05 Numeric rules
  Same holes as S04.1. Magnitude covered by F17 S9 (and the code backstop). Different-metric-frames (revenue vs GMV): no fixture.

S06 Frame and period
  F19 S7 vintage vs operating, cached: partially_confirmed
  F90 S0 period mismatch, disk cache: no_support (preBackstop conflicting)
  Same-metric both-periods-different -> conflicting: no clean single-source fixture besides F90, and the cached final label is no_support after backstop.

S07 Voice
  F12 S0
  "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week."
  cached: confirmed
  CONFIRMED R2.7.1 target (source is first person "I'm delighted that Meridian Capital has completed...").

S08 Entity roles
  Replacement: F05 S5 (S04.10) cached: conflicting
  Omission (source names fewer, missing name absent not replaced): no fixture found whose cached label is partial for that reason alone. F18 S6 is confirmed on 18a and partially_confirmed on 18b for missing comparison detail, which is extra-claim silence not a missing entity in the same role.

S09 Mixed statements
  Conflict-wins compound: no fixture isolated as "some facts confirmed AND one mutually exclusive" without a dedicated example.
  Extra-wording stays confirmed: claim-spans E3 (see S03b) cached: confirmed. Explanation in cache treats "speaks well of the manager's judgement" as framing.
  Related/narrower: F14 S4 cached: partially_confirmed
  Line 154 specifically: F04 S13 (example 3b) cached: confirmed. Deleting L154 alone is what ablation variant C did; that statement would still be held by S03a, S03b, and S04.3b.

S10 Parent sentence
  No fixture. This line is Stage 1b claim matching plumbing. Whole-sentence cards in F01-F23 do not send PARENT SENTENCE. No statement-level verdict in the corpus is known to hinge on it.

S11 Passage length cap
  No fixture. Not a classification rule.
```

Sections with no exercising fixture: S00, S02, S04.1, S04.6, S04.9, S05 (rounding and GMV), S08 omission branch, S10, S11. Several "hits" are planted copies of the prompt example (S04.2, 3b, 5, 8, 10, 11, 11b). Those do not prove the rule generalises.

Eval-ablation Meridian exhibits (not in the numbered fixture JSON; present as claim-spans E1-E3 with different text, and as live ablation rows):

```
Ablation E1 ranking "top quartile..." : A2/G/H all partially_confirmed (already partial; cannot show a false-green fix)
Ablation E2 key-person risk : A2 confirmed x3, G partially_confirmed x3, H confirmed x3
Ablation E3 Fund IV 1.9x (eval-ablation wording, not claim-spans E3) : A2 and G stayed confirmed
Claim-spans E3 judgement-as-framing : confirmed (this is the false-green shape the rewrite is for)
```

---

## 4. BASELINE COVERAGE

```
QC_LLM_CACHE_DISK
  path: scripts/diagnostic/.llm-cache.json
  existed: yes  fileBytes: 2291719  entries: 1218
  by stage: stage1 34, stage1b 123, stage2 1061

F90 F91 F92 in the disk cache
  F90: YES. Stage 1 (2 statements) and Stage 2 on current promptHash.
       S0 "The firm invested in Helios Grid Controls in 2024." -> no_support (preBackstop conflicting)
       S1 "Helios Grid Controls is a Munich-headquartered supplier of grid-stabilisation software." -> confirmed
  F91: YES. Stage 1 and Stage 2 on current promptHash.
       S0 "The firm has invested in Shopify." -> confirmed
  F92: YES. Stage 1 and Stage 2 on current promptHash (shared sourceLabel 91_adversarial_shopify_2010_trimmed).
       S0 "Shopify is a small startup serving approximately 10,000 customers." -> confirmed

F90 F91 F92 in claim-spans/.baseline.json
  NO. Cases are nordholt-clean, nordholt-dirty, supersession, F01-F23, E1, E2, E3 only.
  Prior diagnostic reports (stage2-span, coverage-union) said the same about that baseline. The disk cache has since grown to include F90-F92 (file mtime 2026-08-25 13:49).

What the cached baseline covers
  claim-spans/.baseline.json: 29 cases, 296 extracted statements, 360 Stage 2 matches.
    nordholt-clean/dirty (4 sources x 6 statements), supersession (3 sources x 4), F01-F23, Meridian E1-E3 (1 each).
    Does not include F90-F92. Does not include style-guide-rules fixtures (those are editorial).
  disk cache current promptHash (c718c19..., trimmed stage2_v4.md): 643 Stage 2 rows with a classification.
    Labels: F01-F21 source files, ALP (F22), CRF (F23), nordholt (press release / LP update / fact sheet / IC memo), supersession (source_A/B/C), F90, F91/F92 source, plus ic_memo for E1-E3.
  Other Stage 2 hashes in the same file (not current rubric):
    87a3c368... 361 rows (span-elicitation ON, still has classification)
    32036bac... 57 rows (span-only payloads, no classification)

Total statement count
  Fixture JSON files in scripts/diagnostic/fixtures (excluding style-guide-rules): 26 (ids 01-23, 90-92).
  F01-F23 extracted in baseline: 277 statements.
  F90-F92: 4 statements (2+1+1).
  Numbered fixture corpus: 281 statements.
  claim-spans baseline including nordholt, supersession, E1-E3: 296 statements.
  Disk-cache Stage 2 pairs are statement x source, not unique statements (643 current-prompt rows).

Stage 2 classification distribution (no new calls)

  Current-prompt disk cache (n=643):
    confirmed            484
    no_support            77
    conflicting           44
    partially_confirmed   38

  claim-spans baseline matches (n=360):
    confirmed            255
    no_support            47
    conflicting           31
    partially_confirmed   27
```

---

## 5. ASSESSMENT

Load-bearing (keep the job, not the case law):

```
- The four classification definitions (S03a-d), shortened.
- Frame and period routing (S06), including vintage vs operating (R2.7.2).
- Voice is not conflict (S07 / R2.7.1 / F12 S0).
- Entity replacement vs omission (S08 / R2.7.1).
- Modality: completed-action vs proposed is conflict; cover and "committed" are not (S03c, 11, 11b, 11c). F15 S2, F08 S0, F04 S1 show these fire in the corpus.
- Magnitude beyond rounding is conflict (S04.12 / F17 S9). Code already backstops this.
- Procedural closer is no_support (S03d / F01 S11).
- Related or narrower is partial, not no_support (S03d / S04.5 / F14 S4).
- Mixed routing: one like-for-like exclusive fact -> conflicting; extra checkable claim -> partial (S09 152-153).
- JSON contract (S00) and parent-sentence line (S10) are plumbing, not rubric. Keep both in some form. S10 is dead weight on whole-sentence calls but required for Stage 1b.
```

Case law patching a single past incident (planted example = the fixture):

```
S04.2 F01 S7 is the headroom example.
S04.3 / F04 S20 and F01 S10 are the In-summary example.
S04.3b / F04 S13 is the 8-employees example.
S04.5 / F14 S4 is the CDS example.
S04.7 / F19 S7 is the Drift Logistics example.
S04.8 / F14 S11 is the dialogue example.
S04.10 / F05 S5 is the Westhaven/Bridgepoint example.
S04.11 / F15 S2 is the EUR 720 million example.
S04.11b / F08 S0 is the Helvetia cover example.
S04.11c / F04 S1 is the committed Series A example.
S04.12 / F17 S9 is the 40 vs 18 reversion example.
S04.13 / F01 S11 is We recommend approval.
```

Those examples teach the model to recognise the story, not the principle. Several are then restated again as S05, S07, S08 pointers ("example 1", "example 11", "examples 9 and 10").

Drop first, in order:

```
1. The confirm-when-facts-match cluster, down to one sentence. Today it is L23 + L25 + example 2 + example 3 + example 3b + L143 + L154. This is the load that saturation was measured against. It is also the instruction that greens rankings, risk conclusions, and unrealised marks when the numbers match.
2. Duplicate extra-framing examples (keep at most one of 2 or 3, or neither if the one sentence stays).
3. Rule blocks that only point back at examples (S05 if 1 and 12 stay; S07 last two lines if 11/11b stay; S08 if 9/10 stay). Do not keep both the story and the restatement.
4. Examples with no fixture (S04.1 rounding, S04.9 Nike/Tesla, S04.6 extra named party) unless the rewrite still needs that failure mode. S04.9's job is already in S08.
```

What I think is wrong or under-evidenced in the saturation conclusion:

```
1. Duplicate instructions. Variant C rewrote only L154. Six other sites still say the same thing. The spec already warned that this would look like saturation. The first ablation did not control for it. That result does not prove the *instruction* is inert. It proves one copy is inert while the others remain.

2. Short prompt G is not "the same rule at one-third length". G dropped the example pile and the mixed-statements confirm-framing line, and added an Evaluative claims block plus ranking example 3c. E2 moving to partial on G is confounded. Length, competing confirm-framing copies, and the new rule were changed together.

3. Variant H (add Evaluative claims to the full prompt) not moving E2 *is* real evidence that additive rules on this prompt do not land. That is the finding worth keeping. It does not imply every existing section can be deleted with no effect. We did not delete sections in that probe.

4. Ablation E1 (top quartile) was already partial on the baseline prompt, so it cannot show a false-green correction. The user-visible failures (green ticks on rankings, risk conclusions, unrealised marks) are E2/E3-shaped, and claim-spans E3 is confirmed today with an explanation that names framing. Different E1/E2/E3 texts exist in claim-spans/.baseline.json than in eval-ablation/run.mjs. Do not mix them.

5. Six Meridian statements are not the 281-statement fixture corpus. Many sections above *are* exercised (modality, voice, vintage, CDS, procedural closer, cover sentence). Saturation was measured on adding an evaluative rule, not on removing those sections.

6. Code backstops (B48 magnitude, period-frame, modality) will hold some labels even if the prompt example is deleted. Prompt-only ablations on F17 S9 or F90 S0 can look saturated for that reason.

7. The first 36-call ablation was single-run. The short-prompt 3-repeat is the one to cite. Production-source re-run reproduced G moving E2; adding a "mark" rule (GM) did not stably move it.
```

I would not drop S03c modality, S07 voice, S06 period, or S03d procedural closer in the rewrite. I would drop the extra-framing case law first, keep one principle for "adjectives are not claims", and add one principle for "comparison, ranking, risk level, and unrealised marks are claims". That is what G actually tested, once the competing copies were gone.

---

## Mechanism locations (no changes this pass)

```
Prompt:            lib/qc/pipeline-v4/prompts/stage2_v4.md
Loaded by:         lib/qc/pipeline-v4/stage2-match-sources.mjs getStage2SystemPrompt() (file contents .trim())
Cache key:         lib/qc/llm-cache.mjs COMPONENT_ORDER includes promptHash = sha256 of that trimmed file
Disk cache:        scripts/diagnostic/.llm-cache.json via QC_LLM_CACHE_DISK (diagnostic default)
Frozen baseline:   scripts/diagnostic/claim-spans/.baseline.json
B48 code backstops: lib/qc/pipeline-v4/stage2-match-sources.mjs (magnitude, period-frame, procedural)
Ablation evidence: scripts/diagnostic/eval-ablation/rows.json
                   scripts/diagnostic/eval-ablation/short-prompt-rows.json
                   scripts/diagnostic/eval-ablation/production-source-rows.json
```
