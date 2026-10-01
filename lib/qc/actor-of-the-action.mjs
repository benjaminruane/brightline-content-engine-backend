/**
 * B354 Part 3. Did this name do this.
 * Deterministic. No flag. The cast of recognised names comes from the
 * source documents, not the draft. Equality is an exact normalised match
 * after stripping a trailing possessive. Do not use the Jaccard name
 * matcher in conflict-engagement; its 0.6 threshold is unmeasured.
 */

function asText(value) {
  return typeof value === "string" ? value : "";
}

function sourceText(source) {
  if (typeof source === "string") return source;
  if (source && typeof source.text === "string") return source.text;
  return "";
}

function stripPossessive(token) {
  return asText(token).replace(/['’]s$/i, "");
}

function normalizeName(token) {
  return stripPossessive(asText(token).trim());
}

// AUTHOR-NAME-BLIND: this regex collects the source's cast of parties so we
// can ask which of those names did the thing. The authoring organisation is
// a legitimate actor when the source credits it. Excluding it would hide a
// mismatch where the draft names 3i and the source names Action, and would
// invent a mismatch where both sides credit 3i.
const TITLE_CASE_RUN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g;
const ALL_CAPS = /\b[A-Z]{2,}\b/g;
const DIGIT_INITIAL = /\b\d+[A-Za-z][A-Za-z0-9]*\b/g;
const FIRST_PERSON = /^(i|we|us|our|ours)$/i;

/**
 * One-token Title Case includes sentence-initial "The" / "In" / months.
 * Those are not parties. Multi-word runs, all-caps (MAIT), and digit-initial
 * (3i) are never skipped. Action is six letters and is kept.
 */
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

function collectNamesFromText(text, into) {
  const t = asText(text);
  if (!t) return;
  for (const re of [TITLE_CASE_RUN, ALL_CAPS, DIGIT_INITIAL]) {
    const copy = new RegExp(re.source, "g");
    let m;
    while ((m = copy.exec(t))) {
      const name = normalizeName(m[0]);
      if (!name) continue;
      if (isClosedSingleton(name)) continue;
      into.add(name);
    }
  }
}

/**
 * Cast of recognised names from SOURCE documents only.
 */
export function sourceNameVocabulary(sources) {
  const into = new Set();
  for (const source of Array.isArray(sources) ? sources : []) {
    collectNamesFromText(sourceText(source), into);
  }
  return into;
}

function leadingWords(text) {
  const t = asText(text);
  const out = [];
  for (const raw of t.split(/\s+/).filter(Boolean)) {
    const w = raw.replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9'’]+$/, "");
    if (w) out.push(w);
    if (out.length >= 6) break;
  }
  return out;
}

function namesInLeadingWords(words, vocabulary) {
  const windowWords = (Array.isArray(words) ? words : []).slice(0, 6).map(normalizeName);
  const found = [];
  const seen = new Set();
  const vocab = vocabulary instanceof Set ? vocabulary : new Set(vocabulary || []);
  for (const name of vocab) {
    const nameTokens = normalizeName(name).split(/\s+/).filter(Boolean);
    if (nameTokens.length === 0) continue;
    for (let i = 0; i <= windowWords.length - nameTokens.length; i++) {
      const slice = windowWords.slice(i, i + nameTokens.length);
      let ok = true;
      for (let j = 0; j < nameTokens.length; j++) {
        if (slice[j] !== nameTokens[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const key = nameTokens.join(" ");
        if (!seen.has(key)) {
          seen.add(key);
          found.push(name);
        }
        break;
      }
    }
  }
  return found;
}

/**
 * Look only at the first six words. Exactly one distinct vocabulary name
 * yields { actor }. Otherwise { standDown } for zero names, two or more
 * distinct names, or a first-person pronoun.
 */
export function leadingActor(text, vocabulary) {
  const words = leadingWords(text);
  if (words.some((w) => FIRST_PERSON.test(stripPossessive(w)))) {
    return { standDown: "first_person" };
  }
  const names = namesInLeadingWords(words, vocabulary);
  if (names.length === 0) return { standDown: "no_actor" };
  if (names.length >= 2) return { standDown: "ambiguous_actor" };
  return { actor: names[0] };
}

/**
 * Stand down (null) when there is no confirming passage, either side
 * stands down, or the two actors are equal after normalisation.
 * Otherwise { draftParty, sourceParty }.
 */
export function actorMismatch({ statement, confirmingPassage, sources } = {}) {
  const passage = asText(confirmingPassage).trim();
  if (!passage) return null;
  const vocabulary = sourceNameVocabulary(sources);
  const draft = leadingActor(statement, vocabulary);
  if (draft.standDown) return null;
  const source = leadingActor(passage, vocabulary);
  if (source.standDown) return null;
  if (normalizeName(draft.actor) === normalizeName(source.actor)) return null;
  return { draftParty: draft.actor, sourceParty: source.actor };
}

const ACTOR_SENTENCE = (draftParty, sourceParty) =>
  `The statement attributes this to ${draftParty}; the source credits ${sourceParty}.`;

/**
 * Assembly helper. Null when the check stands down or must not run.
 */
export function applyActorOfTheAction({
  statement,
  confirmingPassage,
  sources,
  hasConflict,
  displayVerdict,
  commentaryNotReviewed,
  evidenceSummary,
} = {}) {
  if (hasConflict === true) return null;
  if (commentaryNotReviewed === true) return null;
  if (displayVerdict === "unverifiable") return null;
  const mismatch = actorMismatch({ statement, confirmingPassage, sources });
  if (!mismatch) return null;
  const sentence = ACTOR_SENTENCE(mismatch.draftParty, mismatch.sourceParty);
  const summary = asText(evidenceSummary);
  const body = summary.replace(/^\s+/, "");
  const nextSummary = body ? `${sentence} ${body}` : sentence;
  return {
    draftParty: mismatch.draftParty,
    sourceParty: mismatch.sourceParty,
    displayVerdict: "conflict",
    concernLevel: "high",
    displayVerdictReason: "actor_mismatch",
    evidenceSummary: nextSummary,
    sentence,
  };
}
