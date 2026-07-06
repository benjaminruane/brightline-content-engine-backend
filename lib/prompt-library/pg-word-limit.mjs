// WR1: Deterministic PG commentary word-limit backstop (generate path only).

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

function splitPgSentences(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];
  const parts = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return parts.map((part) => part.trim()).filter(Boolean);
}

function collapsePgParagraphs(paragraphs) {
  const nonEmpty = paragraphs.map((p) => p.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return "";
  if (nonEmpty.length === 1) return nonEmpty[0];
  return nonEmpty.slice(0, 2).join("\n\n");
}

/**
 * Trim fund-commitment commentary at the last full sentence under the word limit.
 * @param {string} commentary
 * @param {number} limit
 * @returns {{ text: string, trimmed: boolean, untrimmable: boolean, wordCount?: number }}
 */
export function trimFundCommentaryAtSentenceBoundary(commentary, limit) {
  const source = String(commentary ?? "").trim();
  const paragraphs = source.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const allSentences = paragraphs.flatMap((paragraph) => splitPgSentences(paragraph));

  if (allSentences.length === 0) {
    return { text: "", trimmed: false, untrimmable: false, wordCount: 0 };
  }

  if (allSentences.length === 1 && countCommentaryWords(allSentences[0]) > limit) {
    return {
      text: source,
      trimmed: false,
      untrimmable: true,
      wordCount: countCommentaryWords(allSentences[0]),
    };
  }

  const kept = [];
  for (const sentence of allSentences) {
    const candidate = kept.length ? `${kept.join(" ")} ${sentence}` : sentence;
    if (countCommentaryWords(candidate) > limit) break;
    kept.push(sentence);
  }

  if (kept.length === 0) {
    return {
      text: source,
      trimmed: false,
      untrimmable: true,
      wordCount: countCommentaryWords(allSentences[0]),
    };
  }

  if (kept.length === allSentences.length) {
    return {
      text: source,
      trimmed: false,
      untrimmable: false,
      wordCount: countCommentaryWords(source),
    };
  }

  const hadTwoParagraphs = paragraphs.length >= 2;
  const collapsed =
    hadTwoParagraphs && kept.length >= 2
      ? collapsePgParagraphs([
          kept.slice(0, Math.ceil(kept.length / 2)).join(" "),
          kept.slice(Math.ceil(kept.length / 2)).join(" "),
        ])
      : kept.join(" ");

  return {
    text: collapsed,
    trimmed: true,
    untrimmable: false,
    wordCount: countCommentaryWords(collapsed),
  };
}

/**
 * @param {string} draftText
 * @param {{ eventType?: string, visibility?: string, requestId?: string|null }} [opts]
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
  { eventType, visibility, requestId = null } = {}
) {
  const limit = getPgCommentaryWordLimit(eventType, visibility);
  const raw = String(draftText ?? "");
  if (limit == null) {
    return { draftText: raw, enforced: false, cleaned: false };
  }

  const isFundCommitment =
    resolvePgWritingEventKey(eventType) === PG_WRITING_EVENT.NEW_FUND_COMMITMENT;

  const { commentary, methodologyNote } = splitPgDraftOutput(raw);
  let processed = cleanPgCommentary(commentary);
  let cleaned = processed !== commentary.trim();
  let trimmed = false;

  if (isFundCommitment) {
    const filterResult = applyPgFundCommitmentPostFilter(processed, { requestId });
    processed = filterResult.text;
    cleaned = cleaned || filterResult.filtered;

    let wordCount = countCommentaryWords(processed);
    if (wordCount > limit) {
      const trimResult = trimFundCommentaryAtSentenceBoundary(processed, limit);
      if (trimResult.untrimmable) {
        console.warn(
          "[CANARY]",
          JSON.stringify({
            event: "pg_word_limit_exceeded",
            requestId,
            wordCount: trimResult.wordCount ?? wordCount,
            limit,
            untrimmable: true,
          })
        );
        const rebuilt = joinPgDraftParts(processed, methodologyNote);
        return {
          draftText: rebuilt,
          enforced: false,
          cleaned: cleaned || rebuilt !== raw,
          limitExceeded: true,
          wordCount: trimResult.wordCount ?? wordCount,
          limit,
          trimmed: false,
        };
      }
      if (trimResult.trimmed) {
        processed = trimResult.text;
        wordCount = trimResult.wordCount ?? countCommentaryWords(processed);
        trimmed = true;
        cleaned = true;
      }
    }

    const rebuilt = joinPgDraftParts(processed, methodologyNote);
    return {
      draftText: rebuilt,
      enforced: trimmed,
      cleaned: cleaned || rebuilt !== raw,
      limitExceeded: false,
      wordCount,
      limit,
      trimmed,
    };
  }

  const wordCount = countCommentaryWords(processed);
  const rebuilt = joinPgDraftParts(processed, methodologyNote);

  if (wordCount > limit) {
    console.warn(
      "[CANARY]",
      JSON.stringify({
        event: "pg_word_limit_exceeded",
        requestId,
        wordCount,
        limit,
      })
    );
    return {
      draftText: rebuilt,
      enforced: false,
      cleaned: cleaned || rebuilt !== raw,
      limitExceeded: true,
      wordCount,
      limit,
    };
  }

  return {
    draftText: rebuilt,
    enforced: false,
    cleaned: cleaned || rebuilt !== raw,
    limitExceeded: false,
    wordCount,
    limit,
  };
}
