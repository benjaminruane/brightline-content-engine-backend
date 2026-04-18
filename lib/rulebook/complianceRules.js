// lib/rulebook/complianceRules.js
// A8.22: Compliance dimensions ported verbatim from legacy COMPLIANCE_SYSTEM_PROMPT.

const ALL_OUTPUTS = ["reporting_commentary", "investor_letter", "press_release", "linkedin_post"];

export default [
  {
    id: "cherry_picking",
    category: "compliance",
    severity: "hard_concern",
    description: `CHERRY-PICKING
Does this sentence present a selectively positive picture by
omitting material context that would qualify or contradict it?
Assess against both the source evidence and the full draft.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "promissory_language",
    category: "compliance",
    severity: "hard_concern",
    description: `PROMISSORY LANGUAGE
Does this sentence make or imply a promise about future
performance, outcomes, or returns? Flag language that could
be read as a forward-looking commitment rather than an
assessment.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "selective_hedging",
    category: "compliance",
    severity: "soft_concern",
    description: `SELECTIVE HEDGING
Are risks and negatives hedged more heavily than positives,
or vice versa? Flag asymmetric treatment of uncertainty across
the document.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "material_omission",
    category: "compliance",
    severity: "hard_concern",
    description: `MATERIAL OMISSION
Does this sentence omit context a reasonable reader would need
to assess the claim fairly? For Public versions the threshold
is higher.`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "audience_appropriateness",
    category: "compliance",
    severity: "hard_concern",
    description: `AUDIENCE APPROPRIATENESS
For Public versions: does this sentence contain information
that should not be in the public domain — specific fund
economics, non-public financials, undisclosed deal terms, or
internal assessments? For Complete versions: is the detail
appropriate for NDA-bound investors?`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
  {
    id: "balance",
    category: "compliance",
    severity: "soft_concern",
    description: `BALANCE
In the context of the full draft, does this sentence
contribute to a one-sided picture with no acknowledgment of
risk, challenge, or uncertainty?`,
    appliesTo: [...ALL_OUTPUTS],
    appliesToVersion: null,
  },
];
