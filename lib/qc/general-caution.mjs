/**
 * B543. Six soft cautions for General writing. They replace investment compliance.
 * They are guidance, not legal advice, and they are never a hard red flag.
 */

export const CAUTION_RULES = Object.freeze([
  {
    id: "caution_promise",
    category: "compliance",
    severity: "soft_concern",
    label: "Caution",
    description: "A promise or a guarantee. Flag wording that promises or guarantees a result.",
  },
  {
    id: "caution_absolute",
    category: "compliance",
    severity: "soft_concern",
    label: "Caution",
    description: "An absolute claim without a basis in the sources. Flag words such as only, always, never, every, or the best, when the sources do not support that absolute.",
  },
  {
    id: "caution_prediction",
    category: "compliance",
    severity: "soft_concern",
    label: "Caution",
    description: "A prediction stated as a fact. Flag a future outcome written as if it has already been decided, when the sources do not say that.",
  },
  {
    id: "caution_advice",
    category: "compliance",
    severity: "soft_concern",
    label: "Caution",
    description: "Advice without a caveat. Flag a recommendation of what the reader should do when the sentence gives no caveat.",
  },
  {
    id: "caution_private_detail",
    category: "compliance",
    severity: "soft_concern",
    label: "Caution",
    appliesToVersion: ["public"],
    description: "A private or confidential detail in a text anyone may read. Flag a figure, name, or term the sources mark as private or confidential. This rule applies to Public texts only.",
  },
  {
    id: "caution_damaging_claim",
    category: "compliance",
    severity: "soft_concern",
    label: "Caution",
    description: "An unsupported damaging claim about a named party. Flag a negative claim about a named person or organisation that the sources do not support.",
  },
]);

export function isCautionRuleId(id) {
  return typeof id === "string" && id.startsWith("caution_");
}

/** The six rules, dropping the public-only rule when the text is Complete. */
export function cautionRulesForRun(visibility) {
  const raw = typeof visibility === "string" ? visibility.trim().toLowerCase() : "";
  const isPublic = raw === "public";
  return CAUTION_RULES.filter((rule) => isPublic || rule.id !== "caution_private_detail");
}
