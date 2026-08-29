# The author-anchor fix against the full graded corpus

Corpus: 29 cases, 296 statements, 360 statement–source pairs.
Stage 2 model `openai/gpt-4o-2024-08-06`, seed 1, cache off, prompt `stage2_v4.md`
sha `44847c61b07b` — byte-identical to the baseline's R10 prompt, so the prompt is
not a variable.
Harness `anchor-fix-corpus.mjs`, raw data `anchor-fix-corpus.json`.
**Cost $3.39** against a $5.00 ceiling.

---

## PART 2 COUNTS: 2 WRONG, 0 CORRECT

Every statement the fix moves towards supported is a false green. There are no
correct ones to weigh against them.

| | count |
| --- | ---: |
| moved towards supported, **CORRECT** | **0** |
| moved towards supported, **WRONG (false green)** | **2** |
| moved away from supported, correct tightening | 1 |
| moved away from supported, **new false red** | 2 |
| total statements the fix moves, of 296 | 5 |

**The baseline is not promoted.** Part 4 stops on any WRONG, and there are two.

The fix as shipped at b55ab00 should be narrowed before it is relied on. It is
not a wide fault — five statements in 296 — but the two it gets wrong are exactly
the case the corpus keeps a planted adversarial fixture for, and one of them is
reachable in the live pipeline today.

---

## The two false greens

Both are **F05**, whose source is a competitor's press release. The case exists to
catch a draft claiming someone else's transaction as its own. Configured
authoring organisation: Halden Group.

### F05:S0 — WRONG

> **Statement.** "Halden Group has agreed to acquire Norwell Aerospace Components,
> a leading manufacturer of structural composite components and titanium machined
> parts, **from Westhaven Capital**."

> **Deciding source line.** "**Westhaven Capital** agrees to acquire Norwell
> Aerospace Components **from Bridgepoint**."

The draft is wrong twice over: Westhaven is the acquirer, not Halden, and
Bridgepoint is the seller, not Westhaven. Before the fix, the anchor was "Halden
Group", absent from the source, and the core proposition could not confirm — the
author's-name anchor was accidentally doing the right thing. After the fix the
anchor skips Halden and lands on "Norwell Aerospace Components", which **is** in
the passage, alongside the relation "acquire". The core proposition confirms.

**Reachability: latent, not live.** Stage 2 independently classifies this
`conflicting` on both the baseline and today's run, and the relevance gate only
consults the core-proposition check on `partial_support`. So a second line of
defence is currently holding. That defence is a model judgement, not a guarantee;
if Stage 2 ever returned partial here, the anchor gate would wave it through.

### F05:S7 — WRONG, and live

> **Statement.** "Halden Group will support continued growth in commercial
> aerospace and an accelerated expansion of Norwell's space applications business…"

> **Deciding source line.** "**We** are excited to partner with the Norwell
> management team **to support continued growth** and capability expansion…" —
> spoken by Margaret Yu, Co-Head of **Westhaven's** Industrials Strategy.

The source's "we" is Westhaven. The draft attributes Westhaven's stated intention
to Halden Group. After the fix the anchor becomes "Norwell", present in the
passage, and the relation "support" matches, so the core proposition confirms and
the excerpt becomes display-eligible.

**Reachability: live.** Stage 2 classifies this `partially_confirmed` on both the
baseline and today's run, which routes to `partial_support` — precisely the branch
the anchor gate governs. Nothing else catches it. **This is a live false green.**

---

## The three movements away from supported

The spec asked only about movements towards supported. These are reported because
two of them are also wrong, in the other direction, and they bear on the
narrowing.

### F02:S6 — new false red

> **Statement.** "Partners Group will reinvest alongside CPP Investments and
> Equinix and retain up to 10% of the Company going forward."

> **Source.** "As a result, Partners Group has committed to reinvest and acquire
> up to 10% of the Company."

The source supports the core proposition. With Partners Group as the author the
anchor skips to "CPP Investments", which the passage does not mention, and
confirmation is refused. A supported statement stops confirming.

### F03:S5 — new false red, and the more structural of the two

> **Statement.** "Partners Group's investment will support continued growth
> through increased waste volumes, the acquisition of additional biomethane
> plants, and operational improvements."

> **Source.** "…Partners Group will support management and Suma Capital on
> implementing value creation initiatives. These initiatives include increasing
> waste volumes, acquiring new biomethane plants, and introducing operational
> efficiencies."

About as well corroborated as a statement gets. The only name in it is the
author's, so skipping the author leaves **no anchor at all** and confirmation
becomes impossible.

b55ab00 recorded this behaviour as correct — "where the author is the only name
there is still no external anchor". F03:S5 is the cost of that choice, and it is
higher than it looked on a three-row probe: a client's statement about its own
action, explicitly corroborated by the source, can no longer confirm.

### F21:S0 — correct tightening

> **Statement.** "Meridian Capital has agreed to acquire Project Atlas, a Nordic
> battery storage platform."

> **Source.** "Meridian Capital acquires **NordVolt Storage**."

Different target company. Anchoring on the firm name confirmed it; anchoring on
"Project Atlas" correctly does not. The fix helps here — though only in the
hypothetical where Meridian is the authoring organisation, which in this case it
is not.

---

## Proposed narrowing, not implemented

The fix's premise holds where the author is **incidental** to the checkable
proposition, and fails where the author is **the actor in it**. F03:S5 shows it
also fails when the author is the only name present.

**Recommended: narrow by whether the source attributes the relation to a
different named actor.** Skip the author when choosing the anchor, as now, but
refuse confirmation when the passage names a *different* organisation performing
the anchored relation. This kills both false greens — the F05 passages both name
Westhaven doing the acquiring and the supporting — while leaving the b55ab00 probe
and F21 untouched, since neither passage names a competing actor.

**Also needed, for the false reds: do not drop the anchor entirely.** Where the
author is the only name in the statement, fall back to the author as anchor rather
than returning no anchor. That restores F03:S5 and costs nothing, because a
passage that does mention the client is genuine corroboration of the client's own
action.

**Alternative, stricter and simpler: only skip the author when it is not the
grammatical subject.** This kills F05 cleanly, since Halden Group is the subject
of both sentences. It is easier to reason about but harder to implement reliably,
and it would not restore F02:S6.

I would take the first two together. Neither is made here: this spec is diagnostic,
and the change alters what counts as supported, which is not a decision to slip
into a measurement commit.

---

## PART 1: the corpus run, and how fix and drift were separated

### The method

The spec proposed re-running the moved statements with the fix disabled. There is
a cleaner separation available, because of where the fix sits.

`corePropositionConfirmed` runs **downstream of the Stage 2 model call**. Stage 2
takes a statement and a source and returns a classification and a passage; the
anchor fix then runs over that passage inside the relevance and authority gates.
**The fix therefore cannot change a Stage 2 classification.** That splits the two
exactly rather than statistically:

- every Stage 2 classification movement against the baseline is **drift**, by
  construction
- the fix's own effect is **deterministic**, so it is replayed with the fix on and
  off at zero cost and with no model variance at all

Toggling the fix needed no code change. `corroborationAnchor` skips a name only
when `isAuthoringOrganisationName` says so, and that returns false for everything
when no organisation is configured — the default is `null`. Unsetting
`AUTHORING_ORGANISATION` reproduces the pre-fix behaviour exactly.

The fix was replayed against **15 candidate organisations** — every firm name the
corpus plausibly writes as, not just the one in `.env.local` — so the five
movements are the fix's widest blast radius, not one client's slice.

### Verdict movement

| | count | of 360 |
| --- | ---: | ---: |
| Stage 2 classifications moved (all drift) | **20** | 5.6% |
| — towards supported | 10 | |
| — away from supported | 10 | |
| — lateral | 0 | |
| statements moved by the fix | **5** | 1.4% |
| — towards supported | 2 | |
| — away from supported | 3 | |

Drift is symmetric: ten each way, no net direction. Cases affected are spread
across nordholt-dirty, supersession, F01, F04, F08, F15, F18, F19, F20, F22 and
F23; no case moved more than three of its statements.

**The fix's five movements are identical whether replayed against the baseline's
2024-era passages or today's freshly generated ones.** That is a useful control:
the finding is a property of the fix, not of which passage the model happened to
return.

### Fingerprints

| | fingerprints |
| --- | --- |
| committed baseline | `fp_17e3c4f467`, `fp_64d0f9e03c`, `fp_684acb85fd` |
| this run | `fp_1a8e2a470b`, `fp_c9a0e786b8`, `fp_ffd8308b42` |

The baseline straddles three configurations and **none of them is serving today** —
all three of today's are new. That confirms the second reason for the run, and it
is why 5.6% drift on an unchanged prompt is unsurprising. Note that a single run
still spans three fingerprints concurrently, so "the current configuration" is
itself a set rather than a point.

---

## PART 3: the guard

`tests/author-name-blindness-guard.test.mjs`. A file under `lib/` containing a
regex that classifies text by Title-Case or proper-noun shape must either call
`isAuthoringOrganisationName` / `resolveAuthoringOrganisationName`, or carry a
comment beginning `AUTHOR-NAME-BLIND:` explaining why treating the author like any
other name is right there.

Kept deliberately blunt so it does not become a nuisance: file-level scope,
comment lines ignored, and a second test asserting the matcher actually fires, so
the guard cannot quietly rot into decoration. The declaration is a sentence rather
than a bare marker — the point is to make the next person write down the reasoning
that was missing the first six times.

**It flags nothing on the current tree.** Four files needed attention:

| file | resolution |
| --- | --- |
| `revise-flag-register.mjs` | already author-aware, via `resolveAuthoringOrganisationName` |
| `qc/claim-spans.mjs` | declared name-blind: anchors are checkable things, not outside parties |
| `revise-stage1.mjs` | declared name-blind for `ENTITY_RE` (protects against *losing* a name); `PROPER_NOUN_RE` is author-aware by parameter |
| `canonicalClaims.js` | declared name-blind, newly adjudicated below |

### canonicalClaims.js, adjudicated

Not covered by the b55ab00 sweep. `entityHints.company` is a **symmetric merge
key**: two claims with different companies are not deduplicated into one. It never
decides support, relevance or a verdict. The author is a legitimate subject of its
own claims ("Partners Group committed EUR 100m"), so excluding its name would make
the key less discriminating rather than more correct, and first-person pronouns are
already dropped by `isJunkEntityToken`. **Name-blind by design.** That brings the
adjudicated total to nine sites.

---

## PART 4: baseline NOT promoted

Two WRONG, so promotion is withheld and `fingerprint-manifest.json` is unchanged.
Promoting now would fix today's configuration as the reference while the code
contains a defect that must change, and the next run would be measured against a
baseline nobody wants to keep.

The run is committed as `anchor-fix-corpus.json` so it can be promoted without
being re-paid for, once the narrowing lands and the two F05 statements come back
red.

---

## What to do next

1. **Narrow the anchor fix** as proposed above: refuse confirmation when the
   passage attributes the anchored relation to a different named actor, and fall
   back to the author as anchor when it is the only name present.
2. **Re-run this harness.** It costs $3.39 and takes about two and a half minutes.
   Pass condition: F05:S0 and F05:S7 do not move towards supported, and F02:S6 and
   F03:S5 stop moving away from it.
3. **Then promote the baseline**, on one configuration rather than three.

The wider point is that b55ab00 was validated on 4 artefacts and 36 statements and
looked clean. The graded corpus found two false greens and two false reds in it.
The corpus is worth its $3.39.

---

## Changes

- `tests/author-name-blindness-guard.test.mjs`: the Part 3 guard.
- `AUTHOR-NAME-BLIND:` declarations in `lib/qc/claim-spans.mjs`,
  `lib/revise-stage1.mjs` and `lib/canonicalClaims.js`. Comments only; no
  behaviour changes anywhere.
- `scripts/diagnostic/anchor-fix-corpus.mjs` and its report and raw data.

No production behaviour changed by this spec. Suite: 765 passing.
