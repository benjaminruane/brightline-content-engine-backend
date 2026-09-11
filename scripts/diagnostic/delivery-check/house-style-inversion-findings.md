# House-style inversion findings

Read-only diagnostic, 2026-09-11. No pipeline, extract, evidence pass, action-list, or accuracy run. No LLM calls. Metered spend: **USD 0.00**. The only file written is this one. No product code changed.

**The question.** Is B176 one bad concern, or a class that fires whenever a source document does not follow house conventions?

**Short answer.** It is a class. The combined editorial+style prompt gives the model the house rules and also the source excerpt, and never says house style outranks source formatting. Stored batches show the same inversion on thousands separators, already-correct ISO currency, dates, and Oxford commas. The deterministic filters fail **open**: no locatable span means the false concern is kept.

**Sources used.**

- Prompt and filters: `lib/qc/editorial-compliance-reviewer.mjs`, `lib/qc/style-guide.mjs`.
- Committed accuracy cards: `scripts/diagnostic/accuracy/runs/*/cards.json` (all `editorialEnabled: false`).
- Committed editorial payloads: `scripts/diagnostic/delivery-check/live-2026-09-10-f18-review.json`; `scripts/diagnostic/revise/{suggest-after-r10-review1,suggest-after-r10-review2,condition-b-review,coverage-gap-review}.json`.
- Local gitignored batches (on disk, not in git; `.gitignore` line 21): `scripts/diagnostic/runs/**/result.json`. Counts below that cite `F##.S#` come from `pipelineResult.qcCards` in those files. A clone of the repo without that folder cannot reproduce the integers.
- Narrative corroboration (no JSON in git): `docs/diagnostic_findings.md` (26 May 2026), `docs/ROADMAP.md` R6.5.5 / source-style conflation, **B176**.

Card ids: `F<fixture>:S<index>` from `qcCards[].index`.

---

## Q1 The mechanism

**Verdict: the model is given the house rules as the standard, and is also given the source excerpt as text sitting next to the statement; nothing tells it that source formatting is not the standard to match.**

**House style.** The v4 combined call (`buildEditorialStyleSystemPrompt`) interpolates `formatStyleGuideRulesForPrompt` for every Layer 1 and Layer 2 rule: id, description, correct example, incorrect example. Layer 2 includes `thousand_separator` (high comma / apostrophe, not a low comma), `currency_format` (ISO code before the amount), `em_dash`, `smart_quotes`, `number_spelling`, `date_format`, `oxford_comma`, `percentage_notation`, `english_variant`, `first_person_plural`. Meta-rules add `VIOLATIONS_ONLY_CONTRACT` (“Return a violation ONLY when the rule is actually violated by the CURRENT STATEMENT”) and `STYLE_SCOPE_CURRENT_ONLY` (“Evaluate only the CURRENT STATEMENT”). The worked example for thousands separators is convert comma → high comma (`Replace "5,500" with "5'500"`).

**Source documents.** The user payload (`buildEditorialStyleUserPayload`) includes:

- `EVIDENCE EXCERPT (from the source supporting this statement):` — the Stage 4 excerpt, verbatim, including the source’s own punctuation and grouping.
- `SOURCE EVIDENCE (factual context only — do not assess this text for style, formatting, or language quality):` — the evidence block.

So the model sees the draft sentence and, in the same prompt, a source sentence that often writes the same figures in US grouping, `$`, em dashes, or abbreviated dates.

**Does anything say source formatting is not the standard?** No sentence of that form exists.

What exists instead:

- “do not assess this text for style, formatting, or language quality” — do not *review the source as a draft*. It does not say do not *rewrite the current statement to look like the source*.
- EDITORIAL_META: “The SOURCE EVIDENCE block below is supplementary context; do not raise editorial concerns about text that appears only there and not in the CURRENT STATEMENT.” — same direction: don’t flag the source; still silent on matching the draft to it.
- STYLE_META: “When quoting a source, preserve the source's original formatting exactly.” — this protects quoted source text. It can be read as “source formatting is sacred,” which is the opposite of “house style outranks the source.”

None of those lines say: if the source uses a different thousands separator, currency glyph, dash, quotation mark, number spelling, or date order, leave a house-compliant draft alone.

R6.5.5 (`docs/ROADMAP.md`) already named this “source-style conflation” and claimed it was “Resolved at the filter layer.” B176 is that claim failing in production.

---

## Q2 Which rules are exposed

**Verdict: every mechanical house-style rule whose correct form can differ from a typical source document can invert; six of the named rules are possible, and four of them are already in stored cards.**

| Rule | House form vs typical source | Inversion possible? | Filter if the raise is tagged with the live id and a span exists |
|---|---|---|---|
| `thousand_separator` | Draft `5'500` / `240'000`; source `5,500` / `240,000` | **Yes. Observed.** | DROP when the statement has apostrophe grouping and no `\d,\d{3}` |
| `currency_format` | Draft `EUR 445 million` / `USD 164'000`; source `$164K`, `€445m` | **Yes. Observed** as flags on already-correct ISO amounts | DROP when the statement is ISO-before-amount with no symbol/suffix |
| `em_dash` | Draft hyphen `-`; source em dash `—` (or the reverse) | **Yes.** One stored false raise on a sentence with no dash. **B102** is hyphen-as-em-dash. | **None.** `em_dash` is not in `STYLE_RULE_DETERMINISTIC_FILTERS` |
| `smart_quotes` | Draft straight `"` / `'`; source `“ ” ‘ ’` | **Yes, not seen in this sweep.** | **None** |
| `number_spelling` | Draft `twelve`; source `12` (carve-outs for %, money, dates) | **Yes.** Not counted as an inversion here (detector would need the cited span). | DROP if the cited span is spelled 0–12, a `%` token, or quarter notation |
| `date_format` | Draft `19 January 2026`; source `19 Jan 2026` / `January 19, 2026` / ISO | **Yes. Observed** — the model proposed the abbreviated form the rule forbids | DROP if the cited span already matches DD FullMonthName YYYY |
| `oxford_comma` | Draft `A, B, and C` or a two-item `A and B`; source often omits the serial comma | **Yes. Observed** — two-item lists, and lists that already contain `, and` | DROP only for two-item (no comma + and/or). Already-correct Oxford lists **keep** |
| `percentage_notation` | Draft `5.4%`; source `5.4 percent` | **Yes.** Sweep’s 126 hits were statements that already used the word “percent” (true positives), not inversions | DROP if span/statement already uses `%` and not “per cent” |
| `english_variant` | Draft US `organize`; source British `organise` | **Yes.** One stored inversion | DROP if the cited span has no British token |
| `first_person_plural` | Reporting commentary wants a named house, not `we` | Possible as “match the source’s we,” different shape from B176 | DROP if no we/our/us. Does not test house-style formatting |

Layer 1 `defined_term_capitalisation` can also invert (`the Company` defined in the draft, source writes `the company`). Not counted in Q3.

This is not one rule. It is every convention the source documents were not written to.

---

## Q3 How often

**Verdict: committed accuracy cards cannot answer (editorial is off); local gitignored Review batches show the class on six unique thousands-separator cards, forty-four already-correct ISO currency flags, nine Oxford-comma inversions, one inverted date, and one invented em-dash.**

### Committed accuracy (`scripts/diagnostic/accuracy/runs/`)

Every `cards.json` in that tree sets `editorialEnabled: false` (evidence-pass-1, -2, lift-1, reducer-1/2, rt-1/2, cw-1/2, spans-1). Compacted rows have no `editorialConcerns`. **Count per rule from that tree: 0.** What would answer: the same fixtures run with editorial+style on, and the resulting `qcCard.editorialConcerns` stored.

### Committed editorial JSON

`live-2026-09-10-f18-review.json` F18:S3 is `editorialVerdict: "clean"`, `editorialConcerns: []`. The later live inversion filed as **B176** is not in that file. The r10 / coverage-gap / condition-b reviews fire `voice_consistency`, `first_person_plural`, `marketing_language_excess` — not mechanical house-style inversions. Brackenhill `currency_format` on `$840 million` is a **true** positive.

### Local gitignored batches (`scripts/diagnostic/runs/`)

Walked `pipelineResult.qcCards` only. Unique key: fixture + statement index + rule family (pre-R6.5 ids `thousands_separator_apostrophe` and `non_usd_currency_iso_code` mapped onto the live family). A statement that already complies with the cited family, yet carries that concern:

| Rule family | Unique cards (already compliant, still flagged) | Notes |
|---|---:|---|
| `thousand_separator` | **6** | Source-style conflation. Includes the F18 sentence B176 saw. |
| `currency_format` | **44** | Already `EUR`/`GBP`/`SEK` before the amount; note still says use the ISO code. Many directions are no-ops (`Replace 'EUR 84 million' with 'EUR 84 million'`). |
| `oxford_comma` | **9** | Two-item lists, or lists that already contain `, and` while the note says the comma is missing. |
| `date_format` | **1** | House-correct full month; model proposed the abbreviated form the rule forbids. |
| `em_dash` | **1** | Flagged on a sentence that contains no em/en dash. |
| `smart_quotes` | **0** | Possible; not in these cards. |
| `number_spelling` | **0** | Possible; not counted here. |

**Three real examples** (local `result.json`; the JSON is gitignored, the identifiers and wording are on disk):

1. **F18:S4** `runs/2026-05-26-212900/18_synth_cross_source_pair/result.json`, `qcCards[4]`, rule id then `thousands_separator_apostrophe`. Statement: `The Company currently serves 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.` Note: “The statement uses an apostrophe as a thousands separator instead of a comma, which is the standard in this context.” Direction: `Replace '240'000' with '240,000'.` Source `18a_synth_cross_source_pair_initial.txt` writes `240,000`. **This is B176’s sentence.** Span: none.

2. **F13:S11** `runs/2026-06-01-122541/13_synth_internal_inconsistency_memo/result.json`, `qcCards[11]`, live id `thousand_separator`. Statement: `Third, the addressable European market of 14'000 forwarders gives meaningful headroom from the Company's current 8.6% penetration.` Note: “The statement uses a high comma as a thousands separator, which is correct. However, the evidence excerpt uses a low comma, which is inconsistent with the style guide.” Direction: `Replace "14'000" with "14,000".` Source writes `14,000`. Same inverted copy as B176. Recurs on six further 2026-08-16 runs of the same card. Span: none.

3. **F01:S1** `runs/2026-05-26-212900/01_bvp_shopify_memo/result.json`, `qcCards[1]`, id `thousands_separator_apostrophe`. Statement: `The Company has grown rapidly, with customers increasing from 5'500 a year ago to nearly 10'000 today.` Direction: `Replace '5'500' with '5,500' and '10'000' with '10,000'.` Source `01_bvp_shopify_memo.txt` writes `5,500` / `10,000`. Documented 26 May 2026 in `docs/diagnostic_findings.md` (F01.S1 / S2 / S9, F13.S3 / S12, F18.S4).

Also stored, same class, different rule: **F11:S1** `runs/2026-06-01-122541/11_synth_investor_letter_exit/result.json` — `19 January 2026` flagged; direction `Change '19 January 2026' to '19 Jan 2026'`. **F02:S6** `runs/2026-05-26-205208/02_pg_atnorth_exit/result.json` — two-item `CPP Investments and Equinix` flagged for an Oxford comma.

---

## Q4 The filter, failing open

**Verdict: of the unique already-compliant flags in Q3, 48 would be dropped by a live-id filter when a span exists, 4 survive because no span can be located, 8 survive even with a span because the filter is too narrow, and 1 has no filter at all. The span gate fails open, and that keep-on-unknown is written in code.**

`applyDeterministicStyleFilters` (`editorial-compliance-reviewer.mjs`):

- No rule id, or no filter for that id → **keep**.
- No locatable `span[0].startChar/endChar` → **keep** (`return true`).
- Else slice the cited span and run the predicate (some predicates then ignore the slice and use the full statement: `thousand_separator`, `currency_format`, `percentage_notation`).

`deriveConcernSpan` only locates quotes from `note` / `suggestedDirection`. Census already recorded: “missing span skips the drop-filter.”

Replay of the Q3 unique set against the **live** filter ids (old ids remapped for the test):

| Outcome | Count | What it is |
|---|---:|---|
| DROP | **48** | Mostly remapped `currency_format` on already-ISO statements with a span; also F02:S6 two-item Oxford; F11:S1 house-correct date |
| Survive, no span | **4** | F13:S3, F13:S12, F18:S4, F13:S11 — all thousands, all apostrophe-in-the-number |
| Survive, span present | **8** | Oxford-comma flags on lists that already contain `, and` — the filter only drops two-item lists |
| No filter | **1** | F15:S13 `em_dash` on a sentence with no dash |

F01:S1 / S2 stored a **wrong** four-character span (the quote parser closed at the inner apostrophe). A live `thousand_separator` filter that saw *any* span would still DROP, because that predicate uses the full statement. The four no-span thousands cards never reach it.

**Fail open or closed?** Open. Unknown location → keep the model’s raise. Closed would be: unknown location, or already-correct statement, → drop.

**Deliberate?** Written that way, not named as a product choice. The file comment says the filters “catch the residual error rate where the property is deterministically checkable.” Skipping the check when the span is missing is the opposite of that for a statement-scoped predicate. It is the same keep-the-raise bias **B157** describes (filters only DROP, and only when they run). It is not a RAISE-backstop gap; it is a DROP-backstop with a hole.

---

## Q5 The apostrophe trap

**Verdict: confirmed. The quote locator uses apostrophe and double-quote as delimiters, so the character `thousand_separator` requires is the character that prevents the filter from running. Smart quotes, once normalised, do the same.**

`extractQuotedSnippets`:

```js
const rx = /(["'])([^"']+)\1/g;
```

after `normalizeQuotesForExtraction` maps `“ ” ‘ ’` to `"` and `'`.

So a direction written the way the prompt’s own example is written — `Replace "240'000" with "240,000"` or `Replace '240'000' with '240,000'` — cannot extract `240'000`. Replay on the F18 sentence: `deriveConcernSpan` returns **null** for both quote styles. `"240,000"` *does* extract, then `findPhraseSpanInStatement` fails because the statement contains `240'000`. `MIN_CONCERN_SPAN_PHRASE_LENGTH` is 4, so a truncated `'5'` from `'5'500'` is discarded; a four-character leftover can attach a **wrong** span (F01:S1).

**Characters that defeat location because they are the delimiter class:**

- ASCII apostrophe `'` — the house thousands separator.
- ASCII double quote `"` — the house quotation mark (`smart_quotes`).
- Unicode `‘ ’ “ ”` — normalised into those delimiters before the regex runs. The `smart_quotes` rule is also defeated by the characters it governs, once they appear inside the quotes the locator depends on.

**Characters that do not:** em dash `—`, hyphen `-`, comma (US thousands and Oxford), `%`, ISO letters, digits, spaces. That is why F11:S1’s date span located and the date filter could drop, while F18:S4’s thousands span never existed.

**B133** is the same parser on possessives (`The team's`). Here the rule being refereed *is* the apostrophe.

---

## Q6 Where the fix belongs

**Verdict: both. Prompt first, then the filter so it cannot fail open on these mechanical rules. Neither layer alone closes the class.**

**Prompt.** Would tell the model that house style is the only formatting standard and that a source’s commas, `$`, dashes, curly quotes, numerals, or date order are not a reason to change a compliant statement. Would cut the rate of source-style conflation at the raise. Would **not** catch residual temp-0 variance (**B14**), inverted copy that never mentions the source, or a raise tagged with the wrong rule id. The May 2026 cards used `thousands_separator_apostrophe` / `non_usd_currency_iso_code`; a prompt-only fix leaves those names as a filter miss.

**Filter.** Would catch structurally checkable “already correct” raises (`thousand_separator`, `currency_format`, `date_format`, two-item `oxford_comma`, spelled `number_spelling`, `%` already present) **if** the predicate ran on the full statement without requiring a quote span. Would **not** teach the model anything, would **not** cover `em_dash` / `smart_quotes` (no referee today, **B157**), would **not** cover Oxford lists that already contain `, and` (predicate too narrow), and would **not** invent a RAISE for a miss.

**Order.** Prompt first (stop instructing the contradiction). Filter second, fail-closed on statement-scoped mechanical properties (stop the residual, including the apostrophe trap). Do not wait for a style-engine rewrite.

R6.5.5 already did the statement-scoped regex and still loses when the span gate skips the regex. The missing piece is that gate, plus the missing sentence in the prompt.

---

## Rank

**Verdict: this is the delivery track’s signature failure in editorial copy, not a separate style-engine chapter; it is as damaging to a first-time Review as competing proposals, and more so than caption polish.**

A first-time user who has just been told the house uses a high comma then sees a card that says the high comma “is correct” and offers `240,000` will not parse this as a rare model slip. They will parse it as the product not knowing its own rules. That is the same wound the delivery track has been closing on evidence cards (say the figure is confirmed, then change it). **B176** is that wound on house style. The stored F18:S4 card is the same sentence as the live run.

Relative to items already on the track:

- Worse than chrome (**B153** wording, **B177** expand-all): those annoy; this contradicts.
- Same family as **B166** (two proposals on one sentence) — F18:S3/S4 is both an inverted style write and a collision with 380→412.
- Narrower than **B157** (no RAISE backstop) but the DROP hole is why the false raise reaches the card.
- Not an evidence-verdict problem. Stage 2 was right that `240'000` matches `240,000`. The editorial layer then treated grouping as a fact.

It belongs **on this track** as a bounded prompt-plus-fail-closed-filter slice, sibling of **B176**, not a new chapter. A style-engine rewrite would bury it. Leaving it off the track means the next live F18 Review can still offer to un-correct a correct number.
