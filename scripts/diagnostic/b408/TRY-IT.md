# B408. Try the reading view

No new finding. No model call. USD 0.

## The link

The results screen is otherwise untouched. On that screen the order bar sits above the cards: Order, then Risk and Draft, then on the right Reading, Expand all, and Collapse all.

The link says **Reading**. One click opens the view in place of the cards. The way back says **Cards**.

`QC_READING_VIEW` and `VITE_READING_VIEW` stay default on. If the review payload has no `reading` object, the Reading button is not rendered.

## What the view uses

The same slate type, borders, and spacing as the results screen and the sources drawer. No new font. No new component library.

A sentence is one row, in draft order. Demands has a dark left bar and a shaded row. Light is an outline. Quiet is plain text. A matched fact is an underline. A disputed fact is an amber outline. A fact that is not in the source is a heavier underline. The sentence stays readable.

The detail opens under its row. The source panel is already in the right column, so opening a row does not move that column. Clicking a line scrolls inside the panel. On the check below, the draft's scroll position stayed 0.

Narrow screens and mobile are out of scope. The two columns are not restacked.

## Two sources

None of the four corpus files is shorter than 40 lines, so a join of two whole files never puts L40 in the second document. The check uses the first 39 lines of the GP Industries press release and then the whole HICL interim source.

L40 is the first line of the HICL source: `HICL Infrastructure PLC`. The panel heading changes from the GP Industries label to the HICL label on that line. The fact chip reads the source name and then L40.

## What was opened

The deployed app at `brightline-content-engine-frontend.vercel.app/assess` was already on build `72daf43`. The header pill said v4. The backend was up. Review stayed disabled until a draft and a source are present. The source control is a file picker, and this session could not drive that picker, so a review was not started.

The view itself was opened in the app's stylesheet, with the HICL sentences and the two-source check above. The two demand sentences were the shaded rows. The Fortysouth sentence was the outline. The budgets row opened to Not in the source, then target with a count and an extract, then expectations, forecast, and guidance as counts only. The chip said `HICL interim L44`. Hover showed the source name and the neighbouring lines. The panel marked L44 and scrolled inside itself. The draft scroll stayed 0. Nothing else broke on that page.

## Five minutes, after this deploy

Use the HICL clean draft and the HICL interim source. A new review spends model calls. The header and the two strong sentences below are what the last measured clean run produced. A wording note can move. The missing facts do not: HCIL is not in the source, and budgets is not the word the source uses.

1. Open the app. The header pill says v4. Paste the HICL clean draft. Upload the HICL interim source. Run Review.
2. On the results screen, click **Reading**. The header reads `16 of 18 facts matched · 2 to look at · 1 worth a glance · 4 wording notes`, then `2 facts are not in the source.`
3. Two sentences are strong. One is the sentence that writes HCIL. The other is the sentence that says in line with budgets. The Fortysouth sentence is an outline. The rest are plain.
4. Open the budgets sentence. It says Not in the source. budgets is not found. The source words are target (3, with the extract of the earliest line), then expectations (5), forecast (6), and guidance (2), without an extract on those three. The line chip names the uploaded source and the line.
5. Hover a line chip. The hover is the source name, that line, and the lines beside it. Click it. The panel beside the draft marks that line. The draft does not jump, and a later line keeps its number.

## Known rough edges

These are unfinished. They are not new faults.

- 3i clean S11, the 9% attributed to the wrong part of the portfolio, is still not caught. The ledger leaves it soft.
- Wording notes are common. On the row they are a small marker. The note text is behind the open row.
- A date that hits more than eight lines shows a count, not the extracts.
- The 3i fixture and the source stored on the 3i review are different strings. Left as they are.
- The file picker could not be driven from the session that wrote this note, so this pass did not itself complete a billed review.
- Narrow screens are not laid out.

## Nothing else moved

The results screen, the cards, the export, and the summary were not edited.

`scripts/diagnostic/b403c/CLEAN-LEDGER.md` is unchanged. It still records firm errors 3 (3i clean S0, HICL clean S1, HICL clean S2), one soft (3i clean S11), two rejected, and 34 correct. That is the bar: demands 3, light 5, quiet 30, noise in demands 0. This pass does not change extraction, boilerplate, or excerpt selection, so P37 does not require a new replay.
