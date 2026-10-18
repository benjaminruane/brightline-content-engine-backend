# B403B. Bucket boundaries

The question a note has to answer is: does the difference change what is being claimed, or only how it is said.

Wording is recorded. It does not mark the sentence. The sentence states are, strongest first, `not_in_source`, `conflicts`, `beyond`, and `nothing_to_raise`. A refused note is still `note_withheld`, labelled "Needs a look". That state is not a bucket.

## The test

Changes the claim. A different benchmark, a different quantity, a different direction, a different subject, a different scope, or a different cause.

These are conflicts when the source states something incompatible with the statement. They are beyond when the source simply does not carry what the statement asserts.

Does not change the claim. The same assertion in other words. This is wording. It is stored, counted on the header, and shown as a collapsed line, "1 wording note". It is not inside "statements to look at". A statement whose only finding is a wording note is `nothing_to_raise` and may sit on the positive header line.

Nothing worth saying is none.

## Where each shape lands

A synonym lands in wording. "Healthy" against "good", or "sale" against "realisation" for the same transaction, does not change what is being claimed.

An added adjective lands in beyond when it adds a judgement the source does not state ("significant", "vast"). It lands in wording when it restates a judgement the source already makes.

A vaguer restatement of a figure the source gives precisely changes the claim. When the statement asserts a different quantity and the source states the number, it is conflicts. When the statement drops the precise figure for a vaguer word and does not assert a different number, it is beyond.

A changed attribution lands in conflicts. The statement gives a fact to a subject the source does not give it to.

A changed benchmark word lands in conflicts. The source's benchmark and the statement's benchmark are not the same claim.

A paraphrase that keeps the claim lands in wording. "Allowances for excess and obsolete inventory" against "excess and obsolete inventory" is wording. A singular facility the source already uses, restated as one, is wording. An added cause, such as "driven by", is beyond.

## Every occurrence

`locateElement` returns every line the matcher hits, in document order. Each occurrence has the line id, the line text, and the ids of the neighbouring lines. The fact carries `occurrenceCount`, and that count is the length of the list. The card shows the first three and "and N more" when the list is longer. It does not rank the lines. `elementFound` is unchanged: a fact is `not_found` only when it is absent from the whole source. The only caller of `locateElement` is `buildFacts`.
