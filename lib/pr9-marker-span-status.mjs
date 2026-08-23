/**
 * Align a revised marker span to its original region using surrounding
 * word context (LCS token alignment). Shared by the Pr9 diagnostic harness
 * and (later) a production note-honesty post-check. Keep both on this file.
 *
 * CHANGED when the original region and the revised span do not have the same
 * word sequence: insertions, replacements, and deletions (the F8 case: dropping
 * "22%" leaves no unaligned revised word, but the original region still has it).
 *
 * UNCHANGED when those sequences match, including a byte-identical span (F7).
 *
 * Boundary cases:
 * - Zero-length markers: UNCHANGED.
 * - Whitespace-only markers between two aligned neighbours: empty region on
 *   both sides, UNCHANGED.
 * - Surrounding context is the nearest LCS-aligned tokens fully left and fully
 *   right of the marker. The original region is every original token strictly
 *   between those anchors.
 * - House-style ($7,000,000 vs USD 7 million) differs in word sequence, CHANGED.
 */

export const SPAN_CHANGED = "CHANGED";
export const SPAN_UNCHANGED = "UNCHANGED";

/**
 * @param {string} text
 * @returns {Array<{ text: string, start: number, end: number }>}
 */
export function tokenizeWords(text) {
  const source = typeof text === "string" ? text : "";
  const tokens = [];
  const re = /\S+/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    tokens.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * LCS: revised token index -> original token index, or null if inserted.
 * @param {Array<{ text: string }>} originalTokens
 * @param {Array<{ text: string }>} revisedTokens
 * @returns {Array<number|null>}
 */
export function alignRevisedToOriginal(originalTokens, revisedTokens) {
  const n = originalTokens.length;
  const m = revisedTokens.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (originalTokens[i - 1].text === revisedTokens[j - 1].text) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }
  const revToOrig = new Array(m).fill(null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (originalTokens[i - 1].text === revisedTokens[j - 1].text) {
      revToOrig[j - 1] = i - 1;
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return revToOrig;
}

function wordSequenceKey(tokens) {
  return tokens.map((t) => t.text).join("\0");
}

/**
 * @param {string} original
 * @param {string} revised
 * @param {number} start
 * @param {number} end
 * @returns {"CHANGED"|"UNCHANGED"}
 */
export function markerSpanStatus(original, revised, start, end) {
  const s = Number.isFinite(start) ? start : 0;
  const e = Number.isFinite(end) ? end : s;
  if (e <= s) return SPAN_UNCHANGED;

  const origT = tokenizeWords(original);
  const revT = tokenizeWords(revised);
  const revToOrig = alignRevisedToOriginal(origT, revT);

  const spanRevIdx = [];
  for (let j = 0; j < revT.length; j++) {
    if (revT[j].start < e && revT[j].end > s) spanRevIdx.push(j);
  }

  let left = -1;
  for (let j = 0; j < revT.length; j++) {
    if (revT[j].end <= s) left = j;
  }
  let right = -1;
  for (let j = 0; j < revT.length; j++) {
    if (revT[j].start >= e) {
      right = j;
      break;
    }
  }

  let origLeft = -1;
  if (left >= 0) {
    for (let j = left; j >= 0; j--) {
      if (revToOrig[j] != null) {
        origLeft = revToOrig[j];
        break;
      }
    }
  }

  let origRight = origT.length;
  if (right >= 0) {
    for (let j = right; j < revT.length; j++) {
      if (revToOrig[j] != null) {
        origRight = revToOrig[j];
        break;
      }
    }
  }

  const origRegion = origT.slice(origLeft + 1, origRight);
  const revSpan = spanRevIdx.map((j) => revT[j]);
  if (wordSequenceKey(origRegion) === wordSequenceKey(revSpan)) return SPAN_UNCHANGED;
  return SPAN_CHANGED;
}
