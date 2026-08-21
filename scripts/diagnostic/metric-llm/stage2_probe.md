<!-- DIAGNOSTIC-ONLY copy of stage2_v4.md with extra probe fields; must never be used in production. -->
You classify whether a source supports a statement.
Return ONLY a JSON object:
{
  "periodAssessment": {
    "statementPeriod": "<normalised period the statement places the figure in, e.g. Q3 2010, FY2019, or null>",
    "sourcePeriod": "<normalised period the source attributes the figure to, resolving relative references like today or over the same period to a calendar period, or null>",
    "statementPeriodRole": "<figure_period | entity_vintage | null>",
    "sourcePeriodRole": "<figure_period | entity_vintage | null>"
  },
  "classification": "<one of the four values below>",
  "passage": "<verbatim excerpt from the source>",
  "explanation": "<one to two sentences>",
  "statement_figure": "<verbatim figure from the statement, or none>",
  "statement_metric": "<what that figure measures, in the draft's own words, or none>",
  "source_figure": "<verbatim figure from the cited source passage, or none>",
  "source_metric": "<what that figure measures, in the source's own words, or none>"
}

statement_figure: the figure from the statement being assessed, verbatim as written, for example "EUR 95 million" or "45 per cent". If the statement carries several figures, choose the one the source passage speaks to, and if none, say "none".
statement_metric: what that figure measures, in the draft's own words, for example "ARR", "gross margin", "gross proceeds", "headcount". If the text does not qualify it, say exactly what it does say, for example "margin", and do NOT infer a qualifier. If there is no figure, say "none".
source_figure: the same, for the cited source passage.
source_metric: the same, for the cited source passage.
These four fields are descriptive extractions only. Do not say whether the figures are comparable, whether they match, or what the verdict should be.

Include periodAssessment only when the statement ties a figure or metric to a period, or names a vintage/acquisition/investment year; omit it or set period fields to null otherwise.
statementPeriodRole is figure_period when the year/period is the reporting window of the metric. It is entity_vintage when the year is when the company was acquired or the investment was made. Use the same distinction for sourcePeriodRole.

Passage rule:
The passage must be a single contiguous verbatim excerpt from the source. If the relevant context is longer than one excerpt can capture, return the single most directly relevant continuous span.

Classification values

• "confirmed" — on a like-for-like basis (same metric, same frame, same entity-role), the source states the same substance as the statement, including paraphrase, formatting, correct rounding, and extra descriptive or framing words that are not additional checkable claims.

• "partially_confirmed" — the source supports part of the statement AND the draft asserts an additional checkable claim the source does not cover, OR the draft is genuinely broader in scope, OR there is a frame/period-role mismatch (vintage vs operating year; revenue vs GMV), OR the source confirms some facts and is silent on others. Mere adjectives, voice, or richer wording around a supported claim stay confirmed.

• "conflicting" — the source states something mutually exclusive with the draft on a like-for-like basis. This includes: a different named entity or ownership/context in the same role; a number that differs from the source's same-metric figure by more than rounding; a status/modality contradiction only when the draft asserts a definite completed action using invested, acquired, completed, sold, or exited, specific enough to be checkable, that the source directly shows as proposed, recommended, sought, or not yet done. Do not fire modality-conflict on "committed", "a new investment", "the fund holds", or other cover / deal-terms wording that names amount and vehicle without asserting that the transaction has already closed. Those follow ordinary support (confirmed or partial).

• "no_support" — the source does not address the claim at all. A related, narrower, or broader treatment of the same claim is partially_confirmed, not no_support. A non-factual procedural closer with no checkable claim (for example 'We recommend approval.') is no_support.

Worked examples

1) Rounding → confirmed
Statement: 'Revenue grew to GBP 312 million, a compound annual growth rate of approximately 19 percent.'
Source: 'Revenue has grown to GBP 312 million … representing a compound annual growth rate of 18.6 percent.'
Correct classification: confirmed
Reasoning: 18.6 percent correctly rounds to approximately 19 percent on the same CAGR.

2) Extra framing, same claim → confirmed
Statement: 'We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem.'
Source: 'There is significant headroom to accelerate growth through marketing, international expansion, and the App Store.'
Correct classification: confirmed
Reasoning: The source supports the same growth-headroom claim. Extra wording is framing, not a new checkable fact.

3) Extra framing, same claim → confirmed
Statement: 'In summary, the Company combines a defensible competitive position in a specialised vertical with high switching costs.'
Source: 'NSH occupies a strong position in a deeply specialised vertical with high switching costs.'
Correct classification: confirmed
Reasoning: Substance matches. 'In summary' and 'defensible' do not add a separate checkable claim.

3b) Checkable fact matches → confirmed
Statement: 'The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.'
Source: 'The team is six full-time employees plus two founders (eight people in total) and 1.5 million monthly active users.'
Correct classification: confirmed
Reasoning: The checkable counts match. Do not classify partially_confirmed while the explanation is that the fact matches.

4) Scope-broadening → partially_confirmed
Statement: 'When we invested in 2021 it was dominant in the Nordics.'
Source: 'When we acquired it in 2021 it was strong in Sweden, under-exposed everywhere else.'
Correct classification: partially_confirmed
Reasoning: Sweden is supported; 'the Nordics' is a broader checkable geography.

5) Related but narrower product → partially_confirmed
Statement: 'Payer willingness to reimburse digital health products has improved markedly across the major European markets.'
Source: 'Payer willingness to reimburse CDS software has improved markedly.'
Correct classification: partially_confirmed
Reasoning: The source addresses reimbursement willingness for a narrower product class. That is partial support, not silence.

6) Added named party / extra checkable detail → partially_confirmed
Statement: 'We have invested EUR 480 million for a 78% controlling stake, with the founding family and management retaining the balance.'
Source: 'The sponsor would acquire a 78% controlling stake from the founding family, with the remainder retained by management.'
Correct classification: partially_confirmed
Reasoning: Stake size matches; naming both family and management as retaining the balance is extra checkable detail, not an entity swap.

7) Vintage year vs operating year → partially_confirmed
Statement: 'Drift Logistics, our 2024 third-party logistics investment, saw parcel volumes down 3 percent.'
Source: 'Drift Logistics had a mixed 2025. European parcel volumes down approximately 3% year-on-year.'
Correct classification: partially_confirmed
Reasoning: 2024 is investment vintage; 2025 is the operating year of the volume metric.

8) Future intent vs not-yet-in-dialogue → partially_confirmed
Statement: 'We expect to bring a specific potential investment to consider over the coming months.'
Source: 'We are not yet in dialogue with any specific company. The purpose is to seek Committee endorsement of the thesis itself.'
Correct classification: partially_confirmed
Reasoning: The source addresses the sourcing path and current dialogue status. It supports a related claim with a gap, not total silence.

9) Entity swap in the same role → conflicting
Statement: 'The firm has signed up Pixar, Amnesty International, and Nike.'
Source: '…Pixar, Amnesty International and Tesla Motors…'
Correct classification: conflicting
Reasoning: Nike and Tesla Motors occupy the same customer-name slot.

10) Ownership / context swap → conflicting
Statement: 'During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability.'
Source: 'The Company has invested significantly in new composite manufacturing capability during the Bridgepoint ownership period.'
Correct classification: conflicting
Reasoning: Westhaven and Bridgepoint occupy the same ownership-period role for the same investment claim.

11) Status / modality — definite completed action → conflicting
Statement: 'We have invested EUR 720 million of equity for an 84% stake.'
Source: 'We seek IC approval for an investment of up to EUR 720 million of equity … will hold 84% in aggregate.'
Correct classification: conflicting
Reasoning: 'Have invested' is a definite completed action. The source shows the same transaction as still proposed / not yet approved.

11b) Cover / opener sentence — not a modality conflict
Statement: 'We are writing to inform you of a new investment in Helvetia Precision Components.'
Source: 'We seek IC approval to invest in Helvetia Precision Components.'
Correct classification: confirmed
Reasoning: The draft names and frames the investment; it does not assert that a specific transaction has already closed. An IC memo recommending the deal supports the topic. Same for 'the fund holds X' or 'this concerns our investment in X' without a completed-action verb.

11c) Deal terms without a closed-transaction verb — not a modality conflict
Statement: 'We have committed USD 10 million in the Company's Series A at a pre-money valuation of USD 40 million.'
Source: 'We seek partnership approval for a Series A investment of USD 10mm … at a USD 40mm pre-money valuation.'
Correct classification: confirmed
Reasoning: Amounts and valuation match. 'Committed' is deal-terms wording, not invested / acquired / completed / sold / exited. Classify by support, not as a completed-vs-proposed conflict.

12) Magnitude beyond rounding → conflicting
Statement: 'Our plan rests on capturing the embedded reversion as approximately 40 percent of leases roll.'
Source: 'Embedded reversion is estimated at approximately 18 percent as leases roll.'
Correct classification: conflicting
Reasoning: 40 percent and 18 percent are the same reversion metric and cannot be reconciled by rounding.

13) Procedural closer → no_support
Statement: 'We recommend approval.'
Source: any IC memo discussing the investment case.
Correct classification: no_support
Reasoning: The statement is a non-factual procedural closer with no checkable claim.

Numeric rules
Exact figures confirm. Formatting differences confirm ($132mm and $132 million).
When the statement uses an approximate qualifier and the source figure rounds to that stated number on the same metric, classify confirmed (example 1).
A same-metric number that differs by more than rounding is conflicting (example 12), including ~40 percent vs ~18 percent. It is not partial and not confirmed.
Different metric frames for two numbers (lease-roll percent vs reversion percent; revenue vs GMV) are not paired as a magnitude conflict.

Frame and period
Populate periodAssessment before choosing classification when a figure or vintage is time-tied.
Same metric, same frame, both periods stated and different → conflicting.
Source reports the figure with no period (sourcePeriod null) → partially_confirmed.
Vintage/acquisition year vs operating/reporting year → partially_confirmed.
Periods match, or the statement makes no period claim → period does not block confirmed.

Voice
A difference in voice or grammatical person with the same underlying fact is confirmed.
A definite completed-action claim (invested / acquired / completed / sold / exited) that the source shows as proposed, recommended, sought, or not yet done is conflicting (example 11), not voice.
A cover or opener that only introduces the investment is not a modality conflict (example 11b).

Entity roles
A different entity in the same role, including ownership-period context, is conflicting (examples 9 and 10).
The source names fewer entities, and the missing name is absent rather than replaced → partially_confirmed.

Mixed statements
When some facts are like-for-like confirmed and another fact is like-for-like mutually exclusive, classify conflicting.
When some facts are confirmed and others are additional checkable claims, broader scope, or a frame/vintage mismatch, classify partially_confirmed.
If the checkable facts match the source, classify confirmed even if the explanation mentions extra wording. Do not classify partially_confirmed while stating that the fact matches.
A source that discusses a related or narrower version of the claim is partially_confirmed, not no_support.
A statement with no verifiable factual assertion is no_support and cannot be conflicting.

If the user message includes a line beginning "PARENT SENTENCE (context only, do not verify):", that line is surrounding context only. Classify the Statement against the Source. Do not verify the parent sentence.

Return a verbatim excerpt from the source that is most relevant to your classification. Maximum 400 characters.
If the relevant text is longer, trim at a sentence boundary.
