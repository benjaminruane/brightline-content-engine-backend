# Removal visibility: recoverability, particular filter, quoted note

Commit target:
`feat(revise): quote the removed sentence in the removal note so nothing is deleted invisibly`

Flag `deterministicUnsupportedRemoval` stays OFF in production. No prompt changes.
Full-source guard (81ab427) stays dead. No model-based second opinion.

---

## Part 0 verdict

```
REJECT DOES NOT RESTORE IT
```

A wrong backend deletion is **not** a REJECT click today. There is no per-marker
accept/reject layer on Suggest. The deleted sentence is gone from
`revisedDraft`, the CUT marker only wraps a **neighbouring** remnant word, and
`removalEvents` (which do hold `statementText`) never reach the API response.

### Q1. What does accept/reject consume?

**There is no accept/reject implementation in the shipped Suggest UI.**

What exists:

- Backend markers: `{ start, end, note, intent? }` from
  `parseSoftenedMarkers` in `lib/build-revision-prompt.mjs` L710-L734.
- Frontend display: `RevisionMarkedText` (`src/components/revision/RevisionMarkedText.jsx`
  L11-L29) iterates sanitized markers and underlines `text.slice(start, end)`
  with hover `note`.
- Modal: `SuggestRevisionModal.jsx` L27-L28, L163 consumes
  `result.revisedDraft` and `result.markers`. Copy at L139-L140 says a reviewer
  can "overrule" findings, but there is no Accept/Reject control.
- Whole-draft diff only: `InlineWordDiff` (`SuggestRevisionModal.jsx` L182-L185)
  compares `originalDraftText` vs `revisedDraft` via `diffWords`. Not a
  per-marker decision layer.

B9 (full accept/reject/refine) remains unbuilt (`docs/BACKLOG.md`,
`docs/ARCHITECTURE.md` L200).

### Q2. Normal model-emitted change: what would REJECT restore?

If a REJECT path existed over markers, the only text it could "restore" from the
marker itself is the **current span** in `revisedDraft` (the post-edit remnant).
Markers do **not** store pre-change text. `parseSoftenedMarkers` L726-L730 keeps
the inner span as the revised wording and puts the explanation in `note` only.

The pre-change wording for a CHANGED edit lives only in the client's
`originalDraftText` (or a full-draft diff), not on the marker object.

### Q3. Deterministic unsupported removal CUT on a neighbour

`applyDeterministicUnsupportedRemoval` (`lib/pr9-deterministic-unsupported-removal.mjs`):

1. Deletes the unsupported sentence from `draft` (L458-L459 area after remap).
2. Places `intent: "CUT"` on a **neighbouring remnant word** (L490-L495).
3. Note historically said the claim was removed; remnant text is unrelated
   neighbour prose.

Trace for REJECT today:

- Marker span = neighbour word only (e.g. last word of prior sentence).
- Deleted sentence is **not** in `revisedDraft`.
- Deleted sentence is **not** on the marker as a structured field.
- Therefore REJECT on that marker **cannot** reinsert the deleted sentence.
  At best it would undeline the neighbour word.

**The deleted sentence text is not reachable from anything the reject path
holds** (because that path does not exist, and even the marker payload would
not carry it).

### Q4. Does removal record the sentence, and does it reach the API?

- `removalEvents` include `statementText` and now `removedSentenceText` /
  `note` (`lib/pr9-deterministic-unsupported-removal.mjs` removal event push).
- `finalizeSuggestRevisionText` returns `removalEvents`
  (`lib/build-revision-prompt.mjs` ~L937-L950).
- `api/suggest-revision.js` L147-L154 builds the response as
  `{ ok, revisedDraft, markers, revisionWarning?, honestyEvents? }` only.
  **`removalEvents` are dropped** and never sent to the frontend
  (`useSuggestRevision.js` L51-L52 reads `revisedDraft` + `markers` only).

So the record stops at finalize → API response boundary
(`api/suggest-revision.js` L147-L154).

### Q5. Smallest change so REJECT could restore (propose only)

Smallest recoverability fix **without** building B9:

1. Put the removed sentence **verbatim in the CUT note** (implemented in Part
   2a). User can copy it back. Not one-click REJECT, but nothing is invisible.
2. Or, slightly larger: add `removedText` on the CUT marker object and/or
   return `removalEvents` in the Suggest JSON, then teach a future REJECT
   control to reinsert `removedText` at the deletion site.

Do **not** revive the full-source guard.

---

## Part 1: checkable-particular filter (zero cost)

Hypothesis: every CORRECT deletion has a checkable particular; F01:S11 has none.

Detector: `findCheckableParticulars` in
`lib/pr9-deterministic-unsupported-removal.mjs` (numerals, spelled numbers,
%, currency, multiples, years/quarters/dates/periods, ranking words,
comparatives vs named peers, proper nouns excluding first-person We/Our/I).

Script: `scripts/diagnostic/revise/removal-particular-filter-check.mjs`

### Two numbers

```
CORRECT deletions with a particular:  6 of 9
WRONG deletion (F01:S11) has particular:  no
```

```
FILTER FAILS
```

Need all 9 CORRECT with a particular and F01 with none. Closers F08 / F13 / F15
are CORRECT deletions with **no** particular.

### Table

| case id | statement id | sentence | adjudication | particular | which |
| --- | --- | --- | --- | --- | --- |
| F01 | F01:S11 | We recommend approval. | WRONG | no | - |
| F08 | F08:S17 | We are confident in the team and the opportunity, and we look forward to providing further updates as the hold progresses. | CORRECT | no | - |
| F12 | F12:S5 | The numbers tell one story; the team's transformation tells the bigger one. | CORRECT | yes | spelled_number: one |
| F13 | F13:S15 | The investment fits well with the broader portfolio strategy. | CORRECT | no | - |
| F14 | F14:S12 | We will provide further detail when the work is sufficiently advanced. | ARGUABLE | no | - |
| F15 | F15:S32 | We have high conviction in the management team and the value creation plan, and we look forward to providing further updates as the hold progresses. | CORRECT | no | - |
| F20 | F20:S8 | Our investment team has been preparing Fund V's pipeline for many months and we expect first capital calls in the second quarter of 2026. | CORRECT | yes | Fund V; first; Q2 2026 |
| F21 | F21:S3 | James Ortiz said, "Project Atlas will double in value within two years." | CORRECT | yes | James Ortiz; Atlas; two |
| F21 | F21:S4 | The transaction is expected to close in the second quarter of 2026. | CORRECT | yes | Q2 2026 |
| F22 | F22:S3 | Veneto Freight is one of the fund's existing portfolio companies. | CORRECT | yes | Veneto Freight; one |
| F23 | F23:S4 | Aldous Renewables is the fund's largest limited partner. | CORRECT | yes | Aldous Renewables; largest |

Part 1 cost: **$0**.

---

## Part 2a: quoted removal note (ALWAYS)

Exact final note string (deepen sentence / Meridian measure):

```
Removed this sentence: "Halden Group expects the relationship to deepen over the life of the fund." No supplied source backs that claim. Confirm before publishing.
```

- Builder: `buildDeterministicUnsupportedRemovalCutNote`
- Quoted text = statement as in the draft before removal; markers stripped;
  >200 chars → first 200 + `...`
- Survives `normalizeMarkerNoteText` unchanged (unit-tested)
- Empty-draft note **unchanged**

## Part 2b: particular gate

**Not applied.** Part 1 failed (6 of 9 CORRECT have a particular). No
`no_checkable_particular` skip reason was added to the removal gate.

## Part 2c: unit tests

`tests/pr9-deterministic-unsupported-removal.test.mjs` — 15 tests, including
quoted-note verbatim + truncation + normalize survival. Existing removal
behaviours retained.

---

## Part 3: Meridian OFF vs ON measure

Reuses `suggest-after-r10-review1.json`. `RUNS_PER_ARM=3`. Seed 1. Temperature 0.
Measured EDGE CASE (0559301) OFF. Cost estimate ~**$0.48**.

### Confirmations

```
deepen removed on arm ON:     3 of 3
note quotes deepen verbatim:  3 of 3
honesty on removal marker:    none (honestyOnDeepenMarker empty all 3)
arm OFF deepen still present: 3 of 3
```

Exact ON cut note (all three runs):

```
Removed this sentence: "Halden Group expects the relationship to deepen over the life of the fund." No supplied source backs that claim. Confirm before publishing.
```

### Controls vs 8-of-10 noise band

Across the three ON runs, 8 of 9 non-deepen control cards were prose-stable;
1 (`exceptional`) varied. That sits **inside** the known reviser noise floor
(previously measured 8 of 10 unstable). Removal outcome is not being read as
model stability.

Artefacts: `deterministic-removal-measure-meta.json`,
`deterministic-removal-{off,on}-run{1,2,3}.json`.

---

## Pass conditions

- Part 0: Q1-Q5 with citations, one-line verdict: **PASS**
- Part 1: table + two numbers, $0: **PASS** (filter itself FAILS, reported)
- Part 2a: quoted note, exact string reported: **PASS**
- Part 2b: skipped because Part 1 failed: **PASS** (stated)
- Part 3: removal 3 of 3, quoted note, controls inside noise band: **PASS**

Total cost: ~**$0.48** (Part 3 only). Parts 0-2: **$0**.
