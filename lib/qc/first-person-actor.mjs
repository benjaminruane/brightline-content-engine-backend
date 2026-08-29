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
  return resolveAuthoringOrganisationResolution({ argument: requestName }).name;
}

/**
 * Precedence: argument, then request, then AUTHORING_ORGANISATION, then null.
 * @param {{ argument?: unknown, request?: unknown }} [inputs]
 * @returns {{ name: string|null, source: "argument"|"request"|"env"|"default" }}
 */
export function resolveAuthoringOrganisationResolution(inputs = {}) {
  const fromArgument = trimAuthoringOrganisationName(inputs.argument);
  if (fromArgument) return { name: fromArgument, source: "argument" };
  const fromRequest = trimAuthoringOrganisationName(inputs.request);
  if (fromRequest) return { name: fromRequest, source: "request" };
  const fromEnv = trimAuthoringOrganisationName(process.env[AUTHORING_ORGANISATION_ENV]);
  if (fromEnv) return { name: fromEnv, source: "env" };
  return { name: DEFAULT_AUTHORING_ORGANISATION, source: "default" };
}

/**
 * One line per review. Reports the source, not just the value.
 * @param {{ argument?: unknown, request?: unknown }} [inputs]
 * @returns {{ name: string|null, source: "argument"|"request"|"env"|"default" }}
 */
export function logAuthoringOrganisationResolution(inputs = {}) {
  const resolved = resolveAuthoringOrganisationResolution(inputs);
  const value = resolved.name === null ? "null" : resolved.name;
  console.log(`[first-person-actor] authoring organisation resolved=${value} source=${resolved.source}`);
  return resolved;
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
  "Quote the first-person phrase and state the substitution with the named authoring organisation as subject or object. Evaluate the view-marker subject test after that substitution, not against the original wording. If the substitution makes the authoring organisation the grammatical subject, delete the parenthetical view-marker; do not convert it. Never name the organisation as subject and also convert a view-marker to that organisation in the same sentence. If the sentence subject is not that organisation, convert the marker to that organisation's view. Preserve every hedge and modal. Do not recast into an agentless or passive construction. If the authoring organisation cannot be named from the draft, keep the first-person wording and tell the reviewer the actor could not be named.";

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
 * IS THIS NAME THE AUTHOR'S OWN?
 *
 * Four separate sites have been found treating the configured authoring
 * organisation as an outside party, each discovered by accident. They all need
 * the same primitive, so it lives here, next to the resolver, rather than being
 * written a fifth time. What each site DOES with the answer stays local: one
 * suppresses a feature, one drops a particular, one picks a different anchor.
 *
 * Semantics match namedThirdPartiesIn, which established them at a5be4f0: a
 * name is the author's when it is the house name, or the house name followed by
 * further capitalised words that belong to it ("Halden Group Partners"). A
 * trailing possessive is ignored.
 *
 * Read-only and resolved at call time. Where no organisation is configured this
 * returns false for everything, so behaviour is unchanged.
 *
 * @param {unknown} name
 * @param {string|null} [houseName] Explicit override. Defaults to the resolver.
 * @returns {boolean}
 */
export function isAuthoringOrganisationName(name, houseName = undefined) {
  const key = String(name ?? "")
    .replace(/[\u2019']s\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!key) return false;
  const house =
    houseName === undefined ? resolveAuthoringOrganisationName() : trimAuthoringOrganisationName(houseName);
  const houseKey = house ? String(house).replace(/\s+/g, " ").trim().toLowerCase() : "";
  if (!houseKey) return false;
  return key === houseKey || key.startsWith(`${houseKey} `);
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

function escapeHouseRe(name) {
  return String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function leadingSubjectIsFirstPerson(statement) {
  return /^(?:On balance,\s*)?(?:we|We)\b/.test(String(statement || "").trim());
}

function directionNamesHouseAsSubject(direction, house) {
  const h = escapeHouseRe(house);
  return new RegExp(`\\b${h}\\s+(?:was|is|believes|recommends|notes)\\b`, "i").test(direction);
}

function directionConvertsViewMarker(direction, house) {
  const h = escapeHouseRe(house);
  return new RegExp(`in\\s+${h}'s\\s+view`, "i").test(direction);
}

/**
 * True when a first-person substitution in this statement will make the
 * authoring organisation the grammatical subject. The prompt already asks
 * the model to test the post-substitution sentence; this is the code check
 * because the model still tests the original "We".
 * @param {string} statement
 * @param {string} direction
 * @param {string} houseName
 * @returns {boolean}
 */
export function firstPersonSubstitutionMakesAuthorTheSubject(statement, direction, houseName) {
  const house = String(houseName || "").trim();
  if (!house) return false;
  if (leadingSubjectIsFirstPerson(statement)) return true;
  return directionNamesHouseAsSubject(direction, house);
}

function ensureAttractedSubject(statement, direction, house) {
  if (!/^\s*We were attracted\b/i.test(String(statement || ""))) return direction;
  const attracted = `${house} was attracted`;
  if (new RegExp(escapeHouseRe(attracted), "i").test(direction)) return direction;
  const weOnly = new RegExp(`Replace\\s+'We'\\s+with\\s+'${escapeHouseRe(house)}'`, "i");
  if (weOnly.test(direction)) {
    return direction.replace(weOnly, `Replace 'We were attracted' with '${attracted}'`);
  }
  return direction;
}

/**
 * If substitution will make the house the subject, a parenthetical view
 * marker for that house is redundant and must be deleted, not converted.
 * @param {string} statement
 * @param {string|null|undefined} direction
 * @param {string|null|undefined} houseName
 * @returns {string}
 */
export function boundViewMarkerSubjectDirection(statement, direction, houseName) {
  const original = typeof direction === "string" ? direction.trim() : "";
  const house = String(houseName || "").trim();
  if (!original || !house) return original;
  if (!firstPersonSubstitutionMakesAuthorTheSubject(statement, original, house)) {
    return original;
  }
  let next = original;
  if (directionConvertsViewMarker(next, house)) {
    const h = escapeHouseRe(house);
    const pair = new RegExp(
      `(?:and\\s+)?['"]in our view['"]\\s+with\\s+['"]in ${h}'s view['"]`,
      "i"
    );
    const changeTo = new RegExp(
      `(?:Change|Replace|Convert)\\s+['"]in our view['"]\\s+(?:to|with)\\s+['"]in ${h}'s view['"]\\.?`,
      "i"
    );
    if (pair.test(next)) {
      next = next.replace(pair, "and delete 'in our view'");
    } else if (changeTo.test(next)) {
      next = next.replace(changeTo, "Delete 'in our view'.");
    } else {
      next = next.replace(new RegExp(`in\\s+${h}'s\\s+view`, "gi"), "");
      if (!/delete\s+['"]in our view['"]/i.test(next)) {
        next = `${next.replace(/\.$/, "")} and delete 'in our view'.`;
      }
    }
  }
  next = ensureAttractedSubject(statement, next, house);
  next = next.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
  if (next !== original) {
    console.log("[first_person_actor] view-marker convert rewritten to delete");
  }
  return next;
}

/**
 * @param {object[]} concerns
 * @param {string} statementText
 * @param {string|null|undefined} houseName
 * @returns {object[]}
 */
export function applyViewMarkerSubjectBounds(concerns, statementText, houseName) {
  if (!Array.isArray(concerns)) return concerns;
  const statement = typeof statementText === "string" ? statementText : "";
  const house = String(houseName || "").trim();
  if (!house) return concerns;
  return concerns.map((concern) => {
    if (!isFirstPersonActorRule(concern?.concernCode, concern?.rule)) return concern;
    const direction =
      typeof concern?.suggestedDirection === "string" ? concern.suggestedDirection : "";
    const bounded = boundViewMarkerSubjectDirection(statement, direction, house);
    if (bounded === direction) return concern;
    const next = { ...concern, suggestedDirection: bounded };
    if (typeof next.suggestedRewrite === "string" && directionConvertsViewMarker(next.suggestedRewrite, house)) {
      delete next.suggestedRewrite;
    }
    return next;
  });
}
