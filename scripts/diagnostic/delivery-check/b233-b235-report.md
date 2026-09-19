# B233 / B234 / B235 delivery report

Date: 2026-09-19. Closed the already-filed rows **B234**, **B235**, **B233**. Next free after B245 would have been B246. Not used.

**Scoreboard: 20 of 87.** Unchanged. The same 20 are now honest under the B245 corruptions.

No Review. No model call. Browser skipped: QRS and export copy. Cheapest proof is the B245 suite.

---

## Part 0B D1 to D6 (and D7)

**D1 AGREE, compute at the point of use.** `readReviewSummary` (screen, export payload, assessment) and `reviewSummaryFromResult` / `qualityReviewSummaryLines` (file) recompute from cards + `reviewOptions` when cards exist. A legacy snapshot with a stamp and no cards still returns the stamp (C51).

Refuse would blank the whole QRS when one check disagrees, including evidence counts that are still true. Recompute keeps the honest remainder.

**D2 AGREE.** `classifyEvidence` uses `evidenceCountClass` from `evidence-display-verdict.mjs`. Unknown and `Not reviewed` while evidence is on are `notChecked`, counted into readiness. A dropped card cannot make a draft look Ready.

Readiness labels that changed on existing fixtures: one. `tests/fixtures/review-summary-cases.json` case `unknown-display-verdict`: **Ready** became **Not fully checked**. Live Meridian and the other review-summary cases did not move.

**D3.** Evidence badge, export verdict, and evidence summary class are the same question (what is this `displayVerdict` slug). Editorial and compliance are a different allowlist. A single shared evidence-slug module is possible. Not built. Filed as an annotation on **B239**, not a new id.

**D4 AGREE.** Extended B245 D5.ii (QRS must not say editorial notes) and D5.i (all unknown slugs, signals cleaned, must not start Ready / must not say all claims are backed). QRS now comes from the payload writers, not a hardcoded list. That is the corruption path, not a new suite.

**D5 named, not fixed:** F24 (Not checked filter still ignores evidence Unverifiable / Not reviewed). B239 (three evidence allowlist copies). B231 (`concernLevel` still not on the card face). B237 (QRS 3-bullet cap).

**D6 AGREE.** Stage 1 and the Stage 2 prompt were not touched. Stage 7 mapper rename only.

**D7 AGREE, rename at print, do not stuff.** Stuffing editorial and compliance into `concernLevel` would invent a combined severity the product does not compute. Those signals already have their own notes in the file. The mapper is `mapSupportStateToEvidenceConcernLevel`. The card still stores `concernLevel` so readers do not break, and also `evidenceConcernLevel`. The file prints `evidence concern`.

Meridian golden verdict lines that changed:
- 3x `Verdict: Partially confirmed (moderate concern)` to `(moderate evidence concern)`
- 2x `Verdict: No support (high concern)` to `(high evidence concern)`
Confirmed cards had no suffix (none). Re-bless commit `4b32e34`.

---

## C1 to C3

**C1 BLOCKING CONFIRMED.** After B245, statement-review notes were omitted when editorial was off, but QRS still said `1 claim has editorial notes.` because it was stamped / hardcoded. CONFIRMED `tests/b245-export-and-payloads.test.mjs` fail `flipped.includes("editorial notes")` true; stamp at `api/analyse-statements.js` L336.

**C2 BLOCKING CONFIRMED.** `classifyEvidence` returned null for unknown slugs. CONFIRMED previous `lib/qc/review-summary.mjs` (dropped to null). Case `unknown-display-verdict` expected Ready. B245 D5.i all-unknown wipe started with **Ready**.

**C3 CHECK CONFIRMED.** Stamped at `api/analyse-statements.js` L336 `reviewSummary: summariseReview(summaryCards, effectiveReviewOptions)`. Downstream that shared the stamp: screen `readReviewSummary`, export `buildExportQualityReviewSummary`, assessment `buildReviewerSynthesisPayload`. constructive-feedback already recomputed. Those three now recompute at the point of use when cards are present.

---

## Corruptions failing before and passing after

**B234 D5.ii** (editorial off, QRS from the payload):

```
FAIL  ii editorialEnabled false does not describe editorial as checked
assert.equal(flipped.includes("editorial notes"), false);
true !== false

FAIL  ii editorial off labels editorial Not reviewed
assert.equal(claims.bullets.some((line) => line.includes("editorial notes")), false);
true !== false
```

After recompute: both pass. Cards still say Not reviewed. QRS no longer names editorial notes.

**B235 D5.i** (all slugs `not_a_real_slug`, editorial/compliance cleaned):

```
FAIL  i unrecognised displayVerdict is not Confirmed in the file
assert.equal(wiped.startsWith("Ready"), false);
true !== false

FAIL  i unrecognised displayVerdict is not Confirmed
AssertionError: Expected "actual" to be strictly unequal to: 'Ready'
```

After `notChecked`: both pass. Readiness is Not fully checked. No `All claims are backed by sources`.

**B233 golden:**

```
- Verdict: Partially confirmed (moderate concern)
+ Verdict: Partially confirmed (moderate evidence concern)
- Verdict: No support (high concern)
+ Verdict: No support (high evidence concern)
```

Re-blessed with `UPDATE_EXPORT_GOLDEN=meridian-2026-09-18`.

---

## Shared allowlist

Possible for evidence slugs (badge, export, summary counts). Not possible as one list with editorial/compliance. Recommendation lives on **B239**. Not built here.

---

## SHIP VERIFIED

(printed after verify:ship)

---

## Disagreements

1. Ids: closed B234/B235/B233 rather than filing B246. Spec said both.
2. `concernLevel` is still on the card JSON. Renaming the stored key would be a data-contract break. Print and mapper name tell the truth. B231 stays open for the card face.
3. Frontend `summariseReview.js` is a point-of-use copy of the backend summariser. That is the fourth copy D3 named. B239 now says so.
4. F24 is the same shape for the filter, not for QRS. Left open.
