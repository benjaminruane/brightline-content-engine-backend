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

    // R7 build A: supportSpans optional additive field
    const supportSpans = qcCard.supportSpans;
    if (supportSpans !== undefined) {
      if (!Array.isArray(supportSpans)) {
        throw Object.assign(
          new Error(`qcCard.supportSpans must be an array when present (statement index ${i})`),
          { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
        );
      }
      const supportingClassifications = new Set([
        "confirmed",
        "partially_confirmed",
        "conflicting",
      ]);
      for (let s = 0; s < supportSpans.length; s++) {
        const span = supportSpans[s];
        if (span == null || typeof span !== "object") {
          throw Object.assign(
            new Error(`qcCard.supportSpans[${s}] must be an object (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (span.sourceRefId != null && typeof span.sourceRefId !== "number") {
          throw Object.assign(
            new Error(
              `qcCard.supportSpans[${s}].sourceRefId must be number|null (statement index ${i})`
            ),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (!supportingClassifications.has(span.classification)) {
          throw Object.assign(
            new Error(
              `qcCard.supportSpans[${s}].classification must be confirmed|partially_confirmed|conflicting (statement index ${i})`
            ),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (typeof span.statementId !== "string") {
          throw Object.assign(
            new Error(`qcCard.supportSpans[${s}].statementId must be a string (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (typeof span.passage !== "string") {
          throw Object.assign(
            new Error(`qcCard.supportSpans[${s}].passage must be a string (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (span.start != null && typeof span.start !== "number") {
          throw Object.assign(
            new Error(`qcCard.supportSpans[${s}].start must be number|null (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (span.end != null && typeof span.end !== "number") {
          throw Object.assign(
            new Error(`qcCard.supportSpans[${s}].end must be number|null (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
      }
    }

    // B88: unsupportedSpans optional additive field. Statement-side offsets.
    const unsupportedSpans = qcCard.unsupportedSpans;
    if (unsupportedSpans !== undefined) {
      if (!Array.isArray(unsupportedSpans)) {
        throw Object.assign(
          new Error(`qcCard.unsupportedSpans must be an array when present (statement index ${i})`),
          { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
        );
      }
      const gapClassifications = new Set(["partially_confirmed", "conflicting"]);
      for (let s = 0; s < unsupportedSpans.length; s++) {
        const span = unsupportedSpans[s];
        if (span == null || typeof span !== "object") {
          throw Object.assign(
            new Error(`qcCard.unsupportedSpans[${s}] must be an object (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (span.sourceRefId != null && typeof span.sourceRefId !== "number") {
          throw Object.assign(
            new Error(
              `qcCard.unsupportedSpans[${s}].sourceRefId must be number|null (statement index ${i})`
            ),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (!gapClassifications.has(span.classification)) {
          throw Object.assign(
            new Error(
              `qcCard.unsupportedSpans[${s}].classification must be partially_confirmed|conflicting (statement index ${i})`
            ),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (typeof span.statementId !== "string") {
          throw Object.assign(
            new Error(`qcCard.unsupportedSpans[${s}].statementId must be a string (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (typeof span.text !== "string") {
          throw Object.assign(
            new Error(`qcCard.unsupportedSpans[${s}].text must be a string (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (span.start != null && typeof span.start !== "number") {
          throw Object.assign(
            new Error(`qcCard.unsupportedSpans[${s}].start must be number|null (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
        if (span.end != null && typeof span.end !== "number") {
          throw Object.assign(
            new Error(`qcCard.unsupportedSpans[${s}].end must be number|null (statement index ${i})`),
            { code: QC_API_SCHEMA_VIOLATION, statementIndex: i }
          );
        }
      }
    }
  }
}
