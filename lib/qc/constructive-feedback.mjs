/**
 * B26 / B26.1 — Constructive feedback: deterministic bundle selection + plain-text post-filter.
 */

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

/** B26.1 — shared editor register (reused verbatim by B26.2). */
export const CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER = [
  "Editor-to-writer: write as a senior editor who has genuinely read THIS draft and respects the writer's time.",
  "Warm through specificity, not encouragement. Name a strength ONLY where it is specifically true of this draft AND it sharpens or sets up a point. No free-floating or generic praise (e.g. 'strong start', 'on the right track').",
  "No praise-sandwich. Opening frames the read honestly (on a weak draft, say it needs real work — do not reassure). Close points forward; it does not console.",
  "Direct on problems; do not soften into mush. Respect over reassurance.",
  "Per point: third person on the subject, imperative on the fix.",
  "No schoolroom framing ('not permissible', 'is not acceptable'). No system language (concern level, verdict, signal, entity). Plain text only — numbered points, no markdown.",
].join("\n");

/** B26.2.1 — craft+cards register: omits opening/closing framing (contradicts observation-only craft). */
export const CONSTRUCTIVE_FEEDBACK_CRAFT_REGISTER_OBSERVATIONS_ONLY = [
  "Editor-to-writer: write as a senior editor who has genuinely read THIS draft and respects the writer's time.",
  "Warm through specificity, not encouragement. Name a strength ONLY where it is specifically true of this draft AND it sharpens or sets up a point. No free-floating or generic praise (e.g. 'strong start', 'on the right track').",
  "No praise-sandwich.",
  "Direct on problems; do not soften into mush. Respect over reassurance.",
  "Per point: third person on the subject, imperative on the fix.",
  "No schoolroom framing ('not permissible', 'is not acceptable'). No system language (concern level, verdict, signal, entity). Plain text only — numbered points, no markdown.",
].join("\n");

/** B26.2.2 — cap quoted spans when anchoring to long draft sentences (prompt-only; no deterministic truncation). */
export const CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE =
  "When anchoring a point to a long sentence, quote only a short identifying fragment (~8–10 words max). For a long sentence, use opening and closing fragments joined by an ellipsis (e.g. The \"company is profitable … gross merchandise value\" sentence is overly long…) rather than quoting the whole sentence. Short spans already under ~10 words may be quoted as-is.";

export const CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT = [
  "You are a senior investment content editor writing feedback for the author of a draft.",
  CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER,
  CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE,
  "Return plain text only: a short opening line, numbered points (one per statement bundle), and a short closing line. No markdown.",
  "Each numbered point covers one statement bundle only — rationale and direction, never rewritten sentence text.",
  "Do not use system or technical vocabulary (concern level, verdict, signal, entity, canonical claim).",
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

/**
 * @param {boolean} includeOpeningClosing
 * @returns {string}
 */
export function buildConstructiveFeedbackCraftSystemPrompt(includeOpeningClosing) {
  const register = includeOpeningClosing
    ? CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER
    : CONSTRUCTIVE_FEEDBACK_CRAFT_REGISTER_OBSERVATIONS_ONLY;
  const patternRule = includeOpeningClosing
    ? "Document-level PATTERNS only. A single hyped or clumsy phrase is a statement-level concern — do NOT re-flag individual phrases here. Craft means patterns such as 'the register drifts promotional across the back half', not 'this word is hypey'."
    : "Document-level PATTERNS only for dimensions 1–5. A single hyped or clumsy phrase is a statement-level concern — do NOT re-flag individual phrases here. Internal coherence (dimension 6) follows its own rule: actively compare figures across the draft; a single cross-sentence figure clash IS in scope. Overlap with statement-level findings is acceptable — do not claim 'no contradictions' if figures disagree.";
  return [
    "You are a senior investment content editor writing document-level craft feedback for the author of a draft.",
    register,
    "Comment ONLY on document-level craft across the six supplied dimensions. This is commentary prose — do not change verdicts, classifications, or aggregation.",
    "Every observation must quote or point to a SPECIFIC place in the draft. No generic writing advice (e.g. 'vary sentence length', 'use active voice').",
    CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE,
    patternRule,
    "Do not do source-matching — that is Evidence's job.",
    "Never judge real-world plausibility or assert facts from model priors. Internal coherence means contradictions within the TEXT only.",
    "Return plain text only. No markdown.",
    "Do not use system or technical vocabulary (concern level, verdict, signal, entity, canonical claim).",
  ].join("\n\n");
}

/** @deprecated — use buildConstructiveFeedbackCraftSystemPrompt(includeOpeningClosing) */
export const CONSTRUCTIVE_FEEDBACK_CRAFT_SYSTEM_PROMPT =
  buildConstructiveFeedbackCraftSystemPrompt(true);

/**
 * @param {{ analysedDraftText: string, signoffVerdict: string, isReady: boolean, includeOpeningClosing: boolean }} params
 */
export function buildConstructiveFeedbackCraftUserPayload({
  analysedDraftText,
  signoffVerdict,
  isReady,
  includeOpeningClosing,
}) {
  const shared = includeOpeningClosing
    ? [
        "Read the full draft and comment ONLY on document-level craft across these dimensions:",
        ...CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS.map((d, i) => `${i + 1}. ${d}`),
        "Each craft observation must quote or point to a specific place in the draft.",
        CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE,
        `Overall readiness context (do not repeat as system language): ${signoffVerdict}.`,
        isReady
          ? "If craft is largely sound, say so — but still name any specific pattern that matters."
          : "Match tone to readiness — do not reassure on a weak draft.",
      ]
    : [
        "Read the full draft and comment ONLY on document-level craft across these dimensions:",
        ...CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS.map((d, i) => `${i + 1}. ${d}`),
        "Each craft observation must quote or point to a specific place in the draft.",
        CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE,
        "For dimension 6, actively scan the whole draft for figure/date/quantity clashes. A false 'no contradictions' is worse than overlap with statement-level findings.",
      ];

  if (includeOpeningClosing) {
    return {
      instructions: [
        ...shared,
        "Write one short opening line for the whole feedback piece, then craft observations (short paragraphs, each anchored to the draft), then one short closing line that points forward.",
        "Do not include statement-level QC concerns or rewritten draft text.",
      ],
      analysedDraftText,
      signoffVerdict,
      isReady,
    };
  }

  return {
    instructions: [
      ...shared,
      "Return ONLY the craft observations. Do NOT write any opening, closing, preamble, framing sentence, or readiness summary — the opening and closing for the whole piece come from the statement-level section.",
      "If there are no document-level craft issues worth raising, respond with exactly: NONE",
      "Do not include statement-level QC concerns or rewritten draft text.",
    ],
    analysedDraftText,
    signoffVerdict,
    isReady,
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
    "Write exactly ONE numbered point per statement bundle in feedbackBundles — weave that statement's evidence, compliance, and editorial concerns into a single editor's observation. Do NOT split a bundle into multiple points.",
    "Use statementText in each bundle as the display label for which draft sentence you are discussing.",
    "Do not include any revised or rewritten draft text under any circumstance.",
    `Overall readiness: ${signoffVerdict}.`,
  ];

  if (craftHandledSeparately) {
    instructions.push(
      "Document-level craft feedback is handled separately and will be inserted after your opening. Do NOT write document-level craft points.",
      "Output structure: one short opening line for the WHOLE feedback piece (including craft the writer will see), then numbered points (one per bundle, in the order given, worst-first), then one short closing line for the whole piece.",
      "Internal figure contradictions within the draft (e.g. the same metric stated as two different numbers) are craft's job — do NOT re-explain internal self-contradiction in card points; focus figure-related evidence points on how the draft figure reconciles against the source.",
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
      ? "If the draft is largely ready, say so in the opening — but still address each bundle specifically."
      : "Match the opening tone to the readiness level — do not reassure on a weak draft."
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
