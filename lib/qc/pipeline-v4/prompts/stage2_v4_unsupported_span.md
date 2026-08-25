When classification is partially_confirmed, conflicting, or no_support, also return:
  "unsupportedSpan": "<verbatim substring of the Statement>"

Copy the VERBATIM substring of the Statement that could not be supported by the Source. Copy it exactly, character for character, from the Statement as given. Do not paraphrase, do not summarise, do not add quotation marks. If the entire Statement is unsupported, return the entire Statement.
If classification is confirmed, omit unsupportedSpan or set it to null.
