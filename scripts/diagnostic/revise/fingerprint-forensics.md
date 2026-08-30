# Fingerprint forensics: 05:48Z vs 07:06Z

Parts 1 and 2 of the H2/H3 settlement. No model calls. Traces retrieved from Langfuse cloud.langfuse.com.

Harness notes live in this file. Retrieval was a Langfuse public API read, same pattern as `scripts/diagnostic/b60-money/run-shadow.mjs` `langfuseGet`.

## Scoreboard

```
traces retrievable: YES
system_fingerprint field on each generation: YES (key present)
system_fingerprint value: null on every target call
H2 (fingerprints differ): NOT CONFIRMED. They do not differ.
H3 (same snapshot, different substance): NOT CONFIRMED from fingerprints.
   null equals null is not a serving snapshot id.
verdict: UNRESOLVED at the snapshot layer
```

Do not rewrite `noise-floor-recheck.md` L51-53 or B98 from this pass. H3 is not fingerprint-confirmed. H2 is not fingerprint-confirmed either.

## PART 0

0a CONFIRMED, with a scope correction. `lib/observability.js` L444-445 copies `attempt.raw.system_fingerprint` into Langfuse generation metadata as `systemFingerprint`. The field exists on the Langfuse observation, not in `b122-rescore.json` or `b134-carve-out-gate.json`. The previous report was right that the JSON artefacts cannot settle H2. It was wrong if it was read as "the field does not exist anywhere". H2 was unlooked-for in Langfuse, not unfalsifiable in principle. In practice it is still unfalsifiable for these runs, because the stored value is null. See 0d.

0b CONFIRMED retrievable. Not dropped. 12 traces named `b122-rescore` around 2026-08-30T05:47-05:48Z. 24 traces named `b134-carve-out-gate` around 2026-08-30T07:04-07:06Z. Observations named per span still return.

0c CONFIRMED. `b134-carve-out-gate.json` L2 `ranAt` 2026-08-30T07:06:03.581Z. One process, two arms. Reference r10-review1 S7 3 of 3 (`scoreRows` L441, L526, L611). Carve-out 3 of 3 (`primaryClasses` L1915-1936). That is the only comparison in which both prompts ran against the same clock window. It is uncontaminated as a same-process A/B. It is vacuous as a measurement of effect, because the reference arm already hit.

0d The spec's Part 2 treats "fingerprints identical" as "same serving snapshot". gpt-5.1-2025-11-13 on this Chat Completions path records `systemFingerprint: null` on every generation we opened. Identical nulls are not a snapshot id. Calling H3 from that would be the same class of error as shipping B134 on a vacuous primary. UNRESOLVED in the spec is only "traces gone". This is a third outcome: traces present, fingerprint null. The spec did not name it.

Also: `callLLM` creates a new `traceId` per call (`lib/observability.js` L77-79), so these are 12 and 24 traces, not two. Match on span name plus timestamp, not on a single trace id.

## PART 1. Per call

All six target calls: model `gpt-5.1-2025-11-13`, seed matches the span, `systemFingerprint` JSON null, metadata key present. `typeof null === "object"` in the retrieval script; the value is JSON `null`, not an object.

b122-rescore, r10-review1, span `suggest-after-r10-review1.json-seedN`. Input 8302 tokens. CONFIRMED Langfuse observations:

```
seed 1  start 2026-08-30T05:47:30.648Z  id 8c10d7be-ba7a-4d6e-8e9b-64ddbcfa1d7b  fp null  in 8302 out 610
seed 2  start 2026-08-30T05:47:37.084Z  id 2410e915-4c49-40ba-9cee-b343e4384e61  fp null  in 8302 out 630
seed 3  start 2026-08-30T05:47:42.574Z  id 21de9fb7-b589-4cb6-9394-a07416de5bb3  fp null  in 8302 out 617
```

b134 gate, r10-review1 reference arm, span `reference-suggest-after-r10-review1.json-seedN`. Input 8302 tokens. CONFIRMED:

```
seed 1  start 2026-08-30T07:04:13.291Z  id 156a361c-88d6-4a2d-9407-9e3f3fcdfd6e  fp null  in 8302 out 608
seed 2  start 2026-08-30T07:04:19.221Z  id 269dca8c-462d-4a8d-84b5-096bc629235a  fp null  in 8302 out 589
seed 3  start 2026-08-30T07:04:26.664Z  id 8596d91a-68d7-450d-8bef-a5f0d48b28ef  fp null  in 8302 out 648
```

Seeds within a run do not differ from each other on fingerprint. All null. That is not a within-run rotation finding. It is "the instrument recorded nothing".

Same-process carve-out seed 1, span `carve-out-suggest-after-r10-review1.json-seed1`, id `d8fe7770-a398-481d-ab05-9ac21ec7cabe`, fp null, in 8652. Same clock window as the reference arm. Same null.

A later Part 4 tail (07:26Z, span without the `reference-` prefix, in 8652) is the amended prompt. Also fp null. Not used for H2.

## PART 2. Verdict

H2 is not confirmed. Fingerprints do not differ.

H3 is not confirmed from this instrument. A null fingerprint is not evidence of a shared serving snapshot.

UNRESOLVED (fingerprint null). Traces were not gone.

What this means for cross-run comparison: we still cannot certify that 05:48Z and 07:06Z were the same OpenAI snapshot. We can certify they were the same dated model string, temperature, seeds, and prompt hash. For gpt-5.1 Suggest, `system_fingerprint` is currently an empty column. Recording it is still right, so a later snapshot that does populate it does not have to be dug out of Langfuse. Until it populates, time-separated Suggest runs cannot be proven comparable at the serving layer. That is broader than B134. It is not a licence to treat every cross-run difference as model noise, and not a licence to treat them as prompt effects either.

H1 remains false from the prompt reconstruction (`reference-arm-contradiction.md`). The leftover is H2 unobservable or H3 true. This pass does not pick.

## Part 3 pointer

Shared helper: `scripts/diagnostic/lib/suggest-call-record.mjs`. Wired into `b134-carve-out-gate.mjs` and `reference-arm-contradiction.mjs` for future runs. Not retrofitted into every older harness. Does not change `lib/` or `api/`.
