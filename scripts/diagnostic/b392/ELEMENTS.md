# B392 element definition

Written before any count. Not revised after a number.

An element is a span of a draft statement that a deterministic check can look up in the source. Three kinds. Nothing else is an element.

## Figure

A cardinal numeral, or a number word from zero to twenty, optionally with a currency marker, a scale, or a percent marker.

A currency marker is one of USD, GBP, EUR, SEK, $, £, €, written immediately before the number.

A scale is one of thousand, million, billion, bn, mn, written as the next word, or the suffix m or k written on the numeral itself (`3.3m`, `164k`). A free-standing letter m or k is not a scale.

A percent marker is % or the word percent.

`three facilities` is a figure. `over six billion` is one figure. A range written `52-56 million` or `5 to 10` is two figures, and a scale on the second applies to both.

These are not figures:

- An ordinal: a numeral ending in st, nd, rd or th, or the words first, second, third, fourth, fifth.
- A year. A four-digit number from 1900 to 2099, with no currency, scale or percent, is a date.

## Date

One of these, and not also a separate figure or a separate bare year:

- A day, a month name and a year, in either order. `13 May 2026` and `May 13, 2026` are the same date.
- A month name and a year, with no day.
- A bare year from 1900 to 2099.
- A quarter and a year: Q1 to Q4, or first, second, third or fourth quarter.
- A half and a year: H1, H2, or first or second half.
- A financial year: FY2026 or FY 2026.

Month names are January through December, including the three-letter forms and Sept.

## Name

A proper noun, including a single word. HICL, HCIL, Fortysouth, Action, Johor and Switzerland are names. A name is one word, or a run of consecutive words, where each word starts with an uppercase letter. A token that contains both a digit and a letter, such as 3i, may start or join that run. A possessive ending is not part of the name. `St.` stays inside the name.

These are not names. The sentence-initial list is closed:

- The first word of the statement, when it is one of: Elsewhere, Meanwhile, Looking, Across, This, The, On, In, Year, Net, Our, Performance.
- A word that is capitalised only because it is the first word of the statement, and that same word occurs in lowercase elsewhere in the same draft.
- The currency codes USD, GBP, EUR and SEK.
- A month name.
- A scale word, a percent word, or a number word from the figure rules.

## Matching

Figure. Fold the scale into a single number: thousand and the suffix k by one thousand, million, mn and the suffix m by one million, billion and bn by one thousand million. Keep the sign. Keep the unit: percent, a currency, or bare. Fold $ to USD, £ to GBP, and € to EUR. A percent never matches a currency or a bare figure. Different currencies do not match. A bare figure does not match a currency.

Two figures match when the folded numbers are equal, or when the source figure, rounded to the number of decimal places written on the draft figure, equals the draft figure. Rounding is half away from zero. `£3.3 billion` matches `£3,291 million` because 3.291 rounded to one decimal place is 3.3. A number word has zero decimal places.

Date. Match when the normalised forms are equal. A full date is a year-month-day. A month and year is a year-month. A bare year is the year. A quarter is the year and Q1 to Q4. A half is the year and H1 or H2. A financial year is FY and the year. A longer form does not match a shorter one. `13 May 2026` matches `May 13, 2026`. It does not match a bare `2026`.

Name. Match when the name occurs in the source after collapsing whitespace, turning curly quotes into straight quotes, and turning en and em dashes into hyphens. The match is case sensitive. HCIL does not match HICL.

An element is found when the source of that draft contains a match. Otherwise it is not found.
