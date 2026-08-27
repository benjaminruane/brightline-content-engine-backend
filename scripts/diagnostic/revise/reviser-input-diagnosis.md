# Reviser input diagnosis after the Review rewrite

Free. No model calls. Read of `lib/build-revision-prompt.mjs`, R10 Stage 2
explanations, and the R10 production verify JSON.

Directory: `scripts/diagnostic/revise/` (new; nearest precedent is
`scripts/diagnostic/span-wired/` and `span-two-step/`). No prior `revise/`
folder in this repo.

B88's four live observations predate R3a and R10. This note asks whether that
evidence base is still the right one.

---

## 1. What actually reaches the reviser

CONFIRMED: `lib/build-revision-prompt.mjs`.

### Construction

`gatherConcerns` (L436-L496) builds one item per statement that has an evidence
gap and/or editorial/compliance concerns. For an evidence gap it sets:

```
evidence.verdict     = Stage 2 kind (confirmed path skipped; gaps only)
evidence.excerpt     = primary excerpt text
evidence.reason      = extractEvidenceReason(card)   // L102-L106
evidence.kind        = conflict | unsupported | partial
evidence.sourcePassage / sourceLabel  // only when kind === conflict
evidence.unsupportedSpans             // shorter validated spans only
```

`extractEvidenceReason` (L102-L106):

```
summary = card.evidenceSummary
reasoning = card.reasoningParagraph
if both present and different: return summary + "\n" + reasoning
else: return summary || reasoning || ""
```

On the live path, Stage 5 commentary typically lands in `evidenceSummary`, and
`reasoningParagraph` is often the same string (card assembly copies it). So the
reviser usually sees **one** plain-language reason block, not two copies.

`formatConcernsBlock` (L566+) emits, for a statement without claim-spans:

```
### Statement [i]
Text: ...
Evidence gap (<verdict>) [kind=...]:
  Unsupported phrase (<label>): "<span text>"    // if any survive
  Reason: <evidence.reason>
  Source: ...                                    // conflict only
  Conflicting source passage: ...                // conflict only
  Source excerpt: ...
```

Plus editorial/compliance lines when present.

### What the reviser does NOT get from Stage 2 directly

- Raw Stage 2 `classification` field name (it gets the mapped gap kind).
- Multipassage `supportSpans` classifications (those feed the drawer, not this
  prompt). CONFIRMED by absence from `gatherConcerns`.
- Whole-statement `unsupportedSpans` (suppressed at L311-L328 /
  `isWholeStatementSpan`).

### D2 (`underreach_hedging` skip)

CONFIRMED: `collectEditorialConcerns` L369:

```
if (norm(rule) === "underreach_hedging") continue;
```

D2 is a **rule-ID skip on editorial concerns only**. It does not touch evidence
gaps, spans, or Stage 2 reasons.

Does it block anything relevant to the six fixed shapes?

```
No for the six Stage 2 shapes themselves.
Those are evidence gaps (partial / conflicting). D2 never sees them.

Yes for a related Meridian closing sentence (B92): compliance says soften a
promise; editorial underreach_hedging says remove the hedge. D2 drops the
editorial hedge-removal from the reviser prompt, so the reviser will not strip
the hedge on that rule. That is orthogonal to mark/return and the five R3a
framing greens.
```

---

## 2. Would the new reasoning be actionable?

Six shapes. Explanations from R10 harness rows
(`r10-scoped-basis-gate-rows.json`, variantId R10) unless noted. Production
verify used for EA_E3 card-facing summary where it differs in prose.

### eval-ablation EA_E3 (`meridian_source.txt`)

```
Harness R10 explanation:
The statement claims Fund IV has returned 1.9 times gross MOIC, while the
source states it is currently marked at 1.9x gross MOIC. This is a basis
mismatch between returned and marked at, which is mutually exclusive.

Production evidenceSummary (baed6ed):
... currently marked at 1.9x ... valuation rather than an actual return ...
```

HYPOTHESIS: actionable. A rewriter given only that text should change "has
returned" to a mark/unrealised qualification and keep 1.9 and 24%. Plausible
good edit: "Fund IV is currently marked at 1.9 times gross MOIC and a 24 per
cent gross IRR." Plausible bad edit: delete the figures, or hedge to "around
1.9" without realised/unrealised language (fails Ben's mark rule).

### EA_E2 (`meridian_source.txt`)

```
The source confirms no senior departures across the last three fund cycles, but
it does not address the claim that this stability limits key-person risk, which
is an additional evaluative claim.
```

HYPOTHESIS: actionable for a delete/qualify of the evaluative tail. Plausible
good edit: keep the no-departures fact; drop or soften "means key-person risk
is limited." Plausible bad edit: invent source support for limited key-person
risk, or delete the whole sentence including the confirmed fact.

### claim-spans CS_E3 (`claim-spans/evaluative-accident/source_ic_memo.txt`)

```
The source confirms the marks for Fund IV and Fund III. However, the evaluative
claim about the manager's judgement is not addressed in the source.
```

HYPOTHESIS: actionable. Plausible good edit: keep the 1.9x / 1.7x marks; remove
"speaks well of the manager's judgement." Plausible bad edit: soften the marks
or invent a judgement quote.

### F01_S10 (`01_bvp_shopify_memo.txt`)

```
The source supports Shopify's competitive position and growth potential but does
not explicitly mention 'exceptional unit economics.'
```

HYPOTHESIS: actionable. Plausible good edit: drop or soften "exceptional unit
economics" while keeping defensible position / growth runway. Plausible bad
edit: delete the whole in-summary sentence.

### F04_S20 (`04_synth_vc_pinterest_style_memo.txt`)

```
The source supports ... exceptional engagement and high conviction in the
founders. However, it does not explicitly mention a 'defensible consumer
position,' making the statement broader than the source.
```

HYPOTHESIS: actionable. Plausible good edit: remove "defensible consumer
position" (or the whole triad gloss). Plausible bad edit: also strip
engagement/conviction that the source supports.

### F12_S0 (`12_synth_linkedin_post.txt`)

```
The source confirms the sale completion but indicates an eighteen-month
partnership duration, conflicting with the statement's 'more than four years'
partnership claim.
```

HYPOTHESIS: actionable as a magnitude/duration conflict. Plausible good edit:
"After eighteen months of partnership..." Plausible bad edit: delete the sale
fact, or invent "four years" into the source.

### Cross-shape read

```
All six R10 reasons name the specific unsupported or mismatched claim in plain
words. That is exactly the form B88 said the reviser responds to.
HYPOTHESIS: reasoning alone is enough for a correct edit on each of the six,
without spans. Spans are optional precision, not the only channel.
```

---

## 3. The span picture may have changed too

### Production Meridian (R10 verify `baed6ed`)

Of 8 evidence-gap cards, 7 carried `unsupportedSpans`. Quality:

```
PHRASE (usable by reviser; whole-statement spans are suppressed):
  "that is, in our view, genuinely exceptional"     evaluative
  "placing it in the top quartile..."               ranking clause
  "has returned"                                    EA_E3 mark basis  <-- right words
  "we recommend the commitment"                     recommendation tail
  "that would not otherwise have been available..." co-invest gloss

WHOLE (suppressed by extractUnsupportedSpansForRevision L311-L328):
  full commitment sentence
  full EA_E2 key-person sentence
```

CONFIRMED: EA_E3's `"has returned"` is the right problem words on the live
product card. Not a one-off in the sense that other Meridian phrases also land
on the unsupported clause; but it is the cleanest conflict span in that run.

### Corpus elicit baseline (`span-two-step/report.md`, pre-R10 prompt era)

```
Eligible pairs: 57
Validated: 55
WHOLE: 22 of 55 (40%)
phrase: 33 of 55 (60%)
Among conflicting: WHOLE 18 / phrase 13
```

CONFIRMED: historically, 40% of validated spans were whole-statement and would
be stripped before the reviser sees them. Many conflict phrases are long clauses
that still name the disputed numbers (usable), not single verbs like "has
returned".

### Staleness

```
span-two-step rows are pre-R10 (old promptHash era). Production Meridian is
post-R10. B88's "spans are useless" was about reviser behaviour on four live
runs, not about span string quality alone.

HYPOTHESIS: span string quality has improved on at least the mark card; B88's
behavioural claim (reviser ignores spans / mangles when it uses one) is still
untested under R3a/R10 reasoning. Do not treat either half as settled.
```

Opinion: B88's conclusion that spans are the wrong lever for getting good edits
still looks directionally right, because reasoning already names the problem.
But "spans are useless" as a quality claim is partly stale: when elicitation
lands on `"has returned"`, the span is excellent. The open question is whether
the reviser uses it well or still mangles.

---

## 4. Failure mode to watch

From B88: the one acted-on span produced a mangled sentence (clause replaced by
a neighbour duplicate).

Watch list for a rewrite test:

```
1  Mark sentence (EA_E3): edit MUST carry realised/unrealised or marked/valued
   language. Fail if it hedges the number ("about 1.9"), deletes 1.9/24, or
   keeps "has returned" / "returned".

2  Span-induced mangling: duplicated neighbour clause; stranded grammar;
   markers claiming CUT/CHANGED on text left untouched (Pr9 honesty).

3  Over-deletion: confirmed facts removed along with the unsupported gloss
   (EA_E2 no-departures fact; F01 growth; F04 engagement).

4  Invented support: rewriter "fixes" a green-looking partial by fabricating
   source language.

5  D2 interaction: on the On-balance sentence, reviser must not strip hedges
   that compliance wants kept as soften-not-delete (B92).
```

Good vs plausible-looking bad for the mark:

```
GOOD:  "Fund IV is currently marked at 1.9 times gross MOIC and a 24 per cent
        gross IRR." (or "unrealised mark of 1.9x...")
BAD:   "Fund IV has returned approximately 1.9 times..." (hedge, still returned)
BAD:   "Fund IV has delivered strong returns." (number deleted)
BAD:   sentence duplicated or neighbour clause pasted into the slot
```

---

## 5. Recommended next pass

One pass. Measured run. About $0.50.

```
WHAT: Halden Meridian draft, same as r10-production-verify.
      Production Review (evidence on) + Suggest revision + second Review.
      Cache behaviour as production.

MEASURE:
  1 Mark sentence before/after: must gain realised/unrealised (or marked)
     qualification; must keep 1.9 and 24%.
  2 EA_E1 / EA_E2: unsupported tails addressed without deleting confirmed facts.
  3 No mangled duplicate-clause edits on any card that had a short span.
  4 Record whether the reviser prompt (from logs or reconstructed gatherConcerns)
     contained Reason text and which Unsupported phrase lines.

COST: ~$0.50 for full Review + Suggest + second Review on one draft.

STOPPING RULE:
  PASS if mark edit meets the realised/unrealised rule and no mangled sentence
  appears on the six-shape cards present in Meridian.
  FAIL if mark keeps "returned", drops the figures, or a span-adjacent edit
  mangles grammar.
  INCONCLUSIVE if Suggest returns no edit on the mark despite conflict/high
  (then the failure is routing/gather, not rewrite quality).

DO NOT:
  Do not rebuild B88 spans.
  Do not change the live prompt or reviser prompt in this pass.
  Do not run a full corpus rewrite sweep.
  Do not treat a harness-only Stage 2 row as a rewrite verify (P19).
```

If Claude wants a cheaper first cut: reconstruct `gatherConcerns` offline from
the existing `r10-production-verify.json` (free) and only spend the $0.50 once
the prompt text looks right. That is still the same next pass, with a free
preflight.

---

## 6. What would you expect to fail (Claude's next spec)

In order of likelihood:

```
1  CONTROL CONFUSION: treating harness Stage 2 explanations as what the reviser
   saw, without reconstructing gatherConcerns / formatConcernsBlock (production
   adds Stage 5 wording and may suppress whole spans).

2  FIXTURE IDENTITY: mixing eval-ablation EA_E3, claim-spans CS_E3, and corpus
   E3:S0:ic_memo, or using F93_S0 as if it were Meridian EA_E3.

3  GOOD-REWRITE DEFINITION: scoring "any edit off returned" as pass, including
   figure deletion or approximate hedges that violate the realised/unrealised
   rule Ben stated.

4  SPAN FLAG: running Suggest with QC_STAGE2_SPAN off and concluding spans are
   useless, or on and attributing a reasoning-led edit to the span.

5  NOISE: one Suggest run; B98 says revision is unstable. A single PASS is weak
   without a repeat or a crisp binary on the mark sentence.

6  SECOND REVIEW: judging the rewrite by the first Review card only, skipping
   whether the second Review still flags or clears the mark correctly.
```

---

## 7. Anything we have not asked

```
- supportSpans vs unsupportedSpans: the mark card's supportSpans still say
  confirmed while the card is conflict (B89). The reviser does not read
  supportSpans, so this does not poison the rewrite prompt directly, but a
  human comparing drawer to Suggest will see a split product.

- EA_E2's production unsupportedSpan is WHOLE and will be stripped; the reviser
  depends entirely on Reason for that shape. If Reason is thin on a future run,
  EA_E2 is the first shape to fail.

- Claim-span path (formatConcernsBlock hasClaimSpans branch) is a different
  prompt shape. Meridian production cards in the verify were not decomposed in
  a way that changes the six-shape story; do not generalise from Meridian to
  claim-span-heavy drafts without checking.

- B88 NEEDS RE-ASSESSMENT is the right backlog state; this diagnosis is the
  brief for that re-assessment, not the re-assessment itself.
```

---

## Opinion

```
B88's claim that the reviser acts on concrete reasoning, not on spans, still
looks right, and is now MORE favourable: R10 reasons name the problem in the
form B88 said works. The "spans are useless" half is partly stale on quality
(EA_E3 "has returned" is an excellent span) and still untested on behaviour
under the new reasons.

I would not rebuild spans next. I would spend ~$0.50 on one Meridian
Review + Suggest + second Review with a binary mark rule, after a free
gatherConcerns preflight from r10-production-verify.json.
```
