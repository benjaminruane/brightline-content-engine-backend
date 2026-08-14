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

const DELETION_VERB_RE = /^(please\s+)?(remove|cut|delete|drop|strip|omit)\b/i;
const STRIP_VERB_RE = /^(please\s+)?(remove|strip|delete|drop|anonymise|anonymize)\b/i;
const ADD_VERB_RE =
  /^(please\s+)?(add|include|insert|disclose|qualify|append)\b/i;

const COMPLIANCE_ADD_CODES = new Set([
  "return_figure_gross_net_qualifier_missing",
  "forward_looking_statement_without_qualifier",
  "expected_disclosure_language_absent_on_public",
  "material_omission",
]);
const COMPLIANCE_STRIP_CODES = new Set([
  "precise_confidential_detail_in_public_version",
  "named_individual_attribution_in_public_content",
]);
const COMPLIANCE_CLAIM_CODES = new Set([
  "promissory_or_guaranteed_language",
  "comparative_claim_without_basis",
  "selective_presentation_of_data",
  "regulatory_prohibited_language",
]);

function isDeletionDirection(suggestedDirection) {
  const dir = typeof suggestedDirection === "string" ? suggestedDirection.trim() : "";
  return DELETION_VERB_RE.test(dir);
}

function isStripDirection(suggestedDirection) {
  const dir = typeof suggestedDirection === "string" ? suggestedDirection.trim() : "";
  return STRIP_VERB_RE.test(dir);
}

function isAddDirection(suggestedDirection) {
  const dir = typeof suggestedDirection === "string" ? suggestedDirection.trim() : "";
  return ADD_VERB_RE.test(dir);
}

function isStyleGuideConcern(concern, rule) {
  const cat = norm(concern?.category);
  if (cat === "style_guide" || cat === "style") return true;
  // v4 style ids sometimes arrive without category after older clients.
  const r = norm(rule);
  return (
    r === "defined_term_capitalisation" ||
    r === "active_voice_preference" ||
    r === "hyperbole_vs_qualitative" ||
    r === "register_consistency" ||
    r === "sentence_structure_clarity" ||
    r === "thousand_separator" ||
    r === "currency_format" ||
    r === "em_dash" ||
    r === "oxford_comma" ||
    r === "first_person_plural" ||
    r === "smart_quotes" ||
    r === "english_variant" ||
    r === "number_spelling" ||
    r === "percentage_notation" ||
    r === "date_format"
  );
}

function isPublicPublicationState(state) {
  const s = norm(state);
  return s === "public" || s === "published_external";
}

/**
 * Optional request `sources: [{ index, publicationState }]` → index→state map.
 * Returns null when sources is absent (no downgrade). Empty array → empty map.
 *
 * @param {unknown} sources
 * @returns {Record<number, string>|null}
 */
export function buildPublicationMap(sources) {
  if (!Array.isArray(sources)) return null;
  const map = Object.create(null);
  for (const s of sources) {
    if (!s || typeof s !== "object") continue;
    const idx = Number(s.index);
    if (!Number.isFinite(idx)) continue;
    const state = typeof s.publicationState === "string" ? s.publicationState.trim() : "";
    map[idx] = state;
  }
  return map;
}

function statementHasPublicSupportingSource(card, publicationMap) {
  if (!publicationMap) return false;
  const ids = Array.isArray(card.supportRefIds) ? card.supportRefIds : [];
  for (const id of ids) {
    const idx = Number(id);
    if (!Number.isFinite(idx)) continue;
    if (isPublicPublicationState(publicationMap[idx])) return true;
  }
  return false;
}

function extractSourceLabel(card) {
  const pe = card.primaryExcerpt;
  if (pe && typeof pe === "object" && typeof pe.sourceLabel === "string" && pe.sourceLabel.trim()) {
    return pe.sourceLabel.trim();
  }
  const ce = card.conflictExcerpt;
  if (ce && typeof ce === "object" && typeof ce.sourceLabel === "string" && ce.sourceLabel.trim()) {
    return ce.sourceLabel.trim();
  }
  if (typeof card.primaryRefTitle === "string" && card.primaryRefTitle.trim()) {
    return card.primaryRefTitle.trim();
  }
  return "";
}

function extractConflictExcerptPassage(card) {
  const ce = card.conflictExcerpt;
  if (ce && typeof ce === "object" && typeof ce.passage === "string" && ce.passage.trim()) {
    return ce.passage.trim();
  }
  if (typeof ce === "string" && ce.trim()) return ce.trim();
  return "";
}

/**
 * Source-side conflict detail already on the card: conflicting supportSpan passage
 * (fallback: conflictExcerpt, then primary excerpt) + optional source label.
 * Pass the passage through — do not parse figures here.
 */
function extractConflictSourceDetail(card) {
  const spans = Array.isArray(card.supportSpans) ? card.supportSpans : [];
  for (const span of spans) {
    if (!span || typeof span !== "object") continue;
    if (norm(span.classification) !== "conflicting") continue;
    const passage = typeof span.passage === "string" ? span.passage.trim() : "";
    if (!passage) continue;
    const spanLabel = typeof span.sourceLabel === "string" ? span.sourceLabel.trim() : "";
    return { sourcePassage: passage, sourceLabel: spanLabel || extractSourceLabel(card) };
  }

  const conflictPassage = extractConflictExcerptPassage(card);
  if (conflictPassage) {
    return { sourcePassage: conflictPassage, sourceLabel: extractSourceLabel(card) };
  }

  return { sourcePassage: extractExcerpt(card), sourceLabel: extractSourceLabel(card) };
}

function evidenceKindTag(evidenceKind) {
  if (evidenceKind === "conflicting") return "conflict";
  if (evidenceKind === "no_support") return "unsupported";
  if (evidenceKind === "partially_confirmed") return "partial";
  return null;
}

function classifyEditorialKind(concern, rule, suggestedDirection) {
  if (isStyleGuideConcern(concern, rule)) return "craft";
  if (norm(rule) === "materiality" || isDeletionDirection(suggestedDirection)) return "deletion";
  return "craft";
}

function classifyComplianceKind(concern) {
  const code = norm(editorialRule(concern));
  const dir = typeof concern.suggestedDirection === "string" ? concern.suggestedDirection.trim() : "";
  if (COMPLIANCE_STRIP_CODES.has(code)) return "compliance_strip";
  if (COMPLIANCE_ADD_CODES.has(code)) return "compliance_add";
  if (COMPLIANCE_CLAIM_CODES.has(code)) return "compliance_claim";
  if (isStripDirection(dir)) return "compliance_strip";
  if (isAddDirection(dir)) return "compliance_add";
  return "compliance_claim";
}

function collectEditorialConcerns(card) {
  const list = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
  const out = [];
  for (const concern of list) {
    if (!concern || typeof concern !== "object") continue;
    const rule = editorialRule(concern);
    if (norm(rule) === "underreach_hedging") continue;
    const note = typeof concern.note === "string" ? concern.note.trim() : "";
    const suggestedDirection =
      typeof concern.suggestedDirection === "string" ? concern.suggestedDirection.trim() : "";
    if (!rule && !note && !suggestedDirection) continue;
    const kind = classifyEditorialKind(concern, rule, suggestedDirection);
    out.push({ kind, rule, note, suggestedDirection });
  }
  return out;
}

function collectComplianceConcerns(card, publicationMap) {
  const list = Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [];
  const out = [];
  for (const concern of list) {
    if (!concern || typeof concern !== "object") continue;
    const note = typeof concern.note === "string" ? concern.note.trim() : "";
    const suggestedDirection =
      typeof concern.suggestedDirection === "string" ? concern.suggestedDirection.trim() : "";
    if (!note && !suggestedDirection) continue;
    const rule = editorialRule(concern);
    const kind = classifyComplianceKind(concern);
    const item = { kind, note, suggestedDirection };
    if (rule) item.rule = rule;
    if (kind === "compliance_strip" && statementHasPublicSupportingSource(card, publicationMap)) {
      item.publicSourceDowngrade = true;
    }
    out.push(item);
  }
  return out;
}

/**
 * Deterministically collect per-statement concerns from analysisResult.statements (or qcCard rows).
 * Skips confirmed-clean statements. Stable shape for prompt assembly / unit tests.
 *
 * @param {Array} statements
 * @param {Record<number, string>|null} [publicationMap] index → publicationState; null = no downgrade
 * @returns {Array<{
 *   statementIndex: number,
 *   statementText: string,
 *   evidence: null | {
 *     verdict: string,
 *     excerpt: string,
 *     reason: string,
 *     kind?: "conflict"|"unsupported"|"partial",
 *     sourcePassage?: string,
 *     sourceLabel?: string,
 *   },
 *   editorial: Array<{ kind: "deletion"|"craft", rule: string, note: string, suggestedDirection: string }>,
 *   compliance: Array<{
 *     kind: "compliance_add"|"compliance_claim"|"compliance_strip",
 *     note: string,
 *     suggestedDirection: string,
 *     rule?: string,
 *     publicSourceDowngrade?: boolean,
 *   }>,
 * }>}
 */
export function gatherConcerns(statements, publicationMap = null) {
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
    const compliance = isComplianceClean(card) ? [] : collectComplianceConcerns(card, publicationMap);

    if (!evidenceIsGap && editorial.length === 0 && compliance.length === 0) {
      continue;
    }

    const statementText = statementTextFromRow(row, card);
    /** @type {null | {
     *   verdict: string,
     *   excerpt: string,
     *   reason: string,
     *   kind?: "conflict"|"unsupported"|"partial",
     *   sourcePassage?: string,
     *   sourceLabel?: string,
     * }} */
    let evidence = null;
    if (evidenceIsGap) {
      const kind = evidenceKindTag(evidenceKind);
      evidence = {
        verdict: evidenceKind,
        excerpt: extractExcerpt(card),
        reason: extractEvidenceReason(card),
      };
      if (kind) evidence.kind = kind;
      if (kind === "conflict") {
        const detail = extractConflictSourceDetail(card);
        evidence.sourcePassage = detail.sourcePassage;
        evidence.sourceLabel = detail.sourceLabel;
      }
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
      const kindTag = item.evidence.kind ? ` [kind=${item.evidence.kind}]` : "";
      lines.push(`Evidence gap (${item.evidence.verdict})${kindTag}:`);
      if (item.evidence.reason) lines.push(`  Reason: ${item.evidence.reason}`);
      if (item.evidence.kind === "conflict") {
        if (item.evidence.sourceLabel) lines.push(`  Source: ${item.evidence.sourceLabel}`);
        if (item.evidence.sourcePassage) {
          lines.push(`  Conflicting source passage: ${item.evidence.sourcePassage}`);
        }
      }
      if (item.evidence.excerpt && item.evidence.excerpt !== item.evidence.sourcePassage) {
        lines.push(`  Source excerpt: ${item.evidence.excerpt}`);
      } else if (item.evidence.excerpt && item.evidence.kind !== "conflict") {
        lines.push(`  Source excerpt: ${item.evidence.excerpt}`);
      }
      if (!item.evidence.reason && !item.evidence.excerpt && !item.evidence.sourcePassage) {
        lines.push("  (No excerpt/reason available — soften or qualify the claim without inventing support.)");
      }
    }

    if (Array.isArray(item.editorial) && item.editorial.length > 0) {
      lines.push("Editorial / style concerns:");
      for (const c of item.editorial) {
        const kind = c.kind ? `kind=${c.kind}; ` : "";
        const rule = c.rule ? `rule=${c.rule}; ` : "";
        const note = c.note ? `note=${c.note}; ` : "";
        const dir = c.suggestedDirection ? `suggestedDirection=${c.suggestedDirection}` : "suggestedDirection=(none)";
        lines.push(`  - ${kind}${rule}${note}${dir}`);
      }
    }

    if (Array.isArray(item.compliance) && item.compliance.length > 0) {
      lines.push("Compliance concerns:");
      for (const c of item.compliance) {
        const kind = c.kind ? `kind=${c.kind}; ` : "";
        const downgrade = c.publicSourceDowngrade
          ? "publicSourceDowngrade=keep-and-flag; ACTION=KEEP-AND-FLAG (do not strip); "
          : c.kind === "compliance_strip"
            ? "ACTION=STRIP-AND-FLAG; "
            : "";
        const rule = c.rule ? `rule=${c.rule}; ` : "";
        const note = c.note ? `note=${c.note}; ` : "";
        const dir = c.suggestedDirection ? `suggestedDirection=${c.suggestedDirection}` : "suggestedDirection=(none)";
        lines.push(`  - ${kind}${downgrade}${rule}${note}${dir}`);
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

/**
 * Deterministic note-style safeguard: trim, capitalise first letter, ensure terminal punctuation.
 * Does not alter revised text or marker offsets — notes only.
 *
 * @param {string} note
 * @returns {string}
 */
export function normalizeMarkerNoteText(note) {
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (!trimmed) return "";
  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  if (TERMINAL_PUNCT_RE.test(capitalised)) return capitalised;
  return `${capitalised}.`;
}

function applyNormalizeMarkerNotes(parsed) {
  const draft = typeof parsed?.revisedDraft === "string" ? parsed.revisedDraft : "";
  const incoming = Array.isArray(parsed?.markers) ? parsed.markers : [];
  const markers = incoming.map((m) => ({
    start: m.start,
    end: m.end,
    note: normalizeMarkerNoteText(m.note),
  }));
  return { revisedDraft: draft, markers };
}

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
 * Parse markers → note-style normalize → sentence-boundary period safeguard → char-normalize (offsets remapped).
 * @param {string} rawLlmText
 * @returns {{ revisedDraft: string, markers: Array<{ start: number, end: number, note: string }> }}
 */
export function finalizeSuggestRevisionText(rawLlmText) {
  const parsed = parseSoftenedMarkers(rawLlmText);
  const notesNormalized = applyNormalizeMarkerNotes(parsed);
  const withPunct = ensureMarkerSentenceTerminalPunctuation(notesNormalized);
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

GLOBAL GUARDRAILS (must obey):
- NO SCAFFOLDING (overrides outputType): Revise ONLY the provided draft text. Do NOT add or invent salutations, sign-offs, headers, datelines, "FOR IMMEDIATE RELEASE", bracketed placeholders ([Company Name], [City], [Executive Name], etc.), or restructure the text into any document template — even when outputType is press_release or investor_letter. Preserve the draft's existing structure and length; change only what the findings require. If the draft is a fragment, revise the fragment as given.
- SUPPORTED figures: never change the author's number. Source figures may enter the prose only for kind "conflict", kind "partial", or kind "unsupported" when the provided source text STATES that value — and those replacements must be flagged.
- Never FABRICATE: only use values that appear in the provided source text. Do not invent facts, figures, or sources.
- Never STRENGTHEN a claim (do not make it more confident or assertive than the draft).
- NAMED ENTITIES on an EVIDENCE finding (kind "unsupported" or "conflict" attribution — e.g. the source does not name the firm): KEEP the author's name and wrap it in a marker. NEVER anonymise evidence-driven names. (Distinct from kind "compliance_strip", which may anonymise on public versions.)
- Marker notes: every note must be a complete, plain-English sentence, capitalised, ending in a period. No fragments, no lowercase starts, no jargon.
- Preserve the author's voice, meaning, and structure except where a kind below requires a change. Write in natural, professional prose. LESS HEDGING: soften only the unsupported/overreaching element; keep supported facts crisp and direct. Avoid stacked hedges ("appears to be…", "may potentially…"). Prefer plain verbs ("targets", "is expected to").
- Preserve the draft's natural paragraph structure; do NOT put each sentence on its own line unless the original did.
- The ENTIRE revised draft must comply with HOUSE STYLE RULES below (not only the flagged statements) — including currency_format (ISO code + "million"/"billion", not symbol/"m"), thousand_separator (high comma / apostrophe), number_spelling, first_person_plural where it applies to this output type, and hyperbole_vs_qualitative.
- Output ONLY the full revised draft text — no commentary, no preamble, no markdown fences, no bullet summary of changes.

KIND HANDLING (apply by kind= on each concern):
a) kind "conflict": If the source passage states a competing value, the revised PROSE must carry that source value (house-style), not a vague hedge. Example: source "approximately 18% … about $95m" → write "approximately 18% growth to about USD 95 million", NEVER "material growth". Wrap the corrected element in a marker. The note must name the change and the source, e.g. "Changed from USD 50 to USD 45 to match Shopify (text).txt — confirm before publishing." Hedge or drop the precise number ONLY when the source states no replacement value. Never assert the contradicted draft value.
b) kind "unsupported": If the source STATES a specific value, put that source value in the prose (house-style) and flag it — same figure rule as conflict/partial. Soften WITHOUT a number only when the source is silent or vague (true unsupported). Wrap the revised element in a marker. Never invent a figure the source does not state.
c) kind "partial": Keep the CONFIRMED portion unchanged. If the source STATES a specific value for the unsupported element, inject that source value into the prose (house-style) and wrap THAT element in a marker (e.g. "around USD 1.9 billion"). Soften without a number only when the source is silent or vague. Do not vague out a supported fact because another part of the same statement is unsupported.
d) kind "deletion": Do NOT delete. Keep the author's text and wrap the flagged phrase in a marker: "Review flagged this as <reason> — consider cutting." The author decides whether to cut.
e) kind "craft" (editorial craft + style_guide): APPLY SILENTLY. NEVER emit a {{text||note}} marker for a craft edit. Meaning-preserving mechanical / style / craft fixes only. The track-changes diff already shows them. Follow suggestedDirection when it does not delete substance. Only conflict / unsupported / partial / deletion / compliance_add / compliance_claim / compliance_strip may emit markers.
f) kind "compliance_add": Add the required qualifier or disclaimer and wrap the added/qualified span in a marker.
g) kind "compliance_claim": Soften or qualify the claim (do not strengthen) and wrap the revised claim in a marker.
h) kind "compliance_strip": Honour ACTION= / publicSourceDowngrade on the concern line. If the line includes publicSourceDowngrade=keep-and-flag or ACTION=KEEP-AND-FLAG, KEEP the author's content unchanged (do not strip or anonymise) and wrap it: "Compliance flagged this for public-version removal, but a supporting source is public — confirm whether removal is needed." Strip or anonymise ONLY when that downgrade flag is absent (ACTION=STRIP-AND-FLAG). Then wrap a nearby remnant: "Removed <x> — compliance: <reason>. Confirm." This is the ONE case where the rewrite removes author content by default — and only when the downgrade is absent.

MARKERS (reviewer-confirm spans):
- Wrap each reviewer-confirm span as: {{softened text||short reviewer note}}
- Markers are allowed ONLY for: conflict, unsupported, partial, deletion, compliance_add, compliance_claim, compliance_strip (including public-source downgrade KEEP-AND-FLAG). Kind "craft" MUST NOT emit a marker — apply the edit in unmarked prose.
- The {{…||…}} delimiter wraps ONLY the claim text. Sentence-ending punctuation (. ! ?) stays OUTSIDE the delimiter (e.g. {{claim||note}}. Next sentence…).
- Every sentence in the revised draft must end with correct terminal punctuation.
- Example (conflict / stated source value): {{approximately 18% growth to about USD 95 million||Changed from 40% / USD 120 million to match the IC memo — confirm before publishing.}}
- Example (partial / stated source value): {{around USD 1.9 billion||Sources report about USD 1.9 billion rather than exceeding USD 2 billion — confirm.}}
- Example (unsupported, source silent): {{delivered material growth||Draft stated 40%; sources do not state a replacement figure — confirm.}}
- Example (deletion): {{incidental aside||Review flagged this as immaterial — consider cutting.}}
- Example (compliance_strip, no downgrade): {{the diligence lead||Removed Jane Smith — compliance: named individual in a public version. Confirm.}}
- Example (compliance_strip, KEEP-AND-FLAG): {{Jane Smith led the diligence||Compliance flagged this for public-version removal, but a supporting source is public — confirm whether removal is needed.}}
- Example (evidence named entity): {{BVP is evaluating an investment of up to USD 7 million in Shopify||Source does not name BVP; keep the author's attribution — confirm.}}

${intentBlock}

HOUSE STYLE RULES (v4 Review canon — comply across the whole draft):
${styleGuideBlock}

CONCERNS TO ADDRESS:
${formatConcernsBlock(concerns)}

DRAFT TO REVISE:
<<<DRAFT
${draft}
DRAFT>>>

Return only the full revised draft (with {{…||…}} markers only where kinds above require a flag).`.trim();
}
