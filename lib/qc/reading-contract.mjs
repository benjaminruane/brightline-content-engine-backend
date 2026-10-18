/**
 * B402 reading contract.
 *
 * Facts come from the B394 extractor in scripts/diagnostic/b392/elements.mjs.
 * That file stays where it is. This module calls it. It is not on the Review
 * request path: card assembly does not import this file.
 *
 * A model may propose a note. This module accepts or refuses it. It does not
 * call a model. Sentence state is computed here, and a note can only escalate.
 */
import { elementFound, extractElements } from "../../scripts/diagnostic/b392/elements.mjs";

export const STAMP = "Source-checked";

export const FOOTNOTE =
  "Your facts are matched against the source and your interpretation is read and commented on. Your judgement still decides.";

export const WELL_SOURCED_LINE =
  "Well sourced. Every figure, date and name in this draft appears in the source, and nothing reads as going beyond it.";

export const STATE_LABELS = {
  not_in_source: "Not in the source",
  conflicts: "Conflicts with the source",
  beyond: "Goes beyond the source",
  worth_a_look: "Worth a look",
  nothing_to_raise: "Nothing to raise",
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

export const READING_NOTE_PROMPT = `Compare one statement with the source text. Return JSON only.

{"bucket":"conflicts|beyond|wording|none","note":"...","disputedElements":[]}

conflicts: the source says otherwise, including a different word in the same place. The note quotes the statement's word and the source's word.
beyond: the statement asserts something the source does not carry. The note names that gap and nothing else.
wording: the source carries the point and puts it differently.
none: nothing worth saying. The note is an empty string and disputedElements is empty.

disputedElements copies surfaces from the element list, and only when the bucket is conflicts or beyond and the note is about that element.

The note describes what the source says and what the statement says. It does not call the statement confirmed, verified, correct, or supported. It does not replace the statement's word with the source's word and then agree.`;

export const WRITER_FEEDBACK_PROMPT = `Write one short note to the writer about the draft as a whole.
Name what is strong and what is weak, as a pattern. Do not go sentence by sentence.
Do not call the draft confirmed, verified, correct, supported, clean, or ready to send.
Return JSON only: {"note":"..."}`;

export function noteEndorses(text) {
  const body = String(text || "");
  return NOTE_BANNED_PHRASES.some((row) => row.pattern.test(body));
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
      return { ...base, status: "not_found" };
    }
    const lineId = reports.get(element.surface);
    if (!lineId) {
      return { ...base, status: "matched", lineGap: true };
    }
    const index = lines.findIndex((row) => row.id === lineId);
    if (index < 0) {
      throw new Error(`buildFacts: matcher line ${lineId} is not in the source`);
    }
    const line = lines[index];
    if (!line.text.includes(element.surface)) {
      throw new Error(`buildFacts: matcher line ${lineId} does not contain ${element.surface}`);
    }
    const fact = {
      ...base,
      status: "matched",
      lineId,
      extract: line.text,
    };
    if (index > 0) fact.lineBeforeId = lines[index - 1].id;
    if (index < lines.length - 1) fact.lineAfterId = lines[index + 1].id;
    return fact;
  });
}

export function acceptNote(note, elements) {
  if (!note || typeof note !== "object") {
    return { ok: false, reason: "missing", rejections: [] };
  }
  if (!BUCKETS.includes(note.bucket)) {
    return { ok: false, reason: "bucket", rejections: [] };
  }
  const text = typeof note.text === "string" ? note.text : "";
  if (noteEndorses(text)) {
    return { ok: false, reason: "endorsing_language", rejections: [] };
  }
  const surfaces = new Set((Array.isArray(elements) ? elements : []).map((element) => element.surface));
  const requested = Array.isArray(note.disputedElements) ? note.disputedElements : [];
  const rejections = [];
  const kept = [];
  for (const surface of requested) {
    if (typeof surface !== "string" || !surface) {
      rejections.push({ surface, reason: "not_in_statement" });
      continue;
    }
    if (note.bucket === "wording") {
      rejections.push({ surface, reason: "wording_never_disputes" });
      continue;
    }
    if (note.bucket === "none") {
      rejections.push({ surface, reason: "none_never_disputes" });
      continue;
    }
    if (!surfaces.has(surface)) {
      rejections.push({ surface, reason: "not_in_statement" });
      continue;
    }
    kept.push(surface);
  }
  return {
    ok: true,
    note: { bucket: note.bucket, text, disputedElements: kept },
    rejections,
  };
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
    Array.isArray(note.disputedElements)
      ? new Set(note.disputedElements)
      : new Set();
  return facts.map((fact) => {
    if (fact.status === "not_found" || fact.status === "matched_disputed") {
      return { ...fact };
    }
    if (fact.status === "matched" && disputed.has(fact.surface)) {
      return { ...fact, status: "matched_disputed" };
    }
    return { ...fact };
  });
}

/**
 * Strongest state wins. A missing or refused note does not become
 * nothing_to_raise. not_found still wins over that refusal.
 */
export function sentenceState(facts, note) {
  if (!Array.isArray(facts)) {
    throw new Error("sentenceState: facts are missing");
  }
  if (facts.some((fact) => fact.status === "not_found")) return "not_in_source";
  if (!note || note.refused === true) return null;
  if (!BUCKETS.includes(note.bucket)) {
    throw new Error("sentenceState: bucket is missing");
  }
  if (note.bucket === "conflicts") return "conflicts";
  if (note.bucket === "beyond") return "beyond";
  if (note.bucket === "wording") return "worth_a_look";
  return "nothing_to_raise";
}

function countPhrase(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
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
    worth_a_look: 0,
    nothing_to_raise: 0,
    refused: 0,
  };
  for (const row of statements) {
    if (row.sentenceState == null) {
      byState.refused += 1;
      continue;
    }
    if (byState[row.sentenceState] == null) {
      throw new Error(`draftHeader: unknown state ${row.sentenceState}`);
    }
    byState[row.sentenceState] += 1;
  }
  const factsMatched = elementsMatched + elementsMatchedDisputed;
  const look = statements.length - byState.nothing_to_raise;
  const numbers = `${factsMatched} of ${facts.length} facts matched · ${countPhrase(look, "statement", "statements")} to look at`;
  let line = null;
  if (elementsNotFound > 0) {
    line =
      elementsNotFound === 1
        ? "1 fact is not in the source."
        : `${elementsNotFound} facts are not in the source.`;
  } else if (byState.conflicts > 0) {
    line =
      byState.conflicts === 1
        ? "Figures all check out, but 1 statement conflicts with the source."
        : `Figures all check out, but ${byState.conflicts} statements conflict with the source.`;
  } else if (byState.beyond > 0 && byState.worth_a_look === 0 && byState.refused === 0) {
    line =
      byState.beyond === 1
        ? "Figures all check out. 1 statement goes further than the source does."
        : `Figures all check out. ${byState.beyond} statements go further than the source does.`;
  } else if (
    byState.conflicts === 0 &&
    byState.beyond === 0 &&
    byState.worth_a_look === 0 &&
    byState.refused === 0
  ) {
    line = WELL_SOURCED_LINE;
  } else if (byState.refused > 0 && byState.beyond === 0 && byState.worth_a_look === 0) {
    line =
      byState.refused === 1
        ? "1 statement had a note the contract refused."
        : `${byState.refused} statements had a note the contract refused.`;
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
  const sentenceStateValue = reading.sentenceState ?? null;
  return {
    ...card,
    readingFacts: reading.facts ?? null,
    readingNote: reading.note ?? null,
    sentenceState: sentenceStateValue,
    sentenceLabel: sentenceStateValue ? STATE_LABELS[sentenceStateValue] : null,
  };
}
