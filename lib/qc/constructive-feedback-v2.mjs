/**
 * B515. Feedback from the same state the cards and the Assessment pane use.
 * One call. The readiness label is still written in code.
 */
import { OUTPUT_TYPE, getOutputTypeLabel, normalizeOutputType } from "../output-intent.js";
import { leaveOutItems } from "../prompt-library/compose.mjs";
import { OUTPUT_TYPE_LENGTH } from "../prompt-library/outputTypeGuidance.js";
import { textTypeModule } from "../prompt-library/text-types/index.mjs";
import { sourceRole } from "../source-role.mjs";
import { COMBINED_STATES, combinedVerdict } from "./combined-verdict.mjs";
import {
  normalizeConstructiveFeedbackPlainText,
  prependReadiness,
} from "./constructive-feedback.mjs";
import { splitHouseStyle } from "./house-style.mjs";
import { readerEvidenceSentence } from "./reader-reason.mjs";
import { asReviewOptions } from "./review-options.mjs";
import { summariseReview } from "./review-summary.mjs";
import { shownLabel, shownState } from "./shown-verdict.mjs";
import { countWords } from "./token-estimate.mjs";

export { normalizeConstructiveFeedbackPlainText, prependReadiness };

const OUTPUT_ALIASES = new Set([
  "REPORTING_COMMENTARY",
  "reporting_commentary",
  "TRANSACTION_TEXT",
  "transaction_text",
  "INVESTOR_LETTER",
  "investor_letter",
  "PRESS_RELEASE",
  "press_release",
  "LINKEDIN_POST",
  "linkedin_post",
]);

const CHIP_LINES = [
  { states: ["conflicts"], one: "statement conflicts with the source", many: "statements conflict with the source" },
  { states: ["not_in_source"], one: "statement is not in the source", many: "statements are not in the source" },
  { states: ["compliance_risk"], one: "statement is a compliance risk", many: "statements are compliance risks" },
  { states: ["beyond", "partial"], one: "statement goes beyond the source", many: "statements go beyond the source" },
  { states: ["note_withheld"], one: "statement needs a look", many: "statements need a look" },
  { states: ["wording"], one: "statement has craft or compliance notes", many: "statements have craft or compliance notes" },
];

const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);

export const CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT = [
  "You write feedback from a senior editor to the writer of this draft, often a new writer. The writer must be able to fix the draft from your note alone, and should learn something they can use next time. Write in plain text, no markdown, no system vocabulary such as verdict, card, state, signal or evidence check.",
  "The first line is already written as the readiness label. Do not repeat it.",
  "Write three parts and nothing else.",
  "1. One sentence on where the draft stands, consistent with the readiness label given.",
  "2. Under the line 'To fix', one short entry per finding, most serious first, in the order given. Each entry: a short quote from the draft (at most ten words, use an ellipsis for long sentences), what is wrong in one plain sentence, the relevant source wording when the finding is about the source, and 'For example:' followed by a corrected sentence. The corrected sentence may use only facts from the draft and the source passages given. Merge findings that share one fix into one entry.",
  "3. Under the line 'For next time', one to three habits the writer can apply to future drafts. Each habit must come from the findings above and point to the example in this draft. No generic writing advice.",
  "Do not raise anything that is not in the findings given. Do not mention items in the leave-out list as missing. If there are no findings, write only part 1 and one habit only if a finding supports it; otherwise part 1 alone.",
].join("\n");

function fail(message) {
  throw new Error(`constructive feedback: ${message}`);
}

function requireText(value, name) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) fail(`${name} is missing`);
  return text;
}

export function canonicalOutputType(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!OUTPUT_ALIASES.has(text)) fail("output type is missing");
  const normalized = normalizeOutputType(text);
  if (!OUTPUT_TYPE_LENGTH[normalized] || !Object.values(OUTPUT_TYPE).includes(normalized)) {
    fail("output type is missing");
  }
  return normalized;
}

/** Same line the Assessment pane prints. */
export function shownWordCountLine({ draftText, outputType, outputTypeLabel, wordLimit } = {}) {
  const words = countWords(typeof draftText === "string" ? draftText : "");
  const cap = Number(wordLimit);
  const head = `${words} words`;
  if (Number.isFinite(cap) && cap > 0) {
    return `${head}, ${words > cap ? "above" : "within"} your ${Math.floor(cap)} word limit`;
  }
  const row = OUTPUT_TYPE_LENGTH[outputType];
  if (!row) fail("word range is missing");
  const label = String(outputTypeLabel || "").trim().toLowerCase();
  if (!label) fail("output type label is missing");
  const name = label === "press release" ? "a press release" : label;
  const place = words < row.min ? "below" : words > row.max ? "above" : "within";
  return `${head}, ${place} the ${row.min} to ${row.max} word range for ${name}`;
}

function cardOf(row) {
  if (row?.qcCard && typeof row.qcCard === "object") {
    const text = typeof row.text === "string" && row.text.trim() ? row.text.trim() : "";
    if (text && typeof row.qcCard.statement !== "string") return { ...row.qcCard, statement: text };
    return row.qcCard;
  }
  return row && typeof row === "object" ? row : null;
}

function statementOf(card, row) {
  if (typeof card?.statement === "string" && card.statement.trim()) return card.statement.trim();
  if (typeof row?.text === "string" && row.text.trim()) return row.text.trim();
  return "";
}

function editorialList(card) {
  const raw = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
  if (Array.isArray(card?.houseStyleConcerns)) return raw;
  return splitHouseStyle(raw).editorial;
}

function notesOf(list) {
  const out = [];
  for (const concern of Array.isArray(list) ? list : []) {
    const note = [concern?.note, concern?.concernText, concern?.text].find(
      (part) => typeof part === "string" && part.trim()
    );
    const suggestedDirection = typeof concern?.suggestedDirection === "string"
      ? concern.suggestedDirection.trim()
      : "";
    if (!note && !suggestedDirection) continue;
    out.push({ note: note ? note.trim() : "", suggestedDirection });
  }
  return out;
}

function citedSource(card) {
  let passage = "";
  if (typeof card?.primaryExcerpt === "string") passage = card.primaryExcerpt.trim();
  else if (typeof card?.primaryExcerptText === "string") passage = card.primaryExcerptText.trim();
  else if (card?.primaryExcerpt && typeof card.primaryExcerpt.passage === "string") {
    passage = card.primaryExcerpt.passage.trim();
  }
  const name = typeof card?.primaryRefTitle === "string" ? card.primaryRefTitle.trim() : "";
  if (!passage && !name) return null;
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const owner = matches.find((row) => {
    const label = typeof row?.sourceLabel === "string" ? row.sourceLabel.trim() : "";
    const sourceName = typeof row?.sourceName === "string" ? row.sourceName.trim() : "";
    return Boolean(name) && (label === name || sourceName === name);
  });
  return {
    passage,
    name,
    role: sourceRole(owner?.role ?? owner?.sourceRole),
  };
}

export function screenCombined(card) {
  const state = shownState(card);
  if (!state) fail("shown state is missing");
  return combinedVerdict({
    verdict: {
      ...(card?.statementVerdict && typeof card.statementVerdict === "object" ? card.statementVerdict : {}),
      state,
    },
    editorialConcerns: editorialList(card),
    complianceVerdict: typeof card?.complianceVerdict === "string" ? card.complianceVerdict : null,
    complianceConcerns: Array.isArray(card?.complianceConcerns) ? card.complianceConcerns : [],
  });
}

function assessmentChips(cards) {
  const counts = new Map();
  for (const card of cards) {
    const state = screenCombined(card).state;
    if (!state) fail("combined state is missing");
    counts.set(state, (counts.get(state) || 0) + 1);
  }
  const chips = [];
  for (const row of CHIP_LINES) {
    const count = row.states.reduce((sum, state) => sum + (counts.get(state) || 0), 0);
    if (count < 1) continue;
    chips.push(`${count} ${count === 1 ? row.one : row.many}`);
  }
  return chips;
}

function rankOf(state) {
  const index = COMBINED_STATES.indexOf(state);
  return index < 0 ? COMBINED_STATES.length : index;
}

/**
 * @param {object} body
 * @returns {{ readiness: string, payload: object }}
 */
export function buildConstructiveFeedbackV2(body) {
  const input = body && typeof body === "object" ? body : {};
  const draftText = typeof input.draftText === "string" ? input.draftText : "";
  if (!draftText.trim()) fail("draft text is missing");
  const eventType = requireText(input.eventType, "text type");
  if (!textTypeModule(eventType)) fail("text type is missing");
  const outputType = canonicalOutputType(input.outputType);
  const outputTypeLabel = typeof input.outputTypeLabel === "string" && input.outputTypeLabel.trim()
    ? input.outputTypeLabel.trim()
    : getOutputTypeLabel(outputType);
  const visibility = requireText(input.visibility, "visibility");
  if (!input.reviewOptions || typeof input.reviewOptions !== "object") fail("review options are missing");
  const reviewOptions = asReviewOptions(input.reviewOptions);
  const rows = Array.isArray(input.statements) ? input.statements : null;
  if (!rows) fail("statements are missing");

  const cards = rows.map((row, index) => {
    const card = cardOf(row);
    if (!card) fail("a statement card is missing");
    return { card, row, index };
  });
  const qcCards = cards.map((entry) => entry.card);
  const summary = summariseReview(qcCards, reviewOptions);
  const readiness = summary?.readiness;
  if (typeof readiness !== "string" || !readiness.trim()) fail("assessment chip label is missing");

  const findings = [];
  for (const entry of cards) {
    const combined = screenCombined(entry.card);
    if (QUIET.has(combined.state)) continue;
    const statement = statementOf(entry.card, entry.row);
    if (!statement) fail("a statement is missing");
    const label = shownLabel(entry.card);
    if (!label) fail("shown label is missing");
    findings.push({
      order: entry.index,
      rank: rankOf(combined.state),
      statement,
      label,
      reason: readerEvidenceSentence(entry.card) || "",
      source: citedSource(entry.card),
      editorial: notesOf(editorialList(entry.card)),
      compliance: notesOf(entry.card.complianceConcerns),
    });
  }
  findings.sort((left, right) => left.rank - right.rank || left.order - right.order);

  const payload = {
    readinessLabel: readiness,
    assessmentChipLabel: readiness,
    assessmentChips: assessmentChips(qcCards),
    wordCountLine: shownWordCountLine({
      draftText,
      outputType,
      outputTypeLabel,
      wordLimit: input.wordLimit,
    }),
    textType: eventType,
    outputType,
    outputTypeLabel,
    visibility,
    excludeList: leaveOutItems(eventType),
    draftText,
    findings: findings.map(({ statement, label, reason, source, editorial, compliance }) => ({
      statement,
      label,
      reason,
      source,
      editorial,
      compliance,
    })),
  };
  return { readiness, payload };
}
