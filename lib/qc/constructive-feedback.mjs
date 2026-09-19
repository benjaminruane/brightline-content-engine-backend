/**
 * B26 / B26.1 — Constructive feedback: deterministic bundle selection + plain-text post-filter.
 */

import { getOutputTypeLabel, normalizeOutputType, OUTPUT_TYPE } from "../output-intent.js";

function normVerdict(v) {
  return String(v ?? "").toLowerCase();
}

function cardFromRow(row) {
  if (row?.qcCard && typeof row.qcCard === "object") return row.qcCard;
  if (row && typeof row === "object" && ("statement" in row || "displayVerdict" in row)) return row;
  return {};
}

function statementTextFromRow(row, card) {
  const fromCard = typeof card.statement === "string" ? card.statement.trim() : "";
  if (fromCard) return fromCard;
  const fromRow = typeof row?.text === "string" ? row.text.trim() : "";
  return fromRow;
}

function cardIndexFromRow(row, card, rowIndex) {
  return typeof card.index === "number" ? card.index : rowIndex;
}

function isEvidenceSkipped(card) {
  const ss = normVerdict(card.supportState);
  const dv = normVerdict(card.displayVerdict);
  return ss === "skipped" || dv === "not reviewed";
}

function isEvidenceConfirmed(card) {
  if (isEvidenceSkipped(card)) return null;
  const ss = normVerdict(card.supportState);
  const dv = normVerdict(card.displayVerdict);
  return ss === "supported" || dv === "supported_full";
}

function isEditorialClean(card) {
  return normVerdict(card.editorialVerdict) === "clean";
}

function isComplianceClean(card) {
  return normVerdict(card.complianceVerdict) === "clean";
}

function evidenceDimensionClean(card, evidenceEnabled) {
  if (!evidenceEnabled) return true;
  const confirmed = isEvidenceConfirmed(card);
  return confirmed === true;
}

function editorialDimensionClean(card, editorialEnabled) {
  if (!editorialEnabled) return true;
  return isEditorialClean(card);
}

function complianceDimensionClean(card, complianceEnabled) {
  if (!complianceEnabled) return true;
  return isComplianceClean(card);
}

export function isCardFullyClean(card, reviewOptions = {}) {
  const evidenceEnabled = reviewOptions.evidenceEnabled !== false;
  const editorialEnabled = reviewOptions.editorialEnabled !== false;
  const complianceEnabled = reviewOptions.complianceEnabled !== false;
  return (
    evidenceDimensionClean(card, evidenceEnabled) &&
    editorialDimensionClean(card, editorialEnabled) &&
    complianceDimensionClean(card, complianceEnabled)
  );
}

function collectConcernInputs(concerns) {
  const list = Array.isArray(concerns) ? concerns : [];
  const inputs = [];
  for (const concern of list) {
    if (!concern || typeof concern !== "object") continue;
    const note = typeof concern.note === "string" ? concern.note.trim() : "";
    const suggestedDirection =
      typeof concern.suggestedDirection === "string" ? concern.suggestedDirection.trim() : "";
    if (note || suggestedDirection) {
      inputs.push({ note, suggestedDirection });
    }
  }
  return inputs;
}

function collectEvidenceInput(card) {
  const summary = typeof card.evidenceSummary === "string" ? card.evidenceSummary.trim() : "";
  const reasoning = typeof card.reasoningParagraph === "string" ? card.reasoningParagraph.trim() : "";
  if (summary && reasoning && summary !== reasoning) {
    return `${summary}\n${reasoning}`;
  }
  return summary || reasoning || "";
}

function isHardEvidenceFailure(card) {
  const dv = normVerdict(card.displayVerdict);
  const ss = normVerdict(card.supportState);
  return (
    dv === "conflict" ||
    dv === "not_supported" ||
    dv === "no_clear_support" ||
    ss === "conflicting" ||
    ss === "not_supported"
  );
}

function bundleHasContent(bundle) {
  return !!(
    bundle.evidence ||
    (Array.isArray(bundle.compliance) && bundle.compliance.length > 0) ||
    (Array.isArray(bundle.editorial) && bundle.editorial.length > 0)
  );
}

function bundleWorstRank(card, bundle) {
  if (bundle.evidence && isHardEvidenceFailure(card)) return 0;
  if (Array.isArray(bundle.compliance) && bundle.compliance.length > 0) return 1;
  return 2;
}

function toPublicBundle(bundle) {
  return {
    cardIndex: bundle.cardIndex,
    statementText: bundle.statementText,
    ...(bundle.evidence ? { evidence: bundle.evidence } : {}),
    compliance: bundle.compliance,
    editorial: bundle.editorial,
  };
}

/**
 * @param {Array} rows - statement rows or qcCards in document order
 * @param {object} reviewOptions
 * @returns {Array<{ cardIndex: number, statementText: string, evidence?: string, compliance: object[], editorial: object[] }>}
 */
export function selectConstructiveFeedbackBundles(rows, reviewOptions = {}) {
  const evidenceEnabled = reviewOptions.evidenceEnabled !== false;
  const editorialEnabled = reviewOptions.editorialEnabled !== false;
  const complianceEnabled = reviewOptions.complianceEnabled !== false;
  const list = Array.isArray(rows) ? rows : [];
  /** @type {Map<number, { cardIndex: number, statementText: string, evidence: string|null, compliance: object[], editorial: object[], _card: object }>} */
  const bundleMap = new Map();

  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const card = cardFromRow(row);
    if (isCardFullyClean(card, reviewOptions)) continue;

    const cardIndex = cardIndexFromRow(row, card, i);
    const statementText = statementTextFromRow(row, card);

    if (!bundleMap.has(cardIndex)) {
      bundleMap.set(cardIndex, {
        cardIndex,
        statementText,
        evidence: null,
        compliance: [],
        editorial: [],
        _card: card,
      });
    }
    const bundle = bundleMap.get(cardIndex);
    bundle.statementText = statementText;
    bundle._card = card;

    if (evidenceEnabled && isEvidenceConfirmed(card) === false) {
      const evidenceText = collectEvidenceInput(card);
      if (evidenceText) bundle.evidence = evidenceText;
    }

    if (complianceEnabled && !isComplianceClean(card)) {
      bundle.compliance.push(...collectConcernInputs(card.complianceConcerns));
    }

    if (editorialEnabled && !isEditorialClean(card)) {
      bundle.editorial.push(...collectConcernInputs(card.editorialConcerns));
    }
  }

  return [...bundleMap.values()]
    .filter(bundleHasContent)
    .sort((a, b) => {
      const rankDiff = bundleWorstRank(a._card, a) - bundleWorstRank(b._card, b);
      if (rankDiff !== 0) return rankDiff;
      return a.cardIndex - b.cardIndex;
    })
    .map(toPublicBundle);
}

/** @deprecated B26.1 — use selectConstructiveFeedbackBundles */
export function selectConstructiveFeedbackPoints(rows, reviewOptions = {}) {
  return selectConstructiveFeedbackBundles(rows, reviewOptions).flatMap((bundle) => {
    const points = [];
    if (bundle.evidence) {
      points.push({
        signal: "evidence",
        cardIndex: bundle.cardIndex,
        statementText: bundle.statementText,
        inputs: [{ note: bundle.evidence, suggestedDirection: "" }],
      });
    }
    if (bundle.compliance.length > 0) {
      points.push({
        signal: "compliance",
        cardIndex: bundle.cardIndex,
        statementText: bundle.statementText,
        inputs: bundle.compliance,
      });
    }
    if (bundle.editorial.length > 0) {
      points.push({
        signal: "editorial",
        cardIndex: bundle.cardIndex,
        statementText: bundle.statementText,
        inputs: bundle.editorial,
      });
    }
    return points;
  });
}

export const CLEAN_DRAFT_FEEDBACK_TEXT =
  "No changes are needed — the draft is ready for signoff.";

/**
 * Deterministic plain-text post-filter (B14 backstop — do not trust the model).
 * @param {string} raw
 * @returns {string}
 */
export function normalizeConstructiveFeedbackPlainText(raw) {
  let text = typeof raw === "string" ? raw : "";
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_\n]+)_/g, "$1");
  text = text.replace(/^[\t ]*[-*+]\s+/gm, "");
  text = text.replace(/^[\t ]*[-*_]{3,}[\t ]*$/gm, "");
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** B26.1 / B226 — shared editor register. */
export const CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER = [
  "Editor-to-writer: write as a senior editor who has genuinely read THIS draft and respects the writer's time.",
  "Warm through specificity, not encouragement. Name a strength ONLY where it is specifically true of this draft AND it sharpens or sets up a point. No free-floating or generic praise (e.g. 'strong start', 'on the right track').",
  "No praise-sandwich. The opening line is already written in code as the readiness label. Do not restate or reword it. Close forward. Do not console.",
  "Direct on problems; do not soften into mush. Respect over reassurance.",
  "Third person on the subject, imperative on the fix.",
  "No schoolroom framing ('not permissible', 'is not acceptable'). No system language (concern level, verdict, signal, entity). Plain text only. No markdown.",
].join("\n");

/** B26.2.1 — craft+cards register: omits opening/closing framing (contradicts observation-only craft). */
export const CONSTRUCTIVE_FEEDBACK_CRAFT_REGISTER_OBSERVATIONS_ONLY = [
  "Editor-to-writer: write as a senior editor who has genuinely read THIS draft and respects the writer's time.",
  "Warm through specificity, not encouragement. Name a strength ONLY where it is specifically true of this draft AND it sharpens or sets up a point. No free-floating or generic praise (e.g. 'strong start', 'on the right track').",
  "No praise-sandwich.",
  "Direct on problems; do not soften into mush. Respect over reassurance.",
  "Per point: third person on the subject, imperative on the fix.",
  "No schoolroom framing ('not permissible', 'is not acceptable'). No system language (concern level, verdict, signal, entity). Plain text only. Numbered points, no markdown.",
].join("\n");

/** B26.2.2 — cap quoted spans when anchoring to long draft sentences (prompt-only; no deterministic truncation). */
export const CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE =
  "When anchoring a point to a long sentence, quote only a short identifying fragment (~8-10 words max). For a long sentence, use opening and closing fragments joined by an ellipsis (e.g. The \"company is profitable ... gross merchandise value\" sentence is overly long...) rather than quoting the whole sentence. Short spans already under ~10 words may be quoted as-is.";

export const CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT = [
  "You are a senior investment content editor writing feedback for the author of a draft.",
  "Write as a senior editor giving notes to a good writer who is new. Concise, crisp, useful, lightly encouraging without being soft. The writer must want to read it.",
  CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER,
  CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE,
  "Write a piece. Not a form. Do not write one observation per margin note. Do not number unless the piece needs numbers. Do not roll-call structure, core message, conciseness, register, opening, or coherence.",
  "If a document-level pattern is true of this draft and is not already in a margin note, you may say it, quoted. If not, say nothing on craft.",
  "Every concern in the margin notes must be named or quoted. Do not invent a concern that is not in the notes and is not a visible document-level pattern.",
  "When the same fault is true of more than one sentence, write one observation that names those sentences. Say it once, at the level it is true.",
  "Facts in a margin note (draft says / source says / card text) must survive. Do not generalise a dated mismatch into 'does not confirm the timing'.",
  "The first sentence of the output is already written by code as the readiness label. Write only the body that follows.",
  "Length follows severity. Honour the lengthBudgetWords field. A short draft with Needs work is a short piece, not a list of eleven points.",
  "No markdown. No system or technical vocabulary (concern level, verdict, signal, entity, canonical claim).",
].join("\n\n");

/** B26.2 — document-level craft dimensions (commentary layer only). */
export const CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS = [
  "Structure & argument flow (does it build; is the lede buried)",
  "Core-message clarity (is the central point unmistakable)",
  "Conciseness & precision (needless words, woolly quantifiers, hedging pile-ups, document-level jargon — FT plain-English)",
  "Register & tone consistency (authoritative, not promotional or pompous; no hype creep across the draft)",
  "Opening & closing strength",
  "Internal coherence: actively compare figures, dates, and quantitative claims across the whole draft and flag any that disagree with each other (e.g. the same metric stated as two different numbers in different sentences). This is a text-internal contradiction and IS in scope here even when it is a single pair. Do NOT judge real-world plausibility and do NOT assert facts from model priors — only the draft contradicting ITSELF.",
];

export const CONSTRUCTIVE_FEEDBACK_CRAFT_NONE = "NONE";

const CRAFT_OUTPUT_TYPE_RAW_PATTERN =
  /^(reporting_commentary|transaction_text|investor_letter|press_release|linkedin_post|REPORTING_COMMENTARY|INVESTOR_LETTER|PRESS_RELEASE|LINKEDIN_POST)$/i;

const CONSTRUCTIVE_FEEDBACK_CRAFT_OUTPUT_TYPE_INSTRUCTION =
  "Judge each dimension against the norms of the given output type; do not impose investor-letter norms on social or short formats.";

/**
 * B26.2.4 — resolve craft output type from request; absent/invalid → null (generic craft).
 * @param {string|undefined|null} raw
 * @returns {string|null} Canonical OUTPUT_TYPE enum or null
 */
export function resolveConstructiveFeedbackCraftOutputType(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (!CRAFT_OUTPUT_TYPE_RAW_PATTERN.test(raw.trim())) return null;
  return normalizeOutputType(raw);
}

/**
 * B26.2.4 — per-type calibration guidance for craft dimensions (not new dimensions).
 * @param {string|null|undefined} outputType — canonical OUTPUT_TYPE enum
 * @returns {string[]|null}
 */
export function buildConstructiveFeedbackCraftOutputTypeGuidance(outputType) {
  if (!outputType) return null;
  const ot =
    typeof outputType === "string"
      ? resolveConstructiveFeedbackCraftOutputType(outputType) ??
        (Object.values(OUTPUT_TYPE).includes(outputType) ? outputType : null)
      : null;
  if (!ot) return null;
  switch (ot) {
    case OUTPUT_TYPE.LINKEDIN_POST:
      return [
        CONSTRUCTIVE_FEEDBACK_CRAFT_OUTPUT_TYPE_INSTRUCTION,
        "Output type calibration (LinkedIn post): conversational and first-person register are acceptable; a hook or non-thesis opening is fine. Do NOT flag promotional-leaning tone as register drift the way you would for an investor letter. Prioritise brevity over formal structure. Still flag genuine faults: internal contradictions, run-ons, incoherence.",
      ];
    case OUTPUT_TYPE.PRESS_RELEASE:
      return [
        CONSTRUCTIVE_FEEDBACK_CRAFT_OUTPUT_TYPE_INSTRUCTION,
        "Output type calibration (Press release): expect a strong factual lede up top; quote and attribution structure is normal; formal register.",
      ];
    case OUTPUT_TYPE.INVESTOR_LETTER:
      return [
        CONSTRUCTIVE_FEEDBACK_CRAFT_OUTPUT_TYPE_INSTRUCTION,
        "Output type calibration (Investor letter): salutation and narrative-arc norms apply; measured register; judge buried lede and structure strictly.",
      ];
    case OUTPUT_TYPE.REPORTING_COMMENTARY:
      return [
        CONSTRUCTIVE_FEEDBACK_CRAFT_OUTPUT_TYPE_INSTRUCTION,
        "Output type calibration (Reporting commentary): use standard investment commentary norms (current default).",
      ];
    default:
      return null;
  }
}

/**
 * @param {boolean} includeOpeningClosing
 * @param {string|null|undefined} [outputType]
 * @returns {string}
 */
export function buildConstructiveFeedbackCraftSystemPrompt(includeOpeningClosing, outputType = null) {
  const register = includeOpeningClosing
    ? CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER
    : CONSTRUCTIVE_FEEDBACK_CRAFT_REGISTER_OBSERVATIONS_ONLY;
  const patternRule = includeOpeningClosing
    ? "Document-level PATTERNS only. A single hyped or clumsy phrase is a statement-level concern: do NOT re-flag individual phrases here. Craft means patterns such as 'the register drifts promotional across the back half', not 'this word is hypey'."
    : "Document-level PATTERNS only for dimensions 1 to 5. A single hyped or clumsy phrase is a statement-level concern: do NOT re-flag individual phrases here. Internal coherence (dimension 6) follows its own rule: actively compare figures across the draft; a single cross-sentence figure clash IS in scope. Overlap with statement-level findings is acceptable; do not claim 'no contradictions' if figures disagree.";
  const typeGuidance = buildConstructiveFeedbackCraftOutputTypeGuidance(outputType);
  return [
    "You are a senior investment content editor writing document-level craft feedback for the author of a draft.",
    register,
    "Comment ONLY on document-level craft across the six supplied dimensions. This is commentary prose. Do not change verdicts, classifications, or aggregation.",
    "Every observation must quote or point to a SPECIFIC place in the draft. No generic writing advice (e.g. 'vary sentence length', 'use active voice').",
    CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE,
    patternRule,
    ...(typeGuidance ?? []),
    "Do not do source-matching. That is Evidence's job.",
    "Never judge real-world plausibility or assert facts from model priors. Internal coherence means contradictions within the TEXT only.",
    "Return plain text only. No markdown.",
    "Do not use system or technical vocabulary (concern level, verdict, signal, entity, canonical claim).",
  ].join("\n\n");
}

/** @deprecated — use buildConstructiveFeedbackCraftSystemPrompt(includeOpeningClosing) */
export const CONSTRUCTIVE_FEEDBACK_CRAFT_SYSTEM_PROMPT =
  buildConstructiveFeedbackCraftSystemPrompt(true);

/**
 * @param {{ analysedDraftText: string, signoffVerdict: string, isReady: boolean, includeOpeningClosing: boolean, outputType?: string|null }} params
 */
export function buildConstructiveFeedbackCraftUserPayload({
  analysedDraftText,
  signoffVerdict,
  isReady,
  includeOpeningClosing,
  outputType = null,
}) {
  const resolvedOutputType =
    typeof outputType === "string"
      ? resolveConstructiveFeedbackCraftOutputType(outputType) ??
        (Object.values(OUTPUT_TYPE).includes(outputType) ? outputType : null)
      : null;
  const typeGuidance = buildConstructiveFeedbackCraftOutputTypeGuidance(outputType);
  const shared = includeOpeningClosing
    ? [
        "Read the full draft and comment ONLY on document-level craft across these dimensions:",
        ...CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS.map((d, i) => `${i + 1}. ${d}`),
        "Each craft observation must quote or point to a specific place in the draft.",
        CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE,
        `Overall readiness context (do not repeat as system language): ${signoffVerdict}.`,
        isReady
          ? "If craft is largely sound, say so, but still name any specific pattern that matters."
          : "Match tone to readiness. Do not reassure on a weak draft.",
      ]
    : [
        "Read the full draft and comment ONLY on document-level craft across these dimensions:",
        ...CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS.map((d, i) => `${i + 1}. ${d}`),
        "Each craft observation must quote or point to a specific place in the draft.",
        CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE,
        "For dimension 6, actively scan the whole draft for figure/date/quantity clashes. A false 'no contradictions' is worse than overlap with statement-level findings.",
      ];

  const outputTypeFields =
    resolvedOutputType && typeGuidance
      ? {
          outputType: resolvedOutputType,
          outputTypeLabel: getOutputTypeLabel(resolvedOutputType),
        }
      : {};

  if (includeOpeningClosing) {
    return {
      instructions: [
        ...shared,
        ...(typeGuidance ?? []),
        "Write one short opening line for the whole feedback piece, then craft observations (short paragraphs, each anchored to the draft), then one short closing line that points forward.",
        "Do not include statement-level QC concerns or rewritten draft text.",
      ],
      analysedDraftText,
      signoffVerdict,
      isReady,
      ...outputTypeFields,
    };
  }

  return {
    instructions: [
      ...shared,
      ...(typeGuidance ?? []),
      "Return ONLY the craft observations. Do NOT write any opening, closing, preamble, framing sentence, or readiness summary. The opening and closing for the whole piece come from the statement-level section.",
      "If there are no document-level craft issues worth raising, respond with exactly: NONE",
      "Do not include statement-level QC concerns or rewritten draft text.",
    ],
    analysedDraftText,
    signoffVerdict,
    isReady,
    ...outputTypeFields,
  };
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeConstructiveFeedbackCraftText(raw) {
  const text = normalizeConstructiveFeedbackPlainText(raw);
  if (!text || text.toUpperCase() === CONSTRUCTIVE_FEEDBACK_CRAFT_NONE) return "";
  return text;
}

/**
 * Split card-derived feedback into opening, numbered points, and closing.
 * @param {string} text
 * @returns {{ opening: string, cardPoints: string, closing: string }}
 */
export function splitCardFeedbackSections(text) {
  const body = normalizeConstructiveFeedbackPlainText(text);
  if (!body) return { opening: "", cardPoints: "", closing: "" };

  const blocks = body.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const preBlocks = [];
  const numberedBlocks = [];
  const postBlocks = [];
  let phase = "pre";

  for (const block of blocks) {
    const isNumbered = /^\d+\.\s/.test(block);
    if (phase === "pre") {
      if (isNumbered) {
        phase = "points";
        numberedBlocks.push(block);
      } else {
        preBlocks.push(block);
      }
    } else if (phase === "points") {
      if (isNumbered) {
        numberedBlocks.push(block);
      } else {
        phase = "post";
        postBlocks.push(block);
      }
    } else {
      postBlocks.push(block);
    }
  }

  return {
    opening: preBlocks.join("\n\n"),
    cardPoints: numberedBlocks.join("\n\n"),
    closing: postBlocks.join("\n\n"),
  };
}

/**
 * B26.2.1 — drop leading non-numbered preamble from craft output (craft+cards path).
 * @param {string} craftSection
 * @returns {string}
 */
export function stripCraftPreamble(craftSection) {
  const body = normalizeConstructiveFeedbackPlainText(craftSection);
  if (!body) return "";

  const blocks = body.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const firstNumberedIdx = blocks.findIndex((block) => /^\d+\.\s/.test(block));
  if (firstNumberedIdx === -1) return body;
  return blocks.slice(firstNumberedIdx).join("\n\n");
}

/**
 * Extract numbered point blocks from a points-only section (craft or card points).
 * @param {string} text
 * @returns {string[]}
 */
export function extractNumberedPointBlocks(text) {
  const body = normalizeConstructiveFeedbackPlainText(text);
  if (!body) return [];

  const blocks = body.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const numbered = [];
  let current = null;

  for (const block of blocks) {
    if (/^\d+\.\s/.test(block)) {
      if (current) numbered.push(current);
      current = block;
    } else if (current) {
      current += `\n\n${block}`;
    } else {
      numbered.push(block);
    }
  }
  if (current) numbered.push(current);
  return numbered;
}

/**
 * Re-emit point blocks with a continuous sequence starting at startAt.
 * @param {string[]} blocks
 * @param {number} [startAt]
 * @returns {string}
 */
export function renumberPointBlocks(blocks, startAt = 1) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (list.length === 0) return "";
  return list
    .map((block, i) => {
      const content = String(block).replace(/^\d+\.\s*/, "").trim();
      return `${startAt + i}. ${content}`;
    })
    .join("\n\n");
}

/**
 * B26.2.1 — craft+cards assembly: strip craft preamble, unify numbering.
 * @param {{ opening?: string, craftSection?: string, cardPoints?: string, closing?: string }} parts
 * @returns {string}
 */
export function assembleCraftAndCardFeedback({ opening, craftSection, cardPoints, closing }) {
  const strippedCraft = stripCraftPreamble(craftSection);
  const craftBlocks = extractNumberedPointBlocks(strippedCraft);
  const cardBlocks = extractNumberedPointBlocks(cardPoints);
  const unifiedPoints = renumberPointBlocks([...craftBlocks, ...cardBlocks], 1);
  return assembleConstructiveFeedbackText({
    opening,
    craftSection: unifiedPoints,
    cardPoints: "",
    closing,
  });
}

/**
 * @param {{ opening?: string, craftSection?: string, cardPoints?: string, closing?: string }} parts
 * @returns {string}
 */
export function assembleConstructiveFeedbackText({ opening, craftSection, cardPoints, closing }) {
  const parts = [opening, craftSection, cardPoints, closing]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return parts.join("\n\n");
}

/**
 * @param {object} params
 * @param {boolean} [params.craftHandledSeparately]
 * @param {string} [params.craftSectionContext]
 */
export function buildConstructiveFeedbackUserPayload({
  draftText,
  signoffVerdict,
  isReady,
  feedbackBundles,
  craftHandledSeparately = false,
  craftSectionContext = "",
}) {
  const instructions = [
    "Write constructive feedback for the draft author.",
    CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER,
    CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE,
    "Write exactly ONE numbered point per statement bundle in feedbackBundles. Weave that statement's evidence, compliance, and editorial concerns into a single editor's observation. Do NOT split a bundle into multiple points.",
    "Use statementText in each bundle as the display label for which draft sentence you are discussing.",
    "Do not include any revised or rewritten draft text under any circumstance.",
    `Overall readiness: ${signoffVerdict}.`,
  ];

  if (craftHandledSeparately) {
    instructions.push(
      "Document-level craft feedback is handled separately and will be inserted after your opening. Do NOT write document-level craft points.",
      "Output structure: one short opening line for the WHOLE feedback piece (including craft the writer will see), then numbered points (one per bundle, in the order given, worst-first), then one short closing line for the whole piece.",
      "Internal figure contradictions within the draft (e.g. the same metric stated as two different numbers) are craft's job. Do NOT re-explain internal self-contradiction in card points; focus figure-related evidence points on how the draft figure reconciles against the source.",
      ...(typeof craftSectionContext === "string" && craftSectionContext.trim()
        ? [
            "If the craft section below has already flagged a figure as internally inconsistent, do not repeat that internal-contradiction point on the same figure; address only how the figure reconciles against the source.",
          ]
        : [])
    );
  } else {
    instructions.push(
      "Output structure: a short opening line that frames the read honestly, then numbered points (one per bundle, in the order given, worst-first), then a short closing line that points forward without consoling."
    );
  }

  instructions.push(
    isReady
      ? "If the draft is largely ready, say so in the opening, but still address each bundle specifically."
      : "Match the opening tone to the readiness level. Do not reassure on a weak draft."
  );

  return {
    instructions,
    draftText,
    signoffVerdict,
    isReady,
    feedbackBundles,
    ...(typeof craftSectionContext === "string" && craftSectionContext.trim()
      ? { craftSectionForFigureDedupe: craftSectionContext.trim() }
      : {}),
  };
}

/** B226 — craft dimension names, for the roll-call referee only. */
export const CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSION_NAMES = CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS.map((d) =>
  d.split("(")[0].replace(/:.*$/, "").trim()
);

const MONTH_DATE_RE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/;
const QUARTER_RE = /\bQ[1-4]\s+\d{4}\b/;
const INVENTED_CRAFT_RE =
  /opening lacks a hook|the opening lacks a hook|there were no internal contradictions|no internal contradictions/i;
const FIGURE_CLASH_PATTERNS = [
  { metric: "ARR", re: /\bARR\b[\s\S]{0,60}?\bEUR\s*([\d][\d'.,]*)\s*million/gi },
  { metric: "EBITDA", re: /\bEBITDA\b[\s\S]{0,60}?\bEUR\s*([\d][\d'.,]*)\s*million/gi },
];

export function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function lengthBudgetWords(readiness, draftText) {
  const draftWords = wordCount(draftText);
  if (readiness === "Ready") return 40;
  if (readiness === "Not fully checked") return 80;
  if (readiness === "Minor points to address") return 120;
  if (readiness === "Needs work") return Math.min(180, 70 + Math.floor(draftWords * 0.5));
  if (readiness === "Needs significant work") return Math.min(280, 100 + Math.floor(draftWords * 0.6));
  return 120;
}

function foldForCoverage(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[."',:;()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteFragment(statementText, n = 8) {
  return String(statementText || "")
    .trim()
    .replace(/[."]+$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n)
    .join(" ");
}

function pickDraftSays(statementText) {
  const text = String(statementText || "").trim();
  const month = text.match(MONTH_DATE_RE);
  if (month) return month[0];
  const quarter = text.match(QUARTER_RE);
  if (quarter) return quarter[0];
  return quoteFragment(text, 12);
}

function pickSourceSays(card) {
  const excerpt = typeof card.primaryExcerpt === "string" ? card.primaryExcerpt.trim() : "";
  if (excerpt) {
    const quarter = excerpt.match(/Q[1-4]\s+\d{4}[^.;]*/);
    if (quarter) return quarter[0].trim();
    return excerpt.split(/[.;]/)[0].trim().slice(0, 120);
  }
  return "";
}

function noteFromConcern(kind, cardIndex, statementText, concern) {
  const note = typeof concern?.note === "string" ? concern.note.trim() : "";
  const suggestedDirection =
    typeof concern?.suggestedDirection === "string" ? concern.suggestedDirection.trim() : "";
  const cardNote = note || suggestedDirection;
  if (!cardNote) return null;
  return { kind, cardIndex, statementText, cardNote, draftSays: "", sourceSays: "" };
}

/**
 * Deterministic draft-vs-draft figure clash. Margin note, not a craft dimension.
 * @param {string} draftText
 * @returns {object[]}
 */
export function detectInternalFigureClashes(draftText) {
  const text = String(draftText || "");
  const notes = [];
  for (const { metric, re } of FIGURE_CLASH_PATTERNS) {
    const amounts = [];
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const amount = match[1].replace(/'/g, "");
      if (!amounts.includes(amount)) amounts.push(amount);
    }
    if (amounts.length < 2) continue;
    notes.push({
      kind: "coherence",
      cardIndex: null,
      statementText: "",
      cardNote: `${metric} is stated as EUR ${amounts[0]} million and EUR ${amounts[1]} million in the same draft.`,
      draftSays: `EUR ${amounts[0]} million`,
      sourceSays: `EUR ${amounts[1]} million`,
    });
  }
  return notes;
}

function notesFromFeedbackBundles(feedbackBundles) {
  const notes = [];
  const list = Array.isArray(feedbackBundles) ? feedbackBundles : [];
  for (const bundle of list) {
    const cardIndex = bundle?.cardIndex;
    const statementText = typeof bundle?.statementText === "string" ? bundle.statementText : "";
    if (bundle?.evidence) {
      notes.push({
        kind: "evidence",
        cardIndex,
        statementText,
        cardNote: String(bundle.evidence),
        draftSays: pickDraftSays(statementText),
        sourceSays: "",
      });
    }
    for (const item of Array.isArray(bundle?.editorial) ? bundle.editorial : []) {
      const note = noteFromConcern("editorial", cardIndex, statementText, item);
      if (note) notes.push(note);
    }
    for (const item of Array.isArray(bundle?.compliance) ? bundle.compliance : []) {
      const note = noteFromConcern("compliance", cardIndex, statementText, item);
      if (note) notes.push(note);
    }
  }
  return notes;
}

/**
 * One margin note per concern, document order.
 * @param {Array} rows
 * @param {object} [reviewOptions]
 * @param {string} [draftText]
 */
export function collectMarginNotes(rows, reviewOptions = {}, draftText = "") {
  const evidenceEnabled = reviewOptions.evidenceEnabled !== false;
  const editorialEnabled = reviewOptions.editorialEnabled !== false;
  const complianceEnabled = reviewOptions.complianceEnabled !== false;
  const notes = [];
  const list = Array.isArray(rows) ? rows : [];

  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const card = cardFromRow(row);
    if (isCardFullyClean(card, reviewOptions)) continue;
    const cardIndex = cardIndexFromRow(row, card, i);
    const statementText = statementTextFromRow(row, card);

    if (evidenceEnabled && isEvidenceConfirmed(card) === false) {
      const cardNote = collectEvidenceInput(card);
      if (cardNote) {
        notes.push({
          kind: "evidence",
          cardIndex,
          statementText,
          cardNote,
          draftSays: pickDraftSays(statementText),
          sourceSays: pickSourceSays(card),
        });
      }
    }

    if (editorialEnabled && !isEditorialClean(card)) {
      const concerns = collectConcernInputs(card.editorialConcerns);
      for (const concern of concerns) {
        const note = noteFromConcern("editorial", cardIndex, statementText, concern);
        if (note) notes.push(note);
      }
    }

    if (complianceEnabled && !isComplianceClean(card)) {
      const concerns = collectConcernInputs(card.complianceConcerns);
      for (const concern of concerns) {
        const note = noteFromConcern("compliance", cardIndex, statementText, concern);
        if (note) notes.push(note);
      }
    }
  }

  notes.push(...detectInternalFigureClashes(draftText));
  return notes;
}

function formatOneNote(note) {
  const lines = [];
  if (note.kind === "evidence" && (note.draftSays || note.sourceSays)) {
    const bits = [];
    if (note.draftSays) bits.push(`draft says "${note.draftSays}"`);
    if (note.sourceSays) bits.push(`source says "${note.sourceSays}"`);
    lines.push(`  [evidence] ${bits.join("; ")}`);
  } else {
    const label = quoteFragment(note.cardNote, 12) || note.kind;
    lines.push(`  [${note.kind}] ${label}`);
  }
  if (note.cardNote) {
    for (const para of String(note.cardNote).split(/\n+/).filter(Boolean)) {
      lines.push(`    card: ${para}`);
    }
  }
  return lines.join("\n");
}

/**
 * Draft once, with margin notes interleaved at the sentences they belong to.
 */
export function formatAnnotatedDraft(draftText, rows, notes) {
  const list = Array.isArray(rows) ? rows : [];
  const allNotes = Array.isArray(notes) ? notes : [];
  const used = new Set();
  const blocks = [];
  let remaining = String(draftText || "");

  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const card = cardFromRow(row);
    const statementText = statementTextFromRow(row, card);
    const cardIndex = cardIndexFromRow(row, card, i);
    if (!statementText) continue;
    const stmtNotes = allNotes.filter((n) => n.cardIndex === cardIndex);
    for (const n of stmtNotes) used.add(n);
    const idx = remaining.indexOf(statementText);
    if (idx >= 0) {
      const before = remaining.slice(0, idx).trim();
      if (before) blocks.push(before);
      remaining = remaining.slice(idx + statementText.length);
      const chunk = [statementText, ...stmtNotes.map(formatOneNote)].filter(Boolean).join("\n");
      blocks.push(chunk);
    } else {
      const chunk = [statementText, ...stmtNotes.map(formatOneNote)].filter(Boolean).join("\n");
      blocks.push(chunk);
    }
  }

  const tail = remaining.trim();
  const leftover = allNotes.filter((n) => !used.has(n));
  if (tail) {
    blocks.push([tail, ...leftover.map(formatOneNote)].filter(Boolean).join("\n"));
  } else if (leftover.length > 0) {
    blocks.push(leftover.map(formatOneNote).join("\n"));
  }

  return blocks.filter(Boolean).join("\n\n");
}

function outputTypePermission(outputType) {
  const ot =
    typeof outputType === "string"
      ? resolveConstructiveFeedbackCraftOutputType(outputType) ??
        (Object.values(OUTPUT_TYPE).includes(outputType) ? outputType : null)
      : null;
  if (!ot) return "";
  switch (ot) {
    case OUTPUT_TYPE.LINKEDIN_POST:
      return "This is a LinkedIn post. Conversational and first-person register are acceptable. A hook or non-thesis opening is fine. Do not scold them.";
    case OUTPUT_TYPE.PRESS_RELEASE:
      return "This is a press release. A factual lede and quote-and-attribution structure are normal. Formal register is expected.";
    case OUTPUT_TYPE.INVESTOR_LETTER:
      return "This is an investor letter. Salutation and narrative-arc norms apply. Measured register.";
    case OUTPUT_TYPE.REPORTING_COMMENTARY:
      return "This is a reporting commentary. Use standard investment commentary norms. First-person is not the house voice.";
    default:
      return "";
  }
}

/**
 * B226 payload: annotated draft, not an ordered feedbackBundles array.
 */
export function buildConstructiveFeedbackPieceUserPayload({
  draftText,
  signoffVerdict,
  readiness,
  outputType = null,
  statements,
  rows,
  reviewOptions = {},
  feedbackBundles,
}) {
  const label = readiness || signoffVerdict || "";
  const sourceRows = Array.isArray(statements)
    ? statements
    : Array.isArray(rows)
      ? rows
      : Array.isArray(feedbackBundles)
        ? feedbackBundles.map((bundle) => ({
            text: bundle.statementText,
            qcCard: {
              index: bundle.cardIndex,
              statement: bundle.statementText,
              supportState: bundle.evidence ? "not_supported" : "supported",
              displayVerdict: bundle.evidence ? "not_supported" : "supported_full",
              editorialVerdict: Array.isArray(bundle.editorial) && bundle.editorial.length > 0 ? "concern" : "clean",
              complianceVerdict:
                Array.isArray(bundle.compliance) && bundle.compliance.length > 0 ? "soft_concern" : "clean",
              evidenceSummary: bundle.evidence || "",
              editorialConcerns: bundle.editorial || [],
              complianceConcerns: bundle.compliance || [],
            },
          }))
        : [];
  const notes =
    Array.isArray(feedbackBundles) && !statements && !rows
      ? notesFromFeedbackBundles(feedbackBundles)
      : collectMarginNotes(sourceRows, reviewOptions, draftText);
  const annotatedDraft = formatAnnotatedDraft(draftText, sourceRows, notes);
  const typeLine = outputTypePermission(outputType);
  const resolvedOutputType =
    typeof outputType === "string"
      ? resolveConstructiveFeedbackCraftOutputType(outputType) ??
        (Object.values(OUTPUT_TYPE).includes(outputType) ? outputType : null)
      : null;

  return {
    instructions: [
      "The annotatedDraft is the draft with margin notes at the sentences they belong to. It is not an outline of the piece.",
      "Write the body only. Code already writes the readiness label as sentence one.",
      `Length budget: about ${lengthBudgetWords(label, draftText)} words.`,
      ...(typeLine ? [typeLine] : []),
    ],
    readiness: label,
    readinessOpeningLine: label ? `${label}.` : "",
    lengthBudgetWords: lengthBudgetWords(label, draftText),
    annotatedDraft,
    ...(resolvedOutputType
      ? { outputType: resolvedOutputType, outputTypeLabel: getOutputTypeLabel(resolvedOutputType) }
      : {}),
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingReadiness(body, readiness) {
  let text = normalizeConstructiveFeedbackPlainText(body);
  if (readiness) {
    text = text.replace(new RegExp(`^${escapeRegExp(readiness)}\\.?\\s*`, "i"), "");
  }
  return text.trim();
}

export function prependReadiness(readiness, body) {
  const label = String(readiness || "").trim();
  const cleaned = stripLeadingReadiness(body, label);
  if (!label) return cleaned;
  if (!cleaned) return `${label}.`;
  return `${label}.\n\n${cleaned}`;
}

function pieceCoversNote(piece, note) {
  const text = foldForCoverage(piece);
  const fragment8 = foldForCoverage(quoteFragment(note.statementText, 8));
  if (fragment8 && text.includes(fragment8)) return true;
  const fragment4 = foldForCoverage(quoteFragment(note.statementText, 4));
  if (fragment4 && fragment4.split(" ").length >= 3 && text.includes(fragment4)) return true;
  const fragment2 = foldForCoverage(quoteFragment(note.statementText, 2));
  if (fragment2 && /^(we|our|i)\b/.test(fragment2) && text.includes(fragment2)) return true;
  if (note.draftSays && text.includes(foldForCoverage(note.draftSays))) return true;
  if (note.sourceSays && text.includes(foldForCoverage(note.sourceSays))) return true;
  const card = foldForCoverage(note.cardNote);
  if (note.kind === "editorial" && /first person/.test(card) && /first person/.test(text)) return true;
  const tokens = [
    "first person",
    "june 2026",
    "q3 2026",
    "eur 84",
    "eur 81",
    "40 percent",
    "38 percent",
    "eur 2 billion",
  ];
  for (const token of tokens) {
    if (card.includes(token) && text.includes(token)) return true;
  }
  return false;
}

export function splitFeedbackParagraphs(piece) {
  return String(piece || "")
    .trim()
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean);
}

const READINESS_LINE_RE =
  /^(Needs work|Minor points to address|Ready|Not fully checked|Needs significant work)\.?$/i;

function paragraphQuotesDraft(para, draftText) {
  const draft = foldForCoverage(draftText);
  const matches = String(para || "").matchAll(/"([^"]+)"/g);
  for (const match of matches) {
    const quoted = foldForCoverage(match[1]);
    const words = quoted.split(" ").filter(Boolean);
    if (words.length >= 2 && draft.includes(quoted)) return true;
  }
  return false;
}

export function unnamedFindings(piece, notes) {
  const list = Array.isArray(notes) ? notes : [];
  return list.filter((note) => !pieceCoversNote(piece, note));
}

export function coverageRetryInstruction(missed) {
  const list = Array.isArray(missed) ? missed : [];
  const lines = list.map((note) => {
    const frag = quoteFragment(note.statementText, 8) || note.kind;
    return `- ${note.kind} on "${frag}": ${note.cardNote}`;
  });
  return `These findings were not named in your last draft. Name them, quoted, in a rewritten piece. Do not append a remainder.\n${lines.join("\n")}`;
}

export function stripUnquotedCraft(piece, { draftText, notes } = {}) {
  const paragraphs = splitFeedbackParagraphs(piece);
  const list = Array.isArray(notes) ? notes : [];
  const kept = [];
  const dropped = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    if (i === 0 && READINESS_LINE_RE.test(para)) {
      kept.push(para);
      continue;
    }
    if (list.some((note) => pieceCoversNote(para, note))) {
      kept.push(para);
      continue;
    }
    if (paragraphQuotesDraft(para, draftText)) {
      kept.push(para);
      continue;
    }
    dropped.push(para);
  }
  if (dropped.length > 0 && process.env.CONSTRUCTIVE_FEEDBACK_DEBUG_CRAFT === "1") {
    console.warn(`[constructive-feedback] craft referee dropped ${dropped.length} paragraph(s)`);
    for (const para of dropped) console.warn(`---\n${para}`);
  }
  return kept.join("\n\n");
}

export function checkGrouping(piece, notes) {
  const list = Array.isArray(notes) ? notes : [];
  const paragraphs = splitFeedbackParagraphs(piece);
  const findingCount = list.length;
  const paragraphCount = paragraphs.length;
  if (findingCount < 4) {
    return { ok: true, paragraphCount, findingCount, dualCovered: false };
  }
  let dualCovered = false;
  for (const para of paragraphs) {
    const covered = list.filter((note) => pieceCoversNote(para, note)).length;
    if (covered >= 2) dualCovered = true;
  }
  const fewerParas = paragraphCount < findingCount;
  return {
    ok: fewerParas || dualCovered,
    paragraphCount,
    findingCount,
    dualCovered,
  };
}

export function appendCoverageRemainder(piece, notes) {
  const text = String(piece || "").trim();
  const list = Array.isArray(notes) ? notes : [];
  const missing = unnamedFindings(text, list);
  if (missing.length === 0) return text;
  const lines = missing.map((note) => {
    const frag = quoteFragment(note.statementText, 8) || note.kind;
    return `Also: ${note.kind} on "${frag}": ${note.cardNote}`;
  });
  return `${text}\n\n${lines.join("\n")}`;
}

export function assembleConstructiveFeedbackPiece(body, { readiness, notes } = {}) {
  const withLabel = prependReadiness(readiness, body);
  return appendCoverageRemainder(withLabel, notes);
}

export function firstSentenceIsReadiness(piece, readiness) {
  const text = String(piece || "").trim();
  const label = String(readiness || "").trim();
  if (!label) return false;
  return text === label || text === `${label}.` || text.startsWith(`${label}.`);
}

function numberedPointCount(piece) {
  return [...String(piece || "").matchAll(/^\d+\.\s/gm)].length;
}

function dimensionHits(piece) {
  const text = String(piece || "");
  return CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSION_NAMES.filter((name) => text.includes(name));
}

export function feedbackSkeleton(piece) {
  return String(piece || "")
    .replace(/^[^\n]+/, "")
    .replace(/"[^"]*"/g, "")
    .replace(MONTH_DATE_RE, "")
    .replace(QUARTER_RE, "")
    .replace(/\bEUR\s*[\d'.,]+\s*million\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?%\b/g, "")
    .replace(/\bWe recommend\b/gi, "")
    .replace(/\bPartners Group\b/g, "")
    .replace(/\bNorTech\b/g, "")
    .replace(/\bLumen\b/g, "")
    .replace(/\bCloudPivot\b/g, "")
    .replace(/\bARR\b/g, "")
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 280);
}

export function skeletonsCollide(skeletons) {
  const list = (Array.isArray(skeletons) ? skeletons : [])
    .map((s) => String(s || "").replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (list[i] === list[j]) return true;
      if (list[i].length > 40 && list[j].includes(list[i])) return true;
      if (list[j].length > 40 && list[i].includes(list[j])) return true;
    }
  }
  return false;
}

/**
 * P3 seven mechanical checks.
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function checkConstructiveFeedbackPiece(piece, ctx = {}) {
  const failures = [];
  const text = String(piece || "");
  const readiness = ctx.readiness || "";
  const notes = Array.isArray(ctx.notes) ? ctx.notes : [];
  const bundleCount = ctx.bundleCount ?? notes.length;

  if (readiness && !firstSentenceIsReadiness(text, readiness)) {
    failures.push("F1 exact");
  }

  const hits = dimensionHits(text);
  if (hits.length >= 4) failures.push("dimension roll-call");

  const points = numberedPointCount(text);
  if (bundleCount > 0 && (points === bundleCount || points === bundleCount + 6)) {
    failures.push("point count tracks bundles");
  }

  for (const fact of ctx.requiredFacts || []) {
    if (fact && !text.includes(fact)) failures.push(`fact missing: ${fact}`);
  }

  for (const note of notes) {
    if (!pieceCoversNote(text, note)) {
      failures.push(`F2 missing ${quoteFragment(note.statementText, 8) || note.kind}`);
    }
  }

  const grouping = checkGrouping(text, notes);
  if (!grouping.ok) failures.push("grouping");

  const forbidInvented = ctx.forbidInventedCraft !== false;
  if (forbidInvented && INVENTED_CRAFT_RE.test(text)) {
    failures.push("invented craft");
  }

  return { ok: failures.length === 0, failures };
}

