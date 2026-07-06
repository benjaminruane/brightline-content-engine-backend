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
  [EVENT_TYPE.ADD_ON_DIRECT_INVESTMENT]: "Add-on direct investment",
  [EVENT_TYPE.DIRECT_INVESTMENT_EXIT]: "Direct investment exit",
  [EVENT_TYPE.DIRECT_INVESTMENT_REVALUATION]: "Direct investment revaluation",
  [EVENT_TYPE.NEW_SECONDARY_INVESTMENT]: "New secondary investment",
  [EVENT_TYPE.NEW_PRIMARY_COMMITMENT]: "New primary commitment",
  [EVENT_TYPE.FUND_CAPITAL_CALL]: "Fund capital call",
  [EVENT_TYPE.FUND_DISTRIBUTION]: "Fund distribution",
  [EVENT_TYPE.FUND_REVALUATION]: "Fund revaluation",
  [EVENT_TYPE.SPECIAL_TOPIC]: "Special topic",
};

const VALID_EVENT_TYPES = new Set(Object.values(EVENT_TYPE));
const DEFAULT_EVENT_TYPE = EVENT_TYPE.NEW_DIRECT_INVESTMENT;

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
/** WR1 demo event type (PG writing scaffold); not in full EVENT_TYPE enum. */
export const PG_DEMO_EVENT_TYPE = {
  NEW_FUND_COMMITMENT: "NEW_FUND_COMMITMENT",
};

export function normalizeEventType(raw) {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_EVENT_TYPE;
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase().replace(/-/g, "_");
  if (upper === PG_DEMO_EVENT_TYPE.NEW_FUND_COMMITMENT) return PG_DEMO_EVENT_TYPE.NEW_FUND_COMMITMENT;
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
  if (eventType === PG_DEMO_EVENT_TYPE.NEW_FUND_COMMITMENT) return "New fund commitment";
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
    [EVENT_TYPE.DIRECT_INVESTMENT_REVALUATION]: `Valuation movement explanation. What we are doing with management to drive value. Near-term priorities; if issues, actions underway. ${wording}`,
    [EVENT_TYPE.NEW_SECONDARY_INVESTMENT]: `Portfolio description, investment merits, thematic relevance, sourcing angle. Relationship with seller or GPs. Discount to reference NAV secured (if supported). ${wording}`,
    [EVENT_TYPE.NEW_PRIMARY_COMMITMENT]: `Fund description, strategy, target sectors/EVs, portfolio construction expectations. Sourcing and value creation angles, pipeline or seed investments (if supported). Investment merits, thematic relevance. ${wording}`,
    [EVENT_TYPE.FUND_CAPITAL_CALL]: `Purpose of capital call focusing on portfolio investment matters. Largest component of call. Investment thesis and value creation plan for relevant portfolio investment(s). Explicitly avoid procedural/mechanical admin framing (fees/expenses). ${wording}`,
    [EVENT_TYPE.FUND_DISTRIBUTION]: `Proceeds/DPI tone. Source of proceeds, largest component. Brief investment history, exit details (trigger/outcome/EV/return metrics). Buyer details if relevant; value creation outcomes. ${wording}`,
    [EVENT_TYPE.FUND_REVALUATION]: `NAV movement framing. Largest contributor; what triggered revaluation; context. ${wording}`,
    [EVENT_TYPE.SPECIAL_TOPIC]: `Flexible, situation-driven, professional tone. Do not force thesis/exit framing; cover what happened, implications, and actions (if supported). ${wording}`,
  };
  return blocks[eventType] ?? "";
}

export { EVENT_TYPE_LABELS, DEFAULT_EVENT_TYPE, VALID_EVENT_TYPES };
