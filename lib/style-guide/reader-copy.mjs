/**
 * B562. What the House style page shows.
 * The model still reads each entry's rule and each principle's text.
 */

function fixed(title, summary, example, notExample) {
  return {
    title,
    summary,
    example: example || [],
    notExample: notExample || [],
  };
}

function choice(title, byChoice) {
  return { title, byChoice };
}

function variant(summary, example, notExample) {
  return {
    summary,
    example: example || [],
    notExample: notExample || [],
  };
}

export const READER_COPY = Object.freeze({
  em_dash: fixed(
    "Dashes",
    "Use a hyphen. Never use a long dash.",
    ["The fund exited early, ahead of plan."],
    ["a long dash between two parts of a sentence."],
  ),
  percentage_notation: fixed(
    "Percentages",
    "Write percentages with the % sign.",
    ["Occupancy reached 88%."],
    ["Occupancy reached 88 per cent."],
  ),
  english_variant: choice("Spelling", {
    US: variant(
      "Use US spelling.",
      ["The team will organize the program."],
      ["The team will organise the programme."],
    ),
    UK: variant(
      "Use UK spelling.",
      ["The team will organise the programme."],
      ["The team will organize the program."],
    ),
  }),
  country_abbreviation: fixed(
    "US and UK",
    "Write US and UK without full stops.",
    ["The US manager and the UK fund."],
    ["The U.S. manager and the U.K. fund."],
  ),
  oxford_comma: fixed(
    "Oxford comma",
    "Use a comma before \"and\" in a list of three or more, never in a pair.",
    ["Legal, tax, and operations advisers attended."],
    ["Legal, tax and operations advisers attended.", "driven by pricing, and cost savings."],
  ),
  smart_quotes: choice("Quotation marks", {
    single: variant(
      "Use single quotation marks.",
      ["The chief executive said 'growth remains on track'."],
      ["The chief executive said \"growth remains on track\"."],
    ),
    double: variant(
      "Use double quotation marks.",
      ["The chief executive said \"growth remains on track\"."],
      ["The chief executive said 'growth remains on track'."],
    ),
  }),
  number_spelling: choice("Numbers in words", {
    up_to_twelve: variant(
      "Write counts up to twelve in words. Use figures for 13 and above, and always for measurements, percentages, money, multiples, dates and ranges.",
      ["three funds, 13 companies, a 7-9 month payback."],
      ["3 funds."],
    ),
    up_to_nine: variant(
      "Write counts up to nine in words. Use figures for 10 and above, and always for measurements, percentages, money, multiples, dates and ranges.",
      ["three funds, 10 companies, a 7-9 month payback."],
      ["3 funds."],
    ),
    never: variant(
      "Use figures for every count, and always for measurements, percentages, money, multiples, dates and ranges.",
      ["3 funds, 13 companies, a 7-9 month payback."],
      ["three funds."],
    ),
  }),
  currency_format: fixed(
    "Currency",
    "Put the currency code before the amount instead of a symbol.",
    ["GBP 450 million."],
    ["£450 million."],
  ),
  thousand_separator: choice("Thousands separator", {
    apostrophe: variant(
      "Separate thousands with an apostrophe, but never in a year.",
      ["5'500 employees in 2026."],
      ["5,500 employees."],
    ),
    comma: variant(
      "Separate thousands with a comma, but never in a year.",
      ["5,500 employees in 2026."],
      ["5'500 employees."],
    ),
    space: variant(
      "Separate thousands with a space, but never in a year.",
      ["5 500 employees in 2026."],
    ),
  }),
  magnitude: choice("Large amounts", {
    billions: variant(
      "Show amounts of 1,000 million or more in billions, to one decimal.",
      ["GBP 950 million; GBP 5.0 billion."],
      ["GBP 5,049 million."],
    ),
    millions: variant(
      "Keep amounts in millions.",
      ["GBP 5,049 million."],
    ),
  }),
  date_format: choice("Dates", {
    day_month: variant(
      "Write dates as day, month, year.",
      ["30 September 2026."],
      ["September 30, 2026, or 30/09/2026."],
    ),
    month_day: variant(
      "Write dates as month, day, year.",
      ["September 30, 2026."],
      ["30 September 2026, or 09/30/2026."],
    ),
  }),
  pence_form: choice("Pence", {
    words: variant(
      "Write 862.5 pence. Do not convert pence to pounds.",
      ["NAV was 862.5 pence."],
      ["NAV was 862.5p."],
    ),
    symbol: variant(
      "Write 862.5p. Do not convert pence to pounds.",
      ["NAV was 862.5p."],
      ["NAV was 862.5 pence."],
    ),
  }),
  period_form: choice("Periods", {
    spelled: variant(
      "Spell out quarters, halves and financial years.",
      ["in the third quarter of 2026."],
      ["in Q3 2026."],
    ),
    abbreviated: variant(
      "Use the short form for quarters, halves and financial years.",
      ["in Q3 2026."],
      ["in the third quarter of 2026."],
    ),
  }),
  period_placement: fixed(
    "Period after what it describes",
    "Put the period after the thing it describes.",
    ["revenue for the first quarter of 2026."],
    ["first quarter of 2026 revenue."],
  ),
  derived_figure: fixed(
    "Linked figures",
    "Link a figure that is worked out from another.",
    ["EUR 9 million of EBITDA, equating to a 14% margin."],
    ["EUR 9 million of EBITDA (14% margin)."],
  ),
  year_range: fixed(
    "Year ranges",
    "Join year ranges with a hyphen. \"From 2016 to 2019\" is also fine.",
    ["the 2016-2019 funds."],
    ["the 2016 to 2019 funds."],
  ),
  numeric_range: choice("Numeric ranges", {
    on: variant(
      "Write numeric ranges with a hyphen and state the unit once.",
      ["12-15 companies", "EUR 150-500 million."],
      ["12 to 15 companies", "EUR 150 million to EUR 500 million."],
    ),
    off: variant(
      "Leave numeric ranges as written.",
      ["12 to 15 companies."],
    ),
  }),
  legal_identifiers: choice("Legal suffixes", {
    omit: variant(
      "Leave out legal suffixes such as Ltd, Inc, plc and AG.",
      ["Fjordline Software."],
      ["Fjordline Software AS."],
    ),
    keep: variant(
      "Keep legal suffixes as the company writes them.",
      ["Fjordline Software AS."],
    ),
  }),
  names: fixed(
    "First mention",
    "Give the full name first, then a short form.",
    ["Aldermoor Capital Fund VI, then Fund VI."],
    ["the fund, with no name given first."],
  ),
  job_titles: fixed(
    "Job titles",
    "Capitalise a job title only next to a name.",
    ["Managing Director Jane Smith; the managing director."],
    ["the Managing Director."],
  ),
  defined_term_capitalisation: fixed(
    "Defined terms",
    "Once a term is defined, write it the same way every time.",
    ["Shopify (the Company) ... The Company employs 24 people."],
    ["... The company employs 24 people."],
  ),
  year_on_year: fixed(
    "Year on year",
    "Write year on year, with a hyphen only before a noun.",
    ["year-on-year growth; revenue rose 20% year on year."],
    ["year-over-year growth."],
  ),
  general_partner: fixed(
    "Manager",
    "Say manager, not general partner.",
    ["The manager raised the fund."],
    ["The general partner raised the fund."],
  ),
  public_market_comparables: fixed(
    "Comparables",
    "Say public market comparables, not listed comparables.",
  ),
  returns_form: fixed(
    "Returns",
    "State returns as gross primary returns, multiple first, then IRR.",
    ["gross primary returns of 2.5x cost and 20% IRR."],
    ["2.5x / 20%."],
  ),
  deal_word: fixed(
    "Transaction",
    "Say transaction or investment, not deal.",
    ["The transaction closed in June."],
    ["The deal closed in June."],
  ),
  voice: fixed(
    "Voice",
    "Each text type uses the voice shown in the Voice section.",
  ),
  active_voice_preference: fixed(
    "Active voice",
    "Prefer the active voice.",
    ["The fund acquired a majority stake."],
    ["A majority stake was acquired by the fund."],
  ),
  hyperbole_vs_qualitative: fixed(
    "Hype",
    "Let the facts make the case. Avoid hype.",
    ["Revenue grew 22%."],
    ["The business is best-in-class."],
  ),
  register_consistency: fixed(
    "Tone",
    "Keep one consistent, professional tone.",
    [],
    ["The fund delivered solid returns, and honestly it crushed expectations."],
  ),
  sentence_structure_clarity: fixed(
    "Sentences",
    "Keep sentences short and clear.",
    ["Revenue grew 12%. Margins improved in the same period."],
    ["Revenue grew 12% and margins improved and the team expanded."],
  ),
  jargon: fixed(
    "Plain words",
    "Use plain words. Explain a specialist term or leave it out.",
    ["The fee on unused capital stayed at 0.5%."],
    ["The undrawn fee drag compressed DPI."],
  ),
  banned_words: fixed(
    "Banned words",
    "The Banned words section lists the words this account does not use.",
  ),
});

export const PRINCIPLE_READER = Object.freeze({
  investment_story: {
    title: "Tell the story, not the paperwork",
    summary: "Leave out notice numbers, payment dates and other process detail.",
    example: "The fund called capital for two new investments.",
  },
  lead_with_what_happened: {
    title: "Lead with what happened",
    summary: "Open with when, who and what.",
    example: "In September 2026, Kestrel Partners Fund IV called capital to fund the acquisition of Fjordline Software.",
  },
  do_not_describe_the_draft: {
    title: "No titles, no talking about the text",
    summary: "A draft has no heading (except a press release headline) and never describes itself.",
  },
  depth_over_breadth: {
    title: "Depth over breadth",
    summary: "Tell the most important point well, rather than every point briefly.",
  },
  intelligent_outsider: {
    title: "Write for an intelligent outsider",
    summary: "Introduce each company briefly when first named, and use plain words.",
    example: "Fjordline Software, an Oslo-based provider of logistics software.",
  },
  speak_for_the_firm: {
    title: "Speak precisely for the firm",
    summary: "\"We\" and \"the firm\" mean only your organisation. Everyone else is named, and other authors' views are credited to them.",
    example: "Marks argues that valuations are elevated.",
  },
  public_means_public: {
    title: "Public means public",
    summary: "A public text uses only figures that appear in public sources.",
  },
  end_with_substance: {
    title: "Every sentence earns its place",
    summary: "Each sentence adds a fact or an insight. No previews, no recaps.",
  },
  keep_the_figures: {
    title: "Keep the figures",
    summary: "Concrete figures stay in; you can trim them later.",
  },
  deal_status: {
    title: "Decisions as made",
    summary: "State the firm's decision as made, and claim completion only when the source does.",
    example: "In October 2026, Halden Group committed to Aldermoor Capital Fund VI.",
  },
  cash_amounts: {
    title: "Cash amounts",
    summary: "Leave out amounts committed, called, distributed or invested unless you ask for them. Ratios and percentages are fine.",
  },
  words_of_size: {
    title: "Size words match the source",
    summary: "A change the source calls slight stays slight.",
  },
});

function listed(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

/** The copy for one guide entry, for the selected choice when the entry has one. */
export function readerForEntry(entryId, selectedOptionId) {
  const copy = READER_COPY[entryId];
  if (!copy) throw new Error(`style guide: reader copy is missing for ${entryId}`);
  if (!copy.title) throw new Error(`style guide: reader title is missing for ${entryId}`);
  if (!copy.byChoice) {
    if (!copy.summary) throw new Error(`style guide: reader summary is missing for ${entryId}`);
    return {
      title: copy.title,
      summary: copy.summary,
      example: listed(copy.example),
      notExample: listed(copy.notExample),
      variants: null,
    };
  }
  const variants = {};
  for (const [id, row] of Object.entries(copy.byChoice)) {
    if (!row?.summary) throw new Error(`style guide: reader summary is missing for ${entryId} ${id}`);
    variants[id] = {
      summary: row.summary,
      example: listed(row.example),
      notExample: listed(row.notExample),
    };
  }
  const current = selectedOptionId ? variants[selectedOptionId] : null;
  if (!current) throw new Error(`style guide: reader copy is missing for ${entryId} ${selectedOptionId || "(no choice)"}`);
  return { title: copy.title, ...current, variants };
}

/** The copy for one writing principle. */
export function readerForPrinciple(id) {
  const copy = PRINCIPLE_READER[id];
  if (!copy?.title || !copy?.summary) throw new Error(`writing principles: reader copy is missing for ${id}`);
  return {
    title: copy.title,
    summary: copy.summary,
    example: typeof copy.example === "string" && copy.example.trim() ? copy.example.trim() : "",
  };
}
