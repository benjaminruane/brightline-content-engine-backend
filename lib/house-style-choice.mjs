/**
 * B543, B555. House style is the account's spelling, thousands separator,
 * and the other choices in style_choices. An omitted choice uses the
 * new-account default. It does not use a personal pair.
 */
import { spellingDisplay } from "./qc/house-spelling.mjs";
import { renderDraftStyleSection, resolveStyleChoices } from "./style-guide/render.mjs";

export const BEN_HOUSE_STYLE = Object.freeze({ spelling: "US", thousands: "apostrophe" });
export const NEW_ACCOUNT_HOUSE_STYLE = Object.freeze({ spelling: "US", thousands: "comma" });

export function isBenHouseStyle(choice) {
  if (choice == null) return false;
  const resolved = resolveStyleChoices(choice);
  return resolved.spelling === "US" && resolved.thousands === "apostrophe";
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
  if (thousands !== "comma" && thousands !== "apostrophe" && thousands !== "space") {
    throw new Error("house style thousands separator is missing");
  }
  return { spelling, thousands };
}

/** Null columns use the new-account house style for every account. */
export function houseStyleForRow(row, _isAdmin) {
  const stored = normaliseHouseStyle({
    spelling: row?.spelling ?? null,
    thousands: row?.thousands ?? null,
  });
  if (stored) return stored;
  return NEW_ACCOUNT_HOUSE_STYLE;
}

export function houseStyleFromBody(body) {
  if (!body || typeof body !== "object" || !Object.prototype.hasOwnProperty.call(body, "houseStyle")) {
    return null;
  }
  return normaliseHouseStyle(body.houseStyle);
}

/** The drafting style section, rendered from the style guide and these choices. */
export function styleGuideText(choice) {
  return renderDraftStyleSection(resolveStyleChoices(choice || {}));
}

/** One sentence for a note or a feedback prompt. */
export function houseStyleNoteLine(choice) {
  if (choice == null || isBenHouseStyle(choice)) return "";
  const picked = resolveStyleChoices(choice);
  const spelling = spellingDisplay(picked.spelling);
  const thousands = picked.thousands === "apostrophe"
    ? "Use an apostrophe as the thousands separator, as in 5'500."
    : picked.thousands === "space"
      ? "Use a space as the thousands separator, as in 5 500."
      : "Use a comma as the thousands separator, as in 5,500.";
  return `${thousands} Use ${spelling} spelling.`;
}
