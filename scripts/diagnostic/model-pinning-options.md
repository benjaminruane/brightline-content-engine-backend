# What can we pin, and to what

**Part 2 executed on Ben's approval.** All three models are now pinned to dated
snapshots in `lib/qc/model-config.mjs`. See "Part 2, as executed" at the end.

Cost: **under one cent** (~$0.006). `GET /v1/models` is free; six one-shot
completions were used — three to resolve what each alias serves, three to
verify the pinned strings work.

Every model string below came from the provider on 2026-08-28, queried with the
production key by `scripts/diagnostic/list-model-snapshots.mjs`. Raw output is
in `scripts/diagnostic/model-snapshots.json`. Nothing here is from memory.

---

## Recommendation

| Alias in use | Serves today (probed) | **Pinned to** | Behaviour change | Deprecation status | Shutdown date |
|---|---|---|---|---|---|
| `gpt-4o` — Stage 2 + 7 stages | `gpt-4o-2024-08-06` | **`gpt-4o-2024-08-06`** | **None. Identical string.** | Not deprecated | **None announced** |
| `gpt-4o-mini` — extraction, judges | `gpt-4o-mini-2024-07-18` | **`gpt-4o-mini-2024-07-18`** | **None. Only snapshot.** | Not deprecated | **None announced** |
| `gpt-5.1` — the reviser | `gpt-5.1-2025-11-13` | **`gpt-5.1-2025-11-13`** | **None. Only snapshot.** | Not deprecated | **None announced** |

### Every snapshot available, with its retirement date

Not just the chosen ones. Dates are OpenAI's published direct-API deprecations,
checked 2026-08-28; the API itself publishes none.

| Snapshot | Created | Deprecation status | Shutdown date | Replacement named |
|---|---|---|---|---|
| `gpt-4o-2024-05-13` | 2024-05-10 | **Deprecated** | **2026-10-23** — under 2 months | `gpt-5.6-sol` |
| **`gpt-4o-2024-08-06`** ← pinned | 2024-08-04 | Not deprecated | None announced | — |
| `gpt-4o-2024-11-20` | 2025-02-12 | Not deprecated | None announced | — |
| **`gpt-4o-mini-2024-07-18`** ← pinned | 2024-07-16 | Not deprecated | None announced | — |
| **`gpt-5.1-2025-11-13`** ← pinned | 2025-11-10 | Not deprecated | None announced | — |
| `gpt-5.1-chat-latest` (not used) | 2025-11-07 | Deprecated | 2026-07-23 — already passed | `gpt-5.6-sol` |
| `gpt-5.1-codex` (not used) | 2025-11-12 | Deprecated | 2026-07-23 — already passed | `gpt-5.6-sol` |
| `gpt-5.1-codex-mini` (not used) | 2025-11-13 | Deprecated | 2026-07-23 — already passed | `gpt-5.6-terra` |
| `gpt-5.1-codex-max` (not used) | 2025-11-20 | Deprecated | 2026-07-23 — already passed | `gpt-5.6-sol` |

**None of the three snapshots we pinned has a shutdown date.** The only `gpt-4o`
snapshot with one is `2024-05-13`, which we deliberately avoided.

---

## Would pinning have prevented the 2026-08-27 incident?

**Almost certainly not.** This is the honest answer and it matters, because it
sets expectations for what the pin buys.

First, what we cannot do: **determine it directly.** No artefact recorded the
resolved snapshot. The Stage 2 cache rows store `systemFingerprint` but no
model field, and Langfuse records the *requested* string (`gpt-4o`), not what
the provider routed it to. The one input that would settle this was never
captured — the same gap the whole drift investigation has been about.

What the evidence supports:

- The alias resolves to `gpt-4o-2024-08-06` today, proven by probe.
- The newer `gpt-4o-2024-11-20` has existed since 2025-02-12, eighteen months
  before the incident, and the alias is **not** pointed at it.
- Aliases do not roll backwards. For production on 2026-08-27 to have been on a
  different snapshot, the alias would have had to move from something else to
  the older `2024-08-06` afterwards. That does not happen.

So production on 2026-08-27 was, in all likelihood, already running
`gpt-4o-2024-08-06` — the exact string now pinned. The fingerprint moved from
`fp_17e3c4f467` to `fp_1a8e2a470b` (and the probe today gives a third,
`fp_1812855600`) **within one snapshot**.

**The conclusion: that incident was serving-side variation inside a snapshot,
not a snapshot promotion, and pinning would not have stopped it.** Pinning
closes a different door — the one that has not blown open yet.

That does not make the pin wasted. Snapshot promotion is the failure mode that
would move verdicts *furthest*, it is entirely silent, and it is now closed for
the price of zero behaviour change. But nobody should read the pin as
delivering run-to-run determinism, because the thing that actually bit us on
2026-08-27 is still live and still only detectable by the drift alarm.

All three pins are **behaviour-neutral today**: each one names the exact
snapshot the alias already routes to, proven by probe rather than assumed. No
re-baselining is implied by the pin itself. It is a lock on what we already
have, not a move to something new.

---

## What the provider actually returned

124 models are visible to the production key. Filtering to the three families:

### `gpt-4o` — the Stage 2 model

| Snapshot | Created | Announced shutdown |
|---|---|---|
| `gpt-4o-2024-05-13` | 2024-05-10 | **2026-10-23** — under two months away |
| **`gpt-4o-2024-08-06`** | 2024-08-04 | none announced |
| `gpt-4o-2024-11-20` | 2025-02-12 | none announced |

**The alias resolves to `gpt-4o-2024-08-06`.** This is the single most useful
fact in the report, and it is not the obvious one: the alias does *not* point
at the newest snapshot. `gpt-4o-2024-11-20` exists and is nine months newer,
but nothing is routed to it.

That makes the choice easy. Pinning to `2024-08-06` changes nothing today.
Pinning to `2024-11-20` would be a live model change requiring a full
re-baseline, for no stated benefit. Pinning to `2024-05-13` would buy a hard
outage on 23 October 2026.

### `gpt-4o-mini`

| Snapshot | Created | Announced shutdown |
|---|---|---|
| **`gpt-4o-mini-2024-07-18`** | 2024-07-16 | none announced |

One snapshot only, and the alias resolves to it. The other fourteen
`gpt-4o-mini-*` ids visible to the key are separate products — `search-preview`,
`transcribe`, `tts` — not snapshots of this model, and none is a candidate.

### `gpt-5.1` — the reviser

| Snapshot | Created | Announced shutdown |
|---|---|---|
| **`gpt-5.1-2025-11-13`** | 2025-11-10 | none announced |

One snapshot, and the alias resolves to it. The sibling variants
`gpt-5.1-chat-latest`, `gpt-5.1-codex`, `gpt-5.1-codex-mini` and
`gpt-5.1-codex-max` were all given a shutdown date of **2026-07-23**, which has
already passed, though they still appear in the models list. The base
`gpt-5.1` we use is not on any deprecation list.

Two cautions follow from that. Presence in `/v1/models` is not evidence a model
is healthy or supported — retired ids linger. And the `5.1` family is already
being thinned around the edges, so the base model's turn will come.

---

## How alias resolution was determined

The spec was right to warn against inferring it. The `/v1/models` endpoint does
**not** say what an alias resolves to — it lists the alias and the snapshots as
independent entries with no link between them.

Resolution was obtained by sending a one-token completion to each alias and
reading the `model` field the provider echoes back in the response, which names
the concrete snapshot that served the request. That is the provider stating its
own routing, not an inference.

The system fingerprint was captured alongside and deliberately **not** used for
this. The probe on `gpt-4o` returned `fp_1812855600`, which matches neither the
production incident's `fp_17e3c4f467` nor the diagnostic's `fp_1a8e2a470b` —
all three on the same `gpt-4o-2024-08-06` snapshot. Fingerprint and snapshot are
different identifiers at different granularity, and one does not give you the
other.

**This also answers the open question from `1853279`:** `gpt-5.1` returns **no
`system_fingerprint` at all**. The reviser drift check added last commit will
therefore stay permanently silent — correctly so, since it reports absence as
absence, but it means Suggest has no drift signal available on that path.

---

## Deprecation and retirement, and what happens if nobody acts

The API itself returns **no deprecation metadata** — no `deprecated`,
`retirement` or `sunset` field on any model object. The dates below come from
OpenAI's published deprecations page for the direct API.

One thing to keep separate: most retirement schedules findable online are
**Azure OpenAI's**, and Azure has aggressive dates for `gpt-4o-2024-08-06`
(Standard deployments retired 2026-03-31). **Those do not apply to us.** This
app calls `api.openai.com` directly. On the direct API, `gpt-4o-2024-08-06` has
no announced shutdown at all.

OpenAI's stated notice policy for the direct API: **at least 6 months** for
generally available models, by email to active users and on the deprecations
page. All three recommended snapshots are GA, so all three carry that guarantee.

**What happens on the retirement date if nobody acts, per model:** for all
three, once a shutdown date arrives, a request naming that snapshot fails with
a model-not-found error. Not a silent fallback — a hard, immediate, total
failure of Review or Suggest on every request until someone changes the string.
No date is currently set for any of them, and we would get at least six months'
notice plus an email first.

That is the real trade, and it should be made with eyes open:

- **Floating (today):** never breaks, quietly changes. A snapshot promotion
  moves verdicts with no deploy and no signal. This is the 2026-08-27 failure.
- **Pinned:** never quietly changes, eventually breaks loudly on a date we are
  told about six months ahead.

A loud failure on a known date is the better failure. It cannot corrupt a
verdict, and it cannot invalidate a measurement silently.

---

## The honest limit of pinning

Pinning serves Ben's goal — same sources and draft giving the same verdicts run
to run — but it does not fully deliver it, and it would be wrong to imply it
does.

Pinning eliminates *snapshot promotion* as a source of drift. It does not
eliminate fingerprint variation *within* a snapshot. The three different
fingerprints observed on `gpt-4o` above were, as far as we can tell, all the
same `2024-08-06` snapshot: fingerprints also move with serving-side
infrastructure and configuration, which we cannot pin from the client at all.

So the accurate claim is: **pinning removes the largest and most damaging
source of silent drift, and the drift alarm from `1853279` will now tell us
when the remainder moves.** It is necessary, it is cheap, it is behaviour-
neutral today, and it is not sufficient on its own.

Two things it does not help at all:

- **Suggest.** Its instability is within-configuration, run to run on identical
  input. Pinning `gpt-5.1` changes nothing there, and `gpt-5.1` does not even
  return a fingerprint to detect drift with.
- **Existing measurements.** The corpus baseline already straddles three
  fingerprints. Pinning going forward does not retroactively make it one
  configuration.

---

## Part 2, as executed

Approved and applied.

1. **`lib/qc/model-config.mjs`** — all 24 stage entries now carry dated
   snapshots. Three distinct strings, each the snapshot its alias already
   resolved to.

2. **`lib/observability.js` — a regression caught before it shipped.** The
   `PRICING` table is keyed on the exact model string, and
   `calculateLlmCostUsd` returns **0** for anything it does not recognise.
   Pinning alone would therefore have silently zeroed every cost figure the
   project reports. Added `gpt-4o-2024-08-06` and `gpt-4o-mini-2024-07-18` at
   rates identical to their aliases, so reported costs are unchanged.

   Pre-existing gap, left alone deliberately: **`gpt-5.1` has never been in the
   pricing table**, so reviser costs have always reported as $0. Adding a rate
   now would change reported costs, which is beyond this spec. Flagged as a
   known gap rather than fixed silently.

3. **`tests/model-fingerprints.test.mjs`** — three new guards: every
   `STAGE_MODELS` string carries a date suffix, every configured model is
   priced (excepting the known `gpt-5.1` gap), and `hasDateSuffix` accepts
   snapshots while rejecting bare aliases. A future edit cannot reintroduce a
   floating alias without failing the suite. The predicate now lives in
   `lib/qc/model-fingerprints.mjs`.

4. **Live verification against the provider.** Every pinned string was called
   for real. All three returned HTTP 200 and served exactly themselves:

   | Pinned string | HTTP | Served | Fingerprint |
   |---|---|---|---|
   | `gpt-4o-2024-08-06` | 200 | `gpt-4o-2024-08-06` | `fp_1812855600` |
   | `gpt-4o-mini-2024-07-18` | 200 | `gpt-4o-mini-2024-07-18` | `fp_5259353f0d` |
   | `gpt-5.1-2025-11-13` | 200 | `gpt-5.1-2025-11-13` | none returned |

   `gpt-4o-2024-08-06` returned `fp_1812855600` — the same fingerprint the bare
   alias returned minutes earlier, which is direct confirmation that the pin is
   behaviour-identical rather than merely believed to be.

Suite: **31 files, 512 tests, all passing.**

No corpus re-run. Since all three pins are behaviour-neutral, re-baselining is
not required to make the change safe — that stays a separate decision.

### What now needs a diary entry

Pinning trades silent drift for a dated cliff. Nothing has a shutdown date
today, and OpenAI guarantees at least six months' notice by email for GA
models, but the failure mode is now a hard outage rather than a quiet wrong
answer. Whoever receives OpenAI's deprecation emails needs to act on them.
