# B466. The partial reason reads as English, and nothing is said twice.

Measured on scripts/diagnostic/b464/pass-1.json with the shipped B465 code as the before. No model call. USD 0.

A source dash is written here as a hyphen.

## What was built

The compliant account and the difference clause are joined only when the card's stored reason is missing or is the unrecorded line. A card that already has a reason keeps that reason, character for character.

Where the two halves are joined, the difference is its own sentence. The leading connective is dropped, the first word is capitalised, and the sentence ends with one stop. No other word is changed. A clause that cannot be made into a sentence is not used, and that card keeps the unrecorded line.

The finding row stays. Its note is empty when the note would be the reason, or the unrecorded line. The reason is the one place that sentence is printed.

Callers of the partial reason: partialSentence, on both sides, which still asks for it when a partial sentence is being made; readerEvidenceAccount and the screen's readerEvidenceSentence, which now ask for it only when the stored reason is missing; the finding row, which no longer copies it. The quote exception in the endorsement guard is unchanged.

## Problem 1. The clause was added where nothing was missing

Cards whose reason differs from the stored B464 reason: 8. Each of them showed the unrecorded line. Cards that already had a reason and whose reason changed: 0.

04:12, 04:13, 08:10, 08:12, 14:4, 15:9, 15:30, 18:6

## Problem 2. The join is a sentence

Every reader-facing reason was checked. None has a sentence boundary followed by a lowercase connective, a comma inside a closing quotation mark, a repeated quoted phrase, a repeated negation, or more than three sentences.

Faults: 0.

Longest reason: 16:10, 436 characters.

The source states that premium women's health is a structurally attractive emerging category, growing at approximately 14% annually in Europe. It also mentions that Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand. However, the source does not specifically mention the international expansion runway in France, Italy, Spain, and selectively in the US over a five-year hold.

Reasons over 300 characters: 16. The full text is below.

## Problem 3. The finding repeats the reason

Findings whose note equals the reason: 31 before, 0 after.
Cards carrying the unrecorded line twice: 2 before, 0 after.
Cards that lose a partial finding: 0. Partial cards that still have a finding: 34 of 34.

## Reasons that changed

### 04:12

Mr. Silbermann in particular has built a reputation at Google for being unusually focused on users and product.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source says references from Silbermann's time at Google describe him as exceptionally product-focused and unusually willing to listen to user feedback. It does not specifically state that he is 'unusually focused on users and product' as a reputation at Google. The statement adds a broader evaluative claim about his reputation.

### 04:13

The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source says six full-time employees plus the two founders, which totals eight including founders. The source does not explicitly confirm the inclusion of founders in the employee count, leading to partial confirmation.

### 08:10

- End-market growth - structural exposure to medical implants and aerospace build rate increases supports 9% compound revenue growth over the hold.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source states base case revenue growth of 9% CAGR, with components including organic growth tied to end-market expansion and aerospace build-rate increases of ~40% over five years. Does not specifically attribute this growth to structural exposure to medical implants and aerospace build rate increases.

### 08:12

- Operating leverage - the balance of EBITDA growth comes from operating leverage on the broader cost base.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source attributes approximately 60 bps of margin lift to operating leverage on incremental revenue. It does not specifically state that the balance of EBITDA growth comes from operating leverage on the broader cost base. The statement is broader in scope.

### 14:4

Second, payer willingness to reimburse digital health products has improved markedly across the major European markets.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source says "payer willingness to reimburse CDS software has improved markedly" and separately notes reimbursement codes for digital health products improved across major European markets. It does not address digital health products more broadly, which the statement claims.

### 15:9

Continued own-brand penetration uplift - own-brand share has grown from 38% in 2020 to 54% in 2025, with continued runway to 70% contributing material gross margin expansion.

Old: Part of this statement is in the source. Which part was not recorded.

New: 15_synth_very_long_memo states "The Company's own-brand product penetration has grown from 38% in 2020 to 54% in 2025, supported by investment in the in-house design studio." It does not explicitly state the 'continued runway to 70%' or the 'material gross margin expansion' as claimed in the statement.

### 15:30

We have completed comprehensive diligence covering commercial, financial, legal, and ESG dimensions; the conclusions are circulated separately.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source describes commercial (Bain), financial/tax (Deloitte), legal (Latham & Watkins), and ESG (ERM) diligence streams, and notes the Bain report is circulated separately. It does not explicitly state that the conclusions are circulated separately.

### 18:6

The investment thesis is anchored on three pillars: a genuinely market-leading product (independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen.

Old: Part of this statement is in the source. Which part was not recorded.

New: 18a_synth_cross_source_pair_initial states "Three factors drive our conviction." Does not specifically mention the comparison with Yardi Nordic or the market underpenetration and founder team claims.

## Cards that keep the unrecorded line

Cards showing the unrecorded line: 10 before B465, 2 after B465, 2 now.

- 14:3. the difference still contains "supported".
- 18:9. the difference still contains "source confirms".

## Reasons over 300 characters

### 01:10. 335 characters. 2 sentences.

The source discusses Shopify's product, growth, App Store differentiation, and customer acquisition economics, but it does not characterize the company with summary judgements like "exceptional unit economics," "defensible competitive position," or "clear growth runway." These framings add evaluative labels the source does not state.

### 03:7. 341 characters. 2 sentences.

The source says Partners Group has completed ten continuation vehicle investments in the last three years, with the Gestcompost deal being the latest, which would make it the tenth. However, the source states this is Partners Group's "second [continuation vehicle investment] in Spain since 2023," not its second investment overall in Spain.

### 04:7. 361 characters. 3 sentences.

The source describes the user demographic as unusual in terms of gender skew (82% women) and age range (25-44), which could be read as two respects. However, the source frames this as "The user demographic is unusual" without enumerating "two respects" as a count. The statement's assertion of exactly two respects is not something the source explicitly states.

### 04:12. 333 characters. 3 sentences.

The source says references from Silbermann's time at Google describe him as exceptionally product-focused and unusually willing to listen to user feedback. It does not specifically state that he is 'unusually focused on users and product' as a reputation at Google. The statement adds a broader evaluative claim about his reputation.

### 08:8. 322 characters. 2 sentences.

The source describes the value creation plan as resting on three value drivers (revenue growth, EBITDA margin expansion, and multiple expansion, which is explicitly not assumed), not four pillars. The four-item structure in the source refers to the investment thesis reasons and the key risks, not the value creation plan.

### 08:10. 307 characters. 2 sentences.

The source states base case revenue growth of 9% CAGR, with components including organic growth tied to end-market expansion and aerospace build-rate increases of ~40% over five years. Does not specifically attribute this growth to structural exposure to medical implants and aerospace build rate increases.

### 08:16. 339 characters. 2 sentences.

The source states that HPC represents an attractive opportunity to acquire a category leader in a structurally growing market with a clear operational improvement plan and proven through-cycle resilience. However, the source does not mention a defensible competitive position or a credible M&A roadmap, which are included in the statement.

### 09:4. 328 characters. 2 sentences.

The source lists Köhler's early priorities as restructuring procurement, initiating the Winterthur footprint review, and establishing a monthly operating cadence with the Halden Group team. The statement replaces the operating cadence item with "commercial priorities," which is a different priority than what the source states.

### 09:8. 355 characters. 2 sentences.

The source says base case returns of 2.4x MOIC and 19% IRR remain confident, and describes semiconductor weakness with flat revenue guidance for 12 months. The statement's characterization of "the segment" as a "moderating factor through 2026" is not stated in the source, which does not frame semiconductors as a moderating factor on returns across 2026.

### 11:6. 311 characters. 2 sentences.

The source says gross margin improved from 28.4% to 34.1% and notes the modularity programme is "contributing visibly" to gross margin, but it does not attribute the full margin move to the modular redesign alone. Operational improvements such as manufacturing footprint consolidation are also cited as drivers.

### 14:2. 327 characters. 2 sentences.

The source states that the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances, which partially supports the statement that the regulatory pathway has matured. However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.

### 14:8. 322 characters. 2 sentences.

The source says the European CDS market is structurally distinct from the US in several ways, and separately says there is opportunity for a thoughtful financial sponsor because the category has been under-served by private equity. It does not link the structural distinctions from the US to favouring a financial sponsor.

### 15:9. 303 characters. 2 sentences.

15_synth_very_long_memo states "The Company's own-brand product penetration has grown from 38% in 2020 to 54% in 2025, supported by investment in the in-house design studio." It does not explicitly state the 'continued runway to 70%' or the 'material gross margin expansion' as claimed in the statement.

### 15:32. 331 characters. 2 sentences.

The source expresses that the management team is strong and the value creation plan is well-defined, and recommends approval, but it does not use language of "high conviction" nor make any forward-looking promise about providing "further updates as the hold progresses." The statement adds a commitment the source does not contain.

### 16:10. 436 characters. 3 sentences.

The source states that premium women's health is a structurally attractive emerging category, growing at approximately 14% annually in Europe. It also mentions that Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand. However, the source does not specifically mention the international expansion runway in France, Italy, Spain, and selectively in the US over a five-year hold.

### 19:13. 330 characters. 2 sentences.

The source says both companies are progressing toward exit-readiness and that two realisations are anticipated in 2026, but does not specify Q1 and Q3 timing for formal process launches. For Brightway, the source mentions preliminary conversations about a potential exit in late 2026 or early 2027 with no formal process launched.

## Invariants

Verdict, state, label, and tier: 261 of 261 unchanged.
Labelled faults: 13 of 13. Group A: 11 of 11.
Evidence leave-alone 48 of 74, combined quiet 30 of 74, on the old definition.
Evidence leave-alone 48 of 74, combined quiet 30 of 74, on the new definition.
Screen reason equals backend reason: 261 of 261.
Export sentence equals card sentence: every raised card.
Wording notes shown: 0.
Quoted phrases in a new reason that are not in the account, the explanation, or the passage: 0.

## Tests

tests/b466-reason-reads.test.mjs. src/modules/drafting/__tests__/b466-reason-reads.test.js, which names lib/qc/partial-reason.mjs and lib/qc/reader-reason.mjs.

Four assertions were wrong and were changed. tests/b465-partial-reason.test.mjs required the difference to keep its leading "but", which is the join this spec removes. The words after "but" are the same. tests/b453-partial-finding.test.mjs and tests/b461-shown-reason.test.mjs required the finding note to be the partial sentence. That sentence is the reason, so the note repeated it. The finding row stays and the note is empty. src/modules/drafting/__tests__/b461-screen.test.js and b425-screen.test.js required the same repetition, including the unrecorded line in both places. The reason keeps the line. The finding does not.

