/**
 * B540, B555. A draft is brought into the account's house style
 * before a review sees it. The transforms are the style guide's auto-fixes.
 */
import { applyGuideAutoFix } from "../style-guide/auto-fix.mjs";

export function applyDraftHouseStyle(text, options = {}) {
  if (typeof text !== "string") return text;
  return applyGuideAutoFix(text, options).text;
}

export function draftHouseStyleReport(text, options = {}) {
  if (typeof text !== "string") return { text, fired: [] };
  return applyGuideAutoFix(text, options);
}
