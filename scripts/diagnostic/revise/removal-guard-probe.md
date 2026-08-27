# Removal guard probe (full-source check)

Commit target:
`chore(revise): probe whether a full-source check catches the F01:S11 removal miss`

Flag `deterministicUnsupportedRemoval` stays OFF. No production wiring.
Cost: **$0.0009** (gpt-4o-mini, temp 0, seed 1).
Ran at: 2026-08-27T09:47:21.994Z

---

## Part 1 result

```
PASS: full-source call finds backing for F01:S11 and would cancel that deletion.
```

### F01:S11 (WRONG)

Draft sentence: We recommend approval.

#### 1a. What Stage 2 saw

Stage 2 `matchSingleSource` already receives the full source text and asks the model to return one `passage` plus a classification (no separate retriever).

Source: `01_bvp_shopify_memo`

Classification: `no_support`

Selected passage:

```
We recommend this investment.
```

Explanation:

```
The statement 'We recommend approval.' is a non-factual procedural closer with no checkable claim. The source discusses the investment case but does not address a recommendation for approval.
```

Deciding source line among selected passages: **YES**

Deciding line (from 8cad514 hand adjudication):

```
We recommend this investment.
```

B115 question: for F01:S11 the deciding line WAS the Stage 2 selected passage. This miss is classification (explanation treats the draft as a non-factual procedural closer), not passage selection.

#### 1b. Full-source call

Model: gpt-4o-mini / temp 0 / seed 1

backs: **true**

supporting_line:

```
We recommend this investment.
```

Guard would cancel deletion: **YES**

Cost this call: $0.0007 (in 4655 / out 20)

### F14:S12 (ARGUABLE)

Draft sentence: We will provide further detail when the work is sufficiently advanced.

#### 1a. What Stage 2 saw

Stage 2 `matchSingleSource` already receives the full source text and asks the model to return one `passage` plus a classification (no separate retriever).

Source: `14_synth_thesis_only_memo`

Classification: `no_support`

Selected passage:

```
We are not recommending any specific investment at this time. We are seeking endorsement of the thesis and authorisation to invest sourcing time accordingly.
```

Explanation:

```
The source does not address the statement about providing further detail when the work is sufficiently advanced. It focuses on seeking endorsement for a thesis and does not mention future updates or details.
```

Deciding source line among selected passages: **NO**

Deciding line (from 8cad514 hand adjudication):

```
We would expect to return with clearer perspectives in the next thesis update.
```

Deciding deferral line was NOT the Stage 2 selected passage; Stage 2 quoted a different thesis-endorsement sentence.

#### 1b. Full-source call

Model: gpt-4o-mini / temp 0 / seed 1

backs: **true**

supporting_line:

```
We would expect to return to the Committee within six months with either a specific transaction memo or a refreshed thesis based on what we have learned.
```

Guard would cancel deletion: **YES**

Cost this call: $0.0002 (in 1217 / out 43)

---

## Part 2 proposal only (not implemented)

### Hook

- Gate body: `lib/pr9-deterministic-unsupported-removal.mjs` `applyDeterministicUnsupportedRemoval` (approx L309-L509).
- Call site: `lib/build-revision-prompt.mjs` `finalizeSuggestRevisionText` (approx L920-L930), after cut-punctuation, before marker honesty.
- Proposed insert: after a statement is planned for removal (whole-sentence match found, empty-draft not tripped) and **before** mutating `draft` / placing CUT remnant (before the deletion loop body around L364+). Async guard does not fit the current sync finalize path; either (a) make finalize async and await guard results for planned removals, or (b) run the guard earlier in `api/suggest-revision.js` after concerns are gathered and pass a `guardCancelSet` of statement indices into finalize/opts.
- Prefer (b) for a first ship: keep `applyDeterministicUnsupportedRemoval` sync; add `opts.guardCancelledStatementIndexes` (Set/array). If index is listed, emit `action: "skipped", reason: "full_source_guard_backed"` and leave text alone (today's flag behaviour for that sentence).

### Model and parameters

- `gpt-4o-mini` via OpenAI, temperature 0, seed 1, JSON response (same shape as this probe).
- Why mini: guard is a binary backing check with a short quote, not Stage 2 taxonomy. Cost and latency dominate because it may run once per planned deletion and must read full source text.
- One call per (statement × source) for planned removals only, or one call per statement with all sources concatenated and labelled. Prefer per-source so a single backing source cancels.

### Cost (worst realistic case)

- This probe: 2 calls, total **$0.0009** on the F01+F14 sources.
- Breadth audit upper bound: 11 planned removals. If each has 1 source ~2k-20k chars, rough order **~$0.01 to $0.05** per draft at gpt-4o-mini rates for 11 full-source checks (dominated by long memos like F01/F15).
- Multi-source cases (F22/F23 style): up to sourceCount calls per statement unless short-circuit on first backs=true.

### Error / timeout failure mode

- CONFIRMED requirement: failure must be **do not delete**. On parse failure, provider error, timeout, or missing API key: treat as `backs: true` (cancel deletion) or skip the removal event with reason `full_source_guard_error`.
- Never delete when the guard did not return a clear `backs: false`.

### UI recording

- Yes, record on the Suggest response / diagnostic payload: per cancelled statement `{ statementIndex, reason: "full_source_guard_backed", supportingLine, sourceLabel }` so operators can see why a flagged unsupported sentence was kept.
- Do not invent a new user-facing marker intent for a cancelled deletion; leave today's unsupported flag path alone.

### What could go wrong

- F01 shows Stage 2 already had the deciding passage and still said no_support (classification miss, not B115 passage miss). A full-source yes/no prompt can still help if it avoids Stage 2's procedural-closer framing, but the same model family could repeat the miss under a different prompt.
- False cancel (backs=true on true unsupported): undoes the deletion benefit; safe direction but weakens the feature.
- False delete (backs=false when source backs): same class of harm as today; failure mode must bias to cancel.
- Long sources: context limits / cost; may need truncation policy (if truncated, fail closed: do not delete).
- Latency on Suggest finalize path if awaited inline; prefer parallel guards for all planned removals.

---

## Pass conditions

- Part 1: full-source finds F01:S11 backing and would cancel: **PASS**
- Cost stated: PASS ($0.0009)

