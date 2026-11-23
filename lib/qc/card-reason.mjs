/**
 * One reason line for a review card.
 * The reason is the model's explanation, the first complete one, up to
 * three whole sentences. The "source says X; the draft says Y" form is
 * never shown. A file name is never shown.
 */
import { sentenceList } from "../text/sentences.mjs";
import { applyDisplayHouseStyle } from "./note-house-style.mjs";

export const CHECK_UNFINISHED = "The check that reads the whole claim did not finish, so read this sentence against the source yourself.";
export const CHECK_UNFINISHED_REPLACEMENT = "We could not finish checking this sentence. Compare it with the passage below.";

const COMPARATIVE = /^(?:largest|smallest|second-largest|second-smallest|first|second|third|higher|lower|more|less|greater|fewer|biggest)$/i;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
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

function fileishName(name) {
  const body = String(name || "").trim();
  if (!body || body.length > 160) return false;
  if (/[.!?]/.test(body)) return false;
  if (/\b(says|said|gives|confirms)\b/i.test(body)) return false;
  if (/\.(html?|pdf|docx?|txt)\b/i.test(body)) return true;
  if (body.includes("|")) return true;
  if (/^Extract from\b/i.test(body)) return true;
  if (/^[A-Za-z0-9_./-]{2,80}$/.test(body)) return true;
  return body.split(/\s+/).length <= 8;
}

/** "report.html states \"...\"" becomes "The source says \"...\"". A real explanation is left as it is. */
export function withoutFileVoice(text) {
  const body = clean(text);
  const match = body.match(/^(.*?)\bstates\s+"/);
  if (!match || !fileishName(match[1])) return body;
  return `The source says "${body.slice(match[0].length)}`;
}

function titleInReason(text, card) {
  const body = clean(text);
  const titles = [card?.primaryRefTitle, ...(Array.isArray(card?.supportRefTitles) ? card.supportRefTitles : [])];
  return titles.some((title) => {
    const name = clean(title);
    return name.length > 12 && body.includes(name);
  });
}

function unusableReason(text, card) {
  const body = clean(text);
  if (!body) return true;
  if (/The source says .+; the draft says /.test(body)) return true;
  if (/a different value/.test(body)) return true;
  if (/\bstates\s+"/.test(body)) return true;
  if (/\.(html?|pdf|docx?|txt)\b/i.test(body)) return true;
  if (body.includes(" | ")) return true;
  if (/Which part was not recorded/.test(body)) return true;
  if (body.startsWith(CHECK_UNFINISHED.slice(0, 40))) return true;
  const quoted = body.match(/"([^"]*)"/);
  if (quoted && !/[.!?]$/.test(quoted[1].trim())) return true;
  if (titleInReason(body, card)) return true;
  return false;
}

function wholeReason(text, card) {
  const spoken = withoutFileVoice(text);
  if (!spoken || unusableReason(spoken, card)) return "";
  const sentences = sentenceList(spoken).filter((sentence) => /[.!?]["']?$/.test(sentence));
  const kept = [];
  for (const sentence of sentences) {
    if (unusableReason(sentence, card)) break;
    kept.push(sentence);
    if (kept.length === 3) break;
  }
  if (!kept.length) return "";
  const joined = kept.join(" ");
  return unusableReason(joined, card) ? "" : joined;
}

function matchTexts(card) {
  const rows = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const out = [];
  for (const row of rows) {
    const text = clean(row?.explanation) || clean(row?.text) || (typeof row === "string" ? clean(row) : "");
    if (text) out.push(text);
  }
  return out;
}

/**
 * The one reason the card shows. Empty only when the card has nothing to say.
 * The first complete explanation wins: a passed note, then the reading note,
 * then a match explanation, then the other stored lines.
 * @param {object} card
 * @param {{ sourceText?: string, notes?: string[] }} [opts]
 */
export function cardReason(card, opts = {}) {
  const extras = Array.isArray(opts.notes) ? opts.notes : [];
  const candidates = [
    ...extras,
    noteText(card),
    ...matchTexts(card),
    clean(card?.displayedEvidenceProse),
    clean(card?.evidenceLine),
    clean(card?.evidenceSummary),
    clean(card?.reasoningParagraph),
  ];
  let reason = "";
  for (const candidate of candidates) {
    const whole = wholeReason(candidate, card);
    if (whole) {
      reason = whole;
      break;
    }
  }
  if (!reason) {
    const shown = clean(card?.displayedEvidenceProse) || clean(card?.evidenceLine);
    if (unfinished(shown) || unfinished(clean(card?.evidenceLine))) {
      reason = CHECK_UNFINISHED_REPLACEMENT;
    } else if (raised(card)) {
      const missing = unmatchedSurfaces(card);
      if (missing.length) reason = `'${missing[0]}' does not appear in the source.`;
      else reason = sourceGivesLine(card) || CHECK_UNFINISHED_REPLACEMENT;
    } else {
      reason = sourceGivesLine(card);
    }
  }
  if (!reason || unusableReason(reason, card)) return "";
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
