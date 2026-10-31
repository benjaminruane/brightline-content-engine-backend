/**
 * B404. Attaches the reading contract to an assembled review.
 * QC_READING_VIEW defaults on. Set it to 0 to leave the card untouched.
 * The note step is claude-opus-4-7. Temperature is omitted for that model.
 */
import { buildDraftMarks } from "./draft-marks.mjs";
import { combinedVerdict } from "./combined-verdict.mjs";
import { reviewStatementConcerns } from "./editorial-compliance-reviewer.mjs";
import { statementVerdict } from "./statement-verdict.mjs";
import { cardEvidenceFindings, shownEvidenceProse } from "./evidence-findings.mjs";
import { sealReaderCard } from "./reader-prose-guard.mjs";
import { locateStatementAt, locateStatements } from "./locate-statement.mjs";
import {
  READING_NOTE_PROMPT,
  WRITER_FEEDBACK_PROMPT,
  acceptNote,
  applyReadingContract,
  buildFacts,
  draftHeader,
  missingBenchmarkCard,
  noteForReader,
  sentenceState,
  settleFacts,
  shownOccurrences,
  suppressReassurance,
} from "./reading-contract.mjs";
import { READER_LINES } from "./reader-lines.mjs";
import { craftNoteEndorsement } from "./craft-note-ban.mjs";
import { applyNoteHouseStyle } from "./note-house-style.mjs";
import { resolveAuthoringOrganisationName } from "./first-person-actor.mjs";
import { droppedMarkSilence, scrubConcernList } from "./worked-record.mjs";
import { shownVerdict } from "./shown-verdict.mjs";
import { partialSentence } from "./partial-sentence.mjs";

export const READING_MODEL = "claude-opus-4-7";

export const PROPOSAL_PROMPT = `Name the source's counterpart for each fact marked not_found. Return one JSON object with a replacements array.

Each object has index and text.
index is the position of that fact in the element list.
text is the source's own word or phrase for that fact, copied from the source, or the word none.
none is a complete answer. Use it when the source does not state a counterpart for that fact. A guess is worse than none.
One object for each not_found fact. Leave matched facts out of the array.`;

const RATES = { input: 5, output: 25 };

export function readingViewEnabled(env = process.env) {
  const raw = env?.QC_READING_VIEW;
  if (raw == null || String(raw).trim() === "") return true;
  const value = String(raw).trim().toLowerCase();
  return !(value === "0" || value === "false" || value === "off" || value === "no");
}

export function readingSourceText(sources) {
  const list = Array.isArray(sources) ? sources : null;
  if (!list || list.length === 0) {
    throw new Error("attachReadingView: source text is missing");
  }
  const texts = list.map((source, index) => {
    if (typeof source === "string") return source;
    if (!source || typeof source.text !== "string") {
      throw new Error(`attachReadingView: source ${index} has no text`);
    }
    return source.text;
  });
  if (texts.every((text) => text.trim() === "")) {
    throw new Error("attachReadingView: source text is missing");
  }
  return texts.join("\n");
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function proposalFrom(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const indices = Array.isArray(parsed.disputedIndices) ? parsed.disputedIndices : parsed.disputedElements;
  return {
    bucket: typeof parsed.bucket === "string" ? parsed.bucket.trim().toLowerCase() : parsed.bucket,
    text: typeof parsed.note === "string" ? parsed.note : "",
    disputedIndices: indices,
    replacements: Array.isArray(parsed.replacements) ? parsed.replacements : undefined,
  };
}

function retryPrompt(reason, previous) {
  return `The previous reply was refused. Reason: ${reason}.
bucket must be one of these words, and nothing else:
conflicts
beyond
wording
none
disputedIndices must be an array of integers.
Describe what the source says and what the statement says.
Previous note:
${previous || "(empty)"}`;
}

function userPrompt(statement, facts) {
  const elements = facts.map((fact, index) => `${index}. ${fact.kind}: ${fact.surface}`).join("\n");
  return `Statement:\n${statement}\n\nElements:\n${elements || "(none)"}`;
}

function presentFact(fact) {
  return {
    ...fact,
    shown: shownOccurrences(fact),
    benchmarkCard: missingBenchmarkCard(fact),
  };
}

function listUsd(usage) {
  return ((Number(usage?.inputTokens) || 0) / 1_000_000) * RATES.input
    + ((Number(usage?.outputTokens) || 0) / 1_000_000) * RATES.output;
}

/** Only the craft-note call. The per-sentence note does not pass a schema. */
export function writerJsonSchemaForSpan(spanName) {
  if (spanName !== "b404-writer" && spanName !== "b404-writer-retry") return undefined;
  return {
    type: "object",
    properties: {
      note: {
        type: "array",
        minItems: 2,
        items: { type: "string" },
        description: "The note as paragraphs, at least two. Plain sentences. Do not put a heading or a label on a paragraph.",
      },
    },
    required: ["note"],
  };
}

/**
 * The stored note is one string. A list of paragraphs joins with a blank line.
 * A string that is itself that list is unwrapped, including one the model
 * wrapped in brackets and then broke with an inner quotation mark. Any other
 * string is kept, because the prompt example is still a string and dropping
 * it would withhold the note. A list that contains a non-string is empty.
 */
export function joinWriterNoteParagraphs(value) {
  if (typeof value === "string") return paragraphsFromString(value);
  if (!Array.isArray(value)) return "";
  const paragraphs = [];
  for (const item of value) {
    if (typeof item !== "string") return "";
    const trimmed = item.trim();
    if (trimmed) paragraphs.push(trimmed);
  }
  return paragraphs.join("\n\n");
}

function paragraphsFromString(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return joinWriterNoteParagraphs(parsed);
  } catch {
    // The brackets are not valid JSON. Try the broken list below.
  }
  if (!trimmed.startsWith("[\"") || !trimmed.endsWith("\"]")) return trimmed;
  const parts = trimmed.slice(2, -2).split("\", \"").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return trimmed;
  return parts.join("\n\n");
}

async function defaultComplete(messages, spanName, spend) {
  const { calculateLlmCostUsd, callLLM } = await import("../observability.js");
  const result = await callLLM({
    provider: "anthropic",
    model: READING_MODEL,
    messages,
    temperature: null,
    seed: 1,
    responseFormat: "json",
    jsonSchema: writerJsonSchemaForSpan(spanName),
    spanName,
  });
  const usage = result.usage || {};
  spend.calls += 1;
  spend.inputTokens += Number(usage.inputTokens) || 0;
  spend.outputTokens += Number(usage.outputTokens) || 0;
  spend.cachedInputTokens += Number(usage.cachedInputTokens) || 0;
  spend.costUsd += calculateLlmCostUsd("anthropic", READING_MODEL, usage);
  spend.listUsd += listUsd(usage);
  return typeof result.text === "string" ? result.text : "";
}

async function readOne(statement, draft, sourceText, complete) {
  const facts = buildFacts({ statement, draft, sourceText });
  const system = `${READING_NOTE_PROMPT}\n\nSource:\n${sourceText}`;
  const user = userPrompt(statement, facts);
  const firstText = await complete([
    { role: "system", content: system },
    { role: "user", content: user },
  ], "b404-note");
  let parsed = proposalFrom(parseJson(firstText));
  let accepted = acceptNote(parsed, facts);
  if (!accepted.ok) {
    const secondText = await complete([
      { role: "system", content: system },
      { role: "user", content: user },
      { role: "assistant", content: firstText || "{}" },
      { role: "user", content: retryPrompt(accepted.reason, parsed?.text || "") },
    ], "b404-note-retry");
    parsed = proposalFrom(parseJson(secondText));
    accepted = acceptNote(parsed, facts);
  }
  const refused = !accepted.ok;
  const note = refused ? { refused: true } : accepted.note;
  const settled = settleFacts(facts, note).map(presentFact);
  const shown = refused ? note : suppressReassurance(note, settled);
  const silences = [];
  if (refused) {
    silences.push({
      id: "note_refused",
      reason: accepted.reason || "refused",
      rejections: Array.isArray(accepted.rejections) ? accepted.rejections : [],
    });
  } else if (shown?.reassuranceCleared === true) {
    silences.push({
      id: "reassurance_stripped",
      reason: "every sentence was removed and the label has no why",
    });
  }
  if (!refused && Array.isArray(accepted.rejections) && accepted.rejections.length) {
    silences.push({
      id: "note_rejections",
      reason: "disputes were dropped",
      count: accepted.rejections.length,
    });
  }
  return {
    facts: settled,
    note: shown,
    sentenceState: sentenceState(settled, note),
    silences,
    rejections: Array.isArray(accepted.rejections) ? accepted.rejections : [],
    withheldReason: refused ? accepted.reason || "refused" : null,
  };
}

/** One note per statement. The same call the review uses. No writer note. */
export async function noteDraft({ statements, draft, sourceText, complete } = {}) {
  if (typeof draft !== "string") throw new Error("noteDraft: draft is missing");
  if (typeof sourceText !== "string") throw new Error("noteDraft: source text is missing");
  const rows = Array.isArray(statements) ? statements : null;
  if (!rows) throw new Error("noteDraft: statements are missing");
  const spend = { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0 };
  const run = complete || ((messages, spanName) => defaultComplete(messages, spanName, spend));
  const notes = [];
  for (const statement of rows) {
    const text = typeof statement === "string" ? statement : statement?.text;
    if (typeof text !== "string" || !text.trim()) throw new Error("noteDraft: a statement is missing its text");
    notes.push(await readOne(text, draft, sourceText, run));
  }
  return { notes, spend };
}

function keptProposalRows(parsed, facts) {
  const rows = Array.isArray(parsed?.replacements) ? parsed.replacements : [];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const index = Number(row.index);
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!Number.isInteger(index) || index < 0 || index >= facts.length || !text) continue;
    if (facts[index].status !== "not_found") continue;
    out.push({ index, text });
  }
  return out;
}

/**
 * The proposal call. Separate from the note, because asking inside the note
 * moved clean statements. One call per statement that has a not_found fact.
 * Statements with none are not called.
 */
export async function proposeDraft({ statements, draft, sourceText, complete } = {}) {
  if (typeof draft !== "string") throw new Error("proposeDraft: draft is missing");
  if (typeof sourceText !== "string") throw new Error("proposeDraft: source text is missing");
  const rows = Array.isArray(statements) ? statements : null;
  if (!rows) throw new Error("proposeDraft: statements are missing");
  const spend = { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0 };
  const run = complete || ((messages, spanName) => defaultComplete(messages, spanName, spend));
  const proposals = [];
  for (const statement of rows) {
    const text = typeof statement === "string" ? statement : statement?.text;
    if (typeof text !== "string" || !text.trim()) throw new Error("proposeDraft: a statement is missing its text");
    const facts = buildFacts({ statement: text, draft, sourceText });
    if (!facts.some((fact) => fact.status === "not_found")) {
      proposals.push({ facts, replacements: [], called: false });
      continue;
    }
    const missing = facts.map((fact, index) => (fact.status === "not_found" ? String(index) : null)).filter(Boolean);
    const reply = await run([
      { role: "system", content: `${PROPOSAL_PROMPT}\n\nSource:\n${sourceText}` },
      { role: "user", content: `${userPrompt(text, facts)}\n\nnot_found indices: ${missing.join(", ")}` },
    ], "b411-proposal");
    proposals.push({ facts, replacements: keptProposalRows(parseJson(reply), facts), called: true });
  }
  return { proposals, spend };
}

export function writerText(raw) {
  const parsed = parseJson(raw);
  if (parsed && typeof parsed === "object") {
    for (const key of ["note", "feedback", "text"]) {
      if (!Object.prototype.hasOwnProperty.call(parsed, key)) continue;
      const joined = joinWriterNoteParagraphs(parsed[key]);
      if (joined) return applyNoteHouseStyle(joined);
    }
  }
  return "";
}

function writerAttempt(raw) {
  const text = writerText(raw);
  return { text, reason: text ? craftNoteEndorsement(text) : "empty" };
}

/**
 * The first reply is kept when it clears the ban.
 * A refusal keeps both attempts: the text, and the phrase or "empty".
 * The ban list is unchanged. The retry prompt is unchanged.
 */
export function settleWriterNote(firstRaw, secondRaw) {
  const first = writerAttempt(firstRaw);
  if (first.text && !first.reason) {
    return { writerFeedback: first.text, writerFeedbackStatus: "shown" };
  }
  if (secondRaw === undefined) {
    throw new Error("settleWriterNote: the retry text is missing");
  }
  const second = writerAttempt(secondRaw);
  const writerFeedbackAttempts = [first, second];
  if (second.text && !second.reason) {
    return {
      writerFeedback: second.text,
      writerFeedbackStatus: "shown",
      writerFeedbackAttempts,
    };
  }
  const refused = second.text || first.text || "";
  return {
    writerFeedback: null,
    writerFeedbackStatus: "withheld",
    writerFeedbackRefused: refused || null,
    writerFeedbackRefusal: second.reason || first.reason,
    writerFeedbackAttempts,
  };
}

/** Fields a stored run keeps. A missing reading is loud as nulls, not a shown note. */
export function writerNoteFields(reading) {
  if (!reading || typeof reading !== "object") {
    return { writerFeedback: null, writerFeedbackStatus: null };
  }
  const out = {
    writerFeedback: typeof reading.writerFeedback === "string" ? reading.writerFeedback : null,
    writerFeedbackStatus: reading.writerFeedbackStatus ?? null,
  };
  if (Array.isArray(reading.writerFeedbackAttempts)) {
    out.writerFeedbackAttempts = reading.writerFeedbackAttempts;
  }
  if (reading.writerFeedbackStatus === "withheld") {
    out.writerFeedbackRefused = reading.writerFeedbackRefused ?? null;
    out.writerFeedbackRefusal = reading.writerFeedbackRefusal ?? null;
  }
  return out;
}

/**
 * The writer record is not written onto the card.
 * A replay passes the stored card through here and reads the same identity back.
 */
export function passStoredCard(card) {
  if (!card || typeof card !== "object") throw new Error("passStoredCard: card is missing");
  return { card, writerNote: writerNoteFields(card.reading) };
}

export async function writerNote(draft, complete) {
  const firstText = await complete([
    { role: "system", content: WRITER_FEEDBACK_PROMPT },
    { role: "user", content: draft },
  ], "b404-writer");
  const first = writerAttempt(firstText);
  if (first.text && !first.reason) return settleWriterNote(firstText);
  const secondText = await complete([
    { role: "system", content: WRITER_FEEDBACK_PROMPT },
    { role: "user", content: `${draft}\n\nThe previous note was refused. Write the note again without those words.` },
  ], "b404-writer-retry");
  return settleWriterNote(firstText, secondText);
}

/**
 * Adds the reading payload beside the assembled cards.
 * Does not change the fields already on each card.
 * When the flag is off, returns the same cards and reading null.
 */
export async function attachReadingView({ cards, sources, complete } = {}) {
  if (!readingViewEnabled()) {
    return { cards: Array.isArray(cards) ? cards : [], reading: null };
  }
  if (!Array.isArray(cards)) {
    throw new Error("attachReadingView: cards are missing");
  }
  const sourceText = readingSourceText(sources);
  const spend = { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0 };
  const run = complete || ((messages, spanName) => defaultComplete(messages, spanName, spend));
  const statements = cards.map((card) => {
    const text = typeof card?.statement === "string" ? card.statement.trim() : "";
    if (!text) throw new Error("attachReadingView: a card is missing its statement");
    return text;
  });
  const draft = statements.join("\n");
  const rows = [];
  for (const statement of statements) {
    rows.push(await readOne(statement, draft, sourceText, run));
  }
  const feedback = await writerNote(draft, run);
  const nextCards = cards.map((card, index) => {
    const row = rows[index];
    const refused = row.note?.refused === true;
    const next = applyReadingContract(card, {
      facts: row.facts,
      note: row.note,
    });
    if (refused) {
      next.noteWithheld = { reason: row.withheldReason || "refused", line: READER_LINES.noteWithheld };
      next.noteWithheldLine = READER_LINES.noteWithheld;
    }
    if (Array.isArray(row.rejections) && row.rejections.length) {
      next.noteRejections = row.rejections;
    }
    if (Array.isArray(row.silences) && row.silences.length) {
      next.silences = [...(Array.isArray(next.silences) ? next.silences : []), ...row.silences];
    }
    if (row.note?.bucket === "wording") {
      next.silences = [
        ...(Array.isArray(next.silences) ? next.silences : []),
        { id: "wording_note_withheld", reason: "a wording note is recorded and not shown", count: 1 },
      ];
    }
    return next;
  });
  const header = draftHeader(nextCards.map((card) => ({
    facts: card.readingFacts,
    sentenceState: card.sentenceState,
    note: card.readingNote,
  })));
  return {
    cards: nextCards,
    reading: {
      header: {
        stamp: header.stamp,
        numbers: header.numbers,
        line: header.line,
        footnote: header.footnote,
      },
      ...writerNoteFields(feedback),
      ...(feedback.writerFeedbackStatus === "withheld"
        ? { writerWithheldLine: READER_LINES.writerWithheld }
        : {}),
      model: READING_MODEL,
      spend,
      wordingNotesWithheld: header.counts.wordingNotes,
      sentences: nextCards.map((card, index) => ({
        index,
        text: statements[index],
        tier: card.tier,
        sentenceState: card.sentenceState,
        sentenceLabel: card.sentenceLabel,
        displayVerdict: card.displayVerdict || null,
        wordingLine: null,
        ...(card.sentenceState === "partial" ? { partialLine: partialSentence(card) } : {}),
        note: noteForReader(card.readingNote),
        ...(card.noteWithheldLine ? { noteWithheldLine: card.noteWithheldLine } : {}),
        facts: card.readingFacts,
      })),
    },
  };
}

function statementText(row) {
  return typeof row?.text === "string" && row.text
    ? row.text
    : typeof row?.statement === "string"
      ? row.statement
      : "";
}

/**
 * Which stored statements are no longer in the draft, found by their text.
 * Adjacent changes cannot be separated and are refused.
 */
export function statementChanges(statements, draft) {
  if (typeof draft !== "string") throw new Error("recheck: draft is missing");
  const rows = Array.isArray(statements) ? statements : null;
  if (!rows) throw new Error("recheck: statements are missing");
  for (const row of rows) {
    if (!statementText(row)) throw new Error("recheck: a statement is missing its text");
  }
  const spans = locateStatements(draft, rows.map((row) => statementText(row)));
  const foundAt = spans.map((span) => (span ? span.start : -1));
  const changes = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (foundAt[i] >= 0) continue;
    const neighbourChanged = [i - 1, i + 1].some((j) => j >= 0 && j < rows.length && foundAt[j] < 0);
    if (neighbourChanged) {
      throw new Error(`recheck: statement ${i} changed next to another changed statement. Run Review.`);
    }
    let start = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (spans[j]) {
        start = spans[j].end;
        break;
      }
    }
    let end = draft.length;
    for (let j = i + 1; j < rows.length; j += 1) {
      if (foundAt[j] >= 0) {
        end = foundAt[j];
        break;
      }
    }
    const raw = draft.slice(start, end);
    const text = raw.trim();
    if (!text) throw new Error(`recheck: statement ${i} changed and its new text is empty`);
    const hit = locateStatementAt(draft, text, spans.filter(Boolean));
    if (!hit) throw new Error(`recheck: statement ${i} changed and its new text is not in the draft`);
    changes.push({
      index: Number.isInteger(rows[i].index) ? rows[i].index : i,
      text,
      start: hit.start,
      end: hit.end,
    });
  }
  return { foundAt, spans, changes };
}

export function decisionsAfterRecheck(decisions, entries, staleIndexes) {
  const stale = new Set((Array.isArray(staleIndexes) ? staleIndexes : []).map((index) => String(index)));
  const byEntry = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (typeof entry?.id === "string") byEntry.set(entry.id, entry);
  }
  const kept = {};
  const cleared = [];
  const source = decisions && typeof decisions === "object" ? decisions : {};
  for (const [id, decision] of Object.entries(source)) {
    const entry = byEntry.get(id);
    const sid = entry ? String(entry.statementId ?? "") : "";
    if (sid && stale.has(sid)) cleared.push(id);
    else kept[id] = decision;
  }
  return { kept, cleared };
}

/** One mark per span. A grouped house-style concern carries every occurrence. */
export function marksEntriesFromConcerns(concerns, text, index) {
  const out = [];
  for (const concern of Array.isArray(concerns) ? concerns : []) {
    const spans = Array.isArray(concern?.span) ? concern.span : concern?.span ? [concern.span] : [];
    const rule = concern?.concernCode || concern?.rule || "unnamed";
    for (const span of spans) {
      const startChar = Number(span?.startChar);
      const endChar = Number(span?.endChar);
      if (!Number.isInteger(startChar) || !Number.isInteger(endChar) || endChar <= startChar) continue;
      const quote = text.slice(startChar, endChar);
      if (!quote) continue;
      out.push({
        id: `S${index}:editorial:${rule}:${out.length}`,
        statementId: String(index),
        statement: text,
        rule: String(rule),
        thing1: { quote, startChar, endChar },
      });
    }
  }
  return out;
}

function excerptOf(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.passage === "string") return value.passage;
  return null;
}

async function reviewChangedStatement({ text, index, draft, statement, outputType, requiredVersion, authoringOrganisation, spend }) {
  return reviewStatementConcerns({
    sentenceText: text,
    outputType,
    requiredVersion,
    draftText: draft,
    authoringOrganisation,
    statementIndex: index,
    primaryExcerpt: excerptOf(statement?.primaryExcerpt),
    conflictExcerpt: excerptOf(statement?.conflictExcerpt),
    spend,
  });
}

/**
 * Fact match is deterministic. The note is one model call per changed
 * statement. A changed statement also re-runs editorial-and-style and
 * compliance, two further calls. Unchanged statements are returned as sent.
 * A decision on a changed statement is cleared.
 */
export async function recheckStatements({
  draft,
  statements,
  sources,
  entries,
  decisions,
  complete,
  reviewStatement,
  outputType,
  requiredVersion,
  authoringOrganisation,
} = {}) {
  const sourceText = readingSourceText(sources);
  const rows = Array.isArray(statements) ? statements : [];
  const aligned = statementChanges(rows, draft);
  const spend = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    costUsd: 0,
    listUsd: 0,
    reviewerCalls: 0,
    reviewerCostUsd: 0,
  };
  const run = complete || ((messages, spanName) => defaultComplete(messages, spanName, spend));
  const review = reviewStatement || reviewChangedStatement;
  const stale = new Set(aligned.changes.map((change) => change.index));
  const next = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const index = Number.isInteger(row.index) ? row.index : i;
    const change = aligned.changes.find((item) => item.index === index);
    if (!change) {
      next.push({
        ...row,
        index,
        text: statementText(row),
        draftSpan: { startChar: aligned.spans[i].start, endChar: aligned.spans[i].end },
        stale: false,
      });
      continue;
    }
    const read = await readOne(change.text, draft, sourceText, run);
    const reviewerSpend = { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0 };
    const reviewed = await review({
      text: change.text,
      index,
      draft,
      statement: row,
      outputType: outputType || row.outputType,
      requiredVersion: requiredVersion || row.requiredVersion,
      authoringOrganisation,
      spend: reviewerSpend,
    });
    if (!reviewed || !Array.isArray(reviewed.editorialConcerns) || !Array.isArray(reviewed.complianceConcerns)) {
      throw new Error(`recheck: statement ${index} reviewer did not return concerns`);
    }
    if (typeof reviewed.editorialVerdict !== "string" || typeof reviewed.complianceVerdict !== "string") {
      throw new Error(`recheck: statement ${index} reviewer did not return a verdict`);
    }
    spend.reviewerCalls += reviewerSpend.calls;
    spend.reviewerCostUsd += reviewerSpend.costUsd;
    spend.inputTokens += reviewerSpend.inputTokens;
    spend.outputTokens += reviewerSpend.outputTokens;
    spend.cachedInputTokens += reviewerSpend.cachedInputTokens;
    spend.costUsd += reviewerSpend.costUsd;
    spend.listUsd += reviewerSpend.listUsd;
    const verdict = shownVerdict(statementVerdict({
      facts: read.facts,
      note: read.note,
      entries: reviewed.editorialConcerns,
    }), row.displayVerdict || row.qcCard?.displayVerdict);
    const combined = combinedVerdict({
      verdict,
      editorialConcerns: reviewed.editorialConcerns,
      complianceVerdict: reviewed.complianceVerdict,
      complianceConcerns: reviewed.complianceConcerns,
    });
    const prose = shownEvidenceProse(row.qcCard || row, verdict.state, noteForReader(read.note)?.text);
    const findings = cardEvidenceFindings(
      { statement: change.text, statementVerdict: verdict },
      reviewed.editorialConcerns,
    );
    const resolvedOrg = resolveAuthoringOrganisationName();
    const editorialConcerns = scrubConcernList(reviewed.editorialConcerns, resolvedOrg);
    const complianceConcerns = scrubConcernList(reviewed.complianceConcerns, resolvedOrg);
    const refused = read.note?.refused === true;
    const wording = read.note?.bucket === "wording";
    const built = {
      index,
      text: change.text,
      draftSpan: { startChar: change.start, endChar: change.end },
      facts: read.facts,
      note: noteForReader(read.note),
      ...(wording
        ? { wordingNoteWithheld: { count: 1, text: typeof read.note.text === "string" ? read.note.text : "" } }
        : {}),
      ...(refused
        ? {
            noteWithheld: { reason: read.withheldReason || "refused", line: READER_LINES.noteWithheld },
            noteWithheldLine: READER_LINES.noteWithheld,
          }
        : {}),
      ...(Array.isArray(read.rejections) && read.rejections.length ? { noteRejections: read.rejections } : {}),
      ...(Array.isArray(read.silences) && read.silences.length ? { silences: read.silences } : {}),
      sentenceState: verdict.state,
      statementVerdict: verdict,
      combinedVerdict: combined,
      ...(prose === null ? {} : { displayedEvidenceProse: prose }),
      evidenceFindings: findings,
      editorialConcerns,
      editorialVerdict: reviewed.editorialVerdict,
      complianceConcerns,
      complianceVerdict: reviewed.complianceVerdict,
      reviewerCalls: reviewerSpend.calls,
      reviewerCostUsd: reviewerSpend.costUsd,
      stale: true,
    };
    const source = row.qcCard && typeof row.qcCard === "object" ? row.qcCard : row;
    const sealed = sealReaderCard({
      ...source,
      ...built,
      matchExplanations: source.matchExplanations ?? row.matchExplanations,
      partialGround: source.partialGround ?? row.partialGround,
      evidenceSummary: source.evidenceSummary ?? row.evidenceSummary,
      supportState: source.supportState ?? row.supportState,
      displayVerdict: row.displayVerdict || source.displayVerdict || built.displayVerdict,
    });
    next.push({
      ...built,
      editorialConcerns: sealed.editorialConcerns,
      complianceConcerns: sealed.complianceConcerns,
      evidenceFindings: sealed.evidenceFindings,
      ...(sealed.displayedEvidenceProse !== undefined ? { displayedEvidenceProse: sealed.displayedEvidenceProse } : {}),
      ...(typeof sealed.reasoningParagraph === "string" ? { reasoningParagraph: sealed.reasoningParagraph } : {}),
      ...(sealed.sourceAccount === true
        ? {
            sourceAccount: true,
            sourceQuote: typeof sealed.sourceQuote === "string" ? sealed.sourceQuote : "",
            sourceDifference: typeof sealed.sourceDifference === "string" ? sealed.sourceDifference : "",
          }
        : {}),
      ...(Array.isArray(sealed.silences) && sealed.silences.length ? { silences: sealed.silences } : {}),
    });
  }
  const header = draftHeader(next.map((row) => ({
    facts: row.facts,
    sentenceState: row.sentenceState,
    note: row.wordingNoteWithheld ? { bucket: "wording", text: row.wordingNoteWithheld.text } : row.note,
  })));
  const freshEntries = next.flatMap((row) => (
    row.stale
      ? [
          ...marksEntriesFromConcerns(row.editorialConcerns, row.text, row.index),
          ...marksEntriesFromConcerns(row.complianceConcerns, row.text, row.index),
        ]
      : []
  ));
  const keptEntries = (Array.isArray(entries) ? entries : []).filter(
    (entry) => !stale.has(Number(entry?.statementId)),
  );
  const built = buildDraftMarks({
    draft,
    statements: next.map((row) => ({
      index: row.index,
      id: String(row.index),
      text: row.text,
      draftSpan: row.draftSpan,
      facts: row.facts,
      note: row.note,
    })),
    entries: [...keptEntries, ...freshEntries],
  });
  const decisionResult = decisionsAfterRecheck(decisions, entries, [...stale]);
  return {
    stale: [...stale],
    header: {
      stamp: header.stamp,
      numbers: header.numbers,
      line: header.line,
      footnote: header.footnote,
    },
    sentences: next,
    draftMarks: built.marks,
    droppedMarks: built.droppedCount,
    ...(droppedMarkSilence(built) ? { droppedMarkSilence: droppedMarkSilence(built) } : {}),
    clearedDecisionIds: decisionResult.cleared,
    decisions: decisionResult.kept,
    spend,
  };
}
