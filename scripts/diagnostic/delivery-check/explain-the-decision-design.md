# Explaining the decision on the card

Design pass, 2026-09-11. Covers **B174** and **B172** as one question: when the product knows more than the verdict, is that better wording on a finding it already shows, or a finding of its own? Do not build from this note until Ben rules the two cards. No product code changed here. No LLM call, pipeline, action-list run, or accuracy run. Metered spend: **USD 0.00**.

Shipped state: `4536ac7`. Safety line, not open for redesign: the product never says “this might be wrong”; it says what the source did and did not say.

Does not close **B159**, **B171**, **B173**, or **Pr16**. Does not close **B172** or **B174** until the ruled cards are built.

---

## Part 0. Verify before designing

### E1 BLOCKING — the code decides, then throws the decision away

**Verdict: confirmed, with one correction.** At the moment of the branch the locator knows which test fired. After `unaddressed()` returns, that knowledge is gone. `fillAction` then maps every non-`replace` outcome, including “unengaged”, onto one string:

> A source contradicts this statement. Nothing is proposed. Decide whether the sentence should match the source.

`NO_PROPOSAL.conflict_unaddressed` in `lib/revise-actions/sort.mjs`. `applyConflictProposal` in `lib/revise-actions/conflict-engagement.mjs` returns `{ status: "unaddressed", pairs: [], proposal: null }` with no reason field. `r1Vetoes || r5Vetoes` both set `blocked = true` and stop. `findCandidatePairs` returns `[]` for every identity failure. Claude is right that the decision exists in code. Claude is wrong if that is read as “the reason is sitting on the finding ready to print.” An eventual build must **record the reason at the branch**. It cannot reconstruct it later without re-running the same tests, which is the same work, so record it the first time.

**Every distinct decision the locator and fill path can now reach**

Declines that today print the generic sentence (the reason is computed, then discarded):

| # | Where | What fired | Live exhibit |
|---|---|---|---|
| D-ident | `findCandidatePairs` → `[]` | No quantity tokens | F05-S0, F14-S11 |
| D-same | skipped, values equal | Same figure both sides | F08-S2 78%, F15-S2 720 million, F18-S2 158/60% |
| D-kind | `kindKey` / currency clash | Percentage vs count, money vs count, EUR vs bare, million vs billion | F15-S11 18 vs 18% |
| D-name | empty name, Jaccard < 0.6, abbreviation clash | Not the same quantity | F17-S9 40 percent of leases vs 18% reversion; F19-S2 closed-at vs proceeds |
| D-two | two source figures match one draft name | Ambiguous; return `[]` | (hygiene; F13 components are filtered first) |
| D-qual-diff | R6 DIFFERENT qualifier | Gross vs net, inception vs LTM | B159 shape; not on live F18 after naming |
| D-qual-missing | R6 source has no qualifier, does not name the draft figure | Unqualified source IRR vs draft gross IRR | same family |
| D-words | word-numbers, out of scope | `four years` / `eighteen months` | F12-S0 |
| D-R1 | `r1Vetoes` | Same source also asserts the draft figure | F13-S7 320 and 285 |
| D-R5 | `r5Vetoes` | From–to / total with components / N% of a base; destination not licensed | F18-S7 38 → 95 |
| D-R3 | `assembleR3Write` `year-ambiguous` (and R4 then drops the sentence) | Source month earlier in the year than the draft month | guard test, not live F18 |
| D-R3-skip | `no-draft-year` | Date not written; other figures may still write | F18-S5 `28 May` not copied |
| D-verbatim | `finishedSentenceIsLicensed` false | Finished sentence contains a value not in the excerpt (except R3) | guard test |
| D-unengaged | candidate sentence ≠ locator sentence | Voice-only model result on a closable conflict | unit test; fill path still generic ack |

Proposals that today print `The source gives X, not Y.` (and throw away everything else the locator knew):

| # | Condition | Live exhibit |
|---|---|---|
| P-same-qual | Name match, values differ, same qualifier (or both absent) | F18-S3 380→412; F18-S5 142→167; W2 18.4%→11.2% net |
| P-named | R6: source has no qualifier, names the draft figure, offers a replacement | F18-S8 23%→21% with `gross` left in the sentence |
| P-multi | R2/R4: every licensed figure written | F18-S4 38→35 and March 2025→April 2025; F18-S8 both returns |
| P-R3 | Source month, no year; draft year inherited because source month ≥ draft month | F18-S4 April + 2025 |

Fill-path decisions on contradicted evidence that are **not** locator reasons (out of scope for the copy set below, listed so they are not silently reused): first-person without a pronoun; first-person with no house name in the draft; placeholder leak; unlicensed organisation write. Those already have their own `noProposalReason` strings. Do not fold them into this pass.

### E2 BLOCKING — the commentary already says some of it

Checked against `scripts/diagnostic/delivery-check/live-2026-09-10-f18-review.json` (`reasoningParagraph` = `evidenceSummary` on these cards). That payload is the card-face paragraph. The 2026-09-10 run predates `4536ac7`; the **paragraph** is still what a reviewer reads, because Stage 5 was not retuned.

| Card | Paragraph already covers | Paragraph does not cover | Overlap with a locator explanation |
|---|---|---|---|
| F18-S0 complete vs recommend | Completion vs recommendation. Asks the reviewer to reconcile or remove. | Nothing about figures; there are none to swap. | Full overlap with a generic ack. |
| F18-S2 invested vs recommend | Same modality conflict. | Same. | Full overlap with a generic ack. |
| F18-S3 380→412 | 380 vs 412. Confirms 240,000 units. Asks for correction. | That 240'000 is unmatched and left in place (R4 does not block). | Full overlap with `The source gives 412, not 380.` |
| F18-S4 38 / March | 38 vs 35. Invents “April **2025**” (the passage says “end of April”, no year). Asks to reconcile. | That 28 million is unmatched. That the year on April is inherited. | Partial. Restates the ARR clash; does not explain the date write. |
| F18-S5 142→167 | 142 vs 167 as of 28 May. Mentions the other source still stating 142. | That `28 May` is not written because the draft carries no date. | Full overlap on the headcount swap. |
| F18-S7 forecast | 38 vs 35. Then: “While the source confirms the growth projection and strategies, the initial ARR figure is incorrect.” | That 95 million and the implied growth hang off the contradicted start. That is why nothing is proposed. The “source confirms the growth projection” clause is source 0, not the update, and is the opposite of the locator’s reason. | The 35/38 clash is already said. The hanging path is **not**. |
| F18-S8 returns | 2.8x / 23% vs 2.6x / 21%. Notes the initial recommendation still states the old pair. | That the source never said gross or net. That `gross` stays. | The two figures are already said. The surviving qualifier is **not**. |

So: a locator line that only repeats “the source gives 412, not 380” is a third copy of the excerpt. A locator line that states the hanging path, or the silent basis, is new. The design below only prints the new fact.

### E3 BLOCKING — deterministic, or no explanation

**Confirmed for every row in the E1 list.** Each branch already has the values (`pair.from.raw`, `pair.to.raw`, destination token, month names, qualifier family). Fill a closed template. No model call. Cost per review: USD 0.00. Stable across runs.

The one case that cannot be explained this way is a decline whose only fact is “the matcher did not pair” (D-ident, D-name, D-kind, D-two, D-words). There is no honest specific sentence that is not system talk (“Jaccard”, “kind”). **That case gets no new explanation.** The existing generic sentence stays. Do not generate one.

D-verbatim and D-unengaged are internal safety rails. They also get no new explanation. They keep the generic sentence. Do not tell a reviewer the product refused its own write.

### E4 CHECK — frozen corpus

**Confirmed.** Locator and `fillAction` only. Stage 1 splitting and the Stage 2 prompt are not in this surface. The frozen corpus cannot move and must not be re-run.

---

## The safety line, how it is enforced

Intended is not enough. Every new string is a closed template in code. Shipping a template requires it to pass `findHedgedUserCopy` (new), which extends the existing banned-vocabulary sweep in `lib/revise-actions/user-copy.mjs`.

**Refused constructions** (word-boundary, case-insensitive):

- `might`, `may be`, `could be`, `possibly`, `perhaps`, `likely`, `probably`
- `uncertain`, `unclear`, `not sure`, `not certain`
- `this might be wrong`, `may be wrong`, `could be wrong`, `if this is wrong`
- `use with caution`, `treat with caution`, `hedge`
- `please check`, `please verify`, `please confirm` (as an instruction to doubt the proposal)
- `consider whether` when it attaches to the proposed figure
- `the source might mean`, `the source may have meant`
- `risk that`, `unreliable`, `unsafe`

Also refuse the existing internal list (`the rule`, `silent card`, ticket IDs, field names).

**Allowed, because they are facts about the source:** `the source gives`, `the source does not say`, `the source does not give`, `left as written`, `nothing is proposed`.

**What the check cannot catch.** A true “does not say” stacked onto a sound proposal until the reviewer doubts the number anyway. That is a density failure, not a vocabulary failure. Caught by the rule in **c**: a proposal carries at most one extra sentence, and only when the source was silent on a qualifier that remains in the draft. A paraphrased hedge (`the basis is unknown`) would get through a word list; refuse `unknown` / `unspecified basis` in the same sweep. Still cannot catch a newly invented polite doubt. Pin every template in a test; adding a template without a pin is a fail.

---

## Design questions

### a. Smallest set

Seven templates. Everything else in E1 collapses.

| Keep | Code | Why a reviewer can act |
|---|---|---|
| Generic decline | `D1` | Qualitative contradiction. Commentary already has the substance. The line only says nothing is proposed. |
| Hanging dependents | `D2` | They must not swap the start and leave the path standing. |
| Same source also states the draft figure | `D3` | They must not take 285 while the same document still says 320. |
| Year not given, months cross a year-end | `D4` | They must resolve the year before any number in that sentence moves. |
| Qualifier clash, source did not name the draft figure | `D5` | They must not copy an unqualified rate onto a gross claim. |
| Silent basis on a proposal | `P2` | They can see that `gross` was not licensed as a change. |
| (No extra line) | `P1-quiet` | Simple replacement. Excerpt already states the new figure. |

**Merged, and why.** D-ident, D-same, D-kind, D-name, D-two, D-words, D-verbatim, D-unengaged → **D1**. The reviewer cannot act on matcher internals. P-same-qual, P-multi, P-R3, P-named’s figure half → **P1-quiet** (no extra `why`). Restating “the source gives 412, not 380” under an excerpt that says exactly that is the noise failure. P-named’s surviving qualifier is the only proposal-side extra (**P2**). D-R3-skip (F18-S5 not copying `28 May`) is not a sentence; it is the absence of a date in the proposed sentence. Do not narrate a non-write.

### b. Exact copy

QC Output Language Standard: plain language, no system vocabulary, no rule names, no field names. Filled from the live payload, not placeholders.

**D1** (unchanged, F18-S0):

> A source contradicts this statement. Nothing is proposed. Decide whether the sentence should match the source.

**D2** (F18-S7):

> The source gives EUR 35 million, not EUR 38 million. The sentence uses EUR 38 million as the start of a path to approximately EUR 95 million over a five-year hold. The source does not give a replacement for approximately EUR 95 million. Nothing is proposed.

**D3** (F13-S7):

> The same source also states 320 people. Nothing is proposed.

**D4** (guard shape; no live F18 row):

> The source states February and does not give a year. The sentence states March 2025. Nothing is proposed.

**D5** (B159 shape; no live F18 row after naming):

> The source gives 21% IRR. The sentence states 23% gross IRR. The source does not name the 23%. Nothing is proposed.

**P2** (F18-S8), the only text under a proposal:

> The source does not say whether 21% is gross or net. The word gross is left as written.

**P1-quiet:** no `why` line. The proposed sentence is the explanation.

### c. What may sit beside Accept

A decline is safe ground. Beside an Accept button the product may state **only** (1) the proposed sentence, which is the source-quoted write, and (2) what the source did **not** say, when that silence is why a word in the draft was not changed.

It may not state that the new number might be the wrong basis, that the reviewer should check, or that the proposal is unsafe. F18-S8: the source named 23% and gave 21%; it did not say gross or net; `gross` stays. That is **P2**. The replacement figures themselves are already in the excerpt and in the proposed sentence. They are not repeated under the buttons.

### d. Enforcing the line

See the sweep above. Every template is a pinned string. `fillAction` runs the sweep on `why` and `noProposalReason` before the row is public. A hit is a fail in tests; in production it falls back to **D1** or to P1-quiet (no `why`), never to a hedged sentence. Fallback is the generic already shipped, not a newly worded caution.

### e. Hanging dependents: a line, not a finding

**The test:** would a reviewer want to act on it separately from the contradiction?

No. The contradiction and the hanging path are the same sentence. The action is one edit of that sentence (rewrite the path, or leave it). There is no second Accept. A second finding would put two badges on one claim and split a decision the reviewer will take once.

B172 asked for a finding **so that this would not become a warning on an Accept**. That Accept no longer exists: R5 declines. The remaining gap is silence — the product knows 95 million and the implied growth now have no source, and it currently says nothing. A line on the existing conflict finding closes that gap. A warning on a button is still rejected.

Scope: dependents **inside one sentence** after a source contradicts their base. **Pr16** is draft-against-draft across the memo (**P30**: a commitment both already made and awaiting approval). Relate: both are “the product knows an inconsistency and currently does not say so.” Do not merge. If 95 million is also asserted as a standalone claim in another sentence, that is Pr16’s deterministic half when it is built. Do not duplicate it here.

### f. Where it lives

Today the card already paints `why` (under a proposal) and `noProposalReason` (under a decline). Backend stays authoritative for the wording.

**Shape.** Same two fields. New copy goes in them. Additive optional `explainCode` on the public action-list row, closed enum: `null` | `dependents` | `self_disagreement` | `year_ambiguous` | `qualifier_clash` | `qualifier_silent`. Frontend does not display the code.

**What the frontend has to do besides paint the string.** When `explainCode` is set, **do not render** `reasoningParagraph` in the evidence body. That is more than paint. It is the subtraction without which the two cards below are three explanations of one clash. Stage 5 still writes the paragraph (frozen corpus). The card simply does not show it next to a locator line that has taken over the specific fact. When `explainCode` is null (D1, qualitative), the paragraph stays — that is where complete-vs-recommend lives.

No new section, no second finding row, no tooltip on Accept.

### g. Density — what is cut

An addition with no subtraction is not a design. Cuts:

1. **Hide the Stage 5 paragraph** on a contradicted card when `explainCode` is set. That paragraph already named the two figures and closed with “reconcile or remove.” The locator line replaces both the restatement and the empty instruction.
2. **Drop `why` on simple replacements** (P1-quiet). Today S3/S4/S5 print `The source gives 412, not 380.` under an excerpt that says exactly that. Cut it.
3. **Do not add a section.** The locator line occupies the slot the generic ack or the old `why` already occupies.
4. **Do not expand Editorial by default.** Unchanged. F18-S7 still has a first-person concern (**B166**); this pass does not promote it.

What this pushes off the screen if we add without cutting: a fourth block under Evidence (paragraph + excerpt + generic ack + new line). After the cuts: excerpt + one locator line + (on a proposal) the proposed sentence and buttons.

---

## Two cards, as the reviewer reads them

Evidence expanded (that is the body this pass changes). Other signals as the live chrome actually draws them. Copy from `live-2026-09-10-f18-review.json` plus the `4536ac7` proposal/ack behaviour.

### 1. The forecast sentence (F18-S7)

**Today (`4536ac7`)**

Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by continued organic growth, adjacent expansion into commercial property management, and selective M&A.

- Evidence · Conflicting
  - The statement claims an ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by organic growth, expansion, and M&A. However, the source contradicts this by stating that the ARR at the end of April was EUR 35 million, not EUR 38 million. The reviewer should reconcile this discrepancy or remove the claim. While the source confirms the growth projection and strategies, the initial ARR figure is incorrect.
  - Source excerpt
  - 18b_synth_cross_source_pair_update.txt
  - Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo.
  - A source contradicts this statement. Nothing is proposed. Decide whether the sentence should match the source.
- Editorial · 1 concern
- Clean: Compliance, Source recency, Framing

**After this change**

Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by continued organic growth, adjacent expansion into commercial property management, and selective M&A.

- Evidence · Conflicting
  - Source excerpt
  - 18b_synth_cross_source_pair_update.txt
  - Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo.
  - The source gives EUR 35 million, not EUR 38 million. The sentence uses EUR 38 million as the start of a path to approximately EUR 95 million over a five-year hold. The source does not give a replacement for approximately EUR 95 million. Nothing is proposed.
- Editorial · 1 concern
- Clean: Compliance, Source recency, Framing

The Stage 5 paragraph is not shown. The generic ack is not shown. Nothing to Accept. The hanging 95 million is on the conflict finding as a line, not as a second finding and not as a warning on a button.

### 2. The returns sentence (F18-S8)

**Today (`4536ac7`)**

The base case generates 2.8x MOIC and 23% gross IRR.

- Evidence · Conflicting
  - The statement conflicts with the source, which reports that the updated base case generates a 2.6x MOIC and 21% IRR, not the 2.8x MOIC and 23% IRR claimed. The source does confirm the original figures of 2.8x MOIC and 23% IRR as part of an initial recommendation, but the updated figures differ. The reviewer should reconcile these discrepancies or remove the claim.
  - Source excerpt
  - 18b_synth_cross_source_pair_update.txt
  - Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation.
  - the sentence if this change is made
  - The base case generates 2.6x MOIC and 21% gross IRR.
  - The source gives 2.6x, not 2.8x, and 21%, not 23%.
  - Accept · Reject · Modify
- Clean: Editorial, Compliance, Source recency, Framing

**After this change**

The base case generates 2.8x MOIC and 23% gross IRR.

- Evidence · Conflicting
  - Source excerpt
  - 18b_synth_cross_source_pair_update.txt
  - Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation.
  - the sentence if this change is made
  - The base case generates 2.6x MOIC and 21% gross IRR.
  - The source does not say whether 21% is gross or net. The word gross is left as written.
  - Accept · Reject · Modify
- Clean: Editorial, Compliance, Source recency, Framing

The Stage 5 paragraph is not shown. The restatement of 2.6x / 21% under the buttons is not shown. What remains under Accept is the one fact the excerpt does not state: the source was silent on basis, so `gross` was not changed.

---

## Files (eventual build)

Record the reason at the branch inside the existing locator. Copy templates and the hedge sweep in a small module next to the existing user-copy scan. Do not add a second locator.

| Path | Decision |
|---|---|
| `lib/revise-actions/conflict-engagement.mjs` | **Inline.** Stop returning a bare `unaddressed()`. Return `{ status, pairs, proposal, explainCode }`. Record D2/D3/D4/D5/P2 at the branch that fired. |
| `lib/revise-actions/decision-copy.mjs` | **New module.** Closed templates, value interpolation, no model. |
| `lib/revise-actions/user-copy.mjs` | **Extend.** `findHedgedUserCopy`. |
| `lib/revise-actions/run.mjs` | Map `explainCode` onto `why` / `noProposalReason`. Run the hedge sweep before `publicEntry`. Keep `conflict_unaddressed` as the family `reasonCode` so existing sort tests do not become a data-contract break; put the specific code on `explainCode`. |
| `lib/revise-actions/sort.mjs` | D1 string unchanged. Do not add a new user-visible reason family. |
| Frontend `src/modules/drafting/StatementReviewCard.jsx` | When `explainCode` is set, skip `reasoningParagraph`. Paint `why` / `noProposalReason` as today. Hide `why` when it is empty (P1-quiet). |
| Frontend `src/modules/drafting/actionListDisplay.js` | `hasDisplayableProposal`: a proposal is displayable with a sentence even when `why` is empty. |

**NEW FILES (eventual build):**

- `lib/revise-actions/decision-copy.mjs`
- `tests/revise-actions-decision-copy.test.mjs` — every template, filled; hedge sweep hits; D1 fallback on a hedge hit
- Frontend test that a row with `explainCode: "dependents"` does not render `reasoningParagraph`

**NEW FILES (this design commit):**

- `scripts/diagnostic/delivery-check/explain-the-decision-design.md` (this file)

**Tests that change when built:** `tests/revise-actions-copy.test.mjs` (`conflict_unaddressed` stays byte-stable as D1); `tests/revise-actions-quantity-match.test.mjs` (decline rows that today assert the generic sentence: F18-S7 becomes D2; F13-S7 becomes D3); `tests/revise-actions-conflict-engagement.test.mjs` (S8 `why` becomes P2; S3/S4/S5 `why` empty or omitted); `tests/action-list-display.test.mjs` (proposal without `why` still displays). Do not retarget sort/silence tests that still use D1.

Do not close **B172** or **B174** in the design commit. Close them together when the ruled cards are built and pinned.

---

## Risk

**Worst way this goes wrong:** P2 under Accept is read as a warning, the reviewer starts rejecting sound replacements, and every later proposal is discounted. Second: D2 is shipped as a second finding, and the card grows a duplicate conflict. Third: the Stage 5 paragraph is left in place, the two cards above become three blocks, and Ben’s clutter test fails after the build.

**What catches it:** the hedge sweep plus pinned templates; hanging dependents as a line on the existing finding, not a new row; `explainCode` hiding the paragraph; Ben ruling the two renderings in this note before any code. If either card still reads as cluttered after that ruling, the design is wrong and is not built.

Do not re-run the frozen corpus. Do not call a model.
