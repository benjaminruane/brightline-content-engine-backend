/**
 * B565. Fact-rewriting style guide entries name an equivalence.
 * The figure and name matcher reads these. There is no second list.
 */
import { STYLE_GUIDE } from "../style-guide/guide.mjs";

const OTHER_DOLLARS = [
  ["HK$", "HKD"],
  ["NZ$", "NZD"],
  ["C$", "CAD"],
  ["A$", "AUD"],
  ["S$", "SGD"],
];

const CURRENCY_MARKS = [
  ...OTHER_DOLLARS.map(([mark, unit]) => ({ mark, unit })),
  { mark: "US$", unit: "USD" },
  { mark: "USD", unit: "USD" },
  { mark: "GBP", unit: "GBP" },
  { mark: "EUR", unit: "EUR" },
  { mark: "SEK", unit: "SEK" },
  { mark: "CAD", unit: "CAD" },
  { mark: "AUD", unit: "AUD" },
  { mark: "SGD", unit: "SGD" },
  { mark: "HKD", unit: "HKD" },
  { mark: "NZD", unit: "NZD" },
  { mark: "$", unit: "USD" },
  { mark: "£", unit: "GBP" },
  { mark: "€", unit: "EUR" },
];

const SCALE_SUFFIXES = ["mm", "mn", "bn", "m", "b", "k"];

const IMPLEMENTED = new Set([
  "percent",
  "counts",
  "currency",
  "thousands",
  "magnitude",
  "dates",
  "periods",
  "ranges",
  "legal",
  "multiples",
]);

/** Both directions are asserted by the B565 test. */
export const EQUIVALENCE_PAIRS = Object.freeze({
  currency: [
    ["$5.9 million", "USD 5.9 million"],
    ["US$ 5.9 million", "USD 5.9 million"],
    ["£5.0bn", "GBP 5.0 billion"],
    ["€9 million", "EUR 9 million"],
    ["$438K", "USD 438,000"],
    ["C$ 12.1 million", "CAD 12.1 million"],
  ],
  magnitude: [
    ["GBP 5.0 billion", "GBP 5,049 million"],
    ["5.0bn", "5,000 million"],
    ["$5.9mm", "USD 5.9 million"],
  ],
  thousands: [
    ["5,500", "5'500"],
    ["5,500", "5 500"],
    ["5,500", "5500"],
  ],
  dates: [
    ["31 March 2026", "March 31, 2026"],
    ["31 March 2026", "31/03/2026"],
    ["31 March 2026", "2026-03-31"],
  ],
  periods: [
    ["first quarter of 2026", "Q1 2026"],
    ["first quarter of 2026", "1Q26"],
    ["first quarter of 2026", "Q1'26"],
    ["first quarter of 2026", "1Q 2026"],
    ["first half of 2026", "H1 2026"],
    ["first half of 2026", "1H26"],
    ["financial year 2025", "FY2025"],
    ["financial year 2025", "FY25"],
    ["financial year 2025", "fiscal 2025"],
  ],
  percent: [
    ["19%", "19 per cent"],
    ["19%", "19 percent"],
    ["12 bps", "12 basis points"],
    ["3 percentage points", "3 pp"],
    ["-2.27%", "(2.27)%"],
    ["-2.27%", "minus 2.27%"],
  ],
  counts: [
    ["three funds", "3 funds"],
    ["zero items", "0 items"],
    ["twelve sites", "12 sites"],
  ],
  multiples: [
    ["2.5x", "2.5 times"],
    ["2.5x", "2.5x cost"],
    ["2.5 times", "2.5x cost"],
  ],
  ranges: [
    ["2016-2019", "2016 to 2019"],
  ],
  legal: [
    ["Fjordline Software AS", "Fjordline Software"],
  ],
});

export function currencyAlternation() {
  return CURRENCY_MARKS.map((row) => row.mark.replace(/[$*+?.()|]/g, "\\$&")).join("|");
}

export function scaleSuffixAlternation() {
  return SCALE_SUFFIXES.join("|");
}

export function currencyUnit(token) {
  const raw = String(token || "");
  const found = CURRENCY_MARKS.find((row) => row.mark.toLowerCase() === raw.toLowerCase() || row.mark === raw);
  return found ? found.unit : "";
}

/**
 * A bare dollar is USD unless this text uses one other dollar mark.
 * More than one other dollar leaves the sign unmatched to USD.
 */
export function bareDollarUnit(text) {
  const body = String(text || "");
  const found = OTHER_DOLLARS.filter(([mark]) => body.includes(mark)).map(([, unit]) => unit);
  if (found.length > 1) return "mixed-dollar";
  if (found.length === 1) return found[0];
  return "USD";
}

export function scaleName(token) {
  const word = String(token || "").toLowerCase();
  if (!word) return "";
  if (word === "k" || word === "thousand") return "thousand";
  if (word === "mm" || word === "m" || word === "mn" || word === "million") return "million";
  if (word === "bn" || word === "b" || word === "billion") return "billion";
  return "";
}

export function shortYear(token) {
  const value = String(token || "");
  if (/^(?:19|20)\d{2}$/.test(value)) return Number(value);
  if (!/^\d{2}$/.test(value)) return null;
  const year = Number(value) >= 50 ? 1900 + Number(value) : 2000 + Number(value);
  if (year < 1900 || year > 2099) return null;
  return year;
}

export function guideEquivalences() {
  const rows = [];
  for (const entry of STYLE_GUIDE) {
    if (!entry.equivalence) continue;
    if (!IMPLEMENTED.has(entry.equivalence)) {
      throw new Error(`style guide entry ${entry.id} has no equivalence implementation for ${entry.equivalence}`);
    }
    const pairs = EQUIVALENCE_PAIRS[entry.equivalence];
    if (!pairs || !pairs.length) {
      throw new Error(`style guide entry ${entry.id} equivalence ${entry.equivalence} has no pairs`);
    }
    rows.push({ entryId: entry.id, id: entry.equivalence, pairs });
  }
  return rows;
}

/** Auto-fix ids whose transform rewrites a fact. The test fails if one of these lacks an equivalence. */
export function factRewritingTransformIds() {
  return STYLE_GUIDE
    .filter((entry) => entry.equivalence && entry.enforcement?.transformId)
    .map((entry) => ({ id: entry.id, transformId: entry.enforcement.transformId, equivalence: entry.equivalence }));
}
