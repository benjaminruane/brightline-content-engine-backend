/**
 * B543. Spelling and the thousands separator belong to the account.
 * Omitted, or Ben's current pair, returns the style text that already shipped.
 */
import { DEFAULT_STYLE_GUIDE } from "./rulebook/styleGuide.js";

export const BEN_HOUSE_STYLE = Object.freeze({ spelling: "US", thousands: "apostrophe" });
export const NEW_ACCOUNT_HOUSE_STYLE = Object.freeze({ spelling: "US", thousands: "comma" });

export function isBenHouseStyle(choice) {
  if (choice == null) return true;
  return choice.spelling === "US" && choice.thousands === "apostrophe";
}

/** A stored pair, or null when the account has not chosen. A half pair is refused. */
export function normaliseHouseStyle(raw) {
  if (raw == null) return null;
  const spelling = raw.spelling;
  const thousands = raw.thousands;
  if (spelling == null && thousands == null) return null;
  if (spelling !== "US" && spelling !== "UK") {
    throw new Error("house style spelling is missing");
  }
  if (thousands !== "comma" && thousands !== "apostrophe") {
    throw new Error("house style thousands separator is missing");
  }
  return { spelling, thousands };
}

/** Null columns: an admin keeps the current house style. Any other account uses the new-account default. */
export function houseStyleForRow(row, isAdmin) {
  const stored = normaliseHouseStyle({
    spelling: row?.spelling ?? null,
    thousands: row?.thousands ?? null,
  });
  if (stored) return stored;
  return isAdmin ? BEN_HOUSE_STYLE : NEW_ACCOUNT_HOUSE_STYLE;
}

export function houseStyleFromBody(body) {
  if (!body || typeof body !== "object" || !Object.prototype.hasOwnProperty.call(body, "houseStyle")) {
    return null;
  }
  return normaliseHouseStyle(body.houseStyle);
}

/** The drafting style block. Ben's pair is the block that already shipped, unchanged. */
export function styleGuideText(choice) {
  const base = DEFAULT_STYLE_GUIDE.trim();
  if (isBenHouseStyle(choice)) return base;
  const picked = normaliseHouseStyle(choice);
  let text = base;
  if (picked.thousands === "comma") {
    const marker = text.match(/Use the apostrophe \((.)\) as the thousands separator:/);
    if (!marker) throw new Error("house style: the thousands line is missing");
    const mark = marker[1];
    text = text.replace(
      `Use the apostrophe (${mark}) as the thousands separator:`,
      "Use a comma as the thousands separator:"
    );
    text = text.replace("Do not use commas as thousands separators.", "Do not use an apostrophe as a thousands separator.");
    text = text.replace(new RegExp(`(\\d)${mark}(\\d)`, "g"), "$1,$2");
  }
  if (picked.spelling === "UK") {
    const from = "Write in US English throughout.";
    if (!text.includes(from)) throw new Error("house style: the spelling line is missing");
    text = text.replace(from, "Write in UK English throughout.");
    text = text.replace(
      "Follow Merriam-Webster as the authority for spelling,",
      "Follow Oxford spelling for UK English,"
    );
    text = text.replace(
      "- Examples: 'analyze' not 'analyse', 'color' not 'colour',\n  'program' not 'programme', 'center' not 'centre'.",
      "- Examples: 'analyse' not 'analyze', 'colour' not 'color',\n  'programme' not 'program', 'centre' not 'center'."
    );
  }
  return text;
}

/** One sentence for a note or a feedback prompt. Empty for the style that already shipped. */
export function houseStyleNoteLine(choice) {
  if (isBenHouseStyle(choice)) return "";
  const picked = normaliseHouseStyle(choice);
  const spelling = picked.spelling === "UK" ? "UK English" : "US English";
  const thousands = picked.thousands === "comma"
    ? "Use a comma as the thousands separator, as in 5,500."
    : "Use an apostrophe as the thousands separator, as in 5'500.";
  return `${thousands} Use ${spelling} spelling.`;
}
