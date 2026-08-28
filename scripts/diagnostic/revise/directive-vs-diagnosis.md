# Directive vs diagnosis: why the reviser acts, and what it does silently

## Q3, action rate by concern kind

Unit is a **concern instance** (one concern in one run), not a marker: a concern
can attract two markers, which is why a marker-denominated rate exceeded 100%
on the first pass. 17 runs — 14 Suggest artefacts on disk plus the 3 production
fixture runs, which are the only data anywhere in the repo carrying an
editorial concern.

| Kind | Opportunities | Markers | Acted, with a marker | **Acted silently** | No-change marker | Ignored | **Action rate** |
|---|---|---|---|---|---|---|---|
| `unsupported` | 15 | 17 | 14 | 1 | 0 | 0 | **100%** |
| `soften` (editorial) | 3 | **0** | 0 | **3** | 0 | 0 | **100%** |
| `partial` | 78 | 74 | 63 | 3 | 11 | 1 | **84.6%** |
| `conflict` | 13 | 13 | 11 | 0 | 2 | 0 | **84.6%** |

Directive-carrying kinds (editorial + compliance): **3/3 = 100%**
Evidence kinds (`unsupported` / `partial` / `conflict`): **92/106 = 86.8%**

8 further markers could not be traced to any concern: no concern statement
overlapped their original region. No compliance concern exists in any artefact
in the repo, so that kind is untested.

## Q5, verdict

**The hypothesis does not survive.** Evidence findings do not merely get
narrated. Across the corpus they are acted on **86.8%** of the time, against
100% for the one directive-carrying kind with data. A 13-point gap on a sample
of three directive instances is not the difference between "acts" and
"narrates". The strong claim — that evidence findings never arrive as a
decision and therefore never produce an edit — is refuted by the data.

What is structurally true, and worth keeping, is narrower: evidence concerns
carry **no directive field at all** (Q1, Q2). That is a real asymmetry in the
payload. It is simply not what determines whether the model edits.

**But the diagnostic found something bigger than the question it was asked.**

### The soften edit happened. It just left no trace.

`bf9d9e8` reported that the `soften` finding on the production draft was
"ignored entirely — no marker in any of the three runs". **That was wrong, and
this pass corrects it.** The model deleted "and highly regarded" in **all three
runs**, exactly as its directive instructed:

```
ORIGINAL  …coupled with its well-established and highly regarded investment team…
ALL RUNS  …coupled with its well-established investment team…
```

No marker. No note. No flag. The author's words were removed from their draft
and nothing in the output says so. Rule (e) at `lib/build-revision-prompt.mjs`
L1057 governs `soften` and requires the span be wrapped; it was not, 3 of 3.

This is a worse failure than either of the two the arc has been chasing. A
no-change note tells the user something untrue about an edit that did not
happen. A silent edit tells the user nothing about an edit that did. It is
invisible to marker honesty, to what-from-diff, and to the coverage-gap
instrument, because all three reason about markers, and there is no marker.

Because the hypothesis did not survive, I have not proposed options A/B/C as
the spec directed. The silent-edit defect is stated here as a finding, not a
design. No prompt rewrite is proposed.

### Correction to the bf9d9e8 headline

> ~~Of 4 findings Review raised, Suggest acted on 1, produced a no-change note
> on 2, and ignored entirely 1.~~

Of 4 findings Review raised, Suggest acted on **2** — one of them silently and
unmarked, the other by deterministic code rather than the model — and produced
a no-change note on 2. **Nothing was ignored.** The model still authored zero
*marked* edits, which is what made it look like inaction.

---

## Q1, what actually reaches the model

All blocks below are emitted verbatim by `formatConcernsBlock`
(`lib/build-revision-prompt.mjs` L568-682) and captured through
`buildRevisionPrompt`, not transcribed by hand.

### `unsupported` — flat evidence branch (L622-650)

```
### Statement [5]
Text: This relationship enabled deep insight during the diligence phase.
Evidence gap (no_support) [kind=unsupported]:
  Reason: No source addresses the claim that the relationship enabled deep insight during the diligence phase. The reviewer should add a source that supports this claim or remove it from the document.
Editorial / style concerns:
  - kind=craft; rule=overreach_unsupported_causal; note=The phrase 'enabled deep insight during the diligence phase' implies a causal relationship without clear supporting evidence.; suggestedDirection=Replace 'enabled deep insight during the diligence phase' with a more neutral statement that does not imply causation.
```

### `partial` — flat branch, no claim spans

```
### Statement [0]
Text: In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR 1.2 billion flagship fund from Meridian Capital targeting lower-mid-market buyouts in European industrial technology and business services companies.
Evidence gap (partially_confirmed) [kind=partial]:
  Reason: The source confirms the fund's target size of EUR 1.2 billion and its strategy of targeting lower-mid-market buyouts in European industrial technology and business services companies. However, it does not mention Partners Group's commitment or specify the timing as June 2026. Additionally, the source indicates the first close is expected in Q3 2026, which does not align with the June 2026 timing in the statement. Please verify the timing and Partners Group's involvement or adjust the statement accordingly.
  Source excerpt: First close: expected Q3 2026; final close targeted within 12 months of first close
```

### `partial` — per-claim spans branch (L582-621)

```
### Statement [1]
Text: The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks of EUR 80-100 million apiece.
Evidence (per-claim spans) [statementKind=partial]:
  Partial (same treatment as a statement-level partial; not CONFIRMED AND TO BE PRESERVED): "The fund intends to build a portfolio of 10-14 control-oriented investments" [verdict=partially_confirmed]
  Unsupported element (the softening rule applies to this span): "equity checks of EUR 80-100 million apiece" [verdict=no_support]
  Reason: The source confirms that the fund plans to make 10-14 platform investments, aligning with the statement's claim about the number of investments. However, it does not address the equity check size of EUR 80-100 million each. The reviewer should verify the equity check size or adjust the statement to reflect only the confirmed information.
  Source excerpt: The Fund expects to make 10–14 platform investments, with reserved capital for bolt-on acquisitions.
```

### `conflict` (L636-641)

```
### Statement [4]
Text: Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.
Evidence gap (conflicting) [kind=conflict]:
  Unsupported phrase (source 0): "has returned"
  Reason: The statement claims that Fund IV has returned 1.9 times gross MOIC, whereas the source indicates it is currently marked at 1.9x gross MOIC. This presents a contradiction, as 'returned' implies realized gains, while 'marked at' suggests current valuation. The reviewer should reconcile this discrepancy or remove the claim.
  Source: Meridian Fund V summary (Halden copy)
  Conflicting source passage: Fund IV (2019 vintage, EUR 900 million) is currently marked at 1.9x gross MOIC and 24% gross IRR, with 4 of 12 platform investments fully realised.
```

### `soften` — editorial branch (L652-661)

```
### Statement [3]
Text: Partners Group was attracted to this investment given Meridian Capital's strong track record on its prior vintage funds, coupled with its well-established and highly regarded investment team and operational approach to value creation.
Editorial / style concerns:
  - kind=soften; rule=marketing_language_excess; note=The phrase 'highly regarded' is a distinction-claim without substantiation in the immediate context. Remove or substantiate.; suggestedDirection=Delete 'highly regarded' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.
```

### `compliance_strip` — compliance branch (L663-677)

No compliance concern exists in any artefact in the repo, so this block is
rendered through the same code path from a constructed concern:

```
### Statement [99]
Text: Jane Smith led the diligence and returns are certain to be outsized.
Compliance concerns:
  - kind=compliance_strip; ACTION=STRIP-AND-FLAG; note=Named individual in a public version.; suggestedDirection=Remove the named individual.
```

### Imperative, or description?

| Block | Contains an imperative? | Addressed to whom |
|---|---|---|
| `unsupported` | Yes, inside `Reason:` | **"The reviewer should** add a source… **or** remove it" |
| `partial` (flat) | Yes, inside `Reason:` | **"Please verify** the timing… **or** adjust the statement" |
| `partial` (claims) | Yes, inside `Reason:` | **"The reviewer should** verify… **or** adjust" |
| `conflict` | Yes, inside `Reason:` | **"The reviewer should** reconcile… **or** remove" |
| `soften` | Yes, as `suggestedDirection=` | **the actor**: "Delete 'highly regarded' and rewrite the sentence…" |
| `compliance_strip` | Yes, as `suggestedDirection=` + `ACTION=` | **the actor**: "Remove the named individual" |

The distinction is finer than "instruction versus description", and the finer
version is the interesting one. Every evidence block *does* contain an
imperative — but it is third-person, addressed to **"the reviewer"**, offers a
**disjunction** ("verify **or** adjust", "add a source **or** remove it"), and
is labelled `Reason:`. Every editorial and compliance block carries a
second-person, **single-action** directive that names the exact span, in a
field of its own.

That difference is real and structural. Q3 shows it is not what decides whether
an edit happens.

---

## Q2, every field that could carry a directive

Reference counts in `lib/build-revision-prompt.mjs`, the only module that
builds the reviser prompt:

| Field | Populated by | Ever populated for evidence? | Reaches the reviser prompt? |
|---|---|---|---|
| `suggestedDirection` | `editorial-compliance-reviewer.mjs`, per concern | **No** — only on `editorialConcerns` / `complianceConcerns` | **Yes** — L658 and L674, the only directive that does |
| `suggestedImprovement` | Nothing. Hardcoded `null` at `stage7-assemble-card.mjs` L537 and L782, `commentary-builder.mjs` L274 (with `suggestedImprovementMode: "none"`), `evidence-skipped-fast-path.mjs` L57 | **No** — never populated at all, for any kind | **No** — 0 references |
| `suggestedRewrite` | `stage7-assemble-card.mjs` L197-198, from editorial/compliance concerns | No | **No** — `collectEditorialConcerns` (L365-380) copies only `kind`, `rule`, `note`, `suggestedDirection` and **drops it** |
| `editorialSuggestedDirection` | `editorial-compliance-reviewer.mjs` L1774, card-level roll-up | No | **No** — 0 references; the prompt reads the per-concern field instead |
| `complianceSuggestedDirection` | `editorial-compliance-reviewer.mjs` L1834 | No | **No** — 0 references |
| `recommendedAction` | `commentary-builder.mjs` L142-143, conflict narrative only | Yes, for `conflict` | **Only as prose.** Embedded into `commentary`, surfaced via `evidenceSummary` / `reasoningParagraph`, extracted by `extractEvidenceReason` (L104-109) and emitted as `Reason:`. Never as a field. |

So: **one** directive field reaches the model, and no evidence path populates
it. The nearest thing evidence has is `recommendedAction`, which is dissolved
into reviewer-facing prose before it gets there.

One further asymmetry worth recording: the evidence branch's only *actor*-facing
imperative is the fallback at L619 and L648 —
`(No excerpt/reason available — soften or qualify the claim without inventing support.)`
— which fires **only when there is no reason and no excerpt**. The better
informed the evidence concern, the less directive its block becomes.

---

## Q4, what the prompt says about each kind

`KIND HANDLING` at `lib/build-revision-prompt.mjs` L1040-1061. The spec cited
L966-981; the block has moved since, as the file grew in `7399333` and
`bf9d9e8`. Quoted in full:

```
KIND HANDLING (apply by kind= on each concern):
Three things are easy to blur into "removing content". They are separated by what TRIGGERED the finding, not by how the edit looks:
- Removing the author's POINT. Triggered by materiality or a removal-verb direction. Rule (d). Keep and flag. Unchanged.
- Removing unsupported PRECISION while the point survives, or cutting the clause when it does not. Triggered by an evidence gap with a silent source. Rule (b). Do it and flag.
- Removing an ELEMENT for compliance. A named individual, a confidential figure in a public version. Rule (i).
a) kind "conflict": If the source passage states a competing value, the revised PROSE must carry that source value (house-style), not a vague hedge. Example: source "approximately 18% … about $95m" → write "approximately 18% growth to about USD 95 million", NEVER "material growth". Wrap the corrected element in a marker. The note must name the change and the source, e.g. "Changed from USD 50 to USD 45 to match Shopify (text).txt. Confirm before publishing." Hedge or drop the precise number ONLY when the source states no replacement value. Never assert the contradicted draft value.
b) kind "unsupported": If the source STATES a specific value, put that source value in the prose (house-style) and flag it - same figure rule as conflict/partial. Soften WITHOUT a number only when the source is silent or vague (true unsupported). Never invent a figure the source does not state. When the source is silent or vague, apply ONE TEST before editing: after removing the unsupported figure, does the remaining phrase tell a reader anything they did not already know?
  - YES, the claim stands without the number: SOFTEN. Remove the figure, keep the phrase, wrap and flag. Example: "delivered 22% revenue growth last year" becomes "delivered revenue growth last year". Growth is still asserted; only the rate was unbacked.
  - NO, the figure WAS the claim: CUT THE CLAUSE. Remove the clause entirely rather than leaving a hollow phrase in its place. Keep the rest of the sentence. Wrap a surviving remnant nearby and flag, following the same pattern the compliance strip path already uses when there is no revised span to wrap. Examples: "The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks of EUR 80-100 million apiece." becomes "The fund intends to build a portfolio of 10-14 control-oriented investments." "The company trades at 14x EV/EBITDA and serves customers across Europe." becomes "The company serves customers across Europe."
${unsupportedWholeSentenceEdge}
A phrase left behind purely to occupy the space where a number used to be is worse than either alternative: it is longer, it asserts nothing, and it reads as evasion.
Two operations look like rounding and only one is legitimate:
  - Approximating a SOURCE figure is fine. The source says 240, the prose says "around 240" or "over 200". The claim is backed; only the precision changed.
  - Approximating the AUTHOR'S unsupported figure is forbidden. The author says 240, no source says anything. "Over 200" is derived from an unbacked number and inherits its lack of support entirely. The second is WORSE than leaving the original figure alone. "240" reads as a claim and invites a reviewer to check it. "Over 200" reads as a finding, as though someone checked and is being careful. It carries the appearance of diligence with none of the substance, and that is the laundering the revision exists to prevent.
Wrap the revised element, the surviving remnant, or the kept sentence in a marker.
c) kind "partial": Keep the CONFIRMED portion unchanged. If the source STATES a specific value for the unsupported element, inject that source value into the prose (house-style) and wrap THAT element in a marker (e.g. "around USD 1.9 billion"). When the source is silent or vague on the unsupported element, apply the same ONE TEST as (b) to that element only: SOFTEN if the remaining phrase still tells the reader something; CUT THE CLAUSE if the figure WAS the claim; keep-and-flag only if cutting would remove the whole sentence. Never approximate the author's unsupported figure. Do not vague out a supported fact because another part of the same statement is unsupported.
d) kind "deletion": Do NOT delete. Keep the author's text unchanged and wrap the flagged phrase in a marker. The note must say what was KEPT and why it is flagged, not describe an edit: "Kept the kettle detail — review flagged it as immaterial, so consider cutting. Confirm before publishing." The author decides whether to cut.
e) kind "soften" (marketing_language_excess): Never substitute a milder evaluative word for a stronger one. Follow suggestedDirection as written. If it begins with Delete and states a resulting phrase, substitute that phrase for the span that contained the deleted words. Do not infer a scaffolding repair the direction does not state. If it tells you to rewrite the sentence without the deleted text, rewrite the sentence so it reads naturally; do not substitute a milder word for the deleted text. If it begins with Keep, keep the author's wording unchanged and wrap it. Never replace "exceptional" with "strong" or any quieter synonym.
f) kind "craft" (all other editorial craft + style_guide — NOT marketing_language_excess): APPLY SILENTLY. NEVER emit a {{text||note}} marker for a craft edit. Meaning-preserving mechanical / style / craft fixes only. The track-changes diff already shows them. Follow suggestedDirection when it does not delete substance.
g) kind "compliance_add": Add the required qualifier or disclaimer and wrap the added/qualified span in a marker.
h) kind "compliance_claim": Soften or qualify the claim (do not strengthen) and wrap the revised claim in a marker.
i) kind "compliance_strip": Honour ACTION= / publicSourceDowngrade on the concern line. If the line includes publicSourceDowngrade=keep-and-flag or ACTION=KEEP-AND-FLAG, KEEP the author's content unchanged (do not strip or anonymise) and wrap it. The note must say what was KEPT and why it is flagged: "Kept Jane Smith — a supporting source is already public, so check whether removal is still needed. Confirm before publishing." Strip or anonymise ONLY when that downgrade flag is absent (ACTION=STRIP-AND-FLAG). Then wrap a nearby remnant: "Removed Jane Smith — named person in a public version. Confirm before publishing." This is the one case where an element is removed FOR COMPLIANCE REASONS. It is not the only case where content is removed. Strip only when the downgrade is absent.
```

The EDGE CASE interpolated at L1049 is defined at L796-801:

```
/**
 * Live EDGE CASE for kind "unsupported" (buildRevisionPrompt).
 * Keep-and-flag: the model may still keep the sentence; deterministic removal
 * in finalizeSuggestRevisionText owns whole-sentence deletion when enabled.
 */
export const UNSUPPORTED_WHOLE_SENTENCE_EDGE_CASE_LIVE =
  `  - EDGE CASE, cutting would remove the whole sentence: do NOT cut. That is removing the author's point rather than removing unsupported precision, so it falls to keep-and-flag. Keep the sentence as written and flag it.`;
```

| Kind | Specific change, or model's choice? | Keep-and-flag available? |
|---|---|---|
| `conflict` (a) | **Specific** — carry the source value; the value is given | Only when the source states no replacement |
| `unsupported` (b) | **Model's choice** — the ONE TEST decides soften vs cut | **Yes**, via the EDGE CASE, when cutting takes the whole sentence |
| `partial` (c) | **Model's choice** — same ONE TEST on the element | **Yes**, explicitly |
| `deletion` (d) | **Specific** — do not delete, keep and flag | Mandatory; it is the only option |
| `soften` (e) | **Specific** — "Follow suggestedDirection as written" | Only if the direction begins with Keep |
| `craft` (f) | Model's choice, silent, **marker forbidden** | n/a |
| `compliance_add` (g) | **Specific** — add the qualifier | No |
| `compliance_claim` (h) | **Specific** — soften or qualify | No |
| `compliance_strip` (i) | **Specific** — driven by `ACTION=` on the concern line | Yes, when `ACTION=KEEP-AND-FLAG` |

Rule (e) is the tell for the payload asymmetry: it does not state what to do,
it **delegates to `suggestedDirection`**. The two evidence kinds that leave the
choice to the model, (b) and (c), are exactly the two with no field to delegate
to. That is a coherent design; Q3 shows it is not what limits editing.

One observation that should temper any "sharpen the prompt" instinct: the
production `partial` concern C1 is **verbatim the worked example in rule (b)**
at L1048 — "The fund intends to build a portfolio of 10-14 control-oriented
investments, with equity checks of EUR 80-100 million apiece." The prompt
contains this exact sentence, with the exact edit it should receive, and the
model produced a no-change marker on it in all three runs. Whatever is blocking
the edit on this draft, more explicit prompt instruction is not the missing
ingredient. That is a direct argument against another prompt pass.

---

## Cost and method

**~$0.35**, not zero. Q1, Q2, Q3 and Q4 made no model calls, as specified. The
three Suggest calls were spent resolving one question the verdict inverted on:
`bf9d9e8` recorded that the `soften` concern produced no marker, but marker data
cannot distinguish "did nothing" from "edited without a marker", and the two
answers point opposite ways on the hypothesis. `coverage-gap-measure.mjs` now
persists `revisedDraft` per run, and the three runs reproduced the earlier
result exactly (9 markers, 6 no-change, same finding partition) before revealing
the silent edit. That question is now closed and needs no further spend.

Exact cost is unavailable: `gpt-5.1` still has no entry in the `PRICING` table
in `lib/observability.js`, so reviser telemetry reports $0.

No production code changed. No prompt changed.

| File | Change |
|---|---|
| `scripts/diagnostic/revise/directive-vs-diagnosis.md` | this report |
| `scripts/diagnostic/revise/directive-vs-diagnosis.mjs` | new — Q3 measurement |
| `scripts/diagnostic/revise/directive-vs-diagnosis.json` | new — per-kind tallies |
| `scripts/diagnostic/revise/coverage-gap-measure.mjs` | persists `revisedDraft` per run |
| `scripts/diagnostic/revise/coverage-gap-measure.json` | regenerated, now with revised drafts |

## What this does not establish

Three `soften` instances, all on one sentence of one draft, is a thin basis for
the 100% directive action rate. No compliance concern exists anywhere in the
repo, so a third of the directive-carrying kinds are entirely untested. The
evidence-kind rates rest on a much larger sample and are the more trustworthy
half of the table.

The silent edit is the opposite: reproduced 3 of 3, on the shipped path, against
an explicit prompt rule requiring a marker. That one does not need a bigger
sample to be worth acting on.
