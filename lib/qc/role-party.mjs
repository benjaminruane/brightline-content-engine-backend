/**
 * B363. Where a draft and a displayed quote each name exactly one party
 * after the same role preposition, and those names are not the same word,
 * the card says so. Exact comparison. No similarity score. Any ambiguity
 * stands down.
 */
function asText(value) {
  return typeof value === "string" ? value : "";
}

export const ROLE_PREPOSITIONS = ["from", "to", "by", "with"];

function stripPossessive(token) {
  return asText(token).replace(/['’]s$/i, "");
}

function normalizeRoleName(token) {
  return stripPossessive(asText(token).trim()).toLowerCase();
}

// AUTHOR-NAME-BLIND: this regex collects the party that immediately follows a
// role preposition in the draft or a displayed quote. The authoring
// organisation is a legitimate counterparty when either side names it after
// from/to/by/with. Excluding it would hide a mismatch where the draft names
// 3i and the quote names GIC, and would invent a mismatch where both name 3i.
const TITLE_CASE_RUN = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}(?=[^A-Za-z]|$)/;
const ALL_CAPS = /^[A-Z]{2,}(?=[^A-Za-z]|$)/;
const DIGIT_INITIAL = /^\d+[A-Za-z][A-Za-z0-9]*(?=[^A-Za-z0-9]|$)/;

const CLOSED_SINGLETON = new Set(
  [
    "a",
    "an",
    "the",
    "this",
    "that",
    "these",
    "those",
    "there",
    "here",
    "in",
    "on",
    "at",
    "by",
    "to",
    "of",
    "as",
    "or",
    "if",
    "and",
    "but",
    "for",
    "nor",
    "yet",
    "not",
    "so",
    "from",
    "with",
    "into",
    "over",
    "after",
    "before",
    "once",
    "when",
    "what",
    "which",
    "while",
    "where",
    "some",
    "many",
    "most",
    "such",
    "other",
    "every",
    "each",
    "both",
    "also",
    "then",
    "thus",
    "our",
    "we",
    "us",
    "i",
    "they",
    "them",
    "their",
    "its",
    "his",
    "her",
    "she",
    "he",
    "him",
    "who",
    "whom",
    "how",
    "why",
    "net",
    "per",
    "year",
    "date",
    "new",
    "first",
    "second",
    "third",
    "total",
    "like",
    "looking",
    "meanwhile",
    "subsequently",
    "elsewhere",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((w) => w.toLowerCase())
);

function isClosedSingleton(name) {
  const tokens = asText(name).split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return false;
  return CLOSED_SINGLETON.has(tokens[0].toLowerCase());
}

/**
 * The name sitting at index, or null. Title-Case run, all-caps of two or
 * more characters, or a digit-initial token (3i). Closed singletons are
 * not names.
 */
export function readPartyNameAt(text, index) {
  const slice = asText(text).slice(index);
  if (!slice) return null;
  let best = "";
  for (const re of [TITLE_CASE_RUN, ALL_CAPS, DIGIT_INITIAL]) {
    const m = re.exec(slice);
    if (m && m[0].length > best.length) best = m[0];
  }
  if (!best) return null;
  if (isClosedSingleton(best)) return null;
  return best;
}

export function namesAfterPreposition(text, preposition) {
  const t = asText(text);
  const prep = asText(preposition).trim();
  if (!t || !prep) return [];
  const re = new RegExp(`\\b${prep}\\s+`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(t))) {
    const name = readPartyNameAt(t, m.index + m[0].length);
    if (!name) continue;
    out.push({ raw: name, key: normalizeRoleName(name) });
  }
  return out;
}

/**
 * Null when the check stands down. One hit when exactly one preposition
 * has exactly one name on the statement, exactly one name in the displayed
 * quotes, and those names are not equal.
 */
export function rolePartyMismatch({ statement, displayedPassages } = {}) {
  const passages = Array.isArray(displayedPassages) ? displayedPassages : [];
  const fires = [];
  for (const prep of ROLE_PREPOSITIONS) {
    const draft = namesAfterPreposition(statement, prep);
    const quoted = [];
    for (const passage of passages) {
      quoted.push(...namesAfterPreposition(passage, prep));
    }
    if (draft.length !== 1 || quoted.length !== 1) continue;
    if (draft[0].key === quoted[0].key) continue;
    fires.push({
      preposition: prep,
      draftParty: draft[0].raw,
      sourceParty: quoted[0].raw,
    });
  }
  if (fires.length !== 1) return null;
  return fires[0];
}

const ROLE_SENTENCE = (draftParty, sourceParty) =>
  `The statement attributes this to ${draftParty}; the source credits ${sourceParty}.`;

/**
 * Assembly helper. Null when the check stands down or must not run.
 * Does not change a verdict that is already not green. A supported_full
 * card is displayed as conflict, because the quotes name a different party.
 */
export function applyRolePartyCheck({
  statement,
  displayedPassages,
  displayVerdict,
  commentaryNotReviewed,
  evidenceSummary,
} = {}) {
  if (commentaryNotReviewed === true) return null;
  if (displayVerdict === "unverifiable") return null;
  const mismatch = rolePartyMismatch({ statement, displayedPassages });
  if (!mismatch) return null;
  const sentence = ROLE_SENTENCE(mismatch.draftParty, mismatch.sourceParty);
  const summary = asText(evidenceSummary);
  const body = summary.replace(/^\s+/, "");
  const nextSummary = body ? `${sentence} ${body}` : sentence;
  const alreadyNonGreen = displayVerdict === "conflict" || displayVerdict === "supported_partial";
  return {
    preposition: mismatch.preposition,
    draftParty: mismatch.draftParty,
    sourceParty: mismatch.sourceParty,
    sentence,
    evidenceSummary: nextSummary,
    displayVerdict: alreadyNonGreen ? displayVerdict : "conflict",
    concernLevel: alreadyNonGreen ? null : "high",
    displayVerdictReason: alreadyNonGreen ? null : "role_party_mismatch",
    demoted: !alreadyNonGreen,
  };
}
