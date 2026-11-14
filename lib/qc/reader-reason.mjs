/**
 * B461. The sentence under a raised verdict.
 * It is a sentence the card already holds, or the evidence line the product
 * already writes from the stored passage. It is not a new explanation.
 * A wording note is not this sentence. A string that fails the endorsement
 * guard is not shown.
 */
import { applyClearingLine } from "./clearing-line.mjs";
import { evidenceLine, withoutEquivalence } from "./evidence-line.mjs";
import { extractSourceAsOfDate } from "./source-recency.mjs";
import { partialReason } from "./partial-reason.mjs";
import { PARTIAL_UNRECORDED, partialSentence } from "./partial-sentence.mjs";
import { clearedNoteSentence } from "./reader-lines.mjs";
import { releaseReaderProse } from "./reader-prose-guard.mjs";
import { sourceCorpus } from "./quoted-span.mjs";
import { assertsAgreement } from "./source-account.mjs";
import { absenceOverQuote, floorState, liveContradiction, uncheckedLook } from "./contradiction-floor.mjs";
import { NOT_CHECKED_SENTENCES, notCheckedReasonSentence } from "./not-reviewed-reason.mjs";
import { shownState } from "./shown-verdict.mjs";
import { plainReaderText } from "./reader-plain.mjs";
import { transactionDemand } from "./transaction-state.mjs";

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
      fileName: sourceFileName(card),
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
  const noteText = clean(card?.readingNote?.text);
  const noteNamesIt = noteText && noteBucket !== "wording" && noteBucket !== "none";
  const matcherIsStatus = /\bmodality\b|\brungs?\b|status\/modality/i.test(finding?.explanation || "");
  if (floorState(card) === "conflicts" && finding?.explanation && noteBucket !== "conflicts" && !(noteNamesIt && matcherIsStatus)) {
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

function flatFigures(text) {
  return String(text || "").replace(/(\d),(?=\d)/g, "$1");
}

function figureTokens(value) {
  const tokens = [];
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let match;
  while ((match = re.exec(String(value || "")))) tokens.push(match[0].replace(/,/g, ""));
  return tokens;
}

function hasFigure(text, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\d.])${escaped}(?!\\d)(?!\\.\\d)`).test(flatFigures(text));
}

/** The two values a revision note gives, or null when the note does not give both. */
function revisionValues(note) {
  const body = clean(note);
  const match = /^The later source .+? dated .+? gives (.+) The earlier source .+? dated .+? gives (.+)$/.exec(body);
  if (!match) return null;
  const later = figureTokens(match[1].replace(/\.\s*$/, ""));
  const earlier = figureTokens(match[2].replace(/\.\s*$/, ""));
  if (!later.length || !earlier.length) return null;
  return { later, earlier };
}

function carriesBothFigures(text, note) {
  const values = revisionValues(note);
  const body = clean(text);
  if (!values || !body) return false;
  return values.later.every((token) => hasFigure(body, token))
    && values.earlier.every((token) => hasFigure(body, token));
}

/** True when this sentence already carries both figures from the revision note. */
export function reasonNamesRevision(text, note) {
  const body = clean(text);
  if (!body) return false;
  if (typeof note === "string" && carriesBothFigures(body, note)) return true;
  return carriesBothFigures(body, body);
}

function namesLaterDocument(existing, note) {
  return carriesBothFigures(existing, note);
}

/** Drop a stale-source note once the reason already carries both figures. */
export function sourceRecencyForReader(concerns, reason, note) {
  if (reasonNamesRevision(reason, note)) return [];
  return Array.isArray(concerns) ? concerns : [];
}

function sentenceFromAccount(card) {
  const account = readerEvidenceAccount(card);
  if (!account) return null;
  if (!account.text) return account.text;
  const replaced = absenceOverQuote(card, account.text);
  if (replaced === null) return "";
  return replaced || account.text;
}

function supersessionSentence(card, base) {
  const notes = Array.isArray(card?.supersededSourceNotes) ? card.supersededSourceNotes : [];
  const note = clean(notes[0]);
  if (!note) return "";
  if (note.startsWith("The later source ")) {
    if (namesLaterDocument(base, note)) return "";
    const corpus = sourceCorpus(card);
    const withheld = [];
    return accept(note, "revision", withheld, corpus) || "";
  }
  if (base) return "";
  if (note.startsWith("An older source (") || note.startsWith("The documents differ.")) return note;
  return "";
}

function shownSentence(text) {
  if (typeof text !== "string" || !text) return text;
  return plainReaderText(text);
}

function sourceFileName(card) {
  const title = clean(card?.primaryRefTitle).replace(/\.(pdf|txt|docx)$/i, "");
  if (title) return title;
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const named = matches.find((row) => clean(row?.sourceLabel));
  return named ? clean(named.sourceLabel) : "";
}

function diagnosticSourceText(label) {
  const name = clean(label);
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return "";
  if (typeof process === "undefined" || typeof process.getBuiltinModule !== "function") return "";
  try {
    const fs = process.getBuiltinModule("fs");
    const path = process.getBuiltinModule("path");
    const { fileURLToPath } = process.getBuiltinModule("url");
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/diagnostic/sources", `${name}.txt`);
    if (!fs.existsSync(file)) return "";
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function eurMillions(text) {
  const out = [];
  const re = /EUR\s+\d+(?:\.\d+)?\s+million/gi;
  let match;
  while ((match = re.exec(String(text || "")))) {
    const raw = match[0].replace(/\s+/g, " ");
    if (!out.includes(raw)) out.push(raw);
  }
  return out;
}

/**
 * The B480 revision, from the two passages on the card and the document dates.
 * The reading note is not an input.
 */
export function revisionFromReadings(card) {
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const confirmed = matches.find((row) => row?.classification === "confirmed" && clean(row?.sourceLabel));
  const conflicting = matches.find((row) => row?.classification === "conflicting" && clean(row?.sourceLabel));
  if (!confirmed || !conflicting) return "";
  const laterText = diagnosticSourceText(conflicting.sourceLabel);
  const earlierText = diagnosticSourceText(confirmed.sourceLabel);
  if (!laterText || !earlierText) return "";
  const laterAsOf = extractSourceAsOfDate(laterText);
  const earlierAsOf = extractSourceAsOfDate(earlierText);
  if (!laterAsOf?.date || !earlierAsOf?.date) return "";
  if (laterAsOf.date.getTime() <= earlierAsOf.date.getTime()) return "";
  const laterPassage = clean(card?.sourceQuote) || clean(card?.primaryExcerpt);
  const earlierPassage = clean(card?.conflictExcerpt);
  if (!laterPassage || !earlierPassage) return "";
  const statementValues = new Set(eurMillions(card?.statement).map((row) => row.toLowerCase()));
  const later = eurMillions(laterPassage).find((row) => !statementValues.has(row.toLowerCase()));
  const earlier = eurMillions(earlierPassage).find((row) => statementValues.has(row.toLowerCase()) && later && row.toLowerCase() !== later.toLowerCase());
  if (!later || !earlier) return "";
  return `The later source ${clean(conflicting.sourceLabel)} dated ${laterAsOf.raw} gives ${later}. The earlier source ${clean(confirmed.sourceLabel)} dated ${earlierAsOf.raw} gives ${earlier}.`;
}

function cardForReader(card) {
  if (!card || typeof card !== "object") return card;
  const prose = applyClearingLine(card.displayedEvidenceProse);
  const summary = applyClearingLine(card.evidenceSummary);
  const note = card.readingNote && typeof card.readingNote === "object"
    ? { ...card.readingNote, text: applyClearingLine(card.readingNote.text) }
    : card.readingNote;
  if (prose === card.displayedEvidenceProse && summary === card.evidenceSummary && note === card.readingNote) return card;
  return { ...card, displayedEvidenceProse: prose, evidenceSummary: summary, readingNote: note };
}

const REFUSED_BACKED_SENTENCE = "The figures in this sentence match the source. The check that reads the whole claim did not finish, so read this sentence against the source yourself.";

export function readerEvidenceSentence(card) {
  card = cardForReader(card);
  if (card?.readingNote?.refused === true && shownState(card) === "note_withheld") {
    return shownSentence(REFUSED_BACKED_SENTENCE);
  }
  if (uncheckedLook(card) || (shownState(card) === "note_withheld" && card?.readingNote?.refused !== true)) {
    const raw = card?.evidenceNotReviewedReason;
    const code = typeof raw === "string" ? raw.trim() : "";
    if (!Object.hasOwn(NOT_CHECKED_SENTENCES, code)) return "";
    const sentence = code ? notCheckedReasonSentence(code) : NOT_CHECKED_SENTENCES[""];
    if (!sentence) return "";
    return shownSentence(sentence);
  }
  const shift = transactionDemand(card);
  if (shift) return shownSentence(shift.sentence);
  const base = sentenceFromAccount(card);
  const filled = base === "" ? (revisionFromReadings(card) || "") : base;
  const directed = supersessionSentence(card, filled);
  if (!directed) return shownSentence(preferLongerExplanation(card, filled));
  const replaced = absenceOverQuote(card, directed);
  if (replaced === null) return "";
  return shownSentence(preferLongerExplanation(card, replaced || directed));
}

function coversSameGround(short, long) {
  if (!short || !long || long.length <= short.length) return false;
  if (!/\bnot\b/i.test(long)) return false;
  const norm = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(long).includes(norm(short));
}

/** The longer explanation, when it covers the same ground as the short sentence. */
function preferLongerExplanation(card, shown) {
  const text = typeof shown === "string" ? shown.trim() : "";
  if (!text) return shown;
  const rows = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  let best = text;
  for (const row of rows) {
    const candidate = typeof row?.explanation === "string" ? row.explanation.trim() : "";
    if (coversSameGround(best, candidate)) best = candidate;
  }
  return best;
}

const STOCK_EXPLANATIONS = [
  "A source supports part of this statement, not all of it. The wording is yours.",
  "The review found a concern in this sentence. No wording change is proposed, so you can judge it yourself.",
];

function explanationNorm(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function explanationSentences(text) {
  const out = [];
  let current = "";
  let quote = false;
  const source = explanationNorm(text);
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    current += ch;
    if (ch === "\"") quote = !quote;
    if (ch === "." && !quote && (i === source.length - 1 || source[i + 1] === " ")) {
      if (current.trim()) out.push(current.trim());
      current = "";
      if (source[i + 1] === " ") i += 1;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function stockSentence(sentence) {
  const plain = explanationNorm(sentence).replace(/\.+$/, "");
  return STOCK_EXPLANATIONS.some((line) => explanationNorm(line).replace(/\.+$/, "") === plain);
}

/** The explanation once. A quote already shown as an excerpt is not repeated. */
export function presentExplanation(text, excerpts) {
  if (text == null || text === "") return "";
  if (typeof text !== "string") throw new Error("presentExplanation: explanation is not text");
  let source = explanationNorm(text);
  for (const line of STOCK_EXPLANATIONS) {
    const plain = explanationNorm(line);
    if (source.includes(plain)) source = source.replaceAll(plain, " ");
  }
  const passages = (Array.isArray(excerpts) ? excerpts : [])
    .map((row) => explanationNorm(row).toLowerCase())
    .filter(Boolean);
  const kept = [];
  for (const sentence of explanationSentences(source)) {
    if (stockSentence(sentence)) continue;
    const stated = sentence.match(/^(.*) states "([^"]+)"\.?$/);
    if (stated) {
      const quote = explanationNorm(stated[2]).toLowerCase();
      if (quote && passages.some((passage) => passage.includes(quote))) continue;
    }
    kept.push(sentence);
  }
  return kept.join(" ");
}

export function isStockExplanation(text) {
  if (typeof text !== "string") return false;
  return stockSentence(text);
}
