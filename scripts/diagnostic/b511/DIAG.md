# B511. Why the B510 drafts show conflicts and not-in-source

Read only. No model call. The B510 runner stored each raised card as statement, shown, and reason. It did not store the reading note, documentValues, disputedIndices, displayVerdict, readingFacts, or statementVerdict.setBy.

## A. False conflicts

Cards shown "Conflicts with the source": 24.
On every one of them the stored reading note is absent, documentValues is absent, disputedIndices is absent, and the evidence displayVerdict is absent. The branch that set the label is not on the row. What follows is the statement, the stored reason, whether that reason describes a restatement, and the rule the reason text is consistent with.

### ADD_ON_DIRECT_INVESTMENT raised 4

Statement: Morava deepens Helvetia’s aerospace footprint without extending into a new end market and without requiring additional equity from Halden Group.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 26_addon_morava_memo states "Halden Group is not investing new equity."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: reason names a difference.

Quoted file: 26_addon_morava_memo. Fixture role of that file: facts.

Branch: not stored. The text does not match the revision sentence, the transaction sentence, or a restatement, and it does not quote a context file.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_CAPITAL_CALL raised 2

Statement: Fjordline is an Oslo-based software company whose products help freight operators plan loads, yards, and delivery slots.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 30_kestrel_call_notice states "The first is the acquisition of Fjordline Software, a Norwegian company that sells software used by freight operators to plan loads, yards, and delivery slots."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: evidence quote states the claim.

Quoted file: 30_kestrel_call_notice. Fixture role of that file: facts.

Branch: not stored. evidenceFromDisplay sets conflicts when displayVerdict is conflict, conflicts, or conflicting. displayVerdict is not on the B510 row. The quoted file is a facts source or no file is named.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_CAPITAL_CALL raised 3

Statement: Fund IV's investment in Fjordline aligns with the fund's focus on European software and services companies that sit inside physical supply chains and are used every day by their customers.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: The call notice says Fund IV's strategy is buying software businesses that sit inside a physical supply chain and are already used daily by their customers, and the press release says Fund IV invests in software and services companies in Europe. The statement combines these descriptions.
34_kestrel_q3_2026_report states "In October, just after the quarter-end for signing and within the events this report covers for partners, Fund IV acquired Fjordline Software."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 34_kestrel_q3_2026_report. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_DISTRIBUTION raised 1

Statement: The distribution from Kestrel Partners Fund IV to Halden Group arises from the sale of a 60% stake in portfolio company Harbourline Foods.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 33_kestrel_harbourline_press_release states "Kestrel Partners announced today that Kestrel Partners Fund IV has agreed to sell a 60 percent stake in Harbourline Foods to Northshore Consumer Partners."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 33_kestrel_harbourline_press_release. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_DISTRIBUTION raised 2

Statement: The proceeds relate solely to this transaction and do not include cash from any other exit.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: The distribution notice states the proceeds came from the Harbourline sale and from no other exit. The statement restates this in different words.
34_kestrel_q3_2026_report states "Cash at the fund rose with the Harbourline proceeds and then fell with the distribution and with the funding of Fjordline."

The reason text describes a restatement: yes. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: reason describes a restatement or a match.

Quoted file: 34_kestrel_q3_2026_report. Fixture role of that file: context.

Branch: not stored. statementVerdict sets conflicts only when an accepted note bucket is conflicts. documentsDisagree refuses a wording or none note and does not rewrite the bucket.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_DISTRIBUTION raised 3

Statement: The triggering event was completion of the Harbourline Foods stake sale on 30 September 2026, following the signing of the sale agreement on 17 June 2026.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 33_kestrel_harbourline_press_release states "The agreement was signed on 17 June 2026."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 33_kestrel_harbourline_press_release. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_DISTRIBUTION raised 4

Statement: It is not a multiple on the entire company and is not a net figure to limited partners.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: The distribution notice says the 2.8 times gross multiple is on the stake sold, not on the whole company, and is not a net figure after the fund's charges. The statement restates this in other words.
34_kestrel_q3_2026_report states "Both figures are net to limited partners."

The reason text describes a restatement: yes. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: reason describes a restatement or a match.

Quoted file: 34_kestrel_q3_2026_report. Fixture role of that file: context.

Branch: not stored. statementVerdict sets conflicts only when an accepted note bucket is conflicts. documentsDisagree refuses a wording or none note and does not rewrite the bucket.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_DISTRIBUTION raised 5

Statement: The distribution to Halden Group totals EUR 22.4 million, scheduled for payment on 20 October 2026.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 32_kestrel_distribution_notice states "The distribution to Halden is EUR 22.4 million, to be paid on 20 October 2026."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: evidence quote states the claim.

Quoted file: 32_kestrel_distribution_notice. Fixture role of that file: facts.

Branch: not stored. evidenceFromDisplay sets conflicts when displayVerdict is conflict, conflicts, or conflicting. displayVerdict is not on the B510 row. The quoted file is a facts source or no file is named.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_DISTRIBUTION raised 6

Statement: The company produces prepared meals, pies, and side dishes from plants in Yorkshire and County Cork.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 34_kestrel_q3_2026_report states "Harbourline produces chilled foods for retailers in the United Kingdom and Ireland."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 34_kestrel_q3_2026_report. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_DISTRIBUTION raised 7

Statement: The partial realization of Harbourline Foods contributed to Fund IV’s third-quarter activity, alongside other portfolio movements.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 32_kestrel_distribution_notice states "The proceeds came from the Harbourline sale and from no other exit."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: reason names a difference.

Quoted file: 32_kestrel_distribution_notice. Fixture role of that file: facts.

Branch: not stored. The text does not match the revision sentence, the transaction sentence, or a restatement, and it does not quote a context file.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_REVALUATION raised 1

Statement: The reduction was driven mainly by a write-down of Brightwater Labs, partly offset by a valuation gain at Aurelia Health.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 35_kestrel_q2_2026_report states "Brightwater Labs, which sells analytical software and laboratory services to testing networks, traded in line with the first quarter."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 35_kestrel_q2_2026_report. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_REVALUATION raised 2

Statement: The completion of the partial sale of Harbourline Foods and the acquisition of Fjordline Software did not change this overall direction, as Fjordline had not been held for a full quarter and Harbourline’s impact was already reflected in prior valuations.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: The Q3 report says Fjordline had not been marked for a full quarter and is not a contributor to the 2 percent decline. It does not say Harbourline's impact was already reflected in prior valuations; it says the Harbourline sale partly offset the Brightwater write-down this quarter and was the source of the October distribution.

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: reason names a difference.

Quoted file: none named. Fixture role of that file: not applicable.

Branch: not stored. The text does not match the revision sentence, the transaction sentence, or a restatement, and it does not quote a context file.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_REVALUATION raised 3

Statement: The principal driver of the NAV movement was the revaluation of Brightwater Labs.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 35_kestrel_q2_2026_report states "BRIGHTWATER LABS Brightwater Labs, which sells analytical software and laboratory services to testing networks, traded in line with the first quarter."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 35_kestrel_q2_2026_report. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_REVALUATION raised 4

Statement: During the quarter, Brightwater’s largest customer, a national testing network that accounted for a little over one-third of the company’s revenue, terminated its contract and brought the work back in-house following a change of ownership at the customer.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 35_kestrel_q2_2026_report states "Brightwater Labs, which sells analytical software and laboratory services to testing networks, traded in line with the first quarter."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 35_kestrel_q2_2026_report. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_REVALUATION raised 5

Statement: The firm marked down the Brightwater holding to reflect the loss of this revenue and the time expected to replace it.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 35_kestrel_q2_2026_report states "Brightwater Labs, which sells analytical software and laboratory services to testing networks, traded in line with the first quarter."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 35_kestrel_q2_2026_report. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_REVALUATION raised 6

Statement: Aurelia Health was the main positive contributor and offset part of the Brightwater impact.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: The Q3 report says gains at Aurelia Health offset part of the Brightwater write-down but were not large enough to reverse it, and names Aurelia as the offsetting gain against Brightwater. Calling Aurelia the main positive contributor restates that it was the gain offsetting Brightwater.
35_kestrel_q2_2026_report states "Aurelia Health's rostering software continued to be rolled out at the hospital groups already on the platform."

The reason text describes a restatement: yes. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: reason describes a restatement or a match.

Quoted file: 35_kestrel_q2_2026_report. Fixture role of that file: context.

Branch: not stored. statementVerdict sets conflicts only when an accepted note bucket is conflicts. documentsDisagree refuses a wording or none note and does not rewrite the bucket.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_REVALUATION raised 7

Statement: These developments supported an increase in Aurelia’s valuation, which partially, but not fully, counterbalanced the Brightwater write-down.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 35_kestrel_q2_2026_report states "The valuation was held essentially flat."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 35_kestrel_q2_2026_report. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_REVALUATION raised 8

Statement: Fjordline is included in the capital accounts for the period but did not contribute to the 2% NAV decline because it had not been held for a full quarter.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 35_kestrel_q2_2026_report states "Fjordline Software is not in this portfolio. The fund had not acquired it by 30 June."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 35_kestrel_q2_2026_report. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### FUND_REVALUATION raised 9

Statement: The fund also completed the sale of a 60% stake in Harbourline Foods on 30 September 2026, retaining a 40% minority position alongside Northshore Consumer Partners; the retained stake is now carried as a minority holding, and the sold stake underpinned the distribution made to limited partners in October.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 35_kestrel_q2_2026_report states "On 17 June 2026 the fund announced an agreement to sell a 60 percent stake to Northshore Consumer Partners, keeping 40 percent."
The sentence is lengthy and contains multiple clauses, which can make it difficult to read. Consider breaking it into shorter sentences for clarity.

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: quoted source is context.

Quoted file: 35_kestrel_q2_2026_report. Fixture role of that file: context.

Branch: no review step reads source role. The stored reason quotes this context file. The conflicts branch on the card (note bucket, displayVerdict, floorState, revisionRaises, transactionDemand, or completionEffect) was not saved.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### NEW_DIRECT_INVESTMENT raised 1

Statement: On 14 March 2025, Halden Group agreed a lead control investment in Helvetia Precision Components AG, a Zurich-headquartered manufacturer of high-precision machined components for medical devices, aerospace and semiconductor equipment.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: The memo dated 14 March 2025 seeks Investment Committee approval for the acquisition and says exclusivity runs through 31 March with signing expected by 28 March; it does not say the investment was agreed on 14 March. The statement describes the deal as already agreed on that date.
The phrase 'a Zurich-headquartered manufacturer of high-precision machined components for medical devices, aerospace and semiconductor equipment' adds descriptive detail but does not advance the investment thesis or argument at this point in the letter.

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: reason names a difference.

Quoted file: none named. Fixture role of that file: not applicable.

Branch: not stored. The text does not match the revision sentence, the transaction sentence, or a restatement, and it does not quote a context file.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### NEW_PRIMARY_COMMITMENT raised 2

Statement: This letter was drafted using the Aldermoor Capital Fund VI investment committee paper as the sole source.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 29_aldermoor_fund_vi_ic states "This paper is strictly confidential and is intended only for the Halden Group Investment Committee."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: reason names a difference.

Quoted file: 29_aldermoor_fund_vi_ic. Fixture role of that file: facts.

Branch: not stored. The text does not match the revision sentence, the transaction sentence, or a restatement, and it does not quote a context file.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### NEW_SECONDARY_INVESTMENT raised 1

Statement: The firm has agreed to acquire a portfolio of five limited-partner interests from Vestmark Pension Scheme, subject to general-partner consents.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: 28_secondary_lp_portfolio_ic states "We recommend that the Committee approve the purchase from Vestmark Pension Scheme of limited-partner interests in five buyout funds, managed by four firms."

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: evidence quote states the claim.

Quoted file: 28_secondary_lp_portfolio_ic. Fixture role of that file: facts.

Branch: not stored. evidenceFromDisplay sets conflicts when displayVerdict is conflict, conflicts, or conflicting. displayVerdict is not on the B510 row. The quoted file is a facts source or no file is named.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### NEW_SECONDARY_INVESTMENT raised 2

Statement: The investment thesis rests on three main elements: pricing, manager familiarity, and portfolio maturity.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: The IC paper states the merits are the price, the overlap with managers already known, and a book that is mostly through its investment period without being finished — and it explicitly says a reader would be wrong to call the portfolio mature. The statement's third element, "portfolio maturity," conflicts with the source's description.

The reason text describes a restatement: no. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: reason names a difference.

Quoted file: none named. Fixture role of that file: not applicable.

Branch: not stored. The text does not match the revision sentence, the transaction sentence, or a restatement, and it does not quote a context file.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

### NEW_SECONDARY_INVESTMENT raised 7

Statement: The firm has an established history with most of the funds in the portfolio.

Stored reading note: absent. bucket, text, documentValues, and disputedIndices were not saved.

Evidence displayVerdict: absent.

Reason: The IC paper says Halden is an existing investor in three of the five funds and diligenced a fourth in 2022, which matches the statement that the firm has history with most of the funds.
28_secondary_lp_portfolio_ic states "Halden is an existing investor in three of the five funds: Northlane Buyout III, Cinderwell Partners II, and Northlane Buyout IV."

The reason text describes a restatement: yes. The test is the restatement pattern in bothReadingsSupport, plus the phrases "matches the statement", "which matches", and "aligns with the statement", which are how these stored reasons word a match.

Rule: reason describes a restatement or a match.

Quoted file: 28_secondary_lp_portfolio_ic. Fixture role of that file: facts.

Branch: not stored. statementVerdict sets conflicts only when an accepted note bucket is conflicts. documentsDisagree refuses a wording or none note and does not rewrite the bucket.

Recomputed readingFacts not_found, with no note: none. statementVerdict on those facts and no note: nothing_raised.

Count by rule:
- quoted source is context: 11
- reason names a difference: 6
- reason describes a restatement or a match: 4
- evidence quote states the claim: 3

documentsDisagree does not set the conflicts state. In acceptNote, a wording or none note whose documentValues hold two distinct values is refused with reason documents_disagree. The retry prompt then tells the model to use bucket conflicts. That retry is a model call. This diagnostic did not run it. A refused note is not rewritten to bucket conflicts.

## B. Did B503 change this

readingNoteJsonSchema required fields: bucket, note, completion, disputedIndices, documentValues.
documentValues is required by the schema. The schema does not require the array to be non-empty. keptDocumentValues drops empty rows and stores nothing when nothing remains, so a required empty array is absent on the card. documentsDisagree on a missing or single-value array is false.

### b490 pass-1

Multi-source cards on fixtures 18, 22, 23, 24, 25: 37.
documentValues present: 0. Non-empty: 0.
Notes with bucket wording or none: 13.
Of those, documentsDisagree is true: 0. That is a refusal, not a rewrite of the bucket to conflicts.
Cards whose stored label or sentence state is conflicts: 21. Of those, wording or none plus documentsDisagree: 0.
readingNote keys on these cards: bucket, completion, text.
- Fixture 18: cards 10, documentValues present 0, non-empty 0, documentsDisagree on a wording or none note 0.
- Fixture 22: cards 5, documentValues present 0, non-empty 0, documentsDisagree on a wording or none note 0.
- Fixture 23: cards 5, documentValues present 0, non-empty 0, documentsDisagree on a wording or none note 0.
- Fixture 24: cards 7, documentValues present 0, non-empty 0, documentsDisagree on a wording or none note 0.
- Fixture 25: cards 10, documentValues present 0, non-empty 0, documentsDisagree on a wording or none note 0.

### b503 pass-1

Multi-source cards on fixtures 18, 22, 23, 24, 25: 37.
documentValues present: 0. Non-empty: 0.
Notes with bucket wording or none: 16.
Of those, documentsDisagree is true: 0. That is a refusal, not a rewrite of the bucket to conflicts.
Cards whose stored label or sentence state is conflicts: 21. Of those, wording or none plus documentsDisagree: 0.
readingNote keys on these cards: bucket, completion, text.
- Fixture 18: cards 10, documentValues present 0, non-empty 0, documentsDisagree on a wording or none note 0.
- Fixture 22: cards 5, documentValues present 0, non-empty 0, documentsDisagree on a wording or none note 0.
- Fixture 23: cards 5, documentValues present 0, non-empty 0, documentsDisagree on a wording or none note 0.
- Fixture 24: cards 7, documentValues present 0, non-empty 0, documentsDisagree on a wording or none note 0.
- Fixture 25: cards 10, documentValues present 0, non-empty 0, documentsDisagree on a wording or none note 0.

Comparison: both passes store documentValues on 0 of these cards. documentsDisagree therefore escalates none of them. The B503 schema makes the field required on the model reply. It does not make the stored card always carry a filled array. B503 did not add a code path that turns a wording or none note into the conflicts state.

## C. Roles in review

Source roles do not reach a review step. lib/source-role.mjs says the pipeline does not read the field. sourcesForPrompt deletes role before a prompt is built. The B510 review request sent name, label, text, type, and publicationState, and did not send role.
A search of lib/qc and api found no read of source.role and no test of role === "context" or role === "facts".

A context source, or an earlier-period document, can still produce a conflict or a revision because review treats every source as text:
- readingSourceBody joins every source text. The role is not an argument.
- Stage 2 matches every source. A conflicting match on a context source is a conflicting match.
- floorState returns conflicts when the reading state is not_in_source, beyond, partial, or note_withheld and a match explanation is classification conflicting and was not written for a confirmed repair.
- revisionSentence in supersession.mjs, and revisionFromReadings in reader-reason.mjs, compare two dated documents. When a later document disagrees and an earlier document agrees, the note starts "The later source ". shownState revisionRaises then sets conflicts.
- unorderedDifference writes "The documents differ." when two documents give different quoted values and the dates do not put one later. That prefix does not by itself trip revisionRaises.
- transactionDemand and completionEffect read the statement and the source corpus. They do not read a source role. A context passage can move the deal state they compare.
- The facts-and-context sentence in compose.mjs is a drafting instruction. Review does not receive it.

## D. False not in the source

Cards shown "Not in the source": 14. Of those, the reason contains a quotation: 11. Without a quotation: 3. The rows below are the ones with a quotation.
readingFacts were not stored on the B510 row. The facts below are recomputed by buildFacts on the fixture sources joined the way readingSourceBody joins them. The status not_found is set in buildFacts when elementFound returns false. statementVerdict then sets not_in_source on the first not_found fact unless the note bucket is wording.

### ADD_ON_DIRECT_INVESTMENT raised 1

Statement: Labor and energy costs in Brno are materially below those in Switzerland, and Morava’s lead times on its current book are about 14 weeks, compared with more than 20 weeks at Helvetia’s Swiss aerospace cell.

Recomputed readingFacts not_found: name "Labor"; name "Switzerland".

Closest source text: Lead times on the current book are about fourteen weeks, against more than twenty weeks at Helvetia's Swiss aerospace cell.

Class for name "Labor": spelling variant. labor / labour.
Class for name "Switzerland": place generalised. Switzerland.

The stored quotation states the claim, by quoteStatesStatement: yes.

### ADD_ON_DIRECT_INVESTMENT raised 2

Statement: Strategically, Morava provides Helvetia with a low-cost, aerospace-qualified titanium cell in a city where Helvetia has operated a smaller parts plant since 2021.

Recomputed readingFacts not_found: name "Strategically".

Closest source text: It gives Helvetia a low-cost titanium cell already qualified for aerospace, in a city where Helvetia has operated a smaller parts plant since 2021.

Class for name "Strategically": other. Strategically is a capitalised word kept as a name. collectNames drops a leading capital only when it is the first word of the whole statement and that word is in SENTENCE_OPENERS or its lowercase form is in the corpus.

The stored quotation states the claim, by quoteStatesStatement: yes.

### DIRECT_INVESTMENT_EXIT raised 1

Statement: Partners Group Agrees To Sell atNorth To CPP Investments And Equinix

Recomputed readingFacts not_found: name "Partners Group Agrees To Sell".

Closest source text: Partners Group, one of the largest firms in the global private markets industry, acting on behalf of its clients, has agreed to sell atNorth (or "the Company"), a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board ("CPP Investments") and Equinix, the world's digital infrastructure company.

Class for name "Partners Group Agrees To Sell": title or headline. Partners Group Agrees To Sell.

The stored quotation states the claim, by quoteStatesStatement: no.

### DIRECT_INVESTMENT_EXIT raised 2

Statement: Completion of the transaction is subject to customary closing conditions and regulatory approvals.

Recomputed readingFacts not_found: name "Completion".

Closest source text: The transaction is subject to customary closing conditions and regulatory approvals.

Class for name "Completion": other. Completion is a capitalised word kept as a name. collectNames drops a leading capital only when it is the first word of the whole statement and that word is in SENTENCE_OPENERS or its lowercase form is in the corpus.

The stored quotation states the claim, by quoteStatesStatement: yes.

### DIRECT_INVESTMENT_EXIT raised 4

Statement: Reflecting this conviction and the firm's continued thematic focus on data center infrastructure, Partners Group has committed to reinvest and acquire up to 10% of the company alongside CPP Investments and Equinix.

Recomputed readingFacts not_found: name "Reflecting".

Closest source text: Partners Group, one of the largest firms in the global private markets industry, acting on behalf of its clients, has agreed to sell atNorth (or "the Company"), a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board ("CPP Investments") and Equinix, the world's digital infrastructure company.

Class for name "Reflecting": other. Reflecting is a capitalised word kept as a name. collectNames drops a leading capital only when it is the first word of the whole statement and that word is in SENTENCE_OPENERS or its lowercase form is in the corpus.

The stored quotation states the claim, by quoteStatesStatement: yes.

### DIRECT_INVESTMENT_REVALUATION raised 1

Statement: Approximately one third of the uplift reflects higher EBITDA in the quarter.

Recomputed readingFacts not_found: name "Approximately".

Closest source text: About one third of the uplift comes from EBITDA growth in the quarter.

Class for name "Approximately": number written in words versus digits, or approximately versus about. approximately / about.

The stored quotation states the claim, by quoteStatesStatement: yes.

### DIRECT_INVESTMENT_REVALUATION raised 2

Statement: Operationally, the portfolio company continued to perform in line with the original investment thesis.

Recomputed readingFacts not_found: name "Operationally".

Closest source text: The original thesis was a defensive medical and aerospace franchise, with a smaller and more cyclical semiconductor exposure, and a plan to widen margins by footprint, procurement, and automation.

Class for name "Operationally": other. Operationally is a capitalised word kept as a name. collectNames drops a leading capital only when it is the first word of the whole statement and that word is in SENTENCE_OPENERS or its lowercase form is in the corpus.

The stored quotation states the claim, by quoteStatesStatement: no.

### NEW_DIRECT_INVESTMENT raised 2

Statement: Helvetia Precision Components AG operates four facilities in Switzerland, the United States and the Czech Republic, employs about 1,420 people, and has grown revenue from EUR 312 million in 2020 to EUR 587 million in 2024, with EBITDA margins improving from 15.4% to 17.5%.

Recomputed readingFacts not_found: name "Czech Republic".

Closest source text: HPC has grown revenue from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual growth rate of 17.1%.

Class for name "Czech Republic": place generalised. Czech Republic / Czech.

The stored quotation states the claim, by quoteStatesStatement: yes.

### NEW_SECONDARY_INVESTMENT raised 8

Statement: Geographically, the portfolio is focused on western Europe and North America.

Recomputed readingFacts not_found: name "Geographically".

Closest source text: Geographies are western Europe and North America.

Class for name "Geographically": other. Geographically is a capitalised word kept as a name. collectNames drops a leading capital only when it is the first word of the whole statement and that word is in SENTENCE_OPENERS or its lowercase form is in the corpus.

The stored quotation states the claim, by quoteStatesStatement: yes.

### NEW_SECONDARY_INVESTMENT raised 11

Statement: Overall, the investment team views the Vestmark LP portfolio as an entry into a mainly harvesting mid-market book at a discount to reported net asset value, with the benefit of existing holdings in three of the five funds and prior diligence on a fourth, while retaining upside from one 2021 fund that is still investing.

Recomputed readingFacts not_found: name "Vestmark LP".

Closest source text: The investment team considers the Vestmark interests to be an attractive entry into a mainly harvesting mid-market book, which benefits from an existing holding in three of the five funds, while the structure offers a discount of about one eighth to reported net asset value and leaves one 2021 fund still investing.

Class for name "Vestmark LP": other. name Vestmark LP.

The stored quotation states the claim, by quoteStatesStatement: no.

### SPECIAL_TOPIC raised 2

Statement: For the next 12 months, the firm is guiding to flat semiconductor revenue and has revised its full-year forecasts and budget to reflect this.

Recomputed readingFacts not_found: benchmark "forecasts".

Closest source text: We do not expect a deep downturn — the demand picture for EUV remains structurally strong — but we are guiding to flat semiconductor revenue for the next 12 months and have adjusted our full-year forecast accordingly.

Class for benchmark "forecasts": other. benchmark forecasts.

The stored quotation states the claim, by quoteStatesStatement: yes.

Count by class:
- other: 7
- place generalised: 2
- spelling variant: 1
- title or headline: 1
- number written in words versus digits, or approximately versus about: 1

## E. Missing fixtures

NEW_SECONDARY_INVESTMENT and SPECIAL_TOPIC did run. They each have a section in RESULT.md. run.json stopped is null. fixtures.length is 10. There is no error, skip, or filter to quote.

RESULT.md headings:
- ## ADD_ON_DIRECT_INVESTMENT
- ## DIRECT_INVESTMENT_EXIT
- ## DIRECT_INVESTMENT_REVALUATION
- ## FUND_CAPITAL_CALL
- ## FUND_DISTRIBUTION
- ## FUND_REVALUATION
- ## NEW_DIRECT_INVESTMENT
- ## NEW_PRIMARY_COMMITMENT
- ## NEW_SECONDARY_INVESTMENT
- ## SPECIAL_TOPIC

run.json text types: ADD_ON_DIRECT_INVESTMENT, DIRECT_INVESTMENT_EXIT, DIRECT_INVESTMENT_REVALUATION, FUND_CAPITAL_CALL, FUND_DISTRIBUTION, FUND_REVALUATION, NEW_DIRECT_INVESTMENT, NEW_PRIMARY_COMMITMENT, NEW_SECONDARY_INVESTMENT, SPECIAL_TOPIC.
NEW_SECONDARY_INVESTMENT: present yes. Raised cards 12. The fixture object does not store its own spend. The run spend is the top-level object: 1442 calls, USD 17.656571.
SPECIAL_TOPIC: present yes. Raised cards 4. The fixture object does not store its own spend. The run spend is the top-level object: 1442 calls, USD 17.656571.

## F. Source-role suggestion

Disagreements stored on the run: 5. The role row stores file, fixtureRole, suggestedRole, description, and publicationState. It does not store a separate reason for the role. The description is the two-sentence summary.

The classification prompt does give the text type. summaryUserMessage writes "Text type:" and the label. The system prompt says: "The user message names the text type this draft is for." The B510 runner passed eventType: fixture.textType into the summarize handler.

A probe of summaryUserMessage for that label starts: "Text type: Fund capital call".
The system prompt contains the text-type sentence: yes.

### FUND_CAPITAL_CALL 31_kestrel_fjordline_press_release.txt

Fixture role: context. Suggested role: facts.

Model reason for the role: not stored.

Stored description: A press release announcing Kestrel Partners Fund IV's acquisition of Fjordline Software, detailing the company's operations and growth in the logistics sector. It includes quotes from key executives and highlights the strategic rationale behind the acquisition.

### FUND_CAPITAL_CALL 34_kestrel_q3_2026_report.txt

Fixture role: context. Suggested role: facts.

Model reason for the role: not stored.

Stored description: A quarterly report detailing the performance of Kestrel Partners Fund IV for limited partners, covering financial metrics and significant events during the third quarter of 2026. It includes information on net asset value changes, acquisitions, and specific company performance, particularly regarding Brightwater Labs.

### FUND_DISTRIBUTION 33_kestrel_harbourline_press_release.txt

Fixture role: context. Suggested role: facts.

Model reason for the role: not stored.

Stored description: A press release announcing Kestrel Partners' agreement to sell a 60 percent stake in Harbourline Foods to Northshore Consumer Partners, retaining a 40 percent stake. The document details the transaction's value, company background, and leadership continuity.

### FUND_DISTRIBUTION 34_kestrel_q3_2026_report.txt

Fixture role: context. Suggested role: facts.

Model reason for the role: not stored.

Stored description: A quarterly report detailing the performance of Kestrel Partners Fund IV for limited partners, covering financial metrics and significant events for the third quarter of 2026. It includes information on net asset value changes, acquisitions, and specific company performance, particularly regarding Brightwater Labs.

### FUND_REVALUATION 35_kestrel_q2_2026_report.txt

Fixture role: context. Suggested role: facts.

Model reason for the role: not stored.

Stored description: A quarterly report detailing the performance of Kestrel Partners Fund IV for limited partners, covering the second quarter of 2026. It highlights net asset value changes, key holdings, and specific operational results of Harbourline Foods.


## Summary

A. Conflict cards 24. The reason describes a restatement or a match on 4. Largest rule: quoted source is context (11).
B. documentValues present on the five multi-source fixtures: b490 0 of 37, b503 0 of 37. documentsDisagree true on a wording or none note: b490 0, b503 0. Conflicts labels that are a wording or none note with documentsDisagree: b490 0, b503 0.
C. Review steps that read a source role: 0. Paths that can still raise a conflict or a revision from a context source or an earlier-period document: reading body, stage 2 match, floorState, revisionSentence, revisionFromReadings, unorderedDifference, transactionDemand, completionEffect.
D. Not-in-source cards 14, with a quotation 11. The quotation states the claim on 8. Recomputed not_found facts on 11. Largest class: other (7).
E. NEW_SECONDARY_INVESTMENT and SPECIAL_TOPIC are in the report. No error.
F. Disagreements 5. A role reason is stored on 0. The prompt names the text type.

Most likely cause of A: 11 of 24 conflict reasons quote a file whose fixture role is context. The remaining groups are a reason that names a difference (6), an evidence quote that states the claim (3), and a reason that describes a restatement or a match (4). All 24 cards recompute with no not_found fact, so the conflicts label did not come from a missing fact. documentsDisagree did not write it: that function refuses a wording or none note, and the B490 and B503 cards store no documentValues. The branch on the B510 card was not saved. The visible pattern is that review quoted a context source, including an earlier-period report, as a source that can conflict.

Most likely cause of D: statementVerdict sets not_in_source from the first not_found fact unless the note bucket is wording. 11 of 11 quoted cards still have a not_found element, and 8 of 11 have a stored quotation that states the claim. 5 of the 11 are a one-word capital that collectNames kept as a name. The other misses are a spelling (labor / labour), a place named more narrowly in the source, a headline, the hedge word Approximately, the shortened name Vestmark LP, and the benchmark word forecasts.

