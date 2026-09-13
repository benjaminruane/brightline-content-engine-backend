# Card stripping: the proposal step could not see the sources (B183)

In-memory `runActionList` against stored committed cards. `callModel` stubbed to throw. Editorial/compliance/framing/recency concerns stripped from those cards so the stub is never reached; contradicted evidence never calls the rewrite model. No pipeline run. No accuracy run. No LLM calls.

## The one line

`sortedRecord` in `lib/revise-actions/sort.mjs` dropped the card before `fillAction`:

```js
const { card, ...rest } = finding;
// ...
void card;
return entry;
```

Introduced **2026-09-01 17:01:42 +0800** in `d7a38d2` (`feat(revise): per-finding action list behind flag`, Pr17). `git blame` on those exact lines. Every finding that reached the proposal step had no `card`, so `supportSpansOf(finding)` was always `[]`.

`publicEntry` already builds the response from an explicit whitelist and never includes `card`. Keeping `card` on the internal entry does not leak it to the browser. That whitelist is why the strip was unnecessary.

**Correction to the three-reader claim.** `r1Vetoes`, `selectConfirmingPassage`, and B173 `detectSourceDisagreement` all read `supportSpansOf(finding)` → `finding.card.supportSpans`, and all three are called from `applyConflictProposal` with the stripped entry. They do not *only* reach the card that way: `pairingSourceRefId` also reads `finding.card.primaryExcerpt` when spans do not match the excerpt, and `r1Vetoes` also reads `finding.card.sourceMatches` as a compact fallback. Both of those were stripped too.

## Three features it disabled

| Feature | Believed shipped | What it needs | Live until B183 |
|---|---|---|---|
| R1 self-disagreement veto | **B169 SHIPPED 2026-09-11** | `card.supportSpans` (same `sourceRefId` confirms the draft figure) | Could not fire |
| Confirming passage | **B175 SHIPPED 2026-09-11** | `card.supportSpans` (same document, remaining figure) | Could not fire |
| B173 cross-source ask | **B173 SHIPPED 2026-09-13** | `card.supportSpans` plus fingerprints for labels | Detection was correct; unreachable on `runActionList`. The live look on 2026-09-13 is what found the strip. |

## Why every unit test passed

R1, confirming-passage, and B173 tests called `applyConflictProposal` / `fillAction` with `card` supplied by hand. B173's own fixture-24 verification did the same: `applyConflictProposal` on `inventoryStatements` findings, which still carry `card`. None of those paths go through `buildSortedEntries`. They tested a situation the product never produces. T1 in `tests/b183-entry-carries-card.test.mjs` is the standing guard on the real path.

## 3A. Live F18 Review

Source: `scripts/diagnostic/delivery-check/live-2026-09-10-f18-review.json`. Evidence findings only. `runActionList`, throwing stub.

### BEFORE the fix

| Statement | Disposition | explainCode | Resulting sentence | Confirming passage |
|---|---|---|---|---|
| S0 | ACKNOWLEDGE | — | — | no |
| S2 | ACKNOWLEDGE | — | — | no |
| S3 | ACTION | correction | The Company currently serves 412 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units. | no |
| S4 | ACTION | correction | It generates annual recurring revenue (ARR) of EUR 35 million as of April 2025, representing strong growth from EUR 28 million the prior year. | no |
| S5 | ACTION | correction | The Company employs 167 people across Stockholm, Oslo, and Helsinki. | no |
| S7 | ACKNOWLEDGE | dependents | — | no |
| S8 | ACTION | qualifier_silent | The base case generates 2.6x MOIC and 21% gross IRR. | no |
| S9 | ACKNOWLEDGE | — | — | no |

S1 and S6 are confirmed cards and do not emit an evidence finding.

### AFTER the fix

| Statement | Disposition | explainCode | Resulting sentence | Confirming passage |
|---|---|---|---|---|
| S0 | ACKNOWLEDGE | — | — | no |
| S2 | ACKNOWLEDGE | — | — | no |
| S3 | ACKNOWLEDGE | sources_disagree | — | no |
| S4 | ACKNOWLEDGE | sources_disagree | — | no |
| S5 | ACKNOWLEDGE | sources_disagree | — | no |
| S7 | ACKNOWLEDGE | sources_disagree | — | no |
| S8 | ACKNOWLEDGE | sources_disagree | — | no |
| S9 | ACKNOWLEDGE | — | — | no |

### Rows that move

| Statement | Move | Cause |
|---|---|---|
| S3 | ACTION correction (380→412) → ACKNOWLEDGE `sources_disagree`, no proposal | Cross-source (B173) |
| S4 | ACTION correction (38→35 and March→April) → ACKNOWLEDGE `sources_disagree`, no proposal | Cross-source (B173) |
| S5 | ACTION correction (142→167) → ACKNOWLEDGE `sources_disagree`, no proposal | Cross-source (B173) |
| S7 | ACKNOWLEDGE `dependents` → ACKNOWLEDGE `sources_disagree` | Cross-source (B173). Dependents does not need `card` and already fired live. After B183 the pair loop sees the other source first and asks; R5 is not reached. |
| S8 | ACTION `qualifier_silent` (2.8x/23% → 2.6x/21%) → ACKNOWLEDGE `sources_disagree`, no proposal | Cross-source (B173) |

No live F18 row moved because of R1. No live F18 row gained a confirming passage: every two-source conflict now asks before proposing, so the same-document confirming span is not selected on this dump.

## 3B. Fixture 24 (peer sources)

Latest folder: `scripts/diagnostic/runs/2026-09-13-180137/24_synth_peer_sources/result.json` (gitignored). Cards mapped `{ id: String(index), text: statement, qcCard }`. Same method.

### BEFORE the fix

| Statement | Disposition | explainCode | Resulting sentence | Confirming passage |
|---|---|---|---|---|
| S0 | ACKNOWLEDGE | — | — | no |
| S1 (P1 net IRR) | ACTION | correction | Net IRR since inception stood at 12.4% as at 31 March 2025. | no |
| S2 (P2 companies) | ACKNOWLEDGE | — | — | no |
| S3 (P3 commitments) | ACTION | correction | Total commitments were EUR 1.2 billion. | no |
| S6 | ACKNOWLEDGE | — | — | no |

S4 and S5 are confirmed cards and do not emit an evidence finding.

### AFTER the fix

| Statement | Disposition | explainCode | Resulting sentence | Confirming passage |
|---|---|---|---|---|
| S0 | ACKNOWLEDGE | — | — | no |
| S1 (P1 net IRR) | ACKNOWLEDGE | sources_disagree | — | no |
| S2 (P2 companies) | ACKNOWLEDGE | sources_disagree | — | no |
| S3 (P3 commitments) | ACKNOWLEDGE | sources_disagree | — | no |
| S6 | ACKNOWLEDGE | — | — | no |

### Rows that move

| Statement | Move | Cause |
|---|---|---|
| S1 | ACTION correction (11.2% → 12.4%) → ACKNOWLEDGE `sources_disagree`, no proposal | Cross-source (B173). This is the J1 card. Live `runActionList` proposed 12.4% until B183. |
| S2 | ACKNOWLEDGE (generic, no pairs) → ACKNOWLEDGE `sources_disagree` | Cross-source (B173). Empty-pair disagreement detection can now see both spans. |
| S3 | ACTION correction (1.3 → 1.2) → ACKNOWLEDGE `sources_disagree`, no proposal | Cross-source (B173) |

No R1. No confirming passage.

## 4. The pinned table vs the live product

Pinned after B173 (`tests/revise-actions-quantity-match.test.mjs`): ASK F18-S3, S4, S5, S8; PROPOSE W2; SPECIFIC_DECLINE F13-S7 `self_disagreement` (headcount, R1) and F18-S7 `dependents`; live-membership test: ask S3 S4 S5 S8, acknowledge S0 S2 S7.

That table was derived by calling the locator with `card` present, not through `runActionList`.

**What the live F18 product actually produced before this fix**

- Proposed on S3, S4, S5, S8.
- Acknowledged S0 and S2 with no explain code.
- Acknowledged S7 as `dependents` (R5; does not need `card`).
- No `sources_disagree`. No `self_disagreement`. No confirming passage.

**What it produces after this fix**

- Asks on S3, S4, S5, S7, S8 (`sources_disagree`).
- Acknowledges S0 and S2 with no explain code.
- Still no R1. Still no confirming passage on this dump.

**Therefore, which parts of the pinned table described a code path that never ran**

- **ASK on F18-S3 / S4 / S5 / S8.** The locator-with-card path. Live product proposed on those four until B183. After B183 those four ASK rows now match live F18. They did not before.
- **F13-S7 declining under R1.** Not in the live F18 JSON. The live F18 headcount card is S5 (142 vs 167, two sources). Before B183 it proposed 167. After B183 it asks. It never declined under R1.
- **Confirming passage on F18-S3.** Never present live. Still absent after B183, because B173 asks first.
- **W2 propose.** Not in the live F18 JSON. Untouched by this dump.
- **F18-S7 `dependents`.** This one *did* run live before B183. After B183 live F18-S7 asks instead. The pinned dependents row no longer matches the live product.

Do not quietly update the pinned table. Ben to rule.
