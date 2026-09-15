// WR1: Deterministic PG commentary word-limit instrument (generate path only).
// B188: does not truncate. The limit is the writer's typed figure, else the house default.

import { VISIBILITY, normalizeVisibility } from "../output-intent.js";
import { PG_WRITING_EVENT, resolvePgWritingEventKey } from "./pg-writing-prompts.mjs";
import {
  applyPgFundCommitmentPostFilter,
  cleanPgCommentary,
  joinPgDraftParts,
  PG_METHODOLOGY_DELIMITER,
} from "./pg-commentary-cleanup.mjs";

export { PG_METHODOLOGY_DELIMITER };

/**
 * @param {string} [eventType]
 * @param {string} [visibility]
 * @returns {number|null}
 */
export function getPgCommentaryWordLimit(eventType, visibility) {
  const eventKey = resolvePgWritingEventKey(eventType);
  if (!eventKey) return null;
  const vis = normalizeVisibility(visibility);
  return vis === VISIBILITY.PUBLIC ? 80 : 150;
}

/**
 * @param {string} text
 * @returns {number}
 */
export function countCommentaryWords(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * @param {string} raw
 * @returns {{ commentary: string, methodologyNote: string }}
 */
export function splitPgDraftOutput(raw) {
  const text = typeof raw === "string" ? raw : "";
  const idx = text.indexOf(PG_METHODOLOGY_DELIMITER);
  if (idx === -1) {
    return { commentary: text.trim(), methodologyNote: "" };
  }
  return {
    commentary: text.slice(0, idx).trim(),
    methodologyNote: text.slice(idx + PG_METHODOLOGY_DELIMITER.length).trim(),
  };
}

/**
 * @param {string} draftText
 * @param {{ eventType?: string, visibility?: string, requestId?: string|null, maxWords?: number|null }} [opts]
 * @returns {{
 *   draftText: string,
 *   enforced: boolean,
 *   cleaned: boolean,
 *   limitExceeded?: boolean,
 *   wordCount?: number,
 *   limit?: number,
 *   trimmed?: boolean,
 * }}
 */
export function enforcePgCommentaryWordLimit(
  draftText,
  { eventType, visibility, requestId = null, maxWords } = {}
) {
  const limit = maxWords ?? getPgCommentaryWordLimit(eventType, visibility);
  const raw = String(draftText ?? "");
  if (limit == null) {
    return { draftText: raw, enforced: false, cleaned: false };
  }

  const isFundCommitment =
    resolvePgWritingEventKey(eventType) === PG_WRITING_EVENT.NEW_FUND_COMMITMENT;

  const { commentary, methodologyNote } = splitPgDraftOutput(raw);
  let processed = cleanPgCommentary(commentary);
  let cleaned = processed !== commentary.trim();

  if (isFundCommitment) {
    const filterResult = applyPgFundCommitmentPostFilter(processed, { requestId });
    processed = filterResult.text;
    cleaned = cleaned || filterResult.filtered;
  }

  const wordCount = countCommentaryWords(processed);
  const rebuilt = joinPgDraftParts(processed, methodologyNote);
  const limitExceeded = wordCount > limit;

  if (limitExceeded) {
    console.warn(
      "[CANARY]",
      JSON.stringify({
        event: "pg_word_limit_exceeded",
        requestId,
        wordCount,
        limit,
      })
    );
  }

  return {
    draftText: rebuilt,
    enforced: false,
    cleaned: cleaned || rebuilt !== raw,
    limitExceeded,
    wordCount,
    limit,
    trimmed: false,
  };
}
