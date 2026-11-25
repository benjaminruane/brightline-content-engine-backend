/**
 * B596 / B598. One decision per card. After shownTrace (and the amber reason
 * guard), write every face the screen, summary and PDF read so they cannot diverge.
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
import {
  filterPresentGaps,
  isFullExplanationGap,
  reasonFromNamedGaps,
  reasonNamesSpecificElement,
} from "./reason-evidence-check.mjs";
import { filterCardProposals } from "./attribution-safe-proposals.mjs";
import { applyExitGate } from "./exit-gate.mjs";
import { applyExitGateToResponse } from "./exit-gate.mjs";

const SUPPORTS =
  /\b(confirm(?:s|ed|ing)?|supports?|in line with|consistent with|matches|verified|as the sentence says|which supports)\b/i;
const CONFLICTS =
  /\b(conflicts?|differ(?:s|ed|ing)?|does not|do not|doesn't|missing|omit|not in the source|beyond|incorrect|wrong|instead|whereas|however|while the (?:sentence|draft)|gross or net|qualifier|recommend|table|confirm the decision)\b/i;
const GAP_LANGUAGE =
  /\b(does not|do not|doesn't|omit|missing|beyond|differ|instead|whereas|however|not address|not mention|not state|not give|broader|narrower|while the (?:source|sentence|statement|draft)|gross or net|qualifier|recommend|table figure|confirm the decision)\b/i;

/**
 * Branches that already chose amber/red for a product reason. Do not green them,
 * except refusedReading which B598 opens to Rule B when the reason names no gap
 * and every reading fact matched.
 *
 * Why each is protected (B598 report):
 * - decisionAsMade: draft states a decision the source only recommends.
 * - tableFigure: draft used the wrong table cell / date pairing.
 * - sameSource: two faces of one source disagree on the claim.
 * - conflictWithoutReason: conflict face without usable prose yet.
 * - supersession: a later source updates an earlier expectation.
 * - compliance: a compliance rule (e.g. gross/net) owns the colour.
 * - floorState: a floor rule forced a look.
 * - revisionRaises: a proposed revision would raise a louder issue.
 * - valueConflicts: two numeric values conflict.
 * - wordingDifference: wording difference kept as a look.
 * - transactionDemand: transaction language demands attention.
 * - uncheckedLook: an unchecked path left a look.
 * - unmatchedFact: a reading fact did not match.
 * - completionEffect: completion / supersession effect on expectation.
 * - evidenceDisplay: evidence display path forced a look.
 * - statementVerdict: statement verdict already chose amber/red.
 * - refusedReading: opened to Rule B in B598 when facts match and no gap named.
 */
export const PROTECTED_BRANCHES = new Set([
  "decisionAsMade",
  "tableFigure",
  "sameSource",
  "conflictWithoutReason",
  "supersession",
  "compliance",
  "floorState",
  "revisionRaises",
  "valueConflicts",
  "wordingDifference",
  "transactionDemand",
  "uncheckedLook",
  "unmatchedFact",
  "completionEffect",
  "evidenceDisplay",
  "statementVerdict",
  "refusedReading",
]);

export const PROTECTED_BRANCH_WHY = Object.freeze({
  decisionAsMade: "Draft states a decision the source only recommends.",
  tableFigure: "Draft used the wrong table cell or date pairing.",
  sameSource: "Two faces of one source disagree on the claim.",
  conflictWithoutReason: "Conflict face without usable prose yet.",
  supersession: "A later source updates an earlier expectation.",
  compliance: "A compliance rule owns the colour.",
  floorState: "A floor rule forced a look.",
  revisionRaises: "A proposed revision would raise a louder issue.",
  valueConflicts: "Two numeric values conflict.",
  wordingDifference: "Wording difference kept as a look.",
  transactionDemand: "Transaction language demands attention.",
  uncheckedLook: "An unchecked path left a look.",
  unmatchedFact: "A reading fact did not match.",
  completionEffect: "Completion effect on an expectation.",
  evidenceDisplay: "Evidence display path forced a look.",
  statementVerdict: "Statement verdict already chose amber or red.",
  refusedReading: "Opened to Rule B when facts match and no gap is named (B598).",
});

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
  return "The draft drops the gross or net qualifier on the figure, so a reader cannot tell whether it is gross or net.";
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

function branchOf(card) {
  return String(
    card?.statementVerdict?.setBy?.branch
    || card?.setBy?.branch
    || "",
  );
}

function remainingNamedGaps(card) {
  return filterPresentGaps(matcherNamedGaps(card), card);
}

function ruleBEligible(card, branch) {
  if (branch === "checksDisagree" || branch === "checksDisagreeFacts") {
    return checksDisagreeGoesGreen({
      ...card,
      // Re-evaluate with present gaps already dropped by callers using remainingNamedGaps.
      unmatchedElements: [],
      matchExplanations: card.matchExplanations,
    }) || (
      everyReadingFactMatched(card)
      && remainingNamedGaps(card).length === 0
      && (Array.isArray(card.matchExplanations) ? card.matchExplanations : [])
        .some((row) => ["confirmed", "partially_confirmed"].includes(String(row?.classification || "").toLowerCase()))
    );
  }
  if (branch === "refusedReading") {
    // B598: green when every fact matched and the amber reason names no gap element.
    if (!everyReadingFactMatched(card)) return false;
    if (remainingNamedGaps(card).length) return false;
    return true;
  }
  if (!PROTECTED_BRANCHES.has(branch)) {
    return checksDisagreeGoesGreen(card) || (
      everyReadingFactMatched(card) && remainingNamedGaps(card).length === 0
    );
  }
  return false;
}

/**
 * B596 item 2 / B598. Amber or red must carry a gap reason. Support-only prose
 * never sits on amber/red. Green via Rule B (including refusedReading when facts
 * match and no gap remains).
 */
export function guardAmberOrRedReason(card, state, preferredReason = "") {
  const tone = toneOfState(state);
  const statement = clean(card?.statement || card?.text || "");
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

  const branch = branchOf(card);
  const gaps = remainingNamedGaps(card);

  // B598: a stale "differ on …" reason must be rebuilt (or cleared) after present
  // gaps are dropped. Never keep "differ on The sentence…".
  const differOn = reason.match(/\b(?:the sentence and the source )?differ(?:s|ed|ing)? on (.+)$/i);
  if (differOn) {
    const slot = clean(differOn[1]).replace(/\.$/, "");
    if (isFullExplanationGap(slot, statement) || gaps.length === 0) {
      if (gaps.length === 0 && ruleBEligible(card, branch === "refusedReading" ? branch : (branch || "checksDisagree"))) {
        const greenReason = "The source supports the sentence.";
        const face = finaliseShownReason({ ...card, shownReason: greenReason }, "nothing_raised", greenReason);
        return { state: "nothing_raised", ...face, acted: true, guard: "rule_b_or_facts" };
      }
      if (gaps.length) {
        const rebuilt = reasonFromNamedGaps(gaps, statement);
        if (rebuilt) {
          const face = finaliseShownReason({ ...card, shownReason: rebuilt }, state, rebuilt);
          return { state, ...face, acted: true, guard: "named_gap" };
        }
      }
      // Fall through with emptied differ-on so later Rule B / look paths can run.
      reason = "";
    } else if (gaps.length) {
      // Keep only remaining gaps in the slot.
      const rebuilt = reasonFromNamedGaps(gaps, statement);
      if (rebuilt) {
        const face = finaliseShownReason({ ...card, shownReason: rebuilt }, state, rebuilt);
        return { state, ...face, acted: true, guard: "named_gap" };
      }
    }
  }

  // B598 refusedReading: if no gaps remain and facts matched, green even when
  // the preferred reason is a support-style restatement that names figures.
  if (branch === "refusedReading" && ruleBEligible(card, branch) && !reasonStatesGap(reason)) {
    const greenReason = reasonOnlySupports(reason) || reason
      ? scrubUserReason(reason || "The source supports the sentence.")
      : "The source supports the sentence.";
    const face = finaliseShownReason({ ...card, shownReason: greenReason }, "nothing_raised", greenReason);
    return { state: "nothing_raised", ...face, acted: true, guard: "rule_b_or_facts" };
  }

  if (reasonStatesGap(reason) && !reasonOnlySupports(reason)) {
    const face = finaliseShownReason({ ...card, shownReason: reason }, state, reason);
    return { state, ...face, acted: false, guard: "gap_ok" };
  }

  if (
    hasGrossNetConcern(card)
    && (state === "note_withheld" || branch === "compliance")
    && state !== "not_in_source"
    && state !== "conflicts"
  ) {
    const gap = grossNetGapReason(card);
    const face = finaliseShownReason({ ...card, shownReason: gap }, state, gap);
    return { state, ...face, acted: true, guard: "gross_net_gap" };
  }

  // Named gaps only fill an empty or support-only reason.
  if (gaps.length && (reasonOnlySupports(reason) || !reason)) {
    const gapReason = reasonFromNamedGaps(gaps, statement);
    if (gapReason) {
      const face = finaliseShownReason({ ...card, shownReason: gapReason }, state, gapReason);
      return { state, ...face, acted: true, guard: "named_gap" };
    }
  }

  // Rule B: checksDisagree / refusedReading / unprotected when facts match and no gaps.
  if (ruleBEligible(card, branch)) {
    // refusedReading with a reason that still names a specific differing element stays amber.
    if (branch === "refusedReading" && reasonStatesGap(reason) && reasonNamesSpecificElement(reason, statement)) {
      const face = finaliseShownReason({ ...card, shownReason: reason }, state, reason);
      return { state, ...face, acted: false, guard: "kept" };
    }
    const greenReason = reasonOnlySupports(reason)
      ? scrubUserReason(reason)
      : (clean(reason) && !reasonStatesGap(reason) ? scrubUserReason(reason) : "The source supports the sentence.");
    const face = finaliseShownReason({ ...card, shownReason: greenReason }, "nothing_raised", greenReason);
    return {
      state: "nothing_raised",
      ...face,
      acted: true,
      guard: "rule_b_or_facts",
    };
  }

  if (reasonOnlySupports(reason) || !reason) {
    // Prefer naming remaining gaps. B599 exit gate forbids a generic look line.
    if (gaps.length) {
      const gapReason = reasonFromNamedGaps(gaps, statement);
      if (gapReason) {
        const face = finaliseShownReason({ ...card, shownReason: gapReason }, state, gapReason);
        return { state, ...face, acted: true, guard: "named_gap" };
      }
    }
    // Leave empty for the exit gate to name or green. Never stamp a generic look.
    const face = finaliseShownReason({ ...card, shownReason: reason || "" }, state, reason || "");
    return { state, ...face, acted: true, guard: "await_exit_gate" };
  }

  const face = finaliseShownReason({ ...card, shownReason: reason }, state, reason);
  return { state, ...face, acted: false, guard: "kept" };
}

/**
 * Run shownTrace, then the amber reason guard, then write every stamped face.
 */
export function applyFinalStamp(card, { draftSentences = [], dealStatus = null } = {}) {
  if (!card || typeof card !== "object") {
    throw new Error("applyFinalStamp: card is missing");
  }
  const status = dealStatus ?? card.dealStatus ?? null;
  const filtered = filterCardProposals({
    ...card,
    statement: card.statement || card.text || "",
    ...(status != null ? { dealStatus: status } : {}),
  });
  const view = {
    ...filtered,
    draftSentences: Array.isArray(draftSentences) && draftSentences.length
      ? draftSentences
      : (Array.isArray(card.draftSentences) ? card.draftSentences : []),
  };
  const traced = shownTrace(view);
  let state = traced.state || "nothing_raised";
  if (!SHOWN_LABELS[state]) state = "nothing_raised";
  let setBy = traced.setBy || { branch: traced.branch || "shownTrace" };
  const evidenceState = state;
  const evidenceLabel = SHOWN_LABELS[evidenceState] || "";

  const complianceRows = Array.isArray(filtered.complianceConcerns) ? filtered.complianceConcerns : [];
  if (
    complianceRows.some(dropsGrossOrNet)
    && (state === "nothing_raised" || state === "nothing_to_raise")
  ) {
    state = "note_withheld";
    setBy = { branch: "compliance", source: "compliance", rule: "gross_net" };
  }

  const preferred = clean(filtered.shownReason)
    || clean(filtered.evidenceSummary)
    || clean(filtered.displayedEvidenceProse)
    || clean(filtered.evidenceLine)
    || clean(filtered.readingNote?.text)
    || "";

  const guarded = guardAmberOrRedReason(
    { ...view, statementVerdict: { ...(filtered.statementVerdict || {}), state, setBy }, setBy },
    state,
    preferred,
  );
  state = guarded.state;
  if (guarded.acted && guarded.guard === "rule_b_or_facts") {
    setBy = { branch: "reasonGuard", prior: setBy.branch };
  }
  const tier = shownTier(state) || filtered.statementVerdict?.tier || null;
  const evidenceFaceLabel = SHOWN_LABELS[state] || evidenceLabel || "";
  if (!evidenceFaceLabel && !SHOWN_LABELS[state]) {
    // combined may still supply a label for wording/caution overlays.
  }
  const verdict = {
    ...(filtered.statementVerdict && typeof filtered.statementVerdict === "object" ? filtered.statementVerdict : {}),
    state,
    tier,
    setBy,
  };
  const combined = combinedVerdict({
    verdict,
    editorialConcerns: Array.isArray(filtered.editorialConcerns) ? filtered.editorialConcerns : [],
    complianceVerdict: typeof filtered.complianceVerdict === "string" ? filtered.complianceVerdict : null,
    complianceConcerns: complianceRows,
  });

  // B598: one card face everywhere is the combined label/colour.
  // sentenceState stays the evidence ledger state; sentenceLabel is the face.
  // When evidence and caution (or craft) both apply, stamp and show both.
  const cautionLabel = combined.state === "caution" || combined.state === "compliance_risk"
    ? (combined.label || "")
    : "";
  const craftLabel = combined.state === "wording" ? (combined.label || "") : "";
  const evidenceFace = evidenceFaceLabel || evidenceLabel || "";
  let label = combined.label || SHOWN_LABELS[state] || "";
  if (
    cautionLabel
    && evidenceFace
    && evidenceFace !== cautionLabel
    && evidenceFace !== "Nothing raised"
  ) {
    label = `${evidenceFace}; ${cautionLabel}`;
  } else if (
    craftLabel
    && evidenceFace
    && evidenceFace !== craftLabel
    && evidenceFace !== "Nothing raised"
  ) {
    label = `${evidenceFace}; ${craftLabel}`;
  }
  if (!label) {
    throw new Error(`applyFinalStamp: no label for state ${state}`);
  }
  const stampedCombined = label === combined.label
    ? combined
    : { ...combined, label };

  const stamped = {
    ...filtered,
    statementVerdict: verdict,
    combinedVerdict: stampedCombined,
    sentenceState: state,
    sentenceLabel: label,
    evidenceLabel: evidenceFace,
    cautionLabel: cautionLabel || null,
    craftLabel: craftLabel || null,
    setBy,
    tier: combined.tier || tier,
    shownReason: guarded.shownReason,
    evidenceSummary: guarded.evidenceSummary,
    displayedEvidenceProse: guarded.displayedEvidenceProse,
    evidenceLine: guarded.evidenceLine,
    reasoningParagraph: guarded.reasoningParagraph,
    stampAuthority: "b596",
    stampGuard: guarded.guard || null,
  };
  // B599: one exit gate after the stamp so no amber/red leaves with a generic
  // or support-only reason, and figure conflicts keep their correction.
  return applyExitGate(stamped, { dealStatus: status ?? stamped.dealStatus });
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
 * Re-stamp every card in a saved analyse response and rebuild summary
 * from the stamped states only.
 */
export function restampAnalyseResponse(body, reviewOptions) {
  const statements = Array.isArray(body?.statements) ? body.statements : [];
  const dealStatus = body?.meta?.dealStatus ?? null;
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
        dealStatus: dealStatus ?? qc.dealStatus ?? null,
      },
      { draftSentences, dealStatus },
    );
    return { ...row, qcCard: stamped, sentenceLabel: stamped.sentenceLabel, sentenceState: stamped.sentenceState };
  });
  const sources = stampSourceDisplayNames(body?.sources);
  const opts = reviewOptions || body?.meta?.reviewOptions || {
    evidenceEnabled: true,
    editorialEnabled: true,
    complianceEnabled: true,
  };
  const stampedBody = {
    ...body,
    statements: nextStatements,
    sources,
    meta: {
      ...(body?.meta && typeof body.meta === "object" ? body.meta : {}),
      reviewOptions: opts,
      stampAuthority: "b596",
      dealStatus,
    },
  };
  // Exit gate rebuilds meta.reviewSummary so counts match the cards that leave.
  return applyExitGateToResponse(stampedBody, {
    dealStatus,
    reviewOptions: opts,
  });
}
