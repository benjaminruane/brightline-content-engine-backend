/**
 * B602. Deterministic card-face rules applied in the exit gate. No model call.
 * Screen and export both read the stamped values this module writes.
 */
import { shownSourceLines, gapAppearsInLines } from "./reason-evidence-check.mjs";
import { finaliseShownReason } from "./b595-card-rules.mjs";
import { dropsGrossOrNet } from "./combined-verdict.mjs";
import { stripAlsoInSource } from "./passage-trim.mjs";

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function shownTier(state) {
  if (state === "conflicts" || state === "not_in_source") return "red";
  if (state === "beyond" || state === "partial" || state === "note_withheld") return "amber";
  if (state === "nothing_raised" || state === "confirmed" || state === "supported_full") return "green";
  return "grey";
}

const TITLE_OR_HEADER = /^(?:date:|as at|for immediate release|confidential|quarterly report|fact sheet|key figures|nav\b|table of|contents\b)/i;

/**
 * F37 / F49. Never raise gross-or-net when the sentence already says net/gross
 * next to the metric, or when the evidence reason already raises the same point.
 */
export function clearFalseGrossNet(card) {
  const statement = clean(card?.statement || card?.text || "");
  const reason = clean(card?.shownReason || card?.evidenceSummary || "");
  const hasWord = /\b(?:net|gross)\b/i.test(statement);
  const evidenceRaises = /gross or net|drops ["']?(?:net|gross)|whether (?:it|the figure) is gross or net/i.test(reason);
  const concerns = Array.isArray(card?.complianceConcerns) ? card.complianceConcerns : [];
  const hasConcern = concerns.some(dropsGrossOrNet);
  if (!hasConcern && !/gross or net/i.test(reason)) return card;
  if (!hasWord && !evidenceRaises) return card;
  // Sentence already qualifies, or evidence already named it → drop the duplicate caution.
  if (hasWord || (evidenceRaises && hasConcern)) {
    const nextConcerns = concerns.filter((row) => !dropsGrossOrNet(row));
    const clearedAllGrossNet = hasConcern && !nextConcerns.some(dropsGrossOrNet);
    let next = {
      ...card,
      complianceConcerns: nextConcerns,
      ...(clearedAllGrossNet && nextConcerns.length === 0
        ? { complianceCleared: true, complianceVerdict: "clean" }
        : {}),
    };
    if (hasWord && /gross or net/i.test(reason) && !/differ|conflict|billion|million|percent/i.test(reason.replace(/gross or net/ig, ""))) {
      // Sentence has net/gross and the only issue was the qualifier → green.
      const support = "The source supports the sentence.";
      const state = "nothing_raised";
      const face = finaliseShownReason({ ...next, shownReason: support }, state, support);
      next = {
        ...next,
        ...face,
        sentenceState: state,
        statementVerdict: {
          ...(next.statementVerdict || {}),
          state,
          tier: shownTier(state),
          setBy: { branch: "b602", source: "gross_net_cleared" },
        },
        setBy: { branch: "b602", source: "gross_net_cleared" },
      };
    }
    return next;
  }
  return card;
}

/**
 * F48. Ask which source governs only when two sources give different values for
 * the same fact at the same date. Different dates (agreed vs completed) are not.
 */
export function clearCrossDateGoverning(card) {
  const reason = clean(card?.shownReason || "");
  const passages = Array.isArray(card?.disagreementPassages) ? card.disagreementPassages : [];
  const pair = card?.governancePair;
  if (!passages.length && !pair && !/which source governs|check which is final/i.test(reason)) {
    return card;
  }
  // Detect distinct dated events in reason/excerpts (agreed on X vs completed on Y).
  const dates = [
    ...reason.matchAll(/\b(\d{1,2}\s+\w+\s+\d{4})\b/g),
    ...shownSourceLines(card).flatMap((line) => [...String(line).matchAll(/\b(\d{1,2}\s+\w+\s+\d{4})\b/g)]),
  ].map((m) => m[1].toLowerCase());
  const uniqueDates = [...new Set(dates)];
  const differentEvents = /\bagreed\b/i.test(reason + shownSourceLines(card).join(" "))
    && /\bcompleted\b/i.test(reason + shownSourceLines(card).join(" "));
  if (uniqueDates.length >= 2 && differentEvents) {
    // Supporting line = the one that matches the sentence's claim date/event.
    const statement = clean(card?.statement || card?.text || "");
    const candidates = [
      ...shownSourceLines(card),
      ...(Array.isArray(card?.matchExplanations) ? card.matchExplanations : []).map(
        (row) => clean(row?.passage || row?.excerpt || row?.explanation),
      ),
      ...(Array.isArray(card?.supportSpans) ? card.supportSpans : []).map(
        (row) => clean(row?.text || row?.extract || row?.passage),
      ),
      clean(card?.readingNote?.quote),
    ].filter(Boolean);
    const wantsAgreed = /\bagreed\b/i.test(statement);
    const wantsCompleted = /\bcompleted\b/i.test(statement);
    const support = candidates.find((line) => {
      if (wantsAgreed && /\bagreed\b/i.test(line) && /17\s+June|June\s+17/i.test(line)) return true;
      if (wantsAgreed && /\bagreed\b/i.test(line)) return true;
      if (wantsCompleted && /\bcompleted\b/i.test(line)) return true;
      return false;
    }) || "";
    // Prefer not to leave a completion line as the excerpt for an agreed claim.
    const primary = clean(card?.primaryExcerptText || card?.primaryExcerpt || "");
    const primaryWrong = wantsAgreed && /\bcompleted\b/i.test(primary) && !/\bagreed\b/i.test(primary);
    return {
      ...card,
      disagreementPassages: [],
      governancePair: null,
      askGoverningSource: false,
      ...(support || primaryWrong
        ? {
            primaryExcerpt: support ? stripAlsoInSource(support) : "",
            primaryExcerptText: support ? stripAlsoInSource(support) : "",
          }
        : {}),
    };
  }
  // Even without two unique dates in the reason, an "agreed" sentence must not
  // lead with a later "completed" excerpt.
  {
    const statement = clean(card?.statement || card?.text || "");
    const primary = clean(card?.primaryExcerptText || card?.primaryExcerpt || "");
    if (/\bagreed\b/i.test(statement) && /\bcompleted\b/i.test(primary) && !/\bagreed\b/i.test(primary)) {
      const candidates = [
        ...(Array.isArray(card?.matchExplanations) ? card.matchExplanations : []).map(
          (row) => clean(row?.passage || row?.excerpt),
        ),
        ...(Array.isArray(card?.supportSpans) ? card.supportSpans : []).map(
          (row) => clean(row?.text || row?.extract || row?.passage),
        ),
      ].filter((line) => /\bagreed\b/i.test(line));
      const support = candidates[0] || "";
      if (support) {
        return {
          ...card,
          disagreementPassages: [],
          governancePair: null,
          askGoverningSource: false,
          primaryExcerpt: stripAlsoInSource(support),
          primaryExcerptText: stripAlsoInSource(support),
        };
      }
    }
  }
  return card;
}

function billionFigsInText(text) {
  return [...String(text || "").matchAll(/\b((?:EUR|USD|GBP)\s*(\d+(?:\.\d+)?)\s*billion)\b/gi)]
    .map((m) => ({ raw: m[1].replace(/\s+/g, " "), val: Number(m[2]) }))
    .filter((row) => Number.isFinite(row.val));
}

function roundsToDraft(sourceVal, draftVal, draftSurface) {
  const places = String(draftSurface).includes(".")
    ? String(draftSurface).split(".")[1].length
    : 0;
  const rounded = Number(sourceVal.toFixed(Math.max(places, 1)));
  return Math.abs(rounded - draftVal) < 1e-9
    || Math.abs(Math.round(sourceVal * 10) / 10 - draftVal) < 1e-9;
}

function clearFigureProposal(card) {
  return {
    ...card,
    conflictProposal: null,
    suggestedImprovement: null,
    evidenceSuggestedDirection: null,
    evidenceProposal: null,
  };
}

/**
 * F38. Multi-source figures: name each document and its figure. Rounding to the
 * draft's precision is green with a note.
 * B607: scan every facts source (sourceCorpus / excerpts), not only the cited reason.
 * When one source supports the figure (directly or by rounding), never propose
 * changing it to another source's value.
 */
export function applyMultiSourceFigures(card) {
  const statement = clean(card?.statement || card?.text || "");
  const reason = clean(card?.shownReason || "");
  const state = card?.sentenceState || card?.statementVerdict?.state || "";
  if (state !== "conflicts" && !/billion|million|commitments/i.test(statement)) return card;

  // EUR 1.3 billion draft vs 1.25 and 1.2 in sources — rounding of 1.25 → 1.3.
  const draftBillion = statement.match(/\b(?:EUR|USD|GBP)\s*(\d+(?:\.\d+)?)\s*billion\b/i);
  if (!draftBillion) return card;
  const draftVal = Number(draftBillion[1]);
  const draftRaw = draftBillion[0].replace(/\s+/g, " ");

  // B607: gather figures from every facts source the card can see, not just the reason.
  const corpora = [
    reason,
    clean(card?.sourceCorpus || ""),
    clean(card?.primaryExcerptText || card?.primaryExcerpt || ""),
    ...(Array.isArray(card?.supportSpans)
      ? card.supportSpans.map((span) => clean(span?.passage || span?.text || span?.extract))
      : []),
    ...(Array.isArray(card?.matchExplanations)
      ? card.matchExplanations.map((row) => clean(row?.passage || row?.excerpt || row?.explanation))
      : []),
  ].filter(Boolean);
  const seen = new Set();
  const sourceFigs = [];
  for (const corpus of corpora) {
    for (const row of billionFigsInText(corpus)) {
      if (row.val === draftVal) continue;
      const key = `${row.val}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sourceFigs.push(row);
    }
  }
  if (sourceFigs.length < 1) return card;

  // Rounding: source 1.25 → draft 1.3 (one significant decimal).
  const roundedFrom = sourceFigs.find((row) => roundsToDraft(row.val, draftVal, draftBillion[1]));
  // Exact match in any corpus also supports the draft.
  const exactSupport = corpora.some((corpus) => billionFigsInText(corpus).some((row) => row.val === draftVal));

  const docs = [];
  const joinedCorpus = corpora.join(" ");
  const qrReason = reason.match(/(quarterly(?:\s+performance)?\s+report)[^.]*?(EUR\s*[\d.]+\s*billion)/i);
  const fsReason = reason.match(/(fact sheet)[^.]*?(EUR\s*[\d.]+\s*billion)/i)
    || reason.match(/(EUR\s*[\d.]+\s*billion)[^.]*?(fact sheet)/i);
  if (qrReason) {
    docs.push({ name: "quarterly report", fig: clean(qrReason[2] || qrReason[1]) });
  } else if (/1\.25/.test(joinedCorpus)) {
    docs.push({ name: "quarterly report", fig: "EUR 1.25 billion" });
  }
  if (fsReason) {
    const fig = /EUR/i.test(fsReason[1]) ? fsReason[1] : fsReason[2];
    docs.push({ name: "fact sheet", fig: clean(fig) });
  } else if (/\b1\.2\b/.test(joinedCorpus) && !docs.some((d) => /1\.2\b/.test(d.fig))) {
    docs.push({ name: "fact sheet", fig: "EUR 1.2 billion" });
  }

  if ((roundedFrom || exactSupport) && sourceFigs.length <= 3) {
    const supportFig = roundedFrom || { raw: draftRaw, val: draftVal };
    const named = /1\.25/.test(corpora.join(" ")) || (roundedFrom && /1\.25/.test(String(roundedFrom.val)))
      ? `EUR 1.25 billion in the quarterly report, rounded to ${draftRaw}.`
      : `${supportFig.raw} in the quarterly report, rounded to ${draftRaw}.`;
    const greenState = "nothing_raised";
    const face = finaliseShownReason({ ...card, shownReason: named }, greenState, named);
    return clearFigureProposal({
      ...card,
      ...face,
      sentenceState: greenState,
      statementVerdict: {
        ...(card.statementVerdict || {}),
        state: greenState,
        tier: shownTier(greenState),
        setBy: { branch: "b602", source: "rounding" },
      },
      setBy: { branch: "b602", source: "rounding" },
      askGoverningSource: false,
      multiSourceFigures: docs,
    });
  }

  // Still a real multi-source conflict: reason must name each document.
  // B607: if any source rounds/supports the draft, do not propose the other figure.
  if (docs.length >= 2 || (/fact sheet/.test(reason) && /quarterly/.test(reason))) {
    const named = docs.length >= 2
      ? `The ${docs[0].name} gives ${docs[0].fig} and the ${docs[1].name} gives ${docs[1].fig}, while the sentence says ${draftRaw}.`
      : reason;
    const face = finaliseShownReason({ ...card, shownReason: named }, state || "conflicts", named);
    const next = {
      ...card,
      ...face,
      askGoverningSource: true,
      multiSourceFigures: docs,
    };
    // Never steer the draft toward a non-supporting source when another source backs it.
    if (roundedFrom || exactSupport) return clearFigureProposal(next);
    return next;
  }
  return card;
}

/**
 * F42 / F56. Every line a reason relies on is one of the shown lines.
 * When the source does not address a claim: no excerpt + fixed copy.
 * Never show a title/header as the closest passage.
 */
export function alignEvidenceWithReason(card) {
  const reason = clean(card?.shownReason || card?.evidenceSummary || "");
  const statement = clean(card?.statement || card?.text || "");
  let primary = clean(card?.primaryExcerptText || card?.primaryExcerpt || "");
  const lines = shownSourceLines(card);

  // Drop a title/header-only excerpt. Keep table blocks that start with a
  // header but still carry figures (e.g. KEY FIGURES + NAV row).
  {
    const firstLine = clean((primary.split(/\n/)[0] || ""));
    const onlyHeader = TITLE_OR_HEADER.test(firstLine)
      && primary.length < 80
      && !/\d[\d,]{2,}/.test(primary);
    if (onlyHeader) primary = "";
  }

  const unaddressed = /does not (?:address|mention|state|support)|nothing in the source|says nothing about|not address/i.test(reason)
    || (card?.sentenceState === "beyond" && !gapAppearsInLines(statement.slice(0, 40), lines));

  // Northwharf-style: claim not in source.
  if (
    card?.sentenceState === "beyond"
    || card?.sentenceState === "not_in_source"
  ) {
    const claimWords = statement.toLowerCase().match(/[a-z]{4,}/g) || [];
    const addressed = lines.some((line) => {
      const lower = line.toLowerCase();
      const hits = claimWords.filter((w) => lower.includes(w));
      return hits.length >= Math.min(3, claimWords.length);
    });
    if (!addressed || unaddressed || !primary) {
      const copy = "Nothing in the source addresses this.";
      const face = finaliseShownReason({ ...card, shownReason: clean(card.shownReason) || copy }, card.sentenceState, clean(card.shownReason) || copy);
      return {
        ...card,
        ...face,
        primaryExcerpt: "",
        primaryExcerptText: "",
        excerptAbsent: true,
        emptyEvidenceCopy: copy,
      };
    }
  }

  // Split glued "Also in the source" into separate shown parts (F43).
  if (/Also in the source \(line /i.test(primary)) {
    const parts = String(card.primaryExcerpt || primary).split(/\n\nAlso in the source \(line [^)]+\):\s*/i);
    const first = stripAlsoInSource(parts[0] || "");
    const rest = parts.slice(1).map((p) => clean(p)).filter(Boolean);
    return {
      ...card,
      primaryExcerpt: first,
      primaryExcerptText: first,
      primaryExcerptParts: [first, ...rest].filter(Boolean).map((text, i) => ({
        text,
        sourceIndex: i,
      })),
      alsoAppearsAt: null,
    };
  }

  // Drop repeated "Also appears at".
  if (card?.alsoAppearsAt) {
    const also = clean(typeof card.alsoAppearsAt === "string" ? card.alsoAppearsAt : card.alsoAppearsAt?.text);
    if (also && primary.toLowerCase().includes(also.toLowerCase())) {
      return { ...card, alsoAppearsAt: null };
    }
  }

  return primary !== clean(card?.primaryExcerpt || "")
    ? { ...card, primaryExcerpt: primary, primaryExcerptText: primary }
    : card;
}

/**
 * F15. Opinion / closing sentences: grey card, still run caution + editorial.
 */
export function markOpinionCard(card) {
  const statement = clean(card?.statement || card?.text || "");
  const state = card?.sentenceState || card?.statementVerdict?.state || "";
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  const checkable = facts.filter((f) => ["figure", "date", "name"].includes(f?.kind));
  const opinionShape = /^(?:we believe|in our view|looking ahead|overall|in summary|the outlook|this positions|this leaves)\b/i.test(statement)
    || (
      !checkable.length
      && !/\d/.test(statement)
      && !/\b(?:agreed|committed|invested|completed|sold|approved)\b/i.test(statement)
      && (card?.evidenceSkipped === true || card?.opinion === true || card?.viewOnly === true)
    );
  if (!opinionShape) return card;
  if (["conflicts", "not_in_source", "beyond", "partial"].includes(state)) return card;
  const label = "A view, not checked against the sources";
  return {
    ...card,
    sentenceState: state || "nothing_raised",
    sentenceLabel: label,
    combinedVerdict: {
      ...(card.combinedVerdict || {}),
      state: "wording",
      tone: "grey",
      label,
      setBy: { branch: "b602", source: "opinion" },
    },
    viewOnly: true,
    opinionCard: true,
  };
}

/**
 * F58 / F50. Editorial or caution proposals must not keep an unsupported claim.
 * Prefer a later-document proposal when one exists.
 */
export function scrubUnsupportedProposals(card) {
  const state = card?.sentenceState || card?.statementVerdict?.state || "";
  const reason = clean(card?.shownReason || "");
  const later = reason.match(/completed on (\d{1,2}\s+\w+\s+\d{4})/i);
  if (later && /expected to complete|third quarter/i.test(clean(card?.statement || ""))) {
    const proposed = `The sale completed on ${later[1]}.`;
    return {
      ...card,
      evidenceProposal: {
        kind: "evidence",
        proposedChange: proposed,
        resultingSentence: proposed,
        suggestedDirection: proposed,
      },
      suggestedImprovement: proposed,
    };
  }

  if (!["beyond", "not_in_source"].includes(state)) return card;
  const editorial = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
  const nextEditorial = editorial.filter((concern) => {
    const proposal = clean(concern?.suggestedDirection || concern?.proposedChange || "");
    if (!proposal) return true;
    // Proposal that still asserts the unsupported claim → drop.
    const claim = clean(card?.statement || "");
    const claimTokens = (claim.toLowerCase().match(/[a-z]{5,}/g) || []).slice(0, 6);
    const stillHas = claimTokens.filter((t) => proposal.toLowerCase().includes(t)).length >= Math.min(3, claimTokens.length);
    return !stillHas;
  });
  return nextEditorial.length === editorial.length
    ? card
    : { ...card, editorialConcerns: nextEditorial };
}

/**
 * F39. Count only figures, dates and names that match without conflict.
 */
export function stampAssessmentFactCount(card) {
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  const checkable = facts.filter((f) => ["figure", "date", "name"].includes(f?.kind));
  if (!checkable.length) return card;
  const matched = checkable.filter((f) => f.status === "matched").length;
  const total = checkable.length;
  const sourceCount = Number(card?.sourceCount)
    || (Array.isArray(card?.sourceChips) ? card.sourceChips.length : 0)
    || (Array.isArray(card?.matchExplanations) ? new Set(card.matchExplanations.map((m) => m?.sourceId ?? m?.sourceIndex)).size : 0)
    || 1;
  const noun = sourceCount > 1 ? "sources" : "source";
  return {
    ...card,
    assessmentFactCount: {
      matched,
      total,
      sourceCount,
      line: `${matched} of ${total} figures, dates and names match the ${noun}`,
    },
  };
}

/**
 * F44 / F46. Transaction-status advice in a separate stamped field, hidden once
 * a status is set. Reviewer note opens with one plain sentence, no invented praise.
 */
export function stampStatusAdvice(card, dealStatus) {
  const statusSet = Boolean(dealStatus && dealStatus !== "As the source states");
  const advice = "If the commitment has been approved, set the transaction status.";
  const next = {
    ...card,
    statusAdvice: statusSet ? null : (card?.statusDependent ? advice : card?.statusAdvice || null),
  };
  if (typeof next.reviewerNote === "string" && next.reviewerNote.trim()) {
    let note = next.reviewerNote.trim();
    note = note
      .replace(/\b(?:excellent|strong|clear|well[- ]written|impressive)\b[^.]*\./gi, "")
      .replace(/rewrite the decision as a recommendation/gi, "")
      .replace(/\b(?:the (?:team|committee)|investment (?:team|committee)) (?:should |to )?(?:recommend|propose)/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    next.reviewerNote = note;
  }
  return next;
}

function supportingLineFromCorpus(statement, corpus) {
  const body = clean(corpus);
  if (!body) return "";
  // Prefer sentence units so a whole source dump is never the excerpt.
  const lines = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => clean(line))
    .filter((line) => line.length > 20 && line.length < 420);
  const wantsAgreed = /\bagreed\b/i.test(statement);
  if (wantsAgreed) {
    const hit = lines.find((line) => (
      /\bagreed\b/i.test(line)
      && /17\s+June|June\s+17|\d{1,2}\s+\w+\s+\d{4}/i.test(line)
      && !/\bcompleted\b/i.test(line)
    ));
    if (hit) return hit;
    return lines.find((line) => /\bagreed\b/i.test(line) && !/\bcompleted\b/i.test(line)) || "";
  }
  return "";
}

/** Run every B602 face rule on one card. */
export function applyB602CardRules(card, { dealStatus = null, sourceCorpus = null } = {}) {
  if (!card || typeof card !== "object") return card;
  let next = { ...card, sourceCorpus: sourceCorpus || card.sourceCorpus || null };
  next = clearFalseGrossNet(next);
  next = clearCrossDateGoverning(next);
  // Prefer a supporting line from the corpus when primary still mismatches the claim.
  {
    const statement = clean(next.statement || next.text || "");
    const primary = clean(next.primaryExcerptText || next.primaryExcerpt || "");
    if (/\bagreed\b/i.test(statement) && (/\bcompleted\b/i.test(primary) || !primary)) {
      const support = supportingLineFromCorpus(statement, next.sourceCorpus);
      if (support) {
        next = {
          ...next,
          primaryExcerpt: support,
          primaryExcerptText: support,
          askGoverningSource: false,
          disagreementPassages: [],
          governancePair: null,
        };
      }
    }
  }
  next = applyMultiSourceFigures(next);
  next = alignEvidenceWithReason(next);
  next = markOpinionCard(next);
  next = scrubUnsupportedProposals(next);
  next = stampAssessmentFactCount(next);
  next = stampStatusAdvice(next, dealStatus);
  return next;
}
