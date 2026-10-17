# B399. Sentence assembly

Written before the count. Not revised after a number. If this rule misses the criteria, a second named rule goes below it. This text stays.

The binding rule is not changed here. This rule only decides which characters form one source sentence.

## Rule A1. Join a wrap, keep a boundary

A source line is one physical line of the extract.

Replace U+00A0 with a normal space before any other test. B398 showed that JavaScript `\s` already matches U+00A0, so the matchers do not need a change. The replacement is so a line break and a space are the only whitespace the join looks at.

A form feed is a boundary. The form feed character is furniture and is dropped.

A table row is a line that contains a pipe, or a line with two or more gaps of three or more spaces. A table row is never joined to the line before it or the line after it. Pipes are stripped. They are furniture. The letters and digits in the cells stay.

A bullet marker at the start of a line, after the pipes are stripped, is furniture and is removed: the bullet `•`, the middle dot `·`, and a lone `o` or `O` that is the whole first token and is followed by whitespace. The words after the marker stay. A lone `o` anywhere else in the line is a letter and stays.

Join line A to line B only when all four of these hold.

- A is not a table row and B is not a table row.
- A does not end with `.` `!` `?` `:` or `;`, allowing a closing quote or bracket after that mark.
- B, after the marker strip, starts with a lowercase letter.
- If A ends with a hyphen, the hyphen stays and B is appended with no extra space, so `forward-` plus `looking` is `forward-looking`. Otherwise one space is put between A and B.

A line that starts with a capital or a digit is not a continuation. A heading, a title, and a table cell that is not itself a sentence therefore stay apart from the sentence below them. That is the over-join guard. Joining "Summary financial highlights" to "3i prepares its statutory financial statements" would put the heading's words in the sentence's window. The capital on "3i" stops that join.

An empty line, and a line that is only markers, is not a sentence and is not joined. It produces no segment.

The joined block is then split after `.` `!` or `?` when the next character is an uppercase letter. A full stop between digits is not a split, so `3.3` and `6.3%` stay one token. Each resulting piece is one segment, written on its own line.

Characters this rule drops, and nothing else: the form feed, the pipe, the bullet `•`, the middle dot `·`, and a lone leading `o` or `O` used as a sub-bullet. Whitespace, including the non-breaking space after it has been turned into a normal space, is not content.

## Rule A2. An unfinished line may continue

Rule A1 stands. It is not edited. A2 is the rule below it.

A2 does everything A1 does, and it joins in three further cases. A table row is still never joined.

A line that is only a page marker, matching "Page", a number, "of", and a number, is its own segment. It is not joined to the line before it or the line after it, and those two lines may join to each other as if the marker were not there. The marker's digits stay.

A colon or a semicolon ends a line only when that line has no unclosed opening parenthesis. "(September 2024:" is unfinished. "commented:" is finished.

A full stop is not a sentence end when the word it closes is St, Mr, Dr, Inc, Ltd, Co, or Corp. "London St. Pancras" stays one sentence. "US." stays a sentence end, because US is not in that list.

Where A1 requires the next line to start with a lowercase letter, A2 also joins when the line so far does not end a sentence and it ends with one of these words, or with an opening parenthesis: of, the, a, an, and, or, to, in, for, with, from, by, on, at, as, its, our, their, into, including, than, per, after, before, over, under, between, within, across, during, without. The next line may then start with a capital, a digit, or a currency sign. "valuation uplift in" joins to "TCR". "dividend of" joins to "36.5 pence". "and the" joins to "US".

A heading that does not end with one of those words still does not join to the sentence below it. "Summary financial highlights" stays apart from "3i prepares its statutory financial statements". That is the same over-join guard as A1, kept for every line that is not visibly unfinished.

The sentence split also breaks after a full stop when the next character is a digit, unless the full stop is a decimal or one of the abbreviations above. "US. 98%" becomes two sentences. "3.3" stays one token.

A2 drops no character class that A1 does not drop.
