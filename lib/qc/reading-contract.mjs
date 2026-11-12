/**
 * B402 reading contract, with the B403A note rules.
 *
 * Facts come from the B394 extractor in lib/qc/b394-elements.mjs.
 * scripts/diagnostic/b392/elements.mjs re-exports that module.
 * Card assembly calls this file through lib/qc/reading-review.mjs.
 *
 * A model may propose a note. This module accepts or refuses it. It does not
 * call a model. Sentence state is statementVerdict in statement-verdict.mjs.
 */
import { benchmarksInSource, elementFound, extractElements, locateElement } from "./b394-elements.mjs";
import { endorsementPatterns } from "./endorsement-phrases.mjs";
import { combinedVerdict } from "./combined-verdict.mjs";
import { cardEvidenceFindings, shownEvidenceProse } from "./evidence-findings.mjs";
import { storedReaderReason } from "./reader-reason.mjs";
import { editorialVerdictWithoutCausal, entriesFromCard, statementVerdict } from "./statement-verdict.mjs";
import { evidenceLine } from "./evidence-line.mjs";
import { completionEffect, shownLabel, shownState, shownTier, shownVerdict } from "./shown-verdict.mjs";
import { writerNoteStyleBlock } from "./note-style-block.mjs";
import { plainReaderText } from "./reader-plain.mjs";
import { sealReaderCard } from "./reader-prose-guard.mjs";
export const STAMP = "Source-checked";

export const FOOTNOTE =
  "Every figure, date and name is checked against your source. The rest is one reader's view of what the source does and does not support.";

export const WELL_SOURCED_LINE =
  "Well sourced. Every figure, date and name in this draft appears in the source, and nothing reads as going beyond it.";

export const STATE_LABELS = {
  not_in_source: "Not in the source",
  conflicts: "Conflicts with the source",
  beyond: "Goes beyond the source",
  partial: "Partly in the source",
  nothing_raised: "Nothing raised",
  nothing_to_raise: "Nothing to raise",
  note_withheld: "Needs a look",
};

export const OCCURRENCES_SHOWN = 3;

/** A date with more lines than this is weak evidence. The card shows the count and no extracts. */
export const DATE_EXTRACT_LIMIT = 8;

export const TIERS = {
  not_in_source: "demands",
  conflicts: "demands",
  note_withheld: "demands",
  beyond: "light",
  partial: "light",
  nothing_raised: "quiet",
  nothing_to_raise: "quiet",
};

export const BUCKETS = ["conflicts", "beyond", "wording", "none"];

export const NOTE_BANNED_PHRASES = endorsementPatterns();

export const HEADER_BANNED = [
  { phrase: "verified", pattern: /\bverified\b/i },
  { phrase: "confirmed", pattern: /\bconfirmed\b/i },
  { phrase: "clean", pattern: /\bclean\b/i },
  { phrase: "checked-off", pattern: /checked-off/i },
  { phrase: "ready-to-send", pattern: /ready-to-send/i },
];

export const READING_NOTE_PROMPT = `Compare one statement with the source text. Return a JSON object with the fields bucket, note, and disputedIndices.

bucket is one word. The four words are conflicts, beyond, wording, and none. Use one of those words and no other text in that field.

Ask this before choosing a word: does the difference change what is being claimed, or only how it is said?

A difference changes the claim when it is a different benchmark, a different quantity, a different direction, a different subject, a different scope, or a different cause.

conflicts: the difference changes what is being claimed, and the source states something that cannot be true at the same time as the statement. A changed benchmark word is conflicts. A changed attribution is conflicts. A different quantity is conflicts when the source states the number.

beyond: the difference changes what is being claimed, and the source does not carry what the statement asserts. An added cause is beyond. An added adjective that adds a judgement the source does not state is beyond. A vaguer restatement of a figure the source gives precisely is beyond when the statement does not assert a different number. The note names that gap.

wording: the difference does not change what is being claimed. It is the same assertion in other words. A synonym is wording. An adjective that restates a judgement the source already makes is wording. "allowances for excess and obsolete inventory" against "excess and obsolete inventory" does not change the claim, so it is wording.

none: nothing worth saying. Only this bucket has an empty note, and disputedIndices is an empty array. conflicts, beyond, and wording each need a note of one or two sentences. An empty note on those three buckets is refused.

disputedIndices is an array of integers. Each integer is the position of a fact in the element list, starting at 0. Include an index only when the bucket is conflicts or beyond and the note is about that fact.

The note describes what the source says and what the statement says. The comparison is always against the source. It does not call the statement confirmed, verified, correct, or supported. It does not replace the statement's word with the source's word and then agree. It does not justify a finding by what the draft does or does not establish, by what the statement fails to show, or by saying the statement treats one thing as another. It does not write "the draft does not establish", "the draft does not warrant", "the statement treats", "without supporting context", or "the surrounding draft".

Each document is named above its own text, with its own date, or with the words no date. Weigh every document. Name the document a sentence came from. Do not call one document later, earlier, newer, or older when a document has no date, or when both documents carry the same date. When two documents give different values for what the statement asserts, the bucket is conflicts. Do not call that statement a restatement, and do not call it the same claim. Name which document gives which value.

documentValues is an array. Each object has document and value. One object for each document that gives a value for what the statement asserts. When the documents do not give such a value, the array is empty.

completion is one word: pending, predates, or none. pending: a document says completion is pending, subject to clearance or approval, or expected at a later date. predates: the only sources predate the deal and say nothing about completion. none: the statement is not about the state of the deal.

The state of a deal is a claim on three rungs. A proposal is a recommendation, a matter still under consideration, or an approval by a committee, and it binds nobody. A commitment is capital that is contractually pledged, for example signed and not yet completed. An investment is completed: the money has left and the fund holds it. A statement on a higher rung than any document supports is beyond. It is never wording. Where the documents give different rungs, the note names which document says which.

The note itself is plain words. Do not write rung, modality, or any internal category name. Say what each document says the deal is. When the state of the deal is the only difference the note reports, and no document says the deal has completed, end with: Adding the closing document will clear this. When the note also reports another difference, do not add that sentence.

A difference about the state of the deal is added to the other differences. It does not replace them. The note reports every difference it finds, in the same one or two sentences. When the source gives a stake to the group and its co-investors together, and the statement gives that stake to one amount alone, say that as well as the state of the deal.

A cause is part of the claim. When the statement gives a cause the document does not give, the bucket is beyond. When the statement gives a different cause from the one the document gives, the bucket is beyond, and the note names the cause the document gives. The right figure with the wrong driver is beyond: the document may give a margin lift from operating leverage on incremental revenue while the statement gives the broader cost base, and the note names the document's cause. A figure the statement attributes to one lever is beyond when the document names three, and the note names those three. This is not wording.`;

export const WRITER_FEEDBACK_PROMPT = `Write one short note to the writer about the draft as a whole.
Speak as a senior editor talking to a colleague. Say what is strong and what is weak, plainly.
Do not label the parts of the note and do not go sentence by sentence.
Where a weakness has a clear example in the draft, quote the example rather than describing the problem in the abstract.
Do not claim the draft has been checked against the source.
${writerNoteStyleBlock()}
Return JSON only: {"note":"..."}`;

export function noteEndorsement(text) {
  const body = String(text || "");
  const hit = NOTE_BANNED_PHRASES.find((row) => row.pattern.test(body));
  return hit ? hit.phrase : null;
}

export function noteEndorses(text) {
  return noteEndorsement(text) != null;
}

const REASSURANCE = [
  /does not change the claim/i,
  /does not change what is being claimed/i,
  /does not affect the claim/i,
  /no change to the claim/i,
  /same assertion/i,
];

/**
 * B369 in the reading contract. A note must not reassure on a sentence
 * that carries a not_found fact. The bucket is kept. If every sentence
 * reassures, the text is empty. The state does not change. The reader
 * sentence for that empty note is READER_LINES.noteCleared.
 */
export function suppressReassurance(note, facts) {
  if (!note || note.refused || typeof note.text !== "string") return note;
  const list = Array.isArray(facts) ? facts : [];
  if (!list.some((fact) => fact?.status === "not_found")) return note;
  const sentences = note.text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const kept = sentences.filter((sentence) => !REASSURANCE.some((pattern) => pattern.test(sentence)));
  const text = kept.join(" ");
  if (text === note.text.trim()) return note;
  const next = { ...note, text };
  if (!text) next.reassuranceCleared = true;
  return next;
}

function lineNumber(lineId) {
  const n = Number(String(lineId || "").replace(/^L/i, ""));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export function headerCopyBanned(text) {
  const body = String(text || "");
  return HEADER_BANNED.filter((row) => row.pattern.test(body)).map((row) => row.phrase);
}

function assertHeaderCopy(parts) {
  for (const part of parts) {
    if (!part) continue;
    const hits = headerCopyBanned(part);
    if (hits.length) {
      throw new Error(`header copy contains banned word: ${hits.join(", ")}`);
    }
  }
}

export function indexSourceLines(sourceText) {
  if (typeof sourceText !== "string") {
    throw new Error("indexSourceLines: sourceText is missing");
  }
  return sourceText.split("\n").map((text, index) => ({
    id: `L${index + 1}`,
    text: text.replace(/\r$/, ""),
  }));
}

/**
 * matcherLines is optional. Each row is { surface, lineId } from a matcher
 * that already knows the line. This function does not search the source
 * for the surface. A matched element with no matcher row is a line gap.
 */
export function buildFacts({ statement, draft, sourceText, matcherLines } = {}) {
  if (typeof statement !== "string" || !statement.trim()) {
    throw new Error("buildFacts: statement is missing");
  }
  if (typeof sourceText !== "string") {
    throw new Error("buildFacts: sourceText is missing");
  }
  const lines = indexSourceLines(sourceText);
  const reports = new Map();
  if (matcherLines != null) {
    if (!Array.isArray(matcherLines)) {
      throw new Error("buildFacts: matcherLines is not a list");
    }
    for (const row of matcherLines) {
      if (!row || typeof row.surface !== "string" || !row.surface) {
        throw new Error("buildFacts: a matcher row is missing surface");
      }
      if (typeof row.lineId !== "string" || !row.lineId) {
        throw new Error(`buildFacts: matcher row for ${row.surface} is missing lineId`);
      }
      reports.set(row.surface, row.lineId);
    }
  }
  const elements = extractElements(statement, typeof draft === "string" ? draft : statement, sourceText);
  return elements.map((element) => {
    const base = {
      kind: element.kind,
      surface: element.surface,
      start: element.start,
      end: element.end,
    };
    if (!elementFound(element, sourceText)) {
      const missing = { ...base, status: "not_found" };
      if (element.kind === "benchmark") missing.sourceBenchmarks = benchmarksInSource(sourceText);
      return missing;
    }
    const reported = reports.get(element.surface);
    const located = reported
      ? { occurrences: [lineFromReport(lines, reported, element.surface)], occurrenceCount: 1 }
      : locateElement(element, sourceText);
    if (!located || !located.occurrences.length) {
      return { ...base, status: "matched", lineGap: true, occurrenceCount: 0, occurrences: [] };
    }
    if (located.occurrenceCount !== located.occurrences.length) {
      throw new Error(`buildFacts: occurrence count for ${element.surface} does not match the list`);
    }
    const first = located.occurrences[0];
    const fact = {
      ...base,
      status: "matched",
      lineGap: false,
      occurrenceCount: located.occurrenceCount,
      occurrences: located.occurrences,
      lineId: first.lineId,
      extract: first.extract,
    };
    if (first.lineBeforeId) fact.lineBeforeId = first.lineBeforeId;
    if (first.lineAfterId) fact.lineAfterId = first.lineAfterId;
    return fact;
  });
}

function lineFromReport(lines, lineId, surface) {
  const index = lines.findIndex((row) => row.id === lineId);
  if (index < 0) {
    throw new Error(`buildFacts: matcher line ${lineId} is not in the source`);
  }
  const line = lines[index];
  if (!line.text.includes(surface)) {
    throw new Error(`buildFacts: matcher line ${lineId} does not contain ${surface}`);
  }
  const located = { lineId, extract: line.text };
  if (index > 0) located.lineBeforeId = lines[index - 1].id;
  if (index < lines.length - 1) located.lineAfterId = lines[index + 1].id;
  return located;
}

const KIND_PREFIX = /^(?:figure|date|name):\s*/i;

const QUOTED = /["“]([^"”]+)["”]/g;

function quotedPhrases(text) {
  const body = typeof text === "string" ? text : "";
  const out = [];
  for (const match of body.matchAll(QUOTED)) {
    const phrase = match[1].trim();
    if (phrase) out.push(phrase);
  }
  return out;
}

function wholeWord(surface, text) {
  if (!surface || !text) return false;
  const escaped = String(surface).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

function phraseCandidates(phrase) {
  const raw = String(phrase || "").trim();
  const trimmed = raw.replace(/^[\s,.;:]+|[\s,.;:]+$/g, "").trim();
  return trimmed && trimmed !== raw ? [raw, trimmed] : [raw];
}

/**
 * The note's own quotation marks, located in the statement.
 * A phrase that is not in the statement is not a mark.
 */
export function locatedDisputes(statement, note) {
  if (!note || note.refused === true) return [];
  if (note.bucket !== "conflicts" && note.bucket !== "beyond") return [];
  const text = typeof statement === "string" ? statement : "";
  const spans = [];
  const seen = new Set();
  for (const phrase of quotedPhrases(note.text)) {
    let hit = null;
    for (const candidate of phraseCandidates(phrase)) {
      if (candidate.length < 2 || !/[\p{L}\p{N}]/u.test(candidate)) continue;
      const at = text.toLowerCase().indexOf(candidate.toLowerCase());
      if (at >= 0) {
        hit = { start: at, end: at + candidate.length, surface: text.slice(at, at + candidate.length) };
        break;
      }
    }
    if (!hit) continue;
    const key = `${hit.start}:${hit.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    spans.push(hit);
  }
  return spans;
}

function surfaceInQuote(surface, noteText) {
  return quotedPhrases(noteText).some((phrase) => phraseCandidates(phrase).some((candidate) => wholeWord(surface, candidate) || candidate === surface));
}

function requestedDisputes(note) {
  if (Array.isArray(note.disputedIndices) && note.disputedIndices.length) return note.disputedIndices;
  if (Array.isArray(note.disputedElements)) return note.disputedElements;
  return [];
}

function resolveDispute(item, elements) {
  if (typeof item === "number" && Number.isInteger(item)) {
    if (item < 0 || item >= elements.length) {
      return { ok: false, reason: "index_out_of_range", index: item };
    }
    return { ok: true, index: item, via: "index" };
  }
  if (typeof item === "string" && item.trim()) {
    const stripped = item.replace(KIND_PREFIX, "").trim();
    const index = elements.findIndex((element) => element.surface === stripped);
    if (index < 0) return { ok: false, reason: "not_in_statement", surface: item };
    return { ok: true, index, via: "surface", surface: stripped };
  }
  return { ok: false, reason: "not_in_statement", surface: item };
}

/** Two documents give different values for what the statement asserts. */
export function documentsDisagree(note) {
  const rows = Array.isArray(note?.documentValues) ? note.documentValues : [];
  const values = rows
    .map((row) => (typeof row?.value === "string" ? row.value.trim().toLowerCase() : ""))
    .filter(Boolean);
  return new Set(values).size >= 2;
}

function keptDocumentValues(note) {
  if (!Array.isArray(note?.documentValues)) return null;
  const out = [];
  for (const row of note.documentValues) {
    if (!row || typeof row !== "object") continue;
    const document = typeof row.document === "string" ? row.document.trim() : "";
    const value = typeof row.value === "string" ? row.value.trim() : "";
    if (!document || !value) continue;
    out.push({ document, value });
  }
  return out.length ? out : null;
}

export function acceptNote(note, elements) {
  if (!note || typeof note !== "object") {
    return { ok: false, reason: "missing", rejections: [] };
  }
  if (!BUCKETS.includes(note.bucket)) {
    return { ok: false, reason: "bucket", rejections: [], schemaEcho: schemaEcho(note.bucket) };
  }
  const text = typeof note.text === "string" ? note.text : "";
  if (note.bucket !== "none" && !text.trim()) {
    return { ok: false, reason: "empty_note", rejections: [] };
  }
  if (noteEndorses(text)) {
    return { ok: false, reason: "endorsing_language", rejections: [] };
  }
  if ((note.bucket === "wording" || note.bucket === "none") && documentsDisagree(note)) {
    return { ok: false, reason: "documents_disagree", rejections: [] };
  }
  const completion = typeof note.completion === "string" ? note.completion.trim().toLowerCase() : "";
  if (completion && completion !== "pending" && completion !== "predates" && completion !== "none") {
    return { ok: false, reason: "completion", rejections: [] };
  }
  const list = Array.isArray(elements) ? elements : [];
  const rejections = [];
  const kept = [];
  for (const item of requestedDisputes(note)) {
    if (note.bucket === "wording") {
      rejections.push({ surface: item, reason: "wording_never_disputes" });
      continue;
    }
    if (note.bucket === "none") {
      rejections.push({ surface: item, reason: "none_never_disputes" });
      continue;
    }
    const resolved = resolveDispute(item, list);
    if (!resolved.ok) {
      rejections.push(resolved.surface != null ? { surface: resolved.surface, reason: resolved.reason } : { index: resolved.index, reason: resolved.reason });
      continue;
    }
    const surface = list[resolved.index]?.surface;
    const quotes = quotedPhrases(text);
    const named = quotes.length ? surfaceInQuote(surface, text) : wholeWord(surface, text);
    if (!named) {
      rejections.push({ surface, reason: "not_named" });
      continue;
    }
    kept.push(resolved.index);
  }
  const noteOut = {
    bucket: note.bucket,
    text,
    disputedIndices: kept,
    disputedElements: kept.map((index) => list[index].surface),
  };
  const replacements = keptReplacements(note, list);
  if (replacements) noteOut.replacements = replacements;
  if (completion) noteOut.completion = completion;
  const documentValues = keptDocumentValues(note);
  if (documentValues) noteOut.documentValues = documentValues;
  return {
    ok: true,
    note: noteOut,
    rejections,
  };
}

function keptReplacements(note, elements) {
  if (!Array.isArray(note?.replacements)) return null;
  const out = [];
  for (const row of note.replacements) {
    if (!row || typeof row !== "object") continue;
    const index = Number(row.index);
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!Number.isInteger(index) || index < 0 || index >= elements.length || !text) continue;
    out.push({ index, text });
  }
  return out;
}

function schemaEcho(bucket) {
  const text = String(bucket || "");
  return text.includes("|") || text === "conflicts|beyond|wording|none";
}

/**
 * The only status change a note may cause is matched -> matched_disputed.
 * not_found stays not_found. matched_disputed stays matched_disputed.
 * A wording or none note never disputes.
 * A matched fact is disputed only when the note names it. When the note
 * quotes its objection, a fact mentioned outside that quote stays matched.
 */
export function settleFacts(facts, note) {
  if (!Array.isArray(facts)) {
    throw new Error("settleFacts: facts are missing");
  }
  const active =
    note &&
    note.refused !== true &&
    (note.bucket === "conflicts" || note.bucket === "beyond");
  const noteText = typeof note?.text === "string" ? note.text : "";
  const quotes = quotedPhrases(noteText);
  const disputed =
    active && Array.isArray(note.disputedIndices) ? new Set(note.disputedIndices) : new Set();
  return facts.map((fact, index) => {
    if (fact.status === "not_found" || fact.status === "matched_disputed") {
      return { ...fact };
    }
    if (fact.status !== "matched" || !active) return { ...fact };
    const named = quotes.length ? surfaceInQuote(fact.surface, noteText) : disputed.has(index) && wholeWord(fact.surface, noteText);
    if (!named) return { ...fact };
    return { ...fact, status: "matched_disputed" };
  });
}

/**
 * The statement verdict's state. A wording note and a missing note do not
 * set a state. A refused note is note_withheld. Pass action entries when
 * the card has them. Omitting entries asks for the facts-and-note state only.
 */
export function sentenceState(facts, note, entries) {
  return statementVerdict({
    facts,
    note,
    entries: Array.isArray(entries) ? entries : [],
  }).state;
}

export function sentenceTier(state) {
  const tier = TIERS[state];
  if (!tier) throw new Error(`sentenceTier: sentenceState is missing (${state})`);
  return tier;
}

export function shownOccurrences(fact) {
  const occurrences = Array.isArray(fact?.occurrences) ? fact.occurrences : [];
  const count = Number.isInteger(fact?.occurrenceCount) ? fact.occurrenceCount : occurrences.length;
  if (fact?.kind === "date" && count > DATE_EXTRACT_LIMIT) {
    return { shown: [], more: null, countOnly: true, occurrenceCount: count };
  }
  const shown = occurrences.slice(0, OCCURRENCES_SHOWN);
  const rest = count - shown.length;
  return { shown, more: rest > 0 ? `and ${rest} more` : null, countOnly: false, occurrenceCount: count };
}

export function missingBenchmarkCard(fact) {
  if (!fact || fact.kind !== "benchmark" || fact.status !== "not_found") return null;
  const source = Array.isArray(fact.sourceBenchmarks) ? fact.sourceBenchmarks : [];
  let nearest = null;
  let nearestLine = Number.POSITIVE_INFINITY;
  for (const row of source) {
    const n = lineNumber(row.occurrences?.[0]?.lineId);
    if (n < nearestLine) {
      nearestLine = n;
      nearest = row;
    }
  }
  const ordered = [...source].sort(
    (a, b) => lineNumber(a.occurrences?.[0]?.lineId) - lineNumber(b.occurrences?.[0]?.lineId)
  );
  return {
    missing: `${fact.surface}, not in the source`,
    source: ordered.map((row) => {
      const first = row.occurrences?.[0] || {};
      const isNearest = row === nearest;
      return {
        word: row.word,
        occurrenceCount: row.occurrenceCount,
        lineId: isNearest ? (first.lineId || null) : null,
        extract: isNearest ? (first.extract || "") : "",
      };
    }),
  };
}

export function lightSourcedLine(light) {
  const count = light === 1 ? "1 statement goes" : `${light} statements go`;
  return `Well sourced. Every figure, date and name appears in the source. ${count} a little further than it does.`;
}

export function draftHeader(statements) {
  if (!Array.isArray(statements)) {
    throw new Error("draftHeader: statements are missing");
  }
  const facts = statements.flatMap((row) => (Array.isArray(row.facts) ? row.facts : []));
  const elementsMatched = facts.filter((fact) => fact.status === "matched").length;
  const elementsMatchedDisputed = facts.filter((fact) => fact.status === "matched_disputed").length;
  const elementsNotFound = facts.filter((fact) => fact.status === "not_found").length;
  const byState = {
    not_in_source: 0,
    conflicts: 0,
    beyond: 0,
    partial: 0,
    nothing_raised: 0,
    nothing_to_raise: 0,
    note_withheld: 0,
  };
  let wordingNotes = 0;
  const tiers = { demands: 0, light: 0, quiet: 0 };
  for (const row of statements) {
    if (row.sentenceState == null || byState[row.sentenceState] == null) {
      throw new Error(`draftHeader: sentenceState is missing (${row.sentenceState})`);
    }
    byState[row.sentenceState] += 1;
    tiers[sentenceTier(row.sentenceState)] += 1;
    if (row.note?.bucket === "wording") wordingNotes += 1;
  }
  const factsMatched = elementsMatched + elementsMatchedDisputed;
  const lookPhrase = tiers.demands === 1 ? "1 to look at" : `${tiers.demands} to look at`;
  const glancePhrase = tiers.light === 1 ? "1 worth a glance" : `${tiers.light} worth a glance`;
  const numberParts = [`${factsMatched} of ${facts.length} facts matched`];
  if (tiers.demands > 0) numberParts.push(lookPhrase);
  if (tiers.light > 0) numberParts.push(glancePhrase);
  const numbers = numberParts.join(" · ");
  const conflictLine =
    byState.conflicts === 1
      ? "1 statement conflicts with the source."
      : byState.conflicts > 1
        ? `${byState.conflicts} statements conflict with the source.`
        : "";
  let line = null;
  if (elementsNotFound > 0) {
    const factLine =
      elementsNotFound === 1
        ? "1 fact is not in the source."
        : `${elementsNotFound} facts are not in the source.`;
    line = conflictLine ? `${factLine} ${conflictLine}` : factLine;
  } else if (tiers.demands === 0) {
    line = tiers.light === 0 ? WELL_SOURCED_LINE : lightSourcedLine(tiers.light);
  } else if (byState.conflicts > 0) {
    line =
      byState.conflicts === 1
        ? "Figures all check out, but 1 statement conflicts with the source."
        : `Figures all check out, but ${byState.conflicts} statements conflict with the source.`;
  } else if (byState.note_withheld > 0 && byState.beyond === 0) {
    line =
      byState.note_withheld === 1
        ? "1 statement needs a look."
        : `${byState.note_withheld} statements need a look.`;
  }
  const header = {
    stamp: STAMP,
    numbers,
    line,
    footnote: FOOTNOTE,
    counts: {
      elementsMatched,
      elementsMatchedDisputed,
      elementsNotFound,
      wordingNotes,
      tiers,
      statements: byState,
    },
  };
  assertHeaderCopy([header.stamp, header.numbers, header.line, header.footnote]);
  return header;
}

/**
 * Adds the reading beside the card. Does not mutate the card and does not
 * delete displayVerdict, factualBadge, or any other field.
 */
/** The note the reader sees. A wording note stays on the card and is not this. */
export function noteForReader(note) {
  if (!note || note.refused === true || note.bucket === "wording") return null;
  if (typeof note.text !== "string") return note;
  return { ...note, text: plainReaderText(note.text) };
}

export function applyReadingContract(card, reading) {
  if (!card || typeof card !== "object") {
    throw new Error("applyReadingContract: card is missing");
  }
  if (!reading || typeof reading !== "object") {
    throw new Error("applyReadingContract: reading is missing");
  }
  if (!Array.isArray(reading.facts)) {
    throw new Error("applyReadingContract: facts are missing");
  }
  const verdict = shownVerdict(statementVerdict({
    facts: reading.facts,
    note: reading.note ?? null,
    entries: entriesFromCard(card),
  }), card.displayVerdict);
  if (!STATE_LABELS[verdict.state]) {
    throw new Error("applyReadingContract: sentenceState is missing");
  }
  const wording = reading.note?.bucket === "wording";
  const refused = reading.note?.refused === true;
  const noteText = typeof reading.note?.text === "string" ? reading.note.text : "";
  const readerNoteText = wording || refused ? "" : noteText;
  const quote = typeof card.sourceQuote === "string" && card.sourceQuote.trim()
    ? card.sourceQuote
    : (typeof card.primaryExcerptText === "string" ? card.primaryExcerptText : "");
  const line = noteText || quote
    ? evidenceLine({
        fileName: typeof card.primaryRefTitle === "string" ? card.primaryRefTitle : "",
        quote,
        noteText: refused ? "" : noteText,
        noteBucket: reading.note?.bucket || "",
        statement: typeof card.statement === "string" ? card.statement : "",
      })
    : "";
  const unmatchedElements = reading.facts
    .filter((fact) => fact && fact.status === "not_found")
    .map((fact) => ({ kind: fact.kind, surface: fact.surface }));
  const reasonCard = {
    ...card,
    readingNote: reading.note ?? card.readingNote ?? null,
    ...(line ? { evidenceLine: line } : {}),
  };
  let prose = shownEvidenceProse(reasonCard, verdict.state, readerNoteText);
  let reasonSilences = [];
  if (prose === "") {
    const reason = storedReaderReason(reasonCard);
    if (reason.text) prose = reason.text;
    else if (reason.withheld.length) {
      reasonSilences = reason.withheld.map(() => ({ id: "reader_prose_withheld", count: 1 }));
    }
  }
  const findings = cardEvidenceFindings(
    { ...card, statement: card.statement, statementVerdict: verdict },
    entriesFromCard(card),
  );
  return sealReaderCard({
    ...card,
    editorialVerdict: editorialVerdictWithoutCausal(card.editorialConcerns, card.editorialVerdict),
    statementVerdict: verdict,
    combinedVerdict: combinedVerdict({
      verdict,
      editorialConcerns: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
      complianceVerdict: typeof card.complianceVerdict === "string" ? card.complianceVerdict : null,
      complianceConcerns: Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [],
    }),
    readingFacts: reading.facts,
    unmatchedElements,
    ...(line ? { evidenceLine: line, evidenceSummary: line, reasoningParagraph: line } : {}),
    readingNote: refused
      ? { refused: true, ...(typeof reading.note?.reason === "string" && reading.note.reason ? { reason: reading.note.reason } : {}) }
      : (reading.note ?? null),
    ...(prose === null ? {} : { displayedEvidenceProse: prose }),
    ...(reasonSilences.length
      ? { silences: [...(Array.isArray(card.silences) ? card.silences : []), ...reasonSilences] }
      : {}),
    evidenceFindings: findings,
    wordingLine: null,
    ...(wording
      ? {
          wordingNoteWithheld: {
            count: 1,
            text: noteText,
          },
        }
      : {}),
    sentenceState: verdict.state,
    sentenceLabel: (() => {
      const labelCard = {
        statement: card.statement,
        statementVerdict: verdict,
        displayVerdict: card.displayVerdict,
        sentenceState: verdict.state,
        readingNote: reading.note ?? null,
      };
      const label = completionEffect(labelCard)
        ? shownLabel(labelCard)
        : shownLabel({ statementVerdict: verdict, displayVerdict: card.displayVerdict });
      return label || STATE_LABELS[verdict.state];
    })(),
    tier: (() => {
      const labelCard = {
        statement: card.statement,
        statementVerdict: verdict,
        displayVerdict: card.displayVerdict,
        sentenceState: verdict.state,
        readingNote: reading.note ?? null,
      };
      if (!completionEffect(labelCard)) return verdict.tier || shownTier(verdict.state);
      return shownTier(shownState(labelCard)) || verdict.tier;
    })(),
  });
}
