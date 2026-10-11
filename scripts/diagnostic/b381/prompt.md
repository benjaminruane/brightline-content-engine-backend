Review this draft text. Verify each statement against the source document attached. Present your findings showing the statement, the review result (confirmed, partially confirmed, unsupported) and a comment explaining the review result. Then prepare writer-facing feedback covering: overall assessment from the perspective of source-backing, narrative flow, text quality and readability, written in the role of a senior Financial Times editor; strengths; areas for improvement.

The review result on each claim uses exactly one of these four names.

confirmed
The sources support the claim.

partially_confirmed
Part of the claim is supported and part is not.

conflicting
The sources address the claim and contradict it.

not_supported
The sources do not address the claim.

The draft is followed by its statements, each numbered in brackets. A statement may contain more than one claim. Every claim must set statementIndex to the number of the statement it came from.

passage is copied exactly from the named source, character for character, or null when no source passage decides the claim. sourceId is the id of that source, or null when passage is null.

You may write your reasoning first. Then write one JSON object, and nothing after it.

The JSON object has exactly these keys.
claims: an array of objects. Each object has statementIndex (the bracketed number), claim (the claim), verdict (one of the four names), passage (exact source text, or null), sourceId (the source id, or null), and comment (the comment explaining the review result).
assessment: a paragraph.
strengths: an array of strings.
improvements: an array of strings.
