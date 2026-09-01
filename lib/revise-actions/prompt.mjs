/**
 * One-finding prompt. Operational constraints in plain language.
 * Does not name internal labels the model would echo into user-facing copy.
 */
import {
  AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER,
  resolveAuthoringOrganisationName,
} from "../qc/first-person-actor.mjs";

function orgName(authoringOrganisation) {
  return resolveAuthoringOrganisationName(authoringOrganisation) || AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER;
}

function block(label, value) {
  const text = value == null ? "" : String(value);
  return `${label}:\n${text.trim() ? text.trim() : "(none)"}`;
}

export function buildFindingPrompt(finding, { authoringOrganisation, silenceOnCard } = {}) {
  const org = orgName(authoringOrganisation);
  const noSourceSpeaks = silenceOnCard === true || finding?.sort?.silenceOnCard === true;
  const thing1 = finding?.thing1?.quote ? finding.thing1.quote : "(none)";

  return [
    "You propose one edit for one Review finding. Return JSON only.",
    "",
    "Rules for this edit:",
    "When no supplied source speaks to what the draft asserts, leave the substance of the claim. Do not soften it, do not drop a figure, do not cut the clause, do not substitute a different fact, do not strip the actor so that a judgement becomes an unattributed statement. The author decides what to do about the claim.",
    `One operation is then permitted, and only this operation: replace a first-person subject or object (we / our / us) with ${org} as grammatical subject (or as the object, when the pronoun is an object). Change nothing else in the sentence. Never delete the actor.`,
    `  "We believe X" -> "${org} believes X"`,
    `  "we recommend the commitment" -> "${org} recommends the commitment"`,
    `  "available to us" -> "available to ${org}"`,
    `Never "X". Never "is believed". Never "is recommended". THE ACTOR STAYS. Do not recast into an agentless or passive construction such as "was attractive", "is considered", "is expected to", "it is noted that", or "is recommended". Removing the holder of an opinion turns a judgement into a statement of fact, and an unattributed evaluation in a compliance document is worse than a first-person one.`,
    `Keep every hedge and modal. "should deliver" stays "should deliver". "broadly in line with" stays. Only the grammatical subject or object pronoun changes. A first-person fix which makes a claim more confident is a failure of the rule, not a bonus.`,
    "Still forbidden when no source speaks to the claim: deleting evaluative language; softening a causal verb; removing a hedge or modal; substituting a different fact; completing a fragment; deleting a view-marker; or any other craft operation not named above.",
    "NEVER SUBSTITUTE A DIFFERENT FACT. Where no source speaks to what the draft asserts, do not replace the draft's claim with some other statement drawn from the source, however well supported that other statement is.",
    noSourceSpeaks
      ? "No source in the pack speaks to this claim. If Review's suggested direction asks for more than the first-person substitution, do only the substitution."
      : "A source in the pack speaks to this claim. Follow the finding. Do not invent a value the source does not state.",
    "",
    `Authoring organisation: ${org}`,
    noSourceSpeaks
      ? "No source in the pack speaks to this claim."
      : "A source in the pack speaks to this claim.",
    block("Original statement", finding?.statement),
    block("Offending original text (copied from Review)", thing1),
    block("What is wrong (copied from Review)", finding?.thing2),
    block(
      "Review's suggested direction (guidance only; the rules above win)",
      finding?.suggestedDirection
    ),
    finding?.kind === "evidence" ? block("Source excerpt", finding?.primaryExcerpt) : null,
    "",
    "Return a JSON object with exactly these keys:",
    "proposedChange: the replacement text, or a short instruction such as Delete 'phrase'.",
    "resultingSentence: the full sentence the user would get. Required. Not a description of the change.",
    "why: why that fix rather than another. You may describe the change. If something is kept, name the substance (the claim, the hedge, the actor), not the wording. Do not say the original wording was kept intact, or that the claim is exactly as written, when words changed. Write for a reader who has never seen the internals.",
    "No markdown fences. No other keys.",
  ]
    .filter((line) => line != null)
    .join("\n");
}
