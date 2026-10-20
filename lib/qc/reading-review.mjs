/**
 * B404. Attaches the reading contract to an assembled review.
 * QC_READING_VIEW defaults on. Set it to 0 to leave the card untouched.
 * The note step is claude-opus-4-7. Temperature is omitted for that model.
 */
import {
  READING_NOTE_PROMPT,
  WRITER_FEEDBACK_PROMPT,
  acceptNote,
  applyReadingContract,
  buildFacts,
  draftHeader,
  missingBenchmarkCard,
  noteEndorses,
  sentenceState,
  settleFacts,
  shownOccurrences,
  suppressReassurance,
} from "./reading-contract.mjs";

export const READING_MODEL = "claude-opus-4-7";

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

async function defaultComplete(messages, spanName, spend) {
  const { calculateLlmCostUsd, callLLM } = await import("../observability.js");
  const result = await callLLM({
    provider: "anthropic",
    model: READING_MODEL,
    messages,
    temperature: null,
    seed: 1,
    responseFormat: "json",
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
  return { facts: settled, note: shown, sentenceState: sentenceState(settled, note) };
}

async function writerNote(draft, complete) {
  const firstText = await complete([
    { role: "system", content: WRITER_FEEDBACK_PROMPT },
    { role: "user", content: draft },
  ], "b404-writer");
  const first = parseJson(firstText);
  const firstNote = typeof first?.note === "string" ? first.note.trim() : "";
  if (firstNote && !noteEndorses(firstNote)) return { writerFeedback: firstNote, writerFeedbackStatus: "shown" };
  const secondText = await complete([
    { role: "system", content: WRITER_FEEDBACK_PROMPT },
    { role: "user", content: `${draft}\n\nThe previous note was refused. Write the note again without those words.` },
  ], "b404-writer-retry");
  const second = parseJson(secondText);
  const secondNote = typeof second?.note === "string" ? second.note.trim() : "";
  if (secondNote && !noteEndorses(secondNote)) return { writerFeedback: secondNote, writerFeedbackStatus: "shown" };
  return { writerFeedback: null, writerFeedbackStatus: "withheld" };
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
  const header = draftHeader(rows.map((row) => ({
    facts: row.facts,
    sentenceState: row.sentenceState,
    note: row.note?.refused ? null : row.note,
  })));
  const feedback = await writerNote(draft, run);
  const nextCards = cards.map((card, index) => applyReadingContract(card, {
    facts: rows[index].facts,
    note: rows[index].note?.refused ? null : rows[index].note,
    sentenceState: rows[index].sentenceState,
  }));
  return {
    cards: nextCards,
    reading: {
      header: {
        stamp: header.stamp,
        numbers: header.numbers,
        line: header.line,
        footnote: header.footnote,
      },
      writerFeedback: feedback.writerFeedback,
      writerFeedbackStatus: feedback.writerFeedbackStatus,
      model: READING_MODEL,
      spend,
      sentences: nextCards.map((card, index) => ({
        index,
        text: statements[index],
        tier: card.tier,
        sentenceState: card.sentenceState,
        sentenceLabel: card.sentenceLabel,
        wordingLine: card.wordingLine,
        note: card.readingNote,
        facts: card.readingFacts,
      })),
    },
  };
}
