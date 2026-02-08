// lib/extract-statements.mjs
// A3.14.0: Statement extraction module — splitting only (no LLM, no scoring).
// Reuses splitting logic from analyse-statements-impl.mjs.

import {
  buildSelectionSentences,
  segmentSelectionIntoCandidates,
  extractDeterministicStatementCandidates,
} from "./analyse-statements-impl.mjs";

/**
 * Extract statement candidates from text (deterministic, no LLM).
 * @param {{ mode: "selection" | "draft", text: string, opts?: { runId?: string, reqSig?: string, hasReturned?: boolean } }} params
 * @returns {{ candidates: Array<string|object>, metadata: object }}
 */
export function extractStatements({ mode, text, opts = {} }) {
  const runId = opts.runId ?? null;
  const reqSig = opts.reqSig ?? null;
  const hasReturned = opts.hasReturned ?? false;

  if (mode === "selection") {
    const selectionText = typeof text === "string" ? text : "";
    const trimmed = selectionText.trim();

    const { sentences, mergedSmallCount } = buildSelectionSentences(trimmed ? selectionText : "", runId, reqSig);
    const sentenceCount = sentences.length;
    const selectionMergedSmallCount = mergedSmallCount ?? 0;

    const splitResult = segmentSelectionIntoCandidates(trimmed ? selectionText : "", runId, reqSig);

    const candidates =
      splitResult.length === 0 && trimmed
        ? [
            {
              text: trimmed,
              selectionGroupId: null,
              selectionIndex: 1,
              selectionTotal: 1,
              segmentId: 0,
            },
          ]
        : splitResult;

    const metadata = {
      mode: "selection",
      selectionTextLen: trimmed.length,
      sentenceCount,
      candidateCount: candidates.length,
      selectionMergedSmallCount,
    };

    return { candidates, metadata };
  }

  if (mode === "draft") {
    const normalizedDraftText = typeof text === "string" ? text : "";
    const candidates = extractDeterministicStatementCandidates(
      normalizedDraftText,
      runId,
      reqSig,
      hasReturned
    );

    const metadata = {
      mode: "draft",
      draftChars: normalizedDraftText.length,
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
    };

    return { candidates: Array.isArray(candidates) ? candidates : [], metadata };
  }

  return {
    candidates: [],
    metadata: { mode: String(mode), candidateCount: 0 },
  };
}
