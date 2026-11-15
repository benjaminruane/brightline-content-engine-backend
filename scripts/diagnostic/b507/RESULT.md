# B507. Drafting instructions built from layers

No model call. USD 0.

The baseline was captured from the builders that were already shipping, then the same 176 combinations were run again through the layered assembly. All sources on that grid are facts.

| | |
|---|---|
| Combinations checked | 176 |
| Identical | 176 |
| Context-source case | 1. Same prompt, plus the source-roles line |

Axes: 11 text types (the ten keys, plus none), 4 output types, 2 visibilities (Complete, Public), special instructions present and absent. Investment name, transaction date, word limit, and the authoring organisation are fixed. The authoring organisation is the default, which is none.

`baseline.json` is the captured prompt text and summary. It is about 4.7 MB. It is committed because this record is the proof.

The composer lists the layers in this order: house rules, output type, visibility, text type, source roles, this run. New direct investment and New fund commitment keep today's scaffold, including the binding-constraints block, so those prompts stay the same string. The other eight text types still use the generic style scaffold. Visibility wording and the run's name, date, word limit, and special instructions stay where they already were, inside that scaffold or in the Generate and Rewrite user prompt, so they are not written a second time. The source-roles line is added only when a source has role context.
