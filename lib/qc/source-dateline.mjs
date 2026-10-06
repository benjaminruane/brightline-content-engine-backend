/**
 * B378. A statement that dates an announcement by the party the source
 * speaks for is judged against the source as-of date.
 *
 * The body of a press release usually does not repeat the dateline, so the
 * matcher reports that the source does not specify the timing whether the
 * draft date is right or wrong.
 *
 * Stands down when there is no as-of date, more than one source, or no
 * announcing verb whose subject is that party.
 *
 * date-subject.mjs does not fit. datesSameSubject requires a reporting-period
 * cue, and a document dateline is not one of those subjects. Month and year
 * are read off the Date from extractSourceAsOfDate.
 *
 * party-tokens.mjs rejects a geography or a currency as the announcing
 * subject. It does not identify who the source speaks for. That name is the
 * capitalised subject of the announcing verb, and it is accepted only when
 * the same phrase appears in the source opening. Comparison is exact after
 * lowercasing. No Jaccard.
 */

import { isBareNonParty } from "./party-tokens.mjs";
import { extractSourceAsOfDate } from "./source-recency.mjs";
import { classifyCard } from "./review-summary.mjs";

const MONTHS = [
  ["september", 9],
  ["sept", 9],
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["october", 10],
  ["november", 11],
  ["december", 12],
  ["jan", 1],
  ["feb", 2],
  ["mar", 3],
  ["apr", 4],
  ["jun", 6],
  ["jul", 7],
  ["aug", 8],
  ["sep", 9],
  ["oct", 10],
  ["nov", 11],
  ["dec", 12],
  ["may", 5],
];

const MONTH_ALT = MONTHS.map(([name]) => name.charAt(0).toUpperCase() + name.slice(1)).join("|");
const VERB_ALT = "announced|announces|declared|declares|disclosed|discloses|reported|reports|stated|states|said|says";

const CLAUSE_RE = new RegExp(
  `^In\\s+(${MONTH_ALT})\\s+((?:19|20)\\d{2}),\\s+([A-Z][A-Za-z0-9.&'-]*(?:\\s+[A-Z][A-Za-z0-9.&'-]*){0,5})\\s+(${VERB_ALT})\\b`
);

const SILENCE_RE =
  /\b(?:does not specify|does not state|does not mention|does not address|is not addressed|not addressed|not specified|does not confirm the timing|timing detail is not)\b/i;
const TIME_RE =
  /\b(?:timing|announcement date|announcement was made|announced in|dates the announcement)\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d{2}\b/i;
const OTHER_GAP_RE = /\d+\s*%|\boil prices?\b|\bfigure\b|\bpercent\b/i;
const ADVICE_RE =
  /\b(?:verify the announcement date|adjust the statement accordingly|adjust the statement to align)\b/i;

const TAIL_WORDS = new Set([
  "that",
  "it",
  "the",
  "company",
  "to",
  "its",
  "a",
  "an",
  "this",
  "intends",
  "intend",
  "intended",
  "will",
  "would",
]);

function monthNumber(name) {
  const key = String(name || "").toLowerCase();
  const hit = MONTHS.find(([label]) => label === key);
  return hit ? hit[1] : null;
}

function sourceList(sources) {
  return (Array.isArray(sources) ? sources : []).filter(
    (source) => source && typeof source.text === "string" && source.text.trim()
  );
}

function openingText(sourceText) {
  return String(sourceText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join("\n")
    .toLowerCase();
}

function datelineLine(sourceText, raw) {
  const needle = String(raw || "").toLowerCase();
  const lines = String(sourceText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
  const hit = lines.find((line) => line.length < 40 && needle && line.toLowerCase().includes(needle));
  return hit || String(raw || "").trim();
}

function standDown(reason) {
  return { status: "stand_down", reason };
}

/**
 * @returns {{ status: "stand_down", reason: string }
 *   | { status: "agree"|"conflict", month: number, year: number, statementMonth: number, statementYear: number, statementMonthName: string, verb: string, subject: string, datelineLine: string, asOfRaw: string }}
 */
export function assessAnnouncementDateline({ statement, sources } = {}) {
  const list = sourceList(sources);
  if (list.length !== 1) return standDown(list.length === 0 ? "no_source" : "more_than_one_source");
  const source = list[0];
  const asOf = extractSourceAsOfDate(source.text);
  if (!asOf || !(asOf.date instanceof Date) || Number.isNaN(asOf.date.getTime())) {
    return standDown("no_as_of_date");
  }
  const text = String(statement || "").trim();
  const match = text.match(CLAUSE_RE);
  if (!match) return standDown("no_announcing_clause");
  const statementMonthName = match[1];
  const statementMonth = monthNumber(statementMonthName);
  const statementYear = Number(match[2]);
  const subject = match[3].replace(/\s+/g, " ").trim();
  const verb = match[4];
  if (!statementMonth || !statementYear) return standDown("no_statement_month_year");
  if (!subject || isBareNonParty(subject)) return standDown("subject_not_a_party");
  if (!openingText(source.text).includes(subject.toLowerCase())) return standDown("subject_not_in_opening");
  const month = asOf.date.getUTCMonth() + 1;
  const year = asOf.date.getUTCFullYear();
  const status = month === statementMonth && year === statementYear ? "agree" : "conflict";
  return {
    status,
    month,
    year,
    statementMonth,
    statementYear,
    statementMonthName,
    verb,
    subject,
    datelineLine: datelineLine(source.text, asOf.raw),
    asOfRaw: asOf.raw,
    sourceLabel: typeof source.label === "string" ? source.label : "",
  };
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isTimingSilence(sentence) {
  if (OTHER_GAP_RE.test(sentence)) return false;
  if (SILENCE_RE.test(sentence) && TIME_RE.test(sentence)) return true;
  return ADVICE_RE.test(sentence);
}

function stripTimingSilence(summary) {
  return splitSentences(summary)
    .filter((sentence) => !isTimingSilence(sentence))
    .join(" ")
    .trim();
}

function spanIsAnnouncementOnly(spanText, verb) {
  const text = String(spanText || "").trim();
  if (!text || !/^In\s+/i.test(text)) return false;
  if (/%/.test(text) || /\boil\b/i.test(text)) return false;
  const digitRuns = text.match(/\d+(?:\.\d+)?/g) || [];
  const years = text.match(/\b(?:19|20)\d{2}\b/g) || [];
  if (digitRuns.length !== years.length) return false;
  if (!new RegExp(`\\b${verb}\\b`, "i").test(text)) return false;
  const after = text.split(new RegExp(`\\b${verb}\\b`, "i")).slice(1).join(" ");
  const words = after
    .replace(/[^A-Za-z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 8) return false;
  return words.every((word) => TAIL_WORDS.has(word.toLowerCase()));
}

function canLift(card, verb) {
  if (card?.displayVerdict !== "supported_partial" && card?.supportState !== "partial") return false;
  const spans = Array.isArray(card.supportSpans) ? card.supportSpans : [];
  if (!spans.some((span) => span?.classification === "confirmed")) return false;
  if (spans.some((span) => span?.classification === "conflicting" || span?.classification === "partially_confirmed")) {
    return false;
  }
  const unsupported = Array.isArray(card.unsupportedSpans) ? card.unsupportedSpans : [];
  return unsupported.every((span) => spanIsAnnouncementOnly(span?.text, verb));
}

function withSummaryClass(card) {
  if (!card?.summaryClass || typeof card.summaryClass !== "object") return card;
  const summaryClass = classifyCard(card, {
    evidenceEnabled: true,
    editorialEnabled: true,
    complianceEnabled: true,
  });
  return { ...card, summaryClass };
}

/**
 * Apply the dateline rule to an assembled card. Returns the same object
 * when the rule stands down or the card is already a conflict.
 */
export function applySourceDatelineToCard(card, sources) {
  if (!card || typeof card !== "object") return card;
  if (card.hasConflict === true || card.supportState === "conflicting" || card.displayVerdict === "conflict") {
    return card;
  }
  const assessment = assessAnnouncementDateline({ statement: card.statement, sources });
  if (assessment.status === "stand_down") return card;

  if (assessment.status === "agree") {
    const evidenceSummary = stripTimingSilence(card.evidenceSummary);
    const reasoningParagraph = stripTimingSilence(card.reasoningParagraph || card.evidenceSummary);
    const next = {
      ...card,
      evidenceSummary: evidenceSummary || `The source dateline is ${assessment.datelineLine}. That confirms the announcement timing.`,
      reasoningParagraph:
        reasoningParagraph || evidenceSummary || `The source dateline is ${assessment.datelineLine}. That confirms the announcement timing.`,
    };
    if (!canLift(card, assessment.verb)) return withSummaryClass(next);
    return withSummaryClass({
      ...next,
      supportState: "supported",
      displayVerdict: "supported_full",
      displayMode: "supported",
      hasConflict: false,
      concernLevel: "none",
      evidenceConcernLevel: "none",
      unsupportedSpans: [],
      displayVerdictReason: card.displayVerdictReason || null,
    });
  }

  const lead = `The source dateline is ${assessment.datelineLine}. The statement dates the announcement to ${assessment.statementMonthName} ${assessment.statementYear}.`;
  const prior = String(card.evidenceSummary || "").trim();
  const evidenceSummary = prior.startsWith("The source dateline is ") ? prior : prior ? `${lead} ${prior}` : lead;
  return withSummaryClass({
    ...card,
    supportState: "conflicting",
    displayVerdict: "conflict",
    displayMode: "conflicting",
    hasConflict: true,
    concernLevel: "high",
    evidenceConcernLevel: "high",
    displayVerdictReason: "announcement_dateline",
    evidenceSummary,
    reasoningParagraph: evidenceSummary,
    conflictExcerpt: {
      passage: assessment.datelineLine,
      sourceLabel: assessment.sourceLabel,
    },
  });
}
