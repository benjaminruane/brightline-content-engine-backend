// lib/rulebook/editorialRules.js
// A8.23 / A8.24: Editorial rulebook (curated). Use severityByOutput and reviewerNoteByOutput for per-output-type defaults.

import {
  FIRST_PERSON_ACTOR_FIX_DIRECTION,
  FIRST_PERSON_ACTOR_INSTRUCTION,
} from "../qc/first-person-actor.mjs";

const ALL = ["reporting_commentary", "investor_letter", "press_release", "linkedin_post"];
const THREE = ["reporting_commentary", "investor_letter", "press_release"];
const TWO_RC_IL = ["reporting_commentary", "investor_letter"];

// PARKED: imprecision_when_precision_available (E2)
// Removed in A8.30 after repeated LLM misfires (hallucinated
// precise figures, derived numbers presented as source facts).
// Reinstate as a deterministic check: (a) regex for
// approximator words in statement near a number, (b) literal
// substring match of the corresponding precise figure in
// the evidence excerpt. Do not reinstate as an LLM-judgment
// rule.

export default [
  {
    id: "voice_consistency",
    category: "editorial",
    severity: "soft_concern",
    description:
      "The voice appropriate for the output type is maintained throughout. Reporting commentary and press releases use third-person. Investor letters use first-person plural (we, our). LinkedIn posts use first-person plural (we, our - representing the firm, not the individual author). Flag unintended switches in voice within the document. " +
      FIRST_PERSON_ACTOR_INSTRUCTION,
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection: FIRST_PERSON_ACTOR_FIX_DIRECTION,
    reviewerNoteByOutput: {
      linkedin_post:
        "On linkedin_post: first-person singular author voice (e.g. 'Excited to see') AND third-person firm subject in deal announcements are both acceptable - do not flag either as voice inconsistency. Flag only unintended mid-document switches that confuse the reader.",
    },
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
    reviewerNoteByOutput: {
      linkedin_post:
        "On linkedin_post: do NOT flag 'Excited to see' or similar conversational openers as register mismatch — they are acceptable LinkedIn register. Reserve this rule for genuine colloquialisms ('crushed it', 'game-changer') or legalistic tone that obstructs a professional social post.",
    },
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
    id: "jargon_outside_audience_competence",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Specialist or insider terminology likely to obstruct the intended reader's understanding. On Complete visibility, flag only deep-insider terminology that even experienced finance readers might miss (e.g. 'cap intro', 'rolling 2/20 with hurdle', specialist fund-structure shorthand). On Public visibility, flag terminology that an outside professional reader (journalist, lawyer, accountant, non-PE corporate executive) could not reasonably be expected to know without explanation.",
    appliesTo: [...ALL],
    appliesToVersion: null,
    reviewerNote:
      "Suggest a plain-language equivalent or in-line definition. Do not strip the term entirely if it is materially precise — substitution may lose meaning.",
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
      "Flag explicit hyperbole and distinction-claim language that asserts exceptionality without substantiation. Words and phrases in this class include: 'exceptional', 'exceptionally', 'unparalleled', 'extraordinary', 'unmatched', 'world-class', 'industry-leading', 'market-leading', 'best-in-class', 'revolutionary', 'game-changing', 'transformative', 'genuinely [adjective]'. Substantiation means the same statement or an immediately adjacent sentence contains a specific figure, named comparator, period reference, benchmark, ranking, or other concrete fact that grounds the claim. Substantiation present = do not flag — this rule does NOT fire when substantiation is present. If the same sentence as the qualifier contains a specific figure, named comparator, period reference, benchmark, ranking, or other concrete fact that grounds the claim, do NOT raise a concern — even if the qualifier itself is a hyperbole word. For example, 'exceptional 22% net IRR vs a benchmark of 14%' does not fire: the figure and the comparator substantiate 'exceptional' directly. Adjacent-sentence substantiation also suppresses the flag. Do NOT flag standard qualitative descriptors such as 'strong', 'high-quality', 'leading' (when applied to widely-accepted market positions), 'well-positioned', 'robust', 'defensible', 'compelling', 'solid'. These are the working vocabulary of investment writing and are not hyperbole. They are not flagged even when unsubstantiated.",
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
    reviewerNoteByOutput: {
      linkedin_post:
        "On linkedin_post: name-plus-relative-clause fragments and short list-style credit lines are acceptable structure — do not flag as sentence fragments. Flag only genuine grammatical breaks: dangling modifiers, run-ons, agreement errors.",
    },
  },
  {
    id: "internal_plausibility",
    category: "editorial",
    severity: "hard_concern",
    description:
      "The sentence is internally consistent. Claims that contradict each other within the same sentence, rely on an unstated premise, or contain numerical impossibilities are flagged (e.g. 'growth accelerated from 20% to 15%'). Scope: evaluate logical and numeric consistency within the CURRENT STATEMENT only. Never compare the statement against source evidence or against other statements. A figure that differs from a source figure (including rounding, e.g. 17% vs a source's 17.1%) is an Evidence matter, not an internal-plausibility concern, and must not be flagged here.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "passive_voice_overuse",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Passive voice is used sparingly and deliberately. It is acceptable when the actor is unknown or irrelevant, or when the focus should legitimately rest on the recipient of the action. It is flagged when used habitually across adjacent sentences, when it obscures responsibility ('it was decided to reduce headcount'), or when an active-voice alternative would be clearer and more direct. Flag the pattern, not every single passive construction. Direction discipline: state the change concisely — name the passive construction and give the active recast of that clause only. Do not rewrite the entire multi-clause sentence as a single imperative.",
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
