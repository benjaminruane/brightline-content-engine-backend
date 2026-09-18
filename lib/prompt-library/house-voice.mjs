/**
 * Single source of truth for house voice per output type.
 * Frontend mirror: src/constants/houseVoice.js
 * Do not restate person for an output type in any other file.
 */

export const HOUSE_VOICE_TABLE = Object.freeze([
  Object.freeze({ slug: "reporting_commentary", person: "third person" }),
  Object.freeze({ slug: "investor_letter", person: "first person plural" }),
  Object.freeze({ slug: "linkedin_post", person: "first person plural" }),
  Object.freeze({ slug: "press_release", person: "third person" }),
]);

const PERSON_BY_SLUG = Object.freeze(
  Object.fromEntries(HOUSE_VOICE_TABLE.map((row) => [row.slug, row.person]))
);

export const FIRST_PERSON_HOUSE_VOICE_SLUGS = Object.freeze(
  HOUSE_VOICE_TABLE.filter((row) => row.person === "first person plural").map((row) => row.slug)
);

export const THIRD_PERSON_HOUSE_VOICE_SLUGS = Object.freeze(
  HOUSE_VOICE_TABLE.filter((row) => row.person === "third person").map((row) => row.slug)
);

const SLUG_LABELS = Object.freeze({
  reporting_commentary: "Reporting commentary",
  investor_letter: "Investor letters",
  linkedin_post: "LinkedIn posts",
  press_release: "Press releases",
});

/**
 * @param {unknown} outputType slug or OUTPUT_TYPE enum
 * @returns {string}
 */
export function houseVoiceSlug(outputType) {
  const raw = String(outputType || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (Object.prototype.hasOwnProperty.call(PERSON_BY_SLUG, raw)) return raw;
  return "";
}

/**
 * @param {unknown} outputType
 * @returns {string}
 */
export function houseVoicePerson(outputType) {
  const slug = houseVoiceSlug(outputType);
  return PERSON_BY_SLUG[slug] || "";
}

/**
 * @param {unknown} outputType
 * @returns {boolean}
 */
export function houseVoiceIsThirdPerson(outputType) {
  return houseVoicePerson(outputType) === "third person";
}

/**
 * @param {unknown} outputType
 * @returns {boolean}
 */
export function houseVoiceIsFirstPersonPlural(outputType) {
  return houseVoicePerson(outputType) === "first person plural";
}

function joinList(labels) {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/**
 * Shared editorial prose. Built from HOUSE_VOICE_TABLE so callers do not
 * name person per type in their own words.
 * @returns {string}
 */
export function houseVoiceEditorialProse() {
  const third = HOUSE_VOICE_TABLE.filter((row) => row.person === "third person").map(
    (row) => SLUG_LABELS[row.slug]
  );
  const first = HOUSE_VOICE_TABLE.filter((row) => row.person === "first person plural").map(
    (row) => SLUG_LABELS[row.slug]
  );
  return `${joinList(third)} use third-person. ${joinList(first)} use first-person plural (we, our).`;
}

/**
 * Shared style-guide prose. Built from HOUSE_VOICE_TABLE.
 * @returns {string}
 */
export function houseVoiceStyleGuideProse() {
  const first = FIRST_PERSON_HOUSE_VOICE_SLUGS.join(", ");
  const third = THIRD_PERSON_HOUSE_VOICE_SLUGS.join(", ");
  return `First-person plural (we, our, us, ours) is acceptable in ${first}. It is not acceptable in ${third}.`;
}

/**
 * One tone/voice line for writing prompts. Built from HOUSE_VOICE_TABLE.
 * @param {unknown} outputType
 * @returns {string}
 */
export function houseVoiceWritingLine(outputType) {
  const slug = houseVoiceSlug(outputType);
  if (slug === "press_release") {
    return "Factual, third-person in the body, concise; suitable for external distribution. First-person plural is correct only inside an attributed quotation.";
  }
  if (slug === "investor_letter") {
    return "First-person plural for the GP's voice (we believe, we expect, we view).";
  }
  if (slug === "linkedin_post") {
    return "First-person plural (we, our) for the firm's voice.";
  }
  if (slug === "reporting_commentary") {
    return "Third-person by default (the firm, the company, it, they).";
  }
  return "";
}

/**
 * Compact person instruction for getPromptGuidance.
 * @param {unknown} outputType
 * @returns {string}
 */
export function houseVoicePromptGuidance(outputType) {
  const slug = houseVoiceSlug(outputType);
  if (slug === "press_release") {
    return "Use third-person in the body. First-person plural is correct only inside an attributed quotation.";
  }
  if (houseVoiceIsFirstPersonPlural(slug)) {
    return "Use first-person plural for the GP's voice (we, our).";
  }
  if (houseVoiceIsThirdPerson(slug)) {
    return "Use third-person (the firm, the company).";
  }
  return "";
}
