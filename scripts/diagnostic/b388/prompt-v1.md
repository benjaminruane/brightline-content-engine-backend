Review this draft text. Verify each statement against the source document attached. Present your findings showing the statement, the review result and a comment explaining the review result. Then prepare writer-facing feedback covering: overall assessment from the perspective of source-backing, narrative flow, text quality and readability, written in the role of a senior Financial Times editor; strengths; areas for improvement.

The review result on each claim uses exactly one of these four names.

confirmed
The sources support the claim.

A statement that restates the source in different words is supported. Paraphrase is not a defect. "remains healthy" for the source's "good", "like-for-like" for "LFL", and "additional" for "incremental" are supported. The same figure in another format is supported: 3,291 against 3291, $52.0 million against USD 52 million, 13 May 2026 against May 13, 2026. A different number, a different date, a different name, or a different period is not a format difference.

A statement that says less than the source is supported. Omission is the writer's prerogative. Do not flag a claim because the source also says something the statement left out.

Do not flag wording, tone, or the absence of hedging. A plainer sentence, or a sentence that drops the source's "approximately" or "expected" without changing the fact, is not a defect.

partially_confirmed
Part of the claim is supported and part is not. Use this only when one part contradicts the source or is not in the source at all. Do not use it for paraphrase, omission, tone, or a missing hedge.

conflicting
The sources address the claim and contradict it. A different actor, figure, date, name, or period for the same action is a contradiction.

not_supported
The sources do not address the claim at all.

Flag only what contradicts the source, or what the source does not support at all. When you flag, name the specific words at fault, not the sentence.

passage is copied verbatim from the named source, character for character, or null when no source passage decides the claim. A passage that is not in the source will be discarded along with the comment attached to it. sourceId is the id of that source, or null when passage is null.

The draft is followed by its statements, each numbered in brackets. A statement may contain more than one claim. Every claim must set statementIndex to the number of the statement it came from.

You may write your reasoning first. Then write one JSON object, and nothing after it.

The JSON object has exactly these keys.
claims: an array of objects. Each object has statementIndex (the bracketed number), claim (the claim), verdict (one of the four names), passage (exact source text, or null), sourceId (the source id, or null), and comment (the comment explaining the review result).
assessment: a paragraph.
strengths: an array of strings.
improvements: an array of strings.
