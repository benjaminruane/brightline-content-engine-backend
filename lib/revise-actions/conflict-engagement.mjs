/**
 * Exact-quote locator for contradicted evidence findings.
 * Closable: one same-kind quantity pair, source value quoted from the excerpt.
 * Otherwise: no proposal. Pure. No model client.
 */
import { excerptPassage } from "./thing1.mjs";

export const CONFLICT_PROPOSAL_UNENGAGED = "CONFLICT_PROPOSAL_UNENGAGED";

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

const TOKEN_RE = new RegExp(
  [
    String.raw`(?:EUR|USD|GBP)\s+\d+(?:[.,]\d+)?(?:\s*(?:million|billion))?`,
    String.raw`\d+(?:[.,]\d+)?\s*(?:million|billion)`,
    String.raw`\d+(?:\.\d+)?\s*%`,
    String.raw`\d+(?:\.\d+)?\s*x\b`,
    String.raw`\d+(?:\.\d+)?\s+times\b`,
    String.raw`\d{1,3}(?:['\u2019]\d{3})+`,
    String.raw`\d{1,2}\s+(?:${MONTHS})(?:\s+\d{4})?`,
    String.raw`(?:${MONTHS})\s+\d{4}`,
    String.raw`\b(?:19|20)\d{2}\b`,
    String.raw`(?<![A-Za-z])\d+(?:\.\d+)?(?![A-Za-z])`,
  ].join("|"),
  "gi"
);

function norm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function firstNumber(raw) {
  const match = String(raw).match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  return Number(match[0].replace(",", ""));
}

function classify(raw) {
  const text = String(raw);
  if (/\b(?:eur|usd|gbp)\b/i.test(text) || /\b(?:million|billion)\b/i.test(text)) {
    const scale = /\bbillion\b/i.test(text) ? "billion" : /\bmillion\b/i.test(text) ? "million" : "ones";
    return { kind: "money", scale };
  }
  if (/%/.test(text)) return { kind: "percentage", scale: null };
  if (/x$/i.test(text.trim()) || /\btimes\b/i.test(text)) return { kind: "multiple", scale: null };
  if (new RegExp(MONTHS, "i").test(text) || /^(?:19|20)\d{2}$/.test(text.trim())) {
    return { kind: "date", scale: null };
  }
  if (/['\u2019]/.test(text)) return { kind: "count", scale: "grouped" };
  return { kind: "count", scale: null };
}

function kindKey(token) {
  return token.scale ? `${token.kind}:${token.scale}` : token.kind;
}

function sameQuantity(a, b) {
  return kindKey(a) === kindKey(b) && a.value === b.value;
}

export function tokenizeQuantities(text) {
  const input = String(text ?? "");
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(input))) {
    const raw = match[0];
    const value = firstNumber(raw);
    if (value == null || Number.isNaN(value)) continue;
    const { kind, scale } = classify(raw);
    tokens.push({
      raw,
      value,
      kind,
      scale,
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return tokens;
}

function rejectedRanges(excerpt) {
  const text = String(excerpt ?? "");
  const ranges = [];
  const patterns = [
    /\bnot\b([\s\S]*?)(?:\bas stated\b|(?:\.(?:\s|$))|$)/gi,
    /\bcompared with\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
    /\bversus\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
    /\brather than\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
    /\binstead of\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
  ];
  for (const rx of patterns) {
    rx.lastIndex = 0;
    let match;
    while ((match = rx.exec(text))) {
      const start = match.index + match[0].indexOf(match[1]);
      ranges.push({ start, end: match.index + match[0].length });
    }
  }
  return ranges;
}

function overlaps(token, range) {
  return token.start < range.end && token.end > range.start;
}

function splitExcerptTokens(excerpt) {
  const tokens = tokenizeQuantities(excerpt);
  const rejected = rejectedRanges(excerpt);
  const rejectedTokens = [];
  const assertedTokens = [];
  for (const token of tokens) {
    if (rejected.some((range) => overlaps(token, range))) rejectedTokens.push(token);
    else assertedTokens.push(token);
  }
  return { tokens, rejectedTokens, assertedTokens };
}

function counterpartOf(draftToken, assertedTokens) {
  return assertedTokens.filter(
    (token) => kindKey(token) === kindKey(draftToken) && token.value !== draftToken.value
  );
}

/**
 * Candidate pairs: same kind, different value, and the excerpt marks the
 * draft token as superseded, corrected, or negated. A draft token that
 * appears only as that rejected figure is the signal that the pair is real.
 * A draft token with no same-kind counterpart is ignored. Unmarked excerpts
 * produce no pairs: two figures of the same kind are not enough.
 */
export function findCandidatePairs(statement, excerpt) {
  const draftTokens = tokenizeQuantities(statement);
  const { rejectedTokens, assertedTokens } = splitExcerptTokens(excerpt);
  const pairs = [];
  const seen = new Set();

  function addPair(from, to) {
    const key = `${kindKey(from)}:${from.value}->${to.value}:${from.start}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ from, to });
  }

  if (rejectedTokens.length === 0) return pairs;

  for (const draft of draftTokens) {
    const matchedRejected = rejectedTokens.filter((token) => sameQuantity(token, draft));
    if (matchedRejected.length === 0) continue;
    const counterparts = counterpartOf(draft, assertedTokens);
    if (counterparts.length !== 1) continue;
    addPair(draft, counterparts[0]);
  }
  return pairs;
}

export function excerptTextForFinding(finding) {
  const fromPrimary = excerptPassage(finding?.primaryExcerpt);
  if (fromPrimary) return fromPrimary;
  const card = finding?.card;
  const fromCardPrimary = excerptPassage(card?.primaryExcerpt);
  if (fromCardPrimary) return fromCardPrimary;
  const fromConflict = excerptPassage(card?.conflictExcerpt);
  if (fromConflict) return fromConflict;
  const thing2 = typeof finding?.thing2 === "string" ? finding.thing2.trim() : "";
  return thing2 || "";
}

export function isContradictedEvidenceFinding(finding) {
  if (finding?.kind !== "evidence") return false;
  const rule = norm(finding.rule || finding.sort?.rule);
  return rule === "conflicting" || rule === "conflict";
}

function buildReplaceProposal(statement, pair) {
  const before = String(statement ?? "");
  const resultingSentence = `${before.slice(0, pair.from.start)}${pair.to.raw}${before.slice(pair.from.end)}`;
  return {
    proposedChange: `Replace '${pair.from.raw}' with '${pair.to.raw}'.`,
    resultingSentence,
    why: `The source gives ${pair.to.raw}, not ${pair.from.raw}.`,
  };
}

export function proposalAddressesConflict(statement, resultingSentence, pair) {
  if (!pair?.from || !pair?.to) return false;
  const expected = buildReplaceProposal(statement, pair).resultingSentence;
  const collapse = (value) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  return collapse(resultingSentence) === collapse(expected);
}

/**
 * @returns {{
 *   status: "replace" | "unaddressed" | "unengaged",
 *   pair: object | null,
 *   proposal: { proposedChange: string, resultingSentence: string, why: string } | null
 * }}
 */
export function applyConflictProposal(finding, candidate = null) {
  const statement = String(finding?.statement ?? "");
  const excerpt = excerptTextForFinding(finding);
  const pairs = findCandidatePairs(statement, excerpt);
  if (pairs.length !== 1) {
    return { status: "unaddressed", pair: null, proposal: null };
  }
  const pair = pairs[0];
  const proposal = buildReplaceProposal(statement, pair);
  if (candidate && typeof candidate.resultingSentence === "string") {
    if (!proposalAddressesConflict(statement, candidate.resultingSentence, pair)) {
      console.error(CONFLICT_PROPOSAL_UNENGAGED);
      return { status: "unengaged", pair, proposal: null };
    }
  }
  return { status: "replace", pair, proposal };
}

export function resolveConflictEngagement(finding) {
  return applyConflictProposal(finding, null);
}
