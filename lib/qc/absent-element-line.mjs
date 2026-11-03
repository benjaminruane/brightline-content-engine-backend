/**
 * B470. The sentence under an absence headline when the quotation states
 * the draft. The element is the one the card stored. The sentence says
 * only that the source does not contain it.
 */

function clean(text) {
  return typeof text === "string" ? text.trim() : "";
}

function figurePhrase(fact, statement) {
  const surface = clean(fact?.surface);
  const text = typeof statement === "string" ? statement : "";
  const at = Number.isInteger(fact?.start) && fact.start >= 0 ? fact.start : text.indexOf(surface);
  if (!surface || at < 0) return surface;
  const window = text.slice(Math.max(0, at - 48), Math.min(text.length, at + surface.length + 48));
  if (/\bpercent\b|%/.test(window)) return `${surface} percent`;
  return surface;
}

/**
 * One sentence. The stored surface is the only thing named.
 * A missing fact or a missing surface is refused.
 */
export function absentElementLine(fact, statement) {
  if (!fact || typeof fact !== "object") throw new Error("absentElementLine: fact is missing");
  const surface = clean(fact.surface);
  if (!surface) throw new Error("absentElementLine: surface is missing");
  const kind = clean(fact.kind);
  if (kind === "name") return `The source does not describe the company as ${surface}.`;
  if (kind === "figure") return `The source does not give the ${figurePhrase(fact, statement)} figure.`;
  if (kind === "date") return `The source does not give the date ${surface}.`;
  return `The source does not contain ${surface}.`;
}

const SENTENCE_VERB = /\b(?:is|are|was|were|does|do|did|has|have|had|states|says|gives|give|names|name|describes|describe|contains|contain|mentions|mention|adds|add|conflicts|implies|means|refers|refer|puts|put|sets|set|shows|show|records|record|discusses|discuss|attributes|attribute|comes|came|runs|run|makes|made|uses|used|includes|include|reports|report|finds|found|leaves|left|treats|treat|calls|call|keeps|kept|carries|carry|remains|remain|appears|appear|generates|generate|occupies|occupy|builds|built|expects|expect|seeks|sought|supports|support|confirms|confirm|specifies|specify|notes|note|writes|wrote|said|been|being|can|could|will|would|may|might)\b/i;

function commaOutsideQuotes(text) {
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) return i;
  }
  return -1;
}

/**
 * "" when the reason is a sentence.
 * A bare element, a comma, and a fragment is not one.
 * A comma inside a quotation is not that boundary.
 */
export function sentenceFault(text) {
  const body = String(text || "").replace(/\s+/g, " ").trim();
  if (!body) return "";
  const commaAt = commaOutsideQuotes(body);
  if (commaAt >= 0 && commaAt <= 80) {
    const head = body.slice(0, commaAt).trim();
    const subject = /^(?:The |A |An |This |It |There |Part |Which )/.test(head);
    if (!subject && /^[A-Z0-9]/.test(head) && !SENTENCE_VERB.test(head)) {
      return "a reason opens with a bare element";
    }
  }
  if (!SENTENCE_VERB.test(body)) return "a reason is not a complete sentence";
  return "";
}
