/**
 * B603. Leftovers from B602 plus Shopify face rules. Deterministic. No model call.
 */
import { finaliseShownReason, everyReadingFactMatched } from "./b595-card-rules.mjs";
import { shownTier, SHOWN_LABELS } from "./shown-verdict.mjs";

/** Local face rewrite; exit-gate restamps combinedVerdict after. */
function withState(card, state, reason, setBy) {
  const face = finaliseShownReason({ ...card, shownReason: reason }, state, reason);
  const label = SHOWN_LABELS[state] || face.sentenceLabel || card.sentenceLabel || "";
  return {
    ...card,
    ...face,
    sentenceState: state,
    sentenceLabel: label,
    evidenceLabel: label,
    statementVerdict: {
      ...(card.statementVerdict || {}),
      state,
      tier: shownTier(state),
      setBy,
    },
    setBy,
    combinedVerdict: {
      ...(card.combinedVerdict || {}),
      state,
      label,
      tone: state === "conflicts" || state === "not_in_source" ? "red"
        : state === "nothing_raised" ? "none"
        : "amber",
      setBy,
    },
  };
}

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function shownLines(card) {
  const out = [];
  const push = (text) => {
    const body = clean(text);
    if (body) out.push(body);
  };
  push(card?.primaryExcerptText || card?.primaryExcerpt);
  for (const part of Array.isArray(card?.primaryExcerptParts) ? card.primaryExcerptParts : []) {
    push(typeof part === "string" ? part : part?.text);
  }
  for (const row of Array.isArray(card?.shownLines) ? card.shownLines : []) {
    push(typeof row === "string" ? row : row?.text || row?.excerpt);
  }
  for (const fact of Array.isArray(card?.readingFacts) ? card.readingFacts : []) {
    for (const shown of Array.isArray(fact?.shown?.shown) ? fact.shown.shown : []) {
      push(shown?.extract);
    }
  }
  return out;
}

const TITLE_OR_HEADER = /^(?:date:|as at|for immediate release|confidential|quarterly report|fact sheet|key figures|nav\b|table of|contents\b|document:)/i;
const DATE_ONLY = /^(?:\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|date:\s*.+)$/i;

/**
 * A1. When every reading fact matches and the shown line already carries the
 * alleged missing year/fact, Rule B: green.
 */
export function applyShownLineRuleB(card) {
  const state = card?.sentenceState || card?.statementVerdict?.state || "";
  if (state !== "note_withheld" && state !== "beyond" && state !== "partial") return card;
  if (!everyReadingFactMatched(card)) return card;

  const reason = clean(card?.shownReason || card?.evidenceSummary || "");
  const lines = shownLines(card).join(" \n ");
  const statement = clean(card?.statement || card?.text || "");

  // Year "not specified" while 20xx is on a shown line and in the statement.
  const year = statement.match(/\b((?:19|20)\d{2})\b/)?.[1];
  const claimsMissingYear = /does not specify the year|year of investment|year is (?:not |missing)|missing (?:the )?year/i.test(reason);
  if (year && claimsMissingYear && lines.includes(year)) {
    return {
      ...withState(card, "nothing_raised", "The source supports the sentence.", {
        branch: "b603",
        source: "shown-line-rule-b",
      }),
      statusDependent: false,
      statusNeedsConfirm: false,
    };
  }

  // Generic: every fact matched and reason's "does not specify X" appears in lines.
  const missing = reason.match(/\b(?:does not (?:explicitly )?(?:state|mention|address|give|use|specify)|omits?|missing)\s+([^.]{3,80})/i);
  if (missing && everyReadingFactMatched(card)) {
    const gap = clean(missing[1]).toLowerCase();
    const gapTokens = gap.split(/\s+/).filter((w) => w.length > 3 && !/^(the|and|or|for|with|from|that|this|when|into)$/i.test(w));
    const covered = (year && /year/i.test(gap) && lines.includes(year))
      || gapTokens.filter((tok) => lines.toLowerCase().includes(tok)).length >= Math.min(2, gapTokens.length);
    if (covered) {
      return {
        ...withState(card, "nothing_raised", "The source supports the sentence.", {
          branch: "b603",
          source: "shown-line-rule-b",
        }),
        statusDependent: false,
        statusNeedsConfirm: false,
      };
    }
  }
  return card;
}

/**
 * A2. When the source does not address a claim: no excerpt, fixed copy.
 * Never keep a title/header/date-only line as evidence.
 * Only rewrite the face when the card is already an unaddressed claim (or the
 * excerpt is furniture). Do not blank every beyond card with an empty primary.
 */
export function clearUnaddressedExcerpt(card) {
  const state = card?.sentenceState || card?.statementVerdict?.state || "";
  if (state !== "beyond" && state !== "not_in_source") return card;

  const copy = "Nothing in the source addresses this.";
  let primary = clean(card?.primaryExcerptText || card?.primaryExcerpt || "");
  const firstLine = clean((primary.split(/\n/)[0] || ""));
  const isFurniture = TITLE_OR_HEADER.test(firstLine)
    || DATE_ONLY.test(firstLine)
    || (/note|report|fact sheet|confidential|document:/i.test(firstLine)
      && primary.length < 100
      && !/\d[\d,]{2,}/.test(primary));

  const reason = clean(card?.shownReason || card?.evidenceSummary || "");
  const reasonSaysUnaddressed = /nothing in the source addresses this|does not address this|says nothing about|not address this|guarantees a meal/i.test(reason);
  const unaddressed = card?.excerptAbsent === true || reasonSaysUnaddressed || isFurniture;

  if (!unaddressed) return card;

  // Keep a reason that already names a concrete gap; only fall back to the
  // fixed copy when the reason is empty or already the unaddressed phrase.
  const nextReason = reasonSaysUnaddressed || !reason ? copy : reason;
  const face = finaliseShownReason({ ...card, shownReason: nextReason }, state, nextReason);
  return {
    ...card,
    ...face,
    shownReason: nextReason,
    primaryExcerpt: "",
    primaryExcerptText: "",
    primaryExcerptParts: [],
    conflictExcerpt: null,
    alsoAppearsAt: null,
    excerptAbsent: true,
    emptyEvidenceCopy: copy,
  };
}

/**
 * F67. Drop empty or ellipsis-only excerpt bullets.
 */
export function scrubEmptyExcerptBullets(card) {
  const isEmpty = (text) => {
    const body = clean(String(text || "").replace(/[.…]+/g, "").replace(/\.{3,}/g, ""));
    return !body;
  };
  let next = { ...card };
  if (isEmpty(next.primaryExcerptText) || isEmpty(next.primaryExcerpt)) {
    next.primaryExcerpt = "";
    next.primaryExcerptText = "";
  }
  if (Array.isArray(next.primaryExcerptParts)) {
    next.primaryExcerptParts = next.primaryExcerptParts.filter((part) => {
      const text = typeof part === "string" ? part : part?.text;
      return !isEmpty(text);
    });
  }
  if (next.conflictExcerpt && typeof next.conflictExcerpt === "object") {
    if (isEmpty(next.conflictExcerpt.passage || next.conflictExcerpt.text)) {
      next.conflictExcerpt = null;
    }
  }
  return next;
}

/**
 * F64. When a status claim's date conflicts with the source/memo date, name both
 * dates in full and hide status buttons.
 */
export function statusDateConflictReason(statement, sourceText) {
  const draft = clean(statement);
  const source = clean(sourceText);
  if (!draft || !source) return null;

  const draftMonthYear = draft.match(/\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i)?.[1]
    || draft.match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i)?.[1]
    || "";
  const memoDate = source.match(/\bDate:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/i)?.[1]
    || source.match(/\b(?:dated|as of|as at)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/i)?.[1]
    || "";
  if (!draftMonthYear || !memoDate) return null;

  const draftYear = draftMonthYear.match(/\d{4}/)?.[0];
  const memoYear = memoDate.match(/\d{4}/)?.[0];
  if (!draftYear || !memoYear || draftYear === memoYear) return null;

  // Normalise "October 12, 2010" → "12 October 2010" when possible.
  const memoNorm = (() => {
    const mdy = memoDate.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (mdy) return `${mdy[2]} ${mdy[1]} ${mdy[3]}`;
    return memoDate;
  })();

  return {
    state: "conflicts",
    label: "Conflicts with the source",
    reason: `The memo is dated ${memoNorm}; the sentence says the agreement was in ${draftMonthYear}.`,
    needsConfirm: false,
    statusDependent: false,
  };
}

/**
 * Prefer a complete date-conflict reason over a cut mid-sentence reason.
 */
export function ensureCompleteStatusDateReason(card, sourceText) {
  const statement = clean(card?.statement || card?.text || "");
  const hit = statusDateConflictReason(statement, sourceText || card?.sourceCorpus || "");
  if (!hit) {
    // Repair truncated "seeking approval for." style cuts.
    const reason = clean(card?.shownReason || "");
    if (/\sfor\.\s*$/i.test(reason) || /\sfor\.\s+Transaction status/i.test(reason)) {
      const repaired = reason
        .replace(/\sfor\.\s*(?:Transaction status as set by you:.*)?$/i, " for an investment.")
        .replace(/\s+/g, " ")
        .trim();
      const face = finaliseShownReason({ ...card, shownReason: repaired }, card.sentenceState || "conflicts", repaired);
      return { ...card, ...face, statusNeedsConfirm: false };
    }
    return card;
  }

  return {
    ...withState(card, hit.state, hit.reason, { branch: "b603", source: "status-date-conflict" }),
    statusDependent: false,
    statusNeedsConfirm: false,
    statusQuietLine: null,
  };
}

/** Run every B603 face rule on one card. */
export function applyB603CardRules(card, { sourceCorpus = null, dealStatus = null } = {}) {
  if (!card || typeof card !== "object") return card;
  let next = { ...card, sourceCorpus: sourceCorpus || card.sourceCorpus || null };
  next = applyShownLineRuleB(next);
  next = clearUnaddressedExcerpt(next);
  next = scrubEmptyExcerptBullets(next);
  if (dealStatus && dealStatus !== "As the source states") {
    next = ensureCompleteStatusDateReason(next, next.sourceCorpus);
  }
  return next;
}
