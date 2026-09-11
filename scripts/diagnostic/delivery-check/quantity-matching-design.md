# Matching figures by what they measure

Revision, 2026-09-11. Reworked in place around Ben’s rulings the same day. The central assumption of the first pass — **single-token replacement, fail closed unless exactly one surviving pair** — is withdrawn. Do not append; this is the note.

Do not build from this commit. The expectation table is now the pin. No product code changed here. No LLM call, pipeline, extract, evidence pass, action-list run, or accuracy run. Metered spend: **USD 0.00**.

Closes the gap recorded in **B169** only after the ruled table is built and tests pin it. Does not close **B159**. Does not close **B95**, **B96**, **B124**, **B170**, **B171**, or **B172**.

Code authority today: `lib/revise-actions/conflict-engagement.mjs` at `548f131`. Stored cards: `scripts/diagnostic/accuracy/runs/evidence-pass-lift-1/cards.json`. Pairing still reads the painted excerpt (`excerptTextForFinding`: `primaryExcerpt`, else `conflictExcerpt.passage`). R1 veto additionally reads `finding.card.supportSpans` (question A).

---

## Part 0. Claude’s claims

**Survives unchanged** from the first pass. Kept as-is, not rewritten.

### W1 BLOCKING — 6 and 12 split

**Verdict: the 18 count is right; the 6/12 split is the regex hit count, not the figure-correction count.**

`cards.json` has **18** cards with `displayVerdict: "conflict"` (and `hasConflict: true` on the same 18). No other contradicted cards.

The shipped negation regex (`not` / `compared with` / `versus` / `rather than` / `instead of`) hits **6** excerpts and misses **12**:

| Regex hit | Cards |
|---|---|
| Yes | F14-S11, F18-S3, F18-S4, F18-S5, F18-S7, F18-S8 |
| No | F05-S0, F05-S5, F08-S2, F12-S0, F13-S7, F15-S2, F15-S11, F17-S9, F18-S0, F18-S2, F19-S2, F19-S13 |

F14-S11 is `"We are not yet in dialogue with any specific company."` That is a qualitative `not`, not a superseded figure. Under `548f131`, `rejectedTokens` on that excerpt is **empty**.

Figure-correction wording (a rejected **numeric** token under the shipped splitter) is **5**: F18-S3, S4, S5, S7, S8. Unmarked remainder is **13**.

Corrected figures this pass uses: **18 contradicted / 5 figure-correction / 13 unmarked**. Claude’s 6/12 is what the regex counts if F14-S11 is included.

### W2 BLOCKING — unmarked identical quantity produces no proposal today

**Verdict: confirmed.** `548f131` requires a rejected token. The worked example is already the unit test `an excerpt stating a different same-kind figure with no negation produces no pair and acknowledges`:

- Draft: `The fund has delivered a net IRR of 18.4% since inception.`
- Source: `The net IRR since inception is 11.2%.`
- `findCandidatePairs` → `[]`. `fillAction` → ACKNOWLEDGE `conflict_unaddressed`. No model call.

Kind is the same (percentage). Names are the same (net IRR since inception). The only reason there is no proposal is the missing correction phrase. That is B169.

### W3 CHECK — naming subsumes correction wording

**Verdict: confirmed for identity. Correction wording is not independent evidence that two figures measure the same quantity.**

`The Company currently serves 412 property management companies, not 380 as stated` names the quantity on the asserted figure (`property management companies`) and repeats the draft number only as a rejected aside. A naming rule that pairs the draft’s 380 with the source’s asserted 412 does not need the `not 380`. The same holds for F18-S4 (ARR), F18-S5 (employs / people), F18-S7 (ARR), F18-S8 (MOIC / IRR, plus `compared with`).

Correction wording does not subsume naming the other way: `not 380` without a named counterpart would still be kind-only pairing, which is what `548f131` already refused to do on unmarked excerpts. Do not keep kind-only pairing as a back door.

### W4 CHECK — action-list, not Stage 2; not B159

**Verdict: confirmed. The distinction holds.**

Whether to **propose a swap** is `findCandidatePairs` → `applyConflictProposal` → `fillAction`. Stage 1 splitting and the Stage 2 prompt are untouched. The frozen corpus cannot move.

**B159** is a Stage 2 overcall: an unqualified source IRR read as contradicting a draft `gross IRR`. That is the **verdict**. This pass may **decline a swap** on a qualifier mismatch even when the card already says conflict. The badge stays. Implement Changes proposes nothing. That is allowed without touching Stage 2. Do not retune Stage 2 here. Do not treat a declined swap as a fix for B159.

---

## Ben’s rulings, 2026-09-11

These are the product owner’s decisions. They are not open for redesign. The rest of this note implements them.

**R1. The source must not disagree with itself.** If any passage the product matched against **that source** supports the draft’s own figure, propose nothing for that figure, even when another passage of the same source contradicts it. Two different sources (initial memo vs update) are not self-disagreement; conflict-wins still lets the contradicting source license a swap. Pack-wide “any confirming passage anywhere” would refuse every updated KPI that an earlier source still states. That reading is rejected because the ruling is titled self-disagreement and because the owner’s table proposes those updates.

**R2. A replacement may change more than one value.** The single-token rule is withdrawn. Every value written must be quoted from the source. The only permitted derived value is the year rule in R3.

**R3. Year inheritance.** When the source states a month with no year and the draft sentence states a year, the replacement inherits the draft’s year, **but only** when the source’s month is the same as or later in the calendar year than the draft’s month. If the source’s month is earlier, decline: the year is ambiguous across a year end. If the draft sentence carries no year, decline **that inheritance** (do not invent a year). R3 is not a veto of an undated KPI swap that does not write a date.

**R4. All or none.** If a sentence carries more than one contradicted figure, correct every one of them or correct none. Never produce a proposal that leaves a known wrong figure in the sentence. A draft figure the source never mentions does not block.

**R5. Dependent figures.** Do not change a figure that other figures in the same sentence are derived from, unless the source also addresses those. Changing the start of a growth path silently changes the implied growth; changing a total silently changes the percentages hanging off it.

**R6. Qualifiers, four states, not two.**

| Source qualifier vs draft | Outcome |
|---|---|
| SAME qualifier as the draft | PROPOSE |
| DIFFERENT qualifier | DECLINE |
| NO qualifier, but the source **explicitly names** the draft’s own figure and offers a replacement for it | PROPOSE |
| NO qualifier and does not name the draft’s figure | DECLINE |

Ben’s reasoning, recorded: when the source names the draft’s figure it has told you what its own figure is being compared against, and that is better evidence than any matching the product could do for itself.

---

## Target (revised)

A contradicted sentence gets a **source-quoted replacement of every licensed figure** when the painted excerpt states different values for the same quantities, identified by what each figure is called, whether or not the source is phrased as a correction. Identity rules from the first pass still apply (name windows, abbreviation list, units/scale). What changed: more than one value may be written; R1/R3/R4/R5/R6 can veto a licensed pair or the whole sentence; the year in R3 is the sole derived write.

The locator still runs only on contradicted evidence ACTION, still does not call a model, still fails closed when identity is not clear. Failure direction: **decline**.

---

## Design questions raised by the rulings

### A. R1 implementation

The locator’s pairing universe is still the painted excerpt. A passage elsewhere in the same source that supports the draft is invisible to pairing. That is how F13-S7’s painted excerpt (`The total team of 285 people is split…`) would still form a 320→285 pair if pairing were left alone.

**What the card already carries.** `qcCard.supportSpans[]` objects `{ sourceRefId, classification, statementId, passage, start, end }`. Inventory puts `card` on the finding. Classifications on the card are `confirmed` | `partially_confirmed` | `conflicting`. Compact `sourceMatches` in the stored run often have only `{ classification, sourceIndex }` and **no passage**.

**Are matched spans sufficient?** Yes for the exhibit. F13-S7’s card has a `confirmed` span whose passage states `CloudPivot employs 320 people…` and a `conflicting` span with the 285 split, **same source**. Group spans by `sourceRefId`. A source supports the draft figure when a span from that source is `confirmed` or `partially_confirmed` **and** its passage contains the draft token as an asserted value (not inside a rejection span: `not 380`, `compared with the 2.8x`). If that same `sourceRefId` is also the source of the pairing excerpt, veto the figure. F18-S3/S4/S5/S8 have a confirming span on **source 0** and a contradicting span on **source 1**. Different `sourceRefId` does not veto. That is why those rows still PROPOSE.

**What R1 cannot see even then.** Any passage Stage 2 never returned. Compact `sourceMatches` that are `confirmed` / `partially_confirmed` for the pairing source with **no** `supportSpans` passage: R1 cannot inspect the figure. Fail closed on that figure (do not propose). Do not re-scan the raw source file.

**Narrowest widening.** Pairing stays on the painted excerpt. The **veto** reads `finding.card.supportSpans` grouped by `sourceRefId`. That is not a pairing-universe widening and not a Stage 2 prompt change.

### B. R2 enforcement

Do not trust the writer. After `resultingSentence` is built, collect every numeric or date span that differs from the draft. Each written span must be a contiguous substring of the pairing excerpt (`pair.to.raw`), **except** the R3 carve-out below. If any written span fails, drop the **whole** proposal (R4). No arithmetic (`38 - 3`), no unit conversion, no stitching distant tokens (`35` from one clause and `million` from another).

**R3 carve-out, closed.** A written span may equal `sourceMonthToken + " " + draftYear` when **all** of: the source token is a month with no year; the draft sentence contains a year attached to the date being replaced; the source month’s calendar index is ≥ the draft month’s; the month token itself is a contiguous substring of the excerpt. If any predicate fails, that date pair is unwritable. There is no other derivation helper and no general “assemble a value from source parts” path. Bare month tokens (`April` in `end of April`) are not date tokens in `tokenizeQuantities` today; extend kind detection for month names so R3 can see them. That is tokenisation, not derivation.

### C. R4 scope

**“Contradicted figure in the sentence”** means a draft quantity token that has a **licensed counterpart** in the pairing excerpt: name match (surviving **a**/**b**), compatible kind/scale, values differ, and R6 qualifier states pass. It is **not** every figure in the sentence. It is **not** every figure Stage 2’s verdict rested on.

A draft figure the source never mentions (F18-S3’s `240'000`; F18-S4’s `EUR 28 million`) is unmatched, stays in the sentence, and **does not block**.

If any licensed pair cannot be written (R1 veto, R5 veto, R3 year ambiguous, two source figures match one draft name), drop **all** licensed pairs on that statement. Zero writable licensed pairs → ACKNOWLEDGE `conflict_unaddressed`. One or more, and every one writable → write every one.

### D. R5 detection

Deterministic, no model. After name-pairing, inspect the **draft sentence** (not the excerpt) for these shapes. Closed patterns, word-boundary, case-insensitive:

1. **From–to growth path.** `from <tokenA> to <tokenB>`, `growth from <tokenA> to <tokenB>`, `<tokenA> to <tokenB> over`. A is the start. Do not change A unless B is also a licensed pair (source addresses the destination). F18-S7: `from EUR 38 million to approximately EUR 95 million` — source addresses only 38 → veto 38 → R4 drops the sentence.
2. **Total with components.** A token whose fragment contains `total` / `in total` / `employs` / `headcount` / `team of` and the same sentence contains another quantity in a fragment with a component cue (`split`, `comprising`, `of which`, `including`, plus the closed department list already in **e**). Do not change the total unless every hanging component is also licensed.
3. **Percentage of a base.** `N% of <token>` / `percent of <token>`. Do not change `<token>` unless that percentage is also licensed.

**What it will miss.** Implied year-on-year with no from–to (`representing strong growth from EUR 28 million` while changing current ARR 38→35 — 28 is unmatched, not a written dependent; R5 does not fire). Separately stated CAGR in another clause. Word-number paths (`from four to eighteen`). A destination written without `from`/`to` (`grow 38 million into 95 million`). Those stay declined only if some other rule catches them; do not invent a model judge to recover them.

### E. R6 naming

**“The source explicitly names the draft’s figure”** means: the pairing excerpt contains a quantity token whose **value equals the draft token’s value** (same kind, same numeric/date raw after existing normalisation), and that token sits inside a **citation span**. Citation spans, reused from today’s splitter and applied only as this test, not as identity:

- `not <token>`
- `compared with <token>` / `versus <token>` / `rather than <token>` / `instead of <token>`
- `<token> as stated` / `as stated in` / `in our initial` / `in our recommendation` / `in the memo`

Bare co-occurrence of the same number in the excerpt is **not** naming. Kind-only pairing of an unqualified source IRR with a draft `gross IRR` because both are percentages is **not** naming. F18-S8 qualifies: `compared with the 2.8x / 23%`. W2 does **not** use this exception; both sides already carry `net` + `since inception`, so R6’s SAME-qualifier row licenses it.

### F. Surviving draft qualifier

If the draft says `gross` and the swap happens under R6’s named-figure exception, **the word `gross` stays**, attached to the new number.

That is acceptable. The source licensed a replacement for the **named draft figure**. It did not license a change to the claim’s identity. Dropping `gross` would turn a gross IRR claim into an unqualified IRR claim, which is a different quantity (the B159 shape, decided here only as a swap refusal when the source does **not** name the draft figure). The reviewer still sees `gross`; if the source’s 21% is in fact net, that is the residual risk recorded below, and R6’s DIFFERENT-qualifier row still refuses a genuine gross-vs-net clash.

---

## Surviving machinery (first pass, not rewritten)

These sections survive with the deltas named. The first-pass text is the authority except where a ruling overrides it.

| Section | Status |
|---|---|
| **a.** Name extraction windows, stop words, parentheticals, `N percent` as percentage | Unchanged. |
| **b.** Kind/scale, names, Jaccard ≥ 0.6, abbreviation list, decline when empty/clash/two candidates for one name | Unchanged **except b.4**. “Exactly one surviving pair or decline the statement” is **withdrawn**. Replace with C: write every licensed writable pair, or none. |
| **c.** Qualifier families and the as-at-date split | Qualifier **lexicon** unchanged. The match rule is **replaced by R6** (four states, including named-figure exception). As-at dates remain observation time, not identity. F18-S4/S5 are no longer JUDGEMENT. |
| **d.** Units and scale, currency clash | Unchanged. |
| **e.** Two source figures for one draft name → decline. Component cues for pairing hygiene | Unchanged as pairing hygiene. F13-S7 is no longer a JUDGEMENT PROPOSE via the component filter; **R1** declines it. Do not expand pairing onto other passages to “find” the 320. |
| **f.** Correction-wording route subsumed for **identity** | Unchanged. Citation spans survive **only** as R6’s naming test (E), not as a kind-only back door and not as a parallel pair finder. `rejectedRanges` as the **only** way to form a pair goes away. |
| **g.** Word-numbers out of scope | Unchanged. F12-S0 declines. |
| **h.** Strictly binary confidence | Unchanged. A warning on Accept is a hedge; Ben rejected that shape for **B172** as well. |
| **i.** Keep `conflict_unaddressed` copy | Unchanged. No new reason code (data contract). |

---

## Expectation table

Universe: every `displayVerdict: "conflict"` card in `scripts/diagnostic/accuracy/runs/evidence-pass-lift-1/cards.json` (18), plus the W2 extra row. Excerpt = painted `primaryExcerpt` (same string pairing sees). R1 veto may read `supportSpans` on the same card.

Claude’s five PROPOSE rows are **confirmed** under the rulings as written. None were adjusted by changing a ruling. The one reading that had to be stated, not redesigned: **R1 is intra-source**. Pack-wide application would decline F18-S3/S4/S5/S8 because source 0 still states the draft figures; the ruling’s title is self-disagreement, and those rows are the product the owner listed as PROPOSE.

Exact resulting sentences replace every licensed value. Unmatched draft figures stay.

| Mark | ID | Outcome | Exact resulting sentence, or decline reason |
|---|---|---|---|
| CLEAR | F05-S0 | DECLINE | No quantity tokens. Buyer/seller identity. |
| CLEAR | F05-S5 | DECLINE | No quantity tokens. Party identity. |
| CLEAR | F08-S2 | DECLINE | 78% same value. Painted excerpt has no competing figure. |
| CLEAR | F12-S0 | DECLINE | Word-numbers out of scope (**g**). |
| CLEAR | F13-S7 | **DECLINE** | **R1.** Same source has a `confirmed` span `CloudPivot employs 320 people…` and a conflicting 285 split. Any matched passage of that source supports the draft figure. |
| CLEAR | F14-S11 | DECLINE | No quantity tokens. Qualitative `not`. |
| CLEAR | F15-S2 | DECLINE | 720 million same value. Invested vs seek approval. |
| CLEAR | F15-S11 | DECLINE | Store count matches. Conflict is fifth vs third pillar. |
| CLEAR | F17-S9 | DECLINE | `40 percent of leases roll` is not rental reversion `18%`. Capex unmatched. |
| CLEAR | F18-S0 | DECLINE | Completion vs recommend. No draft figure to replace. |
| CLEAR | F18-S2 | DECLINE | Values match. Invested vs recommend. |
| CLEAR | F18-S3 | **PROPOSE** | `The Company currently serves 412 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.` 380→412. `240'000` unmatched; R4 does not block. Source 0 confirming 380 is a different `sourceRefId` than the update; R1 does not fire. |
| CLEAR | F18-S4 | **PROPOSE** | `It generates annual recurring revenue (ARR) of EUR 35 million as of April 2025, representing strong growth from EUR 28 million the prior year.` 38→35 **and** March 2025→April 2025. April ≥ March; inherit 2025 (**R3**). `28 million` unmatched; R4 does not block. R5 does not fire: 38 is current ARR, not the `from` start of a from–to path; implied YoY is not a written dependent (**D**). |
| CLEAR | F18-S5 | **PROPOSE** | `The Company employs 167 people across Stockholm, Oslo, and Helsinki.` 142→167. Draft carries no date, so R3 is not invoked; `as of 28 May` is not written. |
| CLEAR | F18-S7 | **DECLINE** | **R5.** `from EUR 38 million to approximately EUR 95 million`. Source addresses only the start. Changing it silently changes implied growth to 95. R4 then writes nothing. |
| CLEAR | F18-S8 | **PROPOSE** | `The base case generates 2.6x MOIC and 21% gross IRR.` Both the multiple and the rate (**R2**, **R4**). Licensed by **R6** because the source names both draft figures (`compared with the 2.8x / 23%`). `gross` stays (**F**). |
| CLEAR | F19-S2 | DECLINE | `closed at SEK 18.4 billion` is not `gross proceeds of SEK 12.8 billion`. MOIC and IRR already match. |
| CLEAR | F19-S13 | DECLINE | Timing / whether a process has launched. No figure pair. |
| CLEAR | W2 (extra) | **PROPOSE** | `The fund has delivered a net IRR of 11.2% since inception.` Same qualifier (`net`) and same return window (`since inception`) on both sides. R6 SAME-qualifier row. Unmarked; no citation span required. |

**Pin this commit defines (not yet built):**

- PROPOSE: F18-S3, F18-S4 (two values), F18-S5, F18-S8 (two values), W2.
- DECLINE: F13-S7 (R1), F18-S7 (R5), and every remaining contradicted card in the stored run.

Live F18 membership after the build: still four replace and three acknowledge, **different rows**. Replace **S3, S4, S5, S8**. Acknowledge **S0, S2, S7**. Today’s `548f131` pin was replace S3, S4, S5, **S7** and acknowledge S0, S2, **S8**.

---

## What the rulings break

Do not change these in this pass. Listed so the build knows which pins become wrong.

**Shipped behaviour at `548f131` that becomes wrong**

- Single-token only. `applyConflictProposal` fail-closed unless `pairs.length === 1` (`lib/revise-actions/conflict-engagement.mjs`). Wrong under R2/R4. S4 writes two values; S8 writes two values.
- Correction-wording required to form a pair (`rejectedTokens.length === 0` → no pairs). Wrong under naming + R6. W2 must PROPOSE.
- Live F18 four-and-three split: S7 is a replace (forecast start 38→35) and S8 is an acknowledgement (two pairs). Wrong: S7 must ACKNOWLEDGE (R5); S8 must ACTION (both figures).
- B168 text: “4 replace (380/412, 142/167, two ARR 38/35), 3 acknowledge (… one two-pair MOIC/IRR)”. The two ARR 38/35 included S7. That sentence is wrong under these rulings. B168 stays a shipped-history row; do not rewrite the pin it records.

**Tests that become wrong** (`tests/revise-actions-conflict-engagement.test.mjs`)

| Test | Today | Under the rulings |
|---|---|---|
| `pinned split: four exact single-token replacements and three acknowledgements` | S3, S4, S5, S7 replace; S0, S2, S8 ack | S3, S4 (multi-value), S5, S8 (multi-value) replace; S0, S2, S7 ack |
| `two figure pairs fail closed` | S8 → ACKNOWLEDGE | S8 → PROPOSE both, `The base case generates 2.6x MOIC and 21% gross IRR.` |
| `an excerpt stating a different same-kind figure with no negation produces no pair and acknowledges` | W2 → ACKNOWLEDGE | W2 → PROPOSE `The fund has delivered a net IRR of 11.2% since inception.` |
| `a draft figure the source never mentions is ignored, not a fail-closed` | S4 keeps `March 2025` | S4 also replaces `March 2025` with `April 2025` (R3). Unmatched `28 million` still ignored. |
| `F18 S5 142 versus 167 is a single-token replace` | Still ACTION 142→167 | Still ACTION; sentence unchanged from today. Keep. |
| `a correction-shaped source (412, not 380 as stated) IS closable` | Closable via `not` | Still closable, via naming, not via `not`. Keep the outcome. |
| `an unmarked same-kind figure for an unrelated quantity produces no pair` | Decline | Still decline. Keep. |

**Other tests that move when the locator lands**

- `tests/revise-actions-license.test.mjs` — `UNMARKED_CONFLICT_ACK_IDS` (`S1:evidence:conflicting:0`, `S2:evidence:conflicting:0`) and `three identity rows and three unnamed-voice rows convert; unmarked conflicts acknowledge`. Brackenhill S1 **is** the W2 sentence (`net IRR of 18.4%` / source 11.2%). S2 is `1.9 times gross MOIC` vs `1.4 times gross MOIC` (same qualifier). Both become ACTION if `fillAction` sees an excerpt that names those quantities. Today they ACKNOWLEDGE because there is no correction wording. The mix-array pin becomes wrong.
- `tests/revise-actions-sort.test.mjs` — `a non-closable conflict fill is ACKNOWLEDGE conflict_unaddressed` stays valid only if that fixture remains unlicensed (no name match). Do not retarget it to W2.
- `tests/revise-actions-silence.test.mjs` — empty-excerpt fills stay ACKNOWLEDGE. Unchanged.
- `tests/revise-actions-verify.test.mjs` — already parses multiple `Replace 'x' with 'y' and 'x2' with 'y2'` pairs. Data contract of one `proposedChange` string can stay.

**First-pass design pins this revision overturns** (the unruled table, not shipped code): F13-S7 JUDGEMENT PROPOSE 320→285; F18-S4 single-token keeping March 2025; F18-S8 DECLINE because gross vs absent and one-pair fail-closed; “exactly one surviving pair”.

---

## Files (eventual build)

**Inline. No new production module.** Replace the pair finder and the apply step inside the existing locator. R3 year assembly is a closed helper in the same file, not a derivation module.

| Path | Decision |
|---|---|
| `lib/revise-actions/conflict-engagement.mjs` | **Replace** `findCandidatePairs`: drop rejected-token-as-sole-path; add name windows, R6 qualifier states, currency on `classify`, `N percent` as percentage, bare month tokens, component filter for pairing. **Replace** `applyConflictProposal`: accept `pairs.length >= 1`; apply R1 veto from `supportSpans`; apply R5; apply R3; R4 all-or-none; post-check every written value is excerpt-verbatim except the R3 year. Keep `tokenizeQuantities` (extended), exact-quote `buildReplaceProposal` (multiple `Replace 'x' with 'y'` joined by `and`), `CONFLICT_PROPOSAL_UNENGAGED`. |
| `lib/revise-actions/run.mjs` | Small change if `applyConflictProposal`’s contract becomes `{ status, pairs, proposal }` instead of `{ status, pair, proposal }`. |
| `tests/revise-actions-conflict-engagement.test.mjs` | Change. See the broken-pin table. |
| `tests/revise-actions-license.test.mjs` | Change when W2-shaped Brackenhill S1/S2 become ACTION. |
| `docs/BACKLOG.md` | Close **B169** only after the ruled table is built and tests pin it. **B172** is filing only; do not build it in the quantity-matching slice. |

**NEW FILES (eventual build):**

- `tests/revise-actions-quantity-match.test.mjs` — one test per ruled table row (PROPOSE asserts the exact resulting sentence, including every value changed; DECLINE asserts no writable pairs / ACKNOWLEDGE `conflict_unaddressed`). No diagnostic JSON read at runtime; inline the fixtures. F13-S7’s fixture must include `card.supportSpans` so R1 is actually exercised.

**NEW FILES (this design commit):** none. This file is revised in place. One backlog row (**B172**) is added in `docs/BACKLOG.md`.

---

## Risk

**Worst wrong proposal still possible under the rulings:** R6’s named-figure exception writes a new IRR into a sentence that still says `gross`, when the source’s named replacement is actually net (or otherwise differently based) and the source never said so. F18-S8 is the exhibit: `21%` lands in `21% gross IRR` because the source named `23%` and offered `21%` with no qualifier.

**What catches it:** nothing in this locator, by design. R6 licenses that write. DIFFERENT-qualifier still refuses an explicit gross-vs-net clash. Binary confidence (**h**) forbids a warning on Accept. A false acknowledgement remains preferred to a swap the rulings do not license; this residual is a swap the rulings **do** license.

Second residual: R3 attaching the draft year when the source’s later-or-equal month is actually the prior calendar year (draft March 2025, source “April” meaning April 2024). The ruling as written licenses April 2025. What catches it: the earlier-month decline only; same-or-later is accepted.

Third: a from–to path R5’s closed patterns miss, so a start figure is rewritten and implied growth moves. What catches it: the patterns in **D**, plus R4 if a second licensed figure then cannot be written. Misses listed in **D** stay misses.

Do not re-run the frozen corpus. Do not call a model.

---

## Recorded, not designed

### B171 — user-supplied authoring organisation

**Survives unchanged** from the first pass. Out of scope for the quantity-matching build. Do not close **B95**, **B96**, **B124**, or **B170**.

### B172 — unsupported dependents as a finding (new)

Ben’s decision 2026-09-11. When a source contradicts a figure that other figures in the same sentence are derived from, the product knows those dependent figures are now unsupported and currently says nothing. Direction: **surface that as a finding in its own right**, not as a caveat attached to a proposal a reviewer can accept.

Worked example: F18-S7, a base case growing revenue from one figure to another over a hold (`from EUR 38 million to approximately EUR 95 million over a five-year hold`). The source contradicts the starting figure (current ARR 35, not 38). The destination and the implied growth are then unsupported by any source. Under R5 this slice **declines a proposal** and stops. It does not tell the reviewer that 95 and the path are now hanging.

A warning attached to an Accept button is a hedge and was **rejected** for that reason.

Out of scope for the quantity-matching build. Relate it to **Pr16** (internal consistency: the draft is never compared against itself; deterministic half first — same quantity stated two ways, a figure that disagrees with itself) rather than duplicating Pr16. Pr16 is draft-against-draft across the memo (**P30**). This row is the same class of silence — the product knows something is now inconsistent and does not say so — scoped to dependents left hanging **inside one sentence** after a source contradicts their base. Do not invent a second internal-consistency programme. Do not close **Pr16** from this record.
