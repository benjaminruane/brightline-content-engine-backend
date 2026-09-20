# How the editorial review would be designed today, from a blank sheet

PROPOSAL. Not a build spec. No production-path change.

P1 was written before reading the current implementation. P2 onwards are after that read.

Every claim is **CONFIRMED** (file and line, or a named URL) or **HYPOTHESIS**.

---

## Scoreboard

| | |
|--|--|
| The design | **Three layers.** Code for mechanical style. One document-level LLM call for rules that need the whole draft, with findings bound by a verbatim quote. One small per-sentence LLM call for the rest of craft, and a separate per-sentence call for sentence-local compliance. |
| Constraints challenged | **4's remedy, not 4's observation.** Judging one sentence at a time is a sufficient fix for misattribution. It is not the only fix. Bind the finding to a quote that code can locate. |
| Cost on a 3,700-word memo, all checks complete | **P1 guessed about USD 3.3. After reading: about USD 2.2 list less than today's complete Stage 6, not a halving.** Soft: whether Layer B recovers the findings B271 lost. |
| Wall clock, all checks complete | **P1 guessed 40 to 70 s. After reading: TPM floor would fall from about 101 s to about 75 s of Stage 6 tokens.** Soft: whether a higher pool than 4 is then safe. Today's complete run is 123 s at pool 4. |
| Would I do it in a two-month run to a first usable product? | **No.** Keep what exists. Revisit after launch. The pool of 4 already finishes the checks. This design is a cost-and-wait project with a findings risk that has already killed two prompt changes this month. |
| This pass spend | **USD 0.** No ledger row. |

---

## P1. The design (written before reading the current code)

A draft is N sentences. A finding is a rule firing on one of those sentences, or a loud miss. The backend produces that. The screen renders it.

### Three layers

**Layer A. Mechanical style, in code. Zero LLM calls.**

A style rule with a structurally checkable property does not belong in a prompt. Punctuation, number and date shapes, curly quotes, first-person pronouns on a third-person output type: the code either sees the span or it does not. Putting those in a model wastes tokens, adds wobble, and still needs a deterministic filter afterwards. HYPOTHESIS on the exact membership of this set until P2. The class is the design.

**Layer B. Document-level judgement, once per document.**

Constraint 3 is accepted: materiality (thesis, already given) and first-use jargon need the whole draft. Voice that must hold throughout is the same class. HYPOTHESIS until P2 that those are the only editorial members.

One request. The user payload is the draft as a numbered sentence list, plus those rules only. The model returns `{ quote, ruleId, note, direction }[]`. Code locates `quote` in the draft and attaches the finding to that sentence. If locate fails, the finding is dropped and logged. It is not attached to a guessed index, and it is not a silent clean on the document: the document-level check ran; that instance did not bind. Constraint 1 holds because the sentence is the locate result, not the model's claimed index. Constraint 4's observation holds because we do not trust the model's pointing.

**Layer C. Sentence-local judgement, once per sentence, twice (craft and compliance).**

Everything else is a property of this sentence, with the previous and next sentence as neighbours for flow. The payload is: current sentence, neighbour texts, the local rule subset. Not the full draft. Craft (remaining editorial plus remaining style) in one call. Compliance that does not need "elsewhere in the document" in a second call. A concern whose quote is not a substring of the current sentence is dropped (fidelity). A failed call stamps `not_reviewed` on that sentence for that signal. Never `clean`.

Compliance rules that do need the rest of the document (a disclosure that should appear somewhere) go in Layer B, not here. HYPOTHESIS on which compliance ids those are until P2.

### Request count

For N sentences: **2N + 2**.

- 1 document-level craft call
- 1 document-level compliance call (or omit if no document-level compliance rule exists)
- N local craft calls
- N local compliance calls

Layer A is not a request.

Do not batch Layer C until Layer B's quote-bind has a failing test and a passing one. Batching is how constraint 4 was discovered. Quote-bind is the thing that would make batching safe. It is not proven. So the first design does not batch.

### What comes back

Per sentence, per signal (editorial+style, compliance):

- `verdict`: `concern` / `clean` / `not_reviewed`
- `concerns[]`: `{ ruleId, quote, note, direction }` already bound to this sentence
- Layer A may add style concerns with no model

The frontend does not re-derive any of this.

### Constraints

| # | Stance |
|---|--------|
| 1 Sentence-visible findings | Accept. Locate, do not trust a model index. |
| 2 A miss is a miss | Accept. Failed Layer C stamps `not_reviewed`. A Layer B locate miss drops that instance and logs. It does not invent a finding and does not mark the sentence clean for a check that never bound. |
| 3 Some rules need the document | Accept. Measured. Layer B exists because of this. |
| 4 Misattribution | **Challenge the remedy, not the fact.** One-sentence requests are a working mitigation. They are also why each call carries the whole draft today, which is the TPM problem. The actual requirement is: a finding must be about the sentence the quote lives in. Quote-locate is that requirement. One-at-a-time without the draft is the other half (Layer C). |
| 5 Backend decides | Accept. |
| 6 Wobble floor | Accept. Any A/B is judged against run-to-run disagreement on identical prompts, not against a single control run. |
| 7 Portability | Accept. This design uses ordinary chat completions: system plus user, JSON out. No files-API handle, no provider-specific cache-control, no cross-request labels. Automatic prefix cache, if a provider offers it, is a bill discount. Correctness does not depend on it. |

### Cost and time for a 3,700-word document

Inputs used as planning numbers, all HYPOTHESIS until P2:

- 3,700 words is about 185 sentences (about 20 words each) and about 5,000 tokens of draft.
- gpt-4o-class list rates USD 2.50 / 1e6 input, USD 10 / 1e6 output.
- Layer B: about 8,000 input (draft plus a small rule subset) and 2,000 output: about **USD 0.04**.
- Layer C craft: about 3,400 input per sentence (local rules plus neighbours, no draft) times 185: about 0.63M input, about USD 1.57; output about 200 tokens times 185: about USD 0.37; **about USD 1.94**.
- Layer C compliance: about 2,200 input per sentence: about USD 1.02 in, USD 0.28 out; **about USD 1.30**.
- Layer D/B compliance document: about **USD 0.04**.
- Layer A: **USD 0**.

**About USD 3.3 list** for editorial, style, and compliance together, all checks complete. Soft: the 3,400 and 2,200 per-call figures are guessed from "rules plus a sentence" rather than measured. Soft: output length. Soft: cache discount (see P3; cached tokens still count toward TPM even if they cut the bill).

Wall clock: total Layer C tokens about 1.0M input. At 2.0M TPM that is 30 s of token budget. Latency: if each local call is about 3 s and 24 run at once, 185/24 waves is about 8 waves, about 24 s, with craft and compliance overlapping. **HYPOTHESIS 40 to 70 s** including the two document calls and some queueing. Soft: real latency, and whether a 24-wide pool of smaller calls still 429s. The design assumes concurrency is set from token rate, not copied from today's cap of 4, which exists because each of today's calls is huge.

TPM: finishing every check is the point. Smaller calls are how. Not fewer sentences, and not a proprietary handle.

---

## P2. Comparison with the current implementation

Read after P1 was written. The problem statement is stale in two numbers. CONFIRMED `docs/BACKLOG.md` B268: the same memo now completes editorial **186/186** and compliance **186/186** in **123368 ms**, list USD **11.1897**. The "80 seconds and a third lost" picture is the pool-24 run (`de18131c-507f-4111-85ec-ffc15be7de8c`, 64 + 34 `not_reviewed`, 81898 ms, USD 8.4497 with 98 unpriced).

### What today already is

v4 Stage 6: one combined editorial+style call per sentence, one compliance call per sentence. CONFIRMED `ARCHITECTURE.md` L21, `editorial-compliance-reviewer.mjs` L2101, L2206-2207. Pool 4. CONFIRMED `pipeline-v4/index.mjs` L45.

Editorial user payload: CONTEXT BEFORE, CURRENT STATEMENT, CONTEXT AFTER, then `FULL DRAFT` marked `[REVIEW THIS]`. CONFIRMED L1387-1407. Mean input **14,813** tokens. CONFIRMED `review-cost-proposal.md` L58, B271 old-a 592,509 / 40.

Compliance user payload: CURRENT STATEMENT plus publication state. No draft. CONFIRMED L1424-1431. Mean about **3,325** tokens. CONFIRMED 505,449 / 152 priced (`review-cost-proposal.md` L46).

System prompt about **9,088** tokens, identical every sentence. CONFIRMED `review-cost-proposal.md` L24. Automatic prefix cache already hits: 83.3% of all input on the comparable run; 88.6% of billed editorial input among successes. CONFIRMED L41, L198.

`FIDELITY_DROP` drops a concern whose quote is not in the target statement. CONFIRMED L1187-1198. **B99** records that this is partial: a misattribution that quotes text the target also contains survives. CONFIRMED `docs/BACKLOG.md` B99.

Deterministic style filters **DROP** false positives. They do not RAISE misses. CONFIRMED L806-812, `docs/BACKLOG.md` B157. The filter table runs from `oxford_comma` through `em_dash`. CONFIRMED L813-1047.

Rule counts: 14 editorial, 15 style, 10 compliance. CONFIRMED `lib/rulebook/editorialRules.js` L29-174, `lib/rulebook/styleGuide.js` L97-250, `lib/rulebook/complianceRules.js` L10-99. `expected_disclosure_language_absent_on_public` asks the reviewer to confirm a disclaimer is "present elsewhere in the document" and the payload cannot see the document. CONFIRMED `lib/rulebook/complianceRules.js` L56 vs L1424-1431.

Measured document-level editorial members: `materiality` (thesis, already given) and `audience_calibration_jargon` (first use). CONFIRMED `lib/rulebook/editorialRules.js` L125-129 and L79-83, and B271. Rule text also puts a throughout clause on `voice_consistency`. CONFIRMED L33-36. B271 did not show that id as a stable shift. `narrative_coherence` is neighbours by the rule, document-sensitive in the measurement. CONFIRMED L116-120 and B271.

B271: dropping `FULL DRAFT`, keeping neighbours, moved findings past this stage's own wobble (old-versus-old 13/40, old-versus-new mean 26.25/40, twelve stable shifts, eight of them `materiality` going clean). Short control did not move. CONFIRMED `docs/BACKLOG.md` B271. B273: telling the model the draft is for materiality and first-use jargon also moved codes (mean 24/40). Line left alone. CONFIRMED `docs/BACKLOG.md` B273.

R3.1 already merged style into editorial because both are craft. Compliance stayed separate on purpose. CONFIRMED `ARCHITECTURE.md` L48-49. Editorial is source-blind (B178). CONFIRMED L1382-1384.

A parked editorial rule, `imprecision_when_precision_available`, was removed as an LLM rule after it invented figures, with a note to reinstate as a deterministic check. CONFIRMED `lib/rulebook/editorialRules.js` L18-25. That is Layer A thinking, already learned.

### What today does better than P1

1. **Compliance is already the small call P1 invented.** Redesigning it is wasted motion. On this memo it is 15% of the bill and has no draft. CONFIRMED `review-cost-proposal.md` L46.

2. **Craft is already combined.** P1's Layer C merge of remaining editorial and style is R3.1. Do not undo it.

3. **The 9,088-token prefix cache is a real asset.** P1 said "local rule subset" per sentence. That would change the system prompt every call and break the cache. CONFIRMED `review-cost-proposal.md` L222. Layer B vs Layer C should be two *stable* system prompts, not a per-sentence menu.

4. **Layer A as the only judge of mechanical style is too aggressive.** Today knows, from B102 and B157, that the model both over-fires (hyphen as em dash) and under-fires (no RAISE). Filters-only-drop is the year of incidents. P1 should be amended: keep mechanical rules in the prompt, RAISE in code where the property is checkable. That is what `ARCHITECTURE.md` L89 already states, minus the RAISE.

5. **`FIDELITY_DROP` already exists.** P1 reinvented it for Layer C. What P1 adds for Layer B is different: locate the quote in the *whole draft* and attach to that sentence, rather than drop because it was not in the sentence we asked about. That is the B99-shaped hole. CONFIRMED B99.

6. **A year of prompt law** P1 did not list: output-type calibration, house voice, first-person actor substitution, evaluative-deletion bounds, one concern per rule, register, source-blind editorial, duplication judge on evidence-conflict. Those stay. A blank sheet that throws them away would relearn them.

7. **`not_reviewed` is production-hardened.** B202, B254, B268. P1's miss path is the same idea. Do not rebuild it.

### What P1 does better than today

1. **Paying for the document once.** B271 proved the draft is load-bearing for some rules. Today's conclusion was keep sending it N times. The blank-sheet reading is: send it once, for those rules, and stop sending it on the other N calls. That is not the experiment B271 ran. B271 dropped the draft and put nothing in its place.

2. **Quote-locate onto the sentence the quote actually lives in** would be a stricter answer to B99 than "ask about one sentence while pasting the whole draft", which is how B99 happens.

3. **RAISE backstops** for mechanical style. Filed, not built (B157).

4. **`expected_disclosure` cannot work as written** on today's compliance payload. A document-level compliance call, on public investor-letter and press-release only, would make that rule honest. Not needed on the Shopify memo (reporting commentary, complete).

### Where reading changed my mind

**The dollar figure in P1 was too low.** B271 already measured the no-draft editorial call at **10,039** mean input, not 3,400. CONFIRMED B271 (592,509 to 401,572 on 40). Corrected Stage 6 list, all 186 complete:

- Today: 186 * 14,813 * 2.50 / 1e6 = **USD 6.89** editorial input, plus 186 * 3,325 * 2.50 / 1e6 = **USD 1.54** compliance input, plus output. About USD 8.4 input before output.
- P1 Layer C at the measured no-draft size: 186 * 10,039 * 2.50 / 1e6 = **USD 4.67** editorial input, plus one Layer B about USD 0.04, plus the same compliance USD 1.54. About **USD 6.25** input. Save about **USD 2.2 list** on a complete run. That is the B271-scale save, with Layer B supposed to catch the findings B271 lost.

**Do not split the local rule list per sentence.** Two stable prefixes (document-level, sentence-local). Otherwise the cache dies.

**Do not rebuild compliance.** Leave it.

**Layer A is RAISE, not exclusive.**

The shape of P1 (document once, sentence without draft, bind by quote) is unchanged. The costing and the mechanical-style layer changed.

---

## P3. Ben's question

"Why not send the draft once and the source once, label them, and have each sentence's request refer to those labels?"

Because the interface we use has no such labels.

Each Chat Completions call is self-contained. The model sees the `messages` you send on that call. There is no parameter that means "also include blob D from an earlier call." CONFIRMED by how `callLLM` is invoked on the production v4 path: `messages: [{ role: "system", content }, { role: "user", content }]` in `editorial-compliance-reviewer.mjs` L1759-1762 (combined editorial+style) and L1953-1956 (compliance). The OpenAI prompt-cache design is prefix reuse of bytes you *resend*, not a handle. CONFIRMED [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching): "Prompt caching preserves that state for a reusable prefix: the unchanged tokens at the beginning of a prompt." Cache reuse "requires the entire rendered prefix to match." You still send the prefix.

What automatic prefix caching already does: if two requests share a long identical start, the provider discounts those input tokens (50% on `gpt-4o-2024-08-06`, CONFIRMED `lib/observability.js` L49) and skips some compute. Measured hit rate on this memo: **83.3% of all input** on the comparable production run; **88.6%** of billed editorial input among the 122 successes. CONFIRMED `review-cost-proposal.md` L41, L198. Unbounded parallel dropped editorial cache to 28.5%. CONFIRMED L198. B271: with the draft, 82-85% on the 40; without it, 94-95%. CONFIRMED `docs/BACKLOG.md` B271.

What it does not do: it does not remove those tokens from the tokens-per-minute limit. CONFIRMED OpenAI FAQ, same page: "Do cached prompts count toward rate limits? Yes. Cached input tokens still count toward tokens-per-minute limits." That is why 429s continued after cache was already hitting. The unique CURRENT STATEMENT sits *before* the full draft, so the draft is not in the cached prefix. CONFIRMED `review-cost-proposal.md` L24, L204, payload L1387-1407.

A true upload-once handle: Assistants file_search and vector stores retrieve snippets; they are not "here is the exact draft, call it D." Gemini context caching and Anthropic `cache_control` are explicit provider features. Using any of them as the way Review works would violate constraint 7 unless Ben takes that as a separate decision. Even then, on OpenAI, cached tokens still count toward TPM, so a handle that is implemented as prefix cache would **not** help the per-minute limit. HYPOTHESIS for Gemini's quota accounting; do not assume it is kinder without reading that project's limits page.

### Versions of the idea that are viable

**A. Reorder, still send everything.** Put the unmarked draft (and the system prompt) first, the unique sentence last. OpenAI: "Put stable developer instructions and shared reference material first." CONFIRMED the prompt-caching page L379 in the fetched copy. The draft would then prefix-cache. The bill would fall (50% on those tokens). TPM would not. Findings might move: some models weigh later text more. HYPOTHESIS. Constraint 6 says measure against the 13/40 floor. This is a bill tweak, not a 429 fix. Portability: fine. It is ordinary message order.

**B. Send the draft once as a product design, not as a provider feature.** That is P1 Layer B: one request carries the draft for the document-level rules; the other N requests do not. No cross-request labels. Each call is still self-contained. TPM falls because the tokens are not sent N times. This is the viable reading of Ben's question. It does not need a proprietary API.

**C. Provider file or cache handle.** Not viable under constraint 7, and on OpenAI it would not fix TPM.

Do not dismiss B because the code currently pastes the draft N times. That paste is the cost. B is how you would do "send it once" on the API we actually have.

---

## P4. What would it take, and is it worth it?

If Layer B plus Layer C-without-draft is better, the honest size:

| | |
|--|--|
| Days | 5 to 10 of build, plus the measurement below. Quote-locate, two system prompts, merge of document-level concerns onto sentence cards, RAISE backstops as a separate slice (B157). |
| Risk to findings | **High.** B271 is exactly Layer C without Layer B, and it moved materiality. B273 is telling the model the truth about the draft, and it also moved. Layer B is supposed to catch what those lost. Unproven. Shipping Layer C first is shipping B271. |
| Re-measure | Stage-replay 40 on the Shopify fixture, two old, two new, against 13/40. Then the 17-card control. Then one production 186 if the 40 holds. About USD 3 + USD 11 if you include production. |

**Would I do it inside a two-month run to a first usable product? No.**

The first usable product needed the checks to finish. B268 did that. Cost is about USD 11 list and wait is 123 s, both inside the 300 s cap. This design saves about USD 2.2 list and some wait, if it holds. It can also silently drop materiality again. That is the wrong bet for launch. Keep what exists. Revisit when cost or wait is the thing blocking a client, or when a second document class (much longer than 3,700 words) hits the 300 s cliff recorded on B268.

"Keep what exists" here means: pool 4, full draft on every editorial call, compliance as it is, `not_reviewed` as it is. Not: reopen B271.

---

## P5. How would yours be proven?

Instrument: `scripts/diagnostic/stage-replay/` (B270). Fixture `tests/fixtures/b247/shopify-messy-full-after.json`. Same 40-subset B271 used. Wobble floor: old-versus-old **13/40** codesDiffer. CONFIRMED B271. Control: the 17-card prefix that did not move when the draft was dropped.

Protocol:

1. Two runs of today's editorial Stage 6 on the 40. Confirm the floor is still about 13/40. If the floor has moved, stop and use the new floor.
2. Two runs of Layer C without `FULL DRAFT` plus Layer B (document-level rules, quote-locate). Merge by sentence index.
3. Compare each old to each new. Mean codesDiffer. Stable shifts (both olds agree, both news agree, they differ).
4. Same four runs on the 17-card control.
5. Planted B99 fixture: a first-person problem in sentence i-1, ask about sentence i. Layer B must attach to i-1 or drop, never to i. Layer C must not flag i for a quote that lives only in i-1.

**Kill:**

- Mean old-versus-new codesDiffer **greater than the floor** (13/40, or whatever step 1 prints).
- `materiality` stable-shifts of the B271 shape (several indexes going clean) **not recovered** as Layer B findings on those same indexes.
- The 17-card control moves past its own floor.
- The planted B99 case attaches to the wrong sentence.

If it survives that, one production 186, all checks on, completions 186/186, wall and list USD reported. Completions holding is not enough. Completions held after B268 with the old payload.

No model calls in this pass. A 40-subset two-plus-two would be about USD 6 list. Over this spec's USD 2 budget. Not run.

---

## Where this disagrees with Claude, and with the constraints

| Who | Claim | This pass |
|-----|-------|-----------|
| Constraint 4's remedy | One sentence per request is the only safe design. | **Challenge the remedy.** The requirement is quote-bind. One-at-a-time is a working mitigation that currently carries the whole draft, which is the TPM problem. |
| Constraints 1, 2, 3, 5, 6, 7 | As stated. | Accept. |
| Claude, `review-cost-proposal.md` L30 | First move: drop the full marked draft from every editorial call. | **Killed by B271.** That experiment had no Layer B. P1 is not that experiment. |
| Claude, `document-context-proposal.md` C2 | Compact document context: favourite, also a predicted trap. | Agree with the trap. A summary removes proportion and restatement. Layer B sends the real draft, once. |
| Claude, `document-context-proposal.md` C1 per-sentence split | Send the draft only on the sentence calls whose rules need it. | Negative save. The 9,088-token prefix still ships, and the draft still ships 186 times on the document-rule call. CONFIRMED that proposal L139. |
| Claude, `document-context-proposal.md` C1 once-per-doc | Same proposal's P2(b): document rules once, findings still per sentence. | That is this pass's Layer B. Claude said do not build it in the launch window. **Agree on timing. Disagree that "keep the draft on every sentence" is the right forever design.** |
| Claude, per-sentence rule subset | Send only rules that could fire. | **Breaks the 9,088-token prefix cache.** CONFIRMED `review-cost-proposal.md` L222. Two stable prefixes, not a menu. |
| Claude / cost proposal | Reorder-only or warmup-only as a 429 fix. | **Disagree.** Cached tokens still count toward TPM. Reorder is a bill tweak (P3.A). Viable. Not a 429 fix. |
| Today's shipped conclusion after B271 | Keep the draft on every sentence call. | Right for the next two months. Wrong as a forever architecture if cost or a longer memo becomes the blocker. |

---

## Cost report

| | |
|--|--|
| Model calls this pass | 0 |
| List USD | 0 |
| Discounted USD | 0 |
| Measurement declined | A Layer B plus Layer C A/B on the 40 would be about USD 6 list, over the USD 2 budget. B271 and B273 already priced the two halves. |
| Ledger row | None. Nothing billed. |

---

## Follow-up: ceiling, clock, progressive delivery

P4 weighed a two-month launch. That criterion is withdrawn here. This section is design merit only.

Every claim is **CONFIRMED** (file and line, or a named URL) or **HYPOTHESIS**. Arithmetic is HYPOTHESIS built from confirmed unit costs, except the 3,700-word today column, which is measured.

### Scoreboard

| | |
|--|--|
| Is the blank-sheet design better than today's, on merit? | **Yes.** Today is O(N squared) in Stage 6 tokens. This design is O(N). The 3,700-word memo hid that. |
| Does it hit 10 s useful / 60 s done on that memo? | **No.** Stage 1 alone was 35.2 s. Whole-review TPM floor on this design is still about 101 s. |
| Can a reviewer see evidence cards while style is running? | **Not under this design as written, and not under today.** Both wait for one `POST` to finish. |
| First shippable slice | Layer B plus drop `FULL DRAFT` from the per-sentence craft call, with quote-locate. Prove it on the 40 against the 13/40 floor. |

---

### 1. The ceiling

Today every editorial call carries the whole draft, so Stage 6 editorial tokens are `N * (local + draft)`. `N` and `draft` both grow with the document. That is quadratic. CONFIRMED B268: the shipped design "Stops working at about twice this memo" when sentence count and `FULL DRAFT` both double. CONFIRMED `docs/BACKLOG.md` B268.

This design pays the draft once (Layer B) and pays a local call per sentence (Layer C). Stage 6 editorial tokens are `N * local + draft`. Linear in N, plus one copy of the draft.

Unit costs, all CONFIRMED at the 3,698-word / 186-statement memo (`shopify-messy-full.md` L5, B268):

- Local editorial call without `FULL DRAFT`: mean **10,039** input. B271 (592,509 to 401,572 on 40).
- Draft adder on today's call: **4,774** input. Same subtraction.
- Compliance per sentence, no draft: mean **3,325** input. `review-cost-proposal.md` L46 (505,449 / 152).
- Other stages (Stage 1, 2, 5, small): about **0.867 M** input. L45-53.
- OpenAI TPM on this org: **2,000,000 / min**. `async-review-proposal.md` L101.
- Function cap: **300 s**. `vercel.json` `api/*.js` `maxDuration`.
- List rate: USD 2.50 / 1e6 input. `lib/observability.js` L49.

Scaling assumption, HYPOTHESIS: average sentence length holds, so N and draft length both scale with word count; Stage 2/5 scale with N; the B1 stub source does not grow. A same-length source would add Stage 2 tokens on top of every column. CONFIRMED that this memo's source was 83 characters (`shopify-messy-full.md` L9), so the table is optimistic on Stage 2.

| | 3,700 words / 186 statements | 7,400 words / 372 statements | 15,000 words / 754 statements |
|--|--:|--:|--:|
| Today Stage 6 input | 3.37 M | 8.53 M | 24.7 M |
| Today Stage 6 TPM floor | **101 s** | **256 s** | **740 s** |
| Today all-LLM TPM floor | **127 s** | **308 s** | **846 s** |
| Today wall | **123 s measured** (B268) | HYPOTHESIS ~300 s, then the cap | HYPOTHESIS ~14 min |
| Today list USD | **11.19 measured** | HYPOTHESIS ~27 | HYPOTHESIS ~73 |
| Today completes inside 300 s? | **Yes.** Measured. | **No.** All-LLM TPM 308 s. Matches B268's "about twice". | **No.** |
| This design Stage 6 input | 2.49 M | 4.98 M | 10.1 M |
| This design Stage 6 TPM floor | **75 s** | **150 s** | **303 s** |
| This design all-LLM TPM floor | **101 s** | **202 s** | **409 s** |
| This design wall | HYPOTHESIS ~100 s | HYPOTHESIS ~200 s | HYPOTHESIS ~7 min |
| This design list USD | HYPOTHESIS ~8.9 | HYPOTHESIS ~18 | HYPOTHESIS ~36 |
| This design completes inside 300 s? | **Yes.** | **Yes.** | **No.** |

Where today stops: just under **7,400 words / ~370 statements**, on this host and this TPM, with a short source. CONFIRMED as B268's hypothesis; the arithmetic above is the same shape (308 s of tokens, cap 300 s).

Where this design stops: about **11,000 words / ~550 statements** on the same host and TPM (all-LLM TPM floor hits 300 s). HYPOTHESIS. Soft: Stage 1 is one completion whose wall was 35.2 s at 3,700 words (`shopify-messy-full.md` L43). At 11,000 words that completion emits three times the sentence list. Its wall will grow. The 11,000-word stop may be earlier if Stage 1, not Stage 6, is then the cliff.

A worker does not move these stops. TPM is an org budget, not a Function budget. CONFIRMED `async-review-proposal.md` L121. Splitting Stage 6 across two minutes would finish a 15,000-word memo on this design and would miss the clock in section 2.

The 3,700-word comparison in P2 (about USD 2.2 list, 26 s of Stage 6 TPM) is real and small. The 7,400-word comparison is the one that matters: today likely returns `not_reviewed` or a 504; this design likely returns a finished review in about 200 s.

---

### 2. The clock

Target, at 186 statements: something useful on screen in about **10 s**, everything finished in about **60 s**. Today the same memo is a blank wait for **123 s**. CONFIRMED B268.

**This design does not hit either number.**

Everything finished in 60 s: all tokens in a 60 s review count toward one TPM window. Cap about **2.0 M tokens**. CONFIRMED the 429 text, `async-review-proposal.md` L101. This design's whole-review input is about **3.36 M**. Floor **101 s**. Raising the Stage 6 pool does not cut tokens. Cached tokens still count. CONFIRMED OpenAI prompt-caching FAQ.

Something useful in 10 s: Stage 1 on this memo was **35.2 s** before Stage 2 started. CONFIRMED `shopify-messy-full.md` L43. Stage 2 was about **10 s**. CONFIRMED L44. Evidence verdicts exist only after Stage 3. CONFIRMED `docs/ARCHITECTURE.md` L24. This design does not touch Stage 1 or Stage 2. Evidence is not ready at 10 s, internally or on screen.

What would hit the target, and what it costs:

1. **Stage 1 has to get faster**, or the screen has to show a deterministic split before the LLM split returns. Otherwise 10 s useful is impossible on this memo. Cost: B248 / B249 (dropped non-claim text, uncovered draft bytes). A new split is a findings risk of its own, not an editorial-payload A/B. Not priced here.

2. **The 9,088-token system prompt cannot be sent 186 times** if 60 s done is required. That prefix is 1.69 M input by itself. CONFIRMED `review-cost-proposal.md` L24. Layer C as written still sends it once per sentence. The move that cuts it, without a proprietary handle, is **batching sentences behind quote-locate**: B sentences share one prefix. HYPOTHESIS at a batch of 8: Stage 6 craft plus compliance fall on the order of 0.5 M, whole-review input on the order of 1.4 M, TPM floor on the order of 40 s. Soft: batch size, compliance system size, output length. **Constraint 4's observation is why this was not the P1 default.** It is also the only portable way to make the prefix cheap. Findings cost: the wobble floor, plus a planted B99 fixture that must not attach to the wrong sentence.

3. Even with (2), **35 s of Stage 1 plus 10 s of Stage 2 is already 45 s** before style starts. 60 s done still fails unless (1) lands. Style-side work cannot recover a 45 s evidence block.

A higher OpenAI TPM would move the 60 s line and would violate the spirit of constraint 7 if the product required it. A client org may have a different ceiling. Do not design as if 2.0 M is a law of nature. Do not design as if it is 10.0 M either. CONFIRMED only for this org, this snapshot.

---

### 3. Progressive delivery

Evidence is settled before style runs. CONFIRMED `docs/ARCHITECTURE.md` L24: Stage 1, 1b, 2, 3, then Stage 6, then Stage 5, then 7. Stage 3 is deterministic aggregation. CONFIRMED L18.

Under this design as written: **no**. The reviewer cannot see evidence cards while style is running. The handler returns one JSON body. CONFIRMED `api/analyse-statements.js` L324. The browser waits for that body. CONFIRMED frontend `src/utils/api.js` L206-218. There is no stream and no job poll on this path. CONFIRMED `async-review-proposal.md` L159-161 (v1: the POST returns; no websocket).

Today is the same. The ordering inside the pipeline does not reach the screen.

What it would take:

The backend would have to emit an evidence-only card set at the end of Stage 3, then patch editorial, compliance, and commentary as they finish. The card shape already has a hole for "style not done": `editorialVerdict: "not_reviewed"` is honest, and the screen already knows `Not reviewed` when a check did not run (B247, B254). Do not stamp `clean`. Constraint 2.

Three ways to get that onto the screen. All of them mean **results leave the server before the review is finished.** That is the choice. There is no fourth way in which the client paints evidence while the only copy of those cards is still inside one unreturned `POST`.

| Way | What leaves, when | Request still open? | Portability |
|-----|-------------------|---------------------|-------------|
| Two POSTs (evidence, then style) | Evidence JSON on the first response. Style is a second request. | First request completes. Review does not. | Ordinary HTTP. Fine. |
| One POST, chunked / SSE | Evidence events on the wire before the last event. | Yes, until style finishes. | Host-specific. Vercel serverless streaming is not the client-container shape. |
| 202 plus poll (job row) | Evidence written to a store, then read by GET, while the worker still runs style. | The kickoff request completes early. | Portable. This is v2 in `async-review-proposal.md` L151-161. |

Constraint 5 still holds: the backend authors the partial cards. The frontend does not re-derive a verdict. A partial board is a backend contract with `not_reviewed` on the signals that have not run, never a client-side "assume clean".

If Ben wants 10 s useful, this choice is required **and** Stage 1 still has to get under 10 s, or the first useful thing is not an evidence card. Progressive delivery without a faster Stage 1 would paint evidence at about 45 s on this memo, then fill style after. That kills the blank wait. It does not hit 10 s.

---

### Re-answer, on merit alone

**Yes. The design is better than today's.**

Today's Stage 6 grows with N times the draft. That is why it dies at about twice this memo. This design pays the draft once. At 7,400 words that is the difference between a finished review and a cap miss. At 15,000 words both miss a 300 s Function, but this one is about half the tokens and half the bill, and it can finish if the work is allowed to span more than one TPM minute. P2's "USD 2.2 on the tested memo" was the wrong headline for that reason.

It is not a complete answer to the clock. Linear per-sentence calls still send a 9,088-token prefix 186 times, and Stage 1 is already 35 s. Hitting 10 / 60 needs a faster Stage 1, quote-bound batching, and a progressive evidence channel. Those are additional decisions. They do not make today's quadratic Stage 6 a better Stage 6.

**First shippable slice.** Layer B (document-level rules, whole draft, quote-locate onto a sentence) plus Layer C without `FULL DRAFT`. One stable system prompt for B, one for C. Compliance unchanged. No batching yet. No streaming yet.

What it proves: the document-level findings B271 lost can be recovered without pasting the draft onto every sentence. Local craft holds. Quote-locate does not attach to the wrong sentence.

How it is measured: `scripts/diagnostic/stage-replay/` (B270), Shopify 40-subset, two old, two new, against old-versus-old **13/40**. Same 17-card control. Planted B99 fixture: a first-person problem in sentence i-1 must not land on i.

Kill: mean old-versus-new codesDiffer greater than the floor; `materiality` stables of the B271 shape not recovered as Layer B findings on those indexes; the 17-card control moves past its own floor; the planted case attaches to the wrong sentence.

If that slice lives, batching is the next slice (clock), and progressive evidence is a separate architecture slice (blank wait), not a Stage 6 payload change.
