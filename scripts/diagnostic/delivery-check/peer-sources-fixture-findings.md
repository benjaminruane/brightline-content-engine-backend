# Peer-sources fixture findings (B173)

Read-only scoring of one billed pipeline run, 2026-09-13. Fixture 24 was added in this change. No accuracy pass. Frozen 01–20 pack not touched. Locator applied in memory after the run; that step called no model.

**The question.** Does a two-document peer disagreement — same fund, same as-of, neither an update — land as conflicting on the planted cards, and is the fixture fit to build B173 against?

**Short answer.** Yes. H1 met. P1, P2 and P3 are conflicting with both sources matched. Supersession did not fire. The proposal layer today still names one painted excerpt and is silent on the other document. That is the copy B173 will replace.

## Part 0. Claims from Claude

**C1 BLOCKING — MET.** Fixtures 01–20 are the frozen accuracy pack (`scripts/diagnostic/accuracy/statements.json` `"range": "01-20"`; `run-evidence.mjs` and `extract-stage1.mjs` process that block). Fixtures 21–23 and 90–93 already sit outside it. Fixture **24** is therefore outside the frozen pack and cannot affect it. It was not added to `statements.json`, `sample-manifest.json`, `labels.json`, or any accuracy run manifest.

**C2 BLOCKING — MET.** `resolveSupersession` demotes only when `olderAsOf.date.getTime() < authAsOf.date.getTime()` (`lib/qc/supersession.mjs`). Equal as-of dates cannot satisfy that. Same-period covering matches are also refused (`if (srcTok === claimPeriod) continue`). Both headers are `As at 31 March 2025` / `Period: quarter ended 31 March 2025`. The pair cannot be read as an update by that code.

**C3 CHECK — MET.** The only committed multi-source fixtures are 18, 22 and 23. All three are an initial document plus a later update. There was no peer case. This fixture does not duplicate one.

## Run

| | |
|---|---|
| Code at run | `b053fcf` (working tree then added this fixture only; product code unchanged) |
| Run folder | `scripts/diagnostic/runs/2026-09-13-170425/` (gitignored) |
| Command | `npm run qc:diag:prep` then `npm run qc:diag:run -- --only 24 --no-confirm` |
| Printed spend line | `LLM SPEND calls=49 in=180067 cached=134912 out=3740 costUsd=0.3180` |
| Wall clock | 10671 ms |
| Trace | https://cloud.langfuse.com/trace/b4ac2d1e-a9d1-4149-85a0-8a80d75b61d6 |

**Commentary and editorial were on.** `run-batch.mjs` does not set `skipCommentary` and only turns editorial off if the fixture config sets `editorialEnabled: false`. This fixture does not. Confirmed on the stored result: `reviewOptions` `{ evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true }`; Stage 5 commentary objects are present. Accuracy-pack runs in this repo set both off; this runner does not. Disk LLM cache: Stage 1/2 `hits=0 misses=15`. The 11-second wall clock is OpenAI cached input tokens (`cached=134912`), not a skipped editorial path.

A spend line printed. It was not a silent zero.

Locator: `applyConflictProposal` in memory on `inventoryStatements` evidence findings. No further model call.

## P1–P5

Cards: `F24:S#` from `qcCards[].index`. Source 0 = fact sheet (`24a`). Source 1 = performance report (`24b`). Stage 2 classifications from `pipelineResult.stage2[].sourceMatches`. Proposal from `applyConflictProposal` (and, where that returns no explain text, the `conflict_unaddressed` fallback `GENERIC_CONTRADICTION`).

| Case | Planted | Draft | Verdict | Source 0 | Source 1 | Proposal layer |
|---|---|---|---|---|---|---|
| **P1** S1 | Net IRR since inception: 11.2% vs 12.4% | 11.2% (follows fact sheet) | **conflicting** | confirmed (11.2%) | conflicting (12.4%) | **replace.** Paints the performance-report excerpt. Proposes 12.4%. Does not name 11.2% as a second source. |
| **P2** S2 | Portfolio companies: 34 vs 36 | 36 (follows performance report) | **conflicting** | conflicting (34) | confirmed (36) | **unaddressed**, no pairs. The painted excerpt is the fact-sheet 34, which also contains `31 March 2025`; the locator emitted no quantity pair. Fallback copy is the generic contradiction line. Mirror of P1: conflict is not keyed to upload order. |
| **P3** S3 | Total commitments: EUR 1.2bn vs EUR 1.25bn | EUR 1.3bn (follows neither) | **conflicting** | conflicting (1.2) | conflicting (1.25) | **replace.** Paints source 0. Proposes EUR 1.2 billion. Does not name EUR 1.25 billion. |
| **P4** S4 | Vintage 2019 = 2019 | 2019 | **confirmed** (`supported_full`) | confirmed | confirmed | No evidence finding. No conflict to rule on. |
| **P5** S5 | Realised proceeds EUR 48m (report only) | EUR 48m | **confirmed** (`supported_full`) | no_support | confirmed | No evidence finding. One document speaks. |

H6: do not pin a statement total. This run also produced S0 `conflicting` (opening sentence vs “Earnings across the portfolio were mixed.”) and S6 `partially_confirmed` (“We remain constructive…”). Those are not planted peer-quantity cases.

`supersededSourceNotes` was `[]` on every card. No `originalClassification` / `"superseded"` demotion.

## H1–H6 (pinned before the run)

**H1 THE GATE.** P1, P2 and P3 each produce a card whose verdict is conflicting, with BOTH sources matched to the statement.

**MET.** S1, S2, S3: `displayVerdict` `conflict`, `hasConflict` true. Each has Stage 2 rows for `sourceIndex` 0 and 1, none of them `no_support`.

**H2** On P1 and P2, one source is classified confirming and the other conflicting. On P3, both are conflicting.

**MET.** P1: 0 confirmed, 1 conflicting. P2: 0 conflicting, 1 confirmed (the mirror). P3: both conflicting.

**H3** P4 produces no conflict. The two sources agree and the card is confirmed. If the question would fire here, the fixture or the feature is wrong and that is worth knowing now.

**MET.** S4 confirmed, `hasConflict` false, both sources `confirmed`. No evidence finding, so the B173 question does not fire on the agree-control.

**H4** P5 produces an ordinary single-source outcome. Only one document speaks, so there is no disagreement to rule on.

**MET.** S5 confirmed from source 1 only. Source 0 `no_support`. No conflict.

**H5** Supersession does not fire on any card. `supersededSourceNotes` is empty everywhere. Same-period peers are not an update pair.

**MET.** Empty array on S0–S6.

**H6** Do not pin a total or a count of cards. Verdicts flap by roughly one per run and a movement of that size is noise.

**MET** as a pin: this file does not treat `conflicting=4` / `statements=7` as a gate. The extra S0 conflict is recorded above as run noise, not as a planted miss.

## Verbatim copy on P1, P2, P3

This is what the B173 build will replace.

**P1 (S1)** locator status `replace`, code `correction`.

- Explanation: `The source gives 12.4%, not the 11.2 percent in this sentence.`
- Proposed change: `Replace '11.2 percent' with '12.4%'.`
- Resulting sentence: `Net IRR since inception stood at 12.4% as at 31 March 2025.`

**P2 (S2)** locator status `unaddressed`, no explain code, no pairs.

- Explanation (fallback `GENERIC_CONTRADICTION` / `conflict_unaddressed`): `A source contradicts this statement. Decide whether the sentence should match the source.`
- Proposed change: none.

**P3 (S3)** locator status `replace`, code `correction`.

- Explanation: `The source gives EUR 1.2 billion, not the EUR 1.3 billion in this sentence.`
- Proposed change: `Replace 'EUR 1.3 billion' with 'EUR 1.2 billion'.`
- Resulting sentence: `Total commitments were EUR 1.2 billion.`

On P1 and P3 the product proposes the figure from the painted conflicting excerpt and never says the other uploaded source states a different number. On P2 it proposes nothing and still does not name both figures. That is the live B173 gap on a peer pair.

## Fit for B173

**This fixture is fit to build B173 against.** H1 met. The three disagreement cards exist, the two controls behave, supersession stayed quiet, and the proposal copy on P1/P3 is the one-source swap the backlog already named. Do not adjust thresholds. Do not add 24 to the frozen pack.
