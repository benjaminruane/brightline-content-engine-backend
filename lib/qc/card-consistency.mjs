/**
 * B563. The verdict stands. Prose that contradicts it is replaced with the
 * excerpt line, and the colour is brought into line with the label.
 * A compliance hard concern still colours a Nothing raised card red.
 */

import { evidenceLine } from "./evidence-line.mjs";
import { shownLabel, shownState } from "./shown-verdict.mjs";
import { toneForStatementVerdict } from "./statement-verdict.mjs";

const DENIES_SOURCE = /\b(?:not in the source|not supported(?: by)?|does not support|do not support|contradict(?:s|ed)?(?: by)?|do not address|does not address|do not mention|does not mention|sources do not|not mentioned in)\b/i;

const PROSE_FIELDS = ["reasoningParagraph", "evidenceSummary", "evidenceLine", "displayedEvidenceProse"];

function collapse(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function passageOf(value) {
  if (typeof value === "string") return collapse(value);
  if (value && typeof value === "object" && typeof value.passage === "string") return collapse(value.passage);
  return "";
}

function fileNameOf(card) {
  const values = Array.isArray(card?.readingNote?.documentValues) ? card.readingNote.documentValues : [];
  const doc = typeof values[0]?.document === "string" ? values[0].document : "";
  const label = card?.primaryExcerpt && typeof card.primaryExcerpt === "object"
    ? card.primaryExcerpt.sourceLabel
    : "";
  return collapse(doc || label || "");
}

function quoteOf(card) {
  const primary = passageOf(card?.primaryExcerpt) || passageOf(card?.primaryExcerptText);
  if (primary) return primary;
  const values = Array.isArray(card?.readingNote?.documentValues) ? card.readingNote.documentValues : [];
  for (const row of values) {
    const value = typeof row?.value === "string" ? collapse(row.value) : "";
    if (value) return value;
  }
  return "";
}

function standardLine(card) {
  return evidenceLine({
    fileName: fileNameOf(card),
    quote: quoteOf(card),
    noteText: "",
    noteBucket: "",
    statement: typeof card?.statement === "string" ? card.statement : "",
  });
}

function expectedTone(card) {
  const label = shownLabel(card);
  if (label === "Nothing raised" || label === "Nothing to raise") {
    return card?.summaryClass?.compliance === "hardConcern" ? "red" : "green";
  }
  return toneForStatementVerdict(shownState(card));
}

function proseBits(card) {
  const bits = [];
  for (const field of PROSE_FIELDS) {
    if (typeof card?.[field] === "string" && card[field].trim()) bits.push(card[field].trim());
  }
  const note = typeof card?.readingNote?.text === "string" ? card.readingNote.text.trim() : "";
  if (note) bits.push(note);
  return bits;
}

function namesBoth(text) {
  const body = String(text || "");
  const figures = new Set((body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((item) => item.replace(/,/g, "")));
  if (figures.size >= 2) return true;
  const quotes = body.match(/"[^"]{8,}"/g) || [];
  return quotes.length >= 2;
}

function shortForm(text) {
  const body = collapse(text);
  return /The source says .+; the draft says /.test(body) || /a different value/.test(body);
}

function explanationStands(text) {
  const body = collapse(text);
  if (!body || shortForm(body)) return false;
  if (namesBoth(body)) return true;
  return body.length >= 80 && /[.!?]/.test(body);
}

function spokenPassage(passage) {
  const body = collapse(passage);
  if (!body) return "";
  return /[.!?]$/.test(body) ? body : `${body}.`;
}

function conflictLine(card) {
  const note = collapse(card?.readingNote?.text);
  if (explanationStands(note)) return note;
  const primary = passageOf(card?.primaryExcerpt) || passageOf(card?.primaryExcerptText) || quoteOf(card);
  const other = passageOf(card?.conflictExcerpt);
  const left = spokenPassage(primary);
  const right = other && collapse(other) !== collapse(primary) ? spokenPassage(other) : "";
  if (left && right) return `The source says ${left} The draft says ${right}`;
  if (left) return `The source says ${left}`;
  const line = standardLine(card);
  if (line) return line;
  console.warn("[card-consistency] a Conflicts card is missing both passages");
  return "";
}

function amberReason(card) {
  const line = standardLine(card);
  if (line) return line;
  console.warn("[card-consistency] an amber card has no excerpt to quote");
  const label = shownLabel(card);
  if (label === "Goes beyond the source") return "This goes beyond the source.";
  if (label === "Not in the source") return "This is not in the source.";
  return "Needs a look.";
}

function writeProse(card, next) {
  for (const field of PROSE_FIELDS) {
    if (typeof card[field] === "string") card[field] = next;
  }
  if (!card.reasoningParagraph) card.reasoningParagraph = next;
  if (!card.evidenceSummary) card.evidenceSummary = next;
  if (card.readingNote && typeof card.readingNote === "object" && typeof card.readingNote.text === "string") {
    card.readingNote = { ...card.readingNote, text: next };
  }
}

function replaceDenials(card, next) {
  for (const field of PROSE_FIELDS) {
    if (typeof card[field] === "string" && DENIES_SOURCE.test(card[field])) card[field] = next;
  }
  if (card.readingNote && typeof card.readingNote === "object" && DENIES_SOURCE.test(card.readingNote.text || "")) {
    card.readingNote = { ...card.readingNote, text: next };
  }
}

function record(card, cases, entry) {
  cases.push(entry);
  const prior = card.diagnostics && typeof card.diagnostics === "object" ? card.diagnostics : {};
  const consistency = Array.isArray(prior.consistency) ? prior.consistency.slice() : [];
  consistency.push(entry);
  card.diagnostics = { ...prior, consistency };
}

/**
 * @param {object} card
 * @returns {{ kind: string, before: string, after: string }[]}
 */
export function enforceCardConsistency(card) {
  if (!card || typeof card !== "object") {
    throw new Error("enforceCardConsistency: card is missing");
  }
  const cases = [];
  const tone = expectedTone(card);
  const current = card?.summaryClass?.cardTone;
  if (tone && card.summaryClass && typeof card.summaryClass === "object" && current !== tone) {
    record(card, cases, { kind: "colour", before: String(current || ""), after: tone });
    card.summaryClass = { ...card.summaryClass, cardTone: tone };
  }

  const label = shownLabel(card);
  const quiet = card.summaryClass?.cardTone === "green" || label === "Nothing raised" || label === "Nothing to raise";
  const joined = proseBits(card).join("\n");

  if (quiet && DENIES_SOURCE.test(joined)) {
    const next = standardLine(card);
    const before = proseBits(card).filter((bit) => DENIES_SOURCE.test(bit)).join("\n");
    replaceDenials(card, next);
    record(card, cases, { kind: "prose", before, after: next });
  } else if (label === "Conflicts with the source" && !explanationStands(joined)) {
    const next = conflictLine(card);
    if (next && next !== joined.trim()) {
      const before = joined;
      writeProse(card, next);
      record(card, cases, { kind: "prose", before, after: next });
    }
  } else if (card.summaryClass?.cardTone === "amber" && !proseBits(card).some((bit) => bit.trim())) {
    const next = amberReason(card);
    writeProse(card, next);
    record(card, cases, { kind: "prose", before: "", after: next });
  }

  return cases;
}
