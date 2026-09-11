# Matching figures by what they measure

Design pass, 2026-09-11. Do not build from this note until Ben rules the JUDGEMENT rows. No product code changed here. No LLM call, pipeline, extract, evidence pass, action-list run, or accuracy run. Metered spend: **USD 0.00**.

Closes the gap recorded in **B169**. Does not close **B159**. Does not close **B95**, **B96**, **B124**, or **B170**.

Code authority: `lib/revise-actions/conflict-engagement.mjs` at `548f131`. Stored cards: `scripts/diagnostic/accuracy/runs/evidence-pass-lift-1/cards.json`. Painted excerpt is what the locator already reads (`excerptTextForFinding`: `primaryExcerpt`, else `conflictExcerpt.passage`).

---

## Part 0. Claude’s claims

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

## Design. What makes two figures the same quantity

Target: a contradicted sentence gets a **single-token** replacement when the painted excerpt states a different value for the **same quantity**, identified by what the figure is called on each side, whether or not the source is phrased as a correction. When identity is not clear, no proposal. Failure direction: **decline**.

The locator still runs only on contradicted evidence ACTION, still does not call a model, still quotes the source token byte-for-byte, still fails closed unless exactly one surviving pair remains.

### a. How the name is extracted (deterministic, no model)

Reuse `tokenizeQuantities`. Extend kind detection so `\d+ percent` / `\d+ per cent` is a **percentage**, not a bare count (F17-S9’s `40 percent` and F19-S2’s `31.4 percent` are currently `count`). Do not parse spelled-out numbers in this pass (see **g**).

For each token, the **host fragment** is the substring between the nearest clause breaks on either side. Clause breaks: `.` `;` `:` and `,` when the comma separates list items (digit or capitalised head after the comma). Then:

1. **Left window:** words after the previous quantity token (or fragment start) and before this token.
2. **Right window:** words after this token and before the next quantity token (or fragment end), capped at six content words.
3. **Parenthetical:** a `(...)` immediately before the token, immediately after the token, or immediately after the head noun, is merged into the label. `(ARR)` on `annual recurring revenue (ARR)` becomes the canonical key `arr`.
4. **Stop words dropped** from the label (closed list): a, an, the, of, to, for, in, on, at, as, from, with, and, or, by, its, their, this, that, is, was, has, have, been, currently, approximately, more, than, over, during.
5. **Qualifiers** are extracted from the same fragment into a separate set (see **c**), not mixed into the name Jaccard.

Shapes:

| Shape | What the window does |
|---|---|
| Figure starts the sentence (`320 people across…`) | Left empty; right window carries the name. |
| Figure inside parentheses (`(ARR of EUR 38 million)` or `EUR 38 million (ARR)`) | Parenthetical body is merged; if the body is only a unit, inherit the outer head noun. |
| Table-like fragment (`engineering 110, customer success 75`) | Each comma-separated item is its own fragment, so 110 is labelled `engineering`, not `people`. |

If the remaining name set is empty, that token cannot pair. Decline it. Do not fall back to kind-only.

### b. What counts as a match

A draft token `D` pairs with a source token `S` only if **all** of:

1. Same kind and compatible scale (existing `kindKey`, plus currency — **d**). Values differ. Same value is identity, skip.
2. Qualifier sets match under **c**.
3. Names match under the rule below.
4. After pairing, **exactly one** surviving pair on the statement. Two or more → decline the whole statement.

**Names.** Canonicalise a closed abbreviation list, case-insensitive, word-boundary:

`IRR` ← irr, internal rate of return  
`MOIC` ← moic, money-on-invested-capital, multiple on invested capital  
`ARR` ← arr, annual recurring revenue  
`NAV` ← nav, net asset value  
`DPI` ← dpi  
`TVPI` ← tvpi  
`EBITDA` ← ebitda  
`AUM` ← aum  
Headcount ← people, employees, employee, employs, team, headcount, staff, personnel  
Stores ← stores, store, locations, sites (only when not also matching a different abbreviation)

Plurals: strip a trailing `s`/`es` on tokens longer than three letters after abbreviation canonicalisation (`companies` / `company`). Word order is ignored (set match, not sequence).

Then:

- If either side has a canonical abbreviation, the abbreviations must intersect. Extra content words are not required.
- If neither side has an abbreviation, Jaccard on the remaining content-word sets must be **≥ 0.6**, and the intersection must be non-empty.

When in doubt (empty name, Jaccard below 0.6, abbreviation clash, two candidates), **decline**. Do not pick the numerically closer figure. Do not pick the first figure in the excerpt.

### c. Qualifiers are part of the quantity’s identity

Closed qualifier lexicon, extracted from the **same fragment** as the name. Matching is by family, not by synonym spelling.

| Family | Members (any spelling / common abbr.) |
|---|---|
| Gross / net | gross, net |
| Realised | realised, realized, unrealised, unrealized |
| Return window | since inception, inception; annualised, annualized; last twelve months, LTM, trailing twelve months, TTM; year to date, YTD |
| Per share | per share, per-share, /share |
| Currency basis | constant currency, cc, FX-neutral |
| Pro forma | pro forma, pro-forma |
| Fees | before fees, after fees, net of fees, gross of fees |
| Leverage | levered, unlevered, equity (when attached to IRR/MOIC) |

**Rule.** For each family: if either side has a member, both sides must have the **same** member. Present on one side and absent on the other is **not** a match. Conflicting members (gross vs net) are not a match. Both absent is a match on that family.

**Observation as-at dates** (`as of March 2025`, `as of 28 May`, `at end of April`) are **not** this lexicon. They are when a stock metric was measured. A contradicted card whose source restates ARR or headcount at a later date is the case this pass exists to close. Treating those dates as identity would refuse every updated KPI. **Return windows** (inception / LTM / YTD / annualised) stay in the lexicon because they change the calculation, not the observation time.

**Ben rules this split** on F18-S4 and F18-S5 (JUDGEMENT rows). If he folds as-at dates into identity, those two currently-pinned replacements decline.

Three worked examples where naive word-overlap would swap wrongly:

1. **Gross vs absent.** Draft: `The base case generates 23% gross IRR.` Source: `The IRR is 21%.` Shared token `IRR`. Naive overlap swaps 23→21. This rule declines (gross present on one side only). Exhibit shape of **B159**, decided here only as a swap refusal.

2. **Inception vs LTM.** Draft: `The fund has delivered a net IRR of 18.4% since inception.` Source: `The LTM net IRR is 11.2%.` Shared `net` + `IRR`. Naive overlap swaps 18.4→11.2. This rule declines (return-window family disagrees). Contrast W2, where both sides say since inception and the swap is licensed.

3. **Realised vs headline MOIC.** Draft: `Realised MOIC is 2.1x.` Source: `MOIC is 2.6x.` Shared `MOIC`. Naive overlap swaps 2.1→2.6. This rule declines (realised present on one side only).

### d. Units and scale

Keep the existing disqualifiers, and add currency:

| Clash | Disqualifies |
|---|---|
| Percentage vs multiple (`23%` vs `2.8x`) | Yes |
| Money vs count | Yes |
| Million vs billion vs ones | Yes. Do not convert. |
| Currency code mismatch (EUR / USD / GBP / SEK / CHF / …) | Yes. Extend `classify` so the code is part of identity. Today only EUR/USD/GBP are even detected; SEK 18.4 billion is just `money/billion`. |
| One side has a currency code, the other is a bare number of the same scale | Yes. Do not assume. |
| `%` vs spelled `percent` | No, once (a) treats `N percent` as percentage. |

### e. Ambiguity

**Two source figures both match one draft name** → decline. Do not pick.

**Total vs breakdown** (the F13-S7 shape). A fragment whose label contains a component cue is not a total. Closed component cues: `split`, `comprising`, `of which`, `including`, plus a function/department word from a closed list (`engineering`, `sales`, `support`, `implementation`, `administrative`, `g&a`, `customer success`, `customer support`). A fragment that contains `total` / `in total` / `employs` / `headcount` / `team of` and does **not** carry a component cue is a total.

After dropping components, if the source does not have **exactly one** remaining token that names-matches the draft, decline. If it does, that total may pair. The locator still reads only the painted excerpt, not other passages in the same source. F13-S7’s other span (`employs 320 people…`) is therefore invisible to the locator. That is JUDGEMENT, not a silent expansion of the excerpt.

### f. Correction-wording route

**Subsumed.** Naming is necessary and sufficient. Correction wording is not a parallel path and does not license a kind-only swap.

`not 380 as stated` can raise confidence in a log line. It must not change the pair set. The product stays binary (**h**), so that log is diagnostic only.

Justification: Claude’s correction stands. Correction wording is prose style. Keeping it as a separate path would re-open the kind-only pairing `548f131` shut on unmarked excerpts, and would treat F14-S11’s qualitative `not` as if it were a superseded figure.

### g. Figures written as words

**Out of scope.** F12-S0 (`four years` vs `eighteen months`) has no digit token today. Bringing it in needs a number-word parser **and** unit conversion (years vs months). That is a different slice. This pass extends pairing, not tokenisation beyond `N percent`. F12-S0 declines.

### h. Confidence

**Strictly binary.** A row a reviewer can Accept is not the place for a hedge. No middle tier, no “likely the same quantity”, no warning badge on a live proposal. Correction wording does not create a second grade.

### i. Copy when the rule declines

Keep `NO_PROPOSAL.conflict_unaddressed`:

> A source contradicts this statement. Nothing is proposed. Decide whether the sentence should match the source.

It still reads correctly for qualitative contradictions (recommend vs complete, buyer vs seller) and for declined figure cases (gross vs net, two pairs, unnamed). A new reason code would be a data-contract change. Do not add one in this pass.

---

## Expectation table

Universe: every `displayVerdict: "conflict"` card in `scripts/diagnostic/accuracy/runs/evidence-pass-lift-1/cards.json` (18), plus the W2 extra row. Excerpt = painted `primaryExcerpt` (same string the locator sees). **Do not build against this column until Ben rules the JUDGEMENT rows.** The ruled table is the pinned threshold.

Proposed resulting sentences replace only the source-quoted token. Everything else in the draft sentence stays.

| Mark | ID | Draft (trimmed) | Excerpt (trimmed) | Draft figure | Source figure | Outcome | Reason |
|---|---|---|---|---|---|---|---|
| CLEAR | F05-S0 | Halden Group has agreed to acquire Norwell Aerospace Components … from Westhaven Capital. | Westhaven Capital agrees to acquire Norwell Aerospace Components from Bridgepoint | — | — | DECLINE | No quantity tokens. Buyer/seller identity. |
| CLEAR | F05-S5 | During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability. | …during the Bridgepoint ownership period and now operates three of the most advanced… | — | — | DECLINE | No quantity tokens. Party identity. |
| CLEAR | F08-S2 | We have invested EUR 480 million of equity for a 78% controlling stake… | Halden Group would acquire a 78% controlling stake from the founding Schiller family… | EUR 480 million; 78% | 78% | DECLINE | 78% is the same value. Painted excerpt has no competing figure. Tense is invested vs would acquire. |
| CLEAR | F12-S0 | After more than four years of partnership, Meridian Capital has completed the sale… | After eighteen months of work alongside the team, I'm delighted that Meridian Capital has completed the sale… | four years (words) | eighteen months (words) | DECLINE | Word-numbers out of scope (**g**). |
| JUDGEMENT | F13-S7 | The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore. | The total team of 285 people is split approximately as follows: engineering 110, customer success and implementation 75, sales 55, customer support 35, and general & administrative 10. | 320 | 285 (total); 110/75/55/35/10 (components) | **PROPOSE** `The Company employs 285 people across offices in London, Hamburg, Lisbon, and Bangalore.` | Component filter leaves one total (285 people / team). Same source also has a confirmed span stating 320; locator does not read it. |
| CLEAR | F14-S11 | We expect to bring a specific potential investment to consider over the coming months. | We are not yet in dialogue with any specific company. … | — | — | DECLINE | No quantity tokens. Qualitative `not`. |
| CLEAR | F15-S2 | We have invested EUR 720 million of equity for an 84% stake. | We seek IC approval for an investment of up to EUR 720 million of equity in the acquisition of Casa Verde Group S.p.A. | EUR 720 million; 84% | EUR 720 million | DECLINE | 720 million is the same value. Invested vs seek approval. |
| CLEAR | F15-S11 | The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above. | Fifth, the Atelier 73 concept has the potential to become a meaningful third growth pillar. The 18 stores operating today generate average four-wall margins of 18%… | 18 (stores) | 18 (stores); 18% (margins); 73 (banner name) | DECLINE | Store count matches. 18% is a different quantity. Conflict is fifth vs third pillar. |
| JUDGEMENT | F17-S9 | …capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex programme… | Embedded rental reversion is estimated at approximately 18% across the portfolio… | 40 percent; EUR 38 million | 18% | **DECLINE** | `40 percent of leases roll` is a share of leases; `18%` is rental reversion. Shared headword “reversion”, different quantities. Capex 38 million has no counterpart in the painted excerpt. |
| CLEAR | F18-S0 | We are writing to confirm completion of the transaction with Nordic SaaS Holdings… | We recommend an investment of EUR 158 million for a 60% controlling stake… | — | EUR 158 million; 60% | DECLINE | Completion vs recommend. No draft figure to replace. |
| CLEAR | F18-S2 | We have invested EUR 158 million for a 60% controlling stake. | We recommend an investment of EUR 158 million for a 60% controlling stake… | EUR 158 million; 60% | EUR 158 million; 60% | DECLINE | Values match. Invested vs recommend. |
| CLEAR | F18-S3 | The Company currently serves 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units. | The Company currently serves 412 property management companies, not 380 as stated in our initial memo. | 380; 240'000 | 412; 380 (rejected) | **PROPOSE** `The Company currently serves 412 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.` | One named pair: property management companies. 240'000 unmatched, ignored. Naming subsumes `not 380`. |
| JUDGEMENT | F18-S4 | It generates annual recurring revenue (ARR) of EUR 38 million as of March 2025, representing strong growth from EUR 28 million the prior year. | Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo. | EUR 38 million; EUR 28 million | EUR 35 million; EUR 38 million (rejected) | **PROPOSE** `It generates annual recurring revenue (ARR) of EUR 35 million as of March 2025, representing strong growth from EUR 28 million the prior year.` | ARR names match. March vs April treated as observation time, not identity (**c**). 28 million unmatched, kept. |
| JUDGEMENT | F18-S5 | The Company employs 142 people across Stockholm, Oslo, and Helsinki. | The Company employs 167 people as of 28 May, not 142 as stated in our initial memo. | 142 | 167; 142 (rejected) | **PROPOSE** `The Company employs 167 people across Stockholm, Oslo, and Helsinki.` | Employs / people. One-sided as-at date is observation time, not identity. |
| JUDGEMENT | F18-S7 | Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold… | Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo. | EUR 38 million (from); EUR 95 million (to) | EUR 35 million (current ARR) | **DECLINE** | Draft 38 is the start of a forecast path; source 35 is current ARR. Same abbreviation, not the same quantity. Today `548f131` proposes this swap. This pass would reverse that pin. |
| JUDGEMENT | F18-S8 | The base case generates 2.8x MOIC and 23% gross IRR. | Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation. | 2.8x; 23% | 2.6x; 21% | **DECLINE** | IRR pair fails **c** (gross vs absent). If IRR is dropped, MOIC 2.8x→2.6x would be the sole survivor — that half-fix leaves the contradicted IRR in place. Fail closed unless exactly one licensed pair on the original statement **before** qualifier drop, or Ben rules that a remaining licensed pair may still propose. Recommendation: decline the sentence. |
| JUDGEMENT | F19-S2 | The exit of NorTech Industries — which closed in January 2026 at SEK 18.4 billion and generated a 3.56x gross MOIC / 31.4 percent gross IRR — is the largest realisation… | …The exit generated gross proceeds of SEK 12.8 billion to Fund IV on invested capital of SEK 3.6 billion, representing a 3.56x gross MOIC and 31.4% gross IRR.… | SEK 18.4 billion; 3.56x; 31.4 percent | SEK 12.8 billion (proceeds); SEK 3.6 billion (invested capital); 3.56x; 31.4% | **DECLINE** | `closed at SEK 18.4 billion` is not named as `gross proceeds to Fund IV`. MOIC and IRR values already match. |
| CLEAR | F19-S13 | Brightway Industrial Coatings and Eltex Power Systems are both progressing toward exit-readiness, with formal processes likely to launch in the first and third quarters respectively. | We anticipate two additional realisations during 2026… We will provide further updates as these processes develop. | — | 2026 | DECLINE | Timing / whether a process has launched. No figure pair. |
| CLEAR | W2 (extra) | The fund has delivered a net IRR of 18.4% since inception. | The net IRR since inception is 11.2%. | 18.4% | 11.2% | **PROPOSE** `The fund has delivered a net IRR of 11.2% since inception.` | Net + IRR + since inception on both sides. This is the unmarked fact-sheet case B169 exists for. Today: no proposal. |

**Proposed pin after Ben rules (not to be built against until then):**

- CLEAR PROPOSE: F18-S3, W2.
- JUDGEMENT PROPOSE, pending Ben: F13-S7, F18-S4, F18-S5.
- JUDGEMENT DECLINE, pending Ben: F17-S9, F18-S7, F18-S8, F19-S2.
- CLEAR DECLINE: the other eleven.

Today’s `548f131` pin on live F18 was 4 replace (S3, S4, S5, S7) and 3 ack (S0, S2, S8). This design keeps S3, asks Ben on S4/S5, and proposes to **drop S7** (forecast-from vs current ARR) and to **keep S8 declined**.

---

## Files (eventual build)

**Inline. No new production module.** Replace the pair finder inside the existing locator. Do not add a second path.

| Path | Decision |
|---|---|
| `lib/revise-actions/conflict-engagement.mjs` | **Replace** `findCandidatePairs`: drop the rejected-token requirement; add name windows, qualifier families, currency on `classify`, `N percent` as percentage, component filter. Keep `tokenizeQuantities` (extended), `applyConflictProposal`, exact-quote `buildReplaceProposal`, fail-closed unless exactly one surviving pair, `CONFLICT_PROPOSAL_UNENGAGED`. |
| `lib/revise-actions/run.mjs` | No change if `applyConflictProposal`’s contract stays `{ status, pair, proposal }`. |
| `tests/revise-actions-conflict-engagement.test.mjs` | Change. W2 unmarked IRR becomes PROPOSE. F18-S7 pin follows Ben’s ruling. Unrelated 142 people vs 167 investments stays decline. Correction-shaped 412/380 stays closable **via naming**, not via `not`. |
| `docs/BACKLOG.md` | Close **B169** only after the ruled table is built and tests pin it. Not in this design commit beyond the annotation below. |

**NEW FILES (eventual build):**

- `tests/revise-actions-quantity-match.test.mjs` — one test per ruled table row (PROPOSE asserts the exact resulting sentence; DECLINE asserts no pair / ACKNOWLEDGE `conflict_unaddressed`). No diagnostic JSON read at runtime; inline the fixtures.

**NEW FILES (this design commit):**

- `scripts/diagnostic/delivery-check/quantity-matching-design.md` (this file).

**Correction-wording code:** **replaced**, not extended. `rejectedRanges` / split-by-`not` goes away. Naming does its job. Do not leave a parallel kind-only path behind a correction regex.

---

## Risk

**Worst wrong swap this rule could still produce:** treating a forecast **from** ARR as current ARR and writing the source’s current figure into a base-case growth path (live F18-S7: `from EUR 38 million to approximately EUR 95 million` ← `EUR 35 million` current ARR). Second-worst: swapping `closed at SEK 18.4 billion` for `gross proceeds of SEK 12.8 billion` (F19-S2), or `40 percent of leases roll` for `18%` rental reversion (F17-S9).

**What catches it:** the name/qualifier rule as written (from/to + hold period vs as-at current; closed-at vs proceeds; leases-roll vs rental reversion); fail-closed on ≠1 pair; Ben’s JUDGEMENT rulings before any build; the pinned table test. A false acknowledgement is preferred to a wrong proposal. Do not loosen Jaccard or drop the qualifier families to recover a declined row.

Do not re-run the frozen corpus. Do not call a model.

---

## Recorded, not designed

### B171 — user-supplied authoring organisation (new)

Ben’s decision 2026-09-11: the authoring organisation should be supplied by the user, not by a server setting. It can be entered in account settings (which do not exist yet) or as a pre-populated input field in the interface.

Already true in code, still true after this record:

- The request-body path exists and has never been exercised (**B95**).
- The environment value is one identity per deployment (**B124**). Deployed value is still the fixture name (**B96**).
- After `202b357` a wrong or missing value is no longer dangerous: the draft-presence gate refuses the write. It also **silently does nothing**, which is its own problem.

When this is built, the draft-presence check changes job from **gate** (do not write a name the draft never mentioned) to **sanity check**: if the user states an organisation the draft never mentions, **tell them**, rather than acting silently. Do not close **B95**, **B96**, **B124**, or **B170** from this record.

Out of scope for the quantity-matching build.
