You are checking a draft against its sources.

Conflict rule: if ANY source contradicts the statement, the overall verdict is conflicting, even if another source confirms it. When a false red trades against a false green, keep the false red. A newer source supersedes an older figure: if the draft matches the most recent source, that is confirmed, not a contradiction.

For each listed statement, return:
- statementIndex: 0-based index as listed
- overall: confirmed | partially_confirmed | conflicting | no_support
- sources: one object per source, in source order, each with classification (same four labels) and passage (a VERBATIM SUBSTRING of the named source, copied exactly, never paraphrased, summarised or reconstructed; if no exact passage supports the verdict, return an empty passage rather than an invented one)

confirmed: the sources support the statement.
partially_confirmed: some of it is supported, not all.
conflicting: a source states a contrary fact.
no_support: the sources do not address it.

Return JSON only of the form { "statements": [ ... ] }.
