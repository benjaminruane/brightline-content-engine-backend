/**
 * B454. The only door from stored prose to the reader.
 *
 * The reading note is refused in acceptNote. The craft note has its own list.
 * Everything else a model wrote for the screen comes through here, once,
 * whichever stage stored it. A failing string is not rewritten and is not
 * shown. The reader gets the line the partial path already uses when the
 * reason was not recorded. The failing phrase is a silence, not a sentence.
 *
 * NOTE_BANNED_PHRASES stays in the reading contract. This file does not
 * keep a second list.
 */
import { noteEndorsement } from "./reading-contract.mjs";
import { PARTIAL_UNRECORDED, partialSentence } from "./partial-sentence.mjs";
import { shownState } from "./shown-verdict.mjs";

export const READER_PROSE_SILENCE = "reader_prose_withheld";
export const READER_PROSE_UNRECORDED = PARTIAL_UNRECORDED;

const CONCERN_FIELDS = [
  "editorialConcerns",
  "complianceConcerns",
  "sourceRecencyConcerns",
  "framingFidelityConcerns",
];

const CONCERN_TEXT_KEYS = ["text", "note", "concernText"];

/**
 * @param {unknown} text
 * @returns {{ text: string, withheld: boolean, phrase: string|null }}
 */
export function releaseReaderProse(text) {
  if (typeof text !== "string") return { text: "", withheld: false, phrase: null };
  const body = text.trim();
  if (!body) return { text, withheld: false, phrase: null };
  const phrase = noteEndorsement(body);
  if (!phrase) return { text, withheld: false, phrase: null };
  return { text: READER_PROSE_UNRECORDED, withheld: true, phrase };
}

function isPartialCard(card) {
  return card?.supportState === "partial"
    || card?.displayVerdict === "supported_partial"
    || card?.sentenceState === "partial"
    || shownState(card) === "partial";
}

function pushSilence(silences, seen, field, phrase) {
  const key = `${READER_PROSE_SILENCE}|${field}|${phrase}`;
  if (seen.has(key)) return;
  seen.add(key);
  silences.push({
    id: READER_PROSE_SILENCE,
    field,
    reason: phrase,
    count: 1,
  });
}

function releaseField(text, field, silences, seen) {
  const released = releaseReaderProse(text);
  if (released.withheld) pushSilence(silences, seen, field, released.phrase);
  return released.text;
}

function releaseConcerns(list, field, silences, seen) {
  if (!Array.isArray(list)) return list;
  return list.map((row) => {
    if (!row || typeof row !== "object") return row;
    const next = { ...row };
    for (const key of CONCERN_TEXT_KEYS) {
      if (typeof next[key] !== "string" || !next[key].trim()) continue;
      next[key] = releaseField(next[key], field, silences, seen);
    }
    return next;
  });
}

/**
 * Returns a card whose reader-facing strings have passed the guard.
 * Stored matcher fields (evidenceSummary, matchExplanations, the reading
 * note, the craft note) are left as written. Verdict, state, label and tier
 * are not read for writing.
 *
 * @param {object} card
 */
export function sealReaderCard(card) {
  if (!card || typeof card !== "object") return card;
  const silences = [];
  const seen = new Set(
    (Array.isArray(card.silences) ? card.silences : [])
      .filter((row) => row && row.id === READER_PROSE_SILENCE)
      .map((row) => `${row.id}|${row.field}|${row.reason}`),
  );
  const next = { ...card };

  const storedProse = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse : "";
  const partialOnScreen = isPartialCard(card) && shownState(card) === "partial";
  if (isPartialCard(card)) {
    const raw = partialSentence(card);
    const released = releaseReaderProse(raw);
    if (released.withheld) pushSilence(silences, seen, "partialSentence", released.phrase);
    if (partialOnScreen) next.displayedEvidenceProse = released.text;
  }
  if (storedProse.trim() && !partialOnScreen) {
    next.displayedEvidenceProse = releaseField(storedProse, "displayedEvidenceProse", silences, seen);
  } else if (storedProse.trim() && partialOnScreen) {
    const released = releaseReaderProse(storedProse);
    if (released.withheld) pushSilence(silences, seen, "displayedEvidenceProse", released.phrase);
  }

  const commentary = typeof card.reasoningParagraph === "string" && card.reasoningParagraph.trim()
    ? card.reasoningParagraph
    : (typeof card.evidenceSummary === "string" ? card.evidenceSummary : "");
  if (commentary.trim()) {
    const released = releaseReaderProse(commentary);
    if (released.withheld) {
      pushSilence(silences, seen, "evidenceSummary", released.phrase);
      next.reasoningParagraph = released.text;
    }
  }

  for (const field of CONCERN_FIELDS) {
    if (Array.isArray(card[field])) {
      next[field] = releaseConcerns(card[field], field, silences, seen);
    }
  }

  if (Array.isArray(card.evidenceFindings)) {
    next.evidenceFindings = card.evidenceFindings.map((row) => {
      if (!row || typeof row.note !== "string" || !row.note.trim()) return row;
      return { ...row, note: releaseField(row.note, "evidenceFindings", silences, seen) };
    });
  }

  if (!silences.length) return next;
  next.silences = [...(Array.isArray(card.silences) ? card.silences : []), ...silences];
  return next;
}
