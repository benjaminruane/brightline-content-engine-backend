// lib/rulebook/styleGuide.js
// A8.23 / A8.24: Style-guide rulebook (curated rules; fixDirection = plain reviewer guidance, no placeholders).

const ALL = ["reporting_commentary", "investor_letter", "press_release", "linkedin_post"];
const THREE = ["reporting_commentary", "investor_letter", "press_release"];

/** Legacy scaffold text for prompt-library / helpers — unchanged from A8.22 body. */
export const DEFAULT_STYLE_GUIDE = `
TONE & AUDIENCE
- Write in a neutral, professional, institution-grade tone.
- Assume a financially literate audience (investment professionals, client relationship teams, sophisticated investors).
- Avoid marketing hype and exaggeration. Prefer measured, evidence-based language.
- Use third-person voice by default (e.g., "the firm", "the company", "Partners Group").

STRUCTURE & FLOW
- Lead with the most important fact or outcome ("what happened") before supporting detail.
- Use short paragraphs. Aim for 2–4 sentences per paragraph.
- Within paragraphs, move from high-level context to more specific detail.
- Use clear topic sentences and avoid long, meandering sentences.
- Where appropriate, use short, readable lists (bullets) rather than dense blocks of text.

LANGUAGE & STYLE
- Use clear, concise sentences. Prefer plain language over jargon where possible.
- When specialised terminology is required, use it precisely and consistently.
- Avoid colloquial expressions, slang, or overly casual phrasing.
- Avoid superlatives and subjective claims ("world-class", "best-in-class") unless directly supported by evidence and clearly attributed.
- Do not invent facts or rationales that are not supported by the source material.

NUMBERS & UNITS
- Use numerals for all numbers above eleven.
- Use numerals for any quantity that represents a measurable unit, regardless of size:
  - Examples: 5 customers, 9 employees, 3 funds, 20 investments, 2 years, 6 months.
- Use numerals for all ranges (e.g., 10–15, 3–5 years).
- Use the apostrophe (’) as the thousands separator:
  - 12’500
  - 5’500’000
- Do not use commas as thousands separators.
- When the text spells out a number that clearly represents a measurable unit
  (e.g., "five customers", "twenty employees"),
  prefer a numeral instead:
  - "five customers" → "5 customers"
  - "twenty employees" → "20 employees"
- Percentages should use numerals and the % symbol (e.g., 5%, 12.5%).

CURRENCIES
- When the source uses bare currency symbols ($, €, £) without codes, rewrite them into the proper currency code plus amount where the currency is clear:
  - $10 million → USD 10 million
  - €250’000 → EUR 250’000
  - £5’500 → GBP 5’500
- Do not guess the currency if it is ambiguous. In that case, preserve the symbol and amount without adding a code.
- Write large amounts using a readable combination of numerals and words:
  - EUR 1.2 billion, USD 350 million, GBP 25’000.

LANGUAGE STANDARD
- Write in US English throughout.
- Follow Merriam-Webster as the authority for spelling,
  hyphenation, and word choice where not otherwise specified
  by these rules.
- Examples: 'analyze' not 'analyse', 'color' not 'colour',
  'program' not 'programme', 'center' not 'centre'.

PUNCTUATION & TYPOGRAPHY
- Avoid em dashes (—). Use normal hyphens (-), commas, parentheses, or semicolons instead.
- Do not use smart quotes (“ ” ‘ ’). Use straight quotes only:
  - " " for double quotes
  - ' ' for single quotes / apostrophes
- Use standard sentence punctuation (., !, ?). Avoid multiple exclamation marks.
- Use a single space after punctuation, not double spaces.

NAMES, TITLES & ENTITIES
- Use the full official name of companies, funds, and strategies on first mention.
- Thereafter, you may use a shortened name or abbreviation if it is unambiguous.
- Capitalise formal strategy names and product names consistently.
- Job titles are capitalised when used with a name (e.g., "Managing Director Jane Smith") and lower-case when used generically ("the managing director").

TEMPORAL REFERENCES
- Prefer specific time references over vague ones where possible:
  - "in 2023" instead of "recently"
  - "over the last three years" instead of "in recent years", if the period is clear.
- When referencing periods, keep formats consistent:
  - "three-year period", "five-year track record", "12-month performance".

RISK & UNCERTAINTY
- Avoid overconfident or absolute statements about future performance.
- When discussing outlook or expectations, use measured language:
  - "is expected to", "aims to", "seeks to", "believes that", "intends to".
- Do not disclose non-public performance metrics or highly sensitive information unless explicitly permitted by the brief.

GENERAL CONSISTENCY
- Apply these rules consistently across the entire text, even if the source material is inconsistent.
- If the source is ambiguous or conflicting, prefer the simplest, most neutral phrasing.
- When in doubt, prioritise clarity, factual accuracy, and alignment with professional institutional standards.
`;

export default [
  {
    id: "currency_notation_usd_million",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Currency amounts are written as 'USD [number] million' or 'USD [number] billion'. Do not use '$Xmm', '$Xm', '$X million', or bare-symbol notation.",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the exact currency phrase from the statement and states the corrected 'USD [N] million' form. Example: \"Replace '$30mm' with 'USD 30 million'.\"",
  },
  {
    id: "thousands_separator_apostrophe",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "The thousands separator is a straight apostrophe (e.g. 5'500). Do not use comma (5,500), space (5 500), or period (5.500).",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the exact number from the statement and states the corrected form with a straight apostrophe. Example: \"Replace '5,500' with '5'500'.\"",
  },
  {
    id: "numerals_twelve_and_above",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Numbers twelve and above use numerals (12, 100, 2025). Numbers below twelve are spelled out (two, eight). Exceptions always use numerals regardless of magnitude: percentages, currency, dates, measurements, and units (e.g. 8km, 10 stories, 3 basis points).",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the exact word or numeral and states the corrected form. Example: \"Write 'ten' as '10'.\" or \"Write '8' as 'eight'.\"",
  },
  {
    id: "us_english_spelling",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Use US English spelling throughout, per Merriam-Webster. Examples: 'color' not 'colour', 'organize' not 'organise', 'analyze' not 'analyse', 'center' not 'centre'.",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the UK spelling in the statement and states the US spelling. Example: \"Change 'colour' to 'color'.\"",
  },
  {
    id: "straight_quotes_and_apostrophes",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Use straight quotes (U+0022 and U+0027), not smart or curly quotes (U+201C, U+201D, U+2018, U+2019).",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that names the smart-quote character used and states the straight-ASCII equivalent. Example: \"Replace the curly quote in 'don't' with a straight apostrophe.\"",
  },
  {
    id: "no_em_or_en_dashes",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Do not use em dashes (—) or en dashes (–). Use standard hyphens (-) or restructure the sentence. Numeric ranges may use either a hyphen or the word 'to' (e.g. '5-10 years' or '5 to 10 years').",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the dash used and states the hyphen replacement or a restructured alternative. Example: \"Replace the em dash in [phrase] with a hyphen.\"",
  },
  {
    id: "percentage_notation",
    category: "style_guide",
    severity: "soft_concern",
    description: "Percentages use the '%' symbol, not the word 'percent' (e.g. '81%', not '81 percent').",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the phrase used and states the '%'-symbol form. Example: \"Change '81 percent' to '81%'.\"",
  },
  {
    id: "date_format_dd_month_yyyy_or_iso",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Dates in structured contexts use 'DD-MM-YYYY' (e.g. '18-04-2026'). Dates in prose use 'DD Month YYYY' (e.g. '18 April 2026'). Do not use 'MM/DD/YYYY', 'M/D/YY', or ordinal suffixes (e.g. 'April 18th, 2026').",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the date as written and states the corrected form. Example: \"Change 'April 18th, 2026' to '18 April 2026'.\"",
  },
  {
    id: "abbreviation_first_use_expansion",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Initialisms and acronyms are expanded on first use with the expansion in single quotes and the abbreviation in parentheses (e.g. 'small and medium-sized business' (SMB)). Subsequent uses show the abbreviation alone. Universally recognised abbreviations do not require expansion (US, EU, CEO, GDP, IPO, CFO).",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that names the abbreviation and states the first-use expansion. Example: \"On first use, write 'SMB' as 'small and medium-sized business' (SMB).\"",
  },
  {
    id: "non_usd_currency_iso_code",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Non-USD currencies use the ISO 4217 code followed by the amount (e.g. 'EUR 100 million', 'GBP 50 million'). Do not use the symbol (€, £, ¥) or lowercase codes.",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the currency expression used and states the ISO-code form. Example: \"Replace '€100m' with 'EUR 100 million'.\"",
  },
  {
    id: "oxford_comma",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Use the Oxford (serial) comma in lists of three or more items (e.g. 'Pixar, Amnesty International, and Nike').",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the list as written and states the list with the Oxford comma added. Example: \"Change 'A, B and C' to 'A, B, and C'.\"",
  },
  {
    id: "sentence_case_headings",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Section headings use sentence case. Only the first word and proper nouns are capitalised. This rule applies to headings specifically, not to body prose.",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the heading as written and states the sentence-case form. Example: \"Change 'The Future Of Markets' to 'The future of markets'.\"",
  },
  {
    id: "capitalise_titles_and_roles",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Titles and roles are capitalised, whether abbreviated or spelled out: 'CEO', 'Chief Executive Officer', 'Head of Research', 'Partner', 'Managing Director', 'Senior Vice President'.",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the title as written and states the capitalised form. Example: \"Change 'chief executive officer' to 'Chief Executive Officer'.\"",
  },
  {
    id: "compound_modifier_hyphenation",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Hyphenate compound modifiers before a noun (first-class service, third-largest competitor, long-term plan, 10-year fund). Do not hyphenate when the same words follow the noun (the service was first class). Do not hyphenate when the first word ends in -ly (tightly wound, fully owned). Hyphenate recurring financial compounds when they act as modifiers before a noun (year-on-year growth, pre-money valuation) but not when they stand alone (growth of 50% year on year). Hyphenate prefixed words when they create ambiguity, precede a capital letter, or create a double vowel (re-enter, co-founder, non-US, ex-employee).",
    appliesTo: [...ALL],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the modifier as written and states the corrected form (hyphenated or de-hyphenated as appropriate). Example: \"Hyphenate 'first class service' as 'first-class service'.\"",
  },
  {
    id: "footnote_marker_format",
    category: "style_guide",
    severity: "soft_concern",
    description:
      "Footnote markers in body prose appear as superscript numerals. In a citation list or bibliography, markers appear as '[1]', '[2]' — square-bracketed, inline, not superscript.",
    appliesTo: [...THREE],
    appliesToVersion: null,
    fixDirection:
      "Write a single imperative sentence that quotes the footnote marker as written and states the corrected form for its context. Example: \"Format the footnote marker '1' as a superscript in body text.\"",
  },
];
