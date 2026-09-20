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
