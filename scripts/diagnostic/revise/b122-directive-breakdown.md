# B122 directive follow breakdown

Instrument only. Zero model calls. No production changes.
Harness `b122-directive-breakdown.mjs`. Measurement rows `author-confusion-sweep.json`.

## Scoreboard

```
SCOREBOARD (stored sweep rows, not re-scored)
whole-draft (OLD)     followed 29 of 42   missed 13
per-statement (NEW)   followed 30 of 42   missed 12
structural_integrity  OLD 0 of 3    NEW 0 of 3
excluding structural_integrity
  whole-draft         followed 29 of 39   missed 10
  per-statement       followed 30 of 39   missed 9
```

CONFIRMED against `author-confusion-sweep.json` totals.old 29/42 and totals.nw 30/42, and against a recount of `directiveRuns`.

## PART 0. Spec claims, checked against disk

0a. The 29 of 42 and 30 of 42 measurement lives in two places:

- `scripts/diagnostic/revise/author-confusion-sweep.md` lines 104-135 (prose plus the 14-row table).
- `scripts/diagnostic/revise/author-confusion-sweep.json` `directiveRuns` (84 rows, starting at the first object with `file` `suggest-after-r10-review1.json`) and `totals` (`old.followed` 29 `of` 42, `nw.followed` 30 `of` 42).

The rows are reusable. This harness reads them. It does not re-run Suggest.

0b. 14 directives at three runs is 42 observations per arm. CONFIRMED. Every directive key appears in all three seeds of both arms. `directiveRuns.length` is 84. No directive is missing from a run.

0c. `structural_integrity` is 0 of 3 per arm, not 0 of some other denominator. CONFIRMED. There is one such directive in the corpus (`suggest-after-r10-review2.json` statement 3), observed three times per arm.

Spec errors, not worked around:

- The spec asked for at least two cases carrying a `structural_integrity` directive. The measurement corpus has one unique finding. Part 2 traces both reviser prompts (whole-draft and per-statement) for that one finding.
- The spec named D2 at L369. The skip itself is `lib/build-revision-prompt.mjs` L374 (`if (norm(rule) === "underreach_hedging") continue;`). L368-369 is the start of `collectEditorialConcerns`.
- OLD in the sweep is the whole-draft path. NEW is per-statement stage 1. The backlog text that says 29 of 42 whole-draft against 30 of 42 per-statement matches those labels.

## PART 1. Per-directive breakdown

From the stored `followed` flags. Not re-judged.

```
directive id | arm | followed | total | miss pattern
suggest-after-r10-review1 S1 marketing_language_excess | whole-draft | 1 | 3 | scattered (1 of 3 followed)
suggest-after-r10-review1 S1 marketing_language_excess | per-statement | 0 | 3 | consistent (missed every run)
suggest-after-r10-review1 S1 voice_consistency | whole-draft | 3 | 3 | none (followed every run)
suggest-after-r10-review1 S1 voice_consistency | per-statement | 0 | 3 | consistent (missed every run)
suggest-after-r10-review1 S3 overreach_unsupported_causal | whole-draft | 3 | 3 | none (followed every run)
suggest-after-r10-review1 S3 overreach_unsupported_causal | per-statement | 3 | 3 | none (followed every run)
suggest-after-r10-review1 S7 voice_consistency | whole-draft | 1 | 3 | scattered (1 of 3 followed)
suggest-after-r10-review1 S7 voice_consistency | per-statement | 3 | 3 | none (followed every run)
suggest-after-r10-review1 S8 first_person_plural | whole-draft | 3 | 3 | none (followed every run)
suggest-after-r10-review1 S8 first_person_plural | per-statement | 3 | 3 | none (followed every run)
suggest-after-r10-review2 S1 voice_consistency | whole-draft | 3 | 3 | none (followed every run)
suggest-after-r10-review2 S1 voice_consistency | per-statement | 3 | 3 | none (followed every run)
suggest-after-r10-review2 S3 structural_integrity | whole-draft | 0 | 3 | consistent (missed every run)
suggest-after-r10-review2 S3 structural_integrity | per-statement | 0 | 3 | consistent (missed every run)
suggest-after-r10-review2 S7 voice_consistency | whole-draft | 0 | 3 | consistent (missed every run)
suggest-after-r10-review2 S7 voice_consistency | per-statement | 0 | 3 | consistent (missed every run)
condition-b-review S1 marketing_language_excess | whole-draft | 3 | 3 | none (followed every run)
condition-b-review S1 marketing_language_excess | per-statement | 3 | 3 | none (followed every run)
condition-b-review S1 voice_consistency | whole-draft | 3 | 3 | none (followed every run)
condition-b-review S1 voice_consistency | per-statement | 3 | 3 | none (followed every run)
condition-b-review S7 voice_consistency | whole-draft | 3 | 3 | none (followed every run)
condition-b-review S7 voice_consistency | per-statement | 3 | 3 | none (followed every run)
condition-b-review S8 voice_consistency | whole-draft | 3 | 3 | none (followed every run)
condition-b-review S8 voice_consistency | per-statement | 3 | 3 | none (followed every run)
coverage-gap-review S3 marketing_language_excess | whole-draft | 3 | 3 | none (followed every run)
coverage-gap-review S3 marketing_language_excess | per-statement | 3 | 3 | none (followed every run)
coverage-gap-review S5 overreach_unsupported_causal | whole-draft | 0 | 3 | consistent (missed every run)
coverage-gap-review S5 overreach_unsupported_causal | per-statement | 3 | 3 | none (followed every run)
```

### Do the misses cluster or spread?

They CLUSTER. Distribution, worst first:

```
suggest-after-r10-review2 S3 structural_integrity  OLD misses 3/3  NEW misses 3/3  total 6/6
suggest-after-r10-review2 S7 voice_consistency  OLD misses 3/3  NEW misses 3/3  total 6/6
suggest-after-r10-review1 S1 marketing_language_excess  OLD misses 2/3  NEW misses 3/3  total 5/6
suggest-after-r10-review1 S1 voice_consistency  OLD misses 0/3  NEW misses 3/3  total 3/6
coverage-gap-review S5 overreach_unsupported_causal  OLD misses 3/3  NEW misses 0/3  total 3/6
suggest-after-r10-review1 S7 voice_consistency  OLD misses 2/3  NEW misses 0/3  total 2/6
suggest-after-r10-review1 S3 overreach_unsupported_causal  OLD misses 0/3  NEW misses 0/3  total 0/6
suggest-after-r10-review1 S8 first_person_plural  OLD misses 0/3  NEW misses 0/3  total 0/6
suggest-after-r10-review2 S1 voice_consistency  OLD misses 0/3  NEW misses 0/3  total 0/6
condition-b-review S1 marketing_language_excess  OLD misses 0/3  NEW misses 0/3  total 0/6
condition-b-review S1 voice_consistency  OLD misses 0/3  NEW misses 0/3  total 0/6
condition-b-review S7 voice_consistency  OLD misses 0/3  NEW misses 0/3  total 0/6
condition-b-review S8 voice_consistency  OLD misses 0/3  NEW misses 0/3  total 0/6
coverage-gap-review S3 marketing_language_excess  OLD misses 0/3  NEW misses 0/3  total 0/6
```

Eight of fourteen directives are followed on every run of both arms (0 misses of 6). All stored misses sit on the other six:

- `structural_integrity` r10-review2 S3: 6 of 6 misses
- `voice_consistency` r10-review2 S7: 6 of 6 misses
- `marketing_language_excess` r10-review1 S1: 5 of 6 misses
- `voice_consistency` r10-review1 S1: 3 of 6 misses (all on per-statement)
- `overreach_unsupported_causal` coverage-gap S5: 3 of 6 misses (all on whole-draft)
- `voice_consistency` r10-review1 S7: 2 of 6 misses (scattered on whole-draft)

Follow rate including `structural_integrity`: whole-draft 29/42 (69%), per-statement 30/42 (71%).
Follow rate excluding it: whole-draft 29/39 (74%), per-statement 30/39 (77%).
That one rule is 3 of 13 whole-draft misses and 3 of 12 per-statement misses. Removing it does not close the gap. The remaining misses still cluster, they do not spread evenly over the other thirteen.

### Scorer quote parse, before anyone treats 0/3 as a model miss

The sweep scores follow as 'the first quoted span of 6 or more characters is gone from the revised draft' (`author-confusion-sweep.mjs` `scoreDirective`, the regex `/'([^']{6,})'/`). Stored `target` values:

```
suggest-after-r10-review1 S1 marketing_language_excess
  stored target: "genuinely exceptional"
  original contains target: true
  quote role: delete-src (removal score is valid)
suggest-after-r10-review1 S1 voice_consistency
  stored target: "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional"
  original contains target: true
  quote role: replace-src (removal score is valid)
suggest-after-r10-review1 S3 overreach_unsupported_causal
  stored target: "means key-person risk is limited"
  original contains target: true
  quote role: replace-src (removal score is valid)
suggest-after-r10-review1 S7 voice_consistency
  stored target: "we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment"
  original contains target: true
  quote role: replace-src (removal score is valid)
suggest-after-r10-review1 S8 first_person_plural
  stored target: "available to us"
  original contains target: true
  quote role: replace-src (removal score is valid)
suggest-after-r10-review2 S1 voice_consistency
  stored target: "We were attracted to Meridian"
  original contains target: true
  quote role: replace-src (removal score is valid)
suggest-after-r10-review2 S3 structural_integrity
  stored target: "The team"
  original contains target: true
  quote role: short-prefix-of-original (likely quote-parse truncation; removal score is uninformative)
suggest-after-r10-review2 S7 voice_consistency
  stored target: "recommends"
  original contains target: true
  quote role: replace-dest-contains-src (removal score cannot show a follow)
condition-b-review S1 marketing_language_excess
  stored target: "genuinely exceptional"
  original contains target: true
  quote role: delete-src (removal score is valid)
condition-b-review S1 voice_consistency
  stored target: "We were attracted"
  original contains target: true
  quote role: replace-src (removal score is valid)
condition-b-review S7 voice_consistency
  stored target: "we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment"
  original contains target: true
  quote role: replace-src (removal score is valid)
condition-b-review S8 voice_consistency
  stored target: "available to us"
  original contains target: true
  quote role: replace-src (removal score is valid)
coverage-gap-review S3 marketing_language_excess
  stored target: "highly regarded"
  original contains target: true
  quote role: delete-src (removal score is valid)
coverage-gap-review S5 overreach_unsupported_causal
  stored target: "enabled deep insight during the diligence phase"
  original contains target: true
  quote role: replace-src (removal score is valid)
```

CONFIRMED: for `structural_integrity` the stored target is `The team`, not the suggested rewrite. The direction quotes `The team's stability is demonstrated...`. The apostrophe in `team's` closes the regex. `The team` is already the opening of the original statement, and of any rewrite that keeps the subject. A follow and a no-op both leave `The team` in the draft, so both score as a miss. The 0 of 3 per arm does not mean the reviser ignored the instruction. The revised drafts were not stored, so this pass cannot say whether the rewrite happened. A billed re-run that keeps the revised text would be required to score this directive honestly.

CONFIRMED: for r10-review2 S7 `voice_consistency` the stored target is `recommends`. The direction is Replace `recommends` with `Halden Group recommends`. The replacement still contains the source word. Follow and ignore both leave `recommends` in the sentence. Same uninformative 0 of 3.

## PART 2. Does `structural_integrity` reach the reviser?

One unique finding in the measurement corpus. Both prompt builders are traced below.

### 2a. Directive as it exists on the evidence finding, verbatim

File `scripts/diagnostic/revise/suggest-after-r10-review2.json`, statement 3, `qcCard.editorialConcerns[0]`.

```
concernCode: structural_integrity
note: The statement 'The team's stability, with no senior departures across the last three fund cycles.' is a sentence fragment. It lacks a main clause to complete the thought.
category: editorial
suggestedDirection: Rewrite the sentence to include a main clause, such as 'The team's stability is demonstrated by no senior departures across the last three fund cycles.'
suggestedRewrite: The team's stability is demonstrated by no senior departures across the last three fund cycles.
span: [{"startChar":0,"endChar":8,"source":"note_quote"}]
```

Parent card evidence: `supportState` supported, `displayVerdict` supported_full, `unsupportedSpans` []. This is not an evidence gap. CONFIRMED on the fixture card.

### 2b. Prompts actually built

Whole-draft, `buildRevisionPrompt` in `lib/build-revision-prompt.mjs`. Relevant section:

```
### Statement [3]
Text: The team's stability, with no senior departures across the last three fund cycles.
Editorial / style concerns:
  - kind=craft; rule=structural_integrity; note=The statement 'The team's stability, with no senior departures across the last three fund cycles.' is a sentence fragment. It lacks a main clause to complete the thought.; suggestedDirection=Rewrite the sentence to include a main clause, such as 'The team's stability is demonstrated by no senior departures across the last three fund cycles.'
```

Directive text appears in the whole-draft prompt: true. CONFIRMED by building the prompt from the committed fixture and searching for the verbatim suggestedDirection.

Per-statement, buildStage1Prompt in lib/revise-stage1-prompt.mjs. runStage1 (lib/revise-stage1.mjs L435) sends concernKind(concern) || "unsupported". concernKind (lib/pr9-note-what-from-diff.mjs L226-236) skips editorial kind craft and, with no evidence kind on this card, returns null. Kind sent: unsupported. Send decision: {"send":true,"reason":"directive: structural_integrity","signals":["directive: structural_integrity"]}.

```
STATEMENT TO REVISE:
The team's stability, with no senior departures across the last three fund cycles.

FINDING [kind=unsupported]: (none stated)
No specific element was named, so the finding applies to the whole statement.
DIRECTION: Rewrite the sentence to include a main clause, such as 'The team's stability is demonstrated by no senior departures across the last three fund cycles.'

SURROUNDING PARAGRAPH (read-only context, do NOT revise or return it):
The team's stability, with no senior departures across the last three fund cycles.
```

Directive text appears in the stage 1 prompt: true. CONFIRMED. It is on the DIRECTION: line. The kind rule wrapped around it is kind "unsupported" (leave the author's wording exactly as written when the source is silent), not kind "craft" (follow suggestedDirection). That is a competing instruction, not a missing one.

### 2c. It is not lost

The directive is not dropped on the way to either prompt. There is no loss function to name. What changes is classification, not presence.

### Named suspect: whole-statement unsupportedSpans stripped by `extractUnsupportedSpansForRevision`

KILLED for this finding.

- `extractUnsupportedSpansForRevision` (`lib/build-revision-prompt.mjs` L285-348) reads `card.unsupportedSpans` and is called from `gatherConcerns` L485 only inside `if (evidenceIsGap)`.
- This card is not an evidence gap. The call does not run. Gathered `evidence` is null. Gathered `unsupportedSpans` are absent.
- Raw `unsupportedSpans` on the card are `[]`.
- The editorial span is `{ startChar: 0, endChar: 8, source: "note_quote" }`, which is `The team` (8 characters of an 82-character statement), not a whole-statement span. `collectEditorialConcerns` does not pass spans into the prompt anyway. Only `kind`, `rule`, `note`, `suggestedDirection` are copied (L379-380).

The 40% whole-statement figure is a historical evidence-span fact from `reviser-input-diagnosis.md` (22 of 55 validated spans). It is not a property of this editorial directive.

What the rendered prompt shows instead: the full `suggestedDirection` is present, classified as `kind=craft` on the whole-draft path, and as a `DIRECTION:` line under kind `unsupported` on the per-statement path.

### D2 (`collectEditorialConcerns`)

KILLED as a filter on `structural_integrity`.

`collectEditorialConcerns` (`lib/build-revision-prompt.mjs` L368-382) walks `card.editorialConcerns` only. The only rule-ID skip is L374: `if (norm(rule) === "underreach_hedging") continue;`. `structural_integrity` is not `underreach_hedging`. It is classified by `classifyEditorialKind` L350-354: not style_guide, not `marketing_language_excess`, not `materiality`, not a deletion-verb direction, so `kind` is `craft`. It is pushed at L380. D2 does not gate, filter, or reshape this rule.

## PART 3. The other worst directives

Worst after `structural_integrity`, by stored misses. Observation, not cause. Every prompt claim is from `buildRevisionPrompt` / `buildStage1Prompt` on the committed fixture.

### suggest-after-r10-review2 S7 voice_consistency  (OLD 0/3, NEW 0/3)

Directive as written:

```
note: The statement uses first-person plural 'recommends' in a context that requires third-person reporting. Replace 'recommends' with 'Halden Group recommends'.
suggestedDirection: Replace 'recommends' with 'Halden Group recommends'.
```

Directive as it appears in the whole-draft prompt:

```
### Statement [7]
Text: On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
Evidence gap (no_support) [kind=unsupported]:
  Reason: No source addresses the claim that Halden Group believes the fund should deliver returns in line with its predecessor or that it recommends the commitment. The reviewer should add a source that specifically supports this claim or remove it from the document.
Editorial / style concerns:
  - kind=craft; rule=voice_consistency; note=The statement uses first-person plural 'recommends' in a context that requires third-person reporting. Replace 'recommends' with 'Halden Group recommends'.; suggestedDirection=Replace 'recommends' with 'Halden Group recommends'.
```

Verbatim direction in whole-draft prompt: true. In stage 1 prompt: true.
Evidence on the parent card: not_supported. Gathered evidence.kind: unsupported. Stage 1 kind sent: unsupported (concernKind=unsupported).
Quote role: replace-dest-contains-src (removal score cannot show a follow). Stored target: "recommends".
unsupportedSpans on the card: 0. After extractUnsupportedSpansForRevision: 0. Editorial span(s): [{"startChar":107,"endChar":117,"source":"note_quote"}].

Stage 1 finding block:

```
STATEMENT TO REVISE:
On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.

FINDING [kind=unsupported]: No source addresses the claim that Halden Group believes the fund should deliver returns in line with its predecessor or that it recommends the commitment. The reviewer should add a source that specifically supports this claim or remove it from the document.
No specific element was named, so the finding applies to the whole statement.
DIRECTION: Replace 'recommends' with 'Halden Group recommends'.

SURROUNDING PARAGRAPH (read-only context, do NOT revise or return it):
On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
```

### suggest-after-r10-review1 S1 marketing_language_excess  (OLD 1/3, NEW 0/3)

Directive as written:

```
note: 'genuinely exceptional' is hyperbolic language without substantiation in the immediate context. The figures provided in the next sentence substantiate the track record without needing this evaluative language.
suggestedDirection: Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.
```

Directive as it appears in the whole-draft prompt:

```
### Statement [1]
Text: We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.
Evidence gap (partially_confirmed) [kind=partial]:
  Unsupported phrase (source 0): "that is, in our view, genuinely exceptional"
  Reason: The source confirms Meridian's strong track record by providing quantitative data: a realised gross MOIC of 2.4x and a gross IRR of 21% on fully realised deals. However, it does not directly state that this track record is 'genuinely exceptional,' which is an evaluative claim made in the statement. The reviewer should consider adding a source that explicitly supports the exceptional nature of the track record or adjust the statement to align with the data provided.
  Source excerpt: Track record: Across Funds I-IV, Meridian has deployed EUR 2.8 billion across 41 platform investments. Realised gross MOIC of 2.4x and gross IRR of 21% on fully realised deals (17 exits)....
Editorial / style concerns:
  - kind=soften; rule=marketing_language_excess; note='genuinely exceptional' is hyperbolic language without substantiation in the immediate context. The figures provided in the next sentence substantiate the track record without needing this evaluative language.; suggestedDirection=Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.
  - kind=craft; rule=voice_consistency; note=The statement uses first-person plural 'We' and 'in our view', which is inconsistent with the third-person voice required for reporting commentary. The authoring organisation, Halden Group, should be the grammatical subject.; suggestedDirection=Replace 'We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional' with 'Halden Group was attracted to Meridian on the strength of a track record that is genuinely exceptional'.
```

Verbatim direction in whole-draft prompt: true. In stage 1 prompt: true.
Evidence on the parent card: partial. Gathered evidence.kind: partial. Stage 1 kind sent: partial (concernKind=partial).
Quote role: delete-src (removal score is valid). Stored target: "genuinely exceptional".
unsupportedSpans on the card: 1. After extractUnsupportedSpansForRevision: 1. Editorial span(s): [{"startChar":86,"endChar":107,"source":"note_quote"}].

Stage 1 finding block:

```
STATEMENT TO REVISE:
We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.

FINDING [kind=partial]: The source confirms Meridian's strong track record by providing quantitative data: a realised gross MOIC of 2.4x and a gross IRR of 21% on fully realised deals. However, it does not directly state that this track record is 'genuinely exceptional,' which is an evaluative claim made in the statement. The reviewer should consider adding a source that explicitly supports the exceptional nature of the track record or adjust the statement to align with the data provided.
UNSUPPORTED ELEMENT: "that is, in our view, genuinely exceptional"
Edit ONLY inside the unsupported element above. Every other word of the statement must come back byte-identical.
SOURCE EXCERPT: Track record: Across Funds I-IV, Meridian has deployed EUR 2.8 billion across 41 platform investments. Realised gross MOIC of 2.4x and gross IRR of 21% on fully realised deals (17 exits)....
DIRECTION: Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.
DIRECTION: Replace 'We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional' with 'Halden Group was attracted to Meridian on the strength of a track record that is genuinely exceptional'.

SURROUNDING PARAGRAPH (read-only context, do NOT revise or return it):
We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.
```

### suggest-after-r10-review1 S1 voice_consistency  (OLD 3/3, NEW 0/3)

Directive as written:

```
note: The statement uses first-person plural 'We' and 'in our view', which is inconsistent with the third-person voice required for reporting commentary. The authoring organisation, Halden Group, should be the grammatical subject.
suggestedDirection: Replace 'We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional' with 'Halden Group was attracted to Meridian on the strength of a track record that is genuinely exceptional'.
```

Directive as it appears in the whole-draft prompt:

```
### Statement [1]
Text: We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.
Evidence gap (partially_confirmed) [kind=partial]:
  Unsupported phrase (source 0): "that is, in our view, genuinely exceptional"
  Reason: The source confirms Meridian's strong track record by providing quantitative data: a realised gross MOIC of 2.4x and a gross IRR of 21% on fully realised deals. However, it does not directly state that this track record is 'genuinely exceptional,' which is an evaluative claim made in the statement. The reviewer should consider adding a source that explicitly supports the exceptional nature of the track record or adjust the statement to align with the data provided.
  Source excerpt: Track record: Across Funds I-IV, Meridian has deployed EUR 2.8 billion across 41 platform investments. Realised gross MOIC of 2.4x and gross IRR of 21% on fully realised deals (17 exits)....
Editorial / style concerns:
  - kind=soften; rule=marketing_language_excess; note='genuinely exceptional' is hyperbolic language without substantiation in the immediate context. The figures provided in the next sentence substantiate the track record without needing this evaluative language.; suggestedDirection=Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.
  - kind=craft; rule=voice_consistency; note=The statement uses first-person plural 'We' and 'in our view', which is inconsistent with the third-person voice required for reporting commentary. The authoring organisation, Halden Group, should be the grammatical subject.; suggestedDirection=Replace 'We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional' with 'Halden Group was attracted to Meridian on the strength of a track record that is genuinely exceptional'.
```

Verbatim direction in whole-draft prompt: true. In stage 1 prompt: true.
Evidence on the parent card: partial. Gathered evidence.kind: partial. Stage 1 kind sent: partial (concernKind=partial).
Quote role: replace-src (removal score is valid). Stored target: "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional".
unsupportedSpans on the card: 1. After extractUnsupportedSpansForRevision: 1. Editorial span(s): [{"startChar":73,"endChar":84,"source":"note_quote"},{"startChar":0,"endChar":107,"source":"direction_quote"}].

Stage 1 finding block:

```
STATEMENT TO REVISE:
We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.

FINDING [kind=partial]: The source confirms Meridian's strong track record by providing quantitative data: a realised gross MOIC of 2.4x and a gross IRR of 21% on fully realised deals. However, it does not directly state that this track record is 'genuinely exceptional,' which is an evaluative claim made in the statement. The reviewer should consider adding a source that explicitly supports the exceptional nature of the track record or adjust the statement to align with the data provided.
UNSUPPORTED ELEMENT: "that is, in our view, genuinely exceptional"
Edit ONLY inside the unsupported element above. Every other word of the statement must come back byte-identical.
SOURCE EXCERPT: Track record: Across Funds I-IV, Meridian has deployed EUR 2.8 billion across 41 platform investments. Realised gross MOIC of 2.4x and gross IRR of 21% on fully realised deals (17 exits)....
DIRECTION: Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.
DIRECTION: Replace 'We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional' with 'Halden Group was attracted to Meridian on the strength of a track record that is genuinely exceptional'.

SURROUNDING PARAGRAPH (read-only context, do NOT revise or return it):
We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.
```

### coverage-gap-review S5 overreach_unsupported_causal  (OLD 0/3, NEW 3/3)

Directive as written:

```
note: The phrase 'enabled deep insight during the diligence phase' implies a causal relationship without clear supporting evidence.
suggestedDirection: Replace 'enabled deep insight during the diligence phase' with a more neutral statement that does not imply causation.
```

Directive as it appears in the whole-draft prompt:

```
### Statement [5]
Text: This relationship enabled deep insight during the diligence phase.
Evidence gap (no_support) [kind=unsupported]:
  Reason: No source addresses the claim that the relationship enabled deep insight during the diligence phase. The reviewer should add a source that supports this claim or remove it from the document.
Editorial / style concerns:
  - kind=craft; rule=overreach_unsupported_causal; note=The phrase 'enabled deep insight during the diligence phase' implies a causal relationship without clear supporting evidence.; suggestedDirection=Replace 'enabled deep insight during the diligence phase' with a more neutral statement that does not imply causation.
```

Verbatim direction in whole-draft prompt: true. In stage 1 prompt: true.
Evidence on the parent card: not_supported. Gathered evidence.kind: unsupported. Stage 1 kind sent: unsupported (concernKind=unsupported).
Quote role: replace-src (removal score is valid). Stored target: "enabled deep insight during the diligence phase".
unsupportedSpans on the card: 0. After extractUnsupportedSpansForRevision: 0. Editorial span(s): [{"startChar":18,"endChar":65,"source":"note_quote"}].

Stage 1 finding block:

```
STATEMENT TO REVISE:
This relationship enabled deep insight during the diligence phase.

FINDING [kind=unsupported]: No source addresses the claim that the relationship enabled deep insight during the diligence phase. The reviewer should add a source that supports this claim or remove it from the document.
No specific element was named, so the finding applies to the whole statement.
DIRECTION: Replace 'enabled deep insight during the diligence phase' with a more neutral statement that does not imply causation.

SURROUNDING PARAGRAPH (read-only context, do NOT revise or return it):
This relationship enabled deep insight during the diligence phase.
```

### suggest-after-r10-review1 S7 voice_consistency  (OLD 1/3, NEW 3/3)

Directive as written:

```
note: The statement uses first-person plural 'we believe' and 'we recommend', which is inconsistent with the third-person voice required for reporting commentary.
suggestedDirection: Replace 'we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment' with 'Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment'.
```

Directive as it appears in the whole-draft prompt:

```
### Statement [7]
Text: On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.
Evidence gap (no_support) [kind=unsupported]:
  Reason: No source addresses the claim that the fund should deliver returns in line with its predecessor or the recommendation to commit. The reviewer should add a source that supports this belief or remove the claim.
Editorial / style concerns:
  - kind=craft; rule=voice_consistency; note=The statement uses first-person plural 'we believe' and 'we recommend', which is inconsistent with the third-person voice required for reporting commentary.; suggestedDirection=Replace 'we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment' with 'Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment'.
```

Verbatim direction in whole-draft prompt: true. In stage 1 prompt: true.
Evidence on the parent card: not_supported. Gathered evidence.kind: unsupported. Stage 1 kind sent: unsupported (concernKind=unsupported).
Quote role: replace-src (removal score is valid). Stored target: "we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment".
unsupportedSpans on the card: 0. After extractUnsupportedSpansForRevision: 0. Editorial span(s): [{"startChar":12,"endChar":22,"source":"note_quote"},{"startChar":96,"endChar":108,"source":"note_quote"},{"startChar":12,"endChar":123,"source":"direction_quote"}].

Stage 1 finding block:

```
STATEMENT TO REVISE:
On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.

FINDING [kind=unsupported]: No source addresses the claim that the fund should deliver returns in line with its predecessor or the recommendation to commit. The reviewer should add a source that supports this belief or remove the claim.
No specific element was named, so the finding applies to the whole statement.
DIRECTION: Replace 'we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment' with 'Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment'.

SURROUNDING PARAGRAPH (read-only context, do NOT revise or return it):
On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.
```

### Correlations, marked

CONFIRMED: stored misses cluster on six of fourteen directives, not evenly (`author-confusion-sweep.json` `directiveRuns`, Part 1 table).

CONFIRMED: the two 6-of-6 stored misses are the two directives whose quote parse cannot show a follow (`structural_integrity` truncated to `The team`; `voice_consistency` S7 replacement contains `recommends`). File `author-confusion-sweep.json` rows for those keys, field `target`.

CONFIRMED: both of those 6-of-6 directives still have their `suggestedDirection` copied into both prompts (Part 2 and Part 3 traces). A missing instruction is not the stored miss.

CONFIRMED: r10-review2 S7 already names Halden Group in the third person (`On balance, Halden Group believes... and recommends the commitment.`). The Review note calls `recommends` first-person plural, which it is not. Fixture `suggest-after-r10-review2.json` statement 7.

CONFIRMED: r10-review1 S1 carries two directives on one statement (`marketing_language_excess` and `voice_consistency`). Per-statement 0/3 on `voice_consistency` was already explained in `author-confusion-sweep.md` lines 137-158 as a validator rejection (`changed_text_outside_unsupported_span`), not as a missing prompt line. HYPOTHESIS: the 1/3 whole-draft follow on the marketing delete on the same statement is model variance, not a prompt omission. The direction is in the prompt.

CONFIRMED: coverage-gap S5 `overreach_unsupported_causal` is the original 2528a32 0/3-vs-3/3 case. Evidence is `not_supported` with empty `unsupportedSpans`. Stage 1 therefore treats the whole statement as the target (`buildStage1Prompt` L119-122: no named element). Whole-draft kind handling for unsupported silence says leave the wording. HYPOTHESIS: the whole-draft miss is the silence-never-edits rule winning over the editorial direction in a crowded kind-handling block, which is why splitting the call moved this one directive and almost nothing else.

HYPOTHESIS: parent evidence class is not a clean predictor. `structural_integrity` sits on a supported card and still stores 0/3. `voice_consistency` S7 sits on a not_supported card and stores 0/3. Several 3/3 directives also sit on not_supported cards (condition-b S7 and S8). Do not treat verdict class as the cause on this sample.

HYPOTHESIS: directive length is not predictive. The longest direction in the corpus (r10-review1 S1 `voice_consistency`) is 3/3 whole-draft. The shortest (`recommends`) is 0/3 both, and that 0/3 is unscoreable.

## PART 4. Critique

### 4a. What to check about fixtures and controls before any billed run is designed against this finding

Do not design a billed run against the stored 0/3 on `structural_integrity` or on r10-review2 S7 `voice_consistency`. Those two scores cannot move in the direction of 'followed' under the current scorer, even if the model does exactly what the direction says. A new run that reuses `scoreDirective` will reprint the same 0/3 and look like a failed fix.

Fix the scorer first, offline, against the stored directions, with no model call. For `Replace 'X' with 'Y'`, follow means Y is present and the leftover of X is gone. For `Rewrite ... such as 'Y'`, follow means the original fragment is gone or Y is present, and parse quotes so a possessive apostrophe does not close the span. Then, and only then, re-score. If the revised drafts from 2026-08-29 were not kept, the honest next step is one cheap re-run that writes `revisedDraft` per seed, not a 42-cell grid against a broken metric.

Check the Review artefacts themselves. r10-review2 S7 is a bad directive: the sentence is already third-person Halden Group, and the note mis-tags `recommends` as first-person plural. Following it would insert a second `Halden Group`. A follow-rate target that includes this row is a target on Review quality, not on Suggest. r10-review2 S3 `structural_integrity` is a real fragment, but the direction's example is quoted with a possessive, which also truncates the Review span to `The team` (startChar 0, endChar 8). That is a Review quoting bug sitting under the Suggest measurement.

Keep the 8/14 always-followed set as a control, not as padding. If a billed run changes the scorer, re-score those eight first. If any of them drop, the new scorer is wrong.

Do not put per-statement back on the table as the intervention. The original measurement already ruled out competition inside a crowded call, and this pass shows the two 0/3-both rows never measured follow in the first place. The one real arm split that remains is coverage-gap S5 and the r10-review1 S1 validator rejection, both already explained.

### 4b. What in this diagnostic plan would fail or mislead, and what I would have done instead

The plan treated the stored follow flags as a property of the model. They are a property of a regex. Part 1 as specified (reprint the flags, ask cluster vs spread) is still worth doing, and the cluster is real, but two of the six clustered 'misses' are scorer-shaped. A reader who stops at the Part 1 table will walk into a fix for a directive the model may already be following.

The named suspect (whole-statement span stripping) was the right thing to kill, and it is dead here. It was also the wrong first suspect for an editorial rule on a supported card. I would have started with: print the stored `target` field, run the quote regex on every direction, and only then open `extractUnsupportedSpansForRevision`. That is a five-minute check. It would have shown `The team` before any prompt trace.

Asking for two `structural_integrity` cases padded a sample of one. Tracing both prompt builders for the one case is the useful move; inventing a second case from F12 LinkedIn would have mixed a social-format Review watch item (W2) into a Suggest follow measurement.

Building the real prompt is the part of the plan I would keep exactly. The directive does reach the reviser. The interesting residue is not loss, it is kind: whole-draft labels it `craft` and says follow `suggestedDirection`; stage 1 falls through `concernKind` skipping `craft` and sends kind `unsupported`, whose rule says do not touch silent wording. That competing instruction is a real defect in the per-statement path, but it is not what B122's 29/42 number is made of, and production does not enable that path.

I would not have billed a run from this spec. The next unpaid step is a scorer that can tell a follow from a no-op on a possessive rewrite and on a replacement that contains its source. The next billed step, if any, is three seeds on the two unscoreable rows with the revised draft kept.

## Files

- `scripts/diagnostic/revise/b122-directive-breakdown.mjs` this harness
- `scripts/diagnostic/revise/b122-directive-breakdown.md` this report
- Reads, does not modify: `author-confusion-sweep.json`, the four Review fixtures, `lib/build-revision-prompt.mjs`, `lib/revise-stage1-prompt.mjs`, `lib/revise-stage1.mjs`, `lib/pr9-note-what-from-diff.mjs`

Ran at 2026-08-30T04:49:58.977Z. Model calls: 0.
