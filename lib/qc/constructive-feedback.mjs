/**
 * B26 — Constructive feedback: deterministic point selection + plain-text post-filter.
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

/**
 * @param {Array} rows - statement rows or qcCards in document order
 * @param {object} reviewOptions
 * @returns {Array<{ signal: string, statementText: string, cardIndex: number, inputs: object[] }>}
 */
export function selectConstructiveFeedbackPoints(rows, reviewOptions = {}) {
  const evidenceEnabled = reviewOptions.evidenceEnabled !== false;
  const editorialEnabled = reviewOptions.editorialEnabled !== false;
  const complianceEnabled = reviewOptions.complianceEnabled !== false;
  const list = Array.isArray(rows) ? rows : [];
  const evidencePoints = [];
  const compliancePoints = [];
  const editorialPoints = [];

  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const card = cardFromRow(row);
    if (isCardFullyClean(card, reviewOptions)) continue;

    const statementText = statementTextFromRow(row, card);
    const cardIndex = typeof card.index === "number" ? card.index : i;

    if (evidenceEnabled && isEvidenceConfirmed(card) === false) {
      const evidenceText = collectEvidenceInput(card);
      if (evidenceText) {
        evidencePoints.push({
          signal: "evidence",
          statementText,
          cardIndex,
          inputs: [{ note: evidenceText, suggestedDirection: "" }],
        });
      }
    }

    if (complianceEnabled && !isComplianceClean(card)) {
      const inputs = collectConcernInputs(card.complianceConcerns);
      if (inputs.length > 0) {
        compliancePoints.push({
          signal: "compliance",
          statementText,
          cardIndex,
          inputs,
        });
      }
    }

    if (editorialEnabled && !isEditorialClean(card)) {
      const inputs = collectConcernInputs(card.editorialConcerns);
      if (inputs.length > 0) {
        editorialPoints.push({
          signal: "editorial",
          statementText,
          cardIndex,
          inputs,
        });
      }
    }
  }

  return [...evidencePoints, ...compliancePoints, ...editorialPoints];
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
  // Strip fenced code blocks
  text = text.replace(/```[\s\S]*?```/g, "");
  // Headers
  text = text.replace(/^#{1,6}\s+/gm, "");
  // Bold / italic
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_\n]+)_/g, "$1");
  // Bullet markers
  text = text.replace(/^[\t ]*[-*+]\s+/gm, "");
  // Horizontal rules
  text = text.replace(/^[\t ]*[-*_]{3,}[\t ]*$/gm, "");
  // Trailing spaces per line
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export function buildConstructiveFeedbackUserPayload({
  draftText,
  signoffVerdict,
  isReady,
  feedbackPoints,
}) {
  return {
    instructions: [
      "Write constructive feedback addressed to the draft author for each feedback point.",
      "Use third person on the subject and imperative on the fix (e.g. 'The claim about X isn't fully supported — consider softening it or citing Y.'). Do not use second person ('You claimed').",
      "Explain what the issue is and what to do about it. Be specific, direct, professional, and constructive.",
      "Do not use system language (concern level, verdict, signal, entity). No generic filler. No schoolroom framing ('not permissible', 'is not acceptable').",
      "Do not include any revised or rewritten draft text under any circumstance.",
      "Output plain prose only: numbered points (1., 2., …) and line breaks. No markdown — no bold, bullets, or headers.",
      `Overall readiness: ${signoffVerdict}. ${isReady ? "Open with a brief line that the draft is ready apart from any minor points listed, or that no changes are needed." : "Open with a brief overall framing that matches this readiness level."}`,
      "After the opening line, list one numbered point per feedback input, in the order given.",
    ],
    draftText,
    signoffVerdict,
    isReady,
    feedbackPoints,
  };
}

export const CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT = [
  "You are a senior investment content editor writing feedback for the author of a draft.",
  "Return plain text only: a short opening line plus numbered points. No markdown.",
  "Each point gives rationale only — what the issue is and what to do about it. Never supply rewritten sentence text.",
  "Voice: third person on the subject, imperative on the fix. Direct, professional, constructive — as an experienced reviewer would write in an email.",
  "Do not use system or technical vocabulary (concern level, verdict, signal, entity, canonical claim).",
].join("\n\n");
