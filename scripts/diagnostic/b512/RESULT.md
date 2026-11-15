# B512. Review reads source roles

Estimate before the calls: USD 17.717929.
Ceiling USD 25. Cache off. The authoring organisation for this run was Halden Group.
Total spend: USD 10.002231. Calls 872. Unpriced calls 0. Cached input tokens 1583872.

The first attempt of ADD_ON_DIRECT_INVESTMENT finished its model calls and then failed because maskVerbatimQuotes was not imported. Those calls were not metered. The import was restored and the ten fixtures were run again. The figures above are that second run.

## Replay

Fixture files resolved: 16. Missing: 0.
Not in the source before: 12. Statement verdict after: 11. Shown after: 12.
Cards whose verdict changed: 36. Labelled true problems that stop being raised: 0. Gate: pass.

## Counts

By state: {"conflicts":9,"beyond":6,"note_withheld":5,"partial":3,"not_in_source":1}
By setBy branch: {"completionEffect":1,"statementVerdict":9,"uncheckedLook":2,"evidenceDisplay":8,"floorState":3,"refusedReading":1}
By source role: {"facts":20,"context":4}

Suggested roles agreed with the fixture: 12 of 16.

## Now unused

- compose.mjs no longer calls buildPgWritingScaffold. pg-writing-prompts.mjs still exports it, and the generate and rewrite cleanup still splits on ---METHODOLOGY---. A draft with no delimiter is all commentary.
- completeBody and publicBody on NEW_DIRECT_INVESTMENT and NEW_PRIMARY_COMMITMENT are still imported by pg-writing-prompts.mjs. The composed prompt does not use them.
- getPgCommentaryWordLimit still feeds the health house-word display (150 complete, 80 public for the two old scaffold types). The generate instrument now uses the output type's upper bound.
- DO_NOT_INVENT_FIRM_LINE and the house-identity bullet stay in pg-binding.mjs. The composed prompt no longer includes them.

## NEW_DIRECT_INVESTMENT investor letter, before

Describe the asset, the transaction, the rationale and the outcome. Do not state fund cash-flow amounts (committed, called, distributed or invested), the size of the firm's own investment, or fund-level performance figures unless the special instructions ask for them. Where size or change matters, give it as a percentage or in words the source supports, such as a double-digit increase. Words of size must match the source: do not call a small change significant or a large change modest.

When the source states the investment team's overall view and it names what makes the investment attractive (the market, the entry point, the structure, the edge), convey that substance as the firm's view, attributed, in your own words, keeping its specifics. Do not quote it and do not strengthen it. Never write a generic summing-up sentence such as one saying these factors make the investment compelling or attractive: if a sentence would still be true after removing every specific word, leave it out. If the source gives no substantive overall view, do not create one; end on the last substantive point.

Output type: Investor letter

Tone/voice:
- Opens with 'Dear Investors,' salutation.
- Direct, narrative, professional tone suitable for limited partners.
- Third-person for portfolio company references (the firm, the company).
- First-person plural for the GP's voice (we believe, we expect, we view).
- Forward-looking language is appropriate where hedged (we expect, we believe, in our view).
- Avoid hype; stay factual and investment-grade.

Structure:
- Clear narrative arc: context, investment decision, thesis, supporting evidence, outlook.
- Include key metrics, figures, and specific evidence from sources where they materially strengthen the narrative. Prioritise quality over quantity. Include only detail that directly supports the investment thesis or outlook. Do not list all available data points.
- Longer and more discursive than reporting commentary; paragraphs may develop a single point in depth.
- Evidence-bounded: do not invent facts.

Writing guidelines:
- Do not make up any content.
- Place more emphasis on the Source Documents than on public sources.
- Write in US English.
- Use normal dashes (not em/en-dashes) and normal quotes (not smart quotes).
- Adhere to these writing guidelines at all times.

Base formulation (or similar):
"In 14 March 2025, Halden Group invested in Helvetia Precision Components AG, a..."

Special instructions for this run (apply if present): (none)
Source material: (none provided; rely only on Title/Notes if present; do not invent facts)

Binding constraints (highest precedence: apply after all other guidance):
- The transaction date is 14 March 2025. Use exactly this date in the opening line. Dates appearing in the source documents describe historical events and MUST NOT be used as the transaction date.
- The investor is Halden Group. Write 'Halden Group' in the opening line and in every later reference. Never substitute 'the firm', 'the investor', 'the company', or any paraphrase for Halden Group.
- The investment is Helvetia Precision Components AG. Name it exactly as given in the opening line and throughout. Do NOT substitute a different company or fund name found in the source documents, even if the source describes a different entity.
- Spell the month in full in prose: write 'March 2026', not 'Mar 2026'. The input may be given as MMM YYYY; render it as 'Month YYYY' in the text.
- Currency: write amounts as 'USD 20 million' (ISO code + space), never with a '$' symbol, per house style.
- Structure: exactly TWO paragraphs. Paragraph 1 describes the asset; paragraph 2 covers investment merits and why Halden Group was attracted. Do not merge into one paragraph.

Objective: Draft a commentary addressing the transaction, focusing on the largest
component of the transaction if relevant.
Length and shape: Two paragraphs. The first describes the asset; the
second covers the investment merits and why Halden Group was attracted to it.
Must include:
- Classification into lead, joint, or co-investment status, if known.
- A description of the asset and its business and operational highlights.
- A headline valuation metric (e.g. enterprise valuation) if relevant, but avoid
  detailed financial metrics.
- Investment merits, grouped into themes such as track record, entry valuation, and
  operating team.
- Why Halden Group was attracted to the investment, in a more narrative tone.
- Why Halden Group was invited or selected for the opportunity, if relevant
  (especially in co-investment scenarios).

Output format (required):
1. Write the transaction commentary first. The word limit stated above applies to the COMMENTARY ONLY; do not count the Methodology Note toward it.
2. After the commentary, on its own line, output exactly: ---METHODOLOGY---
3. Then write the Methodology Note: 1 concise paragraph (~80-120 words),
professional, factual, neutral, framed for audit transparency (not process narration).
Briefly explain the overall approach and how source materials were used; summarise how
the text was constructed (synthesis of sources / provided draft as base / creation from
scratch); highlight key enhancements (financial or operational substance; clarity,
structure, and narrative flow; alignment with the writing guidelines); confirm
adherence to any specific instructions or constraints; introduce no information not
supported by the provided sources.

Cover, in this order:
- investment merits and thesis
- thematic fit within the firm's wider strategy
- history with the asset, if the source gives it
- the overall investment view
- what the company does, where, and its scale
- the transaction (stake, seller, co-investors, status stated exactly as the source states it)
- value creation plan
- Do not state the equity amount or the valuation multiple.

## NEW_DIRECT_INVESTMENT investor letter, after

Describe the asset, the transaction, the rationale and the outcome. Do not state fund cash-flow amounts (committed, called, distributed or invested), the size of the firm's own investment, or fund-level performance figures unless the special instructions ask for them. Where size or change matters, give it as a percentage or in words the source supports, such as a double-digit increase. Words of size must match the source: do not call a small change significant or a large change modest.

When the source states the investment team's overall view and it names what makes the investment attractive (the market, the entry point, the structure, the edge), convey that substance as the firm's view, attributed, in your own words, keeping its specifics. Do not quote it and do not strengthen it. Never write a generic summing-up sentence such as one saying these factors make the investment compelling or attractive: if a sentence would still be true after removing every specific word, leave it out. If the source gives no substantive overall view, do not create one; end on the last substantive point.

State the deal's status as the facts source states it at its own date. A recommendation or a request for approval is not an agreement, and an agreement is not a completion. Do not describe a step as done unless a facts source says it is done. Do not write about how this text was prepared or which sources it used.

TONE & AUDIENCE
- Write in a neutral, professional, institution-grade tone.
- Assume a financially literate audience (investment professionals, client relationship teams, sophisticated investors).
- Avoid marketing hype and exaggeration. Prefer measured, evidence-based language.
- Use third-person voice by default (e.g., "the firm", "the company").

STRUCTURE & FLOW
- Lead with the most important fact or outcome ("what happened") before supporting detail.
- Use short paragraphs. Aim for 2-4 sentences per paragraph.
- Within paragraphs, move from high-level context to more specific detail.
- Use clear topic sentences and avoid long, meandering sentences.
- Where appropriate, use short, readable lists (bullets) rather than dense blocks of text.

LANGUAGE & STYLE
- Use clear, concise sentences. Prefer plain language over jargon where possible.
- When specialised terminology is required, use it precisely and consistently.
- Avoid colloquial expressions, slang, or overly casual phrasing.
- Avoid superlatives and subjective claims ("world-class", "best-in-class") unless directly supported by evidence and clearly attributed.
- Do not invent facts or rationales that are not supported by the source material.

NUMBERS & UNITS
- Use numerals for all numbers above eleven.
- Use numerals for any quantity that represents a measurable unit, regardless of size:
  - Examples: 5 customers, 9 employees, 3 funds, 20 investments, 2 years, 6 months.
- Use numerals for all ranges (e.g., 10-15, 3-5 years).
- Use the apostrophe (’) as the thousands separator:
  - 12’500
  - 5’500’000
- Do not use commas as thousands separators.
- When the text spells out a number that clearly represents a measurable unit
  (e.g., "five customers", "twenty employees"),
  prefer a numeral instead:
  - "five customers" → "5 customers"
  - "twenty employees" → "20 employees"
- Percentages should use numerals and the % symbol (e.g., 5%, 12.5%).

CURRENCIES
- When the source uses bare currency symbols ($, €, £) without codes, rewrite them into the proper currency code plus amount where the currency is clear:
  - $10 million → USD 10 million
  - €250’000 → EUR 250’000
  - £5’500 → GBP 5’500
- Do not guess the currency if it is ambiguous. In that case, preserve the symbol and amount without adding a code.
- Write large amounts using a readable combination of numerals and words:
  - EUR 1.2 billion, USD 350 million, GBP 25’000.

LANGUAGE STANDARD
- Write in US English throughout.
- Follow Merriam-Webster as the authority for spelling,
  hyphenation, and word choice where not otherwise specified
  by these rules.
- Examples: 'analyze' not 'analyse', 'color' not 'colour',
  'program' not 'programme', 'center' not 'centre'.

PUNCTUATION & TYPOGRAPHY
- Avoid em dashes (-). Use normal hyphens (-), commas, parentheses, or semicolons instead.
- Do not use smart quotes (“ ” ‘ ’). Use straight quotes only:
  - " " for double quotes
  - ' ' for single quotes / apostrophes
- Use standard sentence punctuation (., !, ?). Avoid multiple exclamation marks.
- Use a single space after punctuation, not double spaces.

NAMES, TITLES & ENTITIES
- Use the full official name of companies, funds, and strategies on first mention.
- Thereafter, you may use a shortened name or abbreviation if it is unambiguous.
- Capitalise formal strategy names and product names consistently.
- Job titles are capitalised when used with a name (e.g., "Managing Director Jane Smith") and lower-case when used generically ("the managing director").

TEMPORAL REFERENCES
- Prefer specific time references over vague ones where possible:
  - "in 2023" instead of "recently"
  - "over the last three years" instead of "in recent years", if the period is clear.
- When referencing periods, keep formats consistent:
  - "three-year period", "five-year track record", "12-month performance".

RISK & UNCERTAINTY
- Avoid overconfident or absolute statements about future performance.
- When discussing outlook or expectations, use measured language:
  - "is expected to", "aims to", "seeks to", "believes that", "intends to".
- Do not disclose non-public performance metrics or highly sensitive information unless explicitly permitted by the brief.

GENERAL CONSISTENCY
- Apply these rules consistently across the entire text, even if the source material is inconsistent.
- If the source is ambiguous or conflicting, prefer the simplest, most neutral phrasing.
- When in doubt, prioritise clarity, factual accuracy, and alignment with professional institutional standards.

Output type: Investor letter

Tone/voice:
- Opens with 'Dear Investors,' salutation.
- Direct, narrative, professional tone suitable for limited partners.
- Third-person for portfolio company references (the firm, the company).
- First-person plural for the GP's voice (we believe, we expect, we view).
- Forward-looking language is appropriate where hedged (we expect, we believe, in our view).
- Avoid hype; stay factual and investment-grade.

Structure:
- Clear narrative arc: context, investment decision, thesis, supporting evidence, outlook.
- Include key metrics, figures, and specific evidence from sources where they materially strengthen the narrative. Prioritise quality over quantity. Include only detail that directly supports the investment thesis or outlook. Do not list all available data points.
- Longer and more discursive than reporting commentary; paragraphs may develop a single point in depth.
- Evidence-bounded: do not invent facts.
- Length: 250 to 450 words.

Write the new direct investment. Cover the points below, in this order, and only where the sources support them.

Cover, in this order:
- investment merits and thesis
- thematic fit within the firm's wider strategy
- history with the asset, if the source gives it
- the overall investment view
- what the company does, where, and its scale
- the transaction (stake, seller, co-investors, status stated exactly as the source states it)
- value creation plan
- Do not state the equity amount or the valuation multiple.

## ADD_ON_DIRECT_INVESTMENT

Words: 450 against 250 to 450.

Suggested roles:
- 26_addon_morava_memo.txt: suggested facts, fixture facts, agrees.
  Reason: This run has one source, so the role is facts.

Draft:

Dear valued investors,

Helvetia Precision Components AG has signed an agreement to acquire 100% of Morava Precision s.r.o., a precision machining business based in Brno, Czech Republic. Completion is expected in the first quarter of 2027, subject to clearance by the Czech competition authority. Helvetia is the acquirer; the transaction is funded entirely within Helvetia's existing capital structure, with no additional equity from the Halden Group funds.

The acquisition is a core element of Helvetia's buy-and-build strategy. When Halden Group acquired Helvetia in 2025, the investment thesis included 2 to 3 machining add-ons focused on capacity that could not be added cost-effectively in Switzerland. Morava is the first of these add-ons and reinforces Helvetia's existing aerospace position rather than extending into a new end market.

Morava machines titanium structural fittings and small rotating parts for civil aircraft programs. It operates a single site in Brno with around 310 employees and holds AS9100 certification and the customer approvals required to ship flight hardware directly. For the 12 months to June 2026, Morava generated revenue of EUR 64 million and EBITDA of EUR 9 million, a 14% margin. Three European aerostructures manufacturers account for about 80% of sales, with the longest relationship dating back to 2011.

The strategic rationale is to add low-cost, aerospace-qualified titanium capacity where the platform needs it. Helvetia's aerospace order book has outgrown its Swiss titanium capacity and currently relies on overtime at its Winterthur and Olten sites and on three external machining suppliers, including Morava. Morava's large-format titanium milling cells match the capability gap in Switzerland, and labor and energy costs in Brno are materially lower. Management plans to load these cells with Helvetia overflow work within 18 months of completion while retaining Morava's existing customer base. Value creation is expected to come from shifting work from high-cost Swiss overtime and third-party suppliers to owned, lower-cost capacity, rather than from multiple arbitrage.

Helvetia has a multi-year history with Morava, having purchased titanium fittings from the company for two civil aircraft programs since 2019. Helvetia completed a full vendor audit in 2024, and Halden Group's operating team supported confirmatory diligence and site visits in 2026, which confirmed cell layout, certifications, and customer approvals and identified no quality or customer issues. Helvetia already operates a smaller parts plant in Brno, enabling shared supervision, quality management, and procurement from day one.

In the firm's view, Morava offers a known, operationally adjacent way to relieve current capacity constraints in Helvetia's aerospace business, with integration risk mitigated by the existing supplier relationship and local footprint. The transaction remains subject to regulatory clearance, and any delay beyond the first quarter of 2027 would defer the capacity benefit but would not affect agreed terms.

Leave-out figures that appear in the draft:

None.

Sentences that state deal status:

- Draft says done (acquired). Facts source: done (acquired).
  When Halden Group acquired Helvetia in 2025, the investment thesis included 2 to 3 machining add-ons focused on capacity that could not be added cost-effectively in Switzerland.

Raised cards:

None.

## DIRECT_INVESTMENT_EXIT

Words: 452 against 300 to 500.

Suggested roles:
- 02_pg_atnorth_exit.txt: suggested context, fixture facts, does not agree.
  Reason: The document is intended for a general audience, detailing a significant investment transaction and its implications.
- 11_synth_investor_letter_exit.pdf: suggested facts, fixture facts, agrees.
  Reason: The document is an investor letter addressed to limited partners, indicating restricted distribution.

Draft:

FOR IMMEDIATE RELEASE

Partners Group Agrees To Sell atNorth To CPP Investments And Equinix

BAAR-ZUG, SWITZERLAND; 27 February 2026 - Partners Group, a leading global private markets firm, acting on behalf of its clients, has agreed to sell its portfolio company atNorth, a pan-Nordic data center platform, to Canada Pension Plan Investment Board (CPP Investments) and Equinix. The transaction values atNorth at an enterprise value of USD 4 billion. Completion of the transaction is subject to customary closing conditions and regulatory approvals.

Ismail Afara, Member of Management, Infrastructure Europe, Partners Group, says: "We have implemented a truly entrepreneurial value creation plan with atNorth, capitalizing on a period of unprecedented growth in the European data center industry. We thank atNorth's management team for their remarkable partnership on this journey. The Company's vision is more critical than ever: to offer more compute for a better world. We congratulate CPP Investments and Equinix as they partner with the Company and management team. We are excited to reinvest alongside them for the next chapter of growth."

Partners Group closed its acquisition of atNorth in 2022. Under the firm's ownership, atNorth was transformed into a next-generation, pan-Nordic data center platform with 8 operational data centers and several additional sites under development across Denmark, Finland, Iceland, Norway, and Sweden. The company expanded its secured power bank to 1 GW with further capacity planned, and built a diversified international customer base of more than 100 clients.

Working alongside atNorth's management team, Partners Group supported the company in accessing debt capital markets and significantly strengthening its talent base, adding over 200 employees to the platform. These initiatives contributed to strong operational and financial growth, with contracted EBITDA increasing 14-fold over the last four years.

For Partners Group's clients, the sale of atNorth is expected to generate compounded annual returns of more than 30% and a 2.5x multiple on invested capital. The holding period from initial acquisition in 2022 to the agreed sale in 2026 is approximately 4 years.

In connection with the transaction, Partners Group has committed to reinvest and acquire up to 10% of atNorth, reflecting the firm's continued conviction in the company's growth prospects. As artificial intelligence accelerates demand for location-agnostic workloads, atNorth's secured power bank and extensive demand pipeline provide a platform for further expansion.

Partners Group views atNorth as aligned with its thematic focus on data centers and digital infrastructure. The firm has invested around USD 5 billion in data centers globally and manages a portfolio that includes EdgeCore in the US, GreenSquareDC in Australia, and Digital Halo in Asia. While the sale of atNorth represents a successful control exit within this portfolio, Partners Group remains focused on data center assets worldwide.

[BOILERPLATE: About Partners Group]

Leave-out figures that appear in the draft:

None.

Sentences that state deal status:

- Draft says done (completion). Facts source: done (invested).
  Completion of the transaction is subject to customary closing conditions and regulatory approvals.
- Draft says done (closed). Facts source: done (invested).
  We are excited to reinvest alongside them for the next chapter of growth."

Partners Group closed its acquisition of atNorth in 2022.
- Draft says committed (committed). Facts source: done (invested).
  In connection with the transaction, Partners Group has committed to reinvest and acquire up to 10% of atNorth, reflecting the firm's continued conviction in the company's growth prospects.
- Draft says done (invested). Facts source: done (invested).
  The firm has invested around USD 5 billion in data centers globally and manages a portfolio that includes EdgeCore in the US, GreenSquareDC in Australia, and Digital Halo in Asia.

Raised cards:

1. Conflicts with the source (conflicts). setBy: completionEffect. Quote source: 02_pg_atnorth_exit.txt (facts). Note: none.

Completion of the transaction is subject to customary closing conditions and regulatory approvals.

The transaction is subject to customary closing conditions and regulatory approvals.

2. Goes beyond the source (beyond). setBy: statementVerdict. Quote source: 02_pg_atnorth_exit.txt (facts). Note: beyond.

The company expanded its secured power bank to 1 GW with further capacity planned, and built a diversified international customer base of more than 100 clients.

The release says atNorth intends to expand further with 1 GW of secured power, framing the 1 GW as the secured power for planned expansion, not as the current size of its power bank. The statement asserts the company has already expanded its secured power bank to 1 GW.

atNorth intends to expand further with 1 GW of secured power and a considerable amount of additional future capacity planned. The Company offers high-density compute infrastructure to a diversified international base of over 100 customers, differentiating itself through a competitive total cost of ownership for its clients and fast ready-for-service timelines.

3. Needs a look (note_withheld). setBy: uncheckedLook. Quote source: 02_pg_atnorth_exit.txt (facts). Note: none.

The holding period from initial acquisition in 2022 to the agreed sale in 2026 is approximately 4 years.

Partners Group to sell atNorth for an EV of USD 4 billion

Baar-Zug, Switzerland; 27 February 2026

- CPP Investments and Equinix have jointly agreed to acquire atNorth
- atNorth has eight operational data centers alongside several sites under development across Denmark, Finland, Iceland, Norway, and Sweden
- Partners Group transformed atNorth during its ownership, increasing contracted EBITDA 14-fold since 2022

Partners Group, one of the largest firms in the global private markets industry, acting on behalf of its clients, has agreed to sell atNorth (or "the Company"), a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board ("CPP Investments") and Equinix, the world's digital infrastructure company.

4. Goes beyond the source (partial). setBy: evidenceDisplay. Quote source: 02_pg_atnorth_exit.txt (facts). Note: wording.

Partners Group views atNorth as aligned with its thematic focus on data centers and digital infrastructure.

The source quotes Esther Peiner saying Partners Group remains "thematically focused on data center assets across the globe," which restates the statement's point about thematic alignment with data centers and digital infrastructure.

Partners Group has been at the forefront of capitalizing on accelerating thematic trends in the data center sector. To-date, Partners Group has invested around USD 5 billion in data centers and manages a portfolio of assets that includes EdgeCore, one of the leading hyperscale data center platforms in the US; GreenSquareDC, a data center provider in Australia; and Digital Halo, a Singapore-headquartered pan-Asian data center operator.


## DIRECT_INVESTMENT_REVALUATION

Words: 201 against 120 to 200.

Suggested roles:
- 27_helvetia_q3_2026_valuation.txt: suggested facts, fixture facts, agrees.
  Reason: This run has one source, so the role is facts.

Draft:

The firm increased the fair value of portfolio company Helvetia Precision Components AG by 14% versus 30 June 2026, using the unchanged EBITDA multiple methodology. The uplift was driven by higher earnings, a re-rating of listed peers, and currency. LTM EBITDA growth contributed roughly one third of the increase, peer multiple expansion from 11.2x to 11.9x added a further 6.1%, and Swiss franc strength against the euro contributed 3.3%. Net debt was broadly unchanged.

Operationally, medical end markets, which represent 54% of revenue, remained solid, supported by ongoing ramp-up of a key orthopaedic program. Aerospace, at 29% of revenue, was stable as planned build-rate increases flowed through. Semiconductor, at 17% of revenue, softened as 2 equipment customers deferred tool orders into 2027. Group EBITDA margin improved by 0.6 percentage points, helped by mix and procurement savings.

The firm is working with management to execute the value creation plan focused on footprint consolidation, procurement, and automation. Planning for Winterthur consolidation is under way, procurement is ahead of schedule, and initial automation cells in Brno were commissioned in August. The firm expects semiconductor weakness to persist into the first half of 2027 and sees valuation as sensitive to peer multiples and CHF/EUR moves.

Leave-out figures that appear in the draft:

None.

Sentences that state deal status:

None.

Raised cards:

1. Goes beyond the source (partial). setBy: evidenceDisplay. Quote source: 27_helvetia_q3_2026_valuation.txt (facts). Note: none.

The uplift was driven by higher earnings, a re-rating of listed peers, and currency.

The uplift this quarter is driven predominantly by market factors, with peer multiples and currency together accounting for around two thirds of the increase, while underlying trading in medical and aerospace remains in line with the investment case.

2. Needs a look (note_withheld). setBy: uncheckedLook. Quote source: 27_helvetia_q3_2026_valuation.txt (facts). Note: none.

LTM EBITDA growth contributed roughly one third of the increase, peer multiple expansion from 11.2x to 11.9x added a further 6.1%, and Swiss franc strength against the euro contributed 3.3%.

VALUATION BRIDGE (30 JUNE 2026 TO 30 SEPTEMBER 2026)

Driver                                   Change in fair value
LTM EBITDA growth                        +4.6%
Peer multiple movement                   +6.1%
Net debt                                 +0.0%
Foreign exchange (CHF strength)          +3.3%
Total                                    +14.0%

LTM EBITDA rose 3.8% over the quarter, contributing approximately one third of the uplift. The applied multiple increased from 11.2x to 11.9x, reflecting a re-rating of the listed peer group following strong results across the medical technology supply chain.


## FUND_CAPITAL_CALL

Words: 179 against 120 to 200.

Suggested roles:
- 30_kestrel_call_notice.txt: suggested facts, fixture facts, agrees.
  Reason: The document is addressed to a specific investor and outlines financial obligations under restricted terms.
- 31_kestrel_fjordline_press_release.txt: suggested context, fixture context, agrees.
  Reason: The document is intended for a general audience, providing information about the acquisition and its implications.
- 34_kestrel_q3_2026_report.txt: suggested facts, fixture context, does not agree.
  Reason: The document is a confidential report specifically addressed to limited partners, containing sensitive financial information.

Draft:

Kestrel Partners Fund IV has issued a capital call to fund two portfolio investments: a new platform investment in Fjordline Software AS and a follow-on investment in Aurelia Health.

The largest portion of the call supports the acquisition of a majority stake in Fjordline Software AS, an Oslo-based provider of cloud-based load, yard, and delivery-slot planning software for freight and logistics operators in the Nordic region and northern Germany. Fjordline serves more than 300 logistics companies and processes over 40 million planned loads each year. The firm views Fjordline as aligned with its focus on mission-critical, recurring-revenue software that is deeply embedded in customers' operations, with scope to support international expansion and product development.

The call also funds a follow-on investment in Aurelia Health, the Fund's clinical staff rostering software portfolio company. The capital will finance Aurelia's acquisition of Medivakt ApS, a Copenhagen-based provider of clinical staff rostering software to Danish hospitals and care providers. This add-on is intended to give Aurelia a foothold in the Danish hospital market and to extend its position in healthcare workforce management software.

Leave-out figures that appear in the draft:

None.

Sentences that state deal status:

None.

Raised cards:

1. Goes beyond the source (beyond). setBy: statementVerdict. Quote source: 30_kestrel_call_notice.txt (facts). Note: beyond.

Kestrel Partners Fund IV has issued a capital call to fund two portfolio investments: a new platform investment in Fjordline Software AS and a follow-on investment in Aurelia Health.

The capital call notice lists three uses of proceeds: the Fjordline acquisition, the Aurelia follow-on, and the Q4 2026 management fee. The statement says the call funds two portfolio investments, which omits the management fee but the figure "two" refers only to investments, so this is accurate; however, framing the call as funding only two items understates the stated uses.

USE OF PROCEEDS                                    Fund total (EUR)    Your share (EUR)
Acquisition of Fjordline Software AS                    61,200,000           2,448,000
Follow-on investment in Aurelia Health                  26,800,000           1,072,000


## FUND_DISTRIBUTION

Words: 167 against 120 to 200.

Suggested roles:
- 32_kestrel_distribution_notice.txt: suggested facts, fixture facts, agrees.
  Reason: The document is a formal notice addressed to a specific investor regarding fund distributions, indicating restricted distribution terms.
- 33_kestrel_harbourline_press_release.txt: suggested context, fixture context, agrees.
  Reason: The document is intended for a general audience, detailing a significant business transaction and its implications.
- 34_kestrel_q3_2026_report.txt: suggested facts, fixture context, does not agree.
  Reason: The document is a confidential report specifically addressed to limited partners, containing sensitive financial information.

Draft:

Kestrel Partners Fund IV has made a distribution to limited partners funded by the partial realization of Harbourline Foods Limited.

On 30 September 2026 the fund completed the sale of a 60% shareholding in Harbourline Foods to Northshore Consumer Partners. The fund retained a 40% stake. This transaction, which was reflected in the fund's Q3 2026 reporting and paid on 20 October 2026, generated a gross multiple of 2.8x on the cost of the shares sold.

Harbourline is a UK and Irish chilled prepared foods producer supplying major grocery retailers. It operates from sites in Yorkshire and County Cork and produces chilled ready meals, pies, and side dishes. Kestrel Partners invested in 2020 when Harbourline was a family-owned regional supplier. Under the fund's ownership, Harbourline secured national listings with 5 of the 6 largest UK grocers and the 3 largest Irish retailers, more than doubled revenue, doubled capacity at its Cork site, and invested in automated production lines that lifted on-time, in-full delivery rates to over 98%.

Leave-out figures that appear in the draft:

None.

Sentences that state deal status:

- Draft says done (completion). Facts source: done (completion).
  On 30 September 2026 the fund completed the sale of a 60% shareholding in Harbourline Foods to Northshore Consumer Partners.

Raised cards:

1. Needs a look (note_withheld). setBy: evidenceDisplay, 34_kestrel_q3_2026_report.txt, context. Quote source: 34_kestrel_q3_2026_report.txt (context). Note: none.

Under the fund's ownership, Harbourline secured national listings with 5 of the 6 largest UK grocers and the 3 largest Irish retailers, more than doubled revenue, doubled capacity at its Cork site, and invested in automated production lines that lifted on-time, in-full delivery rates to over 98%.

On 30 September we completed the sale of a 60% stake in Harbourline to Northshore Consumer Partners, following the agreement announced on 17 June.


## FUND_REVALUATION

Words: 191 against 120 to 200.

Suggested roles:
- 34_kestrel_q3_2026_report.txt: suggested facts, fixture facts, agrees.
  Reason: The document is a confidential report specifically addressed to limited partners, outlining fund performance and portfolio developments.
- 35_kestrel_q2_2026_report.txt: suggested facts, fixture context, does not agree.
  Reason: The document is addressed specifically to limited partners and contains confidential information.

Draft:

Kestrel Partners Fund IV's net asset value declined 2.1% before cash flows in Q3 2026. The reported NAV reduction versus Q2 also reflects the accrual, at 30 September, of the Harbourline Foods sale proceeds that were distributed in October.

The main driver of the quarterly NAV decline was Brightwater Labs. The portfolio company lost its largest customer, a national testing network that represented around 35% of revenue, after the customer was acquired by a group with its own laboratories. The loss was not service-related, and other contracts renewed as planned. Management is cutting costs to align with the lower revenue base and is in advanced discussions with two mid-sized networks, although no new contracts have been signed. The firm reduced Brightwater's valuation by 41% to reflect the lower earnings base and the expected time to rebuild.

Aurelia Health was the largest positive contributor. Strong expansion with existing hospital group customers drove 9% quarterly ARR growth, and the agreed acquisition of Danish provider Medivakt ApS supported an 18% valuation uplift. The partial realization of Harbourline Foods completed at the agreed transaction value, while Corvane Data, Plinth Systems and Tallowmere were broadly unchanged.

Leave-out figures that appear in the draft:

None.

Sentences that state deal status:

- Draft says done (acquired). Facts source: done (completion).
  The portfolio company lost its largest customer, a national testing network that represented around 35% of revenue, after the customer was acquired by a group with its own laboratories.

Raised cards:

1. Conflicts with the source (conflicts). setBy: evidenceDisplay. Quote source: 35_kestrel_q2_2026_report.txt (context). Note: wording.

The loss was not service-related, and other contracts renewed as planned.

The Q3 2026 report says the loss of Brightwater's largest customer was not related to service quality and that other contracts renewed as planned. The statement restates this in shorter words.

The contract with its largest customer, a national testing network, comes up for renewal in the third quarter, and management is in discussions on terms.

2. Needs a look (note_withheld). setBy: floorState, 35_kestrel_q2_2026_report.txt, context. Quote source: 35_kestrel_q2_2026_report.txt (context). Note: beyond.

Aurelia Health was the largest positive contributor.

The Q3 2026 report says Aurelia's 18% uplift offset part of the Brightwater write-down, but it does not identify Aurelia as the largest positive contributor to the quarter.

We have revalued Harbourline to the agreed transaction value, an increase of 22% in the quarter, and it was the main contributor to the Fund's NAV growth.

3. Conflicts with the source (conflicts). setBy: evidenceDisplay. Quote source: 34_kestrel_q3_2026_report.txt (facts). Note: none.

Strong expansion with existing hospital group customers drove 9% quarterly ARR growth, and the agreed acquisition of Danish provider Medivakt ApS supported an 18% valuation uplift.

Aurelia, our clinical staff rostering software business, had a strong quarter. Two existing hospital group customers extended the platform to additional sites, and annual recurring revenue grew 9% in the quarter.

4. Conflicts with the source (conflicts). setBy: evidenceDisplay. Quote source: 35_kestrel_q2_2026_report.txt (context). Note: none.

The partial realization of Harbourline Foods completed at the agreed transaction value, while Corvane Data, Plinth Systems and Tallowmere were broadly unchanged.

On 17 June we agreed the sale of a 60% stake to Northshore Consumer Partners, valuing Harbourline at an enterprise value of GBP 420 million; completion is expected in the third quarter, subject to regulatory approvals.


## NEW_DIRECT_INVESTMENT

Words: 438 against 250 to 450.

Suggested roles:
- 08_synth_industrial_buyout_memo.txt: suggested facts, fixture facts, agrees.
  Reason: This run has one source, so the role is facts.

Draft:

Dear valued investors,

The firm is proceeding with the acquisition of a controlling stake in Helvetia Precision Components AG (HPC), a Zurich-headquartered manufacturer of high-precision machined components for medical devices, aerospace, and semiconductor equipment. The investment thesis rests on HPC's strong competitive position in regulated niches, exposure to structurally growing end markets, a defined margin expansion plan, and a clear M&A consolidation opportunity.

HPC fits squarely within the firm's European industrials strategy, which targets engineered components businesses with high switching costs, mission-critical applications, and opportunities for operational improvement and buy-and-build. The company's role as a qualified supplier to leading OEMs in orthopedics, civil aviation, defense, and semiconductor capital equipment aligns with this focus on resilient, technology-enabled industrial platforms.

HPC was founded in 1962 and has evolved into a scaled, international platform. It operates 4 manufacturing facilities: Winterthur and Olten in Switzerland, Indianapolis in the United States, and Brno in the Czech Republic. The company employs 1'420 people, with approximately 240 based outside Switzerland. Revenue grew from EUR 312 million in 2020 to EUR 587 million in 2024, a 17.1% compound annual growth rate, while EBITDA increased from EUR 48 million to EUR 103 million and margins improved from 15.4% to 17.5%. Free cash flow conversion averaged 71% over this period.

The firm views HPC as one of a small number of globally qualified suppliers in its core medical implants vertical, with high customer switching costs and long-standing relationships. The top 10 customers have been with the company for an average of 14 years, and revenue retention from these accounts has been 102% over the past five years. End markets are expected to grow, supported by aging demographics in orthopedics, aircraft build-rate increases in aerospace, and structurally growing EUV-related demand in semiconductors.

Halden Group will acquire a 78% controlling stake in HPC from the founding Schiller family, which will retain a 15% economic interest, with management holding the remaining 7%. The seller is advised by Lincoln International. The transaction is expected to sign by late March, with closing targeted for mid-June, subject to merger control clearances in the EU, United States, and Switzerland.

The value creation plan focuses on three main levers. First, operational improvement, including consolidating the Swiss footprint, procurement savings, and automation investments in Brno, is expected to lift EBITDA margins from 17.5% to 21.0% over five years. Second, organic growth is underwritten at 9% revenue CAGR, combining end-market growth and share gains in medical implants. Third, a disciplined M&A program aims to execute 2-3 add-on acquisitions in a fragmented European precision machining market, where identified targets are expected to be accretive on both growth and margin.

Leave-out figures that appear in the draft:

None.

Sentences that state deal status:

None.

Raised cards:

1. Conflicts with the source (conflicts). setBy: floorState, 08_synth_industrial_buyout_memo.txt, facts. Quote source: 08_synth_industrial_buyout_memo.txt (facts). Note: beyond.

The firm is proceeding with the acquisition of a controlling stake in Helvetia Precision Components AG (HPC), a Zurich-headquartered manufacturer of high-precision machined components for medical devices, aerospace, and semiconductor equipment.

The memo is an investment committee recommendation seeking approval to invest in HPC, with signing expected 28 March and closing targeted for mid-June subject to merger clearances. The statement says the firm is "proceeding with" the acquisition, which goes beyond a recommendation still awaiting IC approval.

We seek approval for Halden Group to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG ("HPC" or "the Company"), a Zurich-headquartered manufacturer of high-precision machined components for the medical devices, aerospace, and semiconductor end markets.

2. Goes beyond the source (beyond). setBy: statementVerdict. Quote source: 08_synth_industrial_buyout_memo.txt (facts). Note: beyond.

HPC fits squarely within the firm's European industrials strategy, which targets engineered components businesses with high switching costs, mission-critical applications, and opportunities for operational improvement and buy-and-build.

The memo describes HPC and the reasons for the investment, but it does not describe the firm's European industrials strategy or state that the strategy targets engineered components businesses with high switching costs, mission-critical applications, and buy-and-build opportunities. The characterisation of the firm's strategy is not in the source.

HPC represents an attractive opportunity to acquire a category leader in a structurally growing market with a clear operational improvement plan and proven through-cycle resilience.

3. Not in the source (not_in_source). setBy: statementVerdict. Quote source: 08_synth_industrial_buyout_memo.txt (facts). Note: none.

It operates 4 manufacturing facilities: Winterthur and Olten in Switzerland, Indianapolis in the United States, and Brno in the Czech Republic.

The Company operates four manufacturing facilities: a headquarters site in Winterthur (Switzerland), a larger production facility in Olten (Switzerland), a US operation in Indianapolis acquired in 2018, and a smaller Czech facility in Brno established in 2021 to serve European aerospace customers at lower cost.

4. Conflicts with the source (conflicts). setBy: statementVerdict. Quote source: 08_synth_industrial_buyout_memo.txt (facts). Note: conflicts.

The value creation plan focuses on three main levers.

The memo lists four margin levers (footprint consolidation ~120 bps, procurement ~80 bps, automation in Brno ~60 bps, and operating leverage ~60 bps), not three.

Third, there is a clear margin expansion path. HPC's current EBITDA margin of 17.5% trails best-in-class peers (Burckhardt Compression at 19.8%, VAT Group at 31.2% - though VAT operates in a different segment) and our diligence has identified a coherent set of operational levers we believe can deliver 300 to 400 basis points of margin uplift over five years. The principal levers are: footprint consolidation in Switzerland (closing the Winterthur facility and absorbing volumes into Olten), procurement consolidation across the now-fragmented supplier base inherited from the Indianapolis acquisition, and a programme of automation investment in the Brno facility.

5. Goes beyond the source (beyond). setBy: statementVerdict. Quote source: 08_synth_industrial_buyout_memo.txt (facts). Note: beyond.

First, operational improvement, including consolidating the Swiss footprint, procurement savings, and automation investments in Brno, is expected to lift EBITDA margins from 17.5% to 21.0% over five years.

The memo attributes the margin lift from 17.5% to 21.0% to four levers: footprint consolidation (~120 bps), procurement (~80 bps), automation in Brno (~60 bps), and operating leverage on incremental revenue (~60 bps). The statement omits operating leverage on incremental revenue as a driver.

EBITDA margin expansion from 17.5% to 21.0% over the hold period, delivering EBITDA of approximately EUR 190 million by 2029. The margin lift is sourced from the footprint consolidation programme (approximately 120 bps), procurement initiatives (approximately 80 bps), automation investment in Brno (approximately 60 bps), and operating leverage on incremental revenue (approximately 60 bps).

6. Conflicts with the source (conflicts). setBy: statementVerdict. Quote source: 08_synth_industrial_buyout_memo.txt (facts). Note: conflicts.

Second, organic growth is underwritten at 9% revenue CAGR, combining end-market growth and share gains in medical implants.

The memo states 9% revenue CAGR is total growth, composed of 5% organic plus 2% share gain plus 2% M&A. The statement labels the full 9% as organic growth, which conflicts with the memo's breakdown.

Revenue growth of 9% CAGR, taking 2024 revenue of EUR 587 million to approximately EUR 905 million by 2029. This growth is composed of: 5% organic growth in line with end-market expansion, 2% from share gain in medical implants, and 2% from contemplated M&A.


## NEW_PRIMARY_COMMITMENT

Words: 56 against 250 to 450.

Suggested roles:
- 29_aldermoor_fund_vi_ic.txt: suggested facts, fixture facts, agrees.
  Reason: This run has one source, so the role is facts.

Draft:

Dear valued investors,

The firm has approved a new primary commitment to Aldermoor Capital Fund VI, a European mid-market buyout fund targeting EUR 1. 1 billion with a hard cap of EUR 1. 3 billion. Fund VI is expected to hold a first close in January 2027, and the firm intends to participate in that close.

Leave-out figures that appear in the draft:

None.

Sentences that state deal status:

None.

Raised cards:

1. Conflicts with the source (conflicts). setBy: floorState, 29_aldermoor_fund_vi_ic.txt, facts. Quote source: 29_aldermoor_fund_vi_ic.txt (facts). Note: conflicts.

The firm has approved a new primary commitment to Aldermoor Capital Fund VI, a European mid-market buyout fund targeting EUR 1. 1 billion with a hard cap of EUR 1. 3 billion.

The IC paper is a recommendation to the Committee to approve a EUR 65 million commitment to Fund VI; it does not record that the firm has approved the commitment. The fund size target and hard cap match the source.

The team recommends that the Committee approve a commitment of EUR 65 million to Aldermoor Capital Fund VI ("Fund VI"), a European mid-market buyout fund with a target size of EUR 1.1 billion and a hard cap of EUR 1.3 billion.


## NEW_SECONDARY_INVESTMENT

Words: 397 against 250 to 450.

Suggested roles:
- 28_secondary_lp_portfolio_ic.txt: suggested facts, fixture facts, agrees.
  Reason: This run has one source, so the role is facts.

Draft:

Dear valued investors,

The firm has agreed to acquire a portfolio of five limited partnership interests from Vestmark Pension Scheme at a price of 88% of the net asset value reported as of 30 June 2026. The portfolio comprises mid-market buyout funds managed by four general partners and provides exposure to 47 portfolio companies across Europe and North America. Closing is targeted for November 2026, subject to general partner consents.

The investment thesis rests on a combination of pricing, visibility on near-term liquidity, and balanced maturity. The 12% discount to reference NAV was negotiated bilaterally after a limited process and follows a bottom-up review of the 25 largest portfolio companies, representing 81% of NAV. In the firm's view, reported valuations are supported by earnings performance and by multiples that are in line with listed and transaction comparables.

Four of the five funds - Northlane Buyout III (2016), Cinderwell Partners II (2017), Hartham Equity IV (2018), and Northlane Buyout IV (2019) - are in harvesting mode, with companies largely through their value-creation plans. Based on general partner exit projections and the firm's assessment, a significant share of NAV is expected to be realized over the next three years. The inclusion of Pellam Mid-Market I (2021), which is 55% called and still investing, adds exposure to newer assets and a source of continued value creation as the older funds are realized.

This transaction fits the secondaries program's focus on acquiring LP interests in mid-market buyout funds managed by general partners the firm knows well, in negotiated, seller-led portfolio sales. The portfolio is diversified across five vintages, four managers, and sectors including business services (34% of NAV), industrial technology (28%), healthcare (24%), and consumer (14%), with no single company accounting for more than 6% of NAV.

The firm has been an investor in Northlane Buyout III, Northlane Buyout IV, and Cinderwell Partners II since their first closings and has followed their portfolios through quarterly reporting. It completed full due diligence on Hartham Equity IV in 2022 in connection with a separate secondary opportunity that did not proceed on price grounds. Pellam Mid-Market I represents a new manager relationship; diligence included a review of recent fund reports, underlying company valuations, and a call with the general partner. Overall, the firm views this as an opportunity to acquire a seasoned, diversified portfolio at a discount, with visible liquidity and ongoing growth exposure.

Leave-out figures that appear in the draft:

None.

Sentences that state deal status:

None.

Raised cards:

1. Conflicts with the source (conflicts). setBy: evidenceDisplay, 28_secondary_lp_portfolio_ic.txt, facts. Quote source: 28_secondary_lp_portfolio_ic.txt (facts). Note: wording.

The firm has agreed to acquire a portfolio of five limited partnership interests from Vestmark Pension Scheme at a price of 88% of the net asset value reported as of 30 June 2026.

The IC paper recommends approval of the acquisition of five LP interests from Vestmark at 88% of NAV as reported at 30 June 2026. The statement says the firm has agreed to acquire on these terms, which restates the recommended transaction in other words.

The team recommends that the Committee approve the acquisition of limited partnership interests in five buyout funds from Vestmark Pension Scheme ("Vestmark"), at a price of 88% of net asset value as reported by the general partners at 30 June 2026. Closing is targeted for November 2026, subject to general partner consents.

2. Goes beyond the source (beyond). setBy: statementVerdict. Quote source: 28_secondary_lp_portfolio_ic.txt (facts). Note: beyond.

The investment thesis rests on a combination of pricing, visibility on near-term liquidity, and balanced maturity.

The IC paper lists four investment merits: attractive entry price, near-term liquidity, balanced maturity, and diversification. The statement omits diversification and presents the thesis as resting on only three pillars.

Near-term liquidity. The 2016 to 2019 funds hold companies that are largely through their value creation plans. General partner exit projections and our own assessment point to a significant share of NAV being realised over the next three years.

Balanced maturity.

3. Needs a look (note_withheld). setBy: refusedReading. Quote source: 28_secondary_lp_portfolio_ic.txt (facts). Note: (none).

In the firm's view, reported valuations are supported by earnings performance and by multiples that are in line with listed and transaction comparables.

Based on our bottom-up review of the 25 largest companies, representing 81% of NAV, we consider the reported values to be well supported, with valuation multiples in line with listed and transaction comparables.


## SPECIAL_TOPIC

Words: 170 against 120 to 200.

Suggested roles:
- 09_synth_portfolio_update_letter.txt: suggested facts, fixture facts, agrees.
  Reason: This run has one source, so the role is facts.

Draft:

The portfolio company's semiconductor segment is entering a softer phase after a strong period of capital equipment investment. Over the June-November 2025 review period, semiconductor revenue declined 6%, driven by weaker orders from two key capital equipment customers.

Management and the firm had identified semiconductor cyclicality as a key underwriting risk. Early signs of a slowdown are now visible, with both customers pushing orders by one to two quarters. The firm does not currently anticipate a deep downturn, as demand for extreme ultraviolet (EUV) lithography tools is viewed as structurally supported, but it expects a period of subdued growth.

The firm has adjusted its outlook accordingly. It is guiding to flat semiconductor revenue over the next 12 months and has reduced the full-year 2026 semiconductor revenue assumption to EUR 105 million, compared with EUR 122 million in the original underwriting. This reset is already reflected in the updated full-year forecast and budget planning, while the broader group performance remains supported by stronger trends in medical implants and stable aerospace demand.

Leave-out figures that appear in the draft:

None.

Sentences that state deal status:

None.

Raised cards:

1. Goes beyond the source (beyond). setBy: statementVerdict. Quote source: 09_synth_portfolio_update_letter.txt (facts). Note: beyond.

The portfolio company's semiconductor segment is entering a softer phase after a strong period of capital equipment investment.

The letter says two semiconductor customers have pushed orders by one to two quarters and guides to flat semiconductor revenue for 12 months, but it does not describe the preceding period as a strong phase of capital equipment investment. That characterisation of the prior period is not in the source.

Two material risks have emerged that we are actively managing: a slowdown in semiconductor capital equipment orders, and an unexpected quality issue at one medical device customer.

2. Goes beyond the source (partial). setBy: evidenceDisplay. Quote source: 09_synth_portfolio_update_letter.txt (facts). Note: wording.

The firm has adjusted its outlook accordingly.

The letter states that full-year forecasts have been adjusted in response to the semiconductor slowdown, with the 2026 budget revised from EUR 122 million to EUR 105 million. The statement restates this as having adjusted the outlook accordingly.

we are guiding to flat semiconductor revenue for the next 12 months and have adjusted our full-year forecast accordingly.
