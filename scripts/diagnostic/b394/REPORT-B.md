# B394 Part B. Excerpt furniture

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  bd2b115  main  166 files  1819 tests` |
| Cost | USD 0. No model calls. |
| Scope | Selection only. The ClearPoint extract is unchanged. |

## 1. The cause

The four chrome excerpts are a fallback, not a chosen chrome block.

The stored cards have `excerptMatchType` `none`, `selectedExcerptReason` null, and empty `supportSpans`. Stage 4's window is 300 characters, so it is not the source of a 13,667-character passage. Assembly calls the fallback when a supported or partial card has no pointer and no span. From `lib/qc/pipeline-v3/stage7-assemble-card.mjs`:

```javascript
if (!gatedPrimary?.passage && (supportState === "supported" || supportState === "partial")) {
  const hadPointer = rawPrimaryPassage.trim().length > 0;
  const hadSpan = outSupportSpans.some((s) => typeof s?.passage === "string" && s.passage.trim());
  const matchRejected = (Array.isArray(entry.sourceMatches) ? entry.sourceMatches : []).some(
    (m) => m?.passageRejected === true || m?.emptyConfirmationRefused === true
  );
  if (!hadPointer && !hadSpan && !matchRejected) {
    const fromSource = locateClaimSentencesInSources({
      statement,
      sources: assemblyContext?.sources,
    });
```

`locateClaimSentencesInSource` keeps every sentence that contains a distinctive anchor, then joins the runs. For clean ClearPoint statement 0 the only anchor is `2026`. The first sentence of the review's source is 259 characters. It starts "Log In Sign Up" and also contains "2026", so it is a hit. Later sentences that contain 2026, including the related-story block that contains "1 MONTH AGO", are hits too. The join is 11 runs and 13,667 characters.

`trimExcerptToSentences` does not shorten that join. When the must-keep cover is already larger than six sentences, the cover is shown in full:

```javascript
const coverLo = mustIdx[0];
const coverHi = mustIdx[mustIdx.length - 1];
let lo = coverLo;
let hi = coverHi;
const coverLen = hi - lo + 1;
if (coverLen < MAX_QUOTE_SENTENCES) {
  // optional sentences may be added only while the cover is under the ceiling
}
const kept = scored.slice(lo, hi + 1);
return joinKept(t, scored, kept);
```

Replaying the fallback on the stored sources reproduces the four stored lengths exactly: doctored S1 at 1,738, clean S0 at 13,667, clean S1 at 1,738, clean S7 at 8,292.

The fix is in the fallback. A sentence that opens on a navigation bar, or that carries a related-story stamp, is not a hit, even when it also contains an anchor. The extracted source text is not rewritten.

## 2. Before and after

Eight payloads, 76 cards. A card's displayed excerpt is the new selection only where the stored `primaryExcerptText` was the fallback's output. The other cards keep the passage they already show.

| | Before | After |
|---|---|---|
| Cards whose `primaryExcerptText` is page chrome | 4 | 0 |
| Cards with an empty `primaryExcerptText` | 10 | 10 |
| Clean statements with no usable passage | 6 of 38 | 3 of 38 |

The four chrome cards, all ClearPoint, all `supported_full`:

| Card | Before | After | Opens on |
|---|---|---|---|
| Doctored S1 | 1,738, navigation bar | 237 | Financial Results, quarter ended 31 March 2026 |
| Clean S0 | 13,667, navigation bar | 12,174 | the dateline, not the navigation bar |
| Clean S1 | 1,738, navigation bar | 237 | Financial Results, quarter ended 31 March 2026 |
| Clean S7 | 8,292, related-story chrome | 7,059 | the Health Canada licence sentence |

The three clean statements that still have no usable passage are 3i S6, S7 and S10, the same empty excerpts as in B387. ClearPoint clean S0, S1 and S7 are no longer furniture, so they are usable by that definition.

No card's excerpt changed on 3i, HICL, or GPI. Those documents had no furniture problem.

On ClearPoint, the fallback's output also shortens for eight other statements (doctored S0, S2, S6, S7, S8 and clean S2, S6, S9). Those cards do not display the fallback. Their stored passages are 0 to 167 characters and were produced by another path. The displayed excerpt on those cards is unchanged.

## 3. Verdicts

No `displayVerdict` moved. The stored payloads were not rewritten. The four cards whose displayed passage changes still have a non-empty passage, so the assembly rule that sets a supported card with no excerpt to `not reviewed` does not fire.

## 4. Predictions

- The cause is a fallback in excerpt selection, not deliberate selection of a chrome block. Holds.
- Every `displayVerdict` stays unchanged. Holds.

## 5. What this pass could not establish

Clean S0 is still 12,174 characters. It is a join of the non-furniture sentences that contain 2026. The B387 furniture test no longer flags it. This pass did not decide whether that join is a good quote.

The measurement replays `locateClaimSentencesInSources` on the stored sources and statements. It is not a re-assembled review, and the fixture JSON still holds the old passages.

Part A's copyright-year match against the ClearPoint footer is untouched. Cleaning the extract stays deferred.
