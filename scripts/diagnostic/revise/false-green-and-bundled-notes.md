# Revise-then-review false green, and the size of bundled marker notes

Commit:
`chore(revise): diagnose the revise-then-review false green and size bundled marker notes`

Diagnostic only. No production code changes. No prompt changes.

Artefacts:

- `scripts/diagnostic/revise/false-green-and-bundled-notes.mjs`
- `scripts/diagnostic/revise/false-green-runs.json` (Part 1, six live Reviews)
- `scripts/diagnostic/revise/bundled-notes-rows.json` (Part 2, zero model calls)

---

## PART 1 VERDICT: OTHER

Neither offered explanation holds. The edit did not cause the flip, and Stage 2
is not unstable. On this draft Review returns **`supported_full` for the target
sentence on both arms, 3 of 3 and 3 of 3**, with byte-identical reasoning across
all six runs. The sentence never reaches `supported_partial` in the first place.

What is actually happening: Stage 2 classifies that sentence **`confirmed`**,
6 of 6, because the source does back the *reasons* given (track record, stable
team, operational value creation). The clause the spec is worried about —
*Partners Group was attracted to this investment* — is being read as framing
around supported material, so it never becomes a span. Statement 0 asserts the
same unsourced Partners Group involvement as a bare fact with nothing supported
wrapped around it, and it is flagged 3 of 3. Same missing fact, two different
outcomes, decided by whether the fact is attached to supported content.

So the production "false green" was not introduced by revising. The green was
already there before the edit. The reason it looked like a flip is that the
original production Review reported `supported_partial` on a **different draft
context** from the one the revised text was reviewed in — the surrounding
statement set changed when the unsupported closing sentence was deleted (6
statements on the original arm, 5 on the revised arm), but the target
sentence's own verdict never moved.

**Stage 2 noise floor on this unplanted draft: 6 of 6.** Zero variance. Every
run returned the same per-source classification, the same fingerprint
`fp_1a8e2a470b`, the same spans and the same reasoning paragraph, character for
character, on both arms and on both statements. That is the first measurement
of Stage 2 stability on an unplanted draft, and it is clean.

### Fixture note, read this before trusting the numbers

The production drafts from 2026-08-27 were **not on disk**; only
`scripts/diagnostic/eval-ablation/meridian_source_production.txt` was committed.
The two drafts were reconstructed from the run evidence and the reconstruction
is checked against the production marker offsets before Part 1 runs:

| Production marker | Reconstruction |
| --- | --- |
| CHANGED `{start:544, end:757}` | chars 544–757 of the revised draft are exactly the target sentence minus its full stop (213 chars) |
| CUT `{start:994, end:999}` | chars 994–999 are `"peers"`, the last word of the preceding sentence |

Both offsets land. That is a strong check on the reconstruction, but the
paragraphs the diagnostic supplies around the target sentence are not
guaranteed to be the user's. The verdict above is sound for this fixture; the
one thing it cannot rule out is that the production original's `supported_partial`
came from draft context that is not reproduced here.

### Per-run results

Target sentence, all six runs identical:

| Arm | Run | supportState | displayVerdict | unsupportedSpans | Stage 2 (source 0) | systemFingerprint |
| --- | --- | --- | --- | --- | --- | --- |
| original | 1 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` |
| original | 2 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` |
| original | 3 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` |
| revised | 1 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` |
| revised | 2 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` |
| revised | 3 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` |

`reasoningParagraph`, identical in all six runs:

> The source confirms the statement by highlighting Meridian Capital's strong
> track record, stable and experienced investment team, and disciplined approach
> to operational value creation. These factors align with the reasons Partners
> Group was attracted to the investment.

That last sentence is the defect in one line. Stage 2 has checked the reasons
and treated the attribution as following from them.

Statement 0, the control, all six runs identical:

| Arm | Run | supportState | displayVerdict | unsupportedSpans | Stage 2 (source 0) | systemFingerprint |
| --- | --- | --- | --- | --- | --- | --- |
| original | 1–3 | `partial` | `supported_partial` | `[{"sourceRefId":0,"statementId":"0","classification":"partially_confirmed","text":"In June 2026","start":0,"end":12}]` | `partially_confirmed` | `fp_1a8e2a470b` |
| revised | 1–3 | `partial` | `supported_partial` | same, verbatim | `partially_confirmed` | `fp_1a8e2a470b` |

> The source confirms that Meridian Capital Partners V is a EUR 1.2 billion fund
> targeting lower-mid-market buyouts in European industrial technology and
> business services. However, it does not mention Partners Group's commitment to
> the fund or specify the timing in June 2026. Please verify these missing
> details or adjust the statement accordingly.

Worth noting on its own: the reasoning names the missing Partners Group
commitment, but the only span emitted is `"In June 2026"`. The span layer is
narrower than the reasoning that produced it.

### Cheaper equivalent, considered and rejected

Running Stage 2 alone on the two statements would have cost roughly a tenth of
this. It was not taken, because `supportState`, `displayVerdict` and
`unsupportedSpans` are all produced downstream of Stage 2 by aggregation, and
those three fields are the ones the spec asks for. Stage 2 alone would have
answered the noise question and none of the verdict question. Six full Reviews
were run.

---

## PART 2: BUNDLED MARKER NOTES

Zero model calls. 25 artefact JSONs scanned in `scripts/diagnostic/revise/`,
covering the noise floor runs, the Condition A and B runs, the Suggest-after-R10
runs and both arms of the deterministic removal measure. Every artefact derives
from the same original draft constant, read back out of the script that produced
it, so the original span is recoverable via `markerSpanAlignment`
(`lib/pr9-marker-span-status.mjs:103`).

**84 removal-asserting notes.**

| Classification | Count | Fraction |
| --- | ---: | ---: |
| ACCURATE | 62 | 73.8% |
| BUNDLED | **0** | **0.0%** |
| FALSE | 9 | 10.7% |
| UNCLEAR | 13 | 15.5% |

**The fraction of removal-asserting notes that are BUNDLED is 0 of 84.**

### How a note was classified

The note convention is `<what changed> - <why>. Confirm before publishing.`, so
only the first clause is read, with reason language (`which…`, `because…`,
`to align with…`) trimmed off it. That clause is split on `and` / `;` into
conjuncts, and each conjunct is typed:

- **ADDITIONAL** — asserts a further edit (`Removed X`, or a bare noun phrase
  continuing a removal: `Removed X and Y`).
- **DISPOSITION** — restates what became of the same edit (`and replaced it
  with…`, `and retained only…`, `and recast to…`). These need no edit of their
  own in the diff.

A conjunct is then TRUE / FALSE where a quotation makes it checkable (quoted
text still present in the revised paragraph ⇒ FALSE; present before and gone
after ⇒ TRUE), otherwise UNVERIFIABLE. BUNDLED requires at least one true claim
alongside either a demonstrably false quoted claim, or more ADDITIONAL claims
than there are distinct edit operations in the word-level diff.

### Validation, because a zero count proves nothing on its own

The production note from 2026-08-27 was run through the same classifier against
the same spans:

```
note   Removed 'highly regarded' and the explicit attribution of these factors
       as the reason for Partners Group's interest, which are not supported by
       the source. Confirm before publishing.
claims ADDITIONAL "Removed 'highly regarded'"                       -> TRUE (quoted, gone)
       ADDITIONAL "the explicit attribution of these factors as the
                   reason for Partners Group's interest"            -> UNVERIFIABLE
diff   removed ["and highly regarded"], added [], editCount 1
result BUNDLED   (2 additional claims, 1 actual edit)
```

The classifier catches it. The corpus genuinely contains none of them.

### What the corpus contains instead

The 9 FALSE notes are a single repeated failure, and they are worse than
bundling. Eight of the nine are the opening-sentence note across eight separate
runs:

```
note      Removed the specific 'lead commitment' characterization and June 2025
          timing, which are not supported by the source. Confirm before publishing.
original  In June 2025, Halden Group made a lead commitment to Meridian Capital
          Partners V, a EUR 1.2 billion fund targeting lower-mid-market buyouts
          in European industrial technology and business services.
revised   In June 2025, Halden Group made a lead commitment to Meridian Capital
          Partners V, a EUR 1.2 billion fund targeting lower-mid-market buyouts
          in European industrial technology and business services.
```

Nothing was removed. Both quoted claims are still in the sentence. It recurs in
`condition-a-suggest.json`, `deterministic-removal-off-run{1,2,3}.json`,
`deterministic-removal-on-run{1,3}.json`, `reviser-noise-floor-run3.json` and
`suggest-after-r10-suggest2.json`. `applyMarkerHonestyCheck`
(`lib/pr9-marker-honesty.mjs:398`) passes every one of them, because the aligned
region does differ by the neighbouring words the span happens to overlap
(`lib/pr9-marker-honesty.mjs:441-447` compares span status, not note content).

The 13 UNCLEAR notes assert a change entirely in paraphrase, with nothing
quoted for a check to bite on:

> Removed this expectation statement because no supplied source supports a
> claim about the future depth of the relationship.

> Removed the unsupported claim that these co-investments would not otherwise
> have been available and retained only the confirmed co-investment terms.

> Softened the unsupported forward-looking expectation to a more neutral
> formulation about the ongoing relationship.

Note the second one: it is word for word a note that is quoted elsewhere in the
corpus, minus the quotation marks. Whether a note is checkable at all is itself
a coin flip on the model's punctuation.

---

## PART 3: OPTIONS

### A. Deterministic quoted-claim check

Where a note quotes removed text, assert the quoted string is absent from the
revised span.

**It would catch 0 of the BUNDLED notes**, including the production one. In the
production case the quoted claim (`'highly regarded'`) is the claim that is
**true**; the false claim is the unquoted one. Bundling survives precisely
because the model quotes the edit it did make and paraphrases the one it did
not.

It is not worthless: it catches **8 of the 9 FALSE notes** in this corpus, which
is a live and repeated defect that ships today, and it is cheap and
deterministic. But it does not address bundling, which is what the spec asked
about.

### B. Code writes the what, model writes the why

Generate the note's statement of what changed from the actual diff; the model
supplies only the reason.

This already exists for one path. `buildDeterministicUnsupportedRemovalCutNote`
(`lib/pr9-deterministic-unsupported-removal.mjs:44`, called at `:836`) writes
`Removed this sentence: "<verbatim>" No supplied source backs that claim.` from
code, with no model involvement in the "what". Extending the same idea to
CHANGED and CUT markers makes bundling, false notes and unclear notes
structurally impossible in one move: 22 of 84 notes here (the 9 FALSE plus the
13 UNCLEAR) become non-events, and the BUNDLED class cannot occur at all.

What it breaks, and the scale of it:

1. **Note quality on multi-part edits.** 62 notes are currently ACCURATE, and
   many read better than a diff would. `Removed the unsupported 'top quartile of
   European lower-mid-market managers' ranking and retained only the supported
   performance data` is more useful to a reviewer than `changed "exits, placing
   it in the top quartile of European lower-mid-market managers." to "exits."`.
   Mitigated by keeping the model's reason clause and only replacing the what.
2. **Note length.** Diff-generated whats quote both sides, so notes get longer.
   The existing cut note truncates at 200 characters with an ellipsis; the same
   cap applies.
3. **Prompt and parser contract.** The reviser currently emits the full note
   inline. Splitting it into what + why means either a prompt change (out of
   scope here) or discarding the model's what after parsing, which is the
   cheaper route and needs no prompt edit. `normalizeMarkerNoteText`
   (`lib/build-revision-prompt.mjs:816`) and the canonical closer at `:792`
   already normalise the assembled string, so the join point exists.
4. **Honesty repairs.** `rewriteHonestyNote` (`lib/pr9-marker-honesty.mjs:292`)
   rewrites the first clause on contradiction and keeps the reason. That is the
   same what/why split, so the two mechanisms compose rather than conflict.

### C. What else the data shows

**C1. The span layer under-reports its own reasoning.** Statement 0's reasoning
names the unsourced Partners Group commitment; the only span emitted is the date
`"In June 2026"`. A reviewer reading spans alone sees a date quibble, not a
missing party. This is a bigger user-facing hole than bundling and it is
reproducible 6 of 6.

**C2. Stage 2 treats an unsourced attribution as framing when it is attached to
supported reasons.** Part 1's reasoning paragraph says so explicitly. This is
the actual cause of the reported false green, it is stable rather than noisy,
and it is a Stage 2 classification question, not a Suggest question. Sizing only;
no fix proposed here.

**C3. Repetition across runs is the strongest signal available.** The same false
note appears in 8 of 8 runs that touched that sentence. Any per-note check runs
against a defect that is deterministic, not occasional, so a fix will show up
immediately in the existing measures.

### Recommendation

**Do B, scoped to the "what" clause only, and take A as the interim.**

Reason: A is the smaller change and fixes the larger *measured* problem — 8 of 9
FALSE notes, shipping today — but it provably does nothing for bundling, 0 of 1
known cases. B removes bundling, false notes and unclear notes as categories
rather than detecting them, it needs no prompt change if the model's what is
discarded after parsing, and the pattern is already proven in production on the
deterministic removal path. The cost is prose quality on the 62 currently
accurate notes, which is recoverable by keeping the model's reason clause.

No model-based verifier is proposed. That design was measured and killed at
`81ab427`.

---

## Cost

| Item | Cost |
| --- | ---: |
| Part 1, six live Reviews (run twice: the first pass did not capture per-source Stage 2 detail) | about $1.20 |
| Part 2, 25 artefacts, zero model calls | $0.00 |
| Part 3 | $0.00 |
| **Total** | **about $1.20** |

---

## Summary

**Technical.** Added `scripts/diagnostic/revise/false-green-and-bundled-notes.mjs`,
a two-part diagnostic. Part 1 reconstructs the 2026-08-27 production drafts from
the run's marker offsets (both `{544,757}` and `{994,999}` verified against the
reconstruction) and runs six live Reviews, three per arm, against the production
`/api/analyse-statements`. Part 2 imports `markerSpanAlignment` and classifies
every removal-asserting marker note across 25 on-disk Suggest artefacts as
ACCURATE / BUNDLED / FALSE / UNCLEAR with zero model calls, validated against the
known production bundled note. Outputs `false-green-runs.json` and
`bundled-notes-rows.json`. No production code or prompt files touched.

**Plain language.** The "false green" was not caused by the revision and is not
random: Review calls that sentence fully supported both before and after the
edit, every single time, because it accepts the unsourced claim that Partners
Group was attracted to the deal as long as the reasons given are in the source.
Separately, the note-bundling problem turns out to be rare — none of the 84 notes
on file bundle a real edit with an imaginary one — but 9 notes claim to have
removed text that is still sitting in the draft, which is the more serious
version of the same failure and is invisible to the checks in place today.
