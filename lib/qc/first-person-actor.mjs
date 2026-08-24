// lib/qc/first-person-actor.mjs
// Shared first-person removal contract for first_person_plural (style) and
// voice_consistency (editorial). Substitute the named actor; never delete them.

/**
 * There is no default house name. A previous default fired on every production
 * review, and any draft that merely mentioned that firm passed the presence
 * check and had it substituted as the author. The check cannot tell an
 * authoring firm from a firm being written about, so the only safe default
 * is none. Unset and unsupplied resolve to null and take the existing
 * not-identified fallback.
 */
export const DEFAULT_AUTHORING_ORGANISATION = null;

/** Neutral worked-example name when no organisation has been supplied. */
export const AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER = "the authoring organisation";

/** Process env key. Empty or whitespace resolves to null. */
export const AUTHORING_ORGANISATION_ENV = "AUTHORING_ORGANISATION";

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function trimAuthoringOrganisationName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Call-time resolution so a harness can set the env var after process start
 * and still be seen, without importing a frozen list.
 * Precedence: requestName, then AUTHORING_ORGANISATION, then null.
 * Explicit houseName on identifyAuthoringOrganisation / formatAuthoringOrganisationPromptBlock
 * / buildFirstPersonActorInstruction still wins over this function.
 * @param {unknown} [requestName]
 * @returns {string|null}
 */
export function resolveAuthoringOrganisationName(requestName) {
  const fromRequest = trimAuthoringOrganisationName(requestName);
  if (fromRequest) return fromRequest;
  return trimAuthoringOrganisationName(process.env[AUTHORING_ORGANISATION_ENV]);
}

/**
 * Name used in worked examples. Never invent a real firm.
 * @param {unknown} houseName
 * @returns {string}
 */
export function exampleAuthoringOrganisationName(houseName) {
  return trimAuthoringOrganisationName(houseName) || AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER;
}

/**
 * @param {string|null|undefined} [houseName]
 * @returns {string}
 */
export function buildFirstPersonActorInstruction(houseName = resolveAuthoringOrganisationName()) {
  const house = exampleAuthoringOrganisationName(houseName);
  const possessive = `${house}'s`;
  return `When first-person plural must be removed, replace the pronoun with the named authoring organisation as the grammatical subject (or as the object, when the pronoun is an object). Never delete the actor.

  "We were attracted to X" -> "${house} was attracted to X"
  "we believe the fund should Y" -> "${house} believes the fund should Y"
  "we recommend the commitment" -> "${house} recommends the commitment"
  "we would note that" -> "${house} notes that"
  "available to us" -> "available to ${house}"

Every judgement keeps an owner. A parenthetical view-marker such as "in our view", "in our opinion", "we think", or "to our mind" is not itself the actor; it is an extra attribution of the same judgement. Apply the test to the sentence after any first-person subject in that sentence has already been substituted.

If that sentence subject is the authoring organisation, delete the marker. The sentence already attributes the judgement. A marker that repeats an owner the sentence already has is redundant rather than protective.
  "${house} was attracted to X on the strength of a track record that is, in our view, exceptional" -> "${house} was attracted to X on the strength of a track record that is exceptional"

If that sentence subject is not the authoring organisation, convert the marker. Removing it would leave an unattributed judgement.
  "The pipeline is, in our view, thin" -> "The pipeline is, in ${possessive} view, thin"

The authoring organisation is given to you, or it is not. When it is given, it has already been confirmed to appear in the draft. Never infer one. Do not substitute the name of the investment, fund, or portfolio company. If it is not given, leave the first-person wording in place, still raise the concern, and tell the reviewer that the actor could not be named. An unfixed style issue is far less harmful than a recast that turns a judgement into an unattributed statement of fact.

Do not recast into an agentless or passive construction such as "was attractive", "is considered", "is expected to", "it is noted that", or "is recommended". Removing the holder of an opinion turns a judgement into a statement of fact, and an unattributed evaluation in a compliance document is worse than a first-person one.

Preserve every hedge and modal exactly. "should deliver" stays "should deliver". "broadly in line with" stays. Only the grammatical subject or object pronoun changes, except for a parenthetical view-marker: delete it when the sentence subject is already the authoring organisation, and convert it when it is not. A first-person fix which makes a claim more confident is a failure of the rule, not a bonus.

This substitution applies only when the output type requires third-person. Do not apply it where first-person plural is the house voice.`;
}

/**
 * Instruction shared by first_person_plural and voice_consistency so the two
 * rules cannot drift. Static rulebook copy uses the placeholder. Live prompts
 * rebuild via buildFirstPersonActorInstruction with the per-call resolved name.
 */
export const FIRST_PERSON_ACTOR_INSTRUCTION = buildFirstPersonActorInstruction(null);

export const FIRST_PERSON_ACTOR_FIX_DIRECTION =
  "Quote the first-person phrase and state the substitution with the named authoring organisation as subject or object. After that substitution, if a parenthetical view-marker remains and the sentence subject is already that organisation, delete the marker; if the sentence subject is not that organisation, convert the marker to that organisation's view. Preserve every hedge and modal. Do not recast into an agentless or passive construction. If the authoring organisation cannot be named from the draft, keep the first-person wording and tell the reviewer the actor could not be named.";

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
 * @param {string} name
 * @returns {RegExp}
 */
function houseNameRe(name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

/**
 * Presence check only. Does not scrape a name from the draft.
 * Returns the supplied/configured name when that exact name is already in the
 * draft; otherwise null. An empty name is null. Do not loosen this.
 * @param {string|null|undefined} draftText
 * @param {string|null} [houseName] Explicit override. Defaults to resolveAuthoringOrganisationName().
 * @returns {string|null} Canonical house name, or null if none is present.
 */
export function identifyAuthoringOrganisation(draftText, houseName = resolveAuthoringOrganisationName()) {
  const text = String(draftText || "");
  if (!text.trim()) return null;
  const name = String(houseName || "").trim();
  if (!name) return null;
  if (houseNameRe(name).test(text)) return name;
  return null;
}

/**
 * User-payload block. Names the actor only when that exact house name is
 * already in the draft. Otherwise instructs flag-without-recast.
 * @param {string|null|undefined} draftText
 * @param {string|null} [houseName]
 * @returns {string}
 */
export function formatAuthoringOrganisationPromptBlock(
  draftText,
  houseName = resolveAuthoringOrganisationName()
) {
  const name = identifyAuthoringOrganisation(draftText, houseName);
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
