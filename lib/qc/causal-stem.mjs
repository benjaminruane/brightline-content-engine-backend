/**
 * B372 Part 1. Compare closed causal connectives by relation, not spelling.
 * Suffix rule over tokens on CAUSAL_CONNECTIVES only. No stemmer package.
 * "driven by" and "driving" share the same relation key.
 */

const FUNCTION_WORDS = new Set(["by", "to", "of", "as", "a", "an", "the", "on", "from", "due"]);

function asText(value) {
  return typeof value === "string" ? value : "";
}

/**
 * Inflection only. Do not treat this as a general stemmer.
 * driven -> driv, driving -> driv, helped -> help, resulting -> result.
 */
export function stemConnectiveToken(word) {
  const w = asText(word).toLowerCase().replace(/[^a-z]/g, "");
  if (w.length < 4) return w;
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ied") && w.length > 5) return `${w.slice(0, -3)}y`;
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("en") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 4 && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/**
 * Head verb of a list connective, after dropping closed prepositions.
 */
export function causalRelationKey(connective) {
  const words = asText(connective)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !FUNCTION_WORDS.has(w));
  const head = words[0] || "";
  return stemConnectiveToken(head);
}

function passageWords(text) {
  return asText(text)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * True when a passage carries the same causal relation as the list connective.
 * Stems only list tokens and candidate passage words under the same suffix
 * rule. Does not stem the passage as a document.
 */
export function passageHasCausalRelation(connective, passage) {
  const key = causalRelationKey(connective);
  if (!key) return false;
  for (const word of passageWords(passage)) {
    if (stemConnectiveToken(word) === key) return true;
  }
  return false;
}
