/**
 * B595. Final colour and reason rules applied after the stored card is built.
 * Deterministic. No model call.
 */
import { capAtSentenceBoundary } from "./note-card-consistency.mjs";

const GAP_LANGUAGE =
  /\b(does not|do not|doesn't|omit|missing|beyond|differ|instead|whereas|however|not address|not mention|not state|not give|broader|narrower|while the (?:source|sentence|statement|draft))\b/i;

const RELATIVE_TIME = /\b(today|this week|this month)\b/i;

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** True when every figure, date and name reading fact matched (or there are none). */
export function everyReadingFactMatched(card) {
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  const checkable = facts.filter((fact) => ["figure", "date", "name"].includes(fact?.kind));
  if (!checkable.length) return true;
  return checkable.every((fact) => fact?.status === "matched");
}

function rewriteGapNotes(card) {
  const out = [];
  const push = (row) => {
    if (!row || typeof row !== "object") return;
    const to = String(row.to || row.classification || "").toLowerCase();
    if (to !== "partially_confirmed" && to !== "conflicting" && to !== "conflict") return;
    const evidence = clean(row.evidence || row.explanation || row.reason || "");
    // span_outvote that only re-cites a source span is not a named gap.
    if (!evidence || !GAP_LANGUAGE.test(evidence)) return;
    // B607: never mid-word truncate; keep whole sentences under the old 160 cap.
    const capped = capAtSentenceBoundary(evidence, 160);
    if (capped) out.push(capped);
  };
  for (const row of Array.isArray(card?.classificationRewrites) ? card.classificationRewrites : []) push(row);
  for (const match of Array.isArray(card?.matchExplanations) ? card.matchExplanations : []) {
    for (const row of Array.isArray(match?.classificationRewrites) ? match.classificationRewrites : []) push(row);
  }
  return out;
}

/**
 * Specific missing or differing elements named by the matcher.
 * A span_outvote rewrite that only re-cites a source span does not count.
 */
export function matcherNamedGaps(card) {
  const named = [];
  for (const row of Array.isArray(card?.matchExplanations) ? card.matchExplanations : []) {
    const cls = String(row?.classification || "").toLowerCase();
    if (cls === "confirmed" || cls === "no_support") continue;
    const explanation = clean(row?.explanation);
    if (!explanation) continue;
    if (!GAP_LANGUAGE.test(explanation) && cls !== "partially_confirmed" && cls !== "conflicting") continue;
    const quoted = [...explanation.matchAll(/['"]([^'"]{3,80})['"]/g)].map((m) => m[1]);
    if (quoted.length) {
      named.push(...quoted);
      continue;
    }
    const after = explanation.match(
      /\b(?:does not (?:explicitly )?(?:state|mention|address|give|use)(?:\s+that)?|omits?|missing)\s+([^.]{3,120})/i
    );
    if (after) named.push(clean(after[1]).replace(/,?\s*which is an additional.*/i, ""));
    else if (cls === "conflicting" || cls === "partially_confirmed") {
      // B607: whole sentences only; never slice mid-word under the old 120 cap.
      const capped = capAtSentenceBoundary(explanation, 120);
      if (capped) named.push(capped);
      else named.push(explanation);
    }
  }
  for (const el of Array.isArray(card?.unmatchedElements) ? card.unmatchedElements : []) {
    const surface = typeof el === "string" ? el : el?.surface;
    if (clean(surface)) named.push(clean(surface));
  }
  named.push(...rewriteGapNotes(card));
  return [...new Set(named.map(clean).filter(Boolean))];
}

function hasMatcherSupportFace(card) {
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  if (matches.some((row) => ["confirmed", "partially_confirmed"].includes(String(row?.classification || "").toLowerCase()))) {
    return true;
  }
  const rewrites = [
    ...(Array.isArray(card?.classificationRewrites) ? card.classificationRewrites : []),
    ...matches.flatMap((row) => (Array.isArray(row?.classificationRewrites) ? row.classificationRewrites : [])),
  ];
  if (rewrites.some((row) => row?.rule === "span_outvote")) return true;
  const fps = Array.isArray(card?.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  return fps.some((row) => ["confirmed", "partially_confirmed"].includes(String(row?.classification || "")));
}

/**
 * Rule B: checksDisagree may go quiet when facts matched, no named gap, and
 * there is a matcher face (confirmed / partial / span_outvote) that supports it.
 * An empty matcher must not vacuous-green an unrecorded partial.
 */
export function checksDisagreeGoesGreen(card) {
  return everyReadingFactMatched(card)
    && matcherNamedGaps(card).length === 0
    && hasMatcherSupportFace(card);
}

/**
 * A sentence that is only a place and/or a date (e.g. "Portland, 12 May 2026.").
 */
export function isDatelineSentence(statement) {
  const body = clean(statement).replace(/[.!?]+$/, "");
  if (!body || body.split(/\s+/).length > 8) return false;
  // Strip place names and date tokens; nothing checkable-as-claim should remain.
  let rest = body
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\b/gi, " ")
    .replace(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b/gi, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/[,\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Remaining tokens should all look like place-name capitals / short words.
  if (!rest) return true;
  const words = rest.split(/\s+/);
  return words.every((word) => /^[A-Z][A-Za-z.'-]*$/.test(word) && !/^(The|And|With|For|From)$/i.test(word));
}

function parseDatePhrase(text) {
  const body = clean(text);
  const iso = body.match(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const named = body.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\s+((?:19|20)\d{2})\b/i
  );
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month != null) return new Date(Number(named[3]), month, Number(named[1]));
  }
  const named2 = body.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+((?:19|20)\d{2})\b/i
  );
  if (named2) {
    const month = MONTHS[named2[1].toLowerCase()];
    if (month != null) return new Date(Number(named2[3]), month, Number(named2[2]));
  }
  return null;
}

function formatDateLong(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function sameCalendarDay(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** Dateline from the draft (another sentence) or the source event date. */
export function resolveEventDate(card, draftSentences = []) {
  const statement = clean(card?.statement);
  const fromSelf = parseDatePhrase(statement);
  if (fromSelf) return fromSelf;
  for (const sentence of Array.isArray(draftSentences) ? draftSentences : []) {
    if (isDatelineSentence(sentence) && parseDatePhrase(sentence)) return parseDatePhrase(sentence);
  }
  const surfaces = [];
  for (const fact of Array.isArray(card?.readingFacts) ? card.readingFacts : []) {
    if (fact?.kind === "date" && fact?.surface) surfaces.push(fact.surface);
  }
  for (const row of Array.isArray(card?.matchExplanations) ? card.matchExplanations : []) {
    if (row?.explanation) {
      const found = parseDatePhrase(row.explanation);
      if (found) return found;
    }
  }
  for (const row of Array.isArray(card?.stage2SourceFingerprints) ? card.stage2SourceFingerprints : []) {
    const found = parseDatePhrase(row?.passage || "");
    if (found) return found;
  }
  for (const surface of surfaces) {
    const found = parseDatePhrase(surface);
    if (found) return found;
  }
  const excerpt = typeof card?.primaryExcerpt === "string"
    ? card.primaryExcerpt
    : (card?.primaryExcerpt?.passage || card?.primaryExcerptText || card?.sourceQuote || "");
  return parseDatePhrase(excerpt);
}

/**
 * Replace today / this week / this month with the resolved event date for comparison.
 */
export function resolveRelativeTimeInStatement(statement, eventDate) {
  const body = clean(statement);
  if (!body || !RELATIVE_TIME.test(body) || !(eventDate instanceof Date)) return body;
  const label = formatDateLong(eventDate);
  if (!label) return body;
  return body.replace(RELATIVE_TIME, label);
}

/**
 * True when the only conflict is a relative-time word that resolves to the source date.
 */
export function relativeTimeConflictResolved(card, draftSentences = []) {
  const statement = clean(card?.statement);
  if (!RELATIVE_TIME.test(statement)) return false;
  const eventDate = resolveEventDate(card, draftSentences);
  if (!eventDate) return false;
  const resolved = resolveRelativeTimeInStatement(statement, eventDate);
  // Source / matcher dates must agree with the resolved date.
  const sourceDates = [];
  for (const fact of Array.isArray(card?.readingFacts) ? card.readingFacts : []) {
    if (fact?.kind === "date" && fact.status === "matched" && fact.surface) {
      const parsed = parseDatePhrase(fact.surface);
      if (parsed) sourceDates.push(parsed);
    }
  }
  for (const row of Array.isArray(card?.matchExplanations) ? card.matchExplanations : []) {
    const parsed = parseDatePhrase(row?.explanation || "");
    if (parsed) sourceDates.push(parsed);
  }
  for (const row of Array.isArray(card?.stage2SourceFingerprints) ? card.stage2SourceFingerprints : []) {
    const parsed = parseDatePhrase(row?.passage || "");
    if (parsed) sourceDates.push(parsed);
  }
  if (!sourceDates.length) {
    // Fall back: explanation mentions the same calendar date as the event.
    const blob = [
      ...(card?.matchExplanations || []).map((row) => row?.explanation),
      ...(card?.stage2SourceFingerprints || []).map((row) => row?.passage),
      card?.primaryExcerptText,
      typeof card?.primaryExcerpt === "string" ? card.primaryExcerpt : card?.primaryExcerpt?.passage,
    ].map(clean).join(" ");
    return blob.includes(formatDateLong(eventDate))
      || blob.includes(`${eventDate.getDate()} ${["January","February","March","April","May","June","July","August","September","October","November","December"][eventDate.getMonth()]} ${eventDate.getFullYear()}`);
  }
  return sourceDates.some((date) => sameCalendarDay(date, eventDate))
    && parseDatePhrase(resolved)
    && sameCalendarDay(parseDatePhrase(resolved), eventDate);
}

/** Dateline facts alone: green when matched, red when a date/place conflicts. */
export function datelineColour(card) {
  if (!isDatelineSentence(card?.statement)) return null;
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  const checkable = facts.filter((fact) => ["figure", "date", "name"].includes(fact?.kind));
  if (checkable.some((fact) => fact?.status === "matched_disputed" || fact?.status === "conflict")) {
    return "conflicts";
  }
  if (checkable.length && checkable.every((fact) => fact?.status === "matched")) {
    return "nothing_raised";
  }
  // No reading facts: fall back to displayVerdict / fingerprints.
  const display = String(card?.displayVerdict || "").toLowerCase();
  if (display.includes("conflict")) return "conflicts";
  if (display === "supported_full" || display === "supported_partial" || display === "partially_confirmed") {
    // Broader is never amber for a dateline.
    return "nothing_raised";
  }
  const fps = Array.isArray(card?.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  if (fps.some((row) => String(row?.classification).includes("conflict"))) return "conflicts";
  if (fps.some((row) => ["confirmed", "partially_confirmed"].includes(row?.classification))) {
    return "nothing_raised";
  }
  return "nothing_raised";
}

const INTERNAL = /\b(evidence check|the evidence check|the matcher|the reader|the second check|the check|stage\s*[0-9]|matchExplanations?|supportState|displayVerdict|qcCard|classificationRewrites?|floorState|checksDisagree|span_outvote)\b/i;
const FILEISH = /\.(html?|pdf|docx?|txt)\b/i;

/**
 * Clean a user-facing reason: "the statement" → "the sentence"; drop internal/file noise.
 */
export function scrubUserReason(text) {
  let body = clean(text);
  if (!body) return "";
  body = body.replace(/\bthe statement\b/gi, (match) => (match[0] === "T" ? "The sentence" : "the sentence"));
  const kept = [];
  for (const sentence of body.split(/(?<=[.!?])\s+/)) {
    const piece = clean(sentence);
    if (!piece) continue;
    if (INTERNAL.test(piece)) continue;
    if (FILEISH.test(piece)) continue;
    if (/^(.*?)\bstates\s+"/i.test(piece)) continue;
    kept.push(piece);
  }
  return kept.join(" ");
}

function toneOfState(state) {
  if (state === "conflicts" || state === "not_in_source") return "red";
  if (state === "nothing_raised" || state === "nothing_to_raise") return "green";
  return "amber";
}

const SUPPORTS = /\b(confirm(?:s|ed|ing)?|supports?|in line with|consistent with|matches|verified|as the sentence says)\b/i;
const CONFLICTS = /\b(conflicts?|differ(?:s|ed|ing)?|does not|do not|missing|not in the source|beyond|incorrect|wrong|instead|whereas|however|while the (?:sentence|draft))\b/i;

/**
 * Guard: amber/red reasons state a gap; green reasons never state a conflict.
 * Returns { text, acted }.
 */
export function reasonMatchesColour(reason, state) {
  const body = scrubUserReason(reason);
  const tone = toneOfState(state);
  if (!body) return { text: "", acted: false };
  if (tone === "green" && CONFLICTS.test(body) && !SUPPORTS.test(body)) {
    console.info("[b595] reason-colour guard: dropped conflict language on a green card");
    return { text: "The source supports the sentence.", acted: true };
  }
  if (tone === "green" && CONFLICTS.test(body) && SUPPORTS.test(body)) {
    // Keep the supporting clause only.
    const sentences = body.split(/(?<=[.!?])\s+/).filter((s) => SUPPORTS.test(s) && !CONFLICTS.test(s));
    if (sentences.length) {
      console.info("[b595] reason-colour guard: kept supporting sentences only on a green card");
      return { text: sentences.join(" "), acted: true };
    }
  }
  if ((tone === "amber" || tone === "red") && SUPPORTS.test(body) && !CONFLICTS.test(body)) {
    // B599: do not leave support-only prose on amber/red. Empty signals the exit gate.
    return { text: "", acted: true };
  }
  return { text: body, acted: false };
}

/**
 * Stamp the one reason the card shows (screen, PDF, stored evidenceSummary).
 */
export function finaliseShownReason(card, state, preferred = "") {
  const candidates = [
    preferred,
    clean(card?.shownReason),
    clean(card?.readingNote?.text),
    ...(Array.isArray(card?.matchExplanations) ? card.matchExplanations.map((row) => clean(row?.explanation)) : []),
    clean(card?.displayedEvidenceProse),
    clean(card?.evidenceLine),
    clean(card?.evidenceSummary),
    clean(card?.reasoningParagraph),
  ].filter(Boolean);

  const tone = toneOfState(state);
  let chosen = "";
  for (const candidate of candidates) {
    const scrubbed = scrubUserReason(candidate);
    if (!scrubbed) continue;
    if (tone === "green" && CONFLICTS.test(scrubbed) && !SUPPORTS.test(scrubbed)) continue;
    chosen = scrubbed;
    break;
  }
  if (!chosen && tone !== "green") {
    const gaps = matcherNamedGaps(card);
    if (gaps.length) chosen = `The sentence and the source differ on ${gaps[0]}.`;
    // B599: leave empty for the exit gate. Never stamp a generic look line here.
  }
  if (!chosen) chosen = "The source supports the sentence.";
  const guarded = reasonMatchesColour(chosen, state);
  const text = guarded.text || chosen;
  return {
    shownReason: text,
    evidenceSummary: text,
    displayedEvidenceProse: text,
    evidenceLine: text,
    reasoningParagraph: text,
  };
}
