/**
 * B461. The sentence under a raised verdict.
 * It is a sentence the card already holds, or the evidence line the product
 * already writes from the stored passage. It is not a new explanation.
 * A wording note is not this sentence. A string that fails the endorsement
 * guard is not shown.
 */
import { evidenceLine, withoutEquivalence } from "./evidence-line.mjs";
import { partialReason } from "./partial-reason.mjs";
import { PARTIAL_UNRECORDED, partialSentence } from "./partial-sentence.mjs";
import { clearedNoteSentence } from "./reader-lines.mjs";
import { releaseReaderProse } from "./reader-prose-guard.mjs";
import { sourceCorpus } from "./quoted-span.mjs";
import { assertsAgreement } from "./source-account.mjs";
import { absenceOverQuote, floorState, liveContradiction, uncheckedLook } from "./contradiction-floor.mjs";
import { notCheckedReasonSentence } from "./not-reviewed-reason.mjs";
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

/**
 * A stop inside a quotation is not a sentence boundary.
 * A single quote opens a quotation only after a start, space, or bracket.
 */
export function readerSentences(text) {
  const body = String(text || "");
  const parts = [];
  let start = 0;
  let quote = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "\"") {
      quote = ch;
      continue;
    }
    if (ch === "'" && (i === 0 || /[\s(\[]/.test(body[i - 1]))) {
      quote = ch;
      continue;
    }
    if (!/[.!?]/.test(ch)) continue;
    let j = i + 1;
    while (j < body.length && /\s/.test(body[j])) j += 1;
    if (j > i + 1 && /[A-Z]/.test(body[j] || "")) {
      const sentence = body.slice(start, i + 1).trim();
      if (sentence) parts.push(sentence);
      start = j;
      i = j - 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function judge(text, source, withheld, corpus) {
  const body = clean(text);
  if (!body || body === PARTIAL_UNRECORDED) return "";
  if (assertsAgreement(body) || CONTRADICTION.test(body)) return "";
  const released = releaseReaderProse(body, corpus);
  if (released.withheld) {
    withheld.push({ source, phrase: released.phrase || "", text: body });
    return "";
  }
  return oneFullStop(released.text);
}

/**
 * The clause before ", which ...", when that relative clause is what the
 * guard refuses and the clause in front of it can be shown.
 * The period is the stop the relative clause had replaced with a comma.
 */
function keptSourceClause(sentence, source, withheld, corpus) {
  const match = sentence.match(/^(.*?),\s+which\b/i);
  if (!match) return "";
  let prefix = match[1].trim();
  if (!prefix) return "";
  if (!/[.!?]"?$/.test(prefix)) prefix = `${prefix}.`;
  return judge(prefix, source, withheld, corpus);
}

function accept(text, source, withheld, corpus) {
  const body = clean(text);
  if (!body || body === PARTIAL_UNRECORDED) return null;
  const parts = readerSentences(body);
  const kept = [];
  for (const part of parts) {
    const passed = judge(part, source, withheld, corpus) || keptSourceClause(part, source, withheld, corpus);
    if (passed) kept.push(passed);
  }
  if (!kept.length) return null;
  if (kept.length === parts.length) return judge(body, source, withheld, corpus) || kept.join(" ");
  return kept.join(" ");
}

/**
 * A reason for a card whose displayed sentence is empty.
 * source is stored when the sentence was already a field on the card,
 * clause when it is the source half of a stored note, quote when the
 * evidence line had to be written from the stored passage.
 */
function isPartialCard(card) {
  return raisedState(card) === "partial"
    || card?.supportState === "partial"
    || card?.displayVerdict === "supported_partial";
}

export function storedReaderReason(card) {
  const withheld = [];
  const state = raisedState(card);
  const note = clean(card?.readingNote?.text);
  const bucket = String(card?.readingNote?.bucket || "").toLowerCase();
  const wording = bucket === "wording";
  const corpus = sourceCorpus(card);
  const tried = [];

  const take = (source, text) => {
    const body = clean(text);
    if (!body || tried.includes(body)) return "";
    tried.push(body);
    if (wording && body === note) return "";
    return accept(body, source, withheld, corpus) || "";
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
  const corpus = sourceCorpus(card);
  const prose = clean(card?.displayedEvidenceProse);
  const finding = liveContradiction(card);
  const noteBucket = String(card?.readingNote?.bucket || "").toLowerCase();
  if (floorState(card) === "conflicts" && finding?.explanation && noteBucket !== "conflicts") {
    const withheld = [];
    const explained = accept(finding.explanation, "contradiction", withheld, corpus);
    if (explained) return { text: explained, source: "contradiction", withheld };
  }
  if (isPartialCard(card) && (!prose || prose === PARTIAL_UNRECORDED)) {
    const composed = partialReason(card);
    if (composed) {
      const withheld = [];
      const hit = accept(composed, "partial", withheld, corpus);
      if (hit) return { text: hit, source: "partial", withheld };
    }
  }
  if (prose && prose !== PARTIAL_UNRECORDED) {
    const withheld = [];
    const hit = accept(prose, "displayedEvidenceProse", withheld, corpus);
    if (hit) return { text: hit, source: "prose", withheld };
    const filled = storedReaderReason(card);
    return { ...filled, withheld: [...withheld, ...filled.withheld] };
  }
  if (prose === PARTIAL_UNRECORDED) {
    return { text: PARTIAL_UNRECORDED, source: "prose", withheld: [] };
  }
  const cleared = clearedNoteSentence(card);
  if (cleared) return { text: cleared, source: "cleared", withheld: [] };
  return storedReaderReason(card);
}

export function readerEvidenceSentence(card) {
  if (uncheckedLook(card)) {
    const sentence = notCheckedReasonSentence(card.evidenceNotReviewedReason);
    if (!sentence) throw new Error("readerEvidenceSentence: the check did not run and the reason is missing");
    return sentence;
  }
  const account = readerEvidenceAccount(card);
  if (!account) return null;
  if (!account.text) return account.text;
  const replaced = absenceOverQuote(card, account.text);
  if (replaced === null) return "";
  return replaced || account.text;
}
