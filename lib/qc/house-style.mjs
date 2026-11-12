/**
 * B496. House style leaves the card.
 * These codes are format. They do not change a card's tier, label, or edge.
 */

export const HOUSE_STYLE_CODES = [
  "percentage_notation",
  "em_dash",
  "number_spelling",
  "currency_format",
  "first_person_plural",
  "date_format",
  "defined_term_capitalisation",
  "english_variant",
  "oxford_comma",
  "smart_quotes",
  "thousand_separator",
];

export const HOUSE_STYLE_HEADINGS = {
  percentage_notation: "Percentages written as words",
  em_dash: "Long dashes",
  number_spelling: "Numbers to spell out",
  currency_format: "Currency format",
  first_person_plural: "First person (we, our)",
  date_format: "Dates",
  defined_term_capitalisation: "Capitalised terms",
  english_variant: "UK or US spelling",
  oxford_comma: "Oxford comma",
  smart_quotes: "Quote marks",
  thousand_separator: "Thousand separators",
};

const CODES = new Set(HOUSE_STYLE_CODES);

export function houseStyleCode(concern) {
  const named = concern?.concernCode || concern?.rule || concern?.ruleId || "";
  return String(named).trim();
}

export function isHouseStyleConcern(concern) {
  return CODES.has(houseStyleCode(concern));
}

export function splitHouseStyle(concerns) {
  const list = Array.isArray(concerns) ? concerns : [];
  const editorial = [];
  const houseStyle = [];
  for (const concern of list) {
    if (isHouseStyleConcern(concern)) houseStyle.push(concern);
    else editorial.push(concern);
  }
  return { editorial, houseStyle };
}

export function storedConcernText(concern) {
  for (const key of ["note", "concernText", "text"]) {
    if (typeof concern?.[key] === "string" && concern[key].trim()) return concern[key].trim();
  }
  return "";
}

export function statementExcerpt(statement, concern) {
  const text = typeof statement === "string" ? statement.trim() : "";
  const quote = typeof concern?.quote === "string" ? concern.quote.trim() : "";
  const chosen = quote && text.includes(quote) ? quote : text;
  const words = chosen.split(/\s+/).filter(Boolean);
  if (words.length <= 8) return words.join(" ");
  return `${words.slice(0, 8).join(" ")}...`;
}

export function houseStyleOnCard(card) {
  if (Array.isArray(card?.houseStyleConcerns)) return card.houseStyleConcerns;
  return splitHouseStyle(card?.editorialConcerns).houseStyle;
}

export function groupHouseStyle(cards) {
  const rows = Array.isArray(cards) ? cards : [];
  const byCode = new Map();
  for (const row of rows) {
    const card = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : row;
    const statement = typeof card?.statement === "string" ? card.statement : "";
    for (const concern of houseStyleOnCard(card)) {
      const code = houseStyleCode(concern);
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push({
        excerpt: statementExcerpt(statement, concern),
        text: storedConcernText(concern),
      });
    }
  }
  return HOUSE_STYLE_CODES.filter((code) => byCode.has(code)).map((code) => ({
    code,
    heading: HOUSE_STYLE_HEADINGS[code],
    count: byCode.get(code).length,
    points: byCode.get(code),
  }));
}
