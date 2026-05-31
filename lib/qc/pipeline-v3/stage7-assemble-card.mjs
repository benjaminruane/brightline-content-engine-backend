import { logCanaryScore } from "../../observability.js";
import { judgeEditorialDuplication } from "../editorial-duplication-judge.mjs";
import { recomputeV4EditorialVerdictFromConcerns } from "../editorial-compliance-reviewer.mjs";

const SUPPRESSED_CONCERN_TEXT_MAX_LEN = 200;

/** R5.2: Minimum overlap (as fraction of longer span) to treat two concerns as duplicates. */
const DUPLICATE_OVERLAP_THRESHOLD = 0.8;

/** R5.2(a): Minimum token-set Jaccard similarity to treat two concerns under the same
 *  concernCode as substantive duplicates, applied within a merge group before numbering.
 */
const DUPLICATE_TEXT_SIMILARITY_THRESHOLD = 0.85;

const ROMAN_LIST_LABELS = ["(i)", "(ii)", "(iii)", "(iv)", "(v)"];

function normaliseConcernText(...parts) {
  return parts
    .filter((p) => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.toLowerCase())
    .join(" ")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function concernTextSimilarity(textA, textB) {
  const tokensA = new Set(textA.split(" ").filter(Boolean));
  const tokensB = new Set(textB.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection += 1;
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function getConcernSpans(concern) {
  const span = concern?.span;
  if (!span) return [];
  if (Array.isArray(span)) {
    return span.filter(
      (s) => s && Number.isFinite(s.startChar) && Number.isFinite(s.endChar)
    );
  }
  if (Number.isFinite(span.startChar) && Number.isFinite(span.endChar)) {
    return [span];
  }
  return [];
}

function dedupeIdenticalSpans(spans) {
  const seen = new Set();
  const out = [];
  for (const s of spans) {
    const key = `${s.startChar}:${s.endChar}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function romanListLabel(index) {
  if (index < ROMAN_LIST_LABELS.length) return ROMAN_LIST_LABELS[index];
  return ROMAN_LIST_LABELS[ROMAN_LIST_LABELS.length - 1];
}

function ensureTerminalPunctuation(text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return t;
  if (/[.!?]$/.test(t)) return t;
  return `${t}.`;
}

/**
 * R5.2: True if any span pair overlaps by at least `threshold` of the longer span.
 * @param {Array<{ startChar: number, endChar: number }>} spansA
 * @param {Array<{ startChar: number, endChar: number }>} spansB
 */
function detectSpanOverlap(spansA, spansB, threshold = DUPLICATE_OVERLAP_THRESHOLD) {
  if (!Array.isArray(spansA) || !Array.isArray(spansB)) return false;
  for (const spanA of spansA) {
    for (const spanB of spansB) {
      const overlapStart = Math.max(spanA.startChar, spanB.startChar);
      const overlapEnd = Math.min(spanA.endChar, spanB.endChar);
      const overlapLength = Math.max(0, overlapEnd - overlapStart);
      const lenA = spanA.endChar - spanA.startChar;
      const lenB = spanB.endChar - spanB.startChar;
      const longerLength = Math.max(lenA, lenB);
      if (longerLength > 0 && overlapLength / longerLength >= threshold) {
        return true;
      }
    }
  }
  return false;
}

/**
 * R5.2: Group concern indices that share span overlap (union-find). Size-1 groups are non-duplicates.
 * @param {unknown[]} concerns
 * @returns {number[][]}
 */
function detectDuplicateGroups(concerns) {
  const n = Array.isArray(concerns) ? concerns.length : 0;
  if (n === 0) return [];
  const spansByIndex = concerns.map((c) => getConcernSpans(c));
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i) {
    let root = i;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  }

  function union(i, j) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  }

  for (let i = 0; i < n; i++) {
    if (spansByIndex[i].length === 0) continue;
    for (let j = i + 1; j < n; j++) {
      if (spansByIndex[j].length === 0) continue;
      if (detectSpanOverlap(spansByIndex[i], spansByIndex[j])) {
        union(i, j);
      }
    }
  }

  const byRoot = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(i);
  }

  return [...byRoot.values()].sort((a, b) => Math.min(...a) - Math.min(...b));
}

function buildConcernTextForJudge(concern) {
  const concernText =
    typeof concern?.concernText === "string" ? concern.concernText.trim() : "";
  if (concernText) return concernText;
  const note = typeof concern?.note === "string" ? concern.note.trim() : "";
  const direction =
    typeof concern?.suggestedDirection === "string"
      ? concern.suggestedDirection.trim()
      : "";
  return [note, direction].filter(Boolean).join(" ");
}

function truncateConcernText(text, maxLen = SUPPRESSED_CONCERN_TEXT_MAX_LEN) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t || t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

function buildNormalisedConcernText(concern) {
  const note = typeof concern?.note === "string" ? concern.note.trim() : "";
  const concernText =
    typeof concern?.concernText === "string" ? concern.concernText.trim() : "";
  const direction =
    typeof concern?.suggestedDirection === "string"
      ? concern.suggestedDirection.trim()
      : "";
  return normaliseConcernText(note || concernText, direction);
}

function emitSingleConcernShape(concern) {
  const out = {
    concernCode: concern?.concernCode,
    category: concern?.category,
  };
  const note = typeof concern?.note === "string" ? concern.note.trim() : "";
  if (note) out.note = note;
  const direction =
    typeof concern?.suggestedDirection === "string"
      ? concern.suggestedDirection.trim()
      : "";
  if (direction) out.suggestedDirection = direction;
  const rewrite =
    typeof concern?.suggestedRewrite === "string" ? concern.suggestedRewrite.trim() : "";
  if (rewrite) out.suggestedRewrite = rewrite;
  const concernText =
    typeof concern?.concernText === "string" ? concern.concernText.trim() : "";
  if (concernText) out.concernText = concernText;
  const spans = dedupeIdenticalSpans(getConcernSpans(concern));
  if (spans.length > 0) out.span = spans;
  return out;
}

/**
 * R5.2: Merge a duplicate group into one concern (or return unchanged when group size is 1).
 * @param {object[]} concerns
 * @param {number[]} indices
 * @returns {{ concern: object, survivorCount: number }}
 */
function mergeConcernGroup(concerns, indices) {
  if (!Array.isArray(indices) || indices.length <= 1) {
    const idx = Array.isArray(indices) && indices.length === 1 ? indices[0] : 0;
    return { concern: concerns[idx] ?? concerns[0], survivorCount: 1 };
  }

  let ordered = [...indices].sort((a, b) => a - b);
  const primaryIdx = ordered[0];
  const primary = concerns[primaryIdx];

  // R5.2(a): drop functionally-identical concerns under the same rule before numbering,
  // so "(i) ... (ii) ..." renders only when concerns are substantively different.
  const survivorMeta = [];
  const dedupedOrdered = [];
  for (const idx of ordered) {
    const c = concerns[idx];
    const concernCode = typeof c?.concernCode === "string" ? c.concernCode : "";
    const normalisedText = buildNormalisedConcernText(c);
    const isSubstantiveDuplicate = survivorMeta.some(
      (prev) =>
        prev.concernCode === concernCode &&
        concernTextSimilarity(prev.normalisedText, normalisedText) >=
          DUPLICATE_TEXT_SIMILARITY_THRESHOLD
    );
    if (!isSubstantiveDuplicate) {
      dedupedOrdered.push(idx);
      survivorMeta.push({ concernCode, normalisedText });
    }
  }
  ordered = dedupedOrdered;

  if (ordered.length === 1) {
    return { concern: emitSingleConcernShape(concerns[ordered[0]]), survivorCount: 1 };
  }

  const noteParts = [];
  const directionParts = [];
  const concernTextParts = [];
  const allSpans = [];
  let suggestedRewrite;

  for (let i = 0; i < ordered.length; i++) {
    const c = concerns[ordered[i]];
    const label = romanListLabel(i);
    const note = typeof c?.note === "string" ? c.note.trim() : "";
    if (note) noteParts.push(`${label} ${note}`);

    const direction =
      typeof c?.suggestedDirection === "string" ? c.suggestedDirection.trim() : "";
    if (direction) directionParts.push(`${label} ${direction}`);

    if (!suggestedRewrite) {
      const rw =
        typeof c?.suggestedRewrite === "string" ? c.suggestedRewrite.trim() : "";
      if (rw) suggestedRewrite = rw;
    }

    for (const s of getConcernSpans(c)) {
      allSpans.push(s);
    }

    let textPart = note ? ensureTerminalPunctuation(note) : "";
    if (direction) {
      const dirPart = ensureTerminalPunctuation(direction);
      textPart = textPart ? `${textPart} ${dirPart}` : dirPart;
    }
    if (textPart) concernTextParts.push(`${label} ${textPart}`);
  }

  const merged = {
    concernCode: primary?.concernCode,
    category: primary?.category,
    note: noteParts.join(" "),
  };

  if (directionParts.length > 0) {
    merged.suggestedDirection = directionParts.join(" ");
  }
  if (suggestedRewrite) {
    merged.suggestedRewrite = suggestedRewrite;
  }
  const dedupedSpans = dedupeIdenticalSpans(allSpans);
  if (dedupedSpans.length > 0) {
    merged.span = dedupedSpans;
  }
  if (concernTextParts.length > 0) {
    merged.concernText = concernTextParts.join(" ");
  }

  return { concern: merged, survivorCount: ordered.length };
}

/**
 * R5.2: Merge within-signal duplicate concerns; log Langfuse canary per merged group.
 * @param {object[]} concerns
 * @param {"editorial"|"compliance"} signalName
 * @param {object} [assemblyContext]
 */
function applyDuplicateMerge(concerns, signalName, assemblyContext = {}) {
  if (!Array.isArray(concerns) || concerns.length <= 1) return concerns;
  if (!concerns.some((c) => getConcernSpans(c).length > 0)) return concerns;

  const groups = detectDuplicateGroups(concerns);
  const indexToGroup = new Map();
  for (const group of groups) {
    const firstIdx = Math.min(...group);
    for (const idx of group) {
      indexToGroup.set(idx, { group, firstIdx });
    }
  }

  const traceId =
    typeof assemblyContext?.traceId === "string" ? assemblyContext.traceId : undefined;
  const statementIndex = Number.isFinite(assemblyContext?.statementIndex)
    ? assemblyContext.statementIndex
    : 0;
  const out = [];
  let mergedAny = false;

  for (let i = 0; i < concerns.length; i++) {
    const meta = indexToGroup.get(i);
    if (!meta) {
      out.push(concerns[i]);
      continue;
    }
    if (i !== meta.firstIdx) continue;
    const { concern: merged, survivorCount } = mergeConcernGroup(concerns, meta.group);
    if (meta.group.length > 1) {
      mergedAny = true;
      if (survivorCount === 1) {
        logCanaryScore({
          traceId,
          name: `${signalName}_duplicate_concerns_deduped`,
          value: 1,
          metadata: {
            signalName,
            originalGroupSize: meta.group.length,
            dedupedTo: 1,
            statementIndex,
            similarityThreshold: DUPLICATE_TEXT_SIMILARITY_THRESHOLD,
          },
        });
      } else if (survivorCount > 1) {
        logCanaryScore({
          traceId,
          name: `${signalName}_duplicate_concerns_merged`,
          value: 1,
          metadata: {
            signalName,
            mergedCount: survivorCount,
            resultingCode:
              typeof merged?.concernCode === "string" ? merged.concernCode : "",
            statementIndex,
            overlapThreshold: DUPLICATE_OVERLAP_THRESHOLD,
          },
        });
      }
    }
    out.push(merged);
  }

  return mergedAny ? out : concerns;
}

function applyConcernDuplicateMerges(editorialOut, assemblyContext) {
  const ctx = {
    traceId: assemblyContext?.traceId,
    statementIndex: assemblyContext?.statementIndex,
  };
  const editorialConcerns = applyDuplicateMerge(
    editorialOut.editorialConcerns,
    "editorial",
    ctx
  );
  const complianceConcerns = applyDuplicateMerge(
    editorialOut.complianceConcerns,
    "compliance",
    ctx
  );
  if (
    editorialConcerns === editorialOut.editorialConcerns &&
    complianceConcerns === editorialOut.complianceConcerns
  ) {
    return editorialOut;
  }
  return {
    ...editorialOut,
    editorialConcerns,
    complianceConcerns,
  };
}

function mapVerdictToSupportState(verdict) {
  if (verdict === "confirmed") return "supported";
  if (verdict === "partially_confirmed") return "partial";
  if (verdict === "conflicting") return "conflicting";
  if (verdict === "not_supported") return "not_supported";
  return "not_supported";
}

function mapSupportStateToDisplayVerdict(supportState) {
  if (supportState === "supported") return "supported_full";
  if (supportState === "partial") return "supported_partial";
  if (supportState === "conflicting") return "conflict";
  return "not_supported";
}

function mapSupportStateToConcernLevel(supportState) {
  if (supportState === "supported") return "none";
  if (supportState === "partial") return "moderate";
  if (supportState === "conflicting") return "high";
  return "high";
}

function safeEditorialDefaults() {
  return {
    editorialVerdict: "clean",
    editorialConcerns: [],
    editorialNote: null,
    editorialSuggestedDirection: null,
    editorialSuggestedRewrite: null,
    complianceVerdict: "clean",
    complianceConcerns: [],
    complianceNote: null,
    complianceSuggestedDirection: null,
    complianceSuggestedRewrite: null,
    suppressInQcWorkbench: false,
  };
}

function safeCard(statementIndex = 0) {
  const editorial = safeEditorialDefaults();
  const supportState = "not_supported";
  return {
    index: Number.isFinite(statementIndex) ? statementIndex : 0,
    statement: "",
    charStart: 0,
    charEnd: 0,
    supportState,
    hasConflict: false,
    primaryExcerpt: null,
    conflictExcerpt: null,
    evidenceSummary: "",
    supportRefIds: [],
    supportRefTitles: [],
    primaryRefId: null,
    primaryRefTitle: null,
    primarySourceOrigin: null,
    primaryExcerptText: null,
    primaryExcerptStart: null,
    primaryExcerptEnd: null,
    secondarySupportCount: 0,
    supportingReferenceIds: [],
    supportingReferenceTitles: [],
    hasRealExcerpt: false,
    conflictValues: null,
    reasoningHeadline: null,
    reasoningParagraph: null,
    displayMode: supportState,
    draftSpan: { startChar: 0, endChar: 0 },
    evidenceTrace: [],
    selectedExcerptReason: null,
    excerptMatchType: "none",
    suggestedImprovement: null,
    whyItMatters: null,
    displayVerdict: mapSupportStateToDisplayVerdict(supportState),
    concernLevel: mapSupportStateToConcernLevel(supportState),
    sentenceSubclaimCount: null,
    qcClaimId: null,
    originalClaimText: null,
    citationHovers: [],
    primaryExcerptTrusted: false,
    conflictEvidence: null,
    pipelineVersion: "v3",
    ...editorial,
  };
}

/**
 * @param {object} [assemblyContext]
 * @param {"v3"|"v4"} [assemblyContext.pipelineRoute]
 * @param {string} [assemblyContext.traceId]
 * @param {string} [assemblyContext.outputType]
 */
export async function assembleCard(statementEntry, statementIndex, assemblyContext = {}) {
  try {
    const entry = statementEntry && typeof statementEntry === "object" ? statementEntry : {};
    const verdict = entry?.verdictResult?.verdict;
    const supportState = mapVerdictToSupportState(verdict);
    const displayVerdict = mapSupportStateToDisplayVerdict(supportState);
    const concernLevel = mapSupportStateToConcernLevel(supportState);
    const hasConflict = entry?.verdictResult?.hasConflict === true;
    const primaryExcerpt = entry?.excerptResult?.primaryExcerpt ?? null;
    const conflictExcerpt = entry?.excerptResult?.conflictExcerpt ?? null;
    const confirmingMatches = Array.isArray(entry?.verdictResult?.confirmingMatches)
      ? entry.verdictResult.confirmingMatches
      : [];
    const supportRefIds = confirmingMatches
      .map((m) => m?.sourceIndex)
      .filter((v) => Number.isFinite(v));
    const supportRefTitles = confirmingMatches
      .map((m) => (typeof m?.sourceLabel === "string" ? m.sourceLabel : ""))
      .filter((v) => v.trim().length > 0);

    const editorialDefaults = safeEditorialDefaults();
    const editorial = entry?.editorialResult && typeof entry.editorialResult === "object"
      ? {
          editorialVerdict:
            typeof entry.editorialResult.editorialVerdict === "string"
              ? entry.editorialResult.editorialVerdict
              : editorialDefaults.editorialVerdict,
          editorialConcerns: Array.isArray(entry.editorialResult.editorialConcerns)
            ? entry.editorialResult.editorialConcerns
            : editorialDefaults.editorialConcerns,
          editorialNote:
            typeof entry.editorialResult.editorialNote === "string"
              ? entry.editorialResult.editorialNote
              : null,
          editorialSuggestedDirection:
            typeof entry.editorialResult.editorialSuggestedDirection === "string"
              ? entry.editorialResult.editorialSuggestedDirection
              : null,
          editorialSuggestedRewrite:
            typeof entry.editorialResult.editorialSuggestedRewrite === "string"
              ? entry.editorialResult.editorialSuggestedRewrite
              : null,
          complianceVerdict:
            typeof entry.editorialResult.complianceVerdict === "string"
              ? entry.editorialResult.complianceVerdict
              : editorialDefaults.complianceVerdict,
          complianceConcerns: Array.isArray(entry.editorialResult.complianceConcerns)
            ? entry.editorialResult.complianceConcerns
            : editorialDefaults.complianceConcerns,
          complianceNote:
            typeof entry.editorialResult.complianceNote === "string"
              ? entry.editorialResult.complianceNote
              : null,
          complianceSuggestedDirection:
            typeof entry.editorialResult.complianceSuggestedDirection === "string"
              ? entry.editorialResult.complianceSuggestedDirection
              : null,
          complianceSuggestedRewrite:
            typeof entry.editorialResult.complianceSuggestedRewrite === "string"
              ? entry.editorialResult.complianceSuggestedRewrite
              : null,
          suppressInQcWorkbench: entry.editorialResult.suppressInQcWorkbench === true,
        }
      : editorialDefaults;

    let editorialOut = editorial;
    const pipelineRoute = assemblyContext?.pipelineRoute === "v4" ? "v4" : "v3";
    if (
      pipelineRoute === "v4" &&
      verdict === "conflicting" &&
      Array.isArray(editorial.editorialConcerns) &&
      editorial.editorialConcerns.length > 0
    ) {
      const traceId = typeof assemblyContext?.traceId === "string" ? assemblyContext.traceId : undefined;
      const idx = Number.isFinite(statementIndex) ? statementIndex : 0;
      const original = editorial.editorialConcerns;
      const statement =
        typeof entry.statementText === "string" ? entry.statementText : "";
      const evidenceExplanation =
        typeof entry?.commentaryResult?.commentary === "string"
          ? entry.commentaryResult.commentary.trim()
          : "";
      const judgeConcerns = original.map((c, concernIndex) => ({
        index: concernIndex,
        ruleId: typeof c?.concernCode === "string" ? c.concernCode : "",
        concernText: buildConcernTextForJudge(c),
      }));
      const suppressIndices = await judgeEditorialDuplication({
        statementText: statement,
        evidenceExplanation,
        editorialConcerns: judgeConcerns,
        traceId,
        statementIndex: idx,
      });
      const suppressSet = new Set(suppressIndices);
      const kept = [];
      for (let i = 0; i < original.length; i++) {
        const c = original[i];
        if (suppressSet.has(i)) {
          logCanaryScore({
            traceId,
            name: "editorial_concern_suppressed_by_judgment",
            value: 1,
            metadata: {
              statementIndex: idx,
              suppressedRuleId: typeof c?.concernCode === "string" ? c.concernCode : "",
              concernText: truncateConcernText(buildConcernTextForJudge(c)),
            },
          });
          continue;
        }
        kept.push(c);
      }
      if (kept.length !== original.length) {
        editorialOut = {
          ...editorial,
          editorialConcerns: kept,
          editorialVerdict: recomputeV4EditorialVerdictFromConcerns(kept, assemblyContext?.outputType),
        };
      }
    }

    const stmtIdx = Number.isFinite(statementIndex) ? statementIndex : 0;
    editorialOut = applyConcernDuplicateMerges(editorialOut, {
      traceId: typeof assemblyContext?.traceId === "string" ? assemblyContext.traceId : undefined,
      statementIndex: stmtIdx,
    });

    const statement = typeof entry.statementText === "string" ? entry.statementText : "";
    const charStart = Number.isFinite(entry.startChar) ? entry.startChar : 0;
    const charEnd = Number.isFinite(entry.endChar) ? entry.endChar : charStart;
    const evidenceSummary =
      typeof entry?.commentaryResult?.commentary === "string" ? entry.commentaryResult.commentary : "";

    const primaryPassage = typeof primaryExcerpt?.passage === "string" ? primaryExcerpt.passage : "";
    const hasRealExcerpt = primaryPassage.trim().length > 0;

    return {
      index: Number.isFinite(statementIndex) ? statementIndex : 0,
      statement,
      charStart,
      charEnd,
      supportState,
      hasConflict,
      primaryExcerpt,
      conflictExcerpt,
      evidenceSummary,

      // Additional existing qcCard fields preserved for frontend compatibility.
      supportRefIds,
      supportRefTitles,
      primaryRefId: null,
      primaryRefTitle: primaryExcerpt?.sourceLabel ?? null,
      primarySourceOrigin: null,
      primaryExcerptText: hasRealExcerpt ? primaryPassage : null,
      primaryExcerptStart: null,
      primaryExcerptEnd: null,
      secondarySupportCount: 0,
      supportingReferenceIds: [],
      supportingReferenceTitles: [],
      hasRealExcerpt,
      conflictValues: null,
      reasoningHeadline: null,
      reasoningParagraph: evidenceSummary || null,
      displayMode: supportState,
      draftSpan: { startChar: charStart, endChar: charEnd },
      evidenceTrace: [],
      selectedExcerptReason: null,
      excerptMatchType: "none",
      suggestedImprovement: null,
      whyItMatters: null,
      displayVerdict,
      concernLevel,
      sentenceSubclaimCount: null,
      qcClaimId: null,
      originalClaimText: statement || null,
      citationHovers: [],
      primaryExcerptTrusted: false,
      conflictEvidence: null,
      pipelineVersion: "v3",
      ...editorialOut,
    };
  } catch {
    return safeCard(statementIndex);
  }
}
