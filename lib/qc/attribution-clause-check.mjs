/**
 * B601. Cause / support clauses (driven by, supported by, due to, …) checked
 * against shown source lines. Missing clause → amber "Goes beyond the source".
 * Deterministic. No model call.
 */
import { gapAppearsInLines, shownSourceLines } from "./reason-evidence-check.mjs";

const CLAUSE_START =
  /\b(?:driven by|supported by|due to|because of|thanks to|reflecting|helped by|as a result of)\b/gi;

/** People-nouns that count as the same role word against the source. */
const PEOPLE_EQUIV = Object.freeze([
  "person",
  "people",
  "staff",
  "specialists",
  "specialist",
  "professionals",
  "professional",
  "members",
  "member",
]);

const STOP = new Set([
  "where", "which", "that", "their", "these", "those", "belief", "believe",
  "with", "from", "into", "over", "under", "onto", "than", "then", "also",
  "very", "more", "most", "such", "both", "each", "only", "well",
]);

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Split a clause body on "and" / commas into checkable fragments. */
function clauseFragments(body) {
  return clean(body)
    .split(/\s*(?:,|;|\band\b|\bor\b)\s*/i)
    .map((part) => clean(part.replace(/^(?:the|a|an)\s+/i, "")))
    .filter((part) => part.length > 2);
}

/**
 * Extract cause/support clauses from a draft sentence.
 * @returns {Array<{ cue: string, body: string, fragments: string[] }>}
 */
export function extractAttributionClauses(statement) {
  const text = clean(statement);
  if (!text) return [];
  const out = [];
  const re = new RegExp(CLAUSE_START.source, "gi");
  let match;
  while ((match = re.exec(text))) {
    const cue = match[0];
    const start = match.index + cue.length;
    let end = text.length;
    const nextCue = new RegExp(CLAUSE_START.source, "gi");
    nextCue.lastIndex = start;
    const next = nextCue.exec(text);
    if (next) end = next.index;
    const slice = text.slice(start, end);
    const stop = slice.search(/[.!?]/);
    const body = clean(stop >= 0 ? slice.slice(0, stop) : slice);
    if (!body) continue;
    out.push({ cue: cue.toLowerCase(), body, fragments: clauseFragments(body) });
  }
  return out;
}

function contentWords(frag) {
  return frag
    .split(/[\s/]+/)
    .flatMap((t) => t.split("-"))
    .map((t) => t.replace(/[^A-Za-z0-9%]/g, ""))
    .filter((t) => t.length >= 3 && !STOP.has(t.toLowerCase()));
}

/** "nine" ↔ "9", with hyphenated forms. */
function figureForms(token) {
  const t = String(token || "").toLowerCase();
  const words = {
    zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
    six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
    eleven: "11", twelve: "12",
  };
  const out = new Set([t]);
  if (words[t]) out.add(words[t]);
  for (const [word, num] of Object.entries(words)) {
    if (t === num) out.add(word);
  }
  return [...out];
}

function wordAppearsInLines(token, lines) {
  const forms = figureForms(token);
  if (PEOPLE_EQUIV.includes(token.toLowerCase())) {
    return PEOPLE_EQUIV.some((p) => gapAppearsInLines(p, lines));
  }
  return forms.some((f) => gapAppearsInLines(f, lines));
}

/**
 * A fragment is supported when every figure matches and at least 75% of its
 * content words appear in the shown lines (people-nouns equated).
 */
export function fragmentSupported(frag, lines) {
  if (gapAppearsInLines(frag, lines)) return true;
  const words = contentWords(frag);
  if (!words.length) return gapAppearsInLines(frag, lines);

  // Every numeral / spelled figure must match.
  const figures = words.filter((w) => /^(?:\d[\d,]*(?:\.\d+)?%?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i.test(w));
  for (const fig of figures) {
    if (!wordAppearsInLines(fig, lines)) return false;
  }

  const hits = words.filter((w) => wordAppearsInLines(w, lines)).length;
  return hits / words.length >= 0.75;
}

/**
 * @returns {{ ok: boolean, missing: string[], reason: string, state: string|null, label: string|null }}
 */
export function checkAttributionClauses(statement, card) {
  const clauses = extractAttributionClauses(statement);
  if (!clauses.length) {
    return { ok: true, missing: [], reason: "", state: null, label: null };
  }
  const lines = shownSourceLines(card);
  const missing = [];
  let sourceInstead = "";
  for (const clause of clauses) {
    for (const frag of clause.fragments) {
      if (fragmentSupported(frag, lines)) continue;
      missing.push(frag);
    }
  }
  if (!missing.length) {
    return { ok: true, missing: [], reason: "", state: null, label: null };
  }
  for (const line of lines) {
    const body = clean(line);
    const m = body.match(
      /\b(?:valuation multiples[^.]*comparables?|supported by[^.]+|driven (?:predominantly )?by[^.]+|due to[^.]+|in-house[^.]+|portfolio team[^.]+)/i,
    );
    if (m) {
      sourceInstead = clean(m[0]).replace(/\.$/, "");
      break;
    }
  }
  if (!sourceInstead) {
    const excerpt = clean(card?.primaryExcerpt || card?.primaryExcerptText || card?.sourceQuote || "");
    const m = excerpt.match(/\b(?:valuation multiples[^.]*comparables?|supported by[^.]+|in-house[^.]+)/i);
    if (m) sourceInstead = clean(m[0]).replace(/\.$/, "");
  }
  const named = missing[0];
  const instead = sourceInstead
    ? ` The source gives "${sourceInstead}".`
    : "";
  const reason = `The sentence says the claim is ${clauses[0].cue} ${named}, which the source does not support.${instead}`.replace(/\s+/g, " ").trim();
  return {
    ok: false,
    missing,
    reason,
    state: "beyond",
    label: "Goes beyond the source",
  };
}

export function applyAttributionClauseCheck(card) {
  const statement = clean(card?.statement || card?.text || "");
  const result = checkAttributionClauses(statement, card);
  if (result.ok) return { card, changed: false };
  const state = result.state;
  return {
    changed: true,
    card: {
      ...card,
      shownReason: result.reason,
      evidenceSummary: result.reason,
      sentenceState: state,
      statementVerdict: {
        ...(card.statementVerdict || {}),
        state,
        setBy: { branch: "attributionClause", source: "exitGate" },
      },
      setBy: { branch: "attributionClause", source: "exitGate" },
      attributionClauseMissing: result.missing,
    },
  };
}
