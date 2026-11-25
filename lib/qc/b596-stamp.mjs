/**
 * B596. One decision per card. After shownTrace (and the amber reason guard),
 * write every face the screen, summary and PDF read so they cannot diverge.
 * Deterministic. No model call.
 */
import { combinedVerdict, dropsGrossOrNet } from "./combined-verdict.mjs";
import {
  checksDisagreeGoesGreen,
  everyReadingFactMatched,
  finaliseShownReason,
  matcherNamedGaps,
  scrubUserReason,
} from "./b595-card-rules.mjs";
import { shownTier, shownTrace, SHOWN_LABELS } from "./shown-verdict.mjs";
import { sourceDisplayName } from "../export/export-blocks.mjs";
import { summariseReview } from "./review-summary.mjs";

const SUPPORTS =
  /\b(confirm(?:s|ed|ing)?|supports?|in line with|consistent with|matches|verified|as the sentence says|which supports)\b/i;
const CONFLICTS =
  /\b(conflicts?|differ(?:s|ed|ing)?|does not|do not|doesn't|missing|omit|not in the source|beyond|incorrect|wrong|instead|whereas|however|while the (?:sentence|draft)|gross or net|qualifier)\b/i;
const GAP_LANGUAGE =
  /\b(does not|do not|doesn't|omit|missing|beyond|differ|instead|whereas|however|not address|not mention|not state|not give|broader|narrower|while the (?:source|sentence|statement|draft)|gross or net|qualifier)\b/i;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function toneOfState(state) {
  if (state === "conflicts" || state === "not_in_source") return "red";
  if (state === "nothing_raised" || state === "nothing_to_raise") return "green";
  return "amber";
}

function hasGrossNetConcern(card) {
  const rows = Array.isArray(card?.complianceConcerns) ? card.complianceConcerns : [];
  return rows.some(dropsGrossOrNet);
}

function grossNetGapReason(card) {
  const rows = Array.isArray(card?.complianceConcerns) ? card.complianceConcerns : [];
  for (const row of rows) {
    if (!dropsGrossOrNet(row)) continue;
    const note = clean(row?.note || row?.text || row?.message);
    if (note) return scrubUserReason(note);
  }
  return 'The draft drops the gross or net qualifier on the figure, so a reader cannot tell whether it is gross or net.';
}

function reasonStatesGap(reason) {
  const body = clean(reason);
  if (!body) return false;
  return CONFLICTS.test(body) || GAP_LANGUAGE.test(body);
}

function reasonOnlySupports(reason) {
  const body = clean(reason);
  if (!body) return false;
  return SUPPORTS.test(body) && !reasonStatesGap(body);
}

/**
 * B596 item 2. Amber or red must carry a gap reason. Support-only prose never
 * sits on amber/red. When no gap can be named, Rule B / facts-only may green.
 */
export function guardAmberOrRedReason(card, state, preferredReason = "") {
  const tone = toneOfState(state);
  if (tone === "green") {
    const face = finaliseShownReason(card, state, preferredReason);
    return { state, ...face, acted: false, guard: "green" };
  }

  let reason = clean(preferredReason)
    || clean(card?.shownReason)
    || clean(card?.evidenceSummary)
    || clean(card?.displayedEvidenceProse)
    || clean(card?.evidenceLine)
    || clean(card?.readingNote?.text)
    || "";

  if (reasonStatesGap(reason) && !reasonOnlySupports(reason)) {
    const face = finaliseShownReason({ ...card, shownReason: reason }, state, reason);
    return { state, ...face, acted: false, guard: "gap_ok" };
  }

  if (hasGrossNetConcern(card)) {
    const gap = grossNetGapReason(card);
    const face = finaliseShownReason({ ...card, shownReason: gap }, state, gap);
    return { state, ...face, acted: true, guard: "gross_net_gap" };
  }

  const gaps = matcherNamedGaps(card);
  if (gaps.length) {
    const gap = `The sentence and the source differ on ${gaps[0]}.`;
    const face = finaliseShownReason({ ...card, shownReason: gap }, state, gap);
    return { state, ...face, acted: true, guard: "named_gap" };
  }

  // No gap can be stated. Rule B / facts-only → green when facts match.
  if (checksDisagreeGoesGreen(card) || (everyReadingFactMatched(card) && gaps.length === 0 && reasonOnlySupports(reason))) {
    const greenReason = reasonOnlySupports(reason)
      ? scrubUserReason(reason)
      : "The source supports the sentence.";
    const face = finaliseShownReason({ ...card, shownReason: greenReason }, "nothing_raised", greenReason);
    return {
      state: "nothing_raised",
      ...face,
      acted: true,
      guard: "rule_b_or_facts",
    };
  }

  const look = "Needs a look against the source.";
  const face = finaliseShownReason({ ...card, shownReason: look }, state === "conflicts" || state === "not_in_source" ? state : "note_withheld", look);
  return {
    state: state === "conflicts" || state === "not_in_source" ? state : "note_withheld",
    ...face,
    acted: true,
    guard: "look_fallback",
  };
}

/**
 * Run shownTrace, then the amber reason guard, then write every stamped face.
 */
export function applyFinalStamp(card, { draftSentences = [] } = {}) {
  if (!card || typeof card !== "object") {
    throw new Error("applyFinalStamp: card is missing");
  }
  const view = {
    ...card,
    draftSentences: Array.isArray(draftSentences) && draftSentences.length
      ? draftSentences
      : (Array.isArray(card.draftSentences) ? card.draftSentences : []),
  };
  const traced = shownTrace(view);
  let state = traced.state;
  let setBy = traced.setBy || { branch: traced.branch };

  // Compliance gross/net can still raise a quiet evidence face (same as reading-contract).
  const complianceRows = Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [];
  if (
    complianceRows.some(dropsGrossOrNet)
    && (state === "nothing_raised" || state === "nothing_to_raise")
  ) {
    state = "note_withheld";
    setBy = { branch: "compliance", source: "compliance", rule: "gross_net" };
  }

  const preferred = clean(card.shownReason)
    || clean(card.evidenceSummary)
    || clean(card.displayedEvidenceProse)
    || clean(card.evidenceLine)
    || clean(card.readingNote?.text)
    || "";

  const guarded = guardAmberOrRedReason(
    { ...view, statementVerdict: { ...(card.statementVerdict || {}), state, setBy } },
    state,
    preferred,
  );
  state = guarded.state;
  const tier = shownTier(state) || card.statementVerdict?.tier || null;
  const label = SHOWN_LABELS[state] || "";
  if (!label) {
    throw new Error(`applyFinalStamp: no label for state ${state}`);
  }
  const verdict = {
    ...(card.statementVerdict && typeof card.statementVerdict === "object" ? card.statementVerdict : {}),
    state,
    tier,
    setBy,
  };
  const combined = combinedVerdict({
    verdict,
    editorialConcerns: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
    complianceVerdict: typeof card.complianceVerdict === "string" ? card.complianceVerdict : null,
    complianceConcerns: complianceRows,
  });

  return {
    ...card,
    statementVerdict: verdict,
    combinedVerdict: combined,
    sentenceState: state,
    sentenceLabel: label,
    setBy,
    tier,
    shownReason: guarded.shownReason,
    evidenceSummary: guarded.evidenceSummary,
    displayedEvidenceProse: guarded.displayedEvidenceProse,
    evidenceLine: guarded.evidenceLine,
    reasoningParagraph: guarded.reasoningParagraph,
    stampAuthority: "b596",
    stampGuard: guarded.guard || null,
  };
}

/** Stamp displayName on every source once. */
export function stampSourceDisplayNames(sources) {
  return (Array.isArray(sources) ? sources : []).map((source) => {
    if (!source || typeof source !== "object") return source;
    const displayName = clean(source.displayName) || sourceDisplayName(source);
    return { ...source, displayName };
  });
}

/**
 * Re-stamp every card in a saved analyse response and rebuild summary + header
 * from the stamped states only.
 */
export function restampAnalyseResponse(body, reviewOptions) {
  const statements = Array.isArray(body?.statements) ? body.statements : [];
  const draftSentences = statements.map((row) => {
    const qc = row?.qcCard || {};
    return typeof row?.text === "string" ? row.text : (qc.statement || "");
  });
  const nextStatements = statements.map((row) => {
    const qc = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : {};
    const stamped = applyFinalStamp(
      {
        ...qc,
        statement: typeof row?.text === "string" ? row.text : (qc.statement || ""),
        displayVerdict: qc.displayVerdict || row?.displayVerdict,
        supportState: qc.supportState || row?.supportState,
        readingNote: qc.readingNote || row?.readingNote || null,
        matchExplanations: qc.matchExplanations || row?.matchExplanations || [],
      },
      { draftSentences },
    );
    return { ...row, qcCard: stamped, sentenceLabel: stamped.sentenceLabel, sentenceState: stamped.sentenceState };
  });
  const cards = nextStatements.map((row) => row.qcCard).filter(Boolean);
  const opts = reviewOptions || body?.meta?.reviewOptions || {
    evidenceEnabled: true,
    editorialEnabled: true,
    complianceEnabled: true,
  };
  const reviewSummary = summariseReview(cards, opts);
  const sources = stampSourceDisplayNames(body?.sources);
  // Header line rebuilt by the restamp script (avoids a circular import with
  // reading-contract). Counts on the summary are the authority.
  return {
    ...body,
    statements: nextStatements,
    sources,
    meta: {
      ...(body?.meta && typeof body.meta === "object" ? body.meta : {}),
      reviewSummary,
      reviewOptions: opts,
    },
  };
}
