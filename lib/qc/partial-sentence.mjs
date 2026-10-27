/**
 * B432. What a partial card says.
 * The matcher's sentence is edited by these rules, and nothing else:
 * 1. Drop a trailing clause that only restates the class
 *    ("making the statement partially confirmed", "making the support partial").
 * 2. Delete the word "explicitly" when it follows "not".
 * 3. A sentence written for a confirmed match is not a ground for a partial
 *    and is not shown.
 * 4. A comma immediately inside a closing quote at the end of the sentence
 *    is removed ("team,'." becomes "team'.").
 * 5. A later sentence is dropped when an earlier sentence already quotes
 *    every gap the later one quotes. A later sentence with no quote is dropped
 *    when an earlier sentence has one.
 * A card with no partial-class explanation does not get a split invented for it.
 */

export const PARTIAL_LABEL = "Partly in the source";
export const PARTIAL_UNRECORDED =
  "Part of this statement is in the source. Which part was not recorded.";

const TRAILING_CLASS =
  /(?:,)?\s+(?:making|which makes|so)\s+(?:the statement\s+(?:is\s+)?(?:only\s+)?partially confirmed|the support partial)\.?\s*$/i;

export function editPartialExplanation(text) {
  let body = String(text || "").replace(/\s+/g, " ").trim();
  if (!body) return "";
  body = body.replace(/\bdoes not explicitly\b/gi, "does not");
  body = body.replace(/\bdo not explicitly\b/gi, "do not");
  body = body.replace(/\bnot explicitly\b/gi, "not");
  body = body.replace(TRAILING_CLASS, "");
  body = body.replace(/,(?=['"]\.?$)/, "");
  body = body.replace(/\s+/g, " ").trim().replace(/[,;:\s]+$/, "").trim();
  if (body && !/[.!?]$/.test(body)) body += ".";
  return body;
}

function partialClassText(row) {
  const cls = String(row?.classification || "").toLowerCase();
  if (cls !== "partially_confirmed") return "";
  const written = String(row?.writtenFor || "").toLowerCase();
  if (written && written !== "partially_confirmed") return "";
  return editPartialExplanation(row?.explanation);
}

function quotedGaps(text) {
  const found = [];
  const re = /['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(text))) {
    found.push(match[1].toLowerCase().replace(/[,\s]+$/g, "").trim());
  }
  return found;
}

function keepPartialParts(parts) {
  const kept = [];
  for (const text of parts) {
    const prior = kept.flatMap(quotedGaps);
    const mine = quotedGaps(text);
    if (kept.length > 0 && prior.length > 0 && mine.every((gap) => prior.includes(gap))) continue;
    kept.push(text);
  }
  return kept;
}

function spanPhrase(span, statement) {
  if (typeof span?.text === "string" && span.text.trim()) return span.text.trim();
  if (typeof span?.quote === "string" && span.quote.trim()) return span.quote.trim();
  const start = Number(span?.startChar ?? span?.start);
  const end = Number(span?.endChar ?? span?.end);
  if (typeof statement === "string" && Number.isInteger(start) && end > start && end <= statement.length) {
    return statement.slice(start, end).trim();
  }
  return "";
}

/**
 * The sentence a partial card shows. Always a string.
 * Never a confirmed-class explanation, and never a split that was not stored.
 */
export function partialSentence(card) {
  const parts = [];
  for (const row of Array.isArray(card?.matchExplanations) ? card.matchExplanations : []) {
    const text = partialClassText(row);
    if (text && !parts.includes(text)) parts.push(text);
  }
  if (!parts.length && card?.partialGround?.recorded === true && card.partialGround.source === "stage2_explanation") {
    const text = editPartialExplanation(card.partialGround.text);
    if (text) parts.push(text);
  }
  if (parts.length) return keepPartialParts(parts).join(" ");
  const phrases = [];
  const statement = typeof card?.statement === "string" ? card.statement : "";
  for (const span of Array.isArray(card?.unsupportedSpans) ? card.unsupportedSpans : []) {
    const phrase = spanPhrase(span, statement);
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
  }
  if (phrases.length) {
    const quoted = phrases.map((phrase) => `"${phrase}"`).join(", ");
    return `Not in the source: ${quoted}. Which part the source covers was not recorded.`;
  }
  return PARTIAL_UNRECORDED;
}
