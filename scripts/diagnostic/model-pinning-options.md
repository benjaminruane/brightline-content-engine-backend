# What can we pin, and to what

Part 1 only. **Nothing has been pinned. `lib/qc/model-config.mjs` is unchanged.**
Awaiting Ben's go-ahead for Part 2.

Cost: **under one cent** (~$0.003). `GET /v1/models` is free; three one-shot
completions were used to resolve what each alias actually serves.

Every model string below came from the provider on 2026-08-28, queried with the
production key by `scripts/diagnostic/list-model-snapshots.mjs`. Raw output is
in `scripts/diagnostic/model-snapshots.json`. Nothing here is from memory.

---

## Recommendation

| Alias in use | Serves today (probed) | **Pin to** | Behaviour change if pinned | Announced shutdown |
|---|---|---|---|---|
| `gpt-4o` — Stage 2 + 7 stages | `gpt-4o-2024-08-06` | **`gpt-4o-2024-08-06`** | **None. Identical string.** | **None announced** |
| `gpt-4o-mini` — extraction, judges | `gpt-4o-mini-2024-07-18` | **`gpt-4o-mini-2024-07-18`** | **None. Only snapshot.** | **None announced** |
| `gpt-5.1` — the reviser | `gpt-5.1-2025-11-13` | **`gpt-5.1-2025-11-13`** | **None. Only snapshot.** | **None announced** |

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

## Part 2, on approval

On Ben's go-ahead, and not before:

1. Replace the three strings in `lib/qc/model-config.mjs` — `gpt-4o` →
   `gpt-4o-2024-08-06`, `gpt-4o-mini` → `gpt-4o-mini-2024-07-18`, `gpt-5.1` →
   `gpt-5.1-2025-11-13`. One table, one commit, nothing else.
2. Add a unit test asserting every string in `STAGE_MODELS` carries a date
   suffix, so a later edit cannot silently reintroduce a floating alias. The
   predicate is already written and exported as `hasDateSuffix` in
   `scripts/diagnostic/list-model-snapshots.mjs`; it would move to the library.

No corpus re-run. Since all three pins are behaviour-neutral, re-baselining is
not required to make the change safe — that stays a separate decision.
