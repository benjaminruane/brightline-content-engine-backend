/**
 * B354 Part 2. The comment must account for every claim in the sentence.
 *
 * Hard rule: this module never asserts confirmation the evidence layer
 * did not establish. The only reason a clause is added is that the item
 * is present word for word in a passage already matched as confirming
 * for this card.
 *
 * No new extraction logic. Anchors come from extractVerifiableAnchors.
 */
import { extractVerifiableAnchors } from "./claim-spans.mjs";
import { normalizePassageForComparison } from "./pipeline-v4/stage2-match-sources.mjs";

const INVENTORY_CAP = 8;
const APPEND_CAP = 2;

function asText(value) {
  return typeof value === "string" ? value : "";
}

function fold(text) {
  return normalizePassageForComparison(text).toLowerCase();
}

/**
 * Anchor texts as a deduped array of strings, order preserved, capped at 8.
 */
export function buildClaimInventory(statementText) {
  const spans = extractVerifiableAnchors(statementText);
  const out = [];
  const seen = new Set();
  for (const span of Array.isArray(spans) ? spans : []) {
    const t = asText(span?.text).trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= INVENTORY_CAP) break;
  }
  return out;
}

/**
 * Inventory items not present in the commentary. Normalised,
 * case-insensitive substring.
 */
export function unaddressedInventory(commentary, inventory) {
  const hay = fold(commentary);
  const items = Array.isArray(inventory) ? inventory : [];
  if (!hay) return items.filter((item) => asText(item).trim());
  const out = [];
  for (const item of items) {
    const needle = fold(item);
    if (!needle) continue;
    if (!hay.includes(needle)) out.push(item);
  }
  return out;
}

function itemInPassages(item, passages) {
  const needle = fold(item);
  if (!needle) return false;
  for (const passage of Array.isArray(passages) ? passages : []) {
    if (fold(passage).includes(needle)) return true;
  }
  return false;
}

/**
 * For each unaddressed item that appears verbatim in a confirming
 * passage, append "The source also states <item>." At most two clauses.
 * Items not found in any confirming passage get nothing appended.
 */
export function appendSourceStatedClauses({ commentary, inventory, confirmingPassages } = {}) {
  const original = asText(commentary);
  const items = Array.isArray(inventory) ? inventory : [];
  if (!original.trim()) {
    return {
      commentary: original,
      appended: [],
      unaddressed: items.filter((item) => asText(item).trim()),
    };
  }
  const missing = unaddressedInventory(original, items);
  const appended = [];
  const unaddressed = [];
  let next = original;
  for (const item of missing) {
    const inConfirming = itemInPassages(item, confirmingPassages);
    if (inConfirming && appended.length < APPEND_CAP) {
      const clause = `The source also states ${item}.`;
      next = `${next.replace(/\s+$/, "")} ${clause}`;
      appended.push(item);
      continue;
    }
    unaddressed.push(item);
  }
  return { commentary: next, appended, unaddressed };
}
