// Pipeline v4 — QC rebuild route.
// See QC_Pipeline_Redesign_Architecture.docx for the
// target architecture (Stages 1–7).
// This is the stub entry point. Subsequent rebuild specs
// (R2.2 onwards) progressively fill in the new stages.
// Until then, this delegates to pipeline-v3.

import { runPipelineV3 } from "../pipeline-v3/qc-pipeline-v3.mjs";

/**
 * Pipeline v4 entry point.
 *
 * This intentionally mirrors the v3 public contract so callers can
 * switch between routes without changing their integration surface.
 *
 * As the rebuild proceeds (R2.2+), this module will grow a staged
 * implementation that reads its models from STAGE_MODELS in
 * `lib/qc/model-config.mjs` and orchestrates the QC pipeline by
 * stages 1–7. For R2.1, we delegate directly to v3.
 *
 * @param {string} draft
 * @param {Array<{ text: string, label: string }>} sources
 * @param {Record<string, unknown>} options
 */
export async function runPipelineV4(draft, sources, options = {}) {
  return runPipelineV3(draft, sources, options);
}

