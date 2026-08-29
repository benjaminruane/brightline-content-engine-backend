# Narrowing the author-anchor fix

**Cost $5.84** across two paid corpus runs of $3.04 and $2.80. The spec budgeted
one run at $3.39; the first run surfaced a defect in the narrowing that the free
replay had not, so it was fixed and re-run. Everything between the two runs was
measured on the zero-cost replay.

Suite green, 774 passing.

---

## The five named statements

| | before | now | |
| --- | --- | --- | --- |
| **F05:S7** live false green | confirmed | **refused** | fixed |
| **F05:S0** latent false green | confirmed | **refused** | fixed |
| **F03:S5** false red | refused | **confirmed** | fixed |
| **F21:S0** correct tightening | refused | refused | kept |
| **F02:S6** false red | refused | refused | **still wrong**, reason below |

Corpus-wide, the fix now moves **2 statements of 296**, both away from supported,
and **zero towards supported anywhere**. That was the pass condition that mattered
and it is met. The b55ab00 probe that motivated the original fix still confirms.

---

## PART 0, answered before building

### (a) Where the anchor is chosen, and where the actor test sits

`corroborationAnchor` at `lib/qc/evidence-relationship.mjs:185–191`, called from
`corePropositionConfirmed` at line 202, with the presence gate at 203–204.

The actor test cannot sit there. It needs to know *which* relation was matched,
and that is not computed until the overlap at line 215. It therefore sits after
`if (!overlap) return false` and before the confirming return — the last gate
before the function says yes.

### (b) What is available to identify a different actor

The relation is **already extracted**: `relationInStmt` and `relationInExcerpt`
are `FACTUAL_RELATION_PHRASES` found in each text. Named entities come from the
existing `ANCHOR_ENTITY_RE`. Both sides of "a different named actor performing the
anchored relation" are therefore already in hand. **No model call was added.**

### (c) F02:S6 — answered before building, and confirmed after

**No, the narrowing does not recover it.** Neither rule can:

- rule 1 only ever *refuses* more, so it cannot restore a confirmation
- rule 2 applies only where the author is the only name, and F02:S6 names three
  others

The real cause is a third thing entirely. The statement is "Partners Group will
reinvest alongside **CPP Investments** and **Equinix**…", and `ANCHOR_ENTITY_RE`
requires a lowercase letter after the capital, so the all-caps "CPP" does not
match and the anchor becomes the bare word **"Investments"**. The passage does not
contain it, so confirmation is refused. The anchor is not a company at all; it is a
fragment of one.

**Proposed third rule, not implemented and not bundled in.** Try each candidate
anchor in turn and confirm if *any* of them is corroborated, rather than betting
everything on the first. That recovers F02:S6, since the passage does name Partners
Group. It is not included here because it would also **lose F21:S0**: that statement
names both Meridian Capital and Project Atlas, the passage names Meridian, and
"any anchor" would confirm a statement whose target company is wrong. Recovering
one false red by reintroducing a false green is a bad trade, and it would breach
this spec's own pass condition. The narrower repair — teach `ANCHOR_ENTITY_RE` to
carry all-caps tokens like "CPP" so the anchor is "CPP Investments" — is worth
doing on its own and touches anchor selection for every statement, so it wants its
own measured change.

### (d) What else would make this wrong

Four things, all of which did.

1. **The rule is unanswerable without an author.** It asks whether an actor is
   somebody *other than* the author. Run with no `AUTHORING_ORGANISATION`, it read
   every "we" as a stranger. It is now inert when none is configured, so
   unconfigured tenants see no change.
2. **An unquoted "we" is the normal case, not the exception.** The first cut
   refused a statement whenever the excerpt said "we" without naming the author —
   which is how essentially every internal memo reads. This produced **476
   movements**, almost all false reds on clients' own documents.
3. **"Before the relation" is not "the subject".** Scanning every name preceding
   the verb read the target company out of a headline, and an outgoing CEO, as
   rival actors. Only the nearest preceding multi-word name is considered now.
4. **The anchor is sometimes not a name.** "We", "The", "Second" and "Product" all
   match the Title-Case shape. Harmless while the anchor was only tested for
   presence; fatal once real names are compared against it, since every one of them
   becomes a rival. The actor test now stands down unless the anchor is plausible.

A fifth, found during measurement: the confirmation overlap matches relation
phrases by **substring**, so `"establish"` pairs with `"is"` — the letters are
there. Fine for asking whether two texts discuss the same thing; for asking who
performed a specific act it invents a relation and then finds a stranger performing
it. The actor test uses exact phrase equality instead.

---

## PART 1: what was built

Two rules in `lib/qc/evidence-relationship.mjs`, both deterministic, no model call.

**1. Different-actor refusal.** The author is still skipped when choosing an
anchor. Confirmation is now refused when the excerpt credits the anchored relation
to somebody who is neither the anchor nor the author. Two shapes:

- a **named** organisation in subject position — the nearest multi-word name
  before the relation. This is what catches F05:S0: *"Westhaven Capital agrees to
  acquire Norwell Aerospace Components from Bridgepoint"*, where Westhaven precedes
  the verb and Bridgepoint trails it.
- a **quoted** first-person claim in an excerpt that never names the author. This
  is what catches F05:S7, and it needs saying that the spec's premise was wrong
  here: it states "both F05 passages name Westhaven doing the acquiring and the
  supporting". S0's does. **S7's passage names no organisation at all** — it is
  *"We are excited to partner with the Norwell management team to support continued
  growth…"*, and the attribution to Westhaven's Margaret Yu sits outside the
  excerpt the matcher receives. A named-actor test alone would have missed the one
  live false green completely.

  The quotation marks, not the "we", carry the signal. Press releases put speech in
  quotes and attribute it to a named speaker; internal memos say "we" in running
  prose. Distinguishing the two is the difference between catching F05:S7 and
  refusing several hundred supported statements.

Guards, each earned by a measured failure: inert with no organisation configured;
inert when the anchor is not a plausible name; exact relation equality; nearest
preceding name only; single-word actors ignored, since "Leveraging" and "These"
have the same shape as "Bridgepoint". The last one misses rather than over-fires,
deliberately — a missed refusal leaves an existing behaviour in place, an
over-refusal destroys real support.

**2. Author fallback.** Where the author is the only name, it becomes the anchor
rather than there being none. A source that does name the client corroborates the
client's own action, and refusing to look is not caution, it is a wrong answer.
This recovers F03:S5.

The stricter grammatical-subject alternative was not implemented, as instructed.

---

## PART 2: the corpus re-run

29 cases, 296 statements, 360 pairs. Stage 2 `gpt-4o-2024-08-06`, seed 1, cache
off, prompt sha `44847c61b07b`. Harness `anchor-fix-corpus.mjs` unchanged.

### Fix versus drift, same method as before

The fix runs **downstream of the Stage 2 model call**, so it cannot change a
classification. Every classification movement is therefore drift by construction,
and the fix's own effect is replayed deterministically by toggling
`AUTHORING_ORGANISATION`, across all 15 firm names the corpus plausibly writes as.

| | count | of 360 |
| --- | ---: | ---: |
| Stage 2 classifications moved (all drift) | 19 | 5.3% |
| — towards supported | 8 | |
| — away from supported | 11 | |
| — lateral | 0 | |
| **moved by the fix** | **2** | **0.6%** |
| — **towards supported** | **0** | |
| — away from supported | 2 | |

Drift is in the same band as the previous run (20, then 19) and stays roughly
symmetric. Cases involved: nordholt-clean, nordholt-dirty, F01, F04, F08, F09,
F15, F18, F19, F20, F22, F23.

The fix's two movements are identical on the baseline's passages and on today's
freshly generated ones, the same control as before: the result is a property of
the fix, not of which passage the model returned.

### The full fix movement table

| statement | organisation | direction | verdict |
| --- | --- | --- | --- |
| F02:S6 | Partners Group | away from supported | **still wrong**, anchor is the fragment "Investments" |
| F21:S0 | Meridian Capital | away from supported | correct, the statement names the wrong target company |

Every other statement in the corpus, under every candidate organisation, is
unmoved. **Zero towards supported.**

### What the first run caught

The first paid run reported **six** new towards-supported movements — F03:S1,
F10:S0, F08:S0, F08:S2, F15:S0, F15:S2. On reading the sources, none was a false
green: all six are genuinely supported statements, several from a client's own IC
memo corroborated by its own source. They were appearing because the *comparison
arm* had regressed: with no organisation configured, the new rule refused them, so
configuring one looked like an improvement. Running 296 statements is what made
that visible, and it is the reason the run was worth repeating.

---

## PART 3: baseline promoted

Zero statements move wrongly towards supported, so this run is promoted in
`scripts/diagnostic/fingerprint-manifest.json` under `corpusBaseline`.

```
model      openai/gpt-4o-2024-08-06
promptSha  44847c61b07b…
scope      29 cases, 296 statements, 360 pairs
```

**The baseline is a set of three fingerprints, not one:** `fp_1a8e2a470b`,
`fp_c9a0e786b8`, `fp_ffd8308b42`. A single run of 360 calls spans all three
concurrently — OpenAI serves one logical model from several backends, and which
one answers is not ours to choose.

What that means for future comparisons:

- **A fingerprint appearing in a later run that is not in this set is a real
  configuration change** and worth investigating. A different mix of these three
  is not.
- **A movement is not attributable to a fingerprint.** Each statement is called
  once, so its fingerprint is a sample of one; a statement that moves may simply
  have landed on a different backend. Per-fingerprint attribution would need the
  same statement run against each, which this harness does not do.
- **Expect roughly 5% drift on a re-run with nothing changed.** Two runs on
  identical code gave 20 and 19 movements. Treat anything in that band as noise
  and look at direction and clustering rather than the count.

---

## Environment, with its source

| value | where it was read | |
| --- | --- | --- |
| `Halden Group` | `.env.local` line 2, **a local file** | not production |
| `Partners Group` | **Vercel dashboard, checked by Ben** | production |

I could not verify the production value myself: there is no Vercel CLI on this
machine and no other read path to the deployment from here. It is reported on your
authority, not mine. The previous report's claim that production was "Halden Group"
was a local file misread as the deployment, and that error is what made the impact
look hypothetical when it was live.

The consequence stands as the spec states: b55ab00 has been active on real Partners
Group drafts since it deployed, and F02:S6 and F03:S5 were live false reds on that
client's own statements. F03:S5 is fixed by this change. **F02:S6 is not**, so one
live false red on Partners Group statements of that shape remains until the anchor
tokenisation is repaired.

One thing worth flagging separately: `isAuthoringOrganisationName` resolves from
the **environment variable**, not the per-request `authoringOrganisation` that
`api/analyse-statements.js` already parses. Every tenant on a deployment therefore
shares one author identity. That is invisible while one client is served per
deployment and wrong the moment that stops being true.

---

## What is left

1. **F02:S6.** Teach `ANCHOR_ENTITY_RE` to carry all-caps tokens so "CPP
   Investments" is one name rather than the fragment "Investments". Small, but it
   changes anchor selection for every statement, so it needs its own corpus run.
2. **The per-request author.** Thread the request value into
   `isAuthoringOrganisationName` instead of reading the environment.
3. **A person as a rival actor.** The named-actor branch cannot tell an
   organisation from a person. Nothing in the corpus trips on it now, but the
   distinction is not being made.

---

## Changes

- `lib/qc/evidence-relationship.mjs`: author fallback in `corroborationAnchor`;
  new `excerptCreditsADifferentActor` gate before the confirming return, with
  `quotedFirstPersonBelongsToSomeoneElse`, `isPlausibleEntityName` and
  `excerptNamesTheAuthor` supporting it; exact relation equality for the actor test.
- `tests/evidence-relationship-author-anchor.test.mjs`: nine tests, one per rule and
  one per guard, each naming the corpus case that earned it.
- `scripts/diagnostic/fingerprint-manifest.json`: `corpusBaseline` promoted.
- `scripts/diagnostic/anchor-fix-corpus.json`: the promoted run.

Suite: 774 passing.
