/**
 * One reason line for a review card.
 * The short "source says / draft says" form is used only when both
 * values are the disputed pair. Otherwise the model's explanation is shown,
 * up to three whole sentences.
 */
import { sentenceList } from "../text/sentences.mjs";
import { applyDisplayHouseStyle } from "./note-house-style.mjs";

export const CHECK_UNFINISHED = "The check that reads the whole claim did not finish, so read this sentence against the source yourself.";
export const CHECK_UNFINISHED_REPLACEMENT = "We could not finish checking this sentence. Compare it with the passage below.";

const COMPARATIVE = /^(?:largest|smallest|second-largest|second-smallest|first|second|third|higher|lower|more|less|greater|fewer|biggest)$/i;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function firstSentences(text, max = 3) {
  return sentenceList(text).slice(0, max).join(" ");
}

function shortPair(text) {
  const match = clean(text).match(/^The source says (.+); the draft says (.+?)\.?$/);
  if (!match) return null;
  return { source: match[1], draft: match[2] };
}

function valueKind(value) {
  const text = String(value || "").trim();
  if (/\d/.test(text)) return "figure";
  if (COMPARATIVE.test(text)) return "comparative";
  if (/^[A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+)*$/.test(text)) return "name";
  return "";
}

/** True when both sides are the same kind of value and sit in the right text. */
export function shortFormIsReal(reason, sourceText, draftText) {
  const pair = shortPair(reason);
  if (!pair) return false;
  const source = String(sourceText || "");
  const draft = String(draftText || "");
  if (!source.includes(pair.source) || !draft.includes(pair.draft)) return false;
  const left = valueKind(pair.source);
  const right = valueKind(pair.draft);
  return Boolean(left) && left === right;
}

function noteText(card) {
  const note = card?.readingNote;
  if (!note || note.refused === true) return "";
  return clean(note.text);
}

export function sourceConflicts(card) {
  if (card?.readingNote?.bucket === "conflicts") return true;
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  return facts.some((fact) => fact?.status === "matched_disputed");
}

/** "Conflicts with the source" when the source has a different value. */
export function displayLabel(card) {
  const label = clean(card?.sentenceLabel);
  if (label === "Not in the source" && sourceConflicts(card)) return "Conflicts with the source";
  return label;
}

function usefulFacts(card) {
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  const out = [];
  for (const fact of facts) {
    if (fact?.status !== "matched") continue;
    const surface = clean(fact.surface);
    if (!surface || surface.length < 2) continue;
    if (fact.kind !== "figure" && fact.kind !== "date" && fact.kind !== "name") continue;
    if (fact.kind === "name" && surface.length < 4) continue;
    if (/^(in|the|and|a|an)$/i.test(surface)) continue;
    if (out.includes(surface)) continue;
    out.push(surface);
    if (out.length === 3) break;
  }
  return out;
}

export function sourceGivesLine(card) {
  const facts = usefulFacts(card);
  if (!facts.length) return "";
  if (facts.length === 1) return `The source gives ${facts[0]}.`;
  const last = facts[facts.length - 1];
  return `The source gives ${facts.slice(0, -1).join(", ")} and ${last}.`;
}

function unmatchedSurfaces(card) {
  const names = [];
  const elements = Array.isArray(card?.unmatchedElements) ? card.unmatchedElements : [];
  for (const element of elements) {
    const surface = clean(element?.surface);
    if (surface) names.push(surface);
  }
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  for (const fact of facts) {
    if (fact?.status !== "not_found") continue;
    const surface = clean(fact.surface);
    if (surface && !names.includes(surface)) names.push(surface);
  }
  return names;
}

function raised(card) {
  const label = clean(card?.sentenceLabel);
  if (label && label !== "Nothing raised") return true;
  const tone = card?.combinedVerdict?.tone || card?.summaryClass?.cardTone;
  return tone === "amber" || tone === "red";
}

function unfinished(text) {
  return clean(text).startsWith(CHECK_UNFINISHED.slice(0, 40));
}

function completeShown(shown, sourceText) {
  const whole = sentenceList(shown).filter((sentence) => /[.!?]$/.test(sentence) && !unfinished(sentence));
  if (whole.length && !shortPair(whole.join(" "))) return whole.slice(0, 3).join(" ");
  const quote = shown.match(/"([^"]{12,})/);
  if (!quote || !sourceText) return "";
  const needle = quote[1].slice(0, 24);
  const hit = sentenceList(sourceText).find((sentence) => sentence.includes(needle));
  return hit ? firstSentences(hit, 2) : "";
}

/**
 * The one reason the card shows. Empty only when the card has nothing to say.
 * @param {object} card
 * @param {{ sourceText?: string }} [opts]
 */
export function cardReason(card, opts = {}) {
  const note = noteText(card);
  const prose = clean(card?.displayedEvidenceProse);
  const line = clean(card?.evidenceLine);
  const shown = prose || line;
  const noteSentences = note ? firstSentences(note, 3) : "";
  let reason = "";

  if (noteSentences && shortPair(noteSentences) && shortFormIsReal(noteSentences, opts.sourceText || line, card?.statement || "")) {
    reason = noteSentences;
  } else if (noteSentences && shortPair(shown) && !shortFormIsReal(shown, opts.sourceText || "", card?.statement || "")) {
    reason = noteSentences;
  } else if (noteSentences && line && note.startsWith(line.replace(/\.$/, "")) && note.length > line.length + 8) {
    reason = noteSentences;
  } else if (noteSentences && (unfinished(shown) || unfinished(line))) {
    reason = noteSentences;
  } else if (noteSentences) {
    reason = noteSentences;
  } else if (unfinished(shown) || unfinished(line)) {
    reason = CHECK_UNFINISHED_REPLACEMENT;
  } else if (raised(card)) {
    const missing = unmatchedSurfaces(card);
    if (missing.length) {
      const lead = `'${missing[0]}' does not appear in the source.`;
      reason = noteSentences ? `${lead} ${noteSentences}` : lead;
    } else {
      reason = sourceGivesLine(card) || CHECK_UNFINISHED_REPLACEMENT;
    }
  } else {
    reason = sourceGivesLine(card) || completeShown(shown, opts.sourceText || "");
  }

  if (!reason) return "";
  return applyDisplayHouseStyle(reason);
}

const CRAFT_OFF = new Set(["voice_consistency", "first_person_plural", "materiality"]);

function concernText(concern) {
  return clean(concern?.note) || clean(concern?.concernText) || clean(concern?.text);
}

function concernCode(concern) {
  return clean(concern?.concernCode || concern?.rule || concern?.ruleId);
}

/** Concerns the card may show. Empty text is withheld. Voice and materiality stay off the card. */
export function visibleConcerns(concerns, { evidenceRaised = false } = {}) {
  const list = Array.isArray(concerns) ? concerns : [];
  return list.filter((concern) => {
    const text = concernText(concern);
    if (!text) return false;
    const code = concernCode(concern);
    if (CRAFT_OFF.has(code)) return false;
    if (/does not add meaningful information/i.test(text)) return false;
    if (evidenceRaised) return false;
    return true;
  });
}

/** Put the draft words in quotation marks when the comment cites them bare. */
export function quoteDraftPhrase(text, phrase) {
  const body = typeof text === "string" ? text : "";
  const cited = clean(phrase);
  if (!cited || cited.length < 2) return body;
  if (body.includes(`"${cited}"`) || body.includes(`'${cited}'`) || body.includes(`\u201C${cited}`)) return body;
  if (!body.includes(cited)) return body;
  return body.replaceAll(cited, `"${cited}"`);
}
