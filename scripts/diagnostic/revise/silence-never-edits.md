# Silence never edits, and flag it at the right volume

Commit: `feat(revise): stop removing on silence, and flag unsupported claims loudly or quietly by materiality`

Data: `scripts/diagnostic/revise/silence-never-edits.json`
Script: `scripts/diagnostic/revise/silence-never-edits.mjs`

**Cost: $0.0040**, one live Suggest call (`gpt-5.1-2025-11-13`). Parts 0, 3a and 3b
are zero-cost. Review was not changed, no prompt was changed, nothing was deleted.

> **Part 0a is not blocking, but it does widen the work.** Deterministic removal
> was not the only thing editing on silence. The live prompt's rules (b) and (c)
> tell the model to soften or cut when the source is silent, in as many words.
> Part 1 turns off the code path; the instruction is still in the prompt. Silence
> is therefore **not yet** safe, and a prompt change is required to finish the job.
> Detail in Part 0a below.

---

## Part 3a, the register for every flagged statement

18 flagged statements across the four committed Review artefacts: **10 LOUD,
6 QUIET, 2 ORDINARY**.

| artefact | S | kind | flagged element | register | deciding signal |
| --- | ---: | --- | --- | --- | --- |
| r10-review1 | 0 | partial | In June 2025, Halden Group made a lead commitment to Meridian Capital… | **LOUD** | element text: currency_amount, figure, date_or_period, named_third_party |
| r10-review1 | 1 | partial | that is, in our view, genuinely exceptional | **QUIET** | no checkable content in the flagged element |
| r10-review1 | 2 | partial | placing it in the top quartile of European lower-mid-market managers. | **LOUD** | element text: ranking_or_superlative |
| r10-review1 | 3 | partial | The team's stability, with no senior departures across the last three… | **QUIET** | no checkable content in the flagged element |
| r10-review1 | 4 | conflict | has returned | **ORDINARY** | evidence.kind=conflict |
| r10-review1 | 7 | partial | we recommend the commitment | **QUIET** | no checkable content in the flagged element |
| r10-review1 | 8 | partial | that would not otherwise have been available to us. | **QUIET** | no checkable content in the flagged element |
| r10-review1 | 9 | unsupported | Halden Group expects the relationship to deepen over the life of the … | **LOUD** | element text: named_third_party |
| r10-review2 | 0 | partial | In June 2025, Halden Group made a lead commitment to Meridian Capital… | **LOUD** | element text: currency_amount, figure, date_or_period, named_third_party |
| r10-review2 | 7 | partial | recommends the commitment | **QUIET** | no checkable content in the flagged element (statement features named_person_entity_attribution sit outside it) |
| r10-review2 | 9 | unsupported | Halden Group expects the relationship to deepen over the life of the … | **LOUD** | element text: named_third_party |
| condition-b-review | 2 | partial | placing it in the top quartile of European lower-mid-market managers. | **LOUD** | element text: ranking_or_superlative |
| condition-b-review | 3 | partial | means key-person risk is limited | **QUIET** | no checkable content in the flagged element |
| condition-b-review | 4 | conflict | has returned | **ORDINARY** | evidence.kind=conflict |
| coverage-gap-review | 0 | partial | In June 2026, Partners Group committed to Meridian Capital Partners V… | **LOUD** | element text: currency_amount, figure, date_or_period, named_third_party |
| coverage-gap-review | 1 | partial | equity checks of EUR 80-100 million apiece | **LOUD** | element text: currency_amount, figure |
| coverage-gap-review | 3 | — | Partners Group was attracted to this investment given Meridian Capita… | **LOUD** | element text: named_third_party |
| coverage-gap-review | 5 | unsupported | This relationship enabled deep insight during the diligence phase. | **LOUD** | element text: causal_claim |

**Sanity checks, all three pass** (searched across 3a and 3b, since "We recommend
approval." lives in the removal corpus rather than these four artefacts):

| sentence | wanted | got |
| --- | --- | --- |
| the equity cheque | LOUD | **LOUD** (currency_amount, figure) |
| "We recommend approval." | QUIET | **QUIET** |
| the diligence sentence | LOUD | **LOUD** (causal_claim) |

The diligence sentence is the one that proves the design. Its card is level
`material` with features `[]`, so nothing in materiality could have made it loud.
It is loud because `enabled` is a causal claim, read off the element text.

---

## Part 0, answered before building

### 0a, which code paths EDIT on silence — the answer that widened the work

**Three, not one.**

1. **Deterministic whole-sentence removal.** `applyDeterministicUnsupportedRemoval`,
   gated on `opts.deterministicUnsupportedRemoval`, which
   `api/suggest-revision.js` `finalizeOpts` passed as `true`. This is what Part 1
   turns off.

2. **The live prompt, rule (b), kind "unsupported".** It does not merely permit
   editing on silence, it instructs it, and it instructs deletion by name:

   > Soften WITHOUT a number only when the source is silent or vague (true
   > unsupported). … When the source is silent or vague, apply ONE TEST before
   > editing: after removing the unsupported figure, does the remaining phrase
   > tell a reader anything they did not already know?
   > — YES … **SOFTEN.**
   > — NO, the figure WAS the claim: **CUT THE CLAUSE.** Remove the clause
   > entirely rather than leaving a hollow phrase in its place.

   Its worked example is the equity cheque sentence.

3. **The live prompt, rule (c), kind "partial".** The same test, applied to the
   unsupported element: "apply the same ONE TEST as (b) to that element only:
   SOFTEN if the remaining phrase still tells the reader something; CUT THE
   CLAUSE if the figure WAS the claim". On the four artefacts, 13 of 18 findings
   are kind `partial`, so this is the wider of the two prompt routes.

   The prompt's own framing block is explicit that this is deletion triggered by
   silence: *"Removing unsupported PRECISION while the point survives, or cutting
   the clause when it does not. Triggered by an evidence gap with a silent source.
   Rule (b). Do it and flag."*

   The only brake is the EDGE CASE that keeps-and-flags when cutting would remove
   the whole sentence.

**What turning rules (b) and (c) off would mean** (reported, not done, per spec):
the model would stop softening and stop cutting on silence and would keep-and-flag
instead, which is what rule (d) already does for `deletion`. Two consequences worth
weighing before anyone writes that change. First, the genuinely useful half of rule
(b) is the *source-states-a-value* half — "If the source STATES a specific value,
put that source value in the prose" — which is ORDINARY behaviour and must survive;
only the silent-source branch should go. Second, a draft asserting an unbacked
figure would now keep that figure and carry a loud flag, which is a deliberate
shift of the decision from Revise to the author, and is exactly the LOUD register
this spec adds.

**Measured on the live run**, with removal off, the model kept and flagged the
equity cheque rather than cutting it. One run is not a guarantee: the instruction
is still there, and earlier measurement of this same path recorded it cutting.
Treat the instruction, not this run, as the state of play.

4. Stage 1 (`lib/revise-stage1.mjs`) also edits on silence, but it is behind
   `perStatementRevise` and production does not set it, so it is out of scope here.

### 0b, how materiality is assigned

**Fully deterministic. No model call.** `lib/qc/materiality.mjs`.

- **`features`** come from `extractStatementFeatures` (L60–109): seven regexes over
  the statement text, producing `monetary_figure`, `percentage_metric`,
  `date_period_claim`, `named_person_entity_attribution`, `comparative_superlative`,
  `forward_looking`, `regulated_sensitive`.
- **`level`** comes from `computeCardMateriality` (L235–308), which calls
  `scoreFinding` (L144–221) once per finding and takes the max of
  `mechanical < minor < material` (L223–229).
- Assembled onto the card in `lib/qc/pipeline-v3/stage7-assemble-card.mjs`.
- The header states it is "additive (read-only vs verdict) … Does not feed
  concernLevel, aggregation, or evidence verdict."

### 0c, why the diligence sentence is `material` with features `[]`

Both halves are correct and independent, which is the point.

`features` is `[]` because none of the seven regexes fire on "This relationship
enabled deep insight during the diligence phase." No money, no percentage, no date,
no comparative, no regulated term, nothing forward-looking. Not even
`named_person_entity_attribution`, whose proper-noun branch needs **two** adjacent
capitalised words (L82); "This relationship" gives it one.

`level` is `material` because on a `not_supported` verdict `scoreFinding` reaches
the `evidence_no_support` branch (L193–199) and returns `material` unless the
sentence is a procedural closer. Features are never consulted on that branch — they
only discriminate within `evidence_partial` (L202–217).

So on exactly the findings this module classifies, `level` is a restatement of the
verdict and `features` can be empty on a material statement. **The register cannot
be read off materiality alone**, which is why `flagRegister` uses features only when
the flagged element is the whole statement and otherwise reads the element text.

Reproduced live: `extractStatementFeatures` → `[]`, `computeCardMateriality` →
`{"level":"material","features":[]}`, matching the production card byte for byte.

### 0d, does anything capture a CAUSAL claim

**No.** None of the seven features covers causation. The nearest thing in the file
is the craft concern code `overreach_unsupported_causal` (L37), which is an
editorial *concern code*, not a feature, and it is classified `editorial_craft` →
`minor` (L173–176), so it cannot make a statement material.

The smallest addition would be one more feature in `extractStatementFeatures`
around L107 — a `causal_claim` regex over *enabled / caused / drove / led to /
resulted in / because of / thanks to / meant that / allowed* — plus adding it to
`HIGH_SIGNAL_FEATURES` (L45) so it escalates `evidence_partial`.

**Not done here**, because it changes `materiality.features` on every card and this
spec changes no Review output. `lib/revise-flag-register.mjs` carries the same
regex locally instead. If the feature is ever added, the register should prefer it
and the local copy should go.

### 0e, anything else that would make this wrong

- **Notes get rewritten three times downstream.** `normalizeMarkerNoteText` appends
  "Confirm before publishing." to everything; `applyNoteWhatFromDiff` regenerates
  the note from the diff; and — the one the spec did not list —
  `rewriteHonestyNote` in `lib/pr9-marker-honesty.mjs` replaces a note's first
  clause with "Left this wording as written" whenever a `CHANGED` marker's span
  did not move. The first live run emitted **zero** register notes for exactly this
  reason: the model declares `CHANGED` on spans it then leaves alone, so the
  honesty check overwrote all three. All three now carve out register notes.
- **Registers must not be stamped over real edits.** The register only replaces a
  note when the marked span came back byte-identical. Because rules (b) and (c)
  still instruct editing on silence, an unsupported element can still come back
  changed, and stamping "No supplied source states this" over a note describing a
  real edit would be precisely the dishonesty what-from-diff exists to prevent.
- **`features` are computed over the statement, the element is often narrower.**
  A `monetary_figure` elsewhere in the sentence says nothing about a flagged clause
  that has no figure in it. Measured case: r10-review2 S7, where the statement
  carries `named_person_entity_attribution` but the flagged element "recommends the
  commitment" does not, and the register is correctly QUIET.
- **`forward_looking` is excluded from the loud set.** It fires on "expects",
  "intends" and "plan to", which is most of how an author states their own
  intentions, and an intention is not a checkable third-party fact.
- **Observability metadata was lying.** `llmMeta.deterministicUnsupportedRemoval`
  was hard-coded `true` next to the option; it now tracks the real value.

### Fixtures and the AUTHORING_ORGANISATION check

**Production `AUTHORING_ORGANISATION` is set to `"Halden Group"`, a fixture name.
This is a misconfiguration.** It is set on **Production and Preview**, created 5
days ago (`vercel env ls`; value read via a temporary `vercel env pull` that was
deleted immediately).

Consequences, given the presence check never scrapes a name and returns null when
the configured name is absent from the draft:

- For every real customer draft that does not contain the words "Halden Group",
  the authoring organisation resolves to null, so first-person substitution never
  fires and the house-style rule is silently inert in production.
- For any draft that *does* mention Halden Group — including a customer writing
  *about* them — that name would be substituted as the author, which is the exact
  failure the module's header documents.

Not changed here: the correct value is a product decision and a production config
change, both outside this spec. It should be set per request or per tenant rather
than globally.

This does not affect this spec, which keys registers off materiality and element
text rather than authorship.

---

## Part 1, silence no longer edits in code

`api/suggest-revision.js` `finalizeOpts` now passes
`deterministicUnsupportedRemoval: false`. `lib/pr9-deterministic-unsupported-removal.mjs`
stays on disk, still imported by `finalizeSuggestRevisionText`, `pr9-note-what-from-diff.mjs`
and the diagnostic scripts, and still fully tested — just never enabled.

**What production behaviour reverts to:** the model's own keep-and-flag path.
`applyDeterministicUnsupportedRemoval` returns its input untouched when disabled,
so no sentence is deleted, no CUT remnant marker is synthesised, and
`removalEvents` is empty. The `[revise-removal]` log line still prints
`removals=0` every run.

**Confirmed clean on the live run:** 0 removals, 0 removal events of any kind,
**0 orphaned markers**, and every marker still resolves to a real span. The
keep-and-flag path took over with nothing left dangling.

---

## Part 2, the three registers

`lib/revise-flag-register.mjs`. ORDINARY is decided first, from the card; LOUD and
QUIET are decided from the element text, falling back to `materiality.features`
only when the flagged element is the whole statement. Every decision returns the
signal that made it, which is what the Part 3a "deciding signal" column shows.

### Exact final strings

| register | exact note |
| --- | --- |
| **LOUD** | `No supplied source states this. Do not publish it without one.` |
| **QUIET** | `No supplied source speaks to this either way.` |
| **ORDINARY** | unchanged — `<what changed> - <why>. Confirm before publishing.` |

LOUD is more emphatic than ORDINARY by stating the absence as fact and giving an
instruction, where ORDINARY invites a check. QUIET carries no closer because there
is nothing to resolve. LOUD deliberately carries no closer either: appending
"Confirm before publishing." after "Do not publish it without one." would undercut
the emphasis the loud register exists to carry.

Both are carved out of `normalizeMarkerNoteText`, `applyNoteWhatFromDiff` and
`rewriteHonestyNote`, and both are distinct from
`AUTHOR_STATEMENT_KEPT_NOTE` — three registers, three strings, asserted distinct
in the tests.

---

## Part 3b, the removal breadth 11, now flagged rather than removed

**6 QUIET, 5 LOUD. None removed.**

| statement | was adjudicated | register | deciding signal |
| --- | --- | --- | --- |
| F01:S11 "We recommend approval." | **WRONG** | QUIET | nothing checkable |
| F08:S17 "We are confident in the team and the opportunity…" | CORRECT | QUIET | nothing checkable |
| F12:S5 "The numbers tell one story; the team's transformation…" | CORRECT | QUIET | nothing checkable |
| F13:S15 "The investment fits well with the broader portfolio strategy." | CORRECT | QUIET | nothing checkable |
| F14:S12 "We will provide further detail when the work is sufficiently advanced." | ARGUABLE | QUIET | nothing checkable |
| F15:S32 "We have high conviction in the management team…" | CORRECT | QUIET | nothing checkable |
| F20:S8 "Our investment team has been preparing Fund V's pipeline…" | CORRECT | **LOUD** | figure, date_or_period, ranking_or_superlative, named_third_party |
| F21:S3 "James Ortiz said, 'Project Atlas will double in value within two years.'" | CORRECT | **LOUD** | named_third_party |
| F21:S4 "The transaction is expected to close in the second quarter of 2026." | CORRECT | **LOUD** | figure, date_or_period |
| F22:S3 "Veneto Freight is one of the fund's existing portfolio companies." | CORRECT | **LOUD** | named_third_party |
| F23:S4 "Aldous Renewables is the fund's largest limited partner." | CORRECT | **LOUD** | ranking_or_superlative, named_third_party |

This is the case for the two volumes in one table. The one WRONG deletion and the
one ARGUABLE both land QUIET, so the change that used to destroy correct text is
now the softest thing the system says. Meanwhile the four deletions that were
adjudicated CORRECT and carried checkable content — a named quote, a close date, two
misattributed third parties — all land LOUD, so nothing is lost by not deleting
them: the reader is told plainly that no source states them.

Every QUIET row is boilerplate closing language. That is the category the old rule
deleted four of, and it is the category where deletion was least valuable and most
irritating.

---

## Part 3c, one live Suggest with Part 1 in place

Production fixture, committed Review, exactly the production finalise options.

```
removals                      0
removal events at all         0
orphaned markers              0
diligence sentence survives   yes
equity figure survives        yes
LOUD notes emitted            3
QUIET notes emitted           0
```

Markers, verbatim:

```
[KEPT] In June 2026, Partners Group committed to Meridian Ca…
       No supplied source states this. Do not publish it without one.
[KEPT] with equity checks of EUR 80-100 million apiece
       No supplied source states this. Do not publish it without one.
[CUT]  well-established
       Removed "and highly regarded" - overstated against the source. Confirm before publishing.
[KEPT] This relationship enabled deep insight during the dil…
       No supplied source states this. Do not publish it without one.
```

Three loud flags, no deletions, and the one edit that did happen is a `soften`
finding on marketing language — a source-driven concern, correctly left on the
ORDINARY register with its closer intact. No QUIET notes appeared because all
three silence findings on this fixture carry checkable content.

**One unreported change**, unchanged from before this spec: the model inserted an
Oxford comma into the EBITDA sentence. That is a house-style edit which rule (f)
requires to be applied silently, so it is correctly unmarked and correctly counted
by the detector. Pre-existing noise, not a regression.

---

## Pass conditions

| condition | result |
| --- | --- |
| Part 0 answered, materiality mechanism with line numbers | PASS, `lib/qc/materiality.mjs` L60–109 features, L144–221 / L235–308 level, deterministic |
| removal no longer fires, module still on disk | PASS, 0 removals live; module present, imported, tested, never enabled |
| three registers implemented, exact final strings reported | PASS |
| the three sanity sentences land in the right registers | PASS, 3 of 3 |
| suite green | PASS, 659 tests, 37 files |

**Not yet satisfied by this spec, and it should not be read as satisfied:** the
principle says silence never edits, and prompt rules (b) and (c) still instruct the
model to soften or cut on silence. Part 1 closes the code route. Closing the prompt
route is the next change, and until it lands, "silence never edits" is true of the
deterministic path only.
