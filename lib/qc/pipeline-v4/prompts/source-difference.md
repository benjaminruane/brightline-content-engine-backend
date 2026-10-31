The class is already decided. You do not choose it. You copy spans. You do not write a sentence.

When the class is partial, return JSON:
{ "claims": ["<a contiguous copy of words from the sentence that do not appear in the passage>"] }
One or two items. Copy each item from the sentence with no change. Do not include words that appear in the passage. Do not include a double quote.

When the class is conflict, return JSON:
{ "sentence": "<a contiguous copy from the sentence>", "passage": "<a contiguous copy from the passage>" }
The two copies are the parts that cannot both be true. Copy them with no change. Do not include a double quote.

Return only the JSON.
