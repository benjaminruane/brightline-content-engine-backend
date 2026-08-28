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
import { parseMarkerIntentPayload, applyMarkerHonestyCheck } from "./pr9-marker-honesty.mjs";
import { applyCutPunctuationNormalizeToRevision } from "./pr9-cut-punctuation.mjs";
import { applyDeterministicUnsupportedRemoval } from "./pr9-deterministic-unsupported-removal.mjs";
import { buildNoteBodyFromDiff } from "./pr9-note-what-from-diff.mjs";

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

/**
 * B88: validated unsupportedSpans for the reviser. Suppresses whole-statement
 * spans (no extra information; risk of reading as a delete-the-sentence cue).
 * Deduplicates by text. Null offsets still contribute when text is usable.
 * Returns [] when nothing survives, so the concern block stays byte-identical.
 *
 * @param {object} card
 * @param {string} statementText
 * @returns {Array<{ text: string, sourceLabel: string }>}
 */
function extractUnsupportedSpansForRevision(card, statementText) {
  const rawStatement = typeof card?.statement === "string" ? card.statement : statementText || "";
  const stmtTrim = rawStatement.trim();
  const spans = Array.isArray(card?.unsupportedSpans) ? card.unsupportedSpans : [];
  if (spans.length === 0) return [];

  const supportIds = Array.isArray(card?.supportRefIds) ? card.supportRefIds : [];
  const supportTitles = Array.isArray(card?.supportRefTitles) ? card.supportRefTitles : [];
  const supportSpans = Array.isArray(card?.supportSpans) ? card.supportSpans : [];

  function labelFor(span) {
    if (typeof span?.sourceLabel === "string" && span.sourceLabel.trim()) {
      return span.sourceLabel.trim();
    }
    const refId = span?.sourceRefId;
    if (refId != null) {
      for (const ss of supportSpans) {
        if (Number(ss?.sourceRefId) === Number(refId) && typeof ss?.sourceLabel === "string" && ss.sourceLabel.trim()) {
          return ss.sourceLabel.trim();
        }
      }
      for (let i = 0; i < supportIds.length; i++) {
        if (String(supportIds[i]) === String(refId) && typeof supportTitles[i] === "string" && supportTitles[i].trim()) {
          return supportTitles[i].trim();
        }
      }
      if (Number.isFinite(Number(refId))) return `source ${Number(refId)}`;
    }
    return "source";
  }

  function isWholeStatementSpan(span) {
    const text = typeof span?.text === "string" ? span.text : "";
    if (!text) return false;
    if (text.trim() === stmtTrim && stmtTrim.length > 0) return true;
    const start = span?.start;
    const end = span?.end;
    if (
      typeof start === "number" &&
      Number.isFinite(start) &&
      typeof end === "number" &&
      Number.isFinite(end) &&
      start === 0 &&
      end === rawStatement.length &&
      rawStatement.length > 0
    ) {
      return true;
    }
    return false;
  }

  const seen = new Set();
  const out = [];
  for (const span of spans) {
    if (!span || typeof span !== "object") continue;
    const text = typeof span.text === "string" ? span.text.trim() : "";
    if (!text) continue;
    if (isWholeStatementSpan(span)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, sourceLabel: labelFor(span) });
  }
  return out;
}

function classifyEditorialKind(concern, rule, suggestedDirection) {
  if (isStyleGuideConcern(concern, rule)) return "craft";
  if (norm(rule) === "marketing_language_excess") return "soften";
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
 *   editorial: Array<{ kind: "deletion"|"craft"|"soften", rule: string, note: string, suggestedDirection: string }>,
 *   compliance: Array<{
 *     kind: "compliance_add"|"compliance_claim"|"compliance_strip",
 *     note: string,
 *     suggestedDirection: string,
 *     rule?: string,
 *     publicSourceDowngrade?: boolean,
 *   }>,
 *   claims?: Array<{
 *     text: string,
 *     verdict: string,
 *     role: "confirmed_preserve"|"unsupported"|"partial"|"conflict"|"other",
 *     index: number,
 *     draftStart?: number,
 *     draftEnd?: number,
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
     *   unsupportedSpans?: Array<{ text: string, sourceLabel: string }>,
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
      const namedSpans = extractUnsupportedSpansForRevision(card, statementText);
      if (namedSpans.length > 0) evidence.unsupportedSpans = namedSpans;
    }

    const item = {
      statementIndex: statementIndexFromRow(row, card, i),
      statementText,
      evidence,
      editorial,
      compliance,
    };
    const claims = extractDecomposedClaims(card);
    if (claims) item.claims = claims;
    concerns.push(item);
  }

  return concerns;
}

/**
 * B53a claim rows already on the qcCard. Only when decomposed === true and
 * claims is a non-empty array of objects with text. Otherwise null so callers
 * and formatConcernsBlock stay on the statement-level path (byte identical).
 *
 * Roles:
 * - confirmed -> confirmed_preserve (must survive untouched)
 * - not_supported / no_support -> unsupported (softening target)
 * - partially_confirmed -> partial (same treatment as a statement-level partial:
 *   not protected as confirmed, not named as the sole unsupported element)
 * - conflicting -> conflict (not confirmed-preserve, not the softening target)
 */
function extractDecomposedClaims(card) {
  if (card?.decomposed !== true) return null;
  if (!Array.isArray(card.claims) || card.claims.length === 0) return null;
  const out = [];
  for (let i = 0; i < card.claims.length; i++) {
    const claim = card.claims[i];
    if (!claim || typeof claim !== "object") continue;
    const text = typeof claim.text === "string" ? claim.text.trim() : "";
    if (!text) continue;
    const verdict =
      mapSupportState(norm(claim.verdict)) ||
      mapSupportState(norm(claim.supportState)) ||
      mapDisplayVerdict(norm(claim.displayVerdict));
    let role = "other";
    if (verdict === "confirmed") role = "confirmed_preserve";
    else if (verdict === "no_support") role = "unsupported";
    else if (verdict === "partially_confirmed") role = "partial";
    else if (verdict === "conflicting") role = "conflict";
    const row = {
      text,
      verdict: verdict || "unknown",
      role,
    };
    if (typeof claim.index === "number" && Number.isFinite(claim.index)) row.index = claim.index;
    else row.index = i;
    if (Number.isFinite(claim.draftStart)) row.draftStart = claim.draftStart;
    if (Number.isFinite(claim.draftEnd)) row.draftEnd = claim.draftEnd;
    out.push(row);
  }
  return out.length > 0 ? out : null;
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

    const hasClaimSpans = Array.isArray(item.claims) && item.claims.length > 0;
    if (hasClaimSpans) {
      const kindTag = item.evidence?.kind ? ` [statementKind=${item.evidence.kind}]` : "";
      lines.push(`Evidence (per-claim spans)${kindTag}:`);
      for (const c of item.claims) {
        const verdict = c.verdict || "unknown";
        const quoted = c.text || "";
        if (c.role === "confirmed_preserve") {
          lines.push(`  CONFIRMED AND TO BE PRESERVED: "${quoted}" [verdict=${verdict}]`);
        } else if (c.role === "unsupported") {
          lines.push(
            `  Unsupported element (the softening rule applies to this span): "${quoted}" [verdict=${verdict}]`
          );
        } else if (c.role === "partial") {
          lines.push(
            `  Partial (same treatment as a statement-level partial; not CONFIRMED AND TO BE PRESERVED): "${quoted}" [verdict=${verdict}]`
          );
        } else if (c.role === "conflict") {
          lines.push(`  Conflicting claim span: "${quoted}" [verdict=${verdict}]`);
        } else {
          lines.push(`  Claim [${verdict}]: "${quoted}"`);
        }
      }
      if (item.evidence) {
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
          lines.push("  (No excerpt/reason available - soften or qualify the claim without inventing support.)");
        }
      }
    } else if (item.evidence) {
      const kindTag = item.evidence.kind ? ` [kind=${item.evidence.kind}]` : "";
      lines.push(`Evidence gap (${item.evidence.verdict})${kindTag}:`);
      const namedSpans = Array.isArray(item.evidence.unsupportedSpans)
        ? item.evidence.unsupportedSpans
        : [];
      for (const span of namedSpans) {
        const label = typeof span?.sourceLabel === "string" && span.sourceLabel.trim()
          ? span.sourceLabel.trim()
          : "source";
        const phrase = typeof span?.text === "string" ? span.text : "";
        lines.push(`  Unsupported phrase (${label}): "${phrase}"`);
      }
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

function copyMarker(m, extra = {}) {
  const out = {
    start: m.start,
    end: m.end,
    note: typeof m.note === "string" ? m.note : "",
    ...extra,
  };
  if (m.intent) out.intent = m.intent;
  return out;
}

/**
 * Parse markers of the form {{span||INTENT: note}} (non-greedy).
 * INTENT must be CHANGED, KEPT, or CUT. The intent is stored on the marker and
 * stripped from the displayed note.
 * Missing or unrecognised intent is malformed: the raw {{...}} stays in the
 * draft and no marker is emitted (same as today's unmatched delimiter).
 *
 * @param {string} text
 * @returns {{ revisedDraft: string, markers: Array<{ start: number, end: number, note: string, intent?: string }> }}
 */
export function parseSoftenedMarkers(text) {
  const source = typeof text === "string" ? text : "";
  let revisedDraft = "";
  /** @type {Array<{ start: number, end: number, note: string, intent?: string }>} */
  const markers = [];
  let lastIndex = 0;
  SOFTENED_MARKER_RE.lastIndex = 0;
  let match;
  while ((match = SOFTENED_MARKER_RE.exec(source)) !== null) {
    revisedDraft += source.slice(lastIndex, match.index);
    const parsedIntent = parseMarkerIntentPayload(match[2]);
    if (!parsedIntent) {
      revisedDraft += match[0];
      lastIndex = match.index + match[0].length;
      continue;
    }
    const span = match[1];
    const start = revisedDraft.length;
    revisedDraft += span;
    const end = revisedDraft.length;
    markers.push({ start, end, note: parsedIntent.note, intent: parsedIntent.intent });
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
      ...(m.intent ? { intent: m.intent } : {}),
    };
  });

  return { revisedDraft: text, markers };
}

const TERMINAL_PUNCT_RE = /[.!?]$/;
const CANONICAL_NOTE_CLOSER = "Confirm before publishing.";

/**
 * Live EDGE CASE for kind "unsupported" (buildRevisionPrompt).
 * Keep-and-flag: the model may still keep the sentence; deterministic removal
 * in finalizeSuggestRevisionText owns whole-sentence deletion when enabled.
 */
export const UNSUPPORTED_WHOLE_SENTENCE_EDGE_CASE_LIVE =
  `  - EDGE CASE, cutting would remove the whole sentence: do NOT cut. That is removing the author's point rather than removing unsupported precision, so it falls to keep-and-flag. Keep the sentence as written and flag it.`;

/** Trailing model confirm-variants (dash/space optional): confirm, confirm this formulation, confirm before publishing. */
const TRAILING_CONFIRM_VARIANT_RE =
  /(?:\s*[-–—:,;.]+\s*|\s+)confirm(?:\s+this(?:\s+softer)?\s+formulation)?(?:\s+before\s+publishing)?[.!?]*$/i;
const WHOLE_CONFIRM_VARIANT_RE =
  /^confirm(?:\s+this(?:\s+softer)?\s+formulation)?(?:\s+before\s+publishing)?[.!?]*$/i;

/**
 * Deterministic note-style safeguard: trim, capitalise first letter, strip trailing
 * confirm-variants, ensure terminal punctuation, append canonical closer.
 * Does not alter revised text or marker offsets — notes only. Idempotent.
 *
 * @param {string} note
 * @returns {string}
 */
export function normalizeMarkerNoteText(note) {
  let trimmed = typeof note === "string" ? note.trim() : "";
  if (!trimmed) return "";

  trimmed = trimmed.replace(TRAILING_CONFIRM_VARIANT_RE, "").trim();
  if (WHOLE_CONFIRM_VARIANT_RE.test(trimmed)) trimmed = "";
  if (!trimmed) return CANONICAL_NOTE_CLOSER;

  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  const withPunct = TERMINAL_PUNCT_RE.test(capitalised) ? capitalised : `${capitalised}.`;
  return `${withPunct} ${CANONICAL_NOTE_CLOSER}`;
}

/**
 * Replace each model note's account of what it did with one generated from the
 * actual diff, keeping only the model's reason.
 *
 * Runs before deterministic removal, so removal notes — which the code already
 * builds from what it did — never pass through here.
 *
 * @param {string} originalDraft
 * @param {{ revisedDraft: string, markers: Array<object> }} parsed
 * @returns {{ revisedDraft: string, markers: Array<object> }}
 */
function applyNoteWhatFromDiff(originalDraft, parsed) {
  const draft = typeof parsed?.revisedDraft === "string" ? parsed.revisedDraft : "";
  const incoming = Array.isArray(parsed?.markers) ? parsed.markers : [];
  if (!originalDraft) return { revisedDraft: draft, markers: incoming.map((m) => copyMarker(m)) };

  const markers = incoming.map((m) => {
    const { body } = buildNoteBodyFromDiff({
      original: originalDraft,
      revised: draft,
      start: m.start,
      end: m.end,
      note: typeof m.note === "string" ? m.note : "",
    });
    return copyMarker(m, { note: normalizeMarkerNoteText(body) });
  });
  return { revisedDraft: draft, markers };
}

function applyNormalizeMarkerNotes(parsed) {
  const draft = typeof parsed?.revisedDraft === "string" ? parsed.revisedDraft : "";
  const incoming = Array.isArray(parsed?.markers) ? parsed.markers : [];
  const markers = incoming.map((m) => copyMarker(m, { note: normalizeMarkerNoteText(m.note) }));
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
    ? parsed.markers.map((m) => copyMarker(m))
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
 * Parse markers → note-style normalize → sentence-boundary period safeguard →
 * char-normalize (offsets remapped) → cut-punctuation normalize (offsets remapped)
 * → note WHAT clause regenerated from the real diff (needs originalDraft)
 * → deterministic unsupported whole-sentence removal (when enabled)
 * → declared-intent honesty check.
 * @param {string} rawLlmText
 * @param {{
 *   originalDraft?: string,
 *   traceId?: string,
 *   log?: Function,
 *   concerns?: Array<object>,
 *   deterministicUnsupportedRemoval?: boolean,
 * }} [opts]
 * @returns {{
 *   revisedDraft: string,
 *   markers: Array<{ start: number, end: number, note: string, intent?: string }>,
 *   honestyEvents: Array<object>,
 *   removalEvents?: Array<object>,
 * }}
 */
export function finalizeSuggestRevisionText(rawLlmText, opts = {}) {
  const parsed = parseSoftenedMarkers(rawLlmText);
  const notesNormalized = applyNormalizeMarkerNotes(parsed);
  const withPunct = ensureMarkerSentenceTerminalPunctuation(notesNormalized);
  const normalised = applyHouseStyleCharNormalizeToRevision(withPunct);
  const punctClean = applyCutPunctuationNormalizeToRevision(normalised);
  const originalDraft = typeof opts.originalDraft === "string" ? opts.originalDraft : "";
  const whatFromDiff = applyNoteWhatFromDiff(originalDraft, punctClean);

  const removal = applyDeterministicUnsupportedRemoval(whatFromDiff, opts.concerns, {
    enabled: opts.deterministicUnsupportedRemoval === true,
    originalDraft,
  });

  if (!originalDraft) {
    return {
      revisedDraft: removal.revisedDraft,
      markers: removal.markers,
      honestyEvents: [],
      removalEvents: removal.removalEvents,
    };
  }
  const honest = applyMarkerHonestyCheck(
    originalDraft,
    { revisedDraft: removal.revisedDraft, markers: removal.markers },
    {
      traceId: opts.traceId || "",
      log: opts.log,
    }
  );
  return {
    ...honest,
    removalEvents: removal.removalEvents,
  };
}

/**
 * Build a temp-0 whole-draft revision instruction. Pure; no LLM.
 *
 * @param {string} draftText
 * @param {ReturnType<typeof gatherConcerns>} concerns
 * @param {{
 *   outputType?: string,
 *   requiredVersion?: string,
 * }} [opts]
 * @returns {string}
 */
export function buildRevisionPrompt(draftText, concerns, opts = {}) {
  const draft = typeof draftText === "string" ? draftText : "";
  const { outputType, visibility, rawOutputType, rawRequiredVersion } = resolveHouseStyleOpts(opts);
  const unsupportedWholeSentenceEdge = UNSUPPORTED_WHOLE_SENTENCE_EDGE_CASE_LIVE;

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
- Marker notes: every note must follow "<what changed, in plain words> — <why, in plain words>. Confirm before publishing." For keep-and-flag findings, lead with what was KEPT, not an edit. The note must describe ONLY the finding that caused THIS flag, accurately. Never claim a change that was not made. Never describe mechanical house-style reformatting that happened on the same span (e.g. "$" → "USD", comma→apostrophe thousands separators, dash/quote/date formatting, number spelling) — those are applied silently and appear only in the diff. Evidence/compliance-driven changes (a corrected figure, a stripped IRR, a softened promise) ARE the finding and SHOULD be described. Never refer to the marker, underline, or highlight itself; never say "added a marker". The note explains the finding, not the UI. Plain language only. Do NOT use review/compliance jargon ("forward-looking objective", "formulation", "non-promissory", "raises compliance concerns", "evidence-aligned", "in line with sources and compliance guidance"). Say it the way you'd explain it to a colleague ("guaranteed-return language isn't allowed", "the sources don't back this", "it's promotional"). One or two short sentences. Always end with exactly: "Confirm before publishing."
- Preserve the author's voice, meaning, and structure except where a kind below requires a change. Write in natural, professional prose. LESS HEDGING: soften only the unsupported/overreaching element; keep supported facts crisp and direct. Avoid stacked hedges ("appears to be…", "may potentially…"). Prefer plain verbs ("targets", "is expected to").
- Where a specific unsupported phrase is named under an Evidence gap, the edit belongs to that phrase and the rest of the sentence should be left alone.
- Preserve the draft's natural paragraph structure; do NOT put each sentence on its own line unless the original did.
- The ENTIRE revised draft must comply with HOUSE STYLE RULES below (not only the flagged statements) — including currency_format (ISO code + "million"/"billion", not symbol/"m"), thousand_separator (high comma / apostrophe), number_spelling, first_person_plural where it applies to this output type, and hyperbole_vs_qualitative.
- Output ONLY the full revised draft text — no commentary, no preamble, no markdown fences, no bullet summary of changes.

KIND HANDLING (apply by kind= on each concern):
Three things are easy to blur into "removing content". They are separated by what TRIGGERED the finding, not by how the edit looks:
- Removing the author's POINT. Triggered by materiality or a removal-verb direction. Rule (d). Keep and flag. Unchanged.
- Removing unsupported PRECISION while the point survives, or cutting the clause when it does not. Triggered by an evidence gap with a silent source. Rule (b). Do it and flag.
- Removing an ELEMENT for compliance. A named individual, a confidential figure in a public version. Rule (i).
a) kind "conflict": If the source passage states a competing value, the revised PROSE must carry that source value (house-style), not a vague hedge. Example: source "approximately 18% … about $95m" → write "approximately 18% growth to about USD 95 million", NEVER "material growth". Wrap the corrected element in a marker. The note must name the change and the source, e.g. "Changed from USD 50 to USD 45 to match Shopify (text).txt. Confirm before publishing." Hedge or drop the precise number ONLY when the source states no replacement value. Never assert the contradicted draft value.
b) kind "unsupported": If the source STATES a specific value, put that source value in the prose (house-style) and flag it - same figure rule as conflict/partial. Soften WITHOUT a number only when the source is silent or vague (true unsupported). Never invent a figure the source does not state. When the source is silent or vague, apply ONE TEST before editing: after removing the unsupported figure, does the remaining phrase tell a reader anything they did not already know?
  - YES, the claim stands without the number: SOFTEN. Remove the figure, keep the phrase, wrap and flag. Example: "delivered 22% revenue growth last year" becomes "delivered revenue growth last year". Growth is still asserted; only the rate was unbacked.
  - NO, the figure WAS the claim: CUT THE CLAUSE. Remove the clause entirely rather than leaving a hollow phrase in its place. Keep the rest of the sentence. Wrap a surviving remnant nearby and flag, following the same pattern the compliance strip path already uses when there is no revised span to wrap. Examples: "The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks of EUR 80-100 million apiece." becomes "The fund intends to build a portfolio of 10-14 control-oriented investments." "The company trades at 14x EV/EBITDA and serves customers across Europe." becomes "The company serves customers across Europe."
${unsupportedWholeSentenceEdge}
A phrase left behind purely to occupy the space where a number used to be is worse than either alternative: it is longer, it asserts nothing, and it reads as evasion.
Two operations look like rounding and only one is legitimate:
  - Approximating a SOURCE figure is fine. The source says 240, the prose says "around 240" or "over 200". The claim is backed; only the precision changed.
  - Approximating the AUTHOR'S unsupported figure is forbidden. The author says 240, no source says anything. "Over 200" is derived from an unbacked number and inherits its lack of support entirely. The second is WORSE than leaving the original figure alone. "240" reads as a claim and invites a reviewer to check it. "Over 200" reads as a finding, as though someone checked and is being careful. It carries the appearance of diligence with none of the substance, and that is the laundering the revision exists to prevent.
Wrap the revised element, the surviving remnant, or the kept sentence in a marker.
c) kind "partial": Keep the CONFIRMED portion unchanged. If the source STATES a specific value for the unsupported element, inject that source value into the prose (house-style) and wrap THAT element in a marker (e.g. "around USD 1.9 billion"). When the source is silent or vague on the unsupported element, apply the same ONE TEST as (b) to that element only: SOFTEN if the remaining phrase still tells the reader something; CUT THE CLAUSE if the figure WAS the claim; keep-and-flag only if cutting would remove the whole sentence. Never approximate the author's unsupported figure. Do not vague out a supported fact because another part of the same statement is unsupported.
d) kind "deletion": Do NOT delete. Keep the author's text unchanged and wrap the flagged phrase in a marker. The note must say what was KEPT and why it is flagged, not describe an edit: "Kept the kettle detail — review flagged it as immaterial, so consider cutting. Confirm before publishing." The author decides whether to cut.
e) kind "soften" (marketing_language_excess): Never substitute a milder evaluative word for a stronger one. Follow suggestedDirection as written. If it begins with Delete and states a resulting phrase, substitute that phrase for the span that contained the deleted words. Do not infer a scaffolding repair the direction does not state. If it tells you to rewrite the sentence without the deleted text, rewrite the sentence so it reads naturally; do not substitute a milder word for the deleted text. If it begins with Keep, keep the author's wording unchanged and wrap it. Never replace "exceptional" with "strong" or any quieter synonym.
f) kind "craft" (all other editorial craft + style_guide — NOT marketing_language_excess): APPLY SILENTLY. NEVER emit a {{text||note}} marker for a craft edit. Meaning-preserving mechanical / style / craft fixes only. The track-changes diff already shows them. Follow suggestedDirection when it does not delete substance.
g) kind "compliance_add": Add the required qualifier or disclaimer and wrap the added/qualified span in a marker.
h) kind "compliance_claim": Soften or qualify the claim (do not strengthen) and wrap the revised claim in a marker.
i) kind "compliance_strip": Honour ACTION= / publicSourceDowngrade on the concern line. If the line includes publicSourceDowngrade=keep-and-flag or ACTION=KEEP-AND-FLAG, KEEP the author's content unchanged (do not strip or anonymise) and wrap it. The note must say what was KEPT and why it is flagged: "Kept Jane Smith — a supporting source is already public, so check whether removal is still needed. Confirm before publishing." Strip or anonymise ONLY when that downgrade flag is absent (ACTION=STRIP-AND-FLAG). Then wrap a nearby remnant: "Removed Jane Smith — named person in a public version. Confirm before publishing." This is the one case where an element is removed FOR COMPLIANCE REASONS. It is not the only case where content is removed. Strip only when the downgrade is absent.

NAMED ENTITIES (evidence keep-and-flag): KEEP the author's name in the prose unchanged; wrap it in a marker. The note must say what was KEPT and why the attribution is flagged. Do NOT mention silent house-style tidy-ups on the same span (currency code, thousands separator, dashes, quotes, dates, number spelling). Target: "Kept 'BVP' — the source says 'the firm', not BVP, so confirm the attribution. Confirm before publishing."

MARKERS (reviewer-confirm spans):
- Wrap each reviewer-confirm span as: {{span||INTENT: short reviewer note}}
- INTENT is exactly one of CHANGED, KEPT, CUT (uppercase, then a colon, then the note).
  - CHANGED: the wrapped span was rewritten.
  - KEPT: the wrapped span was deliberately left as the author wrote it.
  - CUT: content adjacent to this marker was removed, and the marker sits on a surviving remnant because the removed text no longer exists to wrap.
- Apply the kind rules first, then label. INTENT describes what you already did. It does not change whether you soften, cut, or keep.
- For CUT, wrap a surviving word or phrase of the author's remaining prose, not a punctuation mark alone.
- Markers are allowed ONLY for: conflict, unsupported, partial, deletion, soften, compliance_add, compliance_claim, compliance_strip (including public-source downgrade KEEP-AND-FLAG). Kind "craft" MUST NOT emit a marker - apply the edit in unmarked prose.
- NOTE TEMPLATE: every note is "<what changed, in plain words> — <why, in plain words>. Confirm before publishing." For keep-and-flag (deletion, evidence named-entity, downgraded compliance_strip) the first clause is what was KEPT. Describe ONLY the finding that caused THIS flag. Never claim a change that was not made. Never mention silent house-style reformatting on the same span ("$" → "USD", comma→apostrophe, dash/quote/date, number spelling). Never mention the marker, underline, or highlight. Always end with exactly: "Confirm before publishing."
- The {{…||…}} delimiter wraps ONLY the claim text. Sentence-ending punctuation (. ! ?) stays OUTSIDE the delimiter (e.g. {{claim||CHANGED: note}}. Next sentence…).
- Every sentence in the revised draft must end with correct terminal punctuation.
- Example (conflict / stated source value): {{approximately 18% growth to about USD 95 million||CHANGED: Changed from 40% / USD 120 million to match the IC memo. Confirm before publishing.}}
- Example (partial / stated source value): {{around USD 1.9 billion||CHANGED: Changed from over USD 2 billion to around USD 1.9 billion — the sources don't back the higher figure. Confirm before publishing.}}
- Example (unsupported, source silent, claim stands): {{delivered revenue growth last year||CHANGED: Removed the unsupported 22% figure - sources do not state a rate. Confirm before publishing.}}
- Example (unsupported, source silent, figure WAS the claim): {{The company serves customers across Europe||CUT: Removed the unsupported 14x EV/EBITDA clause - sources do not state a multiple. Confirm before publishing.}}
- Example (deletion / keep-and-flag): {{The office also has a red kettle||KEPT: Kept the kettle detail — review flagged it as immaterial, so consider cutting. Confirm before publishing.}}
- Example (soften / marketing, delete): {{a track record of 2.4x gross MOIC and 21% gross IRR||CHANGED: Deleted 'genuinely exceptional'. The figures were doing the work. Confirm before publishing.}}
- Example (soften / marketing, keep): {{a genuine differentiator||KEPT: Kept 'genuine differentiator'. Removing it would empty the clause. Confirm before publishing.}}
- Example (compliance_strip, no downgrade): {{the diligence lead||CUT: Removed Jane Smith — named person in a public version. Confirm before publishing.}}
- Example (compliance_strip, KEEP-AND-FLAG): {{Jane Smith led the diligence||KEPT: Kept Jane Smith — a supporting source is already public, so check whether removal is still needed. Confirm before publishing.}}
- Example (evidence named entity / keep-and-flag): {{BVP is evaluating an investment of up to USD 7 million in Shopify||KEPT: Kept 'BVP' — the source says 'the firm', not BVP, so confirm the attribution. Confirm before publishing.}}
- Example (compliance_claim): {{aims to deliver improved returns||CHANGED: Softened 'certain to deliver outsized returns' to a non-guaranteed aim — guaranteed-return language isn't permitted. Confirm before publishing.}}

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
