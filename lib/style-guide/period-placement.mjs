/**
 * A period that sits directly before the noun it describes.
 * The auto-fix leaves that sentence. Review names both parts.
 */

const NOT_THE_NOUN = /^(?:the|a|an|and|or|but|of|to|in|for|with|from|by|as|is|was|were|are|be|been|being|has|have|had|will|would|that|which|who|this|these|those|it|its|their|on|at|into|over|after|before|during|when|while|if|not|no|than|then|also|only|just|so|because|about|between|among)$/i;

const VERB = /^(?:rose|fell|was|were|is|are|increased|decreased|grew|dropped|reached|stood|came|went|had|has|have|will|would|remains|remained|improved|declined|climbed|slipped|widened|narrowed|held|totalled|totaled|amounted|reported|delivered|posted|recorded|showed|shows)$/i;

const PERIOD_PATTERNS = [
  /\b(Q[1-4]\s+(?:19|20)\d{2})\s+/g,
  /\b(H[12]\s+(?:19|20)\d{2})\s+/g,
  /\b(FY\s?(?:19|20)\d{2})\s+/g,
  /\b((?:first|second|third|fourth)\s+quarter\s+of\s+(?:19|20)\d{2})\s+/gi,
  /\b((?:first|second)\s+half\s+of\s+(?:19|20)\d{2})\s+/gi,
  /\b(financial year\s+(?:19|20)\d{2})\s+/gi,
];

const SHORT_FORM = /\b(FY\s?(?:19|20)\d{2}|Q[1-4]\s+(?:19|20)\d{2}|H[12]\s+(?:19|20)\d{2})\b/g;
const SPELLED_FORM = /\b(financial year\s+(?:19|20)\d{2}|(?:first|second|third|fourth)\s+quarter(?:\s+of)?\s+(?:19|20)\d{2}|(?:first|second)\s+half(?:\s+of)?\s+(?:19|20)\d{2})\b/gi;

const QUARTER = ["first", "second", "third", "fourth"];
const HALF = ["first", "second"];

function bare(word) {
  return String(word || "").replace(/^[("']+|[).,;:!?]+$/g, "");
}

function nounPhrase(after) {
  const words = String(after || "").trim().split(/\s+/).filter(Boolean);
  const kept = [];
  for (const word of words) {
    const token = bare(word);
    if (!token) break;
    if (VERB.test(token)) break;
    if (kept.length === 0 && NOT_THE_NOUN.test(token)) return "";
    kept.push(token);
    if (kept.length >= 8) break;
  }
  return kept.join(" ");
}

export function periodInHouseStyle(written, periods) {
  const spelled = periods !== "abbreviated";
  const text = String(written || "").trim();
  const fy = text.match(/^FY\s?((?:19|20)\d{2})$/i);
  if (fy) return spelled ? `financial year ${fy[1]}` : `FY${fy[1]}`;
  const quarter = text.match(/^Q([1-4])\s+((?:19|20)\d{2})$/);
  if (quarter) {
    return spelled ? `the ${QUARTER[Number(quarter[1]) - 1]} quarter of ${quarter[2]}` : `Q${quarter[1]} ${quarter[2]}`;
  }
  const half = text.match(/^H([12])\s+((?:19|20)\d{2})$/);
  if (half) {
    return spelled ? `the ${HALF[Number(half[1]) - 1]} half of ${half[2]}` : `H${half[1]} ${half[2]}`;
  }
  const quarterWords = text.match(/^(first|second|third|fourth)\s+quarter(?:\s+of)?\s+((?:19|20)\d{2})$/i);
  if (quarterWords) {
    const name = quarterWords[1].toLowerCase();
    return spelled ? `the ${name} quarter of ${quarterWords[2]}` : `Q${QUARTER.indexOf(name) + 1} ${quarterWords[2]}`;
  }
  const halfWords = text.match(/^(first|second)\s+half(?:\s+of)?\s+((?:19|20)\d{2})$/i);
  if (halfWords) {
    const name = halfWords[1].toLowerCase();
    return spelled ? `the ${name} half of ${halfWords[2]}` : `H${HALF.indexOf(name) + 1} ${halfWords[2]}`;
  }
  const year = text.match(/^financial year\s+((?:19|20)\d{2})$/i);
  if (year) return spelled ? `financial year ${year[1]}` : `FY${year[1]}`;
  return text;
}

function safeRewrite(statement, start, periodWritten, thing, periods) {
  if (statement.slice(0, start).trim()) return "";
  const after = statement.slice(start + periodWritten.length).trim();
  if (!after.toLowerCase().startsWith(thing.toLowerCase())) return "";
  const rest = after.slice(thing.length).trim();
  const first = bare(rest.split(/\s+/)[0] || "");
  if (!VERB.test(first)) return "";
  const body = rest.replace(/[.!?]+$/, "").trim();
  const capital = thing.charAt(0).toUpperCase() + thing.slice(1);
  const form = periodInHouseStyle(periodWritten, periods);
  return `${capital} ${body} in ${form}.`;
}

function concern(code, note, quote, spans) {
  return {
    concernCode: code,
    rule: code,
    category: "style_guide",
    note,
    concernText: note,
    text: note,
    suggestedDirection: note,
    quote,
    span: spans,
  };
}

export function scanPeriodPlacement({ statement, periods } = {}) {
  if (typeof statement !== "string") throw new Error("scanPeriodPlacement: statement is missing");
  const hits = [];
  for (const pattern of PERIOD_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    for (const match of statement.matchAll(re)) {
      const periodWritten = match[1];
      const after = statement.slice(match.index + periodWritten.length);
      const thing = nounPhrase(after);
      if (!thing) continue;
      const end = match.index + match[0].length;
      hits.push({
        periodWritten,
        thing,
        start: match.index,
        end,
        fix: safeRewrite(statement, match.index, periodWritten, thing, periods),
      });
    }
  }
  if (!hits.length) return [];
  const first = hits[0];
  const named = `${first.periodWritten} describes ${first.thing}.`;
  const note = first.fix
    ? `Place the period after the noun it describes. ${named} Write it as '${first.fix}'`
    : `Place the period after the noun it describes. ${named} Write the period after that noun.`;
  return [concern(
    "period_placement",
    note,
    `${first.periodWritten} ${first.thing}`,
    hits.map((hit) => ({ startChar: hit.start, endChar: hit.end })),
  )];
}

function formsIn(text, pattern) {
  return text.match(new RegExp(pattern.source, pattern.flags.includes("i") ? "gi" : "g")) || [];
}

/**
 * Spelled accounts: a short form that is not already a placement hit is flagged.
 * Abbreviated accounts: a mix of short and spelled forms in one draft is flagged.
 */
export function scanPeriodForm({ statement, draftText, periods } = {}) {
  if (typeof statement !== "string") throw new Error("scanPeriodForm: statement is missing");
  const choice = periods === "abbreviated" ? "abbreviated" : "spelled";
  const body = typeof draftText === "string" && draftText.trim() ? draftText : statement;
  if (choice === "abbreviated") {
    const shorts = formsIn(body, SHORT_FORM);
    const longs = formsIn(body, SPELLED_FORM);
    if (!shorts.length || !longs.length) return [];
    const here = formsIn(statement, SPELLED_FORM);
    if (!here.length) return [];
    const note = `This draft writes the period both ways. ${here[0]} does not match ${shorts[0]}, which is also in the draft. Use one form.`;
    return [concern("period_form", note, here[0], [])];
  }
  const shorts = [...statement.matchAll(new RegExp(SHORT_FORM.source, "g"))];
  const left = shorts.filter((match) => {
    const after = statement.slice(match.index + match[0].length);
    const next = bare(after.trim().split(/\s+/)[0] || "");
    if (!next || NOT_THE_NOUN.test(next)) return true;
    return false;
  });
  if (!left.length) return [];
  const written = left[0][0];
  const note = `Write ${written} as ${periodInHouseStyle(written, "spelled")}.`;
  return [concern("period_form", note, written, [{ startChar: left[0].index, endChar: left[0].index + written.length }])];
}
