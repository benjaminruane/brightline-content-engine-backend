// lib/qc/qc-api-schema.mjs
// A6.1: Strict QC API response contract — validate before returning.

export const QC_API_SCHEMA_VIOLATION = "QC_API_SCHEMA_VIOLATION";

const REQUIRED_QCCARD_FIELDS = [
  "statement",
  "supportState",
  "supportRefIds",
  "supportRefTitles",
  "primaryRefId",
  "primaryExcerpt",
  "supportingReferenceIds",
  "supportingReferenceTitles",
];

/**
 * Validate QC API response shape. Throws QC_API_SCHEMA_VIOLATION if invalid.
 *
 * @param {Object} qcResponse - Response with statements[].qcCard
 * @throws {Error} QC_API_SCHEMA_VIOLATION with message describing the failure
 */
export function validateQcResponse(qcResponse) {
  if (qcResponse == null || typeof qcResponse !== "object") {
    throw Object.assign(new Error("QC response must be an object"), { code: QC_API_SCHEMA_VIOLATION });
  }
  const statements = qcResponse.statements;
  if (!Array.isArray(statements)) return;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const qcCard = stmt?.qcCard;
    if (!qcCard || typeof qcCard !== "object") continue;

    for (const field of REQUIRED_QCCARD_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(qcCard, field)) {
        throw Object.assign(
          new Error(`qcCard missing required field "${field}" (statement index ${i})`),
          { code: QC_API_SCHEMA_VIOLATION, statementIndex: i, field }
        );
      }
    }

    if (!Array.isArray(qcCard.supportRefIds)) {
      throw Object.assign(
        new Error(`qcCard.supportRefIds must be an array (statement index ${i})`),
        { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
      );
    }

    if (!Array.isArray(qcCard.supportRefTitles) || qcCard.supportRefTitles.length !== qcCard.supportRefIds.length) {
      throw Object.assign(
        new Error(`qcCard.supportRefTitles must be an array with same length as supportRefIds (statement index ${i})`),
        { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
      );
    }

    const primaryRefId = qcCard.primaryRefId;
    if (primaryRefId != null && primaryRefId !== "") {
      const idStr = String(primaryRefId);
      if (!qcCard.supportRefIds.includes(idStr)) {
        throw Object.assign(
          new Error(`qcCard.primaryRefId must exist in supportRefIds or be null (statement index ${i})`),
          { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
        );
      }
    }

    const primaryExcerpt = qcCard.primaryExcerpt;
    if (primaryExcerpt != null && typeof primaryExcerpt !== "string") {
      throw Object.assign(
        new Error(`qcCard.primaryExcerpt must be string or null (statement index ${i})`),
        { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
      );
    }

    // A6.4: evidenceTrace optional; if present must be array of trace entries (max 3)
    const evidenceTrace = qcCard.evidenceTrace;
    if (evidenceTrace !== undefined) {
      if (!Array.isArray(evidenceTrace)) {
        throw Object.assign(
          new Error(`qcCard.evidenceTrace must be an array (statement index ${i})`),
          { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
        );
      }
      if (evidenceTrace.length > 3) {
        throw Object.assign(
          new Error(`qcCard.evidenceTrace must have at most 3 entries (statement index ${i})`),
          { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
        );
      }
      for (let t = 0; t < evidenceTrace.length; t++) {
        const entry = evidenceTrace[t];
        if (entry == null || typeof entry !== "object") {
          throw Object.assign(
            new Error(`qcCard.evidenceTrace[${t}] must be an object (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (typeof entry.sourceName !== "string" || typeof entry.excerptText !== "string") {
          throw Object.assign(
            new Error(`qcCard.evidenceTrace[${t}] must have sourceName and excerptText (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
      }
    }
  }
}
