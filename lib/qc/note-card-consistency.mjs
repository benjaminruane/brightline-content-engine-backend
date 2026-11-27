/**
 * B592. Drop Reviewer's note sentences that contradict the cards they were given.
 */
import { sentenceList } from "../text/sentences.mjs";

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cardLabel(card) {
  return clean(card?.sentenceLabel) || clean(card?.label) || clean(card?.combinedVerdict?.label);
}

function isQuiet(label) {
  return /nothing raised|nothing to raise/i.test(label);
}

function isConflict(label) {
  return /conflicts with the source/i.test(label);
}

function isBeyond(label) {
  return /goes beyond the source|not in the source/i.test(label);
}

function isNeedsLook(label) {
  return /needs a look/i.test(label);
}

const REASON_STOP = new Set(
  "a an the and or of to in on at for with by from as is are was were be been being that this these those it its their than then into over under about across between through while when where which who whom has have had do does did not no nor but if so such also more most other some any only own same too very just can could should would may might must shall will does do did source sentence draft".split(" "),
);

function contentWordSet(sentence) {
  const words = clean(sentence)
    .toLowerCase()
    .replace(/[^a-z0-9.%\s]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !REASON_STOP.has(word));
  return new Set(words);
}

function highContentOverlap(a, b) {
  const left = contentWordSet(a);
  const right = contentWordSet(b);
  if (!left.size || !right.size) return false;
  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared += 1;
  }
  const ratio = shared / Math.min(left.size, right.size);
  return shared >= 3 && ratio >= 0.55;
}

/**
 * Remove repeated "does not / not directly" clauses when several are joined.
 * B606 C3: also drop a later sentence with high content-word overlap of an earlier one.
 */
export function dedupeJoinedReason(text) {
  const body = clean(text);
  if (!body) return "";
  const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = [];
  const seen = new Set();
  for (const sentence of sentences) {
    const key = sentence
      .toLowerCase()
      .replace(/\b(?:does not|do not|did not|is not|are not|was not|were not)\b/g, "NEG")
      .replace(/\b(?:state|states|mention|mentions|say|says|use|uses|tie|ties|address|addresses|cover|covers)\b/g, "V")
      .replace(/\b(?:directly|explicitly|clearly|that|the|a|an|this|that)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (key && seen.has(key)) continue;
    if (kept.some((prior) => highContentOverlap(prior, sentence))) continue;
    if (key) seen.add(key);
    // Drop near-duplicates that only restate lack of support.
    const lack = /NEG\s+V|not\s+directly\s+address|not\s+addressed/.test(
      sentence.toLowerCase().replace(/\b(?:does not|do not)\b/g, "NEG").replace(/\b(?:state|mention|say|use|tie|address)\b/g, "V")
    );
    if (lack) {
      const lackKey = "lack-support";
      if (seen.has(lackKey)) continue;
      seen.add(lackKey);
    }
    kept.push(sentence);
  }
  return kept.join(" ");
}

/**
 * Drop or rewrite note sentences that contradict card labels.
 * @param {string} note
 * @param {Array<{label?: string, sentenceLabel?: string, reason?: string, tone?: string}>} cards
 */
export function stripNoteCardContradictions(note, cards) {
  const body = clean(note);
  if (!body) return "";
  const list = Array.isArray(cards) ? cards : [];
  const quiet = list.filter((card) => isQuiet(cardLabel(card)));
  const conflict = list.filter((card) => isConflict(cardLabel(card)));
  const beyond = list.filter((card) => isBeyond(cardLabel(card)));
  const needs = list.filter((card) => isNeedsLook(cardLabel(card)));
  const groundedDenied = list.filter((card) =>
    /source does not (?:use|state|mention)|does not appear in the source|goes beyond/i.test(clean(card?.reason))
  );

  const sentences = sentenceList(body);
  const kept = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (quiet.length && /overstat|overclaim|goes beyond|not supported|unsupported|unsupported claim/i.test(lower)) {
      // Calling a quiet draft an overstatement contradicts green cards.
      if (!conflict.length && !beyond.length && !needs.length) continue;
    }
    if (groundedDenied.length && /\b(?:grounded|well supported|faithfully reflects|matches the source wording)\b/i.test(lower)) {
      continue;
    }
    if (conflict.length && /\bno conflicts?\b|nothing conflicts|sources agree throughout/i.test(lower)) {
      continue;
    }
    if (beyond.length && /\bstays within the source|adds nothing beyond the source\b/i.test(lower)) {
      continue;
    }
    kept.push(sentence);
  }
  return kept.join(" ").trim();
}

/** Prompt lines listing each card's label and reason for the Reviewer's note. */
export function cardConsistencyPromptLines(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const lines = [];
  for (let i = 0; i < list.length; i += 1) {
    const card = list[i];
    const label = cardLabel(card) || "Nothing raised";
    const reason = clean(card?.reason) || clean(card?.shownReason) || "";
    lines.push(`Card ${i + 1}: ${label}${reason ? `: ${reason}` : ""}`);
  }
  if (!lines.length) return "";
  return [
    "The cards below are the review the writer already sees. Your note must not contradict them.",
    "Do not call a Nothing raised sentence an overstatement or unsupported claim.",
    "Do not say wording is grounded in the source when a card says the source does not use it.",
    "Stay consistent with each card's label and reason.",
    ...lines,
  ].join("\n");
}

/**
 * B604 F72. The Reviewer's note is written before the final stamps (rounding
 * rule, governing source, transaction status). Drop any note sentence that
 * quotes a sentence whose final card is quiet and still treats it as a
 * problem, unless the same note sentence also quotes a card that is raised.
 */
const NOTE_ISSUE = /match(?:es)? neither|does not match|mismatch|conflict|wrong|misstat|overstat|not supported|unsupported|use the final|which (?:is|figure is) final|check which|confirm which|goes beyond|not in the source|needs? (?:to be )?(?:fixed|corrected|reconcil)/i;

function statementKey(text) {
  const words = clean(text).toLowerCase().replace(/[^a-z0-9.%\s]/g, " ").split(/\s+/).filter(Boolean);
  return words.length >= 3 ? words.slice(0, Math.min(5, words.length)).join(" ") : "";
}

function normalised(text) {
  return clean(text).toLowerCase().replace(/[^a-z0-9.%\s]/g, " ").replace(/\s+/g, " ");
}

export function dropNoteSentencesAboutQuietCards(note, rows) {
  const body = clean(note);
  if (!body) return body;
  const list = Array.isArray(rows) ? rows : [];
  const quietKeys = [];
  const raisedKeys = [];
  for (const row of list) {
    const card = row?.qcCard || row || {};
    const key = statementKey(row?.text || card.statement);
    if (!key) continue;
    if (isQuiet(cardLabel(card))) quietKeys.push(key);
    else raisedKeys.push(key);
  }
  if (!quietKeys.length) return body;
  const kept = [];
  for (const sentence of sentenceList(body)) {
    const flat = normalised(sentence);
    const aboutQuiet = quietKeys.some((key) => flat.includes(key));
    const aboutRaised = raisedKeys.some((key) => flat.includes(key));
    if (aboutQuiet && !aboutRaised && NOTE_ISSUE.test(sentence)) continue;
    kept.push(sentence);
  }
  return kept.join(" ").trim() || body;
}

const SOUNDS_NEARLY_DONE = /\b(?:close to (?:final|release|ready|publication|done)|close to release-ready|nearly (?:ready|final|there)|almost (?:ready|final|there)|in good shape|ready to (?:go|publish|send)|only minor|just (?:a|one) (?:small|minor))/i;
const SOUNDS_FAR_OFF = /\b(?:significant (?:work|rework|revision|changes)|substantial (?:work|rework|revision)|major (?:rework|revision|changes)|not ready|needs? (?:a )?(?:full |major )?rewrite|a pass is needed)/i;

/**
 * B605. The note's opening sentence must not contradict the overall label.
 * "Close to final" under Needs significant work, or "significant rework" under
 * Ready or Minor points, is dropped. The rest of the note stays.
 */
export function alignNoteOpenerWithLabel(note, readiness) {
  const body = clean(note);
  if (!body || !readiness) return body;
  const sentences = sentenceList(body);
  if (sentences.length < 2) return body;
  const opener = sentences[0];
  const significant = readiness === "Needs significant work";
  const light = readiness === "Ready" || readiness === "Minor points to address";
  const clash = (significant && SOUNDS_NEARLY_DONE.test(opener))
    || (light && SOUNDS_FAR_OFF.test(opener));
  return clash ? sentences.slice(1).join(" ").trim() : body;
}
