/**
 * Statement-review rows for the client export file.
 */

export const EVIDENCE_FINDING_NOT_RECORDED = "Not recorded.";

export function evidenceFindingForExport(qcCard, evidenceSkipped) {
  if (evidenceSkipped) return null;
  const paragraph =
    typeof qcCard?.reasoningParagraph === "string" ? qcCard.reasoningParagraph.trim() : "";
  if (paragraph) return paragraph;
  const headline =
    typeof qcCard?.reasoningHeadline === "string" ? qcCard.reasoningHeadline.trim() : "";
  if (headline) return headline;
  return EVIDENCE_FINDING_NOT_RECORDED;
}
