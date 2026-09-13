/**
 * Cross-document disagreement: two sources state different figures for the
 * same quantity, or one would overwrite a figure another source confirms.
 * Detection only. Rulings arrive on the request. Pure. No model client.
 */
import {
  SUPPORTING_CLASS,
  annotateTokens,
  citationRanges,
  compatibleTokens,
  pairingSourceRefId,
  passageAssertsDraftValue,
  sameQuantity,
  supportSpansOf,
  tokenInCitation,
  tokenizeQuantities,
} from "./conflict-engagement.mjs";

/** Same fallback the card uses when a fingerprint has no sourceLabel. */
export function unnamedSourceLabel(sourceIndex) {
  const index = Number(sourceIndex);
  const n = Number.isInteger(index) && index >= 0 ? index : 0;
  return `Source ${n + 1}`;
}

export function labelForSource(finding, sourceIndex) {
  const index = Number(sourceIndex);
  const fingerprints = finding?.card?.stage2SourceFingerprints;
  if (Array.isArray(fingerprints)) {
    const hit = fingerprints.find((row) => Number(row?.sourceIndex) === index);
    const label = typeof hit?.sourceLabel === "string" ? hit.sourceLabel.trim() : "";
    if (label) return label;
  }
  return unnamedSourceLabel(index);
}

export function normalizeSourceRulings(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const a = Number(row.a);
    const b = Number(row.b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) continue;
    if (a >= b) continue;
    let governs = row.governs;
    if (governs === undefined) continue;
    if (governs === null) {
      out.push({ a, b, governs: null });
      continue;
    }
    governs = Number(governs);
    if (!Number.isInteger(governs) || (governs !== a && governs !== b)) continue;
    out.push({ a, b, governs });
  }
  return out;
}

export function rulingForPair(rulings, sourceIdA, sourceIdB) {
  const a = Number(sourceIdA);
  const b = Number(sourceIdB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return undefined;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const list = Array.isArray(rulings) ? rulings : [];
  return list.find((row) => row.a === lo && row.b === hi);
}

function assertedTokens(passage) {
  const text = typeof passage === "string" ? passage : "";
  if (!text.trim()) return [];
  const cited = citationRanges(text);
  return annotateTokens(text).filter((token) => !tokenInCitation(token, cited));
}

function firstCompatibleToken(anchor, passage) {
  if (!anchor || typeof passage !== "string") return null;
  for (const token of assertedTokens(passage)) {
    if (compatibleTokens(anchor, token, passage)) return token;
  }
  return null;
}

function firstSameQuantityToken(anchor, passage) {
  if (!anchor || typeof passage !== "string") return null;
  const cited = citationRanges(passage);
  for (const token of tokenizeQuantities(passage)) {
    if (tokenInCitation(token, cited)) continue;
    if (sameQuantity(token, anchor)) return token;
  }
  return null;
}

function pairingPassages(finding, pairingSourceId, excerpt) {
  const out = [];
  for (const span of supportSpansOf(finding)) {
    if (span.sourceRefId == null || Number(span.sourceRefId) !== Number(pairingSourceId)) continue;
    if (typeof span.passage === "string" && span.passage.trim()) out.push(span.passage);
  }
  if (typeof excerpt === "string" && excerpt.trim() && !out.includes(excerpt)) out.push(excerpt);
  return out;
}

function pairingAssertsDraft(finding, pairingSourceId, draftToken, excerpt) {
  return pairingPassages(finding, pairingSourceId, excerpt).some((passage) =>
    passageAssertsDraftValue(passage, draftToken)
  );
}

function sameKindDifferentValueToken(anchor, passage) {
  if (!anchor || typeof passage !== "string") return null;
  for (const token of assertedTokens(passage)) {
    if (token.kind !== anchor.kind || token.value === anchor.value) continue;
    if (anchor.kind === "money") {
      if (anchor.scale !== token.scale) continue;
      if (Boolean(anchor.currency) !== Boolean(token.currency)) continue;
    }
    return token;
  }
  return null;
}

function pairingContradiction(finding, pairingSourceId, draftToken, pair, excerpt) {
  if (pair?.to && !sameQuantity(pair.from, pair.to)) {
    return { token: pair.to, raw: pair.to.raw, passage: excerpt };
  }
  for (const passage of pairingPassages(finding, pairingSourceId, excerpt)) {
    const token = firstCompatibleToken(draftToken, passage);
    if (token) return { token, raw: token.raw, passage };
  }
  return null;
}

function pairingFigureForCopy(finding, pairingSourceId, draftToken, pair, excerpt) {
  const identified = pairingContradiction(finding, pairingSourceId, draftToken, pair, excerpt);
  if (identified) return identified;
  for (const span of supportSpansOf(finding)) {
    if (Number(span.sourceRefId) !== Number(pairingSourceId)) continue;
    if (span.classification !== "conflicting") continue;
    if (typeof span.passage !== "string") continue;
    const token = sameKindDifferentValueToken(draftToken, span.passage);
    if (token) return { token, raw: token.raw, passage: span.passage };
  }
  if (typeof excerpt === "string") {
    const token = sameKindDifferentValueToken(draftToken, excerpt);
    if (token) return { token, raw: token.raw, passage: excerpt };
  }
  return null;
}

function buildDisagreement({
  pairingSourceId,
  otherSourceId,
  pairingFigureRaw,
  otherFigureRaw,
  otherToken,
  otherPassage,
  draftToken,
}) {
  const otherMatchesDraft = Boolean(
    (otherToken && sameQuantity(otherToken, draftToken)) ||
      (otherPassage && passageAssertsDraftValue(otherPassage, draftToken))
  );
  return {
    pairingSourceId,
    otherSourceId,
    pairingFigureRaw,
    otherFigureRaw,
    otherToken,
    otherPassage,
    otherMatchesDraft,
  };
}

/**
 * Positive evidence only. Absence of a second voice is not a disagreement.
 * Case (a) does not require name-identity on the pairing figure: another source
 * confirming the draft while the pairing source does not is the disagreement.
 * Case (b) still requires the locator's same-quantity identity rules.
 * @returns {object | null}
 */
export function detectSourceDisagreement({ finding, pairingSourceId, statement, pair, excerpt } = {}) {
  void statement;
  if (pairingSourceId == null || !pair?.from) return null;
  const otherSpans = supportSpansOf(finding).filter(
    (span) => span.sourceRefId != null && Number(span.sourceRefId) !== Number(pairingSourceId)
  );
  if (otherSpans.length === 0) return null;

  const pairingConfirmsDraft = pairingAssertsDraft(finding, pairingSourceId, pair.from, excerpt);
  if (!pairingConfirmsDraft) {
    for (const span of otherSpans) {
      if (!SUPPORTING_CLASS.has(span.classification)) continue;
      if (typeof span.passage !== "string" || !span.passage.trim()) continue;
      if (!passageAssertsDraftValue(span.passage, pair.from)) continue;
      const pairingFigure = pairingFigureForCopy(finding, pairingSourceId, pair.from, pair, excerpt);
      if (!pairingFigure) continue;
      const otherToken =
        firstSameQuantityToken(pair.from, span.passage) ||
        assertedTokens(span.passage).find((token) => sameQuantity(token, pair.from)) ||
        pair.from;
      return buildDisagreement({
        pairingSourceId,
        otherSourceId: span.sourceRefId,
        pairingFigureRaw: pairingFigure.raw,
        otherFigureRaw: otherToken.raw,
        otherToken,
        otherPassage: span.passage,
        draftToken: pair.from,
      });
    }
  }

  const contradiction = pairingContradiction(finding, pairingSourceId, pair.from, pair, excerpt);
  const pairingAnchor = contradiction?.token || pair.to;
  if (!pairingAnchor) return null;
  for (const span of otherSpans) {
    if (typeof span.passage !== "string" || !span.passage.trim()) continue;
    const otherToken = firstCompatibleToken(pairingAnchor, span.passage);
    if (!otherToken) continue;
    return buildDisagreement({
      pairingSourceId,
      otherSourceId: span.sourceRefId,
      pairingFigureRaw: contradiction?.raw || pairingAnchor.raw,
      otherFigureRaw: otherToken.raw,
      otherToken,
      otherPassage: span.passage,
      draftToken: pair.from,
    });
  }
  return null;
}

export function detectDisagreementOnFinding(finding, excerpt, pairs) {
  const pairingSourceId = pairingSourceRefId(finding, excerpt);
  if (pairingSourceId == null) return null;
  const list = Array.isArray(pairs) && pairs.length > 0 ? pairs : annotateTokens(String(finding?.statement ?? "")).map((from) => ({ from, to: null }));
  for (const pair of list) {
    const hit = detectSourceDisagreement({
      finding,
      pairingSourceId,
      statement: finding?.statement,
      pair,
      excerpt,
    });
    if (hit) return hit;
  }
  return null;
}

export function disagreementCopyValues(finding, disagreement, governsSourceId) {
  if (!disagreement) return {};
  const a = Math.min(Number(disagreement.pairingSourceId), Number(disagreement.otherSourceId));
  const b = Math.max(Number(disagreement.pairingSourceId), Number(disagreement.otherSourceId));
  const figA =
    a === Number(disagreement.pairingSourceId) ? disagreement.pairingFigureRaw : disagreement.otherFigureRaw;
  const figB =
    b === Number(disagreement.pairingSourceId) ? disagreement.pairingFigureRaw : disagreement.otherFigureRaw;
  const values = {
    docA: labelForSource(finding, a),
    figA,
    docB: labelForSource(finding, b),
    figB,
  };
  if (governsSourceId != null && Number.isInteger(Number(governsSourceId))) {
    const gov = Number(governsSourceId);
    const other = gov === Number(disagreement.pairingSourceId)
      ? Number(disagreement.otherSourceId)
      : Number(disagreement.pairingSourceId);
    const govFig =
      gov === Number(disagreement.pairingSourceId) ? disagreement.pairingFigureRaw : disagreement.otherFigureRaw;
    const otherFig =
      other === Number(disagreement.pairingSourceId) ? disagreement.pairingFigureRaw : disagreement.otherFigureRaw;
    values.docGov = labelForSource(finding, gov);
    values.fig = govFig;
    values.docOther = labelForSource(finding, other);
    values.figOther = otherFig;
  }
  return values;
}

export function governancePairFrom(finding, disagreement, governs) {
  if (!disagreement) return undefined;
  const a = Math.min(Number(disagreement.pairingSourceId), Number(disagreement.otherSourceId));
  const b = Math.max(Number(disagreement.pairingSourceId), Number(disagreement.otherSourceId));
  const pair = {
    a,
    b,
    labelA: labelForSource(finding, a),
    labelB: labelForSource(finding, b),
    pairingSourceId: disagreement.pairingSourceId,
    otherSourceId: disagreement.otherSourceId,
  };
  if (arguments.length >= 3) pair.governs = governs == null ? null : Number(governs);
  return pair;
}
