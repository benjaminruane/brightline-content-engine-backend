# Cross-document disagreement findings

Read-only diagnostic, 2026-09-13. No pipeline, extract, evidence pass, action-list, or accuracy run. No LLM calls. Metered spend: **USD 0.00**. The only file written is this one. No product code changed.

**The question.** When two uploaded documents give different values for the same quantity, and one of them matches the draft, what does the product do — and is B173 a small copy slice on the current conflict-proposal track, or a chapter?

**Short answer.** On current Stage 3 (conflict-wins, `9f8fc41`) the card lands **conflicting**, a contradicted evidence finding **is** produced, and the locator will propose the figure from the painted conflicting excerpt. R1 does not veto a confirming span on a different `sourceRefId`. That is why F18 still PROPOSE. B173 is on this card; the proposal work is not moot. What makes it a chapter rather than a template is Q3: the product has no reliable field that tells an update from a peer disagreement. A veto that fired on every two-source disagreement would also refuse the F18 updates the owner already licensed.

**Sources used.**

- Verdict path: `lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs`, `lib/qc/pipeline-v4/index.mjs`, `lib/qc/supersession.mjs`, `lib/qc/pipeline-v4/stage4-select-excerpts.mjs`, `lib/revise-actions/{inventory,silence,conflict-engagement,decision-copy,run}.mjs`.
- Committed fixtures: `scripts/diagnostic/fixtures/` (27 JSON, style-guide rule files excluded from the multi-source count).
- Committed accuracy cards: `scripts/diagnostic/accuracy/runs/*/cards.json`. Counts that name figures come from **lift-1** (`evidence-pass-lift-1/cards.json`, 261 cards, span passages present). Earlier passes (`evidence-pass-1/2`, `cw-1/2`) compact away `supportSpans` passages, so they cannot tokenizer-count values.
- Committed live Review: `scripts/diagnostic/delivery-check/live-2026-09-10-f18-review.json`.
- Extra committed pair rows (not in the named run folders; used only to corroborate F22/F23, which are outside the frozen 01–20 pack): `scripts/diagnostic/eval-ablation/r10-corpus-blast-rows.json`.
- Local gitignored batches (on disk, not in git): `scripts/diagnostic/runs/**/result.json`. Integers from those files are labelled below. A clone without that folder cannot reproduce them. Those batches are also **pre-conflict-wins** (August 2026).
- Narrative: `docs/ROADMAP.md` (R1 ruling; B173 next on the delivery track), `docs/BACKLOG.md` B173 / B105 / B169.

Card ids: `F<fixture>:S<index>`. Locator codes below are from applying `applyConflictProposal` in memory to stored cards. That is not an action-list run and called no model.

---

## Q1 The verdict question

**Verdict: it lands as conflicting. A contradiction finding is produced. B173 stays on this card. The proposal work is not moot.**

It does not land as confirmed or partially confirmed on current code, given that Stage 2 actually classified the disagreeing source as `conflicting` (or a widened span did).

### Trace

1. **Stage 2** classifies each statement × source pair on its own. A source that states the draft’s figure is `confirmed` (or `partially_confirmed`). A source that states a mutually exclusive same-metric figure is `conflicting`. The R10 prompt (`lib/qc/pipeline-v4/prompts/stage2_v4.md`) says so in those words. Pairs do not know about each other.

2. **Intra-source reducer** (`lib/qc/pipeline-v4/intra-source-reducer.mjs`) is per `sourceRefId`. It cannot turn a cross-document disagreement into a confirmation.

3. **Stage 3** (`aggregateVerdict` in `stage3-aggregate-verdict.mjs`) is conflict-wins: any reduced pair `conflicting` → verdict `conflicting`, `hasConflict` true. A confirming source does not outrank a contradicting one. Claim-span rollup is upgrade-only and **cannot** override a whole-sentence conflict. Coverage-union promotion refuses to run when `hasConflicting` is true.

4. **Supersession** (`resolveSupersession`, after Stage 3) is the only later step that can overwrite a conflict to `confirmed`. It does that only when every covering source is confidently dated from **source text**, the **newest** covering source **agrees** with the draft, and the older conflicting source is a **different period**. Same-period disagreement is not supersession. If the newest dated source **disagrees** with the draft, the function returns empty and the conflict stands.

5. **Stage 4** on a `conflicting` verdict paints the first conflicting match (upload order) as `primaryExcerpt`. `conflictExcerpt` is filled only when `hasConflict` is true **and** the verdict is not already `conflicting`. So the locator’s pairing excerpt on this card **is** the contradicting passage.

6. **Inventory.** `isEvidenceGap` is true for `supportState === "conflicting"` / `displayVerdict === "conflict"`. That emits one evidence finding with `rule: "conflicting"`. `isContradictedEvidenceFinding` is true. `fillAction` then runs `applyConflictProposal` and never calls the rewrite model.

Live F18 S3 is the exhibit: source 0 `confirmed` (380, matches the draft), source 1 `conflicting` (412), `displayVerdict: "conflict"`, `hasConflict: true`, `supersededSourceNotes: []`. Locator status `replace`, code `correction`. Same shape on S4, S5, S8. That is exactly “one source matches the draft, the other does not, and the product proposes the other.”

F18 both documents **are** dated (`Date: 15 April 2025` vs `Date: 28 May 2025`). Supersession still did not fire, because the draft matches the **older** memo. The update is treated as a contradiction, not as an authority. `supersededSourceNotes` is empty on all ten live F18 cards.

### What would make this a different card

If Stage 2 called the disagreeing source `no_support`, Stage 3 would be `confirmed` (any-confirmed). No evidence finding, no proposal, B173 would be a Stage 2 miss. That is not the designed case and not what live F18 S3–S5/S8 do.

If supersession fired (draft matches the newest dated source), the badge would go green and the finding would disappear. That is a different case: one document **does** supersede. B173 is the case where neither does.

Gitignored August 2026 batches (not clone-reproducible, pre-`review-conflict-wins`) did land F22:S3 and F23:S2 as `supported_full` with `hasConflict: true` on the same span mix (confirming IC memo, conflicting update). That is old aggregation. Current Stage 3 would paint those **conflict**. Do not use those integers as today’s verdict.

---

## Q2 Does the case exist anywhere today

**Committed runs in the named folders: 5 statements, all on F18, all the initial-memo / update pair. Peer disagreement (neither document is an update of the other): 0.**

### Fixtures (`scripts/diagnostic/fixtures/`)

27 fixture JSON files. **Three** have two or more sources:

| Fixture | Sources | Planted quantity disagreement on a draft sentence |
|---|---|---|
| **F18** `synth_cross_source_pair` | initial memo + update | Yes: customers 380 vs 412; ARR EUR 38m vs 35m / March vs April; headcount 142 vs 167; hold path 38→95 vs cleaned 35; 2.8x/23% vs 2.6x/21% |
| **F22** `alp_multisource` | ALP IC memo + update | Yes: staff 210 vs 240. Returns 2.4x/19% vs 2.3x/18% sit in the sources, not in the draft |
| **F23** `crf_multisource` | CRF IC memo + diligence update | Yes: 1.2 GW vs 1.4 GW |

Every one of those three is an IC memo plus a later update. There is **no** committed fixture that is two peer documents (fact sheet vs performance report, two contemporaneous memos, etc.). B173’s own backlog row already said the pinned table contains no case and it needs its own fixture. That is still true.

F13 is the self-disagreement fixture: **one** source, two passages (320 vs 285). Different problem. R1’s own fixture.

### Committed accuracy (`scripts/diagnostic/accuracy/runs/`)

Frozen pack is fixtures **01–20**. F22 and F23 are not in it. The only multi-source fixture in the pack is F18.

Tokenizer on lift-1 `supportSpans` passages (asserted tokens, citation windows stripped the same way the locator strips them), requiring two `sourceRefId`s and a draft token matching one side:

| Id | Draft matches | Other source | Verdict |
|---|---|---|---|
| **F18:S3** | 380 (source 0) | 412 (source 1) | conflict |
| **F18:S4** | EUR 38 million / March 2025 (source 0) | EUR 35 million / April (source 1) | conflict |
| **F18:S5** | 142 (source 0) | 167 (source 1) | conflict |
| **F18:S7** | EUR 38 million (source 0) | EUR 35 million (source 1) | conflict |
| **F18:S8** | 2.8x and 23% (source 0) | 2.6x and 21% (source 1) | conflict |

**Count: 5.** All five have one source matching the draft.

Mixed Stage 2 class (one source confirming, another conflicting) without a same-quantity tokenizer hit: **F18:S0** (complete vs recommend). Not Q2’s quantity case.

Other accuracy `cards.json` with span passages (`reducer-1/2`, `rt-1/2`, `spans-1`) carry the same F18 five. Passes without span passages (`evidence-pass-1/2`, `cw-1/2`) cannot tokenizer-count; they still show the F18 mixed-class rows on sourceMatches where those were stored.

### Committed delivery-check

`live-2026-09-10-f18-review.json`: the same five F18 statements, same span mix, same conflict badge. F22/F23 are not in that file.

### Superseeding subset

**5 of 5** committed-run hits are F18 initial vs update. Fixture-planted F22 staff and F23 capacity are the same class (memo vs update), but they have **no** committed qcCard in the named run folders.

**Peer subset: 0.**

### Local gitignored batches (not clone-reproducible)

323 `result.json` files under `scripts/diagnostic/runs/`. F18 / F22 / F23 appear in 16 / 12 / 12 of those files. Sample `2026-08-16-164658`: F22:S3 (210 vs 240 spans) and F23:S2 (1.2 vs 1.4 spans) exist, and both cards are `supported_full` with `hasConflict: true`. Pre-conflict-wins. Do not add those to the committed count.

---

## Q3 Can the data tell an update from a disagreement

**Nothing reliable exists.** That is the load-bearing answer. The product cannot currently tell “this document supersedes that one” from “these two documents are peers.”

Per source, what is actually carried:

| Field | Where it lives | Populated in committed runs? | Reliable as peer-vs-update? |
|---|---|---|---|
| **Extracted as-of date** | Computed at pipeline time from **source text**, first ~15 lines, structural cues only (`Date:`, `Dated:`, `As of`, `As at`, dateline, standalone header date). `extractSourceAsOfDate` in `lib/qc/source-recency.mjs`. **Not stored on the qcCard.** Used by recency concerns and by `resolveSupersession`, then discarded except as a prose note if supersession fires. | F18 both files: yes (`15 April 2025`, `28 May 2025`). F22 IC memo: **null**. F22 update: `March 2025` via the body phrase “as of March 2025” in the first 15 lines (KPI date, not a document date). F23 IC memo: **null**. F23 update: `April 2025` the same way. Live F18: no as-of field on the card; `sourceRecencyConcerns` empty on all 10. | **No.** Missing on one side of F22/F23. On the update side it can latch onto a figure’s “as of”, not a document date. Same-period peers with dates would still not be supersession (code already refuses same-period). Undated peers are invisible. |
| **Upload order / `sourceIndex`** | Array position of the uploaded source. Always assigned. | Always. Live F18: 0 = initial, 1 = update **because the fixture listed them that way**. | **No.** Re-order the upload and the ids swap. Order is not “newer.” |
| **`sourceRefId`** | Equals `sourceIndex` (`stage2-match-multipassage.mjs`). Join key for spans. | Always on `supportSpans` in lift-1 and live F18. | **No.** Identity, not recency. R1 already uses it as “same document,” which is the right use. |
| **Filename / `sourceLabel` / `name` / `title`** | User-supplied at upload (`name`, `title`, `filename`, `label`). Diagnostic harness sets `label` to the filename stem (`loadPipelineSources`). Live F18 kept the `.txt` suffix: `18a_synth_cross_source_pair_initial.txt` / `18b_…_update.txt`. Stage 2 `normalizeSourcesInput` prefers `label`, then `name`, else `Source ${i+1}`. Copied onto `stage2SourceFingerprints[].sourceLabel` and `primaryRefTitle` (painted excerpt only). Compacted accuracy rows drop the labels. | Live F18: both labels present. Lift-1 compacted `sourceMatches`: classification + sourceIndex only, **no label**. | **No.** A user can name files anything. “update” in a filename is a convention, not a contract. |
| **Document type / label** | There is no per-source document-type enum for “memo / fact sheet / update.” Job `outputType` is the **draft** type. | Not a source field. | **No.** |
| **`publicationState`** | User-supplied at upload: `published_external` \| `restricted` \| `unknown`. Compliance calibration only (`lib/source-publication-state.mjs`). Default `unknown`. | F21 fixture sets it. F18/F22/F23 fixtures do not. Live F18 does not show it on the card. | **No.** Public vs restricted is not newer vs older. |
| **`supersededSourceNotes`** | Computed string after Stage 3 when supersession actually demotes a source. Assembly copies it onto the card. Frontend does not render it (delivery-check findings.md: COMPUTED BUT NEVER SHOWN). | Live F18: **empty array on 10/10 cards**, including the five quantity disagreements. | Empty does **not** mean “peers.” It means the supersession gate did not fire. On F18 it did not fire because the draft matches the older memo. |
| **User “this supersedes that”** | Does not exist. | — | — |

No other per-source date, version, or predecessor id is on the upload object (`api/analyse-statements.js` prepares `text`, `name`, `title`, `label`, `mimeType`, `publicationState`).

---

## Q4 What the veto would read

**`supportSpans` per span:** `sourceRefId`, `classification`, `statementId`, `passage`, `start`, `end`. Confirmed from `buildSupportSpans` and from live F18 S3. Schema in `lib/qc/qc-api-schema.mjs` is that set. **No display name on the span. No extracted figure field.** Classifications on spans are `confirmed` | `partially_confirmed` | `conflicting` (`no_support` pairs are not widened into spans).

**Can the tokenizer name both figures from the passages?** Yes. `tokenizeQuantities` already runs on span passages inside R1 (`passageAssertsDraftValue`). On live F18 S3 the two passages tokenize to 380 and 412; S4 to EUR 38 million vs EUR 35 million; S5 to 142 vs 167; S8 to 2.8x/23% vs 2.6x/21%. Copy could name both figures from the existing spans. It would still need the same identity rules the locator already uses (kind, names, citation-window stripping). Kind-only pairing will invent noise (lift-1 S3 also tokenizes `240` / `000` off `240,000` vs `412`). Do not treat raw kind-and-value as identity.

**Is the source display name available at locator time?** On a live card, yes, but **not on the span**. Join `card.stage2SourceFingerprints[].sourceLabel` where `sourceIndex === span.sourceRefId`. The painted excerpt’s name is also `card.primaryRefTitle` (one document, the conflicting one, when Stage 4 chose that excerpt). Compacted accuracy cards do not carry fingerprints or labels; a veto written only against compacted `sourceMatches` cannot name documents. Production Review cards are the live shape.

Confirming-passage selection (`selectConfirmingPassage`) is same-`sourceRefId` only. It will not paint the other document’s confirming span. Naming both documents is new work on the existing finding, not that slot.

---

## Q5 Does R1 ever fire today

**On a production-shaped card, only on its own fixture. The veto path is almost unexercised.**

Committed JSON in the named folders **never stores** `explainCode`. There is no committed action-list output to count. The numbers below are the locator applied to stored cards (no model).

Lift-1, 18 conflict cards:

| Id | Locator code | Why |
|---|---|---|
| **F13:S7** | `self_disagreement` | Same `sourceRefId` 0 has a confirming 320 span and a conflicting 285 span. This **is** R1’s fixture. |
| **F18:S7** | `self_disagreement` | Compact-card artefact. Lift-1 stores `sourceMatches` (source 1 `partially_confirmed`) and a source-1 span that is only `conflicting`. R1’s fail-closed branch treats “compact supporting class + no supporting span passage” as a veto (`r1Vetoes`, empty `supporting.every(...)` is true). |
| F18:S3/S4/S5 | `correction` (replace) | Different `sourceRefId`; R1 correctly does not fire. |
| F18:S8 | `qualifier_silent` (replace) | Same. |
| Other 12 conflict cards | unaddressed, no code | Qualitative / unpaired. |

Live F18 (full cards, **no** `sourceMatches` field; fingerprints instead): **R1 never fires.** S7 is `dependents` (R5), which is the intended code on that sentence. S3/S4/S5 replace; S8 qualifier_silent.

Unit test `tests/revise-actions-quantity-match.test.mjs` is the only designed R1 pin (F13-S7).

So: R1 fires on F13-S7, and on compacted F18-S7 for a reason that does not exist on a live card. It has never been seen to fire on a two-document disagreement, because it is specified not to.

---

## Q6 Where the copy would go

**A new explain code plus one closed template in `decision-copy.mjs` is the display line. It is not the whole change.**

What is already the display surface:

- `fillDecisionCopy` fills `explanation` (and ACKNOWLEDGE `noProposalReason` from the same string in `fillAction`).
- `TEMPLATE_IDS` is the pinned list. `tests/revise-actions-decision-copy.test.mjs` fails if a key is added there without a pin in `PINNED` / `FILLED`.
- `EXPLAIN_CODES` is the sibling enum the locator actually emits. A new code must join **both** lists.
- Public action-list row already carries `explanation` and optional `explainCode`. Frontend is specified not to display the code; it **does** use a non-null `explainCode` to hide `reasoningParagraph` (`explain-the-decision-design.md` §f). A new truthy code reuses that hide. The closed enum listed in that design would need the new id.
- No new card section, no second finding, no tooltip. Same slot as `self_disagreement` / `dependents`.

What else would have to change, or the template never shows:

1. **`applyConflictProposal`** must emit the new code (a veto, parallel to R1, across `sourceRefId`s). Copy without a producer is dead.
2. **Locator values** for both figures and both display names (Q4). `self_disagreement` today only carries `{ figure }`.
3. **Confirming-passage chrome** will not name the other document; do not stretch it.
4. **Generic fallback** (`GENERIC_CONTRADICTION` / `NO_PROPOSAL.conflict_unaddressed`) still sits under uncoded declines. If the new veto fails to fill, the reviewer sees “A source contradicts this statement…” — one source, no figures — which is the silence B173 forbids.

Nothing on the evidence badge, Stage 2, or Stage 3 needs to change for the copy to appear, **if** the card is already `conflict`. Q1 says it is.

---

## Rank

**A chapter, not a small slice on the current track.**

The single thing that decides which: **whether the product can tell an update from a peer disagreement.** It cannot (Q3). A template-and-veto that fires whenever two `sourceRefId`s disagree would also refuse every F18 update the owner licensed under R1. A template that fires only when “neither supersedes” has no signal to read. B173 already said it needs its own fixture. Q2 shows why: every committed instance is a memo/update pair, and there is no peer case to pin.

Q1 keeps the work on this card (conflict finding + proposal layer). Q3 is why it is not “add one template next to `self_disagreement`.”

Metered spend for this pass: **USD 0.00**.
