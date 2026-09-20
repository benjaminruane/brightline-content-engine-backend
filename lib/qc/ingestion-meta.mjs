/**
 * Surface the ingestion warnings prepareUploadedSourcesForPipeline already
 * computes. Do not improve extraction.
 */

export function ingestionMetaFromPrep(prep) {
  if (!prep || typeof prep !== "object") {
    console.warn("[ingestion-meta] missing prep at writer");
    return {};
  }
  const out = {};
  if (typeof prep.sourceIngestionWarning === "string" && prep.sourceIngestionWarning.trim()) {
    out.sourceIngestionWarning = prep.sourceIngestionWarning.trim();
  }
  if (prep.totalTextLowWarning === true) {
    out.totalTextLowWarning = true;
  }
  return out;
}
