// lib/rulebook/editorialRules.js
// A8.23 / A8.24: Editorial rulebook (curated). Use severityByOutput for per-output-type defaults.

const ALL = ["reporting_commentary", "investor_letter", "press_release", "linkedin_post"];
const THREE = ["reporting_commentary", "investor_letter", "press_release"];
const TWO_RC_IL = ["reporting_commentary", "investor_letter"];

export default [
  {
    id: "voice_consistency",
    category: "editorial",
    severity: "soft_concern",
    description:
      "The voice appropriate for the output type is maintained throughout. Reporting commentary and press releases use third-person. Investor letters use first-person plural (we, our). LinkedIn posts use first-person plural (we, our — representing the firm, not the individual author). Flag unintended switches in voice within the document.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "imprecision_when_precision_available",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Vague qualifiers (nearly, roughly, approximately, around, about, some) are flagged ONLY when all three conditions hold: (a) the statement contains an approximation qualifier on a specific figure, (b) the evidence excerpt contains the SAME underlying figure stated precisely (without an approximation qualifier, or with a tighter qualifier), and (c) the precise figure is a better representation of the underlying fact. If the statement and evidence contain different figures, this is a conflict — do not fire this rule. If the evidence is equally imprecise or uses the same wording, do not fire this rule. If the evidence does not mention the figure at all, do not fire this rule.",
    appliesTo: [...THREE],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the exact vague phrase from the CURRENT STATEMENT and states the more precise figure or wording from the EVIDENCE EXCERPT. Example: \"Replace 'nearly 10,000' with '9,842'.\" The output must be one complete, readable sentence.",
  },
  {
    id: "overreach_unsupported_causal",
    category: "editorial",
    severity: "hard_concern",
    description:
      "Causal claims ('driven by', 'as a result of', 'because of', 'thanks to') that assert causation without clear supporting evidence. Correlation stated as causation. Strong claims of influence that the context does not warrant.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "underreach_hedging",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Overly hedged language when the evidence or position is clear. 'Seems to suggest', 'may possibly indicate', 'could be interpreted as', 'appears to potentially' used where a direct statement is appropriate and supported.",
    appliesTo: [...THREE],
    appliesToVersion: null,
  },
  {
    id: "register_mismatch",
    category: "editorial",
    severity: "soft_concern",
    description:
      "The level of formality does not match the output type. Colloquialisms ('awesome', 'crushed it', 'game-changer', 'killed it') in reporting commentary, investor letter, or press release. Overly formal or legalistic language in a LinkedIn post. Register should feel natural for the output type and audience.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "audience_calibration_jargon",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Unexplained technical or industry jargon. Jargon should be explained on first use or replaced with plainer language, regardless of audience sophistication. Even expert readers benefit from clear first-use definitions. Universally recognised finance terms (EBITDA, IRR, LP, GP, CEO, CFO) do not require explanation.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "marketing_language_excess",
    category: "editorial",
    severity: "soft_concern",
    severityByOutput: {
      reporting_commentary: "hard_concern",
      investor_letter: "hard_concern",
      press_release: "soft_concern",
      linkedin_post: "soft_concern",
    },
    description:
      "Excessive marketing or promotional language that shades into hyperbole without substantiation. Words like 'best-in-class', 'unparalleled', 'revolutionary', 'game-changing', and 'leading' are flagged when used without supporting evidence or context. 'Leading' is acceptable when the claim is undisputed and widely accepted (e.g. describing a Coca-Cola as a leading beverage brand). It is flagged when applied to less-established claims.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "narrative_coherence",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Adjacent sentences connect logically. Topic jumps without transitions, sentences that repeat the same point without advancing the argument, or sentences that contradict the flow established by neighbouring sentences are flagged. Evaluate against the previous and next statement where available. For the first statement, evaluate only against the next; for the last, only against the previous.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "materiality",
    category: "editorial",
    severity: "soft_concern",
    description:
      "The sentence adds meaningful information or advances the argument. A sentence that is factually correct but adds no value (restating information already given, incidental facts without relevance to the thesis) is flagged. This rule is about editorial value, not compliance disclosure — it is separate from material_omission in the Compliance rulebook.",
    appliesTo: [...TWO_RC_IL],
    appliesToVersion: null,
  },
  {
    id: "structural_integrity",
    category: "editorial",
    severity: "hard_concern",
    description:
      "The sentence is grammatically sound and structurally complete. Dangling modifiers, sentence fragments, run-ons, misplaced subordinate clauses, or agreement errors are flagged.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "internal_plausibility",
    category: "editorial",
    severity: "hard_concern",
    description:
      "The sentence is internally consistent. Claims that contradict each other within the same sentence, rely on an unstated premise, or contain numerical impossibilities are flagged (e.g. 'growth accelerated from 20% to 15%').",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "passive_voice_overuse",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Passive voice is used sparingly and deliberately. It is acceptable when the actor is unknown or irrelevant, or when the focus should legitimately rest on the recipient of the action. It is flagged when used habitually across adjacent sentences, when it obscures responsibility ('it was decided to reduce headcount'), or when an active-voice alternative would be clearer and more direct. Flag the pattern, not every single passive construction.",
    appliesTo: [...THREE],
    appliesToVersion: null,
  },
  {
    id: "sentence_length",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Sentences longer than roughly 40 words are difficult to read. Sentences with multiple independent clauses, multiple parentheticals, or packed subordinate structures should be flagged with a suggestion to break them up.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "cliche_and_filler",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Clichés and empty filler phrases are flagged. Examples: 'at the end of the day', 'needless to say', 'it goes without saying', 'in today's environment', 'moving forward', 'when all is said and done', 'the bottom line is'.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
];
