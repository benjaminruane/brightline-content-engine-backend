/**
 * B13 — additive statement materiality (read-only vs verdict).
 * Does not feed concernLevel, aggregation, or evidence verdict.
 */

const STYLE_FORMAT_CODES = new Set([
  "date_format",
  "percentage_notation",
  "number_spelling",
  "currency_format",
  "thousand_separator",
  "oxford_comma",
  "em_dash",
  "smart_quotes",
  "english_variant",
  "first_person_plural",
  "defined_term_capitalisation",
  "sentence_length",
  "structural_integrity",
  "sentence_structure_clarity",
  "active_voice_preference",
  "passive_voice_overuse",
]);

const CRAFT_CODES = new Set([
  "voice_consistency",
  "narrative_coherence",
  "register_mismatch",
  "register_consistency",
  "passive_voice_overuse",
  "sentence_length",
  "underreach_hedging",
  "audience_calibration_jargon",
  "jargon_outside_audience_competence",
  "cliche",
  "materiality",
  "overreach_unsupported_causal",
]);

const EDITORIAL_MARKETING_CODES = new Set([
  "marketing_language_excess",
  "hyperbole_vs_qualitative",
]);

const HIGH_SIGNAL_FEATURES = [
  "monetary_figure",
  "percentage_metric",
  "date_period_claim",
  "named_person_entity_attribution",
  "comparative_superlative",
  "forward_looking",
  "regulated_sensitive",
];

const PROCEDURAL_CLOSER_RE =
  /^\s*(we recommend (approval|this investment|the investment|proceeding)|yours (sincerely|faithfully)|kind regards|best regards|sincerely)\s*[.,!]?\s*$/i;

const LEVEL_RANK = { mechanical: 0, minor: 1, material: 2 };

export function extractStatementFeatures(statement) {
  const t = typeof statement === "string" ? statement : "";
  const fired = [];

  if (
    /(?:USD|EUR|GBP|AUD|CAD|\$|€|£)\s*[\d,.]+/i.test(t) ||
    /\b[\d,.]+\s*(?:million|billion|thousand|mm|bn|k)\b/i.test(t)
  ) {
    fired.push("monetary_figure");
  }
  if (/\d+(?:\.\d+)?\s*%/.test(t) || /\bpercent(?:age)?\b/i.test(t)) {
    fired.push("percentage_metric");
  }
  if (
    /\b(?:Q[1-4]\s*20\d{2}|FY\s*20\d{2}|H[12]\s*20\d{2}|20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December|year[- ]on[- ]year|YoY|TTM|as at|as of)\b/i.test(
      t
    )
  ) {
    fired.push("date_period_claim");
  }
  if (
    /\b(?:according to|said|says|stated|quoted|CEO|CFO|CIO|partner|attributed)\b/i.test(t) ||
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/.test(t)
  ) {
    fired.push("named_person_entity_attribution");
  }
  if (
    /\b(?:more than|less than|greater than|highest|lowest|largest|best|worst|leading|versus|\bvs\.?\b|compared with|compared to|outperform|underperform)\b/i.test(
      t
    )
  ) {
    fired.push("comparative_superlative");
  }
  if (
    /\b(?:expect|expects|expected|will|forecast|target|outlook|intend|intends|plan to|plans to|pipeline|forthcoming|ahead|next year|guidance)\b/i.test(
      t
    )
  ) {
    fired.push("forward_looking");
  }
  if (
    /\b(?:IRR|MOIC|DPI|TVPI|gross(?:\/| )?net|guaranteed|confidential|insider|patient|GDPR|personal data|material non[- ]public|MNPI|regulated|SEC|FCA)\b/i.test(
      t
    )
  ) {
    fired.push("regulated_sensitive");
  }

  return fired;
}

export function isProceduralCloser(statement) {
  const t = typeof statement === "string" ? statement.trim() : "";
  return PROCEDURAL_CLOSER_RE.test(t);
}

function hasHighSignal(features) {
  return features.some((f) => HIGH_SIGNAL_FEATURES.includes(f));
}

function isQuantitativeGap(statement, note) {
  const blob = `${statement || ""} ${note || ""}`;
  return (
    /(?:USD|EUR|GBP|\$|€|£)\s*[\d,.]+/i.test(blob) ||
    /\d+(?:\.\d+)?\s*%/.test(blob) ||
    /\b[\d,.]+\s*(?:million|billion|mm|bn)\b/i.test(blob)
  );
}

function classifyEditorialCode(code, category) {
  const id = String(code || "").trim();
  const cat = String(category || "").trim().toLowerCase();
  if (STYLE_FORMAT_CODES.has(id) || cat === "style_guide" || cat === "style") return "style_format";
  if (EDITORIAL_MARKETING_CODES.has(id)) return "editorial_marketing";
  if (CRAFT_CODES.has(id) || cat === "editorial") return "editorial_craft";
  return "editorial_craft";
}

/**
 * Score a single finding. Sentence high-signal features escalate evidence and
 * compliance only — never editorial/craft.
 *
 * @returns {{ level: "material"|"minor"|"mechanical", findingType: string, reasons: string[] }}
 */
export function scoreFinding({
  statement,
  findingKind,
  concernCode,
  concernCategory,
  gapNote,
  features,
}) {
  const feats = Array.isArray(features) ? features : extractStatementFeatures(statement);
  const high = hasHighSignal(feats);
  const reasons = [];
  const closer = isProceduralCloser(statement);

  let findingType = findingKind;
  if (findingKind === "editorial" || findingKind === "style") {
    findingType = classifyEditorialCode(concernCode, concernCategory);
  }
  if (findingKind === "source_recency" || concernCode === "source_recency") {
    findingType = "source_recency";
  }
  if (findingKind === "framing_fidelity" || concernCode === "framing_fidelity") {
    findingType = "framing_fidelity";
  }

  if (findingType === "style_format") {
    reasons.push("pure_style_format");
    return { level: "mechanical", findingType, reasons };
  }

  if (findingType === "editorial_craft" || findingType === "editorial_marketing") {
    reasons.push(findingType === "editorial_marketing" ? "editorial_marketing_minor" : "craft_minor");
    return { level: "minor", findingType, reasons };
  }

  if (findingType === "compliance") {
    reasons.push("compliance_concern");
    return { level: "material", findingType, reasons };
  }

  if (findingType === "source_recency" || concernCode === "source_recency") {
    reasons.push("source_recency_stale_current_claim");
    return { level: "material", findingType: "source_recency", reasons };
  }

  if (findingType === "framing_fidelity" || concernCode === "framing_fidelity") {
    reasons.push("framing_goes_beyond_source");
    return { level: "material", findingType: "framing_fidelity", reasons };
  }

  if (findingType === "evidence_conflict" || findingType === "evidence_no_support") {
    if (closer) {
      reasons.push("procedural_closer");
      return { level: "minor", findingType, reasons };
    }
    reasons.push("evidence_conflict_or_no_support");
    return { level: "material", findingType, reasons };
  }

  if (findingType === "evidence_partial") {
    if (closer) {
      reasons.push("procedural_closer");
      return { level: "minor", findingType, reasons };
    }
    if (high) {
      reasons.push("evidence_partial_high_signal");
      return { level: "material", findingType, reasons };
    }
    if (!isQuantitativeGap(statement, gapNote)) {
      reasons.push("evidence_partial_non_quantitative");
      return { level: "minor", findingType, reasons };
    }
    reasons.push("ambiguous_evidence_default_material");
    return { level: "material", findingType, reasons };
  }

  reasons.push("ambiguous_evidence_or_compliance_default_material");
  return { level: "material", findingType, reasons };
}

function maxLevel(levels) {
  let best = "mechanical";
  for (const l of levels) {
    if ((LEVEL_RANK[l] ?? 0) > (LEVEL_RANK[best] ?? 0)) best = l;
  }
  return best;
}

/**
 * Card-level rollup. Additive only.
 * @returns {{ level: "material"|"minor"|"mechanical", features: string[] }}
 */
export function computeCardMateriality({
  statement,
  evidenceVerdict,
  editorialConcerns,
  complianceConcerns,
  sourceRecencyConcerns,
  framingFidelityConcerns,
}) {
  const features = extractStatementFeatures(statement);
  const levels = [];

  if (evidenceVerdict === "conflicting") {
    levels.push(scoreFinding({ statement, findingKind: "evidence_conflict", features }).level);
  } else if (evidenceVerdict === "not_supported") {
    levels.push(scoreFinding({ statement, findingKind: "evidence_no_support", features }).level);
  } else if (evidenceVerdict === "partially_confirmed") {
    levels.push(scoreFinding({ statement, findingKind: "evidence_partial", features }).level);
  }

  for (const c of Array.isArray(editorialConcerns) ? editorialConcerns : []) {
    levels.push(
      scoreFinding({
        statement,
        findingKind: "editorial",
        concernCode: c?.concernCode,
        concernCategory: c?.category,
        gapNote: c?.note,
        features,
      }).level
    );
  }

  for (const c of Array.isArray(complianceConcerns) ? complianceConcerns : []) {
    levels.push(
      scoreFinding({
        statement,
        findingKind: "compliance",
        concernCode: c?.concernCode,
        concernCategory: c?.category,
        gapNote: c?.note,
        features,
      }).level
    );
  }

  for (const c of Array.isArray(sourceRecencyConcerns) ? sourceRecencyConcerns : []) {
    levels.push(
      scoreFinding({
        statement,
        findingKind: "source_recency",
        concernCode: c?.concernCode || "source_recency",
        concernCategory: c?.category || "source_recency",
        gapNote: c?.note,
        features,
      }).level
    );
  }

  for (const c of Array.isArray(framingFidelityConcerns) ? framingFidelityConcerns : []) {
    levels.push(
      scoreFinding({
        statement,
        findingKind: "framing_fidelity",
        concernCode: c?.concernCode || "framing_fidelity",
        concernCategory: c?.category || "framing_fidelity",
        gapNote: c?.note,
        features,
      }).level
    );
  }

  const level = levels.length === 0 ? "mechanical" : maxLevel(levels);
  return { level, features };
}
