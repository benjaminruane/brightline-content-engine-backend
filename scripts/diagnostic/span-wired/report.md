# B88 span-wired measurement

No automatic pass/fail. Numbers only.

## Fixture selection

Picked nordholt-clean, F18, and nordholt-dirty because they have the most statements with a strictly shorter validated span in the review-span-two-step corpus (4, 4, and 3 respectively).
- nordholt-clean: 4 statements with a strictly shorter span; review fingerprint OFF/ON identical=true
- F18: 4 statements with a strictly shorter span; review fingerprint OFF/ON identical=true
- nordholt-dirty: 3 statements with a strictly shorter span; review fingerprint OFF/ON identical=true

## Cache / review reuse

- Stage 2 hits 97, misses 0 (must be 0 misses)
- store kind: disk
- Review inputs identical between arms: yes (same card fingerprint excluding unsupportedSpans). OFF strips unsupportedSpans before gatherConcerns; ON keeps them. Editorial/compliance set clean so only evidence findings drive the reviser.
- Only the revision call is live.

## Cost

- Revision calls: 18
- Model: openai/gpt-5.1
- Tokens: input 124779, output 5469
- Total cost: $0.2107

## Totals per arm (across all fixtures and repeats)

### OFF
1. Total edits made: 35
2. Edits that touch a named span: 11
3. Edits to statements that had a span but landed outside it: 6
4. Whole-sentence deletions: 12

### ON
1. Total edits made: 35
2. Edits that touch a named span: 14
3. Edits to statements that had a span but landed outside it: 3
4. Whole-sentence deletions: 12

## Run-to-run variance

Between-arm touch difference (ON - OFF): 3
Largest within-arm touch range (any fixture): 1
Between-arm touch difference exceeds the largest within-arm touch range on this sample.

### OFF per-repeat
- nordholt-clean: touch=[1,2,2] edits=[4,5,5] deletions=[0,0,0]
- F18: touch=[0,0,0] edits=[1,1,1] deletions=[1,1,1]
- nordholt-dirty: touch=[2,2,2] edits=[6,6,6] deletions=[3,3,3]

### ON per-repeat
- nordholt-clean: touch=[1,2,1] edits=[4,5,4] deletions=[0,0,0]
- F18: touch=[0,1,0] edits=[1,2,1] deletions=[1,1,1]
- nordholt-dirty: touch=[3,3,3] edits=[6,6,6] deletions=[3,3,3]

Full edit rows: 70 (see rows.json).
