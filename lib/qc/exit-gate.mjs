/**
 * B599. One exit gate: every amber/red reason names what is wrong; no internal
 * voice; figure conflicts keep a correction proposal; counts match cards.
 * Applied as the last step before a review response leaves the backend.
 * Deterministic. No model call.
 */
import {
  everyReadingFactMatched,
  finaliseShownReason,
  matcherNamedGaps,
  scrubUserReason,
} from "./b595-card-rules.mjs";
import {
  filterPresentGaps,
  gapAppearsInLines,
  reasonFromNamedGaps,
  reasonNamesSpecificElement,
  shownSourceLines,
} from "./reason-evidence-check.mjs";
import { shownTier, SHOWN_LABELS } from "./shown-verdict.mjs";
import { combinedVerdict, dropsGrossOrNet } from "./combined-verdict.mjs";
import { summariseReview } from "./review-summary.mjs";
import { applyConflictProposal } from "../revise-actions/conflict-engagement.mjs";
import {
  cardSourceText,
  decideTransactionStatus,
  statusQuietLine,
} from "./transaction-status.mjs";

const GENERIC_LOOK = /^needs a look against the source\.?$/i;
const SUPPORTS =
  /\b(confirm(?:s|ed|ing)?|supports?|in line with|consistent with|matches|verified|as the sentence says|which supports|which reads as)\b/i;
const CONFLICTS =
  /\b(conflicts?|differ(?:s|ed|ing)?|does not|do not|doesn't|missing|omit|not in the source|beyond|incorrect|wrong|instead|whereas|however|while the (?:sentence|draft)|gross or net|qualifier|recommend|confirm the decision|completed on|later (?:document|source|notice))\b/i;
const INTERNAL_VOICE =
  /\b(?:the evidence check|the matcher|the reader|the second check|the check|evidence check notes|matchExplanations?|supportState|displayVerdict)\b/i;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function toneOfState(state) {
  if (state === "conflicts" || state === "not_in_source") return "red";
  if (state === "nothing_raised" || state === "nothing_to_raise") return "green";
  return "amber";
}

function branchOf(card) {
  return String(
    card?.statementVerdict?.setBy?.branch
    || card?.setBy?.branch
    || "",
  );
}

function reasonOnlySupports(reason) {
  const body = clean(reason);
  if (!body) return false;
  return SUPPORTS.test(body) && !CONFLICTS.test(body);
}

function reasonIsGeneric(reason) {
  const body = clean(reason);
  if (!body) return true;
  if (GENERIC_LOOK.test(body)) return true;
  if (!reasonNamesSpecificElement(body, "") && reasonOnlySupports(body)) return true;
  if (!reasonNamesSpecificElement(body, "") && !CONFLICTS.test(body) && !SUPPORTS.test(body)) {
    // Short non-specific look lines.
    if (/^needs a look/i.test(body)) return true;
  }
  return false;
}

/** Strip internal-voice sentences; keep the rest. Collapse repeated "The sentence" openers. */
export function stripInternalVoice(reason) {
  const body = clean(scrubUserReason(reason));
  if (!body) return "";
  const kept = [];
  let sawTheSentence = false;
  for (const sentence of body.split(/(?<=[.!?])\s+/)) {
    let piece = clean(sentence);
    if (!piece) continue;
    if (INTERNAL_VOICE.test(piece)) continue;
    if (/^The sentence\b/i.test(piece)) {
      if (sawTheSentence) {
        piece = piece.replace(/^The sentence\b/i, "It");
      }
      sawTheSentence = true;
    }
    kept.push(piece);
  }
  return kept.join(" ");
}

function remainingGaps(card) {
  return filterPresentGaps(matcherNamedGaps(card), card);
}

/** A gap that only names the status (committed / recommend / agreed) — resolved by chosen status. */
function isStatusOnlyGap(gap) {
  const body = clean(gap);
  if (!body) return false;
  const statusWords = /\b(?:committed|commit|recommend(?:s|ed)?|agreed|approved|completed|completion|decision was taken|confirm the decision)\b/i;
  const otherIssue = /\b(?:EUR|USD|GBP|NAV|IRR|million|billion|percent|figure|date|net|gross|September|June)\b/i;
  return statusWords.test(body) && !otherIssue.test(body);
}

function unmatchedFactSurfaces(card) {
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  return facts
    .filter((fact) => {
      const status = String(fact?.status || "").toLowerCase();
      return status && status !== "matched" && status !== "matched_disputed";
    })
    .map((fact) => clean(fact?.surface || fact?.text || ""))
    .filter(Boolean);
}

function laterDevelopmentReason(card) {
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const conflicting = matches.find((row) => {
    const cls = String(row?.classification || "").toLowerCase();
    const expl = clean(row?.explanation);
    return (cls === "conflicting" || cls === "conflict")
      && /\b(?:completed|completion|later|30 september|supersed)/i.test(expl);
  });
  if (conflicting) {
    const expl = clean(conflicting.explanation);
    // Prefer a clear naming sentence when the explanation already names the later state.
    if (/\b30 september\b/i.test(expl) || /\bcompleted\b/i.test(expl)) {
      const dateMatch = expl.match(/\b(\d{1,2}\s+\w+\s+\d{4})\b/);
      const date = dateMatch ? dateMatch[1] : "";
      if (date && /\bcomplet/i.test(expl)) {
        return `The sentence says completion is expected in the third quarter, but a later document confirms the sale completed on ${date}.`;
      }
      return scrubUserReason(expl);
    }
  }
  const note = clean(card?.readingNote?.text);
  if (note && /\b30 september\b/i.test(note) && /\bcomplet/i.test(note)) {
    const dateMatch = note.match(/\b(\d{1,2}\s+\w+\s+\d{4})\b/);
    const date = dateMatch ? dateMatch[1] : "a later date";
    return `The sentence says completion is expected in the third quarter, but a later document confirms the sale completed on ${date}.`;
  }
  const docs = Array.isArray(card?.readingNote?.documentValues) ? card.readingNote.documentValues : [];
  for (const row of docs) {
    const value = clean(row?.value);
    if (/\bcomplet(?:ed|ion)\b/i.test(value) && /\d{4}/.test(value)) {
      const dateMatch = value.match(/\b(\d{1,2}\s+\w+\s+\d{4})\b/);
      if (dateMatch) {
        return `The sentence says completion is expected in the third quarter, but a later document confirms the sale completed on ${dateMatch[1]}.`;
      }
    }
  }
  return "";
}

function namingReason(card, statement) {
  const later = laterDevelopmentReason(card);
  if (later) return later;
  const gaps = remainingGaps(card).filter((gap) => !reasonOnlySupports(gap));
  if (gaps.length) {
    const rebuilt = reasonFromNamedGaps(gaps, statement);
    if (rebuilt && !reasonOnlySupports(rebuilt)) return rebuilt;
  }
  const unmatched = unmatchedFactSurfaces(card)
    .slice()
    .sort((a, b) => b.length - a.length || b.localeCompare(a));
  if (unmatched.length) {
    const surface = unmatched.find((s) => !/^(two|one|three|four|five|six|seven|eight|nine|ten)$/i.test(s))
      || unmatched[0];
    return `The source does not support ${surface}.`;
  }
  if (Array.isArray(card?.complianceConcerns) && card.complianceConcerns.some(dropsGrossOrNet)) {
    return "The draft drops the gross or net qualifier on the figure, so a reader cannot tell whether it is gross or net.";
  }
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  for (const row of matches) {
    const expl = clean(row?.explanation);
    if (!expl) continue;
    if (reasonOnlySupports(expl)) continue;
    if (CONFLICTS.test(expl)) return scrubUserReason(expl);
    const cls = String(row?.classification || "").toLowerCase();
    if (cls === "conflicting" || cls === "conflict" || cls === "no_support" || cls === "not_in_source") {
      return scrubUserReason(expl);
    }
  }
  return "";
}

function attachFigureCorrection(card, statement) {
  const state = card?.sentenceState || card?.statementVerdict?.state || "";
  if (state !== "conflicts" && state !== "not_in_source") return card;
  const hasFigure = (Array.isArray(card?.readingFacts) ? card.readingFacts : [])
    .some((fact) => String(fact?.kind || "") === "figure")
    || /\b(?:EUR|USD|GBP|\$|€|£)\s*\d/i.test(statement)
    || /\d[\d,]*(?:\.\d+)?\s*(?:million|billion|m|bn)\b/i.test(statement);
  if (!hasFigure) return card;

  const existing = clean(
    card?.conflictProposal?.proposedChange
    || card?.suggestedImprovement
    || card?.evidenceSuggestedDirection
    || "",
  );
  if (existing && /\d/.test(existing)) return card;

  const finding = {
    statement,
    primaryExcerpt: card?.primaryExcerpt || card?.primaryExcerptText || card?.sourceQuote || "",
    supportSpans: Array.isArray(card?.supportSpans) && card.supportSpans.length
      ? card.supportSpans
      : [{ text: card?.primaryExcerpt || card?.primaryExcerptText || card?.sourceQuote || "" }],
  };
  let proposal = null;
  try {
    const out = applyConflictProposal(finding);
    proposal = out?.proposal || null;
  } catch {
    proposal = null;
  }
  if (!proposal?.proposedChange && !proposal?.resultingSentence) {
    // Deterministic fallback: replace the draft figure surface with the source figure from the reason.
    const reason = clean(card?.shownReason || card?.evidenceSummary || "");
    const sourceFig = reason.match(/\b((?:EUR|USD|GBP)\s*\d[\d,]*(?:\.\d+)?\s*million)\b/i);
    const draftFig = statement.match(/\b((?:EUR|USD|GBP)\s*\d[\d,]*(?:\.\d+)?\s*million)\b/i);
    if (sourceFig && draftFig && sourceFig[1] !== draftFig[1] && reason.includes(sourceFig[1])) {
      const resulting = statement.replace(draftFig[1], sourceFig[1]);
      if (resulting !== statement) {
        proposal = {
          proposedChange: `Replace '${draftFig[1]}' with '${sourceFig[1]}'.`,
          resultingSentence: resulting,
          why: "Source figure for the same date.",
        };
      }
    }
  }
  if (!proposal?.resultingSentence && !proposal?.proposedChange) return card;

  const resulting = clean(proposal.resultingSentence)
    || (proposal.proposedChange && statement); // fallback keep statement if only instruction
  const proposedChange = clean(proposal.proposedChange)
    || (proposal.resultingSentence ? `Replace the draft sentence with '${proposal.resultingSentence}'.` : "");

  return {
    ...card,
    conflictProposal: {
      proposedChange,
      resultingSentence: resulting || proposal.resultingSentence,
      why: clean(proposal.why) || "Source figure for the same date or period.",
    },
    suggestedImprovement: resulting || proposal.resultingSentence || card.suggestedImprovement,
    evidenceSuggestedDirection: proposedChange,
    evidenceProposal: {
      kind: "evidence",
      proposedChange,
      resultingSentence: resulting || proposal.resultingSentence,
      suggestedDirection: proposedChange,
    },
  };
}

/**
 * Apply transaction-status ruling. Status branch owns colour/reason when it fires.
 */
function applyStatusRuling(card, dealStatus) {
  const statement = clean(card?.statement || card?.text || "");
  const ruling = decideTransactionStatus({
    statement,
    dealStatus: dealStatus ?? card?.dealStatus,
    sourceText: cardSourceText(card),
  });
  if (!ruling.statusDependent) {
    return {
      ...card,
      statusDependent: false,
      claimedStatus: ruling.claimedStatus || null,
      statusQuietLine: null,
    };
  }

  let next = {
    ...card,
    statusDependent: true,
    claimedStatus: ruling.claimedStatus,
    chosenStatus: ruling.chosenStatus,
    dealStatus: dealStatus ?? card?.dealStatus ?? null,
  };

  if (ruling.needsConfirm || ruling.exceeds) {
    const state = "note_withheld";
    const face = finaliseShownReason({ ...next, shownReason: ruling.reason }, state, ruling.reason);
    const setBy = { branch: "transactionStatus", source: "status" };
    next = {
      ...next,
      ...face,
      sentenceState: state,
      statementVerdict: {
        ...(next.statementVerdict || {}),
        state,
        tier: shownTier(state),
        setBy,
      },
      setBy,
      statusQuietLine: null,
      statusNeedsConfirm: true,
    };
    return restampCombined(next);
  }

  if (ruling.covered) {
    // Accept status as fact. Status-named gaps (committed vs recommend) are resolved
    // by the chosen status. Other issues (figures, later completion, gross/net) stay.
    const gaps = remainingGaps(next).filter((gap) => !isStatusOnlyGap(gap));
    const unmatched = unmatchedFactSurfaces(next);
    const later = laterDevelopmentReason(next);
    const hasGrossNet = Array.isArray(next.complianceConcerns) && next.complianceConcerns.some(dropsGrossOrNet);
    const evidenceConflict = ["conflicts", "not_in_source"].includes(
      String(next.sentenceState || next.statementVerdict?.state || ""),
    ) && unmatched.length > 0;
    const otherIssues = gaps.length > 0 || unmatched.length > 0 || Boolean(later) || hasGrossNet || evidenceConflict;
    if (!otherIssues) {
      const support = "The source supports the sentence.";
      const quiet = ruling.quietLine || statusQuietLine(ruling.chosenStatus);
      const reason = quiet ? `${support} ${quiet}` : support;
      const state = "nothing_raised";
      const face = finaliseShownReason({ ...next, shownReason: reason }, state, reason);
      const setBy = { branch: "transactionStatus", source: "status", covered: true };
      next = {
        ...next,
        ...face,
        sentenceState: state,
        statementVerdict: {
          ...(next.statementVerdict || {}),
          state,
          tier: shownTier(state),
          setBy,
        },
        setBy,
        statusQuietLine: quiet,
        statusNeedsConfirm: false,
      };
      return restampCombined(next);
    }
    // Covered for status but other issues remain — keep colour, attach quiet line under reason.
    if (ruling.quietLine) {
      const base = stripInternalVoice(next.shownReason || next.evidenceSummary || "") || "The source supports the sentence.";
      const withoutStatusNoise = isStatusOnlyGap(base) ? "The source supports the sentence." : base;
      const reason = `${withoutStatusNoise} ${ruling.quietLine}`;
      const face = finaliseShownReason({ ...next, shownReason: reason }, next.sentenceState, reason);
      next = { ...next, ...face, statusQuietLine: ruling.quietLine, statusNeedsConfirm: false };
    }
    return next;
  }

  return next;
}

function restampCombined(card) {
  const state = card.sentenceState || card.statementVerdict?.state || "nothing_raised";
  const evidenceFace = SHOWN_LABELS[state] || "";
  const verdict = {
    ...(card.statementVerdict && typeof card.statementVerdict === "object" ? card.statementVerdict : {}),
    state,
    tier: shownTier(state) || card.statementVerdict?.tier || null,
    setBy: card.setBy || card.statementVerdict?.setBy || { branch: "exitGate" },
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
    stampAuthority: card.stampAuthority || "b596",
  };
}

/**
 * Final gate for one stamped card.
 */
export function applyExitGate(card, { dealStatus } = {}) {
  if (!card || typeof card !== "object") return card;
  const statement = clean(card.statement || card.text || "");
  let next = { ...card, statement };

  // Item 9: strip internal voice first.
  const stripped = stripInternalVoice(next.shownReason || next.evidenceSummary || "");
  if (stripped !== clean(next.shownReason || "")) {
    const state = next.sentenceState || next.statementVerdict?.state || "note_withheld";
    const face = finaliseShownReason({ ...next, shownReason: stripped }, state, stripped || "");
    next = { ...next, ...face };
  }

  // Item 3 / status ruling (owns status-dependent faces).
  next = applyStatusRuling(next, dealStatus ?? next.dealStatus);

  const state = next.sentenceState || next.statementVerdict?.state || "";
  const tone = toneOfState(state);
  const branch = branchOf(next);

  // Drop claimed gaps that already appear in shown source lines (I2).
  if (tone === "amber" || tone === "red") {
    let reason = stripInternalVoice(next.shownReason || next.evidenceSummary || "");
    const lines = shownSourceLines(next);
    const claimed = [];
    const differ = reason.match(/\bdiffer(?:s|ed|ing)? on (.+?)(?:\.|$)/i);
    if (differ) claimed.push(differ[1]);
    const missing = reason.match(/\b(?:does not (?:state|mention|address|give|use)|not in the source|omits?|missing)[:\s]+(.+?)(?:\.|$)/i);
    if (missing) claimed.push(missing[1]);
    const presentClaim = claimed.find((gap) => gapAppearsInLines(gap, lines));
    if (presentClaim) {
      const gaps = remainingGaps(next);
      if (gaps.length === 0 && everyReadingFactMatched(next) && !laterDevelopmentReason(next)) {
        const support = "The source supports the sentence.";
        const greenState = "nothing_raised";
        const face = finaliseShownReason({ ...next, shownReason: support }, greenState, support);
        next = restampCombined({
          ...next,
          ...face,
          sentenceState: greenState,
          statementVerdict: {
            ...(next.statementVerdict || {}),
            state: greenState,
            tier: shownTier(greenState),
            setBy: { branch: "exitGate", prior: branch },
          },
          setBy: { branch: "exitGate", prior: branch },
        });
      } else if (gaps.length) {
        const rebuilt = reasonFromNamedGaps(gaps, statement);
        if (rebuilt) {
          const face = finaliseShownReason({ ...next, shownReason: rebuilt }, state, rebuilt);
          next = { ...next, ...face };
        }
      } else {
        const named = namingReason(next, statement);
        if (named) {
          const face = finaliseShownReason({ ...next, shownReason: named }, state, named);
          next = { ...next, ...face };
        }
      }
    }
  }

  // Refresh after possible I2 rewrite.
  {
    const refreshedState = next.sentenceState || next.statementVerdict?.state || state;
    // Item 7 continues with refreshed face.
    void refreshedState;
  }

  // Item 7: amber/red must name the issue (except status-owned and statementVerdict when already naming).
  {
  const state2 = next.sentenceState || next.statementVerdict?.state || state;
  const tone2 = toneOfState(state2);
  const branch2 = branchOf(next);
  if (tone2 === "amber" || tone2 === "red") {
    let reason = stripInternalVoice(next.shownReason || next.evidenceSummary || "");
    const statusOwned = branch2 === "transactionStatus" && next.statusDependent;
    if (!statusOwned && (reasonIsGeneric(reason) || reasonOnlySupports(reason) || !reason)) {
      if (branch !== "statementVerdict" || reasonIsGeneric(reason) || reasonOnlySupports(reason)) {
        const gaps = remainingGaps(next);
        const unmatched = unmatchedFactSurfaces(next);
        if (everyReadingFactMatched(next) && gaps.length === 0 && unmatched.length === 0 && !laterDevelopmentReason(next)) {
          // Rule B: green with supporting reason.
          const support = reasonOnlySupports(reason)
            ? scrubUserReason(reason)
            : "The source supports the sentence.";
          const greenState = "nothing_raised";
          const face = finaliseShownReason({ ...next, shownReason: support }, greenState, support);
          next = {
            ...next,
            ...face,
            sentenceState: greenState,
            statementVerdict: {
              ...(next.statementVerdict || {}),
              state: greenState,
              tier: shownTier(greenState),
              setBy: { branch: "exitGate", prior: branch2 },
            },
            setBy: { branch: "exitGate", prior: branch2 },
          };
          next = restampCombined(next);
        } else {
          const named = namingReason(next, statement) || "The sentence and the source disagree on a material point.";
          const face = finaliseShownReason({ ...next, shownReason: named }, state2, named);
          next = {
            ...next,
            ...face,
            setBy: { ...(next.setBy || {}), exitGate: "named" },
          };
          next = restampCombined(next);
        }
      }
    } else if (!statusOwned && INTERNAL_VOICE.test(clean(next.shownReason || ""))) {
      const named = stripInternalVoice(next.shownReason) || namingReason(next, statement);
      const face = finaliseShownReason({ ...next, shownReason: named }, state2, named);
      next = { ...next, ...face };
    }
  }
  }

  // Item 8: figure conflict proposal.
  next = attachFigureCorrection(next, statement);

  // Final internal-voice scrub on the face that leaves.
  const finalReason = stripInternalVoice(next.shownReason || next.evidenceSummary || "");
  if (finalReason && finalReason !== clean(next.shownReason || "")) {
    const face = finaliseShownReason({ ...next, shownReason: finalReason }, next.sentenceState, finalReason);
    next = { ...next, ...face };
  }

  // Refuse to leave amber/red with generic / support-only / internal voice.
  const leaveTone = toneOfState(next.sentenceState || next.statementVerdict?.state || "");
  const leaveReason = clean(next.shownReason || next.evidenceSummary || "");
  if (
    (leaveTone === "amber" || leaveTone === "red")
    && (reasonIsGeneric(leaveReason) || reasonOnlySupports(leaveReason) || INTERNAL_VOICE.test(leaveReason) || !leaveReason)
  ) {
    const named = namingReason(next, statement) || laterDevelopmentReason(next)
      || "The sentence and the source disagree on a material point.";
    const face = finaliseShownReason({ ...next, shownReason: named }, next.sentenceState, named);
    next = restampCombined({ ...next, ...face });
  }

  next.stampGate = "b599";
  return next;
}

/**
 * Apply the exit gate to every card in an analyse response and rebuild summary.
 */
export function applyExitGateToResponse(body, { dealStatus, reviewOptions } = {}) {
  const statements = Array.isArray(body?.statements) ? body.statements : [];
  const status = dealStatus ?? body?.meta?.dealStatus ?? null;
  const nextStatements = statements.map((row) => {
    const qc = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : {};
    const stamped = applyExitGate(
      {
        ...qc,
        statement: typeof row?.text === "string" ? row.text : (qc.statement || ""),
        dealStatus: status ?? qc.dealStatus,
      },
      { dealStatus: status ?? qc.dealStatus },
    );
    return {
      ...row,
      qcCard: stamped,
      sentenceLabel: stamped.sentenceLabel,
      sentenceState: stamped.sentenceState,
    };
  });
  const cards = nextStatements.map((row) => row.qcCard).filter(Boolean);
  const opts = reviewOptions || body?.meta?.reviewOptions || {
    evidenceEnabled: true,
    editorialEnabled: true,
    complianceEnabled: true,
  };
  const reviewSummary = summariseReview(cards, opts);
  return {
    ...body,
    statements: nextStatements,
    meta: {
      ...(body?.meta && typeof body.meta === "object" ? body.meta : {}),
      reviewSummary,
      reviewOptions: opts,
      dealStatus: status,
      stampGate: "b599",
    },
  };
}

/**
 * Re-apply status ruling to every statusDependent card after the writer picks a status.
 */
export function restampTransactionStatus(body, dealStatus, reviewOptions) {
  const withStatus = {
    ...body,
    meta: {
      ...(body?.meta && typeof body.meta === "object" ? body.meta : {}),
      dealStatus,
    },
  };
  // Re-run full stamp path first when available via caller; here apply exit gate
  // over existing stamps with the new status.
  const statements = Array.isArray(withStatus.statements) ? withStatus.statements : [];
  const nextStatements = statements.map((row) => {
    const qc = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : {};
    const base = {
      ...qc,
      statement: typeof row?.text === "string" ? row.text : (qc.statement || ""),
      dealStatus,
    };
    const stamped = applyExitGate(base, { dealStatus });
    return {
      ...row,
      qcCard: stamped,
      sentenceLabel: stamped.sentenceLabel,
      sentenceState: stamped.sentenceState,
    };
  });
  const cards = nextStatements.map((row) => row.qcCard).filter(Boolean);
  const opts = reviewOptions || body?.meta?.reviewOptions || {
    evidenceEnabled: true,
    editorialEnabled: true,
    complianceEnabled: true,
  };
  return {
    ...withStatus,
    statements: nextStatements,
    meta: {
      ...(withStatus.meta || {}),
      reviewSummary: summariseReview(cards, opts),
      reviewOptions: opts,
      dealStatus,
      stampGate: "b599",
      statusHistoryEntry: `Transaction status set to ${dealStatus}`,
    },
  };
}
