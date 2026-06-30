/**
 * B26 / B26.1 — Constructive feedback: deterministic bundle selection + plain-text post-filter.
 */

function normVerdict(v) {
  return String(v ?? "").toLowerCase();
}

function cardFromRow(row) {
  if (row?.qcCard && typeof row.qcCard === "object") return row.qcCard;
  if (row && typeof row === "object" && ("statement" in row || "displayVerdict" in row)) return row;
  return {};
}

function statementTextFromRow(row, card) {
  const fromCard = typeof card.statement === "string" ? card.statement.trim() : "";
  if (fromCard) return fromCard;
  const fromRow = typeof row?.text === "string" ? row.text.trim() : "";
  return fromRow;
}

function cardIndexFromRow(row, card, rowIndex) {
  return typeof card.index === "number" ? card.index : rowIndex;
}

function isEvidenceSkipped(card) {
  const ss = normVerdict(card.supportState);
  const dv = normVerdict(card.displayVerdict);
  return ss === "skipped" || dv === "not reviewed";
}

function isEvidenceConfirmed(card) {
  if (isEvidenceSkipped(card)) return null;
  const ss = normVerdict(card.supportState);
  const dv = normVerdict(card.displayVerdict);
  return ss === "supported" || dv === "supported_full";
}

function isEditorialClean(card) {
  return normVerdict(card.editorialVerdict) === "clean";
}

function isComplianceClean(card) {
  return normVerdict(card.complianceVerdict) === "clean";
}

function evidenceDimensionClean(card, evidenceEnabled) {
  if (!evidenceEnabled) return true;
  const confirmed = isEvidenceConfirmed(card);
  return confirmed === true;
}

function editorialDimensionClean(card, editorialEnabled) {
  if (!editorialEnabled) return true;
  return isEditorialClean(card);
}

function complianceDimensionClean(card, complianceEnabled) {
  if (!complianceEnabled) return true;
  return isComplianceClean(card);
}

export function isCardFullyClean(card, reviewOptions = {}) {
  const evidenceEnabled = reviewOptions.evidenceEnabled !== false;
  const editorialEnabled = reviewOptions.editorialEnabled !== false;
  const complianceEnabled = reviewOptions.complianceEnabled !== false;
  return (
    evidenceDimensionClean(card, evidenceEnabled) &&
    editorialDimensionClean(card, editorialEnabled) &&
    complianceDimensionClean(card, complianceEnabled)
  );
}

function collectConcernInputs(concerns) {
  const list = Array.isArray(concerns) ? concerns : [];
  const inputs = [];
  for (const concern of list) {
    if (!concern || typeof concern !== "object") continue;
    const note = typeof concern.note === "string" ? concern.note.trim() : "";
    const suggestedDirection =
      typeof concern.suggestedDirection === "string" ? concern.suggestedDirection.trim() : "";
    if (note || suggestedDirection) {
      inputs.push({ note, suggestedDirection });
    }
  }
  return inputs;
}

function collectEvidenceInput(card) {
  const summary = typeof card.evidenceSummary === "string" ? card.evidenceSummary.trim() : "";
  const reasoning = typeof card.reasoningParagraph === "string" ? card.reasoningParagraph.trim() : "";
  if (summary && reasoning && summary !== reasoning) {
    return `${summary}\n${reasoning}`;
  }
  return summary || reasoning || "";
}

function isHardEvidenceFailure(card) {
  const dv = normVerdict(card.displayVerdict);
  const ss = normVerdict(card.supportState);
  return (
    dv === "conflict" ||
    dv === "not_supported" ||
    dv === "no_clear_support" ||
    ss === "conflicting" ||
    ss === "not_supported"
  );
}

function bundleHasContent(bundle) {
  return !!(
    bundle.evidence ||
    (Array.isArray(bundle.compliance) && bundle.compliance.length > 0) ||
    (Array.isArray(bundle.editorial) && bundle.editorial.length > 0)
  );
}

function bundleWorstRank(card, bundle) {
  if (bundle.evidence && isHardEvidenceFailure(card)) return 0;
  if (Array.isArray(bundle.compliance) && bundle.compliance.length > 0) return 1;
  return 2;
}

function toPublicBundle(bundle) {
  return {
    cardIndex: bundle.cardIndex,
    statementText: bundle.statementText,
    ...(bundle.evidence ? { evidence: bundle.evidence } : {}),
    compliance: bundle.compliance,
    editorial: bundle.editorial,
  };
}

/**
 * @param {Array} rows - statement rows or qcCards in document order
 * @param {object} reviewOptions
 * @returns {Array<{ cardIndex: number, statementText: string, evidence?: string, compliance: object[], editorial: object[] }>}
 */
export function selectConstructiveFeedbackBundles(rows, reviewOptions = {}) {
  const evidenceEnabled = reviewOptions.evidenceEnabled !== false;
  const editorialEnabled = reviewOptions.editorialEnabled !== false;
  const complianceEnabled = reviewOptions.complianceEnabled !== false;
  const list = Array.isArray(rows) ? rows : [];
  /** @type {Map<number, { cardIndex: number, statementText: string, evidence: string|null, compliance: object[], editorial: object[], _card: object }>} */
  const bundleMap = new Map();

  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const card = cardFromRow(row);
    if (isCardFullyClean(card, reviewOptions)) continue;

    const cardIndex = cardIndexFromRow(row, card, i);
    const statementText = statementTextFromRow(row, card);

    if (!bundleMap.has(cardIndex)) {
      bundleMap.set(cardIndex, {
        cardIndex,
        statementText,
        evidence: null,
        compliance: [],
        editorial: [],
        _card: card,
      });
    }
    const bundle = bundleMap.get(cardIndex);
    bundle.statementText = statementText;
    bundle._card = card;

    if (evidenceEnabled && isEvidenceConfirmed(card) === false) {
      const evidenceText = collectEvidenceInput(card);
      if (evidenceText) bundle.evidence = evidenceText;
    }

    if (complianceEnabled && !isComplianceClean(card)) {
      bundle.compliance.push(...collectConcernInputs(card.complianceConcerns));
    }

    if (editorialEnabled && !isEditorialClean(card)) {
      bundle.editorial.push(...collectConcernInputs(card.editorialConcerns));
    }
  }

  return [...bundleMap.values()]
    .filter(bundleHasContent)
    .sort((a, b) => {
      const rankDiff = bundleWorstRank(a._card, a) - bundleWorstRank(b._card, b);
      if (rankDiff !== 0) return rankDiff;
      return a.cardIndex - b.cardIndex;
    })
    .map(toPublicBundle);
}

/** @deprecated B26.1 — use selectConstructiveFeedbackBundles */
export function selectConstructiveFeedbackPoints(rows, reviewOptions = {}) {
  return selectConstructiveFeedbackBundles(rows, reviewOptions).flatMap((bundle) => {
    const points = [];
    if (bundle.evidence) {
      points.push({
        signal: "evidence",
        cardIndex: bundle.cardIndex,
        statementText: bundle.statementText,
        inputs: [{ note: bundle.evidence, suggestedDirection: "" }],
      });
    }
    if (bundle.compliance.length > 0) {
      points.push({
        signal: "compliance",
        cardIndex: bundle.cardIndex,
        statementText: bundle.statementText,
        inputs: bundle.compliance,
      });
    }
    if (bundle.editorial.length > 0) {
      points.push({
        signal: "editorial",
        cardIndex: bundle.cardIndex,
        statementText: bundle.statementText,
        inputs: bundle.editorial,
      });
    }
    return points;
  });
}

export const CLEAN_DRAFT_FEEDBACK_TEXT =
  "No changes are needed — the draft is ready for signoff.";

/**
 * Deterministic plain-text post-filter (B14 backstop — do not trust the model).
 * @param {string} raw
 * @returns {string}
 */
export function normalizeConstructiveFeedbackPlainText(raw) {
  let text = typeof raw === "string" ? raw : "";
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_\n]+)_/g, "$1");
  text = text.replace(/^[\t ]*[-*+]\s+/gm, "");
  text = text.replace(/^[\t ]*[-*_]{3,}[\t ]*$/gm, "");
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** B26.1 — shared editor register (reused verbatim by B26.2). */
export const CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER = [
  "Editor-to-writer: write as a senior editor who has genuinely read THIS draft and respects the writer's time.",
  "Warm through specificity, not encouragement. Name a strength ONLY where it is specifically true of this draft AND it sharpens or sets up a point. No free-floating or generic praise (e.g. 'strong start', 'on the right track').",
  "No praise-sandwich. Opening frames the read honestly (on a weak draft, say it needs real work — do not reassure). Close points forward; it does not console.",
  "Direct on problems; do not soften into mush. Respect over reassurance.",
  "Per point: third person on the subject, imperative on the fix.",
  "No schoolroom framing ('not permissible', 'is not acceptable'). No system language (concern level, verdict, signal, entity). Plain text only — numbered points, no markdown.",
].join("\n");

export function buildConstructiveFeedbackUserPayload({
  draftText,
  signoffVerdict,
  isReady,
  feedbackBundles,
}) {
  return {
    instructions: [
      "Write constructive feedback for the draft author.",
      CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER,
      "Write exactly ONE numbered point per statement bundle in feedbackBundles — weave that statement's evidence, compliance, and editorial concerns into a single editor's observation. Do NOT split a bundle into multiple points.",
      "Use statementText in each bundle as the display label for which draft sentence you are discussing.",
      "Do not include any revised or rewritten draft text under any circumstance.",
      `Overall readiness: ${signoffVerdict}.`,
      "Output structure: a short opening line that frames the read honestly, then numbered points (one per bundle, in the order given, worst-first), then a short closing line that points forward without consoling.",
      isReady
        ? "If the draft is largely ready, say so in the opening — but still address each bundle specifically."
        : "Match the opening tone to the readiness level — do not reassure on a weak draft.",
    ],
    draftText,
    signoffVerdict,
    isReady,
    feedbackBundles,
  };
}

export const CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT = [
  "You are a senior investment content editor writing feedback for the author of a draft.",
  CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER,
  "Return plain text only: a short opening line, numbered points (one per statement bundle), and a short closing line. No markdown.",
  "Each numbered point covers one statement bundle only — rationale and direction, never rewritten sentence text.",
  "Do not use system or technical vocabulary (concern level, verdict, signal, entity, canonical claim).",
].join("\n\n");
