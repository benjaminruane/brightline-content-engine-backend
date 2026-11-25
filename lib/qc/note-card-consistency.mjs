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

/**
 * Remove repeated "does not / not directly" clauses when several are joined.
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
