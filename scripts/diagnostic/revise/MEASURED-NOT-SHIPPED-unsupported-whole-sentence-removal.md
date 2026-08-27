# MEASURED NOT SHIPPED: unsupported whole-sentence removal

Opt-in flag on `buildRevisionPrompt`:

```
opts.measuredUnsupportedWholeSentenceRemoval === true
```

Default is false. `api/suggest-revision.js` does not pass the flag.
Production Suggest keeps the live EDGE CASE (keep-and-flag when cutting would
remove the whole sentence).

Live constant: `UNSUPPORTED_WHOLE_SENTENCE_EDGE_CASE_LIVE`
Measured constant: `UNSUPPORTED_WHOLE_SENTENCE_EDGE_CASE_MEASURED`
File: `lib/build-revision-prompt.mjs`

Scope: kind "unsupported" only. kind "deletion", named-entity keep-and-flag,
and compliance_strip are untouched.

Ship decision: Ben's, after Condition A / B measurement in
`condition-a-removal.md`.
