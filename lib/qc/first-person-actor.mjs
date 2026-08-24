// lib/qc/first-person-actor.mjs
// Shared first-person removal contract for first_person_plural (style) and
// voice_consistency (editorial). Substitute the named actor; never delete them.

/**
 * House names we will treat as the authoring organisation when they already
 * appear in the draft. Presence is required: we never invent an actor, and we
 * never pick a Title-Case investment name (Meridian, Meridian Capital) just
 * because it looks like a firm. Partners Group is the current CLIENT house
 * name already used in style-guide examples. Add a name here only when that
 * firm is a known authoring client, not when a draft happens to mention it.
 */
export const HOUSE_AUTHORING_ORGANISATIONS = ["Partners Group"];

/**
 * Instruction shared by first_person_plural and voice_consistency so the two
 * rules cannot drift. Also injected into the combined editorial+style prompt.
 */
export const FIRST_PERSON_ACTOR_INSTRUCTION = `When first-person plural must be removed, replace the pronoun with the named authoring organisation as the grammatical subject (or as the object, when the pronoun is an object). Never delete the actor.

  "We were attracted to X" -> "Partners Group was attracted to X"
  "we believe the fund should Y" -> "Partners Group believes the fund should Y"
  "we recommend the commitment" -> "Partners Group recommends the commitment"
  "we would note that" -> "Partners Group notes that"
  "in our view" -> delete, or "in Partners Group's view"
  "available to us" -> "available to Partners Group"

Identify the authoring organisation only from a named firm already present in the draft, whose judgement the first-person pronouns express. Do not substitute the name of the investment, fund, or portfolio company. "Partners Group" in the examples above is illustrative only: use that name only when it actually appears in the draft. If that organisation cannot be identified confidently, leave the first-person wording in place, still raise the concern, and tell the reviewer that the actor could not be named. An unfixed style issue is far less harmful than a recast that turns a judgement into an unattributed statement of fact.

Do not recast into an agentless or passive construction such as "was attractive", "is considered", "is expected to", "it is noted that", or "is recommended". Removing the holder of an opinion turns a judgement into a statement of fact, and an unattributed evaluation in a compliance document is worse than a first-person one.

Preserve every hedge and modal exactly. "should deliver" stays "should deliver". "broadly in line with" stays. Only the grammatical subject or object pronoun changes. A first-person fix which makes a claim more confident is a failure of the rule, not a bonus.

This substitution applies only when the output type requires third-person. Do not apply it where first-person plural is the house voice.`;

export const FIRST_PERSON_ACTOR_FIX_DIRECTION =
  "Quote the first-person phrase and state the substitution with the named authoring organisation as subject or object. Preserve every hedge and modal. Do not recast into an agentless or passive construction. If the authoring organisation cannot be named from the draft, keep the first-person wording and tell the reviewer the actor could not be named.";

const AGENTLESS_RECAST_RES = [
  /\bwas attractive\b/i,
  /\bis considered\b/i,
  /\bare considered\b/i,
  /\bis expected to\b/i,
  /\bare expected to\b/i,
  /\bit is noted that\b/i,
  /\bis recommended\b/i,
  /\bare recommended\b/i,
];

const FIRST_PERSON_ACTOR_RULE_IDS = new Set(["first_person_plural", "voice_consistency"]);

/**
 * @param {string|null|undefined} draftText
 * @returns {string|null} Canonical house name, or null if none is present.
 */
export function identifyAuthoringOrganisation(draftText) {
  const text = String(draftText || "");
  if (!text.trim()) return null;
  for (const name of HOUSE_AUTHORING_ORGANISATIONS) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(text)) return name;
  }
  return null;
}

/**
 * User-payload block. Names the actor only when that exact house name is
 * already in the draft. Otherwise instructs flag-without-recast.
 * @param {string|null|undefined} draftText
 * @returns {string}
 */
export function formatAuthoringOrganisationPromptBlock(draftText) {
  const name = identifyAuthoringOrganisation(draftText);
  if (name) {
    return (
      `AUTHORING ORGANISATION: ${name}\n` +
      `The draft names ${name}. When removing first-person pronouns, substitute "${name}" as the grammatical subject or object. Do not use the name of the investment, fund, or portfolio company.`
    );
  }
  return (
    "AUTHORING ORGANISATION: not identified in this draft.\n" +
    "If the CURRENT STATEMENT uses first-person plural, raise the concern and leave the first-person wording unchanged. Tell the reviewer that the actor could not be named. Do not recast into an agentless or passive construction, and do not invent a firm name."
  );
}

/**
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isAgentlessFirstPersonRecast(text) {
  const t = String(text || "");
  if (!t.trim()) return false;
  return AGENTLESS_RECAST_RES.some((re) => re.test(t));
}

/**
 * @param {string|null|undefined} concernCode
 * @param {string|null|undefined} rule
 * @returns {boolean}
 */
export function isFirstPersonActorRule(concernCode, rule) {
  const a = typeof concernCode === "string" ? concernCode.trim() : "";
  const b = typeof rule === "string" ? rule.trim() : "";
  return FIRST_PERSON_ACTOR_RULE_IDS.has(a) || FIRST_PERSON_ACTOR_RULE_IDS.has(b);
}

/**
 * Hedges that a first-person fix must keep. "we would note" -> "notes" is the
 * specified example, so "would" is not required on that construction.
 * @param {string} original
 * @param {string} candidate
 * @returns {string[]} hedge labels that were dropped
 */
export function droppedModalityHedges(original, candidate) {
  const src = String(original || "");
  const dst = String(candidate || "");
  if (!src.trim() || !dst.trim()) return [];
  const dropped = [];
  if (/\bshould\b/i.test(src) && !/\bshould\b/i.test(dst)) dropped.push("should");
  if (/\bbroadly in line with\b/i.test(src) && !/\bbroadly in line with\b/i.test(dst)) {
    dropped.push("broadly in line with");
  }
  return dropped;
}

/**
 * True when the suggestion keeps first person because the actor could not be named.
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isLeaveFirstPersonInPlaceDirection(text) {
  const t = String(text || "");
  if (!t.trim()) return false;
  return (
    /leave the first-person wording unchanged/i.test(t) ||
    /actor could not be named/i.test(t)
  );
}
