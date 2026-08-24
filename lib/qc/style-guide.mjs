// lib/qc/style-guide.mjs
// R6.5: Two-layer structured style guide (universal + client-specific).

/**
 * Rule-authoring conventions for STYLE_GUIDE_LAYER_1 and LAYER_2_CLIENT.
 *
 * Each rule object must satisfy three elements to prevent reviewer
 * over-firing:
 *
 *  1. STANDARD — state the correct form in `description`.
 *  2. VIOLATION — state explicitly what to flag in `description`.
 *  3. NON-FIRING CASES — state explicitly what NOT to flag in
 *     `description`, AND illustrate at least one non-firing case in
 *     `correct_example` (where the rule applies but is followed
 *     correctly, OR where the rule plausibly might fire but should not).
 *
 * If a rule has a carve-out (e.g. "applies only to lists of 3+ items"),
 * the carve-out must appear in `description` AND `correct_example` should
 * illustrate a case that falls inside the carve-out (i.e. a case the
 * reviewer must leave alone).
 *
 * Diagnostic checks: every rule in style-guide.mjs is verified by a
 * fixture in `scripts/diagnostic/fixtures/style-guide-rules/`. Run
 * `npm run diagnostic:style-guide` after editing any rule.
 */

import {
  FIRST_PERSON_ACTOR_FIX_DIRECTION,
  FIRST_PERSON_ACTOR_INSTRUCTION,
} from "./first-person-actor.mjs";

/** @typedef {{ id: string, description: string, correct_example: string, incorrect_example: string, applies_to: string[], layer: 1 | 2, client?: string, fixDirection?: string }} StyleGuideRule */

export const STYLE_GUIDE_LAYER_1 = [
  {
    id: "defined_term_capitalisation",
    description:
      "When a draft defines a term (e.g. 'Shopify (the Company)' or 'XYZ Fund (the Fund)'), subsequent uses must respect the defined-term form. Flag uses where the defined-term NOUN is lowercase (e.g. 'the company' when 'the Company' is defined) or where 'the' is omitted entirely. Do NOT flag 'the Company' or 'the Fund' with lowercase 'the' mid-sentence — this is the correct form. Do NOT flag at all if the term has not been defined in the draft.",
    correct_example:
      "Shopify (the Company) reported revenue growth. The Company employs 24 people, and the Company has raised USD 1 million.",
    incorrect_example:
      "Shopify (the Company) reported revenue growth. The company employs 24 people.",
    applies_to: ["*"],
    layer: 1,
  },
  {
    id: "active_voice_preference",
    description:
      "Prefer active voice over passive where the subject is known and stating it is appropriate.",
    correct_example: "The Fund acquired a majority stake in the business.",
    incorrect_example: "A majority stake in the business was acquired by the Fund.",
    applies_to: ["*"],
    layer: 1,
  },
  {
    id: "hyperbole_vs_qualitative",
    description:
      "Distinguish genuine hyperbole and distinction-claim language ('exceptional', 'genuinely exceptional', 'unparalleled', 'best-in-class', 'world-class', 'industry-leading', 'extraordinary', 'unmatched', 'revolutionary', 'game-changing', 'transformative'), which is flagged when used without substantiation, from standard qualitative descriptors ('strong', 'leading' in widely-accepted contexts, 'well-positioned', 'high-quality', 'robust', 'defensible', 'compelling', 'solid'), which are NEVER flagged. Standard descriptors are the working vocabulary of investment writing. This applies equally on Complete and Public visibility — there is no tighter calibration for standard descriptors on Public. Substantiation present = do not flag. If the same sentence as the qualifier contains a specific figure, named comparator, period reference, benchmark, ranking, or other concrete fact that grounds the claim, do NOT raise a concern — even if the qualifier itself is a hyperbole word. For example, 'exceptional 22% net IRR vs a benchmark of 14%' does not fire: the figure and the comparator substantiate 'exceptional' directly. Adjacent-sentence substantiation also suppresses the flag.",
    correct_example: "The business delivered strong revenue growth and remains well-positioned in its core market.",
    incorrect_example: "The business is genuinely exceptional and best-in-class without peer comparison or supporting figures.",
    applies_to: ["*"],
    layer: 1,
  },
  {
    id: "register_consistency",
    description: "Register stays consistent within a document.",
    correct_example: "The Fund maintained a formal, institutional tone throughout the memo.",
    incorrect_example: "The Fund delivered solid returns — honestly, it crushed expectations.",
    applies_to: ["*"],
    layer: 1,
  },
  {
    id: "sentence_structure_clarity",
    description: "Avoid run-on sentences; favour clarity over density.",
    correct_example: "Revenue grew 12%. Margins improved in the same period.",
    incorrect_example:
      "Revenue grew 12% and margins improved and the team expanded internationally and leverage declined.",
    applies_to: ["*"],
    layer: 1,
  },
];

export const STYLE_GUIDE_LAYER_2_CLIENT = [
  {
    id: "thousand_separator",
    description: "Use a high comma (apostrophe) thousands separator (5'500, 10'000), not a low comma or bare apostrophe in the wrong position.",
    correct_example: "The portfolio held 5'500 units at year end.",
    incorrect_example: "The portfolio held 5,500 units at year end.",
    applies_to: ["*"],
    layer: 2,
    client: "CLIENT",
  },
  {
    id: "currency_format",
    description:
      "Currency amounts use the ISO 4217 code before the amount (EUR 445 million, USD 4 billion). Do not flag correctly formatted ISO-code amounts.",
    correct_example: "The transaction value was EUR 445 million.",
    incorrect_example: "The transaction value was €445m.",
    applies_to: ["*"],
    layer: 2,
    client: "CLIENT",
  },
  {
    id: "em_dash",
    description: "Replace em-dashes (—) with regular hyphens (-).",
    correct_example: "The Fund exited the position - ahead of plan.",
    incorrect_example: "The Fund exited the position — ahead of plan.",
    applies_to: ["*"],
    layer: 2,
    client: "CLIENT",
  },
  {
    id: "oxford_comma",
    description:
      "Use the Oxford comma in lists of three or more items (A, B, and C). To count list items: a list with no commas and one 'and' (e.g. 'A and B') has TWO items — never flag this. A list with at least one comma and an 'and' (e.g. 'A, B and C') has three or more items — flag if the comma before 'and' is missing. Count commas before deciding whether to fire.",
    correct_example: "The team included legal and tax advisers.",
    incorrect_example: "The deal team included legal, tax and operations advisers.",
    applies_to: ["*"],
    layer: 2,
    client: "CLIENT",
  },
  {
    id: "first_person_plural",
    description:
      "First-person plural (we, our, us, ours) is acceptable in investor_letter, press_release, and linkedin_post. It is not acceptable in reporting_commentary. " +
      FIRST_PERSON_ACTOR_INSTRUCTION,
    correct_example:
      "Partners Group completed the investment in Q2. Partners Group was attracted to Meridian. Partners Group believes the fund should deliver returns broadly in line with its predecessor and Partners Group recommends the commitment. Access that would not otherwise have been available to Partners Group.",
    incorrect_example:
      "We completed the investment in Q2. We were attracted to Meridian. We believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment. Access that would not otherwise have been available to us.",
    applies_to: ["reporting_commentary"],
    layer: 2,
    client: "CLIENT",
    fixDirection: FIRST_PERSON_ACTOR_FIX_DIRECTION,
  },
  {
    id: "smart_quotes",
    description: 'Use straight quotation marks (") and apostrophes (\') only. No smart quotes (“ ” ‘ ’).',
    correct_example: 'The CEO said "growth remains on track".',
    incorrect_example: "The CEO said “growth remains on track”.",
    applies_to: ["*"],
    layer: 2,
    client: "CLIENT",
  },
  {
    id: "english_variant",
    description:
      "Use US English spellings in general prose: organize, color, behavior, center, realize, recognize, defense, license, etc. Flag British English spellings (organise, colour, behaviour, centre, realise, recognise, defence, licence in noun form, etc.). Do NOT flag text that is already in US English. Proper nouns retain their native spelling (Partners Group, Centre Court, Labour Party).",
    correct_example:
      "The team will organize the investor day in New York and recognize top performers.",
    incorrect_example:
      "The team will organise the investor day in New York and recognise top performers.",
    applies_to: ["*"],
    layer: 2,
    client: "CLIENT",
  },
  {
    id: "number_spelling",
    description:
      "Spell out numbers 0–12; use numerals for 13 and above. Carve-outs: percentages, currency amounts, dates, ages, and measured physical units (km, kg, MW, %) always use numerals. Month and year counts in prose (twelve months, three years) follow the 0–12 spell-out rule — do not flag spelled-out forms. Do not flag percent vs % notation — use percentage_notation for that.",
    correct_example: "The Fund made twelve investments and deployed capital across 14 sectors.",
    incorrect_example: "The Fund made 12 investments in the first year.",
    applies_to: ["*"],
    layer: 2,
    client: "CLIENT",
  },
  {
    id: "percentage_notation",
    description:
      "Percentages use the '%' symbol, not the word 'percent' or the two-word British 'per cent' (e.g. '5.4%' or '88%', not '5.4 percent' or '88 per cent'). When raising a concern, quote the exact 'percent' or 'per cent' wording from the statement; do not cite the corrected '%' form.",
    correct_example: "Net initial yield is 5.4%.",
    incorrect_example: "Utilisation has reached 88 per cent.",
    applies_to: ["*"],
    layer: 2,
    client: "CLIENT",
  },
  {
    id: "date_format",
    description:
      "Dates in prose use DD FullMonthName YYYY (e.g. '19 January 2026'). Flag dates in any other form: abbreviated month ('19 Jan 2026'), US order ('January 19, 2026'), slashes ('05/26/2026'), or ISO ('2026-05-26'). Do NOT flag dates already in DD FullMonthName YYYY format.",
    correct_example: "The closing occurred on 19 January 2026.",
    incorrect_example: "The closing occurred on 19 Jan 2026.",
    applies_to: ["*"],
    layer: 2,
    client: "CLIENT",
  },
];

const CANONICAL_TO_OUTPUT_SLUG = {
  REPORTING_COMMENTARY: "reporting_commentary",
  INVESTOR_LETTER: "investor_letter",
  PRESS_RELEASE: "press_release",
  LINKEDIN_POST: "linkedin_post",
};

/**
 * MVP: always Client layer. Structural hook for future clients.
 * @param {object} _documentContext
 * @returns {"CLIENT"}
 */
export function selectStyleGuideClient(_documentContext) {
  return "CLIENT";
}

/**
 * @param {string|undefined} rawOutputType
 * @returns {string}
 */
function outputTypeSlug(rawOutputType) {
  if (typeof rawOutputType !== "string" || !rawOutputType.trim()) {
    return "reporting_commentary";
  }
  const trimmed = rawOutputType.trim();
  const upper = trimmed.toUpperCase().replace(/-/g, "_");
  if (CANONICAL_TO_OUTPUT_SLUG[upper]) return CANONICAL_TO_OUTPUT_SLUG[upper];
  const lower = trimmed.toLowerCase();
  if (Object.values(CANONICAL_TO_OUTPUT_SLUG).includes(lower)) return lower;
  return "reporting_commentary";
}

/**
 * @param {object} documentContext
 * @returns {StyleGuideRule[]}
 */
function layer2ForClient(documentContext) {
  const client = selectStyleGuideClient(documentContext);
  if (client === "CLIENT") return STYLE_GUIDE_LAYER_2_CLIENT;
  return [];
}

/**
 * @param {StyleGuideRule[]} rules
 * @param {string} outputSlug
 * @returns {StyleGuideRule[]}
 */
function filterByOutputType(rules, outputSlug) {
  return rules.filter((r) => {
    if (!Array.isArray(r.applies_to)) return false;
    if (r.applies_to.includes("*")) return true;
    return r.applies_to.includes(outputSlug);
  });
}

/**
 * Merge Layer 1 + Layer 2 (Layer 2 wins on matching id), then filter by output type.
 * @param {object} documentContext
 * @param {string} [documentContext.outputType]
 * @returns {StyleGuideRule[]}
 */
export function resolveStyleGuide(documentContext = {}) {
  const outputSlug = outputTypeSlug(documentContext.outputType);
  const layer2 = layer2ForClient(documentContext);
  const merged = [...STYLE_GUIDE_LAYER_1];
  const indexById = new Map(merged.map((r, i) => [r.id, i]));
  const overrideLogged = new Set();

  for (const rule of layer2) {
    const existingIdx = indexById.get(rule.id);
    if (existingIdx !== undefined) {
      merged[existingIdx] = rule;
      const logKey = `${rule.client ?? "CLIENT"}:${rule.id}`;
      if (!overrideLogged.has(logKey)) {
        overrideLogged.add(logKey);
        console.log(`[style_guide] Layer 2 CLIENT override applied to rule "${rule.id}"`);
      }
    } else {
      indexById.set(rule.id, merged.length);
      merged.push(rule);
    }
  }

  return filterByOutputType(merged, outputSlug);
}

/**
 * @param {StyleGuideRule[]} rules
 * @returns {string}
 */
export function formatStyleGuideRulesForPrompt(rules) {
  const blocks = rules.map((r) => {
    let block =
      `- ${r.id}: ${r.description}\n  Correct: ${r.correct_example}\n  Incorrect: ${r.incorrect_example}`;
    if (typeof r.fixDirection === "string" && r.fixDirection.trim()) {
      block += `\n  fixDirection: ${r.fixDirection.trim()}`;
    }
    return block;
  });
  return `Apply the following style rules. When you raise a concern that corresponds to one of these rules, include the rule id in the concern's \`rule\` field.\n\n${blocks.join("\n\n")}`;
}
