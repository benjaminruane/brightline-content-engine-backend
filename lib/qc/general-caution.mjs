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

function sourceBlob(sources) {
  return (Array.isArray(sources) ? sources : [])
    .map((row) => {
      if (typeof row === "string") return row;
      if (row && typeof row === "object") {
        return typeof row.text === "string" ? row.text : typeof row.content === "string" ? row.content : "";
      }
      return "";
    })
    .join("\n")
    .toLowerCase();
}

function wordInSource(word, blob) {
  if (!blob) return false;
  return new RegExp(`\\b${word}\\b`, "i").test(blob);
}

function concern(code, note) {
  return { concernCode: code, note, category: "compliance" };
}

/**
 * The compliance model can return no violations for a sentence the rules name.
 * These checks run only for General writing, and only add a finding the sources do not already state.
 */
export function deterministicCautionConcerns(statementText, sources, { visibility } = {}) {
  const text = typeof statementText === "string" ? statementText : "";
  if (!text.trim()) return [];
  const blob = sourceBlob(sources);
  const out = [];
  const absoluteWords = [...text.matchAll(/\b(only|always|never|every|best)\b/gi)].map((match) => match[1].toLowerCase());
  const unsupported = [...new Set(absoluteWords)].filter((word) => {
    if (word === "best" && !/\bthe best\b/i.test(text)) return false;
    return !wordInSource(word, blob);
  });
  if (unsupported.length) {
    out.push(concern(
      "caution_absolute",
      `This states an absolute (${unsupported.join(", ")}) that the sources do not support.`
    ));
  }
  if (/\b(guarantee|guarantees|guaranteed|promise|promises|promised)\b/i.test(text)) {
    const promised = /\b(guarantee|guarantees|guaranteed)\b/i.test(text) ? "guarantee" : "promise";
    if (!wordInSource(promised, blob)) {
      out.push(concern("caution_promise", "This promises or guarantees a result the sources do not support."));
    }
  }
  const prediction = text.match(/\b(will definitely|is certain to|is sure to|is guaranteed to)\b/i);
  if (prediction && !blob.includes(prediction[1].toLowerCase())) {
    out.push(concern("caution_prediction", "This states a future outcome as a fact the sources do not support."));
  }
  if (/\b(you should|readers should|we recommend)\b/i.test(text) && !/\b(if|unless|consider|may|might|could)\b/i.test(text)) {
    out.push(concern("caution_advice", "This advises the reader without a caveat."));
  }
  const isPublic = String(visibility || "").trim().toLowerCase() === "public";
  if (isPublic) {
    const secretSentence = blob.split(/[.!?]/).find((sentence) => /\b(confidential|private)\b/.test(sentence));
    const repeatsSecretFigure = secretSentence
      ? (secretSentence.match(/\d[\d,]*/g) || []).some((figure) => figure.length >= 2 && text.includes(figure))
      : false;
    const saysSecret = /\b(confidential|private)\b/i.test(text)
      && !wordInSource("confidential", blob)
      && !wordInSource("private", blob);
    if (saysSecret || repeatsSecretFigure) {
      out.push(concern(
        "caution_private_detail",
        "This includes a private or confidential detail in a text anyone may read."
      ));
    }
  }
  const damaging = text.match(/\b(fraud|incompetent|corrupt|dishonest|negligent)\b/i);
  // AUTHOR-NAME-BLIND: a damaging claim about the authoring organisation is still a damaging claim. The sources have to support it, so the author is treated like any other named party.
  const namedParty = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(text);
  if (damaging && namedParty && !wordInSource(damaging[1].toLowerCase(), blob)) {
    out.push(concern(
      "caution_damaging_claim",
      "This makes a damaging claim about a named party that the sources do not support."
    ));
  }
  return out;
}

/** Empty unless this run is a General text. Investment compliance is unchanged. */
export function cautionFindingsForStatement(statementText, sources, options) {
  if (!options?.caution) return [];
  return deterministicCautionConcerns(statementText, sources, { visibility: options.visibility });
}
