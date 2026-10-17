# B398. Sentence binding

Written before the count. Not revised after a number. If this rule misses the decision criteria, a second named rule goes below it. This text stays.

Benchmark and set are dropped. B397 is the reason. Benchmark reaches 0 of its 1 planted substitution and flags HICL clean S3, a sentence the source agrees with. Set reaches 0 of its 1 and flags 0 clean statements. The planted set sentence does not contain "only". Neither rule is applied in this pass.

## Rule B1. Sentence binding

This is the rule for a quantity, a date, a name, and a polarity pair. Part 2 is this same rule. The shared-noun test is not a second test.

The window is a source sentence. The source is split on newlines, then after `.`, `!`, or `?` when the next character is an uppercase letter. That is the B397 split.

An anchor is a word of five or more letters in the draft sentence, in lower case. It is not an anchor when it is any of these:

- a function word: with, from, that, this, have, been, will, were, into, over, than, also, which, their, about, after, before, during, such, lead, more, most, only, same, other
- a sentence opener: meanwhile, looking, across, overall, organic, elsewhere, separately, topline
- a polarity pole: reduction, increase, reduced, increased, completed, commenced, completion, clearance, submission, step-down
- a weak noun: company, companies, group, business, period, year, years

The words of the name under test are removed from the anchor set. A sentence must not win because it contains the swapped name. Figure words and date words stay in the set. "million", "towers", and "revenue" are what tie the number to the line. The number itself is shorter than five letters, so it was never an anchor.

Each source sentence scores the count of distinct anchors it shares with the draft sentence.

The bound window is every source sentence with the highest score, joined, when that score is 2 or more. A score of 0 or 1 is no binding.

Quantity, date, and name. When a binding exists, the B394 matcher runs on the bound window only. The binding fails when the matcher does not find the token there. That failure is a catch, including when the token occurs in some other sentence. Range collapse uses the same window. When there is no binding, the B397 whole-source test stands. A thin sentence is not flagged for lack of a window.

Polarity. The opposite pole must sit in a bound sentence. "company" cannot select that sentence, because it is not an anchor. When there is no binding, the polarity rule does not fire. It does not fall back to a shared noun anywhere in the source. That fallback is what flagged HICL clean S6.

Ratio and rank are unchanged. They are not presence rules.

## Rule B2. The bound set

B1 is unchanged above. It failed its own measurement. The window was only the sentences with the single highest score. A token about the same thing often sits in a sentence that shares two anchors and is not that winner, and the clearance sentence lost to a higher-scoring sentence that does not contain the pole.

B2 uses the same anchors, the same weak nouns, and the same score as B1. The bound set is every source sentence whose score is 2 or more. The set is empty when no sentence reaches 2. Quantity, date, and name then use the whole source.

A quantity, date, or name is found when the B394 matcher finds it in any sentence in the bound set. The binding fails when the set is not empty and the matcher misses the token in every sentence of the set. Range collapse uses the joined set when the set is not empty, and the whole source when it is.

Polarity fires when the opposite pole sits in any sentence in the bound set. It does not fire when the set is empty. "company" still cannot put a sentence in the set.
