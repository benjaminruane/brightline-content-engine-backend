/**
 * B402 reading contract, with the B403A note rules.
 *
 * Facts come from the B394 extractor in lib/qc/b394-elements.mjs.
 * scripts/diagnostic/b392/elements.mjs re-exports that module.
 * Card assembly calls this file through lib/qc/reading-review.mjs.
 *
 * A model may propose a note. This module accepts or refuses it. It does not
 * call a model. Sentence state is computed here, and a note can only escalate.
 */
import { benchmarksInSource, elementFound, extractElements, locateElement } from "./b394-elements.mjs";

export const STAMP = "Source-checked";

export const FOOTNOTE =
  "Every figure, date and name is checked against your source. The rest is one reader's view of what the source does and does not support.";

export const WELL_SOURCED_LINE =
  "Well sourced. Every figure, date and name in this draft appears in the source, and nothing reads as going beyond it.";

export const STATE_LABELS = {
  not_in_source: "Not in the source",
  conflicts: "Conflicts with the source",
  beyond: "Goes beyond the source",
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
  nothing_to_raise: "quiet",
};

export const BUCKETS = ["conflicts", "beyond", "wording", "none"];

export const NOTE_BANNED_PHRASES = [
  { phrase: "confirmed", pattern: /\bconfirmed\b/i },
  { phrase: "verified", pattern: /\bverified\b/i },
  { phrase: "correct", pattern: /\bcorrect\b/i },
  { phrase: "supported", pattern: /\bsupported\b/i },
  { phrase: "confirms the statement", pattern: /confirms the statement/i },
  { phrase: "confirms that", pattern: /confirms that/i },
  { phrase: "source confirms", pattern: /source confirms/i },
  { phrase: "aligns with", pattern: /aligns with/i },
  { phrase: "aligning with", pattern: /aligning with/i },
];

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

The note describes what the source says and what the statement says. It does not call the statement confirmed, verified, correct, or supported. It does not replace the statement's word with the source's word and then agree.`;

export const WRITER_FEEDBACK_PROMPT = `Write one short note to the writer about the draft as a whole.
Name what is strong and what is weak, as a pattern. Do not go sentence by sentence.
Do not call the draft confirmed, verified, correct, supported, clean, or ready to send.
Return JSON only: {"note":"..."}`;

export function noteEndorses(text) {
  const body = String(text || "");
  return NOTE_BANNED_PHRASES.some((row) => row.pattern.test(body));
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
 * reassures, the text is empty and the state label stands alone.
 */
export function suppressReassurance(note, facts) {
  if (!note || note.refused || typeof note.text !== "string") return note;
  const list = Array.isArray(facts) ? facts : [];
  if (!list.some((fact) => fact?.status === "not_found")) return note;
  const sentences = note.text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const kept = sentences.filter((sentence) => !REASSURANCE.some((pattern) => pattern.test(sentence)));
  const text = kept.join(" ");
  if (text === note.text.trim()) return note;
  return { ...note, text };
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
 */
export function settleFacts(facts, note) {
  if (!Array.isArray(facts)) {
    throw new Error("settleFacts: facts are missing");
  }
  const disputed =
    note &&
    note.refused !== true &&
    (note.bucket === "conflicts" || note.bucket === "beyond") &&
    Array.isArray(note.disputedIndices)
      ? new Set(note.disputedIndices)
      : new Set();
  return facts.map((fact, index) => {
    if (fact.status === "not_found" || fact.status === "matched_disputed") {
      return { ...fact };
    }
    if (fact.status === "matched" && disputed.has(index)) {
      return { ...fact, status: "matched_disputed" };
    }
    return { ...fact };
  });
}

/**
 * Strongest wins: not_in_source, conflicts, beyond, nothing_to_raise.
 * A wording note does not mark. A refused or missing note is note_withheld,
 * never null and never nothing_to_raise. not_found still wins over that.
 */
export function sentenceState(facts, note) {
  if (!Array.isArray(facts)) {
    throw new Error("sentenceState: facts are missing");
  }
  if (facts.some((fact) => fact.status === "not_found")) return "not_in_source";
  if (!note || note.refused === true || !BUCKETS.includes(note.bucket)) return "note_withheld";
  if (note.bucket === "conflicts") return "conflicts";
  if (note.bucket === "beyond") return "beyond";
  return "nothing_to_raise";
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
  let line = null;
  if (elementsNotFound > 0) {
    line =
      elementsNotFound === 1
        ? "1 fact is not in the source."
        : `${elementsNotFound} facts are not in the source.`;
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
export function applyReadingContract(card, reading) {
  if (!card || typeof card !== "object") {
    throw new Error("applyReadingContract: card is missing");
  }
  if (!reading || typeof reading !== "object") {
    throw new Error("applyReadingContract: reading is missing");
  }
  if (!STATE_LABELS[reading.sentenceState]) {
    throw new Error("applyReadingContract: sentenceState is missing");
  }
  const wording = reading.note?.bucket === "wording";
  return {
    ...card,
    readingFacts: reading.facts ?? null,
    readingNote: reading.note ?? null,
    wordingLine: wording ? "1 wording note" : null,
    sentenceState: reading.sentenceState,
    sentenceLabel: STATE_LABELS[reading.sentenceState],
    tier: sentenceTier(reading.sentenceState),
  };
}
