/**
 * B438. Records a decision the product already made.
 * Does not choose a verdict, a support state, a sentence label, a tier, or a concern code.
 */

import { NOT_REVIEWED_REASONS } from "./not-reviewed-reason.mjs";

export const COULD_NOT_DETERMINE = "could_not_determine";
export const EMPTY_CONFIRMATION_REFUSED = "empty_confirmation_refused";

export function scrubUnidentifiedClaim(text, resolvedName) {
  if (!resolvedName || typeof text !== "string" || !text) return text;
  if (!/not identified in this draft/i.test(text)) return text;
  return text
    .replace(
      /(?:,?\s*(?:but|and)\s+)?the authoring organisation is not identified in this draft\.?/gi,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

export function scrubConcern(concern, resolvedName) {
  if (!concern || typeof concern !== "object" || !resolvedName) return concern;
  const note = scrubUnidentifiedClaim(concern.note, resolvedName);
  const concernText = scrubUnidentifiedClaim(concern.concernText, resolvedName);
  const text = scrubUnidentifiedClaim(concern.text, resolvedName);
  if (note === concern.note && concernText === concern.concernText && text === concern.text) {
    return concern;
  }
  return { ...concern, note, concernText, text };
}

export function scrubConcernList(concerns, resolvedName) {
  if (!Array.isArray(concerns) || !resolvedName) return concerns;
  return concerns.map((concern) => scrubConcern(concern, resolvedName));
}

export function isPartialCard(card) {
  return card?.supportState === "partial" || card?.displayVerdict === "supported_partial";
}

export function isNotReviewedCard(card) {
  const display = String(card?.displayVerdict || "").toLowerCase();
  return display === "not reviewed" || card?.supportState === "skipped";
}

const PLACEHOLDER_EXPLANATION = "No explanation provided.";

/**
 * The matcher's explanation, copied onto the card. Not displayed.
 * When a backstop changed the class and left the matcher's sentence,
 * writtenFor names the class that sentence was written for.
 */
export function matchExplanationsFromMatches(matches) {
  const list = Array.isArray(matches) ? matches : [];
  const rows = [];
  for (const row of list) {
    const explanation = typeof row?.explanation === "string" ? row.explanation.trim() : "";
    if (!explanation || explanation === PLACEHOLDER_EXPLANATION) continue;
    const classification = typeof row.classification === "string" ? row.classification : null;
    const writtenFor =
      typeof row.explanationFor === "string" && row.explanationFor
        ? row.explanationFor
        : typeof row.preBackstopClassification === "string"
          ? row.preBackstopClassification
          : classification;
    const rewritten = Boolean(writtenFor && classification && writtenFor !== classification);
    rows.push({
      sourceIndex: Number.isFinite(Number(row.sourceIndex)) ? Number(row.sourceIndex) : null,
      sourceLabel: typeof row.sourceLabel === "string" ? row.sourceLabel : null,
      classification,
      explanation,
      ...(rewritten ? { writtenFor } : {}),
    });
  }
  return rows;
}

export function partialGroundFromMatches(matches) {
  const list = Array.isArray(matches) ? matches : [];
  const explanations = list
    .filter((row) => String(row?.classification || "") === "partially_confirmed")
    .map((row) => (typeof row?.explanation === "string" ? row.explanation.trim() : ""))
    .filter(Boolean);
  if (!explanations.length) return null;
  return { recorded: true, source: "stage2_explanation", text: explanations.join("\n") };
}

export function partialGroundFromCard(card) {
  const summary = typeof card?.evidenceSummary === "string" ? card.evidenceSummary.trim() : "";
  if (summary) return { recorded: true, source: "evidence_summary", text: summary };
  return {
    recorded: false,
    absentAt: "stage2 match explanation",
    note: "The class was stored without an explanation. The explanation is returned by the match and has to be copied onto the card when the card is assembled.",
  };
}

export function notReviewedReasonFromMatches(matches) {
  const list = Array.isArray(matches) ? matches : [];
  if (list.some((row) => row?.emptyConfirmationRefused === true)) return EMPTY_CONFIRMATION_REFUSED;
  if (
    list.some(
      (row) => row?.matchNotReviewed === true && /schema/i.test(String(row?.explanation || ""))
    )
  ) {
    return NOT_REVIEWED_REASONS.SCHEMA_INVALID;
  }
  return COULD_NOT_DETERMINE;
}

export function concernCodes(card) {
  const codes = [];
  const take = (rows, layer) => {
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.concernCode) codes.push(`${layer}:${row.concernCode}`);
    }
  };
  take(card?.editorialConcerns, "editorial");
  take(card?.complianceConcerns, "compliance");
  take(card?.framingFidelityConcerns, "framing");
  take(card?.sourceRecencyConcerns, "recency");
  if (card?.readingNote?.bucket) codes.push(`note:${card.readingNote.bucket}`);
  return codes.join("|");
}

export function identityOf(card) {
  return {
    displayVerdict: card?.displayVerdict ?? null,
    supportState: card?.supportState ?? null,
    sentenceLabel: card?.sentenceLabel ?? null,
    tier: card?.tier ?? null,
    concerns: concernCodes(card),
  };
}

export function concernTexts(card) {
  const out = [];
  const take = (rows, layer) => {
    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
      out.push({
        layer,
        index,
        code: row?.concernCode || "",
        text: [row?.text, row?.note, row?.concernText].filter((part) => typeof part === "string").join("\n"),
      });
    });
  };
  take(card?.editorialConcerns, "editorial");
  take(card?.complianceConcerns, "compliance");
  take(card?.framingFidelityConcerns, "framing");
  take(card?.sourceRecencyConcerns, "recency");
  return out;
}

/**
 * What a stored card can gain without a new review.
 * Match explanations are not on the stored card. A partial ground is copied
 * from the summary already on the card, when that summary exists.
 */
export function annotateStored(card, options = {}) {
  const resolvedName = options.resolvedName || null;
  const next = {
    ...card,
    editorialConcerns: scrubConcernList(card?.editorialConcerns, resolvedName),
    complianceConcerns: scrubConcernList(card?.complianceConcerns, resolvedName),
    framingFidelityConcerns: scrubConcernList(card?.framingFidelityConcerns, resolvedName),
    sourceRecencyConcerns: scrubConcernList(card?.sourceRecencyConcerns, resolvedName),
  };
  if (isPartialCard(next) && !next.partialGround) {
    next.partialGround = partialGroundFromCard(next);
  }
  if (isNotReviewedCard(next) && !next.evidenceNotReviewedReason) {
    next.evidenceNotReviewedReason = COULD_NOT_DETERMINE;
    next.notReviewedRecord = { reason: COULD_NOT_DETERMINE, determined: false };
  }
  return next;
}

export function droppedMarkSilence(built) {
  const count = Number(built?.droppedCount) || 0;
  if (count <= 0) return null;
  const reasons = (Array.isArray(built?.dropped) ? built.dropped : []).map((row) =>
    typeof row?.reason === "string" && row.reason.trim() ? row.reason.trim() : "unspecified"
  );
  return { id: "dropped_marks", reason: "marks were dropped", count, reasons };
}

export function pushSilence(card, silence) {
  if (!card || typeof card !== "object" || !silence) return card;
  const silences = Array.isArray(card.silences) ? card.silences : [];
  card.silences = [...silences, silence];
  return card;
}
