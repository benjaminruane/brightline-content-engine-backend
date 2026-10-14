Review this draft text. Verify each statement against the source document attached. Present your findings showing the statement, the review result and a comment explaining the review result. Then prepare writer-facing feedback covering: overall assessment from the perspective of source-backing, narrative flow, text quality and readability, written in the role of a senior Financial Times editor; strengths; areas for improvement.

The review result on each claim uses exactly one of these four names.

confirmed
The sources support the claim.

A statement that restates the source in different words is supported. Paraphrase is not a defect. "remains healthy" for the source's "good", "like-for-like" for "LFL", and "additional" for "incremental" are supported. The same figure in another format is supported: 3,291 against 3291, $52.0 million against USD 52 million, 13 May 2026 against May 13, 2026. A different number, a different date, a different name, or a different period is not a format difference.

A statement that says less than the source is supported. Omission is the writer's prerogative. Do not flag a claim because the source also says something the statement left out. Dropping a qualifier is omission when the figure is the same: "8 employees" for "six full-time employees plus the two founders" is confirmed, because the count is the same and "full-time" was left out.

Two facts the source states in different sentences may be stated in one sentence. That is confirmed. The source does not have to have linked them. "Acceptable given the engagement signal and the founder team" is confirmed when the source says the return is acceptable given the engagement signal and, separately, states conviction in the founders.

A summary that names the same items the source names is confirmed when the source discusses those items, including their handling. "Each is understood and mitigated" is confirmed when the source names those risks and describes how they are handled. "Slightly broader than the source's adjectives" is not a reason to flag.

If the facts match, the verdict is confirmed. Do not downgrade a match to partially_confirmed because the wording is plainer, because two supported facts were joined, or because a qualifier was dropped.

Do not flag wording, tone, or the absence of hedging. A plainer sentence, or a sentence that drops the source's "approximately" or "expected" without changing the fact, is not a defect.

partially_confirmed
Part of the claim is supported and part is not. Use this only when one part contradicts the source or is not in the source at all. Do not use it for paraphrase, omission, tone, a missing hedge, a dropped qualifier, or facts joined from different sentences.

conflicting
The sources address the claim and contradict it. A different actor, figure, date, name, or period for the same action is a contradiction. When the claim gives an action to an actor the source does not name, and the source gives that action to someone else, the verdict is conflicting even if other words in the claim are also absent. Use not_supported only when the source does not discuss the action at all.

not_supported
The sources do not address the claim at all.

Flag only what contradicts the source, or what the source does not support at all. When you flag, name the specific words at fault, not the sentence.

Cite evidence as a line id or an inclusive range of ids from the numbered source, at most 6 lines, the minimal range that contains the evidence. Never reproduce source text. The lines field replaces the passage field. Several non-contiguous ranges per claim are allowed, as a list. lines is null when no numbered lines decide the claim. sourceId is the id of that source, or null when lines is null.

The draft is followed by its statements, each numbered in brackets. A statement may contain more than one claim. Every claim must set statementIndex to the number of the statement it came from.

You may write your reasoning first. Then write one JSON object, and nothing after it.

The JSON object has exactly these keys.
claims: an array of objects. Each object has statementIndex (the bracketed number), claim (the claim), verdict (one of the four names), lines (a line id, an inclusive range, or a list of those, or null), sourceId (the source id, or null), and comment (the comment explaining the review result).
assessment: a paragraph.
strengths: an array of strings.
improvements: an array of strings.
