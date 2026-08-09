/**
 * R7.B46 — Pure helpers for analyse-statements response source arrays.
 * Response assembly only; not pipeline internals.
 */

import { normalizePublicationState } from "./source-publication-state.mjs";

/**
 * R3.3: classify why a source was dropped post-extraction (empty text after prepareUploadedSourcesForPipeline).
 * @param {object|null|undefined} original - raw request source
 * @param {object|undefined} preparedRow - entry from preparedSources at same index, if present
 */
export function dropReasonAfterExtraction(original, preparedRow) {
  if (!preparedRow) return "extraction_failed";
  const text = typeof preparedRow.text === "string" ? preparedRow.text : "";
  if (text.trim()) return null;
  const hasB64 = typeof original?.contentBase64 === "string" && original.contentBase64.length > 0;
  const hasTextString = typeof original?.text === "string";
  if (!hasTextString && !hasB64) return "no_text_field";
  return "empty_after_extraction";
}

function resolveLabel(source, index) {
  return (
    (typeof source?.label === "string" && source.label.trim()) ||
    (typeof source?.name === "string" && source.name.trim()) ||
    (typeof source?.title === "string" && source.title.trim()) ||
    `Source ${index + 1}`
  );
}

function resolveId(original) {
  return original?.id != null && original.id !== "" ? original.id : null;
}

/**
 * Split prepared sources into kept (reviewed / pipeline) vs dropped (empty text).
 * `kept` is contiguous and re-indexed by array position (sourceIndex for supportSpans).
 * `dropped` is separate — never merged into kept — so a middle empty source does not
 * shift later sourceRefIds.
 *
 * @param {Array<object>} preparedSources
 * @param {Array<object>} candidateSources - original uploaded sources (same index)
 * @returns {{ kept: Array<object>, dropped: Array<{ id: string|null, label: string, reason: string }> }}
 */
export function splitSourcesForResponse(preparedSources, candidateSources) {
  const prepared = Array.isArray(preparedSources) ? preparedSources : [];
  const candidates = Array.isArray(candidateSources) ? candidateSources : [];
  const kept = [];
  const dropped = [];

  for (let index = 0; index < prepared.length; index++) {
    const source = prepared[index];
    const original = candidates[index];
    const text = typeof source?.text === "string" ? source.text : "";
    const label = resolveLabel(source, index);
    const id = resolveId(original);

    if (!text.trim()) {
      const reason =
        dropReasonAfterExtraction(original, source) || "empty_after_extraction";
      dropped.push({ id, label, reason });
      continue;
    }

    // Extra fields (id, name) are inert to the pipeline; id feeds response.sources.
    kept.push({
      text,
      label,
      name: typeof original?.name === "string" ? original.name : source?.name,
      id,
      publicationState: normalizePublicationState(
        source?.publicationState ?? original?.publicationState
      ),
    });
  }

  return { kept, dropped };
}

/**
 * Build the aligned `sources` array for the analyse-statements response.
 *
 * Exact-string contract: sources[i].text === v3Sources[i].text — the string B40
 * offsets index into. Do not re-normalise, re-trim, or slice.
 *
 * Alignment contract: sources array index === sourceIndex === supportSpans.sourceRefId.
 * Do not sort or re-order; excluded/dropped sources must never appear here.
 *
 * Inline full text grows the response by total extracted-text size (~20KB per
 * longform PDF). Acceptable now; large/many-source cases may later warrant
 * truncation or a fetch-on-open endpoint. Do not build that here.
 *
 * @param {Array<{ id?: string|null, label?: string, text?: string, publicationState?: string }>} v3Sources
 * @returns {Array<{ index: number, id: string|null, label: string, text: string, publicationState: * }>}
 */
export function buildResponseSources(v3Sources) {
  const list = Array.isArray(v3Sources) ? v3Sources : [];
  return list.map((source, index) => ({
    index,
    id: source?.id != null && source.id !== "" ? source.id : null,
    label: typeof source?.label === "string" ? source.label : `Source ${index + 1}`,
    // Exact-string contract: pass through verbatim (may be empty string; still position-aligned).
    text: typeof source?.text === "string" ? source.text : "",
    publicationState: source?.publicationState,
  }));
}

/**
 * Build `excludedSources` for sources dropped before review (empty text).
 * Lives only in this array — never in `sources` — so positions stay aligned.
 * Emits reason CODE only (drawer renders user-facing wording).
 *
 * @param {Array<{ id?: string|null, label?: string, reason?: string }>} dropped
 * @returns {Array<{ id: string|null, label: string, reason: string }>}
 */
export function buildExcludedSources(dropped) {
  const list = Array.isArray(dropped) ? dropped : [];
  return list.map((entry, i) => ({
    id: entry?.id != null && entry.id !== "" ? entry.id : null,
    label: typeof entry?.label === "string" && entry.label.trim()
      ? entry.label
      : `Source ${i + 1}`,
    reason: typeof entry?.reason === "string" && entry.reason
      ? entry.reason
      : "empty_after_extraction",
  }));
}
