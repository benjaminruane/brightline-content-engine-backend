# Silence about the author's own actions is not evidence against them

Commit: `feat(revise): keep and quietly flag author-originated statements rather than editing them`

Data: `scripts/diagnostic/revise/author-statements.json`
Script: `scripts/diagnostic/revise/author-statements.mjs`

**Cost: $0.0174** over 9 live calls (`gpt-5.1-2025-11-13`), cache hit rate **96.3%**.
Parts 0 and 4b are zero-cost. Review was not re-run and was not changed.

---

## Part 0c, the blast radius, measured before anything was built

**8 of 18 flagged statements across the four Review artefacts are exempted.**
15 of the 18 rest on silence, so the exemption takes 8 of 15 silence findings and
leaves 10 of 18 findings untouched. Every third-party factual finding still gets
edited, including both conflicts and the equity cheque.

| artefact | S | kind | exempt | sentence |
| --- | --- | --- | --- | --- |
| r10-review1 | 0 | partial | **yes** | In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V, a EUR 1.2 billion fund… |
| r10-review1 | 1 | partial | **yes** | We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional. |
| r10-review1 | 2 | partial | no | It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile… |
| r10-review1 | 3 | partial | no | The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited. |
| r10-review1 | 4 | conflict | no | Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR. |
| r10-review1 | 7 | partial | **yes** | On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment. |
| r10-review1 | 8 | partial | no | The GP provided access to co-investments that would not otherwise have been available to us. |
| r10-review1 | 9 | unsupported | **yes** | Halden Group expects the relationship to deepen over the life of the fund. |
| r10-review2 | 0 | partial | **yes** | In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V… |
| r10-review2 | 7 | partial | **yes** | On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment. |
| r10-review2 | 9 | unsupported | **yes** | Halden Group expects the relationship to deepen over the life of the fund. |
| condition-b | 2 | partial | no | It has realised a gross MOIC of 2.4 times across 17 exits… |
| condition-b | 3 | partial | no | The team's stability… means key-person risk is limited. |
| condition-b | 4 | conflict | no | Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR. |
| coverage-gap | 0 | partial | **yes** | In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR 1.2 billion flagship fund… |
| coverage-gap | 1 | partial | no | The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks of EUR 80-100 million apiece. |
| coverage-gap | 3 | — | no | Partners Group was attracted to this investment given Meridian Capital's strong track record… |
| coverage-gap | 5 | unsupported | no | This relationship enabled deep insight during the diligence phase. |

Deduplicated, that is six distinct sentences: two commitments, two views, one
recommendation and one stated expectation. Every one is the author's own act.
The two artefacts overlap because r10-review1 and r10-review2 are the same draft
in first person and in third person, which is itself useful: the test gives the
same answer either way.

Coverage-gap S3 is worth reading closely. It IS author-originated ("Partners
Group was attracted…"), and it is still not exempted, because it carries no
evidence finding at all — its concern is editorial. The exemption never fires
where there is nothing resting on silence to exempt.

This is not most of the corpus and it does not gut the product, so the build
went ahead.

### Part 0a, what `lib/qc/first-person-actor.mjs` actually determines

It does **not** determine who the author is from the draft. `identifyAuthoringOrganisation`
is documented as a "Presence check only. Does not scrape a name from the draft."
It takes a configured name and returns it only when that exact name already
appears in the text:

```152:159:lib/qc/first-person-actor.mjs
export function identifyAuthoringOrganisation(draftText, houseName = resolveAuthoringOrganisationName()) {
  const text = String(draftText || "");
  if (!text.trim()) return null;
  const name = String(houseName || "").trim();
  if (!name) return null;
  if (houseNameRe(name).test(text)) return name;
  return null;
}
```

The name itself comes from `resolveAuthoringOrganisationResolution`: argument,
then request, then the `AUTHORING_ORGANISATION` env var, then `null`. The module
is emphatic that `null` is the only safe default, and says why:

> There is no default house name. A previous default fired on every production
> review, and any draft that merely mentioned that firm passed the presence
> check and had it substituted as the author. The check cannot tell an authoring
> firm from a firm being written about, so the only safe default is none.

So it **needs configuration**. It cannot work from draft text alone. That is a
real constraint on this feature, not a detail: with nothing configured, only the
first-person path can fire, and a third-person draft like coverage-gap S0 gets
no protection. `AUTHORING_ORGANISATION=Halden Group` is set locally; the Meridian
fixture's author is Partners Group, so the measurement passes it explicitly.

### Part 0b, can it be reused read-only

Yes. `identifyAuthoringOrganisation` and `resolveAuthoringOrganisationName` are
pure exported functions with no writes and no side effects beyond the existing
resolution log. `lib/revise-author-statement.mjs` imports the first only.
Stage 2, the prompt and every card output are untouched.

### Part 0d, false positives, and what was narrowed to close them

Four classes were visible, three of which are now closed in code:

1. **The firm being written about, mistaken for the author.** This is the module's
   own documented failure. Closed by requiring the organisation to be the
   grammatical **subject** of the sentence, not merely present in it, and by
   requiring configuration rather than inference.
2. **Possessives.** "Halden Group's Fund III returned 2.1 times" has the author's
   name first but the subject is Fund III and the return is a checkable fact.
   Closed: a `'s` immediately after the name disqualifies the sentence.
3. **Reporting frames smuggling third-party figures.** "We note that Meridian's
   IRR is 24 per cent" has the author as subject and would have passed. Closed by
   excluding `note`, `observe` and `see` from the verb list entirely. Nothing on
   the corpus depended on them.
4. **Third-party appositives inside an author sentence.** "…committed to Meridian
   Capital Partners V, a EUR 1.2 billion flagship fund" is the author's act
   attached to somebody else's fund size. Partly closed: where a flagged span or
   claim exists, an element sitting after the appositive boundary is not exempted.
   **Where no span exists, the whole sentence is kept, appositive included.** That
   is the known limit of this change. It is deliberate: the measured alternative
   was stage 1 deleting the date and the actor 3 of 3, and Review still reports
   the card either way.

---

## Part 4a, stage 1, arm NEW, three runs

Same fixtures and same committed Review as cd9a666.

```
equity cheque removed          3/3
statement 0 keeps its date     3/3
statement 0 keeps commitment   3/3
"control-oriented" preserved   3/3
unreported changes             0, 0, 0
validator rejections           0, 0, 0
exemptions                     1, 1, 1
```

All three cd9a666 regressions are fixed at once, and nothing that worked stopped
working.

**Exemption, identical across all three runs** — statement 0, kind `partial`:

> the sentence subject is Partners Group and "committed" states its own action,
> view, intention or commitment; no supplied source speaks to the unsupported element

One quiet KEPT marker is emitted per run, carrying the note verbatim, and
deterministic removal reports no removals.

### The exact final note string

```
Kept. This states your own position or action, and no supplied source speaks to it either way.
```

It carries **no** "Confirm before publishing." closer, which required an explicit
carve-out in `normalizeMarkerNoteText` and in `applyNoteWhatFromDiff` — the first
appends that closer to every note, and the second would have overwritten the note
with a diff account of a change that never happened.

The three registers on this path are now distinct:

| register | note |
| --- | --- |
| ordinary evidence | "…— …. **Confirm before publishing.**" |
| loud, removal suppressed | "No supplied source supports this. It has been **kept only because** removing it would leave the draft empty. Confirm before publishing." |
| quiet, author's own | "Kept. This states **your own position or action**, and no supplied source speaks to it either way." |

### One thing found while measuring

The first attempt scored the equity cheque at **0 of 3, with one validator
rejection per run**. The Part 3a fix had tightened what the validator enforces
without tightening what the prompt asks for, so the model was being told to cut
the coarse span and then rejected for cutting it. `buildFindingBlock` now reads
the same `tightestUnsupportedSpans` the validator does. After that, 3 of 3 and
zero rejections.

---

## Part 4b, the removal breadth audit re-scored

The 11 statements 8cad514 selected for deletion, re-scored under the new rule.
No house name is configured per corpus case, so only the first-person path fires
here — the third-person author sentences in the corpus are not protected.

```
of 11:  exempted 3   still removed 8
F01:S11, the one WRONG deletion, exempted: YES
```

| statement | adjudication | now |
| --- | --- | --- |
| F01:S11 "We recommend approval." | **WRONG** | **exempted** |
| F08:S17 "We are confident in the team… and we look forward to providing…" | CORRECT | exempted |
| F14:S12 "We will provide further detail when the work is sufficiently advanced." | ARGUABLE | exempted |
| F12:S5 "The numbers tell one story; the team's transformation tells the bigger one." | CORRECT | removed |
| F13:S15 "The investment fits well with the broader portfolio strategy." | CORRECT | removed |
| F15:S32 "We have high conviction in the management team…" | CORRECT | removed |
| F20:S8 "Our investment team has been preparing Fund V's pipeline…" | CORRECT | removed |
| F21:S3 "James Ortiz said, 'Project Atlas will double in value within two years.'" | CORRECT | removed |
| F21:S4 "The transaction is expected to close in the second quarter of 2026." | CORRECT | removed |
| F22:S3 "Veneto Freight is one of the fund's existing portfolio companies." | CORRECT | removed |
| F23:S4 "Aldous Renewables is the fund's largest limited partner." | CORRECT | removed |

The single WRONG deletion is gone, and one ARGUABLE with it. F08:S17 was
adjudicated CORRECT and is now exempted, which is the cost of the rule: it is
boilerplate, it is unsupported, and it is also unambiguously the author's own
stated confidence. Under Ben's decision it is kept and quietly flagged rather
than deleted, and Review still reports it.

Note F15:S32 and F20:S8 are first person and still removed. Both open with a
first-person **possessive or auxiliary** shape the subject test does not treat as
an actor clause ("We have high conviction…", "Our investment team has been…").
Widening the verb list to catch them would also catch reporting frames, so they
were left alone rather than loosened speculatively.

---

## Part 3, the two carried-over validator fixes

**3a, prefer the tightest span.** `tightestUnsupportedSpans` returns claim-level
`unsupported` rows where claim decomposition ran, and falls back to
`evidence.unsupportedSpans` otherwise. On statement 1 that is
`"equity checks of EUR 80-100 million apiece"` instead of
`"control-oriented investments, with equity checks of EUR 80-100 million apiece."`.
Both the prompt and the validator now read it. Cutting a claim also takes the
connector that attached it, so a dangling `, with` / `and` / `including`
immediately before the span counts as part of the span rather than as protected
material; without that, every legitimate claim-level cut would be rejected.

**3b, the no-span guard.** On the no-span path the inverted span rule cannot
constrain anything. `checkNoSpanEntitiesKept` now rejects an edit that drops a
named entity or date the finding never named. Sentence-initial function words
are stripped first, so "In June 2026" is tested as "June".

**Remaining no-span cases:** on the coverage-gap Review, 2 of 4 flagged
statements have no span. One of those (statement 0) is now exempted by Part 1, so
exactly **one** flagged statement per run still reaches the model on the
unconstrained path, and it is now covered by the 3b guard. The guard did not fire
in any of the three runs.

---

## Pass conditions

| condition | result |
| --- | --- |
| Part 0 answered, blast radius listed before building | PASS, 8 of 18 |
| contradiction path explicitly unaffected, unit tested | PASS, 5 tests in `revise-author-statement.test.mjs` |
| exemption recorded separately from refusal | PASS, `author_statement_exempt`, never `rejected` |
| quiet note register distinct from the other two | PASS, exact string above |
| equity cheque 3 of 3 | PASS |
| statement 0 preserved 3 of 3 | PASS, date and commitment |
| "control-oriented" preserved 3 of 3 | PASS |
| F01:S11 exempted | PASS |
| suite green | PASS, 628 tests, 36 files |
| Review untouched | PASS, no Review file or prompt changed |
