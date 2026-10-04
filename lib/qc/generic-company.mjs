/**
 * B372 Part 2. What "the company" refers to.
 * Resolve only to suppress a finding. Never creates a finding, never
 * moves a verdict toward conflict, never asserts support on a card that
 * was silent. If the guess is wrong the helper returns null and the card
 * is unchanged.
 *
 * Lookback: the immediately preceding statement only. The confirming
 * passage must name that party and must itself use "the company". Two
 * companies between the reference and its real antecedent fail that
 * passage check, so the card stays as it is.
 */

import { splitSentences } from "./card-honesty.mjs";
import { sourceNameVocabulary } from "./actor-of-the-action.mjs";
import { isBareNonParty } from "./party-tokens.mjs";

function asText(value) {
  return typeof value === "string" ? value : "";
}

function escapeRe(value) {
  return asText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function partyKey(name) {
  return asText(name)
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/['’]s$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const GENERIC_SUBJECT_RE = /^(?:the\s+company|the\s+firm|the\s+group)\b/i;

export function isGenericCompanySubject(statement) {
  return GENERIC_SUBJECT_RE.test(asText(statement).trim());
}

/**
 * Sentence-initial "The company" (lowercase company) is not the defined term.
 * "the Company" / "The Company" is.
 */
export function usesDefinedCompanyForm(statement) {
  return /\b[Tt]he Company\b/.test(asText(statement));
}

function isGenericVocabName(name) {
  const key = partyKey(name);
  return key === "company" || key === "firm" || key === "group";
}

function isAcronymName(name) {
  return /^[A-Z]{2,}$/.test(asText(name).trim());
}

function isAntecedentCandidate(name) {
  const raw = asText(name).trim();
  if (raw.length < 2) return false;
  if (isGenericVocabName(raw)) return false;
  if (isBareNonParty(raw)) return false;
  if (isAcronymName(raw)) return false;
  return true;
}

export function partiesNamedIn(text, vocabulary) {
  const t = asText(text);
  if (!t.trim()) return [];
  const vocab = vocabulary instanceof Set ? vocabulary : new Set(vocabulary || []);
  const names = [...vocab].sort((a, b) => asText(b).length - asText(a).length);
  const found = [];
  const seen = new Set();
  for (const name of names) {
    if (!isAntecedentCandidate(name)) continue;
    const raw = asText(name).trim();
    const re = new RegExp(`\\b${escapeRe(raw)}\\b`);
    if (!re.test(t)) continue;
    const key = partyKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    found.push(raw);
  }
  return found;
}

function passagesText(passages) {
  return (Array.isArray(passages) ? passages : [])
    .map((p) => asText(p))
    .filter(Boolean)
    .join(" ");
}

/**
 * Unique antecedent, or null. Preceding statement must name exactly one
 * source-vocabulary party, and the confirming passage must carry that
 * party and the same generic.
 */
export function resolveGenericCompanyAntecedent({
  statement,
  precedingText,
  vocabulary,
  confirmingPassages,
} = {}) {
  if (!isGenericCompanySubject(statement)) return null;
  if (usesDefinedCompanyForm(statement)) return null;
  const parties = partiesNamedIn(precedingText, vocabulary);
  if (parties.length !== 1) return null;
  const name = parties[0];
  const hay = passagesText(confirmingPassages);
  if (!hay.trim()) return null;
  if (!new RegExp(`\\b${escapeRe(name)}\\b`, "i").test(hay)) return null;
  if (!/\bthe company\b/i.test(hay)) return null;
  return name;
}

function stripGapSentences(summary) {
  const sentences = splitSentences(asText(summary));
  const kept = sentences.filter((s) => {
    const t = asText(s).trim();
    if (!t) return false;
    if (/\bhowever\b/i.test(t) && /\bnot\b/i.test(t)) return false;
    return true;
  });
  return kept.join("").replace(/\s+/g, " ").trim();
}

/**
 * Lift a leftover partial to confirmed when the generic resolves.
 * Stands down on conflict, on a named check slug, and when resolution fails.
 */
export function applyGenericCompanySuppress({
  statement,
  precedingText,
  sources,
  confirmingPassages,
  displayVerdict,
  displayVerdictReason,
  evidenceSummary,
} = {}) {
  if (displayVerdict !== "supported_partial") return null;
  if (displayVerdictReason) return null;
  const vocabulary = sourceNameVocabulary(sources);
  const antecedent = resolveGenericCompanyAntecedent({
    statement,
    precedingText,
    vocabulary,
    confirmingPassages,
  });
  if (!antecedent) return null;
  return {
    antecedent,
    displayVerdict: "supported_full",
    concernLevel: "none",
    evidenceSummary: stripGapSentences(evidenceSummary),
  };
}
