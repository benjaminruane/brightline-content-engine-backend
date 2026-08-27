# Deterministic unsupported whole-sentence removal (after reviser determinism audit)

Commit target:
`feat(revise): deterministic unsupported whole-sentence removal, behind diag flag, after reviser determinism audit`

0559301 measured EDGE CASE stays OFF. Production `api/suggest-revision` does not
pass `deterministicUnsupportedRemoval`.

Identity: eval-ablation Meridian / `meridian_source.txt`. Not claim-spans CS_E3.
Not corpus E3:S0:ic_memo.

---

## Part 1a: Prompt build determinism (zero cost)

Built the reviser prompt THREE times in one process from
`suggest-after-r10-review1.json` via `gatherConcerns` + `buildRevisionPrompt`.
No model call.

```
hash1  3e406069bafef21cc62397b78d434427b388542e7d4da6d807587b5d4cada6bd
hash2  3e406069bafef21cc62397b78d434427b388542e7d4da6d807587b5d4cada6bd
hash3  3e406069bafef21cc62397b78d434427b388542e7d4da6d807587b5d4cada6bd

identical: YES
```

Suspects checked (no fix required):

```
gatherConcerns L436-496
  Iterates statements by array index 0..n-1. No Object.keys iteration over
  unordered maps for concern emission. Sets used only as membership sets
  (COMPLIANCE_*_CODES L123-138; seen-span dedupe L331). Order is input order.

formatConcernsBlock L566+
  Walks the concerns array in order. Excerpt / conflict fields taken from the
  card as already assembled by Review.

buildRevisionPrompt
  No Date, uuid, or Math.random in the prompt string.
  No locale-dependent float formatting of concern content.

Verdict: prompt assembly is deterministic for a fixed Review artefact.
```

---

## Part 1b: Model call parameters

### Reviser (`api/suggest-revision.js`)

```
File: api/suggest-revision.js
Model config: STAGE_MODELS["writing-rewrite"]
  provider/model: openai / gpt-5.1  (lib/qc/model-config.mjs L14)

callLLM at L91-L100 (rewriteOnce):
  temperature: 0
  seed: 1          (ADDED this pass; was absent)
  messages: [{ role: "user", content: prompt }]
  no system message (prompt is the sole user content; not trimmed beyond
    ordinary string build)
  response_format: not set (plain text)
  max tokens: not passed from Suggest; OpenAI branch in
    lib/observability.js callProviderOnce L285-296 does not set max_tokens
    for OpenAI chat completions (Anthropic path uses max_tokens: 4096)

Retry path L121-L136:
  Same rewriteOnce -> same temperature 0 and seed 1.
  Trigger: review-vocabulary hits in revisedDraft. Does not change params.
```

### Stage 2 comparison

```
lib/qc/pipeline-v4/stage2-match-sources.mjs
  STAGE2_SEED = 1  (L59)
  temperature: 0, seed: STAGE2_SEED on match calls (L1069-1070 and siblings)

Reviser now matches Stage 2 on temperature 0 and seed 1.
Seed is best-effort, not a guarantee (provider may ignore).
```

---

## Part 1c: Noise floor re-measure (after 1a/1b)

Suggest x3, shipped prompt, reused Condition A Review, seed 1.

```
BEFORE (45db80d, no seed):
  7 of 10 unstable across three runs, prompt unchanged
  identical 3 | intent 1 | note-only 3 | prose 3

AFTER (this pass, seed 1):
  8 of 10 unstable across three runs, prompt unchanged
  identical 2 | intent 2 | note-only 4 | prose 2

identical after: fund_desc, hold_period
```

Seed did not tighten the band. Model output remains unstable on this draft.
Therefore Part 3 runs x3 per arm (not one).

Artefacts: `reviser-noise-floor-run{1,2,3}.json`, `reviser-noise-floor-meta.json`.

---

## Part 2: Deterministic removal (diag flag)

### Mechanism

```
File: lib/pr9-deterministic-unsupported-removal.mjs
Hook: finalizeSuggestRevisionText after cut-punctuation, BEFORE honesty
  (lib/build-revision-prompt.mjs finalizeSuggestRevisionText)

Flag: opts.deterministicUnsupportedRemoval === true (default false)
Production api/suggest-revision does NOT pass it.

Gate:
  evidence.kind === "unsupported" only
  statementText matches revised draft (exact, then whitespace-normalised)
  match is a whole sentence (no leftover words in sentence bounds)
  no claims with role confirmed_preserve
  never acts on partial / conflict / deletion / soften / craft / compliance

Execution:
  delete sentence + trailing separator
  re-anchor CUT on a free remnant word (previous sentence preferred)
  if neighbour sentence is wholly wrapped by one marker, carve the last word
    free from that marker, then CUT
  if every neighbour word is marked (many markers), skip both_neighbours_marked
  remap offsets via remapMarkersAfterDeletion (same shift style as
    ensureMarkerSentenceTerminalPunctuation L868-894)
  note: "Removed this sentence - no supplied source backs that claim.
        Confirm before publishing."

Empty-draft guard:
  if planned deletion trims to empty -> keep sentence, KEPT, loud note.
```

### Exact final empty-draft note string

```
No supplied source supports this. It has been kept only because removing it
would leave the draft empty. Confirm before publishing.
```

CONFIRMED: `normalizeMarkerNoteText(DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE)`
and unit test. Emphatic body survives; closer appended only.

### Honesty interaction

```
After genuine removal, cut_but_text_present must not fire on the remnant CUT.
cut_but_text_present was refined to whole-sentence wraps only (remnant inside
an unchanged neighbour is not dishonest). Unit + finalize hook assert this.
```

### B88 note

```
Whole-statement unsupported spans remain stripped from the prompt at
build-revision-prompt.mjs L271-274. Code removal bypasses that by design.
Observable contradiction: none on the user-facing draft. The prompt still
avoids delete-the-sentence cues; deletion happens after the model returns.
The model may still keep-and-flag deepen; code then removes it when the flag
is on.
```

### Unit coverage

```
12 tests in tests/pr9-deterministic-unsupported-removal.test.mjs: all pass.
Honesty suite still green (21). Cut-punctuation suite green.
```

---

## Part 3: Measure (flag OFF vs ON)

```
Review reused: suggest-after-r10-review1.json
Prompt: shipped (0559301 OFF)
seed 1, temperature 0
Runs per arm: 3 (noise floor not identical)
```

### Bar score (arm ON, all three runs)

```
1 deepen gone from revised draft:     PASS (3/3)
2 marker intent CUT on remnant:       PASS (3/3)  remnant example: "basis"
3 note names no supplied source:      PASS (3/3)
   verbatim:
   Removed this sentence - no supplied source backs that claim. Confirm before
   publishing.
4 no honesty event on that CUT marker: PASS (3/3)
   (other honestyEvents may exist on lead/recommend; none on the removal CUT)
```

### Arm OFF

```
deepen present on 3/3. No deterministic removalEvents.
```

### Raw per-card table (majority presence / prose class)

```
card         off x3                         on x3
----         -----------------------------  -----------------------------
lead         present, unchanged (3/3)       present, unchanged (3/3)
exceptional  present, figures inject        present, figures inject
ranking      present, top-quartile cut      present, top-quartile cut
risk         present, recast (2/3 majority) present, recast (varies 1/3)
mark         present, marked-at             present, marked-at
fund_desc    present, identical             present, identical
hold_period  present, identical             present, identical
recommend    present, Halden Group          present, Halden Group
coinvest     present, no-fee/no-carry       present, no-fee/no-carry
deepen       present (3/3)                  ABSENT (3/3)  <- flag effect
```

### Controls vs noise band

```
Vacuous controls (identical in Part 1c band): fund_desc, hold_period.
  Hold across arms. Vacuous-control guard satisfied.

Other cards that vary within an arm (risk, coinvest, notes on lead/recommend)
sit inside the measured band (8 of 10 unstable). Majority presence/prose class
does not move OFF->ON except deepen.

INTERFERE outside band: NO.
KILL: NO (cleared sentences not deleted by the flag).
```

### Verdict

```
CONFIRM.

Bar items 1-4 pass on arm ON (3/3). Arm OFF leaves deepen.
Controls scored against the band; only deepen moves OFF->ON by design.
0559301 remains OFF. Flag remains diag-only (not passed from production API).
```

---

## Cost

```
Part 1a: $0
Part 1b: $0
Part 1c noise floor x3: ~$0.15
Part 2 units: $0
Part 3 measure 6 Suggests: ~$0.50
--------------------------------
Total this pass: ~$0.65
(Plus two aborted Part 3 attempts during remnant-carver fix, ~$0.50;
 grand wall ~$1.15 if counted.)
```

---

## Opinion

```
Prompt build was never the noise source. Seed 1 did not help. Code-side
removal is the right lever: with the flag on, deepen is gone on 3/3 despite
model instability.

Ship path: keep the flag OFF in production until Ben enables
deterministicUnsupportedRemoval in api/suggest-revision after a product
pass. Do not turn on 0559301.
```

---

## Technical summary

- Prompt hashes identical; reviser call now uses seed 1; noise floor still
  8/10 unstable.
- `applyDeterministicUnsupportedRemoval` gated by
  `deterministicUnsupportedRemoval`, wired into finalize before honesty.
- Measure: arm ON removes deepen with CUT remnant and honest note on 3/3;
  arm OFF does not. Production API unchanged (flag off).

## Plain-language summary

Suggest still wobbles from run to run, even with a seed. Separately, when the
diagnostic flag is on, the backend itself deletes a sentence that no uploaded
source supports, labels a neighbour word as removed-for-no-source, and leaves
everything else to the usual rewrite. That flag is not on for users yet.
