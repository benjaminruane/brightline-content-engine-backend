/**
 * One reason line for a review card.
 * The reason is the model's explanation, the first complete one, up to
 * three whole sentences. The "source says X; the draft says Y" form is
 * never shown. A file name is never shown.
 */
import { sentenceList } from "../text/sentences.mjs";
import { alignReason, factPassage } from "./fact-passages.mjs";
import { applyDisplayHouseStyle } from "./note-house-style.mjs";
import { unmatchedKeepsAmber } from "./shown-verdict.mjs";
import { dedupeJoinedReason } from "./note-card-consistency.mjs";

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
  const joined = dedupeJoinedReason(kept.join(" "));
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
  const aligned = alignReason(reason, factPassage(card).passage, card);
  return applyDisplayHouseStyle(shapeShownReason(aligned, card, opts));
}

/** Closings a green card may end on. Consecutive green cards rotate through this list. */
export const GREEN_CLOSINGS = [
  "in line with the sentence",
  "which supports the sentence",
  "as the sentence says",
  "consistent with the sentence",
];

const AGREEMENT_CLOSINGS = [
  ...GREEN_CLOSINGS,
  "in line with the statement",
  "which supports the statement",
  "as the statement says",
  "consistent with the statement",
  "matching the statement",
  "matching the sentence",
  "as stated",
];

function closingPattern() {
  const body = AGREEMENT_CLOSINGS
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`(?:,|\\s)\\s*(?:${body})\\.?$`, "i");
}

/** The whole closing clause, including the words that introduce the agreement phrase. */
const AGREEMENT_CLAUSE_TAILS = [
  "which is consistent with the statement",
  "which is consistent with the sentence",
  "which supports the statement",
  "which supports the sentence",
  "which is in line with the statement",
  "which is in line with the sentence",
  "is consistent with the statement",
  "is consistent with the sentence",
  "supports the statement",
  "supports the sentence",
  "in line with the statement",
  "in line with the sentence",
  "as the statement says",
  "as the sentence says",
  "consistent with the statement",
  "consistent with the sentence",
  "matching the statement",
  "matching the sentence",
  "as stated",
  "which is",
];

function agreementClausePattern() {
  const body = AGREEMENT_CLAUSE_TAILS
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`(?:\\s*,\\s*|\\s+and\\s+|\\s+)(?:${body})\\s*[.!?]?$`, "i");
}

const CLAUSE_VERB = /\b(is|are|was|were|be|been|being|has|have|had|do|does|did|say|says|said|state|states|stated|point|points|pointed|stand|stands|stood|describe|describes|described|show|shows|showed|give|gives|gave|report|reports|reported|come|came|make|made|run|runs|close|closed|reach|reached|spend|spends|spent|credit|credits|hold|holds|held|announce|announced|raise|raised|remain|remains|include|includes|included|reflect|reflects|reflected)\b/i;

function completeClause(text) {
  const body = clean(text).replace(/[.!?]+$/, "").trim();
  if (!body || body.split(/\s+/).length < 3) return false;
  if (/[,:;]\s*$/.test(body)) return false;
  if (/\b(which|that|and|or|but|as|to|of|for|with|in|the|a|an)\s*$/i.test(body)) return false;
  return CLAUSE_VERB.test(body);
}

function stripSentence(sentence) {
  const body = clean(sentence);
  if (!agreementClausePattern().test(body)) return body;
  const rest = body.replace(agreementClausePattern(), "").replace(/[,;]\s*$/, "").trim();
  if (!completeClause(rest)) return "";
  return ensurePeriod(rest);
}

function ensurePeriod(text) {
  const body = clean(text).replace(/[,;]\s*$/, "").trim();
  if (!body) return "";
  return /[.!?]["']?$/.test(body) ? body : `${body}.`;
}

export function stripAgreementClosing(text) {
  const body = clean(text);
  if (!body) return "";
  const kept = body.split(/(?<=[.!?])\s+/).map(stripSentence).filter(Boolean);
  return kept.join(" ");
}

/** Replace only a known closing at the end. The index picks the next phrase in the fixed list. */
export function varyClosing(text, index) {
  const body = clean(text);
  if (!Number.isInteger(index) || index < 0 || !closingPattern().test(body)) return body;
  const base = body.replace(closingPattern(), "").replace(/[,;]\s*$/, "").trim();
  const closing = GREEN_CLOSINGS[index % GREEN_CLOSINGS.length];
  if (!base) return ensurePeriod(closing.charAt(0).toUpperCase() + closing.slice(1));
  const stem = /[.!?]["']?$/.test(base) ? base.slice(0, -1).trim() : base;
  return `${stem}, ${closing}.`;
}

function groundText(card) {
  const ground = clean(card?.partialGround?.text);
  if (ground) return ground;
  return matchTexts(card)[0] || "";
}

function pointFromGround(text) {
  const body = clean(text);
  const match = body.match(/does not explicitly (state|mention|say|use)(?:\s+that)?\s+([\s\S]{0,240}?)\s*$/i);
  if (!match) return "";
  let point = match[2]
    .replace(/,?\s*which is an additional (?:checkable|evaluative) claim\.?$/i, "")
    .replace(/,?\s*(?:making|leaving|which makes) the statement [\w.]+\.?$/i, "")
    .replace(/,(['"])$/, "$1")
    .replace(/[.,]\s*$/, "")
    .trim();
  if (!point) return "";
  const verb = match[1].toLowerCase();
  const word = verb === "mention" ? "mention" : verb === "use" ? "use" : "state";
  if (/^['"]/.test(point)) return `The source does not ${word} ${point}.`;
  if (word === "state") return `The source does not state that ${point}.`;
  return `The source does not ${word} ${point}.`;
}

function dropUnmatchedClauses(text, surfaces) {
  const names = (Array.isArray(surfaces) ? surfaces : []).map((name) => name.toLowerCase()).filter(Boolean);
  if (!names.length) return ensurePeriod(text);
  const sentences = clean(text).split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = [];
  for (const sentence of sentences) {
    if (!names.some((name) => sentence.toLowerCase().includes(name))) {
      kept.push(sentence);
      continue;
    }
    const parts = sentence.split(/,\s+and\s+/i).filter((part) => !names.some((name) => part.toLowerCase().includes(name)));
    if (parts.length) kept.push(parts.join(", and "));
  }
  return ensurePeriod(kept.join(" "));
}

function localClause(statement, surface) {
  const text = String(statement || "");
  const at = text.toLowerCase().indexOf(String(surface || "").toLowerCase());
  if (at < 0) return text;
  const start = text.lastIndexOf(",", at);
  let end = text.indexOf(",", at + String(surface).length);
  if (end < 0) end = text.length;
  return text.slice(start < 0 ? 0 : start + 1, end);
}

function bestReferralLine(sourceText, statement, surface) {
  const lines = String(sourceText || "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 40 && !/^https?:/i.test(line) && !/^\d{2}\/\d{2}\/\d{4}/.test(line));
  const stop = new Set("the and for with from that this have been were was despite driven higher weaker their its".split(" "));
  const clause = localClause(statement, surface);
  const keys = (clause.toLowerCase().replace(String(surface || "").toLowerCase(), "").match(/[a-z]{5,}/g) || [])
    .filter((word) => !stop.has(word));
  const aboutDisruption = /tension|volatile|disruption|geopolit/i.test(clause);
  let best = "";
  let score = 0;
  for (const line of lines) {
    if (surface && line.toLowerCase().includes(String(surface).toLowerCase())) continue;
    let hits = keys.filter((word) => line.toLowerCase().includes(word)).length;
    if (aboutDisruption && /military operations against|closure of the strait/i.test(line)) hits += 5;
    if (hits > score) {
      score = hits;
      best = line;
    }
  }
  return best && score >= 1 ? best : "";
}

function refersTo(sourceText, statement, surface) {
  const best = bestReferralLine(sourceText, statement, surface);
  if (!best) return "";
  let shaped = best.replace(/^in late \S+\s+/i, "");
  shaped = shaped.replace(/^(.+?)\s+escalated\b[^,]*,\s*resulting in\s+/i, "$1 and ");
  shaped = shaped.replace(/\s+\b(?:of|the|a|an|and|to|in|for)\s*$/i, "").replace(/[.,;:]\s*$/, "").trim();
  if (!shaped || shaped.length > 180) return "";
  return shaped;
}

/** The source line an amber reason names, when the source says something else instead. */
export function referralSourceLine(card, sourceText) {
  const statement = card?.statement || card?.text || "";
  for (const surface of unmatchedSurfaces(card)) {
    if (/\d/.test(surface)) continue;
    const line = bestReferralLine(sourceText, statement, surface);
    if (line) return line;
  }
  return "";
}

function pointSentence(card, sourceText) {
  const fromGround = pointFromGround(groundText(card));
  if (fromGround) return fromGround;
  const missing = unmatchedSurfaces(card);
  if (!missing.length) return "";
  const surface = missing[0];
  const referral = refersTo(sourceText, card?.statement, surface);
  if (referral) return `The source does not use the words '${surface}'; it refers to ${referral}.`;
  return `The source does not use the words '${surface}'.`;
}

/**
 * Amber cards say what the source supports, then the point still in question.
 * Green cards keep one agreement closing, rotated when the review supplies an index.
 */
const AGREEMENT_ANYWHERE = /\b(?:supports|in line with|consistent with|as the (?:statement|sentence) says)\b/i;

function cleanedPartialExplanation(card) {
  const text = groundText(card)
    .replace(/,?\s*which is an additional (?:checkable|evaluative) claim\.?$/i, "")
    .replace(/,+\s*(['"])\s*$/, "$1")
    .replace(/,+\s*$/, "")
    .trim();
  return text ? ensurePeriod(text) : "";
}

function combinedTone(card) {
  const tone = card?.combinedVerdict?.tone;
  const state = card?.combinedVerdict?.state;
  let resolved = "";
  if (tone === "amber" || tone === "red" || tone === "green" || tone === "grey") resolved = tone;
  else if (state === "nothing_raised" || state === "nothing_to_raise") resolved = "green";
  else resolved = tone || "";
  if (resolved !== "amber" && resolved !== "red" && unmatchedKeepsAmber(card)) return "amber";
  return resolved;
}

export function shapeShownReason(text, card, opts = {}) {
  const tone = combinedTone(card);
  if (tone === "amber") {
    let base = clean(text);
    if (base && AGREEMENT_ANYWHERE.test(base)) {
      const partial = cleanedPartialExplanation(card);
      base = partial && !AGREEMENT_ANYWHERE.test(partial) ? partial : stripAgreementClosing(base);
    }
    base = dropUnmatchedClauses(base, unmatchedSurfaces(card));
    const point = pointSentence(card, opts.sourceText);
    if (!point) return base;
    const core = point
      .replace(/^The source does not (?:state that|mention|use(?: the words)?) /i, "")
      .replace(/\.$/, "")
      .replace(/^['"]|['"]$/g, "");
    if (core && base.toLowerCase().includes(core.toLowerCase())) return base;
    return dedupeJoinedReason(base ? `${base} ${point}` : point);
  }
  if (tone === "green" && Number.isInteger(opts.endingIndex)) return varyClosing(text, opts.endingIndex);
  return dedupeJoinedReason(clean(text));
}

/** How many earlier cards in this review are green. Null when this card is not green. */
export function greenEndingIndex(cards, index) {
  const list = Array.isArray(cards) ? cards : [];
  const card = list[index]?.qcCard || list[index];
  if (combinedTone(card) !== "green") return null;
  let count = 0;
  for (let i = 0; i < index; i += 1) {
    const row = list[i]?.qcCard || list[i];
    if (combinedTone(row) === "green") count += 1;
  }
  return count;
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
