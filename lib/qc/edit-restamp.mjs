/**
 * B602. Re-stamp one card after Accept / Modify / Undo. No model call.
 * Re-checks reading facts against the card's shown source lines.
 */
import { shownSourceLines, gapAppearsInLines } from "./reason-evidence-check.mjs";
import { finaliseShownReason } from "./b595-card-rules.mjs";
import { combinedVerdict } from "./combined-verdict.mjs";
import { summariseReview } from "./review-summary.mjs";

const SHOWN_LABELS = {
  conflicts: "Conflicts with the source",
  not_in_source: "Not in the source",
  beyond: "Goes beyond the source",
  partial: "Partially supported",
  note_withheld: "Needs a look",
  nothing_raised: "Nothing raised",
  confirmed: "Nothing raised",
  supported_full: "Nothing raised",
};

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function shownTier(state) {
  if (state === "conflicts" || state === "not_in_source") return "red";
  if (state === "beyond" || state === "partial" || state === "note_withheld") return "amber";
  if (state === "nothing_raised" || state === "confirmed" || state === "supported_full") return "green";
  return "grey";
}

function surfacesInStatement(statement) {
  const text = clean(statement);
  const out = [];
  for (const m of text.matchAll(
    /\b(?:EUR|USD|GBP|\$|£|€)?\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|percent|%|x))?\b/gi,
  )) {
    out.push(clean(m[0]));
  }
  for (const m of text.matchAll(
    /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,
  )) {
    out.push(clean(m[0]));
  }
  return out;
}

/**
 * Re-check figure/date/name reading facts against shown lines for the new wording.
 * Facts whose surface no longer appears in the statement are dropped from the check.
 */
export function recheckReadingFacts(card, newStatement) {
  const lines = shownSourceLines(card);
  const statement = clean(newStatement);
  const surfaces = new Set(surfacesInStatement(statement).map((s) => s.toLowerCase()));
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  const nextFacts = facts.map((fact) => {
    if (!fact || typeof fact !== "object") return fact;
    if (!["figure", "date", "name"].includes(fact.kind)) return fact;
    const surface = clean(fact.surface || fact.text || "");
    if (!surface) return { ...fact, status: "matched" };
    // Surface no longer in the rewritten sentence → not a live claim.
    const stillClaimed = surfaces.size === 0
      || [...surfaces].some((s) => surface.toLowerCase().includes(s) || s.includes(surface.toLowerCase()))
      || statement.toLowerCase().includes(surface.toLowerCase());
    if (!stillClaimed) {
      return { ...fact, status: "matched", editRestamp: "dropped_from_sentence" };
    }
    const hit = gapAppearsInLines(surface, lines)
      || lines.some((line) => line.toLowerCase().includes(surface.toLowerCase()));
    return {
      ...fact,
      status: hit ? "matched" : "unmatched",
      editRestamp: hit ? "matched_shown" : "unmatched_shown",
    };
  });
  const checkable = nextFacts.filter((f) => ["figure", "date", "name"].includes(f?.kind));
  const allMatch = checkable.length === 0 || checkable.every((f) => f.status === "matched");
  return { facts: nextFacts, allMatch, lines };
}

function restampCombined(card) {
  const state = card.sentenceState || card.statementVerdict?.state || "nothing_raised";
  const evidenceFace = SHOWN_LABELS[state] || "";
  const verdict = {
    ...(card.statementVerdict && typeof card.statementVerdict === "object" ? card.statementVerdict : {}),
    state,
    tier: shownTier(state) || card.statementVerdict?.tier || null,
    setBy: card.setBy || card.statementVerdict?.setBy || { branch: "editRestamp" },
  };
  const combined = combinedVerdict({
    verdict,
    editorialConcerns: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
    complianceVerdict: typeof card.complianceVerdict === "string" ? card.complianceVerdict : null,
    complianceConcerns: Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [],
  });
  let label = combined.label || evidenceFace || "";
  const cautionLabel = combined.state === "caution" || combined.state === "compliance_risk"
    ? (combined.label || "")
    : "";
  if (cautionLabel && evidenceFace && evidenceFace !== cautionLabel && evidenceFace !== "Nothing raised") {
    label = `${evidenceFace}; ${cautionLabel}`;
  }
  return {
    ...card,
    statementVerdict: verdict,
    combinedVerdict: label === combined.label ? combined : { ...combined, label },
    sentenceLabel: label,
    evidenceLabel: evidenceFace,
    stampAuthority: card.stampAuthority || "b602-edit",
  };
}

/**
 * Accept an evidence proposal: new wording, re-check facts, green when they match.
 */
export function restampAfterAccept(card, newStatement) {
  const statement = clean(newStatement);
  if (!statement) {
    throw new Error("edit_restamp: new statement missing");
  }
  const prior = {
    statement: clean(card?.statement || card?.text || ""),
    sentenceState: card?.sentenceState,
    shownReason: card?.shownReason,
    readingFacts: card?.readingFacts,
    statementVerdict: card?.statementVerdict,
    setBy: card?.setBy,
    evidenceProposal: card?.evidenceProposal,
    conflictProposal: card?.conflictProposal,
    suggestedImprovement: card?.suggestedImprovement,
  };
  const { facts, allMatch, lines } = recheckReadingFacts(card, statement);
  // B604: no line number here. The review's line ids are counted differently from the
  // numbers on screen, and the Source passage under the card already shows the right line.
  const changedLine = "Changed to match the source.";
  let next = {
    ...card,
    statement,
    text: statement,
    readingFacts: facts,
    editPrior: prior,
    editMode: "accept",
    // Clear spent proposals.
    evidenceProposal: null,
    conflictProposal: null,
    suggestedImprovement: null,
    evidenceSuggestedDirection: null,
  };
  if (allMatch) {
    const state = "nothing_raised";
    const face = finaliseShownReason({ ...next, shownReason: changedLine }, state, changedLine);
    next = restampCombined({
      ...next,
      ...face,
      sentenceState: state,
      statementVerdict: {
        ...(next.statementVerdict || {}),
        state,
        tier: shownTier(state),
        setBy: { branch: "editRestamp", source: "accept" },
      },
      setBy: { branch: "editRestamp", source: "accept" },
      statusNeedsConfirm: false,
    });
  } else {
    const reason = "Changed since the review. Review again to check this sentence.";
    const state = "note_withheld";
    const face = finaliseShownReason({ ...next, shownReason: reason }, state, reason);
    next = restampCombined({
      ...next,
      ...face,
      sentenceState: state,
      statementVerdict: {
        ...(next.statementVerdict || {}),
        state,
        tier: shownTier(state),
        setBy: { branch: "editRestamp", source: "accept-partial" },
      },
      setBy: { branch: "editRestamp", source: "accept-partial" },
    });
  }
  // Editorial and caution notes stay as they were (already on card).
  return next;
}

/**
 * Writer's own wording: keep number, note that review is stale for this sentence.
 */
export function restampAfterModify(card, newStatement) {
  const statement = clean(newStatement);
  if (!statement) {
    throw new Error("edit_restamp: new statement missing");
  }
  const prior = {
    statement: clean(card?.statement || card?.text || ""),
    sentenceState: card?.sentenceState,
    shownReason: card?.shownReason,
    readingFacts: card?.readingFacts,
    statementVerdict: card?.statementVerdict,
    setBy: card?.setBy,
    evidenceProposal: card?.evidenceProposal,
    conflictProposal: card?.conflictProposal,
    suggestedImprovement: card?.suggestedImprovement,
  };
  const reason = "Changed since the review. Review again to check this sentence.";
  const state = card?.sentenceState || card?.statementVerdict?.state || "note_withheld";
  // Keep prior colour when still raised; otherwise quiet note on green face via reason only.
  const keepState = ["conflicts", "not_in_source", "beyond", "partial", "note_withheld"].includes(state)
    ? state
    : "nothing_raised";
  let next = {
    ...card,
    statement,
    text: statement,
    editPrior: prior,
    editMode: "modify",
    evidenceProposal: null,
    conflictProposal: null,
    suggestedImprovement: null,
    evidenceSuggestedDirection: null,
  };
  const face = finaliseShownReason({ ...next, shownReason: reason }, keepState, reason);
  return restampCombined({
    ...next,
    ...face,
    sentenceState: keepState,
    statementVerdict: {
      ...(next.statementVerdict || {}),
      state: keepState,
      tier: shownTier(keepState),
      setBy: { branch: "editRestamp", source: "modify" },
    },
    setBy: { branch: "editRestamp", source: "modify" },
  });
}

/** Restore the pre-edit stamp and wording. */
export function restampAfterUndo(card) {
  const prior = card?.editPrior;
  if (!prior || typeof prior !== "object") {
    throw new Error("edit_restamp: nothing to undo");
  }
  const statement = clean(prior.statement);
  let next = {
    ...card,
    statement,
    text: statement,
    sentenceState: prior.sentenceState,
    shownReason: prior.shownReason,
    readingFacts: prior.readingFacts,
    statementVerdict: prior.statementVerdict,
    setBy: prior.setBy,
    evidenceProposal: prior.evidenceProposal,
    conflictProposal: prior.conflictProposal,
    suggestedImprovement: prior.suggestedImprovement,
    editPrior: null,
    editMode: null,
  };
  const state = next.sentenceState || next.statementVerdict?.state || "note_withheld";
  const reason = clean(next.shownReason) || "The sentence and the source disagree on a material point.";
  const face = finaliseShownReason({ ...next, shownReason: reason }, state, reason);
  return restampCombined({ ...next, ...face });
}

/**
 * Apply an edit to one statement in an analyse response and rebuild summary.
 */
export function applyEditRestampToResponse(body, {
  statementIndex,
  mode,
  newStatement,
} = {}) {
  if (!body || !Array.isArray(body.statements)) {
    throw new Error("edit_restamp: analysis required");
  }
  const idx = Number(statementIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= body.statements.length) {
    throw new Error("edit_restamp: statement_index required");
  }
  const row = body.statements[idx];
  const card = row?.qcCard && typeof row.qcCard === "object" ? { ...row.qcCard } : {};
  if (!clean(card.statement) && clean(row?.text)) card.statement = row.text;

  let nextCard;
  if (mode === "accept") nextCard = restampAfterAccept(card, newStatement);
  else if (mode === "modify") nextCard = restampAfterModify(card, newStatement);
  else if (mode === "undo") nextCard = restampAfterUndo(card);
  else throw new Error(`edit_restamp: unknown mode ${mode}`);

  const statements = body.statements.map((s, i) => {
    if (i !== idx) return s;
    return {
      ...s,
      text: nextCard.statement,
      qcCard: { ...nextCard, index: idx },
    };
  });
  const cards = statements.map((s) => s.qcCard).filter(Boolean);
  const reviewSummary = summariseReview(cards, body.meta?.reviewOptions);
  const editCount = statements.filter((s) => s?.qcCard?.editMode === "accept" || s?.qcCard?.editMode === "modify").length;
  return {
    ...body,
    statements,
    meta: {
      ...(body.meta && typeof body.meta === "object" ? body.meta : {}),
      reviewSummary,
      changesSinceReview: editCount,
    },
  };
}
