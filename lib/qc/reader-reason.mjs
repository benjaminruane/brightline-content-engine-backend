/**
 * B461. The sentence under a raised verdict.
 * It is a sentence the card already holds, or the evidence line the product
 * already writes from the stored passage. It is not a new explanation.
 * A wording note is not this sentence. A string that fails the endorsement
 * guard is not shown.
 */
import { evidenceLine, withoutEquivalence } from "./evidence-line.mjs";
import { PARTIAL_UNRECORDED, partialSentence } from "./partial-sentence.mjs";
import { clearedNoteSentence } from "./reader-lines.mjs";
import { releaseReaderProse } from "./reader-prose-guard.mjs";
import { assertsAgreement } from "./source-account.mjs";
import { shownState } from "./shown-verdict.mjs";

const RAISED = new Set(["beyond", "conflicts", "not_in_source", "partial"]);
const CONTRADICTION = /\bconfirms\b|\bconfirmed\b|\bas stated\b|\baligns with\b/i;

function clean(text) {
  return typeof text === "string" ? text.trim() : "";
}

export function raisedState(card) {
  const state = shownState(card) || (typeof card?.sentenceState === "string" ? card.sentenceState : "");
  return RAISED.has(state) ? state : "";
}

function oneFullStop(text) {
  return String(text || "").replace(/\."\./g, '."');
}

function accept(text, source, withheld) {
  const body = clean(text);
  if (!body) return null;
  if (assertsAgreement(body) || CONTRADICTION.test(body)) return null;
  const released = releaseReaderProse(body);
  if (released.withheld) {
    withheld.push({ source, phrase: released.phrase || "", text: body });
    return null;
  }
  return oneFullStop(released.text);
}

/**
 * A reason for a card whose displayed sentence is empty.
 * source is stored when the sentence was already a field on the card,
 * clause when it is the source half of a stored note, quote when the
 * evidence line had to be written from the stored passage.
 */
export function storedReaderReason(card) {
  const withheld = [];
  const state = raisedState(card);
  const note = clean(card?.readingNote?.text);
  const bucket = String(card?.readingNote?.bucket || "").toLowerCase();
  const wording = bucket === "wording";
  const tried = [];

  const take = (source, text) => {
    const body = clean(text);
    if (!body || tried.includes(body)) return "";
    tried.push(body);
    if (wording && body === note) return "";
    return accept(body, source, withheld) || "";
  };

  const stored = [
    ["secondValue", state === "conflicts" ? card?.secondValueLine : ""],
    ["sourceDifference", card?.sourceDifference],
    ["evidenceSummary", card?.evidenceSummary],
    ["evidenceLine", card?.evidenceLine],
  ];
  for (const [source, text] of stored) {
    const hit = take(source, text);
    if (hit) return { text: hit, source: "stored", withheld };
  }

  const partialCard = state === "partial"
    || card?.supportState === "partial"
    || card?.displayVerdict === "supported_partial";
  if (partialCard) {
    const said = partialSentence(card);
    if (said && said !== PARTIAL_UNRECORDED) {
      const hit = take("partial", said);
      if (hit) return { text: hit, source: "stored", withheld };
    }
  }

  const clause = note ? withoutEquivalence(note, bucket) : "";
  const fromNote = take("noteClause", clause);
  if (fromNote) return { text: fromNote, source: "clause", withheld };

  const quote = clean(card?.sourceQuote) || clean(card?.primaryExcerpt);
  if (quote) {
    const line = evidenceLine({
      fileName: clean(card?.primaryRefTitle),
      quote,
      noteText: "",
      noteBucket: "",
      statement: clean(card?.statement),
    });
    const fromQuote = take("quote", line);
    if (fromQuote) return { text: fromQuote, source: "quote", withheld };
  }

  return { text: "", source: "none", withheld };
}

/**
 * The sentence the screen and the export both show for a raised verdict.
 * Null for every other state, which keeps the existing commentary.
 * An empty string means the reason is missing or the guard withheld it.
 */
export function readerEvidenceAccount(card) {
  const state = raisedState(card);
  if (!state) return null;
  const prose = clean(card?.displayedEvidenceProse);
  if (prose) {
    const withheld = [];
    const hit = accept(prose, "displayedEvidenceProse", withheld);
    if (hit) return { text: hit, source: "prose", withheld };
    const filled = storedReaderReason(card);
    return { ...filled, withheld: [...withheld, ...filled.withheld] };
  }
  const cleared = clearedNoteSentence(card);
  if (cleared) return { text: cleared, source: "cleared", withheld: [] };
  return storedReaderReason(card);
}

export function readerEvidenceSentence(card) {
  const account = readerEvidenceAccount(card);
  if (!account) return null;
  return account.text;
}
