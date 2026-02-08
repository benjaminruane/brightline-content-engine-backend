// lib/extract-statements.mjs
// A3.14.0: Statement extraction module — splitting only (no LLM, no scoring).
// A3.14.4: V2 draft splitter — deterministic anti-orphan + merge hardening.

import {
  buildSelectionSentences,
  segmentSelectionIntoCandidates,
  extractDeterministicStatementCandidates,
} from "./analyse-statements-impl.mjs";

// A3.14.4: Abbreviations that should not trigger sentence split (draft V2)
const DRAFT_ABBREVS = new Set([
  "e.g.", "i.e.", "vs.", "Mr.", "Ms.", "Mrs.", "Dr.", "Prof.", "Inc.", "Ltd.", "Corp.", "Co.",
  "No.", "St.", "etc.", "cf.", "ex.", "al.", "et al.", "p.", "pp.", "vol.", "ch.", "fig.", "eq."
]);

// A3.14.4: Numeric orphan detection — fragment is short and only currency/number
function isNumericOrphan(text, maxLen = 25) {
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (t.length >= maxLen || t.length === 0) return false;
  const hasCurrency = /[$€£]|\b\d[\d,.]*\s*(%|m\b|bn\b|million|billion|months?|ARR|revenue)\b/i.test(t);
  const mostlyNumeric = /^[\s$€£\d,.%mbn\-–—approximately~]+$/i.test(t) || /^\$[\d,.]+\s*$/.test(t);
  return hasCurrency || (mostlyNumeric && /\d/.test(t));
}

// A3.14.4: Check if fragment has currency/percent token (for merge heuristic)
function hasNumericAnchor(text) {
  if (typeof text !== "string") return false;
  return /[$€£]|\d[\d,.]*\s*%|\b(m|bn|million|billion|ARR)\b/i.test(text);
}

/**
 * A3.14.4: V2 draft splitter — deterministic, anti-orphan, no bad merges.
 * @param {string} normalizedDraftText
 * @param {{ maxLen?: number, minLen?: number, maxCandidates?: number }} opts
 * @returns {{ candidates: string[], stats: { mergesApplied: number, numericOrphansRepaired: number, overlongSplitCount: number } }}
 */
function splitDraftIntoCandidatesV2(normalizedDraftText, opts = {}) {
  const maxLen = opts.maxLen ?? 240;
  const minLen = opts.minLen ?? 25;
  const maxCandidates = opts.maxCandidates ?? 40;
  const stats = { mergesApplied: 0, numericOrphansRepaired: 0, overlongSplitCount: 0 };

  if (typeof normalizedDraftText !== "string" || !normalizedDraftText.trim()) {
    return { candidates: [], stats };
  }

  // Step A — Normalize: collapse spaces, keep paragraph breaks; treat bullet lines as boundaries
  let text = normalizedDraftText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  // Replace bullet/numbered line starts with a sentinel for splitting
  text = text.replace(/\n(\s*[-•*]\s+)/g, "\n\n$1");
  text = text.replace(/\n(\s*\d+[.)]\s+)/g, "\n\n$1");

  // Step B — Primary sentence boundary split (. ! ? and paragraph breaks)
  const parts = [];
  let i = 0;
  let current = "";
  while (i < text.length) {
    const ch = text[i];
    current += ch;
    const isParaBreak = current.endsWith("\n\n") || (current.endsWith("\n") && text[i + 1] === "\n");
    const isTerminator = /[.!?]/.test(ch);
    if (isParaBreak) {
      const trimmed = current.replace(/\n+/g, " ").trim();
      if (trimmed.length > 0) parts.push(trimmed);
      current = "";
      i++;
      continue;
    }
    if (isTerminator) {
      const words = current.trim().split(/\s+/);
      const lastWord = words[words.length - 1] || "";
      const isAbbrev = DRAFT_ABBREVS.has(lastWord.replace(/[.,;:!?]$/, "")) || DRAFT_ABBREVS.has(lastWord);
      const nextIsSpaceOrEnd = i + 1 >= text.length || /\s/.test(text[i + 1]);
      if (nextIsSpaceOrEnd && !isAbbrev) {
        const trimmed = current.trim();
        if (trimmed.length > 0) parts.push(trimmed);
        current = "";
      }
    }
    i++;
  }
  if (current.trim().length > 0) parts.push(current.replace(/\n+/g, " ").trim());

  // Step C — Secondary split on long segments (; then : then —/-), only outside parens
  function splitOutsideParens(str, regex) {
    const indices = [];
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "(") depth++;
      else if (str[i] === ")") depth--;
      else if (depth === 0) {
        const m = str.slice(i).match(regex);
        if (m && m.index === 0) {
          indices.push({ pos: i, len: m[0].length });
          i += m[0].length - 1;
        }
      }
    }
    if (indices.length === 0) return [str.trim()].filter(Boolean);
    const out = [];
    let start = 0;
    for (const { pos, len } of indices) {
      const chunk = str.slice(start, pos).trim();
      if (chunk) out.push(chunk);
      start = pos + len;
    }
    const last = str.slice(start).trim();
    if (last) out.push(last);
    return out;
  }
  const afterLongSplit = [];
  for (const seg of parts) {
    if (seg.length <= maxLen) {
      afterLongSplit.push(seg);
      continue;
    }
    stats.overlongSplitCount++;
    let sub = [seg];
    for (const re of [/\s*;\s+/, /\s*:\s+/, /\s+[—\-]\s+/]) {
      const next = [];
      for (const s of sub) {
        if (s.length <= maxLen) {
          next.push(s);
          continue;
        }
        const chunks = splitOutsideParens(s, re);
        next.push(...chunks);
      }
      sub = next;
    }
    afterLongSplit.push(...sub.filter((s) => s.length > 0));
  }

  // Step D — Anti-orphan: attach numeric orphans to neighbor
  const afterOrphan = [];
  for (let idx = 0; idx < afterLongSplit.length; idx++) {
    const seg = afterLongSplit[idx];
    if (!isNumericOrphan(seg, 25)) {
      afterOrphan.push(seg);
      continue;
    }
    stats.numericOrphansRepaired++;
    const nextSeg = afterLongSplit[idx + 1];
    const prevSeg = afterOrphan[afterOrphan.length - 1];
    if (nextSeg && nextSeg.length > 0) {
      afterOrphan.push((seg + " " + nextSeg).replace(/\s+/g, " ").trim());
      idx++;
    } else if (prevSeg) {
      afterOrphan[afterOrphan.length - 1] = (prevSeg + " " + seg).replace(/\s+/g, " ").trim();
    } else {
      afterOrphan.push(seg);
    }
  }

  // Step E — Merge only when continuation
  const continuationStart = /^\s*(with|and|including|which|that|or|but|as well as)\s+/i;
  const endsWithContinuation = /[,:]\s*$|(\s+with|\s+including)\s*$/i;
  const merged = [];
  for (let idx = 0; idx < afterOrphan.length; idx++) {
    let seg = afterOrphan[idx];
    const prev = merged[merged.length - 1];
    const isShort = seg.length < 60;
    const prevEndsOpen = prev && !/[.!?]\s*$/.test(prev) && endsWithContinuation.test(prev);
    const startsContinuation = continuationStart.test(seg) && isShort;
    const bothHaveNumeric = prev && hasNumericAnchor(prev) && hasNumericAnchor(seg);
    const shouldMerge = isShort && prev && (prevEndsOpen || (startsContinuation && !/[.!?]\s*$/.test(prev))) && !bothHaveNumeric;
    if (shouldMerge) {
      merged[merged.length - 1] = (prev + " " + seg).replace(/\s+/g, " ").trim();
      stats.mergesApplied++;
    } else {
      merged.push(seg);
    }
  }

  // Step F — Finalize: trim, drop empty, minLen, cap
  let candidates = merged.map((s) => s.trim()).filter((s) => s.length > 0);
  candidates = candidates.filter((s) => s.length >= minLen || (s.length > 0 && !isNumericOrphan(s, 100)));
  if (candidates.length > maxCandidates) {
    candidates = candidates.slice(0, maxCandidates);
  }
  return { candidates, stats };
}

/**
 * Extract statement candidates from text (deterministic, no LLM).
 * @param {{ mode: "selection" | "draft", text: string, opts?: { runId?: string, reqSig?: string, hasReturned?: boolean, engine?: string } }} params
 * @returns {{ candidates: Array<string|object>, metadata: object }}
 */
export function extractStatements({ mode, text, opts = {} }) {
  const runId = opts.runId ?? null;
  const reqSig = opts.reqSig ?? null;
  const hasReturned = opts.hasReturned ?? false;
  const engine = opts.engine ?? "v1";

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
    if (engine === "v2") {
      const { candidates, stats } = splitDraftIntoCandidatesV2(normalizedDraftText, {
        maxLen: 240,
        minLen: 25,
        maxCandidates: 40,
      });
      const candidateCount = candidates.length;
      console.log("[A3.14.4][SPLIT_STATS]", {
        mode: "draft",
        candidates: candidateCount,
        mergesApplied: stats.mergesApplied,
        numericOrphansRepaired: stats.numericOrphansRepaired,
        overlongSplitCount: stats.overlongSplitCount,
      });
      if (process.env.BRIGHTLINE_DIAG_VERBOSE === "1") {
        candidates.slice(0, 8).forEach((c, i) => {
          console.log("[A3.14.4][CANDIDATE_PREVIEW]", i + 1, (c.length > 80 ? c.slice(0, 80) + "…" : c));
        });
      }
      const metadata = {
        mode: "draft",
        draftChars: normalizedDraftText.length,
        candidateCount,
        splitStats: stats,
      };
      return { candidates, metadata };
    }
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
