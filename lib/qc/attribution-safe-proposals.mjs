/**
 * B598. Editorial and house-style proposals must not change who said something.
 * Drop attribution swaps and ungrammatical instruction text.
 * Deterministic. No model call.
 */

const FIRST_PERSON = /\b(we|our|us)\b/i;
const THIRD_PRONOUN = /\b(he|she|they|him|her|them|his|hers|their)\b/i;
const ATTRIBUTION_VERB = /\b(emphasizes?|emphasises?|expects?|says?|said|notes?|noted|states?|stated|believes?|argues?|writes?|wrote|announced|reported|observes?|observed|warns?|warned|claims?|claimed)\b/i;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function quotedPhrases(text) {
  const found = [];
  const re = /['"]([^'"]{2,120})['"]/g;
  let match;
  while ((match = re.exec(String(text || "")))) {
    found.push(match[1].replace(/\s+/g, " ").trim());
  }
  return found;
}

/** Rough subject head of a short clause. */
function subjectHead(text) {
  const body = clean(text);
  if (!body) return "";
  const match = body.match(/^(?:the\s+)?([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}|\b(?:he|she|they|it)\b)/);
  return match ? match[1] : "";
}

function isPassive(text) {
  return /\b(?:was|were|is|are|been|be)\s+\w+ed\b/i.test(clean(text))
    || /\b(?:was|were|is|are)\s+(?:oversubscribed|announced|reported|completed|signed|approved)\b/i.test(clean(text));
}

/**
 * True when the proposal swaps a named person / third-party subject / third-person
 * pronoun for first person, or turns a passive into a first-person active.
 */
export function proposalChangesAttribution(statement, concern) {
  const sentence = clean(statement);
  const direction = clean(concern?.suggestedDirection || concern?.proposedChange || concern?.suggestion);
  if (!sentence || !direction) return false;

  const quotes = quotedPhrases(direction);
  // "Change 'X' to 'Y'" / "Replace 'X' with 'Y'"
  const swap = direction.match(
    /\b(?:change|replace|rewrite|turn)\b[\s\S]{0,40}?['"]([^'"]+)['"][\s\S]{0,40}?\b(?:to|with|into)\b[\s\S]{0,20}?['"]([^'"]+)['"]/i,
  );
  const from = clean(swap?.[1] || quotes[0] || "");
  const to = clean(swap?.[2] || quotes[1] || "");

  // AUTHOR-NAME-BLIND: attribution filter only cares whether the draft reports a
  // third party's view; the authoring organisation is treated like any other name.
  const reportsOther = ATTRIBUTION_VERB.test(sentence) || THIRD_PRONOUN.test(sentence)
    || /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:emphasizes|emphasises|expects|says|said|notes|states|believes)\b/.test(sentence)
    || isPassive(sentence);

  if (!reportsOther && !ATTRIBUTION_VERB.test(sentence) && !isPassive(sentence)) {
    // Still catch explicit first-person substitution of a named head.
  }

  if (from && to) {
    const fromFirst = FIRST_PERSON.test(from);
    const toFirst = FIRST_PERSON.test(to);
    if (!fromFirst && toFirst) return true;
    const fromHead = subjectHead(from);
    const toHead = subjectHead(to);
    if (fromHead && toHead && !FIRST_PERSON.test(fromHead) && FIRST_PERSON.test(toHead)) return true;
    if (THIRD_PRONOUN.test(from) && FIRST_PERSON.test(to)) return true;
  }

  // Instruction introduces we/our/us against a third-party reporting sentence.
  if (reportsOther && FIRST_PERSON.test(direction) && !FIRST_PERSON.test(sentence)) {
    // Only when the replacement side clearly uses first person.
    if (to && FIRST_PERSON.test(to)) return true;
    if (/\b(?:use|write|say|change (?:it )?to)\b[\s\S]{0,40}\b(we|our|us)\b/i.test(direction)) return true;
  }

  // Passive → first-person active.
  if (isPassive(sentence) && FIRST_PERSON.test(direction) && /\b(?:we|our)\s+\w+(?:ed|ing)?\b/i.test(direction)) {
    return true;
  }

  return false;
}

/**
 * True when the instruction text is not grammatical English.
 * Catches fragments like "Place the period after the noun it describes".
 */
export function proposalInstructionUngrammatical(concern) {
  const direction = clean(concern?.suggestedDirection || concern?.proposedChange || concern?.suggestion);
  if (!direction) return false;
  // Must look like an imperative sentence with a verb and an object, ending sensibly
  // or quoting a replacement. Reject known broken templates.
  if (/^place the period after the noun it describes\.?$/i.test(direction)) return true;
  if (/^fix (?:the )?period\.?$/i.test(direction)) return true;
  // Bare fragment: no verb-like imperative opener and no quoted replacement.
  const quotes = quotedPhrases(direction);
  if (!quotes.length && !/\b(add|remove|change|replace|rewrite|use|write|move|delete|insert|state|specify|quote|put|keep|drop|swap|rephrase|omit|include|correct)\b/i.test(direction)) {
    return true;
  }
  // "the noun it describes" dangling relative without a clear target quote.
  if (/\bthe noun it describes\b/i.test(direction) && quotes.length < 1) return true;
  return false;
}

function isEvidenceCorrection(concern) {
  const kind = String(concern?.kind || concern?.category || "").toLowerCase();
  if (kind === "evidence" || kind === "conflict" || kind === "figure") return true;
  const direction = clean(concern?.suggestedDirection || concern?.proposedChange || concern?.suggestion);
  // Figure / money replacements are evidence corrections — never drop them.
  if (/\b(?:EUR|USD|GBP|\$|€|£)\s*\d/i.test(direction) && /\b(?:replace|change)\b/i.test(direction)) {
    return true;
  }
  return false;
}

/**
 * Drop editorial / house-style proposals that change attribution or are ungrammatical.
 * Compliance and evidence corrections are left alone.
 */
export function filterAttributionSafeConcerns(statement, concerns) {
  const list = Array.isArray(concerns) ? concerns : [];
  return list.filter((concern) => {
    if (isEvidenceCorrection(concern)) return true;
    if (proposalInstructionUngrammatical(concern)) return false;
    if (proposalChangesAttribution(statement, concern)) return false;
    return true;
  });
}

/** Apply the filter to editorial and houseStyle arrays on a card. */
export function filterCardProposals(card) {
  if (!card || typeof card !== "object") return card;
  const statement = clean(card.statement || card.text || "");
  const next = { ...card };
  if (Array.isArray(card.editorialConcerns)) {
    next.editorialConcerns = filterAttributionSafeConcerns(statement, card.editorialConcerns);
  }
  if (Array.isArray(card.houseStyleConcerns)) {
    next.houseStyleConcerns = filterAttributionSafeConcerns(statement, card.houseStyleConcerns);
  }
  // Evidence / conflict proposals on the card are never filtered for attribution.
  return next;
}
