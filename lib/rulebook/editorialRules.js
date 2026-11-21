// lib/rulebook/editorialRules.js
// A8.23 / A8.24: Editorial rulebook (curated). Use severityByOutput and reviewerNoteByOutput for per-output-type defaults.

import {
  FIRST_PERSON_ACTOR_FIX_DIRECTION,
  FIRST_PERSON_ACTOR_INSTRUCTION,
} from "../qc/first-person-actor.mjs";
import { houseVoiceEditorialProse } from "../prompt-library/house-voice.mjs";

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
      "The voice appropriate for the output type is maintained throughout. " +
      houseVoiceEditorialProse() +
      " On LinkedIn the first-person plural represents the firm, not the individual author. Flag unintended switches in voice within the document. " +
      FIRST_PERSON_ACTOR_INSTRUCTION,
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection: FIRST_PERSON_ACTOR_FIX_DIRECTION,
    reviewerNoteByOutput: {
      linkedin_post:
        "On linkedin_post: the firm is we. Do not treat a first-person singular author voice, or a third-person firm subject, as the voice of the firm.",
      press_release:
        "On press_release: the body is third person. First-person plural is correct only inside an attributed quotation. Do not flag first person that sits inside quotation marks with a named speaker. Flag first person in the body. There is no deterministic quote detector; this is instruction only.",
    },
  },
  {
    id: "overreach_unsupported_causal",
    category: "editorial",
    severity: "hard_concern",
    description:
      "The statement links two things with a causal word ('driven by', 'as a result of', 'because of', 'thanks to') and the source reports both without linking them. Correlation stated as causation. The question is whether the source carries the causal link. The note says what the source reports and that it does not link the two things. Do not say the draft does not establish the link, that the statement treats one thing as another, or that the link is without supporting context.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "underreach_hedging",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Stacked or redundant hedging that weakens a statement without adding precision: 'seems to suggest', 'may possibly indicate', 'could be interpreted as', 'appears to potentially', where two or more hedges do the work of one. Judge this from the CURRENT STATEMENT and the surrounding draft only. Whether a source makes the position clear is an Evidence matter and is not assessed here. Do not use the words evidence, source, supported, unsupported or substantiated in the note or the direction. You cannot see the source documents. Describe only what the CURRENT STATEMENT and the surrounding draft do or do not establish.",
    appliesTo: [...THREE],
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
    id: "cliche_and_filler",
    category: "editorial",
    severity: "soft_concern",
    description:
      "Clichés and empty filler phrases are flagged. Examples: 'at the end of the day', 'needless to say', 'it goes without saying', 'in today's environment', 'moving forward', 'when all is said and done', 'the bottom line is'.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
];
