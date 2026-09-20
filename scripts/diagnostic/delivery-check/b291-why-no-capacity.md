# B291-B293. Why there was no capacity

Date: 2026-09-20. Part 1 is read-only. Parts 2 to 4 follow. No production Review in Part 1.

Kill condition: the 20 September refusals were **not** ordinary per-minute token pressure. They were a **terminal** billing stop. Parts 2 to 4 still apply. The B290 capacity caption is the wrong diagnosis for this hang.

---

## Part 1. Why there was no capacity

### Q1. Provider usage and limits dashboard, 13:30Z to 13:50Z

**The usage dashboard could not be read.** CONFIRMED live this session. `GET /v1/organization/usage/completions` and `GET /v1/organization/costs` both returned 403: `Missing scopes: api.usage.read`. The project `OPENAI_API_KEY` is not an admin key. Billing subscription endpoints require a browser session key. That absence is itself the finding: we cannot see per-minute token usage, per-minute request usage, daily or monthly cap, or configured budget from the provider's own records with the key the product uses.

What we **can** read, from the same account, this session (2026-09-20T14:38Z):

```
status 429
code credit_balance_exhausted
type insufficient_quota
message You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.
x-ratelimit-*  absent
retry-after    absent
retry-after-ms absent
```

CONFIRMED by catching `openaiClient.chat.completions.create` with `maxRetries: 0`. The SDK error carries `status`, `code`, `type`, `message`, and Cloudflare headers. No rate-limit headers. The current spend against the budget is: **the credit balance is exhausted.**

Account tier, last independently measured: **Tier 4**, gpt-4o family, 10,000 RPM / 2,000,000 TPM. CONFIRMED B276 `scripts/diagnostic/delivery-check/rate-limit-and-redesign.md` (live headers on this org, this day, before the hang). A quota 429 does not return those headers, so this session cannot reconfirm remaining TPM from the provider.

Langfuse is not the provider dashboard. It is the only per-minute spend record we have for 13:00Z-14:00Z. CONFIRMED `GET /api/public/traces?fromTimestamp=2026-09-20T13:00:00.000Z&toTimestamp=2026-09-20T14:00:00.000Z`.

| Time (start) | Name | Wall s | Langfuse USD | Notes |
|--------------|------|-------:|-------------:|-------|
| 13:10:14Z | qc-run B277 run1 | 13.8 | 0.422 | billed |
| 13:10:38Z | qc-run B277 run2 | 19.1 | 1.726 | billed |
| 13:11:01Z | qc-run B277 run3 | 34.6 | 4.803 | billed |
| 13:11:48Z | qc-run B277 run4 | 264.1 | 16.444 | billed; ended ~13:16:12Z |
| 13:24:55Z | source-description | 1.0 | 0.0002 | billed |
| 13:25:09Z | qc-run | 16.1 | 0.404 | billed; a real review after B277 |
| 13:25:27Z | assess-reviewer-synthesis | 2.2 | 0.005 | billed |
| 13:25:34Z | constructive-feedback | 4.0 | 0.012 | billed |
| 13:38:44Z | qc-run | 300.3 | 0.053 | some tokens, then died at Function cap |
| 13:41:22Z | qc-run | 279.9 | 0 | hang; zero statements |
| 13:43:02Z | source-description | 0 | 0.0002 | tiny billed call during the hang window |
| 13:43:11Z | qc-run | 280.0 | 0 | hang |
| 13:45:36Z | qc-run | 279.8 | 0 | hang |
| 13:46:00Z | qc-run | 280.0 | 0 | hang |

Per-minute token usage from the provider dashboard: **unknown**. Per-minute request usage from the provider dashboard: **unknown**. Daily or monthly cap from the provider dashboard: **unknown**. Current spend against budget: **no credits remaining**, live 14:38Z, same calendar day as the hang.

### Q2. Is there a requests-per-minute limit? Had we hit it?

**Yes.** B276 live header on this account, gpt-4o-2024-08-06: `x-ratelimit-limit-requests: 10000` and `x-ratelimit-limit-tokens: 2000000`. That pair is published Tier 4. CONFIRMED `rate-limit-and-redesign.md` L41.

Had we hit RPM? **No evidence we did, and strong evidence we did not.** Four overlapping reviews retrying once per second is tens of RPM, not 10,000. The hang `[RATE_LIMIT]` lines have `requested=0` and no reset header. A TPM 429 on this account historically includes `Requested N` (B276 quoted `Requested ~1428-1494`; B277 run 4 `requested=17329`). RPM was not investigated in B276 beyond recording the 10,000 header. The hang shape is not an RPM 429.

### Q3. What did the provider's 429 actually say?

**The original message and headers are not in the production Vercel logs.** That is the finding. The only refusal line is:

```
[RATE_LIMIT] waitMs=1000 boundMs=299849 marginMs=0 requested=0 attempt=1
```

`requested=0` means `parseRequestedTokens` found no `Requested N` in `err.message`. No `x-ratelimit-*` or `retry-after` is printed. `err.code`, `err.type`, and the verbatim message are discarded. CONFIRMED `lib/observability.js` `withRateLimitRetry` and `b290-what-hung.md` Q2.

A live 429 on the same key, this session, **does** carry the provider body. Quoted in Q1. Status 429, type `insufficient_quota`, code `credit_balance_exhausted`, message about no credits. Headers exist on the error object (Cloudflare, `x-request-id`). **No `x-ratelimit-*`. No `retry-after`.** The SDK did not drop rate-limit headers; the provider did not send them on this class of 429.

Part 2.3: `capturingFetch` records `res.headers` on every response, including 429, before the SDK throws. `recordRateLimitHeaders` only copies token limit / remaining / reset. A quota 429 has none of those, so the store stays empty. The thrown error still has `status`, `code`, `type`, `message`, and `headers`. We never logged them. We did not strip `x-ratelimit-*` off a TPM 429 in the client wrapper. This hang was not a TPM 429.

### Q4. Five straight minutes of refusal: TPM or something else?

**Something else. A terminal billing stop, not a per-minute token allowance.** From Q1-Q3, not from how limits ought to behave:

1. A 60-second TPM window would refill. The last B277 run ended ~13:16Z. The first hang started ~13:36Z. Twenty minutes later the bucket is full.
2. A billed qc-run at 13:25:09Z (USD 0.404, 16 s) ran **after** B277 and **before** the hang. Credits and TPM both still worked then.
3. The four hang traces billed **USD 0**. They consumed no tokens, so they could not keep a TPM window exhausted.
4. `requested=0` on every retry is the parse of a message that is **not** the TPM template (`Limit 2000000, Used 2000000, Requested N`).
5. The same account, hours later the same day, still returns `credit_balance_exhausted` with no rate-limit headers. TPM would have recovered. A credit balance does not.

B290's capacity wait is the wrong name for this hang. It remains the right name for a genuine TPM wait.

### Q5. Did the four B277 measurement runs contribute? Gap in minutes.

Last measurement: B277 run 4. Langfuse `01b100c3-e1c9-496e-ab19-c31fcb21025d`, timestamp **2026-09-20T13:11:48.280Z**, latency **264.096 s**, ended **~13:16:12Z**. CONFIRMED Langfuse GET.

First hung review: Langfuse `932dca99-a520-4655-911e-21fd5cdb9895`, timestamp 13:41:22.841Z, latency 279.86 s, started **~13:36:43Z**. Matches `hlddr` in `b290-what-hung.md`.

**Gap: 20.5 minutes** from run 4 ending to the first hang starting.

B277 did not leave a TPM hole that lasted until 13:36. It did spend USD 23.39 list in five minutes (13:10-13:16). A billed review still succeeded at 13:25. The hang is after that. Contribution to **token pressure at 13:36: no**. Contribution to **burning the remaining credit balance that afternoon: possible**, and not readable from the usage dashboard. HYPOTHESIS on the balance; CONFIRMED that TPM is not the mechanism.

### Kill condition

Ordinary per-minute token pressure does **not** explain the hang. The refusals were **terminal** (`insufficient_quota` / `credit_balance_exhausted` on the live same-day 429; hang logs consistent with that class). Continue. Flag: B290 told the reviewer the review was waiting for capacity. For this hang, capacity in the TPM sense was not the stop.

---

## Part 2. Never throw away the refusal. B291

### 2.1 Log

One `[PROVIDER_REFUSAL]` line per request, on the first 429 or terminal refusal. Status, code, type, message verbatim, every `x-ratelimit-*` and retry-after header present, or `x-ratelimit-*=absent retry-after=absent`. CONFIRMED `lib/observability.js` `logProviderRefusalOnce`. Tests `tests/b291-refusal-recorded.test.mjs`.

### 2.2 Meta

`meta.providerRefusal` is the same object. Stamped on success and on the `ok:false` catch. A failed review can say why without the platform logs.

### 2.3 Are we dropping headers?

**No.** `capturingFetch` records `res.headers` on every response. The SDK puts the same headers on the thrown error. A live `credit_balance_exhausted` 429 on this account has Cloudflare headers and `x-request-id`, and **no** `x-ratelimit-*` or `retry-after`. The wrapper did not strip them. The provider did not send them on this class of 429. TPM 429s still carry the headers (B276, B277 run 4).

Callers of `withRateLimitRetry`: only `callLLM` (twice, schema retry). `callLLM` is the shared helper for every pipeline stage and the eleven endpoints. All of them now log once and stamp the snapshot. `isRateLimitError` is only used by that wrapper and its tests.

---

## Part 3. Stop retrying a refusal that cannot pass. B292

### 3.1 Transient versus terminal

Terminal (code or type, not message text): `insufficient_quota`, `credit_balance_exhausted`, `billing_not_active`, `account_deactivated`, `invalid_api_key`, `organization_usage_limit_exceeded`, `access_terminated`, HTTP 401/403. Fails immediately. `isRateLimitError` is false for those.

Transient: HTTP 429 or code `rate_limit_exceeded` / `rate_limit_error`, and not terminal. Message text alone is not a retry. CONFIRMED tests.

### 3.2 First call, nothing succeeded

`NOTHING_REVIEWED_RETRY_BOUND_MS = 8000`. Same duration as the B285 fallback. Long enough for a one-second TPM blip. Short enough that a billing stop cannot occupy the Function. Mid-review TPM waits still use the remaining Function bound (B278). Nothing has been reviewed, so there is nothing to protect by waiting.

### 3.3 User-facing copy

`The review did not run.` No tokens, no limits, no promise that capacity will return. Backend `error` field on `ok:false`. Frontend shows that line, not an empty results panel.

### 3.4 What the screen did with ok:false, and the fix

Today: HTTP 200 `ok:false` with no `error` field. Frontend `api.js` threw `Analyse failed (200)`. Writing stored a failed result **without** `result.error`, so `errorMsg` was null and the panel showed `No review results for this version yet`. A toast said it failed. The results column did not. That is not obviously a failure.

Fix: catch payload always has `error: The review did not run.` and `meta.reviewDidNotRun: true`. Writing stores `error: safeNote`. The panel shows `The review did not run.` Counter clears because `isReviewing` becomes false and elapsed resets to 0.

---

## Part 4. The counter stops claiming work it cannot see. B293

### 4.1 Freeze after the estimate

Percent stops at 90. No crawl to 97. Caption after the estimate: `N of M statements. Still running, nothing has come back yet.`

### 4.2 Caption while running

`N of M statements`. The number stays. No `reviewed`. No `About`.

### 4.3 ok:false

Counter cleared. Screen: `The review did not run.`

### 4.4 Comment

`reviewProgressEstimate.js`: INTERIM. Real fix is server-reported progress with the background job.

B290 capacity hint is suppressed once overtime, so a hung estimate does not also claim a capacity wait.

---

## Were the 20 September refusals transient or terminal?

**Terminal.** Hang logs `requested=0`, no retry-after, USD 0 billed, 20.5 minutes after the last B277 run, a billed review in between at 13:25. Live same-day 429 on this key: `credit_balance_exhausted` / `insufficient_quota`. B290 capacity copy is the wrong diagnosis for this hang and the right copy for a genuine TPM wait.

---

## TOTAL COST OF THIS SPEC IN USD

Part 1 probes: two 1-token chat completions, both 429 `credit_balance_exhausted`, **USD 0.00 billed**. Unpriced in the sense of no usage object; they did not consume tokens.

Production Review after the change: recorded below.

