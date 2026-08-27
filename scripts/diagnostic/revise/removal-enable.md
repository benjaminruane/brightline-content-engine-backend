# Enable deterministic unsupported removal in production

Commit:
`feat(revise): enable deterministic unsupported whole-sentence removal in production`

## What changed

1. **Enabled** `deterministicUnsupportedRemoval: true` on the production Suggest
   path (`api/suggest-revision.js`), including `concerns` into
   `finalizeSuggestRevisionText` so the gate has work to do.
2. **Deleted** the 0559301 measured prompt experiment:
   `UNSUPPORTED_WHOLE_SENTENCE_EDGE_CASE_MEASURED`,
   `UNSUPPORTED_WHOLE_SENTENCE_REMOVAL_EXAMPLE_MEASURED`, and
   `opts.measuredUnsupportedWholeSentenceRemoval`. Live keep-and-flag EDGE CASE
   text is unchanged. Code owns whole-sentence removal.
3. **`removalEvents` returned** on the Suggest response (additive). Each event
   carries `removedSentenceText`, `statementId` / `statementIndex`, `reason`,
   and `originalOffset` in the original draft. Existing keys unchanged.
4. Orphan-marker coverage: if the model wrapped the sentence that code then
   deletes, that marker is dropped with the span; unit test asserts no marker
   left on absent deepen text.

Accepted risk (unchanged): roughly 1 in 11 removals may act on a Review miss.
Quoted note makes it visible and recoverable by hand.

## Live verification

Production handler path (`api/suggest-revision.js`) on Meridian /
`suggest-after-r10-review1.json`:

```
httpStatus 200
deepenGone true
removalEvents 1 (reason=unsupported_whole_sentence_removed, statementId=9)
cut note quotes deepen verbatim
response keys: ok, revisedDraft, markers, removalEvents, honestyEvents
additive only: yes
```

Exact note:

```
Removed this sentence: "Halden Group expects the relationship to deepen over the life of the fund." No supplied source backs that claim. Confirm before publishing.
```

## Tests

Full suite: **491 passed**. Includes honesty, cut-punctuation, removal (orphan
marker case included).

## Cost

Live Suggest verify: about **$0.08**. Suite: $0.
