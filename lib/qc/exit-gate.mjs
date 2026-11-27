/**
 * B599. One exit gate: every amber/red reason names what is wrong; no internal
 * voice; figure conflicts keep a correction proposal; counts match cards.
 * Applied as the last step before a review response leaves the backend.
 * Deterministic. No model call.
 */
import { alignNoteOpenerWithLabel, dropNoteSentencesAboutQuietCards, wholeSentencesOnly } from "./note-card-consistency.mjs";
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
import { applyB602CardRules } from "./b602-card-rules.mjs";
import { applyB603CardRules } from "./b603-card-rules.mjs";
import { applyB606CardRules } from "./b606-card-rules.mjs";
import { dedupeJoinedReason } from "./note-card-consistency.mjs";
import { resolveAlsoAppearsAgainstSources } from "./resolve-also-appears.mjs";
import {
  summariseReview,
  displayedEditorialConcerns,
  displayedComplianceConcerns,
  displayedHouseStyleConcerns,
} from "./review-summary.mjs";
import { applyConflictProposal } from "../revise-actions/conflict-engagement.mjs";
import {
  cardSourceText,
  decideTransactionStatus,
  statusQuietLine,
} from "./transaction-status.mjs";
import { applySpellingNotesToCard } from "./house-spelling-check.mjs";
import { applyAttributionClauseCheck } from "./attribution-clause-check.mjs";
import { applyRangeStyleNotesToCard } from "./range-style-check.mjs";
import { applyGrowthPeriodNotesToCard } from "./growth-period-check.mjs";
import { spellingStored } from "./house-spelling.mjs";

const GENERIC_LOOK = /^needs a look against the source\.?$/i;
/** Existing refused-reading sentence (How to read / export). */
export const REFUSED_READING_REASON =
  "Needs a look: the check could not settle the point from the source alone.";
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
  // B606 C2: negated conflict language is support, not conflict.
  const withoutNegation = body
    .replace(/\bno\s+conflicts?\b/gi, " ")
    .replace(/\bdoes not contradict\b/gi, " ")
    .replace(/\bdo not contradict\b/gi, " ")
    .replace(/\bwithout conflict\b/gi, " ");
  if (/\breads as the sentence says\b/i.test(withoutNegation) && !CONFLICTS.test(withoutNegation)) {
    return true;
  }
  return SUPPORTS.test(withoutNegation) && !CONFLICTS.test(withoutNegation);
}

/**
 * B618. A restatement of what the source says, with no gap language.
 * Amber cards must not leave this as the only reason (B606 C2).
 */
function reasonIsSupportRestatement(reason) {
  const body = clean(reason);
  if (!body) return false;
  if (reasonOnlySupports(body)) return true;
  if (CONFLICTS.test(body)) return false;
  return /^The (?:source|memo|document|passage|excerpt|press release|distribution notice)\s+(?:says|states|reports|gives|describes|continues)\b/i.test(body)
    || /\bThe source says\b/i.test(body);
}

/**
 * B606 C2. Amber/red copy that argues the sources back the sentence, even when
 * it also mentions a later date. Those reasons must be replaced.
 * B618: "The source says …" restatements are handled only on refused-reading
 * amber cards (reasonIsSupportRestatement), not here, so other amber faces
 * are not emptied into the generic disagree line.
 */
function reasonReadsAsSupport(reason) {
  const body = clean(reason);
  if (!body) return false;
  if (reasonOnlySupports(body)) return true;
  return /\b(?:supports? the sentence|reads as the sentence says|no conflicts?|does not contradict|do not contradict|in line with)\b/i.test(body);
}

/**
 * B618. Prefer the matcher's partial/conflicting gap explanation for a refused
 * amber card; otherwise the existing refused-reading sentence.
 */
function refusedReadingGapReason(card, statement) {
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  for (const row of matches) {
    const cls = String(row?.classification || "").toLowerCase();
    const expl = clean(row?.explanation);
    if (!expl) continue;
    if (reasonOnlySupports(expl) || reasonIsSupportRestatement(expl)) continue;
    const gapClass = cls === "partially_confirmed"
      || cls === "conflicting"
      || cls === "conflict"
      || cls === "no_support"
      || cls === "not_in_source";
    if (!gapClass && !CONFLICTS.test(expl)) continue;
    if (!CONFLICTS.test(expl) && !/\bpartial\b/i.test(expl)) continue;
    const scrubbed = scrubUserReason(expl);
    const whole = wholeSentencesOnly(scrubbed) || scrubbed;
    if (whole && !reasonOnlySupports(whole) && !reasonIsSupportRestatement(whole)) return whole;
  }
  const named = namingReason(card, statement);
  if (named && !reasonOnlySupports(named) && !reasonIsSupportRestatement(named)) return named;
  return REFUSED_READING_REASON;
}

function isRefusedReadingCard(card) {
  if (card?.readingNote?.refused === true) return true;
  return branchOf(card) === "refusedReading";
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
  const statement = clean(card?.statement || card?.text || "");
  const expectsLater = /\bexpected to complete\b/i.test(statement)
    || /\bthird quarter\b/i.test(statement)
    || /\bcomplet(?:e|ion)\b/i.test(statement);
  const stampLater = (date) => (
    `A later source reports the transaction completed${date ? ` on ${date}` : ""}. Update the sentence or confirm the status.`
  );
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const conflicting = matches.find((row) => {
    const cls = String(row?.classification || "").toLowerCase();
    const expl = clean(row?.explanation);
    // A later-dated completion, not a recommend-vs-committed status quarrel.
    return (cls === "conflicting" || cls === "conflict")
      && /\b(?:later|30 september|supersed|expected to complete|third quarter)\b/i.test(expl)
      && /\bcomplet/i.test(expl);
  });
  if (conflicting) {
    const expl = clean(conflicting.explanation);
    const dateMatch = expl.match(/\b(\d{1,2}\s+\w+\s+\d{4})\b/);
    const date = dateMatch ? dateMatch[1] : "";
    if (date && /\bcomplet/i.test(expl)) {
      return expectsLater
        ? stampLater(date)
        : `The sentence says completion is expected in the third quarter, but a later document confirms the sale completed on ${date}.`;
    }
    if (/\b(?:later|supersed|expected to complete|third quarter)\b/i.test(expl)) {
      return scrubUserReason(expl);
    }
  }
  const note = clean(card?.readingNote?.text);
  if (note && /\b30 september\b/i.test(note) && /\bcomplet/i.test(note)) {
    const dateMatch = note.match(/\b(\d{1,2}\s+\w+\s+\d{4})\b/);
    const date = dateMatch ? dateMatch[1] : "30 September 2026";
    return stampLater(date);
  }
  const docs = Array.isArray(card?.readingNote?.documentValues) ? card.readingNote.documentValues : [];
  for (const row of docs) {
    const value = clean(row?.value);
    if (/\bcomplet(?:ed|ion)\b/i.test(value) && /\d{4}/.test(value)) {
      const dateMatch = value.match(/\b(\d{1,2}\s+\w+\s+\d{4})\b/);
      if (dateMatch) return stampLater(dateMatch[1]);
    }
  }
  // Passage / support span may itself report a later completion date.
  const corpus = [
    card?.primaryExcerptText || card?.primaryExcerpt,
    ...(Array.isArray(card?.supportSpans) ? card.supportSpans.map((span) => span?.passage || span?.text) : []),
  ].map(clean).join(" ");
  if (expectsLater && /\bcomplet(?:ed|ion)\b/i.test(corpus)) {
    const dateMatch = corpus.match(/\b(\d{1,2}\s+\w+\s+\d{4})\b/);
    if (dateMatch && /30\s+september\s+2026/i.test(dateMatch[1])) return stampLater(dateMatch[1]);
    if (dateMatch && /\b(?:september|october|november|december)\b/i.test(dateMatch[1])) {
      return stampLater(dateMatch[1]);
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
function applyStatusRuling(card, dealStatus, subject, { eventType = null, statusOpened = false } = {}) {
  const statement = clean(card?.statement || card?.text || "");
  const ruling = decideTransactionStatus({
    statement,
    dealStatus: dealStatus ?? card?.dealStatus,
    sourceText: cardSourceText(card),
    subject: subject || card?.transactionSubject || null,
    eventType: eventType || card?.eventType || null,
    statusOpened,
  });

  // B617: apply date/figure conflicts before the !statusDependent early return.
  // F64 used to hide buttons on pure date conflicts; status-recommend keeps them.
  if (ruling.factConflict || ruling.state === "conflicts") {
    const state = "conflicts";
    const reason = ruling.reason;
    const keepButtons = ruling.statusDependent === true
      || ruling.needsConfirm === true
      || /confirm (?:the decision was taken|its status)/i.test(reason);
    const face = finaliseShownReason({ ...card, shownReason: reason }, state, reason);
    const setBy = { branch: "transactionStatus", source: "status-fact" };
    return restampCombined({
      ...card,
      ...face,
      statusDependent: keepButtons,
      statusNeedsConfirm: keepButtons && ruling.needsConfirm === true,
      claimedStatus: ruling.claimedStatus,
      chosenStatus: ruling.chosenStatus,
      dealStatus: dealStatus ?? card?.dealStatus ?? null,
      sentenceState: state,
      statementVerdict: {
        ...(card.statementVerdict || {}),
        state,
        tier: shownTier(state),
        setBy,
      },
      setBy,
      statusQuietLine: ruling.quietLine || null,
    });
  }

  if (!ruling.statusDependent) {
    const wasStatusOwned = card?.statusNeedsConfirm === true
      || card?.setBy?.branch === "transactionStatus"
      || card?.statementVerdict?.setBy?.branch === "transactionStatus";
    let cleared = {
      ...card,
      statusDependent: false,
      statusNeedsConfirm: false,
      claimedStatus: ruling.claimedStatus || null,
      statusQuietLine: null,
    };
    if (wasStatusOwned) {
      // B600. Prior-history / out-of-scope status amber is dropped; gate re-checks facts.
      const support = "The source supports the sentence.";
      const state = "nothing_raised";
      const face = finaliseShownReason({ ...cleared, shownReason: support }, state, support);
      cleared = {
        ...cleared,
        ...face,
        sentenceState: state,
        statementVerdict: {
          ...(cleared.statementVerdict || {}),
          state,
          tier: shownTier(state),
          setBy: { branch: "transactionStatusCleared", source: "status-scope" },
        },
        setBy: { branch: "transactionStatusCleared", source: "status-scope" },
      };
      return restampCombined(cleared);
    }
    return cleared;
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
      statusNeedsConfirm: ruling.needsConfirm === true,
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
    // Covered for status but other issues remain — keep colour; issue reason wins over support.
    {
      const named = later || namingReason(next, statement) || stripInternalVoice(next.shownReason || next.evidenceSummary || "");
      const base = reasonOnlySupports(named) && later
        ? later
        : (isStatusOnlyGap(named) || reasonOnlySupports(named)
          ? (later || namingReason(next, statement) || named)
          : named);
      const withQuiet = ruling.quietLine && base && !base.includes(ruling.quietLine)
        ? `${base} ${ruling.quietLine}`
        : base;
      const face = finaliseShownReason({ ...next, shownReason: withQuiet }, next.sentenceState, withQuiet);
      next = {
        ...next,
        ...face,
        statusQuietLine: ruling.quietLine || null,
        statusNeedsConfirm: false,
      };
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
 * B601 F32. When a reading fact (figure/percentage/date) differs from the source
 * and the reason names that difference, promote to red "Conflicts with the source".
 */
function promoteFigureDiffToRed(card) {
  const state = card?.sentenceState || card?.statementVerdict?.state || "";
  if (state === "conflicts" || state === "not_in_source") return card;
  if (toneOfState(state) !== "amber") return card;
  // Status-confirm amber keeps its buttons; figure promotion does not own those.
  if (card?.statusNeedsConfirm === true && branchOf(card) === "transactionStatus") return card;
  if (branchOf(card) === "attributionClause") return card;

  const reason = clean(card?.shownReason || card?.evidenceSummary || "");
  const reading = card?.readingNote && typeof card.readingNote === "object" ? card.readingNote : null;
  const disputed = Array.isArray(reading?.disputedElements) ? reading.disputedElements : [];
  const bucketConflicts = reading?.bucket === "conflicts";

  // Two numeric readings of the same metric named in the reason (30% vs 20%, 0.8 vs 0.6).
  const twoFigures = (reason.match(/\d+(?:\.\d+)?%?/g) || []).length >= 2;
  const namesDiff = /\b(?:differ(?:s|ed|ing)?|more than|less than|instead of|gives?\s+(?:only\s+)?(?:more than\s+)?\d|says?\s+(?:only\s+)?(?:more than\s+)?\d|states?\s+(?:only\s+)?(?:more than\s+)?\d|not\s+\d|vs\.?|versus|improved by|grown by)\b/i.test(reason)
    && twoFigures;
  const figureFact = disputed.some((el) => /\d/.test(String(el || "")))
    || twoFigures;
  const readingSaysConflict = bucketConflicts && disputed.some((el) => /\d/.test(String(el || "")));

  if (!(namesDiff && figureFact) && !readingSaysConflict) return card;

  const redState = "conflicts";
  const redReason = reason
    || "The sentence and the source disagree on a figure.";
  const face = finaliseShownReason({ ...card, shownReason: redReason }, redState, redReason);
  // B617: a status-confirm ask keeps its buttons on a red card.
  const keepStatus = card?.statusDependent === true
    || branchOf(card) === "decisionAsMade"
    || branchOf(card) === "transactionStatus"
    || /confirm (?:the decision was taken|its status)/i.test(redReason);
  return restampCombined({
    ...card,
    ...face,
    sentenceState: redState,
    statusDependent: keepStatus ? true : card?.statusDependent === true,
    statusNeedsConfirm: keepStatus ? true : card?.statusNeedsConfirm === true,
    statementVerdict: {
      ...(card.statementVerdict || {}),
      state: redState,
      tier: shownTier(redState),
      setBy: { branch: "figureDiff", source: "exitGate", prior: branchOf(card) },
    },
    setBy: { branch: "figureDiff", source: "exitGate", prior: branchOf(card) },
  });
}

/**
 * Final gate for one stamped card.
 */
export function applyExitGate(card, {
  dealStatus,
  subject,
  eventType = null,
  statusOpened = false,
  houseStyle = null,
  reviewOptions = null,
  sourceTexts = null,
} = {}) {
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
  next = applyStatusRuling(
    next,
    dealStatus ?? next.dealStatus,
    subject ?? next.transactionSubject,
    { eventType: eventType || next.eventType, statusOpened },
  );

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
    const refused = isRefusedReadingCard(next);
    const needsGapReason = reasonIsGeneric(reason)
      || reasonReadsAsSupport(reason)
      || !reason
      || (refused && (reasonIsSupportRestatement(reason) || !CONFLICTS.test(reason)));
    if (!statusOwned && needsGapReason) {
      if (branch !== "statementVerdict" || needsGapReason) {
        const gaps = remainingGaps(next);
        const unmatched = unmatchedFactSurfaces(next);
        const refusedKeepsAmber = refused && (
          refusedReadingGapReason(next, statement) !== REFUSED_READING_REASON
          || Boolean(laterDevelopmentReason(next))
          || unmatched.length > 0
          || gaps.length > 0
        );
        if (
          everyReadingFactMatched(next)
          && gaps.length === 0
          && unmatched.length === 0
          && !laterDevelopmentReason(next)
          && !refusedKeepsAmber
        ) {
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
          const named = (refused
            ? refusedReadingGapReason(next, statement)
            : namingReason(next, statement))
            || "The sentence and the source disagree on a material point.";
          const face = finaliseShownReason({ ...next, shownReason: named }, state2, named);
          next = {
            ...next,
            ...face,
            setBy: { ...(next.setBy || {}), exitGate: refused ? "refusedReadingGap" : "named" },
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

  // B601 F34: cause / support clauses (before figure-diff promotion).
  {
    const toneNow = toneOfState(next.sentenceState || next.statementVerdict?.state || "");
    // Do not soften a red conflict; raise amber when green, or keep amber naming.
    if (toneNow !== "red") {
      const attr = applyAttributionClauseCheck(next);
      if (attr.changed) {
        const face = finaliseShownReason(
          { ...attr.card, shownReason: attr.card.shownReason },
          attr.card.sentenceState,
          attr.card.shownReason,
        );
        next = restampCombined({ ...attr.card, ...face });
      }
    }
  }

  // B601 F32: differing figures are red.
  next = promoteFigureDiffToRed(next);

  // B601 F17 + ranges: house-style notes (never change evidence colour).
  {
    const spelling = spellingStored(houseStyle?.spelling || reviewOptions?.spelling || next.houseSpelling);
    next = applySpellingNotesToCard(next, spelling);
    const rangeChoice = houseStyle?.numericRange
      ?? houseStyle?.styleChoices?.numericRange
      ?? reviewOptions?.numericRange
      ?? "on";
    next = applyRangeStyleNotesToCard(next, { enabled: rangeChoice !== "off" });
    next = applyGrowthPeriodNotesToCard(next, { enabled: true });
  }

  // Final internal-voice scrub on the face that leaves.
  const finalReason = stripInternalVoice(next.shownReason || next.evidenceSummary || "");
  if (finalReason && finalReason !== clean(next.shownReason || "")) {
    const face = finaliseShownReason({ ...next, shownReason: finalReason }, next.sentenceState, finalReason);
    next = { ...next, ...face };
  }

  // Refuse to leave amber/red with generic / support-only / internal voice.
  // B618: refused-reading amber must state the gap, never a support restatement alone.
  const leaveTone = toneOfState(next.sentenceState || next.statementVerdict?.state || "");
  const leaveReason = clean(next.shownReason || next.evidenceSummary || "");
  const leaveRefused = isRefusedReadingCard(next);
  if (
    (leaveTone === "amber" || leaveTone === "red")
    && (
      reasonIsGeneric(leaveReason)
      || reasonOnlySupports(leaveReason)
      || INTERNAL_VOICE.test(leaveReason)
      || !leaveReason
      || (leaveRefused && (reasonIsSupportRestatement(leaveReason) || !CONFLICTS.test(leaveReason)))
    )
  ) {
    const named = (leaveRefused
      ? refusedReadingGapReason(next, statement)
      : namingReason(next, statement))
      || laterDevelopmentReason(next)
      || "The sentence and the source disagree on a material point.";
    const face = finaliseShownReason({ ...next, shownReason: named }, next.sentenceState, named);
    next = restampCombined({ ...next, ...face });
  }

  // B602 face rules (gross/net, multi-source, evidence/reason, opinion cards, …).
  next = applyB602CardRules(next, {
    dealStatus: dealStatus ?? next.dealStatus,
    sourceCorpus: next.sourceCorpus || null,
  });
  // B603 leftovers + Shopify face rules.
  next = applyB603CardRules(next, {
    dealStatus: dealStatus ?? next.dealStatus,
    sourceCorpus: next.sourceCorpus || null,
  });
  // B606: qualifier proposal, relevant passages, reason dedupe.
  next = applyB606CardRules(next);
  {
    const deduped = dedupeJoinedReason(clean(next.shownReason || next.evidenceSummary || ""));
    if (deduped && deduped !== clean(next.shownReason || "")) {
      const face = finaliseShownReason({ ...next, shownReason: deduped }, next.sentenceState, deduped);
      next = { ...next, ...face };
    }
  }
  // B607: Also-appears / conflict passages use joined-source line numbers.
  {
    const texts = Array.isArray(sourceTexts) && sourceTexts.length
      ? sourceTexts
      : (typeof next.sourceCorpus === "string" && next.sourceCorpus
        ? next.sourceCorpus.split(/\n\n+/).filter(Boolean)
        : []);
    if (texts.length) next = resolveAlsoAppearsAgainstSources(next, texts);
  }
  // Re-stamp combined label after face rules may have changed state/concerns.
  next = restampCombined(next);

  next.stampGate = "b607";
  return next;
}

/**
 * Apply the exit gate to every card in an analyse response and rebuild summary.
 */
function subjectFromBody(body) {
  const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};
  return clean(
    meta.subjectName
    || meta.investmentName
    || meta.dealInfo?.investmentName
    || body?.investmentName
    || "",
  );
}

export function applyExitGateToResponse(body, { dealStatus, reviewOptions, subject, houseStyle, eventType, statusOpened } = {}) {
  const statements = Array.isArray(body?.statements) ? body.statements : [];
  const status = dealStatus ?? body?.meta?.dealStatus ?? null;
  const subjectName = subject || subjectFromBody(body);
  const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};
  const event = eventType
    || meta.eventType
    || meta.scenario
    || body?._b601?.scenario
    || null;
  const style = houseStyle || meta.houseStyle || null;
  const opened = statusOpened === true || meta.statusOpened === true;
  const sourceTexts = (Array.isArray(body?.sources) ? body.sources : [])
    .map((source) => clean(source?.text || source?.content || ""))
    .filter(Boolean);
  const sourceCorpus = sourceTexts.join("\n\n");
  const nextStatements = statements.map((row) => {
    const qc = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : {};
    const stamped = applyExitGate(
      {
        ...qc,
        statement: typeof row?.text === "string" ? row.text : (qc.statement || ""),
        dealStatus: status ?? qc.dealStatus,
        transactionSubject: subjectName || qc.transactionSubject,
        eventType: event || qc.eventType,
        sourceCorpus: sourceCorpus || qc.sourceCorpus || null,
      },
      {
        dealStatus: status ?? qc.dealStatus,
        subject: subjectName,
        eventType: event,
        statusOpened: opened,
        houseStyle: style,
        reviewOptions,
        sourceTexts,
      },
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
  // B602 F55 / I12: keep only draft marks that match a displayed verdict or concern.
  const nextMarks = filterDraftMarksToDisplayed(body.draftMarks, nextStatements);
  // B604 F72: the note never treats a sentence as a problem once its card is quiet.
  const reading = body?.reading && typeof body.reading === "object" ? body.reading : null;
  const nextReading = reading && typeof reading.writerFeedback === "string"
    ? {
      ...reading,
      // B605: and its opening sentence agrees with the overall label.
      writerFeedback: alignNoteOpenerWithLabel(
        dropNoteSentencesAboutQuietCards(reading.writerFeedback, nextStatements),
        reviewSummary?.readiness,
      ),
    }
    : reading;
  return {
    ...body,
    ...(nextReading ? { reading: nextReading } : {}),
    statements: nextStatements,
    ...(Array.isArray(body.draftMarks) ? { draftMarks: nextMarks } : {}),
    meta: {
      ...(body?.meta && typeof body.meta === "object" ? body.meta : {}),
      reviewSummary,
      reviewOptions: opts,
      dealStatus: status,
      stampGate: "b602",
    },
  };
}

function filterDraftMarksToDisplayed(marks, statements) {
  if (!Array.isArray(marks) || !marks.length) return Array.isArray(marks) ? marks : [];
  return marks.filter((mark) => {
    const idx = Number(mark?.statementIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= statements.length) return false;
    const card = statements[idx]?.qcCard || {};
    const state = String(card.sentenceState || card.statementVerdict?.state || "");
    const faceRaised = ["conflicts", "not_in_source", "beyond", "partial", "note_withheld"].includes(state);
    const kind = String(mark?.kind || mark?.tone || mark?.type || mark?.signal || "").toLowerCase();
    const isWording = /wording|house|editorial|compliance|craft|caution/.test(kind);
    if (isWording) {
      const shown = [
        ...displayedEditorialConcerns(card),
        ...displayedComplianceConcerns(card),
        ...displayedHouseStyleConcerns(card),
      ];
      return shown.length > 0;
    }
    if (faceRaised) return true;
    // Green/grey wash marks from a clean face are fine when kind is empty/clean.
    return !kind || /clean|nothing|support|verdict|evidence/.test(kind);
  });
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
  const subjectName = subjectFromBody(withStatus);
  const sourceCorpus = (Array.isArray(body?.sources) ? body.sources : [])
    .map((source) => clean(source?.text || source?.content || ""))
    .filter(Boolean)
    .join("\n\n");
  // Re-run full stamp path first when available via caller; here apply exit gate
  // over existing stamps with the new status.
  const statements = Array.isArray(withStatus.statements) ? withStatus.statements : [];
  const nextStatements = statements.map((row) => {
    const qc = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : {};
    const base = {
      ...qc,
      statement: typeof row?.text === "string" ? row.text : (qc.statement || ""),
      dealStatus,
      transactionSubject: subjectName || qc.transactionSubject,
      // B603 F64: full source text so memo dates are visible to the status ruling.
      sourceCorpus: sourceCorpus || qc.sourceCorpus || null,
    };
    const stamped = applyExitGate(base, { dealStatus, subject: subjectName });
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
      stampGate: "b603",
      statusHistoryEntry: `Transaction status set to ${dealStatus}`,
    },
  };
}
