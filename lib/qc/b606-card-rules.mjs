/**
 * B606. Qualifier proposal for needs-a-look cards; passage relevance filter.
 * Deterministic. No model call.
 */
import { finaliseShownReason } from "./b595-card-rules.mjs";
import {
  filterRelevantPassages,
  isHeadingOnlyLine,
  passageSharesWithStatement,
} from "./relevant-passages.mjs";
import { dedupeJoinedReason } from "./note-card-consistency.mjs";

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

const METRIC = /\b(IRR|MOIC|DPI|TVPI|RVPI)\b/i;
const QUALIFIERS = ["net", "gross"];

function passageCorpus(card) {
  const parts = [];
  const push = (text) => {
    const body = clean(text);
    if (body) parts.push(body);
  };
  push(card?.primaryExcerptText || card?.primaryExcerpt);
  for (const part of Array.isArray(card?.primaryExcerptParts) ? card.primaryExcerptParts : []) {
    push(typeof part === "string" ? part : part?.text);
  }
  for (const span of Array.isArray(card?.supportSpans) ? card.supportSpans : []) {
    push(span?.passage || span?.text || span?.extract);
  }
  for (const row of Array.isArray(card?.matchExplanations) ? card.matchExplanations : []) {
    push(row?.passage || row?.excerpt);
  }
  for (const line of Array.isArray(card?.shownLines) ? card.shownLines : []) {
    push(typeof line === "string" ? line : line?.text || line?.excerpt);
  }
  return parts.join(" \n ");
}

function sourceQualifier(passage, statement) {
  const hay = clean(passage);
  if (!hay || !METRIC.test(statement)) return "";
  for (const qualifier of QUALIFIERS) {
    const nearMetric = new RegExp(
      `\\b${qualifier}\\s+(?:of\\s+fees\\s+)?(?:IRR|MOIC|DPI|TVPI|RVPI)\\b|\\b(?:IRR|MOIC|DPI|TVPI|RVPI)\\s+${qualifier}\\b`,
      "i",
    );
    if (nearMetric.test(hay)) return qualifier;
  }
  return "";
}

function articleFor(qualifier) {
  return /^[aeiou]/i.test(qualifier) ? "an" : "a";
}

/**
 * Insert net/gross before the metric, fixing a/an.
 * "an IRR" + net → "a net IRR"
 */
export function insertQualifierBeforeMetric(statement, qualifier) {
  const body = clean(statement);
  const q = clean(qualifier).toLowerCase();
  if (!body || !q) return body;
  if (new RegExp(`\\b${q}\\s+(?:IRR|MOIC|DPI|TVPI|RVPI)\\b`, "i").test(body)) return body;
  const articleMetric = body.replace(
    /\b(an?)\s+(IRR|MOIC|DPI|TVPI|RVPI)\b/i,
    (_full, _article, metric) => `${articleFor(q)} ${q} ${metric}`,
  );
  if (articleMetric !== body) return articleMetric;
  return body.replace(
    /\b(IRR|MOIC|DPI|TVPI|RVPI)\b/i,
    (metric) => `${q} ${metric}`,
  );
}

/**
 * C1. Needs-a-look cards with a dropped net/gross qualifier get a deterministic proposal.
 */
export function attachQualifierProposal(card) {
  if (!card || typeof card !== "object") return card;
  const state = card.sentenceState || card.statementVerdict?.state || "";
  if (state !== "note_withheld") return card;
  if (clean(card?.evidenceProposal?.resultingSentence || card?.conflictProposal?.resultingSentence)) {
    return card;
  }
  const statement = clean(card.statement || card.text || "");
  if (!statement || !METRIC.test(statement)) return card;
  if (/\b(?:net|gross)\b/i.test(statement)) return card;
  const qualifier = sourceQualifier(passageCorpus(card), statement);
  if (!qualifier) return card;
  const resulting = insertQualifierBeforeMetric(statement, qualifier);
  if (!resulting || resulting === statement) return card;
  const proposedChange = `Replace '${statement}' with '${resulting}'.`;
  return {
    ...card,
    suggestedImprovement: resulting,
    evidenceSuggestedDirection: proposedChange,
    evidenceProposal: {
      kind: "evidence",
      proposedChange,
      resultingSentence: resulting,
      suggestedDirection: proposedChange,
    },
  };
}

/**
 * C3 helper applied on the stamped reason.
 */
export function dedupeCardReason(card) {
  if (!card || typeof card !== "object") return card;
  const reason = clean(card.shownReason || card.evidenceSummary || "");
  if (!reason) return card;
  const next = dedupeJoinedReason(reason);
  if (next === reason) return card;
  const state = card.sentenceState || card.statementVerdict?.state || "nothing_raised";
  const face = finaliseShownReason({ ...card, shownReason: next }, state, next);
  return { ...card, ...face };
}

/**
 * C4. Filter stamped excerpt parts and support-span passages used on the card.
 */
export function filterCardPassages(card) {
  if (!card || typeof card !== "object") return card;
  const statement = clean(card.statement || card.text || "");
  let next = { ...card };

  if (Array.isArray(next.primaryExcerptParts) && next.primaryExcerptParts.length) {
    const filtered = filterRelevantPassages(next.primaryExcerptParts, statement);
    next.primaryExcerptParts = filtered;
    const joined = filtered
      .map((part) => clean(typeof part === "string" ? part : part?.text))
      .filter(Boolean)
      .join(" ");
    if (joined) {
      next.primaryExcerpt = joined;
      next.primaryExcerptText = joined;
    }
  }

  const primary = clean(next.primaryExcerptText || next.primaryExcerpt || "");
  // filterRelevantPassages keeps a lone line even when unrelated; score relevance directly.
  const primaryRelevant = primary
    && !isHeadingOnlyLine(primary)
    && passageSharesWithStatement(primary, statement);
  if (primary && !primaryRelevant && Array.isArray(next.supportSpans)) {
    const alt = next.supportSpans
      .map((span) => clean(span?.passage || span?.text || ""))
      .find((text) => text && !isHeadingOnlyLine(text) && passageSharesWithStatement(text, statement));
    if (alt) {
      next.primaryExcerpt = alt;
      next.primaryExcerptText = alt;
    }
  }

  if (Array.isArray(next.supportSpans) && next.supportSpans.length > 1) {
    const texts = next.supportSpans.map((span) => clean(span?.passage || span?.text || ""));
    const keptTexts = new Set(
      filterRelevantPassages(texts.filter(Boolean), statement).map((text) => clean(text).toLowerCase()),
    );
    if (keptTexts.size) {
      const filteredSpans = next.supportSpans.filter((span) => {
        const text = clean(span?.passage || span?.text || "").toLowerCase();
        return text && keptTexts.has(text);
      });
      if (filteredSpans.length) next.supportSpans = filteredSpans;
    }
  }

  return next;
}

export function applyB606CardRules(card) {
  if (!card || typeof card !== "object") return card;
  let next = attachQualifierProposal(card);
  next = filterCardPassages(next);
  next = dedupeCardReason(next);
  return next;
}
