// lib/event-type.js
//
// X3.0: Event Type taxonomy — institutional event types only (no output formats).
// Authoritative enum + labels; prompt framing for Generate/Rewrite.

/** @readonly */
export const EVENT_TYPE = {
  NEW_DIRECT_INVESTMENT: "NEW_DIRECT_INVESTMENT",
  ADD_ON_DIRECT_INVESTMENT: "ADD_ON_DIRECT_INVESTMENT",
  DIRECT_INVESTMENT_EXIT: "DIRECT_INVESTMENT_EXIT",
  DIRECT_INVESTMENT_REVALUATION: "DIRECT_INVESTMENT_REVALUATION",
  NEW_SECONDARY_INVESTMENT: "NEW_SECONDARY_INVESTMENT",
  NEW_PRIMARY_COMMITMENT: "NEW_PRIMARY_COMMITMENT",
  FUND_CAPITAL_CALL: "FUND_CAPITAL_CALL",
  FUND_DISTRIBUTION: "FUND_DISTRIBUTION",
  FUND_REVALUATION: "FUND_REVALUATION",
  SPECIAL_TOPIC: "SPECIAL_TOPIC",
};

const EVENT_TYPE_LABELS = {
  [EVENT_TYPE.NEW_DIRECT_INVESTMENT]: "New direct investment",
  [EVENT_TYPE.ADD_ON_DIRECT_INVESTMENT]: "Direct investment add-on",
  [EVENT_TYPE.DIRECT_INVESTMENT_EXIT]: "Direct investment exit",
  [EVENT_TYPE.DIRECT_INVESTMENT_REVALUATION]: "Direct investment revaluation",
  [EVENT_TYPE.NEW_SECONDARY_INVESTMENT]: "New secondary investment",
  [EVENT_TYPE.NEW_PRIMARY_COMMITMENT]: "New fund commitment",
  [EVENT_TYPE.FUND_CAPITAL_CALL]: "Fund capital call",
  [EVENT_TYPE.FUND_DISTRIBUTION]: "Fund distribution",
  [EVENT_TYPE.FUND_REVALUATION]: "Fund revaluation",
  [EVENT_TYPE.SPECIAL_TOPIC]: "Other update",
};

/** Screen order. Other update is last and is the default when none is chosen. */
const EVENT_TYPE_OPTIONS = [
  EVENT_TYPE.NEW_DIRECT_INVESTMENT,
  EVENT_TYPE.ADD_ON_DIRECT_INVESTMENT,
  EVENT_TYPE.DIRECT_INVESTMENT_EXIT,
  EVENT_TYPE.DIRECT_INVESTMENT_REVALUATION,
  EVENT_TYPE.NEW_SECONDARY_INVESTMENT,
  EVENT_TYPE.NEW_PRIMARY_COMMITMENT,
  EVENT_TYPE.FUND_CAPITAL_CALL,
  EVENT_TYPE.FUND_DISTRIBUTION,
  EVENT_TYPE.FUND_REVALUATION,
  EVENT_TYPE.SPECIAL_TOPIC,
].map((id) => ({ id, label: EVENT_TYPE_LABELS[id] }));

const VALID_EVENT_TYPES = new Set(Object.values(EVENT_TYPE));
const DEFAULT_EVENT_TYPE = EVENT_TYPE.SPECIAL_TOPIC;

/** Legacy scenario values → canonical event type (one-way map for backward compatibility). */
const LEGACY_SCENARIO_TO_EVENT_TYPE = {
  new_investment: EVENT_TYPE.NEW_DIRECT_INVESTMENT,
  direct_investment: EVENT_TYPE.NEW_DIRECT_INVESTMENT,
  direct_investment_realisation: EVENT_TYPE.DIRECT_INVESTMENT_EXIT,
  fund_commitment: EVENT_TYPE.NEW_PRIMARY_COMMITMENT,
  fund_capital_call: EVENT_TYPE.FUND_CAPITAL_CALL,
  fund_distribution: EVENT_TYPE.FUND_DISTRIBUTION,
  linkedin_post: EVENT_TYPE.NEW_DIRECT_INVESTMENT, // was output format; map to default-like
};

/**
 * Normalize raw scenario/eventType from request to canonical EVENT_TYPE.
 * @param {string} [raw]
 * @returns {string} Canonical EVENT_TYPE enum or default
 */
/** Older request value. Not in the EVENT_TYPE enum. NEW_PRIMARY_COMMITMENT is the current id. */
export const LEGACY_EVENT_TYPE = {
  NEW_FUND_COMMITMENT: "NEW_FUND_COMMITMENT",
};

export function normalizeEventType(raw) {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_EVENT_TYPE;
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase().replace(/-/g, "_");
  if (upper === LEGACY_EVENT_TYPE.NEW_FUND_COMMITMENT) return LEGACY_EVENT_TYPE.NEW_FUND_COMMITMENT;
  const legacy = LEGACY_SCENARIO_TO_EVENT_TYPE[trimmed] ?? LEGACY_SCENARIO_TO_EVENT_TYPE[trimmed.toLowerCase()];
  if (legacy) return legacy;
  if (VALID_EVENT_TYPES.has(trimmed)) return trimmed;
  if (VALID_EVENT_TYPES.has(upper)) return upper;
  return DEFAULT_EVENT_TYPE;
}

/**
 * Deterministic display label for event type.
 * @param {string} eventType - Canonical EVENT_TYPE enum
 * @returns {string}
 */
export function getEventTypeLabel(eventType) {
  if (eventType === LEGACY_EVENT_TYPE.NEW_FUND_COMMITMENT) return "New fund commitment";
  return EVENT_TYPE_LABELS[eventType] ?? EVENT_TYPE_LABELS[DEFAULT_EVENT_TYPE];
}

/**
 * Event-specific framing text for Generate/Rewrite prompts (Phase 1 prompt shaping).
 * Default wording: use "portfolio company"; use "portfolio asset" only when context indicates real estate or infrastructure.
 * @param {string} eventType - Canonical EVENT_TYPE enum
 * @returns {string} Guidance block to inject into prompt, or empty string if unknown
 */
export function getEventTypeFraming(eventType) {
  const wording =
    'Use "portfolio company" by default. Use "portfolio asset" only when context clearly indicates real estate or infrastructure.';
  const blocks = {
    [EVENT_TYPE.NEW_DIRECT_INVESTMENT]: `Thesis-forward, company focus, investment merits, thematic relevance. Value creation plan, sourcing angle. ${wording}`,
    [EVENT_TYPE.ADD_ON_DIRECT_INVESTMENT]: `As for new direct investment, plus: why invest more now. Reference how the original investment is performing (if known from sources). ${wording}`,
    [EVENT_TYPE.DIRECT_INVESTMENT_EXIT]: `Realisation framing, value creation outcomes, return metrics. ${wording}`,
    [EVENT_TYPE.DIRECT_INVESTMENT_REVALUATION]: `Valuation movement explanation. What the firm is doing with management to drive value. Near-term priorities; if issues, actions underway. ${wording}`,
    [EVENT_TYPE.NEW_SECONDARY_INVESTMENT]: `Portfolio description, investment merits, thematic relevance, sourcing angle. Relationship with seller or GPs. Discount to reference NAV secured (if supported). ${wording}`,
    [EVENT_TYPE.NEW_PRIMARY_COMMITMENT]: `Fund description, strategy, target sectors/EVs, portfolio construction expectations. Sourcing and value creation angles, pipeline or seed investments (if supported). Investment merits, thematic relevance. ${wording}`,
    [EVENT_TYPE.FUND_CAPITAL_CALL]: `Purpose of capital call focusing on portfolio investment matters. Investment thesis and value creation plan for relevant portfolio investment(s). Do not state the cash amount of the call. Explicitly avoid procedural/mechanical admin framing (fees/expenses). ${wording}`,
    [EVENT_TYPE.FUND_DISTRIBUTION]: `Name the source of the proceeds. State a ratio such as DPI, or a percentage, when the source gives one. Do not state the cash amount distributed. Brief investment history and the exit details the source supports. Buyer details if relevant; value creation outcomes. ${wording}`,
    [EVENT_TYPE.FUND_REVALUATION]: `NAV movement framing. Largest contributor; what triggered revaluation; context. ${wording}`,
    [EVENT_TYPE.SPECIAL_TOPIC]: "The special instructions set the subject. Do not force thesis or exit framing. Do not turn this into a general company update.",
  };
  return blocks[eventType] ?? "";
}

export { EVENT_TYPE_LABELS, EVENT_TYPE_OPTIONS, DEFAULT_EVENT_TYPE, VALID_EVENT_TYPES };
