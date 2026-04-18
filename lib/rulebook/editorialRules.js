// lib/rulebook/editorialRules.js
// A8.22: Editorial dimensions ported verbatim from legacy EDITORIAL_SYSTEM_PROMPT (house_style moved to styleGuide.js).

const ALL_OUTPUTS = ["reporting_commentary", "investor_letter", "press_release", "linkedin_post"];

export default [
  {
    id: "imprecision",
    category: "editorial",
    severity: "soft_concern",
    description: `PRECISION
Is the sentence stated with exactly the right degree of
certainty? Flag any mismatch between the certainty of the
language and what the evidence actually supports.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "immaterial",
    category: "editorial",
    severity: "soft_concern",
    description: `MATERIALITY
Does this sentence earn its place in the document? Flag
sentences that add no meaningful information for this audience
and document type.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "incoherent",
    category: "editorial",
    severity: "soft_concern",
    description: `NARRATIVE COHERENCE
Does this sentence follow logically from its context in the
full draft? Flag sentences that break the logical flow or
assume context not yet established.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "register",
    category: "editorial",
    severity: "soft_concern",
    description: `REGISTER AND PRECISION OF LANGUAGE
Flag vague quantifiers where precise figures are available.
Flag jargon used imprecisely. Flag language pitched at the
wrong level for the intended reader.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "overreach",
    category: "editorial",
    severity: "hard_concern",
    description: `OVERREACH AND UNDERREACH
Overreach: claiming more than the evidence supports.
Underreach: hedging so heavily the sentence loses meaning.
Both are editorial failures.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "underreach",
    category: "editorial",
    severity: "soft_concern",
    description: `OVERREACH AND UNDERREACH
Overreach: claiming more than the evidence supports.
Underreach: hedging so heavily the sentence loses meaning.
Both are editorial failures.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "unsupported_causal",
    category: "editorial",
    severity: "hard_concern",
    description: `STRUCTURAL INTEGRITY
Flag hidden dependencies and unearned causal claims.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "implausible",
    category: "editorial",
    severity: "hard_concern",
    description: `INTERNAL PLAUSIBILITY AND BUSINESS LOGIC
Flag claims that defy normal business logic.
This is not external fact-checking — it is a judgment about
coherence within the document itself.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "internal_contradiction",
    category: "editorial",
    severity: "hard_concern",
    description: `INTERNAL PLAUSIBILITY AND BUSINESS LOGIC
Flag claims that are internally inconsistent with other
statements.
This is not external fact-checking — it is a judgment about
coherence within the document itself.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "misalignment",
    category: "editorial",
    severity: "soft_concern",
    description: `INTERNAL PLAUSIBILITY AND BUSINESS LOGIC
Flag when a sentence asserts a
relationship that does not follow from the surrounding context.
This is not external fact-checking — it is a judgment about
coherence within the document itself.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "audience_calibration",
    category: "editorial",
    severity: "soft_concern",
    description: `AUDIENCE CALIBRATION
Even for existing investors, do not assume they will recall
specific metrics or prior developments — each document should
be substantially self-contained. Flag sentences that assume
too much prior knowledge or omit necessary context.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
];
