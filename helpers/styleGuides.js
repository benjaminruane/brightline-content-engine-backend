// helpers/styleGuides.js

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

// Optional: kept for future client-specific overrides.
export const SAMPLE_CLIENT_STYLE_GUIDE = `
This is a placeholder for a client-specific style guide.
It can override or extend the DEFAULT_STYLE_GUIDE for a particular client or workspace.
`;
