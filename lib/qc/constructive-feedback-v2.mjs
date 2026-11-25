/**
 * B515. Feedback from the same state the cards and the Assessment pane use.
 * One call. The readiness label is still written in code.
 */
import { OUTPUT_TYPE, getOutputTypeLabel, normalizeOutputType } from "../output-intent.js";
import { houseStyleNoteLine, isBenHouseStyle } from "../house-style-choice.mjs";
import { leaveOutItems, writingBrief } from "../prompt-library/compose.mjs";
import { OUTPUT_TYPE_LENGTH, exceedsLengthAllowance } from "../prompt-library/outputTypeGuidance.js";
import { textTypeModule } from "../prompt-library/text-types/index.mjs";
import { sourceRole } from "../source-role.mjs";
import { COMBINED_STATES, combinedVerdict } from "./combined-verdict.mjs";
import { spellingDisplay, spellingPromptLine } from "./house-spelling.mjs";
import { splitHouseStyle } from "./house-style.mjs";
import { readerEvidenceSentence } from "./reader-reason.mjs";
import { asReviewOptions } from "./review-options.mjs";
import { summariseReview } from "./review-summary.mjs";
import { shownLabel, shownState } from "./shown-verdict.mjs";
import { countWords } from "./token-estimate.mjs";

/** Strip markdown and stray formatting. The words stay. */
export function normalizeConstructiveFeedbackPlainText(raw) {
  let text = typeof raw === "string" ? raw : "";
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_\n]+)_/g, "$1");
  text = text.replace(/^[\t ]*[-*+]\s+/gm, "");
  text = text.replace(/^[\t ]*[-*_]{3,}[\t ]*$/gm, "");
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = replaceEditorialDashes(text);
  return text.trim();
}

/** A remaining em dash or en dash becomes a colon, a comma, or "to". */
function replaceEditorialDashes(text) {
  let next = text.replace(/(\d)\s*[\u2014\u2013]\s*(\d)/g, "$1 to $2");
  next = next.replace(/(["'\u201D\u2019])\s*[\u2014\u2013]\s*/g, "$1: ");
  next = next.replace(/\s*[\u2014\u2013]\s*/g, ", ");
  return next;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingReadiness(body, readiness) {
  let text = normalizeConstructiveFeedbackPlainText(body);
  if (readiness) {
    text = text.replace(new RegExp(`^${escapeRegExp(readiness)}\\.?\\s*`, "i"), "");
  }
  return text.trim();
}

export function prependReadiness(readiness, body) {
  const label = String(readiness || "").trim();
  const cleaned = stripLeadingReadiness(body, label);
  if (!label) return cleaned;
  if (!cleaned) return `${label}.`;
  return `${label}.\n\n${cleaned}`;
}

const OUTPUT_ALIASES = new Set([
  "GENERAL_TEXT",
  "general_text",
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
  { states: ["conflicts"], one: "sentence conflicts with the source", many: "sentences conflict with the source" },
  { states: ["not_in_source"], one: "sentence is not in the source", many: "sentences are not in the source" },
  { states: ["compliance_risk"], one: "sentence is a caution", many: "sentences are cautions" },
  { states: ["beyond", "partial"], one: "sentence goes beyond the source", many: "sentences go beyond the source" },
  { states: ["note_withheld"], one: "sentence needs a look", many: "sentences need a look" },
  { states: ["wording"], one: "sentence has craft notes or cautions", many: "sentences have craft notes or cautions" },
  { states: ["caution"], one: "sentence needs caution", many: "sentences need caution" },
];

const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);

/** The spelling line the House rules pop-up shows. Default US display. */
export const HOUSE_SPELLING = spellingDisplay("US");

/** Shown when the note cannot be written. The dialog offers Retry. */
export const CONSTRUCTIVE_FEEDBACK_FAILED = "Couldn't write the feedback this time. Please try again.";

export function constructiveFeedbackFailure(isReady = false) {
  return {
    ok: false,
    feedbackText: "",
    message: CONSTRUCTIVE_FEEDBACK_FAILED,
    isReady: isReady === true,
  };
}
if (!HOUSE_SPELLING.trim()) {
  throw new Error("constructive feedback: spelling setting is missing");
}

const DEFAULT_SPELLING_PROMPT = spellingPromptLine("US");

export const CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT = [
  "You write feedback from a senior editor to the writer of this draft, often a new writer. The writer must be able to fix the draft from your note alone, and should learn something they can use next time. Write in plain text, no markdown, no system vocabulary such as verdict, card, state, signal or evidence check.",
  "The first line is already written as the readiness label. Do not repeat it.",
  "Write three parts and nothing else.",
  "1. One sentence on where the draft stands, consistent with the readiness label given.",
  "2. Under the line 'To fix', one short entry per finding, most serious first, in the order given. Each entry: a short quote from the draft (at most ten words, use an ellipsis for long sentences), what is wrong in one plain sentence, the relevant source wording when the finding is about the source, and 'For example:' followed by a corrected sentence. The corrected sentence may use only facts from the draft and the source passages given. Merge findings that share one fix into one entry.",
  "3. Under the line 'For next time', one to three habits the writer can apply to future drafts. Each habit must come from the findings above and point to the example in this draft. No generic writing advice.",
  "Do not raise anything that is not in the findings given. Do not mention items in the leave-out list as missing. If there are no findings, write only part 1 and one habit only if a finding supports it; otherwise part 1 alone.",
  "The brief in the payload is what this text should contain and avoid. Do not ask for content the brief does not call for. A claim that needs a caveat stays with the caution findings already given.",
  "Do not use em dashes or en dashes. Use a colon, a comma or a full stop instead.",
  "If a corrected sentence needs a fact that neither the draft nor the source passages give, do not supply it. Put a short bracketed gap in its place, such as [gross or net, as the source states], and add 'Confirm against the source.' after the example.",
  "If a length note is given, write one line under 'To fix' after the other entries, starting 'Length:', stating the count and the limit or range, and naming what to keep. Do not quote it as text from the draft.",
  DEFAULT_SPELLING_PROMPT,
].join("\n");

/** The shipped prompt, plus the account's spelling and separator when they differ. */
export function constructiveFeedbackSystemPrompt(houseStyle) {
  const prompt = spellingPromptLine(houseStyle?.spelling);
  const base = CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT.replace(DEFAULT_SPELLING_PROMPT, prompt);
  if (isBenHouseStyle(houseStyle)) return base;
  const line = houseStyleNoteLine(houseStyle);
  if (!line) return base;
  return `${base}\n${line}`;
}

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

function wordCountPlace({ draftText, outputType, outputTypeLabel, wordLimit } = {}) {
  const words = countWords(typeof draftText === "string" ? draftText : "");
  const cap = Number(wordLimit);
  if (Number.isFinite(cap) && cap > 0) {
    return {
      words,
      place: exceedsLengthAllowance(words, cap) ? "above" : "within",
      bound: `your ${Math.floor(cap)} word limit`,
    };
  }
  const row = OUTPUT_TYPE_LENGTH[outputType];
  if (!row) fail("word range is missing");
  const label = String(outputTypeLabel || "").trim().toLowerCase();
  if (!label) fail("output type label is missing");
  const name = label === "press release" ? "a press release" : label;
  const under = words < row.min;
  const place = exceedsLengthAllowance(words, row.max) ? "above" : "within";
  return { words, place, under, bound: `the ${row.min} to ${row.max} word range for ${name}` };
}

/** Same line the Assessment pane prints. */
export function shownWordCountLine(input) {
  const { words, place, bound, under } = wordCountPlace(input);
  if (under) return `${words} words`;
  return `${words} words, ${place} ${bound}`;
}

/** The length note for the model. Nothing when the draft is inside the limit or the range. */
export function lengthNote(input) {
  const { words, place, bound } = wordCountPlace(input);
  if (place === "within") return null;
  return `${words} words, ${place} ${bound}`;
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
  const note = lengthNote({
    draftText,
    outputType,
    outputTypeLabel,
    wordLimit: input.wordLimit,
  });

  const payload = {
    readinessLabel: readiness,
    assessmentChipLabel: readiness,
    assessmentChips: assessmentChips(qcCards),
    ...(note ? { lengthNote: note } : {}),
    textType: eventType,
    outputType,
    outputTypeLabel,
    visibility,
    excludeList: leaveOutItems(eventType),
    brief: writingBrief({
      eventType,
      outputType,
      visibility,
      maxWords: Number.isFinite(Number(input.wordLimit)) && Number(input.wordLimit) > 0 ? Number(input.wordLimit) : undefined,
    }),
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
