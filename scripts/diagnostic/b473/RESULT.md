# B473. Committed is not invested

Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.

Problems: none.

## What was built

The card already holds the statement and the source passage. The check reads a transaction state in each. Proposed is seeking approval, a recommendation, or an acquisition that would happen. Committed is capital pledged. Invested is the money having left, including a completed or closed transaction and an acquisition that has happened. When the draft's state is later than the source's, and the stored state would otherwise say nothing was raised, the reader sees Conflicts with the source. The sentence names both states. A source that states no transaction state is not this check. A matching pair of states is not this check. The stored verdict is not rewritten.

Callers. transactionDemand: shownState and both readerEvidenceSentence copies. The screen copy is src/modules/drafting/transactionState.js. Export and the header read the shown label, so they follow.

## The five statements

### 04:1

We have committed USD 10 million in the Company's Series A at a pre-money valuation of USD 40 million, for approximately 20% on a fully-diluted basis.

Before: Nothing raised. quiet. No reason under the label.

After: Conflicts with the source. demands. The source and the statement disagree, because the source is still seeking approval while the statement says the firm has committed.

States read: source proposed (approval), statement committed (committed).

This check supplies the sentence.

### 08:2

We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance.

Before: Conflicts with the source. demands. The source describes the investment as a proposal seeking approval ("We seek approval... to invest up to EUR 480 million"), not as a completed investment. The statement asserts the equity has already been invested and the stake acquired.

After: Conflicts with the source. demands. The source describes the investment as a proposal seeking approval ("We seek approval... to invest up to EUR 480 million"), not as a completed investment. The statement asserts the equity has already been invested and the stake acquired.

States read: source proposed (would), statement done (invested).

This check does not replace the sentence. The card was already a conflict.

### 15:2

We have invested EUR 720 million of equity for an 84% stake.

Before: Conflicts with the source. demands. The source says Halden Group and co-investors together will hold 84% in aggregate, with Halden's EUR 720 million being only part of that (alongside EUR 110 million of co-investment). The statement attributes the 84% stake to the EUR 720 million equity alone.

After: Conflicts with the source. demands. The source says Halden Group and co-investors together will hold 84% in aggregate, with Halden's EUR 720 million being only part of that (alongside EUR 110 million of co-investment). The statement attributes the 84% stake to the EUR 720 million equity alone.

States read: source proposed (approval), statement done (invested).

This check does not replace the sentence. The card was already a conflict.

### 18:0

We are writing to confirm completion of the transaction with Nordic SaaS Holdings (the "Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector.

Before: Conflicts with the source. demands. 18a_synth_cross_source_pair_initial states "We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector."

After: Conflicts with the source. demands. 18a_synth_cross_source_pair_initial states "We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector."

States read: source proposed (recommend), statement done (completion).

This check does not replace the sentence. The card was already a conflict.

### 18:2

We have invested EUR 158 million for a 60% controlling stake.

Before: Conflicts with the source. demands. 18a_synth_cross_source_pair_initial states "We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector."

After: Conflicts with the source. demands. 18a_synth_cross_source_pair_initial states "We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector."

States read: source proposed (recommend), statement done (invested).

This check does not replace the sentence. The card was already a conflict.

Cards this check raises: 04:1.

Cards whose label became lighter than the stored label: 0.

## The same state

Statements using committed, invested, completion, completed, acquired, or closed: 27.

A source and a draft that both say committed stay quiet: 06:10. A source that says closed and a draft that says acquired stay quiet: 02:1.

Same-state statements that were Nothing raised and are no longer: none.

08:14 says funding has been committed. The passage does not state a transaction state, so this check does not speak. It stays Goes beyond the source, light.

## What stayed

05:0 Conflicts with the source demands. 19:2 Conflicts with the source demands. 18:8 Conflicts with the source demands. 11:9 Needs a look demands. 15:12 Needs a look demands. 19:4 Nothing raised quiet. 19:13 Goes beyond the source light.

Beyond cards that are not light: none.

Draft 04 header: 2 statements conflict with the source. 7 worth a glance

## Readability

Gate failures: none. The B470 gates still hold.

Longest reason: 16:10, 436 characters.

## Invariants

Catch: 13 of 13. Group A: 11 of 11.

Evidence leave-alone 48 of 74. Combined quiet 30 of 74.

With the sentence label: evidence leave-alone 48 of 74. Combined quiet 30 of 74.

04:1 is not in the labelled 74. Its display verdict stays supported_full, so the tallies do not move. The cause of the new demand is the shown label only.

Screen reasons or states that differ: 0. Export sentences that differ from the card: 0. Wording notes shown: 0. Raised cards with no reason: 0.

## Assertions that moved

tests/b469-contradiction-floor.test.mjs required exactly 5 labels to be heavier than the stored label. That count was B469's three disagreements plus B470's two unchecked sentences. 04:1 also leaves Nothing raised, because a commitment is later than an approval the source is still seeking. The count is 6. The assertion was incomplete once that pair is a disagreement.

tests/b466-reason-reads.test.mjs required a card with no stored reason to keep an empty shown reason, apart from the partial joins and the two unchecked sentences. 04:1 had no stored reason. The shown sentence now says the source is still seeking approval while the statement says the firm has committed. The assertion was wrong, because that pair is a disagreement.

The browser was not opened. The confirming measurement is this replay of the stored pass.

