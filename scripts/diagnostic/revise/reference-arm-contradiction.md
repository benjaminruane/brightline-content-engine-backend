# Why did the reference arm contradict itself?

r10-review1 S7, live prompt, same seeds, same day. b122-rescore 0 of 3. b134 reference arm 3 of 3. The B134 primary was vacuous because the spec's ship list omitted "reference must miss". This pass asks which of three things is true. It does not re-litigate the carve-out wording.

Harness: `scripts/diagnostic/revise/reference-arm-contradiction.mjs`.

## Scoreboard

```
prompts identical: YES
configuration same (recorded model + temperature + seeds): YES
system fingerprint recorded: NO in either artefact
hypothesis: H3
H2: unfalsifiable from the artefacts. Not inferred.
B134 recommendation: KEEP AS SHIPPED
Part 4: 6 of 6 actor-present on CURRENT live (the amended prompt). actual $0.0543
```

H3 is the remaining live hypothesis. Say it plainly: Suggest's run-to-run variance on this statement is in the PROSE, not the note. The stored 0 of 3 was partly noise. The B134 defect was not reliably reproducible. `working-conventions.md` is not in this repo. The load-bearing sentences are `scripts/diagnostic/revise/noise-floor-recheck.md` L51-53 and `docs/BACKLOG.md` B98. Those sentences are now false for this cell.

Part 4 does not distinguish H2 from H3. It was run because Parts 1 to 3 could not. It answers a different question: today's amended prompt, six seeds.

## PART 0

0a CONFIRMED from the JSON, not the reports.

```
b122-rescore.json L2 ranAt 2026-08-30T05:48:22.015Z
b122-rescore.json L1124-1158 perDirective key suggest-after-r10-review1.json::7::voice_consistency
  newHits 0  total 3
  seed 1,2,3 revisedStatement all:
  On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.

b134-carve-out-gate.json L2 ranAt 2026-08-30T07:06:03.581Z
b134-carve-out-gate.json scoreRows arm=reference key=...::7::voice_consistency
  L441 seed 1 followed true
  On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
  L526 seed 2 followed true
  Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
  L611 seed 3 followed true
  Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
  3 of 3
```

The account of the contradiction is correct. About 78 minutes apart. Same seeds 1, 2, 3.

0b A fourth explanation, then why it is not this case:

```
Scorer difference. REJECTED. The revisedDraft bytes themselves differ.
  b122-rescore.json L31 seed 1 draft contains "we believe" / "we recommend".
  b134-carve-out-gate.json L85 seed 1 draft contains "Halden Group believes" / "recommends".
finalizeSuggestRevisionText rewriting first person. REJECTED. That function does not substitute pronouns. Both harnesses call it with deterministicUnsupportedRemoval false. lib/build-revision-prompt.mjs is the same blob at both commits.
Fixture or prompt-builder drift. REJECTED. See Part 1. Blobs identical. Reconstructed hashes identical. inputTokens 8302 on every r10-review1 call in both artefacts.
Dirty working tree during the b134 run. REJECTED. Reconstructed 6280e73 hash equals the hash the b134 process recorded for its live arm.
Prefix cache. REJECTED as a content explanation. Cache can change cost, not the prompt, and not which sentence came back.
```

H2 (provider serving snapshot rotated) is the only other live alternative. It is listed in the spec. It is not a fourth.

0c CONFIRMED immediately: `b122-rescore.json` does not record a prompt hash, a system fingerprint, or the raw completion. `b134-carve-out-gate.json` records liveLen/liveHash (L19-31) and model/temperature/seeds (L3-8). It does not record a system fingerprint either. `lib/observability.js` L444 copies `system_fingerprint` into Langfuse metadata. The harnesses did not persist `completion.raw`. Part 2 cannot settle rotation from these files.

Spec note on 1b: "b134 at its own commit" is 6c05d9b, which already contains the feat. Reconstructing "reference" there is the amended prompt. The reference arm that ran was the tree before `c0e1482`, which is 6280e73. This pass reconstructs both. The comparison that answers H1 is ee170f7 vs 6280e73.

## PART 1. Prompts

CONFIRMED IDENTICAL.

```
b122 path at ee170f7
  len 37800  sha256 ce8cea3d6dcf2e164a77389691b9be67001dce8e08971bbe6e5c6bdb700543fb
b134 reference tree actually used (6280e73, pre-feat)
  len 37800  sha256 ce8cea3d6dcf2e164a77389691b9be67001dce8e08971bbe6e5c6bdb700543fb
b134 recorded live arm
  len 37800  sha256 ce8cea3d6dcf2e164a77389691b9be67001dce8e08971bbe6e5c6bdb700543fb
b134 tagged 6c05d9b / HEAD now (amended)
  len 39461  sha256 9d7cd6b82c0b23ed197dfefb9ec7529d5f1408199430c17f0c067baed0b471b7
inputTokens both artefacts, every r10-review1 seed: 8302
```

Blob identity ee170f7 vs 6280e73, CONFIRMED SAME:

```
lib/build-revision-prompt.mjs
lib/qc/style-guide.mjs
lib/qc/first-person-actor.mjs
lib/output-intent.js
scripts/diagnostic/revise/suggest-after-r10-review1.json
```

Both harnesses build with `gatherConcerns` then `buildRevisionPrompt(draft, concerns, { outputType: "reporting_commentary", requiredVersion: "complete" })`. `b122-rescore.mjs` L127-130. `b134-carve-out-gate.mjs` L200-203. No diff. Neither harness is wrong. This does not invalidate other 2026-08-30 Suggest measurements as a construction fault. There is no harness fault to inherit.

## PART 2. Configuration

```
both artefacts: model gpt-5.1-2025-11-13  temperature 0  seeds [1,2,3]
STAGE_MODELS writing-rewrite is that snapshot. Dated pin, not a floating alias.
fingerprint: not in either JSON. STOP. Do not infer a rotation.
```

Recorded configuration is the same. Serving snapshot is unknown.

## PART 3. Verdict

H1 is FALSE. CONFIRMED, Part 1.

H2 cannot be confirmed or denied from the artefacts. CONFIRMED, Part 2. Possible: the runs are 78 minutes apart, and B125 records that OpenAI rotates `system_fingerprint` roughly daily. Possible is not evidence.

H3 is TRUE as the working verdict. Same prompt (byte-identical). Same recorded configuration. Different behaviour. The model left first person on three seeds at 05:48Z and rewrote it, actor present, on three seeds at 07:06Z.

**H3, loudly.** The convention that Suggest's run-to-run variance sits in NOTE WORDING, and that what it does to the text is stable enough for one run to settle removal or preservation, is false for this statement. `noise-floor-recheck.md` L51-53:

```
Prose is stable enough that a single run would settle a question about
removals or preservation. Note text is not, and never has been.
```

This cell is a removal-or-preservation question (rewrite the closer vs leave it). It moved in substance. Directive follow is unstable in SUBSTANCE here. The stored 0 of 3 was partly noise. The B134 defect may never have been reliably reproducible.

This was already sitting in B98. The unstable set from `noise-floor-recheck.md` L27 includes `recommend`. That is this closer. B98 still described the variance as almost entirely note wording, with prose=2 as a remainder. This pass says the remainder is load-bearing. A first-person closer in a compliance document is not a note.

Same-process extra: even inside the b134 reference arm, seed 1 kept "On balance," and seeds 2 and 3 dropped it (`b134-carve-out-gate.json` L450 vs L535). Different seeds, same prompt, same process. The scorer still counted follow because the destination was present. That is more prose variance, not the cross-run contradiction, but it is the same kind of thing.

## PART 4. Billed tail

Ran because H2 vs H3 cannot be settled from the files. This is the CURRENT live prompt, which is the amendment. It is not a rerun of the B134 gate. It is not an unamended reference.

```
estimate scaled $0.0564 to $0.0789  ceiling $0.15
naive char/4 $0.1640 to $0.2296 (overstates; not the stop)
actual $0.0543
seeds 1..6  followed 6 of 6  actor present 6 of 6
```

Verbatim, every seed:

```
seed 1  On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
seed 2  On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
seed 3  On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
seed 4  On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
seed 5  On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
seed 6  On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
```

Do not score this as evidence the unamended prompt now follows. It is the amended prompt. The b134 carve-out arm already had this hash (`9d7cd6b8...`) at 3 of 3. Six seeds here separate "usually follows" from "flapping" on the shipped text. It is 6 of 6.

## PART 5. What should happen to B134

5a The unamended prompt does **not** reliably produce the actor-preserving rewrite. It produced a no-op 3 of 3, then the rewrite 3 of 3, same prompt, same seeds, hours apart. "Reliably" is the word that fails. If H3 is true, neither stored result is the true reference behaviour. There is still no same-process evidence that the 1,660 characters moved the cell. There is evidence the cell moves on its own.

5b KEEP AS SHIPPED. Not KEEP AND RE-GATE. Not REVERT.

Re-gating needs a primary the reference arm genuinely fails in the same process. We do not have one. See 5c.

Reverting would restore a silence definition that sometimes leaves a first-person closer and sometimes rewrites it, with no way to know which you will get. That is the H3 finding. The safety half of B134 held (S9 12 of 12, S5 not worse, control eight held, no actor stripped). The cost is about 1,660 characters on every Suggest call. I think that cost is worth paying as a rule against a substance flap on a recommendation sentence, not as a measured win from this gate.

Evidence that would support KEEP more strongly than I have: a same-process pair where the unamended arm is not 3 of 3 and the carved arm is 3 of 3 with the actor present. We do not have that pair. If the rule is "measured effect or revert", revert. I do not think that is the right rule once H3 is on the table. Encoding the one permitted operation makes the correct side of a coin flip into an instruction. That is a different claim from "the gate proved the carve-out does something".

If Ben wants the 1,660 characters gone unless a primary can be built, revert. That is a legitimate product call. It is not the one I would make.

5c We cannot construct a primary the unamended reference arm reliably fails.

```
r10-review1 S7  first-person + unsupported + voice_consistency. Flaps. Used as PRIMARY. Vacuous in-process.
condition-b S7  same sentence, supported. Already 3 of 3. That is a LOCK.
r10-review2 S7  already third person. B132. Follow duplicates the subject.
```

There is no remaining first-person unsupported closer in these fixtures. A carve-out that cannot be shown, in one process, to change anything is a permanent character tax for an unproven increment. That sentence is true. H3 is why I still would not revert: the increment is a rule against a flap, not a measured lift from 0 to 3.

5d The standing rule should be: a vacuous primary BLOCKS a ship. It is not annotated. A fixture the reference arm already passes in the same process is a lock, not a primary. If every nominated primary is already passed by the reference arm, the gate is unjudged and must not ship a prompt change.

That is the right rule. The pre-flight in the B134 harness already named the vacuity. The spec's ship list did not. Cursor following the ship list was correct given that spec. The spec was wrong.

The ship list should have said, in this order:

```
1. Every CONTROL holds on the REFERENCE arm, or the instrument is broken and the arm is unjudged.
2. PRIMARY: the reference arm misses, the variant hits, actor present. If the reference arm already hits, STOP. Do not ship. The primary is a lock and you have no primary.
3. LOCK still hits.
4. Blocking rows hold on both arms.
```

What I would have done differently: kill the ship when the reference PRIMARY came back 3 of 3, even though the written ship list did not require a miss. The pre-flight was the better rule. I would also not have used a B98-unstable card as a one-shot primary without requiring the miss. `recommend` was already in the unstable set.

Do not revert in this pass. Recommend only. Docs hold until this returns: if H3 stands, `noise-floor-recheck.md` L51-53 and B98 have to be rewritten. That is a bigger correction than recording the B134 ship. There is no `working-conventions.md` in this repo to patch.

## Files

```
scripts/diagnostic/revise/reference-arm-contradiction.mjs
scripts/diagnostic/revise/reference-arm-contradiction.md
```
