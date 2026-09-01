/**
 * Fresh one-finding prompt. Shipped silence and B134 carve-out, copied as
 * prose. Does not import the abandoned Stage 1 prefix or the whole-draft reviser.
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
  const silent = silenceOnCard === true || finding?.sort?.silenceOnCard === true;
  const thing1 = finding?.thing1?.quote ? finding.thing1.quote : "(none)";

  return [
    "You propose one edit for one Review finding. Return JSON only.",
    "",
    "POLICY (inherited, not optional):",
    "Silence never edits. When the source is SILENT or vague on what the draft asserts, leave the CLAIM exactly as written. Do not soften the claim, do not drop a figure, do not cut the clause, do not substitute a different fact, do not strip the actor so that a judgement becomes an unattributed statement. Silence is the absence of evidence, not evidence against the claim, and the author decides what to do about the CLAIM.",
    `One operation is permitted on a silent card, and only this operation: replace a first-person subject or object (we / our / us) with ${org} as grammatical subject (or as the object, when the pronoun is an object). Change nothing else in the sentence. Never delete the actor.`,
    `  "We believe X" -> "${org} believes X"`,
    `  "we recommend the commitment" -> "${org} recommends the commitment"`,
    `  "available to us" -> "available to ${org}"`,
    `Never "X". Never "is believed". Never "is recommended". THE ACTOR STAYS. Do not recast into an agentless or passive construction such as "was attractive", "is considered", "is expected to", "it is noted that", or "is recommended". Removing the holder of an opinion turns a judgement into a statement of fact, and an unattributed evaluation in a compliance document is worse than a first-person one.`,
    `Preserve every hedge and modal exactly. "should deliver" stays "should deliver". "broadly in line with" stays. Only the grammatical subject or object pronoun changes. A first-person fix which makes a claim more confident is a failure of the rule, not a bonus.`,
    "Still forbidden on a silent card: deleting evaluative language (marketing_language_excess); neutralising a causal verb (overreach_unsupported_causal); removing a hedge or modal; substituting a different fact; completing a fragment; deleting a view-marker; or any other craft operation not named above.",
    "NEVER SUBSTITUTE A DIFFERENT FACT. Where the source is silent on what the draft asserts, do not replace the draft's claim with some other statement drawn from the source, however well supported that other statement is.",
    silent
      ? `This finding is on a SILENT card. If suggestedDirection asks for more than the first-person substitution, do only the substitution.`
      : "A source speaks to this claim. Follow the finding. Do not invent a value the source does not state.",
    "",
    `Authoring organisation: ${org}`,
    `This card is ${silent ? "SILENT" : "NOT silent"}.`,
    block("Original statement", finding?.statement),
    block("Offending original text (copied from Review)", thing1),
    block("What is wrong (copied from Review)", finding?.thing2),
    block("Suggested direction from Review (guidance only; policy wins)", finding?.suggestedDirection),
    finding?.kind === "evidence" ? block("Source excerpt", finding?.primaryExcerpt) : null,
    "",
    "Return a JSON object with exactly these keys:",
    "proposedChange: the replacement text, or a short instruction such as Delete 'phrase'.",
    "resultingSentence: the full sentence the user would get. Required. Not a description of the change.",
    "why: why that fix rather than another. Do not describe what you changed. The resulting sentence shows that.",
    "No markdown fences. No other keys.",
  ]
    .filter((line) => line != null)
    .join("\n");
}
