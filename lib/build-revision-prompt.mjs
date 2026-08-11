/**
 * Pr9 — pure helpers for suggest-revision: gather Review/Assess concerns, build
 * whole-draft rewrite prompts, and parse softened-claim markers.
 * Does not touch QC pipeline / verdict / aggregation.
 */

import {
  getOutputTypeLabel,
  getPromptGuidance,
  getVisibilityLabel,
  normalizeOutputType,
  normalizeVisibility,
} from "./output-intent.js";
import { formatStyleGuideRulesForPrompt, resolveStyleGuide } from "./qc/style-guide.mjs";
import { normalizePgHouseStyleCharacters } from "./prompt-library/pg-commentary-cleanup.mjs";

/** Non-greedy {{span||note}} markers for softened evidence-gap claims. */
const SOFTENED_MARKER_RE = /\{\{([\s\S]*?)\|\|([\s\S]*?)\}\}/g;

function norm(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function cardFromRow(row) {
  if (row?.qcCard && typeof row.qcCard === "object") return row.qcCard;
  if (row && typeof row === "object" && ("statement" in row || "supportState" in row || "displayVerdict" in row)) {
    return row;
  }
  return {};
}

function statementTextFromRow(row, card) {
  const fromCard = typeof card.statement === "string" ? card.statement.trim() : "";
  if (fromCard) return fromCard;
  const fromRow = typeof row?.text === "string" ? row.text.trim() : "";
  return fromRow;
}

function statementIndexFromRow(row, card, rowIndex) {
  if (typeof card.index === "number" && Number.isFinite(card.index)) return card.index;
  if (typeof row?.index === "number" && Number.isFinite(row.index)) return row.index;
  return rowIndex;
}

/**
 * Resolve evidence gap kind from supportState (canonical) with displayVerdict fallback.
 * @returns {"no_support"|"conflicting"|"partially_confirmed"|"confirmed"|"skipped"|null}
 */
function resolveEvidenceKind(card) {
  const ss = norm(card.supportState);
  const dv = norm(card.displayVerdict);

  const fromSs = mapSupportState(ss);
  if (fromSs != null) return fromSs;
  return mapDisplayVerdict(dv);
}

function mapSupportState(ss) {
  if (!ss) return null;
  if (ss === "skipped") return "skipped";
  if (ss === "supported" || ss === "confirmed") return "confirmed";
  if (ss === "partial" || ss === "partially_confirmed") return "partially_confirmed";
  if (ss === "conflicting") return "conflicting";
  if (ss === "not_supported" || ss === "no_support") return "no_support";
  return null;
}

function mapDisplayVerdict(dv) {
  if (!dv) return null;
  if (dv === "not reviewed") return "skipped";
  if (dv === "supported_full") return "confirmed";
  if (dv === "supported_partial") return "partially_confirmed";
  if (dv === "conflict") return "conflicting";
  if (dv === "not_supported" || dv === "no_clear_support" || dv === "no_support") return "no_support";
  return null;
}

function isEditorialClean(card) {
  return norm(card.editorialVerdict) === "clean";
}

function isComplianceClean(card) {
  return norm(card.complianceVerdict) === "clean";
}

function extractExcerpt(card) {
  const pe = card.primaryExcerpt;
  if (pe && typeof pe === "object" && typeof pe.passage === "string" && pe.passage.trim()) {
    return pe.passage.trim();
  }
  if (typeof pe === "string" && pe.trim()) return pe.trim();
  if (typeof card.primaryExcerptText === "string" && card.primaryExcerptText.trim()) {
    return card.primaryExcerptText.trim();
  }
  return "";
}

function extractEvidenceReason(card) {
  const summary = typeof card.evidenceSummary === "string" ? card.evidenceSummary.trim() : "";
  const reasoning = typeof card.reasoningParagraph === "string" ? card.reasoningParagraph.trim() : "";
  if (summary && reasoning && summary !== reasoning) return `${summary}\n${reasoning}`;
  return summary || reasoning || "";
}

function editorialRule(concern) {
  const rule =
    (typeof concern.ruleId === "string" && concern.ruleId.trim()) ||
    (typeof concern.concernCode === "string" && concern.concernCode.trim()) ||
    (typeof concern.rule === "string" && concern.rule.trim()) ||
    "";
  return rule;
}

function collectEditorialConcerns(card) {
  const list = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
  const out = [];
  for (const concern of list) {
    if (!concern || typeof concern !== "object") continue;
    const rule = editorialRule(concern);
    const note = typeof concern.note === "string" ? concern.note.trim() : "";
    const suggestedDirection =
      typeof concern.suggestedDirection === "string" ? concern.suggestedDirection.trim() : "";
    if (!rule && !note && !suggestedDirection) continue;
    out.push({ rule, note, suggestedDirection });
  }
  return out;
}

function collectComplianceConcerns(card) {
  const list = Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [];
  const out = [];
  for (const concern of list) {
    if (!concern || typeof concern !== "object") continue;
    const note = typeof concern.note === "string" ? concern.note.trim() : "";
    const suggestedDirection =
      typeof concern.suggestedDirection === "string" ? concern.suggestedDirection.trim() : "";
    if (!note && !suggestedDirection) continue;
    out.push({ note, suggestedDirection });
  }
  return out;
}

/**
 * Deterministically collect per-statement concerns from analysisResult.statements (or qcCard rows).
 * Skips confirmed-clean statements. Stable shape for prompt assembly / unit tests.
 *
 * @param {Array} statements
 * @returns {Array<{
 *   statementIndex: number,
 *   statementText: string,
 *   evidence: null | { verdict: string, excerpt: string, reason: string },
 *   editorial: Array<{ rule: string, note: string, suggestedDirection: string }>,
 *   compliance: Array<{ note: string, suggestedDirection: string }>,
 * }>}
 */
export function gatherConcerns(statements) {
  const list = Array.isArray(statements) ? statements : [];
  const concerns = [];

  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const card = cardFromRow(row);
    const evidenceKind = resolveEvidenceKind(card);
    const evidenceIsGap =
      evidenceKind === "no_support" ||
      evidenceKind === "conflicting" ||
      evidenceKind === "partially_confirmed";

    const editorial = isEditorialClean(card) ? [] : collectEditorialConcerns(card);
    const compliance = isComplianceClean(card) ? [] : collectComplianceConcerns(card);

    if (!evidenceIsGap && editorial.length === 0 && compliance.length === 0) {
      continue;
    }

    const statementText = statementTextFromRow(row, card);
    /** @type {null | { verdict: string, excerpt: string, reason: string }} */
    let evidence = null;
    if (evidenceIsGap) {
      evidence = {
        verdict: evidenceKind,
        excerpt: extractExcerpt(card),
        reason: extractEvidenceReason(card),
      };
    }

    concerns.push({
      statementIndex: statementIndexFromRow(row, card, i),
      statementText,
      evidence,
      editorial,
      compliance,
    });
  }

  return concerns;
}

function resolveHouseStyleOpts(opts = {}) {
  const rawOutputType = typeof opts.outputType === "string" ? opts.outputType.trim() : "";
  const rawRequiredVersion =
    typeof opts.requiredVersion === "string" ? opts.requiredVersion.trim() : "";

  let outputType = null;
  let visibility = null;

  if (rawOutputType) {
    outputType = normalizeOutputType(rawOutputType);
  }
  if (rawRequiredVersion) {
    const upper = rawRequiredVersion.toUpperCase().replace(/-/g, "_");
    if (upper === "INTERNAL") {
      visibility = "COMPLETE";
    } else {
      visibility = normalizeVisibility(rawRequiredVersion);
    }
  }

  return { outputType, visibility, rawOutputType, rawRequiredVersion };
}

function formatConcernsBlock(concerns) {
  const list = Array.isArray(concerns) ? concerns : [];
  if (list.length === 0) {
    return "(No specific card-level concerns were collected. Preserve meaning; do not invent issues.)";
  }

  const blocks = [];
  for (const item of list) {
    const lines = [];
    const idx = item.statementIndex;
    const stmt = item.statementText || "";
    lines.push(`### Statement [${idx}]`);
    lines.push(`Text: ${stmt || "(empty)"}`);

    if (item.evidence) {
      lines.push(`Evidence gap (${item.evidence.verdict}):`);
      if (item.evidence.reason) lines.push(`  Reason: ${item.evidence.reason}`);
      if (item.evidence.excerpt) lines.push(`  Source excerpt: ${item.evidence.excerpt}`);
      if (!item.evidence.reason && !item.evidence.excerpt) {
        lines.push("  (No excerpt/reason available — soften or qualify the claim without inventing support.)");
      }
    }

    if (Array.isArray(item.editorial) && item.editorial.length > 0) {
      lines.push("Editorial / style concerns:");
      for (const c of item.editorial) {
        const rule = c.rule ? `rule=${c.rule}; ` : "";
        const note = c.note ? `note=${c.note}; ` : "";
        const dir = c.suggestedDirection ? `suggestedDirection=${c.suggestedDirection}` : "suggestedDirection=(none)";
        lines.push(`  - ${rule}${note}${dir}`);
      }
    }

    if (Array.isArray(item.compliance) && item.compliance.length > 0) {
      lines.push("Compliance concerns:");
      for (const c of item.compliance) {
        const note = c.note ? `note=${c.note}; ` : "";
        const dir = c.suggestedDirection ? `suggestedDirection=${c.suggestedDirection}` : "suggestedDirection=(none)";
        lines.push(`  - ${note}${dir}`);
      }
    }

    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

function buildResolvedStyleGuideBlock(outputType) {
  // resolveStyleGuide defaults output slug to reporting_commentary when unset — same as Review.
  const rules = resolveStyleGuide(outputType ? { outputType } : {});
  return formatStyleGuideRulesForPrompt(rules);
}

/**
 * Parse softened evidence-gap markers of the form {{span||note}} (non-greedy).
 * Returns clean text (delimiters stripped) and markers with offsets into clean text.
 *
 * @param {string} text
 * @returns {{ revisedDraft: string, markers: Array<{ start: number, end: number, note: string }> }}
 */
export function parseSoftenedMarkers(text) {
  const source = typeof text === "string" ? text : "";
  let revisedDraft = "";
  /** @type {Array<{ start: number, end: number, note: string }>} */
  const markers = [];
  let lastIndex = 0;
  SOFTENED_MARKER_RE.lastIndex = 0;
  let match;
  while ((match = SOFTENED_MARKER_RE.exec(source)) !== null) {
    revisedDraft += source.slice(lastIndex, match.index);
    const span = match[1];
    const note = match[2];
    const start = revisedDraft.length;
    revisedDraft += span;
    const end = revisedDraft.length;
    markers.push({ start, end, note });
    lastIndex = match.index + match[0].length;
  }
  revisedDraft += source.slice(lastIndex);
  return { revisedDraft, markers };
}

/**
 * 1:1 house-style char normalize with input→output index map for marker remap.
 * @param {string} text
 * @returns {{ text: string, map: number[] }}
 */
function normalizeWithIndexMap(text) {
  const source = typeof text === "string" ? text : "";
  let out = "";
  /** @type {number[]} */
  const map = new Array(source.length);
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    let next = ch;
    if (ch === "\u201C" || ch === "\u201D") next = '"';
    else if (ch === "\u2018" || ch === "\u2019") next = "'";
    else if (ch === "\u2013" || ch === "\u2014") next = "-";
    map[i] = out.length;
    out += next;
  }
  return { text: out, map };
}

/**
 * Apply normalizePgHouseStyleCharacters to clean revised draft and remap marker offsets.
 *
 * @param {{ revisedDraft: string, markers: Array<{ start: number, end: number, note: string }> }} parsed
 * @returns {{ revisedDraft: string, markers: Array<{ start: number, end: number, note: string }> }}
 */
export function applyHouseStyleCharNormalizeToRevision(parsed) {
  const draft = typeof parsed?.revisedDraft === "string" ? parsed.revisedDraft : "";
  const incoming = Array.isArray(parsed?.markers) ? parsed.markers : [];
  const { text, map } = normalizeWithIndexMap(draft);

  const markers = incoming.map((m) => {
    const startIn = typeof m.start === "number" && Number.isFinite(m.start) ? m.start : 0;
    const endIn = typeof m.end === "number" && Number.isFinite(m.end) ? m.end : startIn;
    const start = startIn >= draft.length ? text.length : map[Math.max(0, startIn)] ?? text.length;
    const end =
      endIn <= startIn
        ? start
        : endIn > draft.length
          ? text.length
          : (map[endIn - 1] ?? text.length - 1) + 1;
    return {
      start,
      end,
      note: normalizePgHouseStyleCharacters(typeof m.note === "string" ? m.note : ""),
    };
  });

  return { revisedDraft: text, markers };
}

const TERMINAL_PUNCT_RE = /[.!?]$/;

function nextNonSpaceIndex(text, from) {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  return i;
}

/**
 * After delimiter strip: if a marker span ends a sentence but lacks terminal punctuation,
 * insert a period immediately after the span (punctuation stays outside the marker).
 * Conservative — only when the next non-space char is an uppercase letter, or end-of-text.
 *
 * @param {{ revisedDraft: string, markers: Array<{ start: number, end: number, note: string }> }} parsed
 * @returns {{ revisedDraft: string, markers: Array<{ start: number, end: number, note: string }> }}
 */
export function ensureMarkerSentenceTerminalPunctuation(parsed) {
  let draft = typeof parsed?.revisedDraft === "string" ? parsed.revisedDraft : "";
  const markers = Array.isArray(parsed?.markers)
    ? parsed.markers.map((m) => ({
        start: m.start,
        end: m.end,
        note: typeof m.note === "string" ? m.note : "",
      }))
    : [];

  // Process later markers first so earlier offsets stay valid when inserting.
  const order = markers
    .map((m, index) => ({ index, end: m.end }))
    .sort((a, b) => b.end - a.end);

  for (const { index } of order) {
    const marker = markers[index];
    if (!marker || marker.end < marker.start) continue;
    const span = draft.slice(marker.start, marker.end);
    if (!span || TERMINAL_PUNCT_RE.test(span)) continue;

    const nextIdx = nextNonSpaceIndex(draft, marker.end);
    if (nextIdx < draft.length) {
      const nextCh = draft[nextIdx];
      if (/[.!?]/.test(nextCh)) continue;
      if (!/[A-Z]/.test(nextCh)) continue;
    }
    // else: end-of-text → insert

    const insertAt = marker.end;
    draft = `${draft.slice(0, insertAt)}.${draft.slice(insertAt)}`;
    for (let j = 0; j < markers.length; j++) {
      if (j === index) continue;
      if (markers[j].start >= insertAt) {
        markers[j].start += 1;
        markers[j].end += 1;
      } else if (markers[j].end > insertAt) {
        markers[j].end += 1;
      }
    }
    // Current marker end unchanged — period sits outside the underlined span.
  }

  return { revisedDraft: draft, markers };
}

/**
 * Parse markers → sentence-boundary period safeguard → char-normalize (offsets remapped).
 * @param {string} rawLlmText
 * @returns {{ revisedDraft: string, markers: Array<{ start: number, end: number, note: string }> }}
 */
export function finalizeSuggestRevisionText(rawLlmText) {
  const parsed = parseSoftenedMarkers(rawLlmText);
  const withPunct = ensureMarkerSentenceTerminalPunctuation(parsed);
  return applyHouseStyleCharNormalizeToRevision(withPunct);
}

/**
 * Build a temp-0 whole-draft revision instruction. Pure; no LLM.
 *
 * @param {string} draftText
 * @param {ReturnType<typeof gatherConcerns>} concerns
 * @param {{ outputType?: string, requiredVersion?: string }} [opts]
 * @returns {string}
 */
export function buildRevisionPrompt(draftText, concerns, opts = {}) {
  const draft = typeof draftText === "string" ? draftText : "";
  const { outputType, visibility, rawOutputType, rawRequiredVersion } = resolveHouseStyleOpts(opts);

  const houseStyleLines = [];
  if (outputType) {
    houseStyleLines.push(
      `- Output type: ${getOutputTypeLabel(outputType)} (${outputType}). Respect the house style for this format.`
    );
  } else if (rawOutputType) {
    houseStyleLines.push(`- Output type: ${rawOutputType}. Respect the house style implied by this format.`);
  }
  if (visibility) {
    const visLabel =
      rawRequiredVersion && rawRequiredVersion.toUpperCase() === "INTERNAL"
        ? "Internal (complete)"
        : getVisibilityLabel(visibility);
    houseStyleLines.push(
      `- Required version / visibility: ${visLabel} (${visibility}). Honour disclosure and register constraints for this version.`
    );
  }
  if (outputType && visibility) {
    const guidance = getPromptGuidance(outputType, visibility);
    if (guidance) houseStyleLines.push(`- Format guidance: ${guidance}`);
  }

  const intentBlock =
    houseStyleLines.length > 0
      ? `OUTPUT INTENT:\n${houseStyleLines.join("\n")}`
      : "OUTPUT INTENT: Preserve the author's existing register and format; no outputType/requiredVersion was supplied.";

  const styleGuideBlock = buildResolvedStyleGuideBlock(outputType);

  return `You are revising a reviewed draft based on QC Review findings. Rewrite the ENTIRE draft as one holistic revision that addresses the concerns below.

GUARDRAILS (must obey):
1. Apply the mechanical / editorial / compliance / style fixes. When a concern includes suggestedDirection, follow that direction. Apply those fixes silently — do NOT wrap them in markers.
2. Evidence gaps (no_support / conflicting / partially_confirmed):
   - NEVER fabricate or invent supporting facts or sources.
   - Softening must be surgical. When a statement is conflicting or partially supported because a SPECIFIC element is unsupported (an attribution, one figure, one claim), soften/flag ONLY that unsupported element. Use the source excerpt / evidenceSummary to identify what the source DOES support and KEEP those supported facts accurate (reformatted to house style if needed). Do NOT vague out or hedge a supported fact because another part of the same statement is unsupported.
   - Concretely: if the source confirms the amount but not the actor, keep the amount (e.g. "up to USD 7 million") and soften only the actor. Never replace a supported specific figure with a vague magnitude (e.g. "mid-single-digit million").
   - For an unsupported or conflicting SPECIFIC figure or fact that the source does NOT confirm: soften that element using the MOST specific characterisation the SOURCE supports (from the excerpt / evidenceSummary), not maximum vagueness. Preserve supportable precision; do not over-generalise. Example: a source showing ~18% growth → "double-digit growth", NOT "materially" / "material growth". DO NOT substitute a value from the source for an author figure that lacks support. Never adopt an unsupported source number as the author's.
   - WRAP only the reviewer-confirm (softened unsupported) element in a flagged-span marker (see MARKERS below). Supported facts stay unmarked and accurate.
   - Do NOT silently delete a substantive claim.
3. Preserve the author's voice, meaning, and structure. Write in natural, professional prose appropriate to the outputType — read as an editor's clean revision, not a checklist applied. Avoid clunky or mechanical hedges (e.g. "investors may see"); hedge the substance with idiomatic phrasing (e.g. "is expected to", "aims to"), not awkward constructions.
4. Preserve the draft's natural paragraph structure; do NOT put each sentence on its own line unless the original did.
5. The ENTIRE revised draft must comply with HOUSE STYLE RULES below (not only the flagged statements) — including currency_format (ISO code + "million"/"billion", not symbol/"m"), thousand_separator (high comma / apostrophe), number_spelling, first_person_plural where it applies to this output type, and hyperbole_vs_qualitative.
6. Output ONLY the full revised draft text — no commentary, no preamble, no markdown fences, no bullet summary of changes. Markers may appear only as specified below.

MARKERS (softened evidence gaps ONLY):
- Wrap each softened "reviewer must confirm" claim as: {{softened text||short reviewer note}}
- The {{…||…}} delimiter wraps ONLY the claim text. Sentence-ending punctuation (. ! ?) stays OUTSIDE the delimiter (e.g. {{claim||note}}. Next sentence…).
- Every sentence in the revised draft must end with correct terminal punctuation.
- Example: {{Acme Capital delivered double-digit revenue growth year on year||draft stated 40% / $120m; sources support ~18% to about $95m — confirm}}. Trailing prose continues normally.
- The note should briefly name what the draft claimed vs what sources support (without adopting the source figure into the prose).
- Do NOT mark mechanical, editorial, or compliance fixes — those are applied silently with no markers.

${intentBlock}

HOUSE STYLE RULES (v4 Review canon — comply across the whole draft):
${styleGuideBlock}

CONCERNS TO ADDRESS:
${formatConcernsBlock(concerns)}

DRAFT TO REVISE:
<<<DRAFT
${draft}
DRAFT>>>

Return only the full revised draft (with {{…||…}} markers only where evidence-gap claims were softened).`.trim();
}
