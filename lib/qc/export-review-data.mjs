/**
 * Statement-review rows for the client export file.
 */

import { classifyCard, turnedOffLineFromClass } from "./review-summary.mjs";
import { asReviewOptions } from "./review-options.mjs";
import { normalizeExportVerdict } from "./evidence-display-verdict.mjs";

export const EVIDENCE_FINDING_NOT_RECORDED = "Not recorded.";
export const EVIDENCE_FINDING_NOT_CHECKED = "Not checked.";

export function isStandInEvidenceFinding(text) {
  return typeof text === "string" && text.includes("Specific commentary is unavailable from the system");
}

export function evidenceFindingForExport(qcCard, evidenceSkipped) {
  if (evidenceSkipped) return null;
  if (qcCard?.commentaryNotReviewed === true) return EVIDENCE_FINDING_NOT_CHECKED;
  const paragraph =
    typeof qcCard?.reasoningParagraph === "string" ? qcCard.reasoningParagraph.trim() : "";
  const headline =
    typeof qcCard?.reasoningHeadline === "string" ? qcCard.reasoningHeadline.trim() : "";
  if (isStandInEvidenceFinding(paragraph) || isStandInEvidenceFinding(headline)) {
    return EVIDENCE_FINDING_NOT_CHECKED;
  }
  if (paragraph) return paragraph;
  if (headline) return headline;
  return EVIDENCE_FINDING_NOT_RECORDED;
}

export function evidenceConcernSuffix(concernLevel) {
  if (!concernLevel || String(concernLevel).toLowerCase() === "none") return "";
  return ` (${concernLevel} evidence concern)`;
}

function signalClassIsConcern(cls) {
  return cls === "concern" || cls === "hardConcern";
}

/** Same statement-review rows the PDF/DOCX printers consume. */
export function buildReviewData(qcResult, reviewOptions) {
  const statements = Array.isArray(qcResult?.statements) ? qcResult.statements : [];
  const normalizedStatements = statements.map((s) => {
    const qcCard = s?.qcCard && typeof s.qcCard === "object" ? s.qcCard : {};
    const statementText = typeof qcCard.statement === "string" ? qcCard.statement.trim() : "";
    const evidenceSkipped =
      qcCard.supportState === "skipped" ||
      String(qcCard.displayVerdict || "").toLowerCase() === "not reviewed";
    const verdict = evidenceSkipped ? null : normalizeExportVerdict(qcCard.displayVerdict);
    const concernLevel =
      typeof qcCard.concernLevel === "string" && qcCard.concernLevel.trim()
        ? qcCard.concernLevel.trim()
        : null;
    const evidenceFinding = evidenceFindingForExport(qcCard, evidenceSkipped);
    const excerpt = evidenceSkipped
      ? null
      : qcCard.hasRealExcerpt === true &&
          typeof qcCard.primaryExcerptText === "string" &&
          qcCard.primaryExcerptText.trim()
        ? qcCard.primaryExcerptText.trim()
        : null;
    const editorialConcerns = Array.isArray(qcCard.editorialConcerns) ? qcCard.editorialConcerns : [];
    const complianceConcerns = Array.isArray(qcCard.complianceConcerns)
      ? qcCard.complianceConcerns
      : [];
    const editorialFallback = editorialConcerns
      .map((c) => c?.note)
      .filter((x) => typeof x === "string" && x.trim())
      .join(" ");
    const complianceFallback = complianceConcerns
      .map((c) => c?.note)
      .filter((x) => typeof x === "string" && x.trim())
      .join(" ");
    let editorialNote =
      typeof qcCard.editorialNote === "string" && qcCard.editorialNote !== ""
        ? qcCard.editorialNote
        : editorialFallback || null;
    let complianceNote =
      typeof qcCard.complianceNote === "string" && qcCard.complianceNote !== ""
        ? qcCard.complianceNote
        : complianceFallback || null;
    const reviewerVerdict =
      qcCard.reviewerVerdict == null ? null : String(qcCard.reviewerVerdict).trim() || null;
    const opts = asReviewOptions(reviewOptions);
    const editorialEnabled = opts.editorialEnabled;
    const complianceEnabled = opts.complianceEnabled;
    const summaryClass = classifyCard(qcCard, reviewOptions);
    if (!editorialEnabled) {
      editorialNote = null;
    } else if (summaryClass.editorial === "notChecked" && editorialNote == null) {
      editorialNote = "Not checked.";
    }
    if (!complianceEnabled) {
      complianceNote = null;
    } else if (summaryClass.compliance === "notChecked" && complianceNote == null) {
      complianceNote = "Not checked.";
    }
    const editorialFlag = signalClassIsConcern(summaryClass.editorial) || editorialNote != null;
    const complianceFlag = signalClassIsConcern(summaryClass.compliance) || complianceNote != null;
    const turnedOffLine =
      typeof summaryClass.turnedOffLine === "string" && summaryClass.turnedOffLine.trim()
        ? summaryClass.turnedOffLine.trim()
        : turnedOffLineFromClass(summaryClass);
    return {
      statementText,
      verdict,
      concernLevel,
      evidenceFinding,
      excerpt,
      editorialNote,
      complianceNote,
      reviewerVerdict,
      editorialFlag,
      complianceFlag,
      turnedOffLine,
    };
  });
  const safeStatements = JSON.parse(JSON.stringify(normalizedStatements));
  return { statements: safeStatements, total: safeStatements.length };
}

export function renderCanonicalExportText({
  qcResult,
  qualityReviewSummary,
  sources,
  draft,
  meta,
  reviewOptions,
} = {}) {
  const lines = [];
  const qrs = qualityReviewSummary && typeof qualityReviewSummary === "object" ? qualityReviewSummary : {};
  if (typeof qrs.readiness === "string" && qrs.readiness.trim()) lines.push(qrs.readiness.trim());
  const bullets = Array.isArray(qrs.bullets) ? qrs.bullets : [];
  for (const bullet of bullets) {
    const line = String(bullet ?? "").trim();
    if (line) lines.push(line);
  }
  if (typeof draft === "string" && draft.trim()) {
    lines.push("Draft output");
    lines.push(draft.trim());
  }
  const srcList = Array.isArray(sources) ? sources : [];
  if (srcList.length > 0) {
    lines.push("Sources used");
    for (const src of srcList) {
      lines.push(String(src?.name || src?.label || "Untitled source"));
    }
  }
  const options = reviewOptions ?? qcResult?.meta?.reviewOptions;
  const review = buildReviewData(qcResult, options);
  lines.push("Statement review");
  for (const row of review.statements) {
    lines.push(`"${row.statementText || ""}"`);
    const concernSuffix = evidenceConcernSuffix(row.concernLevel);
    if (row.verdict) lines.push(`Verdict: ${row.verdict}${concernSuffix}`);
    if (row.evidenceFinding) lines.push(`Evidence finding: ${row.evidenceFinding}`);
    if (row.excerpt) lines.push(`Excerpt: "${row.excerpt}"`);
    if (row.editorialNote) lines.push(`Editorial note: ${row.editorialNote}`);
    if (row.complianceNote) lines.push(`Compliance note: ${row.complianceNote}`);
    if (row.turnedOffLine) lines.push(row.turnedOffLine);
  }
  const disclaimer = typeof meta?.reviewDisclaimerText === "string" ? meta.reviewDisclaimerText.trim() : "";
  if (disclaimer) lines.push(disclaimer);
  return `${lines.join("\n")}\n`;
}

