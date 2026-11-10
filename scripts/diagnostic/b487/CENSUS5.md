# B487. The census recounted

Pass: scripts/diagnostic/b486/pass-1.json. No model call. USD 0.

Fixes

- Source-awareness split. The B486 card has silences and no drops field. The B467 count read drops, so both halves were 0. The split now reads the silence text.
- The v4 compliance fidelity gate writes silence id fidelity onto the card, and the editorial drop writes the same id. The B467 rule still returned null.
- The duplication judge writes silence id editorial_duplication. The B467 rule still returned null.
- omission_covered is stored on classificationRewrites. The B467 rule still returned null.
- procedural_closer is stored on classificationRewrites. The B467 rule still returned null.

1. Totals

Sites: 88 (CENSUS4 88). Fires: 9 (CENSUS4 3). Fires zero: 40 (CENSUS4 42). Cannot be counted: 39 (CENSUS4 43).

2. Sites

| Times | Before | Reviewer sees | Why the number moved | CENSUS4 | Lives |
| --- | --- | --- | --- | --- | --- |
| fires 23 times | 23 | A point the note tried to name never appears. |  | 14. moved. This pass stores 23 note_rejections silences. CENSUS4 stored 14. |  |
| fires 10 times | 10 | An objection whose words also appear in the source disappears, and the editorial row can read clean. |  | 11. moved. Evaluative source-awareness silences on this pass: 10. CENSUS4 was 11. The compact card has no drops field, so the split reads the silence text. |  |
| fires 5 times | 5 | A small disagreement is shown as agreement, or two figures that are not the same quantity are shown as a contradiction. |  | 4. moved. Five matches store a prior class on writtenFor. CENSUS4 stored four. |  |
| fires 4 times | 2 | The label stands and the why sentence is empty. | The instrument counted an empty stored prose field. The why sentence is the reader sentence. | 0. moved. The reader sentence is empty on 01:0, 18:4, 19:7, and 25:4. CENSUS4 was zero. |  |
| fires 2 times |  | A conflict becomes fully backed because the passage already contains the point the card called omitted. |  | cannot. moved. classificationRewrites rule omission_covered is on the card. This pass has 17:9 and 19:4. CENSUS4 could not count it. |  |
| fires 1 times |  | On a conflict, an editorial note can disappear and that row can read clean. |  | cannot. moved. The duplication judge writes silence id editorial_duplication. This pass has 1. CENSUS4 could not count it. |  |
| fires 1 times | 1 | A forward-looking compliance note disappears because the phrase is already in the passage. |  | 0. moved. Fixture 07 card 5 stores silence forward_looking. CENSUS4 had none. |  |
| fires 1 times | 1 | The header is replaced, and the replacement does not name a conflict. |  | 0. moved. Draft 19. Cards 2, 7, and 13 have displayVerdict conflict under another label. The header names the label. The line is 1 worth a glance. |  |
| fires 1 times | 1 | The header leads with a light item while a conflict is not in the line. |  | 0. moved. Draft 19. Cards 2, 7, and 13 have displayVerdict conflict under another label. The header names the label. The line is 1 worth a glance. |  |
| fires zero times | 0 | A note was refused, and the sentence still says Nothing raised. |  | 0 | review backend |
| fires zero times | 0 | A refused note and a sentence with nothing to say wear the same label. |  | 0 | review backend |
| fires zero times | 0 | The sentence keeps a conflicts or beyond label and the reason under it is gone. |  | 0 | review backend |
| fires zero times |  | An editorial concern whose quote is not in the sentence disappears, and the row can read clean. |  | cannot. moved. The v4 compliance fidelity gate and the editorial drop both write silence id fidelity. CENSUS4 could not count the compliance drop. | review backend |
| fires zero times | 0 | A style concern is removed and the reader is not told. |  | 0 | review backend |
| fires zero times | 0 | A suggestion that would have changed nothing is removed, and the reader is not told one was raised. |  | 0 | review backend |
| fires zero times | 0 | A direction that changes nothing is removed, and the reader is not told. |  | 0 | review backend |
| fires zero times | 0 | An editorial note that is really about the source is deleted rather than shown as evidence. |  | 0 | review backend |
| fires zero times | 0 | A narrative concern disappears and the editorial row can read clean. |  | 0 | review backend |
| fires zero times | 0 | Two overlapping notes become one, sometimes joined as (i) and (ii). |  | 0 | card assembly |
| fires zero times | 0 | The whole review of that sentence becomes Not checked, with no reason. |  | 0 | card assembly |
| fires zero times | 0 | The editorial row says clean while the causal objection is taken off that list. |  | 0 | review backend |
| fires zero times | 0 | Goes beyond the source, or a partial, with no finding under the headline. |  | 0 | review backend |
| fires zero times | 0 | A partial becomes fully backed and the sentence that named the gap is gone. |  | 0 | card assembly |
| fires zero times | 0 | A timing partial becomes fully backed, or a date disagreement becomes a conflict, and the earlier class is not named. |  | 0 | card assembly |
| fires zero times | 0 | The summary calls a beyond sentence partial support, or calls Nothing raised backed. |  | 0 | screen display |
| fires zero times | 9 | The summary stops after three points, and does not say the list was cut. | The instrument counted drafts with more than three slots. The summary now prints every non-zero slot, so none are cut. | 0 | screen display |
| fires zero times | 0 | The passage is punctuation only, and the card does not say there is no passage to show. |  | 0 | screen display |
| fires zero times | 0 | The summary says partial support where the card says Goes beyond the source. |  | 0 | screen display |
| fires zero times | 0 | The summary says the claims are backed where the card says Nothing raised. |  | 0 | screen display |
| fires zero times | 0 | The evidence row says Nothing raised, or is blank, while the check found a partial or a conflict. |  | 0 | screen display |
| fires zero times | 0 | A green edge sits on a sentence whose only editorial objection was causal. |  | 0 | screen display |
| fires zero times | 37 | A beyond sentence is left out of To look at, and the filter does not say so. | The instrument counted every beyond sentence. To look at already includes them. The ones left out are zero. | 0 | screen display |
| fires zero times | 19 | A source is painted amber and prefixed Relates to the statement, for a class the screen does not name. | The instrument counted every class other than confirmed, partial, and conflicting. Those classes now have their own prefix. None still use Relates to the statement. | 0 | screen display |
| fires zero times | 0 | The framing row is titled Framing goes beyond the source even when the note says something else. |  | 0 | screen display |
| fires zero times | 8 | The file the reader can send quotes a different evidence sentence from the one on the card. | The instrument compared the export with the stored prose and got 8. The sentence on the card is the reader sentence, and the export matches it. | 0 | screen display |
| fires zero times | 0 | Goes beyond the source, or a partial, with no finding under the headline. |  | 0 | screen display |
| fires zero times | 1 | The row says Not checked. The reason that was stored is not on the screen. | The instrument counted a stored slug. The row now shows the sentence for that slug. The same two cards were counted once for each heading. | 0 | screen display |
| fires zero times | 0 | The row says a number of concerns and the opened list has an empty bullet. |  | 0 | screen display |
| fires zero times |  | A sign-off sentence is marked no support, with no word that it was treated as a closer. |  | cannot. moved. classificationRewrites rule procedural_closer is the record. This pass has 0. CENSUS4 could not count it. | review backend |
| fires zero times | 0 | The list orders a source conflict above a wording note. |  | 0 | screen display |
| fires zero times | 9 | Editorial and compliance notes never reach the summary once two evidence points have filled it. | The instrument counted drafts with more than three slots. The editorial or compliance bullet is in the summary whenever that count is non-zero. | 0 | screen display |
| fires zero times | 0 | A note was refused, and the sentence still says Nothing raised. |  | 0 | screen display |
| fires zero times | 1 | The row says Not checked. The reason that was stored is not on the screen. | The instrument counted a stored slug. The row now shows the sentence for that slug. The same two cards were counted once for each heading. | 0 | screen display |
| fires zero times | 0 | A check that was turned off says so. |  | 0 | screen display |
| fires zero times | 0 | The whole review of that sentence becomes Not checked, with no reason. |  | 0 | card assembly |
| fires zero times | 0 | The commentary did not come back, and the evidence row says Not checked without the reason. |  | 0 | screen display |
| fires zero times | 0 | The review did not run, and the screen says so. |  | 0 | screen display |
| fires zero times | 8 | The file the reader can send quotes a different evidence sentence from the one on the card. | The instrument compared the export with the stored prose and got 8. The sentence on the card is the reader sentence, and the export matches it. | 0 | export |
| fires zero times | 1 | The row says Not checked. The reason that was stored is not on the screen. | The instrument counted a stored slug. The row now shows the sentence for that slug. The same two cards were counted once for each heading. | 0 | export |
| cannot be counted |  | A formed editorial concern disappears, and the row can end up Not checked. |  | cannot | review backend |
| cannot be counted |  | A concern shows under the other heading, with no word that it was moved. |  | cannot | review backend |
| cannot be counted |  | A conflict becomes no support, or a confirmed sentence becomes a conflict, and the quote can go with it. |  | cannot | review backend |
| cannot be counted |  | A mark was dropped and the reader is not told. |  | cannot | review backend |
| cannot be counted |  | A paragraph of the writer note is missing. |  | cannot | review backend |
| cannot be counted |  | A card is missing from the totals, with no line saying it was hidden. |  | cannot | screen display |
| cannot be counted |  | Findings disappear from every card after a re-check, with no word that the map was cleared. |  | cannot | screen display |
| cannot be counted |  | A proposal is dropped, and the screen does not say how many were dropped. |  | cannot | screen display |
| cannot be counted |  | The chip says Dealt with while the finding is still on the card. |  | cannot | screen display |
| cannot be counted |  | After an edit, the colour is gone and the banner does not say the colours were removed. |  | cannot | screen display |
| cannot be counted |  | A date says N lines and does not show the lines. |  | cannot | screen display |
| cannot be counted |  | A rewritten class is shown with no period sentence, once the quote has been dropped. |  | cannot | screen display |
| cannot be counted |  | Sources past five, or sources missing a body, disappear with no N more. |  | cannot | screen display |
| cannot be counted |  | A heading or a salutation is listed as not checked as a claim. |  | cannot | review backend |
| cannot be counted |  | A slice of the draft was not reviewed, and the screen can say so only when coverage was stored. |  | cannot | review backend |
| cannot be counted |  | Coverage was not computed, and the screen looks as if the whole draft was covered. |  | cannot | screen display |
| cannot be counted |  | The sentence could not be found in the draft, and on a replaced draft that note is suppressed. |  | cannot | screen display |
| cannot be counted | 18 | A sentence with no support is not searched again, and the reader is not told the search stopped. | The instrument counted every no-support match. Nothing on the card says whether that sentence was searched again. | cannot | review backend |
| cannot be counted |  | A partial stays partial, and the reader is not told a span check was switched off. |  | cannot | review backend |
| cannot be counted |  | The bullet shows the complaint and leaves out the correction. |  | cannot | screen display |
| cannot be counted |  | A sentence whose facts all matched never gets a proposal, even when the note says what to change. |  | cannot | review backend |
| cannot be counted | 23 | A framing or recency note is on the card and there is no proposal for it. | The instrument counted every framing and recency note. A proposal is not on the card, so a note with no proposal cannot be split from the population. | cannot | screen display |
| cannot be counted |  | A first-person proposal is dropped and nothing is rendered for that row. |  | cannot | screen display |
| cannot be counted |  | The reader is told they rewrote the sentence, and the proposed sentence is not shown. |  | cannot | screen display |
| cannot be counted |  | There is no fix, and the reason is shown only for an acknowledgement. |  | cannot | review backend |
| cannot be counted |  | A mechanical style note and a partial can sit together with no rank between them. |  | cannot | screen display |
| cannot be counted |  | After an edit that is not marked stale, the old finding stays on the new sentence and nothing says so. |  | cannot | screen editing flow |
| cannot be counted |  | The chip says Dealt with while the finding is still on the card. |  | cannot | screen editing flow |
| cannot be counted |  | A missed edit and a missed load share one toast. |  | cannot | screen editing flow |
| cannot be counted |  | An empty notice renders nothing. |  | cannot | screen editing flow |
| cannot be counted |  | Editorial did not run, and the screen says the check failed. |  | cannot | screen display |
| cannot be counted |  | Commentary was skipped and the card looks like a finished sentence with nothing to say. |  | cannot | screen display |
| cannot be counted |  | Proposals were not loaded, and the screen does not say so. |  | cannot | screen display |
| cannot be counted |  | The concern lists and the turned-off line are both missing, so off and a miss look the same. |  | cannot | screen display |
| cannot be counted |  | The writer note was withheld. The reading view says so. The export and the card screen do not. |  | cannot | export |
| cannot be counted |  | A mark was dropped and the reader is not told. |  | cannot | export |
| cannot be counted |  | A replayed review is not saved, and a refresh does not say so. |  | cannot | screen editing flow |
| cannot be counted |  | A save failed. The too-large case is spoken. Any other failure is only a console warning. |  | cannot | screen editing flow |
| cannot be counted |  | The same sentence got a different verdict on a second run. |  | cannot | review backend |

3. The figure-pair site

A small disagreement is shown as agreement, or two figures that are not the same quantity are shown as a contradiction.

Count on B486: 5.

- 11:9. writtenFor confirmed, classification not_reviewed.
- 18:7. writtenFor partially_confirmed, classification conflicting.
- 19:2. writtenFor partially_confirmed, classification conflicting.
- 19:4. writtenFor confirmed, classification conflicting, rewrite figure_pair.
- 25:7. writtenFor no_support, classification conflicting.

4. Where a zero or an uncountable site lives

The Lives column is filled for fires zero and cannot be counted. The values are review backend, card assembly, screen display, screen editing flow, and export.

5. The B426 ten, and the B451 extras

1. A refused note labelled Nothing raised, and Needs a look never assigned. Closed. statementVerdict returns note_withheld when the note is refused. The label is Needs a look. This pass: 06:3, 17:7, 18:6.
2. A partial labelled Nothing raised and counted as confirmed, with no evidence finding. Closed. A quiet partial is its own state. The summary gives beyond and nothing_raised their own buckets. cardEvidenceFindings adds a partial row when the headline is partial.
3. Causal overreach removed from the editorial verdict and from the evidence line. Partly closed. The editorial reviewer does not raise overreach_unsupported_causal. editorialVerdictWithoutCausal still strips that rule, and cardEvidenceFindings still skips it when it set the headline.
4. A drop recomputes the verdict to clean, with no count on the card. Partly closed. The duplication judge records silence editorial_duplication when it drops a concern. The compliance fidelity gate records silence fidelity when it drops a concern, on the v4 call that passes the card. The screen does not render silences.
5. The attention header replaces the backend header and omits a conflict. Partly closed. readingHeaderParts still drops the backend line when the attention line is set. The line names the label Conflicts with the source. Draft 19 on this pass is 1 worth a glance.
6. The summary calls a beyond sentence partial, calls Nothing raised backed, and stops at three bullets. Closed. beyond and nothing_raised are their own buckets. summaryBulletsFromReview prints every non-zero count.
7. The company step, lib/qc/generic-company.mjs. Open. applyGenericCompanySuppress still returns supported_full, and stripGapSentences still deletes a gap sentence. Assembly still applies it. A silence is written only when the summary text changes.
8. A backstop rewrites a class and drops the prior, and a no-support result drops the passage. Partly closed. classificationRewrites stores from and to. writtenFor stores a prior class when the matcher sentence stays. A period rewrite that replaces the explanation does not store writtenFor.
9. Export prints a different verdict from the card. Closed. The export uses the reader sentence. Both export rows on this pass are zero.
10. A re-check that is not stale writes the new sentence onto the old verdict. Closed. recheckStatements sets stale true on the rebuilt card.
Needs a look is assigned. Closed. note_withheld is the state, and the label is Needs a look.
The screen renders silences. Open. No screen list reads card.silences. readerReason reads reassurance_stripped to choose a cleared sentence.
partialSentence reads evidence_summary as well as the matcher explanation. Closed.
The LinkedIn credit-line drop records silence linkedin_credit_line. Closed. This pass has 0.
A wording note is stored and not shown. Open. wording_note_withheld is 139 on this pass. The census has no row for it.

6. Sites the census does not have

wording_note_withheld. 139. Review backend. The note is on wordingNoteWithheld. It is not the reader sentence.
reader_prose_withheld. 9. Review backend. Cards: 08:3, 08:6, 08:12, 08:14, 09:8, 14:3, 15:9, 16:2, 16:3.
