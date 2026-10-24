# B414. Two fixes on one sentence

No model call. USD 0.

The statement text stored by extraction is unchanged. The clean ledger stands: demands 3, light 5, quiet 30, noise in demands 0. No statement moves. Part 5 changes only where a passage ends.

## A1. Affinity Water, both accepted

Before:

Meanwhile, Affinity Water appointed a new CFO with significant sector experience and stands to benefit from the French government’s recently published white paper on electricity sector reform.

The apostrophe in government’s is the one stored on the sentence.

After, one write:

Meanwhile, Affinity Water appointed a new CEO with significant sector experience and stands to benefit from the UK government’s recently published white paper on electricity sector reform.

Accepting French first, or CFO first, gives the same sentence. The statement is then stale, and both decisions on it are cleared. The amber banner is the existing re-check offer.

## A2. Every path that declines a write

| Path | What the card says |
| --- | --- |
| Two substitutions overlap | CFO to CEO and French to UK overlap. Only one can be taken. Nothing is written. |
| An accepted Modify and an accepted proposal | Your edit was applied. CFO to CEO is no longer applicable. The Modify is the write. |
| Two whole-sentence writes, or a whole sentence mixed with a substitution | First rewrite. and Second rewrite. cannot both be applied. Only one can be taken. Nothing is written on that statement. Another statement in the same save still applies. |
| The sentence is not in the draft | This sentence is no longer in the draft, so the change was not applied. |
| The sentence is in the draft, and its span is already taken by another write | This sentence overlaps another change in the draft, so it was not applied. The other write still applies. |
| Two located writes still overlap, the old guard | These two sentences overlap in the draft, so neither change was applied. Any other accepted change on that save says: This change was not applied, because two sentences overlap in the draft. Nothing is written. The save returns that first sentence, not "Apply failed." |

A single accepted proposal, and an entry that has only a resulting sentence, write that sentence and say nothing.

## A3. Stored reviews

878 JSON files under tests/fixtures and scripts/diagnostic were read. Two files already store two ACTION entries on one statement. Neither entry has a substitution.

- scripts/diagnostic/revise/per-finding-action-list/brackenhill-2026-09-02.json, statement 5. Both resulting sentences are the statement itself.
- scripts/diagnostic/revise/per-finding-action-list/stage0-annex.json, statement 1, in two nested lists.

Accepting both writes nothing, and the card says the two sentences cannot both be applied. That is the same draft as before, plus the message. No other stored file has two ACTION entries on one statement. The HICL review fixtures do not store the proposals. Those are built when the action list runs. Accepting both on the Affinity sentence then writes both.

## A4. The HICL name card

The passage is HICL Infrastructure PLC.

It no longer continues onto 04 March 2026. A line break ends the passage when one side is a date line and the other is not, unless the line ends with a comma, a colon, or a semicolon.

## Callers

applyDecisions is called by api/revise-actions-apply.js and tests/revise-actions-apply.test.mjs. The API now returns notices and writtenStatementIds. A refused overlap is still a 400, and the body carries the notices. The existing apply tests still expect the same draft text.

verifiedProposalEntries is appended by lib/revise-actions/run.mjs as built. A verified proposal now carries substitution when the span resolves. A single accept still writes resultingSentence. publicEntry is not on that path.

sentenceBounds is private. sourceSentenceContaining is the passage readers see. A title no longer takes the date on the next line. The B413 passage tests still pass.

On the screen, statementIdsFromAppliedWrites counts a combined substitution, and one Modify beside a proposal, as written. Two whole sentences are not. Accepting one substitution no longer clears the other. A whole-sentence pair still does.
