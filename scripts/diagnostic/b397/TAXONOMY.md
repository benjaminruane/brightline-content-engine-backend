# B397. Claim types in this corpus

Written from the four clean drafts and the planted substitutions, before the count. Not revised after a number.

The agreed design already treats a figure, a date, and a name as a lookup against the whole source. The types below say what else is in these sentences, and which of those lookups can be written down.

A type is mechanical only when the rule is the sentences in this file. "Compare the direction" is not a rule.

## quantity

A money amount, a percent, a count, or a multiple. The element extractor already returns these.

Mechanical. Two tests, either one is a catch.

Absence. The figure is not equal to any figure in the source, under the B394 matcher.

Range collapse. The draft states one money figure, the source states a range of the same unit ("between A and B", or "A to B"), the draft figure equals one endpoint, and the draft does not state the other endpoint.

The source text is always there. The rule does not ask whether the figure is about the same line of business. A number that occurs anywhere is treated as found.

Examples. "GBP 3.3 million." "average 30% EBITDA growth." "USD 56 million" against a source range of 52 to 56.

## date

A year, a month, a quarter, or a full date that the date extractor returns. "six months to 30 June 2026" and "April 2026" are this type. "during the past year", "during the period", and "year to date" are not.

Mechanical. No date in the source agrees with the draft date. The source text is always there. A year that occurs anywhere, including a different event, is treated as found.

Examples. "April 2026." "six months to 31 December 2025." "2027."

## name

A proper name, or a role abbreviation on the B394 list (CEO, CFO, and the other rows). The match is the B394 name rule, including the expansion table, so CFO does not match Chief Executive Officer.

Mechanical. The name does not occur in the source. The source text is always there. A name that occurs anywhere is treated as found, so a swap onto a name the document uses for something else is missed. That miss is the rule, not a gap to be patched in prose.

Examples. "MAIT." "HCIL." "appointed a new CFO."

## ratio

A closed phrase: "vast majority", "majority", "essentially all", "virtually all".

Partly mechanical. The rule fires only when the source has the counterpart.

For "vast majority" and "majority", the head is the last word of five or more letters after "of". The whole is the largest money figure in a source sentence that contains "total" or "overall" and that word. The part is the largest money figure in a different source sentence that contains the draft's first word of five or more letters, skipping Meanwhile, Looking, Across, Overall, Organic, Elsewhere, and Separately. The catch is part divided by whole below 2/3 for "vast majority", or below 1/2 for "majority". If either figure is missing, the rule does not fire.

For "essentially all" and "virtually all", the counterpart is the set of holdings named by "uplift in", "gain in", or "gains in" followed by a capitalised token, anywhere in the source. The catch is that the set has exactly one holding. If it has none or several, the rule does not fire.

Examples. "the vast majority of the company's overall revenue." "gains across essentially all of its investments."

## rank

A closed word: "largest", "second-largest", "second largest", "third-largest", "biggest".

Partly mechanical. The draft contains one, a source sentence contains a different one, and the next noun is the same token ("producer"). If the source has no rank word, the rule does not fire.

Examples. "the largest producer of consumer batteries." "the second-largest producer of consumer batteries."

## polarity

A closed opposite, and the two sides share a noun of at least 4 letters.

The pairs are: reduction/increase, reduced/increased, completed/commenced, completion/commenced, clearance/submission, step-down/increase.

Partly mechanical. The draft contains one pole. A source sentence contains the other pole and a shared noun from the draft of length at least 4. Function words are not nouns: with, from, that, this, have, been, will, were, into, over, than, also, which, their, about, after, before, during, such, lead, more, most, only, same, other. If no sentence has both, the rule does not fire.

"flat" against "increased" is not in this list. "in line" against "outperform" is not in this list. Those are benchmark.

Examples. "lead to an increase in debt servicing costs." "has been commenced." "a submission for FDA approval."

## benchmark

A closed comparison aimed at a closed noun. The comparisons are: in line, outperform, outperforming, ahead, behind, flat, broadly flat. The nouns are: budget, budgets, expectation, expectations, forecast, prior year.

Partly mechanical. The draft and one source sentence must contain the same benchmark noun, and the comparison word must differ. If the source uses a different noun (expectations where the draft says budgets), the rule does not fire.

Examples. "significantly outperform budgets." "slightly ahead of forecast." "broadly flat compared with the prior year." "outperforming expectations."

## set

A place or market narrowed with "only".

Partly mechanical. The draft contains "only" and a capitalised place. A source sentence contains that place, the word "and", and a second capitalised place. If the source does not coordinate the place, the rule does not fire.

Examples. "the European market only." "the European and Asian markets."

## causation

"driven by", "driven largely by", "driven primarily by", "on account of", "benefitting from", "supporting" used as a cause.

Not mechanical. The source can name the same actor or the same line without the causal verb, and a closed verb list does not decide whether the cause is true.

The model's note quotes the source sentence that mentions the named actor or the named line. It does not confirm or deny the cause. It does not choose a badge.

Examples. "driven largely by Action." "with EBITDA growth driven by capital expenditure." "on account of lower allowances for excess and obsolete inventory."

## evaluation

A closed softness with no number under it: healthy, robust, positive, significant, meaningful, strongly, cautious, well received, good.

Not mechanical. Nothing in the source is a test for these words.

The model's note quotes the source's own adjective when it has one. It does not choose a badge.

Examples. "trading remains healthy." "performance was positive." "generated significant proceeds."

## open wording

A verb or a noun phrase that is not a figure, a date, a name, or a member of the closed lists above.

Not mechanical. Treating "the word is absent" as a catch would flag every paraphrase.

The model's note says the source does not use that wording and quotes the sentence about the same named thing, when there is one. It does not choose a badge.

Examples. "bartered through." "escalating oil prices." "enhancing site security." "electricity sector reform." "during the past year."
