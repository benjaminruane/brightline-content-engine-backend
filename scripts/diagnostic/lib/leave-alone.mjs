/**
 * B445. The next pass's score.mjs imports this module.
 * b437, b440, and b441 keep their own copies. This file is not a fourth copy
 * of those scripts: it is the one place the split lives.
 *
 * Combined quiet is the B441 definition: a confirmed statement is quiet only
 * when none of the six layers spoke. Evidence leave-alone uses that same
 * definition, and ignores a scanned house-style concern. A factual challenge
 * still counts. House-style mentions are counted on their own, by rule.
 */
import { mapDisplayVerdict } from "../accuracy/lib.mjs";
import { scanMechanics } from "../../../lib/qc/mechanics-scan.mjs";
import { shownLabel, shownState, shownTier } from "../../../lib/qc/shown-verdict.mjs";

const SCANNED_CODES = new Set(["percentage_notation", "em_dash", "first_person_plural"]);

function concernCode(concern) {
  if (typeof concern?.concernCode === "string" && concern.concernCode.trim()) return concern.concernCode.trim();
  if (typeof concern?.rule === "string" && concern.rule.trim()) return concern.rule.trim();
  return "";
}

/**
 * percentage_notation, em_dash, and first_person_plural are the scan.
 * voice_consistency is the same first-person fault on a press release.
 * A voice_consistency concern that is not about that pronoun still counts
 * as editorial speech.
 */
export function isScannedHouseStyle(concern) {
  const code = concernCode(concern);
  if (SCANNED_CODES.has(code)) return true;
  if (code !== "voice_consistency") return false;
  const blob = [concern?.text, concern?.note, concern?.concernText, concern?.quote, concern?.suggestedDirection]
    .filter((part) => typeof part === "string")
    .join(" ");
  return /first[- ]person|speaking as we/i.test(blob);
}

export function layerSpoken(card) {
  const evidenceMapped = mapDisplayVerdict(card?.displayVerdict);
  const notReviewed = String(card?.displayVerdict || "").toLowerCase() === "not reviewed";
  const noteBucket = card?.readingNote?.bucket || null;
  return {
    evidence: {
      raised: (evidenceMapped != null && evidenceMapped !== "confirmed") || notReviewed,
      label: evidenceMapped || card?.displayVerdict || null,
    },
    editorial: {
      raised: Array.isArray(card?.editorialConcerns) && card.editorialConcerns.length > 0,
      label: card?.editorialVerdict || null,
    },
    compliance: {
      raised: Array.isArray(card?.complianceConcerns) && card.complianceConcerns.length > 0,
      label: card?.complianceVerdict || null,
    },
    note: {
      raised: noteBucket === "conflicts" || noteBucket === "beyond",
      label: noteBucket,
    },
    framing: {
      raised: Array.isArray(card?.framingFidelityConcerns) && card.framingFidelityConcerns.length > 0,
      label: "framing",
    },
    recency: {
      raised: Array.isArray(card?.sourceRecencyConcerns) && card.sourceRecencyConcerns.length > 0,
      label: "recency",
    },
  };
}

const QUIET_SENTENCE = new Set(["nothing_raised", "nothing_to_raise", ""]);

/**
 * B458. The old six layers, plus the sentence label and tier the reader sees.
 * layerSpoken is unchanged so the series back to B437 still uses that tally.
 */
export function layerSpokenWithLabel(card) {
  const layers = layerSpoken(card);
  const state = shownState(card);
  const tier = typeof card?.tier === "string" && card.tier ? card.tier : shownTier(state);
  const raised = !QUIET_SENTENCE.has(state) || (tier != null && tier !== "quiet");
  return {
    ...layers,
    sentence: {
      raised,
      label: shownLabel(card) || state || null,
    },
  };
}

export function quietOf(card) {
  if (!card) return false;
  const layers = layerSpoken(card);
  return Object.values(layers).every((layer) => !layer.raised);
}

export function quietWithLabel(card) {
  if (!card) return false;
  const layers = layerSpokenWithLabel(card);
  return Object.values(layers).every((layer) => !layer.raised);
}

function editorialRaisedWithoutHouseStyle(card) {
  const concerns = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
  return concerns.some((row) => !isScannedHouseStyle(row));
}

function evidenceQuietFrom(card, layers) {
  return Object.entries(layers).every(([name, layer]) => {
    if (name === "editorial") return !editorialRaisedWithoutHouseStyle(card);
    return !layer.raised;
  });
}

/** Confirmed facts, and no layer speaking except a scanned house-style concern. */
export function evidenceQuietOf(card) {
  if (!card) return false;
  return evidenceQuietFrom(card, layerSpoken(card));
}

export function evidenceQuietWithLabel(card) {
  if (!card) return false;
  return evidenceQuietFrom(card, layerSpokenWithLabel(card));
}

/**
 * One entry per house-style concern, so a stored file that raised one concern
 * per occurrence counts occurrences, and a grouped scan counts rules.
 */
export function houseStyleMentions(card) {
  const concerns = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
  const codes = [];
  for (const row of concerns) {
    if (!isScannedHouseStyle(row)) continue;
    const code = concernCode(row);
    if (!code) throw new Error("leave-alone: a house-style concern has no code");
    codes.push(code);
  }
  return codes;
}

function tallyFrom(cards, quietFn, evidenceFn) {
  if (!Array.isArray(cards)) throw new Error("tallyLeaveAlone: cards are missing");
  const mentions = {};
  const statements = {};
  let combinedQuiet = 0;
  let evidenceLeaveAlone = 0;
  for (const card of cards) {
    if (quietFn(card)) combinedQuiet += 1;
    if (evidenceFn(card)) evidenceLeaveAlone += 1;
    const codes = houseStyleMentions(card);
    const seen = new Set();
    for (const code of codes) {
      mentions[code] = (mentions[code] || 0) + 1;
      if (!seen.has(code)) {
        statements[code] = (statements[code] || 0) + 1;
        seen.add(code);
      }
    }
  }
  return {
    n: cards.length,
    combinedQuiet,
    evidenceLeaveAlone,
    houseStyleMentions: mentions,
    houseStyleStatements: statements,
  };
}

export function tallyLeaveAlone(cards) {
  return tallyFrom(cards, quietOf, evidenceQuietOf);
}

export function tallyLeaveAloneWithLabel(cards) {
  return tallyFrom(cards, quietWithLabel, evidenceQuietWithLabel);
}

/**
 * Drop the model's scanned house-style concerns and add the scan.
 * A card the reviewer did not review is left as stored. The live path does
 * not scan that card either.
 */
export function applyMechanicsScan(card, outputType) {
  if (!card || typeof card !== "object") throw new Error("applyMechanicsScan: card is missing");
  if (typeof card.statement !== "string") throw new Error("applyMechanicsScan: statement is missing");
  if (!Array.isArray(card.editorialConcerns)) {
    throw new Error("applyMechanicsScan: editorialConcerns is missing");
  }
  if (card.editorialVerdict === "not_reviewed") return card;
  const kept = card.editorialConcerns.filter((row) => !isScannedHouseStyle(row));
  const added = scanMechanics({ statement: card.statement, outputType });
  return { ...card, editorialConcerns: [...kept, ...added] };
}
