# R10 production verification

One live Production Review. Halden Meridian draft vs
`scripts/diagnostic/eval-ablation/meridian_source.txt` (Halden copy).
Same draft and source as R3a production verify (`r3a-production-verify.json`).

Harness: `scripts/diagnostic/eval-ablation/run-r10-production-verify.mjs`
JSON: `scripts/diagnostic/eval-ablation/r10-production-verify.json`
No code, fixture, baseline, or live-prompt edits in this pass.

```
ranAt:     2026-08-27 (see JSON ranAt)
traceId:   6e5bb255-e27d-481f-92fc-2d90a2420e13
URL:       https://brightline-content-engine-backend.vercel.app
httpStatus: 200
pipeline:  v4
```

## Prompt reaching the resolver (14259-char R10)

```
Local stage2_v4.md (repo tip at verify): len=14259
sha256=44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1

Production deployment serving the alias at request time was
dpl_A19BxLcdwNXXuzectaJsZFVakueV (githubCommitSha e9c6616...),
which is after ship commit 971370f (tag stage2-basis-conflict-r10).
Prompt file at 971370f and at e9c6616 is the same R10 text
(len=14259, sha256=44847c61...).

CONFIRMED: production alias was on a commit that contains the R10 prompt.
Behavioral CONFIRMED: EA_E3 Stage 2 classification is conflicting with
mark-vs-returned explanation (was confirmed under R3a verify).
```

Vercel CLI log fetch for this deployment returned no streamed lines in this
environment. Fingerprints below come from `qcCard.stage2SourceFingerprints`
in the review JSON, which is the same value `logStage2Fingerprint` writes.

## Three exhibits

```
EA_E1 ranking
  statement: It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.
  displayVerdict / concernLevel: supported_partial / moderate
  Stage 2 classification: partially_confirmed
  system_fingerprint: fp_17e3c4f467
  vs R3a verify: UNCHANGED (supported_partial / moderate)
  file: eval-ablation/meridian_source.txt

EA_E2 risk
  statement: The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.
  displayVerdict / concernLevel: supported_partial / moderate
  Stage 2 classification: partially_confirmed
  system_fingerprint: fp_17e3c4f467
  vs R3a verify: UNCHANGED (supported_partial / moderate)
  file: eval-ablation/meridian_source.txt

EA_E3 mark  (eval-ablation EA_E3; not claim-spans CS_E3; not corpus E3:S0:ic_memo)
  statement: Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.
  displayVerdict / concernLevel: conflict / high
  Stage 2 classification: conflicting
  system_fingerprint: fp_17e3c4f467
  unsupportedSpan: conflicting on "has returned"
  vs R3a verify: CHANGED from supported_full / none / Stage2=confirmed
  harness expectation: conflicting. MATCH.
```

CONFIRMED: conflicting forces concernLevel high
(`mapSupportStateToConcernLevel` in stage7-assemble-card.mjs: conflicting -> high).
Card actually shows concernLevel=high.

Note: multipassage `supportSpans[0].classification` remains "confirmed" on the
mark card while Stage 2 and the card verdict are conflicting. That widen pass
does not feed aggregation (existing product split). Harness compared Stage 2
labels; those match.

## Full card list (verdict per statement)

```
0 supported_partial / moderate / Stage2=partially_confirmed
  In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V...
1 supported_partial / moderate / Stage2=partially_confirmed
  We were attracted to Meridian on the strength of a track record...
2 supported_partial / moderate / Stage2=partially_confirmed
  It has realised a gross MOIC of 2.4 times across 17 exits... (EA_E1)
3 supported_partial / moderate / Stage2=partially_confirmed
  The team's stability... means key-person risk is limited. (EA_E2)
4 conflict / high / Stage2=conflicting
  Fund IV has returned 1.9 times... (EA_E3)   <-- the R10 change
5 supported_full / none / Stage2=confirmed
  Meridian Capital Partners V is a EUR 1.2 billion fund...
6 supported_full / none / Stage2=confirmed
  The fund will hold investments for four to six years...
7 supported_partial / moderate / Stage2=partially_confirmed
  On balance, we believe the fund should deliver returns...
8 supported_partial / moderate / Stage2=partially_confirmed
  The GP provided access to co-investments...
9 not_supported / high / Stage2=no_support
  Halden Group expects the relationship to deepen...
```

Nothing else looks newly broken relative to the R3a production verify shape.
All fingerprints observed: `fp_17e3c4f467`.

## Verdict

```
PASS. R10 is live in Production. Mark sentence is flagged conflict / high.
Ranking and risk unchanged from R3a verify. Harness and product agree on EA_E3.
```
