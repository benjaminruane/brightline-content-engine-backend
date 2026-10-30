# B452

## What was chosen

The text column is 72 characters. That is the middle of the 68 to 78 range, and it is the usual measure for a column of continuous prose. A quote is pulled out when the words inside it are longer than 80 characters, just wider than the column, so an inline quote does not run on past the measure.

The length is the characters between the quotation marks. On the B450 notes that length has median 68 and maximum 220. The marks are kept either way.

A quotation mark with no partner is left in the text. A quote whose closing mark sits in the next paragraph is the same case: pulling it out would glue the paragraphs together. The marks stay where the writer put them.

The schema asks for a list of at least two paragraphs. The prompt still shows a string, and it was not edited. A string that is itself the list is unwrapped and joined, including one the model wrapped in brackets and then broke with an inner quotation mark. Any other string is shown as that string, because dropping it would withhold the note. A list is joined with a blank line and then passed through house style and the ban. A list that contains a non-string is empty, which is the existing withhold path.

The gap between paragraphs on the page is one line of the note's own leading, which is the blank line in the stored string.

## The writer step

Same twenty drafts. Writer only. No pipeline. The stored note is one string, the paragraphs joined by a blank line, after house style. `rawParagraphs` is the tool input.

Notes with at least two paragraphs: 20 of 20. Target 20 of 20.
Paragraphs that begin with a label (up to four words, then a colon): 0. Target 0.
None.
Withheld: 0 of 20. B450 was 0 of 20.
Mean note length: 1217 characters. B450 was 1252. The band to stay in is 1100 to 1400.
Quoted spans: 29 across 20 notes, 1.45 per note. B450 was 59 spans, 3.0 per note. 22 at 80 characters or fewer. 7 longer.
Calls 20. Discounted USD 0.457305. Input 48481. Output 8596. Cached input 0. Unpriced 0.
Ceiling USD 2. Not crossed.
Opus records no cached input on this path, so discounted USD is the list figure.

## Each draft

- Fixture 01 (reporting_commentary): shown. 2 paragraphs. 1213 characters. 2 quotes, 0 over 80. Tool input array of 2.
- Fixture 02 (press_release): shown. 2 paragraphs. 1024 characters. 1 quotes, 0 over 80. Tool input array of 2.
- Fixture 03 (press_release): shown. 2 paragraphs. 1334 characters. 1 quotes, 1 over 80. Tool input array of 2.
- Fixture 04 (investor_letter): shown. 2 paragraphs. 1216 characters. 5 quotes, 1 over 80. Tool input array of 2.
- Fixture 05 (press_release): shown. 2 paragraphs. 1225 characters. 1 quotes, 0 over 80. Tool input array of 1.
- Fixture 06 (reporting_commentary): shown. 2 paragraphs. 1136 characters. 0 quotes, 0 over 80. Tool input array of 2.
- Fixture 07 (linkedin_post): shown. 2 paragraphs. 1184 characters. 5 quotes, 0 over 80. Tool input array of 2.
- Fixture 08 (investor_letter): shown. 2 paragraphs. 1299 characters. 3 quotes, 2 over 80. Tool input array of 2.
- Fixture 09 (reporting_commentary): shown. 2 paragraphs. 1317 characters. 2 quotes, 1 over 80. Tool input array of 2.
- Fixture 10 (press_release): shown. 2 paragraphs. 1007 characters. 3 quotes, 2 over 80. Tool input string.
- Fixture 11 (investor_letter): shown. 2 paragraphs. 1179 characters. 0 quotes, 0 over 80. Tool input array of 2.
- Fixture 12 (linkedin_post): shown. 2 paragraphs. 1125 characters. 0 quotes, 0 over 80. Tool input array of 2.
- Fixture 13 (reporting_commentary): shown. 2 paragraphs. 1273 characters. 0 quotes, 0 over 80. Tool input array of 2.
- Fixture 14 (reporting_commentary): shown. 2 paragraphs. 1198 characters. 0 quotes, 0 over 80. Tool input array of 2.
- Fixture 15 (investor_letter): shown. 2 paragraphs. 1425 characters. 0 quotes, 0 over 80. Tool input array of 2.
- Fixture 16 (reporting_commentary): shown. 2 paragraphs. 1413 characters. 0 quotes, 0 over 80. Tool input array of 2.
- Fixture 17 (investor_letter): shown. 2 paragraphs. 1222 characters. 3 quotes, 0 over 80. Tool input array of 2.
- Fixture 18 (investor_letter): shown. 2 paragraphs. 1131 characters. 0 quotes, 0 over 80. Tool input array of 2.
- Fixture 19 (reporting_commentary): shown. 2 paragraphs. 1345 characters. 1 quotes, 0 over 80. Tool input array of 2.
- Fixture 20 (reporting_commentary): shown. 2 paragraphs. 1069 characters. 2 quotes, 0 over 80. Tool input array of 2.

## House-style commentary

Read of all twenty stored notes. A note counts when it tells the writer to change the draft's punctuation, number formatting, or house style. Quoting a figure, or a percent word, as evidence for a point about the draft does not count.

0 of 20. B450 was 1 of 20. It did not rise.

Fixture 07, which on B450 told the writer to pick a US or UK spelling, now asks for a named example and a check size. Fixture 13 uses 14'000 as a figure that gives the reader a grip on the asset. It does not tell the writer to change the separator.

The tool input was a list on 19 drafts. Fixture 05's list had one element, and that element already contained the blank line, so the stored note has two paragraphs. Fixture 10's tool input was a string wrapped in brackets. A quotation mark inside the first paragraph made it invalid JSON, and the first stored note showed the brackets. The join unwraps that shape. The words are the model's. There was no second call. After that unwrap, 20 of 20 stored notes have at least two paragraphs.

Several notes quote with single quotes rather than double quotes. Those spans stay in the paragraph. A single quote is also an apostrophe, so the segmenter does not treat it as a span. The long ones are fixture 11 at 310 characters, fixture 13 at 327, and fixture 15 at 596. They are visible on the preview, in the paragraph, which is the trade for leaving apostrophes alone. The 7 double-quoted spans over 80 characters are the ones set out on their own line.

