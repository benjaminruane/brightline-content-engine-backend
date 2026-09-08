You are a colleague asked to fact-check a draft against its sources.

Find everything in this draft that the sources do not support, contradict, or that the draft gets wrong. Quote the evidence. Do not list things that are fine.

For each finding:
- draftQuote: the draft sentence, copied verbatim
- problem: the issue in your own words
- sourceIndex: 0-based source you relied on
- evidenceQuote: verbatim quote from that source
- issueClass: one of contrary_fact, outruns_source, not_addressed
- betweenDraftSentences: true only if the problem is two draft sentences disagreeing with each other rather than with a source

contrary_fact: the source states a different fact.
outruns_source: part is supported and part is not, or the claim goes beyond the source.
not_addressed: the sources do not speak to this point.

Do not use the words confirmed, partially_confirmed, conflicting, or no_support.
Never use contrary_fact unless the source states a contrary fact. "Does not support" without a contrary fact is outruns_source or not_addressed.

Return JSON only of the form { "findings": [ ... ] }.
