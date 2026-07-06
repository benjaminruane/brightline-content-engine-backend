// WR1: Deterministic PG commentary artifact cleanup (generate path only).

export const PG_METHODOLOGY_DELIMITER = "---METHODOLOGY---";

const METHODOLOGY_DEBRIS_RE = /-{2,3}\s*METHODOLOGY\s*-{0,3}/gi;

/**
 * Normalize smart quotes and unicode dashes to house-style ASCII (mirrors style-guide backstop intent).
 * @param {string} text
 * @returns {string}
 */
export function normalizePgHouseStyleCharacters(text) {
  return String(text ?? "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-");
}

/**
 * Strip leading/trailing orphan straight quote marks and delimiter debris from commentary.
 * @param {string} commentary
 * @returns {string}
 */
export function cleanPgCommentary(commentary) {
  let text = normalizePgHouseStyleCharacters(commentary);

  text = text.replace(METHODOLOGY_DEBRIS_RE, "");
  text = text.replaceAll(PG_METHODOLOGY_DELIMITER, "");

  text = text
    .split("\n")
    .map((line) => line.replace(/^\s*-{2,}\s*$/g, "").trimEnd())
    .join("\n");

  text = text.trim();
  text = text.replace(/^["']+/, "").replace(/["']+$/, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return text;
}

const SENTENCE_STRIP_PATTERNS = [
  /\bMOIC\b/i,
  /\bIRR\b/i,
  /gross\s+performance/i,
  /deployed\s+EUR/i,
  /across\s+\d+\s+platforms/i,
  /across\s+\d+\s+investments/i,
  /\bFund\s+[IVXLC\d]+\b[^.!?]*\d+(?:\.\d+)?\s*x\b/i,
  /(?<![-\w])term\b/i,
  /\bextensions?\b/i,
  /\binvestment\s+period\b/i,
  /\bmanagement\s+fee\b/i,
  /\bcarried\s+interest\b/i,
  /\bSFDR\b/i,
  /\bArticle\s+8\b/i,
  /\bdiversification\s+limit/i,
  /\bGP\s+commitment\b/i,
  /\b3%\s+cash\b/i,
];

function splitSentences(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];
  const parts = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return parts.map((part) => part.trim()).filter(Boolean);
}

function shouldStripSentence(sentence) {
  return SENTENCE_STRIP_PATTERNS.some((pattern) => pattern.test(sentence));
}

function rewriteFundPhrases(text) {
  let phraseRewrites = 0;
  let out = String(text ?? "");

  const leadRe = /(?:made\s+a\s+)?lead\s+commitment\s+to/gi;
  out = out.replace(leadRe, () => {
    phraseRewrites += 1;
    return "committed to";
  });

  const phraseRules = [
    [/\bGP's\b/gi, "manager's"],
    [/\bGPs\b/gi, "managers"],
    [/\bGP\b/gi, "manager"],
    [/\bgeneral partner's\b/gi, "the manager's"],
    [/\bgeneral partners\b/gi, "managers"],
    [/\bgeneral partner\b/gi, "manager"],
  ];

  for (const [pattern, replacement] of phraseRules) {
    out = out.replace(pattern, () => {
      phraseRewrites += 1;
      return replacement;
    });
  }

  return { text: out, phraseRewrites };
}

function filterParagraphSentences(paragraph) {
  const sentences = splitSentences(paragraph);
  const kept = [];
  let sentencesRemoved = 0;

  for (const sentence of sentences) {
    if (shouldStripSentence(sentence)) {
      sentencesRemoved += 1;
    } else {
      kept.push(sentence);
    }
  }

  return { text: kept.join(" ").trim(), sentencesRemoved };
}

function collapseParagraphs(paragraphs) {
  const nonEmpty = paragraphs.map((p) => p.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return "";
  if (nonEmpty.length === 1) return nonEmpty[0];
  return nonEmpty.slice(0, 2).join("\n\n");
}

/**
 * Deterministic PG fund-commitment post-filter (NEW_FUND_COMMITMENT generate path only).
 * @param {string} commentary
 * @param {{ requestId?: string|null }} [opts]
 * @returns {{ text: string, filtered: boolean, sentencesRemoved: number, phraseRewrites: number }}
 */
export function applyPgFundCommitmentPostFilter(commentary, { requestId = null } = {}) {
  const source = String(commentary ?? "");
  const { text: rewritten, phraseRewrites } = rewriteFundPhrases(source);

  const rawParagraphs = rewritten.split(/\n\s*\n/);
  let sentencesRemoved = 0;
  const filteredParagraphs = rawParagraphs.map((paragraph) => {
    const result = filterParagraphSentences(paragraph);
    sentencesRemoved += result.sentencesRemoved;
    return result.text;
  });

  const text = collapseParagraphs(filteredParagraphs);
  const filtered = sentencesRemoved > 0 || phraseRewrites > 0 || text !== source.trim();

  if (filtered) {
    console.warn(
      "[CANARY]",
      JSON.stringify({
        event: "pg_fund_exclusion_filtered",
        requestId,
        sentencesRemoved,
        phraseRewrites,
        paragraphCount: text ? text.split(/\n\s*\n/).filter(Boolean).length : 0,
      })
    );
  }

  return { text, filtered, sentencesRemoved, phraseRewrites };
}

/**
 * @param {string} commentary
 * @param {string} methodologyNote
 * @returns {string}
 */
export function joinPgDraftParts(commentary, methodologyNote) {
  const body = String(commentary ?? "").trim();
  const note = String(methodologyNote ?? "").trim();
  if (!note) return body;
  return body ? `${body}\n${PG_METHODOLOGY_DELIMITER}\n${note}` : `${PG_METHODOLOGY_DELIMITER}\n${note}`;
}

/**
 * @param {string} commentary
 * @param {string} methodologyNote
 * @returns {string}
 */
export function assemblePgDraftOutput(commentary, methodologyNote) {
  const body = cleanPgCommentary(commentary);
  return joinPgDraftParts(body, methodologyNote);
}
