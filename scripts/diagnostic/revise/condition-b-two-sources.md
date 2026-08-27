# Condition B: Meridian draft against two sources

Survive half of Ben's rule only. No prompt or code changes. No Condition A
(removal) in this pass.

Running cost estimate: about USD 0.80 (two-source evidence Review + Suggest).
Actual wall time: review 15475 ms, suggest ~5 s. Trace
`bdbf26b3-5530-4583-a9d2-cd4fb072a68c`.

Artefacts:
- `condition-b-review.json`
- `condition-b-suggest.json`
- `condition-b-run-meta.json`
- runner: `scripts/diagnostic/eval-ablation/run-condition-b-two-sources.mjs`
- second source: `scripts/diagnostic/eval-ablation/meridian_halden_note.txt`
  (commit `7dee801`)

Identity: eval-ablation Meridian draft vs `meridian_source.txt` +
`meridian_halden_note.txt`. Not claim-spans CS_E3. Not corpus E3:S0:ic_memo.
eval-ablation EA_E3 is the Fund IV mark sentence in this draft.

---

## Pre-flight (answered before scoring)

```
Does every control hold on the reference arm?
  Reference = existing r10-production-verify.json (single source,
  meridian_source.txt only). CONFIRMED on that arm:
    deepen: not_supported / high
    mark (EA_E3): conflict / high
    top-quartile: supported_partial / moderate
    key-person: supported_partial / moderate
    lead commitment: supported_partial / moderate
    co-invest "not otherwise available": supported_partial / moderate
  CONFIRMED: r10-production-verify.json card list / exhibit reports.

Is the baseline running three times?
  No. This is a two-condition product measurement (B = both sources), not an
  arm comparison. The reference for the single-source arm is the existing
  r10-production-verify run. One Condition B pass. Not x3.

Is any gate vacuous?
  Vacuous as a test of the NEW source (statements the Halden note does not
  need to move, already confirmed on GP alone under the reference arm):
    fund description (EUR 1.2bn / strategy)
    hold period / 30% outside EU
  Those staying supported_full under B is expected and not evidence about the
  Halden note. Named vacuous for the new source.

Is the finding scored on more than one exhibit?
  Yes: deepen (primary) plus the anti-rig group (mark, top-quartile,
  key-person, lead, co-invest).

Does the stopping rule confirm as well as kill?
  Yes: CONFIRM / RIGGED / KILL / SPLIT written below before the run.
```

### Part 0 audit of meridian_halden_note.txt (after writing, not rewritten)

Written first as a realistic Halden IC note (rationale, relationship,
diligence, timing, risks, recommendation). Not edited after the audit.

```
Covers (or near-covers) currently flagged Meridian statements:
  deepen expectation: YES (explicit twice)
  recommend / returns in line with predecessor: YES
  lead commitment June 2025 / EUR 1.2bn / strategy: YES
  co-invest "would not otherwise have been available": YES (explicit)
  exceptional evaluative attraction: YES (near-copies draft wording)
  team stability / no senior departures: YES
  Fund IV marked at 1.9x / 24%: YES (uses "marked at", not "returned")
  realised 2.4x / 17 exits: YES

Does NOT cover:
  top-quartile ranking: NO
  "key-person risk is limited" as a conclusion: only "positive factor in our
    assessment of key-person risk" (softer; not the draft claim)

Anti-rig accidental coverage (NOT rewritten; expectations adjusted):
  lead timing/size: covered by a realistic IC note. Expect possible CLEAR.
  co-invest exclusivity clause: covered. Expect possible CLEAR.
  Soft key-person language: present. Expect still PARTIAL if Stage 2 is strict.

Anti-rig that should still hold if the fixture is not rigged:
  EA_E3 mark "has returned" vs "marked at" (both sources use marked language)
  top-quartile ranking
```

Stopping rule (written before the run; anti-rig adjusted for the audit):

```
CONFIRM  deepen clears; Suggest leaves deepen alone; mark stays conflict;
         top-quartile stays flagged; key-person stays flagged (or soft-partial).
         Lead/co-invest may clear because the note covers them (audit).
RIGGED   mark AND top-quartile AND key-person all clear. Void.
KILL     deepen does not clear.
SPLIT    deepen clears but Suggest edits deepen anyway.
```

---

## Part 1: Condition B run

Production URL: `https://brightline-content-engine-backend.vercel.app`
Evidence only. Authoring organisation: Halden Group.
Sources: meridian_source.txt (index 0) + meridian_halden_note.txt (index 1).

### Per-statement results

```
LEAD
  Verdict: supported_full / none
  Sources: GP partially_confirmed; Halden IC confirmed
  Selected passage (Halden IC): "Halden Group made a lead commitment to
    Meridian Capital Partners V in June 2025, ahead of the GP's planned
    first close."
  Reason: confirms June 2025 lead commitment.
  Aggregation: confirm beats GP silence/partial. CONFIRMED.
  vs reference: was supported_partial. Predicted clear after audit.
  CONFIRMED: condition-b-run-meta.json cards.lead

EXCEPTIONAL
  Verdict: supported_full / none
  Sources: GP partially_confirmed; Halden IC confirmed
  Passage (Halden IC): attraction + "genuinely exceptional relative to the
    peer set"
  Unpredicted clear: the note near-copied draft evaluative language.
  CONFIRMED: cards.exceptional

RANKING (top quartile)  [anti-rig]
  Verdict: supported_partial / moderate
  Sources: BOTH partially_confirmed
  Passage: realised 2.4x / 17 exits (no top-quartile in either source)
  HOLDS. CONFIRMED: cards.ranking

RISK (key-person limited)  [anti-rig]
  Verdict: supported_partial / moderate
  Sources: BOTH partially_confirmed
  Passage: no senior departures (both); Halden soft key-person language did
    NOT promote to confirmed.
  HOLDS. CONFIRMED: cards.risk

MARK (eval-ablation EA_E3)  [anti-rig]
  Verdict: conflict / high
  Sources: BOTH conflicting
  Passage: both say currently marked at 1.9x / 24%
  Reason: returned vs marked.
  HOLDS. CONFIRMED: cards.mark

FUND DESC  [vacuous for new source]
  supported_full / none; both confirmed. Expected.

HOLD / 30% EU  [vacuous for new source]
  supported_full / none; both confirmed. Expected.

RECOMMEND
  Verdict: supported_full / none
  Sources: GP partially_confirmed; Halden IC confirmed
  Passage: Halden belief + recommend language.
  Confirm beats GP partial. CONFIRMED: cards.recommend
  vs reference: was supported_partial / moderate (r10 verify / Suggest measure).

COINVEST (not otherwise available)  [anti-rig original; audit-adjusted]
  Verdict: supported_full / none
  Sources: GP partially_confirmed; Halden IC confirmed
  Passage (Halden IC): co-investment invitations "that would not otherwise
    have been available to us through the primary fund alone."
  Cleared because the note covers it (audit). Not a silent-confirm miracle.
  CONFIRMED: cards.coinvest

DEEPEN  [primary]
  Verdict: supported_full / none
  Sources: GP no_support; Halden IC confirmed
  Passage (Halden IC): "Halden Group expects the relationship to deepen over
    the life of the fund as Meridian builds out Fund V..."
  Reason: explicit confirmation of the expectation.
  Aggregation: confirm beats silence. CONFIRMED: cards.deepen
  vs reference: not_supported / high.
```

### Confirm-beats-silence (first real-shaped set)

```
deepen:     GP no_support + Halden confirmed -> supported_full
lead:       GP partial + Halden confirmed -> supported_full
recommend:  GP partial + Halden confirmed -> supported_full
coinvest:   GP partial + Halden confirmed -> supported_full
exceptional:GP partial + Halden confirmed -> supported_full
mark:       BOTH conflicting -> conflict (no confirm present; ladder intact)
ranking:    BOTH partial -> partial
risk:       BOTH partial -> partial

Matches stage3-aggregate-verdict.mjs priority
(confirmed > conflicting > partial > not_supported).
This is the first measured confirm-beats-silence case where different sources
cover different parts of the draft. CONFIRMED by stage2 fingerprints above.
```

### Suggest (deepen scored separately)

```
Deepen sentence in revised draft:
  "Halden Group expects the relationship to deepen over the life of the fund."
  Identical to original. LEFT ALONE.
  CONFIRMED: condition-b-run-meta.json suggest.deepenLeftAlone === true

Other Suggest behaviour (not primary; recorded):
  mark: changed has returned -> is currently marked at (good; still a conflict
    card)
  risk: cut "means key-person risk is limited" (partial card; surgical)
  ranking: left top-quartile with KEPT / honesty note (still partial)
  exceptional: Review cleared, but Suggest still wrapped the evaluative span
    as KEPT and changed "We" to "Halden Group"
  recommend / coinvest: Review cleared; Suggest applied first-person
    substitution (we/us -> Halden Group) on cleared sentences

Deepen half: PASS (left alone).
Separate finding: Suggest still edits some Review-cleared sentences for
first-person / keep-and-flag packaging. Out of scope for Condition B primary;
do not fold into the Review survive score.
```

---

## Stopping rule outcome

```
CONFIRM.

  deepen clears (supported_full; Halden IC confirmed; GP silent)
  Suggest leaves deepen alone
  anti-rig that must hold after audit:
    mark conflict HOLDS (both sources)
    top-quartile HOLDS (partial both)
    key-person HOLDS (partial both)
  lead and coinvest CLEARED because the note covers them (reported in Part 0;
    not treated as RIGGED)

Not RIGGED: mark and top-quartile and key-person did not all clear.
Not KILL: deepen cleared.
Not SPLIT: Suggest left deepen alone.

Proceed to the removal pass (Condition A / EDGE CASE change) is unlocked for
the survive half. Removal still requires the later reviser EDGE CASE change
(diagnosis 5a50166 / build-revision-prompt.mjs L975).
```

### Unpredicted verdict moves

```
exceptional: partial -> supported_full because the Halden note restated
  "genuinely exceptional". Finding about what such notes contain when written
  realistically; fixture was not rewritten.
recommend: partial -> supported_full (expected if IC recommends; it does).
lead / coinvest: partial -> supported_full (audit-predicted).
```

---

## Cost

```
Estimate: ~$0.80
  two-source Review (10 stmts x 2 sources Stage 2) ~$0.70
  Suggest ~$0.05 to $0.10
Production payloads do not return billed USD. Estimate only.
```

---

## Opinion

```
Running B before A was the right order. Survive works: when a covering source
is present, deepen clears and Suggest leaves it alone. Removal work is no
longer premature on the multi-source path.

The realistic IC note covered lead timing and co-invest exclusivity. That is
what such documents contain; keeping those as hard anti-rig without rewriting
the note would have forced a fake IC. Mark + top-quartile + key-person were
enough to show the fixture is not "everything greens."

I would next change the reviser EDGE CASE so Condition A (GP only) removes
deepen, then rerun A vs B as a pair. Cost ~$0.50 for A Review+Suggest after
the prompt change, plus a cheap B reconfirm if needed.
```

### What a user would notice

With both the GP pack and Halden's own note uploaded, the deepen expectation
stops being flagged unsupported, and Suggest does not strip it. Sentences that
are true and documented in the source set stop looking unsupported.
